# Concurrent approver Implementation Plan

**Goal:** Take god-root approval work off the root's single serial loop so a heavy subagent fan-out
stops pegging it. Service escalated parent approvals on a dedicated, incarnation-bound,
**approval-only** subagent delegate of the root (M1), concurrent with the root's main loop.

**Architecture (M1, decided):** On the first escalation while a root is in god mode, the guard spawns
one approval-only subagent of that root and registers it as `approverFor(root, incarnationID)`.
`authority.decide` / `authority.pending` accept a call from that registered delegate as the root's
authority (every ownership / no-self-approve / incarnation / mode / admission check unchanged, decider
= the delegate). The pending wake routes to the approver instead of the root. The approver loops
`guard_pending` -> batch `guard_decide` -> idle. Everything is behind a flag, OFF by default, inert
until Task 5 enables it; with the flag off or no approver registered, behaviour is byte-identical to
today (the root-wake path).

**Tech stack:** guard plugin — ESM JavaScript, `node:test` (`node --test`). No native/fork change
(that would be M2; rejected for the guard, see spec §4).

**Spec:** [concurrent approver design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-21-concurrent-approver-design.md).
Executors read it first; §5 is the invariant checklist, §3 the hard constraints.

## Global constraints

- **Feature flag `approverEnabled`, OFF by default** (site config, like `loopGuard.enabled`). Every
  phase lands inert; nothing changes live behaviour until Task 5 flips it after the e2e proof.
- **C1–C4 (spec §3) are invariants, not goals.** If a step cannot meet one, the step is wrong.
  Chiefly: a session never starts another session (C2) — the approver is a `task` subagent of the
  root, never a launched OpenCode process; and never fail-open (C4) — no approver ⇒ root-wake
  fallback or stay pending, never auto-approve.
- **Serialization / collision:** `lib/authority.js` and `lib/notify.js` are the parallel
  "waiting-for-permission" workstream's hot files. Task 0 confirms no concurrent edit and re-verifies
  every cited line anchor before touching them. Prefer adding new exported helpers over rewriting
  existing functions, to keep the diff reviewable and rebase-safe.
- **Guard tests:** workdir `/home/dev/opencode-guard`, `node --test tests/<file>.test.mjs`; full
  suite `node --test tests/*.test.mjs` (~125 s). Keep it green at every commit.
- **No deploy until Task 5.** The live plugin is `~/opencode-guard/plugin.js` (loaded per pane on
  restart); because every phase is flag-gated/inert, a pane that reloads mid-build is unaffected.
- No emoji. Comments explain non-obvious logic. Never swallow an error. Fail closed on any doubt.

## Review focus (the invariant stress-cases — each becomes a pinned test)

1. **Delegate scope creep.** A registered approver tries to decide a request owned by a DIFFERENT
   root, or after its root's incarnation changed / god-exited / aborted. Expected: refused, exactly
   as a stale root call is (spec §5.3, §5.4).
2. **Self-approval via the approver.** The approver is asked to decide a request whose requester is
   the approver itself, or the root. Expected: refused (no-self-approve holds for the delegate too).
3. **Human-only never delegated.** A `kind: "human-only"` request reaches the approver. Expected:
   refused — private TUI only (C3).
4. **Fail-open probe.** Flag on but approver spawn failed / torn down mid-flight. Expected: the
   request falls back to the root wake or stays pending; it is NEVER auto-approved (C4).
5. **Approver surface.** The approver attempts any acting tool (bash/edit/read/task). Expected:
   denied — it holds only `guard_pending` / `guard_decide` and raises no escalation of its own.
6. **Flag off = no change.** With `approverEnabled` false, decide/pending/notify behave exactly as
   before (regression guard; existing `authority.test.mjs` / `loop-guard.test.mjs` stay green).

---

### Task 0: Serialization gate + anchor re-verification (no code)

**Files:** none.

- [ ] Confirm the parallel "waiting-for-permission" workstream is not mid-edit in `lib/authority.js`
      or `lib/notify.js` (git log/status, or ask). Rebase onto their latest committed `main` first.
- [ ] Re-verify the anchors this plan cites: `authority.js` `verifyAttendedRoot` (~109),
      `decide` (~568), `pending` (~532), the stale-bind refusal (~293); `notify.js` `send` /
      wake text (~105-110), `onEvent` idle/abort/deleted fences (~124-164); `lifecycle.js`
      `track`/`admit`/`abort`/`deleted`/incarnation binding.

### Task 1: Feature flag + approver registry (inert)

**Files:** `plugin.js` (config read), a new `lib/approver.js` (registry), `tests/approver.test.mjs`.

- [ ] Add `approverEnabled` to the site-config read (default false), surfaced like `loopGuard.enabled`.
- [ ] `lib/approver.js`: an in-memory registry `approverFor` keyed by root sessionID ->
      `{ approverSessionID, incarnationID }`, with `register`, `clear`, `lookupByApprover(sessionID)`
      (reverse: which root, if any, this session is the registered approver of) and
      `isApprover(sessionID)`. Pure, no I/O. Capacity-bounded; `clear` on teardown.
- [ ] Tests: register/lookup/clear round-trips; reverse lookup; capacity bound; unknown session.

### Task 2: Authority delegate path (inert — nothing registers yet)

**Files:** `lib/authority.js`, `tests/authority.test.mjs` (extend), `tests/incarnation.test.mjs`.

- [ ] Thread the registry into `createAuthorityBroker` (new optional `approver` dependency).
- [ ] Add a delegate branch to `decide` and `pending`: when the caller `sessionID` is a registered
      approver (`approver.lookupByApprover`), resolve its root via `rootFor(sessionID)` (its
      ancestry's top), require the registry's `{root, incarnationID}` to match the resolved root and
      the current binding's incarnation, then proceed with `root` = that root and decider =
      the approver. **Do not** relax `verifyAttendedRoot` for non-delegates — a non-registered
      non-root caller is refused exactly as today (the ~293 stale-bind refusal stands).
- [ ] Route admission to the ROOT: the delegate's decide is the root's activity, so
      `healAdmission`/`assertAdmission` track and fence on the ROOT token/incarnation, not the
      approver's. Keep every existing check (ownership `approval.sessionID == root` &
      `rootFor(request.sessionID) == root`; `request.sessionID != root`; `sameIncarnation`;
      `mode == god`; human-only refusal) unchanged.
- [ ] Guard the whole delegate branch behind `approverEnabled`; with the flag off it is unreachable.
- [ ] Tests (Review focus 1-3, 6): delegate decides its root's owned request; refused for another
      root, stale incarnation, post-god-exit, post-abort; cannot decide human-only; cannot
      self-approve; flag-off path identical to today.

### Task 3: Approval-only seat (inert)

**Files:** the guard's tool-closure / tree-rules path (`lib/tree.js` / `lib/policy.js` as the
anchors show), `plugin.js` tool exposure, `tests/tree-rules.test.mjs` (extend) or a new test.

- [ ] Define the approver seat: it is offered ONLY `guard_pending` / `guard_decide`; every acting
      tool (bash, edit, read, task, webfetch, bg_run, pty_spawn, ...) is denied to it, reusing the
      existing per-seat closure mechanism (G1/G4 family). It therefore raises no escalation of its
      own (no recursion into its own queue).
- [ ] Tests (Review focus 5): the approver seat is denied each acting tool; is allowed exactly the
      two guard tools; a non-approver session is unaffected.

### ⚠ BLOCKER found 2026-10-21 (Task 4 spawn) — settle before Tasks 2–4

Investigation of the guard's SDK surface found **no verified, plugin-callable API to CREATE a
seat-restricted approval-only subagent**. The guard can `v2.permission.list/reply`, `v2.v2.session.get`,
`v2.experimental.session.background` (**promotes an EXISTING root**, does not create a restricted new
session — authority.js:503), `sdk.session.promptAsync` (**prompts an existing session**), and list
`children`. None of these creates the dedicated approver M1 assumed ("spawned via the allowed task
path" was unverified when written). Two real paths remain; **this is a decision point, not something
to fabricate into the floor:**

- **Option A — guard-spawned approver.** Needs a confirmed plugin-callable create-subagent API (with
  a custom restricted seat). If it does not exist, it is a host/fork capability add — i.e. M1 drifts
  toward M2's host-change cost. Verify the API before building.
- **Option B — root-spawned, guard-recognized approver.** The root spawns the approver with its own
  `task` tool (allowed; the model acts, not the guard — C2 holds), the approver registers itself via
  a new guard tool, and the guard enforces its approval-only seat and grants it the delegate
  authority. Uses only verified primitives (`promptAsync` to drive it), but is a larger protocol than
  the spec assumed (root cooperation, a self-register tool, seat enforcement on a model-spawned child).

Until this is settled, **Task 2 (authority delegate) is deferred**: refactoring `decide`/`pending`
for an approver that cannot yet be spawned is risk (hot floor file, parallel-session collision) with
no live benefit. Task 1 (registry) stands as the safe foundation. The peg itself is already relieved
live by the shipped batching guidance (`1bbbed6`), so there is no pressure to rush this.

### Task 4: Spawn, lifecycle, and wake routing (inert behind the flag) — pending the blocker above

**Files:** `lib/notify.js`, `lib/lifecycle.js` (teardown hook), a spawn helper (likely
`lib/approver.js` + `lib/agent-spawn.js` awareness), `tests/loop-guard.test.mjs` /
`tests/lifecycle.test.mjs` (extend).

- [ ] Spawn lazily: on the first escalation for a god root with no registered approver (and the flag
      on), create the approval-only subagent via the allowed `task` path and `register` it for
      `{root, incarnationID}`. Never a launched session (C2).
- [ ] Wake routing: `notify.send` targets the approver's session when one is registered for the root;
      when none is (flag off, spawn pending/failed, torn down), it targets the root exactly as today
      (C4 fallback). Keep the "only a failed send is queued for next idle" behaviour.
- [ ] Teardown: on `session.idle`-to-god-exit, `session.aborted`, `session.deleted`, or incarnation
      change for the root, `clear` the registry and stop the approver, reusing the incarnation-bound
      fences in `notify.onEvent` / `lifecycle` so a delayed event for an old incarnation cannot
      misfire or resurrect.
- [ ] Tests (Review focus 4): spawn-once per root+incarnation; wake goes to the approver when
      registered, to the root when not; teardown on each terminal event clears the registry;
      approver-down never auto-approves (falls back / stays pending).

### Task 5: Enable, prove, measure, flip default

**Files:** site config; a depot-shaped fixture test; CHANGELOG.

- [ ] End-to-end on a fixture modelled on the 2026-10-21 depot burst (N children, M escalations):
      with the flag on, the root's own turns are not consumed by approvals and children drain
      concurrently; with it off, unchanged.
- [ ] Measure approver cost on a `-nothink` lane vs. the serial baseline (turns, latency, spend).
- [ ] CHANGELOG entry; only then consider flipping `approverEnabled` default to true (separate,
      explicit decision — attended, with a live TUI proof, per the repo's release discipline).

## Rollback

Set `approverEnabled` false (or leave it so) — every phase is inert without it, so rollback is the
default state. No deploy/restart lands the feature until Task 5 and a separate authorization.
