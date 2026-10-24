import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runRoutedClassifier = ({ busyCleanup = false, failDelete = false, failFirst = false, changeNoThinkBeforePrompt = false, deletedEvent = false, deletedEventIncarnation = true } = {}) => {
  const home = mkdtempSync(join(tmpdir(), "guard-routed-classifier-"));
  try {
    const brokerDir = join(home, ".local/share/opencode/model-routing");
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    mkdirSync(join(brokerDir, "profiles"), { recursive: true });
    const configPath = join(home, ".config/opencode/classifier.json");
    writeFileSync(configPath, JSON.stringify({ brokerDir, noThinkProviders: ["llamacpp"] }));
    writeFileSync(join(home, ".local/share/opencode/modes/ses_parent"), "auto\n");
    writeFileSync(join(brokerDir, "profiles/ses_parent.json"), JSON.stringify({ profile: "auto", explicit: true }));
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      import http from "node:http";
      import { writeFileSync } from "node:fs";
      const brokerDir = ${JSON.stringify(brokerDir)};
      const socketPath = brokerDir + "/broker.sock";
      const calls = [];
      const server = http.createServer((request, response) => {
        let text = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => { text += chunk; });
        request.on("end", () => {
          const body = text ? JSON.parse(text) : {};
          calls.push({ path: request.url, body });
          response.writeHead(200, { "content-type": "application/json" });
          // The current broker contract: a session's live lease is read back with
          // /lease/verify, and settlements must carry that broker-minted leaseID.
          response.end(request.url === "/lease/verify"
            ? JSON.stringify({ held: true, leaseID: "lease_" + body.sessionID })
            : "{}");
        });
      });
      await new Promise((resolve) => server.listen(socketPath, resolve));
      const created = [];
       const prompts = [];
       const aborts = [];
       const deletes = [];
       const routedNoThink = {};
       const afterCleanupNoThink = {};
      let createCount = 0;
      let promptCount = 0;
      let statusCount = 0;
      let clock = 0;
      Date.now = () => clock;
      const embeddedFetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const bodyText = await request.text();
        const body = bodyText ? JSON.parse(bodyText) : {};
        if (new URL(request.url).pathname.endsWith("/experimental/capabilities")) {
          return new Response(JSON.stringify({ data: { sessionIncarnation: 1 } }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
        // A session read (the permission handler resolving whether the asker has a parent) is
        // not a create: answer it as a parentless session without counting it.
        if (request.method === "GET") {
          return new Response(JSON.stringify({ data: { id: new URL(request.url).pathname.split("/").pop() } }), {
            status: 200, headers: { "content-type": "application/json" },
          });
        }
        const sessionID = "ses_classifier_" + (++createCount);
        const incarnationID = "inc_classifier_" + createCount;
        created.push({ body, sessionID, incarnationID });
        return new Response(JSON.stringify({ data: { id: sessionID, incarnationID } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      };
      const client = {
        session: {
          _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch: embeddedFetch, headers: new Headers() }) },
          prompt: async (request) => {
            prompts.push({ body: request.body, sessionID: request.path.id });
            promptCount += 1;
            if (${JSON.stringify(changeNoThinkBeforePrompt)}) {
              writeFileSync(${JSON.stringify(configPath)}, JSON.stringify({ brokerDir, noThinkProviders: ["other"] }));
              await hooks["chat.params"]({ sessionID: request.path.id, agent: request.body.agent, provider: { id: "llamacpp" } }, routedNoThink);
            }
            if (${JSON.stringify(failFirst)} && promptCount === 1) {
              return { error: { message: "provider exploded" }, response: { status: 503 } };
            }
            if (${JSON.stringify(busyCleanup)}) {
              return { error: { message: "client closed request" }, response: { status: 499 } };
            }
            return { data: { parts: [{ type: "text", text: "SAFE" }] } };
          },
          abort: async (request) => { aborts.push(request.path.id); },
          status: async () => {
            statusCount += 1;
            if (${JSON.stringify(busyCleanup)}) {
              clock = 20_000;
              return { data: { ["ses_classifier_" + createCount]: { type: "busy" } } };
            }
            return { data: {} };
          },
          delete: async (request) => {
            deletes.push(request.path.id);
            return ${JSON.stringify(failDelete)} ? { error: { message: "delete failed" }, response: { status: 503 } } : {};
          },
        },
        postSessionIdPermissionsPermissionId: async () => ({}),
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const noThink = {};
      const ordinary = {};
      const cloud = {};
      await hooks["chat.params"]({ agent: "fleet-classifier", provider: { id: "llamacpp" } }, noThink);
      await hooks["chat.params"]({ agent: "standard", provider: { id: "llamacpp" } }, ordinary);
      await hooks["chat.params"]({ agent: "fleet-classifier", provider: { id: "anthropic" } }, cloud);
      let error = null;
      try {
        await hooks.event({ event: { type: "permission.asked", properties: {
          id: "per_classifier", sessionID: "ses_parent", permission: "bash",
          metadata: { command: "npm run build" },
        } } });
       } catch (caught) {
         error = String(caught?.message ?? caught);
       }
        if (${JSON.stringify(deletedEvent)} && created[0]) {
           await hooks.event({ event: { type: "session.deleted", properties: { info: {
             id: created[0].sessionID,
             ...(${JSON.stringify(deletedEventIncarnation)} ? { incarnationID: created[0].incarnationID } : {}),
           } } } });
        }
        if (${JSON.stringify(changeNoThinkBeforePrompt)} && created[0]) {
         await hooks["chat.params"]({ sessionID: created[0].sessionID, agent: "fleet-classifier", provider: { id: "llamacpp" } }, afterCleanupNoThink);
       }
       await new Promise((resolve) => server.close(resolve));
       process.stdout.write(JSON.stringify({ calls, created, prompts, aborts, deletes, statusCount, error, noThink, ordinary, cloud, routedNoThink, afterCleanupNoThink }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      // This inline fake-client Node host is not an OpenCode or agent launch.
      env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "", OPENCODE_AGENT_SHELL: "" },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    return JSON.parse(child.stdout.trim());
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
};

// opencode calls every export of a plugin module as a plugin factory; a
// non-function export -- or a second function export that cannot survive being
// called with the plugin input -- unloads the whole module, silently.
test("plugin.js exports exactly one factory function", async () => {
  const mod = await import("../plugin.js");
  const exports = Object.entries(mod);
  assert.equal(exports.length, 1, `exports: ${exports.map(([k]) => k).join(", ")}`);
  assert.equal(typeof exports[0][1], "function");
});

test("the routed classifier creates one fixed unpinned agent and reports failures by its real session", () => {
  const result = runRoutedClassifier({ failFirst: true });
  assert.equal(result.created.length, 2,
    `one genuine provider failure gets the existing bounded guard retry: ${JSON.stringify(result)}`);
  for (const created of result.created) {
    assert.equal(created.body.agent, "fleet-classifier");
    assert.equal(created.body.model, undefined);
  }
  for (const prompted of result.prompts) {
    assert.equal(prompted.body.agent, "fleet-classifier");
    assert.equal(prompted.body.model, undefined);
  }
  assert.equal(result.calls.filter((call) => call.path === "/lease").length, 0);
  const failure = result.calls.find((call) => call.path === "/failure");
  assert.deepEqual(failure.body, {
    sessionID: result.created[0].sessionID,
    leaseID: "lease_" + result.created[0].sessionID,
    error: "classifier request failed (HTTP 503): provider exploded",
  });
  // Every settlement carries the broker-minted leaseID: without it the broker refuses
  // the report and the lease leaks until its idle reaper takes it.
  assert.deepEqual(
    result.calls.filter((call) => call.path === "/forget").map((call) => call.body),
    result.created.map((created) => ({ sessionID: created.sessionID, leaseID: "lease_" + created.sessionID })),
  );
});

test("a timed-out classifier is forgotten even when its delete is deferred", () => {
  const result = runRoutedClassifier({ busyCleanup: true });
  assert.equal(result.created.length, 1, JSON.stringify(result));
  assert.deepEqual(result.deletes, [], "a child that never becomes idle is not deleted blind");
  assert.equal(result.statusCount, 1, "the child was observed busy during cleanup");
  assert.equal(result.calls.some((call) => call.path === "/failure"), false, "timeouts do not indict the provider");
  const forgets = result.calls.filter((call) => call.path === "/forget");
  assert.deepEqual(forgets.at(-1).body, { sessionID: result.created[0].sessionID, leaseID: "lease_" + result.created[0].sessionID });
});

test("chat.params disables thinking only for fleet-classifier on a listed provider", () => {
  const result = runRoutedClassifier();
  assert.equal(result.noThink.options.chat_template_kwargs.enable_thinking, false);
  assert.equal(result.ordinary.options, undefined);
  assert.equal(result.cloud.options, undefined);
});

test("a routed classifier retains its no-think provider snapshot when cleanup is deferred", () => {
  const result = runRoutedClassifier({ busyCleanup: true, changeNoThinkBeforePrompt: true });
  assert.equal(result.routedNoThink.options.chat_template_kwargs.enable_thinking, false,
    "the child uses the no-think providers captured before the config changed");
  assert.equal(result.afterCleanupNoThink.options.chat_template_kwargs.enable_thinking, false,
    "a late chat.params uses the original snapshot after a deferred cleanup, not live config");
});

test("a session.deleted event releases a deferred classifier snapshot", () => {
  const result = runRoutedClassifier({ busyCleanup: true, changeNoThinkBeforePrompt: true, deletedEvent: true });
  assert.equal(result.afterCleanupNoThink.options, undefined,
    "an explicit deletion releases the retained snapshot and cannot leave it indefinitely");
});

test("an ID-only session.deleted event retains a deferred classifier snapshot", () => {
  const result = runRoutedClassifier({
    busyCleanup: true,
    changeNoThinkBeforePrompt: true,
    deletedEvent: true,
    deletedEventIncarnation: false,
  });
  assert.equal(result.afterCleanupNoThink.options?.chat_template_kwargs?.enable_thinking, false,
    "an ambiguous deletion event cannot evict a snapshot that may belong to a replacement session");
});

test("classifier snapshots remain bound to their creation incarnation", () => {
  const home = mkdtempSync(join(tmpdir(), "guard-classifier-incarnation-"));
  try {
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      import http from "node:http";
      import { mkdirSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      const home = ${JSON.stringify(home)};
      const brokerDir = join(home, ".local/share/opencode/model-routing");
      const configPath = join(home, ".config/opencode/classifier.json");
      mkdirSync(join(home, ".config/opencode"), { recursive: true });
      mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
      mkdirSync(join(brokerDir, "profiles"), { recursive: true });
      writeFileSync(configPath, JSON.stringify({ brokerDir, noThinkProviders: ["llamacpp"] }));
      writeFileSync(join(home, ".local/share/opencode/modes/ses_parent"), "auto\\n");
      writeFileSync(join(brokerDir, "profiles/ses_parent.json"), JSON.stringify({ profile: "auto", explicit: true }));
      const server = http.createServer((request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(request.url === "/lease/verify" ? JSON.stringify({ held: true, leaseID: "lease" }) : "{}");
      });
      await new Promise((resolve) => server.listen(brokerDir + "/broker.sock", resolve));
      let creates = 0;
      let hooks;
      const ask = (id) => hooks.event({ event: { type: "permission.asked", properties: {
        id, sessionID: "ses_parent", permission: "bash", metadata: { command: "npm run build" },
      } } });
      const embeddedFetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        if (new URL(request.url).pathname.endsWith("/experimental/capabilities")) {
          return new Response(JSON.stringify({ data: { sessionIncarnation: 1 } }), { headers: { "content-type": "application/json" } });
        }
        if (request.method === "GET") return new Response(JSON.stringify({ data: { id: "ses_parent" } }), { headers: { "content-type": "application/json" } });
        creates += 1;
        return new Response(JSON.stringify({ data: { id: "ses_reused", incarnationID: creates === 1 ? "inc_old" : "inc_new" } }), { headers: { "content-type": "application/json" } });
      };
      const client = { session: {
        _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch: embeddedFetch, headers: new Headers() }) },
        prompt: async () => ({ data: { parts: [{ type: "text", text: "SAFE" }] } }),
        abort: async () => ({}),
        status: async () => ({ data: {} }),
        delete: async () => {
          if (creates === 1) {
            await ask("per_new");
            writeFileSync(configPath, JSON.stringify({ brokerDir, noThinkProviders: ["other"] }));
            return {};
          }
          return { error: { message: "retain replacement" }, response: { status: 503 } };
        },
      }, postSessionIdPermissionsPermissionId: async () => ({}) };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      hooks = await OpencodeGuard({ client, directory: "/work" });
      await ask("per_old");
      await hooks.event({ event: { type: "session.deleted", properties: { info: { id: "ses_reused", incarnationID: "inc_old" } } } });
      const afterOld = {};
      await hooks["chat.params"]({ sessionID: "ses_reused", agent: "fleet-classifier", provider: { id: "llamacpp" } }, afterOld);
      await hooks.event({ event: { type: "session.deleted", properties: { info: { id: "ses_reused", incarnationID: "inc_new" } } } });
      const afterNew = {};
      await hooks["chat.params"]({ sessionID: "ses_reused", agent: "fleet-classifier", provider: { id: "llamacpp" } }, afterNew);
      await new Promise((resolve) => server.close(resolve));
      process.stdout.write(JSON.stringify({ creates, afterOld, afterNew }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "", OPENCODE_AGENT_SHELL: "" },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    const result = JSON.parse(child.stdout.trim());
    assert.equal(result.creates, 2);
    assert.equal(result.afterOld.options?.chat_template_kwargs?.enable_thinking, false,
      `an old cleanup or stale deletion event cannot erase the replacement snapshot: ${JSON.stringify(result)}`);
    assert.equal(result.afterNew.options, undefined,
      "a deletion event for the current incarnation releases its snapshot");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a failed delete retains the routed classifier snapshot", () => {
  const result = runRoutedClassifier({ failDelete: true, changeNoThinkBeforePrompt: true });
  assert.equal(result.deletes.length, 1, "cleanup reached the delete after proving the child idle");
  assert.equal(result.afterCleanupNoThink.options.chat_template_kwargs.enable_thinking, false,
    "a late chat.params after a failed delete still uses its original policy");
});

test("concurrent routed classifiers stop creating children at the snapshot cap", () => {
  const home = mkdtempSync(join(tmpdir(), "guard-classifier-cap-"));
  try {
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      import http from "node:http";
      import { mkdirSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      const home = ${JSON.stringify(home)};
      const brokerDir = join(home, ".local/share/opencode/model-routing");
      mkdirSync(join(home, ".config/opencode"), { recursive: true });
      mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
      mkdirSync(join(brokerDir, "profiles"), { recursive: true });
      writeFileSync(join(home, ".config/opencode/classifier.json"), JSON.stringify({ brokerDir }));
      writeFileSync(join(home, ".local/share/opencode/modes/ses_parent"), "auto\\n");
      writeFileSync(join(brokerDir, "profiles/ses_parent.json"), JSON.stringify({ profile: "auto", explicit: true }));
      const server = http.createServer((request, response) => {
        let text = "";
        request.on("data", (chunk) => { text += chunk; });
        request.on("end", () => {
          const body = text ? JSON.parse(text) : {};
          response.writeHead(200, { "content-type": "application/json" });
          response.end(request.url === "/lease/verify" ? JSON.stringify({ held: true, leaseID: "lease_" + body.sessionID }) : "{}");
        });
      });
      await new Promise((resolve) => server.listen(brokerDir + "/broker.sock", resolve));
      const created = [];
      const prompts = [];
      const embeddedFetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        if (new URL(request.url).pathname.endsWith("/experimental/capabilities")) {
          return new Response(JSON.stringify({ data: {} }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (request.method === "GET") {
          return new Response(JSON.stringify({ data: { id: new URL(request.url).pathname.split("/").pop() } }), { status: 200, headers: { "content-type": "application/json" } });
        }
        const id = "ses_classifier_" + (created.length + 1);
        created.push(id);
        return new Response(JSON.stringify({ data: { id } }), { status: 200, headers: { "content-type": "application/json" } });
      };
      const client = {
        session: {
          _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch: embeddedFetch, headers: new Headers() }) },
          prompt: async (request) => new Promise((resolve) => prompts.push({ request, resolve })),
          abort: async () => ({}),
          status: async () => ({ data: {} }),
          delete: async () => ({}),
        },
        postSessionIdPermissionsPermissionId: async () => ({}),
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      const ask = (n) => hooks.event({ event: { type: "permission.asked", properties: {
        id: "per_" + n, sessionID: "ses_parent", permission: "bash", metadata: { command: "npm run build-" + n },
      } } });
      const active = Array.from({ length: 300 }, (_, n) => ask(n));
      for (let n = 0; n < 200 && prompts.length < 300; n++) await new Promise((resolve) => setTimeout(resolve, 10));
      if (prompts.length !== 300) throw new Error("expected 300 pending classifier prompts, got " + prompts.length);
      const overflow = ask(300);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const saturated = { created: created.length, prompts: prompts.length };
      for (const prompt of prompts) prompt.resolve({ data: { parts: [{ type: "text", text: "SAFE" }] } });
      await Promise.all([...active, overflow]);
      await new Promise((resolve) => server.close(resolve));
      process.stdout.write(JSON.stringify(saturated));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "", OPENCODE_AGENT_SHELL: "" },
      encoding: "utf8",
      timeout: 20_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    assert.deepEqual(JSON.parse(child.stdout.trim()), { created: 300, prompts: 300 });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("a routed judgment keeps the config snapshot captured before profile lookup", () => {
  const home = mkdtempSync(join(tmpdir(), "guard-route-snapshot-"));
  try {
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      import http from "node:http";
      import { mkdirSync, writeFileSync } from "node:fs";
      import { join } from "node:path";
      const home = ${JSON.stringify(home)};
      const configPath = join(home, ".config/opencode/classifier.json");
      const brokerA = join(home, "broker-a");
      const brokerB = join(home, "broker-b");
      const calls = [];
      const classifier = (name) => http.createServer((request, response) => {
        calls.push(name);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content: "SAFE" } }] }));
      });
      const first = classifier("first");
      const second = classifier("second");
      await new Promise((resolve) => first.listen(0, "127.0.0.1", resolve));
      await new Promise((resolve) => second.listen(0, "127.0.0.1", resolve));
      const urlFor = (server) => "http://127.0.0.1:" + server.address().port + "/v1/chat/completions";
      mkdirSync(join(home, ".config/opencode"), { recursive: true });
      mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
      mkdirSync(join(brokerB, "profiles"), { recursive: true });
      writeFileSync(join(home, ".local/share/opencode/modes/ses_parent"), "auto\\n");
      writeFileSync(configPath, JSON.stringify({ url: urlFor(first), broker: false, brokerDir: brokerA }));
       writeFileSync(join(brokerB, "profiles/ses_parent.json"), JSON.stringify({ profile: "private", explicit: true }));
       let switched = false;
       let sessionLookups = 0;
       const embeddedFetch = async (input, init) => {
         const request = input instanceof Request ? input : new Request(input, init);
         if (request.method === "GET") {
           sessionLookups += 1;
           // modeFor's preliminary lookup must not consume the switch. Its failure
           // leaves profileFor to make the awaited lookup this test races.
           if (sessionLookups < 2) throw new Error("session lookup unavailable");
         }
         if (request.method === "GET" && !switched) {
           switched = true;
           writeFileSync(configPath, JSON.stringify({ url: urlFor(second), broker: false, brokerDir: brokerB }));
        }
        return new Response(JSON.stringify({ data: { id: "ses_parent" } }), {
          status: 200, headers: { "content-type": "application/json" },
        });
      };
      const client = {
        session: { _client: { getConfig: () => ({ baseUrl: "http://opencode.invalid", fetch: embeddedFetch, headers: new Headers() }) } },
        postSessionIdPermissionsPermissionId: async () => ({}),
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: "/work" });
      // The non-read command takes the direct classifier path, not the static-read
      // fast path. modeFor's miss above leaves profileFor to perform the raced read.
      await hooks.event({ event: { type: "permission.asked", properties: {
        id: "per_snapshot_a", sessionID: "ses_parent", permission: "bash", metadata: { command: "npm run build" },
      } } });
      // The second invocation must now resolve B consistently: its private profile
       // has no private endpoint, so it must not call B's cloud endpoint.
       await hooks.event({ event: { type: "permission.asked", properties: {
         id: "per_snapshot_b", sessionID: "ses_parent", permission: "bash", metadata: { command: "npm run verify" },
       } } });
      await new Promise((resolve) => first.close(resolve));
      await new Promise((resolve) => second.close(resolve));
      process.stdout.write(JSON.stringify({ calls, switched }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "", OPENCODE_AGENT_SHELL: "" },
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.equal(child.status, 0, child.stderr || child.error?.message);
    assert.deepEqual(JSON.parse(child.stdout.trim()), { calls: ["first"], switched: true });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("classifier cleanup reaches idle before deleting the disposable session", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const start = source.indexOf("if (sessionID) {");
  const end = source.indexOf('settleClassifierLease("/forget"', start);
  assert.ok(end > start, "the cleanup ends by settling the lease");
  const cleanup = source.slice(start, end);
  const abort = cleanup.indexOf("client.session.abort");
  const poll = cleanup.indexOf("client.session.status");
  const idle = cleanup.indexOf("sessionIdle(");
  const remove = cleanup.indexOf("client.session.delete");
  assert.ok(abort >= 0 && poll > abort && idle > poll && remove > idle,
    "classifier cleanup must abort, poll /session/status until idle, then delete");
});

// ☠️ Two generations of this test pinned a broken barrier. The first asserted
// `v2Client().session.wait`, which does not exist on the legacy group ("is not a
// function", 99 leaks). The second asserted `v2Client().v2.session.wait`, which exists
// but is an unimplemented stub on OpenCode 1.18 ("Session wait is not available yet",
// every delete deferred, every broker-lane classification leaked its session).
// Neither may come back.
test("the idle barrier is a status poll, never session.wait", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  assert.equal(/\.\s*session\s*\.\s*wait\s*\(/.test(source.replace(/^\s*\/\/.*$/gm, "")), false,
    "session.wait is a stub on OpenCode 1.18 and never clears");
});

// ☠️ modeFor calls infoFor, which closes over the factory's client. Declared at
// module scope (0.4.8) it threw "infoFor is not defined" on every tool call in
// every child session -- and only a child, because modeFor returns early for any
// session with its own mode file, which the root always has. Importing the module
// stays green (the reference is evaluated on call, not on parse), so assert the
// declaration order in the source instead.
test("modeFor is declared inside the factory, below infoFor", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const factory = source.indexOf("export const OpencodeGuard");
  const infoFor = source.indexOf("const infoFor =");
  const modeFor = source.indexOf("const modeFor =");
  assert.ok(factory >= 0 && infoFor >= 0 && modeFor >= 0, "all three declarations must exist");
  assert.ok(infoFor > factory, "infoFor must stay inside the factory -- it needs v2Client");
  assert.ok(modeFor > infoFor, "modeFor must be declared after infoFor, inside the factory");
});
// createSessionTree closes over the PluginInput client, exactly like infoFor, so it
// must be built inside the factory, and modeFor walks the ancestry through it.
test("the session tree is created inside the factory, above modeFor", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const factory = source.indexOf("export const OpencodeGuard");
  const tree = source.indexOf("const sessionTree = createSessionTree(");
  const modeFor = source.indexOf("const modeFor =");
  assert.ok(factory >= 0 && tree >= 0 && modeFor >= 0, "all three declarations must exist");
  assert.ok(tree > factory, "sessionTree must be built inside the factory");
  assert.ok(modeFor > tree, "modeFor must be declared after sessionTree");
});
