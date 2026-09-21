// The privacy boundary. The classifier route treats every profile other than `auto` and
// `manual` as one whose command text may not leave local infrastructure, and it asks
// resolveProfileFor() what the profile is -- so a profile this file fails to recognise
// does not merely degrade, it fails OPEN and ships command text (paths, hostnames,
// inline secrets) to a cloud classifier with nothing logged.
//
// ☠️ This used to be an ALLOWLIST of profile names hand-copied from the broker. When the
// broker added `uncensored-70b` and `vision`, both would have resolved to `auto` here and
// skipped the restriction. The guard deliberately has no code dependency on the broker
// (it reads the state files as a documented contract), so the list could never have been
// kept in sync by import -- hence a SHAPE check, and an unknown name treated as
// restrictive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const home = mkdtempSync(join(tmpdir(), "guard-broker-"));
process.env.HOME = home;
const dir = join(home, ".local/share/opencode/model-routing/profiles");
mkdirSync(dir, { recursive: true });

const B = await import(new URL("../lib/broker.js", import.meta.url).href);

const record = (sessionID, profile) =>
  writeFileSync(join(dir, `${sessionID}.json`), JSON.stringify({ profile, explicit: true }));

test("a profile the broker added but this file has never heard of is still restrictive", () => {
  // The exact regression: these two shipped in one broker release.
  for (const profile of ["uncensored-70b", "vision"]) {
    record(`ses_${profile.replace(/-/g, "")}`, profile);
    const got = B.resolveProfileFor({ sessionID: `ses_${profile.replace(/-/g, "")}` });
    assert.equal(got.profile, profile, `${profile} must survive resolution`);
    assert.notEqual(got.profile, "auto",
      "resolving to auto is what lets command text reach a cloud classifier");
  }
});

test("the profiles that existed before still resolve unchanged", () => {
  for (const profile of ["auto", "manual", "local", "private", "uncensored", "uncensored-offline"]) {
    record("ses_known", profile);
    assert.equal(B.resolveProfileFor({ sessionID: "ses_known" }).profile, profile);
  }
});

test("a malformed record is refused rather than trusted", () => {
  // ☆ Refusing here falls through to the parent/agent chain and ultimately `auto`, which
  // is why the SHAPE has to be checked: garbage must not become a profile name, while a
  // well-formed unknown name must.
  for (const bad of [{ profile: 42 }, { profile: "" }, { profile: "../etc/passwd" },
                     { profile: "UPPER" }, { profile: "x".repeat(200) }, {}, null]) {
    writeFileSync(join(dir, "ses_bad.json"), JSON.stringify(bad));
    assert.equal(B.resolveProfileFor({ sessionID: "ses_bad" }).profile, "auto",
      `malformed ${JSON.stringify(bad)} must not be taken as a profile`);
  }
});

test("a child inherits a brand-new profile from its parent", () => {
  // Compaction and the classifier run as children; inheriting `auto` instead of the parent's
  // restrictive profile is the same fail-open by another route.
  record("ses_parent70b", "uncensored-70b");
  const got = B.resolveProfileFor({ sessionID: "ses_child", parentID: "ses_parent70b" });
  assert.equal(got.profile, "uncensored-70b");
  assert.equal(got.source, "parent");
});

test("the broker directory can be moved, and profiles are read from there", () => {
  const other = join(home, "elsewhere");
  mkdirSync(join(other, "profiles"), { recursive: true });
  writeFileSync(join(other, "profiles", "ses_moved.json"), JSON.stringify({ profile: "private" }));
  assert.equal(B.resolveProfileFor({ sessionID: "ses_moved", dir: other }).profile, "private");
  assert.equal(B.resolveProfileFor({ sessionID: "ses_moved" }).profile, "auto", "the default directory has no such record");
});

test("the broker counts as available only when its socket exists and it is not disabled", async () => {
  assert.equal(B.brokerAvailable(), false, "no socket in a fresh HOME");
  writeFileSync(join(home, ".local/share/opencode/model-routing/broker.sock"), "");
  assert.equal(B.brokerAvailable(), false, "a regular file is not a socket");
  const { createServer } = await import("node:net");
  const dir = join(home, "live-broker");
  mkdirSync(dir, { recursive: true });
  const server = createServer();
  await new Promise((resolve) => server.listen(B.brokerSocket(dir), resolve));
  try {
    assert.equal(B.brokerAvailable({ dir }), true);
    assert.equal(B.brokerAvailable({ dir, enabled: false }), false, "classifier.json broker:false wins");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a local-only lease must name a local target", () => {
  assert.equal(B.leaseRespectsLocalOnly({ id: "gpu", kind: "local" }, true), true);
  assert.equal(B.leaseRespectsLocalOnly({ id: "cloud", kind: "cloud" }, true), false,
    "a broker that ignored localOnly must not get to hand the command to a cloud model");
  assert.equal(B.leaseRespectsLocalOnly({ id: "old" }, true), false, "no kind is not proof of local");
  assert.equal(B.leaseRespectsLocalOnly({ id: "cloud", kind: "cloud" }, false), true);
});

process.on("exit", () => { try { rmSync(home, { recursive: true, force: true }); } catch {} });
