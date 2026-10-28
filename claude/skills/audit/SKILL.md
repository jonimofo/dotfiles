---
name: audit
description: Audit code changes (security, architecture, clean code, UI, tests, lints), report written to the scratchpad. Default scope is the current branch's diff; "full" audits everything before a release. Triggered by /audit, /audit full, or the user typing "rdoc".
---

# Audit

Two modes. `diff` is the default and runs before every merge to `develop`. `full` runs before a
release (`/release` calls it) or when the user asks for it.

## 1. Load context

Read the project `CLAUDE.md`, `.claude/rules/`, and the project documentation folder if one
exists (`documentation-claude/`, `docs/`, `DOCS/`). If the project has its own audit prompts
(for example `prompts/global_audit.md` and the focused `audit_*.md` files), use their checklists
and their resolved-items file instead of the generic list below. Never re-flag a resolved item.

## 2. Scope

- `diff` (default): files changed on the current branch versus its base (`develop`, else `main`):
  `git diff --name-only <base>...HEAD`. Project prompts that say "scan every file in scope" are
  restricted to these files in this mode.
- `full`: every file in the scope of each checklist, as the prompts define it.
- Ask if the base branch or the scope is unclear.

## 3. Passes, each separate, each delegated to an Opus agent when the session runs on Fable

1. Security: authorization, input validation, secrets, exposed ports, SQL and shell injection.
2. Architecture and clean code: repo conventions, duplication, reusable elements not reused,
   hardcoded values (colors, spacing, URLs, ports, paths, magic numbers, user-facing strings),
   dead code, invented names, readability.
3. UI (if any): project design tokens, layout rules, responsive targets.
4. Tests: run the full suites the project has (for example `make test` for Pest, `make test-js`
   for vitest), lints and type checks (`vue-tsc`, Pint, eslint). `tee` every output to the
   scratchpad, read the failures. Missing regression test for a fixed bug is a finding.
5. Docs: documentation updated with the change.

## 4. Report

`<scratchpad>/audit-<YYYYMMDD>-<diff|full>.md`: findings ranked HIGH, MEDIUM, LOW, each with file
and line, failure scenario, fix, and effort (S under 30 min, M 1 to 2 h, L half a day). Never in
the repo root. End with **Proposed rules**: up to 3 recurring patterns that should become a rule
(project `CLAUDE.md`), an automated check (audit test, lint rule) or a resolved-item entry.

## 5. Fix

HIGH findings are fixed only after the user validates the report. In `diff` mode a PR is not merged
while a HIGH is open. Recurrent patterns become anti-pattern entries in the project documentation
or an automated test, so the LLM audit only keeps what cannot be automated.
