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
