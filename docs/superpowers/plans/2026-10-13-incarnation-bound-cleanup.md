# Incarnation-bound Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans for this parent-orchestrated repair. Steps use checkbox (`- [ ]`) syntax for tracking. The lead retains architecture/security/integration and assigns serialized, explicit path owners to implementers, testers, and independent reviewers.

**Goal:** Make native checked deletion/history cleanup atomic and make every owned cancellation/finalizer retain the captured session incarnation rather than selecting a replacement by ID.

**Architecture:** Extend the existing immediate EventV2 transaction with a typed preprojection check and postappend aggregate purge, then notify after commit. Keep runtime effects outside that transaction and bind their existing gates, fibers, approvals, jobs, and event consumers to immutable `{sessionID, incarnationID}` targets. Use invocation-local successful-birth replay provenance for historical ID-only Deleted, not a new persistent ownership architecture.

**Tech Stack:** TypeScript, Effect services/Deferred/Fiber, SQLite through effect-drizzle-sqlite, Drizzle projectors, package-local Bun tests and existing tsgo typechecks.

**Spec:** [Incarnation-bound native cleanup design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md).

## Global Constraints

- Native writes/tests only in `/home/dev/projects/opencode-god-catchall-bridge`; never foreign `/home/dev/projects/opencode`.
- This is an approved source+test repair, not permission to commit, push, build, install, restart, generate SDKs, update dependencies, or deploy. This planning task itself runs no commands/tests and changes no production/test files.
- No new endpoint, table, per-root generation, ticket/receipt, DeletionOperation, or full RootAdmission. Preserve current immutable birth identity.
- Existing permission policy, hard-rule provenance, private human reply, Always restrictions, and TUI behavior are not redesigned. Separate origin-policy writer owns `packages/core/src/v1/config/agent.ts`, its origin helper, `packages/opencode/src/config/config.ts`, `packages/opencode/src/agent/agent.ts`, and their tests; do not overlap those paths. Overall permission acceptance remains held for that separate repair/review.
- Workflow deep writer owns `/home/dev/opencode-agent-workflows`; this plan defines consumer integration requirements but does not write that repo. The lead coordinates guard/workflow changes and their reviews.
- Use Bun **1.4.2** at `/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun`. Commands below run from explicit package working directories, never repository-root Bun. Missing existing tooling/dependencies is a concrete blocker, not authorization to install or skip.
- No DB transaction across cancellation, drain, observer/network waits, or publication nested under an outer transaction whose commit has not occurred.
- Every concurrency regression uses Deferred barriers with scoped release/join/unsubscribe; no sleeps or probabilistic scheduler loops.
- Treat current checkout as dirty; preserve preexisting work. Do not claim focused green means full-native green, deployed behavior, or real TUI proof.

## Review Focus

1. Typed missing/conflict survives the checked event boundary; SQL/programmer defects are not flattened into stale success or HTTP 500 for an expected 409. Task 1 pins typed failure, rollback, and no notification.
2. Reentrant/delayed listeners can create a replacement after commit; no trailing purge, inherited old execution scope, or old finalizer can mutate it. Tasks 1 and 2 pin both schedules and scope isolation.
3. Historical full replay into a fresh target remains faithful, but duplicate/skipped birth cannot authorize an ID-only Deleted. Task 1 pins fresh, suffix, skipped/duplicate, and unrelated-current-row replay cases.
4. Root approval cancellation, recursively owned jobs, background promotion/result injection, share cleanup and Codex pool removal retain old ownership across waits/ID reuse. Task 2 pins each owner with live service/registry entries.
5. Omitted precondition, absent row, absent instance state, child replacement, and concurrent duplicate removal keep the documented normal API behavior without rebinding an in-flight operation. Task 1 tests deletion; Task 2 tests abort/interrupt and actual HTTP/OpenAPI/schema contracts.

---

## Execution method and ownership

The current main cwd `/home/dev/projects/md` is not Git; `plan-run` has no external-repo cwd argument and imperatively commits. **Do not use it for this plan.** The lead uses explicitly path-scoped `sp-implementer` tasks for Tasks 1 and 2, sequentially, followed by `tester` and independent `reviewer`. A child receives this plan, its spec, the exact checkout path, and the no-commit/no-build constraints. The lead self-reviews both docs before dispatch; this is not a new user approval gate.

Task 1 owns the database/event/removal interface slice while executing. Task 2 then owns runtime producers/consumers and may extend the frozen Task 1 interfaces only through the lead. The two implementers must never write concurrently: `event.ts`, `target.ts`, `session.ts`, bridge and integration tests move together. Task 3 is verification/review, not a production writer. Each implementation task ends with its own RED/GREEN and read-only review; final acceptance requires the combined gates.

## File map

All paths in this table are relative to the native checkout. New test files named here are intentional planned files; existing test harness references are source-verified.

| Owner | Files | Responsibility |
|---|---|---|
| Task 1 | New `packages/core/src/session/target.ts`; new `packages/core/src/event/replay-context.ts` | Shared target/error/check contracts; private replay provenance, no persistent registry. |
| Task 1, then Task 2 | `packages/core/src/event.ts`; `packages/opencode/src/event-v2-bridge.ts` | Checked durable transaction, after-append purge, postcommit notification; later scoped owned-publication integration. |
| Task 1 | `packages/core/src/session/projector.ts` | Incarnation-qualified Deleted projection; successful Created replay-birth binding. |
| Task 1, then Task 2 | `packages/opencode/src/session/session.ts`; `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts` | Atomic bound removal/child traversal/error mapping; later runtime ownership and abort integration. |
| Task 1 tests | Existing `packages/core/test/event.test.ts`, `packages/core/test/session-create.test.ts`, `packages/opencode/test/session/session-incarnation.test.ts`, `packages/opencode/test/server/session-incarnation.test.ts` | Transaction, replay, both real service races, HTTP compatibility. |
| Task 2 core | `packages/core/src/session.ts`, `packages/core/src/session/execution.ts`, `packages/core/src/session/execution/local.ts`, `packages/core/src/session/run-coordinator.ts`, `packages/core/src/session/runner/index.ts`, `packages/core/src/session/runner/llm.ts`, `packages/core/src/session/runner/publish-llm-event.ts` | Captured execution target, target-keyed slots, scoped publication and guarded finalizers. |
| Task 2 direct DB | `packages/core/src/session/input.ts`, `packages/core/src/session/context-epoch.ts` | Guard existing runtime-owned direct mutations inside their existing transactions; retain recording APIs outside owned execution. |
| Task 2 legacy | `packages/opencode/src/session/run-state.ts`, `packages/opencode/src/session/prompt.ts`, `packages/opencode/src/session/status.ts` | Bound handles/gates/runner finalizers, abort service and target-aware status ownership. |
| Task 2 permission/jobs | `packages/opencode/src/permission/index.ts`, `packages/core/src/background-job.ts`, `packages/opencode/src/background/job.ts`, `packages/opencode/src/tool/task.ts` | Private ownership binding and stable cancellation/wait/promotion/extension handles; no policy redesign. |
| Task 2 consumers | `packages/opencode/src/share/share-next.ts`, `packages/opencode/src/plugin/openai/codex.ts`, `packages/opencode/src/plugin/openai/ws-pool.ts`, `packages/opencode/src/session/llm.ts` | Delayed Deleted cleanup and internal pool/request ownership, not replacement raw-ID cleanup. |
| Task 2 transport | `packages/server/src/handlers/session.ts`, `packages/opencode/src/server/routes/instance/httpapi/server.ts`, `packages/schema/src/v1/session.ts` | Existing interrupt/remove composition and single additive optional Aborted incarnation. |
| Task 2 tests | Existing `packages/core/test/session-runner.test.ts`, `packages/opencode/test/session/prompt.test.ts`, `packages/opencode/test/background/job.test.ts`; new `packages/opencode/test/session/incarnation-runtime.test.ts`, `packages/opencode/test/session/incarnation-consumers.test.ts`; new `packages/schema/test/session-aborted-incarnation.test.ts` | Real execution/registry/pending/consumer races and legacy event decoding. |
| Task 2 related contracts | `packages/opencode/test/event-manifest.test.ts`, `packages/schema/test/event-manifest.test.ts`, `packages/opencode/test/server/httpapi-public-openapi.test.ts` | Legitimate manifest/schema/OpenAPI assertions, including current approved Aborted event, no route expansion. |

The implementer records any additional producer touched by a bounded callsite audit and asks the lead before entering another writer's paths; the list is not permission to refactor unrelated helpers.

### Task 1: Atomic checked deletion/history cleanup and safe historical replay

**Interfaces consumed:** existing `Database.Service.db.transaction(callback, {behavior:"immediate"})`, `EventV2.publish/project/listen/replay/replayAll`, `SessionV1.Event.Created/Deleted`, legacy `Session.remove/removeIncarnation`, and `SessionV2.create({id,location})`.

**Interfaces produced (exact proposed additions):**

```ts
// packages/core/src/session/target.ts; imports Context, Effect, Schema from effect,
// SessionSchema from ./schema, Database as a type, and SessionTable for the check.
export type Target = {
  readonly sessionID: SessionSchema.ID
  readonly incarnationID: string
}
export class MismatchError extends Schema.TaggedErrorClass<MismatchError>()(
  "SessionIncarnationMismatchError",
  { sessionID: SessionSchema.ID, incarnationID: Schema.String },
) {}
export class MissingError extends Schema.TaggedErrorClass<MissingError>()(
  "SessionTarget.Missing",
  { sessionID: SessionSchema.ID },
) {}
export const key = (target: Target): string =>
  JSON.stringify([target.sessionID, target.incarnationID])
export declare const fromKey: (key: string) => Target
// Implement as a DB select with SQL failures orDie; missing, empty identity,
// and unequal identity take their explicit typed branches.
export declare const assertCurrent: (
  db: Database.Interface["db"], target: Target,
) => Effect.Effect<void, MissingError | MismatchError>

// packages/core/src/event.ts
export interface CheckedPublishOptions<E> extends PublishOptions {
  readonly check: Effect.Effect<void, E>
  readonly purgeAggregate?: true
}
// New Interface member; existing publish remains unchanged:
readonly publishChecked: <D extends Definition, E>(
  definition: D, data: Data<D>, options: CheckedPublishOptions<E>,
) => Effect.Effect<Payload<D>, E>
```

The `declare` above specifies a contract, not executable implementation. Task 1 writes the actual `assertCurrent` implementation. Reexport `MismatchError as IncarnationMismatchError` from legacy Session; do not duplicate the class/tag. Legacy `remove` now returns `Effect<void, NotFound | IncarnationMismatchError>` because a captured omitted-precondition request can lose the final check. Both existing delete-handler branches map it to the existing conflict error.

Replay context is exactly `ReplayProjectionContext.Service` carrying `State | undefined`, with exported `State = {aggregateID:string; sessionIncarnationID?:string}`, in `packages/core/src/event/replay-context.ts`. This is private Effect context, not serialized payload. It is populated by a successful Created insert only. Live publish/projector execution and all notifications clear it; reentrant live calls cannot inherit historical birth authority. Add target key/fromKey roundtrip and malformed-internal-key tests.

- [x] **Step 1: Write the two behavioral race regressions first.** Extend the real service fixture in `test/session/session-incarnation.test.ts:17-35` with `SessionV2.node` and an explicit `[SessionExecution.node, SessionExecution.noopLayer]` for these no-execution storage cases, using the existing core create fixture pattern in `core/test/session-create.test.ts:38-45`. Include `SessionV2`, `SessionExecution`, `EventV2`, `SessionV1`, `Location`, `AbsolutePath`, `EventTable`, `EventSequenceTable`, `Deferred`, `Fiber`, and `asc` imports. Both legacy and modern services must use the **same** Database/EventV2/SessionProjector graph. Add these actual test bodies inside the existing fixture's describe block:

```ts
it.instance("keeps a replacement parent after an old child Deleted listener resumes", () =>
  Effect.gen(function* () {
    const legacy = yield* SessionNs.Service
    const modern = yield* SessionV2.Service
    const events = yield* EventV2.Service
    const db = (yield* Database.Service).db
    const parent = yield* legacy.create({})
    const child = yield* legacy.create({ parentID: parent.id })
    const reached = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.asVoid))
    let parentDeleted = 0
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== SessionV1.Event.Deleted.type) return Effect.void
      const data = event.data as EventV2.Data<typeof SessionV1.Event.Deleted>
      if (data.sessionID === parent.id) parentDeleted += 1
      if (data.sessionID !== child.id) return Effect.void
      return Deferred.succeed(reached, undefined).pipe(
        Effect.andThen(Deferred.await(release)),
      )
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    const target = { sessionID: parent.id, incarnationID: parent.incarnationID! }
    const old = yield* legacy.removeIncarnation(target).pipe(Effect.exit, Effect.forkChild)
    yield* Deferred.await(reached)
    yield* legacy.removeIncarnation(target)
    const replacement = yield* modern.create({
      id: parent.id,
      location: Location.Ref.make({ directory: AbsolutePath.make(parent.directory) }),
    })
    yield* Deferred.succeed(release, undefined)
    expect(Exit.isFailure(yield* Fiber.join(old))).toBe(true)
    expect((yield* legacy.get(parent.id)).incarnationID).toBe(replacement.incarnationID)
    expect(parentDeleted).toBe(1)
    const rows = yield* db.select().from(EventTable)
      .where(eq(EventTable.aggregate_id, parent.id)).orderBy(asc(EventTable.seq)).all()
      .pipe(Effect.orDie)
    expect(rows).toHaveLength(1)
    expect(rows[0].data).toMatchObject({ info: { incarnationID: replacement.incarnationID } })
    yield* legacy.removeIncarnation({ sessionID: parent.id, incarnationID: replacement.incarnationID! })
  }),
)

it.instance("does not purge recreated history after parent Deleted notification", () =>
  Effect.gen(function* () {
    const legacy = yield* SessionNs.Service
    const modern = yield* SessionV2.Service
    const events = yield* EventV2.Service
    const db = (yield* Database.Service).db
    const parent = yield* legacy.create({})
    const reached = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined).pipe(Effect.asVoid))
    const unsubscribe = yield* events.listen((event) => {
      if (event.type !== SessionV1.Event.Deleted.type) return Effect.void
      const data = event.data as EventV2.Data<typeof SessionV1.Event.Deleted>
      if (data.sessionID !== parent.id || data.info.incarnationID !== parent.incarnationID)
        return Effect.void
      return Deferred.succeed(reached, undefined).pipe(Effect.andThen(Deferred.await(release)))
    })
    yield* Effect.addFinalizer(() => unsubscribe)
    const old = yield* legacy.removeIncarnation({
      sessionID: parent.id, incarnationID: parent.incarnationID!,
    }).pipe(Effect.forkChild)
    yield* Deferred.await(reached)
    const replacement = yield* modern.create({
      id: parent.id,
      location: Location.Ref.make({ directory: AbsolutePath.make(parent.directory) }),
    })
    const read = () => db.select().from(EventTable)
      .where(eq(EventTable.aggregate_id, parent.id)).orderBy(asc(EventTable.seq)).all()
      .pipe(Effect.orDie)
    const before = yield* read()
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(old)
    expect(yield* read()).toEqual(before)
    expect(before).toHaveLength(1)
    expect(before[0].seq).toBe(0)
    expect((yield* legacy.get(parent.id)).incarnationID).toBe(replacement.incarnationID)
    expect(yield* db.select().from(EventSequenceTable)
      .where(eq(EventSequenceTable.aggregate_id, parent.id)).get().pipe(Effect.orDie))
      .toMatchObject({ seq: 0 })
    yield* legacy.removeIncarnation({ sessionID: parent.id, incarnationID: replacement.incarnationID! })
  }),
)
```

These bodies intentionally exercise current service entry points, not invented barriers in production. The implementer adds explicit assertion of the first old exit's `SessionIncarnationMismatchError` using the project's Effect Cause conventions, scoped cleanup for created resources on failure, and bounds only the **test timeout**, never the interleaving with sleep. Current failure expectations: first test loses inc2 or reports a successful stale delete; second loses inc2 history after release. If a fixture setup fails first, fix the fixture before recording behavioral RED.

- [x] **Step 2: Run behavioral RED.** `tester` or the test-first implementer runs, with workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/session/session-incarnation.test.ts
```

Record each regression's assertion failure, command, exit, and full output location; do not treat a compile/fixture failure as proof of either race.

- [x] **Step 3: Add transaction/replay/error regressions before implementing the boundary.** Extend `core/test/event.test.ts` with typed checked failure before projector/listener/insertion, a defect case, and purge visible as complete inside a reentrant postcommit listener. Use existing `SyncMessage`, `it`, `Database`, `EventTable`, and `EventSequenceTable`, not a fake event engine. The exact expected typed-failure assertion is:

```ts
expect(yield* events.publishChecked(SyncMessage, { id: "checked", text: "old" }, {
  check: Effect.fail("stale" as const), purgeAggregate: true,
}).pipe(Effect.flip)).toBe("stale")
```

Assert zero projector calls, zero listener calls, unchanged prior rows/sequence, and successful ordinary publication afterward. Add replay cases to `core/test/session-create.test.ts`, using its real fresh target DB/project fixture at lines 237-255: historical Created missing incarnation followed by historical Deleted missing incarnation deletes the newly inserted row; standalone/suffix missing Deleted fails `InvalidDurableEventError` with no appended Deleted; skipped duplicate/missing-identity Created never establishes birth; unrelated live row survives; concurrent explicit-ID recreation after replayed birth survives stale Deleted. A reentrant listener gate controls the last case; distinct replay invocations must not share context. Identity-bearing replay deletes only its own equal incarnation; an existing different incarnation fails before append/notification and preserves replacement history; duplicate replay stays idempotent. Raw live publication of stale Deleted also fails before append/notification instead of treating an SQL zero-row deletion as successful publication.

- [x] **Step 4: Implement checked publication and replay contracts.** Add `target.ts` and replay context; factor the existing `commitDurableEvent/publishEvent` pipeline without duplicating sequence/projector logic. Run check before projectors, append then purge inside the same immediate transaction, and notify/wake only after successful commit. Preserve expected typed failures instead of applying outer `orDie` to `E`; preserve actual SQL/programmer defects. Reject non-durable checked publication. Update bridge location propagation for both methods. Record generated incarnation into replay context only after actual Created insertion; qualify Deleted SQL by explicit event identity or proven replay birth. Missing live/replay provenance fails before projection/append/notification. Do not put existing `events.publish/remove` inside an outer transaction.

- [x] **Step 5: Integrate bound removal, children, and existing errors.** Keep early checked-remove validation before runtime fencing; final checked publication repeats the compare inside its transaction. Remove the trailing `events.remove(sessionID)`. Capture each child's Info/incarnation and recurse into the bound internal removal path; missing/replaced captured children are skipped, not rebound. Recheck parent target before further enumeration/traversal. Map final missing/conflict to existing 404/409 on both delete-handler branches. Add duplicate removal, original row/no replacement, absent instance state, replaced child, omitted and stale preconditions, and reentrant listener tests to the real service/HTTP fixtures. No successful losing Deleted is announced.

- [ ] **Step 6: Run Task 1 GREEN and independent review.** Commands:

```bash
# workdir: /home/dev/projects/opencode-god-catchall-bridge/packages/core
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/event.test.ts test/session-create.test.ts
# workdir: /home/dev/projects/opencode-god-catchall-bridge/packages/opencode
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/session/session-incarnation.test.ts test/server/session-incarnation.test.ts
```

The independent reviewer checks transaction boundaries, check-error typing, child identity, duplicate/skipped replay birth, and no successful stale notification. The lead reviews the combined source diff, freezes the produced interfaces, and then starts Task 2. Task 1 green does **not** claim runtime cancellation is safe yet.

### Task 2: Incarnation-bound runtime owners, finalizers, consumers, and transport integration

**Interfaces consumed:** Task 1 `SessionTarget.Target/key/assertCurrent/MissingError/MismatchError`, `EventV2.publishChecked`, and existing Runner/Coordinator/BackgroundJob fibers/scopes.

**Interfaces produced:**

```ts
// SessionTarget additions; no serialized/public ticket.
export class Current extends Context.Service<Current, Target | undefined>()(
  "@opencode/SessionTarget.Current",
) {}
export declare const bindEvents: (
  events: EventV2.Interface, db: Database.Interface["db"],
) => EventV2.Interface

// SessionRunState additions:
export interface Handle {
  readonly target: SessionTarget.Target
  readonly beginClose: Effect.Effect<void>
  readonly cancel: Effect.Effect<void>
  readonly awaitDrain: Effect.Effect<void>
  readonly markClosed: Effect.Effect<void>
}
readonly capture: (target: SessionTarget.Target) => Effect.Effect<Handle>

// SessionExecution.Interface addition (and noopLayer implementation):
readonly interruptIncarnation: (target: SessionTarget.Target) => Effect.Effect<void>
// SessionV2.Interface addition:
readonly interruptIncarnation: (target: SessionTarget.Target) =>
  Effect.Effect<void, NotFoundError | SessionTarget.MismatchError>
// SessionPrompt.Interface addition:
readonly abortIncarnation: (target: SessionTarget.Target) =>
  Effect.Effect<void, NotFoundError | SessionTarget.MismatchError>
// Permission.Interface addition, no policy semantics change:
readonly cancelIncarnation: (target: SessionTarget.Target) => Effect.Effect<void>

// BackgroundJob internal ownership/handle additions:
// StartInput receives optional owner; Info/public metadata shape does not change.
owner?: { session: SessionTarget.Target; ancestors: ReadonlyArray<SessionTarget.Target> }
export interface Handle {
  readonly cancel: Effect.Effect<Info | undefined>
  readonly wait: (timeout?: number) => Effect.Effect<WaitResult>
  readonly promote: Effect.Effect<Info | undefined>
  readonly extend: (run: Effect.Effect<string, unknown>) => Effect.Effect<boolean>
}
readonly capture: (id: string, target: SessionTarget.Target) => Effect.Effect<Handle | undefined>
```

These blocks are interface specifications grouped by named module, not one compilable source file. `NotFoundError` in SessionPrompt is the legacy storage type; in SessionV2 it is that module's existing error. Map `SessionTarget.MissingError` at service boundaries. Keep raw-ID public-compatible methods as entry wrappers, not as deferred effect implementations.

`TaskPromptOps` retains existing `cancel(sessionID)` for unrelated callers and adds `cancelIncarnation(target): Effect.Effect<void>`; its internal `prompt(input, target?: SessionTarget.Target): Effect.Effect<SessionV1.WithParts>` installs the supplied target scope before admission. Task-owned run/inject callbacks always supply their captured child/parent target. `SessionRunner.Interface.run` and the llm implementation accept `{sessionID, force, incarnationID?:string}`; local execution always supplies incarnation, and direct legacy callers capture at entry if omitted. `SessionStatus` adds `setIncarnation(target, status): Effect.Effect<void>`; stale owners cannot delete/update the current status entry. `ShareNext` adds `removeIncarnation(target): Effect.Effect<void>` and retains explicit manual `remove(id)`. Websocket pool adds `removeIncarnation(sessionID: string, incarnationID: string): void` and uses target keys for bound requests; missing event identity never falls through to raw remove.

- [x] **Step 1: Write behavioral runtime REDs before ownership changes.** In new `test/session/incarnation-runtime.test.ts`, use the existing AppNodeBuilder/InstanceStore/Database/EventV2Bridge/SessionProjector framework and existing prompt fixture's controllable tool/provider (`test/session/prompt.test.ts:1513-1537`). Install a Deferred-gated Aborted listener. Start inc1 work/held approval/job, begin checked abort, wait until its committed event listener blocks, remove inc1 and recreate inc2 through real `SessionV2.create`, start real inc2 work/approval/job, then release. Assert inc2 cancellation signals remain unset and its actual work can complete after its own release; inc1 signals/Deferreds settle. Assert the event carries inc1, not a newly reread identity, and new history is not appended with old Aborted after replacement.

In `core/test/session-runner.test.ts`, use its real LLM stream `streamStarted/streamGate` (`:62-94`) and real SessionExecutionLocal composition. A test-layer decorator around the **real** execution service delays one interrupt after the service/HTTP precondition capture and before delegating: baseline delegates `interrupt(id)`, repaired path delegates `interruptIncarnation(capturedTarget)`. During that Deferred wait, delete/recreate and start inc2, then release the old interrupt. Assert the inc2 fiber remains alive, processes its queued input on release, and its history has no inc1 flush/failure/Step.Ended. This test must execute the production local coordinator, not only a spy implementing `interrupt`.

For the independent old-finalizer test, deletion that joins the very blocked finalizer cannot create the required schedule. Instead pause an old publication/cleanup callback, perform the real Task 1 checked durable delete/purge directly in a separate service scope (without pretending that runtime join happened), recreate through modern create, then release old settlement. Verify its slot/active state and inc2 messages/status survive. This exercises other legitimate storage-only/replay removal boundaries and avoids a self-deadlocking test. Existing core coordinator-injected runner tests alone are insufficient evidence for local routing.

Use Deferred `.await`/`.succeed`, `Effect.forkChild`, `Fiber.await/join`, scoped `Effect.addFinalizer` and listener unsubscribe exactly as Task 1. Add tests named `old abort cannot cancel recreated runtime ownership`, `old local interrupt cannot select replacement execution`, and `old finalizer cannot clear replacement gate status or messages` so targeted runtime RED is identifiable. Record behavioral failures, not TypeError from a newly proposed method alone.

- [x] **Step 2: Run runtime RED.** With workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/session/incarnation-runtime.test.ts
```

With workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/core`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/session-runner.test.ts
```

- [ ] **Step 3: Implement target-scoped publication and stable core/legacy runtime ownership.** Implement Current and bindEvents; decorated owned durable session publications run `assertCurrent` through `publishChecked`. Stale/missing becomes interruption of the old owned fiber, not a successful fabricated payload or defect. Explicitly clear Current in EventV2 notification before observers; add a reentrant observer test showing inc2 independent creation/execution is not rejected as inc1 work. Use decorated event handles where service constructors capture them (legacy bridge/session and core runner collaborators); do not assume `provideService` replaces already-captured handles.

Key legacy runners/gates and modern coordinator by target tuple. Capture stable runtime handles before cancellation waits. Compare map slots on finalize; preserve existing Runner run/shell identity, synchronous admission increments and idempotent release. Bind last-assistant/status/write cleanup to old target, and suppress stale effects without returning replacement data. Core drain, getSession, wake successors, compaction and publication finalizers retain one target. A mismatched scoped session-aggregate ID interrupts rather than bypassing the guard: child work installs its own captured child target, never borrows a still-valid root's ownership. Child Created is explicit new-resource work: mint its fresh identity and check captured parent inside Created's existing event transaction, not a check for an as-yet-absent child row. Guard existing input/context-epoch direct writes inside their existing DB mutation transaction; do not wrap publishes with an outer transaction. Bind SessionExecution into legacy removal/service composition and interrupt the old modern owner outside DB transactions. Add explicit noop binding only in non-execution fixtures.

- [ ] **Step 4: Implement permission/job/task ownership without policy edits.** Pending entries privately retain requester/approver targets, cancellation stamps are target-scoped, and pending finalizers compare entry object before removal. The owned cancel path selects old requester OR old approver ownership, never a new same-ID requester/root. Preserve original `replyFromUser`, `forceAsk`, rejection, escalation and Always behavior. Retire old ownership bookkeeping when its admitted work has drained; do not replace raw-ID tombstones with unbounded incarnation tombstones.

BackgroundJob.capture verifies Active's internal owner against target and returns token-bound cancel/wait/promote/extend effects. Existing `settle` already checks token; retain it. Propagate handles through the legacy adapter and task start/extend/onPromote/notify/onInterrupt; capture all real ancestry targets from task's existing parent walk. Parent-result injection retains parent target and cannot fetch inc2's agent then prompt inc2. Job cancellation closes the captured scope; verify completion/finalizers are actually joined rather than assuming Scope.close alone proves every callback stopped.

Add real service/registry tests for requester replacement, approver/root replacement, an ask paused before pending insertion, reused permission request ID with delayed old finalizer, reused background job ID with delayed cancel/settle, parent/child replacement during promotion/result delivery, and no-replacement normal abort. Existing low-level cancel APIs remain compatible but owned cleanup never falls back to them for missing identity.

- [ ] **Step 5: Implement additive event and existing transport changes.** In schema V1 Aborted, add only `incarnationID: IncarnationID.pipe(Schema.optional)` using the existing schema conventions; native real-row abort always supplies captured incarnation. Publish checked Aborted before old-owner cancellation, then use bound handles after observers. Checked failed abort emits nothing. Legacy omitted abort on absent ID returns true/no-op without targeting a future row. Existing legacy/v2 handler error mappings remain 404/409; modern interrupt remains 204. Add schema tests decoding both old `{sessionID}` and bound `{sessionID,incarnationID}`, HTTP tests for late compare failure and omission, and an OpenAPI assertion that the same existing optional query/errors remain and no new v2 delete route appears.

Fix the **related real manifest failure** legitimately: `packages/opencode/test/event-manifest.test.ts:12` expects 88 while canonical schema `packages/schema/test/event-manifest.test.ts:13,27` expects 89 and includes Aborted at line 18. Update native expected size to 89 and explicitly assert canonical Aborted membership; adding an optional field does not add a 90th event. Extend actual OpenAPI/schema fixtures for optional Aborted incarnation, never exclude or mute the test. SDK generation remains prohibited.

- [ ] **Step 6: Bind delayed native consumers and pin each regression.** In `share-next.ts`, bind cache/queue entries at creation and schedule remote removal by captured old share identity, with conditional local cache/row deletion. A Deferred-delayed Deleted after inc2 shares must leave inc2 share/queue/database entry intact. In Codex/ws-pool, bind requests/removal by incarnation and compare captured entry on socket/finalizer cleanup. Add internal `x-opencode-session-incarnation` header only from the captured admitted target, strip it case-insensitively for Headers/tuple/object forms before HTTP or WebSocket provider forwarding, including fallback and retries. Provide tests in new `incarnation-consumers.test.ts` for old Deleted delivery and old socket completion after replacement. Missing identity performs no destructive owner cleanup; ordinary disposal still closes owned pools. Preserve existing idle/max-age pruning and release all test sockets/timers/listeners.

The lead owns coordination and sends the additive Aborted contract and replay policy to external writers. A separate guard writer owns `/home/dev/opencode-guard/plugin.js` and `/home/dev/opencode-guard/lib/{authority,lifecycle,notify,tree}.js`, with relevant tests. A separate workflow writer owns `/home/dev/opencode-agent-workflows/lib/{core,runtime,child-session}.js`, with relevant tests, only after the current birth writer freeze. The native writer NEVER edits these paths or repos. Their tests must show inc1 notifications cannot cancel inc2 runs/pending ownership and missing identity cannot acquire inc2 binding. At real activity, consumers capture immutable parent/root incarnation and consume `session.aborted.incarnationID` / `session.deleted.info.incarnationID` before cancel/evict; retain that binding through awaits and never adopt identity by a current read. Same-ID inc1 delayed Aborted/Deleted must leave inc2 runs, pending ownership, and caches alive. A capable consumer receiving missing identity must log/fail closed, not acquire the current owner; old-host behavior stays unchanged. Source integration commands, after the writer freeze, are `node --test tests/*.mjs` with workdir `/home/dev/opencode-guard`, and `node --test tests/*.mjs` with workdir `/home/dev/opencode-agent-workflows`. Record test counts, exits, and complete output for both. This is source integration only: no install or restart. `packages/server/src/handlers/event.ts:22-35` is an SSE forwarding observer, not a cancellation owner; test schema serialization, do not add cancellation logic there.

- [ ] **Step 7: Run Task 2 GREEN and independent review.** Use the exact Task 3 Step 1 `packages/opencode`, `packages/core`, and `packages/schema` targeted command sets, including their explicit full workdirs, as the Task 2 GREEN command set. This includes repeating both Task 1 races. Do not invent additional methods or test names. Review all source paths in the file map for remaining postwait raw-ID cancellation/rebinding; source audit is explicit evidence, not a replacement for concurrency tests. Reviewer findings are a markdown table. The reviewer was not the implementer; the lead verifies findings and resolves them within the approved scope. A source-only checkpoint stays held until Task 3 completes.

### Task 3: Combined verification, related contracts, and reviewer gate

**Owner:** `tester` for commands, independent `reviewer` for judgement, lead for integration. No concurrent writer during evidence capture. No build/install/generation/release commands.

- [ ] **Step 1: Run targeted native/regression contracts.** Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/session/session-incarnation.test.ts test/server/session-incarnation.test.ts test/session/incarnation-runtime.test.ts test/session/incarnation-consumers.test.ts test/session/prompt.test.ts test/background/job.test.ts test/event-manifest.test.ts test/server/httpapi-public-openapi.test.ts
```

Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/core`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/event.test.ts test/session-create.test.ts test/session-runner.test.ts
```

Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/schema`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures test/event-manifest.test.ts test/session-aborted-incarnation.test.ts
```

- [ ] **Step 2: Run full applicable suites, without root Bun.** Use separate background jobs owned/cleaned by tester for long suites; capture complete output and exact exit. Workdir `.../packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures
```

Workdir `.../packages/core`, then separately `.../packages/schema`, with each full path `/home/dev/projects/opencode-god-catchall-bridge/packages/core` and `/home/dev/projects/opencode-god-catchall-bridge/packages/schema` supplied to the tool:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test --timeout 30000 --only-failures
```

Related event-manifest/schema/OpenAPI failures are repair work, not acceptable exclusions. Prior environment umask `0002` caused an unrelated expected-0644/actual-0664 assertion; reproduce/classify and disclose separately if still present, without changing permissions/umask or weakening the assertion to manufacture green. Do not claim the full suite passes with any failing assertion.

- [ ] **Step 3: Run package-local typechecks.** Run the following exact command separately with workdirs `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`, `/home/dev/projects/opencode-god-catchall-bridge/packages/core`, `/home/dev/projects/opencode-god-catchall-bridge/packages/server`, and `/home/dev/projects/opencode-god-catchall-bridge/packages/schema`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run typecheck
```

All four package manifests were read during planning; each existing `typecheck` script is `tsgo --noEmit`. No SDK generation, bunx fetch, or compiler dependency installation.

- [ ] **Step 4: Prove regression specificity and independently review the combined change.** Preserve the dirty preexisting checkpoint. The preimplementation behavioral RED is the specificity proof. This shared checkpoint has overlapping preexisting dirty producer changes even within selected paths, so no `git stash`, `git stash pop`, `git restore`, or `git checkout` reversal is permitted. Any additional reversal proof requires a separately approved isolated proof environment; it is never a permission workaround. Reviewer checks both races, typed errors vs defects, postcommit ordering, replay-provenance/skipped-birth tests, all bound runtime owners, no root-admission expansion, no permission-policy regression, event/header schema compatibility, child preservation and resource cleanup. Lead source-verifies the report, resolves findings, and repeats affected suites.

- [ ] **Step 5: Record exact checkpoint and return source/test evidence.** Record pass/fail/skip counts, exits, workdirs, complete log links, known unrelated failures and every unverified boundary. Update only specific parent checkpoint caveats with links to this plan/spec; do not blanket-check old checklists. Report no commit/build/install/restart/SDK/dependency work and no distributed runtime or real TUI proof. The lead closes this source-only repair gate only after external Aborted/Deleted consumer alignment and independent re-review; deployment remains separately unauthorized.

## Plan self-review and unresolved verification facts

- Coverage maps spec sections 1-2 to constraints/behavioral RED, section 3 to produced interfaces and Task 2 ownership, section 4 to Task 1 deletion/error/child tests, section 5 to Task 1 replay plus Task 2 schema/consumers, and section 6 to targeted/full/reviewer gates. No acceptance row is silently replaced by a sequential precondition test.
- Interface names and target fields are consistent across tasks. Proposed contracts are explicitly labelled; no claim is made that new methods already exist. Test body code uses existing production service methods; Current/checked publication/handles are introduced by the owning task.
- The plan contains no commit steps, root Bun command, new public endpoint/table, dependency action, production/test edits performed during planning, or blanket completed checkbox.
- Verified source scripts: core and opencode test/typecheck and server/schema typecheck. No command was run in planning. Full runtime callsite audit and proof that background Scope.close joins all relevant cleanup remain explicit implementation/test gates, not asserted findings.
- Lead accepted successful-birth-only invocation-local replay provenance; skipped birth and suffix-only historical ID-only deletion fail explicitly. This limitation is documented rather than silently changing reconstruction to no-op.

Progress ledger: [Incarnation-bound cleanup progress ledger](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-13-incarnation-bound-cleanup-progress.md).
