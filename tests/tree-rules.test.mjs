// The tree rules wired through the real plugin. The plugin reads fixed files under
// $HOME at import, so each case runs in a subprocess with a throwaway HOME and a
// fake legacy client holding a small session tree. The subprocess is attended:
// its command line holds no headless subcommand and no --auto.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// sessions: id -> parentID (null for a root). messages: root id -> its messages in
// the server's { info, parts } shape (one page, no cursor). modes: per-session mode
// files. steps, in order: { event } feeds the event hook; { permission, sessionID }
// raises permission.asked; { tool, sessionID, args } calls tool.execute.before.
const run = ({ sessions = {}, messages = {}, modes = {}, globalMode, level, getFails = false, countModeFileReads = false, steps }) => {
  const home = mkdtempSync(join(tmpdir(), "guard-tree-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    if (globalMode) writeFileSync(join(home, ".config/opencode/mode"), `${globalMode}\n`);
    if (level) writeFileSync(join(home, ".config/opencode/autoclass"), `${level}\n`);
    for (const [id, mode] of Object.entries(modes)) {
      writeFileSync(join(home, ".local/share/opencode/modes", id), `${mode}\n`);
    }
    const counter = join(home, "mode-read-counter.mjs");
    if (countModeFileReads) {
      writeFileSync(counter, `
        import fs from "node:fs";
        import { syncBuiltinESMExports } from "node:module";
        const originalReadFileSync = fs.readFileSync;
        globalThis.modeFileReads = 0;
        fs.readFileSync = function (path, ...args) {
          if (typeof path === "string" && path.startsWith(process.env.HOME + "/.local/share/opencode/modes/")) {
            globalThis.modeFileReads += 1;
          }
          return originalReadFileSync.call(this, path, ...args);
        };
        syncBuiltinESMExports();
      `);
    }
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const sessions = ${JSON.stringify(sessions)};
      const messages = ${JSON.stringify(messages)};
      const getFails = ${JSON.stringify(getFails)};
      const gets = [];
      const pages = [];
      const replies = [];
      const client = {
        session: {
          status: async () => ({ data: Object.fromEntries(Object.keys(sessions).map((id) => [id, { type: "busy" }])) }),
          get: async (options) => {
            const id = options?.path?.id;
            gets.push(id);
            if (getFails) throw new Error("server away");
            if (!Object.hasOwn(sessions, id)) {
              return { error: { name: "NotFoundError", data: { message: "Session not found: " + id } }, response: { status: 404 } };
            }
            return { data: { id, ...(sessions[id] ? { parentID: sessions[id] } : {}) }, response: { status: 200 } };
          },
          messages: async (options) => {
            pages.push({ id: options?.path?.id, query: options?.query });
            return { data: messages[options?.path?.id] ?? [], response: { status: 200, headers: new Headers() } };
          },
        },
        app: { log: async () => {} },
        postSessionIdPermissionsPermissionId: async ({ body }) => { replies.push(body.response); return {}; },
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const outcomes = [];
      for (const step of ${JSON.stringify(steps)}) {
        if (step.event) { await hooks.event({ event: step.event }); continue; }
        if (step.permission) {
          await hooks.event({ event: { type: "permission.asked", properties: {
            id: "per_" + outcomes.length, sessionID: step.sessionID, permission: step.permission,
            patterns: [], always: [], metadata: {},
          } } });
          outcomes.push("asked");
          continue;
        }
        try {
          await hooks["tool.execute.before"](
            { tool: step.tool, sessionID: step.sessionID, callID: "c" + outcomes.length },
            { args: step.args ?? {} },
          );
          outcomes.push("ran");
        } catch (error) { outcomes.push(String(error?.message ?? error)); }
      }
      console.log(JSON.stringify({ outcomes, gets, pages, replies, modeFileReads: globalThis.modeFileReads }));
    `;
    const args = countModeFileReads
      ? ["--import", pathToFileURL(counter).href, "--input-type=module", "-e", script]
      : ["--input-type=module", "-e", script];
    const child = spawnSync(process.execPath, args, {
      env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8", timeout: 20_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    return JSON.parse(child.stdout.trim().split("\n").at(-1));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

const CHAIN = { ses_root: null, ses_mid: "ses_root", ses_leaf: "ses_mid" };

test("G3: a grandchild never runs looser than the nearest ancestor that set a mode", () => {
  // An `edit` permission is approved ("once") in auto and edits, and left for the
  // person (no reply) in manual.
  const steps = [{ permission: "edit", sessionID: "ses_leaf" }];
  assert.deepEqual(run({ sessions: CHAIN, modes: { ses_root: "manual" }, globalMode: "auto", steps }).replies, [],
    "root manual, global auto: the grandchild stays manual (before 1.7.0 it read only ses_mid and ran auto)");
  assert.deepEqual(run({ sessions: CHAIN, modes: { ses_root: "auto" }, globalMode: "auto", steps }).replies, ["once"],
    "root auto, global auto: approved as before");
  assert.deepEqual(run({ sessions: CHAIN, modes: { ses_root: "auto" }, globalMode: "manual", steps }).replies, [],
    "global manual still holds, as before");
  assert.deepEqual(run({ sessions: CHAIN, modes: { ses_root: "manual", ses_mid: "auto" }, globalMode: "manual", steps }).replies,
    ["once"], "an intermediate session's own file is both the parent and the nearest ancestor");
});

test("G3: a session with its own mode file looks nothing up", () => {
  const result = run({ sessions: CHAIN, modes: { ses_root: "auto" },
    steps: [{ tool: "read", sessionID: "ses_root", args: { filePath: "/work/a" } }] });
  assert.deepEqual(result.outcomes, ["ran"]);
  assert.deepEqual(result.gets, []);
});

test("G3: one subagent tool call walks inherited mode files once", () => {
  const result = run({
    sessions: CHAIN,
    modes: { ses_root: "auto" },
    countModeFileReads: true,
    steps: [{ tool: "bash", sessionID: "ses_leaf", args: { command: "echo hello" } }],
  });
  assert.equal(result.modeFileReads, 4,
    "the leaf, its parent twice (parent and nearest), and root are read once for one ancestry walk");
});

test("G3: an ancestry that cannot be read denies the call, naming the rule", () => {
  const result = run({ sessions: CHAIN, getFails: true,
    steps: [{ tool: "read", sessionID: "ses_leaf", args: { filePath: "/work/a" } }] });
  assert.match(result.outcomes[0],
    /^\[opencode-guard\] denied \(G3, inherited permission mode\): the guard could not check this rule because a session lookup failed \(reading session ses_leaf failed: server away\)/);
});

test("G3: a failed lazy mode lookup still denies a subagent tool call", () => {
  const result = run({ sessions: CHAIN, getFails: true,
    steps: [{ tool: "bash", sessionID: "ses_leaf", args: { command: "echo hello" } }] });
  assert.match(result.outcomes[0],
    /^\[opencode-guard\] denied \(G3, inherited permission mode\): the guard could not check this rule because a session lookup failed/);
});

test("G3: in the permission handler an unresolvable mode leaves the prompt with the person", () => {
  const result = run({ sessions: CHAIN, modes: { ses_root: "auto" }, globalMode: "auto", getFails: true,
    steps: [{ permission: "edit", sessionID: "ses_leaf" }] });
  assert.deepEqual(result.outcomes, ["asked"], "the event hook did not throw");
  assert.deepEqual(result.replies, [], "neither approved nor rejected: either answer would be a guess");
});
// ---- G1, G2 and G4 through the hook.

// ses_mate: a teammate of ses_root; ses_helper: its helper; ses_fg: a foreground
// child of ses_root; ses_other: another root with its own child.
const TEAM = {
  ses_root: null, ses_mate: "ses_root", ses_helper: "ses_mate", ses_fg: "ses_root",
  ses_other: null, ses_otherkid: "ses_other",
};
const taskPartEvent = (n, root, child, { input = {}, metadata = {} } = {}) => ({
  type: "message.part.updated",
  properties: { sessionID: root, time: n, part: {
    id: `prt_${String(n).padStart(4, "0")}`, sessionID: root, messageID: `msg_${String(n).padStart(4, "0")}`,
    type: "tool", tool: "task", callID: `call_${n}`,
    state: {
      status: "running",
      input: { description: "d", prompt: "p", subagent_type: "build", ...input },
      metadata: { sessionId: child, ...metadata },
      time: { start: n },
    },
  } },
});
const spawnArgs = (extra = {}) => ({ description: "d", prompt: "p", subagent_type: "build", ...extra });

test("G1 holds in god mode: a subagent cannot resume its sibling", () => {
  const result = run({ sessions: TEAM, modes: { ses_mate: "god", ses_root: "god" }, steps: [
    { tool: "task", sessionID: "ses_mate", args: spawnArgs({ task_id: "ses_fg" }) },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ task_id: "ses_fg" }) },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ task_id: "ses_otherkid" }) },
  ] });
  assert.match(result.outcomes[0],
    /^\[opencode-guard\] denied \(G1, resume only your own child\): task_id ses_fg is not a child of this session/);
  assert.equal(result.outcomes[1], "ran", "the lead resumes its own child");
  assert.match(result.outcomes[2], /\(its parent is ses_other\)/);
});

test("G2 through the hook: an attended root may start a background task, a subagent may not", () => {
  const result = run({ sessions: TEAM, modes: { ses_root: "auto", ses_fg: "auto" }, steps: [
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ background: true }) },
    { tool: "task", sessionID: "ses_fg", args: spawnArgs({ background: true }) },
  ] });
  assert.equal(result.outcomes[0], "ran");
  assert.match(result.outcomes[1], /^\[opencode-guard\] denied \(G2, background teammates only from an attended root\)/);
});

test("G4 through the hook: an indexed teammate is refused workflow_run, and nothing reads history", () => {
  const result = run({ sessions: TEAM, modes: { ses_mate: "auto", ses_helper: "auto" }, steps: [
    { event: taskPartEvent(2, "ses_root", "ses_mate", { input: { background: true } }) },
    { tool: "workflow_run", sessionID: "ses_mate", args: { name: "review-panel" } },
    { tool: "bg_list", sessionID: "ses_helper", args: { all: true } },
    { tool: "read", sessionID: "ses_mate", args: { filePath: "/work/a" } },
  ] });
  assert.match(result.outcomes[0], /^\[opencode-guard\] denied \(G4, tools closed to agent teams\): `workflow_run`/);
  assert.match(result.outcomes[1], /`bg_list with all: true`/);
  assert.equal(result.outcomes[2], "ran");
  assert.deepEqual(result.pages, []);
});

test("G4 through the hook: a promoted task's child keeps every tool", () => {
  const result = run({ sessions: TEAM, modes: { ses_fg: "auto" }, steps: [
    { event: taskPartEvent(3, "ses_root", "ses_fg", { metadata: { background: true } }) },
    { tool: "schedule_prompt", sessionID: "ses_fg", args: { in_minutes: 5, text: "x" } },
  ] });
  assert.deepEqual(result.outcomes, ["ran"]);
});

test("G4 through the hook: an index miss is answered from the root's history", () => {
  const creating = taskPartEvent(2, "ses_root", "ses_mate", { input: { background: true } }).properties.part;
  const messages = { ses_root: [{ info: { id: "msg_0002", sessionID: "ses_root", role: "assistant" }, parts: [creating] }] };
  const result = run({ sessions: TEAM, messages, modes: { ses_mate: "auto" }, steps: [
    { tool: "peer_send", sessionID: "ses_mate", args: { to: "x", text: "hi" } },
  ] });
  assert.match(result.outcomes[0], /^\[opencode-guard\] denied \(G4, tools closed to agent teams\): `peer_send`/);
  assert.deepEqual(result.pages, [{ id: "ses_root", query: { directory: "/work", limit: 50 } }]);
});

test("level off leaves the tree rules out like everything else", () => {
  const result = run({ sessions: TEAM, level: "off", steps: [
    { tool: "task", sessionID: "ses_mate", args: spawnArgs({ task_id: "ses_fg" }) },
  ] });
  assert.deepEqual(result.outcomes, ["ran"]);
  assert.deepEqual(result.gets, [], "off means nothing from this plugin, including session lookups");
});
