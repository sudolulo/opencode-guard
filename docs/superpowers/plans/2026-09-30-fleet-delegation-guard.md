# Guard Delegation Authorization Migration Implementation Plan

Rebased 2026-10-08 onto opencode-guard 1.7.1 (3a2f566)
- Base gate, prerequisites and Task 1 Step 0 now require a committed 1.7.x release (measured at `3a2f566`, Release 1.7.1) and `lib/tree.js`; this plan's release is renumbered 1.7.0 -> 1.8.0 (build ID `opencode-guard@1.8.0`) everywhere, because 1.7.0 and 1.7.1 already exist. The semver reasoning is unchanged.
- Every `plugin.js`, `lib/policy.js` and test line anchor is re-measured at `3a2f566` (plugin.js 1146 lines; factory `:180`; hooks `:697-1145`; `tool.execute.before` `:721-978`); baseline suite is 165 tests in 11 files.
- Matrix rows 3a (tree rules G1/G2/G4) and 4a (G3 unresolvable inherited mode) added as hard floors, in the 1.7.x precedence: after the dispatch gate, before config deny, and above every GOD/mode effect, including live authority.
- Task 3 ports the 1.7.x tree gate and a single eager G3 mode resolution into `tool.authorize` (replacing 1.7.1's lazy `currentMode()` memo) and migrates `tests/tree-rules.test.mjs` to the new hook, with live-authority cases.
- Task 1 adds `tests/tree-rules.test.mjs` to the factory harnesses that need the delegation stub; Task 4 rewrites the event-driven G3 tree test (child permission events stop being answered) as a `tool.authorize` test and pins `unattended` reaching G2.
- Task 5 converts the 1.7.x tree/G3 log sites to fixed codes, adds a rule-ID log test, updates the README tree-rules and inheritance sections and `docs/STATE.md`, places the changelog entry under `## [Unreleased]`, and notes the lockfile root version is stale at `1.4.0`.
- Five binding 2026-10-08 decisions (section "Reconciliation notes") reconcile the 1.7.x tree rules with delegation authority: G1 remains an independent guard floor, G2 uses canonical root identity when branch input is present, G4 cross-checks canonical branch delivery/kind against history, explicit manual ancestry caps live authority, and tree/G3 denial text reaches the agent through `output.reason`.

**2026-10-12 addendum:** This plan's batch now targets guard 1.9.0, following the published main release 1.8.0. The 2026-10-08 BASE SHA, measured base suites, and release-version statements are historical; preserve them as recorded, including the completed Task 1 preflight's 1.7.x requirements.

> **For agentic workers:** This plan is executed by the `plan-run` workflow. Each task prompt is this header plus that one task; everything binding on more than one task is in this header. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release opencode-guard 1.9.0 with host-fenced participant lifecycle, pre-persistence delegation sanitization, and pre-execution policy moved to the awaited `tool.authorize` contract without weakening existing hard floors, including the 1.7.x agent-team tree rules (G1, G2, G4) and the G3 inherited-mode rule.

**Architecture:** Consume only `PluginInput.delegation`; do not import OpenCode core or schema packages. A new delegation helper owns participant lifecycle and typed payload sanitization. Existing policy, classifier, safety-net, redaction, loop, notifier, and broker code remains authoritative for its current concern.

**Tech Stack:** Node.js 20+ ESM, `node:test`, `@opencode-ai/sdk`, `cc-safety-net`, OpenCode plugin API `opencode.delegation/plugin-v1`.

**Spec:** `/home/dev/opencode-guard/docs/superpowers/specs/2026-09-30-core-delegation-authority-design.md`

## Prerequisites (operator, before starting plan-run)

Holden (the operator) runs these from any shell before starting plan-run. No task creates or repairs the worktree.

1. Confirm the live checkout is a committed 1.7.x release with the launder floor and the tree rules committed:

```bash
git -C /home/dev/opencode-guard log --oneline -1 -- tests/launder.test.mjs && git -C /home/dev/opencode-guard log --oneline -1 -- lib/tree.js && git -C /home/dev/opencode-guard show HEAD:package.json | node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8")).version; console.log(v); if(!/^1\.7\.\d+$/.test(v)) process.exit(3)'
```

Expected: two commit lines, then a `1.7.x` version, exit 0. On exit 3 or a missing commit line, do not start this plan: the release number `1.8.0` and the cited line ranges must be re-measured first.

2. Create the worktree from the recorded base (uncommitted changes in the live checkout stay there and do not enter the worktree):

```bash
BASE=$(git -C /home/dev/opencode-guard rev-parse HEAD) && echo "BASE=$BASE" && git -C /home/dev/opencode-guard worktree add -b plan2 /home/dev/opencode-guard-plan2 "$BASE"
```

Expected: exit 0. Keep the printed `BASE` value.

3. Install locked dependencies in the worktree:

```bash
cd /home/dev/opencode-guard-plan2 && npm ci --no-fund --no-audit && test -z "$(git status --porcelain)"
```

Expected: exit 0; the tree is still clean afterwards.

**Plan 1 dependency:** the API this plan consumes is defined by Plan 1, `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md` (sections "Normative Contracts" and "Plan 1 Authoritative Consumer Interfaces and Commands"). Plan 1 must provide exactly `input.branch.delivery`, `input.branch.kind`, and optional `output.reason` beyond its existing branch fence. R3 obtains direct-root-child status from guard's own session tree. Every test in this plan injects a stub `delegation` object, so executing the plan does not require Plan 1 to be merged; running guard 1.9.0 against a live OpenCode does require a core that implements Plan 1.

## How to run

```bash
cd /home/dev/opencode-guard-plan2 && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-guard.md"} background:true'
```

## Global Constraints

- Execute every command and commit in the worktree `/home/dev/opencode-guard-plan2` that the Prerequisites create; never edit, stage, or commit in `/home/dev/opencode-guard` or `/home/dev/projects/opencode`. The live checkout `/home/dev/opencode-guard` may hold another session's work; never stage, stash, reset, or otherwise touch it.
- Task 1 Step 0 is a hard gate: the worktree base (guard `main` HEAD when the worktree was created) must be a committed 1.7.x release (measured 2026-10-08 at `3a2f566`, Release 1.7.1, which includes the launder floor and `tests/launder.test.mjs`, the tree rules in `lib/tree.js`, and `tests/tree.test.mjs` and `tests/tree-rules.test.mjs`); otherwise stop with BLOCKED. Plan 2 guard releases as 1.9.0 (it was planned as 1.7.0 before 1.7.0 and 1.7.1 shipped the tree rules; the minor bump reasoning is unchanged).
- The 1.7.x tree rules keep their meaning and their precedence. G1 remains a fresh `session.get(T).parentID === S` guard floor, including nonexistent-id refusal, beside core branch ownership: either refusal denies. G2 uses canonical root identity when the authorize input has its own `branch` key, otherwise the session tree; G4 keeps history classification and, when canonical branch `kind`/`delivery` are present, denies disagreement. G1/G2/G4 run immediately after the read-intent dispatch gate and before config deny; G3 resolves the stricter inherited mode and whether any session in the chain explicitly sets `manual` before anything reads the effective mode. An explicit `manual` caps live authority; unreadable ancestry denies. `lib/tree.js` is not edited by this plan.
- Before editing in any task, run `test "$(git -C /home/dev/opencode-guard-plan2 rev-parse --show-toplevel)" = "/home/dev/opencode-guard-plan2" && git -C /home/dev/opencode-guard-plan2 status --short`. Stop if the path is absent, differs, or has unrelated changes.
- Add no dependency on `@opencode-ai/core` or `@opencode-ai/schema`; do not import their source or generated types.
- Use Plan 1's exact keys: `input.arguments` (not `args`), `output.decision`, optional `output.reason`, hook names `tool.authorize` and `delegation.sanitize`, and sanitizer discriminants `status`/`payload` or `status`/`code`.
- Only non-null `input.authority` proves live GOD. A mode file containing `god` without authority is `auto`; children never inherit file-derived GOD.
- GOD bypasses only promptable risk. Effective/immutable deny, inconsistent branch identity, absent tool, stale turn, read-only dispatch mismatch, tree rules G1/G2/G4 (`treeRuleRefusal`, including a failed tree lookup), an unresolvable inherited mode (G3), config deny rule (`configDenyReason`), guard-control mutation, reveal arm, hard credential access (shell and native), cc-safety-net denial/analysis failure, and the launder floor (`launderReason`) remain denials in every mode, under a per-session file `god`, and under live authority. `nativeCredentialGuardBlocks` is always called with the constant `mode: "auto"`, so neither a file `god` nor live authority can reach its GOD exemption.
- Line ranges in this plan are against opencode-guard commit `3a2f566` (Release 1.7.1, `plugin.js` 1146 lines: factory `180`, hooks object `697-1145`, `tool.execute.before` `721-978`; `lib/policy.js` 1618 lines; `lib/tree.js` 361 lines; complete suite 165 tests in 11 files, all passing). If Task 1 Step 0 records a different `BASE`, re-grep each cited symbol before editing; the symbol, not the number, is authoritative.
- `on` and `static` advertise authorization and sanitizer capabilities. Transition to `off` must await `markUnavailable` and `withdrawParticipant`; `off` means no guard authorization, sanitizer, redaction, loop tracking, or classifier.
- Delegation sanitization never honors the reveal window, including live GOD.
- Logs contain no raw command, arguments, question/option text, permission pattern/description, credential, controller material, or pre-sanitized error. Log only fixed event/error codes, IDs, tool names, counts, and rule IDs.
- `tool.authorize` output is `{ decision, reason? }`. Every G1/G2/G4 and G3 denial sets `reason` to its existing 1.7.x denial text, which core shows with the denial; former non-tree `tool.execute.before` throw texts are deleted with their throws, never reworded. `plugin.js` must contain no Manual, F9, mode-switch, or bypass advice string (pinned by a source test in Task 5).
- Every production change follows a literal test body, observed RED, then implementation. Complete suite: `node --test tests/*.test.mjs`; never `node --test tests/`.
- Keep `plugin.js` at exactly one export, `OpencodeGuard`; helpers live under `lib/`.
 - Release exactly `1.9.0` (build ID `opencode-guard@1.9.0`) in `package.json`, both root-package entries in `package-lock.json` (`version` and `packages[""].version`; both read a stale `1.4.0` at `3a2f566`), and a new `## [1.9.0]` `CHANGELOG.md` heading dated with the day the release commit is made (`date +%F`, never earlier than `2026-10-08`), inserted above the published `## [1.8.0]` entry.
- The attended/unattended source is an explicit factory option, never an environment variable: production reads `/proc/self/cmdline`; tests inject the token array. `lib/policy.js` contains no `NODE_ENV` or `OPENCODE_GUARD_TEST_CMDLINE` read.

## Authoritative Plan 1 API

```js
// PluginInput.delegation (Plan 1 DelegationBranchApi, participant subset)
delegation.registerParticipant(input /* PluginParticipantInput */) // -> Promise<ParticipantStatus>
delegation.heartbeatParticipant(input /* PluginParticipantInput */) // -> Promise<void>
delegation.markUnavailable({ component })   // -> Promise<void>
delegation.withdrawParticipant({ component }) // -> Promise<void>
delegation.participantStatus({ component })   // -> Promise<ParticipantStatus | null>
delegation.listParticipants()

// Exact hook input/output. When the `branch` key is present and non-null, its
// core record also carries `delivery` and `kind`.
"tool.authorize": async (input, output /* { decision: "continue" | "handoff" | "deny", reason?: string } */) => {
  const args = input.arguments
}

// Exact sanitizer hook/result
"delegation.sanitize": async ({ branch, payload }) =>
  ({ status: "sanitized", payload })
// or
  ({ status: "unredactable_secret", code: "unredactable_secret" })
```

The complete authorization input keys are `sessionID`, `rootSessionID`, `branchID`, `tool`, `callID`, `arguments`, `baseline`, `worker`, `execution`, `branch`, and `authority`; when `branch` is non-null it includes core record fields `delivery` and `kind` beyond BranchFence. Decisions compose `deny > handoff > continue`. Core owns permits, fences, outcomes, terminal propagation, and presents `output.reason` with a denial.

Register and heartbeat the participant with this exact `PluginParticipantInput` (Plan 1 `packages/plugin` delegation types):

```js
{
  component: "guard",
  buildID: "opencode-guard@1.9.0",
  protocol: "opencode.delegation/v1",
  capabilities: ["toolAuthorizeV1", "terminalHandoffV1"],
}
```

Fence and withdraw with exactly `{ component: "guard" }`. The host binds the Worker, coordination domain, and heartbeat time; guard never derives, reads, or sends `worker`, `coordinationDomain`, or `heartbeatAt`, never calls `participantStatus({ component: "core" })` to obtain a Worker, and never calls `Date.now` for participant input.

## Required Authorization Matrix

### Hard-floor order (`level=on|static`)

| Order | Condition | Decision | GOD effect |
|---:|---|---|---|
| 0 | inconsistent branch input: exactly one of `branch`/`branchID` is null, or `branch === null && sessionID !== rootSessionID` | `deny` | none |
| 1 | `baseline.decision === "deny"` or `baseline.immutableDeny` | `deny` | none |
| 2 | readable status map says session absent/idle | `deny` | none |
| 3 | read-only agent lacks literal first-line `INTENT: read` | `deny` | none |
| 3a | G1's fresh parent check or core branch ownership refuses; G2 uses canonical root (`input.branch === null && input.sessionID === input.rootSessionID`) when the input has its own `branch` key, otherwise `tree.parentOf`; G4 compares history with branch `delivery === "background"` only when `tree.parentOf(input.sessionID) === input.rootSessionID` and branch `kind`/`delivery` are present. Every lookup failure and disagreement refuses; see R1-R3. | `deny`, with the existing G1/G2/G4 text in `output.reason` | none |
| 4 | process command matches a config deny rule (`configDenyReason(command, await rulesFor(sessionID))`; holds over an "Always" approval) | `deny` | none |
| 4a | G3: the session's mode/manual-ancestry resolution cannot be completed because `modeFor(sessionID)` throws (unreadable, looping, or deeper-than-16 ancestry). This is the one ancestry walk per call; rows 10-14 read its result. See R4. | `deny`, with the existing G3 text in `output.reason` | none: denies with live authority too |
| 5 | native/shell write to mode, level, reveal, per-session mode, or classifier control | `deny` | none |
| 6 | reveal-arm attempt | `deny` | none |
| 7 | native/process access to a hard credential path (native check called with constant `mode: "auto"`) | `deny` | none |
| 8 | cc-safety-net deny or throw (`analysis-error`) | `deny` | none |
| 9 | launder: a natively-allowed segment whose parsed argv writes or runs a program (`launderReason(command, await rulesFor(sessionID))`) | `deny` | none (attended file `god` lifted it at `plugin.js:820` through commit `3a2f566`) |
| 10 | promptable credential | table below | live authority may `continue` |
| 11 | no process command, or checked `pty_write` | `continue` | n/a |
| 12 | `static` | no classifier; baseline/context table below | live authority may `continue` |
| 13 | static read | `continue` | n/a |
| 14 | `on` non-read | classifier/context table below | live authority skips classifier |

`safetyNetVerdict(...).kind === "unavailable"` retains current behavior and falls through; a thrown analyzer remains a hard denial.

### Level, mode, primary/child, attendance, classifier, and credentials

“Primary prompt” means return `continue` and preserve the ordinary primary Permission path. “Child handoff” means `output.decision = "handoff"`; core sanitizes, persists, terminates, and delivers it.

| Level/context | Baseline allow/static read | SAFE | RISKY/error/no lane | Promptable credential |
|---|---|---|---|---|
| `off`, any context | `continue`, no inspection | same | same | same; participant absent |
| `static`, attended primary | `continue` | no classifier; primary prompt for effective ask | same | primary prompt |
| `static`, child without authority | `continue` only if baseline allows; otherwise handoff | no classifier; handoff for ask | same | handoff |
| `static`, unattended primary | `continue` after hard floors | same | same | `deny` |
| `on`, attended primary `manual`/`edits` | `continue` | no classifier; primary prompt for ask | same | primary prompt |
| `on`, attended primary `auto` | `continue` | `continue` | `continue` to visible primary prompt | primary prompt, never auto-reply |
| `on`, child `manual`/`edits`, no authority | `continue` only if baseline allows; otherwise handoff | no classifier; handoff for ask | handoff | handoff |
| `on`, child `auto`, no authority | `continue` | `continue` | handoff | handoff |
| `on`, unattended primary, no authority | `continue` | `continue` | `deny` | `deny` |
| `on|static`, non-null authority | hard floors first, then `continue` | classifier skipped, `continue` | classifier skipped, `continue` | `continue` |
| file says `god`, authority null | treat as matching `auto` row | matching `auto` row | matching `auto` row | matching non-GOD row |

A registered child is identified only by canonical `input.branch`/`branchID`; do not infer registration from a local parent lookup. Core rejects unregistered children before execution. Primary means `branch === null`, `branchID === null`, and `sessionID === rootSessionID`; child means both `branch` and `branchID` are non-null. Any other combination is inconsistent input and is denied (hard-floor row 0) before any other check.

### Hooks retained

| Hook | Responsibility after migration |
|---|---|
| `chat.params` | no-thinking only for `fleet-classifier` on configured local providers |
| `tool.execute.after` | tool-output redaction and loop tracking only |
| `event` | team-index feed (`teamIndex.observe`, first, at every level including `off`), notifier, `session.deleted` cleanup, the blanket-"Always" report, and primary `edits`/`auto` permission replies; no child-denial map and no file-GOD reply |
| `dispose` | stop heartbeat, then await unavailable/withdraw |
| `delegation.sanitize` | sanitize typed outcome candidates |
| `tool.authorize` | all pre-execution authorization |

## Review Focus

1. Live authority bypasses promptable risk only; each hard floor still denies.
2. A stale `god` mode file without authority cannot approve a child, credential path, or safety-net denial.
3. `on|static -> off` cannot return from authorization before unavailability and withdrawal finish; failed fencing never silently continues.
4. Every question/permission string is sanitized despite reveal/GOD, and no raw sentinel reaches logs.
5. Primary behavior remains usable: `manual`/`edits` avoid classifier calls, AUTO SAFE may auto-reply, AUTO RISKY and promptable credentials remain prompts, and child asks never become UI prompts.
6. The 1.7.x tree rules survive the hook move: G1 and core ownership both must admit a resume; G2 uses canonical root identity when branch input is present and tree fallback otherwise; G4 denies canonical/history disagreement; G3 resolves mode plus an explicit-manual ancestry flag in one walk, so any manual file caps authority and an unreadable ancestry denies. Every G1-G4 denial reaches core through `output.reason`; `off` makes no session lookup.

## Reconciliation notes (tree rules vs delegation authority)

These 2026-10-08 Holden decisions bind every task below. Decisions compose `deny > handoff > continue`; where guard and core both decide admission, either denial wins.

> **DECIDED 2026-10-08 (Holden): R1 -- G1 and core branch ownership.** Keep both the fresh G1 `session.get(T).parentID === S` check, including nonexistent-id refusal, and core branch ownership; either denial denies. The accepted risk is that their parent sources can disagree and guard can refuse a resume core would admit.
>
> **DECIDED 2026-10-08 (Holden): R2 -- G2 canonical root identity.** Detect branch-input presence with `"branch" in input`; when present, root is exactly `input.branch === null && input.sessionID === input.rootSessionID`, with no tree lookup. When absent, retain `tree.parentOf(sessionID) === null`; attended determination is unchanged.
>
> **DECIDED 2026-10-08 (Holden): R3 -- G4 history and canonical branch classification.** Keep history-based G4 classification; when `input.branch.kind` and `input.branch.delivery` are present, classify a direct child of the root as a teammate exactly when `delivery === "background"` and deny any disagreement with history. Direct child means `tree.parentOf(input.sessionID) === input.rootSessionID`; a failed lookup denies with the existing G4 text. For a deeper descendant, use history classification only.
>
> **DECIDED 2026-10-08 (Holden): R4 -- explicit manual caps live authority.** With live authority, any explicit `manual` mode file in the caller's own session or an ancestor caps the effective mode at `manual` instead of `god`; otherwise live authority still produces `god`. Without live authority the 1.7.x G3 file-mode result is unchanged, and a G3 lookup failure still denies.
>
> **DECIDED 2026-10-08 (Holden): R5 -- tree and G3 denial text.** Every G1, G2, G4, and G3 denial sets `output.reason` to the existing 1.7.x denial text, which core presents to the model with the deny. Non-tree hard floors need not set a reason unless this plan already requires one.

---

### Task 1: Host-safe participant lifecycle

**Files:**
- Create: `lib/delegation.js`
- Create: `tests/delegation-lifecycle.test.mjs`
- Modify: `plugin.js:180` (factory signature), `plugin.js:181-696` (factory setup, lifecycle construction), `plugin.js:697-1145` (hooks object, add `dispose`)
- Modify: `tests/plugin-exports.test.mjs:8-117` (`runRoutedClassifier`, `OpencodeGuard(` at `:88`), append after `:224`
- Modify: `tests/broker.test.mjs:102-246` (`OpencodeGuard(` at `:220`)
- Modify: `tests/loop-guard.test.mjs:226-251` (`runPlugin`, `OpencodeGuard(` at `:236`)
- Modify: `tests/stale-turn.test.mjs:10-48` (`run`, `OpencodeGuard(` at `:35`)
- Modify: `tests/permission-event.test.mjs:11-46` (`raise`, `OpencodeGuard(` at `:32`)
- Modify: `tests/launder.test.mjs:201-242` (`runHook`, `OpencodeGuard(` at `:223`; Step 8 makes the factory reject without `delegation`, which breaks this harness first)
- Modify: `tests/tree-rules.test.mjs:17-105` (`run`, `OpencodeGuard(` at `:72`, final `console.log` at `:92`; added 1.7.0)

**Interfaces:**
- Produces `GUARD_PARTICIPANT` with the exact metadata above.
- Produces `createParticipantLifecycle({ delegation, readLevel, setTimer, clearTimer, onError }) -> { start, reconcile, dispose, participant }`; all operations return Promises and serialize behind one in-flight chain. There is no `now` option: participant input carries no timestamp.
- `reconcile()` compares `readLevel()` with the cached state (last applied level plus `participant.current`) and calls the host only on a level transition or a missing registration: `on|static` with no current registration registers; a transition to `off` awaits `markUnavailable({ component: "guard" })` then `withdrawParticipant({ component: "guard" })` and clears local state only after both succeed. With no transition and a current registration it resolves without any host call. It never heartbeats.
- Heartbeat runs only from the 2000 ms timer, never from `reconcile()`, `tool.authorize`, or `delegation.sanitize`.
- `dispose()` clears the timer, awaits the in-flight chain, then, if a registration is current, marks unavailable and withdraws (with no current registration it makes no host call). If a fence failure was already reported (a `reconcile()` rejection or `onError`), `dispose()` reports any further fence failure only through `onError` and resolves; it rethrows nothing after the first fence failure has been reported. A first-ever fence failure during `dispose()` rejects with that error.

- [ ] **Step 0: Preflight the worktree and its base release.**

Run:

```bash
test "$(git -C /home/dev/opencode-guard-plan2 rev-parse --show-toplevel)" = "/home/dev/opencode-guard-plan2" && test "$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD)" = "$(git -C /home/dev/opencode-guard-plan2 rev-parse plan2)" && test -z "$(git -C /home/dev/opencode-guard-plan2 status --porcelain)" && test -f /home/dev/opencode-guard-plan2/tests/launder.test.mjs && test -f /home/dev/opencode-guard-plan2/lib/tree.js && test -f /home/dev/opencode-guard-plan2/tests/tree-rules.test.mjs
```

Expected: exit 0, no output.

Run:

```bash
git -C /home/dev/opencode-guard-plan2 log --oneline -1 -- tests/launder.test.mjs && git -C /home/dev/opencode-guard-plan2 log --oneline -1 -- lib/tree.js && git -C /home/dev/opencode-guard-plan2 show HEAD:package.json | node -e 'const v=JSON.parse(require("fs").readFileSync(0,"utf8")).version; console.log(v); if(!/^1\.7\.\d+$/.test(v)) process.exit(3)' && test -d /home/dev/opencode-guard-plan2/node_modules && echo "BASE=$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD)"
```

Expected: two commit lines, then a `1.7.x` version, then `BASE=<sha>`, exit 0. Record the printed `BASE` value in the task report. If the worktree is absent or not on `plan2`, the tree is not clean, `tests/launder.test.mjs` or `lib/tree.js` is absent or uncommitted, `HEAD` is not a 1.7.x release (exit 3), or `node_modules` is absent, stop and report STATUS: BLOCKED with the exact failing check and its output. Do not create the worktree, run `npm ci`, or commit, stage, stash, or copy another session's work yourself.

- [ ] **Step 1: Verify the exact clean worktree.**

```bash
test "$(git -C /home/dev/opencode-guard-plan2 rev-parse --show-toplevel)" = "/home/dev/opencode-guard-plan2" && git -C /home/dev/opencode-guard-plan2 status --short
```

Expected: exit 0, no output.

- [ ] **Step 2: Write the lifecycle tests before production code.**

Create `tests/delegation-lifecycle.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUARD_PARTICIPANT, createParticipantLifecycle } from "../lib/delegation.js";

const GUARD_INPUT = { component: "guard", buildID: "opencode-guard@1.9.0", protocol: "opencode.delegation/v1", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] };
const GUARD_COMPONENT = { component: "guard" };

const fixture = ({ initial = "on", failMark = false, failRegister = false } = {}) => {
  let level = initial;
  const calls = [];
  const timers = [];
  const delegation = {
    // Present only so the tests can prove guard never asks for the core Worker.
    participantStatus: async (input) => { calls.push(["status", input]); return null; },
    registerParticipant: async (input) => { calls.push(["register", input]); if (failRegister) throw Object.assign(new Error("register failed"), { code: "participant_unavailable" }); return { ...input, availability: "available" }; },
    heartbeatParticipant: async (input) => { calls.push(["heartbeat", input]); },
    markUnavailable: async (input) => { calls.push(["mark", input]); if (failMark) throw Object.assign(new Error("fence failed"), { code: "stale_worker" }); },
    withdrawParticipant: async (input) => { calls.push(["withdraw", input]); },
  };
  const lifecycle = createParticipantLifecycle({ delegation, readLevel: () => level,
    setTimer: (fn, ms) => { const timer = { fn, ms, unref() {} }; timers.push(timer); return timer; },
    clearTimer: (timer) => { timer.cleared = true; }, onError: (code) => calls.push(["error", code]) });
  return { calls, timers, lifecycle, delegation, setLevel: (next) => { level = next; } };
};

test("on registers the exact PluginParticipantInput and heartbeats it from the two-second timer", async () => {
  assert.deepEqual(GUARD_PARTICIPANT, GUARD_INPUT);
  const f = fixture();
  await f.lifecycle.start();
  assert.deepEqual(f.calls.filter(([name]) => name === "register"), [["register", GUARD_INPUT]]);
  assert.equal(f.calls.some(([name]) => name === "status"), false);
  assert.equal(f.calls.some(([name]) => name === "heartbeat"), false);
  assert.equal(f.timers[0].ms, 2000);
  await f.timers[0].fn();
  assert.deepEqual(f.calls.filter(([name]) => name === "heartbeat"), [["heartbeat", GUARD_INPUT]]);
  await f.lifecycle.dispose();
  assert.deepEqual(f.calls.filter(([name]) => ["mark", "withdraw"].includes(name)), [["mark", GUARD_COMPONENT], ["withdraw", GUARD_COMPONENT]]);
});

test("reconcile without a level transition makes no host call and never heartbeats", async () => {
  const f = fixture();
  await f.lifecycle.start();
  const before = f.calls.length;
  await f.lifecycle.reconcile();
  await f.lifecycle.reconcile();
  assert.equal(f.calls.length, before);
  assert.equal(f.calls.some(([name]) => name === "heartbeat"), false);
  await f.lifecycle.dispose();
});

test("off awaits unavailable then withdrawal", async () => {
  const f = fixture();
  await f.lifecycle.start();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  f.delegation.markUnavailable = async (input) => { f.calls.push(["mark-start", input]); await gate; f.calls.push(["mark-done", input]); };
  f.delegation.withdrawParticipant = async (input) => { f.calls.push(["withdraw", input]); };
  f.setLevel("off");
  let settled = false;
  const pending = f.lifecycle.reconcile().then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false);
  release();
  await pending;
  assert.deepEqual(f.calls.slice(-3), [["mark-start", GUARD_COMPONENT], ["mark-done", GUARD_COMPONENT], ["withdraw", GUARD_COMPONENT]]);
  assert.equal(f.lifecycle.participant.current, null);
});

test("failed off fence rejects without withdrawal or forgetting participant; dispose then rethrows nothing", async () => {
  const f = fixture({ failMark: true });
  await f.lifecycle.start();
  f.setLevel("off");
  await assert.rejects(f.lifecycle.reconcile(), { code: "stale_worker" });
  assert.equal(f.calls.some(([name]) => name === "withdraw"), false);
  assert.equal(f.lifecycle.participant.current.component, "guard");
  await f.lifecycle.dispose();
  assert.equal(f.calls.some(([name]) => name === "withdraw"), false);
  assert.deepEqual(f.calls.filter(([name]) => name === "error").at(-1), ["error", "stale_worker"]);
});

test("off starts absent, static re-registers, dispose fences then withdraws", async () => {
  const f = fixture({ initial: "off" });
  await f.lifecycle.start();
  assert.equal(f.calls.some(([name]) => name === "register"), false);
  f.setLevel("static");
  await f.lifecycle.reconcile();
  assert.deepEqual(f.calls.filter(([name]) => name === "register"), [["register", GUARD_INPUT]]);
  await f.lifecycle.dispose();
  assert.deepEqual(f.calls.filter(([name]) => ["mark", "withdraw"].includes(name)), [["mark", GUARD_COMPONENT], ["withdraw", GUARD_COMPONENT]]);
  assert.equal(f.timers.every((timer) => timer.cleared), true);
});

test("failed registration rejects, leaves no participant, and the next reconcile retries registration", async () => {
  const f = fixture({ failRegister: true });
  await assert.rejects(f.lifecycle.start(), { code: "participant_unavailable" });
  assert.equal(f.lifecycle.participant.current, null);
  await assert.rejects(f.lifecycle.reconcile(), { code: "participant_unavailable" });
  assert.equal(f.calls.filter(([name]) => name === "register").length, 2);
  assert.equal(f.calls.some(([name]) => name === "heartbeat"), false);
});
```

- [ ] **Step 3: Run lifecycle RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-lifecycle.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/delegation.js`.

- [ ] **Step 4: Implement the minimal serialized lifecycle.**

In `lib/delegation.js`, implement the exported constant and factory from the Interfaces block. `GUARD_PARTICIPANT` is the frozen `PluginParticipantInput` `{ component: "guard", buildID: "opencode-guard@1.9.0", protocol: "opencode.delegation/v1", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] }`. The factory must: pass exactly `GUARD_PARTICIPANT` to `registerParticipant` and `heartbeatParticipant`, and exactly `{ component: "guard" }` to `markUnavailable` and `withdrawParticipant`; never call `participantStatus`, never add `worker`, `coordinationDomain`, or `heartbeatAt`, and never call `Date.now`; cache the last applied level and the current registration so `reconcile()` calls the host only on a level transition or a missing registration; recursively schedule the 2000 ms heartbeat timer only after the previous timer run settles, and make the timer the only caller of `heartbeatParticipant`; call `unref?.()`; report timer failures through fixed `onError(error.code ?? "participant_lifecycle_failed")` and retry on the next tick; and make `dispose()` clear the timer, await the in-flight chain, mark unavailable, then withdraw, following the already-reported fence-failure rule in the Interfaces block (record a reported fence failure when `reconcile()` rejects with one). The host binds Worker and domain; guard does not generate, read, or send them.

- [ ] **Step 5: Run lifecycle GREEN.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-lifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Add the factory wiring test before changing `plugin.js`.**

Extend the existing fake-HOME `runRoutedClassifier` child script in `tests/plugin-exports.test.mjs`: create `participantCalls = []`; add the exact Task 1 delegation stub shape, with `status`, `register`, `heartbeat`, `mark`, and `withdraw` pushes that record `[name, input]`; pass `delegation` to `OpencodeGuard`; `await hooks.dispose()` before server close; and include `participantCalls` in the printed JSON. Then append:

```js
test("plugin registers and disposes the guard participant through PluginInput.delegation", () => {
  const result = runRoutedClassifier();
  assert.equal(result.participantCalls[0][0], "register");
  assert.deepEqual(result.participantCalls.slice(-2).map(([name]) => name), ["mark", "withdraw"]);
  assert.deepEqual(result.participantCalls[0][1], {
    component: "guard",
    buildID: "opencode-guard@1.9.0",
    protocol: "opencode.delegation/v1",
    capabilities: ["toolAuthorizeV1", "terminalHandoffV1"],
  });
  assert.deepEqual(result.participantCalls.slice(-2), [["mark", { component: "guard" }], ["withdraw", { component: "guard" }]]);
  assert.equal(result.participantCalls.some(([name]) => name === "status"), false);
});
```

The stub records `participantStatus` calls as `status` so the test proves guard never asks for the core Worker. No clock pin is needed: participant input carries no timestamp.

- [ ] **Step 7: Run plugin lifecycle RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/plugin-exports.test.mjs
```

Expected: FAIL because the factory does not consume `delegation` or return `dispose`.

- [ ] **Step 8: Wire lifecycle and run focused GREEN.**

Import `createParticipantLifecycle`, destructure `{ client, directory, delegation }`, construct it with `readLevel: level`, `await start()` before returning hooks (a registration failure from `start()` is logged by fixed code and does not reject the factory: the registration stays missing, so the next `reconcile()` retries it, `tool.authorize` denies, and `delegation.sanitize` returns the closed result until it succeeds), add `dispose`, and log lifecycle errors by fixed code only. A missing `registerParticipant`, `heartbeatParticipant`, `markUnavailable`, or `withdrawParticipant` rejects factory initialization (guard uses no other participant method); 1.9.0 is a compatibility-set release. Construct the lifecycle after the existing `sessionTree`/`teamIndex` construction (`plugin.js:348-351`) and leave those two declarations, and the plugin-exports source test that pins them inside the factory above `modeFor` (`tests/plugin-exports.test.mjs:214-224`), unchanged.

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-lifecycle.test.mjs tests/plugin-exports.test.mjs
```

Expected: PASS.

- [ ] **Step 9: Update every existing plugin-factory harness for the required host API.**

Retain the instrumented delegation stub already added to `tests/plugin-exports.test.mjs`. In the generated child scripts in `tests/broker.test.mjs`, `tests/loop-guard.test.mjs`, `tests/stale-turn.test.mjs`, `tests/permission-event.test.mjs`, and `tests/tree-rules.test.mjs`, add this exact stub before each `OpencodeGuard(...)` call and pass `delegation`:

```js
const delegation = {
  registerParticipant: async (input) => ({ ...input, availability: "available" }),
  heartbeatParticipant: async () => {},
  markUnavailable: async () => {},
  withdrawParticipant: async () => {},
};
```

Call `await hooks.dispose()` after each harness finishes its assertions/recording and before it closes servers or prints final JSON. Do not add an optional no-op fallback in production.

`tests/launder.test.mjs` `runHook` gets the same stub and dispose. In its generated script (`:211-232`), replace

```js
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(h)} });
```

with

```js
      const delegation = {
        registerParticipant: async (input) => ({ ...input, availability: "available" }),
        heartbeatParticipant: async () => {},
        markUnavailable: async () => {},
        withdrawParticipant: async () => {},
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(h)}, delegation });
```

and replace

```js
      console.log(JSON.stringify({ outcome, logs }));
```

with

```js
      await hooks.dispose();
      console.log(JSON.stringify({ outcome, logs }));
```

Change nothing else in `tests/launder.test.mjs` in this task; Task 3 moves it to `tool.authorize`.

`tests/tree-rules.test.mjs` `run` gets the same stub and dispose. In its generated script, replace

```js
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
```

(`:71-72`) with

```js
      const delegation = {
        registerParticipant: async (input) => ({ ...input, availability: "available" }),
        heartbeatParticipant: async () => {},
        markUnavailable: async () => {},
        withdrawParticipant: async () => {},
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work", delegation });
```

and replace

```js
      console.log(JSON.stringify({ outcomes, gets, pages, replies, modeFileReads: globalThis.modeFileReads }));
```

(`:92`) with

```js
      await hooks.dispose();
      console.log(JSON.stringify({ outcomes, gets, pages, replies, modeFileReads: globalThis.modeFileReads }));
```

Change nothing else in `tests/tree-rules.test.mjs` in this task; Task 3 moves it to `tool.authorize`. The participant stub makes no `session.get` call, so the existing `gets` assertions (including `[]` at level `off`) are unaffected.

- [ ] **Step 10: Run every affected existing harness.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-lifecycle.test.mjs tests/plugin-exports.test.mjs tests/broker.test.mjs tests/loop-guard.test.mjs tests/stale-turn.test.mjs tests/permission-event.test.mjs tests/launder.test.mjs tests/tree-rules.test.mjs
```

Expected: PASS and process exit without waiting for heartbeat timers. These are the only harnesses that call `OpencodeGuard(` at `3a2f566` (verified 2026-10-08 by `grep -n 'OpencodeGuard(' tests/*.mjs`: `broker:220`, `launder:223`, `loop-guard:236`, `permission-event:32`, `plugin-exports:88`, `stale-turn:35`, `tree-rules:72`); re-run that grep and add any new caller to this step before continuing.

- [ ] **Step 11: Commit lifecycle.**

```bash
git -C /home/dev/opencode-guard-plan2 add lib/delegation.js tests/delegation-lifecycle.test.mjs tests/plugin-exports.test.mjs tests/broker.test.mjs tests/loop-guard.test.mjs tests/stale-turn.test.mjs tests/permission-event.test.mjs tests/launder.test.mjs tests/tree-rules.test.mjs plugin.js
git -C /home/dev/opencode-guard-plan2 commit -m "feat: register the guard delegation participant"
```

### Task 2: Typed delegation sanitizer

**Files:**
- Modify: `lib/delegation.js`
- Create: `tests/delegation-sanitizer.test.mjs`
- Modify: `plugin.js:697-1145` (hooks object: add `delegation.sanitize`)

**Interfaces:**
- Consumes existing `redactSecrets(text)` (`lib/policy.js:1446-1463`), `touchesCredentials(command)` (`:399`), and `touchesPromptableCredentials(command)` (`:402`) from `lib/policy.js`; all three take a string, the latter two return booleans.
- Produces `sanitizeDelegationPayload(payload)` returning exactly `{ status: "sanitized", payload }` or `{ status: "unredactable_secret", code: "unredactable_secret" }`. It fails closed: after `redactSecrets`, any string for which `touchesCredentials` or `touchesPromptableCredentials` is true, or in which a Bearer/Basic authorization value, an attached `-p<secret>`, or a `--token`/`--password` value remains, makes the whole payload `unredactable_secret`.
- Produces exact hook key `delegation.sanitize`; it first awaits the cached `reconcile()` (a host call only on a level transition or missing registration, never a heartbeat) and returns `unredactable_secret` if the level is `off`, reconciliation rejects (registration or `markUnavailable` failure), or no registration is current.

- [ ] **Step 1: Write complete field/redaction tests.**

Create `tests/delegation-sanitizer.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeDelegationPayload } from "../lib/delegation.js";

const secret = "API_TOKEN=SHOULDNOTAPPEAR";
const clean = (result) => {
  assert.equal(result.status, "sanitized");
  assert.doesNotMatch(JSON.stringify(result), /SHOULDNOTAPPEAR/);
  return result.payload;
};

test("sanitizes every question string while preserving exact typed keys", () => {
  const payload = clean(sanitizeDelegationPayload({ type: "question", questions: [{
    header: secret,
    question: secret,
    options: [{ label: secret, description: secret }],
    allowCustom: true,
    customAnswer: secret,
  }] }));
  assert.deepEqual(Object.keys(payload).sort(), ["questions", "type"]);
  assert.deepEqual(Object.keys(payload.questions[0]).sort(), ["allowCustom", "customAnswer", "header", "options", "question"]);
  assert.deepEqual(Object.keys(payload.questions[0].options[0]).sort(), ["description", "label"]);
});

test("sanitizes permission category, pattern, and description", () => {
  const payload = clean(sanitizeDelegationPayload({ type: "permission", permission: secret, pattern: secret, description: secret }));
  assert.deepEqual(Object.keys(payload).sort(), ["description", "pattern", "permission", "type"]);
});

test("accepts only the fixed internal error and rejects malformed shapes without echoing them", () => {
  assert.deepEqual(sanitizeDelegationPayload({ type: "internal_error", message: "Delegated interaction could not be transferred." }), {
    status: "sanitized", payload: { type: "internal_error", message: "Delegated interaction could not be transferred." },
  });
  for (const payload of [null, { type: "unknown", value: secret }, { type: "question", questions: [{ header: 42 }] }, { type: "internal_error", message: secret }]) {
    assert.deepEqual(sanitizeDelegationPayload(payload), { status: "unredactable_secret", code: "unredactable_secret" });
  }
});

test("sanitization is independent of reveal state", () => {
  process.env.OPENCODE_GUARD_REVEAL_TEST = "open";
  try { clean(sanitizeDelegationPayload({ type: "permission", permission: "bash", pattern: secret, description: secret })); }
  finally { delete process.env.OPENCODE_GUARD_REVEAL_TEST; }
});

const CLOSED = { status: "unredactable_secret", code: "unredactable_secret" };
const permissionWith = (pattern) => sanitizeDelegationPayload({ type: "permission", permission: "bash", pattern, description: "Run a command" });

test("a hard credential path that survives redaction fails closed", () => {
  assert.deepEqual(permissionWith("cat ~/.ssh/id_ed25519"), CLOSED);
});

test("a promptable credential command that survives redaction fails closed", () => {
  assert.deepEqual(permissionWith("rbw get deployment-token"), CLOSED);
});

test("a Bearer authorization value in any question string fails closed", () => {
  assert.deepEqual(sanitizeDelegationPayload({ type: "question", questions: [{
    header: "Deploy",
    question: "Run the deploy?",
    options: [{ label: "yes", description: 'curl -H "Authorization: Bearer ZXhhbXBsZXRva2VuMTIz" https://example.invalid' }],
    allowCustom: false,
  }] }), CLOSED);
});

test("a Basic authorization value fails closed", () => {
  assert.deepEqual(permissionWith('curl -H "Authorization: Basic dXNlcjpwYXNzd29yZA==" https://example.invalid'), CLOSED);
});

test("an attached -p<secret> fails closed", () => {
  assert.deepEqual(permissionWith("mysql -uroot -pHunter2Secret appdb"), CLOSED);
});

test("a --token value fails closed", () => {
  assert.deepEqual(permissionWith("gh auth login --token ghp_EXAMPLEVALUE123"), CLOSED);
});

test("a --password value fails closed", () => {
  assert.deepEqual(permissionWith("deploy --password hunter2value"), CLOSED);
});

test("a clean payload, a spaced -p flag, and a value redactSecrets already replaced still pass", () => {
  const payload = clean(sanitizeDelegationPayload({ type: "permission", permission: "bash", pattern: "mkdir -p build", description: "deploy --password=SHOULDNOTAPPEAR" }));
  assert.equal(payload.pattern, "mkdir -p build");
  assert.match(payload.description, /^deploy --password=\[redacted by opencode-guard\]$/);
});
```

These strings were checked by execution against `lib/policy.js` at `0b52854`; at `3a2f566` the redaction and credential-pattern code is textually unchanged (`git diff 0b52854 3a2f566 -- lib/policy.js` touches only `unattendedFrom`, the new `stricterMode`/`resolveTreeMode`, and the export block), so the results carry over. They were not re-executed at `3a2f566`, because the live guard refuses a verification command that names these credential paths. Results at `0b52854`: `redactSecrets` leaves every fail-closed string above unchanged (count 0), `touchesCredentials` is true for the `.ssh` path and the `rbw` command, `touchesPromptableCredentials` is true for the `rbw` command, and `deploy --password=X` is redacted to `deploy --password=[redacted by opencode-guard]`, which the residual patterns must not count as a remaining value.

- [ ] **Step 2: Run sanitizer RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-sanitizer.test.mjs
```

Expected: FAIL because `sanitizeDelegationPayload` is not exported.

- [ ] **Step 3: Implement the schema-allowlisting sanitizer.**

Import `redactSecrets` into `lib/delegation.js`. Implement a local `sanitizeString(value)` that rejects non-strings and returns `redactSecrets(value).text`. Reconstruct, rather than spread, only these allowed shapes:

```js
{ type: "question", questions: [{ header, question, options: [{ label, description }], allowCustom, ...(customAnswer !== undefined ? { customAnswer } : {}) }] }
{ type: "permission", permission, pattern, description }
{ type: "internal_error", message: "Delegated interaction could not be transferred." }
```

Require arrays/booleans/strings exactly. Catch no arbitrary error text; any shape or sanitization failure returns the fixed `unredactable_secret` object. Do not call `revealActive` or `revealing`.

Make `sanitizeString` fail closed after redaction. Import `touchesCredentials` and `touchesPromptableCredentials` from `lib/policy.js` alongside `redactSecrets`, and define in `lib/delegation.js`:

```js
// Values redactSecrets already replaced carry this marker; a marker is not a remaining secret.
const NOT_MARKER = "(?!\\[redacted by opencode-guard\\])";
const RESIDUAL_SECRET_PATTERNS = [
  new RegExp(`\\b(?:Bearer|Basic)\\s+${NOT_MARKER}[A-Za-z0-9._~+/-]+=*`, "i"),
  new RegExp(`(?:^|\\s)-p${NOT_MARKER}\\S+`),
  new RegExp(`--(?:token|password)(?:=|\\s+)${NOT_MARKER}\\S+`, "i"),
];
```

`sanitizeString(value)` computes `text = redactSecrets(value).text`, then throws a fixed internal sentinel (caught by the payload builder and turned into the closed result) when `touchesCredentials(text) || touchesPromptableCredentials(text) || RESIDUAL_SECRET_PATTERNS.some((re) => re.test(text))`; otherwise it returns `text`. The check runs on every string field of every allowed shape, so one residual secret anywhere closes the whole payload. These patterns are deliberately broad: `cp -pr` or `find . -print` also close the payload. That is the intended fail-closed trade, because a false negative persists a secret and a false positive only refuses one handoff.

- [ ] **Step 4: Run helper GREEN.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-sanitizer.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add exact hook tests before wiring it.**

Append to `tests/delegation-sanitizer.test.mjs`:

```js
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const invokeHook = (level, { registerFails = false } = {}) => {
  const home = mkdtempSync(join(tmpdir(), "guard-sanitize-hook-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    writeFileSync(join(home, ".config/opencode/autoclass"), `${level}\n`);
    writeFileSync(join(home, ".config/opencode/reveal"), `${Date.now() + 60000}\n`);
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const delegation = {
        registerParticipant: async (x) => { if (${JSON.stringify(registerFails)}) throw Object.assign(new Error("participant unavailable"), { code: "participant_unavailable" }); return { ...x, availability: "available" }; },
        heartbeatParticipant: async () => {},
        markUnavailable: async () => {}, withdrawParticipant: async () => {},
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client: { session: {}, app: { log: async () => {} } }, directory: "/work", delegation });
      const result = await hooks["delegation.sanitize"]({ branch: { branchID: "branch_a" }, payload: { type: "permission", permission: "bash", pattern: "API_TOKEN=SHOULDNOTAPPEAR", description: "API_TOKEN=SHOULDNOTAPPEAR" } });
      await hooks.dispose();
      process.stdout.write(JSON.stringify(result));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  } finally { rmSync(home, { recursive: true, force: true }); }
};

test("delegation.sanitize returns exact sanitized keys even when reveal is open", () => {
  const result = invokeHook("on");
  assert.equal(result.status, "sanitized");
  assert.deepEqual(Object.keys(result).sort(), ["payload", "status"]);
  assert.doesNotMatch(JSON.stringify(result), /SHOULDNOTAPPEAR/);
});

test("delegation.sanitize is unavailable at level off", () => {
  assert.deepEqual(invokeHook("off"), { status: "unredactable_secret", code: "unredactable_secret" });
});

test("delegation.sanitize returns the closed result when participant registration fails", () => {
  assert.deepEqual(invokeHook("on", { registerFails: true }), { status: "unredactable_secret", code: "unredactable_secret" });
});
```

- [ ] **Step 6: Run hook RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-sanitizer.test.mjs
```

Expected: helper tests PASS and hook tests FAIL because `hooks["delegation.sanitize"]` is absent.

- [ ] **Step 7: Wire exact sanitizer hook and run GREEN.**

Add `"delegation.sanitize": async ({ payload }) => { try { await participantLifecycle.reconcile(); } catch { log("sanitizer-unavailable", { code: "participant_unavailable" }); return { status: "unredactable_secret", code: "unredactable_secret" }; } if (level() === "off" || !participantLifecycle.participant.current) return { status: "unredactable_secret", code: "unredactable_secret" }; return sanitizeDelegationPayload(payload); }`. Do not log the payload, participant error, or thrown text.

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/delegation-sanitizer.test.mjs tests/delegation-lifecycle.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Commit sanitizer.**

```bash
git -C /home/dev/opencode-guard-plan2 add lib/delegation.js tests/delegation-sanitizer.test.mjs plugin.js
git -C /home/dev/opencode-guard-plan2 commit -m "feat: sanitize delegated terminal payloads"
```

### Task 3: Move structural hard floors to `tool.authorize`

**Files:**
- Create: `tests/tool-authorization.test.mjs`
- Modify: `plugin.js:721-978` (`tool.execute.before`, replaced by `tool.authorize`; hard floors are `741-915`, including the tree gate at `775-787`), `plugin.js:170-178` (`credentialDeny` `:170-173` and `controlDeny` `:175-178` become unused and are deleted)
- Modify: `tests/stale-turn.test.mjs:10-69`
- Modify: `tests/policy.test.mjs:293-447,623-695`
- Modify: `tests/launder.test.mjs:199-302` (`runHook` and every hook-driven test through the god test)
- Modify: `tests/tree-rules.test.mjs:17-105` (`run`), `:141-153` (the two G3 tool-call denial tests), `:184-242` (the G1, G2, G4 and level-`off` hook tests)

**Interfaces:**
- Consumes exact `ToolAuthorizeHook` input; all former `output.args` reads become `input.arguments`.
- Produces no `tool.execute.before` hook.
- Uses existing `staleToolRefusal`, `dispatchRefusal`, `configDenyReason`, `nativeToolWritesControlFile`, `nativeCredentialGuardBlocks`, `commandWritesControlFile`, `touchesHardCredentials`, `touchesPromptableCredentials`, `launderReason`, `rulesFor`, `commandUnder`, and `safetyNetVerdict` without changing their argument names. `nativeCredentialGuardBlocks` is called with the constant `mode: "auto"` (`lib/policy.js:505-506`: it blocks when `level !== "off" && (unattended || mode !== "god")`, so `"auto"` removes the only GOD exemption).
- Uses the 1.7.x tree surface unchanged: `treeRuleRefusal` and `teamClosedTool` (`lib/tree.js:283-361`) over the factory's `sessionTree` and `teamIndex` (`plugin.js:348-351`), and `modeFor` (`plugin.js:359-374`), which throws the existing G3 denial when the ancestry cannot be read. G1 remains a separate fresh tree read beside core admission. G2 receives canonical root identity when `"branch" in input`, with tree fallback only when that key is absent. For a team-closed tool, G4 compares `await teamIndex.inTeam(input.sessionID)` with `input.branch.delivery === "background"` only when both branch `kind` and `delivery` are present and `await sessionTree.parentOf(input.sessionID) === input.rootSessionID`; a failed parent lookup denies with the existing G4 text, and a deeper descendant uses history only. Removes 1.7.1's per-call lazy `currentMode()` memo (`plugin.js:723-731`): this hook resolves mode/manual ancestry once, eagerly, at hard-floor row 4a, and later rows read that value.

- [ ] **Step 1: Create a real-hook process harness and exact-key test.**

Create `tests/tool-authorization.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const authorize = ({ level = "on", mode = "auto", tool = "bash", arguments: args = { command: "git status" }, status = { ses_a: { type: "busy" } }, authority = null, branch = null, omitBranchKey = false, treeParentID = null, historyTeam = false, baseline = { decision: "ask", immutableDeny: false, matches: [{ origin: "agent_config", decision: "ask" }] }, answer = "SAFE", agentFile, bashRules = { "*": "ask" }, getFails = false } = {}) => {
  const home = mkdtempSync(join(tmpdir(), "guard-authorize-"));
  try {
    mkdirSync(join(home, ".config/opencode/agent"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    // Without a config, loadBashRules starts from opencode's default `*: allow`, and the
    // launder floor then denies every command it cannot verify as a read.
    writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify({ permission: { bash: bashRules } }));
    writeFileSync(join(home, ".config/opencode/autoclass"), `${level}\n`);
    // mode null: no per-session file, so modeFor walks the ancestry through session.get (G3).
    if (mode !== null) writeFileSync(join(home, ".local/share/opencode/modes/ses_a"), `${mode}\n`);
    writeFileSync(join(home, ".config/opencode/classifier.json"), JSON.stringify({ url: "http://classifier.invalid/v1/chat/completions" }));
    if (agentFile) writeFileSync(join(home, ".config/opencode/agent/scout.md"), agentFile);
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const classified = [];
      globalThis.fetch = async (_url, init) => { classified.push(JSON.parse(init.body).messages[1].content); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ${JSON.stringify(answer)} } }] }) }; };
      const worker = { workerID: "worker_a", workerEpoch: "epoch_a" };
      const delegation = { registerParticipant: async (x) => ({ ...x, availability: "available" }), heartbeatParticipant: async () => {}, markUnavailable: async () => {}, withdrawParticipant: async () => {} };
       // get: every session is a root unless treeParentID supplies its parent; getFails makes every lookup throw.
       const gets = [];
       const client = { session: { status: async () => ({ data: ${JSON.stringify(status)} }), get: async ({ path }) => { gets.push(path.id); if (${JSON.stringify(getFails)}) throw new Error("server away"); return { data: path.id === "ses_a" ? ${JSON.stringify(treeParentID ? { parentID: treeParentID } : {})} : {} }; }, messages: async () => ({ data: ${JSON.stringify(historyTeam ? [{ info: { id: "msg_1", sessionID: "ses_root" }, parts: [{ type: "tool", tool: "task", sessionID: "ses_root", messageID: "msg_1", id: "part_1", state: { metadata: { sessionId: "ses_a" }, input: { background: true } } }] }] : [])}, response: { headers: { get: () => null } } }) }, app: { log: async () => {} } };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      // directory must exist: cc-safety-net fails closed (deny, logged as deny(net)) for
      // every bash command when cwd is a missing path such as "/work".
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(home)}, delegation });
       const input = { sessionID: "ses_a", rootSessionID: ${branch ? '"ses_root"' : '"ses_a"'}, branchID: ${branch ? '"branch_a"' : "null"}, tool: ${JSON.stringify(tool)}, callID: "call_a", arguments: ${JSON.stringify(args)}, baseline: ${JSON.stringify(baseline)}, worker, execution: { ...worker, executionID: "exec_a", sessionID: "ses_a", rootSessionID: ${branch ? '"ses_root"' : '"ses_a"'}, fencingToken: 1 }, ...(${JSON.stringify(omitBranchKey)} ? {} : { branch: ${JSON.stringify(branch)} }), authority: ${JSON.stringify(authority)} };
       const output = { decision: "continue" };
      let error = null;
      try { await hooks["tool.authorize"](input, output); } catch (caught) { error = { message: String(caught?.message ?? caught), code: caught?.code ?? null }; }
      const hasBefore = Object.hasOwn(hooks, "tool.execute.before");
      let disposeError = null;
      try { await hooks.dispose(); } catch (caught) { disposeError = { code: caught?.code ?? null }; }
       process.stdout.write(JSON.stringify({ output, error, classified, hasBefore, disposeError, gets }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8", timeout: 15000 });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    return JSON.parse(child.stdout);
  } finally { rmSync(home, { recursive: true, force: true }); }
};

test("tool.authorize consumes arguments and tool.execute.before is gone", () => {
  const result = authorize({ arguments: { command: "git status" } });
  assert.equal(result.error, null);
  assert.equal(result.output.decision, "continue");
  assert.equal(result.hasBefore, false);
});
```

- [ ] **Step 2: Add literal hard-floor matrix tests.**

Append:

```js
const liveAuthority = { workerID: "worker_a", workerEpoch: "epoch_a", leaseID: "lease_a", authorityEpoch: 1 };

test("baseline deny is monotonic across ordinary and live-authority calls", () => {
  for (const authority of [null, liveAuthority]) {
    assert.equal(authorize({ authority, baseline: { decision: "deny", immutableDeny: true, matches: [{ origin: "agent_config", decision: "deny" }] } }).output.decision, "deny");
  }
});

test("stale, dispatch, control, hard credential, reveal, and safety-net floors deny even with live authority", () => {
  const cases = [
    { name: "stale", status: {}, arguments: { command: "git status" } },
    { name: "dispatch", tool: "task", arguments: { subagent_type: "scout", prompt: "write the file" }, agentFile: "---\ncapability: read\n---\n" },
    { name: "control", tool: "write", arguments: { filePath: "~/.config/opencode/autoclass", content: "off" } },
    { name: "credential", arguments: { command: "cat ~/.ssh/id_ed25519" } },
    { name: "native-credential", tool: "read", arguments: { filePath: "~/.ssh/id_ed25519" } },
    { name: "reveal", arguments: { command: "oc-reveal 60" } },
    { name: "safety-net", arguments: { command: "rm -rf /" } },
  ];
  for (const entry of cases) {
    const result = authorize({ ...entry, authority: liveAuthority });
    assert.equal(result.output.decision, "deny", entry.name);
    assert.equal(result.classified.length, 0, entry.name);
  }
});

// Each floor runs under a per-session file `god` with no authority, and under file `god`
// plus a live authority fence (the most permissive grant a call can carry).
const HARD_FLOORS = [
  { name: "native credential read", tool: "read", arguments: { filePath: "~/.ssh/id_ed25519" } },
  { name: "safety-net rm -rf /", arguments: { command: "rm -rf /" } },
  { name: "control-file write", tool: "write", arguments: { filePath: "~/.config/opencode/autoclass", content: "off" } },
  { name: "reveal arm", arguments: { command: "oc-reveal 60" } },
  { name: "stale turn", status: {}, arguments: { command: "git status" } },
  { name: "launder", bashRules: { "*": "ask", "echo *": "allow" }, arguments: { command: "echo x > /home/dev/.bashrc" } },
  // Tree rules (row 3a). The harness's session.get makes every session a root, so
  // ses_other is not a child of ses_a (G1); background with task_id is refused
  // before any lookup (G2). `build` has no agent file, so the dispatch gate passes.
  { name: "G1 resume of a session that is not a child", tool: "task", arguments: { description: "d", prompt: "p", subagent_type: "build", task_id: "ses_other" } },
  { name: "G2 background with task_id", tool: "task", arguments: { description: "d", prompt: "p", subagent_type: "build", background: true, task_id: "ses_other" } },
];
const GRANTS = [
  { label: "file god, authority null", mode: "god", authority: null },
  { label: "file god, live authority", mode: "god", authority: liveAuthority },
];

test("every hard floor denies under a per-session file god and under a live authority fence", () => {
  for (const grant of GRANTS) {
    for (const { name, ...floor } of HARD_FLOORS) {
      const label = `${name} / ${grant.label}`;
      const result = authorize({ ...floor, mode: grant.mode, authority: grant.authority });
      assert.equal(result.error, null, label);
      assert.equal(result.output.decision, "deny", label);
      assert.deepEqual(result.classified, [], label);
    }
  }
});

test("an unresolvable inherited mode (G3, row 4a) denies with and without live authority", () => {
  for (const authority of [null, liveAuthority]) {
    const result = authorize({ mode: null, getFails: true, authority, arguments: { command: "git status" } });
    assert.equal(result.error, null);
    assert.equal(result.output.decision, "deny");
    assert.deepEqual(result.classified, []);
  }
  // The same call with a readable (root) ancestry resolves the global mode and continues.
  assert.equal(authorize({ mode: null, arguments: { command: "git status" } }).output.decision, "continue");
});

test("level off awaits lifecycle and performs no stale or hard-floor inspection", () => {
  const result = authorize({ level: "off", status: {}, arguments: { command: "rm -rf /" } });
  assert.equal(result.output.decision, "continue");
  assert.equal(result.error, null);
  assert.equal(result.classified.length, 0);
});

test("G2 uses canonical root identity when branch key is present, without a tree lookup", () => {
  const root = authorize({ tool: "task", arguments: { description: "d", prompt: "p", subagent_type: "build", background: true } });
  assert.equal(root.output.decision, "continue");
  assert.deepEqual(root.gets, []);
  const child = authorize({ branch: { sessionID: "ses_a", rootSessionID: "ses_root", branchID: "branch_a" }, tool: "task", arguments: { description: "d", prompt: "p", subagent_type: "build", background: true } });
  assert.equal(child.output.decision, "deny");
  assert.deepEqual(child.gets, []);
});

test("G2 falls back to the session tree only when the branch key is absent", () => {
  const result = authorize({ omitBranchKey: true, treeParentID: "ses_parent", tool: "task", arguments: { description: "d", prompt: "p", subagent_type: "build", background: true } });
  assert.equal(result.output.decision, "deny");
  assert.equal(result.gets, ["ses_a"]);
});

test("G4 compares canonical delivery only for a direct child of the root", () => {
  const branch = { sessionID: "ses_a", rootSessionID: "ses_root", branchID: "branch_a", kind: "native", delivery: "background" };
  const direct = authorize({ branch, treeParentID: "ses_root", historyTeam: false, tool: "workflow_run", arguments: { name: "review" } });
  assert.equal(direct.output.decision, "deny");
  assert.match(direct.output.reason, /^\[opencode-guard\] denied \(G4, tools closed to agent teams\):/);
  assert.deepEqual(direct.gets, ["ses_a"]);

  const grandchild = authorize({ branch, treeParentID: "ses_parent", historyTeam: false, tool: "workflow_run", arguments: { name: "review" } });
  assert.equal(grandchild.output.decision, "continue");
  assert.deepEqual(grandchild.gets, ["ses_a"]);
});

test("G4 denies with its existing text when direct-child lookup fails", () => {
  const branch = { sessionID: "ses_a", rootSessionID: "ses_root", branchID: "branch_a", kind: "native", delivery: "background" };
  const result = authorize({ branch, getFails: true, tool: "workflow_run", arguments: { name: "review" } });
  assert.equal(result.output.decision, "deny");
  assert.match(result.output.reason, /^\[opencode-guard\] denied \(G4, tools closed to agent teams\):/);
});
```

- [ ] **Step 3: Add a test that an awaited off-fence failure blocks authorization.**

Extend the harness with `startLevel = level` and `failMark = false`. Write `startLevel` before importing the plugin; after `OpencodeGuard(...)` has registered, overwrite `~/.config/opencode/autoclass` with `level`. Make `markUnavailable` throw `{ code: "stale_worker" }` when `failMark` is true. The harness already wraps `await hooks.dispose()` in try/catch and returns `disposeError` (Step 1), so a dispose-time fence failure cannot crash the child before the JSON is printed. Append:

```js
test("authorization never continues when the off transition cannot fence authority", () => {
  const result = authorize({ startLevel: "on", level: "off", failMark: true });
  assert.equal(result.output.decision, "deny");
  assert.equal(result.error.code, "stale_worker");
  assert.equal(result.disposeError, null);
});
```

The hook must set `output.decision = "deny"` before rethrowing a lifecycle transition failure. Because that rejection already reported the fence failure, `dispose()` retries the fence once more, reports a repeat failure only through `onError`, and rethrows nothing (Task 1 Interfaces), so `disposeError` is `null`.

- [ ] **Step 4: Update stale-turn wired tests to call the exact new hook before RED.**

In `tests/stale-turn.test.mjs`, replace the invocation at lines 37-39 (the `try { await hooks["tool.execute.before"](...) } catch ...` around `:38`) with:

```js
const input = { sessionID: "ses_a", rootSessionID: "ses_a", branchID: null, tool: "read", callID: "c1", arguments: { filePath: "/work/README.md" }, baseline: { decision: "allow", immutableDeny: false, matches: [] }, worker: { workerID: "worker_a", workerEpoch: "epoch_a" }, execution: { workerID: "worker_a", workerEpoch: "epoch_a", executionID: "exec_a", sessionID: "ses_a", rootSessionID: "ses_a", fencingToken: 1 }, branch: null, authority: null };
const output = { decision: "continue" };
await hooks["tool.authorize"](input, output);
if (output.decision === "deny") outcome = "denied";
```

Retain the delegation stub added in Task 1 and the client's `session.get` stub (`:28-30`, added in 1.7.0: `ses_a` has no mode file, so the G3 resolution at row 4a reads its ancestry, and the stub makes it a root). Change the stale expectation from an error message to `"denied"`; retain running/unreadable-status allows and the assertion that `off` makes no status call.

Then move `tests/launder.test.mjs` to the new hook. In `runHook` (`:201-242`), replace the signature line

```js
const runHook = ({ mode, command, config, agent, agents, agentsFail, events }) => {
```

with

```js
const runHook = ({ mode, command, config, agent, agents, agentsFail, events, authority = null }) => {
```

keep the Task 1 delegation stub, and replace

```js
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(h)}, delegation });
```

with

```js
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(h)}, delegation }, { readCmdline: () => ["opencode"] });
```

(Task 4 adds that factory option; until then the extra argument is ignored, and from Task 4 on it pins an attended primary independent of the test runner's own command line). Replace

```js
      let outcome = "ran";
      try {
        await hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_a", callID: "c1" }, { args: { command: ${JSON.stringify(command)} } });
      } catch (error) { outcome = String(error?.message ?? error); }
```

with

```js
      const worker = { workerID: "worker_a", workerEpoch: "epoch_a" };
      const input = {
        sessionID: "ses_a", rootSessionID: "ses_a", branchID: null, tool: "bash", callID: "c1",
        arguments: { command: ${JSON.stringify(command)} },
        baseline: { decision: "allow", immutableDeny: false, matches: [] },
        worker, execution: { ...worker, executionID: "exec_a", sessionID: "ses_a", rootSessionID: "ses_a", fencingToken: 1 },
        branch: null, authority: ${JSON.stringify(authority)},
      };
      const output = { decision: "continue" };
      let outcome;
      try {
        await hooks["tool.authorize"](input, output);
        outcome = output.decision;
      } catch (error) { outcome = "threw: " + String(error?.message ?? error); }
```

Keep `await hooks.dispose();` (Task 1) before the `console.log`. Then replace the hook-driven tests from `test("a config deny rule holds in god mode, ...` (`:244`) through the end of `test("the hook blocks a laundered write in manual, edits and auto, and stands aside in god", ...)` (`:302`) with exactly:

```js
const LIVE_AUTHORITY = { workerID: "worker_a", workerEpoch: "epoch_a", leaseID: "lease_a", authorityEpoch: 1 };

test("a config deny rule holds under file god and live authority, where an Always approval could otherwise override it", () => {
  for (const authority of [null, LIVE_AUTHORITY]) {
    assert.equal(runHook({ mode: "god", authority, command: "rm -rf /etc" }), "deny");
    assert.equal(runHook({ mode: "god", authority, command: "snip rm -rf /etc" }), "deny");
  }
});

test("an Always reply that saved a blanket pattern is reported as an error", () => {
  const asked = { type: "permission.asked", properties: { id: "per_1", sessionID: "ses_a", permission: "bash",
    patterns: ["snip git push origin x"], always: ["snip *"], metadata: { command: "snip git push origin x" } } };
  const replied = { type: "permission.replied", properties: { sessionID: "ses_a", requestID: "per_1", reply: "always" } };
  const result = runHook({ mode: "manual", command: "echo hi", events: [asked, replied] });
  assert.ok(result.logs.some((e) => e?.level === "error" && /snip \*/.test(e?.message ?? "") && /restart/i.test(e?.message ?? "")),
    `expected an error naming the blanket approval, got ${JSON.stringify(result.logs)}`);
  const narrow = { ...asked, properties: { ...asked.properties, id: "per_2", always: ["git push *"] } };
  const narrowReply = { ...replied, properties: { ...replied.properties, requestID: "per_2" } };
  const quiet = runHook({ mode: "manual", command: "echo hi", events: [narrow, narrowReply] });
  assert.equal(quiet.logs.some((e) => /Always/.test(e?.message ?? "")), false);
});

const TESTER = [
  { permission: "*", pattern: "*", action: "allow" },
  ...RULES.map(([pattern, action]) => ({ permission: "bash", pattern, action })),
  { permission: "bash", pattern: "npm test*", action: "allow" },
];
test("the hook judges with the session's agent ruleset from opencode", () => {
  const agents = [{ name: "tester", permission: TESTER }];
  assert.equal(runHook({ mode: "manual", agent: "tester", agents, command: "npm test > /home/dev/.bashrc" }).outcome,
    "deny", "the agent's own npm test* allow does not launder a redirect");
  assert.equal(runHook({ mode: "manual", agent: "tester", agents, command: "npm test" }).outcome, "continue");
  assert.equal(runHook({ mode: "manual", agent: "build", agents, command: "npm test > /home/dev/.bashrc" }).outcome, "continue",
    "an agent without the allow is asked natively, so the floor stays out of it");
});

test("when opencode cannot list agents the hook falls back to the global rules and says so", () => {
  const result = runHook({ mode: "manual", agent: "tester", agentsFail: true, command: "echo x > /home/dev/.bashrc" });
  assert.equal(result.outcome, "deny");
  assert.ok(result.logs.some((e) => e?.level === "error" && /agent/.test(e?.message ?? "")),
    `expected an error log about the agent rulesets, got ${JSON.stringify(result.logs)}`);
});

test("with a broken opencode.json the hook still blocks, and reports the config error", () => {
  const result = runHook({ mode: "manual", command: "echo x > /home/dev/.bashrc", config: "{ not json" });
  assert.equal(result.outcome, "deny");
  assert.ok(result.logs.some((entry) => entry?.level === "error" && /opencode\.json/.test(entry?.message ?? "")),
    `expected an error log naming the config, got ${JSON.stringify(result.logs)}`);
});

test("the launder floor denies in every mode, under file god and under live authority", () => {
  for (const mode of ["manual", "edits", "auto", "god"]) {
    for (const authority of [null, LIVE_AUTHORITY]) {
      for (const command of ["echo x > /home/dev/.bashrc", "fd -HX rm -rf"]) {
        assert.equal(runHook({ mode, authority, command }), "deny", `${mode} / ${authority ? "live authority" : "no authority"}: ${command}`);
      }
    }
  }
  assert.equal(runHook({ mode: "manual", command: "echo hi" }), "continue");
  assert.equal(runHook({ mode: "manual", command: "sort -o out in" }), "continue",
    "a natively-asked command was approved by a person and runs");
});
```

The removed assertion `"god still lifts the launder floor"` (`:247`) and `"god stands the floor aside"` (`:298`) are the deliberate behavior change: launder is a hard floor from this release on. The pure tests above `:199` and below `:302` are unchanged.

Then move `tests/tree-rules.test.mjs` (added in 1.7.0) to the new hook. Change its harness comment line `:16` to end `{ tool, sessionID, args, baseline?, authority? } calls tool.authorize.`, and replace the signature line `:17`

```js
const run = ({ sessions = {}, messages = {}, modes = {}, globalMode, level, getFails = false, countModeFileReads = false, steps }) => {
```

with

```js
const run = ({ sessions = {}, messages = {}, modes = {}, globalMode, level, getFails = false, countModeFileReads = false, tokens = ["opencode"], steps }) => {
```

Keep the Task 1 delegation stub, and replace

```js
      const hooks = await OpencodeGuard({ client, directory: "/work", delegation });
```

with

```js
      const hooks = await OpencodeGuard({ client, directory: "/work", delegation }, { readCmdline: () => ${JSON.stringify(tokens)} });
```

(ignored until Task 4 adds the option, as in `tests/launder.test.mjs`). Replace the tool-call branch of the step loop (`:84-90`)

```js
        try {
          await hooks["tool.execute.before"](
            { tool: step.tool, sessionID: step.sessionID, callID: "c" + outcomes.length },
            { args: step.args ?? {} },
          );
          outcomes.push("ran");
        } catch (error) { outcomes.push(String(error?.message ?? error)); }
```

with

```js
        // Canonical identity, as core would supply it: derived from the fake tree, never
        // from the plugin. A root is a primary; anything below it is a registered child.
        const chain = [step.sessionID];
        while (sessions[chain.at(-1)]) chain.push(sessions[chain.at(-1)]);
        const root = chain.at(-1);
        const isChild = root !== step.sessionID;
        const worker = { workerID: "worker_a", workerEpoch: "epoch_a" };
        const execution = { ...worker, executionID: "exec_" + outcomes.length, sessionID: step.sessionID, rootSessionID: root, fencingToken: 1 };
        const branchID = isChild ? "branch_" + step.sessionID : null;
        const input = {
          sessionID: step.sessionID, rootSessionID: root, branchID, tool: step.tool, callID: "c" + outcomes.length,
          arguments: step.args ?? {},
          baseline: step.baseline === "ask"
            ? { decision: "ask", immutableDeny: false, matches: [{ origin: "agent_config", decision: "ask" }] }
            : { decision: "allow", immutableDeny: false, matches: [] },
          worker, execution,
          branch: isChild ? { ...execution, branchID, branchFencingToken: 1, kind: "native", delivery: "foreground" } : null,
          authority: step.authority ? { ...worker, leaseID: "lease_a", authorityEpoch: 1 } : null,
        };
        const output = { decision: "continue" };
        try {
          await hooks["tool.authorize"](input, output);
          outcomes.push(output.decision === "continue" ? "ran" : output.decision);
          reasons.push(output.reason ?? null);
        } catch (error) { outcomes.push("threw: " + String(error?.message ?? error)); }
```

Replace the two G3 tool-call tests (`:141-153`, from `test("G3: an ancestry that cannot be read denies the call, naming the rule", ...` through the end of `test("G3: a failed lazy mode lookup still denies a subagent tool call", ...`) with exactly:

```js
test("G3: an ancestry that cannot be read denies the call", () => {
  const result = run({ sessions: CHAIN, getFails: true,
    steps: [{ tool: "read", sessionID: "ses_leaf", args: { filePath: "/work/a" } }] });
  assert.deepEqual(result.outcomes, ["deny"]);
  assert.deepEqual(run({ sessions: CHAIN,
    steps: [{ tool: "read", sessionID: "ses_leaf", args: { filePath: "/work/a" } }] }).outcomes, ["ran"],
    "the same call with a readable ancestry runs");
});

test("G3: a failed mode lookup denies a subagent tool call under live authority too", () => {
  const result = run({ sessions: CHAIN, getFails: true,
    steps: [{ tool: "read", sessionID: "ses_leaf", args: { filePath: "/work/a" }, authority: true }] });
  assert.deepEqual(result.outcomes, ["deny"]);
});
```

These use `read`, not `bash`: the harness directory `/work` does not exist, so cc-safety-net denies every `bash` command (row 8) and a `bash` step could not tell G3 from the safety net. `test("G3: one subagent tool call walks inherited mode files once", ...` keeps its `bash` step and its assertion of 4 mode-file reads, because row 4a runs before row 8 and resolves the mode exactly once. Keep `test("G3: a grandchild never runs looser ...", ...` (permission events; Task 4 rewrites it), `test("G3: a session with its own mode file looks nothing up", ...` and `test("G3: in the permission handler an unresolvable mode leaves the prompt with the person", ...` unchanged. Add a G4 canonical-classification block to the hook tests: its direct-child case must have the tree stub return `"ses_root"` for `parentOf("ses_a")`; its grandchild case must return `"ses_parent"` and prove canonical comparison is skipped; and its failed-parent lookup case must deny with the existing G4 text.

Replace the hook tests from `test("G1 holds in god mode: a subagent cannot resume its sibling", ...` (`:184`) through the end of the file (`:242`) with exactly:

```js
test("G1 holds under file god and live authority: a subagent cannot resume its sibling", () => {
  const result = run({ sessions: TEAM, modes: { ses_mate: "god", ses_root: "god" }, steps: [
    { tool: "task", sessionID: "ses_mate", args: spawnArgs({ task_id: "ses_fg" }) },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ task_id: "ses_fg" }) },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ task_id: "ses_otherkid" }) },
    { tool: "task", sessionID: "ses_mate", args: spawnArgs({ task_id: "ses_fg" }), authority: true },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ task_id: "ses_otherkid" }), authority: true },
  ] });
  assert.deepEqual(result.outcomes, ["deny", "ran", "deny", "deny", "deny"],
    "only the lead resuming its own child runs; neither a file god nor live authority lifts G1");
});

test("G2 through the hook: an attended root may start a background task, a subagent may not, and nobody may with task_id", () => {
  const result = run({ sessions: TEAM, modes: { ses_root: "auto", ses_fg: "auto" }, steps: [
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ background: true }) },
    { tool: "task", sessionID: "ses_fg", args: spawnArgs({ background: true }) },
    { tool: "task", sessionID: "ses_fg", args: spawnArgs({ background: true }), authority: true },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ background: true, task_id: "ses_fg" }), authority: true },
  ] });
  assert.deepEqual(result.outcomes, ["ran", "deny", "deny", "deny"]);
});

test("G4 through the hook: an indexed teammate is refused workflow_run, under live authority too, and nothing reads history", () => {
  const result = run({ sessions: TEAM, modes: { ses_mate: "auto", ses_helper: "auto" }, steps: [
    { event: taskPartEvent(2, "ses_root", "ses_mate", { input: { background: true } }) },
    { tool: "workflow_run", sessionID: "ses_mate", args: { name: "review-panel" } },
    { tool: "bg_list", sessionID: "ses_helper", args: { all: true } },
    { tool: "read", sessionID: "ses_mate", args: { filePath: "/work/a" } },
    { tool: "workflow_run", sessionID: "ses_mate", args: { name: "review-panel" }, authority: true },
  ] });
  assert.deepEqual(result.outcomes, ["deny", "deny", "ran", "deny"]);
  assert.deepEqual(result.pages, []);
});

test("G4 through the hook: a promoted task's child keeps every tool", () => {
  const result = run({ sessions: TEAM, modes: { ses_fg: "auto" }, steps: [
    { event: taskPartEvent(3, "ses_root", "ses_fg", { metadata: { background: true } }) },
    { tool: "schedule_prompt", sessionID: "ses_fg", args: { in_minutes: 5, text: "x" } },
  ] });
  assert.deepEqual(result.outcomes, ["ran"]);
});

test("G4 through the hook: an index miss is answered from the root's history", () => {
  const creating = taskPartEvent(2, "ses_root", "ses_mate", { input: { background: true } }).properties.part;
  const messages = { ses_root: [{ info: { id: "msg_0002", sessionID: "ses_root", role: "assistant" }, parts: [creating] }] };
  const result = run({ sessions: TEAM, messages, modes: { ses_mate: "auto" }, steps: [
    { tool: "peer_send", sessionID: "ses_mate", args: { to: "x", text: "hi" } },
  ] });
  assert.deepEqual(result.outcomes, ["deny"]);
  assert.deepEqual(result.pages, [{ id: "ses_root", query: { directory: "/work", limit: 50 } }]);
});

test("level off leaves the tree rules out like everything else", () => {
  const result = run({ sessions: TEAM, level: "off", steps: [
    { tool: "task", sessionID: "ses_mate", args: spawnArgs({ task_id: "ses_fg" }) },
  ] });
  assert.deepEqual(result.outcomes, ["ran"]);
  assert.deepEqual(result.gets, [], "off means nothing from this plugin, including session lookups");
});
```

Extend the tree-rules harness with `const reasons = [];` beside `outcomes`, return it in final JSON, and push `output.reason ?? null` for every completed authorize call (push `null` for an unexpected thrown call so arrays stay aligned). Restore the 1.7.x denial-text assertions as `output.reason` assertions: the G1 cases match `^\[opencode-guard\] denied \(G1, resume only your own child\):` and the wrong-parent case includes `(its parent is ses_other)`; G2 matches `^\[opencode-guard\] denied \(G2, background teammates only from an attended root\):`; G4 matches `^\[opencode-guard\] denied \(G4, tools closed to agent teams\):`; and the G3 lookup case matches `^\[opencode-guard\] denied \(G3, inherited permission mode\):`. Each `deny` is paired with a `ran` control that differs only in the rule's input, and Task 5 retains the log assertion naming the rule ID. `tests/tree.test.mjs` (pure `lib/tree.js` tests) is unchanged.

- [ ] **Step 5: Run authorization RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/tool-authorization.test.mjs tests/stale-turn.test.mjs tests/launder.test.mjs tests/tree-rules.test.mjs
```

Expected: FAIL because `tool.authorize` is absent and `tool.execute.before` remains; every migrated `tests/launder.test.mjs` hook test reports an outcome starting `threw: hooks["tool.authorize"] is not a function` instead of `deny`/`continue`, while its pure tests still PASS; every migrated `tests/tree-rules.test.mjs` tool-call test reports `threw: hooks["tool.authorize"] is not a function`, while its permission-event G3 tests still PASS.

- [ ] **Step 6: Replace `tool.execute.before` with the hard-floor half of `tool.authorize`.**

At hook entry, read `lvl = level()`, `await participantLifecycle.reconcile()` (cached: a host call only on a level transition or missing registration; it never heartbeats), and on reconciliation failure set `deny` then rethrow. If `lvl === "off"`, return only after successful withdrawal. Use `input.arguments` everywhere. Convert every former hard-floor throw into `output.decision = "deny"`, one allowlisted log call, and `return`. Each branch passes its literal code: `stale_turn`, `dispatch`, `tree_rule`, `config_deny`, `control_file`, `hard_credential`, `reveal_arm`, `safety_net`, or `launder`. For example, stale uses `log("hard-floor-deny", { sessionID: input.sessionID, callID: input.callID, tool: input.tool, code: "stale_turn" })`; safety-net additionally passes `ruleID: net.ruleId ?? undefined`. There is no metadata helper. Preserve existing matching helpers and cc-safety-net order. Do not place an authority/GOD return above any hard floor.

Delete the attended-god bypass (`plugin.js:820`, `if (!isUnattended && (await currentMode()) === "god") { log("allow(god)", command ?? input?.tool); return; }`) outright; nothing replaces it inside the hard floors. Delete 1.7.1's lazy memo (`plugin.js:723-731`: `let mode;` and `const currentMode = async () => { ... }`) with it; the hook keeps no `currentMode` closure. Port these five checks exactly, in this order relative to each other and to the other floors (dispatch, 3a tree, 4 config deny, 4a G3, then control-file), with no mode or authority condition around them:

- Tree rules G1, G2, G4 (`:775-787`, row 3a), immediately after the read-intent dispatch gate and before config deny: preserve G1's `treeRuleRefusal` fresh `session.get` path unchanged, so core admission and G1 must both pass. For G2, call a small local adapter: when `"branch" in input`, supply canonical root identity (`input.branch === null && input.sessionID === input.rootSessionID`) and do not call `tree.parentOf`; when it is absent, retain `tree.parentOf(input.sessionID) === null`. Keep its existing attended and `task_id` checks/text unchanged. For a G4-closed tool (`teamClosedTool({ tool: input.tool, args: input.arguments })`), obtain the history result from `teamIndex.inTeam(input.sessionID)`. Only when both `input.branch?.kind` and `input.branch?.delivery` are present, call `sessionTree.parentOf(input.sessionID)`: if it equals `input.rootSessionID`, compare history to `input.branch.delivery === "background"`; if it is a deeper parent, use history classification only; if lookup fails, deny with the existing G4 text from `lib/tree.js:358-360`, not newly written wording. Then call/retain `treeRuleRefusal` for its existing G1/G2/G4 lookup and denial behavior. On every resulting G1/G2/G4 refusal, set `output.decision = "deny"; output.reason = treeRefusal;` and log only `code: "tree_rule"` plus the parsed rule ID. `treeRuleRefusal` never throws (each failed lookup returns a denial naming its rule), so there is no catch. Task 4 renames `isUnattended` to `unattended` here as everywhere else.
- Config deny (`:809-818`): `if (command) { const denied = configDenyReason(command, await rulesFor(input.sessionID)); if (denied) { output.decision = "deny"; log("hard-floor-deny", { sessionID: input.sessionID, callID: input.callID, tool: input.tool, code: "config_deny" }); return; } }`.
- G3 mode resolution (row 4a), at the position of the deleted god bypass (immediately after config deny, before the control-file check): `let modeResolution; try { modeResolution = await modeFor(input.sessionID); } catch (error) { output.decision = "deny"; output.reason = String(error?.message ?? error); log("hard-floor-deny", { sessionID: input.sessionID, callID: input.callID, tool: input.tool, code: "tree_rule", ruleID: "G3" }); return; }`. This is the only `modeFor` call in the hook. It runs for every call that reaches it, at `on` and `static`, attended or not, and whatever `input.authority` is. Task 4 consumes `modeResolution.fileMode` and `modeResolution.hasManualInChain`; do not move or remove it as unused.
- Native credential (`:831-837`): `nativeCredentialGuardBlocks({ level: lvl, mode: "auto", unattended: isUnattended, tool: input.tool, args: input.arguments, directory })`. The literal `"auto"` replaces `await currentMode()`; do not read the mode file, `fileMode`, or `input.authority` here.
- Launder (`:857-865`), immediately after the safety-net block: `const laundered = launderReason(command, await rulesFor(input.sessionID)); if (laundered) { output.decision = "deny"; log("hard-floor-deny", { sessionID: input.sessionID, callID: input.callID, tool: input.tool, code: "launder" }); return; }`. The launder floor runs for every level other than `off`, every mode file value, and every authority value.

Delete each former non-tree throw's message text together with the throw, and delete `credentialDeny` (`:170-173`) and `controlDeny` (`:175-178`) once nothing references them. Leave `treeDenial`/`treeLookupDenial` and their texts in `lib/tree.js`, and leave `modeFor`'s internal `throw new Error(treeLookupDenial("G3", error))` (`plugin.js:369`) in place. Tree/G3 text now reaches the agent only as `output.reason`; do not reword it.

Remove the `tool.execute.before` key entirely. Leave promptable credentials and classifier behavior for Task 4; temporarily set promptable credentials to `handoff` for a child, `deny` unattended, otherwise `continue`, and let all other floor-passing calls `continue` so this task can turn GREEN without inventing final classifier policy.

- [ ] **Step 7: Run hard-floor GREEN.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/tool-authorization.test.mjs tests/stale-turn.test.mjs tests/policy.test.mjs tests/safety-net.test.mjs tests/launder.test.mjs tests/tree-rules.test.mjs tests/tree.test.mjs tests/plugin-exports.test.mjs
```

Expected: PASS.

The existing literal tests in `tests/safety-net.test.mjs` remain part of this GREEN command and pin both analyzer throw as `analysis-error` deny and analyzer absence as `unavailable`; the real-hook `rm -rf /` case above pins that the plugin consumes the deny result before any classifier/GOD bypass. `tests/tree-rules.test.mjs` pins rows 3a and 4a through the real hook. `tests/plugin-exports.test.mjs` still pins `sessionTree` inside the factory above `modeFor`.

- [ ] **Step 8: Commit hard-floor migration.**

```bash
git -C /home/dev/opencode-guard-plan2 add plugin.js tests/tool-authorization.test.mjs tests/stale-turn.test.mjs tests/policy.test.mjs tests/launder.test.mjs tests/tree-rules.test.mjs
git -C /home/dev/opencode-guard-plan2 commit -m "feat: enforce hard floors through tool authorization"
```

### Task 4: Complete mode, participant, classifier, and primary-event behavior

**Files:**
- Modify: `lib/policy.js:79-86` (`unattendedFrom`, unchanged, consumed), `lib/policy.js:115-190` (mode helpers, including 1.7.0's `stricterMode`/`resolveTreeMode` at `140-161` which stay unchanged, through the `isUnattended` IIFE at `184-190`), `lib/policy.js:1606-1618` (export block)
- Modify: `plugin.js:180` (factory signature), `plugin.js:181-696` (setup; `isUnattended` reads), `plugin.js:697-1145` (hooks; `tool.authorize`, the tree-gate `unattended` argument, and `event` at `1002-1144`)
- Modify: `tests/policy.test.mjs:449-622` (mode and attendance tests; `isUnattended` assertion at `:547`), `:696-763` (inherited-mode and G3 resolver tests, unchanged and still required to pass)
- Modify: `tests/tool-authorization.test.mjs`
- Modify: `tests/permission-event.test.mjs`
- Modify: `tests/plugin-exports.test.mjs:8-117,122-224`
- Modify: `tests/tree-rules.test.mjs` (harness options; `:109-121` event-driven G3 test rewritten for `tool.authorize`; one appended G2 attendance test)

**Interfaces:**
- Produces `effectiveAuthorizationMode({ fileMode, hasManualInChain, authority })`: with non-null authority returns `"manual"` when `hasManualInChain` is true and `"god"` otherwise; with null authority it ignores `hasManualInChain` and normalizes the G3 file mode (file `god` becomes `auto`), so the no-authority path is unchanged from 1.7.x.
- Produces `riskDecision({ isChild, attended, mode, level, baseline, verdict }) -> "continue" | "handoff" | "deny"` implementing the matrix above. `baseline` is the string `input.baseline.decision` (`"allow" | "ask"`; `"deny"` never reaches it because hard-floor row 1 already returned), and `level` is the live `level()` value (`"on" | "static"`; `off` never reaches it).
- Produces `readLaunchCmdline()` (reads `/proc/self/cmdline`, split on NUL, empties dropped) and `unattendedFromSource(readCmdline)` (returns `unattendedFrom(readCmdline())`, and `true` if `readCmdline` throws). Removes the module-load `isUnattended` constant from `lib/policy.js` and its export.
- `OpencodeGuard(input, { readCmdline = readLaunchCmdline } = {})`: the attended/unattended source is an explicit factory option, evaluated once at factory initialization into a local `unattended`. A provided `readCmdline` that is not a function rejects factory initialization with fixed code `invalid_attendance_source`. Because OpenCode plugin options come from JSON config, which cannot carry a function, host configuration cannot reach this option; only in-process callers such as the test harnesses can inject it. `lib/policy.js` reads no environment variable for attendance.
- Keeps current `classifyCached(command, sessionID, route)` and route/privacy behavior; live authority, `manual`, `edits`, and `static` never call it.
- Primary `permission.asked` event handling remains only for `edits`/`auto`; registered children are handled before event publication by core, and file-derived GOD never replies.

- [ ] **Step 1: Write pure mode and risk-decision tests.**

Append to `tests/policy.test.mjs`:

```js
test("explicit manual ancestry caps authority; otherwise only trusted authority creates effective GOD", () => {
  const authority = { workerID: "worker_a", workerEpoch: "epoch_a", leaseID: "lease_a", authorityEpoch: 1 };
  assert.equal(P.effectiveAuthorizationMode({ fileMode: "manual", hasManualInChain: true, authority }), "manual");
  assert.equal(P.effectiveAuthorizationMode({ fileMode: "auto", hasManualInChain: true, authority }), "manual");
  assert.equal(P.effectiveAuthorizationMode({ fileMode: "auto", hasManualInChain: false, authority }), "god");
  assert.equal(P.effectiveAuthorizationMode({ fileMode: "god", hasManualInChain: false, authority: null }), "auto");
  assert.equal(P.effectiveAuthorizationMode({ fileMode: "edits", hasManualInChain: false, authority: null }), "edits");
  // Without authority an ancestor manual file does not override the G3 file-mode result.
  assert.equal(P.effectiveAuthorizationMode({ fileMode: "auto", hasManualInChain: true, authority: null }), "auto");
});

test("risk disposition covers primary, child, attendance, baseline, and verdict", () => {
  const decide = (input) => P.riskDecision({ level: "on", baseline: "ask", ...input });
  assert.equal(decide({ isChild: false, attended: true, mode: "manual", verdict: null }), "continue");
  assert.equal(decide({ isChild: true, attended: true, mode: "manual", verdict: null }), "handoff");
  assert.equal(decide({ isChild: true, attended: true, mode: "auto", verdict: "SAFE" }), "continue");
  assert.equal(decide({ isChild: true, attended: true, mode: "auto", verdict: "RISKY" }), "handoff");
  assert.equal(decide({ isChild: false, attended: true, mode: "auto", verdict: "RISKY" }), "continue");
  assert.equal(decide({ isChild: false, attended: false, mode: "auto", verdict: "RISKY" }), "deny");
  assert.equal(decide({ isChild: true, attended: true, mode: "auto", verdict: null, baseline: "allow" }), "continue");
  assert.equal(decide({ isChild: true, attended: true, mode: "god", verdict: "RISKY" }), "continue");
});

test("static disposition: no verdict, baseline plus context, unattended primary continues", () => {
  const decide = (input) => P.riskDecision({ level: "static", baseline: "ask", verdict: null, ...input });
  assert.equal(decide({ isChild: false, attended: true, mode: "manual" }), "continue");
  assert.equal(decide({ isChild: false, attended: true, mode: "auto" }), "continue");
  assert.equal(decide({ isChild: false, attended: false, mode: "auto" }), "continue");
  assert.equal(decide({ isChild: false, attended: false, mode: "manual" }), "continue");
  assert.equal(decide({ isChild: true, attended: true, mode: "manual" }), "handoff");
  assert.equal(decide({ isChild: true, attended: true, mode: "auto" }), "handoff");
  assert.equal(decide({ isChild: true, attended: true, mode: "auto", baseline: "allow" }), "continue");
  assert.equal(decide({ isChild: true, attended: true, mode: "god" }), "continue");
});

test("promptable credentials map through riskDecision as on/ask/no-verdict whatever the real level and baseline", () => {
  const credential = (input) => P.riskDecision({ level: "on", baseline: "ask", verdict: null, ...input });
  assert.equal(credential({ isChild: false, attended: true, mode: "auto" }), "continue");
  assert.equal(credential({ isChild: true, attended: true, mode: "auto" }), "handoff");
  assert.equal(credential({ isChild: false, attended: false, mode: "auto" }), "deny");
  assert.equal(credential({ isChild: false, attended: false, mode: "manual" }), "deny");
});

test("attendance comes only from the injected launch command line and fails strict", () => {
  assert.equal(P.unattendedFromSource(() => ["opencode"]), false);
  assert.equal(P.unattendedFromSource(() => ["opencode", "run", "work"]), true);
  assert.equal(P.unattendedFromSource(() => { throw new Error("no proc"); }), true);
  assert.equal(typeof P.readLaunchCmdline, "function");
  assert.equal(Object.hasOwn(P, "isUnattended"), false);
});
```

In the existing test `"a session counts as unattended when nobody can answer a prompt"` (`tests/policy.test.mjs:539`), delete the line `assert.equal(typeof P.isUnattended, "boolean");` (`:547`); the new test above replaces it. Leave the 1.6.1 `unattendedFrom` token tests (`:555-622`) and the 1.7.0 G3 resolver tests (`:708-763`) unchanged.

- [ ] **Step 2: Run policy RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/policy.test.mjs
```

Expected: FAIL because `effectiveAuthorizationMode`, `riskDecision`, `unattendedFromSource`, and `readLaunchCmdline` are absent and `isUnattended` is still exported. The static-disposition and credential-mapping tests fail with `P.riskDecision is not a function`.

- [ ] **Step 3: Implement and export both pure helpers.**

Implement exactly:

```js
const effectiveAuthorizationMode = ({ fileMode, hasManualInChain, authority }) => {
  // R4: an explicit manual file anywhere in the chain caps live authority only.
  // Without authority the G3 file-mode result stands exactly as in 1.7.x.
  if (authority) return hasManualInChain ? "manual" : "god";
  return normalizeGlobalMode(fileMode);
};

// baseline: the string input.baseline.decision ("allow" | "ask"). level: "on" | "static".
const riskDecision = ({ isChild, attended, mode, level, baseline, verdict }) => {
  if (mode === "god" || baseline === "allow" || verdict === "SAFE") return "continue";
  if (isChild) return "handoff";
  if (!attended) return level === "static" ? "continue" : "deny";
  return "continue";
};
```

Export both from `lib/policy.js`. Keep `normalizeGlobalMode` behavior unchanged for global/parent inheritance.

The matrix-to-call mapping is fixed; every call site passes all six keys:

| Call site | `level` | `baseline` | `verdict` |
|---|---|---|---|
| promptable credential (hard-floor row 10) | literal `"on"` | literal `"ask"` | `null` |
| `static` non-read (row 12) | `"static"` | `input.baseline.decision` | `null` |
| `on`, attended `manual`/`edits` (row 14, no classifier) | `"on"` | `input.baseline.decision` | `null` |
| `on`, AUTO or unattended, after `classifyCached` (row 14) | `"on"` | `input.baseline.decision` | `"SAFE"`, `"RISKY"`, the `error:*` string, or `null` for no lane |

The credential row forces `"on"`/`"ask"` so that a `static` unattended primary still denies a promptable credential and a baseline `allow` (for example an `rbw *` allow rule) never lets a child skip handoff, as the matrix's "Promptable credential" column requires. A `static` unattended primary otherwise continues after the hard floors (matrix row "`static`, unattended primary").

Replace the module-load `isUnattended` IIFE at `lib/policy.js:184-190` with exactly:

```js
// The launch command line decides attendance. The source is injected by the
// plugin factory; production passes readLaunchCmdline. Any read failure resolves
// to the strict (unattended) direction.
const readLaunchCmdline = () => readFileSync("/proc/self/cmdline", "utf8").split("\0").filter(Boolean);

const unattendedFromSource = (readCmdline) => {
  try {
    return unattendedFrom(readCmdline());
  } catch {
    return true;
  }
};
```

Export `readLaunchCmdline` and `unattendedFromSource` in place of `isUnattended`. In `plugin.js`, import them instead of `isUnattended`, change the factory signature to `OpencodeGuard = async ({ client, directory, delegation }, { readCmdline = readLaunchCmdline } = {})`, reject with `Object.assign(new Error("invalid attendance source"), { code: "invalid_attendance_source" })` when `typeof readCmdline !== "function"`, compute `const unattended = unattendedFromSource(readCmdline)` once at factory entry, and replace every `isUnattended` read with `unattended`. At `3a2f566` the reads are the import (`plugin.js:72`), the tree gate's `unattended: isUnattended` argument (`:782`, ported in Task 3), the god bypass, native-credential and classifier sites Task 3 already rewrote, and the `event` early return (`:1045`). `grep -n isUnattended plugin.js lib/*.js` must print nothing afterwards. The tree gate receives the same factory-local `unattended` the classifier and credential floors use, so G2's "attended root" and the rest of guard can never disagree about attendance.

- [ ] **Step 4: Run policy GREEN.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/policy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Add full real-hook matrix tests before changing classifier flow.**

Extend the `authorize` harness with `tokens = ["opencode"]`, `classifierConfig = "direct"`, and `fetchError = null`. When `classifierConfig === "none"`, write classifier.json as `{ "broker": false }`; otherwise keep the existing direct URL. When `fetchError` is non-null, make `globalThis.fetch` throw `new Error(fetchError)`. Always inject the attendance source through the factory option: `OpencodeGuard({ client, directory: ${JSON.stringify(home)}, delegation }, { readCmdline: () => ${JSON.stringify(tokens)} })` (the directory stays the existing temp home from Task 3; never `"/work"`). Also add the options `branchID = branch ? "branch_a" : null` and `rootSessionID = branch ? "ses_root" : "ses_a"` at the end of the harness's destructured parameters (after `branch`, so their defaults can read it), and build `input.branchID`, `input.rootSessionID`, and `input.execution.rootSessionID` from `${JSON.stringify(branchID)}` and `${JSON.stringify(rootSessionID)}` instead of the inline `branch ? ... : ...` expressions. The default `["opencode"]` pins an attended primary, so no harness result depends on the test runner's own command line; set no environment variable for attendance. Append to `tests/tool-authorization.test.mjs` (define `childBranch` exactly as shown):

```js
const childBranch = { workerID: "worker_a", workerEpoch: "epoch_a", executionID: "exec_a", sessionID: "ses_a", rootSessionID: "ses_root", fencingToken: 1, branchID: "branch_a", branchFencingToken: 1, kind: "native", delivery: "foreground" };

test("inconsistent branch identity is denied before classification, even with live authority", () => {
  const cases = [
    { name: "branch without branchID", branch: childBranch, branchID: null },
    { name: "branchID without branch", branch: null, branchID: "branch_a" },
    { name: "primary shape from a non-root session", branch: null, branchID: null, rootSessionID: "ses_root" },
  ];
  for (const { name, ...identity } of cases) {
    for (const authority of [null, liveAuthority]) {
      const result = authorize({ ...identity, authority, answer: "SAFE", arguments: { command: "npm run build" } });
      assert.equal(result.error, null, name);
      assert.equal(result.output.decision, "deny", name);
      assert.deepEqual(result.classified, [], name);
    }
  }
});

test("live authority skips classification but only after hard floors", () => {
  for (const command of ["npm run build", "rbw get deployment-token"]) {
    const result = authorize({ authority: liveAuthority, mode: "manual", arguments: { command } });
    assert.equal(result.output.decision, "continue");
    assert.deepEqual(result.classified, []);
  }
});

test("file GOD without authority is AUTO and cannot pass a risky child", () => {
  const result = authorize({ mode: "god", branch: childBranch, answer: "RISKY", arguments: { command: "npm install package" } });
  assert.equal(result.output.decision, "handoff");
  assert.equal(result.classified.length, 1);
});

test("manual and edits never classify; primary continues to its prompt and child hands off", () => {
  for (const mode of ["manual", "edits"]) {
    const primary = authorize({ mode, arguments: { command: "npm install package" } });
    assert.equal(primary.output.decision, "continue");
    assert.deepEqual(primary.classified, []);
    const child = authorize({ mode, branch: childBranch, arguments: { command: "npm install package" } });
    assert.equal(child.output.decision, "handoff");
    assert.deepEqual(child.classified, []);
  }
});

test("AUTO classifier results preserve primary prompts and terminate child risk", () => {
  assert.equal(authorize({ mode: "auto", answer: "SAFE", arguments: { command: "npm run build" } }).output.decision, "continue");
  assert.equal(authorize({ mode: "auto", answer: "RISKY", arguments: { command: "npm install package" } }).output.decision, "continue");
  assert.equal(authorize({ mode: "auto", branch: childBranch, answer: "SAFE", arguments: { command: "npm run build" } }).output.decision, "continue");
  assert.equal(authorize({ mode: "auto", branch: childBranch, answer: "RISKY", arguments: { command: "npm install package" } }).output.decision, "handoff");
});

test("static never classifies and uses baseline plus primary-child context", () => {
  const primary = authorize({ level: "static", arguments: { command: "npm install package" } });
  assert.equal(primary.output.decision, "continue");
  assert.deepEqual(primary.classified, []);
  const childAsk = authorize({ level: "static", branch: childBranch, arguments: { command: "npm install package" } });
  assert.equal(childAsk.output.decision, "handoff");
  const childAllow = authorize({ level: "static", branch: childBranch, baseline: { decision: "allow", immutableDeny: false, matches: [{ origin: "agent_config", decision: "allow" }] }, arguments: { command: "npm install package" } });
  assert.equal(childAllow.output.decision, "continue");
});

test("promptable credentials continue for live GOD, prompt primary, hand off child", () => {
  assert.equal(authorize({ authority: liveAuthority, arguments: { command: "rbw get x" } }).output.decision, "continue");
  assert.equal(authorize({ arguments: { command: "rbw get x" } }).output.decision, "continue");
  assert.equal(authorize({ branch: childBranch, arguments: { command: "rbw get x" } }).output.decision, "handoff");
});

test("classifier transport errors and no-lane results prompt primary and hand off child", () => {
  for (const options of [{ fetchError: "ECONNREFUSED" }, { classifierConfig: "none" }]) {
    assert.equal(authorize({ ...options, arguments: { command: "npm install package" } }).output.decision, "continue");
    assert.equal(authorize({ ...options, branch: childBranch, arguments: { command: "npm install package" } }).output.decision, "handoff");
  }
});

test("unattended primary allows SAFE/static policy and denies risk, no lane, and promptable credentials", () => {
  const tokens = ["opencode", "run", "work"];
  assert.equal(authorize({ tokens, answer: "SAFE", arguments: { command: "npm run build" } }).output.decision, "continue");
  assert.equal(authorize({ tokens, answer: "RISKY", arguments: { command: "npm install package" } }).output.decision, "deny");
  assert.equal(authorize({ tokens, classifierConfig: "none", arguments: { command: "npm install package" } }).output.decision, "deny");
  assert.equal(authorize({ tokens, arguments: { command: "rbw get x" } }).output.decision, "deny");
  assert.equal(authorize({ tokens, level: "static", arguments: { command: "npm install package" } }).output.decision, "continue");
});

test("G4 uses history only when canonical branch fields are absent, accepts agreement, and denies disagreement", () => {
  const closed = { tool: "workflow_run", arguments: { name: "review-panel" } };
  const { kind, delivery, ...branchWithoutCanonicalFields } = childBranch;
  const historyOnly = authorize({ ...closed, historyTeam: true, treeParentID: "ses_root", branch: branchWithoutCanonicalFields });
  assert.equal(historyOnly.output.decision, "deny");
  const agreeing = authorize({ ...closed, historyTeam: true, treeParentID: "ses_root", branch: { ...childBranch, delivery: "background" } });
  assert.equal(agreeing.output.decision, "deny");
  const disagreeing = authorize({ ...closed, historyTeam: true, treeParentID: "ses_root", branch: { ...childBranch, delivery: "foreground" } });
  assert.equal(disagreeing.output.decision, "deny");
  assert.match(disagreeing.output.reason, /^\[opencode-guard\] denied \(G4, tools closed to agent teams\):/);
});
```

Do not add any environment-variable seam to `lib/policy.js`; attendance is injected only through the factory option wired in Step 3. Append this factory-option test to `tests/tool-authorization.test.mjs` (extend the harness with `readCmdlineLiteral = null`; when non-null, pass it verbatim as the `readCmdline` value instead of the tokens function, and record a factory rejection as `initError = { code }` in the printed JSON):

```js
test("a non-function attendance source rejects factory initialization", () => {
  const result = authorize({ readCmdlineLiteral: '["opencode"]' });
  assert.deepEqual(result.initError, { code: "invalid_attendance_source" });
});
```

Also extend the pure `riskDecision` test with these rows:

```js
assert.equal(decide({ isChild: false, attended: false, mode: "auto", verdict: "SAFE" }), "continue");
assert.equal(decide({ isChild: false, attended: false, mode: "auto", verdict: null }), "deny");
```

Before RED, retain the Task 1 delegation stub in `tests/permission-event.test.mjs`, retain the current five tests, and append:

```js
test("file-derived god never replies to a primary permission", () => {
  const { classified, replies } = raise({ mode: "god", permission: "bash", command: "npm run build" });
  assert.deepEqual(classified, []);
  assert.deepEqual(replies, []);
});

test("AUTO never replies to a promptable credential", () => {
  const { replies } = raise({ mode: "auto", permission: "bash", command: "rbw get deployment-token", answer: "SAFE" });
  assert.deepEqual(replies, []);
});
```

Then move the event-driven G3 tree test to `tool.authorize`. Step 10 stops answering a child's `permission.asked` (core hands child asks off before publication), so `test("G3: a grandchild never runs looser than the nearest ancestor that set a mode", ...` in `tests/tree-rules.test.mjs` (`:109-121`), which expects a child's `edit` permission to be answered `"once"`, would fail for the wrong reason. Extend the `run` harness (signature from Task 3) with `answer = null`, `realDirectory = false`, and `bashRules = null`:

- When `bashRules` is non-null, write `~/.config/opencode/opencode.json` as `JSON.stringify({ permission: { bash: bashRules } })`. Without it, `loadBashRules` starts from opencode's default `*: allow`, and the launder floor denies an unverifiable command.
- When `answer` is non-null, write `~/.config/opencode/classifier.json` as `JSON.stringify({ url: "http://classifier.invalid/v1/chat/completions" })`, and at the top of the generated script install the same stub the `authorize` harness uses: `globalThis.fetch = async (_url, init) => { classified.push(JSON.parse(init.body).messages[1].content); return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: ${JSON.stringify(answer)} } }] }) }; };`. Declare `const classified = [];` in the script whatever `answer` is, and add `classified` to the final printed JSON.
- Pass `directory: ${JSON.stringify(realDirectory ? home : "/work")}` to `OpencodeGuard` instead of the literal `"/work"`. cc-safety-net denies every `bash` command whose cwd does not exist. Every existing test keeps `"/work"`, so the G4 history-paging assertion on `directory: "/work"` is unchanged.

Replace that test (`:109-121`) with exactly:

```js
test("G3: a grandchild never runs looser than the nearest ancestor that set a mode", () => {
  // A child's effective ask: an inherited manual hands off without a classifier call;
  // an inherited auto asks the classifier, and SAFE continues.
  const steps = [{ tool: "bash", sessionID: "ses_leaf", args: { command: "npm install package" }, baseline: "ask" }];
  const common = { sessions: CHAIN, answer: "SAFE", realDirectory: true, bashRules: { "*": "ask" }, steps };
  const rootManual = run({ ...common, modes: { ses_root: "manual" }, globalMode: "auto" });
  assert.deepEqual(rootManual.outcomes, ["handoff"],
    "root manual, global auto: the grandchild stays manual (before 1.7.0 it read only ses_mid and ran auto)");
  assert.deepEqual(rootManual.classified, []);
  assert.deepEqual(run({ ...common, modes: { ses_root: "auto" }, globalMode: "auto" }).outcomes, ["ran"],
    "root auto, global auto: classified SAFE and continues");
  assert.deepEqual(run({ ...common, modes: { ses_root: "auto" }, globalMode: "manual" }).outcomes, ["handoff"],
    "global manual still holds, as before");
  assert.deepEqual(run({ ...common, modes: { ses_root: "manual", ses_mid: "auto" }, globalMode: "manual" }).outcomes,
    ["ran"], "an intermediate session's own file is both the parent and the nearest ancestor");
});
```

and append:

```js
test("G2 through the hook: an unattended process may not start a background task, even from a root", () => {
  const result = run({ sessions: TEAM, modes: { ses_root: "auto" }, tokens: ["opencode", "run", "work"], steps: [
    { tool: "task", sessionID: "ses_root", args: spawnArgs({ background: true }) },
    { tool: "task", sessionID: "ses_root", args: spawnArgs({}) },
  ] });
  assert.deepEqual(result.outcomes, ["deny", "ran"]);
});
```

Also append these R4 real-hook tests before RED (the harness already records 4 mode-file reads for the leaf chain): `test("G3: own manual caps live authority", ...)` uses `modes: { ses_leaf: "manual" }` plus authority and expects `handoff` for an effective ask; `test("G3: ancestor manual caps live authority", ...)` uses `modes: { ses_root: "manual" }` plus authority and expects `handoff`; `test("G3: no manual lets live authority become god", ...)` uses no manual plus authority and expects `ran`; retain `test("G3: a failed mode lookup denies a subagent tool call under live authority too", ...)` as the lookup-failure case. The first two tests prove own and ancestor manual files, the third proves the non-manual path, and all retain the single ancestry walk/read-count assertion.

The G3 rewrite is RED at Step 6, because Task 3 lets a floor-passing child command `continue`. The G2 attendance test already passes once Step 3 has wired the factory option and `unattended` into the tree gate. It is a regression pin for that wiring, not a RED driver. Keep `"G3: in the permission handler an unresolvable mode leaves the prompt with the person"` unchanged; it must still pass after Step 10.

- [ ] **Step 6: Run matrix RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/tool-authorization.test.mjs tests/permission-event.test.mjs tests/tree-rules.test.mjs
```

Expected: at least the file-GOD, child, and classifier disposition cases FAIL because Task 3 contains only temporary floor-passing behavior, and the rewritten tree-rules G3 test FAILS on its first `["handoff"]` assertion (Task 3 returns `continue`, shown as `["ran"]`).

- [ ] **Step 7: Wire canonical child identity and trusted GOD mode.**

Immediately after the `off` return and before the stale-turn floor (hard-floor row 0), deny inconsistent identity: `if ((input.branch === null) !== (input.branchID === null) || (input.branch === null && input.sessionID !== input.rootSessionID)) { output.decision = "deny"; log("hard-floor-deny", { sessionID: input.sessionID, callID: input.callID, tool: input.tool, code: "inconsistent_branch" }); return; }`. Row 0 sits above the tree gate (row 3a) and the G3 resolution (row 4a), so an inconsistent shape is denied before any session lookup. After hard floors derive `isChild = input.branch !== null && input.branchID !== null` (both non-null is now the only child shape that reaches here) and `mode = effectiveAuthorizationMode({ fileMode: modeResolution.fileMode, hasManualInChain: modeResolution.hasManualInChain, authority: input.authority })`. Modify `modeFor` to return that object: it reads every mode file in the one ancestry walk, computes the existing G3 `fileMode` unchanged, and sets `hasManualInChain` when its own or any ancestor's explicit file normalizes to `manual`. Do not call `modeFor` a second time: `tests/tree-rules.test.mjs` pins one ancestry walk per call (4 mode-file reads). An explicit manual returns the manual result even with authority; otherwise live authority returns `continue`, and a file `god` follows AUTO. Do not persist `input.worker`, `execution`, `branch`, or `authority`; core owns all fences and permits.

```bash
cd /home/dev/opencode-guard-plan2 && node --test --test-name-pattern='inconsistent branch|live authority|file GOD' tests/tool-authorization.test.mjs
```

Expected: matching tests PASS; unrelated tests are skipped.

- [ ] **Step 8: Wire static/manual/edits and promptable-credential disposition.**

Set `attended = !unattended` (the factory-local value from Step 3). Promptable credentials call `riskDecision({ isChild, attended, mode, level: "on", baseline: "ask", verdict: null })`, exactly as the Step 3 mapping table states, except trusted GOD already returned. For `static`, never classify and call `riskDecision({ isChild, attended, mode, level: "static", baseline: input.baseline.decision, verdict: null })`; a `static` unattended primary therefore continues. For attended `manual`/`edits`, never classify and call `riskDecision({ isChild, attended, mode, level: "on", baseline: input.baseline.decision, verdict: null })`; a primary continues and a child effective ask hands off. Assign the result to `output.decision` and return.

```bash
cd /home/dev/opencode-guard-plan2 && node --test --test-name-pattern='manual and edits|static never|promptable credentials' tests/tool-authorization.test.mjs
```

Expected: matching tests PASS.

- [ ] **Step 9: Wire AUTO/unattended classifier outcomes.**

Static reads continue. For `on`, AUTO or any unattended non-read uses existing `routeFor` and `classifyCached`; map SAFE, RISKY, transport error, and no-lane through `riskDecision({ isChild, attended, mode, level: "on", baseline: input.baseline.decision, verdict })` with `verdict` the classifier result, or `null` when `route.lanes` is empty. An ordinary decision sets `output.decision` and returns; it does not throw. Delete the former no-lane, RISKY, and classifier-unavailable throws (`plugin.js:936-977` at `3a2f566`: no-lane `:936-941`, RISKY `:953-966`, classifier unavailable `:970-977`) together with their message strings, including every `oc-auto static` and "switch to manual mode" text; do not reword them. Live GOD never reaches the classifier.

```bash
cd /home/dev/opencode-guard-plan2 && node --test --test-name-pattern='AUTO classifier|transport errors|unattended primary' tests/tool-authorization.test.mjs
```

Expected: matching tests PASS.

- [ ] **Step 10: Migrate primary permission events without preserving child/file-GOD authorization.**

In `plugin.js`, delete `handled` (`:241`), `denials` and `noteDenial` (`:248-255`), delegated-child rejection/reply code (`refuse` and its callers, `:1063-1071` and `:1102-1131` at `3a2f566`), and denial surfacing in `tool.execute.after`. Keep `tool.execute.after` redaction then `await loopHook.after(...)`. In `event`, keep the 1.7.0 team-index feed first: `teamIndex.observe(event)` in its own try/catch (`:1005-1009`), at every level, before anything can return. Then keep notifier and session deletion. For `permission.asked`, return without a reply in each of these cases:

- unattended;
- child: `(await infoFor(p.sessionID))?.parentID` is set, as before this rebase;
- `modeFor(p.sessionID)` throws: keep the existing G3 catch (`:1052-1061`), which leaves the prompt with the person;
- `manual`;
- file mode `god`.

Do not switch the child check to `sessionTree.parentOf`. The classifier-routing harnesses in `tests/plugin-exports.test.mjs` (`runRoutedClassifier`, event at `:97`) and `tests/broker.test.mjs` (harness `:102-246`, event at `:221`) raise `permission.asked` for a primary that has its own mode file, through a legacy client with no `session.get`. A throwing lookup would silently skip their classifier path. `infoFor` returns `null` on failure (`plugin.js:295-308`), which treats a child whose lookup failed as a primary; 1.7.1 behaves the same way at `:1070`, and core keeps registered-child asks out of this event. Retain existing `edits` approvals and AUTO SAFE/static-read approval; leave AUTO RISKY/error and all promptable credentials unanswered for the primary. No event path may infer live authority. Keep the `alwaysPatterns` map (`plugin.js:208`) and the `permission.asked`/`permission.replied` blanket-"Always" error report (`:1020-1040`) unchanged: `tests/launder.test.mjs` "an Always reply that saved a blanket pattern is reported as an error" pins it. Make the tests already added in Step 5 pass without changing their assertions. `tests/tree-rules.test.mjs` "G3: in the permission handler an unresolvable mode leaves the prompt with the person" must pass unchanged.

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/permission-event.test.mjs tests/tree-rules.test.mjs
```

Expected: PASS.

- [ ] **Step 11: Run focused GREEN.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/policy.test.mjs tests/tool-authorization.test.mjs tests/permission-event.test.mjs tests/plugin-exports.test.mjs tests/classifier.test.mjs tests/launder.test.mjs tests/tree-rules.test.mjs tests/tree.test.mjs
```

Expected: PASS.

- [ ] **Step 12: Commit complete policy migration.**

```bash
git -C /home/dev/opencode-guard-plan2 add lib/policy.js plugin.js tests/policy.test.mjs tests/tool-authorization.test.mjs tests/permission-event.test.mjs tests/plugin-exports.test.mjs tests/tree-rules.test.mjs
git -C /home/dev/opencode-guard-plan2 commit -m "feat: authorize delegated tools with live authority"
```

### Task 5: Safe logs, user text, documentation, and 1.9.0 release metadata

**Files:**
- Modify: `plugin.js:96-166` (SDK probe `:96-110` with `appendFileSync` at `:106`, cc-safety-net probe at `:112-118` with `appendFileSync` at `:115`, `LOG` at `:127`, `log` at `:155-166`), `plugin.js:181-696` (runtime `log(` call sites at `3a2f566`: `:185,189,368,394,418,428,443,450,560,581,599,619,624,644`; `:368` is 1.7.0's `modeFor` G3 log, which passes the lookup error text), `plugin.js:697-1145` (hooks; includes 1.7.0's `tree-index-error` log at `:1009` and the event G3 `prompt(G3/unresolved)` log at `:1059`, both of which pass error text)
- Modify: `tests/tool-authorization.test.mjs`
- Modify: `tests/plugin-exports.test.mjs`
- Modify: `tests/tree-rules.test.mjs` (log capture and one rule-ID log test)
- Modify: `README.md:1-508` (notably "Subagents inherit their ancestors' mode" `:338-352` and "Agent team tree rules" `:366-409`)
- Modify: `docs/STATE.md` (mode-file contract and G3 resolution, added 1.7.0; 39 lines)
- Modify: `CHANGELOG.md:8-10` (insert between `## [Unreleased]` at `:8` and `## [1.7.1] — 2026-10-08` at `:10`)
- Modify: `package.json:1-63`
- Modify: `package-lock.json:1-12` (root `version` at `:3`, `packages[""].version` at `:9`; both read a stale `1.4.0` at `3a2f566`)

**Interfaces:**
- `log(event, metadata = {})` writes one JSON object per line with an allowlist of `event`, `time`, `sessionID`, `callID`, `tool`, `ruleID`, `count`, and fixed `code`. Unknown metadata keys are discarded.
- `tool.authorize` output is `{ decision, reason? }`. Tasks 3-4 preserve and surface only the existing G1/G2/G4/G3 denial texts through `reason`; this task pins their delivery and deletes obsolete non-tree throw text.
- Package dependencies and peer dependencies remain unchanged.

- [ ] **Step 1: Write raw-log and advice regression tests before changing logging.**

Add `readFileSync` to the harness's existing `node:fs` import. After the child exits and before the outer `finally` removes `home`, read `join(home, ".local/share/opencode/autoclass.log")`, falling back to `""` only on `ENOENT`, and assign that text to `result.log`. Then append:

```js
test("decision logs never contain the raw command, even on the classifier retry path", () => {
  const sentinel = "npm install RAW-COMMAND-SENTINEL";
  // A direct-lane transport failure drives classifyWithRetry, which logs before each retry.
  const result = authorize({ fetchError: "ECONNREFUSED", arguments: { command: sentinel } });
  assert.match(result.log, /\S/, "the retry path must have written a log record");
  assert.doesNotMatch(result.log, /RAW-COMMAND-SENTINEL/);
  assert.doesNotMatch(result.log, /F9|switch to manual/i);
});
```

This drives a path that genuinely logs: an attended AUTO primary (`mode: "auto"` default) with a direct classifier lane whose `fetch` throws reaches `classifyCached` -> `classifyVoted` -> `classifyWithRetry`, which at `3a2f566` logs the template `retrying in ${waitMs}ms after ${verdict}` with the raw `command` as the second argument (`plugin.js:624`) twice, and, if the broker lane is also in the route, logs `direct classifier ${verdict}, falling back to the broker` with the raw `command` (`:599`). These helpers are textually unchanged from `0b52854` (`:603`, `:578` there). Tasks 1-4 keep them unchanged. The test takes about 3.3 s because of the 750 ms and 2500 ms retry waits.

Then give the `tests/tree-rules.test.mjs` harness the same log capture: after the child exits and before its `finally` removes `home`, read `join(home, ".local/share/opencode/autoclass.log")` (falling back to `""` only on `ENOENT`) into the returned object's `log` field (add `readFileSync` to its `node:fs` import). Then append:

```js
test("tree-rule and G3 denials log a fixed code and the rule ID, never the denial or lookup text", () => {
  const g1 = run({ sessions: TEAM, steps: [{ tool: "task", sessionID: "ses_mate", args: spawnArgs({ task_id: "ses_fg" }) }] });
  const g3 = run({ sessions: CHAIN, getFails: true, steps: [{ tool: "read", sessionID: "ses_leaf", args: { filePath: "/work/a" } }] });
  for (const [result, ruleID] of [[g1, "G1"], [g3, "G3"]]) {
    assert.deepEqual(result.outcomes, ["deny"], ruleID);
    const records = result.log.split("\n").filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(records.some((r) => r.event === "hard-floor-deny" && r.code === "tree_rule" && r.ruleID === ruleID),
      `${ruleID}: ${JSON.stringify(records)}`);
    assert.doesNotMatch(result.log, /opencode-guard\] denied|server away|not a child of this session/, ruleID);
  }
});
```

Every `autoclass.log` line must parse as JSON. `server away` is the injected `session.get` failure text, which 1.7.x's `modeFor` log (`plugin.js:368`) writes verbatim today.

Add to `tests/plugin-exports.test.mjs`:

```js
test("guard has no core/schema dependency and no obsolete authorization hook", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.doesNotMatch(source, /@opencode-ai\/(?:core|schema)/);
  assert.equal(source.includes('"tool.execute.before"'), false);
  assert.equal(pkg.dependencies?.["@opencode-ai/core"], undefined);
  assert.equal(pkg.dependencies?.["@opencode-ai/schema"], undefined);
});

test("plugin.js carries no Manual, F9, or mode-switch advice string", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /switch to manual|manual mode asks|\bF9\b|oc-auto static|switch(?:ing)? modes?/i);
});

test("startup failure logging never concatenates SDK or safety-net errors", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /client unavailable:[^\n]*\+\s*e\b/);
  assert.doesNotMatch(source, /cc-safety-net unavailable:[^\n]*safetyNet\.error/);
  assert.doesNotMatch(source, /appendFileSync\([\s\S]{0,300}safetyNet\.error/);
});
```

- [ ] **Step 2: Run safe-output RED.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/tool-authorization.test.mjs tests/plugin-exports.test.mjs tests/tree-rules.test.mjs
```

Expected: the tree-rules log test FAILS at `JSON.parse`, because each log line is still `<ISO time> <verdict> <text>`. The raw-command test FAILS on `assert.doesNotMatch(result.log, /RAW-COMMAND-SENTINEL/)`, with the log containing lines of the form `<ISO time> retrying in 750ms after error:Error: ECONNREFUSED npm install RAW-COMMAND-SENTINEL` and `... retrying in 2500ms after error:Error: ECONNREFUSED npm install RAW-COMMAND-SENTINEL`. This RED was observed at `0b52854` (not re-observed at `3a2f566`; the logger and both retry helpers are textually unchanged) by driving the same input through the then-current `tool.execute.before` (AUTO, direct lane, `fetch` throwing `ECONNREFUSED`, existing `directory`): `autoclass.log` received exactly those two retry lines plus `deny(error:Error: ECONNREFUSED) npm install RAW-COMMAND-SENTINEL`; Task 4 removes only the last one. The advice-string test and the dependency/hook test PASS (Tasks 3-4 deleted the advice strings with their throws); if the advice test fails, a throw text survived Task 4 and must be deleted, not reworded.

- [ ] **Step 3: Make module-startup logging fixed-code only.**

Define a module-scope `startupLog(code)` before the SDK import probe. It writes `JSON.stringify({ time: new Date().toISOString(), event: "startup-failure", code }) + "\n"` and catches only the file-write failure. Replace the two direct raw `appendFileSync` blocks with `startupLog("sdk_v2_unavailable")` and `startupLog("safety_net_unavailable")`; never serialize `e` or `safetyNet.error`.

```bash
cd /home/dev/opencode-guard-plan2 && node --test --test-name-pattern='startup failure logging' tests/plugin-exports.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Replace the runtime logger with an allowlisted JSONL record.**

Change `log(event, metadata = {})` to create a fresh object containing `time`, `event`, and only defined keys from `sessionID`, `callID`, `tool`, `ruleID`, `count`, and `code`; never spread metadata. Keep the 512 KiB truncation behavior, but make its marker a fixed JSON object.

- [ ] **Step 5: Convert runtime log call sites to safe metadata.**

Update classifier retry/vote/cleanup, participant, redaction, loop, permission-event, and authorization calls. Also convert the three 1.7.x tree logs: `modeFor`'s `log("deny(G3/ancestry)", ...)` (`:368`) becomes `log("tree-lookup-failed", { sessionID, ruleID: "G3", code: "tree_lookup_failed" })`; the event hook's `log("tree-index-error", ...)` (`:1009`) becomes `log("tree-index-error", { code: "tree_index_error" })`; and the event G3 catch's `log("prompt(G3/unresolved)", ...)` (`:1059`) becomes `log("permission-unresolved", { sessionID: p.sessionID, ruleID: "G3", code: "mode_unresolved" })`. The Task 3 `tree_rule` denials already pass only allowlisted keys. No call passes `command`, `output.title`, `error.message`, provider body, or pre-sanitized value. Broker `/failure` keeps its provider-health wire contract, but the local log records only fixed `classifier_failure`/status codes.

- [ ] **Step 6: Confirm no obsolete advice string remains; preserve tree/G3 reasons.**

There is no message rewrite in this task for non-tree floors: Tasks 3-4 deleted `controlDeny`, `credentialDeny`, and every classifier throw text outright. Preserve the existing G1/G2/G4/G3 text in `output.reason`; it is core's model-visible denial channel. Run:

```bash
cd /home/dev/opencode-guard-plan2 && node --test --test-name-pattern='no Manual, F9' tests/plugin-exports.test.mjs
```

Expected: PASS. If it fails, the named string is dead code left behind by Task 3 or 4: delete it, do not reword it.

- [ ] **Step 7: Run safe-output GREEN.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/tool-authorization.test.mjs tests/plugin-exports.test.mjs tests/tree-rules.test.mjs
```

Expected: PASS.

- [ ] **Step 8: Update README behavior tables and architecture, and `docs/STATE.md`.**

Edit `README.md` to state:

1. OpenCode delegation protocol v1 and a compatible core are required for 1.9.0.
2. `on`/`static` register `guard` with capabilities `toolAuthorizeV1` and `terminalHandoffV1`; `off` withdraws it and makes GOD unavailable.
3. GOD is proven by a live host authority fence, not a mode file, and bypasses only promptable risk.
4. Hard floors remain credential (shell and native), stale-turn, dispatch-capability, the agent-team tree rules G1/G2/G4, an unresolvable inherited mode (G3), config deny rule, guard-control, reveal-arm, immutable permission, cc-safety-net, and launder denials, plus inconsistent branch identity. They hold under a per-session file `god` and under live authority; the launder floor no longer stands aside in god (remove the README text saying it does).
5. Registered child asks become sanitized terminal handoffs; they never enter primary pending UI.
6. `delegation.sanitize` covers every typed question/permission string and ignores reveal state.
7. Authorization runs in `tool.authorize`; redaction/loop tracking remain in `tool.execute.after`; primary mode replies remain in `event`.
8. Remove statements that GOD turns the floor off, that child GOD derives from files, that AUTO risk must be refused because no awaited hook exists, or that recommend Manual/F9.
9. In "Subagents inherit their ancestors' mode" (`:338-352`), keep the G3 rule text (stricter of parent and nearest ancestor; an unreadable ancestry refuses the tool call and leaves a primary's prompt with the person). Delete the paragraph tail from "When a subagent in an inherited mode is refused a permission" through "fetching a secret is the parent's call." (`:347-352`). Task 4 deleted the refusal list it describes; a child's ask is now a core handoff (item 5).
10. In "Agent team tree rules" (`:366-409`), state that the rules run in `tool.authorize` after the dispatch gate and before config deny, and neither a per-session `god` file nor live authority lifts them; G2 uses canonical root identity when branch input is present, while G4 cross-checks history against canonical background direct children. A lookup the guard cannot complete denies the call. The agent receives the existing explanatory denial text through `output.reason`, and guard's log records `code: "tree_rule"` and `ruleID`. Keep the rule list, teammate definition, fail-closed classification text, and level-`off` paragraph.
11. State that all five 2026-10-08 R1-R5 decisions are binding implementation requirements.

Edit `docs/STATE.md`: state that a per-session `god` file no longer grants GOD for authorization from 1.9.0. Without a live host authority it is treated as `auto` (`effectiveAuthorizationMode`); live authority proves GOD only when no own or ancestor mode file explicitly says `manual`, which caps authority at manual. Keep the G3 resolution steps and rank unchanged. Where step 2's failure paragraph says the tool call is denied, say the denial is `tool.authorize` decision `deny` with the existing G3 text in `output.reason`, logged with `code: "tree_rule"` and `ruleID: "G3"`. The global-mode and unattended rows are unchanged.

- [ ] **Step 9: Write the 1.9.0 changelog entry.**

Add a new heading; do not edit or merge into any existing entry, and leave the `## [Unreleased]` heading in place and empty. Insert the entry immediately above the published `## [1.8.0]` entry. Replace `<release date>` with the output of `date +%F` on the day of the release commit; it must not be earlier than `2026-10-08`:

```markdown
## [1.9.0] — <release date>

### Added

- **Delegation protocol v1 participation.** Guard registers and heartbeats as the `guard` participant in `on` and `static` (the host binds Worker and domain), and synchronously fences and withdraws before `off` completes.
- **Typed pre-persistence sanitization.** `delegation.sanitize` redacts every question and permission payload field before core may persist a terminal handoff, and fails closed when a credential path, password-manager command, Bearer/Basic value, `-p<secret>`, or `--token`/`--password` value survives redaction; reveal and live GOD do not bypass it.

### Changed

- **Pre-execution policy uses `tool.authorize`.** Stale-turn, dispatch, config-deny, control-file, credential, cc-safety-net, launder and classifier decisions consume canonical host identity and set monotonic `continue`, `handoff` or `deny` decisions. Inconsistent branch identity is denied. `tool.execute.before` no longer carries authorization.
- **Agent team tree rules move with it.** G1 remains a fresh guard parent check beside core ownership; G2 uses canonical root identity when branch input is present; G4 cross-checks canonical direct-child background delivery with history; and G3 resolves inherited mode/manual ancestry once per call. An unreadable ancestry still denies. None yields to a per-session `god` file or to live authority; an explicit manual caps live authority. A refused agent receives the existing denial text through `output.reason`; the rule ID is also in the log.
- **GOD requires live authority and bypasses promptable risk only.** File text is not authority; immutable permission and guard hard floors remain effective. The launder floor and the native credential guard now hold in god as well; previously an attended file `god` lifted both.
- **Logs and denials contain no raw operation text or mode-switch advice.** Local decision logs contain fixed codes and safe identifiers only; `tool.authorize` returns the existing tree/G3 denial text only through `reason`.
```

- [ ] **Step 10: Update both version files with npm's lockfile writer.**

Run:

```bash
cd /home/dev/opencode-guard-plan2 && npm version 1.9.0 --no-git-tag-version
```

Expected: `package.json` `version` (from published `1.8.0`), `package-lock.json` `version`, and `package-lock.json` `packages[""].version` become `1.9.0`; dependency ranges and resolved package versions remain unchanged. If Step 11 then reports a lockfile mismatch, run `cd /home/dev/opencode-guard-plan2 && npm install --package-lock-only --no-fund --no-audit` once and re-run Step 11; the lockfile diff must touch only the two root version fields.

- [ ] **Step 11: Verify metadata exactly.**

Run:

```bash
cd /home/dev/opencode-guard-plan2 && node -e 'const p=require("./package.json");const l=require("./package-lock.json");if(p.version!=="1.9.0"||l.version!=="1.9.0"||l.packages[""].version!=="1.9.0")process.exit(1);if(p.dependencies["@opencode-ai/core"]||p.dependencies["@opencode-ai/schema"])process.exit(2)'
```

Expected: exit 0, no output.

- [ ] **Step 12: Run the complete test suite.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/*.test.mjs
```

Expected: all tests PASS. The explicit glob must include `broker`, `classifier`, `delegation-lifecycle`, `delegation-sanitizer`, `launder`, `loop-guard`, `permission-event`, `plugin-exports`, `policy`, `safety-net`, `stale-turn`, `tool-authorization`, `tree`, and `tree-rules` suites (14 files; the base had 11 files and 165 tests).

- [ ] **Step 13: Verify the package contents without publishing.**

```bash
cd /home/dev/opencode-guard-plan2 && npm pack --dry-run --json
```

Expected: exit 0; package name/version is `opencode-guard@1.9.0`; `plugin.js`, `lib/delegation.js`, other `lib/`, `bin/`, `examples/`, `NOTICE`, and `CHANGELOG.md` are included; tests and raw logs are absent.

- [ ] **Step 14: Inspect the final diff and commit release files.**

```bash
git -C /home/dev/opencode-guard-plan2 diff --check && git -C /home/dev/opencode-guard-plan2 status --short && git -C /home/dev/opencode-guard-plan2 diff -- README.md docs/STATE.md CHANGELOG.md package.json package-lock.json plugin.js tests/tool-authorization.test.mjs tests/plugin-exports.test.mjs tests/tree-rules.test.mjs
```

Expected: `diff --check` exits 0; only planned files are changed; no raw sentinel, core/schema dependency, `tool.execute.before`, or Manual/F9 advice is present in added lines.

Commit:

```bash
git -C /home/dev/opencode-guard-plan2 add plugin.js tests/tool-authorization.test.mjs tests/plugin-exports.test.mjs tests/tree-rules.test.mjs README.md docs/STATE.md CHANGELOG.md package.json package-lock.json
git -C /home/dev/opencode-guard-plan2 commit -m "release: opencode-guard 1.9.0"
```

### Task 6: Final verification and independent review gate

**Files:**
- Verify only; no planned edits.

**Interfaces:**
- Validates the complete worktree, commit sequence, matrix coverage, package surface, and absence of prohibited dependencies/content.

- [ ] **Step 1: Run the complete suite from the exact worktree.**

```bash
cd /home/dev/opencode-guard-plan2 && node --test tests/*.test.mjs
```

Expected: exit 0 with every test passing.

- [ ] **Step 2: Run static source/package assertions.**

```bash
cd /home/dev/opencode-guard-plan2 && node --input-type=module -e 'import fs from "node:fs";const plugin=fs.readFileSync("plugin.js","utf8");const pkg=JSON.parse(fs.readFileSync("package.json","utf8"));const lock=JSON.parse(fs.readFileSync("package-lock.json","utf8"));const failures=[];if((await import("./plugin.js")).OpencodeGuard===undefined)failures.push("factory");if(plugin.includes("\"tool.execute.before\""))failures.push("before-hook");if(!plugin.includes("\"tool.authorize\""))failures.push("authorize-hook");if(!plugin.includes("\"delegation.sanitize\""))failures.push("sanitize-hook");if(/@opencode-ai\/(core|schema)/.test(plugin))failures.push("core-schema-import");if(pkg.version!=="1.9.0"||lock.version!=="1.9.0"||lock.packages[""].version!=="1.9.0")failures.push("version");if(!plugin.includes("treeRuleRefusal("))failures.push("tree-gate");if(/isUnattended|currentMode/.test(plugin))failures.push("stale-mode-or-attendance");if(/NODE_ENV|OPENCODE_GUARD_TEST_CMDLINE/.test(fs.readFileSync("lib/policy.js","utf8")))failures.push("env-seam");if(/coordinationDomain|heartbeatAt|workerEpoch/.test(fs.readFileSync("lib/delegation.js","utf8")))failures.push("participant-shape");if(pkg.dependencies?.["@opencode-ai/core"]||pkg.dependencies?.["@opencode-ai/schema"])failures.push("dependency");if(failures.length){console.error(failures.join(","));process.exit(1)}'
```

Expected: exit 0, no output.

- [ ] **Step 3: Verify no prohibited added text or raw fixtures escaped.**

```bash
cd /home/dev/opencode-guard-plan2 && ! git diff HEAD~5..HEAD -- plugin.js 'lib/*.js' README.md CHANGELOG.md package.json package-lock.json | rg '^\+.*(RAW-(COMMAND|PROVIDER)-SENTINEL|switch to manual|press F9|use F9)' && git diff --check HEAD~5..HEAD && git diff --quiet HEAD~5..HEAD -- lib/tree.js tests/tree.test.mjs
```

Expected: exit 0; the last check proves `lib/tree.js` and its pure tests are untouched. Test-only `SHOULDNOTAPPEAR` fixtures are allowed because their assertions prove sanitization; production and docs contain none.

- [ ] **Step 4: Inspect commits and cleanliness.**

```bash
git -C /home/dev/opencode-guard-plan2 log --oneline -6 && git -C /home/dev/opencode-guard-plan2 status --short
```

Expected: the lifecycle, sanitizer, hard-floor, live-authority, and release commits are present in order; status is empty.

- [ ] **Step 5: Request independent review.**

The reviewer must return a markdown findings table and check: all rows of the Required Authorization Matrix; exact Plan 1 keys including `input.branch.delivery`, `input.branch.kind`, and optional `output.reason`; awaited off fencing; participant input is exactly the Plan 1 `PluginParticipantInput` with `{ component: "guard" }` fencing and no Worker/domain/heartbeatAt derivation; `reconcile()` calls the host only on a transition or missing registration and only the timer heartbeats; dispose rethrows nothing after a reported fence failure; attendance injected only through the factory option with no environment seam; no file-derived authority except that live authority becomes GOD only without an explicit manual file anywhere in the chain; sanitizer coverage, reveal independence, and fail-closed residual-secret checks; hard-floor precedence under GOD, including launder, config deny, and the native credential guard called with constant `mode: "auto"`; the binding R1-R5 decisions, including G1 beside core ownership, canonical/fallback G2, G4 direct-child session-tree/history mismatch denial, history-only deeper descendants, failed G4 parent lookup denial, tree/G3 `output.reason`, and one eager G3 mode/manual-ancestry resolution per call that denies on unreadable ancestry; the team-index feed still first in `event` at every level; inconsistent branch identity denied; primary versus registered-child behavior; no raw logs or Manual/F9 advice; no core/schema dependency; version/lock/changelog agreement; and single plugin export. Any finding is fixed with a new failing test, RED, implementation, focused GREEN, complete GREEN, and a new commit—never by amending an existing commit.
