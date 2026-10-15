// The 2026-10-14 god escalation policy as one pure table. Native core validates the SHAPE and
// lineage of whatever this returns; this table is the only place that decides WHICH refusals
// escalate and to whom. No I/O, so a classification here can never be mistaken for a grant.
// docs/superpowers/specs/2026-10-14-god-escalation-policy-design.md, section 5.2.
const ask = (kind, rootSessionID, reason, judged) => ({
  status: "ask",
  approval: { kind, sessionID: rootSessionID, reason },
  forceAsk: true,
  always: [],
  ...(judged ? { judged: true } : {}),
});

// `rootDeny` is the ROOT's effective (winning-rule) bash deny for this command: "named",
// "catch-all" or null. It is bash-only; for any other permission it is ignored.
export const decideProposal = ({ isRoot, rootMode, rootSessionID, permission, status, escalation, rootDeny }) => {
  const bash = permission === "bash";
  const effectiveRootDeny = bash && (rootDeny === "named" || rootDeny === "catch-all") ? rootDeny : null;
  if (rootMode === "god") {
    if (isRoot) {
      if (status === "deny") return { status: "allow", override: "root" };
      if (status === "ask") return { status: "allow" };
      return null;
    }
    if (escalation) return ask("parent", rootSessionID, escalation.reason);
    if (status === "deny") return ask("parent", rootSessionID, `native deny: ${permission}`);
    if (status === "ask") return ask("parent", rootSessionID, `native ask: ${permission}`);
    // The child's own rules let it run, the root's do not: the root model decides.
    if (effectiveRootDeny) return ask("parent", rootSessionID, "root policy deny: bash");
    return null;
  }
  // Every other attended root: the request is judged as the root's own would be.
  if (isRoot) {
    if (status === "deny" && effectiveRootDeny === "named") return ask("human-only", rootSessionID, "named hard rule");
    return null;
  }
  // Root-policy round (lead rulings): a descendant is judged as the root's own, whatever its
  // own rules let native say. The root could not run what its catch-all denies, so that is an
  // explicit deny over every native verdict and over a human-only credential stash; what the
  // root name-denies goes to the human once, a human-only stash keeping its own reason.
  if (effectiveRootDeny === "catch-all") return { status: "deny" };
  if (escalation?.kind === "human-only") return ask("human-only", rootSessionID, escalation.reason);
  if (effectiveRootDeny === "named") return ask("human-only", rootSessionID, "named hard rule");
  if (status !== "deny") return null;
  return ask("operator", rootSessionID, `judged as root: ${permission}`, true);
};
