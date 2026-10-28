# Where files go, and what is versioned

Never write in the repo root. The project `CLAUDE.md` names its docs folder; without one, ask.

| Kind | Where | Git |
|---|---|---|
| Scratch, intermediate outputs, test logs (`tee`), audit and smoke reports | session scratchpad, else `/tmp` | no |
| Action plan or design for a feature, with its ASCII mockups | `<project docs>/plans/YYYY-MM-DD-<topic>.md`, status line on top: `DRAFT`, `VALIDATED`, `DONE` | yes, in the feature PR |
| Lasting decisions, specs, runbooks | `<project docs>/*.md` (ARCHITECTURE, UI, FEATURE...) | yes |
| Screenshots, rendered mockups | `<project docs>/design/` only when the user keeps them, else scratchpad | yes if kept |
| Local notes (`todo.txt`, `TEMP/`) | gitignored | no |
| Claude memory | `~/.claude/projects/<project>/memory/` | no, machine-local |
| Global rules, skills, templates | `~/Repos/dotfiles/claude/` | yes, dotfiles |

- A plan is written when the design is validated, updated to `DONE` in the PR that ships it,
  and kept afterwards: it is the record of why.
- A report the user must act on is also summarised in chat; the file is the full version.
- Secrets, personal data and production dumps never land in any of these places.
