// Session incarnation binding (docs/superpowers/specs/2026-10-13-session-incarnation-design.md,
// "Guard contract"). Every deferred effect binds { sessionID, incarnationID } when the
// work is created and drops itself when the authoritative root read no longer matches.
import test from "node:test";
import assert from "node:assert/strict";
import { createAuthorityBroker } from "../lib/authority.js";
import { createRootLifecycle } from "../lib/lifecycle.js";
import { createApprovalNotifier } from "../lib/notify.js";

const INCARNATION_HOST = { permissionAuthority: 2, backgroundSubagents: true, sessionIncarnation: 1 };
const OLD_HOST = { permissionAuthority: 2, backgroundSubagents: true };

const tree = {
  ancestry: async (sessionID) => ({ ses_root: ["ses_root"], ses_child: ["ses_child", "ses_root"] })[sessionID],
};

// A fake host whose root row can be recreated under the same ID (`recreate`) or
// removed (`remove`). `reads` lists every incarnation the broker was shown.
const host = (t, { capabilities = INCARNATION_HOST, mode = "auto", failReplies = 0 } = {}) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = { id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } };
  let root = { id: "ses_root", incarnationID: "inc_1" };
  const replies = [], promotions = [], errors = [], reads = [], debug = [];
  let failures = failReplies;
  const v2 = {
    experimental: {
      capabilities: { get: async () => ({ data: capabilities }) },
      session: { background: async (input) => { promotions.push(input); return { data: {} }; } },
    },
    permission: {
      list: async () => ({ data: [request] }),
      reply: async (input) => {
        replies.push(input);
        if (failures > 0) { failures -= 1; throw new Error("temporary escalation failure"); }
        return { data: true };
      },
    },
    v2: { session: { get: async () => {
      reads.push(root?.incarnationID ?? null);
      return root ? { data: { ...root } } : { error: { name: "NotFoundError" }, response: { status: 404 } };
    } } },
  };
  const lifecycle = createRootLifecycle();
  let currentMode = mode;
  const broker = createAuthorityBroker({
    v2, directory: "/work", tree, lifecycle, rootMode: () => currentMode,
    onError: (error) => errors.push(error.message),
    onDebug: (error) => debug.push(error.message),
  });
  t.after(() => broker.dispose());
  return {
    v2, broker, lifecycle, request, replies, promotions, errors, reads, debug,
    recreate: (incarnationID = "inc_2") => { root = { id: "ses_root", incarnationID }; },
    remove: () => { root = null; },
    setRoot: (value) => { root = value; },
    setMode: (value) => { currentMode = value; },
    tick: async (ms) => { t.mock.timers.tick(ms); await new Promise(setImmediate); },
  };
};

for (const change of ["recreate", "404"]) {
  test(`an escalation retry bound to an old incarnation is dropped after ${change}`, async (t) => {
    const h = host(t, { failReplies: 1 });
    await h.broker.observe(h.request);
    assert.equal(h.replies.length, 1, "first escalation attempt failed and was retained");
    if (change === "recreate") h.recreate(); else h.remove();
    await h.tick(100);
    await h.tick(100000);
    assert.equal(h.replies.length, 1, "no reply is sent for a stale incarnation");
    assert.deepEqual(h.promotions, []);
    if (change === "recreate") assert.ok(h.errors.some((message) => /stale/.test(message)), h.errors.join("\n"));
  });
}

test("an escalation retry keeps its creation-time incarnation and never adopts a newer one", async (t) => {
  const h = host(t, { failReplies: 1 });
  await h.broker.observe(h.request);
  h.recreate("inc_2");
  // A native event for the recreated root retries the record; it still compares
  // against inc_1, so it is dropped instead of rebinding to inc_2.
  h.broker.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  await h.tick(0);
  await h.tick(100);
  await h.tick(100000);
  h.broker.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  await h.tick(0);
  assert.equal(h.replies.length, 1, "no retry ever acts on the recreated resource");
  assert.ok(h.errors.some((message) => /bound to incarnation inc_1, the root is now inc_2/.test(message)), h.errors.join("\n"));
});

test("observe binds the root incarnation and returns the binding with the promotion", async (t) => {
  const h = host(t, { mode: "god" });
  const bound = await h.broker.observe(h.request);
  assert.deepEqual(bound, { sessionID: "ses_root", incarnationID: "inc_1", token: h.lifecycle.token("ses_root") });
  assert.equal(bound.token, h.lifecycle.token("ses_root"), "the wake carries the root's current admission");
  assert.equal(h.promotions.length, 1);
});

test("observe does not promote when the root incarnation changes before the promotion", async (t) => {
  const h = host(t, { mode: "god" });
  let reads = 0;
  const get = h.v2.v2.session.get;
  h.v2.v2.session.get = async (...args) => {
    if (++reads === 2) h.recreate();
    return get(...args);
  };
  assert.equal(await h.broker.observe(h.request), undefined);
  assert.deepEqual(h.promotions, []);
});

test("current drops a wake bound to an old incarnation without escalating", async (t) => {
  const h = host(t, { mode: "auto" });
  h.recreate();
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child", incarnationID: "inc_1" }), false);
  assert.deepEqual(h.replies, [], "a stale wake must not reply or escalate on the new resource");
  h.remove();
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child", incarnationID: "inc_2" }), false);
  assert.deepEqual(h.replies, []);
});

test("current refuses an unbound wake on a host with session incarnations", async (t) => {
  const h = host(t, { mode: "god" });
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child" }), false);
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child", incarnationID: "inc_1" }), true);
});

test("current escalation binds the wake's incarnation, not a fresh read", async (t) => {
  const h = host(t, { mode: "auto", failReplies: 1 });
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child", incarnationID: "inc_1" }), false);
  assert.equal(h.replies.length, 1);
  h.recreate();
  await h.tick(100);
  await h.tick(100000);
  assert.equal(h.replies.length, 1);
});

test("guard_decide refuses when the root incarnation changes during the call", async (t) => {
  const h = host(t, { mode: "god" });
  let reads = 0;
  const get = h.v2.v2.session.get;
  h.v2.v2.session.get = async (...args) => {
    if (++reads === 2) h.recreate();
    return get(...args);
  };
  await assert.rejects(h.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), /incarnation/);
  assert.deepEqual(h.replies, []);
});

test("guard_pending refuses when the root incarnation changes during the call", async (t) => {
  const h = host(t, { mode: "god" });
  let reads = 0;
  const get = h.v2.v2.session.get;
  h.v2.v2.session.get = async (...args) => {
    if (++reads === 2) h.recreate();
    return get(...args);
  };
  await assert.rejects(h.broker.pending({ sessionID: "ses_root" }), /incarnation/);
});

test("a root read without an incarnation fails closed when the host advertises the capability", async (t) => {
  const h = host(t, { mode: "god" });
  h.setRoot({ id: "ses_root" });
  await assert.rejects(h.broker.observe(h.request), /incarnation/);
  assert.deepEqual(h.promotions, []);
});

test("an advertised capability releases deleted roots and admits a same-ID recreate", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  const token = h.lifecycle.track("ses_root");
  h.lifecycle.deleted("ses_root");
  assert.equal(h.lifecycle.has("ses_root"), false, "no deleted pile on an incarnation host");
  h.recreate();
  // Old in-flight work keeps its closed token; new work on the recreated root proceeds.
  assert.equal(await h.broker.observe(h.request, token), undefined);
  assert.deepEqual(h.promotions, []);
  const bound = await h.broker.observe(h.request);
  assert.deepEqual(bound, { sessionID: "ses_root", incarnationID: "inc_2", token: h.lifecycle.token("ses_root") });
  assert.equal(h.promotions.length, 1);
});

test("resume on an incarnation host does not reopen a record removed by deletion", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  h.lifecycle.abort("ses_root");
  h.lifecycle.deleted("ses_root");
  h.recreate();
  assert.equal(await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "hello" }] }), false);
  assert.equal(h.lifecycle.has("ses_root"), false, "resume is a read and recreates no state");
  assert.equal(h.lifecycle.admit("ses_root"), true);
});

// Event identity (docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md section 5):
// session.aborted carries optional properties.incarnationID; session.deleted carries
// properties.info.incarnationID.
const aborted = (sessionID, incarnationID) => ({ type: "session.aborted", properties: { sessionID, ...(incarnationID ? { incarnationID } : {}) } });
const deleted = (sessionID, incarnationID) => ({ type: "session.deleted", properties: { info: { id: sessionID, ...(incarnationID ? { incarnationID } : {}) } } });

for (const [name, event] of [["aborted", aborted], ["deleted", deleted]]) {
  test(`a delayed inc1 session.${name} leaves the inc2 root's escalation in place`, async (t) => {
    const h = host(t, { failReplies: 1 });
    h.recreate("inc_2");
    await h.broker.observe(h.request);
    assert.equal(h.replies.length, 1, "first escalation attempt failed and was retained");
    h.broker.onEvent(event("ses_root", "inc_1"));
    await h.tick(100);
    assert.equal(h.replies.length, 2, "the inc2 escalation is still retried");
  });

  test(`a matching session.${name} drops the escalation bound to that incarnation`, async (t) => {
    const h = host(t, { failReplies: 1 });
    await h.broker.observe(h.request);
    h.broker.onEvent(event("ses_root", "inc_1"));
    await h.tick(100);
    await h.tick(100000);
    assert.equal(h.replies.length, 1);
  });

  test(`an ID-only session.${name} on an incarnation host keeps the escalation and logs it`, async (t) => {
    const h = host(t, { failReplies: 1 });
    await h.broker.observe(h.request);
    h.broker.onEvent(event("ses_root"));
    assert.ok(h.errors.some((message) => /no incarnationID/.test(message) && /per_child/.test(message)), h.errors.join("\n"));
    // Kept: the retry revalidates the pending request and the bound root incarnation
    // (retryEscalation -> ownedParent, stillBound) before it acts.
    await h.tick(100);
    assert.equal(h.replies.length, 2);
  });

  test(`a requester session.${name} on an incarnation host keeps the escalation for revalidation and logs it`, async (t) => {
    const h = host(t, { failReplies: 1 });
    await h.broker.observe(h.request);
    h.broker.onEvent(event("ses_child", "inc_child"));
    // Every child abort hits this path, so it is a debug note, not an error.
    assert.ok(h.debug.some((message) => /requester/.test(message) && /per_child/.test(message)), h.debug.join("\n"));
    assert.deepEqual(h.errors.filter((message) => /requester/.test(message)), []);
    h.request.approval.kind = "operator";
    await h.tick(100);
    await h.tick(100000);
    assert.equal(h.replies.length, 1, "revalidation drops it once the native request is no longer an owned parent approval");
  });

  test(`old host: session.${name} drops the escalation by ID even when it carries an identity`, async (t) => {
    const h = host(t, { capabilities: OLD_HOST, failReplies: 1 });
    await h.broker.observe(h.request);
    h.broker.onEvent(event("ses_root", "inc_other"));
    await h.tick(100);
    await h.tick(100000);
    assert.equal(h.replies.length, 1);
    assert.deepEqual(h.errors.filter((message) => /incarnationID/.test(message)), []);
  });
}

test("resume after a same-ID recreate does not reopen the inc1 lifecycle record", async (t) => {
  const h = host(t, { mode: "god" });
  const bound = await h.broker.observe(h.request);
  assert.deepEqual(bound, { sessionID: "ses_root", incarnationID: "inc_1", token: h.lifecycle.token("ses_root") });
  const old = h.lifecycle.token("ses_root");
  h.lifecycle.abort("ses_root", "inc_1");
  // The inc1 deletion event has not arrived yet when the user writes to inc2.
  h.recreate("inc_2");
  assert.equal(await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "hello" }] }), false,
    "nothing of inc_1 is resumed");
  assert.equal(old.closed, true, "inc_1 work stays fenced");
  const fresh = h.lifecycle.token("ses_root");
  assert.notEqual(fresh, old);
  assert.equal(h.lifecycle.admit("ses_root", fresh), true, "the replacement starts with its own open admission");
  h.lifecycle.deleted("ses_root", "inc_1");
  assert.equal(h.lifecycle.admit("ses_root", fresh), true, "the late inc_1 delete cannot close inc_2");
});

test("an inc2 abort that arrives while the record is still bound to inc1 fences inc2 once it is adopted", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.observe(h.request);
  assert.equal(h.promotions.length, 1);
  const old = h.lifecycle.token("ses_root");
  h.recreate("inc_2");
  // The replacement is aborted before it did anything this guard saw.
  h.lifecycle.abort("ses_root", "inc_2");
  assert.equal(await h.broker.observe(h.request, old), undefined);
  assert.equal(h.promotions.length, 1, "the aborted inc_2 root is not offered its child's request");
  assert.deepEqual(h.replies, []);
  assert.equal(h.lifecycle.admit("ses_root"), false);
  // The user's first real message on inc_2 lifts it.
  assert.equal(await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] }), true);
  await h.broker.observe(h.request, h.lifecycle.track("ses_root"));
  assert.equal(h.promotions.length, 2);
});

test("resume on an incarnation host still reopens an aborted root of the same incarnation", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.observe(h.request);
  h.lifecycle.abort("ses_root", "inc_1");
  assert.equal(h.lifecycle.admit("ses_root"), false);
  assert.equal(await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] }), true);
  assert.equal(h.lifecycle.admit("ses_root"), true);
});

// Regression: resume captured the record's token before binding it. On an unbound
// record carrying a genuine deferred abort (pendingAbort or tombstone), bind closes
// the record and swaps its token, so the stale token made lifecycle.resume refuse and
// chat.message threw -- blocking the user's first real message after the abort.
for (const deferral of ["pendingAbort", "tombstone"]) {
  test(`resume lifts a genuine deferred abort (${deferral}) on the user's first real message`, async (t) => {
    const h = host(t, { mode: "god" });
    if (deferral === "pendingAbort") {
      h.lifecycle.track("ses_root");
      h.lifecycle.abort("ses_root", "inc_1");
    } else {
      h.lifecycle.abort("ses_root", "inc_1");
      h.lifecycle.track("ses_root");
    }
    assert.equal(h.lifecycle.incarnation("ses_root"), undefined, "the record is unbound");
    assert.equal(await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] }), true);
    assert.equal(h.lifecycle.admit("ses_root"), true);
    assert.equal(h.lifecycle.admit("ses_root", h.lifecycle.token("ses_root")), true);
  });

  test(`resume with only synthetic content does not lift a genuine deferred abort (${deferral})`, async (t) => {
    const h = host(t, { mode: "god" });
    if (deferral === "pendingAbort") {
      h.lifecycle.track("ses_root");
      h.lifecycle.abort("ses_root", "inc_1");
    } else {
      h.lifecycle.abort("ses_root", "inc_1");
      h.lifecycle.track("ses_root");
    }
    await assert.rejects(h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "wake", synthetic: true }] }),
      /admission is closed/);
    assert.equal(h.lifecycle.admit("ses_root"), false);
  });
}

test("resume does not lift an abort that lands during its own root read", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.observe(h.request);
  const get = h.v2.v2.session.get;
  h.v2.v2.session.get = async (...args) => {
    h.lifecycle.abort("ses_root", "inc_1");
    return get(...args);
  };
  await assert.rejects(h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] }),
    /admission is closed/);
  assert.equal(h.lifecycle.admit("ses_root"), false, "the newer abort stands until the next real user turn");
});

test("resume never lifts a genuine deferred delete", async (t) => {
  const h = host(t, { mode: "god" });
  const token = h.lifecycle.track("ses_root");
  h.lifecycle.deleted("ses_root", "inc_1");
  // The deleted row is gone natively; a same-ID read that still shows inc_1 is the
  // race window. Resume must not reopen it.
  await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] });
  assert.equal(token.closed, true);
  assert.equal(h.lifecycle.has("ses_root"), false);
});

// Stale-abort liveness: a delayed inc1 session.aborted must never close the inc2
// root's admission, or the inc2 child's parent request is never offered (no
// escalation, no wake) until the root happens to do something else.
for (const mode of ["god", "auto"]) {
  const offered = (h) => mode === "god" ? h.promotions.length : h.replies.length;

  test(`stale-abort liveness (${mode}): a delayed inc1 abort with no record still lets the inc2 child's request through`, async (t) => {
    const h = host(t, { mode });
    await h.broker.available();
    h.recreate("inc_2");
    h.lifecycle.abort("ses_root", "inc_1");
    // The plugin tracks the root synchronously on permission.asked, then observes.
    await h.broker.observe(h.request, h.lifecycle.track("ses_root"));
    assert.equal(offered(h), 1, "the inc2 request is promoted or escalated");
  });

  test(`stale-abort liveness (${mode}): a delayed inc1 abort on an unbound record still lets the inc2 child's request through`, async (t) => {
    const h = host(t, { mode });
    await h.broker.available();
    const token = h.lifecycle.track("ses_root");
    h.lifecycle.abort("ses_root", "inc_1");
    h.recreate("inc_2");
    await h.broker.observe(h.request, token);
    assert.equal(offered(h), 1, "the inc2 request is promoted or escalated");
  });

  test(`stale-delete liveness (${mode}): a delayed inc1 delete on an unbound record still lets the inc2 child's request through`, async (t) => {
    const h = host(t, { mode });
    await h.broker.available();
    const token = h.lifecycle.track("ses_root");
    h.lifecycle.deleted("ses_root", "inc_1");
    h.recreate("inc_2");
    await h.broker.observe(h.request, token);
    assert.equal(offered(h), 1, "the inc2 request is promoted or escalated");
  });

  test(`stale-delete liveness (${mode}): a genuine inc1 delete on an unbound record still fences inc1 work`, async (t) => {
    const h = host(t, { mode });
    await h.broker.available();
    const token = h.lifecycle.track("ses_root");
    h.lifecycle.deleted("ses_root", "inc_1");
    assert.equal(await h.broker.observe(h.request, token), undefined);
    assert.equal(offered(h), 0);
    assert.deepEqual(h.replies, []);
  });

  test(`stale-abort liveness (${mode}): a genuine inc1 abort with no record still fences inc1 work`, async (t) => {
    const h = host(t, { mode });
    await h.broker.available();
    h.lifecycle.abort("ses_root", "inc_1");
    assert.equal(await h.broker.observe(h.request, h.lifecycle.track("ses_root")), undefined);
    assert.equal(offered(h), 0, "no promotion, escalation or wake for the aborted incarnation");
    assert.deepEqual(h.replies, []);
    // A real user turn on the aborted root reopens it, exactly as before.
    await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] });
    await h.broker.observe(h.request, h.lifecycle.track("ses_root"));
    assert.equal(offered(h), 1);
  });

  test(`stale-abort liveness (${mode}): a genuine inc1 abort on an unbound record still fences inc1 work`, async (t) => {
    const h = host(t, { mode });
    await h.broker.available();
    const token = h.lifecycle.track("ses_root");
    h.lifecycle.abort("ses_root", "inc_1");
    assert.equal(await h.broker.observe(h.request, token), undefined);
    assert.equal(offered(h), 0);
    assert.deepEqual(h.replies, []);
  });

  test(`observe re-admits once with the fresh admission when its read shows a replaced root (${mode})`, async (t) => {
    const h = host(t, { mode: "god" });
    await h.broker.observe(h.request);
    h.setMode(mode);
    const promotedBefore = h.promotions.length;
    const old = h.lifecycle.token("ses_root");
    h.recreate("inc_2");
    // permission.asked for the inc2 child: track() still returns the inc1-bound token.
    const bound = await h.broker.observe(h.request, old);
    assert.equal(old.closed, true, "inc1 work stays fenced");
    assert.equal(h.promotions.length - promotedBefore + h.replies.length, 1, "the inc2 request is offered");
    if (mode === "god") {
      assert.equal(bound?.incarnationID, "inc_2");
      assert.equal(bound.token, h.lifecycle.token("ses_root"), "the wake carries the fresh admission");
      assert.equal(bound.token.closed, false);
    }
  });
}

test("two observes racing a replacement cannot poison the record with the stale read", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  const token = h.lifecycle.track("ses_root");
  // The first observe's root read sees inc_1, then stalls before returning it.
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const get = h.v2.v2.session.get;
  let reads = 0;
  h.v2.v2.session.get = async (...args) => {
    const result = await get(...args);
    if (++reads === 1) await gate;
    return result;
  };
  const stale = h.broker.observe(h.request, token);
  await new Promise(setImmediate);
  assert.equal(reads, 1, "the first read is in flight");
  h.recreate("inc_2");
  const fresh = await h.broker.observe(h.request, token);
  assert.equal(fresh?.incarnationID, "inc_2");
  assert.equal(h.promotions.length, 1);
  release();
  assert.equal(await stale, undefined, "the stale observation does nothing");
  assert.equal(h.lifecycle.incarnation("ses_root"), "inc_2");
  assert.equal(token.closed, false, "the inc_2 admission (and its wake) stays open");
  assert.equal(h.lifecycle.token("ses_root"), token);
  assert.equal(h.promotions.length, 1);
});

// A read that started before another read's adoption is refused by bind as stale. Its
// caller must fail closed for that call: proceeding would act for the incarnation it
// read (inc_2) under a record bound to another (inc_1). `adoptDuringRead` makes the
// first root read of the call land an inc_1 adoption while the read itself shows inc_2.
const adoptDuringRead = (h) => {
  h.recreate("inc_2");
  const get = h.v2.v2.session.get;
  let adopted = false;
  h.v2.v2.session.get = async (...args) => {
    if (!adopted) {
      adopted = true;
      h.lifecycle.bind("ses_root", h.lifecycle.token("ses_root"), "inc_1", h.lifecycle.readEpoch("ses_root"));
    }
    return get(...args);
  };
};

test("observe whose read is overtaken by another read's adoption fails closed (no wake for inc2 under inc1's record)", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  const token = h.lifecycle.track("ses_root");
  adoptDuringRead(h);
  assert.equal(await h.broker.observe(h.request, token), undefined, "no wake binding is returned");
  assert.deepEqual(h.promotions, [], "no promotion for inc_2 under inc_1's record");
  assert.deepEqual(h.replies, [], "no escalation either");
  assert.equal(h.lifecycle.incarnation("ses_root"), "inc_1");
  assert.ok(h.debug.some((message) => /stale/.test(message)), h.debug.join("\n"));
});

test("current whose read is overtaken by another read's adoption fails closed", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  h.lifecycle.track("ses_root");
  adoptDuringRead(h);
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child", incarnationID: "inc_2" }), false);
  assert.deepEqual(h.replies, []);
  assert.equal(h.lifecycle.incarnation("ses_root"), "inc_1");
});

test("guard_decide whose read is overtaken by another read's adoption fails closed", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  h.lifecycle.track("ses_root");
  adoptDuringRead(h);
  await assert.rejects(h.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), /stale/);
  assert.deepEqual(h.replies, []);
});

test("resume whose read is overtaken by another read's adoption does not lift and does not throw", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  const token = h.lifecycle.track("ses_root");
  h.lifecycle.abort("ses_root");
  assert.equal(token.closed, true, "an ID-only abort closes the unbound record");
  adoptDuringRead(h);
  assert.equal(await h.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] }), false);
  assert.equal(h.lifecycle.admit("ses_root"), false, "the abort is not lifted by a stale read");
});

test("observe re-admission re-reads the pending list and drops a request that is gone", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.observe(h.request);
  const old = h.lifecycle.token("ses_root");
  h.recreate("inc_2");
  let lists = 0;
  const list = h.v2.permission.list;
  h.v2.permission.list = async (...args) => (++lists === 1 ? list(...args) : { data: [] });
  assert.equal(await h.broker.observe(h.request, old), undefined);
  assert.equal(lists, 2, "the re-admission re-read the native pending list");
  assert.equal(h.promotions.length, 1, "only the original inc1 promotion");
});

test("observe reads the root before the pending list, so a replacement in between cannot bind an inc1 request to inc2", async (t) => {
  const h = host(t, { mode: "god" });
  await h.broker.available();
  const list = h.v2.permission.list;
  h.v2.permission.list = async (...args) => {
    const result = await list(...args);
    h.recreate("inc_2");
    return result;
  };
  assert.equal(await h.broker.observe(h.request), undefined);
  assert.deepEqual(h.promotions, [], "the request listed under inc1 is never promoted on inc2");
});

for (const tool of ["pending", "decide"]) {
  const call = (h) => tool === "pending"
    ? h.broker.pending({ sessionID: "ses_root" })
    : h.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" });

  test(`guard_${tool} heals a closed admission that belonged to a replaced root`, async (t) => {
    const h = host(t, { mode: "god" });
    await h.broker.observe(h.request);
    h.lifecycle.abort("ses_root", "inc_1");
    h.recreate("inc_2");
    const result = await call(h);
    if (tool === "pending") assert.deepEqual(result, [h.request]);
    else assert.equal(result, "approved once");
  });

  test(`guard_${tool} still refuses a closed admission of the same incarnation`, async (t) => {
    const h = host(t, { mode: "god" });
    await h.broker.observe(h.request);
    h.lifecycle.abort("ses_root", "inc_1");
    await assert.rejects(call(h), /admission is closed/);
    assert.deepEqual(h.replies, []);
  });
}

// Old host: no sessionIncarnation capability. Behavior is pinned unchanged.
test("old host: escalation retry ignores incarnation changes exactly as before", async (t) => {
  const h = host(t, { capabilities: OLD_HOST, failReplies: 1 });
  await h.broker.observe(h.request);
  h.recreate();
  await h.tick(100);
  assert.equal(h.replies.length, 2, "an old host never compares incarnations");
});

test("old host: current works without a binding and deletion retains closure", async (t) => {
  const h = host(t, { capabilities: OLD_HOST, mode: "god" });
  await h.broker.available();
  assert.equal(await h.broker.current({ sessionID: "ses_root", permissionID: "per_child" }), true);
  h.lifecycle.deleted("ses_root");
  assert.equal(h.lifecycle.has("ses_root"), true, "fail-closed retention is unchanged");
  assert.equal(await h.broker.observe(h.request), undefined, "a deleted root stays fenced while GET is 200");
  assert.deepEqual(h.promotions, []);
});

test("old host: observe still promotes and returns the root binding", async (t) => {
  const h = host(t, { capabilities: OLD_HOST, mode: "god" });
  h.setRoot({ id: "ses_root" });
  const bound = await h.broker.observe(h.request);
  assert.deepEqual(bound, { sessionID: "ses_root", incarnationID: undefined, token: h.lifecycle.token("ses_root") });
  assert.equal(h.promotions.length, 1);
});

// Approval notifier: the binding travels with the queued wake.
test("an approval wake passes its bound incarnation to every authoritative check, including idle drain", async () => {
  const checks = [];
  const sent = [];
  let offline = true;
  const lifecycle = createRootLifecycle();
  const notifier = createApprovalNotifier({
    sdk: { session: { promptAsync: async (request) => { if (offline) throw new Error("offline"); sent.push(request); } } }, directory: "/work", lifecycle,
    identityFor: async () => ({ agent: "smart", model: { providerID: "openai", modelID: "gpt" } }),
    current: async (sessionID, requestID, incarnationID) => { checks.push([sessionID, requestID, incarnationID]); return incarnationID === "inc_1"; },
  });
  assert.equal(await notifier.notify("ses_root", "per_1", undefined, "inc_1"), false, "a failed send is queued");
  assert.equal(await notifier.notify("ses_root", "per_2", undefined, "inc_0"), false);
  offline = false;
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  assert.equal(sent.length, 1, "only the wake whose incarnation still matches is sent");
  assert.deepEqual(checks, [
    ["ses_root", "per_1", "inc_1"], ["ses_root", "per_1", "inc_1"],
    ["ses_root", "per_2", "inc_0"],
    ["ses_root", "per_1", "inc_1"], ["ses_root", "per_1", "inc_1"],
  ]);
  assert.equal(notifier.pendingCount(), 0);
});

test("an approval wake is fenced by the root's tracked admission, created on notify", async () => {
  const lifecycle = createRootLifecycle();
  let release;
  const sent = [];
  const notifier = createApprovalNotifier({
    sdk: { session: { promptAsync: async (request) => sent.push(request) } }, directory: "/work", lifecycle,
    identityFor: () => new Promise((resolve) => { release = resolve; }),
    current: async () => true,
  });
  const waking = notifier.notify("ses_root", "per_1", undefined, "inc_1");
  await Promise.resolve();
  assert.equal(lifecycle.has("ses_root"), true, "notify is root activity and tracks the root");
  lifecycle.abort("ses_root");
  lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  release({ agent: "smart", model: { providerID: "openai", modelID: "gpt" } });
  assert.equal(await waking, false);
  assert.deepEqual(sent, []);
});

test("a delayed inc1 abort or delete neither closes nor discards the inc2 root's queued wake", async () => {
  const lifecycle = createRootLifecycle();
  lifecycle.enableIncarnations();
  const sent = [];
  let offline = true;
  const notifier = createApprovalNotifier({
    sdk: { session: { promptAsync: async (request) => { if (offline) throw new Error("offline"); sent.push(request); } } }, directory: "/work", lifecycle,
    identityFor: async () => ({ agent: "smart", model: { providerID: "openai", modelID: "gpt" } }),
    current: async () => true,
  });
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_2");
  assert.equal(await notifier.notify("ses_root", "per_1", token, "inc_2"), false);
  await notifier.onEvent(aborted("ses_root", "inc_1"));
  await notifier.onEvent(deleted("ses_root", "inc_1"));
  assert.equal(notifier.pendingCount(), 1, "the inc2 wake survives stale events");
  assert.equal(lifecycle.admit("ses_root", token), true);
  offline = false;
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  assert.equal(sent.length, 1);
});

test("old host: abort and delete still discard a queued wake by ID", async () => {
  const lifecycle = createRootLifecycle();
  const sent = [];
  let offline = true;
  const notifier = createApprovalNotifier({
    sdk: { session: { promptAsync: async (request) => { if (offline) throw new Error("offline"); sent.push(request); } } }, directory: "/work", lifecycle,
    identityFor: async () => ({ agent: "smart", model: { providerID: "openai", modelID: "gpt" } }),
    current: async () => true,
  });
  await notifier.notify("ses_root", "per_1", undefined, undefined);
  assert.equal(notifier.pendingCount(), 1);
  await notifier.onEvent(aborted("ses_root", "inc_other"));
  assert.equal(notifier.pendingCount(), 0);
  offline = false;
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  assert.deepEqual(sent, []);
});

// Approval notifier: an identity-bearing abort/delete drops only what provably
// belongs to the event's incarnation. A wake is queued only when its send fails,
// so `down()` makes sends fail and `up()` restores them.
const wakeNotifier = (lifecycle) => {
  const sent = [];
  let offline = false;
  const notifier = createApprovalNotifier({
    sdk: { session: { promptAsync: async (request) => { if (offline) throw new Error("offline"); sent.push(request); } } }, directory: "/work", lifecycle,
    identityFor: async () => ({ agent: "smart", model: { providerID: "openai", modelID: "gpt" } }),
    current: async () => true,
  });
  const down = () => { offline = true; };
  const up = () => { offline = false; };
  const idle = () => notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  const sentIDs = () => sent.map((request) => /\((per_[a-z]+)\)/.exec(request.parts[0].text)[1]);
  return { notifier, sent, sentIDs, down, up, idle };
};

for (const [name, event] of [["aborted", aborted], ["deleted", deleted]]) {
  test(`an identity session.${name} drops only the queued wakes bound to that incarnation`, async () => {
    const lifecycle = createRootLifecycle();
    lifecycle.enableIncarnations();
    const w = wakeNotifier(lifecycle);
    const token = lifecycle.track("ses_root");
    w.down();
    assert.equal(await w.notifier.notify("ses_root", "per_old", token, "inc_1"), false);
    assert.equal(await w.notifier.notify("ses_root", "per_new", token, "inc_2"), false);
    await w.notifier.onEvent(event("ses_root", "inc_1"));
    assert.equal(w.notifier.pendingCount(), 1, "only the inc_1 wake is dropped");
    w.up();
    assert.equal(await w.notifier.notify("ses_root", "per_newer", token, "inc_2"), true, "the replacement is woken at once");
    await w.idle();
    assert.deepEqual(w.sentIDs(), ["per_newer", "per_new"]);
  });
}

for (const [name, event] of [["aborted", aborted], ["deleted", deleted]]) {
  test(`session.idle after a deferred identity session.${name} re-delivers the queued inc_2 wake`, async () => {
    const lifecycle = createRootLifecycle();
    lifecycle.enableIncarnations();
    const w = wakeNotifier(lifecycle);
    // Unbound record: the inc_1 event cannot be compared yet, so it is deferred.
    const token = lifecycle.track("ses_root");
    w.down();
    assert.equal(await w.notifier.notify("ses_root", "per_new", token, "inc_2"), false, "queued after a failed send");
    await w.notifier.onEvent(event("ses_root", "inc_1"));
    assert.equal(w.notifier.pendingCount(), 1, "the inc_2 wake is not discarded");
    assert.deepEqual(w.sent, []);
    w.up();
    await w.idle();
    assert.deepEqual(w.sentIDs(), ["per_new"], "idle re-delivers it");
    assert.equal(w.notifier.pendingCount(), 0);
  });
}

test("a matching identity abort on the bound record drops its wakes", async () => {
  const lifecycle = createRootLifecycle();
  lifecycle.enableIncarnations();
  const w = wakeNotifier(lifecycle);
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  w.down();
  await w.notifier.notify("ses_root", "per_old", token, "inc_1");
  await w.notifier.onEvent(aborted("ses_root", "inc_1"));
  assert.equal(w.notifier.pendingCount(), 0);
  lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  w.up();
  assert.equal(await w.notifier.notify("ses_root", "per_next", undefined, "inc_1"), true, "the resumed root is woken");
});

test("an ID-only abort on an incarnation host still drops every queued wake", async () => {
  const lifecycle = createRootLifecycle();
  lifecycle.enableIncarnations();
  const w = wakeNotifier(lifecycle);
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_2");
  w.down();
  await w.notifier.notify("ses_root", "per_new", token, "inc_2");
  await w.notifier.onEvent(aborted("ses_root"));
  assert.equal(w.notifier.pendingCount(), 0);
});
