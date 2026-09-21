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
  const poll = cleanup.indexOf("client.session.status");
  const idle = cleanup.indexOf("sessionIdle(");
  const remove = cleanup.indexOf("client.session.delete");
  assert.ok(abort >= 0 && poll > abort && idle > poll && remove > idle,
    "classifier cleanup must abort, poll /session/status until idle, then delete");
});

// ☠️ Two generations of this test pinned a broken barrier. The first asserted
// `v2Client().session.wait`, which does not exist on the legacy group ("is not a
// function", 99 leaks). The second asserted `v2Client().v2.session.wait`, which exists
// but is an unimplemented stub on OpenCode 1.18 ("Session wait is not available yet",
// every delete deferred, every broker-lane classification leaked its session).
// Neither may come back.
test("the idle barrier is a status poll, never session.wait", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  assert.equal(/\.\s*session\s*\.\s*wait\s*\(/.test(source.replace(/^\s*\/\/.*$/gm, "")), false,
    "session.wait is a stub on OpenCode 1.18 and never clears");
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
