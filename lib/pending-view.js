// What guard_pending shows the root model for each pending parent approval. Everything the
// approver needs to see the exact action is kept verbatim (policy ruling 8): the request id, the
// child, the permission, its patterns, the approval reason and every metadata field -- command,
// workdir, file paths, the full diff. Only repeats and plumbing go: `files[].patch` repeats the
// diff (a file's patch is kept when there is no diff), and the internal `tool` ids and the
// approval's own kind/session add nothing guard_decide needs. Measured 2026-10-20: 391 outputs,
// avg 3.2k and up to 36.6k chars, ~20% of it the duplicated patches, all re-read every request.
export const pendingView = (request) => {
  if (!request || typeof request !== "object") return request;
  const metadata = request.metadata && typeof request.metadata === "object" ? { ...request.metadata } : request.metadata;
  if (metadata && Array.isArray(metadata.files)) {
    const hasDiff = typeof metadata.diff === "string" && metadata.diff.length > 0;
    metadata.files = metadata.files.map((file) => {
      if (!file || typeof file !== "object" || !hasDiff) return file;
      const { patch: _patch, ...rest } = file;
      return rest;
    });
  }
  return {
    id: request.id,
    sessionID: request.sessionID,
    permission: request.permission,
    patterns: request.patterns,
    ...(request.approval?.reason !== undefined ? { reason: request.approval.reason } : {}),
    ...(metadata !== undefined ? { metadata } : {}),
  };
};
