# opencode-guard state contract

Files other products may read. Guard is the only writer of its own logs. The mode files are written by the TUI integration (per session) and `oc-mode` (global).

## Permission mode

| Path | Content | Writer |
|---|---|---|
| `~/.local/share/opencode/modes/<sessionID>` | Plain text: `manual`, `edits`, `auto`, or `god` | TUI integration (F9), per session |
| `~/.config/opencode/mode` | Plain text: `manual`, `edits`, or `auto`; a hand-written `god` reads as `auto` | `oc-mode` |

`normalizeMode` trims and lowercases a value, returning `manual` for any value other than `manual`, `edits`, `auto`, or `god`. `normalizeGlobalMode` applies the same rule, then caps `god` to `auto`.

Resolution in `plugin.js` is:

1. If the per-session mode file can be read, use `normalizeMode` on its content.
2. If that read fails for any reason, `sessionMode` returns no per-session value. A delegated child then inherits its parent's resolved mode through `normalizeGlobalMode`, so inherited `god` is `auto`.
3. Otherwise, use `globalMode`: it reads the global file through `normalizeGlobalMode`; a missing or unreadable global file resolves to `manual`.

For root sessions, step 2 falls directly to the global mode. The guard intentionally treats an unreadable per-session file as no per-session value; consumers needing a security boundary must define and document their own error handling rather than assuming guard's fallback is fail-closed.

Rank, from most restrictive to most permissive: `manual < edits < auto < god`.

An unattended session (`opencode run`, `opencode serve`, `opencode acp`, `opencode github`, `opencode export`, `opencode import`, or `--auto`) keeps the safety floor regardless of mode-file content. Consumers comparing modes still read the stored mode value.

## Consumers

- opencode-peers reads these files to refuse a message to a peer in a more permissive mode. Its resolver accepts only `ENOENT` as absent and refuses operations when another read error occurs. Changing this layout or these normalization rules is a breaking change for that consumer.
