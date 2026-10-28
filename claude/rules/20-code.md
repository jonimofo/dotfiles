# Code rules

## Best practices by default

- Match the repo: run its linter and formatter, follow its structure, naming and comment density.
- Standard library or framework builtin first. Ansible: `ansible.builtin.*` modules, never `shell`
  or `command` when a module exists. Shell: explicit `if ... then ... fi`, not `&&` chains.
- Small functions, explicit names, no dead code. Delete dead code you find during an audit.
- Descriptive names for features, folders and configs (technology or role), never `V2`, `New`, `Old`.
- Every change ships with its tests when the repo has a test suite. Tests run, output quoted.
- Documentation lives next to the code it describes and is updated in the same change.

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

## Data and schema

- Never modify an applied migration when the database has real data: write a new one.
- Schema changes stay in migrations; data population belongs to idempotent seeders or scripts.
- Before writing code that reads a field, confirm the field is actually produced by the backend.
- Diagnose "table or column not found" against the live schema before calling it a code bug.
