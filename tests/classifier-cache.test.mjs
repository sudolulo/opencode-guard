import { test } from "node:test";
import assert from "node:assert/strict";

const { createClassifierCache } = await import(new URL("../lib/classifier-cache.js", import.meta.url).href);

const config = (overrides = {}) => ({
  configured: true,
  url: "http://classifier/",
  model: "model-a",
  private: true,
  votes: 1,
  timeoutMs: 25_000,
  extraBody: { seed: 0 },
  broker: true,
  brokerDir: "/broker",
  noThinkProviders: ["llamacpp"],
  system: "system policy",
  ...overrides,
});
const route = (overrides = {}) => ({ profile: "auto", localOnly: false, lanes: ["direct", "broker"], ...overrides });

const cacheFor = ({ now = 1_000, store = {} } = {}) => {
  let clock = now;
  const writes = [];
  const cache = createClassifierCache({
    now: () => clock,
    readShared: () => structuredClone(store),
    writeShared: (next) => { store = structuredClone(next); writes.push(store); },
  });
  return { cache, store: () => store, replace: (next) => { store = next; }, writes, advance: (ms) => { clock += ms; } };
};

test("hot entries expire six hours after their original classification", () => {
  const subject = cacheFor();
  subject.cache.put({ command: "git status", cwd: "/repo", config: config(), route: route(), verdict: "SAFE" });
  assert.equal(subject.cache.get({ command: "git status", cwd: "/repo", config: config(), route: route() }), "SAFE");
  subject.advance(6 * 60 * 60 * 1000);
  assert.equal(subject.cache.get({ command: "git status", cwd: "/repo", config: config(), route: route() }), null);
});

test("shared promotion preserves the original expiry time", () => {
  const first = cacheFor();
  first.cache.put({ command: "git status", cwd: "/repo", config: config(), route: route(), verdict: "SAFE" });
  const second = cacheFor({ now: 1_000 + 5 * 60 * 60 * 1000, store: first.store() });
  assert.equal(second.cache.get({ command: "git status", cwd: "/repo", config: config(), route: route() }), "SAFE");
  second.advance(60 * 60 * 60 * 1000);
  assert.equal(second.cache.get({ command: "git status", cwd: "/repo", config: config(), route: route() }), null);
});

test("profile and route changes use distinct cache keys", () => {
  const subject = cacheFor();
  subject.cache.put({ command: "git status", cwd: "/repo", config: config(), route: route(), verdict: "SAFE" });
  assert.equal(subject.cache.get({ command: "git status", cwd: "/repo", config: config(), route: route({ profile: "local", localOnly: true, lanes: ["direct"] }) }), null);
});

test("judgment policy changes invalidate cached verdicts", () => {
  for (const changed of [
    { system: "different policy" }, { model: "model-b" }, { votes: 3 }, { extraBody: { reasoning_effort: "low" } },
  ]) {
    const subject = cacheFor();
    subject.cache.put({ command: "git status", cwd: "/repo", config: config(), route: route(), verdict: "SAFE" });
    assert.equal(subject.cache.get({ command: "git status", cwd: "/repo", config: config(changed), route: route() }), null, JSON.stringify(changed));
  }
});

test("equivalent policy object key ordering has a stable key", () => {
  const subject = cacheFor();
  subject.cache.put({ command: "git status", cwd: "/repo", config: config({ extraBody: { b: 2, a: { y: 2, x: 1 } } }), route: route(), verdict: "SAFE" });
  assert.equal(subject.cache.get({ command: "git status", cwd: "/repo", config: config({ extraBody: { a: { x: 1, y: 2 }, b: 2 } }), route: route() }), "SAFE");
});

test("errors are not cached and legacy, malformed, future, and expired records miss", () => {
  const subject = cacheFor();
  for (const verdict of ["error:timeout", "error:http500"]) {
    subject.cache.put({ command: verdict, cwd: "/repo", config: config(), route: route(), verdict });
    assert.equal(subject.cache.get({ command: verdict, cwd: "/repo", config: config(), route: route() }), null);
  }
  const key = subject.cache.key({ command: "git status", cwd: "/repo", config: config(), route: route() });
  for (const record of [["SAFE", 1_000], { verdict: "SAFE" }, { verdict: "SAFE", classifiedAt: 2_000_000_000_000 }, { verdict: "SAFE", classifiedAt: -30_000_000 }]) {
    const one = cacheFor({ store: { [key]: record } });
    assert.equal(one.cache.get({ command: "git status", cwd: "/repo", config: config(), route: route() }), null);
  }
});

test("auth token changes miss while serialized cache keys never retain secrets", () => {
  const subject = cacheFor();
  const command = "deploy --token=command-secret";
  const tokenA = "config-secret-a";
  const tokenB = "config-secret-b";
  subject.cache.put({ command, cwd: "/repo", config: config({ authToken: tokenA }), route: route(), verdict: "SAFE" });
  assert.equal(subject.cache.get({ command, cwd: "/repo", config: config({ authToken: tokenB }), route: route() }), null,
    "a credential or tenant change must not reuse a prior classifier verdict");
  const serialized = JSON.stringify(subject.store());
  assert.equal(serialized.includes(command), false);
  assert.equal(serialized.includes(tokenA), false);
  assert.equal(serialized.includes(tokenB), false);
});

test("hot and shared caches retain no more than their documented entry caps", () => {
  const hot = cacheFor();
  for (let i = 0; i < 301; i++) {
    hot.cache.put({ command: `hot-${i}`, cwd: "/repo", config: config(), route: route(), verdict: "SAFE" });
  }
  hot.replace({});
  assert.equal(hot.cache.get({ command: "hot-0", cwd: "/repo", config: config(), route: route() }), null);

  const shared = cacheFor();
  for (let i = 0; i < 2001; i++) {
    shared.cache.put({ command: `shared-${i}`, cwd: "/repo", config: config(), route: route(), verdict: "SAFE" });
  }
  assert.equal(Object.keys(shared.store()).length, 2000);
});
