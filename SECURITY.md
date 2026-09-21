# Security policy

opencode-guard is a safety layer, so a way around it is a security bug even when
nothing is exploited yet: a command that should have been refused and ran, a
credential path the guards miss, a secret that survives redaction, or a way for an
agent to change the guard's own mode, level or reveal window.

## Reporting

Please report privately by email to **holden@ssalomon.com**, not in a public issue.
Include the opencode version, the opencode-guard version, the mode and level in
effect, and the exact tool call or command. `oc-check '<command>'` output is
useful when the report is about a shell command.

You should get an acknowledgement within a week. Fixes are released as a patch
version with a CHANGELOG entry that credits the reporter unless you ask otherwise.

## Scope

The guard is designed to stop a well-meaning agent from doing something harmful by
mistake, and from quietly unblocking itself. It is not a sandbox: a process that
sets out to defeat it on a machine it can already run code on will find a way. The
README's Design section describes what each tier does and does not promise. Reports
that show a tier failing at what it claims are in scope; reports that the guard is
not a sandbox are not.

## Supported versions

Only the latest release receives fixes.
