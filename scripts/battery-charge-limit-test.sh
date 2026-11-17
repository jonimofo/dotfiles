#!/bin/bash
# Tests of system/battery-charge-limit/battery-charge-limit against a fake sysfs tree in a
# temporary directory: nothing is written to /sys and nothing runs as root. The installed
# helper takes no path from the environment, so the test runs a copy whose BATTERY_DIR line
# points at the fake tree, and first checks that this line is the copy's only difference.
# The writes' order is read from the copy's `sh -x` trace.
# Usage: scripts/battery-charge-limit-test.sh (from any directory). Needs sh, diff, shellcheck.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="$script_dir/../system/battery-charge-limit/battery-charge-limit"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/battery-charge-limit-test.XXXXXX")"
battery="$tmp_root/BAT0"
copy="$tmp_root/battery-charge-limit"
failures=0

readonly REAL_DIR_LINE="readonly BATTERY_DIR='/sys/class/power_supply/BAT0'"
readonly ADAPTIVE_TYPES='Trickle Fast Standard [Adaptive] Custom'

cleanup() {
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

# fake_tree <charge_types> <start> <end>: a fresh fake battery directory.
fake_tree() {
    rm -rf "$battery"
    mkdir -p "$battery"
    printf '%s\n' "$1" > "$battery/charge_types"
    printf '%s\n' "$2" > "$battery/charge_control_start_threshold"
    printf '%s\n' "$3" > "$battery/charge_control_end_threshold"
}

state() {
    printf '%s|%s|%s' "$(cat "$battery/charge_types")" "$(cat "$battery/charge_control_start_threshold")" \
        "$(cat "$battery/charge_control_end_threshold")"
}

run_helper() {
    sh "$copy" "$@" > "$tmp_root/out" 2> "$tmp_root/err"
}

# The threshold writes in order, as "start=75" or "end=80", from the sh -x trace.
threshold_writes() {
    local line writes=()
    while IFS= read -r line; do
        case $line in
            *"write_value $battery/charge_control_start_threshold "*) writes+=("start=${line##* }") ;;
            *"write_value $battery/charge_control_end_threshold "*) writes+=("end=${line##* }") ;;
        esac
    done < "$tmp_root/trace"
    printf '%s\n' "${writes[*]}"
}

# The start stays below the end after each write, from start $1 and end $2.
always_ordered() {
    local start="$1" end="$2" write
    for write in $(threshold_writes); do
        case $write in
            start=*) start="${write#start=}" ;;
            end=*) end="${write#end=}" ;;
        esac
        if [ "$start" -ge "$end" ]; then
            return 1
        fi
    done
}

limit_from() {
    fake_tree "$ADAPTIVE_TYPES" "$1" "$2"
    sh -x "$copy" limit > /dev/null 2> "$tmp_root/trace"
}

refuses_and_writes_nothing() {
    local before
    fake_tree "$ADAPTIVE_TYPES" 60 70
    before="$(state)"
    if run_helper "$@"; then
        return 1
    fi
    [ "$(state)" = "$before" ]
}

main() {
    check 'shellcheck: the helper is clean' shellcheck -s sh "$helper"
    check 'the helper uses the real sysfs path' grep -qxF "$REAL_DIR_LINE" "$helper"
    sed "s|^$REAL_DIR_LINE\$|readonly BATTERY_DIR='$battery'|" "$helper" > "$copy"
    local differences
    differences="$(diff "$helper" "$copy" | grep -c '^[<>]' || true)"
    check "the test copy differs only by the BATTERY_DIR line ($differences changed lines)" [ "$differences" -eq 2 ]

    fake_tree "$ADAPTIVE_TYPES" 75 80
    run_helper limit
    check "limit from Adaptive writes Custom, 75 and 80 ($(state))" [ "$(state)" = 'Custom|75|80' ]
    check 'limit prints what it applied' grep -qF 'limit applied (Custom, 75 to 80 %)' "$tmp_root/out"
    run_helper limit
    check 'limit twice: exit 0, same state' [ "$(state)" = 'Custom|75|80' ]

    fake_tree 'Trickle Fast Standard Adaptive [Custom]' 75 80
    run_helper full
    check "full from Custom writes Adaptive, thresholds left ($(state))" [ "$(state)" = 'Adaptive|75|80' ]
    check 'full prints what it applied' grep -qF 'full applied (Adaptive)' "$tmp_root/out"
    run_helper full
    check 'full twice: exit 0, same state' [ "$(state)" = 'Adaptive|75|80' ]

    limit_from 95 100
    check "limit from 95/100: start first, always ordered ($(threshold_writes)), ends at 75/80" \
        always_ordered 95 100
    check 'limit from 95/100 ends at 75/80' [ "$(state)" = 'Custom|75|80' ]
    limit_from 50 60
    check "limit from 50/60: end first, always ordered ($(threshold_writes))" always_ordered 50 60
    check 'limit from 50/60 ends at 75/80' [ "$(state)" = 'Custom|75|80' ]
    limit_from 79 85
    check "limit from 79/85 always ordered ($(threshold_writes))" always_ordered 79 85

    check 'a wrong argument is refused, nothing written' refuses_and_writes_nothing charge
    check 'no argument is refused, nothing written' refuses_and_writes_nothing
    check 'two arguments are refused, nothing written' refuses_and_writes_nothing limit full
    check 'an option-like argument is refused, nothing written' refuses_and_writes_nothing --limit
    refuses_and_writes_nothing nope || true
    check 'a refusal prints the usage line' grep -qF 'usage: battery-charge-limit limit|full' "$tmp_root/err"

    fake_tree "$ADAPTIVE_TYPES" 60 70
    rm "$battery/charge_control_end_threshold"
    local before
    before="$(cat "$battery/charge_types")|$(cat "$battery/charge_control_start_threshold")"
    if run_helper limit; then
        check 'missing files: refused' false
    else
        check 'missing files: refused with a clear message' grep -qF 'is missing' "$tmp_root/err"
    fi
    check 'missing files: nothing written' [ "$(cat "$battery/charge_types")|$(cat "$battery/charge_control_start_threshold")" = "$before" ]

    fake_tree "$ADAPTIVE_TYPES" 60 'x'
    if run_helper limit; then
        check 'a threshold that is not a number: refused' false
    else
        check 'a threshold that is not a number: refused, nothing written' [ "$(state)" = "$ADAPTIVE_TYPES|60|x" ]
    fi

    if [ "$failures" -gt 0 ]; then
        printf '%d failure(s)\n' "$failures"
        exit 1
    fi
    printf 'ok: all tests passed\n'
}

main "$@"
