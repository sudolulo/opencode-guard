// ☠️ A SESSION NEVER STARTS ANOTHER SESSION. Work is delegated only to the session's own
// subagents (`task`, `workflow_run`). The bash permission rules deny the literal launchers, but
// a rule sees only the command text: `bash -c "opencode run ..."`, `nohup`, `timeout`, a script
// or a Python subprocess all walk past it. So every agent shell carries this marker (the
// shell.env hook below; bg_run's own launcher sets it too), it is inherited by everything that
// shell starts however indirectly, and an OpenCode process that finds it refuses to start
// (here, in the plugin every OpenCode process loads). oc-task, fleet-agent and Claude Code's
// prompt hook refuse on the same marker. A user's own terminal never carries it.
export const AGENT_SHELL_ENV = "OPENCODE_AGENT_SHELL";
export const AGENT_SPAWN_REFUSAL =
  "[opencode-guard] refused: this was started from an agent session's shell. A session delegates " +
  "work only to its own subagents (the task tool, workflow_run); it never starts another OpenCode " +
  "or agent session.";
// The local OpenCode server's session API is the same door without a binary: creating or
// prompting a session over HTTP from a shell. Any write-shaped call to a loopback `/session`
// route is refused.
const LOCAL_SESSION_API = /(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(?::\d+)?\/session\b/i;
const WRITE_SHAPED = /(?:-X\s*['"]?(?:POST|PUT|PATCH)|--data\b|--json\b|(?:^|\s)-d\s|(?:^|\s)-F\s|\bPOST\b|fetch\(|urlopen|requests\.(?:post|put)|http\.request)/i;
export const localSessionApiWrite = (command) =>
  typeof command === "string" && LOCAL_SESSION_API.test(command) && WRITE_SHAPED.test(command);

// The text half, for the routes the marker cannot follow. The marker rides the environment, so
// anything that runs in this shell's environment -- `bash -c`, nohup, timeout, xargs, a script, a
// Python subprocess -- is already refused at launch. What escapes it is a route that starts the
// command in a FRESH environment: tmux (new windows and sent keys run in the tmux server's
// environment), ssh back into this host, systemd-run without --scope, at/batch, sudo/su, env -i.
//   - Through such a route, a launcher named anywhere in the command is refused (the payload of
//     `tmux send-keys '...'` or `ssh code '...'`).
//   - tmux starting anything on the user's own server, at/batch, systemd-run without --scope and
//     ssh to this host are refused outright: a script handed to them could hold a launcher that
//     no text check sees.
// Text elsewhere is left alone on purpose -- a commit message or a heredoc that mentions oc-task
// is not a launch, and the marker covers anything that actually runs.
const LAUNCHER = /(?:^|[\s;&|('"`=])(?:[\w.~/-]*\/)?(?:opencode(?:-ai)?\s+(?:run|serve|attach|web|acp|tui|-p|--prompt)\b|oc-task(?=\s|$|['"`;)])|fleet-agent(?=\s|$|['"`;)])|claude\s+(?:\S+\s+)*?(?:-p|--print)\b)/;
// A launcher in command position: the segment's first word, after env assignments and `snip`.
const LAUNCHER_FIRST = /^\s*(?:snip\s+)?(?:\S+=\S*\s+)*(?:[\w.~/-]*\/)?(?:opencode(?:-ai)?|oc-task|fleet-agent|claude)(?:\s|$)/;
const FIRST_WORD_LAUNCH = (segment) => LAUNCHER_FIRST.test(segment) && LAUNCHER.test(` ${segment.trim().replace(/^snip\s+/, "").replace(/^(?:\S+=\S*\s+)*/, "")}`) ;
// In command position only, so a commit message that mentions tmux is not a route.
const ENV_DROPPING = /^\s*(?:snip\s+)?(?:\S+=\S*\s+)*(?:tmux|ssh|systemd-run|at|batch|sudo|su|doas|runuser|env\s+(?:-i|--ignore-environment))(?=\s|$)/;
// tmux on the user's own server (no private -S/-L socket, no TMUX_TMPDIR) starting something.
const TMUX_START = /^\s*(?:snip\s+)?(?:(?!TMUX_TMPDIR=)\S+=\S*\s+)*tmux\b(?![^\n]*\s-[SL]\s)[^\n]*?\s(?:new-session|new|new-window|neww|split-window|splitw|respawn-pane|respawnp|respawn-window|respawnw|send-keys|send|run-shell|run|display-popup|popup)\b/;
const FRESH_ENV = /^\s*(?:snip\s+)?(?:sudo\s+)?(?:at|batch)\b|^\s*(?:snip\s+)?(?:sudo\s+)?systemd-run\b(?![^\n]*--scope)|^\s*(?:snip\s+)?ssh\b[^\n]*\s(?:\S+@)?(?:localhost|127\.0\.0\.1|::1|code|192\.168\.10\.20)(?:\s|$)/;

// Rough segments: split on control operators, even inside quotes -- deliberately, so the
// payload of `tmux send-keys 'a; opencode run x'` is judged as a command of its own.
const segments = (command) => command.split(/&&|\|\||[;|\n]/);

export const agentSpawnRefusal = (command) => {
  if (typeof command !== "string" || !command) return null;
  if (localSessionApiWrite(command)) return "the local OpenCode server API";
  const dropsEnv = segments(command).some((segment) => ENV_DROPPING.test(segment));
  for (const segment of segments(command)) {
    if (TMUX_START.test(segment)) return "tmux on your own server (a new window, pane or keys run outside this session)";
    if (FRESH_ENV.test(segment)) return "a launcher that starts commands in a fresh environment (at, batch, systemd-run without --scope, ssh to this host)";
    if (FIRST_WORD_LAUNCH(segment)) return "an OpenCode, oc-task, fleet-agent or claude -p launch";
  }
  if (dropsEnv && LAUNCHER.test(command)) return "an OpenCode, oc-task, fleet-agent or claude -p launch through a route that drops this session's environment";
  return null;
};
