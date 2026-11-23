#!/usr/bin/env bash
# Give Thunderbird and Firefox profiles the Dracula window buttons: link the versioned
# userChrome.css and the theme assets into <profile>/chrome/ and enable userChrome.css.
# Usage: cinnamon/theme/install.sh [--check|-n] <profile-dir>...
set -euo pipefail

src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR="$src_dir"
readonly STYLESHEET="$SRC_DIR/userChrome.css"
readonly DEFAULT_ASSETS_DIR="$HOME/.themes/Dracula/assets"
readonly ASSETS_DIR="${DRACULA_ASSETS_DIR:-$DEFAULT_ASSETS_DIR}"
readonly ASSETS_LINK_NAME="dracula-assets"
readonly PREF_LINE='user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'
readonly PREF_COMMENT='// Load chrome/userChrome.css (Dracula window buttons, dotfiles cinnamon/theme).'
stamp="$(date +%Y%m%d-%H%M%S)"
readonly STAMP="$stamp"
check=0
changes=0

say() {
    printf '%s\n' "$*"
}

usage() {
    say "usage: $0 [--check|-n] <profile-dir>..." >&2
    exit 2
}

fail() {
    say "error: $*" >&2
    exit 1
}

backup_path() {
    # Keep a real file next to where it was, under a timestamped name.
    local path="$1"
    local backup="$path.$STAMP.bak"
    mv "$path" "$backup"
    say "  backed up $path -> $backup"
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

has_pref_line() {
    local user_js="$1"
    if [[ ! -f "$user_js" ]]; then
        return 1
    fi
    local line
    while IFS= read -r line || [[ -n "$line" ]]; do
        if [[ "$line" == "$PREF_LINE" ]]; then
            return 0
        fi
    done < "$user_js"
    return 1
}

ensure_pref() {
    local user_js="$1"
    if has_pref_line "$user_js"; then
        say "ok        $user_js"
        return 0
    fi
    changes=1
    say "pref      $user_js += toolkit.legacyUserProfileCustomizations.stylesheets"
    if [[ $check -eq 1 ]]; then
        return 0
    fi
    if [[ -s "$user_js" ]]; then
        local last_char
        last_char="$(tail -c 1 "$user_js")"
        if [[ -n "$last_char" ]]; then
            printf '\n' >> "$user_js"
        fi
    fi
    printf '%s\n%s\n' "$PREF_COMMENT" "$PREF_LINE" >> "$user_js"
}

validate() {
    local profile
    if [[ ! -d "$ASSETS_DIR" ]]; then
        fail "Dracula assets folder not found: $ASSETS_DIR (install the theme, see cinnamon/THEME.md, or set DRACULA_ASSETS_DIR)"
    fi
    for profile in "$@"; do
        if [[ ! -d "$profile" ]]; then
            fail "profile folder not found: $profile"
        fi
    done
}

install_profile() {
    local profile
    profile="$(cd "$1" && pwd)"
    local chrome_dir="$profile/chrome"
    say "profile   $profile"
    link "$STYLESHEET" "$chrome_dir/userChrome.css"
    link "$ASSETS_DIR" "$chrome_dir/$ASSETS_LINK_NAME"
    ensure_pref "$profile/user.js"
}

main() {
    if [[ $# -gt 0 ]]; then
        if [[ "$1" == "--check" || "$1" == "-n" ]]; then
            check=1
            shift
        fi
    fi
    if [[ $# -eq 0 ]]; then
        usage
    fi
    validate "$@"
    if [[ $check -eq 1 ]]; then
        say "dry run: nothing will be changed"
    fi
    local profile
    for profile in "$@"; do
        install_profile "$profile"
    done
    if [[ $check -eq 1 ]]; then
        if [[ $changes -eq 1 ]]; then
            exit 1
        fi
    fi
}

main "$@"
