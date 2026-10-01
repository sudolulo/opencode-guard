// The bash parser opencode itself uses (web-tree-sitter + tree-sitter-bash, the same
// pinned versions as opencode's package.json). opencode's shell tool checks permission
// once per `command` node -- including commands inside loops, subshells, groups and
// command substitutions -- against the node's source (its redirected_statement when it
// has one). The launder floor has to see exactly those commands, which a hand lexer
// that only splits on `; & | newline` does not.
//
// Loaded once at import. A load failure is not swallowed: `parserError` says why, and
// the floor fails closed on any command it can no longer see into.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let parser = null;
let parserError = null;
try {
  const { Parser, Language } = await import("web-tree-sitter");
  const treeWasm = require.resolve("web-tree-sitter/tree-sitter.wasm");
  await Parser.init({ locateFile: () => treeWasm });
  const bash = await Language.load(require.resolve("tree-sitter-bash/tree-sitter-bash.wasm"));
  parser = new Parser();
  parser.setLanguage(bash);
} catch (error) {
  parser = null;
  parserError = `${error?.message ?? error} (run \`npm install\` in the opencode-guard checkout)`;
}

export { parser, parserError };
