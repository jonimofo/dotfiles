# Code rules

## Best practices by default

- Match the repo: run its linter and formatter, follow its structure, naming and comment density.
- Standard library or framework builtin first. Ansible: `ansible.builtin.*` modules, never `shell`
  or `command` when a module exists. Shell: explicit `if ... then ... fi`, not `&&` chains.
- Small functions, explicit names, no dead code. Delete dead code you find during an audit.
- Descriptive names for features, folders and configs (technology or role), never `V2`, `New`, `Old`.
- Every change ships with its tests when the repo has a test suite. Tests run, output quoted.
- Documentation lives next to the code it describes and is updated in the same change.

## Clean code

- No hardcoded values: colors, spacing, URLs, ports, paths, limits, magic numbers and user-facing
  strings live in config, env, constants, design tokens or translation files. One place, one name.
- Reusable first: search for an existing component, helper or composable before writing one.
  A pattern written twice is extracted into one shared element, with the two call sites updated.
- Readable design: small units with one job, explicit names, early returns, no nesting deeper
  than three levels, consistent file layout within a feature.
- Every bug fix ships a regression test. Every new convention gets an automated check where
  possible (audit test, lint rule), so only what cannot be automated stays in the LLM audit.
- Propose rules: at the end of a feature or an audit, list up to 3 recurring patterns that should
  become a project rule, an automated check or a shared element. The user decides.

## New dependencies: flag and justify, the user decides

Before adding any package, library, plugin or external tool:

1. Say why the builtin or an existing dependency is not enough.
2. Name the mainstream, maintained candidate and one alternative.
3. Wait for the OK. This includes dev tooling.

## Security by default

- Validate and type every input at the boundary. Authorize on the server, never only in the UI.
- Secrets never in code, commits, logs or chat. `.env` files are edited by the user: give file, line
  and exact content to paste.
- Least privilege: minimal permissions, minimal exposed ports, bind to the private interface.
- Parameterized queries only. No string-built SQL, no shell string interpolation of user data.
- Pin versions of images and packages; prefer official images.
- Production data: read-only by default. Any write to a production system needs an explicit request
  in the current session. Heavy queries: `COUNT` first, always a `LIMIT`.
- When two approaches exist, take the more secure one and say so. Ask before a change that
  weakens a security setting.

## Errors, performance, idempotency

- No silent catch. A failure surfaces with context: what was attempted, which record, which input.
  Background jobs log start, end and failure. User-facing errors say what to do; technical detail
  stays in the logs, never personal data.
- No N+1: eager load and verify with the query log. Lists are paginated or limited by default.
  Columns used in filters and sorts are indexed. Heavy work runs in queued jobs, not in requests.
- Scripts, seeders, migrations, Ansible tasks and install steps are safe to run twice and report
  "unchanged" when nothing changed.
- Shell under `set -o pipefail`: never test `cmd | grep -q` or `cmd | head` directly in a condition.
  The early exit sends SIGPIPE to `cmd` and the test reads as "no match". Capture the output in a
  variable first, then test the variable.
- A script with several irreversible remote steps (merge, tag push, release, mirror) records what is
  done and, on failure, prints the exact remaining commands so the run can be completed by hand.

## Data and schema

- Never modify an applied migration when the database has real data: write a new one.
- Schema changes stay in migrations; data population belongs to idempotent seeders or scripts.
- Before writing code that reads a field, confirm the field is actually produced by the backend.
- Diagnose "table or column not found" against the live schema before calling it a code bug.
