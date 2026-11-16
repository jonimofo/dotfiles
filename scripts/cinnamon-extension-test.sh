#!/bin/bash
# Regression tests for cinnamon/extension.sh, with stub gsettings and gdbus on PATH and a
# temporary extension folder: the real org.cinnamon keys and the running Cinnamon are never
# touched.
# Usage: scripts/cinnamon-extension-test.sh [script to test]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cinnamon-test-stubs.sh
source "$script_dir/cinnamon-test-stubs.sh"
extension_script="${1:-$script_dir/../cinnamon/extension.sh}"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/cinnamon-extension-test.XXXXXX")"
failures=0

readonly UUID="scale@test"
readonly OTHERS="['other@x', 'second@y']"

cleanup() {
    rm -rf "$tmp_root"
}
trap cleanup EXIT

say() {
    printf '%s\n' "$*"
}

pass() {
    say "PASS $1"
}

fail() {
    say "FAIL $1: $2"
    failures=$((failures + 1))
}

set_list() {
    printf '%s\n' "$1" >"$tmp_root/keys/enabled-extensions"
}

list() {
    cat "$tmp_root/keys/enabled-extensions"
}

install_extension() {
    mkdir -p "$tmp_root/data/cinnamon/extensions/$UUID"
    printf '{}\n' >"$tmp_root/data/cinnamon/extensions/$UUID/metadata.json"
}

run() {
    PATH="$tmp_root/bin:$PATH" XDG_DATA_HOME="$tmp_root/data" "$extension_script" "$@" 2>&1
}

expect_equal() {
    local name=$1 expected=$2 actual=$3
    if [[ "$actual" == "$expected" ]]; then
        pass "$name"
    else
        fail "$name" "expected [$expected], got [$actual]"
    fi
}

test_enable_and_disable() {
    set_list "$OTHERS"
    expect_equal "enable prints" "enabled: $UUID" "$(run enable "$UUID")"
    expect_equal "enable appends, other entries byte-identical" "['other@x', 'second@y', '$UUID']" "$(list)"
    expect_equal "second enable says unchanged" "unchanged: $UUID is already enabled" "$(run enable "$UUID")"
    expect_equal "disable prints" "disabled: $UUID" "$(run disable "$UUID")"
    expect_equal "disable gives back the other entries byte-identical" "$OTHERS" "$(list)"
    expect_equal "second disable says unchanged" "unchanged: $UUID is not enabled" "$(run disable "$UUID")"
}

test_empty_list_and_bang_uuid() {
    set_list "@as []"
    run enable "$UUID" >/dev/null
    expect_equal "enable on an empty list" "['$UUID']" "$(list)"
    run disable "$UUID" >/dev/null
    expect_equal "disable of the last entry empties the list" "@as []" "$(list)"
    set_list "['!$UUID']"
    expect_equal "'!uuid' counts as enabled" "unchanged: $UUID is already enabled" "$(run enable "$UUID")"
    run disable "$UUID" >/dev/null
    expect_equal "disable removes the '!uuid' entry" "@as []" "$(list)"
}

test_reload() {
    set_list "['$UUID']"
    rm -f "$tmp_root/gdbus.log"
    expect_equal "reload prints" "reloaded: $UUID" "$(run reload "$UUID")"
    expect_equal "reload asks Cinnamon to reload the extension" \
        "call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.ReloadXlet $UUID EXTENSION" \
        "$(cat "$tmp_root/gdbus.log")"
    set_list "$OTHERS"
    expect_equal "reload of a disabled extension enables it" "enabled: $UUID" "$(run reload "$UUID")"
}

test_refusals_change_nothing() {
    local output status=0
    set_list "$OTHERS"
    output=$(run enable "missing@test") || status=$?
    expect_equal "enable of an extension not installed fails" 1 "$status"
    expect_equal "a refused enable leaves the list" "$OTHERS" "$(list)"
    status=0
    output=$(run enable "bad'uuid@test") || status=$?
    expect_equal "a uuid with a quote is refused" "1 error: not an extension uuid: bad'uuid@test" "$status $output"
    status=0
    output=$(run frobnicate "$UUID") || status=$?
    expect_equal "an unknown action prints the usage" "2 Usage: extension.sh enable|disable|reload <uuid>" "$status $output"
}

main() {
    write_cinnamon_stubs "$tmp_root"
    install_extension
    test_enable_and_disable
    test_empty_list_and_bang_uuid
    test_reload
    test_refusals_change_nothing
    if [[ "$failures" -gt 0 ]]; then
        say "$failures failure(s)"
        exit 1
    fi
    say "ok: all tests passed"
}

main "$@"
