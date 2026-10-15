import test from "node:test";
import assert from "node:assert/strict";
import { decideProposal } from "../lib/escalation.js";
import { bashDenyKind } from "../lib/policy.js";

const root = "ses_root";
const base = { rootSessionID: root, permission: "bash", rootDeny: null };
const kindOf = (proposal) => proposal?.approval?.kind ?? proposal?.override ?? proposal?.status ?? null;

test("god root own: any visible-tool deny -> override, ask -> allow, other statuses -> null", () => {
  const g = { ...base, isRoot: true, rootMode: "god" };
  assert.deepEqual(decideProposal({ ...g, status: "deny" }), { status: "allow", override: "root" });
  assert.deepEqual(decideProposal({ ...g, status: "ask" }), { status: "allow" });
  assert.equal(decideProposal({ ...g, status: "allow" }), null);
  assert.deepEqual(decideProposal({ ...g, status: "deny", permission: "edit" }), { status: "allow", override: "root" });
});

test("god root own: a stashed escalation never reaches the table as an ask", () => {
  const g = { ...base, isRoot: true, rootMode: "god" };
  assert.equal(decideProposal({ ...g, status: "allow", escalation: { kind: "parent", permission: "bash", reason: "x" } }), null);
  assert.deepEqual(decideProposal({ ...g, status: "deny", permission: "external_directory" }), { status: "allow", override: "root" });
});

test("god descendant: every refusal and every ask -> exact parent ask, never human", () => {
  const g = { ...base, isRoot: false, rootMode: "god" };
  for (const input of [
    { ...g, status: "deny" },
    { ...g, status: "deny", rootDeny: "named" },
    { ...g, status: "deny", permission: "external_directory" },
    { ...g, status: "ask" },
    { ...g, status: "allow", escalation: { kind: "parent", permission: "bash", reason: "launder: sed -i" } },
  ]) {
    const proposal = decideProposal(input);
    assert.equal(proposal.approval.kind, "parent", JSON.stringify(input));
    assert.equal(proposal.approval.sessionID, root);
    assert.equal(proposal.forceAsk, true);
    assert.deepEqual(proposal.always, []);
    assert.equal(typeof proposal.approval.reason, "string");
  }
  assert.equal(decideProposal({ ...g, status: "allow" }), null);
});

test("god descendant proposals carry the stash reason verbatim", () => {
  const g = { ...base, isRoot: false, rootMode: "god" };
  assert.equal(decideProposal({ ...g, status: "allow", escalation: { kind: "parent", permission: "bash", reason: "launder: sed -i s/a/b/ x" } }).approval.reason, "launder: sed -i s/a/b/ x");
  assert.match(decideProposal({ ...g, status: "deny" }).approval.reason, /native deny: bash/);
  assert.match(decideProposal({ ...g, status: "ask", permission: "edit" }).approval.reason, /native ask: edit/);
});

test("auto root own: named deny -> human-only; everything else -> no proposal", () => {
  const a = { ...base, isRoot: true, rootMode: "auto" };
  assert.equal(kindOf(decideProposal({ ...a, status: "deny", rootDeny: "named" })), "human-only");
  assert.equal(decideProposal({ ...a, status: "deny", rootDeny: "catch-all" }), null);
  assert.equal(decideProposal({ ...a, status: "deny", permission: "edit" }), null, "a non-bash root deny stays denied under auto");
  assert.equal(decideProposal({ ...a, status: "ask" }), null, "the classifier handler judges the root's asks");
  assert.equal(decideProposal({ ...a, status: "allow" }), null);
});

test("auto root own: human-only only for a NAMED bash deny", () => {
  const a = { ...base, isRoot: true, rootMode: "auto" };
  assert.equal(decideProposal({ ...a, status: "deny", rootDeny: "named", permission: "edit" }), null);
  assert.equal(decideProposal({ ...a, status: "ask", rootDeny: "named" }), null);
});

// Rewritten (root-policy round, lead ruling "effective winning ROOT catch-all bash deny"): a
// descendant is judged as the root's own, and the root could not run a command its own
// catch-all denies, so the cell is an explicit { status: "deny" } instead of null.
test("auto descendant: judged like the root", () => {
  const a = { ...base, isRoot: false, rootMode: "auto" };
  assert.equal(kindOf(decideProposal({ ...a, status: "deny", rootDeny: "named" })), "human-only");
  assert.deepEqual(decideProposal({ ...a, status: "deny", rootDeny: "catch-all" }), { status: "deny" });
  const judged = decideProposal({ ...a, status: "deny" });
  assert.equal(judged.approval.kind, "operator");
  assert.equal(judged.judged, true);
  assert.equal(decideProposal({ ...a, status: "deny", permission: "external_directory" }).approval.kind, "operator");
  assert.equal(kindOf(decideProposal({ ...a, status: "ask", escalation: { kind: "human-only", permission: "bash", reason: "credential" } })), "human-only");
  assert.equal(decideProposal({ ...a, status: "ask" }), null);
  assert.equal(decideProposal({ ...a, status: "allow" }), null);
});

test("auto descendant: a human-only stash wins over every status", () => {
  const a = { ...base, isRoot: false, rootMode: "auto" };
  for (const status of ["deny", "ask", "allow"]) {
    const proposal = decideProposal({ ...a, status, escalation: { kind: "human-only", permission: "bash", reason: "credential" } });
    assert.equal(proposal.approval.kind, "human-only");
    assert.equal(proposal.judged, undefined);
  }
});

test("root policy: a non-god descendant under an effective ROOT catch-all bash deny is explicitly denied for every native status, over any stash", () => {
  for (const rootMode of ["auto", "manual", "edits"]) for (const status of ["deny", "ask", "allow"]) {
    for (const escalation of [undefined, { kind: "human-only", permission: "bash", reason: "credential-promptable: deferred bash floor" }]) {
      const input = { ...base, isRoot: false, rootMode, status, rootDeny: "catch-all", escalation };
      assert.deepEqual(decideProposal(input), { status: "deny" }, JSON.stringify(input));
    }
  }
});

test("root policy: a non-god descendant under an effective ROOT named bash deny is human-only for every native status", () => {
  for (const rootMode of ["auto", "manual", "edits"]) for (const status of ["deny", "ask", "allow"]) {
    const named = decideProposal({ ...base, isRoot: false, rootMode, status, rootDeny: "named" });
    assert.deepEqual(named, { status: "ask", approval: { kind: "human-only", sessionID: root, reason: "named hard rule" }, forceAsk: true, always: [] }, `${rootMode}/${status}`);
    const stashed = decideProposal({ ...base, isRoot: false, rootMode, status, rootDeny: "named", escalation: { kind: "human-only", permission: "bash", reason: "credential-promptable: deferred bash floor" } });
    assert.equal(stashed.approval.kind, "human-only");
    assert.equal(stashed.approval.reason, "credential-promptable: deferred bash floor", "a human-only stash keeps its own reason");
  }
});

test("root policy: a god descendant's natively allowed bash call under an effective ROOT deny is a parent ask", () => {
  for (const rootDeny of ["named", "catch-all"]) {
    const proposal = decideProposal({ ...base, isRoot: false, rootMode: "god", status: "allow", rootDeny });
    assert.deepEqual(proposal, { status: "ask", approval: { kind: "parent", sessionID: root, reason: "root policy deny: bash" }, forceAsk: true, always: [] }, rootDeny);
    assert.equal(decideProposal({ ...base, isRoot: false, rootMode: "god", status: "deny", rootDeny }).approval.reason, "native deny: bash");
    assert.equal(decideProposal({ ...base, isRoot: false, rootMode: "god", status: "allow", rootDeny, escalation: { kind: "parent", permission: "bash", reason: "launder: deferred bash floor" } }).approval.reason, "launder: deferred bash floor");
  }
});

test("root policy: rootDeny never applies to a non-bash permission, and never changes a root's own cells", () => {
  for (const permission of ["edit", "read", "external_directory", "webfetch"]) for (const rootDeny of ["named", "catch-all"]) {
    assert.equal(decideProposal({ ...base, permission, isRoot: false, rootMode: "auto", status: "allow", rootDeny }), null);
    assert.equal(decideProposal({ ...base, permission, isRoot: false, rootMode: "god", status: "allow", rootDeny }), null);
    assert.equal(decideProposal({ ...base, permission, isRoot: false, rootMode: "auto", status: "deny", rootDeny }).approval.kind, "operator");
  }
  assert.equal(decideProposal({ ...base, isRoot: true, rootMode: "auto", status: "allow", rootDeny: "catch-all" }), null);
  assert.equal(decideProposal({ ...base, isRoot: true, rootMode: "auto", status: "ask", rootDeny: "named" }), null);
  assert.equal(decideProposal({ ...base, isRoot: true, rootMode: "god", status: "allow", rootDeny: "named" }), null);
});

test("manual and edits roots use the non-god table", () => {
  for (const rootMode of ["manual", "edits"]) {
    assert.equal(decideProposal({ ...base, isRoot: false, rootMode, status: "deny" }).approval.kind, "operator");
    assert.equal(decideProposal({ ...base, isRoot: true, rootMode, status: "ask" }), null);
  }
});

test("no table cell ever yields parent outside god, or human-only under god", () => {
  for (const isRoot of [true, false]) for (const rootMode of ["god", "auto", "manual", "edits"])
    for (const status of ["deny", "ask", "allow"]) for (const rootDeny of ["named", "catch-all", null])
      for (const escalation of [undefined, { kind: "parent", permission: "bash", reason: "x" }, { kind: "human-only", permission: "bash", reason: "x" }]) {
        if (rootMode === "god" && escalation?.kind === "human-only") continue;
        if (rootMode !== "god" && escalation?.kind === "parent") continue;
        const kind = decideProposal({ ...base, isRoot, rootMode, status, rootDeny, escalation })?.approval?.kind;
        if (rootMode === "god") assert.notEqual(kind, "human-only");
        else assert.notEqual(kind, "parent");
        if (isRoot) assert.notEqual(kind, "parent", "a root never approves itself");
      }
});

test("judged is set only on the operator cell", () => {
  for (const isRoot of [true, false]) for (const rootMode of ["god", "auto", "manual", "edits"])
    for (const status of ["deny", "ask", "allow"]) for (const rootDeny of ["named", "catch-all", null])
      for (const escalation of [undefined, { kind: "parent", permission: "bash", reason: "x" }, { kind: "human-only", permission: "bash", reason: "x" }]) {
        if (rootMode === "god" && escalation?.kind === "human-only") continue;
        if (rootMode !== "god" && escalation?.kind === "parent") continue;
        const proposal = decideProposal({ ...base, isRoot, rootMode, status, rootDeny, escalation });
        if (!proposal?.approval) continue;
        assert.equal(proposal.judged === true, proposal.approval.kind === "operator");
        assert.equal(proposal.forceAsk, true);
        assert.deepEqual(proposal.always, []);
        assert.equal(proposal.approval.sessionID, root);
      }
});

test("the root override is produced only for the god root's own deny", () => {
  for (const isRoot of [true, false]) for (const rootMode of ["god", "auto", "manual", "edits"])
    for (const status of ["deny", "ask", "allow"]) for (const rootDeny of ["named", "catch-all", null])
      for (const escalation of [undefined, { kind: "parent", permission: "bash", reason: "x" }, { kind: "human-only", permission: "bash", reason: "x" }]) {
        if (rootMode === "god" && escalation?.kind === "human-only") continue;
        if (rootMode !== "god" && escalation?.kind === "parent") continue;
        const proposal = decideProposal({ ...base, isRoot, rootMode, status, rootDeny, escalation });
        assert.equal(proposal?.override !== undefined, isRoot && rootMode === "god" && status === "deny");
      }
});

test("decideProposal returns exact outputs across the complete input cross product", () => {
  const permissions = ["bash", "edit", "read", "external_directory", "guard_decide"];
  const rootModes = ["god", "auto", "manual", "edits"];
  const statuses = ["deny", "ask", "allow"];
  const rootDenies = ["named", "catch-all", null];
  const stashes = [
    undefined,
    { kind: "parent", permission: "bash", reason: "saved floor" },
    { kind: "human-only", permission: "bash", reason: "saved floor" },
  ];
  const codes = {
    O: { status: "allow", override: "root" },
    A: { status: "allow" },
    N: null,
    H: { kind: "human-only", reason: "named hard rule" },
    S: { kind: "human-only", reason: "saved floor" },
    P: { kind: "parent", reason: "saved floor" },
    D: { kind: "parent", reasonPrefix: "native deny: " },
    Q: { kind: "parent", reasonPrefix: "native ask: " },
    J: { kind: "operator", reasonPrefix: "judged as root: ", judged: true },
    R: { kind: "parent", reason: "root policy deny: bash" },
    X: { status: "deny" },
  };
  // Root-policy round: rows are native deny / ask / allow, columns no stash / parent stash /
  // human-only stash. A non-god descendant is judged as the root's own: a ROOT named bash deny
  // is human-once whatever native says (a human-only stash keeps its reason), a ROOT catch-all
  // bash deny is an explicit deny over everything (the root could not run it either). A god
  // descendant whose bash call native allows is still a parent ask when the root denies it.
  const matrices = {
    rootGod: [["O", "O", "O"], ["A", "A", "A"], ["N", "N", "N"]],
    rootNamedBash: [["H", "H", "H"], ["N", "N", "N"], ["N", "N", "N"]],
    rootOther: [["N", "N", "N"], ["N", "N", "N"], ["N", "N", "N"]],
    childGod: [["D", "P", "P"], ["Q", "P", "P"], ["N", "P", "P"]],
    childGodRootDenyBash: [["D", "P", "P"], ["Q", "P", "P"], ["R", "P", "P"]],
    childNamedBash: [["H", "H", "S"], ["H", "H", "S"], ["H", "H", "S"]],
    childCatchAllBash: [["X", "X", "X"], ["X", "X", "X"], ["X", "X", "X"]],
    childOther: [["J", "J", "S"], ["N", "N", "S"], ["N", "N", "S"]],
  };
  const statusIndex = { deny: 0, ask: 1, allow: 2 };

  const expectedFor = ({ isRoot, rootMode, status, rootDeny, escalation, permission }) => {
    let matrix;
    if (isRoot && rootMode === "god") matrix = matrices.rootGod;
    else if (isRoot && permission === "bash" && rootDeny === "named") matrix = matrices.rootNamedBash;
    else if (isRoot) matrix = matrices.rootOther;
    else if (rootMode === "god" && permission === "bash" && rootDeny !== null) matrix = matrices.childGodRootDenyBash;
    else if (rootMode === "god") matrix = matrices.childGod;
    else if (permission === "bash" && rootDeny === "named") matrix = matrices.childNamedBash;
    else if (permission === "bash" && rootDeny === "catch-all") matrix = matrices.childCatchAllBash;
    else matrix = matrices.childOther;

    const stashIndex = escalation === undefined ? 0 : escalation.kind === "parent" ? 1 : 2;
    const code = codes[matrix[statusIndex[status]][stashIndex]];
    if (code === null) return null;
    if (code.status) return code;

    const reason = code.reason ?? `${code.reasonPrefix}${permission}`;
    const proposal = {
      status: "ask",
      approval: { kind: code.kind, sessionID: root, reason },
      forceAsk: true,
      always: [],
    };
    if (code.judged) proposal.judged = true;
    return proposal;
  };

  let combinations = 0;
  for (const isRoot of [true, false]) {
    for (const rootMode of rootModes) {
      for (const status of statuses) {
        for (const rootDeny of rootDenies) {
          for (const escalation of stashes) {
            for (const permission of permissions) {
              const input = {
                rootSessionID: root,
                isRoot,
                rootMode,
                status,
                rootDeny,
                escalation,
                permission,
              };
              assert.deepEqual(decideProposal(input), expectedFor(input), JSON.stringify(input));
              combinations += 1;
            }
          }
        }
      }
    }
  }
  assert.equal(combinations, 1080);
});

test("bashDenyKind distinguishes named denies from a catch-all", () => {
  const rules = [["*", "ask"], ["git push --force*", "deny"]];
  assert.equal(bashDenyKind("git push --force origin x", rules), "named");
  assert.equal(bashDenyKind("make && git push --force origin x", rules), "named");
  assert.equal(bashDenyKind("make", rules), null);
  assert.equal(bashDenyKind("make", [["*", "deny"], ["go test *", "allow"]]), "catch-all");
  assert.equal(bashDenyKind("go test ./...", [["*", "deny"], ["go test *", "allow"]]), null);
});

test("bashDenyKind uses the WINNING rule: a later matching named allow overrides an earlier deny", () => {
  const wild = [["*", "deny"], ["git push*", "allow"]];
  assert.equal(bashDenyKind("git push origin x", wild), null, "a later named allow beats the catch-all deny");
  assert.equal(bashDenyKind("git status", wild), "catch-all");
  const named = [["*", "ask"], ["git push --force*", "deny"], ["git push --force-with-lease*", "allow"]];
  assert.equal(bashDenyKind("git push --force-with-lease origin x", named), null, "a later named allow beats a named deny");
  assert.equal(bashDenyKind("git push --force origin x", named), "named");
  assert.equal(bashDenyKind("go test ./... && make", [["*", "deny"], ["go test *", "allow"]]), "catch-all", "any command node with a winning deny counts");
  assert.equal(bashDenyKind("make deploy && git push --force x", [["*", "deny"], ["git push --force*", "deny"]]), "named", "named outranks catch-all across nodes");
});

test("bashDenyKind: cd lines are skipped and the config default applies", () => {
  const rules = [["*", "ask"], ["git push --force*", "deny"]];
  assert.equal(bashDenyKind("cd /etc && git push --force origin x", rules), "named");
  assert.equal(bashDenyKind("cd /etc", [["*", "deny"]]), null);
  assert.equal(bashDenyKind("snip git push --force origin x", [["*", "ask"], ["git push --force*", "deny"]]), null);
  assert.doesNotThrow(() => bashDenyKind("ls"));
});
