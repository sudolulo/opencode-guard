# God mode reaches delegated exec/write children -- design

Date: 2026-10-12. Status: proposed, awaiting Holden's review.

## Problem

Holden runs an attended root session in God mode and delegates to subagents. Two different
mechanisms still refuse those children work he expects God to allow:

1. **The tester seat's catch-all deny.** `tester.md` declares `tools: {"*": false}`, which the
   fork turns into a deny-everything rule (`core/src/v1/config/agent.ts:68-77` at 2b7eb922f),
   followed by an exact bash allowlist. `./check-gates.sh` matches no allow, so the catch-all deny
   wins. The guard repeats that deny before its God bypass (`plugin.js:830-839`), and the fork
   enforces it again natively: `Permission.ask` returns `DeniedError` on a deny before any plugin
   sees the request (`permission/index.ts:67-80`). No plugin can lift a native deny today; the
   `permission.ask` hook is declared (`packages/plugin/src/index.ts:268`) but never called.
2. **God does not reach children.** Rule G3 caps an inherited `god` to `auto`
   (`lib/policy.js:121-125`, `docs/STATE.md` step 2), so an sp-implementer child of a God root runs
   the full floor and cc-safety-net refuses `git stash drop`.

Observed: `autoclass.log` lines 262, 272, 308 and 312 (`deny(config)` on `./check-gates.sh`) and
line 3096 (`deny(net)` on `git stash drop`); the children log `allow(auto/...)` while the root logs
`allow(god)`.

## Goal and non-goals

Goal: in an attended God session, a direct exec/write child runs what God would run, live, for as
long as the root stays in God.

Non-goals, all preserved exactly as today:

- Read-only seats (`capability: read`: scout, reviewer, researcher, general, review-panelist,
  review-verifier) gain nothing. Their tools stay hidden and their denies stay.
- Tool availability does not change. A tool a seat does not have stays absent.
- Named deny rules stay in force in every mode, including God: `rm -rf /*`, `rm -rf ~*`, `mkfs*`,
  `dd of=/dev/*` and any deny a seat lists by name. Only a catch-all (`*`) bash deny is softened.
- Structural rules stay above every bypass: the agent-launch ban, D1, tree rules G1/G2/G4,
  questions are never auto-answered, and output redaction.
- Unattended runs (`opencode run`/`serve`/`--auto` ...) gain nothing.
- No grant is stored. Nothing is written to a session's rules or to a mode file.

## Design

### 1. Guard: a derived `god-delegated` mode

`modeFor` gains one derived result. It is never written to or read from a mode file, so the mode
file vocabulary and opencode-peers' reading are unchanged.

A session resolves to `god-delegated` when ALL hold:

- the process is attended;
- the session has no mode file of its own;
- its **immediate** parent has its own mode file, and that file reads `god`;
- its agent's `capability` is `exec` or `write`. The agent is taken from the parent's creating
  `task` part (`state.input.subagent_type`, the same part G4 already reads); its capability from the
  agent's `capability:` front matter, the source the D1 gate already uses.

Any lookup that fails resolves to the existing G3 result (`auto`), never to `god-delegated`. So
grandchildren, workflow children created through the SDK (no creating `task` part), read-only seats
and unknown agents stay exactly as they are. Background teammates are direct children with a
creating part and qualify; G4 still bounds them.

Because mode is resolved per call, the root leaving God sends every child back to `auto` on its
next call.

In `god-delegated` the guard behaves as in `god`, with two checks deliberately kept that currently
sit below the God bypass:

| Check | `god` (root) | `god-delegated` (child) |
|---|---|---|
| Agent-launch ban, D1, G1/G2/G4 | kept | kept |
| Config deny copy, named rules | kept | kept |
| Config deny copy, catch-all `*` bash rule | kept today; softened (section 2) | softened |
| Control-file check (`plugin.js:845`) | lifted | **kept** |
| Credential checks (`:852`, `:1150`) | lifted | **kept** |
| cc-safety-net, launder, classifier | lifted | lifted |
| Ask handler | approves `once` | approves `once` |
| Redaction | kept | kept |

The control-file and credential checks stay for children because a child is model-driven: without
them a child could write a mode file and grant itself or another session God. That is an escalation
Holden did not grant.

`configDenyReason` gains a variant that reports which rule matched, so the copy at `:831` can skip a
matched catch-all bash deny when the session is `god` or `god-delegated`, and enforce every other
deny unchanged.

### 2. Fork: a catch-all bash deny may be softened to an ask

In `Permission.ask`, when the matched rule is `action: deny`, `permission: bash` and
`pattern: "*"`, the fork calls the plugin `permission.ask` hook with the request and an output whose
initial status is `deny`. The contract:

- the hook may change `deny` to `ask` and nothing else; a returned `allow` is treated as `ask`;
- a named deny (any pattern other than `*`) never consults the hook;
- no hook, a hook that throws, or a hook that leaves `deny` means deny;
- an `ask` takes the existing path: the request is published and the guard's handler answers it
  `once`, logged like every other approval.

So with the guard absent or broken, the native deny stands. The guard's hook softens only when the
session is `god` or `god-delegated`, and its ask handler re-resolves the mode before approving, so a
root that left God in between gets a rejection.

`bg_run`'s authorization (`bg-auth.js:140`) uses the same native bash check, so it follows the same
rule without a separate change.

### 3. Builds and ownership

- The fork change is built from a new worktree at the **deployed** commit 2b7eb922f, on a new branch
  `fork/god-catchall-bridge`. It does not include the staged, uninstalled stdout-drain build
  `08120f854`, so the installed binary changes in exactly one way.
  `/home/dev/projects/opencode` is on another branch with uncommitted work owned by another session
  and is not touched.
- The guard change ships as opencode-guard 1.9.0: `plugin.js`, `lib/policy.js`, tests,
  `docs/STATE.md`, README and CHANGELOG.
- The comment in devbox `config/opencode/agent/tester.md` that says parent God is not a blanket
  child grant is corrected after the games session (which last committed that file) is told.

## Tests

Fork (its own permission tests):

- catch-all bash deny plus a hook returning `ask` gives an ask;
- a named bash deny plus the same hook stays denied, and the hook is not called;
- a catch-all deny on a permission other than bash never consults the hook;
- no hook, a throwing hook, and a hook returning `allow` give deny, deny, and ask respectively.

Guard (`node --test tests/*.test.mjs`):

- `god-delegated` resolves only for an attended direct exec/write child of a root whose own file is
  `god`; read-only seats, grandchildren, SDK-created children, unknown agents, failed lookups and
  unattended runs keep today's G3 result;
- the root leaving God returns the child to `auto` on its next call;
- `launder.test.mjs:244-246` keeps passing for named denies; a catch-all bash deny is skipped only in
  `god`/`god-delegated`;
- in `god-delegated`: `git stash drop` passes the floor; the agent-launch ban, G1/G2/G4, D1, control
  files, credentials and `rm -rf /*` are still refused;
- the hook softens only in `god`/`god-delegated` and only for catch-all bash denies; the ask handler
  rejects after the root leaves God.

## Deployment and verification

1. Holden reviews this spec; a written plan follows.
2. Guard and fork changes are implemented test-first and independently reviewed.
3. The rebuilt binary is installed to `~/.local/lib/opencode-fork/bin/opencode`; the previous binary
   is kept beside it for rollback.
4. Holden restarts every opencode process. Running TUIs keep the old binary and guard until then.
5. From a God root: a tester child runs `./check-gates.sh` in `/home/dev/projects/depot`, an
   sp-implementer child runs a harmless floor-blocked command, and a scout child is still refused.
   The same three are repeated from an `auto` root and must all match today's behavior.

## Decisions taken in this spec (Holden may override)

1. Eligible seats: `capability` `exec` or `write` only.
2. Control-file and credential checks stay on for `god-delegated` children.
3. Direct children only; background teammates qualify, SDK-created workflow children do not.
4. The fork is rebuilt now, from 2b7eb922f, without the staged stdout-drain build.
