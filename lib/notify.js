import { eventIncarnation } from "./lifecycle.js";

// Deliver a message into another session, used by the loop guard to tell a
// parent session why its child was stopped.
//
// Sending a prompt into a session that is mid-turn is not a safe no-op: depending
// on the host version it can queue into, and steer, the running turn. So the
// notifier tracks which sessions it has seen busy from this plugin instance's own
// event stream, and a message for a busy session waits for that session's next
// idle event instead of being sent into it. A send that fails is queued the same
// way, and everything queued for a session is dropped when the session is deleted.
//
// Ported from opencode-agent-workflows, where the same notifier delivers
// background workflow results.
export const createNotifier = ({ client, directory }) => {
  const query = directory ? { directory } : {};
  const pending = new Map();
  const busy = new Set();

  const send = async (sessionID, text) => {
    await client.session.prompt({
      path: { id: sessionID },
      query,
      body: { parts: [{ type: "text", text, synthetic: true }] },
    });
  };

  const enqueue = (sessionID, text) => {
    const queue = pending.get(sessionID) ?? [];
    queue.push(text);
    pending.set(sessionID, queue);
  };

  const notify = async (sessionID, text) => {
    if (!sessionID) return false;
    if (busy.has(sessionID)) {
      enqueue(sessionID, text);
      return false;
    }
    try {
      await send(sessionID, text);
      return true;
    } catch {
      enqueue(sessionID, text);
      return false;
    }
  };

  const onEvent = async (event) => {
    const sessionID = event?.properties?.sessionID ?? event?.properties?.info?.id;
    if (!sessionID) return;
    if (event?.type === "session.status") {
      const status = event?.properties?.status?.type;
      if (status && status !== "idle") busy.add(sessionID);
      return;
    }
    if (event?.type === "session.deleted") {
      busy.delete(sessionID);
      pending.delete(sessionID);
      return;
    }
    if (event?.type !== "session.idle") return;
    busy.delete(sessionID);
    const queue = pending.get(sessionID);
    if (!queue?.length) return;
    pending.delete(sessionID);
    for (const text of queue) {
      try { await send(sessionID, text); } catch { /* session gone */ }
    }
  };

  return { notify, onEvent, pendingCount: () => [...pending.values()].reduce((n, q) => n + q.length, 0) };
};

// Approval wakeups use v2 promptAsync because they must preserve the root's own
// agent/model identity. This is intentionally separate from legacy loop notices.
// `incarnationID` is the root binding captured when the wake was created (see
// authority.observe); it travels with the queued wake and is handed to every
// authoritative `current` check unchanged, never refreshed.
//
// Unlike the loop notices above, an approval wake is sent INTO a busy root. A child is
// blocked on it, and a root mid-turn is exactly the root that has to see it: held for
// idle, it waited out the root's whole turn while the child waited on the root
// (2026-10-20, anthro: two asks unanswered for 10+ minutes behind one long turn). The
// host folds a prompt that lands mid-turn into the running loop, the same way it
// delivers a background task's result. Only a wake whose send FAILED is queued, and
// the root's next idle retries it.
export const createApprovalNotifier = ({ sdk, directory, identityFor, current, lifecycle, onError = () => {} }) => {
  const pending = new Map();
  const enqueue = (sessionID, requestID, token, incarnationID) => {
    const queue = pending.get(sessionID) ?? new Map();
    queue.set(requestID, { token, incarnationID });
    // Do not evict a live cause: the newer requests may all settle before idle,
    // leaving the evicted request as the only reason this root needs to wake.
    pending.set(sessionID, queue);
  };
  const send = async (sessionID, requestID, token, incarnationID) => {
    if (lifecycle && !lifecycle.admit(sessionID, token)) return false;
    if (!await current(sessionID, requestID, incarnationID)) return false;
    const identity = await identityFor(sessionID);
    if (lifecycle && !lifecycle.admit(sessionID, token)) return false;
    // A pending request or root mode can change while identity is being read.
    if (!await current(sessionID, requestID, incarnationID)) return false;
    if (lifecycle && !lifecycle.admit(sessionID, token)) return false;
    await sdk.session.promptAsync({
      sessionID, directory, agent: identity.agent, model: identity.model,
      ...(identity.variant ? { variant: identity.variant } : {}),
      parts: [{ type: "text", text: `A child permission request (${requestID}) is pending, and more may be queued. Call guard_pending to list EVERY pending request for this root and decide them ALL in this one turn (one guard_decide per request), before resuming your own work -- each child stays blocked until you decide it.`, synthetic: true }],
    });
    return true;
  };
  const notify = async (sessionID, requestID, token, incarnationID) => {
    if (!sessionID || !requestID) return false;
    // Creating a wake is real root activity, so it tracks the root's admission.
    token ??= lifecycle?.track(sessionID);
    if (lifecycle && !lifecycle.admit(sessionID, token)) return false;
    try { return await send(sessionID, requestID, token, incarnationID); }
    catch (error) {
      if (!lifecycle || lifecycle.admit(sessionID, token)) enqueue(sessionID, requestID, token, incarnationID);
      onError(error);
      return false;
    }
  };
  const onEvent = async (event) => {
    if (event?.type === "permission.replied") {
      for (const [root, queue] of pending) {
        queue.delete(event.properties?.requestID);
        if (!queue.size) pending.delete(root);
      }
      return;
    }
    const sessionID = event?.properties?.sessionID ?? event?.properties?.info?.id;
    if (!sessionID) return;
    // Fence before any awaited work so an abort cannot be overtaken by idle.
    if (event.type === "session.deleted" || event.type === "session.aborted") {
      // On an incarnation host a delayed event for an older incarnation of this ID
      // is not applied (lib/lifecycle.js); the replacement root's queued wakes
      // belong to the replacement, so they are kept too.
      const incarnationID = eventIncarnation(event);
      const applied = !lifecycle || (event.type === "session.aborted"
        ? lifecycle.abort(sessionID, incarnationID)
        : lifecycle.deleted(sessionID, incarnationID));
      if (applied === false) return;
      if (incarnationID === undefined || !lifecycle?.incarnationsEnabled?.()) {
        // No identity to compare: drop everything for this ID, as before.
        pending.delete(sessionID);
        return;
      }
      // With an identity, drop only what provably belongs to that incarnation (or
      // carries no binding at all).
      const queue = pending.get(sessionID);
      if (queue) {
        for (const [requestID, wake] of queue) {
          if (wake.incarnationID === undefined || wake.incarnationID === incarnationID) queue.delete(requestID);
        }
        if (!queue.size) pending.delete(sessionID);
      }
      return;
    }
    if (event.type !== "session.idle") return;
    const queue = pending.get(sessionID);
    if (!queue) return;
    pending.delete(sessionID);
    for (const [requestID, { token, incarnationID }] of queue) await notify(sessionID, requestID, token, incarnationID);
  };
  return { notify, onEvent, pendingCount: () => [...pending.values()].reduce((n, q) => n + q.size, 0) };
};
