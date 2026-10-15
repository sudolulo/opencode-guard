# Fleet Delegation Protocol Consumer Integration: Plan 2 Index

> **Rebased 2026-10-08** against guard 1.7.1 (`3a2f566`), agent-workflows 0.13.2 (`d6655f6`), broker 1.24.0 (`1e17175`) and devbox `9c552eb`:
> - Guard batch 1.7.0 -> 1.8.0 and workflows batch 0.13.0 -> 0.14.0 in the per-repo table and the Build IDs line: guard 1.7.0/1.7.1 (agent-team tree rules G1-G4, ancestry mode resolution) and workflows 0.13.0-0.13.2 (native agent teams) shipped on 2026-10-07/08. Broker stays `opencode-broker@1.24.0`; opencode-broker had no commits from that work.
> - The guard and workflows plans were rebased separately the same day by other sessions to the same mapping; the rollout (Plan 3), devbox, broker HUD and core (Plan 1) plans each carry their own rebase note.
> - Plan 3 discrepancies paragraph: Plan 3's first 2026-10-08 edit covered only its version pins and RECONCILE notes; corrections 1-4 were applied later the same day (see the DECIDED line below).
> - Checked, unchanged: the rollback/ancestry baselines `7368c42`, `9b1c4c2`, `309a574`, `c5da280` are still ancestors of guard, workflows, broker and devbox HEAD; no `plan2` branch or `-plan2` worktree exists yet; `/tmp/opencode/plan2-workflows-residual-risks.md` still exists.
> - DECIDED 2026-10-08 (Holden): the broker HUD plan's own Prerequisites win -- `/home/dev/opencode-broker-plan2` on branch `feat/hud-delegation-lease` from `main`. The per-repo table row and the broker worktree command below now use that branch and base (plus the plan's `npm install`); guard and workflows keep branch `plan2` from `HEAD`.
> - DECIDED 2026-10-08 (Holden): Plan 3 discrepancies 1-4 are applied to Plan 3 (`2026-09-30-delegation-rollout-and-task7-recovery.md`) as listed under "Plan 3 corrections required" (correction 2 as `npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock --no-fund --no-audit`); item 5 is informational and verified. Both sections below are kept as the record of what changed.
> - DECIDED 2026-10-08 (Holden): Plan 1 base is `2b7eb922f` (`e36bbfbb` + the 2026-10-02 shell.ts always-allow-prefix fix the deployed binary is built from); the `coreCommit` row below now names it.
> - Not in the batch: opencode-peers (new, now 0.1.3), opencode-scheduled-prompts (0.1.4) and opencode-background-shells (0.3.4) also changed on 2026-10-07/08; none is a delegation consumer, so none is declared. Devbox `c813c9d` adds one more live plugin link (`config/opencode/plugin/opencode-peers.js`); Plan 3's link activation rewrites only the guard and workflows links, so it is untouched.
> - 2026-10-12: batch renumbered to guard 1.9.0, workflows 0.15.0, broker 1.25.0 because each earlier number was published independently; each consumer branch merged its product's main (merge, not rebase), so the 'HEAD descends from' prerequisites still hold.

> **This file is an index, not an executable plan.** Do not pass it to `plan-run`. Each per-repo plan listed below is executed on its own with `plan-run`, from its own repository or worktree.

## Purpose

Plan 2 is the fleet consumers of Plan 1's `opencode.delegation/v1` protocol: opencode-guard, opencode-agent-workflows and the opencode-broker HUD adopt the Plan 1 consumer interfaces, and devbox declares the resulting compatibility set and gates the whole batch. Plan 1 (core, authoritative for every contract): `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md`, sections "Normative Contracts" and "Plan 1 Authoritative Consumer Interfaces and Commands". Plan 3 (rollout, consumes Plan 2's output): `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-delegation-rollout-and-task7-recovery.md`. Plan 2 performs no deployment of any kind and pushes nothing.

## Per-repo plans

| File | Repo | Worktree | Version / build ID | Capabilities | Depends on |
|---|---|---|---|---|---|
| `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-guard.md` | `/home/dev/opencode-guard` | `/home/dev/opencode-guard-plan2` (branch `plan2`) | 1.9.0 / `opencode-guard@1.9.0` | `toolAuthorizeV1`, `terminalHandoffV1` | Plan 1 contracts only (tests run against fakes); no other plan |
| `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-workflows.md` | `/home/dev/opencode-agent-workflows` | `/home/dev/opencode-agent-workflows-plan2` (branch `plan2`) | 0.15.0 / `opencode-agent-workflows@0.15.0` | `backgroundDeliveryV1`, `foregroundDeliveryV1`, `registeredBranchV1`, `terminalHandoffV1` | Plan 1 contracts only (tests run against fakes); no other plan |
| `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-broker-hud.md` | `/home/dev/opencode-broker` | `/home/dev/opencode-broker-plan2` (branch `feat/hud-delegation-lease`, from `main`) | 1.25.0 (Unreleased) / `opencode-broker@1.25.0` | HUD: `controllerLeaseV1` (component `broker_hud`) | Plan 1 contracts only (tests run against fakes); no other plan |
| `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-devbox.md` | `/home/dev/devbox` | none (commits on `main`) | n/a: declaration plus gate | n/a (declares the three rows above) | Task 1: nothing. Task 2 (gate): the three plans above complete in their worktrees, Plan 1 complete in `/home/dev/projects/opencode-delegation` |

## Run order and parallelism

- The guard, workflows and broker HUD plans test against fakes, so they can run in parallel with each other and with Plan 1.
- Devbox Task 1 (compatibility declaration) can run at any time.
- Devbox Task 2 (full verification gate) runs last: after the guard, workflows and broker HUD plans are complete and after Plan 1 is complete and its Task 26 Step 6 review has passed.
- Rollout constraint: the broker HUD change must not deploy before the guard change. Plan 2 deploys nothing; this constraint binds Plan 3.

## Worktrees and run commands

Holden creates the three consumer worktrees before starting their plans. Each command records the base it branched from; if the branch (`plan2` for guard and workflows, `feat/hud-delegation-lease` for broker) or the target directory already exists, stop and do not reuse or delete it.

```bash
BASE=$(git -C /home/dev/opencode-guard rev-parse HEAD) && echo "BASE=$BASE" && git -C /home/dev/opencode-guard worktree add -b plan2 /home/dev/opencode-guard-plan2 "$BASE"
BASE=$(git -C /home/dev/opencode-agent-workflows rev-parse HEAD) && echo "BASE=$BASE" && git -C /home/dev/opencode-agent-workflows worktree add -b plan2 /home/dev/opencode-agent-workflows-plan2 "$BASE"
BASE=$(git -C /home/dev/opencode-broker rev-parse main) && echo "BASE=$BASE" && git -C /home/dev/opencode-broker worktree add -b feat/hud-delegation-lease /home/dev/opencode-broker-plan2 "$BASE" && cd /home/dev/opencode-broker-plan2 && npm install --no-fund --no-audit && git --no-pager status --short
```

The broker line is the broker HUD plan's own Prerequisites (branch `feat/hud-delegation-lease` from `main`, then `npm install` because the broker commits no lockfile); the final `status --short` must print nothing. Holden runs it once -- not in addition to that plan's Prerequisites block.

Holden then starts each plan with its one-liner. The guard, workflows and broker HUD runs may be started together; the devbox run lands Task 1 and then stops BLOCKED at Task 2 unless every gate prerequisite already holds (its header states the exact prerequisites and the 24-hour `resume:true` limit).

```bash
cd /home/dev/opencode-guard-plan2 && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-guard.md"} background:true'
cd /home/dev/opencode-agent-workflows-plan2 && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-workflows.md"} background:true'
cd /home/dev/opencode-broker-plan2 && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-broker-hud.md"} background:true'
cd /home/dev/devbox && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-devbox.md"} background:true'
```

## Residual risks

Residual risks: see /tmp/opencode/plan2-workflows-residual-risks.md

## Handoff to Plan 3

**Declaration:** `/home/dev/devbox/config/opencode/delegation-consumers.json` (the same file as `/home/dev/fleet-core/config/opencode/delegation-consumers.json` through the alias), schema `opencode.delegation-consumers/v1`, validated by `/home/dev/devbox/config/opencode/lib/delegation-consumers.js`.

**Validate the materialized release manifest (Plan 3 Task 5, after `RELEASE_MANIFEST` is set):**

```bash
node --input-type=module -e 'import { readFileSync } from "node:fs"; import { validateMaterialized } from "/home/dev/devbox/config/opencode/lib/delegation-consumers.js"; const read = (path) => JSON.parse(readFileSync(path, "utf8")); console.log(JSON.stringify(validateMaterialized(read("/home/dev/devbox/config/opencode/delegation-consumers.json"), read(process.argv[1]))))' "$RELEASE_MANIFEST"
```

It exits non-zero with `DelegationConsumersError` listing every problem, or prints `{"buildID","coreCommit","guardCommit","workflowsCommit","brokerCommit","devboxCommit"}` for the evidence record.

**Check the registered participants (Plan 3 Task 7, against `participants --json`):** `validateParticipants(declaration, participants)` is the check Plan 3 Task 7 runs against the output of `opencode debug delegation maintenance participants --database PATH --json` (`{ participants: ParticipantStatus[] }`). `PARTICIPANTS_JSON` below is the file Plan 3 saves that output to:

```bash
node --input-type=module -e 'import { readFileSync } from "node:fs"; import { validateParticipants } from "/home/dev/devbox/config/opencode/lib/delegation-consumers.js"; const read = (path) => JSON.parse(readFileSync(path, "utf8")); const problems = validateParticipants(read("/home/dev/devbox/config/opencode/delegation-consumers.json"), read(process.argv[1]).participants); if (problems.length > 0) { console.error(problems.join("\n")); process.exit(1); } console.log("participants match the declaration")' "$PARTICIPANTS_JSON"
```

It exits 1 and prints one problem per line, or exits 0. It checks `guard`, `workflows` and `broker_hud` only; the `core` row's `buildID` must still be compared with `buildID` from the validated release manifest and with `MaintenanceIdentity.buildID`.

**Build IDs:** protocol `opencode.delegation/v1`; `componentBuildIDs` = `{ guard: "opencode-guard@1.9.0", workflows: "opencode-agent-workflows@0.15.0", broker: "opencode-broker@1.25.0", coreUpstream: "1.18.22" }`; runtime `coreCustom` = `buildID` = `0.0.0-fork/delegation-v1-<git rev-parse --short=12 of the reviewed core HEAD>`.

**Capabilities (keyed by Plan 1 `Component`):**

| Component | Capabilities |
|---|---|
| `guard` | `toolAuthorizeV1`, `terminalHandoffV1` |
| `workflows` | `registeredBranchV1`, `terminalHandoffV1`, `foregroundDeliveryV1`, `backgroundDeliveryV1` |
| `broker_hud` | `controllerLeaseV1` |

**HUD:** `sourceHUD` `/home/dev/opencode-broker/hud/tui.js`; `standaloneHUD` `false`.

**Target paths (created by Plan 3, never by Plan 2):**

| Key | Path |
|---|---|
| `componentsRoot` | `/home/dev/.local/lib/opencode-fork/components` |
| `guard` | `/home/dev/.local/lib/opencode-fork/components/opencode-guard` |
| `guardPlugin` | `/home/dev/.local/lib/opencode-fork/components/opencode-guard/plugin.js` |
| `workflows` | `/home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows` |
| `workflowsPlugin` | `/home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js` |
| `broker` | `/home/dev/.local/lib/opencode-fork/components/opencode-broker` |
| `brokerHUD` | `/home/dev/.local/lib/opencode-fork/components/opencode-broker/hud/tui.js` |
| `tuiPlugins` | `file:///home/dev/.local/lib/opencode-fork/components/opencode-broker`, `file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui` |
| `pluginLinks` | `/home/dev/devbox/config/opencode/plugin/opencode-guard.js -> ../../../../.local/lib/opencode-fork/components/opencode-guard/plugin.js`; `/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js -> ../../../../.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js` |

**Commits to record (all full 40-hex IDs, printed by the devbox plan's Task 2 Steps 1 and 10):**

| Field | Source | Notes |
|---|---|---|
| `coreCommit` | `git -C /home/dev/projects/opencode-delegation rev-parse HEAD` | Must equal the Plan 1 Task 26 Step 6 reviewed HEAD; base `2b7eb922fdc59f6560a490e266651c0e01444046` (`e36bbfbb` + the 2026-10-02 shell.ts always-allow-prefix fix the deployed binary is built from), which must be an ancestor of that HEAD |
| `guardCommit` | `git -C /home/dev/opencode-guard-plan2 rev-parse HEAD` | Rollback baseline `7368c42265c5fcb85f8329545845ec597e37f7b0` is its ancestor |
| `workflowsCommit` | `git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD` | Baseline `9b1c4c2498fcfc016baf5521119c907d4daac64e` |
| `brokerCommit` | `git -C /home/dev/opencode-broker-plan2 rev-parse HEAD` | Baseline `309a5748758ef436cf53cfc5369dfef3df51be39` |
| `DEVBOX_PLAN2_COMMIT` | `git -C /home/dev/devbox log -1 --format=%H -- config/opencode/delegation-consumers.json` | The declaration commit; `devboxCommit` in `release.json` is devbox HEAD at assembly (after Plan 3 Task 4), baseline `c5da280d751e65fd5637830921d0aef9b84c1ff8` |

**Plan 1 interfaces Plan 3 consumes (from Plan 1 "Plan 1 Authoritative Consumer Interfaces and Commands" and `packages/schema/src/delegation.ts` in the reviewed worktree):**

- Runtime identity: `InstallationBuildID`, compile-time `OPENCODE_BUILD_ID`, `opencode --version` -- immutable, independent of `InstallationVersion`; a local build reports `local` and cannot acquire.
- `opencode debug delegation maintenance identity --database PATH --json` -> `MaintenanceIdentity = { buildID: string; protocol: "opencode.delegation/v1"; coordinationDomain: string }` (closed; read-only; no credentials).
- `opencode debug delegation maintenance status --database PATH --json` -> `MaintenanceStatus = { buildID; protocol; coordinationDomain; acquisitionDisabled: boolean; canaryRootSessionID: string | null; canaryExpiresAt: number | null; coordinationDomains: readonly string[]; participants: readonly ParticipantStatus[]; controllerCount; branchCount; pendingOutcomeCount }`.
- `ParticipantStatus = { coordinationDomain: string; component: "core" | "guard" | "workflows" | "broker_hud"; buildID: string; protocol: "opencode.delegation/v1"; capabilities: readonly string[]; availability: "available" | "unavailable"; heartbeatAt: number; worker: { workerID: string; workerEpoch: string } }`.
- Lists: `controllers` -> `{ controllers: ControllerLeaseStatus[] }`, `branches` -> `{ branches: BranchStatus[] }`, `participants` -> `{ participants: ParticipantStatus[] }`, `pending` -> `{ pending: PendingOutcomeStatus[] }`; mutations `disable-acquisition`, `enable-acquisition`, `allow-canary-root --root-session-id ID --expires-in-ms N`, `revoke-controller --lease-id ID --authority-epoch N`, `drain-branch --branch-id ID --timeout-ms N`, `abort-branch --branch-id ID`, `export-acknowledged-outcomes --output FILE`, each with `--database PATH --json` and the exact outputs in the Plan 1 table.
- HUD contract: `TuiDelegationApi.acquireController({ rootSessionID, protocol, buildID }): Promise<TuiControllerAcquireResult>`, `renewController({ handle, leaseID, authorityEpoch })`, `releaseController({ handle, leaseID, authorityEpoch })`; `TuiControllerHandle` is opaque and the HUD never sees Worker IDs, controller IDs or tokens.

**Plan 3 discrepancies found while writing this handoff. DECIDED 2026-10-08 (Holden): items 1-4 applied to Plan 3 as listed under "Plan 3 corrections required"; item 5 verified, informational.**

1. Plan 3 Task 5 Steps 1-3 resolve consumer commits from the live checkouts (`git -C /home/dev/opencode-guard rev-parse HEAD`, likewise workflows and broker) and run `npm test` there. Plan 2's commits live in the `-plan2` worktrees, and advancing the live checkouts to them is itself a deployment, because today's plugin links and `tui.json` load those checkouts directly. The worktrees share each repo's object store, so `--guard-repo /home/dev/opencode-guard --guard-commit "$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD)"` archives the right tree without touching live code. The same applies to workflows and broker.
2. Plan 3 Task 1 runs `npm ci --omit=dev` in every component snapshot. `opencode-agent-workflows` and `opencode-broker` have no `package-lock.json`, and `npm ci` refuses to run without one.
3. Plan 3 Task 7 consumes a "protocol identity `{ protocol, buildID, workerID, workerEpoch, coordinationDomain }`" and flat participant fields `{ workerID, workerEpoch, ... }`. Plan 1's `MaintenanceIdentity` is `{ buildID, protocol, coordinationDomain }`. Worker identity exists only as `ParticipantStatus.worker` / `ControllerLeaseStatus.workerID`/`workerEpoch`.
4. Plan 3 Task 7 lists `renewController({ leaseID, authorityEpoch })` and `releaseController({ leaseID, authorityEpoch })`. Plan 1 requires `handle` in both.
5. `brokerHUD` (`components/opencode-broker/hud/tui.js`) does not appear literally in Plan 3. It is derived from Plan 3's `git archive` of the broker plus the broker's `"./tui": "./hud/tui.js"` export, and the devbox plan's Task 2 Step 1 checks that export. Verified 2026-10-08: `main:package.json` (`1e17175`) still exports `"./tui": "./hud/tui.js"`; no Plan 3 change needed.

### Plan 3 corrections required

DECIDED 2026-10-08 (Holden): apply as listed. All four are now in Plan 3 (see its rebase note); this list is kept as the record.

1. APPLIED (Plan 3 Task 5 Steps 1-3a). Take the consumer commits from the `-plan2` worktrees and run their tests there, not in the live checkouts: `git -C /home/dev/opencode-guard-plan2 rev-parse HEAD`, `git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD`, `git -C /home/dev/opencode-broker-plan2 rev-parse HEAD`, and `npm test` from those three directories. `--*-repo` stays the live repo path, which archives the commit through the shared object store (Step 1 checks `cat-file -e`). The live checkouts `/home/dev/opencode-guard`, `/home/dev/opencode-agent-workflows` and `/home/dev/opencode-broker` stay untouched.
2. APPLIED (Plan 3 Task 1 test + Step 5, Task 5 Steps 3/3a). `opencode-agent-workflows` and `opencode-broker` have no lockfile, so their component snapshots install with `npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock --no-fund --no-audit` instead of `npm ci`; `--omit=peer` was added so workflows' required peer `@opencode-ai/plugin` is not pulled unpinned into the release (its `lib/tool.js` loads the host copy first), while broker's optional `@opentui/solid` 0.4.5 is still installed. The `opencode-guard` snapshot keeps `npm ci --omit=dev --ignore-scripts`. A snapshot whose lockfile presence contradicts this policy fails the build.
3. APPLIED (Plan 3 Task 2 Interfaces, Task 7 Interfaces and Step 2 evidence). Task 7 reads `MaintenanceIdentity { buildID, protocol, coordinationDomain }`. Worker identity comes from `ParticipantStatus.worker` (`{ workerID, workerEpoch }`) and from `ControllerLeaseStatus`, never from the identity record or from flat participant fields.
4. APPLIED (Plan 3 Task 7 Interfaces). Renew and release pass `{ handle, leaseID, authorityEpoch }` through `api.delegation` (`TuiPluginApi.delegation: TuiDelegationApi | null`): `api.delegation.renewController({ handle, leaseID, authorityEpoch })` and `api.delegation.releaseController({ handle, leaseID, authorityEpoch })`.
