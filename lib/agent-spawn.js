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
import { parser } from "./bash-ast.js";
import { checkPythonSource } from "./python-source-check.js";
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
const AT_ASSIGNMENT = /^([ \t]*)at[ \t]*=(?!=)/;
const PYTHON_BINARY = /^(?:\/(?:[A-Za-z0-9_.-]+\/)*)?python3(?:\.\d+)?$/;
// The whole delimiter word is one quoted unit (or a backslash-led identifier), so Bash does
// quote removal and nothing else: the delimiter is the literal text inside. Any other spelling
// (partial quotes, backslashes inside double quotes, expansions) is not decoded here at all.
const QUOTED_DELIMITER = /^(?:'([^'\r\n]+)'|"([^"\\\r\n]+)"|\\([A-Za-z_][A-Za-z0-9_]*))$/;
const quotedDelimiter = (word) => {
  const match = QUOTED_DELIMITER.exec(word);
  return match ? match[1] ?? match[2] ?? match[3] : null;
};
const isolatedPythonStdin = (header) => {
  // These are literal shell words only, not a general command-line parser. In
  // particular, assignments, wrappers, expansions and extra arguments fail closed.
  const words = header.trim().split(/[ \t]+/);
  if (words[0] === "snip") words.shift();
  if (!PYTHON_BINARY.test(words.shift() ?? "") || words.pop() !== "-") return false;
  return words.includes("-I") && words.includes("-S") &&
    words.every((word) => ["-I", "-S", "-B"].includes(word)) && new Set(words).size === words.length;
};

// Bash closes a here-document at the first physical line that IS the delimiter: under `<<` the
// line must equal it exactly; under `<<-` leading tabs (only tabs) are stripped first. A trailing
// blank, a CR, a semicolon, a space indent -- anything else -- makes the line body, not the end.
// The delimiter as the last line without a final LF still closes. No such line: the document
// runs to EOF and nothing about it is proven.
const bashHeredocClose = (command, bodyStart, delimiter, stripTabs) => {
  for (let lineStart = bodyStart; lineStart <= command.length;) {
    let lineEnd = command.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = command.length;
    const line = command.slice(lineStart, lineEnd);
    const tabs = stripTabs ? /^\t*/.exec(line)[0].length : 0;
    if (line.slice(tabs) === delimiter) return { lineStart, lineEnd, tabs };
    if (lineEnd === command.length) return null;
    lineStart = lineEnd + 1;
  }
  return null;
};

// One quoted heredoc fed directly to isolated Python, as `{ start, end, source }` in JS UTF-16
// units, or null when any part of it is not proven. -I AND -S are required on the actual
// invocation: otherwise cwd/PYTHONPATH/site hooks can replace the supposedly trusted stdlib.
// The header is checked on raw text (the parser drops a bare `-` before `<<` and treats body
// indentation as trivia). The end is found by Bash's own rule above -- the parser closes a
// document at a mere PREFIX of the delimiter after optional blanks, so its body can stop short of
// what Python actually reads -- and the parser must have closed at the very same line: if the two
// disagree, its view of every command after the document is wrong too, and the command stays
// under the raw checks. Restricted classification, not a Python/OS sandbox or permission grant.
const isolatedPythonBody = (command, redirect) => {
  const start = redirect.children.find((child) => child.type === "heredoc_start");
  const body = redirect.children.find((child) => child.type === "heredoc_body");
  const end = redirect.children.find((child) => child.type === "heredoc_end");
  const statement = redirect.parent;
  // Nested consumers, pipelines and shell compound commands are not direct invocations under
  // this restricted policy; their raw checks stay intact. No fd prefix, second redirect or
  // suffix command may change the owner of stdin.
  if (!start || !body || !end || statement?.type !== "redirected_statement" ||
      statement.parent?.type !== "program") return null;
  if (statement.descendantsOfType("heredoc_redirect").length !== 1 ||
      statement.descendantsOfType("file_redirect").length ||
      statement.descendantsOfType("herestring_redirect").length) return null;
  const delimiter = quotedDelimiter(start.text);
  const opener = command.slice(redirect.startIndex, start.startIndex);
  const headerEnd = command.indexOf("\n", start.endIndex);
  // Only blanks may follow the delimiter word on its line, and no CR anywhere on that line: a
  // CR is an ordinary character to Bash, so it would join the delimiter word or an argument.
  if (delimiter === null || !/^<<-?[ \t]*$/.test(opener) || headerEnd === -1 ||
      !/^[ \t]*$/.test(command.slice(start.endIndex, headerEnd)) ||
      command.slice(command.lastIndexOf("\n", statement.startIndex) + 1, headerEnd).includes("\r")) return null;
  const beforeRedirect = command.slice(statement.startIndex, redirect.startIndex).replace(/\s+$/, "");
  if (!isolatedPythonStdin(beforeRedirect)) return null;
  const stripTabs = opener.startsWith("<<-");
  const bodyStart = headerEnd + 1;
  const close = bashHeredocClose(command, bodyStart, delimiter, stripTabs);
  if (!close) return null;
  // Parser agreement: its body may omit only first-line blanks and, under <<-, the closing
  // line's tabs; its end node must be exactly the delimiter on Bash's closing line.
  const endStart = close.lineStart + close.tabs;
  if (body.startIndex < bodyStart || !/^[ \t]*$/.test(command.slice(bodyStart, body.startIndex)) ||
      command.slice(body.startIndex, body.endIndex) !== body.text ||
      (body.endIndex !== close.lineStart && body.endIndex !== endStart) ||
      end.startIndex !== endStart || end.endIndex !== close.lineEnd ||
      command.slice(end.startIndex, end.endIndex) !== delimiter) return null;
  // What Python reads: the raw lines between the header and the closing line; <<- strips every
  // leading tab from each of them, and nothing else is removed, restored or masked.
  const raw = command.slice(bodyStart, close.lineStart);
  return { start: bodyStart, end: close.lineStart, source: stripTabs ? raw.replace(/(^|\n)\t+/g, "$1") : raw };
};

// Descriptors only -- no checker process is started here.
const isolatedPythonBodies = (command) => {
  if (!parser) return [];
  let tree;
  try {
    tree = parser.parse(command);
    if (tree.rootNode.hasError) return [];
    const bodies = [];
    for (const redirect of tree.rootNode.descendantsOfType("heredoc_redirect")) {
      const body = isolatedPythonBody(command, redirect);
      if (body) bodies.push(body);
    }
    return bodies;
  } catch {
    return [];
  } finally {
    tree?.delete();
  }
};

// Rough segments: split on control operators, even inside quotes -- deliberately, so the
// payload of `tmux send-keys 'a; opencode run x'` is judged as a command of its own.
const roughSegments = (command) => {
  const result = [];
  const controls = /&&|\|\||[;|\n]/g;
  let start = 0;
  for (let match; (match = controls.exec(command)); start = match.index + match[0].length) {
    result.push({ text: command.slice(start, match.index), start });
  }
  result.push({ text: command.slice(start), start });
  return result;
};

export const agentSpawnRefusal = (command) => {
  if (typeof command !== "string" || !command) return null;
  if (localSessionApiWrite(command)) return "the local OpenCode server API";
  // Lazy on purpose: the shell parse happens on the first bare `at =` segment that needs
  // attributing, the checker process only for the document that owns it, and each distinct
  // source once per command. Commands without that ambiguity never pay for either.
  let bodies = null;
  const results = new Map();
  const owningResult = (from, to) => {
    bodies ??= isolatedPythonBodies(command);
    const body = bodies.find((candidate) => from >= candidate.start && to <= candidate.end);
    if (!body) return null;
    if (!results.has(body.source)) results.set(body.source, checkPythonSource(body.source));
    return results.get(body.source);
  };
  let dropsEnv = false;
  for (const { text: segment, start } of roughSegments(command)) {
    const assignment = AT_ASSIGNMENT.exec(segment);
    // Even `at=...` (no whitespace) retains the original raw launcher signal.
    dropsEnv ||= ENV_DROPPING.test(segment) || Boolean(assignment);
    if (TMUX_START.test(segment)) return "tmux on your own server (a new window, pane or keys run outside this session)";
    if (FRESH_ENV.test(segment)) {
      if (!assignment) return "a launcher that starts commands in a fresh environment (at, batch, systemd-run without --scope, ssh to this host)";
      // The only corrected spelling is Python's bare `at =` owned by a proven document;
      // `at(...)`, `at==` and all unowned source still take the fresh-environment refusal.
      const result = owningResult(start + assignment[1].length, start + assignment[0].length);
      if (result?.status === "unavailable") return "the trusted Python source checker is unavailable";
      if (result?.status !== "safe") return "an unvalidated Python at assignment (requires supported isolated stdin source and a successful source check)";
    }
    if (FIRST_WORD_LAUNCH(segment)) return "an OpenCode, oc-task, fleet-agent or claude -p launch";
  }
  if (dropsEnv && LAUNCHER.test(command)) return "an OpenCode, oc-task, fleet-agent or claude -p launch through a route that drops this session's environment";
  return null;
};
