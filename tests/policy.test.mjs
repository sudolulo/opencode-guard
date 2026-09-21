// Tests for the pure decision logic in lib/policy.js.
//
// Run:  node --test tests/*.test.mjs
//
// The cases marked "from the log" are modelled on command lines from a real
// decision log, where the classifier had denied 63 of 96 judged commands -- nearly
// all of them read-only inspection run over ssh. Those are the regression: each one
// must now be settled statically, with no model call.
//
// policy.js reads its config files once, at import, so the suite points HOME at a
// throwaway directory with known fixtures first. Nothing on the machine running the
// tests can change a verdict.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const home = mkdtempSync(join(tmpdir(), "guard-policy-"));
process.env.HOME = home;
delete process.env.OPENCODE_GUARD_CONFIG;
mkdirSync(join(home, ".config/opencode"), { recursive: true });
mkdirSync(join(home, ".config/opencode-guard"), { recursive: true });
// opencode's own allow globs are settled policy the static path honours.
writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify({
  permission: { bash: { "*": "ask", "git branch*": "allow" } },
}));
// A site config exercising every key policy.js reads.
writeFileSync(join(home, ".config/opencode-guard/config.json"), JSON.stringify({
  extraCredentialPatterns: [{ pattern: "\\.config/my-secrets/", root: ".config/my-secrets" }],
  extraPromptableCredentialPatterns: ["\\bvault\\s+kv\\s+get\\b"],
  credentialAdvice: "Ask the operator; secrets are injected by the deploy wrapper.",
  trustedSshHosts: ["nas", "router", "*.example.com"],
}));

const P = await import(
  new URL("../lib/policy.js", import.meta.url).href
);

// The site-pattern seam, called directly. Built-ins stay tested below (.ssh,
// .aws, ...); this proves an extra pattern participates in every tier exactly like
// a built-in.
P.registerCredentialPatterns([{ pattern: "\\.config/app-tokens/", root: ".config/app-tokens" }]);
process.on("exit", () => { try { rmSync(home, { recursive: true, force: true }); } catch {} });

const reads = (cmd) => P.commandIsRead(cmd);

test("lexing honours quotes when splitting segments", () => {
  assert.equal(P.lex('ssh nas "a && b"').length, 1, "operators inside quotes are not separators");
  assert.equal(P.lex("a && b").length, 2);
  assert.equal(P.lex("a | b | c").length, 3);
  assert.equal(P.lex("a; b").length, 2);
  assert.deepEqual(P.lex('ssh nas "ls -la /x"')[0].tokens, ["ssh", "nas", "ls -la /x"]);
});

test("lexing marks only redirects that can actually write", () => {
  assert.equal(P.lex("ls 2>&1")[0].meta, false);
  assert.equal(P.lex("ls 2>/dev/null")[0].meta, false);
  assert.equal(P.lex("ls >/dev/null 2>&1")[0].meta, false);
  assert.equal(P.lex("echo hi > /etc/motd")[0].meta, true);
  assert.equal(P.lex("cat a >> b")[0].meta, true);
  assert.equal(P.lex("echo $(whoami)")[0].meta, true);
  assert.equal(P.lex('echo "$(whoami)"')[0].meta, true);
  assert.equal(P.lex("echo `whoami`")[0].meta, true);
});

test("the command word is found past env assignments and wrappers", () => {
  const at = (cmd) => {
    const seg = P.lex(cmd)[0];
    return seg.tokens[P.commandIndex(seg.tokens)];
  };
  assert.equal(at("ls -la"), "ls");
  assert.equal(at("snip ls -la"), "ls");
  assert.equal(at("timeout 30 ls"), "ls");
  assert.equal(at("env FOO=1 ls"), "ls");
  assert.equal(at("FOO=1 BAR=2 ls"), "ls");
  assert.equal(at("/usr/bin/ls -la"), "/usr/bin/ls");
  // sudo is deliberately not a wrapper: it is the thing worth looking at.
  assert.equal(at("sudo ls"), "sudo");
});

test("ssh payloads are judged by the same rules as local commands", () => {
  const payload = (cmd) => {
    const seg = P.lex(cmd)[0];
    return P.sshPayload(seg.tokens, P.commandIndex(seg.tokens));
  };
  assert.equal(payload('ssh nas "ls -la /srv"'), "ls -la /srv");
  assert.equal(payload("ssh -p 2222 deploy@git.example.com ls"), "ls");
  assert.equal(payload("ssh -F /dev/null -p 22 root@router uname -a"), "uname -a");
  assert.equal(payload("ssh nas"), null, "a bare ssh opens an interactive shell");
  assert.equal(payload("ssh -L 8080:localhost:80 host ls"), null, "port forwarding is not a read");
});

test("the ssh destination is reduced to a host name for matching", () => {
  const host = (cmd) => {
    const seg = P.lex(cmd)[0];
    return P.sshTarget(seg.tokens, P.commandIndex(seg.tokens))?.host;
  };
  assert.equal(host("ssh nas ls"), "nas");
  assert.equal(host("ssh deploy@Git.Example.com ls"), "git.example.com", "user@ is dropped and case folded");
  assert.equal(host("ssh -l deploy -p 2222 nas ls"), "nas", "options with arguments are skipped");
  assert.equal(host("ssh ssh://root@nas:2222 ls"), "nas", "the URL form drops its port");
});

test("only a trusted host's ssh payload is settled statically", () => {
  // trustedSshHosts in the fixture config: nas, router, *.example.com
  assert.equal(reads('ssh nas "ls -la /srv"'), true);
  assert.equal(reads("ssh deploy@build.example.com uptime"), true, "a wildcard entry covers the domain");
  assert.equal(reads('ssh gpu-box "ls -la /srv"'), false, "an untrusted host goes to the classifier");
  assert.equal(reads("ssh deploy@example.com.evil.test uptime"), false, "the pattern is anchored");
  assert.equal(P.sshHostTrusted("nas"), true);
  assert.equal(P.sshHostTrusted(""), false);
  assert.equal(P.sshHostTrusted(undefined), false);
});

test("read-only inspection over ssh is settled statically (from the log)", () => {
  for (const cmd of [
    'ssh nas "ls -la /srv/library/index/"',
    'ssh nas "ls -la /srv/library/index/ 2>&1"',
    'ssh nas "ls -la /srv/library/index/ | head -30"',
    'ssh nas "ls -lah /srv/library/index/library.db"',
    'ssh nas "stat /srv/library/index/library.db"',
    `ssh nas "stat -c '%a %U:%G' /srv/library/index/ /srv/library/index/library.db"`,
    'ssh nas "file /srv/library/index/library.db"',
    'ssh nas "cat /srv/apps/library/versions/1.0.0/README.md 2>&1"',
    'ssh nas "id deploy"',
    `ssh nas "test -r /srv/library/index/library.db && echo 'readable' || echo 'not readable'"`,
    `ssh nas "test -w /srv/library/index/ && echo 'dir writable' || echo 'dir not writable'"`,
    `ssh nas "docker ps --filter 'name=library' --format '{{.Names}} {{.Status}} {{.Ports}}'" 2>&1`,
    'ssh nas "docker logs --tail 50 library" 2>&1',
    'ssh nas "journalctl -u library --no-pager -n 50 2>&1 | tail -30"',
    'ssh nas "find /srv/library/index -type f"',
    "curl -s http://localhost:8080/ | head -50",
    "cd ~/projects/app && rg TODO",
    // midclt (TrueNAS) reads: redaction scrubs the secret values these can print,
    // so the read itself is settled without a model call.
    `ssh nas "midclt call app.query '[[\\"name\\", \\"=\\", \\"library\\"]]'"`,
    'ssh nas "midclt call app.config meilisearch"',
    'ssh nas "midclt call system.info"',
    'ssh nas "midclt call core.get_jobs | head -5"',
    // A measured flake set: pure reads that were denied on some classifier passes
    // and allowed on others -- now settled statically.
    'ssh nas "midclt call app.rollback_versions meilisearch"',
    'ssh nas "midclt call core.get_methods"',
    'ssh nas "midclt call app.get_instance meilisearch"',
    'ssh nas "midclt call chart.release.query"',
    // a read piped to jq stays static; python3 would not (arbitrary code)
    `ssh nas "midclt call core.get_methods | jq '.\\"app.update\\"'"`,
    // narrowed-slice reads: settle by rule, not by a model that can flip
    "nvidia-smi",
    "iostat -x 1 1",
    'ssh nas "ip addr show"',
    'ssh nas "ip route get 1.1.1.1"',
    'ssh nas "findmnt /srv"',
    'ssh nas "getent hosts nas"',
    "kubectl get pods -A",
    "kubectl describe deploy web",
    "kubectl logs pod-xyz",
    "helm list -n prod",
    'ssh nas "mount | grep srv"',
    "w",
    "who -b",
  ]) {
    assert.equal(reads(cmd), true, `should be read-only: ${cmd}`);
  }
});

test("rtk direct safe examples settle statically", () => {
  for (const cmd of [
    "rtk --skip-env git status",
    "rtk -vv git diff --stat",
    "rtk --ultra-compact rg autoclass",
    "rtk ls config",
    "rtk wc -l config/app.json",
    "rtk cargo test -- --list",
    "rtk docker ps",
  ]) {
    assert.equal(reads(cmd), true, `should be read-only through rtk: ${cmd}`);
  }
});

test("rtk wrappers stay narrow and nested writes stay unsafe", () => {
  for (const cmd of [
    "rtk",
    "rtk run git status",
    "rtk proxy git status",
    "rtk summary git status",
    "rtk err git status",
    "rtk test git status",
    "rtk git push",
    "rtk cargo install ripgrep",
    "rtk docker system prune -f",
    "rtk kubectl delete pod web",
    "rtk kubectl exec web -- cat /etc/shadow",
    "rtk kubectl get secret db -o yaml",
    "rtk curl -d @body.json http://x/",
    "rtk curl -T upload.bin http://x/",
    "rtk find . -delete",
  ]) {
    assert.equal(reads(cmd), false, `should NOT be read-only through rtk: ${cmd}`);
  }
});

test("rtk read chains stay safe only when every segment is safe", () => {
  assert.equal(reads("rtk ls ~/.ssh/id_ed25519"), false);
  assert.equal(reads("rtk ls config; rm -rf /tmp/x"), false);
  assert.equal(reads("rtk ls config && rm -rf /tmp/x"), false);
  assert.equal(reads("rtk ls config | xargs rm -f"), false);
  assert.equal(reads("rtk ls config && rtk wc -l config/app.json"), true);
});

test("commands that change state are not settled statically", () => {
  for (const cmd of [
    'ssh nas "chmod 775 /srv/library/index/"',
    'ssh nas "chown apps:apps /srv/library/index/library.db"',
    `ssh nas "setfacl -m u:apps:rwx /srv/library/index/"`,
    'ssh nas "sudo docker ps"',
    `ssh nas "python3 -c \\"import os; os.chmod('/x', 0o775)\\""`,
    // midclt READS are static, but its writing methods stay in front of the
    // classifier.
    'ssh nas "midclt call app.start meilisearch"',
    'ssh nas "midclt call system.reboot"',
    'ssh nas "midclt call pool.dataset.delete tank/x"',
    // bare `rollback` reverts an app -- a write -- and must NOT be caught by the
    // rollback_versions read rule; the suffix anchor keeps them apart.
    'ssh nas "midclt call app.rollback meilisearch"',
    'ssh nas "midclt call app.update meilisearch"',
    // a read method piped to python3 -c is NOT static: python is arbitrary code.
    `ssh nas "midclt call core.get_methods | python3 -c 'import sys'"`,
    // narrowed-slice WRITERS and secret-readers must still reach the classifier
    'ssh nas "ip addr add 192.0.2.9/24 dev eth0"',
    'ssh nas "ip link set eth0 down"',
    'ssh nas "mount /dev/sda1 /media/x"',
    'ssh nas "mount -a"',
    "kubectl get secret db-creds -o yaml",
    "kubectl describe secret db-creds",
    "kubectl delete pod web",
    "kubectl exec web -- cat /etc/shadow",
    "kubectl apply -f manifest.yaml",
    "helm install web ./chart",
    'ssh nas "midclt"',
    'ssh nas "install -m 664 /a /b && mv /b /c"',
    "ssh nas",
    "ssh -L 8080:localhost:80 nas ls",
    "rg -l TODO | xargs rm -f",
    "echo hi > /etc/motd",
    "cat secrets.env > /tmp/copy",
    "find . -name '*.tmp' -delete",
    "find . -type f -exec rm {} ;",
    "sed -i s/a/b/ file",
    "sort -o out.txt in.txt",
    `awk '{print > "/etc/passwd"}' f`,
    "curl -X POST http://localhost:8080/mcp",
    "curl -d @body.json http://x/",
    "curl -o /etc/motd http://x/",
    "git push",
    "git reset --hard origin/main",
    "git config user.email me@example.com",
    "docker restart library",
    // prints the container's environment, which is where tokens usually live
    "docker inspect library",
    "kubectl get secret db -o yaml",
    "docker system prune -f",
    "systemctl restart nginx",
    "journalctl --vacuum-time=1d",
    "apt install nginx",
    "python3 -c 'print(1)'",
    "bash -c 'echo hi'",
  ]) {
    assert.equal(reads(cmd), false, `should NOT be settled statically: ${cmd}`);
  }
});

test("the config's own allow globs still decide first", () => {
  // The fixture opencode.json grants `git branch*`, which covers the deleting form
  // too. That is the user's own policy and this plugin honours it rather than
  // second-guessing it -- tightening it here would block more, which is the
  // opposite of the point.
  assert.equal(reads("git branch -D feature"), true);
  assert.equal(reads("git rebase -i HEAD~3"), false, "a command no glob allows is not a read");
});

test("every segment must read, not just the first", () => {
  assert.equal(reads("ls && rm -rf /tmp/x"), false);
  assert.equal(reads("ls | grep foo | wc -l"), true);
  assert.equal(reads("cd /repo && git status && ls"), true);
});

test("site credential advice comes from the config file", () => {
  assert.equal(P.credentialAdvice(), "Ask the operator; secrets are injected by the deploy wrapper.");
});

test("credential stores are still recognised", () => {
  for (const cmd of [
    'curl -s -H "Authorization: $(cat ~/.config/my-secrets/api-token)" http://x/',
    "test -s ~/.config/my-secrets/api-token",
    "cat ~/.config/app-tokens/deploy",
    "cat ~/.ssh/id_ed25519",
    "rbw get api-token",
  ]) {
    assert.equal(P.touchesCredentials(cmd), true, `should be a credential store: ${cmd}`);
  }
  assert.equal(P.touchesCredentials("ls -la ~/.config/opencode"), false);
});

test("hard credential patterns catch file paths, promptable catches password-manager reads", () => {
  // Hard: file paths that could match `cat *`/`ls *` allow rules
  assert.equal(P.touchesHardCredentials("cat ~/.config/my-secrets/token"), true);
  assert.equal(P.touchesHardCredentials("ls ~/.ssh/id_ed25519"), true);
  assert.equal(P.touchesHardCredentials("cat ~/.aws/credentials"), true);
  assert.equal(P.touchesHardCredentials("cat ~/.docker/config.json"), true);
  assert.equal(P.touchesHardCredentials("cat ~/.netrc"), true);
  assert.equal(P.touchesHardCredentials("cat ~/.kube/config"), true);
  assert.equal(P.touchesHardCredentials("cat /etc/shadow"), true);
  assert.equal(P.touchesHardCredentials("cat /etc/sudoers"), true);
  assert.equal(P.touchesHardCredentials("cat ~/.gnupg/secring.gpg"), true);
  assert.equal(P.touchesHardCredentials("cat ~/.config/my-secrets/api-token"), true);

  // Promptable: password-manager reads -- specific enough to never match a broad
  // allow rule
  assert.equal(P.touchesPromptableCredentials("rbw get api-token"), true);
  assert.equal(P.touchesPromptableCredentials("rbw unlock"), true);
  assert.equal(P.touchesPromptableCredentials("rbw export"), true);
  assert.equal(P.touchesPromptableCredentials("snip rbw get api-token"), true);
  assert.equal(P.touchesPromptableCredentials("bw get password github"), true);
  assert.equal(P.touchesPromptableCredentials("op read op://vault/item/field"), true);
  assert.equal(P.touchesPromptableCredentials("op item get github"), true);
  assert.equal(P.touchesPromptableCredentials("pass show email/work"), true);
  assert.equal(P.touchesPromptableCredentials("gopass show -o db"), true);
  assert.equal(P.touchesPromptableCredentials("vault kv get secret/app"), true, "from extraPromptableCredentialPatterns");
  assert.equal(P.touchesPromptableCredentials("git log --stat"), false);

  // Neither: harmless commands
  assert.equal(P.touchesHardCredentials("rbw get api-token"), false);
  assert.equal(P.touchesPromptableCredentials("cat ~/.ssh/id_ed25519"), false);
  assert.equal(P.touchesPromptableCredentials("ls -la"), false);
  assert.equal(P.touchesHardCredentials("git status"), false);

  // touchesCredentials still covers both tiers
  assert.equal(P.touchesCredentials("rbw get api-token"), true);
  assert.equal(P.touchesCredentials("cat ~/.ssh/id_ed25519"), true);
});

test("a credential path is never read-only, whatever the verb", () => {
  // The hook checks credentials before it asks whether a command reads, but this
  // helper has to hold on its own: `cat` reads, and the local model called
  // `cat ~/.ssh/id_ed25519` SAFE under both the old and the new prompt (measured).
  assert.equal(reads("cat ~/.ssh/id_ed25519"), false);
  assert.equal(reads("head -1 ~/.config/my-secrets/push-token"), false);
  assert.equal(reads('ssh nas "cat ~/.ssh/id_rsa"'), false);
  assert.equal(reads("rtk --skip-env git show ~/.ssh/id_ed25519"), false);
});

test("native file tools cannot bypass hard credential paths", () => {
  const directory = join(home, "app");
  const native = (tool, args, cwd = directory) =>
    P.nativeToolTouchesHardCredentials({ tool, args, directory: cwd });

  assert.equal(native("read", { filePath: join(home, ".ssh/id_ed25519") }), true, "absolute read");
  assert.equal(native("read", { filePath: "~/.ssh/id_ed25519" }), true, "tilde read");
  assert.equal(native("read", { filePath: "../.ssh/id_ed25519" }), true, "relative parent read");
  assert.equal(native("glob", { path: "~/.ssh", pattern: "**/*" }), true, "protected base plus broad glob");
  assert.equal(native("glob", { path: "~", pattern: ".ssh/id_*" }), true, "broad base plus protected pattern");
  assert.equal(native("read", { filePath: "src/lib/policy.js" }), false, "ordinary source read");
  assert.equal(native("glob", { path: "config", pattern: "**/*.js" }), false, "ordinary source glob");
  assert.equal(native("grep", { path: "config", pattern: "credential" }), false, "ordinary source grep");

  // Regression: a glob only LISTS paths, so a specific pattern that can never
  // reach a credential file must not be blocked merely because its base ($HOME)
  // sits above ~/.ssh. This one was a false positive -- the base-ancestry check
  // ignored the pattern entirely. The read of ~/.ssh/id_rsa above still blocks.
  assert.equal(
    native("glob", { path: home, pattern: "**/py_modules/push_bridge/cursor.py" }, home),
    false,
    "specific glob under $HOME that cannot enumerate a credential",
  );
  assert.equal(native("glob", { path: "~", pattern: "**/*.py" }, home), false, "recursive source glob under $HOME");
  assert.equal(native("read", { filePath: join(home, ".ssh/id_rsa") }), true, "reading the real key is still blocked");
  // But a broad wildcard that WOULD sweep up the keys still blocks, even from a
  // far ancestor: `glob ~ **/*` enumerates ~/.ssh/id_ed25519 among its results.
  assert.equal(native("glob", { path: "~", pattern: "**/*" }, home), true, "list-everything glob still reaches the keys");
});

test("native credential paths resolve existing symlinks", () => {
  const root = mkdtempSync(join(tmpdir(), "guard-native-"));
  try {
    const protectedDir = join(root, ".ssh");
    mkdirSync(protectedDir);
    symlinkSync(protectedDir, join(root, "source-link"));
    assert.equal(P.nativeToolTouchesHardCredentials({
      tool: "read", args: { filePath: "source-link/id_ed25519" }, directory: root,
    }), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("native credential guard retains only the shell floor's explicit bypasses", () => {
  const input = {
    tool: "read",
    args: { filePath: "~/.ssh/id_ed25519" },
    directory: join(home, "app"),
  };
  assert.equal(P.nativeCredentialGuardBlocks({ ...input, level: "on", mode: "auto", unattended: false }), true);
  assert.equal(P.nativeCredentialGuardBlocks({ ...input, level: "off", mode: "auto", unattended: false }), false);
  assert.equal(P.nativeCredentialGuardBlocks({ ...input, level: "on", mode: "god", unattended: false }), false);
  assert.equal(P.nativeCredentialGuardBlocks({ ...input, level: "on", mode: "god", unattended: true }), true);
});

test("a file-writing tool call cannot flip the guard's own switches", () => {
  const directory = join(home, "app");
  const writes = (tool, args) => P.nativeToolWritesControlFile({ tool, args, directory });
  assert.equal(writes("write", { filePath: join(home, ".config/opencode/autoclass"), content: "off" }), true, "the level");
  assert.equal(writes("write", { filePath: "~/.config/opencode/reveal", content: "9999999999999" }), true, "the reveal window");
  assert.equal(writes("edit", { filePath: "~/.config/opencode/mode", oldString: "manual", newString: "auto" }), true);
  assert.equal(writes("edit", { filePath: "~/.config/opencode/classifier.json" }), true);
  assert.equal(writes("write", { filePath: join(home, ".local/share/opencode/modes/ses_abc"), content: "god" }), true, "a per-session mode");
  assert.equal(writes("write", { filePath: "../.config/opencode/mode" }), true, "relative paths resolve");
  const patch = `*** Begin Patch\n*** Update File: src/app.js\n@@\n-a\n+b\n*** Add File: ${join(home, ".config/opencode/autoclass")}\n+off\n*** End Patch`;
  assert.equal(writes("apply_patch", { patchText: patch }), true, "any file in a patch counts");
  assert.deepEqual(P.writeTargets("apply_patch", { patchText: "*** Update File: a.js\n*** Move to: b.js\n" }), ["a.js", "b.js"]);

  assert.equal(writes("write", { filePath: "src/app.js" }), false, "ordinary project files");
  assert.equal(writes("write", { filePath: "~/.config/opencode/modes.txt" }), false, "a neighbour is not the file");
  assert.equal(writes("read", { filePath: "~/.config/opencode/mode" }), false, "reading a switch is fine");
  assert.equal(writes("apply_patch", { patchText: "*** Update File: src/app.js\n" }), false);
});

test("a shell command that writes one of the switches is refused, a read is not", () => {
  for (const cmd of [
    "echo off > ~/.config/opencode/autoclass",
    "printf god | tee ~/.local/share/opencode/modes/ses_abc",
    "sed -i s/manual/auto/ ~/.config/opencode/mode",
    "cp /tmp/x ~/.config/opencode/classifier.json",
    "rm ~/.config/opencode/autoclass-model",
  ]) {
    assert.equal(P.commandWritesControlFile(cmd), true, `should refuse: ${cmd}`);
  }
  for (const cmd of [
    "cat ~/.config/opencode/mode",
    "ls ~/.local/share/opencode/modes",
    "cat ~/.config/opencode/modes.md",
    "git status",
  ]) {
    assert.equal(P.commandWritesControlFile(cmd), false, `should allow: ${cmd}`);
  }
});

test("level names normalise, and the retired names still land somewhere sane", () => {
  assert.equal(P.normalizeLevel("on"), "on");
  assert.equal(P.normalizeLevel("static"), "static");
  assert.equal(P.normalizeLevel("off"), "off");
  assert.equal(P.normalizeLevel("strict"), "static", "the no-model level's old name");
  assert.equal(P.normalizeLevel("full"), "on", "both old names meant everything on");
  assert.equal(P.normalizeLevel("AUTO\n"), "on");
  assert.equal(P.normalizeLevel(""), "on", "an unset flag file means the default");
  assert.equal(P.normalizeLevel("nonsense"), "on");
});

test("mode names normalise, and anything unrecognised asks", () => {
  assert.equal(P.normalizeMode("manual"), "manual");
  assert.equal(P.normalizeMode("EDITS\n"), "edits");
  assert.equal(P.normalizeMode("auto"), "auto");
  assert.equal(P.normalizeMode("god"), "god");
  assert.equal(P.normalizeMode("GOD\n"), "god");
  assert.equal(P.normalizeMode(""), "manual", "an unset flag file means ask me");
  assert.equal(P.normalizeMode("nonsense"), "manual");
  assert.equal(P.normalizeMode(null), "manual");

  // The GLOBAL flag is only a default sessions inherit, and god is per-session
  // by design -- so a global "god" resolves to auto, the nearest mode that still
  // has the floor. Everything else passes through unchanged.
  assert.equal(P.normalizeGlobalMode("god"), "auto", "global god resolves to auto");
  assert.equal(P.normalizeGlobalMode("GOD\n"), "auto");
  assert.equal(P.normalizeGlobalMode("manual"), "manual");
  assert.equal(P.normalizeGlobalMode("edits"), "edits");
  assert.equal(P.normalizeGlobalMode("auto"), "auto");
  assert.equal(P.normalizeGlobalMode("nonsense"), "manual");
});

test("what each mode waves through without asking", () => {
  const approve = (mode, permission, verdict = null) =>
    P.shouldAutoApprove({ mode, permission, verdict });

  // manual: nothing. The classifier is never even consulted in this mode, which
  // is why a bash verdict cannot change the answer here.
  for (const perm of ["edit", "read", "glob", "grep", "bash", "task", "webfetch"]) {
    assert.equal(approve("manual", perm), false, `manual should ask about ${perm}`);
    assert.equal(approve("manual", perm, "SAFE"), false);
  }

  // edits: files go through, shell does not.
  assert.equal(approve("edits", "edit"), true);
  assert.equal(approve("edits", "read"), true);
  assert.equal(approve("edits", "glob"), true);
  assert.equal(approve("edits", "grep"), true);
  assert.equal(approve("edits", "bash", "SAFE"), false, "shell still asks in edits mode");
  assert.equal(approve("edits", "task"), false);

  // auto: everything, except a shell command the classifier will not vouch for.
  // tool.execute.before has already REFUSED a RISKY command by the time a
  // permission is raised, so what arrives here unapproved is a command it let
  // through to a person on purpose (a password-manager read), and its prompt stands.
  assert.equal(approve("auto", "edit"), true);
  assert.equal(approve("auto", "task"), true);
  assert.equal(approve("auto", "webfetch"), true);
  assert.equal(approve("auto", "bash", "SAFE"), true);
  assert.equal(approve("auto", "bash", "RISKY"), false);
  assert.equal(approve("auto", "bash", null), false, "unjudged is not approved");

  // god: everything, verdict or no verdict. A RISKY verdict changing the answer
  // would make god "auto with extra steps"; the mode's one promise is that it
  // does not judge.
  assert.equal(approve("god", "edit"), true);
  assert.equal(approve("god", "task"), true);
  assert.equal(approve("god", "webfetch"), true);
  assert.equal(approve("god", "bash", null), true, "god approves without a verdict");
  assert.equal(approve("god", "bash", "RISKY"), true, "god approves over a verdict");

  // never, in any mode: a question is the agent asking the person something, and
  // answering it for them is not a permission decision at all.
  for (const mode of ["manual", "edits", "auto", "god"]) {
    assert.equal(approve(mode, "question"), false, `${mode} must not answer a question`);
    assert.equal(approve(mode, undefined), false);
  }
});

test("only auto mode's answer depends on a classifier verdict", () => {
  assert.equal(P.classifierDecides("auto"), true);
  assert.equal(P.classifierDecides(undefined), false);
  for (const mode of ["manual", "edits", "god"]) {
    assert.equal(P.classifierDecides(mode), false, `${mode} must never call the classifier`);
    // The claim behind it: in these modes the verdict cannot change the answer.
    assert.equal(P.shouldAutoApprove({ mode, permission: "bash", verdict: "SAFE" }),
      P.shouldAutoApprove({ mode, permission: "bash", verdict: "RISKY" }));
  }
});

test("a session counts as unattended when nobody can answer a prompt", () => {
  assert.equal(P.unattendedFrom(["opencode"]), false, "plain TUI: opencode will prompt");
  assert.equal(P.unattendedFrom(["opencode", "projects/app"]), false);
  assert.equal(P.unattendedFrom(["opencode", "--auto"]), true, "--auto answers every prompt itself");
  assert.equal(P.unattendedFrom(["opencode", "run", "hello"]), true);
  assert.equal(P.unattendedFrom(["opencode", "run", "--auto", "hello"]), true);
  assert.equal(P.unattendedFrom(["opencode", "serve"]), true);
  assert.equal(P.unattendedFrom([]), true, "no evidence resolves to the strict direction");
  assert.equal(typeof P.isUnattended, "boolean");
});

test("redaction hides secret values and leaves the structure alone", () => {
  const r = (s) => P.redactSecrets(s);
  const hid = (s) => r(s).count > 0 && !r(s).text.includes("SHOULDNOTAPPEAR");

  // The three shapes that actually leaked into a transcript, in their real form.
  assert.ok(hid('{"db_password": "SHOULDNOTAPPEAR", "name": "n8n"}'));
  assert.ok(hid('{"encryption_key": "SHOULDNOTAPPEAR", "port": 5678}'));
  assert.ok(hid('B2_APPLICATION_KEY=SHOULDNOTAPPEAR'), "the B2 key shape");
  assert.ok(hid('  restic_password: SHOULDNOTAPPEAR'));
  assert.ok(hid('{"redis_password":"SHOULDNOTAPPEAR"}'));
  assert.ok(hid('Environment=API_TOKEN=SHOULDNOTAPPEAR'));
  assert.ok(hid('-----BEGIN OPENSSH PRIVATE KEY-----\nSHOULDNOTAPPEAR\n-----END OPENSSH PRIVATE KEY-----'));

  // Structure survives: the agent still sees which keys exist and what else is there.
  const out = r('{"db_password": "hunter2", "name": "n8n", "port": 5678}').text;
  assert.match(out, /"db_password":/);
  assert.match(out, /"name": "n8n"/);
  assert.match(out, /"port": 5678/);
});

test("redaction does not fire on things that only look like secrets", () => {
  const kept = (s) => assert.equal(P.redactSecrets(s).count, 0, `should keep: ${s}`);
  kept('{"host": "nas", "user": "deploy", "size": 1234}');
  kept('{"password": null}');           // saying "redacted" here would invent a secret
  kept('{"token": ""}');
  kept('{"public_key": "ssh-ed25519 AAAA"}');
  kept('{"key_id": 7}');
  kept('{"keyboard": "us"}');
  kept('{"keys": 3}');
  kept("");
  assert.equal(P.redactSecrets(null).count, 0);
  assert.equal(P.redactSecrets(undefined).count, 0);
});

test("redaction counts what it changed, so the note is not a lie", () => {
  assert.equal(P.redactSecrets('{"a_password":"x","b_token":"y","c":"z"}').count, 2);
  assert.equal(P.redactSecrets("nothing here").count, 0);
});

test("the reveal window opens and closes on a deadline", () => {
  const now = 1_000_000;
  assert.equal(P.revealActive(String(now + 5000), now), true, "future deadline is open");
  assert.equal(P.revealActive(String(now - 1), now), false, "past deadline is closed");
  assert.equal(P.revealActive(String(now), now), false, "the deadline itself is closed");
  assert.equal(P.revealActive("", now), false, "no flag file means closed");
  assert.equal(P.revealActive("not a number", now), false, "junk means closed");
  assert.equal(P.revealActive(null, now), false);
  assert.equal(P.revealActive(undefined, now), false);
  assert.equal(P.revealActive(` ${now + 5000}\n`, now), true, "a trailing newline still parses");
});

// The no-think kwarg is a body key on a raw pass-through, so WHICH calls get it is
// the whole safety question: a local coding agent shares the provider and keeps its
// thinking, and cloud classifier agents must never be handed the key.
test("localNoThinkApplies scopes the no-think kwarg to local classifier agents", () => {
  const agents = ["classifier-cloud", "classifier-local"];
  const providers = ["llamacpp"];
  assert.equal(P.localNoThinkApplies("classifier-local", "llamacpp", agents, providers), true);
  assert.equal(P.localNoThinkApplies("build", "llamacpp", agents, providers), false, "the local coder keeps its thinking");
  assert.equal(P.localNoThinkApplies("classifier-cloud", "anthropic", agents, providers), false, "cloud agents never see the key");
  assert.equal(P.localNoThinkApplies(undefined, "llamacpp", agents, providers), false);
  assert.equal(P.localNoThinkApplies("classifier-local", undefined, agents, providers), false);
  assert.equal(P.localNoThinkApplies("classifier-local", "llamacpp", agents, []), false, "an empty provider list leaves the hook inert");
});

test("directFallbackWarranted sends only cheap direct faults to the routed ladder", () => {
  assert.equal(P.directFallbackWarranted("SAFE"), false, "a verdict is an answer, not a fault");
  assert.equal(P.directFallbackWarranted("RISKY"), false, "a verdict is an answer, not a fault");
  assert.equal(P.directFallbackWarranted("error:timeout"), false, "a timeout has already spent the budget a routed lease would add to");
  assert.equal(P.directFallbackWarranted("error:http503"), true, "the endpoint answering unhealthy is exactly what the fallback is for");
  assert.equal(P.directFallbackWarranted("error:http401"), true);
  assert.equal(P.directFallbackWarranted("error:FetchError: connect ECONNREFUSED"), true, "a refused connection is the endpoint-down case");
});

test("a delegated child tracks its parent's mode instead of the global default", () => {
  assert.equal(P.resolveSessionMode({ own: "manual", parent: "god", fallback: "auto" }), "manual",
    "a session that has its own mode file is never overridden by its parent");
  assert.equal(P.resolveSessionMode({ own: null, parent: "god", fallback: "manual" }), "auto",
    "a child of a god session gets auto, never god: nobody set it in front of it");
  assert.equal(P.resolveSessionMode({ own: null, parent: "auto", fallback: "manual" }), "auto",
    "a child is never MORE restricted than the parent that spawned it");
  assert.equal(P.resolveSessionMode({ own: null, parent: "edits", fallback: "god" }), "edits");
  assert.equal(P.resolveSessionMode({ own: null, parent: null, fallback: "manual" }), "manual",
    "a session with no parent still falls to the global default");
});

// D1 dispatch gate. agentCapability caches by dir+agent, so every case below uses
// its own agent name -- reusing one would read a cached verdict rather than the
// file just written.
test("agentCapability reads the declared capability out of frontmatter", () => {
  const dir = mkdtempSync(join(tmpdir(), "gr-capability-"));
  try {
    writeFileSync(join(dir, "reader.md"), "---\ndescription: x\ncapability: read\nmode: subagent\n---\nbody\n");
    writeFileSync(join(dir, "writer.md"), "---\ndescription: x\ncapability: WRITE\n---\nbody\n");
    writeFileSync(join(dir, "silent.md"), "---\ndescription: x\n---\ncapability: read\n");
    writeFileSync(join(dir, "quoted.md"), '---\ncapability: "read"\n---\n');
    assert.equal(P.agentCapability("reader", dir), "read");
    assert.equal(P.agentCapability("writer", dir), "write", "the value is case-insensitive");
    assert.equal(P.agentCapability("silent", dir), null, "a capability line in the body is not frontmatter");
    assert.equal(P.agentCapability("quoted", dir), null, "an unmatched form reads as undeclared, not as a refusal");
    assert.equal(P.agentCapability("absent", dir), null, "a missing agent file is undeclared");
    assert.equal(P.agentCapability("../../etc/passwd", dir), null, "a name that is not a bare agent name never becomes a path");
    assert.equal(P.agentCapability("", dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the dispatch gate refuses write and exec work sent to a read-only agent", () => {
  const refusal = (capability, prompt) => P.dispatchRefusal({ agent: "explorer", capability, prompt });
  // Only a `read` agent is gated, so nothing that dispatches today can start failing.
  assert.equal(refusal("write", "rewrite the config"), null);
  assert.equal(refusal("exec", "run the suite"), null);
  assert.equal(refusal(null, "anything at all"), null);
  assert.equal(refusal("read", "INTENT: read\nmap the registry"), null);
  assert.equal(refusal("read", "  intent:read\nmap the registry"), null, "leading space and case are tolerated");
  // Silence is refusal for a read agent: an omitted line IS the misdispatch.
  assert.match(refusal("read", "map the registry"), /is read-only/);
  assert.match(refusal("read", ""), /INTENT: read/);
  assert.match(refusal("read", undefined), /is read-only/);
  assert.match(refusal("read", "INTENT: write\napply the rename"), /declares `capability: write`/);
  assert.match(refusal("read", "INTENT: exec\nrun the suite"), /declares `capability: exec`/);
  assert.match(refusal("read", "please INTENT: read later"), /is read-only/, "the declaration must open the prompt");
});

// D0. /session/status lists only sessions that are NOT idle, so an absent session is
// idle, and a tool call for it belongs to a turn that was cancelled or has ended.
test("a tool call for a session that is no longer running is refused", () => {
  const refuse = (statuses, sessionID = "ses_a", tool = "bash") => P.staleToolRefusal({ statuses, sessionID, tool });
  assert.equal(refuse({ ses_a: { type: "busy" } }), null, "a busy session runs its tools");
  assert.equal(refuse({ ses_a: { type: "retry", attempt: 2 } }), null, "a retrying session is still running");
  assert.match(refuse({}), /blocked `bash`: this session's turn was cancelled or has already ended/, "absent means idle");
  assert.match(refuse({ ses_a: { type: "idle" } }), /left over/);
  assert.match(refuse({ ses_b: { type: "busy" } }), /left over/, "another session being busy does not count");
  // Anything that is not a readable status map means "cannot tell": a live session must
  // never be stalled by a status hiccup.
  for (const unreadable of [null, undefined, "busy", [], 42]) assert.equal(refuse(unreadable), null);
  assert.equal(P.staleToolRefusal({ statuses: {}, sessionID: undefined, tool: "bash" }), null, "no session id, nothing to judge");
});
