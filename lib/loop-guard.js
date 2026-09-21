// Sterile-repeat loop detection.
//
// A "sterile repeat" is a READ-ONLY tool call whose input signature AND output
// fingerprint both match an earlier call in the same session, with no
// state-changing tool call in between. Repeating a pure read of unchanged state
// acquires zero new information -- that is a fact about the call, not a guess
// about the model's intent, which is what makes this safe to act on.
//
// Calibrated against real sessions in opencode's own database: a genuinely
// looping child reached a streak of 306 (three read-only ssh probes rotating
// A,B,C,A,B,C), while four legitimate long sessions peaked at 2-5. The rotation
// is why opencode's built-in doom_loop missed it: that only fires on three
// IDENTICAL consecutive calls inside one assistant message.
//
// Rejected alternative, for the record: a sliding-window "distinct signature
// ratio" detector was measured and discarded. A legitimate session editing one
// file 14 times in a row scored WORSE than the real loop, so the ratio does not
// separate the two populations at all.
import { createHash } from "node:crypto";

// Tools that only observe. A state-changing tool is anything not listed here,
// which is the safe default: an unknown tool is assumed to mutate.
// `bash` is listed although a shell can write. What makes a repeat sterile is the
// identical OUTPUT as well as the identical input, and counting every shell call as
// a mutation would hide the commonest loop there is: re-running the same failing
// command and getting the same failure back.
export const READ_ONLY_TOOLS = new Set(["bash", "read", "grep", "glob", "list", "webfetch", "websearch"]);

// Deterministic, key-order-insensitive, cycle-safe. Never throws: a signature
// that blows up would take the tool result down with it.
const stableStringify = (value, seen = new Set()) => {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  const type = typeof value;
  if (type === "string") return JSON.stringify(value);
  if (type === "number" || type === "boolean" || type === "bigint") return String(value);
  if (type === "function" || type === "symbol") return type;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  try {
    if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], seen)}`).join(",")}}`;
  } finally {
    seen.delete(value);
  }
};

const fingerprintOf = (output) => {
  const text = typeof output === "string" ? output : stableStringify(output);
  return `${createHash("sha256").update(text).digest("hex").slice(0, 32)}:${text.length}`;
};

export const createLoopGuard = ({ warnAt = 12, handBackAt = 25, maxSignatures = 512, maxSessions = 64 } = {}) => {
  // sessionID -> { memo: signature -> fingerprint, streak, handedBack }.
  // Map insertion order doubles as LRU order for both bounds.
  const sessions = new Map();

  const stateFor = (sessionID) => {
    const existing = sessions.get(sessionID);
    if (existing) {
      // Refresh recency so an active session is never evicted before an idle one.
      sessions.delete(sessionID);
      sessions.set(sessionID, existing);
      return existing;
    }
    const fresh = { memo: new Map(), streak: 0, handedBack: false };
    sessions.set(sessionID, fresh);
    while (sessions.size > maxSessions) sessions.delete(sessions.keys().next().value);
    return fresh;
  };

  const observe = ({ sessionID, tool, args, output } = {}) => {
    if (typeof sessionID !== "string" || !sessionID || typeof tool !== "string" || !tool) return null;
    const state = stateFor(sessionID);

    if (!READ_ONLY_TOOLS.has(tool)) {
      // A mutation may legitimately change what an identical read returns next,
      // so every memoized answer is now suspect. Forget them all.
      state.memo.clear();
      state.streak = 0;
      return null;
    }

    const signature = `${tool}\u0000${stableStringify(args)}`;
    const fingerprint = fingerprintOf(output);

    if (state.memo.get(signature) === fingerprint) {
      // The streak is global to the session's call stream, not per signature,
      // so a rotation of several sterile reads accumulates like a single one.
      state.streak += 1;
    } else {
      state.memo.set(signature, fingerprint);
      state.streak = 0;
    }
    while (state.memo.size > maxSignatures) state.memo.delete(state.memo.keys().next().value);

    if (state.streak >= handBackAt && !state.handedBack) {
      state.handedBack = true;
      return { type: "handback", streak: state.streak, signature };
    }
    if (state.streak >= warnAt) return { type: "warn", streak: state.streak, signature };
    return null;
  };

  const forget = (sessionID) => { sessions.delete(sessionID); };

  return { observe, forget };
};

// Thresholds and the on/off switch from the `loopGuard` section of the site config.
// Anything malformed falls back to the calibrated defaults rather than disabling the
// guard: only an explicit `enabled: false` turns it off.
export const loopGuardOptions = (raw) => {
  const section = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const positive = (value, fallback) =>
    Number.isInteger(value) && value > 0 ? value : fallback;
  const warnAt = positive(section.warnAt, 12);
  const handBackAt = Math.max(positive(section.handBackAt, 25), warnAt);
  return { enabled: section.enabled !== false, warnAt, handBackAt };
};

const TAG = "loop-guard";
const block = (text) => `\n\n<${TAG}>${text}</${TAG}>`;
const append = (output, text) => {
  if (!output || typeof output !== "object") return;
  output.output = typeof output.output === "string" ? output.output + text : text.trimStart();
};

// What the plugin does with a detector verdict, kept here so it can be tested
// without an opencode server. Appending to the tool result is the only channel
// that reaches the looping agent on its very next step, so every warning goes
// there first.
//   parentOf(sessionID) -> parent session id, or null when none can be proved
//   notify(sessionID, text) -> deliver a message into that session
//   abort(sessionID)        -> stop that session's current turn
// A failure anywhere in here is reported through onError and swallowed: the loop
// guard must never be the reason a tool result is lost.
export const createLoopGuardHook = ({ guard, parentOf, notify, abort, onError = () => {} }) => {
  const after = async (input, output) => {
    if (!guard) return;
    try {
      const action = guard.observe({ sessionID: input?.sessionID, tool: input?.tool, args: input?.args, output: output?.output });
      if (!action) return;
      const repeats = action.streak + 1;
      if (action.type === "warn") {
        append(output, block(`This ${input.tool} call has now returned IDENTICAL output ${repeats} times in a row` +
          " with no state-changing call in between, so it is acquiring no new information. Stop repeating it:" +
          " change approach, or report what you already have."));
        return;
      }
      const parent = await parentOf(input.sessionID);
      if (!parent) {
        // Root session: a person is at the keyboard, so escalate the text and
        // NEVER abort. Aborting here would kill the user's own turn.
        append(output, block(`STOP. This ${input.tool} call has returned IDENTICAL output ${repeats} times in a row` +
          " with no state-changing call in between. Repeating it cannot produce new information." +
          " Change approach now, or report what you already have and say plainly what is blocked."));
        return;
      }
      append(output, block(`HANDBACK: this ${input.tool} call has returned IDENTICAL output ${repeats} times in a row` +
        " with no state-changing call in between. Control is being handed back to the session that spawned this one." +
        " Report what you have; do not run it again."));
      // The parent learns why BEFORE the child is stopped. An aborted child fails
      // the parent's task tool, and a failed tool never reaches tool.execute.after,
      // so this message is the only place the evidence survives.
      await notify(parent, `[loop guard] Child session ${input.sessionID} was handed back after ${action.streak} sterile repeats` +
        ` of a read-only call that returned identical output every time.\nRepeated call: ${action.signature.replace("\u0000", " ")}\n` +
        "It was acquiring no new information, so it was aborted. YOU decide what happens next -- re-running the same call will do the same thing.");
      await abort(input.sessionID);
    } catch (error) {
      try { onError(error); } catch { /* reporting must not throw either */ }
    }
  };
  const forget = (sessionID) => { try { guard?.forget(sessionID); } catch { /* best effort */ } };
  return { after, forget };
};
