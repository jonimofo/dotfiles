# claude/

My Claude Code config, versioned. `install.sh` links it into `~/.claude`.

## What lives here

- `CLAUDE.md` and `rules/`: global instructions
- `skills/`: my skills (audit, commit, design-first, release, step-by-step)
- `templates/CLAUDE.project.md`: starting point for a project `CLAUDE.md`
- `settings.json`: shared settings, merged into `~/.claude/settings.json`
- `statusline-command.sh`: the status line

## How it reaches ~/.claude

1. Symlinks: `CLAUDE.md`, `rules`, `templates`, `statusline-command.sh`.
2. One symlink per skill in `~/.claude/skills/` (`skills/synced/` is left alone).
3. `settings.json` is merged, never linked (see below).
4. Anything replaced goes to `~/.claude/backups/<YYYYMMDD-HHMMSS>/`.

## Laptop setup

1. `git clone <repo> ~/Repos/dotfiles`
2. `bash ~/Repos/dotfiles/claude/install.sh`
3. Missing plugins? In `claude`:
   - `/plugin marketplace add ayghri/i-have-adhd`
   - `/plugin install i-have-adhd@i-have-adhd`
   - `/plugin install playwright@claude-plugins-official`
4. Restart `claude`.

## Editing rules

- Edit in the repo, never in `~/.claude` (it's links, but stay in the repo anyway).
- New skill: add `skills/<name>/SKILL.md`, re-run `install.sh`.

## settings.json merge

- Template keys win; nested objects merge key by key.
- Keys absent from the template are kept as is.
- Machine-local, never in the template: `autoMode`, `hooks`, `permissions`.
- A backup `~/.claude/backups/settings.json.<stamp>.bak` is written before any change.
- Written only if the result differs ("unchanged" otherwise).

## Dry run

`bash install.sh --check` (or `-n`): prints what would change, changes nothing.
Exit 0 = nothing to do, exit 1 = something would change.
