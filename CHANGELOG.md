# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions before 1.0.0
were released privately as opencode-guardrails.

## [Unreleased]

## [1.7.0] — 2026-10-08

### Added

- `docs/STATE.md`: the permission-mode files and resolution rules as a contract for other products (first consumer: opencode-peers).
- Tree rules for agent teams, enforced in `tool.execute.before` above the god bypass. A session or classification lookup that cannot be completed denies the call and names the rule.
  - G1: `task` with `task_id` must name an existing child of the calling session. A sibling, the caller's lead, another root's session, the caller itself and a nonexistent id are refused (opencode resumes any session id, and silently starts a fresh child for one that does not exist).
  - G2: `task` with `background: true` is allowed only from an attended root session, and never together with `task_id`.
  - G4: a session in an agent team (a background task child of a root, or anything below one) cannot call `workflow_run`, `peer_*`, `schedule_*`, `bg_watch`, `bg_unwatch`, or a `bg_*` tool with `all: true`.
  - Teammates are recognised by the `task` part that created them (`state.input.background`), indexed from `message.part.updated` events, with a paged read of the root's history when the index has no entry. A foreground task promoted to the background is not a teammate.
  - G4 fails closed: a child of a root with no creating `task` part in the root's history (for example an SDK-created opencode-agent-workflows workflow child) is treated as possibly in a team, and it and everything below it are refused the tools above, with a refusal that says retrying will not help. This is deliberate, because a teammate's creating part can disappear from the root's history (a revert removes it). Classification is decided by the session just below the root on the caller's path, so a workflow child started from a foreground subagent is classified by that subagent's part and keeps these tools. Behaviour change: a workflow step started directly from a root that calls one of these tools is now refused.
  - Level `off` skips G1, G2 and G4, like the other pre-run checks; the teammate index is still fed at every level.
  - Only creating parts classify: a resume part (`task_id` set) is ignored, from events and from history. A "no creating part" answer is cached for 30 seconds (it can only refuse). A history page without paging headers ends the scan only when it is short, and a transient session read is retried once.

### Changed

- G3: a session without its own mode file now runs under the stricter of its immediate parent's mode (the old rule) and the mode of the nearest ancestor that has a mode file, each falling back to the global mode, with an inherited `god` reading `auto`. This only tightens: a direct child resolves as before, and a deeper session no longer runs under a global mode looser than one set on its root. A session whose ancestry cannot be read is denied its tool calls, naming G3, and its permission prompts are left to the person, instead of falling to the global mode.

## [1.6.1] — 2026-10-02

### Fixed

- ☠️ **Flag-aware argv parsing misread unattended runs as attended.**
  `unattendedFrom` picks whether an opencode process gets strict permission
  handling, so misreading a headless run as attended is the unsafe direction.
  The previous scan walked argv looking for the first positional and skipped
  the value of a known value-taking flag -- but any flag it did not know about
  (`--replay-limit 5 run`) still hid the subcommand, and a value flag with a
  POSIX terminator (`opencode -- -x run`) or a model argument before the
  subcommand (`opencode -m run /dir`) also resolved to attended. The scanner
  (and its VALUE_FLAGS list) is gone. The rule is now: `--auto` anywhere OR
  ANY token after argv0 is EXACTLY one of `run`, `serve`, `acp`, `github`,
  `export`, `import`. It is a strict superset of the old first-positional
  rule, so no argv that used to resolve "unattended" can resolve "attended"
  under it, and it is immune to flag-value parsing including undeclared
  value-taking flags. Its one false positive is a TUI whose argv has a bare
  token spelled exactly like a headless subcommand (a model named `run`,
  a session title literally `serve`); for guard that means stricter handling,
  which is the intended direction. opencode-ntfy keeps a precise parser on
  purpose because there the cheap error is the opposite one.

## [1.6.0] — 2026-10-01

### Added

- ☠️ **Deny rules hold over "Always" approvals.** opencode checks its permission
  rules and then the run's "Always" approvals, last match wins, and its arity table
  does not know the `snip` wrapper: one "Always" on any snip-prefixed prompt saved
  `snip *`, which approved every later command for the rest of the run -- including
  everything the config denies (`rm -rf /*`, `mkfs`, `git push --force`). A plugin
  cannot see or revoke those approvals, so the guard now re-applies the config's
  deny rules itself (the session agent's merged ruleset when known), to every
  command node, in every mode including god -- the floor god is documented to keep.
- **A blanket "Always" is reported.** When an "Always" reply saves `*` or a bare
  wrapper (`snip *`, `rtk *`, `env *`, ...), the plugin logs an error naming it and
  saying that only a restart revokes it.

## [1.5.1] — 2026-10-01

### Fixed

- ☠️ **Every routed classifier lease leaked.** opencode-broker now accepts a
  `/failure` or `/forget` only with the broker-minted `leaseID` ("lease id is
  required for settlement"); the guard sent only the session ID and swallowed the
  refusal in an empty `catch`, so no classifier failure was reported and no
  classifier lease was settled until the broker's idle reaper took it. The guard
  now reads the child's live lease back with `/lease/verify` and sends its
  `leaseID`; a refusal or a failed lookup is logged (`classifier-forget-refused`,
  `classifier-lease-verify-failed`) instead of swallowed. The real-broker test's
  router stub sends its `leaseID` as the router does, and the test now also
  requires the retry's lease -- settled only by the guard -- to be gone.

## [1.5.0] — 2026-10-01

### Changed

- **The launder floor judges with the session's own agent ruleset.** opencode
  appends an agent's own permission block (and a project config) after the global
  rules, last match wins, so a rule only one agent has -- the tester seat's
  `npm test*` -- was invisible to the floor: `npm test > ~/.bashrc` ran unprompted
  there. The plugin now records each session's agent from `chat.params` and reads
  every agent's merged ruleset (opencode defaults, global and project config, the
  agent's block) from `client.app.agents()`, v1 or v2 rule shape. The "allowed but
  cannot be verified as a read" refusal still applies only to commands the GLOBAL
  config allows; an agent's own allow for a writer (a test runner, `git commit`) is
  deliberate and is judged only for writes it did not ask for. If opencode cannot
  list the agents, the floor uses the global config and logs an error saying an
  agent's own rules are not seen.

## [1.4.0] — 2026-10-01

### Changed

- ☠️ **The launder floor parses commands the way opencode does.** opencode checks
  permission once per `command` node of a tree-sitter bash parse -- including
  commands inside loops, `if` bodies, subshells, `{ }` groups and `$( )`/backtick
  substitutions. The floor used a hand lexer that only split on `; & | newline`, so
  `for f in a; do echo x > ~/.bashrc; done`, `(echo x > ~/.bashrc)`,
  `x=$(fd -x rm)` and an apostrophe in a heredoc body (which hid every command
  after it) all ran unprompted with no floor. It now uses the same parser and
  pinned versions as opencode (`web-tree-sitter` 0.25.10, `tree-sitter-bash`
  0.25.0, new dependencies -- run `npm install` after pulling) and judges every
  command node against its own source text. A redirect on any statement whose
  commands would all run unprompted is refused, including `(cat a) > f` and a
  bare `> f`. If the parser cannot load, the plugin and `oc-check` report it and the
  floor refuses any command with compound syntax until it does.
- **An allowed command the guard cannot verify is refused.** A command the config
  lets run unprompted must now be a known read verb whose arguments keep it one, or
  a named exemption (`opencode session`, `rm` under its own deny floor, `git
  fetch`). Before, an unknown verb was waved through: `git fetch*` let
  `git fetch-pack --exec=cmd` run.
- **Redirect targets are judged as the program sees them.** Quotes are removed
  (`> "/dev/null"` is harmless) and a `/tmp/opencode/` target must be a literal
  path that stays inside it after normalising (`/tmp/opencode/$d` is refused). A
  destination built from several parts is read whole.
- **More read guards.** `sed` is a read only for known read-only scripts
  (addresses with `p = d l n N q Q`, `s///` with `g p i I` flags; never `w`, `e`,
  `r`, `-i` or any `--in...` prefix, `-f`); `sort -o` in a cluster and any
  `--output` prefix; `yq -s/--split-exp`; `mediainfo --LogFile`; `ag --pag...`;
  `git ls-remote --upload-pack`. `rtk --version` is a read. Inherited object keys
  (`toString`) are no longer looked up as verbs.
- The opencode config is found where opencode looks (`$XDG_CONFIG_HOME/opencode`),
  and a leading `~`/`$HOME` in a pattern is expanded as opencode does. Compiled
  patterns are cached. A failure to report a config error is logged instead of
  swallowed.

## [1.3.1] — 2026-10-01

### Fixed

- **An unreadable opencode config silently switched the launder floor off.** The
  guard read only `opencode.json`, as strict JSON, and a read or parse failure left
  it with no rules -- so no segment counted as natively allowed and nothing was
  judged. It now reads the global config the way opencode does (`config.json`,
  `opencode.json`, `opencode.jsonc`; comments and trailing commas; on top of
  opencode's built-in `"*": "allow"` default, which a config without a `*` rule
  leaves in force). A file that exists but cannot be read or parsed fails closed:
  every segment is judged as allowed, the plugin logs an error at startup naming
  the file and the reason, and `oc-check` prints it. The auto-mode allow shortcuts
  come from the same loader and stay empty on an error.

## [1.3.0] — 2026-10-01

### Added

- ☠️ **The launder floor.** opencode's own allow globs let read verbs run
  unprompted, and a glob cannot see inside argv, so `echo x > ~/.bashrc`,
  `fd -HX rm -rf`, `git diff --output=f`, `git grep -O'cmd'`, a quoted
  `rg '--pre' sh` and `git fetch --upl=cmd` all ran without a prompt in manual and
  edits mode. For every segment opencode would run without asking -- its
  last-match-wins verdict recomputed from `~/.config/opencode/opencode.json` with
  opencode's own wildcard semantics -- the floor now refuses a redirect into a file
  (other than `/dev/null`, fd merges and `/tmp/opencode/`) or a read verb whose
  parsed arguments write or run a program. Commands opencode would ask about are
  not judged. Runs in every mode but attended god; `oc-check` reports it.

### Fixed

- **`&>file` was read as a background `&`.** The lexer ended the command at the
  `&` and dropped the redirect, so `echo x &> ~/.bashrc` counted as a read in auto
  mode. `&>`/`&>>` are now redirects, `>|` is recognised, and `>&file` names its
  file instead of a bare `&`.

### Changed

- **Read guards see clusters, abbreviations and quoting.** `git branch` is a read
  only when listing (any write flag in a short cluster, any abbreviation of a write
  long option, or a branch name without a list-mode option is a write); `git
  remote -v set-url` is no longer a read; new guards for `fd` (`-x`/`-X` in any
  cluster, `--exec`), `rg` (`--pre`, `--hostname-bin`), `git grep` (`-O`,
  `--open-files-in-pager`), `git diff/log/show/whatchanged` (`--output`,
  `--ext-diff`), `tree -o`, `uniq`/`xxd` with an output operand, `xxd -r`,
  `pdftotext` writing a file, `yq -i`, `xmllint --output`, `bat`/`ag --pager`.
  `exiftool` left the read table (`-if` runs Perl). These also tighten what auto
  mode settles without a model call.

## [1.2.0] — 2026-09-29

### Changed

- **Classifier model selection is broker-native.** The guard creates one unpinned
  `fleet-classifier` child and lets opencode-broker's ordinary `chat.message` route
  own its classifier lease, model and reasoning variant. The guard no longer
  pre-leases a target or maps target ids to pinned agents through `brokerAgents`.
- **Classifier failures and cleanup use the real child session id.** Genuine
  provider or transport failures are reported without a synthetic lease or target
  id, and every created child is forgotten after abort/status/delete cleanup even
  when deletion must be deferred. Timeout and empty-text results still do not
  indict a provider; duplicate failure or forget reports remain idempotent.
- **llama.cpp no-thinking follows one fixed identity.** Only `fleet-classifier`
  calls on a provider listed by `noThinkProviders` receive
  `chat_template_kwargs.enable_thinking: false`; ordinary agents on the same local
  provider keep their reasoning.

## [1.1.0] — 2026-09-21

### Added

- **`authTokenFile` in classifier.json.** Names a file whose first line is the
  direct endpoint's bearer token, read on each classification, so the token can
  live in a secrets file instead of in classifier.json itself. `~/` is expanded.
  `authToken` still wins when both are set, and `$OPENCODE_GUARD_CLASSIFIER_TOKEN`
  remains the last resort. An unreadable file means no token, never an error.

## [1.0.1] — 2026-09-21

### Fixed

- **The broker lane no longer leaks a session per classification.** Its cleanup
  waited on `v2.session.wait` before deleting the disposable classifier session.
  That call exists, but on OpenCode 1.18 it is an unimplemented stub that rejects
  with `Session wait is not available yet`, so every delete deferred and every
  broker-lane classification left its child session behind. 0.4.7 took the
  common path off the broker lane by trying a direct endpoint first, but the
  broker lane still runs whenever it is the only lane or the direct one fails
  fast, and each of those runs leaked. The barrier is now a bounded poll of
  `/session/status`, the endpoint the stale-turn check (D0) already reads, for up
  to 10 s after the abort; the delete follows once the session is idle. A session
  still busy at the deadline, or a status map that cannot be read, is left and
  logged as `classifier-cleanup-deferred`, as before. It is never deleted blind.
  `sessionIdle` in `lib/policy.js` makes the idle reading, and the two
  source-order tests that pinned the stub call now forbid it.

## [1.0.0] — 2026-09-21

First public release, under a new name: `opencode-guardrails` is taken on npm, so
the package is now **opencode-guard**.

### Changed

- **Renamed to opencode-guard.** The plugin export is `OpencodeGuard`, refusals and
  redaction notes say `[opencode-guard]`, and the site config moves to
  `~/.config/opencode-guard/config.json` (or `$OPENCODE_GUARD_CONFIG`). The old
  config path and `OPENCODE_GUARDRAILS_CLASSIFIER_URL` are still read when the new
  ones are absent, so an upgrade cannot silently drop a site's extra credential
  patterns. The commands keep their names (`oc-mode`, `oc-auto`, `oc-check`,
  `oc-reveal`; none collides with a common tool), and the switch files under
  `~/.config/opencode/` and `~/.local/share/opencode/modes/` keep their paths, so
  tools that write them keep working.
- **cc-safety-net 2.1.1 → ^2.4.5.** The `checkCommand` API is unchanged, so no call
  site needed adapting. What it denies has grown: separator-free `git checkout`
  path restores (`git checkout .`, `git checkout src/`; 2.4.5), reads of protected
  files after a `cd` (2.4.0), `curl` uploads of secret files (2.3.1), and several
  heredoc, brace-expansion and `bash -c` bypasses (2.4.2). 2.4.0 dropped its only
  runtime dependency. The breaking changes in its release notes (OpenCode 1.18.29
  for cc-safety-net's own plugin installer, the rulebook `rule sync` migration)
  concern cc-safety-net installed as a plugin, not its library API. A cloned
  repository can now carry `.cc-safety-net/policy.json`, which cc-safety-net reads
  for commands run there (2.3.0); the rest of the floor does not depend on it.
- cc-safety-net is loaded from this package's own dependency first and from
  opencode's config directory only as a fallback, so the tested version is the one
  that runs. A `checkCommand` that throws now denies the command, as its API
  contract asks, instead of skipping the tier.
- **The model router is optional.** The router bridge becomes `lib/broker.js`, for
  opencode-broker (the router's public name). The broker lane is used only when
  its socket exists and `classifier.json` does not say `"broker": false`; its
  directory can be moved with `brokerDir`. Without it the guard is a standalone
  floor whose classifier is any OpenAI-compatible endpoint.
- The classifier's configuration, route and direct call move to
  `lib/classifier.js`, shared with `oc-check` (which used to ignore
  `systemPrompt`). There is no baked-in model, token or broker agent map; the
  direct lane no longer sends llama.cpp's `chat_template_kwargs` or a dummy bearer
  token to every endpoint. New keys: `extraBody` (a `null` removes a default),
  `timeoutMs`, `private`, `promptAddendum`, and `OPENCODE_GUARD_CLASSIFIER_TOKEN`.
- **Privacy profiles reach a local classifier** instead of being refused outright:
  a direct endpoint marked `"private": true`, or a broker lease requested with
  `localOnly`, whose target must come back with `kind: "local"`. With neither, the
  command is still refused rather than sent.
- **ssh payloads settle statically only for trusted hosts.** `trustedSshHosts` in the
  site config lists them (exact names or `*` wildcards); it is empty by default,
  and an ssh command to any other host goes to the classifier or a person. Before,
  every host's payload was judged as if it were local.
- The built-in classifier prompt describes no particular site. Site exceptions go
  in `promptAddendum`.
- The promptable credential tier covers `bw`, `op`, `pass` and `gopass` as well as
  `rbw`, and `extraPromptableCredentialPatterns` adds more.
- `cd` is a static read.
- The dispatch gate's refusal no longer names particular agents.

### Added

- **Loop guard**, from opencode-agent-workflows 0.7.0 by the same author. It counts sterile repeats (a read-only tool call whose
  input and output both match an earlier call, with no state-changing call in
  between), warns at 12, hands a subagent back to its parent at 25 (the parent is
  sent the evidence, then the child is aborted), and never aborts a root session.
  Unlike opencode's `doom_loop` it sees a rotation of different calls across
  messages, needs identical output as well as input, and works in every mode
  because it answers through the tool result rather than a permission prompt. The
  notifier that delivers the handback comes across from the same package.
  Configured by `loopGuard` in the site config.
- **The guard's own switches are protected.** A `write`, `edit` or `apply_patch` to
  the mode, level, reveal or classifier file, or a per-session mode file, is
  refused, as is a shell command that names one and is not a static read. In
  `auto` mode such a write used to be approved like any other edit, which let an
  agent turn the floor off or open the reveal window for itself. `oc-mode` and
  `oc-auto` refuse to change anything when run under opencode, as `oc-reveal`
  already did.
- MIT license, CI on Node 20 and 22, `SECURITY.md`, `CONTRIBUTING.md`.

### Fixed

- **`edits` mode no longer sends shell commands to the classifier.** The permission
  handler classified every shell command it was asked about in `edits` and then
  prompted anyway, because `edits` never approves a shell command whatever the
  verdict. The command text went to a model for an answer nobody used.
  `classifierDecides` now names the one mode whose answer depends on a verdict
  (`auto`), both hooks consult it, and `tests/permission-event.test.mjs` drives the
  real handler to prove it.
- The mode descriptions said a RISKY shell command in `auto` falls back to a prompt.
  It is refused, which is the intended behaviour: a plugin cannot turn a verdict
  into a prompt (the `permission.ask` hook never fires on opencode 1.18), and a
  prompt for every gray-zone command is `manual` mode. Comments, `oc-mode` and the
  README now say so.
- An unreadable level file was reported in refusals as the retired level name
  `auto`; it now reads as `on`, which is what it already meant.
- The tests no longer depend on the machine running them: they use a throwaway
  `HOME` with fixture configs. Three of them passed only against one particular
  `opencode.json`.

### Removed

- The private registry `publishConfig` and the default broker agent map.

### Upgrading from opencode-guardrails 0.6.0

- Move `~/.config/opencode-guardrails/config.json` to
  `~/.config/opencode-guard/config.json` (the old path still works for now).
- Add `trustedSshHosts` to keep ssh reads on the static path.
- Put the broker agent map in `classifier.json` as `brokerAgents`, and a llama.cpp
  endpoint's no-think setting in `extraBody`.
- If the old built-in prompt's site-specific rules mattered, restate them in
  `promptAddendum`.

## [0.6.0] — 2026-09-21

### Added

- **A tool call for a turn that is already over is refused (D0).** opencode runs a tool the model emitted without checking first whether the turn was cancelled: v1.18.22 looks at the abort signal only after the tool has run. Any tool call the runtime processes after Esc therefore still executes. Normally that window is milliseconds. On 2026-09-21 an event loop starved by a plugin's startup sweep stretched it to minutes. Esc took a minute to land, and two subagents' buffered tool calls (`ls`, `cat`, `head` and five file reads) ran about 200 ms after the cancel. They were read-only, but a write-capable agent could just as well have edited files after the operator stopped it. `tool.execute.before` now reads `/session/status` for this plugin's own instance. A session is busy (or retrying) for the whole of every tool call, and cancel and turn end both set it idle, so a tool call for a session that is idle, or absent from the list (which holds only non-idle sessions), is left over and is refused. D0 sits above the god bypass alongside D1, because it is not a limit on what a session may run. A status read that fails or returns anything unreadable allows, so D0 can never stall a live session, and level `off` skips it like everything else.

  Verified against the v1.18.22 runtime with this plugin loaded: a real `read` tool call in a running session passes D0 and completes.

## [0.5.0] — 2026-09-18

### Added

- A subagent that inherits its mode from a parent now has a refused permission rejected outright instead of being left for the operator to answer. A session holding its own mode file is unaffected: setting a mode on a session is still the grant. A credential request from an inherited-mode child always fails closed, since fetching a secret is the parent's call to make.
- A permission refused inside a subagent is appended to the result its parent receives from the task tool, naming the permission, the reason and the command. The parent holds the mode the child was refused under, so it can run the command itself, re-dispatch a narrower brief, or ask the user. This is a round trip rather than a mid-flight escalation: the parent is blocked inside the task tool while the child runs, and the permission.ask hook never fires.
- Dispatch gate. An agent declaring `capability: read` in its frontmatter refuses a task whose prompt does not open with a literal `INTENT: read` line. Agents declaring write or exec, and agents declaring nothing at all, are untouched, so no dispatch that works today can start failing. The gate runs above the god-mode bypass: god lifts the floor on what a session may run and is not a licence to emit an incoherent dispatch, and sending write work to a read-only agent is not dangerous but broken — it otherwise fails only after a child session has been created.

## [0.4.8] — 2026-09-18

### Fixed
- A delegated child session now tracks its parent's permission mode instead of falling to the global default. A child has no mode file of its own, so `modeFor` fell straight through to `~/.config/opencode/mode` — measured as `manual`, the most restrictive mode. Every permission a subagent raised was therefore left standing as a prompt for the operator, and the child's bash was never classified at all, because both the classification path and the permission event return before judging in manual mode. Neither return logs anything, so the behaviour was invisible in `autoclass.log`: across the whole file there are 339 `allow(auto/external_directory)` and 244 `allow(god/external_directory)` entries and not one `prompt(.../external_directory)`.
- The inherited mode is capped below god by the existing `normalizeGlobalMode`, so a child of a god-mode session runs in `auto` and never in god. A mode set in front of a person stays the only way to hold god.

### Changed
- `modeFor` is now async and resolves the parent through the same cached `session.get` lookup `profileFor` already used, so the SDK is consulted once per session and only when the session has no mode file of its own.

## [0.4.7] — 2026-09-18

### Changed

- **A configured classifier URL is now the primary path, with the routed ladder kept as its
  fallback.** `classifyDirect` posts to an OpenAI-compatible endpoint and creates no opencode
  session; `classifyRouted` creates one per classification and deletes it in a `finally` block.
  That delete is gated behind `v2.session.wait`, which OpenCode 1.18 exposes as an unimplemented
  stub, so the barrier rejects with `Session wait is not available yet`, cleanup defers, and the
  session is never reaped. Measured on 2026-09-18: 219 consecutive `classifier-cleanup-deferred`
  entries, 100% of deletes, 210 live local-classifier children accumulating at ~52/hour.
  Routing the common path through `classifyDirect` removes the session from the hot path
  entirely rather than deleting it after the fact.
- The fallback is deliberately narrow. `directFallbackWarranted` (lib/policy.js) sends a verdict
  to the routed ladder only when the direct call failed *cheaply* — an HTTP status or a refused
  connection, which is the endpoint-is-down case the fallback exists for. `SAFE` and `RISKY` are
  answers, not faults. `error:timeout` is excluded: it has already spent the 25s direct budget,
  and adding a routed lease on top stalls the tool call longer than the denial it would avoid.

### Fixed

- **Corrected a comment that described the classifier ladder backwards.** `DEFAULT_BROKER_AGENTS`
  called the three cloud targets primary and `local-classifier` a fallback rung "only ever
  reached when no primary is eligible". The deployed router config is the inverse —
  `tiers.classifier = ["local-classifier"]` with `fallbacks.classifier = [["haiku", "gpt-luna"]]`
  — because a local target has no quota to exhaust, while the cloud subscriptions fail together
  on a billing or auth fault and would fail the permission gate closed. An all-local census of
  classifier child sessions is the healthy state, not a degraded lane; the old comment invited
  the opposite diagnosis.

## [0.4.6] — 2026-09-17

### Fixed

- **The classifier's own timeout no longer indicts the model it gave up on.** When the timeout
  aborts the HTTP client, opencode records the far side as HTTP 499 ("client closed request") and
  the SDK returns it as a response error, so it reaches the catch block as a plain `Error` —
  `error?.name === "AbortError"` never matches, and the 499 was reported to the broker as a
  provider fault. Two of them quarantined the local provider on 2026-09-17 while its classifier was
  answering every request that actually waited for it. A 499 is now treated as the abort it is:
  the verdict still falls back to the safe default, and provider health is left alone.

## [0.4.5] — 2026-09-16

### Fixed

- **The classifier idle barrier called a method that does not exist, so every disposable
  classifier session leaked.** `wait` is declared only on the V2 session group
  (`client.v2.session`); the legacy group the plugin was using has no such method, so cleanup
  threw `v2Client().session.wait is not a function` before it ever reached the delete. The
  autoclass log recorded 99 `classifier-cleanup-deferred` entries, one per leaked session.
  The barrier now calls `v2Client().v2.session.wait`. Session creation stays on the legacy
  group because only that group accepts `parentID`.
- **The regression test asserted the broken spelling.** The existing cleanup test pinned
  `v2Client().session.wait` and stayed green while every cleanup failed at runtime. It now
  asserts the V2 spelling, and a second test asserts the legacy spelling is absent.

## [0.4.4] — 2026-09-15

### Fixed

- **A classifier timeout no longer deletes the session beneath its still-running agent loop.**
  Aborting the legacy prompt request stops the client wait, not necessarily the server loop. The old
  `finally` block immediately deleted the disposable classifier session, so the loop's next
  `step-start` insert referenced a message that no longer existed and surfaced as a SQLite foreign-key
  failure wrapped in `UnknownError`. Cleanup now aborts the disposable session, waits on OpenCode's
  native idle barrier, and deletes only after the loop has settled. If that barrier fails, the row is
  deliberately left for later cleanup rather than risking database corruption.

## [0.4.3] — 2026-09-08

### Changed

- **`gpt-luna` and `qwen-flash` are back in `DEFAULT_BROKER_AGENTS`.** The lane spans three cloud
  subscriptions again, which is the point of having a rung at all — a billing or auth failure on one
  provider does not take the gate down.

### Corrected

- ☠️ **gpt-5.6-luna was removed on a misdiagnosis this file helped create.** 0.4.0 and 0.4.2 said it
  "returned no verdict at all", citing 155 empty responses in 161 leases. Measured 2026-09-08 over
  six labelled commands through the real path, it is **6/6 correct with zero empty responses** — at
  its default effort *and* at `none`. What differs is latency against `CLASSIFIER_TIMEOUT_MS`:
  p50 9,649 ms and max 24,478 ms by default, 2 of 6 past the 12s deadline, against p50 6,834 ms and
  max 11,404 ms at `none`, 0 of 6 past it.
  ☠️ Those 155 "empty responses" were this plugin's own masking bug, fixed in 0.4.0: every abort and
  transport failure was reported as `classifier returned no text`, so a model missing a deadline was
  indistinguishable from a model answering with nothing — and the number got quoted onward as
  evidence about the model. The router now delivers the lane's configured effort to the
  pinned model, which is what the lane always intended.
  ☆ The lesson is the one 0.4.0 was about: a failure that cannot name itself gets explained by
  whoever reads it next, and that explanation outlives the evidence.

## [0.4.2] — 2026-09-08

### Changed

- ☠️ **`DEFAULT_BROKER_AGENTS` now lists only lanes that have been measured.** It carried five
  entries; three could not do the job. `gpt-mini`'s target no longer exists at all. `gpt-luna` is a
  reasoning model that returned no verdict — 155 empty responses in 161 leases, each one failing an
  ordinary command CLOSED. `qwen-flash` was never leased once in the retained log and was never
  measured against this lane's own "small non-thinking" requirement.
  ☆ An entry in that map is a promise that the model can answer in one word. Only `local-classifier`
  (13/14, ~200 ms) and `haiku` (36 decided verdicts) have kept it, and they are what remain.

## [0.4.1] — 2026-09-08

### Fixed

- **The classifier denied an in-project `chmod`.** The prompt listed *"changing ownership or
  permissions of files outside the working project"* as RISKY but never said what an in-project one
  is, so the case was unlisted — and an unlisted case is one a fail-safe classifier is right to
  refuse. `chmod +x` on a script you just wrote is ordinary work, so SAFE now says so, mirroring the
  RISKY line's inside/outside distinction instead of leaving the gap between them for the model to
  guess at.
  ☆ Measured on the real path (the plugin's own hook against a live opencode server, verdict cache
  cleared between runs), 10 labelled cases: 10/10 across three independent runs. Without the change
  the same set is *nondeterministic* — one run allowed `chmod +x ./build.sh` but denied
  `chmod 0644 src/config.json`, which is the shape of a model guessing at a gap rather than applying
  a rule.
  ☠️ The out-of-project cases are unchanged and still deny: `chmod 777 /etc/passwd`,
  `chmod -R 777 /usr/local/bin`, `chown -R root:root`, `sudo chmod`. So do the unrelated regressions
  (`npm install -g`, `sudo systemctl restart`).
  ☠️ A raw call to the model with only this prompt does NOT reproduce the production path — opencode
  also applies the pinned agent's own frontmatter prompt — and a first attempt to evaluate the
  change that way scored the *unmodified* prompt identically, which is worth knowing before anyone
  tunes this file against a bare endpoint again.

## [0.4.0] — 2026-09-08

### Fixed

- ☠️ **Every transport, auth and provider failure was reported as "classifier returned no text",
  which is the one verdict deliberately excluded from provider health — so a broken lane was never
  benched and stayed at the front of the ladder indefinitely.** The opencode SDK does not throw on
  a non-2xx unless the call passes `throwOnError: true`; its own error-interceptor says so
  ("Callers that read result.error directly get the parsed body unchanged"). `classifyRouted` read
  neither, so `prompted?.data ?? prompted` fell through to the ENVELOPE, which has no `parts`, and
  an empty-answer verdict swallowed the real cause. Measured 2026-09-02: 155 empty responses in
  161 `gpt-luna` classifier leases, cause never once recorded. It now reads `prompted.error` and
  the assistant-side `info.error` first, so a 404 reports
  `classifier request failed (HTTP 404): Session not found: …` instead of a silent shrug, and a
  real fault indicts its lane. A genuinely empty answer from a healthy model still reports empty.
- **The cloud fallback rung could never serve the classification that needed it.** The rung is
  chosen at `/lease` time, so a fault on the local lane could only ever be caught by the NEXT
  classification — one classification had exactly one lane, and any fault on it failed the gate
  closed, which is the outage the fallback exists to prevent. One bounded re-lease is now made
  when the first attempt returns an error, which (with the indictment above) lands on the next
  rung. Never after a timeout: a second 12s wait stalls the tool call worse than the denial does.
- **The profile bridge no longer honours a global default.** `resolveProfileFor` read
  `profile.json` as a rung below the session and parent records, which is how a machine-wide
  `uncensored` reached this gate and made it refuse to classify EVERY gray-zone command, in every
  session, in ~10ms, with nothing on screen to explain it (measured 2026-09-08; set 09-07 03:56).
  The router removed the global profile; a start-screen choice is now armed as a
  one-shot and written onto the single session it was meant for, so it arrives here as that
  session's own record — the first rung, which was always the right one.

## [0.3.0] — 2026-09-07

### Fixed

- ☠️ **The profile check was an allowlist, so a profile the router knew and this file did not
  failed OPEN.** `plugin.js` denies cloud classification for anything that is not `auto` or
  `manual`, and it asks `resolveProfileFor()` what the profile is. An unrecognised name returned
  `null`, resolution fell through to `auto`, and the deny was silently skipped — shipping command
  text (paths, hostnames, inline secrets) to a cloud classifier with nothing logged. Adding
  `uncensored-70b` and `vision` in the router would have done exactly that to two new
  privacy-relevant lanes.
  ☠️ It could never have been kept in sync by import: guardrails deliberately has NO dependency on
  the router and reads its state files as a documented contract, so any hand-copied list here
  drifts the moment the router gains a profile. The check is now on the SHAPE of the name, and an
  unknown profile is therefore treated as restrictive by the caller — the safe direction. A
  corrupted record reads as some non-`auto` string and fails CLOSED.
  ☆ `auto` and `manual` keep their meaning; they are compared by value at the point of use rather
  than by membership of a list that can go stale.

## [0.2.0] — 2026-09-07

### Added

- **The classifier lease now declares its request size, which is what makes a LOCAL fallback
  classifier reachable at all.** Every brokered classifier target is a cloud subscription, so a
  billing or auth failure takes the whole lane out at once — and a classifier that cannot answer
  makes this gate fail CLOSED on every gray-zone command, which stops the user's shell rather than
  degrading it. The router can now rung down to a local model for exactly that case
  (from its 0.22.1), but it refuses a local target outright when the lease carries no
  `contextTokens`: a missing estimate must never admit a local model, because an unknown size could
  overflow its window. The classifier's prompt is bounded and fully known here — system prompt plus
  one cwd and one command — so it is now measured and sent, and the local rung becomes usable
  instead of configured-but-dead.
- `local-classifier` mapped to a local classifier agent in `DEFAULT_BROKER_AGENTS`, so a leased local rung
  resolves to a real pinned agent instead of throwing `no classifier agent configured for broker
  target`. The agent must pin a SMALL NON-THINKING model: a thinking model spends its whole output
  budget on reasoning and returns no `SAFE`/`RISKY` text, which lands here as
  `classifier returned no text` and denies the command. Measured 2026-09-07 over 14 labelled
  commands x3 runs: `qwen3.5-4b` (non-thinking) 13/14 correct, 14/14 identical across runs, ~200ms
  typical against this plugin's 12s timeout; `qwen3.5-9b` (thinking) 12/14 at 10-54s, i.e. mostly
  TIMEOUTS in production, and one empty verdict from hitting its token cap.

## [0.1.6] — 2026-09-02

### Fixed

- **The native credential guard no longer blocks an ordinary glob under
  `$HOME`.** A read-only `glob` for a specific path (e.g.
  `**/py_modules/push_bridge/cursor.py` with base `$HOME`) was refused as
  "names a credential store". The glob branch blocked whenever the search base
  was any ancestor of a protected path — and `$HOME` sits above `~/.ssh/id_` —
  while ignoring the pattern entirely, so every wildcard glob under `$HOME` was
  caught. A glob only lists paths, so it is now blocked only when the resolved
  pattern could actually enumerate a credential file (`glob ~ **/*` still
  reaches `~/.ssh/id_ed25519` and still blocks; a specific non-credential leaf
  does not). `read` of a credential and recursive `grep` over a credential tree
  are unchanged.

## [0.1.5] — 2026-09-02

### Added

- **Cross-session classifier cache.** A command's SAFE/RISKY verdict is keyed
  by (cwd, command) and shared across ALL sessions via a small file, so a
  command classified once (`git status`, `npm test`, ...) is reused instantly
  by every other concurrent session instead of each re-classifying from
  scratch. This is what actually scales the classifier to many sessions --
  the classifier is already parallel and cloud-routed, so the bottleneck was
  redundant re-classification, not instance count. In-memory per-session cache
  stays as the hot layer; the file adds the cross-session layer (6h TTL,
  atomic writes, 2000-entry cap, decided verdicts only).

## [0.1.4] — 2026-09-01

### Fixed

- **The safety classifier no longer benches a healthy provider.** Two bugs:
  (1) it read only `type:"text"` parts, so a reasoning model (gpt-5.6-luna)
  that answers in a reasoning channel looked empty -> "classifier returned no
  text"; extraction now falls back to any text-bearing part. (2) That empty
  result, and classifier timeouts, were reported to the broker as provider
  `/failure`, circuiting the worker lane (gpt-luna) and flagging openai
  "observing". Empty/timeout is not a provider fault -- it now falls back to
  the safe default without touching provider health; only real transport
  errors indict.

## [0.1.3] — 2026-09-01

### Fixed

- The vendored broker client gains the router client's transient-retry
  semantics (2500ms + one retry): one slow broker tick under host load
  surfaced as "classifier down" in the session.

## [0.1.2] — 2026-08-31

### Changed

- Broker classifier agent map gains the anthropic `haiku` target — the
  classifier prefers anthropic while healthy.

## [0.1.1] — 2026-08-31

### Changed

- Default broker classifier agents now include the `gpt-luna` worker target
  (cheapest current lightweight model); `gpt-mini` mapping kept for older pools.

## [0.1.0] — 2026-08-31

### Added

- Initial extraction from a private configuration monorepo as a standalone package:
  permission modes (manual / edits / auto / god), the bash safety floor
  (cc-safety-net + credential guards + static read table + LLM classifier),
  secret redaction with the time-boxed reveal window, and the `oc-mode` /
  `oc-auto` / `oc-check` / `oc-reveal` CLIs.
- Site configuration in `~/.config/opencode-guardrails/config.json`:
  `extraCredentialPatterns` (added to the built-in floor; can only add
  protection) and `credentialAdvice` (appended to every credential denial).
- `classifier.json` gained `brokerAgents` and `systemPrompt`; the direct
  classifier route now requires an explicit `url` (env
  `OPENCODE_GUARDRAILS_CLASSIFIER_URL` or config) — no baked-in endpoint.

### Changed (vs. the monorepo original)

- Per-profile tool restrictions and offline sandboxing moved to
  the model router, whose plugin enforces them in its own hook; this
  plugin reads profiles through the router's on-disk contract
  (`lib/routing-bridge.js`) purely to keep privacy profiles away from cloud
  classifiers, and treats "router absent" as profile `auto`.
- The tier-gate cross-import was dropped — the tier-gate plugin's own
  `tool.execute.before` hook already enforces its gate.
- cc-safety-net and the SDK v2 client resolve dual-mode: the host's
  `~/.config/opencode/node_modules` first, normal package resolution second.
