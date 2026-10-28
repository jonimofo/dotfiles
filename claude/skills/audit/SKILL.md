---
name: audit
description: Full audit of the latest changes (security, architecture, UI, tests, lints), report written to the scratchpad. Triggered by /audit or by the user typing "rdoc".
---

# Audit the latest changes

1. **Load context.** Read the project `CLAUDE.md`, `.claude/rules/`, and the project documentation
   folder if one exists (`documentation-claude/`, `docs/`, `DOCS/`). If the project has its own
   audit prompts (for example `prompts/`), run those instead of the generic list below.
2. **Scope.** Changes since the last audit report, or since the last release tag or merge to `main`
   if none. Ask if the scope is unclear.
3. **Audit**, each as a separate pass:
   - Security: authorization, input validation, secrets, exposed ports, SQL and shell injection.
   - Architecture: conventions of the repo, duplication, dead code, invented names.
   - UI (if any): project design tokens, layout rules, responsive targets.
   - Tests and lints: run them, `tee` the output to the scratchpad, read the failures.
   - Docs: documentation updated with the change.
4. **Report** to `<scratchpad>/audit-<YYYYMMDD>.md`: findings ranked HIGH, MEDIUM, LOW, each with
   file and line, failure scenario, and fix. Never in the repo root.
5. **Fix** the HIGH findings only after the user validates the report. Recurrent patterns become
   anti-pattern entries in the project documentation.
