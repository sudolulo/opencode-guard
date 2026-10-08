// Tree rules for agent teams (opencode-guard 1.7.0). Spec: opencode-peers
// docs/superpowers/specs/2026-10-07-agent-teams-design.md, section 4.
//
// The guard reads a session's ancestry and a root's task parts through the legacy
// SDK client opencode hands every plugin (PluginInput.client), with this
// instance's directory, the same way the loop guard reads parents in plugin.js.
// Every lookup that cannot be completed rejects with TreeLookupError, and the
// callers turn that into a denial naming the rule: a rule that cannot be checked
// is not passed.

export const TREE_LIMITS = Object.freeze({
  // A session's parentID never changes, so a cached parent link is final. The cache
  // is bounded anyway: a TUI that runs all day sees thousands of sessions.
  parentCache: 2000,
  // The longest ancestry walked. opencode's own subagent_depth is a single digit in
  // practice; a longer chain is a loop or corrupt data, and refusing is the safe
  // reading of either.
  maxDepth: 16,
});

export class TreeLookupError extends Error {
  // `missing` is true only when the lookup PROVED something absent (a 404 for a
  // session, or a complete history with no creating task part). Every other
  // failure may be transient as far as the caller can tell.
  constructor(message, { missing = false, cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "TreeLookupError";
    this.missing = missing;
  }
}

const describe = (error) => String(error?.message ?? error);

// Map keeps insertion order, so the first key is the oldest entry.
const remember = (map, key, value, cap) => {
  map.delete(key);
  map.set(key, value);
  while (map.size > cap) map.delete(map.keys().next().value);
};

// The legacy client resolves { data, error, request, response } and does not throw
// on an HTTP error; it throws only when the request itself fails.
const failedReply = (got) => got?.error !== undefined && got?.error !== null;

const RULES = Object.freeze({
  G1: "G1, resume only your own child",
  G2: "G2, background teammates only from an attended root",
  G3: "G3, inherited permission mode",
  G4: "G4, tools closed to agent teams",
});

export const treeDenial = (rule, detail) => `[opencode-guard] denied (${RULES[rule] ?? rule}): ${detail}`;

export const treeLookupDenial = (rule, error) => treeDenial(rule, error?.missing
  ? `the guard could not check this rule: ${describe(error)}. A rule that cannot be checked is not passed, ` +
    "and retrying will not change the answer. Stop and tell the user which call was refused, and this reason."
  : `the guard could not check this rule because a session lookup failed (${describe(error)}). ` +
    "A rule that cannot be checked is not passed. Retry once; if it fails again, stop and tell the user " +
    "that opencode-guard could not read session data from the opencode server.");

export const createSessionTree = ({ client, directory, limits = TREE_LIMITS }) => {
  const parents = new Map();

  // One uncached read. Resolves { parentID } (null for a root) for a session that
  // exists and refreshes the cached link; rejects with TreeLookupError otherwise.
  const readSession = async (sessionID) => {
    if (typeof sessionID !== "string" || sessionID === "") {
      throw new TreeLookupError("there is no session id to look up");
    }
    let got;
    try {
      got = await client.session.get({ path: { id: sessionID }, query: { directory } });
    } catch (error) {
      throw new TreeLookupError(`reading session ${sessionID} failed: ${describe(error)}`, { cause: error });
    }
    if (failedReply(got)) {
      const status = got?.response?.status;
      if (status === 404) throw new TreeLookupError(`session ${sessionID} does not exist`, { missing: true });
      const reason = got.error?.data?.message ?? got.error?.name ?? got.error;
      throw new TreeLookupError(`reading session ${sessionID} failed: HTTP ${status ?? "?"}, ${describe(reason)}`);
    }
    const info = got?.data;
    if (!info || typeof info !== "object") {
      throw new TreeLookupError(`reading session ${sessionID} returned no session record`);
    }
    const parentID = typeof info.parentID === "string" && info.parentID !== "" ? info.parentID : null;
    remember(parents, sessionID, parentID, limits.parentCache);
    return { parentID };
  };

  // The cached parent link (a session's parentID never changes), read on a miss.
  const parentOf = async (sessionID) => {
    if (parents.has(sessionID)) return parents.get(sessionID);
    return (await readSession(sessionID)).parentID;
  };

  // [sessionID, parent, grandparent, ..., root].
  const ancestry = async (sessionID) => {
    const chain = [sessionID];
    let current = sessionID;
    for (;;) {
      const parentID = await parentOf(current);
      if (parentID === null) return chain;
      if (chain.includes(parentID)) {
        throw new TreeLookupError(`the ancestry of session ${sessionID} loops at ${parentID}`);
      }
      chain.push(parentID);
      if (chain.length > limits.maxDepth) {
        throw new TreeLookupError(`the ancestry of session ${sessionID} is deeper than ${limits.maxDepth} sessions`);
      }
      current = parentID;
    }
  };

  return { readSession, parentOf, ancestry };
};
