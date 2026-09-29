// The privacy boundary. The classifier route treats every profile other than `auto` and
// `manual` as one whose command text may not leave local infrastructure, and it asks
// resolveProfileFor() what the profile is -- so a profile this file fails to recognise
// does not merely degrade, it fails OPEN and ships command text (paths, hostnames,
// inline secrets) to a cloud classifier with nothing logged.
//
// ☠️ This used to be an ALLOWLIST of profile names hand-copied from the broker. When the
// broker added `uncensored-70b` and `vision`, both would have resolved to `auto` here and
// skipped the restriction. The guard deliberately has no code dependency on the broker
// (it reads the state files as a documented contract), so the list could never have been
// kept in sync by import -- hence a SHAPE check, and an unknown name treated as
// restrictive.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import http from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const home = mkdtempSync(join(tmpdir(), "guard-broker-"));
process.env.HOME = home;
const dir = join(home, ".local/share/opencode/model-routing/profiles");
mkdirSync(dir, { recursive: true });

const B = await import(new URL("../lib/broker.js", import.meta.url).href);

const record = (sessionID, profile) =>
  writeFileSync(join(dir, `${sessionID}.json`), JSON.stringify({ profile, explicit: true }));

test("a profile the broker added but this file has never heard of is still restrictive", () => {
  // The exact regression: these two shipped in one broker release.
  for (const profile of ["uncensored-70b", "vision"]) {
    record(`ses_${profile.replace(/-/g, "")}`, profile);
    const got = B.resolveProfileFor({ sessionID: `ses_${profile.replace(/-/g, "")}` });
    assert.equal(got.profile, profile, `${profile} must survive resolution`);
    assert.notEqual(got.profile, "auto",
      "resolving to auto is what lets command text reach a cloud classifier");
  }
});

test("the profiles that existed before still resolve unchanged", () => {
  for (const profile of ["auto", "manual", "local", "private", "uncensored", "uncensored-offline"]) {
    record("ses_known", profile);
    assert.equal(B.resolveProfileFor({ sessionID: "ses_known" }).profile, profile);
  }
});

test("a malformed record is refused rather than trusted", () => {
  // ☆ Refusing here falls through to the parent/agent chain and ultimately `auto`, which
  // is why the SHAPE has to be checked: garbage must not become a profile name, while a
  // well-formed unknown name must.
  for (const bad of [{ profile: 42 }, { profile: "" }, { profile: "../etc/passwd" },
                     { profile: "UPPER" }, { profile: "x".repeat(200) }, {}, null]) {
    writeFileSync(join(dir, "ses_bad.json"), JSON.stringify(bad));
    assert.equal(B.resolveProfileFor({ sessionID: "ses_bad" }).profile, "auto",
      `malformed ${JSON.stringify(bad)} must not be taken as a profile`);
  }
});

test("a child inherits a brand-new profile from its parent", () => {
  // Compaction and the classifier run as children; inheriting `auto` instead of the parent's
  // restrictive profile is the same fail-open by another route.
  record("ses_parent70b", "uncensored-70b");
  const got = B.resolveProfileFor({ sessionID: "ses_child", parentID: "ses_parent70b" });
  assert.equal(got.profile, "uncensored-70b");
  assert.equal(got.source, "parent");
});

test("the broker directory can be moved, and profiles are read from there", () => {
  const other = join(home, "elsewhere");
  mkdirSync(join(other, "profiles"), { recursive: true });
  writeFileSync(join(other, "profiles", "ses_moved.json"), JSON.stringify({ profile: "private" }));
  assert.equal(B.resolveProfileFor({ sessionID: "ses_moved", dir: other }).profile, "private");
  assert.equal(B.resolveProfileFor({ sessionID: "ses_moved" }).profile, "auto", "the default directory has no such record");
});

test("the broker counts as available only when its socket exists and it is not disabled", async () => {
  assert.equal(B.brokerAvailable(), false, "no socket in a fresh HOME");
  writeFileSync(join(home, ".local/share/opencode/model-routing/broker.sock"), "");
  assert.equal(B.brokerAvailable(), false, "a regular file is not a socket");
  const { createServer } = await import("node:net");
  const dir = join(home, "live-broker");
  mkdirSync(dir, { recursive: true });
  const server = createServer();
  await new Promise((resolve) => server.listen(B.brokerSocket(dir), resolve));
  try {
    assert.equal(B.brokerAvailable({ dir }), true);
    assert.equal(B.brokerAvailable({ dir, enabled: false }), false, "classifier.json broker:false wins");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("the broker bridge does not expose guard-side lease selection", () => {
  assert.equal("leaseRespectsLocalOnly" in B, false,
    "the routed classifier leaves lease policy entirely to the broker");
});

test("duplicate real-session failure and forget reports do not extend the circuit or retain the lease", async () => {
  const brokerRepo = fileURLToPath(new URL("../../opencode-broker/", import.meta.url));
  const brokerScript = join(brokerRepo, "bin/opencode-broker");
  const configPath = join(brokerRepo, "tests/fixtures/config.json");
  const brokerHome = mkdtempSync(join(tmpdir(), "guard-real-broker-"));
  const brokerDir = join(brokerHome, ".local/share/opencode/model-routing");
  const authDir = join(brokerHome, ".local/share/opencode");
  const guardConfigDir = join(home, ".config/opencode");
  const modeDir = join(home, ".local/share/opencode/modes");
  mkdirSync(authDir, { recursive: true });
  mkdirSync(join(brokerDir, "profiles"), { recursive: true });
  mkdirSync(guardConfigDir, { recursive: true });
  mkdirSync(modeDir, { recursive: true });
  const authPath = join(authDir, "auth.json");
  const authContents = Buffer.from(JSON.stringify({ anthropic: { type: "oauth" } }));
  writeFileSync(authPath, authContents);
  writeFileSync(join(brokerDir, "resolvable-models.json"), JSON.stringify({
    updatedAt: Date.now(),
    models: ["anthropic/claude-haiku-4-5"],
  }));
  writeFileSync(join(brokerDir, "profiles/ses_parent.json"), JSON.stringify({ profile: "auto", explicit: true }));
  writeFileSync(join(guardConfigDir, "classifier.json"), JSON.stringify({ brokerDir }));
  writeFileSync(join(modeDir, "ses_parent"), "auto\n");

  const modelsServer = http.createServer((request, response) => {
    assert.equal(request.url, "/v1/models");
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "qwen3.5-4b" }] }));
  });
  await new Promise((resolve) => modelsServer.listen(0, "127.0.0.1", resolve));
  const modelsAddress = modelsServer.address();
  const broker = spawn(process.execPath, [brokerScript, "serve"], {
    cwd: brokerRepo,
    env: {
      ...process.env,
      HOME: brokerHome,
      OPENCODE_BROKER_CONFIG: configPath,
      OPENCODE_BROKER_LOCAL_MODELS_URL: `http://127.0.0.1:${modelsAddress.port}/v1/models`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let brokerStderr = "";
  broker.stderr.on("data", (chunk) => { brokerStderr += String(chunk); });
  await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (!String(chunk).includes("listening on ")) return;
      broker.off("exit", onExit);
      resolve();
    };
    const onExit = (code, signal) => reject(new Error(
      `fixture broker exited before listen (${code ?? signal}): ${brokerStderr}`));
    broker.stdout.on("data", onData);
    broker.once("exit", onExit);
  });
  try {
    const authStat = statSync(authPath);
    const authRevision = `${Math.trunc(authStat.mtimeMs)}:${authStat.size}:${createHash("sha256").update(authContents).digest("hex")}`;
    const configFingerprint = createHash("sha256").update(readFileSync(configPath)).digest("hex");
    const published = await B.brokerRequest("/inventory", {
      connected: ["anthropic"],
      providers: { anthropic: { authType: "oauth", connected: true, classification: "subscription", models: 1 } },
      configFingerprint,
      authRevision,
    }, { dir: brokerDir });
    assert.equal(published.accepted, true);

    const created = [];
    let firstFailure = null;
    let firstTargetID = null;
    const embeddedFetch = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      const bodyText = await request.text();
      const body = bodyText ? JSON.parse(bodyText) : {};
      const sessionID = `ses_classifier_${created.length + 1}`;
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
          const sessionID = request.path.id;
          const lease = await B.brokerRequest("/lease", {
            sessionID,
            profile: "auto",
            tier: "classifier",
            contextTokens: 100,
            replace: true,
          }, { dir: brokerDir });
          if (!firstFailure) {
            firstTargetID = lease.target.id;
            firstFailure = await B.brokerRequest("/failure", {
              sessionID,
              targetID: firstTargetID,
              error: { statusCode: 503, message: "provider exploded" },
            }, { dir: brokerDir });
            await new Promise((resolve) => setTimeout(resolve, 25));
            return { error: { message: "provider exploded" }, response: { status: 503 } };
          }
          return { data: { parts: [{ type: "text", text: "SAFE" }] } };
        },
        abort: async () => {},
        status: async () => ({ data: {} }),
        delete: async (request) => {
          await B.brokerRequest("/forget", { sessionID: request.path.id }, { dir: brokerDir });
        },
      },
      postSessionIdPermissionsPermissionId: async () => ({}),
    };
    const { OpencodeGuard } = await import("../plugin.js");
    const hooks = await OpencodeGuard({ client, directory: "/work" });
    await hooks.event({ event: { type: "permission.asked", properties: {
      id: "per_classifier", sessionID: "ses_parent", permission: "bash",
      metadata: { command: "npm run build" },
    } } });

    const status = await B.brokerRequest("/status", {}, { dir: brokerDir });
    assert.equal(status.leases[created[0].sessionID], undefined, "the real-session lease is gone");
    assert.equal(Date.parse(status.circuits[firstTargetID].renewsAt), firstFailure.circuitUntil,
      "the guard's duplicate failure report cannot extend the router's circuit");
  } finally {
    if (broker.exitCode === null && broker.signalCode === null) {
      broker.kill("SIGTERM");
      await new Promise((resolve) => broker.once("exit", resolve));
    }
    await new Promise((resolve) => modelsServer.close(resolve));
    rmSync(brokerHome, { recursive: true, force: true });
  }
});

process.on("exit", () => { try { rmSync(home, { recursive: true, force: true }); } catch {} });
