// The classifier's configuration, its route, and the direct endpoint call. Shared
// by the plugin and `oc-check`, so a dry run asks the same endpoint the same way.
//
// ~/.config/opencode/classifier.json is re-read on every classification, so a
// changed endpoint takes effect in running sessions. Every field is optional:
//   url          OpenAI-compatible /chat/completions endpoint for the direct lane.
//                Also $OPENCODE_GUARD_CLASSIFIER_URL.
//   model        model id sent in the request (most endpoints require one).
//   authToken    bearer token. Also $OPENCODE_GUARD_CLASSIFIER_TOKEN. Omitted from
//                the request when neither is set.
//   authTokenFile  a file holding the bearer token, read on every classification, so
//                the secret stays in one 0600 file instead of being copied into this
//                one. `~/` is expanded. authToken wins when both are set.
//   private      true when the endpoint keeps data on infrastructure you control.
//                Only then may a session under a privacy profile use it.
//   votes        N>1 runs the classifier N times and takes the majority, failing
//                closed on a tie or errors. Sequential on purpose: a shared
//                single-slot GPU would self-batch parallel calls.
//   timeoutMs    direct-lane timeout (default 25000).
//   extraBody    merged into the request body; a key set to null is removed. For
//                llama.cpp with a thinking model:
//                { "chat_template_kwargs": { "enable_thinking": false } }
//   systemPrompt replaces the built-in prompt (lib/policy.js SYSTEM).
//   promptAddendum  site rules appended to the prompt, e.g. an operation that is
//                routine on your machines but on the built-in RISKY list.
//   broker       false to never use opencode-broker even when it is running.
//   brokerDir    the broker's state directory, if not the default.
//   brokerAgents { "<broker target id>": "<opencode agent name>" } for the broker
//                lane (see examples/agents/).
//   noThinkProviders  provider ids whose broker-lane classifier calls get the
//                llama.cpp no-think kwarg (default ["llamacpp"]).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SYSTEM } from "./policy.js";

export const classifierConfigPath = () => join(homedir(), ".config/opencode/classifier.json");
// The pre-classifier.json way to name a model; still honoured when `model` is absent.
const modelFlagPath = () => join(homedir(), ".config/opencode/autoclass-model");

const DEFAULT_NO_THINK_PROVIDERS = Object.freeze(["llamacpp"]);
const DEFAULT_DIRECT_TIMEOUT_MS = 25_000;

const text = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const plainObject = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null);
// The token in a file, first line only. An unreadable file yields no token rather than an
// exception: the endpoint then answers 401, which the plugin already treats as a cheap fault.
const tokenFromFile = (path, read) => {
  const name = text(path);
  if (!name) return null;
  try {
    return text(read(name.startsWith("~/") ? join(homedir(), name.slice(2)) : name).split("\n")[0]);
  } catch { return null; }
};

export const classifierConfig = ({ env = process.env, read = (path) => readFileSync(path, "utf8") } = {}) => {
  let cfg = {};
  try { cfg = plainObject(JSON.parse(read(classifierConfigPath()))) ?? {}; } catch { cfg = {}; }
  let model = text(cfg.model);
  if (!model) { try { model = text(read(modelFlagPath())); } catch {} }
  const url = text(cfg.url) ?? text(env.OPENCODE_GUARD_CLASSIFIER_URL) ?? text(env.OPENCODE_GUARDRAILS_CLASSIFIER_URL);
  const votes = Number(cfg.votes);
  const timeoutMs = Number(cfg.timeoutMs);
  const system = text(cfg.systemPrompt) ? cfg.systemPrompt : SYSTEM;
  const addendum = text(cfg.promptAddendum);
  return {
    configured: Boolean(url),
    url,
    model,
    authToken: text(cfg.authToken) ?? tokenFromFile(cfg.authTokenFile, read) ?? text(env.OPENCODE_GUARD_CLASSIFIER_TOKEN),
    private: cfg.private === true,
    votes: Number.isFinite(votes) ? Math.max(1, Math.min(5, Math.round(votes))) : 1,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_DIRECT_TIMEOUT_MS,
    extraBody: plainObject(cfg.extraBody) ?? {},
    broker: cfg.broker !== false && cfg.broker !== "off",
    brokerDir: text(cfg.brokerDir),
    brokerAgents: plainObject(cfg.brokerAgents) ?? {},
    noThinkProviders: Array.isArray(cfg.noThinkProviders)
      ? cfg.noThinkProviders.filter((p) => typeof p === "string" && p)
      : DEFAULT_NO_THINK_PROVIDERS,
    system: addendum
      ? `${system}\n\nSite rules. Where these conflict with the lists above, these win:\n${addendum}`
      : system,
  };
};

// Which lanes may judge a command for a session under `profile`.
//
// `auto` and `manual` are the ordinary profiles: the direct endpoint first when one
// is configured, the broker behind it when it is running. Any other profile is a
// privacy profile (the broker's `local`, `private`, ... or one added later): its
// command text may not leave infrastructure the operator controls, so only a
// direct endpoint marked `private` qualifies, and the broker is asked for a
// local-only lease. With no lane left the answer is a refusal, never a cloud call.
export const PROFILES_WITHOUT_EGRESS_LIMIT = new Set(["auto", "manual"]);
export const classifierRoute = ({ profile, config, brokerAvailable }) => {
  const restricted = !PROFILES_WITHOUT_EGRESS_LIMIT.has(profile ?? "auto");
  const lanes = [];
  if (config?.configured && (!restricted || config.private)) lanes.push("direct");
  if (brokerAvailable) lanes.push("broker");
  if (lanes.length) return { lanes, localOnly: restricted, reason: null };
  return {
    lanes,
    localOnly: restricted,
    reason: restricted
      ? `profile ${profile} keeps command text on local infrastructure, and no local classifier is available ` +
        "(mark a local endpoint \"private\": true in classifier.json, or run opencode-broker with a local classifier target)"
      : "no classifier is configured (set url in ~/.config/opencode/classifier.json, or run opencode-broker)",
  };
};

// The request the direct lane sends. `extraBody` can add keys or, with null,
// remove the defaults an endpoint rejects (OpenAI's reasoning models refuse
// max_tokens and temperature, for one).
export const directRequest = (config, { command, cwd }) => {
  const body = {
    ...(config.model ? { model: config.model } : {}),
    temperature: 0,
    top_p: 1,
    // Continuous batching makes temperature 0 alone non-reproducible: the same
    // `docker ps --filter ...` line was once judged SAFE and once RISKY. A pinned
    // seed is what makes a verdict stable enough to argue with.
    seed: 0,
    max_tokens: 8,
    ...config.extraBody,
    messages: [
      { role: "system", content: config.system },
      { role: "user", content: `cwd: ${cwd}\ncommand: ${command}` },
    ],
  };
  for (const [key, value] of Object.entries(body)) if (value === null) delete body[key];
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.authToken ? { Authorization: `Bearer ${config.authToken}` } : {}),
    },
    body: JSON.stringify(body),
  };
};

// SAFE only when the answer says so. Anything else a model can say is RISKY, and a
// transport failure is an `error:` verdict the caller fails closed on.
export const verdictFromText = (answer) =>
  String(answer ?? "").trim().toUpperCase().startsWith("SAFE") ? "SAFE" : "RISKY";

export const classifyDirect = async ({ command, cwd, config, fetchImpl = fetch }) => {
  const controller = new AbortController();
  // Generous by default: a local classifier may share one GPU with the session's
  // own model, so a request issued mid-generation waits its turn.
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? DEFAULT_DIRECT_TIMEOUT_MS);
  try {
    const res = await fetchImpl(config.url, { ...directRequest(config, { command, cwd }), signal: controller.signal });
    if (!res.ok) return "error:http" + res.status;
    const data = await res.json();
    return verdictFromText(data?.choices?.[0]?.message?.content);
  } catch (error) {
    return "error:" + (error?.name === "AbortError" ? "timeout" : error);
  } finally {
    clearTimeout(timer);
  }
};
