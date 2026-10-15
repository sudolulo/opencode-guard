import test from "node:test";
import assert from "node:assert/strict";
import { createAuthorityBroker, AUTHORITY_UNSUPPORTED } from "../lib/authority.js";
import { createRootLifecycle } from "../lib/lifecycle.js";
import { createOpencodeClient } from "/home/dev/.config/opencode/node_modules/@opencode-ai/sdk/dist/v2/client.js";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const v2Client = ({ capabilities = { permissionAuthority: 2, backgroundSubagents: true }, pending = [] } = {}) => {
  const calls = { promote: [], reply: [] };
  const session = { get: async ({ sessionID }) => ({ data: { id: sessionID } }) };
  return {
    calls,
    experimental: {
      capabilities: { get: async (request) => ({ data: capabilities, request }) },
      session: { background: async (request) => { calls.promote.push(request); return { data: {} }; } },
    },
    permission: {
      list: async (request) => ({ data: pending, request }),
      reply: async (request) => { calls.reply.push(request); return { data: {} }; },
    },
    session,
    v2: { session },
  };
};

const tree = {
  ancestry: async (sessionID) => ({ ses_root: ["ses_root"], ses_child: ["ses_child", "ses_root"], ses_other: ["ses_other"] })[sessionID],
};

test("a god root approves its child's current parent approval once", async () => {
  const pending = [{
    id: "per_child", sessionID: "ses_child", permission: "bash", patterns: ["npm run build"],
    metadata: { command: "npm run build", workdir: "/work" }, tool: { callID: "call_child" },
    approval: { kind: "parent", sessionID: "ses_root" }, always: [],
  }];
  const v2 = v2Client({ pending });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  const result = await broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" });

  assert.equal(result, "approved once");
  assert.deepEqual(v2.calls.reply, [{ requestID: "per_child", directory: "/work", reply: "once", message: undefined }]);
});

test("a god root rejects its child's current parent approval; native receives reply reject", async () => {
  const pending = [{
    id: "per_child", sessionID: "ses_child", permission: "bash", patterns: ["npm run build"],
    metadata: { command: "npm run build", workdir: "/work" }, tool: { callID: "call_child" },
    approval: { kind: "parent", sessionID: "ses_root" }, always: [],
  }];
  const v2 = v2Client({ pending });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  const result = await broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "reject" });

  assert.equal(result, "rejected");
  assert.equal(v2.calls.reply.length, 1);
  assert.equal(v2.calls.reply[0].requestID, "per_child");
  assert.equal(v2.calls.reply[0].reply, "reject");
});

test("a changed root mode escalates rather than approving a parent request", async () => {
  const pending = [{
    id: "per_child", sessionID: "ses_child", metadata: { command: "npm run build", workdir: "/work" },
    tool: { callID: "call_child" }, approval: { kind: "parent", sessionID: "ses_root" }, always: [],
  }];
  const v2 = v2Client({ pending });
  let modeReads = 0;
  const broker = createAuthorityBroker({
    v2, directory: "/work", tree,
    rootMode: () => (++modeReads === 1 ? "god" : "auto"),
  });

  await assert.rejects(
    broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }),
    /root is no longer in god mode/,
  );
  assert.deepEqual(v2.calls.reply, [{ requestID: "per_child", directory: "/work", reply: "escalate", message: undefined }]);
});

test("an already-auto root escalates its owned parent request instead of leaving it hidden", async () => {
  const v2 = v2Client({ pending: [{ id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } }] });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "auto" });
  await assert.rejects(broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), /operator escalation requested/);
  assert.deepEqual(v2.calls.reply, [{ requestID: "per_child", directory: "/work", reply: "escalate", message: undefined }]);
});

test("current validates ownership before escalating the exact queued request when god mode ends", async () => {
  const v2 = v2Client({ pending: [{ id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } }] });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "auto" });

  assert.equal(await broker.current({ sessionID: "ses_root", permissionID: "per_child" }), false);
  assert.deepEqual(v2.calls.reply, [{ requestID: "per_child", directory: "/work", reply: "escalate", message: undefined }]);
});

test("malformed root-self parent requests are absent from pending, current, and promotion", async () => {
  const request = { id: "per_self", sessionID: "ses_root", approval: { kind: "parent", sessionID: "ses_root" } };
  const v2 = v2Client({ pending: [request] });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  assert.deepEqual(await broker.pending({ sessionID: "ses_root" }), []);
  assert.equal(await broker.current({ sessionID: "ses_root", permissionID: "per_self" }), false);
  await assert.rejects(broker.observe(request), /cannot self-approve/);
  assert.deepEqual(v2.calls.promote, []);
  assert.deepEqual(v2.calls.reply, []);
});

test("a forged root-self parent request cannot be decided", async () => {
  const v2 = v2Client({ pending: [{ id: "per_self", sessionID: "ses_root", approval: { kind: "parent", sessionID: "ses_root" } }] });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
  await assert.rejects(broker.decide({ sessionID: "ses_root", permissionID: "per_self", decision: "once" }), /requester is the root/);
  assert.deepEqual(v2.calls.reply, []);
});

test("human-only and cross-root pending requests cannot be decided by a model tool", async () => {
  const pending = [{
    id: "per_hard", sessionID: "ses_child", metadata: { command: "rm -rf /tmp/x", workdir: "/work" },
    tool: { callID: "call_child" }, approval: { kind: "human-only", sessionID: "ses_root" }, always: [],
  }];
  const v2 = v2Client({ pending });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  await assert.rejects(
    broker.decide({ sessionID: "ses_root", permissionID: "per_hard", decision: "once" }),
    /human-only/,
  );
  await assert.rejects(
    broker.decide({ sessionID: "ses_other", permissionID: "per_hard", decision: "once" }),
    /human-only/,
  );
  assert.deepEqual(v2.calls.reply, []);
});

test("a root cannot decide a parent approval owned by another root", async () => {
  const v2 = v2Client({ pending: [{
    id: "per_other", sessionID: "ses_child", metadata: { command: "npm run build", workdir: "/work" },
    tool: { callID: "call_child" }, approval: { kind: "parent", sessionID: "ses_root" }, always: [],
  }] });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  await assert.rejects(
    broker.decide({ sessionID: "ses_other", permissionID: "per_other", decision: "once" }),
    /not owned by this root/,
  );
  assert.deepEqual(v2.calls.reply, []);
});

test("an old host without the authority capability fails closed before promotion", async () => {
  const v2 = v2Client({ capabilities: { backgroundSubagents: true } });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  await assert.rejects(
    broker.observe({ id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } }),
    /permissionAuthority: 2/,
  );
  assert.deepEqual(v2.calls.promote, []);
});

test("rootContext resolves root and mode on a v2 host and classifies v1 as an old host", async () => {
  const v2 = v2Client();
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
  assert.deepEqual(await broker.rootContext("ses_child"), { rootSessionID: "ses_root", rootMode: "god", isRoot: false, beforeAsk: false });
  assert.deepEqual(await broker.rootContext("ses_root"), { rootSessionID: "ses_root", rootMode: "god", isRoot: true, beforeAsk: false });
  assert.deepEqual(await broker.rootContext("ses_other"), { rootSessionID: "ses_other", rootMode: "god", isRoot: true, beforeAsk: false });
  for (const permissionAuthority of [1, undefined]) {
    const old = createAuthorityBroker({ v2: v2Client({ capabilities: { permissionAuthority, backgroundSubagents: true } }), directory: "/work", tree, rootMode: () => "god" });
    await assert.rejects(old.rootContext("ses_child"), (error) => error.code === AUTHORITY_UNSUPPORTED);
  }
  const odd = createAuthorityBroker({ v2: v2Client({ capabilities: { permissionAuthority: 3, backgroundSubagents: true } }), directory: "/work", tree, rootMode: () => "god" });
  await assert.rejects(odd.rootContext("ses_child"), (error) => error.code !== AUTHORITY_UNSUPPORTED);
});

test("availability checks the native bridge without converting an old-host denial to an allow", async () => {
  const v2 = v2Client({ capabilities: { backgroundSubagents: true } });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  await assert.rejects(broker.available(), /permissionAuthority: 2/);
});

test("an old host cannot settle a pending parent request through a root tool", async () => {
  const v2 = v2Client({
    capabilities: { backgroundSubagents: true },
    pending: [{ id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } }],
  });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });

  await assert.rejects(
    broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }),
    /permissionAuthority: 2/,
  );
  assert.deepEqual(v2.calls.reply, []);
});

test("the installed v2 SDK serializes permission authority calls with flat arguments", async () => {
  const requests = [];
  const v2 = createOpencodeClient({
    baseUrl: "http://opencode.invalid",
    fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push({ url: request.url, body: await request.text() });
      return new Response(JSON.stringify({ data: [] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });

  await v2.experimental.capabilities.get({ directory: "/work" });
  await v2.permission.list({ directory: "/work" });
  await v2.permission.reply({ requestID: "per_child", directory: "/work", reply: "escalate" });
  await v2.experimental.session.background({ sessionID: "ses_root", directory: "/work" });

  assert.deepEqual(requests, [
    { url: "http://opencode.invalid/experimental/capabilities?directory=%2Fwork", body: "" },
    { url: "http://opencode.invalid/permission?directory=%2Fwork", body: "" },
    { url: "http://opencode.invalid/permission/per_child/reply?directory=%2Fwork", body: '{"reply":"escalate"}' },
    { url: "http://opencode.invalid/experimental/session/ses_root/background?directory=%2Fwork", body: "" },
  ]);
});

test("native approval annotations bypass legacy replies and classifier work in the real plugin", () => {
  const home = mkdtempSync(join(tmpdir(), "guard-authority-plugin-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".local/share/opencode/modes/ses_root"), "god\n");
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const calls = [];
      const genericReplies = [];
      const classifierCalls = [];
      const pending = [
        { id: "per_child", sessionID: "ses_child", permission: "bash", approval: { kind: "parent", sessionID: "ses_root" }, metadata: { command: "pwd", workdir: "/work" } },
        { id: "per_human", sessionID: "ses_child", permission: "bash", approval: { kind: "human-only", sessionID: "ses_root" }, metadata: { command: "pwd", workdir: "/work" } },
        { id: "per_operator", sessionID: "ses_child", permission: "bash", approval: { kind: "operator", sessionID: "ses_root" }, metadata: { command: "rm -rf /tmp/risky", workdir: "/work" } },
      ];
      const fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push({ url: request.url, body: await request.text() });
        const path = new URL(request.url).pathname;
        if (path.endsWith("/experimental/capabilities")) return new Response(JSON.stringify({ permissionAuthority: 2, backgroundSubagents: true }), { headers: { "content-type": "application/json" } });
        if (path.endsWith("/permission")) return new Response(JSON.stringify(pending), { headers: { "content-type": "application/json" } });
        if (path === "/api/session/ses_root") return new Response(JSON.stringify({ id: "ses_root" }), { headers: { "content-type": "application/json" } });
        if (path === "/session/ses_child") return new Response(JSON.stringify({ id: "ses_child", parentID: "ses_root" }), { headers: { "content-type": "application/json" } });
        if (path === "/session/ses_root/message") return new Response(JSON.stringify([{ info: { role: "user", agent: "smart", model: { providerID: "openai", modelID: "gpt", variant: "fast" } } }]), { headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ data: {} }), { headers: { "content-type": "application/json" } });
      };
      const client = { session: {
        _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch, headers: new Headers() }) },
        get: async ({ path }) => ({ data: path.id === "ses_child" ? { id: path.id, parentID: "ses_root" } : { id: path.id } }),
        status: async () => ({ data: { ses_root: { type: "busy" }, ses_child: { type: "busy" } } }),
        create: async (request) => { classifierCalls.push({ method: "create", request }); return { data: { id: "ses_classifier" } }; },
        prompt: async (request) => { classifierCalls.push({ method: "prompt", request }); return { data: { parts: [{ type: "text", text: "SAFE" }] } }; },
      }, postSessionIdPermissionsPermissionId: async (request) => { genericReplies.push(request); return {}; }, app: { log: async () => {} } };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      await hooks.event({ event: { type: "permission.asked", properties: pending[0] } });
      const afterParent = { genericReplies: genericReplies.length, classifierCalls: classifierCalls.length };
      await hooks.event({ event: { type: "permission.asked", properties: {
        id: "per_human", sessionID: "ses_child", permission: "bash",
        approval: { kind: "human-only", sessionID: "ses_root" },
        metadata: { command: "pwd", workdir: "/work" },
      } } });
      const afterHuman = { genericReplies: genericReplies.length, classifierCalls: classifierCalls.length };
      await hooks.event({ event: { type: "permission.asked", properties: {
        id: "per_operator", sessionID: "ses_child", permission: "bash",
        approval: { kind: "operator", sessionID: "ses_root" },
        metadata: { command: "rm -rf /tmp/risky", workdir: "/work" },
      } } });
      const afterOperator = { genericReplies: genericReplies.length, classifierCalls: classifierCalls.length };
      process.stdout.write(JSON.stringify({ calls, genericReplies, classifierCalls, afterParent, afterHuman, afterOperator, pendingIDs: pending.map(({ id }) => id) }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    const { calls, genericReplies, classifierCalls, afterParent, afterHuman, afterOperator, pendingIDs } = JSON.parse(child.stdout);
    assert.ok(calls.some((call) => call.url.includes("/experimental/session/ses_root/background")));
    const wake = calls.find((call) => call.url.includes("/session/ses_root/prompt_async"));
    assert.ok(wake, JSON.stringify(calls));
    assert.match(wake.body, /"agent":"smart"/);
    assert.match(wake.body, /"modelID":"gpt"/);
    assert.equal(JSON.parse(wake.body).variant, "fast", "root variant must survive identity lookup and prompt serialization");
    assert.deepEqual(genericReplies, [], "parent, human-only, and operator annotations never use legacy replies");
    assert.deepEqual(classifierCalls, [], "approval annotations never create or prompt a classifier session");
    assert.deepEqual(afterParent, { genericReplies: 0, classifierCalls: 0 }, "parent SAFE bypasses legacy replies and classifiers");
    assert.deepEqual(afterHuman, { genericReplies: 0, classifierCalls: 0 }, "human-only bypasses legacy replies and classifiers");
    assert.deepEqual(afterOperator, { genericReplies: 0, classifierCalls: 0 }, "operator RISKY stays pending without legacy replies or classifiers");
    assert.ok(pendingIDs.includes("per_operator"), "the operator RISKY request remains native-pending");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("plugin lifecycle events fence late approval wakeups until a real root user message", () => {
  const home = mkdtempSync(join(tmpdir(), "guard-authority-lifecycle-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".local/share/opencode/modes/ses_root"), "god\n");
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const pending = [];
      const calls = [];
      const fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push(request.url);
        const path = new URL(request.url).pathname;
        if (path.endsWith("/experimental/capabilities")) return new Response(JSON.stringify({ permissionAuthority: 2, backgroundSubagents: true }), { headers: { "content-type": "application/json" } });
        if (path.endsWith("/permission")) return new Response(JSON.stringify(pending), { headers: { "content-type": "application/json" } });
        if (path === "/api/session/ses_root") return new Response(JSON.stringify({ id: "ses_root" }), { headers: { "content-type": "application/json" } });
        if (path === "/session/ses_root/message") return new Response(JSON.stringify([{ info: { role: "user", agent: "smart", model: { providerID: "openai", modelID: "gpt" } } }]), { headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ data: {} }), { headers: { "content-type": "application/json" } });
      };
      const client = { session: {
        _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch, headers: new Headers() }) },
        get: async ({ path }) => ({ data: path.id === "ses_child" ? { id: path.id, parentID: "ses_root" } : { id: path.id } }),
        status: async () => ({ data: {} }),
      }, app: { log: async () => {} } };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const ask = async (id) => {
        const request = { id, sessionID: "ses_child", permission: "bash", approval: { kind: "parent", sessionID: "ses_root" } };
        pending.splice(0, pending.length, request);
        await hooks.event({ event: { type: "permission.asked", properties: request } });
      };
      await hooks.event({ event: { type: "session.aborted", properties: { sessionID: "ses_root" } } });
      await ask("per_after_abort");
      await hooks["chat.message"]({ sessionID: "ses_child" }, { message: { role: "user" }, parts: [{ type: "text", text: "workflow start" }] });
      await ask("per_after_child_user");
      const syntheticRejected = await hooks["chat.message"]({ sessionID: "ses_root" }, { message: { role: "user" }, parts: [{ type: "text", text: "notice", synthetic: true }] }).then(() => false, () => true);
      if (!syntheticRejected) throw new Error("synthetic prompt was admitted while root closed");
      await ask("per_after_synthetic");
      await hooks["chat.message"]({ sessionID: "ses_root" }, { message: { role: "user" }, parts: [{ type: "text", text: "continue" }] });
      await ask("per_after_user");
      process.stdout.write(JSON.stringify(calls.filter((url) => url.includes("/prompt_async")).length));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout), 1, "only explicit non-synthetic root input reopens admission");
  } finally { rmSync(home, { recursive: true, force: true }); }
});

// Incarnation-bound events (docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md
// section 5) through the real plugin event handler on a host advertising sessionIncarnation: 1.
const incarnationPlugin = (events) => {
  const home = mkdtempSync(join(tmpdir(), "guard-authority-incarnation-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".local/share/opencode/modes/ses_root"), "god\n");
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const pending = [];
      const calls = [];
      const fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push(request.url);
        const path = new URL(request.url).pathname;
        if (path.endsWith("/experimental/capabilities")) return new Response(JSON.stringify({ permissionAuthority: 2, backgroundSubagents: true, sessionIncarnation: 1 }), { headers: { "content-type": "application/json" } });
        if (path.endsWith("/permission")) return new Response(JSON.stringify(pending), { headers: { "content-type": "application/json" } });
        if (path === "/api/session/ses_root") return new Response(JSON.stringify({ id: "ses_root", incarnationID: "inc_2" }), { headers: { "content-type": "application/json" } });
        if (path === "/session/ses_root/message") return new Response(JSON.stringify([{ info: { role: "user", agent: "smart", model: { providerID: "openai", modelID: "gpt" } } }]), { headers: { "content-type": "application/json" } });
        return new Response(JSON.stringify({ data: {} }), { headers: { "content-type": "application/json" } });
      };
      const client = { session: {
        _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch, headers: new Headers() }) },
        get: async ({ path }) => ({ data: path.id === "ses_child" ? { id: path.id, parentID: "ses_root" } : { id: path.id } }),
        status: async () => ({ data: {} }),
      }, app: { log: async () => {} } };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const ask = async (id) => {
        const request = { id, sessionID: "ses_child", permission: "bash", approval: { kind: "parent", sessionID: "ses_root" } };
        pending.splice(0, pending.length, request);
        await hooks.event({ event: { type: "permission.asked", properties: request } });
      };
      await ask("per_first");
      for (const event of ${JSON.stringify(events)}) await hooks.event({ event });
      await ask("per_second");
      process.stdout.write(JSON.stringify(calls.filter((url) => url.includes("/prompt_async")).length));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    let log = "";
    try { log = readFileSync(join(home, ".local/share/opencode/autoclass.log"), "utf8"); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    return { wakes: JSON.parse(child.stdout), log };
  } finally { rmSync(home, { recursive: true, force: true }); }
};

test("plugin: a delayed inc1 abort leaves the inc2 root's admission open", () => {
  const { wakes, log } = incarnationPlugin([{ type: "session.aborted", properties: { sessionID: "ses_root", incarnationID: "inc_1" } }]);
  assert.equal(wakes, 2, "the replacement root is still woken for its child's request");
  assert.doesNotMatch(log, /carries no incarnationID/);
});

// Deletion removes the record on an incarnation host, so this pair also passed before
// the fix; it pins that a delayed delete after a delayed abort stays harmless.
test("plugin: a delayed inc1 abort and delete leave the inc2 root's admission open", () => {
  const { wakes } = incarnationPlugin([
    { type: "session.aborted", properties: { sessionID: "ses_root", incarnationID: "inc_1" } },
    { type: "session.deleted", properties: { info: { id: "ses_root", incarnationID: "inc_1" } } },
  ]);
  assert.equal(wakes, 2, "the replacement root is still woken for its child's request");
});

test("plugin: a matching abort still fences the root's admission", () => {
  const { wakes } = incarnationPlugin([{ type: "session.aborted", properties: { sessionID: "ses_root", incarnationID: "inc_2" } }]);
  assert.equal(wakes, 1);
});

test("plugin: an ID-only abort on an incarnation host closes admission fail-closed and is logged", () => {
  const { wakes, log } = incarnationPlugin([{ type: "session.aborted", properties: { sessionID: "ses_root" } }]);
  assert.equal(wakes, 1);
  assert.match(log, /session\.aborted for ses_root carries no incarnationID/);
});

// The real plugin against an incarnation host whose root can be replaced under the
// same ID mid-script. Steps: { ask: id } raises a child's parent permission.asked,
// { root: incarnationID } replaces the root, { event } delivers a native event.
const incarnationPluginSteps = (steps) => {
  const home = mkdtempSync(join(tmpdir(), "guard-authority-steps-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".local/share/opencode/modes/ses_root"), "god\n");
    const script = `
      const pending = [];
      const calls = [];
      let rootIncarnation = "inc_1";
      let hooks, duringEvent;
      const json = (data) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
      const fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        calls.push(request.url);
        const path = new URL(request.url).pathname;
        // { ask, during } delivers \`during\` after permission.asked tracked the root
        // and before observe's authoritative root read binds it.
        if (path.endsWith("/experimental/capabilities") && duringEvent) {
          const event = duringEvent;
          duringEvent = undefined;
          await hooks.event({ event });
        }
        if (path.endsWith("/experimental/capabilities")) return json({ permissionAuthority: 2, backgroundSubagents: true, sessionIncarnation: 1 });
        if (path.endsWith("/permission")) return json(pending);
        if (path === "/api/session/ses_root") return json({ id: "ses_root", incarnationID: rootIncarnation });
        if (path === "/session/ses_root/message") return json([{ info: { role: "user", agent: "smart", model: { providerID: "openai", modelID: "gpt" } } }]);
        return json({ data: {} });
      };
      const client = { session: {
        _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch, headers: new Headers() }) },
        get: async ({ path }) => ({ data: path.id === "ses_child" || path.id.startsWith("ses_kid") ? { id: path.id, parentID: "ses_root" } : { id: path.id } }),
        status: async () => ({ data: {} }),
      }, app: { log: async () => {} } };
      const { OpencodeGuard } = await import(${JSON.stringify(new URL("../plugin.js", import.meta.url).href)});
      hooks = await OpencodeGuard({ client, directory: "/work" });
      for (const step of ${JSON.stringify(steps)}) {
        if (step.root) rootIncarnation = step.root;
        // { propose: sessionID } runs that session's permission.ask hook, which reads
        // its ancestry (as any child asking for a permission does).
        if (step.propose) await hooks["permission.ask"]({ sessionID: step.propose, permission: "bash", metadata: {} }, {});
        if (step.event) await hooks.event({ event: step.event });
        if (step.ask) {
          duringEvent = step.during;
          const request = { id: step.ask, sessionID: "ses_child", permission: "bash", approval: { kind: "parent", sessionID: "ses_root" } };
          pending.splice(0, pending.length, request);
          await hooks.event({ event: { type: "permission.asked", properties: request } });
        }
      }
      process.stdout.write(JSON.stringify(calls.filter((url) => url.includes("/prompt_async")).length));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(child.status, 0, child.stderr);
    return JSON.parse(child.stdout);
  } finally { rmSync(home, { recursive: true, force: true }); }
};

test("plugin: a delayed inc1 abort after inc1's deletion does not strand the inc2 child's request", () => {
  const wakes = incarnationPluginSteps([
    { ask: "per_first" },
    { event: { type: "session.deleted", properties: { info: { id: "ses_root", incarnationID: "inc_1" } } } },
    { root: "inc_2" },
    { event: { type: "session.aborted", properties: { sessionID: "ses_root", incarnationID: "inc_1" } } },
    { ask: "per_second" },
  ]);
  assert.equal(wakes, 2, "the replacement root is woken for its child's request");
});

const abortedEvent = (incarnationID) => ({ type: "session.aborted", properties: { sessionID: "ses_root", incarnationID } });
const deletedEvent = (incarnationID) => ({ type: "session.deleted", properties: { info: { id: "ses_root", incarnationID } } });

test("plugin: a delayed inc1 abort before any authority call does not strand the inc2 child's request", () => {
  assert.equal(incarnationPluginSteps([{ event: abortedEvent("inc_1") }, { root: "inc_2" }, { ask: "per_first" }]), 1,
    "the event identity proves the capability, so the abort is tombstoned, not applied to inc2");
});

test("plugin: a genuine abort before any authority call still fences its own incarnation", () => {
  assert.equal(incarnationPluginSteps([{ event: abortedEvent("inc_1") }, { ask: "per_first" }]), 0);
});

test("plugin: aborts of many known children do not evict a genuinely aborted root's fence", () => {
  const steps = [{ event: abortedEvent("inc_1") }];
  for (let i = 0; i < 300; i += 1) {
    steps.push({ propose: `ses_kid_${i}`, event: { type: "session.aborted", properties: { sessionID: `ses_kid_${i}`, incarnationID: `inc_kid_${i}` } } });
  }
  steps.push({ ask: "per_first" });
  assert.equal(incarnationPluginSteps(steps), 0, "the root's inc_1 abort still fences its own incarnation");
});

test("plugin: a delayed inc1 delete between track and bind does not strand the inc2 child's request", () => {
  assert.equal(incarnationPluginSteps([{ root: "inc_2" }, { ask: "per_first", during: deletedEvent("inc_1") }]), 1);
});

test("plugin: a genuine delete between track and bind still fences its own incarnation", () => {
  assert.equal(incarnationPluginSteps([{ ask: "per_first", during: deletedEvent("inc_1") }]), 0);
});

test("plugin: a root replaced without any event still wakes for its child's request with the fresh admission", () => {
  const wakes = incarnationPluginSteps([{ ask: "per_first" }, { root: "inc_2" }, { ask: "per_second" }]);
  assert.equal(wakes, 2, "observe re-admits and the wake uses the replacement's admission, not the closed one");
});

// A Node-only fake host: real plugin + installed SDK serialization, no provider,
// OpenCode process, or agent launch. The transport exposes deterministic barriers.
const pluginRace = (scenario, mode = "god") => {
  const home = mkdtempSync(join(tmpdir(), "guard-authority-race-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".local/share/opencode/modes/ses_root"), `${mode}\n`);
    const script = `
      import assert from "node:assert/strict";
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      const calls = [], errors = [];
      const pending = [{ id: "per_child", sessionID: "ses_child", permission: "bash", approval: { kind: "parent", sessionID: "ses_root" } }];
      let hooks, onModeRead, onFetch;
      const readFileSync = fs.readFileSync;
      fs.readFileSync = function(path, ...args) {
        const value = readFileSync.call(this, path, ...args);
        if (String(path).endsWith("/modes/ses_root")) onModeRead?.();
        return value;
      };
      syncBuiltinESMExports();
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      const fetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const path = new URL(request.url).pathname;
        calls.push({ path, body: await request.clone().text() });
        const intercepted = await onFetch?.(path, request);
        if (intercepted) return intercepted;
        if (path === "/experimental/capabilities") return json({ permissionAuthority: 2, backgroundSubagents: true });
        if (path === "/permission") return json(pending);
        if (path === "/session/ses_root/message") return json([{ info: { role: "user", agent: "smart", model: { providerID: "openai", modelID: "gpt", variant: "fast" } } }]);
        if (path === "/api/session/ses_child" || path === "/session/ses_child") return json({ id: "ses_child", parentID: "ses_root" });
        return json({ id: "ses_root" });
      };
      const client = { session: {
        _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch, headers: new Headers() }) },
        get: async ({ path }) => ({ data: path.id === "ses_child" ? { id: path.id, parentID: "ses_root" } : { id: path.id } }),
        status: async () => ({ data: {} }),
      }, app: { log: async (entry) => errors.push(entry) } };
      const { OpencodeGuard } = await import(${JSON.stringify(new URL("../plugin.js", import.meta.url).href)});
      hooks = await OpencodeGuard({ client, directory: "/work" });
      const event = (type, properties) => hooks.event({ event: { type, properties } });
      const ask = () => event("permission.asked", pending[0]);
      const promotions = () => calls.filter(({ path }) => path.endsWith("/background"));
      const prompts = () => calls.filter(({ path }) => path.endsWith("/prompt_async"));
      ${scenario}
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "" }, encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(home, { recursive: true, force: true }); }
};

test("actual plugin fences abort synchronously before a concurrent observe mode continuation", () => {
  pluginRace(`
    let closing;
    onModeRead = () => { onModeRead = undefined; queueMicrotask(() => { closing = event("session.aborted", { sessionID: "ses_root" }); }); };
    await ask();
    await closing;
    assert.equal(promotions().length, 0, "abort must fence before the legacy notifier yields");
    assert.equal(prompts().length, 0);
  `);
});

test("actual plugin retains deleted closure while GET is still 200 and pending remains listable", () => {
  pluginRace(`
    await event("session.deleted", { info: { id: "ses_root" } });
    await ask();
    assert.equal(promotions().length, 0, "a deleted root cannot be recreated OPEN by a late ask");
    assert.equal(prompts().length, 0);
  `);
});

// Session incarnations: the host fakes `sessionIncarnation: 1` and a root row whose
// incarnation the scenario can change to model a same-ID recreate.
const INCARNATION_HOST_FETCH = `
  let incarnation = "inc_1";
  const incarnationHost = async (path) => {
    if (path === "/experimental/capabilities") return json({ permissionAuthority: 2, backgroundSubagents: true, sessionIncarnation: 1 });
    if (path === "/api/session/ses_root") return json({ id: "ses_root", incarnationID: incarnation });
  };
`;

test("actual plugin drops a wake bound to an old incarnation when the root is recreated under the same ID", () => {
  pluginRace(`
    ${INCARNATION_HOST_FETCH}
    onFetch = async (path) => {
      // No session.deleted reaches this guard (another host or a reload): only the
      // bound incarnation can tell the recreated root apart.
      if (path.endsWith("/background")) { incarnation = "inc_2"; return json(true); }
      return incarnationHost(path);
    };
    await ask();
    assert.equal(promotions().length, 1);
    assert.equal(prompts().length, 0, "the wake bound to inc_1 must not prompt the recreated root");
  `);
});

test("actual plugin admits a same-ID recreate after deletion on an incarnation host", () => {
  pluginRace(`
    ${INCARNATION_HOST_FETCH}
    onFetch = incarnationHost;
    await ask();
    assert.equal(prompts().length, 1);
    await event("session.deleted", { info: { id: "ses_root" } });
    incarnation = "inc_2";
    await ask();
    assert.equal(promotions().length, 2, "the old deleted record must not block the new incarnation");
    assert.equal(prompts().length, 2);
  `);
});

test("old host: actual plugin still wakes a root whose GET changes underneath, as before", () => {
  pluginRace(`
    let incarnation = "inc_1";
    onFetch = async (path) => {
      if (path === "/api/session/ses_root") return json({ id: "ses_root", incarnationID: incarnation });
      if (path.endsWith("/background")) { incarnation = "inc_2"; return json(true); }
    };
    await ask();
    assert.equal(promotions().length, 1);
    assert.equal(prompts().length, 1, "without the capability incarnations are never compared");
  `);
});

test("actual plugin retries a failed initial non-god escalation without waiting for root idle", () => {
  pluginRace(`
    let replies = 0;
    onFetch = async (path) => {
      if (path !== "/permission/per_child/reply") return;
      if (++replies === 1) return json({ name: "Unavailable" }, 503);
      pending[0].approval.kind = "operator";
      return json(true);
    };
    await ask().catch((error) => errors.push(error));
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(replies, 2, "failed observe-stage escalation needs its own bounded retry, not root idle");
    assert.equal(pending[0].approval.kind, "operator");
    assert.equal(promotions().length, 0);
    assert.equal(prompts().length, 0);
    assert.ok(calls.filter(({ path }) => path.endsWith("/reply")).every(({ body }) => JSON.parse(body).reply === "escalate"));
  `, "auto");
});

test("actual plugin retries failed pre-send mode-change escalation without sending the queued wake", () => {
  pluginRace(`
    let replies = 0;
    onFetch = async (path) => {
      if (path === "/session/ses_root/message") fs.writeFileSync(process.env.HOME + "/.local/share/opencode/modes/ses_root", "auto");
      if (path !== "/permission/per_child/reply") return;
      if (++replies === 1) return json({ name: "Unavailable" }, 503);
      pending[0].approval.kind = "operator";
      return json(true);
    };
    await ask();
    assert.equal(prompts().length, 0);
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(replies, 2);
    assert.equal(pending[0].approval.kind, "operator");
    assert.equal(prompts().length, 0);
  `);
});

test("actual plugin cancels failed escalation retry synchronously when root aborts", () => {
  pluginRace(`
    let replies = 0;
    onFetch = async (path) => {
      if (path !== "/permission/per_child/reply") return;
      replies += 1;
      return json({ name: "Unavailable" }, 503);
    };
    await ask();
    const stopping = event("session.aborted", { sessionID: "ses_root" });
    await event("session.idle", { sessionID: "ses_root" });
    await stopping;
    await new Promise((resolve) => setTimeout(resolve, 350));
    assert.equal(replies, 1);
    assert.equal(promotions().length, 0);
    assert.equal(prompts().length, 0);
  `, "auto");
});

test("actual plugin refuses a synthetic prompt arriving after abort at the host chat admission hook", () => {
  pluginRace(`
    let rejected = false;
    onFetch = async (path) => {
      if (!path.endsWith("/prompt_async")) return;
      await event("session.aborted", { sessionID: "ses_root" });
      try {
        await hooks["chat.message"]({ sessionID: "ses_root" }, { parts: [{ type: "text", text: "pending", synthetic: true }] });
      } catch { rejected = true; }
      return json(true);
    };
    await ask();
    assert.equal(rejected, true, "late host admission must throw rather than silently decline resume");
    await hooks["chat.message"]({ sessionID: "ses_root" }, { parts: [{ type: "text", text: "continue" }] });
  `);
});

test("actual plugin never transfers an old observation into a resumed root's new wake token", () => {
  pluginRace(`
    onFetch = async (path) => {
      if (!path.endsWith("/background")) return;
      await event("session.aborted", { sessionID: "ses_root" });
      await hooks["chat.message"]({ sessionID: "ses_root" }, { parts: [{ type: "text", text: "continue" }] });
      return json(true);
    };
    await ask();
    assert.equal(prompts().length, 0, "promotion response belongs to the old observation, not the resumed turn");
  `);
});

test("guard_pending excludes child operator and human-only requests", async () => {
  const v2 = v2Client({ pending: ["parent", "operator", "human-only"].map((kind) => ({
    id: `per_${kind}`, sessionID: "ses_child", approval: { kind, sessionID: "ses_root" },
  })) });
  const broker = createAuthorityBroker({ v2, tree, rootMode: () => "god" });
  assert.deepEqual((await broker.pending({ sessionID: "ses_root" })).map(({ id }) => id), ["per_parent"]);
});

test("observe captured before abort cannot promote even after a real user resumes the root", async () => {
  const request = { id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } };
  const v2 = v2Client({ pending: [request] });
  const lifecycle = createRootLifecycle();
  let release, reached;
  const waiting = new Promise((resolve) => { reached = resolve; });
  const broker = createAuthorityBroker({ v2, tree, lifecycle, rootMode: () => new Promise((resolve) => { release = resolve; reached(); }) });
  const observing = broker.observe(request);
  await waiting;
  lifecycle.abort("ses_root");
  lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  release("god");
  await observing;
  assert.deepEqual(v2.calls.promote, [], "the old observation must not acquire the new admission token");
});

test("observe and current use fresh nested SDK root GET and never treat transport failure as absence", async () => {
  const request = { id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } };
  const v2 = v2Client({ pending: [request] });
  const lifecycle = createRootLifecycle();
  let reads = 0;
  v2.session = { get: async () => { throw new Error("legacy root GET is not authoritative"); } };
  v2.v2.session.get = async () => { reads += 1; return { error: { name: "NotFound" }, response: { status: 404 } }; };
  const broker = createAuthorityBroker({ v2, tree, lifecycle, rootMode: () => "god" });
  assert.equal(await broker.observe(request), undefined);
  assert.equal(await broker.current({ sessionID: "ses_root", permissionID: request.id }), false);
  assert.equal(reads, 2, "cached ancestry cannot substitute for fresh existence reads");
  lifecycle.deleted("ses_root");
  v2.v2.session.get = async () => ({ error: { name: "Unavailable" }, response: { status: 503 } });
  await assert.rejects(broker.observe(request), /503/);
  assert.equal(lifecycle.has("ses_root"), true, "failed transport must not reclaim the closed record");
  assert.deepEqual(v2.calls.promote, []);
});

const retryFixture = (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const request = { id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } };
  const pending = [request];
  const v2 = v2Client({ pending });
  const lifecycle = createRootLifecycle();
  const errors = [], replies = [];
  let fail = true, mode = "auto";
  v2.permission.reply = async (input) => {
    replies.push(input);
    if (fail) throw new Error("temporary escalation failure");
    request.approval.kind = "operator";
  };
  const broker = createAuthorityBroker({ v2, tree, lifecycle, rootMode: () => mode, onError: (error) => errors.push(error.message) });
  t.after(() => broker.dispose());
  const tick = async (ms) => { t.mock.timers.tick(ms); await new Promise(setImmediate); };
  return { broker, v2, lifecycle, request, pending, replies, errors, tick, recover: () => { fail = false; }, god: () => { mode = "god"; } };
};

test("failed escalations retry three times, log exhaustion, and then wait for owned native events", async (t) => {
  const f = retryFixture(t);
  await f.broker.observe(f.request);
  assert.equal(f.replies.length, 1);
  for (const delay of [100, 500, 2000]) await f.tick(delay);
  assert.equal(f.replies.length, 4);
  assert.equal(f.errors.filter((error) => error.includes("exhausted 3 automatic retries")).length, 1);
  await f.tick(100000);
  assert.equal(f.replies.length, 4, "no endless polling after exhaustion");
  f.god();
  f.recover();
  f.broker.onEvent({ type: "session.idle", properties: { sessionID: "ses_root" } });
  await f.tick(0);
  assert.equal(f.replies.length, 5);
  assert.ok(f.replies.every(({ requestID, reply }) => requestID === "per_child" && reply === "escalate"));
  assert.equal(f.request.approval.kind, "operator");
  assert.deepEqual(f.v2.calls.promote, [], "retry never changes an escalation intent into promotion");
  await f.tick(100000);
  assert.equal(f.replies.length, 5, "success disposes the owned retry timer");
});

for (const closedEvent of ["session.aborted", "session.deleted", "permission.replied"]) {
  test(`failed escalation is dropped synchronously on ${closedEvent}`, async (t) => {
    const f = retryFixture(t);
    await f.broker.observe(f.request);
    f.broker.onEvent({ type: closedEvent, properties: { sessionID: "ses_root", requestID: "per_child" } });
    await f.tick(100000);
    assert.equal(f.replies.length, 1);
    assert.deepEqual(f.v2.calls.promote, []);
  });
}

for (const change of ["stale", "operator", "cross-root", "root-self", "missing"]) {
  test(`failed escalation retry drops a freshly ${change} request`, async (t) => {
    const f = retryFixture(t);
    await f.broker.observe(f.request);
    if (change === "stale") f.pending.splice(0);
    if (change === "operator") f.request.approval.kind = "operator";
    if (change === "cross-root") f.request.approval.sessionID = "ses_other";
    if (change === "root-self") f.request.sessionID = "ses_root";
    if (change === "missing") f.v2.v2.session.get = async () => ({ error: {}, response: { status: 404 } });
    await f.tick(100);
    await f.tick(100000);
    assert.equal(f.replies.length, 1);
  });
}

test("current owns failed mode-change escalation and abort invalidates a retry paused on fresh GET", async (t) => {
  const f = retryFixture(t);
  assert.equal(await f.broker.current({ sessionID: "ses_root", permissionID: "per_child" }), false);
  let release;
  f.v2.v2.session.get = () => new Promise((resolve) => { release = resolve; });
  await f.tick(100);
  assert.equal(typeof release, "function");
  f.lifecycle.abort("ses_root");
  f.broker.onEvent({ type: "session.aborted", properties: { sessionID: "ses_root" } });
  f.lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  release({ data: { id: "ses_root" } });
  await f.tick(100000);
  assert.equal(f.replies.length, 1, "an old retry cannot use a resumed root's new token");
});

const deferredToolFixture = (phase, mode = "god") => {
  const request = { id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } };
  const v2 = v2Client({ pending: [request] });
  const lifecycle = createRootLifecycle();
  let reached, release;
  const waiting = new Promise((resolve) => { reached = resolve; });
  const barrier = new Promise((resolve) => { release = resolve; });
  let paused = false, modeReads = 0, existenceReads = 0;
  const pause = async (here) => {
    if (here !== phase || paused) return;
    paused = true;
    reached();
    await barrier;
  };
  const getCapabilities = v2.experimental.capabilities.get;
  v2.experimental.capabilities.get = async (...args) => { await pause("capabilities"); return getCapabilities(...args); };
  const list = v2.permission.list;
  v2.permission.list = async (...args) => { await pause("pending"); return list(...args); };
  const getRoot = v2.v2.session.get;
  v2.v2.session.get = async (...args) => { await pause(++existenceReads === 1 ? "initial existence" : "final existence"); return getRoot(...args); };
  const broker = createAuthorityBroker({
    v2, lifecycle,
    tree: { ancestry: async (id) => { await pause(id === "ses_root" ? "root ancestry" : "child ancestry"); return tree.ancestry(id); } },
    rootMode: async () => { await pause(++modeReads === 1 ? "initial mode" : "final mode"); return mode; },
  });
  const close = (kind) => {
    if (kind === "delete") lifecycle.deleted("ses_root");
    else lifecycle.abort("ses_root");
    if (kind === "abort/resume") lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  };
  return { v2, broker, lifecycle, waiting, release, close };
};

for (const [phase, decision, fence, mode = "god"] of [
  ["capabilities", "once", "abort"],
  ["root ancestry", "reject", "abort"],
  ["initial existence", "once", "abort/resume"],
  ["initial mode", "once", "abort/resume"],
  ["pending", "reject", "delete"],
  ["child ancestry", "once", "abort"],
  ["final existence", "reject", "delete"],
  ["final mode", "reject", "abort/resume"],
  ["final mode", "once", "abort", "auto"],
]) {
  test(`guard_decide ${decision}/${mode} paused at ${phase} cannot outlive ${fence}`, async () => {
    const f = deferredToolFixture(phase, mode);
    const deciding = f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision }).then(
      (value) => ({ value }), (error) => ({ error }),
    );
    await f.waiting;
    f.close(fence);
    f.release();
    const result = await deciding;
    assert.deepEqual(f.v2.calls.reply, [], "no grant, rejection, or escalation from the old admission");
    assert.match(result.error?.message ?? "", /admission is closed/);
    f.broker.dispose();
  });
}

for (const [phase, fence] of [
  ["capabilities", "abort"], ["root ancestry", "delete"], ["initial mode", "abort/resume"],
  ["pending", "abort"], ["child ancestry", "abort/resume"],
  ["initial existence", "abort"], ["final existence", "delete"], ["final mode", "abort/resume"],
]) {
  test(`guard_pending paused at ${phase} cannot return an actionable list after ${fence}`, async () => {
    const f = deferredToolFixture(phase);
    const listing = f.broker.pending({ sessionID: "ses_root" }).then((value) => ({ value }), (error) => ({ error }));
    await f.waiting;
    f.close(fence);
    f.release();
    const result = await listing;
    assert.equal(result.value, undefined, "an obsolete tool call cannot present actionable approvals");
    assert.match(result.error?.message ?? "", /admission is closed/);
    assert.deepEqual(f.v2.calls.reply, []);
    f.broker.dispose();
  });
}

test("root tools reject deleted roots even with GET 200, and reject fresh authoritative missing roots", async () => {
  const f = deferredToolFixture("unused");
  f.lifecycle.deleted("ses_root");
  const decide = () => f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" });
  await assert.rejects(decide(), /admission is closed/);
  await assert.rejects(f.broker.pending({ sessionID: "ses_root" }), /admission is closed/);
  assert.deepEqual(f.v2.calls.reply, []);
  const missing = deferredToolFixture("unused");
  missing.v2.v2.session.get = async () => ({ error: {}, response: { status: 404 } });
  await assert.rejects(missing.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "reject" }), /does not exist/);
  await assert.rejects(missing.broker.pending({ sessionID: "ses_root" }), /does not exist/);
  assert.deepEqual(missing.v2.calls.reply, []);
});

test("fresh root tools work after a real root user continuation has reopened admission", async () => {
  const f = deferredToolFixture("unused");
  f.lifecycle.abort("ses_root");
  assert.equal(await f.broker.resume({ sessionID: "ses_root", parts: [{ type: "text", text: "continue" }] }), true);
  assert.equal((await f.broker.pending({ sessionID: "ses_root" })).length, 1);
  assert.equal(await f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), "approved once");
  assert.equal(f.v2.calls.reply.length, 1);
});

test("guard_decide retains failed direct escalation and retries escalate even if root returns god", async (t) => {
  const f = retryFixture(t);
  const error = await f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }).catch((error) => error);
  f.god();
  f.recover();
  await f.tick(100);
  assert.equal(f.replies.length, 2, "a failed tool-originated escalation must also own a retry");
  assert.match(error.message, /operator escalation requested.*queued/);
  assert.ok(f.replies.every(({ requestID, reply }) => requestID === "per_child" && reply === "escalate"));
  assert.equal(f.request.approval.kind, "operator");
  assert.deepEqual(f.v2.calls.promote, []);
});

test("guard_decide direct escalation retry cannot survive abort and real root resume", async (t) => {
  const f = retryFixture(t);
  await assert.rejects(f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "reject" }));
  let release;
  f.v2.v2.session.get = () => new Promise((resolve) => { release = resolve; });
  await f.tick(100);
  assert.equal(typeof release, "function", "the owned retry must freshly check root existence");
  f.lifecycle.abort("ses_root");
  f.broker.onEvent({ type: "session.aborted", properties: { sessionID: "ses_root" } });
  f.lifecycle.resume("ses_root", [{ type: "text", text: "continue" }]);
  release({ data: { id: "ses_root" } });
  await f.tick(100000);
  assert.equal(f.replies.length, 1);
});

test("guard_pending rechecks god mode after asynchronous ancestry iteration", async () => {
  let modeReads = 0;
  const v2 = v2Client({ pending: [{ id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } }] });
  const broker = createAuthorityBroker({ v2, tree, rootMode: () => ++modeReads === 1 ? "god" : "auto" });
  await assert.rejects(broker.pending({ sessionID: "ses_root" }), /root is no longer in god mode/);
});

// Old hosts are classified from a well-formed capability body; malformed probes
// fail closed with an authority error rather than masquerading as an old host.
const unsupportedCapabilities = [
  ["no capability fields", {}],
  ["no permissionAuthority", { backgroundSubagents: true }],
  ["permissionAuthority 1 (the previous contract)", { permissionAuthority: 1, backgroundSubagents: true }],
  ["no backgroundSubagents", { permissionAuthority: 2 }],
  ["backgroundSubagents false", { permissionAuthority: 2, backgroundSubagents: false }],
];

for (const [label, capabilities] of unsupportedCapabilities) {
  test(`rootContext classifies an old host as AUTHORITY_UNSUPPORTED for every session (${label})`, async () => {
    const v2 = v2Client({ capabilities });
    const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
    for (const id of ["ses_root", "ses_child"]) await assert.rejects(broker.rootContext(id), (error) => error.code === AUTHORITY_UNSUPPORTED);
    await assert.rejects(broker.available(), (error) => error.code === AUTHORITY_UNSUPPORTED);
  });
}

test("rootContext classifies a missing SDK capability probe as AUTHORITY_UNSUPPORTED", async () => {
  const v2 = v2Client();
  delete v2.experimental.capabilities;
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
  for (const id of ["ses_root", "ses_child"]) await assert.rejects(broker.rootContext(id), (error) => error.code === AUTHORITY_UNSUPPORTED && /capability probe/.test(error.message));
});

for (const [label, get] of [
  ["a rejected probe transport", async () => { throw new TypeError("fetch failed"); }],
  ["an HTTP error body thrown by the SDK", async () => { throw { name: "Unavailable" }; }],
  ["a null capability response", async () => ({ data: null })],
  ["an array capability response", async () => ({ data: [] })],
  ["a string capability response", async () => ({ data: "<html>" })],
  ["an unknown permissionAuthority version", async () => ({ data: { permissionAuthority: 3, backgroundSubagents: true } })],
]) {
  test(`rootContext fails closed for an eligible god root on ${label}`, async () => {
    const v2 = v2Client();
    v2.experimental.capabilities.get = get;
    const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
    await assert.rejects(broker.rootContext("ses_root"), (error) => error.code !== AUTHORITY_UNSUPPORTED && (label !== "an unknown permissionAuthority version" || /unknown permissionAuthority/.test(error.message)));
  });
}

for (const [label, reply] of [
  ["an Error as capability data", { data: new Error("boom") }],
  ["a Date as capability data", { data: new Date(0) }],
  ["a resolved SDK error wrapper with data", { data: {}, error: { name: "Unavailable" } }],
  ["a resolved SDK wrapper without data", { request: {}, response: new Response(null, { status: 200 }) }],
  ["string capability data without an HTTP response", { data: '{"backgroundSubagents":true}' }],
]) {
  test(`rootContext fails closed for an eligible god root on ${label}`, async () => {
    const v2 = v2Client();
    v2.experimental.capabilities.get = async () => reply;
    const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
    await assert.rejects(broker.rootContext("ses_root"), (error) => error.code !== AUTHORITY_UNSUPPORTED);
  });
}

test("an injected bare plain capability object is still classified", async () => {
  const v2 = v2Client();
  v2.experimental.capabilities.get = async () => ({ backgroundSubagents: true });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
  await assert.rejects(broker.rootContext("ses_root"), (error) => error.code === AUTHORITY_UNSUPPORTED);
});

// The installed v2 SDK, both error styles, against raw host responses.
const realProbe = (respond, throwOnError) => {
  const v2 = createOpencodeClient({ baseUrl: "http://opencode.invalid", throwOnError, fetch: async () => respond() });
  return createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
};
for (const throwOnError of [false, true]) {
  for (const [label, respond] of [
    ["an empty 200 body", () => new Response("", { status: 200 })],
    ["an empty 200 JSON body", () => new Response("", { status: 200, headers: { "content-type": "application/json" } })],
    ["a Content-Length 0 200", () => new Response("", { status: 200, headers: { "content-type": "application/json", "content-length": "0" } })],
    ["a 204", () => new Response(null, { status: 204 })],
    ["a 503", () => new Response(JSON.stringify({ name: "Unavailable" }), { status: 503, headers: { "content-type": "application/json" } })],
    ["a 404", () => new Response(JSON.stringify({ name: "NotFoundError" }), { status: 404, headers: { "content-type": "application/json" } })],
    ["a rejected fetch", () => { throw new TypeError("fetch failed"); }],
  ]) {
    test(`real SDK (throwOnError ${throwOnError}) rootContext fails closed on ${label}`, async () => {
      await assert.rejects(realProbe(respond, throwOnError).rootContext("ses_root"), (error) => error.code !== AUTHORITY_UNSUPPORTED);
    });
  }
  for (const body of ["{}", '{"backgroundSubagents":true}']) {
    test(`real SDK (throwOnError ${throwOnError}) rootContext classifies old-host body ${body}`, async () => {
      const respond = () => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      await assert.rejects(realProbe(respond, throwOnError).rootContext("ses_root"), (error) => error.code === AUTHORITY_UNSUPPORTED);
    });
  }
}

test("old-host compatibility does not loosen protected authority paths", async () => {
  const request = { id: "per_child", sessionID: "ses_child", approval: { kind: "parent", sessionID: "ses_root" } };
  const v2 = v2Client({ capabilities: { backgroundSubagents: true }, pending: [request] });
  const broker = createAuthorityBroker({ v2, directory: "/work", tree, rootMode: () => "god" });
  await assert.rejects(broker.available(), /does not advertise permissionAuthority: 2/);
  await assert.rejects(broker.observe(request), /does not advertise permissionAuthority: 2/);
  await assert.rejects(broker.pending({ sessionID: "ses_root" }), /does not advertise permissionAuthority: 2/);
  await assert.rejects(broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), /does not advertise permissionAuthority: 2/);
  assert.deepEqual(v2.calls.reply, []);
  assert.deepEqual(v2.calls.promote, []);
});

// The real plugin over the installed LEGACY SDK client and a fake host transport.
// The v2 authority client is derived from the legacy client's own transport, as in
// production. `capabilities` is the host's /experimental/capabilities answer.
const LEGACY_SDK = "/home/dev/.config/opencode/node_modules/@opencode-ai/sdk/dist/client.js";
const pluginHost = ({ modes, capabilities, scenario, config, sessions }) => {
  const home = mkdtempSync(join(tmpdir(), "guard-authority-compat-"));
  try {
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify(config ?? {
      permission: { bash: { "*": "ask", "mkfs *": "deny" } },
    }));
    for (const [id, mode] of Object.entries(modes)) writeFileSync(join(home, ".local/share/opencode/modes", id), `${mode}\n`);
    const script = `
      import assert from "node:assert/strict";
      import { createOpencodeClient } from ${JSON.stringify(LEGACY_SDK)};
      const calls = [];
      const sessions = ${sessions ?? `{
        ses_root: { id: "ses_root" },
        ses_child: { id: "ses_child", parentID: "ses_root" },
      }`};
      const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      const capabilities = ${capabilities};
      let sessionFailure;
      const fetch = async (request) => {
        const path = new URL(request.url).pathname;
        calls.push({ method: request.method, path, body: await request.clone().text() });
        if (path === "/experimental/capabilities") return capabilities();
        const session = path.match(/^\\/session\\/([^/]+)$/);
        if (session && request.method === "GET") {
          if (sessionFailure) return sessionFailure();
          return sessions[session[1]] ? json(sessions[session[1]]) : json({ name: "NotFoundError" }, 404);
        }
        if (/^\\/session\\/[^/]+\\/permissions\\/[^/]+$/.test(path)) return json(true);
        if (path === "/log") return json(true);
        return json({ name: "NotFoundError" }, 404);
      };
      const client = createOpencodeClient({ baseUrl: "http://opencode.invalid", fetch, directory: "/work" });
      const { OpencodeGuard } = await import(${JSON.stringify(new URL("../plugin.js", import.meta.url).href)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const ask = async (sessionID, { command = "npm run build", status = "ask", id = "per_" + sessionID } = {}) => {
        const output = { status };
        const input = { id, sessionID, permission: "bash", patterns: [command], metadata: { command }, always: [command], tool: { callID: "call_" + id } };
        try {
          await hooks["permission.ask"](input, output);
          return { output };
        } catch (error) {
          return { output, error: String(error?.message ?? error) };
        }
      };
      const asked = (sessionID, { command = "npm run build", id = "per_" + sessionID } = {}) => hooks.event({ event: { type: "permission.asked", properties: {
        id, sessionID, permission: "bash", patterns: [command], metadata: { command }, always: [command], tool: { callID: "call_" + id },
      } } });
      const replies = () => calls.filter(({ method, path }) => method === "POST" && /\\/permissions\\//.test(path));
      ${scenario}
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE: "", OPENCODE_PID: "", OPENCODE_AGENT_SHELL: "", OPENCODE_GUARD_CONFIG: "" },
      encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
  } finally { rmSync(home, { recursive: true, force: true }); }
};

const OLD_HOST = `() => json({ backgroundSubagents: true })`;

test("actual plugin leaves an old-host god root's ordinary ask output untouched", () => {
  for (const capabilities of [OLD_HOST, `() => json({})`, `() => json({ permissionAuthority: 1 })`, `() => json({ permissionAuthority: 1, backgroundSubagents: true })`]) {
    pluginHost({ modes: { ses_root: "god" }, capabilities, scenario: `
      const ask1 = await ask("ses_root");
      assert.equal(ask1.error, undefined, ask1.error);
      assert.deepEqual(ask1.output, { status: "ask" }, "no status, approval, forceAsk, or always mutation");
      const denied = await ask("ses_root", { status: "deny", id: "per_denied" });
      assert.equal(denied.error, undefined, denied.error);
      assert.deepEqual(denied.output, { status: "deny" }, "a native deny is never changed to allow");
    ` });
  }
});

test("actual plugin keeps the supported-host god root proposal", () => {
  pluginHost({ modes: { ses_root: "god" }, capabilities: `() => json({ permissionAuthority: 2, backgroundSubagents: true })`, scenario: `
    const { output, error } = await ask("ses_root");
    assert.equal(error, undefined, error);
    assert.deepEqual(output, { status: "allow" });
  ` });
});

test("actual plugin still rejects every ineligible old-host ask", () => {
  pluginHost({ modes: { ses_root: "god" }, capabilities: OLD_HOST, scenario: `
    const child = await ask("ses_child");
    assert.match(child.error ?? "", /does not advertise permissionAuthority: 2/, "child of a god root");
    assert.deepEqual(child.output, { status: "ask" });
    const hard = await ask("ses_root", { command: "mkfs /dev/sdz" });
    assert.match(hard.error ?? "", /does not advertise permissionAuthority: 2/, "configured hard deny");
    const unknown = await ask("ses_unknown");
    assert.match(unknown.error ?? "", /session ses_unknown does not exist/, "unverifiable ancestry fails on the ancestry lookup");
  ` });
  // A child holding its own god file whose legacy record does not prove it is the
  // requested session with a valid parent link must never be taken for a root.
  for (const record of [
    `{}`,
    `{ id: "ses_other" }`,
    `{ id: "ses_child", parentID: 7 }`,
    `{ id: "ses_child", parentID: "" }`,
  ]) {
    pluginHost({ modes: { ses_child: "god" }, capabilities: OLD_HOST,
      sessions: `{ ses_root: { id: "ses_root" }, ses_child: ${record} }`, scenario: `
      const child = await ask("ses_child");
      assert.ok(child.error, ${JSON.stringify(record)} + " must not verify as a root");
      assert.match(child.error, /reading session ses_child/, ${JSON.stringify(record)} + " fails on the ancestry record");
      assert.deepEqual(child.output, { status: "ask" });
    ` });
  }
  // Fresh host: parent links are cached for the process once read, so the
  // transport failure must be in place before the root's first ancestry read.
  pluginHost({ modes: { ses_root: "god" }, capabilities: OLD_HOST, scenario: `
    sessionFailure = () => { throw new TypeError("fetch failed"); };
    const transport = await ask("ses_root");
    assert.ok(transport.error, "ancestry transport failure must not fall back");
    assert.deepEqual(transport.output, { status: "ask" });
    sessionFailure = () => json({ name: "Unavailable" }, 503);
    const unavailable = await ask("ses_root", { id: "per_503" });
    assert.ok(unavailable.error, "ancestry HTTP 5xx must not fall back");
  ` });
  pluginHost({ modes: { ses_root: "god", ses_child: "god" }, capabilities: OLD_HOST, scenario: `
    const child = await ask("ses_child");
    assert.match(child.error ?? "", /does not advertise permissionAuthority: 2/, "a child holding its own god file is not the root");
  ` });
  for (const mode of ["auto", "manual", "edits"]) {
    pluginHost({ modes: { ses_root: mode }, capabilities: OLD_HOST, scenario: `
      const root = await ask("ses_root");
      assert.match(root.error ?? "", /does not advertise permissionAuthority: 2/, ${JSON.stringify(mode)});
    ` });
  }
});

test("actual plugin does not treat operational capability failures as an old host", () => {
  for (const capabilities of [
    `() => { throw new TypeError("fetch failed"); }`,
    `() => json({ name: "Unavailable" }, 503)`,
    `() => json({ name: "NotFoundError" }, 404)`,
    `() => json(null)`,
    `() => json([])`,
    `() => new Response("<html>ok</html>", { headers: { "content-type": "text/html" } })`,
    `() => json({ permissionAuthority: 3, backgroundSubagents: true })`,
  ]) {
    pluginHost({ modes: { ses_root: "god" }, capabilities, scenario: `
      const { output, error } = await ask("ses_root");
      assert.ok(error, ${JSON.stringify(capabilities)} + " must fail closed");
      assert.deepEqual(output, { status: "ask" });
    ` });
  }
});

test("actual plugin old-host god root ask reaches the legacy handler and is answered once", () => {
  pluginHost({ modes: { ses_root: "god" }, capabilities: OLD_HOST, scenario: `
    const { output, error } = await ask("ses_root");
    assert.equal(error, undefined, error);
    assert.deepEqual(output, { status: "ask" });
    await asked("ses_root");
    await asked("ses_root");
    assert.deepEqual(replies().map(({ path, body }) => ({ path, body: JSON.parse(body) })), [
      { path: "/session/ses_root/permissions/per_ses_root", body: { response: "once" } },
    ], "exactly one legacy once reply, never always");
  ` });
});

test("guard_decide cannot grant a queued immutable escalation intent when root returns god", async (t) => {
  const f = retryFixture(t);
  await assert.rejects(f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), /queued/);
  f.god();
  await assert.rejects(f.broker.decide({ sessionID: "ses_root", permissionID: "per_child", decision: "once" }), /human escalation intent/);
  assert.equal(f.replies.length, 2);
  assert.ok(f.replies.every(({ reply }) => reply === "escalate"));
});
