#!/usr/bin/env bash
# Link the Claude Code config from this repo into ~/.claude and merge settings.json.
# Usage: bash install.sh [--check|-n]
set -euo pipefail

src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
claude_dir="$HOME/.claude"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$claude_dir/backups/$stamp"
check=0
changes=0

if [[ $# -gt 0 ]]; then
    if [[ "$1" == "--check" || "$1" == "-n" ]]; then
        check=1
    else
        echo "usage: $0 [--check|-n]" >&2
        exit 2
    fi
fi

say() {
    printf '%s\n' "$*"
}

backup_path() {
    # Move a real file or directory into the timestamped backup dir.
    local path="$1"
    mkdir -p "$backup_dir"
    mv "$path" "$backup_dir/$(basename "$path")"
    say "  backed up $path -> $backup_dir/"
}

link() {
    local target="$1"
    local dest="$2"
    if [[ -L "$dest" ]]; then
        local current
        current="$(readlink "$dest")"
        if [[ "$current" == "$target" ]]; then
            say "ok        $dest"
            return 0
        fi
        changes=1
        say "relink    $dest (was -> $current)"
        if [[ $check -eq 0 ]]; then
            rm "$dest"
            ln -s "$target" "$dest"
        fi
        return 0
    fi
    changes=1
    if [[ -e "$dest" ]]; then
        say "replace   $dest -> $target"
        if [[ $check -eq 0 ]]; then
            backup_path "$dest"
        fi
    else
        say "link      $dest -> $target"
    fi
    if [[ $check -eq 0 ]]; then
        mkdir -p "$(dirname "$dest")"
        ln -s "$target" "$dest"
    fi
}

retire_command() {
    local path="$claude_dir/commands/$1"
    if [[ -e "$path" || -L "$path" ]]; then
        changes=1
        say "retire    $path (superseded by skill)"
        if [[ $check -eq 0 ]]; then
            backup_path "$path"
        fi
    fi
}

merge_settings() {
    local live="$claude_dir/settings.json"
    local template="$src_dir/settings.json"
    local merged
    merged="$(mktemp)"
    python3 -I - "$template" "$live" "$merged" <<'PYEOF'
import json
import os
import sys

template_path, live_path, out_path = sys.argv[1:4]


def merge(base, over):
    for key, value in over.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            merge(base[key], value)
        else:
            base[key] = value
    return base


with open(template_path, encoding="utf-8") as f:
    template = json.load(f)
live = {}
if os.path.exists(live_path):
    with open(live_path, encoding="utf-8") as f:
        live = json.load(f)
result = merge(live, template)
with open(out_path, "w", encoding="utf-8") as f:
    f.write(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
PYEOF
    if [[ -f "$live" ]]; then
        if cmp -s "$merged" "$live"; then
            say "unchanged $live"
            rm -f "$merged"
            return 0
        fi
    fi
    changes=1
    say "merge     $live <- $template"
    if [[ $check -eq 1 ]]; then
        rm -f "$merged"
        return 0
    fi
    mkdir -p "$claude_dir/backups"
    if [[ -f "$live" ]]; then
        cp -p "$live" "$claude_dir/backups/settings.json.$stamp.bak"
        say "  backed up $live -> $claude_dir/backups/settings.json.$stamp.bak"
    fi
    cat "$merged" > "$live.tmp"
    chmod 600 "$live.tmp"
    mv "$live.tmp" "$live"
    rm -f "$merged"
}

main() {
    if [[ $check -eq 1 ]]; then
        say "dry run: nothing will be changed"
    fi
    if [[ $check -eq 0 ]]; then
        mkdir -p "$claude_dir/skills"
    fi
    link "$src_dir/CLAUDE.md" "$claude_dir/CLAUDE.md"
    link "$src_dir/rules" "$claude_dir/rules"
    link "$src_dir/templates" "$claude_dir/templates"
    link "$src_dir/statusline-command.sh" "$claude_dir/statusline-command.sh"
    local skill
    for skill in "$src_dir"/skills/*/; do
        skill="${skill%/}"
        link "$skill" "$claude_dir/skills/$(basename "$skill")"
    done
    retire_command "design-first.md"
    retire_command "step-by-step.md"
    merge_settings
    if [[ $check -eq 1 ]]; then
        if [[ $changes -eq 1 ]]; then
            exit 1
        fi
    fi
}

main
