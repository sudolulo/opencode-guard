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
