// Optional integration with opencode-broker, a model router for opencode.
//
// The guard needs two things from the broker when (and only when) it is installed
// alongside:
//
//   * the session's routing PROFILE -- privacy profiles (the broker's `local`,
//     `private`, ...) must never have command text sent to a cloud classifier, so
//     the classifier consults the profile before choosing where (or whether) to
//     ask;
//   * the broker SOCKET -- a classifier lane that leases a model from the
//     broker, with `localOnly: true` for a privacy profile.
//
// Both are consumed through the broker's documented on-disk and socket contract,
// not a code dependency: profile records are one JSON file per session under
// <dir>/profiles/, and the broker speaks JSON-over-HTTP on <dir>/broker.sock,
// where <dir> defaults to ~/.local/share/opencode/model-routing. Without the
// broker every profile read falls back to "auto", the broker lane is simply
// absent, and the guard is a standalone safety floor whose classifier is whatever
// classifier.json names.
//
// READ-ONLY on purpose: profile records are written by the broker alone. The one
// gap a pure file read leaves is a fresh session whose record has not been written
// yet -- for that, the caller may pass the session's agent name, which maps the
// broker's own by-convention agents to their profiles.
import { readFileSync, statSync } from "node:fs";
import http from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";

export const defaultBrokerDir = () => join(homedir(), ".local/share/opencode/model-routing");
const brokerRoot = (dir) => (typeof dir === "string" && dir ? dir : defaultBrokerDir());
export const brokerSocket = (dir) => join(brokerRoot(dir), "broker.sock");
const profileDir = (dir) => join(brokerRoot(dir), "profiles");
const SESSION_ID = /^[A-Za-z0-9_-]{1,200}$/;

// Is there a broker to lease from? A socket file is the whole test: a broker that
// has crashed and left one behind fails at connect time, and that is an ordinary
// lane fault the caller already handles.
export const brokerAvailable = ({ dir, enabled = true } = {}) => {
  if (!enabled) return false;
  try { return statSync(brokerSocket(dir)).isSocket(); } catch { return false; }
};

// ☠️ DELIBERATELY NOT AN ALLOWLIST OF PROFILE NAMES, and it used to be one. This file is
// the privacy boundary: the classifier route treats every profile other than `auto` and
// `manual` as one whose command text may not leave local infrastructure, and it asks THIS
// function what the profile is. An allowlist means a profile the broker knows and this
// file does not returns null, resolution falls through to `auto`, and the restriction is
// silently skipped -- the failure is invisible and it fails OPEN. That is exactly what
// would have happened when the broker gained two new profiles in one release.
// The guard has NO code dependency on the broker -- it reads the state files as a
// documented contract -- so it CANNOT be kept in sync by import, and any hand-copied
// list here will drift. So validate the SHAPE and let the name through: an unknown
// profile is then treated as restrictive by the caller, which is the safe direction. A
// corrupted record reads as some non-auto string and fails CLOSED.
const PROFILE_NAME = /^[a-z][a-z0-9-]{0,63}$/;
const AGENT_PROFILES = {
  local: "local",
  private: "private",
  uncensored: "uncensored",
  "uncensored-offline": "uncensored-offline",
};

const readJson = (path) => {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
};

const normalizeRecord = (value) =>
  typeof value?.profile === "string" && PROFILE_NAME.test(value.profile)
    ? { profile: value.profile, explicit: value.explicit === true }
    : null;

const readSessionProfile = (sessionID, dir) =>
  typeof sessionID === "string" && SESSION_ID.test(sessionID)
    ? normalizeRecord(readJson(join(profileDir(dir), `${sessionID}.json`)))
    : null;

// Mirror of the broker's own resolution order: session record, then parent's,
// then the agent-name convention, then "auto".
// ☠️ There is NO global rung, and this file must not reintroduce one. A global posture
// is inherited by every session that never set its own, and this bridge is where that
// leaked into the safety gate: a global `uncensored` made the guard refuse to classify
// EVERY gray-zone command, in every session, in ~10ms, with no model consulted and
// nothing on screen to explain it. A start-screen choice is written onto the single
// session it was meant for, so it arrives here as that session's OWN record.
export const resolveProfileFor = ({ sessionID, parentID, agent, dir } = {}) => {
  const own = readSessionProfile(sessionID, dir);
  if (own) return { ...own, source: "session" };
  const parent = readSessionProfile(parentID, dir);
  if (parent) return { ...parent, source: "parent", explicit: false };
  const profile = AGENT_PROFILES[agent] ?? "auto";
  return { profile, explicit: false, source: profile === "auto" ? "default" : "agent" };
};

const brokerRequestOnce = (path, body = {}, { timeout = 2500, dir } = {}) => new Promise((resolve, reject) => {
  const payload = JSON.stringify(body);
  const request = http.request({
    socketPath: brokerSocket(dir),
    path,
    method: "POST",
    headers: { "content-type": "application/json", "content-length": Buffer.byteLength(payload) },
    timeout,
  }, (response) => {
    let text = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { text += chunk; });
    response.on("end", () => {
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : {}; } catch {}
      if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
        resolve(parsed ?? {});
        return;
      }
      reject(new Error(parsed?.error || `broker HTTP ${response.statusCode ?? "error"}`));
    });
  });
  request.on("timeout", () => request.destroy(new Error("broker timeout")));
  request.on("error", reject);
  request.end(payload);
});

// Same transient-retry semantics as the broker's own client (the socket protocol is
// the shared contract, not the code): one slow broker tick under host load must not
// surface as "classifier down".
const TRANSIENT = /broker timeout|ECONNREFUSED|ECONNRESET|EPIPE|ENOENT/;

export const brokerRequest = async (path, body = {}, options = {}) => {
  try {
    return await brokerRequestOnce(path, body, options);
  } catch (error) {
    if (!TRANSIENT.test(String(error?.message ?? ""))) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250));
    return brokerRequestOnce(path, body, options);
  }
};

// A lease answered for a local-only request must name a LAN target. The broker
// enforces `localOnly` itself; this check is for a broker old enough to ignore the
// flag, which would otherwise hand a privacy profile's command text to a cloud model.
export const leaseRespectsLocalOnly = (target, localOnly) => !localOnly || target?.kind === "local";
