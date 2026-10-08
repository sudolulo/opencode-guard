// lib/tree.js against a stand-in for the legacy SDK client opencode hands a plugin.
// The fake answers exactly the two calls lib/tree.js makes and records each one.
import { test } from "node:test";
import assert from "node:assert/strict";

const T = await import(new URL("../lib/tree.js", import.meta.url).href);

// sessions: id -> parentID (null for a root). history: root id -> messages, oldest
// first, in the server's { info, parts } shape; pages are cut the way the server
// cuts them (newest `limit` first, each page oldest-first, X-Next-Cursor naming the
// oldest message of a page when older ones remain). The objects are read live, so
// a test may mutate them between calls.
const fakeClient = ({ sessions = {}, getThrows = [], getStatus = {}, history = {}, messagesFail = null } = {}) => {
  const calls = [];
  const notFound = (id) => ({
    error: { name: "NotFoundError", data: { message: `Session not found: ${id}` } },
    response: { status: 404 },
  });
  const client = {
    session: {
      get: async (options) => {
        const id = options?.path?.id;
        calls.push({ op: "get", id, query: options?.query });
        if (getThrows.includes(id)) throw new Error("server away");
        if (getStatus[id]) {
          return { error: { name: "UnknownError", data: { message: "boom" } }, response: { status: getStatus[id] } };
        }
        if (!Object.hasOwn(sessions, id)) return notFound(id);
        return { data: { id, ...(sessions[id] ? { parentID: sessions[id] } : {}) }, response: { status: 200 } };
      },
      messages: async (options) => {
        const id = options?.path?.id;
        const query = options?.query ?? {};
        calls.push({ op: "messages", id, query });
        if (messagesFail === "throw") throw new Error("server away");
        if (messagesFail === "error") return { error: { name: "UnknownError" }, response: { status: 500 } };
        if (messagesFail === "shape") return { data: { not: "a list" }, response: { status: 200, headers: new Headers() } };
        if (messagesFail === "stuck") {
          return { data: [], response: { status: 200, headers: new Headers({ "X-Next-Cursor": "same" }) } };
        }
        const all = history[id];
        if (!all) return notFound(id);
        const end = query.before === undefined ? all.length : all.findIndex((m) => m.info.id === query.before);
        const start = Math.max(0, end - query.limit);
        const headers = new Headers();
        if (start > 0) headers.set("X-Next-Cursor", all[start].info.id);
        return { data: all.slice(start, end), response: { status: 200, headers } };
      },
    },
  };
  return { client, calls };
};

test("readSession reads one session through client.session.get with this instance's directory", async () => {
  const { client, calls } = fakeClient({ sessions: { ses_root: null, ses_kid: "ses_root" } });
  const tree = T.createSessionTree({ client, directory: "/work" });
  assert.deepEqual(await tree.readSession("ses_kid"), { parentID: "ses_root" });
  assert.deepEqual(await tree.readSession("ses_root"), { parentID: null });
  assert.deepEqual(calls, [
    { op: "get", id: "ses_kid", query: { directory: "/work" } },
    { op: "get", id: "ses_root", query: { directory: "/work" } },
  ]);
});

test("readSession tells a session that does not exist from a lookup that failed", async () => {
  const { client } = fakeClient({ sessions: { ses_root: null }, getThrows: ["ses_away"], getStatus: { ses_500: 500 } });
  const tree = T.createSessionTree({ client, directory: "/work" });
  const missing = await tree.readSession("ses_gone").catch((e) => e);
  assert.ok(missing instanceof T.TreeLookupError);
  assert.equal(missing.missing, true);
  assert.match(missing.message, /session ses_gone does not exist/);
  for (const id of ["ses_away", "ses_500"]) {
    const failed = await tree.readSession(id).catch((e) => e);
    assert.ok(failed instanceof T.TreeLookupError, id);
    assert.equal(failed.missing, false, `${id} is a failed lookup, not proof of absence`);
  }
  const empty = await tree.readSession("").catch((e) => e);
  assert.ok(empty instanceof T.TreeLookupError, "an empty id is not looked up");
  const bare = T.createSessionTree({
    client: { session: { get: async () => ({ response: { status: 200 } }) } },
    directory: "/work",
  });
  const noData = await bare.readSession("ses_x").catch((e) => e);
  assert.ok(noData instanceof T.TreeLookupError, "a reply without a session record is a failure, never a root");
});

test("ancestry walks parent links to the root and remembers them", async () => {
  const { client, calls } = fakeClient({ sessions: { ses_root: null, ses_mid: "ses_root", ses_leaf: "ses_mid" } });
  const tree = T.createSessionTree({ client, directory: "/work" });
  assert.deepEqual(await tree.ancestry("ses_leaf"), ["ses_leaf", "ses_mid", "ses_root"]);
  assert.deepEqual(await tree.ancestry("ses_root"), ["ses_root"]);
  assert.equal(calls.length, 3, "each session is read once: parentID never changes");
  assert.equal(await tree.parentOf("ses_mid"), "ses_root");
  assert.equal(calls.length, 3);
});

test("an ancestry that loops, runs too deep or loses a parent is a failed lookup", async () => {
  const looping = await T.createSessionTree({
    client: fakeClient({ sessions: { ses_a: "ses_b", ses_b: "ses_a" } }).client, directory: "/work",
  }).ancestry("ses_a").catch((e) => e);
  assert.ok(looping instanceof T.TreeLookupError);
  assert.match(looping.message, /loops at ses_a/);
  const chain = { ses_0: null };
  for (let i = 1; i <= 20; i += 1) chain[`ses_${i}`] = `ses_${i - 1}`;
  const deep = await T.createSessionTree({ client: fakeClient({ sessions: chain }).client, directory: "/work" })
    .ancestry("ses_20").catch((e) => e);
  assert.ok(deep instanceof T.TreeLookupError);
  assert.match(deep.message, /deeper than 16 sessions/);
  const orphan = await T.createSessionTree({
    client: fakeClient({ sessions: { ses_orphan: "ses_vanished" } }).client, directory: "/work",
  }).ancestry("ses_orphan").catch((e) => e);
  assert.ok(orphan instanceof T.TreeLookupError, "a parent that cannot be read breaks the chain");
});

test("the parent cache is bounded and evicts its oldest entry first", async () => {
  const { client, calls } = fakeClient({ sessions: { ses_a: null, ses_b: null, ses_c: null } });
  const tree = T.createSessionTree({ client, directory: "/work", limits: { ...T.TREE_LIMITS, parentCache: 2 } });
  await tree.parentOf("ses_a");
  await tree.parentOf("ses_b");
  await tree.parentOf("ses_c");
  assert.equal(calls.length, 3);
  await tree.parentOf("ses_c");
  await tree.parentOf("ses_b");
  assert.equal(calls.length, 3, "the two newest are still cached");
  await tree.parentOf("ses_a");
  assert.equal(calls.length, 4, "the oldest was evicted and is read again");
});

test("a lookup denial names the rule and says whether retrying can help", () => {
  const transient = T.treeLookupDenial("G3", new T.TreeLookupError("reading session ses_x failed: server away"));
  assert.match(transient, /^\[opencode-guard\] denied \(G3, inherited permission mode\): /);
  assert.match(transient, /server away/);
  assert.match(transient, /Retry once/);
  const final = T.treeLookupDenial("G4", new T.TreeLookupError("no task call", { missing: true }));
  assert.match(final, /^\[opencode-guard\] denied \(G4, tools closed to agent teams\): /);
  assert.match(final, /retrying will not change the answer/);
  assert.equal(T.treeDenial("G1", "x"), "[opencode-guard] denied (G1, resume only your own child): x");
  assert.equal(T.treeDenial("G2", "y"), "[opencode-guard] denied (G2, background teammates only from an attended root): y");
});
// ---- Teammate classification (spec section 4, "Teammate classification").

const pad = (n) => String(n).padStart(4, "0");
const msgId = (n) => `msg_${pad(n)}`;
// A task tool part in message n of `root` that names `child` in state.metadata.sessionId.
const taskPart = (n, root, child, { input = {}, metadata = {}, part = 0 } = {}) => ({
  id: `prt_${pad(n)}_${part}`, sessionID: root, messageID: msgId(n), type: "tool", tool: "task", callID: `call_${n}_${part}`,
  state: {
    status: "completed",
    input: { description: "d", prompt: "p", subagent_type: "build", ...input },
    metadata: { sessionId: child, ...metadata },
    output: "", title: "d", time: { start: n, end: n },
  },
});
const message = (n, root, parts) => ({ info: { id: msgId(n), sessionID: root, role: "assistant" }, parts });
// `count` messages of `root`, oldest first; `at` puts given parts into message numbers.
const history = (root, count, at = {}) => Array.from({ length: count }, (_, i) => message(i + 1, root,
  at[i + 1] ?? [{ id: `prt_${pad(i + 1)}_0`, sessionID: root, messageID: msgId(i + 1), type: "text", text: "work" }]));
const partEvent = (part) => ({ type: "message.part.updated", properties: { sessionID: part.sessionID, part, time: 1 } });

// ses_mate: a teammate of ses_root; ses_helper: its foreground helper. ses_fg: a
// foreground child of ses_root; ses_fghelper: its helper. ses_two: another child.
// ses_wf: a workflow child (SDK-created with parentID = ses_root, no task part).
const SESSIONS = {
  ses_root: null, ses_mate: "ses_root", ses_helper: "ses_mate", ses_fg: "ses_root",
  ses_fghelper: "ses_fg", ses_two: "ses_root", ses_wf: "ses_root",
};

const teamFixture = ({ sessions = SESSIONS, history: hist = {}, messagesFail = null, limits } = {}) => {
  const fake = fakeClient({ sessions, history: hist, messagesFail });
  const tree = T.createSessionTree({ client: fake.client, directory: "/work" });
  const team = T.createTeamIndex({ client: fake.client, directory: "/work", tree, ...(limits ? { limits } : {}) });
  const messageCalls = () => fake.calls.filter((c) => c.op === "messages");
  return { team, tree, calls: fake.calls, messageCalls };
};

test("an indexed background spawn makes its child a teammate without reading history", async () => {
  const { team, messageCalls } = teamFixture({ history: { ses_root: [] } });
  team.observe(partEvent(taskPart(3, "ses_root", "ses_mate", { input: { background: true } })));
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true);
  assert.equal(messageCalls().length, 0);
});

test("a task part that has not created a child is never indexed", async () => {
  // Spike S4: the part is published as running, with its input, before any
  // tool.execute.before hook runs; only a created child gets metadata.sessionId.
  const { team, messageCalls } = teamFixture({
    history: { ses_root: history("ses_root", 4, { 2: [taskPart(2, "ses_root", "ses_fg")] }) },
  });
  const pending = taskPart(3, "ses_root", "ses_fg", { input: { background: true } });
  pending.state = { status: "running", input: pending.state.input, time: { start: 3 } };
  team.observe(partEvent(pending));
  team.observe(partEvent({ id: "prt_x", sessionID: "ses_root", messageID: msgId(9), type: "text", text: "x" }));
  assert.equal(await team.classifyChild("ses_fg", "ses_root"), false,
    "decided by the persisted creating part, a foreground call");
  assert.equal(messageCalls().length, 1, "the index held nothing for ses_fg, so history was read");
});

test("a promoted foreground task is not a teammate, from the index or from history", async () => {
  // F19 and spike S6: promotion sets metadata.background and leaves input.background absent.
  const promoted = taskPart(2, "ses_root", "ses_fg", { metadata: { background: true } });
  const viaIndex = teamFixture({ history: { ses_root: [] } });
  viaIndex.team.observe(partEvent(promoted));
  assert.equal(await viaIndex.team.classifyChild("ses_fg", "ses_root"), false);
  const viaHistory = teamFixture({ history: { ses_root: history("ses_root", 3, { 2: [promoted] }) } });
  assert.equal(await viaHistory.team.classifyChild("ses_fg", "ses_root"), false);
});

test("the oldest part naming a child decides, whatever order its events arrive in", async () => {
  const { team, messageCalls } = teamFixture({ history: { ses_root: [] } });
  // A later foreground call naming the same child (a resume) is seen first.
  team.observe(partEvent(taskPart(9, "ses_root", "ses_mate")));
  team.observe(partEvent(taskPart(4, "ses_root", "ses_mate", { input: { background: true } })));
  team.observe(partEvent(taskPart(12, "ses_root", "ses_mate")));
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true);
  // Same message: the lower part id is the older part.
  team.observe(partEvent(taskPart(20, "ses_root", "ses_two", { part: 1 })));
  team.observe(partEvent(taskPart(20, "ses_root", "ses_two", { part: 0, input: { background: true } })));
  assert.equal(await team.classifyChild("ses_two", "ses_root"), true);
  assert.equal(messageCalls().length, 0);
});

test("on an index miss the root's history is paged back to its first message", async () => {
  // 120 messages: the pages of 50 are 71-120, 21-70 and 1-20. The creating background
  // call is in message 3; a later foreground resume of the same child is in message 110.
  const hist = history("ses_root", 120, {
    3: [taskPart(3, "ses_root", "ses_mate", { input: { background: true } })],
    110: [taskPart(110, "ses_root", "ses_mate")],
  });
  const { team, messageCalls } = teamFixture({ history: { ses_root: hist } });
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true);
  assert.deepEqual(messageCalls().map((c) => c.query), [
    { directory: "/work", limit: 50 },
    { directory: "/work", limit: 50, before: msgId(71) },
    { directory: "/work", limit: 50, before: msgId(21) },
  ]);
  assert.ok(messageCalls().every((c) => c.id === "ses_root"));
});

test("a found answer is final; a child no task call created is not cached and fails every time", async () => {
  const hist = history("ses_root", 5, {
    2: [taskPart(2, "ses_root", "ses_mate", { input: { background: true } })],
    4: [taskPart(4, "ses_root", "ses_fg")],
  });
  const { team, messageCalls } = teamFixture({ history: { ses_root: hist } });
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true);
  assert.equal(await team.classifyChild("ses_fg", "ses_root"), false);
  assert.equal(messageCalls().length, 2);
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true);
  assert.equal(await team.classifyChild("ses_fg", "ses_root"), false);
  assert.equal(messageCalls().length, 2, "positive and negative answers are both final");
  for (let i = 0; i < 2; i += 1) {
    const error = await team.classifyChild("ses_wf", "ses_root").catch((e) => e);
    assert.ok(error instanceof T.TreeLookupError);
    assert.equal(error.missing, true);
    assert.match(error.message, /no task call in session ses_root created session ses_wf/);
  }
  assert.equal(messageCalls().length, 4, "not found is never cached");
});

test("a history read that fails is a failed lookup, never a classification", async () => {
  for (const messagesFail of ["throw", "error", "shape"]) {
    const { team } = teamFixture({ messagesFail });
    const error = await team.classifyChild("ses_mate", "ses_root").catch((e) => e);
    assert.ok(error instanceof T.TreeLookupError, messagesFail);
    assert.equal(error.missing, false, messagesFail);
  }
  const broken = taskPart(2, "ses_root", "ses_mate", { input: { background: true } });
  delete broken.id;
  delete broken.messageID;
  const { team } = teamFixture({ history: { ses_root: [{ info: {}, parts: [broken] }] } });
  const error = await team.classifyChild("ses_mate", "ses_root").catch((e) => e);
  assert.ok(error instanceof T.TreeLookupError, "a part that cannot be ordered cannot be the oldest");
  assert.match(error.message, /has no message or part id/);
});

test("paging that never ends is a failed lookup, not a hang", async () => {
  const stuck = teamFixture({ messagesFail: "stuck" });
  const repeated = await stuck.team.classifyChild("ses_mate", "ses_root").catch((e) => e);
  assert.ok(repeated instanceof T.TreeLookupError);
  assert.match(repeated.message, /repeated cursor same/);
  assert.equal(stuck.messageCalls().length, 2);
  const long = teamFixture({
    history: { ses_root: history("ses_root", 120, { 110: [taskPart(110, "ses_root", "ses_mate")] }) },
    limits: { ...T.TEAM_LIMITS, maxPages: 2 },
  });
  const capped = await long.team.classifyChild("ses_mate", "ses_root").catch((e) => e);
  assert.ok(capped instanceof T.TreeLookupError,
    "a match on a newer page is not known to be the oldest until the first page is read");
  assert.match(capped.message, /longer than 2 pages of 50 messages/);
});

test("in a team means a teammate or anything below one", async () => {
  const { team, messageCalls } = teamFixture({ history: { ses_root: [] } });
  team.observe(partEvent(taskPart(2, "ses_root", "ses_mate", { input: { background: true } })));
  team.observe(partEvent(taskPart(3, "ses_root", "ses_fg")));
  assert.equal(await team.inTeam("ses_root"), false);
  assert.equal(messageCalls().length, 0, "a root needs no classification");
  assert.equal(await team.inTeam("ses_mate"), true);
  assert.equal(await team.inTeam("ses_helper"), true, "a teammate's foreground helper is in the team");
  assert.equal(await team.inTeam("ses_fg"), false);
  assert.equal(await team.inTeam("ses_fghelper"), false);
});

test("a child of a root that no task call created cannot be classified", async () => {
  // agent-workflows creates workflow children through the SDK with parentID set to
  // the calling root; no task part in the root names them.
  const { team } = teamFixture({ history: { ses_root: history("ses_root", 3) } });
  const error = await team.inTeam("ses_wf").catch((e) => e);
  assert.ok(error instanceof T.TreeLookupError);
  assert.equal(error.missing, true);
});

test("the classification index is bounded and falls back to history after eviction", async () => {
  const hist = history("ses_root", 4, { 2: [taskPart(2, "ses_root", "ses_mate", { input: { background: true } })] });
  const { team, messageCalls } = teamFixture({
    history: { ses_root: hist }, limits: { ...T.TEAM_LIMITS, classificationCache: 2 },
  });
  team.observe(partEvent(taskPart(2, "ses_root", "ses_mate", { input: { background: true } })));
  team.observe(partEvent(taskPart(3, "ses_root", "ses_fg")));
  team.observe(partEvent(taskPart(4, "ses_root", "ses_two")));
  assert.equal(await team.classifyChild("ses_two", "ses_root"), false);
  assert.equal(messageCalls().length, 0);
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true, "evicted, then read back from history");
  assert.equal(messageCalls().length, 1);
});
