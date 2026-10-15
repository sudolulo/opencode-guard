# Parent permission authority implementation plan

## Approved scope and source-only checkpoint (2026-10-13)

Parent authority and the minimal option-B incarnation subset are approved. See the [approved session-incarnation design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-session-incarnation-design.md). RootAdmission/per-root generations, native admission receipts, and DeletionOperation remain deferred and unapproved. No commit, push, build, install, restart, SDK generation, or dependency updates are authorized. The isolated native worktree at `/home/dev/projects/opencode-god-catchall-bridge` is a DIRTY working checkpoint, not clean. Never touch foreign `/home/dev/projects/opencode`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans for this parent-orchestrated change. Steps use checkbox syntax. The primary keeps architecture/security/integration; named specialists own disjoint implementation paths.

## Goal

Implement user-approved parent permission authority and private, one-call human-only hard-rule exceptions without weakening independent tool-role, ownership, or native hard-rule constraints. No deployment or release is included.

## Architecture

Extend native `permission.ask` and request-local `prepareForRequest`; preserve original native rules and use validated approval proposals. Parent approval is model-routed to a god-mode root; operator and human-only approvals are user-routed to the owning attended root. Human-only consent uses only private native TUI worker RPC. Guard brokers authority using verified ancestry and capabilities; workflow lifecycle yields only for an owned active child request. See [the design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md).

This session's directory is not a Git repository, and `plan-run` has no external-repository working-directory argument. The primary orchestrates fixed, disjoint modules in the existing isolated checkout and retains integration responsibility. It does not recreate a sequential workflow counter or hand off the primary session.

## Tech stack

- **Schema:** native `permission.ask`, optional approval kind and root session ID, exact request metadata.
- **Effect:** permission preparation, pending/decision lifecycle, and private user reply.
- **Bun:** native engine, API, TUI and package regression tests; Bun 1.4.2 at `/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun`, frozen install with scripts ignored, and `OPENCODE_CHANNEL=fork/snip-always-prefix` before builds.
- **Native TUI:** private permission callback and exact command/workdir/reason hard-rule dialog.
- **Node plugins:** guard authority broker and workflow lifecycle regressions.

## Specification

[Parent permission authority design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md)

## Global constraints

- Preserve read-only role limits, tool availability, ownership, and redaction. Never add global/session permission writes, child mode writes, unrestricted inheritance, Always grants, approval tickets, or wider grants.
- Human-only means a private trusted TUI response for exactly one request; no public `human=true` or source-actor trust. Native deny is never turned into allow by a hook.
- Derive canonical attended root and ancestry from trusted session state. Bind exact request, command, effective cwd, request ID, tool call ID, and leaf session. Revalidate at decision time.
- Probe native capabilities and background support; missing bridge fails loudly. Do not loosen old running hosts.
- Native TUI is the deployment target. No install/restart/deployment, commit, push, merge, or integration claims are authorized.
- Do not edit/build dirty `/home/dev/projects/opencode`; use the isolated native worktree at `/home/dev/projects/opencode-god-catchall-bridge`, which is a DIRTY working checkpoint. Preserve the already-implemented workflow ownership prerequisite and request its independent review; do not redo or overwrite it.
- Never run root Bun tests; use the project’s non-root test conventions.

## Review focus

1. Runtime Always cannot override `forceAsk`, human-only, or original native hard rules.
2. Generic SDK/HTTP or spoofed actor cannot reach trusted human approval.
3. Foreground workflow yield, abort/deletion cleanup, and exactly-once continuation cannot deadlock or leak listeners.
4. Grandchild routing, cross-root checks, and mode changes are validated against current actual ancestry and mode.
5. Old-host capability failure remains fail-closed and explicit.

## Parallel work and interfaces

Three cohesive, non-overlapping scopes may proceed in parallel only after these interfaces are frozen. The main integration owner coordinates and reconciles cross-repository protocol tests and independent review.

### Task 1 — Native engine authority and trusted TUI reply

Work in the isolated native worktree only; it is a DIRTY working checkpoint:

- `packages/schema/src/v1/permission.ts`
- `packages/core/src/v1/permission.ts`
- `packages/plugin/src/index.ts`
- `packages/opencode/src/permission/index.ts`
- `packages/opencode/src/session/tools.ts`, `packages/opencode/src/tool/shell.ts`, `packages/opencode/src/cli/tui/worker.ts`, `packages/opencode/src/cli/cmd/tui.ts`
- `packages/opencode/src/server/routes/instance/httpapi/{groups,handlers}/{permission,experimental}.ts` as needed
- `packages/tui/src/{context/sdk.tsx,routes/session/index.tsx,routes/session/permission.tsx}`
- SDK generated artifacts only via the project generator

Implement exact interfaces: approval kind and schema; `prepareForRequest`; internal `replyFromUser`; private RPC callback; capability version; and `escalate` reply semantics as specified. Add real engine/Bun and UI-helper regressions under existing package frameworks. Write failing tests before producer code, show RED, implement, then targeted and package-full tests and typechecks. Do not run root Bun tests.

Superseded illustrative test shape: production regressions must establish private global-policy provenance; deliberate role/read/session/tool denials remain deny. Use the actual `test/permission/authority.test.ts`, `test/permission/parent-authority.test.ts`, `test/permission/tools-provenance.test.ts`, and `test/agent/permission-context.test.ts`; do not infer provenance from flattened rule patterns.

### Task 2 — Guard authority broker and primary-tool configuration

Files: `/home/dev/opencode-guard/lib/authority.js` (new focused module), `lib/policy.js`, `plugin.js`, `tests/authority.test.mjs`, and existing permission/native-deny tests; `/home/dev/devbox/config/opencode/opencode.json` (`primary_tools` additive only). Do not change `tester.md` or weaken hard denies.

Implement the frozen broker protocol and a production-used pure helper `selectApproval({ rootMode, hard, rootSessionID })`: `rootMode: 'god', hard: true` selects `human-only`; `hard: false` selects `parent`. Add real fake-client event-flow fixtures, not behavior-only mocks, and test production functions and pending protocol. Write failing tests first, show RED, implement, then run `node --test tests/*.test.mjs`.

Actual test implementation (new tests/authority.test.mjs):

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { selectApproval } from '../lib/authority.js';

test('hard requests stay human-only under god', () => {
  assert.deepEqual(selectApproval({ rootMode: 'god', hard: true, rootSessionID: 'ses_root' }), { kind: 'human-only', sessionID: 'ses_root' });
  assert.deepEqual(selectApproval({ rootMode: 'god', hard: false, rootSessionID: 'ses_root' }), { kind: 'parent', sessionID: 'ses_root' });
  assert.deepEqual(selectApproval({ rootMode: 'auto', hard: false, rootSessionID: 'ses_root' }), { kind: 'operator', sessionID: 'ses_root' });
});
```

The pure `selectApproval` function classifies requests; it does not authorize them. The broker checks the actual native pending request, current root mode, and ancestry.

### Task 3 — Workflow yield and lifecycle integration

Files: `/home/dev/opencode-agent-workflows/lib/core.js`, `lib/runtime.js`, optional new `lib/approval-yield.js`, `tests/workflows.test.mjs`, and focused tests. Preserve the already-completed two-file race/ownership fix.

Bind run membership to the actual requesting run child, not any request from the same root. Foreground approval yields without aborting or double-executing; background completion preserves normal ownership. An unrelated run request must not yield. Ensure listeners are removed after completion/cancel. Run `node --test tests/*.mjs`.

The promotion prerequisite is already implemented and parent-verified: `taskChildFromAfter(input, { metadata: { sessionId: 'ses_child', background: true } }) === null`, while foreground results retain their IDs. Preserve that regression and independently review it; do not add it again.

## Execution checklist

- [ ] **Task 1 (RED):** Historical illustrative example above is superseded; leave unchecked until reconciled evidence establishes the required provenance in the actual native tests.
- [ ] **Task 1 (implement):** Implement exact interfaces: approval kind and schema; `prepareForRequest`; internal `replyFromUser`; private RPC callback; capability version; and `escalate` reply semantics as specified. Add real engine/Bun and UI-helper regressions under existing package frameworks.
- [ ] **Task 1 (GREEN):** Run targeted tests and record GREEN output.
- [ ] **Task 1 (full/review):** Run full applicable suites and typechecks: native package suites/typechecks (non-root Bun).
- [ ] **Task 2 (RED):** Write failing tests first for guard authority broker and primary-tool configuration.
- [ ] **Task 2 (implement):** Implement the frozen broker protocol and production helper `selectApproval`. Add real fake-client event-flow fixtures, not behavior-only mocks, and test production functions and pending protocol.
- [ ] **Task 2 (GREEN):** Run targeted tests and record GREEN output.
- [ ] **Task 2 (full/review):** Run guard `node --test tests/*.test.mjs`.
- [ ] **Task 3 (RED):** Write failing tests first for workflow yield and lifecycle integration.
- [ ] **Task 3 (implement):** Bind run membership to the actual requesting run child; foreground approval yields without aborting or double-executing; background completion preserves normal ownership.
- [ ] **Task 3 (GREEN):** Run targeted tests and record GREEN output.
- [ ] **Task 3 (full/review):** Run workflow `node --test tests/*.mjs` and review the existing promotion regression together with the new yielding tests.
- [ ] Independently review all three scopes, including the existing ownership prerequisite; resolve findings and report uncommitted state. Do not commit, push, merge, install, restart, or claim runtime proof. Real TUI runtime proof requires a separately authorized new binary.

## Checkpoint evidence (not acceptance)

These are author-run suites with footers inspected by the lead, not independent tester execution or runtime verification:

| Scope | Author result | Lead-inspected output |
|---|---|---|
| Guard `node --test tests/*.mjs` | 325 pass, 0 fail, 0 skipped; author exit 0 | [full output](file:///tmp/opencode/guard-evict-full.log), lines 326–333 |
| Workflows `node --test tests/*.mjs` | 241 pass, 0 fail, 0 skipped; author exit 0 | [full output](file:///tmp/opencode/wf-final-full-suite.log), lines 268–275 |

These counts predate the current workflow birth-repair and will be superseded. Earlier focused permission verification is not final; the separate explicit-role origin-policy followup remains under its assigned writer and independent review. Checkpoint remains HELD pending workflow unbound recovery, active-child birth identity, canonical requestID repairs, and independent re-review. Holden selected the [incarnation-bound cleanup repair](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md); its [source/test plan](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-13-incarnation-bound-cleanup.md) covers native atomic abort/delete/interrupt effects without full RootAdmission. Specification is not implementation or acceptance. Real TUI and SDK generation were not performed or authorized; this is not a claim that the full native suite is green.
