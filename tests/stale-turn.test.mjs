// D0 wired through the real hook: the plugin reads fixed files under $HOME at import,
// so each case runs in a subprocess with a throwaway HOME.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = ({ status, level } = {}) => {
  const home = mkdtempSync(join(tmpdir(), "guard-stale-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode"), { recursive: true });
    if (level) writeFileSync(join(home, ".config/opencode/autoclass"), `${level}\n`);
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const statusCalls = [];
      const status = ${JSON.stringify(status ?? null)};
      const client = {
        session: {
          status: async (options) => {
            statusCalls.push(options?.query?.directory ?? null);
            if (status === "throw") throw new Error("server away");
            if (status === "error") return { error: { name: "Unknown" }, response: { status: 500 } };
            return { data: status };
          },
        },
        app: { log: async () => {} },
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      let outcome = "ran";
      try {
        await hooks["tool.execute.before"]({ tool: "read", sessionID: "ses_a", callID: "c1" }, { args: { filePath: "/work/README.md" } });
      } catch (error) { outcome = String(error?.message ?? error); }
      console.log(JSON.stringify({ outcome, statusCalls }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim().split("\n").at(-1));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

test("a tool call arriving after its turn ended is refused before it runs", () => {
  const result = run({ status: {} });
  assert.match(result.outcome, /turn was cancelled or has already ended/);
  assert.deepEqual(result.statusCalls, ["/work"], "status is read from this plugin's own instance");
});

test("a tool call in a running session is not touched by D0", () => {
  assert.equal(run({ status: { ses_a: { type: "busy" } } }).outcome, "ran");
});

test("a status read that fails never stalls a live session", () => {
  assert.equal(run({ status: "throw" }).outcome, "ran");
  assert.equal(run({ status: "error" }).outcome, "ran");
});

test("level off leaves D0 out like everything else", () => {
  const result = run({ status: {}, level: "off" });
  assert.equal(result.outcome, "ran");
  assert.deepEqual(result.statusCalls, [], "off means nothing from this plugin, including the status read");
});
