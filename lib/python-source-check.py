import ast
import json
import sys

MAX_NODES = 4000
MAX_DEPTH = 80
IMPORTS = {"collections", "datetime", "json", "math", "os", "stat", "sys"}
CONSTRUCTORS = {"frozenset", "dict", "list", "set", "tuple", "int", "float", "str", "bytes", "bool"}
BUILTINS = CONSTRUCTORS | {"len", "isinstance", "min", "max", "print", "range", "enumerate", "sorted", "open"}
EXCEPTIONS = {"Exception", "ValueError", "KeyError", "TypeError", "OSError", "OverflowError", "RuntimeError", "UnicodeDecodeError"}
# Builtins, canonical module names and every local function name are immutable in ALL
# scopes. Inspecting the trusted interpreter's builtins does not inspect the program.
PROTECTED = IMPORTS | set(dir(__builtins__))
MODULE_CALLS = {
    ("collections", "Counter"), ("json", "loads"), ("json", "dumps"),
    ("json", "JSONDecodeError"), ("math", "isfinite"),
    ("os", "stat"), ("os", "fstat"), ("os", "lstat"), ("os", "readlink"),
    ("stat", "S_ISREG"), ("sys", "exit"),
    ("datetime", "datetime", "now"), ("datetime", "datetime", "fromtimestamp"),
}
METHODS = {"get", "items", "setdefault", "keys", "values", "copy", "append", "update", "add", "read", "readline", "fileno", "isoformat", "timestamp"}
METADATA = {
    "st_mode", "st_ino", "st_dev", "st_nlink", "st_uid", "st_gid", "st_size",
    "st_atime", "st_mtime", "st_ctime", "st_atime_ns", "st_mtime_ns", "st_ctime_ns",
    "year", "month", "day", "hour", "minute", "second", "microsecond", "fold",
}
# No implicit callback slots (JSON hooks/cls, open.opener, print.file, etc.). Only
# sorted/min/max.key have a separate, immutable-callable validation path.
KEYWORDS = {
    "print": {"sep", "end", "flush"}, "sorted": {"key", "reverse"},
    "min": {"key", "default"}, "max": {"key", "default"}, "enumerate": {"start"},
    "int": {"base"}, "str": {"encoding", "errors"}, "bytes": {"encoding", "errors"},
    "json.dumps": {"skipkeys", "ensure_ascii", "check_circular", "allow_nan", "indent", "separators", "sort_keys"},
    "datetime.datetime.now": {"tz"}, "datetime.datetime.fromtimestamp": {"tz"},
    "isoformat": {"sep", "timespec"},
}
ALLOWED_NODES = {
    ast.Module, ast.Import, ast.alias, ast.Assign, ast.AugAssign, ast.Expr,
    ast.If, ast.While, ast.For, ast.With, ast.withitem, ast.Try, ast.ExceptHandler,
    ast.Raise, ast.Break, ast.Continue, ast.Pass, ast.Return, ast.FunctionDef,
    ast.arguments, ast.arg, ast.Constant, ast.Name, ast.Attribute, ast.Call, ast.keyword,
    ast.List, ast.Tuple, ast.Set, ast.Dict, ast.BinOp, ast.UnaryOp, ast.BoolOp,
    ast.Compare, ast.Subscript, ast.Slice, ast.ListComp, ast.DictComp, ast.SetComp,
    ast.GeneratorExp, ast.comprehension, ast.Load, ast.Store,
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.LShift, ast.RShift, ast.BitOr, ast.BitXor, ast.BitAnd,
    ast.Invert, ast.Not, ast.UAdd, ast.USub, ast.And, ast.Or,
    ast.Eq, ast.NotEq, ast.Lt, ast.LtE, ast.Gt, ast.GtE, ast.Is, ast.IsNot,
    ast.In, ast.NotIn,
}

class Refusal(Exception):
    pass

class ResourceLimit(Refusal):
    pass

class Validator:
    def __init__(self):
        self.functions = set()

    def validate(self, tree):
        # Count every node and edge BEFORE any recursive validation, including
        # expressions, targets, operators and argument annotations. Unknown AST
        # shapes fail closed rather than disappearing into an unvisited field.
        nodes = []
        pending = [(tree, 0)]
        while pending:
            node, depth = pending.pop()
            nodes.append(node)
            if len(nodes) > MAX_NODES or depth > MAX_DEPTH:
                raise ResourceLimit()
            if type(node) not in ALLOWED_NODES:
                raise Refusal()
            pending.extend((child, depth + 1) for child in ast.iter_child_nodes(node))
        # Collect the entire namespace first: an earlier assignment or a binding
        # hidden in another scope must not replace a later approved function.
        for node in nodes:
            if isinstance(node, ast.FunctionDef):
                self.binding(node.name)
                self.functions.add(node.name)
        for node in nodes:
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
                self.binding(node.id)
            elif isinstance(node, ast.Attribute) and isinstance(node.ctx, ast.Store):
                raise Refusal()
            elif isinstance(node, ast.arg):
                self.binding(node.arg)
                if node.annotation is not None:
                    raise Refusal()
            elif isinstance(node, ast.ExceptHandler) and node.name:
                self.binding(node.name)
        # A success is emitted only AFTER all function bodies and call sites pass.
        self.walk(tree)

    def binding(self, name):
        if name.startswith("_") or name in PROTECTED | self.functions:
            raise Refusal()

    def walk(self, node, depth=0):
        method = getattr(self, "node_" + type(node).__name__, None)
        if method is None:
            raise Refusal()
        return method(node, depth)

    def block(self, statements, depth):
        for statement in statements:
            self.walk(statement, depth + 1)

    def node_Module(self, node, depth): self.block(node.body, depth)
    def node_Import(self, node, depth):
        for alias in node.names:
            if alias.name not in IMPORTS or alias.asname:
                raise Refusal()
    def node_ImportFrom(self, node, depth): raise Refusal()
    def node_Assign(self, node, depth):
        self.expr(node.value, depth + 1)
        for target in node.targets: self.target(target, depth + 1)
    def node_AugAssign(self, node, depth): self.target(node.target, depth + 1); self.expr(node.value, depth + 1)
    def node_Expr(self, node, depth): self.expr(node.value, depth + 1)
    def node_If(self, node, depth): self.expr(node.test, depth + 1); self.block(node.body, depth); self.block(node.orelse, depth)
    def node_While(self, node, depth): self.expr(node.test, depth + 1); self.block(node.body, depth); self.block(node.orelse, depth)
    def node_For(self, node, depth): self.target(node.target, depth + 1); self.expr(node.iter, depth + 1); self.block(node.body, depth); self.block(node.orelse, depth)
    def node_With(self, node, depth):
        for item in node.items:
            if not isinstance(item.context_expr, ast.Call) or not isinstance(item.context_expr.func, ast.Name) or item.context_expr.func.id != "open": raise Refusal()
            self.call(item.context_expr, depth + 1)
            if item.optional_vars: self.target(item.optional_vars, depth + 1)
        self.block(node.body, depth)
    def node_Try(self, node, depth):
        self.block(node.body, depth); self.block(node.orelse, depth); self.block(node.finalbody, depth)
        for handler in node.handlers:
            if handler.type: self.expr(handler.type, depth + 1)
            self.block(handler.body, depth)
    def node_Raise(self, node, depth):
        if node.exc: self.expr(node.exc, depth + 1)
        if node.cause: self.expr(node.cause, depth + 1)
    def node_Break(self, node, depth): pass
    def node_Continue(self, node, depth): pass
    def node_Pass(self, node, depth): pass
    def node_Return(self, node, depth):
        if node.value: self.expr(node.value, depth + 1)
    def node_FunctionDef(self, node, depth):
        if (node.decorator_list or node.returns or getattr(node, "type_params", None)
                or node.args.defaults or any(value is not None for value in node.args.kw_defaults)
                or node.args.vararg or node.args.kwarg): raise Refusal()
        self.block(node.body, depth)

    def target(self, node, depth):
        if isinstance(node, ast.Name):
            self.binding(node.id)
        elif isinstance(node, (ast.Tuple, ast.List)):
            for elt in node.elts: self.target(elt, depth + 1)
        elif isinstance(node, ast.Subscript): self.expr(node.value, depth + 1); self.expr(node.slice, depth + 1)
        else: raise Refusal()

    def attribute(self, node, depth, called=False):
        parts = []
        root = node
        while isinstance(root, ast.Attribute):
            parts.append(root.attr)
            root = root.value
        if isinstance(root, ast.Name) and root.id in IMPORTS:
            path = (root.id, *reversed(parts))
            allowed = MODULE_CALLS if called else {("datetime", "timezone", "utc"), ("json", "JSONDecodeError")}
            if path not in allowed: raise Refusal()
            return ".".join(path)
        # type() is not a general constructor/reflection primitive. Its ONLY
        # admitted occurrence produces a metadata string, never a class object.
        if (not called and node.attr == "__name__" and isinstance(node.value, ast.Call)
                and isinstance(node.value.func, ast.Name) and node.value.func.id == "type"
                and len(node.value.args) == 1 and not node.value.keywords):
            self.expr(node.value.args[0], depth + 1)
            return "__name__"
        if node.attr not in (METHODS if called else METADATA): raise Refusal()
        self.expr(node.value, depth + 1)
        return node.attr

    def expr(self, node, depth):
        if isinstance(node, ast.Constant): return
        if isinstance(node, ast.Name):
            # Modules/callables cannot escape into data aliases. Constructor and
            # exception types are harmless data (e.g. isinstance's second arg);
            # arbitrary calls through those data values are still forbidden.
            if (node.id.startswith("_") or node.id in self.functions
                    or node.id in PROTECTED - CONSTRUCTORS - EXCEPTIONS): raise Refusal()
            return
        if isinstance(node, ast.Attribute): return self.attribute(node, depth + 1)
        if isinstance(node, ast.Call): return self.call(node, depth + 1)
        if isinstance(node, (ast.List, ast.Tuple, ast.Set)):
            for elt in node.elts: self.expr(elt, depth + 1)
            return
        if isinstance(node, ast.Dict):
            for key, value in zip(node.keys, node.values):
                if key is None: raise Refusal()
                self.expr(key, depth + 1)
                self.expr(value, depth + 1)
            return
        if isinstance(node, ast.BinOp): self.expr(node.left, depth + 1); self.expr(node.right, depth + 1); return
        if isinstance(node, ast.UnaryOp): self.expr(node.operand, depth + 1); return
        if isinstance(node, ast.BoolOp):
            for value in node.values: self.expr(value, depth + 1)
            return
        if isinstance(node, ast.Compare):
            self.expr(node.left, depth + 1)
            for value in node.comparators: self.expr(value, depth + 1)
            return
        if isinstance(node, ast.Subscript): self.expr(node.value, depth + 1); self.expr(node.slice, depth + 1); return
        if isinstance(node, ast.Slice):
            for value in (node.lower, node.upper, node.step):
                if value: self.expr(value, depth + 1)
            return
        if isinstance(node, (ast.ListComp, ast.DictComp, ast.SetComp, ast.GeneratorExp)):
            self.expr(node.elt if hasattr(node, "elt") else node.key, depth + 1)
            if isinstance(node, ast.DictComp): self.expr(node.value, depth + 1)
            for generator in node.generators:
                if generator.is_async: raise Refusal()
                self.target(generator.target, depth + 1); self.expr(generator.iter, depth + 1)
                for condition in generator.ifs: self.expr(condition, depth + 1)
            return
        raise Refusal()

    def call(self, node, depth):
        function = node.func
        if isinstance(function, ast.Name):
            name = function.id
            if function.id == "open":
                if not node.args: raise Refusal()
                if len(node.args) > 2 or node.keywords: raise Refusal()
                if len(node.args) == 2 and (not isinstance(node.args[1], ast.Constant) or node.args[1].value not in {"r", "rb", "rt"}): raise Refusal()
            elif function.id not in BUILTINS | EXCEPTIONS | self.functions: raise Refusal()
        elif isinstance(function, ast.Attribute):
            name = self.attribute(function, depth + 1, called=True)
        else: raise Refusal()
        for argument in node.args: self.expr(argument, depth + 1)
        for keyword in node.keywords:
            if keyword.arg is None: raise Refusal()
            if name not in {"dict", "collections.Counter", "update"} | self.functions and keyword.arg not in KEYWORDS.get(name, set()):
                raise Refusal()
            if name in {"sorted", "min", "max"} and keyword.arg == "key":
                value = keyword.value
                if isinstance(value, ast.Constant) and value.value is None: continue
                if not isinstance(value, ast.Name) or value.id not in self.functions | CONSTRUCTORS: raise Refusal()
            else:
                self.expr(keyword.value, depth + 1)

def result(status, reason):
    sys.stdout.write(json.dumps({"status": status, "reason": reason}))

try:
    source = sys.stdin.buffer.read(65537)
    if len(source) > 65536: result("unsafe", "input-too-large")
    else:
        try:
            tree = ast.parse(source, mode="exec")
            Validator().validate(tree)
            result("safe", "ok")
        except ResourceLimit: result("unsafe", "resource-limit")
        except (SyntaxError, Refusal, ValueError, TypeError): result("unsafe", "restricted-syntax")
except Exception:
    result("unsafe", "checker-error")
