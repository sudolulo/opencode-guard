// The classifier's configuration, its route, and the direct endpoint request, from
// lib/classifier.js. Run against a throwaway HOME so the machine's own
// classifier.json cannot change a result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "guard-classifier-"));
process.env.HOME = home;
mkdirSync(join(home, ".config/opencode"), { recursive: true });

const C = await import(new URL("../lib/classifier.js", import.meta.url).href);
const { SYSTEM } = await import(new URL("../lib/policy.js", import.meta.url).href);

const configFrom = (json, env = {}) =>
  C.classifierConfig({ env, read: (path) => {
    if (path === C.classifierConfigPath() && json !== undefined) return typeof json === "string" ? json : JSON.stringify(json);
    throw new Error("ENOENT");
  } });

test("no file and no environment means no direct lane, and nothing is invented", () => {
  const config = configFrom(undefined);
  assert.equal(config.configured, false);
  assert.equal(config.url, null);
  assert.equal(config.model, null, "no baked-in model");
  assert.equal(config.authToken, null, "no baked-in token");
  assert.deepEqual(config.brokerAgents, {}, "no baked-in broker agents");
  assert.equal(config.broker, true);
  assert.equal(config.private, false);
  assert.equal(config.system, SYSTEM);
});

test("a garbage file changes nothing", () => {
  for (const junk of ["not json", "[1,2]", "null", "42"]) {
    assert.equal(configFrom(junk).configured, false, junk);
  }
});

test("the environment supplies a url and token when the file does not", () => {
  const config = configFrom(undefined, {
    OPENCODE_GUARD_CLASSIFIER_URL: "http://localhost:8080/v1/chat/completions",
    OPENCODE_GUARD_CLASSIFIER_TOKEN: "t0k",
  });
  assert.equal(config.configured, true);
  assert.equal(config.authToken, "t0k");
  assert.equal(configFrom(undefined, { OPENCODE_GUARDRAILS_CLASSIFIER_URL: "http://localhost:1/" }).url,
    "http://localhost:1/", "the pre-1.0 variable still works");
  assert.equal(configFrom({ url: "http://file/" }, { OPENCODE_GUARD_CLASSIFIER_URL: "http://env/" }).url,
    "http://file/", "the file wins over the environment");
});

test("authTokenFile supplies the token from its first line; authToken wins; a missing file gives none", () => {
  const files = { [join(home, "key")]: "s3cret\nignored\n", "/abs/key": "abs\n" };
  const configWith = (json, env = {}) => C.classifierConfig({ env, read: (path) => {
    if (path === C.classifierConfigPath()) return JSON.stringify(json);
    if (path in files) return files[path];
    throw new Error("ENOENT");
  } });
  assert.equal(configWith({ url: "http://x/", authTokenFile: "~/key" }).authToken, "s3cret", "~/ expands to HOME");
  assert.equal(configWith({ url: "http://x/", authTokenFile: "/abs/key" }).authToken, "abs");
  assert.equal(configWith({ url: "http://x/", authToken: "inline", authTokenFile: "/abs/key" }).authToken, "inline");
  assert.equal(configWith({ url: "http://x/", authTokenFile: "/missing" }).authToken, null, "no token, no throw");
  assert.equal(configWith({ url: "http://x/", authTokenFile: "/missing" }, { OPENCODE_GUARD_CLASSIFIER_TOKEN: "env" }).authToken,
    "env", "the environment is the last resort");
});

test("votes and timeout are clamped, and broker:false turns the broker lane off", () => {
  assert.equal(configFrom({ votes: 9 }).votes, 5);
  assert.equal(configFrom({ votes: 0 }).votes, 1);
  assert.equal(configFrom({ votes: "x" }).votes, 1);
  assert.equal(configFrom({ timeoutMs: -5 }).timeoutMs, 25000);
  assert.equal(configFrom({ timeoutMs: 4000 }).timeoutMs, 4000);
  assert.equal(configFrom({ broker: false }).broker, false);
  assert.equal(configFrom({ broker: "off" }).broker, false);
});

test("a prompt addendum is appended to the built-in prompt and labelled as winning", () => {
  const config = configFrom({ promptAddendum: "Starting a named app with `appctl start <name>` is SAFE." });
  assert.ok(config.system.startsWith(SYSTEM));
  assert.match(config.system, /Site rules\. Where these conflict with the lists above, these win:\nStarting a named app/);
  assert.equal(configFrom({ systemPrompt: "custom" }).system, "custom");
});

test("ordinary profiles use the direct lane first and the broker behind it", () => {
  const direct = { configured: true, private: false };
  assert.deepEqual(C.classifierRoute({ profile: "auto", config: direct, brokerAvailable: true }),
    { lanes: ["direct", "broker"], localOnly: false, reason: null });
  assert.deepEqual(C.classifierRoute({ profile: "manual", config: direct, brokerAvailable: false }).lanes, ["direct"]);
  assert.deepEqual(C.classifierRoute({ profile: undefined, config: { configured: false }, brokerAvailable: true }).lanes, ["broker"],
    "no profile at all is the ordinary case");
  const none = C.classifierRoute({ profile: "auto", config: { configured: false }, brokerAvailable: false });
  assert.deepEqual(none.lanes, []);
  assert.match(none.reason, /no classifier is configured/);
});

test("a privacy profile only ever reaches a local lane", () => {
  const cloudEndpoint = { configured: true, private: false };
  const localEndpoint = { configured: true, private: true };
  // The endpoint is not marked private, so it is skipped; the broker is asked for a local-only lease.
  assert.deepEqual(C.classifierRoute({ profile: "private", config: cloudEndpoint, brokerAvailable: true }),
    { lanes: ["broker"], localOnly: true, reason: null });
  assert.deepEqual(C.classifierRoute({ profile: "local", config: localEndpoint, brokerAvailable: false }).lanes, ["direct"]);
  // A profile nobody here has heard of is restrictive, never ordinary.
  assert.equal(C.classifierRoute({ profile: "vision", config: localEndpoint, brokerAvailable: true }).localOnly, true);
  const refused = C.classifierRoute({ profile: "uncensored", config: cloudEndpoint, brokerAvailable: false });
  assert.deepEqual(refused.lanes, [], "no local lane is a refusal, not a cloud call");
  assert.match(refused.reason, /profile uncensored keeps command text on local infrastructure/);
});

test("the direct request carries the prompt, and only the headers and keys it should", () => {
  const config = configFrom({ url: "http://localhost:8080/v1/chat/completions", model: "small-model" });
  const init = C.directRequest(config, { command: "ls -la", cwd: "/work" });
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, undefined, "no token, no Authorization header");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "small-model");
  assert.equal(body.max_tokens, 8);
  assert.equal(body.seed, 0);
  assert.equal(body.chat_template_kwargs, undefined, "the llama.cpp extension is opt-in");
  assert.equal(body.messages[0].content, SYSTEM);
  assert.equal(body.messages[1].content, "cwd: /work\ncommand: ls -la");
});

test("extraBody adds keys and a null removes a default", () => {
  const config = configFrom({
    url: "http://x/", authToken: "k",
    extraBody: {
      chat_template_kwargs: { enable_thinking: false },
      max_tokens: null, temperature: null, max_completion_tokens: 16,
      messages: "cannot be replaced",
    },
  });
  const init = C.directRequest(config, { command: "ls", cwd: "/" });
  assert.equal(init.headers.Authorization, "Bearer k");
  const body = JSON.parse(init.body);
  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false });
  assert.equal("max_tokens" in body, false);
  assert.equal("temperature" in body, false);
  assert.equal(body.max_completion_tokens, 16);
  assert.ok(Array.isArray(body.messages), "the prompt is always the prompt");
});

test("the direct lane reads SAFE, treats anything else as RISKY, and reports faults as errors", async () => {
  const config = configFrom({ url: "http://x/", timeoutMs: 1000 });
  const answering = (content, status = 200) => async () => ({
    ok: status < 300, status, json: async () => ({ choices: [{ message: { content } }] }),
  });
  assert.equal(await C.classifyDirect({ command: "ls", cwd: "/", config, fetchImpl: answering("SAFE") }), "SAFE");
  assert.equal(await C.classifyDirect({ command: "ls", cwd: "/", config, fetchImpl: answering(" safe\n") }), "SAFE");
  assert.equal(await C.classifyDirect({ command: "ls", cwd: "/", config, fetchImpl: answering("I think it is safe") }), "RISKY");
  assert.equal(await C.classifyDirect({ command: "ls", cwd: "/", config, fetchImpl: answering("", 503) }), "error:http503");
  const refused = await C.classifyDirect({ command: "ls", cwd: "/", config, fetchImpl: async () => { throw new Error("ECONNREFUSED"); } });
  assert.match(refused, /^error:Error: ECONNREFUSED/);
  const slow = { ...config, timeoutMs: 20 };
  const hanging = async (_url, init) => new Promise((_, reject) => {
    init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
  });
  assert.equal(await C.classifyDirect({ command: "ls", cwd: "/", config: slow, fetchImpl: hanging }), "error:timeout");
});

process.on("exit", () => { try { rmSync(home, { recursive: true, force: true }); } catch {} });
