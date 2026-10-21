# Concurrent approval for a busy god root (dedicated approver)

**Status:** PROPOSED — for Holden's review. Nothing decided, nothing implemented. This records a
design and the decisions it needs; it does not bind policy. Prompted by the 2026-10-21 depot
approval-peg incident.

**Relates to:** [god escalation policy](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md)
(this amends *how* escalated approvals are serviced, not *what* escalates or auto-approves — that
policy is unchanged), [parent permission authority](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md),
[session incarnation](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-session-incarnation-design.md),
[incarnation-bound cleanup](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md).

**Already shipped (partial mitigation, not this design):** guard `1bbbed6` (2026-10-21) changed the
wake and the `guard_pending` / `guard_decide` descriptions so the root clears its *whole* pending
queue in one turn instead of one turn per ask. That reduces the per-ask turn tax but does **not**
remove approval work from the root's single serial loop — the subject of this doc.

## 1. Problem

Under god mode the attended **root model** is the sole approver of every non-auto-approvable
descendant request (2026-10-14 policy §2): each escalated ask is serviced by a `guard_pending` /
`guard_decide` turn *on the root's own loop*, interleaved with the root's own task work. One root,
one serial loop, so approvals and the root's task compete for the same turns.

Under a heavy subagent fan-out this pegs the root:

- **1.10.0 measured:** over 3 days / 4 panes, 2,674 descendant asks cost the god roots 673 turns and
  5.3 h of `guard_decide`; children waited on the busy root for **44% of active wall time**.
- **2026-10-21, depot:** a GOD root running tester + smart + sp-implementer + deep + researcher took
  **17 distinct escalated asks in ~24 min**; at the peak a child sat `needs permission` for ~14 min
  (fork DB: root iterating, not hung; wakes firing one-per-ask correctly; backlog draining slowly).

`1.10.2` fixed wake *delivery* to a busy root; `1bbbed6` batches the *decisions* into one turn. Both
help, but the root still spends its own turns approving. The only way to stop pegging the root is to
take approval work **off the root's serial loop** — service it concurrently.

## 2. Goal / non-goals

**Goal.** A god root's own task progress is not blocked behind its descendants' approval decisions,
and children are not left waiting minutes for a serial root. Approvals are serviced on a track that
runs concurrently with the root's main loop.

**Non-goals.** This changes nothing about *what* escalates or *what* may be approved — the 2026-10-14
policy stands verbatim. It does not touch the human-only (named hard rule) path. It does not widen
auto-approval. It is purely about *who/what services an already-decided-to-escalate request, and
when*.

## 3. Hard constraints (these shape the whole design)

- **C1 — Approval authority is root-bound.** `lib/authority.js` `decide()` / `pending()` verify the
  caller is the *attended god root itself* (`verifyAttendedRoot`, `ctx.sessionID == root`), read the
  root binding, require `sameIncarnation`, require `mode == god`, require the request is owned by this
  root (`approval.sessionID == root`, `rootFor(request.sessionID) == root`) and is **not** self-made
  (`request.sessionID != root`). A descendant cannot approve; a child's own mode never loosens the
  root's (2026-10-14 root-policy §7). **Any concurrent approver widens who holds approval authority
  over the security floor — this is the crux to get right, not a detail.**
- **C2 — A session never starts another session.** `lib/agent-spawn.js`: an agent shell is marked
  (`OPENCODE_AGENT_SHELL`), the mark is inherited, and an OpenCode process that sees it refuses to
  start. Work is delegated only to a session's own subagents (`task`, `workflow_run`). **So the
  approver cannot be a new top-level session the root launches.** It must be either a root *subagent*
  (an allowed delegate) or a *fork-level lane inside the root's own session*.
- **C3 — Human-only stays human-only.** Named hard-rule / credential escalations (`kind:
  "human-only"`) are answered only by the private TUI (authority.js:591). The approver must refuse
  them exactly as the root does; they are never delegated.
- **C4 — Never fail-open.** If the approver is absent, down, or unsure, the request falls back to the
  current root-wake path (the root decides) or stays pending — it is **never** auto-approved because
  no approver was available.

## 4. Design space (two viable mechanisms, given C2)

### M1 — Dedicated approver *subagent* of the root  *(recommended to evaluate first)*

A guard-managed subagent of the attended god root (spawned via the allowed `task` path, so C2 holds),
dedicated to approvals and nothing else. It runs concurrently with the root's main loop (subagents
already run concurrently — that is the fan-out). Its loop: receive wake → `guard_pending` →
batch-decide (`guard_decide` per request) → idle.

- **Tool surface: approval-only.** The approver subagent is granted `guard_pending` / `guard_decide`
  and nothing that acts (no bash, edit, read, task, …). It cannot be subverted into doing work, and
  it raises no escalations of its own (so it never feeds its own queue — no recursion).
- **Authority extension (the one real change to the floor):** `authority.decide/pending` today key on
  `ctx.sessionID == root`. Extend them to also accept a **registered approver delegate** of that root
  for the *same incarnation*: a new binding `approverFor(root, incarnationID)` that the guard sets
  when it spawns the approver and clears on teardown. Every other check is unchanged and still
  applies with the decider = the delegate: ownership, no-self-approve, `sameIncarnation`, `mode ==
  god`, admission/abort fences, human-only refusal. The decision is logged as the root's authority,
  executed by its named delegate (auditable).
- **Why this preserves the trust model:** the human trusts the *god root*; the approver is that
  root's own dedicated, incarnation-bound, approval-only delegate with no broader powers. It is the
  root's judgment on a parallel track, not a new trust principal — provided the invariants in §5 all
  hold. The delegation is **exactly and only** "decide this root's owned parent approvals," nothing
  else.

### M2 — Fork-level concurrent approval lane

The OpenCode fork services approvals on a second lane *within the root's own session* (same session
id, same authority, no new session at all — sidesteps C1's "who" question entirely). The guard hands
the fork a decide callback; the fork runs it off the root's main generate loop.

- **Pro:** no authority extension — the decider *is* the root session. Cleanest against C1/C2.
- **Con:** it is a host/fork change, not a guard-only change; needs fork work and a host capability
  flag (like `permissionAuthority: 2`); larger blast radius; harder to prototype in the plugin alone.

### M3 (rejected) — programmatic auto-decide of a wider set

"Just auto-approve more so less reaches the root" is the 2026-10-14 policy's domain, not a
concurrency mechanism, and it trades safety for throughput. Out of scope here.

## 5. Security invariants the implementation MUST preserve (review checklist)

1. **No self-approval.** The approver makes no requests; and the existing `request.sessionID !=
   root` / descendant-can't-approve checks still hold for everyone else.
2. **Approval-only surface.** The approver (M1) can call only `guard_pending` / `guard_decide`; every
   acting tool is denied to it, so it cannot be turned into a worker or escalate.
3. **Incarnation fencing.** A decision by an approver bound to a superseded root incarnation is
   refused (`sameIncarnation`), identical to the root's own calls. Teardown on `session.aborted` /
   `session.deleted` / replace reuses `lib/lifecycle.js` fences.
4. **Mode fencing.** If the root leaves god mode, pending decisions by the approver are refused and
   the approver is torn down; a request from an old god snapshot is never approved (authority.js:610).
5. **Human-only never delegated (C3).** The approver refuses `kind: "human-only"` exactly as the root
   does; those stay private-TUI only.
6. **Unattended → no approver.** Unattended sessions carry no escalation and get no approver.
7. **Root policy, not the approver's.** The approver judges nothing by its own mode; it only relays
   the root's `once` / `reject` for an already-escalated request. A child's mode file cannot loosen.
8. **No fail-open (C4).** Approver absent/failed ⇒ fall back to the root-wake path or stay pending;
   never auto-approve.
9. **Attribution.** Every delegated decision is logged with the root's authority and the delegate's
   identity, so the decision log stays a faithful audit (extends the 2026-10-14 §8 separation).
10. **One approval per request.** Double-decide is already safe (a second `decide` finds the request
    stale, authority.js:590); a pool (if ever) adds a per-request claim only to avoid *wasted* turns,
    never to make correctness depend on the lock.

## 6. Lifecycle (M1)

- **Spawn lazily:** create the approver on the root's *first* escalation while in god mode, not at
  god-entry — an idle god root costs nothing. Register `approverFor(root, incarnationID)`.
- **Route wakes to the approver** instead of (or in addition to) the root: `lib/notify.js` sends the
  "pending" wake to the approver subagent's session; the approver drains the queue. The root's own
  loop is no longer interrupted for approvals.
- **Teardown** on god-exit, root abort/delete/replace (incarnation change), or approver error; clear
  the binding. Reuse the incarnation-bound cleanup fences so a delayed event for an old incarnation
  cannot resurrect or misfire.

## 7. Cost

Event-driven: the approver only generates when there is a backlog, so an idle or low-fan-out god root
pays ~nothing. Approvals are bounded outputs (`once` / `reject` + a short reason), so the approver can
run on a **cheaper/faster tier** than the root — a decision worth measuring (a `-nothink` lane may
suffice). Net spend should fall versus today (the root no longer burns its *own*, often large-context,
turns on approvals — 5.3 h measured in 1.10.0).

## 8. Options summary & recommendation

| | M1 approver subagent | M2 fork lane |
|---|---|---|
| Honors C2 (no new session) | yes (subagent) | yes (same session) |
| Authority change (C1) | extend `approverFor` delegate | none (decider is the root) |
| Where it lives | guard-only + agent plumbing | fork + host capability |
| Prototype-able in the plugin | largely | no |
| Blast radius | medium (floor authority) | larger (host) |

**Recommendation:** evaluate **M1** first — it is implementable mostly in the guard and uses existing
primitives, and the authority extension is small and testable. Keep **M2** as the cleaner long-term
shape if M1's "approval-only subagent that never escalates" containment proves fragile, or if a
single approver is still a bottleneck (then a fork lane, or an M1 *pool*, is the throughput knob).

## 9. Decisions needed from Holden

1. **Is a guard-spawned, incarnation-bound, approval-only subagent acceptable as carrying the root's
   approval authority (M1)?** This is the core trust call. If no, go M2 (fork lane) or stop.
2. **Model/tier for the approver** — cheaper/faster lane vs. parity with the root.
3. **Single approver or a pool** — start single; pool only if one approver still lags.
4. **While an approver is active, may the root still approve too** (both paths), or does the approver
   own the queue exclusively? (Affects the wake routing in §6.)
5. **M1 vs M2** as the implementation path.

## 10. Testing plan (M1)

Unit (`node --test`, extend `tests/authority.test.mjs`, `tests/escalation-plugin.test.mjs`,
`tests/incarnation.test.mjs`, `tests/lifecycle.test.mjs`):

- An approver registered for root R + incarnation I can decide R's owned parent approvals; a
  different root's it cannot; a stale/other incarnation it cannot (refused).
- After root mode-change / abort / delete / replace, the approver's decide is refused and the binding
  is torn down.
- The approver cannot decide a `human-only` request; cannot self-approve; is denied every acting tool.
- Fallback: with no approver, the root-wake path still works (no regression); approver-down never
  auto-approves.
- Concurrency: root and approver racing the same request → exactly one decision, the loser gets
  "stale", no double effect.
- Cost: measure turns/latency vs. the serial baseline on the depot-shaped fixture.

## 11. Non-goals (explicit)

- No change to the 2026-10-14 escalation policy (what escalates / what auto-approves).
- No change to the human-only private-TUI path.
- No weakening of C1–C4. If any invariant in §5 cannot be met, the design is wrong, not the invariant.
