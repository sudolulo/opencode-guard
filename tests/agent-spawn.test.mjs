// A session delegates only to its own subagents; it never starts another OpenCode or agent
// session. These pin the runtime half of that rule (lib/agent-spawn.js): the marker every agent
// shell carries, an OpenCode process refusing to start under it, and the local session API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_SHELL_ENV, localSessionApiWrite } from "../lib/agent-spawn.js";

const pluginUrl = new URL("../plugin.js", import.meta.url).href;

// Load the real plugin in a child process with a throwaway HOME, optionally under the marker.
const loadPlugin = (env, body) => {
  const home = mkdtempSync(join(tmpdir(), "guard-agent-spawn-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    const script = `
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client: {}, directory: process.env.HOME });
      ${body}
    `;
    return spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { PATH: process.env.PATH, HOME: home, ...env },
      encoding: "utf8",
    });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

test("an OpenCode process started from an agent shell refuses to start", () => {
  const child = loadPlugin({ [AGENT_SHELL_ENV]: "1" }, "console.log('loaded');");
  assert.equal(child.status, 78, child.stderr);
  assert.match(child.stderr, /never starts another OpenCode or agent session/);
  assert.doesNotMatch(child.stdout, /loaded/, "it stops before the process goes on");
});

test("every agent shell is marked; a PTY with no session is not", () => {
  const child = loadPlugin({}, `
    const agent = { env: {} };
    await hooks["shell.env"]({ cwd: "/", sessionID: "ses_a", callID: "call_1" }, agent);
    const pty = { env: {} };
    await hooks["shell.env"]({ cwd: "/" }, pty);
    console.log(JSON.stringify({ agent: agent.env, pty: pty.env }));
  `);
  assert.equal(child.status, 0, child.stderr);
  const { agent, pty } = JSON.parse(child.stdout.trim().split("\n").at(-1));
  assert.equal(agent[AGENT_SHELL_ENV], "1");
  assert.equal(pty[AGENT_SHELL_ENV], undefined, "a person's own terminal can still start OpenCode");
});

test("creating or prompting a session through the local server API is refused; reading is not", () => {
  for (const command of [
    "curl -X POST http://127.0.0.1:4096/session -d '{}'",
    "curl -s localhost:4096/session/ses_x/message --json '{\"parts\":[]}'",
    "python3 -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:4096/session', data=b'{}')\"",
    "node -e \"fetch('http://[::1]:4096/session/ses_x/prompt_async',{method:'POST'})\"",
  ]) assert.equal(localSessionApiWrite(command), true, command);
  for (const command of [
    "curl -s http://127.0.0.1:4096/session",            // a read
    "curl -X POST https://api.example.com/session -d x", // not the local server
    "grep -rn '127.0.0.1:4096/session' docs",           // text about it
  ]) assert.equal(localSessionApiWrite(command), false, command);
});

test("the session-API refusal holds in every guard mode, before any other check", () => {
  const child = loadPlugin({}, `
    try {
      await hooks["tool.execute.before"](
        { tool: "bash", sessionID: "ses_a", callID: "call_1" },
        { args: { command: "curl -X POST http://127.0.0.1:4096/session -d '{}'" } },
      );
      console.log("allowed");
    } catch (error) { console.log("refused: " + error.message); }
  `);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /refused: .*local OpenCode server API/);
});

// The marker cannot follow a command into a fresh environment (tmux, ssh to this host,
// systemd-run without --scope, at/batch, sudo/su, env -i), so those routes are judged by text.
// Text that only MENTIONS a launcher -- a commit message, a heredoc, a grep -- is not a launch.
test("launches through routes that drop the marker are refused; mentions are not", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "opencode run x", "OPENCODE_X=1 /home/dev/.local/bin/opencode run y", "snip oc-task \"q\"",
    "tmux send-keys -t main:1 \"opencode run go\" Enter", "tmux new-window \"bash /tmp/x.sh\"",
    "ssh code \"bash /tmp/x.sh\"", "ssh truenas \"oc-task q\"", "systemd-run --user bash /tmp/x.sh",
    "echo \"opencode run x\" | at now", "sudo -u dev opencode run x", "env -i PATH=/usr/bin opencode run x",
    "claude --model opus -p hi", "cd /x && fleet-agent nightly", "curl -X POST http://127.0.0.1:4096/session -d {}",
  ]) assert.ok(agentSpawnRefusal(command), command);
  for (const command of [
    "git commit -m \"Make oc-task delete its roots\"", "git commit -m \"run oc-task under tmux\"",
    "grep -rn \"opencode run\" .", "cat > NOTES.md <<EOF\n- `oc-task` hands work out\nEOF",
    "npm test", "TMUX= TMUX_TMPDIR=/tmp/t tmux new-session -d -s oc-alpha", "tmux -S /tmp/s new -d", "tmux ls",
    "systemd-run --user --scope -p MemoryMax=2G npm test", "ssh truenas midclt call system.info",
    "opencode session list --format json", "opencode --version", "sudo systemctl restart foo", "git log --grep=oc-task",
  ]) assert.equal(agentSpawnRefusal(command), null, command);
});
