# Contributing

Issues and pull requests are welcome.

- Run `npm install` and `npm test` (Node 20 or 22). The tests need no opencode
  install and no network; they run against a throwaway `HOME`.
- Decision logic belongs in `lib/`, where it can be tested. `plugin.js` may export
  exactly one function: opencode calls every export of a plugin module as a plugin
  and silently drops the module if one is not a function.
- A change to what is allowed or refused needs a test that shows both sides: the
  command that should pass and the one that must not.
- Keep the fail-closed direction. When something cannot be judged, the answer is a
  prompt or a refusal, never an allow.
- Add a line to `CHANGELOG.md` under an `Unreleased` heading.

Security problems go to the address in `SECURITY.md`, not to an issue.
