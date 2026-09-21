import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// opencode calls every export of a plugin module as a plugin factory; a
// non-function export -- or a second function export that cannot survive being
// called with the plugin input -- unloads the whole module, silently.
test("plugin.js exports exactly one factory function", async () => {
  const mod = await import("../plugin.js");
  const exports = Object.entries(mod);
  assert.equal(exports.length, 1, `exports: ${exports.map(([k]) => k).join(", ")}`);
  assert.equal(typeof exports[0][1], "function");
});

test("classifier cleanup reaches idle before deleting the disposable session", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const start = source.indexOf("if (created) {");
  const end = source.indexOf('brokerRequest("/forget"', start);
  const cleanup = source.slice(start, end);
  const abort = cleanup.indexOf("client.session.abort");
  const wait = cleanup.indexOf("v2Client().v2.session.wait");
  const remove = cleanup.indexOf("client.session.delete");
  assert.ok(abort >= 0 && wait > abort && remove > wait,
    "classifier cleanup must abort, wait for idle, then delete");
});

// ☠️ This test previously asserted `v2Client().session.wait`, which pinned the
// BUG in place: `wait` is declared only on the V2 session group (Session3), so
// the legacy `.session` group threw "is not a function" on every cleanup, the
// delete never ran, and 99 disposable classifier sessions leaked while this
// suite stayed green. Assert the legacy spelling is absent, not just that some
// wait call exists.
test("the idle barrier uses the V2 session group, not the legacy one", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const legacy = /v2Client\(\)\s*\.\s*session\s*\.\s*wait/.test(source);
  assert.equal(legacy, false, "wait() does not exist on the legacy session group");
  assert.ok(/v2Client\(\)\s*\.\s*v2\s*\.\s*session\s*\.\s*wait/.test(source),
    "the idle barrier must call v2Client().v2.session.wait");
});

// ☠️ modeFor calls infoFor, which closes over the factory's client. Declared at
// module scope (0.4.8) it threw "infoFor is not defined" on every tool call in
// every child session -- and only a child, because modeFor returns early for any
// session with its own mode file, which the root always has. Importing the module
// stays green (the reference is evaluated on call, not on parse), so assert the
// declaration order in the source instead.
test("modeFor is declared inside the factory, below infoFor", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const factory = source.indexOf("export const OpencodeGuard");
  const infoFor = source.indexOf("const infoFor =");
  const modeFor = source.indexOf("const modeFor =");
  assert.ok(factory >= 0 && infoFor >= 0 && modeFor >= 0, "all three declarations must exist");
  assert.ok(infoFor > factory, "infoFor must stay inside the factory -- it needs v2Client");
  assert.ok(modeFor > infoFor, "modeFor must be declared after infoFor, inside the factory");
});
