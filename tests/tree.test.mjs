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
const fakeClient = ({ sessions = {}, getThrows = [], getStatus = {}, history = {}, messagesFail = null, messagesNoResponse = false } = {}) => {
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
        const reply = { data: all.slice(start, end), response: { status: 200, headers } };
        if (messagesNoResponse) delete reply.response;
        return reply;
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

test("readSession retries one transient failure but not a missing session", async () => {
  const reply = (status) => status === 200
    ? { data: { id: "ses_x" }, response: { status } }
    : { error: { name: "UnknownError", data: { message: "boom" } }, response: { status } };
  let calls = 0;
  const once = T.createSessionTree({
    client: { session: { get: async () => reply([503, 200][calls++]) } }, directory: "/work",
  });
  assert.deepEqual(await once.readSession("ses_x"), { parentID: null });
  assert.equal(calls, 2);
  calls = 0;
  const missing = T.createSessionTree({
    client: { session: { get: async () => reply([404, 200][calls++]) } }, directory: "/work",
  });
  const missingError = await missing.readSession("ses_x").catch((e) => e);
  assert.equal(missingError.missing, true);
  assert.equal(calls, 1);
  calls = 0;
  const twice = T.createSessionTree({
    client: { session: { get: async () => reply([503, 503][calls++]) } }, directory: "/work",
  });
  const failed = await twice.readSession("ses_x").catch((e) => e);
  assert.ok(failed instanceof T.TreeLookupError);
  assert.equal(calls, 2);
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

const teamFixture = ({ sessions = SESSIONS, history: hist = {}, messagesFail = null, messagesNoResponse = false, limits, now } = {}) => {
  const fake = fakeClient({ sessions, history: hist, messagesFail, messagesNoResponse });
  const tree = T.createSessionTree({ client: fake.client, directory: "/work" });
  const team = T.createTeamIndex({ client: fake.client, directory: "/work", tree,
    ...(limits ? { limits } : {}), ...(now ? { now } : {}) });
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
  team.observe(partEvent(taskPart(9, "ses_root", "ses_mate", { input: { task_id: "ses_mate" } })));
  team.observe(partEvent(taskPart(4, "ses_root", "ses_mate", { input: { background: true } })));
  team.observe(partEvent(taskPart(12, "ses_root", "ses_mate", { input: { task_id: "ses_mate" } })));
  assert.equal(await team.classifyChild("ses_mate", "ses_root"), true);
  // Same message: the lower part id is the older part.
  team.observe(partEvent(taskPart(20, "ses_root", "ses_two", { part: 1 })));
  team.observe(partEvent(taskPart(20, "ses_root", "ses_two", { part: 0, input: { background: true } })));
  assert.equal(await team.classifyChild("ses_two", "ses_root"), true);
  assert.equal(messageCalls().length, 0);
});

test("resume parts do not classify a child from the index or history", async () => {
  const hist = history("ses_root", 120, {
    3: [taskPart(3, "ses_root", "ses_mate", { input: { background: true } })],
    110: [taskPart(110, "ses_root", "ses_mate", { input: { task_id: "ses_mate" } })],
  });
  const { team, messageCalls } = teamFixture({ history: { ses_root: hist } });
  team.observe(partEvent(taskPart(110, "ses_root", "ses_mate", { input: { task_id: "ses_mate" } })));
  assert.equal(await team.inTeam("ses_mate"), true);
  assert.equal(messageCalls().length, 3, "the ignored resume event falls through to complete history");
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

test("a found answer is final; a child no task call created is briefly cached as missing", async () => {
  const hist = history("ses_root", 5, {
    2: [taskPart(2, "ses_root", "ses_mate", { input: { background: true } })],
    4: [taskPart(4, "ses_root", "ses_fg")],
  });
  let time = 0;
  const { team, messageCalls } = teamFixture({ history: { ses_root: hist }, now: () => time });
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
  assert.equal(messageCalls().length, 3, "the second missing result is served from the short negative cache");
  time += T.TEAM_LIMITS.missingTtlMs;
  const expired = await team.classifyChild("ses_wf", "ses_root").catch((e) => e);
  assert.ok(expired instanceof T.TreeLookupError);
  assert.equal(expired.missing, true);
  assert.equal(messageCalls().length, 4, "after the TTL, missing history is read again");
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

test("a page without headers is final only when it is short", async () => {
  const short = teamFixture({
    history: { ses_root: history("ses_root", 1, { 1: [taskPart(1, "ses_root", "ses_mate", { input: { background: true } })] }) },
    messagesNoResponse: true,
  });
  assert.equal(await short.team.classifyChild("ses_mate", "ses_root"), true);
  const full = teamFixture({
    history: { ses_root: history("ses_root", 50, { 50: [taskPart(50, "ses_root", "ses_mate", { input: { background: true } })] }) },
    messagesNoResponse: true,
  });
  const error = await full.team.classifyChild("ses_mate", "ses_root").catch((e) => e);
  assert.ok(error instanceof T.TreeLookupError);
  assert.match(error.message, /cannot page the messages of session ses_root: the reply carried no headers/);
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
// ---- G1, G2 and G4 (spec section 4, rule table).

// Adds a second root with a child of its own.
const TREE_SESSIONS = { ...SESSIONS, ses_other: null, ses_otherkid: "ses_other" };
const MATE_EVENT = partEvent(taskPart(2, "ses_root", "ses_mate", { input: { background: true } }));

const rules = ({ sessions = SESSIONS, history: hist = { ses_root: [] }, events = [], unattended = false, getThrows = [] } = {}) => {
  const fake = fakeClient({ sessions, history: hist, getThrows });
  const tree = T.createSessionTree({ client: fake.client, directory: "/work" });
  const team = T.createTeamIndex({ client: fake.client, directory: "/work", tree });
  for (const event of events) team.observe(event);
  const check = (sessionID, tool, args = {}) => T.treeRuleRefusal({ tool, sessionID, args, unattended, tree, team });
  return { check, calls: fake.calls };
};
const spawn = (extra = {}) => ({ description: "d", prompt: "p", subagent_type: "build", ...extra });
const resume = (taskID, extra = {}) => spawn({ task_id: taskID, ...extra });

test("G1: a session may resume its own child, and the child is re-read every time", async () => {
  const { check, calls } = rules();
  assert.equal(await check("ses_root", "task", resume("ses_fg")), null);
  assert.equal(await check("ses_root", "task", resume("ses_fg")), null);
  assert.equal(calls.filter((c) => c.op === "get" && c.id === "ses_fg").length, 2);
  assert.equal(await check("ses_mate", "task", resume("ses_helper")), null, "a teammate resumes its own helper");
});

test("G1: sibling, lead, other-root, grandchild and own ids are refused", async () => {
  const { check } = rules({ sessions: TREE_SESSIONS });
  assert.match(await check("ses_mate", "task", resume("ses_fg")),
    /^\[opencode-guard\] denied \(G1, resume only your own child\): task_id ses_fg is not a child of this session \(its parent is ses_root\)/);
  assert.match(await check("ses_mate", "task", resume("ses_root")),
    /task_id ses_root is not a child of this session \(it is a root session\)/);
  assert.match(await check("ses_root", "task", resume("ses_otherkid")), /\(its parent is ses_other\)/);
  assert.match(await check("ses_root", "task", resume("ses_other")), /\(it is a root session\)/);
  assert.match(await check("ses_root", "task", resume("ses_root")), /G1, resume only your own child/,
    "a session cannot resume itself");
  assert.match(await check("ses_root", "task", resume("ses_helper")), /\(its parent is ses_mate\)/,
    "a grandchild is not a child");
});

test("G1: a nonexistent id, a failed lookup and a malformed id are refused; an empty id is no resume", async () => {
  const { check, calls } = rules({ getThrows: ["ses_flaky"] });
  assert.match(await check("ses_root", "task", resume("ses_nope")), /task_id ses_nope names no existing session/);
  const flaky = await check("ses_root", "task", resume("ses_flaky"));
  assert.match(flaky, /^\[opencode-guard\] denied \(G1, resume only your own child\): the guard could not check/);
  assert.match(flaky, /Retry once/);
  assert.match(await check("ses_root", "task", resume(42)), /task_id must be a session id string, not number/);
  const before = calls.length;
  assert.equal(await check("ses_root", "task", resume("")), null, "opencode treats an empty task_id as a new task");
  assert.equal(calls.length, before, "and the guard looks nothing up for it");
});

test("G1: a child deleted after an allowed resume is refused on the next one", async () => {
  const sessions = { ...SESSIONS };
  const { check } = rules({ sessions });
  assert.equal(await check("ses_root", "task", resume("ses_fg")), null);
  delete sessions.ses_fg;
  assert.match(await check("ses_root", "task", resume("ses_fg")), /task_id ses_fg names no existing session/,
    "a cached parent link must not vouch for a session that is gone: opencode would start a fresh child");
});

test("G2: background tasks only from an attended root, and never with task_id", async () => {
  const attended = rules();
  assert.equal(await attended.check("ses_root", "task", spawn({ background: true })), null);
  assert.match(await attended.check("ses_mate", "task", spawn({ background: true })),
    /^\[opencode-guard\] denied \(G2, background teammates only from an attended root\): `background: true` is allowed only from a root session; this session is a subagent of ses_root/);
  assert.match(await attended.check("ses_helper", "task", spawn({ background: true })), /subagent of ses_mate/);
  assert.match(await attended.check("ses_root", "task", resume("ses_fg", { background: true })),
    /cannot be combined with `task_id`/);
  assert.equal(await attended.check("ses_mate", "task", spawn()), null, "a teammate may still dispatch foreground helpers");
  const headless = rules({ unattended: true });
  assert.match(await headless.check("ses_root", "task", spawn({ background: true })), /allowed only in an attended session/);
  assert.equal(headless.calls.length, 0, "decided without a lookup");
  const flaky = rules({ getThrows: ["ses_root"] });
  assert.match(await flaky.check("ses_root", "task", spawn({ background: true })), /G2, background.*Retry once/s);
});

const CLOSED = [
  ["workflow_run", { name: "review-panel" }],
  ["peer_send", { to: "x", text: "hi" }],
  ["peer_list", {}],
  ["schedule_prompt", { in_minutes: 5, text: "x" }],
  ["schedule_cancel", { id: "s1" }],
  ["bg_watch", { job: "j", pattern: "x" }],
  ["bg_unwatch", { watch: "w" }],
  ["bg_list", { all: true }],
  ["bg_output", { id: "j", all: true }],
  ["bg_kill", { id: "j", all: true }],
];
const OPEN = [
  // A teammate's only way to reach its lead (opencode-peers confines it to its lead).
  ["agent_send", { to: "lead", message: "found it" }],
  ["agent_list", {}],
  ["bg_list", {}],
  ["bg_output", { id: "j" }],
  ["bg_kill", { id: "j", all: false }],
  ["bg_run", { command: "x" }],
  ["read", { filePath: "/work/a" }],
  ["bash", { command: "ls" }],
  ["task", spawn()],
];

test("G4: a teammate and its helpers cannot use the tools closed to teams", async () => {
  const { check } = rules({ events: [MATE_EVENT] });
  for (const sessionID of ["ses_mate", "ses_helper"]) {
    for (const [tool, args] of CLOSED) {
      const refusal = await check(sessionID, tool, args);
      assert.match(refusal ?? "", /^\[opencode-guard\] denied \(G4, tools closed to agent teams\): `/, `${sessionID} ${tool}`);
      assert.match(refusal, /agent_send/);
    }
    for (const [tool, args] of OPEN) assert.equal(await check(sessionID, tool, args), null, `${sessionID} ${tool}`);
  }
});

test("G4: the lead, ordinary children and other roots keep every tool", async () => {
  const { check, calls } = rules({
    sessions: TREE_SESSIONS,
    events: [MATE_EVENT, partEvent(taskPart(3, "ses_root", "ses_fg"))],
  });
  for (const sessionID of ["ses_root", "ses_fg", "ses_fghelper", "ses_other"]) {
    for (const [tool, args] of CLOSED) assert.equal(await check(sessionID, tool, args), null, `${sessionID} ${tool}`);
  }
  assert.equal(calls.filter((c) => c.op === "messages").length, 0);
});

test("G4: any all other than false, null or absent counts as all: true", async () => {
  const { check } = rules({ events: [MATE_EVENT] });
  for (const all of [true, "true", 1, "yes"]) {
    assert.match(await check("ses_mate", "bg_list", { all }) ?? "", /`bg_list with all: true`/, String(all));
  }
  for (const all of [false, undefined, null]) assert.equal(await check("ses_mate", "bg_list", { all }), null, String(all));
});

test("G4: an unclassifiable caller is refused; a workflow child is told retrying will not help", async () => {
  const flaky = rules({ getThrows: ["ses_mate"] });
  assert.match(await flaky.check("ses_mate", "schedule_prompt", { in_minutes: 1, text: "x" }), /G4, tools closed.*Retry once/s);
  const workflow = rules({ history: { ses_root: history("ses_root", 2) } });
  const refusal = await workflow.check("ses_wf", "schedule_prompt", { in_minutes: 1, text: "x" });
  assert.match(refusal, /^\[opencode-guard\] denied \(G4, tools closed to agent teams\): the guard could not check this rule/);
  assert.match(refusal, /no task call in session ses_root created session ses_wf/);
  assert.match(refusal, /retrying will not change the answer/);
  assert.equal(await workflow.check("ses_wf", "read", { filePath: "/work/a" }), null,
    "only the closed tools need a classification");
});
