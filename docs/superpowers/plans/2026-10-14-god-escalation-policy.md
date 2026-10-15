# God escalation permission policy Implementation Plan

> **For agentic workers:** The lead orchestrates serialized specialists with explicit path owners. Do not use `plan-run`; the lead session is not in a Git repository, `plan-run` has no external-repository workdir argument, and it commits. No commit steps are authorized.

**Goal:** Implement Holden's 2026-10-14 permission policy: a god root's own denies for any visible tool permission and guard floors are allowed; every descendant refusal under a god root becomes an exact parent ask for the root model except non-deferrable process tools; under other attended roots, descendant refusals are judged like the root's own command (named hard rules ask Holden once).

**Architecture:** Native `prepareForRequest` drops its provenance-based eligibility and validates proposals by shape and lineage only. Any deny of a visible tool may become an exact forced annotated ask; an allow may be tightened to an ask or a deny; only a root's own visible-tool permission deny may become allow, through an explicit `override: "root"`. The guard owns the policy: a pure `decideProposal` table, a `rootContext` broker call, and guard floors for god descendants deferred from a synchronous throw to a per-call stash that the `permission.ask` hook turns into a parent ask.

**Tech Stack:** TypeScript + Effect + Bun 1.4.2 (native fork), Node `node:test` (guard plugin, ESM JavaScript).

**Spec:** [God escalation policy design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md). It amends the [2026-10-13 parent permission authority design](file:///home/dev/opencode-guard/docs/superpowers/specs/2026-10-13-parent-permission-authority-design.md); executors read both.

## Global Constraints

- **Serialization:** no task starts until the incarnation-bound cleanup Task 2 ([plan](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-13-incarnation-bound-cleanup.md)) is frozen. That writer owns `packages/opencode/src/permission/index.ts` (`cancelIncarnation`, pending-target edits) and session/run-state/event files. Task 0 is the gate.
- Native work happens only in `/home/dev/projects/opencode-god-catchall-bridge` (DIRTY working checkpoint). NEVER edit, build or test `/home/dev/projects/opencode`.
- Bun is `/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun`, always run package-local (workdir `packages/opencode`, `packages/core`, or `packages/plugin`). Never run Bun tests from the repo root. No build, install, SDK generation or dependency update is authorized. If a later step needs a build, set `OPENCODE_CHANNEL=fork/snip-always-prefix` first.
- Guard tests: workdir `/home/dev/opencode-guard`, `node --test tests/<file>.test.mjs`; full suite `node --test tests/*.test.mjs`.
- No commit, push, merge, install, restart or deployment steps. The repo's own release flow happens later, under separate authorization.
- Kept invariants: exact native request IDs; parent approvals `once` / `reject` only; `always: []` and `reply: always` refused on any annotated or forced ask; generic HTTP `Permission.reply` cannot settle `human-only`; human decisions only through the private TUI `replyFromUser` RPC; capability probing with fail-closed old hosts; incarnation binding of deferred effects (do not touch `cancelIncarnation`).
- Unchanged non-permission gates: hidden tools stay unavailable; G1/G2/G4 tree rules, stale-turn, read-intent dispatch gate, agent-spawn (launch) guard, redaction, process isolation. Control-file and reveal-arm refusals for god descendants become parent asks (once/reject); auto descendants retain throws. A once approval of a control-file write durably changes policy, accepted by Holden. Non-deferrable process-tool floor refusals remain throws for god descendants (known gap; follow-up owner: lead; tools do not guarantee a native ask).
- No emoji anywhere. Comments explain non-obvious logic. Never swallow an error silently.
- Do not read `/home/dev/devbox/config/opencode/opencode.json` outside its `permission` block (it holds plaintext keys).

## Review Focus

1. **Guard hook fails while a floor is stashed.** A god descendant's `sed -i` (launder) is stashed, then `rootContext` throws (HTTP error). Expected: the call is DENIED, never allowed by the plain native verdict. Pinned in Task 4 ("hook error with a stash denies").
2. **A runtime Always approval saved earlier (`snip *`) meets a named deny.** Expected: the deny still holds (and escalates); Always never lifts a deny. Pinned in Task 1 ("Always never lifts a ruleset deny").
3. **A pure `cd` line from a god descendant whose text trips a floor** (zero native bash patterns, `shell.ts:28,422`). Expected: the hook still fires and the stash becomes a parent ask. Pinned in Task 1 (zero-pattern shell ask) and Task 1 (zero-pattern forced ask pending).
4. **A child calls a tool hidden from it, such as `guard_decide`** (`primary_tools` deny). Expected: no escalation; deny stands. Pinned in Task 1 ("hidden tool").
5. **Root mode flips god -> auto while a child's parent ask is pending, or the guard restarts and loses its `judged` marks.** Expected: the existing escalate path turns parent into operator for the human; an unmarked operator ask is left for the human, never auto-settled. Pinned in Task 4 ("operator ask without a judged mark") plus existing `tests/authority.test.mjs` mode-change tests kept green.

---

### Task 0: Serialization gate and line re-verification (no code)

**Files:** none modified.

- [ ] **Step 1:** The executor asks the lead to confirm that incarnation-bound cleanup Task 2 is frozen and reviewed. Do not proceed without that confirmation.
- [ ] **Step 2:** Re-verify the anchors this plan cites, because Task 2 may have moved them. Run (workdir `/home/dev/projects/opencode-god-catchall-bridge`):

```bash
rg -n 'const ask = Effect.fn\("Permission.ask"\)|export type AgentProvenance|export function catchAllDenied|function humanOnlyDenied|export const softenCatchAll|export const softenForRequest|function validApproval|export const prepareForRequest|export function disabled' packages/opencode/src/permission/index.ts
rg -n 'permissionContext|Permission.prepareForRequest' packages/opencode/src/session/tools.ts packages/opencode/src/agent/agent.ts
rg -n 'scan.patterns.size === 0' packages/opencode/src/tool/shell.ts
rg -n 'permissionAuthority' packages/opencode/src packages/opencode/test
```

and (workdir `/home/dev/opencode-guard`):

```bash
rg -n '"permission.ask": async|"tool.execute.before": async|"tool.execute.after": async|const denied = configDenyReason|allow\(god\)|approval\?\.kind === "human-only" \|\| p\?\.approval\?\.kind === "operator"' plugin.js
rg -n 'export const selectApproval|async propose\(|permissionAuthority !== 1' lib/authority.js
```

Expected: every pattern found once. Record the new line numbers in the task ledger. If a function was renamed or split by Task 2, stop and report NEEDS_CONTEXT to the lead.

---

### Task 1: Native escalation contract

**Files:**
- Modify: `packages/opencode/src/permission/index.ts` (`ask` loop ~76-95; keep the `AgentProvenance` type ~285-300 for now because `agent/agent.ts` still references it until Task 2; delete `SOFTENABLE_CAPABILITIES` / `sameRules` ~302-314, `catchAllDenied` ~316-356, `humanOnlyDenied` ~358-385, `softenCatchAll` / `softenForRequest` ~387-430; rewrite `prepareForRequest` ~442-515; keep `validApproval`, `disabled`, `visibleTools`, `cancelIncarnation` untouched)
- Modify: `packages/plugin/src/index.ts:277-281` (hook output type)
- Modify: `packages/opencode/src/session/tools.ts:60-61,63,85-107,123` (toolID, merged ruleset, deny flag, no provenance)
- Modify: `packages/opencode/src/tool/shell.ts:296` (remove the zero-pattern early return)
- Modify: `packages/opencode/src/server/routes/instance/httpapi/groups/experimental.ts:30`, `handlers/experimental.ts:42` (capability 2)
- Test: rewrite `packages/opencode/test/permission/parent-authority.test.ts`; update `packages/opencode/test/permission/authority.test.ts`; delete `packages/opencode/test/permission/soften.test.ts`; replace `packages/opencode/test/permission/tools-provenance.test.ts` with `packages/opencode/test/permission/tools-escalation.test.ts`; extend `packages/opencode/test/tool/shell.test.ts`; update `packages/opencode/test/server/httpapi-exercise/index.ts:584`

**Interfaces:**
- Produces:

```ts
// packages/opencode/src/permission/index.ts
type AskHookOutput = {
  status: "ask" | "deny" | "allow"
  approval?: Approval
  forceAsk?: boolean
  override?: "root"
}
type AskHookTrigger = (input: AskHookInput, output: AskHookOutput) => Effect.Effect<AskHookOutput>
export const prepareForRequest: (input: {
  req: Omit<PermissionV1.Request, "id" | "sessionID" | "approval">
  sessionID: string
  rootSessionID: string
  toolID: string
  ruleset: PermissionV1.Ruleset
  trigger?: AskHookTrigger
}) => Effect.Effect<{
  ruleset: PermissionV1.Rule[]
  approval?: Approval
  forceAsk: boolean
  always: readonly string[]
  deny: boolean
}>
```

- Produces: `GET /experimental/capabilities` -> `permissionAuthority: 2`.
- Removed exports (later tasks must not reference them): `catchAllDenied`, `softenCatchAll`, `softenForRequest`. `AgentProvenance` survives until Task 2 deletes it.

- [ ] **Step 1: Write the failing tests (rewrite `test/permission/parent-authority.test.ts` completely)**

```ts
import { test, expect } from "bun:test"
import { Effect } from "effect"
import { Permission } from "../../src/permission"
import type { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { SessionID } from "../../src/session/schema"

// Request-local preparation after the 2026-10-14 policy. Native validates proposal SHAPE and
// LINEAGE only; which denies escalate is guard policy. Invariants pinned here:
// - any deny of a visible tool may become an exact forced annotated ask bound to the real root;
// - an allow may be tightened to an ask (forced + annotated) or to a deny;
// - only a root's OWN visible-tool permission deny may become allow, and only through override: "root";
// - a tool whose final rule is a "*" deny never escalates.

const rule = (permission: string, pattern: string, action: "allow" | "deny" | "ask"): PermissionV1.Rule => ({
  permission,
  pattern,
  action,
})
const ROOT = "ses_root"
const LEAF = "ses_leaf"

type Output = Parameters<NonNullable<Parameters<typeof Permission.prepareForRequest>[0]["trigger"]>>[1]
const hook = (output: Output) => () => Effect.succeed(output)
const parentAsk = hook({ status: "ask", approval: { kind: "parent", sessionID: SessionID.make(ROOT) }, forceAsk: true })
const operatorAsk = hook({ status: "ask", approval: { kind: "operator", sessionID: SessionID.make(ROOT) }, forceAsk: true })
const humanAsk = hook({ status: "ask", approval: { kind: "human-only", sessionID: SessionID.make(ROOT) }, forceAsk: true })
const rootOverride = hook({ status: "allow", override: "root" })

// Seat shape: defaults, tools {"*": false} -> "*" deny, then the bash allow-list.
const seat = [rule("*", "*", "allow"), rule("*", "*", "deny"), rule("bash", "go test *", "allow")]
// Reviewer/read-only role shape: explicit bash "*" deny, then a narrow allow.
const role = [rule("*", "*", "allow"), rule("bash", "*", "deny"), rule("bash", "git status*", "allow")]
// Global policy shape: "*" ask and a named deny tail.
const global = [rule("bash", "*", "ask"), rule("bash", "git status*", "allow"), rule("bash", "git push --force*", "deny")]

const prepare = (input: {
  command: string
  ruleset: PermissionV1.Ruleset
  trigger?: Parameters<typeof Permission.prepareForRequest>[0]["trigger"]
  sessionID?: string
  permission?: string
  toolID?: string
  patterns?: string[]
}) =>
  Effect.runPromise(
    Permission.prepareForRequest({
      req: {
        permission: input.permission ?? "bash",
        patterns: input.patterns ?? [input.command],
        always: [input.command.split(" ")[0] + " *"],
        metadata: { command: input.command },
      },
      sessionID: input.sessionID ?? LEAF,
      rootSessionID: ROOT,
      toolID: input.toolID ?? input.permission ?? "bash",
      ruleset: input.ruleset,
      trigger: input.trigger,
    }),
  )

const verdict = (ruleset: PermissionV1.Ruleset, pattern: string, permission = "bash") =>
  Permission.evaluate(permission, pattern, ruleset).action

const expectEscalated = (out: Awaited<ReturnType<typeof prepare>>, command: string, kind: string) => {
  expect(verdict(out.ruleset, command)).toBe("ask")
  expect(out.approval?.kind).toBe(kind)
  expect(out.approval?.sessionID).toBe(SessionID.make(ROOT))
  expect(out.forceAsk).toBe(true)
  expect(out.always).toEqual([])
  expect(out.deny).toBe(false)
}

test("descendant seat allowlist miss becomes an exact parent ask", async () => {
  expectEscalated(await prepare({ command: "./check-gates.sh", ruleset: seat, trigger: parentAsk }), "./check-gates.sh", "parent")
})

test("descendant read-only role pattern deny becomes a parent ask", async () => {
  expectEscalated(await prepare({ command: "sed -i s/a/b/ x", ruleset: role, trigger: parentAsk }), "sed -i s/a/b/ x", "parent")
})

test("descendant inherited session ceiling deny becomes a parent ask", async () => {
  const ruleset = [rule("bash", "*", "allow"), /* session part: */ rule("bash", "rm *", "deny")]
  expectEscalated(await prepare({ command: "rm -r build", ruleset, trigger: parentAsk }), "rm -r build", "parent")
})

test("descendant global named deny becomes a parent ask or a human-only ask", async () => {
  expectEscalated(await prepare({ command: "git push --force origin x", ruleset: global, trigger: parentAsk }), "git push --force origin x", "parent")
  expectEscalated(await prepare({ command: "git push --force origin x", ruleset: global, trigger: humanAsk }), "git push --force origin x", "human-only")
})

test("descendant non-bash deny (external_directory) escalates the same way", async () => {
  const ruleset = [rule("external_directory", "*", "deny")]
  const out = await prepare({ command: "/etc/*", permission: "external_directory", toolID: "bash", ruleset, trigger: operatorAsk })
  expect(verdict(out.ruleset, "/etc/*", "external_directory")).toBe("ask")
  expect(out.approval?.kind).toBe("operator")
})

test("a native allow is tightened to an exact parent ask (deferred guard floor)", async () => {
  expectEscalated(await prepare({ command: "sed -i s/a/b/ x", ruleset: [rule("bash", "*", "allow")], trigger: parentAsk }), "sed -i s/a/b/ x", "parent")
})

test("a hook deny tightens an allow or an ask to deny", async () => {
  for (const ruleset of [[rule("bash", "*", "allow")], [rule("bash", "*", "ask")]]) {
    const out = await prepare({ command: "sed -i s/a/b/ x", ruleset, trigger: hook({ status: "deny" }) })
    expect(out.deny).toBe(true)
  }
})

test("deny->ask needs forceAsk AND a valid approval", async () => {
  for (const trigger of [
    hook({ status: "ask" }),
    hook({ status: "ask", forceAsk: true }),
    hook({ status: "ask", approval: { kind: "parent", sessionID: SessionID.make(ROOT) } }),
    hook({ status: "ask", approval: { kind: "parent", sessionID: SessionID.make("ses_other") }, forceAsk: true }),
  ]) {
    const out = await prepare({ command: "./check-gates.sh", ruleset: seat, trigger })
    expect(verdict(out.ruleset, "./check-gates.sh")).toBe("deny")
    expect(out.approval).toBeUndefined()
  }
})

test("a parent proposal for the root's own deny keeps the deny (no self-approval)", async () => {
  const out = await prepare({ command: "git push --force origin x", ruleset: global, sessionID: ROOT, trigger: parentAsk })
  expect(verdict(out.ruleset, "git push --force origin x")).toBe("deny")
})

test("hidden tool: a final '*' deny on the tool never escalates", async () => {
  const bashOff = [rule("*", "*", "allow"), rule("bash", "*", "deny")]
  const out = await prepare({ command: "ls", ruleset: bashOff, trigger: parentAsk })
  expect(verdict(out.ruleset, "ls")).toBe("deny")
  // A child's primary_tools deny (task.ts adds guard_decide "*" deny) stays hidden and denied.
  const childTools = [rule("*", "*", "allow"), rule("guard_decide", "*", "deny")]
  const decide = await prepare({ command: "per_1", permission: "guard_decide", ruleset: childTools, trigger: parentAsk })
  expect(verdict(decide.ruleset, "per_1", "guard_decide")).toBe("deny")
})

test("root override allows exactly the root's own bash request and nothing else", async () => {
  const out = await prepare({ command: "git push --force origin x", ruleset: global, sessionID: ROOT, trigger: rootOverride })
  expect(verdict(out.ruleset, "git push --force origin x")).toBe("allow")
  expect(verdict(out.ruleset, "git push --force origin y")).toBe("deny")
  expect(out.approval).toBeUndefined()
  expect(out.forceAsk).toBe(false)
  expect(out.always).toEqual([])
})

test("root override allows a non-bash root deny under god, while auto keeps the deny", async () => {
  const command = "/outside/file"
  const ruleset = [rule("edit", "*", "allow"), rule("edit", "/outside/*", "deny")]
  const god = await prepare({ command, permission: "edit", toolID: "edit", ruleset, sessionID: ROOT, trigger: rootOverride })
  expect(verdict(god.ruleset, command, "edit")).toBe("allow")
  const auto = await prepare({ command, permission: "edit", toolID: "edit", ruleset, sessionID: ROOT, trigger: hook({ status: "deny" }) })
  expect(verdict(auto.ruleset, command, "edit")).toBe("deny")
})

test("malformed root overrides keep the original verdict", async () => {
  const command = "git push --force origin x"
  const cases: Array<{ sessionID?: string; permission?: string; trigger: ReturnType<typeof hook>; ruleset?: PermissionV1.Ruleset }> = [
    { sessionID: LEAF, trigger: rootOverride },
    { sessionID: ROOT, trigger: hook({ status: "allow", override: "root", forceAsk: true }) },
    { sessionID: ROOT, trigger: hook({ status: "allow", override: "root", approval: { kind: "operator", sessionID: SessionID.make(ROOT) } }) },
    { sessionID: ROOT, trigger: hook({ status: "ask", override: "root" }) },
  ]
  for (const item of cases) {
    const out = await prepare({ command, ruleset: item.ruleset ?? global, sessionID: item.sessionID, permission: item.permission, trigger: item.trigger })
    expect(verdict(out.ruleset, command, item.permission ?? "bash")).toBe("deny")
  }
  // An override on an original ask is not an allow either: it stays an ask.
  const ask = await prepare({ command: "make", ruleset: global, sessionID: ROOT, trigger: rootOverride })
  expect(verdict(ask.ruleset, "make")).toBe("ask")
})

test("a hook allow on a deny without override changes nothing (no general escape)", async () => {
  for (const sessionID of [ROOT, LEAF]) {
    const out = await prepare({ command: "git push --force origin x", ruleset: global, sessionID, trigger: hook({ status: "allow" }) })
    expect(verdict(out.ruleset, "git push --force origin x")).toBe("deny")
  }
})

test("no hook, or a failing hook, keeps the original verdict", async () => {
  const none = await prepare({ command: "./check-gates.sh", ruleset: seat })
  expect(verdict(none.ruleset, "./check-gates.sh")).toBe("deny")
  const failed = await prepare({ command: "./check-gates.sh", ruleset: seat, trigger: () => Effect.die(new Error("hook failed")) })
  expect(verdict(failed.ruleset, "./check-gates.sh")).toBe("deny")
  expect(failed.deny).toBe(false)
})

test("existing ask semantics hold: one-call allow and annotated ask", async () => {
  const allowed = await prepare({ command: "make", ruleset: global, trigger: hook({ status: "allow" }) })
  expect(verdict(allowed.ruleset, "make")).toBe("allow")
  const annotated = await prepare({ command: "make", ruleset: global, trigger: parentAsk })
  expectEscalated(annotated, "make", "parent")
})
```

In `test/permission/authority.test.ts`: delete the `provenance` helper (~line 52) and every test whose name asserts a deny "remains denied" for a read seat, a role named deny, a session ceiling, or missing provenance (~lines 29-95 in the RED-anchor numbering); those invariants are superseded and covered (inverted) above. Keep every `it.instance` service test (generic reply vs private reply, Always refusal, escalate). Add these two service tests after the existing `it.instance` blocks:

```ts
it.instance("Always never lifts a ruleset deny, but still satisfies a plain ask", () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    const sessionID = SessionID.make("ses_leaf")
    // Save an Always for "snip *" through a normal ask.
    const first = yield* permission
      .ask({
        id: PermissionV1.ID.make("per_always"),
        sessionID,
        permission: "bash",
        patterns: ["snip ls"],
        metadata: { command: "snip ls" },
        always: ["snip *"],
        ruleset: [{ permission: "bash", pattern: "*", action: "ask" }],
      })
      .pipe(Effect.forkScoped)
    yield* waitForPending(1)
    yield* permission.reply({ requestID: PermissionV1.ID.make("per_always"), reply: "always" })
    yield* Fiber.join(first)
    const ruleset = [
      { permission: "bash", pattern: "*", action: "ask" as const },
      { permission: "bash", pattern: "snip git push --force*", action: "deny" as const },
    ]
    const denied = yield* permission
      .ask({ sessionID, permission: "bash", patterns: ["snip git push --force origin x"], metadata: {}, always: [], ruleset })
      .pipe(Effect.exit)
    expect(denied._tag).toBe("Failure")
    // The same Always still satisfies a plain ask without a prompt.
    yield* permission.ask({ sessionID, permission: "bash", patterns: ["snip make"], metadata: {}, always: [], ruleset })
    expect(yield* permission.list()).toHaveLength(0)
  }),
)

it.instance("a forced annotated request with zero patterns becomes pending", () =>
  Effect.gen(function* () {
    const permission = yield* Permission.Service
    const pending = yield* permission
      .ask({
        id: PermissionV1.ID.make("per_zero"),
        sessionID: SessionID.make("ses_leaf"),
        permission: "bash",
        patterns: [],
        metadata: { command: "cd ~/.ssh", workdir: "/work" },
        always: [],
        approval: { kind: "parent", sessionID: SessionID.make("ses_root") },
        forceAsk: true,
        ruleset: [],
      })
      .pipe(Effect.forkScoped)
    const listed = yield* waitForPending(1)
    expect(listed[0].approval?.kind).toBe("parent")
    expect(listed[0].always).toEqual([])
    yield* permission.reply({ requestID: PermissionV1.ID.make("per_zero"), reply: "reject" })
    expect((yield* Fiber.join(pending).pipe(Effect.exit))._tag).toBe("Failure")
  }),
)
```

Create `test/permission/tools-escalation.test.ts` from `test/permission/tools-provenance.test.ts`: keep its `SessionTools.resolve` harness (the stubbed `Agent.Service` and `Permission.Service`) but delete the `permissionContext` member from the stub and the provenance parameter. Replace its tests with:

```ts
test("SessionTools passes toolID and the merged agent+session ruleset to the hook path", async () => {
  // Agent rules allow bash; the SESSION ceiling denies "rm *". The hook proposes parent.
  // Expected: the native ask receives an ask ruleset for "rm -r build" with a parent approval,
  // proving session rules are merged (a ceiling escalates instead of being skipped).
  const asked = await runShellAsk({
    agentRules: [{ permission: "bash", pattern: "*", action: "allow" }],
    sessionRules: [{ permission: "bash", pattern: "rm *", action: "deny" }],
    command: "rm -r build",
    hookOutput: { status: "ask", approval: { kind: "parent", sessionID: "ses_root" }, forceAsk: true },
  })
  expect(asked.approval?.kind).toBe("parent")
  expect(asked.forceAsk).toBe(true)
})

test("a hook deny fails the call with DeniedError before Permission.ask", async () => {
  const result = await runShellAsk({
    agentRules: [{ permission: "bash", pattern: "*", action: "allow" }],
    sessionRules: [],
    command: "sed -i s/a/b/ x",
    hookOutput: { status: "deny" },
  })
  expect(result.error?._tag ?? result.error?.name).toContain("Denied")
  expect(result.askCalled).toBe(false)
})
```

`runShellAsk` is the existing file's resolve-and-invoke helper renamed; it resolves tools for a leaf session whose parent is `ses_root`, calls the returned tool's `ctx.ask` once with `{ permission: "bash", patterns: [command], always: [], metadata: { command } }`, registers a `permission.ask` plugin hook that copies `hookOutput` into the output, and returns `{ approval, forceAsk, ruleset, askCalled, error }` captured from the stubbed `Permission.Service.ask`. Keep the harness's existing layer wiring verbatim; only the provenance parameter is removed.

In `test/tool/shell.test.ts`, next to the existing recording `ask` context (~line 166), add:

```ts
test("a zero-pattern command (pure cd) still issues the bash ask so the permission hook runs", async () => {
  const asks: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> = []
  await runShell("cd .", { ask: (req) => Effect.sync(() => void asks.push(req)) })
  const bash = asks.filter((req) => req.permission === "bash")
  expect(bash).toHaveLength(1)
  expect(bash[0].patterns).toEqual([])
  expect(bash[0].metadata.command).toBe("cd .")
})
```

`runShell` is the file's existing helper that executes the shell tool with a given context override; if its name differs, use the helper the test at ~line 166 uses.

In `test/server/httpapi-exercise/index.ts:584` change the expectation to `permissionAuthority === 2`.

Delete `test/permission/soften.test.ts` and `test/permission/tools-provenance.test.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test test/permission/parent-authority.test.ts test/permission/authority.test.ts test/permission/tools-escalation.test.ts test/tool/shell.test.ts --timeout 30000
```

Expected: FAIL. Typical messages: `toolID`/`ruleset` not accepted (type errors surface at runtime as wrong verdicts), `deny` undefined, escalations of seat/role/ceiling denies still `deny`, root override still `deny`, Always lifts the deny, zero-pattern request not pending, no bash ask for `cd .`.

- [ ] **Step 3: Implement**

`packages/plugin/src/index.ts` hook output:

```ts
    output: {
      status: "ask" | "deny" | "allow"
      approval?: { kind: "human-only" | "parent" | "operator"; sessionID: string; reason?: string }
      forceAsk?: boolean
      // Only honoured on a ROOT session's own visible-tool permission deny with no approval and no forceAsk. Any other
      // use is ignored by core and the original verdict stands.
      override?: "root"
    },
```

`packages/opencode/src/permission/index.ts`, `ask` loop (replace the per-pattern loop at ~83-93):

```ts
      for (const pattern of request.patterns) {
        // The ruleset decides first. Runtime "Always" approvals may satisfy an ask, never a
        // deny: last-match over ruleset+approved let one blanket Always lift every deny rule.
        const base = evaluate(request.permission, pattern, ruleset)
        yield* Effect.logInfo("evaluated", { permission: request.permission, pattern, action: base })
        if (base.action === "deny") {
          return yield* new PermissionV1.DeniedError({
            ruleset: ruleset.filter((rule) => Wildcard.match(request.permission, rule.permission)),
          })
        }
        if (base.action === "allow") continue
        if (!forceAsk && evaluate(request.permission, pattern, approved).action === "allow") continue
        needsAsk = true
      }
      // A forced, annotated request with no patterns (a pure `cd` line the guard escalated) must
      // still reach its approver; with no patterns the loop above cannot mark it.
      if (forceAsk && request.approval && request.patterns.length === 0) needsAsk = true
```

Delete `SOFTENABLE_CAPABILITIES`, `sameRules`, `catchAllDenied`, `humanOnlyDenied`, `softenCatchAll`, `softenForRequest` and their comments. Leave `AgentProvenance` (Task 2 removes it with its only remaining user). Replace the hook types and `prepareForRequest` with:

```ts
type AskHookOutput = {
  status: "ask" | "deny" | "allow"
  approval?: Approval
  forceAsk?: boolean
  override?: "root"
}

type AskHookTrigger = (input: AskHookInput, output: AskHookOutput) => Effect.Effect<AskHookOutput>

// Builds the ruleset for ONE request; nothing is persisted. Native validates the proposal's shape
// and lineage; which refusals may escalate is the permission plugin's policy (opencode-guard,
// 2026-10-14 god escalation design). Guarantees kept here regardless of plugin policy:
// - a tool whose final rule is a "*" deny (hidden from the seat) never escalates;
// - a deny becomes allow ONLY for a root's own visible-tool request carrying override "root";
// - any other deny, and any allow, may only become an exact forced ask annotated with an approval
//   that names the real root (validApproval), or (allow/ask) be tightened to deny;
// - escalated asks never carry Always patterns.
export const prepareForRequest = Effect.fn("Permission.prepareForRequest")(function* (input: {
  req: Omit<PermissionV1.Request, "id" | "sessionID" | "approval">
  sessionID: string
  rootSessionID: string
  toolID: string
  ruleset: PermissionV1.Ruleset
  trigger?: AskHookTrigger
}) {
  const ruleset = [...input.ruleset]
  const plain = { ruleset, approval: undefined as Approval | undefined, forceAsk: false, always: input.req.always, deny: false }
  const actions = input.req.patterns.map((pattern) => evaluate(input.req.permission, pattern, ruleset).action)
  const status = actions.includes("deny") ? "deny" : actions.includes("ask") ? "ask" : "allow"
  const exit = input.trigger
    ? yield* Effect.exit(input.trigger({ ...input.req, sessionID: input.sessionID }, { status }))
    : undefined
  if (!exit || Exit.isFailure(exit)) return plain
  if (disabled([input.toolID], ruleset).size > 0) return plain
  const output = exit.value
  const withAction = (action: "ask" | "allow") => [
    ...ruleset,
    ...input.req.patterns.map((pattern) => ({ permission: input.req.permission, pattern, action })),
  ]

  if (output.status === "deny") return { ...plain, deny: true }

  if (output.override !== undefined) {
    const valid =
      output.override === "root" &&
      status === "deny" &&
      output.status === "allow" &&
      input.sessionID === input.rootSessionID &&
      output.approval === undefined &&
      output.forceAsk !== true
    if (!valid) return plain
    yield* Effect.logWarning("permission root override", {
      sessionID: input.sessionID,
      permission: input.req.permission,
      patterns: input.req.patterns,
      command: input.req.metadata?.command,
    })
    return { ...plain, ruleset: withAction("allow"), always: [] }
  }

  const approval = validApproval(output.approval, input.sessionID, input.rootSessionID)
  if (output.approval !== undefined && approval === undefined) return plain
  const forceAsk = output.forceAsk === true

  if (output.status === "ask" && forceAsk && approval) {
    return { ruleset: withAction("ask"), approval, forceAsk: true, always: [], deny: false }
  }
  if (status !== "ask") return plain
  // Original ask (unchanged semantics): keep a validated annotation and/or forceAsk; any of them
  // clears the Always patterns.
  if (output.status === "ask") {
    return { ruleset, approval, forceAsk, always: forceAsk || approval ? [] : input.req.always, deny: false }
  }
  if (output.status === "allow" && !approval && !forceAsk) return { ...plain, ruleset: withAction("allow") }
  return plain
})
```

`packages/opencode/src/session/tools.ts`: delete lines 60-61 (provenance). Give `context` a third parameter `toolID: string`, pass `item.id` at the call site (~line 123), and change the `ask` body to:

```ts
    ask: (req) =>
      Effect.gen(function* () {
        const rootSessionID = yield* permissionRoot(input.lookupSession, input.session)
        const tool = { messageID: input.processor.message.id, callID: options.toolCallId }
        const ruleset = Permission.merge(input.agent.permission, input.session.permission ?? [])
        const prepared = yield* Permission.prepareForRequest({
          req: { ...req, tool },
          sessionID: input.session.id,
          rootSessionID,
          toolID,
          ruleset,
          trigger: (hookInput, output) => plugin.trigger("permission.ask", hookInput, output),
        })
        if (prepared.deny) {
          return yield* new PermissionV1.DeniedError({
            ruleset: prepared.ruleset.filter((rule) => Wildcard.match(req.permission, rule.permission)),
          })
        }
        return yield* permission.ask({
          ...req,
          sessionID: input.session.id,
          tool,
          approval: prepared.approval,
          always: prepared.always,
          forceAsk: prepared.forceAsk,
          ruleset: prepared.ruleset,
        })
      }).pipe(Effect.orDie),
```

Import `PermissionV1` and `Wildcard` if the file does not already. Check the `plugin.trigger` call still type-checks against the new output type.

`packages/opencode/src/tool/shell.ts:296`: delete `if (scan.patterns.size === 0) return` and add above the bash `ctx.ask` a comment: `// Always ask, even with no command patterns (pure cd/pushd lines): the permission hook must see every bash call, or a guard floor deferred to it would silently not apply. With zero patterns and no hook proposal this evaluates to allow and runs unprompted, as before.`

Capability: `groups/experimental.ts:30` -> `permissionAuthority: Schema.Literal(2),`; `handlers/experimental.ts:42` -> `permissionAuthority: 2 as const,`.

- [ ] **Step 4: Run the tests to verify they pass**

Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test test/permission test/tool/shell.test.ts test/tool/read.test.ts test/tool/glob.test.ts test/tool/grep.test.ts test/tool/task.test.ts --timeout 30000
```

Expected: PASS, 0 failures. Then run the package suite and the typechecks:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run test
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run typecheck
```

and in workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/plugin`: `/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run typecheck`.

Expected: all PASS and both typechecks clean. `Agent.permissionContext` still exists (unused by `SessionTools` now); Task 2 removes it. Any failure is a defect in this task.

- [ ] **Step 5: Prove the tests catch the change**

Workdir `/home/dev/projects/opencode-god-catchall-bridge`: `git stash push packages/opencode/src/permission/index.ts` then re-run Step 4's first command (expected FAIL in parent-authority), then `git stash pop`. Do not use `git restore` or `git checkout --` (blocked).

---

### Task 2: Native provenance machinery removal

**Files:**
- Modify: `packages/opencode/src/permission/index.ts` (delete the `AgentProvenance` type ~285-300 and its comment)
- Modify: `packages/opencode/src/agent/agent.ts` (`Interface.permissionContext` ~75; `globalPolicy` ~274-281; `availability` ~283-325 incl. `globalPolicy.set` in the custom-agent branch; `contexts` ~345-358; `permissionContext` ~362-364, ~401, ~419-421; import of `ConfigAgentOrigin` line 3)
- Modify: `packages/opencode/src/config/agent.ts:7,51,54` (remove `captureAgent` / `attach`)
- Modify: `packages/opencode/src/config/parse.ts:9,44-50` and the `attach?.(...)` call after decode
- Modify: `packages/opencode/src/config/config.ts:30,45-46,50-59,63` (remove `transferAgentOrigins` and its calls; `mergeConfig` keeps returning the same merged value)
- Delete: `packages/core/src/v1/config/agent-origin.ts`, `packages/core/test/config/agent-origin.test.ts`, `packages/opencode/test/agent/permission-context.test.ts`
- Modify: `packages/opencode/test/config/config.test.ts:242,257` (drop the two `ConfigAgentOrigin` assertions and the import at line 3; keep the rest of each test)

**Interfaces:**
- Consumes: Task 1's `prepareForRequest` (no provenance parameter).
- Produces: `Agent.Interface` without `permissionContext`. No export named `ConfigAgentOrigin` remains anywhere.

- [ ] **Step 1: Write the failing test** (`packages/opencode/test/agent/agent-permission.test.ts`, new, in the style of the deleted `permission-context.test.ts` harness, which the implementer copies for its Agent layer setup)

```ts
// After provenance removal the agent ruleset must be exactly what it was: removing origin
// tracking must not change any rule, order, or tool visibility.
it.instance("a tools {'*': false} seat keeps its final ruleset order and hides only '*'-denied tools", () =>
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const tester = yield* agents.get("tester")
    const bash = (command: string) => Permission.evaluate("bash", command, tester.permission).action
    expect(bash("go test ./...")).toBe("allow")
    expect(bash("./check-gates.sh")).toBe("deny")
    expect(Permission.disabled(["bash", "edit"], tester.permission)).toEqual(new Set(["edit"]))
    expect("permissionContext" in agents).toBe(false)
  }),
)
```

Use the same `tester` fixture config the deleted file defined (`tools: {"*": false, "bash": true}` plus `permission.bash: {"go test *": "allow"}`); copy it verbatim from `permission-context.test.ts` before deleting that file.

- [ ] **Step 2: Run to verify it fails**

Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test test/agent/agent-permission.test.ts --timeout 30000
```

Expected: FAIL on `expect("permissionContext" in agents).toBe(false)`.

- [ ] **Step 3: Implement the removals listed under Files.** In `config/parse.ts` the decode call keeps its options; only the `attach` variable and its post-decode invocation go. In `config/config.ts` `mergeConfig` keeps its body minus the two `transferAgentOrigins` calls; the standalone call at ~63 goes with the function.

- [ ] **Step 4: Run to verify it passes, then the suites**

Workdir `.../packages/opencode`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun test test/agent test/config test/permission --timeout 30000
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run test
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run typecheck
```

Workdir `.../packages/core`:

```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run test
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run typecheck
```

Then workdir `/home/dev/projects/opencode-god-catchall-bridge`: `rg -n 'ConfigAgentOrigin|agent-origin|permissionContext|AgentProvenance|catchAllDenied|softenForRequest' packages` -> expected: no matches.

Expected: all PASS, typecheck clean.

---

### Task 3: Guard decision table and broker

**Files:**
- Create: `lib/escalation.js` (pure `decideProposal`)
- Modify: `lib/policy.js` (add `nativeBashWinner` beside `nativeBashVerdict` ~1107; add `bashDenyKind` beside `configDenyReason` ~1297; export both in the export list ~1613)
- Modify: `lib/authority.js` (capability `=== 2` at ~71; delete `selectApproval` 5-8 and `propose` 388-414; add `rootContext`)
- Test: create `tests/escalation.test.mjs`; update `tests/authority.test.mjs` (capability default `permissionAuthority: 1` -> `2` in `v2Client` ~32 and the plugin harness fetch stubs ~463; delete tests at ~11-30, ~166-188, ~1026-1112 that exercise `selectApproval` / `propose`; replace with the `rootContext` tests below)

**Interfaces:**
- Produces:

```js
// lib/escalation.js
/**
 * @param {{ isRoot: boolean, rootMode: string, rootSessionID: string, permission: string,
 *           status: "ask"|"deny"|"allow",
 *           escalation?: { kind: "parent"|"human-only", permission: string, reason: string },
 *           rootDeny: "named"|"catch-all"|null }} input
 * @returns {null | { status: "allow", override?: "root" }
 *   | { status: "ask", approval: { kind: "parent"|"operator"|"human-only", sessionID: string, reason: string },
 *       forceAsk: true, always: [], judged?: true }}
 */
export const decideProposal = (input) => { ... }

// lib/policy.js
export const bashDenyKind = (command, rules = configBashRules) => "named" | "catch-all" | null

// lib/authority.js (broker method)
async rootContext(sessionID) -> { rootSessionID: string, rootMode: string, isRoot: boolean }
// throws Error with code AUTHORITY_UNSUPPORTED on an old host (absent capability or permissionAuthority 1)
```

> **SUPERSEDED in part (root-policy round, 2026-10-14).** The test and implementation snippets in Steps 1 and 3 below show the ORIGINAL table. Its non-god descendant cells `rootDeny: "catch-all" -> null` and "named -> human-only only on a native deny" are replaced: a ROOT catch-all bash deny is `{ status: "deny" }` for every native status (over any stash), a ROOT named bash deny is human-only for every native status, and a god descendant's native allow under a root deny is a parent ask `root policy deny: bash`. The authoritative table is the design's section 5.2 and the source `lib/escalation.js`; `tests/escalation.test.mjs` holds the current 1,080-cell literal matrix. See the [guard progress ledger](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-14-god-escalation-policy-guard-progress.md).

- [ ] **Step 1: Write the failing tests** (`tests/escalation.test.mjs`)

```js
import test from "node:test";
import assert from "node:assert/strict";
import { decideProposal } from "../lib/escalation.js";
import { bashDenyKind } from "../lib/policy.js";

const root = "ses_root";
const base = { rootSessionID: root, permission: "bash", rootDeny: null };
const kindOf = (proposal) => proposal?.approval?.kind ?? proposal?.override ?? proposal?.status ?? null;

test("god root own: any visible-tool deny -> override, ask -> allow, other statuses -> null", () => {
  const g = { ...base, isRoot: true, rootMode: "god" };
  assert.deepEqual(decideProposal({ ...g, status: "deny" }), { status: "allow", override: "root" });
  assert.deepEqual(decideProposal({ ...g, status: "ask" }), { status: "allow" });
  assert.equal(decideProposal({ ...g, status: "allow" }), null);
   assert.deepEqual(decideProposal({ ...g, status: "deny", permission: "edit" }), { status: "allow", override: "root" });
});

test("god descendant: every refusal and every ask -> exact parent ask, never human", () => {
  const g = { ...base, isRoot: false, rootMode: "god" };
  for (const input of [
    { ...g, status: "deny" },
    { ...g, status: "deny", rootDeny: "named" },
    { ...g, status: "deny", permission: "external_directory" },
    { ...g, status: "ask" },
    { ...g, status: "allow", escalation: { kind: "parent", permission: "bash", reason: "launder: sed -i" } },
  ]) {
    const proposal = decideProposal(input);
    assert.equal(proposal.approval.kind, "parent", JSON.stringify(input));
    assert.equal(proposal.approval.sessionID, root);
    assert.equal(proposal.forceAsk, true);
    assert.deepEqual(proposal.always, []);
    assert.equal(typeof proposal.approval.reason, "string");
  }
  assert.equal(decideProposal({ ...g, status: "allow" }), null);
});

test("auto root own: named deny -> human-only; everything else -> no proposal", () => {
  const a = { ...base, isRoot: true, rootMode: "auto" };
  assert.equal(kindOf(decideProposal({ ...a, status: "deny", rootDeny: "named" })), "human-only");
  assert.equal(decideProposal({ ...a, status: "deny", rootDeny: "catch-all" }), null);
  assert.equal(decideProposal({ ...a, status: "deny", permission: "edit" }), null, "a non-bash root deny stays denied under auto");
  assert.equal(decideProposal({ ...a, status: "ask" }), null, "the classifier handler judges the root's asks");
  assert.equal(decideProposal({ ...a, status: "allow" }), null);
});

test("auto descendant: judged like the root", () => {
  const a = { ...base, isRoot: false, rootMode: "auto" };
  assert.equal(kindOf(decideProposal({ ...a, status: "deny", rootDeny: "named" })), "human-only");
  assert.equal(decideProposal({ ...a, status: "deny", rootDeny: "catch-all" }), null);
  const judged = decideProposal({ ...a, status: "deny" });
  assert.equal(judged.approval.kind, "operator");
  assert.equal(judged.judged, true);
  assert.equal(decideProposal({ ...a, status: "deny", permission: "external_directory" }).approval.kind, "operator");
  assert.equal(kindOf(decideProposal({ ...a, status: "ask", escalation: { kind: "human-only", permission: "bash", reason: "credential" } })), "human-only");
  assert.equal(decideProposal({ ...a, status: "ask" }), null);
  assert.equal(decideProposal({ ...a, status: "allow" }), null);
});

test("manual and edits roots use the non-god table", () => {
  for (const rootMode of ["manual", "edits"]) {
    assert.equal(decideProposal({ ...base, isRoot: false, rootMode, status: "deny" }).approval.kind, "operator");
    assert.equal(decideProposal({ ...base, isRoot: true, rootMode, status: "ask" }), null);
  }
});

test("no table cell ever yields parent outside god, or human-only under god", () => {
  for (const isRoot of [true, false]) for (const rootMode of ["god", "auto", "manual", "edits"])
    for (const status of ["deny", "ask", "allow"]) for (const rootDeny of ["named", "catch-all", null])
      for (const escalation of [undefined, { kind: "parent", permission: "bash", reason: "x" }, { kind: "human-only", permission: "bash", reason: "x" }]) {
        if (rootMode === "god" && escalation?.kind === "human-only") continue; // never produced under god
        if (rootMode !== "god" && escalation?.kind === "parent") continue;    // never produced outside god
        const kind = decideProposal({ ...base, isRoot, rootMode, status, rootDeny, escalation })?.approval?.kind;
        if (rootMode === "god") assert.notEqual(kind, "human-only");
        else assert.notEqual(kind, "parent");
        if (isRoot) assert.notEqual(kind, "parent", "a root never approves itself");
      }
});

test("bashDenyKind distinguishes named denies from a catch-all", () => {
  const rules = [["*", "ask"], ["git push --force*", "deny"]];
  assert.equal(bashDenyKind("git push --force origin x", rules), "named");
  assert.equal(bashDenyKind("make && git push --force origin x", rules), "named");
  assert.equal(bashDenyKind("make", rules), null);
  assert.equal(bashDenyKind("make", [["*", "deny"], ["go test *", "allow"]]), "catch-all");
  assert.equal(bashDenyKind("go test ./...", [["*", "deny"], ["go test *", "allow"]]), null);
});
```

In `tests/authority.test.mjs` add:

```js
test("rootContext resolves root and mode on a v2 host and classifies v1 as an old host", async () => {
  const broker = createAuthorityBroker({ v2: v2Client(), directory: "/work", tree, rootMode: () => "god" });
  assert.deepEqual(await broker.rootContext("ses_child"), { rootSessionID: "ses_root", rootMode: "god", isRoot: false });
  assert.deepEqual(await broker.rootContext("ses_root"), { rootSessionID: "ses_root", rootMode: "god", isRoot: true });
  for (const permissionAuthority of [1, undefined]) {
    const old = createAuthorityBroker({ v2: v2Client({ capabilities: { permissionAuthority, backgroundSubagents: true } }), directory: "/work", tree, rootMode: () => "god" });
    await assert.rejects(old.rootContext("ses_child"), (error) => error.code === "AUTHORITY_UNSUPPORTED");
  }
  const odd = createAuthorityBroker({ v2: v2Client({ capabilities: { permissionAuthority: 3, backgroundSubagents: true } }), directory: "/work", tree, rootMode: () => "god" });
  await assert.rejects(odd.rootContext("ses_child"), (error) => error.code !== "AUTHORITY_UNSUPPORTED");
});
```

(and change the `v2Client` default capability to `{ permissionAuthority: 2, backgroundSubagents: true }`).

- [ ] **Step 2: Run to verify they fail**

Workdir `/home/dev/opencode-guard`: `node --test tests/escalation.test.mjs tests/authority.test.mjs`
Expected: FAIL (`Cannot find module '../lib/escalation.js'`, `bashDenyKind` not exported, `rootContext is not a function`, v2 capability rejected).

- [ ] **Step 3: Implement**

`lib/escalation.js`:

```js
// The 2026-10-14 god escalation policy as one pure table. Native core validates the SHAPE and
// lineage of whatever this returns; this table is the only place that decides WHICH refusals
// escalate and to whom. No I/O, so a classification here can never be mistaken for a grant.
// docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md, section 5.2.
const ask = (kind, rootSessionID, reason, judged) => ({
  status: "ask",
  approval: { kind, sessionID: rootSessionID, reason },
  forceAsk: true,
  always: [],
  ...(judged ? { judged: true } : {}),
});

export const decideProposal = ({ isRoot, rootMode, rootSessionID, permission, status, escalation, rootDeny }) => {
  const bash = permission === "bash";
  if (rootMode === "god") {
    if (isRoot) {
      if (status === "deny") return { status: "allow", override: "root" };
      if (status === "ask") return { status: "allow" };
      return null;
    }
    if (escalation) return ask("parent", rootSessionID, escalation.reason);
    if (status === "deny") return ask("parent", rootSessionID, `native deny: ${permission}`);
    if (status === "ask") return ask("parent", rootSessionID, `native ask: ${permission}`);
    return null;
  }
  // Every other attended root: the request is judged as the root's own would be.
  if (isRoot) {
    if (status === "deny" && bash && rootDeny === "named") return ask("human-only", rootSessionID, "named hard rule");
    return null;
  }
  if (escalation?.kind === "human-only") return ask("human-only", rootSessionID, escalation.reason);
  if (status !== "deny") return null;
  if (bash && rootDeny === "named") return ask("human-only", rootSessionID, "named hard rule");
  if (bash && rootDeny === "catch-all") return null;
  return ask("operator", rootSessionID, `judged as root: ${permission}`, true);
};
```

`lib/policy.js`, next to `nativeBashVerdict`:

```js
// The winning rule itself (last match), not just its action: the escalation policy needs to
// know whether a deny is a named rule or the "*" catch-all. `rules` are [pattern, action] pairs.
const nativeBashWinner = (command, rules) => {
  const str = String(command ?? "").replaceAll("\\", "/");
  let winner = null;
  for (const [pattern, value] of rules ?? []) if (wildcardMatch(str, pattern)) winner = { pattern, action: value };
  return winner;
};
```

and next to `configDenyReason`, using the same node walk (skip `cd`/`chdir`/`popd`/`pushd`, lexer fallback):

```js
// "named" when any command node's winning rule is a deny with a pattern other than "*",
// "catch-all" when the only denies are "*", else null. Used for exactly one decision: under a
// non-god root a named hard rule asks the person once (design 2026-10-14, policy 3).
const bashDenyKind = (command, rules = configBashRules) => {
  let kind = null;
  const judge = (source) => {
    const winner = nativeBashWinner(source, rules);
    if (winner?.action !== "deny") return;
    if (winner.pattern !== "*") kind = "named";
    else kind ??= "catch-all";
  };
  const text = String(command ?? "");
  if (parser) {
    const tree = parser.parse(text);
    try {
      for (const node of tree.rootNode.descendantsOfType("command")) {
        const source = astSource(node);
        const tokens = lex(source)[0]?.tokens ?? [];
        if (["cd", "chdir", "popd", "pushd"].includes(tokens[commandIndex(tokens)])) continue;
        judge(source);
      }
    } finally {
      tree.delete();
    }
    return kind;
  }
  for (const segment of lex(text)) judge(segment.raw);
  return kind;
};
```

Add `bashDenyKind` and `nativeBashWinner` to the module's export list.

`lib/authority.js`: in `requireCapabilities` replace the `!== 1` block with:

```js
  // Version 2 is the 2026-10-14 escalation contract (deny->exact ask for any visible tool, root
  // override). A version-1 host has the older eligibility semantics: treat it as an old host so
  // the guard keeps its fail-closed throws instead of proposing what v1 would misread.
  if (capabilities.permissionAuthority === undefined || capabilities.permissionAuthority === 1) {
    throw unsupportedError("the host does not advertise permissionAuthority: 2");
  }
  if (capabilities.permissionAuthority !== 2) throw authorityError("the host advertises an unknown permissionAuthority");
```

Delete `selectApproval` and `propose`. Add to the broker object:

```js
    // The policy inputs for one request: its real root, that root's CURRENT mode, and whether the
    // requester is the root itself. Probes the capability first so an old host is classified
    // (AUTHORITY_UNSUPPORTED) before any ancestry read.
    async rootContext(sessionID) {
      await capabilities();
      const rootSessionID = await rootFor(sessionID);
      const mode = await rootMode(rootSessionID);
      return { rootSessionID, rootMode: mode, isRoot: sessionID === rootSessionID };
    },
```

`rootMode` is the broker's injected mode reader, the same call `propose` made (`await rootMode(root)`, old ~397). Remove any `selectApproval` import from `plugin.js` and the tests.

- [ ] **Step 4: Run to verify they pass**

Workdir `/home/dev/opencode-guard`:

```bash
node --test tests/escalation.test.mjs tests/authority.test.mjs tests/policy.test.mjs
```

Expected: PASS. `plugin.js` still calls `authority.propose` until Task 4, so do NOT run the full suite here; Task 4 Step 4 does.

---

### Task 4: Guard plugin wiring

**Files:**
- Modify: `plugin.js` -- `permission.ask` hook (~832-845); `tool.execute.before` (~847-1120, extract `floorRefusal`); `tool.execute.after` (~1122); event handler operator branch (~1244-1247); god/native-deny comments (~926-941); new closure state `pendingEscalations`, `judged` near `denials` (~258)
- Modify: `README.md` -- any sentence stating opencode deny rules hold in god mode (find with `rg -n -i 'god' README.md`)
- Test: create `tests/escalation-plugin.test.mjs`; keep `tests/permission-event.test.mjs`, `tests/authority.test.mjs` green

**Interfaces:**
- Consumes: `decideProposal` (`lib/escalation.js`), `bashDenyKind` (`lib/policy.js`), `authority.rootContext` (Task 3); native hook output `override` and `status: "deny"` tightening, capability 2 (Task 1).
- Produces (closure-internal, used only inside `plugin.js`):

```js
const DEFERRABLE = { bash: "bash", read: "read", glob: "glob", grep: "grep", edit: "edit", write: "edit" }; // native-asking tools -> permission key
const escalationKey = (sessionID, callID, permission) => `${sessionID}\u0000${callID}\u0000${permission}`;
const pendingEscalations = new Map(); // key -> { kind: "parent"|"human-only", permission, reason, at }
const judged = new Set();             // keys of operator asks the guard itself settles
// floorRefusal: today's floor sequence, returning instead of throwing.
const floorRefusal = async ({ tool, args, command, sessionID, mode, rules, rootRules }) =>
  null | { class: string, message: string, promptable?: true };
```

- [ ] **Step 1: Write the failing tests** (`tests/escalation-plugin.test.mjs`)

Build the harness `escalationPlugin(steps, { rootMode = "god", capability = 2, unattended = false, level, classifier = "SAFE", agents = DEFAULT_AGENTS })` by copying `incarnationPluginSteps` from `tests/authority.test.mjs` (~438-490) verbatim, then changing exactly these things:
- mode file `ses_root` contents = `rootMode` (no mode file for `ses_child`: it inherits, capped below god, `plugin.js:369-384`);
- capabilities stub returns `{ permissionAuthority: capability, backgroundSubagents: true, sessionIncarnation: 1 }`, or HTTP 500 once a `{ breakCapabilities: true }` step has run;
- `globalThis.fetch` for the classifier URL returns `classifier` as the model answer, and `classifier.json` is written, exactly as `tests/permission-event.test.mjs` (~21-37) does;
- `client.app.agents` returns `agents`, with

```js
const DEFAULT_AGENTS = [
  { name: "build", permission: [
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "sed *", action: "allow" },
    { permission: "bash", pattern: "cat *", action: "allow" },
    { permission: "bash", pattern: "git push --force*", action: "deny" },
  ] },
  { name: "seat", permission: [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "go test *", action: "allow" },
    { permission: "bash", pattern: "sed *", action: "allow" },
    { permission: "bash", pattern: "cat *", action: "allow" },
  ] },
];
```

  (the `sed *` / `cat *` allows are what make the launder and hard-credential floors reachable: launder only judges commands a ruleset allows unprompted);
- before the steps, call `hooks["chat.params"]({ sessionID: "ses_root", agent: "build" }, {})` and `hooks["chat.params"]({ sessionID: "ses_child", agent: "seat" }, {})` so `rulesFor` knows both agents (`plugin.js:808-812`);
- `client.postSessionIdPermissionsPermissionId` records `{ id: path.permissionID, response: body.response }` into `replies`;
- `unattended: true` appends `"--auto"` to the subprocess argv (after the `-e` script); `isUnattended` reads `/proc/self/cmdline` and treats `--auto` as headless (`lib/policy.js:79-86,184-190`);
- `level` (for example `"off"`) is written to `$HOME/.config/opencode/autoclass` before the plugin loads (`plugin.js:140`, the `oc-auto` level file);
- step kinds: `{ before: { session, tool, callID, args } }` runs `tool.execute.before` with input `{ tool, sessionID, callID }` and output `{ args }`, recording `{ threw: message | null }`; `{ ask: { session, callID, permission, status, command, patterns } }` runs `permission.ask` with input `{ sessionID, permission, patterns, always: [], metadata: { command }, tool: { messageID: "m", callID } }` and output `{ status }`, recording the mutated output object, or `{ threw: message }` if the hook throws; `{ asked: { id, session, callID, permission, kind, command } }` delivers a `permission.asked` event with `approval: { kind, sessionID: "ses_root" }` (omit `approval` when `kind` is `null`), `metadata: { command }` and `tool: { messageID: "m", callID }`; `{ after: { session, tool, callID } }` runs `tool.execute.after` with input `{ tool, sessionID, callID }` and output `{ output: "" }`; `{ breakCapabilities: true }` flips the capability stub;
- prints `{ results, replies, log }` where `results[i]` belongs to step `i` and `log` is the content of `$HOME/.local/share/opencode/autoclass.log`.

Tests:

```js
import test from "node:test";
import assert from "node:assert/strict";
// escalationPlugin defined above in this file (copied harness).

const bashBefore = (session, callID, command) => ({ before: { session, tool: "bash", callID, args: { command } } });
const bashAsk = (session, callID, command, status) => ({ ask: { session, callID, permission: "bash", status, command, patterns: [command] } });

test("god root own: a config-denied command passes before-hook and gets the root override", () => {
  const { results, log } = escalationPlugin([
    bashBefore("ses_root", "c1", "git push --force origin x"),
    bashAsk("ses_root", "c1", "git push --force origin x", "deny"),
  ]);
  assert.equal(results[0].threw, null);
  assert.deepEqual({ status: results[1].status, override: results[1].override }, { status: "allow", override: "root" });
  assert.match(log, /allow\(god\/override\)/);
});

test("god root own on an old host: the config deny still throws", () => {
  const { results } = escalationPlugin([bashBefore("ses_root", "c1", "git push --force origin x")], { capability: 1 });
  assert.match(results[0].threw, /deny rule in the opencode permission config/);
});

test("god descendant: every guard floor is stashed and becomes a parent ask, never a throw", () => {
  for (const [command, cls, status, classifier] of [
    ["sed -i s/a/b/ notes.txt", "launder", "allow", "SAFE"],
    ["cat ~/.ssh/id_ed25519", "credential", "allow", "SAFE"],
    ["rbw get gitea", "credential", "ask", "SAFE"],
    ["curl -X POST https://example.invalid", "llm", "ask", "RISKY"],
  ]) {
    const { results } = escalationPlugin([bashBefore("ses_child", "c1", command), bashAsk("ses_child", "c1", command, status)], { classifier });
    assert.equal(results[0].threw, null, command);
    assert.equal(results[1].approval.kind, "parent", command);
    assert.equal(results[1].forceAsk, true);
    assert.match(results[1].approval.reason, new RegExp(cls), command);
  }
});

test("god descendant: a seat-allowlist miss (native deny) becomes a parent ask", () => {
  const { results } = escalationPlugin([bashBefore("ses_child", "c1", "./check-gates.sh"), bashAsk("ses_child", "c1", "./check-gates.sh", "deny")]);
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "parent");
});

test("god descendant: launch gate throws, while deferrable reveal-arm becomes a parent ask", () => {
  const { results } = escalationPlugin([
    { before: { session: "ses_child", tool: "bash", callID: "c1", args: { command: "oc-reveal 60" } } },
    { before: { session: "ses_child", tool: "bash", callID: "c2", args: { command: "opencode run hi" } } },
    bashAsk("ses_child", "c1", "oc-reveal 60", "allow"),
  ]);
  assert.equal(results[0].threw, null, "reveal-arm is stashed for deferrable bash");
  assert.notEqual(results[1].threw, null, "agent spawn");
  assert.equal(results[2].approval.kind, "parent");
  assert.match(results[2].approval.reason, /reveal-arm/);
});

test("god descendant control-file write becomes a parent ask; auto descendant still throws", () => {
  const god = escalationPlugin([
    { before: { session: "ses_child", tool: "write", callID: "c1", args: { filePath: "/work/.config/opencode/autoclass" } } },
    { ask: { session: "ses_child", callID: "c1", permission: "edit", status: "allow", command: "write autoclass", patterns: ["/work/.config/opencode/autoclass"] } },
  ]);
  assert.equal(god.results[0].threw, null);
  assert.equal(god.results[1].approval.kind, "parent");
  const auto = escalationPlugin([
    { before: { session: "ses_child", tool: "write", callID: "c1", args: { filePath: "/work/.config/opencode/autoclass" } } },
  ], { rootMode: "auto" });
  assert.notEqual(auto.results[0].threw, null);
});

test("hook error with a stash denies; without a stash the error propagates", () => {
  // capability flips to an HTTP error after the before-hook stashed the launder floor.
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { breakCapabilities: true },
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
    bashAsk("ses_child", "c2", "ls", "allow"),
  ]);
  assert.equal(results[2].status, "deny");
  assert.match(results[3].threw ?? "", /permission authority unavailable/);
});

test("auto descendant: seat miss is judged by the classifier and settled once by the guard", () => {
  const { results, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_1", session: "ses_child", callID: "c1", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(results[1].approval.kind, "operator");
  assert.deepEqual(replies, [{ id: "per_1", response: "once" }]);
});

test("auto descendant: a named root deny goes to the human once; launder throws like the root", () => {
  const { results, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "git push --force origin x"),
    bashAsk("ses_child", "c1", "git push --force origin x", "deny"),
    bashBefore("ses_child", "c2", "sed -i s/a/b/ notes.txt"),
  ], { rootMode: "auto", agents: undefined });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "human-only");
  assert.match(results[2].threw, /blocked/);
  assert.deepEqual(replies, []);
});

test("auto descendant: a promptable credential is stashed human-only", () => {
  const { results } = escalationPlugin([bashBefore("ses_child", "c1", "rbw get gitea"), bashAsk("ses_child", "c1", "rbw get gitea", "ask")], { rootMode: "auto" });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "human-only");
});

test("auto root own ordinary ask: no proposal, so the classifier handler approves it", () => {
  const { results, replies } = escalationPlugin([
    bashAsk("ses_root", "c1", "npm run build", "ask"),
    { asked: { id: "per_2", session: "ses_root", callID: "c1", permission: "bash", kind: null, command: "npm run build" } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(results[0].approval, undefined);
  assert.deepEqual(replies, [{ id: "per_2", response: "once" }]);
});

test("an operator ask without a judged mark is left for the human", () => {
  const { replies } = escalationPlugin([
    { asked: { id: "per_3", session: "ses_child", callID: "cX", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
  ], { rootMode: "auto" });
  assert.deepEqual(replies, []);
});

test("a stash that outlives its tool call is reported as escalation-missed", () => {
  const { log } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { after: { session: "ses_child", tool: "bash", callID: "c1" } },
  ]);
  assert.match(log, /escalation-missed/);
});

test("unattended or level off: no proposals and legacy throws", () => {
  const unattended = escalationPlugin([bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt")], { unattended: true });
  assert.notEqual(unattended.results[0].threw, null);
  const off = escalationPlugin([bashAsk("ses_child", "c1", "./check-gates.sh", "deny")], { level: "off" });
  assert.equal(off.results[0].approval, undefined);
  assert.equal(off.results[0].status, "deny");
});
```

- [ ] **Step 2: Run to verify they fail**

Workdir `/home/dev/opencode-guard`: `node --test tests/escalation-plugin.test.mjs`
Expected: FAIL (before-hook throws for god descendants, no override, operator never settled, etc.).

- [ ] **Step 3: Implement**

1. Add the closure state from Interfaces next to `denials`. Bound both collections: drop entries older than 10 minutes or beyond 500 entries, logging `escalation-evicted` for any dropped stash (an evicted stash means a call never reached its ask; it must not be silent).
2. Extract `floorRefusal` from the current sequence (native credential path check, cc-safety-net, launder, hard credential, promptable credential, level `static` cut-off, classifier incl. no-lane and unavailable): every `throw new Error(X)` becomes `return { class, message: X }` with class `credential`, `net`, `net-error`, `launder`, `credential`, `credential-promptable` (`promptable: true`), `no-classifier`, `llm`, `classifier-unavailable`; the `log("deny(...)")` lines stay where they are. Launder takes `launderReason(command, rules) ?? (rootRules ? launderReason(command, rootRules) : null)`. Reveal-arm and control-file checks are NOT in `floorRefusal`; they move above it (step 4 below).
3. `permission.ask` hook:

```js
    "permission.ask": async (input, output) => {
      if (level() === "off") return;
      const sessionID = input?.sessionID;
      if (!sessionID) return;
      const key = escalationKey(sessionID, input?.tool?.callID, input?.permission);
      const escalation = pendingEscalations.get(key);
      pendingEscalations.delete(key);
      try {
        if (isUnattended) {
          if (escalation) throw new Error("an unattended session cannot carry an escalation");
          return;
        }
        const ctx = await authority.rootContext(sessionID);
        const command = strip(input?.metadata?.command);
        const rootDeny = input?.permission === "bash" && command ? bashDenyKind(command, await rulesFor(ctx.rootSessionID)) : null;
        const proposal = decideProposal({ ...ctx, permission: input?.permission, status: output.status, escalation, rootDeny });
        if (!proposal) {
          // A stash always maps to a proposal in the table; reaching here is a guard bug.
          if (escalation) throw new Error(`stashed ${escalation.kind} escalation produced no proposal`);
          return;
        }
        output.status = proposal.status;
        if (proposal.override) output.override = proposal.override;
        if (proposal.approval) output.approval = proposal.approval;
        if (proposal.forceAsk) output.forceAsk = true;
        if (proposal.always) output.always = proposal.always;
        if (proposal.judged) judged.add(key);
        log(proposal.override ? "allow(god/override)" : proposal.approval ? `escalate(${proposal.approval.kind})` : "allow(god)",
          command ?? input?.permission);
      } catch (error) {
        if (!escalation) throw error; // native keeps its own verdict
        // A deferred guard floor must never run because the guard failed: deny this call.
        log("escalation-error", `${error?.message ?? error}`);
        output.status = "deny";
      }
    },
```

   Import `decideProposal` from `./lib/escalation.js` and `bashDenyKind` from `./lib/policy.js`.

   > **SUPERSEDED (review fixes and root-policy round, 2026-10-14).** The hook snippet above is the original sketch. The source now: separates a floor ESCALATION `{ kind }` from a ROOT-POLICY marker `{ route: "root-policy", rootDeny }` held in the same slot-retained map (expiry keeps a denying tombstone, capacity refuses new entries, nothing evicts them); reads the call context by `(sessionID, callID)` without consuming it; fixes the original binding before any await so any failure with a restriction or bound call denies; denies when a marker disagrees with the root's current rules or forms no proposal; validates the binding even for a null proposal; applies a `{ status: "deny" }` proposal with every grant field cleared; and binds judged marks to the request patterns. See the design's root-policy rulings 4-6.

4. `tool.execute.before`, after the unchanged tree-rule block and before today's config-deny block, insert:

```js
      // 2026-10-14 god escalation policy (docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md).
      // Only on a capable host for an attended session; everything else falls through to the
      // legacy fail-closed sequence below, unchanged.
      let ctx = null;
      if (!isUnattended && input?.sessionID) {
        try {
          ctx = await authority.rootContext(input.sessionID);
        } catch (error) {
          if (error?.code !== AUTHORITY_UNSUPPORTED) throw error;
        }
      }
      if (ctx) {
        if (ctx.isRoot && ctx.rootMode === "god") { log("allow(god)", command ?? input?.tool); return; }
        const permissionKey = DEFERRABLE[input?.tool];
        const key = escalationKey(input.sessionID, input?.callID, permissionKey);
        // The guard's own switches and the reveal window stay out of every escalation path.
        if (nativeToolWritesControlFile({ tool: input?.tool, args: output?.args, directory }) || (command && commandWritesControlFile(command))) {
          if (!ctx.isRoot && ctx.rootMode === "god" && permissionKey) {
            pendingEscalations.set(key, { kind: "parent", permission: permissionKey, reason: `control-file: ${command ?? input?.tool}`, at: Date.now() });
            log("stash(parent/control-file)", command ?? input?.tool);
            return;
          }
          log(`deny(${input?.tool}/control-file)`, command ?? input?.tool);
          throw new Error(controlDeny);
        }
        if (command && (/\boc-reveal\b/.test(command) || /\.config\/opencode\/reveal\b/.test(command))) {
          if (!ctx.isRoot && ctx.rootMode === "god" && permissionKey) {
            pendingEscalations.set(key, { kind: "parent", permission: permissionKey, reason: `reveal-arm: ${command}`, at: Date.now() });
            log("stash(parent/reveal-arm)", command);
            return;
          }
          log("deny(reveal-arm)", command);
          throw new Error(REVEAL_ARM_REFUSAL);
        }
        const rules = await rulesFor(input.sessionID);
        if (!ctx.isRoot && ctx.rootMode === "god" && permissionKey) {
          const refusal = await floorRefusal({ tool: input?.tool, args: output?.args, command, sessionID: input.sessionID, mode: await currentMode(), rules });
          if (refusal) {
            pendingEscalations.set(key, { kind: "parent", permission: permissionKey, reason: `${refusal.class}: ${command ?? input?.tool}`, at: Date.now() });
            log(`stash(parent/${refusal.class})`, command ?? input?.tool);
          }
          return;
        }
        // A god descendant on a non-deferrable tool (pty_spawn, bg_run, ...) has no guaranteed
        // native ask, so it keeps the legacy throwing sequence below (design 9, default 4).
        if (ctx.rootMode !== "god") {
          const rootRules = await rulesFor(ctx.rootSessionID);
          if (command && configDenyReason(command, rootRules)) return; // native denies; the hook routes it
          const refusal = await floorRefusal({ tool: input?.tool, args: output?.args, command, sessionID: input.sessionID,
            mode: await currentMode(), rules, rootRules: ctx.isRoot ? undefined : rootRules });
          if (!refusal) return;
          if (refusal.promptable) {
            if (ctx.isRoot) return; // native prompt, as before
            if (permissionKey) {
              pendingEscalations.set(key, { kind: "human-only", permission: permissionKey, reason: refusal.class, at: Date.now() });
              return;
            }
          }
          throw new Error(refusal.message);
        }
      }
```

   > **SUPERSEDED (review fixes and root-policy round, 2026-10-14).** In the snippet above, `if (command && configDenyReason(command, rootRules)) return;` is replaced by: the ROOT's effective `bashDenyKind` (winning rule) alone decides the route, the session's own rules are not required to deny too, and the route stashes a ROOT-POLICY marker for the exact call (a call without a call ID is refused with the legacy config-deny message). The route runs ahead of every static floor, cc-safety-net included (agreed precedence, design root-policy ruling 3). `mode: await currentMode()` is replaced by the ROOT's mode for a non-god root's tree (G3 still runs). Every attended descendant tool call, not only the six deferrable ones, captures its root binding before any asynchronous work and is refused before its tool runs when the capture fails; the binding is kept per `(sessionID, callID)` until `tool.execute.after`.

   Import `AUTHORITY_UNSUPPORTED` from `./lib/authority.js`. `REVEAL_ARM_REFUSAL` is the existing reveal message (lift the string at ~1021-1025 into a module constant used by both places). Leave the old sequence below it as the legacy path, but make it call `floorRefusal` and throw its message (one implementation of the floors, two callers).

5. Event handler: replace `if (p?.approval?.kind === "human-only" || p?.approval?.kind === "operator") return;` with:

```js
      if (p?.approval?.kind === "human-only") return;
      if (p?.approval?.kind === "operator") {
        // Only an operator ask this guard proposed as "judged as root" is settled here; an
        // escalated parent request, or one whose mark a restart lost, stays with the person.
        const key = escalationKey(p.sessionID, p?.tool?.callID, permission);
        if (!judged.delete(key)) return;
      }
```

6. `tool.execute.after`, before the `level() === "off"` return:

```js
      const permissionKey = DEFERRABLE[input?.tool];
      if (permissionKey) {
        const key = escalationKey(input?.sessionID, input?.callID, permissionKey);
        if (pendingEscalations.delete(key)) {
          await reportError("escalation-missed", `opencode-guard: a ${input?.tool} call in ${input?.sessionID} ran without reaching its permission hook, so a deferred guard floor was not applied. Native must ask on every ${input?.tool} call.`);
        }
      }
```

7. Rewrite the comment at ~922-941: god now lifts opencode's own deny rules for the god root's own visible-tool requests through a native, logged, exact-request override; descendants of a god root escalate refusals, including control-file and reveal-arm floors on deferrable tools, to the root model; the guard no longer re-applies config deny for capable hosts because native denies are authoritative over Always (native Task 1). Non-deferrable process-tool refusals still throw (known gap; follow-up owner: lead).
8. `README.md`: replace any statement that deny rules hold in god mode with the policy above, one paragraph, pointing to the design doc URL.

- [ ] **Step 4: Run to verify they pass, then the suite**

Workdir `/home/dev/opencode-guard`:

```bash
node --test tests/escalation-plugin.test.mjs tests/escalation.test.mjs
node --test tests/*.test.mjs
```

Expected: PASS. Existing tests that asserted a god descendant's floor throws, or that operator asks are never touched, are superseded: update each one to the new matrix cell and name the cell (A13/A15/A20) in its test title. Any other failure is a defect.

- [ ] **Step 5: Prove the tests catch the change**

Workdir `/home/dev/opencode-guard`: `git stash push plugin.js`, run `node --test tests/escalation-plugin.test.mjs` (expected FAIL), `git stash pop`.

**Execution notes (Tasks 3-4, guard).** Tasks 3 and 4 ran as lead-orchestrated, uncommitted rounds (initial, review fixes, root-policy round). The `escalationKey`-only call context in "Type consistency" below is superseded: the call identity is keyed `(sessionID, callID)`, restrictions and marks by `(sessionID, callID, permission)`. The Step 5 stash proof was not run in the root-policy round (that round's brief excluded `git stash`); RED was shown by running the new tests against the unchanged source first. Counts, deleted and rewritten tests, measured costs and remaining gaps: [guard progress ledger](file:///home/dev/opencode-guard/docs/superpowers/plans/2026-10-14-god-escalation-policy-guard-progress.md).

---

### Task 5: Cross-repo verification and acceptance mapping

**Files:**
- Modify: `docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md` (Status line and section 8: mark each A-row with the test name that proves it and its last result)

- [ ] **Step 1:** The `tester` seat runs, and reports exact pass/fail counts for each:

Workdir `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode`:
```bash
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run test
/home/dev/.local/share/opencode-effort-toolchain/bun-1.4.2/bun run typecheck
```
Workdir `.../packages/core`: `bun run test`, `bun run typecheck` (same Bun path). Workdir `.../packages/plugin`: `bun run typecheck` (same Bun path).
Workdir `/home/dev/opencode-guard`: `node --test tests/*.test.mjs`.

Expected: all PASS, typecheck clean.

- [ ] **Step 2:** For each acceptance row A1-A24 in the design's section 8, record the proving test name and result. A row with no passing test is a gap: add the test to the owning task (Task 1 native, Tasks 3-4 guard) and re-run; do not mark it done.
- [ ] **Step 3:** Update the design's Status line to "Implemented in source (unit level); not built, not deployed; real TUI proof pending an authorized binary".

## Self-review (writing-plans checklist, done 2026-10-14)

1. **Spec coverage:** policy 1 -> Task 1 (override) + Task 3 (table) + Task 4 (god root before-hook bypass above config deny); policy 2 -> Tasks 1/3/4 (any deny, floors stashed as parent; ceilings no longer skipped); policy 3 -> Tasks 3/4 (judged operator, human-only named, promptable); policy 4 -> Task 1 hidden-tool test, Task 4 unchanged-gates test; removal list -> Tasks 1-2 (native), 3-4 (guard); capability -> Tasks 1/3; Always hole -> Task 1; zero-pattern -> Task 1; row-58 regression -> Tasks 3/4; serialization -> Task 0. No spec section without a task.
2. **Placeholder scan:** harness construction in Task 4 Step 1 is specified as an exact diff against a named existing helper (`incarnationPluginSteps`, `tests/authority.test.mjs` ~438-490) rather than re-printed in full; every behaviour it needs is listed. `runShellAsk` / `runShell` likewise name the existing helper they rename or reuse.
3. **Type consistency:** `prepareForRequest` input `{ req, sessionID, rootSessionID, toolID, ruleset, trigger }` and output `{ ruleset, approval, forceAsk, always, deny }` are used identically in Task 1's tests, implementation and `SessionTools`; `decideProposal` input keys match Task 4's call; `escalationKey(sessionID, callID, permission)` is used identically in hook, before, after and event handler; `DEFERRABLE` maps tool -> permission key consistently.
4. **Review Focus:** each of the five lines has its pinning test in the owning task (Task 4 hook-error test; Task 1 Always test; Task 1 zero-pattern tests; Task 1 hidden-tool test; Task 4 unmarked-operator test plus the kept authority mode-change tests).

## Execution handoff

After Task 0's gate passes, the lead orchestrates serialized specialists with explicit path owners. Do not use `plan-run`: the lead session cwd `/home/dev/projects/md` is not a Git repository, `plan-run` has no external-repository workdir argument, and it commits. No commit steps. Preserve the Task 2 freeze/review gate and re-verify cited line numbers immediately before implementation; the lead integrates and Task 5 runs after implementation.
