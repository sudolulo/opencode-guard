import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MAX_SOURCE_BYTES = 64 * 1024;
const HELPER = fileURLToPath(new URL("./python-source-check.py", import.meta.url));
const UNSAFE_REASONS = new Set(["input-too-large", "restricted-syntax", "resource-limit", "checker-error"]);

// This invokes only the bundled AST validator.  It never evaluates the supplied source.
export const checkPythonSource = (source) => {
  if (typeof source !== "string") return { status: "unsafe", reason: "invalid-input" };
  if (Buffer.byteLength(source, "utf8") > MAX_SOURCE_BYTES) return { status: "unsafe", reason: "input-too-large" };
  let child;
  try {
    child = spawnSync("python3", ["-I", "-S", "-B", HELPER], {
      input: source,
      encoding: "utf8",
      timeout: 2_000,
      maxBuffer: 4 * 1024,
      shell: false,
    });
  } catch {
    return { status: "unavailable", reason: "checker-spawn-failed" };
  }
  if (child.error?.code === "ETIMEDOUT") return { status: "unavailable", reason: "checker-timeout" };
  if (child.error) return { status: "unavailable", reason: "checker-unavailable" };
  if (child.status !== 0 || !child.stdout || child.stderr) return { status: "unavailable", reason: "checker-protocol-failed" };
  try {
    const result = JSON.parse(child.stdout);
    if (result && !Array.isArray(result) && Object.keys(result).length === 2) {
      if (result.status === "safe" && result.reason === "ok") return { status: "safe", reason: "ok" };
      if (result.status === "unsafe" && UNSAFE_REASONS.has(result.reason)) return { status: "unsafe", reason: result.reason };
    }
  } catch {
    return { status: "unavailable", reason: "checker-protocol-failed" };
  }
  return { status: "unavailable", reason: "checker-protocol-failed" };
};
