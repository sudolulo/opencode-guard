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
// The classifier is whatever ~/.config/opencode/classifier.json names (any
// OpenAI-compatible endpoint), with opencode-broker as an optional second lane when
// it is running -- see lib/classifier.js and lib/broker.js. Without either,
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
import { randomUUID, createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The decision logic lives in ./lib/, not beside this file: opencode calls every
// export of a plugin module as a Plugin function and drops the whole module if any
// export is not one, so the pure functions cannot be exported from here for tests
// (it says so in its own log, but nothing surfaces in the TUI). The relative path
// resolves against this file's REAL path -- so a bare-file symlink into
// ~/.config/opencode/plugin/ resolves back into this checkout.
import {
  normalizeLevel, normalizeMode, normalizeGlobalMode, resolveSessionMode, shouldAutoApprove, isUnattended, redactSecrets, revealActive,
  commandUnder, credentialAdvice, siteConfig,
  strip, commandIsRead, touchesCredentials, touchesHardCredentials, touchesPromptableCredentials,
  nativeCredentialGuardBlocks, localNoThinkApplies, directFallbackWarranted, SYSTEM, classifierDecides,
  agentCapability, dispatchRefusal, staleToolRefusal,
  nativeToolWritesControlFile, commandWritesControlFile,
} from "./lib/policy.js";
import { brokerAvailable, brokerRequest, leaseRespectsLocalOnly, resolveProfileFor } from "./lib/broker.js";
import { classifierConfig, classifierRoute, classifyDirect, verdictFromText } from "./lib/classifier.js";
import { createLoopGuard, createLoopGuardHook, loopGuardOptions } from "./lib/loop-guard.js";
import { createNotifier } from "./lib/notify.js";
import { loadSafetyNet, safetyNetVerdict } from "./lib/safety-net.js";

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
// The broker lane's budget. An agent pinned for this lane (examples/agents/) must be
// able to answer in one word inside it -- and for a reasoning model that is a
// property of how it is driven: one measured lane answered 6/6 correctly but blew
// this budget on 2 of 6 at its default reasoning effort, and on none at `none`.
const CLASSIFIER_TIMEOUT_MS = 12_000;

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
    appendFileSync(LOG, `${new Date().toISOString()} ${verdict} ${String(cmd).slice(0, 300)}\n`);
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

export const OpencodeGuard = async ({ client, directory }) => {
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
  // command -> verdict, so the same command judged in tool.execute.before is not
  // re-judged when its permission prompt arrives moments later.
  const verdicts = new Map();
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
    const info = payload?.data ?? payload;
    if (sessionInfo.size > 500) sessionInfo.clear();
    const record = { parentID: info?.parentID, agent: info?.agent };
    sessionInfo.set(sessionID, record);
    return record;
  } catch {
    return null;
  }
};
const profileFor = async (sessionID) => {
  const dir = classifierConfig().brokerDir;
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
  const profile = (await profileFor(sessionID)).profile;
  const config = classifierConfig();
  return {
    profile,
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
// classifier entirely for a child's bash. A child now tracks its parent, capped
// below god by normalizeGlobalMode. The parent is read through the
// same cached lookup profileFor already uses, so the SDK is consulted once per
// session and only when the session has no mode file of its own.
// Ceiling: one level, matching resolveProfileFor. A grandchild resolves through
// its own parent, not the root -- fine while only the root is ever set by hand.
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
  const parent = sessionMode((await infoFor(sessionID))?.parentID);
  return resolveSessionMode({ own, parent, fallback: globalMode() });
};

  // Sterile-repeat loop guard (lib/loop-guard.js). The parent comes from the same
  // cached lookup modeFor uses, with the legacy client as a second source; a session
  // whose parent cannot be proved reads as a root, which is only ever warned and
  // never aborted.
  const loopOptions = loopGuardOptions(siteConfig().loopGuard);
  const notifier = createNotifier({ client, directory });
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

  // The broker lane: lease a classifier target, run it as a disposable child
  // session of the requesting one, and clean that session up. For a privacy
  // profile the lease asks for `localOnly`, and a lease that still names a cloud
  // target is refused here rather than used.
  const classifyRouted = async (command, cwd, parentSessionID, config, localOnly) => {
    // The broker needs an ID before it selects a model, while OpenCode allocates
    // the actual session ID during creation. Keep broker accounting on this
    // disposable lease ID, then use the returned OpenCode ID for every API call.
    const leaseID = `guard-classifier-${randomUUID()}`;
    let sessionID = null;
    let target = null;
    let created = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);
    try {
      if (typeof parentSessionID !== "string" || !parentSessionID.startsWith("ses")) {
        throw new Error("classifier requires an OpenCode parent session");
      }
      // Declare the request size. The broker REFUSES a local target outright when the
      // lease carries no contextTokens (a missing estimate must never admit a local
      // model), so without this a local classifier target is configured but
      // permanently unreachable. This prompt is bounded and fully
      // known here -- system prompt plus one cwd and one command -- so the estimate is
      // honest rather than a placeholder. ~4 chars/token, plus headroom for the reply.
      const promptChars = String(config?.system ?? SYSTEM).length +
        String(cwd ?? "").length + String(command ?? "").length;
      const contextTokens = Math.ceil(promptChars / 4) + 256;
      const lease = await brokerRequest("/lease", {
        sessionID: leaseID,
        profile: "auto",
        tier: "classifier",
        contextTokens,
        ...(localOnly ? { localOnly: true } : {}),
      }, { timeout: 1500, dir: config?.brokerDir });
      const leased = lease?.target;
      if (!leased?.model?.providerID || !leased?.model?.id) throw new Error("broker returned no classifier target");
      if (!leaseRespectsLocalOnly(leased, localOnly)) {
        // Not a fault of the target, so it is not reported as one (target stays null).
        throw new Error(`broker leased non-local target ${leased.id} for a local-only classification`);
      }
      target = leased;
      const classifierAgent = typeof config?.brokerAgents?.[target.id] === "string"
        ? config.brokerAgents[target.id]
        : null;
      if (!classifierAgent) throw new Error(`no classifier agent configured for broker target: ${target.id}`);

      // A classifier must be a child of the requesting session. Root sessions made
      // through the V2 endpoint do not inherit this embedded instance's OAuth
      // provider context, while ordinary Task children do.
      const createdSession = await v2Client().session.create({
        parentID: parentSessionID,
        title: "opencode-guard command classifier",
        // Let the agent's pinned model resolve provider auth. Explicit V2 model
        // switches store only a model reference and bypass that resolved auth path.
        agent: classifierAgent,
      }, { signal: controller.signal });
      // Hey wraps the HTTP response in `data`, and the OpenCode V2 endpoint wraps
      // its SessionV2Info in another `data`. Accept either response style so the
      // classifier always uses OpenCode's allocated session ID.
      sessionID = (createdSession?.data?.data ?? createdSession?.data ?? createdSession)?.id;
      if (typeof sessionID !== "string" || !sessionID.startsWith("ses")) {
        throw new Error("OpenCode did not return a classifier session ID");
      }
      created = true;

      // The legacy prompt endpoint runs through the same authenticated provider
      // resolution as an ordinary Task child and returns the completed assistant
      // message. The V2 prompt endpoint cannot carry the resolved OAuth context.
      const prompted = await client.session.prompt({
        path: { id: sessionID },
        query: { directory },
        signal: controller.signal,
        body: {
          agent: classifierAgent,
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
      if (target?.id && !aborted && !noText) {
        try { await brokerRequest("/failure", { sessionID: leaseID, targetID: target.id, error: detail }, { dir: config?.brokerDir }); } catch {}
      }
      return `error:${detail}`;
    } finally {
      clearTimeout(timer);
      if (created) {
        // The classifier timeout aborts the HTTP client, not necessarily the server-side
        // agent loop. Deleting immediately raced that loop's final step-start write and
        // turned a routine timeout into a SQLite foreign-key error. Stop the disposable
        // loop, then use OpenCode's own idle barrier before removing its message history.
        try {
          await client.session.abort({ path: { id: sessionID }, query: { directory } });
        } catch (error) {
          log("classifier-cleanup-abort-failed", `${sessionID} ${error?.message ?? error}`);
        }
        try {
          // ☠️ `wait` lives ONLY on the V2 session group. On this client
          // `.session` is the legacy group (Session2: create/get/delete/
          // children/messages/prompt/abort) and `.v2.session` is Session3,
          // which is the only one declaring `wait`. Calling `.session.wait`
          // threw "is not a function" on EVERY cleanup, so the delete below
          // never ran and every disposable classifier session leaked --
          // 99 such deferrals were recorded in the decision log before the fix.
          await v2Client().v2.session.wait({ sessionID });
          await client.session.delete({ path: { id: sessionID }, query: { directory } });
        } catch (error) {
          // A leaked disposable session is safer than deleting beneath a loop that has
          // not proved it is idle; a later operator cleanup can remove the row safely.
          log("classifier-cleanup-deferred", `${sessionID} ${error?.message ?? error}`);
        }
      }
      try { await brokerRequest("/forget", { sessionID: leaseID }, { dir: config?.brokerDir }); } catch {}
    }
  };

  // A configured endpoint is tried DIRECTLY first, and the broker lane (when it is
  // in the route) is its fallback. classifyDirect creates no opencode session, so
  // the common path cannot leak one; classifyRouted does, and is reached only when
  // it is the only lane or the direct one failed fast. The timeout exclusion is
  // directFallbackWarranted in lib/policy.js, where it is tested.
  const classify = async (command, cwd, sessionID, route) => {
    const config = classifierConfig();
    const broker = route.lanes.includes("broker");
    if (route.lanes.includes("direct")) {
      const verdict = await classifyDirect({ command, cwd, config });
      if (!broker || !directFallbackWarranted(verdict)) return verdict;
      log(`direct classifier ${verdict}, falling back to the broker`, command);
    }
    if (broker) return classifyRouted(command, cwd, sessionID, config, route.localOnly);
    return "error:no-classifier";
  };

  const classifyWithRetry = async (command, sessionID, route) => {
    let verdict = await classify(command, directory, sessionID, route);
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
      return classify(command, directory, sessionID, route);
    }
    for (const waitMs of [750, 2500]) {
      if (verdict === "SAFE" || verdict === "RISKY") break;
      log(`retrying in ${waitMs}ms after ${verdict}`, command);
      await new Promise((r) => setTimeout(r, waitMs));
      verdict = await classify(command, directory, sessionID, route);
    }
    return verdict;
  };

  // Majority vote when configured (votes>1), else a single call. FAIL-CLOSED: SAFE
  // only with a strict majority of the configured votes; a tie, a lone dissent, or
  // errors all resolve toward RISKY. votes=1 (the default) is exactly the old path.
  const classifyVoted = async (command, sessionID, route) => {
    const { votes } = classifierConfig();
    if (votes <= 1) return classifyWithRetry(command, sessionID, route);
    let safe = 0, risky = 0, errored = 0;
    for (let i = 0; i < votes; i++) {
      const v = await classifyWithRetry(command, sessionID, route);
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
  const SHARED_TTL_MS = 6 * 60 * 60 * 1000;
  const cacheKey = (command) => createHash("sha256").update(`${directory}\0${command}`).digest("hex").slice(0, 24);
  const readShared = () => {
    try { return JSON.parse(readFileSync(SHARED_CACHE, "utf8")); } catch { return {}; }
  };
  const writeShared = (key, verdict) => {
    try {
      const now = Date.now();
      const store = readShared();
      for (const [k, v] of Object.entries(store)) if (now - (v?.[1] ?? 0) > SHARED_TTL_MS) delete store[k];
      store[key] = [verdict, now];
      const keys = Object.keys(store);
      if (keys.length > 2000) for (const k of keys.slice(0, keys.length - 2000)) delete store[k];
      mkdirSync(join(homedir(), ".local/share/opencode"), { recursive: true });
      const tmp = `${SHARED_CACHE}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(store), { mode: 0o600 });
      renameSync(tmp, SHARED_CACHE);
    } catch { /* cache is best-effort: a write failure just means a re-classify */ }
  };

  const classifyCached = async (command, sessionID, route) => {
    if (verdicts.has(command)) return verdicts.get(command);
    const key = cacheKey(command);
    const shared = readShared()[key];
    if (shared && Date.now() - (shared[1] ?? 0) < SHARED_TTL_MS && (shared[0] === "SAFE" || shared[0] === "RISKY")) {
      verdicts.set(command, shared[0]);         // promote into the hot layer
      return shared[0];
    }
    const verdict = await classifyVoted(command, sessionID, route);
    // Only cache decided verdicts: an error or timeout must be retried, not
    // remembered, or one blip would pin a command to "prompt" for the session.
    if (verdict === "SAFE" || verdict === "RISKY") {
      if (verdicts.size > 300) verdicts.clear();
      verdicts.set(command, verdict);
      writeShared(key, verdict);                // share with every other session
    }
    return verdict;
  };

  return {
    // A local classifier agent on a thinking model THINKS by default, and a
    // thinking verdict was measured at 44.8s against the 12s broker-lane budget --
    // the gate then refuses with "classifier is unavailable", which is a dead shell
    // in auto mode rather than a slower one. llama.cpp honours exactly one no-think
    // lever (see localNoThinkApplies), and this hook sets it on the broker lane's
    // own model calls. The direct lane sets it through classifier.json extraBody.
    // Scoped to a classifier agent ON a listed provider, deliberately: a local
    // coding agent on the same provider keeps its thinking, and cloud classifier
    // agents must never be handed this key.
    "chat.params": async (input, output) => {
      const { brokerAgents, noThinkProviders } = classifierConfig();
      if (!localNoThinkApplies(input?.agent, input?.provider?.id, Object.values(brokerAgents), noThinkProviders)) return;
      output.options = {
        ...output.options,
        chat_template_kwargs: { ...output.options?.chat_template_kwargs, enable_thinking: false },
      };
    },

    "tool.execute.before": async (input, output) => {
      const command = commandUnder(input?.tool, output?.args);

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

      // God mode: the person asked for everything to run, floor included, and
      // said so in a mode labelled god. Stand aside before the floor, not after --
      // half a bypass would be a floor that "sometimes" applies, which is worse
      // to reason about than none. Redaction (tool.execute.after) still runs.
      // This lifts THIS plugin's floor (cc-safety-net, the reveal guard and the
      // credential guard). opencode's own deny globs in opencode.json are a
      // separate native layer no plugin can lift, which is the place for a
      // last-resort hard floor (rm -rf /*, mkfs*, dd of=/dev/* ...) that should
      // stand even in god.
      // ATTENDED ONLY: the mode was set in front of a person, in one session, and
      // that is the whole grant. An unattended run keeps the floor even when its
      // per-session file says god -- `opencode run --session <id>` re-enters TUI
      // sessions headless, so file provenance is not the same thing as a person
      // present.
      if (!isUnattended && (await modeFor(input.sessionID)) === "god") { log("allow(god)", command ?? input?.tool); return; }

      // The guard's own switches (lib/policy.js, "The guard's own switches") are set
      // by a person, not from a tool call.
      if (nativeToolWritesControlFile({ tool: input?.tool, args: output?.args, directory })) {
        log(`deny(${input?.tool}/control-file)`, input?.tool);
        throw new Error(controlDeny);
      }

      // Native read/glob/grep calls never produce a shell command for the guard
      // below. Check their actual path arguments before the tool resolves a glob.
      if (nativeCredentialGuardBlocks({
        level: lvl, mode: await modeFor(input?.sessionID), unattended: isUnattended,
        tool: input?.tool, args: output?.args, directory,
      })) {
        log("deny(credential)", input?.tool);
        throw new Error(credentialDeny("ssh keys, cloud or registry credentials, or a configured secret path"));
      }
      if (!command) return;

      // ---- The floor. Static, precise, and on in every other mode. ----
      // A throw from cc-safety-net is a denial, not a skip: its contract is "if
      // checkCommand throws, do not run the command".
      const net = safetyNetVerdict(safetyNet.checkCommand, { command, cwd: directory });
      if (net.kind === "deny") {
        log(net.ruleId === "analysis-error" ? `deny(net-error)` : "deny(net)", command);
        throw new Error(
          `[opencode-guard] blocked: ${net.reason} ` +
          `(rule ${net.ruleId ?? "?"}). Do not rephrase to evade this; ` +
          `pick a genuinely safer approach or ask the user.`,
        );
      }

      // Before any allow rule can apply: reading a credential store is never
      // ordinary work, whatever the permission rules happen to say. This lives in
      // the plugin rather than in a deny glob because an agent's own `allow` block
      // is appended after the global rules and opencode takes the LAST match.
      // The reveal window is meant to be armed by a person at a terminal. An agent
      // that could arm it could turn redaction off for itself, which would make the
      // whole thing decorative -- so naming it from a tool call is refused. This
      // stops a helpful model unblocking itself; it is not proof against one that
      // sets out to construct the path another way.
      if (/\boc-reveal\b/.test(command) || /\.config\/opencode\/reveal\b/.test(command)) {
        log("deny(reveal-arm)", command);
        throw new Error(
          "[opencode-guard] blocked: the reveal window is armed by a person at a " +
          "terminal, not from a session -- otherwise redaction would be something " +
          "you could switch off for yourself. If you need an unredacted value, say " +
          "so and let the user run `oc-reveal` themselves.",
        );
      }

      if (commandWritesControlFile(command)) {
        log("deny(control-file)", command);
        throw new Error(controlDeny);
      }

      // Hard credential guard: file paths that could match `cat *`/`ls *` allow
      // rules. Always throw regardless of mode or attendance -- the permission
      // system cannot be trusted to stop these because an agent's own `allow`
      // block is appended after the global rules and opencode takes the last match.
      if (touchesHardCredentials(command)) {
        log("deny(credential)", command);
        throw new Error(credentialDeny("ssh keys, cloud or registry credentials, or a configured secret path"));
      }

      // Promptable credential guard: commands that are specific enough to never
      // match a broad allow rule (rbw, bw, op, pass). In unattended sessions
      // there is no one to ask, so throw. In attended sessions, return and let
      // the command fall through to opencode's permission system, where `*`=`ask`
      // prompts the user -- the event handler is also guarded to never auto-approve
      // a credential command.
      if (touchesPromptableCredentials(command)) {
        if (isUnattended) {
          log("deny(credential)", command);
          throw new Error(credentialDeny("a password-manager CLI -- and an unattended session has no one to ask"));
        }
        log("prompt(credential)", command);
        return;
      }
      if (input?.tool === "pty_write") return;  // credential check above is the whole job
      if (lvl === "static") return;

      // ---- Above the floor, the classifier answers one question: may this run
      // without asking anyone? So it runs exactly where nothing will be asked --
      // an unattended session, or auto mode. Manual and edits never reach the
      // model at all: there is a person, and opencode will ask them.
      const mode = await modeFor(input.sessionID);
      if (!isUnattended && !classifierDecides(mode)) return;
      // Named in every denial below. A mode change is invisible to the agent,
      // so a command that ran a minute ago and is refused now reads as the
      // classifier being nondeterministic -- when what actually changed is the
      // mode. Saying which state made the decision is what lets the agent tell
      // "approval lapsed" from "verdict changed".
      const state = isUnattended ? "unattended session" : `mode: ${mode}`;

      if (commandIsRead(command)) { log("allow(read)", command); return; }
      // Privacy profiles must not have command text shipped to a cloud classifier,
      // and with no lane at all there is nothing to ask. The profile is the
      // broker's concept, read through lib/broker.js; without the broker every
      // session resolves "auto".
      const route = await routeFor(input.sessionID);
      if (!route.lanes.length) {
        log(`deny(${route.profile}-no-classifier)`, command);
        throw new Error(
          `[opencode-guard] denied (${state}, profile: ${route.profile}): ${route.reason}, so this could not be judged. ` +
          "`oc-auto static` keeps static checks only, or switch to manual mode for a person to approve the command.",
        );
      }
      const verdict = await classifyCached(command, input.sessionID, route);
      if (verdict === "SAFE") return;

      // ---- Auto mode DENIES; it does not ask. A dialog cannot be pre-empted from
      // a plugin anyway (the permission.ask hook never fires on 1.18.22), so the
      // choice is between a modal on every gray command and a refusal the agent can
      // act on. A refusal is what auto mode is for: try another way, do the parts
      // that do not depend on this, and escalate to the person only when the
      // capability is genuinely required.
      if (verdict === "RISKY") {
        log("deny(llm)", command);
        throw new Error(
          `[opencode-guard] denied (${state}, level: ${lvl}): this looks risky to run unattended (writes ` +
          "outside the project, privilege escalation, package/service/system state, " +
          "history rewrite, or credentials).\n" +
          "If other work does not depend on this, carry on with that. You MAY reach " +
          "the same goal a genuinely safer way -- a narrower command, a read instead " +
          "of a write, a tool that does not need this. Do NOT rephrase the same " +
          "action to get past this check.\n" +
          "If the capability really is required, STOP and tell the user what you " +
          "were trying to do and why. They can switch to manual mode and run it " +
          "themselves, or approve it there.",
        );
      }

      // No verdict, and in auto mode nothing is going to ask. Deciding "allow" here
      // would be the one thing this plugin promises not to do.
      log(`deny(${verdict})`, command);
      throw new Error(
        `[opencode-guard] denied (${state}, level: ${lvl}): the command classifier is unavailable (${verdict}), ` +
        "so this could not be judged. Carry on with anything that does not depend on " +
        "it. `oc-auto static` continues with static checks only, and manual mode " +
        "asks the user instead.",
      );
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
      if (level() === "off") return;
      redact(input, output);
      await loopHook.after(input, output);
    },
    event: async ({ event }) => {
      try {
        await notifier.onEvent(event);
        if (event?.type === "session.deleted") {
          const gone = event.properties?.info?.id ?? event.properties?.sessionID;
          if (gone) loopHook.forget(gone);
        }
      } catch (error) {
        log("loop-guard-error", error?.message ?? error);
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
      const currentMode = await modeFor(p.sessionID);
      if (currentMode === "manual") return;
      // A DELEGATED child is one whose mode was INHERITED rather than held: no mode
      // file of its own, but a parent. If a mode was set on the child itself it
      // owns its mode and is treated like any other session. For a delegated child a
      // refusal has to be ANSWERED rather than left standing -- standing aside drops
      // the prompt on the person, which is the babysitting this removes. The main
      // session holds the mode the child was refused, so it is the one that decides.
      const ownMode = sessionMode(p.sessionID);
      const parentID = ownMode ? null : (await infoFor(p.sessionID))?.parentID;
      const delegated = !ownMode && !!parentID;
      // A privacy profile with no local classifier stands aside entirely: nothing
      // is approved on its behalf, and every prompt stays with the person.
      const route = await routeFor(p.sessionID);
      if (route.localOnly && !route.lanes.length) return;
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
