# God mode reaches delegated exec/write children -- implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In an attended God session, a direct exec/write subagent runs what God would run, while every other mode, read-only seats, unattended runs and named denies behave exactly as today.

**Architecture:** Two independent changes that are each safe alone. (1) opencode-guard 1.9.0 derives a `god-delegated` mode for an eligible child, lifts the floor for it (keeping control-file and credential checks), skips only catch-all bash denies in its own deny copy, and implements the `permission.ask` hook. (2) The opencode fork lets the `permission.ask` hook soften an agent-declared catch-all bash deny to an ask, in `session/tools.ts`'s `ctx.ask`. Without the guard the fork changes nothing; without the fork the guard cannot lift a native deny.

**Tech Stack:** Node ESM + `node:test` (guard); TypeScript + Effect + `bun test` on bun 1.4.2 (fork).

**Spec:** `/home/dev/opencode-guard/docs/superpowers/specs/2026-10-12-god-delegated-native-bridge-design.md` (approved 2026-10-12).

## Global Constraints

- Eligible seats: agent front matter `capability: exec` or `capability: write` only.
- Eligible sessions: attended process; no mode file of its own; IMMEDIATE parent's own mode file reads `god`.
- Any lookup failure resolves to today's G3 result, never to `god-delegated`.
- `god-delegated` keeps: agent-launch ban, D0, D1, G1/G2/G4, named config denies, native control-file check, shell control-file check, reveal-arm check, hard and promptable credential checks, redaction, questions never auto-answered.
- `god-delegated` lifts: cc-safety-net, the launder floor, the classifier. Asks are approved `once`.
- Only a catch-all deny is softened: the matched rule's pattern is exactly `*`, for permission `bash`, declared in the AGENT ruleset (never a session/parent ceiling). A named deny anywhere in the command keeps the whole command denied.
- A plugin can only move `deny` to `ask`; `allow` is capped to `ask`; no hook, a throwing hook, or `deny` leaves the deny.
- Nothing is stored: no session rules written, no mode file written, no "always" approval.
- Fork builds start from `fork/effort-combined` (deployed `4998bf235`, binary `0.0.0-fork/effort-combined-202610122257`, sha256 `fff9e827...`). Build channel stays `fork/snip-always-prefix` (FORK.md). The fork worktree is `/home/dev/projects/opencode-god-catchall-bridge` on branch `fork/god-catchall-bridge`, already reset to `4998bf235`.
- Never touch `/home/dev/projects/opencode` (owned by another session).
- The guard's live checkout `/home/dev/opencode-guard` is loaded by every opencode process at spawn. All guard code work happens in a worktree `/home/dev/opencode-guard-god-delegated` (branch `feat/god-delegated`) and lands on `main` only when the suite is green.
- Guard plugin rule: `plugin.js` exports exactly one factory; helpers live in `lib/`.
- No AI attribution, no emoji, anywhere. Git commands use `--no-pager`.
- Guard tests: `node --test tests/*.test.mjs` (explicit glob) from the guard worktree root.
- Fork tests: `export PATH=~/.local/share/opencode-effort-toolchain/bun-1.4.2:$PATH` first; then from `packages/opencode`: `bun test <file>` and `bun run typecheck`.

## Review Focus

1. **A command mixing a named deny and a catch-all-denied segment** (`ls && rm -rf /x` under a seat whose catch-all is deny and `rm -rf /*` is a named deny): must stay denied in both guard and fork. Tests in Task 1 and Task 2.
2. **The root leaves God while a child is running**: the child's next call must resolve `auto`; a softened ask that arrives after the switch must be rejected. Test in Task 3.
3. **A grandchild, or a child whose agent cannot be identified**: must keep the G3 result. Tests in Task 3.
4. **A read-only seat under a God root** (scout): gains nothing -- the catch-all deny stands and its floor runs. Test in Task 3.
5. **Any other plugin implementing `permission.ask`**: it could also soften. Acceptable by spec (only plugins installed by Holden run), but the fork test pins that the hook result, not the plugin's identity, decides -- and that only catch-all agent denies ever reach a hook. Test in Task 1.

---

### Task 1: Fork -- a catch-all bash deny may be softened by the `permission.ask` hook

**Files:**
- Modify: `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode/src/permission/index.ts` (add two exports after `merge`, ~line 202)
- Modify: `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode/src/session/tools.ts:81-89` (`ask` in `context`)
- Create: `/home/dev/projects/opencode-god-catchall-bridge/packages/opencode/test/permission/soften.test.ts`
- Modify: `/home/dev/projects/opencode-god-catchall-bridge/FORK.md` (new section 3)

**Interfaces:**
- Produces: `Permission.catchAllDenied(permission: string, patterns: readonly string[], agentRules: PermissionV1.Ruleset, sessionRules: PermissionV1.Ruleset): string[]`
- Produces: `Permission.softenCatchAll(input: { permission: string; patterns: readonly string[]; agentRules: PermissionV1.Ruleset; sessionRules: PermissionV1.Ruleset; hook: () => Effect.Effect<"ask" | "deny" | "allow"> }): Effect.Effect<PermissionV1.Rule[]>` -- the ruleset to hand `Permission.ask`.
- Produces (runtime contract for Task 3): the plugin hook `permission.ask` is triggered with input `{ ...req, sessionID }` where `req` is the tool's ask request (`permission`, `patterns`, `always`, `metadata`), and output `{ status: "deny" }`. It fires ONLY when every denied pattern of the request is denied by an agent-declared `*` rule.

Seam choice: the softening lives in `tools.ts`'s `ctx.ask`, which already holds both `plugin` and `permission`, and through which every native tool, MCP tool and plugin tool (background-shells' `bg_run` calls `ctx.ask` at `bg-auth.js:140`) asks. `Permission.ask`'s interface and its `AskInput` schema stay unchanged, so no other caller or test double changes. The decision logic is a pure exported function plus one small Effect, so it is unit-testable without a plugin runtime.

- [ ] **Step 1: Prepare the worktree toolchain**

```bash
cd /home/dev/projects/opencode-god-catchall-bridge
git --no-pager log -1 --oneline   # expect 4998bf235
export PATH=~/.local/share/opencode-effort-toolchain/bun-1.4.2:$PATH
bun --version                     # expect 1.4.2
bun install --frozen-lockfile --ignore-scripts
```

- [ ] **Step 2: Write the failing test** -- `packages/opencode/test/permission/soften.test.ts`

```ts
import { test, expect } from "bun:test"
import { Effect } from "effect"
import { Permission } from "../../src/permission"
import type { PermissionV1 } from "@opencode-ai/core/v1/permission"

const rule = (permission: string, pattern: string, action: "allow" | "deny" | "ask"): PermissionV1.Rule => ({
  permission,
  pattern,
  action,
})

// The shape `tools: {"*": false}` produces, then a seat's exact allowlist and one named deny.
const catchAll = rule("*", "*", "deny")
const agentRules = [catchAll, rule("bash", "go test *", "allow"), rule("bash", "rm -rf /*", "deny")]

const run = (patterns: string[], hook: () => Effect.Effect<"ask" | "deny" | "allow">, sessionRules: PermissionV1.Rule[] = [], permission = "bash") =>
  Effect.runSync(Permission.softenCatchAll({ permission, patterns, agentRules, sessionRules, hook }))

const verdict = (ruleset: PermissionV1.Rule[], pattern: string, permission = "bash") =>
  Permission.evaluate(permission, pattern, ruleset).action

test("a catch-all bash deny becomes an ask when the hook says ask", () => {
  let calls = 0
  const out = run(["./check-gates.sh"], () => Effect.sync(() => (calls++, "ask" as const)))
  expect(calls).toBe(1)
  expect(verdict(out, "./check-gates.sh")).toBe("ask")
})

test("allow from the hook is capped at ask", () => {
  const out = run(["./check-gates.sh"], () => Effect.succeed("allow" as const))
  expect(verdict(out, "./check-gates.sh")).toBe("ask")
})

test("deny, a throwing hook and a failing hook all leave the deny", () => {
  expect(verdict(run(["./x"], () => Effect.succeed("deny" as const)), "./x")).toBe("deny")
  expect(verdict(run(["./x"], () => Effect.die(new Error("boom"))), "./x")).toBe("deny")
  expect(verdict(run(["./x"], () => Effect.fail("no") as never), "./x")).toBe("deny")
})

test("a named deny never consults the hook, even beside a catch-all-denied segment", () => {
  let calls = 0
  const hook = () => Effect.sync(() => (calls++, "ask" as const))
  expect(verdict(run(["rm -rf /etc"], hook), "rm -rf /etc")).toBe("deny")
  const mixed = run(["ls", "rm -rf /etc"], hook)
  expect(verdict(mixed, "ls")).toBe("deny")
  expect(verdict(mixed, "rm -rf /etc")).toBe("deny")
  expect(calls).toBe(0)
})

test("a permission other than bash never consults the hook", () => {
  let calls = 0
  run(["/some/file"], () => Effect.sync(() => (calls++, "ask" as const)), [], "edit")
  expect(calls).toBe(0)
})

test("a catch-all deny from the SESSION (a parent ceiling) is never softened", () => {
  let calls = 0
  const sessionCeiling = [rule("bash", "*", "deny")]
  const out = run(["go test ./..."], () => Effect.sync(() => (calls++, "ask" as const)), sessionCeiling)
  expect(calls).toBe(0)
  expect(verdict(out, "go test ./...")).toBe("deny")
})

test("an allowed command never consults the hook and keeps its allow", () => {
  let calls = 0
  const out = run(["go test ./..."], () => Effect.sync(() => (calls++, "ask" as const)))
  expect(calls).toBe(0)
  expect(verdict(out, "go test ./...")).toBe("allow")
})

test("catchAllDenied lists only patterns denied by an agent catch-all", () => {
  expect(Permission.catchAllDenied("bash", ["./a", "go test x"], agentRules, [])).toEqual(["./a"])
  expect(Permission.catchAllDenied("bash", ["./a", "rm -rf /x"], agentRules, [])).toEqual([])
  expect(Permission.catchAllDenied("edit", ["./a"], agentRules, [])).toEqual([])
})
```

- [ ] **Step 3: Run it to verify it fails**

Run (from `packages/opencode`): `bun test test/permission/soften.test.ts`
Expected: FAIL -- `Permission.softenCatchAll` / `Permission.catchAllDenied` is not a function.

- [ ] **Step 4: Implement the helpers** -- insert after `merge` in `packages/opencode/src/permission/index.ts`, and add `Exit` to the `effect` import (`import { Deferred, Effect, Exit, Layer, Context } from "effect"`)

```ts
// The patterns of a bash request whose verdict is a deny from a catch-all ("*") rule the
// AGENT declared -- the shape a seat's `tools: {"*": false}` produces. Empty when any pattern
// is denied by anything else: a named deny, or a deny the session carries as a ceiling from
// its parent. Those are never softened, so one of them keeps the whole request denied.
export function catchAllDenied(
  permission: string,
  patterns: readonly string[],
  agentRules: PermissionV1.Ruleset,
  sessionRules: PermissionV1.Ruleset,
): string[] {
  if (permission !== "bash") return []
  const merged = merge(agentRules, sessionRules)
  const out: string[] = []
  for (const pattern of patterns) {
    const rule = merged.findLast(
      (item) => Wildcard.match(permission, item.permission) && Wildcard.match(pattern, item.pattern),
    )
    if (!rule || rule.action !== "deny") continue
    const fromAgent = agentRules.includes(rule) && !sessionRules.includes(rule)
    if (rule.pattern !== "*" || !fromAgent) return []
    out.push(pattern)
  }
  return out
}

// The ruleset `Permission.ask` should evaluate. When catchAllDenied finds patterns, the
// `permission.ask` plugin hook may turn those denies into asks -- never into allows, and a
// hook that is absent, fails or answers deny leaves the deny standing. The extra rules exist
// only in this one request's ruleset: nothing is stored on the session or in the approvals.
export const softenCatchAll = Effect.fn("Permission.softenCatchAll")(function* (input: {
  permission: string
  patterns: readonly string[]
  agentRules: PermissionV1.Ruleset
  sessionRules: PermissionV1.Ruleset
  hook: () => Effect.Effect<"ask" | "deny" | "allow">
}) {
  const merged = merge(input.agentRules, input.sessionRules)
  const soft = catchAllDenied(input.permission, input.patterns, input.agentRules, input.sessionRules)
  if (soft.length === 0) return merged
  const exit = yield* Effect.exit(input.hook())
  if (Exit.isFailure(exit) || exit.value === "deny") return merged
  return [...merged, ...soft.map((pattern) => ({ permission: input.permission, pattern, action: "ask" as const }))]
})
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test test/permission/soften.test.ts`
Expected: PASS, 8 tests. If `Effect.fail("no") as never` does not type-check, replace that line with `() => Effect.die("no")` and keep the assertion.

- [ ] **Step 6: Wire it into `ctx.ask`** -- replace `packages/opencode/src/session/tools.ts:81-89`

```ts
    ask: (req) =>
      Effect.gen(function* () {
        // An agent's catch-all bash deny may be softened to an ask by the permission.ask
        // plugin hook (opencode-guard does so only in an attended God session). Named
        // denies and the session's inherited ceilings never reach the hook. See FORK.md 3.
        const ruleset = yield* Permission.softenCatchAll({
          permission: req.permission,
          patterns: req.patterns,
          agentRules: input.agent.permission,
          sessionRules: input.session.permission ?? [],
          hook: () =>
            plugin
              .trigger(
                "permission.ask",
                { ...req, sessionID: input.session.id } as any,
                { status: "deny" as "ask" | "deny" | "allow" },
              )
              .pipe(Effect.map((out) => out.status)),
        })
        return yield* permission.ask({
          ...req,
          sessionID: input.session.id,
          tool: { messageID: input.processor.message.id, callID: options.toolCallId },
          ruleset,
        })
      }).pipe(Effect.orDie),
```

- [ ] **Step 7: Typecheck and run the permission and session suites**

```bash
cd packages/opencode
bun run typecheck
bun test test/permission/
bun test test/session/prompt.test.ts
```
Expected: typecheck exits 0; all pass (FORK.md records `prompt.test.ts` at 61 pass on its branch -- record the actual count, and any pre-existing failure, by name).

- [ ] **Step 8: Document it** -- append to `FORK.md` before "## Build, install, and rebase policy"

```markdown
## 3. A plugin cannot lift a seat's catch-all deny, even in a mode that grants everything

A seat that declares `tools: {"*": false}` gets a deny-everything rule followed by its own
allowlist (`packages/core/src/v1/config/agent.ts:68-77`). `Permission.ask` returns `DeniedError`
on that deny before any plugin sees the request, and the `permission.ask` hook is declared in
`packages/plugin/src/index.ts` but never called. So a permission plugin that implements a mode
meant to allow everything (opencode-guard's attended God mode, extended to direct exec/write
subagents) cannot do so for such a seat.

### The change

`session/tools.ts`'s `ctx.ask` -- the path every native, MCP and plugin tool asks through --
computes the request's ruleset with `Permission.softenCatchAll`. Only when every denied pattern is
denied by an AGENT-declared `*` rule for `bash` does it trigger `permission.ask` with
`{ status: "deny" }`. The hook may answer `ask` (an `allow` is treated as `ask`); the request then
takes the ordinary ask path and is answered like any other prompt. No hook, a throwing hook, or
`deny` leaves the deny. Named denies, session ceilings inherited from a parent, and every other
permission never reach the hook. Nothing is stored.

### How it is verified

`bun test test/permission/soften.test.ts` -- softening, the allow cap, the three deny outcomes,
named and session denies never consulting the hook, non-bash permissions, and allowed commands.
```

- [ ] **Step 9: Commit on the fork branch**

```bash
cd /home/dev/projects/opencode-god-catchall-bridge
git add packages/opencode/src/permission/index.ts packages/opencode/src/session/tools.ts \
  packages/opencode/test/permission/soften.test.ts FORK.md
git commit -m "Let the permission.ask hook soften a seat's catch-all bash deny to an ask"
```
Do not push until Task 5's build is verified (the pre-push hook typechecks with the pinned bun).

---

### Task 2: Guard -- pure policy helpers

**Files:**
- Setup: worktree `/home/dev/opencode-guard-god-delegated`
- Modify: `lib/policy.js` -- `nativeBashVerdict` (~1107), `configDenyReason` (~1297), `shouldAutoApprove` (~168), export list (~1606)
- Test: `tests/policy.test.mjs` (append)

**Interfaces:**
- Produces: `nativeBashMatch(command, rules) -> [pattern, verdict] | undefined` (last match wins).
- Produces: `configDenyReason(command, rules = configBashRules, { softenCatchAll = false } = {}) -> null | { segment, pattern }`.
- Produces: `GOD_MODES`, `isGodMode(mode) -> boolean` (`god` or `god-delegated`).
- Produces: `delegatedGodEligible({ ownMode, parentMode, unattended, capability }) -> boolean`.
- Changes: `shouldAutoApprove` treats `god-delegated` exactly as `god`.

- [ ] **Step 1: Create the guard worktree**

```bash
cd /home/dev/opencode-guard
git --no-pager status --short       # only docs/superpowers/plans/2026-09-30-* untracked (not ours): leave them
git worktree add -b feat/god-delegated /home/dev/opencode-guard-god-delegated main
cd /home/dev/opencode-guard-god-delegated && npm install --no-fund --no-audit
node --test tests/*.test.mjs        # baseline: record pass/fail counts
```

- [ ] **Step 2: Write the failing tests** -- append to `tests/policy.test.mjs` (it already imports `lib/policy.js` as `P` after pointing HOME at a fixture; reuse that `P`)

```js
test("nativeBashMatch reports the rule that decided, last match wins", () => {
  const rules = [["*", "deny"], ["go test *", "allow"], ["rm -rf /*", "deny"]];
  assert.deepEqual(P.nativeBashMatch("./check-gates.sh", rules), ["*", "deny"]);
  assert.deepEqual(P.nativeBashMatch("go test ./...", rules), ["go test *", "allow"]);
  assert.deepEqual(P.nativeBashMatch("rm -rf /etc", rules), ["rm -rf /*", "deny"]);
  assert.equal(P.nativeBashMatch("x", []), undefined);
});

test("configDenyReason names the matched pattern and can skip only a catch-all deny", () => {
  const rules = [["*", "deny"], ["go test *", "allow"], ["rm -rf /*", "deny"]];
  assert.deepEqual(P.configDenyReason("./check-gates.sh", rules), { segment: "./check-gates.sh", pattern: "*" });
  assert.equal(P.configDenyReason("./check-gates.sh", rules, { softenCatchAll: true }), null);
  assert.deepEqual(P.configDenyReason("rm -rf /etc", rules, { softenCatchAll: true }),
    { segment: "rm -rf /etc", pattern: "rm -rf /*" });
  // A named deny in any segment still wins when the catch-all is skipped.
  assert.equal(P.configDenyReason("ls && rm -rf /etc", rules, { softenCatchAll: true })?.pattern, "rm -rf /*");
  assert.equal(P.configDenyReason("go test ./...", rules, { softenCatchAll: true }), null);
});

test("isGodMode covers god and god-delegated only", () => {
  assert.equal(P.isGodMode("god"), true);
  assert.equal(P.isGodMode("god-delegated"), true);
  for (const m of ["auto", "edits", "manual", "", undefined, "GOD"]) assert.equal(P.isGodMode(m), false);
});

test("delegatedGodEligible: attended, no own file, parent's own file god, exec or write seat", () => {
  const ok = { ownMode: null, parentMode: "god", unattended: false, capability: "write" };
  assert.equal(P.delegatedGodEligible(ok), true);
  assert.equal(P.delegatedGodEligible({ ...ok, capability: "exec" }), true);
  assert.equal(P.delegatedGodEligible({ ...ok, capability: "read" }), false, "read-only seats gain nothing");
  assert.equal(P.delegatedGodEligible({ ...ok, capability: null }), false, "undeclared or unknown agent");
  assert.equal(P.delegatedGodEligible({ ...ok, unattended: true }), false);
  assert.equal(P.delegatedGodEligible({ ...ok, ownMode: "auto" }), false, "a session with its own file owns its mode");
  for (const parentMode of ["auto", "edits", "manual", null]) {
    assert.equal(P.delegatedGodEligible({ ...ok, parentMode }), false);
  }
});

test("shouldAutoApprove treats god-delegated as god, and never answers a question", () => {
  assert.equal(P.shouldAutoApprove({ mode: "god-delegated", permission: "bash", verdict: null }), true);
  assert.equal(P.shouldAutoApprove({ mode: "god-delegated", permission: "edit", verdict: null }), true);
  assert.equal(P.shouldAutoApprove({ mode: "god-delegated", permission: "question", verdict: null }), false);
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `node --test tests/policy.test.mjs`
Expected: FAIL -- `P.nativeBashMatch is not a function` (and the others).

- [ ] **Step 4: Implement** -- in `lib/policy.js`

Replace `nativeBashVerdict` (~1105-1112):
```js
// The rule opencode's matcher settles on for one command from a bash ruleset: the LAST
// matching rule in insertion order wins. [pattern, verdict], or undefined.
const nativeBashMatch = (command, rules) => {
  const str = String(command ?? "").replaceAll("\\", "/");
  let match;
  for (const [pattern, value] of rules ?? []) if (wildcardMatch(str, pattern)) match = [pattern, value];
  return match;
};
const nativeBashVerdict = (command, rules) => nativeBashMatch(command, rules)?.[1];
```

Replace `configDenyReason` (~1297-1315):
```js
// `softenCatchAll` (an attended god or god-delegated session): a segment denied only by a
// catch-all `*` rule -- a seat's `tools: {"*": false}` -- is not refused here; the fork's
// permission.ask bridge decides it. A NAMED deny in any segment still refuses the command.
const configDenyReason = (command, rules = configBashRules, { softenCatchAll = false } = {}) => {
  const text = String(command ?? "");
  const denies = (source) => {
    const match = nativeBashMatch(source, rules);
    if (match?.[1] !== "deny") return null;
    if (softenCatchAll && match[0] === "*") return null;
    return { segment: source, pattern: match[0] };
  };
  if (parser) {
    const tree = parser.parse(text);
    try {
      for (const node of tree.rootNode.descendantsOfType("command")) {
        const found = denies(astSource(node));
        if (found) return found;
      }
      return null;
    } finally {
      tree.delete();
    }
  }
  for (const segment of lex(text)) {
    const found = denies(segment.raw);
    if (found) return found;
  }
  return denies(text);
};
```

Change `shouldAutoApprove` line `if (mode === "god") return true;` to:
```js
  if (isGodMode(mode)) return true;
```

Add after `classifierDecides` (~182):
```js
// god-delegated is never a mode-file value: plugin.js's modeFor derives it for an attended,
// direct exec/write child of a session whose OWN file reads god (spec 2026-10-12). It gets
// god's floor bypass minus the control-file and credential checks.
const GOD_MODES = new Set(["god", "god-delegated"]);
const isGodMode = (mode) => GOD_MODES.has(mode);
const delegatedGodEligible = ({ ownMode, parentMode, unattended, capability } = {}) =>
  !ownMode && parentMode === "god" && unattended === false && (capability === "write" || capability === "exec");
```
(`shouldAutoApprove` is defined above this block; move these three declarations above `shouldAutoApprove` so `isGodMode` is initialised first.)

Add `nativeBashMatch, GOD_MODES, isGodMode, delegatedGodEligible,` to the `export {` list.

- [ ] **Step 5: Run to verify they pass, then the whole suite**

Run: `node --test tests/policy.test.mjs && node --test tests/*.test.mjs`
Expected: PASS; whole-suite counts equal the baseline plus the new tests.

- [ ] **Step 6: Commit (worktree branch)**

```bash
git add lib/policy.js tests/policy.test.mjs
git commit -m "Report which bash rule decided a deny, and name the god-delegated mode"
```

---

### Task 3: Guard -- derive `god-delegated`, apply the check table, implement `permission.ask`

**Files:**
- Modify: `plugin.js` -- imports (~72), header comment (~42), `modeFor` (~365-380), `tool.execute.before` (~824-936), new `"permission.ask"` hook (beside `"shell.env"`), ask handler (~1101-1121)
- Create: `tests/god-delegated.test.mjs`

**Interfaces:**
- Consumes (Task 2): `isGodMode`, `delegatedGodEligible`, `configDenyReason(..., { softenCatchAll })`.
- Consumes (Task 1 runtime contract): hook `permission.ask(input: { sessionID, permission, patterns, always, metadata }, output: { status })`, called only for agent catch-all bash denies, output starts `deny`.

- [ ] **Step 1: Write the failing test** -- `tests/god-delegated.test.mjs`. Same subprocess pattern as `tests/launder.test.mjs`'s `runHook` (the plugin reads HOME at import). A root `ses_root` holds its own mode file; `ses_kid` is its child (`client.session.get` returns `parentID`); `ses_grand` is a grandchild. The child's agent is announced through `chat.params`, exactly as opencode does each turn.

```js
// God mode reaching direct exec/write children (spec 2026-10-12). Through the real hooks, in a
// subprocess with a throwaway HOME, because plugin.js reads its files at import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const AGENTS = { tester: "exec", "sp-implementer": "write", scout: "read" };
const BASH = { "*": "ask", "rm -rf /*": "deny", "git stash*": "allow" };

// steps: [{ hook: "before", session, command } | { hook: "ask", session, permission } |
//         { hook: "asked", session, id, permission, command } | { setMode: [session, mode] }]
const run = ({ rootMode = "god", session = "ses_kid", agent = "sp-implementer", steps }) => {
  const h = mkdtempSync(join(tmpdir(), "guard-god-delegated-"));
  try {
    mkdirSync(join(h, ".config/opencode/agent"), { recursive: true });
    mkdirSync(join(h, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(h, ".config/opencode/opencode.json"), JSON.stringify({ permission: { bash: BASH } }));
    writeFileSync(join(h, ".config/opencode/mode"), "auto\n");
    for (const [name, cap] of Object.entries(AGENTS)) {
      writeFileSync(join(h, `.config/opencode/agent/${name}.md`), `---\ndescription: x\ncapability: ${cap}\n---\nbody\n`);
    }
    writeFileSync(join(h, ".local/share/opencode/modes/ses_root"), `${rootMode}\n`);
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      import { writeFileSync } from "node:fs";
      const parents = { ses_root: null, ses_kid: "ses_root", ses_grand: "ses_kid" };
      const replies = [];
      // Each agent's merged ruleset, as opencode would report it: tester's catch-all deny
      // ("*": false) then its allowlist; sp-implementer and scout inherit the global bash rules.
      const agents = [
        { name: "tester", permission: [{ permission: "*", pattern: "*", action: "deny" },
          { permission: "bash", pattern: "go test *", action: "allow" },
          { permission: "bash", pattern: "rm -rf /*", action: "deny" }] },
        { name: "sp-implementer", permission: Object.entries(${JSON.stringify(BASH)}).map(([pattern, action]) => ({ permission: "bash", pattern, action })) },
        { name: "scout", permission: [{ permission: "*", pattern: "*", action: "deny" }] },
      ];
      const client = {
        session: {
          status: async () => ({ data: Object.fromEntries(Object.keys(parents).map((id) => [id, { type: "busy" }])) }),
          get: async ({ path }) => ({ data: { id: path.id, parentID: parents[path.id] ?? undefined } }),
          messages: async () => ({ data: [] }),
        },
        postSessionIdPermissionsPermissionId: async ({ path, body }) => { replies.push([path.permissionID, body.response]); return {}; },
        app: { log: async () => {}, agents: async () => ({ data: agents }) },
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(h)} });
      for (const id of ["ses_kid", "ses_grand"]) {
        await hooks["chat.params"]({ sessionID: id, agent: ${JSON.stringify(agent)}, provider: { id: "x" } }, { options: {} });
      }
      const out = [];
      for (const step of ${JSON.stringify(steps)}) {
        if (step.setMode) { writeFileSync(${JSON.stringify(join(h, ".local/share/opencode/modes"))} + "/" + step.setMode[0], step.setMode[1] + "\\n"); continue; }
        if (step.hook === "before") {
          try { await hooks["tool.execute.before"]({ tool: "bash", sessionID: step.session, callID: "c" }, { args: { command: step.command } }); out.push("ran"); }
          catch (e) { out.push(String(e?.message ?? e)); }
        } else if (step.hook === "ask") {
          const o = { status: "deny" };
          await hooks["permission.ask"]({ sessionID: step.session, permission: step.permission ?? "bash", patterns: ["x"], always: [], metadata: {} }, o);
          out.push(o.status);
        } else if (step.hook === "asked") {
          await hooks.event({ event: { type: "permission.asked", properties: { id: step.id, sessionID: step.session, permission: step.permission ?? "bash", patterns: [step.command], always: [], metadata: { command: step.command } } } });
          out.push(replies.find(([id]) => id === step.id)?.[1] ?? "none");
        }
      }
      console.log(JSON.stringify(out));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: h }, encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout.trim().split("\n").at(-1));
  } finally {
    rmSync(h, { recursive: true, force: true });
  }
};

test("a write child of a god root passes the floor that refused git stash drop", () => {
  assert.deepEqual(run({ steps: [{ hook: "before", session: "ses_kid", command: "git stash drop 'stash@{0}'" }] }), ["ran"]);
});

test("the same child of an auto root still meets the floor", () => {
  const [out] = run({ rootMode: "auto", steps: [{ hook: "before", session: "ses_kid", command: "git stash drop 'stash@{0}'" }] });
  assert.match(out, /blocked|denied/);
});

test("a tester child of a god root is not refused by its own catch-all deny, but named denies hold", () => {
  const out = run({ agent: "tester", steps: [
    { hook: "before", session: "ses_kid", command: "./check-gates.sh" },
    { hook: "before", session: "ses_kid", command: "rm -rf /etc" },
    { hook: "before", session: "ses_kid", command: "ls && rm -rf /etc" },
  ] });
  assert.equal(out[0], "ran");
  assert.match(out[1], /matches a deny rule/);
  assert.match(out[2], /matches a deny rule/);
});

test("god-delegated keeps the control-file and credential checks", () => {
  const out = run({ steps: [
    { hook: "before", session: "ses_kid", command: "echo god > ~/.local/share/opencode/modes/ses_other" },
    { hook: "before", session: "ses_kid", command: "cat ~/.ssh/id_ed25519" },
  ] });
  assert.match(out[0], /blocked/);
  assert.match(out[1], /blocked/);
});

test("the agent-launch ban holds for god-delegated", () => {
  const [out] = run({ steps: [{ hook: "before", session: "ses_kid", command: "opencode run hello" }] });
  assert.notEqual(out, "ran");
});

test("read-only seats, grandchildren and unknown agents keep today's result", () => {
  assert.equal(run({ agent: "scout", steps: [{ hook: "ask", session: "ses_kid" }] })[0], "deny");
  assert.equal(run({ steps: [{ hook: "ask", session: "ses_grand" }] })[0], "deny");
  assert.equal(run({ agent: "nobody", steps: [{ hook: "ask", session: "ses_kid" }] })[0], "deny");
});

test("permission.ask softens only bash, only in god or god-delegated", () => {
  assert.deepEqual(run({ steps: [
    { hook: "ask", session: "ses_kid" },
    { hook: "ask", session: "ses_kid", permission: "edit" },
    { hook: "ask", session: "ses_root" },
  ] }), ["ask", "deny", "ask"]);
  assert.equal(run({ rootMode: "auto", steps: [{ hook: "ask", session: "ses_kid" }] })[0], "deny");
});

test("a softened ask is approved once while the root holds god, and refused after it leaves", () => {
  const out = run({ agent: "tester", steps: [
    { hook: "asked", session: "ses_kid", id: "per_1", command: "./check-gates.sh" },
    { setMode: ["ses_root", "auto"] },
    { hook: "asked", session: "ses_kid", id: "per_2", command: "./check-gates.sh" },
    { hook: "before", session: "ses_kid", command: "git stash drop" },
  ] });
  assert.equal(out[0], "once");
  assert.notEqual(out[1], "once");
  assert.match(out[2], /blocked|denied/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/god-delegated.test.mjs`
Expected: FAIL -- `hooks["permission.ask"] is not a function`, and `git stash drop` refused under the god root. Before implementing, check every harness assumption against the code and fix the HARNESS (not the assertions) where a client shape differs: `lib/tree.js` reads `client.session.get({ path: { id } })` and `data.parentID`; `client.session.messages` is what `createTeamIndex` pages (read `lib/tree.js` for the exact method); the ask handler's `routeFor` may need a classifier config -- if a step's reply is `none` for a reason unrelated to this feature, make the fixture provide what `routeFor` needs and say so in the report.

- [ ] **Step 3: Implement `modeFor`** -- replace `plugin.js` ~377-379

```js
  const parent = chain.length > 1 ? sessionMode(chain[1]) : null;
  const nearest = chain.slice(1).map((id) => sessionMode(id)).find(Boolean) ?? null;
  const resolved = resolveTreeMode({ own, parent, nearest, fallback: globalMode() });
  // god-delegated (spec 2026-10-12): an attended, direct exec/write child of a session whose
  // OWN file reads god. The agent comes from chat.params (every turn names it) or the session
  // record; anything unknown keeps the G3 answer above. Resolved per call, so a root that
  // leaves god takes its children with it on their next call.
  if (parent === "god" && !isUnattended) {
    const agent = sessionAgents.get(sessionID) ?? (await infoFor(sessionID))?.agent;
    const capability = agent ? agentCapability(agent) : null;
    if (delegatedGodEligible({ ownMode: own, parentMode: parent, unattended: isUnattended, capability })) {
      return "god-delegated";
    }
  }
  return resolved;
```
Add `isGodMode, delegatedGodEligible, agentCapability` to the `lib/policy.js` import if not already imported (`agentCapability` is used at ~789; confirm its import).

- [ ] **Step 4: Apply the check table in `tool.execute.before`** -- replace ~830-859

```js
      // God (and god-delegated) skip only a CATCH-ALL deny here -- a seat's `tools: {"*": false}`
      // -- because the fork's permission.ask bridge decides that one natively. Named denies hold
      // in every mode. (An unattended run never resolves either god mode.)
      const attendedGod = Boolean(command) && !isUnattended && isGodMode(await currentMode());
      if (command) {
        const denied = configDenyReason(command, await rulesFor(input?.sessionID), { softenCatchAll: attendedGod });
        if (denied) {
          log("deny(config)", command);
          throw new Error(
            `[opencode-guard] blocked: \`${denied.segment}\` matches a deny rule in the opencode permission config. ` +
            `Deny rules hold in every mode and over any "Always" approval. Do not rephrase to evade this; ask the user.`,
          );
        }
      }

      const resolved = isUnattended ? null : await currentMode();
      if (resolved === "god") { log("allow(god)", command ?? input?.tool); return; }
      // An attended, direct exec/write child of a god root: god's bypass minus the control-file,
      // reveal and credential checks below, which stop a model-driven child granting itself or
      // another session more than the person granted.
      const delegatedGod = resolved === "god-delegated";
```
Keep the existing control-file (`nativeToolWritesControlFile`) and `nativeCredentialGuardBlocks` blocks and `if (!command) return;` unchanged. Wrap the cc-safety-net block (~864-872) and the launder block (~878-886) in `if (!delegatedGod) { ... }`. Leave the reveal-arm, `commandWritesControlFile`, `touchesHardCredentials` and `touchesPromptableCredentials` blocks unchanged. Immediately after the promptable-credential block (~934) insert:
```js
      if (delegatedGod) { log("allow(god-delegated)", command); return; }
```

- [ ] **Step 5: Add the `permission.ask` hook** -- beside `"shell.env"` in the returned hooks object

```js
    // The fork's bridge (FORK.md 3) calls this ONLY for a request whose every denied pattern is
    // an agent-declared catch-all bash deny, with status "deny". Softened to an ask in god and
    // god-delegated; the ask is then answered "once" by the event handler below, which
    // re-resolves the mode. Anything else, or any failure, leaves the deny.
    "permission.ask": async (input, output) => {
      if (output?.status !== "deny" || input?.permission !== "bash") return;
      if (isUnattended || level() === "off") return;
      let resolved;
      try { resolved = await modeFor(input?.sessionID); } catch { return; }
      if (!isGodMode(resolved)) return;
      output.status = "ask";
      log(`soften(${resolved}/bash)`, (input?.patterns ?? []).join(" ; "));
    },
```

- [ ] **Step 6: Ask handler** -- replace ~1106-1121

```js
      if (permission === "bash" && currentMode === "god-delegated") {
        // No classifier and no level gate (god's answer), but the command is read so the
        // credential refusal below still applies to a delegated child.
        command = strip(p?.metadata?.command) || null;
      } else if (permission === "bash" && currentMode !== "god") {
        const lvl = level();
        if (lvl === "off" || lvl === "static") return;
        command = strip(p?.metadata?.command);
        if (!command) return;
        if (classifierDecides(currentMode)) {
          verdict = commandIsRead(command) ? "SAFE"
            : route.lanes.length ? await classifyCached(command, p.sessionID, route) : null;
        }
      }
```
(Keep the existing explanatory comments above the classifier call.) `shouldAutoApprove` already returns true for `god-delegated` (Task 2); the credential refusal at ~1149 now fires for it because `command` is set.

- [ ] **Step 7: Correct the header** (~42) -- replace the sentence that says the `permission.ask` hook never fires with: "On the stock 1.18.22 the `permission.ask` hook never fires. The fleet fork (FORK.md 3) fires it for one case only -- a request denied by an agent's catch-all bash rule -- and this plugin uses it to soften that deny to an ask in god and god-delegated." Update the matching phrases at ~968 and ~1006 the same way.

- [ ] **Step 8: Audit every other mode consumer**

Run: `rg -n 'currentMode\(|modeFor\(|=== "god"|!== "god"|mode === |mode !== ' plugin.js lib/*.js`
For each hit, decide whether `god-delegated` must be treated as god (bypass), as auto, or is irrelevant; change only where the spec's table says so, and list every hit with its decision in the commit report. `nativeCredentialGuardBlocks` (`mode !== "god"`) must keep blocking for `god-delegated` -- leave it.

- [ ] **Step 9: Run to verify, then the whole suite**

Run: `node --test tests/god-delegated.test.mjs && node --test tests/*.test.mjs`
Expected: PASS. `tests/launder.test.mjs` "a config deny rule holds in god mode" must still pass unchanged (its deny is the named `rm -rf /*`).

- [ ] **Step 10: Commit (worktree branch)**

```bash
git add plugin.js tests/god-delegated.test.mjs
git commit -m "Extend attended God mode to direct exec and write subagents"
```

---

### Task 4: Guard -- docs, version, release to main

**Files:**
- Modify: `docs/STATE.md`, `README.md`, `CHANGELOG.md`, `package.json`

- [ ] **Step 1: `docs/STATE.md`** -- after the resolution list (before "Tree rules G1, G2 and G4"), add:

```markdown
`god-delegated` (since 1.9.0) is a DERIVED result, never a mode-file value: step 2 returns it
instead of the G3 result when the process is attended, the session's immediate parent has its own
file reading `god`, and the session's agent declares `capability: exec` or `capability: write`.
It is god minus the control-file, reveal and credential checks. Consumers reading mode files
(opencode-peers) are unaffected: nothing new is written.
```

- [ ] **Step 2: `README.md`** -- in the modes section where god is described, add one paragraph: "A direct subagent whose seat declares `capability: exec` or `write` runs under `god-delegated` while its parent holds god: the floor and classifier stand aside, but control files, credentials, named deny rules and the tree rules still hold. Read-only seats, grandchildren and unattended runs are unchanged. With the fleet fork, a seat's catch-all deny (`tools: {\"*\": false}`) is softened to an ask that the guard approves once."

- [ ] **Step 3: `CHANGELOG.md` and `package.json`** -- under `## [Unreleased]` replace with:

```markdown
## [1.9.0] — 2026-10-12

### Added

- **God mode reaches direct exec and write subagents.** A child with no mode file of its own, whose immediate parent's own file reads `god`, in an attended process, whose agent declares `capability: exec` or `write`, resolves to the derived mode `god-delegated`: cc-safety-net, the launder floor and the classifier stand aside and its prompts are approved once. The control-file, reveal and credential checks, named config denies, the agent-launch ban and the tree rules still hold. Read-only seats, grandchildren, unattended runs and children whose agent cannot be identified keep the G3 result. Resolved per call, so a parent leaving god takes its children back to auto at once.
- The `permission.ask` hook: with the fleet opencode fork (FORK.md section 3), a request denied only by an agent's catch-all bash rule is softened to an ask in god and god-delegated. The config-deny copy skips such a catch-all deny in those modes and enforces every named deny as before.
```
and set `"version": "1.9.0"` in `package.json`.

- [ ] **Step 4: Full suite, merge, push**

```bash
cd /home/dev/opencode-guard-god-delegated
node --test tests/*.test.mjs
git add docs/STATE.md README.md CHANGELOG.md package.json
git commit -m "Release 1.9.0"
cd /home/dev/opencode-guard
git merge --ff-only feat/god-delegated
node --test tests/*.test.mjs
git push origin main
```
The live checkout now carries 1.9.0; running opencode processes keep the old guard until restarted (Task 5).

---

### Task 5: Build, install, verify

**Files:** none in either repo (install under `~/.local/lib/opencode-fork`).

- [ ] **Step 1: Check the deployed binary is still the effort-combined build**

```bash
sha256sum ~/.local/lib/opencode-fork/bin/opencode   # expect fff9e827904f3aea...
grep '"version"' ~/.local/lib/opencode-fork/package.json   # expect effort-combined-202610122257
cd /home/dev/projects/opencode && git --no-pager log -1 --format=%H fork/effort-combined   # expect 4998bf235...
```
If any differs, STOP: someone installed or advanced the deployment branch; rebase `fork/god-catchall-bridge` onto the new `fork/effort-combined` and rerun Task 1 Step 7.

- [ ] **Step 2: Check no DB migration is added, then build** (FORK.md procedure, channel unchanged)

```bash
cd /home/dev/projects/opencode-god-catchall-bridge
git --no-pager diff --stat 4998bf235 -- packages/core/src/database packages/opencode/migration   # expect empty
export PATH=~/.local/share/opencode-effort-toolchain/bun-1.4.2:$PATH
export OPENCODE_CHANNEL=fork/snip-always-prefix
export OPENCODE_VERSION=0.0.0-fork/god-catchall-bridge-$(date -u +%Y%m%d%H%M)
(cd packages/opencode && bun run script/build.ts --single --skip-install)
packages/opencode/dist/opencode-linux-x64/bin/opencode --version
packages/opencode/dist/opencode-linux-x64/bin/opencode db path   # expect the live opencode-fork-snip-always-prefix.db
```

- [ ] **Step 3: STOP -- Holden approves the install.** Report the version, sha256 and DB path. Install only on his yes:

```bash
D=~/.local/lib/opencode-fork; N=packages/opencode/dist/opencode-linux-x64; V=god-catchall-bridge-<stamp>
cp $N/bin/opencode $D/bin/opencode.$V && cp $N/package.json $D/package.json.$V
cp $D/bin/opencode.$V $D/bin/opencode.new && mv -f $D/bin/opencode.new $D/bin/opencode
cp $D/package.json.$V $D/package.json.new && mv -f $D/package.json.new $D/package.json
```
Rollback: the same two `cp`/`mv` pairs from `opencode.effort-combined-202610122257` and `package.json.effort-combined-202610122257` (both already beside it). Then push `fork/god-catchall-bridge` (pre-push hook needs the pinned bun on PATH), and append a deployment line to FORK.md's "Deployed on code" bullet in a follow-up commit.

- [ ] **Step 4: Holden restarts opencode** (every TUI pane; running processes keep the old inode and old guard).

- [ ] **Step 5: Verification matrix** (from a fresh God root in `/home/dev/projects/depot`, then the same from an auto root)

| Dispatch | God root expects | Auto root expects |
|---|---|---|
| `tester`: run exactly `./check-gates.sh` | runs to its verdict line | `deny(config)` as today |
| `sp-implementer`: `git stash list` then `git stash drop` of a throwaway stash it creates | runs | refused by the floor as today |
| `scout` (`INTENT: read`): `./check-gates.sh` | refused (tool or deny) | refused |

Read `~/.local/share/opencode/autoclass.log` for `soften(god-delegated/bash)`, `allow(god-delegated)` and `allow(god-delegated/bash)` lines for the God run, and their absence for the auto run.

## Self-review

- Spec coverage: derived mode and eligibility (T2 helper, T3 modeFor); check table (T3 Step 4); config-deny catch-all skip (T2, T3); fork bridge contract (T1); hook softening + ask re-resolve (T3 Steps 5-6); STATE/README/CHANGELOG/version (T4); build from deployed base, rollback, restart, matrix (T5); tester.md comment correction -- **deferred**: devbox `config/opencode/agent/tester.md` was last committed by another session (games), so the comment ("parent God mode is not a blanket child grant") is corrected after Task 5 verifies, with that session told first.
- Spec deviation, deliberate: the spec said the child's agent comes from the creating `task` part; the plan uses `chat.params` (opencode names the agent on every turn) with the session record as fallback. Both are the server's own statement of the agent; `chat.params` needs no history paging. A child whose agent is not yet known resolves to G3 (fail-closed), never god-delegated.
- Spec deviation, deliberate: the fork base is `fork/effort-combined` `4998bf235`, not `2b7eb922f` -- the deployed binary changed at 23:00 on 2026-10-12. `permission/`, `session/tools.ts`, `plugin/` are byte-identical between the two.
- Placeholders: none. Type names: `catchAllDenied`, `softenCatchAll`, `nativeBashMatch`, `isGodMode`, `delegatedGodEligible`, `GOD_MODES` used consistently.
