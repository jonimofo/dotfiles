#!/usr/bin/env bash
# Tests for cinnamon/theme/install.sh on throwaway profile folders, plus a static check of
# cinnamon/theme/userChrome.css. Never touches a real Thunderbird or Firefox profile.
# Usage: scripts/mozilla-install-test.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
readonly INSTALLER="$repo_root/cinnamon/theme/install.sh"
readonly STYLESHEET="$repo_root/cinnamon/theme/userChrome.css"
readonly PREF_LINE='user_pref("toolkit.legacyUserProfileCustomizations.stylesheets", true);'
readonly EXPECTED_ASSETS=(
    close close_prelight close_pressed close_unfocused
    min min_prelight min_pressed min_unfocused
    maximize maximize_prelight maximize_pressed maximize_unfocused
)
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/mozilla-install-test.XXXXXX")"
failures=0
case_id=0

cleanup() {
    rm -rf "$tmp_root"
}
trap cleanup EXIT

say() {
    printf '%s\n' "$*"
}

pass() {
    say "PASS  $*"
}

failure() {
    say "FAIL  $*"
    failures=$((failures + 1))
}

# Creates a fresh case folder with an assets fixture and an empty profile; sets $profile.
new_case() {
    case_id=$((case_id + 1))
    local dir="$tmp_root/case$case_id"
    mkdir -p "$dir/assets" "$dir/profile"
    export DRACULA_ASSETS_DIR="$dir/assets"
    profile="$dir/profile"
}

run_installer() {
    "$INSTALLER" "$@" 2>&1
}

pref_count() {
    local count
    count="$(grep -cxF "$PREF_LINE" "$1" || true)"
    say "${count:-0}"
}

links_are_correct() {
    local css_target assets_target
    css_target="$(readlink "$profile/chrome/userChrome.css" || true)"
    assets_target="$(readlink "$profile/chrome/dracula-assets" || true)"
    if [[ "$css_target" != "$STYLESHEET" ]]; then
        return 1
    fi
    if [[ "$assets_target" != "$DRACULA_ASSETS_DIR" ]]; then
        return 1
    fi
    return 0
}

test_first_run() {
    new_case
    run_installer "$profile" >/dev/null
    if links_are_correct; then
        if [[ "$(pref_count "$profile/user.js")" == "1" ]]; then
            pass "first run creates both links and the pref"
            return 0
        fi
    fi
    failure "first run creates both links and the pref"
}

test_second_run_unchanged() {
    new_case
    run_installer "$profile" >/dev/null
    local before after output
    before="$(cat "$profile/user.js")"
    output="$(run_installer "$profile")"
    after="$(cat "$profile/user.js")"
    local other_lines
    other_lines="$(printf '%s\n' "$output" | grep -vE '^(ok|profile) ' || true)"
    if [[ -z "$other_lines" && "$before" == "$after" ]]; then
        if "$INSTALLER" --check "$profile" >/dev/null 2>&1; then
            pass "second run changes nothing"
            return 0
        fi
    fi
    failure "second run changes nothing: $other_lines"
}

test_user_js_preserved() {
    new_case
    printf '%s\n%s' 'user_pref("a.b", 1);' 'user_pref("c.d", "x");' > "$profile/user.js"
    run_installer "$profile" >/dev/null
    run_installer "$profile" >/dev/null
    local first_lines
    first_lines="$(head -n 2 "$profile/user.js")"
    local expected
    expected="$(printf '%s\n%s' 'user_pref("a.b", 1);' 'user_pref("c.d", "x");')"
    if [[ "$first_lines" == "$expected" && "$(pref_count "$profile/user.js")" == "1" ]]; then
        pass "existing user.js kept, pref added once"
    else
        failure "existing user.js kept, pref added once"
    fi
    new_case
    printf '%s\n' "$PREF_LINE" > "$profile/user.js"
    run_installer "$profile" >/dev/null
    if [[ "$(wc -l < "$profile/user.js")" -eq 1 ]]; then
        pass "pref already present is not duplicated"
    else
        failure "pref already present is not duplicated"
    fi
}

test_real_file_backed_up() {
    new_case
    mkdir -p "$profile/chrome"
    printf '/* old */\n' > "$profile/chrome/userChrome.css"
    local output backups
    output="$(run_installer "$profile")"
    backups="$(find "$profile/chrome" -name 'userChrome.css.*.bak' -type f)"
    if links_are_correct && [[ -n "$backups" ]]; then
        if [[ "$(cat "$backups")" == "/* old */" && "$output" == *"backed up"* ]]; then
            pass "real userChrome.css is backed up"
            return 0
        fi
    fi
    failure "real userChrome.css is backed up"
}

test_check_writes_nothing() {
    new_case
    local status=0 listing
    "$INSTALLER" --check "$profile" >/dev/null 2>&1 || status=$?
    listing="$(find "$profile" -mindepth 1)"
    if [[ $status -eq 1 && -z "$listing" ]]; then
        pass "--check writes nothing and exits 1 on pending changes"
    else
        failure "--check writes nothing (status $status, found: $listing)"
    fi
}

test_missing_profile_fails() {
    new_case
    local status=0
    run_installer "$profile/absent" >/dev/null || status=$?
    if [[ $status -ne 0 && ! -e "$profile/absent" ]]; then
        pass "missing profile folder fails"
    else
        failure "missing profile folder fails (status $status)"
    fi
}

test_missing_assets_fails() {
    new_case
    export DRACULA_ASSETS_DIR="$tmp_root/no-such-assets"
    local status=0 listing
    run_installer "$profile" >/dev/null || status=$?
    listing="$(find "$profile" -mindepth 1)"
    if [[ $status -ne 0 && -z "$listing" ]]; then
        pass "missing assets folder fails, nothing changed"
    else
        failure "missing assets folder fails (status $status)"
    fi
}

test_no_arguments_usage() {
    local status=0 output
    output="$("$INSTALLER" 2>&1 >/dev/null)" || status=$?
    if [[ $status -eq 2 && "$output" == usage:* ]]; then
        pass "no arguments gives usage and exit 2"
    else
        failure "no arguments gives usage and exit 2 (status $status)"
    fi
}

is_expected_asset() {
    local name="$1" expected
    for expected in "${EXPECTED_ASSETS[@]}"; do
        if [[ "$name" == "$expected" ]]; then
            return 0
        fi
    done
    return 1
}

test_stylesheet_static() {
    local content refs name bad=""
    content="$(cat "$STYLESHEET")"
    if [[ "$content" == *"file://"* || "$content" == *"/home/"* ]]; then
        failure "stylesheet has no absolute paths"
        return 0
    fi
    refs="$(grep -oE 'url\("[^"]*"\)' "$STYLESHEET" || true)"
    if [[ "$(printf '%s\n' "$refs" | grep -c .)" -ne ${#EXPECTED_ASSETS[@]} ]]; then
        failure "stylesheet references ${#EXPECTED_ASSETS[@]} assets"
        return 0
    fi
    while IFS= read -r name; do
        if [[ ! "$name" =~ ^url\(\"dracula-assets/([a-z_]+)\.svg\"\)$ ]]; then
            bad="$bad $name"
            continue
        fi
        if ! is_expected_asset "${BASH_REMATCH[1]}"; then
            bad="$bad $name"
        fi
    done <<< "$refs"
    if [[ -z "$bad" ]]; then
        pass "stylesheet uses only relative dracula-assets URLs"
    else
        failure "unexpected stylesheet URLs:$bad"
    fi
}

main() {
    test_first_run
    test_second_run_unchanged
    test_user_js_preserved
    test_real_file_backed_up
    test_check_writes_nothing
    test_missing_profile_fails
    test_missing_assets_fails
    test_no_arguments_usage
    test_stylesheet_static
    if [[ $failures -gt 0 ]]; then
        say "$failures failure(s)"
        exit 1
    fi
    say "all passed"
}

main "$@"
