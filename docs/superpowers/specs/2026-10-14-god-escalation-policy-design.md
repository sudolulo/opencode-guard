# God escalation permission policy

**Status:** Policy decided by Holden on 2026-10-14 (recorded below, binding). Implemented in source (unit level); not built, not deployed; real TUI proof pending an authorized binary. Native and guard sides verified together on 2026-10-15 (section 8.1). Nothing is committed.

**Amends:** [parent permission authority design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md). Section 3 lists exactly which of its rules are superseded and which still bind.

**Plan:** [god escalation policy implementation plan](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-14-god-escalation-policy.md)

## Lead rulings (2026-10-14)

1. **Default 1 overruled:** `override: "root"` applies to the god root's own request for any visible tool permission, not only `bash`. It remains exact-request, logged, and valid only when `sessionID == rootSessionID`; it never applies to descendants or tools hidden by a final `"*"` deny.
2. **Default 3 overruled for god descendants:** control-file writes and reveal-arm refusals become a parent ask (once/reject), allowing the root model to decide. Auto descendants retain the existing throw behavior. A once-approval of a control-file write changes policy durably; Holden accepts that consequence.
3. **Defaults 2 and 5 accepted:** `manual` / `edits` use the auto-descendant column; unattended sessions, level `off`, and old hosts retain legacy behavior without escalation or override.
4. **Default 4 accepted as a known gap:** `pty_spawn`, `bg_run`, and other non-deferrable process-tool floor refusals still throw for god descendants because those tools do not guarantee a native ask. Follow-up owner: lead. Reason: the tools must call `ctx.ask` before their refusals can safely escalate.
5. **Execution method:** do not use `plan-run`; the lead session starts in `/home/dev/projects/md`, which is not a Git repository, `plan-run` has no external-repository workdir argument, and it commits. The lead orchestrates serialized specialists with explicit path owners and no commit steps.
6. **Task 0 gate remains binding:** implementation starts only after incarnation-bound cleanup Task 2 is frozen and reviewed; cited line numbers are re-verified then.

## Lead rulings (2026-10-14, root-policy round)

These replace any earlier snippet or cell that contradicts them; sections 4, 5.2 and 5.3 below are revised to match. Progress ledger: [guard progress](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-14-god-escalation-policy-guard-progress.md).

1. **Root effective deny tightens a descendant (non-god root).** A descendant of an auto / manual / edits root is judged as the root's own. The ROOT's effective bash rule is the WINNING rule (last match, `bashDenyKind`), so a root `*` deny overridden by a later matching named allow is not a root deny. A winning **named** root deny is an exact human-once ask for every native status (deny, ask AND allow): a child's own named or wildcard grant cannot erase it. A winning **catch-all** root deny is an explicit `{ status: "deny" }` for every native status, and it wins over a human-only credential stash (the root could not run the command either). A human-only stash otherwise keeps its own reason; a named root deny without one carries `named hard rule`. `rootDeny` is bash-only. The root's own cells are unchanged. Hidden tools stay a native boundary.
2. **God counterpart.** A god descendant whose bash call native allows but the ROOT's rules deny (named or catch-all) is an exact parent ask with reason `root policy deny: bash`; a stash reason or `native deny:` / `native ask:` takes precedence when present.
3. **Route precedence, documented rather than hidden.** For a non-god session a root deny is routed in `tool.execute.before` AHEAD of the static floors, cc-safety-net included: a named root deny (for example `mkfs*`, also inside a compound command) reaches the human once instead of a net refusal. The guard floors do not universally run first; this is the agreed precedence.
4. **Route restriction marker.** When the floors are skipped for a root deny, a ROOT-POLICY marker `{ route: "root-policy", rootDeny }` is stashed for that exact call and permission in the same slot-retained map as floor escalations (capacity refuses a NEW marker before its tool runs; expiry keeps a tombstone that denies). It is a different type from a floor escalation `{ kind: "parent" | "human-only" }` and is never passed to the table as one. The hook denies when the marker and the root's current rules disagree, when the table forms no proposal for it, when the guard level went `off`, when the root's mode class changed, and when the root binding fails. A call with no call ID cannot carry a marker and is refused with the legacy config-deny message.
5. **Identity versus restriction.** Every tool call of an attended descendant (any tool, not only the six deferrable ones) captures the root binding BEFORE any asynchronous rule or floor work, and a capture failure refuses the call before its tool runs, god or not (the earlier "non-god proceeds unbound" behaviour is removed). The binding is kept per exact call `(sessionID, callID)` with its tool until `tool.execute.after`, and every permission that call raises (for example bash, then `external_directory`) is judged with it; restrictions and judged marks stay keyed by the exact permission, so one permission never takes or borrows another's floor or mark. A judged mark is also bound to the exact request patterns its hook saw. Context eviction or expiry only loses eligibility (the person answers); restrictions are never evicted. Floor deferral is still limited to the six native-asking tools, and `bg_run` / `pty_spawn` keep the legacy throw for descendants (lead ruling 4); that legacy config-deny check now also applies the ROOT's rules to a capable host's descendant, so a root deny the child's rules allow is refused there (no native ask exists to route it to).
6. **Hook fences.** The call's original binding (restriction or call context) is fixed before any await in the hook. With one present, any hook failure (capability, root read, rules) denies instead of rethrowing into a native plain verdict, and the binding is validated even when the table returns no proposal (a native allow under a replaced root is denied).
7. **Judgment mode.** A non-god root's descendant runs its floors and is judged in the ROOT's current legacy mode, never its own (a child's own `god` file cannot turn a manual or edits root's descendant into auto). The G3 ancestry gate still runs unchanged. A root with no mode file of its own takes the global mode (`sessionMode(root) ?? globalMode()`), never a hardcoded `auto`.
8. **Metadata and log separation.** Approval reasons and the policy's new log lines carry a class and generic description, never the command; native request metadata (command, workdir) is never altered, so the approver sees the exact action.
9. **Binding-read cost (measured with the fixture, `tests/escalation-plugin.test.mjs` cost test).** One attended descendant bash call that meets no floor now costs 4 capability probes and 2 root reads across before-hook and permission hook (measured 3 and 1 before this round); a root's own call costs no binding read; a non-deferrable descendant tool call (webfetch) now costs 2 probes and 1 root read in its before-hook.

## 1. Policy (binding, Holden 2026-10-14)

1. **God root, own requests: allowed.** This includes requests for any visible tool permission, global named hard rules (`rm -rf /*`, `mkfs*`, `git push --force*`, ...) and guard floors (credential, `/tmp` launder, LLM classifier). Today native config deny refuses even the god root; that ends.
2. **God root, any descendant refusal: escalates to the attended root's MODEL.** The root model decides allow-once or reject for that exact native request, via the existing `guard_pending` / `guard_decide` parent route: exact request ID, `once` / `reject` only, never Always. Holden is never prompted under god. Refusal sources covered: agent seat bash allowlists (from `tools: {"*": false}`), read-only / role explicit denies, inherited session permission ceilings, global named hard rules, guard floors (credential, launder, LLM classifier).
3. **Auto root, any descendant refusal: escalates and is judged like the root's own command.** Guard rules and the classifier decide; a global named hard rule asks Holden once (existing human-only private-TUI path).
4. **Not permissions, unchanged:** tools not offered to a seat stay unavailable (disabled tools hidden); agent-team tool closures (G1/G4) and the other tree/stale-turn gates; the read-intent dispatch gate; the launch guard (no `oc-task` / `opencode run`); redaction; process isolation.
5. Holden accepted the safety cost explicitly. This document does not re-litigate it.

## 2. Evidence

- **Deny volume (from the brief, NOT re-verified by me):** last 3 days of `/home/dev/.local/share/opencode/autoclass.log` had 111 denies: 87 `deny(config)` (ordinary subagent seat-allowlist misses: `go test`, `npm run typecheck`, `git status|head`, `sed -n`, `rg`, `python -c`, `./check-gates.sh`), 8 `deny(llm)`, 7 `deny(launder)`, 6 team/tree gates, 3 credential; zero named catastrophic rules.
- **What I verified (2026-10-14):** the log is self-truncated; its current window starts `2026-10-13T21:53:29Z` (5,581 lines). In that window: 43 `deny(config)`, 4 `deny(llm)`, 2 `deny(launder)`, 1 `deny(credential)`. The `deny(config)` commands are `git --no-pager ...` (9), `go test` (8), `npm run` (7), `cd ...` (5), `awk`, `sed -n`, `ls`, `find`, `node --test`, `go vet/tool/env`, `ssh truenas`, `bash -n`, `git merge-file`. A grep for `rm -rf /`, `mkfs`, `push --force`, `push -f`, `dd ... of=/dev`, `filter-branch`, `shutdown`, `reboot` among `deny(config)` lines returned zero matches. This agrees in shape with the brief; the 3-day totals themselves cannot be re-derived from the truncated file.
- **Global named denies:** `/home/dev/devbox/config/opencode/opencode.json` `permission.bash` starts at line 78 with `"*": "ask"` (line 80) and an allow list, then a deny tail from line 595 (`rm -rf /*`, `rm -fr /*`, `sudo rm -rf /*`, `mkfs*`, `dd *of=/dev/*`, `chmod -R 777*`, `chmod 777*`, `shutdown*`, `reboot*`, `halt*`, `poweroff*`, `shred *`, `fdisk*`, `parted*`, `wipefs*`, `sgdisk*`, `blkdiscard*`, `rm -rf ~*`, `rm -rf $HOME*`, `git filter-branch*`, `git push --force*`, `git push -f *`) and exec-escape denies (`fd *-x*`, `rg *--pre *`, `git difftool*`, `git diff*--output*`, `git diff*--ext-diff*`, `git log*--output*`, ...), each also with a `snip ` / `rtk ` prefixed twin. Only the permission block was read (the file holds secrets elsewhere).

## 3. What this supersedes in the 2026-10-13 design

Line numbers refer to [the 2026-10-13 design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md).

| 2026-10-13 rule (line) | Status |
|---|---|
| "God mode does not override a human-only hard gate" (15) and the `opencode.json` deny globs "stand even in god" (also `plugin.js:926-930` comment) | **Superseded.** God root's own visible-tool permission denies are allowed (policy 1). |
| "A named command-policy deny may become a `human-only` ask; exec/write-agent catch-all bash deny may become parent/operator ask. Disabled tools, read-only writes, and inherited explicit ceilings remain blocked." (30) | **Superseded** except "disabled tools remain blocked". Any native deny of a visible tool may become an exact annotated ask; the guard picks the approval kind. |
| "Native deny is never turned into allow by a hook" (28) | **Narrowed.** One exception: a god root's OWN visible-tool permission deny, via an explicit `override: "root"` proposal (section 5.1). Descendant denies still never become allow natively. |
| Eligibility via private provenance (seat capability `write`/`exec`, availability-origin `*` deny, policy-only re-evaluation) (30; implemented as `catchAllDenied`, `humanOnlyDenied`, `AgentProvenance`, `ConfigAgentOrigin`) | **Superseded and removed** (section 6). Eligibility is now a guard policy decision, not a native structural one. |
| "Root god ordinary requests are auto-approved ... existing safe auto approvals for children remain unchanged" (46) | Root part **retained**. Child part **superseded** by policy 2/3. |
| "Exclude human-only requests before god bypass" (46); matrix row "Human-only request at root or descendant, even under god" (61) | **Superseded under god** (no human-only is ever produced under god). **Retained under auto/other attended roots.** |
| Matrix row "Auto child request: Root user decides" (60) | **Superseded:** judged like the root's own command; only named hard rules and promptable credentials reach the user. |
| Matrix row "Read-only role or missing tool: remains restricted/unavailable" (68) | **Split:** missing (hidden) tool unchanged; read-only role pattern denies now escalate. |
| `permissionAuthority: 1` capability (44) | **Superseded:** native advertises `permissionAuthority: 2`; guard treats `1` as an old host. |

Still binding from 2026-10-13 and unchanged here: exact native request IDs; parent approvals `once`/`reject` only; no Always on any annotated or forced ask; `reply: always` refused; generic HTTP/SDK `Permission.reply` cannot settle `human-only`; private TUI `replyFromUser` RPC is the only human-only channel; `escalate` reply = parent-to-operator downgrade; root-only `guard_pending`/`guard_decide` hidden from children through `primary_tools`; capability probing with fail-closed old hosts; incarnation binding of deferred effects; background promotion of the root's task child; workflow-yield lifecycle (lines 38, 40, 48).

Not superseded but **does not match current code** (found while verifying, not changed by this design): row 57 "Root auto RISKY request: one user prompt" -- `plugin.js:1095-1108` throws `deny(llm)` for an auto root. Row 58 "Safe auto request: no user prompt" -- currently broken for the root's own asks: `authority.js:405-413` annotates every non-god root's ordinary ask as `operator`, and `plugin.js:1247` then skips the classifier handler, so a SAFE ask reaches the human. This design fixes row 58 as a side effect (auto root own ask gets no proposal); row 57 is left as the code has it, and policy 3 binds descendants to whatever the root path does.

## 4. Policy matrix

Columns: who issued the request, under which root mode. "Parent" = exact `approval.kind: "parent"` ask answered by the root model with `guard_decide` (once/reject). "Human-once" = exact `human-only` ask, private TUI, once/reject. "Judged" = exact `operator` ask that the guard settles itself with the root's own judgment (classifier etc.), falling back to the human only if the guard cannot judge. "Throw" = refused before the tool runs, exactly as for the root.

| Refusal source | God root, own | God root, descendant | Auto root, own | Auto root, descendant |
|---|---|---|---|---|
| Seat allowlist miss (`tools:{"*":false}` + bash allowlist) | n/a | Parent | n/a | Judged (classifier) |
| Read-only / role explicit pattern deny | Allowed (override) | Parent | Human-once if the winning deny is a named bash pattern; a `*` deny stands | Judged; Human-once if the ROOT's rules name-deny it |
| ROOT effective bash deny the child's own rules allow (root-policy round) | n/a | Parent (`root policy deny: bash`) | n/a | Named: Human-once; catch-all: explicit deny (any native status) |
| Inherited session ceiling (any permission) | n/a | Parent | n/a | Judged (same root check) |
| Global named hard rule | Allowed (override, logged) | Parent | Human-once | Human-once (also when the child's rules allow it) |
| Guard credential floor, hard path or native read path | Allowed (existing god bypass) | Parent | Throw | Throw |
| Guard credential floor, promptable CLI (`rbw`, `bw`, `op`, `pass`) | Allowed | Parent | Native prompt (unchanged) | Human-once (was: refused) |
| Guard launder floor | Allowed | Parent | Throw | Throw (judged with root AND child rules) |
| cc-safety-net | Allowed | Parent | Throw | Throw |
| LLM classifier RISKY / unavailable / no lane | Allowed | Parent | Throw | Throw |
| Native ask (not a refusal) | Allowed (existing) | Parent (existing) | Classifier (fixed: no `operator` annotation) | Classifier (existing delegated judgment) |
| Tool hidden from the seat (final `*` deny on the tool) | Unavailable | Unavailable | Unavailable | Unavailable |
| Tree gates G1/G2/G4, stale turn, read-intent gate, launch guard | Throw | Throw | Throw | Throw |
| Guard self-integrity: control-file write, reveal-arm | Allowed (existing god bypass) | Parent (once/reject) | Throw | Throw |
| Unattended session (`opencode run`), level `off`, old host | Legacy behaviour; no escalation, no override | same | same | same |

Other attended non-god root modes (`manual`, `edits`) use the auto-descendant column: "judged like the root" means the legacy judgment for that mode, so under `manual` a judged ask stays with the human and under `edits` the edits rules decide. This is the simplest consistent reading of policy 3 and needs no extra machinery. The judgment mode, floors included, is the ROOT's current mode (root-policy ruling 7).

Root-policy round: in the two non-god columns, a bash command the ROOT's effective rules deny is routed before the guard floors (credential, launder, cc-safety-net, classifier): named -> Human-once, catch-all -> explicit deny. The "Throw" cells above apply to commands the root's rules do not deny.

## 5. Architecture

### 5.1 Native contract (`/home/dev/projects/opencode-god-catchall-bridge`)

Verified current shape: `SessionTools.resolve` (`packages/opencode/src/session/tools.ts:85-107`) calls `Permission.prepareForRequest` (`packages/opencode/src/permission/index.ts:447-515`) which runs the plugin `permission.ask` hook before `Permission.ask` (`index.ts:76-124`). Today a deny can become an ask only through `catchAllDenied` (`index.ts:322-356`) or `humanOnlyDenied` (`index.ts:362-385`), both gated on the provenance sidecar; a session-ceiling deny (`index.ts:470-473`) and any original allow (`index.ts:475`) are never touched.

New `prepareForRequest` (request-local, nothing persisted):

```
input:  { req, sessionID, rootSessionID, toolID, ruleset, trigger? }
output: { ruleset, approval?, forceAsk, always, deny }

status := per-pattern evaluate(req.permission, pattern, ruleset): deny > ask > allow (zero patterns -> allow)
no trigger, or trigger failed               -> PLAIN
disabled([toolID], ruleset) non-empty       -> PLAIN          (tool not offered: boundary 4)
out.status == "deny"                        -> DENY           (tightening; any baseline)
out.override == "root":
  status == "deny" && out.status == "allow" && sessionID == rootSessionID
  && no out.approval && !out.forceAsk
                                            -> ALLOW(patterns), log warning "permission root override"
  otherwise                                 -> PLAIN          (malformed override fails closed)
approval := validApproval(out.approval, sessionID, rootSessionID)   (unchanged, index.ts:435-440)
out.approval given but invalid              -> PLAIN
out.status == "ask" && out.forceAsk && approval (baseline deny | ask | allow)
                                            -> ASK(patterns), approval, forceAsk true, always []
status == "ask" && out.status == "ask"     -> ask, keeping a valid approval and/or forceAsk;
                                               either one clears always            (existing)
status == "ask" && out.status == "allow" && no approval && !forceAsk
                                            -> ALLOW(patterns) one call       (existing)
otherwise                                   -> PLAIN
```

`PLAIN` = `{ ruleset, forceAsk: false, always: req.always, deny: false }`. `ASK(p)` / `ALLOW(p)` append one `ask` / `allow` rule per requested pattern to this request's ruleset only. `DENY` sets `deny: true`; `SessionTools` then fails the call with `PermissionV1.DeniedError` before `Permission.ask` (works for zero-pattern requests too).

What the native layer still guarantees, independent of any plugin: no deny becomes allow except a ROOT session's own request for a visible tool permission with an explicit `override: "root"`; the override applies only to the exact request and is logged. A descendant deny can only become an exact forced annotated ask bound to its real root; a `parent` approval is never accepted for the root's own request; hidden tools never escalate; Always is never available on an annotated/forced request (`index.ts:104`, `130-138`); human-only stays private-TUI-only (`index.ts:133-137`, `222-229`).

Two supporting native changes:

- **Every bash call reaches the hook.** `tool/shell.ts:296` returns early when the scan found no command patterns (pure `cd` / `pushd` / ... lines, `shell.ts:28`, `422`), so no hook runs for them. The early return is removed; a zero-pattern bash request still evaluates to allow and runs unprompted, but the hook sees it. `Permission.ask` treats a forced, annotated request with zero patterns as needing an ask. `read.ts:255`, `glob.ts:28`, `grep.ts:39` already ask unconditionally with one pattern (verified).
- **Runtime Always approvals never lift a ruleset deny.** Today `Permission.ask` evaluates `ruleset` and `approved` as one last-match list (`index.ts:84`), so a saved `snip *` Always overrides a deny rule (the guard documents this at `plugin.js:936-941`). The guard skips its own floors for natively denied commands because native denial is the escalation point, so the deny must be authoritative: approvals are consulted only for patterns whose ruleset verdict is `ask`.

Plugin hook type (`packages/plugin/src/index.ts:277-281`) gains `override?: "root"`. `SessionTools` passes `toolID: item.id` and the merged `agent.permission + session.permission` ruleset, and stops reading provenance. Capability `permissionAuthority` becomes `2` (`server/routes/instance/httpapi/groups/experimental.ts:30`, `handlers/experimental.ts:42`).

### 5.2 Guard (`/home/dev/opencode-guard`)

**Capability.** `requireCapabilities` (`lib/authority.js:62-82`) accepts only `permissionAuthority === 2`; absent or `1` is `AUTHORITY_UNSUPPORTED` (old host, legacy fail-closed path); any other value is an authority error.

**Root context.** New broker method `rootContext(sessionID) -> { rootSessionID, rootMode, isRoot }` (probes capability, uses the existing `rootFor` / `rootMode`). Unattended processes never use it.

**Pure decision.** New `lib/escalation.js` exports `decideProposal(input)` with no I/O, replacing `selectApproval` and `propose`:

```
input: { isRoot, rootMode, rootSessionID, permission, status, escalation?, rootDeny }
  escalation: { kind: "parent" | "human-only", permission, reason } from tool.execute.before
  rootDeny:   "named" | "catch-all" | null   (bash only; ROOT agent's rules, global config if not loaded)

rootDeny is the ROOT's effective (winning-rule) deny and applies to permission bash only.

isRoot && god:   status deny                    -> { status:"allow", override:"root" }
                 status ask                     -> { status:"allow" }
                 else                           -> null
isRoot && !god:  status deny && bash && rootDeny == named             -> human-only "named hard rule"
                 else                           -> null    (legacy classifier handler decides asks)
!isRoot && god:  escalation                     -> parent (stash reason)
                 status deny                    -> parent "native deny: <permission>"
                 status ask                     -> parent "native ask: <permission>"
                 bash && rootDeny (named|catch-all)                   -> parent "root policy deny: bash"
                 else                           -> null
!isRoot && !god: bash && rootDeny == catch-all  -> { status:"deny" }  (any status, over any stash)
                 escalation.kind == human-only  -> human-only (stash reason)    (any status)
                 bash && rootDeny == named      -> human-only "named hard rule" (any status)
                 status deny                    -> operator "judged as root: <permission>", judged
                 else                           -> null
ask proposal = { status:"ask", approval:{ kind, sessionID: rootSessionID, reason }, forceAsk:true, always:[] }
```

(Root-policy round: the `!isRoot && !god` rows above replace the earlier "status deny && rootDeny == named / catch-all -> null" rows, and the god `rootDeny` row is new. `tests/escalation.test.mjs` pins all 1,080 input cells against an independent literal matrix.)

When the guard has not loaded the root agent's rules (`rulesFor` returns `undefined`, `plugin.js:245-250`), `rootDeny` is computed against the global config bash rules, the same default `configDenyReason` already uses (`lib/policy.js:1297`); those are exactly the global named rules. New `bashDenyKind(command, rules)` in `lib/policy.js` reuses `configDenyReason`'s command parsing (`lib/policy.js:1297-1320`) with a new `nativeBashWinner` beside `nativeBashVerdict` (`lib/policy.js:1107-1112`, rules are `[pattern, action]` pairs) and reports `"named"` if any command node's winning rule is a deny with a pattern other than `*`, `"catch-all"` if the winning deny is `*`, else `null`.

**`tool.execute.before` order** (`plugin.js:847-1120`). Unchanged and first: agent-spawn refusal, level `off`, stale turn, read-intent dispatch gate, tree rules. Then, only when the host is capable and the process is attended:

1. God root, own call: log `allow(god)` and return. This moves above the config-deny block (`plugin.js:942-961`); native denies are lifted by the override in the hook.
2. Guard self-integrity (control-file write, reveal-arm) throws for non-god sessions. A god descendant stashes a parent escalation on a native-asking tool (`bash`, `read`, `glob`, `grep`, `edit`, or `write`); the once decision may durably change control-file policy. Auto descendants still throw.
3. God-root descendant on a native-asking tool (`bash`, `read`, `glob`, `grep`, `edit`, `write`): run `floorRefusal` with the child's rules and capped mode (`auto`). A refusal is stashed as `{ kind: "parent", permission, reason }` under `(sessionID, callID, permission)` and the call proceeds to native, where the hook turns it into a parent ask. Never throws for a floor.
4. Non-god root or its descendant: if the ROOT agent's EFFECTIVE rules deny the bash command (`bashDenyKind(command, rulesFor(root))`, winning rule; the session's own rules are not consulted for this), stash a ROOT-POLICY marker for the exact call and return without running any floor; the hook routes it (named -> human-once, catch-all -> explicit deny) whatever native says (root-policy rulings 1, 3, 4). Otherwise run `floorRefusal` in the ROOT's mode (descendants: launder checked against child rules and root rules) and throw its message, except a promptable credential: the root returns to the native prompt as today; a descendant stashes `{ kind: "human-only" }`.

Before step 2, every attended descendant tool call captures its root binding (root-policy ruling 5); a capture failure throws.
5. Non-deferrable process tools (`pty_spawn`, `bg_run`, ...) and every legacy host keep today's throwing sequence. This is an accepted known gap for god descendants; follow-up owner is lead because these tools lack guaranteed native asks.

`floorRefusal` is today's sequence `plugin.js:974-1119` (native credential path, cc-safety-net, launder, hard credential, promptable credential, classifier) refactored to return `{ class, message, promptable? }` instead of throwing.

**`permission.ask` hook** (`plugin.js:832-845`): level `off` returns (denying a held stash or marker). It takes the stash or route marker for `(sessionID, callID, permission)`, reads the call context for `(sessionID, callID)` without consuming it, gets `rootContext`, computes the root's current `rootDeny` (denying if a marker disagrees), calls `decideProposal`, validates the original binding (also for a null proposal), and copies `status`, `approval`, `forceAsk`, `always`, `override` to the output; a `{ status: "deny" }` proposal clears every grant field. A judged proposal records `(sessionID, callID, permission)` in `judged`, bound to the call's binding and the request patterns. **Fail closed:** if anything throws while a stash, marker or call context exists, the hook sets `output.status = "deny"` (native DENY) instead of throwing, so a deferred floor can never run because the guard failed.

**Event handler** (`plugin.js:1230-1340`): `parent` unchanged (observe, promote, wake). `human-only` unchanged (left to the private TUI). `operator`: if `judged` holds its `(sessionID, tool.callID, permission)`, fall through to the existing delegated judgment (`plugin.js:1259-1340`: classifier, `shouldAutoApprove`, credential refusal, `noteDenial` surfacing to the parent); otherwise leave it for the human (an escalated parent request, or a guard restart lost the mark).

**`tool.execute.after`**: a stash still present for this call after the tool ran means the native hook never fired. The guard reports `escalation-missed` through `reportError`. This is a loud alarm, not prevention; prevention is the native test that each deferrable native-asking tool always asks.

### 5.3 Dataflow per cell

- **God root own, named deny** (`git push --force origin x`, or any visible permission deny): before-hook step 1 returns -> native status deny -> hook: `isRoot && god` -> `{allow, override:"root"}` -> native ALLOW for these exact patterns, warning logged; guard logs `allow(god/override)`.
- **God root own, non-bash deny:** native deny -> hook applies the same root-only override for that exact permission and request; auto root remains denied.
- **God root own, guard floor:** before-hook step 1 returns before every floor (as today); native allow/ask -> hook allow.
- **God descendant, seat miss** (`./check-gates.sh` from a `tools:{"*":false}` seat): before-hook step 3, `floorRefusal` null -> native deny -> hook: parent ask -> `permission.asked` (parent) -> `observe` -> background promotion -> root wake -> root model `guard_pending` / `guard_decide({permissionID, decision:"once"})` -> native `once` -> child runs exactly that call.
- **God descendant, launder** (`sed -i` matching an allow glob): before-hook step 3 stashes parent (reason `launder: ...`) -> native allow -> hook: stash -> parent ask (native tightening) -> root model as above.
- **God descendant, classifier RISKY:** same as launder, reason `llm: RISKY`.
- **Auto descendant, seat miss:** step 4: root rules don't deny -> `floorRefusal` (classifier SAFE) -> native deny -> hook: operator, judged -> `permission.asked` (operator, judged) -> delegated judgment (classifier, cached) -> `once`.
- **Auto descendant, named deny:** step 4 stashes a root-policy marker and returns (no floor runs) -> native deny, ask or allow (the child's own rules may allow it) -> hook: `rootDeny named` -> human-only -> private TUI once/reject.
- **Auto descendant, root catch-all deny:** step 4 stashes a marker -> any native verdict -> hook: explicit deny.
- **God descendant, root deny the child's rules allow:** step 3 floors pass -> native allow -> hook: parent `root policy deny: bash`.
- **Auto descendant, promptable credential:** step 4 stashes human-only -> native ask -> hook: human-only -> private TUI.
- **Auto descendant, launder / net / RISKY:** step 4 throws the root's message, recorded in `denials` for the parent (unchanged).
- **Auto root own, ordinary ask:** hook -> `null` -> plain ask -> legacy handler classifier -> `once` (fixes the row-58 regression).

## 6. Removal list

Native (`/home/dev/projects/opencode-god-catchall-bridge`):

| Remove | Where (verified) | Why it has no remaining use |
|---|---|---|
| `AgentProvenance` type | `packages/opencode/src/permission/index.ts:285-300` | Eligibility moved to guard policy |
| `SOFTENABLE_CAPABILITIES`, `sameRules` | `index.ts:302-314` | Only fed `catchAllDenied` / `humanOnlyDenied` |
| `catchAllDenied`, `humanOnlyDenied` | `index.ts:316-385` | Superseded eligibility |
| `softenCatchAll`, `softenForRequest` | `index.ts:387-430` | Legacy wrappers; tests only |
| `deniedBySession` shortcut and the "allow never prompts" early return | `index.ts:470-475` | Ceilings escalate; floors tighten allows |
| `Agent.permissionContext`, `globalPolicy` / `availability` maps, `contexts` | `packages/opencode/src/agent/agent.ts:75`, `276-281` (globalPolicy), `283-325` (availability), `345-364`, `401`, `419-421` | Sole consumer was `SessionTools` provenance |
| Provenance lookup | `packages/opencode/src/session/tools.ts:60-61`, `95` | As above |
| `ConfigAgentOrigin` module | `packages/core/src/v1/config/agent-origin.ts:1-114` | Tracking-only WeakMaps (verified: captures return sinks, `transfer` changes no values); consumers below |
| Origin capture/transfer call sites | `packages/opencode/src/config/agent.ts:7,51,54`; `config/parse.ts:9,45-50` (+ the `attach` call after decode); `config/config.ts:30,45-46,50-59,63` (`transferAgentOrigins`) | Only fed `toolsRules` |
| Tests of removed machinery | `packages/opencode/test/permission/soften.test.ts`, `test/permission/tools-provenance.test.ts`, `test/agent/permission-context.test.ts`, `packages/core/test/config/agent-origin.test.ts`, `packages/opencode/test/config/config.test.ts:242,257` assertions | Rewritten as escalation tests or deleted |

Kept: `validApproval`, `disabled` / `visibleTools`, `replyFromUser`, the `escalate` reply, pending `approval` schema, `cancelIncarnation` (owned by Task 2).

Does anything still need "named global deny" identification? Yes, exactly one rule: the auto human-once decision. It moves to the guard (`bashDenyKind` over the ROOT agent's rules from `client.app.agents`, `plugin.js:225-250`). The root agent's rules are global policy plus that agent's own overrides; a root's own named override is treated as named too, which only ever sends a decision to the human. Native no longer needs origin tracking for it.

Guard (`/home/dev/opencode-guard`): `selectApproval` (`lib/authority.js:5-8`) and `propose` (`lib/authority.js:388-414`) replaced by `rootContext` + `decideProposal`; the capable-host config-deny early return (`plugin.js:942-961`) replaced by steps 1 and 4; the comment at `plugin.js:926-930` rewritten.

## 7. Security analysis (what widens, what holds)

Widened deliberately (policy 1-3 and lead rulings): a god root runs its own requests denied by native rules for any visible tool; any god-descendant refusal of a visible tool, including control-file write and reveal-arm refusals, can be released by the root model, one exact call at a time; under auto, seat/role/ceiling denies of descendants are released by the classifier.

Still holds: hidden tools (native `disabled` check on the tool ID plus the registry); `guard_pending` / `guard_decide` stay hidden from children (`primary_tools`, `tool/task.ts:152-156`); no Always on any escalated ask; no human-only settlement off the private TUI; parent approvals require a descendant requester and the real root; tree gates, launch guard, dispatch gate and redaction run before any of this; control-file and reveal-arm throw for auto descendants but become parent asks for god descendants; unattended runs and old hosts keep today's fail-closed behaviour.

Riskier than it looks:

1. **The guard becomes the only judge of which native denies may escalate.** Native validates shape and lineage, not policy. A bug in `decideProposal` that returns `parent` under auto would let a model approve what Holden meant the classifier or himself to judge. The decision table is pure and exhaustively tested for that reason.
2. **Deferring floors to the hook trades a synchronous throw for a correlation by call ID.** Correctness depends on each deferrable native-asking tool always asking (native tests), on the hook failing closed when a stash exists, and on Always never lifting a deny.
3. **`override: "root"` is a plugin-asserted grant.** Native can check root-ness and permission, not god mode. Any in-process plugin could set it; the threat model already trusts plugins (2026-10-13 line 50). It is logged natively and in `autoclass.log`.
4. **Root-model load under god.** At the measured rate (roughly 30 seat misses a day from the brief), each becomes a root-model round trip with background promotion of the root's task child. Latency and token cost rise; not a safety issue.

## 8. Acceptance matrix

| # | Cell | Test (file) |
|---|---|---|
| A1 | God root own named deny for bash and non-bash visible permission -> allowed, only these patterns, nothing persisted | native `test/permission/parent-authority.test.ts` root override tests; guard `tests/escalation.test.mjs` table |
| A2 | Override from a descendant / with approval / with forceAsk / on a non-deny -> original verdict; a non-bash root own deny does override under god and stays denied under auto | native parent-authority override tests; guard escalation table |
| A3 | Hook allow on a deny without override -> deny (no general escape) | native parent-authority |
| A4 | Descendant seat miss, role deny, read seat deny, session ceiling, named deny -> exact parent ask, `always: []` | native parent-authority (five cases) |
| A5 | Descendant native allow + guard parent stash -> parent ask (tightening) | native parent-authority; guard `tests/escalation-plugin.test.mjs` |
| A6 | Hook deny on an allow -> `DeniedError`, including zero patterns | native parent-authority + `test/permission/tools-escalation.test.ts` |
| A7 | Hidden tool (final `*` deny), including a child's `guard_decide` -> deny even with a valid proposal | native parent-authority |
| A8 | Zero-pattern bash command fires the hook; forced annotated zero-pattern request becomes pending | native `test/tool/shell.test.ts`, tools-escalation |
| A9 | Always approval cannot lift a ruleset deny; still satisfies an ask | native `test/permission/authority.test.ts` |
| A10 | `reply: always` refused on escalated asks; generic reply cannot settle human-only | native `test/permission/authority.test.ts` (existing, kept green) |
| A11 | Capability 2 advertised; guard treats 1 as old host, other values fail closed | native `test/server/httpapi-exercise/index.ts`; guard `tests/authority.test.mjs` |
| A12 | `decideProposal` full table: god/auto x root/descendant x deny/ask/allow x stash x rootDeny | guard `tests/escalation.test.mjs` |
| A13 | God descendant floors (launder, net, hard credential, promptable, classifier RISKY/unavailable) stash parent and never throw | guard `tests/escalation-plugin.test.mjs` |
| A14 | God root own: config-denied command passes `tool.execute.before` on capable host; still throws on old host | guard escalation-plugin |
| A15 | Auto descendant: named root deny -> human-only; seat miss -> judged operator settled `once` by classifier SAFE, `reject` + parent surfacing on RISKY | guard escalation-plugin |
| A16 | Auto descendant launder / net / RISKY throw with the root's message | guard escalation-plugin |
| A17 | Auto descendant promptable credential -> human-only | guard escalation-plugin |
| A18 | Auto root own ordinary ask -> no proposal (classifier handler approves SAFE) | guard escalation + `tests/permission-event.test.mjs` |
| A19 | Hook error with a stash, root-policy marker or bound call context -> `status: "deny"`; with none -> rethrow (native plain) | guard escalation-plugin |
| A25 | Root-policy round: ROOT effective named deny -> human-once and catch-all -> explicit deny for every native status even when the child's rules allow; god counterpart parent; later named allow wins; marker denies on rule change, expiry, level off, mode-class change; per-call identity across permissions; root judgment mode | guard escalation + escalation-plugin (`root policy:`, `call context:`, `root judgment mode:` tests) |
| A20 | Operator ask without a `judged` mark -> left for the human | guard escalation-plugin |
| A21 | Stash left after the tool ran -> `escalation-missed` reported | guard escalation-plugin |
| A22 | Unchanged gates (spawn, stale, dispatch, tree) still throw for a god descendant; control-file and reveal-arm become parent asks | guard escalation-plugin + existing suites |
| A23 | Unattended or level `off` -> no proposals, legacy throws | guard escalation-plugin |
| A24 | `guard_decide` once/reject, cross-root, stale, mode change -> existing behaviour | guard `tests/authority.test.mjs` (existing, kept green) |

Unit tests are not runtime proof. A real TUI check needs a separately authorized binary build and install.

### 8.1 Verification record (2026-10-15)

Suites, bun 1.4.2 package-local and node for the guard: native `packages/opencode` 3844 pass / 1 fail / 22 skip (the one failure is environmental: `tool.write` sensitive-file mode under umask 0002); `packages/core` 1127 / 0; typechecks opencode, core, plugin and schema clean; guard `node --test tests/*.mjs` 532 / 0; workflows 297 / 0. Every row has a passing test that asserts it (read, not matched by name):

- A1: native "root override allows exactly the root's own bash request and nothing else", "root override allows a non-bash root deny under god, while auto keeps the deny"; guard "A1/A14 god root own ...", "A1/A2 god root own ...".
- A2: native "malformed root overrides keep the original verdict"; guard "the root override is produced only for the god root's own deny".
- A3: native "a hook allow on a deny without override changes nothing (no general escape)".
- A4: native "descendant seat allowlist miss ...", "... read-only role pattern deny ...", "... inherited session ceiling deny ...", "... global named deny ...", "descendant non-bash deny (external_directory) ..."; guard "A4 god descendant: ...".
- A5: native "a native allow is tightened to an exact parent ask (deferred guard floor)"; guard "A13/A5 god descendant: ...".
- A6: native "a hook deny tightens an allow or an ask to deny", "a hook deny tightens a zero-pattern request (pure cd) to deny" (added 2026-10-15), tools-escalation "a hook deny fails the call with DeniedError before Permission.ask".
- A7: native "hidden tool: a final '*' deny on the tool never escalates".
- A8: native shell "a zero-pattern command (pure cd) still issues the bash ask ...", authority "a forced annotated request with zero patterns becomes pending"; guard "A5/A8 god descendant: a zero-pattern request ...".
- A9: native authority "Always never lifts a ruleset deny, but still satisfies a plain ask".
- A10: native authority "always is rejected without settling annotated or forced requests ...", "generic replies cannot approve a human-only request ...".
- A11: native httpapi-exercise `permissionAuthority === 2`; guard "rootContext resolves root and mode on a v2 host and classifies v1 as an old host".
- A12: guard "decideProposal returns exact outputs across the complete input cross product" (1,080 cells).
- A13: guard "A13/A5 god descendant: ..." (launder, hard credential, net, promptable, RISKY, unavailable, no lane), "A13 god descendant: native read, glob and grep credential floors ...".
- A14: guard "A1/A14 ...", "A14 old host (permissionAuthority 1): ...".
- A15-A17: guard "A15 ...", "A16 ...", "A17 ..." tests.
- A18: guard "auto root own: named deny -> human-only; everything else -> no proposal", "A18 auto root own ordinary ask ...", permission-event "auto mode asks the classifier and acts on its answer".
- A19: guard "A19 hook error with a stash denies ...", "A19 hook error with only a root-policy marker stored denies with no grant remnants" (added), "call context: a stored context is validated even when native allows ...". Native side: an installed `permission.ask` trigger that fails denies the request (parent-authority "an installed hook that fails denies the request, a baseline allow included"), because hooks run in sequence and an earlier plugin's throw would otherwise skip the guard.
- A25: guard `root policy:`, `call context:`, `root judgment mode:` tests in escalation and escalation-plugin; "review fix (ruling 7): a descendant's plain ask is judged by the ROOT's mode, not its own mode file"; "review fix: a root mode flip between a context-only call and its hook denies the original call".
- A20: guard "A20 an operator ask without a judged mark is left for the human", "A20 judged marks are exact ...".
- A21: guard "A21 ..." tests. Since 2026-10-15 a call that FAILED before its permission hook (native marks `tool.execute.after` `failed`) frees its slot without the alarm ("a call that FAILED before its permission hook frees its slot quietly"; native tools-escalation "a failing tool still fires tool.execute.after, marked failed, and keeps its error").
- A22: guard "A22 god descendant: control-file and reveal-arm become parent asks ...", "A22 unchanged gates still throw ...".
- A23: guard "A23 unattended: ...", "A23 level off: ...".
- A24: guard authority "a god root approves its child's current parent approval once", "a god root rejects its child's current parent approval; native receives reply reject" (added), and the cross-root, stale and mode-change tests.

Closed 2026-10-15: `bg_run` / `pty_spawn` refusals are routed through a native ask requested by the before-hook (capability `beforeAsk: 1`). `opencode-pty`'s own config check inside the tool still refuses config "ask" commands itself. Known gaps, recorded: legacy log lines still carry raw commands; no real host or TUI proof until a build is authorized.

## 9. Sequencing, open decisions, uncertainties

**Sequencing.** A concurrent native writer (incarnation-bound cleanup Task 2, [plan](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-13-incarnation-bound-cleanup.md)) owns `packages/opencode/src/permission/index.ts` (`cancelIncarnation`, pending-target edits) plus session/run-state/event files. This design edits the same file (`ask`, `prepareForRequest`, removals) and may touch guard files that the same task binds to incarnations (`lib/authority.js`, `plugin.js` event handler). No task of this plan starts until Task 2 is frozen; line numbers must be re-verified then.

**Initial defaults and final rulings:**

1. **Overruled by Holden:** the god root override is not bash-only. It applies to any visible tool permission.
2. `manual` / `edits` roots reuse the auto-descendant column (judged with that mode's own rules).
3. **Overruled by Holden for god descendants:** control-file writes and reveal-arm become parent asks (once/reject); auto descendants still throw. A once approval changes control-file policy durably, accepted under Holden's policy.
4. **Accepted known gap:** plugin process tools (`pty_spawn`, `bg_run`) have no guaranteed native ask, so their floor refusals for god descendants still throw. Follow-up owner: lead. Reason: safe escalation requires those tools to call `ctx.ask`.
5. **Accepted:** unattended sessions and guard level `off` get no escalation and no override; old hosts retain legacy behavior.

**Uncertainties:**

- The 3-day deny counts come from the brief; the log is truncated and only the post-2026-10-13T21:53Z window was re-counted.
- The `ToolRegistry.tools` visibility filter was not read. Its use of `session.permission` is inferred from the call (`session/tools.ts:110-115`). The new native `disabled([toolID], merged)` check makes the boundary hold even if the registry differs.
- I did not open the TUI permission dialog code. Whether a briefly pending `operator` (judged) ask flashes in the TUI before the guard settles it is unverified.
- The incarnation Task 2 file scope was not read beyond the plan pointer. The serialization is a precaution.
- Plugin hook dispatch order across multiple plugins was taken from the scout's digest (`packages/opencode/src/plugin/index.ts:284-297`) and not read.
