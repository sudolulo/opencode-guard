# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Versions before 1.0.0
were released privately as opencode-guardrails.

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
