import assert from "node:assert/strict";
import test from "node:test";
import { createRootLifecycle } from "../lib/lifecycle.js";

test("an aborted root stays closed until a non-synthetic user text or file resumes it", () => {
  const lifecycle = createRootLifecycle();
  const token = lifecycle.track("ses_root");

  lifecycle.abort("ses_root");
  assert.equal(lifecycle.admit("ses_root", token), false);
  assert.equal(token.closed, true, "in-flight work is invalidated immediately");

  lifecycle.resume("ses_root", [{ type: "text", text: "wake", synthetic: true }]);
  assert.equal(lifecycle.admit("ses_root"), false, "guard-generated text cannot reopen a root");

  lifecycle.resume("ses_root", [{ type: "text", text: "continue", synthetic: false }]);
  assert.equal(lifecycle.admit("ses_root"), true);

  lifecycle.abort("ses_root");
  lifecycle.resume("ses_root", [{ type: "file", url: "file:///work/request.txt" }]);
  assert.equal(lifecycle.admit("ses_root"), true, "a real file-only user message resumes admission");
});

test("deletion invalidates captured work and retains closed state until authoritative missing proof", () => {
  const lifecycle = createRootLifecycle();
  const token = lifecycle.track("ses_root");
  lifecycle.deleted("ses_root");
  assert.equal(token.closed, true);
  assert.equal(lifecycle.admit("ses_root", token), false);
  assert.equal(lifecycle.has("ses_root"), true, "the deletion event alone is not authoritative missing proof");
  assert.equal(lifecycle.admit("ses_root"), false);
  assert.equal(lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]), false, "deleted roots never reopen");
});

test("reads on an unknown root create no lifecycle state", () => {
  const lifecycle = createRootLifecycle();
  assert.equal(lifecycle.admit("ses_unknown"), true, "an untouched root is open");
  assert.equal(lifecycle.admit("ses_unknown", undefined), true);
  assert.equal(lifecycle.token("ses_unknown"), undefined, "token is a read and mints nothing");
  assert.equal(lifecycle.has("ses_unknown"), false);
  assert.equal(lifecycle.size(), 0, "admit/token/has must never insert");
});

test("only real root activity creates lifecycle state", () => {
  const lifecycle = createRootLifecycle();
  const token = lifecycle.track("ses_root");
  assert.equal(token.closed, false);
  assert.equal(lifecycle.has("ses_root"), true);
  assert.equal(lifecycle.token("ses_root"), token, "a read returns the tracked token");
  assert.equal(lifecycle.track("ses_root"), token, "repeated activity shares one admission");
  assert.equal(lifecycle.size(), 1);
});

test("old host: deletion of an untouched root still retains a closed fail-closed record", () => {
  const lifecycle = createRootLifecycle();
  lifecycle.deleted("ses_root");
  assert.equal(lifecycle.has("ses_root"), true);
  assert.equal(lifecycle.admit("ses_root"), false);
  assert.equal(lifecycle.track("ses_root").closed, true, "a late activity on a deleted root stays fenced");
  assert.equal(lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]), false);
});

test("with session incarnations, deletion closes tokens and then removes the record", () => {
  const lifecycle = createRootLifecycle();
  lifecycle.enableIncarnations();
  const token = lifecycle.track("ses_root");
  lifecycle.deleted("ses_root");
  assert.equal(token.closed, true, "old in-flight work is invalidated exactly as before");
  assert.equal(lifecycle.admit("ses_root", token), false);
  assert.equal(lifecycle.has("ses_root"), false, "no permanent deleted pile");
  assert.equal(lifecycle.admit("ses_root"), true, "a same-ID recreate is not blocked by the old record");
  const fresh = lifecycle.track("ses_root");
  assert.notEqual(fresh, token);
  assert.equal(fresh.closed, false);
  assert.equal(lifecycle.admit("ses_root", token), false, "the old token never acquires the new admission");
});

test("with session incarnations, deleted roots no longer accumulate", () => {
  const lifecycle = createRootLifecycle();
  lifecycle.enableIncarnations();
  for (let i = 0; i < 1000; i += 1) {
    if (i % 2) lifecycle.track(`ses_${i}`);
    lifecycle.deleted(`ses_${i}`);
  }
  assert.equal(lifecycle.size(), 0);
});

// Incarnation-bound events (docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md
// section 5): session.aborted may carry properties.incarnationID, session.deleted carries
// properties.info.incarnationID. A delayed event for an old incarnation must not close the
// replacement root's admission.
const capable = () => {
  const errors = [], debug = [];
  const lifecycle = createRootLifecycle({
    onError: (error) => errors.push(error.message),
    onDebug: (error) => debug.push(error.message),
  });
  lifecycle.enableIncarnations();
  return { lifecycle, errors, debug };
};

for (const kind of ["abort", "deleted"]) {
  test(`with session incarnations, a delayed inc1 ${kind} leaves the inc2 root's admission open`, () => {
    const { lifecycle } = capable();
    const token = lifecycle.track("ses_root");
    lifecycle.bind("ses_root", token, "inc_2");
    assert.equal(lifecycle[kind]("ses_root", "inc_1"), false, "a stale event reports that it was not applied");
    assert.equal(token.closed, false);
    assert.equal(lifecycle.admit("ses_root", token), true);
    assert.equal(lifecycle.token("ses_root"), token, "the replacement keeps its admission");
  });

  test(`with session incarnations, a matching ${kind} closes the bound admission`, () => {
    const { lifecycle, errors } = capable();
    const token = lifecycle.track("ses_root");
    lifecycle.bind("ses_root", token, "inc_1");
    assert.equal(lifecycle[kind]("ses_root", "inc_1"), true);
    assert.equal(token.closed, true);
    assert.equal(lifecycle.admit("ses_root", token), false);
    assert.deepEqual(errors, [], "a matching identity is not an anomaly");
  });

  test(`with session incarnations, an ID-only ${kind} still closes (fail-closed) and is logged`, () => {
    const { lifecycle, errors } = capable();
    const token = lifecycle.track("ses_root");
    lifecycle.bind("ses_root", token, "inc_2");
    assert.equal(lifecycle[kind]("ses_root"), true);
    assert.equal(token.closed, true, "without identity the restrictive direction wins");
    assert.ok(errors.some((message) => /no incarnationID/.test(message) && /ses_root/.test(message)), errors.join("\n"));
  });

  test(`old host: an ID-only ${kind} behaves exactly as before`, () => {
    const errors = [];
    const lifecycle = createRootLifecycle({ onError: (error) => errors.push(error.message) });
    const token = lifecycle.track("ses_root");
    lifecycle.bind("ses_root", token, "inc_2");
    lifecycle[kind]("ses_root");
    assert.equal(token.closed, true);
    assert.equal(lifecycle.admit("ses_root"), false);
    assert.equal(lifecycle.has("ses_root"), true, "old-host retention is unchanged");
    assert.equal(lifecycle.incarnationsEnabled(), false);
    assert.deepEqual(errors, []);
  });

  // Native emits an event incarnationID only on a host that advertises
  // sessionIncarnation: 1, so the field itself proves the capability (sticky), even
  // before any authority call has probed it.
  test(`an identity-bearing ${kind} proves the capability before any probe`, () => {
    const lifecycle = createRootLifecycle();
    const token = lifecycle.track("ses_root");
    lifecycle[kind]("ses_root", "inc_1");
    assert.equal(lifecycle.incarnationsEnabled(), true);
    assert.equal(token.closed, false, "the unbound record defers the event to its first bind");
    lifecycle.bind("ses_root", token, "inc_2");
    assert.equal(lifecycle.admit("ses_root", token), true, "a replacement root stays open");
    lifecycle[kind]("ses_root");
    assert.equal(lifecycle.incarnationsEnabled(), true, "the capability is sticky");
  });

  test(`a ${kind} with an empty or non-string identity does not prove the capability`, () => {
    for (const value of ["", 7]) {
      const lifecycle = createRootLifecycle();
      lifecycle[kind]("ses_root", value);
      assert.equal(lifecycle.incarnationsEnabled(), false);
    }
  });
}

test("with session incarnations, an identity delete on an unbound record is decided at bind", () => {
  for (const [adopted, fenced] of [["inc_1", true], ["inc_2", false]]) {
    const { lifecycle } = capable();
    const token = lifecycle.track("ses_root");
    assert.equal(lifecycle.deleted("ses_root", "inc_1"), true);
    assert.equal(token.closed, false, "nothing to compare against yet: the delete is deferred, not applied");
    assert.equal(lifecycle.has("ses_root"), true);
    assert.equal(lifecycle.bind("ses_root", token, adopted), true);
    assert.equal(token.closed, fenced, `adopting ${adopted} after an inc_1 delete`);
    assert.equal(lifecycle.has("ses_root"), !fenced, "a fenced deleted record is removed, not retained");
    assert.equal(lifecycle.admit("ses_root", token), !fenced);
    // A deleted root never reopens: no user turn lifts a deferred delete.
    if (fenced) assert.equal(lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]), false);
  }
});

test("with session incarnations, a real user turn does not lift a deferred delete", () => {
  const { lifecycle } = capable();
  const token = lifecycle.track("ses_root");
  lifecycle.deleted("ses_root", "inc_1");
  lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true);
});

// Stale-abort liveness: an identity abort that cannot be compared yet (no record, or
// a record not bound to an incarnation) is remembered as a tombstone, not applied as
// a closure. The first authoritative bind decides: the same incarnation is fenced,
// any other incarnation (a same-ID replacement) stays open.
test("with session incarnations, an identity abort with no record creates no closed record", () => {
  const { lifecycle } = capable();
  assert.equal(lifecycle.abort("ses_root", "inc_1"), true);
  assert.equal(lifecycle.has("ses_root"), false, "a tombstone is not a lifecycle record");
  const token = lifecycle.track("ses_root");
  assert.equal(token.closed, false, "the replacement's first activity is not born closed");
  assert.equal(lifecycle.bind("ses_root", token, "inc_2"), true);
  assert.equal(lifecycle.admit("ses_root", token), true, "a delayed inc1 abort never closes inc2 admission");
});

test("with session incarnations, a tombstoned abort fences the same incarnation at bind", () => {
  const { lifecycle } = capable();
  lifecycle.abort("ses_root", "inc_1");
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true, "inc1 work bound after its own abort is fenced");
  assert.equal(lifecycle.admit("ses_root", token), false);
  assert.equal(lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]), true,
    "a real user turn reopens it exactly like an ordinary abort");
});

test("with session incarnations, an identity abort on an unbound record is decided at bind", () => {
  for (const [adopted, fenced] of [["inc_1", true], ["inc_2", false]]) {
    const { lifecycle } = capable();
    const token = lifecycle.track("ses_root");
    assert.equal(lifecycle.abort("ses_root", "inc_1"), true);
    assert.equal(token.closed, false, "nothing to compare against yet: the closure is deferred, not applied");
    assert.equal(lifecycle.bind("ses_root", token, adopted), true);
    assert.equal(token.closed, fenced, `adopting ${adopted} after an inc_1 abort`);
    assert.equal(lifecycle.admit("ses_root", token), !fenced);
  }
});

test("with session incarnations, a real user turn clears a tombstone; synthetic text does not", () => {
  const { lifecycle } = capable();
  lifecycle.abort("ses_root", "inc_1");
  assert.equal(lifecycle.resume("ses_root", [{ type: "text", text: "wake", synthetic: true }]), false);
  let token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true, "a synthetic prompt does not lift the abort");
  const other = capable().lifecycle;
  other.abort("ses_root", "inc_1");
  assert.equal(other.resume("ses_root", [{ type: "text", text: "continue" }]), true);
  token = other.track("ses_root");
  other.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, false, "the user resumed inc_1 after its abort");
});

test("with session incarnations, a matching delete clears the tombstone", () => {
  const { lifecycle } = capable();
  lifecycle.abort("ses_root", "inc_1");
  lifecycle.deleted("ses_root", "inc_1");
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, false);
});

test("with session incarnations, tombstones are bounded and evictions are logged as errors", () => {
  const { lifecycle, errors } = capable();
  for (let i = 0; i < 300; i += 1) lifecycle.abort(`ses_${i}`, `inc_${i}`);
  assert.equal(lifecycle.size(), 0);
  assert.equal(lifecycle.tombstones(), 256);
  // Known children never tombstone, so an eviction drops a possible root's fence:
  // it is a fail-open event and is logged as an error.
  assert.equal(errors.filter((message) => /tombstone/.test(message) && /evicted/.test(message)).length, 44, errors.join("\n"));
  // The oldest were evicted: ses_0's abort no longer fences a later inc_0 bind.
  const evicted = lifecycle.track("ses_0");
  lifecycle.bind("ses_0", evicted, "inc_0");
  assert.equal(evicted.closed, false);
  const kept = lifecycle.track("ses_299");
  lifecycle.bind("ses_299", kept, "inc_299");
  assert.equal(kept.closed, true);
});

test("with session incarnations, an abort of a known child never tombstones, so it cannot evict a root's fence", () => {
  const errors = [];
  const lifecycle = createRootLifecycle({
    onError: (error) => errors.push(error.message),
    isChild: (sessionID) => sessionID.startsWith("ses_kid"),
  });
  lifecycle.enableIncarnations();
  lifecycle.abort("ses_root", "inc_1");
  for (let i = 0; i < 300; i += 1) assert.equal(lifecycle.abort(`ses_kid_${i}`, `inc_${i}`), true);
  assert.equal(lifecycle.tombstones(), 1, "only the root's abort is remembered");
  assert.deepEqual(errors, []);
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true, "the genuinely aborted root stays fenced");
});

test("with session incarnations, an abort of a session not known to be a child still tombstones", () => {
  for (const answer of [false, undefined]) {
    const lifecycle = createRootLifecycle({ isChild: () => answer });
    lifecycle.enableIncarnations();
    lifecycle.abort("ses_unknown", "inc_1");
    assert.equal(lifecycle.tombstones(), 1);
  }
});

// A newer incarnation's identity event can arrive while the record is still bound to
// the older one (the root was recreated; no inc2 activity yet). It is not applied to
// inc1, but it is remembered, and the bind that replaces the record decides it.
test("with session incarnations, a newer-incarnation abort on a bound record closes the replacement at bind", () => {
  const { lifecycle } = capable();
  const old = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", old, "inc_1");
  assert.equal(lifecycle.abort("ses_root", "inc_2"), false, "not applied to the inc_1 record");
  assert.equal(old.closed, false, "inc_1 admission is untouched by an inc_2 event");
  assert.equal(lifecycle.bind("ses_root", old, "inc_2"), false, "the read shows the replacement");
  assert.equal(old.closed, true);
  assert.equal(lifecycle.has("ses_root"), true);
  assert.equal(lifecycle.admit("ses_root"), false, "the replacement was aborted: its fresh record is closed");
  assert.equal(lifecycle.token("ses_root").closed, true);
  assert.equal(lifecycle.resume("ses_root", [{ type: "text", text: "continue" }], lifecycle.token("ses_root")), true,
    "a real user turn lifts it like any abort");
  assert.equal(lifecycle.admit("ses_root"), true);
});

test("with session incarnations, a newer-incarnation delete on a bound record removes the replacement at bind", () => {
  const { lifecycle } = capable();
  const old = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", old, "inc_1");
  assert.equal(lifecycle.deleted("ses_root", "inc_2"), false);
  assert.equal(old.closed, false);
  assert.equal(lifecycle.bind("ses_root", old, "inc_2"), false);
  assert.equal(old.closed, true);
  assert.equal(lifecycle.has("ses_root"), false, "the deleted replacement gets no record");
});

test("with session incarnations, a stashed event for another incarnation leaves the replacement open", () => {
  const { lifecycle } = capable();
  const old = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", old, "inc_1");
  lifecycle.abort("ses_root", "inc_3");
  lifecycle.deleted("ses_root", "inc_3");
  assert.equal(lifecycle.bind("ses_root", old, "inc_2"), false);
  assert.equal(lifecycle.admit("ses_root"), true);
  assert.equal(lifecycle.token("ses_root").closed, false);
});

// Several deferred identities for one ID are all kept (bounded), so a later one
// cannot overwrite the one the first bind adopts.
test("with session incarnations, deferred aborts on an unbound record do not overwrite each other", () => {
  for (const order of [["inc_1", "inc_2"], ["inc_2", "inc_1"]]) {
    const { lifecycle } = capable();
    const token = lifecycle.track("ses_root");
    for (const incarnation of order) lifecycle.abort("ses_root", incarnation);
    lifecycle.bind("ses_root", token, "inc_1");
    assert.equal(token.closed, true, `aborts ${order.join(", ")} then bind inc_1`);
  }
});

test("with session incarnations, tombstoned aborts for one ID do not overwrite each other", () => {
  const { lifecycle } = capable();
  lifecycle.abort("ses_root", "inc_1");
  lifecycle.abort("ses_root", "inc_2");
  assert.equal(lifecycle.tombstones(), 1, "one tombstone entry per session ID");
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true);
});

test("with session incarnations, deferred deletes on an unbound record do not overwrite each other", () => {
  const { lifecycle } = capable();
  const token = lifecycle.track("ses_root");
  lifecycle.deleted("ses_root", "inc_1");
  lifecycle.deleted("ses_root", "inc_2");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true);
  assert.equal(lifecycle.has("ses_root"), false);
});

test("with session incarnations, deferred markers are capped at four per ID and an eviction is an error", () => {
  const { lifecycle, errors } = capable();
  const token = lifecycle.track("ses_root");
  for (let i = 1; i <= 5; i += 1) lifecycle.abort("ses_root", `inc_${i}`);
  assert.equal(errors.filter((message) => /inc_1/.test(message) && /evicted/.test(message)).length, 1, errors.join("\n"));
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, false, "the oldest marker was evicted");
  const { lifecycle: kept } = capable();
  const keptToken = kept.track("ses_root");
  for (let i = 1; i <= 5; i += 1) kept.abort("ses_root", `inc_${i}`);
  kept.bind("ses_root", keptToken, "inc_5");
  assert.equal(keptToken.closed, true);
});

// Read epochs: a read that started before the record was adopted never replaces it.
test("with session incarnations, a read that started before the adoption cannot replace the record", () => {
  const { lifecycle } = capable();
  const token = lifecycle.track("ses_root");
  const stale = lifecycle.readEpoch("ses_root");
  const fresh = lifecycle.readEpoch("ses_root");
  assert.equal(lifecycle.bind("ses_root", token, "inc_2", fresh), true, "the fresh read adopts inc_2");
  assert.equal(lifecycle.bind("ses_root", token, "inc_1", stale), "stale",
    "the stale read replaces nothing and is reported distinctly, so its caller fails closed");
  assert.equal(token.closed, false, "inc_2's admission is not poisoned");
  assert.equal(lifecycle.incarnation("ses_root"), "inc_2");
  assert.equal(lifecycle.token("ses_root"), token);
});

test("with session incarnations, a read that started after the adoption still replaces the record", () => {
  const { lifecycle } = capable();
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1", lifecycle.readEpoch("ses_root"));
  const later = lifecycle.readEpoch("ses_root");
  assert.equal(lifecycle.bind("ses_root", token, "inc_2", later), false);
  assert.equal(token.closed, true);
  assert.equal(lifecycle.incarnation("ses_root"), "inc_2");
  // A read that started before that replacement cannot undo it.
  const fresh = lifecycle.token("ses_root");
  assert.equal(lifecycle.bind("ses_root", fresh, "inc_1", later), "stale");
  assert.equal(lifecycle.incarnation("ses_root"), "inc_2");
  assert.equal(fresh.closed, false);
});

// Adopting one tombstoned incarnation must not discard the others: they may name a
// same-ID replacement that was aborted before this guard saw any of its activity.
test("with session incarnations, adopting one tombstoned abort keeps the others for a replacing bind", () => {
  const { lifecycle } = capable();
  lifecycle.abort("ses_root", "inc_1");
  lifecycle.abort("ses_root", "inc_2");
  const token = lifecycle.track("ses_root");
  lifecycle.bind("ses_root", token, "inc_1");
  assert.equal(token.closed, true, "inc_1 adopted and fenced by its own abort");
  assert.equal(lifecycle.bind("ses_root", lifecycle.token("ses_root"), "inc_2"), false, "the read shows the replacement");
  assert.equal(lifecycle.incarnation("ses_root"), "inc_2");
  assert.equal(lifecycle.admit("ses_root"), false, "the replacement was aborted: its fresh record is closed");
  assert.equal(lifecycle.token("ses_root").closed, true);
});

test("with session incarnations, an ID-only abort with no record still closes fail-closed", () => {
  const { lifecycle, errors } = capable();
  assert.equal(lifecycle.abort("ses_root"), true);
  assert.equal(lifecycle.has("ses_root"), true);
  assert.equal(lifecycle.track("ses_root").closed, true);
  assert.ok(errors.some((message) => /no incarnationID/.test(message)), errors.join("\n"));
});

test("with session incarnations, binding a different incarnation replaces the record and closes the old admission", () => {
  const { lifecycle } = capable();
  const old = lifecycle.track("ses_root");
  assert.equal(lifecycle.bind("ses_root", old, "inc_1"), true);
  assert.equal(lifecycle.bind("ses_root", old, "inc_1"), true, "rebinding the same incarnation is idempotent");
  assert.equal(lifecycle.bind("ses_root", old, "inc_2"), false, "an authoritative read shows a replacement root");
  assert.equal(old.closed, true, "work captured under inc_1 is fenced");
  const fresh = lifecycle.token("ses_root");
  assert.notEqual(fresh, old);
  assert.equal(fresh.closed, false);
  assert.equal(lifecycle.deleted("ses_root", "inc_1"), false, "the late inc_1 delete is now stale");
  assert.equal(fresh.closed, false);
});

test("bind is a read for unknown roots and a no-op without the capability", () => {
  const lifecycle = createRootLifecycle();
  assert.equal(lifecycle.bind("ses_unknown", undefined, "inc_1"), true);
  assert.equal(lifecycle.size(), 0, "bind never inserts");
  const token = lifecycle.track("ses_root");
  assert.equal(lifecycle.bind("ses_root", token, "inc_1"), true);
  assert.equal(lifecycle.bind("ses_root", token, "inc_2"), true, "an old host never replaces by incarnation");
  assert.equal(token.closed, false);
  const { lifecycle: incarnationHost } = capable();
  assert.equal(incarnationHost.bind("ses_unknown", undefined, "inc_1"), true);
  assert.equal(incarnationHost.size(), 0, "bind never inserts on a capable host either");
});

test("learning the capability purges deleted records retained while it was unknown", () => {
  const lifecycle = createRootLifecycle();
  const token = lifecycle.track("ses_root");
  lifecycle.deleted("ses_root");
  lifecycle.abort("ses_aborted");
  assert.equal(lifecycle.size(), 2);
  lifecycle.enableIncarnations();
  assert.equal(lifecycle.has("ses_root"), false);
  assert.equal(token.closed, true);
  assert.equal(lifecycle.has("ses_aborted"), true, "an aborted live root keeps its closed admission");
  assert.equal(lifecycle.admit("ses_aborted"), false);
});
