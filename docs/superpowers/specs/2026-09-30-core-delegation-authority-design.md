# Core Delegation Authority Protocol v1

**Status:** Draft for operator review  
**Date:** 2026-09-30  
**Owners:** `/home/dev/projects/opencode`, `opencode-guard`, `opencode-agent-workflows`, `opencode-broker/hud`

## Context

The deployed OpenCode runtime is Holden's existing fork at `/home/dev/projects/opencode`, built from upstream v1.18.22 on branch `fork/atomic-runtime-contracts`. The deployed binary identifies itself as:

```text
0.0.0-fork/atomic-runtime-contracts-202609172149
```

This design extends that fork. It does not create a second fork or replace it with the npm runtime.

The main checkout contains unrelated, uncommitted `AgentNotFoundError` work. Implementation of this protocol must use an isolated worktree and must not stage, stash, rewrite, or absorb those changes.

The deployed permission-mode UI is `opencode-broker/hud/tui.js`, loaded by `/home/dev/.config/opencode/tui.json`. The standalone `opencode-hud` checkout is not a deployment target for this change.

## Problem

GOD mode is currently a file-based guard policy on the primary session. Delegated children are normalized to AUTO, and guard can reject their commands in `tool.execute.before` before the tool reaches OpenCode's permission service.

The broker-native classifier plan reproduced the defect in Task 7:

```text
[opencode-guard] denied (mode: auto, level: on): this looks risky to run unattended
```

The workflow then incorrectly instructed the operator to switch from GOD to Manual. It correctly stopped before restarting the broker or pushing a partial deployment.

Other delegated interactions have the same ownership defect:

- child permission and question requests can enter pending state and render in the root TUI;
- guard can reject a child question before the Question service receives the semantic question;
- native tasks and workflows have separate foreground/background delivery paths;
- multiple OpenCode Workers can observe the same stored sessions without a shared authority fence;
- local mode files cannot authorize a remote `opencode attach` server.

## Approved behavior

1. One exclusive controlling client owns GOD authority for a root session.
2. A live GOD root authorizes otherwise-promptable command/tool operations for registered descendants.
3. Explicit agent/tool denies, capability envelopes, read-only restrictions, credential exfiltration controls, stale-turn protection, and other hard floors remain effective.
4. Only the primary agent may present a genuine requirements or design question to Holden.
5. Delegated permission and question interactions never enter user-visible pending state.
6. A child that needs primary input ends with a terminal typed handoff. After answering, the primary redispatches a continuation; v1 does not suspend children.
7. Clean F9/exit revocation is synchronous. Crash or silent-partition authority expires after three missed two-second heartbeats, for a six-second maximum lease window.
8. Remote `opencode attach` may control GOD only over HTTPS or a loopback endpoint reached through an SSH tunnel.

## Non-goals

- This protocol does not allow multiple simultaneous GOD controllers for one root.
- It does not preserve a blocked child's model context while waiting for an answer.
- It does not authorize plaintext remote attach.
- It does not bypass explicit denies or make unavailable tools appear.
- It does not use mode files, environment variables, query tokens, or child-readable files as authority.
- It does not promise that F9 cancels a command whose execution admission committed before revocation. It fences subsequent admission.

## Protocol identity

Every participating component reports:

```text
protocol: opencode.delegation/v1
buildID: immutable package/commit identifier
workerID: stable ID for one server Worker process
workerEpoch: random value generated at Worker start
coordinationDomain: identifier for the shared OpenCode state database
```

GOD cannot arm unless the execution-owning core Worker, its loaded guard, and the controlling broker HUD agree on protocol v1. Every existing nonterminal descendant branch must also have an acknowledged v1 owner; a legacy, unregistered, or mismatched active child blocks acquisition. Future workflow branches verify agent-workflows compatibility during their own reserve/bind/ack sequence. Unknown, missing, or conflicting protocol data fails closed.

Package semver alone is not a protocol identity. The fork uses a custom build ID.

## Core state

Core owns all authority and branch state in its shared SQLite database. Writes use `BEGIN IMMEDIATE`, generation checks, and unique constraints for cross-Worker fencing.

### Controller lease

```text
ControllerLease {
  leaseID
  rootSessionID
  controllerID
  controllerKind: embedded | attached
  tokenHash: nullable
  workerID
  workerEpoch
  authorityEpoch
  protocol
  buildID
  issuedAt
  heartbeatAt
  expiresAt
  state: armed | revoking | revoked | expired
}
```

Only one nonterminal lease may exist per root.

State transitions:

```text
unarmed -> armed
armed -> armed       heartbeat renewal
armed -> revoking    F9, clean exit, controller release, root deletion
armed -> expired     three missed heartbeats
revoking -> revoked  authority epoch fenced and barrier completed
```

Every arm receives a new `authorityEpoch`. Revocation increments/fences the epoch before acknowledgement.

### Worker ownership

```text
WorkerOwner {
  workerID
  workerEpoch
  buildID
  protocol
  coordinationDomain
  heartbeatAt
  expiresAt
}
```

Workers heartbeat through the same shared database. A stale Worker epoch cannot renew a controller, register a branch, commit an execution permit, or acknowledge an outcome.

### Durable execution ownership

Controller and branch leases do not by themselves prevent two Workers from running the same model loop. Core therefore adds an exclusive execution record:

```text
ExecutionOwner {
  executionID
  sessionID
  rootSessionID
  workerID
  workerEpoch
  fencingToken
  kind: root | native_child | workflow_child
  heartbeatAt
  expiresAt
  state: acquired | running | draining | terminal
}
```

A root prompt loop acquires `ExecutionOwner` before model dispatch. Child execution ownership is derived from an acknowledged branch. Every message append, tool admission, branch mutation, and terminal outcome validates the execution fence.

Takeover is allowed only after the prior owner expires. Recovery fences the old epoch, marks any uncommitted in-flight step failed, replays durable terminal outcomes, and starts a new step; it never assumes an old model/tool call is still safe to continue. Legacy and v2 runners both use this durable owner instead of relying only on their process-local maps.

### Branch ownership

```text
Branch {
  branchID
  childSessionID: nullable while reserved
  parentSessionID
  rootSessionID
  ownerExecutionID
  parentBranchID: nullable
  kind: native | workflow
  delivery: foreground | background
  ownerComponent: core | workflows | null until acknowledged
  ownerBuildID: nullable until acknowledged
  workerID
  workerEpoch
  fencingToken
  protocol: nullable until acknowledged
  state
}
```

Branch state:

```text
reserved -> registered -> acknowledged -> running
running -> completed | handoff | failed
terminal -> outcome_acknowledged -> retiring -> retired
```

A reservation is created before a child ID exists. `bindBranch(branchID, childSessionID)` atomically binds the SDK-created session, verifies its canonical parent, and moves the branch from `reserved` to `registered`. `acknowledgeBranch` atomically validates the current participant registration, copies owner component/build/protocol into the branch, proves the owning runtime has installed its foreground/background delivery handler, and only then moves the branch to `acknowledged`. Missing or conflicting owner identity leaves the branch unacknowledged and unexecutable.

A child prompt cannot start before its branch reaches `acknowledged`. Any prompt or execution request for an API-created child without a registered branch fails admission before model execution with a direct `DelegationAdmissionError { code: "unregistered_branch", sessionID }`. It creates no terminal outcome, pending permission/question, or user-facing event.

### Terminal outcome

```text
DelegationOutcome {
  outcomeID
  idempotencyKey
  kind: question_handoff | permission_handoff | internal_error | protocol_failure
  errorCode: nullable
  originSessionID
  originBranchID
  rootSessionID
  rootOwnerExecutionID
  branchPath
  payload
  delivery: foreground | background
  deliveryClaimID: nullable
  deliveryLeaseExpiresAt: nullable
  createdAt
  state: pending_delivery | delivered | acknowledged
}
```

`idempotencyKey` is unique. Core stores one terminal outcome for one logical interaction and replays it after crashes until the owning execution acknowledges it.

### Protocol participants

```text
ProtocolParticipant {
  workerID
  workerEpoch
  component: core | guard | workflows | broker_hud
  buildID
  protocol
  capabilities
  heartbeatAt
}
```

Core and loaded server plugins register directly through trusted runtime input. The controlling HUD registers through embedded RPC or authenticated attach. Branch records copy the owner component/build/protocol at acknowledgement.

Controller acquisition verifies the authoritative set defined below: execution-owning core, loaded guard, controlling HUD, and every acknowledged owner of a currently nonterminal descendant branch. A workflow branch additionally requires a compatible workflow participant during reserve/bind/ack. Old Workers that do not implement participant registration cannot be discovered through this table, so rollout requires an external process inventory and stop-the-world cutover before v1 acquisition is enabled.

## Controller authentication

### Embedded TUI

The embedded TUI host uses a private main-process-to-Worker RPC. The authority operation is available only to trusted TUI plugins and has no SDK/HTTP route.

Broker HUD calls:

```ts
api.delegation.acquireController({ rootSessionID, protocol, buildID })
api.delegation.renewController({ leaseID, authorityEpoch })
api.delegation.releaseController({ leaseID, authorityEpoch })
```

The Worker validates that the session is a parentless root in its coordination domain and acquires the exclusive SQLite lease.

### Remote attach

Remote attach uses the remote server as authority. Local mode files have no authorization effect.

### Initial-rollout transport limitation (2026-10-12)

For this initial compatibility batch, every delegation controller operation--acquire, renew, release, and `outcome.get`--is accepted only when the actual Node HTTP listener is bound to the numeric loopback address `127.0.0.1` or `::1`. An SSH tunnel terminating at that listener is permitted. The server decides this from its own listener-bind option, not from client-controlled request data. `localhost` is not sufficient proof of numeric loopback.

Remote HTTPS and reverse-proxy forwarding are future gated work and are not supported by this batch. They fail closed with `insecure_transport`, including when `X-Forwarded-Proto: https`, `X-Forwarded-For: 127.0.0.1`, `Host: localhost`, or an `Origin` header claims a local or secure origin. Origin is client supplied and may only refuse a cross-origin request; it can never grant access. Basic Auth, controller-token requirements where applicable, no query credentials, error precedence, cross-origin refusal, and secret-redaction requirements remain unchanged.

This limitation supersedes, for this release only, the earlier remote-HTTPS allowances in approved-behavior item 8 (line 50), remote-attach bootstrap step 2 (line 256), and acceptance criterion 627. Those statements remain as design history and describe the future remote-HTTPS goal; they are not silently deleted or implemented in this batch. In-process `Server.Default().app.fetch` and a bare `createRoutes()` have no actual Node listener bind and default deny. The listener-boundary integration injects a typed server-owned bind policy into the HttpApi routes and handlers; it does not derive a peer address or scheme from arbitrary Web Request headers, because `HttpRouter.toWebHandler` does not preserve socket metadata.

The TUI host exposes one `api.delegation` abstraction to broker HUD. In embedded mode it uses private Worker RPC. In `opencode attach` mode it uses the remote HTTP controller client below; HUD does not choose transport or handle raw credentials.

Controller bootstrap:

1. Client connects with configured HTTP Basic Auth. Controller acquisition is disabled when the remote server has no password configured, even though ordinary server routes may allow anonymous access.
2. Server requires HTTPS or a loopback peer reached through an SSH tunnel.
3. `POST /delegation/controller/acquire` rejects query-string `auth_token`, browser cross-origin requests, plaintext non-loopback transport, and roots already controlled.
4. Server returns a random controller ID and lease token once.
5. Server stores only a cryptographic token hash.
6. Renew/release requests use dedicated headers, never query strings:
   - `X-OpenCode-Delegation-Protocol`
   - `X-OpenCode-Controller-ID`
   - `X-OpenCode-Controller-Token`

The reusable Basic Auth credential bootstraps the lease but is not the lease credential. The attach TUI keeps the returned token only in process memory. SSE/WebSocket disconnect is advisory cleanup; the two-second heartbeat and six-second expiry are authoritative.

### Exclusive ownership

Acquisition and transfer use one immediate transaction. A second client receives an ownership conflict and remains an observer. Transfer requires the current controller to release or expire; v1 has no multi-controller consensus.

## F9 and lifecycle ordering

Broker HUD serializes mode changes per root.

Entering GOD:

1. Acquire the server controller lease.
2. Confirm protocol/build/coordination-domain agreement.
3. Only then display and persist GOD as active.
4. On failure, keep the session in AUTO and show an operational error.

Leaving GOD:

1. Request server revocation for the current epoch.
2. Server increments/fences the epoch and waits for the revocation barrier.
3. After acknowledgement, HUD persists/displays the selected non-GOD mode.

Authority release is host-owned first-phase cleanup, not a best-effort plugin callback. TUI renderer exit, plugin deactivation, root deletion, and clean process shutdown revoke before ordinary plugin disposal. If embedded revocation cannot be acknowledged, the host terminates that Worker.

Abrupt death relies on the six-second lease expiry.

Persisted mode text is presentation/default state only. It never arms core authority, and a newly started TUI displays stale GOD as inactive until server acquisition succeeds.

## Branch registration API

Core native tasks register through an internal core service before creating/prompting the child.

Trusted server plugins receive a versioned branch API in `PluginInput`:

```ts
input.delegation.reserveBranch(...)
input.delegation.bindBranch(...)
input.delegation.acknowledgeBranch(...)
input.delegation.completeBranch(...)
input.delegation.failBranch(...)
input.delegation.acknowledgeOutcome(...)
```

This is not an agent tool or public child-controlled route. Agent-workflows uses it for foreground and background children. Every operation validates Worker epoch and branch fencing token.

## Tool authorization contract

### Permission precedence

Core preserves provenance while normalizing legacy and v2 permissions. Every effective rule carries `origin` (`builtin_default`, `user_config`, `agent_config`, `legacy_tools`, `session`, or `delegation`) and an immutable-deny flag.

1. Tool absence and explicit deny from the selected agent's own configuration are immutable hard floors.
2. Built-in default denies remain overrideable by the selected agent exactly as today; they are not mislabeled immutable.
3. Deprecated `tools` entries retain the provenance of the configuration scope that supplied them.
4. Remaining rules preserve their stack's documented ordering and last-match behavior.
5. Session/user allow cannot override an immutable agent/tool deny.
6. Live-root GOD may convert only an effective `ask` into one-time allow.

Legacy and v2 share the tagged normalization model while retaining their existing non-hard-rule ordering. Tests pin default-deny override, explicit-agent-deny dominance, and session-rule behavior separately.

### Pre-execution guard integration

The observed denial occurs in guard's `tool.execute.before`, before a tool calls `ctx.ask`. Core therefore adds a generic awaited authorization hook rather than relying only on Permission service:

```ts
"tool.authorize": async (input, output) => {}
```

Input includes canonical session/root/branch identity, normalized permission baseline, controller/authority epoch, Worker fence, tool name, call ID, and arguments.

Output is monotonic:

```text
continue | deny | handoff
```

No plugin can turn core `deny` into allow. Multiple hooks compose as `deny > handoff > continue`.

Guard moves authorization decisions from `tool.execute.before` into this hook:

- hard structural floors return `deny` in every mode;
- live-root GOD skips AUTO risk classification and returns `continue`;
- an unarmed registered child that would need operator approval returns `handoff`;
- a primary non-GOD request keeps existing interactive policy.

Redaction, loop tracking, and non-authorization transformations remain in their existing hooks.

### Permission-decision fencing

F9 is linearized against permission decisions, not arbitrary side effects inside a tool. Every GOD-based decision—guard pre-authorization and each later `ctx.ask`—uses an immediate transaction that verifies lease ID, authority epoch, execution owner, Worker epoch, branch fence, and nonterminal branch state, then records an idempotent permit for that decision.

Whichever transaction commits first defines order:

- permission decision first: that specific ask was authorized before revocation; the tool may continue through that already-decided operation;
- revocation first: that and all later asks reject the stale epoch.

Tools with multiple `ctx.ask` calls fence each ask independently. Revocation does not cancel a permission decision already committed or a command already running. This matches the approved rule that leaving GOD affects the next permission decision.

### Permission service

Permission service uses the same registered context before inserting pending state or publishing legacy/v2 permission events:

- primary effective `ask`, no GOD: normal primary prompt;
- registered child + live GOD: internal one-time allow;
- registered child without GOD: persist `permission_handoff` and terminate the branch;
- unregistered child: return direct `DelegationAdmissionError` before execution, with no outcome;
- registered child with stale/mismatched branch fence or protocol: persist branch-owned `protocol_failure` and terminate;
- explicit deny: deny without prompt.

No delegated permission enters a pending map or user-facing event bus.

### Shared terminal-control signal

`handoff` from `tool.authorize`, delegated Permission service, and delegated Question service all produce one non-model-visible core control type:

```text
DelegationTerminal {
  outcomeID
  branchID
  kind: permission_handoff | question_handoff | internal_error | protocol_failure
  errorCode: nullable
}
```

`unregistered_branch` is not a terminal outcome; it is the pre-execution admission error defined above. `payload_too_large` is an `internal_error` tied to a registered branch. Registered protocol mismatches use `protocol_failure`. All carry fixed bounded payloads and never persist rejected raw content.

Legacy and v2 tool runners intercept this type above ordinary tool-result/error publication. They stop the child model loop, leave no synthetic tool error for the child to paraphrase, and transfer control to branch terminal propagation.

Legacy/blocking prompt calls may return the typed terminal response synchronously. V2's admission-only prompt endpoint remains unchanged: it returns `Admitted` before model/tool execution and never pretends a later handoff was part of that completed response.

Later V2 outcomes are announced through a non-UI `delegation.outcome.ready` event carrying only outcome, branch, and owner-execution IDs. The registered branch owner resolves and acknowledges semantic payload through its trusted branch API. A generic authenticated client may query only outcomes owned by its execution/branch; it cannot read another branch's payload. Background delivery continues through the durable claim/replay pump rather than the original admission response.

## Question admission

Both legacy and v2 Question services call one core admission gate before pending insertion/publication.

Primary root question:

- validate payload bounds;
- create pending state;
- publish the normal primary question event.

Registered child question:

- validate branch ownership and bounds;
- persist one `question_handoff` outcome;
- publish no `question.asked` or `question.v2.asked` event;
- create no pending entry;
- return a non-model-visible typed control outcome to the execution runtime.

Unregistered/mismatched child:

- unregistered child returns the direct pre-execution `DelegationAdmissionError` without creating an outcome;
- a registered branch whose fence/protocol no longer matches persists a branch-owned `protocol_failure`;
- publish nothing user-facing.

Legacy and v2 question tools propagate the typed control outcome through their effect/error channels. They do not `orDie`, fabricate an answer array, expose a tool error for the child to paraphrase, or continue the child's model loop.

## Deterministic terminal propagation

Core walks registered `parentBranchID` records from the origin to the outermost branch owned by the root execution.

In one transaction it:

1. writes the unique outcome;
2. marks origin and ancestor branches `handoff`;
3. fences further child admission in those branches;
4. identifies one `rootOwnerExecutionID` as delivery owner.

Intermediate child models do not reissue or paraphrase the question. Source and ancestor child executions are aborted/retired after terminal state is durable.

### Foreground delivery

The owning native task/workflow call returns the stored typed outcome synchronously. It acknowledges delivery after the root model receives the result.

### Background delivery

Existing native and workflow background callbacks are process-local and are not treated as durable. Protocol v1 adds a core delivery pump over `DelegationOutcome`.

The original tool call has already returned, so it never attempts to return again. An eligible Worker atomically claims one pending background outcome with a short delivery lease, validates the current root execution owner, and injects one bounded synthetic result carrying the outcome ID. The root message append uses that outcome ID as an idempotency key. After durable append, the pump marks the outcome delivered; the root execution acknowledges it after consumption.

Agent-workflows stores its normal report plus the core outcome ID in the workflow run record. It no longer relies on an in-process `.then()` callback as the sole delivery mechanism. Native background jobs similarly register durable branch/result metadata before returning their handle.

Worker death releases an expired delivery claim for replay. Crash after root-message append but before acknowledgement finds the existing idempotent message and advances state without a duplicate. Crash before outcome persistence marks the fenced branch failed; recovery never invents a question.

## Pre-persistence sanitization

Core never persists raw tool arguments or arbitrary error objects. It constructs a schema-allowlisted candidate payload, enforces structural/byte bounds, and passes the candidate through a mandatory trusted `delegation.sanitize` hook before opening the outcome transaction.

Guard owns the fleet sanitizer implementation and applies its credential patterns to question text, option fields, permission category/description, and bounded internal-error text. The hook returns only the sanitized typed payload. Missing participant attestation, hook failure, invalid shape, or detected unredactable secret produces a fixed `internal_error` payload with no raw content.

Logs contain IDs, kinds, sizes, and state transitions only. They do not contain raw question text, command arguments, controller tokens, Basic Auth, or pre-sanitized errors.

## Guard level and GOD semantics

Protocol v1 distinguishes guard level from permission mode:

- `on`: classifier and static hard floors are available; live GOD bypasses prompt/risk classification but retains immutable floors and sanitization.
- `static`: static hard floors and sanitization remain; live GOD bypasses prompt/risk classification without an LLM classifier.
- `off`: guard authorization and sanitizer participants are absent. GOD acquisition is disabled, delegated asks fail closed, and HUD displays GOD unavailable.

The old `off` promise of “nothing from opencode-guard” remains literal; core does not pretend its delegation protocol can provide guard redaction in that state. Broker HUD wording is updated to make `off` incompatible with GOD. The old file-derived GOD shortcut and early-return redaction bypass are removed.

## Payload bounds

Bounds are enforced before persistence or event publication:

- maximum 8 questions per handoff;
- maximum 16 options per question;
- header: 128 UTF-8 bytes;
- question text: 4096 bytes;
- option label: 256 bytes;
- option description: 1024 bytes;
- custom answer: 16 KiB;
- total serialized outcome: 64 KiB;
- branch path: maximum 16 entries.

Oversize input becomes a typed `payload_too_large` terminal outcome. Content is not silently truncated into a misleading prompt. Existing credential redaction applies before model-visible delivery.

## Failure invariants

| Condition | Required behavior |
|---|---|
| Explicit deny or absent tool | Deny; GOD cannot override |
| Guard hard floor | Deny; no prompt |
| Child request without a registered/acknowledged branch | Direct `DelegationAdmissionError`; no outcome or pending UI |
| Missing/expired controller | Permission handoff or deny; never inherit GOD |
| Stale authority/Worker/branch epoch | Reject at the current permission-decision fence |
| Two Workers claim one root/branch | Current fenced owner continues; other returns `wrong_worker` |
| Unknown/mixed protocol | GOD cannot arm; delegated UI events remain suppressed |
| Controller clean exit | Synchronous revoke barrier |
| Controller crash/partition | Expire after 6 seconds |
| Duplicate terminal write | Return existing idempotent outcome |
| Delivery crash | Replay persisted outcome until ack |
| Background handoff | Durable synthetic-result path only |
| Remote plaintext attach | GOD unavailable |
| Raw secret in payload/log | Redact or reject before persistence |

## Capability negotiation

Core exposes versioned capabilities directly to trusted plugin/TUI runtimes:

```text
delegationProtocol: opencode.delegation/v1
controllerLeaseV1: true
registeredBranchV1: true
terminalHandoffV1: true
toolAuthorizeV1: true
durableExecutionOwnerV1: true
durableBackgroundDeliveryV1: true
```

Each loaded participant registers its component name, immutable build ID, protocol, and capabilities against the current Worker epoch. The authoritative acquisition set is: execution-owning core, loaded guard, controlling broker HUD, and the acknowledged owner participant recorded on every currently nonterminal descendant branch. Broker HUD cannot display active GOD until that complete set is compatible and acquisition is acknowledged. Agent-workflows is not globally required when no workflow branch exists; it becomes mandatory for each workflow branch during reserve/bind/ack. Guard cannot enable delegated handoff policy without `toolAuthorizeV1` and `terminalHandoffV1`.

Controller renewal rechecks the required participant set. Loss or mismatch moves the lease to revoking rather than allowing a partially upgraded Worker to keep GOD.

## Rollout and rollback

The release is an immutable compatibility set: core fork, guard, agent-workflows, broker HUD, plugin API/schema versions, and deployment links.

### Rollout

1. Build and test the complete set offline.
2. Enumerate every active OpenCode TUI/server Worker through external process/session inventory as well as the new participant table; do not rely on a hardcoded list or assume old Workers can self-report.
3. Enter a maintenance window: disable new GOD acquisition, revoke active controllers, drain or explicitly abort active branches, and verify no delegated pending interactions.
4. Stop every active Worker/TUI in the coordination domain.
5. Deploy core and all plugin products as one immutable set.
6. Restart required long-lived/headless Workers and respawn interactive TUIs.
7. Verify each process reports the same protocol, build IDs, Worker epoch, and coordination domain; verify no old process remains.
8. Run one canary root through deny, GOD command, foreground question handoff, background handoff, nested handoff, F9 revocation, crash expiry, and remote HTTPS/SSH attach.
9. Enable general GOD acquisition only after the canary passes.

### Rollback

1. Disable new acquisition and revoke all controllers.
2. Drain/abort v1 branches and preserve acknowledged durable outcomes.
3. Stop every Worker/TUI in the domain.
4. Restore the previous immutable set.
5. Quarantine unsupported v1 state rather than interpreting it as legacy state.
6. Restart and verify no v1 owner or authority remains.

Rolling mixed-version deployment or rollback is unsupported.

## Repository and release boundaries

- **OpenCode core fork:** protocol schema, SQLite state/migrations, controller APIs, durable execution/branch APIs, tagged permission provenance, tool authorization hook, per-decision fencing, permission/question admission, shared terminal control, durable foreground/background delivery, attach authentication, Worker cleanup.
- **opencode-guard:** migrate authorization logic to `tool.authorize`, consume trusted authority context, preserve hard floors/redaction, remove file-derived child GOD and Manual/F9 guidance.
- **opencode-agent-workflows:** register/ack/complete workflow branches, map terminal outcomes into foreground/background run delivery, preserve resume/cache state.
- **opencode-broker HUD:** F9 controller acquire/renew/release, exclusive-owner display, stale-GOD inactive state, remote-attach transport checks, protocol/build status.
- **devbox/fleet config:** deploy compatible versions/links and update operator guidance. The standalone `opencode-hud` repo is not modified unless deployment ownership changes separately.

## Verification

### Core fork

- Exclusive embedded and remote controller acquisition.
- HTTPS/loopback enforcement; no query-token lease authentication.
- Token hash storage and replay/fencing tests.
- Two-Worker root execution, branch, and controller ownership conflict; expiry/takeover recovery.
- 2-second heartbeat, 6-second expiry, clean release, host-owned cleanup, and abrupt death.
- Permission provenance: overrideable defaults versus immutable explicit agent/tool denies in legacy and v2.
- `tool.authorize` executes before old guard denial location.
- Each guard/`ctx.ask` decision fences against F9; already-decided operations remain valid.
- No child permission/question pending state or user-facing event publication.
- Reserve/create/bind/ack branch ordering and registered/unregistered child behavior.
- Shared legacy/v2 permission/question terminal control and SDK/HTTP representation.
- Nested terminal propagation and one root delivery owner.
- Foreground return and durable background claim/injection/ack with crash replay.
- Required participant/build negotiation and old-Worker cutover detection.
- Payload bounds and pre-persistence sanitizer failure/redaction.

### Guard

- Hard floors remain in GOD.
- GOD skips only prompt/risk classification for current attested authority.
- Unarmed child decisions become typed handoffs.
- No file-derived child authority.
- Guard `on`/`static` retain hard floors and sanitizer; `off` makes GOD unavailable.
- No delegated error mentions Manual, F9, hand-run commands, or direct user action.
- Regression coverage for guard issue 1 and agent-workflows issues 10, 25, and 26.

### Agent workflows

- Branch acknowledgement precedes child prompt.
- Branch build/protocol attestation and child-ID binding.
- Foreground and background outcome delivery are separate and durable where required.
- Nested branches propagate one outcome to the root owner.
- Resume/cache preserves blocked reason and does not replay approved tasks.
- Wrong Worker/protocol fails closed.

### Broker HUD and integration

- F9 displays GOD only after server acquisition.
- Stale persisted GOD is inactive.
- Clean revoke precedes UI mode change.
- Remote plaintext attach cannot arm; HTTPS/SSH attach can.
- Remote acquisition refuses missing Basic Auth even when ordinary routes allow anonymous access.
- Exclusive-owner conflict renders observer state.
- End-to-end Task 7 broker restart runs under a registered GOD child with no user prompt.
- A child semantic question reaches the primary as one typed handoff and never renders directly.
- All complete product suites pass, followed by independent security-focused cross-repository review.

## Implementation decomposition

Implementation is split into three sequential plans:

1. **Core protocol:** database state/migrations, controller authentication, durable execution/Worker fencing, branch registration, `tool.authorize`, per-decision fencing, interaction admission, typed terminal propagation, durable native delivery, and core tests.
2. **Fleet consumers:** guard migration, workflow branch/outcome integration, broker HUD controller lifecycle, config/docs, and full product suites.
3. **Deployment and blocked-plan recovery:** immutable build/install, all-Worker maintenance rollout, canary, end-to-end verification, then resume broker-native classifier Task 7.

Each plan is test-first and receives independent review before the next begins.

## Acceptance criteria

- The blocked Task 7 restart succeeds from a registered descendant under a live GOD controller without prompting Holden.
- No delegated permission or question enters user-visible pending state.
- Only the primary root can issue a user-facing genuine question.
- Explicit denies and hard floors remain effective in GOD.
- F9 revocation fences the next permission decision; already-decided/running work is not retroactively cancelled. Crashes expire within six seconds.
- Descendants cannot arm, renew, or forge controller authority.
- Foreground, background, and nested handoffs reach exactly one root owner with durable replay where required.
- Remote GOD works only over HTTPS or SSH-tunneled loopback with exclusive authenticated ownership.
- No child-facing path recommends Manual or F9.
- Full suites, security review, maintenance rollout, and canary pass before the broker plan resumes.
