import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkPythonSource } from "../lib/python-source-check.js";

const reader = `import collections
import datetime
import json
import math
import os
import stat
import sys
UTC = datetime.timezone.utc
def iso_ms(value):
    return datetime.datetime.fromtimestamp(value / 1000, UTC).isoformat()
PATH = '/artificial/trace.jsonl'
counts = collections.Counter()
report = {}
try:
    st = os.lstat(PATH)
    if stat.S_ISREG(st.st_mode):
        with open(PATH, 'rb') as stream:
            os.fstat(stream.fileno())
            while True:
                line = stream.readline(65536)
                if not line:
                    break
                item = json.loads(line)
                if isinstance(item, dict):
                    at = item.get('at')
                    if isinstance(at, (int, float)) and math.isfinite(at):
                        counts[iso_ms(at)] += 1
        report.setdefault('counts', counts)
        report['generated'] = datetime.datetime.now(UTC).timestamp()
        print(json.dumps(report, sort_keys=True))
except Exception as exc:
    print(type(exc).__name__)
    sys.exit(1)`;

test("restricted checker accepts the read-only routing reader without executing it", () => {
  assert.deepEqual(checkPythonSource(reader), { status: "safe", reason: "ok" });
});

test("restricted checker rejects process, reflection, imports and computed calls without side effects", () => {
  for (const source of [
    "import os\nos.system('touch /tmp/guard-sentinel')",
    "import os\nprint(os.environ)",
    "at = os.system('at now < /tmp/guard-example.sh')",
    "import subprocess as s\nat = s.run\nat('at now')",
    "from os import system\nsystem('at now')",
    "getattr(__import__('os'), 'system')('at now')",
    "callback = print\ncallback('unexpected alias call')",
    "(lambda: 1)()",
  ]) assert.equal(checkPythonSource(source).status, "unsafe", source);
});

test("restricted checker fails closed for malformed and oversized source", () => {
  assert.equal(checkPythonSource("if True print('bad')").status, "unsafe");
  assert.deepEqual(checkPythonSource(`x = '${"a".repeat(70000)}'`), { status: "unsafe", reason: "input-too-large" });
});

test("checker runtime absence fails closed", () => {
  const moduleUrl = new URL("../lib/python-source-check.js", import.meta.url).href;
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
    const { checkPythonSource } = await import(${JSON.stringify(moduleUrl)});
    process.stdout.write(JSON.stringify(checkPythonSource("at = 'noon'")));
  `], { encoding: "utf8", env: { PATH: "" } });

  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), { status: "unavailable", reason: "checker-unavailable" });
});

test("faithful routing reader uses only supported read-only capabilities", () => {
  const source = readFileSync(new URL("./issue9-routing-reader.py", import.meta.url), "utf8");
  assert.deepEqual(checkPythonSource(source), { status: "safe", reason: "ok" });
});

const rejectedPrograms = [
  ["aliased process capability rebound to print", 'import os\nholder=os\nprint=holder.system\nat=print("at now < /tmp/guard-example.sh")'],
  ["canonical module attribute mutation", 'import os\nimport json\nholder=os\njson.loads=holder.system\nat=json.loads("at now < /tmp/guard-example.sh")'],
  ["aliased process callback", 'import os\nholder=os\nat=sorted(["at now < /tmp/guard-example.sh"], key=holder.system)'],
  ["generic attribute extraction", 'import os\nholder=os\ncapability=holder.system\nat=1'],
  ["generic call-result attribute extraction", 'capability=dict().arbitrary\nat=1'],
  ["safe method extraction is not a callable alias", 'values={}\ncallback=values.get\nat=1'],
  ["parameter annotation executes at definition", 'import os\nholder=os\ndef f(x: holder.system("at now < /tmp/guard-example.sh")):\n return 1\nat=1'],
  ["annotation even without a forbidden module alias", 'def f(x: print("annotation")):\n return 1\nat=1'],
  ["keyword-only parameter annotation", 'def f(*, x: print("annotation")):\n return 1\nat=1'],
  ["positional-only parameter annotation", 'def f(x: print("annotation"), /):\n return 1\nat=1'],
  ["return annotation", 'def f() -> int:\n return 1\nat=1'],
  ["assignment annotation", 'import os\nholder=os\nx: holder.system("at now < /tmp/guard-example.sh") = 1\nat=1'],
  ["function default", 'def f(x=print("side effect")):\n return x\nat=1'],
  ["function decorator", '@print\ndef f():\n return 1\nat=1'],
  ["builtin rebinding", 'print=1\nat=print(2)'],
  ["module binding overwrite", 'import json\njson={}\nat=1'],
  ["function binding overwrite", 'def f():\n return 1\nf=print\nat=f(2)'],
  ["forward function binding overwrite", 'f=print\ndef f():\n return 1\nat=1'],
  ["duplicate function definition", 'def f():\n return 1\ndef f():\n return 2\nat=1'],
  ["builtin parameter", 'def f(print):\n return print(1)\nat=1'],
  ["module positional-only parameter", 'def f(json, /):\n return 1\nat=1'],
  ["function parameter shadowing", 'def f():\n return 1\ndef g(f):\n return f()\nat=1'],
  ["function name shadows builtin", 'def print():\n return 1\nat=1'],
  ["for binding", 'for print in [1]:\n pass\nat=1'],
  ["tuple binding", 'x, print = (1, 2)\nat=1'],
  ["with binding", 'with open("/artificial/not-read", "rb") as print:\n pass\nat=1'],
  ["exception binding", 'try:\n pass\nexcept Exception as print:\n pass\nat=1'],
  ["comprehension binding", 'values=[print for print in [1]]\nat=1'],
  ["async comprehension", 'values=[x async for x in []]\nat=1'],
  ["all attribute stores", 'item={}\nitem.value=1\nat=1'],
  ["augmented protected binding", 'print += 1\nat=1'],
  ["dynamic class construction", 'at=type("X", (), {})'],
  ["type value escape", 'at=type(1)'],
  ["custom class", 'class X:\n pass\nat=1'],
  ["unvalidated callback parameter", 'def f(callback):\n return sorted([1], key=callback)\nat=1'],
  ["callback lambda", 'at=sorted([1], key=lambda x: x)'],
  ["JSON callback", 'at=json.loads("1", parse_int=print)'],
  ["JSON decoder class", 'import json\nat=json.loads("1", cls=dict)'],
  ["computed function target", 'callbacks=[print]\nat=callbacks[0](1)'],
  ["module introspection", 'import sys\nat=sys.modules'],
  ["environment read", 'import os\nat=os.environ'],
  ["private attribute", 'at=(1).__class__'],
  ["starred arguments", 'at=min(*[1,2])'],
  ["expanded keyword arguments", 'at=dict(**{})'],
  ["write mode", 'at=open("/artificial/not-written", "w")'],
  ["computed read mode", 'mode="r"\nat=open("/artificial/not-read", mode)'],
  ["raise cause", 'import os\nholder=os\nraise ValueError() from holder.system("at now < /tmp/guard-example.sh")'],
  ["unsafe raise cause without a module alias", 'raise ValueError() from eval("1")'],
  ["unsafe exception selector", 'try:\n pass\nexcept eval("ValueError"):\n pass'],
  ["keyword-only protected parameter", 'def f(*, print):\n return 1\nat=1'],
  ["builtin name outside the callable allowlist", 'eval=1\nat=1'],
  ["module function extraction", 'import json\ncallback=json.loads\nat=1'],
  ["metadata cannot expose the type object", 'at=type(1).__name__.__class__'],
  ["metadata cannot wrap dynamic type creation", 'at=type("X", (), {}).__name__'],
  ["callback through a subscript", 'at=sorted([1], key=[int][0])'],
  ["callback through a data alias", 'callback=int\nat=sorted([1], key=callback)'],
  ["open callback", 'at=open("/artificial/not-read", "r", opener=print)'],
  ["print redirection", 'print("write", file=open("/artificial/not-read", "r"))\nat=1'],
  ["unknown syntax", 'match 1:\n case 1: pass\nat=1'],
  ["named expression binding", 'at=(print := 1)'],
  ["global declaration", 'def f():\n global print\n return 1\nat=1'],
  ["delete protected binding", 'del print\nat=1'],
];

for (const [name, source] of rejectedPrograms) {
  test(`restricted checker rejects ${name}`, () => {
    assert.equal(checkPythonSource(source).status, "unsafe", source);
  });
}

test("restricted checker bounds the entire expression tree, not just statements", () => {
  assert.deepEqual(checkPythonSource(`at=[${Array(4100).fill("1").join(",")}]`),
    { status: "unsafe", reason: "resource-limit" });
});

test("the AST node budget includes operators as well as expression operands", () => {
  assert.deepEqual(checkPythonSource(`at=[${Array(1000).fill("1+1").join(",")}]`),
    { status: "unsafe", reason: "resource-limit" });
  assert.deepEqual(checkPythonSource(`at=[${Array(100).fill("1+1").join(",")}]`),
    { status: "safe", reason: "ok" });
});

test("restricted checker bounds expression depth before recursive validation", () => {
  assert.deepEqual(checkPythonSource(`at=${"[".repeat(85)}1${"]".repeat(85)}`),
    { status: "unsafe", reason: "resource-limit" });
  assert.deepEqual(checkPythonSource(`at=${Array(100).fill("1").join("+")}`),
    { status: "unsafe", reason: "resource-limit" });
});

test("read-only constructors, validated functions and exact exception metadata remain supported", () => {
  assert.deepEqual(checkPythonSource(`def identity(value):
    return value
values = (frozenset(('a',)), dict(), list(), set(), tuple(), int(1), float(1), str(1), bytes(1), bool(1))
at = sorted([2, 1], key=identity)
try:
    raise ValueError('example')
except ValueError as exc:
    print(type(exc).__name__)
`), { status: "safe", reason: "ok" });
});

test("malicious source is rejected without executing file writes or process calls", () => {
  const dir = mkdtempSync(join(tmpdir(), "guard-python-sentinel-"));
  const sentinel = join(dir, "must-not-exist");
  try {
    for (const source of [
      `open(${JSON.stringify(sentinel)}, 'w').write('executed')`,
      `import os\nos.system(${JSON.stringify(`touch ${sentinel}`)})`,
    ]) {
      assert.equal(checkPythonSource(source).status, "unsafe");
      assert.equal(existsSync(sentinel), false, "the checker must only parse submitted source");
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("checker adapter sanitizes failed and unexpected protocol responses", (t) => {
  const responses = [
    { status: 0, stdout: '{"status":"safe","reason":"raw-source-secret"}', stderr: "" },
    { status: 0, stdout: '{"status":"safe","reason":"ok","source":"raw-source-secret"}', stderr: "" },
    { status: 0, stdout: '{"status":"unsafe","reason":"raw-source-secret"}', stderr: "" },
    { status: 0, stdout: 'null', stderr: "" },
    { status: 0, stdout: '{"status":"safe","reason":"ok"}', stderr: "raw-stderr-secret" },
    { status: 1, stdout: 'raw-protocol-secret', stderr: "" },
  ];
  for (const response of responses) {
    t.mock.method(childProcess, "spawnSync", () => response);
    syncBuiltinESMExports();
    try {
      assert.deepEqual(checkPythonSource("at=1"), { status: "unavailable", reason: "checker-protocol-failed" });
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }
  }
});

test("checker adapter fails closed on spawn errors, timeouts and output limits", (t) => {
  for (const [response, expected] of [
    [{ error: { code: "ETIMEDOUT", message: "raw-error-secret" } }, "checker-timeout"],
    [{ error: { code: "ENOENT", message: "raw-error-secret" } }, "checker-unavailable"],
    [{ error: { code: "ENOBUFS", message: "raw-error-secret" } }, "checker-unavailable"],
    [null, "checker-spawn-failed"],
  ]) {
    t.mock.method(childProcess, "spawnSync", () => {
      if (response === null) throw new Error("raw-error-secret");
      return response;
    });
    syncBuiltinESMExports();
    try {
      assert.deepEqual(checkPythonSource("at=1"), { status: "unavailable", reason: expected });
    } finally {
      t.mock.restoreAll();
      syncBuiltinESMExports();
    }
  }
});
