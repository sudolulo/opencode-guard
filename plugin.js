// opencode-guard: permission modes and a shell safety floor for opencode.
//
// TWO KNOBS, DIFFERENT JOBS.
//
// The MODE (~/.config/opencode/mode, `oc-mode`) is the everyday one, the shape
// Claude Code has:
//   manual  ask about everything opencode would ask about   (the default)
//   edits   file edits and reads go through; shell still asks
//   auto    everything goes through, except a shell command the classifier will
//           not call SAFE -- that is REFUSED, with a reason the agent can act on
//   god     everything runs, nothing asks, and the safety floor stands aside --
//           per session and attended only; unattended runs keep the floor
// A per-session mode file (~/.local/share/opencode/modes/<sessionID>, written by a
// TUI integration) overrides the global one for that session.
//
// The LEVEL (~/.config/opencode/autoclass, `oc-auto`) is the escape hatch:
// `on` / `static` (no model call) / `off`.
//
// THE CLASSIFIER ONLY ANSWERS ONE QUESTION: may this run without asking anyone?
// So it is not consulted when there IS someone to ask. In manual and edits mode it
// never runs at all -- no model call, no latency, nothing to be wrong about. It runs
// in auto mode, to decide what may be waved through, and in an unattended session,
// where nobody can be asked.
//
// On every shell command, in manual, edits and auto:
//   1. cc-safety-net static analysis -> THROW on its deny verdict.
//   2. Credential stores -> THROW. In the plugin and not in a permission glob:
//      an agent's own `allow` block is appended after the global rules and the
//      LAST match wins, so any `cat *` grant would otherwise override the deny.
// Those two are the floor. God mode is the one stated bypass: it exists so that
// "no limits" is a mode a person switches on deliberately, rather than a reason
// to weaken the other three. Output redaction still runs in god mode -- it stops
// nothing from running, and a secret in a transcript is not a permission question.
//
// Then, only where the answer is "run it without asking" -- auto mode, or a session
// nobody can be asked in (`opencode run`, `opencode serve`, --auto) -- the
// classifier decides alone and FAILS CLOSED: a read short-circuits statically, a
// SAFE verdict passes, and RISKY or an unreachable classifier is a refusal. Manual
// and edits never reach that path -- their answer is a prompt, which costs a
// keypress rather than ending the task.
//
// Measured on 1.18.22: the `permission.ask` HOOK never fires, so a plugin cannot
// turn a verdict into a prompt; it can only throw, stand aside, or answer a
// permission that has already been raised. That is why auto mode refuses rather
// than asks: the alternative is a modal on every gray command, which is manual mode.
//
// The classifier is either the direct endpoint named by classifier.json or one
// unpinned `fleet-classifier` child routed by opencode-broker. Without either,
// unattended and auto shell commands that are not static reads are refused.
//
// Decisions are logged to ~/.local/share/opencode/autoclass.log. The tiers live
// in ./lib/policy.js, which is unit-tested; this file is the hook wiring, the
// model call, and the decision about what a verdict means.
//
// NOT this plugin's job: per-profile tool restrictions and offline sandboxing
// belong to the model router (opencode-broker), whose plugin enforces them in its
// own tool.execute.before hook -- hooks from different plugins all run, so a throw
// from either blocks the tool.
import { readFileSync, appendFileSync, statSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tool } from "/home/dev/.config/opencode/node_modules/@opencode-ai/plugin/dist/tool.js";

// The decision logic lives in ./lib/, not beside this file: opencode calls every
// export of a plugin module as a Plugin function and drops the whole module if any
// export is not one, so the pure functions cannot be exported from here for tests
// (it says so in its own log, but nothing surfaces in the TUI). The relative path
// resolves against this file's REAL path -- so a bare-file symlink into
// ~/.config/opencode/plugin/ resolves back into this checkout.
import {
  normalizeLevel, normalizeMode, normalizeGlobalMode, resolveTreeMode, shouldAutoApprove, isUnattended, redactSecrets, redactLogLine, revealActive,
  commandUnder, credentialAdvice, siteConfig,
  strip, commandIsRead, launderReason, bashRulesLoad, parserError, bashRulesFromRuleset, configDenyReason, bashDenyKind, blanketAlwaysPattern, touchesCredentials, touchesHardCredentials, touchesPromptableCredentials,
  nativeCredentialGuardBlocks, localNoThinkApplies, directFallbackWarranted, SYSTEM, classifierDecides,
  agentCapability, dispatchRefusal, staleToolRefusal, sessionIdle,
  nativeToolWritesControlFile, commandWritesControlFile,
} from "./lib/policy.js";
import { brokerAvailable, brokerRequest, resolveProfileFor } from "./lib/broker.js";
import { classifierConfig, classifierRoute, classifyDirect, verdictFromText } from "./lib/classifier.js";
import { createClassifierCache } from "./lib/classifier-cache.js";
import { createLoopGuard, createLoopGuardHook, loopGuardOptions } from "./lib/loop-guard.js";
import { createApprovalNotifier, createNotifier } from "./lib/notify.js";
import { readSessionIdentity } from "./lib/session-identity.js";
import { loadSafetyNet, safetyNetVerdict } from "./lib/safety-net.js";
import { createSessionTree, createTeamIndex, treeLookupDenial, treeRuleRefusal } from "./lib/tree.js";
import { AGENT_SHELL_ENV, AGENT_SPAWN_REFUSAL, agentSpawnRefusal } from "./lib/agent-spawn.js";
import { AUTHORITY_UNSUPPORTED, createAuthorityBroker, sessionOf } from "./lib/authority.js";
import { createRootLifecycle } from "./lib/lifecycle.js";
import { decideProposal } from "./lib/escalation.js";
import { pendingView } from "./lib/pending-view.js";

// Server plugins receive the legacy SDK client. The matching V2 client below
// keeps its embedded-app fetch transport while generating V2 request bodies.
// Guarded: this is an internal SDK path, and an import throw at module scope would
// unload the WHOLE module -- classifier, credential guards, cc-safety-net and
// redaction, all gone with one log line. With the guard, v2Client() throws
// instead, the classifier fails closed, and the rest of the floor keeps standing.
// The HOST's ~/.config/opencode install is preferred (its objects are the
// instances opencode itself uses), with normal package resolution as the
// fallback. cc-safety-net is the other way round (lib/safety-net.js): it is a
// pure function, so the version this package was tested with wins.
let createV2Client = null;
try {
  ({ createOpencodeClient: createV2Client } = await import(pathToFileURL(
    join(homedir(), ".config/opencode/node_modules/@opencode-ai/sdk/dist/v2/client.js"),
  ).href));
} catch {
  try {
    ({ createOpencodeClient: createV2Client } = await import("@opencode-ai/sdk/v2/client"));
  } catch (e) {
    try {
      appendFileSync(join(homedir(), ".local/share/opencode/autoclass.log"),
        new Date().toISOString() + " @opencode-ai/sdk v2 client unavailable: " + e + "\n");
    } catch {}
  }
}

const safetyNet = await loadSafetyNet();
if (!safetyNet.checkCommand) {
  try {
    appendFileSync(join(homedir(), ".local/share/opencode/autoclass.log"),
      new Date().toISOString() + " cc-safety-net unavailable: " + safetyNet.error + "\n");
  } catch {}
}
const FLAG = join(homedir(), ".config/opencode/autoclass");
// The mode is per session when a TUI integration publishes one file per session id
// (the two plugins are separate module instances with no other channel between
// them). A session with no file of its own inherits the global default, which is
// what `oc-mode` writes and what a headless run sees.
const MODE_DIR = join(homedir(), ".local/share/opencode/modes");
const MODE_FLAG = join(homedir(), ".config/opencode/mode");
const REVEAL_FLAG = join(homedir(), ".config/opencode/reveal");
const LOG = join(homedir(), ".local/share/opencode/autoclass.log");
// The broker lane's budget. The routed fleet-classifier must answer in one word
// inside it; the broker selects the model and reasoning variant for that child.
const CLASSIFIER_TIMEOUT_MS = 12_000;
// How long a broker-lane classifier's disposable session may take to go idle after
// its abort before cleanup gives up and leaves it (logged as classifier-cleanup-deferred).
const CLEANUP_IDLE_MS = 10_000;

const level = () => {
  try { return normalizeLevel(readFileSync(FLAG, "utf8")); } catch { return "on"; }
};
const revealing = () => {
  try { return revealActive(readFileSync(REVEAL_FLAG, "utf8"), Date.now()); } catch { return false; }
};
const globalMode = () => {
  // normalizeGlobalMode: the global flag is only a default sessions inherit, and
  // god is per-session by design -- a hand-written global "god" resolves to auto.
  try { return normalizeGlobalMode(readFileSync(MODE_FLAG, "utf8")); } catch { return "manual"; }
};
const sessionMode = (sessionID) => {
  if (!sessionID) return null;
  try { return normalizeMode(readFileSync(join(MODE_DIR, sessionID), "utf8")); }
  catch { return null; }
};
// Not a whitelist of "safe" tools -- the opposite. Everything is redacted except
// the tools that feed an edit, because those write what they read back to disk.
const REDACT_EXEMPT = new Set(["read", "edit", "write", "patch"]);

const LOG_MAX_BYTES = 512 * 1024;
const log = (verdict, cmd) => {
  try {
    // Truncate rather than rotate: this is a decision trail for debugging, not
    // an audit record, and an unbounded file on a host that runs agents all day
    // is exactly the "never auto-consume disk" failure mode.
    if (statSync(LOG, { throwIfNoEntry: false })?.size > LOG_MAX_BYTES) {
      writeFileSync(LOG, `${new Date().toISOString()} --- truncated ---\n`);
    }
    // Secrets in a command line are masked before the cut, so truncation cannot expose half of one.
    appendFileSync(LOG, `${new Date().toISOString()} ${verdict} ${redactLogLine(cmd).slice(0, 300)}\n`);
  } catch {}
};

// One deny text for every credential tier, with the deployment's own "here is
// the sanctioned way to use a secret" advice appended from config.
const credentialDeny = (detail) =>
  `[opencode-guard] blocked: this command names a credential store (${detail}). ` +
  credentialAdvice() +
  " Do not rephrase to evade this; if the task genuinely needs the value, ask the user.";

const controlDeny =
  "[opencode-guard] blocked: this changes one of the guard's own switches (its mode, level, " +
  "reveal window or classifier config). A person sets those, with oc-mode, oc-auto or oc-reveal " +
  "in their own terminal. If the change is really needed, say so and let the user make it.";

const REVEAL_ARM_REFUSAL =
  "[opencode-guard] blocked: the reveal window is armed by a person at a " +
  "terminal, not from a session -- otherwise redaction would be something " +
  "you could switch off for yourself. If you need an unredacted value, say " +
  "so and let the user run `oc-reveal` themselves.";
const armsReveal = (command) => /\boc-reveal\b/.test(command) || /\.config\/opencode\/reveal\b/.test(command);

// The 2026-10-14 god escalation policy (docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md).
// Native-asking tools -> the permission each one asks for. Only these guarantee a native ask,
// so only these may defer a guard floor from tool.execute.before to the permission hook.
const DEFERRABLE = { bash: "bash", read: "read", glob: "glob", grep: "grep", edit: "edit", write: "edit" };
// Process tools that never ask natively. On a host advertising beforeAsk, the guard asks native
// for an exact `bash` ask on the call (tool.execute.before output.ask), which makes them
// deferrable exactly like bash: their floors and root-policy routes reach the permission hook.
const ASKABLE = { bg_run: "bash", pty_spawn: "bash" };
// A deferred effect is correlated by its exact native call. Any part missing means there is
// no safe key, never the shared string "undefined".
const escalationKey = (sessionID, callID, permission) =>
  [sessionID, callID, permission].every((part) => typeof part === "string" && part !== "")
    ? `${sessionID}\u0000${callID}\u0000${permission}` : null;
// A call's IDENTITY (its root binding) is keyed by the exact call alone, so every permission the
// call raises (bash, then external_directory, ...) is judged with it; RESTRICTIONS (stashes,
// root-policy markers) and judged marks stay keyed by the exact permission and never cross.
const callKey = (sessionID, callID) =>
  [sessionID, callID].every((part) => typeof part === "string" && part !== "") ? `${sessionID}\u0000${callID}` : null;
// A judged mark settles only the request whose patterns the hook saw.
const requestFingerprint = (patterns) => JSON.stringify(Array.isArray(patterns) ? patterns : []);
const ESCALATION_LIMIT = 500;
const ESCALATION_TTL_MS = 10 * 60 * 1000;
// A hook error's class for the escalation logs, never its message: an SDK error can carry the
// request body (and so the command). The guard's own authority errors are one class.
const errorClass = (error) => {
  if (typeof error?.code === "string" && /^[A-Z_]{1,40}$/.test(error.code)) return error.code;
  if (/^\[opencode-guard\] permission authority unavailable/.test(String(error?.message ?? ""))) return "authority-unavailable";
  return typeof error?.name === "string" && /^[A-Za-z]{1,40}$/.test(error.name) ? error.name : "error";
};

export const OpencodeGuard = async ({ client, directory }) => {
  if (process.env[AGENT_SHELL_ENV] === "1") {
    // Not a thrown error: a plugin that throws at load is skipped and OpenCode carries on.
    process.stderr.write(`${AGENT_SPAWN_REFUSAL}\n`);
    process.exit(78);
  }
  // An opencode config the guard cannot read makes the launder floor fail closed
  // (it then judges every command as natively allowed). That must not be silent:
  // it means the guard and opencode no longer agree on what runs unprompted.
  const reportError = async (kind, message) => {
    log(kind, message);
    try {
      await client?.app?.log?.({ body: { service: "opencode-guard", level: "error", message } });
    } catch (error) {
      log(`${kind}-unreported`, error?.message ?? error);
    }
  };
  if (bashRulesLoad.error) {
    await reportError("config-error", `opencode-guard: could not read the opencode permission config (${bashRulesLoad.error}); ` +
      "the launder floor is judging every command as allowed until it can");
  }
  // Without the bash parser the launder floor cannot see into loops, subshells or
  // substitutions, so it refuses every command that has them until this is fixed.
  if (parserError) {
    await reportError("parser-error", `opencode-guard: the bash parser did not load (${parserError}); ` +
      "the launder floor refuses commands with compound syntax until it does");
  }
  // The launder floor judges with the ruleset the session's agent actually runs under:
  // opencode merges its defaults, the global and project configs and the agent's own
  // block, and appends the agent's rules after the global ones (last match wins).
  // chat.params names a session's agent; client.app.agents() returns each merged
  // ruleset. Unknown agent or no answer: the global config, and an error says so.
  // permission.asked id -> the `always` patterns an "Always" reply would save.
  const alwaysPatterns = new Map();
  const sessionAgents = new Map();
  // A routed classifier's prompt must use the same no-think provider list as the
  // route/cache snapshot that created it. classifier.json can change between the
  // child create and OpenCode's chat.params hook, so retain an immutable per-child
  // copy and its native incarnation only for guard-owned disposable classifier sessions.
  const classifierNoThinkProviders = new Map();
  const CLASSIFIER_SNAPSHOT_CAP = 300;
  // This cap bounds guard-tracked snapshots plus pending creates, not all unknown
  // remote create side effects. Reserve before awaiting so a burst cannot all see
  // a non-full snapshot map.
  const classifierSnapshotReservations = new Set();
  const SESSION_AGENTS_CAP = 2000;
  let agentRules = null;
  let agentRulesAt = 0;
  let agentRulesFailed = false;
  const loadAgentRules = async () => {
    agentRulesAt = Date.now();
    try {
      const response = await client.app.agents({ query: { directory } });
      const list = response?.data ?? response;
      if (!Array.isArray(list)) throw new Error("the agent list had an unexpected shape");
      const map = new Map();
      for (const agent of list) {
        const rules = bashRulesFromRuleset(agent?.permission);
        if (typeof agent?.name === "string" && rules) map.set(agent.name, rules);
      }
      agentRules = map;
      agentRulesFailed = false;
    } catch (error) {
      if (!agentRulesFailed) {
        await reportError("agent-rules-error", `opencode-guard: could not read the agents' permission rulesets (${error?.message ?? error}); ` +
          "the launder floor is judging with the global config only, so an agent's own allow rules are not seen");
      }
      agentRulesFailed = true;
    }
  };
  const rulesFor = async (sessionID) => {
    const agent = sessionAgents.get(sessionID);
    if (!agent) return undefined;
    if (!agentRules?.has(agent) && Date.now() - agentRulesAt > 30_000) await loadAgentRules();
    return agentRules?.get(agent);
  };
  const handled = new Set();
  // Denials raised by a DELEGATED child, keyed by the parent session that dispatched
  // it. A child that is refused something just returns a thinner answer; without
  // this the parent cannot tell a complete result from a crippled one. Keyed by
  // parent because `tool.execute.after` for the `task` tool runs in the PARENT, so
  // the child's own session id is not in hand there. Drained on read, so an entry
  // lives exactly as long as the task that produced it.
  const denials = new Map();
  const noteDenial = (parentID, entry) => {
    if (!parentID) return;
    const list = denials.get(parentID) ?? [];
    if (list.length < 20) list.push(entry);
    denials.set(parentID, list);
    if (denials.size > 200) denials.clear();
  };
  // Deferred escalations (2026-10-14 policy). A STASH is a guard floor refusal carried from
  // tool.execute.before to the permission.ask hook of the SAME native call (exact session,
  // call and permission), where it becomes an annotated ask. A JUDGED mark is an operator ask
  // this guard proposed and will settle itself with the root's judgment. Both are deferred
  // effects of the root, so both carry the root binding captured when the request began.
  // A stash is a restriction, so it is never forgotten while its call may still arrive. At most
  // ESCALATION_LIMIT keys are held. Past ESCALATION_TTL_MS a stash is EXPIRED in place: its
  // payload (reason, binding) is dropped, but a minimal tombstone keeps the SAME slot until the
  // call's own hook (which denies it) or its tool completion consumes it. Nothing else removes a
  // key -- no sweep, no eviction, not session.deleted (a late event for an older session
  // incarnation must not erase a live restriction). When every slot is taken a NEW deferral is
  // refused before its tool runs, never by dropping an accepted one. The cost: tombstones of
  // calls that never complete hold slots, and so apply backpressure, until a process restart.
  const pendingEscalations = new Map();
  const judged = new Map();
  const prune = (map, now, onDrop) => {
    for (const [key, entry] of map) {
      if (now - entry.at <= ESCALATION_TTL_MS && map.size <= ESCALATION_LIMIT) break;
      map.delete(key);
      onDrop?.(key, entry);
    }
  };
  // Entries are appended in time order and a tombstone keeps its slot (Map.set on an existing
  // key keeps its position), so the first live entry inside the time limit ends the scan.
  // The same slots also hold ROOT-POLICY route markers (root-policy round): when a non-god
  // session's bash call skips the guard floors because the ROOT's effective rules deny it, the
  // marker { route: "root-policy", rootDeny } carries that restriction to the call's own hook.
  // A marker has no `kind`: it is never a floor escalation and never reaches the table as one.
  const entryLabel = (entry) => `${entry.kind ?? entry.route}/${entry.cls}`;
  const expireStashes = (now) => {
    for (const [key, entry] of pendingEscalations) {
      if (entry.expired) continue;
      if (now - entry.at <= ESCALATION_TTL_MS) break;
      pendingEscalations.set(key, {
        expired: true, at: entry.at, kind: entry.kind, route: entry.route, cls: entry.cls, permission: entry.permission, sessionID: entry.sessionID,
      });
      log("escalation-expired", `${entryLabel(entry)} for ${entry.permission} in ${entry.sessionID}: ` +
        "the call did not reach its permission hook in time; its slot is kept and the call is denied if it still does");
    }
  };
  const stash = (key, entry) => {
    const now = Date.now();
    expireStashes(now);
    if (!pendingEscalations.has(key) && pendingEscalations.size >= ESCALATION_LIMIT) {
      log("escalation-capacity", `${entryLabel(entry)} for ${entry.permission} in ${entry.sessionID}: ` +
        `${ESCALATION_LIMIT} deferred floors are waiting; this call is refused before its tool runs`);
      throw new Error(`[opencode-guard] blocked: ${ESCALATION_LIMIT} deferred guard floors are already waiting for their ` +
        `permission hooks, so this call cannot defer its own (${entry.cls}) and is refused rather than run without it. ` +
        "Retry once pending calls have finished.");
    }
    pendingEscalations.delete(key);
    pendingEscalations.set(key, { ...entry, at: now });
  };
  const takeStash = (key) => {
    if (!key) return {};
    expireStashes(Date.now());
    const entry = pendingEscalations.get(key);
    if (!entry) return {};
    pendingEscalations.delete(key);
    return entry.expired ? { expired: entry } : { entry };
  };
  // The ORIGINAL root binding of an attended descendant's call (any tool), captured in
  // tool.execute.before before any asynchronous rule or floor work and keyed by the exact call
  // (session, call), with the tool that made it. It serves every permission.ask that call raises
  // until its tool.execute.after (root-policy round): each ask validates it, and an operator ask
  // the guard settles is bound to it. Unlike a stash it is an ELIGIBILITY, not a restriction:
  // losing one (expired, evicted) only means the guard does not settle that call's operator asks
  // itself and does not re-validate its root, and the person answers. So it may be evicted.
  const callContexts = new Map();
  const keepContext = (key, context) => {
    const now = Date.now();
    callContexts.delete(key);
    callContexts.set(key, { ...context, at: now });
    prune(callContexts, now, (_key, dropped) => log("call-context-evicted",
      `${dropped.tool} in ${dropped.sessionID}: its root binding was dropped; an operator ask from it is left for the person`));
  };
  const getContext = (key) => {
    if (!key) return undefined;
    const entry = callContexts.get(key);
    return entry && Date.now() - entry.at <= ESCALATION_TTL_MS ? entry : undefined;
  };
  // A root's mode as authority.rootContext reads it, re-read synchronously right before a
  // deferred effect is emitted so a flip during an earlier await never applies a stale snapshot.
  // A root with no mode file of its own runs under the global mode (root-policy round), exactly
  // as modeFor resolves it; never a guessed "auto".
  const rootModeOf = (sessionID) => sessionMode(sessionID) ?? globalMode();
  const markJudged = (key, entry) => {
    const now = Date.now();
    judged.delete(key);
    judged.set(key, { ...entry, at: now });
    prune(judged, now, (_key, dropped) => log("judged-evicted", `${dropped.permission} in ${dropped.sessionID}: left for the person`));
  };
  const takeJudged = (key) => {
    if (!key) return undefined;
    prune(judged, Date.now(), (_key, dropped) => log("judged-evicted", `${dropped.permission} in ${dropped.sessionID}: left for the person`));
    const entry = judged.get(key);
    judged.delete(key);
    return entry;
  };
  let v2;

  const v2Client = () => {
    if (v2) return v2;
    if (!createV2Client) throw new Error("@opencode-ai/sdk v2 client unavailable (see autoclass.log)");
    const transport = client?.session?._client;
    const config = transport?.getConfig?.();
    if (!config?.baseUrl || typeof config.fetch !== "function") {
      throw new Error("OpenCode embedded transport is unavailable");
    }
    const headers = config.headers instanceof Headers
      ? Object.fromEntries(config.headers.entries())
      : config.headers;
    // `fetch` is Server.Default().app.fetch in embedded TUI instances. Reusing it
    // avoids the unreachable localhost URL while V2 supplies path/body encoding.
    v2 = createV2Client({
      baseUrl: config.baseUrl,
      fetch: config.fetch,
      headers,
      directory,
      // Classifier session creation must fail closed on a non-2xx response instead
      // of continuing with an SDK `{ error }` result as if it were a session.
      throwOnError: true,
    });
    return v2;
  };

  // Profile records are written by opencode-broker (when installed); this plugin
  // only READS them through lib/broker.js. The one race a pure file read leaves is
  // a fresh session whose record is not written yet, so the session's parent/agent
  // are fetched once and remembered -- a record on disk always wins, so an
  // explicit mid-session profile switch is honored on the next call.
const sessionInfo = new Map();
// Shared by profileFor and modeFor: both need the session's parent, and neither
// should pay for a second lookup. A failed fetch returns null so each caller
// keeps its own pre-parent answer rather than inventing one.
const infoFor = async (sessionID) => {
  if (!sessionID) return null;
  if (sessionInfo.has(sessionID)) return sessionInfo.get(sessionID);
  try {
    const payload = await v2Client().v2.session.get({ sessionID });
    const info = sessionOf(payload);
    if (sessionInfo.size > 500) sessionInfo.clear();
    const record = { parentID: info?.parentID, agent: info?.agent };
    sessionInfo.set(sessionID, record);
    return record;
  } catch {
    return null;
  }
};
const profileFor = async (sessionID, dir) => {
  const resolved = resolveProfileFor({ sessionID, dir });
  if (resolved.source !== "default" || !sessionID) return resolved;
  const info = await infoFor(sessionID);
  if (!info) return resolved;
  return resolveProfileFor({ sessionID, parentID: info.parentID, agent: info.agent, dir });
};
// Where a command for this session may be judged, and whether at all. See
// classifierRoute in lib/classifier.js: a privacy profile only ever reaches a
// local lane, and no lane at all is a refusal rather than a cloud call.
  const routeFor = async (sessionID) => {
  const config = classifierConfig();
  const profile = (await profileFor(sessionID, config.brokerDir)).profile;
  return {
    profile,
    config,
    ...classifierRoute({
      profile,
      config,
      brokerAvailable: brokerAvailable({ dir: config.brokerDir, enabled: config.broker }),
    }),
  };
};
// A delegated child has no mode file of its own, so it used to fall straight to
// the global default -- measured as `manual`, the most restrictive mode. That made
// every subagent permission a prompt for the operator (the manual-mode return in
// the permission handler logs nothing, so it left no trace) and skipped the
// classifier entirely for a child's bash. A child now inherits, capped below god
// by normalizeGlobalMode.
// G3 (agent teams, 1.7.0): a session with no file of its own runs under the
// STRICTER of (a) the one-level answer -- its immediate parent's file, else the
// global mode -- and (b) the nearest ancestor that has a file, else the global
// mode (resolveTreeMode in lib/policy.js). (a) alone let a grandchild of a root
// set to manual run under a looser global mode. The ancestry comes from
// sessionTree (lib/tree.js): the legacy client's session.get, each parent link
// cached for the life of the process because parentID never changes. An ancestry
// that cannot be read THROWS a denial naming G3 instead of falling to the global
// mode, which may be looser than every ancestor.
// sessionTree closes over the PluginInput client, so it is built in the factory.
const sessionTree = createSessionTree({ client, directory });
// The teammate classification G4 needs (lib/tree.js), over the same tree. The event
// hook feeds it task parts; on a miss it pages the root's history.
const teamIndex = createTeamIndex({ client, directory, tree: sessionTree });
// ☠️ modeFor MUST stay inside the factory, below infoFor -- infoFor closes over
// v2Client, which closes over the PluginInput client, so neither can live at
// module scope. Declared above the factory (0.4.8) it threw "infoFor is not
// defined" on EVERY tool call in a child session, and only a child: line 2 below
// short-circuits for any session that has its own mode file, which the root
// always does. Importing the module cannot catch that -- the reference is only
// evaluated when called -- so the guard is a source-order test.
const modeFor = async (sessionID) => {
  const own = sessionMode(sessionID);
  if (own) return own;
  // No session id means no ancestry to inherit from: the global mode, as before 1.7.0.
  if (!sessionID) return globalMode();
  let chain;
  try {
    chain = await sessionTree.ancestry(sessionID);
  } catch (error) {
    log("deny(G3/ancestry)", `${sessionID}: ${error?.message ?? error}`);
    throw new Error(treeLookupDenial("G3", error));
  }
  const parent = chain.length > 1 ? sessionMode(chain[1]) : null;
  const nearest = chain.slice(1).map((id) => sessionMode(id)).find(Boolean) ?? null;
  return resolveTreeMode({ own, parent, nearest, fallback: globalMode() });
};

  // The v2 client reuses OpenCode's embedded transport. Do not construct it until
  // authority is actually requested: an old host must retain the rest of the guard.
  const approvalLifecycle = createRootLifecycle({
    onError: (error) => log("approval-lifecycle-error", error?.message ?? error),
    onDebug: (error) => log("approval-lifecycle-debug", error?.message ?? error),
    // Only the parent links this process has already read (abort fencing is
    // synchronous). Unknown sessions answer false and still tombstone.
    // Assumes a cached child link is never reused for a root: if a child's delete event is lost and its ID is later recreated as a root, that root's aborts would wrongly skip tombstoning.
    isChild: (sessionID) => {
      const parent = sessionTree.knownParent(sessionID) ?? sessionInfo.get(sessionID)?.parentID;
      return typeof parent === "string" && parent !== "";
    },
  });
  const authority = createAuthorityBroker({
    v2: new Proxy({}, { get: (_target, key) => v2Client()[key] }),
    directory,
    tree: sessionTree,
    rootMode: async (sessionID) => rootModeOf(sessionID),
    lifecycle: approvalLifecycle,
    onError: (error) => log("approval-authority-error", error?.message ?? error),
    onDebug: (error) => log("approval-authority-debug", error?.message ?? error),
  });
  // The capability is optional. Old hosts retain their unversioned cleanup calls;
  // a host that advertises incarnations must give cleanup the create response's ID.
  let classifierIncarnationSupport;
  const classifierIncarnations = async () => {
    if (classifierIncarnationSupport !== undefined) return classifierIncarnationSupport;
    try {
      const reply = await v2Client().experimental.capabilities.get({ directory });
      const capabilities = reply?.data?.data ?? reply?.data ?? reply;
      classifierIncarnationSupport = capabilities?.sessionIncarnation === 1;
    } catch (error) {
      log("classifier-incarnation-capability-unavailable", error?.message ?? error);
      classifierIncarnationSupport = false;
    }
    return classifierIncarnationSupport;
  };

  // Sterile-repeat loop guard (lib/loop-guard.js). The parent comes from the same
  // cached lookup modeFor uses, with the legacy client as a second source; a session
  // whose parent cannot be proved reads as a root, which is only ever warned and
  // never aborted.
  const loopOptions = loopGuardOptions(siteConfig().loopGuard);
  const notifier = createNotifier({ client, directory });
  const approvalNotifier = createApprovalNotifier({
    sdk: new Proxy({}, { get: (_target, key) => v2Client()[key] }),
    directory,
    identityFor: (sessionID) => readSessionIdentity({ sdk: v2Client(), directory, sessionID }),
    current: (sessionID, permissionID, incarnationID) => authority.current({ sessionID, permissionID, incarnationID }),
    lifecycle: approvalLifecycle,
    onError: (error) => log("approval-notify-error", error?.message ?? error),
  });
  const loopHook = createLoopGuardHook({
    guard: loopOptions.enabled ? createLoopGuard(loopOptions) : null,
    parentOf: async (sessionID) => {
      const known = (await infoFor(sessionID))?.parentID;
      if (known) return known;
      try {
        const got = await client.session.get({ path: { id: sessionID }, query: { directory } });
        return (got?.data ?? got)?.parentID ?? null;
      } catch { return null; }
    },
    notify: (sessionID, text) => notifier.notify(sessionID, text),
    abort: (sessionID) => client.session.abort({ path: { id: sessionID }, query: { directory } }),
    onError: (error) => log("loop-guard-error", error?.message ?? error),
  });

  // Secret values out of a tool's output, in every mode. Its own early returns are
  // why it is a function: the loop guard after it must still see every tool call.
  const redact = (input, output) => {
    if (REDACT_EXEMPT.has(input?.tool)) return;
    if (typeof output?.output !== "string" || !output.output) return;

    // snip truncates long output and names the full copy in a TRAILER -- but an
    // agent parses from the top, hits the cut, and has retried before it ever
    // reads that far (measured: a truncated JSON stream cost a retry loop).
    // Hoist the path to the FIRST line, where a parser fails into it.
    const tee = output.output.match(/\[full output: (\/[^\]\n]+)\]\s*$/);
    if (tee) {
      output.output = `[snip truncated this output -- the COMPLETE copy is at ${tee[1]}; read that file instead of re-running]\n` + output.output;
    }

    // While the window is open nothing is redacted, but the output says so. A
    // transcript that contains a secret should not look like one that does not.
    if (revealing()) {
      const { count } = redactSecrets(output.output);
      if (count) {
        output.output += `\n[opencode-guard: reveal window open -- ${count} secret value${count === 1 ? "" : "s"} left UNREDACTED in this output]`;
        log(`reveal(${count})`, String(input?.tool));
      }
      return;
    }

    const { text, count } = redactSecrets(output.output);
    if (!count) return;
    // Say so in the output itself: an agent that silently gets a marker where a
    // value should be will otherwise assume the command failed and retry it.
    output.output = text + `\n[opencode-guard redacted ${count} secret value${count === 1 ? "" : "s"} from this output]`;
    log(`redacted(${count})`, String(output?.title ?? input.tool));
  };

  // Report a failure or settle (forget) the classifier child's lease. The broker
  // accepts a settlement only with its broker-minted leaseID -- a sessionID alone is
  // refused ("lease id is required for settlement") -- and the guard did not mint the
  // lease (the router's chat.message did), so it reads it back with /lease/verify. No
  // live lease means nothing to settle. A refusal is logged, never swallowed: a silent
  // catch here leaked every classifier lease until the broker's idle reaper took it.
  const settleClassifierLease = async (path, sessionID, extra, dir) => {
    let leaseID = null;
    try {
      const held = await brokerRequest("/lease/verify", { sessionID }, { dir });
      leaseID = held?.held && typeof held.leaseID === "string" ? held.leaseID : null;
    } catch (error) {
      log("classifier-lease-verify-failed", `${sessionID} ${error?.message ?? error}`);
      return;
    }
    if (!leaseID) return;
    try {
      await brokerRequest(path, { sessionID, leaseID, ...extra }, { dir });
    } catch (error) {
      log(`classifier-${path.slice(1)}-refused`, `${sessionID} ${error?.message ?? error}`);
    }
  };

  // The broker lane: create one ordinary routed classifier child and clean it up.
  // The broker's chat.message hook owns model selection and the child's one lease;
  // the guard owns the child lifecycle and reports against its real session ID.
  const classifyRouted = async (command, cwd, parentSessionID, config) => {
    let sessionID = null;
    let incarnationID = null;
    let useIncarnation = false;
    let snapshotReservation = null;
    let snapshotEntry = null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
    try {
      if (typeof parentSessionID !== "string" || !parentSessionID.startsWith("ses")) {
        throw new Error("classifier requires an OpenCode parent session");
      }
      if (classifierNoThinkProviders.size + classifierSnapshotReservations.size >= CLASSIFIER_SNAPSHOT_CAP) {
        throw new Error(`classifier session capacity exhausted (${CLASSIFIER_SNAPSHOT_CAP} active snapshots)`);
      }
      snapshotReservation = Symbol("classifier snapshot reservation");
      classifierSnapshotReservations.add(snapshotReservation);
      useIncarnation = await classifierIncarnations();

      // A classifier must be a child of the requesting session. Root sessions made
      // through the V2 endpoint do not inherit this embedded instance's OAuth
      // provider context, while ordinary Task children do.
      const createdSession = await v2Client().session.create({
        parentID: parentSessionID,
        title: "opencode-guard command classifier",
        agent: "fleet-classifier",
      }, { signal: controller.signal });
      // Hey wraps the HTTP response in `data`, and the OpenCode V2 endpoint wraps
      // its SessionV2Info in another `data`. Accept either response style so the
      // classifier always uses OpenCode's allocated session ID.
      const createdInfo = createdSession?.data?.data ?? createdSession?.data ?? createdSession;
      sessionID = createdInfo?.id;
      if (typeof sessionID !== "string" || !sessionID.startsWith("ses")) {
        throw new Error("OpenCode did not return a classifier session ID");
      }
      incarnationID = createdInfo?.incarnationID;
      if (useIncarnation && (typeof incarnationID !== "string" || incarnationID === "")) {
        throw new Error("OpenCode did not return a classifier session incarnation ID");
      }
      snapshotEntry = {
        providers: Object.freeze([...(config?.noThinkProviders ?? [])]),
        incarnationID,
      };
      classifierNoThinkProviders.set(sessionID, snapshotEntry);
      classifierSnapshotReservations.delete(snapshotReservation);
      snapshotReservation = null;
      // The legacy prompt endpoint runs through the same authenticated provider
      // resolution as an ordinary Task child and returns the completed assistant
      // message. The V2 prompt endpoint cannot carry the resolved OAuth context.
      const prompted = await client.session.prompt({
        path: { id: sessionID },
        query: { directory },
        signal: controller.signal,
        body: {
          agent: "fleet-classifier",
          system: config?.system ?? SYSTEM,
          tools: {},
          parts: [{ type: "text", text: `cwd: ${cwd}\ncommand: ${command}\n\nReply SAFE or RISKY only.` }],
        },
      });
      // ☠️ The SDK does NOT throw on a non-2xx unless the call passed
      // `throwOnError: true`. It returns the result tuple with `data` undefined
      // and the parsed body under `error` -- its own error-interceptor says so:
      // "Callers that read result.error directly get the parsed body unchanged".
      // `prompted?.data ?? prompted` therefore fell back to the ENVELOPE, which
      // has no `parts`, so EVERY transport, auth and provider failure arrived
      // below as "classifier returned no text" -- the one verdict deliberately
      // excluded from provider health, so a broken lane was never benched and
      // stayed at the front of the ladder indefinitely. Measured 2026-09-02:
      // 155 empty responses in 161 leases of one lane, real cause never recorded.
      // Read the error FIRST so a real fault can be treated as one.
      if (prompted?.error !== undefined && prompted?.error !== null) {
        const status = prompted?.response?.status;
        const body = prompted.error;
        const message = body?.data?.message ?? body?.message ?? body?.name
          ?? String(JSON.stringify(body) ?? body).slice(0, 200);
        throw new Error(`classifier request failed${status ? ` (HTTP ${status})` : ""}: ${message}`);
      }
      const completed = prompted?.data ?? prompted;
      const parts = Array.isArray(completed?.parts) ? completed.parts : [];
      // Reasoning models may emit the answer in a reasoning part,
      // not a "text" part -- reading only type==="text" saw nothing and blamed
      // the provider. Prefer text parts; fall back to ANY part carrying text.
      let text = parts.filter((p) => p?.type === "text").map((p) => p.text).join("\n").trim();
      if (!text) text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("\n").trim();
      // A 200 carrying an assistant-side error (a provider fault opencode
      // recorded on the message instead of the response) is a lane fault too,
      // not a model that chose to answer with nothing.
      if (!text && completed?.info?.error) {
        const e = completed.info.error;
        throw new Error(`classifier model error: ${e?.data?.message ?? e?.message ?? e?.name ?? String(e)}`);
      }
      if (!text) throw new Error("classifier returned no text");
      return verdictFromText(text);
    } catch (error) {
      // ☠️ HTTP 499 IS OUR OWN ABORT, seen from the far side. When the timeout above
      // fires it tears down the HTTP client; opencode records "client closed request"
      // and the SDK hands it back as a response error, so it arrives here as a plain
      // Error named "Error" -- `AbortError` never matches, and the 499 was reported as
      // a provider fault. Two of them quarantined a local provider on 2026-09-17 while
      // its classifier was answering every request that actually waited for it.
      const clientClosed = /\(HTTP 499\)|\bHTTP 499\b|client closed request/i.test(String(error?.message ?? ""));
      const aborted = error?.name === "AbortError" || clientClosed;
      const noText = /classifier returned no text/.test(String(error?.message ?? ""));
      const detail = aborted ? "timeout" : String(error?.message ?? error);
      // Our own impatience (abort) or an unparsable/empty classifier response
      // is NOT a provider fault -- indicting the lane for it benched a healthy
      // cloud lane and flagged its whole provider. Only a genuine transport or
      // provider error indicts; the lease is released in `finally` either way.
      // Empty/timeout falls back to the safe default without touching provider
      // health.
      if (sessionID && !aborted && !noText) {
        await settleClassifierLease("/failure", sessionID, { error: detail }, config?.brokerDir);
      }
      return `error:${detail}`;
    } finally {
      clearTimeout(timer);
      if (snapshotReservation) classifierSnapshotReservations.delete(snapshotReservation);
      if (sessionID) {
        const cleanupQuery = useIncarnation ? { directory, incarnationID } : { directory };
        const checkedCleanup = async (operation) => {
          const got = await operation();
          if (got?.error !== undefined && got?.error !== null) {
            throw new Error(`HTTP ${got?.response?.status ?? "?"}: ${got.error?.message ?? got.error?.name ?? got.error}`);
          }
        };
        // The classifier timeout aborts the HTTP client, not necessarily the server-side
        // agent loop. Deleting immediately raced that loop's final step-start write and
        // turned a routine timeout into a SQLite foreign-key error. Stop the disposable
        // loop, then wait until opencode reports it idle before removing its message history.
        try {
          await checkedCleanup(() => client.session.abort({ path: { id: sessionID }, query: cleanupQuery }));
        } catch (error) {
          log("classifier-cleanup-abort-failed", `${sessionID} ${error?.message ?? error}`);
        }
        try {
          // ☠️ THE IDLE BARRIER IS A STATUS POLL, not `v2.session.wait`. That call exists
          // only on the V2 group (calling `.session.wait` threw "is not a function", 99
          // leaks), and on OpenCode 1.18 it is an unimplemented stub that rejects with
          // "Session wait is not available yet" -- so every delete deferred and every
          // broker-lane classification leaked its session. `/session/status` is the same
          // supported endpoint the D0 check reads.
          const deadline = Date.now() + CLEANUP_IDLE_MS;
          let idle = false;
          while (!idle && Date.now() < deadline) {
            const got = await client.session.status({ query: { directory } });
            idle = sessionIdle(got?.error ? null : got?.data, sessionID);
            if (!idle) await new Promise((r) => setTimeout(r, 250));
          }
          if (!idle) throw new Error(`still busy after ${CLEANUP_IDLE_MS}ms`);
          await checkedCleanup(() => client.session.delete({ path: { id: sessionID }, query: cleanupQuery }));
          // Keep the immutable policy through every late chat.params until the
          // disposable session is demonstrably gone.
          if (classifierNoThinkProviders.get(sessionID) === snapshotEntry) {
            classifierNoThinkProviders.delete(sessionID);
          }
        } catch (error) {
          // A leaked disposable session is safer than deleting beneath a loop that has
          // not proved it is idle; a later operator cleanup can remove the row safely.
          log("classifier-cleanup-deferred", `${sessionID} ${error?.message ?? error}`);
        }
        await settleClassifierLease("/forget", sessionID, {}, config?.brokerDir);
      }
    }
  };

  // A configured endpoint is tried DIRECTLY first, and the broker lane (when it is
  // in the route) is its fallback. classifyDirect creates no opencode session, so
  // the common path cannot leak one; classifyRouted does, and is reached only when
  // it is the only lane or the direct one failed fast. The timeout exclusion is
  // directFallbackWarranted in lib/policy.js, where it is tested.
  const classify = async (command, cwd, sessionID, route, config) => {
    const broker = route.lanes.includes("broker");
    if (route.lanes.includes("direct")) {
      const verdict = await classifyDirect({ command, cwd, config });
      if (!broker || !directFallbackWarranted(verdict)) return verdict;
      log(`direct classifier ${verdict}, falling back to the broker`, command);
    }
    if (broker) return classifyRouted(command, cwd, sessionID, config);
    return "error:no-classifier";
  };

  const classifyWithRetry = async (command, sessionID, route, config) => {
    let verdict = await classify(command, directory, sessionID, route, config);
    if (!route.lanes.includes("direct")) {
      // ☠️ A broker ladder can put a cloud fallback below a local primary, but a
      // single attempt could never reach it: the rung is chosen at /lease time, so
      // the fallback only serves a LATER classification, never the one that just
      // failed. One classification therefore had exactly one lane, and any fault on
      // it failed the gate closed -- the outage the fallback exists to prevent.
      // Now that a real fault indicts its target (see classifyRouted), one retry
      // re-leases and lands on the next rung.
      // Bounded deliberately: ONE extra attempt, and never after a timeout -- a
      // second 12s wait would stall the tool call worse than the denial does.
      if (verdict === "SAFE" || verdict === "RISKY") return verdict;
      if (verdict === "error:timeout") return verdict;
      log(`re-leasing after ${verdict}`, command);
      return classify(command, directory, sessionID, route, config);
    }
    for (const waitMs of [750, 2500]) {
      if (verdict === "SAFE" || verdict === "RISKY") break;
      log(`retrying in ${waitMs}ms after ${verdict}`, command);
      await new Promise((r) => setTimeout(r, waitMs));
      verdict = await classify(command, directory, sessionID, route, config);
    }
    return verdict;
  };

  // Majority vote when configured (votes>1), else a single call. FAIL-CLOSED: SAFE
  // only with a strict majority of the configured votes; a tie, a lone dissent, or
  // errors all resolve toward RISKY. votes=1 (the default) is exactly the old path.
  const classifyVoted = async (command, sessionID, route, config) => {
    const { votes } = config;
    if (votes <= 1) return classifyWithRetry(command, sessionID, route, config);
    let safe = 0, risky = 0, errored = 0;
    for (let i = 0; i < votes; i++) {
      const v = await classifyWithRetry(command, sessionID, route, config);
      if (v === "SAFE") safe++;
      else if (v === "RISKY") risky++;
      else errored++;
    }
    log(`vote ${safe}S/${risky}R/${errored}E of ${votes}`, command);
    if (safe > votes / 2) return "SAFE";
    if (risky > 0 || safe > 0) return "RISKY";   // decided votes, no SAFE majority
    return "error:all-votes-failed";             // nobody answered -> caller fails closed
  };

  // SHARED verdict cache across ALL sessions. A command's SAFE/RISKY verdict
  // depends only on the command text and cwd, so classifying it once serves
  // every concurrent session -- with many sessions running at once, each was
  // re-classifying the same `git status` / `npm test` from scratch, which is
  // what made the classifier a bottleneck. In-memory Map is the hot per-session
  // layer; the file is the cross-session layer (last-write-wins is fine), and it
  // holds a hash of each command, never the command itself.
  const SHARED_CACHE = join(homedir(), ".local/share/opencode/classifier-verdicts.json");
  const readShared = () => {
    try { return JSON.parse(readFileSync(SHARED_CACHE, "utf8")); } catch { return {}; }
  };
  const writeShared = (store) => {
    try {
      mkdirSync(join(homedir(), ".local/share/opencode"), { recursive: true });
      const tmp = `${SHARED_CACHE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
      renameSync(tmp, SHARED_CACHE);
    } catch { /* cache is best-effort: a write failure just means a re-classify */ }
  };
  const classifierCache = createClassifierCache({ readShared, writeShared });

  // Auto's own answer for a descendant ask, with nobody asked: every non-bash permission
  // auto approves (shouldAutoApprove), and bash only on a SAFE verdict -- the static read
  // list, else the classifier -- never a credential command. No verdict (level static or off
  // for an unlisted command, a privacy profile with no local lane, a classifier error) is not
  // SAFE. Any failure answers false: the caller then escalates exactly as before.
  const judgedSafeAsAuto = async (permission, command, sessionID) => {
    try {
      if (permission !== "bash") return shouldAutoApprove({ mode: "auto", permission, verdict: null });
      if (!command || touchesCredentials(command)) return false;
      if (commandIsRead(command)) return true;
      if (level() !== "on") return false;
      const route = await routeFor(sessionID);
      if (!route?.lanes?.length) return false;
      return await classifyCached(command, sessionID, route) === "SAFE";
    } catch {
      return false;
    }
  };

  const classifyCached = async (command, sessionID, route) => {
    // The route config is one snapshot from before cache lookup through all votes
    // and retries, so the fingerprint describes exactly the judgment that ran.
    const config = route.config;
    const request = { command, cwd: directory, config, route };
    const cached = classifierCache.get(request);
    if (cached) return cached;
    const verdict = await classifyVoted(command, sessionID, route, config);
    classifierCache.put({ ...request, verdict });
    return verdict;
  };

  // The guard floor for one call, as a value rather than a throw: null, or
  // { class, message, promptable? } where `message` is exactly the refusal the legacy
  // sequence throws and every deny(...) / prompt(...) log line stays where it was. One
  // implementation, two callers: the legacy sequence throws the message; a god descendant on
  // a native-asking tool stashes it as a parent escalation (2026-10-14 policy). `rootRules`
  // (descendants only) adds the ROOT's allow rules to the launder check.
  const floorRefusal = async ({ tool, args, command, sessionID, mode, lvl, rules, rootRules }) => {
    // Native read/glob/grep calls never produce a shell command for the guard
    // below. Check their actual path arguments before the tool resolves a glob.
    if (nativeCredentialGuardBlocks({ level: lvl, mode, unattended: isUnattended, tool, args, directory })) {
      log("deny(credential)", tool);
      return { class: "credential", message: credentialDeny("ssh keys, cloud or registry credentials, or a configured secret path") };
    }
    if (!command) return null;

    // ---- The floor. Static, precise, and on in every other mode. ----
    // A throw from cc-safety-net is a denial, not a skip: its contract is "if
    // checkCommand throws, do not run the command".
    const net = safetyNetVerdict(safetyNet.checkCommand, { command, cwd: directory });
    if (net.kind === "deny") {
      const errored = net.ruleId === "analysis-error";
      log(errored ? `deny(net-error)` : "deny(net)", command);
      return {
        class: errored ? "net-error" : "net",
        message: `[opencode-guard] blocked: ${net.reason} ` +
          `(rule ${net.ruleId ?? "?"}). Do not rephrase to evade this; ` +
          `pick a genuinely safer approach or ask the user.`,
      };
    }

    // The launder floor (lib/policy.js): opencode's own allow globs already let this
    // run unprompted, but its parsed arguments make a read verb write a file or run
    // a program. A glob cannot see inside argv; this can. Commands opencode would
    // ask about are not judged here -- a person approved those.
    const laundered = launderReason(command, rules) ?? (rootRules ? launderReason(command, rootRules) : null);
    if (laundered) {
      log("deny(launder)", command);
      return {
        class: "launder",
        message: `[opencode-guard] blocked: \`${laundered.segment}\` matches an allow rule for a read-only command, ` +
          `but ${laundered.reason}. Use the Write or Edit tool to write files (a redirect into /tmp/opencode/ is fine), or ask the user to run it. ` +
          `Do not rephrase to evade this.`,
      };
    }

    // Hard credential guard: file paths that could match `cat *`/`ls *` allow
    // rules. Always refused regardless of mode or attendance -- the permission
    // system cannot be trusted to stop these because an agent's own `allow`
    // block is appended after the global rules and opencode takes the last match.
    if (touchesHardCredentials(command)) {
      log("deny(credential)", command);
      return { class: "credential", message: credentialDeny("ssh keys, cloud or registry credentials, or a configured secret path") };
    }

    // Promptable credential guard: commands that are specific enough to never
    // match a broad allow rule (rbw, bw, op, pass). In unattended sessions
    // there is no one to ask, so refuse. In attended sessions the caller lets the
    // command fall through to opencode's permission system, where `*`=`ask`
    // prompts the user -- the event handler is also guarded to never auto-approve
    // a credential command.
    if (touchesPromptableCredentials(command)) {
      if (isUnattended) {
        log("deny(credential)", command);
        return { class: "credential", message: credentialDeny("a password-manager CLI -- and an unattended session has no one to ask") };
      }
      log("prompt(credential)", command);
      return { class: "credential-promptable", promptable: true, message: credentialDeny("a password-manager CLI") };
    }
    if (tool === "pty_write") return null;  // credential check above is the whole job
    if (lvl === "static") return null;

    // ---- Above the floor, the classifier answers one question: may this run
    // without asking anyone? So it runs exactly where nothing will be asked --
    // an unattended session, or auto mode. Manual and edits never reach the
    // model at all: there is a person, and opencode will ask them.
    if (!isUnattended && !classifierDecides(mode)) return null;
    // Named in every denial below. A mode change is invisible to the agent,
    // so a command that ran a minute ago and is refused now reads as the
    // classifier being nondeterministic -- when what actually changed is the
    // mode. Saying which state made the decision is what lets the agent tell
    // "approval lapsed" from "verdict changed".
    const state = isUnattended ? "unattended session" : `mode: ${mode}`;

    if (commandIsRead(command)) { log("allow(read)", command); return null; }
    // Privacy profiles must not have command text shipped to a cloud classifier,
    // and with no lane at all there is nothing to ask. The profile is the
    // broker's concept, read through lib/broker.js; without the broker every
    // session resolves "auto".
    const route = await routeFor(sessionID);
    if (!route.lanes.length) {
      log(`deny(${route.profile}-no-classifier)`, command);
      return {
        class: "no-classifier",
        message: `[opencode-guard] denied (${state}, profile: ${route.profile}): ${route.reason}, so this could not be judged. ` +
          "`oc-auto static` keeps static checks only, or switch to manual mode for a person to approve the command.",
      };
    }
    const verdict = await classifyCached(command, sessionID, route);
    if (verdict === "SAFE") return null;

    // ---- Auto mode DENIES; it does not ask. A refusal is what auto mode is for:
    // try another way, do the parts that do not depend on this, and escalate to the
    // person only when the capability is genuinely required.
    if (verdict === "RISKY") {
      log("deny(llm)", command);
      return {
        class: "llm",
        message: `[opencode-guard] denied (${state}, level: ${lvl}): this looks risky to run unattended (writes ` +
          "outside the project, privilege escalation, package/service/system state, " +
          "history rewrite, or credentials).\n" +
          "If other work does not depend on this, carry on with that. You MAY reach " +
          "the same goal a genuinely safer way -- a narrower command, a read instead " +
          "of a write, a tool that does not need this. Do NOT rephrase the same " +
          "action to get past this check.\n" +
          "If the capability really is required, STOP and tell the user what you " +
          "were trying to do and why. They can switch to manual mode and run it " +
          "themselves, or approve it there.",
      };
    }

    // No verdict, and in auto mode nothing is going to ask. Deciding "allow" here
    // would be the one thing this plugin promises not to do.
    log(`deny(${verdict})`, command);
    return {
      class: "classifier-unavailable",
      message: `[opencode-guard] denied (${state}, level: ${lvl}): the command classifier is unavailable (${verdict}), ` +
        "so this could not be judged. Carry on with anything that does not depend on " +
        "it. `oc-auto static` continues with static checks only, and manual mode " +
        "asks the user instead.",
    };
  };

  // Old host (AUTHORITY_UNSUPPORTED) and no stash: the permission hook keeps its earlier
  // semantics exactly. Only a verified god root's OWN ordinary request (not one a configured
  // deny names) is left untouched; everything else rethrows the unsupported error. Ancestry
  // failures propagate as their own errors -- an unverifiable session is never taken for a root.
  // No grant and no override is ever produced here.
  const oldHostAsk = async (sessionID, command, error) => {
    const chain = await sessionTree.ancestry(sessionID);
    if (!Array.isArray(chain) || chain.length === 0) throw error;
    const hard = Boolean(command && configDenyReason(command, await rulesFor(sessionID)));
    if (chain.at(-1) === sessionID && sessionMode(sessionID) === "god" && !hard) return;
    throw error;
  };

  return {
    tool: {
      guard_pending: tool({
        description: "List ALL native pending parent approvals owned by this god-mode root. When any are pending, decide them all in the SAME turn (one guard_decide per request) so no child is left waiting a model turn each.",
        args: {},
        async execute(_args, ctx) {
          return JSON.stringify((await authority.pending({ sessionID: ctx.sessionID })).map(pendingView));
        },
      }),
      guard_decide: tool({
        description: "Approve once or reject one native parent approval owned by this god-mode root. Call it once per pending request in the SAME turn to clear the whole guard_pending queue at once, so a busy root is not pegged deciding one ask per turn.",
        args: {
          permissionID: tool.schema.string(),
          decision: tool.schema.enum(["once", "reject"]),
          message: tool.schema.string().optional(),
        },
        async execute(args, ctx) {
          return authority.decide({ sessionID: ctx.sessionID, ...args });
        },
      }),
    },
    "chat.message": async (input, output) => {
      // Only the canonical root's own real user content can resume a root that
      // stopped. Child workflow prompts and our synthetic approval wakeups do not.
      try {
        await authority.resume({ sessionID: input?.sessionID, parts: output?.parts });
      } catch (error) {
        log("approval-resume-error", error?.message ?? error);
        throw error;
      }
    },
    // A local classifier agent on a thinking model THINKS by default, and a
    // thinking verdict was measured at 44.8s against the 12s broker-lane budget --
    // the gate then refuses with "classifier is unavailable", which is a dead shell
    // in auto mode rather than a slower one. llama.cpp honours exactly one no-think
    // lever (see localNoThinkApplies), and this hook sets it on the broker lane's
    // own model calls. The direct lane sets it through classifier.json extraBody.
    // Scoped to the fixed classifier identity ON a listed provider, deliberately:
    // a local coding agent on the same provider keeps its thinking, and cloud calls
    // must never be handed this key.
    "chat.params": async (input, output) => {
      if (typeof input?.sessionID === "string" && typeof input?.agent === "string") {
        sessionAgents.delete(input.sessionID);
        sessionAgents.set(input.sessionID, input.agent);
        if (sessionAgents.size > SESSION_AGENTS_CAP) sessionAgents.delete(sessionAgents.keys().next().value);
      }
      const noThinkProviders = classifierNoThinkProviders.get(input?.sessionID)?.providers ?? classifierConfig().noThinkProviders;
      if (!localNoThinkApplies(input?.agent, input?.provider?.id, noThinkProviders)) return;
      output.options = {
        ...output.options,
        chat_template_kwargs: { ...output.options?.chat_template_kwargs, enable_thinking: false },
      };
    },

    // Every shell an agent session runs is marked (see AGENT_SHELL_ENV). The hook carries a
    // sessionID only for a session's own shell calls; the user's PTY panes get none and stay
    // unmarked, so a person can still start OpenCode from a terminal inside the TUI.
    "shell.env": async (input, output) => {
      if (!input?.sessionID) return;
      output.env = { ...output.env, [AGENT_SHELL_ENV]: "1" };
    },

    // Core keeps the original ruleset and validates this request-local proposal
    // (2026-10-14 policy, design section 5.1). A proposal can tighten any verdict to an
    // exact annotated ask or a deny; the only loosening is `override: "root"`, which native
    // accepts solely for a root's own visible-tool deny. Which refusal escalates, and to
    // whom, is decided by lib/escalation.js; this hook only gathers its inputs.
    "permission.ask": async (input, output) => {
      const req = input?.req ?? input;
      const sessionID = req?.sessionID ?? input?.sessionID;
      const permission = req?.permission ?? input?.permission;
      const callID = req?.tool?.callID ?? input?.tool?.callID;
      const key = escalationKey(sessionID, callID, permission);
      // Taken first, so a stash or route marker is consumed by exactly one hook call whatever
      // happens next. The two are different types: a floor ESCALATION ({ kind }) is the table's
      // `escalation` input; a ROOT-POLICY marker ({ route }) only pins the table's rootDeny.
      const { entry: held, expired } = takeStash(key);
      const escalation = held && !held.route ? held : undefined;
      const marker = held?.route === "root-policy" ? held : undefined;
      // The call's identity, NOT consumed: every permission this call raises is judged with it.
      const context = getContext(callKey(sessionID, callID));
      // A deferred guard floor must never run because the guard failed, was switched off or
      // the request went stale: deny this exact call, leaving no grant behind. The log names
      // the request and the floor's class, never the command (it may carry a secret).
      const failClosed = (kind, detail) => {
        delete output.approval;
        delete output.override;
        delete output.forceAsk;
        output.status = "deny";
        log(kind, detail);
      };
      const what = held ? `${entryLabel(held)} for ${permission} in ${sessionID}` : `${permission} in ${sessionID}`;
      // An expired stash or route marker is still a restriction, at every level.
      if (expired) {
        failClosed("deny(expired-escalation)", `${entryLabel(expired)} for ${permission} in ${sessionID}: ` +
          "its deferred guard floor expired before this hook; retry the call");
        return;
      }
      if (level() === "off") {
        // A floor deferred (or skipped for a root deny) while the guard was on was a refusal:
        // switching the guard off afterwards must not let that exact call run. Calls with no
        // deferral take the off path.
        if (held) failClosed("escalation-off", `${what}: the guard was switched off after the floor was deferred; denied, retry the call`);
        return;
      }
      if (!sessionID) return;
      const command = strip(req?.metadata?.command);
      if (isUnattended) {
        if (held) failClosed("escalation-error", `${what}: an unattended session cannot carry an escalation`);
        return;
      }
      // The call's ORIGINAL root binding, captured in tool.execute.before before any floor: the
      // restriction's own, else the call context. Set BEFORE any await (root-policy round): a
      // failure while a restriction or a bound call is known denies; it never rethrows into a
      // native plain verdict.
      const original = held ?? context;
      try {
        let ctx;
        try {
          ctx = await authority.rootContext(sessionID);
        } catch (error) {
          // An old host keeps the earlier hook semantics. Transport, HTTP and malformed
          // capability failures are not an old host and propagate (fail closed).
          if (error?.code !== AUTHORITY_UNSUPPORTED || original) throw error;
          await oldHostAsk(sessionID, command, error);
          return;
        }
        if (held) {
          // Lead rulings 6 and 7: a stash (or route marker) belongs to the root, mode class and
          // root incarnation it was captured under. A root that left (or entered) god since then,
          // or a replaced or aborted root, gets no escalation from it: the exact call is denied,
          // and a retry is judged afresh under whatever holds now.
          if (ctx.rootSessionID !== held.root || (ctx.rootMode === "god") !== (held.mode === "god")) {
            failClosed("escalation-stale", `${what}: the root's mode changed after the floor was deferred; denied, retry the call`);
            return;
          }
        }
        // The ROOT's effective bash deny (winning rule). The god root's own override and a god
        // descendant's stash proposal need no asynchronous rules load.
        const needsRootDeny = permission === "bash" && Boolean(command) &&
          !(ctx.rootMode === "god" && (ctx.isRoot || escalation));
        const currentRootDeny = needsRootDeny ? bashDenyKind(command, await rulesFor(ctx.rootSessionID)) : null;
        // A route marker pins the root deny the floors were skipped for. If the root's rules say
        // something else now, no safe proposal follows from either answer: deny.
        if (marker && currentRootDeny !== marker.rootDeny) {
          failClosed("deny(root-policy-changed)", `${what}: the root's rules changed after the floors were skipped; denied, retry the call`);
          return;
        }
        let proposal = decideProposal({ ...ctx, permission, status: output.status, escalation, rootDeny: currentRootDeny });
        // A god descendant's plain native ASK (no floor stash, no root deny) that an AUTO root's
        // descendant would get without anyone asked is allowed here instead of costing the god
        // root a model turn. 2026-10-20 measurement: 2,674 descendant asks in 3 days, 673 root
        // turns and 5.3 h spent on guard_decide, children blocked on it 44% of active wall time.
        // God is strictly wider than auto, so this grants nothing auto would not: every native
        // DENY, every floor or root-deny escalation, and whatever auto's own judgment would
        // refuse or cannot decide still goes to the root model exactly as before.
        if (proposal?.approval?.kind === "parent" && ctx.rootMode === "god" && !ctx.isRoot &&
            output.status === "ask" && !escalation && !marker && !currentRootDeny &&
            await judgedSafeAsAuto(permission, command, sessionID)) {
          proposal = { status: "allow", judgedAsAuto: true };
        }
        // A stash always maps to a proposal in the table; reaching here is a guard bug.
        if (!proposal && escalation) throw new Error(`stashed ${escalation.kind} escalation produced no proposal`);
        if (!proposal && !original) return;
        if (original) {
          // Validate the binding captured when the call began, even for a call native allows and
          // the table leaves alone; never re-capture here, so a root replaced or aborted meanwhile
          // is never adopted for this call. A root's own marker carries no binding.
          if (ctx.rootSessionID !== original.root) {
            failClosed("escalation-stale", `${what}: the call's root changed after it began; denied, retry the call`);
            return;
          }
          // Lead rulings 6 and 7 for a call with no restriction too: its floors ran under the mode
          // class captured when it began. A root that left (or entered) god since then gets no
          // verdict from that run; the exact call is denied and a retry is judged afresh.
          if (!held && (ctx.rootMode === "god") !== (original.mode === "god")) {
            failClosed("escalation-stale", `${what}: the root's mode changed after the call began; denied, retry the call`);
            return;
          }
          if (original.binding) await authority.assertRequestBinding(original.binding);
        }
        // Immediately before the output, with no await after it: a mode flip during any await
        // above must not emit a proposal made under the earlier mode.
        if (rootModeOf(ctx.rootSessionID) !== ctx.rootMode) {
          if (original) {
            failClosed("escalation-stale", `${what}: the root's mode changed while the request was checked; denied, retry the call`);
          } else {
            log("proposal-stale", `${what}: the root's mode changed while the request was checked; native's verdict stands`);
          }
          return;
        }
        if (!proposal) {
          // The floors were skipped for a root deny and the table now forms no proposal (native
          // and the root disagree): never a plain allow.
          if (marker) {
            failClosed("deny(root-policy)", `${what}: the floors were skipped for a root deny that no longer forms a proposal; denied`);
            return;
          }
          // A bound call native decides alone (validated above): native's verdict stands.
          return;
        }
        if (proposal.status === "deny") {
          failClosed("deny(root-policy)", `${what}: the root's own rules deny this command`);
          return;
        }
        // An operator ask the guard settles itself is a deferred grant of the root, bound to the
        // call's ORIGINAL binding and to the exact request patterns this hook saw. Without a
        // context (no call key, no before-hook context, or one that was lost) it stays unmarked
        // and the person answers it.
        const mark = proposal.judged && key && context && !held ? {
          sessionID, permission, root: ctx.rootSessionID, mode: ctx.rootMode, binding: context.binding,
          fingerprint: requestFingerprint(req?.patterns),
        } : undefined;
        if (proposal.judged && !mark) log("judged-unbound", `${what}: no root binding from the call's start; left for the person`);
        output.status = proposal.status;
        if (proposal.override) output.override = proposal.override;
        if (proposal.approval) output.approval = proposal.approval;
        if (proposal.forceAsk) output.forceAsk = true;
        if (proposal.always) output.always = proposal.always;
        if (mark) markJudged(key, mark);
        log(proposal.override ? "allow(god/override)" : proposal.approval ? `escalate(${proposal.approval.kind})`
          : proposal.judgedAsAuto ? `allow(god-child/as-auto/${permission})` : "allow(god)", what);
      } catch (error) {
        // No restriction and no bound call: native keeps its own verdict.
        if (!original) throw error;
        failClosed("escalation-error", `${what}: ${errorClass(error)}`);
      }
    },

    "tool.execute.before": async (input, output) => {
      const command = commandUnder(input?.tool, output?.args);
      // Above every mode and level, god and off included: this is not a safety floor a person
      // can lower for a session, it is what a session is. See AGENT_SHELL_ENV.
      const spawnRoute = agentSpawnRefusal(command);
      if (spawnRoute) {
        log(`deny(${input?.tool ?? "?"}/agent-spawn)`, command);
        throw new Error(`${AGENT_SPAWN_REFUSAL} Refused route: ${spawnRoute}.`);
      }
      let mode;
      // Mode resolution can walk a subagent's ancestry and read each ancestor's
      // mode file. Keep one answer for this tool call, but do not retain a failed
      // lookup: G3 must still throw rather than turn its denial into a mode value.
      const currentMode = async () => {
        if (mode !== undefined) return mode;
        mode = await modeFor(input?.sessionID);
        return mode;
      };

      // WARNING: Guarding only `bash` is a hole the moment a pty or background-shell
      // plugin is installed: `pty_spawn` runs an executable with its own argv and
      // would skip the credential guard, cc-safety-net and the classifier entirely --
      // every tier, in one step. Any tool that starts a process has to come through
      // here (commandUnder in lib/policy.js).
      const lvl = level();
      if (lvl === "off") return;

      // D0: never run a tool for a turn that is already over. Checked above everything,
      // god included: it is not a limit on what a session may run, it is a call nobody
      // is waiting for any more (see staleToolRefusal). A status read that fails
      // allows, so a hiccup here can never stall a live session.
      if (input?.sessionID) {
        let statuses = null;
        try {
          const got = await client.session.status({ query: { directory } });
          statuses = got?.error ? null : (got?.data ?? null);
        } catch { /* cannot tell: allow */ }
        const stale = staleToolRefusal({ statuses, sessionID: input.sessionID, tool: input?.tool });
        if (stale) {
          log(`deny(${input?.tool ?? "?"}/stale-turn)`, command ?? input?.tool ?? "?");
          throw new Error(stale);
        }
      }

      // D1: a dispatch to a read-only agent must declare read intent -- and it is
      // checked ABOVE the god bypass below, on purpose. God lifts the safety FLOOR
      // on what a session may RUN; it is not a licence to emit an incoherent tool
      // call. Handing write or exec work to an agent that cannot write fails
      // anyway: later, after a child session was created and paid for, and with an
      // error that reads like a permission problem rather than the dispatch mistake
      // it is. Measured 2026-09-18: four such misdispatches in a single god session,
      // every one of them below this line and therefore uncatchable there.
      if (input?.tool === "task") {
        const agent = String(output?.args?.subagent_type ?? "");
        const refusal = dispatchRefusal({ agent, capability: agentCapability(agent), prompt: output?.args?.prompt });
        if (refusal) {
          log(`deny(task/${agent || "?"})`, agent || "?");
          throw new Error(refusal);
        }
      }

      // Tree rules G1, G2 and G4 (agent teams; lib/tree.js). Above the config deny
      // rules and the god bypass, for the reason D1 is: they bound which sessions a
      // call may reach and what a team may use, not what a session may run, and god
      // is a grant over the floor, not over the session tree. Every lookup that
      // fails comes back as a denial naming its rule. G3 is in modeFor.
      const treeRefusal = await treeRuleRefusal({
        tool: input?.tool, sessionID: input?.sessionID, args: output?.args,
        unattended: isUnattended, tree: sessionTree, team: teamIndex,
      });
      if (treeRefusal) {
        log(`deny(${input?.tool ?? "?"}/tree)`, `${input?.sessionID ?? "?"}: ${treeRefusal}`);
        throw new Error(treeRefusal);
      }

      // ---- The 2026-10-14 god escalation policy
      // (docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md, section 5.2).
      // God mode: the person asked for everything to run, floor included, and said so in a
      // mode labelled god. On a capable host (native permissionAuthority 2) for an attended
      // session that grant now has two halves:
      //   - the god ROOT's own calls stand aside before every guard floor, and native denies
      //     of its own visible-tool requests (opencode.json named rules such as `rm -rf /*`,
      //     role and ceiling denies) are lifted by an exact, logged `override: "root"` in the
      //     permission hook -- one request at a time, never persisted;
      //   - every refusal of a DESCENDANT on a native-asking tool (bash, read, glob, grep,
      //     edit, write) -- guard floors, control-file writes and reveal-arm included -- is
      //     deferred to that call's native ask and becomes an exact parent ask (once/reject)
      //     the root model answers. Nothing escalates to Holden under god.
      // The guard no longer re-applies config deny rules for those tools: native denies are
      // authoritative over "Always" approvals on a capable host (native Task 1), and the
      // permission hook routes them. Root-policy round: under a non-god root every session is
      // judged as the root's own, so the ROOT's effective bash deny routes the call (named ->
      // human-once, catch-all -> explicit deny) even where the session's own rules allow it;
      // under a god root it is a parent ask. See lib/escalation.js for the table.
      // Process tools that never ask natively (bg_run, pty_spawn) are routed the same way on a
      // host advertising beforeAsk (ASKABLE): the guard requests an exact native ask for the call.
      // Older hosts keep the throws below.
      // Unattended sessions, level `off` and old hosts keep the legacy sequence below:
      // no escalation and no override. ATTENDED ONLY: the mode was set in front of a person,
      // in one session, and that is the whole grant -- `opencode run --session <id>`
      // re-enters TUI sessions headless, so file provenance is not a person present.
      // Redaction (tool.execute.after) still runs in every mode.
      let ctx = null;
      if (!isUnattended && input?.sessionID) {
        try {
          ctx = await authority.rootContext(input.sessionID);
        } catch (error) {
          // Only an explicitly old host takes the legacy path. A transport, HTTP or
          // malformed-probe failure is not an old host: fail closed.
          if (error?.code !== AUTHORITY_UNSUPPORTED) throw error;
        }
      }
      // The floors' judgment mode on a capable host (root-policy round): a non-god root's whole
      // tree is judged in the ROOT's current legacy mode (manual / edits / auto), so a child's own
      // god file (or a looser inherited one) never turns a manual or edits root's descendant into
      // an auto one. currentMode() still runs first: its G3 ancestry gate is unchanged. Under a
      // god root a descendant's own resolved mode applies, capped at auto (the floors defer).
      const floorMode = async () => {
        const resolved = await currentMode();
        if (!ctx) return resolved;
        if (ctx.rootMode !== "god") return ctx.rootMode;
        return resolved === "god" ? "auto" : resolved;
      };
      // The call's identity for its permission hooks: the root binding, captured for EVERY tool
      // call of an attended descendant BEFORE any asynchronous rule or floor work (lead ruling 7),
      // so a root aborted or replaced while that work (an agent-rules load, a classifier call) is
      // in flight never inherits this call's escalation or judgment. A capture failure refuses
      // the call before its tool runs, god or not (root-policy round). It is kept, keyed by the
      // exact (session, call), only once the call is let through (see keepCall).
      let binding;
      const contextKey = callKey(input?.sessionID, input?.callID);
      if (ctx && !ctx.isRoot && contextKey) {
        binding = await authority.captureRequestBinding(ctx.rootSessionID);
      }
      const keepCall = () => {
        if (binding) keepContext(contextKey, { sessionID: input.sessionID, tool: input?.tool, root: ctx.rootSessionID, mode: ctx.rootMode, binding });
      };
      if (ctx) {
        if (ctx.isRoot && ctx.rootMode === "god") {
          // The floors were skipped under god: keep the call's mode so its permission hook denies
          // it if the root left god in between, instead of letting native's allow stand.
          if (contextKey) keepContext(contextKey, { sessionID: input.sessionID, tool: input?.tool, root: ctx.rootSessionID, mode: ctx.rootMode });
          log("allow(god)", command ?? input?.tool);
          return;
        }
        // A process tool becomes deferrable only when native will ask for it (beforeAsk) and the
        // guard has its command line to ask about.
        const viaAsk = !DEFERRABLE[input?.tool] && ctx.beforeAsk === true && Boolean(command) && ASKABLE[input?.tool];
        const permissionKey = DEFERRABLE[input?.tool] ?? (viaAsk ? ASKABLE[input.tool] : undefined);
        // Every way such a call is let through below must carry the ask, or its hook never fires.
        const requestAsk = () => {
          if (viaAsk) output.ask = { permission: permissionKey, patterns: [command], metadata: { command, tool: input.tool } };
        };
        if (permissionKey) {
          const key = escalationKey(input.sessionID, input?.callID, permissionKey);
          const godChild = !ctx.isRoot && ctx.rootMode === "god";
          // The call is let through: keep its identity for its permission hooks.
          const proceed = () => { requestAsk(); keepCall(); };
          // The reason and the log carry the floor's class, never the command: native request
          // metadata already shows the exact command to whoever answers.
          const defer = (kind, cls) => {
            stash(key, {
              kind, cls, permission: permissionKey, reason: `${cls}: deferred ${permissionKey} floor`,
              sessionID: input.sessionID, root: ctx.rootSessionID, mode: ctx.rootMode, binding,
            });
            log(`stash(${kind}/${cls})`, `${permissionKey} in ${input.sessionID} call ${String(input.callID).slice(0, 64)}`);
            requestAsk();
            keepCall();
          };
          // The guard's own switches and the reveal window: a person sets those. A god
          // descendant may ask the root model (lead ruling 2; a once-approval changes policy
          // durably); everyone else is refused as before.
          if (nativeToolWritesControlFile({ tool: input?.tool, args: output?.args, directory }) || (command && commandWritesControlFile(command))) {
            if (godChild && key) { defer("parent", "control-file"); return; }
            log(command ? "deny(control-file)" : `deny(${input?.tool}/control-file)`, command ?? input?.tool);
            throw new Error(controlDeny);
          }
          if (command && armsReveal(command)) {
            if (godChild && key) { defer("parent", "reveal-arm"); return; }
            log("deny(reveal-arm)", command);
            throw new Error(REVEAL_ARM_REFUSAL);
          }
          const rules = await rulesFor(input.sessionID);
          const rootRules = ctx.isRoot ? rules : await rulesFor(ctx.rootSessionID);
          // Non-god (root-policy round): a session is judged as its ROOT's own. When the root's
          // EFFECTIVE rules (winning rule, bashDenyKind) deny the command -- whatever the
          // session's own rules let native say -- the floors are not run here: the hook routes
          // the call (named -> human-once, catch-all -> explicit deny). Agreed precedence: this
          // route runs AHEAD of the static floors, cc-safety-net included, so a named root deny
          // such as `mkfs*` reaches the human once rather than a net refusal. The skipped floors
          // are replaced by a slot-retained ROOT-POLICY marker for this exact call, so the hook
          // can never let it through as a plain allow if native or the rules disagree later.
          const rootDeny = !godChild && permissionKey === "bash" && command ? bashDenyKind(command, rootRules) : null;
          if (rootDeny) {
            if (!key) {
              // No exact call to carry the restriction to: refuse it here, as the legacy path does.
              log("deny(config)", command);
              throw new Error(
                `[opencode-guard] blocked: \`${configDenyReason(command, rootRules)?.segment ?? command}\` matches a deny rule in the opencode permission config. ` +
                `Deny rules hold in every mode and over any "Always" approval. Do not rephrase to evade this; ask the user.`,
              );
            }
            stash(key, {
              route: "root-policy", rootDeny, cls: `root-${rootDeny}`, permission: permissionKey,
              sessionID: input.sessionID, root: ctx.rootSessionID, mode: ctx.rootMode, binding,
            });
            log(`route(root-policy/${rootDeny})`, `${permissionKey} in ${input.sessionID} call ${String(input.callID).slice(0, 64)}`);
            requestAsk();
            keepCall();
            return;
          }
          const refusal = await floorRefusal({
            tool: input?.tool, args: output?.args, command, sessionID: input.sessionID,
            mode: await floorMode(), lvl, rules, rootRules: ctx.isRoot ? undefined : rootRules,
          });
          if (!refusal) { proceed(); return; }
          if (godChild) {
            if (!key) throw new Error(refusal.message);
            defer("parent", refusal.class);
            return;
          }
          if (refusal.promptable) {
            if (ctx.isRoot) { requestAsk(); return; } // the root's native prompt, as before
            if (key && binding) {
              defer("human-only", refusal.class);
              return;
            }
          }
          // An auto DESCENDANT's classifier remainder (RISKY, or no verdict because the lane is
          // unavailable) defers UP to the owning root's person instead of being denied here. By
          // now the floor ran in auto class, so SAFE and reads already proceeded -- only what the
          // classifier could not bless is left, so the main session is asked about the remainder,
          // never as a first-line classifier. The host surfaces a native "operator" ask to the
          // attended root's person at any depth. An auto ROOT (ctx.isRoot), an unattended process
          // with no one to ask, and the credential/destructive/launder floors all keep denying by
          // falling through to the throw.
          if (!isUnattended && !ctx.isRoot && ctx.rootMode === "auto" && key && binding &&
              (refusal.class === "llm" || refusal.class === "no-classifier" || refusal.class === "classifier-unavailable")) {
            defer("operator", refusal.class);
            return;
          }
          throw new Error(refusal.message);
        }
        // Non-deferrable tools fall through to the legacy throwing sequence.
      }

      // ---- Legacy sequence: old hosts, unattended sessions, and non-deferrable tools.
      // The config's DENY rules, re-applied here -- above the god bypass, because they are
      // the floor god keeps on these paths. opencode checks its rules and then the run's
      // "Always" approvals, last match wins: one "Always" that saved `snip *` overrides
      // every deny rule (opencode's arity table does not know the snip wrapper), and a
      // plugin cannot see or revoke those approvals. None of these paths has a native exact
      // ask to route a deny to, so it is refused here.
      if (command) {
        // Root-policy round: a capable host's descendant is judged as its root's own, so the
        // ROOT's deny holds here too even where the session's own rules allow the command.
        // These tools have no guaranteed native ask to route it to, so it is refused.
        const denied = configDenyReason(command, await rulesFor(input?.sessionID)) ??
          (ctx && !ctx.isRoot ? configDenyReason(command, await rulesFor(ctx.rootSessionID)) : null);
        if (denied) {
          log("deny(config)", command);
          throw new Error(
            `[opencode-guard] blocked: \`${denied.segment}\` matches a deny rule in the opencode permission config. ` +
            `Deny rules hold in every mode and over any "Always" approval. Do not rephrase to evade this; ask the user.`,
          );
        }
      }

      if (!ctx && !isUnattended && (await currentMode()) === "god") { log("allow(god)", command ?? input?.tool); return; }

      // The guard's own switches (lib/policy.js, "The guard's own switches") are set
      // by a person, not from a tool call.
      if (nativeToolWritesControlFile({ tool: input?.tool, args: output?.args, directory })) {
        log(`deny(${input?.tool}/control-file)`, input?.tool);
        throw new Error(controlDeny);
      }
      // The reveal window is meant to be armed by a person at a terminal. An agent
      // that could arm it could turn redaction off for itself, which would make the
      // whole thing decorative -- so naming it from a tool call is refused. This
      // stops a helpful model unblocking itself; it is not proof against one that
      // sets out to construct the path another way.
      if (command && armsReveal(command)) {
        log("deny(reveal-arm)", command);
        throw new Error(REVEAL_ARM_REFUSAL);
      }
      if (command && commandWritesControlFile(command)) {
        log("deny(control-file)", command);
        throw new Error(controlDeny);
      }

      const refusal = await floorRefusal({
        tool: input?.tool, args: output?.args, command, sessionID: input?.sessionID,
        mode: await floorMode(), lvl, rules: await rulesFor(input?.sessionID),
      });
      // A promptable credential in an attended session returns to opencode's own prompt.
      if (refusal && !refusal.promptable) throw new Error(refusal.message);
      // The call is let through: keep a capable host's descendant identity for its permission hooks.
      keepCall();
    },

    "tool.execute.after": async (input, output) => {
      // Fold a delegated child's denials into the result the parent model reads.
      // Drained unconditionally -- above the level check -- because a denial is
      // recorded by the event handler regardless of level, and an undrained entry
      // would sit in the map for the life of the process.
      // This is a ROUND TRIP, not a mid-flight escalation, and cannot be anything
      // else: `permission.ask` never fires (see the header), and the parent is
      // blocked inside the task tool for as long as the child runs. The parent
      // learns at the end and decides then.
      if (input?.tool === "task") {
        const raised = denials.get(input.sessionID);
        denials.delete(input.sessionID);
        if (raised?.length && typeof output?.output === "string") {
          output.output += `\n\n[opencode-guard] ${raised.length} action(s) were DENIED to this subagent, so its answer does not cover them:\n`
            + raised.map((d) => `  - ${d.permission}${d.reason ? ` (${d.reason})` : ""}: ${d.command ?? "(no command)"}`).join("\n")
            + `\nYou hold the mode it was refused under. Decide explicitly: run it yourself, re-dispatch with a narrower brief, or ask the user. Do not treat the subagent's result as complete.`;
          log(`surfaced(${raised.length})`, input.sessionID);
        }
      }
      // A stash still present after its tool ran means the native permission hook never
      // fired for that call, so a deferred guard floor was NOT applied. A loud alarm, not
      // prevention: prevention is native's guarantee that every deferrable tool asks.
      // Above the level check: the floor was deferred while the guard was on.
      // Completion also frees the call's slot (live stash or expired tombstone) and drops its
      // call context: both are single-use and belong to this call only.
      const missedKey = escalationKey(input?.sessionID, input?.callID, DEFERRABLE[input?.tool] ?? ASKABLE[input?.tool]);
      const contextKey = callKey(input?.sessionID, input?.callID);
      if (contextKey) callContexts.delete(contextKey);
      // A FAILED call (native marks a tool that threw or was interrupted after its before-hook)
      // did not run its action, so a floor still stashed for it was never bypassed: free the slot
      // quietly instead of alarming. Without this, each such call held a slot until restart.
      if (input?.failed === true) {
        if (missedKey && pendingEscalations.delete(missedKey)) {
          log("escalation-abandoned", `${input?.tool} in ${input?.sessionID}: the call failed before its permission hook; slot freed`);
        }
        return;
      }
      if (missedKey && pendingEscalations.delete(missedKey)) {
        await reportError("escalation-missed", `opencode-guard: a ${input?.tool} call in ${input?.sessionID} ran without reaching its permission hook, ` +
          `so a deferred guard floor was not applied. Native must ask on every ${input?.tool} call.`);
      }
      if (level() === "off") return;
      redact(input, output);
      await loopHook.after(input, output);
    },
    event: async ({ event }) => {
      // A session ID may be reused after deletion. Evict synchronously before any
      // notifier promise can reject, and keep every cache independent so one bad
      // cleanup never leaves another stale.
      // Deliberately NOT incarnation-bound, unlike the admission/escalation handling
      // below. session-info, session-tree and team-index are read-through caches the
      // guard re-reads from the host on a miss, so evicting on a delayed event for an
      // older incarnation costs the replacement one re-read and can never close an
      // admission or drop an escalation; keeping a stale entry instead could serve a
      // deleted session's parent or teammate classification to its same-ID
      // replacement. loop-guard holds repeat counters, not host facts: a late
      // eviction only restarts the replacement's count, the same as a fresh session.
        if (event?.type === "session.deleted") {
          const properties = event.properties;
          const deletedInfo = properties?.info;
          const gone = deletedInfo?.id ?? properties?.sessionID;
          if (gone) {
          const snapshot = classifierNoThinkProviders.get(gone);
          const deletedIncarnationID = deletedInfo?.incarnationID;
          if (typeof deletedIncarnationID === "string" && deletedIncarnationID !== "" &&
              snapshot?.incarnationID === deletedIncarnationID) {
            classifierNoThinkProviders.delete(gone);
          }
          for (const [cache, forget] of [
            ["session-info", () => sessionInfo.delete(gone)],
            ["session-tree", () => sessionTree.forget(gone)],
            ["team-index", () => teamIndex.forget(gone)],
            ["loop-guard", () => loopHook.forget(gone)],
          ]) {
            try {
              forget();
            } catch (error) {
              log("session-delete-eviction-error", `${cache} ${gone}: ${error?.message ?? error}`);
            }
          }
        }
      }
      // Native dispatch does not await event hooks. Start this FIRST: abort and
      // delete close the shared admission token synchronously, before even the
      // legacy notifier's already-resolved promise can yield to another event.
      const approvalEvent = approvalNotifier.onEvent(event);
      // Carry one admission across the whole observe -> promote -> wake chain,
      // including the await between helpers. A later real user turn gets a NEW
      // token; old event continuations must never silently acquire that token.
      const approvalToken = event?.type === "permission.asked" && event.properties?.approval?.kind === "parent"
        ? approvalLifecycle.track(event.properties.approval.sessionID) : undefined;
      authority.onEvent(event);
      // Agent teams: index every task part that names a child, at every level, so
      // turning the guard back on finds the index current. observe() does not throw
      // on any event shape; the catch is for the unforeseen, and it is logged.
      try {
        teamIndex.observe(event);
      } catch (error) {
        log("tree-index-error", error?.message ?? error);
      }
      try {
        await notifier.onEvent(event);
        await approvalEvent;
      } catch (error) {
        log("loop-guard-error", error?.message ?? error);
      }
      // An "Always" reply saves the request's `always` patterns for the rest of the run.
      // When one of them is blanket (`snip *`: opencode's arity table does not know the
      // snip wrapper), every later command it covers runs unasked. Deny rules still hold
      // (enforced above); everything else does not, and only a restart revokes it.
      if (event?.type === "permission.asked" && event.properties?.id && Array.isArray(event.properties?.always)) {
        alwaysPatterns.delete(event.properties.id);
        alwaysPatterns.set(event.properties.id, event.properties.always);
        if (alwaysPatterns.size > 500) alwaysPatterns.delete(alwaysPatterns.keys().next().value);
      }
      if (event?.type === "permission.replied") {
        const id = event.properties?.requestID;
        const patterns = alwaysPatterns.get(id) ?? [];
        alwaysPatterns.delete(id);
        const blanket = event.properties?.reply === "always" ? patterns.filter(blanketAlwaysPattern) : [];
        if (blanket.length) {
          await reportError("always-blanket", `opencode-guard: an "Always" approval saved \`${blanket.join("`, `")}\`, ` +
            "which approves every matching command for the rest of this opencode run, not just the one shown. " +
            "Deny rules still hold. Restart opencode to revoke it, and answer \"once\" on snip-prefixed prompts.");
        }
        return;
      }
      if (event?.type !== "permission.asked") return;
      // In an unattended session the reply has already been made by the time this
      // event lands (measured under --auto: permission.replied "once" follows
      // immediately), so answering it again only logs a failure.
      if (isUnattended) return;

      const p = event.properties;
      // The wire key is `permission`; the SDK's Permission type calls it `type`
      // and is stale here, the same way it was stale about `requestID`.
      const permission = p?.permission;
      if (!permission || !p?.id) return;
      if (p?.approval?.kind === "parent") {
        // Native persistence precedes this event, so promotion never races an
        // unqueryable request and the root can inspect it as soon as it is awake.
        try {
          // The wake carries the { sessionID, incarnationID } binding observe captured,
          // and observe's admission: when observe re-admitted a replaced root,
          // approvalToken is closed and the wake must use the replacement's token.
          const bound = await authority.observe(p, approvalToken);
          await approvalNotifier.notify(bound?.sessionID, p.id, bound?.token ?? approvalToken, bound?.incarnationID);
        } catch (error) {
          log("approval-observe-error", error?.message ?? error);
        }
        return;
      }
      // These annotations are native authority decisions. human-only belongs solely to the
      // private TUI. An operator ask belongs to the attended root user, EXCEPT one this guard
      // itself proposed as "judged as root" (2026-10-14 policy, auto descendants): that one is
      // settled here with the ROOT's judgment. An escalated parent request, an unmarked one,
      // or one whose mark a restart lost stays with the person.
      if (p?.approval?.kind === "human-only") return;
      let judgedMark;
      if (p?.approval?.kind === "operator") {
        judgedMark = takeJudged(escalationKey(p.sessionID, p?.tool?.callID, permission));
        // Exact: the mark's root, and the very request patterns its hook saw. Taken either way,
        // so a mark never outlives the first request that claims it.
        if (!judgedMark || p.approval.sessionID !== judgedMark.root) return;
        if (judgedMark.fingerprint !== requestFingerprint(p?.patterns)) {
          log("judged-mismatch", `${permission} in ${p.sessionID}: the request is not the one the mark was made for; left for the person`);
          return;
        }
      }
      // A judged mark is a deferred grant of the root: it acts only while the root, its mode
      // and its bound incarnation and admission are still the ones it was proposed under.
      // Checked before judging and again immediately before any reply; on a mismatch the
      // request is left for the person, never transferred to the new root or mode.
      const stillJudged = async () => {
        try {
          const ctx = await authority.rootContext(p.sessionID);
          if (ctx.rootSessionID !== judgedMark.root || ctx.rootMode !== judgedMark.mode) {
            log("judged-stale", `${p.id}: the root or its mode changed since the ask was proposed; left for the person`);
            return false;
          }
          await authority.assertRequestBinding(judgedMark.binding);
          // Re-read after the last await: the mode can change during the binding's root read.
          if (rootModeOf(judgedMark.root) !== judgedMark.mode) {
            log("judged-stale", `${p.id}: the root's mode changed while the ask was revalidated; left for the person`);
            return false;
          }
          return true;
        } catch (error) {
          log("judged-stale", `${p.id}: ${errorClass(error)}; left for the person`);
          return false;
        }
      };
      if (judgedMark && !await stillJudged()) return;
      let currentMode;
      let judgeID = p.sessionID;
      try {
        // Judged as the ROOT would be (ruling 7): its mode, never a descendant's own mode file. A
        // plain ask from a descendant resolves its root through the session tree first.
        if (judgedMark) {
          judgeID = judgedMark.root;
        } else if ((await infoFor(p.sessionID))?.parentID) {
          const chain = await sessionTree.ancestry(p.sessionID);
          if (chain.length > 1) judgeID = chain[chain.length - 1];
        }
        currentMode = await modeFor(judgeID);
      } catch (error) {
        // G3 could not resolve an inherited mode (modeFor logged why). Approving or
        // rejecting would be a guess, so the prompt stays with the person, exactly
        // as in manual mode.
        log("prompt(G3/unresolved)", `${p.sessionID}: ${error?.message ?? error}`);
        return;
      }
      if (currentMode === "manual") return;
      // A DELEGATED child is one whose mode was INHERITED rather than held: no mode
      // file of its own, but a parent. If a mode was set on the child itself it
      // owns its mode and is treated like any other session. For a delegated child a
      // refusal has to be ANSWERED rather than left standing -- standing aside drops
      // the prompt on the person, which is the babysitting this removes. The main
      // session holds the mode the child was refused, so it is the one that decides.
      // A judged ask is always a descendant's, answered on its parent's behalf.
      // A descendant never owns its mode here (ruling 7), so it is always delegated.
      const ownMode = judgedMark || judgeID !== p.sessionID ? null : sessionMode(p.sessionID);
      const parentID = ownMode ? null : (await infoFor(p.sessionID))?.parentID;
      const delegated = !ownMode && !!parentID;
      // A privacy profile with no local classifier stands aside entirely: nothing
      // is approved on its behalf, and every prompt stays with the person. God has
      // no classifier decision to make, so its approval cannot depend on that route.
      const route = currentMode === "god" ? null : await routeFor(p.sessionID);
      if (route?.localOnly && !route.lanes.length) return;
      if (handled.has(p.id)) return;
      handled.add(p.id);
      if (handled.size > 500) handled.clear();

      // Only a shell command needs judging, and only when the level allows a
      // verdict at all. With no verdict, auto mode declines to approve and the
      // prompt stands.
      let verdict = null;
      let command = null;
      if (permission === "bash" && currentMode !== "god") {
        const lvl = level();
        if (lvl === "off" || lvl === "static") return;
        command = strip(p?.metadata?.command);
        if (!command) return;
        // The classifier answers one question -- may this run with nobody to ask?
        // -- and auto is the only mode here whose answer depends on it. God
        // approves without a verdict (it is excluded above), and edits never
        // approves a shell command whatever the verdict says, so classifying
        // there would send the command text to a model for an answer that is
        // thrown away.
        if (classifierDecides(currentMode)) {
          verdict = commandIsRead(command) ? "SAFE"
            : route.lanes.length ? await classifyCached(command, p.sessionID, route) : null;
        }
      }

      const refuse = async (reason) => {
        // A judged ask that went stale meanwhile is left for the person (handled: true).
        if (judgedMark && !await stillJudged()) return true;
        try {
          await client.postSessionIdPermissionsPermissionId({
            path: { id: p.sessionID, permissionID: p.id },
            body: { response: "reject" },
          });
        } catch (e) {
          log("reject-reply-failed " + e, command ?? permission);
          return false;
        }
        noteDenial(parentID, { permission, command, reason });
        log(`reject(delegated/${currentMode}/${permission}${reason ? "/" + reason : ""})`, command ?? permission);
        return true;
      };

      if (!shouldAutoApprove({ mode: currentMode, permission, verdict })) {
        if (delegated && await refuse(verdict ?? "not permitted in this mode")) return;
        log(`prompt(${currentMode}/${permission}${verdict ? "/" + verdict : ""})`, command ?? permission);
        return;
      }
      // Last line for AUTO mode against the classifier misjudging a credential
      // command as SAFE: promptable credentials reach the permission system from
      // tool.execute.before; hard credentials never do (they throw). In god mode
      // `command` is never extracted above, so this check does not fire there --
      // deliberate, not an oversight: god stands the whole floor aside, and the
      // mode set in front of a person is the grant.
      if (command && touchesCredentials(command)) {
        // Fail CLOSED for a child: fetching a secret is the parent's call to make,
        // not something a delegated worker should reach on its own initiative.
        if (delegated && await refuse("credential")) return;
        log(`prompt(${currentMode}/${permission}/credential)`, command);
        return;
      }
      if (judgedMark && !await stillJudged()) return;
      try {
        await client.postSessionIdPermissionsPermissionId({
          path: { id: p.sessionID, permissionID: p.id },
          body: { response: "once" },
        });
        log(`allow(${currentMode}/${permission})`, command ?? permission);
      } catch (e) {
        log("allow-reply-failed " + e, command ?? permission);
      }
    },
  };
};
