# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a personal dotfiles repository for a Linux workstation (Debian-based). It contains configuration files for shell, editors, terminal emulators, and various development tools.

## Repository Structure

- **Shell configs**: `.bashrc`, `.bash_aliases`, `.bash_functions`, `.inputrc`
- **Git**: `.gitconfig`, `.git-completion.bash`
- **Editors**: `.vimrc`, `init.vim` (neovim), `code/` (VS Code), `subl/` (Sublime Text)
- **Terminal**: `terminator_config`, `.tmux.conf`, `guake/`
- **Desktop/GNOME**: `gnome/` (dconf backups), `autostart/`, `.xbindkeysrc`
- **App configs**: `espanso/` (text expansion), `rofi/` (launcher), `flameshot.ini`
- **SSH**: `ssh/config`
- **Scripts**: `scripts/`
- **Claude Code**: `claude/` (global `CLAUDE.md`, `rules/`, `skills/`, `templates/`, settings template, `install.sh`; see `claude/README.md`)

## Key Conventions

### Shell Aliases
The `.bash_aliases` file uses modern CLI replacements:
- `eza` instead of `ls`
- `batcat` instead of `cat`
- `fdfind` instead of `find`
- `nvim` instead of `vim`
- `trash-put` instead of `rm`

### Backup/Restore Commands

**GNOME settings:**
```bash
dconf dump / > gnome_full_backup.dconf   # backup
dconf load / < gnome_full_backup.dconf   # restore
```

**Guake terminal:**
```bash
guake --save-preferences=guake.config    # backup
guake --restore-preferences=guake.config # restore
```

### Espanso Text Expansion
Text expansion configs in `espanso/` are organized by context: `base.yml` (general), `hugo.yml` (blog), `laravel.yml`, `sap.yml`.

## Git Commits

Follow `CONTRIBUTING.md` (branch model, PRs, merge strategy, hooks). In short:

- Never commit or push directly on `main`/`develop`: branch `<type>/<topic>` from `develop`, PR to `develop` (squash), then `develop → main` (merge commit) and `git push gitlab main`
- Follow Angular commit convention: `type(scope): description`, subject under 72 characters, imperative mood
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- Never include "Co-Authored-By" lines or any mention of Claude/AI in commits or PRs

## Deployment Notes

Files are typically symlinked from this repo to their expected locations (e.g., `~/.bashrc`, `~/.tmux.conf`). The `rsync_xps.sh` script provides a template for directory synchronization but requires customization of `DEST` and `SOURCES` paths.
