import { eventIncarnation } from "./lifecycle.js";

const authorityError = (message) => new Error(`[opencode-guard] permission authority unavailable: ${message}`);

const dataOf = (reply) => reply?.data ?? reply;

const pendingList = async ({ v2, directory }) => {
  if (typeof v2?.permission?.list !== "function") {
    throw authorityError("the host provides no native pending-permission API");
  }
  const pending = dataOf(await v2.permission.list({ directory }));
  if (!Array.isArray(pending)) throw authorityError("the native pending-permission API returned an invalid response");
  return pending;
};

// A host that EXPLICITLY lacks the native authority feature: no SDK probe, or a
// well-formed capability object without the field. Classified by this stable code,
// never by message text. Transport errors, HTTP errors (the SDK throws their body)
// and malformed responses are NOT this class and always stay fail-closed.
export const AUTHORITY_UNSUPPORTED = "AUTHORITY_UNSUPPORTED";
const unsupportedError = (message) => Object.assign(authorityError(message), { code: AUTHORITY_UNSUPPORTED });

const isPlainObject = (value) => value !== null && typeof value === "object" &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));

// The capability body from an SDK result, or an explicit fail-closed error. Only a
// body this returns can ever be classified as an old host.
const SDK_RESULT_KEYS = ["data", "error", "request", "response"];
const capabilityBody = (reply) => {
  if (!isPlainObject(reply)) throw authorityError("the native capability probe returned an invalid response");
  // An injected plain capability object (not an SDK result) is the body itself.
  if (!SDK_RESULT_KEYS.some((key) => key in reply)) return reply;
  const { response } = reply;
  if (reply.error !== undefined && reply.error !== null) {
    throw authorityError(`the native capability probe failed: HTTP ${response?.status ?? "unknown"}`);
  }
  // Never read a wrapper without data as the body itself.
  if (!("data" in reply)) throw authorityError("the native capability probe returned no data");
  // No HTTP response: an injected result. String data is not parsed here, so it
  // stays malformed rather than being accepted as a capability.
  if (response === undefined) return reply.data;
  if (response?.status !== 200 || response.ok === false) {
    throw authorityError(`the native capability probe failed: HTTP ${response?.status ?? "unknown"}`);
  }
  if (response.headers?.get?.("content-length") === "0" || typeof reply.data !== "string" || reply.data.trim() === "") {
    throw authorityError("the native capability probe returned an empty or non-text body");
  }
  try {
    return JSON.parse(reply.data);
  } catch (error) {
    throw new Error("[opencode-guard] permission authority unavailable: the native capability probe returned invalid JSON", { cause: error });
  }
};

const requireCapabilities = async ({ v2, directory }) => {
  if (typeof v2?.experimental?.capabilities?.get !== "function") {
    throw unsupportedError("the host provides no native permission-authority capability probe");
  }
  // parseAs "text" is an existing per-call SDK option. Its JSON path turns an
  // empty 200 body into `{}`, indistinguishable from a real `{}` capability body;
  // the raw text keeps an empty body detectable (capabilityBody).
  const capabilities = capabilityBody(await v2.experimental.capabilities.get({ directory }, { parseAs: "text" }));
  if (!isPlainObject(capabilities)) throw authorityError("the native capability probe returned an invalid response");
  // Version 2 is the 2026-10-14 escalation contract (deny->exact ask for any visible tool, root
  // override). A version-1 host has the older eligibility semantics: treat it as an old host so
  // the guard keeps its fail-closed throws instead of proposing what v1 would misread.
  if (capabilities.permissionAuthority === undefined || capabilities.permissionAuthority === 1) {
    throw unsupportedError("the host does not advertise permissionAuthority: 2");
  }
  if (capabilities.permissionAuthority !== 2) throw authorityError("the host advertises an unknown permissionAuthority");
  if (capabilities?.backgroundSubagents !== true) {
    const absent = capabilities.backgroundSubagents === undefined || capabilities.backgroundSubagents === false;
    throw (absent ? unsupportedError : authorityError)("the host does not advertise backgroundSubagents support");
  }
  // Session incarnations are optional: without them every path below behaves as on
  // a host that predates them (deleted roots retained, no incarnation compare).
  // beforeAsk: a tool.execute.before hook may set output.ask and native asks for that exact call,
  // so a process tool that never asks natively (bg_run, pty_spawn) can route its refusals too.
  return { incarnations: capabilities.sessionIncarnation === 1, beforeAsk: capabilities.beforeAsk === 1 };
};

// The core is the authority. This broker only checks the currently authoritative
// pending object and current session lineage before asking core to settle it.
export const createAuthorityBroker = ({ v2, directory, tree, rootMode, lifecycle, onError = () => {}, onDebug = () => {} }) => {
  // Only failed human-escalation intents live here, never grants or promotions.
  // Three owned automatic retries break foreground-root/child wait deadlocks;
  // after that native events may retry, but no timer polls indefinitely.
  const escalations = new Map();
  const retryDelays = [100, 500, 2000];
  const rootFor = async (sessionID) => {
    const ancestry = await tree.ancestry(sessionID);
    if (!Array.isArray(ancestry) || ancestry.length === 0) {
      throw authorityError("the current session ancestry could not be verified");
    }
    return ancestry.at(-1);
  };

  const verifyAttendedRoot = async (sessionID) => {
    const root = await rootFor(sessionID);
    if (root !== sessionID) throw authorityError("guard tools are available only to an attended root session");
    return root;
  };

  const reply = async (requestID, decision, message) =>
    v2.permission.reply({ requestID, directory, reply: decision, message });

  // The capability is read on every authority path; once a host advertises session
  // incarnations the lifecycle stops retaining deleted roots.
  const capabilities = async () => {
    const found = await requireCapabilities({ v2, directory });
    if (found.incarnations) lifecycle?.enableIncarnations?.();
    return found;
  };

  // The authoritative root read: null when the root is missing (404) or is not a
  // root, else its incarnation. With the capability a root without a string
  // incarnation is a malformed response and fails closed.
  // The result carries `epoch`, the lifecycle read epoch captured BEFORE the read, so
  // a bind from a read that a newer adoption overtook replaces nothing (lib/lifecycle.js).
  const readRoot = async (sessionID, { incarnations }) => {
    if (typeof v2?.v2?.session?.get !== "function") {
      throw authorityError("the host provides no native root-session API");
    }
    const epoch = lifecycle?.readEpoch?.(sessionID);
    try {
      // Keep HTTP status: this SDK's throwOnError throws the response BODY, which
      // does not carry status. A transport error must never masquerade as 404.
      const response = await v2.v2.session.get({ sessionID }, { throwOnError: false });
      if (response?.response?.status === 404) return null;
      if (response?.error || response?.response?.ok === false) {
        throw authorityError(`root-session lookup failed: HTTP ${response?.response?.status ?? "unknown"}`);
      }
      const root = dataOf(response);
      if (!root || root.id !== sessionID) throw authorityError("the native root-session API returned an invalid response");
      if (typeof root.parentID === "string" && root.parentID !== "") return null;
      if (!incarnations) return { sessionID, incarnationID: undefined, epoch };
      if (typeof root.incarnationID !== "string" || root.incarnationID === "") {
        throw authorityError("the native root-session API returned no incarnationID although the host advertises sessionIncarnation: 1");
      }
      return { sessionID, incarnationID: root.incarnationID, epoch };
    } catch (error) {
      if (error?.status === 404 || error?.response?.status === 404) return null;
      throw error;
    }
  };

  // Is the root still the resource a deferred effect was bound to? A missing root
  // or a different incarnation (same-ID recreate) makes the work stale. Without the
  // capability only existence is checked, exactly as before.
  const stillBound = async (binding, found) => {
    const current = await readRoot(binding.sessionID, found);
    if (!current) return false;
    if (!found.incarnations) return true;
    if (current.incarnationID === binding.incarnationID) return true;
    onError(authorityError(`stale work for ${binding.sessionID} dropped: bound to incarnation ` +
      `${binding.incarnationID ?? "(none)"}, the root is now ${current.incarnationID}`));
    return false;
  };
  const sameIncarnation = (binding, current, found) => !found.incarnations ||
    (current !== null && current.incarnationID === binding.incarnationID);

  const ownedParent = async (request, root) => {
    if (request?.approval?.kind !== "parent") return false;
    if (request.sessionID === root) return false;
    if (request.approval.sessionID !== root) return false;
    return await rootFor(request.sessionID) === root;
  };

  const dropEscalation = (record) => {
    if (escalations.get(record.id) !== record) return;
    clearTimeout(record.timer);
    record.timer = undefined;
    escalations.delete(record.id);
  };
  const liveEscalation = (record) => escalations.get(record.id) === record &&
    (!lifecycle || lifecycle.admit(record.root, record.token));
  const scheduleEscalation = (record) => {
    if (!liveEscalation(record)) { dropEscalation(record); return; }
    if (record.timer || record.automaticAttempts >= retryDelays.length) return;
    record.timer = setTimeout(() => {
      record.timer = undefined;
      record.automaticAttempts += 1;
      void retryEscalation(record);
    }, retryDelays[record.automaticAttempts]);
    record.timer.unref();
  };
  const retryEscalation = (record) => {
    if (record.running) return record.running;
    record.running = (async () => {
      try {
        if (!liveEscalation(record)) { dropEscalation(record); return; }
        const found = await capabilities();
        if (!liveEscalation(record)) { dropEscalation(record); return; }
        const request = (await pendingList({ v2, directory })).find((entry) => entry?.id === record.id);
        if (!liveEscalation(record)) { dropEscalation(record); return; }
        if (!await ownedParent(request, record.root)) { dropEscalation(record); return; }
        if (!liveEscalation(record)) { dropEscalation(record); return; }
        // The record's incarnation was captured when the escalation was created and
        // is never replaced by a later read.
        if (!await stillBound({ sessionID: record.root, incarnationID: record.incarnationID }, found)) {
          dropEscalation(record);
          return;
        }
        if (!liveEscalation(record)) { dropEscalation(record); return; }
        // Re-read mode even though an already-begun human escalation is never
        // upgraded into a god grant/promotion when the mode changes back.
        await rootMode(record.root);
        if (!liveEscalation(record)) { dropEscalation(record); return; }
        await reply(record.id, "escalate", record.message);
        dropEscalation(record);
      } catch (error) {
        onError(authorityError(`escalation ${record.id} failed: ${error?.message ?? error}`));
        if (liveEscalation(record) && record.automaticAttempts === retryDelays.length && !record.exhausted) {
          record.exhausted = true;
          onError(authorityError(`escalation ${record.id} exhausted ${retryDelays.length} automatic retries; retained for native-event retry`));
        }
      } finally {
        record.running = undefined;
        scheduleEscalation(record);
      }
    })();
    return record.running;
  };
  const escalate = (request, root, token, message, incarnationID) => {
    let record = escalations.get(request.id);
    if (!record) {
      record = { id: request.id, requester: request.sessionID, root, incarnationID, token, message, automaticAttempts: 0 };
      escalations.set(request.id, record);
    }
    return retryEscalation(record);
  };
  // Does a session.aborted/deleted naming the record's root or requester end it?
  // A record bound to a root incarnation (the host advertises sessionIncarnation: 1)
  // is dropped only by an event carrying that same root incarnation, so a delayed
  // event for an older root of the same ID cannot drop a replacement's escalation.
  // Every other case keeps the record, which is safe because no retry acts before
  // revalidating (retryEscalation): liveEscalation re-checks the lifecycle
  // admission, ownedParent re-reads the native pending list, and stillBound compares
  // the record's bound root incarnation with a fresh authoritative read. A record
  // without a binding (old host) is dropped by ID exactly as before.
  const endsEscalation = (event, sessionID, record) => {
    if (record.incarnationID === undefined) return true;
    const incarnationID = eventIncarnation(event);
    if (sessionID === record.root) {
      if (incarnationID === record.incarnationID) return true;
      if (incarnationID === undefined) {
        onError(authorityError(`${event.type} for root ${sessionID} carries no incarnationID although the host advertises ` +
          `sessionIncarnation: 1; escalation ${record.id} kept for revalidation`));
      }
      return false;
    }
    // The pending request names its requester by ID only, so there is no requester
    // incarnation to compare against. Every child abort lands here and the retry
    // revalidates anyway, so this is a debug note rather than an error.
    onDebug(authorityError(`${event.type} for requester ${sessionID} cannot be compared: escalation ${record.id} binds ` +
      "no requester incarnation; kept for revalidation"));
    return false;
  };
  const assertAdmission = (sessionID, token) => {
    if (lifecycle && !lifecycle.admit(sessionID, token)) {
      throw authorityError("root admission is closed; this tool call cannot use a resumed root's new admission");
    }
  };
  // Real root activity binds its lifecycle record to the root incarnation it just
  // read authoritatively, so later abort/delete events are compared against it
  // (lib/lifecycle.js). A read showing a replacement root closes the old admission,
  // which this call shares, so the admission check after binding then fails.
  //
  // bind returns "stale" when this read started before another read adopted the record
  // (lib/lifecycle.js, read epochs): the read disagrees with the record's incarnation,
  // so the calling work is not bound to anything and fails closed for this call.
  const bindRoot = (root, token, binding) => (lifecycle && binding?.incarnationID !== undefined)
    ? lifecycle.bind(root, token, binding.incarnationID, binding.epoch)
    : true;
  const staleRead = (root, what) => onDebug(authorityError(`${what} for ${root} dropped: its root read was overtaken by ` +
    "a newer adoption of the record (stale); failing closed for this call"));
  const admitBound = (root, token, binding, what) => {
    if (bindRoot(root, token, binding) === "stale") {
      staleRead(root, what);
      return false;
    }
    return !lifecycle || lifecycle.admit(root, token);
  };
  // guard_pending / guard_decide: a stale bind refuses the tool call.
  const assertBound = (root, token, binding) => {
    if (bindRoot(root, token, binding) === "stale") {
      staleRead(root, "guard tool call");
      throw authorityError("the attended root read is stale: a newer read already bound this root; retry the call");
    }
  };
  // A guard tool call's tracked admission may be closed only because it belonged to
  // an older incarnation of this root ID (e.g. inc1 was aborted, then replaced). One
  // authoritative read and bind installs the replacement's open admission; anything
  // still closed after that (a genuine abort of the current root) is refused.
  const healAdmission = async (sessionID, token) => {
    if (!lifecycle || lifecycle.admit(sessionID, token)) return token;
    const found = await capabilities();
    if (found.incarnations) {
      const current = await readRoot(sessionID, found);
      const bound = current ? lifecycle.bind(sessionID, token, current.incarnationID, current.epoch) : true;
      if (bound === false) token = lifecycle.token(sessionID);
      // A stale read heals nothing: the admission stays closed and is refused below.
      else if (bound === "stale") staleRead(sessionID, "admission heal");
    }
    assertAdmission(sessionID, token);
    return token;
  };

  return {
    async available() {
      await capabilities();
    },

    onEvent(event) {
      const sessionID = event?.properties?.sessionID ?? event?.properties?.info?.id;
      const ended = event?.type === "session.aborted" || event?.type === "session.deleted";
      for (const record of escalations.values()) {
        if (event?.type === "permission.replied" && event.properties?.requestID === record.id) {
          dropEscalation(record);
          continue;
        }
        if (ended && (sessionID === record.root || sessionID === record.requester)) {
          if (endsEscalation(event, sessionID, record)) dropEscalation(record);
          continue;
        }
        if ((event?.type === "session.idle" || event?.type === "session.status") && sessionID === record.root ||
            event?.type === "permission.asked" && event.properties?.id === record.id) {
          void retryEscalation(record);
        }
      }
    },

    dispose() {
      for (const record of escalations.values()) dropEscalation(record);
    },

    async resume({ sessionID, parts }) {
      // Do not impose the new bridge on untouched sessions on an old host.
      // On a host with session incarnations a deleted root's record is already
      // gone, so a same-ID recreate is untouched here and never reopens it.
      // Without a record the only state is an abort tombstone, which a real user
      // turn lifts with no read (lib/lifecycle.js).
      if (!lifecycle?.has(sessionID)) return lifecycle?.resume(sessionID, parts) ?? false;
      let token = lifecycle.token(sessionID);
      // Resume never probes capabilities, so an old host keeps exactly its previous
      // chat.message cost and behavior (an existence read). Once an earlier
      // authority path has learned the capability, the read includes the root
      // incarnation.
      const incarnations = lifecycle.incarnationsEnabled?.() === true;
      const current = await readRoot(sessionID, { incarnations });
      if (!current) return false;
      // A record bound to another incarnation belongs to a root that was replaced
      // under this ID (its deletion event not yet seen). bind closes that record for
      // good and opens a fresh one for the current incarnation, so nothing of the
      // old root resumes, and lifecycle.resume below is a no-op against the old
      // token. Refusing instead would throw out of chat.message and block the
      // replacement root's own first user message; a fresh record withholds nothing
      // that belongs to the replacement and reopens nothing that belonged to the old.
      //
      // bind can also decide a deferred identity abort (lib/lifecycle.js header): adopting
      // the aborted incarnation closes the record and swaps its token. That closure is
      // exactly what this real user turn lifts, so resume must use the post-bind token.
      // The token is re-read only when nothing swapped it during the read above (bind is
      // synchronous, so any swap after the check is bind's own). Precisely: only a
      // closure that SWAPS the token while the read is in flight (an applied abort, or a
      // bind by another read) is protected -- it is newer than this message and is not
      // lifted by it. A deferred abort marker that lands during the read swaps nothing;
      // when this resume's own bind adopts it, this message lifts it. That narrow
      // reorder-only gap is accepted (lib/lifecycle.js header).
      //
      // A stale bind (another read adopted the record after this read began) means this
      // read disagrees with the record: nothing is lifted, and resume returns false
      // rather than throwing, so the user's message is not blocked.
      if (incarnations && lifecycle.token(sessionID) === token) {
        if (lifecycle.bind(sessionID, token, current.incarnationID, current.epoch) === "stale") {
          staleRead(sessionID, "resume");
          return false;
        }
        token = lifecycle.token(sessionID);
      }
      const resumed = lifecycle.resume(sessionID, parts, token);
      if (!lifecycle.admit(sessionID)) throw authorityError("root admission is closed; only real root user content can resume an aborted session");
      return resumed;
    },

    // The policy inputs for one request: its real root, that root's CURRENT mode, and whether the
    // requester is the root itself. Probes the capability first so an old host is classified
    // (AUTHORITY_UNSUPPORTED) before any ancestry read.
    async rootContext(sessionID) {
      const found = await capabilities();
      const rootSessionID = await rootFor(sessionID);
      const mode = await rootMode(rootSessionID);
      return { rootSessionID, rootMode: mode, isRoot: sessionID === rootSessionID, beforeAsk: found.beforeAsk };
    },

    // Deferred-request binding (2026-10-14 escalation policy, lead ruling 7). A guard floor
    // deferred from tool.execute.before to the permission hook, and an operator ask the guard
    // will settle itself, are deferred effects of the ROOT: they must act only for the root
    // incarnation and admission that existed when the request began. Capture runs BEFORE any
    // asynchronous floor work. It is a fresh request, so a replacement root that this read
    // reveals is adopted here (bind false -> the replacement's open admission), exactly once.
    async captureRequestBinding(rootSessionID) {
      let token = await healAdmission(rootSessionID, lifecycle?.track(rootSessionID));
      const found = await capabilities();
      assertAdmission(rootSessionID, token);
      const current = await readRoot(rootSessionID, found);
      if (!current) throw authorityError("the root session does not exist");
      const bound = bindRoot(rootSessionID, token, current);
      if (bound === "stale") {
        staleRead(rootSessionID, "request binding");
        throw authorityError("the root read is stale: a newer read already bound this root; retry the call");
      }
      if (bound === false) token = lifecycle.token(rootSessionID);
      assertAdmission(rootSessionID, token);
      return { sessionID: rootSessionID, incarnationID: current.incarnationID, token };
    },

    // The deferred request still belongs to its root: the same admission (no abort or delete
    // since capture) and, with session incarnations, the same incarnation. Never binds, so an
    // old request can never adopt a replacement root. Without incarnations only admission and
    // existence are checked, as everywhere else on such a host.
    async assertRequestBinding(binding) {
      if (!binding || typeof binding.sessionID !== "string") throw authorityError("the deferred request carries no root binding");
      const found = await capabilities();
      assertAdmission(binding.sessionID, binding.token);
      if (!await stillBound(binding, found)) {
        throw authorityError(`the root ${binding.sessionID} is gone or was replaced since this request began; retry the call`);
      }
      assertAdmission(binding.sessionID, binding.token);
    },

    // Returns the { sessionID, incarnationID, token } binding of a promoted root, which
    // the approval wake carries; undefined when nothing was promoted. `token` is the
    // admission the wake must use: the caller's, or the replacement root's fresh one
    // when this observation re-admitted (below).
    async observe(request, token) {
      if (request?.approval?.kind !== "parent") return;
      const expectedRoot = request.approval.sessionID;
      const notOwned = () => authorityError("the native pending request is not an owned child parent approval and cannot self-approve");
      if (!expectedRoot) throw notOwned();
      // The observation is real root activity: a child of this root is asking it.
      token ??= lifecycle?.track(expectedRoot);
      const found = await capabilities();
      // The binding for every effect this observation creates (escalation retry,
      // promotion, approval wake) is captured here, once -- BEFORE the pending list,
      // so a request listed under inc1 can never be bound to a replacement read that
      // landed between the list and the read. A replacement after this read is
      // caught by stillBound before any promotion.
      const binding = await readRoot(expectedRoot, found);
      const owned = async () => {
        const entry = (await pendingList({ v2, directory })).find((candidate) => candidate?.id === request.id);
        if (!entry) return { stale: true };
        const owner = entry?.approval?.sessionID;
        return { entry, owned: !!owner && owner === expectedRoot && await ownedParent(entry, owner) };
      };
      const listed = await owned();
      if (listed.stale) throw authorityError("the native pending request is stale or does not exist");
      if (!listed.owned) throw notOwned();
      let current = listed.entry;
      const root = expectedRoot;
      if (!binding) return;
      const bound = bindRoot(root, token, binding);
      if (bound === "stale") {
        staleRead(root, "observation");
        return;
      }
      const replaced = bound === false;
      if (lifecycle && !lifecycle.admit(root, token)) {
        // The caller's admission belonged to an older incarnation of this root ID and
        // this read just replaced it with the current root's open admission. Nothing
        // else would re-offer this request, so proceed ONCE under the fresh admission,
        // after re-proving the request and the root binding.
        if (!replaced) return;
        token = lifecycle.token(root);
        const again = await owned();
        if (!again.owned) return;
        if (!await stillBound(binding, found) || !admitBound(root, token, binding, "observation")) return;
        current = again.entry;
      }
      const mode = await rootMode(root);
      if (lifecycle && !lifecycle.admit(root, token)) return;
      if (mode !== "god" || escalations.has(current.id)) {
        await escalate(current, root, token, undefined, binding.incarnationID);
        return;
      }
      if (typeof v2?.experimental?.session?.background !== "function") {
        throw authorityError("the host provides no native background-subagent API");
      }
      if (found.incarnations) {
        // Before the promotion: the root must still be the bound incarnation.
        if (!await stillBound(binding, found)) return;
        if (lifecycle && !lifecycle.admit(root, token)) return;
      }
      await v2.experimental.session.background({ sessionID: root, directory });
      if (lifecycle && !lifecycle.admit(root, token)) return;
      return { sessionID: binding.sessionID, incarnationID: binding.incarnationID, token };
    },

    // `incarnationID` is the binding captured when the wake was created. On a host
    // with session incarnations an unbound or mismatched wake is stale.
    async current({ sessionID, permissionID, incarnationID }) {
      const token = lifecycle?.track(sessionID);
      const found = await capabilities();
      if (found.incarnations && typeof incarnationID !== "string") {
        onError(authorityError(`stale wake for ${sessionID} dropped: it carries no incarnation binding`));
        return false;
      }
      const request = (await pendingList({ v2, directory })).find((entry) => entry?.id === permissionID);
      if (!await ownedParent(request, sessionID)) return false;
      // The epoch is captured before stillBound's read, which is what proves the binding.
      const binding = { sessionID, incarnationID: found.incarnations ? incarnationID : undefined, epoch: lifecycle?.readEpoch?.(sessionID) };
      // stillBound proved the root is still the wake's incarnation, so it binds.
      if (!await stillBound(binding, found) || !admitBound(sessionID, token, binding, "approval wake")) return false;
      const mode = await rootMode(sessionID);
      if (lifecycle && !lifecycle.admit(sessionID, token)) return false;
      if (mode !== "god" || escalations.has(request.id)) {
        await escalate(request, sessionID, token, undefined, binding.incarnationID);
        return false;
      }
      return true;
    },

    async pending({ sessionID }) {
      // A guard tool call is real activity by the calling session.
      const token = await healAdmission(sessionID, lifecycle?.track(sessionID));
      const found = await capabilities();
      assertAdmission(sessionID, token);
      const root = await verifyAttendedRoot(sessionID);
      assertAdmission(root, token);
      const binding = await readRoot(root, found);
      assertBound(root, token, binding);
      assertAdmission(root, token);
      if (!binding) throw authorityError("the attended root does not exist");
      const mode = await rootMode(root);
      assertAdmission(root, token);
      if (mode !== "god") throw authorityError("the root is no longer in god mode");
      const pending = await pendingList({ v2, directory });
      assertAdmission(root, token);
      const owned = [];
      for (const request of pending) {
        if (request?.approval?.kind !== "parent") continue;
        if (request?.approval?.sessionID !== root) continue;
        if (request.sessionID === root) continue;
        const requestRoot = await rootFor(request.sessionID);
        assertAdmission(root, token);
        if (requestRoot !== root) continue;
        owned.push(request);
      }
      const latest = await readRoot(root, found);
      assertAdmission(root, token);
      if (!latest) throw authorityError("the attended root does not exist");
      if (!sameIncarnation(binding, latest, found)) throw authorityError("the attended root incarnation changed during this call");
      const latestMode = await rootMode(root);
      assertAdmission(root, token);
      if (latestMode !== "god") throw authorityError("the root is no longer in god mode");
      return owned;
    },

    async decide({ sessionID, permissionID, decision, message }) {
      // Capture before the first await, not after ancestry resolution. An abort
      // followed by a real user continuation invalidates THIS call permanently.
      const token = await healAdmission(sessionID, lifecycle?.track(sessionID));
      const found = await capabilities();
      assertAdmission(sessionID, token);
      if (decision !== "once" && decision !== "reject") {
        throw authorityError("decision must be once or reject");
      }
      const root = await verifyAttendedRoot(sessionID);
      assertAdmission(root, token);
      const binding = await readRoot(root, found);
      assertBound(root, token, binding);
      assertAdmission(root, token);
      if (!binding) throw authorityError("the attended root does not exist");
      // Read before listing and again immediately before reply: a mode may change
      // while the authoritative pending list is fetched.
      await rootMode(root);
      assertAdmission(root, token);
      const pending = await pendingList({ v2, directory });
      assertAdmission(root, token);
      const request = pending.find((entry) => entry?.id === permissionID);
      if (!request) throw authorityError("the native pending request is stale or does not exist");
      if (request?.approval?.kind === "human-only") {
        throw authorityError("human-only requests can be answered only by the private TUI");
      }
      if (request?.approval?.kind !== "parent") {
        throw authorityError("only parent approval requests can be decided by a root model");
      }
      if (request.sessionID === root) throw authorityError("the pending requester is the root and cannot self-approve");
      if (request.approval.sessionID !== root) {
        throw authorityError("the native pending request is not owned by this root");
      }
      const requestRoot = await rootFor(request.sessionID);
      assertAdmission(root, token);
      if (requestRoot !== root) {
        throw authorityError("the native pending request is not owned by this root");
      }
      const latest = await readRoot(root, found);
      assertAdmission(root, token);
      if (!latest) throw authorityError("the attended root does not exist");
      if (!sameIncarnation(binding, latest, found)) throw authorityError("the attended root incarnation changed during this call");
      // The root mode is deliberately read again after the native list fetch. A
      // mode change never approves a request from an old god snapshot.
      const mode = await rootMode(root);
      assertAdmission(root, token);
      if (mode !== "god" || escalations.has(request.id)) {
        await escalate(request, root, token, message, binding.incarnationID);
        assertAdmission(root, token);
        throw authorityError(`${mode !== "god" ? "the root is no longer in god mode" : "the request already has a human escalation intent"}; ` +
          `operator escalation requested${escalations.has(request.id) ? "; queued for retry" : ""}`);
      }
      await reply(request.id, decision, message);
      return decision === "once" ? "approved once" : "rejected";
    },
  };
};
