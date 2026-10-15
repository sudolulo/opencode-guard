# Core Delegation Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> - DECIDED 2026-10-08 (Holden) (Global Constraints, base): the worktree base is `2b7eb922fdc59f6560a490e266651c0e01444046` (`2b7eb922f`, branch `fork/snip-always-prefix`) = `e36bbfbb` + the 2026-10-02 shell.ts always-allow-prefix fix, the commit the deployed binary is built from. Global Constraints and the Self-Review Checklist name it; the only file it changes beyond `e36bbfbb` (`packages/opencode/src/tool/shell.ts` and its test) is not touched by this plan.
> - NOTED 2026-10-08: `git -C /home/dev/projects/opencode --no-pager status --short` (read-only; branch `fork/atomic-runtime-contracts`, HEAD `e36bbfbb9`) shows four modified files -- `packages/opencode/src/server/routes/instance/httpapi/handlers/session-errors.ts`, `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/run-state.ts`, `packages/opencode/src/session/schema.ts` -- which are the `AgentNotFoundError` work (their diff adds `AgentNotFoundError`, `mapAgentNotFound` and its error-channel typing; 33 diff lines name it), plus six untracked entries that are NOT that work and do not mention it: `packages/opencode/src/session/llm/effort-plan.ts`, `packages/schema/src/effort.ts`, `packages/opencode/test/fixtures/effort.ts`, `packages/opencode/test/provider/effort-adapters.test.ts`, `packages/opencode/test/provider/__snapshots__/` and `packages/opencode/test/session/effort-plan.test.ts` (separate effort-plan work). The isolated-worktree requirement stays: the executor creates the worktree from the base commit `2b7eb922f`, so none of the main checkout's modified or untracked files enter it; Global Constraints now names both sets as off-limits.
> - DECIDED 2026-10-08 (Holden) (Task 19, flag gate): the existing `background=true` refusal (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, `task.ts:97-102` at `2b7eb922f`) runs before `currentExecution`/`reserveBranch`, so a refused call leaves no branch. Task 19 Interfaces and Step 5h carry the order; Task 19 Step 3 adds the flag-off failing test.
> - DECIDED 2026-10-08 (Holden) (Tasks 19-20, production reality): background subagents are enabled only in attended tmux TUIs; systemd Workers, the supervisor and `oc-task` run with the flag off, so there every native branch is foreground and nothing is promoted. Tests set the flag explicitly wherever they depend on it (Global Constraints; Task 19 `make(..., { backgroundSubagents })`).
> - DECIDED 2026-10-08 (Holden) (Tasks 19-20, promotion): a promoted foreground task switches its branch `delivery` one way, foreground -> background, through `BranchService.setDelivery`; background -> foreground is refused with `invalid_branch_state` and changes nothing. The promoted call's tool result is the background result, and its outcome is delivered like any background branch (Task 19 Interfaces, Steps 2, 3, 5i; Task 20 derived delivery, Step 5h, new propagation test).
> - DECIDED 2026-10-08 (Holden) (Task 19, resume): a `task_id` resume, including `background.extend` of a running child (`task.ts:267` at `2b7eb922f`), reuses the branch already bound to that child (`BranchService.bound`, looked up by child-session uniqueness); it never reserves, binds or acknowledges (Task 19 Interfaces, Step 3, Steps 5h-5i).
> - DECIDED 2026-10-08 (Holden) (Task 19, consumer coupling): the creating task part keeps `state.input.background`, `state.metadata.sessionId` and `state.metadata.background` exactly as today; the bounded synthetic background result is never a `task` tool part carrying `state.input.background`. Task 19 Step 3 pins both shapes.
> - DECIDED 2026-10-08 (Holden) (Task 19, resume of a finished child): preserve today's behaviour. A `task_id` resume of a finished child, whose branch is closed (`retired`), succeeds by binding the resumed run to a NEW branch reservation for the same child session, under the same parent and fencing rules as a fresh spawn (`reserveBranch` -> `bindBranch` -> `acknowledgeBranch` -> prompt, no child-session creation); the closed branch is never reopened or written. A resume of a RUNNING child keeps reusing its bound branch (decided above). This needs child-session uniqueness to cover only non-retired branches (Task 3 Interfaces; narrowed to open branches by the `handoff` decision below), the lookup rule "the non-retired branch, else the most recently reserved one" (now "the open branch, ...") (Task 3, `BranchService.bound`, Task 10 Step 4b), a core test (Task 10 Step 2), an adapter test (Task 19 Step 3), and Task 19 Interfaces/Step 5i and Task 20 Step 5i wording.
> - DECIDED 2026-10-08 (Holden) (Task 19, resume of a child in `handoff`), following the finished-child decision above: a `task_id` resume of a child whose branch is in `handoff` (finished, outcome not yet consumed by the root; the branch moves on through `outcome_acknowledged -> retiring -> retired` only when that outcome is acknowledged) succeeds exactly like a resume of a retired child: a NEW branch reservation bound to the same child session under fresh-spawn parent/fencing rules. The old branch and its pending outcome are never written by the resume; the outcome stays deliverable, is delivered and acknowledged through the normal path exactly once, and is never merged into the new branch (outcomes are keyed by branch ID, `branchPath`). Child-session uniqueness therefore covers only OPEN branches (every state except `handoff`, `outcome_acknowledged`, `retiring`, `retired`), and the lookup rule becomes "the open branch, else the most recently reserved one" (Task 3), so a second resume while the new branch is open reuses it (or is refused by the runner rule) exactly as before. Carried by Task 3 Interfaces, `BranchService.bound`, Task 10 Steps 4/4b, Task 11 Step 6b (two core tests), Task 19 Interfaces/Step 3 (two adapter tests)/Step 4/Steps 5h-5i, Task 20 Step 5i, Review Focus 8 and the Self-Review Checklist.
> - DECIDED 2026-10-08 (Holden) (shared cross-plan fields): `tool.authorize` input `branch` is `(BranchFence & { delivery: "foreground" | "background"; kind: BranchStatus["kind"] }) | null`, read from the core branch record at call time (a promoted branch shows `"background"`; null carries no fields; no `parentSessionID`). Output gains optional `reason?: string`, shown to the model only on `deny` (bounded at 4096 UTF-8 bytes, else the fixed generic text) and ignored otherwise (Normative Contracts, Task 2, Consumer Interfaces, Task 16).
> - Closing pass 2026-10-08 (both former open reconciliation notes closed; one line per change):
>   - Header: main-checkout note replaced by NOTED 2026-10-08 (four `AgentNotFoundError` files plus six untracked effort-plan files, re-read with `git status --short`).
>   - Global Constraints: the worktree is created from base `2b7eb922f`; the off-limits set now names the six untracked effort-plan files beside the `AgentNotFoundError` edits.
>   - Header: finished-child resume note replaced by the DECIDED 2026-10-08 (Holden) line; the `handoff`-state resume gap it does not cover is recorded as an OPEN line.
>   - Review Focus 8: adds the finished-child resume on a new branch.
>   - Task 3 Interfaces: child-session uniqueness is a partial unique index over non-retired branches, with one lookup rule (non-retired, else most recently reserved).
>   - `BranchService.bound` doc comment: uses that lookup; `state: "retired"` tells the caller to reserve a new branch.
>   - Task 10 Step 2: new failing-first test (retired child rebinds to a new branch, retired row unchanged, a second open bind still `child_session_conflict`); Step 3 RED, Step 4 bind rule and Step 4b lookup updated.
>   - Task 19 Interfaces (Resume): splits reuse (not retired) from new-branch reservation (retired) with fresh-spawn parent/fencing rules.
>   - Task 19 Step 3: new failing-first test for a completed-child resume (new branch, same session, old branch row unchanged); the running-child test now asserts the reused branch is `running`.
>   - Task 19 Step 4 RED, Step 5h (`holdChild` holds after runner acquisition) and Step 5i (1) updated.
>   - Task 20 Step 5i: the child fence passed to `routeChildTerminal` on a resume is the branch Task 19 resolved.
>   - Self-Review Checklist: names the finished-child resume carriers.
>   - Review of the earlier pass's extra choices: no plan text changed (promotion re-label, call-time branch read and resume handling follow from the decisions; the 4096-byte reason cap is unrequested but changes nothing existing consumers rely on).
> - Rebased 2026-10-08, follow-ups (one line per change; the `handoff`-state resume decision):
>   - Header: the OPEN `handoff`-state resume line is replaced by a DECIDED 2026-10-08 (Holden) line (new branch for the same child session; the old outcome is delivered once and never merged).
>   - Task 3 Interfaces: the child-session partial unique index now excludes `handoff`, `outcome_acknowledged`, `retiring` and `retired` (was: only `retired`); lookup rule "the open branch, else the most recently reserved one".
>   - `BranchService.bound` doc comment: any closed state (`handoff`, `outcome_acknowledged`, `retiring`, `retired`) tells the caller to reserve a new branch.
>   - Task 10 Steps 4 and 4b: bind conflict and runner lookup use open branches.
>   - Task 11 Step 6b and Step 7: two new failing-first core tests (bind a new branch while the old one is in `handoff`, old outcome still retires only the old branch, a third open bind still `child_session_conflict`; the runner starts the newer branch and leaves the `handoff` branch alone).
>   - Task 19 Interfaces (Resume): reuse only an open branch; any closed state, `handoff` included, takes the new-branch path.
>   - Task 19 Step 3: two new failing-first adapter tests (resume during `handoff` gets a new branch and the old outcome is delivered exactly once, never merged; a second resume while the new branch runs reuses it).
>   - Task 19 Step 4 RED, Step 5h (adapter `settled()`, `release()`, `outcomeID` and `deliverBackground()` semantics) and Step 5i (1) updated.
>   - Task 20 Step 5i, Review Focus 8 and the Self-Review Checklist: "non-retired" becomes "open"; the `handoff` resume is named.
> - DECIDED 2026-10-08 (Holden) (terminal rejection code): new `BranchErrorCode` `branch_already_terminal` -- a `BranchService` mutation whose fences pass but whose branch is `completed`, `failed`, `outcome_acknowledged`, `retiring` or `retired` rejects with it and writes nothing; `invalid_branch_state` stays for every other state mismatch, `handoff` included (so `fail` answers `invalid_branch_state` for exactly `handoff`). Changed: `BranchErrorCode` (schema comment), `BranchService.fail`/`setDelivery` doc comments, consumer table "Later workflow consumer" row, Task 10 (Interfaces, Step 2 failing-first retired-branch test, Steps 3 and 5), Task 11 (Step 6b failing-first `handoff` fail test, Step 7 RED), Task 19 (Promotion rule; the retired-promotion test now expects `branch_already_terminal`). The runner acquisition refusal (Task 10 Step 4b) is not a branch mutation and keeps `invalid_branch_state`.
> - DECIDED 2026-10-08 (Holden) (pending-outcome lookup): new read-only plugin API `pendingOutcome({ branch, ownerExecution }): Promise<DelegationTerminal | null>` (`PendingOutcomeInput`; the branch ID is `branch.branchID`, because outcome reads take complete fences) backed by new `OutcomeService.pending`; it uses `resolveOutcome`'s owner rule and fence checks (`wrong_owner` before any outcome is read), returns the one pending outcome of an outermost branch in `handoff` and `null` in every other state, and writes nothing. No existing read finds an outcome by branch (`resolveOutcome` needs the `outcomeID`), so it is a new method, not an extension. Changed: Normative Contracts (`PendingOutcomeInput`, the plugin contract's schema import list that Task 2 types, `DelegationBranchApi.pendingOutcome`, `OutcomeService.pending`), consumer table "Plugin consumers" and "Later workflow consumer" rows, Task 14 (Files, Interfaces, Step 1 harness, new failing-first Step 3b, Step 4, new Step 5b, Step 8). The adapter reads no Fiber-bound execution (workflows calls it at plugin start, outside any session), so the harness calls it unwrapped.
> - DECIDED 2026-10-08 (Holden) (dead-worker takeover, option A): new plugin API `takeOverBranch({ branch, ownerExecution }): Promise<TakenOverBranch>` (`TakeOverBranchInput`) backed by new `BranchService.takeOver`: one immediate transaction re-fences a non-terminal branch of a provably gone owner Worker (Task 4 epoch superseded, or `heartbeatAt + 6000` passed) to the calling host Worker, in the same coordination domain only, bumps `branchFencingToken`, re-points the branch's pending outcome, and writes a `delegation_branch_takeover` audit row (unique per resulting token, so concurrent takeovers have one winner); refusals `owner_alive`, `wrong_domain` (new `BranchErrorCode`s) and `branch_already_terminal`, all writing nothing. The new owner then closes the branch through the ordinary fenced `failBranch`/`pendingOutcome`/`acknowledgeOutcome`; no API gains a dead-owner bypass. Reason (verified in this plan's text): a later process presenting a dead owner's recorded fences is refused -- `stale_worker` for a superseded epoch (Task 4 Step 3; Task 10 Step 1 "recycled Worker epoch"; Review Focus 2), `stale_execution` once the root execution is recovered (Task 5 Step 1), and `acknowledgeOutcome` pairs the injected live Worker with the dead owner's execution (Task 14 Interfaces) -- so workflows recovery could never close such a branch. Plan-author choice inside option A, flagged for review: the caller has no session at plugin start, so the takeover mints its own `kind: "takeover"` execution row (outside the active-session index) instead of recovering the root session's execution, and that execution can only close the branch (no reserve, bind, acknowledge, start, complete, `setDelivery`, `createOutcome` or `resolveOutcome`). Changed: Normative Contracts (`BranchErrorCode`, `TakeOverBranchInput`, `TakenOverBranch`, plugin import list, `DelegationBranchApi.takeOverBranch`, `BranchService.takeOver`), Review Focus 11-12, consumer table "Plugin consumers" and "Later workflow consumer" rows, Self-Review Checklist, Task 3 (audit table, execution `kind` and active-session index predicate), Task 5 Step 3 (lookups skip takeover rows), Task 14 (Files, Interfaces, Step 1b harness, failing-first Step 3c, Step 4 RED, Step 5c, Step 7, Step 8), Task 26 Step 6.
> - Takeover fixes 2026-10-08 (review of the takeover; plan-author choices inside option A, flagged for review): `takeOver` now checks, in order, Worker, branch exists, the coordination domain RECORDED on the branch by `reserve` (new nullable `delegation_branch.coordination_domain`; null or different is `wrong_domain`, never the owner's current registration, and it runs before the owner-row read so a missing owner row is still domain-checked), outermost `kind: "workflow"` branch whose `ownerComponent` is null (bound, not yet acknowledged) or the host-injected `component: "workflows"` (else `wrong_parent`, reusing `acknowledgeBranch`'s code instead of adding one; the component is not an authenticated plugin identity), fences (`stale_branch`), terminal, owner gone (no row, superseded epoch, or `heartbeat_at + 6000 < now`, in that order); the compare-and-set uses the row's current token; fence validation finds a takeover execution by `execution_id` and never compares its expiry (it takes no `now`; Task 5 Step 3), so the expiry test is a regression guard; a takeover execution is terminalized when its branch retires by any path (one shared retirement write, which Task 25's drain and abort also use) or a re-takeover replaces it, so test 6 now expects `stale_execution` from `pendingOutcome` after the acknowledgement retired the branch; `resolveOutcome`/`acknowledgeOutcome` are stated session-less (Step 5c); Task 3 now names the `delegation_worker_owner` columns; Step 3c grows from seven to seventeen tests; consumer row gains `takeOverBranch`; Task 10's closed-branch text no longer says recovery leaves a `handoff` record alone.

**Goal:** Implement the approved core-owned delegation authority protocol in the OpenCode fork while preserving hard permission floors, exclusive controller ownership, durable branch delivery, and authenticated owner-only outcome access.

**Architecture:** Shared wire schemas and fences live only in `packages/schema/src/delegation.ts`. Exported plugin contracts and hooks live only in `packages/plugin/src/delegation.ts`; core implements those contracts without creating a reverse dependency. Core persists Worker, execution, controller, participant, branch, permit, outcome, delivery, and maintenance state in SQLite and exposes remote operations through Effect HttpApi.

**Tech Stack:** TypeScript, Bun, Effect, Effect HttpApi, Drizzle SQLite, yargs, Bun test runner.

**Spec:** `/home/dev/opencode-guard/docs/superpowers/specs/2026-09-30-core-delegation-authority-design.md`

## Global Constraints

- Execute from an isolated worktree based on `2b7eb922fdc59f6560a490e266651c0e01444046` (`2b7eb922f`, branch `fork/snip-always-prefix`: `e36bbfbb` plus the 2026-10-02 shell.ts always-allow-prefix fix; the deployed binary is built from it). The executor creates that worktree from the base commit itself, never from the main checkout's working tree. The main checkout has unrelated uncommitted work that execution must not stage, stash, rewrite, or absorb: the `AgentNotFoundError` edits to four tracked files and six untracked effort-plan files (re-observed 2026-10-08; see the NOTED line above).
- Background subagents (`OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS`, `RuntimeFlags.experimentalBackgroundSubagents`) are enabled in production only in attended tmux TUIs. systemd Workers, the supervisor and `oc-task` run with the flag off: there every `background=true` task call is refused before any branch exists, promotion is unavailable (`ExperimentalHttpApi.sessionBackground` returns `false` with the flag off, `handlers/experimental.ts:159-162` at `2b7eb922f`), and every native branch is foreground. A test whose outcome depends on the flag sets it explicitly through `RuntimeFlags.layer({ experimentalBackgroundSubagents })`, the pattern of `packages/opencode/test/tool/task.test.ts:37-59` at `2b7eb922f`; none relies on the environment.
- Plan 1 changes only `/home/dev/projects/opencode`. Later guard, workflow, HUD, deployment, rollout, and canary consumers are outside this checkout.
- Every state-changing protocol write uses `db.transaction(effect, { behavior: "immediate" })`, validates all supplied fences inside that transaction, and relies on database uniqueness for cross-Worker exclusion.
- Every test body appears before its RED command. Production implementation follows the observed RED failure. Test code is concrete with no placeholders, ellipsis, "add tests", or "extend existing" patterns.
- A plugin package imports `@opencode-ai/schema/delegation`; schema imports neither plugin nor core; plugin never imports core.
- Remote routes use `HttpApiGroup`, `HttpApiEndpoint`, and `HttpApiBuilder` in the existing instance HttpApi tree.
- Raw question text, tool arguments, credentials, controller tokens, Basic Auth, and pre-sanitized errors never reach durable storage or logs.
- Root-level `bun test` is prohibited. Task 26 lists the only full-suite commands and the root frozen-install/build gate.
- Generated clients are changed only by `bun run generate`; their directories are `packages/client/src/generated` and `packages/client/src/generated-effect`.
- Migration generation is `bun run script/migration.ts --name delegation_protocol_v1`; verification is `bun run script/migration.ts --check`.

## Review Focus

1. A UTF-8 multibyte question crossing 4096 bytes produces fixed `payload_too_large` content without persisting its source.
2. Reuse of a `workerID` with an old `workerEpoch` fails controller renewal, execution mutation, branch mutation, and outcome acknowledgement.
3. A crash after root append but before delivery acknowledgement advances the existing idempotent input and does not append twice.
4. V2 prompt remains admission-only; a later handoff appears only as an ID-only `delegation.outcome.ready` event.
5. Query credentials, missing Basic Auth, cross-origin browser requests, and plaintext non-loopback transport all fail remote acquisition.
6. With `experimentalBackgroundSubagents` off, a `background=true` task call is refused before `currentExecution`/`reserveBranch` and leaves no branch row.
7. Promotion flips a branch's `delivery` foreground -> background exactly once, never back; a promoted call returns the background result, its outcome (including one already pending when promotion commits) is delivered only through background claim/append, and `routeChildTerminal` never foreground-delivers it.
8. A `task_id` resume of a running child (including `background.extend`) reuses the bound branch: same `branchID`, branch count unchanged, no reserve/bind/acknowledge. A `task_id` resume of a finished child whose branch is `retired` succeeds on a NEW branch reserved, bound to the same child session and acknowledged under fresh-spawn rules; the retired branch row is unchanged. The same holds when the finished child's branch is still in `handoff` (outcome not yet consumed): the resume gets a new branch, the `handoff` row is unchanged, its outcome is delivered exactly once and never merged into the new branch, and a second resume while the new branch is open reuses that branch.
9. The creating task part keeps `state.input.background`, `state.metadata.sessionId` and `state.metadata.background` exactly as today; the synthetic background result is not a `task` tool part carrying `state.input.background`.
10. `tool.authorize` input `branch` carries the record's `delivery` and `kind` (null for a root or unregistered caller, with no extra keys); `output.reason` reaches the model only with a `deny`, bounded at 4096 UTF-8 bytes, and the generic text is used otherwise.
11. Dead-worker takeover (decided 2026-10-08) grants no maintenance authority to a plugin: `takeOverBranch` succeeds only for a caller in the coordination domain recorded on the branch row when `reserve` created it -- never the owner Worker's current registration, and a missing owner Worker row does not skip this check (`wrong_domain` otherwise) -- only for an outermost (`parentBranchID === null`) `kind: "workflow"` branch whose `ownerComponent` is null (bound, not yet acknowledged) or the caller's component, `workflows`, so a native branch, a branch acknowledged by another component or a nested branch is `wrong_parent`; only for the branch's current fence pair or one a recorded takeover replaced (`stale_branch`; an unknown branch is `unregistered_branch`); only when the owner Worker is provably gone (no Worker row, Task 4 epoch superseded, or `heartbeatAt + 6000 < now`; a live owner, including the caller itself, is `owner_alive`), and only for a non-terminal branch (`branch_already_terminal`); every refusal writes nothing. The compare-and-set uses the row's current `branchFencingToken`, never the input's. Two concurrent takeovers of one branch have exactly one winner (the immediate transaction, the `branchFencingToken` compare-and-set and the `delegation_branch_takeover` unique index); the loser gets `owner_alive`. After a takeover the previous owner's fences are refused by every branch and outcome API (`stale_worker`, `stale_branch` or `wrong_owner`), and the new owner uses only the ordinary fenced `failBranch`, `pendingOutcome` and `acknowledgeOutcome`; no API gains a dead-owner bypass.
12. Takeover never applies to a root/primary session. A root session has no branch row (`branch: null`); takeover writes only the branch row, the branch's pending outcome owner, its own new `kind: "takeover"` execution row and the audit row, and never writes, recovers or terminalizes an existing session execution (any `kind` but `takeover`), controller lease or participant; the only execution rows it terminalizes are takeover rows (the one a re-takeover replaces; the taken branch's own once that branch retires). The takeover execution is invisible to session lookup and acquisition (Task 3 index predicate, Task 5 Step 3), cannot own a new branch (`wrong_parent`) or outcome (`wrong_owner`), cannot read an outcome payload (`resolveOutcome` -> `wrong_owner`), and a taken-over branch refuses `bind`, `acknowledge`, `start` (so the runner never runs its child again), `complete` and `setDelivery` with `invalid_branch_state`.

## Normative Contracts

Task 1 creates the following complete shared contract in `packages/schema/src/delegation.ts`. Schema values use Effect `Schema` declarations with these exact decoded TypeScript shapes.

Every remotely serialized value in this block is declared as an exported Effect `Schema` value and its decoded type is derived as `type X = typeof X.Type`: fences, protocol/component/state literals, participant records, all inputs, payloads, terminals/events, all tagged errors, `ControllerConflict`, controller results, maintenance identities/statuses/records/wrappers/outputs, and mutation outputs. A TypeScript-only alias is never described as a runtime wire schema. Only local service interfaces and the plugin-contract-only opaque `TuiControllerHandle` remain TypeScript interfaces/types. Task 1 tests compile and decode representative success and tagged-error schemas, including `ControllerConflict`.

The implementation uses the corresponding closed declarations `ParticipantStatus`, `ParticipantInput`, `RegisterParticipantInput`, every `*Input`, `DelegationOutcomePayload`, `DelegationSanitizeResult`, `DelegationTerminal`, `DelegationOutcomeReady`, `DelegationAdmissionError`, `DelegationExecutionError`, `DelegationControllerError`, `DelegationParticipantError`, `DelegationBranchError`, `DelegationOutcomeError`, `DelegationDeliveryError`, `ControllerObserverResult`, `CoreControllerAcquired`, `AttachedControllerAcquired`, `MaintenanceIdentity`, `MaintenanceStatus`, `ControllerLeaseStatus`, `BranchStatus`, `PendingOutcomeStatus`, and every maintenance wrapper/output as `Schema.Struct`/`Schema.Union`/`Schema.TaggedStruct` constants. Their only TypeScript declarations are the adjacent `typeof X.Type` aliases, including `MaintenanceCanaryInput`, `MaintenanceRevokeInput`, `MaintenanceDrainInput`, `MaintenanceAbortInput`, and `MaintenanceExportInput`.

```ts
export const DelegationProtocol = Schema.Literal("opencode.delegation/v1")
export type DelegationProtocol = typeof DelegationProtocol.Type
export const DELEGATION_PROTOCOL: DelegationProtocol = "opencode.delegation/v1"

export const Component = Schema.Literal("core", "guard", "workflows", "broker_hud")
export type Component = typeof Component.Type

export const WorkerFence = Schema.Struct({ workerID: Schema.String, workerEpoch: Schema.String })
export type WorkerFence = typeof WorkerFence.Type

export const ExecutionFence = Schema.Struct({
  workerID: Schema.String,
  workerEpoch: Schema.String,
  executionID: Schema.String,
  sessionID: Schema.String,
  rootSessionID: Schema.String,
  fencingToken: Schema.Number,
})
export type ExecutionFence = typeof ExecutionFence.Type

export const BranchFence = Schema.Struct({
  workerID: Schema.String,
  workerEpoch: Schema.String,
  executionID: Schema.String,
  sessionID: Schema.String,
  rootSessionID: Schema.String,
  fencingToken: Schema.Number,
  branchID: Schema.String,
  branchFencingToken: Schema.Number,
})
export type BranchFence = typeof BranchFence.Type

export const AuthorityFence = Schema.Struct({ workerID: Schema.String, workerEpoch: Schema.String, leaseID: Schema.String, authorityEpoch: Schema.Number })
export type AuthorityFence = typeof AuthorityFence.Type

export const ParticipantAvailability = Schema.Literal("available", "unavailable")
export type ParticipantAvailability = typeof ParticipantAvailability.Type

export const ParticipantStatus = Schema.Struct({
  coordinationDomain: Schema.String,
  component: Component,
  buildID: Schema.String,
  protocol: DelegationProtocol,
  capabilities: Schema.Array(Schema.String),
  availability: ParticipantAvailability,
  heartbeatAt: Schema.Number,
  worker: WorkerFence,
})
export type ParticipantStatus = typeof ParticipantStatus.Type

export const DelegationQuestionOption = Schema.Struct({ label: Schema.String, description: Schema.String })
export type DelegationQuestionOption = typeof DelegationQuestionOption.Type
export const DelegationQuestion = Schema.Struct({
  header: Schema.String,
  question: Schema.String,
  options: Schema.Array(DelegationQuestionOption),
  allowCustom: Schema.Boolean,
  customAnswer: Schema.optional(Schema.String),
})
export type DelegationQuestion = typeof DelegationQuestion.Type
export const DelegationOutcomePayload = Schema.Union(
  Schema.Struct({ type: Schema.Literal("question"), questions: Schema.Array(DelegationQuestion) }),
  Schema.Struct({ type: Schema.Literal("permission"), permission: Schema.String, pattern: Schema.String, description: Schema.String }),
  Schema.Struct({ type: Schema.Literal("internal_error"), message: Schema.Literal("Delegated interaction could not be transferred.") }),
)
export type DelegationOutcomePayload = typeof DelegationOutcomePayload.Type
export const DelegationSanitizeResult = Schema.Union(
  Schema.Struct({ status: Schema.Literal("sanitized"), payload: DelegationOutcomePayload }),
  Schema.Struct({ status: Schema.Literal("unredactable_secret"), code: Schema.Literal("unredactable_secret") }),
)
export type DelegationSanitizeResult = typeof DelegationSanitizeResult.Type
export const DelegationTerminal = Schema.Struct({
  outcomeID: Schema.String,
  branchID: Schema.String,
  kind: Schema.Literal("permission_handoff", "question_handoff", "internal_error", "protocol_failure"),
  errorCode: Schema.NullOr(Schema.String),
})
export type DelegationTerminal = typeof DelegationTerminal.Type
export const DelegationOutcomeReady = Schema.Struct({ type: Schema.Literal("delegation.outcome.ready"), outcomeID: Schema.String, branchID: Schema.String, ownerExecutionID: Schema.String })
export type DelegationOutcomeReady = typeof DelegationOutcomeReady.Type
export const DelegationAdmissionError = Schema.TaggedStruct("DelegationAdmissionError", { code: Schema.Literal("unregistered_branch"), sessionID: Schema.String })
export type DelegationAdmissionError = typeof DelegationAdmissionError.Type

export const ControllerObserverResult = Schema.Struct({
  state: Schema.Literal("observer"),
  reason: Schema.Literal("controller_conflict"),
  rootSessionID: Schema.String,
  expiresAt: Schema.Number,
})
export type ControllerObserverResult = typeof ControllerObserverResult.Type

export const CoreControllerAcquired = Schema.Struct({ state: Schema.Literal("acquired"), leaseID: Schema.String, controllerID: Schema.String, authorityEpoch: Schema.Number, expiresAt: Schema.Number })
export type CoreControllerAcquired = typeof CoreControllerAcquired.Type
export const CoreControllerAcquireResult = Schema.Union(CoreControllerAcquired, ControllerObserverResult)
export type CoreControllerAcquireResult = typeof CoreControllerAcquireResult.Type
export const AttachedControllerAcquired = Schema.Struct({ state: Schema.Literal("acquired"), leaseID: Schema.String, controllerID: Schema.String, authorityEpoch: Schema.Number, expiresAt: Schema.Number, token: Schema.String })
export type AttachedControllerAcquired = typeof AttachedControllerAcquired.Type
export const AttachedControllerAcquireResult = Schema.Union(AttachedControllerAcquired, ControllerObserverResult)
export type AttachedControllerAcquireResult = typeof AttachedControllerAcquireResult.Type

export const ExecutionErrorCode = Schema.Literal("execution_conflict", "execution_not_active", "wrong_session", "stale_execution", "stale_worker", "wrong_worker")
export type ExecutionErrorCode = typeof ExecutionErrorCode.Type
export const ControllerErrorCode = Schema.Literal("auth_required", "invalid_query_auth", "insecure_transport", "cross_origin", "invalid_controller_token", "stale_authority", "wrong_worker", "participant_unavailable", "protocol_mismatch", "build_mismatch", "acquisition_disabled", "local_build", "root_not_found", "root_not_parentless")
export type ControllerErrorCode = typeof ControllerErrorCode.Type
export const ParticipantErrorCode = Schema.Literal("stale_worker", "wrong_worker", "participant_not_found", "invalid_component", "protocol_mismatch")
export type ParticipantErrorCode = typeof ParticipantErrorCode.Type
// Decided 2026-10-08 (Holden). After the Worker, execution and branch fence checks pass, a BranchService mutation
// (bind, acknowledge, start, complete, fail, acknowledgeHandoff, setDelivery) whose branch is in a terminal state --
// completed, failed, outcome_acknowledged, retiring or retired -- rejects with branch_already_terminal and writes
// nothing. Any other state the operation does not accept, handoff included, rejects with invalid_branch_state.
// Decided 2026-10-08 (Holden), dead-worker takeover (Task 14): BranchService.takeOver rejects a caller outside the
// coordination domain recorded on the branch at reserve with wrong_domain, a nested or non-workflow branch or one
// acknowledged by another component with wrong_parent, and a branch whose owner Worker is still live with
// owner_alive; none writes.
export const BranchErrorCode = Schema.Literal("unregistered_branch", "branch_conflict", "stale_branch", "stale_execution", "stale_worker", "wrong_worker", "wrong_parent", "child_session_conflict", "invalid_branch_state", "branch_already_terminal", "protocol_mismatch", "participant_unavailable", "bound_exceeded", "owner_alive", "wrong_domain")
export type BranchErrorCode = typeof BranchErrorCode.Type
export const OutcomeErrorCode = Schema.Literal("wrong_owner", "stale_branch", "stale_execution", "stale_worker", "wrong_worker", "outcome_not_found", "sanitizer_unavailable", "sanitizer_failed", "sanitizer_rejected", "payload_too_large", "bound_exceeded")
export type OutcomeErrorCode = typeof OutcomeErrorCode.Type
export const DeliveryErrorCode = Schema.Literal("wrong_owner", "stale_branch", "stale_execution", "stale_worker", "wrong_worker", "outcome_not_found", "delivery_conflict", "invalid_outcome_state")
export type DeliveryErrorCode = typeof DeliveryErrorCode.Type
export const DelegationExecutionError = Schema.TaggedStruct("DelegationExecutionError", { code: ExecutionErrorCode })
export type DelegationExecutionError = typeof DelegationExecutionError.Type
export const DelegationControllerError = Schema.TaggedStruct("DelegationControllerError", { code: ControllerErrorCode })
export type DelegationControllerError = typeof DelegationControllerError.Type
export const ControllerConflict = Schema.TaggedStruct("ControllerConflict", {
  state: Schema.Literal("observer"),
  reason: Schema.Literal("controller_conflict"),
  rootSessionID: Schema.String,
  expiresAt: Schema.Number,
})
export type ControllerConflict = typeof ControllerConflict.Type
export const DelegationParticipantError = Schema.TaggedStruct("DelegationParticipantError", { code: ParticipantErrorCode })
export type DelegationParticipantError = typeof DelegationParticipantError.Type
export const DelegationBranchError = Schema.TaggedStruct("DelegationBranchError", { code: BranchErrorCode })
export type DelegationBranchError = typeof DelegationBranchError.Type
export const DelegationOutcomeError = Schema.TaggedStruct("DelegationOutcomeError", { code: OutcomeErrorCode })
export type DelegationOutcomeError = typeof DelegationOutcomeError.Type
export const DelegationDeliveryError = Schema.TaggedStruct("DelegationDeliveryError", { code: DeliveryErrorCode })
export type DelegationDeliveryError = typeof DelegationDeliveryError.Type

export const ParticipantInput = Schema.Struct({ coordinationDomain: Schema.String, component: Component, buildID: Schema.String, protocol: DelegationProtocol, capabilities: Schema.Array(Schema.String) })
export type ParticipantInput = typeof ParticipantInput.Type
export const RegisterParticipantInput = Schema.Struct({ ...ParticipantInput.fields, worker: WorkerFence, heartbeatAt: Schema.Number })
export type RegisterParticipantInput = typeof RegisterParticipantInput.Type
export const AcquireExecutionInput = Schema.Struct({ sessionID: Schema.String, rootSessionID: Schema.String, kind: Schema.Literal("root", "native_child", "workflow_child"), worker: WorkerFence, now: Schema.Number })
export type AcquireExecutionInput = typeof AcquireExecutionInput.Type
export const RecoverExecutionInput = Schema.Struct({ ...AcquireExecutionInput.fields, expiredExecutionID: Schema.String })
export type RecoverExecutionInput = typeof RecoverExecutionInput.Type
export const AcquireControllerInput = Schema.Struct({ rootSessionID: Schema.String, worker: WorkerFence, protocol: DelegationProtocol, buildID: Schema.String, now: Schema.Number })
export type AcquireControllerInput = typeof AcquireControllerInput.Type
export const AcquireEmbeddedControllerInput = Schema.Struct({ ...AcquireControllerInput.fields, controllerID: Schema.String })
export type AcquireEmbeddedControllerInput = typeof AcquireEmbeddedControllerInput.Type
export const AcquireAttachedControllerInput = AcquireControllerInput
export type AcquireAttachedControllerInput = typeof AcquireAttachedControllerInput.Type
export const ReserveBranchInput = Schema.Struct({ parentSessionID: Schema.String, rootSessionID: Schema.String, ownerExecution: ExecutionFence, parentBranchID: Schema.NullOr(Schema.String), kind: Schema.Literal("native", "workflow"), delivery: Schema.Literal("foreground", "background") })
export type ReserveBranchInput = typeof ReserveBranchInput.Type
export const ReservedBranch = Schema.Struct({ branch: BranchFence, state: Schema.Literal("reserved") })
export type ReservedBranch = typeof ReservedBranch.Type
export const RegisteredBranch = Schema.Struct({ branch: BranchFence, childSessionID: Schema.String, state: Schema.Literal("registered") })
export type RegisteredBranch = typeof RegisteredBranch.Type
export const AcknowledgedBranch = Schema.Struct({ branch: BranchFence, childSessionID: Schema.String, state: Schema.Literal("acknowledged") })
export type AcknowledgedBranch = typeof AcknowledgedBranch.Type
export const AcknowledgeBranchInput = Schema.Struct({ branch: BranchFence, ownerComponent: Schema.Literal("core", "workflows"), ownerBuildID: Schema.String, protocol: DelegationProtocol })
export type AcknowledgeBranchInput = typeof AcknowledgeBranchInput.Type
export const CreateOutcomeInput = Schema.Struct({ idempotencyKey: Schema.String, kind: Schema.Literal("permission_handoff", "question_handoff", "internal_error", "protocol_failure"), errorCode: Schema.NullOr(OutcomeErrorCode), origin: BranchFence, rootOwnerExecution: ExecutionFence, branchPath: Schema.Array(Schema.String), candidate: DelegationOutcomePayload, delivery: Schema.Literal("foreground", "background") })
export type CreateOutcomeInput = typeof CreateOutcomeInput.Type
export const ResolveOutcomeInput = Schema.Struct({ outcomeID: Schema.String, branch: BranchFence, ownerExecution: ExecutionFence })
export type ResolveOutcomeInput = typeof ResolveOutcomeInput.Type
export const AcknowledgeOutcomeInput = Schema.Struct({ ...ResolveOutcomeInput.fields, worker: WorkerFence })
export type AcknowledgeOutcomeInput = typeof AcknowledgeOutcomeInput.Type
/** `DelegationBranchApi.pendingOutcome` / `OutcomeService.pending` input (decided 2026-10-08): `ResolveOutcomeInput` without `outcomeID`; the looked-up branch is `branch.branchID`. */
export const PendingOutcomeInput = Schema.Struct({ branch: BranchFence, ownerExecution: ExecutionFence })
export type PendingOutcomeInput = typeof PendingOutcomeInput.Type
/** `DelegationBranchApi.takeOverBranch` / `BranchService.takeOver` input (decided 2026-10-08, dead-worker takeover): the branch fence and its owner execution fence as the caller recorded them -- the branch's current pair, or a pair a recorded takeover of this branch replaced (Task 14). */
export const TakeOverBranchInput = Schema.Struct({ branch: BranchFence, ownerExecution: ExecutionFence })
export type TakeOverBranchInput = typeof TakeOverBranchInput.Type
/** The branch re-fenced to the calling Worker: `branch.executionID`/`fencingToken` name `ownerExecution`, the new `kind: "takeover"` execution. */
export const TakenOverBranch = Schema.Struct({ branch: BranchFence, ownerExecution: ExecutionFence })
export type TakenOverBranch = typeof TakenOverBranch.Type
export const AuthorizationDecision = Schema.Literal("continue", "handoff", "deny")
export type AuthorizationDecision = typeof AuthorizationDecision.Type
export const PermissionOrigin = Schema.Literal("builtin_default", "user_config", "agent_config", "legacy_tools", "session", "delegation")
export type PermissionOrigin = typeof PermissionOrigin.Type
export const PermissionBaseline = Schema.Struct({ decision: Schema.Literal("allow", "ask", "deny"), immutableDeny: Schema.Boolean, matches: Schema.Array(Schema.Struct({ origin: PermissionOrigin, decision: Schema.Literal("allow", "ask", "deny") })) })
export type PermissionBaseline = typeof PermissionBaseline.Type
export const MaintenanceStatus = Schema.Struct({ buildID: Schema.String, protocol: DelegationProtocol, coordinationDomain: Schema.String, acquisitionDisabled: Schema.Boolean, canaryRootSessionID: Schema.NullOr(Schema.String), canaryExpiresAt: Schema.NullOr(Schema.Number), coordinationDomains: Schema.Array(Schema.String), participants: Schema.Array(ParticipantStatus), controllerCount: Schema.Number, branchCount: Schema.Number, pendingOutcomeCount: Schema.Number })
export type MaintenanceStatus = typeof MaintenanceStatus.Type
export const MaintenanceIdentity = Schema.Struct({ buildID: Schema.String, protocol: DelegationProtocol, coordinationDomain: Schema.String })
export type MaintenanceIdentity = typeof MaintenanceIdentity.Type
export const ControllerLeaseState = Schema.Literal("armed", "revoking", "revoked", "expired")
export type ControllerLeaseState = typeof ControllerLeaseState.Type
export const BranchStatusState = Schema.Literal("reserved", "registered", "acknowledged", "running", "completed", "handoff", "failed", "outcome_acknowledged", "retiring", "retired")
export type BranchStatusState = typeof BranchStatusState.Type
export const PendingOutcomeState = Schema.Literal("pending_delivery", "delivered", "acknowledged")
export type PendingOutcomeState = typeof PendingOutcomeState.Type
export const ControllerLeaseStatus = Schema.Struct({ leaseID: Schema.String, rootSessionID: Schema.String, controllerID: Schema.String, workerID: Schema.String, workerEpoch: Schema.String, authorityEpoch: Schema.Number, protocol: DelegationProtocol, buildID: Schema.String, issuedAt: Schema.Number, heartbeatAt: Schema.Number, expiresAt: Schema.Number, state: ControllerLeaseState })
export type ControllerLeaseStatus = typeof ControllerLeaseStatus.Type
export const BranchStatus = Schema.Struct({ branchID: Schema.String, childSessionID: Schema.NullOr(Schema.String), rootSessionID: Schema.String, ownerExecutionID: Schema.String, parentSessionID: Schema.String, parentBranchID: Schema.NullOr(Schema.String), kind: Schema.Literal("native", "workflow"), delivery: Schema.Literal("foreground", "background"), ownerComponent: Schema.NullOr(Component), ownerBuildID: Schema.NullOr(Schema.String), workerID: Schema.String, workerEpoch: Schema.String, branchFencingToken: Schema.Number, protocol: Schema.NullOr(DelegationProtocol), state: BranchStatusState })
export type BranchStatus = typeof BranchStatus.Type
export const PendingOutcomeStatus = Schema.Struct({ idempotencyKey: Schema.String, outcomeID: Schema.String, kind: Schema.Literal("permission_handoff", "question_handoff", "internal_error", "protocol_failure"), errorCode: Schema.NullOr(OutcomeErrorCode), originSessionID: Schema.String, originBranchID: Schema.String, rootOwnerExecutionID: Schema.String, branchPath: Schema.Array(Schema.String), delivery: Schema.Literal("foreground", "background"), deliveryClaimID: Schema.NullOr(Schema.String), rootSessionID: Schema.String, deliveryLeaseExpiresAt: Schema.NullOr(Schema.Number), createdAt: Schema.Number, state: PendingOutcomeState })
export type PendingOutcomeStatus = typeof PendingOutcomeStatus.Type
export const MaintenanceCanaryInput = Schema.Struct({ rootSessionID: Schema.String, expiresInMs: Schema.Number, now: Schema.Number })
export type MaintenanceCanaryInput = typeof MaintenanceCanaryInput.Type
export const MaintenanceRevokeInput = Schema.Struct({ leaseID: Schema.String, authorityEpoch: Schema.Number, now: Schema.Number })
export type MaintenanceRevokeInput = typeof MaintenanceRevokeInput.Type
export const MaintenanceDrainInput = Schema.Struct({ branchID: Schema.String, timeoutMs: Schema.Number })
export type MaintenanceDrainInput = typeof MaintenanceDrainInput.Type
export const MaintenanceAbortInput = Schema.Struct({ branchID: Schema.String })
export type MaintenanceAbortInput = typeof MaintenanceAbortInput.Type
export const MaintenanceExportInput = Schema.Struct({ output: Schema.String })
export type MaintenanceExportInput = typeof MaintenanceExportInput.Type
export const MaintenanceDisableOutput = Schema.Struct({ acquisitionDisabled: Schema.Literal(true) })
export type MaintenanceDisableOutput = typeof MaintenanceDisableOutput.Type
export const MaintenanceEnableOutput = Schema.Struct({ acquisitionDisabled: Schema.Literal(false), canaryRootSessionID: Schema.NullOr(Schema.String), canaryExpiresAt: Schema.NullOr(Schema.Number) })
export type MaintenanceEnableOutput = typeof MaintenanceEnableOutput.Type
export const MaintenanceCanaryOutput = Schema.Struct({ rootSessionID: Schema.String, expiresAt: Schema.Number })
export type MaintenanceCanaryOutput = typeof MaintenanceCanaryOutput.Type
export const MaintenanceRevokeOutput = Schema.Struct({ leaseID: Schema.String, authorityEpoch: Schema.Number, controllerState: Schema.Literal("revoked") })
export type MaintenanceRevokeOutput = typeof MaintenanceRevokeOutput.Type
export const MaintenanceDrainOutput = Schema.Struct({ branchID: Schema.String, branchState: Schema.Literal("retired"), timedOut: Schema.Literal(false) })
export type MaintenanceDrainOutput = typeof MaintenanceDrainOutput.Type
export const MaintenanceAbortOutput = Schema.Struct({ branchID: Schema.String, branchState: Schema.Literal("retired"), aborted: Schema.Literal(true) })
export type MaintenanceAbortOutput = typeof MaintenanceAbortOutput.Type
export const MaintenanceExportOutput = Schema.Struct({ output: Schema.String, exported: Schema.Number })
export type MaintenanceExportOutput = typeof MaintenanceExportOutput.Type
export const MaintenanceControllersOutput = Schema.Struct({ controllers: Schema.Array(ControllerLeaseStatus) })
export type MaintenanceControllersOutput = typeof MaintenanceControllersOutput.Type
export const MaintenanceBranchesOutput = Schema.Struct({ branches: Schema.Array(BranchStatus) })
export type MaintenanceBranchesOutput = typeof MaintenanceBranchesOutput.Type
export const MaintenanceParticipantsOutput = Schema.Struct({ participants: Schema.Array(ParticipantStatus) })
export type MaintenanceParticipantsOutput = typeof MaintenanceParticipantsOutput.Type
export const MaintenancePendingOutput = Schema.Struct({ pending: Schema.Array(PendingOutcomeStatus) })
export type MaintenancePendingOutput = typeof MaintenancePendingOutput.Type
```

Task 2 creates the following exported plugin-only API in `packages/plugin/src/delegation.ts`.

```ts
import type {
  AcknowledgeBranchInput,
  AcknowledgeOutcomeInput,
  AcknowledgedBranch,
  AcquireControllerInput,
  AuthorityFence,
  AuthorizationDecision,
  BranchFence,
  BranchStatus,
  Component,
  ControllerObserverResult,
  CreateOutcomeInput,
  DelegationOutcomePayload,
  DelegationSanitizeResult,
  DelegationTerminal,
  ExecutionFence,
  ParticipantStatus,
  PendingOutcomeInput,
  PermissionBaseline,
  RegisterParticipantInput,
  RegisteredBranch,
  ReserveBranchInput,
  ReservedBranch,
  ResolveOutcomeInput,
  TakeOverBranchInput,
  TakenOverBranch,
  WorkerFence,
} from "@opencode-ai/schema/delegation"

export declare const TuiControllerHandleBrand: unique symbol
export type TuiControllerHandle = string & { readonly [TuiControllerHandleBrand]: "TuiControllerHandle" }
export type TuiControllerAcquired = Readonly<{
  state: "acquired"
  handle: TuiControllerHandle
  leaseID: string
  authorityEpoch: number
  expiresAt: number
}>
export type TuiControllerAcquireResult = TuiControllerAcquired | ControllerObserverResult

export const DELEGATION_PLUGIN_API_VERSION = "opencode.delegation/plugin-v1" as const

export type PluginParticipantInput = Readonly<{
  component: Component
  buildID: string
  protocol: DelegationProtocol
  capabilities: readonly string[]
}>

export interface DelegationBranchApi {
  currentExecution(input: { sessionID: string }): Promise<ExecutionFence>
  registerParticipant(input: PluginParticipantInput): Promise<ParticipantStatus>
  heartbeatParticipant(input: PluginParticipantInput): Promise<void>
  markUnavailable(input: { component: Component }): Promise<void>
  withdrawParticipant(input: { component: Component }): Promise<void>
  participantStatus(input: { component: Component }): Promise<ParticipantStatus | null>
  listParticipants(): Promise<readonly ParticipantStatus[]>
  reserveBranch(input: ReserveBranchInput): Promise<ReservedBranch>
  bindBranch(input: { branch: BranchFence; childSessionID: string }): Promise<RegisteredBranch>
  acknowledgeBranch(input: AcknowledgeBranchInput): Promise<AcknowledgedBranch>
  completeBranch(input: { branch: BranchFence; resultID: string }): Promise<void>
  failBranch(input: { branch: BranchFence; errorCode: string }): Promise<void>
  createOutcome(input: CreateOutcomeInput): Promise<DelegationTerminal>
  resolveOutcome(input: ResolveOutcomeInput): Promise<DelegationOutcomePayload>
  acknowledgeOutcome(input: ResolveOutcomeInput): Promise<void>
  /** Read-only (decided 2026-10-08; Task 14). Looks up the pending outcome of `input.branch.branchID` under `resolveOutcome`'s owner rule and fence checks: an unknown branch, a branch whose `parentBranchID` is not null (not outermost), or an `ownerExecution` other than the branch's owner execution (the outcome's `rootOwnerExecution`) rejects with `wrong_owner` before any outcome is read, so an unauthorized caller cannot tell whether one exists. While the branch is in `handoff` it returns that branch's one pending outcome (Task 20 "One outcome") as `DelegationTerminal` with `branchID === input.branch.branchID`; in every other state it returns `null`. It writes nothing, emits no event and injects no Worker. */
  pendingOutcome(input: PendingOutcomeInput): Promise<DelegationTerminal | null>
  /** Dead-worker takeover (decided 2026-10-08; Task 14). Re-fences `input.branch.branchID` to the calling host Worker in one immediate transaction and returns the new fences; the host injects the caller's Worker, coordination domain and clock and reads no Fiber-bound execution. Refusals, all writing nothing: `unregistered_branch`; `wrong_domain` (caller outside the coordination domain recorded on the branch when it was reserved); `wrong_parent` (a nested branch, a branch whose `kind` is not `workflow`, or one whose `ownerComponent` is neither null nor the caller's component, `workflows`: a native branch is never plugin-takeable); `stale_branch` (the input is neither the branch's current fence pair nor one a recorded takeover replaced); `branch_already_terminal`; `owner_alive` (the branch's owner Worker is current and within `heartbeatAt + 6000`, the caller itself included). Afterwards the caller closes the branch with `failBranch`, `pendingOutcome` and `acknowledgeOutcome` under the returned fences; a taken-over branch accepts nothing else. */
  takeOverBranch(input: TakeOverBranchInput): Promise<TakenOverBranch>
}

export type ToolAuthorizeHook = (
  input: Readonly<{
    sessionID: string
    rootSessionID: string
    branchID: string | null
    tool: string
    callID: string
    arguments: unknown
    baseline: PermissionBaseline
    worker: WorkerFence
    execution: ExecutionFence
    /** The caller session's own branch, read from the core branch record at call time (a promoted branch reads "background"); null for a root or unregistered session, with no other fields. */
    branch: (BranchFence & { delivery: "foreground" | "background"; kind: BranchStatus["kind"] }) | null
    authority: AuthorityFence | null
  }>,
  /** `reason` is read only when the composed decision is "deny"; core shows it to the model (Task 16) and ignores it for "continue" and "handoff". */
  output: { decision: AuthorizationDecision; reason?: string },
) => Promise<void>

export type DelegationSanitizeHook = (input: Readonly<{
  branch: BranchFence
  payload: DelegationOutcomePayload
}>) => Promise<DelegationSanitizeResult>

export interface TuiDelegationApi {
  acquireController(input: Omit<AcquireControllerInput, "worker" | "now">): Promise<TuiControllerAcquireResult>
  renewController(input: Readonly<{ handle: TuiControllerHandle; leaseID: string; authorityEpoch: number }>): Promise<TuiControllerAcquireResult>
  releaseController(input: Readonly<{ handle: TuiControllerHandle; leaseID: string; authorityEpoch: number }>): Promise<void>
}
```

Core services use these exact interfaces. Each implementation is an Effect `Context.Service` whose `Service` shape matches the listed interface.

```ts
export interface WorkerOwnership {
  register(input: { worker: WorkerFence; buildID: string; protocol: DelegationProtocol; coordinationDomain: string; now: number }): Effect.Effect<void, DelegationExecutionError>
  heartbeat(input: { worker: WorkerFence; now: number }): Effect.Effect<void, DelegationExecutionError>
  assertCurrent(worker: WorkerFence): Effect.Effect<void, DelegationExecutionError>
}
export interface ParticipantRegistry {
  register(input: RegisterParticipantInput): Effect.Effect<ParticipantStatus, DelegationParticipantError>
  heartbeat(input: RegisterParticipantInput): Effect.Effect<void, DelegationParticipantError>
  markUnavailable(input: { worker: WorkerFence; component: Component }): Effect.Effect<void, DelegationParticipantError>
  withdraw(input: { worker: WorkerFence; component: Component }): Effect.Effect<void, DelegationParticipantError>
  status(input: { component: Component }): Effect.Effect<ParticipantStatus | null, DelegationParticipantError>
  list(): Effect.Effect<readonly ParticipantStatus[], DelegationParticipantError>
}
export interface ExecutionOwnership {
  acquire(input: AcquireExecutionInput): Effect.Effect<ExecutionFence, DelegationExecutionError>
  heartbeat(input: { execution: ExecutionFence; now: number }): Effect.Effect<ExecutionFence, DelegationExecutionError>
  assertCurrent(execution: ExecutionFence): Effect.Effect<void, DelegationExecutionError>
  recover(input: RecoverExecutionInput): Effect.Effect<ExecutionFence, DelegationExecutionError>
  current(input: { sessionID: string; worker: WorkerFence }): Effect.Effect<ExecutionFence, DelegationExecutionError>
}
export interface ControllerService {
  acquireEmbedded(input: AcquireEmbeddedControllerInput): Effect.Effect<CoreControllerAcquireResult, DelegationControllerError>
  acquireAttached(input: AcquireAttachedControllerInput): Effect.Effect<AttachedControllerAcquireResult, DelegationControllerError>
  renew(input: AuthorityFence & { controllerID: string; token?: string; now: number }): Effect.Effect<CoreControllerAcquired, DelegationControllerError>
  release(input: AuthorityFence & { controllerID: string; token?: string; now: number }): Effect.Effect<void, DelegationControllerError>
  revoke(input: { leaseID: string; authorityEpoch: number; now: number }): Effect.Effect<void, DelegationControllerError>
}
export interface BranchService {
  reserve(input: ReserveBranchInput): Effect.Effect<ReservedBranch, DelegationBranchError>
  bind(input: { branch: BranchFence; childSessionID: string }): Effect.Effect<RegisteredBranch, DelegationBranchError>
  acknowledge(input: AcknowledgeBranchInput): Effect.Effect<AcknowledgedBranch, DelegationBranchError>
  start(input: { branch: BranchFence }): Effect.Effect<void, DelegationBranchError>
  complete(input: { branch: BranchFence; resultID: string }): Effect.Effect<void, DelegationBranchError>
  /** Accepts `reserved`, `registered`, `acknowledged` and `running` (Task 10). A terminal branch (`completed`, `failed`, `outcome_acknowledged`, `retiring`, `retired`) rejects with `branch_already_terminal`; a branch in `handoff` rejects with `invalid_branch_state`. Neither rejection writes. */
  fail(input: { branch: BranchFence; errorCode: string }): Effect.Effect<void, DelegationBranchError>
  acknowledgeHandoff(input: { branch: BranchFence; outcomeID: string }): Effect.Effect<void, DelegationBranchError>
  /** Task 19. Read-only lookup of the branch bound to `childSessionID` (child-session uniqueness: the open branch, else the most recently reserved one, Task 3) for a `task_id` resume: `unregistered_branch` when none is bound, `wrong_parent` when its `parentSessionID` is not `callerSessionID`. A returned closed state (`handoff`, `outcome_acknowledged`, `retiring` or `retired`) means the child finished; the caller then reserves a new branch (Task 19) and never writes the closed one. */
  bound(input: { childSessionID: string; callerSessionID: string }): Effect.Effect<{ branch: BranchFence; delivery: "foreground" | "background"; kind: BranchStatus["kind"]; state: BranchStatusState }, DelegationBranchError>
  /** Task 19. One-way promotion: foreground -> background flips (and re-labels a pending outcome of that outermost branch); same-value calls are no-ops; a change on a terminal branch rejects with `branch_already_terminal`; background -> foreground, or a change on a branch in any other state it does not accept, rejects with `invalid_branch_state`; neither rejection writes. */
  setDelivery(input: { branch: BranchFence; delivery: "foreground" | "background" }): Effect.Effect<{ delivery: "foreground" | "background" }, DelegationBranchError>
  /** Task 14, dead-worker takeover (decided 2026-10-08). `worker`, `coordinationDomain`, `now` and `component` (the caller's owner component; the plugin host always injects `workflows`) are the host-injected caller values. Check order and writes are Task 14 Interfaces "Takeover". */
  takeOver(input: TakeOverBranchInput & { worker: WorkerFence; coordinationDomain: string; now: number; component: "workflows" }): Effect.Effect<TakenOverBranch, DelegationBranchError>
}
export interface PermitService {
  decide(input: { decisionKey: string; baseline: PermissionBaseline; decision: AuthorizationDecision; authority: AuthorityFence | null; execution: ExecutionFence; branch: BranchFence | null }): Effect.Effect<AuthorizationDecision, DelegationControllerError | DelegationExecutionError | DelegationBranchError>
}
export interface OutcomeService {
  create(input: CreateOutcomeInput): Effect.Effect<DelegationTerminal, DelegationOutcomeError>
  createFromOrigin(input: Omit<CreateOutcomeInput, "branchPath" | "rootOwnerExecution" | "delivery">): Effect.Effect<DelegationTerminal, DelegationOutcomeError>
  resolve(input: ResolveOutcomeInput): Effect.Effect<DelegationOutcomePayload, DelegationOutcomeError>
  acknowledge(input: AcknowledgeOutcomeInput): Effect.Effect<void, DelegationOutcomeError>
  /** Task 14. The read behind `DelegationBranchApi.pendingOutcome` (rules in that doc comment): one read transaction, no write, no event. */
  pending(input: PendingOutcomeInput): Effect.Effect<DelegationTerminal | null, DelegationOutcomeError>
}
export interface DelegationAdmission {
  permission(input: { sessionID: string; baseline: PermissionBaseline; execution: ExecutionFence; branch: BranchFence | null; authority: AuthorityFence | null; decisionKey: string; payload: DelegationOutcomePayload }): Effect.Effect<{ state: "allow" } | { state: "deny" } | DelegationTerminal, DelegationAdmissionError | DelegationOutcomeError>
  question(input: { sessionID: string; execution: ExecutionFence; branch: BranchFence | null; payload: DelegationOutcomePayload }): Effect.Effect<{ state: "primary_pending" } | DelegationTerminal, DelegationAdmissionError | DelegationOutcomeError>
}
export interface DelegationDelivery {
  foreground(input: ForegroundDeliveryInput): Effect.Effect<ForegroundDeliveryResult, DelegationDeliveryError>
  claimBackground(input: { worker: WorkerFence; now: number }): Effect.Effect<{ outcomeID: string; deliveryClaimID: string } | null, DelegationDeliveryError>
  appendClaim(input: { outcomeID: string; deliveryClaimID: string; ownerExecution: ExecutionFence }): Effect.Effect<void, DelegationDeliveryError>
  acknowledge(input: AcknowledgeOutcomeInput): Effect.Effect<void, DelegationDeliveryError>
  recover(input: { worker: WorkerFence; now: number }): Effect.Effect<number, DelegationDeliveryError>
}

export const ForegroundDeliveryInput = Schema.Struct({ outcomeID: Schema.String, branch: BranchFence, ownerExecution: ExecutionFence, worker: WorkerFence })
export type ForegroundDeliveryInput = typeof ForegroundDeliveryInput.Type
export const ForegroundDeliveryResult = Schema.Struct({ terminal: DelegationTerminal, payload: DelegationOutcomePayload })
export type ForegroundDeliveryResult = typeof ForegroundDeliveryResult.Type
/** Task 20 implements `DelegationCleanup` and `DelegationPropagation`; both are local services, not wire schemas. */
export interface DelegationCleanup { abortSessions(input: { sessionIDs: readonly string[] }): Effect.Effect<void> }
export type ChildTerminalRoute =
  | { action: "none" }
  | { action: "deliver"; result: ForegroundDeliveryResult }
  | { action: "surface"; terminal: DelegationTerminal }
export interface DelegationPropagation {
  routeChildTerminal(input: { childBranch: BranchFence; toolExecution: ExecutionFence; callerBranch: BranchFence | null; worker: WorkerFence }): Effect.Effect<ChildTerminalRoute, DelegationDeliveryError>
}
export interface MaintenanceService {
  identity(): Effect.Effect<MaintenanceIdentity>
  status(): Effect.Effect<MaintenanceStatus>
  disableAcquisition(): Effect.Effect<MaintenanceDisableOutput, DelegationControllerError>
  enableAcquisition(): Effect.Effect<MaintenanceEnableOutput, DelegationControllerError>
  allowCanaryRoot(input: MaintenanceCanaryInput): Effect.Effect<MaintenanceCanaryOutput, DelegationControllerError>
  controllers(): Effect.Effect<MaintenanceControllersOutput>
  revokeController(input: MaintenanceRevokeInput): Effect.Effect<MaintenanceRevokeOutput, DelegationControllerError>
  branches(): Effect.Effect<MaintenanceBranchesOutput>
  drainBranch(input: MaintenanceDrainInput): Effect.Effect<MaintenanceDrainOutput, DelegationBranchError>
  abortBranch(input: MaintenanceAbortInput): Effect.Effect<MaintenanceAbortOutput, DelegationBranchError>
  participants(): Effect.Effect<MaintenanceParticipantsOutput>
  pending(): Effect.Effect<MaintenancePendingOutput>
  exportAcknowledgedOutcomes(input: MaintenanceExportInput): Effect.Effect<MaintenanceExportOutput, DelegationOutcomeError>
}
```

Task 3 creates `packages/core/test/fixture/delegation.ts` with this exact base-only helper surface. A method either returns the documented state or rejects with one of the closed delegation errors; it never returns an untyped error object.

```ts
export interface DelegationFixtureBase {
  database(): Database.Service
  start(input: { filename: string; workers: number }): Promise<void>
  close(): Promise<void>
  seedRootSession(sessionID: string): Promise<void>
  seedChildSession(sessionID: string, rootSessionID: string): Promise<void>
  worker(workerID: string, workerEpoch: string, buildID?: string): WorkerFence
  participantInput(input: { worker: WorkerFence; component: Component; buildID: string; capabilities: readonly string[]; coordinationDomain?: string; heartbeatAt?: number }): RegisterParticipantInput
  dbRows(table: string): Promise<readonly Record<string, unknown>[]>
  logs(): Promise<readonly string[]>
  events(): Promise<readonly DelegationOutcomeReady[]>
  askedEvents(): Promise<readonly unknown[]>
  pending(): Promise<readonly { type: "permission" | "question"; sessionID: string }[]>
  cleanup(): Promise<void>
}

/** Cumulative ownership; each later task edits this same fixture file only for its row. */
export function createDelegationFixture(): DelegationFixtureBase
export function expectDelegationCode(error: unknown, code: string): void
```

`createDelegationFixture(): DelegationFixtureBase` is only Task 3's signature. Each owning task extends the exported cumulative fixture interface before its first test, and no test may use a method before the owning task adds it. `createDelegationFixture` owns temp resources and makes `close()` idempotent. Task 3 implements only database provisioning, start/close, parentless-root seeding, deterministic Worker and participant input factories, `dbRows`, and cleanup; it does not auto-register a Worker or participant. Each service task modifies `packages/core/test/fixture/delegation.ts` with only its owned capability and tests use that task's then-current `ReturnType<typeof createDelegationFixture>`. `seedRootSession` inserts a parentless session through the production session repository. `pending` returns the ordinary UI-pending permission and question requests held by the production permission and question services, one `{ type, sessionID }` entry per request; it never reads `delegation_outcome`, so a delegated handoff leaves it empty and a primary question adds one entry. Outcome rows awaiting delivery are maintenance data (`MaintenanceService.pending`, `PendingOutcomeStatus`), not this helper. `expectDelegationCode` asserts an object with the exact `_tag` for its service and the supplied `code`.

| Cumulative fixture method-name inventory | Owning task | Ownership |
|---|---:|---|
| `start`, `close`, `seedRootSession`, `seedChildSession`, `worker`, `participantInput`, `database`, `dbRows`, `logs`, `events`, `askedEvents`, `pending`, `cleanup` | 3 | Task 3 base only |
| `registerWorker`, `registerParticipant`, `participantStatus`, `listParticipants`, `markUnavailable`, `withdrawParticipant` | 4 | Task 4 participant |
| `acquireExecution`, `recoverExecution`, `currentExecution`, `assertExecutionCurrent` | 5 | Task 5 execution |
| `acquireAttachedController`, `acquireEmbeddedController`, `renewController`, `releaseController`, `disableAcquisition`, `enableAcquisition`, `allowCanaryRoot` | 9 | Task 9 controller (`logs` stays Task 3's; Task 9 only adds controller log entries to it) |
| `reserveBranch`, `bindBranch`, `acknowledgeBranch`, `startBranch`, `completeBranch`, `failBranch`, `branchState`, `acknowledgeHandoff`, `runSessionTurn`, `modelStreamsOpened` | 10 | Task 10 branch and runner branch start |
| `setSanitizer`, `createOutcome` | 11 | Task 11 outcome |
| `provideProductionServices` | 12 | Task 12 transport |
| `authorize`, `authorizeInput` | 16 | Task 16 authorization |
| `admitQuestion`, `admitPermission` | 17 | Task 17 admission |
| `foreground`, `rootDeliveries`, `outcomeState`, `claimBackground`, `appendClaim`, `recoverDelivery`, `acknowledgeOutcome`, `persistDeliveryIntent`, `resolveOutcome`, `setBranchDelivery` | 19 | Task 19 delivery/integration |
| `seedNestedChildSession`, `routeChildTerminal`, `abortedSessions` | 20 | Task 20 nested propagation |
| no new helper; reuses prior surface | 25 | Task 25 maintenance |

## Plan 1 Authoritative Consumer Interfaces and Commands

| Consumer | Import/command | Exact interface | Guarantees |
|---|---|---|---|
| Shared schema consumers | `@opencode-ai/schema/delegation` | `DelegationProtocol`, `Component`, `WorkerFence`, `ExecutionFence`, `BranchFence`, `AuthorityFence`, participant/input/payload/terminal/event schemas, `CoreControllerAcquired`, `CoreControllerAcquireResult`, `AttachedControllerAcquired`, `AttachedControllerAcquireResult`, `ControllerObserverResult`, all tagged errors including `ControllerConflict`, `MaintenanceIdentity`, `MaintenanceStatus`, controller/branch/pending status schemas, `MaintenanceCanaryInput`, `MaintenanceRevokeInput`, `MaintenanceDrainInput`, `MaintenanceAbortInput`, `MaintenanceExportInput`, and every maintenance wrapper/output schema | Every remotely serialized value is an Effect `Schema` with `typeof X.Type`; no TUI handle is a wire value |
| Plugin consumers | `@opencode-ai/plugin/delegation` | `DelegationBranchApi.currentExecution({ sessionID }): Promise<ExecutionFence>`; `registerParticipant(PluginParticipantInput): Promise<ParticipantStatus>`; `heartbeatParticipant(PluginParticipantInput): Promise<void>`; `markUnavailable({ component: Component }): Promise<void>`; `withdrawParticipant({ component: Component }): Promise<void>`; `participantStatus({ component: Component }): Promise<ParticipantStatus \| null>`; `listParticipants(): Promise<readonly ParticipantStatus[]>`; `reserveBranch(ReserveBranchInput): Promise<ReservedBranch>`; `bindBranch({ branch, childSessionID }): Promise<RegisteredBranch>`; `acknowledgeBranch(AcknowledgeBranchInput): Promise<AcknowledgedBranch>`; `completeBranch({ branch, resultID }): Promise<void>`; `failBranch({ branch, errorCode }): Promise<void>`; `createOutcome(CreateOutcomeInput): Promise<DelegationTerminal>`; `resolveOutcome(ResolveOutcomeInput): Promise<DelegationOutcomePayload>`; `acknowledgeOutcome(ResolveOutcomeInput): Promise<void>`; `pendingOutcome(PendingOutcomeInput): Promise<DelegationTerminal \| null>` (read-only); `takeOverBranch(TakeOverBranchInput): Promise<TakenOverBranch>` (dead-worker takeover, decided 2026-10-08); optional hook key `"tool.authorize"?: ToolAuthorizeHook` (input keys exactly `sessionID`, `rootSessionID`, `branchID`, `tool`, `callID`, `arguments`, `baseline`, `worker`, `execution`, `branch`, `authority`; `branch: (BranchFence & { delivery: "foreground" \| "background"; kind: BranchStatus["kind"] }) \| null` from the core branch record at call time; output `{ decision: AuthorizationDecision; reason?: string }`); optional hook key `"delegation.sanitize"?: DelegationSanitizeHook`; `TuiDelegationApi.acquireController(Omit<AcquireControllerInput, "worker" \| "now">): Promise<TuiControllerAcquireResult>`; `renewController({ handle, leaseID, authorityEpoch }): Promise<TuiControllerAcquireResult>`; `releaseController({ handle, leaseID, authorityEpoch }): Promise<void>`; `DELEGATION_PLUGIN_API_VERSION: "opencode.delegation/plugin-v1"` | Plugin host injects core-owned Worker fence, coordination domain, heartbeat time, and acknowledgement Worker; trusted API imports schema only and never imports core |
| Later guard consumer | `PluginInput.delegation` and `DelegationSanitizeHook` | participant lifecycle, sanitizer, and authorization hook contracts; `ToolAuthorizeHook` input `branch.delivery`/`branch.kind` and output `reason?: string` | Availability transitions fence leases; sanitizer failures become fixed safe terminals; raw content never persists or logs. `branch.delivery` is the record's current value, so a promoted branch reads `"background"`; a root or unregistered caller gets `branch: null` and `branchID: null`. On a composed `deny` the model sees the denying hook's `reason` verbatim when it is a non-empty string of at most 4096 UTF-8 bytes, otherwise the fixed `TOOL_AUTHORIZE_DENIED_TEXT`; `reason` is ignored with `continue`/`handoff` and is never written to delegation tables or logs |
| Later workflow consumer | `PluginInput.delegation` | execution lookup, branch lifecycle, `createOutcome`, `resolveOutcome`, `acknowledgeOutcome`, `pendingOutcome`, `takeOverBranch` | Complete fences are required. Only the outermost branch (`branchPath[0]`) with `rootOwnerExecution` may resolve or acknowledge; anything else is `wrong_owner`. `pendingOutcome({ branch, ownerExecution })` (read-only, decided 2026-10-08) applies the same owner rule and fence checks to the branch itself (an unknown or non-outermost branch, or another execution, is `wrong_owner` before any outcome is read), returns the branch's one pending outcome as `DelegationTerminal` while the branch is in `handoff` and `null` in every other state, and writes nothing; it is how a workflow consumer that got `invalid_branch_state` from `failBranch` finds the `outcomeID` to acknowledge. `acknowledgeBranch` with `ownerComponent: "workflows"` requires `parentBranchID === null` and a root owner execution, else `wrong_parent`. Native branches may nest under a workflow branch. Plugins have no start API: a workflow branch moves `acknowledged -> running` only when core's runner acquires the execution of its child session (Task 10), and prompting a child whose branch is in any state other than `acknowledged` or `running` fails with `invalid_branch_state` before any model stream. `failBranch` (like every branch mutation) on a branch in a terminal state (`completed`, `failed`, `outcome_acknowledged`, `retiring`, `retired`) rejects with `branch_already_terminal`; on a branch in `handoff` (a pending outcome exists) it rejects with `invalid_branch_state`; neither writes (decided 2026-10-08). Stale Worker mutation leaves state unchanged. A dead owner's recorded fences are refused for every mutation and for `pendingOutcome`/`acknowledgeOutcome` (`stale_worker`/`stale_execution`/`wrong_worker`), so a later process first calls `takeOverBranch({ branch, ownerExecution })` with them (decided 2026-10-08): the coordination domain recorded on the branch at reserve, an outermost `kind: "workflow"` branch not acknowledged by another component, the branch's current or a replaced fence pair, owner Worker without a row, superseded or past `heartbeatAt + 6000`, branch not terminal, else `wrong_domain`/`wrong_parent`/`stale_branch`/`owner_alive`/`branch_already_terminal` with no write (`unregistered_branch` for an unknown branch); on success it closes the branch with the returned fences through `failBranch`, `pendingOutcome` and `acknowledgeOutcome`, the only operations a taken-over branch accepts. Of two concurrent takeovers exactly one wins; the other gets `owner_alive`. |
| Later HUD consumer | `TuiPluginApi.delegation: TuiDelegationApi \| null` (the `api` argument of the TUI plugin entry) | `null` means GOD unavailable; otherwise `acquireController(input: Omit<AcquireControllerInput, "worker" \| "now">): Promise<TuiControllerAcquireResult>`; `renewController(input: { handle: TuiControllerHandle; leaseID: string; authorityEpoch: number }): Promise<TuiControllerAcquireResult>`; `releaseController(input: { handle: TuiControllerHandle; leaseID: string; authorityEpoch: number }): Promise<void>` | `TuiControllerHandle` is a branded opaque plugin-contract string; HUD never creates or sees Worker IDs, Worker epochs, controller IDs, or tokens |
| Embedded host | private Worker RPC | token-free acquire/renew/release messages | Host maps handle internally to `{ worker, controllerID }`; no attached credentials cross the boundary |
| Attach host | generated client plus host adapter | attached acquire, dedicated renew/release headers | Host maps handle internally to `{ controllerID, token }` plus server/Worker association; token remains host-only |
| Remote generated client | `@opencode-ai/client` and `@opencode-ai/client/effect` | Promise `OpenCode.make({ baseUrl: "https://server.test" })` methods return `AttachedControllerAcquireResult`/core acquired results and throw decoded declared `ControllerConflict` or owner errors; Effect `yield* OpenCode.make({ baseUrl: "https://server.test" })` uses `Effect.provideService(HttpClient.HttpClient, httpClient)` and fails with typed `ControllerConflict`/owner errors; renew/release/outcome use protocol, controller ID, and token headers | Promise declared errors are tested with `.rejects`; Effect declared errors are tested with `Effect.flip`; acquire has `controllerID` and token only, never handle; outcome is POST with complete fences in JSON |
| Legacy blocking prompt callers (plugins via v1 `createOpencodeClient`) | `POST /session/{sessionID}/message` | terminal: HTTP `409` body exactly `{ name: "DelegationTerminal", data: { outcomeID; branchID; kind; errorCode } }`, where `branchID` is the prompted child's own branch even when the origin is nested below it; SDK `reply.data === undefined`, `reply.error` deep-equals that body; other failures keep their base status/body | Only terminal signal for plugin callers; no assistant message or parts accompany it; fails closed for unaware callers |
| V2 and event consumers | session prompt API and `DelegationOutcomeReady` | exact `{ data: "Admitted" }`; later event contains only `type`, `outcomeID`, `branchID`, `ownerExecutionID`; `branchID` is the outermost branch (`branchPath[0]`) the owner resolves with | Admission is not completion; semantic payload is available only through authenticated owner lookup |
| Runtime core identity | `InstallationBuildID`, compile-time `OPENCODE_BUILD_ID`, `opencode --version` | immutable build identifier independent of `InstallationVersion` | Release build requires a supplied ID; local reports `local` and cannot acquire |
| Maintenance identity | `opencode debug delegation maintenance identity --database PATH --json` | `MaintenanceIdentity` | Read-only closed JSON; no credentials, tokens, hashes, payloads, or mutable operation |
| Maintenance status/lists | `status --database PATH --json`; `controllers --database PATH --json`; `branches --database PATH --json`; `participants --database PATH --json`; `pending --database PATH --json` | `MaintenanceStatus={ buildID; protocol; coordinationDomain; acquisitionDisabled; canaryRootSessionID: string \| null; canaryExpiresAt: number \| null; coordinationDomains: readonly string[]; participants: readonly ParticipantStatus[]; controllerCount; branchCount; pendingOutcomeCount }`; `MaintenanceControllersOutput={ controllers: readonly ControllerLeaseStatus[] }`; `MaintenanceBranchesOutput={ branches: readonly BranchStatus[] }`; `MaintenanceParticipantsOutput={ participants: readonly ParticipantStatus[] }`; `MaintenancePendingOutput={ pending: readonly PendingOutcomeStatus[] }` | Closed exact keys only; no token/hash/credentials/payload/raw candidate |
| Maintenance disable/enable | `disable-acquisition --database PATH --json`; `enable-acquisition --database PATH --json` | `MaintenanceDisableOutput={ acquisitionDisabled: true }`; `MaintenanceEnableOutput={ acquisitionDisabled: false; canaryRootSessionID: string \| null; canaryExpiresAt: number \| null }` | One immediate transaction; enable clears both canary fields and therefore returns null values |
| Maintenance status nullability | `@opencode-ai/schema/delegation` | `MaintenanceStatus.canaryRootSessionID: string or null`; `MaintenanceStatus.canaryExpiresAt: number or null`; `BranchStatus.parentSessionID: string`; `BranchStatus.protocol: DelegationProtocol or null`; `PendingOutcomeStatus.rootOwnerExecutionID: string` and no `ownerExecutionID` | These exact nullable and non-null fields govern maintenance serialization |
| Maintenance record fields | `@opencode-ai/schema/delegation` | `ControllerLeaseStatus={ leaseID; rootSessionID; controllerID; workerID; workerEpoch; authorityEpoch; protocol; buildID; issuedAt; heartbeatAt; expiresAt; state }`; `BranchStatus={ branchID; childSessionID: string \| null; rootSessionID; ownerExecutionID; parentSessionID; parentBranchID: string \| null; kind; delivery; ownerComponent: Component \| null; ownerBuildID: string \| null; workerID; workerEpoch; branchFencingToken; protocol: DelegationProtocol \| null; state }`; `PendingOutcomeStatus={ idempotencyKey; outcomeID; kind; errorCode: OutcomeErrorCode \| null; originSessionID; originBranchID; rootOwnerExecutionID; branchPath: readonly string[]; delivery; deliveryClaimID: string \| null; rootSessionID; deliveryLeaseExpiresAt: number \| null; createdAt; state }` | Exact safe fields; `BranchStatus.parentSessionID` is non-null and protocol is nullable before acknowledgement; no redundant pending owner execution field |
| Maintenance canary | `allow-canary-root --database PATH --root-session-id ID --expires-in-ms N --json` | `MaintenanceCanaryOutput={ rootSessionID: string; expiresAt: number }` | Only the exact unexpired root may acquire while disabled; all checks remain |
| Maintenance revoke | `revoke-controller --database PATH --lease-id ID --authority-epoch N --json` | `MaintenanceRevokeOutput={ leaseID: string; authorityEpoch: number; controllerState: "revoked" }` | Core revocation barrier; no controller token/hash or owner secret |
| Maintenance branch mutation | `drain-branch --database PATH --branch-id ID --timeout-ms N --json`; `abort-branch --database PATH --branch-id ID --json` | `MaintenanceDrainOutput={ branchID: string; branchState: "retired"; timedOut: false }`; `MaintenanceAbortOutput={ branchID: string; branchState: "retired"; aborted: true }` | Bounded drain/abort and safe terminal state; no semantic payload |
| Maintenance export | `export-acknowledged-outcomes --database PATH --output FILE --json` | `MaintenanceExportOutput={ output: string; exported: number }` | Sanitized acknowledged JSON Lines only; excludes raw candidates, credentials, secrets, and logs |

## Completed Self-Review Checklist

- [x] The approved spec was read against this plan. The plan's base is `2b7eb922fdc59f6560a490e266651c0e01444046` (`fork/snip-always-prefix`; decided 2026-10-08). The 2026-10-08 edit ran only read-only `git show`/`git diff --stat` against `/home/dev/projects/opencode` to verify the `2b7eb922f` citations; it does not claim the implementation checkout was revalidated.
- [x] The 2026-10-08 decisions are carried into tasks, not only the header notes: flag-gate order and flag-off test (Task 19), explicit flag setting in tests (Global Constraints, Task 19 adapter), one-way promotion with `BranchService.setDelivery` and its core, adapter and propagation tests (Tasks 19-20), resume reuse with `BranchService.bound` (Task 19), finished-child resume on a new branch with the open-branch child-session index and its core and adapter tests (Tasks 3, 10, 19, 20), the same for a child whose branch is still in `handoff` with its core and adapter tests (Tasks 3, 11, 19), the creating-part contract test (Task 19), and the `tool.authorize` `branch.delivery`/`branch.kind` input and `reason` output (Normative Contracts, Task 2, Consumer Interfaces, Task 16).
- [x] Tasks are independently reviewable and numbered with unique integers 1-26 in execution order so `plan-run` can split and key them; the former lettered subtasks were either merged (one commit) or renumbered (separate commits).
- [x] Shared schema ownership, plugin-only API ownership, dependency direction, runtime import tests, compile tests, exports, scripts, and workspace dependency are explicit.
- [x] Every implementation subtask contains literal test bodies before RED, a specific expected RED failure, concrete signatures or state algorithms, focused GREEN commands, and a commit command; Task 26 is the documented no-commit verification gate.
- [x] The fixture path is `packages/core/test/fixture/delegation.ts`; local helpers have complete bodies, and the remaining test adapters are named production adapters rather than declaration-only/global harnesses.
- [x] Self-review records the actual plan corrections: Promise uses `OpenCode.make`, Effect uses `yield* OpenCode.make`, Promise declared errors throw, Effect declared errors fail with typed values, the HTTP helper now preserves the query, plugin `tsconfig` includes `src`, the root lockfile is `bun.lock`, and `build.ts` receives an explicit binary assertion.
- [x] Active execution uniqueness, two disk layers, unbounded concurrent acquisition, participant fencing, attached-token containment, token-free observer/HUD/embedded RPC, branch retirement, nested terminal propagation (one outcome per chain, per-level `branchID`, outermost-only owner, 16-branch bound, workflows outermost-only), runner-owned branch start, stale Worker acknowledgement, safe sanitizer-failure terminals, authenticated owner lookup, generated clients, runtime identity, and maintenance canary semantics are covered.
- [x] The final suite commands are unchanged, package-scoped, and exact; no root-level test command is present. Bun `--only-failures` only suppresses passing-test output, while each listed `bun run test` still executes its complete package suite.
- [x] Self-review checked deferred-work markers, incomplete-test phrases, global harnesses, sanitizer-rejection expectations, attached-token mismatches, duplicate step numbers, and stale wire names. JavaScript/TypeScript object spread syntax such as `...value` is valid.
- [x] Only `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md` was edited. No implementation file was edited, no test was run, and no commit was created.
- [x] Review Focus has twelve cases (1-5 original, 6-12 from the 2026-10-08 decisions; 11-12 are the dead-worker takeover's security cases) and Task 26 Step 6 reviews all twelve.
- [x] The dead-worker takeover (decided 2026-10-08) is carried by Normative Contracts, the consumer table, Task 3 (audit table, takeover execution kind, index predicate, `delegation_worker_owner` columns, `delegation_branch.coordination_domain`), Task 5 Step 3 (lookups skip takeover rows; fence validation by `execution_id` ignores a takeover row's expiry) and Task 14 (Interfaces, Step 1b harness, seventeen failing-first Step 3c tests, Step 5c); its `kind: "takeover"` execution is a plan-author choice flagged in the header line, not a Holden decision.
- [x] This documentation edit makes no claim that Git, builds, migrations, generated checks, or tests ran; those are execution-time checklist actions.

## Tasks

Tasks run strictly in document order, one after another. Each `### Task N` heading is a `plan-run` task boundary: everything from that heading to the next one is that task's whole prompt, together with the plan header above this section. Task numbers are unique integers 1-26 in document order and have no letter suffixes. No non-task content may follow the last task; plan-wide material belongs above this section.

### Task 1: Shared schema contracts

**Files:**
- Create: `packages/schema/src/delegation.ts`
- Create: `packages/schema/test/delegation-public-subpath.test.ts`
- Modify: `packages/schema/package.json`

**Interfaces:**
- Produces every schema type in Normative Contracts through `@opencode-ai/schema/delegation`.

- [ ] **Step 1: Create the schema runtime import test.**

```ts
import { expect, test } from "bun:test"
import { Schema } from "effect"
import { ControllerConflict, CoreControllerAcquired, DELEGATION_PROTOCOL, DelegationProtocol } from "@opencode-ai/schema/delegation"

test("publishes the delegation protocol runtime schema", () => {
  expect(Schema.decodeUnknownSync(DelegationProtocol)("opencode.delegation/v1")).toBe(DELEGATION_PROTOCOL)
  expect(() => Schema.decodeUnknownSync(DelegationProtocol)("opencode.delegation/v2")).toThrow()
})

test("compiles and decodes representative success and tagged-error schemas", () => {
  const acquired = Schema.decodeUnknownSync(CoreControllerAcquired)({ state: "acquired", leaseID: "lease_a", controllerID: "controller_a", authorityEpoch: 1, expiresAt: 7000 })
  expect(acquired.controllerID).toBe("controller_a")
  const conflict = Schema.decodeUnknownSync(ControllerConflict)({ _tag: "ControllerConflict", state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 })
  expect(conflict._tag).toBe("ControllerConflict")
})
```

- [ ] **Step 2: Run RED.** From `packages/schema`, run `bun test test/delegation-public-subpath.test.ts`; expect failure because the schema subpath is absent.
- [ ] **Step 3a (2–5 min): Implement protocol and component literals.** Add the delegation protocol and component literals as Effect `Schema` values with decoded types.
- [ ] **Step 3b (2–5 min): Implement fence schemas.** Add the Worker, execution, branch, and authority fence schemas with decoded types.
- [ ] **Step 3c (2–5 min): Implement base identity and participant schemas.** Add the base identity and participant schemas as closed Effect schemas with decoded types.
- [ ] **Step 3d (2–5 min): Implement participant, execution, and controller input/result schemas.** Add the participant, execution, and controller inputs and their result shapes as closed Effect schemas with decoded types.
- [ ] **Step 3e (2–5 min): Implement branch and outcome lifecycle schemas.** Add branch and outcome lifecycle shapes as closed Effect schemas with decoded types.
- [ ] **Step 3f (2–5 min): Implement outcome payload, sanitizer, terminal, event schemas.** Add admission payloads, terminal/event values as closed Effect schemas with decoded types.
- [ ] **Step 3g (2–5 min): Implement admission and tagged error schemas.** Add all tagged errors as closed Effect schemas with decoded types.
- [ ] **Step 3h (2–5 min): Implement maintenance record and status schemas.** Add maintenance identities, statuses, and records as closed Effect schemas with decoded types.
- [ ] **Step 3i (2–5 min): Implement maintenance input, wrapper, and output schemas.** Add every named maintenance input, wrapper, and output as a closed Effect schema with a `typeof X.Type` alias.
- [ ] **Step 3j (2–5 min): Add the package subpath export.** Export the completed delegation schema module through `@opencode-ai/schema/delegation`.
- [ ] **Step 4: Run GREEN.** From `packages/schema`, run `bun test test/delegation-public-subpath.test.ts && bun run typecheck`.
- [ ] **Step 5: Commit only schema files.**

```bash
git add packages/schema/src/delegation.ts packages/schema/test/delegation-public-subpath.test.ts packages/schema/package.json
git commit -m "feat(schema): publish delegation schemas"
```

### Task 2: Plugin package contracts and exports

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.
> Answer to the Task 2 question (2026-10-08): Task 1 is on this branch as commit `a4c00e20f` (`packages/schema/src/delegation.ts`); it had been committed in a stray worktree and was fast-forwarded here. Proceed.

**Files:**
- Create: `packages/plugin/src/delegation.ts`
- Create: `packages/plugin/src/delegation.type-test.ts`
- Create: `packages/plugin/test/delegation-public-subpath.test.ts`
- Create: `packages/plugin/test/delegation-types.test.ts`
- Modify: `packages/plugin/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Create the plugin runtime subpath test.**

```ts
import { expect, test } from "bun:test"
import { DELEGATION_PLUGIN_API_VERSION } from "@opencode-ai/plugin/delegation"

test("publishes the plugin delegation runtime subpath", () => {
  expect(DELEGATION_PLUGIN_API_VERSION).toBe("opencode.delegation/plugin-v1")
})
```

```ts
import type {
  AttachedControllerAcquireResult,
  TuiControllerAcquireResult,
  DelegationBranchApi,
  DelegationSanitizeHook,
  ToolAuthorizeHook,
  TuiDelegationApi,
} from "@opencode-ai/plugin/delegation"
import type { BranchFence, BranchStatus } from "@opencode-ai/schema/delegation"

type Assert<T extends true> = T
type CurrentExecutionExact = Assert<
  DelegationBranchApi["currentExecution"] extends (input: { sessionID: string }) => Promise<import("@opencode-ai/schema/delegation").ExecutionFence>
    ? true
    : false
>
type ParticipantInputIsHostFenced = Assert<
  Extract<"worker" | "heartbeatAt" | "coordinationDomain", keyof Parameters<DelegationBranchApi["registerParticipant"]>[0]> extends never ? true : false
>
type OutcomeAckIsHostFenced = Assert<
  "worker" extends keyof Parameters<DelegationBranchApi["acknowledgeOutcome"]>[0] ? false : true
>
type ToolHookReturnsVoid = Assert<ReturnType<ToolAuthorizeHook> extends Promise<void> ? true : false>
type AuthorizeInput = Parameters<ToolAuthorizeHook>[0]
type AuthorizeOutput = Parameters<ToolAuthorizeHook>[1]
type AuthorizeBranch = Exclude<AuthorizeInput["branch"], null>
type AuthorizeBranchIsNullable = Assert<null extends AuthorizeInput["branch"] ? true : false>
type AuthorizeBranchIsFence = Assert<AuthorizeBranch extends BranchFence ? true : false>
type AuthorizeBranchDeliveryExact = Assert<
  [AuthorizeBranch["delivery"]] extends ["foreground" | "background"] ? (["foreground" | "background"] extends [AuthorizeBranch["delivery"]] ? true : false) : false
>
type AuthorizeBranchKindExact = Assert<
  [AuthorizeBranch["kind"]] extends [BranchStatus["kind"]] ? ([BranchStatus["kind"]] extends [AuthorizeBranch["kind"]] ? true : false) : false
>
type AuthorizeBranchKeysExact = Assert<
  [keyof AuthorizeBranch] extends [keyof BranchFence | "delivery" | "kind"] ? ([keyof BranchFence | "delivery" | "kind"] extends [keyof AuthorizeBranch] ? true : false) : false
>
type AuthorizeReasonIsOptional = Assert<{ decision: "deny" } extends AuthorizeOutput ? true : false>
type AuthorizeReasonIsString = Assert<Required<AuthorizeOutput>["reason"] extends string ? true : false>
type SanitizerIsDiscriminated = Assert<
  Awaited<ReturnType<DelegationSanitizeHook>>["status"] extends "sanitized" | "unredactable_secret" ? true : false
>
type AcquireIsClosed = Assert<
  Awaited<ReturnType<TuiDelegationApi["acquireController"]>>["state"] extends "acquired" | "observer" ? true : false
>
type HudAcquireIsTokenFree = Assert<"token" extends keyof Extract<TuiControllerAcquireResult, { state: "acquired" }> ? false : true>
type HudAcquireIsControllerFree = Assert<"controllerID" extends keyof Extract<TuiControllerAcquireResult, { state: "acquired" }> ? false : true>
type HudRenewIsOpaque = Assert<"handle" extends keyof Parameters<TuiDelegationApi["renewController"]>[0] ? true : false>
type AttachedAcquireHasToken = Assert<"token" extends keyof Extract<AttachedControllerAcquireResult, { state: "acquired" }> ? true : false>
type ObserverIsShared = Assert<
  Extract<TuiControllerAcquireResult, { state: "observer" }> extends Extract<AttachedControllerAcquireResult, { state: "observer" }>
    ? Extract<AttachedControllerAcquireResult, { state: "observer" }> extends Extract<TuiControllerAcquireResult, { state: "observer" }>
      ? true
      : false
    : false
>

export type DelegationTypeTest = [CurrentExecutionExact, ToolHookReturnsVoid, AuthorizeBranchIsNullable, AuthorizeBranchIsFence, AuthorizeBranchDeliveryExact, AuthorizeBranchKindExact, AuthorizeBranchKeysExact, AuthorizeReasonIsOptional, AuthorizeReasonIsString, SanitizerIsDiscriminated, AcquireIsClosed, HudAcquireIsTokenFree, HudAcquireIsControllerFree, HudRenewIsOpaque, AttachedAcquireHasToken, ObserverIsShared]
```

- [ ] **Step 2: Put compile-only assertions under the package `src` include.** Create `packages/plugin/src/delegation.type-test.ts` with the type aliases above and no runtime tuple, conditional assertion, or Bun test. Keep runtime tests in `packages/plugin/test`.

- [ ] **Step 3: Run RED.** From `packages/plugin`, run `bun run test`; expect failure because the delegation subpath and test script are absent.
- [ ] **Step 4: Implement plugin declarations and package exports.** Use only schema imports, add the exact exports, scripts, and workspace dependency listed in Interfaces.
- [ ] **Step 5: Run root dependency installation and inspect the lockfile.** From the repository root run `bun install`, inspect `bun.lock`, and retain only the expected workspace dependency and export changes.
- [ ] **Step 6: Run GREEN.** From `packages/plugin`, run `bun run test && bun run typecheck && bun run build`.
- [ ] **Step 7: Commit only plugin files and the root lockfile.**

```bash
git add packages/plugin/src/delegation.ts packages/plugin/src/delegation.type-test.ts packages/plugin/test/delegation-public-subpath.test.ts packages/plugin/test/delegation-types.test.ts packages/plugin/package.json bun.lock
git commit -m "feat(plugin): publish delegation contracts"
```

### Task 3: Core database migration and base fixture

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-fixture.test.ts`
- Create: `packages/core/src/delegation/sql.ts`
- Modify: `packages/core/src/session/sql.ts`
- Modify generated: `packages/core/schema.json`
- Modify generated: `packages/core/src/database/schema.gen.ts`
- Modify generated: `packages/core/src/database/migration.gen.ts`
- Create generated migration under: `packages/core/src/database/migration/`

**Interfaces:**
- Produces only the base fixture lifecycle, factories, database provisioning, `dbRows`, cleanup, `createDelegationFixture`, and `expectDelegationCode` declarations above; `acquireExecutionRow` is not part of Task 3.
- Produces tables `delegation_controller_lease`, `delegation_worker_owner`, `delegation_execution_owner`, `delegation_branch`, `delegation_outcome`, `delegation_participant`, `delegation_permit`, `delegation_control`, and `delegation_branch_takeover`.
- Dead-worker takeover (decided 2026-10-08; written only by Task 14). `delegation_branch_takeover` is the audit table: `takeover_id` (text primary key), `branch_id`, `from_worker_id`, `from_worker_epoch`, `from_execution_id`, `from_fencing_token`, `from_branch_fencing_token`, `to_worker_id`, `to_worker_epoch`, `to_execution_id`, `to_fencing_token`, `to_branch_fencing_token`, `coordination_domain`, `taken_at` (all not null), with `uniqueIndex("delegation_branch_takeover_token_idx").on(table.branch_id, table.to_branch_fencing_token)`, so one resulting token has exactly one takeover row. `delegation_execution_owner.kind` holds `root`, `native_child`, `workflow_child` or `takeover`; a `takeover` row is never produced by `AcquireExecutionInput` (whose `kind` literal is unchanged) and is excluded from the active-session index below.
- Columns the takeover reads (2026-10-08 takeover fixes; these are the names Tasks 4, 10 and 14 use). `delegation_worker_owner` holds one row per Worker: `worker_id` (text primary key), `worker_epoch` (the Worker's current epoch; Task 4 `register` with a new epoch overwrites it, "one current epoch per Worker"), `build_id`, `protocol`, `coordination_domain` (the domain of the latest registration) and `heartbeat_at` (Task 4's `heartbeatAt`; `heartbeat_at + 6000` is the expiry boundary), all not null. `delegation_branch` gains `coordination_domain` (text, nullable): written once by `reserve` from the reserving Worker's `delegation_worker_owner.coordination_domain` (null when that Worker has no row) and never updated afterwards, a takeover included (the taker must already be in that domain). Task 14 Step 5c adds the `reserve` write; until then the column is null.
- Produces partial unique index on `delegation_execution_owner(session_id)` for `state IN ('acquired','running','draining')`, active-controller partial unique index by root, outcome idempotency uniqueness, child-session uniqueness, and `session_input_idempotency_key_idx`.
- Child-session uniqueness (decided 2026-10-08, finished-child resume and `handoff`-state resume) is a partial unique index over OPEN branches: `uniqueIndex("delegation_branch_open_child_session_idx").on(table.child_session_id).where(sql\`${table.state} NOT IN ('handoff', 'outcome_acknowledged', 'retiring', 'retired')\`)`. A branch is closed once it is in one of those four states; no transition leaves them for an open state (`handoff -> outcome_acknowledged -> retiring -> retired`, Task 10), so no update can re-enter a row into the index and collide. `completed` and `failed` stay inside the index: they exist only inside the retiring transaction (Task 10). At most one open branch is bound to a child session; closed branches of the same child (a `handoff` branch whose outcome is still pending included) may coexist with it. Every lookup this plan describes as "through child-session uniqueness" (Task 10 runner branch start, Task 16 `AuthorizationInput.build`, Task 19 `BranchService.bound`, Task 20 admission fence) returns the open branch bound to the session when one exists, else the most recently reserved branch bound to it (greatest `rowid`), else none.

The two active-owner constraints use these exact Drizzle definitions:

```ts
uniqueIndex("delegation_execution_active_session_idx")
  .on(table.session_id)
  .where(sql`${table.state} IN ('acquired', 'running', 'draining') AND ${table.kind} <> 'takeover'`)

uniqueIndex("delegation_controller_active_root_idx")
  .on(table.root_session_id)
  .where(sql`${table.state} IN ('armed', 'revoking')`)
```

- [ ] **Step 1: Create the complete concurrent-index test.**

```ts
import { expect, test } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { Effect, Layer } from "effect"
import { tmpdir } from "./fixture/tmpdir"
import { sql } from "drizzle-orm"

type ExecutionInsert = Readonly<{ executionID: string; sessionID: string; rootSessionID: string; kind: "root" | "native_child" | "workflow_child"; worker: { workerID: string; workerEpoch: string }; now: number }>
async function insertExecutionRowDirectly(layer: Layer.Layer<Database.Service>, input: ExecutionInsert) {
  return Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Database
    yield* database.run(sql`INSERT INTO delegation_execution_owner (execution_id, session_id, root_session_id, kind, worker_id, worker_epoch, fencing_token, state, expires_at) VALUES (${input.executionID}, ${input.sessionID}, ${input.rootSessionID}, ${input.kind}, ${input.worker.workerID}, ${input.worker.workerEpoch}, 1, 'acquired', ${input.now + 6000})`)
    return input
  }).pipe(Effect.provide(layer)))
}

test("permits exactly one active execution owner per session", async () => {
   await using dir = await tmpdir()
  const filename = `${dir.path}/delegation.sqlite`
  const firstLayer = Database.layerFromPath(filename)
  const secondLayer = Database.layerFromPath(filename)
  const executionInput = {
    executionID: "exec_a",
    sessionID: "ses_shared",
    rootSessionID: "ses_shared",
    kind: "root" as const,
    worker: { workerID: "worker_a", workerEpoch: "epoch_a" },
    now: 1000,
  }
  const first = insertExecutionRowDirectly(firstLayer, executionInput)
  const second = insertExecutionRowDirectly(secondLayer, Object.assign({}, executionInput, { executionID: "exec_b", worker: { workerID: "worker_b", workerEpoch: "epoch_b" } }))
  const results = await Promise.allSettled([first, second])
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  expect(failures).toHaveLength(1)
  expect(String(failures[0]?.reason)).toContain("delegation_execution_active_session_idx")
})

type ControllerInsert = Readonly<{ leaseID: string; rootSessionID: string; controllerID: string; workerID: string; workerEpoch: string; now: number }>
async function insertControllerRowDirectly(layer: Layer.Layer<Database.Service>, input: ControllerInsert) {
  return Effect.runPromise(Effect.gen(function* () {
    const database = yield* Database.Database
    yield* database.run(sql`INSERT INTO delegation_controller_lease (lease_id, root_session_id, controller_id, worker_id, worker_epoch, authority_epoch, protocol, build_id, issued_at, heartbeat_at, expires_at, state) VALUES (${input.leaseID}, ${input.rootSessionID}, ${input.controllerID}, ${input.workerID}, ${input.workerEpoch}, 1, 'opencode.delegation/v1', 'core_build', ${input.now}, ${input.now}, ${input.now + 6000}, 'armed')`)
    return input
  }).pipe(Effect.provide(layer)))
}

test("permits exactly one active controller per root", async () => {
  await using dir = await tmpdir()
  const filename = `${dir.path}/delegation-controller.sqlite`
  const firstLayer = Database.layerFromPath(filename)
  const secondLayer = Database.layerFromPath(filename)
  const controllerInput = {
    leaseID: "lease_a",
    rootSessionID: "root_shared",
    controllerID: "controller_a",
    workerID: "worker_a",
    workerEpoch: "epoch_a",
    now: 1000,
  }
  const first = insertControllerRowDirectly(firstLayer, controllerInput)
  const second = insertControllerRowDirectly(secondLayer, Object.assign({}, controllerInput, { leaseID: "lease_b", controllerID: "controller_b", workerID: "worker_b", workerEpoch: "epoch_b" }))
  const results = await Promise.allSettled([first, second])
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  expect(failures).toHaveLength(1)
  expect(String(failures[0]?.reason)).toContain("delegation_controller_active_root_idx")
})
```

These migration tests prove only the database constraints. Mapping the rejected operations to closed error codes is handled by respective service tasks.

- [ ] **Step 2: Create fixture lifecycle and schema tests.**

```ts
import { afterEach, expect, test } from "bun:test"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture> | undefined
afterEach(async () => fixture?.close())

test("opens and closes one named disk database", async () => {
  fixture = createDelegationFixture()
  await fixture.start({
    filename: `${process.env.TMPDIR ?? "/tmp"}/delegation-fixture-${crypto.randomUUID()}.sqlite`,
    workers: 2,
  })
  const control = await fixture.dbRows("delegation_control")
  expect(control).toEqual([
    expect.objectContaining({ acquisition_disabled: 0, canary_root_session_id: null, canary_expires_at: null }),
  ])
  await fixture.close()
  await fixture.close()
})
```

- [ ] **Step 3: Run RED.**

Run from `packages/core`: `bun test test/delegation-fixture.test.ts`

Expected: FAIL because `test/fixture/delegation.ts` and the delegation tables do not exist.

- [ ] **Step 4a: Implement the controller, Worker, execution, branch, outcome, participant, permit, and control SQL tables.** Define only these eight tables and their columns in `src/delegation/sql.ts`.
- [ ] **Step 4b: Implement the execution active-session index and constraint group.** Add the partial unique index and its exact state predicate.
- [ ] **Step 4c: Implement the controller active-root index and constraint group.** Add the partial unique index and its exact state predicate.
- [ ] **Step 4d: Implement outcome, child-session, and session-input idempotency uniqueness groups.** Add each index or constraint as a separately reviewable database change.
- [ ] **Step 4e: Implement the base fixture lifecycle.** Implement start, close, database provisioning, and Layer-scope closure against `Database.layerFromPath(filename)`.
- [ ] **Step 4f: Implement root and child seed helpers.** Implement parentless-root and child-session seeding through the production session repository.
- [ ] **Step 4g: Implement deterministic Worker/participant factories, `dbRows`, cleanup, and `expectDelegationCode`.** Do not register a Worker or participant automatically.

- [ ] **Step 5a: Generate the migration.**

Run from `packages/core`: `bun run script/migration.ts --name delegation_protocol_v1`

Expected: one new migration file under `packages/core/src/database/migration/` plus generated schema, registry, and snapshot changes.

- [ ] **Step 5b: Inspect the generated migration.** Open the reported migration and verify all eight tables, every index/constraint group, and both partial unique indexes before staging.

- [ ] **Step 6: Run GREEN.**

Run from `packages/core`: `bun run script/migration.ts --check && bun test test/delegation-fixture.test.ts && bun run typecheck`

Expected: all commands exit 0; the concurrency test reports one success and one rejection identifying `delegation_execution_active_session_idx`. Closed `execution_conflict` mapping is verified by Task 5.

- [ ] **Step 7: Commit.** The migration directory is exact and safe here because this isolated task generated one migration.

```bash
git add packages/core/src/delegation/sql.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-fixture.test.ts packages/core/src/session/sql.ts packages/core/schema.json packages/core/src/database/schema.gen.ts packages/core/src/database/migration.gen.ts packages/core/src/database/migration
git diff --staged -- packages/core/src/database/migration
git commit -m "feat(core): add durable delegation state"
```

### Task 4: Worker and participant registry

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/worker.ts`
- Create: `packages/core/src/delegation/participant.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-participant.test.ts`

**Interfaces:**
- Implements `WorkerOwnership` and `ParticipantRegistry` exactly.
- `markUnavailable` and `withdraw` each execute one immediate transaction that changes or removes the participant. This task writes no controller lease rows: Task 9 (controller lease service) extends these same transactions so they first increment `authority_epoch` and set every dependent `armed` or `revoking` lease to `revoking`, and Task 9 owns that test.

- [ ] **Step 1: Create participant lifecycle tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({
    filename: `${process.env.TMPDIR ?? "/tmp"}/participant-${crypto.randomUUID()}.sqlite`,
    workers: 1,
  })
  await fixture.seedRootSession("root_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
  for (const participant of [
    { component: "core" as const, buildID: "core_build", capabilities: ["controllerLeaseV1"] },
    { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] },
    { component: "broker_hud" as const, buildID: "hud_build", capabilities: ["controllerLeaseV1"] },
  ]) await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: 1000 })
})
afterEach(async () => fixture.close())

test.each([
  ["on", "markUnavailable"],
  ["static", "markUnavailable"],
  ["on", "withdrawParticipant"],
] as const)(
  "guard %s to off via %s updates participant availability",
  async (_level, operation) => {
    const guard = await fixture.participantStatus({ component: "guard" })
    if (!guard) throw new Error("expected guard participant")
    expect(guard).toEqual({
      coordinationDomain: "domain_a",
      component: "guard",
      buildID: "guard_build",
      protocol: "opencode.delegation/v1",
      capabilities: ["toolAuthorizeV1", "terminalHandoffV1"],
      availability: "available",
      heartbeatAt: expect.any(Number),
      worker: expect.objectContaining({ workerID: expect.any(String), workerEpoch: expect.any(String) }),
    })
    await fixture[operation]({ worker: guard.worker, component: "guard" })
    const current = await fixture.participantStatus({ component: "guard" })
    if (operation === "markUnavailable") expect(current?.availability).toBe("unavailable")
    if (operation === "withdrawParticipant") expect(current).toBeNull()
  },
)

test("lists exact participant status fields", async () => {
  const statuses = await fixture.listParticipants()
  const guard = statuses.find((status) => status.component === "guard")
  expect(guard).toBeDefined()
  expect(Object.keys(guard ?? {}).sort()).toEqual([
    "availability",
    "buildID",
    "capabilities",
    "component",
    "coordinationDomain",
    "heartbeatAt",
    "protocol",
    "worker",
  ])
})
```

- [ ] **Step 2: Run RED.** Run from `packages/core`: `bun test test/delegation-participant.test.ts`. Expected: FAIL because participant lifecycle services are absent.

- [ ] **Step 3: Implement Worker checks.** Store one current epoch per Worker, reject old epochs as `stale_worker`, reject another current owner as `wrong_worker`, and use `heartbeatAt + 6000` as the expiry boundary.

- [ ] **Step 4: Implement participant transactions.** Registration upserts only the same current Worker epoch. Unavailability and withdrawal each run one immediate transaction that updates participant availability or removes the participant row before commit. Do not select or modify controller leases here: Task 9 Step 5 adds controller fencing to these same transactions.

- [ ] **Step 5: Run GREEN.** Run from `packages/core`: `bun test test/delegation-participant.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/core/src/delegation/worker.ts packages/core/src/delegation/participant.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-participant.test.ts
git commit -m "feat(core): register delegation workers and participants"
```

### Task 5: Durable execution ownership

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/execution.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-ownership.test.ts`

**Interfaces:**
- Implements `ExecutionOwnership`; runner integration remains Task 6.
- Active acquisition depends on the partial unique index. Recovery requires an expired prior owner, marks it terminal, increments the largest prior fencing token, and inserts the replacement in one immediate transaction.

- [ ] **Step 1: Create ownership and lookup tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture, expectDelegationCode } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({
    filename: `${process.env.TMPDIR ?? "/tmp"}/ownership-${crypto.randomUUID()}.sqlite`,
    workers: 2,
  })
})
afterEach(async () => fixture.close())

test("recovers only after expiry and increments the fencing token", async () => {
  const first = await fixture.acquireExecution({
    sessionID: "child_a",
    rootSessionID: "root_a",
    kind: "native_child",
    worker: fixture.worker("worker_a", "epoch_a"),
    now: 1000,
  })
  try {
    await fixture.acquireExecution({
      sessionID: "child_a",
      rootSessionID: "root_a",
      kind: "native_child",
      worker: fixture.worker("worker_b", "epoch_b"),
      now: 2000,
    })
    throw new Error("second acquisition unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "execution_conflict")
  }
  const recovered = await fixture.recoverExecution({
    sessionID: "child_a",
    rootSessionID: "root_a",
    kind: "native_child",
    worker: fixture.worker("worker_b", "epoch_b"),
    now: 7001,
    expiredExecutionID: first.executionID,
  })
  expect(recovered.fencingToken).toBe(first.fencingToken + 1)
})

test("lookup without an active execution returns execution_not_active", async () => {
  await fixture.acquireExecution({
    sessionID: "active_session",
    rootSessionID: "active_session",
    kind: "root",
    worker: fixture.worker("worker_a", "epoch_a"),
    now: 1000,
  })
  try {
    await fixture.currentExecution({ sessionID: "missing" })
    throw new Error("lookup unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "execution_not_active")
  }
})

test("lookup rejects a stale active row", async () => {
  const execution = await fixture.acquireExecution({
    sessionID: "stale_session",
    rootSessionID: "stale_session",
    kind: "root",
    worker: fixture.worker("worker_a", "epoch_a"),
    now: 1000,
  })
  await fixture.recoverExecution({
    sessionID: "stale_session",
    rootSessionID: "stale_session",
    kind: "root",
    worker: fixture.worker("worker_b", "epoch_b"),
    now: 7001,
    expiredExecutionID: execution.executionID,
  })
  try {
    await fixture.assertExecutionCurrent(execution)
    throw new Error("stale lookup unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "stale_execution")
  }
})

test("lookup returns the current execution", async () => {
  const execution = await fixture.acquireExecution({
    sessionID: "current_session",
    rootSessionID: "current_session",
    kind: "root",
    worker: fixture.worker("worker_a", "epoch_a"),
    now: 1000,
  })
  expect(await fixture.currentExecution({ sessionID: "current_session" })).toEqual(execution)
})

test("old Worker epoch cannot mutate the recovered execution", async () => {
  const old = await fixture.acquireExecution({
    sessionID: "root_a",
    rootSessionID: "root_a",
    kind: "root",
    worker: fixture.worker("worker_a", "epoch_old"),
    now: 1000,
  })
  await fixture.recoverExecution({
    sessionID: "root_a",
    rootSessionID: "root_a",
    kind: "root",
    worker: fixture.worker("worker_a", "epoch_new"),
    now: 7001,
    expiredExecutionID: old.executionID,
  })
  try {
    await fixture.recoverExecution({
      sessionID: "root_a",
      rootSessionID: "root_a",
      kind: "root",
      worker: old,
      now: 14002,
      expiredExecutionID: old.executionID,
    })
    throw new Error("stale Worker mutation unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "stale_worker")
  }
})
```

- [ ] **Step 2: Run RED.** Run from `packages/core`: `bun test test/delegation-ownership.test.ts`. Expected: FAIL because `ExecutionOwnership` is absent.

- [ ] **Step 3: Implement acquisition and lookup.** Use one immediate transaction; validate Worker; select the exact session's active row; map active uniqueness to `execution_conflict`; return `execution_not_active` or `stale_execution` without widening the union. Database lookup does not invent `wrong_session`; Task 14 tests that code at the Fiber-bound host boundary. Every "active row of a session" lookup (`current`, the acquisition conflict check, recovery's expired-owner selection) also filters `kind <> 'takeover'` (decided 2026-10-08; Task 14 writes those rows, Task 3 excludes them from the active-session index), so a takeover execution is never a session's execution; recovery's "largest prior fencing token" still counts every row of the session. Ordinary fence validation (`ExecutionOwnership.assertCurrent`, and the execution check inside every branch and outcome mutation) is not an "active row of a session" lookup: it resolves the row by the fence's `execution_id` and compares the whole fence, so it finds a `kind: "takeover"` row too, and it never compares `expires_at` for a takeover row (`assertCurrent(execution)` takes no `now`; nothing heartbeats a takeover row, and its liveness is its Worker's, which `WorkerOwnership.assertCurrent` checks); it requires only a non-terminal state. Only recovery (Step 4) reads `expires_at`, and its selection skips takeover rows. Task 14 Step 3c keeps a regression test (a taker fails its branch with the host clock past `expires_at`); it cannot fail while fence validation reads no clock, so it guards against a later change that adds one.

- [ ] **Step 4: Implement recovery.** Require `expires_at < now`, terminalize the old owner, mark any uncommitted step failed, insert the replacement with `fencing_token + 1`, and leave durable terminal outcomes available for replay.

- [ ] **Step 5: Run GREEN.** Run from `packages/core`: `bun test test/delegation-ownership.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/core/src/delegation/execution.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-ownership.test.ts
git commit -m "feat(core): add durable execution ownership"
```

### Task 6: Runtime identity and the Worker runtime

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09, decided by Holden): this task was inserted ahead of runner integration (now Task 7). Before it, no production code created, registered or heartbeated a Worker, so `DelegationExecution.acquire` had no `WorkerFence` to use outside tests, and nothing renewed an execution during a turn (any turn longer than `EXECUTION_EXPIRY_MS` = 6000 ms became recoverable by another Worker while still running). This task produces the build ID (formerly Task 7) and the process-scoped Worker runtime that Task 7 and every later task obtain their `WorkerFence` from.

**Files:**
- Modify: `packages/core/src/installation/version.ts`
- Modify: `packages/opencode/src/index.ts`
- Create: `packages/opencode/test/cli/version-build-id.test.ts`
- Create: `packages/core/src/delegation/runtime.ts`
- Create: `packages/core/test/delegation-runtime.test.ts`
- Modify only if needed to start the runtime eagerly (Step 9): the opencode server/instance bootstrap file that already provides global nodes; name it in your report.

**Interfaces:**
- Adds compile-time global `OPENCODE_BUILD_ID` and exported `InstallationBuildID`. Package semver remains `InstallationVersion`. A HUD participant identity remains its participant `buildID`; neither substitutes for `InstallationBuildID`. Local source reports `local`; controller acquisition (a later task) rejects `local`, Worker registration does not. Release builds require a supplied nonempty ID (Task 8). The existing yargs `.version` prints `InstallationBuildID`.
- Adds `DelegationRuntime` (`packages/core/src/delegation/runtime.ts`, `export * as DelegationRuntime from "./runtime"`), a global node with deps `[Database.node, DelegationWorker.node, DelegationExecution.node]`:
  - `current(): Effect.Effect<WorkerFence>` -- this process's currently registered Worker fence.
  - `coordinationDomain: string` and `buildID: string` -- the values it registered with.
  - `trackExecution(fence: ExecutionFence): Effect.Effect<void, never, Scope.Scope>` -- renews the execution every `HEARTBEAT_INTERVAL_MS` until the enclosing scope closes; Task 7 calls it for the lifetime of each turn.
  - `export const HEARTBEAT_INTERVAL_MS = 2000` (three missed heartbeats = the existing 6000 ms expiry).
- Identity rules (the design spec's protocol identity, `specs/2026-09-30-core-delegation-authority-design.md` lines 66-71 and 116-130):
  - `workerID`: `worker_<random UUID>` generated once when the runtime layer is built, stable for that process's lifetime. Every OpenCode process that opens the shared database (each TUI, `opencode run`, the server) is its own Worker.
  - `workerEpoch`: a fresh random UUID at first registration and again at every re-registration. A process whose registration lapsed (for example a suspended laptop) re-registers under the same `workerID` with a new epoch, so every fence it held under the old epoch is rejected by `assertCurrent` -- that is the intended fencing behaviour, not an error to paper over.
  - `coordinationDomain`: `domain_` + the first 32 hex characters of the SHA-256 of the resolved absolute database path from `Database.path()`. For `:memory:` databases (tests), `memory_<random UUID>` per runtime instance. Accept an optional injected `{ databasePath, newID, clock }` for tests; production uses `Database.path()`, `crypto.randomUUID()` and the Effect clock.
  - `buildID`: `InstallationBuildID`. `protocol`: `"opencode.delegation/v1"`.
- Lifecycle:
  - Layer construction registers the Worker (`DelegationWorker.register`) and forks a scoped loop that calls `DelegationWorker.heartbeat` every `HEARTBEAT_INTERVAL_MS`.
  - Heartbeat failure with `stale_worker` or `wrong_worker`: re-register with a new epoch, update `current()`, log one warning naming the old and new epoch. Any other failure: log it as an error with its code and retry on the next tick. Never swallow a failure silently, and never let the loop die.
  - `trackExecution`: calls `DelegationExecution.heartbeat` every `HEARTBEAT_INTERVAL_MS`; on a `stale_execution`, `stale_worker` or `wrong_worker` failure it logs one warning and stops renewing (the execution has been taken over; Task 7's mutation assertions then reject the turn's writes). Other failures are logged and retried.
  - Scope close (process exit) needs no deregistration: expiry handles it.

- [ ] **Step 1: Create the source CLI `local` test using `cliIt` conventions.**

```ts
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../../lib/cli-process"

cliIt.live("source CLI reports the local build ID through the existing yargs version option", ({ opencode }) =>
  opencode.spawn(["--version"]).pipe(
    Effect.tap((result) =>
      Effect.sync(() => {
        opencode.expectExit(result, 0, "version")
        expect(result.stdout.trim()).toBe("local")
      })),
    ),
  ),
)

```

- [ ] **Step 2: Run RED.** Run from `packages/opencode`: `bun test test/cli/version-build-id.test.ts`. Expected: FAIL because yargs prints package semver instead of `local`.

- [ ] **Step 3: Implement runtime identity.** In `version.ts`, declare `OPENCODE_BUILD_ID` and set `InstallationBuildID = typeof OPENCODE_BUILD_ID === "string" ? OPENCODE_BUILD_ID : "local"`; in `src/index.ts`, change only the existing `.version` value to `InstallationBuildID`.

- [ ] **Step 4: Run GREEN.** Run from `packages/opencode`: `bun test test/cli/version-build-id.test.ts`.

- [ ] **Step 5: Create the Worker runtime tests** in `packages/core/test/delegation-runtime.test.ts`, using the existing delegation fixture conventions (`packages/core/test/fixture/delegation.ts`, in-memory database from the test preload) and an injectable clock (Effect `TestClock`, or the injected `clock`). Cover, each as its own test:
  1. Building the runtime registers one Worker row with `build_id` = `InstallationBuildID` (`local` in source), protocol `opencode.delegation/v1`, the computed `coordinationDomain`, and the `workerID`/`workerEpoch` that `current()` returns.
  2. `coordinationDomain` for an injected absolute path `/x/opencode.db` equals `domain_` + first 32 hex of its SHA-256; two runtimes over the same path share it and have different `workerID`s; a `:memory:` path yields `memory_...`.
  3. Advancing the clock by `HEARTBEAT_INTERVAL_MS` advances the Worker row's `heartbeat_at`.
  4. When the registration has lapsed (row's heartbeat older than `WORKER_EXPIRY_MS`, or another epoch took the `workerID`), the next tick re-registers with a new epoch, `current()` returns it, and `DelegationWorker.assertCurrent(oldFence)` fails.
  5. `trackExecution` inside a scope renews an acquired execution's `expires_at` on each tick, stops renewing once the scope closes, and stops (without throwing) after the execution is recovered by another Worker.
  6. A heartbeat failure with an unexpected code is logged and the loop keeps running (the next tick succeeds).

- [ ] **Step 6: Run RED.** From `packages/core`: `bun test test/delegation-runtime.test.ts`. Expected: FAIL because `DelegationRuntime` is absent.

- [ ] **Step 7: Implement `packages/core/src/delegation/runtime.ts`** exactly to the Interfaces and Lifecycle above. Use `Effect.repeat(Schedule.spaced(...))` with `Effect.forkScoped` for the loops (the pattern in `packages/core/src/util/effect-flock.ts:265`).

- [ ] **Step 8: Run GREEN.** From `packages/core`: `bun test test/delegation-runtime.test.ts && bun run typecheck`.

- [ ] **Step 9: Start the runtime eagerly.** A Worker must be registered before any plugin participant registers or any turn runs. Find where the opencode server/instance bootstrap builds global nodes and make it build `DelegationRuntime` at start. If no such point exists without restructuring, state that in your report and leave it to be built on first use (Task 7's runner and Task 14's plugin host are its first users); do not invent a new bootstrap.

- [ ] **Step 10: Commit only Task 6 files.**

```bash
git add packages/core/src/installation/version.ts packages/opencode/src/index.ts packages/opencode/test/cli/version-build-id.test.ts packages/core/src/delegation/runtime.ts packages/core/test/delegation-runtime.test.ts
git commit -m "feat(core): register and heartbeat this process as a delegation Worker"
```
(Add the Step 9 bootstrap file to `git add` if you changed it.)

### Task 7: Legacy/v2 runner integration

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09, decided by Holden): this was Task 6; it now runs after Task 6 (runtime identity and the Worker runtime). Answers to the questions the first attempt raised:
> - **Worker fence:** obtain it from `DelegationRuntime.current()` (Task 6) at the acquire-before-provider-dispatch point, together with `coordinationDomain`. Never construct or register a Worker here.
> - **Execution heartbeat:** wrap each turn in a scope and call `DelegationRuntime.trackExecution(fence)` right after acquire, so the execution is renewed every 2000 ms for the turn's lifetime and stops renewing when the turn's terminal state is durable.
> - **Step 2 test:** `Effect.either`/`result.left` do not exist in this Effect version. Use `Effect.result(...)`, assert `result._tag === "Failure"`, and read `result.failure.code`. Step 2's block goes in `packages/opencode/test/session/delegation-run-state.test.ts`; Step 1's goes in `packages/core/test/delegation-runner.test.ts`.
> - **Durable event append check:** assert the fence on every durable event append, as specified -- one indexed read per append. Do not cache the result: a cached "still current" answer is exactly what fencing exists to prevent. Non-durable (ephemeral, e.g. streamed delta) publications are not durable appends and are not checked; if streamed deltas turn out to be durable events, say so in your report with the measured per-turn count rather than changing the rule.
> - Task 5 says "runner integration remains Task 6"; that now means this task.

**Files:**
- Modify: `packages/core/src/session/execution.ts`
- Modify: `packages/core/src/session/execution/local.ts`
- Modify: `packages/core/src/session/runner/index.ts`
- Modify: `packages/core/src/event.ts`
- Modify: `packages/opencode/src/session/run-state.ts`
- Modify: `packages/opencode/src/session/session.ts`
- Create: `packages/core/test/delegation-runner.test.ts`
- Create: `packages/opencode/test/session/delegation-run-state.test.ts`

**Interfaces:**
- Produces `ExecutionFenceRef` with `get`, `locally`, and `assertCurrent` operations bound to the active Fiber.
- Acquires execution ownership before model stream construction. Message append, part update, durable event append, branch mutation, and session deletion assert the active execution fence.

- [ ] **Step 1: Create the core ordering test against the runner harness.**

```ts
import { expect, test } from "bun:test"
import { SessionExecution } from "@opencode-ai/core/session/execution"

test("acquires execution ownership before opening the model stream", async () => {
  const order: string[] = []
  const harness = SessionExecution.testHarness({
    current: { executionID: "exec_a", sessionID: "session_a", rootSessionID: "session_a", fencingToken: 1, workerID: "worker_a", workerEpoch: "epoch_a" },
  })
  await harness.runWithOwnership({
    acquire: async () => { order.push("acquire"); return harness.current },
    openStream: async () => { order.push("stream") },
  })
  expect(order).toEqual(["acquire", "stream"])
})
```

- [ ] **Step 2: Create stale-mutation integration tests.**

```ts
import { expect, test } from "bun:test"
import { Effect } from "effect"
import { SessionExecution } from "@opencode-ai/core/session/execution"

test.each(["updateMessage", "updatePart", "appendEvent", "mutateBranch", "deleteSession"] as const)(
  "%s rejects a stale execution fence",
  async (operation) => {
    const harness = SessionExecution.testHarness({
      current: { executionID: "exec_new", sessionID: "session_a", rootSessionID: "session_a", fencingToken: 2, workerID: "worker_a", workerEpoch: "epoch_a" },
    })
    const stale = { executionID: "exec_old", sessionID: "session_a", rootSessionID: "session_a", fencingToken: 1, workerID: "worker_a", workerEpoch: "epoch_a" }
    const result = await Effect.runPromise(Effect.result(harness[operation](stale)))
    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") expect(result.failure.code).toBe("stale_execution")
  },
)
```

`SessionExecution.testHarness` is exported with exact input `{ current: ExecutionFence }` and returns `{ current: ExecutionFence; runWithOwnership(input: { acquire(): Promise<ExecutionFence>; openStream(): Promise<void> }): Promise<void>; updateMessage(fence: ExecutionFence): Effect.Effect<void, DelegationExecutionError>; updatePart(fence: ExecutionFence): Effect.Effect<void, DelegationExecutionError>; appendEvent(fence: ExecutionFence): Effect.Effect<void, DelegationExecutionError>; mutateBranch(fence: ExecutionFence): Effect.Effect<void, DelegationExecutionError>; deleteSession(fence: ExecutionFence): Effect.Effect<void, DelegationExecutionError> }`. `runWithOwnership` awaits `acquire` and installs its result before invoking `openStream`; each mutation method calls the same production assertion.

- [ ] **Step 3: Run RED.**

From `packages/core`: `bun test test/delegation-runner.test.ts`

From `packages/opencode`: `bun test test/session/delegation-run-state.test.ts`

Expected: FAIL because `ExecutionFenceRef` and `SessionExecution.testHarness` are absent.

- [ ] **Step 4: Implement runner binding.** Acquire before provider dispatch with the `DelegationRuntime.current()` Worker fence and track the execution for the turn (see the plan-change note above); install the returned fence in the Fiber reference; validate the reference at each listed mutation; clear it only after terminal state is durable.

- [ ] **Step 5: Implement v2 run-state binding.** Replace process-local ownership as authority with the durable execution service while retaining local maps only as cancellation and observation aids.

- [ ] **Step 6: Run GREEN.**

From `packages/core`: `bun test test/delegation-runner.test.ts && bun run typecheck`

From `packages/opencode`: `bun test test/session/delegation-run-state.test.ts && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 7: Commit.**

```bash
git add packages/core/src/session/execution.ts packages/core/src/session/execution/local.ts packages/core/src/session/runner/index.ts packages/core/src/event.ts packages/opencode/src/session/run-state.ts packages/opencode/src/session/session.ts packages/core/test/delegation-runner.test.ts packages/opencode/test/session/delegation-run-state.test.ts
git commit -m "feat(core): enforce execution fences in runners"
```

### Task 8: Build-ID enforcement

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09, after the first attempt): the work of Steps 1-5 already sits UNCOMMITTED in the tree from the first attempt (`packages/opencode/script/build.ts`, `packages/opencode/test/cli/version-build-id.test.ts`; its own test and typecheck were green). It stopped only because its full-suite permission prompt was rejected by accident. Review that work, add the guard below, run the full package suite, and commit.
> **Release-upload guard (required).** The missing-ID test runs a real build with `OPENCODE_RELEASE=1`; if the validation ever regresses, `script/build.ts` continues to `gh release upload` (line ~252), and this machine has an authenticated `gh`. `runBuildWithoutID` must make an upload impossible: spawn with an env that drops `GH_TOKEN`, `GITHUB_TOKEN` and `GH_REPO`, sets `GH_HOST=invalid.invalid`, and puts first on `PATH` a temporary directory whose `gh` is a script that exits 97; remove that directory after the test. Assert the exit code is exactly 1 (the validation error), never 97. Do not leave stub directories or `packages/opencode/dist/` build output behind (the success-path build in Step 4 may write `dist/`; remove what it created).

**Files:**
- Modify: `packages/opencode/script/build.ts`
- Modify: `packages/opencode/test/cli/version-build-id.test.ts`

- [ ] **Step 1: Add the missing-ID test and body.** Add `runBuildWithoutID` and the release test that expects the validation error before dynamic `generate.ts` import/build work.

```ts
async function runBuildWithoutID(): Promise<{ exitCode: number; stderr: string }> {
  const child = Bun.spawn(["bun", "run", "script/build.ts", "--single", "--skip-install", "--skip-embed-web-ui"], { cwd: `${import.meta.dir}/../..`, env: Object.assign({}, process.env, { OPENCODE_RELEASE: "1", OPENCODE_BUILD_ID: "" }), stdout: "ignore", stderr: "pipe" })
  return { exitCode: await child.exited, stderr: await new Response(child.stderr).text() }
}

test("release build rejects a missing immutable build ID before build work", async () => {
  const result = await runBuildWithoutID()
  expect(result.exitCode).toBe(1)
  expect(result.stderr).toContain("OPENCODE_BUILD_ID is required for release builds")
})
```

- [ ] **Step 2: Implement missing-ID validation before dynamic build work.** In `packages/opencode/script/build.ts`, validate `OPENCODE_BUILD_ID` before the dynamic `generate.ts` import/build work and add `OPENCODE_BUILD_ID: JSON.stringify(buildID)` in Bun `define`.
- [ ] **Step 3: Replace the existing binary smoke block with this complete check.**

```ts
const binary = binaryPath
const version = Bun.spawnSync([binary, "--version"], { stdout: "pipe", stderr: "pipe" })
if (version.exitCode !== 0) throw new Error(new TextDecoder().decode(version.stderr))
const actualBuildID = new TextDecoder().decode(version.stdout).trim()
if (actualBuildID !== buildID) throw new Error(`binary build ID mismatch: expected ${buildID}, received ${actualBuildID}`)
```

- [ ] **Step 4: Run the successful build and exact binary assertion.** Run from repository root: `OPENCODE_BUILD_ID=plan1-build-test bun run --cwd packages/opencode build --single --skip-install --skip-embed-web-ui`; then assert `packages/opencode/dist/opencode-linux-x64/bin/opencode --version` prints exactly `plan1-build-test`.

- [ ] **Step 5: Run GREEN.** Run from `packages/opencode`: `bun test test/cli/version-build-id.test.ts && bun run typecheck`. Expected: exit 0; local source prints `local` unless the test injects the compile-time define.

- [ ] **Step 6: Commit only Task 8 files.**

```bash
git add packages/opencode/script/build.ts packages/opencode/test/cli/version-build-id.test.ts
git commit -m "feat(opencode): enforce immutable build ID"
```

### Task 9: Controller lease service and acquisition policy

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09): in production, the Worker fence and `coordinationDomain` this task needs come from `DelegationRuntime.current()` and `DelegationRuntime.coordinationDomain` (Task 6). Tests keep using the fixture Worker.

**Files:**
- Create: `packages/core/src/delegation/controller-token.ts`
- Create: `packages/core/src/delegation/controller.ts`
- Modify: `packages/core/src/delegation/participant.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-controller.test.ts`

**Interfaces:**
- Implements `ControllerService.acquireEmbedded -> CoreControllerAcquireResult` and `ControllerService.acquireAttached -> AttachedControllerAcquireResult`; renew returns `CoreControllerAcquired` and keeps `controllerID` internal to the core service.
- `acquireAttached` generates a random controller ID and random 256-bit one-time token, returns the token only in the acquired response, stores only its SHA-256 hash, and compares presented hashes with constant-time byte comparison. `acquireEmbedded` accepts the trusted host controller ID and never creates or returns a token.
- Enforces two-second renewal cadence, six-second expiry, participant compatibility, immutable nonlocal build identity, global disable, and one exact unexpired canary root.
- Extends Task 4's `markUnavailable` and `withdraw` transactions in `participant.ts`: inside the same immediate transaction, before the participant row changes, they select every dependent `armed` or `revoking` controller lease, increment its `authority_epoch`, and set it to `revoking`.

- [ ] **Step 1: Create acquisition, conflict, and token tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture, expectDelegationCode } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({
    filename: `${process.env.TMPDIR ?? "/tmp"}/controller-${crypto.randomUUID()}.sqlite`,
    workers: 1,
  })
  await seedControllerAcquisitionContext(fixture)
})
afterEach(async () => fixture.close())

async function seedControllerAcquisitionContext(fixture: ReturnType<typeof createDelegationFixture>): Promise<void> {
  for (const rootSessionID of ["root_a", "root_canary", "root_other"]) await fixture.seedRootSession(rootSessionID)
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
  await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "core", buildID: "core_build", protocol: "opencode.delegation/v1", capabilities: ["controllerLeaseV1"], heartbeatAt: 1000 })
  await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "guard", buildID: "guard_build", protocol: "opencode.delegation/v1", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"], heartbeatAt: 1000 })
  await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "broker_hud", buildID: "hud_build", protocol: "opencode.delegation/v1", capabilities: ["controllerLeaseV1"], heartbeatAt: 1000 })
}

test("attached acquisition returns a token once, stores only its hash, and returns a nonsecret observer", async () => {
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const first = await fixture.acquireAttachedController({
    rootSessionID: "root_a",
    worker,
    protocol: "opencode.delegation/v1",
    buildID: "core_build",
    now: 1000,
  })
  expect(first.state).toBe("acquired")
  if (first.state !== "acquired") throw new Error("expected acquired controller")
  expect(first.token).toEqual(expect.any(String))
  expect(first.token.length).toBeGreaterThan(0)
  expect(Object.keys(first).sort()).toEqual(["authorityEpoch", "controllerID", "expiresAt", "leaseID", "state", "token"])
  const second = await fixture.acquireAttachedController({
    rootSessionID: "root_a",
    worker,
    protocol: "opencode.delegation/v1",
    buildID: "core_build",
    now: 1001,
  })
  expect(second).toEqual({
    state: "observer",
    reason: "controller_conflict",
    rootSessionID: "root_a",
    expiresAt: 7000,
  })
  expect(Object.keys(second).sort()).toEqual(["expiresAt", "reason", "rootSessionID", "state"])
  const rows = await fixture.dbRows("delegation_controller_lease")
  const logs = await fixture.logs()
  expect(JSON.stringify(rows)).not.toContain(first.token)
  expect(JSON.stringify(logs)).not.toContain(first.token)
  expect(second).not.toHaveProperty("token")
})

test("attached acquire then renew then release uses the one-time token and fences the old epoch", async () => {
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const result = await fixture.acquireAttachedController({
    rootSessionID: "root_a",
    worker,
    protocol: "opencode.delegation/v1",
    buildID: "core_build",
    now: 1000,
  })
  if (result.state !== "acquired") throw new Error("expected acquired controller")
  const renewed = await fixture.renewController({
    worker,
    leaseID: result.leaseID,
    authorityEpoch: result.authorityEpoch,
    controllerID: result.controllerID,
    token: result.token,
    now: 3000,
  })
  expect(renewed).toMatchObject({ state: "acquired", leaseID: result.leaseID, controllerID: result.controllerID, expiresAt: 9000 })
  expect(renewed).not.toHaveProperty("token")
  await fixture.releaseController({
    worker,
    leaseID: result.leaseID,
    authorityEpoch: result.authorityEpoch,
    controllerID: result.controllerID,
    token: result.token,
    now: 3100,
  })
  try {
    await fixture.renewController({
      worker,
      leaseID: result.leaseID,
      authorityEpoch: result.authorityEpoch,
      controllerID: result.controllerID,
      token: result.token,
      now: 3200,
    })
    throw new Error("stale renewal unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "stale_authority")
  }
})
```

- [ ] **Step 2: Create policy table tests.**

```ts
test.each([
  ["local", "local_build"],
  ["wrong_protocol", "protocol_mismatch"],
  ["missing_guard", "participant_unavailable"],
] as const)("rejects %s with %s", async (condition, code) => {
  const worker = fixture.worker("worker_a", "epoch_a", condition === "local" ? "local" : "core_build")
  if (condition === "missing_guard") {
    const guard = await fixture.participantStatus({ component: "guard" })
    if (!guard) throw new Error("expected guard participant")
    await fixture.markUnavailable({ worker: guard.worker, component: "guard" })
  }
  try {
    await fixture.acquireEmbeddedController({
      rootSessionID: "root_a",
      controllerID: "controller_a",
      worker,
      protocol: condition === "wrong_protocol" ? ("opencode.delegation/v2" as "opencode.delegation/v1") : "opencode.delegation/v1",
      buildID: condition === "local" ? "local" : "core_build",
      now: 1000,
    })
    throw new Error("policy rejection unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, code)
  }
})

test("disabled acquisition permits only the exact unexpired canary root", async () => {
  await fixture.disableAcquisition()
  await fixture.allowCanaryRoot({ rootSessionID: "root_canary", expiresInMs: 5000, now: 1000 })
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const canary = await fixture.acquireEmbeddedController({
    rootSessionID: "root_canary",
    controllerID: "controller_a",
    worker,
    protocol: "opencode.delegation/v1",
    buildID: "core_build",
    now: 2000,
  })
  expect(canary.state).toBe("acquired")
  try {
    await fixture.acquireEmbeddedController({
      rootSessionID: "root_other",
      controllerID: "controller_b",
      worker,
      protocol: "opencode.delegation/v1",
      buildID: "core_build",
      now: 2000,
    })
    throw new Error("non-canary acquisition unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "acquisition_disabled")
  }
})

test("renewal extends expiry and expired ownership can be acquired", async () => {
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const first = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_a", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 1000 })
  if (first.state !== "acquired") throw new Error("expected acquired controller")
  const renewed = await fixture.renewController({ worker, leaseID: first.leaseID, authorityEpoch: first.authorityEpoch, controllerID: first.controllerID, now: 3000 })
  expect(renewed).toMatchObject({ state: "acquired", controllerID: first.controllerID, expiresAt: 9000 })
  const observer = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_b", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 9000 })
  expect(observer.state).toBe("observer")
  const takeover = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_b", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 9001 })
  expect(takeover.state).toBe("acquired")
})

test("expired canary does not bypass disabled acquisition", async () => {
  await fixture.disableAcquisition()
  await fixture.allowCanaryRoot({ rootSessionID: "root_canary", expiresInMs: 5000, now: 1000 })
  try {
    await fixture.acquireEmbeddedController({ rootSessionID: "root_canary", controllerID: "controller_a", worker: fixture.worker("worker_a", "epoch_a", "core_build"), protocol: "opencode.delegation/v1", buildID: "core_build", now: 6001 })
    throw new Error("expired canary unexpectedly acquired")
  } catch (error) {
    expectDelegationCode(error, "acquisition_disabled")
  }
})

test("recycled Worker epoch rejects old controller renewal without changing state", async () => {
  const oldWorker = fixture.worker("worker_a", "epoch_a", "core_build")
  const acquired = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_a", worker: oldWorker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 1000 })
  if (acquired.state !== "acquired") throw new Error("expected acquired controller")
  await fixture.registerWorker({ worker: fixture.worker("worker_a", "epoch_b", "core_build"), buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1100 })
  const before = await fixture.dbRows("delegation_controller_lease")
  await expect(fixture.renewController({ worker: oldWorker, leaseID: acquired.leaseID, authorityEpoch: acquired.authorityEpoch, controllerID: "controller_a", now: 1200 })).rejects.toMatchObject({ code: "stale_worker" })
  expect(await fixture.dbRows("delegation_controller_lease")).toEqual(before)
})
```

- [ ] **Step 2b: Append participant-driven controller fencing tests** to `packages/core/test/delegation-controller.test.ts`. `seedControllerAcquisitionContext` already registers the `guard` participant, and `markUnavailable`, `withdrawParticipant`, and `participantStatus` are Task 4 fixture methods.

```ts
test.each([
  ["on", "markUnavailable"],
  ["static", "markUnavailable"],
  ["on", "withdrawParticipant"],
] as const)(
  "guard %s to off via %s fences required controllers first",
  async (_level, operation) => {
    const controllerWorker = fixture.worker("worker_a", "epoch_a", "core_build")
    const guard = await fixture.participantStatus({ component: "guard" })
    if (!guard) throw new Error("expected guard participant")
    const acquired = await fixture.acquireEmbeddedController({
      rootSessionID: "root_a",
      controllerID: "controller_a",
      worker: controllerWorker,
      protocol: "opencode.delegation/v1",
      buildID: "core_build",
      now: 1000,
    })
    expect(acquired.state).toBe("acquired")
    if (acquired.state !== "acquired") throw new Error("expected acquired controller")
    await fixture[operation]({ worker: guard.worker, component: "guard" })
    const current = await fixture.participantStatus({ component: "guard" })
    if (operation === "markUnavailable") expect(current?.availability).toBe("unavailable")
    if (operation === "withdrawParticipant") expect(current).toBeNull()
    try {
      await fixture.renewController({
        worker: controllerWorker,
        leaseID: acquired.leaseID,
        authorityEpoch: acquired.authorityEpoch,
        controllerID: acquired.controllerID,
        now: 1100,
      })
      throw new Error("renewal unexpectedly succeeded")
    } catch (error) {
      expectDelegationCode(error, "stale_authority")
    }
  },
)
```

The fixture methods perform one immediate control-row transaction. Task 25 exposes equivalent operations through `MaintenanceService` and yargs.

- [ ] **Step 3: Run RED.** Run from `packages/core`: `bun test test/delegation-controller.test.ts`. Expected: FAIL because controller service and policy enforcement are absent.

- [ ] **Step 4a: Implement random controller ID and token generation with hash-only persistence.** `acquireAttached` generates the controller ID and 256-bit one-time token, returns the raw token once, and persists only its SHA-256 hash.
- [ ] **Step 4b: Implement constant-time presented-hash comparison.** Hash the presented token and compare the stored and presented hashes with a constant-time byte comparison.
- [ ] **Step 4c: Implement the acquire transaction.** Verify root parentlessness, Worker, required participants, immutable build, disabled-canary policy, stale lease expiry, and the fresh armed authority epoch.

- [ ] **Step 4d: Implement renewal.** Recheck participants and all fences, validate the attached token, and return `CoreControllerAcquired` with `controllerID` only inside the core result.
- [ ] **Step 4e: Implement release and the revocation barrier.** Validate the attached token, increment the epoch, set `revoking`, wait for the decision barrier, and mark the lease `revoked`.
- [ ] **Step 4f: Implement expiry.** Treat `expires_at < now` as expired and permit the next acquisition only after the old lease is fenced.

- [ ] **Step 5: Implement participant-driven controller fencing** in `packages/core/src/delegation/participant.ts`. Extend Task 4's participant unavailability and withdrawal transactions: inside the same immediate transaction, before updating or removing the participant row, select every dependent `armed` or `revoking` controller lease, increment each lease's `authority_epoch`, and set it to `revoking`. Do not open a second transaction; a renewal presenting the old epoch then rejects with `stale_authority`.

- [ ] **Step 7: Run GREEN.** Run from `packages/core`: `bun test test/delegation-controller.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 8: Commit.**

```bash
git add packages/core/src/delegation/controller-token.ts packages/core/src/delegation/controller.ts packages/core/src/delegation/participant.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-controller.test.ts
git commit -m "feat(core): implement delegation controller leases"
```

### Task 10: Branch state machine core

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09): the first attempt stopped when the Anthropic weekly window ran out, with partial work UNCOMMITTED in the tree: new `packages/core/src/delegation/branch.ts` (BranchService; never compiled), new `packages/core/test/delegation-branch.test.ts`, modified `packages/core/test/delegation-runner.test.ts` (copies: `/home/dev/.local/state/delegation-plan-series/core-inflight-1534.patch` and `core-inflight-1534-untracked.tgz`). Review and continue from it, or discard it and start clean -- your call, say which. Remaining per that attempt: extend `packages/core/test/fixture/delegation.ts` with the Task 10 methods (reserveBranch, bindBranch, acknowledgeBranch, startBranch, completeBranch, failBranch, acknowledgeHandoff, branchState, runSessionTurn, modelStreamsOpened); in the runner, add DelegationBranchError to RunError and an `acquireExecution` that runs boundToChild, the branch-state gate and acquire-or-recover in one immediate transaction, with SessionExecution.own calling it; then GREEN and commit. Two points it flagged for review, not settled: `start` validates the owner execution's fence, so a child branch can start only while its parent's execution is active; and the `acknowledge` "delivery handler installed" check was read as "the owner component's participant is available on the branch's Worker epoch with a matching build".

**Files:**
- Create: `packages/core/src/delegation/branch.ts`
- Create: `packages/core/test/delegation-branch.test.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Modify: `packages/core/src/session/runner/index.ts`
- Modify: `packages/core/test/delegation-runner.test.ts`

**Interfaces:**
- Implements `BranchService`.
- Completion and failure retire in one transaction: `running -> completed|failed -> retiring -> retired` after durable `resultID` or bounded `errorCode`. `fail` also accepts a branch in `reserved`, `registered` or `acknowledged`, so a registration that fails before its child is prompted (Task 19) retires the same way: `-> failed -> retiring -> retired`.
- Handoff waits: `running -> handoff -> outcome_acknowledged -> retiring -> retired` (exercised by Task 11 once outcomes exist).
- Closed-branch rejections (decided 2026-10-08, Holden). After the Worker, execution and branch fence checks pass, every `BranchService` mutation (`bind`, `acknowledge`, `start`, `complete`, `fail`, `acknowledgeHandoff`, `setDelivery`) that finds its branch in a terminal state -- `completed`, `failed`, `outcome_acknowledged`, `retiring` or `retired` -- rejects with `DelegationBranchError { code: "branch_already_terminal" }` and writes nothing. Any other state the operation does not accept rejects with `invalid_branch_state` and writes nothing; `handoff` is not terminal (its outcome is still pending), so `fail` on a `handoff` branch is `invalid_branch_state`, and that is the only state for which `fail` answers it. Consumers rely on the split: workflows recovery counts `branch_already_terminal` as an already-failed branch, and answers `invalid_branch_state` (a `handoff` branch) by looking up its pending outcome with `pendingOutcome` and acknowledging it with `acknowledgeOutcome` (Task 14), under fences it first obtained from `takeOverBranch`. The fence checks come first, so a stale fence still rejects with its `stale_*`/`wrong_*` code whatever the state. `completed` and `failed` are transient inside the terminal transaction, so the observable terminal states are `outcome_acknowledged`, `retiring` and `retired`.
- Runner branch start. When the runner acquires an execution for a session that is the `childSessionID` of a branch in `acknowledged`, the same immediate transaction calls `BranchService.start` (`acknowledged -> running`). Acquisition for a session bound to a branch in any state other than `acknowledged` or `running` fails with `invalid_branch_state` and starts no model stream. A session with no bound branch acquires as before. This is the only production caller of `BranchService.start`; it covers native and workflow branches alike, and plugins have no start API.
- The rule lives in the runner's acquisition path (`packages/core/src/session/runner/index.ts`, the Task 7 Step 4 acquire-before-provider-dispatch point), not in `ExecutionService.acquire`. `fixture.acquireExecution` therefore starts no branch, which is why fixture-built chains still call `fixture.startBranch`.
- This rule lives in Task 10, not Task 7: Task 7's `SessionExecution.testHarness` takes only `{ current: ExecutionFence }` and cannot bind a branch, because `BranchService` does not exist until this task.
- Fixture additions owned by this task: `runSessionTurn(input: AcquireExecutionInput): Promise<ExecutionFence>` drives one turn through the production runner acquisition path with a recording model-stream factory that yields no output, and rejects with the runner's closed error when acquisition fails. `modelStreamsOpened(sessionID: string): Promise<number>` returns how many times that recording factory constructed a model stream for the session.

- [ ] **Step 1: Create lifecycle tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture, expectDelegationCode } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/branch-${crypto.randomUUID()}.sqlite`, workers: 1 })
  await fixture.seedRootSession("root_a")
  await fixture.seedChildSession("child_a", "root_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
  await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "core", buildID: "core_build", protocol: "opencode.delegation/v1", capabilities: ["controllerLeaseV1"], heartbeatAt: 1000 })
})
afterEach(async () => fixture.close())

async function runningBranch(): Promise<import("@opencode-ai/schema/delegation").BranchFence> {
  const execution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker: fixture.worker("worker_a", "epoch_a"), now: 1000 })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  return acknowledged.branch
}

test.each([
  ["complete", "result_a"],
  ["fail", "tool_failed"],
] as const)("%s retires outcome-less branches in one transaction", async (operation, value) => {
  const branch = await runningBranch()
  if (operation === "complete") await fixture.completeBranch({ branch, resultID: value })
  if (operation === "fail") await fixture.failBranch({ branch, errorCode: value })
  expect(await fixture.branchState(branch.branchID)).toBe("retired")
})

test("recycled Worker epoch rejects branch mutation without changing state", async () => {
  const branch = await runningBranch()
  const before = await fixture.dbRows("delegation_branch")
  await fixture.registerWorker({ worker: fixture.worker("worker_a", "epoch_b", "core_build"), buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1100 })
  await expect(fixture.completeBranch({ branch, resultID: "result_recycled" })).rejects.toMatchObject({ code: "stale_worker" })
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
})
```

- [ ] **Step 2: Create invalid-order and fence tests.**

```ts
test.each([
  ["stale_branch", "stale_branch"],
  ["wrong_parent", "wrong_parent"],
  ["duplicate_child", "child_session_conflict"],
] as const)("rejects %s with %s", async (condition, code) => {
  const branch = await runningBranch()
  try {
    if (condition === "stale_branch") await fixture.completeBranch({ branch: Object.assign({}, branch, { branchFencingToken: branch.branchFencingToken - 1 }), resultID: "result_a" })
    if (condition === "wrong_parent") await fixture.bindBranch({ branch, childSessionID: "root_a" })
    if (condition === "duplicate_child") await fixture.bindBranch({ branch, childSessionID: "child_a" })
    throw new Error("invalid branch operation unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, code)
  }
})

test("a child whose branch retired binds to a new branch and the retired branch stays retired", async () => {
  const execution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker: fixture.worker("worker_a", "epoch_a"), now: 1000 })
  const reserve = () => fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const firstRegistered = await fixture.bindBranch({ branch: (await reserve()).branch, childSessionID: "child_a" })
  const first = await fixture.acknowledgeBranch({ branch: firstRegistered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: first.branch })
  await fixture.completeBranch({ branch: first.branch, resultID: "result_a" })
  const retiredRow = (await fixture.dbRows("delegation_branch")).find((row) => row.branch_id === first.branch.branchID)
  expect(retiredRow).toBeDefined()
  const second = await fixture.bindBranch({ branch: (await reserve()).branch, childSessionID: "child_a" })
  expect(second.branch.branchID).not.toBe(first.branch.branchID)
  expect(await fixture.branchState(first.branch.branchID)).toBe("retired")
  expect((await fixture.dbRows("delegation_branch")).find((row) => row.branch_id === first.branch.branchID)).toEqual(retiredRow)
  expect(await fixture.branchState(second.branch.branchID)).toBe("registered")
  const third = await reserve()
  await expect(fixture.bindBranch({ branch: third.branch, childSessionID: "child_a" })).rejects.toMatchObject({ code: "child_session_conflict" })
})

// Decided 2026-10-08 (Holden): a mutation on a terminal branch answers branch_already_terminal, not
// invalid_branch_state, and writes nothing. The handoff counterpart (fail -> invalid_branch_state)
// needs fixture.createOutcome and is appended in Task 11 Step 6b.
test("fail and complete on a retired branch reject with branch_already_terminal and write nothing", async () => {
  const branch = await runningBranch()
  await fixture.failBranch({ branch, errorCode: "tool_failed" })
  expect(await fixture.branchState(branch.branchID)).toBe("retired")
  const before = await fixture.dbRows("delegation_branch")
  await expect(fixture.failBranch({ branch, errorCode: "tool_failed" })).rejects.toMatchObject({ code: "branch_already_terminal" })
  await expect(fixture.completeBranch({ branch, resultID: "result_late" })).rejects.toMatchObject({ code: "branch_already_terminal" })
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
})
```

- [ ] **Step 2b: Create the runner branch-start tests.** Append this block to `packages/core/test/delegation-runner.test.ts` (Task 7). Change that file's existing `bun:test` import to `import { afterEach, beforeEach, describe, expect, test } from "bun:test"` and add the two imports below at the top of the file. The `describe` scope keeps the fixture lifecycle away from Task 6's harness tests.

```ts
import type { BranchFence, ExecutionFence, WorkerFence } from "@opencode-ai/schema/delegation"
import { createDelegationFixture } from "./fixture/delegation"

describe("runner branch start", () => {
  let fixture: ReturnType<typeof createDelegationFixture>
  let worker: WorkerFence
  let rootExecution: ExecutionFence
  beforeEach(async () => {
    fixture = createDelegationFixture()
    await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/runner-branch-${crypto.randomUUID()}.sqlite`, workers: 1 })
    await fixture.seedRootSession("root_a")
    await fixture.seedChildSession("child_a", "root_a")
    await fixture.seedChildSession("child_unbound", "root_a")
    worker = fixture.worker("worker_a", "epoch_a", "core_build")
    await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
    await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "core", buildID: "core_build", protocol: "opencode.delegation/v1", capabilities: ["controllerLeaseV1"], heartbeatAt: 1000 })
    rootExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  })
  afterEach(async () => fixture.close())

  async function acknowledgedBranch(): Promise<BranchFence> {
    const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: rootExecution, parentBranchID: null, kind: "native", delivery: "foreground" })
    const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
    const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
    return acknowledged.branch
  }

  test("acquiring the child execution of an acknowledged branch moves it to running", async () => {
    const branch = await acknowledgedBranch()
    expect(await fixture.branchState(branch.branchID)).toBe("acknowledged")
    await fixture.runSessionTurn({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
    expect(await fixture.branchState(branch.branchID)).toBe("running")
    expect(await fixture.modelStreamsOpened("child_a")).toBe(1)
  })

  test("a session with no bound branch acquires as before", async () => {
    await fixture.runSessionTurn({ sessionID: "child_unbound", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
    expect(await fixture.modelStreamsOpened("child_unbound")).toBe(1)
    expect(await fixture.dbRows("delegation_branch")).toEqual([])
  })
})
```

- [ ] **Step 3: Run RED.** Run from `packages/core`: `bun test test/delegation-branch.test.ts test/delegation-runner.test.ts`. Expected: FAIL because `BranchService` is absent. In `test/delegation-runner.test.ts`, the acknowledged case fails on that same absence (the fixture branch methods reject); once `BranchService` exists but before Step 4b, it fails because the branch is still `acknowledged`. The retired-branch rebind test in `test/delegation-branch.test.ts` fails on the same absence; against a full (non-partial) child-session unique index it would fail with `child_session_conflict` on the second bind. The retired-branch `branch_already_terminal` test fails on the same absence; against an implementation that refuses every closed state with `invalid_branch_state` it fails on the `code` match. The handoff cases for both files are not here: they need `fixture.createOutcome`, which Task 11 owns, and Task 11 Step 6b appends them. The unbound-session case is a regression guard for the unchanged path and is the only test expected to pass at RED. Task 6's two runner tests stay green.

- [ ] **Step 4: Implement reserve, bind, and acknowledge.** Reserve before child ID; bind validates canonical parent and that no open branch is already bound to the child ID (`child_session_conflict`; a child whose only branches are closed -- `handoff`, `outcome_acknowledged`, `retiring` or `retired` -- binds again, Task 3 partial index; Task 11 Step 6b adds the `handoff` case); acknowledge copies current participant component, build, and protocol and proves delivery handler installation. Task 20 later adds reserve-time `parentBranchID` validation and the workflows outermost-only acknowledgement rule, both rejecting with `wrong_parent`.

- [ ] **Step 4b: Implement runner branch start** in `packages/core/src/session/runner/index.ts`. At the Task 7 acquire-before-provider-dispatch point, open one immediate transaction that loads the branch whose `childSessionID` is the session (child-session uniqueness: the open branch, else the most recently reserved one, Task 3; so a newer acknowledged branch wins over an older `handoff` branch of the same child, and a child whose newest branch is `handoff` is refused below) and acquires the execution:
  - no bound branch: acquire exactly as before;
  - `acknowledged`: acquire and call the transaction-scoped `BranchService.start` in the same transaction;
  - `running`: acquire unchanged;
  - any other state: fail with `DelegationBranchError { code: "invalid_branch_state" }`, write nothing, and never construct the model stream. Implement this rule here; its test (a branch in `handoff`) is appended in Task 11 Step 6b, because reaching `handoff` needs `createOutcome`.

  Add `runSessionTurn` and `modelStreamsOpened` to the fixture as specified under Interfaces; the recording factory is the only test seam and contains no state logic.

- [ ] **Step 5: Implement terminal transactions.** Validate Worker, execution, and branch tokens inside every transition; bound `errorCode` to a fixed allowlist or 128 UTF-8 bytes; persist result/error before retirement. After the fence checks, apply the Interfaces closed-branch rule in every mutation: a terminal state rejects with `branch_already_terminal`, any other unaccepted state (`handoff` included) with `invalid_branch_state`, both before any write.

- [ ] **Step 6: Run GREEN.** Run from `packages/core`: `bun test test/delegation-branch.test.ts test/delegation-runner.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 7: Commit.**

```bash
git add packages/core/src/delegation/branch.ts packages/core/src/session/runner/index.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-branch.test.ts packages/core/test/delegation-runner.test.ts
git commit -m "feat(core): implement delegation branch lifecycle and runner branch start"
```

### Task 11: Sanitizer, bounds, persistence, and ID-only events

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/payload.ts`
- Create: `packages/core/src/delegation/terminal.ts`
- Create: `packages/core/src/delegation/outcome.ts`
- Create: `packages/core/src/delegation/event.ts`
- Create: `packages/core/src/delegation/sanitizer.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Modify: `packages/plugin/src/index.ts`
- Modify: `packages/plugin/src/v2/effect/context.ts`
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/opencode/src/plugin/index.ts`
- Create: `packages/core/test/delegation-payload.test.ts`
- Create: `packages/core/test/delegation-outcome.test.ts`
- Create: `packages/core/test/delegation-sanitizer.test.ts`
- Modify: `packages/core/test/delegation-branch.test.ts`
- Modify: `packages/core/test/delegation-runner.test.ts`
- Create: `packages/opencode/test/plugin/delegation-sanitizer.test.ts`

**Interfaces:**
- Adds optional plugin hook key `"delegation.sanitize"?: DelegationSanitizeHook` alongside the `ToolAuthorizeHook` type from Task 2 (Task 16, which runs later, adds the `"tool.authorize"` key itself); core requires exactly one trusted sanitizer for candidate outcomes, and the existing missing-hook mapping remains `sanitizer_unavailable`.
- Implements `OutcomeService` and invokes `DelegationSanitizeHook` before opening the outcome transaction.
- Fixture additions owned by this task, in `packages/core/test/fixture/delegation.ts`: `setSanitizer` and `createOutcome`. Add them before the first test that uses them. Task 12 (owner-scoped outcome transport) and Task 14 (trusted plugin API) call both, which is why this task runs directly after Task 10.
- Exact sanitizer result is `{ status: "sanitized", payload }` or `{ status: "unredactable_secret", code: "unredactable_secret" }`.
- Missing hook, unexpected throw, unredactable result, and invalid sanitizer output do not reject `createOutcome`. They persist and return `DelegationTerminal { kind: "internal_error" }` with `errorCode` respectively `sanitizer_unavailable`, `sanitizer_failed`, or `sanitizer_rejected`, and the exact fixed payload `{ type: "internal_error", message: "Delegated interaction could not be transferred." }`.
- Oversize candidate input likewise persists and returns `internal_error` with `errorCode: "payload_too_large"` and the same fixed payload. Only fence, ownership, or database failures reject `createOutcome`. Task 20 extends this: a derived `branchPath` longer than `MAX_BRANCH_PATH_LENGTH` persists `internal_error` with `errorCode: "bound_exceeded"` and the same fixed payload. `createOutcome` derives `branchPath`, `rootOwnerExecution` and `delivery` from the origin chain and rejects a differing supplied value as an ownership failure (`stale_branch` for path or delivery, `wrong_owner` for owner). `DelegationOutcomeReady.branchID` is `branchPath[0]`.

- [ ] **Step 1: Create the exact bounds table and body.**

```ts
import { expect, test } from "bun:test"
import { validateDelegationPayload } from "@opencode-ai/core/delegation/payload"

const encoder = new TextEncoder()
const bytes = (count: number) => "x".repeat(count)

test.each([
  ["questions", { type: "question", questions: Array.from({ length: 9 }, () => ({ header: "H", question: "Q", options: [], allowCustom: false })) }],
  ["options", { type: "question", questions: [{ header: "H", question: "Q", options: Array.from({ length: 17 }, () => ({ label: "L", description: "D" })), allowCustom: false }] }],
  ["header", { type: "question", questions: [{ header: bytes(129), question: "Q", options: [], allowCustom: false }] }],
  ["question", { type: "question", questions: [{ header: "H", question: bytes(4097), options: [], allowCustom: false }] }],
  ["label", { type: "question", questions: [{ header: "H", question: "Q", options: [{ label: bytes(257), description: "D" }], allowCustom: false }] }],
  ["description", { type: "question", questions: [{ header: "H", question: "Q", options: [{ label: "L", description: bytes(1025) }], allowCustom: false }] }],
  ["custom answer", { type: "question", questions: [{ header: "H", question: "Q", options: [], allowCustom: true, customAnswer: bytes(16385) }] }],
] as const)("rejects oversized %s", (_name, payload) => {
  expect(encoder.encode(JSON.stringify(payload)).byteLength).toBeGreaterThan(0)
  expect(() => validateDelegationPayload(payload)).toThrow(expect.objectContaining({ code: "payload_too_large" }))
})

test("accepts every exact field boundary", () => {
  const payload = { type: "question" as const, questions: [{ header: bytes(128), question: bytes(4096), options: Array.from({ length: 16 }, () => ({ label: bytes(256), description: bytes(1024) })), allowCustom: true, customAnswer: bytes(16384) }] }
  expect(validateDelegationPayload(payload).type).toBe("question")
})

test("counts UTF-8 bytes rather than code points", () => {
  const payload = { type: "question" as const, questions: [{ header: "H", question: "é".repeat(2049), options: [], allowCustom: false }] }
  expect(() => validateDelegationPayload(payload)).toThrow(expect.objectContaining({ code: "payload_too_large" }))
})
```

- [ ] **Step 2: Create total-size and branch-path tests.**

```ts
test.each([
  ["serialized outcome", { serializedBytes: 65537, branchPathLength: 1 }],
  ["branch path", { serializedBytes: 100, branchPathLength: 17 }],
] as const)("rejects oversized %s", (_name, input) => {
  expect(() => validateOutcomeEnvelope(input)).toThrow(expect.objectContaining({ code: "bound_exceeded" }))
})

test("accepts exact outcome and branch path bounds", () => {
  expect(validateOutcomeEnvelope({ serializedBytes: 65536, branchPathLength: 16 })).toEqual({ serializedBytes: 65536, branchPathLength: 16 })
})
```

Import `validateOutcomeEnvelope(input: { serializedBytes: number; branchPathLength: number }): typeof input` from `payload.ts`; it rejects only values above the limits.

- [ ] **Step 3: Create sanitizer mapping and raw-content tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/sanitizer-${crypto.randomUUID()}.sqlite`, workers: 1 })
})
afterEach(async () => fixture.close())

test.each([
  ["missing", null, "sanitizer_unavailable"],
  ["throw", async () => { throw new Error("raw-secret-throw") }, "sanitizer_failed"],
  ["unredactable", async () => ({ status: "unredactable_secret", code: "unredactable_secret" } as const), "sanitizer_rejected"],
  ["invalid", async () => ({ status: "sanitized", payload: { type: "permission", permission: 42 } } as never), "sanitizer_rejected"],
] as const)("persists sanitizer %s as safe internal_error %s", async (_name, hook, code) => {
  fixture.setSanitizer(hook)
  const seeded = await seedOutcomeContext(fixture)
  const terminal = await fixture.createOutcome(Object.assign({}, seeded.input, { candidate: { type: "permission", permission: "bash", pattern: "raw-secret-value", description: "raw-secret-description" } }))
  expect(terminal).toMatchObject({ kind: "internal_error", errorCode: code, branchID: seeded.input.origin.branchID })
  const rows = await fixture.dbRows("delegation_outcome")
  expect(rows).toHaveLength(1)
  const observable = JSON.stringify({ rows, logs: await fixture.logs(), events: await fixture.events() })
  expect(observable).toContain('"type":"internal_error"')
  expect(observable).toContain('"message":"Delegated interaction could not be transferred."')
  expect(observable).not.toContain("raw-secret")
})

test("oversize multibyte payload persists payload_too_large without invoking the sanitizer", async () => {
  let sanitizerCalls = 0
  fixture.setSanitizer(async (input) => {
    sanitizerCalls += 1
    return { status: "sanitized", payload: input.payload }
  })
  const seeded = await seedOutcomeContext(fixture)
  const terminal = await fixture.createOutcome(Object.assign({}, seeded.input, {
    candidate: { type: "question", questions: [{ header: "H", question: "é".repeat(2049), options: [], allowCustom: false }] },
  }))
  expect(terminal).toMatchObject({ kind: "internal_error", errorCode: "payload_too_large" })
  expect(sanitizerCalls).toBe(0)
  const durable = JSON.stringify(await fixture.dbRows("delegation_outcome"))
  expect(durable).toContain("Delegated interaction could not be transferred.")
  expect(durable).not.toContain("é")
})

test("stale ownership fence rejects createOutcome without writing a terminal", async () => {
  fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload }))
  const seeded = await seedOutcomeContext(fixture)
  const stale = Object.assign({}, seeded.input, { origin: Object.assign({}, seeded.input.origin, { branchFencingToken: seeded.input.origin.branchFencingToken - 1 }) })
  await expect(fixture.createOutcome(stale)).rejects.toMatchObject({ code: "stale_branch" })
  expect(await fixture.dbRows("delegation_outcome")).toEqual([])
})

test("persists only sanitized payload and publishes IDs only", async () => {
  fixture.setSanitizer(async () => ({ status: "sanitized", payload: { type: "permission", permission: "bash", pattern: "[redacted]", description: "safe" } }))
  const seeded = await seedOutcomeContext(fixture)
  const terminal = await fixture.createOutcome(seeded.input)
  const rows = await fixture.dbRows("delegation_outcome")
  expect(JSON.stringify(rows)).toContain("[redacted]")
  expect(JSON.stringify(rows)).not.toContain("raw-secret")
  expect(await fixture.events()).toEqual([{ type: "delegation.outcome.ready", outcomeID: terminal.outcomeID, branchID: seeded.input.origin.branchID, ownerExecutionID: seeded.input.rootOwnerExecution.executionID }])
})
```

- [ ] **Step 4: Add the complete outcome fixture helper.**

```ts
async function seedOutcomeContext(fixture: ReturnType<typeof createDelegationFixture>): Promise<{ input: CreateOutcomeInput }> {
  await fixture.seedRootSession("root_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const rootOwnerExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: rootOwnerExecution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  return {
    input: {
      idempotencyKey: `outcome-${crypto.randomUUID()}`,
      kind: "permission_handoff",
      errorCode: null,
      origin: acknowledged.branch,
      rootOwnerExecution,
      branchPath: [acknowledged.branch.branchID],
      candidate: { type: "permission", permission: "bash", pattern: "raw-secret-value", description: "raw-secret-description" },
      delivery: "foreground",
    },
  }
}
```

- [ ] **Step 5: Create duplicate idempotency test.**

```ts
test("returns the existing outcome for a duplicate idempotency key", async () => {
  fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload }))
  const seeded = await seedOutcomeContext(fixture)
  const first = await fixture.createOutcome(seeded.input)
  const second = await fixture.createOutcome(seeded.input)
  expect(second).toEqual(first)
  expect(await fixture.dbRows("delegation_outcome")).toHaveLength(1)
})
```

- [ ] **Step 6: Create production plugin-host sanitizer tests.**

In `packages/opencode/test/plugin/delegation-sanitizer.test.ts`:

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { DelegationSanitizerPluginTestAdapter } from "../../../src/plugin/index"

let adapter: ReturnType<typeof DelegationSanitizerPluginTestAdapter.make>
beforeEach(() => {
  adapter = DelegationSanitizerPluginTestAdapter.make()
})
afterEach(async () => adapter.close())

test("invokes delegation.sanitize exactly once before persistence", async () => {
  let calls = 0
  await adapter.start({
    plugin: {
      "delegation.sanitize": async (input) => {
        calls += 1
        expect(input.payload).toMatchObject({ type: "permission", pattern: "raw-sentinel" })
        return { status: "sanitized", payload: { type: "permission", permission: "bash", pattern: "[redacted]", description: "safe" } }
      },
    },
  })
  const terminal = await adapter.createOutcomeCandidate({ type: "permission", permission: "bash", pattern: "raw-sentinel", description: "raw-sentinel" })
  expect(calls).toBe(1)
  expect(terminal).toMatchObject({ kind: "permission_handoff", errorCode: null })
  const persisted = JSON.stringify(await adapter.persistedOutcomes())
  expect(persisted).toContain("[redacted]")
  expect(persisted).not.toContain("raw-sentinel")
})

test("maps a missing delegation.sanitize hook to a fixed safe terminal", async () => {
  await adapter.start({ plugin: {} })
  const terminal = await adapter.createOutcomeCandidate({ type: "permission", permission: "bash", pattern: "raw-sentinel", description: "raw-sentinel" })
  expect(terminal).toMatchObject({ kind: "internal_error", errorCode: "sanitizer_unavailable" })
  const observable = JSON.stringify({ outcomes: await adapter.persistedOutcomes(), logs: await adapter.logs(), events: await adapter.events() })
  expect(observable).toContain("Delegated interaction could not be transferred.")
  expect(observable).not.toContain("raw-sentinel")
})
```

- [ ] **Step 6b: Append branch-handoff and runner-handoff coverage.** The first test of each block was moved here from Task 10 because it calls `fixture.createOutcome`, which this task owns; the second test of each block pins the 2026-10-08 (Holden) `handoff`-state resume decision (Task 3 open-branch index) and is here for the same reason. No test installs a sanitizer, so `createOutcome` returns `internal_error` / `sanitizer_unavailable`; the assertions are about branch state, and Step 8's outcome transaction must move the origin `running` branch to `handoff` for every outcome kind (Task 20 later extends this to every `running` branch on the path).

Append these three tests verbatim to `packages/core/test/delegation-branch.test.ts` (Task 10), at top level. The third pins the 2026-10-08 (Holden) closed-branch rule's `handoff` half (Task 10 Interfaces; Task 10 Step 2 pins the terminal half). They reuse that file's top-level `fixture` and `beforeEach` (seeds `root_a`, `child_a`, registers `worker_a`/`epoch_a` and the core participant) and its `runningBranch()` helper, plus `fixture.currentExecution` (Task 5), `fixture.dbRows` (Task 3) and `fixture.reserveBranch` / `fixture.bindBranch` / `fixture.branchState` / `fixture.acknowledgeHandoff` (Task 10).

```ts
test("handoff does not retire before outcome acknowledgement", async () => {
  const branch = await runningBranch()
  const execution = await fixture.currentExecution({ sessionID: "root_a" })
  const terminal = await fixture.createOutcome({ idempotencyKey: "handoff_a", kind: "question_handoff", errorCode: null, origin: branch, rootOwnerExecution: execution, branchPath: [branch.branchID], candidate: { type: "question", questions: [{ header: "Choice", question: "Pick one", options: [{ label: "A", description: "First" }], allowCustom: false }] }, delivery: "foreground" })
  expect(await fixture.branchState(branch.branchID)).toBe("handoff")
  await fixture.acknowledgeHandoff({ branch, outcomeID: terminal.outcomeID })
  expect(await fixture.branchState(branch.branchID)).toBe("retired")
})

// Decided 2026-10-08 (Holden): a resume of a child whose branch is in handoff binds a NEW branch;
// the handoff branch and its pending outcome are untouched and still retire through acknowledgement.
test("a child whose branch is in handoff binds to a new branch and acknowledging the old outcome retires only the old branch", async () => {
  const old = await runningBranch()
  const execution = await fixture.currentExecution({ sessionID: "root_a" })
  const terminal = await fixture.createOutcome({ idempotencyKey: "handoff_resume_a", kind: "question_handoff", errorCode: null, origin: old, rootOwnerExecution: execution, branchPath: [old.branchID], candidate: { type: "question", questions: [{ header: "Choice", question: "Pick one", options: [{ label: "A", description: "First" }], allowCustom: false }] }, delivery: "foreground" })
  expect(await fixture.branchState(old.branchID)).toBe("handoff")
  const oldRow = (await fixture.dbRows("delegation_branch")).find((row) => row.branch_id === old.branchID)
  expect(oldRow).toBeDefined()
  const reserve = () => fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const next = await fixture.bindBranch({ branch: (await reserve()).branch, childSessionID: "child_a" })
  expect(next.branch.branchID).not.toBe(old.branchID)
  expect((await fixture.dbRows("delegation_branch")).find((row) => row.branch_id === old.branchID)).toEqual(oldRow)
  const third = await reserve()
  await expect(fixture.bindBranch({ branch: third.branch, childSessionID: "child_a" })).rejects.toMatchObject({ code: "child_session_conflict" })
  await fixture.acknowledgeHandoff({ branch: old, outcomeID: terminal.outcomeID })
  expect(await fixture.branchState(old.branchID)).toBe("retired")
  expect(await fixture.branchState(next.branch.branchID)).toBe("registered")
})

// Decided 2026-10-08 (Holden): handoff is not terminal. fail on a handoff branch answers
// invalid_branch_state (never branch_already_terminal), writes nothing, and the pending outcome
// still retires the branch through acknowledgement.
test("fail on a handoff branch rejects with invalid_branch_state and leaves the outcome pending", async () => {
  const branch = await runningBranch()
  const execution = await fixture.currentExecution({ sessionID: "root_a" })
  const terminal = await fixture.createOutcome({ idempotencyKey: "handoff_fail_a", kind: "question_handoff", errorCode: null, origin: branch, rootOwnerExecution: execution, branchPath: [branch.branchID], candidate: { type: "question", questions: [{ header: "Choice", question: "Pick one", options: [{ label: "A", description: "First" }], allowCustom: false }] }, delivery: "foreground" })
  expect(await fixture.branchState(branch.branchID)).toBe("handoff")
  const before = await fixture.dbRows("delegation_branch")
  await expect(fixture.failBranch({ branch, errorCode: "tool_failed" })).rejects.toMatchObject({ code: "invalid_branch_state" })
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
  await fixture.acknowledgeHandoff({ branch, outcomeID: terminal.outcomeID })
  expect(await fixture.branchState(branch.branchID)).toBe("retired")
})
```

Append these two tests verbatim inside the existing `describe("runner branch start", ...)` block of `packages/core/test/delegation-runner.test.ts` (Task 10 Step 2b), after its last test. They reuse the describe-scoped `fixture`, `worker` and `rootExecution` set by that block's `beforeEach`, and its `acknowledgedBranch()` helper, plus `fixture.startBranch`, `fixture.branchState`, `fixture.runSessionTurn` and `fixture.modelStreamsOpened` (Task 10) and `fixture.dbRows` (Task 3). Change that file's `import { createDelegationFixture } from "./fixture/delegation"` to `import { createDelegationFixture, expectDelegationCode } from "./fixture/delegation"`; Task 10 leaves `expectDelegationCode` out because no Task 10 runner case uses it.

```ts
  test("a bound branch in handoff blocks acquisition with invalid_branch_state before any model stream", async () => {
    const branch = await acknowledgedBranch()
    await fixture.startBranch({ branch })
    await fixture.createOutcome({ idempotencyKey: "runner_handoff_a", kind: "question_handoff", errorCode: null, origin: branch, rootOwnerExecution: rootExecution, branchPath: [branch.branchID], candidate: { type: "question", questions: [{ header: "Choice", question: "Pick one", options: [{ label: "A", description: "First" }], allowCustom: false }] }, delivery: "foreground" })
    expect(await fixture.branchState(branch.branchID)).toBe("handoff")
    const before = await fixture.dbRows("delegation_branch")
    try {
      await fixture.runSessionTurn({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
      throw new Error("runner acquisition for a handoff branch unexpectedly succeeded")
    } catch (error) {
      expectDelegationCode(error, "invalid_branch_state")
    }
    expect(await fixture.dbRows("delegation_branch")).toEqual(before)
    expect(await fixture.modelStreamsOpened("child_a")).toBe(0)
  })

  test("a newer acknowledged branch of a child whose older branch is in handoff starts, and the handoff branch is left alone", async () => {
    const old = await acknowledgedBranch()
    await fixture.startBranch({ branch: old })
    await fixture.createOutcome({ idempotencyKey: "runner_handoff_resume_a", kind: "question_handoff", errorCode: null, origin: old, rootOwnerExecution: rootExecution, branchPath: [old.branchID], candidate: { type: "question", questions: [{ header: "Choice", question: "Pick one", options: [{ label: "A", description: "First" }], allowCustom: false }] }, delivery: "foreground" })
    expect(await fixture.branchState(old.branchID)).toBe("handoff")
    const next = await acknowledgedBranch()
    expect(next.branchID).not.toBe(old.branchID)
    await fixture.runSessionTurn({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
    expect(await fixture.branchState(next.branchID)).toBe("running")
    expect(await fixture.branchState(old.branchID)).toBe("handoff")
    expect(await fixture.modelStreamsOpened("child_a")).toBe(1)
  })
```

Before appending, confirm the reused helpers exist. From `packages/core`: `grep -n "async function runningBranch" test/delegation-branch.test.ts` and `grep -n "async function acknowledgedBranch\|let rootExecution\|let worker" test/delegation-runner.test.ts`. Expected: each prints at least one line; if one prints nothing, Task 10 is incomplete and must be fixed first.

- [ ] **Step 7: Run RED.**

From `packages/core`: `bun test test/delegation-payload.test.ts test/delegation-outcome.test.ts test/delegation-sanitizer.test.ts test/delegation-branch.test.ts test/delegation-runner.test.ts`.

From `packages/opencode`: `bun test test/plugin/delegation-sanitizer.test.ts`.

Expected: FAIL because payload validation, plugin-host sanitizer dispatch, safe mapping, and outcome persistence are absent. The five Step 6b handoff cases fail because the outcome service is absent, so `fixture.createOutcome` does not yet move the branch to `handoff`; Task 10's other branch and runner cases stay green. Against a Task 10 that answered `branch_already_terminal` for `handoff` too, the handoff-fail case would still fail after Step 8 on the `code` match. Against a Task 3 index that excluded only `retired`, the two `handoff`-resume cases would still fail after Step 8, with `child_session_conflict` on the second bind; with the open-branch index they pass.

- [ ] **Step 8: Implement the concrete pipeline and plugin hook.** Allowlist candidate fields and count UTF-8 bytes before hook invocation. Convert oversize input to the fixed `internal_error/payload_too_large` terminal. Add optional hook key `"delegation.sanitize"?: DelegationSanitizeHook` to both plugin contexts. Invoke the trusted sanitizer when the candidate is in bounds; convert missing, thrown, unredactable, and schema-invalid results to their fixed safe internal-error terminals. Open one immediate transaction only after a valid sanitized payload or fixed safe payload exists, and publish only IDs after commit. Reject only fence, ownership, or database errors. `DelegationSanitizerPluginTestAdapter.make` is test-only and composes the production plugin host with the Task 11 fixture; it contains no independent dispatch, mapping, or persistence logic.

- [ ] **Step 9: Run GREEN.**

From `packages/core`: `bun test test/delegation-payload.test.ts test/delegation-outcome.test.ts test/delegation-sanitizer.test.ts test/delegation-branch.test.ts test/delegation-runner.test.ts && bun run typecheck`

From `packages/plugin`: `bun run test && bun run typecheck`

From `packages/opencode`: `bun test test/plugin/delegation-sanitizer.test.ts && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 10: Commit.**

```bash
git add packages/core/src/delegation/payload.ts packages/core/src/delegation/terminal.ts packages/core/src/delegation/outcome.ts packages/core/src/delegation/event.ts packages/core/src/delegation/sanitizer.ts packages/core/test/fixture/delegation.ts packages/plugin/src/index.ts packages/plugin/src/v2/effect/context.ts packages/core/src/plugin/host.ts packages/opencode/src/plugin/index.ts packages/core/test/delegation-payload.test.ts packages/core/test/delegation-outcome.test.ts packages/core/test/delegation-sanitizer.test.ts packages/core/test/delegation-branch.test.ts packages/core/test/delegation-runner.test.ts packages/opencode/test/plugin/delegation-sanitizer.test.ts
git commit -m "feat(core): sanitize and persist delegation outcomes"
```

### Task 12: Effect HttpApi controller and owner-scoped outcome transport

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Recovery authorization (2026-10-12, Holden): Accept risk and resume this same plan in place with `resume: true` in `/home/dev/projects/opencode-delegation`. The prior run `plan-run-10-12T20-13-15-9lo` still records running at Task 12 blocked -> deep with 33/33 agents; this is NOT success. Holden verified old owned TUI PID 807585 is gone (`/proc/807585/status` not found); the previous deep child registry lists it finished. Broad process inventory was denied, and Holden explicitly accepts residual concurrent-writer uncertainty. Do not retry `ps`/`ss` through workarounds or launch overlapping writer workflows. Preserve and reconcile all 16 dirty paths as UNACCEPTED partial Task 12 work, never completed implementation; their archive is `/home/dev/.local/state/delegation-plan-series/plan-backups/task12-dirty-2026-10-12T2059Z.tar.gz` with verified SHA256 `e2e3bf40ce9420f239cde8d82a2cdea402113c8c927bcba613d966388071d241`. Do not reset, discard, or overwrite these changes blindly. Establish RED-first regression evidence for the preserved implementation, then require focused transport/owner/security/atomicity proof, package typechecks, full suites, and independent review before Task 12 acceptance or Tasks 13-26. Preserve numeric-loopback listener provenance, attached-controller authoritative root ownership, source `local_build` refusal, and the handler-owned single immediate transaction through `Outcome.resolve`. Keep `bun run generate` and Task 13 client-generated outputs out of Task 12 unless a concrete dependency is proved and ownership reconciled. On an actual unresolvable security/API blocker, stop `NEEDS_CONTEXT`; never bypass a gate.

> Recovery addendum (2026-10-12 22:46 UTC): run `plan-run-10-12T21-49-57-xk3` produced no Task 12 result -- its implementer died mid-work at 22:28:37 on a gateway `400 unknown_model` outage (fixed 22:34) and every later task was swept with empty reports and zero commits. Task 12 is NOT started-as-accepted: re-run it fresh against the dirty tree. Since the 20:59 archive, `packages/opencode/test/server/delegation-controller.test.ts` and `packages/core/test/delegation-outcome.test.ts` carry further edits from the 21:50 implementer; treat them as unaccepted too. The full suites for this task must include the four delegation routes (acquire, renew, release, outcome) in the `test:httpapi` coverage (reported missing there as of 22:46 -- verify, and add them if absent) rather than relying on a separate file nobody runs. Commit only when every gate above passes.

**Files:**
- Create: `packages/protocol/src/groups/delegation.ts`
- Modify: `packages/protocol/src/api.ts`
- Create: `packages/opencode/src/server/routes/instance/httpapi/handlers/delegation.ts`
- Create: `packages/opencode/src/server/routes/instance/httpapi/middleware/delegation-transport.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/api.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/server.ts`
- Modify: `packages/opencode/src/server/server.ts`
- Modify: `packages/opencode/test/server/httpapi-layer.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Modify: `packages/core/src/delegation/controller.ts`
- Modify: `packages/core/src/delegation/outcome.ts`
- Create: `packages/core/test/delegation-controller.test.ts`
- Modify: `packages/core/test/delegation-outcome.test.ts`
- Modify: `packages/opencode/test/server/delegation-controller.test.ts`
- Create: `packages/opencode/test/server/delegation-outcome-owner.test.ts`
- Create: `packages/opencode/test/server/delegation-nonlocal-child.ts`

**Interfaces:**
- Adds Effect HttpApi endpoints `delegation.controller.acquire`, `delegation.controller.renew`, `delegation.controller.release`, and `delegation.outcome.get`.
- `packages/protocol/src/api.ts` imports and adds `DelegationGroup` in `makeApiFromGroup`, so `makeDefaultApi` and therefore `ClientApi` include the delegation group. The existing `ServerApi` is already added to `OpenCodeHttpApi`; do not duplicate the delegation group in `InstanceHttpApi`.
- The opencode `delegationHandlers` layer is registered with `HttpApiBuilder.group(Api, "server.delegation", ...)` in `serverRoutes`, alongside the existing `@opencode-ai/server/handlers`; it does not go in `instanceApiRoutes`. Reuse the existing server auth and schema layers. Keep the handler at `packages/opencode/src/server/routes/instance/httpapi/handlers/delegation.ts`; do not relocate it to `packages/server` or duplicate the group in `InstanceHttpApi`.
- `HttpApiApp.createRoutes(corsOptions?: CorsOptions, replacements: LayerNode.Replacements = [], listenerBind: ListenerBind = "unbound")` preserves the existing first `corsOptions` parameter, passes `replacements` directly to `AppNodeBuilderV1.build(app, replacements)`, and builds the merged routes with `serverRoutes(listenerBind)`. `serverRoutes` receives the explicit typed bind policy and provides only its `DelegationTransport` tag at the appropriate inner layer, retaining existing server auth/schema layers. `listenerLayer` derives `listenerBind` from the same listener's `opts.hostname` and calls `createRoutes(opts, [], listenerBindPolicy(opts.hostname))`; bare or in-process `createRoutes()` defaults to `unbound`. `fixtureHttpApiLayer(replacements, listenerBind)` is the only unit-test caller allowed to supply a fake policy. This seam is test-only graph injection plus a typed route-construction argument, never an HTTP/header/environment override or a `testMode` switch.
- `createDelegationFixture()` owns one production `DelegationRuntime.layerWith` over its database and owned Scope when started with `httpRuntime: true`. Its `routeReplacements(): LayerNode.Replacements` maps `Database.node`, `DelegationWorker.node`, and `DelegationRuntime.node` to that same fixture-owned database, Worker, and runtime service, so route handlers and fixture seeding observe one graph. The cumulative fixture interface adds `runtime(): { current(): WorkerFence; buildID: string; coordinationDomain: string }`, `refreshParticipants(now: number): Promise<void>`, and `provideProductionServices`, a typed bound function `(effect) => Effect.provide(effect, fixtureServicesContext)` (with the generic effect/environment types inferred or written to match the repository's Effect version). The helper exposes the fixture-owned production service Context for DIRECT internal service calls in later tasks, including Tasks 14 and 20; it works whether or not `httpRuntime` is enabled. Do not use it as test HTTP route injection: `createRoutes` hard-provides the graph and would shadow the helper. HTTP exclusively uses `fixture.routeReplacements()`. `runtime().current()` reads `Effect.runSync(Ref.get(...))` from the production `runtime.current()` method (which returns `Effect<WorkerFence>`); it never makes a random Worker. `registerParticipant` caches the seeded core, guard, and broker_hud descriptors. `refreshParticipants(now)` re-registers/upserts exactly those cached descriptors through the fixture's existing production participant service, with `runtime().current()`, `runtime().coordinationDomain`, their unchanged capabilities and buildIDs, and the supplied `now`; it does not use a fake clock, bypass, or nonexistent `heartbeatParticipant`. `fixture.cleanup()` closes any runtime and its heartbeat before closing/removing the fixture database. With `httpRuntime: true`, construct production `DelegationRuntime.layerWith({ databasePath: filename })` over the fixture's same Database/Worker/Execution service Context and owned Scope, and close that Scope/runtime and heartbeat before closing/removing the database. Without it, preserve existing deterministic manually registered Worker state. Do not mock the runtime, independently register a Worker, or create a second database.
- Declares a closed `ControllerAcquireError` union: tagged `ControllerConflict` (409), payload-free `{ code: "local_build" }` (409), payload-free `{ code: "acquisition_disabled" }` (403), and payload-free `{ code: "acquisition_precondition" }` (409). Acquisition maps the core observer result to a failed/thrown declared `ControllerConflict`; no 409 is a successful client return. It maps `participant_unavailable`, `protocol_mismatch`, `build_mismatch`, `root_not_found`, and `root_not_parentless` from the real controller service to the one fixed `acquisition_precondition` category; it maps `acquisition_disabled` and `local_build` to their same-named categories. No other acquisition failure is emitted, and no acquisition failure returns a token.
- Initial compatibility transport is numeric-loopback-only: acquire, renew, release, and outcome lookup require a real Node listener whose server-owned `opts.hostname` is exactly `127.0.0.1` or `::1`. An SSH tunnel to that listener is permitted. Remote HTTPS and reverse-proxy forwarding fail closed as `insecure_transport`, including `X-Forwarded-Proto: https`, `X-Forwarded-For: 127.0.0.1`, `Host: localhost`, and local-looking `Origin` spoofing. `localhost` is not numeric-loopback proof, and a positive loopback test alone does not prove production listener provenance. Acquisition retains existing configured Basic Auth, rejects `auth_token` query and cross-origin browser requests, returns `AttachedControllerAcquireResult`, and uses typed `409` observer data. Basic Auth bootstraps acquisition but is not a controller lease credential.
- Controller acquisition carries its input in the JSON body and uses Basic Auth plus trusted transport metadata; renew/release use their path and JSON body with dedicated controller headers.
- Renew, release, and outcome lookup require Basic Auth plus `X-OpenCode-Delegation-Protocol`, `X-OpenCode-Controller-ID`, and `X-OpenCode-Controller-Token`. Basic Auth alone is insufficient.
- Outcome lookup uses POST with `outcomeID` in the path, complete `BranchFence` and `ExecutionFence` in JSON body, and controller auth in dedicated headers; it never puts owner fences in query parameters. The request carries no trusted root or lease ID: after decoding, it first requires the body branch and execution fences to name one root, then obtains the authoritative root only from the attached controller lease selected by its controller ID and Worker fence. A body root that differs from that authoritative root, any branch other than the outcome's outermost branch (`branchPath[0]`), or any execution other than its `rootOwnerExecutionID`, receives `403 { code: "wrong_owner" }` with no payload.
- `DelegationTransport` is an internal Effect Context tag carrying only the typed `listenerBind: "127.0.0.1" | "::1" | "non_loopback" | "unbound"`; production route construction supplies it from `listenerBind`. `packages/opencode/src/server/server.ts` owns the conversion from actual Node listener `opts.hostname`: exact numeric loopback values become themselves, any other bind becomes `non_loopback`; the in-process `Server.Default().app.fetch` and bare `createRoutes()` use `unbound` and therefore deny. `listenerLayer` derives this policy while it creates routes with `opts`, and `serverLayer` binds that same `opts.hostname`; no handler reads scheme or peer address, and `HttpRouter.toWebHandler` socket metadata is not treated as available or trustworthy. Middleware reads `Origin` from the actual request only to refuse cross-origin; it never comes from route construction and never grants access. A fake policy is permitted only as the explicit second argument of `fixtureHttpApiLayer` for unit route-policy cases; it is not evidence of real-listener provenance. If the production listener boundary cannot provide this exact provenance, stop implementation rather than providing a test-injected substitute.
- The shared required controller header schema is exactly `{ "x-opencode-delegation-protocol": DelegationProtocol, "x-opencode-controller-id": Schema.String, "x-opencode-controller-token": Schema.String }`. `delegation.controller.renew` is `POST /delegation/controller/renew`, `delegation.controller.release` is `POST /delegation/controller/release`, and `delegation.outcome.get` is `POST /delegation/outcome/:outcomeID`; all three use those required `headers`. `delegation.controller.acquire` is `POST /delegation/controller/acquire` and uses no controller headers. Its `ControllerAcquireError` is the complete declared closed error union, including `ControllerConflict` at HTTP 409 and the payload-free acquisition failures above. Outcome lookup declares `OutcomeLookupError`: `OutcomeOwnerError` (403) plus the closed controller-validation errors `invalid_controller_token` (401), `wrong_worker` (403), and `stale_authority`/`stale_worker` (409). Keep Basic Auth and the existing transport rules.
- Renew and release declare the closed, payload-free wire errors `invalid_controller_token` (401), `wrong_worker` (403), and `stale_authority`/`stale_worker` (409) as `ControllerMutationError`; Basic Auth and transport middleware errors remain separately declared by middleware.
- Add `DelegationController.Interface.validateAttached(input: { worker: WorkerFence; controllerID: string; token: string; now: number }): Effect<{ rootSessionID: string }, ControllerFailure>` and its layer implementation in `packages/core/src/delegation/controller.ts`. It is the read-only authorization primitive for owner outcome lookup, not a renewal shortcut: within the caller's existing database transaction (or in its own read-only transaction when called alone), it verifies the current Worker, then queries attached leases by `controllerID` and that Worker fence, requiring exactly one current match. It must fail closed rather than treating the first row as authoritative when zero or multiple rows match (including a reachable duplicate `controllerID` across roots). Only that selected lease supplies the trusted root. It then verifies the token hash, `armed` state, unexpired time, and applicable protocol, build, and participant-readiness rules. It returns existing closed controller failures, mutates neither lease nor heartbeat, and never exposes the token, lease ID, or root to an HTTP caller. Its focused failing-first tests in `packages/core/test/delegation-controller.test.ts` assert that a valid token returns the trusted root; wrong controller ID or token, revoked/stale/expired lease, and Worker mismatch reject with their closed controller failures; and an injected duplicate controller ID across roots fails closed if the fixture can reach that database state.
- Task 11 deliberately exposes only OutcomeService.create. Task 12 adds OutcomeService.resolve(input: ResolveOutcomeInput): Effect<DelegationOutcomePayload, DelegationOutcomeError> to `packages/core/src/delegation/outcome.ts`, looking up by outcomeID and checking current branch/execution fences, `branchPath[0]`, and `rootOwnerExecutionID` before exposing stored payload. The Controller Interface gains **only** `validateAttached`; do not add `DelegationController.resolveAttachedOutcome`, and do not introduce a Controller-to-Outcome service dependency or cycle. The HTTP owner-lookup handler itself owns the one immediate transaction after schema decode, obtains Database.Service, DelegationController.Service, and DelegationOutcome.Service from the same route `AppNodeBuilder` graph, validates the authoritative root and resolves the outcome in that one Effect/fiber, and commits only after the payload is selected. Invalid token, wrong Worker, and stale authority/Worker map to their declared controller-validation wire errors; a body-root mismatch or any outcome ownership rejection maps to payload-free `wrong_owner`. No denied response contains an outcome payload, controller token, lease ID, or root. Add failing-first service tests for own payload versus wrong branch/execution and the deterministic concurrent-revoke case below, then implement; this is a post-Task11 change and must be reviewed in Task12.
- The repository source process compiles `InstallationBuildID` as `"local"`; it must explicitly assert attached acquisition is denied with `local_build`, never expect HTTP 200. Positive HTTP cases run only in the isolated compile-defined child described in Steps 1--2, launched with Bun's `--define OPENCODE_BUILD_ID=...`. Do not add a runtime build-ID override, write `globalThis.OPENCODE_BUILD_ID`, or mutate `process.env` as a fake build ID.
- Source verification for this task: `packages/opencode/src/server/routes/instance/httpapi/server.ts:295,303-310` builds three independent graphs: `MoveSession.node` with `[[LocationServiceMap.node, locationServiceMapV2]]`, `SessionV2.node` with `[[LocationServiceMap.node, locationServiceMapV2], [SessionExecution.node, SessionExecutionLocal.node]]`, and `app` with none. `SessionV2.node` depends directly on `Database.node` (`packages/core/src/session.ts:474-485`), so app-build replacements alone leave its default/live database graph reachable in tests. Pass the same optional fixture `LayerNode.Replacements` to all three builds, preserving the existing replacements and appending the fixture replacements to each list; production default `[]` leaves all graphs unchanged. Never replace `SessionExecutionLocal.node` or `LocationServiceMap.node` with fixture data. Keep handler/token auth graph shared by fixture routes. The composed-route fixture test must prove fixture-root visibility and prove no default/live DB graph is touched (graph dependency replacement assertions plus the existing route read, or service instrumentation without production `testMode`). If the exact existing session route context cannot be satisfied, document that as an unresolved test concern rather than inventing a route.

- [ ] **Step 1: Create the controller request matrix.**

Extend `packages/opencode/test/server/httpapi-layer.ts` with `fixtureHttpApiLayer(replacements: LayerNode.Replacements, listenerBind: ListenerBind)`, which invokes the same production `createRoutes(undefined, replacements, listenerBind)` route-construction path. This is the sole test-only fake-policy seam for unit route-policy cases; no test provides a `DelegationTransport` layer. Extend the core fixture with `routeReplacements()`, `refreshParticipants(now)`, and `provideProductionServices` as specified in Interfaces. The replacements are the sole route-service injection; the explicit `listenerBind` is not a service replacement and must never be exposed through HTTP. `Database.node`, `DelegationWorker.node`, and `DelegationRuntime.node` must resolve to the fixture's one database, runtime Worker, and production runtime. `provideProductionServices` is for direct internal service calls only, never route injection; HTTP uses only `fixture.routeReplacements()`. Start with `httpRuntime: true` so the production runtime is constructed over the fixture's same Database/Worker/Execution service Context in its owned Scope and registers its own current Worker; `runtime().current()` reads its fence, and cleanup closes the runtime/heartbeat before the database. Do not add a mock runtime, independently register a Worker, or create a second database.

Before the HTTP tests, add focused failing-first tests in `packages/core/test/delegation-controller.test.ts`: a matching attached lease returns its trusted `rootSessionID` without changing its `heartbeatAt`; a wrong controller ID and a changed token reject `invalid_controller_token`; revoked, stale, and expired leases reject their existing closed controller codes; and a different Worker fence rejects `wrong_worker`. If the focused fixture can insert a duplicate controller ID across two roots, assert that `validateAttached` fails closed rather than selecting either row; if the fixture cannot reach that state because a database uniqueness constraint prevents it, record that constraint in the test. The implementation begins only after this RED command reports those missing `validateAttached` cases: from `packages/core`, `bun test test/delegation-controller.test.ts`.

Before the HTTP tests, add this separate failing-first core test in `packages/core/test/delegation-outcome.test.ts`, using the fixture's same production service Context and database (not a second fixture, mock database, independently provided service Context, or Database observer hook). Seed a valid **nonlocal attached** Worker, lease, and owned outcome using the Task 9 manual Worker fixture with `buildID: "core_build"`; do not use `runtime().current()` as the attached Worker. Create `validated` and `release` `Deferred`s. In one `Effect.gen` program, obtain the production `Database.Service`, `DelegationController.Service`, and `DelegationOutcome.Service`; enter an outer `database.db.transaction(..., { behavior: "immediate" })`; invoke production `controller.validateAttached({ worker, controllerID, token, now })`; complete `validated`; await `release`; then invoke production `outcome.resolve({ outcomeID, branch, ownerExecution: execution })`. Fork that outer transaction. From a separate parent fiber outside the transaction Effect context, await `validated`, start the production revoke for the same lease, and observe that revoke cannot commit before the outer transaction completes. Complete `release`, assert the transaction returns the owned payload, then assert the revoke completes. A later fresh read through `validateAttached` fails stale/revoked with no payload. This is an explicit synchronization algorithm, not a fixture transaction barrier: `validateAttached` and `Outcome.resolve` may each open nested transactions/savepoints. Adapter source `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts:118-150` must be relied on and inspected: it propagates transaction context to nested service Effects and shares the connection, so the outer immediate transaction holds the SQLite lock across validation and resolution. This core test proves nested production service calls and SQLite lock behavior only; it does not prove handler wiring. The RED command is `bun test test/delegation-outcome.test.ts` and must fail before the nested service calls run under the stated outer transaction.

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import type { AttachedControllerAcquireResult } from "@opencode-ai/schema/delegation"
import { ServerAuth } from "../../src/server/auth"
import { ConfigProvider, Effect, Layer } from "effect"
import { createDelegationFixture } from "../../../core/test/fixture/delegation"
import { fixtureHttpApiLayer, request } from "./httpapi-layer"

type RequestCase = Readonly<{
  name: string
  path: string
  headers: Record<string, string>
  listenerBind: ListenerBind
  expectedStatus: number
  expectedCode?: string
}>

type ListenerBind = "127.0.0.1" | "::1" | "non_loopback" | "unbound"

let fixture: ReturnType<typeof createDelegationFixture>
const configProviderLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENCODE_SERVER_PASSWORD: "secret", OPENCODE_SERVER_USERNAME: "opencode" }))
const loopbackListener: ListenerBind = "127.0.0.1"

function basicAuth(): string {
  const value = ServerAuth.header({ username: "opencode", password: "secret" })
  if (!value) throw new Error("expected Basic Auth header")
  return value
}

async function execute(path: string, init: RequestInit, listenerBind: ListenerBind = loopbackListener) {
  return Effect.runPromise(
    request(path, init).pipe(
      Effect.provide(fixtureHttpApiLayer(fixture.routeReplacements(), listenerBind).pipe(Layer.provide(configProviderLayer))),
    ),
  )
}

async function runNonlocalChild(suite: "controller" | "outcome") {
  const child = Bun.spawn([
    "bun", "run", "--define",
    `OPENCODE_BUILD_ID=${JSON.stringify("core-test-build-v1")}`,
    "test/server/delegation-nonlocal-child.ts", suite,
  ], { cwd: import.meta.dir + "/../..", env: process.env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  return { stdout, stderr, exitCode }
}

async function requestController(input: RequestCase): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await execute(input.path, {
    method: "POST",
    headers: Object.assign({ "content-type": "application/json" }, input.headers),
    body: JSON.stringify({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: fixture.runtime().buildID }),
  }, input.listenerBind)
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/http-controller-${crypto.randomUUID()}.sqlite`, workers: 1, httpRuntime: true })
  await fixture.seedRootSession("root_a")
  await fixture.seedRootSession("root_other")
  const runtime = fixture.runtime()
  for (const participant of [{ component: "core" as const, buildID: runtime.buildID, capabilities: ["controllerLeaseV1"] }, { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] }, { component: "broker_hud" as const, buildID: "hud_build", capabilities: ["controllerLeaseV1"] }]) await fixture.registerParticipant({ worker: runtime.current(), coordinationDomain: runtime.coordinationDomain, component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: Date.now() })
})
afterEach(async () => fixture.cleanup())

test.each([
  { name: "query token precedes valid Basic Auth on loopback", path: "/delegation/controller/acquire?auth_token=secret", headers: { authorization: basicAuth() }, listenerBind: loopbackListener, expectedStatus: 400, expectedCode: "invalid_query_auth" },
  { name: "query token precedes missing Basic Auth on loopback", path: "/delegation/controller/acquire?auth_token=", headers: {}, listenerBind: loopbackListener, expectedStatus: 400, expectedCode: "invalid_query_auth" },
  { name: "missing Basic Auth retains precedence on loopback", path: "/delegation/controller/acquire", headers: {}, listenerBind: loopbackListener, expectedStatus: 401, expectedCode: "auth_required" },
  { name: "cross origin is refused on loopback", path: "/delegation/controller/acquire", headers: { authorization: basicAuth(), origin: "https://other.test" }, listenerBind: loopbackListener, expectedStatus: 403, expectedCode: "cross_origin" },
  { name: "remote HTTPS is denied", path: "/delegation/controller/acquire", headers: { authorization: basicAuth(), "x-forwarded-proto": "https" }, listenerBind: "non_loopback", expectedStatus: 403, expectedCode: "insecure_transport" },
  { name: "forwarded-header and localhost spoof is denied", path: "/delegation/controller/acquire", headers: { authorization: basicAuth(), "x-forwarded-proto": "https", "x-forwarded-for": "127.0.0.1", host: "localhost", origin: "https://localhost" }, listenerBind: "non_loopback", expectedStatus: 403, expectedCode: "insecure_transport" },
  { name: "unbound in-process adapter is denied", path: "/delegation/controller/acquire", headers: { authorization: basicAuth() }, listenerBind: "unbound", expectedStatus: 403, expectedCode: "insecure_transport" },
] satisfies readonly RequestCase[])("$name", async (input) => {
  await fixture.refreshParticipants(Date.now())
  const result = await requestController(input)
  expect(result.status).toBe(input.expectedStatus)
  if (input.expectedCode) expect(result.body.code).toBe(input.expectedCode)
})

test("source-mode attached acquisition fails closed as local_build", async () => {
  await fixture.refreshParticipants(Date.now())
  const result = await requestController({ name: "source local", path: "/delegation/controller/acquire", headers: { authorization: basicAuth() }, listenerBind: loopbackListener, expectedStatus: 409 })
  expect(result.status).toBe(409)
  expect(result.body).toEqual({ code: "local_build" })
})

test("compile-defined child proves IPv4, IPv6, renew, and release", async () => {
  const result = await runNonlocalChild("controller")
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("ipv4:200")
  expect(result.stdout).toContain("ipv6:200")
  expect(result.stdout).toContain("renew:200")
  expect(result.stdout).toContain("release:204")
  expect(result.stderr).toBe("")
})

```

Both HTTP suites use `fixture.cleanup()` so fixture cleanup awaits `close()` and removes the SQLite database, WAL, and SHM; any real listener opened by a test is awaited in `finally` even when that test fails.

- [ ] **Step 2: Create owner lookup tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import type { AttachedControllerAcquireResult, BranchFence, ExecutionFence } from "@opencode-ai/schema/delegation"
import { ServerAuth } from "../../src/server/auth"
import { ConfigProvider, Effect, Layer } from "effect"
import { createDelegationFixture } from "../../../core/test/fixture/delegation"
import { fixtureHttpApiLayer, request, startDelegationHttpServer } from "./httpapi-layer"

let fixture: ReturnType<typeof createDelegationFixture>
type ListenerBind = "127.0.0.1" | "::1" | "non_loopback" | "unbound"
const loopbackListener: ListenerBind = "127.0.0.1"
const configProviderLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENCODE_SERVER_PASSWORD: "secret", OPENCODE_SERVER_USERNAME: "opencode" }))

function basicAuth(): string {
  const value = ServerAuth.header({ username: "opencode", password: "secret" })
  if (!value) throw new Error("expected Basic Auth header")
  return value
}

async function execute(path: string, init: RequestInit, listenerBind: ListenerBind = loopbackListener) {
  return Effect.runPromise(
    request(path, init).pipe(
      Effect.provide(fixtureHttpApiLayer(fixture.routeReplacements(), listenerBind).pipe(Layer.provide(configProviderLayer))),
    ),
  )
}

beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/http-outcome-${crypto.randomUUID()}.sqlite`, workers: 1, httpRuntime: true })
  await fixture.seedRootSession("root_a")
  await fixture.seedRootSession("root_other")
  const runtime = fixture.runtime()
  for (const participant of [{ component: "core" as const, buildID: runtime.buildID, capabilities: ["controllerLeaseV1"] }, { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] }, { component: "broker_hud" as const, buildID: "hud_build", capabilities: ["controllerLeaseV1"] }]) await fixture.registerParticipant({ worker: runtime.current(), coordinationDomain: runtime.coordinationDomain, component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: Date.now() })
})
afterEach(async () => fixture.cleanup())

async function runNonlocalChild(suite: "controller" | "outcome") {
  const child = Bun.spawn([
    "bun", "run", "--define",
    `OPENCODE_BUILD_ID=${JSON.stringify("core-test-build-v1")}`,
    "test/server/delegation-nonlocal-child.ts", suite,
  ], { cwd: import.meta.dir + "/../..", env: process.env, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  return { stdout, stderr, exitCode }
}

test("source-mode outcome parent delegates non-local cases to its compile-defined child", async () => {
  const result = await runNonlocalChild("outcome")
  expect(result.exitCode).toBe(0)
  expect(result.stdout).toContain("outcome-own:200")
  expect(result.stdout).toContain("outcome-cross-root:wrong_owner")
  expect(result.stderr).toBe("")
})
```

`packages/opencode/test/server/delegation-nonlocal-child.ts` is compiled in a fresh Bun process with `OPENCODE_BUILD_ID="core-test-build-v1"` before it imports any fixture or HTTP helper. It imports `createDelegationFixture`, `startDelegationHttpServer`, and the HTTP request helpers only after that compile definition; it starts real listeners for `127.0.0.1` and `::1`, acquires/renews/releases through the real IPv4 listener, and seeds then reads the owner outcome through that listener. It retains rejection/owner cases there too: missing Basic Auth, Basic-only headers, cross-root, cross-branch, and cross-execution all assert the closed code and `not.toHaveProperty("payload")`. It writes only fixed status/code markers (`ipv4:200`, `ipv6:200`, `renew:200`, `release:204`, `outcome-own:200`, `outcome-cross-root:wrong_owner`) after assertions; it never prints acquisition bodies, controller tokens, or denied payloads. Its one `try/finally` always awaits every listener close and `fixture.cleanup()`, which removes the SQLite database and sidecars; it never changes `HOME` or any XDG environment variable.

```ts
// packages/opencode/test/server/delegation-nonlocal-child.ts
import assert from "node:assert/strict"
import type { AttachedControllerAcquired, BranchFence, ExecutionFence } from "@opencode-ai/schema/delegation"
import { ServerAuth } from "../../src/server/auth"
import { ConfigProvider } from "effect"
import { createDelegationFixture } from "../../../core/test/fixture/delegation"
import { startDelegationHttpServer } from "./httpapi-layer"

const suite = process.argv.at(-1)
const fixture = createDelegationFixture()
const listeners: Array<{ close(): Promise<void>; port: number }> = []
const configProviderLayer = ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENCODE_SERVER_PASSWORD: "secret", OPENCODE_SERVER_USERNAME: "opencode" }))

type SeededOutcome = Readonly<{
  outcomeID: string
  branch: BranchFence
  ownerExecution: ExecutionFence
}>

function basicAuth(): string {
  const value = ServerAuth.header({ username: "opencode", password: "secret" })
  if (!value) throw new Error("expected Basic Auth header")
  return value
}

async function acquire(origin: string, rootSessionID: string): Promise<AttachedControllerAcquired> {
  await fixture.refreshParticipants(Date.now())
  const response = await fetch(`${origin}/delegation/controller/acquire`, {
    method: "POST",
    headers: { authorization: basicAuth(), "content-type": "application/json" },
    body: JSON.stringify({ rootSessionID, protocol: "opencode.delegation/v1", buildID: fixture.runtime().buildID }),
  })
  assert.equal(response.status, 200)
  const controller = (await response.json()) as AttachedControllerAcquired
  assert.equal(controller.state, "acquired")
  return controller
}

function controllerHeaders(controller: AttachedControllerAcquired, authenticated = true): Headers {
  const headers = new Headers({
    "content-type": "application/json",
    "x-opencode-delegation-protocol": "opencode.delegation/v1",
    "x-opencode-controller-id": controller.controllerID,
    "x-opencode-controller-token": controller.token,
  })
  if (authenticated) headers.set("authorization", basicAuth())
  return headers
}

async function renew(origin: string, controller: AttachedControllerAcquired): Promise<Response> {
  return fetch(`${origin}/delegation/controller/renew`, {
    method: "POST",
    headers: controllerHeaders(controller),
    body: JSON.stringify({ leaseID: controller.leaseID, authorityEpoch: controller.authorityEpoch }),
  })
}

async function release(origin: string, controller: AttachedControllerAcquired): Promise<Response> {
  return fetch(`${origin}/delegation/controller/release`, {
    method: "POST",
    headers: controllerHeaders(controller),
    body: JSON.stringify({ leaseID: controller.leaseID, authorityEpoch: controller.authorityEpoch }),
  })
}

async function seedOwnedOutcome(): Promise<SeededOutcome> {
  fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload }))
  await fixture.seedChildSession("child_a", "root_a")
  const runtime = fixture.runtime()
  const ownerExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker: runtime.current(), now: Date.now() })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: runtime.buildID, protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  const terminal = await fixture.createOutcome({ idempotencyKey: `outcome-owner-${crypto.randomUUID()}`, kind: "permission_handoff", errorCode: null, origin: acknowledged.branch, rootOwnerExecution: ownerExecution, branchPath: [acknowledged.branch.branchID], candidate: { type: "permission", permission: "bash", pattern: "git status", description: "inspect" }, delivery: "foreground" })
  return { outcomeID: terminal.outcomeID, branch: acknowledged.branch, ownerExecution }
}

async function lookup(origin: string, controller: AttachedControllerAcquired, branch: BranchFence, execution: ExecutionFence, outcomeID: string, authenticated = true): Promise<Response> {
  return fetch(`${origin}/delegation/outcome/${outcomeID}`, {
    method: "POST",
    headers: controllerHeaders(controller, authenticated),
    body: JSON.stringify({ branch, execution }),
  })
}

async function assertDenied(response: Response, code: string): Promise<void> {
  assert.equal(response.status, 403)
  const body = (await response.json()) as Record<string, unknown>
  assert.deepEqual(body, { code })
  assert.equal(Object.hasOwn(body, "payload"), false)
}

try {
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/delegation-nonlocal-${crypto.randomUUID()}.sqlite`, workers: 1, httpRuntime: true })
  await fixture.seedRootSession("root_a")
  await fixture.seedRootSession("root_other")
  const runtime = fixture.runtime()
  for (const participant of [{ component: "core" as const, buildID: runtime.buildID, capabilities: ["controllerLeaseV1"] }, { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] }, { component: "broker_hud" as const, buildID: "hud_build", capabilities: ["controllerLeaseV1"] }]) await fixture.registerParticipant({ worker: runtime.current(), coordinationDomain: runtime.coordinationDomain, component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: Date.now() })
  const ipv4 = await startDelegationHttpServer({ hostname: "127.0.0.1", port: 0, configProviderLayer, replacements: fixture.routeReplacements() })
  listeners.push(ipv4)
  const ipv6 = await startDelegationHttpServer({ hostname: "::1", port: 0, configProviderLayer, replacements: fixture.routeReplacements() })
  listeners.push(ipv6)
  const controller = await acquire(`http://127.0.0.1:${ipv4.port}`, "root_a")
  console.log("ipv4:200")
  const ipv6Controller = await acquire(`http://[::1]:${ipv6.port}`, "root_other")
  assert.notEqual(ipv6Controller.controllerID, controller.controllerID)
  console.log("ipv6:200")
  const renewed = await renew(`http://127.0.0.1:${ipv4.port}`, controller)
  assert.equal(renewed.status, 200)
  console.log("renew:200")
  const released = await release(`http://127.0.0.1:${ipv4.port}`, controller)
  assert.equal(released.status, 204)
  console.log("release:204")
  if (suite === "outcome") {
    const seeded = await seedOwnedOutcome()
    const owner = await acquire(`http://127.0.0.1:${ipv4.port}`, "root_a")
    const own = await lookup(`http://127.0.0.1:${ipv4.port}`, owner, seeded.branch, seeded.ownerExecution, seeded.outcomeID)
    assert.equal(own.status, 200)
    console.log("outcome-own:200")
    const missingBasic = await lookup(`http://127.0.0.1:${ipv4.port}`, owner, seeded.branch, seeded.ownerExecution, seeded.outcomeID, false)
    assert.equal(missingBasic.status, 401)
    const basicOnly = await fetch(`http://127.0.0.1:${ipv4.port}/delegation/outcome/${seeded.outcomeID}`, {
      method: "POST",
      headers: { authorization: basicAuth(), "content-type": "application/json" },
      body: JSON.stringify({ branch: seeded.branch, execution: seeded.ownerExecution }),
    })
    assert.equal(basicOnly.status, 401)
    await assertDenied(await lookup(`http://127.0.0.1:${ipv4.port}`, owner, { ...seeded.branch, rootSessionID: "root_other" }, { ...seeded.ownerExecution, rootSessionID: "root_other" }, seeded.outcomeID), "wrong_owner")
    await assertDenied(await lookup(`http://127.0.0.1:${ipv4.port}`, owner, { ...seeded.branch, branchID: "branch_other" }, seeded.ownerExecution, seeded.outcomeID), "wrong_owner")
    await assertDenied(await lookup(`http://127.0.0.1:${ipv4.port}`, owner, seeded.branch, { ...seeded.ownerExecution, executionID: "execution_other" }, seeded.outcomeID), "wrong_owner")
    console.log("outcome-cross-root:wrong_owner")
  }
} finally {
  await Promise.all(listeners.map((listener) => listener.close()))
  await fixture.cleanup()
}
```

`startDelegationHttpServer({ hostname, port, configProviderLayer, replacements })` is a test-only constructor in `httpapi-layer.ts` that passes only fixture service replacements into the production `packages/opencode/src/server/server.ts` Node listener composition and provides that same per-test `ConfigProvider.layer(ConfigProvider.fromUnknown({ OPENCODE_SERVER_PASSWORD: "secret", OPENCODE_SERVER_USERNAME: "opencode" }))` around the production Node listener layer. The production listener, not this helper, derives `listenerBindPolicy(opts.hostname)` from the same hostname it binds. The helper must not accept or provide a policy, call `app.fetch` or bare `createRoutes()`, provide `DelegationTransport`, or set process-global environment variables. Add direct pure-policy tests for `0.0.0.0` and `localhost` mapping to `non_loopback`; fake route-policy arguments never replace this real-listener proof.

- [ ] **Step 3: Run RED.** Run from `packages/core`: `bun test test/delegation-controller.test.ts test/delegation-outcome.test.ts`; then from `packages/opencode`: `bun test test/server/delegation-controller.test.ts test/server/delegation-outcome-owner.test.ts`. Expected: the focused core tests fail before `validateAttached`/`Outcome.resolve` exist and both parent Bun suites fail because the delegation HttpApi group/compile-defined child path is missing.

- [ ] **Step 4: Edit the query-preserving and route-graph test helpers.** Change `HttpClientRequest.setUrl(url.pathname)` to `HttpClientRequest.setUrl(url.pathname + url.search)` in `httpapi-layer.ts`. In that same helper, implement `fixtureHttpApiLayer(replacements, listenerBind)` through `createRoutes(undefined, replacements, listenerBind)`; it takes the fixture's `LayerNode.Replacements` plus the explicit typed fake policy only for unit route-policy cases, and never installs a separate service context. Apply the same optional fixture replacements to all three independent builds (`MoveSession.node`, `SessionV2.node`, and `app`), preserving `MoveSession`'s existing `LocationServiceMap.node` replacement and both existing `SessionV2.node` replacements, and appending fixture replacements to each list. The production default is `[]`; do not replace `SessionExecutionLocal.node` or `LocationServiceMap.node` with fixture data. In particular, replace `SessionV2.node`'s direct `Database.node` dependency; replacements in `app` alone do not isolate it. The production-listener helper accepts service replacements only and does not accept a policy argument.
- [ ] **Step 5: Define the POST-only Effect HttpApi endpoint schemas and the typed bind-policy boundary.** Use `HttpApiGroup.make("server.delegation")` and `HttpApiEndpoint.post`; annotate stable operation identifiers and define success and closed error schemas from `@opencode-ai/schema/delegation`. Define `ListenerBind` as the closed union and define `DelegationTransport` only as `{ listenerBind: ListenerBind }`, with no request-origin, scheme, or peer-address field. Define a pure `listenerBindPolicy(hostname: string | undefined)` which accepts only exact `127.0.0.1` and `::1`, maps every other defined value (including `localhost`) to `non_loopback`, and maps absent listener context to `unbound`. Middleware must read the actual request `Origin` itself only to refuse cross-origin requests.

```ts
const ControllerHeaders = Schema.Struct({
  "x-opencode-delegation-protocol": DelegationProtocol,
  "x-opencode-controller-id": Schema.String,
  "x-opencode-controller-token": Schema.String,
})

const AcquireControllerBody = Schema.Struct({ rootSessionID: Schema.String, protocol: DelegationProtocol, buildID: Schema.String })
const RenewReleaseBody = Schema.Struct({ leaseID: Schema.String, authorityEpoch: Schema.Number })
const OutcomeLookupBody = Schema.Struct({ branch: BranchFence, execution: ExecutionFence })

const OutcomeOwnerError = Schema.Struct({ code: Schema.Literal("wrong_owner") }).pipe(HttpApiSchema.status(403))
const InvalidControllerTokenError = Schema.Struct({ code: Schema.Literal("invalid_controller_token") }).pipe(HttpApiSchema.status(401))
const WrongWorkerError = Schema.Struct({ code: Schema.Literal("wrong_worker") }).pipe(HttpApiSchema.status(403))
const StaleAuthorityError = Schema.Struct({ code: Schema.Literal("stale_authority", "stale_worker") }).pipe(HttpApiSchema.status(409))
const ControllerMutationError = Schema.Union(InvalidControllerTokenError, WrongWorkerError, StaleAuthorityError)
const LocalBuildError = Schema.Struct({ code: Schema.Literal("local_build") }).pipe(HttpApiSchema.status(409))
const AcquisitionDisabledError = Schema.Struct({ code: Schema.Literal("acquisition_disabled") }).pipe(HttpApiSchema.status(403))
const AcquisitionPreconditionError = Schema.Struct({ code: Schema.Literal("acquisition_precondition") }).pipe(HttpApiSchema.status(409))
const ControllerAcquireError = Schema.Union(ControllerConflict.pipe(HttpApiSchema.status(409)), LocalBuildError, AcquisitionDisabledError, AcquisitionPreconditionError)
const OutcomeLookupError = Schema.Union(OutcomeOwnerError, ControllerMutationError)
export const DelegationGroup = HttpApiGroup.make("server.delegation")
  .add(HttpApiEndpoint.post("delegation.controller.acquire", "/delegation/controller/acquire", {
    payload: AcquireControllerBody,
    success: AttachedControllerAcquired,
    error: ControllerAcquireError,
  }))
  .add(HttpApiEndpoint.post("delegation.controller.renew", "/delegation/controller/renew", {
    headers: ControllerHeaders,
    payload: RenewReleaseBody,
    success: CoreControllerAcquired,
    error: ControllerMutationError,
  }))
  .add(HttpApiEndpoint.post("delegation.controller.release", "/delegation/controller/release", {
    headers: ControllerHeaders,
    payload: RenewReleaseBody,
    success: HttpApiSchema.NoContent,
    error: ControllerMutationError,
  }))
  .add(HttpApiEndpoint.post("delegation.outcome.get", "/delegation/outcome/:outcomeID", {
    headers: ControllerHeaders,
    params: { outcomeID: Schema.String },
    payload: OutcomeLookupBody,
    success: DelegationOutcomePayload,
    error: OutcomeLookupError,
  }))
```

The four endpoint names (`delegation.controller.acquire`, `delegation.controller.renew`, `delegation.controller.release`, `delegation.outcome.get`) are the stable operation identifiers; do not add unsupported annotations unless needed. Map exactly `participant_unavailable`, `protocol_mismatch`, `build_mismatch`, `root_not_found`, and `root_not_parentless` to `acquisition_precondition`; map `acquisition_disabled` and `local_build` to their exact same-named errors. `ControllerMutationError` is the closed union of the exact payload-free wire errors `{ code: "invalid_controller_token" }` with HTTP 401, `{ code: "wrong_worker" }` with HTTP 403, and `{ code: "stale_authority" | "stale_worker" }` with HTTP 409. Basic Auth and transport middleware errors stay separately declared by middleware. The owner wire error is `{ code: "wrong_owner" }` with HTTP 403; the implementation maps an inconsistent branch/execution body root, an authoritative lease root returned by `validateAttached` that differs from that body root, and internal `DelegationOutcomeError` code `wrong_owner` to this payload-free declared 403 wire error. The authoritative root remains internal and is never serialized.

- [ ] **Step 6: Implement auth and fail-closed transport middleware.** Add a delegation-path-only pre-auth guard in `serverRoutes` before the inherited `serverAuthorizationLayer`: for every delegation path, `URL.searchParams.has("auth_token")` (including an empty value) returns declared `400 { code: "invalid_query_auth" }` before any credential decoding. The two parent matrix cases prove ordering with valid Basic and with missing Basic. Keep the existing global `packages/server` authorization/query behavior unchanged for every non-delegation endpoint; do not loosen Basic Auth. After that guard, retain Basic Auth and existing cross-origin checks, consume `DelegationTransport`, and reject every `listenerBind !== "127.0.0.1" && listenerBind !== "::1"` as `{ code: "insecure_transport" }` before controller or outcome service access. Read `Origin` from the actual request only to refuse; never infer trust from it or from `X-Forwarded-*`, `Host`, or URL scheme. If the parent tests cannot demonstrate this route ordering, stop `NEEDS_CONTEXT` rather than changing global authorization behavior.
- [ ] **Step 7: Wire server-owned listener provenance and the approved route-graph seam at the actual Node boundary.** Make `HttpApiApp.createRoutes(corsOptions?: CorsOptions, replacements: LayerNode.Replacements = [], listenerBind: ListenerBind = "unbound")` apply the same optional `replacements` to all three independent builds: `MoveSession.node` with its existing `LocationServiceMap.node` replacement, `SessionV2.node` with its existing `LocationServiceMap.node` and `SessionExecutionLocal.node` replacements, and `app` with no existing replacements. Append fixture replacements to those lists; production defaults to `[]`, leaving all graphs unchanged. `SessionV2.node` directly depends on `Database.node`, so an `app`-only replacement does not isolate it. Never replace `SessionExecutionLocal.node` or `LocationServiceMap.node` with fixture data. In `packages/opencode/src/server/server.ts`, `listenerLayer` must derive its third argument with `listenerBindPolicy(opts.hostname)` from the same `opts.hostname` that `serverLayer` binds, then call `createRoutes(opts, replacements, listenerBindPolicy(opts.hostname))`; production passes no replacements, while `startDelegationHttpServer` may pass fixture service replacements but never a policy. Keep `instanceApiRoutes` and `InstanceHttpApi` unchanged. Keep the handler/token auth graph shared by the fixture. `serverRoutes(listenerBind)` provides only `DelegationTransport` at its appropriate inner layer and reuses existing server auth/schema layers. The in-process/bare-route default is `unbound`. The HTTP fixture test must prove fixture-root visibility through the composed route and that no default/live DB graph is touched, using graph dependency replacement assertions plus the existing route read or service instrumentation without production `testMode`. If the exact existing session route context cannot be satisfied, record that as an explicit unresolved test concern rather than inventing a route. Do not add trusted-proxy configuration, inspect Web Request headers for peer/scheme, manufacture a peer address, add an HTTP/header/environment override, public config, or a production `testMode` switch. If this cannot be wired through the production listener boundary, stop rather than making a fake policy authoritative.
- [ ] **Step 8: Implement controller handlers.** Acquisition calls `acquireAttached` and returns its one-time token only on `AttachedControllerAcquired`; map its observer and every real controller-service precondition failure to the declared `ControllerAcquireError` variants exactly as specified above, never to 500 and never with a token. Renew/release pass the raw header token to the service without logging it. All three handlers rely on the common policy middleware, so the four-operation gate cannot drift.
- [ ] **Step 9: Implement the owner outcome handler and wire POST routes.** After schema decode, require the complete branch and execution fences to name the same body root. The production handler itself obtains `Database.Service`, `DelegationController.Service`, and `DelegationOutcome.Service` from the same route `AppNodeBuilder` graph, then performs the authorization and payload selection in one outer immediate transaction and one Effect/fiber:

  ```ts
  const database = yield* Database.Service
  const controller = yield* DelegationController.Service
  const outcome = yield* DelegationOutcome.Service
  const payload = yield* database.db.transaction(
    () => Effect.gen(function* () {
      const trusted = yield* controller.validateAttached({
        worker: runtime.current(),
        controllerID,
        token,
        now,
      })
      if (branch.rootSessionID !== execution.rootSessionID || branch.rootSessionID !== trusted.rootSessionID) {
        return yield* wrong_owner
      }
      return yield* outcome.resolve({ outcomeID, branch, ownerExecution: execution })
    }),
    { behavior: "immediate" },
  )
  ```

  `validateAttached` may use a nested transaction/savepoint and `Outcome.resolve` may use a nested savepoint; the outer handler transaction is the atomic boundary. Do not accept a root or lease ID from the HTTP request and do not query a lease by a body root. Neither action renews or otherwise mutates the lease. Map controller failures only to the declared `OutcomeLookupError` controller-validation variants (`invalid_controller_token`, `wrong_worker`, `stale_authority`, `stale_worker`) and map body-root inconsistency or any outcome ownership rejection to `wrong_owner`, so denial cannot leak an outcome payload, controller token, lease ID, or root. Register the opencode `delegationHandlers` with `HttpApiBuilder.group(Api, "server.delegation", ...)` in `serverRoutes`, alongside the existing `@opencode-ai/server/handlers`, including `delegation.outcome.get`. Provide only `DelegationTransport` for those handlers from `serverRoutes(listenerBind)` and reuse existing server auth/schema layers; verify the server-layer integration supplies the real bind policy. Do not add the group to `InstanceHttpApi` or duplicate it in `instanceApiRoutes`; make no handler edits under `packages/server`.

- [ ] **Step 10: Run GREEN.** The Task 12 HTTP tests must decode each returned acquire and outcome error against the declared endpoint error schemas, not only inspect a JSON body: source-mode acquisition asserts HTTP 409 and decodes the exact `{ code: "local_build" }` `LocalBuildError`; acquisition coverage decodes `ControllerConflict`, `AcquisitionDisabledError`, and `AcquisitionPreconditionError`; outcome coverage decodes `OutcomeOwnerError` plus all `ControllerMutationError` variants, including invalid token, wrong Worker, stale authority, and stale Worker. The core suite must include the outer-transaction/forked-revoke test: the owned payload returns before the revoke commits, the concurrent revoke cannot finish while the outer immediate transaction is held, and every later authorization read fails without a payload. This test proves the adapter's nested service-effect transaction propagation and SQLite lock only; it does not prove the HTTP handler's structure. Step 9 implementation and security review must inspect the handler source and confirm it obtains the three services from the same route graph and uses the identical outer immediate transaction; the HTTP integration request proves the transport contract. From `packages/core`, run `bun test test/delegation-controller.test.ts test/delegation-outcome.test.ts && bun run typecheck`. From `packages/opencode`, run `bun run test:httpapi && bun test test/server/delegation-controller.test.ts test/server/delegation-outcome-owner.test.ts && bun run typecheck`; these parent Bun tests spawn the compile-defined child. Then run every package-scoped full-suite command in Task 26 Step 3 (including `packages/core: bun run script/migration.ts --check && bun run test && bun run typecheck` and `packages/opencode: bun run test:httpapi && bun run test && bun run typecheck`; never root `bun test`). Expected: every command exits 0.

- [ ] **Step 11: Commit.**

The listed `packages/core/test/fixture/delegation.ts` file is also where Task 12 adds `provideProductionServices` and the optional `httpRuntime` start mode; keep those fixture changes in this task's commit.

```bash
git add packages/protocol/src/groups/delegation.ts packages/protocol/src/api.ts packages/opencode/src/server/routes/instance/httpapi/handlers/delegation.ts packages/opencode/src/server/routes/instance/httpapi/middleware/delegation-transport.ts packages/opencode/src/server/routes/instance/httpapi/api.ts packages/opencode/src/server/routes/instance/httpapi/server.ts packages/opencode/src/server/server.ts packages/opencode/test/server/httpapi-layer.ts packages/core/test/fixture/delegation.ts packages/core/src/delegation/controller.ts packages/core/src/delegation/outcome.ts packages/core/test/delegation-controller.test.ts packages/core/test/delegation-outcome.test.ts packages/opencode/test/server/delegation-controller.test.ts packages/opencode/test/server/delegation-outcome-owner.test.ts packages/opencode/test/server/delegation-nonlocal-child.ts
git commit -m "feat(opencode): expose delegation controller HTTP API"
```

### Task 13: Generated Promise and Effect client update

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Precondition (2026-10-12 recovery): Task 12 must already be committed on this branch after `c7b4bb65f` (its delegation HttpApi controller/outcome transport commit is an ancestor of HEAD) and the working tree must not hold uncommitted Task 12 files. If HEAD is still `c7b4bb65f`, or `git status` shows uncommitted changes under `packages/core/src/delegation/`, `packages/opencode/src/server/`, `packages/opencode/test/server/delegation-*`, or `packages/protocol/src/`, make no changes, do not run `bun run generate`, and end with `STATUS: NEEDS_CONTEXT` stating that Task 12 has not landed.

**Files:**
- Modify by generation: `packages/client/src/generated/`
- Modify by generation: `packages/client/src/generated-effect/`
- Modify: `packages/client/src/contract.ts`
- Modify: `packages/client/test/contract-identity.test.ts`
- Modify: `packages/client/test/promise.test.ts`
- Modify: `packages/client/test/effect.test.ts`

**Interfaces:**
- Promise and Effect clients expose acquire, renew, release, and owner-scoped outcome lookup generated from Task 12.
- Remote acquisition returns `AttachedControllerAcquireResult`: only its acquired variant has the one-time token and controller ID. Renew returns the core acquired result without a token; observer and owner failures remain typed and payload-free. Generated renew/release/outcome methods map the controller ID and token to dedicated headers rather than query/body fields.
- Generated renew/release clients decode the declared `ControllerMutationError` variants and reject/fail them; they never return those errors as successful data.

- [ ] **Step 1: Add the promise client test body before generation.**

```ts
import type { BranchFence, ExecutionFence } from "@opencode-ai/schema/delegation"

test("generated promise client exposes delegation methods", async () => {
  const calls: Request[] = []
  const client = OpenCode.make({
    baseUrl: "https://server.test",
    fetch: async (request) => {
      calls.push(request.clone())
      if (request.url.endsWith("/acquire")) return Response.json({ _tag: "ControllerConflict", state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 }, { status: 409 })
      if (request.url.includes("/outcome/")) return Response.json({ code: "wrong_owner" }, { status: 403 })
      if (request.url.endsWith("/renew") && request.headers.get("x-opencode-controller-token") === "stale-token") return Response.json({ code: "stale_authority" }, { status: 409 })
      if (request.url.endsWith("/renew")) return Response.json({ state: "acquired", leaseID: "lease_a", controllerID: "controller_a", authorityEpoch: 1, expiresAt: 7050 })
      if (request.url.endsWith("/release")) return new Response(null, { status: 204 })
      throw new Error(`unexpected delegation request: ${request.url}`)
    },
  })
  await expect(client.delegation.controllerAcquire({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })).rejects.toEqual({ _tag: "ControllerConflict", state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 })
  await expect(client.delegation.controllerRenew({ leaseID: "lease_a", authorityEpoch: 1, controllerID: "controller_a", token: "stale-token" })).rejects.toEqual({ code: "stale_authority" })
  await expect(client.delegation.controllerRenew({ leaseID: "lease_a", authorityEpoch: 1, controllerID: "controller_a", token: "lease-token" })).resolves.toMatchObject({ state: "acquired", controllerID: "controller_a" })
  await expect(client.delegation.controllerRelease({ leaseID: "lease_a", authorityEpoch: 1, controllerID: "controller_a", token: "lease-token" })).resolves.toBeUndefined()
  await expect(client.delegation.outcomeGet({ outcomeID: "outcome_a", branch: branchFence("branch_b"), execution: executionFence("exec_a"), controllerID: "controller_a", token: "lease-token" })).rejects.toEqual({ code: "wrong_owner" })
  expect(calls).toHaveLength(5)
  for (const [index, request] of calls.slice(1).entries()) {
    const expectedToken = index === 0 ? "stale-token" : "lease-token"
    expect(request.headers.get("x-opencode-delegation-protocol")).toBe("opencode.delegation/v1")
    expect(request.headers.get("x-opencode-controller-id")).toBe("controller_a")
    expect(request.headers.get("x-opencode-controller-token")).toBe(expectedToken)
    expect(request.url).not.toContain(expectedToken)
    expect(request.url).not.toContain("controller_a")
    const body = await request.clone().text()
    expect(body).not.toContain(expectedToken)
    expect(body).not.toContain("controller_a")
  }
})
```

```ts
function executionFence(executionID: string): ExecutionFence {
  return { executionID, sessionID: "root_a", rootSessionID: "root_a", fencingToken: 1, workerID: "worker_a", workerEpoch: "epoch_a" }
}

function branchFence(branchID: string): BranchFence {
  return { ...executionFence("exec_a"), branchID, branchFencingToken: 1 }
}
```

- [ ] **Step 2: Add the Effect client test body before generation.**

```ts
test("generated Effect client fails with typed ControllerConflict", async () => {
  const program = Effect.gen(function* () {
    const client = yield* OpenCode.make({ baseUrl: "https://server.test" })
    return yield* client.delegation.controllerAcquire({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })
  })
  const failure = await Effect.runPromise(Effect.flip(program.pipe(Effect.provideService(HttpClient.HttpClient, httpClient))))
  expect(failure).toEqual(expect.objectContaining({ _tag: "ControllerConflict", reason: "controller_conflict" }))
})
```

```ts
const httpClient = HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, Response.json({ _tag: "ControllerConflict", state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 }, { status: 409 }))))
```

Add a corresponding Effect-client mock for a declared renew or release mutation error, such as `{ code: "stale_authority" }` with HTTP 409, and assert with `Effect.flip` that the generated method fails with that decoded error rather than returning it.

- [ ] **Step 3: Project the canonical client contract before generation.** Extend `groupNames` with `"server.delegation": "delegation"` and assert in `packages/client/test/contract-identity.test.ts` that `ClientApi.groups` contains the protocol delegation group and its endpoints. Do not define a duplicate delegation group in the client: its `makeDefaultApi` call picks up the protocol group added by Task 12.

- [ ] **Step 4: Run RED.** Run from `packages/client`: `bun test test/promise.test.ts test/effect.test.ts test/contract-identity.test.ts`. Expected: the canonical contract projection passes, while generated delegation method tests fail because generated delegation methods are absent.

- [ ] **Step 5: Generate both clients.** Run from `packages/client`: `bun run generate`. Inspect only `src/generated` and `src/generated-effect`; do not hand-edit generated output. The Promise client is constructed with `OpenCode.make({ baseUrl: "https://server.test" })`; the Effect client uses `yield* OpenCode.make({ baseUrl: "https://server.test" })` with the provided `HttpClient` service. The declared `ControllerConflict` and `ControllerMutationError` variants are parsed and rejected/failed, not returned as data; renew/release tests must cover at least one declared 401/403/409 mutation failure.

- [ ] **Step 6: Run GREEN.** Run from `packages/client`: `bun run generate && bun run check:generated && bun run test && bun run typecheck`. Expected: exit 0 and no generated diff after the second generation.

- [ ] **Step 7: Commit.**

```bash
git add packages/client/src/contract.ts packages/client/test/contract-identity.test.ts packages/client/src/generated packages/client/src/generated-effect packages/client/test/promise.test.ts packages/client/test/effect.test.ts
git commit -m "feat(client): generate delegation API clients"
```

### Task 14: Trusted plugin API implementation

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09): in production, the Worker fence and `coordinationDomain` this task needs come from `DelegationRuntime.current()` and `DelegationRuntime.coordinationDomain` (Task 6). Tests keep using the fixture Worker.

**Files:**
- Modify: `packages/plugin/src/delegation.ts`
- Modify: `packages/plugin/src/index.ts`
- Modify: `packages/plugin/src/v2/effect/context.ts`
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/core/src/delegation/outcome.ts` (`OutcomeService.pending`, decided 2026-10-08; the takeover owner rules)
- Modify: `packages/core/src/delegation/branch.ts` (`BranchService.takeOver` and the taken-over-branch refusals, decided 2026-10-08)
- Modify: `packages/core/src/session/runner/index.ts` (runner acquisition refuses a taken-over branch, decided 2026-10-08)
- Modify: `packages/opencode/src/plugin/index.ts`
- Create: `packages/core/test/fixture/plugin-delegation.ts`
- Create: `packages/core/test/delegation-plugin-api.test.ts`
- Create: `packages/opencode/test/plugin/delegation-api.test.ts`

**Interfaces:**
- Core implements the plugin types; plugin does not import core.
- Exact lookup is `currentExecution({ sessionID }): Promise<ExecutionFence>`.
- The plugin host captures the current `WorkerFence`, `coordinationDomain`, and clock when it constructs `DelegationBranchApi`. Participant registration/heartbeat inputs omit `worker`, `heartbeatAt`, and `coordinationDomain`; unavailability/withdrawal inputs omit `worker`; outcome acknowledgement omits `worker`. The host injects those trusted values immediately before calling core services.
- Later workflow consumers consume `currentExecution` plus every branch and outcome method.
- `pendingOutcome(PendingOutcomeInput): Promise<DelegationTerminal | null>` (decided 2026-10-08) is read-only and adapts `OutcomeService.pending`, which this task adds to `packages/core/src/delegation/outcome.ts`. Owner rule and fence checks are `resolveOutcome`'s (Normative Contracts doc comment): `wrong_owner` for an unknown branch, a non-outermost branch or another execution, checked before any outcome is read. A branch in `handoff` answers its one pending outcome (`branchID` = the queried branch); every other state answers `null`. No write, no event, no injected Worker.
- Takeover (decided 2026-10-08, Holden, option A). `takeOverBranch(TakeOverBranchInput): Promise<TakenOverBranch>` adapts `BranchService.takeOver`; the host injects the caller's `worker`, `coordinationDomain`, `now()` and `component: "workflows"` (plugin callers cannot override them) and reads no Fiber-bound execution, like `pendingOutcome`, because its consumer is workflows startup recovery. `component` is fixed: `AcknowledgeBranchInput.ownerComponent` admits only `core` and `workflows`, and `core` is core itself, never a plugin-API caller. The host has no per-plugin identity, so this is the same trust boundary as `acknowledgeBranch`'s `ownerComponent`, not an authenticated plugin name. `takeOver` runs one immediate transaction, checks in this order and writes nothing on any refusal:
  1. The caller Worker passes `WorkerOwnership.assertCurrent` (`stale_worker`/`wrong_worker`).
  2. The branch row of `input.branch.branchID` exists, else `unregistered_branch`. This read also yields the row's current fence, including its current `branch_fencing_token`, which the compare-and-set below uses.
  3. The branch row's recorded `coordination_domain` (Task 3: written once by `reserve` from the reserving Worker's registration and never updated) equals the injected `coordinationDomain`, else `wrong_domain`; a null recorded domain is `wrong_domain`. It is never compared with the owner Worker's current `delegation_worker_owner` registration, which a restart in another domain may have changed, and it runs before check 7 reads that row, so an owner without a Worker row is still refused outside the recorded domain. Nothing else about the branch is revealed first.
  4. The branch is outermost and belongs to the caller's component: `parent_branch_id` is null, `kind` is `workflow` (fixed by `reserve`; the kind the workflows consumer reserves), and `owner_component` is either null (bound but not yet acknowledged: workflows persists its record at `registered`, before `acknowledgeBranch`, so a Worker that died in between leaves exactly this row) or equal to the injected `component`; else `wrong_parent` (the code `acknowledgeBranch` already uses for a `workflows` branch that is not outermost under a root owner). A native branch (core-owned once acknowledged), a `workflow` branch acknowledged by another component, and every nested branch are never plugin-takeable; core's own branches stay with core's maintenance paths.
  5. `input.ownerExecution` is the execution part of `input.branch` (same `workerID`, `workerEpoch`, `executionID`, `sessionID`, `rootSessionID`, `fencingToken`), and `input.branch` equals either the row's current fence or the `from_*` fence of a `delegation_branch_takeover` row of this branch; else `stale_branch`. Accepting a replaced pair lets a later process finish the job of a taker that crashed after the takeover committed but before it stored the new fences; check 7 still requires the current holder to be gone.
  6. The branch is not `completed`, `failed`, `outcome_acknowledged`, `retiring` or `retired`, else `branch_already_terminal` (`handoff` is accepted: its outcome is still pending).
  7. The row's current owner Worker is gone. Read the `delegation_worker_owner` row of the branch row's `worker_id` (Task 3 columns; this check reads only `worker_epoch` and `heartbeat_at`, never `coordination_domain`) and decide in this order: no row -> gone; a row whose `worker_epoch` differs from the branch row's `worker_epoch` -> gone (superseded, however fresh its `heartbeat_at`); a row with the same epoch and `heartbeat_at + 6000 < now` -> gone (expired; `now = heartbeat_at + 6000` is still live, the Task 4 boundary). Otherwise `owner_alive` -- the caller's own branch included.
  Writes, all in that transaction: insert a `delegation_execution_owner` row `kind: "takeover"` with a new `execution_id`, the replaced owner execution's `session_id` and `root_session_id`, the caller's `worker_id`/`worker_epoch`, `fencing_token` = the largest `fencing_token` of that session's rows + 1, state `acquired` and `expires_at = now + 6000`; update the branch row's `worker_id`, `worker_epoch` and `owner_execution_id` to the caller and the new execution and set `branch_fencing_token = branch_fencing_token + 1` with `WHERE branch_id = ? AND branch_fencing_token = <the row's current branch_fencing_token read in check 2>` -- never the input's token, which check 5 may have accepted as a replaced pair (zero changed rows is `stale_branch`); point the branch's not-yet-acknowledged outcome (`branchPath[0]` = the branch) at the new execution as its root owner; insert the audit row (`from_*` = the row's fence before this update, which differs from the input when check 5 accepted a replaced pair; `to_*` = the new one; `coordination_domain`; `taken_at = now`; its unique index is the database-level guarantee of one winner per token); when the replaced owner execution is itself a `kind: "takeover"` row (a re-takeover), terminalize it (the terminal state Task 5 Step 4 recovery writes). Return `{ branch, ownerExecution }` built from the new rows. It never writes, recovers or terminalizes an existing session execution (any `kind` but `takeover`), controller lease, participant or permit row (Review Focus 12).
  Taken-over branch and takeover execution (a branch is taken over while its `owner_execution_id` names a `kind: "takeover"` row): after the ordinary fence checks, `bind`, `acknowledge`, `start`, `complete` and `setDelivery` on it reject with `invalid_branch_state` (terminal states keep `branch_already_terminal`), and `fail` behaves as for any branch; runner acquisition of its child session fails with `invalid_branch_state` and opens no model stream whatever the branch state; `reserve` with a takeover `ownerExecution` rejects with `wrong_parent`; `create`/`createFromOrigin` whose origin branch is taken over or whose `rootOwnerExecution` is a takeover execution reject with `wrong_owner` and write nothing; `resolve` with a takeover `ownerExecution` rejects with `wrong_owner` (the taker closes the branch, it does not read the payload); `pending` and `acknowledge` apply their ordinary owner rule and fence checks to the new fences. Ordinary fence validation finds the takeover execution by `execution_id` and ignores its `expires_at` (Task 5 Step 3), so the taker can still close the branch after `now + 6000`. When a taken-over branch reaches `retired` by any path (`fail`, the retirement that follows its outcome acknowledgement, or Task 25's maintenance drain or abort), the transaction that writes `retired` also terminalizes its `kind: "takeover"` execution (the Task 5 Step 4 terminal state), so no takeover row stays active once its branch is closed; the taker's fences are refused afterwards like any terminalized owner's. A previous owner's fences are refused afterwards by the ordinary checks: `stale_worker` for a superseded epoch, `stale_branch` for the old `branchFencingToken`, `wrong_owner` for outcome reads and acknowledgement with the old execution.

- [ ] **Step 1: Create the complete `packages/core/test/fixture/plugin-delegation.ts` fixture before its tests.**

```ts
import type { BranchFence, DelegationOutcomePayload, DelegationTerminal, ExecutionFence, PendingOutcomeInput, ResolveOutcomeInput } from "@opencode-ai/schema/delegation"
import type { DelegationBranchApi } from "@opencode-ai/plugin/delegation"
import { Effect } from "effect"
import { makeDelegationBranchApi } from "@opencode-ai/core/plugin/host"
import { ExecutionFenceRef } from "@opencode-ai/core/session/execution"
import { createDelegationFixture } from "./delegation"

type State = "no_active" | "wrong_session" | "stale_database_owner" | "active"

export type PluginDelegationHarness = Readonly<{
  api: DelegationBranchApi
  execution: ExecutionFence
  payload: DelegationOutcomePayload
  /** The "active" harness's outcome; its branch `branch_a` is in `handoff`. Null in the other states. */
  terminal: DelegationTerminal | null
  resolveInput(input: { branchID: string; executionID: string }): ResolveOutcomeInput
  pendingInput(input: { branchID: string; executionID: string }): PendingOutcomeInput
  /** "active" only: reserves, binds, acknowledges and starts one more outermost native branch (state `running`, no outcome). */
  openBranch(childSessionID: string): Promise<BranchFence>
  ackInput(): ResolveOutcomeInput
  outcomeState(outcomeID: string): Promise<string>
  close(): Promise<void>
}>

export async function makePluginDelegationHarness(input: { state: State }): Promise<PluginDelegationHarness> {
  const fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/plugin-delegation-${crypto.randomUUID()}.sqlite`, workers: 2 })
  await fixture.seedRootSession("session_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const execution = input.state === "no_active"
    ? { executionID: "exec_absent", sessionID: "session_a", rootSessionID: "session_a", fencingToken: 1, ...worker }
    : await fixture.acquireExecution({ sessionID: "session_a", rootSessionID: "session_a", kind: "root", worker, now: 1000 })
  if (input.state === "stale_database_owner") {
    await fixture.recoverExecution({ sessionID: "session_a", rootSessionID: "session_a", kind: "root", worker: fixture.worker("worker_b", "epoch_b", "core_build"), now: 7001, expiredExecutionID: execution.executionID })
  }

  const payload: DelegationOutcomePayload = { type: "permission", permission: "bash", pattern: "git status", description: "inspect" }
  let outcomeID = "outcome_absent"
  let terminal: DelegationTerminal | null = null
  let branch = { ...execution, branchID: "branch_a", branchFencingToken: 1 }
  if (input.state === "active") {
    fixture.setSanitizer(async (value) => ({ status: "sanitized", payload: value.payload }))
    const reserved = await fixture.reserveBranch({ parentSessionID: "session_a", rootSessionID: "session_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "foreground" })
    const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
    const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
    await fixture.startBranch({ branch: acknowledged.branch })
    branch = acknowledged.branch
    terminal = await fixture.createOutcome({ idempotencyKey: "plugin-outcome-a", kind: "permission_handoff", errorCode: null, origin: branch, rootOwnerExecution: execution, branchPath: [branch.branchID], candidate: payload, delivery: "foreground" })
    outcomeID = terminal.outcomeID
  }

  const host = makeDelegationBranchApi({ provide: fixture.provideProductionServices, worker, coordinationDomain: "domain_a", now: () => 1000 })
  const invoke = <A>(operation: () => Promise<A>): Promise<A> => {
    if (input.state === "no_active") return operation()
    return Effect.runPromise(ExecutionFenceRef.locally(execution, Effect.promise(operation)))
  }
  const api: DelegationBranchApi = {
    ...host,
    currentExecution: (value) => invoke(() => host.currentExecution(value)),
    resolveOutcome: (value) => invoke(() => host.resolveOutcome(value)),
    acknowledgeOutcome: (value) => invoke(() => host.acknowledgeOutcome(value)),
    // pendingOutcome stays the host's own method, called outside ExecutionFenceRef: its
    // consumer (workflows startup recovery) has no session fiber, so the adapter must not read one.
    // resolveOutcome and acknowledgeOutcome read no Fiber either (Step 5c); wrapping them here only
    // mirrors a session caller, and the Step 3c takeover tests call both unwrapped.
  }
  return {
    api,
    execution,
    payload,
    terminal,
    resolveInput: ({ branchID, executionID }) => ({ outcomeID, branch: { ...branch, branchID }, ownerExecution: { ...execution, executionID } }),
    pendingInput: ({ branchID, executionID }) => ({ branch: { ...branch, branchID }, ownerExecution: { ...execution, executionID } }),
    openBranch: async (childSessionID) => {
      const reserved = await fixture.reserveBranch({ parentSessionID: "session_a", rootSessionID: "session_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "foreground" })
      const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID })
      const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
      await fixture.startBranch({ branch: acknowledged.branch })
      return acknowledged.branch
    },
    ackInput: () => ({ outcomeID, branch, ownerExecution: execution }),
    outcomeState: async (id) => {
      const rows = await fixture.dbRows("delegation_outcome")
      const row = rows.find((value) => value.outcome_id === id)
      if (!row || typeof row.state !== "string") throw new Error(`missing outcome ${id}`)
      return row.state
    },
    close: () => fixture.close(),
  }
}
```

- [ ] **Step 1b: Append the takeover harness to `packages/core/test/fixture/plugin-delegation.ts` (decided 2026-10-08).** Add `WorkerFence` to that file's `@opencode-ai/schema/delegation` type import, then append:

```ts
const OWNER_HEARTBEAT = 1000 // the owner's lease boundary is OWNER_HEARTBEAT + 6000 = 7000 (Task 4)

export type TakeoverHarness = Readonly<{
  /** Worker worker_a/epoch_a, registered in domain_a at OWNER_HEARTBEAT. */
  owner: WorkerFence
  /** The owner's root execution of session_a. */
  ownerExecution: ExecutionFence
  /** Registers `worker` in `coordinationDomain` at `now` (skipped with `register: false`, so an already-registered Worker keeps its recorded epoch and heartbeat) and returns its host-bound API, used unwrapped (no session fiber), as workflows startup recovery uses it. */
  host(input: { worker: WorkerFence; coordinationDomain: string; now: number; register?: boolean }): Promise<DelegationBranchApi>
  /** Seeds `childSessionID` under session_a, then reserves, binds, acknowledges and starts one outermost branch under the owner's execution: by default (`ownerComponent: "workflows"`) a `kind: "workflow"` branch acknowledged by `workflows`, the only kind a plugin may take over; with `ownerComponent: "core"` a `kind: "native"` branch acknowledged by `core`. With `handoff: true` it also creates the branch's foreground outcome, which moves the branch to `handoff`. With `acknowledged: false` (default true; `handoff` must then be false) it stops after the bind and returns the `registered` branch, whose `ownerComponent` is still null. */
  openBranch(input: { childSessionID: string; handoff: boolean; ownerComponent?: "workflows" | "core"; acknowledged?: boolean }): Promise<{ branch: BranchFence; outcomeID: string | null }>
  /** Acquires the owner's `workflow_child` execution of `parentChildSessionID` (the child session bound to `parent`), seeds `childSessionID`, then reserves, binds, acknowledges (`core`) and starts one native branch nested under `parent`. */
  openNestedBranch(input: { parent: BranchFence; parentChildSessionID: string; childSessionID: string }): Promise<{ branch: BranchFence; ownerExecution: ExecutionFence }>
  /** Fails `branch` as its owner (the branch retires). */
  failAsOwner(branch: BranchFence): Promise<void>
  /** One runner turn of the workflow child `childSessionID` through the production runner acquisition path (Task 10 `runSessionTurn`, `kind: "workflow_child"`). */
  runChildTurn(input: { childSessionID: string; worker: WorkerFence; now: number }): Promise<void>
  rows(table: string): Promise<readonly Record<string, unknown>[]>
  branchState(branchID: string): Promise<string>
  outcomeState(outcomeID: string): Promise<string>
  close(): Promise<void>
}>

export async function makeTakeoverHarness(): Promise<TakeoverHarness> {
  const fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/plugin-takeover-${crypto.randomUUID()}.sqlite`, workers: 2 })
  await fixture.seedRootSession("session_a")
  const owner = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker: owner, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: OWNER_HEARTBEAT })
  const ownerExecution = await fixture.acquireExecution({ sessionID: "session_a", rootSessionID: "session_a", kind: "root", worker: owner, now: OWNER_HEARTBEAT })
  fixture.setSanitizer(async (value) => ({ status: "sanitized", payload: value.payload }))
  const payload: DelegationOutcomePayload = { type: "permission", permission: "bash", pattern: "git status", description: "inspect" }
  return {
    owner,
    ownerExecution,
    host: async ({ worker, coordinationDomain, now, register = true }) => {
      if (register) await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain, now })
      return makeDelegationBranchApi({ provide: fixture.provideProductionServices, worker, coordinationDomain, now: () => now })
    },
    openBranch: async ({ childSessionID, handoff, ownerComponent = "workflows", acknowledged: acknowledge = true }) => {
      await fixture.seedChildSession(childSessionID, "session_a")
      const kind = ownerComponent === "workflows" ? "workflow" : "native"
      const reserved = await fixture.reserveBranch({ parentSessionID: "session_a", rootSessionID: "session_a", ownerExecution, parentBranchID: null, kind, delivery: "foreground" })
      const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID })
      if (!acknowledge) {
        if (handoff) throw new Error("openBranch: handoff needs an acknowledged branch")
        return { branch: registered.branch, outcomeID: null }
      }
      const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent, ownerBuildID: ownerComponent === "workflows" ? "workflows_build" : "core_build", protocol: "opencode.delegation/v1" })
      await fixture.startBranch({ branch: acknowledged.branch })
      if (!handoff) return { branch: acknowledged.branch, outcomeID: null }
      const terminal = await fixture.createOutcome({ idempotencyKey: `takeover-${childSessionID}`, kind: "permission_handoff", errorCode: null, origin: acknowledged.branch, rootOwnerExecution: ownerExecution, branchPath: [acknowledged.branch.branchID], candidate: payload, delivery: "foreground" })
      return { branch: acknowledged.branch, outcomeID: terminal.outcomeID }
    },
    openNestedBranch: async ({ parent, parentChildSessionID, childSessionID }) => {
      const parentExecution = await fixture.acquireExecution({ sessionID: parentChildSessionID, rootSessionID: "session_a", kind: "workflow_child", worker: owner, now: OWNER_HEARTBEAT })
      await fixture.seedChildSession(childSessionID, "session_a")
      const reserved = await fixture.reserveBranch({ parentSessionID: parentChildSessionID, rootSessionID: "session_a", ownerExecution: parentExecution, parentBranchID: parent.branchID, kind: "native", delivery: "foreground" })
      const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID })
      const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
      await fixture.startBranch({ branch: acknowledged.branch })
      return { branch: acknowledged.branch, ownerExecution: parentExecution }
    },
    failAsOwner: (branch) => fixture.failBranch({ branch, errorCode: "tool_failed" }),
    runChildTurn: async ({ childSessionID, worker, now }) => {
      await fixture.runSessionTurn({ sessionID: childSessionID, rootSessionID: "session_a", kind: "workflow_child", worker, now })
    },
    rows: (table) => fixture.dbRows(table),
    branchState: (branchID) => fixture.branchState(branchID),
    outcomeState: async (outcomeID) => {
      const row = (await fixture.dbRows("delegation_outcome")).find((value) => value.outcome_id === outcomeID)
      if (!row || typeof row.state !== "string") throw new Error(`missing outcome ${outcomeID}`)
      return row.state
    },
    close: () => fixture.close(),
  }
}
```

- [ ] **Step 2: Create the four current-execution cases.**

```ts
import { afterEach, expect, test } from "bun:test"
import { makePluginDelegationHarness } from "./fixture/plugin-delegation"

const openHarnesses: Awaited<ReturnType<typeof makePluginDelegationHarness>>[] = []
afterEach(async () => Promise.all(openHarnesses.splice(0).map((harness) => harness.close())))

async function open(input: Parameters<typeof makePluginDelegationHarness>[0]) {
  const harness = await makePluginDelegationHarness(input)
  openHarnesses.push(harness)
  return harness
}

test.each([
  ["no_active", "session_a", "execution_not_active"],
  ["wrong_session", "session_b", "wrong_session"],
  ["stale_database_owner", "session_a", "stale_execution"],
] as const)("currentExecution maps %s to %s", async (state, sessionID, code) => {
  const harness = await open({ state })
  await expect(harness.api.currentExecution({ sessionID })).rejects.toMatchObject({ code })
})

test("currentExecution returns the host-bound active fence", async () => {
  const harness = await open({ state: "active" })
  await expect(harness.api.currentExecution({ sessionID: "session_a" })).resolves.toEqual(harness.execution)
})
```

- [ ] **Step 3: Create owner and stale-ack tests.**

```ts
test.each([
  ["branch_a", "exec_a", undefined],
  ["branch_b", "exec_a", "wrong_owner"],
  ["branch_a", "exec_b", "wrong_owner"],
] as const)("resolveOutcome scopes branch %s execution %s", async (branchID, executionID, code) => {
  const harness = await open({ state: "active" })
  const input = harness.resolveInput({ branchID, executionID })
  if (code) await expect(harness.api.resolveOutcome(input)).rejects.toMatchObject({ code })
  if (!code) await expect(harness.api.resolveOutcome(input)).resolves.toEqual(harness.payload)
})

test("plugin outcome acknowledgement injects the host Worker fence", async () => {
  const harness = await open({ state: "active" })
  const input = harness.ackInput()
  await expect(harness.api.acknowledgeOutcome(input)).resolves.toBeUndefined()
  expect(await harness.outcomeState(input.outcomeID)).toBe("acknowledged")
})

test("plugin participant registration injects host-owned identity fields", async () => {
  const harness = await open({ state: "active" })
  const participant = await harness.api.registerParticipant({ component: "workflows", buildID: "workflows_build", protocol: "opencode.delegation/v1", capabilities: ["registeredBranchV1"] })
  expect(participant).toMatchObject({ component: "workflows", buildID: "workflows_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", heartbeatAt: 1000, worker: { workerID: "worker_a", workerEpoch: "epoch_a" } })
})
```

- [ ] **Step 3b: Create the `pendingOutcome` tests (decided 2026-10-08).** Append to `packages/core/test/delegation-plugin-api.test.ts`:

```ts
test("pendingOutcome returns the pending outcome of a handoff branch and writes nothing", async () => {
  const harness = await open({ state: "active" })
  const terminal = harness.terminal
  if (!terminal) throw new Error("expected the active harness outcome")
  const before = await harness.outcomeState(terminal.outcomeID)
  await expect(harness.api.pendingOutcome(harness.pendingInput({ branchID: "branch_a", executionID: "exec_a" }))).resolves.toEqual(terminal)
  expect(terminal.branchID).toBe("branch_a")
  expect(await harness.outcomeState(terminal.outcomeID)).toBe(before)
})

test("pendingOutcome returns null for an open branch and for closed branches", async () => {
  const harness = await open({ state: "active" })
  const running = await harness.openBranch("child_b")
  await expect(harness.api.pendingOutcome({ branch: running, ownerExecution: harness.execution })).resolves.toBeNull()
  const finished = await harness.openBranch("child_c")
  await harness.api.completeBranch({ branch: finished, resultID: "result_c" })
  await expect(harness.api.pendingOutcome({ branch: finished, ownerExecution: harness.execution })).resolves.toBeNull()
  await harness.api.acknowledgeOutcome(harness.ackInput())
  await expect(harness.api.pendingOutcome(harness.pendingInput({ branchID: "branch_a", executionID: "exec_a" }))).resolves.toBeNull()
})

test.each([
  ["branch_b", "exec_a"],
  ["branch_a", "exec_b"],
] as const)("pendingOutcome refuses branch %s execution %s with wrong_owner and changes nothing", async (branchID, executionID) => {
  const harness = await open({ state: "active" })
  const terminal = harness.terminal
  if (!terminal) throw new Error("expected the active harness outcome")
  const before = await harness.outcomeState(terminal.outcomeID)
  await expect(harness.api.pendingOutcome(harness.pendingInput({ branchID, executionID }))).rejects.toMatchObject({ code: "wrong_owner" })
  expect(await harness.outcomeState(terminal.outcomeID)).toBe(before)
})

test("pendingOutcome refuses another execution on an open branch, so a null answer never leaks", async () => {
  const harness = await open({ state: "active" })
  const running = await harness.openBranch("child_b")
  await expect(harness.api.pendingOutcome({ branch: running, ownerExecution: { ...harness.execution, executionID: "exec_b" } })).rejects.toMatchObject({ code: "wrong_owner" })
})
```

- [ ] **Step 3c: Create the dead-worker takeover tests (decided 2026-10-08).** Append to `packages/core/test/delegation-plugin-api.test.ts`, and add `makeTakeoverHarness` to its `./fixture/plugin-delegation` import:

```ts
const takeoverHarnesses: Awaited<ReturnType<typeof makeTakeoverHarness>>[] = []
afterEach(async () => Promise.all(takeoverHarnesses.splice(0).map((harness) => harness.close())))

async function takeoverHarness() {
  const harness = await makeTakeoverHarness()
  takeoverHarnesses.push(harness)
  return harness
}

const OWNER_GONE = 8000 // past the owner's lease boundary, 1000 + 6000
const OWNER_LIVE = 2000
const workerB = { workerID: "worker_b", workerEpoch: "epoch_b" }

test("takeOverBranch re-fences a dead owner's open branch to the caller, audits it, and the old fence is refused afterwards", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const restarted = { workerID: "worker_a", workerEpoch: "epoch_b" }
  const caller = await h.host({ worker: restarted, coordinationDomain: "domain_a", now: OWNER_GONE })
  const taken = await caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  expect(taken.branch).toMatchObject({ ...restarted, branchID: branch.branchID, branchFencingToken: branch.branchFencingToken + 1, sessionID: "session_a", rootSessionID: "session_a" })
  expect(taken.ownerExecution).toMatchObject({ ...restarted, sessionID: "session_a", rootSessionID: "session_a" })
  expect(taken.ownerExecution.executionID).not.toBe(h.ownerExecution.executionID)
  expect(taken.branch.executionID).toBe(taken.ownerExecution.executionID)
  expect(taken.branch.fencingToken).toBe(taken.ownerExecution.fencingToken)
  expect(await h.rows("delegation_branch_takeover")).toEqual([expect.objectContaining({
    branch_id: branch.branchID,
    from_worker_id: "worker_a", from_worker_epoch: "epoch_a", from_execution_id: h.ownerExecution.executionID, from_branch_fencing_token: branch.branchFencingToken,
    to_worker_id: "worker_a", to_worker_epoch: "epoch_b", to_execution_id: taken.ownerExecution.executionID, to_branch_fencing_token: branch.branchFencingToken + 1,
    coordination_domain: "domain_a", taken_at: OWNER_GONE,
  })])
  const before = await h.rows("delegation_branch")
  await expect(caller.failBranch({ branch, errorCode: "tool_failed" })).rejects.toMatchObject({ code: "stale_worker" })
  await expect(caller.failBranch({ branch: { ...taken.branch, branchFencingToken: branch.branchFencingToken }, errorCode: "tool_failed" })).rejects.toMatchObject({ code: "stale_branch" })
  expect(await h.rows("delegation_branch")).toEqual(before)
  await caller.failBranch({ branch: taken.branch, errorCode: "tool_failed" })
  expect(await h.branchState(branch.branchID)).toBe("retired")
})

test("takeOverBranch refuses a live owner with owner_alive and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_LIVE })
  const branches = await h.rows("delegation_branch")
  const executions = await h.rows("delegation_execution_owner")
  await expect(caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "owner_alive" })
  expect(await h.rows("delegation_branch")).toEqual(branches)
  expect(await h.rows("delegation_execution_owner")).toEqual(executions)
  expect(await h.rows("delegation_branch_takeover")).toEqual([])
})

test("takeOverBranch refuses a caller from another coordination domain with wrong_domain and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const caller = await h.host({ worker: { workerID: "worker_c", workerEpoch: "epoch_c" }, coordinationDomain: "domain_b", now: OWNER_GONE })
  const branches = await h.rows("delegation_branch")
  const executions = await h.rows("delegation_execution_owner")
  await expect(caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "wrong_domain" })
  expect(await h.rows("delegation_branch")).toEqual(branches)
  expect(await h.rows("delegation_execution_owner")).toEqual(executions)
  expect(await h.rows("delegation_branch_takeover")).toEqual([])
})

test("takeOverBranch refuses a terminal branch with branch_already_terminal and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  await h.failAsOwner(branch)
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const branches = await h.rows("delegation_branch")
  const executions = await h.rows("delegation_execution_owner")
  await expect(caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "branch_already_terminal" })
  expect(await h.rows("delegation_branch")).toEqual(branches)
  expect(await h.rows("delegation_execution_owner")).toEqual(executions)
  expect(await h.rows("delegation_branch_takeover")).toEqual([])
})

test("two concurrent takeovers of one branch have exactly one winner and the loser gets owner_alive", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const first = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const second = await h.host({ worker: { workerID: "worker_c", workerEpoch: "epoch_c" }, coordinationDomain: "domain_a", now: OWNER_GONE })
  const results = await Promise.allSettled([first, second].map((api) => api.takeOverBranch({ branch, ownerExecution: h.ownerExecution })))
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
  const lost = results.filter((result) => result.status === "rejected")
  expect(lost).toHaveLength(1)
  expect(lost[0]).toMatchObject({ reason: { code: "owner_alive" } })
  expect(await h.rows("delegation_branch_takeover")).toHaveLength(1)
  expect((await h.rows("delegation_branch")).find((row) => row.branch_id === branch.branchID)).toMatchObject({ branch_fencing_token: branch.branchFencingToken + 1 })
})

test("a handoff branch taken over is closed by pendingOutcome and acknowledgeOutcome under the new fences, exactly once", async () => {
  const h = await takeoverHarness()
  const { branch, outcomeID } = await h.openBranch({ childSessionID: "child_b", handoff: true })
  if (!outcomeID) throw new Error("expected the handoff outcome")
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const taken = await caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  await expect(caller.failBranch({ branch: taken.branch, errorCode: "invalid_branch_state" })).rejects.toMatchObject({ code: "invalid_branch_state" })
  await expect(caller.pendingOutcome({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "wrong_owner" })
  await expect(caller.resolveOutcome({ outcomeID, branch: taken.branch, ownerExecution: taken.ownerExecution })).rejects.toMatchObject({ code: "wrong_owner" })
  const pending = await caller.pendingOutcome(taken)
  expect(pending).toMatchObject({ outcomeID, branchID: branch.branchID })
  await caller.acknowledgeOutcome({ outcomeID, branch: taken.branch, ownerExecution: taken.ownerExecution })
  expect(await h.outcomeState(outcomeID)).toBe("acknowledged")
  expect((await h.rows("delegation_outcome")).filter((row) => row.state === "acknowledged")).toHaveLength(1)
  // The acknowledgement retired the branch (Task 10 "Handoff waits"; Task 11 Step 6b's "handoff does not
  // retire before outcome acknowledgement" pins the synchronous retirement), and that transaction also
  // terminalized the takeover execution (2026-10-08 takeover fixes), so the taker's fences are now refused.
  expect(await h.branchState(branch.branchID)).toBe("retired")
  expect(["acquired", "running", "draining"]).not.toContain((await h.rows("delegation_execution_owner")).find((row) => row.execution_id === taken.ownerExecution.executionID)?.state)
  await expect(caller.pendingOutcome(taken)).rejects.toMatchObject({ code: "stale_execution" })
  const later = await h.host({ worker: { workerID: "worker_c", workerEpoch: "epoch_c" }, coordinationDomain: "domain_a", now: OWNER_GONE })
  await expect(later.takeOverBranch(taken)).rejects.toMatchObject({ code: "branch_already_terminal" })
})

test("takeover leaves every existing execution untouched and its execution can only close the branch", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const executions = await h.rows("delegation_execution_owner")
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const taken = await caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  const after = await h.rows("delegation_execution_owner")
  expect(after.filter((row) => row.execution_id !== taken.ownerExecution.executionID)).toEqual(executions)
  expect(after.find((row) => row.execution_id === taken.ownerExecution.executionID)).toMatchObject({ kind: "takeover", session_id: "session_a", root_session_id: "session_a", worker_id: "worker_b", worker_epoch: "epoch_b" })
  const branches = await h.rows("delegation_branch")
  await expect(caller.reserveBranch({ parentSessionID: "session_a", rootSessionID: "session_a", ownerExecution: taken.ownerExecution, parentBranchID: null, kind: "native", delivery: "foreground" })).rejects.toMatchObject({ code: "wrong_parent" })
  await expect(caller.completeBranch({ branch: taken.branch, resultID: "forged" })).rejects.toMatchObject({ code: "invalid_branch_state" })
  await expect(caller.createOutcome({ idempotencyKey: "forged", kind: "permission_handoff", errorCode: null, origin: taken.branch, rootOwnerExecution: taken.ownerExecution, branchPath: [branch.branchID], candidate: { type: "permission", permission: "bash", pattern: "git status", description: "inspect" }, delivery: "foreground" })).rejects.toMatchObject({ code: "wrong_owner" })
  await expect(h.runChildTurn({ childSessionID: "child_b", worker: workerB, now: OWNER_GONE })).rejects.toMatchObject({ code: "invalid_branch_state" })
  expect(await h.rows("delegation_branch")).toEqual(branches)
  expect(await h.rows("delegation_outcome")).toEqual([])
  expect(await h.rows("delegation_execution_owner")).toEqual(after)
})

// 2026-10-08 takeover fixes: each refusal below writes nothing.
async function snapshot(h: Awaited<ReturnType<typeof takeoverHarness>>) {
  return { branches: await h.rows("delegation_branch"), executions: await h.rows("delegation_execution_owner"), takeovers: await h.rows("delegation_branch_takeover"), outcomes: await h.rows("delegation_outcome") }
}

const ACTIVE_EXECUTION_STATES = ["acquired", "running", "draining"]

test("takeOverBranch refuses the caller's own live branch with owner_alive and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const self = await h.host({ worker: h.owner, coordinationDomain: "domain_a", now: OWNER_LIVE, register: false })
  const before = await snapshot(h)
  await expect(self.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "owner_alive" })
  expect(await snapshot(h)).toEqual(before)
})

test("takeOverBranch accepts a superseded owner epoch while that Worker's heartbeat is still fresh", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  // worker_a restarts as epoch_b at 2000: its Worker row is fresh (heartbeat 2000), but epoch_a is superseded.
  const restarted = { workerID: "worker_a", workerEpoch: "epoch_b" }
  const caller = await h.host({ worker: restarted, coordinationDomain: "domain_a", now: OWNER_LIVE })
  const taken = await caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  expect(taken.branch).toMatchObject({ ...restarted, branchID: branch.branchID, branchFencingToken: branch.branchFencingToken + 1 })
})

test("takeOverBranch accepts an unsuperseded owner only once its heartbeat has expired, not at the boundary", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  // worker_a keeps epoch_a; only heartbeat expiry (1000 + 6000 < now) can prove it gone.
  const atBoundary = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: 7000 })
  const before = await snapshot(h)
  await expect(atBoundary.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "owner_alive" })
  expect(await snapshot(h)).toEqual(before)
  const past = await h.host({ worker: { workerID: "worker_c", workerEpoch: "epoch_c" }, coordinationDomain: "domain_a", now: 7001 })
  const taken = await past.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  expect(taken.branch).toMatchObject({ workerID: "worker_c", workerEpoch: "epoch_c", branchFencingToken: branch.branchFencingToken + 1 })
})

test("takeOverBranch accepts a replaced fence pair only once the current holder is gone, and compare-and-sets the current token", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const first = await (await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })).takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  // worker_b died before storing `first`; a later process retries with the original pair.
  const early = await h.host({ worker: { workerID: "worker_c", workerEpoch: "epoch_c" }, coordinationDomain: "domain_a", now: OWNER_GONE + 1000 })
  const before = await snapshot(h)
  await expect(early.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "owner_alive" })
  expect(await snapshot(h)).toEqual(before)
  const late = await h.host({ worker: { workerID: "worker_d", workerEpoch: "epoch_d" }, coordinationDomain: "domain_a", now: OWNER_GONE + 6001 })
  const second = await late.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  expect(second.branch).toMatchObject({ workerID: "worker_d", workerEpoch: "epoch_d", branchFencingToken: branch.branchFencingToken + 2 })
  const audits = await h.rows("delegation_branch_takeover")
  expect(audits).toHaveLength(2)
  expect(audits.find((row) => row.to_branch_fencing_token === branch.branchFencingToken + 2)).toMatchObject({
    from_worker_id: "worker_b", from_execution_id: first.ownerExecution.executionID, from_branch_fencing_token: branch.branchFencingToken + 1,
    to_worker_id: "worker_d", to_execution_id: second.ownerExecution.executionID,
  })
  const replaced = (await h.rows("delegation_execution_owner")).find((row) => row.execution_id === first.ownerExecution.executionID)
  expect(ACTIVE_EXECUTION_STATES).not.toContain(replaced?.state)
  await late.failBranch({ branch: second.branch, errorCode: "tool_failed" })
  expect(await h.branchState(branch.branchID)).toBe("retired")
})

test("takeOverBranch refuses a stale or unregistered fence pair and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const before = await snapshot(h)
  await expect(caller.takeOverBranch({ branch: { ...branch, branchFencingToken: branch.branchFencingToken + 5 }, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "stale_branch" })
  await expect(caller.takeOverBranch({ branch, ownerExecution: { ...h.ownerExecution, executionID: "exec_forged" } })).rejects.toMatchObject({ code: "stale_branch" })
  await expect(caller.takeOverBranch({ branch: { ...branch, branchID: "branch_missing" }, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "unregistered_branch" })
  expect(await snapshot(h)).toEqual(before)
})

test("takeOverBranch refuses a core-owned native branch with wrong_parent and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false, ownerComponent: "core" })
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const before = await snapshot(h)
  await expect(caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "wrong_parent" })
  expect(await snapshot(h)).toEqual(before)
})

test("takeOverBranch takes over a bound but not yet acknowledged workflow branch, whose ownerComponent is still null", async () => {
  const h = await takeoverHarness()
  // workflows persists its record at `registered`, before acknowledgeBranch; its Worker died in between.
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false, acknowledged: false })
  expect(await h.branchState(branch.branchID)).toBe("registered")
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const taken = await caller.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  expect(taken.branch).toMatchObject({ ...workerB, branchID: branch.branchID, branchFencingToken: branch.branchFencingToken + 1 })
  await caller.failBranch({ branch: taken.branch, errorCode: "tool_failed" })
  expect(await h.branchState(branch.branchID)).toBe("retired")
})

test("takeOverBranch refuses a nested branch with wrong_parent and writes nothing", async () => {
  const h = await takeoverHarness()
  const { branch: parent } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const nested = await h.openNestedBranch({ parent, parentChildSessionID: "child_b", childSessionID: "child_c" })
  const caller = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })
  const before = await snapshot(h)
  await expect(caller.takeOverBranch(nested)).rejects.toMatchObject({ code: "wrong_parent" })
  expect(await snapshot(h)).toEqual(before)
})

test("takeOverBranch compares the coordination domain recorded on the branch, not its owner Worker's current registration", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  expect((await h.rows("delegation_branch")).find((row) => row.branch_id === branch.branchID)).toMatchObject({ coordination_domain: "domain_a" })
  // worker_a restarts as epoch_b registered in domain_b: epoch_a is superseded, so only the domain can refuse.
  const moved = await h.host({ worker: { workerID: "worker_a", workerEpoch: "epoch_b" }, coordinationDomain: "domain_b", now: OWNER_LIVE })
  const before = await snapshot(h)
  await expect(moved.takeOverBranch({ branch, ownerExecution: h.ownerExecution })).rejects.toMatchObject({ code: "wrong_domain" })
  expect(await snapshot(h)).toEqual(before)
  const sameDomain = await h.host({ worker: { workerID: "worker_c", workerEpoch: "epoch_c" }, coordinationDomain: "domain_a", now: OWNER_LIVE })
  const taken = await sameDomain.takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  expect(taken.branch).toMatchObject({ workerID: "worker_c", branchFencingToken: branch.branchFencingToken + 1 })
  expect((await h.rows("delegation_branch")).find((row) => row.branch_id === branch.branchID)).toMatchObject({ coordination_domain: "domain_a" })
})

test("the taker fails its taken-over branch after the takeover execution's expires_at, and retiring the branch terminalizes that execution", async () => {
  const h = await takeoverHarness()
  const { branch } = await h.openBranch({ childSessionID: "child_b", handoff: false })
  const taken = await (await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE })).takeOverBranch({ branch, ownerExecution: h.ownerExecution })
  const takeoverRow = () => h.rows("delegation_execution_owner").then((rows) => rows.find((row) => row.execution_id === taken.ownerExecution.executionID))
  expect(await takeoverRow()).toMatchObject({ kind: "takeover", state: "acquired", expires_at: OWNER_GONE + 6000 })
  // Same Worker, not re-registered; the host clock is past the takeover execution's expires_at.
  // Regression guard (Task 5 Step 3): fence validation reads no clock today, so only a change that
  // makes it compare expires_at can fail the failBranch below; the terminalization half bites now.
  const later = await h.host({ worker: workerB, coordinationDomain: "domain_a", now: OWNER_GONE + 6001, register: false })
  await later.failBranch({ branch: taken.branch, errorCode: "tool_failed" })
  expect(await h.branchState(branch.branchID)).toBe("retired")
  expect(ACTIVE_EXECUTION_STATES).not.toContain((await takeoverRow())?.state)
})
```

- [ ] **Step 4: Run RED.**

From `packages/core`: `bun test test/delegation-plugin-api.test.ts`

From `packages/opencode`: `bun test test/plugin/delegation-api.test.ts`

Expected: FAIL because the host-bound API and helper are absent (the Step 3b tests also fail on the absent `pendingOutcome`; if the rest of the API already exists when this step runs, they must still fail, on `harness.api.pendingOutcome` not being a function). The seventeen Step 3c takeover tests (seven from the takeover decision, ten from the 2026-10-08 takeover fixes) fail on the absent `takeOverBranch` (`caller.takeOverBranch` is not a function) or, once it exists, on the `delegation_branch_takeover` rows, the taken-over-branch refusals, the null `delegation_branch.coordination_domain` (`reserve` does not write it before Step 5c, so every takeover is `wrong_domain`), the `wrong_parent` ownership check, the compare-and-set on the current token, or the takeover execution's terminalization (the expiry half of that test is a regression guard and cannot fail today); none may pass at RED.

- [ ] **Step 5: Implement the host adapter.** `makeDelegationBranchApi` captures `{ worker, coordinationDomain, now }` from the core-owned plugin host. It injects those values into participant registration/heartbeat and injects `worker` into unavailability, withdrawal, and outcome acknowledgement; plugin callers cannot override them. `currentExecution` first reads the Fiber, then compares requested session, then asserts database and Worker ownership. Map the three failures exactly. `wrong_session` is produced only here at the Fiber-bound host boundary, never by Task 5's database lookup. Adapt branch and outcome services without widening errors.

- [ ] **Step 5b: Implement `OutcomeService.pending` (decided 2026-10-08).** In `packages/core/src/delegation/outcome.ts`, one read transaction: load the branch row of `input.branch.branchID`; reject with `wrong_owner`, reading no outcome, when the row is absent, its `parentBranchID` is not null, or its `ownerExecutionID` is not `input.ownerExecution.executionID`; then run the same fence checks `resolve` runs for the `branch`/`ownerExecution` pair (same error codes). If the branch state is not `handoff`, return `null`. Otherwise return the outcome row whose `branchPath[0]` is the branch and whose state is not `acknowledged` as `{ outcomeID, branchID: input.branch.branchID, kind, errorCode }`; exactly one exists (Task 11: the outcome transaction moves its origin branch to `handoff`; Task 20 "One outcome" for nested chains), so zero or several is a broken invariant and dies as an Effect defect (never a fabricated `null`). No write, no event. `makeDelegationBranchApi.pendingOutcome` adapts it, injects no Worker (a read needs none) and does not read the Fiber-bound execution: the input fences are the whole authorization, so a caller outside any session (workflows startup recovery) can use it; the Step 3b tests call it unwrapped.

- [ ] **Step 5c: Implement the dead-worker takeover (decided 2026-10-08).** In `packages/core/src/delegation/branch.ts`, implement `BranchService.takeOver` exactly as Interfaces "Takeover" orders it: one `db.transaction(effect, { behavior: "immediate" })`, checks 1-7 before any write, then the execution insert, the compare-and-set branch update (on the row's current `branch_fencing_token` read in check 2, never the input's), the outcome root-owner update, the audit insert and, for a re-takeover, the replaced takeover execution's terminalization; map a unique-index violation on `delegation_branch_takeover_token_idx` to `owner_alive` (another takeover won) and never retry. Add the taken-over-branch refusals to `reserve`, `bind`, `acknowledge`, `start`, `complete` and `setDelivery` (after their fence checks and the closed-branch rule), the outcome rules to `create`, `createFromOrigin` and `resolve` in `packages/core/src/delegation/outcome.ts`, and the runner refusal in `packages/core/src/session/runner/index.ts` at the Task 10 Step 4b acquisition point (a bound branch whose owner execution is `kind: "takeover"` fails with `invalid_branch_state` in every state). In `BranchService.reserve` (Task 10), write the new branch row's `coordination_domain` from the reserving Worker's `delegation_worker_owner.coordination_domain` in the same transaction (null when that Worker has no row; Task 3). Put the terminalization of a taken-over branch's `kind: "takeover"` owner execution in the one branch-retirement write that `fail` and the acknowledgement retirement (`acknowledgeHandoff`) share, inside the transaction that moves the branch to `retired`; Task 25's drain and abort retire through that same write (Task 25 Steps 7e-7f). If Task 5's execution fence check applies `expires_at` to every row, exempt `kind: "takeover"` rows there as Task 5 Step 3 pins (lookup by `execution_id`, expiry ignored, non-terminal state required). `makeDelegationBranchApi.takeOverBranch` injects the captured `worker`, `coordinationDomain` and `now()` plus `component: "workflows"` and reads no Fiber-bound execution; the Step 3c tests call it unwrapped. `makeDelegationBranchApi.resolveOutcome` and `acknowledgeOutcome` are session-less in the same way, like `pendingOutcome` and `takeOverBranch`: each takes any Worker it needs from the host (the captured `worker`, which `acknowledgeOutcome` injects) and the execution from the input's `ownerExecution`, and reads no Fiber-bound execution, so workflows startup recovery, which runs outside any session, can call them. Test 6 of Step 3c ("a handoff branch taken over is closed ...") calls `pendingOutcome`, `resolveOutcome` and `acknowledgeOutcome` unwrapped and must stay that way; the Step 1 harness's `ExecutionFenceRef.locally` wrap of the latter two is only a session caller's shape.

- [ ] **Step 6: Wire `PluginInput`.** Add `delegation: DelegationBranchApi` to plugin input and both effect contexts. Construct it in core/opencode host code; do not expose it through an agent tool or public child route.

- [ ] **Step 7: Run GREEN.**

From `packages/core`: `bun test test/delegation-plugin-api.test.ts test/delegation-branch.test.ts test/delegation-runner.test.ts && bun run typecheck`

From `packages/plugin`: `bun run test && bun run typecheck`

From `packages/opencode`: `bun test test/plugin/delegation-api.test.ts && bun run typecheck`

Expected: all commands exit 0 (the Task 10 branch and runner suites stay green with the takeover refusals in place).

- [ ] **Step 8: Commit.**

```bash
git add packages/plugin/src/delegation.ts packages/plugin/src/index.ts packages/plugin/src/v2/effect/context.ts packages/core/src/plugin/host.ts packages/core/src/delegation/outcome.ts packages/core/src/delegation/branch.ts packages/core/src/session/runner/index.ts packages/core/test/fixture/plugin-delegation.ts packages/core/test/delegation-plugin-api.test.ts packages/opencode/src/plugin/index.ts packages/opencode/test/plugin/delegation-api.test.ts
git commit -m "feat(plugin): expose trusted delegation APIs"
```

### Task 15: Permission provenance

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/permission/provenance.ts`
- Modify: `packages/schema/src/v1/permission.ts`
- Modify: `packages/schema/src/permission.ts`
- Modify: `packages/core/src/v1/permission.ts`
- Modify: `packages/core/src/permission.ts`
- Modify: `packages/opencode/src/permission/index.ts`
- Create: `packages/core/test/permission-provenance.test.ts`
- Create: `packages/opencode/test/permission/provenance.test.ts`

**Interfaces:**
- Produces `normalizePermission(input: { rules: readonly ProvenanceRule[]; toolAvailable: boolean }): PermissionBaseline`.
- `ProvenanceRule` is `{ origin: PermissionOrigin; decision: "allow" | "ask" | "deny"; pattern: string; immutableDeny: boolean }`.
- Preserves each stack's ordering and last-match behavior while preventing session/user allow from overriding explicit agent/tool deny or tool absence.

- [ ] **Step 1: Create the complete provenance table test.**

```ts
import { expect, test } from "bun:test"
import { normalizePermission, type ProvenanceRule } from "@opencode-ai/core/permission/provenance"

test.each([
  ["builtin default overridden", true, [{ origin: "builtin_default", decision: "deny", pattern: "*", immutableDeny: false }, { origin: "agent_config", decision: "allow", pattern: "bash", immutableDeny: false }], "allow", false],
  ["agent deny dominates", true, [{ origin: "agent_config", decision: "deny", pattern: "bash", immutableDeny: true }, { origin: "session", decision: "allow", pattern: "bash", immutableDeny: false }], "deny", true],
  ["absent tool is immutable", false, [{ origin: "session", decision: "allow", pattern: "bash", immutableDeny: false }], "deny", true],
  ["user deprecated tools retain user origin", true, [{ origin: "legacy_tools", decision: "ask", pattern: "bash", immutableDeny: false }, { origin: "user_config", decision: "allow", pattern: "bash", immutableDeny: false }], "allow", false],
  ["session nonconflict remains last", true, [{ origin: "user_config", decision: "ask", pattern: "bash", immutableDeny: false }, { origin: "session", decision: "allow", pattern: "bash", immutableDeny: false }], "allow", false],
] as const)("%s", (_name, toolAvailable, rules, decision, immutableDeny) => {
  const result = normalizePermission({ rules: rules as readonly ProvenanceRule[], toolAvailable })
  expect(result.decision).toBe(decision)
  expect(result.immutableDeny).toBe(immutableDeny)
  expect(result.matches.map((match) => match.origin)).toEqual(rules.map((rule) => rule.origin))
})
```

- [ ] **Step 2: Create legacy/v2 parity assertions.**

```ts
import { PermissionProvenanceTestAdapter } from "../../src/permission/index"

test.each(["legacy", "v2"] as const)("%s normalization preserves stack order", async (stack) => {
  const harness = PermissionProvenanceTestAdapter.make(stack)
  const baseline = await harness.evaluate({ tool: "bash", sessionRule: "allow", agentRule: "deny" })
  expect(baseline).toMatchObject({ decision: "deny", immutableDeny: true })
  expect(baseline.matches.map((match) => match.origin)).toEqual(["agent_config", "session"])
})
```

- [ ] **Step 3: Run RED.**

From `packages/core`: `bun test test/permission-provenance.test.ts`

From `packages/opencode`: `bun test test/permission/provenance.test.ts`

Expected: FAIL because provenance metadata is absent.

- [ ] **Step 4: Implement tagged normalization.** Tag at source, retain deprecated tool scope, compute ordinary last match, then force deny only when tool absence or an immutable matched deny exists. `PermissionProvenanceTestAdapter.make` selects the real legacy or v2 normalizer and exposes only `evaluate`; it contains no alternate normalization logic.

- [ ] **Step 5: Run GREEN.**

From `packages/core`: `bun test test/permission-provenance.test.ts && bun run typecheck`

From `packages/opencode`: `bun test test/permission/provenance.test.ts && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/core/src/permission/provenance.ts packages/schema/src/v1/permission.ts packages/schema/src/permission.ts packages/core/src/v1/permission.ts packages/core/src/permission.ts packages/opencode/src/permission/index.ts packages/core/test/permission-provenance.test.ts packages/opencode/test/permission/provenance.test.ts
git commit -m "feat(core): preserve permission provenance"
```

### Task 16: `tool.authorize` and permit fencing

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/authorization.ts`
- Create: `packages/core/src/delegation/permit.ts`
- Modify: `packages/plugin/src/index.ts`
- Modify: `packages/plugin/src/v2/effect/context.ts`
- Modify: `packages/core/src/plugin/host.ts`
- Modify: `packages/opencode/src/session/tools.ts`
- Modify: `packages/core/src/tool/registry.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-authorization.test.ts`
- Modify: `packages/opencode/test/plugin/trigger.test.ts`
- Create: `packages/opencode/test/session/tool-authorization.test.ts`

**Interfaces:**
- Adds optional hook key `"tool.authorize"?: ToolAuthorizeHook`.
- Implements `PermitService`; one immediate transaction verifies authority, Worker, execution, branch, nonterminal branch state, and unique decision key.
- Hook reduction is rank-based: `deny` rank 2, `handoff` rank 1, `continue` rank 0.
- `authorization.ts` exports `composeAuthorization(hooks, input): Promise<{ decision: AuthorizationDecision; reason: string | null }>`, `AuthorizationInput.build`, `MAX_AUTHORIZE_REASON_BYTES = 4096`, `TOOL_AUTHORIZE_DENIED_TEXT = "Tool authorization denied this tool call."`, and the tagged error `ToolAuthorizeDeniedError` (`Schema.TaggedErrorClass`, field `text: Schema.String`, `message` returns `text`).
- Input `branch` (decision 2026-10-08, shared with the guard plan): `AuthorizationInput.build` reads the branch bound to `input.sessionID` through child-session uniqueness (`delegation_branch.child_session_id`) at call time, never from a cached or caller-supplied fence. When a row is bound, `branch` is that row's `BranchFence` plus exactly `delivery` and `kind` from the same row (a branch promoted by Task 19 therefore reads `"background"`), and `branchID` is its `branchID`. When none is bound (root or unregistered session), `branch` and `branchID` are `null`. The input has exactly the eleven keys of `ToolAuthorizeHook`; nothing else (no `parentSessionID`) is added.
- Output `reason` (decision 2026-10-08): each hook receives a fresh output `{ decision: <composed decision so far> }` with no `reason`. The composed reason is the `reason` of the first hook whose own output raised the composition to `deny`, kept only when it is a non-empty string of at most `MAX_AUTHORIZE_REASON_BYTES` UTF-8 bytes (counted with `TextEncoder`, as Task 11 counts payload bounds); a missing, empty, non-string or oversize reason becomes `null` (fixed replacement, never truncation, matching Task 11's oversize rule). A core baseline deny carries `reason: null`. A `reason` set with `continue` or `handoff` is discarded.
- Deny surfacing: on a composed `deny` the runner never executes the tool and fails the call with `ToolAuthorizeDeniedError({ text: reason ?? TOOL_AUTHORIZE_DENIED_TEXT })`. In the legacy runner that error reaches `SessionProcessor.failToolCall`, which writes `errorMessage(error)` to the tool part's `state.error` (`packages/opencode/src/session/processor.ts:186-204` at `2b7eb922f`); it is not added to the blocking list at `processor.ts:200`, so the model sees a tool error and continues, as with today's guard throw. The v2 runner records the same text as its tool-call error. The plan had no core deny text before this decision; `TOOL_AUTHORIZE_DENIED_TEXT` is the generic text. `reason` is never written to `delegation_permit`, any delegation table, or a log.

- [ ] **Step 1: Create hook composition tests.**

```ts
import { expect, test } from "bun:test"
import { composeAuthorization } from "@opencode-ai/core/delegation/authorization"

type HookOutput = { decision: "continue" | "handoff" | "deny"; reason?: string }

test.each([
  [["continue", "handoff", "deny"], "deny"],
  [["deny", "handoff", "continue"], "deny"],
  [["continue", "handoff"], "handoff"],
  [["continue", "continue"], "continue"],
] as const)("reduces %j to %s", async (decisions, expected) => {
  const hooks = decisions.map((decision) => async (_input: never, output: HookOutput) => { output.decision = decision })
  expect(await composeAuthorization(hooks, {} as never)).toEqual({ decision: expected, reason: null })
})

test("a deny keeps the first denying hook's reason", async () => {
  const first = "[opencode-guard] denied (G4, tools closed to agent teams): first"
  const hooks = [
    async (_input: never, output: HookOutput) => { output.decision = "continue"; output.reason = "continue reason" },
    async (_input: never, output: HookOutput) => { output.decision = "deny"; output.reason = first },
    async (_input: never, output: HookOutput) => { output.decision = "deny"; output.reason = "second" },
  ]
  expect(await composeAuthorization(hooks, {} as never)).toEqual({ decision: "deny", reason: first })
})

test.each(["continue", "handoff"] as const)("a reason returned with %s is ignored", async (decision) => {
  const hooks = [async (_input: never, output: HookOutput) => { output.decision = decision; output.reason = "must not surface" }]
  expect(await composeAuthorization(hooks, {} as never)).toEqual({ decision, reason: null })
})

test.each([
  ["missing", undefined],
  ["empty", ""],
  ["4098-byte multibyte", "\u00e9".repeat(2049)],
] as const)("a deny with a %s reason composes to a null reason", async (_label, reason) => {
  const hooks = [async (_input: never, output: HookOutput) => { output.decision = "deny"; if (reason !== undefined) output.reason = reason }]
  expect(await composeAuthorization(hooks, {} as never)).toEqual({ decision: "deny", reason: null })
})

test("a deny reason of exactly 4096 UTF-8 bytes is kept", async () => {
  const reason = "\u00e9".repeat(2048)
  const hooks = [async (_input: never, output: HookOutput) => { output.decision = "deny"; output.reason = reason }]
  expect(await composeAuthorization(hooks, {} as never)).toEqual({ decision: "deny", reason })
})
```

- [ ] **Step 2: Create permit linearization and authorize-input tests.** Before these tests, add to `packages/core/test/fixture/delegation.ts` the fixture method `authorizeInput(input: { sessionID: string; tool: string; callID: string; arguments: unknown; baseline: PermissionBaseline; worker: WorkerFence; execution: ExecutionFence; authority: AuthorityFence | null }): Promise<Parameters<ToolAuthorizeHook>[0]>`, which only calls the production `AuthorizationInput.build` from `@opencode-ai/core/delegation/authorization` (absent until Step 5b).

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture, expectDelegationCode } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/permit-${crypto.randomUUID()}.sqlite`, workers: 1 })
})
afterEach(async () => fixture.close())

test("revocation committed first makes the authority stale", async () => {
  const seeded = await seedPermitContext(fixture)
  await fixture.releaseController({ worker: seeded.worker, leaseID: seeded.authority.leaseID, authorityEpoch: seeded.authority.authorityEpoch, controllerID: seeded.controllerID, now: 1100 })
  try {
    await fixture.authorize({ decisionKey: "call_a:ask_1", baseline: seeded.baseline, decision: "continue", authority: seeded.authority, execution: seeded.execution, branch: seeded.branch })
    throw new Error("permit unexpectedly committed")
  } catch (error) {
    expectDelegationCode(error, "stale_authority")
  }
})

test("duplicate keys are idempotent and separate asks fence independently", async () => {
  const seeded = await seedPermitContext(fixture)
  const first = await fixture.authorize({ decisionKey: "call_a:ask_1", baseline: seeded.baseline, decision: "continue", authority: seeded.authority, execution: seeded.execution, branch: seeded.branch })
  const replay = await fixture.authorize({ decisionKey: "call_a:ask_1", baseline: seeded.baseline, decision: "continue", authority: seeded.authority, execution: seeded.execution, branch: seeded.branch })
  const second = await fixture.authorize({ decisionKey: "call_a:ask_2", baseline: seeded.baseline, decision: "continue", authority: seeded.authority, execution: seeded.execution, branch: seeded.branch })
  expect([first, replay, second]).toEqual(["continue", "continue", "continue"])
  expect(await fixture.dbRows("delegation_permit")).toHaveLength(2)
})

const AUTHORIZE_INPUT_KEYS = ["sessionID", "rootSessionID", "branchID", "tool", "callID", "arguments", "baseline", "worker", "execution", "branch", "authority"]
const BRANCH_FENCE_KEYS = ["workerID", "workerEpoch", "executionID", "sessionID", "rootSessionID", "fencingToken", "branchID", "branchFencingToken"]

test.each(["foreground", "background"] as const)("a registered child's authorize input carries its %s branch record's delivery and kind", async (delivery) => {
  const seeded = await seedPermitContext(fixture, delivery)
  const childExecution = await fixture.acquireExecution({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker: seeded.worker, now: 1000 })
  const input = await fixture.authorizeInput({ sessionID: "child_a", tool: "bash", callID: "call_child", arguments: { command: "git status" }, baseline: seeded.baseline, worker: seeded.worker, execution: childExecution, authority: seeded.authority })
  expect(Object.keys(input).sort()).toEqual([...AUTHORIZE_INPUT_KEYS].sort())
  expect(input.branchID).toBe(seeded.branch.branchID)
  expect(input.branch).toMatchObject({ branchID: seeded.branch.branchID, rootSessionID: "root_a", delivery, kind: "native" })
  expect(Object.keys(input.branch ?? {}).sort()).toEqual([...BRANCH_FENCE_KEYS, "delivery", "kind"].sort())
})

test("a root call's authorize input has branch null and no branch fields", async () => {
  const seeded = await seedPermitContext(fixture)
  const input = await fixture.authorizeInput({ sessionID: "root_a", tool: "bash", callID: "call_root", arguments: { command: "git status" }, baseline: seeded.baseline, worker: seeded.worker, execution: seeded.execution, authority: seeded.authority })
  expect(Object.keys(input).sort()).toEqual([...AUTHORIZE_INPUT_KEYS].sort())
  expect(input.branch).toBeNull()
  expect(input.branchID).toBeNull()
  expect(input).toMatchObject({ sessionID: "root_a", rootSessionID: "root_a" })
})
```

```ts
async function seedPermitContext(fixture: ReturnType<typeof createDelegationFixture>, delivery: "foreground" | "background" = "foreground"): Promise<{ worker: WorkerFence; execution: ExecutionFence; branch: BranchFence; authority: AuthorityFence; controllerID: string; baseline: PermissionBaseline }> {
  await fixture.seedRootSession("root_a")
  await fixture.seedChildSession("child_a", "root_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "broker_hud", buildID: "hud_build", protocol: "opencode.delegation/v1", capabilities: ["controllerLeaseV1"], heartbeatAt: 1000 })
  const execution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  const acquired = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_a", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 1000 })
  if (acquired.state !== "acquired") throw new Error("expected acquired controller")
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  return {
    worker,
    execution,
    branch: acknowledged.branch,
    authority: { workerID: worker.workerID, workerEpoch: worker.workerEpoch, leaseID: acquired.leaseID, authorityEpoch: acquired.authorityEpoch },
    controllerID: acquired.controllerID,
    baseline: { decision: "ask", immutableDeny: false, matches: [{ origin: "agent_config", decision: "ask" }] },
  }
}
```

- [ ] **Step 3: Create runner order tests.**

```ts
import { expect, test } from "bun:test"
import { TOOL_AUTHORIZE_DENIED_TEXT } from "@opencode-ai/core/delegation/authorization"
import { ToolRunnerAuthorizationTestAdapter } from "../../src/session/tools"

test.each(["legacy", "v2"] as const)("%s calls tool.authorize before tool execution", async (runner) => {
  const order: string[] = []
  const harness = ToolRunnerAuthorizationTestAdapter.make({ runner, authorize: async () => { order.push("authorize"); return "continue" }, execute: async () => { order.push("execute") } })
  await harness.run()
  expect(order).toEqual(["authorize", "execute"])
})

test.each(["legacy", "v2"] as const)("%s shows a deny reason to the model and never executes the tool", async (runner) => {
  const order: string[] = []
  const reason = "[opencode-guard] denied (G4, tools closed to agent teams): team members cannot use this tool"
  const harness = ToolRunnerAuthorizationTestAdapter.make({ runner, authorize: async () => { order.push("authorize"); return { decision: "deny", reason } }, execute: async () => { order.push("execute") } })
  const result = await harness.run()
  expect(order).toEqual(["authorize"])
  expect(result.modelVisibleError).toBe(reason)
})

test.each(["legacy", "v2"] as const)("%s shows the generic text for a deny without a reason", async (runner) => {
  const order: string[] = []
  const harness = ToolRunnerAuthorizationTestAdapter.make({ runner, authorize: async () => { order.push("authorize"); return "deny" }, execute: async () => { order.push("execute") } })
  const result = await harness.run()
  expect(order).toEqual(["authorize"])
  expect(result.modelVisibleError).toBe(TOOL_AUTHORIZE_DENIED_TEXT)
})

test.each(["legacy", "v2"] as const)("%s ignores a reason returned with continue", async (runner) => {
  const order: string[] = []
  const harness = ToolRunnerAuthorizationTestAdapter.make({ runner, authorize: async () => { order.push("authorize"); return { decision: "continue", reason: "must not surface" } }, execute: async () => { order.push("execute") } })
  const result = await harness.run()
  expect(order).toEqual(["authorize", "execute"])
  expect(result.modelVisibleError).toBeNull()
})
```

Adapter shape: `ToolRunnerAuthorizationTestAdapter.make(input: { runner: "legacy" | "v2"; authorize: () => Promise<AuthorizationDecision | { decision: AuthorizationDecision; reason?: string }>; execute: () => Promise<void> }): { run(): Promise<{ modelVisibleError: string | null }> }`. `authorize` is registered as the only `tool.authorize` hook and copies its returned decision (and `reason`, when present) into the hook `output`; the selected production runner composes it. `modelVisibleError` is the error text the runner records for the call (legacy: tool part `state.error`; v2: its tool-call error text), `null` when the call did not fail.

- [ ] **Step 4: Run RED.**

From `packages/core`: `bun test test/delegation-authorization.test.ts`

From `packages/opencode`: `bun test test/plugin/trigger.test.ts test/session/tool-authorization.test.ts`

Expected: FAIL because hook composition and permit service are absent. The `authorizeInput` tests fail because `AuthorizationInput.build` does not exist. The three deny/reason runner tests fail on assertions: no runner calls `tool.authorize`, so `order` contains `execute` and `modelVisibleError` is `null`.

- [ ] **Step 5: Implement monotonic hooks and permits.** Start output at core baseline, run hooks sequentially, retain maximum rank, and never permit an immutable baseline deny. Persist one decision row per key after every fence passes inside the transaction. `ToolRunnerAuthorizationTestAdapter.make` invokes the selected production runner with the supplied callbacks and contains no independent ordering implementation.
- [ ] **Step 5b: Implement the authorize input and deny text.** Implement `AuthorizationInput.build` and the reason rule exactly as stated in Interfaces. Both runners (`packages/opencode/src/session/tools.ts` for legacy, `packages/core/src/tool/registry.ts` for v2) build the input with it, run `composeAuthorization`, and on `deny` fail the call with `ToolAuthorizeDeniedError({ text: reason ?? TOOL_AUTHORIZE_DENIED_TEXT })` before the tool's `execute`.

- [ ] **Step 6: Run GREEN.**

From `packages/core`: `bun test test/delegation-authorization.test.ts && bun run typecheck`

From `packages/plugin`: `bun run test && bun run typecheck`

From `packages/opencode`: `bun test test/plugin/trigger.test.ts test/session/tool-authorization.test.ts && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 7: Commit.**

```bash
git add packages/core/src/delegation/authorization.ts packages/core/src/delegation/permit.ts packages/plugin/src/index.ts packages/plugin/src/v2/effect/context.ts packages/core/src/plugin/host.ts packages/opencode/src/session/tools.ts packages/core/src/tool/registry.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-authorization.test.ts packages/opencode/test/plugin/trigger.test.ts packages/opencode/test/session/tool-authorization.test.ts
git commit -m "feat(core): fence tool authorization permits"
```

### Task 17: Core permission/question admission

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/admission.ts`
- Modify: `packages/core/src/permission.ts`
- Modify: `packages/opencode/src/permission/index.ts`
- Modify: `packages/core/src/question.ts`
- Modify: `packages/opencode/src/question/index.ts`
- Modify: `packages/core/src/tool/question.ts`
- Modify: `packages/opencode/src/tool/question.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-admission.test.ts`

**Interfaces:**
- Implements `DelegationAdmission` after normalization and bounds validation but before pending insertion or event publication.
- Primary requests retain ordinary pending behavior. Registered children return internal allow or `DelegationTerminal`. Unregistered children return `DelegationAdmissionError` and create no outcome. Task 20 later adds the handoff fence directly after Step 4a and replaces Step 4e's outcome call with `OutcomeService.createFromOrigin`. Task 17's own tests stay single-level.

- [ ] **Step 1: Create question admission tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/admission-${crypto.randomUUID()}.sqlite`, workers: 1 })
})
afterEach(async () => fixture.close())

test("registered child question creates one handoff and no pending UI", async () => {
  const seeded = await seedAdmissionContext(fixture, { controller: false })
  const result = await fixture.admitQuestion({ sessionID: "child_a", execution: seeded.execution, branch: seeded.branch, payload: seeded.question })
  expect(result).toMatchObject({ kind: "question_handoff", branchID: seeded.branch.branchID })
  expect(await fixture.pending()).toEqual([])
  expect((await fixture.events()).every((event) => event.type === "delegation.outcome.ready")).toBe(true)
})

test("unregistered child returns direct admission error without outcome", async () => {
  const execution = await fixture.acquireExecution({ sessionID: "child_unregistered", rootSessionID: "root_a", kind: "native_child", worker: fixture.worker("worker_a", "epoch_a"), now: 1000 })
  try {
    await fixture.admitQuestion({ sessionID: "child_unregistered", execution, branch: null, payload: { type: "question", questions: [{ header: "Choice", question: "Pick", options: [], allowCustom: true }] } })
    throw new Error("unregistered child unexpectedly admitted")
  } catch (error) {
    expect(error).toEqual({ _tag: "DelegationAdmissionError", code: "unregistered_branch", sessionID: "child_unregistered" })
  }
  expect(await fixture.dbRows("delegation_outcome")).toEqual([])
  expect(await fixture.pending()).toEqual([])
})

test("primary question keeps normal pending behavior", async () => {
  const execution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker: fixture.worker("worker_a", "epoch_a"), now: 1000 })
  const result = await fixture.admitQuestion({ sessionID: "root_a", execution, branch: null, payload: { type: "question", questions: [{ header: "Choice", question: "Pick", options: [], allowCustom: true }] } })
  expect(result).toEqual({ state: "primary_pending" })
  expect(await fixture.pending()).toHaveLength(1)
})

test("registered child with stale branch fence becomes protocol failure without pending UI", async () => {
  const seeded = await seedAdmissionContext(fixture, { controller: false })
  const stale = Object.assign({}, seeded.branch, { branchFencingToken: seeded.branch.branchFencingToken - 1 })
  const result = await fixture.admitQuestion({ sessionID: "child_a", execution: seeded.execution, branch: stale, payload: seeded.question })
  expect(result).toMatchObject({ kind: "protocol_failure", errorCode: "stale_branch" })
  expect(await fixture.pending()).toEqual([])
})
```

```ts
async function seedAdmissionContext(fixture: ReturnType<typeof createDelegationFixture>, input: { controller: boolean }): Promise<{ execution: ExecutionFence; branch: BranchFence; authority: AuthorityFence | null; baseline: PermissionBaseline; question: DelegationOutcomePayload }> {
  await fixture.seedRootSession("root_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const rootExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: rootExecution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  const execution = await fixture.acquireExecution({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
  let authority: AuthorityFence | null = null
  if (input.controller) {
    await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: "broker_hud", buildID: "hud_build", protocol: "opencode.delegation/v1", capabilities: ["controllerLeaseV1"], heartbeatAt: 1000 })
    const acquired = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_a", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 1000 })
    if (acquired.state !== "acquired") throw new Error("expected acquired controller")
    authority = { workerID: worker.workerID, workerEpoch: worker.workerEpoch, leaseID: acquired.leaseID, authorityEpoch: acquired.authorityEpoch }
  }
  return {
    execution,
    branch: acknowledged.branch,
    authority,
    baseline: { decision: "ask", immutableDeny: false, matches: [{ origin: "agent_config", decision: "ask" }] },
    question: { type: "question", questions: [{ header: "Choice", question: "Pick", options: [], allowCustom: true }] },
  }
}
```

- [ ] **Step 2: Create permission precedence tests.**

```ts
test.each([
  ["live GOD ask", { decision: "ask", immutableDeny: false }, true, "allow"],
  ["explicit deny", { decision: "deny", immutableDeny: true }, true, "deny"],
  ["unarmed child ask", { decision: "ask", immutableDeny: false }, false, "permission_handoff"],
] as const)("%s produces %s", async (_name, rule, controller, expected) => {
  const seeded = await seedAdmissionContext(fixture, { controller })
  const baseline = { decision: rule.decision, immutableDeny: rule.immutableDeny, matches: [{ origin: "agent_config" as const, decision: rule.decision }] }
  if (expected === "deny") {
    const result = await fixture.admitPermission({ sessionID: "child_a", baseline, execution: seeded.execution, branch: seeded.branch, authority: seeded.authority, decisionKey: "call_a:ask_1", payload: { type: "permission", permission: "bash", pattern: "git status", description: "inspect" } })
    expect(result).toEqual({ state: "deny" })
    return
  }
  const result = await fixture.admitPermission({ sessionID: "child_a", baseline, execution: seeded.execution, branch: seeded.branch, authority: seeded.authority, decisionKey: "call_a:ask_1", payload: { type: "permission", permission: "bash", pattern: "git status", description: "inspect" } })
  if (expected === "allow") expect(result).toEqual({ state: "allow" })
  if (expected === "permission_handoff") expect(result).toMatchObject({ kind: "permission_handoff" })
  expect(await fixture.pending()).toEqual([])
})
```

- [ ] **Step 3: Run RED.** Run from `packages/core`: `bun test test/delegation-admission.test.ts`. Expected: FAIL because delegated requests still reach pending insertion.

- [ ] **Step 4a: Classify root versus registered child.** Identify whether the request is for the root session or a registered child branch.
- [ ] **Step 4b: Validate execution and branch fences.** Validate the current execution and branch for registered-child requests, returning the direct unregistered error when no branch is registered.
- [ ] **Step 4c: Preserve immutable deny.** Keep immutable deny decisions as deny results without creating delegated outcomes.
- [ ] **Step 4d: Use `PermitService` for GOD allow.** Route an armed GOD allow through `PermitService` and return its allow result.
- [ ] **Step 4e: Create sanitized terminal outcomes.** For the remaining delegated requests, create a sanitized terminal outcome with `branchPath: [branch.branchID]`, the branch's owner execution as `rootOwnerExecution`, and the branch's own `delivery`. Task 20 replaces this with the derived chain.

- [ ] **Step 5: Insert the gate before pending state.** Apply it to legacy and v2 permission/question services and question tools. Publish ordinary question and permission events only for the primary pending result.

- [ ] **Step 6: Run GREEN.** Run from `packages/core`: `bun test test/delegation-admission.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 7: Commit.**

```bash
git add packages/core/src/delegation/admission.ts packages/core/src/permission.ts packages/opencode/src/permission/index.ts packages/core/src/question.ts packages/opencode/src/question/index.ts packages/core/src/tool/question.ts packages/opencode/src/tool/question.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-admission.test.ts
git commit -m "feat(core): admit delegated interactions before prompting"
```

### Task 18: Legacy/v2 interception and wire semantics

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Modify: `packages/core/src/session/runner/llm.ts`
- Modify: `packages/opencode/src/session/processor.ts`
- Modify: `packages/core/src/tool/question.ts`
- Modify: `packages/opencode/src/tool/question.ts`
- Modify: `packages/protocol/src/groups/session.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/middleware/error.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`
- Modify: `packages/opencode/src/session/prompt.ts`
- Create: `packages/core/test/delegation-wire.test.ts`
- Create: `packages/opencode/test/server/delegation.test.ts`

**Interfaces:**
- Legacy blocking prompt returns `DelegationTerminal` synchronously.
- Legacy blocking HTTP route `POST /session/{sessionID}/message` (handler `SessionHttpApi.prompt`, `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`) answers a terminal with HTTP status `409`, `content-type: application/json`, and the exact body `{ "name": "DelegationTerminal", "data": DelegationTerminal }` (the `NamedError.toObject()` shape; `data` has exactly `outcomeID`, `branchID`, `kind`, `errorCode`). `data.branchID` is always the prompted child session's own branch, also when the terminal originated deeper in a nested chain (Task 20). No assistant message, no parts. Every other prompt failure keeps exactly the status and body it has at base `2b7eb922f` (unchanged from `e36bbfbb`: `git diff --stat e36bbfbb 2b7eb922f` touches only `packages/opencode/src/tool/shell.ts` and its test) (this task does not change that mapping). Through the v1 plugin SDK client (`createOpencodeClient`, no `throwOnError`) a terminal therefore arrives as `reply.data === undefined` and `reply.error` deep-equal to that body; this is the only terminal signal plugin callers may detect. It fails closed: an unaware caller sees an error, never an empty successful completion.
- V2 prompt endpoint returns exactly `Admitted` before model/tool execution. Later handoff is announced only by `DelegationOutcomeReady`; semantic payload requires owner-scoped lookup.
- Runners intercept terminal control before ordinary tool result/error publication.

- [ ] **Step 1: Create legacy interception tests.**

```ts
import { expect, test } from "bun:test"
import { LegacyDelegationTestAdapter } from "@opencode-ai/core/session/runner/llm"

test("legacy blocking prompt returns terminal without a synthetic tool error", async () => {
  const harness = LegacyDelegationTestAdapter.make({ terminal: { outcomeID: "outcome_a", branchID: "branch_a", kind: "question_handoff", errorCode: null } })
  const result = await harness.prompt()
  expect(result).toEqual({ outcomeID: "outcome_a", branchID: "branch_a", kind: "question_handoff", errorCode: null })
  expect(harness.parts()).toEqual([])
  expect(harness.modelContinued()).toBe(false)
})
```

- [ ] **Step 2: Create V2 response and event tests.**

```ts
import { expect, test } from "bun:test"
import { DelegationHttpTestAdapter } from "../../src/session/processor"

test("v2 prompt remains admission-only and later event contains IDs only", async () => {
  const harness = await DelegationHttpTestAdapter.make()
  const response = await harness.prompt("session_a")
  expect(response).toEqual({ data: "Admitted" })
  await harness.finishWithHandoff({ outcomeID: "outcome_a", branchID: "branch_a", ownerExecutionID: "exec_a" })
  expect(harness.events()).toEqual([{ type: "delegation.outcome.ready", outcomeID: "outcome_a", branchID: "branch_a", ownerExecutionID: "exec_a" }])
  expect(Object.keys(harness.events()[0] ?? {}).sort()).toEqual(["branchID", "outcomeID", "ownerExecutionID", "type"])
  expect(harness.parts()).toEqual([])
})
```

- [ ] **Step 2b: Create legacy HTTP terminal wire tests** in the same `packages/opencode/test/server/delegation.test.ts`.

```ts
import { createOpencodeClient } from "@opencode-ai/sdk"

const legacyTerminal = { outcomeID: "outcome_a", branchID: "branch_a", kind: "question_handoff", errorCode: null } as const

test("legacy blocking prompt route answers a terminal with 409 DelegationTerminal and no message", async () => {
  const harness = await DelegationHttpTestAdapter.make({ legacyTerminal })
  const raw = await harness.fetch(new Request("http://opencode.test/session/child_a/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parts: [{ type: "text", text: "go" }] }),
  }))
  expect(raw.status).toBe(409)
  expect(raw.headers.get("content-type")).toContain("application/json")
  expect(await raw.json()).toEqual({ name: "DelegationTerminal", data: legacyTerminal })
  expect(harness.parts()).toEqual([])
})

test("plugin v1 SDK client sees the terminal only as reply.error", async () => {
  const harness = await DelegationHttpTestAdapter.make({ legacyTerminal })
  const client = createOpencodeClient({ baseUrl: "http://opencode.test", fetch: (request: Request) => harness.fetch(request) })
  const reply = await client.session.prompt({ path: { id: "child_a" }, body: { parts: [{ type: "text", text: "go" }] } })
  expect(reply.data).toBeUndefined()
  expect(reply.error).toEqual({ name: "DelegationTerminal", data: legacyTerminal })
})

test("ordinary legacy prompt failure is never reported as a terminal", async () => {
  const harness = await DelegationHttpTestAdapter.make({ legacyFailure: new Error("ordinary failure") })
  const raw = await harness.fetch(new Request("http://opencode.test/session/child_a/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parts: [{ type: "text", text: "go" }] }),
  }))
  expect(raw.status).not.toBe(409)
  expect(raw.status).toBeGreaterThanOrEqual(400)
  expect(await raw.text()).not.toContain("DelegationTerminal")
})
```

`DelegationHttpTestAdapter.make(options?: { legacyTerminal?: DelegationTerminal; legacyFailure?: Error })` seeds session `child_a` and makes the production `SessionPrompt.prompt` for it end with that terminal (through `LegacyDelegationTestAdapter`'s production interception path) or fail with that error; `harness.fetch(request)` is the in-process HttpApi `fetch`. With no options it behaves as in Step 2.

- [ ] **Step 3: Create sanitizer-failure interception coverage.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { LegacyDelegationTestAdapter } from "@opencode-ai/core/session/runner/llm"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/wire-sanitizer-${crypto.randomUUID()}.sqlite`, workers: 1 })
  await fixture.seedRootSession("root_a")
})
afterEach(async () => fixture.close())

test("sanitizer failure terminal leaves no child error, pending UI, or asked event", async () => {
  fixture.setSanitizer(async () => { throw new Error("raw-secret-sanitizer-failure") })
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const ownerExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution, parentBranchID: null, kind: "native", delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  const childExecution = await fixture.acquireExecution({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
  const runner = LegacyDelegationTestAdapter.fromAdmission({
    admit: () => fixture.admitQuestion({ sessionID: "child_a", execution: childExecution, branch: acknowledged.branch, payload: { type: "question", questions: [{ header: "Choice", question: "raw-secret-question", options: [], allowCustom: false }] } }),
  })
  const terminal = await runner.prompt()
  expect(terminal).toMatchObject({ kind: "internal_error", errorCode: "sanitizer_failed" })
  expect(runner.parts()).toEqual([])
  expect(runner.modelContinued()).toBe(false)
  expect(await fixture.pending()).toEqual([])
  expect(await fixture.askedEvents()).toEqual([])
  expect(JSON.stringify(await fixture.dbRows("delegation_outcome"))).not.toContain("raw-secret")
})
```

- [ ] **Step 4: Run RED.**

From `packages/core`: `bun test test/delegation-wire.test.ts`

From `packages/opencode`: `bun test test/server/delegation.test.ts`

Expected: FAIL because terminal control is serialized as ordinary tool output or v2 completion, and because the legacy route has no terminal mapping (the Step 2b terminal test sees a non-`409` status).

- [ ] **Step 5: Implement shared interception.** Detect every `DelegationTerminal`, including fixed sanitizer/internal-error terminals, in the runner effect channel; stop the model loop; skip tool part/error publication; end the session with the terminal unchanged. The per-level `branchID` and the deliver-or-surface decision belong to Task 20's `DelegationPropagation.routeChildTerminal`, called by the owning task tool, never by the runner. Export `LegacyDelegationTestAdapter.make` and `.fromAdmission` as thin adapters over this production path, not duplicate test logic.

- [ ] **Step 6: Preserve wire contracts.** Keep the protocol `Admitted` response unchanged; add only the ID event schema and owner-scoped later lookup mapping; map direct `DelegationAdmissionError` through existing HttpApi error middleware. `SessionPrompt.Service.prompt` (`packages/opencode/src/session/prompt.ts`, interface ~line 104) adds the tagged failure `DelegationTerminalSignal { terminal: DelegationTerminal }` to its error channel, and its service wrapper (~line 150, today `prompt(input).pipe(Effect.catch(Effect.die))`) must let exactly that tag through as a typed failure while still turning every other failure into a defect as before. In `SessionHttpApi.prompt`, catch `DelegationTerminalSignal` BEFORE the existing `Effect.mapError(() => new HttpApiError.BadRequest({}))` and return `HttpServerResponse.json({ name: "DelegationTerminal", data: terminal }, { status: 409 })`; every other failure path and the success stream stay byte-for-byte as at base. `prompt_async` keeps logging and discarding. `DelegationHttpTestAdapter.make` starts the in-process HttpApi and subscribes to its production event stream.

- [ ] **Step 7: Run GREEN.**

From `packages/core`: `bun test test/delegation-wire.test.ts && bun run typecheck`

From `packages/opencode`: `bun run test:httpapi && bun test test/server/delegation.test.ts && bun run typecheck`

From `packages/protocol`: `bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 8: Commit.**

```bash
git add packages/core/src/session/runner/llm.ts packages/opencode/src/session/processor.ts packages/core/src/tool/question.ts packages/opencode/src/tool/question.ts packages/protocol/src/groups/session.ts packages/opencode/src/server/routes/instance/httpapi/middleware/error.ts packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts packages/opencode/src/session/prompt.ts packages/core/test/delegation-wire.test.ts packages/opencode/test/server/delegation.test.ts
git commit -m "feat(protocol): preserve delegation wire semantics"
```

### Task 19: Native foreground and background delivery

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/delivery.ts`
- Modify: `packages/core/src/background-job.ts`
- Modify: `packages/core/src/session/input.ts`
- Modify: `packages/core/src/session/projector.ts`
- Modify: `packages/schema/src/session-event.ts`
- Modify: `packages/schema/src/session-input.ts`
- Modify: `packages/core/src/session/execution/local.ts`
- Modify: `packages/opencode/src/tool/task.ts`
- Modify: `packages/core/src/delegation/branch.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-delivery.test.ts`
- Create: `packages/opencode/test/tool/task-delegation.test.ts`
- Create: `packages/core/test/delegation-protocol.test.ts`

**Interfaces:**
- Implements `DelegationDelivery` with durable claim leases, root-input idempotency by `outcomeID`, replay, acknowledgement, and branch retirement.
- Foreground returns the stored typed outcome only to the outcome's `rootOwnerExecution` presenting the outermost branch (`branchPath[0]`), and only for an outcome whose `delivery` is `foreground` (a `background` outcome, including one re-labelled by promotion, rejects with `invalid_outcome_state` and changes nothing). After Task 20, a native task tool reaches foreground delivery only through `DelegationPropagation.routeChildTerminal`. Background appends one bounded synthetic result containing only the outcome ID.
- Owns the fixture capability `persistDeliveryIntent` and the core delivery integration suite in `packages/core/test/delegation-protocol.test.ts`.
- The core integration body below is owned here and runs with the delivery GREEN checks; it is not a Task 26 implementation.
- `packages/opencode/src/tool/task.ts` registers each native child before prompting it, in exactly this order: `currentExecution` (the calling session) -> `reserveBranch` (parentBranchID = the calling session's own branch ID, or null when the caller is root; kind `native`; delivery as requested) -> child session create -> `bindBranch` -> `acknowledgeBranch({ ownerComponent: "core", ownerBuildID: <core build ID>, protocol })` -> child prompt. Any failure before the prompt calls `failBranch` and never prompts. The tool never calls `startBranch`: the child prompt's runner acquisition moves the branch `acknowledged -> running` (Task 10 runner branch start).
- Production context (decided 2026-10-08): `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` is on only in attended tmux TUIs. systemd Workers, the supervisor and `oc-task` run with it off, so in those processes every native branch is reserved `foreground`, nothing is promoted, and `background=true` is refused. Every test below that depends on the flag passes it explicitly (`backgroundSubagents` in the adapter, provided as `RuntimeFlags.layer({ experimentalBackgroundSubagents })`).
- Flag gate first (decided 2026-10-08): the existing refusal `if (runInBackground && !flags.experimentalBackgroundSubagents) return yield* Effect.fail(new Error("Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true"))` (`task.ts:97-102` at `2b7eb922f`) stays the first statement of `TaskTool.execute`, unchanged in text, before `currentExecution`, `reserveBranch` and every other delegation call. A refused call makes no delegation call and leaves no `delegation_branch` row.
- Promotion (decided 2026-10-08): `delivery` changes only one way, foreground -> background. `BranchService.setDelivery({ branch, delivery })` runs in one immediate transaction that validates the branch fence like every other branch mutation and never changes `branchFencingToken`, then: same value -> no write, returns it; `foreground -> background` on a branch in `acknowledged`, `running` or `handoff` -> sets `delivery = "background"` and, in the same transaction, sets `delivery = "background"` on the outcome that has this branch as `branchPath[0]` and is still `pending_delivery` with no delivery claim (foreground delivery acknowledges in the same path, Step 5c, so such an outcome has not reached a model); any change on a branch in a terminal state (`outcome_acknowledged`, `retiring`, `retired`; Task 10 closed-branch rule, decided 2026-10-08) -> rejects with `branch_already_terminal` and writes nothing; `background -> foreground`, or any change on a branch in another state -> rejects with `invalid_branch_state` and writes nothing. In `task.ts`, when the foreground race (`background.wait` vs `background.waitForPromotion`, `task.ts:334-338` at `2b7eb922f`) resolves to a promoted job (`result?.metadata?.background === true`), the tool calls `setDelivery({ branch, delivery: "background" })` and then returns `backgroundResult()` with `metadata.delivery: "background"`: the promoted call's tool result is the background result, and the outcome is delivered only by Steps 5d-5f. The call is made in the tool's own fiber, not in `onPromote`: `BackgroundJob.promote` resolves `promoted` before it runs `onPromote` and ignores `onPromote` failures (`packages/core/src/background-job.ts:310-335` at `2b7eb922f`). A `setDelivery` rejection fails the tool with that typed error. Nothing ever calls `setDelivery` with `"foreground"`.
- Resume (decided 2026-10-08): when `params.task_id` resolves to an existing child session (`task.ts:136-138` at `2b7eb922f`), the order is `currentExecution` -> `BranchService.bound({ childSessionID: task_id, callerSessionID: ctx.sessionID })` -> `background.extend` (`task.ts:267`) or the ordinary prompt path. `bound` is a read of the branch bound to that child through child-session uniqueness (`delegation_branch.child_session_id`; the open branch, else the most recently reserved one, Task 3), rejecting with `unregistered_branch` when none is bound and `wrong_parent` when its `parentSessionID` is not the caller; it never reserves, binds or acknowledges. Then, by the returned `state`:
  - open (`reserved`, `registered`, `acknowledged` or `running`; a running child, including `background.extend`, and a second resume while a branch created by an earlier resume is still open): the tool reuses that branch and calls nothing else before the prompt. Whether the resumed prompt may run is decided by Task 10's runner rule and the execution-owner rules on the reused branch, unchanged.
  - closed (`handoff`, `outcome_acknowledged`, `retiring` or `retired`; a finished child, whether or not the root has consumed its outcome yet; decided 2026-10-08 by Holden, preserving today's successful resume): the tool binds the resumed run to a NEW branch for the same child session with the fresh-spawn sequence minus child-session creation: `reserveBranch` (parentBranchID = the calling session's own branch ID or null, kind `native`, delivery as requested by this call; the flag gate has already run) -> `bindBranch({ childSessionID: task_id })` -> `acknowledgeBranch` -> child prompt, with `failBranch` on the new branch for any failure before the prompt. Parent and fencing rules are those of a fresh spawn (bind's canonical-parent check, Task 20 reserve-time `parentBranchID` validation). The closed branch is never reopened or written. A `handoff` branch's pending outcome is untouched by the resume: it is delivered and acknowledged through Steps 5a-5f exactly once (acknowledgement then moves that branch to `retired`), and it is never attached to the new branch, whose own terminal, if any, is a separate outcome with its own `branchPath`.
  The tool reports the reused or new branch's `branchID` and record `delivery` in its metadata.
- Creating-part shape (decided 2026-10-08): the task tool part that creates a child keeps `state.input.background` (the model's input), `state.metadata.sessionId` (the child session) and `state.metadata.background` (`true` only for a background or promoted call, absent otherwise, `task.ts:185-190` at `2b7eb922f`) exactly as today; Task 19 only adds `delivery`, `branchID` and `ownerExecutionID`. The bounded synthetic background result appended to the root is a synthetic text input carrying the outcome ID, never a `type: "tool"`, `tool: "task"` part and never a part carrying `state.input.background`.
- Fixture addition owned here: `setBranchDelivery(input: { branch: BranchFence; delivery: "foreground" | "background" }): Promise<{ delivery: "foreground" | "background" }>` calls the production `BranchService.setDelivery`. Add it, and the `bound`/`setDelivery` members to the `BranchService` interface in `branch.ts`, before the first test.

- [ ] **Step 1: Create foreground and single-owner tests.**

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/delivery-${crypto.randomUUID()}.sqlite`, workers: 2 })
})
afterEach(async () => fixture.close())

test("foreground delivery resolves one stored terminal to one root owner and retires the branch", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground")
   const result = await fixture.foreground(seeded.foreground)
  expect(result).toEqual({ terminal: expect.objectContaining({ outcomeID: seeded.outcomeID }), payload: seeded.payload })
  expect(await fixture.rootDeliveries(seeded.outcomeID)).toHaveLength(1)
  expect(await fixture.outcomeState(seeded.outcomeID)).toBe("acknowledged")
   expect(await fixture.branchState(seeded.branch.branchID)).toBe("retired")
})
```

- [ ] **Step 2: Create background crash replay and stale acknowledgement tests.**

```ts
test("replay after append before acknowledgement does not duplicate root input", async () => {
  const seeded = await seedDeliveryContext(fixture, "background")
  const claim = await fixture.claimBackground({ worker: seeded.worker, now: 1000 })
  if (!claim) throw new Error("expected a delivery claim")
  await fixture.appendClaim({ outcomeID: claim.outcomeID, deliveryClaimID: claim.deliveryClaimID, ownerExecution: seeded.execution })
  expect(await fixture.rootDeliveries(seeded.outcomeID)).toHaveLength(1)
  await fixture.recoverDelivery({ worker: seeded.worker, now: 8000 })
  expect(await fixture.rootDeliveries(seeded.outcomeID)).toHaveLength(1)
})

test("stale Worker outcome acknowledgement leaves state unchanged", async () => {
  const seeded = await seedDeliveryContext(fixture, "background")
  const before = await fixture.dbRows("delegation_outcome")
  await expect(fixture.acknowledgeOutcome(Object.assign({}, seeded.acknowledge, { worker: { workerID: seeded.worker.workerID, workerEpoch: "stale_epoch" } }))).rejects.toMatchObject({ code: "stale_worker" })
  const after = await fixture.dbRows("delegation_outcome")
  expect(after).toEqual(before)
})

test("current owner acknowledgement retires the handoff branch", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground")
  await fixture.acknowledgeOutcome(seeded.acknowledge)
  expect(await fixture.branchState(seeded.branch.branchID)).toBe("retired")
})

test("recovery consumes a persisted fenced delivery intent", async () => {
  const seeded = await seedDeliveryContext(fixture, "background", { persistOutcome: true, persistDeliveryIntent: true })
  await fixture.recoverDelivery({ worker: seeded.worker, now: 8000 })
  expect(await fixture.branchState(seeded.branch.branchID)).toBe("retired")
})

const branchRow = async (branchID: string) => (await fixture.dbRows("delegation_branch")).find((row) => row.branch_id === branchID)
const outcomeRow = async (outcomeID: string) => (await fixture.dbRows("delegation_outcome")).find((row) => row.outcome_id === outcomeID)

test("promotion flips a running foreground branch to background once", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground", { persistOutcome: false })
  expect(await fixture.setBranchDelivery({ branch: seeded.branch, delivery: "background" })).toEqual({ delivery: "background" })
  expect((await branchRow(seeded.branch.branchID))?.delivery).toBe("background")
  expect(await fixture.branchState(seeded.branch.branchID)).toBe("running")
  const before = await fixture.dbRows("delegation_branch")
  expect(await fixture.setBranchDelivery({ branch: seeded.branch, delivery: "background" })).toEqual({ delivery: "background" })
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
})

test("a promoted branch refuses foreground and stays background", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground", { persistOutcome: false })
  await fixture.setBranchDelivery({ branch: seeded.branch, delivery: "background" })
  const before = await fixture.dbRows("delegation_branch")
  await expect(fixture.setBranchDelivery({ branch: seeded.branch, delivery: "foreground" })).rejects.toMatchObject({ code: "invalid_branch_state" })
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
  expect((await branchRow(seeded.branch.branchID))?.delivery).toBe("background")
})

test("promotion committed after a foreground handoff re-labels the pending outcome for background delivery", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground")
  expect(await fixture.branchState(seeded.branch.branchID)).toBe("handoff")
  await fixture.setBranchDelivery({ branch: seeded.branch, delivery: "background" })
  expect((await outcomeRow(seeded.outcomeID))?.delivery).toBe("background")
  const claim = await fixture.claimBackground({ worker: seeded.worker, now: 1000 })
  if (!claim) throw new Error("expected a delivery claim")
  expect(claim.outcomeID).toBe(seeded.outcomeID)
  await fixture.appendClaim({ outcomeID: claim.outcomeID, deliveryClaimID: claim.deliveryClaimID, ownerExecution: seeded.execution })
  expect(await fixture.rootDeliveries(seeded.outcomeID)).toHaveLength(1)
})

test("a branch retired by foreground delivery cannot be promoted", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground")
  await fixture.foreground(seeded.foreground)
  const before = await fixture.dbRows("delegation_branch")
  await expect(fixture.setBranchDelivery({ branch: seeded.branch, delivery: "background" })).rejects.toMatchObject({ code: "branch_already_terminal" })
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
})

test("tool.authorize input reads a promoted branch's delivery from the record", async () => {
  const seeded = await seedDeliveryContext(fixture, "foreground", { persistOutcome: false })
  await fixture.setBranchDelivery({ branch: seeded.branch, delivery: "background" })
  const childExecution = await fixture.acquireExecution({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker: seeded.worker, now: 1000 })
  const input = await fixture.authorizeInput({ sessionID: "child_a", tool: "bash", callID: "call_promoted", arguments: { command: "git status" }, baseline: { decision: "ask", immutableDeny: false, matches: [{ origin: "agent_config", decision: "ask" }] }, worker: seeded.worker, execution: childExecution, authority: null })
  expect(input.branch).toMatchObject({ branchID: seeded.branch.branchID, delivery: "background", kind: "native" })
})
```

```ts
async function seedDeliveryContext(fixture: ReturnType<typeof createDelegationFixture>, delivery: "foreground" | "background", options: { persistOutcome?: boolean; persistDeliveryIntent?: boolean } = {}): Promise<{ worker: WorkerFence; execution: ExecutionFence; branch: BranchFence; outcomeID: string; payload: DelegationOutcomePayload; foreground: ForegroundDeliveryInput; acknowledge: AcknowledgeOutcomeInput }> {
  await fixture.seedRootSession("root_a")
  await fixture.seedChildSession("child_a", "root_a")
  fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload }))
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
  for (const participant of [
    { component: "core" as const, buildID: "core_build", capabilities: ["controllerLeaseV1"] },
    { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] },
  ]) await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: 1000 })
  const execution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  const payload: DelegationOutcomePayload = { type: "permission", permission: "bash", pattern: "git status", description: "inspect" }
  let outcomeID = "outcome_not_persisted"
  if (options.persistOutcome !== false) {
    const terminal = await fixture.createOutcome({ idempotencyKey: `delivery-${delivery}-${crypto.randomUUID()}`, kind: "permission_handoff", errorCode: null, origin: acknowledged.branch, rootOwnerExecution: execution, branchPath: [acknowledged.branch.branchID], candidate: payload, delivery })
    outcomeID = terminal.outcomeID
  }
  if (options.persistDeliveryIntent) await fixture.persistDeliveryIntent({ outcomeID, branch: acknowledged.branch, ownerExecution: execution, worker })
    const foreground = { outcomeID, branch: acknowledged.branch, ownerExecution: execution, worker }
   return { worker, execution, branch: acknowledged.branch, outcomeID, payload, foreground, acknowledge: { ...foreground, worker } }
}
```

- [ ] **Step 3: Create native task adapter test.**

```ts
import { NativeTaskDelegationTestAdapter } from "../../src/tool/task"

test.each(["foreground", "background"] as const)("native %s task registers durable delivery metadata", async (delivery) => {
  const harness = NativeTaskDelegationTestAdapter.make(delivery, { backgroundSubagents: true })
  const result = await harness.run()
   expect(result.branchState).toBe(delivery === "foreground" ? "retired" : "handoff")
  expect(result.metadata).toMatchObject({ delivery, branchID: expect.any(String), ownerExecutionID: expect.any(String) })
})

test("native task registers the child in the fixed order before prompting it", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("foreground", { backgroundSubagents: false })
  const result = await harness.run()
  expect(result.toolError).toBeNull()
  expect(harness.registrationCalls()).toEqual(["currentExecution", "reserveBranch", "createChildSession", "bindBranch", "acknowledgeBranch", "promptChild"])
})

test("a rejected acknowledgeBranch fails the branch once and never prompts the child", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("foreground", { backgroundSubagents: false, reject: "acknowledgeBranch" })
  const result = await harness.run()
  expect(result.toolError).toMatchObject({ _tag: "DelegationBranchError", code: "protocol_mismatch" })
  expect(harness.registrationCalls()).toEqual(["currentExecution", "reserveBranch", "createChildSession", "bindBranch", "acknowledgeBranch", "failBranch"])
})

test("background=true with the flag off is refused before any branch is reserved", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("background", { backgroundSubagents: false })
  const result = await harness.run()
  expect(result.toolError).toMatchObject({ message: "Background subagents require OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=true" })
  expect(result.branchState).toBeNull()
  expect(harness.registrationCalls()).toEqual([])
  expect(await harness.branches()).toEqual([])
})

test("a promoted foreground task flips its branch to background and returns the background result", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("foreground", { backgroundSubagents: true, holdChild: true })
  const pending = harness.run()
  await harness.promote()
  const result = await pending
  harness.release()
  expect(result.toolError).toBeNull()
  expect(result.output).toContain("The task is working in the background.")
  expect(result.metadata).toMatchObject({ background: true, delivery: "background", branchID: expect.any(String) })
  const branches = await harness.branches()
  expect(branches).toHaveLength(1)
  expect(branches[0]).toMatchObject({ branchID: (result.metadata as { branchID: string }).branchID, delivery: "background" })
})

test("a task_id resume of a running background child reuses its bound branch", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("background", { backgroundSubagents: true, holdChild: true })
  const first = await harness.run()
  const firstMetadata = first.metadata as { sessionId: string; branchID: string }
  const before = await harness.branches()
  expect(before.find((branch) => branch.branchID === firstMetadata.branchID)).toMatchObject({ state: "running" })
  const resumed = await harness.run({ taskID: firstMetadata.sessionId })
  harness.release()
  expect(resumed.toolError).toBeNull()
  expect(resumed.output).toContain("Additional context sent to the running background task.")
  expect(resumed.metadata).toMatchObject({ sessionId: firstMetadata.sessionId, branchID: firstMetadata.branchID })
  expect(await harness.branches()).toHaveLength(before.length)
  expect(harness.registrationCalls().slice(0, 2)).toEqual(["currentExecution", "boundBranch"])
  for (const call of ["reserveBranch", "createChildSession", "bindBranch", "acknowledgeBranch"]) expect(harness.registrationCalls()).not.toContain(call)
})

test("a task_id resume of a completed child succeeds on a new branch bound to the same session and leaves the old branch retired", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("foreground", { backgroundSubagents: false })
  const first = await harness.run()
  expect(first.toolError).toBeNull()
  expect(first.branchState).toBe("retired")
  const firstMetadata = first.metadata as { sessionId: string; branchID: string }
  const oldBranch = (await harness.branches()).find((branch) => branch.branchID === firstMetadata.branchID)
  expect(oldBranch).toMatchObject({ childSessionID: firstMetadata.sessionId, state: "retired" })
  const resumed = await harness.run({ taskID: firstMetadata.sessionId })
  expect(resumed.toolError).toBeNull()
  const resumedMetadata = resumed.metadata as { sessionId: string; branchID: string }
  expect(resumedMetadata.sessionId).toBe(firstMetadata.sessionId)
  expect(resumedMetadata.branchID).not.toBe(firstMetadata.branchID)
  expect(harness.registrationCalls()).toEqual(["currentExecution", "boundBranch", "reserveBranch", "bindBranch", "acknowledgeBranch", "promptChild"])
  const branches = await harness.branches()
  expect(branches).toHaveLength(2)
  expect(branches.find((branch) => branch.branchID === firstMetadata.branchID)).toEqual(oldBranch)
  expect(branches.find((branch) => branch.branchID === resumedMetadata.branchID)).toMatchObject({ childSessionID: firstMetadata.sessionId, kind: "native", delivery: "foreground", state: "retired" })
})

test("a task_id resume of a finished background child whose outcome is undelivered succeeds on a new branch, and the old outcome is delivered exactly once and never merged", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("background", { backgroundSubagents: true })
  const first = await harness.run()
  expect(first.toolError).toBeNull()
  expect(first.branchState).toBe("handoff")
  const firstOutcomeID = first.outcomeID
  if (!firstOutcomeID) throw new Error("expected a background handoff outcome")
  const firstMetadata = first.metadata as { sessionId: string; branchID: string }
  const oldBranch = (await harness.branches()).find((branch) => branch.branchID === firstMetadata.branchID)
  expect(oldBranch).toMatchObject({ childSessionID: firstMetadata.sessionId, state: "handoff" })
  const resumed = await harness.run({ taskID: firstMetadata.sessionId })
  expect(resumed.toolError).toBeNull()
  const resumedMetadata = resumed.metadata as { sessionId: string; branchID: string }
  expect(resumedMetadata.sessionId).toBe(firstMetadata.sessionId)
  expect(resumedMetadata.branchID).not.toBe(firstMetadata.branchID)
  expect(harness.registrationCalls()).toEqual(["currentExecution", "boundBranch", "reserveBranch", "bindBranch", "acknowledgeBranch", "promptChild"])
  const resumedOutcomeID = resumed.outcomeID
  if (!resumedOutcomeID) throw new Error("expected the resumed run's own background handoff outcome")
  expect(resumedOutcomeID).not.toBe(firstOutcomeID)
  const branches = await harness.branches()
  expect(branches).toHaveLength(2)
  expect(branches.find((branch) => branch.branchID === firstMetadata.branchID)).toEqual(oldBranch)
  expect(branches.find((branch) => branch.branchID === resumedMetadata.branchID)).toMatchObject({ childSessionID: firstMetadata.sessionId, kind: "native", delivery: "background" })
  // Two delivery passes: the second must append nothing again.
  await harness.deliverBackground()
  await harness.deliverBackground()
  const texts = (await harness.rootRecords()).map((record) => JSON.stringify(record))
  expect(texts.filter((text) => text.includes(firstOutcomeID))).toHaveLength(1)
  expect(texts.filter((text) => text.includes(resumedOutcomeID))).toHaveLength(1)
  expect(texts.filter((text) => text.includes(firstOutcomeID) && text.includes(resumedOutcomeID))).toEqual([])
})

test("a second task_id resume while the new branch of a handoff-state child is open reuses that branch", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("background", { backgroundSubagents: true, holdChild: true })
  const first = await harness.run()
  const firstMetadata = first.metadata as { sessionId: string; branchID: string }
  harness.release()
  await harness.settled()
  const oldBranch = (await harness.branches()).find((branch) => branch.branchID === firstMetadata.branchID)
  expect(oldBranch).toMatchObject({ state: "handoff" })
  const second = await harness.run({ taskID: firstMetadata.sessionId })
  expect(second.toolError).toBeNull()
  const secondMetadata = second.metadata as { sessionId: string; branchID: string }
  expect(secondMetadata.branchID).not.toBe(firstMetadata.branchID)
  expect((await harness.branches()).find((branch) => branch.branchID === secondMetadata.branchID)).toMatchObject({ state: "running" })
  const third = await harness.run({ taskID: firstMetadata.sessionId })
  harness.release()
  expect(third.toolError).toBeNull()
  expect(third.output).toContain("Additional context sent to the running background task.")
  expect(third.metadata).toMatchObject({ sessionId: firstMetadata.sessionId, branchID: secondMetadata.branchID })
  expect(harness.registrationCalls().slice(0, 2)).toEqual(["currentExecution", "boundBranch"])
  for (const call of ["reserveBranch", "createChildSession", "bindBranch", "acknowledgeBranch"]) expect(harness.registrationCalls()).not.toContain(call)
  const branches = await harness.branches()
  expect(branches).toHaveLength(2)
  expect(branches.find((branch) => branch.branchID === firstMetadata.branchID)).toEqual(oldBranch)
})

test.each(["foreground", "background"] as const)("the creating %s task part keeps today's input and metadata shape", async (delivery) => {
  const harness = NativeTaskDelegationTestAdapter.make(delivery, { backgroundSubagents: true })
  const result = await harness.run()
  const childSessionID = (result.metadata as { sessionId: string }).sessionId
  const part = await harness.taskPart()
  if (!part) throw new Error("expected the creating task part")
  expect(part).toMatchObject({ type: "tool", tool: "task", state: { input: { background: delivery === "background" }, metadata: { sessionId: childSessionID } } })
  if (delivery === "background") expect(part.state.metadata?.background).toBe(true)
  else expect(Object.keys(part.state.metadata ?? {})).not.toContain("background")
})

test("the synthetic background result is not a task tool part carrying state.input.background", async () => {
  const harness = NativeTaskDelegationTestAdapter.make("background", { backgroundSubagents: true })
  const result = await harness.run()
  const outcomeID = result.outcomeID
  if (!outcomeID) throw new Error("expected a background handoff outcome")
  await harness.deliverBackground()
  const records = await harness.rootRecords()
  const synthetic = records.filter((record) => JSON.stringify(record).includes(outcomeID))
  expect(synthetic).toHaveLength(1)
  expect(synthetic[0]).not.toMatchObject({ type: "tool" })
  expect(JSON.stringify(synthetic[0])).not.toContain("\"background\"")
  const creating = records.filter((record) => record.type === "tool" && record.tool === "task")
  expect(creating).toHaveLength(1)
  expect(creating[0]).toEqual(await harness.taskPart())
})
```

- [ ] **Step 3b: Create the core delivery integration suite** in `packages/core/test/delegation-protocol.test.ts`. This task owns this body; Task 26 only re-runs it. It wires the core scenario using the complete fixture methods and public schema, plugin, and core contracts plus fake trusted participants. It imports no later consumer implementation; guard behavior is represented by its published hook contracts.

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import { createDelegationFixture } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/protocol-${crypto.randomUUID()}.sqlite`, workers: 2 })
  await fixture.seedRootSession("root_a")
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
  for (const participant of [
    { component: "core" as const, buildID: "core_build", capabilities: ["controllerLeaseV1"] },
    { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] },
    { component: "broker_hud" as const, buildID: "hud_build", capabilities: ["controllerLeaseV1"] },
  ]) await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: 1000 })
  await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_a", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 1000 })
  await fixture.seedChildSession("child_a", "root_a")
  fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload.type === "permission" ? { type: "permission", permission: input.payload.permission, pattern: "[redacted]", description: input.payload.description } : input.payload }))
})
afterEach(async () => fixture.close())

test.each(["foreground", "background"] as const)("delivers one sanitized native %s handoff", async (delivery) => {
  const scenario = await integrationScenario(fixture, { delivery })
  const terminal = await scenario.askPermission("raw-secret-command")
  expect(terminal.kind).toBe("permission_handoff")
  expect(await fixture.pending()).toEqual([])
  expect(JSON.stringify(await fixture.dbRows("delegation_outcome"))).not.toContain("raw-secret-command")
  await scenario.deliver()
  await scenario.deliver()
  expect(await fixture.rootDeliveries(terminal.outcomeID)).toHaveLength(1)
})

test("crash replay and owner lookup remain fenced", async () => {
  const scenario = await integrationScenario(fixture, { delivery: "background" })
  const terminal = await scenario.askQuestion()
  await scenario.crashAfterAppend()
  await scenario.recover()
  expect(await fixture.rootDeliveries(terminal.outcomeID)).toHaveLength(1)
  await expect(scenario.lookupFrom("branch_other", scenario.ownerExecutionID)).rejects.toMatchObject({ code: "wrong_owner" })
  await expect(scenario.lookupFrom(scenario.branchID, "exec_other")).rejects.toMatchObject({ code: "wrong_owner" })
})
```

```ts
async function integrationScenario(fixture: ReturnType<typeof createDelegationFixture>, input: { delivery: "foreground" | "background" }): Promise<{ branchID: string; ownerExecutionID: string; askPermission(pattern: string): Promise<DelegationTerminal>; askQuestion(): Promise<DelegationTerminal>; deliver(): Promise<void>; crashAfterAppend(): Promise<void>; recover(): Promise<void>; lookupFrom(branchID: string, executionID: string): Promise<DelegationOutcomePayload> }> {
  const worker = fixture.worker("worker_a", "epoch_a", "core_build")
  const ownerExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
  const reserved = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution, parentBranchID: null, kind: "native", delivery: input.delivery })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_a" })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  const childExecution = await fixture.acquireExecution({ sessionID: "child_a", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
  let latest: DelegationTerminal | undefined

  const requireTerminal = () => {
    if (!latest) throw new Error("scenario has no terminal outcome")
    return latest
  }
  const record = (result: { state: "allow" } | { state: "deny" } | DelegationTerminal): DelegationTerminal => {
    if ("state" in result) throw new Error(`expected terminal, received ${result.state}`)
    latest = result
    return result
  }
  const appendBackground = async () => {
    const terminal = requireTerminal()
    const claim = await fixture.claimBackground({ worker, now: 1000 })
    if (!claim) return
    if (claim.outcomeID !== terminal.outcomeID) throw new Error("claimed wrong outcome")
    await fixture.appendClaim({ outcomeID: claim.outcomeID, deliveryClaimID: claim.deliveryClaimID, ownerExecution })
  }
  return {
    branchID: acknowledged.branch.branchID,
    ownerExecutionID: ownerExecution.executionID,
    askPermission: async (pattern) => record(await fixture.admitPermission({ sessionID: "child_a", baseline: { decision: "ask", immutableDeny: false, matches: [{ origin: "agent_config", decision: "ask" }] }, execution: childExecution, branch: acknowledged.branch, authority: null, decisionKey: `permission-${crypto.randomUUID()}`, payload: { type: "permission", permission: "bash", pattern, description: "inspect" } })),
    askQuestion: async () => {
      const result = await fixture.admitQuestion({ sessionID: "child_a", execution: childExecution, branch: acknowledged.branch, payload: { type: "question", questions: [{ header: "Choice", question: "Pick", options: [], allowCustom: true }] } })
      if ("state" in result) throw new Error("expected question terminal")
      latest = result
      return result
    },
    deliver: async () => {
      const terminal = requireTerminal()
       if (input.delivery === "background") return appendBackground()
       await fixture.foreground({ outcomeID: terminal.outcomeID, branch: acknowledged.branch, ownerExecution, worker })
    },
    crashAfterAppend: appendBackground,
    recover: async () => { await fixture.recoverDelivery({ worker, now: 8000 }) },
    lookupFrom: (branchID, executionID) => fixture.resolveOutcome({ outcomeID: requireTerminal().outcomeID, branch: { ...acknowledged.branch, branchID }, ownerExecution: { ...ownerExecution, executionID } }),
  }
}
```

- [ ] **Step 4: Run RED.**

From `packages/core`: `bun test test/delegation-delivery.test.ts test/delegation-protocol.test.ts`

From `packages/opencode`: `bun test test/tool/task-delegation.test.ts`

Expected: FAIL because delivery is process-local and lacks durable claims. The two registration-order tests fail because `harness.registrationCalls` is not a function (and `make` ignores the `reject` option), not on a load error. The integration suite in `test/delegation-protocol.test.ts` fails for the same reason: the durable delivery path it drives is absent. The five core promotion tests fail with `setDelivery is not a function` (the fixture reaches a `BranchService` layer that has the interface member but no implementation). The flag-off, promotion, all four resume (running child, completed child, child in `handoff`, second resume while the new branch is open), creating-part and synthetic-result tests fail because `harness.branches`, `harness.promote`, `harness.taskPart`, `harness.deliverBackground`, `harness.rootRecords` and `harness.settled` are not functions and `make` ignores `backgroundSubagents`/`holdChild`; none fails on a load error. Were the adapter complete but `bound`/`task.ts` to reuse a `handoff` branch, the `handoff` resume test would fail on `toolError` (`invalid_branch_state` from Task 10's runner rule) and the second-resume test on its first `branchID` inequality.

- [ ] **Step 5a: Implement foreground delivery.** Resolve the owner root, require `branch.branchID === branchPath[0]` and `ownerExecution.executionID === rootOwnerExecutionID` (else `wrong_owner`), require the outcome's `delivery` to be `foreground` (else `invalid_outcome_state`, no write), and return the stored typed payload.
- [ ] **Step 5b: Implement root idempotent append.** Append one root input keyed by `outcomeID`, or return the already-appended input synchronously.
- [ ] **Step 5c: Implement foreground acknowledgement.** Acknowledge the outcome and retire every `handoff` branch in `branchPath` in the same production delivery path.
- [ ] **Step 5d: Implement background claim.** Atomically claim one pending outcome and validate the current root execution.
- [ ] **Step 5e: Implement background append.** Append one bounded synthetic result containing only the outcome ID and mark delivered after durable append.
- [ ] **Step 5f: Implement background acknowledgement.** Acknowledge after consumption and preserve the handoff state until acknowledgement.
- [ ] **Step 5g: Implement recovery.** Expire abandoned claims; if an idempotent root input exists, advance without append; if an outcome never persisted, fail and retire the fenced branch without inventing content.
- [ ] **Step 5h: Implement the native foreground/background adapter.** `NativeTaskDelegationTestAdapter.make` invokes the production adapter against the Task 3 fixture and exposes returned metadata without reproducing delivery logic. Implement the registration order from Interfaces in `packages/opencode/src/tool/task.ts`, with `failBranch` on any failure before the prompt, and with the flag gate (`task.ts:97-102` at `2b7eb922f`) left as the first statement so a refused `background=true` call reaches no delegation call. Exact adapter shape: `make(delivery: "foreground" | "background", options: { backgroundSubagents: boolean; reject?: "acknowledgeBranch"; holdChild?: boolean }): { run(input?: { taskID?: string }): Promise<{ branchState: string | null; metadata: unknown; toolError: unknown; output: string | null; outcomeID: string | null }>; registrationCalls(): readonly string[]; branches(): Promise<readonly { branchID: string; childSessionID: string | null; delivery: "foreground" | "background"; kind: "native" | "workflow"; state: string }[]>; promote(): Promise<void>; release(): void; settled(): Promise<void>; taskPart(): Promise<{ type: "tool"; tool: string; state: { input: Record<string, unknown>; metadata?: Record<string, unknown> } } | undefined>; deliverBackground(): Promise<void>; rootRecords(): Promise<readonly Record<string, unknown>[]> }`. `backgroundSubagents` is required and is provided as `RuntimeFlags.layer({ experimentalBackgroundSubagents: backgroundSubagents })`, the pattern of `packages/opencode/test/tool/task.test.ts:37-59` at `2b7eb922f`. Each `run` invokes the production task tool with `background: delivery === "background"` and, when given, `task_id: taskID`. `run()` never rejects: `toolError` is `null` on success and otherwise the tool's typed failure; `branchState` is `null` when the run left no branch; `output` is the tool result's output text; `outcomeID` is the handoff outcome whose `branchPath[0]` is the branch this run reserved or reused, read from durable state, or `null` (so a resume on a new branch never reports the old branch's outcome). `holdChild: true` keeps every child prompt pending, after runner acquisition has moved its branch to `running`, until `release()`, which resolves every prompt held at that moment with an empty text result; prompts started later are held again. `settled()` resolves once every released child prompt has finished and its branch has left `running` (to `retired` or `handoff`). `promote()` waits until the held child prompt is in flight, then calls the production `BackgroundJob.Service.promote(childSessionID)`. `branches()` reads `delegation_branch` through the fixture. `taskPart()` returns the most recent run's task tool part in the calling session, and `rootRecords()` every persisted part and session input of the root session in order, both through the production session repository. `deliverBackground()` runs the production `claimBackground` and `appendClaim` for the root owner until no unclaimed pending background outcome remains, oldest first, and does nothing when none is pending. The adapter wraps the fixture-backed services the production tool calls in a recorder that forwards each call unchanged; `registrationCalls()` returns, in call order, the names recorded during the most recent `run` from the closed set `currentExecution`, `boundBranch`, `reserveBranch`, `createChildSession`, `bindBranch`, `acknowledgeBranch`, `failBranch`, `promptChild`, and records nothing after `promptChild`, so later delivery and propagation calls never change the list. `reject: "acknowledgeBranch"` makes the recorder record that call and fail it with `DelegationBranchError { code: "protocol_mismatch" }` without forwarding it. The recorder holds no ordering or failure-handling logic of its own.
- [ ] **Step 5i: Implement one-way promotion and resume reuse.** In `packages/core/src/delegation/branch.ts` implement `BranchService.bound` and `BranchService.setDelivery` exactly as Interfaces states (one immediate transaction for `setDelivery`; the pending-outcome re-label is in that same transaction; `invalid_branch_state` for background -> foreground and for a branch outside `acknowledged`/`running`/`handoff`). In `packages/opencode/src/tool/task.ts`: (1) a resolved `task_id` session goes `currentExecution` -> `bound`; when the bound branch is open (`reserved`, `registered`, `acknowledged`, `running`) it skips reserve, create, bind and acknowledge, for both the `background.extend` path (`task.ts:267`) and the ordinary prompt path; when it is closed (`handoff`, `outcome_acknowledged`, `retiring`, `retired`: a finished child, its outcome consumed or not) it runs `reserveBranch` -> `bindBranch({ childSessionID: task_id })` -> `acknowledgeBranch` -> prompt on a new branch exactly as Interfaces states, skips child-session creation, calls `failBranch` on the new branch on any failure before the prompt, and never writes the closed branch or its pending outcome; (2) when the foreground race (`task.ts:334-338`) resolves to a promoted job, call `setDelivery({ branch, delivery: "background" })` in the tool's fiber, then return `backgroundResult()` with `metadata.delivery: "background"`; (3) keep the creating part's `metadata` object (`parentSessionId`, `sessionId`, `model`, and `background: true` only for a background call) and only add `delivery`, `branchID` and `ownerExecutionID`; (4) emit the synthetic background result only as the bounded synthetic input of Step 5e, never as a `task` tool part.

- [ ] **Step 7: Run GREEN.**

From `packages/core`: `bun test test/delegation-delivery.test.ts test/delegation-protocol.test.ts && bun run typecheck`

From `packages/opencode`: `bun test test/tool/task-delegation.test.ts && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 8: Commit.**

```bash
git add packages/core/src/delegation/delivery.ts packages/core/src/background-job.ts packages/core/src/session/input.ts packages/core/src/session/projector.ts packages/schema/src/session-event.ts packages/schema/src/session-input.ts packages/core/src/session/execution/local.ts packages/opencode/src/tool/task.ts packages/core/src/delegation/branch.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-delivery.test.ts packages/core/test/delegation-protocol.test.ts packages/opencode/test/tool/task-delegation.test.ts
git commit -m "feat(core): deliver native delegation outcomes"
```

### Task 20: Nested terminal propagation

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Placement:** this task runs after Task 19 and before Task 21. It extends Task 17's admission, but it cannot follow Task 17 directly: it needs the Task 18 runner interception and `DelegationTerminalSignal`; Task 19's `DelegationDelivery.foreground`; and the Task 19 fixture methods `resolveOutcome`, `acknowledgeOutcome`, `outcomeState`, `foreground`, `rootDeliveries`, `claimBackground`, `appendClaim`, `setBranchDelivery`. Run any earlier and it fails before it reaches its own RED.

**Decisions this task implements (spec lines 424-435, test requirements at 572, 592 and 626):**
- Chain: core walks `parentBranchID` from the origin to the outermost ancestor inside the outcome transaction. `branchPath` is ordered outermost-first and ends with the origin. `rootOwnerExecution` is the outermost branch's owner execution, and it must be a root execution (`sessionID === rootSessionID`).
- One outcome: every `running` branch on the path moves to `handoff` in the same transaction. If any branch on the path is already `handoff`, no second outcome is created.
- Admission fence: a question or permission admission in a session whose branch, or any ancestor of it, is `handoff` creates nothing and returns the existing terminal.
- Per-level surfacing: a terminal handed to an owner call carries that call's own branch as `branchID`.
- Cleanup: after commit, core aborts the native origin and intermediate executions. The plugin that owns an outermost child retires that child itself.
- Owner check: only `{ outermost branch fence, rootOwnerExecution }` may resolve or acknowledge.
- In v1 a plugin-owned branch can only be outermost.
- Overflow is scoped to the origin. Once the walk stops at 17 rows the outermost owner is unknown, so a chain longer than 16 persists `branchPath = [origin]`, the origin's owner execution (a native child) as owner, and the origin's delivery. That level's task tool delivers the fixed `internal_error` payload into its own model through Task 19 foreground delivery, and ancestors keep running. No question content leaks; the question is lost at that level. Overflow is checked before the root-owner rule. Rejected alternatives: keeping the outermost and innermost-15 entries needs an unbounded walk and strands the elided branches in `handoff`; rejecting at reservation with `BranchErrorCode.bound_exceeded` moves where the depth-17 test runs.
- A non-root `protocol_failure` keeps the real owner. The `protocol_failure`/`wrong_owner` outcome stores the actual outermost owner execution (non-root) as `rootOwnerExecution`, so that owner's task tool, the only call still waiting, receives the fixed payload. Storing the root execution would leave that tool hanging.
- `DelegationOutcomeReady.branchID = branchPath[0]`, the branch the owner resolves with, not the origin. Task 11's single-level test is unchanged because there the origin is `branchPath[0]`.
- Promotion (decided 2026-10-08): a promoted outermost branch is a background branch for propagation. Its outcome takes `delivery: "background"`, `routeChildTerminal` from the root owner returns `none` for it, and Task 19's claim/append delivers it; intermediate surfacing is unchanged.
- Workflow branches reach `running` through Task 10's runner branch start: core's runner moves a branch `acknowledged -> running` in the same transaction that acquires the execution of its child session, for native and workflow branches alike, and plugins have no start API. The core suite below calls `fixture.startBranch` in `nest` only because `fixture.acquireExecution` bypasses the runner; it stands in for that production path. The opencode wiring test drives the production runner, so its branches start through the runner rule.

**Closed error codes used (no new codes are added):**

| Condition | Result | Code | Closed list |
|---|---|---|---|
| Outermost owner execution is not a root execution | persisted terminal `kind: "protocol_failure"`, fixed payload | `wrong_owner` | `OutcomeErrorCode` |
| Chain longer than 16 (`validateOutcomeEnvelope` throws) | persisted terminal `kind: "internal_error"`, fixed payload, path `[origin]` | `bound_exceeded` | `OutcomeErrorCode` (the code Task 11's `validateOutcomeEnvelope` already throws for `branchPathLength: 17`) |
| A walk revisits a branch ID (corrupt rows) | persisted terminal `kind: "protocol_failure"`, path `[origin]` | `stale_branch` | `OutcomeErrorCode` |
| `resolveOutcome`/`acknowledgeOutcome` with a non-outermost branch or a non-owner execution | rejection, no state change | `wrong_owner` | `OutcomeErrorCode` / `DeliveryErrorCode` |
| Public `createOutcome` supplies a `branchPath` or `delivery` that differs from the derived one | rejection, no write | `stale_branch` | `OutcomeErrorCode` |
| Public `createOutcome` supplies a `rootOwnerExecution` that differs from the derived one | rejection, no write | `wrong_owner` | `OutcomeErrorCode` |
| `reserveBranch` with a non-null `parentBranchID` whose branch is not `running`, is in another root, or whose `childSessionID` is not both `parentSessionID` and `ownerExecution.sessionID` | rejection, no write | `wrong_parent` | `BranchErrorCode` |
| `acknowledgeBranch` with `ownerComponent: "workflows"` when `parentBranchID !== null` or the owner execution is not a root execution | rejection, no state change | `wrong_parent` | `BranchErrorCode` |
| `routeChildTerminal` is called by a non-owner whose `callerBranch` is null or is not the path predecessor of `childBranch` | rejection | `wrong_owner` | `DeliveryErrorCode` |

**Files:**
- Create: `packages/core/src/delegation/chain.ts`
- Create: `packages/core/src/delegation/propagation.ts`
- Create: `packages/core/src/delegation/cleanup.ts`
- Modify: `packages/core/src/delegation/payload.ts`
- Modify: `packages/core/src/delegation/outcome.ts`
- Modify: `packages/core/src/delegation/event.ts`
- Modify: `packages/core/src/delegation/admission.ts`
- Modify: `packages/core/src/delegation/branch.ts`
- Modify: `packages/core/src/delegation/delivery.ts`
- Modify: `packages/opencode/src/tool/task.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/core/test/delegation-propagation.test.ts`
- Modify: `packages/opencode/test/tool/task-delegation.test.ts`

**Interfaces:**
- `payload.ts` exports `MAX_BRANCH_PATH_LENGTH = 16`. `validateOutcomeEnvelope` uses this constant and stays the only bound check.
- `chain.ts` exports `walkBranchChain(originBranchID: string): Effect.Effect<BranchChain, never, Database.Transaction>`. It returns `type BranchChain = { status: "ok"; branches: readonly BranchRow[] } | { status: "overflow" | "cycle"; origin: BranchRow; walked: readonly BranchRow[] }`. `branches` is ordered outermost-first and ends with the origin. `walked` holds the rows actually read, in the same order. The handoff checks scan `branches` or `walked`, whichever the status provides. The walk reads at most `MAX_BRANCH_PATH_LENGTH + 1` (17) rows. If it reads a 17th row, it stops with `overflow` and walks no further. If it sees a repeated branch ID, it returns `cycle`.
- `OutcomeService` gains the method below. Its terminal's `branchID` is always `input.origin.branchID`. Admission calls only this method.

  ```ts
  createFromOrigin(input: Omit<CreateOutcomeInput, "branchPath" | "rootOwnerExecution" | "delivery">): Effect.Effect<DelegationTerminal, DelegationOutcomeError>
  ```
- The public `OutcomeService.create` (and therefore the plugin `createOutcome`) derives the chain the same way. It rejects a supplied `branchPath` or `delivery` that differs from the derived value with `stale_branch`, and a differing `rootOwnerExecution` with `wrong_owner`, before any write. Every existing single-level caller passes `[origin]`, the root execution, and the branch's own delivery, so those calls are unchanged.
- Derived outcome fields:
  - `branchPath = branches.map(b => b.branchID)`.
  - `rootOwnerExecution` is the active execution row for `branches[0].ownerExecutionID`.
  - `delivery = branches[0].delivery`, read from the branch row inside the outcome transaction. The outermost branch decides foreground versus background. For a `foreground` outermost branch only the root owner call can still be waiting. A promoted outermost branch (Task 19 `setDelivery`, one way, decided 2026-10-08) reads `background`: its owner call already returned the background result and waits for nothing, so its outcome is delivered like any background branch, by Task 19's claim/append. If promotion commits after the outcome, Task 19's `setDelivery` re-labels that still-pending outcome `background` in its own transaction, so the root owner never waits on an outcome nobody will route. An intermediate level always surfaces and never delivers.
- Overflow and cycle outcomes use `branchPath = [origin]`, the origin's owner execution, and the origin's delivery.
- `DelegationOutcomeReady.branchID` is `branchPath[0]`, the branch the owner resolves with. `ownerExecutionID` stays `rootOwnerExecution.executionID`. For a single-level chain this is the origin, as Task 11's test already asserts.
- `cleanup.ts` declares the local service below. Production `DelegationCleanup.layer` calls the existing session runner cancel for each session. It runs only after commit, in order: the origin, then each enclosing native level, outermost last. It never includes the root session or the child session of a `workflow` branch.

  ```ts
  export interface DelegationCleanup { abortSessions(input: { sessionIDs: readonly string[] }): Effect.Effect<void> }
  ```
- `propagation.ts` declares the local service below.

  ```ts
  export type ChildTerminalRoute =
    | { action: "none" }
    | { action: "deliver"; result: ForegroundDeliveryResult }
    | { action: "surface"; terminal: DelegationTerminal }
  export interface DelegationPropagation {
    routeChildTerminal(input: { childBranch: BranchFence; toolExecution: ExecutionFence; callerBranch: BranchFence | null; worker: WorkerFence }): Effect.Effect<ChildTerminalRoute, DelegationDeliveryError>
  }
  ```

  The native task tool calls `routeChildTerminal` every time its child session ends: success, error, abort, or interrupt. It reads durable state and never trusts an in-memory terminal, so the D5 abort of an intermediate session cannot race delivery. The routes:
  - `none`: the child branch is not `handoff`, or the owner condition below holds but the outcome's `delivery` is `background` (an originally background or promoted outermost branch; Task 19's claim/append delivers it).
  - `deliver`: `toolExecution.executionID === rootOwnerExecutionID`, `childBranch.branchID === branchPath[0]`, and the outcome's `delivery` is `foreground`. The tool calls `DelegationDelivery.foreground` (Task 19, which acknowledges and retires).
  - `surface`: anything else, with `terminal.branchID = callerBranch.branchID`. This requires that `callerBranch.branchID` is the path entry immediately before `childBranch.branchID`. Otherwise the call fails with `wrong_owner`.
- `packages/opencode/src/tool/task.ts` acts on the route. On `deliver` it returns the foreground payload as the tool result (Task 19). On `surface` it fails its Effect with Task 18's `DelegationTerminalSignal { terminal }`, so the runner interception stops the intermediate model loop and publishes no tool part. On `none` it keeps today's result path.
- Fixture additions, owned by this task, in `packages/core/test/fixture/delegation.ts`:
  - `seedNestedChildSession(sessionID: string, parentSessionID: string, rootSessionID: string): Promise<void>` seeds through the production session repository with `parentID = parentSessionID`.
  - `routeChildTerminal(input: { childBranch: BranchFence; toolExecution: ExecutionFence; callerBranch: BranchFence | null; worker: WorkerFence }): Promise<ChildTerminalRoute>` calls the production `DelegationPropagation`.
  - `abortedSessions(): Promise<readonly string[]>` returns the session IDs, in call order, that a fixture-provided recording `DelegationCleanup` layer received. That recording layer replaces only the session-cancel effect. It does not stop runners or change execution rows.
- `NativeTaskDelegationTestAdapter.makeNested(): Promise<{ run(): Promise<{ toolResult: unknown; surfaced: DelegationTerminal | null; callerBranchID: string; childBranchID: string; intermediateModelContinued: boolean; rootDeliveries: number }> }>` is added in `packages/opencode/src/tool/task.ts` next to Task 19's `make`. It composes the production task tool and runner over the Task 3 fixture for root -> native A -> native B, has B ask a question, and reports what A's task tool did. It contains no routing logic of its own.

- [ ] **Step 1: Declare the two service tags and extend the fixture before any test.** Create `cleanup.ts` and `propagation.ts` with only the `Context.Service` tags and the types listed under Interfaces. Do not add a production layer yet. Add `seedNestedChildSession`, `routeChildTerminal` and `abortedSessions` to the fixture exactly as specified. `routeChildTerminal` resolves `DelegationPropagation` from `provideProductionServices`, which has no layer for it yet.

- [ ] **Step 2: Create the core propagation suite** in `packages/core/test/delegation-propagation.test.ts`.

```ts
import { afterEach, beforeEach, expect, test } from "bun:test"
import type { BranchFence, DelegationOutcomePayload, DelegationTerminal, ExecutionFence, WorkerFence } from "@opencode-ai/schema/delegation"
import { createDelegationFixture, expectDelegationCode } from "./fixture/delegation"

let fixture: ReturnType<typeof createDelegationFixture>
let worker: WorkerFence
let rootExecution: ExecutionFence
const question: DelegationOutcomePayload = { type: "question", questions: [{ header: "Choice", question: "raw-nested-question", options: [], allowCustom: true }] }
const permission: DelegationOutcomePayload = { type: "permission", permission: "bash", pattern: "git status", description: "inspect" }
const askBaseline = { decision: "ask" as const, immutableDeny: false, matches: [{ origin: "agent_config" as const, decision: "ask" as const }] }
const FIXED_MESSAGE = "Delegated interaction could not be transferred."

beforeEach(async () => {
  fixture = createDelegationFixture()
  await fixture.start({ filename: `${process.env.TMPDIR ?? "/tmp"}/propagation-${crypto.randomUUID()}.sqlite`, workers: 1 })
  await fixture.seedRootSession("root_a")
  worker = fixture.worker("worker_a", "epoch_a", "core_build")
  await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
  for (const participant of [
    { component: "core" as const, buildID: "core_build", capabilities: ["controllerLeaseV1"] },
    { component: "workflows" as const, buildID: "workflows_build", capabilities: ["registeredBranchV1"] },
  ]) await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: 1000 })
  fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload }))
  rootExecution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
})
afterEach(async () => fixture.close())

type Level = { branch: BranchFence; childSessionID: string; execution: ExecutionFence }

async function nest(input: { parentSessionID: string; ownerExecution: ExecutionFence; parentBranchID: string | null; childSessionID: string; kind?: "native" | "workflow" }): Promise<Level> {
  const kind = input.kind ?? "native"
  const ownerComponent = kind === "workflow" ? "workflows" as const : "core" as const
  await fixture.seedNestedChildSession(input.childSessionID, input.parentSessionID, "root_a")
  const reserved = await fixture.reserveBranch({ parentSessionID: input.parentSessionID, rootSessionID: "root_a", ownerExecution: input.ownerExecution, parentBranchID: input.parentBranchID, kind, delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: input.childSessionID })
  const acknowledged = await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent, ownerBuildID: ownerComponent === "core" ? "core_build" : "workflows_build", protocol: "opencode.delegation/v1" })
  await fixture.startBranch({ branch: acknowledged.branch })
  const execution = await fixture.acquireExecution({ sessionID: input.childSessionID, rootSessionID: "root_a", kind: kind === "workflow" ? "workflow_child" : "native_child", worker, now: 1000 })
  return { branch: acknowledged.branch, childSessionID: input.childSessionID, execution }
}

/** root -> child_1 -> ... -> child_depth; level i is owned by level i-1's execution. */
async function nativeChain(depth: number): Promise<Level[]> {
  const levels: Level[] = []
  for (let index = 0; index < depth; index += 1) {
    const parent = levels[index - 1]
    levels.push(await nest({
      parentSessionID: parent?.childSessionID ?? "root_a",
      ownerExecution: parent?.execution ?? rootExecution,
      parentBranchID: parent?.branch.branchID ?? null,
      childSessionID: `child_${index + 1}`,
    }))
  }
  return levels
}

async function admitQuestionAt(level: Level): Promise<DelegationTerminal> {
  const result = await fixture.admitQuestion({ sessionID: level.childSessionID, execution: level.execution, branch: level.branch, payload: question })
  if ("state" in result) throw new Error(`expected terminal, received ${result.state}`)
  return result
}

type OutcomeRow = { outcomeID: string; kind: string; errorCode: string | null; branchPath: string[]; rootOwnerExecutionID: string; delivery: string }
async function outcomeRows(): Promise<OutcomeRow[]> {
  return (await fixture.dbRows("delegation_outcome")).map((row) => ({
    outcomeID: String(row.outcome_id),
    kind: String(row.kind),
    errorCode: row.error_code === null ? null : String(row.error_code),
    branchPath: JSON.parse(String(row.branch_path)) as string[],
    rootOwnerExecutionID: String(row.root_owner_execution_id),
    delivery: String(row.delivery),
  }))
}

test("three-level native chain produces one root-owned outcome and hands off every branch", async () => {
  const [a, b] = await nativeChain(2)
  const terminal = await admitQuestionAt(b!)
  expect(terminal).toEqual({ outcomeID: expect.any(String), branchID: b!.branch.branchID, kind: "question_handoff", errorCode: null })
  const rows = await outcomeRows()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ outcomeID: terminal.outcomeID, branchPath: [a!.branch.branchID, b!.branch.branchID], rootOwnerExecutionID: rootExecution.executionID, kind: "question_handoff", delivery: "foreground" })
  expect(await fixture.branchState(a!.branch.branchID)).toBe("handoff")
  expect(await fixture.branchState(b!.branch.branchID)).toBe("handoff")
  expect(await fixture.pending()).toEqual([])
  expect(await fixture.askedEvents()).toEqual([])
  expect(await fixture.events()).toEqual([{ type: "delegation.outcome.ready", outcomeID: terminal.outcomeID, branchID: a!.branch.branchID, ownerExecutionID: rootExecution.executionID }])
  expect(await fixture.abortedSessions()).toEqual([b!.childSessionID, a!.childSessionID])
})

test.each(["origin", "intermediate"] as const)("a second admission in the %s session returns the same outcome with no row, pending entry, or event", async (where) => {
  const [a, b] = await nativeChain(2)
  const first = await admitQuestionAt(b!)
  const rowsBefore = await fixture.dbRows("delegation_outcome")
  const branchesBefore = await fixture.dbRows("delegation_branch")
  const eventsBefore = await fixture.events()
  const level = where === "origin" ? b! : a!
  const expected = { outcomeID: first.outcomeID, branchID: level.branch.branchID, kind: "question_handoff", errorCode: null }
  let sanitizerCalls = 0
  fixture.setSanitizer(async (input) => {
    sanitizerCalls += 1
    return { status: "sanitized", payload: input.payload }
  })
  expect(await fixture.admitQuestion({ sessionID: level.childSessionID, execution: level.execution, branch: level.branch, payload: question })).toEqual(expected)
  expect(await fixture.admitPermission({ sessionID: level.childSessionID, baseline: askBaseline, execution: level.execution, branch: level.branch, authority: null, decisionKey: `call_${where}:ask_1`, payload: permission })).toEqual(expected)
  expect(sanitizerCalls).toBe(0)
  expect(await fixture.dbRows("delegation_outcome")).toEqual(rowsBefore)
  expect(await fixture.dbRows("delegation_branch")).toEqual(branchesBefore)
  expect(await fixture.pending()).toEqual([])
  expect(await fixture.askedEvents()).toEqual([])
  expect(await fixture.events()).toEqual(eventsBefore)
})

test("intermediate surfacing carries A's branchID and only the outermost owner resolves and acknowledges", async () => {
  const [a, b] = await nativeChain(2)
  const terminal = await admitQuestionAt(b!)
  // B's owner call is A's native task tool; A's execution is not the root owner, so it surfaces with A's own branch.
  const atA = await fixture.routeChildTerminal({ childBranch: b!.branch, toolExecution: a!.execution, callerBranch: a!.branch, worker })
  expect(atA).toEqual({ action: "surface", terminal: { outcomeID: terminal.outcomeID, branchID: a!.branch.branchID, kind: "question_handoff", errorCode: null } })
  expect(await fixture.outcomeState(terminal.outcomeID)).toBe("pending_delivery")
  for (const wrong of [
    { branch: b!.branch, ownerExecution: rootExecution },
    { branch: a!.branch, ownerExecution: a!.execution },
  ]) {
    await expect(fixture.resolveOutcome({ outcomeID: terminal.outcomeID, ...wrong })).rejects.toMatchObject({ code: "wrong_owner" })
    await expect(fixture.acknowledgeOutcome({ outcomeID: terminal.outcomeID, ...wrong, worker })).rejects.toMatchObject({ code: "wrong_owner" })
  }
  expect(await fixture.outcomeState(terminal.outcomeID)).toBe("pending_delivery")
  await expect(fixture.resolveOutcome({ outcomeID: terminal.outcomeID, branch: a!.branch, ownerExecution: rootExecution })).resolves.toEqual(question)
  await expect(fixture.acknowledgeOutcome({ outcomeID: terminal.outcomeID, branch: a!.branch, ownerExecution: rootExecution, worker })).resolves.toBeUndefined()
  expect(await fixture.outcomeState(terminal.outcomeID)).toBe("acknowledged")
  expect(await fixture.branchState(a!.branch.branchID)).toBe("retired")
  expect(await fixture.branchState(b!.branch.branchID)).toBe("retired")
})

test("the root owner's task tool performs foreground delivery with the outermost branch", async () => {
  const [a, b] = await nativeChain(2)
  const terminal = await admitQuestionAt(b!)
  // A non-owner call with no branch of its own cannot surface anything.
  await expect(fixture.routeChildTerminal({ childBranch: b!.branch, toolExecution: a!.execution, callerBranch: null, worker })).rejects.toMatchObject({ code: "wrong_owner" })
  const atRoot = await fixture.routeChildTerminal({ childBranch: a!.branch, toolExecution: rootExecution, callerBranch: null, worker })
  expect(atRoot).toEqual({ action: "deliver", result: { terminal: { outcomeID: terminal.outcomeID, branchID: a!.branch.branchID, kind: "question_handoff", errorCode: null }, payload: question } })
  expect(await fixture.rootDeliveries(terminal.outcomeID)).toHaveLength(1)
  expect(await fixture.outcomeState(terminal.outcomeID)).toBe("acknowledged")
  expect(await fixture.branchState(a!.branch.branchID)).toBe("retired")
  expect(await fixture.branchState(b!.branch.branchID)).toBe("retired")
})

test("a promoted outermost branch takes the background route, not a waiting foreground call", async () => {
  const [a, b] = await nativeChain(2)
  expect(await fixture.setBranchDelivery({ branch: a!.branch, delivery: "background" })).toEqual({ delivery: "background" })
  const terminal = await admitQuestionAt(b!)
  const rows = await outcomeRows()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ outcomeID: terminal.outcomeID, branchPath: [a!.branch.branchID, b!.branch.branchID], rootOwnerExecutionID: rootExecution.executionID, delivery: "background" })
  // A's task tool for B is still waiting inside A, so the intermediate still surfaces with A's branch and stops A's loop.
  expect(await fixture.routeChildTerminal({ childBranch: b!.branch, toolExecution: a!.execution, callerBranch: a!.branch, worker })).toEqual({ action: "surface", terminal: { outcomeID: terminal.outcomeID, branchID: a!.branch.branchID, kind: "question_handoff", errorCode: null } })
  // The root call returned when A was promoted; even a late route from the root owner does not foreground-deliver.
  expect(await fixture.routeChildTerminal({ childBranch: a!.branch, toolExecution: rootExecution, callerBranch: null, worker })).toEqual({ action: "none" })
  expect(await fixture.rootDeliveries(terminal.outcomeID)).toHaveLength(0)
  expect(await fixture.outcomeState(terminal.outcomeID)).toBe("pending_delivery")
  const claim = await fixture.claimBackground({ worker, now: 1000 })
  if (!claim) throw new Error("expected a background delivery claim")
  expect(claim.outcomeID).toBe(terminal.outcomeID)
  await fixture.appendClaim({ outcomeID: claim.outcomeID, deliveryClaimID: claim.deliveryClaimID, ownerExecution: rootExecution })
  expect(await fixture.rootDeliveries(terminal.outcomeID)).toHaveLength(1)
})

test("a chain whose outermost owner is not a root execution persists protocol_failure", async () => {
  // child_x is an unregistered native session; its execution reserves a parentless branch for child_y.
  await fixture.seedNestedChildSession("child_x", "root_a", "root_a")
  const xExecution = await fixture.acquireExecution({ sessionID: "child_x", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
  const y = await nest({ parentSessionID: "child_x", ownerExecution: xExecution, parentBranchID: null, childSessionID: "child_y" })
  const terminal = await admitQuestionAt(y)
  expect(terminal).toEqual({ outcomeID: expect.any(String), branchID: y.branch.branchID, kind: "protocol_failure", errorCode: "wrong_owner" })
  const rows = await outcomeRows()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ kind: "protocol_failure", errorCode: "wrong_owner", branchPath: [y.branch.branchID], rootOwnerExecutionID: xExecution.executionID })
  const durable = JSON.stringify(await fixture.dbRows("delegation_outcome"))
  expect(durable).toContain(FIXED_MESSAGE)
  expect(durable).not.toContain("raw-nested-question")
  expect(await fixture.pending()).toEqual([])
  expect(await fixture.abortedSessions()).toEqual(["child_y"])
})

test.each([
  [16, "question_handoff", null],
  [17, "internal_error", "bound_exceeded"],
] as const)("a native chain of %i branches yields %s", async (depth, kind, errorCode) => {
  let sanitizerCalls = 0
  fixture.setSanitizer(async (input) => {
    sanitizerCalls += 1
    return { status: "sanitized", payload: input.payload }
  })
  const levels = await nativeChain(depth)
  const origin = levels[depth - 1]!
  const terminal = await admitQuestionAt(origin)
  expect(terminal).toEqual({ outcomeID: expect.any(String), branchID: origin.branch.branchID, kind, errorCode })
  const rows = await outcomeRows()
  expect(rows).toHaveLength(1)
  if (depth === 16) {
    expect(rows[0]!.branchPath).toEqual(levels.map((level) => level.branch.branchID))
    expect(rows[0]!.rootOwnerExecutionID).toBe(rootExecution.executionID)
    expect(sanitizerCalls).toBe(1)
    return
  }
  expect(rows[0]!.branchPath).toEqual([origin.branch.branchID])
  expect(rows[0]!.rootOwnerExecutionID).toBe(levels[depth - 2]!.execution.executionID)
  expect(sanitizerCalls).toBe(0)
  expect(await fixture.branchState(origin.branch.branchID)).toBe("handoff")
  expect(await fixture.branchState(levels[depth - 2]!.branch.branchID)).toBe("running")
  const durable = JSON.stringify(await fixture.dbRows("delegation_outcome"))
  expect(durable).toContain(FIXED_MESSAGE)
  expect(durable).not.toContain("raw-nested-question")
})

test("workflow-owned outermost W with native origin N: path is [W, N] and W's owner call sees W's branchID", async () => {
  const w = await nest({ parentSessionID: "root_a", ownerExecution: rootExecution, parentBranchID: null, childSessionID: "child_w", kind: "workflow" })
  const n = await nest({ parentSessionID: "child_w", ownerExecution: w.execution, parentBranchID: w.branch.branchID, childSessionID: "child_n" })
  const terminal = await admitQuestionAt(n)
  expect(terminal).toMatchObject({ kind: "question_handoff", branchID: n.branch.branchID })
  const rows = await outcomeRows()
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({ branchPath: [w.branch.branchID, n.branch.branchID], rootOwnerExecutionID: rootExecution.executionID })
  // N's owner call is the native task tool inside W's child session. It surfaces W's branchID into W's runner, and that
  // terminal is the body of the legacy 409 the workflows plugin receives from POST /session/child_w/message.
  const atW = await fixture.routeChildTerminal({ childBranch: n.branch, toolExecution: w.execution, callerBranch: w.branch, worker })
  expect(atW).toEqual({ action: "surface", terminal: { outcomeID: terminal.outcomeID, branchID: w.branch.branchID, kind: "question_handoff", errorCode: null } })
  // Core aborts only the native origin; the workflows plugin retires its own outermost child.
  expect(await fixture.abortedSessions()).toEqual(["child_n"])
  await expect(fixture.resolveOutcome({ outcomeID: terminal.outcomeID, branch: w.branch, ownerExecution: rootExecution })).resolves.toEqual(question)
})

// Reservation requires a non-null parent branch to be owned from that parent's child session, so a non-null parent
// always implies a non-root owner; the second case isolates the owner condition with a null parent.
test.each(["non-null parent branch", "non-root owner execution"] as const)("workflows acknowledgement with a %s is rejected with wrong_parent", async (condition) => {
  const [a] = await nativeChain(1)
  await fixture.seedNestedChildSession("child_wf", a!.childSessionID, "root_a")
  const reserved = await fixture.reserveBranch({ parentSessionID: a!.childSessionID, rootSessionID: "root_a", ownerExecution: a!.execution, parentBranchID: condition === "non-null parent branch" ? a!.branch.branchID : null, kind: "workflow", delivery: "foreground" })
  const registered = await fixture.bindBranch({ branch: reserved.branch, childSessionID: "child_wf" })
  const before = await fixture.dbRows("delegation_branch")
  try {
    await fixture.acknowledgeBranch({ branch: registered.branch, ownerComponent: "workflows", ownerBuildID: "workflows_build", protocol: "opencode.delegation/v1" })
    throw new Error("nested workflows acknowledgement unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "wrong_parent")
  }
  expect(await fixture.dbRows("delegation_branch")).toEqual(before)
  expect(await fixture.branchState(registered.branch.branchID)).toBe("registered")
})

test("reservation under a parent branch from a different session is rejected with wrong_parent", async () => {
  const [a] = await nativeChain(1)
  try {
    await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: rootExecution, parentBranchID: a!.branch.branchID, kind: "native", delivery: "foreground" })
    throw new Error("grafted reservation unexpectedly succeeded")
  } catch (error) {
    expectDelegationCode(error, "wrong_parent")
  }
})
```

- [ ] **Step 3: Add the native task wiring test** to `packages/opencode/test/tool/task-delegation.test.ts`.

```ts
test("an intermediate native task tool surfaces the terminal with its own branch and returns no tool result", async () => {
  const harness = await NativeTaskDelegationTestAdapter.makeNested()
  const result = await harness.run()
  expect(result.toolResult).toBeUndefined()
  expect(result.surfaced).toMatchObject({ branchID: result.callerBranchID, kind: "question_handoff", errorCode: null })
  expect(result.surfaced?.branchID).not.toBe(result.childBranchID)
  expect(result.intermediateModelContinued).toBe(false)
  expect(result.rootDeliveries).toBe(1)
})
```

- [ ] **Step 4: Run RED.**

From `packages/core`: `bun test test/delegation-propagation.test.ts`

From `packages/opencode`: `bun test test/tool/task-delegation.test.ts`

Expected: both suites FAIL on assertions or a missing service. They must not fail on a load error, because Step 1 added every fixture method:
- The three-level, 16/17-chain, workflow and promoted-outermost tests fail on `branchPath`. Task 17 admission builds `[origin]`, so the assertion sees one entry where it expects the whole chain (and, in the promoted test, B's `foreground` delivery where A's `background` is expected). In the three-level test, A stays `running`.
- The second-admission test fails because the outcome or branch row snapshot changes, or the sanitizer runs again. Task 17 has no handoff fence.
- The non-root-owner test fails because the terminal is not `protocol_failure`/`wrong_owner`.
- The depth-17 case does not return `bound_exceeded`.
- Every test that calls `routeChildTerminal` fails with a missing `DelegationPropagation` service.
- Both workflows-acknowledgement cases resolve where a rejection was expected, so they reach the `unexpectedly succeeded` throw, which carries no closed code.
- The grafted-reservation test reaches its `unexpectedly succeeded` throw.
- The opencode test fails because `NativeTaskDelegationTestAdapter.makeNested` is not a function.

A test that passes at this step is a defect in the test. Fix the test before going on.

- [ ] **Step 5a: Bound constant.** Export `MAX_BRANCH_PATH_LENGTH = 16` from `payload.ts` and make `validateOutcomeEnvelope` compare against it. Task 11's envelope tests stay unchanged.

- [ ] **Step 5b: Chain walk.** Implement `walkBranchChain` in `chain.ts` as an indexed read loop on `delegation_branch.branch_id` inside the caller's transaction:
  1. Start from the origin row.
  2. Follow `parent_branch_id` while it is non-null.
  3. Keep a `Set` of visited IDs; a repeat returns `cycle`.
  4. Stop with `overflow` as soon as the 17th row has been read.
  5. Reverse the collected rows into outermost-first order.

  The walk does not filter on state. The caller decides what each state means.

- [ ] **Step 5c: Reservation parent validation and the v1 plugin-depth rule** in `branch.ts`.
  - `reserve` with a non-null `parentBranchID` loads that branch in the same transaction. The branch must have the same `rootSessionID`, state `running`, and `childSessionID === input.parentSessionID === input.ownerExecution.sessionID`. Otherwise reserve rejects with `wrong_parent` and writes nothing. Without this check, any session could graft a branch onto another chain and redirect its terminal.
  - `acknowledge` with `ownerComponent: "workflows"` loads the branch row and its owner execution row. It rejects with `wrong_parent`, leaving the row unchanged, unless `parentBranchID === null` and the owner execution's `sessionID === rootSessionID`. Native (`"core"`) acknowledgement is unchanged, so native-under-workflow chains still work.
  - Branch start is unchanged: Task 10's runner branch start is still the only production caller of `BranchService.start`, so an acknowledged workflow branch becomes `running` when core's runner acquires its child session's execution, and only a `running` branch is moved to `handoff` by Step 5d.

- [ ] **Step 5d: `createFromOrigin`** in `outcome.ts`, in this exact order:
  1. **Pre-check (read-only, no sanitizer).**
     - Walk the chain. If any branch on it is `handoff`, return the existing terminal (rule below) with `branchID = origin.branchID`.
     - If the walk returned `overflow`, the outcome is `internal_error`/`bound_exceeded` with the fixed payload. Do not invoke the sanitizer, matching Task 11's `payload_too_large` path.
     - If it returned `cycle`, the outcome is `protocol_failure`/`stale_branch` with the fixed payload.
  2. **Bounds and sanitize** the candidate exactly as Task 11 already does, but only for an `ok` chain.
  3. **Immediate transaction.**
     - Validate the origin fence, and the Worker fence as in Task 11.
     - Re-walk the chain. If a branch on it is now `handoff`, discard the sanitized payload, write nothing, and return the existing terminal. This is how two racing admissions in A and B collapse to one outcome: SQLite serialises the immediate transactions.
     - For an `ok` chain, load the execution row for `branches[0].ownerExecutionID`. If its `sessionID !== rootSessionID`, replace the payload with the fixed one and the kind with `protocol_failure`/`wrong_owner`, keeping the derived path and that execution as owner.
     - Insert the outcome with the derived `branchPath`, `rootOwnerExecution` and `delivery` (`delivery` taken from the outermost branch row read in this transaction, so a promotion committed earlier yields `background`). Move every branch in `branchPath` whose state is `running` to `handoff`.
     - For `overflow`/`cycle`, insert `branchPath = [origin]` with the origin's owner execution and delivery, and move only the origin to `handoff`. Overflow is checked before the root-owner rule, because the walk stopped and the outermost owner is unknown.
  4. **After commit:**
     - Publish `DelegationOutcomeReady` with `branchID = branchPath[0]` (change this in `event.ts`).
     - Then call `DelegationCleanup.abortSessions` with the `childSessionID` of every `native` branch in `branchPath`, origin first and outermost last. Never include the root session or a `workflow` branch's child session.
     - A cleanup failure is logged with outcome and branch IDs only and does not change the returned terminal. The terminal is already durable, and the owner's task tool reads it from durable state.

  Existing-terminal rule: take the first `handoff` branch on the outermost-first chain. The existing outcome is the one in the same `rootSessionID` that is not `acknowledged` and whose `branchPath` contains that branch ID (`json_each` over at most 16 entries). Return `{ outcomeID, kind, errorCode }` from it with the requester's `branchID`. If no such outcome exists, the state is corrupt. Fail with `stale_branch` and write nothing.

- [ ] **Step 5e: Public `create`.** It runs the same derivation inside its transaction. It rejects a supplied `branchPath` or `delivery` that differs from the derived value with `stale_branch`, and a supplied `rootOwnerExecution` whose `executionID` or `fencingToken` differs with `wrong_owner`, all before any write. After that it shares Step 5d's code path. A caller-supplied path or owner is never trusted.

- [ ] **Step 5f: Admission fence** in `admission.ts`. It runs immediately after Task 17 Step 4a classifies the request as a registered child, and before execution or branch fence validation, immutable deny, GOD permit, sanitization and pending insertion.
  - Load the branch bound to `input.sessionID` through child-session uniqueness. Never use the caller-supplied fence for this lookup.
  - Walk its chain. If any branch on it is `handoff`, return the existing terminal with that branch's `branchID`. Create no outcome, insert nothing pending, publish nothing, and do not invoke the sanitizer.
  - Otherwise continue with Task 17's steps, and replace its outcome call with `createFromOrigin`.

  This fence deliberately comes before GOD allow, so a branch that has already handed off cannot keep running on an armed controller.

- [ ] **Step 5g: Owner check and acknowledgement** in `outcome.ts` and `delivery.ts`.
  - `resolve`, `acknowledge`, `DelegationDelivery.foreground` and `DelegationDelivery.acknowledge` all require two things:
    - `input.branch.branchID === branchPath[0]`, with a current fence for that branch.
    - `input.ownerExecution.executionID === rootOwnerExecutionID`, with a current execution fence.
  - Any other branch or execution rejects with `wrong_owner` and changes nothing. This replaces the comparison against `originBranchID`; single-level outcomes behave the same, because there the origin is `branchPath[0]`.
  - Acknowledgement moves every branch in `branchPath` that is in `handoff` through `outcome_acknowledged -> retiring -> retired`, in the same transaction as the outcome acknowledgement. It looks them up by ID, because core owns them.

- [ ] **Step 5h: Propagation and cleanup layers.**
  - Implement `DelegationPropagation.layer` in `propagation.ts`:
    1. Load `childBranch`. If it is not `handoff`, return `none`.
    2. Load the existing outcome by the rule in Step 5d.
    3. If the owner condition holds and the outcome's `delivery` is `background`, return `none` and write nothing; background claim/append (Task 19) owns that delivery. If the owner condition holds and `delivery` is `foreground`, return `deliver` with the result of `DelegationDelivery.foreground({ outcomeID, branch: childBranch, ownerExecution: toolExecution, worker })`.
    4. Otherwise, if `callerBranch` is non-null and its ID is the path entry immediately before `childBranch.branchID`, return `surface` with `{ outcomeID, kind, errorCode, branchID: callerBranch.branchID }`.
    5. Otherwise reject with `wrong_owner`.
  - Implement `DelegationCleanup.layer` in `cleanup.ts` over the existing session runner cancel.
  - Add both layers to the production composition that `provideProductionServices` uses.

- [ ] **Step 5i: Native task tool** in `packages/opencode/src/tool/task.ts`.
  - When the child session ends (success, error, abort or interrupt), call `routeChildTerminal` with:
    - the child branch fence the tool reserved (for a `task_id` resume, the branch Task 19 resolved: the reused open branch, or the new branch reserved for a finished child, including one whose old branch is still in `handoff`);
    - the tool's own execution fence;
    - the calling session's own branch fence (`null` for a root session or an unregistered session);
    - the host Worker fence.
  - On `deliver`, return the payload exactly as Task 19's foreground path does.
  - On `surface`, fail with `DelegationTerminalSignal { terminal }` and do not return a tool result. Task 18's interception then stops the intermediate model loop. For a plugin-owned child driven through the legacy prompt route, that same signal becomes the HTTP 409 body carrying the child's own branchID.
  - On `none`, keep the ordinary result path.
  - Add `NativeTaskDelegationTestAdapter.makeNested` as a thin composition with no routing logic.

- [ ] **Step 6: Run GREEN.** These include the earlier suites whose files this task changes.

From `packages/core`: `bun test test/delegation-propagation.test.ts test/delegation-branch.test.ts test/delegation-runner.test.ts test/delegation-payload.test.ts test/delegation-outcome.test.ts test/delegation-sanitizer.test.ts test/delegation-admission.test.ts test/delegation-wire.test.ts test/delegation-delivery.test.ts test/delegation-protocol.test.ts test/delegation-plugin-api.test.ts && bun run typecheck`

From `packages/opencode`: `bun test test/tool/task-delegation.test.ts test/server/delegation.test.ts test/plugin/delegation-api.test.ts && bun run typecheck`

Expected: every command exits 0.

- [ ] **Step 7: Commit.**

```bash
git add packages/core/src/delegation/chain.ts packages/core/src/delegation/propagation.ts packages/core/src/delegation/cleanup.ts packages/core/src/delegation/payload.ts packages/core/src/delegation/outcome.ts packages/core/src/delegation/event.ts packages/core/src/delegation/admission.ts packages/core/src/delegation/branch.ts packages/core/src/delegation/delivery.ts packages/opencode/src/tool/task.ts packages/core/test/fixture/delegation.ts packages/core/test/delegation-propagation.test.ts packages/opencode/test/tool/task-delegation.test.ts
git commit -m "feat(core): propagate nested delegation terminals to one root owner"
```

### Task 21: TUI contract and adapters package

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Modify: `packages/plugin/src/tui.ts`
- Create: `packages/plugin/src/tui-delegation.type-test.ts`
- Create: `packages/tui/src/plugin/delegation.ts`
- Modify: `packages/tui/package.json` (export `./plugin/delegation`)
- Modify: `packages/tui/src/plugin/adapters.tsx`
- Modify: `packages/tui/src/app.tsx`
- Modify: `packages/tui/test/app-lifecycle.test.tsx` (both `run({...})` calls pass `delegation: null`)
- Modify: `packages/cli/src/tui.ts` (`runTui` passes `delegation: null`; this standalone CLI has no delegation host)
- Modify: `packages/opencode/src/cli/cmd/tui.ts` (interim `delegation: null`; Task 22 replaces it)
- Modify: `packages/opencode/src/cli/cmd/attach.ts` (interim `delegation: null`; Task 23 replaces it)
- Modify: `packages/opencode/src/plugin/tui/runtime.ts` (`pluginApi()` forwards `delegation`)
- Modify: `packages/opencode/test/fixture/tui-plugin.ts` (`createTuiPluginApi` accepts and returns `delegation`)
- Create: `packages/plugin/test/tui-delegation.test.ts`
- Create: `packages/tui/test/plugin/delegation.test.ts`
- Create: `packages/opencode/test/cli/tui/plugin-delegation-api.test.ts`

**Interfaces:**
- Consumes and re-exports exact `TuiDelegationApi` method keys.
- TUI plugins reach the controller API only through `TuiPluginApi.delegation: TuiDelegationApi | null`. The key is required and the value is explicit: a host that has no delegation path at all (the standalone `packages/cli` TUI and the TUI lifecycle tests) passes `null`, and a consumer treats `null` as "GOD unavailable". The embedded and attach hosts always pass a real instance, including on a `local` build; there, acquisition fails closed in core with `local_build`.
- The host-built value is threaded along the existing `pluginHost`/`onSnapshot` path: `TuiInput.delegation: TuiDelegationApi | null` (`packages/tui/src/app.tsx`, `TuiInput`), then the `App` component props, then `createTuiApiAdapters` `Input.delegation`, then the returned adapter object's `delegation` field (`createTuiApi` in `packages/tui/src/plugin/api.ts` already spreads its input), and finally the per-plugin object built by `pluginApi()` in `packages/opencode/src/plugin/tui/runtime.ts`, which is an explicit literal and must forward `delegation: api.delegation`. No hop reads it from global state, config, or the environment.
- Every caller of `run(TuiInput)` passes the key explicitly. The callers are `packages/opencode/src/cli/cmd/tui.ts`, `packages/opencode/src/cli/cmd/attach.ts`, `packages/cli/src/tui.ts`, and the two calls in `packages/tui/test/app-lifecycle.test.tsx`. (`packages/opencode/src/cli/cmd/plug.ts` calls an unrelated plugin-install `run`.)
- Consumers import the adapter as `@opencode-ai/tui/plugin/delegation`.
- Exposes only token-free `TuiControllerAcquireResult` to TUI plugins and HUD. Embedded and attach hosts create/map the opaque handle privately and normalize to that acquired-or-observer union before calling this adapter; this package never accepts, stores, or returns the attached token and implements no transport.

- [ ] **Step 1: Create plugin compile/runtime contract test.**

```ts
import { expect, test } from "bun:test"
import type { TuiDelegationApi } from "@opencode-ai/plugin/delegation"
import type { TuiControllerHandle } from "@opencode-ai/plugin/delegation"

test("TUI delegation API has exact controller method keys", () => {
  const api: Record<keyof TuiDelegationApi, true> = {
    acquireController: true,
    renewController: true,
    releaseController: true,
  }
  expect(Object.keys(api).sort()).toEqual(["acquireController", "releaseController", "renewController"])
})
```

Create `packages/plugin/src/tui-delegation.type-test.ts` (compile-only, following the Task 2 `delegation.type-test.ts` pattern; `packages/plugin/tsconfig.json` includes only `src`):

```ts
import type { TuiDelegationApi } from "./delegation.js"
import type { TuiPluginApi } from "./tui.js"

type Assert<T extends true> = T
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
export type TuiPluginApiCarriesDelegation = Assert<Exact<TuiPluginApi["delegation"], TuiDelegationApi | null>>
export type TuiPluginDelegationRequired = Assert<{} extends Pick<TuiPluginApi, "delegation"> ? false : true>
```

- [ ] **Step 2: Create adapter result tests.**

```ts
import { expect, test } from "bun:test"
import { makeTuiDelegationAdapter } from "../../src/plugin/delegation"
import type { TuiControllerHandle } from "@opencode-ai/plugin/delegation"

test.each([
   { state: "acquired", handle: "handle_a" as TuiControllerHandle, leaseID: "lease_a", authorityEpoch: 1, expiresAt: 7000 },
  { state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 },
] as const)("preserves $state controller result", async (result) => {
  const calls: string[] = []
  const adapter = makeTuiDelegationAdapter({
    acquire: async () => { calls.push("acquire"); return result },
    renew: async () => { calls.push("renew"); return result },
    release: async () => { calls.push("release") },
  })
  const acquired = await adapter.acquireController({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })
  expect(acquired).toEqual(result)
  expect(acquired).not.toHaveProperty("token")
   if (result.state === "acquired") {
     await adapter.renewController({ handle: result.handle, leaseID: "lease_a", authorityEpoch: 1 })
     await adapter.releaseController({ handle: result.handle, leaseID: "lease_a", authorityEpoch: 1 })
     expect(calls).toEqual(["acquire", "renew", "release"])
   } else {
     expect(calls).toEqual(["acquire"])
   }
})
```

`makeTuiDelegationAdapter(input: { acquire: TuiDelegationApi["acquireController"]; renew: TuiDelegationApi["renewController"]; release: TuiDelegationApi["releaseController"] }): TuiDelegationApi` is the production signature in `packages/tui/src/plugin/delegation.ts`. The signature cannot represent `AttachedControllerAcquireResult`, which pins the token boundary at the attach host.

- [ ] **Step 2b: Add the plugin-API field type assertions.** Append to `packages/tui/test/plugin/delegation.test.ts`:

```ts
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { TuiInput } from "../../src/app"
import { createTuiApiAdapters } from "../../src/plugin/adapters"

type Assert<T extends true> = T
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type PluginApiField = Assert<Exact<TuiPluginApi["delegation"], TuiDelegationApi | null>>
type LaunchInputField = Assert<Exact<TuiInput["delegation"], TuiDelegationApi | null>>
type AdapterInputField = Assert<Exact<Parameters<typeof createTuiApiAdapters>[0]["delegation"], TuiDelegationApi | null>>
type AdapterOutputField = Assert<Exact<ReturnType<typeof createTuiApiAdapters>["delegation"], TuiDelegationApi | null>>
type LaunchFieldRequired = Assert<{} extends Pick<TuiInput, "delegation"> ? false : true>

test("delegation field type assertions compile", () => {
  const checks: [PluginApiField, LaunchInputField, AdapterInputField, AdapterOutputField, LaunchFieldRequired] = [true, true, true, true, true]
  expect(checks).toEqual([true, true, true, true, true])
})
```

Add `import type { TuiDelegationApi } from "@opencode-ai/plugin/delegation"` to the same file's imports. These assertions are enforced by `bun run typecheck` in `packages/tui`; the runtime test only keeps the file non-empty for `bun test`.

- [ ] **Step 2c: Create the per-plugin runtime pass-through test.** Create `packages/opencode/test/cli/tui/plugin-delegation-api.test.ts`:

```ts
import { expect, spyOn, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { pathToFileURL } from "url"
import type { TuiDelegationApi } from "@opencode-ai/plugin/delegation"
import { tmpdir } from "../../fixture/fixture"
import { createTuiPluginApi } from "../../fixture/tui-plugin"
import { createTuiResolvedConfig } from "../../fixture/tui-runtime"
import { TuiConfig } from "../../../src/config/tui"

const { TuiPluginRuntime } = await import("../../../src/plugin/tui/runtime")

const fakeDelegation: TuiDelegationApi = {
  acquireController: async () => ({ state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 }),
  renewController: async () => ({ state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 }),
  releaseController: async () => {},
}

async function observedDelegation(delegation: TuiDelegationApi | null): Promise<unknown> {
  await using tmp = await tmpdir({
    init: async (dir) => {
      const file = path.join(dir, "plugin.ts")
      const marker = path.join(dir, "observed.json")
      await Bun.write(
        file,
        `export default {
  id: "demo.delegation",
  tui: async (api, options) => {
    const value = api.delegation === null ? null : Object.keys(api.delegation).sort()
    await Bun.write(options.marker, JSON.stringify(value))
  },
}
`,
      )
      return { spec: pathToFileURL(file).href, marker }
    },
  })
  const config = createTuiResolvedConfig({
    plugin: [[tmp.extra.spec, { marker: tmp.extra.marker }]],
    plugin_origins: [{ spec: [tmp.extra.spec, { marker: tmp.extra.marker }], scope: "local", source: path.join(tmp.path, "tui.json") }],
  })
  const pure = process.env.OPENCODE_PURE
  const meta = process.env.OPENCODE_PLUGIN_META_FILE
  delete process.env.OPENCODE_PURE
  process.env.OPENCODE_PLUGIN_META_FILE = path.join(tmp.path, "plugin-meta.json")
  const wait = spyOn(TuiConfig, "waitForDependencies").mockResolvedValue()
  const cwd = spyOn(process, "cwd").mockImplementation(() => tmp.path)
  try {
    await TuiPluginRuntime.init({ api: createTuiPluginApi({ delegation }), config })
    return JSON.parse(await fs.readFile(tmp.extra.marker, "utf8"))
  } finally {
    await TuiPluginRuntime.dispose()
    cwd.mockRestore()
    wait.mockRestore()
    if (pure === undefined) delete process.env.OPENCODE_PURE
    else process.env.OPENCODE_PURE = pure
    if (meta === undefined) delete process.env.OPENCODE_PLUGIN_META_FILE
    else process.env.OPENCODE_PLUGIN_META_FILE = meta
  }
}

test("each TUI plugin receives the host delegation API", async () => {
  expect(await observedDelegation(fakeDelegation)).toEqual(["acquireController", "releaseController", "renewController"])
})

test("each TUI plugin receives null when the host has no delegation path", async () => {
  expect(await observedDelegation(null)).toBeNull()
})
```

- [ ] **Step 3: Run RED.** Run each command separately so every failure is observed:

From `packages/plugin`: `bun run typecheck`
Expected: FAIL; `tui-delegation.type-test.ts` reports that `delegation` does not exist on `TuiPluginApi`.

From `packages/tui`: `bun test test/plugin/delegation.test.ts`
Expected: FAIL; `../../src/plugin/delegation` cannot be resolved.

From `packages/tui`: `bun run typecheck`
Expected: FAIL; `delegation` is missing on `TuiPluginApi`, `TuiInput`, and the `createTuiApiAdapters` input.

From `packages/opencode`: `bun test test/cli/tui/plugin-delegation-api.test.ts`
Expected: FAIL with ENOENT on the marker file. `bun test` does not typecheck, so the fixture ignores the `delegation` option; `pluginApi()` does not forward the field, the plugin sees `api.delegation === undefined`, `Object.keys(undefined)` throws inside activation, and the runtime logs and swallows that error, so the marker is never written.

- [ ] **Step 4: Implement the package contract.** Re-export the plugin type from `tui.ts`; create a transparent adapter with no transport selection and no credential fields. TUI/HUD receives and echoes only `{ handle, leaseID, authorityEpoch }`; it never creates or sees Worker IDs, Worker epochs, controller IDs, or tokens. Then thread the host value:
  - `packages/plugin/src/tui.ts`: add `import type { TuiDelegationApi } from "./delegation.js"` (the package uses `nodenext` resolution, so relative imports carry `.js`) and add `delegation: TuiDelegationApi | null` to `TuiPluginApi`.
  - `packages/tui/src/app.tsx`: add `delegation: TuiDelegationApi | null` to `TuiInput`; pass `delegation={input.delegation}` to `App` next to `pluginHost={input.pluginHost}`; add `delegation: TuiDelegationApi | null` to the `App` props type; pass `delegation: props.delegation` in the `createTuiApiAdapters({ ... })` call.
  - `packages/tui/src/plugin/adapters.tsx`: add `delegation: TuiDelegationApi | null` to `Input` and return `delegation: input.delegation` from `createTuiApiAdapters`.
  - `packages/tui/package.json`: add `"./plugin/delegation": "./src/plugin/delegation.ts"` next to the existing `./plugin/runtime` export.
  - `packages/opencode/src/plugin/tui/runtime.ts`: in the `pluginApi()` object literal, add `delegation: api.delegation` next to `lifecycle: scope.lifecycle`.
  - `packages/opencode/test/fixture/tui-plugin.ts`: add `import type { TuiDelegationApi } from "@opencode-ai/plugin/delegation"`, add `delegation?: TuiDelegationApi | null` to `Opts` and `delegation: opts.delegation ?? null` to the object `createTuiPluginApi` returns.
  - Pass `delegation: null` in every other `run(TuiInput)` caller: `packages/cli/src/tui.ts` (`runTui`), both calls in `packages/tui/test/app-lifecycle.test.tsx`, and, as an interim value, `packages/opencode/src/cli/cmd/tui.ts` and `packages/opencode/src/cli/cmd/attach.ts`. Tasks 22 and 23 replace those last two nulls with the real host instances.

- [ ] **Step 5: Run GREEN.**

From `packages/plugin`: `bun run test && bun run typecheck`

From `packages/tui`: `bun run test && bun run typecheck`

From `packages/cli`: `bun run typecheck`

From `packages/opencode`: `bun test test/cli/tui/plugin-delegation-api.test.ts test/cli/tui/plugin-loader-pure.test.ts && bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/plugin/src/tui.ts packages/plugin/src/tui-delegation.type-test.ts packages/tui/src/plugin/delegation.ts packages/tui/package.json packages/tui/src/plugin/adapters.tsx packages/tui/src/app.tsx packages/tui/test/app-lifecycle.test.tsx packages/cli/src/tui.ts packages/opencode/src/cli/cmd/tui.ts packages/opencode/src/cli/cmd/attach.ts packages/opencode/src/plugin/tui/runtime.ts packages/opencode/test/fixture/tui-plugin.ts packages/plugin/test/tui-delegation.test.ts packages/tui/test/plugin/delegation.test.ts packages/opencode/test/cli/tui/plugin-delegation-api.test.ts
git commit -m "feat(tui): publish delegation host contract"
```

### Task 22: Embedded private Worker RPC

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

> Plan change (2026-10-09): in production, the Worker fence and `coordinationDomain` this task needs come from `DelegationRuntime.current()` and `DelegationRuntime.coordinationDomain` (Task 6). Tests keep using the fixture Worker.

**Files:**
- Modify: `packages/opencode/src/cli/tui/worker.ts`
- Modify: `packages/opencode/src/cli/cmd/tui.ts`
- Create: `packages/opencode/test/cli/tui/embedded-delegation.test.ts`

**Interfaces:**
- Adds private Worker messages `delegation.acquireController`, `delegation.renewController`, and `delegation.releaseController`.
- Calls `ControllerService.acquireEmbedded` directly. No generated client, SDK operation, HTTP route, attached token, or token hash is involved. The embedded host owns a private map from opaque `TuiControllerHandle` to `{ worker, controllerID }`; neither mapping member crosses the Worker/TUI boundary.
- Every private RPC request and response is token-free `TuiControllerAcquireResult`; the embedded host creates the opaque handle string and stores its controller mapping privately, so embedded RPC never carries a token or controller ID in either direction.

- [ ] **Step 1: Create RPC contract tests.**

```ts
import { expect, test } from "bun:test"
import type { TuiControllerAcquireResult } from "@opencode-ai/plugin/delegation"
import { EmbeddedDelegationTestAdapter } from "../../../src/cli/cmd/tui"

test.each(["acquired", "observer"] as const)("embedded acquisition preserves %s", async (state) => {
  const harness = EmbeddedDelegationTestAdapter.make(state)
  const result = await harness.call("delegation.acquireController", { rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" }) as Record<string, unknown>
  expect(result.state).toBe(state)
  expect(result).not.toHaveProperty("token")
  expect(result).not.toHaveProperty("controllerID")
  const boundary = JSON.stringify(harness.boundaryMessages())
  expect(boundary).not.toContain("token")
  expect(boundary).not.toContain("controllerID")
  expect(boundary).not.toContain(harness.privateControllerID())
})

test("embedded acquire then renew then release stays on token-free private RPC", async () => {
   const harness = EmbeddedDelegationTestAdapter.make("acquired")
   const acquired = await harness.call("delegation.acquireController", { rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" }) as TuiControllerAcquireResult
   if (acquired.state !== "acquired") throw new Error("expected acquired controller")
    const input = { handle: acquired.handle, leaseID: acquired.leaseID, authorityEpoch: acquired.authorityEpoch }
  await harness.call("delegation.renewController", input)
  await harness.call("delegation.releaseController", input)
  expect(harness.boundaryMessages().map((message) => message.method)).toEqual(["delegation.acquireController", "delegation.renewController", "delegation.releaseController"])
  expect(JSON.stringify(harness.boundaryMessages())).not.toContain("token")
})

test("embedded host passes its delegation API into the TUI launch input", async () => {
  const harness = EmbeddedDelegationTestAdapter.make("acquired")
  const delegation = harness.tuiInput().delegation
  if (delegation === null) throw new Error("embedded host must supply a delegation API")
  expect(Object.keys(delegation).sort()).toEqual(["acquireController", "releaseController", "renewController"])
  const acquired = await delegation.acquireController({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })
  expect(acquired.state).toBe("acquired")
  expect(harness.boundaryMessages().map((message) => message.method)).toEqual(["delegation.acquireController"])
})
```

`EmbeddedDelegationTestAdapter.make(...).tuiInput()` returns the exact `TuiInput` object that the production embedded command builds for `run()`, captured instead of launching the renderer. `privateControllerID()` returns the controller ID the embedded host generated and holds in its private handle map, so the test can prove that the value never crosses the boundary; it returns `"controller_absent"` for the observer case.

- [ ] **Step 2: Run RED.** Run from `packages/opencode`: `bun test test/cli/tui/embedded-delegation.test.ts`. Expected: FAIL because the Worker methods are absent.

- [ ] **Step 3a: Implement private message schemas.** Add the three discriminated token-free Worker messages and responses; make token/hash/controller/Worker fields unrepresentable.
- [ ] **Step 3b: Implement the private handle map.** Bind trusted Worker identity inside the host and map opaque handles to private controller state.
- [ ] **Step 3c: Implement private dispatch.** Call `acquireEmbedded`/renew/release and wrap the production dispatcher with the captured message port in `EmbeddedDelegationTestAdapter.make`.
- [ ] **Step 4: Adapt the embedded TUI host.** Construct `TuiDelegationApi` over private Worker calls through `makeTuiDelegationAdapter` (imported from `@opencode-ai/tui/plugin/delegation`), normalize only acquired versus observer, and replace Task 21's interim `delegation: null` in the `run()` input of `packages/opencode/src/cli/cmd/tui.ts` with that instance. A `local` build still passes the instance; acquisition then fails closed in core with `local_build`.

- [ ] **Step 5: Run GREEN.** Run from `packages/opencode`: `bun test test/cli/tui/embedded-delegation.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/opencode/src/cli/tui/worker.ts packages/opencode/src/cli/cmd/tui.ts packages/opencode/test/cli/tui/embedded-delegation.test.ts
git commit -m "feat(opencode): add embedded delegation RPC"
```

### Task 23: Attach adapter parity

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Modify: `packages/opencode/src/cli/cmd/attach.ts`
- Create: `packages/opencode/test/cli/attach/delegation.test.ts`

**Interfaces:**
- Implements `TuiDelegationApi` over the generated remote client.
- The generated client's acquire method returns `AttachedControllerAcquireResult` with `controllerID` and token only in the wire acquired result. The attach host creates an opaque handle string and maps it internally to `{ controllerID, token }` plus the server/Worker association, retains that map only in host-process memory, strips both wire-only fields before returning `TuiControllerAcquireResult` to TUI/HUD, supplies `X-OpenCode-Controller-ID` and `X-OpenCode-Controller-Token` on renew/release, and clears it on release/disposal.
- Keeps Basic Auth only in host-process memory, uses `X-OpenCode-Delegation-Protocol`, `X-OpenCode-Controller-ID`, and `X-OpenCode-Controller-Token` for lease operations, and rejects invalid transport before acquisition. The observer is already token-free and passes through unchanged.

- [ ] **Step 1: Create transport/auth matrix.**

```ts
import { expect, test } from "bun:test"
import { AttachDelegationTestAdapter } from "../../../src/cli/cmd/attach"

type AttachCase = Readonly<{ url: string; password: string | null; expected: "ok" | "auth_required" | "insecure_transport" }>

test.each([
  { url: "http://192.0.2.10:4096", password: "secret", expected: "insecure_transport" },
  { url: "https://server.test", password: null, expected: "auth_required" },
  { url: "https://server.test", password: "secret", expected: "ok" },
  { url: "http://127.0.0.1:4096", password: "secret", expected: "ok" },
] satisfies readonly AttachCase[])("validates $url", async (input) => {
   const harness = AttachDelegationTestAdapter.make({ url: input.url, password: input.password, acquireResponse: { state: "acquired", leaseID: "lease_a", controllerID: "controller_a", authorityEpoch: 1, expiresAt: 7000, token: "one-time-token" } })
  if (input.expected === "ok") {
    const result = await harness.api.acquireController({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })
    expect(result.state).toBe("acquired")
    expect(result).not.toHaveProperty("token")
  }
  if (input.expected !== "ok") await expect(harness.api.acquireController({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })).rejects.toMatchObject({ code: input.expected })
})
```

- [ ] **Step 2: Create observer and credential-boundary test.**

```ts
test("attach maps a parsed ControllerConflict failure to the observer result", async () => {
  const harness = AttachDelegationTestAdapter.make({ url: "https://server.test", password: "bootstrap-secret", acquireError: { _tag: "ControllerConflict", state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 } })
  expect(await harness.api.acquireController({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })).toEqual({ state: "observer", reason: "controller_conflict", rootSessionID: "root_a", expiresAt: 7000 })
  expect(harness.hasLeaseToken()).toBe(false)
  const serialized = JSON.stringify(harness.requests().map((request) => ({ url: request.url, headers: Array.from(request.headers.keys()) })))
  expect(serialized).not.toContain("bootstrap-secret")
  expect(serialized).not.toContain("auth_token")
  expect(serialized).not.toContain("one-time-token")
  expect(harness.logs().join("\n")).not.toContain("bootstrap-secret")
})

test("attach acquire then renew then release retains and clears the one-time token in host memory", async () => {
   const harness = AttachDelegationTestAdapter.make({ url: "https://server.test", password: "bootstrap-secret", acquireResponse: { state: "acquired", leaseID: "lease_a", controllerID: "controller_a", authorityEpoch: 1, expiresAt: 7000, token: "one-time-token" } })
  const acquired = await harness.api.acquireController({ rootSessionID: "root_a", protocol: "opencode.delegation/v1", buildID: "hud_build" })
  if (acquired.state !== "acquired") throw new Error("expected acquired controller")
  expect(acquired).not.toHaveProperty("token")
  expect(acquired).not.toHaveProperty("controllerID")
  expect(JSON.stringify(acquired)).not.toContain("controller_a")
  expect(harness.hasLeaseToken()).toBe(true)
   const authority = { handle: acquired.handle, leaseID: acquired.leaseID, authorityEpoch: acquired.authorityEpoch }
  const renewed = await harness.api.renewController(authority)
  expect(renewed).not.toHaveProperty("token")
  expect(renewed).not.toHaveProperty("controllerID")
  expect(JSON.stringify(renewed)).not.toContain("controller_a")
  await harness.api.releaseController(authority)
  expect(harness.hasLeaseToken()).toBe(false)
  const [acquireRequest, renewRequest, releaseRequest] = harness.requests()
  expect(acquireRequest?.headers.get("authorization")).toMatch(/^Basic /)
  for (const request of [renewRequest, releaseRequest]) {
    expect(request?.headers.get("x-opencode-delegation-protocol")).toBe("opencode.delegation/v1")
    expect(request?.headers.get("x-opencode-controller-id")).toBe("controller_a")
    expect(request?.headers.get("x-opencode-controller-token")).toBe("one-time-token")
    expect(request?.url).not.toContain("one-time-token")
    expect(await request?.clone().text()).not.toContain("one-time-token")
  }
  expect(harness.logs().join("\n")).not.toContain("one-time-token")
  expect(harness.logs().join("\n")).not.toContain("bootstrap-secret")
})

test("attach host passes its delegation API into the TUI launch input", () => {
  const harness = AttachDelegationTestAdapter.make({ url: "https://server.test", password: "bootstrap-secret", acquireResponse: { state: "acquired", leaseID: "lease_a", controllerID: "controller_a", authorityEpoch: 1, expiresAt: 7000, token: "one-time-token" } })
  const delegation = harness.tuiInput().delegation
  if (delegation === null) throw new Error("attach host must supply a delegation API")
  expect(Object.keys(delegation).sort()).toEqual(["acquireController", "releaseController", "renewController"])
  expect(JSON.stringify(harness.tuiInput(), (_key, value) => (typeof value === "function" ? "[function]" : value))).not.toContain("bootstrap-secret")
})
```

`AttachDelegationTestAdapter.make(...).tuiInput()` returns the exact `TuiInput` object that the production attach command builds for `run()`, captured instead of launching the renderer.

- [ ] **Step 3: Run RED.** Run from `packages/opencode`: `bun test test/cli/attach/delegation.test.ts`. Expected: FAIL because attach does not provide delegation methods.

- [ ] **Step 4: Implement attach host state.** Validate URL and password, bootstrap with Basic Auth, accept `AttachedControllerAcquireResult`, hold the acquired token and controller ID in a handle-keyed closure, return a copy with `token` and controller ID removed to HUD, send dedicated headers on renew/release, and clear the mapping on release or host disposal. Catch the generated client's parsed `ControllerConflict` failure and map it to the token-free TUI observer. `AttachDelegationTestAdapter.make` uses the production adapter with an in-memory generated-client transport, captured cloned requests, and an IDs-only logger; it does not duplicate credential logic. Replace Task 21's interim `delegation: null` in the `run()` input of `packages/opencode/src/cli/cmd/attach.ts` with the attach `TuiDelegationApi` instance built through `makeTuiDelegationAdapter` (imported from `@opencode-ai/tui/plugin/delegation`).

- [ ] **Step 5: Run GREEN.** Run from `packages/opencode`: `bun test test/cli/attach/delegation.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/opencode/src/cli/cmd/attach.ts packages/opencode/test/cli/attach/delegation.test.ts
git commit -m "feat(opencode): add attach delegation adapter"
```

### Task 24: Host cleanup

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Modify: `packages/opencode/src/plugin/tui/runtime.ts`
- Modify: `packages/opencode/src/project/instance-store.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts`
- Modify: `packages/opencode/src/server/global-lifecycle.ts`
- Modify: `packages/opencode/src/session/processor.ts`
- Create: `packages/opencode/test/cli/tui/plugin-lifecycle.test.ts`
- Create: `packages/opencode/test/delegation/protocol.test.ts`

**Interfaces:**
- Host cleanup order is renewal stop, release request, authority-epoch fence, revocation barrier acknowledgement, plugin disposal, renderer disposal.
- Covers renderer exit, plugin deactivation, root deletion, clean shutdown, and advisory SSE disconnect.
- Embedded release failure terminates the Worker rather than displaying a false non-GOD state.
- Owns `packages/opencode/test/delegation/protocol.test.ts` and its host-composition integration body below; it runs with the host cleanup GREEN checks.

- [ ] **Step 1: Create ordered cleanup test.**

```ts
import { expect, test } from "bun:test"
import { DelegationLifecycleTestAdapter } from "../../../src/plugin/tui/runtime"

type CleanupTrigger = "renderer_exit" | "plugin_deactivation" | "root_deletion" | "shutdown" | "sse_disconnect"

test.each(["renderer_exit", "plugin_deactivation", "root_deletion", "shutdown"] as const)(
  "%s synchronously revokes before disposal",
  async (trigger) => {
    const harness = DelegationLifecycleTestAdapter.make({ releaseFails: false })
    await harness.trigger(trigger)
    expect(harness.order()).toEqual(["stop-renewal", "release", "fence-epoch", "barrier-ack", "plugin-dispose", "renderer-dispose"])
  },
)

test("SSE disconnect requests advisory cleanup without weakening lease expiry", async () => {
  const harness = DelegationLifecycleTestAdapter.make({ releaseFails: false })
  await harness.trigger("sse_disconnect")
  expect(harness.order().slice(0, 2)).toEqual(["stop-renewal", "release"])
})
```

- [ ] **Step 2: Create failure termination test.**

```ts
test("embedded release failure terminates the Worker", async () => {
  const harness = DelegationLifecycleTestAdapter.make({ releaseFails: true })
  await expect(harness.trigger("renderer_exit")).rejects.toThrow("delegation revocation failed")
  expect(harness.workerTerminated()).toBe(true)
  expect(harness.order()).not.toContain("plugin-dispose")
})
```

- [ ] **Step 2b: Create the host-composition integration suite** in `packages/opencode/test/delegation/protocol.test.ts`. This task owns this body; Task 26 only re-runs it. Use fake trusted hooks only; do not import guard, workflows, or broker HUD source.

```ts
import { expect, test } from "bun:test"
import { ProtocolHostTestAdapter } from "../../src/session/processor"

test("v2 admission, attach auth, cleanup, and delivery compose", async () => {
  const host = await ProtocolHostTestAdapter.start()
  const prompt = await host.promptV2("root_a")
  expect(prompt).toEqual({ data: "Admitted" })
  await expect(host.attach({ url: "http://192.0.2.10", password: "secret" })).rejects.toMatchObject({ code: "insecure_transport" })
  await host.attach({ url: "https://server.test", password: "secret" })
  await host.finishChildWithHandoff()
  expect(host.events()).toEqual([{ type: "delegation.outcome.ready", outcomeID: expect.any(String), branchID: expect.any(String), ownerExecutionID: expect.any(String) }])
  await host.shutdown()
  expect(host.cleanupOrder()).toEqual(["stop-renewal", "release", "fence-epoch", "barrier-ack", "plugin-dispose", "renderer-dispose"])
})
```

- [ ] **Step 3: Run RED.** Run from `packages/opencode`: `bun test test/cli/tui/plugin-lifecycle.test.ts test/delegation/protocol.test.ts`. Expected: FAIL because disposal precedes synchronous revocation, and the integration suite fails because `ProtocolHostTestAdapter` is not yet exported from `src/session/processor`.

- [ ] **Step 4: Implement a host-owned cleanup coordinator.** Serialize cleanup per root, stop renewal, call release, await barrier, then dispose. Register it at all four clean lifecycle sites; keep disconnect advisory because expiry remains authoritative. `DelegationLifecycleTestAdapter.make` constructs this production coordinator with concrete callback bodies that append the six named phases, optionally fail release, and record Worker termination; it is not a global or declaration-only harness.

- [ ] **Step 4b: Wire `ProtocolHostTestAdapter.start`** in `packages/opencode/src/session/processor.ts` as a concrete composition of the production listener on an ephemeral `127.0.0.1` port, an embedded test Worker, the generated attach client directed to that listener without test-only policy injection, the production event stream, and the production cleanup coordinator; `start` captures the listener handle and the coordinator always awaits its close in `finally`, including failing test paths, while `app.fetch` tests remain denial-only.

- [ ] **Step 5: Run GREEN.** Run from `packages/opencode`: `bun run test:httpapi && bun test test/cli/tui/plugin-lifecycle.test.ts test/delegation/protocol.test.ts && bun run typecheck`. Expected: exit 0.

- [ ] **Step 6: Commit.**

```bash
git add packages/opencode/src/plugin/tui/runtime.ts packages/opencode/src/project/instance-store.ts packages/opencode/src/server/routes/instance/httpapi/lifecycle.ts packages/opencode/src/server/global-lifecycle.ts packages/opencode/src/session/processor.ts packages/opencode/test/cli/tui/plugin-lifecycle.test.ts packages/opencode/test/delegation/protocol.test.ts
git commit -m "feat(tui): fence delegation during host cleanup"
```

### Task 25: Maintenance schemas, service, and CLI

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

**Files:**
- Create: `packages/core/src/delegation/maintenance.ts`
- Create: `packages/core/test/delegation-maintenance.test.ts`
- Modify: `packages/core/test/fixture/delegation.ts`
- Create: `packages/opencode/src/cli/cmd/debug/delegation.ts`
- Modify: `packages/opencode/src/cli/cmd/debug/index.ts`
- Create: `packages/opencode/test/cli/delegation-maintenance.test.ts`

**Interfaces:**
- Implements `MaintenanceService`.
- Registers exact command prefix `opencode debug delegation maintenance` in the current yargs debug tree.
- Common options are `--database PATH --json`. Command-specific options are exact: revoke `--lease-id --authority-epoch`; branch commands `--branch-id`; drain `--timeout-ms`; export `--output`; canary `--root-session-id --expires-in-ms`.
- `identity`, `status`, `controllers`, `branches`, `participants`, and `pending` are read-only. Every write invokes a core service and uses an immediate transaction.

The CLI tests use this complete named setup helper; no setup is hidden in a separate `beforeEach`.

```ts
import { Effect } from "effect"
import { createDelegationFixture } from "../../../core/test/fixture/delegation"
import type { BranchFence, DelegationProtocol, WorkerFence } from "@opencode-ai/schema/delegation"

type MaintenanceCliSetup = Readonly<{ fixture: ReturnType<typeof createDelegationFixture>; database: string; leaseID: string; authorityEpoch: number; branchID: string; release(): Promise<void>; close(): Promise<void> }>

async function setupMaintenanceCliFixture(home: string): Promise<MaintenanceCliSetup> {
  const fixture = createDelegationFixture()
  try {
    const database = `${home}/delegation.sqlite`
    await fixture.start({ filename: database, workers: 1 })
    for (const rootSessionID of ["root_a", "root_canary", "root_other"]) await fixture.seedRootSession(rootSessionID)
    for (const childSessionID of ["child_pending", "child_acknowledged"]) await fixture.seedChildSession(childSessionID, "root_a")
    const worker = fixture.worker("worker_a", "epoch_a", "core_build")
    await fixture.registerWorker({ worker, buildID: "core_build", protocol: "opencode.delegation/v1", coordinationDomain: "domain_a", now: 1000 })
    for (const participant of [{ component: "core" as const, buildID: "core_build", capabilities: ["controllerLeaseV1"] }, { component: "guard" as const, buildID: "guard_build", capabilities: ["toolAuthorizeV1", "terminalHandoffV1"] }, { component: "broker_hud" as const, buildID: "hud_build", capabilities: ["controllerLeaseV1"] }]) {
      await fixture.registerParticipant({ worker, coordinationDomain: "domain_a", component: participant.component, buildID: participant.buildID, protocol: "opencode.delegation/v1", capabilities: participant.capabilities, heartbeatAt: 1000 })
    }
    const execution = await fixture.acquireExecution({ sessionID: "root_a", rootSessionID: "root_a", kind: "root", worker, now: 1000 })
    const acquired = await fixture.acquireEmbeddedController({ rootSessionID: "root_a", controllerID: "controller_a", worker, protocol: "opencode.delegation/v1", buildID: "core_build", now: 1000 })
    if (acquired.state !== "acquired") throw new Error("expected acquired controller")
    fixture.setSanitizer(async (input) => ({ status: "sanitized", payload: input.payload }))
    await fixture.acquireExecution({ sessionID: "child_pending", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
    await fixture.acquireExecution({ sessionID: "child_acknowledged", rootSessionID: "root_a", kind: "native_child", worker, now: 1000 })
    const pendingBranch = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "foreground" })
    const acknowledgedBranch = await fixture.reserveBranch({ parentSessionID: "root_a", rootSessionID: "root_a", ownerExecution: execution, parentBranchID: null, kind: "native", delivery: "background" })
    const pendingRegistered = await fixture.bindBranch({ branch: pendingBranch.branch, childSessionID: "child_pending" })
    const acknowledgedRegistered = await fixture.bindBranch({ branch: acknowledgedBranch.branch, childSessionID: "child_acknowledged" })
    const pendingAcknowledged = await fixture.acknowledgeBranch({ branch: pendingRegistered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
    const acknowledgedReady = await fixture.acknowledgeBranch({ branch: acknowledgedRegistered.branch, ownerComponent: "core", ownerBuildID: "core_build", protocol: "opencode.delegation/v1" })
    await fixture.startBranch({ branch: pendingAcknowledged.branch })
    await fixture.startBranch({ branch: acknowledgedReady.branch })
    await fixture.createOutcome({ idempotencyKey: "maintenance-pending", kind: "permission_handoff", errorCode: null, origin: pendingAcknowledged.branch, rootOwnerExecution: execution, branchPath: [pendingAcknowledged.branch.branchID], candidate: { type: "permission", permission: "bash", pattern: "safe", description: "safe" }, delivery: "foreground" })
    const acknowledgedOutcome = await fixture.createOutcome({ idempotencyKey: "maintenance-acknowledged", kind: "permission_handoff", errorCode: null, origin: acknowledgedReady.branch, rootOwnerExecution: execution, branchPath: [acknowledgedReady.branch.branchID], candidate: { type: "permission", permission: "bash", pattern: "safe", description: "safe" }, delivery: "background" })
    await fixture.acknowledgeOutcome({ outcomeID: acknowledgedOutcome.outcomeID, branch: acknowledgedReady.branch, ownerExecution: execution, worker })
    await fixture.disableAcquisition()
    let released = false
    const release = async () => {
      if (!released) {
        released = true
        await fixture.releaseController({ worker, leaseID: acquired.leaseID, authorityEpoch: acquired.authorityEpoch, controllerID: "controller_a", now: 2000 })
      }
    }
    const setup = {
      fixture,
      database,
      leaseID: acquired.leaseID,
      authorityEpoch: acquired.authorityEpoch,
      branchID: pendingAcknowledged.branch.branchID,
      release,
      close: async () => {
        const rows = await fixture.dbRows("delegation_controller_lease")
        if (rows.some((row) => row.state === "armed" || row.state === "revoking")) await release()
        await fixture.close()
      },
    }
    return setup
  } catch (error) {
    await fixture.close()
    throw error
  }
}
```

```ts
function withMaintenanceCliSetup<A, E, R>(home: string, use: (setup: MaintenanceCliSetup) => Effect.Effect<A, E, R>): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.promise(() => setupMaintenanceCliFixture(home)),
    use,
    (setup) => Effect.promise(() => setup.close()),
  )
}
```

- [ ] **Step 1: Create closed maintenance JSON schema tests before service implementation.** Add `packages/core/test/delegation-maintenance.test.ts` with this exact key/exclusion assertion:

```ts
import { expect, test } from "bun:test"
import { Schema } from "effect"
import { BranchStatus, ControllerLeaseStatus, PendingOutcomeStatus } from "@opencode-ai/schema/delegation"

test("maintenance JSON encodes exact safe keys and excludes secrets and raw content", () => {
  const controller: ControllerLeaseStatus = {
    leaseID: "lease_a",
    rootSessionID: "root_a",
    controllerID: "controller_a",
    workerID: "worker_a",
    workerEpoch: "epoch_a",
    authorityEpoch: 1,
    protocol: "opencode.delegation/v1",
    buildID: "core_build",
    issuedAt: 1000,
    heartbeatAt: 1000,
    expiresAt: 7000,
    state: "armed",
  }
  const branch: BranchStatus = {
    branchID: "branch_a",
    childSessionID: "child_a",
    rootSessionID: "root_a",
    parentSessionID: "root_a",
    parentBranchID: null,
    kind: "native",
    delivery: "foreground",
    ownerComponent: "core",
    ownerBuildID: "core_build",
    workerID: "worker_a",
    workerEpoch: "epoch_a",
    branchFencingToken: 1,
    protocol: "opencode.delegation/v1",
    state: "running",
    ownerExecutionID: "exec_a",
  }
  const pending: PendingOutcomeStatus = {
    outcomeID: "outcome_a",
    idempotencyKey: "key_a",
    kind: "permission_handoff",
    errorCode: null,
    originSessionID: "child_a",
    originBranchID: "branch_a",
    rootSessionID: "root_a",
    rootOwnerExecutionID: "exec_a",
    branchPath: ["branch_a"],
    delivery: "background",
    deliveryClaimID: null,
    deliveryLeaseExpiresAt: null,
    createdAt: 1000,
    state: "pending_delivery",
  }
  for (const [schema, value, keys] of [
    [ControllerLeaseStatus, controller, ["authorityEpoch", "buildID", "controllerID", "expiresAt", "heartbeatAt", "issuedAt", "leaseID", "protocol", "rootSessionID", "state", "workerEpoch", "workerID"]],
    [BranchStatus, branch, ["branchFencingToken", "branchID", "childSessionID", "delivery", "kind", "ownerBuildID", "ownerComponent", "ownerExecutionID", "parentBranchID", "parentSessionID", "protocol", "rootSessionID", "state", "workerEpoch", "workerID"]],
    [PendingOutcomeStatus, pending, ["branchPath", "createdAt", "delivery", "deliveryClaimID", "deliveryLeaseExpiresAt", "errorCode", "idempotencyKey", "kind", "originBranchID", "originSessionID", "outcomeID", "rootOwnerExecutionID", "rootSessionID", "state"]],
  ] as const) {
    const encoded = Schema.encodeSync(schema)(value)
    expect(Object.keys(JSON.parse(JSON.stringify(encoded))).sort()).toEqual(keys)
    expect(JSON.stringify(encoded)).not.toMatch(/token|hash|payload|credential|raw|candidate/i)
  }
})
```

- [ ] **Step 2: Create CLI helpers and read-only command table.**

```ts
import { expect } from "bun:test"
import { Effect } from "effect"
import { cliIt } from "../lib/cli-process"

const readOnlyCommands = ["identity", "status", "controllers", "branches", "participants", "pending"] as const

async function databaseBytes(path: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(path).arrayBuffer())
}

for (const command of readOnlyCommands) {
  cliIt.live(`${command} emits JSON and does not mutate the database`, ({ home, opencode }) =>
     withMaintenanceCliSetup(home, (setup) => Effect.gen(function* () {
       const database = setup.database
      const before = yield* Effect.promise(() => databaseBytes(database))
      const result = yield* opencode.spawn(["debug", "delegation", "maintenance", command, "--database", database, "--json"])
      opencode.expectExit(result, 0, command)
      expect(() => JSON.parse(result.stdout)).not.toThrow()
      const after = yield* Effect.promise(() => databaseBytes(database))
      expect(after).toEqual(before)
     }),
  )
}

cliIt.live("status and participants expose domain and immutable build identity", ({ home, opencode }) =>
  withMaintenanceCliSetup(home, (setup) => Effect.gen(function* () {
    const database = setup.database
    const status = yield* opencode.spawn(["debug", "delegation", "maintenance", "status", "--database", database, "--json"])
    opencode.expectExit(status, 0, "status")
    expect(JSON.parse(status.stdout)).toMatchObject({ coordinationDomains: ["domain_a"], participants: [expect.objectContaining({ coordinationDomain: "domain_a", component: "guard", buildID: "guard_build", protocol: "opencode.delegation/v1", availability: "available", worker: expect.objectContaining({ workerID: expect.any(String), workerEpoch: expect.any(String) }) })] })
    const identity = yield* opencode.spawn(["debug", "delegation", "maintenance", "identity", "--database", database, "--json"])
    expect(JSON.parse(identity.stdout)).toMatchObject({ buildID: expect.any(String), protocol: "opencode.delegation/v1", coordinationDomain: "domain_a" })
  })),
)
```

Every `cliIt.live` body, including read-only, status, export, expiry, and invalid-option cases, returns `withMaintenanceCliSetup(home, use)`, uses `setup.database` and dynamic IDs, and is finalized by `Effect.acquireUseRelease`; assertion and command failures still close the fixture. `databaseBytes` reads the existing file and does not create it; no setup is delegated to a separate `beforeEach`.

- [ ] **Step 3: Create exact write-command argv table.**

```ts
const writeCases = [
  { name: "disable", argv: ["disable-acquisition"], expected: { acquisitionDisabled: true } },
  { name: "enable", argv: ["enable-acquisition"], expected: { acquisitionDisabled: false } },
  { name: "canary", argv: ["allow-canary-root", "--root-session-id", "root_canary", "--expires-in-ms", "5000"], expected: { canaryRootSessionID: "root_canary" } },
  { name: "revoke", argv: ["revoke-controller", "--lease-id", "$LEASE_ID", "--authority-epoch", "$AUTHORITY_EPOCH"], expected: { controllerState: "revoked" } },
  { name: "drain", argv: ["drain-branch", "--branch-id", "$BRANCH_ID", "--timeout-ms", "5000"], expected: { branchState: "retired" } },
  { name: "abort", argv: ["abort-branch", "--branch-id", "$BRANCH_ID"], expected: { branchState: "retired" } },
] as const

function maintenanceArgv(setup: MaintenanceCliSetup, input: readonly string[]): string[] {
  return input.map((value) => value === "$LEASE_ID" ? setup.leaseID : value === "$AUTHORITY_EPOCH" ? String(setup.authorityEpoch) : value === "$BRANCH_ID" ? setup.branchID : value)
}

for (const input of writeCases) {
  cliIt.live(`${input.name} invokes a core maintenance transaction`, ({ home, opencode }) =>
    withMaintenanceCliSetup(home, (setup) => Effect.gen(function* () {
       const argv = ["debug", "delegation", "maintenance", input.argv[0], "--database", setup.database, "--json"]
       for (const value of maintenanceArgv(setup, input.argv.slice(1))) argv.push(value)
       const result = yield* opencode.spawn(argv)
       opencode.expectExit(result, 0, input.name)
       expect(JSON.parse(result.stdout)).toMatchObject(input.expected)
     })),
  )
}
```

- [ ] **Step 4: Create export, expiry, and invalid-option tests.**

```ts
cliIt.live("exports acknowledged outcomes to the exact output path", ({ home, opencode }) =>
  withMaintenanceCliSetup(home, (setup) => Effect.gen(function* () {
    const output = `${home}/acknowledged.jsonl`
    const result = yield* opencode.spawn(["debug", "delegation", "maintenance", "export-acknowledged-outcomes", "--database", setup.database, "--output", output, "--json"])
    opencode.expectExit(result, 0, "export")
    expect(await Bun.file(output).text()).toContain('"state":"acknowledged"')
  })),
)

cliIt.live("expired canary cannot acquire while globally disabled", ({ home, opencode }) =>
  withMaintenanceCliSetup(home, (setup) => Effect.gen(function* () {
    const database = setup.database
    const allow = yield* opencode.spawn(["debug", "delegation", "maintenance", "allow-canary-root", "--database", database, "--root-session-id", "root_canary", "--expires-in-ms", "1", "--json"])
    opencode.expectExit(allow, 0, "allow canary")
    yield* Effect.sleep("5 millis")
    const status = yield* opencode.spawn(["debug", "delegation", "maintenance", "status", "--database", database, "--json"])
    expect(JSON.parse(status.stdout)).toMatchObject({ acquisitionDisabled: true, canaryRootSessionID: null, canaryExpiresAt: null })
  })),
)

cliIt.live("rejects command-specific options on the wrong command", ({ home, opencode }) =>
  withMaintenanceCliSetup(home, (setup) => Effect.gen(function* () {
    const result = yield* opencode.spawn(["debug", "delegation", "maintenance", "status", "--database", setup.database, "--lease-id", setup.leaseID])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Unknown argument: lease-id")
  })),
)
```

- [ ] **Step 5: Run RED.** Run from `packages/opencode`: `bun test test/cli/delegation-maintenance.test.ts`. Expected: FAIL because the debug command is not registered.

- [ ] **Step 6a: Implement the `identity` read command.** Open the named database through `Database.layerFromPath` and return `MaintenanceIdentity` without a transaction.
- [ ] **Step 6b: Implement the `status` read command.** Return the exact controls, counts, domains, and participant summary in `MaintenanceStatus` without a transaction.
- [ ] **Step 6c: Implement the `controllers` read command.** Return `MaintenanceControllersOutput` without a transaction.
- [ ] **Step 6d: Implement the `branches` read command.** Return `MaintenanceBranchesOutput` without a transaction.
- [ ] **Step 6e: Implement the `participants` read command.** Return `MaintenanceParticipantsOutput` without a transaction.
- [ ] **Step 6f: Implement the `pending` read command.** Return `MaintenancePendingOutput` without a transaction.
- [ ] **Step 7a: Implement disable acquisition.** Update `delegation_control` in one immediate transaction and return `MaintenanceDisableOutput`.
- [ ] **Step 7b: Implement enable acquisition.** Update `delegation_control` in one immediate transaction and return `MaintenanceEnableOutput`.
- [ ] **Step 7c: Implement canary allowance.** Replace the single root/expiry in one immediate transaction and return `MaintenanceCanaryOutput`.
- [ ] **Step 7d: Implement controller revoke.** Call `ControllerService.revoke` and return the closed revoke output.
- [ ] **Step 7e: Implement branch drain.** Wait up to `--timeout-ms` and return `MaintenanceDrainOutput`. A branch it retires goes through Task 14's shared branch-retirement write, so a taken-over branch's `kind: "takeover"` execution is terminalized with it (2026-10-08 takeover fixes); never write `retired` directly.
- [ ] **Step 7f: Implement branch abort.** Fence and retire the branch and return `MaintenanceAbortOutput`. Retire through Task 14's shared branch-retirement write, as in Step 7e.
- [ ] **Step 7g: Implement acknowledged-outcome export.** Write only acknowledged sanitized JSON Lines and close the output handle.

- [ ] **Step 8: Register strict yargs commands.** Export `DelegationDebugCommand` from `debug/delegation.ts`; add it to `DebugCommand`; demand subcommands; mark every required option with `.demandOption`; reject command-inapplicable flags under strict parsing.

- [ ] **Step 9: Run GREEN.**

From `packages/opencode`: `bun test test/cli/delegation-maintenance.test.ts && bun run typecheck`

From `packages/core`: `bun run typecheck`

Expected: all commands exit 0.

- [ ] **Step 10: Commit.**

```bash
git add packages/core/src/delegation/maintenance.ts packages/core/test/delegation-maintenance.test.ts packages/core/test/fixture/delegation.ts packages/opencode/src/cli/cmd/debug/delegation.ts packages/opencode/src/cli/cmd/debug/index.ts packages/opencode/test/cli/delegation-maintenance.test.ts
git commit -m "feat(opencode): add delegation maintenance CLI"
```

### Task 26: Verification and release-contract gate

> Execution note (2026-10-08): work and commit only in the current checkout on its current branch (`feat/delegation-protocol-v1` in `/home/dev/projects/opencode-delegation`). Do not create a git worktree or a branch; plan-run reviews and bases each task on this branch.

Task 26 is documentation/configuration verification only. It introduces no behavior, writes no new test, claims no RED result, implements no integration adapter, and creates no commit.

- [ ] **Step 1: Run the focused integration suites.** Run the core delivery and host-composition suites owned by Tasks 19 and 24.

From `packages/core`: `bun test test/delegation-protocol.test.ts`

From `packages/opencode`: `bun run test:httpapi && bun test test/delegation/protocol.test.ts`

Expected: all focused integration commands exit 0.

- [ ] **Step 2: Run migration and generated checks.** Run `bun run script/migration.ts --check`, `bun run generate`, and `bun run check:generated` in their owning packages; inspect generated diffs.
- [ ] **Step 3: Run the complete package suites.** Run these package-scoped commands; do not run a root-level test command.

From `packages/schema`: `bun test && bun run typecheck`

From `packages/plugin`: `bun run test && bun run typecheck && bun run build`

From `packages/client`: `bun run generate && bun run check:generated && bun run test && bun run typecheck`

From `packages/core`: `bun run script/migration.ts --check && bun run test && bun run typecheck`

From `packages/protocol`: `bun run typecheck`

From `packages/opencode`: `bun run test:httpapi && bun run test && bun run typecheck`

From `packages/tui`: `bun run test && bun run typecheck`

Expected: every command exits 0. Do not run a root-level test command.

- [ ] **Step 4: Verify the frozen dependency lockfile.** Do not update `bun.lock` in Task 26; run root-level `bun install --frozen-lockfile` only. Task 2 updates the lockfile with `bun install`.
- [ ] **Step 5: Run and assert the successful build-ID build.** Run `OPENCODE_BUILD_ID=plan1-build-test bun run --cwd packages/opencode build --single --skip-install --skip-embed-web-ui`; assert `packages/opencode/dist/opencode-linux-x64/bin/opencode --version` equals `plan1-build-test`.
- [ ] **Step 6: Request independent review.** Review the twelve Review Focus cases, every spec invariant, all Worker/execution/branch/authority fences, credential and token handling, migration/generated diffs, exact package boundaries, and the integration suites already owned by Tasks 19 and 24. No Git, build, or test result is claimed by this documentation edit.
