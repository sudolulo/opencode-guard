# Incarnation-bound native cleanup

**Status:** Records Holden's selected **Incarnation-bound repair (Recommended)**: atomic checked row/history cleanup plus incarnation-bound runtime cancellation and finalizers. Source and tests are authorized for subsequent implementation; this document-writing task changes documentation only. The lead retains architectural/integration judgement and reviews these documents before implementation. No new approval ceremony is required.

**Native checkout:** `/home/dev/projects/opencode-god-catchall-bridge` only. `/home/dev/projects/opencode` is foreign and excluded. Existing reviewed permission-policy and TUI behavior is frozen. Workflow implementation belongs to its separate owner in `/home/dev/opencode-agent-workflows`.

**Related:** [Approved option-B identity contract](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-session-incarnation-design.md), [parent authority design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md), [implementation plan](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-13-incarnation-bound-cleanup.md).

## 1. Outcome and boundaries

An owned cleanup operation captures `{ sessionID, incarnationID }` once. Deleting, interrupting, cancelling approvals/jobs, closing gates, and running delayed finalizers for that target must never operate on a replacement incarnation of the same ID. A successful database removal compares the captured incarnation, projects the deletion, and removes the intended old aggregate history in **one immediate transaction**. Observers run only after that transaction commits.

The selected approach is **not** a shared process-wide create/delete lock. Modern explicit-ID creation remains supported and participates through the existing database/event machinery. This repair adds no public route, table, root generation, admission ticket/receipt, DeletionOperation, or full RootAdmission service. The immutable birth/incarnation implementation remains the approved identity source. No dependencies, SDK generation, build, install, restart, commit, push, or release are included.

The durable compare/delete/purge uses database transaction serialization. Runtime handles are current-process/instance ownership only: this design does not prove remote/distributed runner cancellation, cross-process observer ordering, or restart recovery of runtime ownership.

## 2. Source evidence and two distinct failure windows

Paths below are relative to the native checkout; package directories really are `packages/core`, `packages/server`, and `packages/opencode`.

| Verified boundary | Current source | Consequence |
|---|---|---|
| Legacy and modern routes share the storage/event projection infrastructure | `packages/opencode/src/server/routes/instance/httpapi/server.ts:212-306` | An isolated legacy process gate cannot exclude modern explicit-ID recreation. |
| Checked removal reads before asynchronous teardown | `packages/opencode/src/session/session.ts:649-697` | A formerly correct target can become stale during child deletion or observer waits. |
| Deleted projector deletes by ID alone | `packages/core/src/session/projector.ts:264-266` | A delayed old Deleted can remove a replacement row. |
| Durable projectors run inside an immediate transaction; listeners run afterward | `packages/core/src/event.ts:239-352,379-410` | Listener suspension is an intentional, deterministic interleaving boundary, not a database lock. |
| Aggregate purge is a separate raw-ID transaction | `packages/core/src/event.ts:514-523` | Recreation during Deleted notification can have its Created event and sequence erased afterward. |
| Explicit-ID create only returns early while a row exists | `packages/core/src/session.ts:208-263` | A recreated ID has a fresh incarnation without passing the legacy gate. |
| Legacy runner/gate maps and idle deletion are ID-keyed | `packages/opencode/src/session/run-state.ts:61-95,138-173` | An old cancellation/finalizer can find or remove the new owner's entry. |
| Legacy abort announces before ID-keyed cancellation | `packages/opencode/src/session/prompt.ts:156-166` | A reentrant Aborted observer can replace the row/work before cancellation resumes. |
| Modern interrupt resolves the current ID-keyed coordinator entry | `packages/server/src/handlers/session.ts:367-391`; `packages/core/src/session/execution/local.ts:16-35`; `packages/core/src/session/run-coordinator.ts:94-101` | Checking a row in the handler does not bind the later interruption. |
| SQLite transaction context is inherited, with savepoints for nesting and typed callback failures | `packages/effect-drizzle-sqlite/src/effect-sqlite/session.ts:118-202` | Nested transactions are supported, but wrapping existing publish is still wrong: its notifications would precede the outer commit. |

**Row-delete schedule:** remover A captures parent P/inc1 and child C; its child Deleted commits and its listener blocks. Remover B sees no child, deletes P/inc1, and purges its history. Modern creation installs P/inc2. A resumes and publishes its captured parent Deleted. The current ID-only projector deletes inc2.

**History-purge schedule:** a sole parent Deleted commits and its listener blocks. Modern creation installs P/inc2 and its Created/sequence. The old remover resumes and calls `events.remove(P)`, purging the replacement history.

These schedules are source-verified hypotheses with explicit barriers, **not executed regressions yet**. Sequential stale-precondition tests do not cover either window.

## 3. Internal contracts

These are proposed TypeScript contracts, not claims that the methods already exist.

### 3.1 Target identity

Create `packages/core/src/session/target.ts` exporting `SessionTarget.Target` and `SessionTarget.key`:

```ts
export type Target = {
  readonly sessionID: SessionSchema.ID
  readonly incarnationID: string
}
export const key = (target: Target): string =>
  JSON.stringify([target.sessionID, target.incarnationID])
```

`SessionSchema` is imported from `./schema`. The key is an internal collision-free tuple encoding, not a new public identity/generation. Export `fromKey(key: string): Target` as the validated inverse for local coordinator drain/active conversion; invalid internally supplied tuples are programmer defects. This avoids a second persistent target registry and preserves same-target coalescing. Missing or empty incarnation is never a wildcard. Move the existing mismatch class to this module as `MismatchError`, retaining tag `SessionIncarnationMismatchError` and fields `{ sessionID: SessionSchema.ID, incarnationID: Schema.String }`; legacy `IncarnationMismatchError` reexports that class. Add internal `MissingError` with tag `SessionTarget.Missing` and `{ sessionID: SessionSchema.ID }`, mapped to each existing service's NotFound at its boundary. `assertCurrent(db: Database.Interface["db"], target: Target): Effect.Effect<void, MissingError | MismatchError>` reads the row and distinguishes missing, mismatched, and matching identity; SQL failures remain defects. Callers use it inside the existing event/direct-write transaction, not as a substitute for that transaction.

Add optional scoped `SessionTarget.Current` carrying `Target | undefined`, and `bindEvents(events: EventV2.Interface, db: Database.Interface["db"]): EventV2.Interface`. This decorator uses `publishChecked` plus `assertCurrent` for durable session-aggregate publications from a matching Current target. A session-aggregate write for a different target does not bypass checking merely because a root remains valid: child work installs its own captured target before mutation, and a mismatched scoped session ID interrupts the old owned effect. Created is a deliberate exception because its new row does not yet exist: existing creation flows assign a fresh child target and validate the captured parent in the creation event's transaction, rather than asserting that the new row already exists. Root creation outside owned execution retains its existing behavior. Expected stale/missing ownership interrupts only the old owned fiber; it never becomes a fake successful notified event. Outside that owned scope, existing publication behavior remains. The scope is installed once at legacy runner admission and local modern execution registration and is inherited by their child/finalizer fibers. It is not a transferable admission receipt, root-generation counter, or service granting authorization. `EventV2.notify` explicitly clears Current before invoking listeners: a reentrant observer must not accidentally inherit inc1's write binding when independently creating inc2. Runtime collaborators must use the decorated event handle; replacing a Context service does not retroactively replace a service's already-captured event variable.

### 3.2 Typed checked event publication

Extend `EventV2.Interface` with this internal method and option type; retain existing `publish`, `remove`, and ordinary commit-hook behavior for unrelated callers:

```ts
export interface CheckedPublishOptions<E> extends PublishOptions {
  readonly check: Effect.Effect<void, E>
  readonly purgeAggregate?: true
}
// Interface member:
readonly publishChecked: <D extends Definition, E>(
  definition: D,
  data: Data<D>,
  options: CheckedPublishOptions<E>,
) => Effect.Effect<Payload<D>, E>
```

`purgeAggregate` refers only to this durable event's own aggregate. Non-durable checked publication/purge is rejected as programmer misuse, not silently downgraded. No callback can announce a skipped deletion as successful publication.

Within the existing immediate durable transaction, the order is:

1. Run `check` against the current row using the same `db` transaction context. Fail with typed missing/conflict before any projector or insertion.
2. Perform existing duplicate/replay/sequence validation and durable projectors; the Deleted projector also has an incarnation-qualified SQL predicate as defense in depth.
3. Run the existing operational `commit(seq)` hook, if any, in its established position.
4. Append the event and update sequence using the existing implementation.
5. If requested, delete that aggregate's event rows **and sequence row**, including this just-appended Deleted, before commit. This preserves today's final empty-history removal contract; it does not leave a deletion tombstone or reinsert sequence after purging.
6. Commit; only then wake streams and notify listeners with the committed payload/assigned sequence. Notification is best-effort delivery under the existing listener-error policy, not proof of retained durable history.

Typed check failures survive the transaction boundary as `E`; SQL/serialization/programmer defects retain existing defect handling. In particular, the current outer `.orDie` must not consume `E`. The implementer must narrow SQL errors separately, and pin typed-vs-defect behavior in a test. Existing `PublishOptions.commit` alone is insufficient: it runs before event insertion, and therefore purging there would be undone by subsequent sequence/event inserts.

`EventV2Bridge` supplies the same instance location for `publishChecked` as for `publish`. Neither method is called inside an outer transaction whose later commit controls visibility. Neither cancellation nor observers execute inside the database transaction.

### 3.3 Runtime ownership, not raw-ID lookup after a wait

Add `SessionRunState.capture(target): Effect.Effect<SessionRunState.Handle>`. A handle closes over one incarnation's gate/runner ownership, not a future map lookup by ID:

```ts
export interface Handle {
  readonly target: SessionTarget.Target
  readonly beginClose: Effect.Effect<void>
  readonly cancel: Effect.Effect<void>
  readonly awaitDrain: Effect.Effect<void>
  readonly markClosed: Effect.Effect<void>
}
```

Runner/gate registries use target keys. Admission and release close over the same gate; the existing synchronous check/increment and idempotent release remain. New incarnation entry points resolve current identity once before admission. A late old release/markClosed/onIdle may affect its old object only. Map deletion/replacement uses compare-and-delete (`map.get(key) === capturedEntry`) and old idle callbacks cannot publish a replacement's idle state.

Existing raw-ID methods remain compatibility entry points where required; they capture the current target at entry and delegate. They must not re-resolve a target after permission/event/background waits. Existing `Runner` run/shell handles already isolate executions inside one Runner; preserve them rather than redesigning the runner state machine.

Add `SessionExecution.interruptIncarnation(target): Effect.Effect<void>` and retain `interrupt(sessionID)` as a compatibility wrapper. Local execution coordinates by `SessionTarget.key(target)` rather than ID. `resume` and `wake` capture current identity before registration; `drain` revalidates that same target before selecting location/work and does not retarget a coalesced successor to a replacement. `SessionRunner.run` accepts an internal optional `incarnationID` beside its existing `{sessionID, force}`; local execution always supplies it, and legacy direct runner callers capture once when omitted. `active` still exposes the existing set of Session IDs. Coordinator settle mutates a slot only if it still holds the captured entry. No process-global root admission registry is introduced.

Add `SessionV2.interruptIncarnation(target): Effect.Effect<void, SessionV2.NotFoundError | SessionTarget.MismatchError>` and `SessionPrompt.abortIncarnation(target): Effect.Effect<void, NotFoundError | SessionTarget.MismatchError>`. Existing HTTP handlers pass the captured target through these service methods rather than doing check-then-raw-ID action. `MismatchError` has the existing tag `SessionIncarnationMismatchError`; `NotFoundError` in the prompt signature is the existing legacy storage error.

### 3.4 Bound cancellation owners and finalizer writes

Permission policy and trusted-user reply semantics do not change. Add internal `Permission.cancelIncarnation(target): Effect.Effect<void>`; pending entries privately capture requester and approver/root incarnation when registered. Root-wide cancellation still covers requester-or-approver ownership, but only for the bound incarnation. The existing in-flight-ask cancellation stamp becomes incarnation-scoped, and pending finalizers compare the captured pending-entry object before deleting by request ID. Escalation retains the same binding. The existing raw `cancel(sessionID)` API may remain for explicitly unconditional compatibility callers, but owned abort/remove paths do not call it.

Background jobs privately bind session/ancestor ownership at creation, using an internal optional `StartInput.owner: { session: SessionTarget.Target; ancestors: ReadonlyArray<SessionTarget.Target> }`. This is not an event/schema metadata addition. Cancellation first selects entries belonging to the captured incarnation, then captures their actual registry handles; it never repeatedly follows metadata raw IDs into replacement ownership. Add `BackgroundJob.capture(id, target): Effect.Effect<BackgroundJob.Handle | undefined>` to the core registry and legacy adapter. `Handle` exposes `cancel: Effect.Effect<Info | undefined>`, `wait: (timeout?: number) => Effect.Effect<WaitResult>`, `promote: Effect.Effect<Info | undefined>`, and `extend: (run: Effect.Effect<string, unknown>) => Effect.Effect<boolean>`. Capture verifies actual Active ownership against target; subsequent effects close over its token/scope/Deferred. Executing after ID reuse cannot operate on the new Active. Preserve the existing token-checked `settle` implementation. Child expansion follows captured ancestor identities, not an ever-growing set of unqualified session IDs. Raw methods remain for existing explicitly unconditional APIs, but task callbacks and teardown use captured handles.

`packages/opencode/src/tool/task.ts:104-110,156-190,227-296` already obtains parent/ancestor and child Info. It must retain those targets when starting/extending jobs, scheduling parent-result injection, promoting/waiting, and calling `TaskPromptOps` cancellation. In particular, `inject` must not reread a replacement parent and `Effect.onInterrupt(() => ops.cancel(childID))` must not retarget a replacement child. These are ownership edits only; subagent permission derivation is outside this repair and under a separate writer.

Finalizers that write durable session/message state must carry the target captured at runtime admission. For those writes, the target comparison and event projection must share `publishChecked`'s transaction; a read immediately before ordinary publish is not sufficient. The core runner's publisher flush/failAssistant/failUnsettledTools/Step.Ended paths (`packages/core/src/session/runner/llm.ts:281-342`) and repeated `getSession`/input promotion/context epoch writes (`:110-113,179-200,390-412`) are included, not only coordinator interruption. Direct DB mutations compare the same target inside their existing mutation transaction; they do not place an outer transaction around event publication. A stale old finalizer completes its old fiber/Deferred without publishing, updating messages/status, deleting new registry entries, or retrieving the replacement's last assistant as its result. Existing error channels that cannot fail may explicitly drop a stale owned write with a diagnostic. This is an internal binding of existing owned work, not a new public admission protocol.

## 4. Removal dataflow and errors

1. `remove(id)` captures the current Info/target. `removeIncarnation(target)` first verifies the supplied identity before touching runtime state. Missing is 404; mismatch is 409 and performs no cancellation/fencing/deletion/publication.
2. Capture the bound runtime handle and cancellation owners. Fence that handle, cancel its permissions and jobs/legacy runner, interrupt/join its modern local execution, and join/drain it, outside all database transactions. Wire the existing SessionExecution service into removal's service graph; tests without execution explicitly provide the existing noop layer, rather than silently skipping a required owner. Do not mark a replacement's gate closed.
3. Re-read children only while the parent still has the captured identity; bind every child's own incarnation from the snapshot. Call the internal bound removal path with that captured child Info/target, **not** `remove(child.id)`. Before operating on a later snapshot/descendant, check the parent target again; stop traversal on replacement. A child missing or replaced after capture is skipped as stale; never delete the replacement child. `parent_id` has no parent foreign-key cascade (`packages/core/src/session/sql.ts:32`), so preservation must be deliberate.
4. Call `publishChecked(Deleted, { sessionID, info: capturedInfo }, { check, purgeAggregate: true })`. `check` reads the current row in the immediate transaction and returns typed missing/conflict. Deleted's SQL predicate includes both ID and incarnation. The event's Info is the captured original, not a freshly reread replacement.
5. After successful commit/notification, finalize only the old handle. An interrupted observer cannot leave a half-purged database or cause a later raw-ID purge. There is no trailing `events.remove(id)` in removal.

The final transaction is the deletion linearization point. A duplicate remover whose target disappeared returns existing not-found behavior; one whose ID is replaced returns existing conflict behavior. No losing operation emits a successful stale Deleted. A legitimate committed Deleted may be delivered after recreation; its identity remains inc1 and consumers must not reinterpret it as inc2.

HTTP success bodies remain legacy delete/abort `true` (200) and modern interrupt no content (204). Existing 404/409 names and payloads remain. An omitted precondition still requires no new caller field and operates on the resource captured at invocation; normal omitted delete/abort/interrupt behavior is unchanged. A concurrent replacement is not permission to retarget an in-flight unconditional request. The delete handler maps final bound-operation conflicts on both branches. Legacy omitted abort of an absent ID remains a successful no-op and does not reserve/cancel a future incarnation; modern route missing remains the existing middleware/service 404. There is no 402 contract in the inspected handlers.

## 5. Events, observers, and replay

**One necessary public additive schema change:** `SessionV1.Event.Aborted` gains optional `incarnationID: IncarnationID`. The native publisher emits it for every real-row abort, because external guard/workflow listeners otherwise receive only an ID and cannot bind cancellation. Legacy payload decoding still accepts absence. `Deleted` already includes `info.incarnationID`; do not add duplicate fields, arbitrary event properties, or routes. Generated SDK files are not regenerated in this repair.

Aborted publication uses `publishChecked` with a row check and no purge. After notification, permission/runtime cancellation uses the already-captured target/handles. A postcommit Aborted listener may delete/recreate and start inc2; resuming inc1 abort must not cancel inc2. A transactionally failed abort check emits no event and does not append history to inc2. A committed inc1 Aborted can survive delayed delivery only as an inc1 notification, never authorization to cancel the current ID owner.

Consumers of Aborted/Deleted must compare event identity with their stored owner binding **before** scheduling effects; delayed callbacks capture that binding and retain it. Native share cleanup is included: the Deleted listener must not invoke `ShareNext.remove(rawID)` against whichever share is now cached. It operates on the old incarnation's captured share entry, uses its immutable remote share ID, and conditionally deletes cache/queue/database entries only if they are still that owner. Public manual share removal remains a separate compatibility entry point. The Codex plugin's Deleted handler (`packages/opencode/src/plugin/openai/codex.ts:284-287`) currently closes every pool's current raw-ID slot. The pool (`ws-pool.ts:66-73,187-195`) must key incarnation-bound requests/cleanup by target and compare captured entries; old socket terminal callbacks cannot evict a newer slot. An internal request-only incarnation header from the admitted LLM target may carry this binding, but must be stripped before provider HTTP/WebSocket forwarding like existing internal headers; it is not a new API route or public event field. Status/idle events without identity are observations, not authority to cancel or rebind an owner.

External changes are integration requirements owned by the lead and the guard/workflow writers, not native implementation ownership. Capable-host missing identity fails closed: old ID-only Aborted/Deleted cannot initiate destructive owned cleanup of a current incarnation. Old-host retention remains unchanged. The workflow writer must consume optional Aborted identity and existing Deleted Info identity without recapturing the current replacement as the old owner.

**Replay policy:** identity-bearing Deleted projects only against an equal incarnation. If an existing row has another incarnation, projection fails explicitly with `InvalidDurableEventError` before append/notification; a stale historical event does not contaminate the replacement's history. An absent row during trusted replay is non-destructive; duplicate identical events still short-circuit under existing sequence/idempotency rules. An unguarded live Deleted is not an escape hatch: missing/mismatched live identity fails explicitly, while the checked service path supplies the normal typed 404/409 first. Historical Created without identity still mints an incarnation as already approved. To preserve full-history reconstruction, `replayAll` provides one invocation-local replay context containing its aggregate ID and the exact session incarnation inserted by a successful Created projector. A missing-identity historical Deleted may use only that captured replay birth, with an ID+incarnation SQL predicate; it cannot substitute the current row's identity. This context is neither serialized nor retained in a process-wide map, and cannot be supplied by live publication. A concurrent recreation therefore cannot be deleted by the old replay.

Add module namespace `ReplayProjectionContext` in `packages/core/src/event/replay-context.ts` (Context-only, no dependency on EventV2 or Session services), exporting `State = { aggregateID: string; sessionIncarnationID?: string }` and `Service` carrying `State | undefined`. `replayAll` creates one mutable context per invocation; nested/concurrent replay batches get distinct objects. `replay` participates in its caller's context only when aggregate IDs match, otherwise creates a fresh context. Ordinary live `publish/publishChecked` explicitly clear this context for their projector execution, and `notify` clears it before observers, so replay provenance cannot leak into live publication or unrelated reentrant replay. The Created projector records its actual inserted identity into that private context after successful insertion. It must never learn a binding from a failed/duplicate Created or an existing row. A Deleted without identity and without that provenance fails explicitly with `InvalidDurableEventError` before projection/history append/notification; it is not silently ignored and never wildcard-deletes. Live missing-identity Deleted fails the same way. Replay duplicate detection remains before projection, so an already-recorded identical event is still idempotent.

A historical Created-through-Deleted batch into a fresh rebuild keeps historical deletion semantics **only if its birth insertion actually succeeds**. A skipped duplicate Created, `onConflictDoNothing` loss, standalone missing-identity Deleted, or suffix-only replay cannot prove its birth from the current code's persisted schema; it requires a proven birth-containing replay into a fresh target and fails explicitly otherwise. The lead accepted this precise replay provenance policy during design; do not replace it with a blanket historical no-op or invent persistent replay generations. Replay does not automatically authorize live runtime cancellation; optional replay publication preserves the event's original data and consumers do not infer new live ownership from missing identity.

## 6. Acceptance and test matrix

All concurrency tests use Effect Deferred barriers and real shared Database/EventV2/SessionProjector services. No sleeps, scheduler-probability loops, mock-only ID success, or foreign checkout. Each test releases barriers and joins fibers in scoped cleanup, even on assertion failure.

| Test | Required assertion |
|---|---|
| A pauses after child Deleted commit; B removes parent; modern explicit-ID recreate; A resumes | Parent inc2 row and its Created/sequence survive; A fails conflict and emits no parent Deleted for its losing operation. |
| Sole parent Deleted pauses postcommit; modern recreation; old remover resumes | Inc2 history/sequence survive unchanged; there is no late purge; committed inc1 Deleted was delivered exactly once. |
| Reentrant listener creates replacement inside Deleted callback | No database transaction/listener deadlock; recreated state survives after old finalization. |
| Two removers, no replacement | One committed removal; loser missing; no duplicate successful notification, retained history, or leaked runtime handle. |
| Original target only, no instance state, with children | Existing successful cleanup, child history purge, and missing behavior remain. |
| Child ID replaced while ancestor teardown waits | Captured child inc1 effects cannot delete/cancel child inc2; ancestor traversal never rebinds a child raw ID. |
| Checked event missing/conflict/SQL error | Typed expected errors survive; SQL/programmer defects remain defects; neither failed case notifies or changes row/history. |
| V2 execution replaced after precondition capture | Inc2 real runner/fiber remains active; inc1 interrupt/follow-up/settle affects only inc1. |
| Aborted listener pauses, deletes/recreates, starts inc2 | Old abort does not cancel inc2 permissions/jobs/runner or overwrite inc2 status/messages. |
| Old legacy finalizer delayed past replacement | No map deletion, markClosed, last-assistant retarget, message/status mutation, or background cancellation of inc2. |
| Permission requester/root replacement and reused job ID | Old bound cancellation rejects only old pending ownership and closes only captured Active scope; private-user/Always semantics stay green. |
| Delayed Deleted share/event consumer | Replacement cached share, queue and row survive; old remote cleanup addresses old share ID only. |
| Omitted parameter / stale parameter / missing / legacy decode / replay | Existing normal 200/204/404/409 behavior; full historical birth/deletion replay works through private provenance; unsafe standalone/suffix missing-identity deletion fails explicitly. |

## 7. Evidence status and self-review

Verified directly while designing: transaction/projector/notification/purge ordering, SQLite savepoint context and generic typed-error signature, legacy removal and recursive raw-ID call, modern create and interrupt delegation, runtime map/finalizer lookup, permission pending cancellation/finalizer storage, background registry token finalization, Aborted schema, share Deleted/raw-ID cleanup, and the existing service/HTTP test conventions. No commands or tests were run for this document task.

Self-review resolved these traps: purge occurs after append, not in the existing commit hook; nested publish is not used as a postcommit mechanism; optional preconditions do not permit in-flight retargeting; recursive children retain their own identity; replay absence is not a wildcard; delayed observers retain old identity; no runtime cancellation is held under a transaction. The exact breadth of runtime finalizer and event-consumer callsite edits is an execution audit gate, not evidence that all current consumers have already been repaired. The lead must review the source-owner map and this compatibility policy before implementation; this document does not mark the parent checkpoint complete.
