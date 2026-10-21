import { test } from "node:test";
import assert from "node:assert/strict";
import { approverOptions, createApproverRegistry } from "../lib/approver.js";

test("approverOptions is OFF unless explicitly enabled", () => {
  assert.equal(approverOptions(undefined).enabled, false);
  assert.equal(approverOptions(null).enabled, false);
  assert.equal(approverOptions({}).enabled, false);
  assert.equal(approverOptions({ enabled: false }).enabled, false);
  assert.equal(approverOptions({ enabled: "true" }).enabled, false); // only a real boolean true
  assert.equal(approverOptions({ enabled: true }).enabled, true);
});

test("register then look up by approver returns the root and incarnation", () => {
  const reg = createApproverRegistry();
  reg.register("ses_root", "ses_appr", "inc1");
  assert.deepEqual(reg.lookupByApprover("ses_appr"), { root: "ses_root", incarnationID: "inc1" });
  assert.deepEqual(reg.approverOf("ses_root"), { approverSessionID: "ses_appr", incarnationID: "inc1" });
  assert.equal(reg.isApprover("ses_appr"), true);
  assert.equal(reg.isApprover("ses_root"), false);
  assert.equal(reg.size(), 1);
});

test("an unknown session is not an approver", () => {
  const reg = createApproverRegistry();
  assert.equal(reg.lookupByApprover("ses_nobody"), null);
  assert.equal(reg.isApprover("ses_nobody"), false);
  assert.equal(reg.approverOf("ses_nobody"), null);
});

test("clear removes both directions", () => {
  const reg = createApproverRegistry();
  reg.register("ses_root", "ses_appr", "inc1");
  reg.clear("ses_root");
  assert.equal(reg.lookupByApprover("ses_appr"), null);
  assert.equal(reg.approverOf("ses_root"), null);
  assert.equal(reg.isApprover("ses_appr"), false);
  assert.equal(reg.size(), 0);
});

test("re-registering a root (new incarnation/approver) replaces cleanly", () => {
  const reg = createApproverRegistry();
  reg.register("ses_root", "ses_appr1", "inc1");
  reg.register("ses_root", "ses_appr2", "inc2");
  assert.equal(reg.lookupByApprover("ses_appr1"), null, "the old approver is no longer bound");
  assert.deepEqual(reg.lookupByApprover("ses_appr2"), { root: "ses_root", incarnationID: "inc2" });
  assert.equal(reg.size(), 1);
});

test("an approver session cannot be read as the approver of two roots", () => {
  const reg = createApproverRegistry();
  reg.register("ses_rootA", "ses_appr", "incA");
  reg.register("ses_rootB", "ses_appr", "incB"); // same approver, moved to a new root
  assert.equal(reg.approverOf("ses_rootA"), null, "the first root's binding is dropped");
  assert.deepEqual(reg.lookupByApprover("ses_appr"), { root: "ses_rootB", incarnationID: "incB" });
  assert.equal(reg.size(), 1);
});

test("the approver can never be the root itself", () => {
  const reg = createApproverRegistry();
  assert.throws(() => reg.register("ses_root", "ses_root", "inc1"), /cannot be the root itself/);
});

test("invalid arguments are refused", () => {
  const reg = createApproverRegistry();
  assert.throws(() => reg.register("", "ses_appr", "inc1"), /invalid root/);
  assert.throws(() => reg.register("ses_root", "", "inc1"), /invalid approver session/);
});

test("the registry is bounded and an evicted root just falls out (never fail-open)", () => {
  const reg = createApproverRegistry();
  // One past the 512 cap: the oldest registration is evicted, size stays at the cap.
  for (let i = 0; i < 513; i++) reg.register(`ses_root_${i}`, `ses_appr_${i}`, `inc_${i}`);
  assert.equal(reg.size(), 512);
  assert.equal(reg.lookupByApprover("ses_appr_0"), null, "the oldest was evicted");
  assert.deepEqual(reg.lookupByApprover("ses_appr_512"), { root: "ses_root_512", incarnationID: "inc_512" });
});
