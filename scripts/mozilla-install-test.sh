#!/usr/bin/env bash
# Tests for cinnamon/theme/install.sh on throwaway profile folders, plus a static check of
# cinnamon/theme/userChrome.css. Never touches a real Thunderbird or Firefox profile.
# Usage: scripts/mozilla-install-test.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
readonly INSTALLER="$repo_root/cinnamon/theme/install.sh"
readonly STYLESHEET="$repo_root/cinnamon/theme/userChrome.css"
# The @-moz-document scope of the Firefox address bar block: a window address, not an asset.
readonly FIREFOX_WINDOW_URL='url("chrome://browser/content/browser.xhtml")'
readonly EXIT_PENDING=3
readonly RESTART_HINT='Restart Firefox and Thunderbird to see the change.'
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

# Snapshot of every path, type and link target under the given folders, to prove nothing changed.
tree_state() {
    local dir
    for dir in "$@"; do
        if [[ ! -e "$dir" ]]; then
            say "$dir absent"
            continue
        fi
        find "$dir" -printf '%p %y %l\n' | sort
    done
}

links_are_correct() {
    local dir="${1:-$profile}"
    local css_target assets_target
    css_target="$(readlink "$dir/chrome/userChrome.css" || true)"
    assets_target="$(readlink "$dir/chrome/dracula-assets" || true)"
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
    backups=("$profile"/chrome/userChrome.css.*.bak)
    if links_are_correct && [[ ${#backups[@]} -eq 1 && -f "${backups[0]}" ]]; then
        if [[ "$(cat "${backups[0]}")" == "/* old */" && "$output" == *"backed up"* ]]; then
            pass "real userChrome.css is backed up"
            return 0
        fi
    fi
    failure "real userChrome.css is backed up"
}

test_real_assets_folder_backed_up() {
    new_case
    mkdir -p "$profile/chrome/dracula-assets"
    printf 'mine\n' > "$profile/chrome/dracula-assets/own.svg"
    run_installer "$profile" >/dev/null
    local backups=("$profile"/chrome/dracula-assets.*.bak)
    if links_are_correct && [[ ${#backups[@]} -eq 1 && -d "${backups[0]}" && ! -L "${backups[0]}" ]]; then
        if [[ "$(cat "${backups[0]}/own.svg")" == "mine" ]]; then
            pass "real dracula-assets folder is backed up with its content"
            return 0
        fi
    fi
    failure "real dracula-assets folder is backed up with its content"
}

test_check_keeps_real_file() {
    new_case
    mkdir -p "$profile/chrome"
    printf '/* old */\n' > "$profile/chrome/userChrome.css"
    local before after status=0
    before="$(tree_state "$profile")"
    "$INSTALLER" --check "$profile" >/dev/null 2>&1 || status=$?
    after="$(tree_state "$profile")"
    if [[ $status -eq $EXIT_PENDING && "$before" == "$after" && ! -L "$profile/chrome/userChrome.css" ]]; then
        if [[ "$(cat "$profile/chrome/userChrome.css")" == "/* old */" ]]; then
            pass "--check leaves a real userChrome.css in place, no backup"
            return 0
        fi
    fi
    failure "--check leaves a real userChrome.css in place (status $status)"
}

# Pre-creates the backup name for this second and the next few, so the run collides.
test_existing_backup_refused() {
    new_case
    mkdir -p "$profile/chrome"
    printf '/* old */\n' > "$profile/chrome/userChrome.css"
    local offset now
    now="$(date +%s)"
    for offset in 0 1 2 3; do
        printf '/* earlier backup */\n' > "$profile/chrome/userChrome.css.$(date -d "@$((now + offset))" +%Y%m%d-%H%M%S).bak"
    done
    local status=0 output
    output="$(run_installer "$profile")" || status=$?
    if [[ $status -eq 1 && "$output" == *"backup path already exists: $profile/chrome/userChrome.css."* ]]; then
        if [[ "$(cat "$profile/chrome/userChrome.css")" == "/* old */" ]]; then
            pass "an existing backup path is refused, nothing overwritten"
            return 0
        fi
    fi
    failure "an existing backup path is refused (status $status): $output"
}

test_restart_hint() {
    new_case
    local first second
    first="$(run_installer "$profile")"
    second="$(run_installer "$profile")"
    if [[ "$(printf '%s\n' "$first" | tail -n 1)" == "$RESTART_HINT" && "$second" != *"$RESTART_HINT"* ]]; then
        pass "the restart hint follows a run that changed something, only then"
    else
        failure "the restart hint follows a run that changed something, only then"
    fi
}

test_check_writes_nothing() {
    local flag
    for flag in --check -n; do
        new_case
        local status=0 listing
        "$INSTALLER" "$flag" "$profile" >/dev/null 2>&1 || status=$?
        listing="$(find "$profile" -mindepth 1)"
        if [[ $status -eq $EXIT_PENDING && -z "$listing" ]]; then
            pass "$flag writes nothing and exits $EXIT_PENDING on pending changes"
        else
            failure "$flag writes nothing (status $status, found: $listing)"
        fi
    done
}

test_check_after_profile() {
    new_case
    local status=0 listing
    "$INSTALLER" "$profile" --check >/dev/null 2>&1 || status=$?
    listing="$(find "$profile" -mindepth 1)"
    if [[ $status -eq $EXIT_PENDING && -z "$listing" ]]; then
        pass "--check after a profile is a dry run"
    else
        failure "--check after a profile is a dry run (status $status, found: $listing)"
    fi
}

test_unknown_flag_usage() {
    new_case
    local status=0 output listing
    output="$("$INSTALLER" --bogus "$profile" 2>&1 >/dev/null)" || status=$?
    listing="$(find "$profile" -mindepth 1)"
    if [[ $status -eq 2 && "$output" == usage:* && -z "$listing" ]]; then
        pass "unknown flag gives usage and exit 2"
    else
        failure "unknown flag gives usage and exit 2 (status $status)"
    fi
}

# Points both links at stale targets; $1 = "dummy" (existing file) or "dangling".
assert_relink() {
    local kind="$1"
    new_case
    mkdir -p "$profile/chrome"
    local stale="$tmp_root/case$case_id/stale.css"
    if [[ "$kind" == "dummy" ]]; then
        printf '/* stale */\n' > "$stale"
    fi
    ln -s "$stale" "$profile/chrome/userChrome.css"
    ln -s "$stale" "$profile/chrome/dracula-assets"
    local output relinks
    output="$(run_installer "$profile")"
    relinks="$(printf '%s\n' "$output" | grep -c '^relink ' || true)"
    if links_are_correct && [[ "$relinks" == "2" ]]; then
        pass "stale $kind links are relinked"
    else
        failure "stale $kind links are relinked (relink lines: $relinks)"
    fi
}

test_relink() {
    assert_relink dummy
    assert_relink dangling
}

test_two_profiles() {
    new_case
    local second="$tmp_root/case$case_id/second profile"
    mkdir -p "$second"
    run_installer "$profile" "$second" >/dev/null
    if links_are_correct "$profile" && links_are_correct "$second"; then
        if [[ "$(pref_count "$second/user.js")" == "1" ]]; then
            pass "two profiles in one call, one with a space, are both installed"
            return 0
        fi
    fi
    failure "two profiles in one call, one with a space, are both installed"
}

# Runs the installer on a good profile then a broken one; asserts failure and no change at all.
assert_bad_profile_changes_nothing() {
    local label="$1" good="$2" bad="$3"
    local before after status=0
    before="$(tree_state "$good" "$bad")"
    run_installer "$good" "$bad" >/dev/null || status=$?
    after="$(tree_state "$good" "$bad")"
    if [[ $status -eq 1 && "$before" == "$after" ]]; then
        pass "$label fails with nothing changed in any profile"
    else
        failure "$label fails with nothing changed in any profile (status $status)"
    fi
}

test_bad_profiles_change_nothing() {
    new_case
    local good="$profile" bad="$tmp_root/case$case_id/bad"
    mkdir -p "$bad"
    printf 'x\n' > "$bad/chrome"
    assert_bad_profile_changes_nothing "chrome as a regular file" "$good" "$bad"
    new_case
    good="$profile"
    bad="$tmp_root/case$case_id/bad"
    mkdir -p "$bad/user.js"
    assert_bad_profile_changes_nothing "user.js as a folder" "$good" "$bad"
    new_case
    good="$profile"
    bad="$tmp_root/case$case_id/bad"
    mkdir -p "$bad" "$tmp_root/case$case_id/elsewhere"
    ln -s "$tmp_root/case$case_id/elsewhere" "$bad/chrome"
    assert_bad_profile_changes_nothing "symlinked chrome" "$good" "$bad"
    new_case
    assert_bad_profile_changes_nothing "missing second profile" "$profile" "$profile/absent"
    new_case
    good="$profile"
    bad="$tmp_root/case$case_id/bad"
    mkdir -p "$bad"
    printf 'user_pref("a.b", 1);\n' > "$tmp_root/case$case_id/elsewhere.js"
    ln -s "$tmp_root/case$case_id/elsewhere.js" "$bad/user.js"
    assert_bad_profile_changes_nothing "symlinked user.js" "$good" "$bad"
    new_case
    good="$profile"
    bad="$tmp_root/case$case_id/bad"
    mkdir -p "$bad"
    printf 'user_pref("a.b", 1);\n' > "$bad/user.js"
    chmod a-w "$bad/user.js"
    assert_bad_profile_changes_nothing "non-writable user.js" "$good" "$bad"
}

test_assets_path_normalised() {
    new_case
    local case_dir="$tmp_root/case$case_id"
    local absolute="$DRACULA_ASSETS_DIR" variant output other_lines target ok=1
    for variant in relative trailing; do
        rm -rf "$profile"
        mkdir -p "$profile"
        if [[ "$variant" == "relative" ]]; then
            export DRACULA_ASSETS_DIR="assets"
        else
            export DRACULA_ASSETS_DIR="$absolute/"
        fi
        (cd "$case_dir" && run_installer "$profile" >/dev/null)
        output="$(cd "$case_dir" && run_installer "$profile")"
        other_lines="$(printf '%s\n' "$output" | grep -vE '^(ok|profile) ' || true)"
        target="$(readlink "$profile/chrome/dracula-assets" || true)"
        if [[ "$target" != "$absolute" || -n "$other_lines" ]]; then
            ok=0
            failure "$variant DRACULA_ASSETS_DIR gives $target, second run: $other_lines"
        fi
    done
    if [[ $ok -eq 1 ]]; then
        pass "relative and trailing-slash DRACULA_ASSETS_DIR give one absolute link"
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
    # Without this scope the address bar rules would also apply in Thunderbird.
    local scope_lines
    scope_lines="$(grep -cF -- "@-moz-document $FIREFOX_WINDOW_URL {" "$STYLESHEET" || true)"
    if [[ "$scope_lines" -eq 1 ]]; then
        pass "address bar block is scoped to the Firefox window, once"
    else
        failure "address bar block is scoped to the Firefox window, once (found $scope_lines)"
    fi
    refs="$(grep -oE 'url\("[^"]*"\)' "$STYLESHEET" || true)"
    refs="$(printf '%s\n' "$refs" | grep -vxF -- "$FIREFOX_WINDOW_URL" || true)"
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
    test_real_assets_folder_backed_up
    test_check_keeps_real_file
    test_existing_backup_refused
    test_restart_hint
    test_check_writes_nothing
    test_check_after_profile
    test_unknown_flag_usage
    test_relink
    test_two_profiles
    test_bad_profiles_change_nothing
    test_assets_path_normalised
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
