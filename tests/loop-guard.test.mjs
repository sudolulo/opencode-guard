import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLoopGuard, createLoopGuardHook, loopGuardOptions, READ_ONLY_TOOLS } from "../lib/loop-guard.js";
import { createNotifier } from "../lib/notify.js";

const read = (guard, sessionID, file, output) =>
  guard.observe({ sessionID, tool: "read", args: { filePath: file }, output });

const hookWith = ({ loopGuard, parent }) => {
  const calls = [];
  const hook = createLoopGuardHook({
    guard: loopGuard,
    parentOf: async () => parent,
    notify: async (sessionID, text) => { calls.push(["notify", sessionID, text]); },
    abort: async (sessionID) => { calls.push(["abort", sessionID]); },
    onError: (error) => { calls.push(["error", String(error?.message ?? error)]); },
  });
  return { hook, calls };
};

const drive = async (hook, sessionID, times) => {
  let last;
  for (let i = 0; i < times; i += 1) {
    last = { title: "read", output: "identical output", metadata: {} };
    await hook.after({ tool: "read", sessionID, callID: `c${i}`, args: { filePath: "f.js" } }, last);
  }
  return last;
};

test("a rotation of sterile reads crosses warn at 12 and handback at 25", () => {
  const guard = createLoopGuard();
  const files = ["a.js", "b.js", "c.js"];
  const actions = [];
  for (let i = 0; i < 28; i += 1) actions.push(read(guard, "ses_loop", files[i % 3], `body of ${files[i % 3]}`));

  // The first three calls memoize; from there every call is a sterile repeat,
  // so the streak accumulates ACROSS the rotation. This is the case opencode's
  // built-in doom_loop cannot see, because no three consecutive calls match.
  for (let i = 0; i < 14; i += 1) assert.equal(actions[i], null, `call ${i} must stay silent`);
  assert.deepEqual(
    { type: actions[14].type, streak: actions[14].streak },
    { type: "warn", streak: 12 },
  );
  assert.equal(actions[26].type, "warn");
  assert.deepEqual(
    { type: actions[27].type, streak: actions[27].streak },
    { type: "handback", streak: 25 },
  );
});

test("a state-changing call resets the streak, so a working loop never trips", () => {
  const guard = createLoopGuard();
  for (let round = 0; round < 10; round += 1) {
    for (let i = 0; i < 11; i += 1) assert.equal(read(guard, "ses_work", "same.js", "same body"), null);
    assert.equal(guard.observe({ sessionID: "ses_work", tool: "edit", args: { filePath: "same.js" }, output: "ok" }), null);
  }
});

test("14 consecutive edits on one file stay silent even at the tightest thresholds", () => {
  // This is the real false positive that killed the previous design: a window
  // detector scored this legitimate editing burst WORSE than the actual loop.
  const guard = createLoopGuard({ warnAt: 1, handBackAt: 2 });
  assert.equal(READ_ONLY_TOOLS.has("edit"), false);
  for (let i = 0; i < 14; i += 1) {
    const action = guard.observe({
      sessionID: "ses_edit", tool: "edit",
      args: { filePath: "src/router.js", oldString: "a", newString: "b" },
      output: "edited",
    });
    assert.equal(action, null, `edit ${i} must stay silent`);
  }
});

test("a read whose output changes is never sterile", () => {
  const guard = createLoopGuard({ warnAt: 2, handBackAt: 3 });
  for (let i = 0; i < 40; i += 1) assert.equal(read(guard, "ses_tail", "log.txt", `lines: ${i}`), null);
});

test("argument key order does not change the signature, but a changed value does", () => {
  const guard = createLoopGuard({ warnAt: 1, handBackAt: 99 });
  assert.equal(guard.observe({ sessionID: "ses_args", tool: "grep", args: { a: 1, b: { c: 2, d: 3 } }, output: "hit" }), null);
  const repeat = guard.observe({ sessionID: "ses_args", tool: "grep", args: { b: { d: 3, c: 2 }, a: 1 }, output: "hit" });
  assert.deepEqual({ type: repeat.type, streak: repeat.streak }, { type: "warn", streak: 1 });
  assert.equal(guard.observe({ sessionID: "ses_args", tool: "grep", args: { a: 2, b: { c: 2, d: 3 } }, output: "hit" }), null);
});

test("cyclic and undefined arguments produce a signature instead of throwing", () => {
  const guard = createLoopGuard({ warnAt: 1, handBackAt: 99 });
  const cyclic = { name: "x", missing: undefined };
  cyclic.self = cyclic;
  assert.equal(guard.observe({ sessionID: "ses_cycle", tool: "bash", args: cyclic, output: "out" }), null);
  assert.equal(guard.observe({ sessionID: "ses_cycle", tool: "bash", args: cyclic, output: "out" }).type, "warn");
});

test("handback fires at most once per session", () => {
  const guard = createLoopGuard({ warnAt: 2, handBackAt: 3 });
  const actions = [];
  for (let i = 0; i < 20; i += 1) actions.push(read(guard, "ses_once", "f.js", "same"));
  assert.equal(actions.filter((action) => action?.type === "handback").length, 1);
});

test("the signature memo and the session table are both bounded", () => {
  const bounded = createLoopGuard({ warnAt: 1, handBackAt: 99, maxSignatures: 4 });
  for (const file of ["a", "b", "c", "d", "e"]) assert.equal(read(bounded, "ses_bound", file, `out-${file}`), null);
  // "a" was evicted by "e", so repeating it re-memoizes instead of counting.
  assert.equal(read(bounded, "ses_bound", "a", "out-a"), null);
  assert.equal(read(bounded, "ses_bound", "a", "out-a").type, "warn");

  const lru = createLoopGuard({ warnAt: 1, handBackAt: 99, maxSessions: 2 });
  read(lru, "ses_a", "f", "same");
  read(lru, "ses_b", "f", "same");
  read(lru, "ses_a", "f2", "same"); // refreshes ses_a, so ses_b is now oldest
  read(lru, "ses_c", "f", "same"); // evicts ses_b
  // Check the survivor FIRST: probing an evicted session re-admits it, which
  // would evict the survivor and make the second assertion lie.
  assert.equal(read(lru, "ses_a", "f", "same").type, "warn", "the refreshed session survived");
  assert.equal(read(lru, "ses_b", "f", "same"), null, "evicted session state is gone");
});

test("forget drops a session's state", () => {
  const guard = createLoopGuard({ warnAt: 1, handBackAt: 99 });
  read(guard, "ses_forget", "f", "same");
  assert.equal(read(guard, "ses_forget", "f", "same").type, "warn");
  guard.forget("ses_forget");
  assert.equal(read(guard, "ses_forget", "f", "same"), null);
});

test("a warning is appended to the tool result the looping agent reads next", async () => {
  const { hook, calls } = hookWith({ loopGuard: createLoopGuard({ warnAt: 2, handBackAt: 99 }), parent: "ses_parent" });
  const last = await drive(hook, "ses_child", 3);
  assert.match(last.output, /^identical output/);
  assert.match(last.output, /<loop-guard>/);
  assert.match(last.output, /IDENTICAL output 3 times/);
  assert.deepEqual(calls, [], "a warning never notifies or aborts");
});

test("handback notifies the parent with evidence, then aborts the child", async () => {
  const { hook, calls } = hookWith({ loopGuard: createLoopGuard({ warnAt: 2, handBackAt: 3 }), parent: "ses_parent" });
  const last = await drive(hook, "ses_child", 4);
  assert.match(last.output, /HANDBACK/);
  assert.deepEqual(calls.map(([kind]) => kind), ["notify", "abort"], "the parent learns why BEFORE the child dies");
  assert.equal(calls[0][1], "ses_parent");
  assert.match(calls[0][2], /ses_child/);
  assert.match(calls[0][2], /read/);
  assert.match(calls[0][2], /YOU decide/);
  assert.equal(calls[1][1], "ses_child");
});

test("a root session is escalated in text and NEVER aborted", async () => {
  const { hook, calls } = hookWith({ loopGuard: createLoopGuard({ warnAt: 2, handBackAt: 3 }), parent: null });
  const last = await drive(hook, "ses_root", 4);
  assert.match(last.output, /STOP\./);
  assert.doesNotMatch(last.output, /HANDBACK/);
  assert.deepEqual(calls, [], "a human is at the keyboard in a root session");
});

test("a guard failure never breaks the tool result", async () => {
  const exploding = { observe: () => { throw new Error("guard is broken"); }, forget: () => {} };
  const { hook, calls } = hookWith({ loopGuard: exploding, parent: "ses_parent" });
  const last = await drive(hook, "ses_child", 1);
  assert.equal(last.output, "identical output");
  assert.deepEqual(calls, [["error", "guard is broken"]], "the failure is reported, never thrown");
});

test("a disabled guard observes nothing", async () => {
  const { hook, calls } = hookWith({ loopGuard: null, parent: "ses_parent" });
  const last = await drive(hook, "ses_child", 40);
  assert.equal(last.output, "identical output");
  assert.deepEqual(calls, []);
});

test("forget drops a session's state through the hook", async () => {
  const guard = createLoopGuard({ warnAt: 1, handBackAt: 99 });
  const { hook } = hookWith({ loopGuard: guard, parent: "ses_parent" });
  read(guard, "ses_gone", "f", "same");
  assert.equal(read(guard, "ses_gone", "f", "same").type, "warn");
  hook.forget("ses_gone");
  assert.equal(read(guard, "ses_gone", "f", "same"), null);
});

test("loop guard options fall back to the calibrated defaults", () => {
  assert.deepEqual(loopGuardOptions(undefined), { enabled: true, warnAt: 12, handBackAt: 25 });
  assert.deepEqual(loopGuardOptions({ warnAt: 5, handBackAt: 9 }), { enabled: true, warnAt: 5, handBackAt: 9 });
  assert.deepEqual(loopGuardOptions({ enabled: false }), { enabled: false, warnAt: 12, handBackAt: 25 });
  assert.deepEqual(loopGuardOptions({ warnAt: -1, handBackAt: "9" }), { enabled: true, warnAt: 12, handBackAt: 25 },
    "garbage never disables the guard or sets a threshold of zero");
  assert.deepEqual(loopGuardOptions({ warnAt: 30 }), { enabled: true, warnAt: 30, handBackAt: 30 },
    "handback is never earlier than the warning");
  assert.equal(loopGuardOptions({ enabled: "no" }).enabled, true, "only an explicit false turns it off");
});

test("the notifier holds a message for a busy session until it goes idle", async () => {
  const sent = [];
  const client = { session: { prompt: async ({ path, body }) => { sent.push([path.id, body.parts[0].text]); } } };
  const notifier = createNotifier({ client, directory: "/work" });
  assert.equal(await notifier.notify("ses_idle", "now"), true, "an idle session is sent to at once");
  await notifier.onEvent({ type: "session.status", properties: { sessionID: "ses_busy", status: { type: "busy" } } });
  assert.equal(await notifier.notify("ses_busy", "later"), false);
  assert.deepEqual(sent, [["ses_idle", "now"]], "nothing is sent into a running turn");
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_busy" } });
  assert.deepEqual(sent, [["ses_idle", "now"], ["ses_busy", "later"]]);
  assert.equal(notifier.pendingCount(), 0);
});

test("the notifier queues a failed send and drops the queue with the session", async () => {
  let fail = true;
  const sent = [];
  const client = { session: { prompt: async ({ path, body }) => { if (fail) throw new Error("away"); sent.push([path.id, body.parts[0].text]); } } };
  const notifier = createNotifier({ client });
  assert.equal(await notifier.notify("ses_a", "one"), false);
  assert.equal(await notifier.notify("ses_b", "two"), false);
  assert.equal(notifier.pendingCount(), 2);
  await notifier.onEvent({ type: "session.deleted", properties: { info: { id: "ses_b" } } });
  fail = false;
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_a" } });
  assert.deepEqual(sent, [["ses_a", "one"]], "a deleted session's queue is dropped, not delivered");
  assert.equal(notifier.pendingCount(), 0);
});

// Wired through the real plugin: site config is read at import, so each case runs in
// a subprocess with a throwaway HOME.
const runPlugin = ({ config, calls }) => {
  const home = mkdtempSync(join(tmpdir(), "guard-loop-"));
  try {
    mkdirSync(join(home, ".config/opencode-guard"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode"), { recursive: true });
    if (config) writeFileSync(join(home, ".config/opencode-guard/config.json"), JSON.stringify(config));
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const client = { session: { get: async () => ({ data: {} }), abort: async () => {}, prompt: async () => {} } };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const outputs = [];
      for (let i = 0; i < ${calls}; i += 1) {
        const output = { title: "read", output: "same file body", metadata: {} };
        await hooks["tool.execute.after"]({ tool: "read", sessionID: "ses_root", callID: "c" + i, args: { filePath: "/work/a.js" } }, output);
        outputs.push(output.output);
      }
      console.log(JSON.stringify(outputs));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim().split("\n").at(-1));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

test("the plugin warns a session that keeps re-reading an unchanged file", () => {
  const outputs = runPlugin({ config: { loopGuard: { warnAt: 2, handBackAt: 3 } }, calls: 5 });
  assert.equal(outputs[0], "same file body");
  assert.equal(outputs[1], "same file body");
  assert.match(outputs[2], /<loop-guard>This read call has now returned IDENTICAL output 3 times/);
  assert.match(outputs[3], /<loop-guard>STOP\./, "a root session is escalated, never aborted");
});

test("loopGuard.enabled false in the site config turns the guard off", () => {
  const outputs = runPlugin({ config: { loopGuard: { enabled: false, warnAt: 1 } }, calls: 5 });
  assert.ok(outputs.every((text) => text === "same file body"));
});
