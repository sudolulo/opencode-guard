# Fleet Delegation Consumers: Devbox Compatibility Declaration and Verification Gate Plan

> **Rebased 2026-10-08** (series-wide mapping: guard batch -> 1.8.0, workflows batch -> 0.14.0, broker unchanged at 1.24.0):
> - Guard batch `opencode-guard@1.7.0` -> `@1.8.0` and version checks `1.7.0` -> `1.8.0` everywhere (Prerequisites, Global Constraints, Task 1 test/declaration/CHANGELOG bullet, Task 2 Step 1); the Global Constraints measurement now cites `3a2f566` Release 1.7.1 and stops on anything but 1.7.x.
> - Workflows batch `opencode-agent-workflows@0.13.0` -> `@0.14.0` and version check `0.13.0` -> `0.14.0` in the same places; the `opencode-guard@1.3.0` and `opencode-agent-workflows@0.12.2` wrong-version fixtures are unchanged and still wrong.
> - Spec line: Plan 3 line citations shifted +7 for Plan 3's own rebase note (102 -> 109, 103 -> 110, 174-178 -> 181-185, 869-909 -> 876-916, 955 -> 962).
> - Global Constraints: devbox uncommitted-work list re-observed on 2026-10-08.
> - Task 1 prerequisite and Step 8: devbox suite re-measured at `9c552eb` (python 56/29 OK; node 75 tests, 72 pass, 3 fail); Step 8's expected count after Task 1 is now 94 (75 + 19).
> - RESOLVED 2026-10-08 (was RECONCILE, blocked Task 1): the 3 node failures in `tests/superpowers-helpers.test.mjs` came from `84751c1` (regenerate requires the tracked `agent-teams` source and builds 16 skills; the fixture copied only the generator and expected 15). Fixed outside this plan in fleet-core `42f296a`; node suite is now `tests 75 / pass 75`, so Task 1's prerequisite holds and Step 8 expects `tests 94 / pass 94`.
> - DECIDED 2026-10-08 (Holden): native agent teams are not a delegation consumer, so no capability is added or renamed for them; the workflows capability lists here (Global Constraints, Task 1 test, declaration and participant fixtures) and in the index stay exactly `registeredBranchV1`, `terminalHandoffV1`, `foregroundDeliveryV1`, `backgroundDeliveryV1`. Cross-plan note closed; no task text changed.
> - Checked, unchanged: `bin/devbox-sync:279-297` (no commit since 2026-09-30), the plugin-link and `tui.json` targets in Global Constraints, the first `### Added` under CHANGELOG `## [Unreleased]` (it now follows a `### Changed` whose first bullet is the `9c552eb` agent-teams entry), and the guard/workflows/broker/devbox ancestry baselines (each still an ancestor of its repo's HEAD; the Plan 1 worktree does not exist yet). This plan has no anchor into `fleet-delegation/SKILL.md`, `superpowers-override/`, `config/tmux.conf` or `bin/oc-task`, so the new Teams guidance overlaps nothing here.
> - 2026-10-12: batch renumbered to guard 1.9.0, workflows 0.15.0, broker 1.25.0 because each earlier number was published independently; each consumer branch merged its product's main (merge, not rebase), so the 'HEAD descends from' prerequisites still hold.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Plan 3 a tracked, test-enforced compatibility declaration for the `opencode.delegation/v1` consumer batch, then gate Plan 2 on every Plan 1 Task 26 command, every consumer suite, the devbox suite, diff hygiene, grep fences and an independent security review -- with no deployment of any kind.

**Architecture:** One JSON file, `/home/dev/devbox/config/opencode/delegation-consumers.json`, holds only commit-time facts (protocol, batch IDs, capabilities, HUD source, immutable target paths) and names the runtime-only values in `requiredRuntimeFields`. One ESM module, `/home/dev/devbox/config/opencode/lib/delegation-consumers.js`, validates the declaration and validates a release manifest that Plan 3 materializes (its `release.json`) against it. Neither file is loaded or linked by anything: `devbox-sync` links only an explicit file list from `config/opencode/` and deliberately never links `config/opencode/lib/` (`/home/dev/devbox/bin/devbox-sync:279-297`).

**Tech Stack:** Node 24 `node:test` + `node:assert/strict` (devbox's existing convention, `tests/*.test.mjs`), ESM (`config/opencode/package.json` has `"type": "module"`), Bun 1.3.14 for the Plan 1 core commands, npm for the consumer suites.

**Spec:** `/home/dev/opencode-guard/docs/superpowers/specs/2026-09-30-core-delegation-authority-design.md`, with the consumer contracts in `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md` (sections "Plan 1 Authoritative Consumer Interfaces and Commands" and "Task 26: Verification and release-contract gate") and `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-delegation-rollout-and-task7-recovery.md` (Plan 3: release layout line 109, manifest fields lines 110 and 181-185, link targets lines 876-916, declaration consumption line 962).

**Plan set:** this is the devbox plan of Plan 2, the fleet consumers of Plan 1's `opencode.delegation/v1`. Index: `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-consumers.md`. Sibling plans, each run in its own worktree: guard `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-guard.md`, workflows `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-workflows.md`, broker HUD `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-broker-hud.md`. Plan 1: `/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md`.

**Repository:** `/home/dev/devbox`, committed directly on `main` (no worktree). Every task runs from `/home/dev/devbox` unless a command says otherwise.

## Prerequisites

Task 1 does not depend on any other plan and may run before all of them. Task 2 is the final, verification-only task and runs last.

**Task 1 needs only the devbox working-tree state that its Step 0 checks.** From `/home/dev/devbox`:

```bash
git --no-pager status --short -- CHANGELOG.md config/opencode/delegation-consumers.json config/opencode/lib/delegation-consumers.js tests/delegation-consumers.test.mjs config/opencode/delegation-manifest.json
test ! -e config/opencode/delegation-manifest.json && test ! -e config/opencode/delegation-consumers.json && test ! -e config/opencode/lib/delegation-consumers.js && test ! -e tests/delegation-consumers.test.mjs && echo clean
git --no-pager diff --cached --name-only
```

must print, in order: nothing (none of the five paths has a status entry), `clean` (none of `config/opencode/delegation-manifest.json`, `config/opencode/delegation-consumers.json`, `config/opencode/lib/delegation-consumers.js`, `tests/delegation-consumers.test.mjs` exists), and nothing (empty index). Unrelated uncommitted or untracked files elsewhere in devbox are expected and are left alone (see Global Constraints). Task 1 also needs `node` 24 and `python3` for the devbox suite, which must be green before Task 1 starts (2026-10-01 baseline: `Ran 56 tests ... OK`, `Ran 29 tests ... OK`, node `tests 67 / pass 67 / fail 0`; re-measured 2026-10-08 at devbox `9c552eb`: `Ran 56 tests ... OK`, `Ran 29 tests ... OK`, node `tests 75 / pass 72 / fail 3` -- not green, see the RECONCILE line in the rebase note under the title).

**Task 2 needs all of the following** (its Step 1 checks each mechanically, except the Plan 1 review verdict, which Holden confirms):

- Task 1 is committed on devbox `main` (`git -C /home/dev/devbox log -1 --format=%H -- config/opencode/delegation-consumers.json` prints `DEVBOX_PLAN2_COMMIT`), and devbox `HEAD` descends from `c5da280d751e65fd5637830921d0aef9b84c1ff8`.
- The guard plan (`/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-guard.md`) is complete in `/home/dev/opencode-guard-plan2`: clean, `package.json` version `1.9.0`, `package-lock.json` present, `HEAD` descends from `7368c42265c5fcb85f8329545845ec597e37f7b0`.
- The workflows plan (`/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-workflows.md`) is complete in `/home/dev/opencode-agent-workflows-plan2`: clean, version `0.15.0`, no `package-lock.json`, `HEAD` descends from `9b1c4c2498fcfc016baf5521119c907d4daac64e`.
- The broker HUD plan (`/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-broker-hud.md`) is complete in `/home/dev/opencode-broker-plan2`: clean, version `1.25.0`, `exports["./tui"]` is `./hud/tui.js`, `HEAD` descends from `309a5748758ef436cf53cfc5369dfef3df51be39`.
- Plan 1 is complete in `/home/dev/projects/opencode-delegation`: clean, `HEAD` descends from `e36bbfbb92e7b673bd1edf3bafadbfe57d22a293`, Plan 1 Task 26 Step 6 independent review returned PASS, and Holden knows the reviewed HEAD it approved.
- `/home/dev/.bun/bin/bun` is Bun `1.3.14`; `jq` and `rg` are installed.
- No Plan 3 deployment state exists (the paths Task 2 Step 8f checks).

If any Task 2 prerequisite does not hold, Task 2 stops and reports STATUS: BLOCKED naming the failed prerequisite and the exact failing command output. Neither the implementer nor an escalation seat may create a worktree, run another plan, or edit any repository other than devbox to satisfy a prerequisite.

## How to run

Holden starts the run from devbox once every Task 2 prerequisite holds (plan-run executes Task 1 and then Task 2 in one run):

```bash
cd /home/dev/devbox && opencode run 'workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-fleet-delegation-devbox.md"} background:true'
```

Starting it earlier lands Task 1 and then stops BLOCKED at Task 2 Step 1. Rerunning with `resume:true` replays Task 1 from the workflow cache only within 24 hours; after that Task 1 runs again and its Step 0 reports BLOCKED because its four files already exist.

## Superseded file

The superseded `delegation-manifest.json` must never be created: it committed sentinel strings (`FILLED_BY_PLAN3_FROM_CORE_REVIEW`), named live source checkouts as "immutable" targets, and used a file name Plan 3 does not read.

## Global Constraints

- Plan 2 performs NO deployment, copy, symlink, sync, restart, canary, or arming. It does not run `devbox-sync`, `fleet-sync`, `systemctl`, `ln`, `install-opencode-fork`, `opencode-delegation-rollout`, or any `opencode debug delegation maintenance` mutation, and it pushes nothing.
- Protocol: `opencode.delegation/v1`.
- Batch IDs: guard `opencode-guard@1.9.0` (the next minor after the guard `main` HEAD measured 2026-10-12, `c95b85f` 1.8.0; another session releases guard independently, so the guard preflight re-measures and stops unless guard main is 1.8.x), workflows `opencode-agent-workflows@0.15.0`, broker HUD `opencode-broker@1.25.0`, core upstream `1.18.22`.
- Capabilities: guard `["toolAuthorizeV1","terminalHandoffV1"]`; workflows `["registeredBranchV1","terminalHandoffV1","foregroundDeliveryV1","backgroundDeliveryV1"]`; broker_hud `["controllerLeaseV1"]`.
- `sourceHUD` is `/home/dev/opencode-broker/hud/tui.js`; `standaloneHUD` is `false`.
- Immutable targets are Plan 3's active-path components: `/home/dev/.local/lib/opencode-fork/components/{opencode-guard,opencode-agent-workflows,opencode-broker}`, plugin link targets `../../../../.local/lib/opencode-fork/components/opencode-guard/plugin.js` and `../../../../.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js`, TUI URLs `file:///home/dev/.local/lib/opencode-fork/components/opencode-broker` and `file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui`.
- Runtime-only values (reviewed core commit, custom build ID, consumer HEADs) are never committed, not even as sentinel strings.
- The reviewed core worktree is `/home/dev/projects/opencode-delegation`. Root-level `bun test` is prohibited there; only Plan 1's package-scoped commands run.
- Consumer worktrees: `/home/dev/opencode-guard-plan2`, `/home/dev/opencode-agent-workflows-plan2`, `/home/dev/opencode-broker-plan2`. The live checkouts `/home/dev/opencode-guard`, `/home/dev/opencode-agent-workflows`, `/home/dev/opencode-broker` are what the running fleet loads today (`/home/dev/devbox/config/opencode/plugin/opencode-guard.js -> ../../../../opencode-guard/plugin.js`, `tui.json` -> `file:///home/dev/opencode-broker`), so moving their `main` to Plan 2 code IS a deployment and is forbidden in Plan 2.
- `/home/dev/devbox` has unrelated uncommitted work (observed 2026-10-08: modified `.gitignore`, `config/opencode-broker/ROUTING.md`, `config/opencode/agent/scout.md`, `config/opencode/agent/tester.md`, two `docs/superpowers/plans/2026-09-22-routing-*.md`; untracked two Tandoor docs and the `2026-10-06`/`2026-10-07` background-tool-authorization spec and plan; `tests/fleet-config.test.mjs`, modified when this plan was written, is now clean). Never stage, stash, restore, or rewrite it; stage by explicit path only. This is why the declaration's test is a new file and does not modify `tests/fleet-config.test.mjs`.
- Bun is `/home/dev/.bun/bin/bun` at `1.3.14`; it is not on the non-interactive `PATH`, so every core block exports `PATH=/home/dev/.bun/bin:$PATH` and then runs Plan 1's `bun ...` commands byte-for-byte.
- Commit messages follow devbox style (sentence-case imperative, no prefix, no AI attribution).

## Review Focus

1. A materialized manifest whose runtime field is present but empty (`""`) or `null` must be rejected as missing, not accepted as filled. Owned by Task 1 test "present-but-empty, null, short, or uppercase runtime values are rejected".
2. A build ID that names a different commit than `coreCommit` (wrong worktree, rebuilt HEAD) must be rejected. Owned by Task 1 test "a build ID that does not name the reviewed core commit is rejected".
3. A declaration whose target points back at a live source checkout (`/home/dev/opencode-guard/plugin.js`, `../../../../opencode-guard/plugin.js`) must be rejected; otherwise Plan 3 would "activate" the live repo. Owned by Task 1 test "a declaration that drifts from the release layout or the HUD contract is rejected".
4. A sentinel or a runtime value committed into the declaration (`coreCommit: "FILLED_BY_PLAN3_..."`, `componentBuildIDs.coreCustom`) must be rejected. Owned by Task 1 test "a declaration carrying a runtime value or a sentinel is rejected".
5. An abbreviated (7-char) or uppercase commit hash must be rejected; Plan 3 archives by exact full commit. Owned by the same test as item 1.

---

## Task 1: Devbox compatibility declaration

> Plan change (2026-10-09, after the first attempt): the four Task 1 files already exist in the working tree from that attempt (untracked `config/opencode/delegation-consumers.json`, `config/opencode/lib/delegation-consumers.js`, `tests/delegation-consumers.test.mjs`; modified `CHANGELOG.md` carrying only the Task 1 bullet; copies in `/home/dev/.local/state/delegation-plan-series/devbox-task1-1534.tgz`). Their own test passes 19/19. Step 0's "untouched" check therefore does not apply: instead confirm those are the only changes to those four paths, review them against this task, then run Step 8 and Step 9 (commit only those four paths). The devbox suite failure the first attempt hit (`tests/oc-task-bridge.test.mjs`, 7 tests failing in any agent's shell because `OPENCODE_AGENT_SHELL=1`) was fixed separately in devbox `d733b4a`; the full suite is 110/110 with Task 1's files present.

**Files:**
- Create: `/home/dev/devbox/tests/delegation-consumers.test.mjs`
- Create: `/home/dev/devbox/config/opencode/lib/delegation-consumers.js`
- Create: `/home/dev/devbox/config/opencode/delegation-consumers.json`
- Modify: `/home/dev/devbox/CHANGELOG.md` (one bullet under `## [Unreleased]` -> `### Added`)

**Interfaces:**
- Consumes: nothing at runtime. Values come from Plan 1's `Component` literal (`"core" | "guard" | "workflows" | "broker_hud"`), Plan 1 participant fixtures (capability names), and Plan 3's release layout and `release.json` key set.
- Produces (file): `/home/dev/devbox/config/opencode/delegation-consumers.json`, schema `opencode.delegation-consumers/v1`, top-level keys exactly `schema, protocol, componentBuildIDs, capabilities, sourceHUD, standaloneHUD, targets, requiredRuntimeFields`. `componentBuildIDs` keys follow Plan 3's `release.json` (`guard, workflows, broker, coreUpstream`; `coreCustom` is runtime). `capabilities` keys follow Plan 1's `Component` literal (`guard, workflows, broker_hud`). The two key sets differ on purpose (`broker` vs `broker_hud`) because each mirrors its consumer.
- Produces (module, `/home/dev/devbox/config/opencode/lib/delegation-consumers.js`):
  - `DECLARATION_SCHEMA: "opencode.delegation-consumers/v1"`
  - `DELEGATION_PROTOCOL: "opencode.delegation/v1"`
  - `RUNTIME_FIELD_PATTERNS: Readonly<Record<string, string>>` -- `coreCommit`, `guardCommit`, `workflowsCommit`, `brokerCommit`, `devboxCommit` -> `^[0-9a-f]{40}$`; `buildID`, `componentBuildIDs.coreCustom` -> `^0\.0\.0-fork/delegation-v1-[0-9a-f]{12,40}$`
  - `REQUIRED_RUNTIME_PATHS: readonly ["coreCommit","buildID","componentBuildIDs.coreCustom","guardCommit","workflowsCommit","brokerCommit","devboxCommit"]`
  - `class DelegationConsumersError extends Error { problems: readonly string[] }`
  - `readPath(value: unknown, path: string): unknown` -- own properties only
  - `validateDeclaration(declaration: unknown): declaration` -- throws `DelegationConsumersError`
  - `validateMaterialized(declaration: unknown, manifest: unknown): Readonly<{ buildID: string; coreCommit: string; guardCommit: string; workflowsCommit: string; brokerCommit: string; devboxCommit: string }>` -- throws `DelegationConsumersError`; problem strings include exactly `missing runtime field <path>` / `malformed runtime field <path>`
  - `validateParticipants(declaration: unknown, participants: unknown): readonly string[]` -- over Plan 1 `ParticipantStatus[]` (`coordinationDomain, component, buildID, protocol, capabilities, availability, heartbeatAt, worker`). Throws `DelegationConsumersError` only when the declaration itself is invalid; otherwise returns a frozen problems array, empty when the set matches. For each component in the declaration's `capabilities` map (`guard`, `workflows`, `broker_hud`) it requires at least one row with that `component` and at least one of them with `availability === "available"`. Every AVAILABLE row must have `buildID` equal to the declaration's build ID for it (`broker_hud` reads `componentBuildIDs.broker`), protocol `opencode.delegation/v1`, and sorted `capabilities` equal to the declared sorted list. Several Workers share one coordination database and each registers its own plugins, so one row per component per Worker is normal. Unavailable rows (a Worker that predates the upgrade, not yet withdrawn) are skipped because they grant nothing. Rows for components outside the map (`core`) are not checked here: core's build ID is a runtime value. Problem strings are exactly `participants must be an array`, `participant <component> is missing`, `participant <component> has no available registration`, `participant <component> (worker <workerID>) buildID must be <id>`, `participant <component> (worker <workerID>) protocol must be opencode.delegation/v1` and `participant <component> (worker <workerID>) capabilities must be exactly <a, b>`.

- [ ] **Step 0: Confirm the four target paths are untouched and the superseded file does not exist.**

Run from `/home/dev/devbox`:

```bash
git --no-pager status --short -- CHANGELOG.md config/opencode/delegation-consumers.json config/opencode/lib/delegation-consumers.js tests/delegation-consumers.test.mjs config/opencode/delegation-manifest.json
test ! -e config/opencode/delegation-manifest.json && test ! -e config/opencode/delegation-consumers.json && test ! -e config/opencode/lib/delegation-consumers.js && test ! -e tests/delegation-consumers.test.mjs && echo clean
git --no-pager diff --cached --name-only
```

Expected: the first command prints nothing, the second prints `clean`, the third prints nothing (empty index). Any other output: stop and report STATUS: BLOCKED with the exact output; do not stage, stash, or restore anyone else's work.

- [ ] **Step 1: Write the failing test.**

Create `/home/dev/devbox/tests/delegation-consumers.test.mjs`:

```js
// Tests for config/opencode/delegation-consumers.json -- the tracked compatibility
// declaration for the opencode.delegation/v1 consumer batch -- and for the validator the
// rollout runs against the release manifest it materializes. The declaration may hold
// only values known when it is committed: the reviewed core commit, the fork build ID
// and the consumer commits are named in requiredRuntimeFields and never committed.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DelegationConsumersError,
  REQUIRED_RUNTIME_PATHS,
  readPath,
  validateDeclaration,
  validateMaterialized,
  validateParticipants,
} from "../config/opencode/lib/delegation-consumers.js";

const DECLARATION_URL = new URL("../config/opencode/delegation-consumers.json", import.meta.url);
const declaration = JSON.parse(readFileSync(DECLARATION_URL, "utf8"));
const clone = (value) => structuredClone(value);

const COMMIT = "^[0-9a-f]{40}$";
const BUILD_ID = "^0\\.0\\.0-fork/delegation-v1-[0-9a-f]{12,40}$";

const EXPECTED = {
  schema: "opencode.delegation-consumers/v1",
  protocol: "opencode.delegation/v1",
  componentBuildIDs: {
    guard: "opencode-guard@1.9.0",
    workflows: "opencode-agent-workflows@0.15.0",
    broker: "opencode-broker@1.25.0",
    coreUpstream: "1.18.22",
  },
  capabilities: {
    guard: ["toolAuthorizeV1", "terminalHandoffV1"],
    workflows: ["registeredBranchV1", "terminalHandoffV1", "foregroundDeliveryV1", "backgroundDeliveryV1"],
    broker_hud: ["controllerLeaseV1"],
  },
  sourceHUD: "/home/dev/opencode-broker/hud/tui.js",
  standaloneHUD: false,
  targets: {
    componentsRoot: "/home/dev/.local/lib/opencode-fork/components",
    guard: "/home/dev/.local/lib/opencode-fork/components/opencode-guard",
    guardPlugin: "/home/dev/.local/lib/opencode-fork/components/opencode-guard/plugin.js",
    workflows: "/home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows",
    workflowsPlugin: "/home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js",
    broker: "/home/dev/.local/lib/opencode-fork/components/opencode-broker",
    brokerHUD: "/home/dev/.local/lib/opencode-fork/components/opencode-broker/hud/tui.js",
    tuiPlugins: [
      "file:///home/dev/.local/lib/opencode-fork/components/opencode-broker",
      "file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui",
    ],
    pluginLinks: {
      "/home/dev/devbox/config/opencode/plugin/opencode-guard.js":
        "../../../../.local/lib/opencode-fork/components/opencode-guard/plugin.js",
      "/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js":
        "../../../../.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js",
    },
  },
  requiredRuntimeFields: [
    {
      path: "coreCommit",
      pattern: COMMIT,
      source: "git -C /home/dev/projects/opencode-delegation rev-parse HEAD (the reviewed Plan 1 HEAD)",
    },
    {
      path: "buildID",
      pattern: BUILD_ID,
      source: "0.0.0-fork/delegation-v1-$(git -C /home/dev/projects/opencode-delegation rev-parse --short=12 HEAD), equal to bin/opencode --version of the release",
    },
    {
      path: "componentBuildIDs.coreCustom",
      pattern: BUILD_ID,
      source: "equal to buildID",
    },
    {
      path: "guardCommit",
      pattern: COMMIT,
      source: "git -C /home/dev/opencode-guard-plan2 rev-parse HEAD (the reviewed Plan 2 guard commit)",
    },
    {
      path: "workflowsCommit",
      pattern: COMMIT,
      source: "git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD (the reviewed Plan 2 workflows commit)",
    },
    {
      path: "brokerCommit",
      pattern: COMMIT,
      source: "git -C /home/dev/opencode-broker-plan2 rev-parse HEAD (the reviewed Plan 2 broker commit)",
    },
    {
      path: "devboxCommit",
      pattern: COMMIT,
      source: "git -C /home/dev/devbox rev-parse HEAD at release assembly",
    },
  ],
};

// A manifest with Plan 3's exact release.json key set and fixture commits. The
// validator does not interpret release.json's own schema, files, binary or alias
// fields; the installer owns those.
function materialized() {
  return {
    schema: "opencode-fork-release/v1",
    buildID: "0.0.0-fork/delegation-v1-0123456789ab",
    componentBuildIDs: {
      guard: "opencode-guard@1.9.0",
      workflows: "opencode-agent-workflows@0.15.0",
      broker: "opencode-broker@1.25.0",
      coreUpstream: "1.18.22",
      coreCustom: "0.0.0-fork/delegation-v1-0123456789ab",
    },
    protocol: "opencode.delegation/v1",
    coreCommit: "0123456789abcdef0123456789abcdef01234567",
    guardCommit: "1111111111111111111111111111111111111111",
    workflowsCommit: "2222222222222222222222222222222222222222",
    brokerCommit: "3333333333333333333333333333333333333333",
    devboxCommit: "4444444444444444444444444444444444444444",
    deploymentAliases: { "/home/dev/fleet-core": "/home/dev/devbox" },
    binaryPath: "bin/opencode",
    binarySHA256: "e".repeat(64),
    files: {},
    buildCommand: "/home/dev/.bun/bin/bun run --cwd packages/opencode build --single --skip-install",
  };
}

test("the declaration pins the v1 compatibility set exactly", () => {
  assert.deepEqual(declaration, EXPECTED);
  assert.equal(validateDeclaration(declaration), declaration);
});

test("the declaration commits no runtime value", () => {
  assert.deepEqual([...REQUIRED_RUNTIME_PATHS], [
    "coreCommit",
    "buildID",
    "componentBuildIDs.coreCustom",
    "guardCommit",
    "workflowsCommit",
    "brokerCommit",
    "devboxCommit",
  ]);
  for (const path of REQUIRED_RUNTIME_PATHS) assert.equal(readPath(declaration, path), undefined, path);
  assert.deepEqual(declaration.requiredRuntimeFields.map((field) => field.path), [...REQUIRED_RUNTIME_PATHS]);
});

test("a declaration carrying a runtime value or a sentinel is rejected", () => {
  const withCommit = { ...clone(declaration), coreCommit: "FILLED_BY_PLAN3_FROM_CORE_REVIEW" };
  assert.throws(() => validateDeclaration(withCommit), /must not carry runtime field coreCommit/);
  const withCustom = clone(declaration);
  withCustom.componentBuildIDs.coreCustom = "0.0.0-fork/delegation-v1-0123456789ab";
  assert.throws(() => validateDeclaration(withCustom), /must not carry runtime field componentBuildIDs\.coreCustom/);
  const withSentinel = clone(declaration);
  withSentinel.requiredRuntimeFields[0].source = "FILLED_BY_PLAN3";
  assert.throws(() => validateDeclaration(withSentinel), /sentinel/);
  const withTemplate = clone(declaration);
  withTemplate.requiredRuntimeFields[3].source = "<reviewed-guard-commit>";
  assert.throws(() => validateDeclaration(withTemplate), /sentinel/);
});

test("a declaration that drifts from the release layout or the HUD contract is rejected", () => {
  const live = clone(declaration);
  live.targets.guardPlugin = "/home/dev/opencode-guard/plugin.js";
  assert.throws(() => validateDeclaration(live), /targets\.guardPlugin must be/);
  const liveLink = clone(declaration);
  liveLink.targets.pluginLinks["/home/dev/devbox/config/opencode/plugin/opencode-guard.js"] = "../../../../opencode-guard/plugin.js";
  assert.throws(() => validateDeclaration(liveLink), /targets\.pluginLinks/);
  const liveTui = clone(declaration);
  liveTui.targets.tuiPlugins = ["file:///home/dev/opencode-broker", "file:///home/dev/opencode-broker/tui"];
  assert.throws(() => validateDeclaration(liveTui), /targets\.tuiPlugins/);
  const standalone = { ...clone(declaration), standaloneHUD: true };
  assert.throws(() => validateDeclaration(standalone), /standaloneHUD must be false/);
  const duplicate = clone(declaration);
  duplicate.capabilities.guard = ["toolAuthorizeV1", "toolAuthorizeV1"];
  assert.throws(() => validateDeclaration(duplicate), /capabilities\.guard has duplicates/);
  const loose = clone(declaration);
  loose.requiredRuntimeFields[0].pattern = "[0-9a-f]+";
  assert.throws(() => validateDeclaration(loose), /requiredRuntimeFields\[0\]\.pattern must be/);
  const extra = { ...clone(declaration), deployed: true };
  assert.throws(() => validateDeclaration(extra), /declaration keys must be exactly/);
});

test("plugin links with swapped or moved link paths are rejected", () => {
  const GUARD_LINK = "/home/dev/devbox/config/opencode/plugin/opencode-guard.js";
  const WORKFLOWS_LINK = "/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js";
  const swapped = clone(declaration);
  const links = swapped.targets.pluginLinks;
  [links[GUARD_LINK], links[WORKFLOWS_LINK]] = [links[WORKFLOWS_LINK], links[GUARD_LINK]];
  assert.throws(
    () => validateDeclaration(swapped),
    (error) =>
      error instanceof DelegationConsumersError &&
      error.problems.includes(
        `targets.pluginLinks[${GUARD_LINK}] must be a relative target resolving to /home/dev/.local/lib/opencode-fork/components/opencode-guard/plugin.js`,
      ) &&
      error.problems.includes(
        `targets.pluginLinks[${WORKFLOWS_LINK}] must be a relative target resolving to /home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js`,
      ),
  );
  const moved = clone(declaration);
  moved.targets.pluginLinks["/home/dev/devbox/config/opencode/plugin/guard.js"] = moved.targets.pluginLinks[GUARD_LINK];
  delete moved.targets.pluginLinks[GUARD_LINK];
  assert.throws(() => validateDeclaration(moved), /targets\.pluginLinks keys must be exactly/);
});

test("a materialized release manifest is accepted and yields the commits to record", () => {
  assert.deepEqual(validateMaterialized(declaration, materialized()), {
    buildID: "0.0.0-fork/delegation-v1-0123456789ab",
    coreCommit: "0123456789abcdef0123456789abcdef01234567",
    guardCommit: "1111111111111111111111111111111111111111",
    workflowsCommit: "2222222222222222222222222222222222222222",
    brokerCommit: "3333333333333333333333333333333333333333",
    devboxCommit: "4444444444444444444444444444444444444444",
  });
});

for (const path of REQUIRED_RUNTIME_PATHS) {
  test(`a materialized manifest missing ${path} is rejected`, () => {
    const manifest = materialized();
    const keys = path.split(".");
    const last = keys.pop();
    delete keys.reduce((node, key) => node[key], manifest)[last];
    assert.throws(
      () => validateMaterialized(declaration, manifest),
      (error) => error instanceof DelegationConsumersError && error.problems.includes(`missing runtime field ${path}`),
    );
  });
}

test("present-but-empty, null, short, or uppercase runtime values are rejected", () => {
  for (const [path, value, problem] of [
    ["coreCommit", "", "missing runtime field coreCommit"],
    ["guardCommit", null, "missing runtime field guardCommit"],
    ["brokerCommit", "3333333", "malformed runtime field brokerCommit"],
    ["devboxCommit", "444444444444444444444444444444444444444A", "malformed runtime field devboxCommit"],
  ]) {
    const manifest = { ...materialized(), [path]: value };
    assert.throws(
      () => validateMaterialized(declaration, manifest),
      (error) => error instanceof DelegationConsumersError && error.problems.includes(problem),
      path,
    );
  }
});

test("a build ID that does not name the reviewed core commit is rejected", () => {
  const otherBuild = materialized();
  otherBuild.buildID = "0.0.0-fork/delegation-v1-fedcba987654";
  otherBuild.componentBuildIDs.coreCustom = otherBuild.buildID;
  assert.throws(() => validateMaterialized(declaration, otherBuild), /buildID must name an abbreviation of coreCommit/);
  const split = materialized();
  split.componentBuildIDs.coreCustom = "0.0.0-fork/delegation-v1-0123456789abc";
  assert.throws(() => validateMaterialized(declaration, split), /coreCustom must equal buildID/);
});

test("a manifest for another protocol or another consumer batch is rejected", () => {
  assert.throws(
    () => validateMaterialized(declaration, { ...materialized(), protocol: "opencode.delegation/v2" }),
    /protocol must be opencode\.delegation\/v1/,
  );
  const wrongGuard = materialized();
  // 1.8.0 was this batch's number before it was published independently as a separate
  // guard release; a manifest assembled against the superseded number must not pass.
  wrongGuard.componentBuildIDs.guard = "opencode-guard@1.8.0";
  assert.throws(() => validateMaterialized(declaration, wrongGuard), /componentBuildIDs\.guard must be opencode-guard@1\.9\.0/);
  const inherited = Object.assign(Object.create({ coreCommit: "0123456789abcdef0123456789abcdef01234567" }), materialized());
  delete inherited.coreCommit;
  assert.throws(
    () => validateMaterialized(declaration, inherited),
    (error) => error instanceof DelegationConsumersError && error.problems.includes("missing runtime field coreCommit"),
  );
  assert.throws(() => validateMaterialized(declaration, null), /materialized manifest must be an object/);
});

// A Plan 1 `participants --json` set, as ParticipantStatus rows. Capabilities are listed
// out of declared order on purpose: the check compares sorted lists. The core row is
// outside the declaration's capabilities map and is not checked here.
function participants() {
  const row = (component, buildID, capabilities, n) => ({
    coordinationDomain: "fixture-domain",
    component,
    buildID,
    protocol: "opencode.delegation/v1",
    capabilities,
    availability: "available",
    heartbeatAt: 1790000000000 + n,
    worker: { workerID: `worker-${n}`, workerEpoch: `epoch-${n}` },
  });
  return [
    row("core", "0.0.0-fork/delegation-v1-0123456789ab", [], 0),
    row("guard", "opencode-guard@1.9.0", ["terminalHandoffV1", "toolAuthorizeV1"], 1),
    row(
      "workflows",
      "opencode-agent-workflows@0.15.0",
      ["backgroundDeliveryV1", "foregroundDeliveryV1", "registeredBranchV1", "terminalHandoffV1"],
      2,
    ),
    row("broker_hud", "opencode-broker@1.25.0", ["controllerLeaseV1"], 3),
  ];
}
const rowFor = (rows, component) => rows.find((row) => row.component === component);

test("a participant set matching the declaration passes", () => {
  const problems = validateParticipants(declaration, participants());
  assert.deepEqual([...problems], []);
  assert.equal(Object.isFrozen(problems), true);
});

test("a participant set that drifts from the declaration is reported", () => {
  const cases = [
    [
      "wrong build",
      (rows) => { rowFor(rows, "guard").buildID = "opencode-guard@1.3.0"; },
      "participant guard (worker worker-1) buildID must be opencode-guard@1.9.0",
    ],
    [
      "missing capability",
      (rows) => { rowFor(rows, "workflows").capabilities = ["registeredBranchV1", "terminalHandoffV1", "foregroundDeliveryV1"]; },
      "participant workflows (worker worker-2) capabilities must be exactly backgroundDeliveryV1, foregroundDeliveryV1, registeredBranchV1, terminalHandoffV1",
    ],
    [
      "extra capability",
      (rows) => { rowFor(rows, "broker_hud").capabilities = ["controllerLeaseV1", "controllerLeaseV2"]; },
      "participant broker_hud (worker worker-3) capabilities must be exactly controllerLeaseV1",
    ],
    [
      "only unavailable registrations",
      (rows) => { rowFor(rows, "guard").availability = "unavailable"; },
      "participant guard has no available registration",
    ],
    [
      "missing component",
      (rows) => { rows.splice(rows.indexOf(rowFor(rows, "broker_hud")), 1); },
      "participant broker_hud is missing",
    ],
    [
      "a second Worker's available registration at the wrong build",
      (rows) => { rows.push({ ...structuredClone(rowFor(rows, "workflows")), buildID: "opencode-agent-workflows@0.12.2", worker: { workerID: "worker-9", workerEpoch: "epoch-9" } }); },
      "participant workflows (worker worker-9) buildID must be opencode-agent-workflows@0.15.0",
    ],
  ];
  for (const [name, mutate, problem] of cases) {
    const rows = participants();
    mutate(rows);
    const problems = validateParticipants(declaration, rows);
    assert.deepEqual([...problems], [problem], name);
  }
  assert.deepEqual([...validateParticipants(declaration, { participants: participants() })], ["participants must be an array"]);
});

test("several Workers and stale unavailable rows are accepted when every available row matches", () => {
  const rows = participants();
  rows.push({ ...structuredClone(rowFor(rows, "guard")), worker: { workerID: "worker-8", workerEpoch: "epoch-8" } });
  rows.push({ ...structuredClone(rowFor(rows, "workflows")), buildID: "opencode-agent-workflows@0.12.2", availability: "unavailable", worker: { workerID: "worker-7", workerEpoch: "epoch-7" } });
  assert.deepEqual([...validateParticipants(declaration, rows)], []);
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run from `/home/dev/devbox`: `node --test tests/delegation-consumers.test.mjs`

Expected: FAIL (exit 1) with `ERR_MODULE_NOT_FOUND` naming `/home/dev/devbox/config/opencode/lib/delegation-consumers.js`.

- [ ] **Step 3: Write the validator.**

Create `/home/dev/devbox/config/opencode/lib/delegation-consumers.js`:

```js
// Validator for config/opencode/delegation-consumers.json, the tracked compatibility
// declaration for the opencode.delegation/v1 consumer batch (guard, agent-workflows,
// broker HUD) against core upstream 1.18.22.
//
// The declaration carries only what is known when it is committed. The reviewed core
// commit, the fork build ID derived from it, and the consumer commits exist only once
// the rollout assembles a release, so the declaration names them in
// requiredRuntimeFields instead of holding sentinel strings. validateMaterialized()
// checks a manifest the rollout produced (its release.json) against the declaration.
//
// Nothing loads this module at runtime: devbox-sync does not link config/opencode/lib/
// and no plugin imports it. Tests and the rollout's offline gate call it.
import { posix } from "node:path";
import { pathToFileURL } from "node:url";

export const DECLARATION_SCHEMA = "opencode.delegation-consumers/v1";
export const DELEGATION_PROTOCOL = "opencode.delegation/v1";

const COMMIT = "^[0-9a-f]{40}$";
// install-opencode-fork computes the build ID from `git rev-parse --short=12 HEAD`,
// which prints at least 12 hex digits and more only when 12 would be ambiguous.
const BUILD_ID = "^0\\.0\\.0-fork/delegation-v1-[0-9a-f]{12,40}$";
const BUILD_ID_PREFIX = "0.0.0-fork/delegation-v1-";

// Insertion order is the contract order: the declaration lists the fields in this order.
export const RUNTIME_FIELD_PATTERNS = Object.freeze({
  coreCommit: COMMIT,
  buildID: BUILD_ID,
  "componentBuildIDs.coreCustom": BUILD_ID,
  guardCommit: COMMIT,
  workflowsCommit: COMMIT,
  brokerCommit: COMMIT,
  devboxCommit: COMMIT,
});
export const REQUIRED_RUNTIME_PATHS = Object.freeze(Object.keys(RUNTIME_FIELD_PATTERNS));
const RUNTIME_FIELD_REGEX = Object.freeze(
  Object.fromEntries(Object.entries(RUNTIME_FIELD_PATTERNS).map(([path, pattern]) => [path, new RegExp(pattern)])),
);

const DECLARATION_KEYS = [
  "schema",
  "protocol",
  "componentBuildIDs",
  "capabilities",
  "sourceHUD",
  "standaloneHUD",
  "targets",
  "requiredRuntimeFields",
];
const TARGET_KEYS = [
  "componentsRoot",
  "guard",
  "guardPlugin",
  "workflows",
  "workflowsPlugin",
  "broker",
  "brokerHUD",
  "tuiPlugins",
  "pluginLinks",
];
// componentBuildIDs keys follow the rollout's release.json; capability keys follow
// core's Component literal, which names the broker HUD "broker_hud".
const PACKAGE_FOR = Object.freeze({
  guard: "opencode-guard",
  workflows: "opencode-agent-workflows",
  broker: "opencode-broker",
});
const CAPABILITY_COMPONENTS = ["guard", "workflows", "broker_hud"];
// The two tracked plugin symlinks the rollout retargets, each pinned to the targets key it
// must resolve to.
const PLUGIN_LINK_TARGET = Object.freeze({
  "/home/dev/devbox/config/opencode/plugin/opencode-guard.js": "guardPlugin",
  "/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js": "workflowsPlugin",
});
const CAPABILITY = /^[a-z][A-Za-z]*V[0-9]+$/;
const SEMVER = /^[0-9]+\.[0-9]+\.[0-9]+$/;
// The fill-in markers an earlier draft committed ("FILLED_BY_PLAN3_...") and
// angle-bracket template markers ("<reviewed-commit>").
const SENTINEL = /FILLED_|CHANGEME|<[A-Za-z][A-Za-z0-9 _-]*>/i;

export class DelegationConsumersError extends Error {
  constructor(problems) {
    super(`delegation consumers: ${problems.join("; ")}`);
    this.name = "DelegationConsumersError";
    this.problems = Object.freeze([...problems]);
  }
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// Reads a dotted path through own properties only, so an inherited or
// prototype-polluted property never satisfies a required field.
export function readPath(value, path) {
  let current = value;
  for (const key of path.split(".")) {
    if (!isObject(current) || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

function checkKeys(problems, label, value, keys) {
  if (!isObject(value)) {
    problems.push(`${label} must be an object`);
    return false;
  }
  const actual = Object.keys(value).sort().join(", ");
  const expected = [...keys].sort().join(", ");
  if (actual !== expected) problems.push(`${label} keys must be exactly ${expected}`);
  return true;
}

function isCanonicalAbsolute(path) {
  return typeof path === "string" && posix.isAbsolute(path) && posix.normalize(path) === path && !path.endsWith("/");
}

function collectStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, out);
  else if (isObject(value)) for (const item of Object.values(value)) collectStrings(item, out);
  return out;
}

function checkTargets(problems, targets) {
  if (!checkKeys(problems, "targets", targets, TARGET_KEYS)) return;
  if (!isCanonicalAbsolute(targets.componentsRoot)) {
    problems.push("targets.componentsRoot must be a canonical absolute path");
    return;
  }
  const root = targets.componentsRoot;
  // The release layout install-opencode-fork writes: components/<package>/ is a
  // git-archive snapshot of that package, so plugin.js and hud/tui.js sit at the
  // same relative paths as in the source repositories.
  const expected = {
    guard: `${root}/opencode-guard`,
    guardPlugin: `${root}/opencode-guard/plugin.js`,
    workflows: `${root}/opencode-agent-workflows`,
    workflowsPlugin: `${root}/opencode-agent-workflows/plugin.js`,
    broker: `${root}/opencode-broker`,
    brokerHUD: `${root}/opencode-broker/hud/tui.js`,
  };
  for (const [key, path] of Object.entries(expected)) {
    if (targets[key] !== path) problems.push(`targets.${key} must be ${path}`);
  }
  const brokerURL = pathToFileURL(expected.broker).href;
  const tui = targets.tuiPlugins;
  if (!Array.isArray(tui) || tui.length !== 2 || tui[0] !== brokerURL || tui[1] !== `${brokerURL}/tui`) {
    problems.push(`targets.tuiPlugins must be [${brokerURL}, ${brokerURL}/tui]`);
  }
  // Each link is pinned to its own target. Comparing only the set of resolved targets would
  // accept the two links swapped, which would load the workflows plugin as the guard.
  const links = targets.pluginLinks;
  if (checkKeys(problems, "targets.pluginLinks", links, Object.keys(PLUGIN_LINK_TARGET))) {
    for (const [link, key] of Object.entries(PLUGIN_LINK_TARGET)) {
      const target = links[link];
      const resolved =
        typeof target === "string" && !posix.isAbsolute(target) ? posix.resolve(posix.dirname(link), target) : null;
      if (resolved !== expected[key]) {
        problems.push(`targets.pluginLinks[${link}] must be a relative target resolving to ${expected[key]}`);
      }
    }
  }
}

function checkRuntimeFields(problems, fields) {
  if (!Array.isArray(fields)) {
    problems.push("requiredRuntimeFields must be an array");
    return;
  }
  const paths = [];
  fields.forEach((field, index) => {
    const label = `requiredRuntimeFields[${index}]`;
    if (!checkKeys(problems, label, field, ["path", "pattern", "source"])) return;
    if (!Object.hasOwn(RUNTIME_FIELD_PATTERNS, field.path)) {
      problems.push(`${label}.path must be one of ${REQUIRED_RUNTIME_PATHS.join(", ")}`);
      return;
    }
    paths.push(field.path);
    const pattern = RUNTIME_FIELD_PATTERNS[field.path];
    if (field.pattern !== pattern) problems.push(`${label}.pattern must be ${pattern}`);
    if (typeof field.source !== "string" || field.source.trim() === "") {
      problems.push(`${label}.source must be a non-empty string`);
    }
  });
  if (paths.join(",") !== REQUIRED_RUNTIME_PATHS.join(",")) {
    problems.push(`requiredRuntimeFields must list exactly ${REQUIRED_RUNTIME_PATHS.join(", ")} in that order`);
  }
}

export function validateDeclaration(declaration) {
  const problems = [];
  if (!checkKeys(problems, "declaration", declaration, DECLARATION_KEYS)) {
    throw new DelegationConsumersError(problems);
  }
  for (const path of REQUIRED_RUNTIME_PATHS) {
    if (readPath(declaration, path) !== undefined) problems.push(`declaration must not carry runtime field ${path}`);
  }
  for (const text of collectStrings(declaration)) {
    if (SENTINEL.test(text)) problems.push(`declaration contains a sentinel string: ${JSON.stringify(text)}`);
  }
  if (declaration.schema !== DECLARATION_SCHEMA) problems.push(`schema must be ${DECLARATION_SCHEMA}`);
  if (declaration.protocol !== DELEGATION_PROTOCOL) problems.push(`protocol must be ${DELEGATION_PROTOCOL}`);

  const ids = declaration.componentBuildIDs;
  if (checkKeys(problems, "componentBuildIDs", ids, [...Object.keys(PACKAGE_FOR), "coreUpstream"])) {
    for (const [key, name] of Object.entries(PACKAGE_FOR)) {
      const value = ids[key];
      if (typeof value !== "string" || !value.startsWith(`${name}@`) || !SEMVER.test(value.slice(name.length + 1))) {
        problems.push(`componentBuildIDs.${key} must be ${name}@major.minor.patch`);
      }
    }
    if (typeof ids.coreUpstream !== "string" || !SEMVER.test(ids.coreUpstream)) {
      problems.push("componentBuildIDs.coreUpstream must be major.minor.patch");
    }
  }

  const capabilities = declaration.capabilities;
  if (checkKeys(problems, "capabilities", capabilities, CAPABILITY_COMPONENTS)) {
    for (const component of CAPABILITY_COMPONENTS) {
      const list = capabilities[component];
      if (!Array.isArray(list) || list.length === 0) {
        problems.push(`capabilities.${component} must be a non-empty array`);
        continue;
      }
      if (new Set(list).size !== list.length) problems.push(`capabilities.${component} has duplicates`);
      if (!list.every((capability) => typeof capability === "string" && CAPABILITY.test(capability))) {
        problems.push(`capabilities.${component} must hold names shaped like toolAuthorizeV1`);
      }
    }
  }

  if (!isCanonicalAbsolute(declaration.sourceHUD) || !declaration.sourceHUD.endsWith("/hud/tui.js")) {
    problems.push("sourceHUD must be a canonical absolute path ending in /hud/tui.js");
  }
  if (declaration.standaloneHUD !== false) {
    problems.push("standaloneHUD must be false: the broker HUD is the only v1 HUD");
  }
  checkTargets(problems, declaration.targets);
  checkRuntimeFields(problems, declaration.requiredRuntimeFields);

  if (problems.length > 0) throw new DelegationConsumersError(problems);
  return declaration;
}

export function validateMaterialized(declaration, manifest) {
  validateDeclaration(declaration);
  if (!isObject(manifest)) throw new DelegationConsumersError(["materialized manifest must be an object"]);
  const problems = [];
  if (manifest.protocol !== declaration.protocol) problems.push(`protocol must be ${declaration.protocol}`);

  const ids = manifest.componentBuildIDs;
  if (checkKeys(problems, "componentBuildIDs", ids, [...Object.keys(declaration.componentBuildIDs), "coreCustom"])) {
    for (const [key, value] of Object.entries(declaration.componentBuildIDs)) {
      if (ids[key] !== value) problems.push(`componentBuildIDs.${key} must be ${value}`);
    }
  }

  const values = {};
  for (const path of REQUIRED_RUNTIME_PATHS) {
    const value = readPath(manifest, path);
    if (value === undefined || value === null || value === "") problems.push(`missing runtime field ${path}`);
    else if (typeof value !== "string" || !RUNTIME_FIELD_REGEX[path].test(value)) problems.push(`malformed runtime field ${path}`);
    else values[path] = value;
  }

  const buildID = values.buildID;
  const coreCustom = values["componentBuildIDs.coreCustom"];
  if (buildID !== undefined && coreCustom !== undefined && coreCustom !== buildID) {
    problems.push("componentBuildIDs.coreCustom must equal buildID");
  }
  if (buildID !== undefined && values.coreCommit !== undefined && !values.coreCommit.startsWith(buildID.slice(BUILD_ID_PREFIX.length))) {
    problems.push("buildID must name an abbreviation of coreCommit");
  }

  if (problems.length > 0) throw new DelegationConsumersError(problems);
  return Object.freeze({
    buildID,
    coreCommit: values.coreCommit,
    guardCommit: values.guardCommit,
    workflowsCommit: values.workflowsCommit,
    brokerCommit: values.brokerCommit,
    devboxCommit: values.devboxCommit,
  });
}

// Capability keys follow core's Component literal; build ID keys follow release.json.
const BUILD_ID_KEY_FOR = Object.freeze({ guard: "guard", workflows: "workflows", broker_hud: "broker" });

// Checks core's `participants --json` rows (ParticipantStatus[]) against the declaration:
// every declared component must have at least one AVAILABLE registration, and every available
// registration must carry the declared build, protocol and capability set. Several Workers share
// one coordination database (one per TUI or server process), and each loads its own plugins, so a
// healthy fleet legitimately lists one row per component per Worker. Unavailable rows are skipped:
// a Worker that predates the upgrade keeps an unavailable row until it is withdrawn, and that row
// grants nothing. Returns the problems instead of throwing so the rollout can print the whole
// drift at once; an invalid declaration still throws.
export function validateParticipants(declaration, participants) {
  validateDeclaration(declaration);
  if (!Array.isArray(participants)) return Object.freeze(["participants must be an array"]);
  const problems = [];
  for (const [component, declared] of Object.entries(declaration.capabilities)) {
    const rows = participants.filter((row) => isObject(row) && row.component === component);
    if (rows.length === 0) {
      problems.push(`participant ${component} is missing`);
      continue;
    }
    const available = rows.filter((row) => row.availability === "available");
    if (available.length === 0) {
      problems.push(`participant ${component} has no available registration`);
      continue;
    }
    const buildID = declaration.componentBuildIDs[BUILD_ID_KEY_FOR[component]];
    const wanted = [...declared].sort();
    for (const row of available) {
      const who = `participant ${component} (worker ${isObject(row.worker) ? row.worker.workerID : "unknown"})`;
      if (row.buildID !== buildID) problems.push(`${who} buildID must be ${buildID}`);
      if (row.protocol !== DELEGATION_PROTOCOL) problems.push(`${who} protocol must be ${DELEGATION_PROTOCOL}`);
      const actual = row.capabilities;
      const matches =
        Array.isArray(actual) &&
        actual.every((capability) => typeof capability === "string") &&
        [...actual].sort().join("\n") === wanted.join("\n");
      if (!matches) problems.push(`${who} capabilities must be exactly ${wanted.join(", ")}`);
    }
  }
  return Object.freeze(problems);
}
```

- [ ] **Step 4: Run the test to verify it now fails on the missing declaration.**

Run from `/home/dev/devbox`: `node --test tests/delegation-consumers.test.mjs`

Expected: FAIL (exit 1) with `ENOENT: no such file or directory, open '/home/dev/devbox/config/opencode/delegation-consumers.json'`. This proves the test reads the tracked file rather than an in-test copy.

- [ ] **Step 5: Write the declaration.**

Create `/home/dev/devbox/config/opencode/delegation-consumers.json` (4-space indent, matching `config/opencode/tui.json`; trailing newline):

```json
{
    "schema": "opencode.delegation-consumers/v1",
    "protocol": "opencode.delegation/v1",
    "componentBuildIDs": {
        "guard": "opencode-guard@1.9.0",
        "workflows": "opencode-agent-workflows@0.15.0",
        "broker": "opencode-broker@1.25.0",
        "coreUpstream": "1.18.22"
    },
    "capabilities": {
        "guard": ["toolAuthorizeV1", "terminalHandoffV1"],
        "workflows": ["registeredBranchV1", "terminalHandoffV1", "foregroundDeliveryV1", "backgroundDeliveryV1"],
        "broker_hud": ["controllerLeaseV1"]
    },
    "sourceHUD": "/home/dev/opencode-broker/hud/tui.js",
    "standaloneHUD": false,
    "targets": {
        "componentsRoot": "/home/dev/.local/lib/opencode-fork/components",
        "guard": "/home/dev/.local/lib/opencode-fork/components/opencode-guard",
        "guardPlugin": "/home/dev/.local/lib/opencode-fork/components/opencode-guard/plugin.js",
        "workflows": "/home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows",
        "workflowsPlugin": "/home/dev/.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js",
        "broker": "/home/dev/.local/lib/opencode-fork/components/opencode-broker",
        "brokerHUD": "/home/dev/.local/lib/opencode-fork/components/opencode-broker/hud/tui.js",
        "tuiPlugins": [
            "file:///home/dev/.local/lib/opencode-fork/components/opencode-broker",
            "file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui"
        ],
        "pluginLinks": {
            "/home/dev/devbox/config/opencode/plugin/opencode-guard.js": "../../../../.local/lib/opencode-fork/components/opencode-guard/plugin.js",
            "/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js": "../../../../.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js"
        }
    },
    "requiredRuntimeFields": [
        {
            "path": "coreCommit",
            "pattern": "^[0-9a-f]{40}$",
            "source": "git -C /home/dev/projects/opencode-delegation rev-parse HEAD (the reviewed Plan 1 HEAD)"
        },
        {
            "path": "buildID",
            "pattern": "^0\\.0\\.0-fork/delegation-v1-[0-9a-f]{12,40}$",
            "source": "0.0.0-fork/delegation-v1-$(git -C /home/dev/projects/opencode-delegation rev-parse --short=12 HEAD), equal to bin/opencode --version of the release"
        },
        {
            "path": "componentBuildIDs.coreCustom",
            "pattern": "^0\\.0\\.0-fork/delegation-v1-[0-9a-f]{12,40}$",
            "source": "equal to buildID"
        },
        {
            "path": "guardCommit",
            "pattern": "^[0-9a-f]{40}$",
            "source": "git -C /home/dev/opencode-guard-plan2 rev-parse HEAD (the reviewed Plan 2 guard commit)"
        },
        {
            "path": "workflowsCommit",
            "pattern": "^[0-9a-f]{40}$",
            "source": "git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD (the reviewed Plan 2 workflows commit)"
        },
        {
            "path": "brokerCommit",
            "pattern": "^[0-9a-f]{40}$",
            "source": "git -C /home/dev/opencode-broker-plan2 rev-parse HEAD (the reviewed Plan 2 broker commit)"
        },
        {
            "path": "devboxCommit",
            "pattern": "^[0-9a-f]{40}$",
            "source": "git -C /home/dev/devbox rev-parse HEAD at release assembly"
        }
    ]
}
```

`brokerHUD` is the immutable counterpart of `sourceHUD`: the release's `components/opencode-broker` is a `git archive` of the broker repo, and the broker's root `package.json` maps `"./tui": "./hud/tui.js"`, which is what the first TUI URL loads. The second TUI URL is the broker's separate model-default TUI package (`tui/package.json`, `"./tui": "./tui.js"`), unchanged by this work.

- [ ] **Step 6: Run the test to verify it passes.**

Run from `/home/dev/devbox`: `node --test tests/delegation-consumers.test.mjs`

Expected: PASS (exit 0), `tests 19`, `pass 19`, `fail 0` (12 named tests + 7 generated missing-field tests).

- [ ] **Step 7: Add the changelog entry.**

In `/home/dev/devbox/CHANGELOG.md`, insert this as the first bullet under the first `### Added` heading inside `## [Unreleased]` (wrap at the file's existing ~100-column width):

```markdown
- **`config/opencode/delegation-consumers.json`, the opencode.delegation/v1 consumer
  compatibility declaration.** It pins the batch (`opencode-guard@1.9.0`,
  `opencode-agent-workflows@0.15.0`, `opencode-broker@1.25.0`, core upstream `1.18.22`; first
  declared as guard 1.8.0, workflows 0.14.0, broker 1.24.0 and renumbered because each of those
  numbers was published independently as a separate release), each
  component's declared capabilities, the broker HUD as the only HUD (`hud/tui.js`, no standalone
  HUD), and the immutable target paths under `~/.local/lib/opencode-fork/components/` that the
  rollout creates. The reviewed core commit, the fork build ID and the consumer commits are not in
  the file: it names them in `requiredRuntimeFields`, and `config/opencode/lib/delegation-consumers.js`
  rejects a release manifest that lacks or malforms any of them. Nothing loads or links the file.
```

- [ ] **Step 8: Run the full devbox suite.**

Run from `/home/dev/devbox`, each separately:

```bash
python3 tests/devbox-jobs.test.py
python3 tests/fleet-router-audit.test.py
node --test tests/*.test.mjs
```

Expected: all three exit 0. Baseline measured 2026-10-01 before this task: `Ran 56 tests ... OK`, `Ran 29 tests ... OK`, node `tests 67 / pass 67 / fail 0`; after this task the node count is `tests 86 / pass 86` (67 + 19). Re-measured 2026-10-08 at `9c552eb`: node `tests 75 / pass 72 / fail 3`, so once the three `tests/superpowers-helpers.test.mjs` failures are fixed outside this plan the expected count is `tests 94 / pass 94` (75 + 19). If a failure is in a file this task did not touch (for example `tests/superpowers-helpers.test.mjs`), STOP and report it to Holden; do not edit, stash, or restore that file.

- [ ] **Step 9: Commit exactly the four files.**

Run from `/home/dev/devbox`:

```bash
git add -- tests/delegation-consumers.test.mjs config/opencode/lib/delegation-consumers.js config/opencode/delegation-consumers.json CHANGELOG.md
git --no-pager diff --cached --name-only
git --no-pager diff --cached --check
git commit -m "Declare the opencode.delegation/v1 consumer compatibility set"
git --no-pager show --stat --format='%H %s' HEAD
```

Expected: `diff --cached --name-only` prints exactly `CHANGELOG.md`, `config/opencode/delegation-consumers.json`, `config/opencode/lib/delegation-consumers.js`, `tests/delegation-consumers.test.mjs`; `--check` prints nothing; the commit contains those four files only. Do not push. Record the printed full commit ID as `DEVBOX_PLAN2_COMMIT`.

---

## Task 2: Full verification gate (no deployment, no commit)

**Files:**
- Read/execute only: `/home/dev/projects/opencode-delegation`, `/home/dev/opencode-guard-plan2`, `/home/dev/opencode-agent-workflows-plan2`, `/home/dev/opencode-broker-plan2`, `/home/dev/devbox`.
- Writes: none to any tracked file. Ignored build/install products only: core `node_modules` and `packages/opencode/dist` (both gitignored in the core repo), guard and broker worktree `node_modules` (gitignored in both repos).

**Interfaces:**
- Consumes: the reviewed Plan 1 core HEAD (Holden supplies it from Plan 1's Task 26 Step 6 review), the HEADs of the three consumer worktrees after the guard, workflows and broker HUD plans (`2026-09-30-fleet-delegation-guard.md`, `2026-09-30-fleet-delegation-workflows.md`, `2026-09-30-fleet-delegation-broker-hud.md`) are complete, `DEVBOX_PLAN2_COMMIT` from Task 1.
- Produces: printed evidence (commit IDs, suite counts, grep results, review verdict). No file, commit, push, link, or service change.

Every block below runs in a fresh `bash` via a quoted heredoc, so `exit` cannot kill the session's shell, variables do not leak between blocks, and the ERR trap names the failing line. A `GATE FAIL` anywhere stops Task 2; fix the cause in the owning task, never by editing a gate pattern.

- [ ] **Step 1: Prerequisites, identities, and cleanliness.**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
export PATH=/home/dev/.bun/bin:$PATH
CORE=/home/dev/projects/opencode-delegation
GUARD=/home/dev/opencode-guard-plan2
WORKFLOWS=/home/dev/opencode-agent-workflows-plan2
BROKER=/home/dev/opencode-broker-plan2
DEVBOX=/home/dev/devbox
for dir in "$CORE" "$GUARD" "$WORKFLOWS" "$BROKER" "$DEVBOX"; do test -d "$dir"; done
test "$(command -v bun)" = /home/dev/.bun/bin/bun
test "$(bun --version)" = 1.3.14
test "$(jq -r .packageManager "$CORE/package.json")" = bun@1.3.14
git -C "$CORE" merge-base --is-ancestor e36bbfbb92e7b673bd1edf3bafadbfe57d22a293 HEAD
git -C "$GUARD" merge-base --is-ancestor 7368c42265c5fcb85f8329545845ec597e37f7b0 HEAD
git -C "$WORKFLOWS" merge-base --is-ancestor 9b1c4c2498fcfc016baf5521119c907d4daac64e HEAD
git -C "$BROKER" merge-base --is-ancestor 309a5748758ef436cf53cfc5369dfef3df51be39 HEAD
git -C "$DEVBOX" merge-base --is-ancestor c5da280d751e65fd5637830921d0aef9b84c1ff8 HEAD
for dir in "$CORE" "$GUARD" "$WORKFLOWS" "$BROKER"; do
  if [ -n "$(git -C "$dir" status --porcelain)" ]; then git -C "$dir" --no-pager status --short >&2; echo "GATE FAIL: dirty $dir" >&2; exit 1; fi
done
test "$(jq -r .version "$GUARD/package.json")" = 1.9.0
test "$(jq -r .version "$WORKFLOWS/package.json")" = 0.15.0
test "$(jq -r .version "$BROKER/package.json")" = 1.25.0
test "$(jq -r '.exports["./tui"]' "$BROKER/package.json")" = ./hud/tui.js
test -f "$GUARD/plugin.js"
test -f "$WORKFLOWS/plugin.js"
test -f "$BROKER/hud/tui.js"
test -f "$GUARD/package-lock.json"
test ! -e "$WORKFLOWS/package-lock.json"
DEVBOX_PLAN2_COMMIT=$(git -C "$DEVBOX" log -1 --format=%H -- config/opencode/delegation-consumers.json)
test -n "$DEVBOX_PLAN2_COMMIT"
(cd "$DEVBOX" && node --input-type=module -e 'import { readFileSync } from "node:fs"; import { validateDeclaration } from "/home/dev/devbox/config/opencode/lib/delegation-consumers.js"; validateDeclaration(JSON.parse(readFileSync("/home/dev/devbox/config/opencode/delegation-consumers.json", "utf8"))); console.log("declaration valid")')
printf 'core      %s\nguard     %s\nworkflows %s\nbroker    %s\ndevbox    %s\n' \
  "$(git -C "$CORE" rev-parse HEAD)" "$(git -C "$GUARD" rev-parse HEAD)" "$(git -C "$WORKFLOWS" rev-parse HEAD)" \
  "$(git -C "$BROKER" rev-parse HEAD)" "$DEVBOX_PLAN2_COMMIT"
echo "STEP 1 PASS"
GATE
```

Expected: `declaration valid`, five full commit IDs, `STEP 1 PASS`. Holden confirms the printed `core` ID equals the HEAD that passed Plan 1's Task 26 Step 6 independent review; if it differs or that review is not PASS, STOP. (Task 26 Step 6 is Plan 1's own review and has no command; the Plan 2 review in Step 9 does not replace it.)

- [ ] **Step 2: Plan 1 Task 26 Steps 1-2 -- focused integration suites, migration and generated checks.**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
export PATH=/home/dev/.bun/bin:$PATH
CORE=/home/dev/projects/opencode-delegation
# Task 26 Step 1: the focused integration suites owned by Tasks 19 and 24 (Plan 1 "Task 26", Step 1).
cd "$CORE/packages/core"
bun test test/delegation-protocol.test.ts
cd "$CORE/packages/opencode"
bun run test:httpapi && bun test test/delegation/protocol.test.ts
# Task 26 Step 2: migration check in its owning package, generation in its owning package.
cd "$CORE/packages/core"
bun run script/migration.ts --check
cd "$CORE/packages/client"
bun run generate
bun run check:generated
# Inspect generated diffs: regenerated output must equal the reviewed commit.
git -C "$CORE" --no-pager diff --stat -- packages/client/src/generated packages/client/src/generated-effect
git -C "$CORE" --no-pager diff --exit-code --quiet -- packages/client/src/generated packages/client/src/generated-effect
echo "STEP 2 PASS"
GATE
```

Expected: every command exits 0, the `--stat` line prints nothing, `STEP 2 PASS`.

- [ ] **Step 3: Plan 1 Task 26 Step 3 -- complete package suites (package-scoped only; never root `bun test`).**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
export PATH=/home/dev/.bun/bin:$PATH
CORE=/home/dev/projects/opencode-delegation
cd "$CORE/packages/schema"
bun test && bun run typecheck
cd "$CORE/packages/plugin"
bun run test && bun run typecheck && bun run build
cd "$CORE/packages/client"
bun run generate && bun run check:generated && bun run test && bun run typecheck
cd "$CORE/packages/core"
bun run script/migration.ts --check && bun run test && bun run typecheck
cd "$CORE/packages/protocol"
bun run typecheck
cd "$CORE/packages/opencode"
bun run test:httpapi && bun run test && bun run typecheck
cd "$CORE/packages/tui"
bun run test && bun run typecheck
echo "STEP 3 PASS"
GATE
```

Expected: every command exits 0; record each package's pass/fail counts from the output; `STEP 3 PASS`.

- [ ] **Step 4: Plan 1 Task 26 Steps 4-5 -- frozen lockfile and the build-ID build.**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
export PATH=/home/dev/.bun/bin:$PATH
CORE=/home/dev/projects/opencode-delegation
cd "$CORE"
# Task 26 Step 4: root-level frozen install only; bun.lock must not change.
bun install --frozen-lockfile
git --no-pager diff --exit-code --quiet -- bun.lock
# Task 26 Step 5: successful build-ID build and exact --version assertion.
OPENCODE_BUILD_ID=plan1-build-test bun run --cwd packages/opencode build --single --skip-install --skip-embed-web-ui
test "$(packages/opencode/dist/opencode-linux-x64/bin/opencode --version)" = plan1-build-test
# Nothing tracked changed across Steps 2-4 (dist/ and node_modules/ are ignored).
if [ -n "$(git status --porcelain)" ]; then git --no-pager status --short >&2; echo "GATE FAIL: core worktree dirtied by the gate" >&2; exit 1; fi
echo "STEP 4 PASS"
GATE
```

Expected: `--version` prints exactly `plan1-build-test`; the worktree stays clean; `STEP 4 PASS`. The `plan1-build-test` binary is a gate artifact only; Plan 3's installer rebuilds with the commit-derived ID.

- [ ] **Step 5: Full guard, workflows, and broker suites from the Plan 2 worktrees.**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
GUARD=/home/dev/opencode-guard-plan2
WORKFLOWS=/home/dev/opencode-agent-workflows-plan2
BROKER=/home/dev/opencode-broker-plan2
# The one skip any suite may report: the broker's conditional sdkAvailable skip in
# tests/session-janitor.test.mjs (test name, then the TAP "# SKIP" reason it passes).
ALLOWED_SKIP='the idle barrier hits the V2 wait route over the host transport # SKIP @opencode-ai/sdk is not installed'
# run_suite NAME: runs `npm test` in the current directory with the TAP reporter forced
# (Node 24 defaults to the spec reporter even when piped, and spec prints no "# skipped"
# line), prints the output, and fails unless the run passes and its single "# skipped N"
# summary is 0 -- or, for the broker only, 1 with ALLOWED_SKIP as the only skipped test.
run_suite() {
  local name=$1 out summaries skipped skips
  if ! out=$(NODE_OPTIONS=--test-reporter=tap npm test 2>&1); then
    printf '%s\n' "$out" >&2; echo "GATE FAIL: $name npm test failed" >&2; exit 1
  fi
  printf '%s\n' "$out"
  summaries=$(grep -cE '^# skipped [0-9]+$' <<<"$out" || true)
  if [ "$summaries" -ne 1 ]; then echo "GATE FAIL: $name printed $summaries '# skipped N' summaries, expected exactly 1" >&2; exit 1; fi
  skipped=$(sed -nE 's/^# skipped ([0-9]+)$/\1/p' <<<"$out")
  skips=$(grep -E '^[[:space:]]*ok [0-9]+ - .* # SKIP' <<<"$out" | sed -E 's/^[[:space:]]*ok [0-9]+ - //' || true)
  echo "$name skipped $skipped"
  if [ "$skipped" -eq 0 ]; then return 0; fi
  if [ "$name" = broker ] && [ "$skipped" -eq 1 ] && [ "$skips" = "$ALLOWED_SKIP" ]; then
    echo "broker: allowed conditional skip ($ALLOWED_SKIP)"; return 0
  fi
  printf 'GATE FAIL: %s skipped %s test(s); skipped lines:\n%s\n' "$name" "$skipped" "$skips" >&2; exit 1
}
cd "$GUARD"
npm ci --no-fund --no-audit --ignore-scripts
run_suite guard
cd "$WORKFLOWS"
run_suite workflows
cd "$BROKER"
# opencode-broker has no lockfile; @opentui/solid (optionalDependencies, pinned 0.4.5) is
# required by hud/tests/hud.test.mjs. --no-package-lock keeps the worktree clean.
npm install --no-fund --no-audit --ignore-scripts --no-package-lock
run_suite broker
for dir in "$GUARD" "$WORKFLOWS" "$BROKER"; do
  if [ -n "$(git -C "$dir" status --porcelain)" ]; then git -C "$dir" --no-pager status --short >&2; echo "GATE FAIL: $dir dirtied by the gate" >&2; exit 1; fi
done
echo "STEP 5 PASS"
GATE
```

Expected: the three `npm test` runs exit 0 (guard runs `node --test tests/*.test.mjs`; workflows `node --test tests/*.mjs`; broker `node --experimental-test-module-mocks --test tests/*.test.mjs gateway/tests/*.test.mjs hud/tests/*.test.mjs`); `guard skipped 0` and `workflows skipped 0`; `broker skipped 0`, or `broker skipped 1` followed by the allowed-skip line naming exactly `the idle barrier hits the V2 wait route over the host transport` (`tests/session-janitor.test.mjs`, `skip: !sdkAvailable && "@opencode-ai/sdk is not installed"`); any other skip, a missing summary, or more than one summary is a gate failure, resolved in the owning task, never by widening `ALLOWED_SKIP`. Record each `# tests/# pass/# fail/# skipped` line; worktrees stay clean; `STEP 5 PASS`. `NODE_OPTIONS=--test-reporter=tap` is inherited by any `node` a test spawns; it is expected to be inert outside `--test` (not verified). Verified on Node 24.16.0: piped default output is spec (`ℹ skipped 1`), and with this variable a two-file run prints TAP with `ok N - <name> # SKIP <reason>` and one `# skipped N` summary. The broker install resolves transitive versions at run time because the repo has no lockfile; record `npm ls --depth=0` output from `$BROKER` in the evidence.

- [ ] **Step 6: Devbox suite.**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
cd /home/dev/devbox
git --no-pager diff --exit-code --quiet HEAD -- tests/delegation-consumers.test.mjs config/opencode/lib/delegation-consumers.js config/opencode/delegation-consumers.json
python3 tests/devbox-jobs.test.py
python3 tests/fleet-router-audit.test.py
node --test tests/*.test.mjs
echo "STEP 6 PASS"
GATE
```

Expected: the Plan 2 devbox files equal their committed bytes; all three suites exit 0 (`56`, `29`, and `86` tests on the 2026-10-01 baseline plus Task 1); `STEP 6 PASS`. A failure in a file Plan 2 did not touch: STOP and report it to Holden.

- [ ] **Step 7: `git --no-pager diff --check` in each repository (working tree and Plan-owned commit range).**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
CORE=/home/dev/projects/opencode-delegation
DEVBOX=/home/dev/devbox
git -C "$CORE" --no-pager diff --check
git -C "$CORE" --no-pager diff --check e36bbfbb92e7b673bd1edf3bafadbfe57d22a293 HEAD
for dir in /home/dev/opencode-guard-plan2 /home/dev/opencode-agent-workflows-plan2 /home/dev/opencode-broker-plan2; do
  base=$(git -C "$dir" merge-base HEAD refs/heads/main)
  git -C "$dir" --no-pager diff --check
  git -C "$dir" --no-pager diff --check "$base" HEAD
done
DEVBOX_PLAN2_COMMIT=$(git -C "$DEVBOX" log -1 --format=%H -- config/opencode/delegation-consumers.json)
git -C "$DEVBOX" --no-pager diff --check "$DEVBOX_PLAN2_COMMIT^" "$DEVBOX_PLAN2_COMMIT"
git -C "$DEVBOX" --no-pager diff --check
echo "STEP 7 PASS"
GATE
```

Expected: no output besides `STEP 7 PASS`. The last command covers devbox's whole working tree, including the unrelated uncommitted files; if it flags one of those, STOP and report the file to Holden (Plan 2 neither fixes nor excludes it).

- [ ] **Step 8: Grep fences -- forbidden core imports, HUD credentials, raw-secret logging, deployment actions and deployment state.**

```bash
bash <<'GATE'
set -euo pipefail
trap 'echo "GATE FAIL at line $LINENO: $BASH_COMMAND" >&2' ERR
GUARD=/home/dev/opencode-guard-plan2
WORKFLOWS=/home/dev/opencode-agent-workflows-plan2
BROKER=/home/dev/opencode-broker-plan2
DEVBOX=/home/dev/devbox
# none CMD...: CMD must run cleanly and find nothing (rg exit 1). A match (0) or an error (2) fails.
none() { local rc=0; "$@" || rc=$?; if [ "$rc" -ne 1 ]; then echo "GATE FAIL (rc=$rc, expected no match): $*" >&2; exit 1; fi; }
PROD=(--hidden --glob '!**/node_modules/**' --glob '!**/.git/**' --glob '!**/docs/**' --glob '!**/tests/**' --glob '!**/*.md')

# 8a. Consumers never import core. Plan 2 Global Constraints also bar @opencode-ai/schema at
# runtime: Plan 3 git-archives the whole repo into the release and installs with
# --omit=dev, so a schema import would either ship undeclared or break at load.
none rg -n "${PROD[@]}" -e '@opencode-ai/core' "$GUARD" "$WORKFLOWS" "$BROKER"
none rg -n -P "${PROD[@]}" -e "(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['\"]@opencode-ai/schema" "$GUARD" "$WORKFLOWS" "$BROKER"

# 8b. The HUD never holds a controller ID or token: whole production HUD tree, then the
# Plan 2 added lines for credential words (the pre-existing "tokens" usage counter and
# provider names are not in the added lines unless Plan 2 rewrote them).
none rg -n -i --glob '!**/tests/**' -e 'controllerID' -e 'controller_id' -e 'controllerToken' -e 'X-OpenCode-Controller-' "$BROKER/hud"
BROKER_BASE=$(git -C "$BROKER" merge-base HEAD refs/heads/main)
HUD_DIFF=$(git -C "$BROKER" --no-pager diff -U0 "$BROKER_BASE" HEAD -- hud ':(exclude,glob)hud/tests/**')
none rg -n -P -i -e '^\+(?!\+\+)(?=.*(?:\btoken\b|\bauthorization\b|\bpassword\b|basic\s*auth|\bcredential))' <<<"$HUD_DIFF"

# 8c/8d. Added production lines in every consumer: no logging or persisting of secret-bearing
# values, and no deployment action.
for dir in "$GUARD" "$WORKFLOWS" "$BROKER"; do
  base=$(git -C "$dir" merge-base HEAD refs/heads/main)
  DIFF=$(git -C "$dir" --no-pager diff -U0 "$base" HEAD -- . ':(exclude,glob)**/tests/**' ':(exclude,glob)docs/**' ':(exclude,glob)**/*.md')
  none rg -n -P -i -e '^\+(?!\+\+)(?=.*(?:console\.(?:log|info|warn|error|debug|trace)|\blogger\.|\blog\s*\(|appendFile|writeFile|std(?:out|err)\.write))(?=.*(?:token|secret|password|passwd|authorization|credential|api[_-]?key|basic|cookie|bearer))' <<<"$DIFF"
  none rg -n -P -e '^\+(?!\+\+).*(?:devbox-sync|fleet-sync|systemctl|\bln\s+-s|install-opencode-fork|opencode-delegation-rollout|allow-canary-root|enable-acquisition|opencode-fork-releases|\.local/lib/opencode-fork)' <<<"$DIFF"
done

# 8e. The devbox Plan 2 commit touches exactly its four files, and nothing loads the declaration.
DEVBOX_PLAN2_COMMIT=$(git -C "$DEVBOX" log -1 --format=%H -- config/opencode/delegation-consumers.json)
test "$(git -C "$DEVBOX" --no-pager diff --name-only "$DEVBOX_PLAN2_COMMIT^" "$DEVBOX_PLAN2_COMMIT" | LC_ALL=C sort | tr '\n' ' ')" = "CHANGELOG.md config/opencode/delegation-consumers.json config/opencode/lib/delegation-consumers.js tests/delegation-consumers.test.mjs "
none rg -n -e 'delegation-consumers' "$DEVBOX/bin" "$DEVBOX/config/opencode/plugin" "$DEVBOX/systemd" "$DEVBOX/config/opencode/opencode.json" "$DEVBOX/config/opencode/tui.json"

# 8f. Deployment state is exactly the pre-Plan-3 state.
test "$(readlink "$DEVBOX/config/opencode/plugin/opencode-guard.js")" = ../../../../opencode-guard/plugin.js
test "$(readlink "$DEVBOX/config/opencode/plugin/opencode-agent-workflows.js")" = ../../../../opencode-agent-workflows/plugin.js
test "$(jq -c .plugin "$DEVBOX/config/opencode/tui.json")" = '["file:///home/dev/opencode-broker","file:///home/dev/opencode-broker/tui"]'
test "$(readlink /home/dev/.config/opencode/plugin/opencode-guard.js)" = /home/dev/fleet-core/config/opencode/plugin/opencode-guard.js
test "$(readlink /home/dev/.config/opencode/plugin/opencode-agent-workflows.js)" = /home/dev/fleet-core/config/opencode/plugin/opencode-agent-workflows.js
test "$(readlink /home/dev/.config/opencode/tui.json)" = /home/dev/fleet-core/config/opencode/tui.json
test ! -e /home/dev/.config/opencode/delegation-consumers.json
test ! -e /home/dev/.local/lib/opencode-fork/components
test ! -e /home/dev/.local/lib/opencode-fork-releases
test ! -e /home/dev/.local/state/opencode-fork
test ! -e /home/dev/.local/state/opencode-delegation-rollout
# The live checkouts the fleet loads today do not contain Plan 2 code, and nothing is pushed.
for pair in /home/dev/opencode-guard:"$GUARD" /home/dev/opencode-agent-workflows:"$WORKFLOWS" /home/dev/opencode-broker:"$BROKER"; do
  live=${pair%%:*}; worktree=${pair#*:}
  head=$(git -C "$worktree" rev-parse HEAD)
  if git -C "$live" merge-base --is-ancestor "$head" HEAD; then echo "GATE FAIL: $live already contains Plan 2 HEAD $head (live code changed)" >&2; exit 1; fi
  test -z "$(git -C "$worktree" branch -r --contains "$head")"
done
test -z "$(git -C "$DEVBOX" branch -r --contains "$DEVBOX_PLAN2_COMMIT")"
echo "STEP 8 PASS"
GATE
```

Expected: `STEP 8 PASS` with no other output. Any hit is a gate failure handed to the Step 9 reviewer with the hit list; it is resolved in the owning task (including rewording a comment that merely names a credential word), never by changing a pattern. Limit, stated plainly: this step proves link, file, ref and push state; it cannot prove that no `systemctl --user restart` happened during Plan 2, because no pre-Plan-2 service timestamp was recorded.

- [ ] **Step 9: Independent security review.**

The executor dispatches a `reviewer` seat that wrote none of Plan 2 (never an implementer of any task in the guard, workflows or broker HUD plans, or of Task 1 of this plan). Before dispatch, the executor runs and pastes into the prompt: `git -C <dir> --no-pager diff --stat "$(git -C <dir> merge-base HEAD refs/heads/main)" HEAD` for each consumer worktree, `git -C /home/dev/devbox --no-pager show --stat <DEVBOX_PLAN2_COMMIT>`, and the Step 1-8 PASS lines and counts. Prompt (first line literal):

```text
INTENT: read
Independent security review of Plan 2 (opencode.delegation/v1 consumer integration).
Read the changed files directly in /home/dev/opencode-guard-plan2, /home/dev/opencode-agent-workflows-plan2,
/home/dev/opencode-broker-plan2 (diff stats below) and the devbox commit (config/opencode/delegation-consumers.json,
config/opencode/lib/delegation-consumers.js, tests/delegation-consumers.test.mjs, CHANGELOG.md).
Contracts: /home/dev/opencode-guard/docs/superpowers/plans/2026-09-30-core-delegation-protocol.md, section
"Plan 1 Authoritative Consumer Interfaces and Commands".
Focus:
1. Hard floors in GOD: tool absence, explicit/immutable agent deny, and static cc-safety-net verdicts still block;
   GOD only converts an effective ask; guard levels on/static/off; off calls markUnavailable then withdrawParticipant.
2. Credential and controller material: the HUD only ever holds the opaque TuiControllerHandle; no controllerID, token,
   Basic Auth, or X-OpenCode-Controller-* value is read, stored, persisted, rendered, or logged; persisted HUD/GOD state
   cannot re-arm without a fresh acquireController.
3. Sanitization: raw question text, tool arguments and pre-sanitized errors never reach logs or durable state;
   delegation.sanitize failure becomes the fixed safe terminal; oversize input is payload_too_large, never truncated.
4. Workflow fencing: currentExecution -> reserveBranch -> bindBranch -> acknowledgeBranch before the child prompt;
   stale Worker/epoch mutations leave state unchanged; background outcomes are durable before the callback returns and
   replay without duplicates; outcome acknowledgement only after the root consumed the result.
5. Broker HUD lease: revoke barrier completes before the HUD persists or shows the new mode; 2 s renew, expiry after
   3 missed beats (6 s); a conflicting second client is an observer and cannot arm.
6. Imports and dependencies: no @opencode-ai/core anywhere in consumer production code; no runtime @opencode-ai/schema
   import; no new undeclared runtime dependency.
7. Declaration: no committed runtime value or sentinel; targets equal Plan 3's release paths and none points at a live
   checkout; the validator cannot be satisfied by inherited properties, empty values, short or uppercase hashes, or a
   build ID naming another commit.
8. No deployment: no link, sync, restart, canary, arming, push, or change to the live checkouts.
Return exactly: PASS or FAIL on the first line, then a markdown table | # | severity | file:line | finding | required fix |
(an empty table for PASS), then the full commit IDs you reviewed.
```

Expected: `PASS` with an empty findings table and the same five commit IDs Step 1 printed. `FAIL` stops Plan 2; fixes go back to the owning task, then Steps 1-9 rerun from Step 1.

- [ ] **Step 10: Do not commit, push, or deploy.**

Task 2 ends with printed evidence only. Confirm with:

```bash
bash <<'GATE'
set -euo pipefail
for dir in /home/dev/projects/opencode-delegation /home/dev/opencode-guard-plan2 /home/dev/opencode-agent-workflows-plan2 /home/dev/opencode-broker-plan2; do
  printf '%s %s %s\n' "$dir" "$(git -C "$dir" rev-parse HEAD)" "$(git -C "$dir" status --porcelain | wc -l)"
done
printf '%s %s\n' /home/dev/devbox "$(git -C /home/dev/devbox log -1 --format=%H -- config/opencode/delegation-consumers.json)"
GATE
```

Expected: the four worktrees show the Step 1 commit IDs and `0` dirty entries; devbox shows `DEVBOX_PLAN2_COMMIT`.
