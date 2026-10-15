# Fleet Delegation: Broker HUD GOD Lease Implementation Plan (Plan 2, opencode-broker)

> **Rebased 2026-10-08** (series-wide mapping: guard batch -> 1.8.0, workflows batch -> 0.14.0, broker unchanged):
> - No pin or text change: `HUD_BUILD_ID` stays `opencode-broker@1.24.0` (`package.json` is still `1.24.0` at `1e17175`), and this plan names no guard or workflows version. opencode-broker had no commits from the 2026-10-07/08 agent-teams work.
> - Checked, unchanged: `main` moved `d9a5889` -> `1e17175` (`22f4218`, `1e17175`, 2026-10-06: routing, router plugin, broker CLI, tests -- not `hud/`), and `git diff --stat 31dcaa7 HEAD -- hud/` is still empty, so Task 2's `hud/tui.js` and `hud/tests/hud.test.mjs` line citations hold.
> - DECIDED 2026-10-08 (Holden): Task 3 CHANGELOG citations are anchor-based, not line-based. The facts table and Task 3 Step 1 now locate the insert by the unique line `  whenever the worker lanes were fenced.` under `## [Unreleased]` -> `### Added` (re-verified 2026-10-08 at `1e17175`: anchor L75, that `### Added` L65, `grep -c` = 1; `## [Unreleased]` opens `### Fixed`, `### Changed`, `### Removed`, `### Added`, then a second `### Fixed` and `### Added`) and cite no line numbers; the stale "L7-28", "L19-21" and "`### Added` then `### Fixed`" are gone.
> - DECIDED 2026-10-08 (Holden): this plan's Prerequisites win -- worktree `/home/dev/opencode-broker-plan2` on branch `feat/hud-delegation-lease` from `main`; the index's worktree command and table row now match. No text change here. A worktree from committed `main` does not carry the live checkout's uncommitted edits outside `hud/` (`bin/opencode-broker`, `lib/routing.js`, two tests, an older plan doc); that is intended.

> **2026-10-12 addendum:** This plan's batch now targets broker 1.25.0, following the published main release 1.24.0. The 2026-10-08 BASE SHA, measured base suites, and release-version statements are historical; preserve them as recorded. The target branch is 1.25.0; the historical main baseline remains 1.24.0.

> **For agentic workers:** execute each task step by step, in order. Steps use checkbox (`- [ ]`) or `### Step N` headings for tracking.

**Goal:** release opencode-broker 1.25.0 with the HUD's GOD permission mode backed by a Plan 1 delegation controller lease: a `god` mode file is written only after this HUD holds the root session's controller lease, the lease is renewed while held, and it is released before any write that leaves GOD.

**Architecture:** Task 1 adds `hud/delegation.js`, a pure controller (injected `api`, `clock`, `onChange`) that holds the HUD's controller lease per root session against the Plan 1 `TuiDelegationApi`: acquire, renew every 2000 ms, expire after 3 missed renewals or once `expiresAt` has passed, release on demand and on dispose. Task 2 wires it into `hud/tui.js` through one `setMode(id, next)` closure that both F9 (`cycle`) and the HUD menu (`modeMenu`) use: acquire before writing `god`, release before any non-GOD write, show the lease state on the prompt badge, and release on `session.deleted`, on the 1 s stale-mode sweep and on dispose. Task 3 records the change under `## [Unreleased]` in `CHANGELOG.md`.

**Repo:** `/home/dev/opencode-broker` (one plan, one repo). **Worktree:** `/home/dev/opencode-broker-plan2` -- every command in every task runs with this as the working directory unless a step says otherwise.

## Prerequisites (the operator runs these before starting plan-run)

**Plan 1 dependency:** Plan 1 (`/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md`) must have passed full review, so the `TuiDelegationApi` contract in "Plan 1 Authoritative Consumer Interfaces and Commands" and "Normative Contracts" is final. The tasks here build and test against fakes of that API and need no Plan 1 build installed; shipping is gated separately (see Rollout constraint).

Create the worktree and install dependencies. The broker commits no lockfile (`package-lock.json` and `node_modules/` are gitignored), so `npm install` is required in every fresh worktree; without `@opentui/solid` the HUD tests fail by name through `requireJsxRuntime()`.

```bash
cd /home/dev/opencode-broker
git worktree add -b feat/hud-delegation-lease /home/dev/opencode-broker-plan2 main
cd /home/dev/opencode-broker-plan2
npm install --no-fund --no-audit
git --no-pager status --short
```

Expected: the worktree is created on the new branch `feat/hud-delegation-lease` (base: `main`, `d9a5889` when this plan was written), `npm install` exits 0, and the final `status --short` prints nothing.

## How to run

```bash
cd /home/dev/opencode-broker-plan2 && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-broker-hud.md"} background:true'
```

## Rollout constraint

Task 2 must ship together with, or after, the guard change that requires a held controller lease (controller authority) for GOD, and the Plan 1 host -- never before it. Every opencode build before Plan 1 Task 21 ships has no `api.delegation`, so after Task 2 deploys, F9 stops offering GOD on those hosts and an existing `god` mode file shows `GOD unavailable` while an OLD guard may still honour that file as GOD; the badge would then understate what runs. This plan performs no deployment (see Global constraints).

## Global constraints

- Working directory: `/home/dev/opencode-broker-plan2` for every command.
- Tests use Node's runner: `node --experimental-test-module-mocks --test <files>` (Node 24; the expected-output summaries below are Node 24 spec-reporter lines). The full suite is `npm test` (`package.json` `scripts.test`).
- Release exactly `1.25.0`: update `package.json`, commit no lockfile (`package-lock.json` is gitignored), and insert a new `## [1.25.0]` changelog entry immediately above the published `## [1.24.0]` entry (Task 3).
- Before committing, the implementer loads the `fleet-release` skill. Each task makes exactly the one commit its last step names, with the message given there.
- To prove a test catches a change, revert with `git stash push <path>` / `git stash pop`; never `git restore` or `git checkout --`.
- No deployment actions: no symlinks, sync, restart, arm or canary.
- No emoji anywhere in code, comments or commit messages.

## Shared contract: the host API (Plan 1)

Plan 1 Task 21 gives every TUI plugin
`api.delegation: TuiDelegationApi | null` on the `api` argument of `tui: async (api) => ...`
(Plan 1, `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md`
Task 21 Interfaces). `null` means the host has no delegation path, and GOD is not offered at all.
Hosts that predate Plan 1 leave the key absent; the HUD treats `undefined` exactly like `null`.
A `local` build is NOT `null`: it gets a real `api.delegation` whose acquire fails in core, so
F9 still reaches the GOD step, the acquire comes back `acquire_failed`, the mode stays where it
was, and the HUD shows `GOD unavailable (acquire_failed)`.

## Shared contract: `hud/delegation.js`

**Fixed interface of `hud/delegation.js` (Task 1 creates it; Task 2 depends on these exact names -- do not rename):**

```js
export const HUD_BUILD_ID = "opencode-broker@1.25.0"
export const DELEGATION_PROTOCOL = "opencode.delegation/v1"
export const RENEW_INTERVAL_MS = 2000
export const MAX_MISSED_RENEWALS = 3
export function createDelegationController({ api, clock, onChange })
// returns { acquire(rootSessionID), release(rootSessionID), view(rootSessionID), dispose() }
// view = { state: "inactive"|"armed"|"observer"|"error",
//          reason?: "controller_conflict"|"release_failed"|"renew_expired"|"acquire_failed",
//          expiresAt?: number }
```

**Plan 1 contract consumed:** `acquireController({ rootSessionID, protocol, buildID })` and `renewController({ handle, leaseID, authorityEpoch })` both return `{ state: "acquired", handle, leaseID, authorityEpoch, expiresAt }` or `{ state: "observer", reason: "controller_conflict", rootSessionID, expiresAt }`; `releaseController({ handle, leaseID, authorityEpoch })` returns void. Any of the three may reject.

---

## Task 1: HUD delegation lease module

**Goal:** add `hud/delegation.js`, a pure controller that holds the HUD's delegation controller lease per root session against the Plan 1 `TuiDelegationApi`: acquire, renew every 2000 ms, expire after 3 missed renewals or once `expiresAt` has passed, release on demand and on dispose.

The fixed interface and the Plan 1 contract it consumes are in the header ("Shared contract: `hud/delegation.js`").

**Design decisions encoded in this task (the reviewer should check these, not just the tests):**

| Decision | Why |
|---|---|
| `handle`, `leaseID`, `authorityEpoch` live only in a private `leases` map; `view()` and `onChange` get a fresh `{ state, reason?, expiresAt? }` copy | Nothing that can act on the lease reaches rendering code; extra fields the API returns (`controllerID`, `token`) are never copied anywhere |
| A renew returning `observer` counts as a miss, not an immediate loss | Required by the spec; the third miss or a passed `expiresAt` still ends it within at most 3 x 2000 ms |
| Expiry (`renew_expired`) does NOT call `releaseController` | The lease is already lost or lapsing server-side; there is nothing valid to hand back |
| A renew still in flight on the next tick is not stacked, but the deadline is still checked | A hung renew request cannot keep the HUD armed past `expiresAt` |
| A renew result that lands after release/expiry/dispose is dropped | The identity check `leases.get(root) !== entry` stops a late success from re-arming a released root |
| `acquire()` on an armed root, or while an acquire is in flight, makes no second API call | Idempotency; concurrent callers share the one in-flight promise |
| An acquire that resolves after `dispose()` is released immediately | Otherwise a lease would be held with no renew loop and no owner |
| `release()` on a root with no lease (observer/error/a stale `inactive` reason) makes no API call and sets exactly `{ state: "inactive" }`, calling `onChange` only when that changed the view | Leaving observer mode is a local transition only; clearing a stale `release_failed`/`renew_expired`/`controller_conflict` is how Task 2 stops showing a failed transition once the next mode change happens |
| `acquire()` and `release()` never reject on an API failure; the failure comes back as the view's `reason` (`acquire_failed`, `release_failed`) | Task 2 reads the outcome from the returned view and has no `try`/`catch` around either call |
| `onChange` is called synchronously and is not wrapped | A throwing `onChange` is a consumer bug and must surface; Task 2 must pass a non-throwing callback. Risk: a throw inside the renew interval becomes an unhandled rejection |

**Files:**
- Create: `hud/tests/delegation.test.mjs`
- Create: `hud/delegation.js`

- [ ] **Step 0: Preflight (stop on any failure)**

Run, from `/home/dev/opencode-broker-plan2`:

```bash
pwd
git --no-pager status --short
git rev-parse --abbrev-ref HEAD
grep -n '"version"' package.json
node --version
ls node_modules/@opentui/solid/package.json
git --no-pager diff --stat 31dcaa7 HEAD -- hud/
ls hud/delegation.js hud/tests/delegation.test.mjs
grep -c 'whenever the worker lanes were fenced\.' CHANGELOG.md
node --experimental-test-module-mocks --test tests/*.test.mjs gateway/tests/*.test.mjs hud/tests/*.test.mjs
```

Expected:
- `pwd` prints `/home/dev/opencode-broker-plan2`; `status --short` prints nothing; the branch is `feat/hud-delegation-lease`.
- `"version": "1.24.0",`.
- `node --version` prints `v24.` followed by anything.
- `node_modules/@opentui/solid/package.json` exists (the header Prerequisites ran `npm install --no-fund --no-audit`).
- `git --no-pager diff --stat 31dcaa7 HEAD -- hud/` prints nothing: `hud/` is byte-identical to the commit whose line numbers Task 2 cites.
- Both `ls` targets report `No such file or directory` (Task 1 creates them).
- The changelog anchor count is `1` (Task 3 inserts after it).
- The full suite reports `fail 0`; record its pass count.

If any of these does not hold, stop and report STATUS: BLOCKED with the exact command and its output.

- [ ] **Step 1: Write the failing test file**

Create `hud/tests/delegation.test.mjs` with exactly this content:

```js
import { test } from "node:test"
import assert from "node:assert/strict"

import {
  HUD_BUILD_ID,
  DELEGATION_PROTOCOL,
  RENEW_INTERVAL_MS,
  MAX_MISSED_RENEWALS,
  createDelegationController,
} from "../delegation.js"

const START = 1_000
const ROOT = "ses_root_1"
const ROOT_2 = "ses_root_2"
const ROOT_3 = "ses_root_3"
const FORBIDDEN_VIEW_KEYS = ["handle", "leaseID", "authorityEpoch", "controllerID", "token"]
const ALLOWED_VIEW_KEYS = ["state", "reason", "expiresAt"]

// Manual clock: intervals are only fired by tick(), which advances time and
// awaits every interval callback so async renew work settles before asserting.
function createFakeClock() {
  let now = START
  let nextID = 1
  const intervals = new Map()
  return {
    intervals,
    now: () => now,
    setInterval(fn, ms) {
      const id = nextID
      nextID += 1
      intervals.set(id, { fn, ms })
      return id
    },
    clearInterval(id) {
      intervals.delete(id)
    },
    tick(ms = RENEW_INTERVAL_MS) {
      now += ms
      return Promise.all([...intervals.values()].map(({ fn }) => fn()))
    },
  }
}

// Each script entry is a value to resolve, an Error to reject with, or a
// function called with the args whose return value is used.
function scripted(calls, script, onEmpty) {
  return async (args) => {
    calls.push(args)
    if (script.length === 0) return onEmpty(args)
    const step = script.shift()
    if (step instanceof Error) throw step
    if (typeof step === "function") return step(args)
    return step
  }
}

function createFakeApi({ acquire = [], renew = [], release = [] } = {}) {
  const calls = { acquire: [], renew: [], release: [] }
  const unexpected = (name) => () => {
    throw new Error(`unexpected ${name} call`)
  }
  return {
    calls,
    acquireController: scripted(calls.acquire, acquire, unexpected("acquireController")),
    renewController: scripted(calls.renew, renew, unexpected("renewController")),
    releaseController: scripted(calls.release, release, () => undefined),
  }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function acquired(overrides = {}) {
  return {
    state: "acquired",
    handle: "handle-A",
    leaseID: "lease-A",
    authorityEpoch: 7,
    expiresAt: START + 60_000,
    controllerID: "ctl-A",
    token: "secret-token-A",
    ...overrides,
  }
}

function observer(overrides = {}) {
  return {
    state: "observer",
    reason: "controller_conflict",
    rootSessionID: ROOT,
    expiresAt: START + 30_000,
    ...overrides,
  }
}

const CREDS_A = { handle: "handle-A", leaseID: "lease-A", authorityEpoch: 7 }

function setup(script) {
  const clock = createFakeClock()
  const api = createFakeApi(script)
  const changes = []
  const controller = createDelegationController({
    api,
    clock,
    onChange: (root, view) => changes.push({ root, view }),
  })
  return { clock, api, changes, controller }
}

const states = (changes) => changes.map(({ view }) => view.state)

test("exports the fixed protocol constants", () => {
  assert.equal(HUD_BUILD_ID, "opencode-broker@1.25.0")
  assert.equal(DELEGATION_PROTOCOL, "opencode.delegation/v1")
  assert.equal(RENEW_INTERVAL_MS, 2000)
  assert.equal(MAX_MISSED_RENEWALS, 3)
})

test("an acquired lease becomes armed with exactly one 2000 ms renew interval", async () => {
  const { clock, api, changes, controller } = setup({ acquire: [acquired()] })

  const result = await controller.acquire(ROOT)

  const armed = { state: "armed", expiresAt: START + 60_000 }
  assert.deepEqual(result, armed)
  assert.deepEqual(controller.view(ROOT), armed)
  assert.deepEqual(api.calls.acquire, [
    { rootSessionID: ROOT, protocol: DELEGATION_PROTOCOL, buildID: HUD_BUILD_ID },
  ])
  assert.equal(clock.intervals.size, 1)
  assert.deepEqual([...clock.intervals.values()].map(({ ms }) => ms), [2000])
  assert.deepEqual(changes, [{ root: ROOT, view: armed }])
})

test("an observer result becomes observer/controller_conflict and never arms", async () => {
  const { clock, api, changes, controller } = setup({ acquire: [observer()] })

  const result = await controller.acquire(ROOT)

  const expected = { state: "observer", reason: "controller_conflict", expiresAt: START + 30_000 }
  assert.deepEqual(result, expected)
  assert.deepEqual(controller.view(ROOT), expected)
  assert.equal(clock.intervals.size, 0)
  await clock.tick()
  assert.equal(api.calls.renew.length, 0)
  assert.deepEqual(changes, [{ root: ROOT, view: expected }])
})

test("an acquire rejection gives error/acquire_failed and starts no interval", async () => {
  const { clock, changes, controller } = setup({ acquire: [new Error("gateway down")] })

  const result = await controller.acquire(ROOT)

  const expected = { state: "error", reason: "acquire_failed" }
  assert.deepEqual(result, expected)
  assert.deepEqual(controller.view(ROOT), expected)
  assert.equal(clock.intervals.size, 0)
  assert.deepEqual(changes, [{ root: ROOT, view: expected }])
})

test("a root in observer or error can acquire again", async () => {
  const { clock, api, controller } = setup({
    acquire: [observer(), new Error("blip"), acquired()],
  })

  await controller.acquire(ROOT)
  await controller.acquire(ROOT)
  const result = await controller.acquire(ROOT)

  assert.equal(api.calls.acquire.length, 3)
  assert.deepEqual(result, { state: "armed", expiresAt: START + 60_000 })
  assert.equal(clock.intervals.size, 1)
})

test("a renew success sends the current credentials and updates expiresAt", async () => {
  const { clock, api, changes, controller } = setup({
    acquire: [acquired()],
    renew: [
      acquired({ handle: "handle-B", leaseID: "lease-B", authorityEpoch: 8, expiresAt: START + 90_000 }),
      acquired({ handle: "handle-C", leaseID: "lease-C", authorityEpoch: 9, expiresAt: START + 95_000 }),
    ],
  })
  await controller.acquire(ROOT)

  await clock.tick()

  assert.deepEqual(api.calls.renew, [CREDS_A])
  assert.deepEqual(controller.view(ROOT), { state: "armed", expiresAt: START + 90_000 })
  assert.deepEqual(changes.at(-1), { root: ROOT, view: { state: "armed", expiresAt: START + 90_000 } })

  await clock.tick()

  assert.deepEqual(api.calls.renew[1], { handle: "handle-B", leaseID: "lease-B", authorityEpoch: 8 })
  assert.deepEqual(controller.view(ROOT), { state: "armed", expiresAt: START + 95_000 })
  assert.equal(clock.intervals.size, 1)
})

test("a renew success resets the missed-renewal count", async () => {
  const { clock, api, controller } = setup({
    acquire: [acquired()],
    renew: [
      new Error("timeout"),
      observer(),
      acquired({ expiresAt: START + 120_000 }),
      new Error("timeout"),
      new Error("timeout"),
    ],
  })
  await controller.acquire(ROOT)

  for (let i = 0; i < 5; i += 1) await clock.tick()

  assert.equal(api.calls.renew.length, 5)
  assert.deepEqual(controller.view(ROOT), { state: "armed", expiresAt: START + 120_000 })
  assert.equal(clock.intervals.size, 1)
})

test("the third consecutive missed renewal gives inactive/renew_expired", async () => {
  const { clock, api, changes, controller } = setup({
    acquire: [acquired()],
    renew: [new Error("timeout"), observer(), new Error("timeout")],
  })
  await controller.acquire(ROOT)

  await clock.tick()
  await clock.tick()
  assert.deepEqual(controller.view(ROOT), { state: "armed", expiresAt: START + 60_000 })
  assert.equal(clock.intervals.size, 1)

  await clock.tick()

  const expired = { state: "inactive", reason: "renew_expired" }
  assert.deepEqual(controller.view(ROOT), expired)
  assert.equal(clock.intervals.size, 0)
  assert.equal(api.calls.renew.length, 3)
  assert.equal(api.calls.release.length, 0)
  assert.deepEqual(changes.at(-1), { root: ROOT, view: expired })

  await clock.tick()
  assert.equal(api.calls.renew.length, 3)
})

test("a missed renewal after expiresAt has passed gives inactive/renew_expired", async () => {
  const { clock, api, controller } = setup({
    acquire: [acquired({ expiresAt: START + 3_000 })],
    renew: [new Error("timeout"), new Error("timeout")],
  })
  await controller.acquire(ROOT)

  await clock.tick()
  assert.equal(controller.view(ROOT).state, "armed")

  await clock.tick()

  assert.deepEqual(controller.view(ROOT), { state: "inactive", reason: "renew_expired" })
  assert.equal(api.calls.renew.length, 2)
  assert.equal(clock.intervals.size, 0)
})

test("a hung renew cannot keep the lease armed past expiresAt", async () => {
  const hung = deferred()
  const { clock, api, controller } = setup({
    acquire: [acquired({ expiresAt: START + 3_000 })],
    renew: [() => hung.promise],
  })
  await controller.acquire(ROOT)

  const firstTick = clock.tick()
  assert.equal(controller.view(ROOT).state, "armed")
  await clock.tick()

  assert.deepEqual(controller.view(ROOT), { state: "inactive", reason: "renew_expired" })
  assert.equal(api.calls.renew.length, 1)
  assert.equal(clock.intervals.size, 0)

  hung.resolve(acquired({ expiresAt: START + 60_000 }))
  await firstTick
  assert.deepEqual(controller.view(ROOT), { state: "inactive", reason: "renew_expired" })
})

test("release calls releaseController with the lease credentials and then sets inactive", async () => {
  let stateDuringRelease
  const h = setup({
    acquire: [acquired()],
    release: [
      () => {
        stateDuringRelease = h.controller.view(ROOT).state
      },
    ],
  })
  await h.controller.acquire(ROOT)

  const result = await h.controller.release(ROOT)

  assert.deepEqual(h.api.calls.release, [CREDS_A])
  assert.equal(stateDuringRelease, "armed")
  assert.deepEqual(result, { state: "inactive" })
  assert.deepEqual(h.controller.view(ROOT), { state: "inactive" })
  assert.equal(h.clock.intervals.size, 0)
  assert.deepEqual(states(h.changes), ["armed", "inactive"])

  await h.clock.tick()
  assert.equal(h.api.calls.renew.length, 0)
})

test("a release rejection still gives inactive with reason release_failed", async () => {
  const { clock, api, changes, controller } = setup({
    acquire: [acquired()],
    release: [new Error("network")],
  })
  await controller.acquire(ROOT)

  const result = await controller.release(ROOT)

  const expected = { state: "inactive", reason: "release_failed" }
  assert.deepEqual(result, expected)
  assert.deepEqual(controller.view(ROOT), expected)
  assert.equal(api.calls.release.length, 1)
  assert.equal(clock.intervals.size, 0)
  assert.deepEqual(changes.at(-1), { root: ROOT, view: expected })
})

test("release without a held lease makes no API call", async () => {
  const { api, changes, controller } = setup({ acquire: [observer()] })
  await controller.acquire(ROOT)

  await controller.release(ROOT)
  await controller.release(ROOT_2)

  assert.equal(api.calls.release.length, 0)
  assert.deepEqual(controller.view(ROOT), { state: "inactive" })
  assert.deepEqual(controller.view(ROOT_2), { state: "inactive" })
  assert.deepEqual(changes, [
    { root: ROOT, view: { state: "observer", reason: "controller_conflict", expiresAt: START + 30_000 } },
    { root: ROOT, view: { state: "inactive" } },
  ])
})

test("release without a held lease clears a stale reason, with no API call", async () => {
  const { api, changes, controller } = setup({
    acquire: [acquired()],
    release: [new Error("network")],
  })
  await controller.acquire(ROOT)
  await controller.release(ROOT)
  assert.deepEqual(controller.view(ROOT), { state: "inactive", reason: "release_failed" })

  const result = await controller.release(ROOT)
  await controller.release(ROOT)

  assert.deepEqual(result, { state: "inactive" })
  assert.deepEqual(controller.view(ROOT), { state: "inactive" })
  assert.equal(api.calls.release.length, 1)
  assert.deepEqual(changes, [
    { root: ROOT, view: { state: "armed", expiresAt: START + 60_000 } },
    { root: ROOT, view: { state: "inactive", reason: "release_failed" } },
    { root: ROOT, view: { state: "inactive" } },
  ])
})

test("a renew that lands after release does not re-arm the root", async () => {
  const late = deferred()
  const { clock, changes, controller } = setup({
    acquire: [acquired()],
    renew: [() => late.promise],
  })
  await controller.acquire(ROOT)

  const pendingTick = clock.tick()
  await controller.release(ROOT)
  late.resolve(acquired({ expiresAt: START + 90_000 }))
  await pendingTick

  assert.deepEqual(controller.view(ROOT), { state: "inactive" })
  assert.equal(clock.intervals.size, 0)
  assert.deepEqual(states(changes), ["armed", "inactive"])
})

test("acquire while armed is idempotent", async () => {
  const { clock, api, changes, controller } = setup({ acquire: [acquired()] })
  await controller.acquire(ROOT)

  const again = await controller.acquire(ROOT)

  assert.deepEqual(again, { state: "armed", expiresAt: START + 60_000 })
  assert.equal(api.calls.acquire.length, 1)
  assert.equal(clock.intervals.size, 1)
  assert.equal(changes.length, 1)
})

test("concurrent acquires share one in-flight request", async () => {
  const gate = deferred()
  const { clock, api, controller } = setup({ acquire: [() => gate.promise] })

  const first = controller.acquire(ROOT)
  const second = controller.acquire(ROOT)
  gate.resolve(acquired())
  const results = await Promise.all([first, second])

  assert.equal(api.calls.acquire.length, 1)
  assert.equal(clock.intervals.size, 1)
  assert.deepEqual(results, [
    { state: "armed", expiresAt: START + 60_000 },
    { state: "armed", expiresAt: START + 60_000 },
  ])
})

test("dispose releases every armed lease and clears every interval", async () => {
  const credsB = { handle: "handle-B", leaseID: "lease-B", authorityEpoch: 9 }
  const { clock, api, controller } = setup({
    acquire: [acquired(), acquired({ ...credsB, expiresAt: START + 70_000 }), observer({ rootSessionID: ROOT_3 })],
    release: [new Error("network"), undefined],
  })
  await controller.acquire(ROOT)
  await controller.acquire(ROOT_2)
  await controller.acquire(ROOT_3)
  assert.equal(clock.intervals.size, 2)

  await controller.dispose()

  assert.deepEqual(api.calls.release, [CREDS_A, credsB])
  assert.equal(clock.intervals.size, 0)
  assert.deepEqual(controller.view(ROOT), { state: "inactive", reason: "release_failed" })
  assert.deepEqual(controller.view(ROOT_2), { state: "inactive" })

  await clock.tick()
  assert.equal(api.calls.renew.length, 0)

  await controller.acquire(ROOT)
  assert.equal(api.calls.acquire.length, 3)
})

test("an acquire that resolves after dispose is released immediately", async () => {
  const gate = deferred()
  const { clock, api, controller } = setup({ acquire: [() => gate.promise] })

  const acquiring = controller.acquire(ROOT)
  const disposing = controller.dispose()
  gate.resolve(acquired())
  await disposing
  await acquiring

  assert.deepEqual(api.calls.release, [CREDS_A])
  assert.equal(clock.intervals.size, 0)
  assert.deepEqual(controller.view(ROOT), { state: "inactive" })
})

test("views never expose lease credentials or tokens", async () => {
  const { clock, changes, controller } = setup({
    acquire: [acquired(), observer({ rootSessionID: ROOT_2 }), new Error("down")],
    renew: [acquired({ leaseID: "lease-B", controllerID: "ctl-B", token: "secret-token-B" })],
    release: [new Error("network")],
  })
  const returned = []

  returned.push(await controller.acquire(ROOT))
  returned.push(await controller.acquire(ROOT_2))
  returned.push(await controller.acquire(ROOT_3))
  await clock.tick()
  returned.push(controller.view(ROOT))
  returned.push(await controller.release(ROOT))

  const seen = [
    ...returned,
    ...changes.map(({ view }) => view),
    controller.view(ROOT),
    controller.view(ROOT_2),
    controller.view(ROOT_3),
    controller.view("ses_unknown"),
  ]
  assert.ok(seen.length >= 12)
  for (const view of seen) {
    const keys = Object.keys(view)
    for (const key of FORBIDDEN_VIEW_KEYS) assert.ok(!keys.includes(key), `view leaked ${key}`)
    for (const key of keys) assert.ok(ALLOWED_VIEW_KEYS.includes(key), `unexpected view key ${key}`)
  }
})

test("view() returns a copy that callers cannot use to mutate state", async () => {
  const { controller } = setup({ acquire: [acquired()] })
  await controller.acquire(ROOT)

  const snapshot = controller.view(ROOT)
  snapshot.state = "inactive"
  snapshot.expiresAt = 0

  assert.deepEqual(controller.view(ROOT), { state: "armed", expiresAt: START + 60_000 })
})

test("onChange fires once per transition and not for a tolerated miss", async () => {
  const { clock, changes, controller } = setup({
    acquire: [acquired()],
    renew: [
      acquired({ expiresAt: START + 80_000 }),
      new Error("timeout"),
      new Error("timeout"),
      new Error("timeout"),
    ],
  })

  await controller.acquire(ROOT)
  await clock.tick()
  await clock.tick()
  await clock.tick()
  assert.equal(changes.length, 2)
  await clock.tick()

  assert.deepEqual(changes, [
    { root: ROOT, view: { state: "armed", expiresAt: START + 60_000 } },
    { root: ROOT, view: { state: "armed", expiresAt: START + 80_000 } },
    { root: ROOT, view: { state: "inactive", reason: "renew_expired" } },
  ])
})
```

- [ ] **Step 2: Run the tests to verify they fail (RED)**

Run:

```bash
node --experimental-test-module-mocks --test hud/tests/delegation.test.mjs
```

Expected: FAIL, non-zero exit. The file cannot load because `hud/delegation.js` does not exist -- the output contains `ERR_MODULE_NOT_FOUND` and `Cannot find module` naming `hud/delegation.js`, and the summary (Node 24 spec reporter) reports `ℹ tests 1`, `ℹ fail 1`. If it fails for any other reason (a syntax error in the test file, a wrong import path), fix that before continuing.

- [ ] **Step 3: Write the implementation**

Create `hud/delegation.js` with exactly this content:

```js
// HUD delegation lease controller.
//
// Holds the HUD's delegation controller lease for each root session against
// the Plan 1 TuiDelegationApi: acquire once, renew every RENEW_INTERVAL_MS,
// give the lease up after MAX_MISSED_RENEWALS consecutive misses or once its
// expiresAt has passed, and hand it back on release() or dispose().
//
// Credential boundary: handle, leaseID and authorityEpoch live only in the
// private `leases` map. view() and onChange only ever receive a fresh
// { state, reason?, expiresAt? } object, so nothing that can act on a lease
// (and none of the extra fields the API returns, such as controllerID or
// token) reaches rendering code.
//
// onChange is called synchronously and is deliberately not wrapped: it must
// not throw. A throw from inside the renew interval would surface as an
// unhandled rejection, which is the intended loud failure for a consumer bug.

export const HUD_BUILD_ID = "opencode-broker@1.25.0"
export const DELEGATION_PROTOCOL = "opencode.delegation/v1"
export const RENEW_INTERVAL_MS = 2000
export const MAX_MISSED_RENEWALS = 3

function makeView(state, reason, expiresAt) {
  const view = { state }
  if (reason !== undefined) view.reason = reason
  if (expiresAt !== undefined) view.expiresAt = expiresAt
  return view
}

function credentialsOf(source) {
  return { handle: source.handle, leaseID: source.leaseID, authorityEpoch: source.authorityEpoch }
}

function isAcquired(result) {
  return result !== null && typeof result === "object" && result.state === "acquired"
}

function isObserver(result) {
  return result !== null && typeof result === "object" && result.state === "observer"
}

export function createDelegationController({ api, clock, onChange }) {
  // rootSessionID -> { handle, leaseID, authorityEpoch, expiresAt, misses, renewing, intervalID }
  const leases = new Map()
  // rootSessionID -> Promise<view> for an acquire that has not settled yet
  const pending = new Map()
  // rootSessionID -> last public view; an absent root reads as inactive
  const views = new Map()
  let disposed = false

  function view(rootSessionID) {
    const current = views.get(rootSessionID)
    return current ? { ...current } : { state: "inactive" }
  }

  function setView(rootSessionID, next) {
    views.set(rootSessionID, next)
    onChange(rootSessionID, { ...next })
    return { ...next }
  }

  function dropLease(rootSessionID, entry) {
    clock.clearInterval(entry.intervalID)
    leases.delete(rootSessionID)
  }

  function expire(rootSessionID, entry) {
    // The lease is lost or lapsing server-side, so there is nothing valid to
    // release; just stop renewing and report it.
    dropLease(rootSessionID, entry)
    setView(rootSessionID, makeView("inactive", "renew_expired"))
  }

  async function releaseWith(rootSessionID, credentials) {
    try {
      await api.releaseController(credentials)
    } catch {
      // The lease is already dropped locally and will lapse server-side; the
      // failure is reported to the UI through the release_failed reason.
      return setView(rootSessionID, makeView("inactive", "release_failed"))
    }
    return setView(rootSessionID, makeView("inactive"))
  }

  async function renewOnce(rootSessionID) {
    const entry = leases.get(rootSessionID)
    if (!entry) return
    if (entry.renewing) {
      // The previous renew is still outstanding. Do not stack a second
      // request, but still enforce the deadline so a hung request cannot keep
      // the HUD armed past expiresAt.
      if (clock.now() > entry.expiresAt) expire(rootSessionID, entry)
      return
    }

    entry.renewing = true
    let result
    try {
      result = await api.renewController(credentialsOf(entry))
    } catch {
      // A rejected renew is a missed renewal by contract; it is counted below.
      result = undefined
    } finally {
      entry.renewing = false
    }

    // Released, expired or disposed while the request was in flight: a late
    // answer must not re-arm the root.
    if (leases.get(rootSessionID) !== entry) return

    if (isAcquired(result)) {
      Object.assign(entry, credentialsOf(result))
      entry.expiresAt = result.expiresAt
      entry.misses = 0
      setView(rootSessionID, makeView("armed", undefined, entry.expiresAt))
      return
    }

    // A rejection or an observer answer both count as a miss.
    entry.misses += 1
    if (entry.misses >= MAX_MISSED_RENEWALS || clock.now() > entry.expiresAt) {
      expire(rootSessionID, entry)
    }
  }

  async function acquireNow(rootSessionID) {
    let result
    try {
      result = await api.acquireController({
        rootSessionID,
        protocol: DELEGATION_PROTOCOL,
        buildID: HUD_BUILD_ID,
      })
    } catch {
      // Reported to the UI as error/acquire_failed; acquire() may be retried.
      if (disposed) return view(rootSessionID)
      return setView(rootSessionID, makeView("error", "acquire_failed"))
    }

    if (disposed) {
      // dispose() ran while this acquire was in flight: hand a granted lease
      // straight back instead of holding it with no renew loop.
      if (isAcquired(result)) return releaseWith(rootSessionID, credentialsOf(result))
      return view(rootSessionID)
    }

    if (isAcquired(result)) {
      const entry = {
        ...credentialsOf(result),
        expiresAt: result.expiresAt,
        misses: 0,
        renewing: false,
        intervalID: undefined,
      }
      leases.set(rootSessionID, entry)
      entry.intervalID = clock.setInterval(() => renewOnce(rootSessionID), RENEW_INTERVAL_MS)
      return setView(rootSessionID, makeView("armed", undefined, entry.expiresAt))
    }

    if (isObserver(result)) {
      return setView(rootSessionID, makeView("observer", "controller_conflict", result.expiresAt))
    }

    // Anything else violates the Plan 1 contract; surface it rather than guess.
    return setView(rootSessionID, makeView("error", "acquire_failed"))
  }

  function acquire(rootSessionID) {
    if (disposed || leases.has(rootSessionID)) return Promise.resolve(view(rootSessionID))
    const inFlight = pending.get(rootSessionID)
    if (inFlight) return inFlight
    const promise = acquireNow(rootSessionID).finally(() => pending.delete(rootSessionID))
    pending.set(rootSessionID, promise)
    return promise
  }

  async function release(rootSessionID) {
    const inFlight = pending.get(rootSessionID)
    if (inFlight) await inFlight
    const entry = leases.get(rootSessionID)
    if (!entry) {
      // No lease is held (observer, error, expired, a failed release, or
      // never acquired): a local transition only, with no API call. It also
      // clears a stale reason, so the result is exactly { state: "inactive" };
      // onChange fires only when that changed the view. An inactive view never
      // carries expiresAt, so checking the reason is enough.
      const current = views.get(rootSessionID)
      if (!current || (current.state === "inactive" && current.reason === undefined)) {
        return view(rootSessionID)
      }
      return setView(rootSessionID, makeView("inactive"))
    }
    dropLease(rootSessionID, entry)
    return releaseWith(rootSessionID, credentialsOf(entry))
  }

  async function dispose() {
    if (disposed) return
    disposed = true
    const held = [...leases.entries()]
    for (const [rootSessionID, entry] of held) dropLease(rootSessionID, entry)
    await Promise.all(held.map(([rootSessionID, entry]) => releaseWith(rootSessionID, credentialsOf(entry))))
    // Acquires still in flight release their own lease once they see
    // `disposed`; wait for them so dispose() resolves with nothing held.
    await Promise.all([...pending.values()])
  }

  return { acquire, release, view, dispose }
}
```

- [ ] **Step 4: Run the tests to verify they pass (GREEN)**

Run:

```bash
node --experimental-test-module-mocks --test hud/tests/delegation.test.mjs
```

Expected: PASS, exit 0, summary `ℹ tests 22`, `ℹ pass 22`, `ℹ fail 0`. (The original 21 tests were pre-verified by the plan author on Node v24.16.0 against a scratch copy: RED gave `ERR_MODULE_NOT_FOUND`, exit 1; GREEN gave 21/21, exit 0. The 22nd test, "release without a held lease clears a stale reason", and the matching `release()` change were added afterwards and re-run the same way on Node v24.16.0: 22/22, exit 0.) No test may take longer than a few milliseconds; a hang means an awaited promise never settled (check the fake clock's `tick()` and the deferreds).

- [ ] **Step 5: Commit**

```bash
git add hud/delegation.js hud/tests/delegation.test.mjs
git commit -m "feat(hud): add delegation controller lease module"
```

Expected: one commit containing exactly those two new files (`git --no-pager show --stat HEAD` lists only them).

---

## Task 2: F9 GOD integration

**Files:**
- Modify: `hud/tests/hud.test.mjs` (one import line, the `withTuiHarness` extension, new tests appended)
- Modify: `hud/tui.js` (one import, the controller block with its `session.deleted` subscription, `label`, `cycle`, `modeMenu`, `show`, the 1 s timer)

This task depends on Task 1, which creates `hud/delegation.js`.

### Facts verified for this task

Verified by reading the live checkout `/home/dev/opencode-broker` (commit `31dcaa7`):

| Fact | Where |
|---|---|
| Mode file path, `ORDER`, `LABEL`, `readMode`, `writeMode` (returns `false` on any write error) | `hud/tui.js` L272-319 |
| HUD entry `tui: async (api) =>`, `guard` from `detectGuard(...)` | `hud/tui.js` L350-355 |
| Disposers are registered with `api.lifecycle?.onDispose?.(fn)` | `hud/tui.js` L532-565, L1222, L1226 |
| `label(id)` builds the permission badge | `hud/tui.js` L566-570 |
| `textFor` puts `label(current)` first in the prompt badge, only when `guard` | `hud/tui.js` L1145-1158 |
| `refresh` is declared at L1175 (after `label`, before `cycle`) | `hud/tui.js` L1175 |
| Prompt badge slot `session_prompt_right: (props) => indicator("session", props?.session_id)` | `hud/tui.js` L1241 |
| `cycle` (F9) writes the mode file synchronously, toasts, refreshes | `hud/tui.js` L1280-1306 |
| `modeMenu` (HUD menu picker) ALSO writes `god` directly -- a second path into GOD | `hud/tui.js` L1567-1584 |
| `show`, guard commands, `f9 -> hud.mode.cycle` binding only when `guard` | `hud/tui.js` L1726-1794 |
| Events are subscribed with `const unsubscribeX = api.event.on("<type>", (event) => ...)`; `session.deleted` already has three subscribers | `hud/tui.js` L415, L528, L529 (grep) |
| The 1 s timer is `const timer = setInterval(() => { reconcileQuestionModes(); refresh(); }, 1000);` | `hud/tui.js` L1224 (grep) |
| `detectGuard`: env `OPENCODE_BROKER_HUD_GUARD=off` (or setting `false`) gives `present: false` | `hud/guard.js` L31-72 |
| `withTuiHarness`: fake `setInterval` that never fires, no-op `clearInterval`, `api` literal, `cleanup` awaits every disposer | `hud/tests/hud.test.mjs` L175-336 |
| Test HOME is a temp dir set before any import (mode files land in `$HOME/.local/share/opencode/modes`) | `hud/tests/hud.test.mjs` L15-16 |
| `OPENCODE_BROKER_HUD_GUARD = "on"` is the suite default; the guard-off test restores it | `hud/tests/hud.test.mjs` L25, L1065-1079 |
| The jsx runtime is mocked with `recordingJsx` (getters preserved); `requireJsxRuntime()` fails loudly if `@opentui/solid` is not installed | `hud/tests/hud.test.mjs` L84-109 |
| `waitFor`, `settle` helpers | `hud/tests/hud.test.mjs` L115-124 |
| No existing test cycles into `god` | grep of `hud/tests/hud.test.mjs` for `god`/`GOD` |
| `node_modules/` and `package-lock.json` are gitignored; `hud/` has no `package.json` | `.gitignore`, `ls hud` |
| CHANGELOG `## [Unreleased]` contains a `### Added` whose session-bound-gateway bullet ends with the line `  whenever the worker lanes were fenced.` (the anchor; unique in the file), followed by one blank line and the `**Per-tier local share.**` bullet. Locate by the anchor, never by line number (`## [Unreleased]` holds more than one `### Added`/`### Fixed`) | `grep -n 'whenever the worker lanes were fenced\.' CHANGELOG.md` (exactly one match) |
| `package.json` version is `1.24.0` | `package.json` L3 |
| `TuiDelegationApi` method shapes; acquire input `{ rootSessionID, protocol, buildID }`; acquired result `{ state: "acquired", handle, leaseID, authorityEpoch, expiresAt }`; observer `{ state: "observer", reason: "controller_conflict", rootSessionID, expiresAt }` | Plan 1 "Normative Contracts" (`TuiControllerAcquired`, `TuiControllerAcquireResult`, `TuiDelegationApi`); Plan 1 Task 21 Interfaces and Step 2 (adapter result tests) |

### Design decisions (reviewable)

- **One transition path.** A new closure `setMode(id, next)` inside the existing `tui` entry is
  the only writer of a session's mode file. `cycle` (F9, `hud.mode.cycle`) and `modeMenu` (the
  HUD menu picker) both call it. Without routing `modeMenu` through it, the menu would remain a
  way into GOD with no lease.
- **Into GOD:** acquire, then read `view(id)`; only `"armed"` proceeds to `writeMode(id, "god")`.
  Observer or failure: no write, toast, badge shows the reason. Write failure after an armed
  acquire: release, toast error.
- **Out of GOD:** every non-GOD `setMode` awaits `release(id)` first, then writes the non-GOD mode
  REGARDLESS of the release outcome. Leaving GOD only lowers what runs unasked, so a failed
  release must not keep the session in GOD. Task 1's `release()` never rejects: a failure is
  `view.reason === "release_failed"`, which toasts an error and shows `GOD inactive:release_failed`
  on the badge. On a root that holds no lease, the same call makes no host call and only clears a
  stale reason.
- **Reason suffix lifetime.** The badge shows `GOD <state>:<reason>` while the mode file is `god`,
  and otherwise only for the GOD transition that just failed (observer refusal, `acquire_failed`,
  `release_failed`). Because every non-GOD `setMode` calls `release(id)`, the next mode change
  clears it.
- **Lifecycle.** A root is released on `session.deleted`, and the existing 1 s timer releases any
  armed root whose `readMode(root) !== "god"` (the file was changed by `oc-mode`, another HUD, or
  by hand), so a lease is never held behind a non-GOD mode file.
- **The HUD never acquires on its own.** A `god` mode file found at startup, or one whose lease
  expired, is shown as `GOD inactive` and is never re-armed by a timer. F9 from `god` goes to
  `manual` (the existing ring order), releasing first. Re-arming is an explicit F9 back round the
  ring, or picking `god` in the HUD menu.
- **Expiry is display-only.** After `renew_expired` the mode file still says `god`; the HUD does
  not rewrite it from a timer. Whether a `god` file without authority grants anything is the
  guard's (server-side) decision, not the HUD's.
- **Unavailable.** When `guard` is false the controller is never constructed and nothing changes
  (no F9, no badge). When `guard` is true but `api.delegation` is null/absent, F9 and the menu
  skip `god`, the F9 toast says `god unavailable` at the step where GOD would have come next,
  and a stored `god` file shows `GOD unavailable`. A `local` build has a real `api.delegation`
  whose acquire fails in core: GOD stays in the ring, the attempt leaves the mode unchanged, and
  the badge and toast show `GOD unavailable (acquire_failed)`.
- **One change at a time.** A second F9 while an acquire or release is still in flight is
  dropped, so two acquires for one root cannot race.
- **Root.** The on-screen session ID is passed as the root (see Review focus item 2).
- **Dispose.** One `api.lifecycle.onDispose` disposer unsubscribes the `session.deleted` handler
  and `await`s `delegation.dispose()`, which releases every lease still held and clears its
  timers. There is no HUD-side release loop. The mode file is left as is.

### Review focus (for the Task 2 reviewer)

1. **Rollout order (highest risk).** See the header "Rollout constraint": Task 2 ships with or
   after the guard change that requires a held lease for GOD, never before it.
2. **Root identity.** The HUD passes the on-screen session ID as `rootSessionID`. If F9 is
   pressed while viewing a child session, the HUD acquires for the child's ID. Not verified
   whether core/guard expect only true roots there; resolving the parent would need an async
   `client.v2.session.get` lookup this plan does not add.
3. **Expiry is display-only.** After `renew_expired` the mode file still says `god`. Safety then
   rests on the guard refusing GOD without authority, not on the HUD.
4. **Async dispose.** The dispose hook awaits `delegation.dispose()`. Whether the host awaits async
   `onDispose` callbacks on quit is not verified; if it does not, the lease lapses through missed
   renewals instead of an explicit release.
5. **Task 1 contract.** Step 0 items 1-10 are the Task 1 contract this task relies on; Task 1's
   tests pin most of them and Step 0 checks the rest by hand. Task 2's tests also encode them
   (call ordering, miss counting, timer clearing, reasons).
6. **Coverage gaps, stated plainly.** `modeMenu` is routed through `setMode` but has no
   dedicated test (it needs the `DialogSelect` path). The HUD menu title (`hudMenu`, L1618) still
   shows the raw mode (`god`) without the lease status. A guard floor of `off` (`autoclass`) is
   not treated as "guard off"; only `detectGuard().present === false` hides GOD. The `local`
   build path (`acquire_failed` -> `GOD unavailable (acquire_failed)`, error toast) has no
   dedicated test. The `session.deleted` and sweep tests rest on unverified items A-C.
7. **Error surfacing.** Task 2 has no `try`/`catch` around Task 1 calls: Task 1 turns every API rejection
   into a view reason. `acquire_failed` and a `release_failed` from `setMode` are toasted; a
   `release_failed` from the sweep or `session.deleted` is only shown on the badge (until the
   next mode change); one from `dispose()` is shown nowhere, because the TUI is gone, and the
   lease lapses once its renewals stop. Residual: Task 1's `onChange` (here `refresh()`) is unwrapped,
   so a throwing `refresh` would reject the `void`ed sweep/deletion releases as unhandled.
8. `controllerID` and `token` appear only in negative assertions; no HUD code reads or stores
   either, and the fake host never returns them.

### Step 0: preflight (stop on any failure)

Task 2 is written against the Task 1 contract below (items 1-10). Task 1's own tests
(`hud/tests/delegation.test.mjs`) pin most of it; this step runs them and checks by hand only
what those tests do not cover. Each item ends with how it is checked.

1. `createDelegationController({ api, clock, onChange })` takes `api` = a `TuiDelegationApi`
   (it calls `api.acquireController`, `api.renewController`, `api.releaseController`).
   Check: Task 1's tests pass.
2. `clock` is used only through `clock.now()`, `clock.setInterval(fn, ms)` and
   `clock.clearInterval(handle)`; `hud/delegation.js` calls no bare `setTimeout`/`setInterval`.
   Check: by grep below. Task 1's tests inject a fake clock, so they would not notice a bare timer.
3. The renewal interval (`RENEW_INTERVAL_MS`) is created only when an acquire returns
   `state: "acquired"`, and is cleared on release (successful or failed), on expiry, and on
   `dispose()`. `dispose()` itself calls `releaseController` once for every lease still held and
   resolves only after those calls (and any in-flight acquire) have settled.
   Check: Task 1's tests pass, except that `dispose()` resolves only after its release calls and
   any in-flight acquire have settled, which they do not pin: read `dispose()` in
   `hud/delegation.js` (targeted window).
4. `acquire(root)` and `release(root)` return promises that do NOT reject on an API failure: a
   rejected `acquireController` resolves to `{ state: "error", reason: "acquire_failed" }` and a
   rejected `releaseController` to `{ state: "inactive", reason: "release_failed" }`, so Task 2 reads
   outcomes from the view and has no `try`/`catch` around either call. `view(root)` is
   synchronous and cheap (the HUD calls it on every 1-second refresh); `view(root)` for a root
   never acquired, or after a successful release, is `{ state: "inactive" }` with no `reason`;
   `release(root)` on a root that holds nothing does not call `releaseController`, does not
   throw, and sets exactly `{ state: "inactive" }`, clearing any stale reason (calling
   `onChange` only when that changed the view).
   Check: Task 1's tests pass.
5. A rejected `releaseController` leaves `view(root)` not `"armed"`, with
   `reason: "release_failed"`, and renewal stops.
   Check: Task 1's tests pass.
6. Renewal misses are COUNTED: a renewal that rejects or resolves non-`"acquired"` is a miss;
   the third consecutive miss leaves `view(root)` not `"armed"` with `reason: "renew_expired"`
   (state `"inactive"` or `"error"`; the HUD renders both the same).
   Check: Task 1's tests pass.
7. An observer result gives `view(root)` = `{ state: "observer", reason: "controller_conflict", expiresAt }`
   (`expiresAt` copied from the observer result).
   Check: Task 1's tests pass.
8. The acquire input is `{ rootSessionID: root, protocol: DELEGATION_PROTOCOL, buildID: HUD_BUILD_ID }`.
   Check: Task 1's tests pass.
9. The constructor does not call `onChange` synchronously.
   Check: Task 1's tests pass.
10. Task 1 did not modify `hud/tui.js` or `hud/tests/hud.test.mjs`.
   Check: by grep below (not a test).

Also NOT verified (only the two grep rows in "Facts verified for this task" were checked for the lifecycle work). This step
confirms each before any edit; on a mismatch the implementer adapts ONLY the named expression
and says so in the report:

- A. How the existing `session.deleted` handler at `hud/tui.js` L415 reads the deleted session's
  ID. Edit 4b assumes `event?.properties?.info?.id`; use whatever L415 uses.
- B. The signature of the harness's `emit` (`hud/tests/hud.test.mjs`). The new
  `session.deleted` test assumes `h.emit("session.deleted", { info: { id } })`; match the shape
  to `emit` and to A.
- C. That `h.runRefresh()` runs the L1224 1000 ms timer's callback (the sweep test relies on it).

Run, from `/home/dev/opencode-broker-plan2`:

```bash
git --no-pager status --short
git --no-pager log --oneline -3
ls hud/delegation.js
node --experimental-test-module-mocks --test hud/tests/delegation.test.mjs
grep -n "delegation" hud/tui.js hud/tests/hud.test.mjs
grep -n "export \|clock\.\|onChange\|api\.\(acquire\|renew\|release\)Controller\|setTimeout\|setInterval\|clearInterval\|renew_expired\|release_failed\|controller_conflict\|rootSessionID\|buildID\|protocol" hud/delegation.js
ls node_modules/@opentui/solid/package.json
sed -n '415,420p;1224p' hud/tui.js
grep -n "const emit\|const runRefresh" hud/tests/hud.test.mjs
```

Expected:
- `status --short` prints nothing; the log's top commit is Task 1's
  (`feat(hud): add delegation controller lease module`, possibly followed by Task 1 review-fix commits).
- `hud/tests/delegation.test.mjs` passes: `ℹ tests 22`, `ℹ pass 22`, `ℹ fail 0` (contract items 1, 3-9).
- `grep -n "delegation" hud/tui.js hud/tests/hud.test.mjs` prints nothing (contract item 10).
- The `hud/delegation.js` grep shows exports `createDelegationController`, `HUD_BUILD_ID`,
  `DELEGATION_PROTOCOL`, `RENEW_INTERVAL_MS`, and every `setInterval`/`clearInterval` it lists is
  a `clock.` call, with no `setTimeout` (contract item 2). Read `dispose()` in `hud/delegation.js`
  (targeted window) for the remainder of item 3.
- The `sed` and second `grep` (read the `emit`/`runRefresh` bodies they point at) settle
  unverified items A-C.
- `node_modules/@opentui/solid/package.json` exists. If it does not, the implementer runs
  `npm install --no-fund --no-audit` at the worktree root (the lockfile and `node_modules/` are
  gitignored, so `git --no-pager status --short` must still print nothing afterwards). Without it
  the badge tests below fail by name through `requireJsxRuntime()`.

If any contract item 1-10 does not hold, the implementer STOPS and reports BLOCKED with the
differing line(s) of `hud/delegation.js`. Do not adapt this plan's tests to a different contract
silently.

Baseline:

```bash
node --experimental-test-module-mocks --test hud/tests/hud.test.mjs
```

Expected: all tests pass (record the pass count `N`).

### Step 1: extend the test imports and `withTuiHarness`

Exact edits to `hud/tests/hud.test.mjs`:

Edit 1a (line 4):

```diff
-import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
+import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
```

Edit 1b (harness signature):

```diff
-const withTuiHarness = async ({ questionState, questionError, permissionState, sessionRows = [], initialMode = "manual" } = {}) => {
+const withTuiHarness = async ({ questionState, questionError, permissionState, sessionRows = [], initialMode = "manual", delegation = null } = {}) => {
```

Edit 1c (record cleared timers):

```diff
   const disposers = [];
   const intervals = [];
+  const cleared = [];
   const pushes = [];
```

Edit 1d (the fake clock: the entry is the handle, and clears are recorded):

```diff
-  global.setInterval = (fn, ms) => {
-    intervals.push({ fn, ms });
-    return { unref() {} };
-  };
-  global.clearInterval = () => {};
+  // The fake clock. Nothing here fires on its own: a test runs a timer by calling its `fn`.
+  // The entry IS the handle, so `cleared` records exactly which timer was stopped.
+  global.setInterval = (fn, ms) => {
+    const entry = { fn, ms, unref() {} };
+    intervals.push(entry);
+    return entry;
+  };
+  global.clearInterval = (handle) => { cleared.push(handle); };
```

Edit 1e (inject `api.delegation`):

```diff
   let currentMode = initialMode;
   const api = {
+    // Plan 1's TuiPluginApi.delegation: a TuiDelegationApi, or null on a host with no delegation path.
+    delegation,
     client: {
```

Edit 1f (prompt badge reader, directly after `sidebarBody`):

```diff
       const box = registration.slots.sidebar_content();
       return box.children[1];
     };
+    // The permission badge right of the session prompt, built by the same slot factory opencode
+    // calls. Like the sidebar body, its `content` getter re-reads the live closure.
+    const promptBadge = (id = "ses-1") => {
+      const registration = slotRegistrations.find((entry) => entry?.slots?.session_prompt_right);
+      assert.ok(registration, "the HUD registered no session_prompt_right slot");
+      return registration.slots.session_prompt_right({ session_id: id }).content;
+    };
     const cleanup = async () => {
```

Edit 1g (return the new members):

```diff
-    return { api, emit, key, runAgentPoll, runRefresh, runBudgetPoll, sidebarBody, pushes, releases,
-      consumes, switches, cycles, replies, toasts, navigations, switchedModels, cleanup,
+    return { api, emit, key, runAgentPoll, runRefresh, runBudgetPoll, sidebarBody, promptBadge, pushes, releases,
+      consumes, switches, cycles, replies, toasts, navigations, switchedModels, intervals, cleared, cleanup,
```

Run:

```bash
node --experimental-test-module-mocks --test hud/tests/hud.test.mjs
```

Expected: the same `N` tests pass. The default `delegation = null` and the handle change are
inert for every existing test (existing callers only read `entry.fn`/`entry.ms` and call `unref`).

### Step 2: append the failing tests

Append verbatim to the end of `hud/tests/hud.test.mjs`:

```js
// ---- F9 into and out of GOD: the delegation controller lease ---------------------------------
// GOD is only real while this HUD holds the root session's controller lease. These drive the REAL
// controller (hud/delegation.js) through the REAL HUD entry; only the host's TuiDelegationApi and
// the timers are fakes.
const loadDelegation = () => import(new URL("../delegation.js", import.meta.url).href);
const MODES_DIR = join(HOME, ".local/share/opencode/modes");
const modeFile = (id) => {
  try { return readFileSync(join(MODES_DIR, id), "utf8").trim(); } catch { return null; }
};
const setModeFile = (id, mode) => {
  mkdirSync(MODES_DIR, { recursive: true });
  writeFileSync(join(MODES_DIR, id), mode + "\n");
};
const ACQUIRED = { state: "acquired", handle: "hud-test-handle", leaseID: "hud-test-lease", authorityEpoch: 1 };
// Records every host call in order, with the session's mode file as it was AT the call, which is
// how the tests prove acquire-before-write and release-before-write without spying on fs.
const fakeDelegation = ({ sessionID = "ses-1", acquire, renew, release } = {}) => {
  const calls = [];
  const delegation = {
    acquireController: async (input) => {
      calls.push({ op: "acquire", input, modeAtCall: modeFile(sessionID) });
      return acquire ? acquire(input) : { ...ACQUIRED, expiresAt: Date.now() + 6000 };
    },
    renewController: async (input) => {
      calls.push({ op: "renew", input });
      return renew ? renew(input) : { ...ACQUIRED, expiresAt: Date.now() + 6000 };
    },
    releaseController: async (input) => {
      calls.push({ op: "release", input, modeAtCall: modeFile(sessionID) });
      if (release) await release(input);
    },
  };
  return { delegation, calls, ops: () => calls.map((call) => call.op) };
};
const runCycle = (h) => h.layer.commands.find((command) => command.name === "hud.mode.cycle").run();
const runShow = (h) => h.layer.commands.find((command) => command.name === "hud.mode.show").run();
// Renewal timers started after `mark` (the interval count before F9) and not yet cleared.
const renewTimers = (h, mark, ms) => h.intervals.slice(mark).filter((entry) => entry.ms === ms && !h.cleared.includes(entry));

test("F9 into GOD acquires the controller lease before the mode file says god", async () => {
  const { DELEGATION_PROTOCOL, HUD_BUILD_ID } = await loadDelegation();
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation();
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    await runCycle(h);
    assert.deepEqual(fake.ops(), ["acquire"]);
    const [acquire] = fake.calls;
    assert.equal(acquire.modeAtCall, "auto", "the mode file must not say god before the lease is held");
    assert.equal(acquire.input.rootSessionID, "ses-1");
    assert.equal(acquire.input.protocol, DELEGATION_PROTOCOL);
    assert.equal(acquire.input.buildID, HUD_BUILD_ID);
    assert.ok(!("controllerID" in acquire.input), "the HUD never names a controller");
    assert.ok(!("token" in acquire.input), "the HUD never handles a token");
    assert.equal(modeFile("ses-1"), "god");
    const badge = h.promptBadge("ses-1");
    assert.match(badge, /\bGOD\b/);
    assert.doesNotMatch(badge, /GOD (inactive|observer|unavailable)/);
  } finally {
    await h.cleanup();
  }
});

test("F9 into GOD as an observer leaves the mode where it was and shows the conflict", async () => {
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation({
    acquire: (input) => ({ state: "observer", reason: "controller_conflict", rootSessionID: input.rootSessionID, expiresAt: Date.now() + 6000 }),
  });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "auto");
    assert.deepEqual(fake.ops(), ["acquire"]);
    const warning = h.toasts.at(-1);
    assert.equal(warning.variant, "warning");
    assert.match(warning.message, /controller_conflict/);
    assert.match(warning.message, /Mode stays auto/);
    const badge = h.promptBadge("ses-1");
    assert.match(badge, /AUTO/);
    assert.match(badge, /GOD observer:controller_conflict/);
    await h.cleanup();
    assert.ok(!fake.ops().includes("release"), "an observer holds nothing, so dispose releases nothing");
  } finally {
    await h.cleanup();
  }
});

test("a mode-file write failure after the acquire releases the lease and GOD stays off", async () => {
  requireJsxRuntime();
  const id = "ses-mode-unwritable";
  const globalFlag = join(HOME, ".config/opencode/mode");
  const previousGlobal = existsSync(globalFlag) ? readFileSync(globalFlag, "utf8") : null;
  // A directory where the session's mode file goes: writeMode's writeFileSync fails with EISDIR,
  // and readMode falls back to the global default, set to auto so the cycle's next step is god.
  mkdirSync(join(MODES_DIR, id), { recursive: true });
  mkdirSync(dirname(globalFlag), { recursive: true });
  writeFileSync(globalFlag, "auto\n");
  const fake = fakeDelegation({ sessionID: id });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    h.api.route.current = { name: "session", params: { sessionID: id } };
    await runCycle(h);
    assert.deepEqual(fake.ops(), ["acquire", "release"]);
    assert.deepEqual(fake.calls[1].input, { handle: "hud-test-handle", leaseID: "hud-test-lease", authorityEpoch: 1 });
    const error = h.toasts.at(-1);
    assert.equal(error.variant, "error");
    assert.match(error.message, /Could not write the mode file; GOD was released/);
    const badge = h.promptBadge(id);
    assert.match(badge, /AUTO/);
    assert.doesNotMatch(badge, /GOD/);
  } finally {
    await h.cleanup();
    rmSync(join(MODES_DIR, id), { recursive: true, force: true });
    if (previousGlobal === null) rmSync(globalFlag, { force: true });
    else writeFileSync(globalFlag, previousGlobal);
  }
});

test("F9 out of GOD awaits the release before writing the non-GOD mode", async () => {
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  let finishRelease = () => {};
  const releaseGate = new Promise((resolve) => { finishRelease = resolve; });
  const fake = fakeDelegation({ release: () => releaseGate });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "god");
    const leaving = runCycle(h);
    await waitFor(() => fake.ops().includes("release"));
    await settle(20);
    assert.equal(modeFile("ses-1"), "god", "the non-GOD write waits for the release to finish");
    finishRelease();
    await leaving;
    assert.deepEqual(fake.ops(), ["acquire", "release"]);
    assert.equal(fake.calls[1].modeAtCall, "god");
    assert.deepEqual(fake.calls[1].input, { handle: "hud-test-handle", leaseID: "hud-test-lease", authorityEpoch: 1 });
    assert.equal(modeFile("ses-1"), "manual");
    assert.doesNotMatch(h.promptBadge("ses-1"), /GOD/);
  } finally {
    finishRelease();
    await h.cleanup();
  }
});

test("a failed release still leaves GOD, shows it inactive and surfaces the error", async () => {
  const { RENEW_INTERVAL_MS } = await loadDelegation();
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation({ release: async () => { throw new Error("core unreachable"); } });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    const mark = h.intervals.length;
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "god");
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "manual", "leaving GOD lowers the mode even when the release fails");
    const error = h.toasts.find((toast) => toast.variant === "error" && /release_failed/.test(toast.message ?? ""));
    assert.ok(error, "the failed release is surfaced as an error toast");
    const badge = h.promptBadge("ses-1");
    assert.match(badge, /manual/);
    assert.match(badge, /GOD inactive:release_failed/);
    const renewals = () => fake.ops().filter((op) => op === "renew").length;
    const before = renewals();
    for (const timer of renewTimers(h, mark, RENEW_INTERVAL_MS)) await timer.fn();
    await settle(20);
    assert.equal(renewals(), before, "a failed release still stops renewing");
    await h.cleanup();
    assert.equal(fake.ops().filter((op) => op === "release").length, 1, "dispose does not retry a lease it no longer holds");
  } finally {
    await h.cleanup();
  }
});

test("three missed renewals show GOD inactive and stop the renewal timer", async () => {
  const { RENEW_INTERVAL_MS } = await loadDelegation();
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  let renewFails = false;
  const fake = fakeDelegation({
    renew: async () => {
      if (renewFails) throw new Error("renewal lost");
      return { ...ACQUIRED, expiresAt: Date.now() + 6000 };
    },
  });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    const mark = h.intervals.length;
    await runCycle(h);
    const [renewTimer] = renewTimers(h, mark, RENEW_INTERVAL_MS);
    assert.ok(renewTimer, "arming GOD starts a renewal timer on the HUD's clock");
    const renewals = () => fake.ops().filter((op) => op === "renew").length;
    renewFails = true;
    for (let missed = 1; missed <= 2; missed += 1) {
      await renewTimer.fn();
      await waitFor(() => renewals() === missed);
      await settle(20);
    }
    assert.doesNotMatch(h.promptBadge("ses-1"), /GOD inactive/, "two missed renewals are tolerated");
    await renewTimer.fn();
    await waitFor(() => renewals() === 3);
    await waitFor(() => /GOD inactive/.test(h.promptBadge("ses-1")));
    assert.match(h.promptBadge("ses-1"), /GOD inactive:renew_expired/);
    assert.ok(h.cleared.includes(renewTimer), "an expired lease stops its renewal timer");
    assert.equal(modeFile("ses-1"), "god", "expiry is shown, not rewritten from a timer");
  } finally {
    await h.cleanup();
  }
});

test("a god mode file found at startup is never armed and shows inactive until F9", async () => {
  requireJsxRuntime();
  setModeFile("ses-1", "god");
  const fake = fakeDelegation();
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    await h.runRefresh();
    assert.match(h.promptBadge("ses-1"), /GOD inactive/);
    runShow(h);
    assert.match(h.toasts.at(-1).message, /GOD inactive/);
    assert.ok(!fake.ops().includes("acquire"), "nothing acquires without a key press");
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "manual");
    assert.doesNotMatch(h.promptBadge("ses-1"), /GOD/);
    assert.ok(!fake.ops().includes("acquire"), "F9 out of a stored god goes to manual; it does not arm");
  } finally {
    await h.cleanup();
  }
});

test("with api.delegation null, F9 skips GOD and a stored god shows unavailable", async () => {
  requireJsxRuntime();
  setModeFile("ses-1", "edits");
  const h = await withTuiHarness({ delegation: null });
  try {
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "auto");
    assert.match(h.toasts.at(-1).message, /god unavailable/);
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "manual", "auto -> manual: god is skipped");
    setModeFile("ses-1", "god");
    await h.runRefresh();
    assert.match(h.promptBadge("ses-1"), /GOD unavailable/);
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "manual");
  } finally {
    await h.cleanup();
  }
});

test("with opencode-guard off, GOD is not offered and the controller is never used", async () => {
  process.env.OPENCODE_BROKER_HUD_GUARD = "off";
  try {
    requireJsxRuntime();
    setModeFile("ses-1", "god");
    const fake = fakeDelegation();
    const h = await withTuiHarness({ delegation: fake.delegation });
    try {
      assert.ok(!h.layer.commands.some((command) => command.name === "hud.mode.cycle"));
      assert.ok(!h.layer.bindings.some((binding) => binding.key === "f9"));
      await h.runRefresh();
      assert.doesNotMatch(h.promptBadge("ses-1"), /GOD/);
      await h.cleanup();
      assert.deepEqual(fake.calls, []);
    } finally {
      await h.cleanup();
    }
  } finally {
    process.env.OPENCODE_BROKER_HUD_GUARD = "on";
  }
});

test("a second F9 while GOD is still being acquired is dropped, not queued", async () => {
  setModeFile("ses-1", "auto");
  let grant = () => {};
  const gate = new Promise((resolve) => { grant = resolve; });
  const fake = fakeDelegation({
    acquire: async () => { await gate; return { ...ACQUIRED, expiresAt: Date.now() + 6000 }; },
  });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    const first = runCycle(h);
    await waitFor(() => fake.ops().includes("acquire"));
    await runCycle(h);
    grant();
    await first;
    assert.deepEqual(fake.ops(), ["acquire"]);
    assert.equal(modeFile("ses-1"), "god");
  } finally {
    grant();
    await h.cleanup();
  }
});

test("plugin dispose releases an armed GOD lease and clears its timers", async () => {
  const { RENEW_INTERVAL_MS } = await loadDelegation();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation();
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    const mark = h.intervals.length;
    await runCycle(h);
    const timers = renewTimers(h, mark, RENEW_INTERVAL_MS);
    assert.equal(timers.length, 1);
    await h.cleanup();
    assert.deepEqual(fake.ops(), ["acquire", "release"]);
    assert.deepEqual(fake.calls[1].input, { handle: "hud-test-handle", leaseID: "hud-test-lease", authorityEpoch: 1 });
    assert.ok(h.cleared.includes(timers[0]), "dispose stops the renewal timer");
    assert.equal(modeFile("ses-1"), "god", "quitting releases the lease and leaves the mode for the next start to show inactive");
  } finally {
    await h.cleanup();
  }
});

test("an observer refusal is not shown after the next F9", async () => {
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation({
    acquire: (input) => ({ state: "observer", reason: "controller_conflict", rootSessionID: input.rootSessionID, expiresAt: Date.now() + 6000 }),
  });
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    await runCycle(h);
    assert.deepEqual(fake.ops(), ["acquire"]);
    assert.match(h.promptBadge("ses-1"), /GOD observer:controller_conflict/);
    // Stands in for oc-mode or another HUD moving the file, so the next F9 is a non-GOD step
    // (edits -> auto) rather than another attempt at GOD from auto.
    setModeFile("ses-1", "edits");
    await runCycle(h);
    assert.equal(modeFile("ses-1"), "auto");
    const badge = h.promptBadge("ses-1");
    assert.match(badge, /AUTO/);
    assert.doesNotMatch(badge, /GOD/, "the non-GOD change released, which clears the refusal");
    assert.deepEqual(fake.ops(), ["acquire"], "an observer holds nothing, so the release makes no host call");
  } finally {
    await h.cleanup();
  }
});

test("deleting a session releases its armed GOD lease", async () => {
  const { RENEW_INTERVAL_MS } = await loadDelegation();
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation();
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    const mark = h.intervals.length;
    await runCycle(h);
    const timers = renewTimers(h, mark, RENEW_INTERVAL_MS);
    assert.equal(timers.length, 1);
    // Event shape: Step 0 items A and B.
    h.emit("session.deleted", { info: { id: "ses-1" } });
    await waitFor(() => fake.ops().includes("release"));
    assert.deepEqual(fake.calls[1].input, { handle: "hud-test-handle", leaseID: "hud-test-lease", authorityEpoch: 1 });
    assert.ok(h.cleared.includes(timers[0]), "the deleted session's renewal timer stops");
    await h.cleanup();
    assert.deepEqual(fake.ops(), ["acquire", "release"], "dispose has nothing left to release");
  } finally {
    await h.cleanup();
  }
});

test("the 1 s timer releases an armed root whose mode file no longer says god", async () => {
  const { RENEW_INTERVAL_MS } = await loadDelegation();
  requireJsxRuntime();
  setModeFile("ses-1", "auto");
  const fake = fakeDelegation();
  const h = await withTuiHarness({ delegation: fake.delegation });
  try {
    const mark = h.intervals.length;
    await runCycle(h);
    const timers = renewTimers(h, mark, RENEW_INTERVAL_MS);
    assert.equal(timers.length, 1);
    await h.runRefresh();
    assert.deepEqual(fake.ops(), ["acquire"], "a root still in god keeps its lease");
    setModeFile("ses-1", "manual");
    await h.runRefresh();
    await waitFor(() => fake.ops().includes("release"));
    assert.equal(fake.calls[1].modeAtCall, "manual");
    assert.deepEqual(fake.calls[1].input, { handle: "hud-test-handle", leaseID: "hud-test-lease", authorityEpoch: 1 });
    assert.ok(h.cleared.includes(timers[0]), "the released root's renewal timer stops");
    await h.runRefresh();
    await settle(20);
    assert.deepEqual(fake.ops(), ["acquire", "release"], "the sweep releases once");
    assert.doesNotMatch(h.promptBadge("ses-1"), /GOD/);
  } finally {
    await h.cleanup();
  }
});
```

### Step 3: RED

```bash
node --experimental-test-module-mocks --test hud/tests/hud.test.mjs
```

Expected: the `N` existing tests pass; of the 14 new tests, 13 FAIL and 1 passes:

| New test | RED failure (against unmodified `hud/tui.js`) |
|---|---|
| F9 into GOD acquires ... before the mode file says god | `deepEqual` ops: `[]` vs `["acquire"]` |
| ... as an observer leaves the mode where it was ... | mode file is `god`, expected `auto` |
| a mode-file write failure after the acquire ... | ops `[]` vs `["acquire", "release"]` |
| F9 out of GOD awaits the release ... | `waitFor` times out (no release call) |
| a failed release still leaves GOD ... | no `release_failed` error toast |
| three missed renewals ... | `renewTimer` undefined |
| a god mode file found at startup ... | badge shows `GOD`, not `GOD inactive` |
| with api.delegation null ... | no `god unavailable` in the toast |
| a second F9 while GOD is still being acquired ... | `waitFor` times out (no acquire call) |
| plugin dispose releases an armed GOD lease ... | `timers.length` 0, expected 1 |
| an observer refusal is not shown after the next F9 | `deepEqual` ops: `[]` vs `["acquire"]` |
| deleting a session releases its armed GOD lease | `timers.length` 0, expected 1 |
| the 1 s timer releases an armed root ... | `timers.length` 0, expected 1 |
| with opencode-guard off ... | PASSES at RED: it pins existing behaviour so the new controller block cannot regress it |

If any test fails for a different reason (import error, `requireJsxRuntime` message, harness
assertion), fix that before Step 4.

### Step 4: implement in `hud/tui.js`

Edits are anchored on exact existing text, not line numbers.

Edit 4a (import, after the guard import):

```diff
 import { detectGuard } from "./guard.js";
+import { createDelegationController } from "./delegation.js";
```

Edit 4b (construct the controller inside the existing `tui` entry, right after `guard`):

```diff
     const guard = detectGuard({ setting: CONFIG.hud.permissionModes }).present;
+    // GOD is only real while this HUD holds the root session's controller lease
+    // (hud/delegation.js). `api.delegation` is null on a host with no delegation path, and
+    // absent on hosts that predate it; both mean GOD is unavailable. Without the guard there is
+    // no GOD to offer, so no controller either.
+    const GOD_UNAVAILABLE = "god unavailable: this opencode host offers no delegation controller";
+    const delegation = guard && api.delegation
+      ? createDelegationController({
+        api: api.delegation,
+        // Arrow wrappers, not the bare globals: they resolve the timer functions at call time,
+        // the same way this file's own setInterval calls do.
+        clock: {
+          now: () => Date.now(),
+          setInterval: (fn, ms) => setInterval(fn, ms),
+          clearInterval: (handle) => clearInterval(handle),
+        },
+        // Fires only from acquire/renew/release, and those start only after this entry has
+        // returned, so `refresh` (declared further down) is initialised by then.
+        onChange: () => refresh(),
+      })
+      : null;
+    // Roots this HUD armed, so the 1 s sweep below knows which leases to check.
+    const godRoots = new Set();
+    // Run from the existing 1 s timer: a root this HUD armed whose mode file no longer says god
+    // (oc-mode, another HUD, a hand edit) gives its lease back, so no lease outlives the mode
+    // that asked for it. Skipped while setMode is mid-transition, which owns the release then.
+    // delegation.release() never rejects; a failure shows as release_failed on the badge.
+    // `modeChange` is declared further down (Edit 4d); like `refresh` above, it is only read
+    // from the timer, which first fires after this entry has returned.
+    const releaseStaleGod = () => {
+      if (!delegation || modeChange) return;
+      for (const root of godRoots) {
+        if (delegation.view(root)?.state !== "armed") { godRoots.delete(root); continue; }
+        if (readMode(root) === "god") continue;
+        godRoots.delete(root);
+        void delegation.release(root);
+      }
+    };
+    // A deleted session cannot use its lease. (ID extraction: Step 0 item A.)
+    const unsubscribeGodCleanup = delegation
+      ? api.event.on("session.deleted", (event) => {
+        const root = event?.properties?.info?.id;
+        if (!root) return;
+        godRoots.delete(root);
+        void delegation.release(root);
+      })
+      : null;
+    if (delegation) {
+      // delegation.dispose() releases every lease still held and stops every renewal timer; awaiting
+      // it lets a host that awaits onDispose see the leases handed back before it exits.
+      api.lifecycle?.onDispose?.(async () => {
+        unsubscribeGodCleanup?.();
+        godRoots.clear();
+        await delegation.dispose();
+      });
+    }
```

Edit 4c (`label`: show what GOD actually is, not just what the mode file says):

```diff
-    const label = (id) => {
-      const m = readMode(id);
-      // The two modes that stop asking are the two worth shouting about.
-      return m === "auto" || m === "god" ? m.toUpperCase() : m;
-    };
+    // What GOD actually is for a session right now, as opposed to what its mode file says:
+    // only a held controller lease makes it real.
+    const godStatus = (id) => {
+      if (!delegation) return "GOD unavailable";
+      const view = delegation.view(id);
+      if (view?.state === "armed") return "GOD";
+      // A `local` build has a real api.delegation whose acquire fails in core; that reads as
+      // unavailable, not as a lease state.
+      if (view?.reason === "acquire_failed") return "GOD unavailable (acquire_failed)";
+      const reason = view?.reason ? ":" + view.reason : "";
+      return (view?.state === "observer" ? "GOD observer" : "GOD inactive") + reason;
+    };
+    const label = (id) => {
+      const m = readMode(id);
+      // readMode never resolves a session-less id to god (fallback maps a global god to auto).
+      if (m === "god") return godStatus(id);
+      // The two modes that stop asking are the two worth shouting about.
+      const base = m === "auto" ? "AUTO" : m;
+      // Outside god a reason can only come from the GOD transition (or the sweep's release)
+      // that just failed: every non-GOD setMode calls release(id), which clears it, so it
+      // shows until the next mode change and no longer.
+      const view = delegation && id ? delegation.view(id) : null;
+      return view?.reason ? `${base} \u00b7 ${godStatus(id)}` : base;
+    };
```

Edit 4d (`cycle`: route every transition through one `setMode`; the comment block at the top of
`cycle` is kept):

```diff
-    const cycle = () => {
+    // Every permission-mode change goes through here -- F9 (cycle) and the HUD menu's mode
+    // picker alike -- so a session cannot enter GOD without first holding its controller lease,
+    // nor leave it without first giving the lease back. One change at a time: a second press
+    // while an acquire or release is in flight is dropped, because a second acquire for the
+    // same root would race the first.
+    let modeChange = null;
+    const errorText = (error) => String(error?.message ?? error);
+    const setMode = (id, next) => {
+      if (modeChange) return Promise.resolve(false);
+      modeChange = (async () => {
+        const current = readMode(id);
+        if (id && next === "god") {
+          if (!delegation) {
+            api.ui?.toast?.({ variant: "error", title: "opencode mode", message: GOD_UNAVAILABLE });
+            return false;
+          }
+          if (current === "god" && delegation.view(id)?.state === "armed") { refresh(); return true; }
+          // Acquire BEFORE the write: a mode file that says god with no lease behind it is the
+          // exact state the controller exists to rule out. delegation.acquire() never rejects; a
+          // refusal or failure comes back as the view's state and reason.
+          await delegation.acquire(id);
+          const view = delegation.view(id);
+          if (view?.state !== "armed") {
+            refresh();
+            const failed = view?.reason === "acquire_failed";
+            api.ui?.toast?.({
+              variant: failed ? "error" : "warning",
+              title: "opencode mode",
+              message: (view?.state === "observer"
+                ? `GOD not armed: another controller holds this session (${view.reason}).`
+                : `GOD not armed: ${godStatus(id)}.`)
+                + ` Mode stays ${current}.`,
+            });
+            return false;
+          }
+          godRoots.add(id);
+          if (!writeMode(id, "god")) {
+            // A held lease that no mode file uses is authority nobody asked for: hand it back.
+            await delegation.release(id);
+            godRoots.delete(id);
+            refresh();
+            api.ui?.toast?.({
+              variant: "error",
+              title: "opencode mode",
+              message: delegation.view(id)?.reason === "release_failed"
+                ? "Could not write the mode file, and releasing GOD failed (release_failed); renewal has stopped, so the lease lapses on its own."
+                : "Could not write the mode file; GOD was released.",
+            });
+            return false;
+          }
+          refresh();
+          return true;
+        }
+        if (id && delegation) {
+          // Every non-GOD change releases BEFORE its write. On an armed root that hands the lease
+          // back; on any other root the controller makes no host call and only clears a stale reason, so a
+          // failed GOD transition is shown until the next mode change and no longer. Write
+          // whatever the outcome: leaving GOD only lowers what runs unasked, so a failed release
+          // must not keep the session in GOD. delegation.release() never rejects; a failure is the
+          // view's release_failed reason.
+          await delegation.release(id);
+          godRoots.delete(id);
+          if (delegation.view(id)?.reason === "release_failed") {
+            api.ui?.toast?.({
+              variant: "error",
+              title: "opencode mode",
+              message: "GOD release failed (release_failed); renewal has stopped, so the lease lapses on its own.",
+            });
+          }
+        }
+        if (!(id ? writeMode(id, next) : writeGlobal(next))) {
+          refresh();
+          api.ui?.toast?.({ variant: "error", message: "Could not write the mode file." });
+          return false;
+        }
+        refresh();
+        return true;
+      })()
+        .catch((error) => {
+          api.ui?.toast?.({ variant: "error", title: "opencode mode", message: errorText(error) });
+          return false;
+        })
+        .finally(() => { modeChange = null; });
+      return modeChange;
+    };
+
+    const cycle = async () => {
       // In a session this sets that session's mode. On the home screen there is no
       // session to set, so it sets the default a new session starts in -- the same
       // file `oc-mode` writes. God is per-session and attended only, so the home
       // screen (which writes the GLOBAL default, inherited by headless runs) cycles
       // without it.
+      // God also needs a controller lease, so a session on a host with no delegation path
+      // cycles without it too, and says so at the step where it would have come next.
       const id = sessionID();
-      const order = id ? ORDER : ORDER.filter((m) => m !== "god");
+      const order = id && delegation ? ORDER : ORDER.filter((m) => m !== "god");
       const next = order[(order.indexOf(readMode(id)) + 1) % order.length];
-      if (!(id ? writeMode(id, next) : writeGlobal(next))) {
-        api.ui?.toast?.({ variant: "error", message: "Could not write the mode file." });
-        return;
-      }
-      refresh();
+      if (!(await setMode(id, next))) return;
       // On the home screen, say where god went at the point it is conspicuously
       // missing -- the step where a session's cycle would have offered it next.
       // "Still don't see god mode" was a real report: the scoping is invisible
       // unless the toast explains it.
-      const suffix = id ? ""
+      const suffix = id
+        ? (!delegation && next === "auto" ? `  (${GOD_UNAVAILABLE})` : "")
         : next === "auto" ? "  (default for new sessions -- god is per-session: press F9 inside one)"
         : "  (default for new sessions)";
```

(The trailing `api.ui?.toast?.({ variant: ..., title: "opencode mode", message: LABEL[next] + suffix });`
and the closing `};` of `cycle` stay as they are.)

Note on `order.indexOf`: a stored `god` with `delegation === null` gives index `-1`, so the next
step is `order[0]` = `manual`, which is the intended exit from an unbacked GOD.

Edit 4e (`modeMenu`: same rule and same path):

```diff
     const modeMenu = () => {
       const id = sessionID();
-      const order = id ? ORDER : ORDER.filter((m) => m !== "god");
+      // Same rule as cycle: GOD only where a controller lease can back it.
+      const order = id && delegation ? ORDER : ORDER.filter((m) => m !== "god");
```

```diff
           onSelect: (option) => {
             try { api.ui.dialog.clear(); } catch {}
-            if (!(id ? writeMode(id, option.value) : writeGlobal(option.value))) {
-              api.ui?.toast?.({ variant: "error", message: "Could not write the mode file." });
-              return;
-            }
-            refresh();
+            // setMode owns the GOD lease handshake, the write, its error toast and the refresh.
+            void setMode(id, option.value);
           },
```

Edit 4f (`show`: do not call an unbacked god "everything runs"):

```diff
     const show = () => {
-      api.ui?.toast?.({ title: "opencode mode", message: LABEL[readMode(sessionID())] });
+      const id = sessionID();
+      const m = readMode(id);
+      api.ui?.toast?.({ title: "opencode mode", message: LABEL[m] + (m === "god" ? `  [${godStatus(id)}]` : "") });
     };
```

Edit 4g (the existing 1 s timer also runs the stale-lease sweep from Edit 4b):

```diff
-    const timer = setInterval(() => { reconcileQuestionModes(); refresh(); }, 1000);
+    const timer = setInterval(() => { reconcileQuestionModes(); releaseStaleGod(); refresh(); }, 1000);
```

No other function changes. `run: cycle` in `guardCommands` and the `f9` binding are untouched:
F9 reaches the new path through the existing `hud.mode.cycle` command.

### Step 5: GREEN

```bash
node --experimental-test-module-mocks --test hud/tests/hud.test.mjs
```

Expected: `N + 14` tests, all pass, 0 fail. If a new test fails, the implementer uses
`systematic-debugging` before changing anything; a failure that traces to a contract item in
Step 0 is reported BLOCKED rather than worked around in the test.

Prove the tests catch the change (revert with stash, never `git restore`):

```bash
git stash push hud/tui.js
node --experimental-test-module-mocks --test hud/tests/hud.test.mjs
git stash pop
```

Expected while stashed: the same 13 failures as Step 3. After `stash pop`: Step 5 passes again.

### Step 6: commit

```bash
git add hud/tui.js hud/tests/hud.test.mjs
git --no-pager diff --cached --stat
git commit -m "feat(hud): back GOD mode with a delegation controller lease" -m "F9 and the HUD menu now acquire the root session's controller lease before writing a god mode file and release it before any write that leaves GOD. An observer, a failed acquire or a failed write leaves the mode non-GOD; a failed release still lowers the mode and is shown as an error. A god mode file found at startup is shown inactive and never armed without a key press, three missed renewals show GOD inactive, and a lease is released when its session is deleted, when its mode file stops saying god, and on dispose. On a host whose api.delegation is null, GOD is not offered; on a local build, whose acquire fails in core, it shows unavailable."
```

Expected: `--stat` lists exactly `hud/tests/hud.test.mjs` and `hud/tui.js`.

---

## Task 3: Broker changelog

**Files:** Modify `CHANGELOG.md` and `package.json` (`"version"` only). No lockfile is committed
(`package-lock.json` is gitignored).

### Step 1: add the entry

Create a new `## [1.25.0] — <release date>` entry immediately above the published
`## [1.24.0]` entry. Preserve every published changelog entry unchanged. Place the following
bullet in that new entry's `### Added` section; `<release date>` is the output of `date +%F` on
the release-commit day:

```diff
- **GOD mode is backed by a delegation controller lease.** On a host that gives TUI plugins a
+  delegation path (`api.delegation`), F9 into GOD now acquires the session's controller lease
+  before the mode file says `god`, renews it while held, and releases it before any write that
+  leaves GOD; the HUD menu's mode picker takes the same path. A lease held by another controller
+  leaves the mode unchanged and shows `GOD observer:controller_conflict`; a failed release still
+  lowers the mode and, like three missed renewals, shows `GOD inactive:<reason>`. A `god` mode
+  file found at startup shows `GOD inactive` and is never re-armed without a key press. The
+  lease is released when its session is deleted, when its mode file stops saying `god`, and
+  on quit. On a host whose `api.delegation` is null, or that predates it, F9 skips GOD ("god
+  unavailable") and a stored `god` shows `GOD unavailable`; on a `local` build, whose acquire
+  fails in core, the attempt shows `GOD unavailable (acquire_failed)`. Without opencode-guard
+  nothing changes: GOD is still not offered.
```

### Step 2: verify and commit

```bash
date +%F
npm version 1.25.0 --no-git-tag-version
grep -n '"version"' package.json
git --no-pager diff --stat
git add CHANGELOG.md package.json
git commit -m "release: opencode-broker 1.25.0"
```

Expected: `"version": "1.25.0"`; the diff stat lists only `CHANGELOG.md` and `package.json`.

### Step 3: full suite

Run, from `/home/dev/opencode-broker-plan2`, after the Step 2 commit:

```bash
node --experimental-test-module-mocks --test tests/*.test.mjs gateway/tests/*.test.mjs hud/tests/*.test.mjs
```

Expected: 0 failures. This is also `npm test` (`package.json` `scripts.test`).
