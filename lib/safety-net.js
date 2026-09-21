// Loading cc-safety-net, the static analyzer that forms the first tier of the
// shell floor. Shared by the plugin and `oc-check`, so the dry run judges with the
// same copy the live plugin uses.
//
// This package's own dependency comes first: it is the version the tests ran
// against. A copy installed into opencode's config directory is the fallback, for
// a checkout that is symlinked into ~/.config/opencode/plugin/ without an
// `npm install` of its own. When neither loads, the caller gets null and the
// reason, and the rest of the floor keeps standing.
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const HOST_SAFETY_NET = () =>
  join(homedir(), ".config/opencode/node_modules/cc-safety-net/dist/api.js");

export const loadSafetyNet = async () => {
  try {
    const { checkCommand } = await import("cc-safety-net/api");
    if (typeof checkCommand === "function") return { checkCommand, source: "package", error: null };
    throw new Error("cc-safety-net/api has no checkCommand export");
  } catch (packageError) {
    try {
      const { checkCommand } = await import(pathToFileURL(HOST_SAFETY_NET()).href);
      if (typeof checkCommand === "function") return { checkCommand, source: "host", error: null };
      throw new Error("host cc-safety-net has no checkCommand export");
    } catch {
      return { checkCommand: null, source: null, error: packageError };
    }
  }
};

// One verdict, in the shape the plugin acts on. cc-safety-net's contract is that a
// throw means "do not run the command", so a throw is a denial here, not a skip.
export const safetyNetVerdict = (checkCommand, { command, cwd }) => {
  if (typeof checkCommand !== "function") return { kind: "unavailable" };
  try {
    const verdict = checkCommand({ command, cwd });
    if (verdict?.kind === "deny") {
      return { kind: "deny", reason: verdict.reason ?? "dangerous command", ruleId: verdict.ruleId ?? null };
    }
    return { kind: "allow" };
  } catch (error) {
    return {
      kind: "deny",
      reason: `cc-safety-net could not analyze this command (${String(error?.message ?? error)})`,
      ruleId: "analysis-error",
    };
  }
};
