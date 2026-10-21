// opencode-guard: concurrent-approver registry.
// Design: docs/superpowers/specs/2026-10-21-concurrent-approver-design.md
// Plan:   docs/superpowers/plans/2026-10-21-concurrent-approver.md (Task 1)
//
// A dedicated, approval-only subagent of a god root services that root's escalated parent
// approvals concurrently with the root's own loop, so a heavy subagent fan-out does not peg the
// root (which otherwise spends a model turn per ask). This module is the in-memory registry that
// binds an approver subagent session to the root it decides for, at a specific root incarnation.
//
// INERT on its own: it is wired into the authority delegate path (Task 2) and spawn/wake routing
// (Task 4), both gated by the `approver.enabled` site-config flag (default OFF). By itself it
// changes no behaviour.
//
// ☠️ THE REGISTRY IS A LOOKUP, NOT A TRUST DECISION. It records (root -> { approverSessionID,
// incarnationID }). The authority layer (lib/authority.js) is what decides whether to honour a
// decide/pending call from an approver session AS its root's authority, and only after it has
// re-verified ownership, no-self-approve, the CURRENT root incarnation (against incarnationID
// here), god mode and admission -- exactly the checks a root's own call passes. A cleared or
// incarnation-mismatched entry is simply "not found" here, and the caller then falls back to the
// root-wake path; it is never fail-open (design C4).

// Bounded like the other per-root guard maps, so a long-lived host cannot grow this without limit.
const MAX_APPROVERS = 512;

export const approverOptions = (raw) => {
  const section = raw && typeof raw === "object" ? raw : {};
  // OFF unless explicitly enabled -- the feature runs only where it is turned on.
  return { enabled: section.enabled === true };
};

export const createApproverRegistry = () => {
  // root sessionID -> { approverSessionID, incarnationID }
  const byRoot = new Map();
  // approver sessionID -> root sessionID (reverse lookup for a decide/pending caller)
  const byApprover = new Map();

  // Drop a root's registration, keeping both maps consistent. A re-register may have moved the
  // approver session to another root, so only remove the reverse entry when it still points here.
  const clear = (root) => {
    const entry = byRoot.get(root);
    if (!entry) return;
    byRoot.delete(root);
    if (byApprover.get(entry.approverSessionID) === root) byApprover.delete(entry.approverSessionID);
  };

  const register = (root, approverSessionID, incarnationID) => {
    if (typeof root !== "string" || !root) throw new Error("approver registry: invalid root");
    if (typeof approverSessionID !== "string" || !approverSessionID) {
      throw new Error("approver registry: invalid approver session");
    }
    // An approver can never be its own root -- that would be self-approval the authority layer must
    // never see from this path. Refuse it at the source.
    if (approverSessionID === root) throw new Error("approver registry: the approver cannot be the root itself");
    // Replace any prior registration for this root.
    clear(root);
    // An approver session belongs to exactly one root; drop any stale reverse binding for it so it
    // can never be read as the approver of two roots at once.
    const priorRoot = byApprover.get(approverSessionID);
    if (priorRoot !== undefined) clear(priorRoot);
    if (byRoot.size >= MAX_APPROVERS) {
      // Bounded: evict the oldest. An evicted root falls back to the root-wake path (never
      // fail-open, C4), so eviction is safe.
      const oldest = byRoot.keys().next().value;
      if (oldest !== undefined) clear(oldest);
    }
    byRoot.set(root, { approverSessionID, incarnationID });
    byApprover.set(approverSessionID, root);
  };

  // Which root, if any, is this session the REGISTERED approver of, and at what incarnation. The
  // authority layer compares incarnationID against the root's current binding before trusting it.
  const lookupByApprover = (approverSessionID) => {
    const root = byApprover.get(approverSessionID);
    if (root === undefined) return null;
    const entry = byRoot.get(root);
    // Defensive: the two maps must agree. If they ever disagree, report "not found" (fail closed).
    if (!entry || entry.approverSessionID !== approverSessionID) return null;
    return { root, incarnationID: entry.incarnationID };
  };

  const isApprover = (sessionID) => byApprover.has(sessionID);

  const approverOf = (root) => byRoot.get(root) ?? null;

  return { register, clear, lookupByApprover, isApprover, approverOf, size: () => byRoot.size };
};
