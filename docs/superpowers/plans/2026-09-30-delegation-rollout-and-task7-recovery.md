# Delegation Rollout and Task 7 Recovery Implementation Plan

> **Rebased 2026-10-08** (series-wide mapping: guard batch -> `opencode-guard@1.8.0`, workflows batch -> `opencode-agent-workflows@0.14.0`, broker unchanged at `opencode-broker@1.24.0`; the index `2026-09-30-fleet-delegation-consumers.md` "Build IDs" line is authoritative):
> - Batch pins in Global Constraints, Review Focus, Task 1 (manifest contract and its two test assertions) and Task 5 (declaration check): `opencode-guard@1.3.0` -> `@1.8.0`, `opencode-agent-workflows@0.13.0` -> `@0.14.0`. They were live, not historical -- Task 1's assertion and Task 5's check compare against the devbox declaration -- but stale: the index moved guard to 1.7.0 on 2026-10-06 (guard had shipped an unrelated 1.3.0), then guard 1.7.0/1.7.1 and workflows 0.13.0-0.13.2 shipped on 2026-10-07/08.
> - Checked, unchanged: this plan cites no existing devbox `bin/` file; it only creates `bin/install-opencode-fork`, `bin/opencode-worker-inventory` and `bin/opencode-delegation-rollout` (none exist yet). The `bin/` commits since 2026-09-30 (`oc-task` in `e53555f`; `notify`, `tmux-*`, `_devbox_cfg.py`, `phone-term-install` earlier) touch nothing it cites. Rollback baselines `7368c42`/`9b1c4c2` (Task 5) are still ancestors of guard/workflows HEAD.
> - DECIDED 2026-10-08 (Holden): Plan 1 base is `2b7eb922fdc59f6560a490e266651c0e01444046` (`2b7eb922f`, branch `fork/snip-always-prefix`) = `e36bbfbb` + the 2026-10-02 shell.ts always-allow-prefix fix; the deployed binary (`0.0.0-fork/snip-always-prefix-202610021248`) is built from it. Global Constraints (runtime identity, new Plan 1 base bullet), Task 2's old-build fixture and Task 5 Step 1 (ancestry assertion) updated. Verified 2026-10-08: `2b7eb922f`'s parent is `e36bbfbb`, `opencode --version` prints the ID above.
> - DECIDED 2026-10-08 (Holden): `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` stays on only for attended tmux TUIs (devbox `e53555f`). This plan sets nothing for systemd Worker units, the plain-SSH / `systemd-run --user` supervisor, the canary harness or `oc-task`; new Global Constraints bullet, Task 6 Step 3 (supervisor `--setenv` forbidden), and new Task 7 Step 1a asserting the flag is absent or `false` in those environments. Cases needing native `background: true` are not part of this canary set.
> - DECIDED 2026-10-08 (Holden): a live agent-team record (`/home/dev/.local/share/opencode/workflow-runs/teams/*/*.json` whose `ownerPID` is alive) means NOT quiescent: the coordinator stops and reports it, never terminates its owner. Task 3 gains a failing test plus `require_no_live_agent_teams` (checked before any state change and again immediately before the first TERM; `plan` records `liveAgentTeams`), and Task 6 Steps 1-4 surface it.
> - DECIDED 2026-10-08 (Holden), index correction 1: consumer commits are resolved from the `-plan2` worktrees (`/home/dev/opencode-guard-plan2`, `/home/dev/opencode-agent-workflows-plan2`, `/home/dev/opencode-broker-plan2`) and archived through each live repo's shared object store; `npm test` runs in the worktrees; the live checkouts stay untouched (Task 5 Steps 1-3a).
> - DECIDED 2026-10-08 (Holden), index correction 2: guard snapshots keep `npm ci --omit=dev --ignore-scripts`; workflows and broker (no lockfile) install with `npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock --no-fund --no-audit` (Task 1 test + Step 5, Task 5 Step 3a). `--omit=peer` keeps workflows' required peer `@opencode-ai/plugin` out of the release (its `lib/tool.js` loads the host copy first, and the live checkout has no `node_modules`); broker still installs its optional `@opentui/solid` 0.4.5, which `hud/tui.js` imports from its own tree.
> - DECIDED 2026-10-08 (Holden), index correction 3: Task 7 reads `MaintenanceIdentity { buildID, protocol, coordinationDomain }`; worker identity comes only from `ParticipantStatus.worker` / `ControllerLeaseStatus` (Task 2 interface note, Task 7 Interfaces).
> - DECIDED 2026-10-08 (Holden), index correction 4: renew/release pass `{ handle, leaseID, authorityEpoch }` through `api.delegation` (Task 7 Interfaces). Index item 5 (`brokerHUD` derived from the broker `git archive` plus its `"./tui": "./hud/tui.js"` export) verified as informational; no change.
> - 2026-10-12: batch renumbered to guard 1.9.0, workflows 0.15.0, broker 1.25.0 because each earlier number was published independently; each consumer branch merged its product's main (merge, not rebase), so the 'HEAD descends from' prerequisites still hold.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and verify an immutable OpenCode delegation-v1 release, stop and replace every old Worker safely, run the delegation canary, and recover the blocked broker Task 7 without deploying an unreviewed or mixed-version runtime.

**Architecture:** A pinned-Bun Python installer assembles a checksummed release from reviewed commits and atomically switches the active directory. A separate Python inventory tool discovers and individually verifies every Worker/TUI, while a Python rollout coordinator performs the operator-interface quiescence barrier, stop-the-world transition, link activation, restart, and rollback evidence collection. The final canary exercises core, guard, workflows, broker HUD, attach security, and durable handoff behavior before general acquisition is enabled; the original broker Task 7 remains owned by its reviewed plan-run.

**Tech Stack:** Python 3 standard library (`argparse`, `dataclasses`, `hashlib`, `json`, `os`, `pathlib`, `sqlite3`, `subprocess`, `time`), Node.js built-in test runner, Bun `1.3.14` at `/home/dev/.bun/bin/bun`, Linux `/proc`, user systemd, `renameat2(RENAME_EXCHANGE)`, SQLite backup API, OpenCode delegation operator APIs, and shell/systemd commands executed only from a plain SSH/shell supervisor.

**Spec:** `/home/dev/opencode-guard/docs/superpowers/specs/2026-09-30-core-delegation-authority-design.md`

## Global Constraints

- The deployed OpenCode runtime is Holden's existing fork at `/home/dev/projects/opencode`, built from upstream v1.18.22 on branch `fork/snip-always-prefix` at `2b7eb922fdc59f6560a490e266651c0e01444046` (`fork/atomic-runtime-contracts` head `e36bbfbb92e7b673bd1edf3bafadbfe57d22a293` plus the 2026-10-02 shell.ts always-allow-prefix fix). The deployed binary identifies itself as `0.0.0-fork/snip-always-prefix-202610021248`. This design extends that fork. It does not create a second fork or replace it with the npm runtime.
- Plan 1's base is `2b7eb922fdc59f6560a490e266651c0e01444046`, not `e36bbfbb`: a release built from a worktree that lacks `2b7eb922f` would silently drop the deployed shell.ts fix. Task 5 Step 1 stops unless `2b7eb922f` is an ancestor of the reviewed Plan 1 HEAD.
- `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` is on only in attended tmux TUIs (the tmux server's global environment, devbox `e53555f`). This plan never sets it -- not in systemd Worker units or drop-ins, not on the `systemd-run --user` supervisor (no `--setenv`/`-E`), not in the canary harness, not for `oc-task` (which forces `false`) -- and Task 7 Step 1a asserts it is absent or `false` in each of those environments. The fork's task tool refuses native `background: true` without it (`packages/opencode/src/tool/task.ts:97-101`); the `background-handoff` canary registers its child through branch APIs and does not depend on it.
- Implementation of this protocol must use an isolated worktree and must not stage, stash, rewrite, or absorb unrelated `AgentNotFoundError` work in the main core checkout.
- The deployed permission-mode UI is `opencode-broker/hud/tui.js`, loaded by `/home/dev/.config/opencode/tui.json`. The standalone `opencode-hud` checkout is not a deployment target for this change.
- Protocol identity is `opencode.delegation/v1`; package semver alone is not a protocol identity. The fork uses a custom build ID supplied at runtime by Plan 1.
- GOD cannot arm unless the execution-owning core Worker, its loaded guard, and the controlling broker HUD agree on protocol v1. Every existing nonterminal descendant branch must also have an acknowledged v1 owner; a legacy, unregistered, or mismatched active child blocks acquisition. Unknown, missing, or conflicting protocol data fails closed.
- One exclusive controlling client owns GOD authority for a root session.
- A live GOD root authorizes otherwise-promptable command/tool operations for registered descendants.
- Explicit agent/tool denies, capability envelopes, read-only restrictions, credential exfiltration controls, stale-turn protection, and other hard floors remain effective.
- Only the primary agent may present a genuine requirements or design question to Holden.
- Delegated permission and question interactions never enter user-visible pending state.
- A child that needs primary input ends with a terminal typed handoff. After answering, the primary redispatches a continuation; v1 does not suspend children.
- Clean F9/exit revocation is synchronous. Crash or silent-partition authority expires after three missed two-second heartbeats, for a six-second maximum lease window.
- Initial compatibility batch: delegation controller acquire, renew, release, and outcome lookup require a Node listener actually bound to numeric `127.0.0.1` or `::1`; SSH tunnelling to that listener is allowed. Remote HTTPS and reverse-proxy forwarding are future gated work and fail closed as `insecure_transport`; forwarded/Host/Origin headers never grant transport trust.
- This protocol does not allow multiple simultaneous GOD controllers for one root.
- It does not preserve a blocked child's model context while waiting for an answer.
- It does not authorize plaintext remote attach.
- It does not bypass explicit denies or make unavailable tools appear.
- It does not use mode files, environment variables, query tokens, or child-readable files as authority.
- It does not promise that F9 cancels a command whose execution admission committed before revocation. It fences subsequent admission.
- Core owns all authority and branch state in its shared SQLite database. Writes use `BEGIN IMMEDIATE`, generation checks, and unique constraints for cross-Worker fencing.
- Every operation validates Worker epoch and branch fencing token.
- A child prompt cannot start before its branch reaches `acknowledged`.
- Any prompt or execution request for an API-created child without a registered branch fails admission before model execution with a direct `DelegationAdmissionError { code: "unregistered_branch", sessionID }`. It creates no terminal outcome, pending permission/question, or user-facing event.
- Core never persists raw tool arguments or arbitrary error objects. It constructs a schema-allowlisted candidate payload, enforces structural/byte bounds, and passes the candidate through a mandatory trusted `delegation.sanitize` hook before opening the outcome transaction.
- Logs contain IDs, kinds, sizes, and state transitions only. They do not contain raw question text, command arguments, controller tokens, Basic Auth, or pre-sanitized errors.
- Guard `on`: classifier and static hard floors are available; live GOD bypasses prompt/risk classification but retains immutable floors and sanitization.
- Guard `static`: static hard floors and sanitization remain; live GOD bypasses prompt/risk classification without an LLM classifier.
- Guard `off`: guard authorization and sanitizer participants are absent. GOD acquisition is disabled, delegated asks fail closed, and HUD displays GOD unavailable.
- The old `off` promise of “nothing from opencode-guard” remains literal; core does not pretend its delegation protocol can provide guard redaction in that state. The old file-derived GOD shortcut and early-return redaction bypass are removed.
- Maximum 8 questions per handoff.
- Maximum 16 options per question.
- Header: 128 UTF-8 bytes.
- Question text: 4096 bytes.
- Option label: 256 bytes.
- Option description: 1024 bytes.
- Custom answer: 16 KiB.
- Total serialized outcome: 64 KiB.
- Branch path: maximum 16 entries.
- Oversize input becomes a typed `payload_too_large` terminal outcome. Content is not silently truncated into a misleading prompt. Existing credential redaction applies before model-visible delivery.
- `on/static/off` are the only guard levels consumed by this plan.
- The release is an immutable compatibility set: core fork, guard, agent-workflows, broker HUD, plugin API/schema versions, and deployment links.
- Coordinated compatibility batch IDs are protocol `opencode.delegation/v1`, guard `opencode-guard@1.9.0`, workflows `opencode-agent-workflows@0.15.0`, broker HUD `opencode-broker@1.25.0`, and core upstream package version 1.18.22 with the immutable fork build ID supplied at runtime by Plan 1.
- Do not change the `@opencode-ai/plugin` runtime floor from 1.18.22 until the fork package is versioned separately.
- The deployed owner is `/home/dev/opencode-broker/hud/tui.js`; do not create or modify a standalone `opencode-hud` deployment.
- Plan 2 does not perform Plan 3’s maintenance rollout/restarts/canary. It does not run `devbox-sync`, restart or stop Workers, arm GOD, activate links, perform rollout, or run the canary.
- opencode-broker and devbox had unrelated changes observed during planning; implementers must not stage, stash, or rewrite them.
- `/home/dev/fleet-core` is a symlink to `/home/dev/devbox`; both `git -C` roots resolve to `/home/dev/devbox`, so it is not a separate repository or push target.
- The pre-Plan rollback baselines are guard `7368c42265c5fcb85f8329545845ec597e37f7b0`, workflows `9b1c4c2498fcfc016baf5521119c907d4daac64e`, broker `309a5748758ef436cf53cfc5369dfef3df51be39`, and devbox/fleet-core alias `c5da280d751e65fd5637830921d0aef9b84c1ff8`.
- Rollback assembly verifies that each baseline commit still exists and is an ancestor of the corresponding reviewed release commit. It ignores dirty working-tree bytes; broker and devbox dirty changes are never snapshot as rollback content and are never staged, stashed, or rewritten.

1. Tool absence and explicit deny from the selected agent's own configuration are immutable hard floors.
2. Built-in default denies remain overrideable by the selected agent exactly as today; they are not mislabeled immutable.
3. Deprecated `tools` entries retain the provenance of the configuration scope that supplied them.
4. Remaining rules preserve their stack's documented ordering and last-match behavior.
5. Session/user allow cannot override an immutable agent/tool deny.
6. Live-root GOD may convert only an effective `ask` into one-time allow.

- `/home/dev/.bun/bin/bun` is the only accepted Bun executable and must report `1.3.14`; the root `packageManager` must be `bun@1.3.14`.
- Fixed release root is `/home/dev/.local/lib/opencode-fork-releases`; fixed active path is `/home/dev/.local/lib/opencode-fork`; fixed installer state root is `/home/dev/.local/state/opencode-fork`.
- Plan 1 and Plan 2 independent reviews and reviewed commits are a hard gate; resolve them dynamically and stop if either review is incomplete.
- No live direct SQL is permitted; all delegation control uses the exact reviewed Plan 1 operator CLI.
- Never use broad kills, hardcoded PIDs, process-name loops, or automatic `KILL`/`SIGKILL`.
- Holden must confirm the inventory SHA-256 and exact identity tuples before termination.
- Apply runs under a plain-shell supervisor, never an OpenCode Worker.
- General GOD acquisition remains disabled until every canary passes; the stop-the-world deployment itself necessarily precedes the runtime canary.
- The compatibility batches are guard `opencode-guard@1.9.0`, workflows `opencode-agent-workflows@0.15.0`, broker HUD `opencode-broker@1.25.0`, and core upstream 1.18.22 plus the custom build ID resolved from the reviewed Plan 1 handoff/binary.

## Review Focus

- wrong Bun/source commit/dirty source or wrong actual build output fails before release creation; owned by Task 1 installer tests and Task 5 offline release check.
- first migration where active path is a real directory plus interrupted atomic exchange preserves recoverable checksummed rollback; owned by Task 1 exchange/recovery tests and Task 5 installer evidence.
- incomplete process sources/PID reuse/changed executable make inventory or exact-PID termination fail closed; owned by Task 2 inventory tests and Task 6 confirmation/apply check.
- mixed protocol/build/domain or any old executable inode keeps acquisition disabled; owned by Task 3 barrier tests and Task 7 runtime protocol/build/domain check.
- plaintext, remote HTTPS, and forwarded-header spoof refusal; missing Basic Auth refusal; positive SSH-loopback acceptance; and three missed 2s heartbeats/6s expiry; owned by Task 7 attach and lease canary cases. `attach-https` remains a required negative canary until future gated remote-HTTPS work replaces it.

---

### Task 1: TDD immutable installer

**Files:**
- Create: `/home/dev/devbox/bin/install-opencode-fork`
- Test: `/home/dev/devbox/tests/install-opencode-fork.test.mjs`

**Interfaces:**
- Consumes: explicit `--guard-repo PATH`, `--workflows-repo PATH`, `--broker-repo PATH`, and `--devbox-repo PATH`, each paired with its commit, plus `--worktree PATH` and `--core-commit COMMIT`. The installer validates `/home/dev/fleet-core` with `realpath`, confirms it equals `/home/dev/devbox`, and confirms one Git toplevel. It computes `OPENCODE_BUILD_ID` from the reviewed worktree HEAD: `"0.0.0-fork/delegation-v1-$(git -C "$WORKTREE" rev-parse --short=12 HEAD)"`. It passes this only as a subprocess environment variable to the pinned Bun build, and rejects any built binary whose `--version` differs. The buildID is an immutable commit identifier. Task 5 must compute the expected ID from reviewed HEAD, not read a handoff file.
- Produces: Python 3 subcommands `build`, `previous-release`, `verify`, `activate`, `rollback`, and `recover`; exit code `0` on a completed operation and nonzero on every validation, hash, source, output, exchange, or journal failure.
- `verify`, `activate`, and `rollback` all consume `--release PATH`; `verified_release`, activation, rollback, and every later installer command use the release path from evidence, never `$RELEASE_KEY` as a build ID. Production always invokes `/home/dev/.bun/bin/bun`; tests use `runpy.run_path(..., run_name="install_opencode_fork_test")` and call `require_pinned_bun(fake_path)` directly after injecting a fake executable.
- Produces release layout `/home/dev/.local/lib/opencode-fork-releases/$RELEASE_KEY/` containing `bin/opencode`, `components/opencode-guard`, `components/opencode-agent-workflows`, `components/opencode-broker`, `release.json`, and `SHA256SUMS`.
- Produces manifest fields `schema`, `buildID`, `componentBuildIDs`, `protocol`, `coreCommit`, `guardCommit`, `workflowsCommit`, `brokerCommit`, `devboxCommit`, `deploymentAliases`, `binaryPath`, `binarySHA256`, `files`, and `buildCommand`; `deploymentAliases` is `{ "/home/dev/fleet-core": "/home/dev/devbox" }`. `componentBuildIDs` asserts guard `opencode-guard@1.9.0`, workflows `opencode-agent-workflows@0.15.0`, broker HUD `opencode-broker@1.25.0`, and core upstream `1.18.22` with the reviewed Plan 1 custom build ID computed from worktree HEAD. The installer cannot pass review without this build contract and the exact maintenance CLI contract; Plan 3 has no fallback. Task 5 must compute the expected ID from reviewed HEAD.
- Produces atomic journal records `{ "phase": "prepared|journaled|exchanged|relocated|complete", "buildID": string, "activePath": string, "previousPath": string|null, "oldDirectorySHA256": string|null }`.

- [ ] **Step 1: Write failing tests for pinned toolchain and source provenance.**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);

test('build rejects dirty or mismatched source and accepts only pinned Bun', async () => {
  const root = await mkdtemp('/tmp/install-opencode-fork-');
  await mkdir(join(root, 'worktree'), { recursive: true });
  await writeFile(join(root, 'fake-bun'), '#!/bin/sh\nprintf "1.3.13\\n"\n');
  await chmod(join(root, 'fake-bun'), 0o755);
  const result = await run('python3', ['-c', `import runpy; ns = runpy.run_path('/home/dev/devbox/bin/install-opencode-fork', run_name='install_opencode_fork_test'); ns['require_pinned_bun'](__import__('pathlib').Path(${JSON.stringify(join(root, 'fake-bun'))}))`], { reject: false });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Bun 1\.3\.14/);
});
```

- [ ] **Step 2: Run the focused failing test and record the expected refusal.**

Run: `node --test /home/dev/devbox/tests/install-opencode-fork.test.mjs`

Expected: FAIL because `install-opencode-fork` does not yet implement the pinned-Bun/source validation and the stderr includes `Bun 1.3.14`.

- [ ] **Step 3: Implement explicit source and toolchain validation.**

```python
PINNED_BUN = Path('/home/dev/.bun/bin/bun')
PINNED_VERSION = '1.3.14'

def require_pinned_bun(path: Path) -> None:
    if path != PINNED_BUN:
        raise InstallError(f'Bun must be {PINNED_BUN}')
    result = subprocess.run([str(path), '--version'], text=True, capture_output=True, check=False)
    if result.returncode != 0 or result.stdout.strip() != PINNED_VERSION:
        raise InstallError(f'Bun 1.3.14 required, got {result.stdout.strip()!r}')

def require_clean_reviewed_worktree(worktree: Path, expected_commit: str) -> str:
    if not worktree.is_dir():
        raise InstallError(f'missing isolated worktree: {worktree}')
    status = git(worktree, 'status', '--porcelain')
    if status:
        raise InstallError(f'dirty isolated worktree: {worktree}')
    actual = git(worktree, 'rev-parse', 'HEAD')
    if actual != expected_commit:
        raise InstallError(f'core HEAD {actual} does not equal reviewed commit {expected_commit}')
    return actual
```

- [ ] **Step 4: Write failing tests for archive snapshots, output identity, and release schema.**

```js
test('build rejects missing actual Linux x64 output and never creates a release', async () => {
  const root = await makeFixture({ bunVersion: '1.3.14', buildOutput: false });
  const result = await invokeBuild(root);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /opencode-linux-x64/);
  assert.equal(await exists(join(root.releaseRoot, 'test-build')), false);
});

test('manifest pins commits, protocol, component build IDs, binary hash, and exact build command', async () => {
  const root = await makeFixture({ bunVersion: '1.3.14', buildOutput: true });
  assert.equal((await invokeBuild(root)).code, 0);
  const manifest = JSON.parse(await readFile(join(root.release, 'release.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['binaryPath', 'binarySHA256', 'buildCommand', 'buildID', 'brokerCommit', 'componentBuildIDs', 'coreCommit', 'deploymentAliases', 'devboxCommit', 'files', 'guardCommit', 'protocol', 'schema', 'workflowsCommit'].sort());
  assert.deepEqual(manifest.deploymentAliases, { '/home/dev/fleet-core': '/home/dev/devbox' });
  assert.deepEqual(manifest.componentBuildIDs, { guard: 'opencode-guard@1.9.0', workflows: 'opencode-agent-workflows@0.15.0', broker: 'opencode-broker@1.25.0', coreUpstream: '1.18.22', coreCustom: manifest.buildID });
  assert.equal(manifest.protocol, 'opencode.delegation/v1');
  assert.equal(manifest.buildCommand, '/home/dev/.bun/bin/bun run --cwd packages/opencode build --single --skip-install');
});

test('build rejects a wrong binary --version and wrong component build IDs', async () => {
  await assertBuildFailure({ binaryVersion: 'unexpected-build', expectedBuildID: 'reviewed-build' });
  await assertBuildFailure({ componentBuildIDs: { guard: 'wrong', workflows: 'opencode-agent-workflows@0.15.0', broker: 'opencode-broker@1.25.0' } });
});

test('build refuses snapshot dependency install failure and preserves the executable bit', async () => {
  await assertBuildFailure({ npmCiExit: 1 });
  const root = await makeFixture({ bunVersion: '1.3.14', buildOutput: true });
  assert.equal((await invokeBuild(root)).code, 0);
  assert.equal((await stat(join(root.release, 'bin/opencode'))).mode & 0o111, 0o111);
});

// opencode-guard commits package-lock.json; opencode-agent-workflows and opencode-broker do not
// (broker gitignores it), and `npm ci` refuses to run without one. The policy is fixed per
// component and a snapshot that contradicts it fails loudly instead of switching installer.
test('snapshot installs use npm ci only for the locked guard and a peer-free npm install for lockless components', async () => {
  const lockless = ['install', '--omit=dev', '--omit=peer', '--ignore-scripts', '--no-package-lock', '--no-fund', '--no-audit'];
  const root = await makeFixture({ bunVersion: '1.3.14', buildOutput: true, recordNpmArgv: true });
  assert.equal((await invokeBuild(root)).code, 0);
  assert.deepEqual(await root.npmCalls(), [
    { cwd: 'components/opencode-guard', argv: ['ci', '--omit=dev', '--ignore-scripts'] },
    { cwd: 'components/opencode-agent-workflows', argv: lockless },
    { cwd: 'components/opencode-broker', argv: lockless },
  ]);
  await assertBuildFailure({ guardLockfile: false, stderr: /opencode-guard snapshot has no package-lock\.json/ });
  await assertBuildFailure({ workflowsLockfile: true, stderr: /opencode-agent-workflows snapshot now ships package-lock\.json/ });
  await assertBuildFailure({ installedPeer: 'components/opencode-agent-workflows/node_modules/@opencode-ai/plugin', stderr: /peer dependency installed/ });
});

test('build refuses symlink/path escape and creates a complete previous compatibility release', async () => {
  await assertBuildFailure({ archiveSymlinkEscape: true });
  const root = await makeFixture({ deployedBinary: true, reviewedConsumerSnapshots: true });
  assert.equal((await invokeBuildPrevious(root)).code, 0);
  assert.ok(await exists(join(root.previousRelease, 'release.json')));
  assert.ok(await exists(join(root.previousRelease, 'SHA256SUMS')));
});
```

- [ ] **Step 5: Implement deterministic archive assembly and binary smoke verification.**

```python
BUILD_COMMAND = ['/home/dev/.bun/bin/bun', 'run', '--cwd', 'packages/opencode', 'build', '--single', '--skip-install']
OUTPUT = Path('packages/opencode/dist/opencode-linux-x64/bin/opencode')

def build_release(args: argparse.Namespace) -> Path:
    require_pinned_bun(Path('/home/dev/.bun/bin/bun'))
    core = require_clean_reviewed_worktree(Path(args.worktree), args.core_commit)
    # Compute OPENCODE_BUILD_ID from reviewed HEAD as immutable identifier
    opencode_build_id = f"0.0.0-fork/delegation-v1-{git('rev-parse', '--short=12', 'HEAD', cwd=args.worktree).strip()}"
    subprocess.run(['/home/dev/.bun/bin/bun', 'install', '--frozen-lockfile'], cwd=args.worktree, check=True, env={**os.environ, 'OPENCODE_BUILD_ID': opencode_build_id})
    subprocess.run(BUILD_COMMAND, cwd=args.worktree, check=True, env={**os.environ, 'OPENCODE_BUILD_ID': opencode_build_id})
    binary = Path(args.worktree) / OUTPUT
    if not binary.is_file():
        raise InstallError(f'missing actual build output: {binary}')
    version = subprocess.run([str(binary), '--version'], text=True, capture_output=True, check=False)
    actual_build_id = version.stdout.strip()
    if version.returncode != 0 or not actual_build_id:
        raise InstallError('built binary --version smoke test failed')
    if actual_build_id != opencode_build_id:
        raise InstallError(f'built binary build ID {actual_build_id!r} differs from computed OPENCODE_BUILD_ID')
    release = release_dir(url_encode_release_directory(opencode_build_id))
    snapshot_git_archive(args.guard_repo, args.guard_commit, release / 'components/opencode-guard')
    snapshot_git_archive(args.workflows_repo, args.workflows_commit, release / 'components/opencode-agent-workflows')
    snapshot_git_archive(args.broker_repo, args.broker_commit, release / 'components/opencode-broker')
    for snapshot in ('opencode-guard', 'opencode-agent-workflows', 'opencode-broker'):
        install_snapshot_dependencies(release / 'components' / snapshot, snapshot)
    shutil.copy2(binary, release / 'bin/opencode')
    write_release_files(release, manifest_for(args, core, opencode_build_id))
    return release

LOCKED_SNAPSHOTS = ('opencode-guard',)
LOCKLESS_SNAPSHOTS = ('opencode-agent-workflows', 'opencode-broker')
NPM_CI = ['npm', 'ci', '--omit=dev', '--ignore-scripts']
# No lockfile: resolve from the registry once, at build time; SHA256SUMS then freezes the result.
# --omit=peer keeps workflows' required peer @opencode-ai/plugin out of the release (lib/tool.js
# loads the host's copy first; the live checkout has no node_modules). Broker's optional
# @opentui/solid 0.4.5 is still installed: hud/tui.js imports it from its own tree.
NPM_INSTALL_LOCKLESS = ['npm', 'install', '--omit=dev', '--omit=peer', '--ignore-scripts',
                        '--no-package-lock', '--no-fund', '--no-audit']

def install_snapshot_dependencies(snapshot: Path, name: str) -> None:
    has_lock = (snapshot / 'package-lock.json').is_file()
    if name in LOCKED_SNAPSHOTS:
        if not has_lock:
            raise InstallError(f'{name} snapshot has no package-lock.json; npm ci is required')
        argv = NPM_CI
    elif name in LOCKLESS_SNAPSHOTS:
        if has_lock:
            raise InstallError(f'{name} snapshot now ships package-lock.json; change its install policy to npm ci')
        argv = NPM_INSTALL_LOCKLESS
    else:
        raise InstallError(f'no dependency install policy for snapshot {name}')
    subprocess.run(argv, cwd=snapshot, check=True)
    if name in LOCKLESS_SNAPSHOTS and (snapshot / 'node_modules' / '@opencode-ai' / 'plugin').exists():
        raise InstallError(f'{name}: peer dependency installed despite --omit=peer')
```

The manifest key set is unchanged (the devbox declaration validator checks it exactly); the install argv is not a manifest field. `previous-release` uses the same `install_snapshot_dependencies` for its baseline snapshots (guard `7368c42` has `package-lock.json`; workflows `9b1c4c2` and broker `309a574` do not -- verified 2026-10-08).

- [ ] **Step 6: Run the installer tests and verify all build assertions pass.**

Run: `node --test /home/dev/devbox/tests/install-opencode-fork.test.mjs`

Expected: PASS for pinned Bun, dirty/mismatched source refusal, missing/wrong output refusal, archive snapshots, the per-component snapshot install policy (`npm ci` for guard, peer-free `npm install` for workflows and broker, loud failure on a contradicting lockfile or an installed peer), binary `--version`, manifest schema, and deterministic file hashes.

- [ ] **Step 7: Write failing tests for deterministic hashes, atomic manifest writing, and immutable permissions.**

```js
test('verify refuses a tampered release file and accepts an untouched release', async () => {
  const root = await makeFixture({ bunVersion: '1.3.14', buildOutput: true });
  assert.equal((await invokeBuild(root)).code, 0);
  assert.equal((await invokeVerify(root)).code, 0);
  await appendFile(join(root.release, 'bin/opencode'), 'tamper');
  const result = await invokeVerify(root);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /SHA256SUMS|hash mismatch/);
});

test('manifest replacement is atomic and release files are not writable', async () => {
  const root = await makeFixture({ bunVersion: '1.3.14', buildOutput: true });
  assert.equal((await invokeBuild(root)).code, 0);
  const mode = (await stat(join(root.release, 'release.json'))).mode & 0o222;
  assert.equal(mode, 0);
});
```

- [ ] **Step 8: Implement sorted hashing, atomic JSON replacement, and immutable release permissions.**

```python
def sha256_files(root: Path) -> dict[str, str]:
    return hash_opened_regular_files_without_symlink_traversal(root, excluded={'SHA256SUMS', 'release.json'})

def atomic_json(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_name(f'.{path.name}.tmp-{os.getpid()}')
    temporary.write_text(json.dumps(value, sort_keys=True, separators=(',', ':')) + '\n')
    os.replace(temporary, path)

def make_immutable(root: Path) -> None:
    for path in root.rglob('*'):
        os.chmod(path, 0o555 if path.is_dir() else (0o555 if path == root / 'bin' / 'opencode' else 0o444))
```

- [ ] **Step 9: Write failing tests for first activation, interrupted exchange recovery, and rollback checksums.**

```js
test('first activation exchanges a real directory and preserves a checksummed previous release', async () => {
  const root = await makeFixture({ activeIsDirectory: true, buildOutput: true });
  assert.equal((await invokeBuild(root)).code, 0);
  assert.equal((await invokeActivate(root)).code, 0);
  assert.equal((await lstat(root.active)).isSymbolicLink(), true);
  const state = JSON.parse(await readFile(root.state, 'utf8'));
  assert.equal(state.previousRelease.sha256.length, 64);
});

test('recovery completes an exchange journal without deleting the old directory', async () => {
  const root = await makeFixture({ activeIsDirectory: true, interruptedAfter: 'exchanged' });
  const result = await invokeRecover(root);
  assert.equal(result.code, 0);
  assert.equal((await invokeVerifyPrevious(root)).code, 0);
});

test('rollback refuses a changed previous release', async () => {
  const root = await makeFixture({ activeIsDirectory: true, buildOutput: true });
  await invokeBuild(root); await invokeActivate(root);
  await appendFile(root.previousBinary, 'tamper');
  const result = await invokeRollback(root);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /previous release hash/);
});
```

- [ ] **Step 10: Implement journaled exchange and same-directory subsequent switching.**

```python
RENAME_EXCHANGE = 0x2

def first_exchange(active: Path, prepared_link: Path) -> None:
    if not active.is_dir() or active.is_symlink():
        raise InstallError('first activation requires active path to be a real directory')
    if active.stat().st_dev != prepared_link.parent.stat().st_dev:
        raise InstallError('atomic exchange paths cross filesystems')
    libc = ctypes.CDLL(None, use_errno=True)
    if active.parent != prepared_link.parent:
        raise InstallError('atomic exchange paths do not share a parent')
    if libc.renameat2(-100, os.fsencode(active), -100, os.fsencode(prepared_link), RENAME_EXCHANGE) != 0:
        error = ctypes.get_errno()
        raise InstallError(f'renameat2 exchange unavailable: {os.strerror(error)}')

def activate(args: argparse.Namespace) -> None:
    release = verified_release(args.release)
    journal_and_fsync('journaled', release)
    prepared = make_prepared_symlink(release)
    if active_path().is_dir() and not active_path().is_symlink():
        first_exchange(active_path(), prepared)
        journal_and_fsync('exchanged', release)
        relocate_old_directory_to_checksummed_legacy_path(release)
    else:
        os.replace(prepared, active_path())
        fsync_parent(active_path())
    checksum_previous_release()
    journal_and_fsync('complete', release)

def recover_every_phase_idempotently() -> None:
    journal = read_journal()
    phase = journal['phase']
    if phase == 'prepared':
        if is_unexchanged_temp_link(journal['activePath']):
            unlink_only_unexchanged_temp_link(journal['activePath'])
        fsync_parent(Path(journal['activePath']))
    elif phase == 'journaled':
        check_active_and_temp_identities(journal)
        if identities_are_exchangeable(journal):
            exchange_and_fsync(journal)
        else:
            raise InstallError('journaled recovery identity mismatch; stopped without deletion')
    elif phase == 'exchanged':
        old_directory = relocate_old_directory_and_verify_hash(journal)
        verify_release_hash(old_directory, journal['oldDirectorySHA256'])
        fsync_parent(old_directory)
        fsync_state_directory()
    elif phase == 'relocated':
        write_installer_state_and_fsync(journal)
        fsync_parent(Path(journal['activePath']))
        fsync_state_directory()
    elif phase == 'complete':
        verify_installer_state(journal)
        verify_release_hash(Path(journal['activePath']), journal['buildID'])
        verify_release_hash(Path(journal['previousPath']), journal['oldDirectorySHA256'])
        fsync_state_directory()
    else:
        raise InstallError(f'unknown journal phase: {phase}')
```

- [ ] **Step 11: Run the complete installer test file.**

Run: `node --test /home/dev/devbox/tests/install-opencode-fork.test.mjs`

Expected: PASS with explicit coverage for build, verify, activate, rollback, recover, fake Bun refusal, dirty/mismatched source, wrong output, deterministic hashes, real-directory exchange, interrupted journal recovery, tamper refusal, and checksum-protected rollback.

- [ ] **Step 12: Commit the installer and tests.**

```bash
cd /home/dev/devbox
git add bin/install-opencode-fork tests/install-opencode-fork.test.mjs
git commit -m "feat: add immutable OpenCode fork installer"
```

Expected: one intended commit in `/home/dev/devbox`; no other paths staged.

### Task 2: TDD external inventory and exact-PID stop

**Files:**
- Create: `/home/dev/devbox/bin/opencode-worker-inventory`
- Test: `/home/dev/devbox/tests/opencode-worker-inventory.test.mjs`

**Interfaces:**
- Consumes: `/proc`, `systemctl --user show`, read-only OpenCode session/participant status produced through the reviewed core operator interface, and an output path.
- Produces: `scan`, `verify-empty`, `verify-no-old`, and `terminate` subcommands; JSON source entries `{ "name": string, "ok": boolean, "error": string|null, "records": object[] }`.
- Produces records `{ "pid": int, "ppid": int, "startTimeTicks": int, "exe": { "path": string, "device": int, "inode": int, "sha256": string }, "argv": string[], "cwd": string, "role": string, "unit": string|null, "sessionIDs": string[], "listenerEndpoints": string[], "sourceList": string[], "participant": { "workerID": string, "workerEpoch": string, "component": string, "buildID": string, "protocol": string, "coordinationDomain": string }|null, "classification": "old"|"new"|"unknown" }`.
- The inventory record's `participant` object is this tool's own flattened output, not a Plan 1 shape. Its `workerID`/`workerEpoch` are copied from Plan 1 `ParticipantStatus.worker.workerID`/`.workerEpoch` (`participants --json` -> `{ participants: ParticipantStatus[] }`); `component`, `buildID`, `protocol` and `coordinationDomain` come from the same `ParticipantStatus`. The adapter never reads flat `workerID`/`workerEpoch` fields from `ParticipantStatus` and never takes worker identity from `MaintenanceIdentity` (`{ buildID, protocol, coordinationDomain }` only).
- `terminate` accepts `--inventory FILE --inventory-sha256 HASH --pid PID --start-time-ticks N --exe-device N --exe-inode N --timeout-seconds N`; it sends `SIGTERM` only and never sends `SIGKILL`. Records include a systemd unit, `interactive-tui` terminal/cwd descriptor, or reviewed unmanaged-server restart descriptor; a noninteractive server without one blocks apply.
- `verify-empty` succeeds only when zero Worker records remain; `verify-no-old` permits new Workers but rejects every old or unknown Worker record.
- `scan` accepts `--render` to print the table while still writing canonical JSON; uses `--pre-cutover --require-proc --require-systemd` for pre-apply scans, `--strict` for post-apply/post-restart scans.

- [ ] **Step 1: Write failing tests for source status and strict unreadable-source behavior.**

```js
test('scan records successful and failed sources without hiding required errors', async () => {
  const result = await invokeInventory(['scan', '--proc-root', fixture.proc, '--systemd-json', fixture.systemd, '--status-json', fixture.status, '--output', fixture.out]);
  assert.equal(result.code, 0);
  const report = JSON.parse(await readFile(fixture.out, 'utf8'));
  assert.equal(report.sources.find((source) => source.name === 'proc').ok, true);
  assert.equal(report.sources.find((source) => source.name === 'status').ok, false);
  assert.equal(report.strictFailure, true);
});
```

- [ ] **Step 2: Run the focused inventory test.**

Run: `node --test /home/dev/devbox/tests/opencode-worker-inventory.test.mjs`

Expected: FAIL because the inventory CLI does not yet emit source-level `ok/error` records and strict failure.

- [ ] **Step 3: Implement `/proc`, systemd, and operator-status adapters with strict source accounting.**

```python
@dataclass(frozen=True)
class SourceResult:
    name: str
    ok: bool
    error: str | None
    records: list[dict[str, object]]

def read_source(name: str, reader: Callable[[], list[dict[str, object]]]) -> SourceResult:
    try:
        return SourceResult(name, True, None, reader())
    except OSError as error:
        return SourceResult(name, False, f'{type(error).__name__}: {error}', [])

def strict_scan(sources: list[SourceResult]) -> int:
    return 1 if any(not source.ok for source in sources) else 0
```

- [ ] **Step 4: Write failing tests for executable identity, old/new classification, and PID reuse.**

```js
test('scan captures device/inode/hash and marks mixed protocol/build/domain old', async () => {
  const report = await scanFixture({ participantBuild: 'new-build', processBuild: '0.0.0-fork/snip-always-prefix-202610021248', participantDomain: 'domain-a', processDomain: 'domain-b' });
  const record = report.records[0];
  assert.equal(record.classification, 'old');
  assert.equal(typeof record.exe.device, 'number');
  assert.equal(record.exe.sha256.length, 64);
});

test('terminate refuses changed start time or executable inode before SIGTERM', async () => {
  const result = await invokeInventory(['terminate', '--inventory', fixture.inventory, '--inventory-sha256', fixture.sha256,
    '--pid', String(fixture.pid), '--start-time-ticks', '999', '--exe-device', String(fixture.device), '--exe-inode', String(fixture.inode), '--timeout-seconds', '1']);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /identity changed/);
  assert.equal(fixture.signals.length, 0);
});

test('inventory fails closed for deleted executable, unreadable proc, PID reuse, and changed fd identity', async () => {
  for (const fixtureName of ['deleted-executable', 'unreadable-proc', 'pid-reuse', 'changed-fd-identity']) {
    assert.notEqual((await invokeInventoryFixture(fixtureName)).code, 0);
  }
});
```

- [ ] **Step 5: Implement exact identity capture and fail-closed classification.**

```python
def process_identity(pid: int) -> dict[str, object]:
    proc = Path('/proc') / str(pid)
    stat = (proc / 'stat').read_text()
    start_ticks = int(stat.rsplit(')', 1)[1].split()[19])
    exe_fd = os.open(proc / 'exe', os.O_RDONLY | os.O_CLOEXEC)
    try:
        exe_path = os.readlink(proc / 'exe')
        exe_stat = os.fstat(exe_fd)
        digest = hash_open_fd(exe_fd)
    finally:
        os.close(exe_fd)
    if read_start_time_ticks(proc) != start_ticks:
        raise InventoryError('PID identity changed while reading executable')
    return {'pid': pid, 'startTimeTicks': start_ticks, 'exe': {
        'path': exe_path, 'device': exe_stat.st_dev, 'inode': exe_stat.st_ino,
        'sha256': digest}}

def classify(record: dict[str, object], expected: dict[str, str], participant: dict[str, str] | None) -> str:
    if participant is None or not expected:
        return 'unknown'
    if all(participant.get(key) == expected.get(key) for key in ('protocol', 'buildID', 'coordinationDomain')):
        return 'new'
    return 'old'
```

- [ ] **Step 6: Write failing tests for individual TERM, timeout, and no KILL.**

```js
test('terminate sends TERM only to a revalidated exact PID', async () => {
  const result = await invokeInventory(['terminate', '--inventory', fixture.inventory, '--inventory-sha256', fixture.sha256,
    '--pid', String(fixture.pid), '--start-time-ticks', String(fixture.start), '--exe-device', String(fixture.device),
    '--exe-inode', String(fixture.inode), '--timeout-seconds', '2']);
  assert.equal(result.code, 0);
  assert.deepEqual(fixture.signals, [['SIGTERM', fixture.pid]]);
  assert.equal(fixture.killSignals.includes('SIGKILL'), false);
});

test('verify-empty fails for any old, unknown, or surviving record', async () => {
  const result = await invokeInventory(['verify-empty', '--inventory', fixture.inventory]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /old|unknown|surviving/);
});
```

- [ ] **Step 7: Implement SHA-confirmed, revalidated, TERM-only termination.**

```python
def terminate_one(args: argparse.Namespace) -> None:
    inventory_bytes = Path(args.inventory).read_bytes()
    if hashlib.sha256(inventory_bytes).hexdigest() != args.inventory_sha256:
        raise InventoryError('inventory SHA-256 confirmation mismatch')
    record = exact_record(json.loads(inventory_bytes), args.pid)
    current = process_identity(args.pid)
    for key in ('startTimeTicks',):
        if current[key] != getattr(args, snake_case(key)):
            raise InventoryError('identity changed before termination')
    if (current['exe']['device'], current['exe']['inode']) != (args.exe_device, args.exe_inode):
        raise InventoryError('executable device/inode changed before termination')
    os.kill(args.pid, signal.SIGTERM)
    deadline = time.monotonic() + args.timeout_seconds
    while time.monotonic() < deadline and process_exists(args.pid):
        time.sleep(0.1)
    if process_exists(args.pid):
        raise InventoryError(f'exact PID {args.pid} survived TERM; second Holden decision required')
```

- [ ] **Step 8: Run the complete inventory test file.**

Run: `node --test /home/dev/devbox/tests/opencode-worker-inventory.test.mjs`

Expected: PASS for source errors, strict mode, `/proc` identity, PID reuse, changed executable, classification, exact TERM, timeout, no KILL, and empty verification.

- [ ] **Step 9: Commit the inventory and tests.**

```bash
cd /home/dev/devbox
git add bin/opencode-worker-inventory tests/opencode-worker-inventory.test.mjs
git commit -m "feat: add fail-closed OpenCode Worker inventory"
```

Expected: one intended commit in `/home/dev/devbox`; no other paths staged.

### Task 3: TDD rollout/rollback coordinator

**Files:**
- Create: `/home/dev/devbox/bin/opencode-delegation-rollout`
- Test: `/home/dev/devbox/tests/opencode-delegation-rollout.test.mjs`

**Interfaces:**
- Consumes: installer subcommands, inventory JSON and SHA-256, reviewed core operator CLI/service, `systemctl --user`, `/home/dev/.local/share/opencode/opencode.db`, and release metadata.
- Produces: `plan`, `apply`, `status`, `canary`, `report`, and `rollback`. The exact Plan 1 prerequisite CLI contract is `$NEXT_RELEASE/bin/opencode debug delegation maintenance identity|status|disable-acquisition|enable-acquisition|controllers|revoke-controller|branches|drain-branch|abort-branch|participants|pending|export-acknowledged-outcomes --database /home/dev/.local/share/opencode/opencode.db --json`, resolved from evidence before activation, with `revoke-controller --lease-id ID --authority-epoch N`, branch operations `--branch-id ID`, `drain-branch --timeout-ms 30000`, and `export-acknowledged-outcomes --output PATH` reading the supplied `quiescedBackup` database. Plan 1 review is incomplete and Task 3 stops before implementation if this exact CLI is absent. The rollout tool invokes it as argv arrays and never writes delegation tables. `canary --case` accepts `immutable-deny|god-command|foreground-handoff|background-handoff|nested-handoff|revocation-fence|lease-expiry|attach-plaintext|attach-missing-basic|attach-https|attach-ssh-loopback|all` and writes `{ "schema": 1, "case": string, "result": "pass"|"fail", "tolerances": object, "details": object }` records.
- `attach-https` retains its name and required-case count but is a negative canary: it passes only when a remote HTTPS request with `X-Forwarded-Proto: https`, `X-Forwarded-For: 127.0.0.1`, `Host: localhost`, and `Origin: https://localhost` is refused as `insecure_transport`. It must record the received 403/code and must fail on any acquisition success. `attach-ssh-loopback` is the positive case and proves an SSH tunnel reaches an actual numeric-loopback-bound listener. Do not remove, mute, or reclassify either case merely to make the aggregate pass; remote HTTPS is future gated work.
- Produces evidence `{ "schema": 1, "phase": string, "inventorySHA256": string, "pidIdentities": [{ "pid": int, "startTimeTicks": int, "exeDevice": int, "exeInode": int }], "nextRelease": { "path": string, "sha256": string }, "previousRelease": { "path": string, "sha256": string }, "preV1Backup": string, "quiescedBackup": string, "componentCommits": object, "baselineStatus": { "guard": string, "workflows": string, "broker": string, "devbox": string }, "services": {"opencode-model-broker.service":"started","opencode-model-watch.service":"started","opencode-broker-health.service":"started"}, "workerUnits": string[], "liveAgentTeams": object[], "acquisition": "disabled|enabled" }`. `plan` captures each baseline with `git --no-pager status --short` and preserves it byte-for-byte for the final no-new-dirt comparison.
- `plan` is read-only and writes evidence; it must not disable, revoke, drain, stop, apply, or alter live state. `apply`, only after confirmed SHA, disables acquisition, lists/revokes controllers, drains and re-lists branches, and stops to ask Holden for explicit branch IDs if branches remain; it never automatically aborts branches.
- Agent-team quiescence: `plan` (read-only) records `liveAgentTeams` (list of `{ path, leadID, childID, name, ownerPID, reason }`) from `/home/dev/.local/share/opencode/workflow-runs/teams/*/*.json`, and `status` renders it. `apply` calls `require_no_live_agent_teams` twice -- after the confirmation-SHA check and before any backup, control call or signal (`before-control`), and again immediately before the first TERM (`before-terminate`). A record whose `ownerPID` is alive (or exists under another uid), an unreadable record, or an unreadable team root is NOT quiescent: apply writes `blocked-teams.json`, prints each record, exits nonzero, and never terminates the owner. A dead `ownerPID` is a stale record and does not block; a missing team root means no teams. `--teams-root PATH` overrides the root for tests only.
- Create a consistent pre-v1 SQLite backup before candidate migration/control and a second quiesced backup after drain, both with Python `sqlite3.Connection.backup()` and fsync. Rollback exports/preserves acknowledged v1 outcomes from quiesced evidence, quarantines DB/WAL/SHM without deletion, and restores the pre-v1 backup atomically only with zero-Worker proof.
- Derive Worker units from inventory record `unit` fields; no `OpenCodeWorker` systemd property exists. `canary` owns the exact runtime cases and output schema; `report` writes actual final values.
- `apply` restarts recorded Worker units individually, then broker/watch/health, and leaves acquisition disabled. Holden starts each `interactive-tui` with `/home/dev/.local/bin/opencode` in its recorded terminal/cwd after the supervisor finishes. Unmanaged servers require reviewed restart descriptors.

- [ ] **Step 1: Write failing tests for the read-only plan and operator-only control.**

```js
test('plan is read-only and emits evidence only', async () => {
  const result = await invokeRollout(['plan', '--release', fixture.nextReleasePath, '--inventory', fixture.inventory]);
  assert.equal(result.code, 0);
  assert.deepEqual(fixture.operator.calls, []);
  assert.equal(JSON.parse(await readFile(fixture.evidence, 'utf8')).evidenceOnly, true);
});
```

- [ ] **Step 2: Run the focused coordinator test.**

Run: `node --test /home/dev/devbox/tests/opencode-delegation-rollout.test.mjs`

Expected: FAIL because the coordinator does not yet emit read-only evidence through the exact operator interface contract.

- [ ] **Step 3: Implement the typed core operator client and quiescence barrier.**

```python
class CoreOperator(Protocol):
    def disable_acquisition(self) -> None: ...
    def enable_acquisition(self) -> None: ...
    def list_controllers(self) -> list[dict[str, object]]: ...
    def revoke_controller(self, lease_id: str, authority_epoch: int) -> None: ...
    def list_branches(self) -> list[dict[str, object]]: ...
    def drain_branch(self, branch_id: str) -> None: ...
    def abort_branch(self, branch_id: str) -> None: ...
    def list_participants(self) -> list[dict[str, object]]: ...
    def list_pending_interactions(self) -> list[dict[str, object]]: ...

def quiesce(operator: CoreOperator, abort_branch_ids: set[str]) -> None:
    operator.disable_acquisition()
    for lease in operator.list_controllers():
        operator.revoke_controller(str(lease['leaseID']), int(lease['authorityEpoch']))
    for branch in operator.list_branches():
        if branch['state'] in {'running', 'registered', 'acknowledged'}:
            operator.drain_branch(str(branch['branchID']))
    remaining = operator.list_branches()
    if remaining:
        write_blocked_branches_json(remaining)
        if not abort_branch_ids:
            raise RolloutError('branches remain; resumed apply requires Holden-supplied exact --abort-branch-id values')
    for branch_id in abort_branch_ids:
        operator.abort_branch(branch_id)
    if operator.list_pending_interactions():
        raise RolloutError('delegated pending interactions remain after explicit branch handling')
```

- [ ] **Step 4: Write failing tests for backup ordering, dynamic units, and evidence schema.**

```js
test('apply orders backups around candidate control and quiescence', async () => {
  const result = await invokeRollout(['apply', '--release', fixture.nextReleasePath, '--inventory', fixture.inventory]);
  assert.equal(result.code, 0);
  assert.ok(fixture.preV1BackupCallIndex < fixture.candidateControlIndex);
  assert.ok(fixture.quiescedBackupCallIndex > fixture.quiescenceCompleteIndex);
  const evidence = JSON.parse(await readFile(fixture.evidence, 'utf8'));
  assert.deepEqual(evidence.workerUnits, ['opencode-worker-a.service', 'opencode-worker-b.service']);
  assert.deepEqual(evidence.services, {"opencode-model-broker.service":"started","opencode-model-watch.service":"started","opencode-broker-health.service":"started"});
  assert.equal(evidence.preV1Backup.endsWith('.sqlite'), true);
  assert.equal(evidence.quiescedBackup.endsWith('.sqlite'), true);
});

test('plan emits no control calls and absent maintenance CLI blocks before state change', async () => {
  assert.equal((await invokeRollout(['plan', '--offline', '--inventory', fixture.inventory])).code, 0);
  const result = await invokeRollout(['apply', '--release', fixture.nextReleasePath, '--inventory', fixture.inventory], { maintenanceCLI: null });
  assert.notEqual(result.code, 0);
  assert.deepEqual(fixture.operator.calls, []);
  assert.equal(fixture.directDelegationSqlWrites, 0);
});
```

- [ ] **Step 5: Implement post-barrier SQLite backup and dynamic unit discovery.**

```python
def backup_sqlite(db: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db) as source, sqlite3.connect(destination) as target:
        source.backup(target)
    fsync_file_and_parent(destination)

def discover_worker_units() -> list[str]:
    return sorted({record['unit'] for record in load_inventory()['records'] if record.get('unit')})
```

- [ ] **Step 6: Write failing tests for confirmation SHA, agent-team quiescence, exact PID tuples, activation ordering, and restart behavior.**

The agent-team tests need `spawn` from `node:child_process` and `mkdtemp`/`mkdir`/`writeFile` from `node:fs/promises` in the test file's imports. After writing them, run `node --test /home/dev/devbox/tests/opencode-delegation-rollout.test.mjs` and confirm the four agent-team tests FAIL (no `--teams-root`, no `live agent team` refusal) before Step 7.

```js
test('apply refuses mismatched confirmation before terminating anything', async () => {
  const result = await invokeRollout(['apply', '--evidence', fixture.evidence, '--confirm-sha256', '0'.repeat(64)]);
  assert.notEqual(result.code, 0);
  assert.equal(fixture.signals.length, 0);
  assert.match(result.stderr, /confirmation SHA/);
});

// Native agent teams (workflows 0.13.x, guard 1.7.x G1-G4) are not delegation branches:
// drain-branch cannot see them, and the exact-PID stop would kill a teammate mid-run.
// A team record is teams/<leadID>/<childID>.json with an integer ownerPID.
const writeTeam = async (teamsRoot, ownerPID, childID = 'ses_child') => {
  await mkdir(join(teamsRoot, 'ses_lead'), { recursive: true });
  await writeFile(join(teamsRoot, 'ses_lead', `${childID}.json`), JSON.stringify({
    version: 1, leadID: 'ses_lead', childID, name: 'reader', callID: 'call_1', agent: 'scout', ownerPID, directory: '/home/dev',
  }));
};

test('apply stops and reports a live agent team before any state change or signal', async () => {
  const teamsRoot = await mkdtemp('/tmp/rollout-teams-');
  await writeTeam(teamsRoot, process.pid);
  const result = await invokeRollout(['apply', '--evidence', fixture.evidence, '--confirm-sha256', fixture.inventorySHA, '--teams-root', teamsRoot]);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /live agent team/);
  assert.match(result.stderr, new RegExp(`ownerPID=${process.pid}`));
  assert.match(result.stderr, /ses_lead\/ses_child\.json/);
  assert.deepEqual(fixture.operator.calls, []);
  assert.equal(fixture.preV1BackupCallIndex, undefined);
  assert.equal(fixture.signals.length, 0);
});

test('apply re-checks agent teams immediately before the first TERM and stops without signalling', async () => {
  const teamsRoot = await mkdtemp('/tmp/rollout-teams-');
  // The fixture creates the team after quiescence completes, i.e. between the two checks.
  const result = await invokeRollout(['apply', '--evidence', fixture.evidence, '--confirm-sha256', fixture.inventorySHA, '--teams-root', teamsRoot],
    { afterQuiescence: () => writeTeam(teamsRoot, process.pid) });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /live agent team.*before-terminate/);
  assert.equal(fixture.signals.length, 0);
  assert.equal(fixture.operator.acquisition, 'disabled');
});

test('dead-owner team records do not block; an unreadable record or team root does', async () => {
  const teamsRoot = await mkdtemp('/tmp/rollout-teams-');
  const exited = spawn('/bin/true');
  await new Promise((resolve) => exited.on('exit', resolve));
  await writeTeam(teamsRoot, exited.pid);
  assert.equal((await invokeRollout(['apply', '--evidence', fixture.evidence, '--confirm-sha256', fixture.inventorySHA, '--teams-root', teamsRoot])).code, 0);
  const broken = await mkdtemp('/tmp/rollout-teams-');
  await mkdir(join(broken, 'ses_lead'));
  await writeFile(join(broken, 'ses_lead', 'ses_child.json'), '{not json');
  const unreadable = await invokeRollout(['apply', '--evidence', fixture.evidence, '--confirm-sha256', fixture.inventorySHA, '--teams-root', broken]);
  assert.notEqual(unreadable.code, 0);
  assert.match(unreadable.stderr, /unreadable/);
  assert.equal(fixture.signals.length, 0);
});

test('plan records live agent teams read-only and a missing team root means no teams', async () => {
  const teamsRoot = await mkdtemp('/tmp/rollout-teams-');
  await writeTeam(teamsRoot, process.pid);
  assert.equal((await invokeRollout(['plan', '--offline', '--inventory', fixture.inventory, '--teams-root', teamsRoot])).code, 0);
  const evidence = JSON.parse(await readFile(fixture.evidence, 'utf8'));
  assert.equal(evidence.liveAgentTeams.length, 1);
  assert.equal(evidence.liveAgentTeams[0].ownerPID, process.pid);
  assert.deepEqual(fixture.operator.calls, []);
  assert.equal((await invokeRollout(['plan', '--offline', '--inventory', fixture.inventory, '--teams-root', join(teamsRoot, 'absent')])).code, 0);
  assert.deepEqual(JSON.parse(await readFile(fixture.evidence, 'utf8')).liveAgentTeams, []);
});

test('apply terminates exact PIDs, activates after zero workers, and restarts units individually', async () => {
  const result = await invokeRollout(['apply', '--evidence', fixture.evidence, '--confirm-sha256', fixture.inventorySHA]);
  assert.equal(result.code, 0);
  assert.deepEqual(fixture.events, ['TERM:101', 'TERM:102', 'verify-empty', 'activate', 'link:guard', 'link:workflows', 'link:tui', 'start:opencode-worker-a.service', 'start:opencode-worker-b.service', 'start:opencode-model-broker.service', 'start:opencode-model-watch.service', 'start:opencode-broker-health.service']);
  assert.equal(fixture.operator.acquisition, 'disabled');
});
```

- [ ] **Step 7: Implement confirmation, individual termination, activation, links, and restart evidence.**

```python
def maintenance(binary: Path, *arguments: str, database: Path = DB) -> dict[str, object]:
    argv = [str(binary), 'debug', 'delegation', 'maintenance', *arguments,
            '--database', str(database), '--json']
    return json.loads(subprocess.run(argv, check=True, text=True, capture_output=True).stdout)

def maintenance_argv(binary: Path, subcommand: str, **options: str) -> list[str]:
    argv = [str(binary), 'debug', 'delegation', 'maintenance', subcommand]
    for key, value in options.items():
        argv.extend([f'--{key.replace("_", "-")}', value])
    argv.extend(['--database', '/home/dev/.local/share/opencode/opencode.db', '--json'])
    return argv

# Every accepted maintenance subcommand is built as argv; none is a shell string or SQL write.
for subcommand in ('identity', 'status', 'disable-acquisition', 'enable-acquisition',
                    'controllers', 'revoke-controller', 'branches', 'drain-branch',
                    'abort-branch', 'participants', 'pending', 'export-acknowledged-outcomes'):
    argv = maintenance_argv(candidate_binary, subcommand)

TEAMS_ROOT = Path('/home/dev/.local/share/opencode/workflow-runs/teams')  # --teams-root overrides (tests only)

def live_agent_teams(teams_root: Path) -> list[dict[str, object]]:
    """Agent-team records whose owner process is alive or cannot be proven dead.

    Pre-v1 native teammates are not delegation branches: drain-branch cannot see them,
    and the exact-PID stop would kill their owner TUI mid-run. Layout mirrors
    opencode-agent-workflows lib/child-session.js: teams/<leadID>/<childID>.json.
    """
    if not teams_root.exists():
        return []  # same rule as workflows: a missing team root is no teams
    blocking: list[dict[str, object]] = []
    try:
        # iterdir (not glob): glob silently skips unreadable directories, which would fail open.
        leads = sorted(p for p in teams_root.iterdir() if p.is_dir())
        paths = [path for lead in leads for path in sorted(lead.iterdir()) if path.suffix == '.json']
    except OSError as error:
        raise RolloutError(f'cannot read agent-team root {teams_root}: {error}') from error
    for path in paths:
        try:
            record = json.loads(path.read_text())
            owner = record['ownerPID']
            if not isinstance(owner, int) or isinstance(owner, bool) or owner <= 0:
                raise ValueError('ownerPID is not a positive integer')
        except (OSError, ValueError, KeyError, TypeError) as error:
            blocking.append({'path': str(path), 'ownerPID': None, 'reason': f'unreadable: {error}'})
            continue
        try:
            os.kill(owner, 0)
        except ProcessLookupError:
            continue  # owner gone: stale record, retired by workflows' own sweep
        except PermissionError:
            pass  # exists under another uid: treat as alive
        blocking.append({'path': str(path), 'leadID': record.get('leadID'), 'childID': record.get('childID'),
                         'name': record.get('name'), 'ownerPID': owner, 'reason': 'owner alive'})
    return blocking

def require_no_live_agent_teams(teams_root: Path, stage: str) -> None:
    blocking = live_agent_teams(teams_root)
    if not blocking:
        return
    write_blocked_teams_json(blocking, stage)
    for entry in blocking:
        print(f"live agent team at {stage}: {entry['path']} ownerPID={entry['ownerPID']} ({entry['reason']})", file=sys.stderr)
    raise RolloutError(f'{len(blocking)} live agent team record(s) at {stage}: not quiescent, no process was '
                       'terminated; let each team finish or retire it, then re-run apply')

def apply(evidence: dict[str, object], confirmation_sha: str, abort_branch_ids: set[str],
          teams_root: Path = TEAMS_ROOT) -> None:
    if confirmation_sha != evidence['inventorySHA256']:
        raise RolloutError('confirmation SHA does not match rendered inventory')
    require_no_live_agent_teams(teams_root, 'before-control')  # before any backup, control call or signal
    backup_sqlite(DB, Path(evidence['preV1Backup']))
    candidate = Path(evidence['nextRelease']['path']) / 'bin' / 'opencode'
    maintenance(candidate, 'disable-acquisition')
    for lease in maintenance(candidate, 'controllers')['controllers']:
        maintenance(candidate, 'revoke-controller', '--lease-id', str(lease['leaseID']), '--authority-epoch', str(lease['authorityEpoch']))
    for branch in maintenance(candidate, 'branches')['branches']:
        maintenance(candidate, 'drain-branch', '--branch-id', str(branch['branchID']), '--timeout-ms', '30000')
    remaining = maintenance(candidate, 'branches')['branches']
    if remaining and not abort_branch_ids:
        write_blocked_branches_json(remaining)
        raise RolloutError('blocked branches require Holden-supplied exact --abort-branch-id values')
    for branch_id in abort_branch_ids:
        maintenance(candidate, 'abort-branch', '--branch-id', branch_id)
    if maintenance(candidate, 'branches')['branches']:
        raise RolloutError('branches remain after explicit aborts')
    if maintenance(candidate, 'pending')['pending']:
        raise RolloutError('pending interactions remain')
    backup_sqlite(DB, Path(evidence['quiescedBackup']))
    # Last barrier: a team started after the first check still blocks; nothing has been signalled.
    require_no_live_agent_teams(teams_root, 'before-terminate')
    for identity in evidence['pidIdentities']:
        run_inventory_terminate(identity, evidence['inventorySHA256'])
    # Run a fresh scan and verify zero Workers; do not evaluate stale pre-deploy inventory
    run_inventory_verify_empty(fresh_strict_scan())
    installer('activate', '--release', evidence['nextRelease']['path'])
    apply_relative_component_links()
    # Iterate over the services object's keys, not the object itself
    for unit in evidence['workerUnits'] + list(evidence['services'].keys()):
        systemctl_user('start', unit)
    write_phase('applied', acquisition='disabled')
```

- [ ] **Step 8: Write failing tests for full rollback sequencing and v1 state quarantine.**

```js
test('rollback disables and revokes, drains, explicitly aborts, restores without deletion, and proves no v1 authority', async () => {
  const result = await invokeRollout(['rollback', '--evidence', fixture.evidence, '--confirm-sha256', fixture.inventorySHA]);
  assert.equal(result.code, 0);
  assert.deepEqual(fixture.events, ['disableAcquisition', 'revokeAll', 'drain', 'explicit-abort', 'verify-no-pending', 'quiesced-inventory', 'stop:worker-a', 'stop:worker-b', 'stop:tui-a', 'verify-empty', 'export-acknowledged-outcomes', 'quarantine:opencode.db', 'quarantine:opencode.db-wal', 'quarantine:opencode.db-shm', 'restore-pre-v1-backup', 'activate-previous', 'restart', 'verify-no-v1-authority']);
  assert.equal(fixture.deletedFiles.length, 0);
});
```

- [ ] **Step 9: Implement tested rollback sequence without direct delegation SQLite writes.**

```python
def rollback(evidence: dict[str, object], inventory_path: Path, confirmation_sha: str,
             abort_branch_ids: set[str]) -> None:
    require_confirmation(inventory_path, confirmation_sha)
    candidate = Path(evidence['nextRelease']['path']) / 'bin' / 'opencode'
    maintenance(candidate, 'disable-acquisition')
    for lease in maintenance(candidate, 'controllers')['controllers']:
        maintenance(candidate, 'revoke-controller', '--lease-id', str(lease['leaseID']),
                    '--authority-epoch', str(lease['authorityEpoch']))
    for branch in maintenance(candidate, 'branches')['branches']:
        maintenance(candidate, 'drain-branch', '--branch-id', str(branch['branchID']),
                    '--timeout-ms', '30000')
    remaining_ids = {str(branch['branchID']) for branch in maintenance(candidate, 'branches')['branches']}
    if remaining_ids != abort_branch_ids:
        raise RolloutError('rollback abort IDs must exactly equal the reviewed remaining branch IDs')
    for branch_id in sorted(abort_branch_ids):
        maintenance(candidate, 'abort-branch', '--branch-id', branch_id)
    if maintenance(candidate, 'branches')['branches'] or maintenance(candidate, 'pending')['pending']:
        raise RolloutError('rollback quiescence barrier did not close')
    stop_exact_workers(load_inventory(inventory_path))
    run_fresh_scan_and_verify_empty()
    if maintenance(candidate, 'controllers')['controllers'] or maintenance(candidate, 'participants')['participants']:
        raise RolloutError('v1 owner or authority remains before database quarantine')
    outcomes = Path(evidence['evidenceDir']) / 'acknowledged-outcomes.json'
    maintenance(candidate, 'export-acknowledged-outcomes', '--output', str(outcomes),
                database=Path(evidence['quiescedBackup']))
    quarantine_v1_state_without_deletion(Path('/home/dev/.local/share/opencode/opencode.db'))
    restore_sqlite_backup(Path(evidence['preV1Backup']))
    installer('rollback', '--release', evidence['previousRelease']['path'])
    restart_recorded_units(evidence)
    if not verify_no_v1_binary_or_process_via_inventory():
        raise RolloutError('v1 binary or process remains after rollback')
    write_phase('rolled-back', acquisition='disabled')
```

- [ ] **Step 10: Write failing tests for canary and report cases and schemas.**

```js
test('canary accepts every named case and all aggregates only passing cases', async () => {
  const cases = ['immutable-deny', 'god-command', 'foreground-handoff', 'background-handoff',
    'nested-handoff', 'revocation-fence', 'lease-expiry', 'attach-plaintext',
    'attach-missing-basic', 'attach-https', 'attach-ssh-loopback'];
  for (const caseName of cases) {
    assert.equal((await invokeRollout(['canary', '--case', caseName, '--evidence', fixture.evidence])).code, 0);
  }
  assert.equal((await invokeRollout(['canary', '--case', 'all', '--evidence', fixture.evidence])).code, 0);
  assert.equal((await invokeRollout(['canary', '--case', 'unknown', '--evidence', fixture.evidence])).code, 2);
  const record = JSON.parse(await readFile(fixture.canaryRecord, 'utf8'));
  assert.deepEqual(Object.keys(record).sort(), ['case', 'details', 'result', 'schema', 'tolerances'].sort());
  assert.equal(record.schema, 1);
  assert.ok(['pass', 'fail'].includes(record.result));
});

test('attach-https is a negative spoof-resistance canary while SSH loopback remains positive', async () => {
  const https = await invokeRollout(['canary', '--case', 'attach-https', '--evidence', fixture.evidence]);
  assert.equal(https.code, 0);
  const httpsRecord = JSON.parse(await readFile(fixture.canaryRecord, 'utf8'));
  assert.equal(httpsRecord.result, 'pass');
  assert.deepEqual(httpsRecord.details.response, { status: 403, code: 'insecure_transport' });
  assert.equal(httpsRecord.details.request.headers['x-forwarded-proto'], 'https');
  assert.equal(httpsRecord.details.request.headers['x-forwarded-for'], '127.0.0.1');
  assert.equal(httpsRecord.details.request.headers.host, 'localhost');
  assert.equal(httpsRecord.details.request.headers.origin, 'https://localhost');
  assert.equal((await invokeRollout(['canary', '--case', 'attach-ssh-loopback', '--evidence', fixture.evidence])).code, 0);
});

test('report emits the actual final schema', async () => {
  assert.equal((await invokeRollout(['report', '--evidence', fixture.evidence, '--output', fixture.report])).code, 0);
  const report = JSON.parse(await readFile(fixture.report, 'utf8'));
  assert.equal(typeof report.services, 'object');
  assert.ok(Object.values(report.services).every((state) => typeof state === 'string'));
  assert.ok(Object.values(report.testCounts).every((count) => Number.isInteger(count) && count >= 0));
  assert.deepEqual(Object.keys(report.resumedTask7PushedMainCommits).sort(), ['broker', 'devbox', 'guard']);
  assert.ok(Object.values(report.resumedTask7PushedMainCommits).every((sha) => /^[0-9a-f]{40}$/.test(sha)));
  assert.ok(Object.values(report.pushedMainCommits).every((sha) => /^[0-9a-f]{40}$/.test(sha)));
});
```

- [ ] **Step 11: Implement concrete canary and report behavior.**

```python
CANARY_CASES = {
    'immutable-deny', 'god-command', 'foreground-handoff', 'background-handoff',
    'nested-handoff', 'revocation-fence', 'lease-expiry', 'attach-plaintext',
    'attach-missing-basic', 'attach-https', 'attach-ssh-loopback',
}

def canary(case: str, evidence: Path) -> None:
    if case != 'all' and case not in CANARY_CASES:
        raise RolloutError(f'unknown canary case: {case}')
    selected = sorted(CANARY_CASES) if case == 'all' else [case]
    for name in selected:
        details, tolerances, passed = (run_attach_https_negative_canary() if name == 'attach-https' else run_canary_case(name, evidence))
        write_json(evidence.with_name(f'canary-{name}.json'), {
            'schema': 1, 'case': name, 'result': 'pass' if passed else 'fail',
            'tolerances': tolerances, 'details': details,
        })
    if case == 'all' and any(load_canary(evidence, name)['result'] != 'pass' for name in CANARY_CASES):
        raise RolloutError('one or more required canary cases failed')

def run_attach_https_negative_canary() -> tuple[dict[str, object], dict[str, object], bool]:
    response = candidate_remote_https_request(headers={
        'X-Forwarded-Proto': 'https', 'X-Forwarded-For': '127.0.0.1',
        'Host': 'localhost', 'Origin': 'https://localhost',
    })
    details = {'request': {'headers': {'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1', 'host': 'localhost', 'origin': 'https://localhost'}}, 'response': response}
    return details, {}, response == {'status': 403, 'code': 'insecure_transport'}

def report(evidence: Path, output: Path) -> None:
    write_json(output, {
        'releaseBuildID': load(evidence)['nextRelease']['buildID'],
        'releaseSHA256': load(evidence)['nextRelease']['sha256'],
        'rollbackRelease': load(evidence)['previousRelease']['path'],
        'rollbackSHA256': load(evidence)['previousRelease']['sha256'],
        'componentCommitIDs': load(evidence)['componentCommits'],
        'versions': {'bun': '1.3.14', 'binary': load(evidence)['nextRelease']['path']},
        'testCounts': load(evidence).get('testCounts', {}),
        'services': load(evidence)['services'],
        'protocol': 'opencode.delegation/v1',
        'buildID': load(evidence)['nextRelease']['buildID'],
        'coordinationDomain': load(evidence)['coordinationDomain'],
        'canaryEvidence': str(evidence.parent),
        'oldProcessAbsence': load(evidence)['oldProcessAbsence'],
        'resumedTask7PushedMainCommits': verified_remote_main_commits(
            load(evidence)['resumedTask7Evidence'], ('guard', 'broker', 'devbox')),
        'pushedMainCommits': verified_remote_main_commits(
            load(evidence).get('remainingPushEvidence', {}), ('workflows',)),
    })
```

- [ ] **Step 12: Run the complete coordinator tests.**

Run: `node --test /home/dev/devbox/tests/opencode-delegation-rollout.test.mjs`

Expected: PASS for read-only plan evidence, exact maintenance argv ordering, pre-v1 and quiesced backups, explicit branch IDs, exact PID ordering, disabled acquisition, activation ordering, restart evidence, agent-team quiescence (live owner blocks at `before-control` and `before-terminate` with zero signals; dead owner passes; unreadable record/root blocks; `plan` records `liveAgentTeams` read-only), rollback sequencing, state quarantine without deletion, and no-v1 proof.

- [ ] **Step 13: Commit the coordinator and tests.**

```bash
cd /home/dev/devbox
git add bin/opencode-delegation-rollout tests/opencode-delegation-rollout.test.mjs
git commit -m "feat: add delegation rollout coordinator"
```

Expected: one intended commit in `/home/dev/devbox`; no other paths staged.

### Task 4: Atomic compatibility links

**Files:**
- Modify: `/home/dev/devbox/config/opencode/plugin/opencode-guard.js`
- Modify: `/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js`
- Modify: `/home/dev/devbox/config/opencode/tui.json`
- Modify: `/home/dev/devbox/tests/fleet-config.test.mjs`

**Interfaces:**
- Consumes: immutable release component paths under `/home/dev/.local/lib/opencode-fork/components/`.
- `/home/dev/fleet-core/config/...` and `/home/dev/devbox/config/...` are the same files through the symlink. Modify only the devbox-owned two plugin symlinks and `tui.json`/test.
- Produces: tracked relative symlinks from the devbox-owned plugin locations to `opencode-guard.js` and `opencode-agent-workflows.js`; TUI plugin URLs `file:///home/dev/.local/lib/opencode-fork/components/opencode-broker` and `file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui`.
- Preserves: `/home/dev/.config/opencode/plugin/opencode-guard.js` -> `/home/dev/fleet-core/config/opencode/plugin/opencode-guard.js`, the analogous workflows stable link, and `/home/dev/.config/opencode/tui.json` -> fleet-core -> `/home/dev/devbox/config/opencode/tui.json`.

- [ ] **Step 1: Read existing links and add failing assertions for release-relative targets.**

```js
test('fleet config points plugins and broker HUD at the immutable release', async () => {
  const devboxGuard = await readlink('/home/dev/devbox/config/opencode/plugin/opencode-guard.js');
  const devboxWorkflows = await readlink('/home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js');
  const tui = JSON.parse(await readFile('/home/dev/devbox/config/opencode/tui.json', 'utf8'));
  assert.equal(devboxGuard, '../../../../.local/lib/opencode-fork/components/opencode-guard/plugin.js');
  assert.equal(devboxWorkflows, '../../../../.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js');
  assert.deepEqual(tui.plugin, [
    'file:///home/dev/.local/lib/opencode-fork/components/opencode-broker',
    'file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui'
  ]);
});
```

- [ ] **Step 2: Run the focused config test and capture the expected old-live-repo failure.**

Run: `node --test /home/dev/devbox/tests/fleet-config.test.mjs`

Expected: FAIL until the devbox-owned plugin links and TUI URLs point at the immutable release.

- [ ] **Step 3: Replace only the specified tracked links and TUI URLs.**

```bash
ln -sfn ../../../../.local/lib/opencode-fork/components/opencode-guard/plugin.js /home/dev/devbox/config/opencode/plugin/opencode-guard.js
ln -sfn ../../../../.local/lib/opencode-fork/components/opencode-agent-workflows/plugin.js /home/dev/devbox/config/opencode/plugin/opencode-agent-workflows.js
```

Expected: each `readlink` reports the intended relative target and no unrelated symlink changes occur.

```json
{
  "plugin": [
    "file:///home/dev/.local/lib/opencode-fork/components/opencode-broker",
    "file:///home/dev/.local/lib/opencode-fork/components/opencode-broker/tui"
  ],
  "keybinds": {
    "history_previous": "ctrl+up",
    "history_next": "ctrl+down",
    "hud.mode.cycle": "f9",
    "hud.mode.show": "none",
    "hud.agents.list": "f10",
    "mcp_list": "f12",
    "hud.usage.toggle": "f7",
    "hud.menu": "f11"
  }
}
```

- [ ] **Step 4: Run the config test and inspect only the requested diffs.**

Run: `node --test /home/dev/devbox/tests/fleet-config.test.mjs`

Run from `/home/dev/devbox`: `readlink config/opencode/plugin/opencode-guard.js && readlink config/opencode/plugin/opencode-agent-workflows.js && readlink /home/dev/fleet-core/config/opencode/plugin/opencode-guard.js && readlink /home/dev/fleet-core/config/opencode/plugin/opencode-agent-workflows.js`.

Expected: PASS, with no live `/home/dev/opencode-broker` URL and no plugin link resolving to a live source repository. The Node devbox test asserts devbox-owned symlinks/config only; read-only `readlink /home/dev/fleet-core/config/opencode/plugin/opencode-guard.js`, `readlink /home/dev/fleet-core/config/opencode/plugin/opencode-agent-workflows.js`, and the corresponding devbox paths verify both aliases. The devbox test does not depend on `/home/dev/fleet-core`.

- [ ] **Step 5: Commit devbox link/config changes separately.**

```bash
cd /home/dev/devbox
git add config/opencode/plugin/opencode-guard.js config/opencode/plugin/opencode-agent-workflows.js config/opencode/tui.json tests/fleet-config.test.mjs
git commit -m "chore: point OpenCode config at immutable release"
```

Expected: one intended commit in `/home/dev/devbox`.

Expected: one devbox commit contains both alias-visible link changes; no separate fleet-core commit exists.

### Task 5: Offline release assembly, full suites, independent security review, and evidence

**Files:**
- Read/execute: `/home/dev/devbox/bin/install-opencode-fork`
- Read/execute: `/home/dev/devbox/bin/opencode-worker-inventory`
- Read/execute: `/home/dev/devbox/bin/opencode-delegation-rollout`
- Evidence: `$EVIDENCE_DIR/`
- Review input: reviewed Plan 1 worktree `/home/dev/projects/opencode-delegation`

**Interfaces:**
- Consumes: reviewed Plan 1 and Plan 2 commits resolved at execution, exact component commits, pinned Bun, and all Task 1-4 tests.
- Consumes the exact Plan 2 consumer manifest `/home/dev/devbox/config/opencode/delegation-consumers.json` and verifies its batch IDs and declared capabilities against guard `opencode-guard@1.9.0`, workflows `opencode-agent-workflows@0.15.0`, broker HUD `opencode-broker@1.25.0`, and core upstream 1.18.22 plus the reviewed Plan 1 custom build ID.
- Produces: an offline immutable release, manifest and hash evidence, full suite output, independent security review result, dynamically printed commit IDs, and a prepared maintenance evidence JSON; no deployment and no source commit.

- [ ] **Step 1: Confirm prerequisites and resolve reviewed commits dynamically.**

```bash
test -d /home/dev/projects/opencode-delegation
/home/dev/.bun/bin/bun --version
git -C /home/dev/projects/opencode-delegation rev-parse HEAD
git -C /home/dev/projects/opencode-delegation merge-base --is-ancestor 2b7eb922fdc59f6560a490e266651c0e01444046 HEAD && echo "plan1-base-ok"
# Plan 2 consumer commits live in the -plan2 worktrees, never in the live checkouts (the live
# checkouts are loaded directly by today's plugin links and tui.json; advancing them is a deployment).
GUARD_COMMIT=$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD) && echo "GUARD_COMMIT=$GUARD_COMMIT"
WORKFLOWS_COMMIT=$(git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD) && echo "WORKFLOWS_COMMIT=$WORKFLOWS_COMMIT"
BROKER_COMMIT=$(git -C /home/dev/opencode-broker-plan2 rev-parse HEAD) && echo "BROKER_COMMIT=$BROKER_COMMIT"
# Each worktree shares its live repo's object store, so the live repo path can archive the commit.
git -C /home/dev/opencode-guard cat-file -e "$GUARD_COMMIT^{commit}" && echo guard-object-ok
git -C /home/dev/opencode-agent-workflows cat-file -e "$WORKFLOWS_COMMIT^{commit}" && echo workflows-object-ok
git -C /home/dev/opencode-broker cat-file -e "$BROKER_COMMIT^{commit}" && echo broker-object-ok
git -C /home/dev/devbox rev-parse HEAD
realpath /home/dev/fleet-core
git -C /home/dev/fleet-core rev-parse --show-toplevel
git -C /home/dev/devbox rev-parse --show-toplevel
```

Expected: the isolated worktree exists; Bun prints `1.3.14`; `plan1-base-ok` prints (stop if not: the reviewed Plan 1 HEAD does not contain the deployed `2b7eb922f` shell.ts fix); each reviewed HEAD is printed as a full commit ID, the three consumer commits from the `-plan2` worktrees; `guard-object-ok`, `workflows-object-ok` and `broker-object-ok` print; `/home/dev/fleet-core` resolves to `/home/dev/devbox`; both Git toplevels are `/home/dev/devbox`; `/home/dev/projects/opencode` is not used for build input. `GUARD_COMMIT`, `WORKFLOWS_COMMIT` and `BROKER_COMMIT` stay set for Steps 2-3a; the live checkouts `/home/dev/opencode-guard`, `/home/dev/opencode-agent-workflows` and `/home/dev/opencode-broker` are not checked out, reset or committed to by this plan.

The reviewed Plan 1 handoff must provide the reviewed HEAD commit ID. The installer computes `OPENCODE_BUILD_ID` from the reviewed worktree HEAD as `"0.0.0-fork/delegation-v1-$(git -C "$WORKTREE" rev-parse --short=12 HEAD)"`. Assert that output exists and that its source commit equals the reviewed Plan 1 HEAD before using the value.

- [ ] **Step 2: Run all Task 1-4 tests and product suites offline.**

```bash
node --test /home/dev/devbox/tests/install-opencode-fork.test.mjs /home/dev/devbox/tests/opencode-worker-inventory.test.mjs /home/dev/devbox/tests/opencode-delegation-rollout.test.mjs /home/dev/devbox/tests/fleet-config.test.mjs
(cd /home/dev/opencode-guard-plan2 && npm test)
(cd /home/dev/opencode-agent-workflows-plan2 && npm test)
(cd /home/dev/opencode-broker-plan2 && npm test)
test "$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD)" = "$GUARD_COMMIT"
test "$(git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD)" = "$WORKFLOWS_COMMIT"
test "$(git -C /home/dev/opencode-broker-plan2 rev-parse HEAD)" = "$BROKER_COMMIT"
(cd /home/dev/projects/opencode-delegation && /home/dev/.bun/bin/bun run --cwd packages/opencode test)
(cd /home/dev/projects/opencode-delegation && /home/dev/.bun/bin/bun run --cwd packages/opencode typecheck)
(cd /home/dev/projects/opencode-delegation && /home/dev/.bun/bin/bun turbo typecheck)
(cd /home/dev/devbox && python3 tests/devbox-jobs.test.py)
(cd /home/dev/devbox && python3 tests/fleet-router-audit.test.py)
(cd /home/dev/devbox && node --test tests/*.test.mjs)
```

Expected: each command exits `0`; root `bun test` is never run; exact test counts are captured in evidence.

- [ ] **Step 3: Assemble the release from printed reviewed commits without deploying it.**

```bash
git -C /home/dev/projects/opencode-delegation rev-parse HEAD
BUILD_RESULT=$(/usr/bin/python3 /home/dev/devbox/bin/install-opencode-fork build --json --worktree /home/dev/projects/opencode-delegation --core-commit "$(git -C /home/dev/projects/opencode-delegation rev-parse HEAD)" --guard-repo /home/dev/opencode-guard --guard-commit "$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD)" --workflows-repo /home/dev/opencode-agent-workflows --workflows-commit "$(git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD)" --broker-repo /home/dev/opencode-broker --broker-commit "$(git -C /home/dev/opencode-broker-plan2 rev-parse HEAD)" --devbox-repo /home/dev/devbox --devbox-commit "$(git -C /home/dev/devbox rev-parse HEAD)")
RELEASE_MANIFEST=$(jq -er '.manifest' <<<"$BUILD_RESULT")
BUILD_ID=$(jq -er '.buildID' "$RELEASE_MANIFEST")
RELEASE_KEY=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="._-"))' "$BUILD_ID")
EVIDENCE_DIR="/home/dev/.local/state/opencode-delegation-rollout/$RELEASE_KEY"
mkdir -p "$EVIDENCE_DIR"
tmp_release=$(mktemp "$EVIDENCE_DIR/.release.json.XXXXXX")
cp -- "$RELEASE_MANIFEST" "$tmp_release"
mv -f "$tmp_release" /home/dev/.local/state/opencode-delegation-rollout/release.json
RELEASE_DIR=$(jq -er '.releasePath' <<<"$BUILD_RESULT")
/usr/bin/python3 /home/dev/devbox/bin/install-opencode-fork verify --release "$RELEASE_DIR"
```

Expected: install uses `/home/dev/.bun/bin/bun install --frozen-lockfile`, then `/home/dev/.bun/bin/bun run --cwd packages/opencode build --single --skip-install`; the actual binary is `/home/dev/projects/opencode-delegation/packages/opencode/dist/opencode-linux-x64/bin/opencode`; `verify` passes; `release.json` `guardCommit`/`workflowsCommit`/`brokerCommit` equal `GUARD_COMMIT`/`WORKFLOWS_COMMIT`/`BROKER_COMMIT` from Step 1 (archived from the live repos' shared object stores, the live working trees untouched); `components/opencode-broker/node_modules/@opentui/solid/package.json` reports `0.4.5` and no `components/opencode-agent-workflows/node_modules/@opencode-ai/plugin` exists; no active pointer or service changes occur.

- [ ] **Step 3a: Complete the previous compatibility release before maintenance.**

```bash
/usr/bin/python3 /home/dev/devbox/bin/install-opencode-fork previous-release \
  --binary /home/dev/.local/lib/opencode-fork/bin/opencode \
  --core-dir /home/dev/.local/lib/opencode-fork \
  --guard-repo /home/dev/opencode-guard --guard-commit 7368c42265c5fcb85f8329545845ec597e37f7b0 \
  --guard-reviewed-commit "$(git -C /home/dev/opencode-guard-plan2 rev-parse HEAD)" \
  --workflows-repo /home/dev/opencode-agent-workflows --workflows-commit 9b1c4c2498fcfc016baf5521119c907d4daac64e \
  --workflows-reviewed-commit "$(git -C /home/dev/opencode-agent-workflows-plan2 rev-parse HEAD)" \
  --broker-repo /home/dev/opencode-broker --broker-commit 309a5748758ef436cf53cfc5369dfef3df51be39 \
  --broker-reviewed-commit "$(git -C /home/dev/opencode-broker-plan2 rev-parse HEAD)" \
  --devbox-repo /home/dev/devbox --devbox-commit c5da280d751e65fd5637830921d0aef9b84c1ff8 \
  --devbox-reviewed-commit "$(git -C /home/dev/devbox rev-parse HEAD)" \
  --output-root /home/dev/.local/lib/opencode-fork-releases
```

Expected: the currently deployed binary and consumer snapshots are archived with `git archive` from exactly the four full baseline commits; assembly verifies each baseline exists and is an ancestor of its corresponding reviewed release commit; the dependency install succeeds in each baseline snapshot under the Task 1 policy (`npm ci --omit=dev --ignore-scripts` for guard, which has `package-lock.json`; `npm install --omit=dev --omit=peer --ignore-scripts --no-package-lock --no-fund --no-audit` for workflows and broker, which have none); the reviewed commits passed as `--*-reviewed-commit` come from the `-plan2` worktrees; the currently deployed core directory is copied and checksummed into the previous release; dirty working-tree bytes are never included; the complete previous release has its own `release.json` and `SHA256SUMS` before maintenance begins.

- [ ] **Step 4: Run the independent security review and record its result.**

```text
Review the assembled manifest, SHA256SUMS, installer, inventory, coordinator, and link diffs for:
1. immutable deny and provenance preservation;
2. path traversal, symlink replacement, cross-filesystem exchange, and journal recovery;
3. PID reuse and executable device/inode revalidation;
4. plaintext/query-token/credential leakage;
5. direct SQLite control writes, mixed-version activation, and rollback data loss.
Return exactly: PASS or FAIL, findings with file and line, and SHA-256 of the reviewed manifest.
```

Expected: independent reviewer returns `PASS` with no unresolved finding; the manifest SHA-256 matches the evidence record. A `FAIL` stops the plan before maintenance.

- [ ] **Step 5: Run the offline evidence check and inspect clean/intentional source state.**

```bash
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory scan --output "$EVIDENCE_DIR/inventory.json" --pre-cutover --require-proc --require-systemd --render
# `unsupported-old-worker` entries are recorded for unsupported old participant self-report; proc/systemd failures block.
INVENTORY_SHA=$(sha256sum "$EVIDENCE_DIR/inventory.json" | cut -d' ' -f1)
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout plan --release "$RELEASE_DIR" --inventory "$EVIDENCE_DIR/inventory.json" --offline
git -C /home/dev/opencode-guard --no-pager status --short
git -C /home/dev/opencode-agent-workflows --no-pager status --short
git -C /home/dev/opencode-broker --no-pager status --short
git -C /home/dev/devbox --no-pager status --short
```

Expected: plan evidence contains next/previous release hashes, component commits, deployment alias, and dynamically discovered units; unrelated broker/devbox dirty changes remain untouched and are not snapshot; no deployment or commit occurs; any unexpected source diff stops execution.

- [ ] **Step 6: Do not commit this task.**

Expected: Task 5 ends with release and review evidence only because it is an offline gate and must not create source history or deploy runtime state.

### Task 6: Maintenance checkpoint and stop-the-world apply

**Files:**
- Read/execute: `/home/dev/devbox/bin/opencode-worker-inventory`
- Read/execute: `/home/dev/devbox/bin/opencode-delegation-rollout`
- Evidence: prepared rollout directory under `$EVIDENCE_DIR/`

**Interfaces:**
- Consumes: Task 5 evidence, dynamically discovered `/proc` and user-systemd inventory, and the reviewed core operator interface.
- Produces: a Holden-confirmed inventory SHA, exact PID identity tuple record, stopped Workers/TUIs, activated immutable release, relative links, individually restarted recorded units, and acquisition still disabled.
- Supervisor: plain SSH/shell plus tested `systemd-run --user --collect`; never the current OpenCode TUI Worker.

- [ ] **Step 1: Generate the strict inventory and read-only rollout plan, render them, and stop for Holden confirmation.**

```bash
RELEASE_JSON=/home/dev/.local/state/opencode-delegation-rollout/release.json
BUILD_ID=$(jq -er '.buildID' "$RELEASE_JSON")
RELEASE_KEY=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="._-"))' "$BUILD_ID")
EVIDENCE_DIR="/home/dev/.local/state/opencode-delegation-rollout/$RELEASE_KEY"
RELEASE_DIR=$(jq -er '.releasePath' "$RELEASE_JSON")
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory scan --output "$EVIDENCE_DIR/inventory.json" --pre-cutover --require-proc --require-systemd --render
INVENTORY_SHA=$(sha256sum "$EVIDENCE_DIR/inventory.json" | cut -d' ' -f1)
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout plan --release "$RELEASE_DIR" --inventory "$EVIDENCE_DIR/inventory.json" --offline --output "$EVIDENCE_DIR/plan.json"
COORDINATION_DOMAIN=$(jq -er '.coordinationDomain' "$EVIDENCE_DIR/plan.json")
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout status --evidence "$EVIDENCE_DIR/plan.json"
```

Expected: a table lists every discovered process with PID, PPID, start-time ticks, executable path/device/inode/hash, argv, cwd, role, unit, sessions, listeners, source list, participant identity, restart descriptor, and old/new/unknown classification; old participant self-report becomes explicit `unsupported-old-worker` while proc/systemd failures block. Source errors are visible and strict mode exits nonzero. `plan` is read-only and writes evidence only. `status` also renders `liveAgentTeams` (path, leadID, childID, name, ownerPID); a non-empty list means the machine is not quiescent and Holden lets each team finish or retires it before Step 2.

- [ ] **Step 2: Stop and ask Holden to compare the rendered inventory table and confirm its exact SHA-256 before any terminate.**

```text
STOP. Compare the rendered inventory table with the live machine. Confirm the exact inventory SHA-256 printed by the tool, the PID/startTimeTicks/executable-device/inode tuple for every termination candidate, and the dynamically discovered Worker unit list. No process has been terminated yet. Reply with the exact SHA-256 and explicit approval to proceed, or reject the plan. Holden will use `/home/dev/.local/bin/opencode` for interactive-TUI startup after activation.
```

Expected: no apply action occurs until Holden explicitly confirms the exact SHA-256 and tuples; rejection leaves all processes and acquisition state unchanged.

- [ ] **Step 3: After confirmation, revalidate the confirmed inventory and start a unique release-keyed transient shell supervisor. Holden ceases F9/new-workflow activity, and starts no agent team, between confirmation and shutdown; every agent team must already have finished or been retired.**

The supervisor is started with no `--setenv`/`-E`: `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` must not reach it (Global Constraints).

```bash
systemd-run --user --collect --unit="opencode-delegation-rollout-apply-$RELEASE_KEY" \
  /usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout apply \
  --evidence "$EVIDENCE_DIR/plan.json" \
  --confirm-sha256 "$INVENTORY_SHA" \
  --inventory "$EVIDENCE_DIR/inventory.json"
```

If drain leaves branches, the apply command is resumed only after a separate Holden review, with one exact `--abort-branch-id ID` for each approved branch. No automatic IDs are supplied.

If apply exits with `live agent team at before-control` or `live agent team at before-terminate`, STOP and report the printed records and `$EVIDENCE_DIR/blocked-teams.json` to Holden. No process was terminated. Do not kill or signal any `ownerPID`. Holden lets each team finish or retires it, then the same apply command is re-run. A `before-control` refusal changed nothing; a `before-terminate` refusal comes after candidate control, so acquisition is already disabled and controllers revoked, as on the blocked-branch resume path.

Expected: systemd accepts one transient supervisor; the evidence journal records `apply-started`; the supervisor does not depend on a TUI Worker that is about to stop.

- [ ] **Step 4: Execute the tested coordinator stop, activation, and restart sequence.**

```python
apply(evidence, confirmation_sha, abort_branch_ids)
# Internal order: confirmation SHA -> no live agent teams (before-control) -> pre-v1 backup ->
# candidate maintenance control -> list/revoke controllers -> drain each branch for 30000 ms ->
# re-list -> explicit abort IDs only -> pending empty -> quiesced backup ->
# no live agent teams (before-terminate) -> exact PID TERM -> verify-empty ->
# installer.activate --release nextRelease.path -> links -> individual unit starts.
```

Expected: every PID is terminated individually, revalidated, and receives only `SIGTERM`; no automatic `SIGKILL` occurs; surviving PIDs fail closed and require a second Holden decision; all Workers/TUIs are absent before pointer/config switch; release activation and links occur only at zero Workers; dynamically discovered Worker units plus broker/watch/health restart individually; acquisition remains `disabled`. Broker and gateway are not Workers; gateway is status-only unless its own code changed.

- [ ] **Step 5: Verify maintenance state and preserve resumable evidence.**

```bash
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory scan --output "$EVIDENCE_DIR/post-apply-inventory.json" --strict --render
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory verify-no-old --inventory "$EVIDENCE_DIR/post-apply-inventory.json"
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout status --evidence "$EVIDENCE_DIR/plan.json"
systemctl --user --no-pager --full status opencode-model-broker.service opencode-model-watch.service opencode-broker-health.service
```

Expected: evidence phase is `applied`, acquisition is `disabled`, the active release hash matches the manifest, every restarted unit is recorded, and Holden respawns each `interactive-tui` with `/home/dev/.local/bin/opencode` in its recorded terminal/cwd; then a fresh TUI can resume from the journal.

- [ ] **Step 6: Do not commit this task.**

Expected: no commit occurs because this task changes live runtime state only; source history remains exactly the reviewed state from Tasks 1-5.

### Task 7: Restart, protocol/build/domain verification, and runtime canary

**Files:**
- Read/execute: `/home/dev/devbox/bin/opencode-delegation-rollout`
- Read/execute: `/home/dev/devbox/bin/opencode-worker-inventory`
- Read: release manifest and rollout evidence
- Runtime: restarted Worker/TUI processes, core delegation operator, guard, workflows, broker HUD, and attach endpoint

**Interfaces:**
- Consumes: Task 6 applied release with acquisition disabled; Plan 1 `MaintenanceIdentity = { buildID, protocol, coordinationDomain }` from `opencode debug delegation maintenance identity --database PATH --json` (closed: it carries no worker identity); Plan 1 `ParticipantStatus = { coordinationDomain, component, buildID, protocol, capabilities, availability, heartbeatAt, worker: { workerID, workerEpoch } }` from `participants --json` (`{ participants: ParticipantStatus[] }`); and `ControllerLeaseStatus` (its `workerID`/`workerEpoch`) from `controllers --json`. Worker identity is read only from `ParticipantStatus.worker` and `ControllerLeaseStatus`, never from the identity record or from flat participant fields.
- Consumes the embedded TUI APIs through `api.delegation` (`TuiPluginApi.delegation: TuiDelegationApi | null`): `api.delegation.acquireController({ rootSessionID, protocol, buildID })` returning a `TuiControllerAcquireResult` whose acquired form carries the opaque `handle`, then `api.delegation.renewController({ handle, leaseID, authorityEpoch })` and `api.delegation.releaseController({ handle, leaseID, authorityEpoch })`. A renew or release without `handle` is a Plan 1 contract violation and fails the case.
- Consumes branch APIs `reserveBranch`, `bindBranch`, `acknowledgeBranch`, `completeBranch`, `failBranch`, `acknowledgeOutcome`; remote `POST /delegation/controller/acquire`; headers `X-OpenCode-Delegation-Protocol`, `X-OpenCode-Controller-ID`, `X-OpenCode-Controller-Token`.
- Produces: canary evidence for every case, with acquisition disabled except the isolated canary root until all cases pass; then enables general acquisition through the operator API only.

- [ ] **Step 1: Verify every participant and process has one protocol/build/domain and no old executable inode remains.**

```bash
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory scan --output "$EVIDENCE_DIR/post-restart-inventory.json" --strict
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout status --evidence "$EVIDENCE_DIR/plan.json" --require-protocol opencode.delegation/v1 --require-release "$RELEASE_DIR" --require-domain "$COORDINATION_DOMAIN" --require-no-old-inodes
```

Expected: all participants agree on `opencode.delegation/v1`, the reviewed build ID, and one coordination domain; old or mixed processes fail the check and acquisition remains disabled.

- [ ] **Step 1a: Assert `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` is absent or `false` outside attended tmux TUIs.**

Run from the same plain SSH shell that started the supervisor and runs the canary harness (never from inside tmux, whose global environment sets the flag on purpose):

```bash
flag_ok() { case "$1" in ''|OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=false) return 0 ;; *) return 1 ;; esac; }
flag_in() { grep '^OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=' || true; }
bad=0
test -z "${TMUX:-}" || { echo "run Step 1a from a plain SSH shell, not tmux"; bad=1; }
# 1. this shell: the canary harness and any candidate server it launches inherit it
v=$(env | flag_in); flag_ok "$v" || { echo "canary shell: $v"; bad=1; }
# 2. the user systemd manager: inherited by the systemd-run supervisor and every Worker unit
v=$(systemctl --user show-environment | flag_in); flag_ok "$v" || { echo "systemd --user manager: $v"; bad=1; }
# 3. each restarted Worker unit: its configured Environment= and its live MainPID
for unit in $(jq -r '.workerUnits[]' "$EVIDENCE_DIR/plan.json"); do
  v=$(systemctl --user show -p Environment --value "$unit" | tr ' ' '\n' | flag_in); flag_ok "$v" || { echo "$unit Environment=: $v"; bad=1; }
  pid=$(systemctl --user show -p MainPID --value "$unit")
  test "$pid" -gt 0 || { echo "$unit has no MainPID"; bad=1; continue; }
  v=$(tr '\0' '\n' < "/proc/$pid/environ" | flag_in); flag_ok "$v" || { echo "$unit pid $pid: $v"; bad=1; }
done
# 4. oc-task still forces it off for its envelope run
grep -q '^OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS=false opencode ' /home/dev/devbox/bin/oc-task || { echo "oc-task no longer forces the flag to false"; bad=1; }
test "$bad" -eq 0 && echo "background-flag-scope-ok"
```

Expected: `background-flag-scope-ok` and nothing else. Any printed line stops Task 7 with acquisition still disabled; the fix is to remove the flag from that environment (this plan never adds it anywhere), not to relax this check.

- [ ] **Step 2: Run immutable deny, GOD command, and foreground handoff canaries.**

```text
Canary root: isolated disposable rootSessionID.
1. Select a tool absent from the agent: expect deny, no prompt, no pending interaction.
2. Select an explicit agent/tool deny under live GOD: expect deny, no prompt, no pending interaction.
3. Enter GOD through api.delegation.acquireController({ rootSessionID, protocol: "opencode.delegation/v1", buildID }); run an otherwise promptable command: expect one-time allow and a recorded authorityEpoch.
4. Create and acknowledge a foreground child with reserveBranch/bindBranch/acknowledgeBranch; ask a semantic question: expect one typed question_handoff at the primary and no child pending event.
```

```bash
for case_name in immutable-deny god-command foreground-handoff; do
  /usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case "$case_name" --evidence "$EVIDENCE_DIR/plan.json"
done
```

Expected evidence fields: `case`, `rootSessionID`, `branchID`, `controllerID`, `authorityEpoch`, `protocol`, `buildID`, `workerID`, `workerEpoch`, `coordinationDomain`, `outcomeID`, `outcomeKind`, `pendingInteractionCount`, `userEventCount`, `result`, `timestamp`. `protocol`, `buildID` and `coordinationDomain` come from `MaintenanceIdentity`; `workerID`/`workerEpoch` from the owning `ParticipantStatus.worker` (or the case's `ControllerLeaseStatus`).

- [ ] **Step 3: Run background durable, nested, and F9 next-decision-fence canaries.**

```text
1. Register a background child and force a question: expect one durable outcome, one idempotent root synthetic result, replay after delivery-worker restart, and acknowledgeOutcome.
2. Register a nested child path parentBranchID -> childBranchID: expect one propagated outcome owned by the root execution and no intermediate paraphrase.
3. Start a prompt with two permission decisions, press F9/releaseController between them: expect the first already-committed decision to remain valid and the next decision to reject or hand off at the fenced authorityEpoch.
```

```bash
for case_name in background-handoff nested-handoff revocation-fence; do
  /usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case "$case_name" --evidence "$EVIDENCE_DIR/plan.json"
done
```

Expected: evidence contains `delivery: background`, `idempotencyKey`, `deliveryClaimID`, `rootOwnerExecutionID`, `branchPath`, `acknowledged: true`, and separate pre/post-revocation decision epochs; no delegated pending state or user-visible child event exists.

- [ ] **Step 4: Run controller crash and lease expiry canary.**

```text
1. Acquire a controller and stop its heartbeat source at t=0.
2. At monotonic 5.0 seconds, attempt takeover: expect ownership conflict because only two heartbeats have been missed.
3. At monotonic 6.0 seconds or later, attempt takeover: expect the old lease expired, authority epoch fenced, and takeover succeeds.
4. Renew the old lease after takeover: expect stale authority rejection.
```

Expected: evidence records `heartbeatIntervalMs: 2000`, `missedHeartbeats: 3`, `expiryWindowMs: 6000`, conflict at monotonic 5.0s, successful takeover at or after monotonic 6.0s, recorded measurement tolerances, and stale-renew denial.

```bash
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case lease-expiry --evidence "$EVIDENCE_DIR/plan.json"
```

- [ ] **Step 5: Run remote attach authentication and transport canaries with ephemeral credentials.**

```bash
umask 077
credential_file="$(mktemp)"
trap 'unset OPENCODE_SERVER_PASSWORD; rm -f "$credential_file"' EXIT
python3 -c 'import secrets,sys; open(sys.argv[1],"w").write(secrets.token_urlsafe(32)+"\n")' "$credential_file"
chmod 600 "$credential_file"
IFS= read -r OPENCODE_SERVER_PASSWORD < "$credential_file"
export OPENCODE_SERVER_PASSWORD
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case attach-plaintext --evidence "$EVIDENCE_DIR/plan.json"
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case attach-missing-basic --evidence "$EVIDENCE_DIR/plan.json"
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case attach-https --evidence "$EVIDENCE_DIR/plan.json"
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case attach-ssh-loopback --evidence "$EVIDENCE_DIR/plan.json"
```

Expected: plaintext remote attach is refused; missing Basic Auth is refused even when ordinary routes permit anonymous access; `attach-https` passes only when a remote-HTTPS request, including an attempted `X-Forwarded-Proto: https`, `X-Forwarded-For: 127.0.0.1`, `Host: localhost`, and local-looking `Origin` spoof, is refused with `insecure_transport`; SSH-loopback succeeds through a listener actually bound to numeric loopback. The canary harness uses ephemeral local ports, closes every temporary listener/tunnel, and removes its 0700 temporary credential material; no credential appears in argv, logs, manifest, or evidence. Remote HTTPS is future gated work, not a canary success path.

- [ ] **Step 6: Run full runtime canary cases and enable general acquisition only after every case passes.**

```text
Required cases: immutable-deny; god-command; foreground-handoff; background-handoff; nested-handoff; revocation-fence; lease-expiry; attach-plaintext; attach-missing-basic; attach-https; attach-ssh-loopback.
When all evidence entries have `result="pass"`, assert every required case with jq, then invoke the candidate maintenance CLI at `$NEXT_RELEASE/bin/opencode` with `debug delegation maintenance enable-acquisition --database /home/dev/.local/share/opencode/opencode.db --json`; otherwise leave acquisition disabled and invoke rollback after Holden review.
```

```bash
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case all --evidence "$EVIDENCE_DIR/plan.json"
# Group by case and require exactly one passing record for every required case, not just total length 11
jq -e '
  .canaryEvidence as $cases |
  ["immutable-deny","god-command","foreground-handoff","background-handoff","nested-handoff","revocation-fence","lease-expiry","attach-plaintext","attach-missing-basic","attach-https","attach-ssh-loopback"] as $required |
  ($cases | group_by(.case) | map(select(.[0].case as $c | $required | index($c))) | map(select(([.[] | .result == "pass"] | length) == 1))) | length == 11
' "$EVIDENCE_DIR/plan.json"
/usr/bin/python3 - "$EVIDENCE_DIR/plan.json" <<'PY'
import json
import subprocess
import sys
plan = json.load(open(sys.argv[1]))
subprocess.run([
    plan['nextRelease']['path'] + '/bin/opencode', 'debug', 'delegation', 'maintenance',
    'enable-acquisition', '--database', '/home/dev/.local/share/opencode/opencode.db', '--json',
], check=True)
PY
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout status --evidence "$EVIDENCE_DIR/plan.json" --require-acquisition enabled
```

Expected: evidence has one passing record for each named case, no delegated pending interactions, no mixed process identity, and a final `acquisition: enabled` record only after the isolated canary passes. Any failure leaves `acquisition: disabled` and invokes rollback after Holden review.

- [ ] **Step 7a: Generate and render rollback inventory, print its SHA, and exit.**

```bash
# Conditionally detect canary failure, generate/render fresh rollback inventory, print SHA, and exit
if ! /usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout canary --case all --evidence "$EVIDENCE_DIR/plan.json"; then
  /usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory scan --output "$EVIDENCE_DIR/rollback-inventory.json" --strict --render
  ROLLBACK_INVENTORY_SHA=$(sha256sum "$EVIDENCE_DIR/rollback-inventory.json" | cut -d' ' -f1)
  printf 'ROLLBACK_CONFIRMATION_REQUIRED: Fresh inventory SHA is %s\n' "$ROLLBACK_INVENTORY_SHA"
  printf 'Holden must confirm the exact PID tuples and this SHA before rollback proceeds.\n'
  exit 1
fi
```

Expected: Step 7a generates and renders the fresh inventory, prints its SHA, and exits with `ROLLBACK_CONFIRMATION_REQUIRED` without invoking rollback.

- [ ] **Step 7b: Only if Step 7a emitted `ROLLBACK_CONFIRMATION_REQUIRED`, STOP for Holden confirmation, verify the dynamic confirmation SHA, and invoke rollback.**

```bash
# STOP. Holden confirms the exact SHA and PID tuples before this block is resumed.
: "${HOLDEN_CONFIRMED_ROLLBACK_SHA:?set this to the exact SHA Holden confirmed}"
export HOLDEN_CONFIRMED_ROLLBACK_SHA
test "$HOLDEN_CONFIRMED_ROLLBACK_SHA" = "$(sha256sum "$EVIDENCE_DIR/rollback-inventory.json" | cut -d' ' -f1)" || {
  printf 'rollback confirmation SHA mismatch\n'
  exit 1
}
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout rollback \
  --evidence "$EVIDENCE_DIR/plan.json" \
  --inventory "$EVIDENCE_DIR/rollback-inventory.json" \
  --confirm-sha256 "$HOLDEN_CONFIRMED_ROLLBACK_SHA"
```

Expected: Step 7b stops for Holden confirmation, uses dynamic environment variable `HOLDEN_CONFIRMED_ROLLBACK_SHA`, verifies it equals the file SHA, and invokes rollback only after that verification. No pre-deploy SHA reuse.

- [ ] **Step 8: Do not commit this task.**

Expected: no source commit occurs because this task is live runtime verification and canary evidence, not source implementation.

### Task 8: Resume original broker Task 7, final checks, and allowlisted pushes

**Files:**
- Read/execute: `/home/dev/opencode-broker/docs/superpowers/plans/2026-09-29-broker-native-classifier-routing.md`, lines 639-742
- Read/execute: Plan 3 evidence under `$EVIDENCE_DIR/`
- Push only: `/home/dev/opencode-agent-workflows` from this plan, branch `main`, only when an intended reviewed commit exists. The original resumed Task 7 owns broker, guard, and devbox pushes. `/home/dev/fleet-core` is never pushed separately.

**Interfaces:**
- Consumes: passing Task 7 runtime evidence, disabled-then-enabled acquisition record, reviewed commit IDs, and original broker Task 7 ownership.
- Produces: resumed Task 7 evidence, final release checks, inspected status/log/diffs, exact resumed Task 7 pushed commit IDs for broker/guard/devbox, an exact workflow pushed commit ID when present, versions, test counts, service state, protocol/build/domain, canary evidence, rollback release/hash, and old-process absence.
- Does not implement or duplicate broker Task 7; the resumed workflow owns its original commands and runtime steps.

- [ ] **Step 1: Run Plan 3 final checks.**

```bash
RELEASE_JSON=/home/dev/.local/state/opencode-delegation-rollout/release.json
BUILD_ID=$(jq -er '.buildID' "$RELEASE_JSON")
RELEASE_KEY=$(python3 -c 'import sys,urllib.parse; print(urllib.parse.quote(sys.argv[1], safe="._-"))' "$BUILD_ID")
EVIDENCE_DIR="/home/dev/.local/state/opencode-delegation-rollout/$RELEASE_KEY"
RELEASE_DIR=$(jq -er '.releasePath' "$RELEASE_JSON")
/usr/bin/python3 /home/dev/devbox/bin/install-opencode-fork verify --release "$RELEASE_DIR"
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory scan --output "$EVIDENCE_DIR/final-inventory.json" --strict
/usr/bin/python3 /home/dev/devbox/bin/opencode-worker-inventory verify-no-old --inventory "$EVIDENCE_DIR/final-inventory.json"
systemctl --user --no-pager --full status opencode-model-broker.service opencode-model-watch.service opencode-broker-health.service opencode-gateway.service
# Compare each working tree's git --no-pager status --short to the baseline status from plan evidence
# any new or missing status entry blocks; preserve unrelated baseline dirt without staging/stashing/rewriting it
for repo_key in guard workflows broker devbox; do
  case "$repo_key" in
    guard) repo=/home/dev/opencode-guard ;;
    workflows) repo=/home/dev/opencode-agent-workflows ;;
    broker) repo=/home/dev/opencode-broker ;;
    devbox) repo=/home/dev/devbox ;;
  esac
  baseline_status=$(jq -r --arg key "$repo_key" '.baselineStatus[$key] // empty' "$EVIDENCE_DIR/plan.json")
  actual_status=$(git -C "$repo" --no-pager status --short)
  if test "$actual_status" != "$baseline_status"; then
    printf 'baseline mismatch for %s: expected "%s" but got "%s"\n' "$repo_key" "$baseline_status" "$actual_status"
    exit 1
  fi
  git -C "$repo" --no-pager log -1 --oneline
  git -C "$repo" --no-pager diff HEAD^ HEAD
done
```

Expected: Plan 3 checks pass for the active runtime and release; `verify-no-old` allows new Workers but rejects old or unknown Workers; required services and gateway state are recorded; four repositories are checked, with the devbox status also covering the `/home/dev/fleet-core` alias. The resume call occurs only after these checks pass.

- [ ] **Step 2: Resume the original broker Task 7 workflow.**

```text
workflow_run name:"plan-run" args:{"plan":"/home/dev/opencode-broker/docs/superpowers/plans/2026-09-29-broker-native-classifier-routing.md","ultra":false,"escalate":true} resume:true
```

Expected: the resumed workflow produces its required evidence; no evidence is required before this workflow creates it.

- [ ] **Step 3: Inspect and require resumed Task 7 evidence.**

```text
Required resumed-workflow evidence: broker/guard/devbox test results; broker swap state; broker restart success; model-watch start; no model pins; no modelVariants; fresh luna variant; disposable classifier smoke result; decisions.jsonl record; broker.json record; intended commit IDs; exact pushed main branch names and 40-hex commit IDs for broker, guard, and devbox.
```

Expected: every required field is present and passing; missing evidence stops pushes. The resumed original Task 7 owns its tests, runtime verification, and broker/guard/devbox pushes; no implementation or push is duplicated here.

- [ ] **Step 4: Push the remaining workflows commit only after strict predicates.**

```bash
# Compare the workflows working tree's git --no-pager status --short to the baseline status captured in plan evidence
# any new or missing status entry blocks; preserve unrelated baseline dirt without staging/stashing/rewriting it
for repo_key in workflows; do
  repo=/home/dev/opencode-agent-workflows
  commit=$(jq -r --arg key "$repo_key" '.intendedPushCommits[$key] // empty' "$EVIDENCE_DIR/plan.json")
  if test -z "$commit"; then
    printf 'no-push: no intended commit for %s\n' "$repo_key"
    continue
  fi
  # Compare to baseline status from plan evidence; any difference blocks
  baseline_status=$(jq -r --arg key "$repo_key" '.baselineStatus[$key] // empty' "$EVIDENCE_DIR/plan.json")
  actual_status=$(git -C "$repo" --no-pager status --short)
  if test "$actual_status" != "$baseline_status"; then
    printf 'baseline mismatch for %s: expected "%s" but got "%s"\n' "$repo_key" "$baseline_status" "$actual_status"
    exit 1
  fi
  # Verify commit is 40 lowercase hex, exact HEAD, and origin/main ancestry
  test "${#commit}" -eq 40 && test "$commit" = "${commit,,}" && [[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { printf '%s commit not 40-hex lowercase\n' "$repo_key"; exit 1; }
  test "$(git -C "$repo" rev-parse HEAD)" = "$commit" || { printf '%s HEAD mismatch\n' "$repo_key"; exit 1; }
  git -C "$repo" fetch origin main
  git -C "$repo" merge-base --is-ancestor origin/main "$commit" || { printf '%s not ancestor of origin/main' "$repo_key"; exit 1; }
  git -C "$repo" push origin "$commit:main"
done
```

Expected: after the resumed Task 7 passes, the only possible push from this plan is the workflows `main` commit. It must satisfy baseline-status equality, a 40-hex lowercase SHA, exact HEAD, and `origin/main` ancestry; any failed predicate exits nonzero. Missing intended workflow commits produce `no-push`. Broker, guard, and devbox pushes are not duplicated, and fleet-core is never pushed separately.

- [ ] **Step 5: Record the final operator report.**

```bash
/usr/bin/python3 /home/dev/devbox/bin/opencode-delegation-rollout report --evidence "$EVIDENCE_DIR/plan.json" --output "$EVIDENCE_DIR/final-report.json"
jq -e '
  (.releaseBuildID | type == "string" and length > 0)
  and (.releaseSHA256 | test("^[0-9a-f]{64}$"))
  and (.rollbackRelease | type == "string" and length > 0)
  and (.rollbackSHA256 | test("^[0-9a-f]{64}$"))
  and (.componentCommitIDs | all(.[]; type == "string" and length > 0))
  and (.versions.bun == "1.3.14" and (.versions.binary | type == "string" and length > 0))
   and (.testCounts | type == "object" and all(.[]; type == "number" and floor == . and . >= 0))
   and (.services == {"opencode-model-broker.service":"started","opencode-model-watch.service":"started","opencode-broker-health.service":"started"})
  and .protocol == "opencode.delegation/v1"
  and (.buildID == .releaseBuildID)
  and (.coordinationDomain | type == "string" and length > 0)
  and (.canaryEvidence == $canary_dir)
  and (.oldProcessAbsence == true)
   and (.resumedTask7PushedMainCommits | type == "object" and all(.[]; test("^[0-9a-f]{40}$")))
   and (.pushedMainCommits | type == "object" and all(.[]; test("^[0-9a-f]{40}$")))
' --arg canary_dir "$EVIDENCE_DIR" "$EVIDENCE_DIR/final-report.json"
```

Expected: `report` writes actual values from evidence; the exact `jq -e` assertion exits `0` only for the complete schema, exact protocol, release/rollback hashes, test counts, services, canary evidence, resumed Task 7 pushed commit IDs, any pushed workflows commit IDs, and no-old-process proof.

- [ ] **Step 6: Do not commit this task.**

Expected: no Task 8 commit occurs because the resumed workflow and final release checks consume reviewed commits and only push the allowlisted intended commits; this plan does not create a new source commit.
