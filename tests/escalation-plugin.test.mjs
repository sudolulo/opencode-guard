// The 2026-10-14 god escalation policy wired through the REAL plugin
// (docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md, sections 4, 5.2, 8).
// Each case runs the plugin in an inline Node subprocess with a throwaway HOME: a fake
// legacy client, a fake embedded v2 transport (capabilities, root reads, the native
// pending list, promotion and wake), and a fake classifier endpoint on globalThis.fetch.
// No OpenCode process, provider, model, network request or agent launch is involved.
// The native side of the contract (hidden tools stay unavailable, Always never lifts a
// deny, every deferrable tool asks) is NOT proven here: those are native tests.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAuthorityBroker } from "../lib/authority.js";
import { createRootLifecycle } from "../lib/lifecycle.js";

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
  // A child whose own rules allow nothing unprompted: only the ROOT's rules make sed launder.
  { name: "tight", permission: [
    { permission: "bash", pattern: "*", action: "ask" },
  ] },
  { name: "lockdown", permission: [
    { permission: "bash", pattern: "*", action: "deny" },
  ] },
  // Root-policy round: a child whose own rules allow every command, so only the ROOT's rules
  // can deny it; a root whose catch-all deny is overridden by a later named allow; and a root
  // with named denies cc-safety-net does not know (./deploy.sh) or does (mkfs).
  { name: "open", permission: [
    { permission: "bash", pattern: "*", action: "allow" },
  ] },
  { name: "rootwild", permission: [
    { permission: "bash", pattern: "*", action: "deny" },
    { permission: "bash", pattern: "go test *", action: "allow" },
  ] },
  { name: "deployer", permission: [
    { permission: "bash", pattern: "*", action: "ask" },
    { permission: "bash", pattern: "./deploy.sh*", action: "deny" },
    { permission: "bash", pattern: "mkfs*", action: "deny" },
  ] },
];

// The global opencode.json the guard reads at import (fallback when an agent is unknown).
const GLOBAL_CONFIG = { permission: { bash: { "*": "ask", "cat *": "allow", "git push --force*": "deny", "mkfs*": "deny" } } };

const escalationPlugin = (steps, {
  rootMode = "god", childMode, capability = 2, incarnations = true, unattended = false, level,
  classifier = "SAFE", agents = DEFAULT_AGENTS, rootAgent = "build", childAgent = "seat", profile,
  globalConfig = GLOBAL_CONFIG, agentFiles = {}, directory, statuses, netError = false, transport: hasTransport = true,
  globalMode, beforeAsk = false,
} = {}) => {
  const home = mkdtempSync(join(tmpdir(), "guard-escalation-plugin-"));
  try {
    // netError: a TEST-ONLY module substitution (Node loader resolve hook) that hands the
    // plugin a cc-safety-net whose checkCommand throws, so the real plugin's net-error floor
    // runs. The real safetyNetVerdict is re-exported unchanged; production code has no flag.
    let netPrelude = "";
    if (netError) {
      const realNet = new URL("../lib/safety-net.js", import.meta.url).href;
      writeFileSync(join(home, "safety-net-mock.mjs"),
        `export { safetyNetVerdict, HOST_SAFETY_NET } from ${JSON.stringify(realNet)};\n` +
        "export const loadSafetyNet = async () => ({ source: \"test-mock\", error: null, checkCommand: () => {\n" +
        "  globalThis.__netCalls = (globalThis.__netCalls ?? 0) + 1;\n" +
        "  throw new Error(\"analyzer crashed on this input\");\n" +
        "} });\n");
      const mockUrl = new URL(`file://${join(home, "safety-net-mock.mjs")}`).href;
      writeFileSync(join(home, "net-hooks.mjs"),
        "export async function resolve(specifier, context, next) {\n" +
        `  if (specifier === "./lib/safety-net.js" && String(context.parentURL).endsWith("/plugin.js")) return { url: ${JSON.stringify(mockUrl)}, shortCircuit: true };\n` +
        "  return next(specifier, context);\n" +
        "}\n");
      netPrelude = `import { register } from "node:module"; register(${JSON.stringify(new URL(`file://${join(home, "net-hooks.mjs")}`).href)});`;
    }
    mkdirSync(join(home, ".config/opencode/agent"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    mkdirSync(join(home, "work"), { recursive: true });
    writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify(globalConfig));
    writeFileSync(join(home, ".config/opencode/classifier.json"), JSON.stringify({ url: "http://classifier.invalid/v1/chat/completions" }));
    if (rootMode) writeFileSync(join(home, ".local/share/opencode/modes/ses_root"), `${rootMode}\n`);
    if (childMode) writeFileSync(join(home, ".local/share/opencode/modes/ses_child"), `${childMode}\n`);
    if (level) writeFileSync(join(home, ".config/opencode/autoclass"), `${level}\n`);
    if (globalMode) writeFileSync(join(home, ".config/opencode/mode"), `${globalMode}\n`);
    for (const [name, text] of Object.entries(agentFiles)) writeFileSync(join(home, ".config/opencode/agent", `${name}.md`), text);
    if (profile) {
      const profiles = join(home, ".local/share/opencode/model-routing/profiles");
      mkdirSync(profiles, { recursive: true });
      for (const id of ["ses_root", "ses_child"]) writeFileSync(join(profiles, `${id}.json`), JSON.stringify({ profile, explicit: true }));
    }
    const sub = (value) => JSON.stringify(value).replaceAll("__HOME__", home);
    const script = `
      ${netPrelude}
      import fs from "node:fs";
      import { join } from "node:path";
      const HOME = process.env.HOME;
      // during: one-shot actions fired INSIDE a host call ("agents" = client.app.agents,
      // "classify" = the classifier endpoint, "rootGet" = the v2 root-session read), after
      // skipping "skip" matching calls. Each applies a root replacement, a mode file write
      // or an event before that call answers.
      const during = [];
      let agentsCalls = 0;
      const fire = async (at) => {
        const index = during.findIndex((entry) => entry.at === at);
        if (index < 0) return;
        const entry = during[index];
        if (entry.skip) { entry.skip -= 1; return; }
        during.splice(index, 1);
        if (entry.root) rootIncarnation = entry.root;
        if (entry.mode) fs.writeFileSync(join(HOME, ".local/share/opencode/modes", entry.mode.session), entry.mode.mode + "\\n");
        if (entry.event) await hooks.event({ event: entry.event });
      };
      const steps = ${sub(steps)};
      const agents = ${JSON.stringify(agents)};
      const capability = ${JSON.stringify(capability)};
      const incarnations = ${JSON.stringify(incarnations)};
      const beforeAsk = ${JSON.stringify(beforeAsk)};
      let statuses = ${JSON.stringify(statuses ?? { ses_root: { type: "busy" }, ses_child: { type: "busy" } })};
      let classifier = ${JSON.stringify(classifier)};
      let capabilitiesBroken = false, rootGetFails = false, rootIncarnation = "inc_1";
      let duringClassify, hooks;
      const realNow = Date.now;
      let skew = 0;
      Date.now = () => realNow() + skew;
      const calls = [], replies = [], classified = [], appLogs = [], pending = [];
      const parents = { ses_root: null, ses_child: "ses_root", ses_sib: "ses_root", ses_other: null };
      // The native request each ask step built, by step index: an asked event with fromAsk
      // carries the same patterns native would.
      const askRequests = {};
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      const transport = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        calls.push({ method: request.method, path, body: await request.clone().text() });
        if (path === "/experimental/capabilities") {
          if (capabilitiesBroken || capability === "http") return json({ name: "Unavailable", ...(typeof capabilitiesBroken === "string" ? { message: capabilitiesBroken } : {}) }, 503);
          if (capability === "malformed") return json(null);
          if (capability === 2) return json({ permissionAuthority: 2, backgroundSubagents: true, ...(incarnations ? { sessionIncarnation: 1 } : {}), ...(beforeAsk ? { beforeAsk: 1 } : {}) });
          return json({ permissionAuthority: capability, backgroundSubagents: true });
        }
        if (path === "/permission") return json(pending);
        if (path === "/api/session/ses_root") {
          await fire("rootGet");
          if (rootGetFails) return json({ name: "Unavailable" }, 503);
          // The real host wraps /api/session/{id} in an envelope: { data: Session }.
          return json({ data: { id: "ses_root", ...(incarnations ? { incarnationID: rootIncarnation } : {}) } });
        }
        if (path === "/api/session/ses_child") return json({ data: { id: "ses_child", parentID: "ses_root", agent: "seat" } });
        if (path === "/session/ses_root/message") return json([{ info: { role: "user", agent: "build", model: { providerID: "openai", modelID: "gpt" } } }]);
        return json({});
      };
      // The classifier endpoint (direct lane from classifier.json). Separate from the
      // embedded transport above, which the v2 authority client uses.
      globalThis.fetch = async (url, init) => {
        classified.push(JSON.parse(init.body).messages[1].content);
        if (duringClassify) { const event = duringClassify; duringClassify = undefined; await hooks.event({ event }); }
        await fire("classify");
        if (classifier === "UNAVAILABLE") return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: classifier } }] }) };
      };
      const client = {
        session: {
          ...(${JSON.stringify(hasTransport)} ? { _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch: transport, headers: new Headers() }) } } : {}),
          get: async ({ path }) => Object.hasOwn(parents, path.id)
            ? { data: { id: path.id, ...(parents[path.id] ? { parentID: parents[path.id] } : {}) }, response: { status: 200 } }
            : { error: { name: "NotFoundError" }, response: { status: 404 } },
          status: async () => ({ data: statuses }),
        },
        app: {
          log: async (entry) => { appLogs.push(entry?.body ?? entry); },
          agents: async () => { agentsCalls += 1; await fire("agents"); return { data: agents }; },
        },
        postSessionIdPermissionsPermissionId: async ({ path, body }) => { replies.push({ id: path.permissionID, response: body.response }); return {}; },
      };
      const { OpencodeGuard } = await import(${JSON.stringify(new URL("../plugin.js", import.meta.url).href)});
      hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(directory ?? join(home, "work"))} });
      if (${JSON.stringify(rootAgent)}) await hooks["chat.params"]({ sessionID: "ses_root", agent: ${JSON.stringify(rootAgent)} }, {});
      if (${JSON.stringify(childAgent)}) await hooks["chat.params"]({ sessionID: "ses_child", agent: ${JSON.stringify(childAgent)} }, {});
      const results = [];
      for (const step of steps) {
        if (step.before) {
          const { session, tool, callID, args } = step.before;
          try {
            const output = { args };
            await hooks["tool.execute.before"]({ tool, sessionID: session, ...(callID === undefined ? {} : { callID }) }, output);
            results.push(output.ask === undefined ? { threw: null } : { threw: null, ask: output.ask });
          } catch (error) { results.push({ threw: String(error?.message ?? error) }); }
        } else if (step.ask) {
          const { session, callID, permission, status, command, patterns, wrap, preset } = step.ask;
          const request = {
            sessionID: session, permission, patterns: patterns ?? (command ? [command] : []), always: [],
            metadata: command ? { command } : {},
            ...(callID === undefined ? {} : { tool: { messageID: "m", callID } }),
          };
          const output = { status, ...(preset ?? {}) };
          askRequests[results.length] = request;
          try {
            await hooks["permission.ask"](wrap ? { req: request } : request, output);
            results.push(output);
          } catch (error) { results.push({ threw: String(error?.message ?? error), output }); }
        } else if (step.asked) {
          const { id, session, callID, permission, kind, command, fromAsk, pending: listed, patterns } = step.asked;
          const approval = fromAsk !== undefined ? results[fromAsk].approval : kind ? { kind, sessionID: "ses_root" } : undefined;
          const properties = {
            id, sessionID: session, permission,
            patterns: patterns ?? (fromAsk !== undefined && askRequests[fromAsk] ? askRequests[fromAsk].patterns : command ? [command] : []), always: [],
            metadata: command ? { command } : {}, tool: { messageID: "m", callID },
            ...(approval ? { approval } : {}),
          };
          if (listed) pending.splice(0, pending.length, properties);
          await hooks.event({ event: { type: "permission.asked", properties } });
          results.push({ approval: properties.approval ?? null });
        } else if (step.after) {
          const { session, tool, callID, failed } = step.after;
          const output = { output: "" };
          await hooks["tool.execute.after"]({ tool, sessionID: session, callID, ...(failed ? { failed: true } : {}) }, output);
          results.push(output);
        } else if (step.task) {
          const output = { output: "child answer" };
          await hooks["tool.execute.after"]({ tool: "task", sessionID: step.task, callID: "task_1" }, output);
          results.push(output);
        } else {
          if (step.breakCapabilities) capabilitiesBroken = step.breakCapabilities;
          if (step.rootGetFails !== undefined) rootGetFails = step.rootGetFails;
          if (step.root) rootIncarnation = step.root;
          if (step.classifier) classifier = step.classifier;
          if (step.statuses) statuses = step.statuses;
          if (step.advance) skew += step.advance;
          if (step.duringClassify) duringClassify = step.duringClassify;
          if (step.during) during.push({ ...step.during });
          if (step.level) fs.writeFileSync(join(HOME, ".config/opencode/autoclass"), step.level + "\\n");
          if (step.mode) fs.writeFileSync(join(HOME, ".local/share/opencode/modes", step.mode.session), step.mode.mode + "\\n");
          if (step.event) await hooks.event({ event: step.event });
          if (step.chat) await hooks["chat.params"]({ sessionID: step.chat.session, agent: step.chat.agent }, {});
          results.push({});
        }
      }
      console.log(JSON.stringify({ results, replies, classified, appLogs, agentsCalls, netCalls: globalThis.__netCalls ?? 0, calls: calls.map(({ method, path, body }) => ({ method, path, body })) }));
    `;
    const argv = ["--input-type=module", "-e", script, ...(unattended ? ["--", "--auto"] : [])];
    const child = spawnSync(process.execPath, argv, {
      // An inline fake-client Node host, not an OpenCode or agent launch.
      env: { ...process.env, HOME: home, OPENCODE: "", OPENCODE_PID: "", OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "", XDG_CONFIG_HOME: "" },
      encoding: "utf8", timeout: 30_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const out = JSON.parse(child.stdout.trim().split("\n").at(-1));
    let log = "";
    try { log = readFileSync(join(home, ".local/share/opencode/autoclass.log"), "utf8"); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return { ...out, log, home };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

const bashBefore = (session, callID, command) => ({ before: { session, tool: "bash", callID, args: { command } } });
const bashAsk = (session, callID, command, status) => ({ ask: { session, callID, permission: "bash", status, command, patterns: [command] } });
const assertParent = (output, reasonPattern, label) => {
  assert.deepEqual(Object.keys(output).sort(), ["always", "approval", "forceAsk", "status"], label);
  assert.equal(output.status, "ask", label);
  assert.equal(output.approval.kind, "parent", label);
  assert.equal(output.approval.sessionID, "ses_root", label);
  assert.equal(output.forceAsk, true, label);
  assert.deepEqual(output.always, [], label);
  assert.equal(output.override, undefined, label);
  assert.match(output.approval.reason, reasonPattern, label);
};
const promotions = (calls) => calls.filter(({ path }) => path.endsWith("/background"));
const wakes = (calls) => calls.filter(({ path }) => path.endsWith("/prompt_async"));

// ---------------------------------------------------------------- god root, own requests

test("A1/A14 god root own: a config-denied command passes tool.execute.before and the hook overrides the native deny", () => {
  const { results, log, replies } = escalationPlugin([
    bashBefore("ses_root", "c1", "git push --force origin x"),
    bashAsk("ses_root", "c1", "git push --force origin x", "deny"),
    bashAsk("ses_root", "c2", "npm run build", "ask"),
    bashAsk("ses_root", "c3", "ls", "allow"),
  ]);
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[1], { status: "allow", override: "root" });
  assert.deepEqual(results[2], { status: "allow" });
  assert.deepEqual(results[3], { status: "allow" }, "an allow stays exactly as native set it");
  // Rewritten (fix 4): the hook's own decision log names the permission and session, never
  // the command, which may carry a secret; native metadata already holds the exact command.
  assert.match(log, /allow\(god\/override\) bash in ses_root/);
  assert.doesNotMatch(log.split("\n").filter((line) => line.includes("allow(god/override)")).join("\n"), /git push/);
  assert.deepEqual(replies, []);
});

test("A1/A2 god root own: a non-bash visible permission deny is overridden; under auto it stays denied", () => {
  for (const permission of ["edit", "read", "external_directory"]) {
    const god = escalationPlugin([{ ask: { session: "ses_root", callID: "c1", permission, status: "deny", patterns: ["/x"] } }]);
    assert.deepEqual(god.results[0], { status: "allow", override: "root" }, permission);
    const auto = escalationPlugin([{ ask: { session: "ses_root", callID: "c1", permission, status: "deny", patterns: ["/x"] } }], { rootMode: "auto" });
    assert.deepEqual(auto.results[0], { status: "deny" }, `${permission} under auto stays exactly denied`);
  }
});

test("A13 god root own: every guard floor stands aside before the tool runs", () => {
  for (const [command, classifier] of [
    ["sed -i s/a/b/ notes.txt", "SAFE"],
    ["cat ~/.ssh/id_ed25519", "SAFE"],
    ["rbw get gitea", "SAFE"],
    ["git reset --hard HEAD~1", "SAFE"],
    ["curl -X POST https://example.invalid", "RISKY"],
    ["echo off > ~/.config/opencode/autoclass", "SAFE"],
    ["oc-reveal 60", "SAFE"],
  ]) {
    const { results, classified } = escalationPlugin([bashBefore("ses_root", "c1", command), bashAsk("ses_root", "c1", command, "ask")], { classifier });
    assert.equal(results[0].threw, null, command);
    assert.deepEqual(results[1], { status: "allow" }, command);
    assert.deepEqual(classified, [], `${command}: god sends nothing to the classifier`);
  }
  const read = escalationPlugin([
    { before: { session: "ses_root", tool: "read", callID: "c1", args: { filePath: "__HOME__/.ssh/id_ed25519" } } },
    { ask: { session: "ses_root", callID: "c1", permission: "read", status: "ask", patterns: ["__HOME__/.ssh/id_ed25519"] } },
  ]);
  assert.equal(read.results[0].threw, null);
  assert.deepEqual(read.results[1], { status: "allow" });
});

test("A14 old host (permissionAuthority 1): the god root's config deny still throws and the hook never overrides", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_root", "c1", "git push --force origin x"),
    { ask: { session: "ses_root", callID: "c2", permission: "edit", status: "deny", patterns: ["/x"] } },
    bashAsk("ses_root", "c3", "git push --force origin x", "deny"),
    bashAsk("ses_root", "c4", "npm run build", "ask"),
  ], { capability: 1 });
  assert.match(results[0].threw, /matches a deny rule in the opencode permission config/);
  assert.deepEqual(results[1], { status: "deny" }, "no override on an old host");
  assert.match(results[2].threw, /does not advertise permissionAuthority: 2/, "a configured hard deny is not the root's ordinary ask");
  assert.deepEqual(results[3], { status: "ask" }, "old-host god root ordinary ask: output untouched");
});

// ---------------------------------------------------------------- god descendants

// Rewritten (fix 4): a deferred floor's approval.reason is its class plus a generic
// description, never the command (native request metadata already carries the exact command).
const GOD_CHILD_FLOORS = [
  // [label, command, native status, reason pattern, options]
  ["launder (child rules)", "sed -i s/a/b/ notes.txt", "allow", /^launder: deferred bash floor$/, {}],
  ["launder (root rules only)", "sed -i s/a/b/ notes.txt", "ask", /^launder: deferred bash floor$/, { childAgent: "tight" }],
  // mcp-auth.json is a hard credential cc-safety-net does not know, so the guard's own
  // credential tier (not the net) is what refuses it; ~/.ssh is refused by the net first.
  ["hard credential", "cat mcp-auth.json", "allow", /^credential: deferred bash floor$/, {}],
  ["cc-safety-net sensitive path", "cat ~/.ssh/id_ed25519", "allow", /^net: deferred bash floor$/, {}],
  ["promptable credential", "rbw get gitea", "deny", /^credential-promptable: deferred bash floor$/, {}],
  ["cc-safety-net", "git reset --hard HEAD~1", "deny", /^net: deferred bash floor$/, {}],
  // Renamed (fix 5): a nonexistent cwd is a cc-safety-net DENY verdict (class net), not an
  // analyzer failure. The real net-error path is pinned below with a throwing analyzer.
  ["cc-safety-net denial in a nonexistent cwd (net, not net-error)", "ls -la", "deny", /^net: deferred bash floor$/, { directory: "/nonexistent-guard-dir" }],
  ["classifier RISKY", "curl -X POST https://example.invalid", "deny", /^llm: deferred bash floor$/, { classifier: "RISKY" }],
  ["classifier unavailable", "curl -X POST https://example.invalid", "deny", /^classifier-unavailable: deferred bash floor$/, { classifier: "UNAVAILABLE" }],
  ["no classifier lane", "curl -X POST https://example.invalid", "deny", /^no-classifier: deferred bash floor$/, { profile: "local" }],
];

for (const [label, command, status, reason, options] of GOD_CHILD_FLOORS) {
  test(`A13/A5 god descendant: ${label} is stashed and becomes an exact parent ask, never a throw`, () => {
    const { results, replies, log } = escalationPlugin([bashBefore("ses_child", "c1", command), bashAsk("ses_child", "c1", command, status)], options);
    assert.equal(results[0].threw, null, label);
    assertParent(results[1], reason, label);
    assert.deepEqual(replies, []);
    assert.match(log, /stash\(parent\//);
  });
}

test("A13 god descendant: native read, glob and grep credential floors are stashed for their own permission", () => {
  for (const [tool, args, permission] of [
    ["read", { filePath: "__HOME__/.ssh/id_ed25519" }, "read"],
    ["glob", { path: "__HOME__", pattern: "**/*" }, "glob"],
    ["grep", { path: "__HOME__/.ssh", pattern: "BEGIN" }, "grep"],
  ]) {
    const { results } = escalationPlugin([
      { before: { session: "ses_child", tool, callID: "c1", args } },
      { ask: { session: "ses_child", callID: "c1", permission, status: "allow", patterns: ["x"] } },
    ]);
    assert.equal(results[0].threw, null, tool);
    assertParent(results[1], new RegExp(`^credential: deferred ${permission} floor$`), tool);
  }
});

test("A4 god descendant: native seat, role, ceiling, named and non-bash denies become exact parent asks, never human or operator", () => {
  const { results, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    bashBefore("ses_child", "c2", "git push --force origin x"),
    bashAsk("ses_child", "c2", "git push --force origin x", "deny"),
    { before: { session: "ses_child", tool: "edit", callID: "c3", args: { filePath: "__HOME__/work/notes.txt" } } },
    { ask: { session: "ses_child", callID: "c3", permission: "edit", status: "deny", patterns: ["notes.txt"] } },
    { ask: { session: "ses_child", callID: "c4", permission: "external_directory", status: "deny", patterns: ["/etc/*"] } },
    { ask: { session: "ses_child", callID: "c5", permission: "read", status: "ask", patterns: ["notes.txt"] } },
    { ask: { session: "ses_child", callID: "c6", permission: "bash", status: "allow", patterns: [] } },
  ]);
  for (const i of [0, 2, 4]) assert.equal(results[i].threw, null, `step ${i}`);
  assertParent(results[1], /native deny: bash/, "seat allowlist miss");
  // cc-safety-net refuses a force push before native does; either way the root model decides.
  assertParent(results[3], /^(net: deferred bash floor|native deny: bash)$/, "global named rule");
  assertParent(results[5], /native deny: edit/, "role deny on edit");
  assertParent(results[6], /native deny: external_directory/, "session ceiling");
  // A plain native ASK that an auto root's descendant would get unasked is allowed here (see
  // "god descendant native asks"); every DENY above still reaches the root model.
  assert.equal(results[7].status, "allow", "native ask: read, judged as auto");
  assert.equal(results[7].approval, undefined);
  assert.deepEqual(results[8], { status: "allow" }, "an unflagged zero-pattern allow is left alone");
  assert.deepEqual(replies, []);
});

// 2026-10-20: 2,674 god-descendant asks in 3 days cost the god roots 673 turns and 5.3 h of
// guard_decide, with children blocked on the root 44% of active wall time. A plain native ASK is
// now answered with auto's own judgment; only what that judgment refuses or cannot decide, and
// every deny and floor, still goes to the root model.
// Steps with names, so config-only steps (which also yield a result) never shift an index.
const named = (entries) => ({ steps: entries.map(([, step]) => step), at: Object.fromEntries(entries.map(([name], index) => [name, index])) });

test("god descendant native asks: auto's own judgment answers, anything it would not allow still goes to the root model", () => {
  const { steps, at } = named([
    ["eBefore", { before: { session: "ses_child", tool: "edit", callID: "e1", args: { filePath: "__HOME__/work/notes.txt" } } }],
    ["edit", { ask: { session: "ses_child", callID: "e1", permission: "edit", status: "ask", patterns: ["notes.txt"] } }],
    ["external", { ask: { session: "ses_child", callID: "x1", permission: "external_directory", status: "ask", patterns: ["/srv/data/*"] } }],
    ["unavailable1", { classifier: "UNAVAILABLE" }],
    ["lsBefore", bashBefore("ses_child", "b1", "ls -la src")],
    ["readList", bashAsk("ses_child", "b1", "ls -la src", "ask")],
    ["safe", { classifier: "SAFE" }],
    ["testBefore", bashBefore("ses_child", "b2", "go test ./...")],
    ["classifierSafe", bashAsk("ses_child", "b2", "go test ./...", "ask")],
    ["risky", { classifier: "RISKY" }],
    ["deployBefore", bashBefore("ses_child", "b3", "make deploy-prod")],
    ["classifierRisky", bashAsk("ses_child", "b3", "make deploy-prod", "ask")],
    ["unavailable2", { classifier: "UNAVAILABLE" }],
    ["buildBefore", bashBefore("ses_child", "b4", "npm run build")],
    ["classifierDown", bashAsk("ses_child", "b4", "npm run build", "ask")],
    ["question", { ask: { session: "ses_child", callID: "q1", permission: "question", status: "ask", patterns: ["*"] } }],
  ]);
  const { results, replies } = escalationPlugin(steps);
  for (const name of ["edit", "external", "readList", "classifierSafe"]) {
    assert.equal(results[at[name]].status, "allow", name);
    assert.equal(results[at[name]].approval, undefined, `${name}: no escalation`);
    assert.equal(results[at[name]].forceAsk, undefined, `${name}: not forced`);
  }
  // RISKY may already be stopped by the classifier floor in the before-hook; either way the root
  // model decides, never this rule.
  assertParent(results[at.classifierRisky], /^(native ask: bash|.*classifier.*|llm.*)$/i, "classifier RISKY");
  assertParent(results[at.classifierDown], /^(native ask: bash|.*classifier.*|llm.*)$/i, "classifier unavailable");
  assertParent(results[at.question], /native ask: question/, "a question is never auto-answered");
  assert.deepEqual(replies, [], "decided in the permission hook, never by a legacy reply");
});

test("god descendant native asks: static level and floors still escalate; an auto root is unchanged", () => {
  const { steps, at } = named([
    ["static", { level: "static" }],
    ["vetBefore", bashBefore("ses_child", "s1", "go vet ./...")],
    ["staticAsk", bashAsk("ses_child", "s1", "go vet ./...", "ask")],
    ["on", { level: "on" }],
    ["sedBefore", bashBefore("ses_child", "s2", "sed -i s/a/b/ notes.txt")],
    ["launder", bashAsk("ses_child", "s2", "sed -i s/a/b/ notes.txt", "ask")],
  ]);
  const god = escalationPlugin(steps);
  assertParent(god.results[at.staticAsk], /native ask: bash/, "level static: no verdict for an unlisted command");
  assertParent(god.results[at.launder], /^launder: /, "a deferred floor keeps its own escalation");
  const auto = escalationPlugin([
    bashBefore("ses_child", "a1", "go test ./..."),
    bashAsk("ses_child", "a1", "go test ./...", "ask"),
  ], { rootMode: "auto" });
  assert.notEqual(auto.results[1].status, "allow", "the auto path is not touched by this rule");
});

test("A5/A8 god descendant: a zero-pattern request consumes its own stash and becomes a parent ask", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { ask: { session: "ses_child", callID: "c1", permission: "bash", status: "allow", patterns: [] } },
  ]);
  assertParent(results[1], /^launder: /, "zero patterns");
});

test("god descendant parent ask carries the exact native request through the existing broker: promotion and wake", () => {
  const { results, calls, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_exact_1", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1, pending: true } },
  ]);
  assert.deepEqual(results[2].approval, { kind: "parent", sessionID: "ses_root", reason: "native deny: bash" });
  assert.equal(promotions(calls).length, 1, JSON.stringify(calls));
  assert.equal(promotions(calls)[0].path, "/experimental/session/ses_root/background");
  assert.equal(wakes(calls).length, 1);
  assert.equal(wakes(calls)[0].path, "/session/ses_root/prompt_async");
  assert.match(wakes(calls)[0].body, /per_exact_1/);
  assert.deepEqual(replies, [], "a parent ask is never answered by the legacy handler");
  assert.equal(calls.some(({ path }) => path.includes("/permission/") && path.endsWith("/reply")), false, "no native reply either");
});

test("A22 god descendant: control-file and reveal-arm become parent asks; auto descendant still throws", () => {
  const god = escalationPlugin([
    { before: { session: "ses_child", tool: "write", callID: "c1", args: { filePath: "__HOME__/.config/opencode/autoclass", content: "off" } } },
    { ask: { session: "ses_child", callID: "c1", permission: "edit", status: "allow", patterns: ["__HOME__/.config/opencode/autoclass"] } },
    bashBefore("ses_child", "c2", "echo off > ~/.config/opencode/autoclass"),
    bashAsk("ses_child", "c2", "echo off > ~/.config/opencode/autoclass", "deny"),
    bashBefore("ses_child", "c3", "oc-reveal 60"),
    bashAsk("ses_child", "c3", "oc-reveal 60", "deny"),
  ]);
  for (const i of [0, 2, 4]) assert.equal(god.results[i].threw, null, `step ${i}`);
  assertParent(god.results[1], /^control-file: deferred edit floor$/, "native write");
  assertParent(god.results[3], /^control-file: deferred bash floor$/, "shell write");
  assertParent(god.results[5], /^reveal-arm: deferred bash floor$/, "reveal arm");
  const auto = escalationPlugin([
    { before: { session: "ses_child", tool: "write", callID: "c1", args: { filePath: "__HOME__/.config/opencode/autoclass", content: "off" } } },
    bashBefore("ses_child", "c2", "echo off > ~/.config/opencode/autoclass"),
    bashBefore("ses_child", "c3", "oc-reveal 60"),
  ], { rootMode: "auto" });
  assert.match(auto.results[0].threw, /changes one of the guard's own switches/);
  assert.match(auto.results[1].threw, /changes one of the guard's own switches/);
  assert.match(auto.results[2].threw, /reveal window is armed by a person/);
});

test("A22 unchanged gates still throw for a god descendant: launch guard, stale turn, read-intent dispatch, tree", () => {
  const { results, log } = escalationPlugin([
    bashBefore("ses_child", "c1", "opencode run hi"),
    { before: { session: "ses_child", tool: "task", callID: "c2", args: { subagent_type: "scout", prompt: "fix the bug" } } },
    { before: { session: "ses_child", tool: "task", callID: "c3", args: { subagent_type: "build", prompt: "x", background: true } } },
    { statuses: { ses_root: { type: "busy" }, ses_child: { type: "idle" } } },
    bashBefore("ses_child", "c4", "ls"),
  ], { agentFiles: { scout: "---\ncapability: read\n---\n" } });
  assert.match(results[0].threw, /Refused route/);
  assert.match(results[1].threw, /read-only \(capability: read\)/);
  assert.match(results[2].threw, /G2/);
  assert.match(results[4].threw, /turn was cancelled or has already ended/);
  assert.doesNotMatch(log, /stash\(/, "no gate is ever turned into an escalation");
});

test("older host (no beforeAsk): a god descendant's process tool keeps the legacy throwing floor", () => {
  const { results } = escalationPlugin([
    { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "cat mcp-auth.json" } } },
    { before: { session: "ses_child", tool: "bg_run", callID: "c2", args: { command: "git push --force origin x" } } },
  ]);
  assert.match(results[0].threw, /names a credential store/);
  assert.match(results[1].threw, /matches a deny rule in the opencode permission config/);
  // A child whose rules do not deny the command meets the classifier, and is refused.
  const tight = escalationPlugin([
    { before: { session: "ses_child", tool: "pty_spawn", callID: "c3", args: { command: "curl", args: ["-X", "POST", "https://example.invalid"] } } },
  ], { classifier: "RISKY", childAgent: "tight" });
  assert.match(tight.results[0].threw, /looks risky/);
});

// Gap 2 closed (beforeAsk host): bg_run and pty_spawn ask natively through output.ask, so their
// refusals route exactly like bash instead of throwing.
const askFor = (command, tool) => ({ permission: "bash", patterns: [command], metadata: { command, tool } });

test("beforeAsk host: a god descendant's bg_run / pty_spawn floors become parent asks on their own native ask", () => {
  const { results, replies } = escalationPlugin([
    { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "cat mcp-auth.json" } } },
    bashAsk("ses_child", "c1", "cat mcp-auth.json", "allow"),
    { before: { session: "ses_child", tool: "bg_run", callID: "c2", args: { command: "git push --force origin x" } } },
    bashAsk("ses_child", "c2", "git push --force origin x", "deny"),
    { before: { session: "ses_child", tool: "pty_spawn", callID: "c3", args: { command: "curl", args: ["-X", "POST", "https://example.invalid"] } } },
    bashAsk("ses_child", "c3", "curl -X POST https://example.invalid", "allow"),
  ], { beforeAsk: true, classifier: "RISKY", childAgent: "tight" });
  for (const i of [0, 2, 4]) assert.equal(results[i].threw, null, `step ${i} does not throw`);
  assert.deepEqual(results[0].ask, askFor("cat mcp-auth.json", "bg_run"));
  assert.deepEqual(results[4].ask, askFor("curl -X POST https://example.invalid", "pty_spawn"));
  assertParent(results[1], /deferred bash floor$/, "credential floor -> parent");
  assertParent(results[3], /native deny: bash|deferred bash floor$/, "named deny -> parent");
  assertParent(results[5], /deferred bash floor$/, "classifier RISKY -> parent");
  assert.deepEqual(replies, []);
});

test("beforeAsk host: a clean god-descendant bg_run still asks, so its hook validates the call", () => {
  const { results } = escalationPlugin([
    { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "go test ./..." } } },
  ], { beforeAsk: true });
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[0].ask, askFor("go test ./...", "bg_run"));
});

test("beforeAsk host: an auto descendant's bg_run named ROOT deny goes to the human once", () => {
  const { results } = escalationPlugin([
    { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "git push --force origin x" } } },
    bashAsk("ses_child", "c1", "git push --force origin x", "deny"),
  ], { rootMode: "auto", beforeAsk: true });
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[0].ask, askFor("git push --force origin x", "bg_run"));
  assert.equal(results[1].approval.kind, "human-only");
});

test("beforeAsk host: a failed bg_run frees its slot quietly", () => {
  const { log } = escalationPlugin([
    { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "cat mcp-auth.json" } } },
    { after: { session: "ses_child", tool: "bg_run", callID: "c1", failed: true } },
  ], { beforeAsk: true });
  assert.match(log, /escalation-abandoned/);
  assert.doesNotMatch(log, /escalation-missed/);
});

test("without beforeAsk the process tools keep the legacy throw (older host)", () => {
  const { results } = escalationPlugin([
    { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "cat mcp-auth.json" } } },
  ]);
  assert.match(results[0].threw, /names a credential store/);
  assert.equal(results[0].ask, undefined);
});

test("a configured deny on a non-deferrable process tool stays blocked under auto, root or child", () => {
  for (const session of ["ses_root", "ses_child"]) {
    const { results } = escalationPlugin([
      { before: { session, tool: "bg_run", callID: "c1", args: { command: "git push --force origin x" } } },
      { before: { session, tool: "pty_spawn", callID: "c2", args: { command: "git", args: ["push", "--force", "origin", "x"] } } },
    ], { rootMode: "auto" });
    assert.match(results[0].threw, /matches a deny rule in the opencode permission config/, session);
    assert.match(results[1].threw, /matches a deny rule in the opencode permission config/, session);
  }
});

// ---------------------------------------------------------------- auto root / descendants

const AUTO_FLOORS = [
  ["launder", "sed -i s/a/b/ notes.txt", /matches an allow rule for a read-only command/, {}],
  ["hard credential", "cat mcp-auth.json", /names a credential store/, {}],
  ["cc-safety-net", "git reset --hard HEAD~1", /git reset --hard destroys/, {}],
  ["classifier RISKY", "curl -X POST https://example.invalid", /looks risky to run unattended/, { classifier: "RISKY" }],
  ["no classifier lane", "curl -X POST https://example.invalid", /could not be judged/, { profile: "local" }],
];

for (const [label, command, message, options] of AUTO_FLOORS) {
  test(`A16 auto root and auto descendant: ${label} throws the root's own message`, () => {
    const { results, log } = escalationPlugin([
      bashBefore("ses_root", "c1", command),
      bashBefore("ses_child", "c2", command),
    ], { rootMode: "auto", ...options });
    assert.match(results[0].threw ?? "", message, `root: ${label}`);
    assert.match(results[1].threw ?? "", message, `child: ${label}`);
    assert.doesNotMatch(log, /stash\(/);
  });
}

test("A16 auto descendant: launder is judged against the ROOT's rules as well as the child's", () => {
  const { results } = escalationPlugin([bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt")], { rootMode: "auto", childAgent: "tight" });
  assert.match(results[0].threw, /matches an allow rule for a read-only command/);
});

test("A17 auto descendant: a promptable credential is stashed human-only; the auto root keeps its native prompt", () => {
  const { results, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "rbw get gitea"),
    bashAsk("ses_child", "c1", "rbw get gitea", "ask"),
    bashBefore("ses_root", "c2", "rbw get gitea"),
    bashAsk("ses_root", "c2", "rbw get gitea", "ask"),
  ], { rootMode: "auto" });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "human-only");
  assert.equal(results[1].approval.sessionID, "ses_root");
  assert.deepEqual(results[1].always, []);
  assert.equal(results[2].threw, null);
  assert.deepEqual(results[3], { status: "ask" }, "the root's own promptable credential is a plain native prompt");
  assert.deepEqual(replies, []);
});

test("A15 auto descendant: seat miss is judged by the classifier and settled once by the guard", () => {
  const { results, replies, calls } = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_1", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1, pending: true } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "operator");
  assert.equal(results[1].judged, undefined, "the judged mark is guard-internal and never reaches native");
  assert.deepEqual(replies, [{ id: "per_1", response: "once" }]);
  assert.deepEqual(promotions(calls), [], "an operator ask never promotes");
  assert.deepEqual(wakes(calls), [], "an operator ask never wakes the root model");
});

// Rewritten (fix 3): a judged mark now needs the call's tool.execute.before context (its
// original root binding), so the call runs its before-hook first. Under auto the classifier
// would refuse ./deploy.sh in that before-hook already, so the root is manual when the call
// starts (no classifier) and auto when the ask is judged.
test("A15 auto descendant: a judged RISKY ask is rejected and surfaced in the parent's task result", () => {
  const { replies, results } = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { mode: { session: "ses_root", mode: "auto" } },
    bashAsk("ses_child", "c1", "./deploy.sh", "deny"),
    { asked: { id: "per_risky", session: "ses_child", callID: "c1", permission: "bash", command: "./deploy.sh", fromAsk: 2 } },
    { task: "ses_root" },
  ], { rootMode: "manual", classifier: "RISKY" });
  assert.equal(results[0].threw, null);
  assert.equal(results[2].approval.kind, "operator");
  assert.deepEqual(replies, [{ id: "per_risky", response: "reject" }]);
  assert.match(results[4].output, /DENIED to this subagent/);
  assert.match(results[4].output, /\.\/deploy\.sh/);
});

test("fix 3: an operator ask whose tool.execute.before context is missing is never judged; the person answers it", () => {
  const { replies, classified, results } = escalationPlugin([
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_lost", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 0 } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(results[0].approval.kind, "operator", "native still raises the operator ask");
  assert.deepEqual(replies, [], "safe loss of eligibility: no guard grant without the original binding");
  assert.deepEqual(classified, []);
});

// Rewritten (root-policy round, lead ruling "any visible native permission must still be judged
// like root"): the call context is now keyed by (session, call) and kept for every permission
// the call raises, so the external_directory ask is judged as the auto root would judge it
// (auto approves a non-shell permission) instead of being left for the person. It still neither
// consumes nor borrows the bash ask's own judgment or floor.
test("fix 3: an external_directory ask is judged as root and neither consumes nor borrows a bash call's floor", () => {
  const auto = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    { ask: { session: "ses_child", callID: "c1", permission: "external_directory", status: "deny", patterns: ["/etc/*"] } },
    { asked: { id: "per_ext", session: "ses_child", callID: "c1", permission: "external_directory", fromAsk: 1 } },
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_bash", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 3 } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(auto.results[1].approval.kind, "operator");
  assert.equal(auto.results[3].approval.kind, "operator");
  assert.deepEqual(auto.replies, [{ id: "per_ext", response: "once" }, { id: "per_bash", response: "once" }],
    "each exact ask is judged once, by its own mark");
  const god = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { ask: { session: "ses_child", callID: "c1", permission: "external_directory", status: "deny", patterns: ["/etc/*"] } },
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assertParent(god.results[1], /^native deny: external_directory$/, "external_directory keeps its own native verdict");
  assertParent(god.results[2], /^launder: deferred bash floor$/, "the bash floor is still there for its own ask");
});

// Invariant 3, the other order: the bash ask settles first and must not consume, or lend its
// verdict to, the same call's later external_directory ask.
test("fix 3 reversed: a bash ask judged first neither consumes nor lends to the call's external_directory ask", () => {
  const auto = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_bash", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1 } },
    { ask: { session: "ses_child", callID: "c1", permission: "external_directory", status: "deny", patterns: ["/etc/*"] } },
    { asked: { id: "per_ext", session: "ses_child", callID: "c1", permission: "external_directory", fromAsk: 3 } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(auto.results[1].approval.kind, "operator");
  assert.equal(auto.results[3].approval.kind, "operator");
  assert.deepEqual(auto.replies, [{ id: "per_bash", response: "once" }, { id: "per_ext", response: "once" }],
    "each exact ask is judged once, by its own mark");
  const god = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
    { ask: { session: "ses_child", callID: "c1", permission: "external_directory", status: "deny", patterns: ["/etc/*"] } },
  ]);
  assertParent(god.results[1], /^launder: deferred bash floor$/, "the bash floor goes to its own ask");
  assertParent(god.results[2], /^native deny: external_directory$/, "external_directory keeps its own native verdict");
});

test("A15 auto descendant: a named ROOT deny goes to the human once; a catch-all root deny stands", () => {
  const named = escalationPlugin([
    bashBefore("ses_child", "c1", "git push --force origin x"),
    bashAsk("ses_child", "c1", "git push --force origin x", "deny"),
  ], { rootMode: "auto" });
  assert.equal(named.results[0].threw, null, "native denies it; the hook routes it");
  assert.equal(named.results[1].approval.kind, "human-only");
  assert.equal(named.results[1].approval.reason, "named hard rule");
  const catchAll = escalationPlugin([
    bashBefore("ses_child", "c1", "make"),
    bashAsk("ses_child", "c1", "make", "deny"),
  ], { rootMode: "auto", rootAgent: "lockdown" });
  assert.equal(catchAll.results[0].threw, null);
  assert.deepEqual(catchAll.results[1], { status: "deny" }, "a root catch-all deny stands, no escalation");
});

test("unknown root agent: the global config's named rules decide human-only (agents: [])", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "git push --force origin x"),
    bashAsk("ses_child", "c1", "git push --force origin x", "deny"),
    bashAsk("ses_root", "c2", "mkfs.ext4 /dev/sdz", "deny"),
  ], { rootMode: "auto", agents: [] });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "human-only");
  assert.equal(results[2].approval.kind, "human-only", "auto root own named deny");
});

test("A18 auto root own ordinary ask: no proposal, so the classifier handler approves it", () => {
  const { results, replies } = escalationPlugin([
    bashAsk("ses_root", "c1", "npm run build", "ask"),
    { asked: { id: "per_2", session: "ses_root", callID: "c1", permission: "bash", command: "npm run build" } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.deepEqual(results[0], { status: "ask" });
  assert.deepEqual(replies, [{ id: "per_2", response: "once" }]);
});

test("A20 an operator ask without a judged mark is left for the human", () => {
  const { replies, classified } = escalationPlugin([
    { asked: { id: "per_3", session: "ses_child", callID: "cX", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
  ], { rootMode: "auto" });
  assert.deepEqual(replies, []);
  assert.deepEqual(classified, []);
});

test("A20 judged marks are exact: another callID, permission or requester cannot consume them", () => {
  // Rewritten (fix 3): the call runs its before-hook first, which records its root binding.
  const { replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_wrong_call", session: "ses_child", callID: "c2", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
    { asked: { id: "per_wrong_perm", session: "ses_child", callID: "c1", permission: "edit", kind: "operator" } },
    { asked: { id: "per_wrong_session", session: "ses_other", callID: "c1", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
    { asked: { id: "per_exact", session: "ses_child", callID: "c1", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
    { asked: { id: "per_again", session: "ses_child", callID: "c1", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.deepEqual(replies, [{ id: "per_exact", response: "once" }], "one mark settles exactly one request");
});

// Rewritten (fix 3): each call runs its before-hook first, which records its root binding.
test("judged operator under a manual root stays with the person; under edits a file edit is approved and a shell command refused", () => {
  const manual = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_m", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1 } },
  ], { rootMode: "manual" });
  assert.equal(manual.results[1].approval.kind, "operator");
  assert.deepEqual(manual.replies, []);
  assert.deepEqual(manual.classified, []);
  const edits = escalationPlugin([
    { before: { session: "ses_child", tool: "edit", callID: "c1", args: { filePath: "__HOME__/work/notes.txt" } } },
    { ask: { session: "ses_child", callID: "c1", permission: "edit", status: "deny", patterns: ["notes.txt"] } },
    { asked: { id: "per_e", session: "ses_child", callID: "c1", permission: "edit", fromAsk: 1 } },
    bashBefore("ses_child", "c2", "./check-gates.sh"),
    bashAsk("ses_child", "c2", "./check-gates.sh", "deny"),
    { asked: { id: "per_s", session: "ses_child", callID: "c2", permission: "bash", command: "./check-gates.sh", fromAsk: 4 } },
  ], { rootMode: "edits" });
  assert.equal(edits.results[0].threw, null);
  assert.equal(edits.results[3].threw, null);
  assert.deepEqual(edits.replies, [{ id: "per_e", response: "once" }, { id: "per_s", response: "reject" }]);
  assert.deepEqual(edits.classified, [], "edits never sends a shell command to the classifier");
});

// Rewritten twice. Fix 3: the judged call runs its before-hook first. Root-policy round (lead
// ruling "judgment mode is the ROOT's current legacy mode"): the floors of a non-god root's
// descendant run under the ROOT's mode, so under an edits root the child's own god file no
// longer caps to auto and sends its shell command to the classifier before the tool; the
// earlier expectation (results[4] throws "looks risky") was the auto-capped classifier and is
// replaced. The command reaches native and is judged with edits, which refuses a shell command.
test("a child's own god mode file cannot bypass a non-god root's judgment", () => {
  const { replies, results, classified } = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    bashAsk("ses_child", "c1", "./deploy.sh", "deny"),
    { asked: { id: "per_g", session: "ses_child", callID: "c1", permission: "bash", command: "./deploy.sh", fromAsk: 1 } },
    { classifier: "RISKY" },
    bashBefore("ses_child", "c2", "curl -X POST https://example.invalid"),
    bashAsk("ses_child", "c2", "curl -X POST https://example.invalid", "deny"),
    { asked: { id: "per_r", session: "ses_child", callID: "c2", permission: "bash", command: "curl -X POST https://example.invalid", fromAsk: 5 } },
  ], { rootMode: "edits", childMode: "god", classifier: "SAFE" });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "operator");
  assert.equal(results[4].threw, null, "edits floors: no classifier before the tool");
  assert.equal(results[5].approval.kind, "operator");
  assert.deepEqual(replies, [{ id: "per_g", response: "reject" }, { id: "per_r", response: "reject" }],
    "judged as the edits root, never as the child's god file");
  assert.deepEqual(classified, [], "edits never sends a shell command to the classifier");
});

test("root judgment mode: a child's own god file cannot downgrade a manual root to auto", () => {
  const { replies, results, classified } = escalationPlugin([
    bashBefore("ses_child", "c1", "curl -X POST https://example.invalid"),
    bashAsk("ses_child", "c1", "curl -X POST https://example.invalid", "deny"),
    { asked: { id: "per_m", session: "ses_child", callID: "c1", permission: "bash", command: "curl -X POST https://example.invalid", fromAsk: 1 } },
  ], { rootMode: "manual", childMode: "god", classifier: "RISKY" });
  assert.equal(results[0].threw, null, "manual floors: no classifier refusal before the tool");
  assert.equal(results[1].approval.kind, "operator");
  assert.deepEqual(replies, [], "manual leaves the judged ask with the person");
  assert.deepEqual(classified, []);
});

test("root judgment mode: a root with no mode file of its own takes the global mode, not a hardcoded auto", () => {
  // Global edits, no root file: the child's own god file must not cap its floors to auto.
  const edits = escalationPlugin([
    bashBefore("ses_child", "c1", "curl -X POST https://example.invalid"),
  ], { rootMode: null, globalMode: "edits", childMode: "god", classifier: "RISKY" });
  assert.equal(edits.results[0].threw, null);
  assert.deepEqual(edits.classified, []);
  // No global file either: manual.
  const manual = escalationPlugin([
    bashBefore("ses_child", "c1", "curl -X POST https://example.invalid"),
    bashAsk("ses_child", "c1", "curl -X POST https://example.invalid", "deny"),
    { asked: { id: "per_n", session: "ses_child", callID: "c1", permission: "bash", command: "curl -X POST https://example.invalid", fromAsk: 1 } },
  ], { rootMode: null, classifier: "RISKY" });
  assert.equal(manual.results[0].threw, null);
  assert.equal(manual.results[1].approval.kind, "operator");
  assert.deepEqual(manual.replies, []);
  assert.deepEqual(manual.classified, []);
});

// ---------------------------------------------------------------- failure, correlation, races

test("A19 hook error with a stash denies with no grant remnants; without a stash the error propagates", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { breakCapabilities: true },
    { ask: { session: "ses_child", callID: "c1", permission: "bash", status: "allow", command: "sed -i s/a/b/ notes.txt", preset: { forceAsk: false } } },
    bashAsk("ses_child", "c2", "ls", "allow"),
  ]);
  assert.equal(results[0].threw, null);
  assert.equal(results[2].status, "deny");
  assert.equal(results[2].approval, undefined);
  assert.equal(results[2].override, undefined);
  assert.notEqual(results[2].forceAsk, true);
  // The HTTP error propagates as it is (the SDK throws the error body); it is never
  // reclassified as an old host, and native keeps its own verdict.
  assert.ok(results[3].threw, "an HTTP capability failure without a stash propagates");
  assert.deepEqual(results[3].output, { status: "allow" });
});

test("A19 hook error with only a root-policy marker stored denies with no grant remnants", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { breakCapabilities: true },
    bashAsk("ses_child", "c1", "./deploy.sh", "allow"),
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open" });
  assert.equal(results[0].threw, null, "the root's deny routed the call: a marker, not a floor");
  assert.equal(results[2].status, "deny");
  assert.equal(results[2].approval, undefined);
  assert.equal(results[2].override, undefined);
  assert.notEqual(results[2].forceAsk, true);
});

test("A21 a stash that outlives its tool call is reported as escalation-missed", () => {
  const { log, appLogs } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { after: { session: "ses_child", tool: "bash", callID: "c1" } },
  ]);
  assert.match(log, /escalation-missed/);
  assert.ok(appLogs.some((entry) => entry?.level === "error" && /ran without reaching its permission hook/.test(entry?.message ?? "")), JSON.stringify(appLogs));
});

test("a call that FAILED before its permission hook frees its slot quietly: no missed alarm", () => {
  const { log, appLogs, results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { after: { session: "ses_child", tool: "bash", callID: "c1", failed: true } },
    // The slot is gone: the same call ID cannot pick up the old floor, and a fresh deferral works.
    bashBefore("ses_child", "c1", "sed -i s/c/d/ notes.txt"),
    bashAsk("ses_child", "c1", "sed -i s/c/d/ notes.txt", "allow"),
  ]);
  assert.doesNotMatch(log, /escalation-missed/);
  assert.match(log, /escalation-abandoned/);
  assert.ok(!appLogs.some((entry) => entry?.level === "error"), JSON.stringify(appLogs));
  assert.equal(results[2].threw, null);
  assertParent(results[3], /^launder: deferred bash floor$/, "the new call's own floor escalates");
});

test("review fix (ruling 7): a descendant's plain ask is judged by the ROOT's mode, not its own mode file", () => {
  // Manual root; the child holds its own god file. The plain native ask must stay with the person.
  const manual = escalationPlugin([
    { mode: { session: "ses_child", mode: "god" } },
    { asked: { id: "per_plain", session: "ses_child", callID: "c1", permission: "bash", command: "curl -X POST https://example.com" } },
  ], { rootMode: "manual" });
  assert.deepEqual(manual.replies, [], "no auto-approval from the child's own god file");
  // The same child under a god root is still answered on the root's behalf.
  const god = escalationPlugin([
    { mode: { session: "ses_child", mode: "manual" } },
    { asked: { id: "per_plain", session: "ses_child", callID: "c1", permission: "bash", command: "make" } },
  ]);
  assert.deepEqual(god.replies, [{ id: "per_plain", response: "once" }], "the root's god mode decides, not the child's manual file");
});

test("decision log lines never carry a secret from the command line", () => {
  const { log } = escalationPlugin([
    bashBefore("ses_root", "c1", `curl -H "Authorization: Bearer sk-SECRETTOKEN123" https://example.invalid`),
    bashBefore("ses_child", "c2", `curl -u admin:SECRETPASS99 https://example.invalid`),
  ], { classifier: "RISKY", childAgent: "tight" });
  assert.match(log, /curl/, "the command itself is still logged");
  assert.doesNotMatch(log, /SECRETTOKEN123|SECRETPASS99/);
});

test("review fix: a god root that leaves god between its call and the call's hook gets a deny, not native's allow", () => {
  const flipped = escalationPlugin([
    bashBefore("ses_root", "c1", "sed -i s/a/b/ notes.txt"),
    { mode: { session: "ses_root", mode: "auto" } },
    bashAsk("ses_root", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assert.equal(flipped.results[0].threw, null, "god skipped the floors");
  assert.deepEqual(flipped.results[2], { status: "deny" });
  const stayed = escalationPlugin([
    bashBefore("ses_root", "c1", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_root", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assert.notEqual(stayed.results[1].status, "deny", "still god: the root's own call runs");
});

test("A21 escalation-missed is reported even with the guard level switched off afterwards", () => {
  const { log } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { level: "off" },
    { after: { session: "ses_child", tool: "bash", callID: "c1" } },
  ]);
  assert.match(log, /escalation-missed/);
});

test("stash keys are exact: another callID, permission or session does not consume a stash", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_child", "c2", "sed -i s/a/b/ notes.txt", "allow"),
    { ask: { session: "ses_child", callID: "c1", permission: "edit", status: "allow", patterns: ["notes.txt"] } },
    bashAsk("ses_other", "c1", "sed -i s/a/b/ notes.txt", "allow"),
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assert.deepEqual(results[1], { status: "allow" });
  assert.deepEqual(results[2], { status: "allow" });
  assert.deepEqual(results[3], { status: "allow" }, "ses_other is a god-less root of its own");
  assertParent(results[4], /^launder: /, "the exact key");
  assert.deepEqual(results[5], { status: "allow" }, "a stash is consumed once");
});

test("missing call correlation: a deferred floor fails closed with the floor's own throw", () => {
  const { results, log } = escalationPlugin([
    { before: { session: "ses_child", tool: "bash", args: { command: "sed -i s/a/b/ notes.txt" } } },
    { ask: { session: "ses_child", permission: "bash", status: "allow", command: "sed -i s/a/b/ notes.txt" } },
  ]);
  assert.match(results[0].threw, /matches an allow rule for a read-only command/);
  assert.deepEqual(results[1], { status: "allow" }, "nothing was stashed under an undefined key");
  assert.doesNotMatch(log, /undefined.*stash|stash\(/);
});

test("the hook accepts the request wrapped as { req }", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { ask: { session: "ses_child", callID: "c1", permission: "bash", status: "allow", command: "sed -i s/a/b/ notes.txt", wrap: true } },
  ]);
  assertParent(results[1], /^launder: /, "wrapped");
});

// Rewritten (fix 2): these replace "pending escalations are bounded: eviction is logged ..."
// and "a stash older than its time limit is evicted ...". Eviction moved a restriction into a
// second map that itself expired and evicted, so a refused call could eventually run with no
// floor. A deferral now keeps its slot until its own hook or tool completion consumes it; the
// cap refuses NEW deferrals instead of forgetting accepted ones.
const newLines = (log, pattern) => log.split("\n").filter((line) => pattern.test(line));

test("fix 2: deferred floors are capped at 500 accepted keys; a new deferral is refused before the tool runs and none is evicted", () => {
  const steps = [];
  for (let i = 0; i < 500; i += 1) steps.push(bashBefore("ses_child", `c${i}`, `sed -i s/SECRETMARK${i}/b/ notes.txt`));
  steps.push(bashBefore("ses_child", "c500", "sed -i s/SECRETMARK500/b/ notes.txt"));
  steps.push(bashBefore("ses_child", "c501", "sed -i s/SECRETMARK501/b/ notes.txt"));
  steps.push(bashAsk("ses_child", "c0", "sed -i s/SECRETMARK0/b/ notes.txt", "allow"));
  steps.push(bashAsk("ses_child", "c499", "sed -i s/SECRETMARK499/b/ notes.txt", "allow"));
  steps.push(bashAsk("ses_child", "c500", "sed -i s/SECRETMARK500/b/ notes.txt", "allow"));
  const { results, log } = escalationPlugin(steps);
  for (let i = 0; i < 500; i += 1) assert.equal(results[i].threw, null, `c${i} accepted`);
  assert.match(results[500].threw ?? "", /500 deferred guard floors are already waiting/);
  assert.match(results[501].threw ?? "", /500 deferred guard floors are already waiting/);
  assertParent(results[502], /^launder: deferred bash floor$/, "the oldest accepted deferral is kept");
  assertParent(results[503], /^launder: deferred bash floor$/, "the newest accepted deferral is kept");
  assert.deepEqual(results[504], { status: "allow" }, "a refused deferral left nothing behind; its tool never ran");
  const capacity = newLines(log, / escalation-capacity /);
  assert.equal(capacity.length, 2, log.slice(-2000));
  assert.doesNotMatch(capacity.join("\n"), /SECRETMARK/);
  assert.equal(newLines(log, / escalation-(evicted|expired) /).length, 0);
});

test("fix 2: expired deferrals keep their slots: restrictions still deny after 20 minutes, cannot be pushed out, and free up only when consumed", () => {
  const steps = [];
  for (let i = 0; i < 500; i += 1) steps.push(bashBefore("ses_child", `c${i}`, `sed -i s/SECRETMARK${i}/b/ notes.txt`));
  steps.push({ advance: 21 * 60 * 1000 });
  for (let i = 0; i < 3; i += 1) steps.push(bashBefore("ses_child", `n${i}`, "sed -i s/SECRETMARK/b/ notes.txt"));
  steps.push(bashAsk("ses_child", "c0", "sed -i s/SECRETMARK0/b/ notes.txt", "allow"));
  steps.push(bashAsk("ses_child", "c0", "sed -i s/SECRETMARK0/b/ notes.txt", "allow"));
  steps.push(bashAsk("ses_child", "c250", "sed -i s/SECRETMARK250/b/ notes.txt", "allow"));
  steps.push(bashAsk("ses_child", "c499", "sed -i s/SECRETMARK499/b/ notes.txt", "allow"));
  steps.push({ after: { session: "ses_child", tool: "bash", callID: "c1" } });
  steps.push(bashBefore("ses_child", "fresh", "sed -i s/a/b/ notes.txt"));
  steps.push(bashAsk("ses_child", "fresh", "sed -i s/a/b/ notes.txt", "allow"));
  const { results, log } = escalationPlugin(steps);
  for (let i = 501; i < 504; i += 1) assert.match(results[i].threw ?? "", /500 deferred guard floors are already waiting/, `attempt ${i}`);
  assert.deepEqual(results[504], { status: "deny" }, "the first restriction still applies after 21 minutes");
  assert.deepEqual(results[505], { status: "allow" }, "consumed once: the slot is freed by its own hook");
  assert.deepEqual(results[506], { status: "deny" });
  assert.deepEqual(results[507], { status: "deny" });
  assert.equal(results[509].threw, null, "slots freed by hooks and completion admit a fresh deferral");
  assertParent(results[510], /^launder: deferred bash floor$/, "the fresh deferral escalates normally");
  const expired = newLines(log, / escalation-expired /);
  assert.equal(expired.length, 500, `expiry is logged once per slot (got ${expired.length})`);
  assert.doesNotMatch(expired.join("\n"), /SECRETMARK/);
  assert.equal(newLines(log, /deny\(expired-escalation\)/).length, 3);
  assert.match(log, /escalation-missed/, "tool completion consumes a tombstone and still raises the alarm");
});

test("fix 2: a session.deleted event does not drop a deferred floor", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { event: { type: "session.deleted", properties: { info: { id: "ses_child" } } } },
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assertParent(results[2], /^launder: deferred bash floor$/, "the restriction outlives an uncorrelated delete event");
});

test("fix 1: level off after a deferral denies the deferred call with no grant remnants; a call with no deferral keeps native's verdict", () => {
  const preset = { forceAsk: false, override: "root", approval: { kind: "parent" } };
  const god = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    bashBefore("ses_child", "c2", "sed -i s/a/b/ notes.txt"),
    { advance: 11 * 60 * 1000 },
    { level: "off" },
    { ask: { session: "ses_child", callID: "c1", permission: "bash", status: "allow", command: "sed -i s/a/b/ notes.txt", preset } },
    { ask: { session: "ses_child", callID: "c2", permission: "bash", status: "allow", command: "sed -i s/a/b/ notes.txt" } },
    bashAsk("ses_child", "c3", "./check-gates.sh", "deny"),
    bashAsk("ses_child", "c4", "ls", "ask"),
    bashBefore("ses_child", "c5", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_child", "c5", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assert.deepEqual(god.results[4], { status: "deny" }, "an expired deferral under level off: denied, every remnant removed");
  assert.deepEqual(god.results[5], { status: "deny" }, "the same for a second expired deferral");
  assert.deepEqual(god.results[6], { status: "deny" }, "no deferral: native's verdict, untouched");
  assert.deepEqual(god.results[7], { status: "ask" });
  assert.equal(god.results[8].threw, null, "a new call under level off is the legacy off path");
  assert.deepEqual(god.results[9], { status: "allow" });
  const live = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { level: "off" },
    { ask: { session: "ses_child", callID: "c1", permission: "bash", status: "allow", command: "sed -i s/a/b/ notes.txt", preset } },
  ]);
  assert.deepEqual(live.results[2], { status: "deny" }, "a live god deferral under level off: denied, no parent ask");
  assert.deepEqual(live.replies, []);
  assert.deepEqual(promotions(live.calls), []);
  const human = escalationPlugin([
    bashBefore("ses_child", "c1", "rbw get gitea"),
    { level: "off" },
    bashAsk("ses_child", "c1", "rbw get gitea", "ask"),
  ], { rootMode: "auto" });
  assert.equal(human.results[0].threw, null);
  assert.deepEqual(human.results[2], { status: "deny" }, "a human-only deferral under level off: denied");
});

test("fix 3: a human-only deferral keeps the root binding captured before the agent rules load; a replacement then denies it", () => {
  const { results, log } = escalationPlugin([
    { during: { at: "agents", root: "inc_2" } },
    bashBefore("ses_child", "c1", "rbw get gitea"),
    bashAsk("ses_child", "c1", "rbw get gitea", "ask"),
  ], { rootMode: "auto" });
  assert.equal(results[1].threw, null);
  assert.deepEqual(results[2], { status: "deny" }, "inc_1's human-only deferral never becomes inc_2's ask");
  assert.match(log, /escalation-error/);
});

test("fix 3: a root replaced during the classifier gets no judged grant; the original call is denied and a fresh request is judged", () => {
  const { results, replies, calls } = escalationPlugin([
    { during: { at: "classify", root: "inc_2" } },
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { asked: { id: "per_old", session: "ses_child", callID: "c1", permission: "bash", kind: "operator", command: "./check-gates.sh" } },
    bashBefore("ses_child", "c2", "./check-gates.sh"),
    bashAsk("ses_child", "c2", "./check-gates.sh", "deny"),
    { asked: { id: "per_new", session: "ses_child", callID: "c2", permission: "bash", command: "./check-gates.sh", fromAsk: 5 } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(results[1].threw, null);
  assert.deepEqual(results[2], { status: "deny" }, "the original call is denied at its hook, never re-bound to inc_2");
  assert.equal(results[5].approval.kind, "operator");
  assert.deepEqual(replies, [{ id: "per_new", response: "once" }], "only the fresh request is judged");
  assert.deepEqual(promotions(calls), []);
});

// Rewritten (root-policy round, lead ruling "existing approved capture errors must fail closed;
// do not allow a non-god before-hook unbound after a binding read error"): the earlier version
// let a non-god descendant run unbound (results[1] threw null) and asserted that. Every attended
// descendant now fails closed before its tool runs, on any tool, deferrable or not.
test("fix 3: a binding capture failure fails closed before the tool runs for every attended descendant, god or not, on any tool", () => {
  for (const rootMode of ["god", "auto", "manual"]) {
    const { results, classified } = escalationPlugin([
      { rootGetFails: true },
      bashBefore("ses_child", "c1", "./check-gates.sh"),
      bashBefore("ses_child", "c2", "rbw get gitea"),
      { before: { session: "ses_child", tool: "webfetch", callID: "c3", args: { url: "https://example.invalid" } } },
      { before: { session: "ses_child", tool: "bg_run", callID: "c4", args: { command: "ls" } } },
    ], { rootMode, classifier: "SAFE" });
    for (const i of [1, 2, 3, 4]) assert.match(results[i].threw ?? "", /permission authority unavailable/, `${rootMode} step ${i}`);
    assert.deepEqual(classified, [], `${rootMode}: nothing judged after a failed capture`);
  }
});

const SENTINEL = "SENTINEL_SECRET_9f8e7d6c5b4a39281706f5e4d3c2b1a0";
// Only the categories this policy added. Legacy deny(...)/allow(...) lines (the floors' own,
// and the before-hook's allow(god)) are out of scope and keep their command text.
const NEW_LOG = /\b(stash\(|escalate\(|allow\(god\/override\)|escalation-|judged-|call-context-|deny\(expired-escalation\))/;

test("fix 4: approval reasons and the new escalation logs never carry the command or an error body", () => {
  // -X POST: a plain `curl -H ...` is a static read and would never meet the classifier floor.
  const command = `curl -X POST -H 'Authorization: Bearer ${SENTINEL}' https://example.invalid`;
  const run = escalationPlugin([
    bashBefore("ses_child", "c1", command),
    bashAsk("ses_child", "c1", command, "deny"),
    bashBefore("ses_child", "c2", command),
    { breakCapabilities: `request failed for ${SENTINEL}` },
    bashAsk("ses_child", "c2", command, "deny"),
  ], { classifier: "RISKY" });
  assertParent(run.results[1], /^llm: deferred bash floor$/, "class plus a generic description");
  assert.doesNotMatch(JSON.stringify(run.results[1]), new RegExp(SENTINEL));
  assert.deepEqual(run.results[4], { status: "deny" }, "the hook error still fails closed");
  const fresh = newLines(run.log, NEW_LOG);
  assert.ok(fresh.some((line) => /stash\(parent\/llm\)/.test(line)), run.log);
  assert.ok(fresh.some((line) => /escalation-error/.test(line)), run.log);
  assert.doesNotMatch(fresh.join("\n"), new RegExp(SENTINEL), fresh.join("\n"));
  const root = escalationPlugin([
    bashBefore("ses_root", "c1", command),
    bashAsk("ses_root", "c1", command, "deny"),
    bashAsk("ses_root", "c2", command, "ask"),
  ]);
  assert.deepEqual(root.results[1], { status: "allow", override: "root" });
  assert.deepEqual(root.results[2], { status: "allow" });
  const rootLines = newLines(root.log, NEW_LOG);
  assert.ok(rootLines.some((line) => /allow\(god\/override\)/.test(line)), root.log);
  assert.doesNotMatch(rootLines.join("\n"), new RegExp(SENTINEL));
  assert.match(root.log, / allow\(god\) bash in ses_root\n/, "the hook's own allow(god) line names no command");
  const human = escalationPlugin([
    bashBefore("ses_child", "c1", `rbw get ${SENTINEL}`),
    bashAsk("ses_child", "c1", `rbw get ${SENTINEL}`, "ask"),
  ], { rootMode: "auto" });
  assert.equal(human.results[1].approval.kind, "human-only");
  assert.doesNotMatch(human.results[1].approval.reason, new RegExp(SENTINEL));
  assert.doesNotMatch(newLines(human.log, NEW_LOG).join("\n"), new RegExp(SENTINEL));
});

test("fix 5: a cc-safety-net analysis failure (net-error) is deferred for a god descendant, thrown for an auto one, and never checked for a god root", () => {
  const god = escalationPlugin([
    bashBefore("ses_child", "c1", "ls -la"),
    bashAsk("ses_child", "c1", "ls -la", "allow"),
    bashBefore("ses_child", "c2", "ls -la"),
    { root: "inc_2" },
    bashAsk("ses_child", "c2", "ls -la", "allow"),
  ], { netError: true });
  assert.equal(god.results[0].threw, null);
  assertParent(god.results[1], /^net-error: deferred bash floor$/, "god descendant");
  assert.match(god.log, /stash\(parent\/net-error\)/);
  assert.deepEqual(god.results[4], { status: "deny" }, "a binding failure after a net-error deferral denies, no grant");
  assert.deepEqual(god.replies, []);
  assert.ok(god.netCalls >= 2, `the throwing analyzer ran (${god.netCalls})`);
  const auto = escalationPlugin([bashBefore("ses_child", "c1", "ls -la")], { netError: true, rootMode: "auto" });
  assert.match(auto.results[0].threw ?? "", /cc-safety-net could not analyze this command/);
  assert.match(auto.results[0].threw ?? "", /rule analysis-error/);
  const root = escalationPlugin([bashBefore("ses_root", "c1", "ls -la"), bashAsk("ses_root", "c1", "ls -la", "ask")], { netError: true });
  assert.equal(root.results[0].threw, null);
  assert.deepEqual(root.results[1], { status: "allow" });
  assert.equal(root.netCalls, 0, "the god root's own call never reaches the analyzer");
});

test("fix 6: a root mode flip during the hook's binding check denies a stashed call instead of applying the god snapshot", () => {
  const { results, replies, calls } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { during: { at: "rootGet", mode: { session: "ses_root", mode: "auto" } } },
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assert.deepEqual(results[2], { status: "deny" });
  assert.deepEqual(replies, []);
  assert.deepEqual(promotions(calls), []);
});

test("review fix: a root mode flip between a context-only call and its hook denies the original call", () => {
  // No floor fires for "ls -la", so nothing is stashed; only the call context binds the god mode.
  const { results, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "ls -la"),
    { mode: { session: "ses_root", mode: "auto" } },
    bashAsk("ses_child", "c1", "ls -la", "allow"),
  ]);
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[2], { status: "deny" }, "the native allow does not stand for a call checked under god");
  assert.deepEqual(replies, []);
});

test("fix 6: a root mode flip during the final judged revalidation leaves the request for the person", () => {
  const { results, replies } = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    // The judged handler reads the root twice: before judging and immediately before the
    // reply. The flip lands inside the second read.
    { during: { at: "rootGet", skip: 1, mode: { session: "ses_root", mode: "manual" } } },
    { asked: { id: "per_flip", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1 } },
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.equal(results[1].approval.kind, "operator");
  assert.deepEqual(replies, [], "no reply under a stale auto snapshot");
});

test("fix 6: the god root's own override needs no agent-rules load before the proposal", () => {
  const { results, agentsCalls } = escalationPlugin([bashAsk("ses_root", "c1", "git push --force origin x", "deny")]);
  assert.deepEqual(results[0], { status: "allow", override: "root" });
  assert.equal(agentsCalls, 0);
});

test("lead ruling 6: a stash captured under god is denied, never judged, when the root leaves god before the hook", () => {
  const { results, replies, classified, log } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/SECRETMARK/b/ notes.txt"),
    { mode: { session: "ses_root", mode: "auto" } },
    bashAsk("ses_child", "c1", "sed -i s/SECRETMARK/b/ notes.txt", "allow"),
    { asked: { id: "per_stale", session: "ses_child", callID: "c1", permission: "bash", kind: "operator", command: "sed -i s/SECRETMARK/b/ notes.txt" } },
    bashBefore("ses_child", "c2", "sed -i s/SECRETMARK/b/ notes.txt"),
  ]);
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[2], { status: "deny" }, "the exact original call is denied with no approval");
  assert.deepEqual(replies, [], "no classifier or native grant, no parent ask");
  assert.deepEqual(classified, []);
  const stale = log.split("\n").filter((line) => line.includes("escalation-stale"));
  assert.equal(stale.length, 1, log);
  assert.doesNotMatch(stale[0], /SECRETMARK/);
  assert.match(results[4].threw, /matches an allow rule for a read-only command/, "a later request is judged afresh under auto");
});

test("lead ruling 6: god to god with no change keeps the parent ask; auto human-only stash is denied after the root turns god", () => {
  const same = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { mode: { session: "ses_root", mode: "god" } },
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assertParent(same.results[2], /^launder: /, "god -> god");
  const upgraded = escalationPlugin([
    bashBefore("ses_child", "c1", "rbw get gitea"),
    { mode: { session: "ses_root", mode: "god" } },
    bashAsk("ses_child", "c1", "rbw get gitea", "ask"),
  ], { rootMode: "auto" });
  assert.deepEqual(upgraded.results[2], { status: "deny" }, "a human-only stash never turns into a parent grant");
});

test("lead ruling 7: a root replaced between stash and hook denies the old call even in god; a fresh request binds the replacement", () => {
  const { results, calls, log } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    { root: "inc_2" },
    bashAsk("ses_child", "c1", "sed -i s/a/b/ notes.txt", "allow"),
    bashBefore("ses_child", "c2", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_child", "c2", "sed -i s/a/b/ notes.txt", "allow"),
  ]);
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[2], { status: "deny" }, "inc_1's deferred floor never transfers to inc_2");
  assert.equal(results[3].threw, null);
  assertParent(results[4], /^launder: /, "a fresh request under inc_2");
  assert.deepEqual(promotions(calls), []);
  assert.match(log, /escalation-error/);
});

test("lead ruling 7: a root abort while the floor is in flight denies the deferred call", () => {
  const { results } = escalationPlugin([
    { duringClassify: { type: "session.aborted", properties: { sessionID: "ses_root", incarnationID: "inc_1" } } },
    bashBefore("ses_child", "c1", "curl -X POST https://example.invalid"),
    bashAsk("ses_child", "c1", "curl -X POST https://example.invalid", "deny"),
  ], { classifier: "RISKY" });
  assert.equal(results[1].threw, null);
  assert.deepEqual(results[2], { status: "deny" });
});

test("lead ruling 7: a host without incarnations still fences a deferred call by its admission", () => {
  const { results } = escalationPlugin([
    { duringClassify: { type: "session.aborted", properties: { sessionID: "ses_root" } } },
    bashBefore("ses_child", "c1", "curl -X POST https://example.invalid"),
    bashAsk("ses_child", "c1", "curl -X POST https://example.invalid", "deny"),
  ], { classifier: "RISKY", incarnations: false });
  assert.equal(results[1].threw, null);
  assert.deepEqual(results[2], { status: "deny" });
});

test("judged marks are never transferred across a root mode change or a root replacement", () => {
  // Rewritten (fix 3): each call runs its before-hook first, so a mark exists to be refused.
  const moded = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { mode: { session: "ses_root", mode: "god" } },
    { asked: { id: "per_1", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1 } },
  ], { rootMode: "auto" });
  assert.equal(moded.results[1].approval.kind, "operator");
  assert.deepEqual(moded.replies, []);
  const replaced = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    { root: "inc_2" },
    { asked: { id: "per_1", session: "ses_child", callID: "c1", permission: "bash", command: "./check-gates.sh", fromAsk: 1 } },
  ], { rootMode: "auto" });
  assert.equal(replaced.results[1].approval.kind, "operator");
  assert.deepEqual(replaced.replies, []);
});

test("binding capture failure fails closed before the tool runs", () => {
  const { results } = escalationPlugin([
    { rootGetFails: true },
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
  ]);
  assert.match(results[1].threw ?? "", /permission authority unavailable/);
});

test("A23 unattended: no proposals, no override and the legacy floors throw", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_child", "c2", "./check-gates.sh", "deny"),
    bashAsk("ses_root", "c3", "git push --force origin x", "deny"),
    bashBefore("ses_root", "c4", "git push --force origin x"),
  ], { unattended: true });
  assert.match(results[0].threw, /matches an allow rule for a read-only command/);
  assert.deepEqual(results[1], { status: "deny" });
  assert.deepEqual(results[2], { status: "deny" });
  assert.match(results[3].threw, /matches a deny rule in the opencode permission config/);
});

test("A23 level off: no proposals and native verdicts untouched", () => {
  const { results, calls } = escalationPlugin([
    bashBefore("ses_child", "c1", "sed -i s/a/b/ notes.txt"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
    bashAsk("ses_root", "c2", "git push --force origin x", "deny"),
  ], { level: "off" });
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[1], { status: "deny" });
  assert.deepEqual(results[2], { status: "deny" });
  assert.equal(calls.some(({ path }) => path === "/experimental/capabilities"), false);
});

test("a malformed capability probe fails closed in the before-hook and the hook", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "ls"),
    bashAsk("ses_child", "c2", "ls", "ask"),
  ], { capability: "malformed" });
  assert.match(results[0].threw ?? "", /permission authority unavailable/);
  assert.match(results[1].threw ?? "", /permission authority unavailable/);
  assert.deepEqual(results[1].output, { status: "ask" });
});

// ---------------------------------------------------------------- root policy (root-policy round)
// Lead rulings 2026-10-14 (root-policy round): a non-god root's descendant is judged as the
// root's own. The ROOT's effective (winning) bash deny holds even where the CHILD's rules allow
// the command: named -> human-once, catch-all -> explicit deny. Under god it is a parent ask.

const childAsks = (command, callID = "c1") => ["allow", "ask", "deny"].map((status, i) => [
  bashBefore("ses_child", `${callID}${i}`, command),
  bashAsk("ses_child", `${callID}${i}`, command, status),
]).flat();

test("root policy: child wildcard allow vs a ROOT named deny -> exact human-once ask, no floor, no classifier, no native reply (auto)", () => {
  const command = "git push --force origin x";
  const steps = childAsks(command);
  steps.push({ asked: { id: "per_h", session: "ses_child", callID: "c10", permission: "bash", command, fromAsk: 1 } });
  const { results, replies, classified, calls, log } = escalationPlugin(steps, { rootMode: "auto", childAgent: "open", classifier: "RISKY" });
  for (const i of [0, 2, 4]) assert.equal(results[i].threw, null, `before ${i}: the named root route skips the floors`);
  for (const i of [1, 3, 5]) {
    assert.deepEqual(results[i], {
      status: "ask", approval: { kind: "human-only", sessionID: "ses_root", reason: "named hard rule" }, forceAsk: true, always: [],
    }, `native ${["allow", "ask", "deny"][(i - 1) / 2]}`);
  }
  assert.deepEqual(replies, []);
  assert.deepEqual(classified, []);
  assert.equal(calls.some(({ path }) => path.includes("/permission/") && path.endsWith("/reply")), false);
  assert.doesNotMatch(log, /deny\(net\)/, "cc-safety-net is not run ahead of the named root route");
});

test("root policy: the same named ROOT deny under a god root is a parent ask for every native verdict", () => {
  const { results } = escalationPlugin(childAsks("./deploy.sh"), { rootAgent: "deployer", childAgent: "open", classifier: "SAFE" });
  for (const i of [0, 2, 4]) assert.equal(results[i].threw, null);
  assertParent(results[1], /^root policy deny: bash$/, "native allow");
  assertParent(results[3], /^native ask: bash$/, "native ask");
  assertParent(results[5], /^native deny: bash$/, "native deny");
  const force = escalationPlugin(childAsks("git push --force origin x"), { childAgent: "open" });
  for (const i of [1, 3, 5]) assertParent(force.results[i], /^(net: deferred bash floor|root policy deny: bash|native (ask|deny): bash)$/, `force ${i}`);
});

test("root policy: a compound command with a named ROOT deny skips every static floor, cc-safety-net included", () => {
  const { results, netCalls } = escalationPlugin([
    bashBefore("ses_child", "c1", "make && mkfs.ext4 /dev/sdz"),
    bashAsk("ses_child", "c1", "make && mkfs.ext4 /dev/sdz", "allow"),
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open", netError: true });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "human-only");
  assert.equal(netCalls, 0, "the agreed precedence: the named root route runs before cc-safety-net");
});

test("root policy: a ROOT catch-all deny with a child named allow is an explicit deny for every native verdict (auto); parent under god", () => {
  const auto = escalationPlugin(childAsks("go test ./..."), { rootMode: "auto", rootAgent: "lockdown", childAgent: "seat", classifier: "SAFE" });
  for (const i of [0, 2, 4]) assert.equal(auto.results[i].threw, null);
  for (const i of [1, 3, 5]) assert.deepEqual(auto.results[i], { status: "deny" }, `auto step ${i}`);
  assert.deepEqual(auto.classified, [], "the root could not run it: nothing to classify");
  const human = escalationPlugin([
    bashBefore("ses_child", "c1", "rbw get gitea"),
    bashAsk("ses_child", "c1", "rbw get gitea", "ask"),
  ], { rootMode: "auto", rootAgent: "lockdown", childAgent: "open" });
  assert.equal(human.results[0].threw, null);
  assert.deepEqual(human.results[1], { status: "deny" }, "a catch-all root deny wins over the human-only credential route");
  const god = escalationPlugin(childAsks("go test ./..."), { rootAgent: "lockdown", childAgent: "seat", classifier: "SAFE" });
  assertParent(god.results[1], /^root policy deny: bash$/, "god native allow");
  assertParent(god.results[3], /^native ask: bash$/, "god native ask");
  assertParent(god.results[5], /^native deny: bash$/, "god native deny");
});

test("root policy: a ROOT wildcard deny overridden by a later matching named allow does not count as a root deny", () => {
  const { results, classified } = escalationPlugin([
    bashBefore("ses_child", "c1", "go test ./..."),
    bashAsk("ses_child", "c1", "go test ./...", "allow"),
  ], { rootMode: "auto", rootAgent: "rootwild", childAgent: "open", classifier: "SAFE" });
  assert.equal(results[0].threw, null);
  assert.deepEqual(results[1], { status: "allow" });
  assert.equal(classified.length, 1, "the ordinary auto floors ran");
});

test("root policy: a routed root deny is a slot-retained restriction: a rule change, expiry or level off denies, never a plain allow", () => {
  const changed = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { chat: { session: "ses_root", agent: "open" } },
    bashAsk("ses_child", "c1", "./deploy.sh", "allow"),
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open", classifier: "SAFE" });
  assert.equal(changed.results[0].threw, null);
  assert.deepEqual(changed.results[2], { status: "deny" }, "the root's rules changed after the floors were skipped: deny");
  const expired = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { advance: 21 * 60 * 1000 },
    bashAsk("ses_child", "c1", "./deploy.sh", "allow"),
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open" });
  assert.deepEqual(expired.results[2], { status: "deny" });
  const off = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { level: "off" },
    bashAsk("ses_child", "c1", "./deploy.sh", "allow"),
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open" });
  assert.deepEqual(off.results[2], { status: "deny" });
  const toGod = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { mode: { session: "ses_root", mode: "god" } },
    bashAsk("ses_child", "c1", "./deploy.sh", "allow"),
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open" });
  assert.deepEqual(toGod.results[2], { status: "deny" }, "a marker captured under a non-god root is not turned into a parent ask");
  const other = escalationPlugin([
    bashBefore("ses_child", "c1", "./deploy.sh"),
    { ask: { session: "ses_child", callID: "c1", permission: "external_directory", status: "allow", patterns: ["/etc/*"] } },
    bashAsk("ses_child", "c1", "./deploy.sh", "allow"),
    { after: { session: "ses_child", tool: "bash", callID: "c1" } },
  ], { rootMode: "auto", rootAgent: "deployer", childAgent: "open" });
  assert.deepEqual(other.results[1], { status: "allow" }, "another permission of the call neither takes nor borrows the marker");
  assert.equal(other.results[2].approval.kind, "human-only", "the marker is still there for its own ask");
});

test("root policy: a non-god root's own routed named deny stays human-once; a routed root deny native no longer denies is denied", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_root", "c1", "git push --force origin x"),
    bashAsk("ses_root", "c1", "git push --force origin x", "deny"),
    bashBefore("ses_root", "c2", "git push --force origin x"),
    bashAsk("ses_root", "c2", "git push --force origin x", "allow"),
  ], { rootMode: "auto" });
  assert.equal(results[0].threw, null);
  assert.equal(results[1].approval.kind, "human-only");
  assert.equal(results[2].threw, null);
  assert.deepEqual(results[3], { status: "deny" }, "the floors were skipped for a root deny: never a plain allow");
});

test("call context: kept per (session, call) across permissions; a visible non-bash role deny (webfetch) is judged once as root", () => {
  const auto = escalationPlugin([
    { before: { session: "ses_child", tool: "webfetch", callID: "w1", args: { url: "https://example.invalid" } } },
    { ask: { session: "ses_child", callID: "w1", permission: "webfetch", status: "deny", patterns: ["https://example.invalid"] } },
    { asked: { id: "per_w", session: "ses_child", callID: "w1", permission: "webfetch", fromAsk: 1 } },
    { asked: { id: "per_w2", session: "ses_child", callID: "w1", permission: "webfetch", kind: "operator", patterns: ["https://example.invalid"] } },
  ], { rootMode: "auto" });
  assert.equal(auto.results[0].threw, null);
  assert.equal(auto.results[1].approval.kind, "operator");
  assert.deepEqual(auto.replies, [{ id: "per_w", response: "once" }], "one hook, one mark, one exact reply");
  const manual = escalationPlugin([
    { before: { session: "ses_child", tool: "skill", callID: "s1", args: { name: "x" } } },
    { ask: { session: "ses_child", callID: "s1", permission: "skill", status: "deny", patterns: ["x"] } },
    { asked: { id: "per_s", session: "ses_child", callID: "s1", permission: "skill", fromAsk: 1 } },
  ], { rootMode: "manual" });
  assert.equal(manual.results[1].approval.kind, "operator");
  assert.deepEqual(manual.replies, [], "a manual root's judgment leaves it with the person");
});

test("call context: no cross-session or cross-call borrowing; an unrelated request cannot take a mark; expired eligibility stays human", () => {
  const { replies } = escalationPlugin([
    { before: { session: "ses_child", tool: "webfetch", callID: "w1", args: { url: "https://example.invalid" } } },
    { ask: { session: "ses_child", callID: "w2", permission: "webfetch", status: "deny", patterns: ["https://example.invalid"] } },
    { asked: { id: "per_call", session: "ses_child", callID: "w2", permission: "webfetch", fromAsk: 1 } },
    { ask: { session: "ses_sib", callID: "w1", permission: "webfetch", status: "deny", patterns: ["https://example.invalid"] } },
    { asked: { id: "per_sib", session: "ses_sib", callID: "w1", permission: "webfetch", fromAsk: 3 } },
    { ask: { session: "ses_child", callID: "w1", permission: "webfetch", status: "deny", patterns: ["https://example.invalid"] } },
    { asked: { id: "per_unrelated", session: "ses_child", callID: "w1", permission: "webfetch", kind: "operator", patterns: ["https://other.invalid"] } },
  ], { rootMode: "auto" });
  assert.deepEqual(replies, [], "no other call, session or request pattern can use w1's context or mark");
  const expired = escalationPlugin([
    { before: { session: "ses_child", tool: "webfetch", callID: "w1", args: { url: "https://example.invalid" } } },
    { advance: 11 * 60 * 1000 },
    { ask: { session: "ses_child", callID: "w1", permission: "webfetch", status: "deny", patterns: ["https://example.invalid"] } },
    { asked: { id: "per_old", session: "ses_child", callID: "w1", permission: "webfetch", fromAsk: 2 } },
  ], { rootMode: "auto" });
  assert.equal(expired.results[2].approval.kind, "operator");
  assert.deepEqual(expired.replies, [], "lost eligibility: the person answers");
});

test("call context: a stored context is validated even when native allows -- a replaced root, a failed root read or a capability failure denies", () => {
  for (const [label, change] of [
    ["inc_1 -> inc_2", { root: "inc_2" }],
    ["root read failure", { rootGetFails: true }],
    ["capability HTTP failure", { breakCapabilities: true }],
  ]) {
    const { results, log } = escalationPlugin([
      bashBefore("ses_child", "c1", "go test ./..."),
      change,
      { ask: { session: "ses_child", callID: "c1", permission: "bash", status: "allow", command: "go test ./...", preset: { forceAsk: false } } },
    ], { rootMode: "auto", classifier: "SAFE" });
    assert.equal(results[0].threw, null, label);
    assert.equal(results[2].status, "deny", label);
    assert.equal(results[2].threw, undefined, `${label}: denied, never rethrown`);
    assert.notEqual(results[2].forceAsk, true, label);
    assert.match(log, /escalation-error|escalation-stale/, label);
  }
});

// Measured, not estimated. Before the root-policy round the descendant call cost 3 probes and
// 1 root read (no hook validation of a null proposal; measured in the RED run). The
// root's one /api/session/ses_root read is its classifier profile lookup (infoFor), not a binding.
test("cost: one attended descendant bash call that meets no floor costs 4 capability probes and 2 root reads; a root's own call adds none", () => {
  const count = (calls) => ({
    capabilities: calls.filter(({ path }) => path === "/experimental/capabilities").length,
    rootReads: calls.filter(({ path }) => path === "/api/session/ses_root").length,
  });
  const child = escalationPlugin([
    bashBefore("ses_child", "c1", "go test ./..."),
    bashAsk("ses_child", "c1", "go test ./...", "allow"),
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.deepEqual(child.results[1], { status: "allow" });
  assert.deepEqual(count(child.calls), { capabilities: 4, rootReads: 2 });
  const root = escalationPlugin([
    bashBefore("ses_root", "c1", "go test ./..."),
    bashAsk("ses_root", "c1", "go test ./...", "ask"),
  ], { rootMode: "auto", classifier: "SAFE" });
  assert.deepEqual(count(root.calls), { capabilities: 2, rootReads: 1 }, "no binding capture or validation for a root's own call");
  const web = escalationPlugin([
    { before: { session: "ses_child", tool: "webfetch", callID: "w1", args: { url: "https://example.invalid" } } },
  ], { rootMode: "auto" });
  assert.deepEqual(count(web.calls), { capabilities: 2, rootReads: 1 }, "a non-deferrable descendant tool now captures its binding too");
});

test("root policy: a descendant's non-deferrable process tool throws for a ROOT deny its own rules allow (no native ask to route to)", () => {
  for (const rootMode of ["auto", "god"]) {
    const { results } = escalationPlugin([
      { before: { session: "ses_child", tool: "bg_run", callID: "c1", args: { command: "./deploy.sh" } } },
      { before: { session: "ses_child", tool: "pty_spawn", callID: "c2", args: { command: "./deploy.sh" } } },
      { before: { session: "ses_child", tool: "bg_run", callID: "c3", args: { command: "go test ./..." } } },
    ], { rootMode, rootAgent: "deployer", childAgent: "open", classifier: "SAFE" });
    assert.match(results[0].threw ?? "", /matches a deny rule in the opencode permission config/, `${rootMode} bg_run`);
    assert.match(results[1].threw ?? "", /matches a deny rule in the opencode permission config/, `${rootMode} pty_spawn`);
    assert.equal(results[2].threw, null, `${rootMode}: a command the root allows still runs`);
  }
});

test("god root: bg_run and pty_spawn named config denies stand aside as root policy (the non-deferrable gap is a descendants' gap)", () => {
  const { results } = escalationPlugin([
    { before: { session: "ses_root", tool: "bg_run", callID: "c1", args: { command: "git push --force origin x" } } },
    { before: { session: "ses_root", tool: "pty_spawn", callID: "c2", args: { command: "git", args: ["push", "--force", "origin", "x"] } } },
  ]);
  assert.equal(results[0].threw, null);
  assert.equal(results[1].threw, null);
});

test("static level on a capable host still routes native denies parent / human-once / deny with no classifier", () => {
  const god = escalationPlugin([
    bashBefore("ses_child", "c1", "./check-gates.sh"),
    bashAsk("ses_child", "c1", "./check-gates.sh", "deny"),
  ], { level: "static" });
  assertParent(god.results[1], /^native deny: bash$/, "god seat miss");
  assert.deepEqual(god.classified, []);
  const auto = escalationPlugin([
    bashBefore("ses_child", "c1", "git push --force origin x"),
    bashAsk("ses_child", "c1", "git push --force origin x", "allow"),
    bashBefore("ses_child", "c2", "./check-gates.sh"),
    bashAsk("ses_child", "c2", "./check-gates.sh", "deny"),
    { asked: { id: "per_st", session: "ses_child", callID: "c2", permission: "bash", command: "./check-gates.sh", fromAsk: 3 } },
  ], { level: "static", rootMode: "auto", childAgent: "open" });
  assert.equal(auto.results[1].approval.kind, "human-only");
  assert.equal(auto.results[3].approval.kind, "operator");
  assert.deepEqual(auto.replies, [], "static: no verdict, so the person answers");
  assert.deepEqual(auto.classified, []);
  const wild = escalationPlugin([
    bashBefore("ses_child", "c1", "make"),
    bashAsk("ses_child", "c1", "make", "allow"),
  ], { level: "static", rootMode: "auto", rootAgent: "lockdown", childAgent: "open" });
  assert.deepEqual(wild.results[1], { status: "deny" });
  assert.deepEqual(wild.classified, []);
});

test("a missing embedded transport stays an unknown authority failure: fail closed, never an old host", () => {
  const { results } = escalationPlugin([
    bashBefore("ses_child", "c1", "ls"),
    bashAsk("ses_child", "c2", "ls", "ask"),
    bashBefore("ses_root", "c3", "ls"),
  ], { transport: false });
  assert.match(results[0].threw ?? "", /embedded transport is unavailable/);
  assert.match(results[1].threw ?? "", /embedded transport is unavailable/);
  assert.deepEqual(results[1].output, { status: "ask" });
  assert.match(results[2].threw ?? "", /embedded transport is unavailable/);
});

// ---------------------------------------------------------------- broker binding (unit)

const brokerHost = ({ incarnations = true } = {}) => {
  let incarnation = "inc_1";
  const v2 = {
    experimental: { capabilities: { get: async () => ({ data: { permissionAuthority: 2, backgroundSubagents: true, ...(incarnations ? { sessionIncarnation: 1 } : {}) } }) } },
    v2: { session: { get: async ({ sessionID }) => ({ data: { id: sessionID, ...(incarnations ? { incarnationID: incarnation } : {}) } }) } },
  };
  const lifecycle = createRootLifecycle();
  const broker = createAuthorityBroker({
    v2, directory: "/work", lifecycle, rootMode: async () => "god",
    tree: { ancestry: async (id) => (id === "ses_child" ? ["ses_child", "ses_root"] : [id]) },
  });
  return { broker, lifecycle, replace: (next) => { incarnation = next; } };
};

test("captureRequestBinding binds the current root and assertRequestBinding refuses a replacement", async () => {
  const h = brokerHost();
  const binding = await h.broker.captureRequestBinding("ses_root");
  assert.equal(binding.sessionID, "ses_root");
  assert.equal(binding.incarnationID, "inc_1");
  await h.broker.assertRequestBinding(binding);
  h.replace("inc_2");
  await assert.rejects(h.broker.assertRequestBinding(binding), /permission authority unavailable/);
  const fresh = await h.broker.captureRequestBinding("ses_root");
  assert.equal(fresh.incarnationID, "inc_2", "a fresh request binds the replacement");
  await h.broker.assertRequestBinding(fresh);
  await assert.rejects(h.broker.assertRequestBinding(binding), /admission is closed|incarnation/, "the old binding is never adopted");
});

test("assertRequestBinding refuses an aborted root; an old host compares admission and existence only", async () => {
  const h = brokerHost();
  const binding = await h.broker.captureRequestBinding("ses_root");
  h.lifecycle.abort("ses_root", "inc_1");
  await assert.rejects(h.broker.assertRequestBinding(binding), /admission is closed/);
  const old = brokerHost({ incarnations: false });
  const plain = await old.broker.captureRequestBinding("ses_root");
  assert.equal(plain.incarnationID, undefined);
  old.replace("inc_2");
  await old.broker.assertRequestBinding(plain);
  old.lifecycle.abort("ses_root");
  await assert.rejects(old.broker.assertRequestBinding(plain), /admission is closed/);
});

test("rootContext output is unchanged by the binding API", async () => {
  const h = brokerHost();
  assert.deepEqual(await h.broker.rootContext("ses_child"), { rootSessionID: "ses_root", rootMode: "god", isRoot: false, beforeAsk: false });
});
