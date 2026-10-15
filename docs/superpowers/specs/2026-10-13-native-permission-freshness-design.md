# Native freshness for parent-owned permissions and lifecycle effects

> **DEFERRED / NOT APPROVED:** The live immutable incarnation subset is approved separately in the [session-incarnation design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-session-incarnation-design.md). All additional per-root generations, native admission/receipt mechanisms, and the DeletionOperation table proposed here remain unapproved. This draft does not authorize implementation or scope expansion.

**Status:** Draft for Holden's written-spec review. The broader native freshness contract, its additional schema changes, plan, implementation, and deployment are not approved. No commit, push, integration, install, or restart is authorized.

## Relationship and intent

This amends the lifecycle portion of the [parent permission authority design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md). Ordinary god-root work still needs no human attention; ordinary god-child requests belong to the root model; hard command-policy exceptions remain exact-operation human-only once. Role/tool/inherited capability ceilings never soften. Generic authenticated ordinary control-plane requests remain trusted; freshness is never authorization or proof of human consent.

Holden chose native freshness rather than a guard-only marker with uncovered promotion/workflow races. This draft covers the feature's own native task, guard, workflow prompt/notification, pending-permission, and managed-cleanup producers. It does not promise distributed cancellation of arbitrary external callers, retroactive rollback of committed history, or immediate reversal of a shell command already running.

## Verified reasons the amendment is necessary

- Modern create accepts an explicit reused ID and publishes V1 Created into the same SessionTable used by legacy prompt_async. Native RunState gates are instance-scoped and disappear on disposal.
- Guard final checks occur before SDK transport. A remote promotion or asynchronous prompt can arrive after abort/deletion/resume, so plugin-only tokens cannot fence the actual effect.
- Native prompt preparation awaits hooks/image normalization and also mutates model, message/parts, touch and optional permissions; a check only before chat.message is insufficient.
- Background promotion currently selects all immediate root jobs and mutates inside a job-map lock. The check must be inside the native transition and identify the exact owning job.
- Session.remove publishes Deleted, awaits EventV2 listeners, then purges aggregate events. Once the row is gone, explicit-ID recreation can race that old purge.
- Instance disposers run concurrently. Registering another disposer does not establish revoke-first ordering.
- Workflow retirement checks parentID twice but sends unbound abort/delete. Recreated root/child IDs can pass both reads while referring to a different resource.
- Native Created event IDs are a potential existing incarnation source, but retained history for every migrated live row and replay semantics are not established. Date.now is not unique. This draft deliberately chooses explicit immutable live-row identity instead of silently assuming those properties.

## Identity and live state

### Persistent live resource identity

Native core assigns `incarnationID` to each new session, stores it on its current SessionTable row, and exposes it read-only in native create/get responses and Session.Info. Root and child rows both have this field. Ordinary create/update inputs cannot choose, overwrite, or copy it. A new native creation with a reused session ID gets a different identifier; import/restore into a new native resource also gets a fresh identifier. A continuing existing row retains its identifier.

The migration gives each existing live row one native-generated identity. It does not fabricate an original identity for old manager records. This is a NEW persistent schema field requiring approval, not an implementation already authorized. It is one immutable identity per live row, not a per-child permission counter, mutable child epoch, ticket, or historical deleted-ID ledger. Deletion removes it with the session.

A resource binding is `{ sessionID, incarnationID, parentSessionID? }`. Feature-owned cleanup captures it at native creation/ownership establishment and never replaces it by reading the current incarnation during cleanup or retry. Parent ownership checks remain in addition to incarnation matching.

### Revocable root generation

A root admission snapshot is `{ sessionID, incarnationID, generation }`, with native-generated opaque generation. A native process-local RootAdmission service owns open/revoked root records and original run references. All descendants of a root share that generation; there are no independent child permission epochs. The generation is freshness data, not a bearer credential.

One explicit NativeRuntime/DatabaseIdentity handle is injected into both legacy and modern compositions. Same service tags, SQLite filenames, module globals, or caller routing directories are not accepted as proof of shared state. Owner keys use the native database identity, stored canonical-root identity and authoritative owner directory. Distinct in-memory databases remain distinct. Each instance owner has an internal incarnation handle so old disposal callbacks cannot revoke a replacement owner.

Validation never opens, resumes, or lazily refreshes a generation. Only the trusted native root-input ingestion boundary can open a new generation. An already-open root keeps its generation for further ordinary input. A qualifying real root continuation after abort opens a fresh generation. Bound automated prompts, descendants and retries cannot resume the root. Unbound authenticated ordinary input remains the existing trusted control-plane path; no JSON actor flag gains human-only approval authority.

The original snapshot is captured at native run/input ingestion and carried through LLM waits, tool contexts, hooks, native tasks, workflow handles and queues. Resolving ancestry or fetching a current session is not permission to recapture a new generation for old work.

## Admission and linearization

Native core resolves actual ancestry with cycle/depth bounds and binds root and target incarnations. An effect binding is `{ root: RootAdmissionSnapshot, target: ResourceBinding, permissionID? }`. A supplied exact permission cause is checked against the native live pending handle, requester/call binding, parent approval and root generation. Missing, consumed, canceled or changed causes reject; an ID/list snapshot alone is insufficient.

Native owner serialization has one prescribed lock order: owner admission coordinator, bounded immediate database transaction, then a short job-map mutation when applicable. No plugin, provider, network request, approval wait, event listener, cancellation join, or promotion continuation runs under those locks. Promotion's final predicate and map update are in one nonsuspending native callback. Other paths must not take those locks in reverse order.

Prompt preparation runs outside the commit lock. Bound inputs are validated before revert/preparation; native revert mutations must have a separate bounded checked commit. After ALL awaited preparation, the message admission commit revalidates generation, root/target incarnations, live deletion fences and exact pending cause, then atomically applies the model/session/message/parts/touch/optional-permission writes belonging to that admission. No existing createUserMessage function is simply wrapped under a lock. Native runner start and each new tool invocation carry/check the original generation again.

The linearization rule is explicit: native transitions committed before revocation may finish their bounded bookkeeping and remain in history; they are not retroactively rolled back. Revocation wins against not-yet-committed transitions, even if their HTTP call or hook began earlier. No later runner/tool invocation may start from a revoked generation. An already-invoked tool follows its existing cancellation signal; freshness does not make arbitrary shell/file operations transactional.

Root abort first obtains the bounded admission coordinator, revokes the matching root generation, releases the coordinator, then publishes session.aborted before pending/runner cancellation as in the existing signal-first contract. It never waits for an LLM, hook or workflow cleanup while holding the coordinator. Leaf abort/deletion invalidates leaf resources and causes without revoking unrelated sibling/root work.

Instance dispose AND reload explicitly revoke the OLD owner before disposer fanout or exposing a replacement. This is a first phase, not another concurrently registered disposer. Captured old references stay revoked after maps are reclaimed.

Local generations govern the owning native runtime's abort/resume/disposal. DB incarnation and deletion-fence checks additionally protect shared-SQLite recreation by another native host. This does not add a distributed cross-process runner scheduler or promise global cancellation of unrelated host sessions.

## Native interfaces

- Capabilities add `permissionFreshness: 1`. Guard/workflow deferral requiring this contract checks it in addition to permissionAuthority/background support. Unsupported hosts retain the original protection floor with explicit diagnostics, not silent grants or factory unload.
- Native ToolContext and trusted tool/chat hook input add read-only `rootAdmission` and target incarnation context. They come from the original native run, not model arguments or arbitrary part metadata. MCP/native task paths must preserve the same context.
- Native approval-bearing Permission.Request includes native-owned `approval.rootAdmission` and requester incarnation binding. Hook proposals cannot manufacture/replace these fields. Native checks freshness before publishing pending and before settling it; root/leaf cancellation invalidates live handles before stale grants can commit. Human-only still has only the private TUI replyFromUser path; no broader approval endpoint is introduced.
- Bound synchronous/asynchronous prompt inputs add optional top-level `expectedAdmission: EffectBinding`. Feature-owned producers must supply it; ordinary unbound trusted-control-plane compatibility remains. Arbitrary TextPart metadata is not treated as native identity.
- Background promotion accepts a bound request with expectedAdmission and exact permission cause. Native ancestry identifies the requester's direct child ancestor under the root. Core requires the single running task job whose ID/sessionId equals that ancestor and whose immediate parent is the root, with matching live incarnation/ownership. It promotes that ONE job, never siblings. A workflow SDK child with no native task job returns no promotion and relies on its existing owned workflow yield; there is no sibling fallback.
- Feature-owned abort/delete requests add `expectedResource: ResourceBinding`. Native compares it inside destructive admission, not only via preflight GET. Matching cleanup is allowed after root revocation; it is not a request to start new work. A different current incarnation/parent is rejected untouched, and absence is idempotent done. Generic authenticated unbound controls retain their existing semantics.
- Native stale/mismatch errors have typed codes and bounded resource identifiers, never command payloads, secrets, or generation-as-auth instructions. Generated SDK is regenerated once after the approved native interfaces stabilize; generated files are not hand-edited.

## Deletion without permanent tombstones

Native core adds a database-visible live DeletionOperation record keyed by target session ID, holding original incarnation, an operation identifier and bounded lifecycle metadata. It is not cascade-deleted with SessionTable and is removed when cleanup completes. The common native Created persistence boundary checks this table in the same database transaction; neither modern create, legacy createNext/fork nor shared-DB creation can recreate that ID during old cleanup. Feature-owned child creation also checks its original root/parent binding; no new child is admitted under a deleting owner.

Deletion begins by checking the original resource binding, establishing the live deletion operation and revoking the relevant native admissions BEFORE cancel/drain/public deletion. The no-InstanceState path obeys the same identity/fence rules. Native cancellation, owned-child drain, recursive deletion and current Deleted notification behavior remain outside long-held locks.

After Deleted listeners return, a new bounded finalizer checks the SAME deletion operation and incarnation and purges EventSequence/EventTable rows plus the operation record in ONE immediate database transaction. It must not invoke the existing unguarded events.remove(sessionID) after an unrelated preflight. If the original operation no longer exists, an old finalizer cannot purge a new aggregate. Creation remains fenced until this final transaction commits. This avoids changing EventV2's existing notification ordering or retaining permanent Deleted-event tombstones.

Interrupted operations remain actual incomplete cleanup state, not silently accumulated junk. Native startup reconciliation completes the finite live deletion-operation set with the same operation/incarnation checks; concurrent recovery must be idempotent and cannot purge recreated resources. Every completed operation removes its row. Failures remain explicit and visible; no periodic historical sweeper, age eviction, or silent queue cap is added.

Once native freshness is enforced, guard may reclaim a deleted local record after an authoritative 404 and reconciliation of its outstanding owned causes. Old captured tokens remain closed, bound remote requests fail at native admission, and same-ID recreation has a different incarnation. Failed/503/ambiguous lookup is not absence. No permanent plugin deleted-ID pile or fail-open LRU remains.

## Async prompt receipts, idempotency and liveness

HTTP acceptance is not prompt admission. Bound prompt_async validates before queuing but carries the ORIGINAL binding through its fork. Native emits one correlated admission outcome at the message commit boundary, keyed by caller-supplied messageID and binding: accepted, stale or failed. Accepted occurs before runner/provider execution. A later runner error is a separate run error, never a second admission-failed outcome. Revocation after accepted prevents new runner work but does not retract committed history.

The producer installs its receipt subscription BEFORE dispatch and retains one live attempt per exact cause until admission is known. Retries keep the original binding. Native coalesces identical in-flight attempts with the same messageID and payload fingerprint; conflicting reuse rejects. An accepted message contains a server-owned admission stamp/fingerprint, letting an event-driven reconnect or SAME-ID resend resolve admission without duplicating hooks, messages or root runs. Ordinary caller metadata cannot forge that stamp. No separate historical attempt ledger is created.

Transient precommit failure explicitly logs and retains/requeues a still-live exact cause. Definitive stale/revoked/replied causes are cleared explicitly. Reconnect, relevant pending/status/idle events and terminal receipts drive reconciliation; no polling loop is added. Existing bounded escalation retries remain 100/500/2000ms then visible event-driven retry. Queues never silently evict the sole still-pending cause.

The same receipt rule applies to guard approval wakes, guard loop notices and workflow completion notifications owned by this feature. Workflow runs/child prompts/notifications retain their ORIGINAL native snapshots. Root abort immediately marks local handles canceled; actual child retirement stays asynchronous/non-joined, but native freshness independently rejects late new prompts or promotions.

## Managed cleanup, migration and recovery

Managers persist the original native resource binding only while a child/run is actually owned. Retirement still verifies parent ownership and waits the idle barrier, but both abort and delete carry the original binding. Native comparison protects the check/effect gap and works after native restart because the live row's incarnation persists. Child-only ID reuse within an unchanged root generation is also rejected.

A pre-upgrade manager record lacking an original binding is NOT silently upgraded by looking up the current incarnation during cleanup. The existing unknown set is reported as an explicit migration blocker for one-time operator adoption/cleanup, not targeted automatically and not swept forever. The implementation plan must inventory actual affected records and provide a bounded migration procedure before rollout. This draft does not authorize adopting or deleting those resources.

Current live rows receive native incarnations during the schema migration; trusted input/ownership capture can then create valid new bindings. Generation initialization is never driven by replay of Created history. This choice intentionally avoids relying on every migrated row retaining a unique Created event or treating replayed old event IDs as fresh incarnations.

## Required verification

The implementation plan must include project-framework failing tests first and production-path tests, not only helper simulations:

| Case | Required result |
|---|---|
| Root abort during any await, HTTP delay or queued prompt fork | Original generation cannot commit a new prompt, permission grant, promotion or tool invocation |
| Abort then real root resume | Fresh work succeeds; all old continuations remain stale |
| Delete, authoritative 404, explicit same-ID recreation | Old bound work and cleanup cannot touch the new incarnation |
| Child-only ID reuse under the same root generation | Old retirement cannot abort/delete the new child |
| Two native hosts/connections sharing SQLite | Deletion-operation fence blocks recreation until purge completes; old finalizer cannot erase new aggregate |
| Native instance reload/dispose and delayed old disposer | Old owner revoked first; replacement owner unaffected by stale callback |
| Promotion paused before native map mutation | Revoked generation/consumed cause yields zero mutation and no unrelated job promotion |
| Workflow direct ancestor has no task job | Original owned workflow yields/continues exactly once; no sibling fallback |
| Prompt pauses after hooks, normalization or before persistence | All owned native mutation boundaries obey admission; no new runner after revoke |
| 202 followed by late rejection, disconnect or duplicate resend | Exact cause remains visible/reconciled; one committed message and at most one root run |
| Permission already replied/leaf deleted with root still open | Exact stale cause cannot promote or wake; unrelated sibling work remains valid |
| Cleanup after root revoke/native restart | Matching original resources retire; missing is done; unknown/recreated identity fails closed |
| Deletion crash before/after row projection or aggregate purge | Bounded recovery completes original operation and leaves no completed-operation row |
| Missing capability, malformed context or caller-supplied fake snapshot/stamp | No freshness-based grant, resume or safety-floor relaxation |
| Original permission/human/role/identity/variant matrix | All existing guarantees remain; no Always or generic human-only approval |

Actual modern+legacy app composition tests must verify shared registry identity, not mocked equal service tags. Tests must cover native EventV2/deletion persistence and connected notification behavior. Full package typechecks, affected suites and generated SDK checks are required. Independent tester permissions remain separately gated; author suite results are not independent execution. A live TUI smoke test requires a later explicitly authorized binary/install/restart.

## Scope and approval gate

This is intentionally larger than a guard marker: new live-session incarnation field, live deletion-operation persistence, native admission context, conditional effects/cleanup, prompt receipts and SDK surfaces. It does NOT add permanent deleted history, per-child permission epochs, unrestricted model authority, a plugin lifecycle join, policy bypasses, an alternate human endpoint or a deployment.

Holden must review this written amendment, especially the live-row field and live deletion-operation table, before implementation planning. After approval, the lead writes the amended plan and obtains the execution choice. Existing original T3 source work remains separately authorized but not verified complete; this draft is not evidence that any native freshness behavior exists today.
