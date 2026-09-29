import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runRoutedClassifier = ({ busyCleanup = false, failFirst = false } = {}) => {
  const home = mkdtempSync(join(tmpdir(), "guard-routed-classifier-"));
  try {
    const brokerDir = join(home, ".local/share/opencode/model-routing");
    mkdirSync(join(home, ".config/opencode"), { recursive: true });
    mkdirSync(join(home, ".local/share/opencode/modes"), { recursive: true });
    mkdirSync(join(brokerDir, "profiles"), { recursive: true });
    writeFileSync(join(home, ".config/opencode/classifier.json"), JSON.stringify({ brokerDir }));
    writeFileSync(join(home, ".local/share/opencode/modes/ses_parent"), "auto\n");
    writeFileSync(join(brokerDir, "profiles/ses_parent.json"), JSON.stringify({ profile: "auto", explicit: true }));
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      import http from "node:http";
      const brokerDir = ${JSON.stringify(brokerDir)};
      const socketPath = brokerDir + "/broker.sock";
      const calls = [];
      const server = http.createServer((request, response) => {
        let text = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => { text += chunk; });
        request.on("end", () => {
          calls.push({ path: request.url, body: text ? JSON.parse(text) : {} });
          response.writeHead(200, { "content-type": "application/json" });
          response.end("{}");
        });
      });
      await new Promise((resolve) => server.listen(socketPath, resolve));
      const created = [];
      const prompts = [];
      const aborts = [];
      const deletes = [];
      let createCount = 0;
      let promptCount = 0;
      let statusCount = 0;
      let clock = 0;
      Date.now = () => clock;
      const embeddedFetch = async (input, init) => {
        const request = input instanceof Request ? input : new Request(input, init);
        const bodyText = await request.text();
        const body = bodyText ? JSON.parse(bodyText) : {};
        const sessionID = "ses_classifier_" + (++createCount);
        created.push({ body, sessionID });
        return new Response(JSON.stringify({ data: { id: sessionID } }), {
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
          delete: async (request) => { deletes.push(request.path.id); },
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
      await new Promise((resolve) => server.close(resolve));
      process.stdout.write(JSON.stringify({ calls, created, prompts, aborts, deletes, statusCount, error, noThink, ordinary, cloud }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: home, OPENCODE_GUARD_CONFIG: "" },
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
    error: "classifier request failed (HTTP 503): provider exploded",
  });
  assert.deepEqual(
    result.calls.filter((call) => call.path === "/forget").map((call) => call.body.sessionID),
    result.created.map((created) => created.sessionID),
  );
});

test("a timed-out classifier is forgotten even when its delete is deferred", () => {
  const result = runRoutedClassifier({ busyCleanup: true });
  assert.equal(result.created.length, 1, JSON.stringify(result));
  assert.deepEqual(result.deletes, [], "a child that never becomes idle is not deleted blind");
  assert.equal(result.statusCount, 1, "the child was observed busy during cleanup");
  assert.equal(result.calls.some((call) => call.path === "/failure"), false, "timeouts do not indict the provider");
  const forgets = result.calls.filter((call) => call.path === "/forget");
  assert.equal(forgets.at(-1).body.sessionID, result.created[0].sessionID);
});

test("chat.params disables thinking only for fleet-classifier on a listed provider", () => {
  const result = runRoutedClassifier();
  assert.equal(result.noThink.options.chat_template_kwargs.enable_thinking, false);
  assert.equal(result.ordinary.options, undefined);
  assert.equal(result.cloud.options, undefined);
});

test("classifier cleanup reaches idle before deleting the disposable session", () => {
  const source = readFileSync(new URL("../plugin.js", import.meta.url), "utf8");
  const start = source.indexOf("if (sessionID) {");
  const end = source.indexOf('brokerRequest("/forget"', start);
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
