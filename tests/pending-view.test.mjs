import test from "node:test";
import assert from "node:assert/strict";
import { pendingView } from "../lib/pending-view.js";

const edit = {
  id: "per_1", sessionID: "ses_child", permission: "edit", patterns: ["go/x.go"], always: [],
  tool: { messageID: "msg_1", callID: "call_1" },
  approval: { kind: "parent", sessionID: "ses_root", reason: "native ask: edit" },
  metadata: { filepath: "/w/go/x.go", diff: "--- a\n+++ b\n-old\n+new\n",
    files: [{ filePath: "/w/go/x.go", relativePath: "go/x.go", type: "update", patch: "--- a\n+++ b\n-old\n+new\n", additions: 1, deletions: 1 }] },
};

test("guard_pending view keeps the exact action and drops only repeats and plumbing", () => {
  const view = pendingView(edit);
  assert.deepEqual(view, {
    id: "per_1", sessionID: "ses_child", permission: "edit", patterns: ["go/x.go"], reason: "native ask: edit",
    metadata: { filepath: "/w/go/x.go", diff: "--- a\n+++ b\n-old\n+new\n",
      files: [{ filePath: "/w/go/x.go", relativePath: "go/x.go", type: "update", additions: 1, deletions: 1 }] },
  });
  assert.ok(JSON.stringify(view).length < JSON.stringify(edit).length);
  assert.equal(edit.metadata.files[0].patch.length > 0, true, "the native request is never mutated");
});

test("a file patch stays when there is no diff, and a bash command is shown whole", () => {
  const noDiff = pendingView({ ...edit, metadata: { files: edit.metadata.files } });
  assert.equal(noDiff.metadata.files[0].patch, "--- a\n+++ b\n-old\n+new\n");
  const command = "cd /w && make build && rm -rf ./out " + "x".repeat(5000);
  const bash = pendingView({ id: "per_2", sessionID: "ses_child", permission: "bash", patterns: [command],
    approval: { kind: "parent", sessionID: "ses_root", reason: "native ask: bash" }, metadata: { command, workdir: "/w" } });
  assert.equal(bash.metadata.command, command);
  assert.equal(bash.patterns[0], command);
});
