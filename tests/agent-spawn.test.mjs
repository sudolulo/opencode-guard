// A session delegates only to its own subagents; it never starts another OpenCode or agent
// session. These pin the runtime half of that rule (lib/agent-spawn.js): the marker every agent
// shell carries, an OpenCode process refusing to start under it, and the local session API.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import childProcess from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AGENT_SHELL_ENV, localSessionApiWrite } from "../lib/agent-spawn.js";
import { parser } from "../lib/bash-ast.js";

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

test("quoted Python stdin source with an at field is not treated as an at scheduler command", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const command = `python3 -I -S -B - <<'PY'
import json
record = json.loads('{"at":"2026-10-20T08:30:00Z","label":"café"}')
at = record.get('at')
by_date = {at[:10]: 1}
print(by_date)
PY`;

  assert.equal(agentSpawnRefusal(command), null);
});

test("quoted Python stdin source that writes to the local session API is refused", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  // This artificial shell fixture is inspected only; it is never executed.
  const quotedPythonStdin = `python3 - <<'PY'
import urllib.request
urllib.request.urlopen('http://127.0.0.1:4096/session', data=b'{}')
PY`;

  assert.equal(agentSpawnRefusal(quotedPythonStdin), "the local OpenCode server API");
});

test("quoted Python stdin delimiter variants are not treated as scheduler commands", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "python3 -I -S - <<'PY'\nrecord = {'at': 'noon'}\nat = record.get('at')\nPY",
    '/usr/bin/python3 -S -I - <<"PY"\nrecord = {"at": "noon"}\nat = record.get("at")\nPY',
    "python3.12 -I -S -B - <<\\PY\nrecord = {'at': 'noon'}\nat = record.get('at')\nPY",
    "snip python3 -I -S - <<-'PY'\n\t\trecord = {'at': 'noon'}\n\t\tat = record.get('at')\n\t\tPY",
  ]) assert.equal(agentSpawnRefusal(command), null, command);
});

test("fresh-environment routes and agent launches around quoted Python stdin remain refused", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const python = "python3 -I -S - <<'PY'\nrecord = {'at': 'noon'}\nat = record.get('at')\nPY";
  for (const [command, refusal] of [
    [`at now <<'SH'\necho queued\nSH\n${python}`, "a launcher that starts commands in a fresh environment (at, batch, systemd-run without --scope, ssh to this host)"],
    [`${python}\nbatch <<'SH'\necho queued\nSH`, "a launcher that starts commands in a fresh environment (at, batch, systemd-run without --scope, ssh to this host)"],
    [`systemd-run --user bash -c true\n${python}`, "a launcher that starts commands in a fresh environment (at, batch, systemd-run without --scope, ssh to this host)"],
    [`${python}\nssh code true`, "a launcher that starts commands in a fresh environment (at, batch, systemd-run without --scope, ssh to this host)"],
    [`opencode run before\n${python}`, "an OpenCode, oc-task, fleet-agent or claude -p launch"],
    [`${python}\noc-task after`, "an OpenCode, oc-task, fleet-agent or claude -p launch"],
  ]) assert.equal(agentSpawnRefusal(command), refusal, command);
});

test("shell heredocs and untrusted Python-like consumers retain conservative refusal", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "bash -s <<'SH'\nat now\nbatch\nopencode run x\nSH",
    "sudo python3 - <<'PY'\nrecord = {'at': 'noon'}\nat = record.get('at')\nPY",
    "env -i PATH=/usr/bin python3 - <<'PY'\nrecord = {'at': 'noon'}\nat = record.get('at')\nPY",
    "unknown-script-runner - <<'PY'\nrecord = {'at': 'noon'}\nat = record.get('at')\nPY",
  ]) assert.ok(agentSpawnRefusal(command), command);
});

test("Python shell and non-stdin modes retain conservative raw-text checks", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "sh - <<'SH'\nat = 'noon'\nSH",
    "python3 script.py <<'PY'\nat = 'noon'\nPY",
    "python3 -c 'print(1)' <<'PY'\nat = 'noon'\nPY",
    "python3 -m tool <<'PY'\nat = 'noon'\nPY",
  ]) assert.ok(agentSpawnRefusal(command), command);
});

test("malformed quoted Python heredocs retain conservative raw-text checks", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const command = "python3 - <<'PY'\nat = 'noon'";

  assert.ok(agentSpawnRefusal(command), command);
});

test("multiple quoted isolated Python programs validate each assignment without masking source", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const command = `python3 -I -S - <<'FIRST'
before = "café"
at = before
FIRST
python3 -I -S - <<'SECOND'
after = "λ"
at = after
SECOND`;

  assert.equal(agentSpawnRefusal(command), null);
});

test("Unicode before and inside quoted Python stdin source preserves body ranges", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const command = `printf 'café'
python3 -I -S - <<'PY'
label = "λ"
at = label
PY`;

  assert.equal(agentSpawnRefusal(command), null);
});

test("unquoted heredoc source containing a command substitution and an at command remains refused", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  // This artificial shell fixture is inspected only; it is never executed.
  const command = "bash -s <<EOF\n$(\nat now\n)\nEOF";

  assert.ok(agentSpawnRefusal(command), command);
});

test("quoted Python stdin with os.system scheduling an agent launch is refused", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  // This artificial shell fixture is inspected only; it is never executed.
  const quotedPythonStdin = `python3 -I -S - <<'PY'
import os
os.system('''
at now <<'SH'
opencode run x
SH
''')
PY`;

  assert.ok(agentSpawnRefusal(quotedPythonStdin), quotedPythonStdin);
});

test("quoted Python stdin with os.system assignment scheduling work is refused", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  // This artificial shell fixture is inspected only; it is never executed.
  const quotedPythonStdin = `python3 -I -S - <<'PY'
import os
at = os.system("at now < /tmp/guard-example.sh")
PY`;

  assert.ok(agentSpawnRefusal(quotedPythonStdin), quotedPythonStdin);
});

test("no-space Python at assignment still refuses an unsafe scheduling program", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const command = `python3 -I -S - <<'PY'
import os
at=os.system("at now < /tmp/guard-example.sh")
PY`;

  assert.ok(agentSpawnRefusal(command), command);
});

test("a non-BMP character before trusted Python source does not shift its source range", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const command = `printf '${String.fromCodePoint(0x10400)}'
python3 -I -S - <<'PY'
record = {'at': 'noon'}
at = record.get('at')
PY`;

  assert.equal(agentSpawnRefusal(command), null);
});

test("non-BMP data inside Python source preserves assignment ownership and the closing boundary", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const python = `python3 -I -S - <<'PY'\nlabel='${String.fromCodePoint(0x10400)}'\nat=label\nPY`;
  assert.equal(agentSpawnRefusal(python), null);
  assert.ok(agentSpawnRefusal(`${python}\nat now`));
});

test("faithful isolated routing reader is classified without executing the reader", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const reader = readFileSync(new URL("./issue9-routing-reader.py", import.meta.url), "utf8");
  assert.equal(agentSpawnRefusal(`python3 -I -S -B - <<'PY'\n${reader}\nPY`), null);
});

test("unisolated and unsupported Python assignments are explicitly unvalidated", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const header of [
    "python3 -", "python3 -I -", "python3 -S -", "python3 -B -",
    "PYTHONPATH=/artificial python3 -", "PYTHONPATH=/artificial python3 -I -S -",
    "snip PYTHONPATH=/artificial python3 -I -S -", "env python3 -I -S -",
    "sudo python3 -I -S -", "command python3 -I -S -", "python -I -S -",
    "python3 -I -S -u -", "python3 -I -S script.py", "python3 -I -S - extra",
  ]) {
    for (const assignment of ["at = 1", "at=1"]) {
      assert.match(agentSpawnRefusal(`${header} <<'PY'\n${assignment}\nPY`) ?? "", /unvalidated/i, header);
    }
  }
});

test("only a bare segment-leading at assignment can correct a scheduler match", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const line of [
    'batch; at = 1', 'batch # at = 1', 'sudo at now # at = 1', 'snip at now # at = 1',
    'at now # at = 1', 'at() # at = 1', 'at == 1 # at = 1',
  ]) {
    // These are string data in valid, safe Python, but raw launcher checks must remain intact.
    const source = `text = '''\n${line}\n'''\nat = 1`;
    assert.ok(agentSpawnRefusal(`python3 -I -S - <<'PY'\n${source}\nPY`), line);
    // The pre-repair recognizer only accepts unisolated headers; neither may hide raw commands.
    assert.ok(agentSpawnRefusal(`python3 - <<'PY'\n${source}\nPY`), line);
  }
});

test("no-space at assignment keeps the raw environment-dropping launcher signal", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  assert.ok(agentSpawnRefusal("python3 -I -S - <<'PY'\nat=1\ntext='oc-task queued'\nPY"));
  assert.equal(agentSpawnRefusal("python3 -I -S - <<'PY'\nat=1\nPY"), null);
});

test("unquoted expansion, malformed ownership and extra redirections never earn exemption", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "python3 -I -S - <<PY\ntext='$(at now)'\nat=1\nPY",
    "python3 -I -S - <<'PY'\nat=1",
    "python3 -I -S - <<'PY' </artificial/other.py\nat=1\nPY",
    "python3 -I -S - 3<<'PY'\nat=1\nPY",
    "python3 -I -S - <<'PY' <<'OTHER'\nat=1\nPY\nprint(1)\nOTHER",
  ]) assert.ok(agentSpawnRefusal(command), command);
});

test("isolated source preserves raw API and launcher text after non-BMP characters", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const lead = `printf '${String.fromCodePoint(0x10400)}'\n`;
  for (const source of [
    "at=1\ntext='oc-task queued'",
    "at=1\ntext='POST http://127.0.0.1:4096/session'",
  ]) assert.ok(agentSpawnRefusal(`${lead}python3 -I -S - <<'PY'\n${source}\nPY`));
  assert.ok(agentSpawnRefusal(`${lead}python3 -I -S - <<'PY'\nat=1\nPY\nat now`));
});

test("unavailable source checker produces a fixed refusal rather than allowing at assignments", () => {
  const moduleUrl = new URL("../lib/agent-spawn.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { agentSpawnRefusal } = await import(${JSON.stringify(moduleUrl)});
    process.stdout.write(JSON.stringify(agentSpawnRefusal("python3 -I -S - <<'PY'\\nat=1\\nPY")));
  `], { encoding: "utf8", env: { PATH: "" } });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout), "the trusted Python source checker is unavailable");
});

test("nested shell consumers cannot borrow a direct Python stdin exemption", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  // Parse-only fixtures: no shell or submitted Python is started by this test.
  for (const command of [
    "value=$(python3 -I -S - <<'PY'\nat=1\nprint('data')\nPY\n)",
    "(python3 -I -S - <<'PY'\nat=1\nPY\n)",
    "python3 -I -S - <<'PY' | sh\nat=1\nPY",
  ]) assert.ok(agentSpawnRefusal(command), command);
});

test("Python source indentation is not silently discarded by the shell parser", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "python3 -I -S - <<'PY'\n  at=1\nPY",
    "python3 -I -S - <<'PY'\n\tat=1\nPY",
    "python3 -I -S - <<-'PY'\n\t  at=1\n\tPY",
  ]) assert.ok(agentSpawnRefusal(command), command);
});

// tree-sitter closes a heredoc at a PREFIX of the delimiter after optional leading blanks;
// Bash closes it only at a line that is exactly the delimiter (<<- strips leading tabs, nothing
// else). Everything between the parser's early end and Bash's real end is Python that the
// checker would never see, so the exemption must follow Bash's rule and refuse on disagreement.
test("a document only Bash's exact delimiter line closes is never validated on the parser's shorter body", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  // Parse-only fixtures: inspected as strings, never executed by this test or by the checker.
  const tail = "import subprocess\nsubprocess.run(['true'])";
  for (const command of [
    `python3 -I -S - <<'pass'\nat = 1\npass \n${tail}\npass`,          // trailing blank after the word
    `python3 -I -S - <<'pass'\nat = 1\npass\r\n${tail}\npass`,         // CR before the LF
    `python3 -I -S - <<'pass'\nat = 1\npass; x\n${tail}\npass`,        // more text after the word
    `python3 -I -S - <<'PY'\nat = 1\nPY\t\n${tail}\nPY`,               // trailing tab
    `python3 -I -S - <<'PY'\nat = 1\n PY\n${tail}\nPY`,                // leading space under plain <<
    `python3 -I -S - <<'PY'\nat = 1\n\tPY\n${tail}\nPY`,               // leading tab under plain <<
    `python3 -I -S - <<-'PY'\n\tat = 1\n  PY\n${tail}\n\tPY`,          // leading spaces: <<- strips tabs only
    "python3 -I -S - <<'PY'\r\nat = 1\nPY",                            // CR in the opener line joins Bash's delimiter word
    "python3 -I -S - <<'PY'\nat = 1\n",                                 // no delimiter line at all
    "python3 -I -S - <<'PY'\nat = 1\nPY \n",                            // only a blank-padded delimiter before EOF
  ]) assert.match(agentSpawnRefusal(command) ?? "", /unvalidated/, JSON.stringify(command));
});

test("delimiter lines Bash accepts still earn the isolated Python exemption", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const command of [
    "python3 -I -S - <<'PY'\nat = 1\nprint(at)\nPY\n",                                 // closing line followed by LF
    "python3 -I -S - <<'PY'\nlabel = 'λ café'\nat = label\nPY",                        // Unicode body, delimiter at EOF without LF
    "python3 -I -S - <<-'PY'\n\t\t\tat = 1\n\t\t\tprint(at)\n\t\t\tPY",                // <<- with several closing tabs
    "python3 -I -S - <<-'PY'\n\tat = 1\nPY\n",                                          // <<- closing without tabs
    "python3 -I -S - <<'PY'\nnote = 'PY is the delimiter'\nat = 1\nPY",                // delimiter text inside a line
    "python3 -I -S - <<'PY'\ntext = '''\nhello PY\n  more PY text\n'''\nat = 1\nPY",   // triple-quoted lines
  ]) assert.equal(agentSpawnRefusal(command), null, JSON.stringify(command));
});

// Validation is a cost paid only by the ambiguity it resolves: no shell parse and no checker
// process unless a bare `at =` segment has to be attributed to a heredoc, and then only the
// heredoc that owns it. The spies below observe the live parser and child_process; the tested
// commands are strings and nothing in them is executed.
test("no shell parse or checker process runs unless a bare at assignment needs one", async (t) => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const parses = t.mock.method(parser, "parse");
  const spawns = t.mock.method(childProcess, "spawnSync");
  syncBuiltinESMExports();
  try {
    for (const [command, refusal] of [
      ["python3 -I -S - <<'PY'\nprint('no scheduler word here')\nPY", null],
      ["python3 -I -S - <<'PY'\nrecord = {'at': 'noon'}\nprint(record['at'])\nPY", null],
      ["opencode run x\npython3 -I -S - <<'PY'\nat = 1\nPY", "an OpenCode, oc-task, fleet-agent or claude -p launch"],
    ]) assert.equal(agentSpawnRefusal(command), refusal, command);
    assert.equal(parses.mock.callCount(), 0, "no shell parse without an ambiguous assignment");
    assert.equal(spawns.mock.callCount(), 0, "no checker process without an ambiguous assignment");
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("only the heredoc that owns the ambiguous assignment reaches the checker, once per command", async (t) => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  const spawns = t.mock.method(childProcess, "spawnSync");
  syncBuiltinESMExports();
  try {
    const command = [
      "python3 -I -S - <<'FIRST'", "print('no assignment')", "FIRST",
      "python3 -I -S - <<'SECOND'", "at = 1", "at = 2", "SECOND",
    ].join("\n");
    assert.equal(agentSpawnRefusal(command), null);
    assert.equal(spawns.mock.callCount(), 1, "one checker process for one owning body");
    assert.equal(spawns.mock.calls[0].arguments[2].input, "at = 1\nat = 2\n");
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("attribute and callback escapes stay refused through the isolated heredoc integration", async () => {
  const { agentSpawnRefusal } = await import("../lib/agent-spawn.js");
  for (const source of [
    'import os\nholder=os\nprint=holder.system\nat=print("at now < /tmp/guard-example.sh")',
    'import os\nimport json\nholder=os\njson.loads=holder.system\nat=json.loads("at now < /tmp/guard-example.sh")',
    'import os\nholder=os\nat=sorted(["at now < /tmp/guard-example.sh"], key=holder.system)',
    'import os\nholder=os\ndef f(x: holder.system("at now < /tmp/guard-example.sh")):\n return 1\nat=1',
  ]) assert.match(agentSpawnRefusal(`python3 -I -S - <<'PY'\n${source}\nPY`) ?? "", /unvalidated/);
});
