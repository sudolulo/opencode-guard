// The launder floor: a command that opencode's own allow globs would run unprompted,
// but whose parsed arguments make a "read" verb write a file or run a program.
//
// Run:  node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const home = mkdtempSync(join(tmpdir(), "guard-launder-"));
process.env.HOME = home;
delete process.env.OPENCODE_GUARD_CONFIG;
mkdirSync(join(home, ".config/opencode"), { recursive: true });
writeFileSync(join(home, ".config/opencode/opencode.json"), JSON.stringify({ permission: { bash: { "*": "ask" } } }));

const P = await import(new URL("../lib/policy.js", import.meta.url).href);

// A slice of the real fleet rules, in the real order (the rm -rf floor, then its
// registered /tmp/opencode exception): every read verb under test is allowed, plus the
// snip twins the real config carries.
const RULES = [
  ["*", "ask"],
  ["rm -rf /*", "deny"],
  ...["echo *", "cat *", "fd *", "rg *", "rtk rg *", "rtk --version", "git diff*", "git log*", "git show*",
    "git --no-pager diff*", "rtk git diff*", "git fetch*", "git grep*", "git remote*", "git branch*", "tree *",
    "uniq *", "xxd *", "pdftotext *", "yq *", "xmllint *", "bat *", "ag *", "ls *", "rm -rf /tmp/opencode/*",
    "opencode session delete *"]
    .flatMap((p) => [[p, "allow"], ["snip " + p, "allow"]]),
];

test("nativeBashVerdict reproduces opencode's wildcard matcher", () => {
  const v = (command, rules = RULES) => P.nativeBashVerdict(command, rules);
  assert.equal(v("ls"), "allow", "a trailing ` *` also matches no further arguments");
  assert.equal(v("ls -la"), "allow");
  assert.equal(v("lsblk"), "ask", "but `ls *` does not match a longer verb");
  assert.equal(v("git diff HEAD"), "allow");
  assert.equal(v("git difftool"), "allow", "`git diff*` has no space, so it matches difftool -- the reason this floor exists");
  assert.equal(v("rm -rf /etc"), "deny");
  assert.equal(v("rm -rf /tmp/opencode/x"), "allow", "last match wins: the later exception overrides the floor");
  assert.equal(v("a", [["*", "ask"], ["a", "allow"], ["a", "deny"]]), "deny", "and a later deny overrides an earlier allow");
  assert.equal(v("x", [["*", "ask"], ["?", "allow"]]), "allow", "? is exactly one character");
  assert.equal(v("xy", [["*", "ask"], ["?", "allow"]]), "ask");
  assert.equal(v("cat a\\b", [["*", "ask"], ["cat a/b", "allow"]]), "allow", "backslashes compare as slashes");
  assert.equal(v("a.b", [["*", "ask"], ["a.b", "allow"]]), "allow");
  assert.equal(v("axb", [["*", "ask"], ["a.b", "allow"]]), "ask", "regex specials are literal");
  assert.equal(v("anything", []), undefined, "no rule, no verdict");
});

const LAUNDER = [
  "echo x > /home/dev/.bashrc", "cat a >> b", "echo x >~/.profile", "ls 1> out.txt",
  "fd -HX rm -rf", "fd . / -X rm", "fd -x rm {}", "fd --exec rm {}", "fd --exec-batch=rm",
  "rg '--pre' sh x", "rg --pre=sh x", "rg --hostname-bin=./x foo", "rtk rg --pre sh x",
  "git diff --output=/home/dev/.bashrc", "git log --output x", "git show --ext-diff",
  "git --no-pager diff --output=f", "rtk git diff --ext-diff",
  "git grep -iO'rm -rf' -e x", "git grep --open-files-in-pager=x -e y", "git grep --open=x -e y",
  "git grep -O -e x",
  "git fetch --upload-pack=x origin", "git fetch --upl=x origin",
  "git remote -v set-url origin x", "git remote add x y",
  "git branch -vD main", "git branch -v --del main", "git branch newname", "git branch -f main HEAD~1",
  "git branch -a -vv --forc main x", "git branch --set-upstream-to=o/x",
  "tree -o out", "tree -aCo out", "uniq in out", "xxd in out", "xxd -r hex bin", "pdftotext a.pdf",
  "pdftotext a.pdf out.txt", "yq -i .a=1 f.yml", "yq -Pi .a=1 f.yml", "xmllint --output o x.xml",
  "bat --pager=sh f", "ag --pager sh foo",
  "snip fd -HX rm -rf",
  // opencode checks every command node, inside loops, subshells, groups, substitutions
  "for f in a; do echo x > /home/dev/.bashrc; done", "(echo x > /home/dev/.bashrc)", "{ fd -x rm {}; }",
  "if true; then fd -x rm {}; fi", "x=$(fd -x rm {})", "echo $(fd -x rm {})", "cat `fd -x rm {}`",
  // a redirect on a compound statement whose commands all run unprompted
  "(cat a) > /home/dev/.bashrc", "{ cat a; ls; } > /home/dev/.bashrc", "> /home/dev/.bashrc",
  // an apostrophe in a heredoc body must not hide the commands after it
  "cat <<EOF\ndon't\nEOF\necho x > /home/dev/.bashrc",
  // /tmp/opencode only when the target is literal
  "echo x > /tmp/opencode/$d", "echo x > /tmp/opencode/`echo ..`/x",
  // natively allowed but not a known read: fetch-pack matches git fetch*
  "git fetch-pack --exec=cmd .",
  // abbreviated long options
  "ag --pag=sh foo",
];

test("a natively-allowed read verb that writes or executes has a launder reason", () => {
  for (const command of LAUNDER) {
    assert.ok(P.launderReason(command, RULES), `expected a launder reason for: ${command}`);
  }
});

const CLEAN = [
  "echo hi", "cat a >/dev/null", "cat a 2>&1", "echo x > /tmp/opencode/y", "ls -la 2>/dev/null",
  "fd -e md", "fd -tx", "fd -e x foo", "rg --pretty foo", "rg -e '--prefix' x", "rg -n foo src",
  "git diff HEAD~1", "git log --oneline", "git log --output-indicator-new=+", "git show HEAD --stat",
  "git grep -n foo", "git fetch -q origin", "git fetch --unshallow",
  "git remote", "git remote -v", "git remote show origin", "git remote get-url origin",
  "git branch", "git branch -vv", "git branch -a", "git branch --contains abc",
  "git branch --sort=-committerdate", "git branch --sort -committerdate", "git branch --list 'feat*'",
  "git branch --merged main", "git branch --show-current",
  "uniq -c f", "uniq -f 1 f", "xxd f", "xxd -l 16 f", "pdftotext a.pdf -", "pdftotext -l 2 a.pdf -",
  "tree -L 2", "yq .a f.yml", "xmllint --noout x.xml", "bat f", "ag foo",
  "npm test 2>&1 | tail -5", "cd /work && rg foo",
  'cat a > "/dev/null"', 'echo x > "/tmp/opencode/y"', "cat <<'EOF' > /tmp/opencode/x.sh\necho hi > out\nEOF",
  "rtk --version", "opencode session delete ses_x", "rm -rf /tmp/opencode/scratch", "for f in a b; do cat $f; done",
  "echo $(git rev-parse HEAD)", "(cd /work && rg foo)",
];

test("ordinary reads, and harmless redirects, have no launder reason", () => {
  for (const command of CLEAN) {
    assert.equal(P.launderReason(command, RULES), null, `unexpected launder reason for: ${command}`);
  }
});

test("every output-redirect spelling is seen, and the reason names the real target", () => {
  for (const command of ["echo x &> /home/dev/.bashrc", "echo x &>> /home/dev/.bashrc", "echo x >| /home/dev/.bashrc",
    "echo x >&/home/dev/.bashrc", "echo x>/home/dev/.bashrc", "echo x 2>> /home/dev/.bashrc"]) {
    const result = P.launderReason(command, RULES);
    assert.ok(result, `expected a launder reason for: ${command}`);
    assert.match(result.reason, /\/home\/dev\/\.bashrc/, `the reason must name the file for: ${command}`);
  }
  // `&>` is a redirect, not a background `&`: auto mode must not settle it as a read either.
  assert.equal(P.commandIsRead("echo x &> /home/dev/.bashrc"), false);
  assert.equal(P.commandIsRead("ls & echo hi"), true, "a real background & still splits");
  assert.equal(P.launderReason("echo x 2>&1 >&2", RULES), null, "fd merges write nothing");
});

// The ruleset is read the way opencode reads it: config.json, opencode.json and
// opencode.jsonc from the global config dir, JSONC (comments, trailing commas),
// on top of opencode's built-in `"*": "allow"` default. A file that exists but
// cannot be read or parsed fails CLOSED: every segment is judged as allowed.
const createdDirs = [];
const configDir = (files) => {
  const dir = mkdtempSync(join(tmpdir(), "guard-launder-cfg-"));
  createdDirs.push(dir);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
};

test("loadBashRules starts from opencode's default allow", () => {
  const empty = P.loadBashRules(configDir({}));
  assert.deepEqual(empty, { rules: [["*", "allow"]], error: null }, "no config at all: opencode allows bash");
  const noStar = P.loadBashRules(configDir({ "opencode.json": JSON.stringify({ permission: { bash: { "rm *": "ask" } } }) }));
  assert.equal(P.nativeBashVerdict("echo x > f", noStar.rules), "allow", "a config without `*` leaves the default allow");
  assert.ok(P.launderReason("echo x > f", noStar.rules));
  const str = P.loadBashRules(configDir({ "opencode.json": JSON.stringify({ permission: { bash: "ask" } }) }));
  assert.equal(P.nativeBashVerdict("echo x > f", str.rules), "ask");
});

test("loadBashRules reads JSONC and merges the files opencode reads", () => {
  const dir = configDir({
    "opencode.json": `{
      // a comment
      "permission": { "bash": {
        "*": "ask", /* block */ "cat *": "allow",
        "echo // not a comment,}*": "allow",
      }, },
    }`,
    "opencode.jsonc": `{ "permission": { "bash": { "cat *": "ask", "rg *": "allow", } } }`,
  });
  const { rules, error } = P.loadBashRules(dir);
  assert.equal(error, null);
  assert.equal(P.nativeBashVerdict("echo // not a comment,} x", rules), "allow", "string content survives comment stripping");
  assert.equal(P.nativeBashVerdict("cat a", rules), "ask", "opencode.jsonc is read after opencode.json and overrides it");
  assert.equal(P.nativeBashVerdict("rg foo", rules), "allow");
});

test("an unreadable or unparseable config fails closed and says why", () => {
  const { rules, error } = P.loadBashRules(configDir({ "opencode.json": "{ not json" }));
  assert.match(error, /opencode\.json/);
  assert.deepEqual(rules, [["*", "allow"]], "every segment is judged as natively allowed");
  assert.ok(P.launderReason("echo x > /home/dev/.bashrc", rules));
  assert.ok(P.launderReason("fd -HX rm -rf", rules));
  assert.equal(P.launderReason("echo hi", rules), null, "reads still run");
});

test("only natively-allowed segments are judged: an approved prompt still runs", () => {
  const rules = [["*", "ask"], ["cat *", "allow"]];
  assert.equal(P.launderReason("git branch -D feature", rules), null, "asked natively, so the person approved it");
  assert.equal(P.launderReason("echo x > f", rules), null, "echo is not allowed here, so it was approved at a prompt");
  assert.ok(P.launderReason("cat a > f", rules));
  assert.ok(P.launderReason("echo ok && cat a > f", [...rules, ["echo *", "allow"]]), "every segment is judged");
});

test("the strict read checks also tighten auto-mode read classification", () => {
  // commandIsRead uses the same GUARDS; this suite's opencode.json allows nothing
  // but "*": ask, so there is no config shortcut.
  for (const command of ["fd -HX rm -rf", "rg --pre sh x", "git diff --output=f", "git branch -vD main",
    "git grep -iOx -e y", "git remote -v set-url origin x", "uniq a b", "xxd -r a b", "tree -o f",
    "pdftotext a.pdf", "yq -i .a=1 f", "bat --pager=sh f", "exiftool -if 'system(1)' f",
    "sed -n '1w /home/dev/.bashrc' f", "sed -n '1e touch x' f", "sed -n 's/a/b/w out' f", "sed --in=.bak -n p f",
    "sed -f script f", "sort --out=f a", "sort -rof a", "git ls-remote --upload-pack=x .", "yq -s '.a' f",
    "mediainfo --LogFile=out f", "toString x"]) {
    assert.equal(P.commandIsRead(command), false, `must not be a static read: ${command}`);
  }
  for (const command of ["fd -e md", "rg foo", "git diff HEAD", "git branch -vv", "git remote -v",
    "uniq -c f", "xxd f", "tree -L 2", "pdftotext a.pdf -", "yq .a f",
    "sed -n '1,5p' f", "sed -n '/foo/p' f", "sed 's/a/b/g' f", "sed -n -e '1p' -e '3p' f", "sort -k2 f"]) {
    assert.equal(P.commandIsRead(command), true, `must stay a static read: ${command}`);
  }
});

// Through the real hook, in a subprocess with a throwaway HOME: the plugin reads its
// files at import.
const runHook = ({ mode, command, config }) => {
  const h = mkdtempSync(join(tmpdir(), "guard-launder-hook-"));
  try {
    mkdirSync(join(h, ".config/opencode"), { recursive: true });
    mkdirSync(join(h, ".local/share/opencode/modes"), { recursive: true });
    writeFileSync(join(h, ".config/opencode/opencode.json"), config ?? JSON.stringify({
      permission: { bash: Object.fromEntries(RULES) },
    }));
    writeFileSync(join(h, ".local/share/opencode/modes/ses_a"), `${mode}\n`);
    const pluginUrl = new URL("../plugin.js", import.meta.url).href;
    const script = `
      const logs = [];
      const client = {
        session: { status: async () => ({ data: { ses_a: { type: "busy" } } }), get: async () => ({ data: {} }) },
        app: { log: async (entry) => { logs.push(entry?.body ?? entry); } },
      };
      const { OpencodeGuard } = await import(${JSON.stringify(pluginUrl)});
      const hooks = await OpencodeGuard({ client, directory: ${JSON.stringify(h)} });
      let outcome = "ran";
      try {
        await hooks["tool.execute.before"]({ tool: "bash", sessionID: "ses_a", callID: "c1" }, { args: { command: ${JSON.stringify(command)} } });
      } catch (error) { outcome = String(error?.message ?? error); }
      console.log(JSON.stringify({ outcome, logs }));
    `;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, HOME: h }, encoding: "utf8",
    });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
    return config === undefined ? result.outcome : result;
  } finally {
    rmSync(h, { recursive: true, force: true });
  }
};

test("with a broken opencode.json the hook still blocks, and reports the config error", () => {
  const result = runHook({ mode: "manual", command: "echo x > /home/dev/.bashrc", config: "{ not json" });
  assert.match(result.outcome, /matches an allow rule for a read-only command/);
  assert.ok(result.logs.some((entry) => entry?.level === "error" && /opencode\.json/.test(entry?.message ?? "")),
    `expected an error log naming the config, got ${JSON.stringify(result.logs)}`);
});

test("the hook blocks a laundered write in manual, edits and auto, and stands aside in god", () => {
  for (const mode of ["manual", "edits", "auto"]) {
    assert.match(runHook({ mode, command: "echo x > /home/dev/.bashrc" }), /matches an allow rule for a read-only command/,
      `${mode} must block`);
    assert.match(runHook({ mode, command: "fd -HX rm -rf" }), /matches an allow rule for a read-only command/,
      `${mode} must block`);
  }
  assert.equal(runHook({ mode: "god", command: "echo x > /home/dev/.bashrc" }), "ran", "god stands the floor aside");
  assert.equal(runHook({ mode: "manual", command: "echo hi" }), "ran");
  assert.equal(runHook({ mode: "manual", command: "sort -o out in" }), "ran",
    "a natively-asked command was approved by a person and runs");
});

test("the bash parser loads, so compound syntax is judged command by command", () => {
  assert.equal(P.parserError, null, "web-tree-sitter and tree-sitter-bash must be installed (npm install)");
});

test("without the parser, the fallback refuses compound syntax and still judges simple commands", () => {
  for (const command of ["for f in a; do echo x > /home/dev/.bashrc; done", "(echo hi)", "echo $(fd -x rm)", "cat <<EOF\nx\nEOF"]) {
    assert.ok(P.launderReasonLex(command, RULES), `fallback must refuse: ${command}`);
  }
  assert.ok(P.launderReasonLex("echo x > /home/dev/.bashrc", RULES));
  assert.ok(P.launderReasonLex("fd -HX rm -rf", RULES));
  assert.equal(P.launderReasonLex("echo hi", RULES), null);
  assert.equal(P.launderReasonLex("cat a > /tmp/opencode/x", RULES), null);
});

process.on("exit", () => {
  rmSync(home, { recursive: true, force: true });
  for (const dir of createdDirs) rmSync(dir, { recursive: true, force: true });
});
