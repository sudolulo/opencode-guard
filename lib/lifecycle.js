// Per-root admission state for approval wakeups. Tokens deliberately outlive a
// deleted map entry so work paused on I/O cannot resurrect after deletion.
//
// State is created only by real root activity (track, abort, and -- on a host
// without session incarnations -- deleted). Reads (token, admit, has) never insert,
// so asking about an arbitrary ID cannot grow the map.
//
// Deleted roots: a host that advertises `sessionIncarnation: 1` lets every deferred
// effect bind the root's incarnation and drop itself when the authoritative read no
// longer matches, so a deleted record is closed and then removed. Until that
// capability is known (and forever on an old host) deleted records are retained,
// fail-closed, exactly as before: a same-ID recreate there is indistinguishable
// from the original by ID alone.
//
// Incarnation-bound events (docs/superpowers/specs/2026-10-13-incarnation-bound-cleanup-design.md
// section 5): with the capability, a record is bound to the root incarnation the
// authority read at real root activity (`bind`), and `session.aborted` /
// `session.deleted` close it only when the event's identity matches. A delayed
// event for an older incarnation of the same ID is ignored, so it cannot close a
// replacement root's admission. Where no comparison is possible -- the event carries
// no identity, or the record is not bound yet -- the record is still closed: closing
// can only withhold a wake or a decision until the next real user turn, while
// ignoring could let an aborted root's deferred work run. That choice is logged.
// Native emits an event identity only on a capable host, so an event carrying one
// enables the capability (sticky) even before any authority call has probed it.
//
// Exception, for liveness: an identity-bearing `session.aborted` that finds no record,
// or an identity-bearing abort or delete that finds a record not yet bound, is NOT
// applied as a closure. Closing there would let a delayed inc1 event close the
// admission a same-ID inc2 replacement is about to use, and nothing re-offers that
// root's child requests afterwards. The identity is kept instead (pendingAborts /
// pendingDeletes on the unbound record, or an abort tombstone in a bounded per-ID map)
// and the record's first authoritative bind decides: adopting the event's incarnation
// closes the record (and removes it for a delete), so the inc1 fence holds; adopting
// any other incarnation leaves it open. Every deferred effect binds before it acts, so
// no inc1 work runs in between. A real user turn lifts a deferred abort (authority.resume
// binds first, which turns it into an ordinary closure), never a deferred delete.
//
// An identity event for a DIFFERENT incarnation than a bound record's is not applied
// to that record (return false), but it is kept the same way: the root may have been
// replaced under this ID and its replacement aborted or deleted before this guard saw
// any of its activity. The bind that replaces the record decides it: adopting a kept
// abort's incarnation installs the replacement's record closed, a kept delete's
// installs none.
//
// Read epochs: bind replaces a bound record on a mismatching read. Two reads racing a
// replacement could otherwise bind out of order -- the fresh read adopts inc2, then a
// read that started earlier (and saw inc1) replaces the record with inc1 again,
// closing inc2's admission. A caller captures readEpoch() before its authoritative
// read and passes it to bind; a record adopted after that point is never replaced by
// that read, and bind returns "stale" so the caller fails closed for that call instead
// of proceeding as if bound. Omitting the epoch keeps the previous (unguarded) behavior.
//
// Accepted gap (reorder-only, narrow): a real user turn's resume protects only against
// closures that SWAP the record's token while its root read is in flight. A deferred
// abort marker (pendingAborts / tombstone) that lands during that read swaps nothing;
// if the resume's own bind then adopts that incarnation, the marker becomes a closure
// that this same user message lifts. It needs an abort event reordered against a user
// message for the same incarnation; no per-marker versioning is kept for it.
//
// Kept identities are a small set per ID (DEFERRED_LIMIT), not one slot, so a second
// event cannot overwrite the one the first bind adopts. Evicting one, like evicting a
// tombstone, can drop a genuine fence, so both are logged as errors.
const TOMBSTONE_LIMIT = 256;
const DEFERRED_LIMIT = 4;
export const eventIncarnation = (event) => {
  const value = event?.type === "session.deleted" ? event.properties?.info?.incarnationID : event?.properties?.incarnationID;
  return typeof value === "string" && value !== "" ? value : undefined;
};

// Native emits an event incarnationID only on a host that advertises
// sessionIncarnation: 1, so a well-formed one proves the capability.
const validIncarnation = (value) => typeof value === "string" && value !== "";

// `isChild(sessionID)` is a synchronous predicate: true only when the session is
// KNOWN to be a child (a cached parent link). A child never owns a root admission,
// so its identity abort is not tombstoned; that keeps the bounded tombstone map for
// roots, where an eviction is a fail-open event. Unknown sessions still tombstone.
export const createRootLifecycle = ({ onError = () => {}, onDebug = () => {}, isChild = () => false } = {}) => {
  const roots = new Map();
  // sessionID -> Set of incarnationIDs of identity aborts that arrived with no record.
  const tombstones = new Map();
  let incarnations = false;
  // Monotonic across all records: a record adopted (or installed by a replacement)
  // at epoch N is never replaced by a read that started before N (see the header).
  let epoch = 0;
  // Add to a bounded insertion-ordered set; the oldest is evicted, with an error.
  const keep = (set, incarnationID, what) => {
    set.delete(incarnationID);
    set.add(incarnationID);
    while (set.size > DEFERRED_LIMIT) {
      const oldest = set.values().next().value;
      set.delete(oldest);
      onError(lifecycleError(`${what} (incarnation ${oldest}) evicted at the ${DEFERRED_LIMIT}-per-ID limit; ` +
        "a later bind of that incarnation is no longer fenced by it"));
    }
  };
  const tombstone = (sessionID, incarnationID) => {
    const kept = tombstones.get(sessionID) ?? new Set();
    tombstones.delete(sessionID);
    tombstones.set(sessionID, kept);
    keep(kept, incarnationID, `abort tombstone for ${sessionID}`);
    while (tombstones.size > TOMBSTONE_LIMIT) {
      const [oldest, oldestIncarnations] = tombstones.entries().next().value;
      tombstones.delete(oldest);
      // Known children never tombstone (isChild), so this may drop a genuinely
      // aborted root's fence: fail-open, hence an error.
      onError(lifecycleError(`abort tombstone for ${oldest} (incarnation ${[...oldestIncarnations].join(", ")}) evicted at the ` +
        `${TOMBSTONE_LIMIT}-entry limit; a later bind of that incarnation is no longer fenced by it`));
    }
  };
  const open = (incarnationID) => ({
    closed: false, deleted: false, incarnationID, token: { closed: false },
    pendingAborts: new Set(), pendingDeletes: new Set(), epoch: incarnationID === undefined ? undefined : ++epoch,
  });
  const deferAbort = (sessionID, state, incarnationID) => keep(state.pendingAborts, incarnationID, `deferred abort for ${sessionID}`);
  const deferDelete = (sessionID, state, incarnationID) => keep(state.pendingDeletes, incarnationID, `deferred delete for ${sessionID}`);
  const close = (state) => {
    state.closed = true;
    state.token.closed = true;
    state.token = { closed: true };
  };
  const lifecycleError = (message) => new Error(`[opencode-guard] root lifecycle: ${message}`);
  // Should an incarnation-capable event for `sessionID` act on the existing record?
  // false only for a provably stale event; see the header for the restrictive cases.
  const applies = (kind, sessionID, state, incarnationID) => {
    if (incarnationID === undefined) {
      onError(lifecycleError(`session.${kind} for ${sessionID} carries no incarnationID although the host advertises ` +
        "sessionIncarnation: 1; closing its admission (fail-closed)"));
      return true;
    }
    if (!state) return true;
    if (state.incarnationID === undefined) {
      onError(lifecycleError(`session.${kind} for ${sessionID} (incarnation ${incarnationID}) hit a record not yet bound ` +
        "to an incarnation; closing its admission (fail-closed)"));
      return true;
    }
    return state.incarnationID === incarnationID;
  };
  // Called once the host is known to advertise `sessionIncarnation: 1` (a probe, or
  // an event carrying an identity). Records retained while it was unknown are already
  // closed; their stale work is now also rejected by incarnation, so they are released.
  const enableIncarnations = () => {
    if (incarnations) return;
    incarnations = true;
    for (const [sessionID, state] of roots) if (state.deleted) roots.delete(sessionID);
  };
  const userContent = (parts) => Array.isArray(parts) && parts.some((part) =>
    part?.synthetic !== true && (part?.type === "file" ||
    (part?.type === "text" && typeof part.text === "string" && part.text.length > 0)));

  return {
    // Real root activity: the root is creating deferred work that must be fenced
    // by a later abort or delete.
    track(sessionID) {
      let state = roots.get(sessionID);
      if (!state) {
        state = open();
        roots.set(sessionID, state);
      }
      return state.token;
    },
    token: (sessionID) => roots.get(sessionID)?.token,
    admit: (sessionID, token) => !token?.closed && !roots.get(sessionID)?.closed,
    // `incarnationID` is the authoritative root read made under `token`, the
    // admission captured by that same real root activity. Never inserts. Returns
    // false only when the record belonged to another incarnation: the root was
    // replaced under the same ID, so the old admission (and with it the calling
    // work, which shares it) is closed and a fresh record for the current
    // incarnation takes its place (closed if a kept abort names that incarnation,
    // absent if a kept delete does). A token that is no longer the record's current
    // admission binds nothing: its read may predate a replacement.
    //
    // `readEpoch` is readEpoch() captured before that read. A record adopted after it
    // is not replaced: the read may predate the replacement the adoption reflects.
    // That refusal returns "stale" -- distinct from true ("matches" or nothing to bind)
    // and from false (replaced) -- because the caller's read disagrees with the
    // record's incarnation: it must fail closed for that call, never proceed as bound.
    bind(sessionID, token, incarnationID, readEpoch) {
      const state = roots.get(sessionID);
      if (!incarnations || typeof incarnationID !== "string" || !state || state.token !== token) return true;
      if (state.incarnationID === undefined) {
        state.incarnationID = incarnationID;
        state.epoch = ++epoch;
        // Deferred identity aborts and deletes (see the header) are decided now, once.
        const aborted = state.pendingAborts.has(incarnationID) || tombstones.get(sessionID)?.has(incarnationID) === true;
        const deleted = state.pendingDeletes.has(incarnationID);
        state.pendingAborts.delete(incarnationID);
        state.pendingDeletes.delete(incarnationID);
        // Tombstoned aborts for OTHER incarnations may name a same-ID replacement that
        // was aborted before any of its activity reached this guard. They move onto the
        // record (bounded), so the bind that replaces it installs that record closed.
        for (const kept of tombstones.get(sessionID) ?? []) {
          if (kept !== incarnationID) deferAbort(sessionID, state, kept);
        }
        tombstones.delete(sessionID);
        if (deleted) {
          close(state);
          roots.delete(sessionID);
        } else if (aborted) {
          close(state);
        }
        return true;
      }
      if (state.incarnationID === incarnationID) return true;
      if (readEpoch !== undefined && state.epoch !== undefined && readEpoch < state.epoch) {
        onDebug(lifecycleError(`a read of ${sessionID} showing ${incarnationID} started before the record was bound to ` +
          `${state.incarnationID}; it is stale and replaces nothing`));
        return "stale";
      }
      close(state);
      // The root was replaced under this ID. Identity events kept for the replacement
      // while the record was still bound to the old incarnation are decided here.
      if (state.pendingDeletes.has(incarnationID)) {
        roots.delete(sessionID);
        return false;
      }
      const fresh = open(incarnationID);
      for (const kept of state.pendingAborts) if (kept !== incarnationID) fresh.pendingAborts.add(kept);
      for (const kept of state.pendingDeletes) fresh.pendingDeletes.add(kept);
      roots.set(sessionID, fresh);
      if (state.pendingAborts.has(incarnationID)) close(fresh);
      return false;
    },
    // Both return false when an incarnation-capable host's event is provably for
    // an older incarnation than the bound record, and therefore was not applied.
    abort(sessionID, eventIncarnationID) {
      const incarnationID = validIncarnation(eventIncarnationID) ? eventIncarnationID : undefined;
      if (incarnationID !== undefined) enableIncarnations();
      let state = roots.get(sessionID);
      if (incarnations && incarnationID !== undefined && state?.incarnationID === undefined) {
        // Nothing to compare against yet: defer to the first bind (see the header).
        if (state) deferAbort(sessionID, state, incarnationID);
        else if (isChild(sessionID) !== true) tombstone(sessionID, incarnationID);
        return true;
      }
      if (incarnations && !applies("aborted", sessionID, state, incarnationID)) {
        // Another incarnation than the bound record's: kept for a replacing bind.
        if (state && incarnationID !== undefined) deferAbort(sessionID, state, incarnationID);
        return false;
      }
      if (!state) {
        state = open();
        roots.set(sessionID, state);
      }
      close(state);
      return true;
    },
    deleted(sessionID, eventIncarnationID) {
      const incarnationID = validIncarnation(eventIncarnationID) ? eventIncarnationID : undefined;
      if (incarnationID !== undefined) enableIncarnations();
      const existing = roots.get(sessionID);
      if (incarnations) {
        const kept = incarnationID === undefined ? undefined : tombstones.get(sessionID);
        if (kept?.delete(incarnationID) && kept.size === 0) tombstones.delete(sessionID);
        if (incarnationID !== undefined && existing && existing.incarnationID === undefined) {
          // Nothing to compare against yet: defer to the first bind (see the header).
          deferDelete(sessionID, existing, incarnationID);
          return true;
        }
        if (!applies("deleted", sessionID, existing, incarnationID)) {
          // Another incarnation than the bound record's: kept for a replacing bind.
          if (existing && incarnationID !== undefined) deferDelete(sessionID, existing, incarnationID);
          return false;
        }
        if (existing) close(existing);
        roots.delete(sessionID);
        return true;
      }
      const state = existing ?? open();
      roots.set(sessionID, state);
      close(state);
      state.deleted = true;
      return true;
    },
    resume(sessionID, parts, token) {
      const state = roots.get(sessionID);
      // A real user turn after an abort lifts it, tombstoned or not.
      if (!state) return userContent(parts) && tombstones.delete(sessionID);
      // A deferred abort on a record (pending marker or tombstone) is not lifted here:
      // the caller (authority.resume) binds first, which decides it into an ordinary
      // closure below -- and that closure IS lifted by this message, including a marker
      // that landed during the caller's read (the accepted reorder-only gap in the
      // header). Only a closure that swapped the token during that read is protected:
      // the caller then passes its pre-read token, which no longer matches. A marker
      // still present here (record left unbound) stays.
      if (!state.closed) return false;
      if (state.deleted || !userContent(parts) || (token && token !== state.token)) return false;
      state.closed = false;
      state.token = { closed: false };
      return true;
    },
    // Capture before an authoritative root read and pass to bind. One sequence for
    // every record, so a replacement record's epoch is still comparable; the
    // sessionID is accepted for call-site clarity only.
    readEpoch: (_sessionID) => epoch,
    enableIncarnations,
    incarnationsEnabled: () => incarnations,
    // The incarnation a record is bound to, or undefined. A read; never inserts.
    incarnation: (sessionID) => roots.get(sessionID)?.incarnationID,
    has: (sessionID) => roots.has(sessionID),
    size: () => roots.size,
    tombstones: () => tombstones.size,
  };
};
