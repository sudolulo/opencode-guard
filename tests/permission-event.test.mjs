// The permission handler wired through the real plugin. Site files are read from
// $HOME, so each case runs in a subprocess with a throwaway HOME, a stubbed fetch
// standing in for the classifier endpoint, and a stub client recording replies.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const raise = ({ mode, command = "npm run build", permission = "bash", answer = "SAFE" }) => {
  const home = mkdtempSync(join(tmpdir(), "guard-permission-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".config/opencode/classifier.json"),
      JSON.stringify({ url: "http://classifier.invalid/v1/chat/completions" }));
    writeFileSync(join(home, ".local/share/opencode/modes/ses_a"), `${mode}\n`);
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const classified = [];
      globalThis.fetch = async (url, init) => {
        classified.push(JSON.parse(init.body).messages[1].content);
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ${JSON.stringify(answer)} } }] }) };
      };
      const replies = [];
      const client = {
        session: { get: async () => ({ data: {} }) },
        postSessionIdPermissionsPermissionId: async ({ body }) => { replies.push(body.response); return {}; },
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      await hooks.event({ event: { type: "permission.asked", properties: {
        id: "per_1", sessionID: "ses_a", permission: ${JSON.stringify(permission)},
        metadata: { command: ${JSON.stringify(command)} },
      } } });
      console.log(JSON.stringify({ classified, replies }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script],
      { env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim().split("\n").at(-1));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

// Regression: edits mode used to classify every shell command it was asked about,
// then prompt anyway, because edits never approves a shell command. The command
// text went to a model for a verdict nobody used.
test("edits mode never sends a shell command to the classifier", () => {
  const { classified, replies } = raise({ mode: "edits" });
  assert.deepEqual(classified, [], "no classifier call when a person will be asked");
  assert.deepEqual(replies, [], "the prompt is left for the person");
});

test("manual mode never sends a shell command to the classifier either", () => {
  const { classified, replies } = raise({ mode: "manual" });
  assert.deepEqual(classified, []);
  assert.deepEqual(replies, []);
});

test("edits mode still approves a file edit without asking the classifier", () => {
  const { classified, replies } = raise({ mode: "edits", permission: "edit", command: undefined });
  assert.deepEqual(classified, []);
  assert.deepEqual(replies, ["once"]);
});

test("auto mode asks the classifier and acts on its answer", () => {
  const safe = raise({ mode: "auto" });
  assert.deepEqual(safe.classified, ["cwd: /work\ncommand: npm run build"]);
  assert.deepEqual(safe.replies, ["once"]);
  const risky = raise({ mode: "auto", answer: "RISKY" });
  assert.equal(risky.classified.length, 1);
  assert.deepEqual(risky.replies, [], "not approved: the prompt stands");
});

test("auto mode settles a static read without a model call", () => {
  const { classified, replies } = raise({ mode: "auto", command: "git status" });
  assert.deepEqual(classified, []);
  assert.deepEqual(replies, ["once"]);
});
