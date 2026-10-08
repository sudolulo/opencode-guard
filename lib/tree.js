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

export const TEAM_LIMITS = Object.freeze({
  // Final answers (teammate or not) per child. Bounded; an evicted child is
  // classified again from the root's history.
  classificationCache: 2000,
  // Messages per history page (spec section 4, fallback).
  pageSize: 50,
  // The most pages read for one classification: 10,000 messages. The creating part
  // is the OLDEST part naming the child, so a longer history cannot be answered,
  // and the lookup fails rather than guess from the newer pages.
  maxPages: 200,
});

// The child a task tool part names in state.metadata.sessionId, or null. opencode
// publishes a task part as running, with its input, about 90 ms BEFORE any
// tool.execute.before hook runs (spike S4); only a call that went on to create or
// resume a child carries metadata.sessionId, so a call a hook refused names nobody.
const taskChildOf = (part) => {
  if (part?.type !== "tool" || part?.tool !== "task") return null;
  const child = part?.state?.metadata?.sessionId;
  return typeof child === "string" && child !== "" ? child : null;
};

// Message ids, then part ids, ascend with creation time.
const olderThan = (a, b) => a.messageID < b.messageID || (a.messageID === b.messageID && a.partID < b.partID);

export const createTeamIndex = ({ client, directory, tree, limits = TEAM_LIMITS }) => {
  // child id -> { parent, background, messageID, partID, final }
  const known = new Map();

  // Keep the oldest part seen for a child. An entry read from complete history is
  // final: it IS the oldest part, so no later event can displace it. An event entry
  // trusts the parts it has seen; G2 (no background with task_id) and G5 (no
  // task_id naming a teammate) keep every later part naming a child in agreement
  // with the part that created it.
  const record = (child, entry) => {
    const current = known.get(child);
    if (current && !entry.final && (current.final || !olderThan(entry, current))) return;
    remember(known, child, entry, limits.classificationCache);
  };

  // The event hook's feed: every task part that names a child, foreground or
  // background. F20: this event is published before the child's first prompt runs.
  const observe = (event) => {
    if (event?.type !== "message.part.updated") return;
    const part = event.properties?.part;
    const child = taskChildOf(part);
    if (!child) return;
    const parent = part.sessionID ?? event.properties?.sessionID;
    if (typeof parent !== "string" || parent === "") return;
    if (typeof part.messageID !== "string" || typeof part.id !== "string") return;
    record(child, {
      parent,
      background: part.state?.input?.background === true,
      messageID: part.messageID,
      partID: part.id,
      final: false,
    });
  };

  // The oldest task part in the root's history naming the child, or null when the
  // whole history was read and none does. Pages run newest to oldest, so every page
  // must be read before the oldest match is known.
  const oldestTaskPart = async (child, root) => {
    let best = null;
    let before;
    const cursors = new Set();
    for (let page = 0; page < limits.maxPages; page += 1) {
      const query = before === undefined
        ? { directory, limit: limits.pageSize }
        : { directory, limit: limits.pageSize, before };
      let got;
      try {
        got = await client.session.messages({ path: { id: root }, query });
      } catch (error) {
        throw new TreeLookupError(`reading the messages of session ${root} failed: ${describe(error)}`, { cause: error });
      }
      if (failedReply(got)) {
        throw new TreeLookupError(`reading the messages of session ${root} failed: HTTP ${got?.response?.status ?? "?"}`);
      }
      if (!Array.isArray(got?.data)) {
        throw new TreeLookupError(`reading the messages of session ${root} returned no message list`);
      }
      for (const entry of got.data) {
        for (const part of Array.isArray(entry?.parts) ? entry.parts : []) {
          if (taskChildOf(part) !== child) continue;
          const messageID = part.messageID ?? entry?.info?.id;
          if (typeof messageID !== "string" || typeof part.id !== "string") {
            throw new TreeLookupError(`a task part naming ${child} in session ${root} has no message or part id`);
          }
          const candidate = { parent: root, background: part.state?.input?.background === true, messageID, partID: part.id };
          if (!best || olderThan(candidate, best)) best = candidate;
        }
      }
      const next = got.response?.headers?.get?.("x-next-cursor");
      if (!next) return best;
      if (cursors.has(next)) {
        throw new TreeLookupError(`paging the messages of session ${root} repeated cursor ${next}`);
      }
      cursors.add(next);
      before = next;
    }
    throw new TreeLookupError(
      `the history of session ${root} is longer than ${limits.maxPages} pages of ${limits.pageSize} messages, ` +
      `so the task call that created ${child} was not reached`);
  };

  // Is `child`, whose parent is the root `root`, a teammate? Spec section 4: iff the
  // root's CREATING task part for it (the oldest part naming it) had
  // state.input.background === true. Input, not metadata: promotion (F19) rewrites
  // metadata.background and never the input.
  const classifyChild = async (child, root) => {
    const hit = known.get(child);
    if (hit && hit.parent === root) return hit.background;
    const oldest = await oldestTaskPart(child, root);
    if (!oldest) {
      // Not cached: the spec makes "not found" a denial every time, never an answer.
      throw new TreeLookupError(
        `no task call in session ${root} created session ${child}, so it cannot be classified as a teammate or not`,
        { missing: true });
    }
    record(child, { ...oldest, final: true });
    return oldest.background;
  };

  // In a team iff a teammate or below one. Only a child of a root can be a teammate,
  // so the answer is the classification of the ancestry member just below the root.
  const inTeam = async (sessionID) => {
    const chain = await tree.ancestry(sessionID);
    if (chain.length < 2) return false;
    return classifyChild(chain[chain.length - 2], chain[chain.length - 1]);
  };

  return { observe, classifyChild, inTeam };
};
