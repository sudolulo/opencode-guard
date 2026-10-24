// Verdicts are reusable only while every input that can affect judgment is the
// same. The persisted store contains digest keys and verdict metadata only: no
// command text, credentials, or classifier policy is written to disk.
import { createHash } from "node:crypto";

export const CLASSIFIER_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const HOT_CACHE_CAP = 300;
const SHARED_CACHE_CAP = 2000;

const stableSerialize = (value) => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
};

const policyFor = (config = {}) => ({
  configured: config.configured,
  url: config.url,
  model: config.model,
  private: config.private,
  votes: config.votes,
  timeoutMs: config.timeoutMs,
  extraBody: config.extraBody,
  broker: config.broker,
  brokerDir: config.brokerDir,
  noThinkProviders: config.noThinkProviders,
  // This is hashed into the cache key, never persisted in the store. A changed
  // credential may select a different tenant or authorization policy.
  authToken: config.authToken,
  // This is the effective built-in/custom prompt plus any addendum.
  system: config.system,
});

const routeFor = (route = {}) => ({
  profile: route.profile,
  localOnly: route.localOnly,
  lanes: route.lanes,
});

const validRecord = (record, now) => (
  record && typeof record === "object" && !Array.isArray(record)
  && (record.verdict === "SAFE" || record.verdict === "RISKY")
  && Number.isFinite(record.classifiedAt)
  && record.classifiedAt <= now
  && now - record.classifiedAt < CLASSIFIER_CACHE_TTL_MS
);

export const createClassifierCache = ({ now = Date.now, readShared = () => ({}), writeShared = () => {} } = {}) => {
  const hot = new Map();
  const key = ({ command, cwd, config, route }) => createHash("sha256")
    .update(stableSerialize({ command, cwd, policy: policyFor(config), route: routeFor(route) }))
    .digest("hex");
  const get = (request) => {
    const digest = key(request);
    const time = now();
    const local = hot.get(digest);
    if (validRecord(local, time)) return local.verdict;
    if (local) hot.delete(digest);
    let store;
    try { store = readShared(); } catch { return null; }
    const shared = store?.[digest];
    if (!validRecord(shared, time)) return null;
    if (hot.size >= HOT_CACHE_CAP) hot.clear();
    // Promotion preserves classifiedAt, so it cannot extend the six-hour TTL.
    hot.set(digest, shared);
    return shared.verdict;
  };
  const put = ({ verdict, ...request }) => {
    if (verdict !== "SAFE" && verdict !== "RISKY") return;
    const digest = key(request);
    const record = { verdict, classifiedAt: now() };
    if (hot.size >= HOT_CACHE_CAP) hot.clear();
    hot.set(digest, record);
    try {
      const store = readShared();
      const next = store && typeof store === "object" && !Array.isArray(store) ? { ...store } : {};
      for (const [storedKey, stored] of Object.entries(next)) {
        if (!validRecord(stored, record.classifiedAt)) delete next[storedKey];
      }
      next[digest] = record;
      const keys = Object.keys(next);
      if (keys.length > SHARED_CACHE_CAP) {
        for (const oldKey of keys.slice(0, keys.length - SHARED_CACHE_CAP)) delete next[oldKey];
      }
      writeShared(next);
    } catch { /* cache persistence is best-effort */ }
  };
  return { get, put, key };
};
