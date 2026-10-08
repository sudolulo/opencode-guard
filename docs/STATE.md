# opencode-guard state contract

Files other products may read. Guard is the only writer of its own logs. The mode files are written by the TUI integration (per session) and `oc-mode` (global).

## Permission mode

| Path | Content | Writer |
|---|---|---|
| `~/.local/share/opencode/modes/<sessionID>` | Plain text: `manual`, `edits`, `auto`, or `god` | TUI integration (F9), per session |
| `~/.config/opencode/mode` | Plain text: `manual`, `edits`, or `auto`; a hand-written `god` reads as `auto` | `oc-mode` |

`normalizeMode` trims and lowercases a value, returning `manual` for any value other than `manual`, `edits`, `auto`, or `god`. `normalizeGlobalMode` applies the same rule, then caps `god` to `auto`.

Resolution in `plugin.js` (`modeFor`, with `resolveTreeMode` in `lib/policy.js`) is:

1. If the per-session mode file can be read, use `normalizeMode` on its content. Nothing else is read.
2. If that read fails for any reason, `sessionMode` returns no per-session value, and the session's ancestry is read from the opencode server (`session.get` per ancestor through the plugin's client; each parent link is cached for the life of the process, because `parentID` never changes). For a session with a parent (a delegated child), two candidates are formed, each through `normalizeGlobalMode`, so an inherited `god` is `auto` in both:
   - (a) the immediate parent's mode file, else the global mode (the whole rule before 1.7.0);
   - (b) the nearest ancestor that has a mode file, else the global mode.

   The session runs under the stricter of (a) and (b) by the rank below (rule G3, since 1.7.0). A direct child's immediate parent is also its nearest ancestor, so (a) and (b) agree and a direct child resolves exactly as before. The result differs only at depth 2 and deeper, when an intermediate session has no file of its own, and it is never more permissive than (a).
3. Otherwise (a root with no file of its own), use `globalMode`: it reads the global file through `normalizeGlobalMode`; a missing or unreadable global file resolves to `manual`.

If the ancestry in step 2 cannot be read (a failed `session.get`, an ancestor that no longer exists, a loop, or a chain deeper than 16 sessions), no mode is resolved: a tool call is denied with an error naming G3, and a permission prompt is left for the person, as in `manual`. Before 1.7.0 such a session fell to the global mode, which could be more permissive than its ancestors.

For root sessions the result is unchanged by 1.7.0: step 2 reads the session, finds no parent and falls to the global mode (if that read fails, the denial above applies). The guard intentionally treats an unreadable per-session file as no per-session value; consumers needing a security boundary must define and document their own error handling rather than assuming guard's fallback is fail-closed.

Tree rules G1, G2 and G4 (since 1.7.0) are not part of mode resolution, but other products may rely on their outcome:

- G4 is decided by the session just below the root on the caller's path: the oldest `task` part in the root's history naming that session, with `state.input.background === true` meaning "in a team". When no such part exists (for example a child that opencode-agent-workflows creates through the SDK for a workflow step), the caller is treated as possibly in a team and is refused `workflow_run`, `peer_*`, `schedule_*`, `bg_watch`, `bg_unwatch` and any `bg_*` call with `all: true`, with a refusal that says retrying will not help. This is deliberate fail-closed: a teammate's creating part can disappear from the root's history (a revert removes it), and a missing part must never read as "not a teammate". A workflow child started from a foreground subagent is classified by that subagent's foreground part and keeps these tools.
- At level `off` the guard skips G1, G2 and G4, like its other pre-run checks; the teammate index is still fed from events at every level.

Rank, from most restrictive to most permissive: `manual < edits < auto < god`.

An unattended session (`opencode run`, `opencode serve`, `opencode acp`, `opencode github`, `opencode export`, `opencode import`, or `--auto`) keeps the safety floor regardless of mode-file content. Consumers comparing modes still read the stored mode value.

## Consumers

- opencode-peers reads these files to refuse a message to a peer in a more permissive mode. Its resolver accepts only `ENOENT` as absent and refuses operations when another read error occurs. Changing this layout or these normalization rules is a breaking change for that consumer. 1.7.0 changed step 2 only, which applies to sessions with a parent; opencode-peers registers and sends from root sessions only, so its reading is unaffected.
