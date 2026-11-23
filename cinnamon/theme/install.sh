#!/usr/bin/env bash
# Give Thunderbird and Firefox profiles the Dracula window buttons: link the versioned
# userChrome.css and the theme assets into <profile>/chrome/ and enable userChrome.css.
# Usage: cinnamon/theme/install.sh [--check|-n] <profile-dir>...
# Exit codes: 0 done or nothing to do, 1 error or (--check) changes pending, 2 usage.
set -euo pipefail

src_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SRC_DIR="$src_dir"
readonly STYLESHEET="$SRC_DIR/userChrome.css"
readonly DEFAULT_ASSETS_DIR="$HOME/.themes/Dracula/assets"
readonly ASSETS_DIR_SETTING="${DRACULA_ASSETS_DIR:-$DEFAULT_ASSETS_DIR}"
readonly ASSETS_LINK_NAME="dracula-assets"
readonly PREF_LINE='user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'
readonly PREF_COMMENT='// Load chrome/userChrome.css (Dracula window buttons, dotfiles cinnamon/theme).'
stamp="$(date +%Y%m%d-%H%M%S)"
readonly STAMP="$stamp"
check=0
changes=0
assets_dir=""
profiles=()

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
    if ! mv -- "$path" "$backup"; then
        fail "could not back up: $path"
    fi
    say "  backed up $path -> $backup"
}

make_link() {
    local target="$1"
    local dest="$2"
    if ! ln -s -- "$target" "$dest"; then
        fail "could not link: $dest"
    fi
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
            if ! rm -- "$dest"; then
                fail "could not remove link: $dest"
            fi
            make_link "$target" "$dest"
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
        local parent
        parent="$(dirname -- "$dest")"
        if ! mkdir -p -- "$parent"; then
            fail "could not create folder: $parent"
        fi
        make_link "$target" "$dest"
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
        last_char="$(tail -c 1 -- "$user_js")"
        if [[ -n "$last_char" ]]; then
            if ! printf '\n' >> "$user_js"; then
                fail "could not append to: $user_js"
            fi
        fi
    fi
    if ! printf '%s\n%s\n' "$PREF_COMMENT" "$PREF_LINE" >> "$user_js"; then
        fail "could not append to: $user_js"
    fi
}

resolve_assets_dir() {
    if [[ ! -d "$ASSETS_DIR_SETTING" ]]; then
        fail "Dracula assets folder not found: $ASSETS_DIR_SETTING (install the theme, see cinnamon/THEME.md, or set DRACULA_ASSETS_DIR)"
    fi
    # Absolute and without a trailing slash, so the link target is stable between runs.
    assets_dir="$(cd -- "$ASSETS_DIR_SETTING" && pwd)"
}

validate_chrome_dir() {
    local chrome_dir="$1"
    if [[ -L "$chrome_dir" ]]; then
        fail "refusing a symlinked chrome folder: $chrome_dir (replace it with a real folder)"
    fi
    if [[ -e "$chrome_dir" && ! -d "$chrome_dir" ]]; then
        fail "chrome exists and is not a folder: $chrome_dir"
    fi
}

validate_user_js() {
    local user_js="$1"
    if [[ -L "$user_js" ]]; then
        fail "refusing a symlinked user.js: $user_js (replace it with a real file)"
    fi
    if [[ ! -e "$user_js" ]]; then
        return 0
    fi
    if [[ ! -f "$user_js" ]]; then
        fail "user.js exists and is not a regular file: $user_js"
    fi
    if [[ ! -w "$user_js" ]]; then
        fail "user.js is not writable: $user_js"
    fi
}

# Checks every profile before the first write, so a bad one leaves all of them untouched.
validate() {
    local profile
    resolve_assets_dir
    for profile in "$@"; do
        if [[ ! -d "$profile" ]]; then
            fail "profile folder not found: $profile"
        fi
        validate_chrome_dir "$profile/chrome"
        validate_user_js "$profile/user.js"
    done
}

install_profile() {
    local profile
    profile="$(cd -- "$1" && pwd)"
    local chrome_dir="$profile/chrome"
    say "profile   $profile"
    link "$STYLESHEET" "$chrome_dir/userChrome.css"
    link "$assets_dir" "$chrome_dir/$ASSETS_LINK_NAME"
    ensure_pref "$profile/user.js"
}

parse_arguments() {
    local arg
    for arg in "$@"; do
        case "$arg" in
            --check | -n)
                check=1
                ;;
            -*)
                usage
                ;;
            *)
                profiles+=("$arg")
                ;;
        esac
    done
    if [[ ${#profiles[@]} -eq 0 ]]; then
        usage
    fi
}

main() {
    parse_arguments "$@"
    validate "${profiles[@]}"
    if [[ $check -eq 1 ]]; then
        say "dry run: nothing will be changed"
    fi
    local profile
    for profile in "${profiles[@]}"; do
        install_profile "$profile"
    done
    if [[ $check -eq 1 ]]; then
        if [[ $changes -eq 1 ]]; then
            exit 1
        fi
    fi
}

main "$@"
