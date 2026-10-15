# Parent permission authority and human-only hard-rule exceptions

> **Partly superseded by the [god escalation policy design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md) (Holden, 2026-10-14).** A god root's own commands are now allowed, named hard rules included. Every refusal a descendant of a god root meets now goes to the root model as an exact once/reject parent ask; Holden is never prompted under god. Under other attended roots, descendant refusals are judged like the root's own command, and named hard rules ask Holden once. The native eligibility rules below (catch-all provenance, `humanOnlyDenied`, ceilings and read seats never escalating, no deny-to-allow) are replaced, and their provenance machinery is removed. The private TUI human channel, exact request IDs, the once/reject-only parent tools, the Always refusal, capability probing (now `permissionAuthority: 2`), incarnation binding and the workflow lifecycle below still bind. Section 3 of the new design lists each superseded line.

**Status:** Behavior authorized; architecture specified below for implementation; not deployed.

## Supersedes and contract

This supersedes the [unreviewed earlier design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-12-god-delegated-native-bridge-design.md) semantics of blanket god delegation and named-denies-never-prompt.

Ordinary god-mode requests do not prompt the user. Auto mode prompts for sensitive requests. Children send requests to their owning parent authority, which may judge ordinary requests when that authority holds god mode.

Holden specified the hard-rule exception:

> the hard rules should never prevent real work, so make sure they dont. otherwise they should block even god mode, but allow me to explicity allow them if prompted

God mode does not override a human-only hard gate. An explicit exception is bound to the exact tool request, command, effective working directory, and leaf call ID; it is one-time only. There are no Always grants, tickets, wider grants, child mode writes, or unrestricted inheritance. Preserve read-only role limits, tool availability, ownership, and redaction.

## Verified implementation context and constraints

- The current root mode file is `~/.local/share/opencode/modes/ses_ecd66fd6fffedpEF2Tv3TCpK0s=god` (read). Installed guard source is `/home/dev/opencode-guard/plugin.js` (1168 lines); native config deny copy is at 830–839 and god bypass at 841. An earlier public checkout is not authoritative.
- `/home/dev/projects/opencode` is on dirty branch `fork/atomic-runtime-contracts` with four foreign session files. Do not edit or build it.
- `/home/dev/projects/opencode-god-catchall-bridge` is now a DIRTY working checkpoint, not clean; it is on `fork/god-catchall-bridge` at `a5b92cdab987e99d8507aef1d3751e2f73b41f19`, with confirmed merge base `4998bf2353920788a7927f9cf0197d6b5a97043b`; distance from base is unverified. The deployment integration branch `fork/effort-combined` has unverified later changes. Make no installation or integration claims.
- Core build tool is Bun 1.4.2 at `/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun`. Use frozen install with scripts ignored. Before any build, set `OPENCODE_CHANNEL=fork/snip-always-prefix`.
- No commit, push, merge, install, restart, or new-feature deployment is authorized. The separate old devbox commit/push remains blocked.
- An ownership prerequisite is already implemented but uncommitted: `/home/dev/opencode-agent-workflows/lib/child-session.js` (`taskChildFromAfter` ignores `metadata.background=true`). `tests/terminal-intents.mjs`: RED 3/4, GREEN 4/4; full suite 210/210. It needs independent review; do not redo or overwrite it.

## Native permission authority

Extend the existing native `permission.ask` hook and request-local preparation. Do not add a config action enum, globally weaken deny into ask, or duplicate the hard-rule list. Hook output retains status and may propose `approval` and `forceAsk`; native core validates the proposal against original rules and lineage, and never converts native deny into allow.

The optional schema is `approval?: { kind: 'human-only' | 'parent' | 'operator'; sessionID: string; reason?: string }`. `sessionID` is the canonical attended root derived and validated from actual session ancestry, never model-supplied. A named command-policy deny may become a `human-only` ask; exec/write-agent catch-all bash deny may become parent/operator ask. Disabled tools, read-only writes, and inherited explicit ceilings remain blocked.

Replace or extend `Permission.softenForRequest` with `prepareForRequest(input)`, returning an Effect of `{ ruleset, approval?, forceAsk, always }`. Its input is `{ req, sessionID, rootSessionID, agentRules, sessionRules, trigger }`; `req` contains `{ permission, patterns, always, metadata, tool? }`, and `trigger(input, output)` is an Effect callback. Legacy helpers may remain as compatibility wrappers; the actual tool path must use the prepared request. Requests retain exact per-call rulesets; there are no global/session permission writes. `forceAsk` ignores runtime Always approvals; original native hard rules cannot be overridden by runtime-approved patterns. Native pending human-only approvals have `always=[]`; `reply: always` cannot grant wider access.

Add effective `workdir` to bash permission metadata at the shell tool source. Bind command, cwd, request ID, tool call ID, and leaf session to each decision; do not allow a command swap between before/event hooks.

## Human-only path and authority tools

The permission service adds internal `replyFromUser`, callable only by the native private TUI worker RPC `permissionReply`. Generic SDK/HTTP `Permission.reply` refuses human-only approval even if payload claims actor `human`; consent comes from server-owned private RPC context, not a JSON actor flag. TUI context receives a private `permissionReply` callback and the hard dialog uses it. Show exact command, effective workdir, and reason; allow only once or reject. Ordinary parent requests stay hidden from the human UI. Human-only/operator requests at any descendant depth route to the owning root, not only direct children. Generic `reply` accepts `escalate` only as a parent-to-operator downgrade (no approval), retaining pending ID and emitting an upsert event. Ordinary once/reject behavior remains; parent tools never support Always. Unsupported transports fail clearly without approving hard requests. Native TUI is the current deployment target.

Add root-only tools `guard_pending()` and `guard_decide({ permissionID, decision: 'once' | 'reject', message? })`. Trust `ctx.sessionID`; check current root god mode, full actual ancestry, and that pending request still matches authority, call, and cwd and is not human-only. Consume once. Reject cross-root, sibling, child self-approval, stale, deleted, and replayed requests. If mode changes before decision, generic reply `escalate` converts the parent request to operator pending; never approve using an old god snapshot. Derive pending lists from the native authoritative API, not stale approval tickets. List tool names in experimental `primary_tools` so children cannot call them.

## Guard behavior and capabilities

Native `GET /experimental/capabilities` exposes `permissionAuthority: 1`. Guard probes version and background-subagent support before deferring existing fail-closed checks. Missing bridge fails loudly; it is not silently disabled. An old running host cannot suddenly be loosened by a new guard.

For an ordinary sensitive child request, verify current ancestry, capabilities, and owned attended root. Derive parent authority when the top root's current mode is god, otherwise operator. Root god ordinary requests are auto-approved by native ask; existing safe auto approvals for children remain unchanged. Do not throw RISKY or original named-deny requests before the bridge when eligible; native ask holds the request. Exclude human-only requests before god bypass and every auto-approval handler. Children cannot edit control files or self-grant. Genuine hard-control rules use the human route as applicable; tool-role constraints remain separate.

Persist native pending approval first, then promote the owning root's direct task-child job (an ancestor of requester) using the existing background-promotion API; append pending IDs to the parent task after its result so its model can judge. Keep child alive and owned; parent abort cascades. Background teams notify root. Verified manager/session ancestry also makes workflow SDK children eligible; this is not limited to native-created parts. Foreground `workflow_run` races normal completion against approval events from its owned active child. On approval, yield a background run handle and pending IDs, then continue the original run exactly once. Normal completion retains its notifier and cleanup. Do not queue-only await parent idle while parent waits on workflow. Grandchildren route to the actual root; no invisible prompts. No polling or extra OpenCode processes.

Threat model trusts core and plugins; it makes no claim against a malicious same-OS user or debugger. Do not add public `human=true` or actor-spoof paths.

## Acceptance matrix

| Case | Required result |
|---|---|
| Root god ordinary request | No human prompt |
| Root auto RISKY request | One user prompt |
| Safe auto request | No user prompt |
| Direct, foreground, background-team, workflow, or grandchild god request | Root model judges; once continues child |
| Auto child request | Root user decides |
| Human-only request at root or descendant, even under god | Private human once/reject |
| Always or second hard call | Cannot persist or exempt second call |
| Generic HTTP or source actor claim | Cannot approve human-only request |
| Replay, cross-root, stale request, or mode change | Rejected or downgraded, never approved from stale authority |
| Promotion after hook and before mode event | Does not retire child |
| Root abort or deletion | Cleans held calls and runs |
| Hard absolute-path project operation | Can proceed after explicit once |
| Read-only role or missing tool | Remains restricted/unavailable |

Prove real TUI runtime only after an authorized new binary; unit tests are not end-to-end proof.

## Scope reconciliation

The [approved session-incarnation design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-session-incarnation-design.md) approves only the minimal option-B immutable incarnation subset. The [full native freshness draft](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-native-permission-freshness-design.md) remains deferred and unapproved for per-root generations, admission receipts, and the DeletionOperation table; there is no authorization to expand into those proposals. Old-host guard retention remains intentional fail-closed behavior. Reclamation on capable hosts requires the incarnation-bound deferred effects required by approved option B to be implemented and accepted; the [selected atomic cleanup/runtime repair](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md) specifies that work without adding RootAdmission. This design does not claim it is complete.

The acceptance matrix above specifies required results; it is not runtime verification. The source/test checkpoint and its held status are recorded in the [implementation plan](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-13-parent-permission-authority.md). Real TUI proof is only possible after a separately authorized binary.
