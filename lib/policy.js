// opencode-guard policy: the pure decision logic behind the opencode bash
// classifier, kept out of the plugin entry on purpose.
//
// opencode loads a plugin by calling every export as a Plugin function, and a
// module carrying ANY non-function export is dropped whole. So this cannot live
// beside the hooks as an exported `__policy` object, however convenient that would
// be; it was measured (a two-export probe never ran, a one-export probe did).
// The failure is logged -- `failed to load plugin ... Plugin export is not a
// function`, at ERROR level in ~/.local/share/opencode/log/opencode.log -- but
// nothing surfaces in the TUI, so the guard would appear to be running.
//
// The plugin imports this by relative path. That resolves against the REAL path
// of the plugin file -- so a bare-file symlink into ~/.config/opencode/plugin/
// resolves back into this checkout, where this file is.
//
// Site-specific policy -- extra credential patterns, credential advice, trusted
// ssh hosts -- comes from ~/.config/opencode-guard/config.json (see GUARD_CONFIG
// below); nothing in this file is specific to one machine.
//
// Tests: tests/policy.test.mjs, run with `node --test tests/*.test.mjs`.
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, posix, resolve } from "node:path";
import { parser, parserError } from "./bash-ast.js";

// How much of the safety floor runs. This is the escape hatch, not the everyday
// control -- that is the mode, below.
//   on      credential guard + cc-safety-net + the classifier (default)
//   static  credential guard + cc-safety-net only; no model call, so no GPU wait
//   off     nothing from this plugin; opencode's own globs are all that is left
// Older names are kept working so an existing flag file and muscle memory still
// land somewhere sensible: `full` and `auto` both meant "everything on".
const LEVELS = new Set(["off", "static", "on"]);
const normalizeLevel = (raw) => {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v === "strict") return "static";
  if (v === "full" || v === "auto") return "on";
  return LEVELS.has(v) ? v : "on";
};

// Is there a human who could answer a permission prompt for this session?
//
// opencode gives a plugin no session-mode field, but it does run the plugin in
// the main process -- even for the TUI, where the plugin loads in a Bun Worker
// that SHARES the process, so /proc/self/cmdline is the launch command line.
// process.argv is not enough on its own: in the TUI it reads
// ["bun", ".../cli/tui/worker.js"] with the real flags stripped (measured).
// Unreadable /proc, or any doubt, resolves to "unattended", which is the strict
// direction.
const HEADLESS_COMMANDS = new Set(["run", "serve", "acp", "github", "export", "import"]);
// The rule: unattended iff `--auto` appears anywhere OR ANY token after argv0
// is EXACTLY one of HEADLESS_COMMANDS. No flag-value parsing, no tie-breaks.
// Empty or non-array argv is unattended (the strict direction).
//
// (a) This is a strict superset of the old "first positional is a headless
//     subcommand" scanner: if the first non-dash token in tokens.slice(1) was
//     one of those names, that same token is still a bare token after argv0
//     and still fires. So nothing that used to resolve "unattended" can
//     resolve "attended" under it -- the direction that would be unsafe.
// (b) It is immune to flag-value parsing, including undeclared value-taking
//     flags. The old scanner needed a VALUE_FLAGS set and still mishandled
//     every flag it did not know about (--replay-limit was the trigger case;
//     any future flag has the same shape): the scanner took the flag's value
//     as the first positional and so hid a subcommand sitting one token
//     later. The new rule does not care which tokens are values of what --
//     if "run" appears, this is a run.
// (c) The only false positive is a TUI whose argv contains a bare token
//     spelled exactly like a headless subcommand: a model name, a session
//     title, or a positional path like `run` (not `/path/to/run`, which does
//     not match) that the user meant as a project directory. In guard that
//     means stricter permission handling for a session that was going to get
//     permission prompts anyway -- the intended direction when the signal is
//     ambiguous.
// (d) opencode-ntfy keeps a precise value-flag-aware parser on purpose. There
//     the cheap error is the opposite one: a TUI misclassified as headless
//     silently drops idle and error pushes, and the operator never hears
//     about it. The two packages diverge on the direction they prefer when
//     the argv is ambiguous.
const unattendedFrom = (tokens) => {
  if (!Array.isArray(tokens) || !tokens.length) return true;
  if (tokens.includes("--auto")) return true;
  for (let i = 1; i < tokens.length; i++) {
    if (HEADLESS_COMMANDS.has(tokens[i])) return true;
  }
  return false;
};
// ---------------------------------------------------------------------------
// Permission mode -- the everyday switch, the shape Claude Code has.
//
//   manual  ask about everything opencode would ask about
//   edits   file edits and reads go through; shell commands still ask
//   auto    everything goes through, EXCEPT a shell command the classifier will
//           not call SAFE, which is refused with a reason the agent can act on
//           (a plugin cannot turn a verdict into a prompt: the permission.ask
//           hook never fires on opencode 1.18)
//   god     everything runs, nothing asks, and the safety floor stands aside
//
// This is a separate axis from the autoclass level. The level decides how hard
// the safety floor pushes back; the mode decides how much gets waved through
// without asking. Tiers 1 and 2 throw in manual, edits and auto -- god is the
// one stated bypass, chosen by a person on a key labelled exactly that.
//
// God is PER SESSION AND ATTENDED ONLY. The key that turns it on is in front of
// a person, in one session, and that is the whole grant: an unattended run
// (opencode run / serve / --auto) keeps the floor whatever any flag file says --
// including a continued session whose per-session file says god, because
// `opencode run --session <id>` re-enters exactly such sessions headless. The
// global flag cannot hold it either: oc-mode refuses to write it, and a
// hand-written global "god" resolves to auto below -- the nearest mode that still
// has the floor.
//
// `question` is never auto-answered, god mode included: it is the agent asking
// the person something, and answering it for them is not a permission decision
// at all -- there is nothing to "run".
const MODES = new Set(["manual", "edits", "auto", "god"]);
const normalizeMode = (raw) => {
  const v = String(raw ?? "").trim().toLowerCase();
  return MODES.has(v) ? v : "manual";
};
// For a mode a session INHERITS rather than holds itself: the global flag file,
// or the parent of a delegated child. god is never inherited -- the key pressed
// in front of a person is the grant, and nobody pressed it on the child.
const normalizeGlobalMode = (raw) => {
  const m = normalizeMode(raw);
  return m === "god" ? "auto" : m;
};

// Mode precedence for one session: its own per-session mode file wins; a
// delegated child with no file of its own tracks its parent (capped above); only a
// session with neither falls to the global default.
// Measured 2026-09-18: a child fell STRAIGHT to that global default, which was
// `manual` -- the most restrictive mode. Every permission a subagent raised was
// therefore dropped on the operator, and its bash was never classified at all,
// because both the classifier path and the permission handler return early in
// manual mode.
const resolveSessionMode = ({ own, parent, fallback }) =>
  own ?? (parent ? normalizeGlobalMode(parent) : fallback);

// Permissions that only read or only touch files, i.e. everything `edits` covers.
const EDIT_PERMISSIONS = new Set(["edit", "read", "glob", "grep", "lsp"]);

// verdict is the classifier's answer for a bash permission: "SAFE", "RISKY", or
// null when it was not asked (the level forbids a model call, or the permission
// is not a shell command).
const shouldAutoApprove = ({ mode, permission, verdict }) => {
  if (!permission || permission === "question") return false;
  if (mode === "god") return true;
  if (mode === "manual") return false;
  if (EDIT_PERMISSIONS.has(permission)) return true;
  if (mode === "edits") return false;
  if (permission === "bash") return verdict === "SAFE";
  return true;
};

// Does this mode's answer to a shell permission depend on a classifier verdict?
// Only auto's does: manual and edits never approve a shell command, and god
// approves every one. The classifier must not be asked anywhere else -- a person
// is there to ask, and a verdict nobody uses still ships the command to a model.
const classifierDecides = (mode) => mode === "auto";

const isUnattended = (() => {
  try {
    return unattendedFrom(readFileSync("/proc/self/cmdline", "utf8").split("\0").filter(Boolean));
  } catch {
    return true;
  }
})();

const strip = (cmd) => {
  let c = String(cmd ?? "");
  if (c.startsWith("snip ")) c = c.slice(5);
  return c;
};

// ---------------------------------------------------------------------------
// Shell lexing
//
// The previous version split on /&&|\|\||;|\||&|\n/ over the raw string, which is
// quote-blind: `ssh nas "test -w X && echo yes || echo no"` became four nonsense
// fragments, one of them carrying an unbalanced quote, so nothing could ever match
// an allow rule and every such command paid for a model call. Quotes have to be
// honoured to say anything true about a command line.
// ---------------------------------------------------------------------------

// A redirect can reach outside the segment it sits in, so a segment containing one
// is never short-circuited -- except the two idioms that discard or merge output
// and write nothing, which is most of what a diagnostic command line is made of.
const REDIRECT_HARMLESS = /^(&[0-9-]+|\/dev\/null)$/;

const lex = (line) => {
  const segments = [];
  let tokens = [];
  let meta = false;
  // Output-redirect targets that are not harmless: what this segment writes to.
  let writes = [];
  let cur = "";
  let has = false;
  let start = 0;

  const endToken = () => { if (has) tokens.push(cur); cur = ""; has = false; };
  const endSegment = (end) => {
    endToken();
    if (tokens.length) segments.push({ raw: line.slice(start, end).trim(), tokens, meta, writes });
    tokens = [];
    meta = false;
    writes = [];
  };

  for (let i = 0; i < line.length; i++) {
    const c = line[i];

    if (c === "'") {
      has = true;
      i++;
      while (i < line.length && line[i] !== "'") cur += line[i++];
      continue;
    }
    if (c === '"') {
      has = true;
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\" && i + 1 < line.length) { cur += line[i + 1]; i += 2; continue; }
        // Command substitution still expands inside double quotes.
        if (line[i] === "`" || (line[i] === "$" && line[i + 1] === "(")) meta = true;
        cur += line[i++];
      }
      continue;
    }
    if (c === "\\") { if (i + 1 < line.length) { cur += line[++i]; has = true; } continue; }
    if (c === "`") { meta = true; cur += c; has = true; continue; }
    if (c === "$" && line[i + 1] === "(") { meta = true; cur += c; has = true; continue; }

    if (c === ">" || c === "<") {
      if (/^\d+$/.test(cur)) { cur = ""; has = false; }   // file-descriptor prefix, as in 2>
      endToken();
      let j = i;
      while (line[j + 1] === c) j++;                      // >>
      j++;
      if (c === ">" && line[j] === "|") j++;              // >| (write past noclobber)
      while (j < line.length && (line[j] === " " || line[j] === "\t")) j++;
      let target = "";
      const word = () => { while (j < line.length && !/[\s;&|<>]/.test(line[j])) target += line[j++]; };
      if (line[j] === "&") {
        // >&2 and >&- merge or close a descriptor; >&file (and >& file) writes a file.
        j++;
        let fd = "";
        while (j < line.length && /[0-9-]/.test(line[j])) fd += line[j++];
        if (fd) target = "&" + fd;
        else { while (j < line.length && (line[j] === " " || line[j] === "\t")) j++; word(); }
      } else word();
      if (!REDIRECT_HARMLESS.test(target)) {
        meta = true;
        if (c === ">") writes.push(target);
      }
      i = j - 1;
      continue;
    }

    // `&>file` and `&>>file` send stdout and stderr to a file: a redirect, not the
    // background `&` that ends a command. The `>` is handled on the next character.
    if (c === "&" && line[i + 1] === ">") { endToken(); continue; }
    if (c === "&" || c === "|" || c === ";" || c === "\n") {
      endSegment(i);
      while (i + 1 < line.length && "&|;\n".includes(line[i + 1])) i++;
      start = i + 1;
      continue;
    }
    if (c === " " || c === "\t") { endToken(); continue; }

    cur += c;
    has = true;
  }
  endSegment(line.length);
  return segments;
};

// ---------------------------------------------------------------------------
// Credential stores
//
// The credential guard is enforced by the plugin rather than by permission globs on
// purpose: an agent's or job's own `allow` block is appended AFTER the global rules
// and opencode takes the LAST match, so a `cat *` grant in any agent definition
// silently overrides a credential-path deny. The hook runs for every bash call and
// nothing downstream can reorder it.
// ---------------------------------------------------------------------------
// Two tiers of credential guard, split by what the permission system can stop.
//
// Hard: file paths that could match `cat *`/`ls *` allow rules. These always throw
// because opencode's permission globs take the LAST match, and an agent's `allow`
// block runs after the globals -- so a `cat *` grant silently overrides any deny.
// These live in the plugin rather than in deny globs for that reason, and stand
// aside only for attended god mode (the plugin's one stated bypass).
//
// Promptable: password-manager CLI reads, specific enough to never match a broad
// allow rule (rbw, bw, op, pass, gopass). These throw in unattended sessions (no one
// to ask) but in attended auto mode they return from tool.execute.before and let
// the command fall through to opencode's permission system, where `*` = `ask`
// prompts the user.
const HARD_CREDENTIAL_PATTERNS = [
  { re: /\.ssh\/id_/, root: ".ssh/id_" },
  { re: /\.aws\/credentials/, root: ".aws/credentials" },
  { re: /\.docker\/config\.json/, root: ".docker/config.json" },
  { re: /\bmcp-auth\.json/ },
  { re: /\.netrc\b/, root: ".netrc" },
  { re: /\.kube\/config/, root: ".kube/config" },
  { re: /\.gnupg\//, root: ".gnupg" },
  { re: /\/etc\/shadow/, root: "/etc/shadow" },
  { re: /\/etc\/sudoers/, root: "/etc/sudoers" },
];

const PROMPTABLE_CREDENTIAL_PATTERNS = [
  /\brbw\s+(get|unlock|export)/,
  /\bbw\s+(get|unlock|export)\b/,
  /\bop\s+(read|inject|item\s+get|document\s+get)\b/,
  /\b(pass|gopass)\s+(show|-c|--clip)\b/,
];

// Site-specific additions -- a deployment's own credential drop directories, a
// vault CLI, whatever it keeps secrets in. Loaded once from
// ~/.config/opencode-guard/config.json (or $OPENCODE_GUARD_CONFIG):
//   { "extraCredentialPatterns": [ { "pattern": "\\.config/my-secrets/", "root": ".config/my-secrets" } ],
//     "extraPromptableCredentialPatterns": [ "\\bvault\\s+kv\\s+get\\b" ],
//     "credentialAdvice": "one sentence telling the agent the sanctioned way to get a secret",
//     "trustedSshHosts": [ "gpu-box", "*.lan" ] }
// A malformed file or pattern changes nothing: the built-in floor above always
// stands, and extras can only ADD protection, never remove it.
//
// The package was called opencode-guardrails before 1.0.0. Its config path is
// still read when the new one is absent, because silently dropping a site's
// extra credential patterns on upgrade would be a fail-open.
const CONFIG_PATHS = process.env.OPENCODE_GUARD_CONFIG
  ? [process.env.OPENCODE_GUARD_CONFIG]
  : [
    join(homedir(), ".config/opencode-guard/config.json"),
    join(homedir(), ".config/opencode-guardrails/config.json"),
  ];
const GUARD_CONFIG = (() => {
  for (const path of CONFIG_PATHS) {
    let text;
    try { text = readFileSync(path, "utf8"); } catch { continue; }
    try { return JSON.parse(text) || {}; } catch { return {}; }
  }
  return {};
})();

const registerCredentialPatterns = (entries) => {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry?.pattern !== "string" || !entry.pattern) continue;
    try {
      HARD_CREDENTIAL_PATTERNS.push({
        re: new RegExp(entry.pattern),
        ...(typeof entry.root === "string" && entry.root ? { root: entry.root } : {}),
      });
    } catch { /* a bad regex must not take the floor down */ }
  }
};
registerCredentialPatterns(GUARD_CONFIG.extraCredentialPatterns);

const registerPromptablePatterns = (entries) => {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry !== "string" || !entry) continue;
    try { PROMPTABLE_CREDENTIAL_PATTERNS.push(new RegExp(entry)); } catch { /* same rule as above */ }
  }
};
registerPromptablePatterns(GUARD_CONFIG.extraPromptableCredentialPatterns);

// The parsed site config, for the parts of it that live outside this file (the
// loop guard's thresholds, for one).
const siteConfig = () => GUARD_CONFIG;

const credentialAdvice = () =>
  typeof GUARD_CONFIG.credentialAdvice === "string" && GUARD_CONFIG.credentialAdvice
    ? GUARD_CONFIG.credentialAdvice
    : "If the task genuinely needs the value, stop and ask the user to provide it through a secure channel.";

const touchesCredentials = (command) =>
  touchesHardCredentials(command) || touchesPromptableCredentials(command);
const touchesHardCredentials = (command) => HARD_CREDENTIAL_PATTERNS.some(({ re }) => re.test(command));
const touchesPromptableCredentials = (command) => PROMPTABLE_CREDENTIAL_PATTERNS.some((re) => re.test(command));

// Native file tools do not pass through shell parsing, so inspect the paths they
// will use before OpenCode expands a glob or reads a file. The roots are paired
// with the same hard patterns used above; they only identify a broad search base
// that could contain one of those protected paths.
const nativePath = (raw, directory) => {
  if (typeof raw !== "string" || !raw) return null;
  const expanded = raw === "~" || raw.startsWith("~/")
    ? join(homedir(), raw.slice(2))
    : raw;
  const absolute = isAbsolute(expanded) ? resolve(expanded) : resolve(directory ?? process.cwd(), expanded);
  const suffix = [];
  let prefix = absolute;
  // A glob or a not-yet-created leaf cannot be realpathed as a whole. Resolve its
  // deepest existing prefix instead, preserving the remaining components.
  while (true) {
    try { return join(realpathSync.native(prefix), ...suffix); }
    catch {
      const parent = dirname(prefix);
      if (parent === prefix) return absolute;
      suffix.unshift(basename(prefix));
      prefix = parent;
    }
  }
};
const nativePathIsHardCredential = (path) =>
  HARD_CREDENTIAL_PATTERNS.some(({ re }) => re.test(path));
const nativePathMayContainHardCredential = (path) =>
  HARD_CREDENTIAL_PATTERNS.some(({ root }) => {
    if (!root) return false;
    const protectedPath = root.startsWith("/") ? resolve(root) : resolve(homedir(), root);
    return path === protectedPath || protectedPath.startsWith(path + "/");
  });
const hasGlob = (value) => /[*?[\]{}]/.test(value);

// A glob only LISTS paths; unlike a read or a recursive grep it never opens a
// file. So a glob is a credential concern only when its PATTERN could actually
// enumerate a credential file -- not merely because its search base sits above
// one. `glob ~ **/*` reaches ~/.ssh/id_rsa; `glob ~ **/py_modules/x/cursor.py`
// cannot, and blocking it on base ancestry alone was a false positive.
//
// The resolved glob is compiled to an anchored regex (`**/` spans zero or more
// directories, `*` and `?` stay within one segment) and tested against concrete
// stand-ins for each protected path. `.ssh/id_` is a filename prefix, `.gnupg`
// a directory of secret files, `.aws/credentials` a whole file, so three shapes
// are tried per root to cover all of them. A pattern too exotic to compile is
// not blocked here -- a pattern that names a credential literally is already
// caught by nativePathIsHardCredential on the candidate above.
const globToRegex = (glob) => {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; re += "(?:[^/]*/)*"; }  // ** spans directories, zero or more
        else re += ".*";
      } else {
        re += "[^/]*";                                          // * stays within one path segment
      }
    } else if (c === "?") {
      re += "[^/]";
    } else {
      re += c.replace(/[.+^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(re + "$");
};
const hardCredentialRepresentatives = () => {
  const out = [];
  for (const { root } of HARD_CREDENTIAL_PATTERNS) {
    if (!root) continue;
    const protectedPath = root.startsWith("/") ? resolve(root) : resolve(homedir(), root);
    out.push(protectedPath, protectedPath + "x", protectedPath + "/secret");
  }
  return out;
};
const globCouldEnumerateHardCredential = (globPath) => {
  let re;
  try { re = globToRegex(globPath); } catch { return false; }
  return hardCredentialRepresentatives().some((p) => re.test(p));
};

const nativeToolTouchesHardCredentials = ({ tool, args, directory } = {}) => {
  if (!new Set(["read", "glob", "grep"]).has(tool)) return false;
  const pathArg = tool === "read" ? args?.filePath : args?.path;
  const base = nativePath(pathArg ?? directory, directory);
  if (base && nativePathIsHardCredential(base)) return true;

  if (tool === "glob") {
    const pattern = typeof args?.pattern === "string" ? args.pattern : "";
    const candidate = nativePath(pattern, base ?? directory);
    if (candidate && nativePathIsHardCredential(candidate)) return true;
    return Boolean(candidate && hasGlob(pattern) && globCouldEnumerateHardCredential(candidate));
  }

  // grep's pattern searches contents, while path names the search tree.
  return Boolean(tool === "grep" && base && nativePathMayContainHardCredential(base));
};

// This is deliberately separate from the path matcher: level=off and an attended
// per-session god mode are the only explicit bypasses, matching the shell floor.
const nativeCredentialGuardBlocks = ({ level, mode, unattended, ...input } = {}) =>
  level !== "off" && (unattended || mode !== "god") && nativeToolTouchesHardCredentials(input);

// ---------------------------------------------------------------------------
// The guard's own switches
//
// The mode, the level, the reveal deadline and the classifier config are plain
// files, re-read on every decision. An agent that could write them could lift its
// own floor: in auto mode a native `write` to ~/.config/opencode/autoclass raises
// an edit and an external_directory permission, and auto approves both. So a tool
// call that writes one is refused in every mode but god -- a person sets them, from
// a terminal (oc-mode, oc-auto, oc-reveal) or a TUI key. Like the reveal guard this
// stops a helpful model unblocking itself; a process set on reaching the files some
// way a path check cannot see is not stopped by it.
// The site config (~/.config/opencode-guard/config.json) is not on the list: it is
// read once at startup, so a write to it changes nothing until a person restarts
// opencode.
const CONTROL_FILES = [
  ".config/opencode/mode", ".config/opencode/autoclass", ".config/opencode/autoclass-model",
  ".config/opencode/reveal", ".config/opencode/classifier.json",
];
const CONTROL_DIRS = [".local/share/opencode/modes"];
const isControlPath = (path) => {
  const files = CONTROL_FILES.map((p) => nativePath(join(homedir(), p)));
  const dirs = CONTROL_DIRS.map((p) => nativePath(join(homedir(), p)));
  return files.includes(path) || dirs.some((dir) => path === dir || path.startsWith(dir + "/"));
};

// The paths a file-writing tool call will touch: `filePath` for write and edit, and
// every Add/Update/Delete/Move line of an apply_patch.
const WRITE_TOOLS = new Set(["write", "edit", "multiedit", "apply_patch", "patch"]);
const writeTargets = (tool, args) => {
  if (!WRITE_TOOLS.has(tool)) return [];
  const targets = [];
  if (typeof args?.filePath === "string" && args.filePath) targets.push(args.filePath);
  const patch = [args?.patchText, args?.patch].find((v) => typeof v === "string") ?? "";
  for (const m of patch.matchAll(/^\*\*\* (?:(?:Add|Update|Delete) File|Move to):[ \t]*(.+?)[ \t]*$/gm)) targets.push(m[1]);
  return targets;
};
const nativeToolWritesControlFile = ({ tool, args, directory } = {}) =>
  writeTargets(tool, args).some((target) => {
    const resolved = nativePath(target, directory);
    return Boolean(resolved) && isControlPath(resolved);
  });

// The shell side: a command that names one of those files and is not a static
// read. `cat ~/.config/opencode/mode` is fine; `echo off > ~/.config/opencode/autoclass`
// is not.
const CONTROL_PATH_TEXT =
  /\.config\/opencode\/(?:mode|autoclass(?:-model)?|reveal|classifier\.json)\b|\.local\/share\/opencode\/modes\b/;
const commandWritesControlFile = (command) =>
  CONTROL_PATH_TEXT.test(String(command ?? "")) && !commandIsRead(command);

// ---------------------------------------------------------------------------
// Read-only policy
// ---------------------------------------------------------------------------

// Deliberately NOT including sudo: `sudo ls` reads, but it also proves the command
// wanted privilege, and that is worth a look every time.
const WRAPPERS = new Set([
  "snip", "env", "time", "timeout", "nice", "ionice", "stdbuf", "nohup", "setsid",
  "command", "builtin",
]);

const commandIndex = (tokens) => {
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }        // VAR=value prefix
    if (!WRAPPERS.has(t.split("/").pop())) return i;
    i++;
    // a wrapper's own options, and timeout's duration
    while (i < tokens.length && (tokens[i].startsWith("-") || /^\d+(\.\d+)?[smhd]?$/.test(tokens[i]))) i++;
  }
  return -1;
};

// Verbs that only look. Anything that can write, install, or change machine state
// is absent on purpose and goes to tier 4.
//
// One notable absence: python3/node/perl/sh and friends -- `-c` makes them any
// command at all.
//
// `cd` is IN: it changes the shell's own directory and nothing else, and
// `cd repo && rg foo` is how most read-only command lines start.
//
// midclt (the TrueNAS middleware client) is IN, guarded to its read methods
// (GUARDS below). Its `app.config` / `*.query` methods can print live credentials,
// which kept it out while nothing scrubbed them; output redaction now does, in every
// mode, so the reads belong on the static path, deterministic and free.
const READ_ONLY = new Set([
  "cd", "ls", "cat", "bat", "head", "tail", "wc", "stat", "file", "du", "df", "tree",
  "pwd", "which", "type", "whereis", "date", "whoami", "id", "groups", "hostname",
  "uname", "uptime", "free", "nproc", "arch", "lsb_release",
  "echo", "printf", "true", "false", "test", "[", "seq", "yes",
  "basename", "dirname", "readlink", "realpath",
  "grep", "egrep", "fgrep", "rg", "ag", "fd", "locate", "diff", "cmp", "comm",
  "uniq", "cut", "tr", "column", "rev", "fold", "paste", "join", "nl", "expand",
  "jq", "yq", "xmllint", "od", "xxd", "strings", "hexdump",
  "md5sum", "sha1sum", "sha256sum", "sha512sum", "cksum",
  "ps", "pgrep", "pidof", "lsof", "ss", "netstat", "lsblk", "lspci", "lsusb",
  "dig", "host", "nslookup", "ping", "ping6", "traceroute", "mtr", "arp",
  "smartctl", "sensors", "dmesg", "journalctl",
  // More pure-inspection verbs, added to narrow the slice the classifier sees --
  // the Claude-parity move is to settle reads by rule, not by a model that can
  // flip on a borderline call. All read-only; `ip` and `mount` can also write, so
  // they are held to their reading forms by a GUARDS entry below.
  "nvidia-smi", "iostat", "vmstat", "mpstat", "w", "who", "last", "lastlog",
  "getent", "findmnt", "getfacl", "lsattr", "namei", "printenv",
  "locale", "tty", "hostnamectl", "timedatectl", "loginctl",
  "ip", "mount",
  // These read by default and are held to that by an entry in GUARDS below.
  // `exiftool` is NOT here: `-if '<perl>'` runs code and any `-TAG=value` writes.
  "find", "sed", "sort", "awk", "gawk", "curl", "midclt",
  "pdftotext", "identify", "ffprobe", "mediainfo",
]);

// Verbs whose read-only-ness depends on the subcommand.
const READ_ONLY_SUBCOMMANDS = {
  // `inspect` is deliberately absent from both: it prints a container's whole
  // environment block, which is where deployments commonly keep their tokens. It
  // goes to the classifier (or a prompt), not the static path.
  docker: new Set(["ps", "logs", "images", "stats", "version", "info",
    "top", "port", "diff", "history", "events", "system"]),
  podman: new Set(["ps", "logs", "images", "stats", "version", "info", "top", "port"]),
  systemctl: new Set(["status", "is-active", "is-enabled", "is-failed", "is-system-running",
    "show", "cat", "list-units", "list-unit-files", "list-timers", "list-sockets",
    "list-dependencies", "get-default"]),
  git: new Set(["status", "log", "show", "diff", "branch", "remote", "rev-parse", "describe",
    "blame", "shortlog", "reflog", "ls-files", "ls-remote", "ls-tree", "cat-file",
    "whatchanged", "count-objects", "check-ignore", "grep", "worktree", "config", "tag"]),
  zfs: new Set(["list", "get", "mount"]),
  zpool: new Set(["list", "status", "get", "iostat", "history"]),
  apt: new Set(["list", "show", "search", "policy"]),
  "apt-cache": new Set(["show", "search", "policy", "depends", "madison"]),
  pip: new Set(["list", "show", "freeze"]),
  pip3: new Set(["list", "show", "freeze"]),
  npm: new Set(["ls", "list", "view", "outdated"]),
  cargo: new Set(["build", "test", "check", "fmt", "clippy", "tree", "metadata"]),
  // kubectl/helm reads. `kubectl logs/get/describe/top` etc. only read; apply,
  // delete, edit, scale, exec, cp, patch, drain, rollout are absent on purpose.
  // ☠️ `exec` is NOT here: it runs an arbitrary command inside a pod.
  kubectl: new Set(["get", "describe", "logs", "top", "version", "cluster-info",
    "api-resources", "api-versions", "explain", "events"]),
  helm: new Set(["list", "ls", "status", "get", "history", "show", "search",
    "version", "env"]),
  systemd: new Set(["analyze"]),
  flatpak: new Set(["list", "info", "search", "remotes"]),
  brew: new Set(["list", "info", "search", "outdated", "config"]),
};

const RTK_GLOBAL_OPTIONS = new Set(["-v", "-vv", "-vvv", "--ultra-compact", "--skip-env"]);
const RTK_DIRECT_SUBCOMMANDS = new Set(["ls", "tree", "git", "grep", "rg", "wc", "find", "diff", "cargo", "docker", "kubectl", "curl"]);

// Argument helpers for GUARDS. A shell hands a program its arguments after quote
// removal, which is what lex() produces -- so `'--pre'` arrives here as `--pre`.
//
// clusterHas: does a short-option cluster (`-HX`, `-iO'cmd'`) contain one of
// `letters` before the first option that takes the rest of the cluster as its value?
// `fd -tx` is "type: executable", not -t and -x.
const clusterHas = (token, letters, valueLetters = "") => {
  if (!/^-[^-]/.test(token)) return false;
  for (const ch of token.slice(1)) {
    if (letters.includes(ch)) return true;
    if (valueLetters.includes(ch)) return false;
  }
  return false;
};
// The name of a long option, without its `=value`; null for anything else.
const longName = (token) => (token.startsWith("--") && token.length > 2 ? token.slice(2).split("=")[0] : null);
// Operands, skipping options and the separate values of `valueOptions`. A lone `-`
// (stdin/stdout) is an operand.
const operands = (tokens, valueOptions = new Set()) => {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const x = tokens[i];
    if (x === "--") { out.push(...tokens.slice(i + 1)); break; }
    if (x !== "-" && x.startsWith("-")) { if (valueOptions.has(x)) i++; continue; }
    out.push(x);
  }
  return out;
};

// git branch: listing is a read; any write flag, or a name without a list-mode
// option, creates/deletes/renames. git accepts any unambiguous prefix of a long
// option, so a long option is a write when it is a prefix of a write option (an
// ambiguous prefix is an error in git, so counting it as a write costs nothing).
const BRANCH_WRITE_LONG = ["delete", "move", "copy", "force", "set-upstream-to", "unset-upstream",
  "edit-description", "track", "no-track", "create-reflog", "recurse-submodules"];
const BRANCH_LIST_LONG = new Set(["list", "contains", "no-contains", "merged", "no-merged", "points-at", "show-current"]);
const BRANCH_REQUIRED_VALUE = new Set(["sort", "format", "points-at"]);
const BRANCH_OPTIONAL_VALUE = new Set(["contains", "no-contains", "merged", "no-merged"]);
const gitBranchIsRead = (rest) => {
  let listMode = false;
  let named = false;
  for (let i = 0; i < rest.length; i++) {
    const x = rest[i];
    const name = longName(x);
    if (name !== null) {
      if (BRANCH_WRITE_LONG.some((w) => w.startsWith(name))) return false;
      if (BRANCH_LIST_LONG.has(name)) listMode = true;
      if (!x.includes("=")) {
        if (BRANCH_REQUIRED_VALUE.has(name)) i++;
        else if (BRANCH_OPTIONAL_VALUE.has(name) && rest[i + 1] !== undefined && !rest[i + 1].startsWith("-")) i++;
      }
      continue;
    }
    if (/^-[A-Za-z]+$/.test(x)) {
      if (/[dDmMcCfut]/.test(x.slice(1))) return false;
      if (x.includes("l")) listMode = true;
      continue;
    }
    if (x === "--") { named = named || i + 1 < rest.length; break; }
    named = true;
  }
  return !named || listMode;
};

// sed reads only when every script is a known read-only shape: an address range and
// p/=/d/l/n/N/q/Q, or s/// with only g/p/i/I/number flags. Its `w`/`W` commands and
// the `w` flag write files, `e` and the `e` flag run commands, `r`/`R` read
// arbitrary files into the output, -i edits in place (and --in, --in-p ... are
// accepted getopt_long prefixes of --in-place), -f reads a script we cannot see.
const SED_ADDR = String.raw`(?:\d+(?:~\d+)?|\$|\/(?:[^\/\\]|\\.)*\/[IM]*)`;
const SED_CMD = String.raw`(?:[p=dlnNqQ]\d*|s(.)(?:(?!\1)[^\\]|\\.)*\1(?:(?!\1)[^\\]|\\.)*\1[gpiI0-9]*)`;
const SED_PART = new RegExp(`^\\s*(?:${SED_ADDR}(?:\\s*,\\s*${SED_ADDR})?\\s*!?)?\\s*${SED_CMD}\\s*$`);
const SED_READ_OPTIONS = new Set(["-n", "--quiet", "--silent", "-E", "-r", "--regexp-extended", "-s",
  "--separate", "-u", "--unbuffered", "-z", "--null-data", "--posix", "--sandbox", "--debug"]);
const sedIsRead = (t) => {
  const scripts = [];
  const operandsLeft = [];
  for (let i = 0; i < t.length; i++) {
    const x = t[i];
    if (x === "-e" || x === "--expression") { if (t[i + 1] === undefined) return false; scripts.push(t[++i]); continue; }
    if (x.startsWith("--expression=")) { scripts.push(x.slice("--expression=".length)); continue; }
    if (/^-e./.test(x)) { scripts.push(x.slice(2)); continue; }
    if (x === "--") { operandsLeft.push(...t.slice(i + 1)); break; }
    if (x.startsWith("-") && x !== "-") {
      if (SED_READ_OPTIONS.has(x)) continue;
      if (/^-[nErsuz]+$/.test(x)) continue;                    // clusters of read-only short flags
      return false;                                            // -i, -f, --in..., anything unknown
    }
    operandsLeft.push(x);
  }
  if (!scripts.length) { if (!operandsLeft.length) return false; scripts.push(operandsLeft[0]); }
  return scripts.every((script) => script.split(/[;\n]/).every((part) => part.trim() === "" || SED_PART.test(part)));
};

// Per-verb guards: the verb reads by default but one flag turns it into a writer.
const GUARDS = {
  // -x/-X run a command per result; the short options listed second take the rest
  // of a cluster as their value (fd -tx is --type x).
  fd: (t) => !t.some((x) => clusterHas(x, "xX", "dteEjSco") || /^--exec(-batch)?(=|$)/.test(x)),
  // --pre runs a preprocessor per file; --hostname-bin runs a program for hyperlinks.
  // rg does not accept abbreviated long options (measured: `--pr` is unrecognized).
  rg: (t) => !t.some((x) => /^--(pre|hostname-bin)(=|$)/.test(x)),
  tree: (t) => !t.some((x) => /^-[^-]*o/.test(x)),                         // -o FILE writes
  uniq: (t) => operands(t, new Set(["-f", "-s", "-w"])).length <= 1,       // uniq IN OUT writes OUT
  xxd: (t) => !t.some((x) => x.startsWith("-r")) &&                       // -r reverts hex to binary
    operands(t, new Set(["-c", "-cols", "-g", "-groupsize", "-l", "-len", "-n", "-name",
      "-o", "-offset", "-s", "-seek", "-R"])).length <= 1,                 // xxd IN OUT writes OUT
  // pdftotext writes FILE.txt unless the output operand is `-` (stdout).
  pdftotext: (t) => {
    const ops = operands(t, new Set(["-f", "-l", "-r", "-x", "-y", "-W", "-H", "-fixed", "-enc", "-eol",
      "-colspacing", "-opw", "-upw"]));
    return ops.length === 2 && ops[1] === "-";
  },
  // -i writes in place; -s/--split-exp writes one file per result, named by an expression.
  yq: (t) => !t.some((x) => x === "--inplace" || x.startsWith("--inplace=") || clusterHas(x, "is", "Iop") ||
    /^--split-exp(=|$)/.test(x)),
  mediainfo: (t) => !t.some((x) => /^--logfile(=|$)/i.test(x)),
  xmllint: (t) => !t.some((x) => x === "-o" || x === "--output" || x.startsWith("--output=")),
  bat: (t) => !t.some((x) => /^--pager(=|$)/.test(x)),
  // ag parses long options with getopt_long, so any unique prefix (--pag) works.
  ag: (t) => !t.some((x) => { const n = longName(x); return n !== null && n.length >= 3 && "pager".startsWith(n); }),
  find: (t) => !t.some((x) => /^-(exec|execdir|ok|okdir|delete|fls|fprint|fprintf)$/.test(x)),
  sed: sedIsRead,
  // -o FILE (also in a cluster, -rof) and --output (any getopt_long prefix) write.
  sort: (t) => !t.some((x) => clusterHas(x, "o", "kStT") ||
    (longName(x) !== null && "output".startsWith(longName(x)))),
  // awk can write and can shell out from inside its program text, and the program
  // arrives as one opaque quoted token, so refuse anything that looks like either.
  awk: (t) => !t.some((x) => x.includes(">") || x.includes("system(") || x.includes("|")),
  gawk: (t) => !t.some((x) => x.includes(">") || x.includes("system(") || x.includes("|")),
  // A GET reads. Anything that sends a body, uploads, saves to a file, dumps
  // headers to a file, or picks its own method could do anything, so it goes to
  // tier 4. Matched as PREFIXES, not whole tokens: curl accepts joined
  // (`-XPOST`, `-o/tmp/f`, `--data=x`) and bundled (`-sSLo out`) spellings, and
  // the earlier exact-match version waved `curl -XPOST` through as a static read.
  curl: (t) => !t.some((x) => /^-[A-Za-z]*[cdDFTOoXKJ]/.test(x) ||
    /^--(data|form|upload-file|output|remote-name|remote-header-name|request|create-dirs|config|json|dump-header|cookie-jar)/.test(x)),
  // TrueNAS middleware reads only, by method suffix. Everything else -- app.start,
  // service.restart, system.reboot, pool/disk/update methods -- goes to the
  // classifier. `app.config` and `*.query` DO print live secrets; that is
  // redaction's job, not a reason to pay a model call per read.
  midclt: (t) => {
    const i = t.findIndex((x) => !x.startsWith("-"));
    if (t[i] !== "call") return false;
    // Read methods settle statically so they never reach a non-deterministic
    // classifier -- a measured flake denied app.rollback_versions and
    // core.get_methods, both pure reads, on some passes and not others. Matched by
    // suffix: every `get_*` method is a read by TrueNAS convention (get_instance,
    // get_methods, get_jobs, ...), plus the explicit read verbs. Writers
    // (start/stop/update/delete/create/rollback/reboot/set_*) are absent.
    // `rollback_versions` (lists versions) is a read; bare `rollback` (reverts an
    // app) is not, so the suffix is anchored.
    return /\.(query|config|info|choices|versions?|state|ping|list|stats|rollback_versions|get_[a-z_]+)$/
      .test(t[i + 1] ?? "");
  },
  journalctl: (t) => !t.some((x) => /^--(vacuum-.*|rotate|flush|sync|relinquish-var|setup-keys)$/.test(x)),
  dmesg: (t) => !t.some((x) => /^(-C|--clear|-c|--read-clear)$/.test(x)),
  // `ip <object> show|get|list` reads; add/del/set/flush/change/replace mutate.
  ip: (t) => !t.some((x) => /^(add|del|delete|set|flush|change|replace|append|up|down)$/.test(x)),
  // kubectl get/describe read -- EXCEPT of a Secret, which prints credential
  // material (base64 under data:); that is redaction's blind spot and stays a
  // classifier/prompt decision, matching `docker inspect` and midclt secrets.
  kubectl: (t) => {
    const verb = t.find((x) => !x.startsWith("-"));
    const resource = t.filter((x) => !x.startsWith("-"))[1] ?? "";
    if ((verb === "get" || verb === "describe") && /^secrets?(\..*)?$/.test(resource)) return false;
    return true;
  },
  // Bare `mount` (or with only flags) lists mounts; any positional or -a mounts.
  mount: (t) => !t.some((x) => x === "-a" || x === "--all" || !x.startsWith("-")),
  smartctl: (t) => !t.some((x) => /^(-t|--test|--set.*)$/.test(x)),
  git: (t) => {
    // The read-only subcommand list above lets `branch`, `config`, `worktree` and
    // `tag` through because listing is what they are used for here; their writing
    // forms take an argument or a flag that says so.
    const i = t.findIndex((x) => !x.startsWith("-"));
    const sub = t[i];
    const rest = t.slice(i + 1);
    if (sub === "branch") return gitBranchIsRead(rest);
    if (sub === "config") return rest.some((x) => x === "--get" || x === "--get-all" || x === "--list" || x === "-l");
    if (sub === "worktree") return rest[0] === "list";
    if (sub === "tag") return rest.every((x) => x.startsWith("-")) || rest.some((x) => x === "-l" || x === "--list");
    if (sub === "remote") {
      // `git remote -v set-url ...` writes: -v is a listing flag only when nothing follows.
      let r = rest;
      while (r[0] === "-v" || r[0] === "--verbose") r = r.slice(1);
      return r.length === 0 || r[0] === "show" || r[0] === "get-url";
    }
    // -O/--open-files-in-pager runs a pager command over the matched files.
    if (sub === "grep") {
      return !rest.some((x) => clusterHas(x, "O", "efABCm") ||
        (longName(x) !== null && longName(x).length >= 2 && "open-files-in-pager".startsWith(longName(x))));
    }
    // --upload-pack runs a program; ls-remote's only long option starting with u.
    if (sub === "ls-remote") {
      return !rest.some((x) => { const n = longName(x); return n !== null && n.length >= 1 && "upload-pack".startsWith(n); });
    }
    // --output writes any file; --ext-diff runs an external diff program.
    if (["diff", "log", "show", "whatchanged"].includes(sub)) {
      return !rest.some((x) => x === "--output" || x.startsWith("--output=") || x === "--ext-diff");
    }
    return true;
  },
  docker: (t) => {
    const i = t.findIndex((x) => !x.startsWith("-"));
    if (t[i] === "system") return ["info", "df", "events"].includes(t[i + 1]);
    return true;
  },
};

// ssh options that take a separate argument, and the ones that set up forwarding
// rather than running a command.
const SSH_OPT_WITH_ARG = new Set(["-b", "-c", "-D", "-E", "-e", "-F", "-I", "-i", "-J",
  "-L", "-l", "-m", "-O", "-o", "-p", "-Q", "-R", "-S", "-W", "-w"]);
const SSH_FORWARDING = new Set(["-D", "-L", "-R", "-W", "-w"]);

// `ssh <host> "<command>"` is routine on a machine that administers others, and
// the remoteness of a command says nothing about what it does. So for a host the
// site has declared trusted, pull the payload out and judge it by exactly the same
// rules as a local command. Any other host is not settled statically: the command
// goes to the classifier, or to a person, like any other unrecognised command.
//
// The host is the destination token as written, minus any `user@` and, for the
// `ssh://` form, the port. A `Host` alias from ~/.ssh/config is matched by its
// alias, since that is all this function can see.
const sshHostName = (token) => {
  let host = String(token ?? "");
  const url = host.startsWith("ssh://");
  if (url) host = host.slice("ssh://".length).split("/")[0];
  host = host.slice(host.lastIndexOf("@") + 1);
  if (url) host = host.replace(/:\d+$/, "");
  return host.toLowerCase();
};

const sshTarget = (tokens, start) => {
  let i = start + 1;
  while (i < tokens.length && tokens[i].startsWith("-")) {
    if (SSH_FORWARDING.has(tokens[i])) return null;
    if (SSH_OPT_WITH_ARG.has(tokens[i])) i += 2; else i++;
  }
  if (i >= tokens.length) return null;          // no host
  const host = sshHostName(tokens[i]);
  i++;
  if (tokens[i] === "--") i++;
  const rest = tokens.slice(i);
  // A bare `ssh host` opens an interactive shell: there is no payload to judge.
  return { host, payload: rest.length ? rest.join(" ") : null };
};
const sshPayload = (tokens, start) => sshTarget(tokens, start)?.payload ?? null;

const globToRe = (g) =>
  new RegExp("^" + g.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");

// Hosts whose ssh payloads are judged statically. Empty by default: no remote host
// is trusted until the site says so. `*` wildcards match any run of characters, so
// `["*"]` trusts every host and `["*.lan"]` a whole domain.
const TRUSTED_SSH_HOSTS = [];
const trustSshHosts = (entries) => {
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    TRUSTED_SSH_HOSTS.push(globToRe(entry.trim().toLowerCase()));
  }
};
trustSshHosts(GUARD_CONFIG.trustedSshHosts);
const sshHostTrusted = (host) =>
  typeof host === "string" && host !== "" && TRUSTED_SSH_HOSTS.some((re) => re.test(host));

// Commands the config already allows are settled policy, so asking the model about
// them again is pure latency -- and this hook runs for every bash call, including
// the ones the permission layer never prompts for.
// JSONC as opencode parses it (jsonc-parser, allowTrailingComma): `//` and `/* */`
// comments and trailing commas, both outside strings only.
const stripJsonc = (text) => {
  const scan = (src, onChar) => {
    let out = "";
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '"') {
        let j = i + 1;
        while (j < src.length && src[j] !== '"') j += src[j] === "\\" ? 2 : 1;
        out += src.slice(i, j + 1);
        i = j;
        continue;
      }
      const skip = onChar(src, i);
      if (skip !== null) { i = skip - 1; continue; }
      out += c;
    }
    return out;
  };
  const noComments = scan(text, (src, i) => {
    if (src[i] === "/" && src[i + 1] === "/") { const nl = src.indexOf("\n", i); return nl < 0 ? src.length : nl; }
    if (src[i] === "/" && src[i + 1] === "*") { const end = src.indexOf("*/", i + 2); return end < 0 ? src.length : end + 2; }
    return null;
  });
  return scan(noComments, (src, i) => {
    if (src[i] !== ",") return null;
    let j = i + 1;
    while (j < src.length && /\s/.test(src[j])) j++;
    return src[j] === "}" || src[j] === "]" ? i + 1 : null;
  });
};

// opencode's built-in permission default is `"*": "allow"`; config rules come after it.
const OPENCODE_DEFAULT_BASH = [["*", "allow"]];

// The global bash ruleset opencode resolves, in insertion order, with every verdict:
// its default, then config.json, opencode.json and opencode.jsonc from the global
// config dir, in the order opencode merges them. A file that exists but cannot be
// read or parsed fails CLOSED -- the floor then judges every segment as allowed --
// and `error` says which file and why, so the caller can say so out loud.
// opencode's global config dir is xdg-basedir's: $XDG_CONFIG_HOME/opencode, else ~/.config/opencode.
const OPENCODE_CONFIG_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode");
// opencode expands a leading ~ or $HOME in permission patterns (permission/index.ts).
const expandPattern = (pattern) => {
  if (pattern === "~") return homedir();
  if (pattern.startsWith("~/")) return homedir() + pattern.slice(1);
  if (pattern.startsWith("$HOME")) return homedir() + pattern.slice(5);
  return pattern;
};
const loadBashRules = (dir = OPENCODE_CONFIG_DIR) => {
  let bash = {};
  const errors = [];
  for (const file of ["config.json", "opencode.json", "opencode.jsonc"]) {
    let text;
    try {
      text = readFileSync(join(dir, file), "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") errors.push(`${file}: ${error?.code ?? error?.message ?? error}`);
      continue;
    }
    let cfg;
    try {
      cfg = JSON.parse(stripJsonc(text));
    } catch (error) {
      errors.push(`${file}: ${error?.message ?? error}`);
      continue;
    }
    const permission = cfg?.permission;
    const value = typeof permission === "string" ? permission : permission?.bash;
    if (typeof value === "string") bash = value;
    else if (value && typeof value === "object") bash = typeof bash === "object" ? { ...bash, ...value } : { ...value };
  }
  if (errors.length) return { rules: OPENCODE_DEFAULT_BASH, error: errors.join("; ") };
  const configured = typeof bash === "string" ? [["*", bash]]
    : Object.entries(bash).map(([pattern, action]) => [expandPattern(pattern), action]);
  return { rules: [...OPENCODE_DEFAULT_BASH, ...configured], error: null };
};

const bashRulesLoad = loadBashRules();
const configBashRules = bashRulesLoad.rules;

// An unreadable config contributes no shortcuts -> classify everything, the safe direction.
const configAllowMatchers = bashRulesLoad.error ? [] : bashRulesLoad.rules
  .slice(OPENCODE_DEFAULT_BASH.length)
  .filter(([pattern, action]) => action === "allow" && pattern !== "*")
  .map(([pattern]) => globToRe(strip(pattern)));

const segmentIsRead = (segment, depth) => {
  if (segment.meta) return false;
  const { tokens, raw } = segment;
  if (configAllowMatchers.some((re) => re.test(raw))) return true;

  const start = commandIndex(tokens);
  if (start < 0) return false;
  const verb = tokens[start].split("/").pop();
  const args = tokens.slice(start + 1);

  if (verb === "ssh") {
    if (depth <= 0) return false;
    const target = sshTarget(tokens, start);
    if (!target?.payload || !sshHostTrusted(target.host)) return false;
    return commandIsRead(target.payload, depth - 1);
  }

  if (verb === "rtk") {
    if (depth <= 0) return false;
    let i = start + 1;
    while (i < tokens.length && tokens[i].startsWith("-")) {
      if (!RTK_GLOBAL_OPTIONS.has(tokens[i])) return false;
      i++;
    }
    const direct = tokens[i];
    if (!RTK_DIRECT_SUBCOMMANDS.has(direct)) return false;
    return commandIsRead([direct, ...tokens.slice(i + 1)].join(" "), depth - 1);
  }

  const subcommands = Object.hasOwn(READ_ONLY_SUBCOMMANDS, verb) ? READ_ONLY_SUBCOMMANDS[verb] : undefined;
  if (subcommands) {
    const sub = tokens.slice(start + 1).find((x) => !x.startsWith("-"));
    if (!subcommands.has(sub)) return false;
  } else if (!READ_ONLY.has(verb)) {
    return false;
  }
  const guard = GUARDS[verb];
  return guard ? guard(args) : true;
};

// Every segment has to be read-only on its own, rather than matching the whole
// string: `cd repo && rg foo` then short-circuits, while `rg -l x | xargs rm -f`
// does not, because `xargs rm -f` is nobody's idea of a read. That distinction is
// worth more than safety alone -- the classifier shares a single GPU slot with the
// session's own model, so every avoidable call is latency now and an HTTP 500
// under contention later.
const commandIsRead = (command, depth = 2) => {
  const line = String(command ?? "");
  // Named here as well as in the hook. `cat` is a read verb and ~/.ssh/id_ed25519
  // is a file, so nothing else in this function would object -- the hook happens to
  // check credentials first, and a helper that quietly depends on its only caller
  // getting the order right is the next bug.
  if (touchesCredentials(line)) return false;
  const segments = lex(line);
  if (!segments.length) return false;
  return segments.every((s) => segmentIsRead(s, depth));
};

// ---------------------------------------------------------------------------
// The launder floor
//
// opencode's own `permission.bash` globs settle a command before this plugin sees
// it, and a glob cannot look inside argv: `echo *` lets `echo x > ~/.bashrc` run,
// `fd *` lets `fd -HX rm -rf` run, `git diff*` lets `git difftool -x cmd` run, and
// quoting a flag (`rg '--pre' sh`) slips past any deny glob. So for every segment
// opencode would run WITHOUT asking, the floor re-reads its parsed arguments: a
// read verb whose arguments write or execute is refused. Segments opencode would
// ask about are left alone -- a person approved those.
// ---------------------------------------------------------------------------

// opencode's matcher (packages/core/src/util/wildcard.ts): backslashes compare as
// slashes, `*` is any run, `?` one character, and a pattern ending in ` *` also
// matches no further arguments.
const WILDCARD_CACHE = new Map();
const wildcardMatch = (str, pattern) => {
  let re = WILDCARD_CACHE.get(pattern);
  if (!re) { re = wildcardRegExp(pattern); WILDCARD_CACHE.set(pattern, re); }
  return re.test(str);
};
const wildcardRegExp = (pattern) => {
  let escaped = String(pattern).replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  if (escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?";
  return new RegExp("^" + escaped + "$", "s");
};

// The verdict opencode reaches for one command from a bash ruleset: the LAST
// matching rule in insertion order wins.
const nativeBashVerdict = (command, rules) => {
  const str = String(command ?? "").replaceAll("\\", "/");
  let verdict;
  for (const [pattern, value] of rules ?? []) if (wildcardMatch(str, pattern)) verdict = value;
  return verdict;
};


// Is this segment's verb a read verb, and do its arguments keep it one? null when
// the verb is not a read verb at all (nothing to say), else true/false. Unlike
// segmentIsRead there is no config shortcut -- the config is what is being checked.
const strictRead = (tokens, depth = 2) => {
  const start = commandIndex(tokens);
  if (start < 0) return null;
  const verb = tokens[start].split("/").pop();
  if (verb === "rtk") {
    if (depth <= 0) return null;
    let i = start + 1;
    while (i < tokens.length && RTK_GLOBAL_OPTIONS.has(tokens[i])) i++;
    if (i >= tokens.length || tokens[i] === "--version" || tokens[i] === "--help") return true;
    if (!RTK_DIRECT_SUBCOMMANDS.has(tokens[i])) return null;
    return strictRead(tokens.slice(i), depth - 1);
  }
  const subcommands = Object.hasOwn(READ_ONLY_SUBCOMMANDS, verb) ? READ_ONLY_SUBCOMMANDS[verb] : undefined;
  if (subcommands) {
    const sub = tokens.slice(start + 1).find((x) => !x.startsWith("-"));
    if (!subcommands.has(sub)) return null;
  } else if (!READ_ONLY.has(verb)) {
    return null;
  }
  const guard = GUARDS[verb];
  return guard ? guard(tokens.slice(start + 1)) : true;
};

// `git fetch --upload-pack=<cmd>` runs <cmd>; git accepts `--upl` and longer.
const fetchRunsProgram = (tokens) => {
  const start = commandIndex(tokens);
  if (start < 0 || tokens[start].split("/").pop() !== "git") return false;
  const rest = tokens.slice(start + 1);
  const i = rest.findIndex((x) => !x.startsWith("-"));
  if (rest[i] !== "fetch") return false;
  return rest.slice(i + 1).some((x) => {
    const name = longName(x);
    return name !== null && name.length >= 3 && "upload-pack".startsWith(name);
  });
};

// Natively allowed commands that are deliberately not reads. Anything else the
// config lets run unprompted must be a read verb whose arguments keep it one: an
// allowed command the guard cannot verify is refused, not waved through.
const LAUNDER_EXEMPT = [
  ["opencode", "session"],   // session list/delete -- the config scopes it
  ["rm"],                    // only rm -rf /tmp/opencode/* is allowed, under its own deny floor
  ["git", "fetch"],          // a network read; --upload-pack is checked separately
];
const launderExempt = (tokens) => {
  const start = commandIndex(tokens);
  if (start < 0) return false;
  const words = [tokens[start].split("/").pop(), ...tokens.slice(start + 1).filter((x) => !x.startsWith("-"))];
  return LAUNDER_EXEMPT.some((prefix) => prefix.every((word, i) => words[i] === word));
};

// Why a natively-allowed command must not run unprompted, or null. `mustVerify` is
// whether a GLOBAL rule allows it: the global allow list is for reads, so a command it
// lets through that the guard cannot verify is refused. An agent's own allow for a
// writer (tester's `npm test`, the implementer's `git commit`) is deliberate and is
// only judged for writes the agent did not ask for.
const commandLaunders = (tokens, mustVerify = true) => {
  const read = strictRead(tokens);
  if (read === false) return "its arguments make it write a file or run a program";
  if (fetchRunsProgram(tokens)) return "--upload-pack runs a program";
  if (mustVerify && read === null && !launderExempt(tokens)) {
    return "the allow rule covers a command the guard cannot verify as read-only";
  }
  return null;
};

// The bash rules of one of opencode's merged agent rulesets (defaults, global config,
// project config and the agent's own block, in order), as [pattern, verdict] pairs.
// opencode matches the permission name as a wildcard too, so `*` rules apply to bash.
// Accepts the v1 {permission, pattern, action} and v2 {action, resource, effect}
// shapes; anything else is null rather than a guess.
const bashRulesFromRuleset = (ruleset) => {
  if (!Array.isArray(ruleset)) return null;
  const out = [];
  for (const rule of ruleset) {
    const v1 = typeof rule?.permission === "string" && typeof rule?.pattern === "string" && typeof rule?.action === "string";
    const v2 = typeof rule?.action === "string" && typeof rule?.resource === "string" && typeof rule?.effect === "string";
    if (!v1 && !v2) return null;
    const [name, pattern, verdict] = v1 ? [rule.permission, rule.pattern, rule.action] : [rule.action, rule.resource, rule.effect];
    if (wildcardMatch("bash", name)) out.push([pattern, verdict]);
  }
  return out;
};

// A redirect target that writes nothing anyone cares about: a descriptor merge,
// /dev/null, or a literal path that stays inside /tmp/opencode/ after normalising.
const safeRedirectTarget = (target) => {
  if (REDIRECT_HARMLESS.test(target)) return true;
  if (!target || /[$`~*?[{]/.test(target)) return false;
  return posix.normalize(target).startsWith("/tmp/opencode/");
};

// One shell word as the program receives it (quotes removed); a word the lexer cannot
// reduce to a single token (a substitution, say) is kept as written.
const unquoteWord = (text) => {
  const segments = lex(text);
  return segments.length === 1 && segments[0].tokens.length === 1 ? segments[0].tokens[0] : text;
};

// opencode's view of a command node: its text, or its redirected_statement's when it has one.
const astSource = (node) => (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim();
const AST_SKIP = new Set(["file_redirect", "heredoc_redirect", "herestring_redirect", "comment"]);
const astTokens = (node) => node.namedChildren.filter((c) => !AST_SKIP.has(c.type)).map((c) => unquoteWord(c.text));

// Unsafe output targets of one redirected_statement (including a > inside a heredoc redirect).
const redirectTargets = (statement) => {
  const out = [];
  const visit = (node) => {
    for (const child of node.namedChildren) {
      if (child.type === "heredoc_redirect") { visit(child); continue; }
      if (child.type !== "file_redirect") continue;
      const op = child.children.find((c) => !c.isNamed)?.text ?? "";
      if (!op.includes(">")) continue;
      // The destination can arrive as several adjacent nodes (`/tmp/opencode/` then a
      // concatenation holding a substitution), so it is all of them, not the first.
      const parts = child.namedChildren.filter((c) => c.type !== "file_descriptor");
      if (!parts.length) { out.push(""); continue; }
      if (op === ">&" && parts.length === 1 && (parts[0].type === "number" || parts[0].text === "-")) continue;   // >&2, >&-
      out.push(unquoteWord(parts.map((p) => p.text).join("")));
    }
  };
  visit(statement);
  return out.filter((target) => !safeRedirectTarget(target));
};

// The parse opencode itself makes: every command node is judged, wherever it sits.
const launderReasonAst = (command, rules, globalRules) => {
  const tree = parser.parse(command);
  try {
    const root = tree.rootNode;
    for (const node of root.descendantsOfType("command")) {
      const source = astSource(node);
      if (nativeBashVerdict(source, rules) !== "allow") continue;
      const why = commandLaunders(astTokens(node), nativeBashVerdict(source, globalRules) === "allow");
      if (why) return { segment: source, reason: why };
    }
    // A redirect writes even when every command it wraps is a read: refuse it when
    // nothing in the statement would have asked (including a bare "> file").
    for (const statement of root.descendantsOfType("redirected_statement")) {
      const targets = redirectTargets(statement);
      if (!targets.length) continue;
      const commands = statement.descendantsOfType("command");
      if (commands.every((c) => nativeBashVerdict(astSource(c), rules) === "allow")) {
        return { segment: statement.text.trim(), reason: `it redirects output into ${targets[0] || "a file"}` };
      }
    }
    return null;
  } finally {
    tree.delete();
  }
};

// Without the parser the guard cannot see into compound syntax, so it refuses any
// command that has some, and judges the rest segment by segment. Loud by design: the
// plugin and oc-check report parserError.
const COMPOUND_SYNTAX = /[(){}`]|\$\(|<<|(^|[\s;&|])(for|while|until|if|case|select|function|then|do|else|elif)(?=\s|$)/;
const launderReasonLex = (command, rules, globalRules = rules) => {
  if (COMPOUND_SYNTAX.test(command)) {
    return {
      segment: command,
      reason: `the guard's shell parser is unavailable (${parserError}) and this command has syntax the fallback cannot see into`,
    };
  }
  for (const segment of lex(command)) {
    if (nativeBashVerdict(segment.raw, rules) !== "allow") continue;
    const target = segment.writes.find((w) => !safeRedirectTarget(w));
    if (target !== undefined) return { segment: segment.raw, reason: `it redirects output into ${target || "a file"}` };
    const why = commandLaunders(segment.tokens, nativeBashVerdict(segment.raw, globalRules) === "allow");
    if (why) return { segment: segment.raw, reason: why };
  }
  return null;
};

// The config's deny rules, enforced by the guard as well as by opencode. opencode
// evaluates its rules and THEN the run's "Always" approvals, last match wins, so one
// "Always" that saved a blanket pattern (`snip *` -- opencode's arity table does not
// know the snip wrapper) overrides every deny rule for the rest of the run. The guard
// cannot see those approvals, so it re-applies the deny verdicts itself: null, or
// { segment } for the first command node a deny rule matches.
const configDenyReason = (command, rules = configBashRules) => {
  const text = String(command ?? "");
  if (parser) {
    const tree = parser.parse(text);
    try {
      for (const node of tree.rootNode.descendantsOfType("command")) {
        const source = astSource(node);
        if (nativeBashVerdict(source, rules) === "deny") return { segment: source };
      }
      return null;
    } finally {
      tree.delete();
    }
  }
  for (const segment of lex(text)) {
    if (nativeBashVerdict(segment.raw, rules) === "deny") return { segment: segment.raw };
  }
  return nativeBashVerdict(text, rules) === "deny" ? { segment: text } : null;
};

// An "Always" pattern that approves far more than the command it was granted for:
// `*`, or a wrapper with nothing after it (`snip *`, `rtk *`, `env *`), which is what
// opencode saves when its arity table does not know the wrapper.
const BLANKET_WRAPPERS = new Set(["snip", "rtk", "env", "sudo", "timeout", "nice", "nohup", "time",
  "command", "builtin", "stdbuf", "setsid", "ionice", "xargs", "bash", "sh", "zsh"]);
const blanketAlwaysPattern = (pattern) => {
  const p = String(pattern ?? "").trim();
  if (p === "*") return true;
  const m = p.match(/^(\S+) \*$/);
  return Boolean(m && BLANKET_WRAPPERS.has(m[1]));
};

// null, or { segment, reason } for the first command opencode would run unprompted
// that writes a file or runs a program. `rules` is the ruleset the session actually
// runs under (an agent's merged ruleset when known); `globalRules` is the global
// config, whose allows must be verifiable reads.
const launderReason = (command, rules = configBashRules, globalRules = configBashRules) => {
  const text = String(command ?? "");
  return parser ? launderReasonAst(text, rules, globalRules) : launderReasonLex(text, rules, globalRules);
};

// "RISKY" must mean *dangerous*, not merely *consequential* or *unfamiliar*. Two
// failures shaped this text, both measured in a decision log:
//   * an earlier version denied an ordinary `git add -A && git commit`, which
//     leaves a coding agent unable to commit its own work;
//   * "anything that reaches beyond the project" plus "anything you are unsure
//     about" made a small model deny 63 of 96 commands, nearly all of them
//     read-only inspection of another machine over ssh.
// So the SAFE list is explicit, the RISKY list is closed, and the last paragraph
// says an unlisted read is SAFE. Site-specific exceptions belong in the
// classifier config, not in this text.
const SYSTEM = `You classify one shell command that an AI coding agent wants to run with nobody available to approve it.
Reply with exactly one word: SAFE or RISKY.

Judge what the command DOES, not where it runs or how familiar it looks. Running a
command on another host over ssh, inspecting containers and services, and calling
services on the local network are routine work, and a command that only reads is
SAFE whether it runs here or somewhere else.

SAFE:
  reading, listing, searching, inspecting or reporting state of anything, anywhere --
  files, processes, logs, containers, services, disks, network, databases;
  building, testing, linting, formatting, benchmarking;
  creating or editing files inside a project directory, /tmp or a scratch directory --
  including changing their mode, e.g. chmod +x on a script in the project you are working in;
  routine version control: git add, git commit, git status/diff/log/show, git branch,
  git checkout -b, git switch -c, git stash, git fetch, git pull;
  HTTP requests that only fetch (GET/HEAD) from a local or public service;
  management CLIs and APIs called only to read state (list, get, query, status, info).

RISKY:
  sudo or any other privilege escalation;
  deleting, truncating or overwriting anything outside the working project;
  changing ownership or permissions of files outside the working project;
  git push, git reset --hard, git rebase, git filter-branch, force-pushing, or any
  rewriting of published history;
  installing, upgrading or removing packages system-wide (apt, pip, npm -g, cargo install);
  stopping, restarting or reconfiguring services, containers, VMs, storage pools, or
  the machine itself;
  partitioning, formatting, or writing to block devices;
  piping a download into a shell, or executing anything just fetched;
  writing to /dev, /etc, /boot, /sys, /proc or other system paths;
  printing, copying or transmitting credentials, keys or password stores;
  dumping configuration that embeds live secrets -- \`docker inspect\` of a container's
  environment, or any file holding a token, key or password;
  anything deliberately obfuscated to hide what it does.

A command is RISKY only if it matches something in the RISKY list. Being long, being
remote, being unfamiliar, or touching production data does not by itself make a
command RISKY: if it only reads or reports, the answer is SAFE.

Judge every part of a pipeline or && chain, and the remote command inside an ssh
invocation: if any part is RISKY, the answer is RISKY.`;

// ---------------------------------------------------------------------------
// Output redaction
//
// The leak that actually happened three times was not a blocked command -- it was
// an ALLOWED one whose OUTPUT carried a live credential into a transcript, which is
// then stored, backed up, and read by other agents. A NAS management API's app
// config returned db_password / encryption_key / redis_password in plaintext; its
// cloud-backup query returned a B2 application key and a restic repo password;
// `docker inspect` and `systemctl show` print whole environment blocks.
//
// So redact the value rather than block the tool. The command still runs and the
// agent still sees the shape of the response -- only the secret is replaced. This is
// deliberately KEY-driven, not entropy-driven: guessing "that looks random" mangles
// the hashes, ids and base64 payloads an agent legitimately needs.
// ---------------------------------------------------------------------------
const SECRET_WORD =
  /passw(?:or)?d|passphrase|secret|token|credentials?|bearer|(?:^|[_.-])key/;

// `key` as a trailing segment is what catches B2_APPLICATION_KEY -- the shape that
// actually leaked -- along with API_KEY, ACCESS_KEY and SSH_KEY. These are the names
// where it means something else, and redacting them would hide information the agent
// needs while protecting nothing.
const KEY_EXCEPTIONS = /^(?:.*public[_.-]?key|key[_.-]?id|keyid|keyboard|keyword|keys|.*key[_.-]?name|.*pubkey)$/i;
const KEYISH = `[a-z0-9_.-]*(?:${SECRET_WORD.source})[a-z0-9_.-]*`;
const REDACTED = "[redacted by opencode-guard]";

// A value that carries nothing is left alone: rewriting `"password": null` into a
// redaction marker would tell the reader a secret exists where none does.
const EMPTY = new Set(["null", "true", "false", '""', "''", "-", "none"]);
const isEmpty = (v) => EMPTY.has(String(v).trim().toLowerCase());

const RULES = [
  // "key": "value"  and  "key": 1234   -- JSON, and JSON-ish log lines
  {
    re: new RegExp(`("(${KEYISH})"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^,}\\]\\s]+)`, "gi"),
    swap: (m, head, key, value) =>
      isEmpty(value) || KEY_EXCEPTIONS.test(key) ? m : `${head}"${REDACTED}"`,
  },
  // KEY=value -- env blocks, .env files, docker inspect's Env array
  {
    re: new RegExp(`\\b(${KEYISH})(=)([^\\s,"'}\\]]+)`, "gi"),
    swap: (m, key, eq, value) =>
      isEmpty(value) || KEY_EXCEPTIONS.test(key) ? m : key + eq + REDACTED,
  },
  // key: value -- yaml, systemctl show, ini
  {
    re: new RegExp(`^([ \\t]*-?[ \\t]*(${KEYISH})[ \\t]*:[ \\t]+)(.+)$`, "gim"),
    swap: (m, head, key, value) =>
      isEmpty(value) || KEY_EXCEPTIONS.test(key) ? m : head + REDACTED,
  },
];

// A PEM block is unambiguous and has no key name to match on.
const PEM = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;

const redactSecrets = (text) => {
  if (typeof text !== "string" || !text) return { text, count: 0 };
  let out = text;
  let count = 0;
  out = out.replace(PEM, () => {
    count++;
    return REDACTED;
  });
  for (const { re, swap } of RULES) {
    out = out.replace(re, (...args) => {
      const groups = args.slice(0, args.length - 2);
      const replaced = swap(...groups);
      if (replaced !== groups[0]) count++;
      return replaced;
    });
  }
  return { text: out, count };
};

// ---------------------------------------------------------------------------
// The reveal window
//
// Redaction has to have a way out or it becomes the thing people disable. The way
// out is time-boxed and armed from a REAL terminal: `oc-reveal 60` writes a deadline
// and for that long nothing is redacted. Output produced in the window is marked as
// unredacted, so a transcript says so about itself rather than looking clean.
//
// WARNING: This is a speed bump against the agent arming it casually, not a boundary an
// adversary cannot cross. The plugin refuses any bash command naming `oc-reveal` or
// the deadline file, which is the same strength as the credential guard beside it --
// it runs on every bash call and nothing downstream can reorder it -- but an agent
// determined to construct the path some other way is not stopped by a regex. It is
// meant to stop a helpful model from "unblocking itself", and it does that.
const revealActive = (raw, now) => {
  const deadline = Number.parseInt(String(raw ?? "").trim(), 10);
  if (!Number.isFinite(deadline)) return false;
  return deadline > (Number.isFinite(now) ? now : Date.now());
};

// The command a tool call is about to run, whatever tool is running it. `bash`
// hands over a shell line; `pty_spawn` hands over an executable plus an argv array,
// which is joined so the same lexer and the same tiers apply to both. Anything not
// listed here starts no process and is not this hook's business.
const commandUnder = (tool, args) => {
  if (tool === "bash") return strip(args?.command);
  // opencode-pty's tools. Guarding only `bash` would be a hole the moment a pty
  // plugin is installed: `pty_spawn` runs an executable with its own argv.
  if (tool === "pty_spawn") {
    const argv = Array.isArray(args?.args) ? args.args.map((a) => String(a)) : [];
    return strip([String(args?.command ?? ""), ...argv].join(" ").trim());
  }
  // pty_write types into a shell that is already running, so there is no command to
  // judge -- but the text itself can still name a credential store, and that is the
  // one thing worth refusing on its own.
  if (tool === "pty_write") return strip(String(args?.data ?? args?.input ?? "").trim());
  // A background-shell plugin's `bg_run`. Same command string as bash, just not
  // waited on -- so it gets judged by exactly the same tiers. A process-spawning
  // tool missing from this function skips cc-safety-net, the credential guard AND
  // the classifier in one step.
  if (tool === "bg_run") return strip(args?.command);
  return null;
};


// Does this model call get the llama.cpp no-think kwarg?
//
// `/no_think` in the prompt and `reasoning_budget: 0` are both accepted and
// SILENTLY IGNORED by this llama.cpp build; the chat template's `enable_thinking`
// kwarg is the only lever that works, and a request-level kwarg overrides the
// server-side preset default (measured 2026-09-18: injecting `true` against a
// preset pinned `false` produced 234 decode steps where the control produced 8).
//
// It rides to the body through providerOptions.<provider>, which is a raw
// pass-through -- a provider that does not speak this OpenAI extension is handed
// a key it may reject. Hence two conditions and not one: the agent must be a
// fixed classifier agent (a coding agent on the same local provider keeps its
// thinking) AND the provider must be on the caller's allowlist (cloud calls must
// never be handed the key).
//
// CEILING: local inference is identified by provider id because opencode's
// provider descriptor carries no capability flag for this extension.
const localNoThinkApplies = (agent, providerID, noThinkProviders) =>
  agent === "fleet-classifier" && Boolean(providerID)
  && Array.isArray(noThinkProviders) && noThinkProviders.includes(providerID);

// A configured direct endpoint is the classifier's primary lane and the routed ladder
// is its fallback, so a direct verdict has to say whether the fallback is worth taking.
// SAFE and RISKY are answers, not faults. A fault is worth a second lane only when it
// was CHEAP: error:timeout has already spent the direct budget, and leasing a routed
// rung on top of it stalls the tool call longer than the denial it is trying to avoid.
// Fast faults (error:http<status>, a refused connection) are the endpoint-down case the
// fallback exists for, and they cost nothing to discover.
const directFallbackWarranted = (verdict) =>
  verdict !== "SAFE" && verdict !== "RISKY" && verdict !== "error:timeout";

// D1 dispatch gate. An agent declares `capability: read|write|exec` in its markdown
// frontmatter, and a read-only agent must never be handed work that writes or runs
// anything. Read with a regex over the frontmatter block rather than a YAML parser:
// this is ONE scalar key, in a file we control, on the path taken by every single
// task dispatch -- a parser dependency here would be loaded for nothing. Ceiling: a
// quoted or block-scalar value is not matched, so such an agent reads as undeclared
// and the gate stands aside. That direction is deliberate; this gate must never be
// the reason a CORRECT dispatch dies.
const AGENT_NAME = /^[a-z0-9][a-z0-9-]*$/i;
const AGENT_DIR = join(homedir(), ".config/opencode/agent");
const capabilityCache = new Map();
const agentCapability = (agent, dir = AGENT_DIR) => {
  // The name becomes a path segment, so it is validated before it is joined.
  if (!agent || !AGENT_NAME.test(agent)) return null;
  const key = `${dir}\u0000${agent}`;
  if (capabilityCache.has(key)) return capabilityCache.get(key);
  let capability = null;
  try {
    const front = readFileSync(join(dir, `${agent}.md`), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
    capability = front.match(/^capability:[ \t]*(read|write|exec)[ \t]*$/im)?.[1]?.toLowerCase() ?? null;
  } catch { capability = null; }
  capabilityCache.set(key, capability);
  return capability;
};

// Returns the reason a dispatch must be refused, or null to allow it. Enforced ONLY
// against `capability: read` agents -- write and exec agents, and every agent that
// has not declared a capability, are untouched, so this cannot regress a dispatch
// that works today. For a read agent an omitted INTENT line is exactly the
// misdispatch this exists to catch, so silence is refusal, not consent.
const dispatchRefusal = ({ agent, capability, prompt }) => {
  if (capability !== "read") return null;
  const intent = String(prompt ?? "").match(/^[ \t]*INTENT:[ \t]*(read|write|exec)\b/i)?.[1]?.toLowerCase() ?? null;
  if (intent === "read") return null;
  const wrong = intent ? ` Dispatch ${intent} work to an agent that declares \`capability: ${intent}\` (or none).` : "";
  return `[opencode-guard] blocked: \`${agent}\` is read-only (capability: read) and cannot write files, edit them, or run commands. Begin its prompt with a literal first line \`INTENT: read\` to confirm the work is read-only.${wrong} Do not rephrase to evade this; pick the agent whose capability matches the work.`;
};

// Returns the reason a tool call must be refused because its turn is already over, or
// null to allow it. opencode runs a tool the model emitted without checking whether
// the turn was cancelled first (v1.18.22 checks the abort signal only AFTER the tool
// ran). Any call the runtime processes after Esc therefore still runs. Normally that
// window is milliseconds. On 2026-09-21 a starved event loop stretched it to minutes,
// and two read-only subagents ran ls/cat/head and five reads after the cancel. A running session is
// busy (or retrying) for the whole of every tool call; once it is idle, which is what
// cancel and turn end both set, a tool call for it is left over.
// `statuses` is /session/status, which lists only NON-idle sessions, so absence means
// idle. Anything that is not a readable map means "cannot tell", and that allows.
const staleToolRefusal = ({ statuses, sessionID, tool }) => {
  if (!sessionID || !statuses || typeof statuses !== "object" || Array.isArray(statuses)) return null;
  const status = statuses[sessionID];
  if (status && typeof status.type === "string" && status.type !== "idle") return null;
  return `[opencode-guard] blocked \`${tool ?? "tool"}\`: this session's turn was cancelled or has already ended, so this call is left over from it and was not run.`;
};

// Whether a session is idle in opencode's `/session/status` map. opencode drops a
// session from the map when it goes idle, so a missing entry IS idle -- the same
// reading staleToolRefusal makes above. An unreadable map is NOT idle: the caller
// is about to delete the session's history and must not guess.
const sessionIdle = (statuses, sessionID) => {
  if (!sessionID || !statuses || typeof statuses !== "object" || Array.isArray(statuses)) return false;
  const status = statuses[sessionID];
  return !status || status.type === "idle";
};

export {
  agentCapability, dispatchRefusal, staleToolRefusal, sessionIdle,
  normalizeLevel, normalizeMode, normalizeGlobalMode, resolveSessionMode, shouldAutoApprove, classifierDecides, EDIT_PERMISSIONS,
  unattendedFrom, isUnattended, HEADLESS_COMMANDS,
  strip, lex, commandIndex, sshPayload, sshTarget, sshHostName, trustSshHosts, sshHostTrusted,
  segmentIsRead, commandIsRead, nativeBashVerdict, launderReason, loadBashRules, bashRulesLoad, parserError, launderReasonLex, bashRulesFromRuleset, configDenyReason, blanketAlwaysPattern,
  touchesCredentials, touchesHardCredentials, touchesPromptableCredentials,
  nativeToolTouchesHardCredentials, nativeCredentialGuardBlocks,
  nativeToolWritesControlFile, commandWritesControlFile, writeTargets,
  registerCredentialPatterns, registerPromptablePatterns, credentialAdvice, siteConfig,
  redactSecrets, revealActive, commandUnder, localNoThinkApplies, directFallbackWarranted, SYSTEM,
  READ_ONLY, GUARDS, READ_ONLY_SUBCOMMANDS,
};
