#!/bin/bash
# Regression tests for cinnamon/applet.sh, with stub gsettings and gdbus on PATH and a
# temporary applet folder: the real org.cinnamon keys and the running Cinnamon are never
# touched.
# Usage: scripts/cinnamon-applet-test.sh [script to test]
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=scripts/cinnamon-test-stubs.sh
source "$script_dir/cinnamon-test-stubs.sh"
applet_script="${1:-$script_dir/../cinnamon/applet.sh}"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/cinnamon-applet-test.XXXXXX")"
stub_bin="$tmp_root/bin"
failures=0

readonly UUID="quick-settings@test"
readonly OTHERS="['panel1:left:0:menu@cinnamon.org:0', 'panel1:right:3:network@cinnamon.org:10', 'panel2:right:9:clock@x:4', 'panel1:right:5:power@cinnamon.org:12', 'panel1:center:0:calendar@cinnamon.org:20']"
readonly NEXT_ID=25

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

set_keys() {
    mkdir -p "$tmp_root/keys"
    printf '%s\n' "$1" >"$tmp_root/keys/enabled-applets"
    printf '%s\n' "$2" >"$tmp_root/keys/next-applet-id"
}

key() {
    cat "$tmp_root/keys/$1"
}

install_applet() {
    mkdir -p "$tmp_root/data/cinnamon/applets/$UUID"
    printf '{}\n' >"$tmp_root/data/cinnamon/applets/$UUID/metadata.json"
}

run() {
    PATH="$stub_bin:$PATH" XDG_DATA_HOME="$tmp_root/data" "$applet_script" "$@" 2>&1
}

expect_equal() {
    local name=$1 expected=$2 actual=$3
    if [[ "$actual" == "$expected" ]]; then
        pass "$name"
    else
        fail "$name" "expected [$expected], got [$actual]"
    fi
}

test_enable_appends_at_zone_end() {
    local output
    set_keys "$OTHERS" "$NEXT_ID"
    output=$(run enable "$UUID")
    expect_equal "enable prints the entry" "enabled: $UUID as panel1:right:6:$UUID:$NEXT_ID" "$output"
    expect_equal "enable keeps the other entries byte-identical" \
        "${OTHERS%]}, 'panel1:right:6:$UUID:$NEXT_ID']" "$(key enabled-applets)"
    expect_equal "enable takes next-applet-id and stores id + 1" "$((NEXT_ID + 1))" "$(key next-applet-id)"
}

test_enable_twice_is_unchanged() {
    local before output
    before=$(key enabled-applets)
    output=$(run enable "$UUID")
    expect_equal "second enable says unchanged" "unchanged: $UUID is already enabled" "$output"
    expect_equal "second enable leaves the list" "$before" "$(key enabled-applets)"
    expect_equal "second enable leaves next-applet-id" "$((NEXT_ID + 1))" "$(key next-applet-id)"
}

test_disable_restores_the_others() {
    local output
    output=$(run disable "$UUID")
    expect_equal "disable prints" "disabled: $UUID" "$output"
    expect_equal "disable gives back the other entries byte-identical" "$OTHERS" "$(key enabled-applets)"
    output=$(run disable "$UUID")
    expect_equal "second disable says unchanged" "unchanged: $UUID is not enabled" "$output"
}

test_enable_on_empty_list() {
    set_keys "@as []" 0
    run enable "$UUID" >/dev/null
    expect_equal "enable on an empty list" "['panel1:right:0:$UUID:0']" "$(key enabled-applets)"
    run disable "$UUID" >/dev/null
    expect_equal "disable of the last entry empties the list" "@as []" "$(key enabled-applets)"
}

test_bang_uuid_counts_as_enabled() {
    local output
    set_keys "['panel1:right:0:!$UUID:3']" 4
    output=$(run enable "$UUID")
    expect_equal "'!uuid' counts as enabled" "unchanged: $UUID is already enabled" "$output"
}

test_refusals_change_nothing() {
    local status=0
    set_keys "$OTHERS" "$NEXT_ID"
    run enable "missing@test" >/dev/null || status=$?
    expect_equal "enable of an applet not installed fails" 1 "$status"
    expect_equal "a refused enable leaves the list" "$OTHERS" "$(key enabled-applets)"
    expect_equal "a refused enable leaves next-applet-id" "$NEXT_ID" "$(key next-applet-id)"
    local output
    status=0
    output=$(run enable "bad'uuid@test") || status=$?
    expect_equal "a uuid with a quote is refused" "1 error: not an applet uuid: bad'uuid@test" "$status $output"
    expect_equal "a refused uuid leaves the list" "$OTHERS" "$(key enabled-applets)"
}

# An entry holding a quote or a backslash cannot be parsed safely: nothing is written.
test_unexpected_entry_is_refused() {
    local output status=0
    set_keys "['panel1:right:0:odd\\'name@x:3']" 4
    output=$(run enable "$UUID") || status=$?
    expect_equal "a list with a quote or backslash in an entry is refused" 1 "$status"
    expect_equal "the refusal says why" "error: unexpected character in enabled-applets, nothing changed" "$output"
    expect_equal "a refused list is left as it was" "['panel1:right:0:odd\\'name@x:3']" "$(key enabled-applets)"
}

test_reload_calls_cinnamon() {
    local output
    set_keys "$OTHERS" "$NEXT_ID"
    run enable "$UUID" >/dev/null
    rm -f "$tmp_root/gdbus.log"
    output=$(run reload "$UUID")
    expect_equal "reload prints" "reloaded: $UUID" "$output"
    expect_equal "reload asks Cinnamon to reload the applet" \
        "call --session --dest org.Cinnamon --object-path /org/Cinnamon --method org.Cinnamon.ReloadXlet $UUID APPLET" \
        "$(cat "$tmp_root/gdbus.log")"
}

main() {
    write_cinnamon_stubs "$tmp_root"
    install_applet
    test_enable_appends_at_zone_end
    test_enable_twice_is_unchanged
    test_disable_restores_the_others
    test_enable_on_empty_list
    test_bang_uuid_counts_as_enabled
    test_refusals_change_nothing
    test_unexpected_entry_is_refused
    test_reload_calls_cinnamon
    if [[ "$failures" -gt 0 ]]; then
        say "$failures failure(s)"
        exit 1
    fi
    say "ok: all tests passed"
}

main "$@"
