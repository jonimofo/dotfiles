# Global instructions (all projects)

Source of truth: `~/Repos/dotfiles/claude/`. Edit there, never in `~/.claude/` (symlinks).
Rules in `rules/` load automatically in every project; this file only states what they do not.

## Who you work with

- Solo developer, ADHD reader. Output rules in `rules/40-output.md` are not optional.
- Reply in the language the user writes. In French, always use vouvoiement.
- Projects: Laravel/Vue/Tailwind apps (Docker, Makefile), Ansible/Debian infra, SAP B1 SQL, Hugo, Slidev.
- Default workflow: design and validate first, then execute one step per screen (`rules/10-workflow.md`).

## Precedence

1. Project `CLAUDE.md` and `.claude/rules/` override these global rules on the same topic.
2. A repo without `CLAUDE.md`: offer once to create it from `~/.claude/templates/CLAUDE.project.md`.
3. These rules never justify a destructive or irreversible action without explicit approval.

## Hard limits (learned from incidents)

- Quote every heredoc delimiter (`<<'EOF'`). An unquoted one executed backticks against production.
- Never run `resolvectl status` (crashed the machine).
- Never invent a column, table, route, config key or API name. Read it or ask.
- Never create files or keys in `$HOME` outside the repo or scratchpad without asking.
- Deploys are run by the user. Give the command, wait for the result.
