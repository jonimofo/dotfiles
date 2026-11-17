#!/bin/bash
# Tests of system/battery-charge-limit/battery-charge-limit against a fake sysfs tree in a
# temporary directory: nothing is written to /sys and nothing runs as root. The installed
# helper takes no path from the environment, so the test runs a copy in which two things
# differ, and checks that nothing else does: the BATTERY_DIR line points at the fake tree,
# and write_value() is replaced by a model of the dell-laptop driver
# (fixtures/battery-charge-limit/driver-write_value.sh): it marks the active charge type in
# brackets, keeps the thresholds 5 apart by moving the written one, logs every write, and
# can refuse a write or keep a stuck end value to test the helper's checks.
# Usage: scripts/battery-charge-limit-test.sh (from any directory). Needs sh, diff, shellcheck.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$script_dir/../system/battery-charge-limit/battery-charge-limit"
driver="$script_dir/fixtures/battery-charge-limit/driver-write_value.sh"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/battery-charge-limit-test.XXXXXX")"
battery="$tmp_root/BAT0"
copy="$tmp_root/battery-charge-limit"
failures=0

readonly REAL_DIR_LINE="readonly BATTERY_DIR='/sys/class/power_supply/BAT0'"
readonly ADAPTIVE_TYPES='Trickle Fast Standard [Adaptive] Custom'
readonly CUSTOM_TYPES='Trickle Fast Standard Adaptive [Custom]'

cleanup() {
    chmod -R u+w "$tmp_root" 2> /dev/null || true
    rm -rf "$tmp_root"
}
trap cleanup EXIT

check() {
    local label="$1"
    shift
    if "$@"; then
        printf 'PASS %s\n' "$label"
    else
        printf 'FAIL %s\n' "$label"
        failures=$((failures + 1))
    fi
}

# The copy: BATTERY_DIR on the fake tree, write_value() from the driver model.
build_copy() {
    local line in_writer=0
    while IFS= read -r line; do
        if [ "$line" = "$REAL_DIR_LINE" ]; then
            printf "readonly BATTERY_DIR='%s'\n" "$battery"
        elif [ "$line" = 'write_value() {' ]; then
            in_writer=1
            cat "$driver"
        elif [ "$in_writer" -eq 1 ]; then
            if [ "$line" = '}' ]; then
                in_writer=0
            fi
        else
            printf '%s\n' "$line"
        fi
    done < "$helper" > "$copy"
}

# Only the BATTERY_DIR line and write_value()'s body differ from the helper.
copy_differs_only_where_expected() {
    local removed expected
    removed="$(diff "$helper" "$copy" | grep '^<' || true)"
    expected="< $REAL_DIR_LINE
<     printf '%s\\n' \"\$2\" > \"\$1\""
    [ "$removed" = "$expected" ]
}

# fake_tree <charge_types> <start> <end>: a fresh fake battery directory.
fake_tree() {
    chmod -R u+w "$battery" 2> /dev/null || true
    rm -rf "$battery"
    mkdir -p "$battery"
    printf '%s\n' "$1" > "$battery/charge_types"
    printf '%s\n' "$2" > "$battery/charge_control_start_threshold"
    printf '%s\n' "$3" > "$battery/charge_control_end_threshold"
    : > "$battery/.writes"
}

state() {
    printf '%s|%s|%s' "$(cat "$battery/charge_types")" "$(cat "$battery/charge_control_start_threshold")" \
        "$(cat "$battery/charge_control_end_threshold")"
}

write_count() {
    wc -l < "$battery/.writes" | tr -d ' '
}

run_helper() {
    sh "$copy" "$@" > "$tmp_root/out" 2> "$tmp_root/err"
}

# Every threshold write was stored as asked: the driver never had to move a value (the
# order kept its 5-point gap); at least one threshold write happened.
no_silent_move() {
    local file requested stored writes=0
    while read -r file requested stored; do
        case $file in
            charge_control_start_threshold | charge_control_end_threshold) ;;
            *) continue ;;
        esac
        writes=$((writes + 1))
        if [ "$requested" != "$stored" ]; then
            return 1
        fi
    done < "$battery/.writes"
    [ "$writes" -gt 0 ]
}

# limit_case <start> <end>: limit from Adaptive with these thresholds: no silent move, and
# the final state.
limit_case() {
    fake_tree "$ADAPTIVE_TYPES" "$1" "$2"
    run_helper limit
    check "limit from $1/$2: no value moved by the driver ($(tr '\n' ',' < "$battery/.writes"))" no_silent_move
    check "limit from $1/$2 ends at Custom 75/80" [ "$(state)" = "$CUSTOM_TYPES|75|80" ]
}

refuses_and_writes_nothing() {
    local before
    fake_tree "$ADAPTIVE_TYPES" 60 70
    before="$(state)"
    if run_helper "$@"; then
        return 1
    fi
    [ "$(state)" = "$before" ] && [ "$(write_count)" -eq 0 ]
}

main() {
    check 'shellcheck: the helper is clean' shellcheck -s sh "$helper"
    check 'the helper uses the real sysfs path' grep -qxF "$REAL_DIR_LINE" "$helper"
    build_copy
    check 'the test copy differs only by the BATTERY_DIR line and write_value()' copy_differs_only_where_expected

    fake_tree "$ADAPTIVE_TYPES" 75 80
    run_helper limit
    check "limit from Adaptive: Custom, 75 and 80 ($(state))" [ "$(state)" = "$CUSTOM_TYPES|75|80" ]
    check 'limit prints what it applied' grep -qF 'limit applied (Custom, 75 to 80 %)' "$tmp_root/out"
    check 'limit: the mode is written last' [ "$(tail -n 1 "$battery/.writes")" = 'charge_types Custom Custom' ]
    : > "$battery/.writes"
    run_helper limit
    check 'limit twice: nothing written, "unchanged"' \
        test "$(write_count)" -eq 0 -a "$(state)" = "$CUSTOM_TYPES|75|80"
    check 'limit twice prints unchanged' grep -qF 'limit unchanged (Custom, 75 to 80 %)' "$tmp_root/out"

    fake_tree "$CUSTOM_TYPES" 75 80
    run_helper full
    check "full from Custom: Adaptive, thresholds left ($(state))" [ "$(state)" = "$ADAPTIVE_TYPES|75|80" ]
    check 'full prints what it applied' grep -qF 'full applied (Adaptive)' "$tmp_root/out"
    : > "$battery/.writes"
    run_helper full
    check 'full twice: nothing written' test "$(write_count)" -eq 0 -a "$(state)" = "$ADAPTIVE_TYPES|75|80"
    check 'full twice prints unchanged' grep -qF 'full unchanged (Adaptive)' "$tmp_root/out"

    fake_tree "$CUSTOM_TYPES" 70 78
    run_helper limit
    check "Custom 70/78 is not the limit: written, ends at 75/80 ($(state))" [ "$(state)" = "$CUSTOM_TYPES|75|80" ]
    limit_case 70 78
    limit_case 95 100
    limit_case 50 60
    limit_case 79 85
    limit_case 74 80
    # 76/79 breaks the driver's own gap (set outside it): the driver moves the first value,
    # the second pass finishes, the read-back confirms.
    fake_tree "$ADAPTIVE_TYPES" 76 79
    run_helper limit
    check "limit from 76/79 (outside the driver's gap) still ends at Custom 75/80 ($(tr '\n' ',' < "$battery/.writes"))" \
        [ "$(state)" = "$CUSTOM_TYPES|75|80" ]

    fake_tree "$ADAPTIVE_TYPES" 50 60
    printf '79\n' > "$battery/.stuck_end"
    if run_helper limit; then
        check 'an end the driver did not take: refused' false
    else
        check "an end the driver did not take: refused, read back named ($(cat "$tmp_root/err"))" \
            grep -qF 'read back as 74 to 79, not 75 to 80' "$tmp_root/err"
    fi
    check 'an end the driver did not take: the mode stays Adaptive' [ "$(cat "$battery/charge_types")" = "$ADAPTIVE_TYPES" ]

    fake_tree "$ADAPTIVE_TYPES" 60 70
    : > "$battery/charge_control_start_threshold.readonly"
    if run_helper limit; then
        check 'a threshold write failing midway: non-zero exit' false
    else
        check 'a threshold write failing midway: non-zero exit, the mode stays Adaptive' \
            [ "$(cat "$battery/charge_types")" = "$ADAPTIVE_TYPES" ]
    fi

    check 'a wrong argument is refused, nothing written' refuses_and_writes_nothing charge
    check 'no argument is refused, nothing written' refuses_and_writes_nothing
    check 'two arguments are refused, nothing written' refuses_and_writes_nothing limit full
    check 'an option-like argument is refused, nothing written' refuses_and_writes_nothing --limit
    check 'an empty argument is refused, nothing written' refuses_and_writes_nothing ''
    check 'a whitespace argument is refused, nothing written' refuses_and_writes_nothing ' limit'
    refuses_and_writes_nothing nope || true
    check 'a refusal prints the usage line' grep -qF 'usage: battery-charge-limit limit|full' "$tmp_root/err"

    fake_tree "$ADAPTIVE_TYPES" 60 70
    rm "$battery/charge_control_end_threshold"
    if run_helper limit; then
        check 'missing files: refused' false
    else
        check 'missing files: refused with a clear message' grep -qF 'is missing' "$tmp_root/err"
    fi
    check 'missing files: nothing written' [ "$(write_count)" -eq 0 ]

    fake_tree "$ADAPTIVE_TYPES" 60 'x'
    if run_helper limit; then
        check 'a threshold that is not a number: refused' false
    else
        check 'a threshold that is not a number: refused, nothing written' \
            test "$(write_count)" -eq 0 -a "$(state)" = "$ADAPTIVE_TYPES|60|x"
    fi

    if [ "$failures" -gt 0 ]; then
        printf '%d failure(s)\n' "$failures"
        exit 1
    fi
    printf 'ok: all tests passed\n'
}

main "$@"
