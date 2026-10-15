# Fleet Delegation, Plan 2: opencode-agent-workflows as a Delegation Participant (0.15.0)

**Rebased 2026-10-08 onto opencode-agent-workflows 0.13.2 (d6655f6)**
- Version: this plan now ships 0.14.0 (0.13.0-0.13.2 exist); `WORKFLOWS_BUILD_ID` and every test literal read `opencode-agent-workflows@0.14.0`.
- Prerequisites, Global Constraints, Shared contract: baseline is `d6655f6` (0.13.2); BASE line numbers re-pointed where the file changed.
- Baselines: base suite 185 (measured 2026-10-08); suite after Tasks 3/4/5 is 214/233/235 (predicted from the `c4936da` dry-run deltas; superseded by the R3 line below: 215/234/236, predicted; 216/235/237 after the takeover-fixes line below).
- Verified facts: core.js, child-session.js and workflows.test.mjs lines re-pointed; team, notifier-identity, call-site, dispose and release-test facts added.
- Design decision 13 widened; Design decisions 18-20 and Review Focus 11 added; RECONCILE R1-R4 added before Review Focus.
- Task 1: 32 call sites (27 in workflows.test.mjs incl. four 0.13 nudge plugins, 1 loop-guard, 4 in the 0.13 `tests/team-tools.mjs`); rewrite, imports, counts and commit cover team-tools; core.js lines 13-14/25/50-53.
- Task 1 Step 0: expects 0.13.2, `d6655f6` ancestry and `ℹ tests 185`.
- Task 2: `participantTimers` goes after `backgroundSubagents` (the last option); the existing team `dispose` is extended, never duplicated.
- Task 4: Step 2 counts re-verified (16/15/1) by a dry run on copies; line 719 is 721; suite counts updated.
- Task 5: the live-order `pluginClient` answers `session.messages` with an owner identity (0.13 notify would queue the report and the test would time out); suite counts updated.
- Task 6: the startup rewrite keeps `teams.startRecovery()` outside the chain; migrations cover 14 workflows.test.mjs sites, loop-guard and 4 team-tools sites; team-tools added to scope and commit.
- Task 8: Step 4a edits the 0.13.2 notify.js (identity read, 3-failure fallback, ordered re-queue kept) instead of restoring the 0.12 file; report-delivery fake clients answer `session.messages`; team-tools gains `runStore`; commit lists eleven paths.
- Task 11: changelog fallback anchor `## [0.13.2]`; expected failure `'0.13.2' !== '0.14.0'`; one Changed bullet records RECONCILE R3; Step 4 also runs `tests/team-release.mjs`.
- Tasks 3, 7, 9, 10: no anchor changes (`lib/runtime.js`, `plugin.js`, `lib/run-store.js`, `tests/loop-guard.test.mjs` are identical at `c4936da` and `d6655f6`).
- R2 DECIDED 2026-10-08 (Holden): startup always runs `manager.reconcile()` (with `reconcileTeams`) and `teams.startRecovery()`; only workflow records owned by a participant record wait for participant recovery. Shared contract (recovery), Shared names, Design decisions 9 and 19, Review Focus 11-12, Baselines (Task 6: 24 new tests; 28 after the follow-ups below), Task 6 (scope gains `lib/child-session.js` `reconcile({ skipWorkflowRecord })` and the Task 5 `runThroughPlugin` helper; two-pass startup block; failing-first tests), Task 8 (report-delivery `pluginFor` counts only the full reconcile) and Task 11's "Startup recovery" bullet changed.
- R4 DECIDED 2026-10-08 (Holden): accepted, a teammate cannot start a workflow (guard 1.7.x G4 already denies `workflow_run` to team members); the RECONCILE note is replaced and Task 11's teams changelog bullet gains one sentence.
- R1 and R3, held earlier on 2026-10-08, are now decided; the plan executes option (b) for both (lines below).
- R1 DECIDED 2026-10-08 (Holden): participant records are a record kind (`source: "participant"`, file `participant-<branchID>.json`) in the existing child registry (`lib/child-session.js`, `workflow-runs/children/`), under its mkdir lock and with `claimRetirement`'s 3-minute lease; the separate store module, its directory and its per-record claim files are gone. Architecture, Shared contract (participant records; recovery), Shared names, Verified facts, Design decisions 4, 13 and 21 (new), Review Focus 4, 5, 10 and 13 (new) changed.
- R1, Task 3: now modifies `lib/child-session.js` (`createChildRegistry` returns a frozen `participants` view: `write`, `get`, `list`, `update`, `claim`, `release`); `lib/participant-store.js` and `tests/participant-store.test.mjs` are removed, replaced by 10 tests in `tests/participant-records.test.mjs` against the registry.
- R1, Task 4: `tests/fixtures/participants.mjs` `scratchParticipantStore()` returns `createChildRegistry({ root: <scratch> }).participants`; the runtime's refusal reads `workflows runtime requires the participants view`.
- R1, Tasks 5, 8, 10: the plugin default is `participants = createChildRegistry().participants` (the production registry root, i.e. the default manager's directory and lock); quoted import and option blocks follow.
- R1, Task 6: recovery claims with `participants.claim`/`participants.release` (registry lock + lease) instead of claim files; the claim-file tests become lease tests; the Task 6 step that added a `dir` property to the store is dropped; `skipWorkflowRecord` reads participant records from the same registry.
- R1, Task 9: outcome replay claims with the same registry lease; its claim-file assertion becomes a lease assertion.
- R3 DECIDED 2026-10-08 (Holden): degrade, do not refuse. Prerequisites, Goal, Verified facts ("Teams"), Design decision 13, Review Focus 1 (reversed), Baselines (Task 1: 9 new tests; suite counts after Tasks 3/4/5 now 215/234/236, predicted) changed.
- R3, Task 1: core.js edits are now lines 11, 13-14, 50-53 and 227-228 (the line-25 guard is gone); no plugin guard; `workflow_run` alone throws `workflow_run requires PluginInput.delegation, which this opencode host does not provide`; failing-first tests: a plugin without delegation keeps its team tools, hooks and `workflow_list` and refuses `workflow_run` (foreground and background), a plugin with delegation hands it to the runtime; the runtime refusal test is unchanged.
- R3, Task 2: without `delegation` no lifecycle is created and `participantReady` is a rejected promise (Task 2's reporter logs `workflows participant registration failed: workflow_run requires PluginInput.delegation, ...` on stderr; from Task 6 on, pass 2 logs its skip as a second line), so branch work and startup pass 2 are skipped; `dispose` stops a lifecycle only if one exists. Task 11's teams changelog bullet is rewritten.
- R3, Task 6: both R3 plugins reach startup, so the migrations now cover 15 `tests/workflows.test.mjs` sites (was 14 in the line above), with an exact `perl` rewrite; Task 8's per-file comparison needed no count change.
- R1, Task 6 and Task 9 test counts are unchanged (23 + 1 and 24); Task 9 Step 1's grep checks were also corrected (the old `recordFor(entry.state)` check would have printed 3, not 1) via a Task 6 `caseRecord(entry)` helper.
- Follow-up 2026-10-08, Design decision 21 (iv) fixed: Task 6 recovery skips `completed`/`failed` participant records before the owner probe and before any lease, and Task 6 adds `participants.prune({ directory, olderThanMs })` to the registry view (registry lock; deletes dead-owner `completed`/`failed` records of the directory, without a live lease, last written more than 7 days ago), called once at the end of each recovery pass. Shared contract (participant records; recovery), Shared names, Design decision 21, Review Focus 12-13, Task 3 Produces (one note), Task 6 (scope, contract, two failing-first tests, `prune` in `lib/child-session.js`, implementation, RED step, GREEN count) and Task 11's "Startup recovery" bullet changed; Task 9's `recorded` wrapper forwards `prune`.
- Follow-up 2026-10-08, `failBranch` idempotency: Plan 1 has no dedicated "already terminal" code; `BranchService.fail` on a branch outside `reserved`/`registered`/`acknowledged`/`running` rejects with `DelegationBranchError` `invalid_branch_state` (Plan 1 `BranchErrorCode`), so recovery treats exactly that rejection as success for the record (records it `failed`, retires the child, releases the lease, continues with the next record); any other rejection keeps today's handling. New Design decision 22 (the code is broader than "terminal"; residual named there), Shared contract (recovery), Task 6 (two failing-first tests, implementation, RED step). Superseded by the terminal-code line below.
- Follow-up 2026-10-08, Baselines: Task 6 now adds 28 new tests (27 in `tests/participant-recovery.test.mjs`: 7 state-loop + 20 standalone; 1 in `tests/workflows.test.mjs`), predicted, never run; Tasks 7-11 counts are unchanged (SUITEBASE is measured after Task 6). Superseded by the terminal-code line below: 29 (28; 7 + 21).
- DECIDED 2026-10-08 (Holden), terminal code: Plan 1 adds `branch_already_terminal` (terminal branch) and keeps `invalid_branch_state` for `fail` on `handoff` only; recovery counts only `branch_already_terminal` as success and leaves a `handoff` record untouched (no update, retire or prune), releases and continues. Changed: Shared contract (recovery), Design decision 22 (rewritten, with an OPEN line: Task 9's replay needs `state: "terminal"` + `outcomeID`, which a record that reaches `failBranch` never has, and Plan 1 has no branch-to-outcome lookup, so a foreground `handoff` outcome is still not delivered by workflows), Baselines (Task 6: 29), Task 6 (contract, `failOpenBranch` implementation keeping Task 9's anchor, tests split into terminal/handoff via a `rejectFailBranch` helper because `fakeDelegation`'s `fail` option only accepts `Error` instances and Plan 1 rejects with a plain tagged struct -- the superseded tests passed plain objects to it and would have thrown at construction; RED now 5 selected / 4 failing), Task 11 "Startup recovery" bullet. Superseded for `handoff` by the pending-outcome line below (the OPEN line is DECIDED there).
- DECIDED 2026-10-08 (Holden), pending-outcome lookup: Plan 1 adds read-only `pendingOutcome({ branch, ownerExecution }) -> DelegationTerminal | null` (Plan 1 Task 14); when recovery's `failBranch` answers `invalid_branch_state` (branch in `handoff`), recovery calls it and records `{ outcomeID, state: "terminal" }` (plus `blocked: true` for background delivery), then acknowledges the outcome exactly once in the same pass; a `null` answer leaves the record as takeover left it, a rejection keeps the lease. Changed: Shared contract (recovery), Design decision 22 ((b) rewritten; the OPEN line is now DECIDED; residual fence question widened to `pendingOutcome` and the acknowledgement), Task 1 (the shared fake gains `pendingOutcome`, default answer `null`: 16 methods, the method-list test updated), Task 6 (contract, claim text, `answerPendingOutcome` helper, the handoff test rewritten failing-first -- its records now follow `list()` order, which the old test did not -- `failOpenBranch`, RED text), Task 9 (Interfaces; the startup-replay test gains a handoff record and a third pass), Task 11 "Startup recovery" bullet. Test counts unchanged.
- DECIDED 2026-10-08 (Holden), dead-worker takeover (option A): Plan 1 adds `takeOverBranch({ branch, ownerExecution }) -> { branch, ownerExecution }` (Plan 1 Task 14), because Plan 1 refuses a dead owner's recorded fences (`stale_worker`/`stale_execution`/`wrong_worker`) and recovery would stall on every start; recovery (Task 6) and the outcome replay (Task 9) take each dead-owner record over first under the registry lease they already hold, persist the taken fences, then fail / look up / acknowledge with them (Task 6 now acknowledges a `handoff` outcome in the same pass); `owner_alive` leaves the record and releases the lease. Changed: Shared contract (recovery), Design decision 22 (the OPEN fence question is now DECIDED), Review Focus 14, Baselines (Task 6: 32, Task 9: 26, predicted; SUITEBASE offsets for Tasks 10-11), Task 1 (the fake gains `takeOverBranch`, 17 methods, and the exported `takenOver`), Task 6 and Task 9 (Interfaces, failing-first tests, implementation, RED/GREEN counts), Task 11 "Startup recovery" bullet.
- Takeover fixes 2026-10-08: Task 1's fake answers numeric `fencingToken`/`branchFencingToken` (takeover: both + 1, as Plan 1) and every string-token literal is numeric; Task 3's `isFence` checks Plan 1's per-field types (finite numbers for the two tokens, non-empty strings otherwise) with a new failing-first test (Task 3: 11; suite 216/235/237 after Tasks 3/4/5, predicted); Task 6 skips a record on `wrong_domain`/`wrong_parent`/`stale_branch`/`unregistered_branch` (one stderr line, lease released, pass continues; `wrong_parent` added beyond the review because it is equally permanent), skips `takeOverBranch` for a record whose fences already name this process's Worker (`recoverParticipants` gains `worker` from `participantReady`), and documents that a throw after persisting taken fences leaves the record with this live process until it exits (Task 6: 34, RED 10 selected / 10 failing); Task 6's `recordFor` fences name a dead Worker (`worker_dead`), so the plugin-level tests, which pass the fake participant's `worker_test`, never hit the own-Worker skip; Task 9 passes `worker` to `takeOver` and adds one replay test (refused takeover, own-Worker record; Task 9: 27, SUITEBASE offsets for Tasks 10/11 now 42/55); Task 8's import anchor gains `TAKER`; Task 4's unused `takenOver` import is dropped (the reviewer's "Task 3" import is Task 4's); Shared contract, Shared names, Design decision 22 addendum, Review Focus 14 and Task 11 "Startup recovery" updated.

**2026-10-12 addendum:** This plan's batch now targets workflows 0.15.0, following the published main release 0.14.0. The 2026-10-08 BASE SHA, measured base suites, and release-version statements are historical; preserve them as recorded, including the completed Task 1 preflight's 0.13.2 requirements.

> **Execution:** this plan is run by the `plan-run` workflow. Every implementer and reviewer sees this header plus exactly ONE task; nothing written down in one task reaches another task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make opencode-agent-workflows a consumer of Plan 1's `PluginInput.delegation` (required by `workflow_run` only; RECONCILE R3) and ship it as 0.15.0: register and heartbeat the `workflows` participant for the plugin's lifetime, run every workflow child as a fenced delegation branch created in a fixed 13-step order with a durable per-branch record, recover dead owners' open branches at plugin start, complete or fail each branch on its result, persist background reports before delivering them and replay undelivered ones, and settle delegation terminals exactly once per outcome.

**Architecture:** Three new modules: `lib/delegation.js` (participant identity and lifecycle), `lib/participant-recovery.js` (dead-owner recovery, run before child reconciliation) and `lib/outcomes.js` (terminal detection and once-per-outcome settlement). The durable per-branch participant records are a new record kind in the existing child registry (`lib/child-session.js`, RECONCILE R1): one atomically written JSON file per branch under the registry's lock, claimed with the registry's retirement lease. `lib/core.js` owns the participant lifecycle, one participant-record view, one delivery-handler map and one outcome settler per plugin instance and passes them into every runtime; `lib/runtime.js` `agent()` runs the contract's 13-step order around each child and judges its reply. All tests share one in-memory `DelegationBranchApi` fake; no test talks to a real core.

**Tech Stack:** Node 24 ESM (`node --test`), `node:fs` sync APIs, no new dependencies, no lockfile.

**Spec:** the "Shared contract" section below (binding names). Plan 1 API: `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md`, section "Normative Contracts" (the fence and `ParticipantStatus` schemas, the branch/outcome inputs from `ReserveBranchInput` onward, `BranchErrorCode` including `invalid_branch_state`, `ReserveBranchInput.parentBranchID: Schema.NullOr(Schema.String)`, `DelegationBranchApi`) and section "Plan 1 Authoritative Consumer Interfaces and Commands".

## Prerequisites

**Plan 1 dependency.** None to execute this plan: every test uses the in-memory `fakeDelegation`. To run 0.15.0 for real, the host opencode must provide `PluginInput.delegation` (Plan 1 Task 14, "Trusted plugin API implementation") and the legacy blocking-route terminal (Plan 1 Task 18, "Legacy/v2 interception and wire semantics"); on an older host the plugin still loads, teams and every other tool keep working, and only `workflow_run` is refused with a message naming the missing `PluginInput.delegation` (Task 1, RECONCILE R3).

**Worktree (Holden runs these by hand, workdir `/home/dev`, before starting plan-run).**

Step A, record BASE:
```bash
BASE=$(git -C /home/dev/opencode-agent-workflows rev-parse HEAD); echo "$BASE"
```
Expected: a 40-hex SHA. On 2026-10-01 it was `c4936daafb539d00b21417fb280d003901aba2c8`; at the 2026-10-08 rebase (0.13.2) it was `d6655f66ce3e96709e92caed850a86904141a231`.

Step B, create the worktree:
```bash
git -C /home/dev/opencode-agent-workflows worktree add -b plan2 /home/dev/opencode-agent-workflows-plan2 "$BASE"
```
Expected: `Preparing worktree (new branch 'plan2')` and `HEAD is now at <BASE short>`. If the branch `plan2` or the directory already exists, STOP and report; do not reuse or delete it.

**How to run** (Holden, after Steps A and B):
```bash
cd /home/dev/opencode-agent-workflows-plan2 && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-workflows.md"} background:true'
```

## Global Constraints

- Repo `/home/dev/opencode-agent-workflows`, worktree `/home/dev/opencode-agent-workflows-plan2`, branch `plan2`. Every command runs with workdir `/home/dev/opencode-agent-workflows-plan2` (no `cd` chains).
- Test command: `node --test tests/*.mjs`. The glob is not recursive, so `tests/fixtures/*.mjs` are never run as test files.
- Node's default reporter without a TTY prints `ℹ tests N`, `ℹ pass N`, `ℹ fail N`. Where Tasks 1-3 expect `# pass N` / `# fail 0`, read them as the `ℹ pass N` / `ℹ fail 0` lines.
- No new dependencies, no lockfile. The version bump to 0.15.0 belongs to Task 11 only.
- The plugin passes NO `worker`, `coordinationDomain` or `heartbeatAt`; the host injects them.
- `plugin.js` may export only the `Workflows` factory (pinned by `tests/workflows.test.mjs:148-151`).
- Ordering assertions use `assert.deepEqual` on the full literal array; no slicing, no `indexOf`.
- No emoji, no TODO comments, never swallow an error silently.
- Files are edited with the `edit` tool unless a step gives a command.
- Quoted "old" text in a task is the file content AFTER every earlier task. Match edits on the quoted text, never on line numbers. Line numbers labelled BASE were verified at `c4936da`; every line number cited in a file that changed since then (`lib/core.js`, `lib/child-session.js`, `lib/notify.js`, `tests/workflows.test.mjs`) was re-pointed to `d6655f6` (0.13.2) on 2026-10-08. `lib/runtime.js`, `plugin.js`, `lib/run-store.js` and `tests/loop-guard.test.mjs` are identical at both commits, so their BASE numbers hold.
- Commit only the paths a task's commit step names; never `git add .` or a wildcard.

## Baselines and test counts

plan-run gives each task only this header and its own text, so a value one task "writes down" never reaches a later task. Every baseline the tasks name is therefore defined here, and a task that needs one measures it itself.

- **BASE**: the commit `plan2` was created from (Prerequisites Step A). Any task recomputes it with `BASE=$(git merge-base plan2 main)`.
- **TMPBASE** (Tasks 4-5): `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* 2>/dev/null | wc -l`, run before the task's first edit. "TMPBASE (from Task 4 Step 2)" in Task 5 means this value, measured at the start of Task 5.
- **TMPBASE_D** (Tasks 7-10): `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* /tmp/wf-report-runs-* /tmp/wf-outcome-cache-* 2>/dev/null | wc -l`, run before the task's first edit. In Tasks 8-10, "TMPBASE_D" means this value, measured at the start of that task.
- **SUITEBASE** (Tasks 7-11): the full-suite `ℹ tests` count after Task 6, recorded in Task 7 Step 0. Tasks 8-11 first run `node --test tests/*.mjs` before any edit (TASKSTART) and derive SUITEBASE = TASKSTART minus the new tests of the earlier Tasks 7.. : Task 8: TASKSTART - 7; Task 9: TASKSTART - 15; Task 10: TASKSTART - 42; Task 11: TASKSTART - 55 (Tasks 10 and 11 were 39 and 52 before the 2026-10-08 dead-worker takeover added 2 Task 9 tests, and 41 and 54 before the 2026-10-08 takeover fixes added 1 more).

New tests per task (the number every task must add, whatever the absolute counts):

| Task | New tests | Absolute counts quoted in the task |
|---|---|---|
| 1 | 9 (6 in `tests/delegation.test.mjs`, 3 in `tests/workflows.test.mjs`), predicted | per-file, not measured |
| 2 | 11 | per-file, not measured |
| 3 | 11 (in `tests/participant-records.test.mjs`), predicted (was 10 before the 2026-10-08 takeover fixes added the numeric-fence test) | per-file, not measured; suite 216 after Task 3 at `d6655f6`, predicted, never run: base suite 185 (measured 2026-10-08) + 9 + 11 + 11. The R1/R3 rewrites of Tasks 1 and 3 were never dry-run (the earlier dry run on `c4936da`, 99 -> 128, covered the pre-R1/R3 Tasks 1-3) |
| 4 | 19 | 216 -> 235 at `d6655f6`, predicted (the pre-R1/R3 plan measured 128 -> 147 by a dry run on `c4936da`) |
| 5 | 2 | 235 -> 237 at `d6655f6`, predicted (the pre-R1/R3 plan measured 147 -> 149 by a dry run on `c4936da`) |
| 6 | 34 (33 in `tests/participant-recovery.test.mjs`, 1 in `tests/workflows.test.mjs`), predicted (was 24 before the 2026-10-08 follow-ups added 4 recovery tests, 28 before the 2026-10-08 terminal-code decision split one, 29 before the 2026-10-08 dead-worker takeover added 3, and 32 before the 2026-10-08 takeover fixes added 2) | predicted, never run |
| 7 | 7 | predicted, never run |
| 8 | 8 | predicted, never run |
| 9 | 27 (was 24 before the 2026-10-08 dead-worker takeover added 2 replay tests, 26 before the 2026-10-08 takeover fixes added 1) | predicted, never run |
| 10 | 13 | predicted, never run |
| 11 | 2 | predicted, never run |

Every count in this table is a prediction until a task measures it. Rule for every absolute count in a task (`ℹ tests 235`, `ℹ tests 28`, `# pass 6`, ...): expected N; if different, the count of NEW tests must match the table above, and `fail` must be 0. A base newer than `d6655f6` can carry more pre-existing tests, which shifts every absolute full-suite count by the same amount.

## Shared contract (binding on every task)

Repo /home/dev/opencode-agent-workflows (baseline: committed 0.13.2 at d6655f6 or a descendant; first measured 0.12.4 at c4936da on 2026-10-02, rebased onto d6655f6 on 2026-10-08), worktree /home/dev/opencode-agent-workflows-plan2
(branch plan2), target 0.15.0, no lockfile, no new dependencies. Test command: `node --test tests/*.mjs`.
Plan 1 API is `PluginInput.delegation` (DelegationBranchApi). See
/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md (the contract block
and the "Plan 1 Authoritative Consumer Interfaces" table). The plugin passes NO worker, coordinationDomain
or heartbeatAt; the host injects them.

### Contract: new module lib/delegation.js (exports, exact names)
- `WORKFLOWS_BUILD_ID = "opencode-agent-workflows@0.15.0"`, `DELEGATION_PROTOCOL = "opencode.delegation/v1"`
- `WORKFLOWS_PARTICIPANT = Object.freeze({ component: "workflows", buildID: WORKFLOWS_BUILD_ID,
  protocol: DELEGATION_PROTOCOL, capabilities: Object.freeze(["backgroundDeliveryV1", "foregroundDeliveryV1",
  "registeredBranchV1", "terminalHandoffV1"]) })`
- `PARTICIPANT_HEARTBEAT_MS = 2000`
- `createParticipantLifecycle({ delegation, setInterval, clearInterval })` returns
  `{ start(): Promise<ParticipantStatus>, stop(): void }`. start() calls registerParticipant(WORKFLOWS_PARTICIPANT),
  verifies the returned status (component, buildID, protocol, sorted capabilities, availability "available";
  any mismatch throws `Error("workflows participant registration mismatch: <field>")`), then heartbeats with
  heartbeatParticipant(WORKFLOWS_PARTICIPANT) every PARTICIPANT_HEARTBEAT_MS. stop() clears the interval.
- `acknowledgeInput(branch)` returns `{ branch, ownerComponent: "workflows", ownerBuildID: WORKFLOWS_BUILD_ID,
  protocol: DELEGATION_PROTOCOL }`.

### Contract: participant records in the child registry (Task 3; RECONCILE R1, decided 2026-10-08)
- Participant records are a record kind of the existing child registry (`createChildRegistry` in
  lib/child-session.js, production root `workflow-runs/children/`), beside child, reservation and intent
  records. One file per branch, `<root>/participant-<branchID>.json`, stored as the envelope
  `{ version: 1, source: "participant", ...record }` plus, while claimed, `retirement: { claimant, leaseUntil }`.
  Written with the registry's own `writeAtomic` (temp + fsync + rename + directory fsync, mode 0600) while
  holding the registry's mkdir lock (`<root>/.lock`), so the lock's `.tmp` sweep never races a participant write.
  `validRecord`, `validReservation` and `validIntent` are unchanged; `source: "participant"` fails all three.
- `createChildRegistry(...)` returns one more key, `participants`, a frozen view with exactly
  `write(record)`, `get(branchID)`, `list()`, `update(branchID, patch)`, `claim(branchID, claimant, leaseMs = RETIRE_LEASE_MS)`
  and `release(branchID, claimant)` (Task 3); Task 6 adds a seventh, `prune({ directory, olderThanMs })` (see
  "Contract: recovery"). `get` (lockless, like the child `read`) returns null only if the file is absent;
  `list` (under the lock) returns every participant record sorted by `branch.branchID`; both return the record
  WITHOUT the envelope (`version`, `source`) and the lease (`retirement`), and both throw on a corrupt or
  invalid record or an I/O error (unlike the child `list()`, which answers `[]` on any error). `write` and
  `update` take the lock and throw on any error; `update` (read, shallow merge, validate, write) keeps the
  envelope and any lease and throws if the record is absent or the patch changes `branch.branchID`.
- Claims are the child registry's retirement lease, one dead-owner protocol: `claim` takes the lock and
  returns null for an absent record, for a record whose `ownerPID` is not definitely dead (the registry's
  `ownerState`: only ESRCH counts as dead) and for a record whose `retirement` lease belongs to another
  claimant and is unexpired (`leaseUntil > now()`); otherwise it writes `retirement: { claimant,
  leaseUntil: now() + leaseMs }` (the same field, test and 3-minute `RETIRE_LEASE_MS` default as
  `claimRetirement`) and returns the stripped record. `release` takes the lock and clears the lease only
  when `claimant` holds it unexpired (the registry's `claimed` test), returning true; otherwise false.
  A crash leaves the lease to expire after 3 minutes. Claimants are `<pid>-<uuid>` strings, like the manager's.
- Child-record scans never see participant records: `list()` matches `ses_*.json` only, and the registry's
  `jsonNames()` (reservations, intents, capacity count) skips the `participant-` prefix, so participant records
  neither count against `CAPACITY` nor cost those scans a read.
- Record fields (all required unless marked): `runID`, `delivery` ("foreground"|"background"),
  `branch` (the full BranchFence), `ownerExecution` (the full ExecutionFence), `childSessionID`,
  `registryReservationID` (the existing child-registry UUID; distinct from the branch), `agent`, `prompt`,
  `directory`, `state` ("registered"|"acknowledged"|"prompting"|"prompted"|"completed"|"failed"|"terminal"),
  `promptStartedAt` (number|null), `promptedAt` (number|null), `outcomeID` (string|null),
  `blocked` (boolean), `reportDelivery` ("none"|"pending_delivery"|"delivered"),
  `ownerPID` (positive integer, `process.pid` of the dispatching process, set at the first write).

### Contract: live child order (Task 4), in lib/runtime.js agent() path
reserveBranch input: {parentSessionID, rootSessionID: execution.rootSessionID, ownerExecution: execution,
parentBranchID, kind: "workflow", delivery}. The record is first written with state "registered" (before
acknowledgement) and becomes "acknowledged" only after acknowledgeBranch succeeds. Exact sequence:
1 currentExecution, 2 reserveBranch, 3 manager.reserve, 4 session.create, 5 manager.bindReservation (synchronous,
no await between create and this bind: existing invariant at lib/runtime.js:217, recovery needs the child id),
6 bindBranch, then manager.register, 7 store.write({... state: "registered"}), 8 install delivery handler, 9 acknowledgeBranch,
10 store.update(state "acknowledged"), 11 store.update(promptStartedAt, state "prompting"), 12 session.prompt,
13 store.update(promptedAt, state "prompted").
Any failure at steps 1-11: no prompt; if a branch exists, failBranch({branch, errorCode: "invalid_branch_state"})
and discard the handler; the existing retire path runs.

### Contract: recovery (Task 6), runs at plugin start BEFORE the full manager.reconcile()
A workflow run lives inside its owning opencode process. When that process dies, the `agent()` call that
would consume a child's result is gone, so recovery NEVER re-prompts anything. (plan-run resumes through its
own ledger by dispatching NEW children.) Each record carries `ownerPID` (the dispatching process) and
`directory` (the same scope the child registry uses).
Recovery considers only records whose `directory` matches this plugin instance's directory and whose
`ownerPID` is dead (ESRCH; EPERM counts as alive). Records of live owners are never touched.
For a dead-owner record in state "registered", "acknowledged", "prompting" or "prompted": first
takeOverBranch({branch, ownerExecution}) with the record's fences unless those fences already name this
process's `worker` (the WorkerFence from Task 2's `participantReady`, which resolves to `lifecycle.start()`'s
ParticipantStatus and includes `worker`; Design decision 22; such a record skips both the takeover and
this fence update), then store.update({branch, ownerExecution}) with the answer, then
failBranch({branch, errorCode: "invalid_branch_state"}) with the taken branch, then store.update(state
"failed"), then manager.retire. Every call after the takeover uses the taken fences. A takeover rejection
`owner_alive` (core still sees the owner Worker live), or a permanent per-record refusal `wrong_domain`,
`wrong_parent`, `stale_branch` or `unregistered_branch` (one stderr line; the record is left for manual
inspection), leaves the record untouched: no update, no retire, release, next record. A takeover or failBranch rejection that is `DelegationBranchError` with code
`branch_already_terminal` (core already closed the branch; Design decision 22 (a)) counts as success for
that record: store.update(state "failed"), manager.retire, release, next record. A failBranch rejection
with code `invalid_branch_state` (Plan 1 answers it to `fail` only for a branch in `handoff`, outcome
pending; Design decision 22 (b)) is followed by Plan 1's read-only pendingOutcome({branch, ownerExecution}):
a terminal answer is recorded as store.update({outcomeID, state "terminal"}) (plus blocked: true for
background delivery), then acknowledgeOutcome({outcomeID, branch, ownerExecution}) and
store.update({reportDelivery "delivered"}), no retire, release, next record; a null answer leaves the
record as the takeover left it (release, next record); a pendingOutcome or acknowledgeOutcome rejection
propagates and keeps the lease. Any other takeOverBranch or failBranch rejection propagates as before.
"completed", "failed": skipped from the list() snapshot before the owner probe and before any claim (both
states are final). "terminal": left to the Task 9 outcome replay (ack exactly once; the replay takes the
branch over first, exactly as above, and treats `owner_alive` as "leave it, release" and
`branch_already_terminal` as "core holds nothing to acknowledge: mark it delivered").
Pruning (Design decision 21): after the last record, recovery calls `participants.prune({ directory,
olderThanMs: PARTICIPANT_PRUNE_AGE_MS })` (7 days), which under the registry lock deletes the
"completed"/"failed" records of this directory whose owner is dead (ESRCH), that carry no unexpired lease
and whose file was last written more than 7 days ago by the registry clock. A pass that throws earlier
prunes nothing; a prune error propagates like any other recovery error.
Mutual exclusion between two starting processes: the child registry's lease (RECONCILE R1). Before acting
on a record, recovery calls `participants.claim(branchID, claimant)` (registry lock; dead owner re-checked
under the lock; a live foreign lease declines). A declined claim skips the record for this start. The lease
is released with `participants.release` after the record's action or no-op completes; a failed action or a
crash leaves it to expire after `RETIRE_LEASE_MS` (3 minutes), and a later start retries. Recovery is
idempotent, and it runs BEFORE the full manager.reconcile(), so failBranch reaches core before reconcile's own
dead-owner retire sweep deletes the child. (A record skipped because another claimant's lease is live is the
one exception: this start's pass 2 may retire its child before that claimant, or a later start, fails the
branch; failBranch does not need the child.)
Startup is two passes (RECONCILE R2, decided 2026-10-08). Pass 1 never waits for the participant: at
plugin start `manager.reconcile({ skipWorkflowRecord })` runs (team, reservation, workflow-record, native
and intent recovery) and `teams.startRecovery()` is called, whatever happens to registration.
`skipWorkflowRecord(record)` is true for a `source: "workflow"` child-registry record whose `sessionID` is
the `childSessionID` of any participant record (any state), read with `participants.list()` from the same
child registry (an unreadable or invalid participant record makes `list()` throw, which holds back every
workflow record), so pass 1 never retires a participant-owned child. Pass 2 is gated: after
`participantReady` resolves and `recoverParticipants` succeeds, and after pass 1 settled, the full
`manager.reconcile()` runs and retires what pass 1 held back. A failed registration or a rejected
recovery skips only pass 2 (Design decision 19).

### Contract: results and outcomes (Tasks 7-10)
- Normal child completion: completeBranch({branch, resultID: runID}); store.update(state "completed").
- Normal background workflow report: replace the bare `started.then(...)` in lib/core.js. Persist the report
  with record(true) (throwing) and reportDelivery "pending_delivery", deliver through lib/notify.js, then
  update reportDelivery "delivered". On plugin start, replay "pending_delivery" reports exactly once.
- Terminal delegation outcome (a DelegationTerminal from core; for workflows, a foreground child's
  session.prompt ends with the typed terminal):
  - foreground: resolveOutcome({outcomeID, branch, ownerExecution}), store.update(outcomeID, state "terminal"),
    return the payload to the owning agent() call, then acknowledgeOutcome({outcomeID, branch, ownerExecution})
    (NO worker field), then retire.
  - background run: core injects the result into the root session; workflows does
    store.update({outcomeID, blocked: true, state: "terminal"}) BEFORE acknowledgeOutcome, and never calls
    notify or a synthetic prompt for it.
- Never call completeBranch or failBranch after a terminal outcome.
- No "blocked" return type is invented; plan-run's markdown block reports stay normal reports.

### Contract: tests
- Shared fake in tests/fixtures/delegation.mjs: `fakeDelegation({ fail: {method: Error}, order })` returns
  every DelegationBranchApi method, records `[method, input]` into `order`, and returns schema-shaped fences:
  ExecutionFence {workerID, workerEpoch, executionID, sessionID, rootSessionID, fencingToken} and
  BranchFence (= ExecutionFence fields + branchID, branchFencingToken).
- Every existing createWorkflowRuntime/createWorkflowPlugin call site in tests/workflows.test.mjs,
  tests/loop-guard.test.mjs and tests/team-tools.mjs gains `delegation: fakeDelegation()` in Task 1 (the first task that requires it).
- Ordering assertions use deepEqual on the full literal array; no slicing, no indexOf.

## The terminal signal (pinned by Plan 1)

`/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md`
Task 18 (Interfaces; Step 2b tests; "Plan 1 Authoritative Consumer Interfaces and Commands" table, row "Legacy blocking prompt callers"): the
legacy blocking route `POST /session/{sessionID}/message` answers a run that ends in a terminal
with HTTP `409` and the body `{ name: "DelegationTerminal", data: { outcomeID, branchID, kind,
errorCode } }`, with no message and no parts. Through the v1 plugin SDK client (no `throwOnError`)
that arrives as `reply.data === undefined` and `reply.error` deep-equal to that body. It is the
ONLY terminal signal: Tasks 9-10 detect nothing else, and every other reply is either a normal message
or a failed branch.

## Shared names, by defining task (used verbatim, never redefined)

| Name | Defined in | Used for |
|---|---|---|
| `DELEGATION_METHODS`, `fakeDelegation({ fail, order })`, `fakeExecution(sessionID)`, `fakeTimers()` | `tests/fixtures/delegation.mjs` (Task 1) | every new test |
| `TAKER`, `takenOver({ branch, ownerExecution })` (the fake's deterministic `takeOverBranch` answer, decided 2026-10-08) | `tests/fixtures/delegation.mjs` (Task 1) | recovery and replay tests (Tasks 6, 9) |
| `takeOver(delegation, store, record, worker)` (module-private: `takeOverBranch`, then the fence `store.update`; answers `{ record }` or `{ skip: "owner_alive" \| "terminal" \| "refused" }`) | `lib/participant-recovery.js` (Task 6) | recovery's open-state leg (Task 6) and the outcome replay leg (Task 9) |
| `delegation` (plugin and runtime option; optional for the plugin, required by `workflow_run` and the runtime) | `lib/core.js`, `lib/runtime.js` (Task 1) | steps 1, 2, 6, 9 and `failBranch` |
| `WORKFLOW_RUN_NEEDS_DELEGATION` (module constant in `lib/core.js`, not exported) = `"workflow_run requires PluginInput.delegation, which this opencode host does not provide"` | `lib/core.js` (Task 1) | `workflow_run` refusal; Task 2's rejected `participantReady` |
| `WORKFLOWS_BUILD_ID`, `DELEGATION_PROTOCOL`, `WORKFLOWS_PARTICIPANT`, `PARTICIPANT_HEARTBEAT_MS`, `createParticipantLifecycle`, `acknowledgeInput(branch)` | `lib/delegation.js` (Task 2) | step 9 input; plugin test order; release check |
| `participantReady` (closure constant, the `lifecycle.start()` promise; a rejected promise when `delegation` is absent) | `lib/core.js` (Task 2) | passed to the runtime, awaited before step 1 and before recovery |
| `participantTimers` (plugin option), `dispose` (plugin hook) | `lib/core.js` (Task 2) | plugin tests pass `fakeTimers()` and stop the heartbeat |
| `createChildRegistry(...).participants` with `write`, `get`, `list`, `update`, `claim`, `release`; record kind `source: "participant"`, file `participant-<branchID>.json` | `lib/child-session.js` (Task 3) | runtime option `participants`; plugin default; recovery claims (Task 6); outcome replay claims (Task 9) |
| `participants.prune({ directory, olderThanMs }) -> branchID[]` (7th view method) | `lib/child-session.js` (Task 6) | end of every recovery pass (Task 6) |
| `PARTICIPANT_PRUNE_AGE_MS` (7 days) | `lib/participant-recovery.js` (Task 6) | recovery's `prune` call |
| runtime options `participantReady`, `participants`, `deliveryHandlers`, `delivery` | `lib/runtime.js` (Task 4) | every runtime |
| `scratchParticipantStore()` (returns `createChildRegistry({ root: <fresh scratch dir> }).participants`), `participation()` | `tests/fixtures/participants.mjs` (Task 4) | tests that build a runtime or plugin |
| `tests/live-order.test.mjs` | Task 4 (extended by Tasks 5, 7, 8, 10; Task 6 edits only `runThroughPlugin`'s reconcile wrapper and drain) | live order, plugin wiring, terminals |
| plugin option `participants`, plugin closure `deliveryHandlers` | `lib/core.js` (Task 5) | every runtime |
| `recoverParticipants({ delegation, store, manager, directory, worker })` | `lib/participant-recovery.js` (Task 6) | plugin start; `worker`, when given, is the `ParticipantStatus.worker` WorkerFence |
| `manager.reconcile({ skipWorkflowRecord })` (optional predicate; default retires as before) | `lib/child-session.js` (Task 6) | startup pass 1 in `lib/core.js` |
| record states `registered`, `acknowledged`, `prompting`, `prompted`, `completed`, `failed`, `terminal`; `reportDelivery` `none`/`pending_delivery`/`delivered` | Shared contract | every task |
| `scratchRunStore`, `updateRun`, `listRuns({ strict })`, `persistReport`, `reportDelivered`, plugin option `runStore` | Task 8 | report delivery |
| `terminalOf`, `isDelegationTerminal`, `acknowledgeTerminal`, `createOutcomeSettler` | `lib/outcomes.js` (Task 9) | terminal settlement |
| runtime option `outcomes`, runtime method `handedOff()` | `lib/runtime.js` (Task 10) | terminal settlement, silent background run |

## Verified facts (checked against the real tree at `c4936da`, 0.12.4, on 2026-10-01 and 2026-10-02; re-verified at `d6655f6`, 0.13.2, on 2026-10-08)

- `lib/child-session.js:8`: `const REGISTRY_DIR = join(homedir(), ".local/share/opencode/workflow-runs/children");` -- the production root of the child registry, and therefore of the participant records (RECONCILE R1). Unchanged at `d6655f6`. 0.13.0 added a sibling, `workflow-runs/teams` (`lib/child-session.js:127`), and run records live in `workflow-runs/` itself (`lib/run-store.js:6`).
- **Child registry internals Task 3 builds on (`d6655f6`, read 2026-10-08).** `createChildRegistry({ root = REGISTRY_DIR, teamRoot, now = Date.now, log = console.error } = {})` (`:124`) returns the object literal at `:507-513` (`list, read, register, ..., teamPut, teamList, teamFor, teamRemove, hasTeams`). Record files are named by prefix: `<sessionID>.json`, `reservation-<id>.json`, `intent-<session>-<parent>.json` (`:19-21`). The private `lock(root, { deadline })` (`:77-103`) is `mkdir <root>/.lock` with the owner PID in `.lock/owner`, waits up to `LOCK_WAIT_MS` (10 s), steals only from a definitely dead owner, and runs `clearTemps(root)` (`:65-67`, every `*.tmp` in root) on every acquisition. `writeAtomic(root, record)` (`:105-122`) writes to `record.path` when given (stripped from the stored JSON), temp `.<stem>.<pid>.<random>.tmp` opened `wx` 0600, fsync, rename, directory fsync. `jsonNames()` (`:213`) lists every `*.json` and is read by `reservationEntry`, `recordCount` (CAPACITY 1024), `listReservations` and the intent scans (`:214-218, :234, :472, :484`); `list()` (`:219-228`) matches only `^ses_[A-Za-z0-9]+\.json$` and answers `[]` on any error. `ownerState(pid)` (`:69-73`) is `"missing"` only on ESRCH. `claimRetirement(sessionID, claimant, leaseMs = RETIRE_LEASE_MS, ...)` (`:404-425`) declines a foreign lease while `Number(leaseUntil) > now()` and writes `retirement: { claimant, leaseUntil: now() + leaseMs }`; `claimed(record, claimant)` (`:426`) is the holder test. `RETIRE_LEASE_MS = 3 * 60_000` (`:15`). The manager exposes its registry as `manager.registry` (`:900`) and its claimant is `` `${process.pid}-${randomUUID()}` `` (`:618`).
- `lib/core.js:13-25` (`d6655f6`): `createWorkflowPlugin` is an arrow taking `{ client, directory, tool, runtimeFactory, discover, waitIdle, manager, teams, loopGuard, loopNotify, loopAbort, loopParentOf, backgroundSubagents }`; `teams = createTeam({ client, directory, manager })` and `backgroundSubagents = backgroundSubagentsEnabled()` arrived in 0.13.0 and `backgroundSubagents` is the last option. Startup reconcile is `lib/core.js:41-45`, followed by `teams.startRecovery();` at `:46-47`; the runtime is built at `lib/core.js:50-53`; the hooks object is returned at `lib/core.js:79`, and its first two keys are already `'tool.execute.before'` (`:80-82`) and `dispose: async () => { await teams.stop(); }` (`:83`).
- `lib/runtime.js:122-130`: `createWorkflowRuntime` is an arrow taking `{ client, directory, parentSessionID, workflowName, agentDir, store, waitIdle, manager, resume, now }`; its first statement is `pruneCache(workflowName);` at line 131. Unchanged at `d6655f6` (`git diff c4936da..d6655f6 -- lib/runtime.js plugin.js lib/run-store.js tests/loop-guard.test.mjs` is empty).
- `plugin.js:15-16`: `export const Workflows = async ({ client, directory } = {}) => createWorkflowPlugin({ client, directory, tool: await loadTool() });`
- The installed `@opencode-ai/plugin` declares `interface Hooks { dispose?: () => Promise<void>; ... }` (`~/.config/opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:173-174`), so `dispose` is a real host hook, not an invented key.
- Node is v24.16.0 (`t.mock.method` available). The dev user is uid 1000 (directory permission bits are enforced).
- **Baseline version:** `HEAD` of `/home/dev/opencode-agent-workflows` is `d6655f6` ("Release 0.13.2", `"version": "0.13.2"`) as of 2026-10-08; the plan was first written against `c4936da` (0.12.4). Workflows is released independently by another session, so Task 1 Step 0 checks for 0.13.2 and STOPS on anything else. Between them, 0.13.0-0.13.2 added native agent teams (`lib/team.js`, `lib/teammates.js`, `lib/team-tasks.js`, `lib/team-frame.js`, `lib/team-flag.js`, `lib/session-identity.js`), identity-preserving notifications in `lib/notify.js`, team records and background terminal intents in `lib/child-session.js`, team wiring in `lib/core.js`, and 86 tests. The facts below and the RECONCILE section name every point where that changes what a task must do.
- `lib/child-session.js:330-333` (`238-241` at `c4936da`, unchanged): `reserve()` throws `managed child reservation needs valid workflow ownership metadata` unless `source === "workflow"` and `mode === "foreground"`. So the registry mode can never be `"background"` for a workflow child.
- `lib/child-session.js:264-270` (`174-179` at `c4936da`, unchanged): `register()` with a `reservationID` throws `managed child reservation does not match created session` if its `mode` differs from the reservation's. Passing `delivery` as the registry mode on either call would therefore break every background child; Task 4 test (d) pins both modes.
- `lib/child-session.js:728-784` (`602-641` at `c4936da`, unchanged; since 0.13.0 `reconcile()` runs `reconcileTeams()` before it, `:872-880`): a reservation left `reserved` (child created, never bound) is recovered only once its owner process is dead, by matching the title marker in the parent's children. A live process must bind and retire such a child itself.
- `lib/runtime.js:218-248` (BASE): `bindReservation` runs outside the `try`; `register` and `prompt` run inside `try { ... } finally { agentsDone += 1; record(); retire }`. So today retire runs iff `bindReservation` succeeded, and a create failure calls `failReservation` without retiring. Task 4 keeps exactly that.
- `lib/core.js:49-65` and `:235-246` (`d6655f6`; `43-47` and `182-193` at `c4936da`, text unchanged): `executeWorkflow({ workflow, args, parentSessionID, resume })` builds the runtime; `toolArgs.background` selects the `started.then(...)` path. No existing plugin test runs the real runtime (both tests that call `workflow_run.execute`, whose plugins are built at `tests/workflows.test.mjs:816` and `:952` at `d6655f6`, inject a stub `runtimeFactory`; the four 0.13 nudge-test plugins at `:839`, `:868`, `:890` and `:930` never run a workflow), so Task 4 cannot break a plugin test before Task 5 wires core.
- The participant-record validation Task 3 adds to `lib/child-session.js` requires `directory` to be a non-empty string. Eleven runtime call sites in `tests/workflows.test.mjs` pass no `directory`; Task 4 Step 2 adds `directory: "/d"` to them (the fake client ignores `query`, and no test asserts an empty query for those sites; dry run: suite stays green). Re-verified at `d6655f6` by running the Task 1 Step 5 and Task 4 Step 2 rewrites on copies of the three test files: 27/1/4 delegation sites, then 16/15/1.
- **Notifier identity (0.13.0).** `lib/notify.js` reads the target session's newest user message before every send (`readIdentity`, `lib/session-identity.js:33-47`, paging `client.session.messages`) and needs its `agent`, `model.providerID` and `model.modelID`. A fake client without `session.messages`, or answering `[]`, fails the first two sends, which queue until a `session.idle` event; only the third consecutive failure sends without identity (`lib/notify.js:21-40`). Checked 2026-10-08 against a scratch copy of the notifier. Design decision 20 follows from this.
- **Teams (0.13.0).** Teammates are native background `task` children of a root lead, admitted through `tool.execute.before` (`lib/team.js:129-160`); none passes through `lib/runtime.js` `agent()`, and a workflow child (SDK-created, no task part) is never classified as a teammate (`lib/teammates.js:77-105`, pinned by `tests/team-tools.mjs:25-28`). Team records are `workflow-runs/teams/<leadID>/<childID>.json`, written under the child-registry lock (`lib/child-session.js:182-200`). Dead-owner team recovery runs first inside `manager.reconcile()` (`:872-873`) and every 60 s through `teams.startRecovery()` (`lib/team.js:478-499`); `teams.stop()` cancels timers and retires members within a 10 s budget (`:524-549`). `createTeam(...)` arms no timer at construction (every `arm(` call is inside a method; `arm` is `lib/team.js:193-198`); the only timer a plugin arms at init is `teams.startRecovery()`'s sweep, which `dispose()` cancels through `teams.stop()`, so Task 1's plugin built without `delegation` (RECONCILE R3) leaks nothing once its test awaits `dispose()`. With `backgroundSubagents: true` the plugin's `tool` object has exactly the keys `team_list, team_message, team_report, team_task_add, team_task_list, team_task_claim, team_task_update, team_dismiss, workflow_run, workflow_list`, in that order (`lib/core.js:184-249` at `d6655f6`).
- **Plugin call sites at `d6655f6`.** `tests/workflows.test.mjs` 11 (`:506, :523, :537, :560, :574, :816, :839, :868, :890, :930, :952`), `tests/loop-guard.test.mjs:25`, and `tests/team-tools.mjs:9, :47, :70, :84`. The team-tools file uses single-quoted imports, and every one of its four plugins awaits `plugin.dispose()`; the first two then assert that team timers or intents are gone.
- **Suite at `d6655f6`.** `node --test tests/*.mjs`: `ℹ tests 185`, `ℹ pass 185`, `ℹ fail 0` (measured 2026-10-08); `tests/workflows.test.mjs` 52, `tests/loop-guard.test.mjs` 14. `tests/team-support.mjs` is a helper with no tests that the glob also loads.
- **Release test (0.13.0).** `tests/team-release.mjs:9-10` requires exactly one `## [<package version>] - ` heading and keeps `## [0.13.0] - 2026-10-08`; Task 11's entry satisfies both. `package.json` still declares only `peerDependencies: { "@opencode-ai/plugin": ">=0.4.0" }`.

## Design decisions (binding on every task)

1. **Registry mode is always `"foreground"`.** It describes how this process retires the child, which is identical for every workflow run. `delivery` ("foreground"|"background") goes only to `reserveBranch` and the participant record.
2. **Step 5 is `manager.bindReservation`, synchronous and directly after `session.create`; `bindBranch` is step 6, before `manager.register`.** Nothing is awaited between create and the bind, so the BASE invariant ("Do not await any server read before this bind", `lib/runtime.js:217`) holds unchanged and the BASE comment is kept verbatim. A `bindBranch` failure therefore happens after the child is already bound in the registry: it takes exactly the path a throwing `register` takes in BASE (`failBranch`, then the `finally` retires the bound child). No special pre-bind handling, no `AggregateError`. Retiring a bound but unregistered child is the existing path: `bindReservation` writes the bound record at the session's own record path (`lib/child-session.js:359-364` at `d6655f6`, `267-268` at `c4936da`), which is what `claimRetirement` reads (`:404-425`; since 0.13.0 it first consults a team record, which a workflow child never has).
3. **Fork context is resolved before step 1**, so `record.prompt` is exactly the text sent at step 12. Task 6 never re-prompts; it fails every non-final dead-owner record in this directory (`registered`, `acknowledged`, `prompting`, or `prompted`).
4. **`agent()` refuses a dispatch without `directory`** (before step 1), because Task 3's participant records require it and Task 6 scopes recovery to it. Production always has one (`PluginInput.directory`).
5. **`failBranch` failure never masks the setup error**: it is reported on stderr and the original error is rethrown. After a successful `failBranch` for a branch whose record was already written (step 7 succeeded), the record is updated to `state: "failed"`, so Task 6 recovery does not fail the same branch a second time. This store update is an addition beyond the contract's failure rule; Task 6 must treat `"failed"` as terminal (the contract's `completed`/`failed` no-action rule).
6. **Step 13 is persisted before the reply is judged.** `promptedAt` records that `session.prompt` returned, so a `reply.error` still leaves the record `prompted`. Task 6 fails `prompted` records too when the owner is dead; only records in state `terminal` belong to Task 9 outcome replay; `completed` and `failed` need no recovery action.
7. **The delivery handler** is `Object.freeze({ runID, delivery, branch, childSessionID })`, stored in the plugin-wide map under `branch.branchID`. Plan 1 defines no handler API (its only reference is Plan 1 Task 10 Step 4, "acknowledge ... proves delivery handler installation"), so Task 4 installs the route and Tasks 7-10 attach result handling to it. Lifetime: one `agent()` call (discarded in the `finally`). A second install for the same branchID is refused, not overwritten.
8. **`parentBranchID` is always `null`.** Workflows cannot see the parent session's own branch; the Plan 1 schema allows null. See Review Focus 9.
9. **Registration failure gates branch work and participant recovery, nothing else.** Task 2 only reports a failed registration; Task 4 must `await participantReady` before `reserveBranch`, and Task 6 before participant recovery and the full reconcile (startup pass 2), so a failed registration fails those paths loudly. Child and team recovery (startup pass 1) never wait for it (Design decision 19).
10. **`tests/live-order.test.mjs` test (a) is a full literal.** Task 7 adds `completeBranch` and `store.update(state "completed")` after step 13; it must extend that literal (and the plugin tests' `delegationOrder` and `branchRecord`'s `state: "prompted"`), not loosen them.
11. **Record states written by Task 4:** `registered` -> `acknowledged` -> `prompting` -> `prompted` on success; `failed` after a successful `failBranch` once the record existed. Task 6 fails every non-final record (`registered`, `acknowledged`, `prompting`, or `prompted`) whose owner is dead and whose directory matches, then persists `failed` and retires the child. Task 6 never re-prompts. `completed` and `failed` require no action; `terminal` is left to Task 9 outcome replay.
12. **One delivery-handler map.** The delivery handler is a frozen route `{ runID, delivery, branch, childSessionID }` in the plugin-wide `deliveryHandlers` Map, present exactly while its `agent()` call runs. Tasks 7-10 attach behaviour by reading this map; they must not install a second map.
13. **Plugin tests never read the real home directory.** Plugin tests that construct `createWorkflowPlugin` without `participants` (the thirteen Task 1 sites in `tests/workflows.test.mjs` -- eleven migrated constructors plus the two RECONCILE R3 plugins, without and with `delegation` --, Task 2's two, the loop-guard site and the four `tests/team-tools.mjs` sites) get Task 5's default, the production child registry under `~/.local/share` (whose lock a live opencode on this machine also takes). Once Task 6's startup recovery calls `participants.list()` at plugin init, those sites must pass `participants: scratchParticipantStore()` (fixture from Task 4 Step 1); Task 6 migrates them.
14. **Task 7 extends the contract's failure rule, deliberately.** The contract names only steps 12 and 13 throwing. Task 7 also fails an error reply and a 2xx reply without `parts`, because Plan 1 Task 18 makes `DelegationTerminal` the only error reply that is not a failure, and Task 10 detects it first.
15. **Foreground terminal order, as implemented.** The contract's "return the payload to the owning `agent()` call, then `acknowledgeOutcome`, then retire" is realised inside `agent()`: the payload is in the call's hands before the acknowledgement, and `agent()` resolves after the retire. There is no post-return tail awaited by `runScript`: the payload lives only in this process either way, so a crash after the acknowledgement loses it identically, and a tail would keep the child and its handler alive past the call.
16. **A handed-off background run is silent as a whole.** Once any child of a background run ended in a terminal, the run persists and sends no report, even if the script catches the rejection and finishes. Results that script computed afterwards reach no one. Chosen because core already delivered the outcome to the root session and the contract forbids announcing it again.
17. **Contract interpretation (Task 9).** `reportDelivery` on a `terminal` branch record is the outcome-acknowledgement marker. The contract fixes the record fields and names no other durable "acknowledged" bit, and "ack exactly once" across restarts needs one.
18. **One `dispose` hook (rebase, 0.13.0).** `lib/core.js` already returns `dispose: async () => { await teams.stop(); }`. Task 2 extends that key and never adds a second one: a duplicate key in an object literal silently replaces the earlier one, dropping either team retirement or the heartbeat stop. The merged hook is `dispose: async () => { try { lifecycle?.stop(); } finally { await teams.stop(); } }` (`lifecycle` is null without `delegation`, RECONCILE R3): the heartbeat stops first and synchronously (Review Focus 2), and team retirement, which can take up to its 10 s budget and needs no participant, still runs if the stop throws.
19. **Team and child recovery stay outside the participant gate (rebase, 0.13.0; RECONCILE R2 decided by Holden 2026-10-08).** Tasks 6 and 8 rewrite only the `manager.reconcile()` startup block. It becomes two passes (Shared contract, "Contract: recovery"): pass 1, `manager.reconcile({ skipWorkflowRecord })`, starts at plugin init whatever happens to registration and holds back only `source: "workflow"` records whose child has a participant record; pass 2 (`participantReady`, `recoverParticipants`, then the full `manager.reconcile()` once pass 1 settled) is the only gated part. The two 0.13 lines after the block (the `// Teams: ...` comment and `teams.startRecovery();`) stay directly after it, unconditional and synchronous, so the 60 s dead-owner team sweep and `reconcileTeams()` inside pass 1 both run when participant registration or recovery fails. A participant-owned child of a dead owner therefore waits for the first start whose registration and recovery succeed; nothing else does.
20. **A real notifier in a test gets an identity (rebase, 0.13.0).** Every new test whose fake client reaches the real `lib/notify.js` (Task 5's `pluginClient`, Task 8's `tests/report-delivery.test.mjs` clients) answers `session.messages` with one user message carrying `agent` and `model`. Without it the first send queues (Verified facts, "Notifier identity") and a test waiting on the notification times out instead of failing on a diff.
21. **Participant records live in the child registry (RECONCILE R1, decided by Holden 2026-10-08).** One ownership store and one dead-owner protocol: participant records are `source: "participant"` files in the registry root, every participant write holds the registry's mkdir lock, and claims are the registry's retirement lease (`retirement: { claimant, leaseUntil }`, 3 minutes, dead owner checked under the lock). Task 3 therefore modifies `lib/child-session.js` (it is no longer a leaf module); Task 6's other changes there are `reconcile({ skipWorkflowRecord })` and the seventh view method `participants.prune` (follow-up 2026-10-08, below). The view keeps the method names `write`, `get`, `list`, `update` that Tasks 4-10 call, so their order literals (`"store.write"`, `"store.update"`) are unchanged. Accepted costs: (i) every participant write now serialises with child, team and intent writes of all directories on this machine through one lock (milliseconds per write; the lock waits up to 10 s); (ii) a crashed claimant blocks a record until its lease expires (up to 3 minutes), because the lease, like `claimRetirement`'s, is not taken over early when the claimant's process dies; (iii) `completed`/`failed` participant records of dead owners live for 7 days after their last write and are then pruned (below); `terminal` records are never pruned and records of live owners are not pruned while the owner lives, so those still accumulate in the registry root -- `jsonNames()` skips them, so existing scans pay a directory entry, not a read, per record; (iv) FIXED by the 2026-10-08 follow-up (was: Task 6 recovery claimed and released every dead-owner record of its directory at each start, no-op states included, i.e. two locked, fsynced writes per historical record per start, growing without bound, and nothing deleted them). Now Task 6 recovery skips `completed`/`failed` records from the `list()` snapshot before the owner probe and before any lease (both states are final, so the snapshot cannot be stale for them), and at the end of each pass calls `participants.prune({ directory, olderThanMs: PARTICIPANT_PRUNE_AGE_MS })` (7 days): under the registry lock, it deletes the `completed`/`failed` records of that directory whose owner is definitely dead (ESRCH), that carry no unexpired lease, and whose file mtime is more than 7 days older than the registry clock; it returns the pruned branch IDs. The age is the file's last write (every `write`, `update`, `claim` and `release` rewrites the file), because the record has no completion timestamp. A pass that throws before the prune deletes nothing. Residual cost: `terminal` records still take one claim/release per start until Task 9's replay has acknowledged them, and stay on disk after that (they are not pruned, because Task 9 owns them); a `list()` still reads every participant record of every directory under the lock.
22. **Recovery takes the branch over, then reads Plan 1's two closed-branch codes (follow-up 2026-10-08; rewritten after Holden's 2026-10-08 terminal-code and dead-worker-takeover decisions).** Recovery first calls Plan 1's `takeOverBranch({ branch, ownerExecution })` with the record's fences and persists the answer on the record (`store.update(branchID, { branch, ownerExecution })`) before any other call; every later call in the pass (`failBranch`, `pendingOutcome`, `acknowledgeOutcome`) uses those taken fences, under this process's own Worker. `owner_alive` leaves the record untouched (no fail, update or retire), releases the lease and continues; `branch_already_terminal` from the takeover is case (a) below; every other takeover rejection is case (c). Recovery can then call `failBranch` for a branch core no longer holds open. Plan 1 (Task 10 Interfaces, "Closed-branch rejections") answers `fail` -- which accepts only `reserved`, `registered`, `acknowledged` and `running` -- with `DelegationBranchError { code: "branch_already_terminal" }` when the branch is `completed`, `failed`, `outcome_acknowledged`, `retiring` or `retired`, and with `invalid_branch_state` for exactly one remaining state, `handoff`; Plan 1 pins both with tests of its own (Task 10 Step 2: fail on a retired branch; Task 11 Step 6b: fail on a `handoff` branch). Recovery matches `_tag === "DelegationBranchError"` and the code: (a) `branch_already_terminal` is success for the record -- an earlier start's `failBranch` succeeded and then `store.update` threw or the process died (the record still says an open state; the lease expires and a later start retries), or the branch ended in core another way (a Plan 1 maintenance drain or abort retires it); recovery logs one stderr line, records `failed`, retires the child, releases the lease and continues. (b) `invalid_branch_state` means the branch is in `handoff` and core holds its one pending outcome. Recovery then calls Plan 1's read-only `pendingOutcome({ branch, ownerExecution })` (Plan 1 Task 14, decided 2026-10-08) with the taken fences, the pair `resolveOutcome` takes. A `DelegationTerminal` answer is recorded with `store.update(branchID, { outcomeID, state: "terminal" })` (plus `blocked: true` for a `delivery: "background"` record, exactly the Task 9 settler's background patch); recovery then calls `acknowledgeOutcome({ outcomeID, branch, ownerExecution })` with the taken fences (no `worker`; the host injects this process's Worker) and records `store.update(branchID, { reportDelivery: "delivered" })` (Design decision 17's acknowledgement marker), logs one stderr line, does not call `manager.retire` (pass 2's full `manager.reconcile()` owns the dead-owner child, as for any `terminal` record), releases the lease and continues. Acknowledging in this pass is required, not optional: the taken fences belong to this process's Worker, so a deferred acknowledgement by a later start would need a second takeover. A crash between the terminal update and the `delivered` update leaves a `terminal` record whose fences name this (then dead) process; the next start's Task 9 replay takes it over again and acknowledges it once. A `null` answer (core closed the branch between the two calls) leaves the record as written (with the taken fences); the next start's `takeOverBranch` gets `branch_already_terminal` and records it `failed`. A `pendingOutcome` rejection, or an answer without a non-empty `outcomeID`, propagates and keeps the lease. (c) Every other rejection (another code, another `_tag`, a plain `Error`) propagates as before and keeps the lease. DECIDED 2026-10-08 (Holden), replacing the OPEN line that stood here (a record that reaches `failBranch` is by construction in an open state, `registered` to `prompted`, because its owner died after core moved the branch to `handoff` but before the settler stored `terminal`; it carries no `outcomeID`, Plan 1 had no branch-to-outcome lookup, and a foreground outcome stayed pending in core until a maintenance drain or abort): Plan 1 adds the read-only `pendingOutcome` lookup and recovery records its answer as in (b), so the outcome is acknowledged exactly once. DECIDED 2026-10-08 (Holden), option A, replacing the OPEN fence question that stood here (recovery presented the dead owner's recorded fences to `failBranch`, `pendingOutcome` and the replay's `acknowledgeOutcome`; Plan 1 refuses them -- `stale_worker` for a superseded Worker epoch (Plan 1 Task 4 Step 3, Task 10 Step 1 "recycled Worker epoch", Review Focus 2), `stale_execution` once the root execution is recovered (Plan 1 Task 5 Step 1), and `acknowledgeOutcome` pairs the injected live Worker with the dead owner's execution -- so recovery threw, kept the lease and, because a rejected recovery skips pass 2 (Design decision 19), held back the full reconcile on every start): Plan 1 adds `takeOverBranch` (Plan 1 Task 14, "Takeover"). It re-fences a non-terminal branch to the calling Worker only when the owner Worker is provably gone (epoch superseded or past `heartbeatAt + 6000`) and the caller is in the same coordination domain, bumps the branch fencing token so the old owner is refused if it reappears, re-points the pending outcome, audits the takeover, and gives exactly one of two concurrent takers the branch (the other gets `owner_alive`). It also accepts a fence pair a recorded takeover replaced while the current holder is gone, so a crash between the takeover and the record's fence update is retried by a later start with the record's older fences. Recovery (Task 6) and the outcome replay (Task 9) both call it first; no other Plan 1 API accepts a dead owner's fences.

**Design decision 22 addendum (2026-10-08 takeover fixes).** `wrong_domain`, `wrong_parent`, `stale_branch` and `unregistered_branch` are permanent for this record: recovery logs exactly one refusal line, leaves the record unchanged, releases its lease and continues. `wrong_parent` is included with the reviewer's three because it is equally permanent. `stale_worker` remains a propagated failure because this process's Worker was superseded, not because the record is unrepairable. When optional `worker` exactly matches `record.branch.workerID` and `record.branch.workerEpoch`, recovery skips `takeOverBranch` and the fence `store.update`: the persisted fences already name this live process. This handles a crash after the taken fences were persisted but before `failBranch` (or `pendingOutcome`/`acknowledgeOutcome`) completed: another process receives `owner_alive` and leaves the record while this process lives; this process's later pass retries using its own fences; after it exits, the next start can take over because the holder is gone.

## RECONCILE: the shipped team runtime (0.13.0-0.13.2)

0.13.0 shipped native agent teams after this plan was written. Teams and this plan both track long-lived child sessions, recover them after their owner process dies, and keep ownership records under `~/.local/share/opencode/workflow-runs/`. The rebase keeps the plan's design and changes only what the shipped team tests need (Design decisions 18-21). Holden decided every overlap below on 2026-10-08, and the tasks carry each decision: R1 option (b), R2 option (c), R3 option (b), R4 accepted.

- **DECIDED 2026-10-08 (Holden) R1 -- participant records live in the child registry, one dead-owner protocol.** Decision: option (b). Participant records are a record kind (`source: "participant"`, file `participant-<branchID>.json`) in the existing child registry (`lib/child-session.js`, `workflow-runs/children/`), written under its mkdir lock and claimed with `claimRetirement`'s 3-minute retirement lease, not a separate `participants/` store with its own `.claim` protocol. Carried by Architecture, the Shared contract ("Contract: participant records in the child registry", "Contract: recovery"), Shared names, Verified facts ("Child registry internals"), Design decision 21, Review Focus 4, 5, 10 and 13, Task 3 (registry methods and `tests/participant-records.test.mjs`), Task 4 (fixture), Tasks 5, 8 and 10 (plugin default), Task 6 (lease claims) and Task 9 (lease claims in outcome replay). Superseded original note, kept for the record: At `d6655f6` there were three ownership stores -- `workflow-runs/children/` (child registry; `ownerPID`, `directory`, registry lock `.lock/owner`, 3-minute retirement lease `lib/child-session.js:15`), `workflow-runs/teams/<leadID>/<childID>.json` (team records under the same lock), and run records `workflow-runs/<runID>.json` -- and the plan as first written added a fourth, `workflow-runs/participants/<branchID>.json`, with its own atomic writes and Task 6's own `<branchID>.claim` pid files. Options were: (a) keep separate (two claim protocols keyed on the same `ownerPID` + `directory` rule); (b) share the registry (couples Tasks 3 and 6 to `lib/child-session.js`); (c) migrate teams onto delegation (needs a Plan 1 branch kind for native `task` children owned by a plugin).
- **DECIDED 2026-10-08 (Holden) R2 -- startup recovery order.** Decision: startup always runs team and child recovery (`manager.reconcile()`, including `reconcileTeams()`, and `teams.startRecovery()`) regardless of participant registration; the participant gate skips only workflow records owned by a participant record. Carried by the Shared contract ("Contract: recovery"), Design decisions 9 and 19, Review Focus 12, Task 6 (`reconcile({ skipWorkflowRecord })` in `lib/child-session.js`, the two-pass startup block, failing-first tests) and Task 8 (the report-delivery `pluginFor` counts only the full reconcile). This is option (c) below. Superseded original note, kept for the record: At `d6655f6` startup runs `manager.reconcile()` unconditionally (it calls `reconcileTeams()` first, then reservations, dead-owner workflow records, native children and intents), then `teams.startRecovery()`. Tasks 6 and 8 put `replayReports()`, `await participantReady` and `recoverParticipants()` in front of `manager.reconcile()`, so a failed participant registration or a rejected recovery now skips the whole startup reconcile for the life of the process. Teams still recover through the 60 s sweep (Design decision 19); reservations, native children and intents do not. Options: (a) keep, as written: `failBranch` must reach core before reconcile deletes a branch's child, and the price is no startup reconcile without a registered participant; (b) also run `manager.reconcileTeams()` ahead of the gate (team records never have participant records; `reconcile()` repeats it idempotently); (c) after a failed registration still run `manager.reconcile()` but skip `source: "workflow"` records that have a participant record -- needs a child-session change.
- **DECIDED 2026-10-08 (Holden) R3 -- degrade, do not refuse.** Decision: option (b). Without `PluginInput.delegation` the plugin still loads; teams, team recovery, the `tool.execute.before` hook and every tool other than `workflow_run` keep working; `workflow_run` alone is refused with `workflow_run requires PluginInput.delegation, which this opencode host does not provide`. Carried by Prerequisites, Goal, Shared names (`WORKFLOW_RUN_NEEDS_DELEGATION`), Design decision 13, Review Focus 1 (reversed), Task 1 (no plugin guard; the refusal is the first statement of `workflow_run`'s `execute`; failing-first tests), Task 2 (no lifecycle and a rejected `participantReady` without `delegation`), Task 6 (both R3 plugin sites migrated) and Task 11's teams changelog bullet. Superseded original note, kept for the record: Task 1's guard was the first statement of `createWorkflowPlugin`, so on a host without the delegation API the team tools, the `tool.execute.before` hook (spawn briefing, G5) and team recovery stopped loading too, while 0.13.x teams work on stock opencode with the background-subagent flag. Options were: (a) refuse to load (0.14.0 deploys only with Plan 3's fork rollout); (b) degrade; (c) ship teams as their own plugin package (`plugin.js` may export only `Workflows`).
- **DECIDED 2026-10-08 (Holden) R4 -- a teammate cannot start a workflow: accepted.** A teammate is a non-root background child of its lead; per Review Focus 9, `workflow_run` from any non-root session is refused at step 9 (`wrong_parent`) and takes the ordinary steps 1-11 failure path, so a teammate cannot start a workflow. Guard 1.7.x G4 already denies `workflow_run` to team members, so this adds no new restriction, no code and no test; Task 11's changelog states the limit.

## Review Focus

1. A host that does not supply `delegation` (older opencode; RECONCILE R3, decided 2026-10-08): the plugin degrades instead of refusing. It loads, keeps the team tools, `workflow_list`, the `tool.execute.before` hook, `dispose` and team recovery, and refuses only `workflow_run` -- foreground and background alike, before `discover` or any runtime is built -- with `workflow_run requires PluginInput.delegation, which this opencode host does not provide`. No participant lifecycle is created, `participantReady` rejects (reported on stderr by Task 2's reporter, and by Task 6's pass 2 when it skips), so no branch work and no startup pass 2 can run half-registered. The runtime itself still refuses to start without `delegation`. Pinned by Task 1 Step 6 ("without PluginInput.delegation the plugin keeps teams and its other tools and refuses only workflow_run", "with PluginInput.delegation workflow_run hands the same delegation to the runtime", "the runtime refuses to start without delegation"). Reviewer: confirm no code path other than `workflow_run` and the runtime reads `delegation` without a presence check.
2. `dispose` arriving while `registerParticipant` is still in flight: no heartbeat interval may be installed afterwards. Pinned by Task 2 Step 1 ("stop before registration resolves").
3. A heartbeat that rejects (core restarting): the error must be reported on stderr and the interval must keep running, not crash the plugin with an unhandled rejection. Pinned by Task 2 Step 1 ("heartbeat failure is reported").
4. A hostile or malformed `branchID` (`../x`, empty, slashes) reaching the registry's participant methods: it must be refused before any path is built, by `write`, `get`, `update`, `claim` and `release` alike. Pinned by Task 3 Step 1 ("unsafe branch IDs are refused before any path is built").
5. A crash between temp-file creation and rename leaves `.tmp` junk in the registry root: every lock acquisition runs the registry's `clearTemps`, and every participant write and update holds the lock, so the next locked operation sweeps it and no sweep can delete a temp file that a participant write still owns. Pinned by Task 3 Step 1 ("a participant write sweeps stale temp files under the registry lock").
6. Step 6 `bindBranch` failure: the child exists and is already bound in the registry, core refused the branch. Confirm it cannot prompt, that `register` is never called, that `failBranch` runs, and that the `finally` retires the child through the existing path with the `bindBranch` error reaching the caller. Pinned by Task 4 test (b) case "6 bindBranch".
7. `failBranch` rejecting during a failed setup must not replace the setup error and must leave the record non-terminal for Task 6. Pinned by code review only (the fake's `failBranch` cannot fail and still record the setup order; Task 6's recovery tests cover the re-fail).
8. A `session.prompt` that throws (step 12) or a `store.update` that throws at step 13 is NOT a steps 1-11 failure: Task 4 does not call `failBranch` for it; the branch stays `acknowledged` in core and `prompting`/`prompted` in the store until Task 6 (restart) or Task 7 (result handling) closes it. Reviewer: confirm Task 7 owns this.
9. `parentBranchID: null`. Plan 1's "Plan 1 Authoritative Consumer Interfaces and Commands" table, row "Later workflow consumer", requires `acknowledgeBranch` with `ownerComponent: "workflows"` to carry `parentBranchID === null` and a root owner execution, else `wrong_parent`. So `null` is required, and a workflow started inside a delegated (non-root) child session is refused at step 9. Reviewer: confirm that refusal takes the ordinary steps 1-11 failure path (no prompt, `failBranch`, handler discarded, retire).
10. Concurrency: `parallel()` runs several `agent()` calls at once. They share the plugin-wide `deliveryHandlers` map and store; branchIDs are core-issued and unique, and each call only deletes its own key, so no cross-talk. Participant records share the child registry's lock with every other process on the machine; each `update` is a locked read-merge-write, so concurrent `agent()` calls, recovery and outcome replay never interleave a record write.
11. Team behaviour is unchanged by Tasks 1-11 (rebase, 0.13.0). The 0.13 tests (`tests/team-*.mjs`, `tests/teammates.mjs`, `tests/notify-identity.mjs`, `tests/terminal-intents.mjs`, the nudge tests in `tests/workflows.test.mjs`) pass at every task with no edit beyond the mechanical option migrations of `tests/team-tools.mjs` in Tasks 1, 6 and 8. Reviewer: confirm the merged `dispose` (Design decision 18), that `teams.startRecovery()` is still called once and unconditionally at plugin init (Design decision 19), and that Task 8's notifier keeps the 0.13 identity read, fallback and ordered re-queue.
12. Startup recovery does not depend on the participant (RECONCILE R2, decided 2026-10-08). With a failed registration, the plugin still calls `teams.startRecovery()` and `manager.reconcile({ skipWorkflowRecord })`, never calls `failBranch`, never retires a participant-owned child and never runs the full `manager.reconcile()`. `skipWorkflowRecord` is Task 6's only change to the child manager in `lib/child-session.js` (Task 3 adds the participant records, RECONCILE R1; Task 6's other change there is the registry view's `prune`, Design decision 21); it guards only the dead-owner `source: "workflow"` record loop (teams, reservations, native children and intents are untouched), and its default keeps every existing `reconcile()` call identical. The full reconcile awaits pass 1, so two startup reconciles never run at once. Pinned by Task 6's "a failed participant registration still runs team and child recovery" and "reconcile holds back the workflow records its skipWorkflowRecord predicate names" tests.
13. Participant records in the child registry (RECONCILE R1, decided 2026-10-08). Confirm that (i) no child, reservation, intent or capacity scan reads or counts a `participant-*.json` file and `validRecord`/`validReservation`/`validIntent` are unchanged; (ii) every participant `write`, `update`, `list`, `claim` and `release` holds the registry lock, and `get`/`list` never return `version`, `source` or `retirement`; (iii) `claim` re-checks the record's dead owner under the lock and uses exactly `claimRetirement`'s lease field and expiry test, so recovery (Task 6) and outcome replay (Task 9) share one dead-owner protocol with child retirement; (iv) participant `list()` throws where the child `list()` answers `[]`, which is what makes R2's pass 1 hold back every workflow record when participant records are unreadable -- on every start, until someone repairs or removes the named file by hand (nothing quarantines it; the error names the branch); (v) `prune` (Task 6) holds the lock, deletes only `completed`/`failed` records of the given directory whose owner is dead, with no unexpired lease and a file mtime older than the given age, and recovery calls it only after every record of the pass was handled, while recovery never claims a `completed`/`failed` record (Design decision 21 (iv)). Pinned by Task 3's eleven tests and Task 6's lease, skip and prune tests.
14. Dead-worker takeover (Plan 1 option A, decided 2026-10-08; Design decision 22). Confirm that (i) recovery and the outcome replay call `takeOverBranch` with the record's fences before any other delegation call for that record, and only while holding the registry lease; (ii) the taken fences are persisted with `store.update` before `failBranch`/`pendingOutcome`/`acknowledgeOutcome` and every one of those calls uses them, never the dead owner's; (iii) `owner_alive` leaves the record unchanged (no fail, update, acknowledgement or retire) and releases the lease, and a later start retries; the permanent refusals `wrong_domain`, `wrong_parent`, `stale_branch` and `unregistered_branch` (2026-10-08 takeover fixes) do the same with one stderr line and leave the record for manual inspection without stopping the pass; every other takeover rejection (for example `stale_worker`, or a plain `Error`) still propagates and keeps the lease; (iv) workflows asks for nothing beyond Plan 1's ordinary fenced calls -- it passes no `worker` to any Plan 1 call (the `worker` recovery receives from `participantReady` is only compared with a record's fences) and never presents a fence it did not record or receive from `takeOverBranch`; (v) a record whose fences already name this process's Worker (an earlier pass in this process persisted them and then `failBranch` threw) skips `takeOverBranch` and is closed with those fences. Plan 1 owns the security cases (no maintenance authority for plugins, never a root/primary session; Plan 1 Review Focus 11-12). Pinned by Task 6's takeover tests and Task 9's replay takeover tests.

---

### Task 1: Shared delegation fake and `delegation` threaded into the plugin and runtime

**Files:**
- Create: `tests/fixtures/delegation.mjs`
- Create: `tests/delegation.test.mjs`
- Modify: `lib/core.js:11` (module constant after the last import), `lib/core.js:13-14` (options), `lib/core.js:50-53` (runtime construction), `lib/core.js:227-228` (first statement of `workflow_run`'s `execute`)
- Modify: `lib/runtime.js:122-131` (options and first statement)
- Modify: `plugin.js:15-16`
- Modify: `tests/workflows.test.mjs` (import after line 12; 27 call sites; three new tests at end of file)
- Modify: `tests/loop-guard.test.mjs` (import after line 4; 1 call site)
- Modify: `tests/team-tools.mjs` (import after line 3; 4 call sites; 0.13.0 team tests)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `tests/fixtures/delegation.mjs` exports `DELEGATION_METHODS` (array of the 17 method names; `pendingOutcome` and `takeOverBranch` added 2026-10-08), `fakeExecution(sessionID, rootSessionID = sessionID)` returning an ExecutionFence, `TAKER`, `takenOver({ branch, ownerExecution })`, `fakeDelegation({ fail = {}, order = [] } = {})` returning all 17 `DelegationBranchApi` methods, and `fakeTimers()` returning `{ active: Map, calls: Array, setInterval(fn, ms), clearInterval(handle), tick() }`.
  - Fake fence values: ExecutionFence `{ workerID: "worker_test", workerEpoch: "epoch_test", executionID: "exec_<sessionID>", sessionID, rootSessionID, fencingToken: 1 }`; BranchFence = the reserveBranch input's `ownerExecution` fields + `branchID: "branch_<n>"` + `branchFencingToken: n`, n counting from 1 per fake; `createOutcome` returns `outcomeID: "outcome_<n>"`; `takeOverBranch` returns `takenOver({ branch, ownerExecution })`, whose execution token is `ownerExecution.fencingToken + 1` and branch token is `branch.branchFencingToken + 1`.
  - `createWorkflowPlugin({ ..., delegation })` degrades when `delegation` is absent (RECONCILE R3, decided 2026-10-08): it loads and returns every hook and tool as before, and only `workflow_run`'s `execute` throws `Error(WORKFLOW_RUN_NEEDS_DELEGATION)`, `"workflow_run requires PluginInput.delegation, which this opencode host does not provide"`, as its first statement (before `discover`, for foreground and background runs alike). With `delegation`, `executeWorkflow` passes it to `runtimeFactory`.
  - `createWorkflowRuntime({ ..., delegation })` throws `Error("workflows requires PluginInput.delegation")` when `delegation` is absent. The runtime keeps `delegation` in its closure for Task 4.
  - `Workflows({ client, directory, delegation })` passes `delegation` through unchanged.

- [ ] **Step 0: Preflight (stop on any failure)**

Run (workdir `/home/dev/opencode-agent-workflows-plan2`):
```bash
git rev-parse --abbrev-ref HEAD; git --no-pager status --porcelain; node -p 'require("./package.json").version'; git merge-base --is-ancestor d6655f66ce3e96709e92caed850a86904141a231 HEAD && echo "base ok"; for f in package-lock.json npm-shrinkwrap.json bun.lock bun.lockb yarn.lock pnpm-lock.yaml; do test -e "$f" && echo "lockfile: $f"; done; node --test tests/*.mjs
```
Expected: the branch line prints `plan2`; `git status --porcelain` prints nothing (clean tree); the version line prints `0.13.2`; `base ok` is printed (HEAD is `d6655f6` or a descendant); no `lockfile:` line is printed; the suite ends with `ℹ fail 0` (`ℹ tests 185` at `d6655f6`, measured 2026-10-08; a newer base may carry more pre-existing tests).

If any of these checks fails, stop and report STATUS: BLOCKED with the failing check and its exact output. Do not reuse, reset or delete anything to make a check pass.

- [ ] **Step 1: Write the failing fixture test**

Create `tests/delegation.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { DELEGATION_METHODS, fakeDelegation, fakeExecution, fakeTimers, takenOver } from "./fixtures/delegation.mjs";

test("the delegation fake exposes every DelegationBranchApi method", () => {
  assert.deepEqual(Object.keys(fakeDelegation()).sort(), [
    "acknowledgeBranch", "acknowledgeOutcome", "bindBranch", "completeBranch", "createOutcome",
    "currentExecution", "failBranch", "heartbeatParticipant", "listParticipants", "markUnavailable",
    "participantStatus", "pendingOutcome", "registerParticipant", "reserveBranch", "resolveOutcome", "takeOverBranch", "withdrawParticipant",
  ]);
  assert.deepEqual([...DELEGATION_METHODS].sort(), Object.keys(fakeDelegation()).sort());
});

test("the delegation fake records every call in order and returns schema-shaped fences", async () => {
  const order = [];
  const delegation = fakeDelegation({ order });
  const execution = await delegation.currentExecution({ sessionID: "ses_parent" });
  assert.deepEqual(execution, {
    workerID: "worker_test", workerEpoch: "epoch_test", executionID: "exec_ses_parent",
    sessionID: "ses_parent", rootSessionID: "ses_parent", fencingToken: 1,
  });
  const reserveInput = { parentSessionID: "ses_parent", rootSessionID: "ses_parent", ownerExecution: execution, parentBranchID: null, kind: "workflow", delivery: "foreground" };
  const reserved = await delegation.reserveBranch(reserveInput);
  const branch = { ...execution, branchID: "branch_1", branchFencingToken: 1 };
  assert.deepEqual(reserved, { branch, state: "reserved" });
  assert.deepEqual(await delegation.bindBranch({ branch, childSessionID: "ses_child" }), { branch, childSessionID: "ses_child", state: "registered" });
  const ackInput = { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" };
  assert.deepEqual(await delegation.acknowledgeBranch(ackInput), { branch, childSessionID: "ses_child", state: "acknowledged" });
  assert.deepEqual(await delegation.listParticipants(), []);
  assert.deepEqual(order, [
    ["currentExecution", { sessionID: "ses_parent" }],
    ["reserveBranch", reserveInput],
    ["bindBranch", { branch, childSessionID: "ses_child" }],
    ["acknowledgeBranch", ackInput],
    ["listParticipants", undefined],
  ]);
});

test("the delegation fake rejects an acknowledgement for a branch that was never bound", async () => {
  const delegation = fakeDelegation();
  const { branch } = await delegation.reserveBranch({ parentSessionID: "ses_p", rootSessionID: "ses_p", ownerExecution: fakeExecution("ses_p"), parentBranchID: null, kind: "workflow", delivery: "background" });
  await assert.rejects(delegation.acknowledgeBranch({ branch, ownerComponent: "workflows", ownerBuildID: "b", protocol: "opencode.delegation/v1" }), { message: "fakeDelegation: acknowledgeBranch before bindBranch for branch_1" });
});

test("the delegation fake fails a named method after recording the call", async () => {
  const order = [];
  const boom = new Error("reserve refused");
  const delegation = fakeDelegation({ fail: { reserveBranch: boom }, order });
  const input = { parentSessionID: "ses_p", rootSessionID: "ses_p", ownerExecution: fakeExecution("ses_p"), parentBranchID: null, kind: "workflow", delivery: "foreground" };
  await assert.rejects(delegation.reserveBranch(input), (error) => error === boom);
  assert.deepEqual(order, [["reserveBranch", input]]);
  assert.throws(() => fakeDelegation({ fail: { reserveBranhc: boom } }), { message: "fakeDelegation: unknown method reserveBranhc" });
  assert.throws(() => fakeDelegation({ fail: { reserveBranch: "nope" } }), { message: "fakeDelegation: fail.reserveBranch must be an Error" });
});

test("the delegation fake answers outcome calls with schema-shaped values", async () => {
  const delegation = fakeDelegation();
  const execution = fakeExecution("ses_p");
  const branch = { ...execution, branchID: "branch_9", branchFencingToken: 9 };
  assert.deepEqual(await delegation.createOutcome({ idempotencyKey: "k", kind: "question_handoff", errorCode: null, origin: branch }), { outcomeID: "outcome_1", branchID: "branch_9", kind: "question_handoff", errorCode: null });
  assert.deepEqual(await delegation.resolveOutcome({ outcomeID: "outcome_1", branch, ownerExecution: execution }), { type: "internal_error", message: "Delegated interaction could not be transferred." });
  assert.equal(await delegation.acknowledgeOutcome({ outcomeID: "outcome_1", branch, ownerExecution: execution }), undefined);
  assert.equal(await delegation.pendingOutcome({ branch, ownerExecution: execution }), null);
  assert.deepEqual(await delegation.takeOverBranch({ branch, ownerExecution: execution }), takenOver({ branch, ownerExecution: execution }));
  assert.deepEqual(takenOver({ branch, ownerExecution: execution }).branch, { workerID: "worker_taker", workerEpoch: "epoch_taker", executionID: "exec_taken_branch_9", sessionID: "ses_p", rootSessionID: "ses_p", fencingToken: 2, branchID: "branch_9", branchFencingToken: 10 });
});

test("fake timers record set and clear and tick only active intervals", () => {
  const timers = fakeTimers();
  let ticks = 0;
  const handle = timers.setInterval(() => { ticks += 1; }, 2000);
  timers.tick();
  timers.clearInterval(handle);
  timers.tick();
  assert.equal(ticks, 1);
  assert.equal(timers.active.size, 0);
  assert.deepEqual(timers.calls, [["setInterval", 2000], ["clearInterval", 1]]);
  assert.equal(handle.unref(), handle);
  assert.equal(handle.unrefed, true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/delegation.test.mjs`
Expected: FAIL, the file errors before any test with `ERR_MODULE_NOT_FOUND` naming `tests/fixtures/delegation.mjs`.

- [ ] **Step 3: Write the fixture**

Create `tests/fixtures/delegation.mjs`:
```js
// Shared in-memory stand-in for PluginInput.delegation (Plan 1 DelegationBranchApi).
// Every method is async, records [method, input] into `order` BEFORE it answers or
// fails (so ordering assertions see the failing call too), and returns values shaped
// like the Plan 1 schemas. `fail` maps a method name to the Error that call rejects with.
// Tests that need a different answer replace the method on the returned object.
export const DELEGATION_METHODS = Object.freeze([
  "currentExecution", "registerParticipant", "heartbeatParticipant", "markUnavailable",
  "withdrawParticipant", "participantStatus", "listParticipants", "reserveBranch", "bindBranch",
  "acknowledgeBranch", "completeBranch", "failBranch", "createOutcome", "resolveOutcome",
  "acknowledgeOutcome", "pendingOutcome", "takeOverBranch",
]);

const WORKER = Object.freeze({ workerID: "worker_test", workerEpoch: "epoch_test" });

// Plan 1's dead-worker takeover (decided 2026-10-08) re-fences a branch to the caller's Worker and a new
// takeover execution; the fake answers with this fixed taker identity so tests can name the taken fences.
export const TAKER = Object.freeze({ workerID: "worker_taker", workerEpoch: "epoch_taker" });

export const takenOver = ({ branch, ownerExecution }) => {
  const execution = {
    ...TAKER, executionID: `exec_taken_${branch.branchID}`, sessionID: ownerExecution.sessionID,
    rootSessionID: ownerExecution.rootSessionID, fencingToken: ownerExecution.fencingToken + 1,
  };
  return { branch: { ...execution, branchID: branch.branchID, branchFencingToken: branch.branchFencingToken + 1 }, ownerExecution: execution };
};

export const fakeExecution = (sessionID, rootSessionID = sessionID) => ({
  ...WORKER, executionID: `exec_${sessionID}`, sessionID, rootSessionID, fencingToken: 1,
});

export const fakeDelegation = ({ fail = {}, order = [] } = {}) => {
  for (const [name, error] of Object.entries(fail)) {
    if (!DELEGATION_METHODS.includes(name)) throw new Error(`fakeDelegation: unknown method ${name}`);
    if (!(error instanceof Error)) throw new Error(`fakeDelegation: fail.${name} must be an Error`);
  }
  const participants = new Map();
  const boundChildren = new Map();
  let branches = 0;
  let outcomes = 0;
  const answer = {
    currentExecution: ({ sessionID }) => fakeExecution(sessionID),
    registerParticipant: (input) => {
      const status = {
        coordinationDomain: "domain_test", component: input.component, buildID: input.buildID,
        protocol: input.protocol, capabilities: [...input.capabilities].sort(),
        availability: "available", heartbeatAt: 1000, worker: { ...WORKER },
      };
      participants.set(input.component, status);
      return status;
    },
    heartbeatParticipant: () => undefined,
    markUnavailable: () => undefined,
    withdrawParticipant: () => undefined,
    participantStatus: ({ component }) => participants.get(component) ?? null,
    listParticipants: () => [...participants.values()],
    reserveBranch: ({ ownerExecution }) => {
      branches += 1;
      return { branch: { ...ownerExecution, branchID: `branch_${branches}`, branchFencingToken: branches }, state: "reserved" };
    },
    bindBranch: ({ branch, childSessionID }) => {
      boundChildren.set(branch.branchID, childSessionID);
      return { branch, childSessionID, state: "registered" };
    },
    acknowledgeBranch: ({ branch }) => {
      if (!boundChildren.has(branch.branchID)) throw new Error(`fakeDelegation: acknowledgeBranch before bindBranch for ${branch.branchID}`);
      return { branch, childSessionID: boundChildren.get(branch.branchID), state: "acknowledged" };
    },
    completeBranch: () => undefined,
    failBranch: () => undefined,
    createOutcome: (input) => {
      outcomes += 1;
      return { outcomeID: `outcome_${outcomes}`, branchID: input.origin.branchID, kind: input.kind, errorCode: input.errorCode };
    },
    resolveOutcome: () => ({ type: "internal_error", message: "Delegated interaction could not be transferred." }),
    acknowledgeOutcome: () => undefined,
    // Plan 1's read-only lookup (decided 2026-10-08): by default no branch has a pending outcome.
    pendingOutcome: () => null,
    // Plan 1's dead-worker takeover returns deterministic taken fences for recovery tests.
    takeOverBranch: (input) => takenOver(input),
  };
  return Object.fromEntries(DELEGATION_METHODS.map((name) => [name, async (input) => {
    order.push([name, input]);
    if (fail[name]) throw fail[name];
    return answer[name](input);
  }]));
};

// Deterministic setInterval/clearInterval pair. Handles carry unref() like a Node Timeout.
export const fakeTimers = () => {
  const active = new Map();
  const calls = [];
  let next = 0;
  return {
    active, calls,
    setInterval: (fn, ms) => {
      next += 1;
      const handle = { id: next, unrefed: false, unref() { this.unrefed = true; return this; } };
      active.set(handle, fn);
      calls.push(["setInterval", ms]);
      return handle;
    },
    clearInterval: (handle) => {
      calls.push(["clearInterval", handle.id]);
      active.delete(handle);
    },
    tick: () => { for (const fn of [...active.values()]) fn(); },
  };
};
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test tests/delegation.test.mjs`
Expected: PASS, `# pass 6`, `# fail 0`.

- [ ] **Step 5: Migrate every existing call site (mechanical, no behaviour change yet)**

The 32 call sites, verified by line at `d6655f6` (2026-10-08):
- `tests/workflows.test.mjs` `createWorkflowRuntime(` at lines 274, 290, 314, 641, 668, 678, 687, 703, 721, 745, 753, 762, 974, 978, 986, 1076 (16 sites; 274 and 290 are multi-line, their first argument line is the next line).
- `tests/workflows.test.mjs` `createWorkflowPlugin(` at lines 506, 523, 537, 560, 574, 816, 839, 868, 890, 930, 952 (11 sites; 816 to 952 are multi-line; 839, 868, 890 and 930 are the 0.13 nudge tests).
- `tests/loop-guard.test.mjs` `createWorkflowPlugin(` at line 25 (1 site, multi-line).
- `tests/team-tools.mjs` `createWorkflowPlugin(` at lines 9, 47, 70, 84 (4 sites, 0.13.0 team tests; each continues on the next line).

Run this BEFORE adding any new test that deliberately omits `delegation` (the rewrite matches every call site in the file). It inserts `delegation: fakeDelegation(), ` as the first property of each call's object literal and changes no line count:
```bash
perl -0pi -e 's/\bcreate(WorkflowRuntime|WorkflowPlugin)\(\{(\s*)/create$1({$2delegation: fakeDelegation(), /g' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
```
Then add the imports (these shift later line numbers by one):
- `tests/workflows.test.mjs`: after line 12 (`import { createRunStore } from "../lib/run-store.js";`) insert
  `import { fakeDelegation, fakeTimers } from "./fixtures/delegation.mjs";`
- `tests/loop-guard.test.mjs`: after line 4 (`import { createWorkflowPlugin } from "../lib/core.js";`) insert
  `import { fakeDelegation } from "./fixtures/delegation.mjs";`
- `tests/team-tools.mjs`: after line 3 (`import { createWorkflowPlugin } from '../lib/core.js';`) insert
  `import { fakeDelegation } from './fixtures/delegation.mjs';` (single quotes, the file's own style)

Verify the count exactly:
```bash
grep -c 'delegation: fakeDelegation()' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
```
Expected: `tests/workflows.test.mjs:27`, `tests/loop-guard.test.mjs:1` and `tests/team-tools.mjs:4` (dry run on copies at `d6655f6`, 2026-10-08). Any other count: STOP, inspect with `git --no-pager diff`, fix by hand.

Run: `node --test tests/*.mjs`
Expected: PASS, `# fail 0` (the extra property is ignored until Step 7).

- [ ] **Step 6: Write the failing delegation tests (RECONCILE R3: degrade, do not refuse)**

Append to the END of `tests/workflows.test.mjs` (after the Step 5 rewrite, so the Step 5 perl never touches these calls: the first plugin and the runtime keep no `delegation`, the second plugin passes its own `delegation` shorthand):
```js
test("without PluginInput.delegation the plugin keeps teams and its other tools and refuses only workflow_run", async () => {
  const client = fakeClient();
  let discovered = 0;
  let built = 0;
  const plugin = createWorkflowPlugin({
    client, directory: "/d", tool: fakeTool, backgroundSubagents: true,
    runtimeFactory: () => { built += 1; throw new Error("no runtime may be built without delegation"); },
    discover: async () => { discovered += 1; return new Map(); },
    manager: managed(client),
  });
  assert.deepEqual(Object.keys(plugin.tool), [
    "team_list", "team_message", "team_report", "team_task_add", "team_task_list",
    "team_task_claim", "team_task_update", "team_dismiss", "workflow_run", "workflow_list",
  ]);
  assert.equal(typeof plugin["tool.execute.before"], "function");
  assert.equal(typeof plugin.dispose, "function");
  for (const background of [false, true]) {
    await assert.rejects(
      plugin.tool.workflow_run.execute({ name: "any", background }, { sessionID: "ses_parent" }),
      { message: "workflow_run requires PluginInput.delegation, which this opencode host does not provide" },
    );
  }
  assert.equal(discovered, 0, "the refusal comes before discovery");
  assert.equal(built, 0, "no runtime is built");
  await plugin.dispose();
});

test("with PluginInput.delegation workflow_run hands the same delegation to the runtime", async () => {
  const client = fakeClient();
  const delegation = fakeDelegation();
  const seen = [];
  const plugin = createWorkflowPlugin({
    delegation, client, directory: "/d", tool: fakeTool,
    runtimeFactory: (options) => {
      seen.push(options.delegation);
      return { runID: "r1", finish: () => {}, agent: async () => "", parallel: async () => [], pipeline: async () => [], phase: () => {}, parseJson };
    },
    discover: async () => new Map([["one", { meta: { name: "one" }, run: async () => "the report" }]]),
    manager: managed(client),
  });
  assert.equal(await plugin.tool.workflow_run.execute({ name: "one" }, { sessionID: "ses_parent" }), "the report");
  assert.equal(seen.length, 1);
  assert.equal(seen[0], delegation, "the plugin's own delegation object reaches the runtime");
  await plugin.dispose();
});

test("the runtime refuses to start without delegation", () => {
  const client = fakeClient();
  assert.throws(
    () => createWorkflowRuntime({ client, directory: "/d", parentSessionID: "ses_parent", store: fakeStore(), manager: managed(client) }),
    { message: "workflows requires PluginInput.delegation" },
  );
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `node --test --test-name-pattern="PluginInput\.delegation|without delegation" tests/workflows.test.mjs`
Expected: FAIL, exactly these three tests run and all three fail:
- "without PluginInput.delegation ..." rejects with the message mismatch: actual `no workflow named "any"; available: none` (the base plugin discovers and finds nothing);
- "with PluginInput.delegation ..." fails `assert.equal(seen[0], delegation)` with actual `undefined` (the base plugin does not pass `delegation` to `runtimeFactory`);
- "the runtime refuses to start without delegation" reports `Missing expected exception.`

- [ ] **Step 8: Implement the threading**

`lib/core.js` -- replace lines 13-14:
```js
export const createWorkflowPlugin = ({
  client, directory, tool,
```
with:
```js
export const createWorkflowPlugin = ({
  client, directory, tool, delegation,
```
Insert directly after the last import, `import { backgroundSubagentsEnabled } from "./team-flag.js";` (line 11):
```js

// RECONCILE R3 (decided 2026-10-08): without PluginInput.delegation (the Plan 1
// DelegationBranchApi) the plugin degrades instead of refusing to load. Teams, team
// recovery, the tool.execute.before hook and every other tool keep working; only
// workflow_run, whose children must be fenced delegation branches, is refused.
const WORKFLOW_RUN_NEEDS_DELEGATION = "workflow_run requires PluginInput.delegation, which this opencode host does not provide";
```
Do NOT add any statement that throws on a missing `delegation` to the body of `createWorkflowPlugin`.

In `workflow_run`'s `execute` (currently lines 227-228), replace:
```js
        async execute(toolArgs, ctx) {
          const workflows = await discover(directory);
          const workflow = workflows.get(toolArgs.name);
```
with:
```js
        async execute(toolArgs, ctx) {
          // First statement, before discovery and before the background branch, so a
          // background run is refused here too instead of failing later in a report.
          if (!delegation) throw new Error(WORKFLOW_RUN_NEEDS_DELEGATION);
          const workflows = await discover(directory);
          const workflow = workflows.get(toolArgs.name);
```
(The three-line match is unique: `workflow_list`'s `execute` also calls `discover(directory)` but takes no `toolArgs`.)

and replace lines 50-53:
```js
    const runtime = runtimeFactory({
      client, directory, parentSessionID, workflowName: workflow.meta.name,
      resume: resume === true, manager,
    });
```
with:
```js
    const runtime = runtimeFactory({
      client, directory, parentSessionID, workflowName: workflow.meta.name,
      resume: resume === true, manager, delegation,
    });
```

`lib/runtime.js` -- replace lines 122-123:
```js
export const createWorkflowRuntime = ({
  client, directory, parentSessionID, workflowName = "workflow",
```
with:
```js
export const createWorkflowRuntime = ({
  client, directory, parentSessionID, workflowName = "workflow", delegation,
```
and insert directly before `  pruneCache(workflowName);` (line 131):
```js
  // Checked before anything touches disk: every child this runtime creates is a fenced
  // delegation branch, so a runtime without the API must not start at all.
  if (!delegation) throw new Error("workflows requires PluginInput.delegation");
```

`plugin.js` -- replace lines 15-16:
```js
export const Workflows = async ({ client, directory } = {}) =>
  createWorkflowPlugin({ client, directory, tool: await loadTool() });
```
with:
```js
export const Workflows = async ({ client, directory, delegation } = {}) =>
  createWorkflowPlugin({ client, directory, delegation, tool: await loadTool() });
```
(No test calls `Workflows()` itself: it loads the real `@opencode-ai/plugin` tool helper from `~/.config/opencode/node_modules`. The pass-through is checked by reading the diff in review.)

- [ ] **Step 9: Run the full suite to verify it passes**

Run: `node --test tests/*.mjs`
Expected: PASS, `# fail 0`; the three Step 6 tests pass. Also run `grep -n 'requires PluginInput.delegation' lib/core.js` and expect exactly one line, the `WORKFLOW_RUN_NEEDS_DELEGATION` constant (no load-time guard).

- [ ] **Step 10: Commit**

```bash
git add tests/fixtures/delegation.mjs tests/delegation.test.mjs tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs lib/core.js lib/runtime.js plugin.js
git commit -m "Thread PluginInput.delegation into the workflow plugin and runtime; without it only workflow_run is refused, with a shared DelegationBranchApi test fake"
```

### Task 2: `lib/delegation.js` participant lifecycle, wired into plugin init and dispose

**Files:**
- Create: `lib/delegation.js`
- Modify: `lib/core.js` (options list, first statement of the factory body, and the returned hooks object)
- Test: `tests/delegation.test.mjs` (append), `tests/workflows.test.mjs` (append)

**Interfaces:**
- Consumes: `fakeDelegation`, `fakeTimers` from Task 1; `createWorkflowPlugin({ delegation })` from Task 1.
- Produces (exact contract names, no other exports):
  - `WORKFLOWS_BUILD_ID = "opencode-agent-workflows@0.15.0"`
  - `DELEGATION_PROTOCOL = "opencode.delegation/v1"`
  - `WORKFLOWS_PARTICIPANT` (frozen; frozen `capabilities`)
  - `PARTICIPANT_HEARTBEAT_MS = 2000`
  - `createParticipantLifecycle({ delegation, setInterval, clearInterval }) -> { start(): Promise<ParticipantStatus>, stop(): void }`
  - `acknowledgeInput(branch) -> { branch, ownerComponent: "workflows", ownerBuildID: WORKFLOWS_BUILD_ID, protocol: DELEGATION_PROTOCOL }`
  - `createWorkflowPlugin` gains option `participantTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval }` and extends 0.13.0's existing `dispose: async () => void` hook (which already awaits `teams.stop()`) so it also stops the heartbeat (Design decision 18). Inside the factory the closure constant `participantReady` (the promise from `lifecycle.start()`) is what Task 4 and Task 6 await before reserving or recovering branches.

- [ ] **Step 1: Write the failing lifecycle tests**

Append to `tests/delegation.test.mjs` (add the import line next to the existing imports at the top of the file):
```js
import { DELEGATION_PROTOCOL, PARTICIPANT_HEARTBEAT_MS, WORKFLOWS_BUILD_ID, WORKFLOWS_PARTICIPANT, acknowledgeInput, createParticipantLifecycle } from "../lib/delegation.js";
```
```js
const lifecycleWith = (delegation, timers) =>
  createParticipantLifecycle({ delegation, setInterval: timers.setInterval, clearInterval: timers.clearInterval });

const goodStatus = () => ({
  coordinationDomain: "domain_test", component: "workflows", buildID: "opencode-agent-workflows@0.15.0",
  protocol: "opencode.delegation/v1",
  capabilities: ["terminalHandoffV1", "registeredBranchV1", "foregroundDeliveryV1", "backgroundDeliveryV1"],
  availability: "available", heartbeatAt: 1000, worker: { workerID: "worker_test", workerEpoch: "epoch_test" },
});

test("the participant constants are exactly the contract values", () => {
  assert.equal(WORKFLOWS_BUILD_ID, "opencode-agent-workflows@0.15.0");
  assert.equal(DELEGATION_PROTOCOL, "opencode.delegation/v1");
  assert.equal(PARTICIPANT_HEARTBEAT_MS, 2000);
  assert.deepEqual(WORKFLOWS_PARTICIPANT, {
    component: "workflows", buildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1",
    capabilities: ["backgroundDeliveryV1", "foregroundDeliveryV1", "registeredBranchV1", "terminalHandoffV1"],
  });
  assert.equal(Object.isFrozen(WORKFLOWS_PARTICIPANT), true);
  assert.equal(Object.isFrozen(WORKFLOWS_PARTICIPANT.capabilities), true);
});

test("start registers exactly the participant input, with no host-injected fields", async () => {
  const order = [];
  const timers = fakeTimers();
  const status = await lifecycleWith(fakeDelegation({ order }), timers).start();
  assert.deepEqual(order, [["registerParticipant", {
    component: "workflows", buildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1",
    capabilities: ["backgroundDeliveryV1", "foregroundDeliveryV1", "registeredBranchV1", "terminalHandoffV1"],
  }]]);
  assert.equal(status.availability, "available");
});

test("start accepts the registered capabilities in any order", async () => {
  const delegation = fakeDelegation();
  delegation.registerParticipant = async () => goodStatus();
  assert.deepEqual(await lifecycleWith(delegation, fakeTimers()).start(), goodStatus());
});

test("a registration mismatch in any checked field throws and installs no heartbeat", async () => {
  for (const [field, value] of [
    ["component", "guard"],
    ["buildID", "opencode-agent-workflows@0.12.4"],
    ["protocol", "opencode.delegation/v0"],
    ["capabilities", ["backgroundDeliveryV1", "foregroundDeliveryV1", "registeredBranchV1"]],
    ["availability", "unavailable"],
  ]) {
    const delegation = fakeDelegation();
    delegation.registerParticipant = async () => ({ ...goodStatus(), [field]: value });
    const timers = fakeTimers();
    await assert.rejects(lifecycleWith(delegation, timers).start(), { message: `workflows participant registration mismatch: ${field}` });
    assert.deepEqual(timers.calls, [], `no interval after a ${field} mismatch`);
  }
  const delegation = fakeDelegation();
  delegation.registerParticipant = async () => null;
  await assert.rejects(lifecycleWith(delegation, fakeTimers()).start(), { message: "workflows participant registration mismatch: status" });
});

test("start heartbeats every 2000 ms with the participant input and stop clears the interval", async () => {
  const order = [];
  const timers = fakeTimers();
  const lifecycle = lifecycleWith(fakeDelegation({ order }), timers);
  await lifecycle.start();
  assert.deepEqual(timers.calls, [["setInterval", 2000]]);
  const [handle] = [...timers.active.keys()];
  assert.equal(handle.unrefed, true, "the heartbeat must not keep the process alive");
  timers.tick();
  timers.tick();
  lifecycle.stop();
  timers.tick();
  assert.deepEqual(timers.calls, [["setInterval", 2000], ["clearInterval", 1]]);
  assert.equal(timers.active.size, 0);
  assert.deepEqual(order, [
    ["registerParticipant", WORKFLOWS_PARTICIPANT],
    ["heartbeatParticipant", WORKFLOWS_PARTICIPANT],
    ["heartbeatParticipant", WORKFLOWS_PARTICIPANT],
  ]);
  lifecycle.stop();
  assert.deepEqual(timers.calls, [["setInterval", 2000], ["clearInterval", 1]], "a second stop is a no-op");
});

test("stop before registration resolves installs no heartbeat", async () => {
  let resolveRegistration;
  const delegation = fakeDelegation();
  delegation.registerParticipant = () => new Promise((resolve) => { resolveRegistration = resolve; });
  const timers = fakeTimers();
  const lifecycle = lifecycleWith(delegation, timers);
  const started = lifecycle.start();
  lifecycle.stop();
  resolveRegistration(goodStatus());
  assert.deepEqual(await started, goodStatus());
  assert.deepEqual(timers.calls, []);
});

test("start cannot run twice", async () => {
  const lifecycle = lifecycleWith(fakeDelegation(), fakeTimers());
  await lifecycle.start();
  await assert.rejects(lifecycle.start(), { message: "workflows participant lifecycle cannot start from running" });
});

test("a heartbeat failure is reported and the interval keeps running", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const order = [];
  const timers = fakeTimers();
  await lifecycleWith(fakeDelegation({ fail: { heartbeatParticipant: new Error("core restarting") }, order }), timers).start();
  timers.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [["workflows participant heartbeat failed: core restarting"]]);
  assert.equal(timers.active.size, 1);
});

test("acknowledgeInput builds the AcknowledgeBranchInput for a branch", () => {
  const branch = { ...fakeExecution("ses_p"), branchID: "branch_1", branchFencingToken: 1 };
  assert.deepEqual(acknowledgeInput(branch), {
    branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1",
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/delegation.test.mjs`
Expected: FAIL, the file errors with `ERR_MODULE_NOT_FOUND` naming `lib/delegation.js` (the Task 1 fixture tests in the same file fail with it; that is expected for this step only).

- [ ] **Step 3: Implement `lib/delegation.js`**

Create `lib/delegation.js`:
```js
// The workflows side of the Plan 1 delegation protocol: who this plugin is to core
// (WORKFLOWS_PARTICIPANT), keeping that registration alive, and the acknowledgement
// input for a branch it owns. The host injects worker, coordinationDomain and
// heartbeatAt; nothing here may send them.
export const WORKFLOWS_BUILD_ID = "opencode-agent-workflows@0.15.0";
export const DELEGATION_PROTOCOL = "opencode.delegation/v1";
export const WORKFLOWS_PARTICIPANT = Object.freeze({
  component: "workflows",
  buildID: WORKFLOWS_BUILD_ID,
  protocol: DELEGATION_PROTOCOL,
  capabilities: Object.freeze(["backgroundDeliveryV1", "foregroundDeliveryV1", "registeredBranchV1", "terminalHandoffV1"]),
});
export const PARTICIPANT_HEARTBEAT_MS = 2000;

const errorText = (error) => String(error?.message ?? error);
const mismatch = (field) => new Error(`workflows participant registration mismatch: ${field}`);
const sortedKey = (list) => JSON.stringify([...list].sort());

// Core answers with what it actually stored. Anything other than this exact identity,
// available, means core and this build disagree about who we are: refuse to proceed.
const verifyRegistration = (status) => {
  if (status === null || typeof status !== "object") throw mismatch("status");
  for (const field of ["component", "buildID", "protocol"]) {
    if (status[field] !== WORKFLOWS_PARTICIPANT[field]) throw mismatch(field);
  }
  if (!Array.isArray(status.capabilities) || sortedKey(status.capabilities) !== sortedKey(WORKFLOWS_PARTICIPANT.capabilities)) {
    throw mismatch("capabilities");
  }
  if (status.availability !== "available") throw mismatch("availability");
};

export const createParticipantLifecycle = ({ delegation, setInterval, clearInterval }) => {
  // idle -> starting -> running; stop() moves any state to stopped.
  let state = "idle";
  let timer = null;
  const beat = async () => {
    try {
      await delegation.heartbeatParticipant(WORKFLOWS_PARTICIPANT);
    } catch (error) {
      // A missed beat is not fatal: core marks the participant stale on its own clock,
      // and the next beat retries. Report it so a dead core is visible.
      console.error(`workflows participant heartbeat failed: ${errorText(error)}`);
    }
  };
  return {
    async start() {
      if (state !== "idle") throw new Error(`workflows participant lifecycle cannot start from ${state}`);
      state = "starting";
      const status = await delegation.registerParticipant(WORKFLOWS_PARTICIPANT);
      verifyRegistration(status);
      // dispose may have run while registration was in flight; never install a timer after it.
      if (state === "stopped") return status;
      timer = setInterval(() => { void beat(); }, PARTICIPANT_HEARTBEAT_MS);
      // A Node Timeout must not hold the process open after opencode is done with us.
      if (typeof timer?.unref === "function") timer.unref();
      state = "running";
      return status;
    },
    stop() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      state = "stopped";
    },
  };
};

export const acknowledgeInput = (branch) => ({
  branch,
  ownerComponent: "workflows",
  ownerBuildID: WORKFLOWS_BUILD_ID,
  protocol: DELEGATION_PROTOCOL,
});
```

- [ ] **Step 4: Run the lifecycle tests to verify they pass**

Run: `node --test tests/delegation.test.mjs`
Expected: PASS, `# pass 15`, `# fail 0`.

- [ ] **Step 5: Write the failing plugin wiring test**

Add to the imports at the top of `tests/workflows.test.mjs`:
```js
import { WORKFLOWS_PARTICIPANT } from "../lib/delegation.js";
```
Append to the end of `tests/workflows.test.mjs`:
```js
test("the plugin registers as a delegation participant on init and stops heartbeating on dispose", async () => {
  const order = [];
  const timers = fakeTimers();
  const client = fakeClient();
  const plugin = createWorkflowPlugin({
    delegation: fakeDelegation({ order }), participantTimers: timers,
    client, directory: "/d", tool: fakeTool, discover: async () => new Map(), manager: managed(client),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, [["registerParticipant", WORKFLOWS_PARTICIPANT]]);
  assert.deepEqual(timers.calls, [["setInterval", 2000]]);
  timers.tick();
  assert.deepEqual(order, [["registerParticipant", WORKFLOWS_PARTICIPANT], ["heartbeatParticipant", WORKFLOWS_PARTICIPANT]]);
  assert.equal(typeof plugin.dispose, "function");
  await plugin.dispose();
  assert.deepEqual(timers.calls, [["setInterval", 2000], ["clearInterval", 1]]);
  assert.equal(timers.active.size, 0);
});

test("a failed participant registration is reported at plugin init", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const client = fakeClient();
  createWorkflowPlugin({
    delegation: fakeDelegation({ fail: { registerParticipant: new Error("core unavailable") } }), participantTimers: fakeTimers(),
    client, directory: "/d", tool: fakeTool, discover: async () => new Map(), manager: managed(client),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    errors.mock.calls.map((call) => call.arguments).filter(([text]) => String(text).startsWith("workflows participant")),
    [["workflows participant registration failed: core unavailable"]],
  );
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `node --test --test-name-pattern="participant" tests/workflows.test.mjs`
Expected: FAIL. The first test fails its first `deepEqual` with actual `[]` (nothing registers yet); the second fails its `deepEqual` with actual `[]` (nothing is reported).

- [ ] **Step 7: Wire the lifecycle into `lib/core.js`**

Add the import after `import { createLoopGuard } from "./loop-guard.js";` (line 9):
```js
import { createParticipantLifecycle } from "./delegation.js";
```
Add the option as the last entry of the options list, directly after `  backgroundSubagents = backgroundSubagentsEnabled(),` (0.13.0 added that option after `loopParentOf`; Tasks 5 and 8 anchor on `participantTimers` being the last option):
```js
  participantTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval },
```
Insert as the first statement of the function body, directly after `}) => {` and before `  const notifier = createNotifier({ client, directory });` (Task 1 added no statement there; RECONCILE R3):
```js
  // Register as the `workflows` participant for as long as this plugin instance lives.
  // participantReady keeps the original promise so branch code (Task 4) and startup recovery
  // (Task 6) can await it and see a registration failure; the catch below only reports it.
  // Without delegation (RECONCILE R3) there is no lifecycle and participantReady rejects
  // with the workflow_run refusal, so every gated path is skipped; the reporter below logs it
  // here and Task 6's startup pass 2 logs its own skip.
  const lifecycle = delegation ? createParticipantLifecycle({
    delegation,
    setInterval: participantTimers.setInterval,
    clearInterval: participantTimers.clearInterval,
  }) : null;
  const participantReady = lifecycle ? lifecycle.start() : Promise.reject(new Error(WORKFLOW_RUN_NEEDS_DELEGATION));
  participantReady.catch((error) => {
    console.error(`workflows participant registration failed: ${String(error?.message ?? error)}`);
  });
```
In the returned hooks object, replace 0.13.0's existing `dispose` key (currently line 83, directly after the `'tool.execute.before'` hook). Do NOT add a second `dispose` key: a later duplicate key silently replaces the earlier one, which would drop either team retirement or the heartbeat stop (Design decision 18). Replace:
```js
    dispose: async () => { await teams.stop(); },
```
with:
```js
    // opencode's Hooks.dispose: the instance is going away. Stop heartbeating first and
    // synchronously (no interval may outlive dispose), then retire this process's
    // teammates; the finally keeps a throwing stop from skipping team retirement.
    // A plugin without delegation has no lifecycle (RECONCILE R3).
    dispose: async () => {
      try { lifecycle?.stop(); } finally { await teams.stop(); }
    },
```

- [ ] **Step 8: Run the full suite to verify it passes**

Run: `node --test tests/*.mjs`
Expected: PASS, `# fail 0`. (Every pre-existing plugin test now registers against its `fakeDelegation()` and installs a real but `unref()`ed interval, so the runner does not hang. The four `tests/team-tools.mjs` plugins await `plugin.dispose()`, and the first two then assert that their team timers or intents are gone, which pins that the merged hook still runs `teams.stop()`.)

- [ ] **Step 9: Commit**

```bash
git add lib/delegation.js lib/core.js tests/delegation.test.mjs tests/workflows.test.mjs
git commit -m "Register workflows as a delegation participant at plugin init, heartbeat every 2s, stop on dispose"
```

### Task 3: Participant records in the child registry (`lib/child-session.js`)

**Files:**
- Modify: `lib/child-session.js` (module-level participant helpers directly after `validIntent`; `jsonNames()` inside `createChildRegistry`; the `participants` view directly before the returned object, and one key in that object)
- Create: `tests/participant-records.test.mjs`

Participant records are a record kind of the child registry (RECONCILE R1); this task creates no other module. `lib/child-session.js` is unchanged by Tasks 1 and 2, so the quoted "old" text below is the file at BASE.

**Interfaces:**
- Consumes: the registry internals named in the header's Verified facts ("Child registry internals Task 3 builds on"): `lock`, `writeAtomic`, `clearTemps` (run by every `lock` acquisition), `ownerState`, `claimed`, `RETIRE_LEASE_MS`, `VERSION`, `errorText` and the `now` option of `createChildRegistry`. The test uses `fakeExecution` from the Task 1 fixture.
- Produces: `createChildRegistry(...)` returns one more key, `participants`, a frozen object with exactly these six methods (Task 6 later adds a seventh, `prune`; this task does not) (record fields exactly: `runID, delivery, branch, ownerExecution, childSessionID, registryReservationID, agent, prompt, directory, state, promptStartedAt, promptedAt, outcomeID, blocked, reportDelivery, ownerPID`; unknown fields are refused; `ownerPID` is a required positive integer, the dispatching `process.pid`):
  - `write(record) -> record` -- refuses an unsafe branch ID, validates, then under the registry lock writes the envelope `{ version: 1, source: "participant", ...record }` (no lease) to `<root>/participant-<branch.branchID>.json` with the registry's `writeAtomic` (mode 0600). Throws `Error("participant record write failed for <branchID>: <cause>")` on ANY lock or write error and `Error("invalid participant record: <field>")` on a malformed record.
  - `get(branchID) -> record | null` -- lockless; null only when the file does not exist (ENOENT); `Error("participant record read failed for <branchID>: <cause>")` on any other read error, `Error("participant record <branchID> is corrupt: <cause>")` on bad JSON, a wrong envelope, an invalid record or a malformed lease, `Error("participant record <branchID> holds branch <other>")` on a mismatched file.
  - `list() -> record[]` -- under the lock, every participant record sorted by `branch.branchID`; throws exactly as `get` does (and `Error("participant record list failed: <cause>")` when the lock or the directory read fails), never answers `[]` on an error.
  - `update(branchID, patch) -> record` -- under the lock: read, shallow merge, validate, write; keeps the envelope and any lease. Throws `Error("no participant record for <branchID>")` if absent, `Error("participant record update cannot change branch <branchID>")` if the patch moves the branch, `Error("participant record update for <branchID> needs an object patch")` for a non-object patch.
  - `claim(branchID, claimant, leaseMs = RETIRE_LEASE_MS) -> record | null` -- under the lock: null for an absent record, for `ownerState(record.ownerPID) !== "missing"` and for a foreign unexpired lease (`claim?.claimant !== claimant && Number(claim?.leaseUntil) > now()`); otherwise writes `retirement: { claimant, leaseUntil: now() + leaseMs }` and returns the stripped record. Throws `Error("participant record claim for <branchID> needs a claimant and a positive lease")` for an empty claimant or a non-positive / non-finite `leaseMs`.
  - `release(branchID, claimant) -> boolean` -- under the lock: removes the `retirement` field and returns true only if `claimed(record, claimant)` (holder and unexpired); otherwise false. Throws `Error("participant record release for <branchID> needs a claimant")` for an empty claimant.
  - Every method refuses an unsafe branch ID (`/^[A-Za-z0-9_-]{1,128}$/`) with `Error("participant record refuses branch ID <JSON.stringify(branchID)>")` before any path is built; `get` and `list` never return `version`, `source` or `retirement`.
  - `jsonNames()` skips names starting with `participant-`, so reservation, intent and capacity scans neither read nor count participant records; `validRecord`, `validReservation` and `validIntent` are unchanged.

- [ ] **Step 1: Write the failing participant-record tests**

Create `tests/participant-records.test.mjs`:
```js
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createChildRegistry } from "../lib/child-session.js";
import { fakeExecution } from "./fixtures/delegation.mjs";

// No process holds this PID (it is above every pid_max), so kill(pid, 0) answers ESRCH.
const DEAD_PID = 2147483647;
// RETIRE_LEASE_MS in lib/child-session.js (a module constant, not exported).
const LEASE_MS = 3 * 60_000;
const CLAIMANT_A = `${process.pid}-claimant-a`;
const CLAIMANT_B = `${process.pid}-claimant-b`;
const START = 1_000_000;

// One scratch registry root per test, removed when the test ends. The registry clock is
// injected, so lease expiry is a variable, not a wait.
const open = (t) => {
  const root = mkdtempSync(join(tmpdir(), "wf-participants-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const time = { now: START };
  const registry = createChildRegistry({ root, now: () => time.now });
  const file = (branchID) => join(root, `participant-${branchID}.json`);
  const raw = (branchID) => JSON.parse(readFileSync(file(branchID), "utf8"));
  const temps = () => readdirSync(root).filter((name) => name.endsWith(".tmp"));
  return { root, time, registry, participants: registry.participants, file, raw, temps };
};

const record = (overrides = {}) => {
  const ownerExecution = fakeExecution("ses_parent");
  return {
    runID: "run-test", delivery: "foreground",
    branch: { ...ownerExecution, branchID: "branch_1", branchFencingToken: 1 },
    ownerExecution, childSessionID: "ses_child1", registryReservationID: "3b241101-e2bb-4255-8caf-4136c566a962",
    agent: "scout", prompt: "read lib/core.js", directory: "/d", state: "registered",
    promptStartedAt: null, promptedAt: null, outcomeID: null, blocked: false, reportDelivery: "none",
    ownerPID: process.pid,
    ...overrides,
  };
};
const onBranch = (branchID, overrides = {}) =>
  record({ branch: { ...record().branch, branchID, branchFencingToken: 1 }, ...overrides });
const envelope = (value) => ({ version: 1, source: "participant", ...value });

test("participant records round-trip through the child registry and survive a fresh registry", (t) => {
  const { root, participants, raw } = open(t);
  assert.deepEqual(participants.list(), []);
  assert.ok(Object.isFrozen(participants));
  assert.deepEqual(Object.keys(participants).sort(), ["claim", "get", "list", "release", "update", "write"]);
  assert.equal(participants.get("branch_1"), null);
  assert.deepEqual(participants.write(record()), record());
  assert.deepEqual(participants.get("branch_1"), record());
  assert.deepEqual(readdirSync(root).filter((name) => name.endsWith(".json")), ["participant-branch_1.json"]);
  assert.deepEqual(raw("branch_1"), envelope(record()), "the file holds the envelope, read raw");
  assert.equal(statSync(join(root, "participant-branch_1.json")).mode & 0o777, 0o600);
  assert.equal(existsSync(join(root, ".lock")), false, "the registry lock is released");
  const second = onBranch("branch_0", { delivery: "background" });
  participants.write(second);
  assert.deepEqual(participants.list(), [second, record()]);
  const updated = participants.update("branch_1", { state: "prompting", promptStartedAt: 1234 });
  assert.deepEqual(updated, record({ state: "prompting", promptStartedAt: 1234 }));
  assert.deepEqual(raw("branch_1"), envelope(updated));
  const fresh = createChildRegistry({ root }).participants;
  assert.deepEqual(fresh.get("branch_1"), updated, "a fresh registry reads the durable copy");
  assert.deepEqual(fresh.list(), [second, updated]);
});

test("participant records require Plan 1 numeric fence tokens", (t) => {
  const { participants } = open(t);
  const numeric = record();
  participants.write(numeric);
  assert.deepEqual(participants.get("branch_1"), numeric, "fakeExecution supplies numeric tokens");
  assert.throws(() => participants.write(record({ ownerExecution: { ...fakeExecution("ses_parent"), fencingToken: "1" } })), { message: "invalid participant record: ownerExecution" });
  assert.throws(() => participants.write(record({ branch: { ...record().branch, branchFencingToken: "1" } })), { message: "invalid participant record: branch" });
  for (const token of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => participants.write(record({ ownerExecution: { ...fakeExecution("ses_parent"), fencingToken: token } })), { message: "invalid participant record: ownerExecution" });
    assert.throws(() => participants.write(record({ branch: { ...record().branch, branchFencingToken: token } })), { message: "invalid participant record: branch" });
  }
});

test("participant records are invisible to child, reservation, intent and capacity scans", (t) => {
  const { root, registry, participants } = open(t);
  participants.write(record());
  assert.deepEqual(registry.list({ quarantined: true }), []);
  assert.equal(registry.read("ses_child1"), null);
  assert.deepEqual(registry.listReservations({ quarantined: true }), []);
  assert.deepEqual(registry.listIntents({ quarantined: true }), []);
  // Decoys carrying the participant prefix whose content WOULD pass validReservation or
  // validIntent: only the jsonNames() prefix skip keeps them out of the scans. 1024 of them
  // would fill CAPACITY if recordCount() read them.
  const decoy = { version: 1, reservation: true, reservationState: "reserved", ownerPID: process.pid, parentSessionID: "ses_parent", source: "workflow", mode: "foreground" };
  for (let i = 0; i < 1024; i += 1) writeFileSync(join(root, `participant-decoy${i}.json`), JSON.stringify({ ...decoy, reservationID: `decoy-${i}` }));
  writeFileSync(join(root, "participant-intent.json"), JSON.stringify({ version: 1, intent: true, sessionID: "ses_child1", parentSessionID: "ses_parent" }));
  assert.deepEqual(registry.listReservations({ quarantined: true }), []);
  assert.deepEqual(registry.listIntents({ quarantined: true }), []);
  const reserved = registry.reserve({ parentSessionID: "ses_parent", source: "workflow", mode: "foreground", directory: "/d" });
  assert.deepEqual(registry.listReservations().map((entry) => entry.reservationID), [reserved.reservationID]);
});

test("a participant write sweeps stale temp files under the registry lock", (t) => {
  const { root, participants, temps } = open(t);
  // What a crash between open and rename leaves behind, from any record kind.
  const plant = () => {
    writeFileSync(join(root, ".record.999999.stale.tmp"), "partial");
    writeFileSync(join(root, ".ses_x.999999.stale.tmp"), "partial");
  };
  plant();
  participants.write(record());
  assert.deepEqual(temps(), [], "write swept every temp file");
  assert.equal(existsSync(join(root, ".lock")), false, "write released the registry lock");
  plant();
  assert.deepEqual(participants.get("branch_1"), record());
  assert.equal(temps().length, 2, "get is lockless and sweeps nothing");
  participants.update("branch_1", { state: "acknowledged" });
  assert.deepEqual(temps(), [], "update swept every temp file");
  plant();
  assert.deepEqual(participants.list(), [record({ state: "acknowledged" })]);
  assert.deepEqual(temps(), [], "list holds the lock too");
  assert.equal(existsSync(join(root, ".lock")), false);
  assert.equal(statSync(join(root, "participant-branch_1.json")).mode & 0o777, 0o600);
});

test("write and update fail loudly on I/O errors and leave the record unchanged", (t) => {
  assert.notEqual(process.getuid(), 0, "this test needs a non-root user: root ignores directory write permission");
  const { root, participants, file, temps } = open(t);
  // A directory where the record file belongs: the temp file is written, the rename fails.
  mkdirSync(file("branch_1"));
  assert.throws(() => participants.write(record()), { message: /^participant record write failed for branch_1: EISDIR/ });
  assert.deepEqual(temps(), [], "the failed write removed its temp file");
  assert.equal(existsSync(join(root, ".lock")), false, "the failed write released the lock");
  rmSync(file("branch_1"), { recursive: true });
  participants.write(record());
  // A read-only root: the registry lock (mkdir <root>/.lock) cannot be taken.
  chmodSync(root, 0o500);
  try {
    assert.throws(() => participants.update("branch_1", { state: "acknowledged" }), { message: /^participant record write failed for branch_1: EACCES/ });
    assert.throws(() => participants.write(record({ state: "acknowledged" })), { message: /^participant record write failed for branch_1: EACCES/ });
  } finally { chmodSync(root, 0o700); }
  assert.deepEqual(participants.get("branch_1"), record());
  assert.deepEqual(readdirSync(root), ["participant-branch_1.json"]);
});

test("corrupt or mismatched participant records throw on get and list", (t) => {
  const { registry, participants, file } = open(t);
  writeFileSync(file("branch_1"), "{not json");
  assert.throws(() => participants.get("branch_1"), { message: /^participant record branch_1 is corrupt: / });
  assert.throws(() => participants.list(), { message: /^participant record branch_1 is corrupt: / });
  assert.deepEqual(registry.list(), [], "the child list() is unaffected by a corrupt participant record");
  // A valid record without the envelope is not a participant record.
  writeFileSync(file("branch_1"), JSON.stringify(record()));
  assert.throws(() => participants.get("branch_1"), { message: "participant record branch_1 is corrupt: not a version 1 participant envelope" });
  writeFileSync(file("branch_1"), JSON.stringify(envelope(record({ state: "done" }))));
  assert.throws(() => participants.get("branch_1"), { message: "participant record branch_1 is corrupt: invalid participant record: state" });
  writeFileSync(file("branch_1"), JSON.stringify({ ...envelope(record()), retirement: { claimant: CLAIMANT_A } }));
  assert.throws(() => participants.get("branch_1"), { message: "participant record branch_1 is corrupt: malformed retirement lease" });
  // A valid record filed under another branch's name.
  writeFileSync(file("branch_1"), JSON.stringify(envelope(onBranch("branch_2"))));
  assert.throws(() => participants.get("branch_1"), { message: "participant record branch_1 holds branch branch_2" });
  assert.throws(() => participants.list(), { message: "participant record branch_1 holds branch branch_2" });
  // An unreadable file is an I/O error, never an absent record.
  rmSync(file("branch_1"));
  mkdirSync(file("branch_1"));
  assert.throws(() => participants.get("branch_1"), { message: /^participant record read failed for branch_1: EISDIR/ });
  assert.throws(() => participants.list(), { message: /^participant record read failed for branch_1: EISDIR/ });
});

test("update refuses an absent record and a branch change, and keeps the envelope", (t) => {
  const { root, participants, raw } = open(t);
  assert.throws(() => participants.update("branch_missing", { state: "acknowledged" }), { message: "no participant record for branch_missing" });
  assert.deepEqual(readdirSync(root), [], "a refused update creates nothing");
  participants.write(record());
  assert.throws(() => participants.update("branch_1", { branch: onBranch("branch_7").branch }), { message: "participant record update cannot change branch branch_1" });
  // A patch cannot reach the envelope or the lease: they are not record fields.
  assert.throws(() => participants.update("branch_1", { retirement: { claimant: CLAIMANT_A, leaseUntil: START } }), { message: "invalid participant record: fields" });
  assert.throws(() => participants.update("branch_1", { source: "workflow" }), { message: "invalid participant record: fields" });
  assert.throws(() => participants.update("branch_1", null), { message: "participant record update for branch_1 needs an object patch" });
  assert.deepEqual(participants.get("branch_1"), record());
  assert.deepEqual(participants.update("branch_1", { state: "acknowledged" }), record({ state: "acknowledged" }));
  assert.deepEqual(raw("branch_1"), envelope(record({ state: "acknowledged" })));
});

test("invalid participant records are refused field by field", (t) => {
  const { root, participants } = open(t);
  const { childSessionID: _omitted, ...missing } = record();
  const { ownerPID: _omittedOwnerPID, ...missingOwnerPID } = record();
  for (const [bad, field] of [
    [missing, "fields"],
    [missingOwnerPID, "fields"],
    [{ ...record(), extra: 1 }, "fields"],
    [{ ...record(), version: 1 }, "fields"],
    [record({ delivery: "sideways" }), "delivery"],
    [record({ state: "done" }), "state"],
    [record({ reportDelivery: "sent" }), "reportDelivery"],
    [record({ blocked: "no" }), "blocked"],
    [record({ promptStartedAt: "now" }), "promptStartedAt"],
    [record({ promptedAt: Number.NaN }), "promptedAt"],
    [record({ outcomeID: "" }), "outcomeID"],
    [record({ runID: "" }), "runID"],
    [record({ directory: "" }), "directory"],
    [record({ prompt: 7 }), "prompt"],
    [record({ ownerExecution: { ...fakeExecution("ses_parent"), fencingToken: undefined } }), "ownerExecution"],
    [record({ branch: { ...fakeExecution("ses_parent"), branchID: "branch_1" } }), "branch"],
    [record({ registryReservationID: "branch_1" }), "registryReservationID"],
    [record({ ownerPID: undefined }), "ownerPID"],
    [record({ ownerPID: null }), "ownerPID"],
    [record({ ownerPID: 0 }), "ownerPID"],
    [record({ ownerPID: -1 }), "ownerPID"],
    [record({ ownerPID: 1.5 }), "ownerPID"],
    [record({ ownerPID: "1" }), "ownerPID"],
    [record({ ownerPID: Number.NaN }), "ownerPID"],
    [record({ ownerPID: Number.POSITIVE_INFINITY }), "ownerPID"],
  ]) {
    assert.throws(() => participants.write(bad), { message: `invalid participant record: ${field}` }, `expected ${field} to be refused`);
  }
  participants.write(record());
  assert.throws(() => participants.update("branch_1", { state: "done" }), { message: "invalid participant record: state" });
  assert.deepEqual(participants.get("branch_1"), record());
  assert.deepEqual(readdirSync(root), ["participant-branch_1.json"]);
});

test("unsafe branch IDs are refused before any path is built", (t) => {
  const { root, participants } = open(t);
  for (const branchID of ["../escape", "a/b", "", ".hidden", "x".repeat(129)]) {
    const message = `participant record refuses branch ID ${JSON.stringify(branchID)}`;
    assert.throws(() => participants.get(branchID), { message });
    assert.throws(() => participants.update(branchID, {}), { message });
    assert.throws(() => participants.claim(branchID, CLAIMANT_A), { message });
    assert.throws(() => participants.release(branchID, CLAIMANT_A), { message });
  }
  assert.throws(() => participants.write(record({ branch: { ...record().branch, branchID: "../escape" } })), { message: 'participant record refuses branch ID "../escape"' });
  assert.deepEqual(readdirSync(root), [], "no file, temp file or lock was created");
});

test("claim takes a dead owner's record with the registry lease and declines live owners and live foreign leases", (t) => {
  assert.throws(() => process.kill(DEAD_PID, 0), (e) => e?.code === "ESRCH");
  const { time, participants, raw } = open(t);
  const dead = record({ ownerPID: DEAD_PID });
  const live = onBranch("branch_2");
  // PID 1 always exists: kill(1, 0) is EPERM (ownerState "unknown") or succeeds ("live").
  const unverifiable = onBranch("branch_3", { ownerPID: 1 });
  for (const value of [dead, live, unverifiable]) participants.write(value);
  assert.equal(participants.claim("branch_missing", CLAIMANT_A), null);
  assert.equal(participants.claim("branch_2", CLAIMANT_A), null, "a live owner is never claimed");
  assert.equal(participants.claim("branch_3", CLAIMANT_A), null, "only ESRCH counts as dead");
  assert.equal(raw("branch_2").retirement, undefined);
  assert.equal(raw("branch_3").retirement, undefined);
  assert.deepEqual(participants.claim("branch_1", CLAIMANT_A), dead);
  assert.deepEqual(raw("branch_1"), { ...envelope(dead), retirement: { claimant: CLAIMANT_A, leaseUntil: START + LEASE_MS } });
  assert.deepEqual(participants.get("branch_1"), dead, "get never returns the lease");
  assert.deepEqual(participants.list(), [dead, live, unverifiable], "list never returns the lease");
  assert.equal(participants.claim("branch_1", CLAIMANT_B), null, "a live foreign lease declines");
  assert.equal(raw("branch_1").retirement.claimant, CLAIMANT_A);
  time.now += 1_000;
  assert.deepEqual(participants.claim("branch_1", CLAIMANT_A, 5_000), dead, "the holder renews its own lease");
  assert.deepEqual(raw("branch_1").retirement, { claimant: CLAIMANT_A, leaseUntil: START + 1_000 + 5_000 });
  for (const [claimant, leaseMs] of [["", LEASE_MS], [undefined, LEASE_MS], [CLAIMANT_B, 0], [CLAIMANT_B, Number.NaN]]) {
    assert.throws(() => participants.claim("branch_1", claimant, leaseMs), { message: "participant record claim for branch_1 needs a claimant and a positive lease" });
  }
});

test("release clears only its own lease, update keeps a lease, and an expired lease is taken over", (t) => {
  assert.throws(() => process.kill(DEAD_PID, 0), (e) => e?.code === "ESRCH");
  const { time, participants, raw } = open(t);
  const dead = record({ ownerPID: DEAD_PID });
  const failed = { ...dead, state: "failed" };
  participants.write(dead);
  participants.claim("branch_1", CLAIMANT_A);
  const lease = { claimant: CLAIMANT_A, leaseUntil: START + LEASE_MS };
  assert.equal(participants.release("branch_1", CLAIMANT_B), false, "a foreign claimant cannot release");
  assert.deepEqual(raw("branch_1").retirement, lease);
  assert.deepEqual(participants.update("branch_1", { state: "failed" }), failed);
  assert.deepEqual(raw("branch_1"), { ...envelope(failed), retirement: lease }, "update keeps the envelope and the lease");
  assert.equal(participants.release("branch_1", CLAIMANT_A), true);
  assert.deepEqual(raw("branch_1"), envelope(failed), "release removes the lease field");
  assert.equal(participants.release("branch_1", CLAIMANT_A), false, "nothing left to release");
  assert.equal(participants.release("branch_missing", CLAIMANT_A), false);
  assert.throws(() => participants.release("branch_1", ""), { message: "participant record release for branch_1 needs a claimant" });
  // A crashed claimant: its lease expires and a later start takes the record over.
  participants.claim("branch_1", CLAIMANT_A);
  time.now += LEASE_MS + 1;
  assert.equal(participants.release("branch_1", CLAIMANT_A), false, "an expired lease is no longer held");
  assert.deepEqual(participants.claim("branch_1", CLAIMANT_B), failed);
  assert.deepEqual(raw("branch_1").retirement, { claimant: CLAIMANT_B, leaseUntil: START + LEASE_MS + 1 + LEASE_MS });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/participant-records.test.mjs`
Expected: FAIL, `ℹ tests 11`, `ℹ pass 0`, `ℹ fail 11`. `registry.participants` is `undefined`, so every test fails on its first `participants.<method>` call with `TypeError: Cannot read properties of undefined (reading '<method>')` (`'list'` in the first test, `'write'`, `'get'` or `'update'` in the others). The new numeric-fence test fails the same way, on its first `participants.write`; an implementation whose `isFence` accepted only strings would also fail it there, rejecting the numeric record from `fakeExecution`. In the tests whose first such call sits inside `assert.throws(...)` (the I/O, corrupt, update, invalid-field and unsafe-ID tests) the failure is an `AssertionError` whose actual error is that `TypeError`. Any other failure (a missing fixture, a syntax error) means the file is wrong: fix it before Step 3.

- [ ] **Step 3: Implement participant records in `lib/child-session.js`**

Three edits. Match on the quoted text, never on line numbers.

Edit 1, the module-level helpers. Old (`lib/child-session.js:62-63` at BASE):
```js
const validIntent = (record) =>
  record?.version === VERSION && record.intent === true && ID.test(record.sessionID) && ID.test(record.parentSessionID);
```
New:
```js
const validIntent = (record) =>
  record?.version === VERSION && record.intent === true && ID.test(record.sessionID) && ID.test(record.parentSessionID);

// Participant records (RECONCILE R1): the durable per-branch delegation state of a workflow
// child. lib/runtime.js writes one per branch; participant recovery and outcome replay claim
// them. They are a record kind of this registry, so one mkdir lock and one dead-owner lease
// (`retirement`) cover child, team, intent and participant ownership. Their envelope carries
// `source: "participant"` and no `sessionID`, `reservation` or `intent`, so validRecord,
// validReservation and validIntent all refuse them, and jsonNames() skips their file prefix.
const PARTICIPANT_PREFIX = "participant-";
// Branch IDs become file names: a closed, separator-free alphabet, so a record can never
// escape root, start with a dot (temp files do) or be read as another record kind.
const BRANCH_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PARTICIPANT_FILE = /^participant-([A-Za-z0-9_-]{1,128})\.json$/;
const EXECUTION_FIELDS = ["workerID", "workerEpoch", "executionID", "sessionID", "rootSessionID", "fencingToken"];
const BRANCH_FIELDS = [...EXECUTION_FIELDS, "branchID", "branchFencingToken"];
const PARTICIPANT_FIELDS = [
  "runID", "delivery", "branch", "ownerExecution", "childSessionID", "registryReservationID",
  "agent", "prompt", "directory", "state", "promptStartedAt", "promptedAt", "outcomeID",
  "blocked", "reportDelivery",
  "ownerPID",
];
const PARTICIPANT_DELIVERIES = new Set(["foreground", "background"]);
const PARTICIPANT_STATES = new Set(["registered", "acknowledged", "prompting", "prompted", "completed", "failed", "terminal"]);
const REPORT_DELIVERIES = new Set(["none", "pending_delivery", "delivered"]);

const participantPath = (root, branchID) => join(root, `${PARTICIPANT_PREFIX}${branchID}.json`);
const invalidParticipant = (field) => new Error(`invalid participant record: ${field}`);
const sameKeys = (value, keys) =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const nonEmpty = (value) => typeof value === "string" && value.length > 0;
// Plan 1 Normative Contracts: fencingToken and branchFencingToken are Schema.Number;
// every other ExecutionFence or BranchFence field is Schema.String.
const NUMERIC_FENCE_FIELDS = new Set(["fencingToken", "branchFencingToken"]);
const isFence = (value, keys) => sameKeys(value, keys) && keys.every((key) =>
  NUMERIC_FENCE_FIELDS.has(key) ? Number.isFinite(value[key]) : nonEmpty(value[key]));
const participantTime = (value) => value === null || (typeof value === "number" && Number.isFinite(value));
const validLease = (lease) => sameKeys(lease, ["claimant", "leaseUntil"]) && nonEmpty(lease.claimant) && Number.isFinite(lease.leaseUntil);
// The stored envelope minus what callers never see: version, source and the lease.
const stripParticipant = ({ version: _version, source: _source, retirement: _retirement, ...record }) => record;

// Every participant method runs this before it builds a path from the ID.
const checkBranchID = (branchID) => {
  if (typeof branchID !== "string" || !BRANCH_ID.test(branchID)) {
    throw new Error(`participant record refuses branch ID ${JSON.stringify(branchID)}`);
  }
};

const validateParticipant = (record) => {
  if (!sameKeys(record, PARTICIPANT_FIELDS)) throw invalidParticipant("fields");
  for (const field of ["runID", "childSessionID", "registryReservationID", "agent", "directory"]) {
    if (!nonEmpty(record[field])) throw invalidParticipant(field);
  }
  if (typeof record.prompt !== "string") throw invalidParticipant("prompt");
  if (!PARTICIPANT_DELIVERIES.has(record.delivery)) throw invalidParticipant("delivery");
  if (!isFence(record.ownerExecution, EXECUTION_FIELDS)) throw invalidParticipant("ownerExecution");
  if (!isFence(record.branch, BRANCH_FIELDS)) throw invalidParticipant("branch");
  checkBranchID(record.branch.branchID);
  // The registry reservation is this registry's UUID; the branch is core's. They must never be conflated.
  if (record.registryReservationID === record.branch.branchID) throw invalidParticipant("registryReservationID");
  if (!PARTICIPANT_STATES.has(record.state)) throw invalidParticipant("state");
  if (!Number.isInteger(record.ownerPID) || record.ownerPID <= 0) throw invalidParticipant("ownerPID");
  if (!participantTime(record.promptStartedAt)) throw invalidParticipant("promptStartedAt");
  if (!participantTime(record.promptedAt)) throw invalidParticipant("promptedAt");
  if (record.outcomeID !== null && !nonEmpty(record.outcomeID)) throw invalidParticipant("outcomeID");
  if (typeof record.blocked !== "boolean") throw invalidParticipant("blocked");
  if (!REPORT_DELIVERIES.has(record.reportDelivery)) throw invalidParticipant("reportDelivery");
};
```

Edit 2, the scan filter inside `createChildRegistry`. Old (`lib/child-session.js:213` at BASE):
```js
  const jsonNames = () => readdirSync(root).filter((name) => name.endsWith(".json"));
```
New:
```js
  // Participant records are their own record kind: no reservation, intent or capacity scan
  // reads or counts them, so they cost those scans a directory entry, never a read.
  const jsonNames = () => readdirSync(root).filter((name) => name.endsWith(".json") && !name.startsWith(PARTICIPANT_PREFIX));
```

Edit 3, the participant view and its key in the returned object. Old (`lib/child-session.js:507-514` at BASE):
```js
  return {
    list, read, register, fail, quarantine, remove,
    reserve, bindReservation, releaseReservation, listReservations, failReservation, quarantineReservation,
    claimRetirement, removeClaimed, failClaimed, quarantineClaimed,
    recordIntent, listIntents, consumeIntent, failIntent,
    teamPut, teamList, teamFor, teamRemove, hasTeams,
  };
};
```
New:
```js
  // Reads the stored envelope. null ONLY when the file is absent: any other read error, bad
  // JSON, a wrong envelope, an invalid record or a malformed lease throws, because a hidden
  // record would let recovery skip a branch that core still holds open.
  const readParticipant = (branchID) => {
    let text;
    try { text = readFileSync(participantPath(root, branchID), "utf8"); }
    catch (error) {
      if (error?.code === "ENOENT") return null;
      throw new Error(`participant record read failed for ${branchID}: ${errorText(error)}`, { cause: error });
    }
    let stored;
    try {
      stored = JSON.parse(text);
      if (stored?.version !== VERSION || stored.source !== "participant") throw new Error(`not a version ${VERSION} participant envelope`);
      validateParticipant(stripParticipant(stored));
      if (stored.retirement !== undefined && !validLease(stored.retirement)) throw new Error("malformed retirement lease");
    } catch (error) {
      throw new Error(`participant record ${branchID} is corrupt: ${errorText(error)}`, { cause: error });
    }
    if (stored.branch.branchID !== branchID) throw new Error(`participant record ${branchID} holds branch ${stored.branch.branchID}`);
    return stored;
  };
  // Every participant write holds the registry lock. lock() runs clearTemps(root) on each
  // acquisition, which removes EVERY *.tmp in root whoever owns it, so a write outside the
  // lock could lose its temp file to another process's acquisition between open and rename.
  // A failure to take the lock or to write is rethrown naming the branch, never swallowed.
  const lockParticipant = (branchID) => {
    try { return lock(root); }
    catch (error) { throw new Error(`participant record write failed for ${branchID}: ${errorText(error)}`, { cause: error }); }
  };
  const writeParticipantUnlocked = (stored) => {
    const branchID = stored.branch.branchID;
    try { writeAtomic(root, { ...stored, path: participantPath(root, branchID) }); }
    catch (error) { throw new Error(`participant record write failed for ${branchID}: ${errorText(error)}`, { cause: error }); }
  };
  const participants = Object.freeze({
    // Stores a fresh envelope without a lease. The runtime writes a branch once (step 7) and
    // changes it only through update, which keeps the lease.
    write: (record) => {
      // The ID is checked before the shape, so a hostile ID gets the path-safety error.
      checkBranchID(record?.branch?.branchID);
      validateParticipant(record);
      const unlock = lockParticipant(record.branch.branchID);
      try { writeParticipantUnlocked({ version: VERSION, source: "participant", ...record }); }
      finally { unlock(); }
      return record;
    },
    // Lockless, like the child read(): writeAtomic renames, so a reader sees a whole file.
    get: (branchID) => {
      checkBranchID(branchID);
      const stored = readParticipant(branchID);
      return stored === null ? null : stripParticipant(stored);
    },
    // Unlike the child list(), which answers [] on any error, this throws: startup pass 1
    // (RECONCILE R2) must hold back every workflow record when participant records cannot be
    // read, and an empty answer would let it retire a participant-owned child.
    list: () => {
      let unlock;
      let names;
      try {
        unlock = lock(root);
        names = readdirSync(root);
      } catch (error) {
        unlock?.();
        throw new Error(`participant record list failed: ${errorText(error)}`, { cause: error });
      }
      try {
        const records = [];
        for (const name of names) {
          const match = PARTICIPANT_FILE.exec(name);
          if (!match) continue; // another record kind, a temp file or the lock directory
          const stored = readParticipant(match[1]);
          // Nothing deletes participant records and we hold the lock, so null means the file
          // was removed by hand between readdir and read: it is no longer a record.
          if (stored !== null) records.push(stripParticipant(stored));
        }
        return records.sort((a, b) => (a.branch.branchID < b.branch.branchID ? -1 : a.branch.branchID > b.branch.branchID ? 1 : 0));
      } finally { unlock(); }
    },
    // Locked read, shallow merge, validate, write. Keeps the envelope and any lease; a patch
    // cannot carry version, source or retirement, because the field check refuses them.
    update: (branchID, patch) => {
      checkBranchID(branchID);
      if (patch === null || typeof patch !== "object" || Array.isArray(patch)) throw new Error(`participant record update for ${branchID} needs an object patch`);
      const unlock = lockParticipant(branchID);
      try {
        const stored = readParticipant(branchID);
        if (stored === null) throw new Error(`no participant record for ${branchID}`);
        const next = { ...stripParticipant(stored), ...patch };
        validateParticipant(next);
        if (next.branch.branchID !== branchID) throw new Error(`participant record update cannot change branch ${branchID}`);
        writeParticipantUnlocked({
          version: VERSION, source: "participant", ...next,
          ...(stored.retirement ? { retirement: stored.retirement } : {}),
        });
        return next;
      } finally { unlock(); }
    },
    // claimRetirement's dead-owner protocol: under the lock, only a definitely dead owner
    // (ownerState "missing", i.e. ESRCH) is claimable, a foreign unexpired lease declines,
    // and the lease is the same `retirement` field with the same expiry test.
    claim: (branchID, claimant, leaseMs = RETIRE_LEASE_MS) => {
      checkBranchID(branchID);
      if (!nonEmpty(claimant) || !Number.isFinite(leaseMs) || leaseMs <= 0) {
        throw new Error(`participant record claim for ${branchID} needs a claimant and a positive lease`);
      }
      const unlock = lockParticipant(branchID);
      try {
        const stored = readParticipant(branchID);
        if (stored === null || ownerState(stored.ownerPID) !== "missing") return null;
        const claim = stored.retirement;
        if (claim?.claimant !== claimant && Number(claim?.leaseUntil) > now()) return null;
        writeParticipantUnlocked({ ...stored, retirement: { claimant, leaseUntil: now() + leaseMs } });
        return stripParticipant(stored);
      } finally { unlock(); }
    },
    // Clears the lease only while `claimant` holds it unexpired (the registry's claimed()). A
    // crashed claimant never releases; its lease expires after leaseMs instead.
    release: (branchID, claimant) => {
      checkBranchID(branchID);
      // claimed() with an undefined claimant matches the missing claimant of a lease-free record
      // and then throws a TypeError reading its leaseUntil; refuse the call instead.
      if (!nonEmpty(claimant)) throw new Error(`participant record release for ${branchID} needs a claimant`);
      const unlock = lockParticipant(branchID);
      try {
        const stored = readParticipant(branchID);
        if (!claimed(stored, claimant)) return false;
        const { retirement: _lease, ...unclaimed } = stored;
        writeParticipantUnlocked(unclaimed);
        return true;
      } finally { unlock(); }
    },
  });
  return {
    list, read, register, fail, quarantine, remove,
    reserve, bindReservation, releaseReservation, listReservations, failReservation, quarantineReservation,
    claimRetirement, removeClaimed, failClaimed, quarantineClaimed,
    recordIntent, listIntents, consumeIntent, failIntent,
    teamPut, teamList, teamFor, teamRemove, hasTeams,
    participants,
  };
};
```

No import changes: `readFileSync`, `readdirSync` and `join` are already imported at `lib/child-session.js:3-5`. The helper names above are new in the module (checked at BASE: none of `PARTICIPANT_*`, `BRANCH_ID`, `EXECUTION_FIELDS`, `BRANCH_FIELDS`, `REPORT_DELIVERIES`, `sameKeys`, `nonEmpty`, `isFence`, `participantTime`, `validLease`, `stripParticipant`, `checkBranchID`, `validateParticipant` exists; `timestamp` is deliberately avoided because `register`, `reserve` and `recordIntent` use it as a local).

Known edge, accepted: `writeAtomic` fsyncs the directory after the rename, so a failure in that last fsync reports `participant record write failed` although the new file is in place. A caller that sees the throw treats the record as unknown; nothing in this plan retries a write blindly.

- [ ] **Step 4: Run them to verify they pass, then the full suite**

Run: `node --test tests/participant-records.test.mjs`
Expected: PASS, `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests 216`, `ℹ fail 0` (predicted; the header's Baselines rule applies: if the absolute count differs, Task 3 must still add exactly 11 tests and `fail` must be 0). The existing registry tests (`tests/terminal-intents.mjs`, `tests/team-registry.mjs`, `tests/workflows.test.mjs`) must pass unchanged: the only existing code Task 3 changes is `jsonNames()`, which now skips `participant-*` names that no existing record kind uses.

- [ ] **Step 5: Commit**

```bash
git add lib/child-session.js tests/participant-records.test.mjs
git commit -m "Store delegated workflow branch records as participant records in the child registry, under its lock and retirement lease"
```

- [ ] **Step 6: Close-out for Tasks 1-3**

Set BASE as the header's "Baselines and test counts" section says. Then `git --no-pager status --porcelain` prints nothing and `git --no-pager log --oneline "$BASE"..HEAD` shows the Task 1, Task 2 and Task 3 commits in that order (plus any review-fix commits plan-run added), and nothing else.

### Task 4: The 13-step live order in `lib/runtime.js`

**Files:**
- Create: `tests/fixtures/participants.mjs`
- Create: `tests/live-order.test.mjs`
- Modify: `tests/workflows.test.mjs` (one import line; 16 runtime call sites gain `...participation()`; 11 of them also gain `directory: "/d"`)
- Modify: `lib/runtime.js` (one import; the `createWorkflowRuntime` option list and its guard block; the `agent()` body from the reservation to the end of its `finally`)

**Interfaces:**
- Consumes: `fakeDelegation`, `fakeExecution` (Task 1); `acknowledgeInput` (Task 2); the child registry's `participants` view, `createChildRegistry(...).participants` (Task 3; the runtime calls only its `write` and `update`).
- Produces:
  - `createWorkflowRuntime({ ..., participantReady, participants, deliveryHandlers, delivery = "foreground" })`. Construction throws `workflows runtime requires participantReady` (not a thenable), `workflows runtime requires the participants view` (no `write`/`update`), `workflows runtime requires deliveryHandlers` (no `has`/`set`/`delete`), or `workflows runtime delivery must be "foreground" or "background", got <JSON>`. These checks run after Task 1's `delegation` check.
  - `agent()` refuses with `workflow agent requires the project directory` when `directory` is empty, then awaits `participantReady` (its rejection propagates unchanged), then runs steps 1-13.
  - `tests/fixtures/participants.mjs`: `scratchParticipantStore()` (the `participants` view of a fresh child registry whose root is a new directory under one per-process scratch root removed by a root-level `after()`), `participation()` returning `{ participantReady: Promise.resolve(), participants: scratchParticipantStore(), deliveryHandlers: new Map() }`.

- [ ] **Step 1: Create the participant fixture**

Create `tests/fixtures/participants.mjs`:
```js
// Participant-record plumbing for tests that build a workflow runtime or plugin.
// Every scratch child registry lives under ONE scratch root per test process, removed by a
// root-level after() hook, so no test writes participant records into the production
// child registry (~/.local/share/opencode/workflow-runs/children) or takes its lock, and
// no run leaves a temp directory behind.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after } from "node:test";
import { createChildRegistry } from "../../lib/child-session.js";

// Created at import time, which is top level for the importing test file, so after()
// attaches to the file's root test and runs once every test in the file has finished.
const root = mkdtempSync(join(tmpdir(), "wf-participants-"));
after(() => rmSync(root, { recursive: true, force: true }));

// The participants view of a private child registry (RECONCILE R1): records, lock and
// leases all live in the fresh registry root.
export const scratchParticipantStore = () => createChildRegistry({ root: mkdtempSync(join(root, "registry-")) }).participants;

// The three runtime options lib/core.js supplies in production, for tests that build a
// runtime directly: an already-registered participant, private participant records, an empty map.
export const participation = () => ({
  participantReady: Promise.resolve(),
  participants: scratchParticipantStore(),
  deliveryHandlers: new Map(),
});
```

- [ ] **Step 2: Migrate the existing runtime call sites (mechanical, no behaviour change yet)**

Record the scratch-dir baseline first (the suite must not change it):
```bash
ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* 2>/dev/null | wc -l
```
Write the printed number down as TMPBASE.

Run these three rewrites. The first inserts `...participation(), ` after Task 1's `delegation: fakeDelegation(), ` in every `createWorkflowRuntime({` call (it skips Task 1's "the runtime refuses to start without delegation" test, which has no `delegation`). The second adds `directory: "/d", ` to every migrated site whose `client` is followed directly by `parentSessionID` (the sites that pass no directory). The third adds the import after Task 1's fixture import.
```bash
perl -0pi -e 's/\bcreateWorkflowRuntime\(\{(\s*)delegation: fakeDelegation\(\), /createWorkflowRuntime({$1delegation: fakeDelegation(), ...participation(), /g' tests/workflows.test.mjs
perl -0pi -e 's/(\.\.\.participation\(\), client(?:: client[ABC])?, )parentSessionID/$1directory: "\/d", parentSessionID/g' tests/workflows.test.mjs
perl -0pi -e 's|(import \{ fakeDelegation, fakeTimers \} from "./fixtures/delegation.mjs";\n)|$1import { participation } from "./fixtures/participants.mjs";\n|' tests/workflows.test.mjs
```
Verify the counts exactly:
```bash
grep -c '\.\.\.participation()' tests/workflows.test.mjs
grep -cE '\.\.\.participation\(\), client(: client[ABC])?, directory: "/d", parentSessionID' tests/workflows.test.mjs
grep -c 'import { participation } from "./fixtures/participants.mjs";' tests/workflows.test.mjs
```
Expected: `16`, `15` (the 11 rewritten sites plus the 4 that already passed `directory: "/d"`), `1`. The one runtime site without `directory` afterwards is the pipeline/parallel test (line 721 at `d6655f6` before this plan's import lines, 719 at `c4936da`; `createWorkflowRuntime({ client, store: fakeStore(), waitIdle: idle })`), which never calls `agent()`. Any other count: STOP, inspect with `git --no-pager diff`, fix by hand.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests 216` (predicted), `ℹ fail 0` (the new options are ignored until Step 5).

- [ ] **Step 3: Write the failing live-order tests**

Create `tests/live-order.test.mjs`:
```js
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowRuntime } from "../lib/runtime.js";
import { fakeDelegation, fakeExecution } from "./fixtures/delegation.mjs";
import { participation, scratchParticipantStore } from "./fixtures/participants.mjs";

// Live child order (contract steps 1-13) for one workflow agent() call. Every
// collaborator records into ONE shared `order` array at call time: the delegation fake
// as [method, input], and the wrappers below as ["<owner>.<method>", ...args]. Each
// wrapper records BEFORE it fails, so a failing call is visible in the order too.
// `failOn(name, args)` returns the Error a call must throw, or null.
const never = () => null;

const recordingClient = (order, failOn = never) => ({
  session: {
    create: async ({ body }) => {
      order.push(["session.create", { title: body.title, parentID: body.parentID }]);
      const error = failOn("session.create", [body]);
      if (error) throw error;
      return { data: { id: "ses_child1" } };
    },
    prompt: async ({ path, body }) => {
      order.push(["session.prompt", { id: path.id, agent: body.agent, text: body.parts[0].text }]);
      return { data: { parts: [{ type: "text", text: "child reply" }] } };
    },
  },
});

const recordingManager = (order, failOn = never) => {
  const step = (name, answer) => (...args) => {
    order.push([`manager.${name}`, ...args]);
    const error = failOn(`manager.${name}`, args);
    if (error) throw error;
    return answer(...args);
  };
  return {
    reserve: step("reserve", () => ({ reservationID: "resv_1", marker: "[workflow-reservation:resv_1]" })),
    failReservation: step("failReservation", () => null),
    bindReservation: step("bindReservation", (reservationID, sessionID) => ({ reservationID, sessionID, reservationState: "bound" })),
    register: async (input) => {
      order.push(["manager.register", input]);
      const error = failOn("manager.register", [input]);
      if (error) throw error;
      return failOn("manager.register:null", [input]) ? null : { ...input };
    },
    retire: async (sessionID) => {
      order.push(["manager.retire", sessionID]);
      return { verified: true };
    },
  };
};

const recordingStore = (order, store, failOn = never) => ({
  write: (record) => {
    order.push(["store.write", record]);
    const error = failOn("store.write", [record]);
    if (error) throw error;
    return store.write(record);
  },
  update: (branchID, patch) => {
    order.push(["store.update", branchID, patch]);
    const error = failOn("store.update", [branchID, patch]);
    if (error) throw error;
    return store.update(branchID, patch);
  },
  get: (branchID) => store.get(branchID),
  list: () => store.list(),
});

const recordingHandlers = (order, failOn = never) => {
  const map = new Map();
  return {
    map,
    has: (key) => map.has(key),
    set: (key, value) => {
      order.push(["handlers.set", key, value]);
      const error = failOn("handlers.set", [key, value]);
      if (error) throw error;
      map.set(key, value);
    },
    delete: (key) => {
      order.push(["handlers.delete", key]);
      return map.delete(key);
    },
  };
};

const fakeRunStore = () => ({ newRunID: () => "run-test", writeRun: () => {}, pruneRuns: () => {} });

// One runtime wired entirely to recorders. The clock is constant so the record's
// promptStartedAt/promptedAt are literal.
const liveRuntime = ({ fail = {}, failOn = never, delivery = "foreground" } = {}) => {
  const order = [];
  const store = scratchParticipantStore();
  const handlers = recordingHandlers(order, failOn);
  const runtime = createWorkflowRuntime({
    client: recordingClient(order, failOn), directory: "/d", parentSessionID: "ses_parent",
    workflowName: "wf", store: fakeRunStore(), manager: recordingManager(order, failOn),
    delegation: fakeDelegation({ fail, order }), participantReady: Promise.resolve(),
    participants: recordingStore(order, store, failOn), deliveryHandlers: handlers,
    delivery, now: () => 4242,
  });
  return { order, store, handlers, runtime };
};

const ownerExecution = fakeExecution("ses_parent");
const branch = { ...ownerExecution, branchID: "branch_1", branchFencingToken: 1 };
const registered = {
  runID: "run-test", delivery: "foreground", branch, ownerExecution, childSessionID: "ses_child1",
  registryReservationID: "resv_1", agent: "worker", prompt: "do the thing", directory: "/d",
  state: "registered", promptStartedAt: null, promptedAt: null, outcomeID: null, blocked: false,
  reportDelivery: "none", ownerPID: process.pid,
};
const handler = { runID: "run-test", delivery: "foreground", branch, childSessionID: "ses_child1" };
const registration = {
  sessionID: "ses_child1", parentSessionID: "ses_parent", source: "workflow", mode: "foreground",
  directory: "/d", reservationID: "resv_1",
};

test("a workflow child runs the 13 contract steps in exactly this order", async () => {
  const { order, store, handlers, runtime } = liveRuntime();
  assert.equal(await runtime.agent("do the thing", { agent: "worker", intent: "read" }), "child reply");
  assert.deepEqual(order, [
    ["currentExecution", { sessionID: "ses_parent" }],
    ["reserveBranch", { parentSessionID: "ses_parent", rootSessionID: "ses_parent", ownerExecution, parentBranchID: null, kind: "workflow", delivery: "foreground" }],
    ["manager.reserve", { parentSessionID: "ses_parent", source: "workflow", mode: "foreground", directory: "/d" }],
    ["session.create", { title: "wf: worker [workflow-reservation:resv_1]", parentID: "ses_parent" }],
    ["manager.bindReservation", "resv_1", "ses_child1"],
    ["bindBranch", { branch, childSessionID: "ses_child1" }],
    ["manager.register", registration],
    ["store.write", registered],
    ["handlers.set", "branch_1", handler],
    ["acknowledgeBranch", { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
    ["store.update", "branch_1", { state: "acknowledged" }],
    ["store.update", "branch_1", { state: "prompting", promptStartedAt: 4242 }],
    ["session.prompt", { id: "ses_child1", agent: "worker", text: "do the thing" }],
    ["store.update", "branch_1", { state: "prompted", promptedAt: 4242 }],
    ["handlers.delete", "branch_1"],
    ["manager.retire", "ses_child1"],
  ]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "prompted", promptStartedAt: 4242, promptedAt: 4242 });
  assert.equal(handlers.map.size, 0, "the handler lives only as long as the agent() call");
});

// Every failure point at steps 1-11. `names` is the full call order by name; the
// contract's failure rule is visible in it: no session.prompt, failBranch exactly when a
// branch was reserved, the handler discarded once it was installed, and manager.retire
// exactly where the pre-existing path retires (once the registry slot is bound).
const boom = new Error("injected failure");
const failingAt = (target, predicate = () => true) => (name, args) => (name === target && predicate(...args) ? boom : null);
const FAILURES = [
  { step: "1 currentExecution", fail: { currentExecution: boom }, names: ["currentExecution"] },
  { step: "2 reserveBranch", fail: { reserveBranch: boom }, names: ["currentExecution", "reserveBranch"] },
  { step: "3 manager.reserve", failOn: failingAt("manager.reserve"), names: ["currentExecution", "reserveBranch", "manager.reserve", "failBranch"] },
  { step: "4 session.create", failOn: failingAt("session.create"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.failReservation", "failBranch"] },
  { step: "5 manager.bindReservation", failOn: failingAt("manager.bindReservation"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "failBranch"] },
  { step: "6 bindBranch", fail: { bindBranch: boom },
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "failBranch", "manager.retire"] },
  { step: "6 manager.register throws", failOn: failingAt("manager.register"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "failBranch", "manager.retire"] },
  { step: "6 manager.register cannot verify ownership", failOn: (name) => (name === "manager.register:null" ? boom : null),
    error: { message: 'workflow agent "worker": child ownership could not be verified' },
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "failBranch", "manager.retire"] },
  { step: "7 store.write", failOn: failingAt("store.write"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "store.write", "failBranch", "manager.retire"] },
  { step: "8 install delivery handler", failOn: failingAt("handlers.set"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "store.write", "handlers.set", "failBranch", "store.update", "manager.retire"] },
  { step: "9 acknowledgeBranch", fail: { acknowledgeBranch: boom },
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "store.write", "handlers.set", "acknowledgeBranch", "handlers.delete", "failBranch", "store.update", "manager.retire"] },
  { step: "10 store.update acknowledged", failOn: failingAt("store.update", (_id, patch) => patch.state === "acknowledged"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "store.write", "handlers.set", "acknowledgeBranch", "store.update", "handlers.delete", "failBranch", "store.update", "manager.retire"] },
  { step: "11 store.update prompting", failOn: failingAt("store.update", (_id, patch) => patch.state === "prompting"),
    names: ["currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation", "bindBranch", "manager.register", "store.write", "handlers.set", "acknowledgeBranch", "store.update", "store.update", "handlers.delete", "failBranch", "store.update", "manager.retire"] },
];

for (const { step, fail, failOn, error, names } of FAILURES) {
  test(`a failure at step ${step} never prompts, fails the branch only if one exists, and retires as before`, async () => {
    const { order, store, handlers, runtime } = liveRuntime({ fail, failOn });
    await assert.rejects(runtime.agent("do the thing", { agent: "worker", intent: "read" }), error ?? ((thrown) => thrown === boom));
    assert.deepEqual(order.map(([name]) => name), names);
    assert.equal(names.includes("session.prompt"), false);
    // A branch exists once reserveBranch (step 2) has answered.
    const branchExists = !fail?.currentExecution && !fail?.reserveBranch;
    assert.deepEqual(
      order.filter(([name]) => name === "failBranch"),
      branchExists ? [["failBranch", { branch, errorCode: "invalid_branch_state" }]] : [],
    );
    assert.equal(handlers.map.size, 0, "no delivery handler survives a failed setup");
    // Once the record is durable (step 7 succeeded), a successful failBranch marks it
    // "failed" -- the trailing store.update in `names` -- so startup recovery skips it.
    const recordWritten = names.includes("store.write") && step !== "7 store.write";
    if (recordWritten) assert.equal(store.get("branch_1").state, "failed");
    else assert.equal(store.get("branch_1"), null);
  });
}

test("store.write failing at step 7 means no acknowledgeBranch and no prompt", async () => {
  const diskFull = new Error("participant record write failed for branch_1: ENOSPC");
  const { order, store, runtime } = liveRuntime({ failOn: (name) => (name === "store.write" ? diskFull : null) });
  await assert.rejects(runtime.agent("do the thing", { agent: "worker", intent: "read" }), (thrown) => thrown === diskFull);
  assert.deepEqual(order.map(([name]) => name), [
    "currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation",
    "bindBranch", "manager.register", "store.write", "failBranch", "manager.retire",
  ]);
  assert.equal(order.some(([name]) => name === "acknowledgeBranch"), false);
  assert.equal(order.some(([name]) => name === "session.prompt"), false);
  assert.equal(store.get("branch_1"), null);
});

test("a branch that already has a delivery handler is failed, never overwritten", async () => {
  const { order, handlers, runtime } = liveRuntime();
  const existing = Object.freeze({ owner: "another agent() call" });
  handlers.map.set("branch_1", existing);
  await assert.rejects(runtime.agent("do the thing", { agent: "worker", intent: "read" }), { message: "workflow delivery handler already installed for branch_1" });
  assert.deepEqual(order.map(([name]) => name), [
    "currentExecution", "reserveBranch", "manager.reserve", "session.create", "manager.bindReservation",
    "bindBranch", "manager.register", "store.write", "failBranch", "store.update", "manager.retire",
  ]);
  assert.equal(handlers.map.get("branch_1"), existing);
});

test("a failed participant registration rejects agent() before step 1", async () => {
  const order = [];
  const refused = new Error("workflows participant registration mismatch: buildID");
  const participantReady = Promise.reject(refused);
  participantReady.catch(() => {}); // core.js attaches its reporter the same way
  const runtime = createWorkflowRuntime({
    client: recordingClient(order), directory: "/d", parentSessionID: "ses_parent", workflowName: "wf",
    store: fakeRunStore(), manager: recordingManager(order), delegation: fakeDelegation({ order }),
    ...participation(), participantReady,
  });
  await assert.rejects(runtime.agent("do the thing", { agent: "worker", intent: "read" }), (thrown) => thrown === refused);
  assert.deepEqual(order, []);
});

test("a dispatch without a project directory is refused before step 1", async () => {
  const order = [];
  const runtime = createWorkflowRuntime({
    client: recordingClient(order), parentSessionID: "ses_parent", workflowName: "wf",
    store: fakeRunStore(), manager: recordingManager(order), delegation: fakeDelegation({ order }),
    ...participation(),
  });
  await assert.rejects(runtime.agent("do the thing", { agent: "worker", intent: "read" }), { message: "workflow agent requires the project directory" });
  assert.deepEqual(order, []);
});

test("the runtime refuses to start without its participation options", () => {
  const base = () => ({
    client: recordingClient([]), directory: "/d", parentSessionID: "ses_parent", store: fakeRunStore(),
    manager: recordingManager([]), delegation: fakeDelegation(), ...participation(),
  });
  for (const [change, message] of [
    [{ participantReady: undefined }, "workflows runtime requires participantReady"],
    [{ participants: undefined }, "workflows runtime requires the participants view"],
    [{ participants: { write: () => {} } }, "workflows runtime requires the participants view"],
    [{ deliveryHandlers: undefined }, "workflows runtime requires deliveryHandlers"],
    [{ delivery: "sideways" }, 'workflows runtime delivery must be "foreground" or "background", got "sideways"'],
  ]) {
    assert.throws(() => createWorkflowRuntime({ ...base(), ...change }), { message });
  }
});
```

Why each test exists (requirements a-c):
- (a) "a workflow child runs the 13 contract steps in exactly this order": one combined `order` array (fake delegation calls, `manager.*`, `session.*`, `store.*`, `handlers.*`) asserted with `deepEqual` against the full literal. The schedule is deterministic: one `agent()` call, every collaborator resolves immediately and records synchronously at call time, and the clock is the constant `4242`.
- (b) the `FAILURES` table: one case per failure point at steps 1-11 (step 6 has three: `bindBranch` throws, `register` throws, `register` returns null). Each asserts the full call-name order, no `session.prompt`, `failBranch` with exactly `{ branch, errorCode: "invalid_branch_state" }` iff `reserveBranch` answered, an empty handler map, and `manager.retire` exactly where BASE retires (after `bindReservation` succeeded).
- (c) "store.write failing at step 7 means no acknowledgeBranch and no prompt".
- `intent: "read"` on every dispatch makes the capability check (BASE `lib/runtime.js:180`) pass whatever `~/.config/opencode/agent/worker.md` declares, so the tests are hermetic.

- [ ] **Step 4: Run them to verify they fail**

Run: `node --test tests/live-order.test.mjs`
Expected: FAIL, `ℹ tests 19`, `ℹ pass 0`, `ℹ fail 19`. Specifically:
- the 13-step test fails its `deepEqual` with actual beginning `[ [ 'manager.reserve', [Object] ], [ 'session.create', [Object] ], [ 'manager.bindReservation', 'resv_1', 'ses_child1' ], ...` (BASE never calls delegation or the store);
- cases 1, 2, "6 bindBranch", 7, 8, 9, 10, 11, the step-7 test, the duplicate-handler test, the registration test and the directory test fail with `Missing expected rejection.`;
- cases 3, 4, 5, "6 manager.register throws" and "6 manager.register cannot verify ownership" fail their names `deepEqual` (case 3: actual `[ 'manager.reserve' ]`; case 4: `[ 'manager.reserve', 'session.create', 'manager.failReservation' ]`; case 5: `[ 'manager.reserve', 'session.create', 'manager.bindReservation' ]`; both register cases: `[ 'manager.reserve', 'session.create', 'manager.bindReservation', 'manager.register', 'manager.retire' ]`);
- the constructor test fails with `Missing expected exception.`

- [ ] **Step 5: Implement the live order in `lib/runtime.js`**

5a. Add the import directly after `import { createChildManager } from "./child-session.js";`:
```js
import { acknowledgeInput } from "./delegation.js";
```

5b. In the option list, replace:
```js
  client, directory, parentSessionID, workflowName = "workflow", delegation,
  agentDir = AGENT_DIR,
```
with:
```js
  client, directory, parentSessionID, workflowName = "workflow", delegation,
  participantReady, participants, deliveryHandlers, delivery = "foreground",
  agentDir = AGENT_DIR,
```

5c. Replace Task 1's guard and the line after it:
```js
  if (!delegation) throw new Error("workflows requires PluginInput.delegation");
  pruneCache(workflowName);
```
with:
```js
  if (!delegation) throw new Error("workflows requires PluginInput.delegation");
  // The participant registration, the durable branch records and the in-process delivery
  // handlers belong to the plugin instance (lib/core.js) and are shared by every run it
  // starts. None has a safe default here: a private Map or a default store would split
  // that state and hide a wiring bug, so a runtime without them refuses to start.
  if (typeof participantReady?.then !== "function") throw new Error("workflows runtime requires participantReady");
  if (typeof participants?.write !== "function" || typeof participants?.update !== "function") {
    throw new Error("workflows runtime requires the participants view");
  }
  if (typeof deliveryHandlers?.has !== "function" || typeof deliveryHandlers?.set !== "function" || typeof deliveryHandlers?.delete !== "function") {
    throw new Error("workflows runtime requires deliveryHandlers");
  }
  if (delivery !== "foreground" && delivery !== "background") {
    throw new Error(`workflows runtime delivery must be "foreground" or "background", got ${JSON.stringify(delivery)}`);
  }
  pruneCache(workflowName);
```

5d. In `agent()`, keep everything up to and including the parent-session check:
```js
    if (!/^ses_[A-Za-z0-9]+$/.test(parentSessionID ?? "")) {
      throw new Error("workflow agent requires its owning parent session id");
    }
```
and replace everything after it, from the comment `// Claim capacity before creation: a crash after create is recoverable once` through the `};` that closes `agent` (BASE `lib/runtime.js:197-249`), which is exactly:
```js
    // Claim capacity before creation: a crash after create is recoverable once
    // the returned id is bound into this durable slot below.
    const reservation = manager.reserve({ parentSessionID, source: "workflow", mode: "foreground", directory });
    const titlePrefix = `${workflowName}: ${label}`;
    const title = `${titlePrefix.slice(0, 99 - reservation.marker.length)} ${reservation.marker}`;
    let created;
    try {
      created = await client.session.create({
        query,
        body: { title, parentID: parentSessionID },
      });
    } catch (error) {
      manager.failReservation(reservation.reservationID, `session.create did not return a child id: ${String(error?.message ?? error)}`);
      throw error;
    }
    const sessionID = (created?.data ?? created)?.id;
    if (!sessionID) {
      manager.failReservation(reservation.reservationID, "session.create did not return a child id");
      throw new Error(`workflow agent "${label}": could not create session`);
    }
    // Do not await any server read before this bind. Recovery needs this id.
    manager.bindReservation(reservation.reservationID, sessionID);
    try {
      const managed = await manager.register({ sessionID, parentSessionID, source: "workflow", mode: "foreground", directory, reservationID: reservation.reservationID });
      if (!managed) throw new Error(`workflow agent "${label}": child ownership could not be verified`);
      let fullPrompt = String(prompt);
      if (opts.fork) {
        const context = await forkContext();
        if (context) {
          fullPrompt = `You are continuing from this conversation between a user and an assistant:\n\n<conversation>\n${context}\n</conversation>\n\n${fullPrompt}`;
        }
      }
      const reply = await client.session.prompt({
        path: { id: sessionID },
        query,
        body: { agent: agentName, parts: [{ type: "text", text: fullPrompt }] },
      });
      if (reply?.error) throw new Error(String(reply.error?.message ?? JSON.stringify(reply.error)).slice(0, 300));
      const text = textOfParts((reply?.data ?? reply)?.parts);
      writeCache(workflowName, key, text);
      return opts.json ? parseJson(text) : text;
    } finally {
      state.agentsDone += 1;
      record();
      // Same manager and validation path as native task cleanup.
      let retired;
      try { retired = await manager.retire(sessionID); } catch (error) { retired = { error: String(error?.message ?? error) }; }
      if (retired?.error) {
        (state.leaked ??= []).push(`${sessionID}: ${retired.error}`);
        record();
      }
    }
  };
```
with:
```js
    // The durable branch record carries the directory used to scope startup recovery,
    // so a dispatch without one is refused before any branch or child exists.
    if (typeof directory !== "string" || directory.length === 0) {
      throw new Error("workflow agent requires the project directory");
    }
    // Branches belong to a registered participant. A failed registration rejects here,
    // before anything is reserved, so no child is ever created outside the protocol.
    await participantReady;
    // Resolved before step 1 so the durable record holds the exact text that is sent.
    // Recovery never re-prompts; it fails non-final records whose owner is dead.
    let fullPrompt = String(prompt);
    if (opts.fork) {
      const context = await forkContext();
      if (context) {
        fullPrompt = `You are continuing from this conversation between a user and an assistant:\n\n<conversation>\n${context}\n</conversation>\n\n${fullPrompt}`;
      }
    }
    // Live child order, contract steps 1-13. A throw before step 12 means session.prompt
    // was never called: the catch discards the delivery handler and fails the branch (iff
    // one was reserved); the finally runs the pre-existing retire path, which applies only
    // once the registry holds a bound record for the child (retireOnExit).
    let branch = null;
    let sessionID = null;
    let retireOnExit = false;
    let recorded = false;
    let handlerInstalled = false;
    let promptStarted = false;
    const discardHandler = () => {
      if (!handlerInstalled) return;
      handlerInstalled = false;
      deliveryHandlers.delete(branch.branchID);
    };
    try {
      // 1-2: the owner's execution fence, then a branch reserved under it.
      const ownerExecution = await delegation.currentExecution({ sessionID: parentSessionID });
      ({ branch } = await delegation.reserveBranch({
        parentSessionID, rootSessionID: ownerExecution.rootSessionID, ownerExecution,
        parentBranchID: null, kind: "workflow", delivery,
      }));
      // 3: claim registry capacity before creation; a crash after create is recoverable
      // once the returned id is bound into this durable slot. The registry mode is always
      // "foreground" (reserve() refuses anything else): it describes how this process
      // retires the child, which is the same for every workflow run. Background versus
      // foreground delivery is the branch's `delivery`, never the registry mode.
      const reservation = manager.reserve({ parentSessionID, source: "workflow", mode: "foreground", directory });
      const titlePrefix = `${workflowName}: ${label}`;
      const title = `${titlePrefix.slice(0, 99 - reservation.marker.length)} ${reservation.marker}`;
      // 4: create the child.
      let created;
      try {
        created = await client.session.create({
          query,
          body: { title, parentID: parentSessionID },
        });
      } catch (error) {
        manager.failReservation(reservation.reservationID, `session.create did not return a child id: ${String(error?.message ?? error)}`);
        throw error;
      }
      sessionID = (created?.data ?? created)?.id;
      if (!sessionID) {
        manager.failReservation(reservation.reservationID, "session.create did not return a child id");
        throw new Error(`workflow agent "${label}": could not create session`);
      }
      // 5: bind the registry slot, synchronously.
      // Do not await any server read before this bind. Recovery needs this id.
      manager.bindReservation(reservation.reservationID, sessionID);
      retireOnExit = true;
      // 6: bind the child to the branch in core, then register it. The slot is already
      // bound, so a failure here (bindBranch included) takes the existing failure path:
      // the catch fails the branch and the finally retires the child.
      await delegation.bindBranch({ branch, childSessionID: sessionID });
      const managed = await manager.register({ sessionID, parentSessionID, source: "workflow", mode: "foreground", directory, reservationID: reservation.reservationID });
      if (!managed) throw new Error(`workflow agent "${label}": child ownership could not be verified`);
      // 7: the durable record exists before anything can be delivered to the branch.
      participants.write({
        runID, delivery, branch, ownerExecution, childSessionID: sessionID,
        registryReservationID: reservation.reservationID, agent: agentName, prompt: fullPrompt,
        directory, state: "registered", promptStartedAt: null, promptedAt: null,
        outcomeID: null, blocked: false, reportDelivery: "none", ownerPID: process.pid,
      });
      recorded = true;
      // 8: this branch's delivery handler, keyed by branchID in the plugin-wide map. It
      // lives exactly as long as this agent() call (discarded in the finally below).
      if (deliveryHandlers.has(branch.branchID)) throw new Error(`workflow delivery handler already installed for ${branch.branchID}`);
      deliveryHandlers.set(branch.branchID, Object.freeze({ runID, delivery, branch, childSessionID: sessionID }));
      handlerInstalled = true;
      // 9-10: acknowledge only once the record and the handler exist, then persist it.
      await delegation.acknowledgeBranch(acknowledgeInput(branch));
      participants.update(branch.branchID, { state: "acknowledged" });
      // 11: from here a restart must assume the prompt may have been sent.
      participants.update(branch.branchID, { state: "prompting", promptStartedAt: now() });
      promptStarted = true;
      // 12
      const reply = await client.session.prompt({
        path: { id: sessionID },
        query,
        body: { agent: agentName, parts: [{ type: "text", text: fullPrompt }] },
      });
      // 13: the prompt call returned; persisted before the reply is judged.
      participants.update(branch.branchID, { state: "prompted", promptedAt: now() });
      if (reply?.error) throw new Error(String(reply.error?.message ?? JSON.stringify(reply.error)).slice(0, 300));
      const text = textOfParts((reply?.data ?? reply)?.parts);
      writeCache(workflowName, key, text);
      return opts.json ? parseJson(text) : text;
    } catch (error) {
      // Failures at steps 1-11 only. Past step 11 the prompt may have been sent, and what
      // happens to the branch then is result handling, not setup.
      if (!promptStarted) {
        discardHandler();
        if (branch) {
          let failed = false;
          try {
            await delegation.failBranch({ branch, errorCode: "invalid_branch_state" });
            failed = true;
          } catch (failError) {
            // Reported, and never allowed to mask the setup error. The record stays
            // non-final, so startup recovery fails the branch again once its owner is dead.
            console.error(`workflows failBranch for ${branch.branchID} failed: ${String(failError?.message ?? failError)}`);
          }
          if (failed && recorded) {
            try {
              participants.update(branch.branchID, { state: "failed" });
            } catch (storeError) {
              console.error(`workflows could not mark branch ${branch.branchID} failed: ${String(storeError?.message ?? storeError)}`);
            }
          }
        }
      }
      throw error;
    } finally {
      discardHandler();
      if (retireOnExit) {
        state.agentsDone += 1;
        record();
        // Same manager and validation path as native task cleanup.
        let retired;
        try { retired = await manager.retire(sessionID); } catch (error) { retired = { error: String(error?.message ?? error) }; }
        if (retired?.error) {
          (state.leaked ??= []).push(`${sessionID}: ${retired.error}`);
          record();
        }
      }
    }
  };
```

Behaviour preserved from BASE, checked by the unchanged suite: `bindReservation` is still the first statement after the child id is known, with no await before it; `agentsDone` increments and `retire` runs iff `bindReservation` succeeded (a `bindBranch` failure retires exactly like a throwing `register`); a create failure calls `failReservation` and does not retire; an unverifiable owner (`register` returns null) throws `child ownership could not be verified` and retires; the fork text and title format are unchanged (`tests/workflows.test.mjs` "agent() creates, prompts, parses, and always deletes the child" and "a fork replays parent conversation ahead of the prompt").

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test tests/live-order.test.mjs`
Expected: PASS, `ℹ tests 19`, `ℹ pass 19`, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests 235` (predicted), `ℹ fail 0`.

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* 2>/dev/null | wc -l`
Expected: TMPBASE (from Step 2) -- the suite left no scratch directory behind.

- [ ] **Step 7: Commit**

```bash
git add lib/runtime.js tests/live-order.test.mjs tests/fixtures/participants.mjs tests/workflows.test.mjs
git commit -m "Run every workflow child as a fenced delegation branch in the contract's 13-step order"
```

### Task 5: Plugin wiring in `lib/core.js` and the background-registry test

**Files:**
- Modify: `lib/core.js` (one import; one option; one closure constant after Task 2's `participantReady` block; `executeWorkflow`; the two `executeWorkflow` calls in `workflow_run.execute`)
- Modify: `tests/live-order.test.mjs` (import block; append the plugin tests)

**Interfaces:**
- Consumes: Task 4's runtime options; Task 2's `participantReady`, `participantTimers`, `dispose`; Task 3's `createChildRegistry(...).participants` view.
- Produces:
  - `createWorkflowPlugin({ ..., participants = createChildRegistry().participants })`. The default is the participants view of the production child registry (`workflow-runs/children/`, `lib/child-session.js:8`): the same root and the same lock as the default manager's registry (`createChildManager`'s `registry = createChildRegistry()`). Building the view touches no disk; the first participant read or write does. Tests always pass `scratchParticipantStore()`.
  - Plugin closure `deliveryHandlers` (one `Map` per plugin instance), the object the delivery code of Tasks 7-10 looks branches up in.
  - `executeWorkflow({ workflow, args, parentSessionID, resume, delivery })`; `workflow_run.execute` passes `delivery: "background"` on the `toolArgs.background` path and `delivery: "foreground"` otherwise. `runtimeFactory` receives `participantReady, participants, deliveryHandlers, delivery` in addition to Task 1's options.

- [ ] **Step 0: Record this task's baselines**

Before any edit, measure TMPBASE as the header's "Baselines and test counts" section defines it. Step 4 compares against it.

- [ ] **Step 1: Write the failing plugin tests**

In `tests/live-order.test.mjs`, replace the import block (the first five lines, from Task 4 Step 3):
```js
import assert from "node:assert/strict";
import test from "node:test";
import { createWorkflowRuntime } from "../lib/runtime.js";
import { fakeDelegation, fakeExecution } from "./fixtures/delegation.mjs";
import { participation, scratchParticipantStore } from "./fixtures/participants.mjs";
```
with:
```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createChildManager, createChildRegistry } from "../lib/child-session.js";
import { createWorkflowPlugin } from "../lib/core.js";
import { WORKFLOWS_PARTICIPANT } from "../lib/delegation.js";
import { createWorkflowRuntime } from "../lib/runtime.js";
import { fakeDelegation, fakeExecution, fakeTimers } from "./fixtures/delegation.mjs";
import { participation, scratchParticipantStore } from "./fixtures/participants.mjs";
```
Then append to the END of `tests/live-order.test.mjs` (after "the runtime refuses to start without its participation options"):
```js

// The plugin end to end: real core.js wiring, real runtime, real child registry on a
// scratch root. The client answers every call retireSession makes (get, abort, delete)
// and turns a synthetic notification prompt into `firstNotification`.
const pluginClient = () => {
  const parents = new Map();
  const deleted = [];
  let notified;
  const firstNotification = new Promise((resolve) => { notified = resolve; });
  return {
    deleted, firstNotification,
    session: {
      get: async ({ path }) => (deleted.includes(path.id)
        ? { error: { status: 404 } }
        : { data: { id: path.id, parentID: parents.get(path.id) } }),
      create: async ({ body }) => {
        const id = `ses_child${parents.size + 1}`;
        parents.set(id, body.parentID);
        return { data: { id } };
      },
      prompt: async ({ path, body }) => {
        if (body.parts[0].synthetic) {
          notified({ id: path.id, text: body.parts[0].text });
          return { data: { parts: [] } };
        }
        return { data: { parts: [{ type: "text", text: `reply from ${path.id}` }] } };
      },
      abort: async () => ({ data: true }),
      delete: async ({ path }) => { deleted.push(path.id); return { data: true }; },
      // lib/notify.js (0.13.0) reads the owner's newest user message for its agent and
      // model before every send; without one the report would queue and never arrive.
      messages: async ({ path }) => ({ data: path.id === "ses_owner"
        ? [{ info: { id: "msg_owner", role: "user", agent: "build", model: { providerID: "p", modelID: "m" } }, parts: [] }]
        : [] }),
      children: async () => ({ data: [] }),
    },
  };
};

// Wraps the real registry so the mode each call receives is observable; every other
// method is the real one.
const watchedRegistry = (root) => {
  const registry = createChildRegistry({ root });
  const modes = [];
  return {
    modes, registry,
    watched: {
      ...registry,
      reserve: (input) => { modes.push(["reserve", input.mode]); return registry.reserve(input); },
      register: (input) => { modes.push(["register", input.mode]); return registry.register(input); },
    },
  };
};

// The tool() helper surface core.js touches: the definition back, and a schema whose
// every builder call chains (the same stand-in tests/workflows.test.mjs uses).
const fakeTool = (definition) => definition;
fakeTool.schema = new Proxy({}, {
  get: () => {
    const chain = new Proxy(() => chain, { get: () => () => chain, apply: () => chain });
    return () => chain;
  },
});

const runThroughPlugin = async ({ background }) => {
  const root = mkdtempSync(join(tmpdir(), "wf-live-registry-"));
  const reconciling = [];
  let plugin = null;
  try {
    const order = [];
    const client = pluginClient();
    const { modes, registry, watched } = watchedRegistry(root);
    const manager = createChildManager({ client, directory: "/d", waitIdle: async () => {}, registry: watched });
    const participants = scratchParticipantStore();
    plugin = createWorkflowPlugin({
      client, directory: "/d", tool: fakeTool,
      delegation: fakeDelegation({ order }), participantTimers: fakeTimers(), participants,
      discover: async () => new Map([["bg", { meta: { name: "bg" }, run: async ({ agent }) => agent("summarise the notes", { intent: "read" }) }]]),
      manager: { ...manager, reconcile: () => { const run = manager.reconcile(); reconciling.push(run); return run; } },
      // The real runtime with core's options untouched; only the run-record store is kept
      // off the real home directory.
      runtimeFactory: (options) => createWorkflowRuntime({ ...options, store: fakeRunStore() }),
    });
    const returned = await plugin.tool.workflow_run.execute({ name: "bg", ...(background ? { background: true } : {}) }, { sessionID: "ses_owner" });
    const notification = background ? await client.firstNotification : null;
    // Read before the finally removes the root: any registry call recreates it.
    const left = { records: registry.list(), reservations: registry.listReservations() };
    return { order, modes, left, participants, client, returned, notification };
  } finally {
    if (plugin) await plugin.dispose();
    // core.js starts manager.reconcile() at plugin init without awaiting it; it must have
    // settled before the registry root is removed, or its lock would recreate the root.
    await Promise.all(reconciling);
    rmSync(root, { recursive: true, force: true });
  }
};

const branchRecord = (participants, delivery) => {
  const [record] = participants.list();
  assert.match(record.registryReservationID, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "the registry reservation is the child registry's own UUID");
  const owner = fakeExecution("ses_owner");
  assert.deepEqual(participants.list(), [{
    runID: "run-test", delivery, branch: { ...owner, branchID: "branch_1", branchFencingToken: 1 },
    ownerExecution: owner, childSessionID: "ses_child1", registryReservationID: record.registryReservationID,
    agent: "scout", prompt: "summarise the notes", directory: "/d", state: "prompted",
    promptStartedAt: record.promptStartedAt, promptedAt: record.promptedAt, outcomeID: null, blocked: false,
    reportDelivery: "none", ownerPID: process.pid,
  }]);
  assert.equal(typeof record.promptStartedAt, "number");
  assert.equal(typeof record.promptedAt, "number");
  return record;
};

const delegationOrder = (delivery, record) => {
  const owner = fakeExecution("ses_owner");
  const branch = { ...owner, branchID: "branch_1", branchFencingToken: 1 };
  return [
    ["registerParticipant", WORKFLOWS_PARTICIPANT],
    ["currentExecution", { sessionID: "ses_owner" }],
    ["reserveBranch", { parentSessionID: "ses_owner", rootSessionID: "ses_owner", ownerExecution: owner, parentBranchID: null, kind: "workflow", delivery }],
    ["bindBranch", { branch, childSessionID: record.childSessionID }],
    ["acknowledgeBranch", { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
  ];
};

test("a background workflow's child goes through the real child registry as a foreground-mode, background-delivery branch", { timeout: 5000 }, async () => {
  const { order, modes, left, participants, client, returned, notification } = await runThroughPlugin({ background: true });
  assert.match(returned, /started in the background/);
  // A failed run would arrive here as '[workflow "bg" FAILED]...' carrying the error,
  // e.g. "managed child reservation does not match created session".
  assert.deepEqual(notification, {
    id: "ses_owner",
    text: '[workflow "bg" finished: run-test]\nRelay the result to the user.\n\nreply from ses_child1',
  });
  assert.doesNotMatch(notification.text, /reservation does not match/);
  assert.deepEqual(modes, [["reserve", "foreground"], ["register", "foreground"]]);
  const record = branchRecord(participants, "background");
  assert.deepEqual(order, delegationOrder("background", record));
  assert.deepEqual(client.deleted, ["ses_child1"]);
  assert.deepEqual(left, { records: [], reservations: [] }, "the child was retired through the registry");
});

test("a foreground workflow's child is reserved with foreground delivery through the same wiring", async () => {
  const { order, modes, left, participants, client, returned } = await runThroughPlugin({ background: false });
  assert.equal(returned, "reply from ses_child1");
  assert.deepEqual(modes, [["reserve", "foreground"], ["register", "foreground"]]);
  const record = branchRecord(participants, "foreground");
  assert.deepEqual(order, delegationOrder("foreground", record));
  assert.deepEqual(client.deleted, ["ses_child1"]);
  assert.deepEqual(left, { records: [], reservations: [] });
});
```

Why each assertion exists (requirement d):
- `modes` proves both registry calls received `"foreground"` for a background run; `reserve()` would throw on anything else, and a mismatched `register()` throws `managed child reservation does not match created session`.
- `notification` is the full literal success report; a run that hit that error would deliver `[workflow "bg" FAILED]` with the message instead, and the `doesNotMatch` names it explicitly.
- `branchRecord` pins the participant record with `delivery: "background"`, the child registry's own UUID as `registryReservationID` (distinct from the branch), and `state: "prompted"` (Task 7 later moves it to `completed`).
- `left` proves the child went through the real registry and was retired through it (nothing left in records or reservations), and `client.deleted` that the session itself was deleted.
- The foreground twin proves the same wiring maps the other mode, so `delivery` is not hardcoded.
- Hygiene: the registry root is removed only after the plugin's unawaited startup `reconcile()` settled and after the last registry read (any registry call recreates its root); `participantTimers: fakeTimers()` installs no real interval, and `dispose` runs in the `finally`.
- `messages` answers the owner's identity (Design decision 20): 0.13's notifier reads it before sending, and with `[]` the success report would queue and the background test would hit its 5 s timeout instead of failing on a diff. The plugin's default `teams` is built over this manager; it arms only its 60 s sweep, which `dispose` cancels.

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/live-order.test.mjs`
Expected: FAIL, `ℹ tests 21`, `ℹ pass 19`, `ℹ fail 2`:
- the background test fails its `notification` `deepEqual` with actual `{ id: 'ses_owner', text: '[workflow "bg" FAILED]\nRelay this to the user: workflows runtime requires participantReady' }` (core does not pass the Task 4 options yet, so the runtime refuses to start);
- the foreground test fails with `Error: workflows runtime requires participantReady`.

- [ ] **Step 3: Wire `lib/core.js`**

3a. Add `createChildRegistry` to the existing child-session import (`lib/core.js:8` at BASE, unchanged by Tasks 1-4). Replace:
```js
import { backgroundTaskResult, createChildManager, nativeTaskState, taskChildFromAfter } from "./child-session.js";
```
with:
```js
import { backgroundTaskResult, createChildManager, createChildRegistry, nativeTaskState, taskChildFromAfter } from "./child-session.js";
```

3b. In the option list, replace Task 2's last option and the closing line:
```js
  participantTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval },
}) => {
```
with:
```js
  participantTimers = { setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval },
  participants = createChildRegistry().participants,
}) => {
```

3c. Directly after Task 2's registration reporter, replace:
```js
    console.error(`workflows participant registration failed: ${String(error?.message ?? error)}`);
  });
  const notifier = createNotifier({ client, directory });
```
with:
```js
    console.error(`workflows participant registration failed: ${String(error?.message ?? error)}`);
  });
  // One delivery-handler map per plugin instance, shared by every run it starts, so
  // plugin-level delivery code can find the live agent() call for a branchID.
  const deliveryHandlers = new Map();
  const notifier = createNotifier({ client, directory });
```

3d. Replace the head of `executeWorkflow` (as Task 1 left it):
```js
  const executeWorkflow = async ({ workflow, args, parentSessionID, resume }) => {
    const runtime = runtimeFactory({
      client, directory, parentSessionID, workflowName: workflow.meta.name,
      resume: resume === true, manager, delegation,
    });
```
with:
```js
  // `delivery` is how this run's report reaches its owner: "background" when the tool
  // returned at once and the report arrives later, "foreground" when the tool call waits.
  // It reaches reserveBranch and the participant record only; the child registry mode
  // stays "foreground" for every workflow child (lib/runtime.js step 3).
  const executeWorkflow = async ({ workflow, args, parentSessionID, resume, delivery }) => {
    const runtime = runtimeFactory({
      client, directory, parentSessionID, workflowName: workflow.meta.name,
      resume: resume === true, manager, delegation,
      participantReady, participants, deliveryHandlers, delivery,
    });
```

3e. In `workflow_run.execute`, replace the background call:
```js
            const started = executeWorkflow({ workflow, args: toolArgs.args, parentSessionID, resume: toolArgs.resume });
```
with:
```js
            const started = executeWorkflow({ workflow, args: toolArgs.args, parentSessionID, resume: toolArgs.resume, delivery: "background" });
```
and the foreground call:
```js
          const { report } = await executeWorkflow({ workflow, args: toolArgs.args, parentSessionID, resume: toolArgs.resume });
```
with:
```js
          const { report } = await executeWorkflow({ workflow, args: toolArgs.args, parentSessionID, resume: toolArgs.resume, delivery: "foreground" });
```
Leave the `started.then(...)` block itself unchanged: Task 8 replaces it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/live-order.test.mjs`
Expected: PASS, `ℹ tests 21`, `ℹ pass 21`, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests 237` (predicted), `ℹ fail 0`.

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* 2>/dev/null | wc -l`
Expected: TMPBASE (from Task 4 Step 2).

- [ ] **Step 5: Commit**

```bash
git add lib/core.js tests/live-order.test.mjs
git commit -m "Pass the participant registration, store, delivery handlers and run delivery mode from the plugin into every workflow runtime"
```

- [ ] **Step 6: Close-out for Tasks 1-5: full suite**

Set BASE as the header's "Baselines and test counts" section says. Then run (workdir `/home/dev/opencode-agent-workflows-plan2`):
```bash
node --test tests/*.mjs
```
Expected: PASS, `ℹ tests 237` (predicted), `ℹ fail 0`. Then `git --no-pager status --porcelain` prints nothing, and `git --no-pager log --oneline "$BASE"..HEAD` shows the commits of Tasks 1, 2, 3, 4 and 5 in that order (plus any review-fix commits plan-run added), and nothing else.

### Task 6: Recover dead-owner participants before child reconciliation

Goal: implement durable participant recovery before the full child-session reconciliation, while
preserving the existing Task 2 startup lifecycle and Task 5 participant plumbing. Child and team
recovery never wait for the participant (RECONCILE R2, decided 2026-10-08; Design decision 19): only
workflow records owned by a participant record are held back until participant recovery succeeds.

> Answer to the Task 6 question (2026-10-08): yes. Adding `prune` as the seventh participants-view
> method is this task's job, so Task 3's key-set assertion must follow it. You may also change
> `/home/dev/opencode-agent-workflows-plan2/tests/participant-records.test.mjs`, but only the
> `Object.keys(participants)` assertion (line 46), which becomes
> `["claim", "get", "list", "prune", "release", "update", "write"]`; change nothing else in that file.
> Partial work from the blocked attempt is in `git stash` as `wip task-6 participant recovery blocked
> by test scope conflict` (stash@{0}); `git stash pop` it and continue from it if it is sound, or drop
> it and start clean. Either way, no stash may be left behind when the task is done.

Architecture and contract: the header's "Shared contract", section "Contract: recovery (Task 6)".

Tech Stack: Node.js ESM, `node:test`, `node:fs`.

#### Scope and integration contract

Change only these implementation and test paths:

- `/home/dev/opencode-agent-workflows-plan2/lib/participant-recovery.js`
- `/home/dev/opencode-agent-workflows-plan2/lib/core.js`
- `/home/dev/opencode-agent-workflows-plan2/tests/participant-recovery.test.mjs`
- `/home/dev/opencode-agent-workflows-plan2/tests/workflows.test.mjs`
- `/home/dev/opencode-agent-workflows-plan2/tests/loop-guard.test.mjs`
- `/home/dev/opencode-agent-workflows-plan2/tests/team-tools.mjs`
- `/home/dev/opencode-agent-workflows-plan2/lib/child-session.js` (only the `reconcile` option and the participants view's `prune` method below)
- `/home/dev/opencode-agent-workflows-plan2/tests/live-order.test.mjs` (only Task 5's `runThroughPlugin` helper, below)

Do not modify `lib/team.js`, runtime, or delivery handlers. In `lib/child-session.js` change only
`reconcile` (the `skipWorkflowRecord` option below) and add one method, `prune`, to Task 3's
`participants` view (Design decision 21 (iv), follow-up 2026-10-08); its six Task 3 methods (`write`,
`get`, `list`, `update`, `claim`, `release`) are used as they are (RECONCILE R1: there is no separate
store module and no store `dir`). In `tests/live-order.test.mjs` change only the two
`runThroughPlugin` sites named below. `manager.retire(childSessionID)` owns workflow-child cleanup;
Task 6 must call it and must not reproduce its ownership, idle, or delete logic. Tasks 8-10 own outcome
handling and report replay; Task 6 must not reinstall a delivery map.

The recovery contract is:

**Eligibility:** Recovery processes only records whose `directory` matches this plugin instance's
directory and whose `ownerPID` is dead (ESRCH from `process.kill(ownerPID, 0)`; EPERM counts as
alive). Records of live owners are never touched. Dead-owner records lose their agent consumer
(the dispatching process is gone), so recovery never re-prompts. Plan-run resumes through its own
ledger by dispatching new children.

Tasks 1-5 must write `ownerPID: process.pid` on the record's first durable write; recovery requires
that field and does not infer an owner from a session.

**Four active states and terminal no-op:**
- `registered`, `acknowledged`, `prompting`, or `prompted`: first call
  `takeOverBranch({branch, ownerExecution})` unless optional `worker` matches the record branch's
  `workerID` and `workerEpoch`, in which case the existing fences are used without a takeover or fence update; persist a takeover answer with
  `store.update({branch, ownerExecution})`; then call
  `failBranch({branch, errorCode: "invalid_branch_state"})` with the taken branch, then
  `store.update(state: "failed")`, then `manager.retire(childSessionID)`. A `failBranch` rejection
  that is `DelegationBranchError` with code `branch_already_terminal` (core already closed the
  branch; Design decision 22 (a)) counts as success: one stderr line, then the same `store.update`,
  `manager.retire` and release, and the loop continues. One with code `invalid_branch_state` (the
  branch is in `handoff`, its outcome pending in core; Design decision 22 (b)) is followed by Plan 1's
  read-only `pendingOutcome({branch, ownerExecution})` (the taken fences). A terminal answer:
  one stderr line, `store.update({outcomeID, state: "terminal"})` (plus `blocked: true` when the
  record's `delivery` is `"background"`), then `acknowledgeOutcome({outcomeID, branch,
  ownerExecution})` with the taken fences, then `store.update({reportDelivery: "delivered"})`; no
  `manager.retire`, then release, and the loop continues. A `null` answer: one stderr line, no
  `store.update` beyond the takeover, no `manager.retire`, then release, and the loop continues.
  A `pendingOutcome` or `acknowledgeOutcome` rejection, or an answer without a non-empty
  `outcomeID`, propagates and keeps the lease. A `takeOverBranch` rejection `owner_alive`, `wrong_domain`,
  `wrong_parent`, `stale_branch` or `unregistered_branch` leaves the record untouched, releases and continues;
  the latter four log the exact refusal line and are left for manual inspection; `branch_already_terminal` records the original
  record failed, retires its child, releases and continues. Any other takeover or failBranch
  rejection propagates as before.
- `completed` or `failed`: skipped from the `list()` snapshot before the owner probe and before any
  claim (final states; Design decision 21 (iv)).
- `terminal`: leave it to the Task 9 outcome replay (acknowledge exactly once).

**Pruning (Design decision 21 (iv)):** after the last record, recovery calls
`store.prune({directory, olderThanMs: PARTICIPANT_PRUNE_AGE_MS})` (exported, 7 days). Under the
registry lock, `prune` deletes the `completed`/`failed` records of `directory` whose owner is dead
(ESRCH), that carry no unexpired lease, and whose file mtime is more than `olderThanMs` older than the
registry clock, and returns their branch IDs sorted. A pass that throws earlier prunes nothing; a
`prune` error propagates.

**Claim mechanism (RECONCILE R1, decided 2026-10-08):** the child registry's retirement lease,
through the `participants` view that recovery receives as `store`. Each `recoverParticipants` call
mints one claimant `` `${process.pid}-${randomUUID()}` `` (the child manager's claimant shape) and,
for every eligible record, calls `store.claim(branchID, claimant)` before acting on it. `claim`
takes the registry lock, re-checks the dead owner under it, and returns null for an absent record,
an owner that is not definitely dead, or another claimant's unexpired lease: null skips the record
for this start. Otherwise it writes `retirement: {claimant, leaseUntil}` (`RETIRE_LEASE_MS`, 3
minutes) and returns the record it read under the lock; that copy, not the `list()` snapshot,
decides the action. Successful actions and no-op states call `store.release(branchID, claimant)`;
  a failed action (`takeOverBranch` rejects with anything but `DelegationBranchError` `owner_alive`, `branch_already_terminal`, `wrong_domain`, `wrong_parent`, `stale_branch` or `unregistered_branch`, `failBranch` rejects with anything but `DelegationBranchError` `branch_already_terminal` or `invalid_branch_state`, `pendingOutcome` or `acknowledgeOutcome` rejects or answers without an `outcomeID`, `store.update` throws,
`manager.retire` rejects) propagates and leaves the lease to expire after `RETIRE_LEASE_MS`, after
which a later start retries. Claims cover every eligible record in an open state or `terminal`, never a
`completed`/`failed` record (by the snapshot), a foreign-directory or a live-owner record.
The lease is the only claim mechanism; the participants view exposes no directory path.

#### Literal tests

The implementing agent creates `tests/participant-recovery.test.mjs` with this complete literal
file before changing production code.

Literal tests: 33 (7 state-loop tests + 26 standalone; the 2026-10-08 follow-ups added the four
after "crash after prompting ...", and the 2026-10-08 terminal-code decision split the
`invalid_branch_state` test in two, Design decision 22, and the 2026-10-08 dead-worker takeover
added three and the takeover fixes added two). The 26 standalone tests (the file places the five takeover tests just before the two
`failBranch` closed-code tests):
"completed and failed terminal states perform no actions", "durable-state idempotency preserves
state across a fresh registry", "concurrent acknowledged-snapshot has one lease holder", "live owner
ownerPID is untouched", "other-directory record is untouched", "owner PID probe EPERM is treated as
alive", "a live foreign lease skips every side effect", "a claim error propagates without side
effects", "failBranch failure keeps the lease and leaves the record at its taken fences", "store.update failure
keeps the live lease and prevents duplicate failure", "an expired lease on an acknowledged record is
taken over and acts once", "the claimed record, not the list snapshot, decides the action",
"successful run over all seven cases leaves no lease", "crash after prompting is recovered with
failBranch exactly once", "completed and failed records are skipped before any claim", "recovery
prunes dead-owner completed and failed records older than 7 days and keeps every other record", "a
failBranch rejection with branch_already_terminal records the branch failed and recovery continues",
"a failBranch rejection with invalid_branch_state (branch in handoff) records the pending outcome
as a terminal, and a null lookup leaves the record as the takeover left it" (rewritten for the
2026-10-08 pending-outcome and dead-worker-takeover decisions; same count), "a failBranch rejection that is neither DelegationBranchError
branch_already_terminal nor invalid_branch_state keeps the lease and stops the pass", "a takeOverBranch
rejection owner_alive leaves the record untouched, releases its lease and recovery continues", "a
takeOverBranch rejection branch_already_terminal records the branch failed without calling failBranch",
"a takeOverBranch rejection wrong_domain, wrong_parent, stale_branch or unregistered_branch skips the record, releases its lease and recovery continues", "a record whose fences already name this process's Worker skips takeOverBranch and fails the branch with its own fences", "any other takeOverBranch rejection propagates, keeps the lease and calls nothing else", and the two
RECONCILE R2 plugin startup tests ("plugin holds back participant-owned records ..." and "a failed
participant registration still runs team and child recovery ..."). Task 6 also appends one test to
`tests/workflows.test.mjs` (below), 34 new tests in all.

```js
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, rmSync, utimesSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import test from "node:test";
import {createChildRegistry} from "../lib/child-session.js";
import {createWorkflowPlugin} from "../lib/core.js";
import {PARTICIPANT_PRUNE_AGE_MS, recoverParticipants} from "../lib/participant-recovery.js";
import {WORKFLOWS_PARTICIPANT} from "../lib/delegation.js";
import {fakeDelegation, fakeExecution, fakeTimers, TAKER, takenOver} from "./fixtures/delegation.mjs";

// No process holds this PID (it is above every pid_max), so kill(pid, 0) answers ESRCH.
const DEAD_PID = 2147483647;
// RETIRE_LEASE_MS in lib/child-session.js (a module constant, not exported).
const LEASE_MS = 3 * 60_000;
const START = 1_000_000;
// Claimants other than the one recoverParticipants mints for each call.
const OTHER = `${process.pid}-other-start`;
const PROBE = `${process.pid}-probe`;

// One scratch child registry per test, removed when the test ends. Recovery works on its
// participants view (RECONCILE R1); the registry clock is injected, so lease expiry is a
// variable, not a wait.
const makeRegistry = (t, time = {now: START}) => {
  assert.throws(() => process.kill(DEAD_PID, 0), (e) => e?.code === "ESRCH");
  const root = mkdtempSync(join(tmpdir(), "wf-participants-"));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  return {root, store: createChildRegistry({root, now: () => time.now}).participants};
};
const makeStore = (t, time) => makeRegistry(t, time).store;

const recordFor = (state) => {
  // A dead process's fences: its Worker is not the fake participant's worker_test/epoch_test, which
  // the plugin passes to recovery as this process's Worker (the own-Worker skip must not fire here).
  const ownerExecution = {...fakeExecution("ses_parent"), workerID: "worker_dead", workerEpoch: "epoch_dead"};
  return {
    runID: "run-recovery",
    delivery: "foreground",
    branch: {
      ...ownerExecution,
      branchID: `branch_${state}`,
      branchFencingToken: 1
    },
    ownerExecution,
    childSessionID: `ses_${state}`,
    registryReservationID: `resv_${state}`,
    agent: "scout",
    prompt: `recover ${state}\nexact stored prompt`,
    directory: "/stored-project",
    state,
    promptStartedAt: ["prompting", "prompted"].includes(state) ? 10 : null,
    promptedAt: state === "prompted" ? 20 : null,
    outcomeID: null,
    blocked: false,
    reportDelivery: "none",
    ownerPID: DEAD_PID
  };
};

const makeGate = () => {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return {promise, resolve};
};

const harness = (store) => {
  const order = [];
  const prompts = [];
  const retires = [];
  return {
    order,
    prompts,
    retires,
    session: {
      prompt: async (input) => {
        prompts.push(input);
        order.push(["session.prompt", input]);
        return {data: {parts: []}};
      }
    }, // Exposed only for the plugin ordering test spy.
    options: {
      delegation: fakeDelegation({order}),
      store: {
        ...store,
        update: (id, patch) => {
          order.push(["store.update", id, patch]);
          return store.update(id, patch);
        }
      },
      manager: {
        // Direct recovery deliberately has no session; manager owns only retirement here.
        retire: async (id) => {
          retires.push(id);
          order.push(["manager.retire", id]);
        }
      },
      directory: "/stored-project"
    }
  };
};

// A held lease declines a fresh claimant (claim answers null for a live foreign lease).
const assertLeased = (store, record) => {
  assert.equal(store.claim(record.branch.branchID, PROBE), null, "a live lease declines a fresh claimant");
};

// No lease is left: a fresh claimant takes the dead owner's record, then gives it back.
const assertUnclaimed = (store, record) => {
  const branchID = record.branch.branchID;
  assert.deepEqual(store.claim(branchID, PROBE), store.get(branchID), "no live lease is left on the record");
  assert.equal(store.release(branchID, PROBE), true);
};

const taken = (record) => takenOver({branch: record.branch, ownerExecution: record.ownerExecution});
const takeOverCall = (record) => ["takeOverBranch", {branch: record.branch, ownerExecution: record.ownerExecution}];
const takenRecord = (record) => ({...record, ...taken(record)});

// Eligibility tests: an ineligible record must be filtered out before any claim.
const forbidClaim = (h) => {
  h.options.store = {
    ...h.options.store,
    claim: () => {
      throw new Error("an ineligible record must never be claimed");
    }
  };
};

const cases = [
  {state: "registered", prompts: 0, failures: 1, updates: 2, retires: 1, next: "failed"},
  {state: "acknowledged", prompts: 0, failures: 1, updates: 2, retires: 1, next: "failed"},
  {state: "prompting", prompts: 0, failures: 1, updates: 2, retires: 1, next: "failed"},
  {state: "prompted", prompts: 0, failures: 1, updates: 2, retires: 1, next: "failed"},
  {state: "completed", prompts: 0, failures: 0, updates: 0, retires: 0, next: "completed"},
  {state: "failed", prompts: 0, failures: 0, updates: 0, retires: 0, next: "failed"},
  {state: "terminal", prompts: 0, failures: 0, updates: 0, retires: 0, next: "terminal"}
];

// A loop case's record; a case's optional `overrides` adds record fields to it.
const caseRecord = (entry) => ({...recordFor(entry.state), ...entry.overrides});

for (const entry of cases) {
  test(`recovers ${entry.state} exactly once`, {timeout: 2000}, async (t) => {
    const store = makeStore(t);
    const record = caseRecord(entry);
    store.write(record);
    const h = harness(store);

    await recoverParticipants(h.options);

    assert.equal(h.prompts.length, entry.prompts);
    assert.equal(h.order.filter(([name]) => name === "failBranch").length, entry.failures);
    assert.equal(h.order.filter(([name]) => name === "store.update").length, entry.updates);
    assert.equal(h.retires.length, entry.retires);
    const stored = store.get(record.branch.branchID);
    if (entry.failures === 1) {
      const failure = {branch: taken(record).branch, errorCode: "invalid_branch_state"};
      assert.deepEqual(h.prompts, []);
      assert.deepEqual(h.retires, [record.childSessionID]);
      assert.deepEqual(h.order, [
        takeOverCall(record),
        ["store.update", record.branch.branchID, taken(record)],
        ["failBranch", failure],
        ["store.update", record.branch.branchID, {state: "failed"}],
        ["manager.retire", record.childSessionID]
      ]);
      assert.deepEqual(stored, {...takenRecord(record), state: "failed"});
    } else {
      assert.deepEqual(h.prompts, []);
      assert.deepEqual(h.retires, []);
      assert.deepEqual(h.order, []);
      assert.deepEqual(stored, record);
    }
    assertUnclaimed(store, record);
  });
}

test("completed and failed terminal states perform no actions", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const completed = recordFor("completed");
  const failed = recordFor("failed");
  store.write(completed);
  store.write(failed);
  const h = harness(store);
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(completed.branch.branchID), completed);
  assert.deepEqual(store.get(failed.branch.branchID), failed);
  assertUnclaimed(store, completed);
  assertUnclaimed(store, failed);
});

test("durable-state idempotency preserves state across a fresh registry", {timeout: 2000}, async (t) => {
  const {root, store} = makeRegistry(t);
  for (const entry of cases) store.write(caseRecord(entry));
  const h = harness(store);
  await recoverParticipants(h.options);
  assert.equal(h.prompts.length, 0);
  assert.equal(h.order.filter(([name]) => name === "failBranch").length, 4);
  assert.equal(h.order.filter(([name]) => name === "store.update").length, 8);
  assert.equal(h.retires.length, 4);
  const records = structuredClone(store.list());
  const order = structuredClone(h.order);
  const prompts = structuredClone(h.prompts);
  const retires = structuredClone(h.retires);
  // A fresh registry on the same root reads only the durable copies.
  const reopened = createChildRegistry({root, now: () => START}).participants;
  h.options.store = reopened;
  await recoverParticipants(h.options);
  assert.deepEqual(reopened.list(), records);
  assert.deepEqual(h.order, order);
  assert.deepEqual(h.prompts, prompts);
  assert.deepEqual(h.retires, retires);
  assert.equal(h.prompts.length, 0);
  assert.equal(h.order.filter(([name]) => name === "failBranch").length, 4);
  assert.equal(h.order.filter(([name]) => name === "store.update").length, 8);
  assert.equal(h.retires.length, 4);
  assertUnclaimed(store, recordFor("acknowledged"));
});

test("concurrent acknowledged-snapshot has one lease holder", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const initialRecord = recordFor("acknowledged");
  store.write(initialRecord);
  const h = harness(store);
  const gate = makeGate();
  let listCount = 0;
  h.options.store = {
    ...h.options.store,
    list: () => {
      listCount += 1;
      return [structuredClone(initialRecord)];
    }
  };
  const baseFailBranch = h.options.delegation.failBranch;
  h.options.delegation = {
    ...h.options.delegation,
    failBranch: async (input) => {
      const result = await baseFailBranch(input);
      await gate.promise;
      return result;
    }
  };
  try {
    // Each call mints its own claimant; the second call's claim meets the first call's live
    // lease (the first call is parked in failBranch) and skips the record.
    const joined = Promise.all([recoverParticipants(h.options), recoverParticipants(h.options)]);
    gate.resolve();
    await joined;
  } finally {
    gate.resolve();
  }
  assert.equal(listCount, 2);
  assert.equal(h.prompts.length, 0);
  assert.equal(h.order.filter(([name]) => name === "failBranch").length, 1);
  assert.equal(h.order.filter(([name]) => name === "store.update").length, 2);
  assert.deepEqual(h.retires, [initialRecord.childSessionID]);
  assert.deepEqual(h.order, [
    takeOverCall(initialRecord),
    ["store.update", initialRecord.branch.branchID, taken(initialRecord)],
    ["failBranch", {branch: taken(initialRecord).branch, errorCode: "invalid_branch_state"}],
    ["store.update", initialRecord.branch.branchID, {state: "failed"}],
    ["manager.retire", initialRecord.childSessionID]
  ]);
  assert.deepEqual(store.get(initialRecord.branch.branchID), {...takenRecord(initialRecord), state: "failed"});
  assertUnclaimed(store, initialRecord);
});

test("live owner ownerPID is untouched", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  record.ownerPID = process.pid; // Live owner.
  store.write(record);
  const h = harness(store);
  forbidClaim(h);
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(record.branch.branchID), record);
});

test("other-directory record is untouched", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  record.directory = "/other-project"; // Different directory.
  store.write(record);
  const h = harness(store);
  forbidClaim(h);
  t.after(() => t.mock.restoreAll());
  t.mock.method(process, "kill", () => {
    throw new Error("directory filter must precede the PID probe");
  });
  await recoverParticipants(h.options);
  t.mock.restoreAll();
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(record.branch.branchID), record);
  assertUnclaimed(store, record);
});

test("owner PID probe EPERM is treated as alive", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  store.write(record);
  const h = harness(store);
  forbidClaim(h);
  let killCalls = 0;
  t.after(() => t.mock.restoreAll());
  t.mock.method(process, "kill", function(pid, signal) {
    killCalls += 1;
    assert.equal(pid, DEAD_PID);
    assert.equal(signal, 0);
    const error = new Error("permission denied");
    error.code = "EPERM";
    throw error;
  });
  await recoverParticipants(h.options);
  assert.equal(killCalls, 1);
  t.mock.restoreAll();
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(record.branch.branchID), record);
  assertUnclaimed(store, record);
});

test("a live foreign lease skips every side effect", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  store.write(record);
  // Another start holds the dead owner's record under an unexpired lease.
  assert.deepEqual(store.claim(record.branch.branchID, OTHER), record);
  const h = harness(store);
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(record.branch.branchID), record);
  assertLeased(store, record);
  assert.equal(store.release(record.branch.branchID, OTHER), true, "the foreign lease is left in place");
});

test("a claim error propagates without side effects", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  const boom = new Error("claim boom");
  store.write(record);
  const h = harness(store);
  h.options.store = {
    ...h.options.store,
    claim: () => {
      throw boom;
    }
  };
  await assert.rejects(recoverParticipants(h.options), (error) => error === boom);
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(record.branch.branchID), record);
  assertUnclaimed(store, record);
});

test("failBranch failure keeps the lease and leaves the record at its taken fences", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("registered");
  const boom = new Error("failBranch boom");
  store.write(record);
  const h = harness(store);
  h.options.delegation = fakeDelegation({fail: {failBranch: boom}, order: h.order});
  await assert.rejects(recoverParticipants(h.options), (error) => error === boom);
  assert.deepEqual(store.get(record.branch.branchID), takenRecord(record));
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(h.order, [takeOverCall(record), ["store.update", record.branch.branchID, taken(record)], ["failBranch", {branch: taken(record).branch, errorCode: "invalid_branch_state"}]]);
  assertLeased(store, record);
});

test("store.update failure keeps the live lease and prevents duplicate failure", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  const boom = new Error("update boom");
  store.write(record);
  const h = harness(store);
  let updateCount = 0;
  h.options.store = {
    ...h.options.store,
    update: (id, patch) => {
      h.order.push(["store.update", id, patch]);
      updateCount += 1;
      if (updateCount === 1) throw boom;
      return store.update(id, patch);
    }
  };
  await assert.rejects(recoverParticipants(h.options), (error) => error === boom);
  assert.deepEqual(store.get(record.branch.branchID), record);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.order, [
    takeOverCall(record),
    ["store.update", record.branch.branchID, taken(record)]
  ]);
  assert.deepEqual(h.retires, []);
  const beforeOrder = structuredClone(h.order);
  const beforePrompts = structuredClone(h.prompts);
  // A second call mints a new claimant, which meets the first call's unexpired lease.
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, beforeOrder);
  assert.deepEqual(h.prompts, beforePrompts);
  assertLeased(store, record);
});

test("an expired lease on an acknowledged record is taken over and acts once", {timeout: 2000}, async (t) => {
  const time = {now: START};
  const store = makeStore(t, time);
  const record = recordFor("acknowledged");
  store.write(record);
  // Another start claimed the record and crashed; its lease runs out.
  assert.deepEqual(store.claim(record.branch.branchID, OTHER), record);
  time.now += LEASE_MS + 1;
  const h = harness(store);
  await recoverParticipants(h.options);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.order, [
    takeOverCall(record),
    ["store.update", record.branch.branchID, taken(record)],
    ["failBranch", {branch: taken(record).branch, errorCode: "invalid_branch_state"}],
    ["store.update", record.branch.branchID, {state: "failed"}],
    ["manager.retire", record.childSessionID]
  ]);
  assert.deepEqual(h.retires, [record.childSessionID]);
  assert.deepEqual(store.get(record.branch.branchID), {...takenRecord(record), state: "failed"});
  assertUnclaimed(store, record);
});

test("the claimed record, not the list snapshot, decides the action", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  // Another start failed the branch after this start's list() snapshot was taken.
  store.write({...record, state: "failed"});
  const h = harness(store);
  h.options.store = {...h.options.store, list: () => [structuredClone(record)]};
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(store.get(record.branch.branchID), {...record, state: "failed"});
  assertUnclaimed(store, record);
});

test("successful run over all seven cases leaves no lease", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  for (const entry of cases) store.write(caseRecord(entry));
  const h = harness(store);
  await recoverParticipants(h.options);
  for (const entry of cases) assertUnclaimed(store, caseRecord(entry));
  assert.equal(h.prompts.length, 0);
  assert.equal(h.order.filter(([name]) => name === "failBranch").length, 4);
  assert.equal(h.order.filter(([name]) => name === "store.update").length, 8);
  assert.equal(h.retires.length, 4);
});

test("crash after prompting is recovered with failBranch exactly once", {timeout: 2000}, async (t) => {
  const time = {now: START};
  const store = makeStore(t, time);
  const record = recordFor("prompting");
  store.write(record);
  // The owner crashed after prompting; an earlier start then claimed the record and crashed
  // before acting, and its lease has expired.
  assert.deepEqual(store.claim(record.branch.branchID, OTHER), record);
  time.now += LEASE_MS + 1;
  const h = harness(store);
  await recoverParticipants(h.options);
  const failure = {branch: taken(record).branch, errorCode: "invalid_branch_state"};
  assert.deepEqual(h.order, [
    takeOverCall(record),
    ["store.update", record.branch.branchID, taken(record)],
    ["failBranch", failure],
    ["store.update", record.branch.branchID, {state: "failed"}],
    ["manager.retire", record.childSessionID]
  ]);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, [record.childSessionID]);
  assert.deepEqual(store.get(record.branch.branchID), {...takenRecord(record), state: "failed"});
  assertUnclaimed(store, record);
  await recoverParticipants(h.options);
  assert.deepEqual(h.order.filter(([name]) => name === "failBranch"), [["failBranch", failure]]);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(h.retires, [record.childSessionID]);
  assertUnclaimed(store, record);
});

// Design decision 21 (iv): final records cost no lease.
test("completed and failed records are skipped before any claim", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const records = [
    recordFor("acknowledged"),
    recordFor("completed"),
    recordFor("failed"),
    // An already-acknowledged terminal, so Task 9's replay leaves it a no-op too.
    {...recordFor("terminal"), outcomeID: "outcome_terminal", reportDelivery: "delivered"}
  ];
  for (const record of records) store.write(record);
  const h = harness(store);
  const claimed = [];
  h.options.store = {
    ...h.options.store,
    claim: (branchID, claimant) => {
      claimed.push(branchID);
      return store.claim(branchID, claimant);
    }
  };
  await recoverParticipants(h.options);
  assert.deepEqual(claimed, ["branch_acknowledged", "branch_terminal"]);
  assert.equal(h.order.filter(([name]) => name === "failBranch").length, 1);
  assert.deepEqual(store.get("branch_completed"), records[1]);
  assert.deepEqual(store.get("branch_failed"), records[2]);
  for (const record of records) assertUnclaimed(store, record);
});

// Design decision 21 (iv): the age is the record file's mtime against the registry clock.
test("recovery prunes dead-owner completed and failed records older than 7 days and keeps every other record", {timeout: 2000}, async (t) => {
  const OLD_S = 1_700_000_000; // a fixed past instant, in seconds
  const YOUNG_S = OLD_S + 6 * 24 * 60 * 60; // six days later: one day old at `time.now`
  const time = {now: OLD_S * 1000 + PARTICIPANT_PRUNE_AGE_MS + 1};
  const {root, store} = makeRegistry(t, time);
  const file = (branchID) => join(root, `participant-${branchID}.json`);
  const on = (state, branchID, overrides = {}) => {
    const base = recordFor(state);
    return {...base, branch: {...base.branch, branchID, branchFencingToken: 1}, ...overrides};
  };
  const records = [
    on("completed", "branch_old_completed"),
    on("failed", "branch_old_failed"),
    on("completed", "branch_young_completed"),
    on("terminal", "branch_old_terminal", {outcomeID: "outcome_old", reportDelivery: "delivered"}),
    on("completed", "branch_other_directory", {directory: "/other-project"}),
    on("completed", "branch_live_owner", {ownerPID: process.pid}),
    on("failed", "branch_leased")
  ];
  for (const record of records) store.write(record);
  // Another start holds an unexpired lease on this one.
  assert.deepEqual(store.claim("branch_leased", OTHER), records[6]);
  for (const record of records) {
    const seconds = record.branch.branchID === "branch_young_completed" ? YOUNG_S : OLD_S;
    utimesSync(file(record.branch.branchID), seconds, seconds);
  }
  const h = harness(store);
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, []);
  assert.deepEqual(h.retires, []);
  assert.equal(existsSync(file("branch_old_completed")), false);
  assert.equal(existsSync(file("branch_old_failed")), false);
  assert.deepEqual(store.list().map((record) => record.branch.branchID), [
    "branch_leased", "branch_live_owner", "branch_old_terminal", "branch_other_directory", "branch_young_completed"
  ]);
  assert.deepEqual(store.prune({directory: "/stored-project", olderThanMs: PARTICIPANT_PRUNE_AGE_MS}), [], "a second prune finds nothing");
  for (const input of [{directory: "", olderThanMs: 1}, {directory: "/stored-project", olderThanMs: 0}, undefined]) {
    assert.throws(() => store.prune(input), {message: "participant record prune needs a directory and a positive age"});
  }
});

// Plan 1's DelegationBranchApi rejects with the tagged struct itself (a plain object, not an
// Error), which fakeDelegation's `fail` option refuses, so the Design decision 22 tests replace
// failBranch: the fake still records the call in h.order, then `answer(input)` is thrown.
const rejectFailBranch = (h, answer) => {
  const base = h.options.delegation;
  h.options.delegation = {
    ...base,
    failBranch: async (input) => {
      await base.failBranch(input);
      throw answer(input);
    }
  };
};

// takeOverBranch returns a plain tagged rejection in Plan 1 too; retain the fake's recorded call.
const rejectTakeOver = (h, answer) => {
  const base = h.options.delegation;
  h.options.delegation = {
    ...base,
    takeOverBranch: async (input) => {
      await base.takeOverBranch(input);
      throw answer(input);
    }
  };
};

test("a takeOverBranch rejection owner_alive leaves the record untouched, releases its lease and recovery continues", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const first = recordFor("acknowledged");
  const second = recordFor("prompted");
  store.write(first);
  store.write(second);
  const h = harness(store);
  // Only the first record's takeover is refused; the second goes through the fake (and its order).
  const base = h.options.delegation;
  h.options.delegation = {
    ...base,
    takeOverBranch: async (input) => {
      const answer = await base.takeOverBranch(input);
      if (input.branch.branchID === first.branch.branchID) throw {_tag: "DelegationBranchError", code: "owner_alive"};
      return answer;
    }
  };
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, [
    takeOverCall(first),
    takeOverCall(second),
    ["store.update", second.branch.branchID, taken(second)],
    ["failBranch", {branch: taken(second).branch, errorCode: "invalid_branch_state"}],
    ["store.update", second.branch.branchID, {state: "failed"}],
    ["manager.retire", second.childSessionID]
  ]);
  assert.deepEqual(store.get(first.branch.branchID), first);
  assertUnclaimed(store, first);
  assert.deepEqual(h.retires, [second.childSessionID]);
});

test("a takeOverBranch rejection branch_already_terminal records the branch failed without calling failBranch", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  store.write(record);
  const h = harness(store);
  rejectTakeOver(h, () => ({_tag: "DelegationBranchError", code: "branch_already_terminal"}));
  await recoverParticipants(h.options);
  assert.deepEqual(h.order, [takeOverCall(record), ["store.update", record.branch.branchID, {state: "failed"}], ["manager.retire", record.childSessionID]]);
  assert.deepEqual(store.get(record.branch.branchID), {...record, state: "failed"});
  assert.deepEqual(h.retires, [record.childSessionID]);
  assertUnclaimed(store, record);
});

test("a takeOverBranch rejection wrong_domain, wrong_parent, stale_branch or unregistered_branch skips the record, releases its lease and recovery continues", {timeout: 2000}, async (t) => {
  for (const code of ["wrong_domain", "wrong_parent", "stale_branch", "unregistered_branch"]) {
    const store = makeStore(t);
    const first = recordFor("acknowledged");
    const second = recordFor("prompted");
    store.write(first); store.write(second);
    const h = harness(store);
    const errors = t.mock.method(console, "error", () => {});
    const base = h.options.delegation;
    h.options.delegation = {...base, takeOverBranch: async (input) => {
      const answer = await base.takeOverBranch(input);
      if (input.branch.branchID === first.branch.branchID) throw {_tag: "DelegationBranchError", code};
      return answer;
    }};
    await recoverParticipants(h.options);
    assert.deepEqual(h.order, [takeOverCall(first), takeOverCall(second), ["store.update", second.branch.branchID, taken(second)], ["failBranch", {branch: taken(second).branch, errorCode: "invalid_branch_state"}], ["store.update", second.branch.branchID, {state: "failed"}], ["manager.retire", second.childSessionID]]);
    assert.deepEqual(store.get(first.branch.branchID), first);
    assertUnclaimed(store, first);
    assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [`participant recovery: core refused the takeover of branch ${first.branch.branchID} (${code}); leaving its record for manual inspection`]);
    t.mock.restoreAll();
  }
});

test("a record whose fences already name this process's Worker skips takeOverBranch and fails the branch with its own fences", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  // `own` already carries fences this process (Worker TAKER) took in an earlier pass whose failBranch
  // threw; `foreign` still carries a dead owner's fences and must be taken over as usual.
  const original = recordFor("acknowledged");
  const own = {...original, ...taken(original)};
  const foreign = recordFor("prompted");
  store.write(own);
  store.write(foreign);
  const h = harness(store);
  await recoverParticipants({...h.options, worker: TAKER});
  assert.deepEqual(h.order, [
    ["failBranch", {branch: own.branch, errorCode: "invalid_branch_state"}],
    ["store.update", own.branch.branchID, {state: "failed"}],
    ["manager.retire", own.childSessionID],
    takeOverCall(foreign),
    ["store.update", foreign.branch.branchID, taken(foreign)],
    ["failBranch", {branch: taken(foreign).branch, errorCode: "invalid_branch_state"}],
    ["store.update", foreign.branch.branchID, {state: "failed"}],
    ["manager.retire", foreign.childSessionID]
  ]);
  assert.deepEqual(store.get(own.branch.branchID), {...own, state: "failed"});
  assertUnclaimed(store, own);
});

test("any other takeOverBranch rejection propagates, keeps the lease and calls nothing else", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  const refused = {_tag: "DelegationBranchError", code: "stale_worker"};
  store.write(record);
  const h = harness(store);
  rejectTakeOver(h, () => refused);
  await assert.rejects(recoverParticipants(h.options), (error) => error === refused);
  assert.deepEqual(h.order, [takeOverCall(record)]);
  assert.deepEqual(store.get(record.branch.branchID), record);
  assertLeased(store, record);
});

// Design decision 22 (a): Plan 1 answers branch_already_terminal for a branch an earlier start
// (or core) already closed; the record is recorded failed like a successful failBranch.
test("a failBranch rejection with branch_already_terminal records the branch failed and recovery continues", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  const first = recordFor("acknowledged");
  const second = recordFor("prompted");
  store.write(first);
  store.write(second);
  const h = harness(store);
  rejectFailBranch(h, () => ({_tag: "DelegationBranchError", code: "branch_already_terminal"}));
  await recoverParticipants(h.options);
  const failure = (record) => ({branch: taken(record).branch, errorCode: "invalid_branch_state"});
  assert.deepEqual(h.order, [
    takeOverCall(first),
    ["store.update", first.branch.branchID, taken(first)],
    ["failBranch", failure(first)],
    ["store.update", first.branch.branchID, {state: "failed"}],
    ["manager.retire", first.childSessionID],
    takeOverCall(second),
    ["store.update", second.branch.branchID, taken(second)],
    ["failBranch", failure(second)],
    ["store.update", second.branch.branchID, {state: "failed"}],
    ["manager.retire", second.childSessionID]
  ]);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(store.get(first.branch.branchID), {...takenRecord(first), state: "failed"});
  assert.deepEqual(store.get(second.branch.branchID), {...takenRecord(second), state: "failed"});
  assertUnclaimed(store, first);
  assertUnclaimed(store, second);
});

// fakeDelegation's pendingOutcome (Plan 1's read-only lookup, decided 2026-10-08) always answers
// null, so the Design decision 22 (b) tests replace it: the fake still records the call in
// h.order, then `answer(input)` is returned (a throwing `answer` rejects).
const answerPendingOutcome = (h, answer) => {
  const base = h.options.delegation;
  h.options.delegation = {
    ...base,
    pendingOutcome: async (input) => {
      await base.pendingOutcome(input);
      return answer(input);
    }
  };
};

// Design decision 22 (b), decided 2026-10-08: invalid_branch_state from fail means the branch is
// in handoff and core holds its one pending outcome. Recovery reads it with pendingOutcome (the
// taken branch and owner fences) and records it as a terminal (background delivery also
// blocked), acknowledges it in this pass, then marks delivery complete; no retire. A null answer
// (core closed the branch in between) leaves the record as the takeover left it. A lookup rejection keeps
// the lease and stops the pass.
test("a failBranch rejection with invalid_branch_state (branch in handoff) records the pending outcome as a terminal, and a null lookup leaves the record as the takeover left it", {timeout: 2000}, async (t) => {
  const store = makeStore(t);
  // list() order is by branch ID: branch_acknowledged, branch_prompted, branch_prompting.
  const first = recordFor("acknowledged");
  const second = recordFor("prompted");
  const third = {...recordFor("prompting"), delivery: "background"};
  for (const record of [first, second, third]) store.write(record);
  const h = harness(store);
  rejectFailBranch(h, () => ({_tag: "DelegationBranchError", code: "invalid_branch_state"}));
  const handoffTerminal = (record, outcomeID) => ({outcomeID, branchID: record.branch.branchID, kind: "permission_handoff", errorCode: null});
  const answers = {
    [first.branch.branchID]: handoffTerminal(first, "outcome_first"),
    [second.branch.branchID]: null,
    [third.branch.branchID]: handoffTerminal(third, "outcome_third")
  };
  answerPendingOutcome(h, ({branch}) => answers[branch.branchID]);
  await recoverParticipants(h.options);
  const failure = (record) => ({branch: taken(record).branch, errorCode: "invalid_branch_state"});
  const lookup = (record) => ({branch: taken(record).branch, ownerExecution: taken(record).ownerExecution});
  assert.deepEqual(h.order, [
    takeOverCall(first),
    ["store.update", first.branch.branchID, taken(first)],
    ["failBranch", failure(first)],
    ["pendingOutcome", lookup(first)],
    ["store.update", first.branch.branchID, {outcomeID: "outcome_first", state: "terminal"}],
    ["acknowledgeOutcome", {outcomeID: "outcome_first", branch: taken(first).branch, ownerExecution: taken(first).ownerExecution}],
    ["store.update", first.branch.branchID, {reportDelivery: "delivered"}],
    takeOverCall(second),
    ["store.update", second.branch.branchID, taken(second)],
    ["failBranch", failure(second)],
    ["pendingOutcome", lookup(second)],
    takeOverCall(third),
    ["store.update", third.branch.branchID, taken(third)],
    ["failBranch", failure(third)],
    ["pendingOutcome", lookup(third)],
    ["store.update", third.branch.branchID, {outcomeID: "outcome_third", blocked: true, state: "terminal"}],
    ["acknowledgeOutcome", {outcomeID: "outcome_third", branch: taken(third).branch, ownerExecution: taken(third).ownerExecution}],
    ["store.update", third.branch.branchID, {reportDelivery: "delivered"}]
  ]);
  assert.deepEqual(h.retires, []);
  assert.deepEqual(h.prompts, []);
  assert.deepEqual(store.get(first.branch.branchID), {...takenRecord(first), outcomeID: "outcome_first", state: "terminal", reportDelivery: "delivered"});
  assert.deepEqual(store.get(second.branch.branchID), takenRecord(second));
  assert.deepEqual(store.get(third.branch.branchID), {...takenRecord(third), outcomeID: "outcome_third", blocked: true, state: "terminal", reportDelivery: "delivered"});
  for (const record of [first, second, third]) assertUnclaimed(store, record);

  const failing = makeStore(t);
  const lone = recordFor("acknowledged");
  failing.write(lone);
  const f = harness(failing);
  rejectFailBranch(f, () => ({_tag: "DelegationBranchError", code: "invalid_branch_state"}));
  const refused = {_tag: "DelegationOutcomeError", code: "wrong_owner"};
  answerPendingOutcome(f, () => { throw refused; });
  await assert.rejects(recoverParticipants(f.options), (error) => error === refused);
  assert.deepEqual(f.order, [takeOverCall(lone), ["store.update", lone.branch.branchID, taken(lone)], ["failBranch", failure(lone)], ["pendingOutcome", lookup(lone)] ]);
  assert.deepEqual(failing.get(lone.branch.branchID), takenRecord(lone));
  assertLeased(failing, lone);
});

test("a failBranch rejection that is neither DelegationBranchError branch_already_terminal nor invalid_branch_state keeps the lease and stops the pass", {timeout: 2000}, async (t) => {
  for (const rejection of [
    {_tag: "DelegationBranchError", code: "stale_worker"},
    {code: "branch_already_terminal"},
    {code: "invalid_branch_state"},
    new Error("branch_already_terminal"),
    new Error("invalid_branch_state")
  ]) {
    const store = makeStore(t);
    const first = recordFor("acknowledged");
    const second = recordFor("prompted");
    store.write(first);
    store.write(second);
    const h = harness(store);
    rejectFailBranch(h, () => rejection);
    await assert.rejects(recoverParticipants(h.options), (error) => error === rejection);
    assert.deepEqual(h.order, [takeOverCall(first), ["store.update", first.branch.branchID, taken(first)], ["failBranch", {branch: taken(first).branch, errorCode: "invalid_branch_state"}]]);
    assert.deepEqual(h.retires, []);
    assert.deepEqual(store.get(first.branch.branchID), takenRecord(first));
    assert.deepEqual(store.get(second.branch.branchID), second);
    assertLeased(store, first);
    assertUnclaimed(store, second);
  }
});

test("plugin holds back participant-owned records at once and runs the full reconcile only after registration and recovery", {timeout: 2000}, async (t) => {
  const fakeTool=(definition)=>definition;
  fakeTool.schema=new Proxy({}, {get:()=>{
    const chain=new Proxy(()=>chain,{
      get:()=>()=>chain,
      apply:()=>chain
    });
    return ()=>chain;
  }});
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  store.write(record);
  const h = harness(store);
  const registrationReady = makeGate();
  const failureStarted = makeGate();
  const failureGate = makeGate();
  const reconcileSeen = makeGate();
  const base = h.options.delegation;
  const delegation = {
    ...base,
    registerParticipant: async (input) => {
      const result = await base.registerParticipant(input);
      await registrationReady.promise;
      h.order.push(["participantReady"]);
      return result;
    },
    failBranch: async (input) => {
      const result = await base.failBranch(input);
      failureStarted.resolve();
      await failureGate.promise;
      return result;
    }
  };
  const watchedStore = {
    ...h.options.store,
    list: () => {
      h.order.push(["store.list"]);
      return store.list();
    }
  };
  const manager = {
    ...h.options.manager,
    reconcile: async (options) => {
      if (options !== undefined) {
        // Pass 1: runs before registration resolves and holds back
        // exactly the participant-owned child.
        assert.equal(options.skipWorkflowRecord({source: "workflow", sessionID: record.childSessionID}), true);
        assert.equal(options.skipWorkflowRecord({source: "workflow", sessionID: "ses_unowned"}), false);
        h.order.push(["manager.reconcile", "held"]);
        return;
      }
      assert.equal(store.get(record.branch.branchID).state, "failed");
      assert.deepEqual(h.retires, [record.childSessionID]);
      assertUnclaimed(store, record);
      h.order.push(["manager.reconcile", "full"]);
      reconcileSeen.resolve();
    }
  };
  let plugin;
  try {
    plugin = createWorkflowPlugin({
      client: {session: h.session},
      directory: "/stored-project",
      tool: fakeTool,
      manager,
      delegation,
      participants: watchedStore,
      participantTimers: fakeTimers(),
      discover: async () => new Map()
    });
    await new Promise(setImmediate);
    // Pass 1 has run while registration is still pending: the participant records were read
    // once to build skipWorkflowRecord, and nothing was failed or retired.
    assert.deepEqual(h.order, [
      ["registerParticipant", WORKFLOWS_PARTICIPANT],
      ["store.list"],
      ["manager.reconcile", "held"]
    ]);
    assert.equal(store.get(record.branch.branchID).state, "acknowledged");
    registrationReady.resolve();
    await failureStarted.promise;
    assert.equal(store.get(record.branch.branchID).state, "acknowledged");
    assert.deepEqual(h.order, [
      ["registerParticipant", WORKFLOWS_PARTICIPANT],
      ["store.list"],
      ["manager.reconcile", "held"],
      ["participantReady"],
      ["store.list"],
      takeOverCall(record),
      ["store.update", record.branch.branchID, taken(record)],
      ["failBranch", {branch: taken(record).branch, errorCode: "invalid_branch_state"}]
    ]);
    failureGate.resolve();
    await reconcileSeen.promise;
    await new Promise(setImmediate);
    assert.deepEqual(h.order, [
      ["registerParticipant", WORKFLOWS_PARTICIPANT],
      ["store.list"],
      ["manager.reconcile", "held"],
      ["participantReady"],
      ["store.list"],
      takeOverCall(record),
      ["store.update", record.branch.branchID, taken(record)],
      ["failBranch", {branch: taken(record).branch, errorCode: "invalid_branch_state"}],
      ["store.update", record.branch.branchID, {state: "failed"}],
      ["manager.retire", record.childSessionID],
      ["manager.reconcile", "full"]
    ]);
    assert.equal(h.prompts.length, 0);
    assert.equal(h.order.filter(([name]) => name === "failBranch").length, 1);
    assert.deepEqual(h.retires, [record.childSessionID]);
  } finally {
    registrationReady.resolve();
    failureGate.resolve();
    await new Promise(setImmediate);
    if (plugin) await plugin.dispose();
  }
});

// Child and team recovery never wait for the delegation participant.
test("a failed participant registration still runs team and child recovery and holds back participant-owned records", {timeout: 2000}, async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const fakeTool=(definition)=>definition;
  fakeTool.schema=new Proxy({}, {get:()=>{
    const chain=new Proxy(()=>chain,{
      get:()=>()=>chain,
      apply:()=>chain
    });
    return ()=>chain;
  }});
  const store = makeStore(t);
  const record = recordFor("acknowledged");
  store.write(record);
  const h = harness(store);
  const held = [];
  const plugin = createWorkflowPlugin({
    client: {session: h.session},
    directory: "/stored-project",
    tool: fakeTool,
    manager: {
      ...h.options.manager,
      reconcile: async (options) => {
        h.order.push(["manager.reconcile", options === undefined ? "full" : "held"]);
        if (options !== undefined) held.push(options.skipWorkflowRecord);
      }
    },
    // Only startRecovery runs at construction and only stop at dispose; the team tools
    // and hooks touch teams lazily, and none runs here.
    teams: {
      startRecovery: () => { h.order.push(["teams.startRecovery"]); },
      stop: async () => {}
    },
    delegation: fakeDelegation({order: h.order, fail: {registerParticipant: new Error("core unavailable")}}),
    participants: store,
    participantTimers: fakeTimers(),
    discover: async () => new Map()
  });
  try {
    for (let turn = 0; turn < 5; turn += 1) await new Promise(setImmediate);
    assert.deepEqual(h.order, [
      ["registerParticipant", WORKFLOWS_PARTICIPANT],
      ["teams.startRecovery"],
      ["manager.reconcile", "held"]
    ]);
    assert.equal(held.length, 1);
    assert.equal(held[0]({source: "workflow", sessionID: record.childSessionID}), true);
    assert.equal(held[0]({source: "workflow", sessionID: "ses_unowned"}), false);
    assert.equal(store.get(record.branch.branchID).state, "acknowledged");
    assertUnclaimed(store, record);
    assert.deepEqual(h.retires, []);
    assert.deepEqual(h.prompts, []);
    assert.deepEqual(errors.mock.calls.map((call) => call.arguments[0]), [
      "workflows participant registration failed: core unavailable",
      "participant startup recovery failed: core unavailable"
    ]);
  } finally {
    await plugin.dispose();
  }
});
```

Future RED command: `node --test tests/participant-recovery.test.mjs` from workdir
`/home/dev/opencode-agent-workflows-plan2`. Expected before implementation: missing module or
export; this is not observed output.

Follow-up RED (2026-10-08; run it after the module exists, then finish the module): write the
module first WITHOUT the follow-up lines (no `FINAL_STATES` skip, no `prune` in `VIEW_METHODS` and no
`store.prune` call, no `rejectedWith`/`failOpenBranch` helpers: `failBranch` is awaited directly inside
`if (OPEN_STATES.includes(record.state)) { ... }` with no `try`/`catch`, no `takeOver` helper or
`takeOverBranch` call, and no `prune` method in
`lib/child-session.js`), and export `PARTICIPANT_PRUNE_AGE_MS` so the file loads. Run
`node --test --test-name-pattern="skipped before any claim|prunes dead-owner|branch_already_terminal|invalid_branch_state|takeOverBranch" tests/participant-recovery.test.mjs`.
Expected: `ℹ tests 10`, `ℹ fail 10` (predicted, never run: five prior selections, the three takeover tests and the two takeover-fix tests; every one fails).
The ten failures: the two takeover-fix tests on their `h.order` `deepEqual` -- the permanent-refusal test because the reduced module calls `failBranch` on its first record instead of `takeOverBranch` (and logs no refusal line), the own-Worker test on its second record, which the reduced module fails with the dead owner's fences instead of taking it over first (its first record, already carrying this Worker's fences, would match: that half alone does not discriminate, which is why the test carries the foreign record); and the eight that follow: the skip test on `assert.deepEqual(claimed, ...)` (the claims also name
`branch_completed` and `branch_failed`); the prune test on `existsSync(file("branch_old_completed"))`
being `true`; "a failBranch rejection with branch_already_terminal records ..." and "a
failBranch rejection with invalid_branch_state (branch in handoff) ..." on the rejection propagating
out of `recoverParticipants`; "a failBranch rejection that is neither ..." on its `h.order`
`deepEqual` (the reduced module makes no `takeOverBranch` call and no fence `store.update`, which its
literal now expects -- before the 2026-10-08 takeover decision this test was a regression guard that
passed against both versions); and the three takeover tests on their `h.order` `deepEqual` (no
`takeOverBranch` entry; the `owner_alive` and other-rejection tests also see `failBranch` calls and,
for the other rejection, no propagated error). A version that treated `invalid_branch_state`
as success (the superseded rule) fails the handoff test on its first `h.order` `deepEqual` (actual
holds `store.update` and `manager.retire`), and so does one that leaves a `handoff` record untouched
without the lookup (the rule before the 2026-10-08 pending-outcome decision; actual holds no
`pendingOutcome` entries). Any other failure means the test is wrong: stop and report it. Then add the follow-up lines
and continue with GREEN.

Then, still before any production change, append this test to the end of `tests/workflows.test.mjs`
(it uses the file's existing `createChildRegistry`, `managed`, `deadPID`, `sdkNotFound`,
`mkdtempSync`, `writeFileSync`, `rmSync`, `join` and `tmpdir`):

```js
test("reconcile holds back the workflow records its skipWorkflowRecord predicate names", async () => {
  const root = mkdtempSync(join(tmpdir(), "wf-held-"));
  try {
    const registry = createChildRegistry({ root });
    const ownerPID = await deadPID();
    for (const sessionID of ["ses_held", "ses_free"]) {
      registry.register({ sessionID, parentSessionID: "ses_parent", directory: "/work/a", source: "workflow", mode: "foreground" });
      // register() stamps the live PID; rewrite it as a crashed owner.
      writeFileSync(join(root, `${sessionID}.json`), JSON.stringify({ ...registry.read(sessionID), ownerPID }));
    }
    const client = {
      session: {
        get: async ({ path }) => sdkNotFound(path.id),
        messages: async () => sdkNotFound("ses_parent"),
      },
    };
    const manager = managed(client, registry, "/work/a");
    await manager.reconcile({ skipWorkflowRecord: (record) => record.sessionID === "ses_held" });
    assert.equal(registry.read("ses_free"), null, "an unheld dead-owner workflow record is retired");
    assert.ok(registry.read("ses_held"), "a held-back record waits for participant recovery");
    await manager.reconcile();
    assert.equal(registry.read("ses_held"), null, "the full reconcile retires it");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

RED (run it; this one is observable): `node --test --test-name-pattern="skipWorkflowRecord" tests/workflows.test.mjs`
from the same workdir. Expected: FAIL, `ℹ tests 1`, `ℹ fail 1`, on the assertion message
`a held-back record waits for participant recovery` (the BASE `reconcile` ignores its argument and
retires both records). Any other failure (for example in `register` or the record path) means the
test is wrong, not RED: stop and report it.

#### Literal implementation

Create `lib/participant-recovery.js` as this complete module (it imports nothing from
`node:fs`: every read, claim, write and release goes through Task 3's `participants` view):

```js
import {randomUUID} from "node:crypto";

// The child registry's participants view (lib/child-session.js, Task 3, plus Task 6's prune;
// RECONCILE R1).
const VIEW_METHODS = ["write", "get", "list", "update", "claim", "release", "prune"];
const OPEN_STATES = ["registered", "acknowledged", "prompting", "prompted"];
// Nothing moves a record out of these states, so the list() snapshot is enough to skip them
// without a probe or a lease (Design decision 21 (iv)).
const FINAL_STATES = ["completed", "failed"];
const TAKEOVER_REFUSALS = ["wrong_domain", "wrong_parent", "stale_branch", "unregistered_branch"];
// Dead owners' final records older than this (by file mtime) are pruned after each pass.
export const PARTICIPANT_PRUNE_AGE_MS = 7 * 24 * 60 * 60_000;

// Plan 1's BranchService.fail accepts reserved, registered, acknowledged and running. A terminal
// branch (completed, failed, outcome_acknowledged, retiring, retired) rejects with
// branch_already_terminal; the one other state, handoff (outcome pending in core), rejects with
// invalid_branch_state (Design decision 22).
const rejectedWith = (error, code) =>
  error?._tag === "DelegationBranchError" && error.code === code;

// Plan 1's dead-worker takeover (decided 2026-10-08): core refuses a dead owner's recorded fences on
// every call, so the branch is first re-fenced to this process and the taken fences are persisted
// before any other call uses them. If the stored branch already names this process's Worker,
// core would answer owner_alive; retry with its own persisted fences instead. Answers { record } or { skip }.
const takeOver = async (delegation, store, record, worker) => {
  const branchID = record.branch.branchID;
  if (worker && record.branch.workerID === worker.workerID && record.branch.workerEpoch === worker.workerEpoch) {
    return {record};
  }
  let taken;
  try {
    taken = await delegation.takeOverBranch({branch: record.branch, ownerExecution: record.ownerExecution});
  } catch (error) {
    if (rejectedWith(error, "owner_alive")) {
      console.error(`participant recovery: core reports the owner of branch ${branchID} still live (owner_alive); leaving its record for a later start`);
      return {skip: "owner_alive"};
    }
    if (rejectedWith(error, "branch_already_terminal")) {
      console.error(`participant recovery: core reports branch ${branchID} already terminal (branch_already_terminal)`);
      return {skip: "terminal"};
    }
    if (error?._tag === "DelegationBranchError" && TAKEOVER_REFUSALS.includes(error.code)) {
      console.error(`participant recovery: core refused the takeover of branch ${branchID} (${error.code}); leaving its record for manual inspection`);
      return {skip: "refused"};
    }
    throw error;
  }
  store.update(branchID, {branch: taken.branch, ownerExecution: taken.ownerExecution});
  return {record: {...record, branch: taken.branch, ownerExecution: taken.ownerExecution}};
};

// Fails the record's branch in core. true: record the branch failed and retire its child (fail
// succeeded, or core had already closed the branch). false: neither -- the branch is in
// handoff, and its pending outcome, if core still holds one, is recorded and acknowledged with the
// taken fences in this pass (Design decision 22 (b)). Every other failBranch rejection, and any
// pendingOutcome rejection, propagates and keeps the lease.
const failOpenBranch = async (delegation, store, record) => {
  const branchID = record.branch.branchID;
  try {
    await delegation.failBranch({branch: record.branch, errorCode: "invalid_branch_state"});
    return true;
  } catch (error) {
    if (rejectedWith(error, "branch_already_terminal")) {
      console.error(`participant recovery: core reports branch ${branchID} already terminal (branch_already_terminal); recording it failed`);
      return true;
    }
    if (!rejectedWith(error, "invalid_branch_state")) throw error;
  }
  // The branch is in handoff. Plan 1's read-only pendingOutcome (decided 2026-10-08) takes the taken
  // fences resolveOutcome takes; it answers the branch's one pending outcome, or null once core
  // has closed the branch since the failBranch above.
  const pending = await delegation.pendingOutcome({branch: record.branch, ownerExecution: record.ownerExecution});
  if (pending === null) {
    console.error(`participant recovery: core reports branch ${branchID} in handoff but no pending outcome for it now; leaving its record as taken over`);
    return false;
  }
  if (typeof pending?.outcomeID !== "string" || pending.outcomeID.length === 0) {
    throw new Error(`participant recovery: pendingOutcome for branch ${branchID} answered without an outcomeID`);
  }
  console.error(`participant recovery: core reports branch ${branchID} in handoff (invalid_branch_state); recording and acknowledging outcome ${pending.outcomeID}`);
  // The Task 9 settler's patches: a background-delivery record is also marked blocked.
  store.update(branchID, record.delivery === "background"
    ? {outcomeID: pending.outcomeID, blocked: true, state: "terminal"}
    : {outcomeID: pending.outcomeID, state: "terminal"});
  await delegation.acknowledgeOutcome({outcomeID: pending.outcomeID, branch: record.branch, ownerExecution: record.ownerExecution});
  store.update(branchID, {reportDelivery: "delivered"});
  return false;
};

export const recoverParticipants = async ({delegation, store, manager, directory, worker}) => {
  if (!VIEW_METHODS.every((name) => typeof store?.[name] === "function")) {
    throw new Error("participant recovery requires the child registry's participants view");
  }
  if (typeof directory !== "string" || directory.length === 0) {
    throw new Error("participant recovery requires directory");
  }
  if (worker !== undefined && (typeof worker?.workerID !== "string" || worker.workerID.length === 0 ||
    typeof worker.workerEpoch !== "string" || worker.workerEpoch.length === 0)) {
    throw new Error("participant recovery: worker must be a WorkerFence when given");
  }
  // One claimant per call, shaped like the child manager's: a second start, or a second
  // call in this process, never holds the same lease.
  const claimant = `${process.pid}-${randomUUID()}`;

  for (const listed of store.list()) {
    // Filter by directory first, then by final state, then by owner PID liveness.
    if (listed.directory !== directory) continue;
    if (FINAL_STATES.includes(listed.state)) continue;

    try {
      process.kill(listed.ownerPID, 0);
      continue; // Owner is alive.
    } catch (error) {
      if (error?.code === "EPERM") continue; // EPERM means alive.
      if (error?.code !== "ESRCH") throw error; // Other errors propagate.
    }
    // Owner is dead (ESRCH); claim, then act.

    const branchID = listed.branch.branchID;
    // The registry lease is the mutual exclusion between two starting processes: claim
    // re-checks the dead owner under the registry lock and answers null for another
    // claimant's unexpired lease (or an owner that is not dead after all), so this start
    // skips the record. Claim errors propagate.
    const record = store.claim(branchID, claimant);
    if (record === null) continue;
    // `record` is the copy claim read under the lock, not the list() snapshot: another
    // start may have failed the branch in between.

    // Ordering: take the dead owner's branch over before every other core call, persist its
    // fences, then fail it before the record says "failed" and before the child is retired.
    // A handoff branch stays terminal and acknowledged in this pass, or stays as taken when core
    // no longer holds its outcome.
    if (OPEN_STATES.includes(record.state)) {
      const taken = await takeOver(delegation, store, record, worker);
      if (taken.skip === "terminal" || (taken.record && await failOpenBranch(delegation, store, taken.record))) {
        store.update(branchID, {state: "failed"});
        await manager.retire(record.childSessionID);
      }
    }
    // Successful actions and no-op states release the lease; a failed action throws past
    // this line and leaves the lease to expire after RETIRE_LEASE_MS, so a later start retries.
    if (!store.release(branchID, claimant)) {
      // The action outlived the 3-minute lease, so another start may act on the record again.
      console.error(`participant recovery lease on ${branchID} expired before its release`);
    }
  }
  // Only a pass that handled every record gets here. prune takes the registry lock and
  // deletes this directory's dead-owner completed/failed records older than 7 days; its
  // errors propagate like every other recovery error.
  store.prune({directory, olderThanMs: PARTICIPANT_PRUNE_AGE_MS});
};
```

Do not add another `failBranch`, retry, acknowledge, route delivery, create a child, or call
`manager.register`. Claim each eligible record before any await on its behalf. Claims cover
every eligible record in an open state or `terminal`; `completed` and `failed` records are skipped
from the snapshot before the owner probe and never claimed (Design decision 21 (iv)). ESRCH from the
owner probe makes a record eligible, EPERM indicates a live process, and every other probe
error propagates. Recovery is idempotent: a record it failed is `failed` on disk, which the next
call skips; a branch an earlier start failed in core while its record stayed open is answered by
core with `branch_already_terminal`, which recovery treats as success; a branch in `handoff` is
answered with `invalid_branch_state`, and recovery records its pending outcome (Plan 1
`pendingOutcome`) as a `terminal` record, acknowledges and marks `"delivered"` in the same pass,
or leaves the taken record as it is when the lookup answers `null` (Design decision
22). `pendingOutcome` is a lookup, not an acknowledgement or a delivery route.

Release the lease after each successful action or no-op state, not in a finally block; a failed
action keeps it until it expires. `list`, `claim`, `update`, `release` and `prune` errors propagate.

In `lib/child-session.js` (Design decision 21 (iv), follow-up 2026-10-08), add the seventh view
method. Replace exactly the end of Task 3's `release` method and the view:

```js
        writeParticipantUnlocked(unclaimed);
        return true;
      } finally { unlock(); }
    },
  });
```

with:

```js
        writeParticipantUnlocked(unclaimed);
        return true;
      } finally { unlock(); }
    },
    // Task 6 (Design decision 21 (iv)): under the registry lock, deletes the completed/failed
    // participant records of `directory` whose owner is definitely dead (ESRCH), that carry no
    // unexpired lease, and whose file was last written more than `olderThanMs` before now()
    // (the record has no completion time; every write, update, claim and release rewrites the
    // file). Returns the pruned branch IDs, sorted. No directory fsync after the unlink: a
    // record a crash brings back is pruned again by the next pass. Errors propagate.
    prune: ({directory, olderThanMs} = {}) => {
      if (!nonEmpty(directory) || !Number.isFinite(olderThanMs) || olderThanMs <= 0) {
        throw new Error("participant record prune needs a directory and a positive age");
      }
      const finalStates = ["completed", "failed"];
      let unlock;
      let names;
      try {
        unlock = lock(root);
        names = readdirSync(root);
      } catch (error) {
        unlock?.();
        throw new Error(`participant record prune failed: ${errorText(error)}`, { cause: error });
      }
      try {
        const pruned = [];
        for (const name of names) {
          const match = PARTICIPANT_FILE.exec(name);
          if (!match) continue; // another record kind, a temp file or the lock directory
          const branchID = match[1];
          const stored = readParticipant(branchID);
          if (stored === null) continue;
          if (!finalStates.includes(stored.state) || stored.directory !== directory) continue;
          if (ownerState(stored.ownerPID) !== "missing") continue;
          if (Number(stored.retirement?.leaseUntil) > now()) continue;
          const path = participantPath(root, branchID);
          let age;
          try { age = now() - statSync(path).mtimeMs; }
          catch (error) { throw new Error(`participant record prune failed for ${branchID}: ${errorText(error)}`, { cause: error }); }
          if (age <= olderThanMs) continue;
          try { unlinkSync(path); }
          catch (error) { throw new Error(`participant record prune failed for ${branchID}: ${errorText(error)}`, { cause: error }); }
          pruned.push(branchID);
        }
        return pruned.sort();
      } finally { unlock(); }
    },
  });
```

`statSync` and `unlinkSync` are already imported at `lib/child-session.js:3` (checked against the
main checkout's current file on 2026-10-08, not against `d6655f6` itself; the implementer confirms with
`sed -n '3p' lib/child-session.js` before editing). `nonEmpty`, `PARTICIPANT_FILE`, `readParticipant`,
`participantPath`, `ownerState`, `lock`, `errorText` and `now` are Task 3's helpers and the registry's
own; nothing else in the module changes for `prune`.

In `lib/core.js`, add the recovery import directly after Task 2's lifecycle import
`import { createParticipantLifecycle } from "./delegation.js";` (unchanged by Tasks 3-5; Task 8
anchors its import on the `./notify.js` line and Task 10 on the `./child-session.js` line, so
neither is touched here):

```js
import { recoverParticipants } from "./participant-recovery.js";
```

In `lib/child-session.js` (RECONCILE R2, decided 2026-10-08), replace exactly these lines of
`createChildManager` (`:872-877` at `d6655f6`):

```js
  const reconcile = async () => {
    await reconcileTeams();
    await reconcileReservations();
    for (const record of registry.list()) {
      if (record.source === "workflow" && mine(record) && ownerState(record.ownerPID) === "missing") await retire(record.sessionID);
    }
```

with:

```js
  // skipWorkflowRecord lets the workflows plugin hold back a dead owner's workflow record
  // while its delegation branch still has to be failed first; the plugin's full reconcile
  // retires it afterwards. Teams, reservations, native children and intents are never held back.
  const reconcile = async ({ skipWorkflowRecord = () => false } = {}) => {
    await reconcileTeams();
    await reconcileReservations();
    for (const record of registry.list()) {
      if (record.source === "workflow" && mine(record) && !skipWorkflowRecord(record) &&
        ownerState(record.ownerPID) === "missing") await retire(record.sessionID);
    }
```

Nothing else in `lib/child-session.js` changes; every existing `reconcile()` call keeps its
behaviour through the default.

Replace only the existing startup block with this exact block (2-space indented, as in the file),
preserving the comment and the original logger for the ungated pass:

```js
  // A single manager owns normal cleanup and startup recovery, preventing two
  // hooks from concurrently aborting or deleting the same child.
  // Pass 1 never waits for the delegation participant: team, reservation, native and
  // intent recovery run even if registration fails. Only a workflow child that has a
  // participant record (read from the same child registry) is held back, because its branch
  // must be failed in core before the child is retired. participants.list() throws on any
  // unreadable or invalid participant record; then every workflow child is held back.
  const heldBack = () => {
    try {
      const owned = new Set(participants.list().map((record) => record.childSessionID));
      return (record) => owned.has(record.sessionID);
    } catch (error) {
      console.error(`participant records unreadable at startup, holding back every workflow child: ${String(error?.message ?? error)}`);
      return () => true;
    }
  };
  const childRecovery = Promise.resolve()
    .then(() => manager.reconcile({ skipWorkflowRecord: heldBack() }))
    .catch((error) => {
      console.error(`managed task startup recovery failed: ${String(error?.message ?? error)}`);
    });
  // Pass 2 is gated on the participant: fail dead owners' open branches, then run the full
  // reconcile once pass 1 settled (childRecovery never rejects), so two reconciles never overlap.
  Promise.resolve().then(async () => {
    await participantReady;
    await recoverParticipants({
      delegation,
      store: participants,
      manager,
      directory,
      worker: (await participantReady).worker
    });
    await childRecovery;
    await manager.reconcile();
  }).catch((error) => {
    console.error(`participant startup recovery failed: ${String(error?.message ?? error)}`);
  });
```

Preserve synchronous factory creation, the existing registration reporter catch, the
`participantTimers` option, the returned `dispose` hook, and all existing exports. Do not
export a startup promise. If registration or participant recovery rejects, the full
`manager.reconcile()` must not run; pass 1 and `teams.startRecovery()` have run regardless. The
pass 2 message must not start with `workflows participant` (Task 2's registration test filters on
that prefix and expects exactly one line). Without `PluginInput.delegation` (RECONCILE R3) nothing
here throws: plugin construction succeeds, pass 1 still reads `participants.list()` and runs,
and `participantReady` is already a rejected promise, so pass 2 is skipped and its catch reports it
once (`participant startup recovery failed: workflow_run requires PluginInput.delegation, which
this opencode host does not provide`), beside Task 2's registration line.

At `d6655f6` the startup block is followed by two 0.13 lines. Keep them unchanged and directly
after the new block, outside both promise chains (Design decision 19):

```js
  // Teams: one directory-scoped 60 s sweep for dead-owner teams and failed retirements.
  teams.startRecovery();
```

#### Integration and test-fixture migrations

In
`tests/workflows.test.mjs`, replace this exact import:

```js
import { participation } from "./fixtures/participants.mjs";
```

with:

```js
import { participation, scratchParticipantStore } from "./fixtures/participants.mjs";
```

In `tests/loop-guard.test.mjs`, add this new import line; keep the existing delegation fixture
import unchanged:

```js
import { scratchParticipantStore } from "./fixtures/participants.mjs";
```

In `tests/team-tools.mjs`, add this line directly after its Task 1 delegation import (single
quotes, the file's own style):

```js
import { scratchParticipantStore } from './fixtures/participants.mjs';
```

Every plugin constructor in `tests/workflows.test.mjs`, `tests/loop-guard.test.mjs` and
`tests/team-tools.mjs` gets `participants: scratchParticipantStore()` (Design decision 13). After
Tasks 1-5 there are fifteen in `tests/workflows.test.mjs` -- the eleven constructors present at
`d6655f6` (migrated to `delegation: fakeDelegation()` by Task 1 Step 5), Task 1's two RECONCILE R3
plugins ("without PluginInput.delegation the plugin keeps teams ...", which passes no `delegation`
and opens `createWorkflowPlugin({` followed by `client, directory: "/d", tool: fakeTool,
backgroundSubagents: true,` on the next line, and "with PluginInput.delegation workflow_run hands
...", which opens `createWorkflowPlugin({` followed by its own `delegation, client, ...` shorthand),
and Task 2's two participant tests -- plus the loop-guard site and the four `tests/team-tools.mjs`
sites. Both R3 plugins need the scratch store like every other site: neither throws at
construction, and pass 1 calls `participants.list()` at plugin init whether or not `delegation` is
present (without it pass 2 is skipped, as described under the startup block above).

First check (read-only), from the task workdir:

```bash
grep -c 'createWorkflowPlugin(' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
grep -c 'createWorkflowPlugin({' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
grep -c 'participants: scratchParticipantStore()' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
```

Expected: `15`, `1`, `4` for the first two commands (every site opens an object literal, on its own
line or with the options on the following lines) and `0`, `0`, `0` for the third (no site is
partially migrated). Any other number: STOP and report; do not migrate by hand around it.

Then run this one-time rewrite. It inserts the option as the first property of every site, on the
line that opens the call, and changes no line count; a multi-line site becomes
`createWorkflowPlugin({ participants: scratchParticipantStore(),` followed by its unchanged option
lines:

```bash
perl -pi -e 's/\bcreateWorkflowPlugin\(\{/createWorkflowPlugin({ participants: scratchParticipantStore(),/g' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
```

Verify:

```bash
grep -c 'createWorkflowPlugin({ participants: scratchParticipantStore(),' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
grep -c 'participants: scratchParticipantStore()' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
```

Expected: `15`, `1`, `4` from both (Task 8 Step 1b later matches exactly the prefix
`createWorkflowPlugin({ participants: scratchParticipantStore(),` on every one of these sites).
Then inspect every changed site in `git --no-pager diff -- tests/workflows.test.mjs
tests/loop-guard.test.mjs tests/team-tools.mjs`; never use a whole-file `includes` guard that skips
remaining constructors. Task 5 already passes scratch participants in
`tests/live-order.test.mjs`; change only its `runThroughPlugin` helper, at two sites, because core now
starts two reconciles at init (pass 1 at once, pass 2 after participant recovery) and the helper must
forward pass 1's option and let both settle before it removes the registry root. Replace:

```js
      manager: { ...manager, reconcile: () => { const run = manager.reconcile(); reconciling.push(run); return run; } },
```

with:

```js
      manager: { ...manager, reconcile: (options) => { const run = manager.reconcile(options); reconciling.push(run); return run; } },
```

and replace:

```js
    // core.js starts manager.reconcile() at plugin init without awaiting it; it must have
    // settled before the registry root is removed, or its lock would recreate the root.
    await Promise.all(reconciling);
```

with:

```js
    // core.js starts two reconciles at plugin init without awaiting them (pass 1 at once,
    // the full pass after participant recovery); both must have settled before the registry
    // root is removed, or a lock would recreate the root. The bound keeps a broken start
    // from hanging the run; the test's own assertions report it.
    for (let turn = 0; reconciling.length < 2 && turn < 100; turn += 1) await new Promise(setImmediate);
    await Promise.all(reconciling);
```

#### GREEN verification command

After implementation and migrations, run exactly:

```text
node --test tests/*.mjs
```

Use workdir `/home/dev/opencode-agent-workflows-plan2` and no `cd` chain. Expected result is
zero failures. The literal recovery file above defines 33 planned tests (7 state-loop plus
26 standalone) and `tests/workflows.test.mjs` gains 1 (34 new tests, predicted, the Baselines table's Task 6
row); this is not an observed global suite total. The 0.13 team tests (`tests/team-*.mjs`,
`tests/teammates.mjs`, `tests/terminal-intents.mjs`) and the Task 2 registration test must pass
unchanged apart from the migrations above. Do not assert a global test
total, because no repository test run has happened for this plan and the count can change.

#### Commit with explicit paths

Before committing, run these read-only inspections from workdir
`/home/dev/opencode-agent-workflows-plan2`:

```text
git --no-pager status
git --no-pager diff
git --no-pager log --oneline -10
```

Stage only these exact paths, with no `git add .` or wildcard:

```text
git add lib/participant-recovery.js lib/core.js lib/child-session.js tests/participant-recovery.test.mjs tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs tests/live-order.test.mjs
git commit -m 'Recover durable workflow participants before the full child reconciliation'
```

### Task 7: Normal completion

**Files:**
- Modify: `lib/runtime.js` (the `agent()` body Task 4 wrote: two declarations, steps 11-13, the catch)
- Modify: `tests/live-order.test.mjs` (the recording client, `liveRuntime`, test (a), `branchRecord`,
  `delegationOrder`; seven tests appended)

**Interfaces:**
- Consumes: Task 4's `agent()` and the `tests/live-order.test.mjs` helpers `liveRuntime`, `failingAt`,
  `boom`, `ownerExecution`, `branch`, `registered`, `handler`, `registration`; Task 5's `branchRecord`
  and `delegationOrder`.
- Produces (behaviour of `agent()` after step 11):
  - Normal completion: after step 13, a reply with a `parts` array calls
    `delegation.completeBranch({ branch, resultID: runID })`, then
    `participants.update(branchID, { state: "completed" })`, then writes the resume cache.
  - Step 12 (`session.prompt`) or step 13 (`store.update` "prompted") throwing, or
    `completeBranch` rejecting: read the record; unless its state is `"terminal"`, call
    `failBranch({ branch, errorCode: "invalid_branch_state" })` and then
    `participants.update(branchID, { state: "failed" })`. A failing read, `failBranch` or update
    is reported on stderr and never replaces the original error.
  - An error reply (`reply.error`), and a 2xx reply without a `parts` array, are handled exactly
    like a step-12 throw: `failBranch({ branch, errorCode: "invalid_branch_state" })`, then
    `"failed"`, unless the record is already `"terminal"`. The error propagates. Nothing is left
    `"prompted"` waiting for recovery. (The only error reply that is not a failure is Plan 1's
    `DelegationTerminal`; Task 10 inserts its detection before this judgement. Between the Task 7 and Task 10
    commits a terminal reply is failed too; nothing ships in between, Task 11 is the release.)
  - Once `completeBranch` succeeded the branch is never failed; if persisting `"completed"` then
    throws, the record stays `"prompted"` and the error propagates.

- [ ] **Step 0: Record the baselines**

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ fail 0`. Write the printed `ℹ tests` number down as SUITEBASE.

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* /tmp/wf-report-runs-* /tmp/wf-outcome-cache-* 2>/dev/null | wc -l`
Write the printed number down as TMPBASE_D.

- [ ] **Step 1: Write the failing tests**

1a. In `tests/live-order.test.mjs`, replace:
```js
const recordingClient = (order, failOn = never) => ({
```
with:
```js
// `reply` replaces the child's normal message reply (Task 7's reply-judgement tests).
const recordingClient = (order, failOn = never, reply = null) => ({
```

1b. Replace:
```js
      order.push(["session.prompt", { id: path.id, agent: body.agent, text: body.parts[0].text }]);
      return { data: { parts: [{ type: "text", text: "child reply" }] } };
```
with:
```js
      order.push(["session.prompt", { id: path.id, agent: body.agent, text: body.parts[0].text }]);
      const error = failOn("session.prompt", [body]);
      if (error) throw error;
      return reply ?? { data: { parts: [{ type: "text", text: "child reply" }] } };
```

1c. Replace:
```js
const liveRuntime = ({ fail = {}, failOn = never, delivery = "foreground" } = {}) => {
```
with:
```js
const liveRuntime = ({ fail = {}, failOn = never, delivery = "foreground", reply = null } = {}) => {
```
and replace:
```js
    client: recordingClient(order, failOn), directory: "/d", parentSessionID: "ses_parent",
```
with:
```js
    client: recordingClient(order, failOn, reply), directory: "/d", parentSessionID: "ses_parent",
```

1d. Extend test (a)'s literal (never loosen it). Replace:
```js
    ["store.update", "branch_1", { state: "prompted", promptedAt: 4242 }],
    ["handlers.delete", "branch_1"],
    ["manager.retire", "ses_child1"],
  ]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "prompted", promptStartedAt: 4242, promptedAt: 4242 });
```
with:
```js
    ["store.update", "branch_1", { state: "prompted", promptedAt: 4242 }],
    ["completeBranch", { branch, resultID: "run-test" }],
    ["store.update", "branch_1", { state: "completed" }],
    ["handlers.delete", "branch_1"],
    ["manager.retire", "ses_child1"],
  ]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "completed", promptStartedAt: 4242, promptedAt: 4242 });
```

1e. Extend Task 5's plugin literals. In `branchRecord`, replace:
```js
    agent: "scout", prompt: "summarise the notes", directory: "/d", state: "prompted",
```
with:
```js
    agent: "scout", prompt: "summarise the notes", directory: "/d", state: "completed",
```
In `delegationOrder`, replace:
```js
    ["acknowledgeBranch", { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
  ];
};
```
with:
```js
    ["acknowledgeBranch", { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
    ["completeBranch", { branch, resultID: "run-test" }],
  ];
};
```

1f. Append to the END of `tests/live-order.test.mjs`:
```js

// Task 7: the branch once the prompt may have been sent (contract steps 12-13 and normal
// completion). `throughPrompt` is test (a)'s literal order up to and including step 12.
const throughPrompt = [
  ["currentExecution", { sessionID: "ses_parent" }],
  ["reserveBranch", { parentSessionID: "ses_parent", rootSessionID: "ses_parent", ownerExecution, parentBranchID: null, kind: "workflow", delivery: "foreground" }],
  ["manager.reserve", { parentSessionID: "ses_parent", source: "workflow", mode: "foreground", directory: "/d" }],
  ["session.create", { title: "wf: worker [workflow-reservation:resv_1]", parentID: "ses_parent" }],
  ["manager.bindReservation", "resv_1", "ses_child1"],
  ["bindBranch", { branch, childSessionID: "ses_child1" }],
  ["manager.register", registration],
  ["store.write", registered],
  ["handlers.set", "branch_1", handler],
  ["acknowledgeBranch", { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
  ["store.update", "branch_1", { state: "acknowledged" }],
  ["store.update", "branch_1", { state: "prompting", promptStartedAt: 4242 }],
  ["session.prompt", { id: "ses_child1", agent: "worker", text: "do the thing" }],
];
const promptedUpdate = ["store.update", "branch_1", { state: "prompted", promptedAt: 4242 }];
const failBranchCall = ["failBranch", { branch, errorCode: "invalid_branch_state" }];
const failedUpdate = ["store.update", "branch_1", { state: "failed" }];
const completeCall = ["completeBranch", { branch, resultID: "run-test" }];
const handlerAndRetire = [["handlers.delete", "branch_1"], ["manager.retire", "ses_child1"]];
const dispatchChild = (runtime) => runtime.agent("do the thing", { agent: "worker", intent: "read" });

test("a child whose prompt throws at step 12 is failed once and recorded failed", async () => {
  const { order, store, runtime } = liveRuntime({ failOn: failingAt("session.prompt") });
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, failBranchCall, failedUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "failed", promptStartedAt: 4242 });
});

test("a step-13 store failure fails the branch once and records it failed", async () => {
  const { order, store, runtime } = liveRuntime({ failOn: failingAt("store.update", (_branchID, patch) => patch.state === "prompted") });
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, failBranchCall, failedUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "failed", promptStartedAt: 4242 });
});

test("a branch already recorded terminal is never failed when its prompt throws", async () => {
  // The record turns terminal while the prompt is in flight, then the prompt throws.
  let raw = null;
  const { order, store, runtime } = liveRuntime({
    failOn: (name) => {
      if (name !== "session.prompt") return null;
      raw.update("branch_1", { outcomeID: "outcome_9", state: "terminal" });
      return boom;
    },
  });
  raw = store;
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "terminal", outcomeID: "outcome_9", promptStartedAt: 4242 });
});

test("an error reply fails the branch once and records it failed, like a throwing prompt", async () => {
  const { order, store, runtime } = liveRuntime({ reply: { data: undefined, error: { name: "UnknownError", message: "provider overloaded" } } });
  await assert.rejects(dispatchChild(runtime), /provider overloaded/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, failBranchCall, failedUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "failed", promptStartedAt: 4242, promptedAt: 4242 });
});

test("a 2xx reply without a parts array fails the branch once, even when its data looks like a terminal", async () => {
  // A terminal arrives only as reply.error (Plan 1 Task 18); terminal-shaped `data` is not one.
  const { order, store, runtime } = liveRuntime({ reply: { data: { outcomeID: "outcome_1", branchID: "branch_1", kind: "question_handoff", errorCode: null } } });
  await assert.rejects(dispatchChild(runtime), /workflow agent "worker": the child's reply is not a message/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, failBranchCall, failedUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "failed", promptStartedAt: 4242, promptedAt: 4242 });
});

test("a rejected completeBranch fails the branch once and records it failed", async () => {
  const { order, store, runtime } = liveRuntime({ fail: { completeBranch: boom } });
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, completeCall, failBranchCall, failedUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "failed", promptStartedAt: 4242, promptedAt: 4242 });
});

test("a completed branch is never failed, even when persisting completed throws", async () => {
  const { order, store, runtime } = liveRuntime({ failOn: failingAt("store.update", (_branchID, patch) => patch.state === "completed") });
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, completeCall, ["store.update", "branch_1", { state: "completed" }], ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "prompted", promptStartedAt: 4242, promptedAt: 4242 });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/live-order.test.mjs`
Expected: FAIL, `ℹ tests 28`, `ℹ pass 19`, `ℹ fail 9`:
- test (a): `deepEqual` diff, actual has no `completeBranch` / `{ state: "completed" }` entries;
- "prompt throws at step 12", "step-13 store failure" and "an error reply": the rejection
  matches, then the order `deepEqual` fails: actual goes straight from the last entry to
  `["handlers.delete", "branch_1"]`, with no `failBranch` and no `{ state: "failed" }`;
- "2xx reply without a parts array": `Missing expected rejection` (Task 4 returns `""`);
- "rejected completeBranch" and "persisting completed throws": `Missing expected rejection`
  (Task 4 never calls `completeBranch`);
- the background and foreground plugin tests: `delegationOrder` diff (no `completeBranch`).
The "already recorded terminal" test PASSES here: Task 4 already leaves it alone, and it pins that
Task 7 keeps it that way.

- [ ] **Step 3: Implement in `lib/runtime.js`** (apply 3a, then 3b, then 3c)

3a. In `agent()`'s catch, replace:
```js
              console.error(`workflows could not mark branch ${branch.branchID} failed: ${String(storeError?.message ?? storeError)}`);
            }
          }
        }
      }
      throw error;
```
with:
```js
              console.error(`workflows could not mark branch ${branch.branchID} failed: ${String(storeError?.message ?? storeError)}`);
            }
          }
        }
      } else if (failBranchOnThrow) {
        // Step 12 or 13 threw, the reply was an error or not a message, or completeBranch
        // rejected (Task 7).
        await failAfterPrompt();
      }
      throw error;
```

3b. Replace steps 11-13 and the return:
```js
      // 11: from here a restart must assume the prompt may have been sent.
      participants.update(branch.branchID, { state: "prompting", promptStartedAt: now() });
      promptStarted = true;
      // 12
      const reply = await client.session.prompt({
        path: { id: sessionID },
        query,
        body: { agent: agentName, parts: [{ type: "text", text: fullPrompt }] },
      });
      // 13: the prompt call returned; persisted before the reply is judged.
      participants.update(branch.branchID, { state: "prompted", promptedAt: now() });
      if (reply?.error) throw new Error(String(reply.error?.message ?? JSON.stringify(reply.error)).slice(0, 300));
      const text = textOfParts((reply?.data ?? reply)?.parts);
      writeCache(workflowName, key, text);
      return opts.json ? parseJson(text) : text;
```
with:
```js
      // 11: from here a restart must assume the prompt may have been sent.
      participants.update(branch.branchID, { state: "prompting", promptStartedAt: now() });
      promptStarted = true;
      failBranchOnThrow = true;
      // 12
      const reply = await client.session.prompt({
        path: { id: sessionID },
        query,
        body: { agent: agentName, parts: [{ type: "text", text: fullPrompt }] },
      });
      // 13: the prompt call returned; persisted before the reply is judged.
      participants.update(branch.branchID, { state: "prompted", promptedAt: now() });
      // An error reply, or a 2xx reply that is not an SDK message (no `parts` array), fails
      // the branch exactly like a throwing prompt: the catch calls failAfterPrompt.
      if (reply?.error) throw new Error(String(reply.error?.message ?? JSON.stringify(reply.error)).slice(0, 300));
      const message = reply?.data ?? reply;
      if (!Array.isArray(message?.parts)) throw new Error(`workflow agent "${label}": the child's reply is not a message`);
      const text = textOfParts(message.parts);
      // Normal completion: the run consuming this child's text is the branch's result.
      await delegation.completeBranch({ branch, resultID: runID });
      // A completed branch is never failed: if persisting "completed" throws, the record
      // stays "prompted" and the error propagates.
      failBranchOnThrow = false;
      participants.update(branch.branchID, { state: "completed" });
      writeCache(workflowName, key, text);
      return opts.json ? parseJson(text) : text;
```

3c. Replace:
```js
    let promptStarted = false;
    const discardHandler = () => {
```
with:
```js
    let promptStarted = false;
    let failBranchOnThrow = false;
    // Task 7: a branch whose prompt may have been sent but whose result could not be taken
    // (step 12 or 13 threw, the reply was an error or not a message, or completeBranch
    // rejected) is failed in-process instead of
    // waiting for startup recovery, unless it already ended in a terminal outcome: a
    // terminal branch is never completed or failed. A failing read, failBranch or store
    // write is reported and never masks the original error; the record then stays
    // non-final and startup recovery fails it once this process is gone.
    const failAfterPrompt = async () => {
      let current;
      try {
        current = participants.get(branch.branchID);
      } catch (readError) {
        console.error(`workflows could not read branch ${branch.branchID} before failing it; left for recovery: ${String(readError?.message ?? readError)}`);
        return;
      }
      if (current?.state === "terminal") return;
      try {
        await delegation.failBranch({ branch, errorCode: "invalid_branch_state" });
      } catch (failError) {
        console.error(`workflows failBranch for ${branch.branchID} failed: ${String(failError?.message ?? failError)}`);
        return;
      }
      try {
        participants.update(branch.branchID, { state: "failed" });
      } catch (storeError) {
        console.error(`workflows could not mark branch ${branch.branchID} failed: ${String(storeError?.message ?? storeError)}`);
      }
    };
    const discardHandler = () => {
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/live-order.test.mjs`
Expected: PASS, `ℹ tests 28`, `ℹ pass 28`, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests` = SUITEBASE + 7, `ℹ fail 0`. (Every other runtime test's fake reply
carries a `parts` array, so normal completion is unchanged for them.)

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* /tmp/wf-report-runs-* /tmp/wf-outcome-cache-* 2>/dev/null | wc -l`
Expected: TMPBASE_D.

- [ ] **Step 5: Commit**

Inspect first: `git --no-pager status`, `git --no-pager diff`, `git --no-pager log --oneline -10`.
Expected: only `lib/runtime.js` and `tests/live-order.test.mjs` modified.
```bash
git add lib/runtime.js tests/live-order.test.mjs
git commit -m "Complete a workflow branch on a normal result and fail it when the prompt, its reply or the completion fails"
```

### Task 8: Durable background report

**Files:**
- Modify: `lib/notify.js` (`notify` takes an optional `onSent`; the queue keeps it)
- Modify: `lib/run-store.js` (`updateRun`, `listRuns({ strict })`)
- Modify: `lib/runtime.js` (run record fields; `persistReport`, `reportDelivered`)
- Modify: `lib/core.js` (one import, one option; `executeWorkflow` split into `startRuntime` +
  `runScript`; the background path; start-time replay inserted before participant recovery)
- Modify: `tests/fixtures/participants.mjs` (`scratchRunStore`)
- Modify: `tests/workflows.test.mjs`, `tests/loop-guard.test.mjs`, `tests/live-order.test.mjs`,
  `tests/participant-recovery.test.mjs`, `tests/team-tools.mjs` (every plugin gets a scratch run store; two fake runtimes
  gain the two new methods)
- Create: `tests/report-delivery.test.mjs`

**Interfaces:**
- `createNotifier(...).notify(sessionID, text, onSent?)`: `onSent()` runs once, only after the text
  was actually sent (at once, when the queue flushes on `session.idle`, or through 0.13's third-failure identity fallback). 0.13's identity read, fallback and ordered re-queue are otherwise unchanged. A throwing `onSent` is
  reported on stderr as `notification delivery callback failed: <message>` and never re-sends.
- `createRunStore({ root })` gains `updateRun(runID, change)`: under the store lock, `change(current)`
  receives the record (or `null`) and returns the next record or `null` (leave it). A next record
  with another `runID` throws `workflow run <id>: an update changes its run id`.
  `listRuns({ strict: true })` throws instead of returning `[]`. Module exports gain `updateRun`.
- Run records gain `ownerPID` (always), `directory` (when set), `reportDelivery` (always; `"none"`
  until a background report exists) and `report` (only while `"pending_delivery"`).
- Runtime gains `persistReport(text)` (sets `"pending_delivery"`, `record(true)`: throws on a
  failed write) and `reportDelivered()` (sets `"delivered"`, drops `report`, `record(true)`).
- `createWorkflowPlugin({ ..., runStore = { newRunID, writeRun, listRuns, updateRun, pruneRuns } })`;
  core passes it to every runtime as `store`.
- Background `workflow_run`: the runtime is built before the tool returns (a run that cannot write
  its first record fails the tool call). When the script settles, the report text (unchanged
  wording) is persisted with `persistReport`; if that throws, nothing is sent and stderr gets
  `workflow "<name>" run <runID>: the report could not be persisted, so it was not delivered: <message>`.
  Otherwise it goes through `notifier.notify(..., onSent)` and `onSent` calls `reportDelivered()`.
- Start-time replay, first in Task 6's gated startup chain (pass 2, before `await participantReady`;
  pass 1, the held-back `manager.reconcile({ skipWorkflowRecord })`, runs beside it and is not
  touched), never rejecting:
  each run record with `reportDelivery: "pending_delivery"`, this plugin's `directory`, a string
  `report` and `sessionID`, and a dead `ownerPID` (ESRCH; EPERM counts as alive) is claimed by
  rewriting its `ownerPID` to this process under the run-store lock, sent once, then rewritten as
  `"delivered"` without `report`.

- [ ] **Step 0: Record this task's baselines**

Before any edit, measure TASKSTART, SUITEBASE (= TASKSTART - 7) and TMPBASE_D as the header's "Baselines and test counts" section defines them. Later steps compare against them.

- [ ] **Step 1: Add the scratch run store and give every test plugin one (mechanical)**

1a. In `tests/fixtures/participants.mjs`, replace:
```js
import { createChildRegistry } from "../../lib/child-session.js";
```
with:
```js
import { createChildRegistry } from "../../lib/child-session.js";
import { createRunStore, newRunID } from "../../lib/run-store.js";
```
and append to the end of the file:
```js

// A private workflow run store under the same scratch root. Start-time report replay reads
// the plugin's run store, so a test plugin must never fall back to the real one under ~.
export const scratchRunStore = () => ({ newRunID, ...createRunStore({ root: mkdtempSync(join(root, "runs-")) }) });
```

1b. Run:
```bash
perl -pi -e 's/createWorkflowPlugin\(\{ participants: scratchParticipantStore\(\),/createWorkflowPlugin({ participants: scratchParticipantStore(), runStore: scratchRunStore(),/g' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/team-tools.mjs
perl -0pi -e 's/import \{ ([^}]*?) \} from "\.\/fixtures\/participants\.mjs";/import { $1, scratchRunStore } from ".\/fixtures\/participants.mjs";/' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/live-order.test.mjs
perl -pi -e 's/finish: \(\) => \{\}, agent: async \(\) => "",/finish: () => {}, persistReport: () => {}, reportDelivered: () => {}, agent: async () => "",/g' tests/workflows.test.mjs
```
In `tests/team-tools.mjs` (single-quoted imports, so the second command does not match it), replace
`import { scratchParticipantStore } from './fixtures/participants.mjs';` with
`import { scratchParticipantStore, scratchRunStore } from './fixtures/participants.mjs';`.

1c. In `tests/live-order.test.mjs` (`runThroughPlugin`), replace:
```js
      delegation: fakeDelegation({ order }), participantTimers: fakeTimers(), participants,
```
with:
```js
      delegation: fakeDelegation({ order }), participantTimers: fakeTimers(), participants, runStore: scratchRunStore(),
```

1d. In `tests/participant-recovery.test.mjs`, replace:
```js
import {fakeDelegation, fakeExecution, fakeTimers, TAKER, takenOver} from "./fixtures/delegation.mjs";
```
with:
```js
import {fakeDelegation, fakeExecution, fakeTimers, TAKER, takenOver} from "./fixtures/delegation.mjs";
import {scratchRunStore} from "./fixtures/participants.mjs";
```
and replace:
```js
      participants: watchedStore,
```
with:
```js
      participants: watchedStore,
      runStore: scratchRunStore(),
```
and (Task 6's RECONCILE R2 failed-registration test) replace:
```js
    participants: store,
```
with:
```js
    participants: store,
    runStore: scratchRunStore(),
```

1e. Verify:
```bash
for f in tests/workflows.test.mjs tests/loop-guard.test.mjs tests/live-order.test.mjs tests/participant-recovery.test.mjs tests/team-tools.mjs; do printf '%s %s %s\n' "$f" "$(grep -c 'createWorkflowPlugin(' "$f")" "$(grep -c 'runStore: scratchRunStore()' "$f")"; done
grep -c 'persistReport: () => {}, reportDelivered: () => {}' tests/workflows.test.mjs
grep -c 'scratchRunStore } from "./fixtures/participants.mjs";' tests/workflows.test.mjs tests/loop-guard.test.mjs tests/live-order.test.mjs
grep -c 'scratchRunStore' tests/team-tools.mjs
```
Expected: on every line of the first command the two numbers are equal and non-zero; then `2`;
then `1` for each of the three files; then `5` (one import, four sites). A site Task 6 left without `participants: scratchParticipantStore(),`
shows as unequal numbers: add `runStore: scratchRunStore(), ` directly after its
`createWorkflowPlugin({` by hand and re-run the check.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests` = SUITEBASE + 7, `ℹ fail 0` (core ignores `runStore` until Step 4).

- [ ] **Step 2: Write the failing tests**

Create `tests/report-delivery.test.mjs`:
```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorkflowPlugin } from "../lib/core.js";
import { createNotifier } from "../lib/notify.js";
import { createRunStore } from "../lib/run-store.js";
import { createWorkflowRuntime } from "../lib/runtime.js";
import { fakeDelegation, fakeTimers } from "./fixtures/delegation.mjs";
import { participation, scratchParticipantStore, scratchRunStore } from "./fixtures/participants.mjs";

// One macrotask: every promise continuation queued before it has run.
const settle = () => new Promise(setImmediate);

// lib/notify.js (0.13.0) reads the target's newest user message for its agent and model
// before every send; a client without one would only queue (Design decision 20).
const identityMessages = async () => ({ data: [{ info: { id: "msg_owner", role: "user", agent: "build", model: { providerID: "p", modelID: "m" } }, parts: [] }] });

// The tool() helper surface core.js touches (the stand-in tests/live-order.test.mjs uses).
const fakeTool = (definition) => definition;
fakeTool.schema = new Proxy({}, {
  get: () => {
    const chain = new Proxy(() => chain, { get: () => () => chain, apply: () => chain });
    return () => chain;
  },
});

test("notify calls onSent once, only after the text was actually sent", async () => {
  const sent = [];
  let failing = false;
  const client = { session: { messages: identityMessages, prompt: async ({ path, body }) => {
    if (failing) throw new Error("busy");
    sent.push([path.id, body.parts[0].text]);
    return { data: { parts: [] } };
  } } };
  const notifier = createNotifier({ client, directory: "/d" });
  const calls = [];
  assert.equal(await notifier.notify("ses_a", "now", () => calls.push("now")), true);
  await notifier.onEvent({ type: "session.status", properties: { sessionID: "ses_b", status: { type: "busy" } } });
  assert.equal(await notifier.notify("ses_b", "later", () => calls.push("later")), false);
  failing = true;
  assert.equal(await notifier.notify("ses_c", "retried", () => calls.push("retried")), false);
  assert.deepEqual(calls, ["now"]);
  failing = false;
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_b" } });
  await notifier.onEvent({ type: "session.idle", properties: { sessionID: "ses_c" } });
  assert.deepEqual(calls, ["now", "later", "retried"]);
  assert.deepEqual(sent, [["ses_a", "now"], ["ses_b", "later"], ["ses_c", "retried"]]);
  assert.equal(notifier.pendingCount(), 0);
});

test("a throwing onSent is reported and never re-sends the text", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (message) => { errors.push(message); });
  const sent = [];
  const client = { session: { messages: identityMessages, prompt: async ({ body }) => { sent.push(body.parts[0].text); return { data: { parts: [] } }; } } };
  const notifier = createNotifier({ client });
  assert.equal(await notifier.notify("ses_a", "once", () => { throw new Error("store gone"); }), true);
  assert.deepEqual(sent, ["once"]);
  assert.deepEqual(errors, ["notification delivery callback failed: store gone"]);
  assert.equal(notifier.pendingCount(), 0);
});

test("a runtime persists its report as pending_delivery, then delivered, and a failed write throws", () => {
  const writes = [];
  let failPending = false;
  const store = {
    newRunID: () => "run-bg", pruneRuns: () => {},
    writeRun: (_runID, record) => {
      if (failPending && record.reportDelivery === "pending_delivery") throw new Error("disk full");
      writes.push({ ...record });
    },
  };
  const build = () => createWorkflowRuntime({
    client: {}, directory: "/d", parentSessionID: "ses_owner", workflowName: "bg", store, manager: {},
    delegation: fakeDelegation(), ...participation(), now: () => 7,
  });
  const delivery = (record) => ({
    directory: record.directory, ownerPID: record.ownerPID, status: record.status,
    reportDelivery: record.reportDelivery, hasReport: "report" in record, report: record.report,
  });
  const runtime = build();
  assert.deepEqual(delivery(writes.at(-1)), { directory: "/d", ownerPID: process.pid, status: "running", reportDelivery: "none", hasReport: false, report: undefined });
  runtime.finish();
  runtime.persistReport("the report");
  assert.deepEqual(delivery(writes.at(-1)), { directory: "/d", ownerPID: process.pid, status: "done", reportDelivery: "pending_delivery", hasReport: true, report: "the report" });
  runtime.reportDelivered();
  assert.deepEqual(delivery(writes.at(-1)), { directory: "/d", ownerPID: process.pid, status: "done", reportDelivery: "delivered", hasReport: false, report: undefined });
  failPending = true;
  const second = build();
  second.finish();
  assert.throws(() => second.persistReport("lost"), /disk full/);
});

test("updateRun rewrites one record under the lock, and listRuns({ strict }) does not hide a broken store", (t) => {
  const root = mkdtempSync(join(tmpdir(), "wf-report-runs-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const store = createRunStore({ root: join(root, "runs") });
  store.writeRun("run-a", { runID: "run-a", status: "done", startedAt: 1, finishedAt: Date.now(), reportDelivery: "pending_delivery" });
  assert.equal(store.updateRun("run-a", () => null), null);
  assert.equal(store.listRuns()[0].reportDelivery, "pending_delivery");
  assert.equal(store.updateRun("run-a", (current) => ({ ...current, reportDelivery: "delivered" })).reportDelivery, "delivered");
  assert.equal(store.listRuns()[0].reportDelivery, "delivered");
  const seen = [];
  assert.equal(store.updateRun("run-missing", (current) => { seen.push(current); return null; }), null);
  assert.deepEqual(seen, [null]);
  assert.throws(() => store.updateRun("run-a", (current) => ({ ...current, runID: "run-b" })), /workflow run run-a: an update changes its run id/);
  // A root that is a file: the lenient listing hides it, the strict one throws.
  const file = join(root, "not-a-directory");
  writeFileSync(file, "");
  const broken = createRunStore({ root: file });
  assert.deepEqual(broken.listRuns(), []);
  assert.throws(() => broken.listRuns({ strict: true }), /EEXIST|ENOTDIR/);
});

// A runtime stand-in recording what core.js asks of it, in one order with the client's
// prompts. `persistFails` makes persistReport throw like a failing writeRun.
const recordingRuntime = (order, { persistFails = null, finished = () => {} } = {}) => () => ({
  runID: "run-bg",
  agent: async () => "", parallel: async () => [], pipeline: async () => [], phase: () => {},
  finish: (error) => { order.push(["finish", error ? String(error.message) : null]); finished(); },
  persistReport: (text) => {
    order.push(["persistReport", text]);
    if (persistFails) throw persistFails;
  },
  reportDelivered: () => { order.push(["reportDelivered"]); },
});

const pluginFor = ({ order, runtimeFactory = () => { throw new Error("no run expected"); }, runStore = scratchRunStore(), workflow = null, onReconcile = () => {} }) =>
  createWorkflowPlugin({
    client: { session: { messages: identityMessages, prompt: async ({ path, body }) => {
      order.push(["session.prompt", { id: path.id, text: body.parts[0].text, synthetic: body.parts[0].synthetic === true }]);
      return { data: { parts: [] } };
    } } },
    directory: "/d", tool: fakeTool,
    delegation: fakeDelegation(), participantTimers: fakeTimers(),
    participants: scratchParticipantStore(), runStore,
    // Only the full reconcile (pass 2, no options) ends a start; pass 1 runs at once with
    // skipWorkflowRecord and says nothing about replay.
    manager: { reconcile: async (options) => { if (options === undefined) onReconcile(); } },
    discover: async () => new Map(workflow ? [[workflow.meta.name, workflow]] : []),
    runtimeFactory,
  });

const runInBackground = async ({ run, persistFails = null }) => {
  const order = [];
  let finished;
  const done = new Promise((resolve) => { finished = resolve; });
  const plugin = pluginFor({ order, workflow: { meta: { name: "bg" }, run }, runtimeFactory: recordingRuntime(order, { persistFails, finished }) });
  try {
    const returned = await plugin.tool.workflow_run.execute({ name: "bg", background: true }, { sessionID: "ses_owner" });
    assert.match(returned, /started in the background/);
    await done;
    await settle();
    return order;
  } finally {
    await plugin.dispose();
  }
};

test("a background report is persisted as pending_delivery, then sent, then marked delivered", async () => {
  const order = await runInBackground({ run: async () => "the result" });
  const text = '[workflow "bg" finished: run-bg]\nRelay the result to the user.\n\nthe result';
  assert.deepEqual(order, [
    ["finish", null],
    ["persistReport", text],
    ["session.prompt", { id: "ses_owner", text, synthetic: true }],
    ["reportDelivered"],
  ]);
});

test("a failed background run's report takes the same durable path", async () => {
  const order = await runInBackground({ run: async () => { throw new Error("kaput"); } });
  const text = '[workflow "bg" FAILED]\nRelay this to the user: kaput';
  assert.deepEqual(order, [
    ["finish", "kaput"],
    ["persistReport", text],
    ["session.prompt", { id: "ses_owner", text, synthetic: true }],
    ["reportDelivered"],
  ]);
});

test("a report that cannot be persisted is never sent, and the write error is reported", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (message) => { errors.push(message); });
  const order = await runInBackground({ run: async () => "the result", persistFails: new Error("disk full") });
  assert.deepEqual(order, [
    ["finish", null],
    ["persistReport", '[workflow "bg" finished: run-bg]\nRelay the result to the user.\n\nthe result'],
  ]);
  assert.deepEqual(errors, ['workflow "bg" run run-bg: the report could not be persisted, so it was not delivered: disk full']);
});

test("a dead owner's pending report is replayed exactly once, in its own directory only", async () => {
  const DEAD_PID = 2147483647;
  assert.throws(() => process.kill(DEAD_PID, 0), (error) => error?.code === "ESRCH");
  const runStore = scratchRunStore();
  const pending = (runID, fields) => runStore.writeRun(runID, {
    runID, kind: "workflow", name: "bg", startedAt: 1, sessionID: "ses_owner", status: "done", phase: "starting",
    agentsStarted: 0, agentsDone: 0, finishedAt: Date.now(), directory: "/d", ownerPID: DEAD_PID,
    reportDelivery: "pending_delivery", report: `report of ${runID}`, ...fields,
  });
  pending("run-dead", {});
  pending("run-live", { ownerPID: process.pid });
  pending("run-elsewhere", { directory: "/elsewhere" });
  // One plugin start: the gated startup chain replays reports first and runs the full reconcile last.
  const start = async (order) => {
    let reconciled;
    const ready = new Promise((resolve) => { reconciled = resolve; });
    const plugin = pluginFor({ order, runStore, onReconcile: () => reconciled() });
    try {
      await ready;
      await settle();
    } finally {
      await plugin.dispose();
    }
  };
  const first = [];
  await start(first);
  assert.deepEqual(first, [["session.prompt", { id: "ses_owner", text: "report of run-dead", synthetic: true }]]);
  const second = [];
  await start(second);
  assert.deepEqual(second, []);
  const byID = Object.fromEntries(runStore.listRuns().map((run) => [run.runID, run]));
  assert.equal(byID["run-dead"].reportDelivery, "delivered");
  assert.equal(byID["run-dead"].ownerPID, process.pid);
  assert.equal("report" in byID["run-dead"], false);
  assert.equal(byID["run-live"].reportDelivery, "pending_delivery");
  assert.equal(byID["run-elsewhere"].reportDelivery, "pending_delivery");
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test tests/report-delivery.test.mjs`
Expected: FAIL, `ℹ tests 8`, `ℹ pass 0`, `ℹ fail 8`:
- "notify calls onSent": `deepEqual` `[]` vs `['now']` (onSent is ignored);
- "a throwing onSent": `deepEqual` `[]` vs the callback message;
- "a runtime persists": `deepEqual` diff on the first record (no `ownerPID`, `directory`,
  `reportDelivery`);
- "updateRun": `TypeError: store.updateRun is not a function`;
- the three background tests: `deepEqual` diff, actual is
  `[["finish", ...], ["session.prompt", ...]]` (the bare `started.then`);
- "replayed exactly once": `deepEqual` `[]` vs the one replayed prompt.

- [ ] **Step 4: Implement**

4a. Replace `lib/notify.js` with the file below. It is the 0.13.2 file (identity read, three-failure
fallback, ordered idle re-queue, `checked` SDK errors) with `onSent` threaded through `notify`, the
queue and the idle flush. Nothing 0.13.2 does is dropped, so `tests/notify-identity.mjs` stays green.
Checked 2026-10-08 on a scratch copy: the five `tests/notify-identity.mjs` tests and the two onSent
tests of Step 2 pass with this file; with the unchanged 0.13.2 file the two onSent tests fail as Step 3
says. (The pre-rebase text replaced the file with the 0.12 notifier plus `onSent`, which would have
deleted the 0.13 identity handling and broken `tests/notify-identity.mjs`.)
```js
// Completion notifications back into the owning session.
//
// A background workflow finishing while its session sits idle used to mean the
// user comes back and asks "did it finish?". Instead the plugin prompts the
// owning session with a synthetic part carrying the result summary -- the
// model relays it in one cheap turn, exactly like Claude Code's task
// notifications. If the session is mid-turn the notification queues and
// flushes on that session's next idle event (the plugin sees every event).
//
// `onSent` is the delivery receipt durable callers need: it runs once, only after
// the text was actually sent, whether at once, from the idle flush or through the
// identity fallback. It never runs for a send that failed, and a throwing callback
// never causes a second send.
import { checked, readIdentity } from './session-identity.js';

export const createNotifier = ({ client, directory }) => {
  const query = directory ? { directory } : {};
  const pending = new Map();
  const identityFailures = new Map();
  // Busy-tracking from this process's own event stream. Sending a prompt into
  // a mid-turn session is NOT a safe no-op -- depending on host version it can
  // queue into (and steer) the running turn -- so a session last seen busy
  // queues until its idle event rather than trusting a send to fail cleanly.
  const busy = new Set();

  const send = async (sessionID, text) => {
    let identity;
    try {
      identity = await readIdentity(client, directory, sessionID);
      identityFailures.delete(sessionID);
    } catch (error) {
      const failures = (identityFailures.get(sessionID) ?? 0) + 1;
      identityFailures.set(sessionID, failures);
      if (failures < 3) throw error;
      console.error(`notification identity fallback session=${sessionID} after ${failures} consecutive failures: ${String(error?.message ?? error)}`);
      checked(await client.session.prompt({ path: { id: sessionID }, query,
        body: { parts: [{ type: 'text', text, synthetic: true }] },
      }), `notify ${sessionID}`);
      identityFailures.delete(sessionID);
      return;
    }
    checked(await client.session.prompt({ path: { id: sessionID }, query,
      body: { ...identity, parts: [{ type: 'text', text, synthetic: true }] },
    }), `notify ${sessionID}`);
  };

  const enqueue = (sessionID, text, onSent) => {
    const queue = pending.get(sessionID) ?? [];
    queue.push({ text, onSent });
    pending.set(sessionID, queue);
  };

  const receipt = (onSent) => {
    if (!onSent) return;
    try {
      onSent();
    } catch (error) {
      console.error(`notification delivery callback failed: ${String(error?.message ?? error)}`);
    }
  };

  const notify = async (sessionID, text, onSent) => {
    if (!sessionID) return false;
    if (busy.has(sessionID)) {
      enqueue(sessionID, text, onSent);
      return false;
    }
    try {
      await send(sessionID, text);
    } catch (error) {
      console.error(`notification failed session=${sessionID} remaining=1: ${String(error?.message ?? error)}`);
      enqueue(sessionID, text, onSent);
      return false;
    }
    receipt(onSent);
    return true;
  };

  const onEvent = async (event) => {
    const sessionID = event?.properties?.sessionID ?? event?.properties?.info?.id;
    if (!sessionID) return;
    if (event?.type === "session.status") {
      const status = event?.properties?.status?.type;
      if (status && status !== "idle") busy.add(sessionID);
      return;
    }
    if (event?.type === "session.deleted") {
      busy.delete(sessionID);
      pending.delete(sessionID);
      identityFailures.delete(sessionID);
      return;
    }
    if (event?.type !== "session.idle") return;
    busy.delete(sessionID);
    const queue = pending.get(sessionID);
    if (!queue?.length) return;
    pending.delete(sessionID);
    for (let index = 0; index < queue.length; index++) {
      try { await send(sessionID, queue[index].text); }
      catch (error) {
        console.error(`notification failed session=${sessionID} remaining=${queue.length - index}: ${String(error?.message ?? error)}`);
        // Stop at the first failure: a later send must not overtake an earlier one.
        // The failed item and the rest go back in order, ahead of anything queued
        // while this flush was awaiting.
        pending.set(sessionID, [...queue.slice(index), ...(pending.get(sessionID) ?? [])]);
        break;
      }
      // Only reached after a successful send; the receipt never re-sends.
      receipt(queue[index].onSent);
    }
  };

  return { notify, onEvent, pendingCount: () => [...pending.values()].reduce((n, q) => n + q.length, 0) };
};
```

4b. In `lib/run-store.js`, replace:
```js
  const listRuns = () => {
    let release;
    try {
      release = lock(root);
      return runsUnlocked(root).map(({ record }) => record).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    } catch { return []; } finally { release?.(); }
  };
```
with:
```js
  // Lenient by default (the HUD-facing listing); `strict` callers that act on the result,
  // like start-time report replay, get the error instead of an empty list.
  const listRuns = ({ strict = false } = {}) => {
    let release;
    try {
      release = lock(root);
      return runsUnlocked(root).map(({ record }) => record).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    } catch (error) {
      if (strict) throw error;
      return [];
    } finally { release?.(); }
  };
  // Read-modify-write of one record under the store lock. `change` receives the current
  // record (null when absent) and returns the next record, or null to leave it untouched.
  const updateRun = (runID, change) => {
    if (!/^[A-Za-z0-9-]+$/.test(runID)) throw new Error("workflow run id contains invalid characters");
    const release = lock(root);
    try {
      const name = `${runID}.json`;
      const current = runsUnlocked(root).find((run) => run.name === name)?.record ?? null;
      const next = change(current);
      if (next === null) return null;
      if (next?.runID !== runID) throw new Error(`workflow run ${runID}: an update changes its run id`);
      writeAtomic(root, name, next);
      return next;
    } finally { release(); }
  };
```
then replace:
```js
  return { writeRun, listRuns, pruneRuns, dir: () => ensure(root) };
```
with:
```js
  return { writeRun, listRuns, updateRun, pruneRuns, dir: () => ensure(root) };
```
and replace:
```js
export const listRuns = defaultStore.listRuns;
```
with:
```js
export const listRuns = defaultStore.listRuns;
export const updateRun = defaultStore.updateRun;
```

4c. In `lib/runtime.js`, replace:
```js
  const state = { phase: "starting", agentsStarted: 0, agentsDone: 0, status: "running" };
```
with:
```js
  const state = { phase: "starting", agentsStarted: 0, agentsDone: 0, status: "running", reportDelivery: "none" };
```
replace:
```js
        ...(state.leaked ? { leaked: state.leaked } : {}),
```
with:
```js
        ...(state.leaked ? { leaked: state.leaked } : {}),
        // Background report delivery. ownerPID and directory scope start-time replay to
        // this project and to owners that are gone; the report text is kept only while it
        // is still owed to the session.
        ...(directory ? { directory } : {}),
        ownerPID: process.pid,
        reportDelivery: state.reportDelivery,
        ...(state.reportDelivery === "pending_delivery" ? { report: state.report } : {}),
```
and replace:
```js
  return { runID, agent, parallel, pipeline, phase, parseJson, finish };
```
with:
```js
  // The background report is on disk BEFORE anyone is told about it, so a process that
  // dies in between leaves a record the next start replays. Both writes are required:
  // a failed write throws to the caller instead of being swallowed.
  const persistReport = (text) => {
    state.report = String(text);
    state.reportDelivery = "pending_delivery";
    record(true);
  };
  const reportDelivered = () => {
    state.reportDelivery = "delivered";
    delete state.report;
    record(true);
  };

  return { runID, agent, parallel, pipeline, phase, parseJson, finish, persistReport, reportDelivered };
```

4d. In `lib/core.js`, replace:
```js
import { createNotifier } from "./notify.js";
```
with:
```js
import { createNotifier } from "./notify.js";
import { listRuns, newRunID, pruneRuns, updateRun, writeRun } from "./run-store.js";
```
In the option list, replace:
```js
  participants = createChildRegistry().participants,
}) => {
```
with:
```js
  participants = createChildRegistry().participants,
  runStore = { newRunID, writeRun, listRuns, updateRun, pruneRuns },
}) => {
```

4e. In `lib/core.js`, replace the head of `executeWorkflow` (as Task 5 left it):
```js
  const executeWorkflow = async ({ workflow, args, parentSessionID, resume, delivery }) => {
    const runtime = runtimeFactory({
      client, directory, parentSessionID, workflowName: workflow.meta.name,
      resume: resume === true, manager, delegation,
      participantReady, participants, deliveryHandlers, delivery,
    });
    try {
```
with:
```js
  // The run store is passed explicitly, so the record a runtime writes and the record
  // start-time replay reads are the same store.
  const startRuntime = ({ workflow, parentSessionID, resume, delivery }) => runtimeFactory({
    client, directory, parentSessionID, workflowName: workflow.meta.name,
    resume: resume === true, manager, delegation,
    participantReady, participants, deliveryHandlers, delivery, store: runStore,
  });
  const runScript = async (runtime, { workflow, args, resume }) => {
    try {
```
and replace its tail:
```js
      return { runID: runtime.runID, report: typeof report === "string" ? report : JSON.stringify(report, null, 2) };
    } catch (error) {
      runtime.finish(error);
      throw error;
    }
  };
```
with:
```js
      return typeof report === "string" ? report : JSON.stringify(report, null, 2);
    } catch (error) {
      runtime.finish(error);
      throw error;
    }
  };
  const executeWorkflow = async (input) => {
    const runtime = startRuntime(input);
    return { runID: runtime.runID, report: await runScript(runtime, input) };
  };

  // Durable background report. The report is written as "pending_delivery" BEFORE the
  // owning session is prompted and marked "delivered" only once notify.js actually sent
  // it. A report that cannot be persisted is never sent: an unrecorded send could not be
  // told apart from a lost one, so the write error is reported instead.
  const markDelivered = (runID, mark) => {
    try {
      mark();
    } catch (error) {
      console.error(`workflow run ${runID}: the report was delivered but could not be marked delivered: ${String(error?.message ?? error)}`);
    }
  };
  const reportInBackground = async (runtime, { name, workflow, args, resume, parentSessionID }) => {
    let text;
    try {
      const report = await runScript(runtime, { workflow, args, resume });
      text = `[workflow "${name}" finished: ${runtime.runID}]\nRelay the result to the user.\n\n${report}`;
    } catch (error) {
      text = `[workflow "${name}" FAILED]\nRelay this to the user: ${String(error?.message ?? error).slice(0, 400)}`;
    }
    try {
      runtime.persistReport(text);
    } catch (error) {
      console.error(`workflow "${name}" run ${runtime.runID}: the report could not be persisted, so it was not delivered: ${String(error?.message ?? error)}`);
      return;
    }
    await notifier.notify(parentSessionID, text, () => markDelivered(runtime.runID, () => runtime.reportDelivered()));
  };

  // Start-time replay of background reports whose owner died between persisting and
  // delivering them. Only this directory's records and only dead owners (ESRCH; EPERM
  // counts as alive). Each is claimed first, under the run-store lock, by rewriting its
  // ownerPID to this process, so two starting processes never both send it; a crash after
  // the claim leaves a dead owner again and the next start retries it.
  const ownerAlive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      if (error?.code === "ESRCH") return false;
      if (error?.code === "EPERM") return true;
      throw error;
    }
  };
  const replayable = (run) => run?.reportDelivery === "pending_delivery" && run.directory === directory &&
    typeof run.report === "string" && typeof run.sessionID === "string" && run.sessionID.length > 0 &&
    Number.isSafeInteger(run.ownerPID) && run.ownerPID > 0 && !ownerAlive(run.ownerPID);
  const replayReports = async () => {
    // Without a project directory this plugin cannot tell its records from another's.
    if (typeof directory !== "string" || directory.length === 0) return;
    try {
      for (const run of runStore.listRuns({ strict: true })) {
        if (!replayable(run)) continue;
        const claimed = runStore.updateRun(run.runID, (current) => (replayable(current) ? { ...current, ownerPID: process.pid } : null));
        if (!claimed) continue;
        await notifier.notify(claimed.sessionID, claimed.report, () => markDelivered(claimed.runID, () => {
          runStore.updateRun(claimed.runID, (current) => {
            if (current?.reportDelivery !== "pending_delivery" || current.ownerPID !== process.pid) return null;
            const { report: _delivered, ...rest } = current;
            return { ...rest, reportDelivery: "delivered" };
          });
        }));
      }
    } catch (error) {
      // Reported, and never allowed to block participant recovery or reconciliation.
      console.error(`workflow report replay failed: ${String(error?.message ?? error)}`);
    }
  };
```

4f. In `workflow_run.execute`, replace the background block (as Task 5 left it):
```js
            const started = executeWorkflow({ workflow, args: toolArgs.args, parentSessionID, resume: toolArgs.resume, delivery: "background" });
            started.then(
              ({ runID, report }) => notifier.notify(parentSessionID,
                `[workflow "${toolArgs.name}" finished: ${runID}]\nRelay the result to the user.\n\n${report}`),
              (error) => notifier.notify(parentSessionID,
                `[workflow "${toolArgs.name}" FAILED]\nRelay this to the user: ${String(error?.message ?? error).slice(0, 400)}`),
            );
```
with:
```js
            // Built before the tool returns: a run that cannot write its first record fails
            // this call instead of starting a report that could never be persisted.
            const runtime = startRuntime({ workflow, parentSessionID, resume: toolArgs.resume, delivery: "background" });
            // Not awaited: the tool returns at once.
            reportInBackground(runtime, { name: toolArgs.name, workflow, args: toolArgs.args, resume: toolArgs.resume, parentSessionID })
              .catch((error) => console.error(`workflow "${toolArgs.name}" background report failed: ${String(error?.message ?? error)}`));
```

4g. In the startup block Task 6 wrote, insert one line directly before its `await participantReady;`
(the only `await participantReady;` in `lib/core.js`, inside the gated pass 2 chain; check with
`grep -c 'await participantReady;' lib/core.js` → `1`), with the same indentation. Leave pass 1
(`childRecovery`), `heldBack` and `teams.startRecovery();` unchanged. `replayReports` never
rejects, so it cannot block participant recovery or the full reconcile, and it does not delay pass 1:
```js
await replayReports();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/report-delivery.test.mjs`
Expected: PASS, `ℹ tests 8`, `ℹ pass 8`, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests` = SUITEBASE + 15, `ℹ fail 0`. In particular `tests/live-order.test.mjs`'s
background plugin test still receives the unchanged
`[workflow "bg" finished: run-test]...` literal, and `tests/workflows.test.mjs` "background runs
deliver their report to the owning session, queued while busy" still sends once after the idle event. `tests/notify-identity.mjs` and the 0.13 team tests pass unchanged.

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* /tmp/wf-report-runs-* /tmp/wf-outcome-cache-* 2>/dev/null | wc -l`
Expected: TMPBASE_D.

- [ ] **Step 6: Commit**

Inspect first: `git --no-pager status`, `git --no-pager diff`, `git --no-pager log --oneline -10`.
Expected: exactly the eleven paths below changed or added.
```bash
git add lib/notify.js lib/run-store.js lib/runtime.js lib/core.js tests/fixtures/participants.mjs tests/report-delivery.test.mjs tests/workflows.test.mjs tests/loop-guard.test.mjs tests/live-order.test.mjs tests/participant-recovery.test.mjs tests/team-tools.mjs
git commit -m "Persist background workflow reports before delivering them and replay undelivered ones at start"
```

### Task 9: Terminal outcomes: the settlement module, the terminal detector and start-time replay

Terminal outcomes take two commits. **This task**: the settlement module, the pure terminal detector
`terminalOf`, start-time replay of unacknowledged terminals, and the cache/resume guarantee.
**Task 10** (next task): detection at the `session.prompt` call site in `agent()`, routed to the
settler, and the background run's silence in `lib/core.js`.

**Files:**
- Create: `lib/outcomes.js`
- Modify: `lib/participant-recovery.js` (one import; one declaration; one `else if` leg)
- Modify: `tests/participant-recovery.test.mjs` (Task 6's `terminal` loop case becomes an
  already-acknowledged terminal; one line)
- Create: `tests/outcomes.test.mjs`

**Interfaces:**
- `isDelegationTerminal(value)`: true only for Plan 1's `DelegationTerminal` schema exactly: the four
  keys `outcomeID`, `branchID`, `kind`, `errorCode`, nothing else; non-empty ID strings; `kind` one
  of `permission_handoff`, `question_handoff`, `internal_error`, `protocol_failure`; `errorCode`
  string or null.
- `terminalOf(reply, record)`: pure (no call, no write). Returns `reply.error.data` only when ALL
  hold: `reply.error?.name === "DelegationTerminal"`; `data` has exactly the keys `outcomeID`,
  `branchID`, `kind`, `errorCode`; `kind` is one of `permission_handoff`, `question_handoff`,
  `internal_error`, `protocol_failure`; `errorCode` is a string or null; `outcomeID` is a non-empty
  string; `branchID === record.branch.branchID`. Otherwise `null`. A reply named
  `DelegationTerminal` that returns `null` here is a protocol failure, handled in Task 10.
- `acknowledgeTerminal({ delegation, participants, record })`: throws if `record.outcomeID` is not a
  non-empty string; else `acknowledgeOutcome({ outcomeID, branch, ownerExecution })` (no worker
  field), then `participants.update(branchID, { reportDelivery: "delivered" })`.
- `createOutcomeSettler({ delegation, participants })` returns:
  - `foreground({ terminal, record })` → `{ payload, acknowledge }`: `resolveOutcome({ outcomeID,
    branch, ownerExecution })`, then `update(branchID, { outcomeID, state: "terminal" })`, then the
    payload is returned; the caller hands it to the owning `agent()` call and only then calls
    `acknowledge()`, which runs `acknowledgeOutcome({ outcomeID, branch, ownerExecution })` once and
    then marks every record of the outcome `reportDelivery: "delivered"`.
  - `background({ terminal, record })`: `update(branchID, { outcomeID, blocked: true, state:
    "terminal" })` BEFORE `acknowledgeOutcome`, then `"delivered"`. No resolve, no notifier, no client:
    the settler has no channel that could announce anything.
  - One settlement per `outcomeID` per process: a second record reporting the same outcome (a
    nested branch) is marked terminal and joins it; core sees one resolve and one acknowledgement.
    Neither method ever calls `createOutcome`, `completeBranch` or `failBranch`.
  - A value that is not exactly a terminal is refused before any call:
    `workflows refuses a value that is not a delegation terminal`.
- Branch-record convention (contract fields unchanged): on a `terminal` record, `reportDelivery`
  records the outcome acknowledgement, `"none"` until `acknowledgeOutcome` succeeded and
  `"delivered"` after.
- `recoverParticipants`: a dead owner's record with `state: "terminal"` and `reportDelivery` other
  than `"delivered"` is first taken over through Task 6's `takeOver`, then acknowledged through
  `acknowledgeTerminal` with the taken fences, once per `outcomeID` per pass
  (further records of the same outcome are only marked `"delivered"`). No retire: `manager.reconcile`
  runs next and owns dead-owner children. The replay is one more leg inside Task 6's loop, so it
  claims and releases exactly like Task 6 (RECONCILE R1): each `recoverParticipants` call mints its
  own claimant, the record is taken with `store.claim(branchID, claimant)` (null: skipped for this
  start) and the replay acts on the record `claim` returned; a successful acknowledgement (or a
  join that only marks `"delivered"`) is followed by Task 6's `store.release(branchID, claimant)`,
  and a failed one throws past it and leaves the lease to expire after `RETIRE_LEASE_MS`. No claim
  files, no store `dir`. `owner_alive` leaves the terminal record and `reportDelivery` unchanged,
  then releases; `branch_already_terminal` means core holds nothing to acknowledge, so recovery
  marks `reportDelivery: "delivered"` without an acknowledgement. A `handoff` record that Task 6
  recovery found is acknowledged in Task 6's same pass; this replay does not revisit it.

- [ ] **Step 0: Record this task's baselines**

Before any edit, measure TASKSTART, SUITEBASE (= TASKSTART - 15) and TMPBASE_D as the header's "Baselines and test counts" section defines them. Later steps compare against them.

- [ ] **Step 1: Pin Task 6's terminal case to an already-acknowledged terminal**

In `tests/participant-recovery.test.mjs`, check `grep -c 'next: "terminal"}' tests/participant-recovery.test.mjs` → `1` and `grep -c 'caseRecord(entry)' tests/participant-recovery.test.mjs` → `4` (the state loop, the idempotency test and the two lines in the all-seven test; the definition reads `caseRecord = (entry)` and does not match), then replace:
```js
  {state: "terminal", prompts: 0, failures: 0, updates: 0, retires: 0, next: "terminal"}
```
with:
```js
  {state: "terminal", prompts: 0, failures: 0, updates: 0, retires: 0, next: "terminal", overrides: {outcomeID: "outcome_terminal", reportDelivery: "delivered"}}
```
Task 6's `caseRecord(entry)` already spreads `entry.overrides` into every record built from a case
(the state loop, "durable-state idempotency ..." and "successful run over all seven cases leaves no
lease"), so this one line re-pins all three; without it, Step 4b's replay would acknowledge the
terminal case in the two multi-record tests and their `store.update` counts of 8 would read 10
(the takeover's fence update plus `delivered`).
(An acknowledged terminal stays a no-op. Task 6's old fixture, a terminal with `outcomeID: null` and
`reportDelivery: "none"`, is a record no code writes; the unacknowledged case is pinned below.)

- [ ] **Step 2: Write the failing tests**

Create `tests/outcomes.test.mjs`:
```js
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOutcomeSettler, terminalOf } from "../lib/outcomes.js";
import { recoverParticipants } from "../lib/participant-recovery.js";
import { createWorkflowRuntime } from "../lib/runtime.js";
import { fakeDelegation, fakeExecution, TAKER, takenOver } from "./fixtures/delegation.mjs";
import { participation, scratchParticipantStore } from "./fixtures/participants.mjs";

const ownerExecution = fakeExecution("ses_parent");
const branchOf = (n) => ({ ...ownerExecution, branchID: `branch_${n}`, branchFencingToken: n });
const recordOf = (n, fields = {}) => ({
  runID: "run-test", delivery: "foreground", branch: branchOf(n), ownerExecution, childSessionID: `ses_child${n}`,
  registryReservationID: `resv_${n}`, agent: "worker", prompt: "do the thing", directory: "/d",
  state: "prompted", promptStartedAt: 4242, promptedAt: 4242, outcomeID: null, blocked: false,
  reportDelivery: "none", ownerPID: process.pid, ...fields,
});
const terminal = { outcomeID: "outcome_1", branchID: "branch_1", kind: "question_handoff", errorCode: null };
// fakeDelegation's fixed resolveOutcome answer.
const PAYLOAD = { type: "internal_error", message: "Delegated interaction could not be transferred." };
const ack = (outcomeID, n) => ["acknowledgeOutcome", { outcomeID, branch: branchOf(n), ownerExecution }];
const delivered = (n) => ["store.update", `branch_${n}`, { reportDelivery: "delivered" }];

// The participants view with every update recorded into the same order as the delegation
// calls; claim, release and prune are forwarded unrecorded (recovery requires all seven methods).
const recorded = (order, store) => ({
  write: (record) => store.write(record),
  get: (branchID) => store.get(branchID),
  list: () => store.list(),
  update: (branchID, patch) => {
    order.push(["store.update", branchID, patch]);
    return store.update(branchID, patch);
  },
  claim: (branchID, claimant) => store.claim(branchID, claimant),
  release: (branchID, claimant) => store.release(branchID, claimant),
  // Task 6's seventh view method; recovery refuses a view without it (Design decision 21 (iv)).
  prune: (input) => store.prune(input),
});

const settlerWith = (...records) => {
  const order = [];
  const store = scratchParticipantStore();
  for (const record of records) store.write(record);
  const settler = createOutcomeSettler({ delegation: fakeDelegation({ order }), participants: recorded(order, store) });
  return { order, store, settler };
};

test("a foreground terminal resolves, persists, hands back the payload, and only then acknowledges once", async () => {
  const { order, store, settler } = settlerWith(recordOf(1));
  const { payload, acknowledge } = await settler.foreground({ terminal, record: store.get("branch_1") });
  order.push(["returned", payload]);
  await acknowledge();
  await acknowledge();
  assert.deepEqual(order, [
    ["resolveOutcome", { outcomeID: "outcome_1", branch: branchOf(1), ownerExecution }],
    ["store.update", "branch_1", { outcomeID: "outcome_1", state: "terminal" }],
    ["returned", PAYLOAD],
    ack("outcome_1", 1),
    delivered(1),
  ]);
  assert.deepEqual(store.get("branch_1"), recordOf(1, { outcomeID: "outcome_1", state: "terminal", reportDelivery: "delivered" }));
});

test("a background terminal is stored blocked and terminal before the acknowledgement, and nothing else happens", async () => {
  const { order, store, settler } = settlerWith(recordOf(1, { delivery: "background" }));
  await settler.background({ terminal, record: store.get("branch_1") });
  assert.deepEqual(order, [
    ["store.update", "branch_1", { outcomeID: "outcome_1", blocked: true, state: "terminal" }],
    ack("outcome_1", 1),
    delivered(1),
  ]);
  assert.deepEqual(store.get("branch_1"), recordOf(1, { delivery: "background", outcomeID: "outcome_1", blocked: true, state: "terminal", reportDelivery: "delivered" }));
});

test("nested branches ending with the same terminal produce one outcome", async () => {
  // branch_2 is the inner branch the terminal originated in; branch_1 is its outer branch.
  const nested = { outcomeID: "outcome_1", branchID: "branch_2", kind: "permission_handoff", errorCode: null };
  const { order, store, settler } = settlerWith(recordOf(1), recordOf(2));
  const inner = await settler.foreground({ terminal: nested, record: store.get("branch_2") });
  const outer = await settler.foreground({ terminal: nested, record: store.get("branch_1") });
  assert.deepEqual(inner.payload, PAYLOAD);
  assert.deepEqual(outer.payload, PAYLOAD);
  await inner.acknowledge();
  await outer.acknowledge();
  assert.deepEqual(order, [
    ["resolveOutcome", { outcomeID: "outcome_1", branch: branchOf(2), ownerExecution }],
    ["store.update", "branch_2", { outcomeID: "outcome_1", state: "terminal" }],
    ["store.update", "branch_1", { outcomeID: "outcome_1", state: "terminal" }],
    ack("outcome_1", 2),
    delivered(2),
    delivered(1),
  ]);
});

test("a value that is not exactly a delegation terminal is refused before any call", async () => {
  const { order, store, settler } = settlerWith(recordOf(1));
  const record = store.get("branch_1");
  await assert.rejects(settler.foreground({ terminal: { ...terminal, extra: true }, record }), /workflows refuses a value that is not a delegation terminal/);
  await assert.rejects(settler.foreground({ terminal: { data: terminal }, record }), /workflows refuses a value that is not a delegation terminal/);
  await assert.rejects(settler.background({ terminal: { ...terminal, kind: "completed" }, record }), /workflows refuses a value that is not a delegation terminal/);
  assert.deepEqual(order, []);
  assert.deepEqual(store.get("branch_1"), recordOf(1));
});

test("startup replay acknowledges a dead owner's unacknowledged terminal exactly once per outcome", async () => {
  const DEAD_PID = 2147483647;
  assert.throws(() => process.kill(DEAD_PID, 0), (error) => error?.code === "ESRCH");
  const order = [];
  const store = scratchParticipantStore();
  store.write(recordOf(1, { state: "terminal", outcomeID: "outcome_1", ownerPID: DEAD_PID }));
  store.write(recordOf(2, { state: "terminal", outcomeID: "outcome_2" }));
  store.write(recordOf(3, { state: "terminal", outcomeID: "outcome_3", ownerPID: DEAD_PID, reportDelivery: "delivered" }));
  store.write(recordOf(4, { state: "terminal", outcomeID: "outcome_4", ownerPID: DEAD_PID }));
  store.write(recordOf(5, { state: "terminal", outcomeID: "outcome_4", ownerPID: DEAD_PID }));
  // Design decision 22 (b), decided 2026-10-08: a dead owner's open record whose branch core holds
  // in handoff. Task 6 recovery looks it up and acknowledges it in this first pass; later passes
  // do nothing for outcome_6.
  store.write(recordOf(6, { ownerPID: DEAD_PID }));
  const base = fakeDelegation({ order });
  const delegation = {
    ...base,
    // Plan 1 rejects fail on a handoff branch with this tagged struct (not an Error).
    failBranch: async (input) => { await base.failBranch(input); throw { _tag: "DelegationBranchError", code: "invalid_branch_state" }; },
    pendingOutcome: async (input) => {
      await base.pendingOutcome(input);
      return { outcomeID: "outcome_6", branchID: input.branch.branchID, kind: "question_handoff", errorCode: null };
    },
  };
  const options = {
    delegation, store: recorded(order, store), directory: "/d",
    manager: { retire: async (sessionID) => { order.push(["manager.retire", sessionID]); } },
  };
  await recoverParticipants(options);
  assert.deepEqual(order, [
    ["takeOverBranch", {branch: branchOf(1), ownerExecution}],
    ["store.update", "branch_1", takenOver({branch: branchOf(1), ownerExecution})],
    ["acknowledgeOutcome", {outcomeID: "outcome_1", ...takenOver({branch: branchOf(1), ownerExecution})}], delivered(1),
    ["takeOverBranch", {branch: branchOf(4), ownerExecution}],
    ["store.update", "branch_4", takenOver({branch: branchOf(4), ownerExecution})],
    ["acknowledgeOutcome", {outcomeID: "outcome_4", ...takenOver({branch: branchOf(4), ownerExecution})}], delivered(4), delivered(5),
    ["takeOverBranch", {branch: branchOf(6), ownerExecution}],
    ["store.update", "branch_6", takenOver({branch: branchOf(6), ownerExecution})],
    ["failBranch", { branch: takenOver({branch: branchOf(6), ownerExecution}).branch, errorCode: "invalid_branch_state" }],
    ["pendingOutcome", { branch: takenOver({branch: branchOf(6), ownerExecution}).branch, ownerExecution: takenOver({branch: branchOf(6), ownerExecution}).ownerExecution }],
    ["store.update", "branch_6", { outcomeID: "outcome_6", state: "terminal" }],
    ["acknowledgeOutcome", {outcomeID: "outcome_6", ...takenOver({branch: branchOf(6), ownerExecution})}], delivered(6),
  ]);
  order.length = 0;
  await recoverParticipants(options);
  assert.deepEqual(order, []);
  order.length = 0;
  await recoverParticipants(options);
  assert.deepEqual(order, []);
  assert.equal(store.get("branch_2").reportDelivery, "none", "a live owner acknowledges its own outcome");
  // The record keeps the fences takeOverBranch answered (Design decision 22), not the dead owner's.
  assert.deepEqual(store.get("branch_6"), recordOf(6, { ...takenOver({ branch: branchOf(6), ownerExecution }), ownerPID: DEAD_PID, outcomeID: "outcome_6", state: "terminal", reportDelivery: "delivered" }));
  // Every replay call released every dead-owner record it claimed: a fresh claimant takes each one.
  for (const n of [1, 3, 4, 5, 6]) {
    assert.notEqual(store.claim(`branch_${n}`, `${process.pid}-probe`), null, `branch_${n} keeps no lease`);
  }
});

test("startup replay leaves a terminal record whose takeover answers owner_alive unacknowledged and releases its lease", async () => {
  const DEAD_PID = 2147483647;
  const order = [];
  const store = scratchParticipantStore();
  const record = recordOf(7, {state: "terminal", outcomeID: "outcome_7", ownerPID: DEAD_PID});
  store.write(record);
  const base = fakeDelegation({order});
  const delegation = {...base, takeOverBranch: async (input) => {
    await base.takeOverBranch(input);
    throw {_tag: "DelegationBranchError", code: "owner_alive"};
  }};
  await recoverParticipants({delegation, store, directory: "/d", manager: {retire: async () => {}}});
  assert.deepEqual(order, [["takeOverBranch", {branch: record.branch, ownerExecution}]]);
  assert.equal(store.get("branch_7").reportDelivery, "none");
  assert.notEqual(store.claim("branch_7", `${process.pid}-probe`), null);
});

test("startup replay marks a terminal record delivered without acknowledging when its takeover answers branch_already_terminal", async () => {
  const DEAD_PID = 2147483647;
  const order = [];
  const store = scratchParticipantStore();
  const record = recordOf(8, {state: "terminal", outcomeID: "outcome_8", ownerPID: DEAD_PID});
  store.write(record);
  const base = fakeDelegation({order});
  const delegation = {...base, takeOverBranch: async (input) => {
    await base.takeOverBranch(input);
    throw {_tag: "DelegationBranchError", code: "branch_already_terminal"};
  }};
  await recoverParticipants({delegation, store, directory: "/d", manager: {retire: async () => {}}});
  assert.deepEqual(order, [["takeOverBranch", {branch: record.branch, ownerExecution}]]);
  assert.equal(store.get("branch_8").reportDelivery, "delivered");
});

test("startup replay leaves a terminal record whose takeover is refused unacknowledged, and acknowledges one already carrying this process's Worker without a takeover", async (t) => {
  const DEAD_PID = 2147483647;
  const order = [];
  const store = scratchParticipantStore();
  // branch_2: an earlier pass in this process (Worker TAKER) took it over and persisted the taken
  // fences, then its acknowledgement threw (2026-10-08 takeover fixes).
  const own = takenOver({branch: branchOf(2), ownerExecution});
  store.write(recordOf(1, {state: "terminal", outcomeID: "outcome_1", ownerPID: DEAD_PID}));
  store.write(recordOf(2, {...own, state: "terminal", outcomeID: "outcome_2", ownerPID: DEAD_PID}));
  const errors = t.mock.method(console, "error", () => {});
  const base = fakeDelegation({order});
  const delegation = {...base, takeOverBranch: async (input) => {
    await base.takeOverBranch(input);
    throw {_tag: "DelegationBranchError", code: "wrong_domain"};
  }};
  await recoverParticipants({delegation, store: recorded(order, store), directory: "/d", manager: {retire: async () => {}}, worker: TAKER});
  assert.deepEqual(order, [
    ["takeOverBranch", {branch: branchOf(1), ownerExecution}],
    ["acknowledgeOutcome", {outcomeID: "outcome_2", ...own}], delivered(2),
  ]);
  assert.equal(store.get("branch_1").reportDelivery, "none");
  assert.notEqual(store.claim("branch_1", `${process.pid}-probe`), null);
  assert.deepEqual(errors.mock.calls.map((call) => String(call.arguments[0])).filter((line) => line.includes("refused")),
    ["participant recovery: core refused the takeover of branch branch_1 (wrong_domain); leaving its record for manual inspection"]);
});

test("a resume cache hit sends no prompt and settles no outcome", async (t) => {
  // The agent-result cache lives under $HOME; point it at a scratch home for this test.
  const originalHome = process.env.HOME;
  const home = mkdtempSync(join(tmpdir(), "wf-outcome-cache-"));
  process.env.HOME = home;
  t.after(() => {
    process.env.HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });
  const runtimeFor = (order, resume) => createWorkflowRuntime({
    client: { session: {
      create: async () => { order.push(["session.create"]); return { data: { id: "ses_child1" } }; },
      prompt: async () => { order.push(["session.prompt"]); return { data: { parts: [{ type: "text", text: "child reply" }] } }; },
    } },
    directory: "/d", parentSessionID: "ses_parent", workflowName: "wd-cache-hit", resume,
    store: { newRunID: () => "run-test", writeRun: () => {}, pruneRuns: () => {} },
    manager: {
      reserve: () => ({ reservationID: "resv_1", marker: "[workflow-reservation:resv_1]" }),
      failReservation: () => null,
      bindReservation: () => null,
      register: async (input) => ({ ...input }),
      retire: async () => ({ verified: true }),
    },
    delegation: fakeDelegation({ order }), ...participation(),
  });
  const first = [];
  assert.equal(await runtimeFor(first, false).agent("do the thing", { agent: "worker", intent: "read" }), "child reply");
  assert.deepEqual(first, [
    ["currentExecution", { sessionID: "ses_parent" }],
    ["reserveBranch", { parentSessionID: "ses_parent", rootSessionID: "ses_parent", ownerExecution, parentBranchID: null, kind: "workflow", delivery: "foreground" }],
    ["session.create"],
    ["bindBranch", { branch: branchOf(1), childSessionID: "ses_child1" }],
    ["acknowledgeBranch", { branch: branchOf(1), ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
    ["session.prompt"],
    ["completeBranch", { branch: branchOf(1), resultID: "run-test" }],
  ]);
  const second = [];
  assert.equal(await runtimeFor(second, true).agent("do the thing", { agent: "worker", intent: "read" }), "child reply");
  assert.deepEqual(second, []);
});

// terminalOf: Plan 1 Task 18's one terminal signal (HTTP 409 through the v1 SDK client:
// reply.data undefined, reply.error { name: "DelegationTerminal", data }), accepted only for
// the record's own branch. Every row runs against recordOf(1), whose branchID is "branch_1".
const terminalError = (data) => ({ data: undefined, error: { name: "DelegationTerminal", data } });
const internalTerminal = { outcomeID: "outcome_2", branchID: "branch_1", kind: "internal_error", errorCode: "sanitizer_failed" };
const permissionTerminal = { outcomeID: "outcome_3", branchID: "branch_1", kind: "permission_handoff", errorCode: null };
const protocolTerminal = { outcomeID: "outcome_4", branchID: "branch_1", kind: "protocol_failure", errorCode: "invalid_branch_state" };
const TERMINAL_REPLIES = [
  { name: "a question_handoff terminal", reply: terminalError(terminal), expected: terminal },
  { name: "an internal_error terminal with a string errorCode", reply: terminalError(internalTerminal), expected: internalTerminal },
  { name: "a permission_handoff terminal", reply: terminalError(permissionTerminal), expected: permissionTerminal },
  { name: "a protocol_failure terminal", reply: terminalError(protocolTerminal), expected: protocolTerminal },
  { name: "a normal message reply", reply: { data: { parts: [{ type: "text", text: "child reply" }] } }, expected: null },
  { name: "an ordinary error reply", reply: { data: undefined, error: { name: "UnknownError", data: { message: "provider overloaded" } } }, expected: null },
  { name: "a terminal body under another error name", reply: { data: undefined, error: { name: "NamedError", data: terminal } }, expected: null },
  { name: "a terminal body under data", reply: { data: terminal }, expected: null },
  { name: "an extra key", reply: terminalError({ ...terminal, extra: true }), expected: null },
  { name: "a missing errorCode key", reply: terminalError({ outcomeID: "outcome_1", branchID: "branch_1", kind: "question_handoff" }), expected: null },
  { name: "an unknown kind", reply: terminalError({ ...terminal, kind: "completed" }), expected: null },
  { name: "a numeric errorCode", reply: terminalError({ ...terminal, errorCode: 409 }), expected: null },
  { name: "an undefined errorCode", reply: terminalError({ ...terminal, errorCode: undefined }), expected: null },
  { name: "an empty outcomeID", reply: terminalError({ ...terminal, outcomeID: "" }), expected: null },
  { name: "a numeric outcomeID", reply: terminalError({ ...terminal, outcomeID: 1 }), expected: null },
  { name: "another branch's terminal", reply: terminalError({ ...terminal, branchID: "branch_2" }), expected: null },
  { name: "a null reply", reply: null, expected: null },
  { name: "data that is not an object", reply: terminalError("DelegationTerminal"), expected: null },
];

for (const { name, reply, expected } of TERMINAL_REPLIES) {
  test(`terminalOf: ${name}`, () => {
    assert.deepEqual(terminalOf(reply, recordOf(1)), expected);
  });
}
```

- [ ] **Step 3: Run them to verify they fail**

Run: `node --test tests/outcomes.test.mjs`
Expected: FAIL. The file does not load: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.../lib/outcomes.js' imported from .../tests/outcomes.test.mjs`; `ℹ fail 1`.

Run: `node --test tests/participant-recovery.test.mjs`
Expected: PASS, `ℹ fail 0` (Step 1 only re-pins a no-op case).

- [ ] **Step 4: Implement**

4a. Create `lib/outcomes.js`:
```js
// Terminal delegation outcomes for workflow branches (contract "Results and outcomes").
//
// A branch whose child ended in a DelegationTerminal is settled here and is never
// completed or failed (lib/runtime.js checks for "terminal" before failing a branch).
//   foreground: resolveOutcome under the owning execution, persist the record as
//     "terminal", hand the payload to the owning agent() call, and only then
//     acknowledgeOutcome. Its input is exactly { outcomeID, branch, ownerExecution }:
//     the host injects the worker.
//   background: core has already injected the result into the root session, so the
//     record is persisted as a blocked terminal BEFORE acknowledgeOutcome, and nothing
//     is announced: this module has no client and no notifier.
// On a terminal branch record, reportDelivery records the acknowledgement: "none" until
// acknowledgeOutcome succeeded, "delivered" after. Startup recovery
// (lib/participant-recovery.js) acknowledges a dead owner's terminal that is not
// "delivered", once per outcome.
//
// Nested branches ending with the same outcome share one settlement in this process:
// core sees one resolve and one acknowledgement, and every record of the outcome is
// marked terminal and then delivered.

const TERMINAL_KEYS = JSON.stringify(["branchID", "errorCode", "kind", "outcomeID"]);
const TERMINAL_KINDS = new Set(["permission_handoff", "question_handoff", "internal_error", "protocol_failure"]);
// Settlements kept for late nested reports, oldest evicted first. Nested reports of one
// outcome arrive together, far inside this bound.
const MAX_SETTLEMENTS = 1024;

const nonEmpty = (value) => typeof value === "string" && value.length > 0;

// Plan 1's DelegationTerminal schema, exactly: four keys, a known kind, a nullable code.
export const isDelegationTerminal = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value) &&
  JSON.stringify(Object.keys(value).sort()) === TERMINAL_KEYS &&
  nonEmpty(value.outcomeID) && nonEmpty(value.branchID) && TERMINAL_KINDS.has(value.kind) &&
  (value.errorCode === null || typeof value.errorCode === "string");

const checkTerminal = (terminal) => {
  if (!isDelegationTerminal(terminal)) throw new Error("workflows refuses a value that is not a delegation terminal");
};

// The one terminal signal a plugin SDK caller gets (Plan 1 Task 18): the legacy blocking
// prompt answers HTTP 409 with { name: "DelegationTerminal", data }, which the v1 client
// returns as reply.data === undefined and reply.error deep-equal to that body, with no
// parts. Returns `data` only when it is exactly a DelegationTerminal for this record's own
// branch, otherwise null. Pure: no call and no write. The caller treats a reply named
// DelegationTerminal that returns null here as a protocol failure, never as a terminal.
export const terminalOf = (reply, record) => {
  const error = reply?.error;
  if (error?.name !== "DelegationTerminal") return null;
  const terminal = error.data;
  if (!isDelegationTerminal(terminal)) return null;
  return terminal.branchID === record?.branch?.branchID ? terminal : null;
};

const outcomeInput = (outcomeID, record) => ({ outcomeID, branch: record.branch, ownerExecution: record.ownerExecution });

export const acknowledgeTerminal = async ({ delegation, participants, record }) => {
  if (!nonEmpty(record?.outcomeID)) {
    throw new Error(`workflows cannot acknowledge terminal record ${record?.branch?.branchID}: it has no outcomeID`);
  }
  await delegation.acknowledgeOutcome(outcomeInput(record.outcomeID, record));
  return participants.update(record.branch.branchID, { reportDelivery: "delivered" });
};

export const createOutcomeSettler = ({ delegation, participants }) => {
  const settlements = new Map();

  const remember = (settlement) => {
    settlements.set(settlement.outcomeID, settlement);
    while (settlements.size > MAX_SETTLEMENTS) settlements.delete(settlements.keys().next().value);
  };

  const fresh = (terminal, record) => ({
    outcomeID: terminal.outcomeID, owner: record, branchIDs: [], payload: null, acknowledged: null, done: false,
  });

  // One acknowledgement per outcome, made under the first record's fences; then every
  // record that shares the outcome is marked delivered.
  const acknowledgeOnce = (settlement) => {
    settlement.acknowledged ??= (async () => {
      await delegation.acknowledgeOutcome(outcomeInput(settlement.outcomeID, settlement.owner));
      settlement.done = true;
      for (const branchID of settlement.branchIDs) participants.update(branchID, { reportDelivery: "delivered" });
    })();
    return settlement.acknowledged;
  };

  // A later record of an outcome this process already settled: terminal too, and
  // delivered at once when the shared acknowledgement already happened.
  const join = (settlement, record, patch) => {
    participants.update(record.branch.branchID, patch);
    settlement.branchIDs.push(record.branch.branchID);
    if (settlement.done) participants.update(record.branch.branchID, { reportDelivery: "delivered" });
  };

  return {
    // Returns { payload, acknowledge }. The caller hands `payload` to the owning agent()
    // call and calls acknowledge() after that, never before.
    async foreground({ terminal, record }) {
      checkTerminal(terminal);
      const patch = { outcomeID: terminal.outcomeID, state: "terminal" };
      const existing = settlements.get(terminal.outcomeID);
      if (existing) {
        const payload = await existing.payload;
        join(existing, record, patch);
        return { payload, acknowledge: () => acknowledgeOnce(existing) };
      }
      const settlement = fresh(terminal, record);
      settlement.payload = delegation.resolveOutcome(outcomeInput(terminal.outcomeID, record));
      remember(settlement);
      let payload;
      try {
        payload = await settlement.payload;
      } catch (error) {
        // Nothing was persisted, so a later report of this outcome may resolve it again.
        settlements.delete(terminal.outcomeID);
        throw error;
      }
      participants.update(record.branch.branchID, patch);
      settlement.branchIDs.push(record.branch.branchID);
      return { payload, acknowledge: () => acknowledgeOnce(settlement) };
    },
    async background({ terminal, record }) {
      checkTerminal(terminal);
      const patch = { outcomeID: terminal.outcomeID, blocked: true, state: "terminal" };
      const existing = settlements.get(terminal.outcomeID);
      if (existing) {
        join(existing, record, patch);
        return acknowledgeOnce(existing);
      }
      const settlement = fresh(terminal, record);
      // Persisted BEFORE the acknowledgement: once acknowledged, core may forget the
      // outcome, and a restart must still know this branch ended in a terminal.
      participants.update(record.branch.branchID, patch);
      settlement.branchIDs.push(record.branch.branchID);
      remember(settlement);
      return acknowledgeOnce(settlement);
    },
  };
};
```

4b. In `lib/participant-recovery.js` (Task 6's module; it claims with `store.claim(branchID,
claimant)` and releases with `store.release(branchID, claimant)`, one claimant per call, and
`record` inside the loop is the copy `claim` returned), replace:
```js
import {randomUUID} from "node:crypto";
```
with:
```js
import {randomUUID} from "node:crypto";
import {acknowledgeTerminal} from "./outcomes.js";
```
replace:
```js
  for (const listed of store.list()) {
```
with:
```js
  // Outcomes acknowledged in this pass: nested branches share one outcome, and core sees
  // one acknowledgement for it.
  const acknowledgedOutcomes = new Set();
  for (const listed of store.list()) {
```
and replace:
```js
        await manager.retire(record.childSessionID);
      }
    }
    // Successful actions and no-op states release the lease; a failed action throws past
```
with:
```js
        await manager.retire(record.childSessionID);
      }
    } else if (record.state === "terminal" && record.reportDelivery !== "delivered") {
      // Outcome replay: the owner died between storing the terminal and acknowledging it. The record's
      // fences are a dead Worker's, so the branch is taken over first (Plan 1, decided 2026-10-08).
      // It runs under this call's lease like every other action; a failed takeover or acknowledgement
      // throws past the release below and leaves the lease to expire.
      // No retire here: manager.reconcile runs next and owns dead-owner children.
      if (acknowledgedOutcomes.has(record.outcomeID)) {
        store.update(branchID, {reportDelivery: "delivered"});
      } else {
        const taken = await takeOver(delegation, store, record, worker);
        if (taken.skip === "terminal") {
          // Core already closed the branch, so it holds no outcome to acknowledge.
          store.update(branchID, {reportDelivery: "delivered"});
        } else if (taken.record) {
          await acknowledgeTerminal({delegation, participants: store, record: taken.record});
          acknowledgedOutcomes.add(record.outcomeID);
        }
        // skip owner_alive or refused: left for a later start or for manual inspection; the lease is released below.
      }
    }
    // Successful actions and no-op states release the lease; a failed action throws past
```
Do not add a second claim or release, and do not touch the filesystem directly: Task 6's
`store.claim` before the action and `store.release` after it cover the replay leg too.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test tests/outcomes.test.mjs`
Expected: PASS, `ℹ tests 27`, `ℹ pass 27`, `ℹ fail 0` (nine settlement tests and eighteen
`terminalOf:` rows).

Run: `node --test tests/participant-recovery.test.mjs`
Expected: PASS, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests` = SUITEBASE + 42, `ℹ fail 0`.

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* /tmp/wf-report-runs-* /tmp/wf-outcome-cache-* 2>/dev/null | wc -l`
Expected: TMPBASE_D.

- [ ] **Step 6: Commit**

Inspect first: `git --no-pager status`, `git --no-pager diff`, `git --no-pager log --oneline -10`.
```bash
git add lib/outcomes.js lib/participant-recovery.js tests/outcomes.test.mjs tests/participant-recovery.test.mjs
git commit -m "Detect and settle delegation terminals once per outcome and acknowledge a dead owner's terminal at start"
```

### Task 10: Terminal detection in `agent()`, routed to the settler

**Files:**
- Modify: `lib/runtime.js` (one import; one option; `state.handoff` and the settler;
  `settleTerminal` in `agent()`; detection before step 13; `handedOff()`)
- Modify: `lib/core.js` (one import; one settler per plugin, passed to every runtime;
  `reportInBackground` stops on `handedOff()`)
- Modify: `tests/live-order.test.mjs` (`pluginClient`, `runThroughPlugin`; twelve tests appended)
- Modify: `tests/report-delivery.test.mjs` (`recordingRuntime`, `runInBackground`; one test appended)
- Modify: `tests/workflows.test.mjs` (the two fake runtimes Task 8 extended gain `handedOff`)

**Interfaces:**
- Consumes: Task 9's `terminalOf` and `createOutcomeSettler`; Task 7's `failBranchOnThrow`,
  `failAfterPrompt`, `liveRuntime({ reply })`, `throughPrompt`, `promptedUpdate`, `failBranchCall`,
  `failedUpdate`, `handlerAndRetire`, `dispatchChild`; Task 8's `startRuntime`, `reportInBackground`,
  `recordingRuntime`, `runInBackground`; Task 5's `pluginClient`, `runThroughPlugin`.
- `createWorkflowRuntime({ ..., outcomes })`: the settler. `lib/core.js` always passes its one
  `createOutcomeSettler({ delegation, participants })` per plugin instance. A runtime built without
  one (tests) creates its own over the same `delegation` and `participants` it was given.
- Runtime `handedOff()`: true once a child of this background run ended in a terminal.
- `agent()` after step 12, in this order:
  1. `ownRecord = participants.get(branchID)`, `terminal = terminalOf(reply, ownRecord)`. A
     terminal turns `failBranchOnThrow` off BEFORE step 13, so from here on nothing (step 13's
     write included) completes or fails the branch.
  2. Step 13, unchanged.
  3. Foreground terminal: `settler.foreground({ terminal, record: ownRecord })` (`resolveOutcome`,
     then `{ outcomeID, state: "terminal" }`). The payload is now in this `agent()` call's hands.
     Then `acknowledge()` (`acknowledgeOutcome`, then `{ reportDelivery: "delivered" }`). Then the
     finally discards the handler and retires the child, and `agent()` resolves with the payload
     (not cached; `opts.json` does not apply). A rejected acknowledgement is reported on stderr and
     the payload is still returned; the record keeps `reportDelivery: "none"` for startup replay.
     A rejected `resolveOutcome` (or terminal write) records `{ outcomeID, state: "terminal" }` and
     rethrows, so startup recovery acknowledges the branch instead of failing it.
  4. Background terminal: `state.handoff = outcomeID`; `settler.background({ terminal, record:
     ownRecord })` (`{ outcomeID, blocked: true, state: "terminal" }` BEFORE `acknowledgeOutcome`,
     then `"delivered"`); the finally discards the handler and retires the child; `agent()` rejects
     with `workflow agent "<label>": the child handed off to the root session (<kind>, outcome <outcomeID>)`.
  5. `reply.error.name === "DelegationTerminal"` but `terminalOf` returned null: a protocol
     failure. `agent()` throws `workflow agent "<label>": the child's reply is a malformed delegation terminal`
     and the catch runs Task 7's `failAfterPrompt` (`failBranch` with `invalid_branch_state`, then
     `"failed"`). Never settled, never completed.
  6. Anything else: Task 7's judgement, unchanged.
- `reportInBackground`: once the script settled and before `persistReport`,
  `if (runtime.handedOff()) return;`. No report is persisted, `notifier.notify` is never called,
  and no synthetic prompt reaches the owning session.

- [ ] **Step 0: Record this task's baselines**

Before any edit, measure TASKSTART, SUITEBASE (= TASKSTART - 42) and TMPBASE_D as the header's "Baselines and test counts" section defines them. Later steps compare against them.

- [ ] **Step 1: Write the failing tests**

1a. Give the two fake runtimes in `tests/workflows.test.mjs` the new method (mechanical):
```bash
perl -pi -e 's/persistReport: \(\) => \{\}, reportDelivered: \(\) => \{\},/persistReport: () => {}, reportDelivered: () => {}, handedOff: () => false,/g' tests/workflows.test.mjs
grep -c 'reportDelivered: () => {}, handedOff: () => false,' tests/workflows.test.mjs
```
Expected: `2`.

1b. In `tests/report-delivery.test.mjs`, replace:
```js
const recordingRuntime = (order, { persistFails = null, finished = () => {} } = {}) => () => ({
```
with:
```js
const recordingRuntime = (order, { persistFails = null, finished = () => {}, handedOff = false } = {}) => () => ({
```
replace:
```js
  reportDelivered: () => { order.push(["reportDelivered"]); },
});
```
with:
```js
  reportDelivered: () => { order.push(["reportDelivered"]); },
  handedOff: () => handedOff,
});
```
replace:
```js
const runInBackground = async ({ run, persistFails = null }) => {
```
with:
```js
const runInBackground = async ({ run, persistFails = null, handedOff = false }) => {
```
replace:
```js
  const plugin = pluginFor({ order, workflow: { meta: { name: "bg" }, run }, runtimeFactory: recordingRuntime(order, { persistFails, finished }) });
```
with:
```js
  const plugin = pluginFor({ order, workflow: { meta: { name: "bg" }, run }, runtimeFactory: recordingRuntime(order, { persistFails, finished, handedOff }) });
```
and append to the END of the file:
```js

test("a background run whose child handed off persists no report and sends nothing", async () => {
  // `order` also records every session.prompt the plugin sends, synthetic ones included.
  const order = await runInBackground({ run: async () => { throw new Error("handed off"); }, handedOff: true });
  assert.deepEqual(order, [["finish", "handed off"]]);
});
```

1c. In `tests/live-order.test.mjs`, replace:
```js
const pluginClient = () => {
  const parents = new Map();
  const deleted = [];
  let notified;
  const firstNotification = new Promise((resolve) => { notified = resolve; });
  return {
    deleted, firstNotification,
```
with:
```js
// `childReply` replaces every non-synthetic prompt's reply; `synthetic` records every
// synthetic (notification) prompt.
const pluginClient = ({ childReply = null } = {}) => {
  const parents = new Map();
  const deleted = [];
  const synthetic = [];
  let notified;
  const firstNotification = new Promise((resolve) => { notified = resolve; });
  return {
    deleted, firstNotification, synthetic,
```
replace:
```js
        if (body.parts[0].synthetic) {
          notified({ id: path.id, text: body.parts[0].text });
          return { data: { parts: [] } };
        }
        return { data: { parts: [{ type: "text", text: `reply from ${path.id}` }] } };
```
with:
```js
        if (body.parts[0].synthetic) {
          synthetic.push({ id: path.id, text: body.parts[0].text });
          notified({ id: path.id, text: body.parts[0].text });
          return { data: { parts: [] } };
        }
        return childReply ?? { data: { parts: [{ type: "text", text: `reply from ${path.id}` }] } };
```
replace:
```js
const runThroughPlugin = async ({ background }) => {
```
with:
```js
const runThroughPlugin = async ({ background, childReply = null }) => {
```
replace:
```js
    const client = pluginClient();
```
with:
```js
    const client = pluginClient({ childReply });
    // The run's end and every report it persists, observed on the real runtime.
    const reports = [];
    let finished;
    const runFinished = new Promise((resolve) => { finished = resolve; });
```
replace:
```js
      runtimeFactory: (options) => createWorkflowRuntime({ ...options, store: fakeRunStore() }),
    });
    const returned = await plugin.tool.workflow_run.execute({ name: "bg", ...(background ? { background: true } : {}) }, { sessionID: "ses_owner" });
    const notification = background ? await client.firstNotification : null;
```
with:
```js
      runtimeFactory: (options) => {
        const runtime = createWorkflowRuntime({ ...options, store: fakeRunStore() });
        return {
          ...runtime,
          finish: (error) => { const result = runtime.finish(error); finished(); return result; },
          persistReport: (text) => { reports.push(text); return runtime.persistReport(text); },
        };
      },
    });
    const returned = await plugin.tool.workflow_run.execute({ name: "bg", ...(background ? { background: true } : {}) }, { sessionID: "ses_owner" });
    const notification = background && !childReply ? await client.firstNotification : null;
    if (childReply) {
      await runFinished;
      // One macrotask: everything core does after finish() runs in the microtasks before it.
      await new Promise(setImmediate);
    }
```
and replace:
```js
    return { order, modes, left, participants, client, returned, notification };
```
with:
```js
    return { order, modes, left, participants, client, returned, notification, reports };
```

1d. Append to the END of `tests/live-order.test.mjs`:
```js

// Task 10: terminal outcomes at the session.prompt call site. The one pinned terminal signal
// (Plan 1 Task 18): reply.data undefined, reply.error { name: "DelegationTerminal", data }.
const terminalBody = { outcomeID: "outcome_1", branchID: "branch_1", kind: "question_handoff", errorCode: null };
const terminalReply = { data: undefined, error: { name: "DelegationTerminal", data: terminalBody } };
// fakeDelegation's fixed resolveOutcome answer (the PAYLOAD tests/outcomes.test.mjs pins).
const PAYLOAD = { type: "internal_error", message: "Delegated interaction could not be transferred." };
const resolveCall = ["resolveOutcome", { outcomeID: "outcome_1", branch, ownerExecution }];
const ackCall = ["acknowledgeOutcome", { outcomeID: "outcome_1", branch, ownerExecution }];
const terminalUpdate = ["store.update", "branch_1", { outcomeID: "outcome_1", state: "terminal" }];
const deliveredUpdate = ["store.update", "branch_1", { reportDelivery: "delivered" }];
// `throughPrompt` for a background-delivery branch, in full.
const throughPromptBackground = [
  ["currentExecution", { sessionID: "ses_parent" }],
  ["reserveBranch", { parentSessionID: "ses_parent", rootSessionID: "ses_parent", ownerExecution, parentBranchID: null, kind: "workflow", delivery: "background" }],
  ["manager.reserve", { parentSessionID: "ses_parent", source: "workflow", mode: "foreground", directory: "/d" }],
  ["session.create", { title: "wf: worker [workflow-reservation:resv_1]", parentID: "ses_parent" }],
  ["manager.bindReservation", "resv_1", "ses_child1"],
  ["bindBranch", { branch, childSessionID: "ses_child1" }],
  ["manager.register", registration],
  ["store.write", { ...registered, delivery: "background" }],
  ["handlers.set", "branch_1", { ...handler, delivery: "background" }],
  ["acknowledgeBranch", { branch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
  ["store.update", "branch_1", { state: "acknowledged" }],
  ["store.update", "branch_1", { state: "prompting", promptStartedAt: 4242 }],
  ["session.prompt", { id: "ses_child1", agent: "worker", text: "do the thing" }],
];

test("a foreground terminal is resolved, recorded and acknowledged, the child retired, and only then agent() returns the payload", async () => {
  const { order, store, runtime } = liveRuntime({ reply: terminalReply });
  const payload = await dispatchChild(runtime);
  order.push(["returned", payload]);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, resolveCall, terminalUpdate, ackCall, deliveredUpdate, ...handlerAndRetire, ["returned", PAYLOAD]]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "terminal", outcomeID: "outcome_1", reportDelivery: "delivered", promptStartedAt: 4242, promptedAt: 4242 });
  assert.equal(runtime.handedOff(), false, "a foreground run reports through its tool call");
});

test("a background terminal is stored blocked and terminal before its acknowledgement, the child retired, and the run marked handed off", async () => {
  const { order, store, runtime } = liveRuntime({ delivery: "background", reply: terminalReply });
  assert.equal(runtime.handedOff(), false);
  await assert.rejects(dispatchChild(runtime), /workflow agent "worker": the child handed off to the root session \(question_handoff, outcome outcome_1\)/);
  assert.deepEqual(order, [...throughPromptBackground, promptedUpdate, ["store.update", "branch_1", { outcomeID: "outcome_1", blocked: true, state: "terminal" }], ackCall, deliveredUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, delivery: "background", state: "terminal", outcomeID: "outcome_1", blocked: true, reportDelivery: "delivered", promptStartedAt: 4242, promptedAt: 4242 });
  assert.equal(runtime.handedOff(), true);
});

test("a rejected acknowledgement is reported, the payload is still returned, and the record is left for startup replay", async (t) => {
  const errors = [];
  t.mock.method(console, "error", (message) => { errors.push(message); });
  const { order, store, runtime } = liveRuntime({ reply: terminalReply, fail: { acknowledgeOutcome: boom } });
  assert.deepEqual(await dispatchChild(runtime), PAYLOAD);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, resolveCall, terminalUpdate, ackCall, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "terminal", outcomeID: "outcome_1", promptStartedAt: 4242, promptedAt: 4242 });
  assert.deepEqual(errors, ["workflows could not acknowledge outcome outcome_1 for branch branch_1; startup recovery acknowledges it once this process is gone: injected failure"]);
});

test("a rejected resolveOutcome records the branch terminal, never fails it, and rejects", async () => {
  const { order, store, runtime } = liveRuntime({ reply: terminalReply, fail: { resolveOutcome: boom } });
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, resolveCall, terminalUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "terminal", outcomeID: "outcome_1", promptStartedAt: 4242, promptedAt: 4242 });
});

test("a terminal reply whose step-13 write fails is never failed", async () => {
  const { order, store, runtime } = liveRuntime({ reply: terminalReply, failOn: failingAt("store.update", (_branchID, patch) => patch.state === "prompted") });
  await assert.rejects(dispatchChild(runtime), /injected failure/);
  assert.deepEqual(order, [...throughPrompt, promptedUpdate, ...handlerAndRetire]);
  assert.deepEqual(store.get("branch_1"), { ...registered, state: "prompting", promptStartedAt: 4242 });
});

// A reply named DelegationTerminal that is not exactly this branch's terminal: a protocol
// failure, failed like any error reply (failBranch, then "failed"), never settled.
const MALFORMED_TERMINALS = [
  { name: "an extra key", data: { ...terminalBody, extra: true } },
  { name: "a missing errorCode key", data: { outcomeID: "outcome_1", branchID: "branch_1", kind: "question_handoff" } },
  { name: "an unknown kind", data: { ...terminalBody, kind: "completed" } },
  { name: "a numeric errorCode", data: { ...terminalBody, errorCode: 409 } },
  { name: "an empty outcomeID", data: { ...terminalBody, outcomeID: "" } },
  { name: "another branch's branchID", data: { ...terminalBody, branchID: "branch_2" } },
];

for (const { name, data } of MALFORMED_TERMINALS) {
  test(`a DelegationTerminal reply with ${name} fails the branch and is never settled`, async () => {
    const { order, store, runtime } = liveRuntime({ reply: { data: undefined, error: { name: "DelegationTerminal", data } } });
    await assert.rejects(dispatchChild(runtime), /workflow agent "worker": the child's reply is a malformed delegation terminal/);
    assert.deepEqual(order, [...throughPrompt, promptedUpdate, failBranchCall, failedUpdate, ...handlerAndRetire]);
    assert.deepEqual(store.get("branch_1"), { ...registered, state: "failed", promptStartedAt: 4242, promptedAt: 4242 });
  });
}

test("a background child that hands off is settled through the real plugin, retired, and the run announces nothing", { timeout: 5000 }, async () => {
  const { order, left, participants, client, returned, reports } = await runThroughPlugin({ background: true, childReply: terminalReply });
  assert.match(returned, /started in the background/);
  assert.deepEqual(client.synthetic, [], "no synthetic prompt reached the owning session");
  assert.deepEqual(reports, [], "no report was persisted, so notify was never called");
  const owner = fakeExecution("ses_owner");
  const ownerBranch = { ...owner, branchID: "branch_1", branchFencingToken: 1 };
  assert.deepEqual(order, [
    ["registerParticipant", WORKFLOWS_PARTICIPANT],
    ["currentExecution", { sessionID: "ses_owner" }],
    ["reserveBranch", { parentSessionID: "ses_owner", rootSessionID: "ses_owner", ownerExecution: owner, parentBranchID: null, kind: "workflow", delivery: "background" }],
    ["bindBranch", { branch: ownerBranch, childSessionID: "ses_child1" }],
    ["acknowledgeBranch", { branch: ownerBranch, ownerComponent: "workflows", ownerBuildID: "opencode-agent-workflows@0.15.0", protocol: "opencode.delegation/v1" }],
    ["acknowledgeOutcome", { outcomeID: "outcome_1", branch: ownerBranch, ownerExecution: owner }],
  ]);
  const [record] = participants.list();
  assert.deepEqual(participants.list(), [{
    runID: "run-test", delivery: "background", branch: ownerBranch, ownerExecution: owner, childSessionID: "ses_child1",
    registryReservationID: record.registryReservationID, agent: "scout", prompt: "summarise the notes", directory: "/d",
    state: "terminal", promptStartedAt: record.promptStartedAt, promptedAt: record.promptedAt, outcomeID: "outcome_1",
    blocked: true, reportDelivery: "delivered", ownerPID: process.pid,
  }]);
  assert.deepEqual(client.deleted, ["ses_child1"]);
  assert.deepEqual(left, { records: [], reservations: [] }, "the child was retired through the registry");
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --test tests/live-order.test.mjs`
Expected: FAIL, `ℹ tests 40`, `ℹ pass 28`, `ℹ fail 12`. Task 7 judges the terminal reply as an
ordinary error reply: it fails the branch and rejects with the JSON of `reply.error`
(`{"name":"DelegationTerminal","data":{...}}`). So:
- foreground terminal and rejected acknowledgement: the test fails with that rejection;
- background terminal: `TypeError: runtime.handedOff is not a function`;
- rejected resolveOutcome and the six malformed rows: `The input did not match the regular
  expression` (the rejection is the JSON message, not `injected failure` / `malformed delegation terminal`);
- step-13 write fails: order `deepEqual` diff, actual holds `failBranch` and `{ state: "failed" }`;
- plugin test: `client.synthetic` `deepEqual` diff, actual holds one `[workflow "bg" FAILED]` prompt.

Run: `node --test tests/report-delivery.test.mjs`
Expected: FAIL, `ℹ tests 9`, `ℹ pass 8`, `ℹ fail 1`: the new test's order diff, actual
`[["finish", "handed off"], ["persistReport", ...], ["session.prompt", ...], ["reportDelivered"]]`.

- [ ] **Step 3: Implement** (3a-3e in `lib/runtime.js`, 3f-3i in `lib/core.js`)

3a. In `lib/runtime.js`, replace:
```js
import { acknowledgeInput } from "./delegation.js";
```
with:
```js
import { acknowledgeInput } from "./delegation.js";
import { createOutcomeSettler, terminalOf } from "./outcomes.js";
```
and in the option list replace:
```js
  participantReady, participants, deliveryHandlers, delivery = "foreground",
```
with:
```js
  participantReady, participants, deliveryHandlers, delivery = "foreground", outcomes = null,
```

3b. Replace:
```js
  const state = { phase: "starting", agentsStarted: 0, agentsDone: 0, status: "running", reportDelivery: "none" };
```
with:
```js
  const state = { phase: "starting", agentsStarted: 0, agentsDone: 0, status: "running", reportDelivery: "none", handoff: null };
  // Terminal outcomes (Tasks 9-10). lib/core.js passes one settler per plugin instance, shared by
  // every run it starts; a runtime built without one (tests) settles through its own, over
  // the same delegation and participant-record view it was given.
  const settler = outcomes ?? createOutcomeSettler({ delegation, participants });
```

3c. Replace:
```js
    const discardHandler = () => {
      if (!handlerInstalled) return;
```
with:
```js
    // Tasks 9-10: settle this branch's delegation terminal. A terminal branch is never completed
    // or failed: the caller turned failBranchOnThrow off before calling this.
    const settleTerminal = async (terminal, ownRecord) => {
      if (delivery === "background") {
        // Core already delivered the outcome to the root session: from here on this run
        // announces nothing (lib/core.js asks handedOff() before any report).
        state.handoff = terminal.outcomeID;
        await settler.background({ terminal, record: ownRecord });
        throw new Error(`workflow agent "${label}": the child handed off to the root session (${terminal.kind}, outcome ${terminal.outcomeID})`);
      }
      let settled;
      try {
        settled = await settler.foreground({ terminal, record: ownRecord });
      } catch (settleError) {
        // resolveOutcome (or the terminal write after it) failed. Core still holds this
        // branch as a terminal: record it as one, so startup recovery acknowledges the
        // outcome instead of failing the branch.
        try {
          participants.update(branch.branchID, { outcomeID: terminal.outcomeID, state: "terminal" });
        } catch (storeError) {
          console.error(`workflows could not record branch ${branch.branchID} terminal: ${String(storeError?.message ?? storeError)}`);
        }
        throw settleError;
      }
      // The payload is in this agent() call's hands; only now is the outcome acknowledged.
      // The finally then discards the handler and retires the child, and agent() resolves.
      try {
        await settled.acknowledge();
      } catch (ackError) {
        console.error(`workflows could not acknowledge outcome ${terminal.outcomeID} for branch ${branch.branchID}; startup recovery acknowledges it once this process is gone: ${String(ackError?.message ?? ackError)}`);
      }
      return settled.payload;
    };
    const discardHandler = () => {
      if (!handlerInstalled) return;
```

3d. Insert detection BEFORE the `reply.error` throw. Replace (Task 7's text):
```js
      // 13: the prompt call returned; persisted before the reply is judged.
      participants.update(branch.branchID, { state: "prompted", promptedAt: now() });
      // An error reply, or a 2xx reply that is not an SDK message (no `parts` array), fails
      // the branch exactly like a throwing prompt: the catch calls failAfterPrompt.
      if (reply?.error) throw new Error(String(reply.error?.message ?? JSON.stringify(reply.error)).slice(0, 300));
```
with:
```js
      // Tasks 9-10: a delegation terminal arrives only as an error reply named DelegationTerminal
      // (Plan 1 Task 18). It is detected before step 13, so no later failure, step 13's
      // write included, can complete or fail a branch that ended in a terminal.
      const ownRecord = participants.get(branch.branchID);
      const terminal = terminalOf(reply, ownRecord);
      if (terminal) failBranchOnThrow = false;
      // 13: the prompt call returned; persisted before the reply is judged.
      participants.update(branch.branchID, { state: "prompted", promptedAt: now() });
      if (terminal) return await settleTerminal(terminal, ownRecord);
      // Named DelegationTerminal but not exactly this branch's terminal: a protocol failure,
      // failed like any other error reply and never settled.
      if (reply?.error?.name === "DelegationTerminal") throw new Error(`workflow agent "${label}": the child's reply is a malformed delegation terminal`);
      // An error reply, or a 2xx reply that is not an SDK message (no `parts` array), fails
      // the branch exactly like a throwing prompt: the catch calls failAfterPrompt.
      if (reply?.error) throw new Error(String(reply.error?.message ?? JSON.stringify(reply.error)).slice(0, 300));
```

3e. Replace:
```js
  return { runID, agent, parallel, pipeline, phase, parseJson, finish, persistReport, reportDelivered };
```
with:
```js
  // True once a child of this background run ended in a delegation terminal: core already
  // delivered that outcome to the root session, so lib/core.js sends no report for the run.
  const handedOff = () => state.handoff !== null;

  return { runID, agent, parallel, pipeline, phase, parseJson, finish, persistReport, reportDelivered, handedOff };
```

3f. In `lib/core.js`, replace the child-session import (as Task 5 left it):
```js
import { backgroundTaskResult, createChildManager, createChildRegistry, nativeTaskState, taskChildFromAfter } from "./child-session.js";
```
with:
```js
import { backgroundTaskResult, createChildManager, createChildRegistry, nativeTaskState, taskChildFromAfter } from "./child-session.js";
import { createOutcomeSettler } from "./outcomes.js";
```

3g. Replace:
```js
  const deliveryHandlers = new Map();
  const notifier = createNotifier({ client, directory });
```
with:
```js
  const deliveryHandlers = new Map();
  // One outcome settler per plugin instance, shared by every run it starts, so one outcome
  // is resolved and acknowledged once in this process.
  const outcomes = createOutcomeSettler({ delegation, participants });
  const notifier = createNotifier({ client, directory });
```

3h. In `startRuntime`, replace:
```js
    participantReady, participants, deliveryHandlers, delivery, store: runStore,
```
with:
```js
    participantReady, participants, deliveryHandlers, delivery, store: runStore, outcomes,
```

3i. In `reportInBackground`, replace:
```js
      text = `[workflow "${name}" FAILED]\nRelay this to the user: ${String(error?.message ?? error).slice(0, 400)}`;
    }
    try {
      runtime.persistReport(text);
```
with:
```js
      text = `[workflow "${name}" FAILED]\nRelay this to the user: ${String(error?.message ?? error).slice(0, 400)}`;
    }
    // A child of this run ended in a delegation terminal: core already delivered that
    // outcome to the root session, so this run persists and sends no report at all.
    if (runtime.handedOff()) return;
    try {
      runtime.persistReport(text);
```

Check: `grep -c 'createOutcomeSettler(' lib/core.js` → `1`; `grep -c 'terminalOf(reply, ownRecord)' lib/runtime.js` → `1`;
`grep -c 'runtime.handedOff()' lib/core.js` → `1`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/live-order.test.mjs`
Expected: PASS, `ℹ tests 40`, `ℹ pass 40`, `ℹ fail 0`.

Run: `node --test tests/report-delivery.test.mjs`
Expected: PASS, `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`.

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests` = SUITEBASE + 55, `ℹ fail 0`.

Run: `ls -d /tmp/wf-participants-* /tmp/wf-live-registry-* /tmp/wf-report-runs-* /tmp/wf-outcome-cache-* 2>/dev/null | wc -l`
Expected: TMPBASE_D.

- [ ] **Step 5: Commit**

Inspect first: `git --no-pager status`, `git --no-pager diff`, `git --no-pager log --oneline -10`.
Expected: exactly the five paths below modified.
```bash
git add lib/runtime.js lib/core.js tests/live-order.test.mjs tests/report-delivery.test.mjs tests/workflows.test.mjs
git commit -m "Settle a workflow child's delegation terminal in agent() and keep a handed-off background run silent"
```

### Task 11: Release 0.15.0

Task 11 ships 0.15.0. It runs after Task 10, which makes the advertised `terminalHandoffV1` capability
(`WORKFLOWS_PARTICIPANT`, Task 2) true of `agent()`.

**Files:**
- Create: `tests/release.test.mjs`
- Modify: `package.json` (`"version"` only)
- Modify: `CHANGELOG.md` (one `## [0.15.0]` section)

**Interfaces:** none new. Consumes `WORKFLOWS_BUILD_ID` (Task 2, already `opencode-agent-workflows@0.15.0`).

- [ ] **Step 0: Record this task's baselines**

Before any edit, measure TASKSTART and SUITEBASE (= TASKSTART - 55) as the header's "Baselines and test counts" section defines them. Step 4 compares against SUITEBASE.

- [ ] **Step 1: Write the failing test**

Create `tests/release.test.mjs`:
```js
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { WORKFLOWS_BUILD_ID } from "../lib/delegation.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

test("the package version, the participant build ID and the newest changelog release agree", () => {
  assert.equal(pkg.version, "0.15.0");
  assert.equal(WORKFLOWS_BUILD_ID, `opencode-agent-workflows@${pkg.version}`);
  const released = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\] - \d{4}-\d{2}-\d{2}$/gm)].map((match) => match[1]);
  assert.equal(released[0], pkg.version);
});

test("the release adds no dependency and no lockfile", () => {
  assert.deepEqual(Object.keys(pkg).filter((key) => /dependencies$/i.test(key)), ["peerDependencies"]);
  assert.deepEqual(pkg.peerDependencies, { "@opencode-ai/plugin": ">=0.4.0" });
  for (const lockfile of ["package-lock.json", "npm-shrinkwrap.json", "bun.lock", "bun.lockb", "yarn.lock", "pnpm-lock.yaml"]) {
    assert.equal(existsSync(new URL(`../${lockfile}`, import.meta.url)), false, `${lockfile} must not exist`);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test tests/release.test.mjs`
Expected: FAIL, `ℹ tests 2`, `ℹ pass 1`, `ℹ fail 1`: the first test fails with
`Expected values to be strictly equal:` / `'0.14.0' !== '0.15.0'`. The dependency/lockfile test
passes (it pins that the release keeps it that way).

- [ ] **Step 3: Bump and write the changelog entry**

3a. In `package.json`, replace `  "version": "0.14.0",` with `  "version": "0.15.0",`.

3b. Run this exact command. It dates the heading with today's UTC date, puts the section directly
below `## [Unreleased]` (so any `### Fixed` entry under it ships in 0.15.0; at `d6655f6` the section is empty) or, on a base
without that heading, directly above the published `## [0.14.0]` entry, and refuses to run if `[Unreleased]` holds any
section other than `### Fixed`:
```bash
{ printf '## [0.15.0] - %s\n\n' "$(date -u +%F)"; cat <<'EOF'
### Added

- **Workflows is a delegation participant.** `workflow_run` now requires `PluginInput.delegation`. With it, at init the plugin registers the `workflows` participant (`opencode.delegation/v1`; `backgroundDeliveryV1`, `foregroundDeliveryV1`, `registeredBranchV1`, `terminalHandoffV1`), heartbeats it every 2 seconds, and stops on dispose.
- **Every workflow child is a fenced delegation branch.** `agent()` reserves, binds and acknowledges a branch around each child in a fixed 13-step order, and keeps one durable record per branch in the managed-child registry (`~/.local/share/opencode/workflow-runs/children/participant-<branchID>.json`), written under the registry's lock.
- **Startup recovery.** Before acting on a dead process's branch, recovery asks core to take it over (`takeOverBranch`), which core grants only when that process's Worker is gone; a branch whose owner core still sees alive is left for a later start, and a branch core refuses outright (another coordination domain, not an outermost workflow branch, or an unknown or stale branch) is logged and left for manual inspection without stopping recovery. Recovery fails each taken open branch whose directory matches, then retires its child, and never re-prompts. The registry's retirement lease (the same lock, dead-owner check and 3-minute lease that child retirement uses) keeps two starting processes from acting on the same branch. A branch core reports as already terminal (`branch_already_terminal`) is recorded as failed; for a branch core reports as in handoff (`invalid_branch_state`, its outcome still pending in core), recovery looks the outcome up (`pendingOutcome`) and acknowledges it exactly once in the same pass (if core no longer holds an outcome, the record stays as takeover left it); either way recovery moves on to the next one. Finished (completed or failed) branch records are never claimed, and those of dead processes are deleted 7 days after their last write. Team and child recovery do not wait for the participant: if registration fails they still run, and only workflow children that have a participant record wait for a later start.
- **Durable background reports.** A background run's report is written to its run record as `pending_delivery` before the owning session is prompted, and marked `delivered` once it was actually sent. At the next start in the same directory, a report left pending by a dead process is sent once.
- **Terminal delegation outcomes.** A child whose prompt ends in core's `DelegationTerminal` error reply (HTTP 409) for its own branch is never completed or failed. In a foreground run, the payload is resolved under the owning execution and recorded as terminal, acknowledged once `agent()` holds it, and then the child is retired; `agent()` resolves with the payload. In a background run, core delivers the result to the root session itself. The record is marked blocked and terminal before the acknowledgement, the child is retired, `agent()` rejects, and the run sends no report. One outcome is resolved and acknowledged once per process. At start, a dead owner's unacknowledged terminal is taken over from core (`takeOverBranch`) and then acknowledged once; if core still sees its owner alive it is left for a later start, and if core already closed the branch it is marked delivered without an acknowledgement.

### Changed

- **Branch results.** After a normal reply, a branch is completed with the run ID. It is failed (`invalid_branch_state`) when the prompt, the step-13 record write or the completion throws, and when the reply is an error, a malformed `DelegationTerminal`, or not a message, unless the branch already ended in a terminal.
- **Background runs start or fail at once.** `workflow_run` with `background: true` builds the run before it returns, so a run that cannot write its record fails the call. A report that cannot be persisted is logged and never sent.
- **Run records and helpers.** Run records carry `directory`, `ownerPID` and `reportDelivery`, plus `report` while a background report is owed. `notify(sessionID, text, onSent)` takes a delivery callback, and `run-store` gains `updateRun(runID, change)` and `listRuns({ strict: true })`.
- **Without the delegation host, only `workflow_run` is refused.** On an opencode host that does not provide `PluginInput.delegation`, the plugin still loads: the 0.13 team tools, spawn briefing, team recovery, `workflow_list` and every other hook keep working, and `workflow_run` (foreground or background) fails at once with `workflow_run requires PluginInput.delegation, which this opencode host does not provide`. No participant is registered and participant recovery is skipped. `dispose` stops the participant heartbeat when there is one, then retires teammates as before. A teammate cannot start a workflow: `workflow_run` from any non-root session is refused by core (`wrong_parent`) before its child is prompted, which matches guard 1.7.x already denying `workflow_run` to team members.

EOF
} | node -e '
const fs = require("node:fs");
const entry = fs.readFileSync(0, "utf8");
const text = fs.readFileSync("CHANGELOG.md", "utf8");
const unreleased = "## [Unreleased]\n\n";
let next;
if (text.includes(unreleased)) {
  if (text.split(unreleased).length !== 2) throw new Error("CHANGELOG.md holds more than one [Unreleased] heading");
  const start = text.indexOf(unreleased) + unreleased.length;
  const end = text.indexOf("\n## [", start);
  const pending = text.slice(start, end === -1 ? text.length : end);
  const headings = pending.match(/^### .+$/gm) ?? [];
  if (headings.some((heading) => heading !== "### Fixed")) throw new Error(`[Unreleased] holds ${headings.join(", ")}: merge it into the 0.15.0 entry by hand`);
  next = text.slice(0, start) + entry + text.slice(start);
} else {
  const anchor = "## [0.14.0]";
  if (!text.includes(anchor)) throw new Error("CHANGELOG.md has neither [Unreleased] nor [0.14.0]");
  next = text.replace(anchor, entry + anchor);
}
fs.writeFileSync("CHANGELOG.md", next);
'
```
Then read the top of `CHANGELOG.md` and check that: `## [Unreleased]` (if it was there) is followed
by a blank line and `## [0.15.0] - ` plus the output of `date -u +%F`; the section's order is Added, Changed, then the
pre-existing `### Fixed` (if any); and exactly one blank line separates the last entry from the next
`## [` heading.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/release.test.mjs tests/team-release.mjs`
Expected: PASS, `ℹ tests 3`, `ℹ pass 3`, `ℹ fail 0` (`tests/team-release.mjs`, 0.13.0, needs exactly one
`## [0.15.0] - ` heading and keeps the published `## [0.14.0] - ` and `## [0.13.0] - 2026-10-08` entries).

Run: `node --test tests/*.mjs`
Expected: PASS, `ℹ tests` = SUITEBASE + 57, `ℹ fail 0`.

Run: `git --no-pager status --porcelain`
Expected: exactly ` M CHANGELOG.md`, ` M package.json`, `?? tests/release.test.mjs`.

- [ ] **Step 5: Commit**

Inspect first: `git --no-pager diff`, `git --no-pager log --oneline -10`.
```bash
git add package.json CHANGELOG.md tests/release.test.mjs
git commit -m "0.15.0: run workflow children as delegation branches with durable records, recovery and report replay"
```
