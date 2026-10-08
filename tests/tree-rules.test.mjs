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

// sessions: id -> parentID (null for a root). messages: root id -> its messages in
// the server's { info, parts } shape (one page, no cursor). modes: per-session mode
// files. steps, in order: { event } feeds the event hook; { permission, sessionID }
// raises permission.asked; { tool, sessionID, args } calls tool.execute.before.
const run = ({ sessions = {}, messages = {}, modes = {}, globalMode, level, getFails = false, steps }) => {
  const home = mkdtempSync(join(tmpdir(), "guard-tree-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    if (globalMode) writeFileSync(join(home, ".config/opencode/mode"), `${globalMode}\n`);
    if (level) writeFileSync(join(home, ".config/opencode/autoclass"), `${level}\n`);
    for (const [id, mode] of Object.entries(modes)) {
      writeFileSync(join(home, ".local/share/opencode/modes", id), `${mode}\n`);
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
      console.log(JSON.stringify({ outcomes, gets, pages, replies }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
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

test("G3: an ancestry that cannot be read denies the call, naming the rule", () => {
  const result = run({ sessions: CHAIN, getFails: true,
    steps: [{ tool: "read", sessionID: "ses_leaf", args: { filePath: "/work/a" } }] });
  assert.match(result.outcomes[0],
    /^\[opencode-guard\] denied \(G3, inherited permission mode\): the guard could not check this rule because a session lookup failed \(reading session ses_leaf failed: server away\)/);
});

test("G3: in the permission handler an unresolvable mode leaves the prompt with the person", () => {
  const result = run({ sessions: CHAIN, modes: { ses_root: "auto" }, globalMode: "auto", getFails: true,
    steps: [{ permission: "edit", sessionID: "ses_leaf" }] });
  assert.deepEqual(result.outcomes, ["asked"], "the event hook did not throw");
  assert.deepEqual(result.replies, [], "neither approved nor rejected: either answer would be a guess");
});
