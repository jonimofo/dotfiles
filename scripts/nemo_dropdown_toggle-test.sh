#!/bin/bash
# Regression tests for nemo_dropdown_toggle.sh, with stub X tools and a stub
# nemo on PATH: no X call, no real Nemo, no notification reaches the desktop.
# Usage: scripts/nemo_dropdown_toggle-test.sh [script to test]
# The stub bodies are single-quoted on purpose: they expand when a stub runs.
# shellcheck disable=SC2016
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
toggle="${1:-$script_dir/nemo_dropdown_toggle.sh}"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/nemo-dropdown-test.XXXXXX")"
stub_bin="$tmp_root/bin"
failures=0

readonly NEMO_WID=256
readonly NEMO_WID_HEX=0x100
readonly FOREIGN_WID=113246211
readonly FOREIGN_WID_HEX=0x6c00003
readonly TEST_TIMEOUT_SECONDS=1

cleanup() {
    local pid_file pid
    for pid_file in "$tmp_root"/nemo-pid.*; do
        if [[ -f $pid_file ]]; then
            pid=$(cat "$pid_file")
            kill "$pid" 2>/dev/null || true
        fi
    done
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

write_stub() {
    local name=$1 body=$2
    printf '#!/bin/bash\nset -euo pipefail\nSTUB_ROOT=%q\necho "%s $*" >>"$STUB_ROOT/calls.log"\n%s\n' \
        "$tmp_root" "$name" "$body" >"$stub_bin/$name"
    chmod +x "$stub_bin/$name"
}

# The nemo stub records its own open files, adds the new window to the managed
# list when $STUB_ROOT/nemo-creates-window exists, then stays alive like the
# real single-instance Nemo, keeping every fd it inherited.
write_stubs() {
    mkdir -p "$stub_bin"
    write_stub nemo '
for fd in /proc/$$/fd/*; do
    readlink "$fd" || true
done >"$STUB_ROOT/nemo-fds.$$"
echo "$$" >"$STUB_ROOT/nemo-pid.$$"
if [[ -e $STUB_ROOT/nemo-creates-window ]]; then
    echo "'"$NEMO_WID_HEX"'" >"$STUB_ROOT/managed"
fi
exec sleep 30'
    write_stub xprop '
if [[ $1 == -root ]]; then
    ids="'"$FOREIGN_WID_HEX"'"
    if [[ -f $STUB_ROOT/managed ]]; then
        ids="$ids, $(cat "$STUB_ROOT/managed")"
    fi
    echo "_NET_CLIENT_LIST(WINDOW): window id # $ids"
    exit 0
fi
dir="$STUB_ROOT/windows/$2"
if [[ ! -d $dir ]]; then
    echo "X Error: BadWindow" >&2
    exit 1
fi
if [[ ${3:-} == -f ]]; then
    echo "$4(STRING) = \"$8\"" >"$dir/$4"
    exit 0
fi
if [[ -f $dir/$3 ]]; then
    cat "$dir/$3"
else
    echo "$3:  not found."
fi'
    write_stub xwininfo '
dir="$STUB_ROOT/windows/$2"
if [[ ! -d $dir ]]; then
    echo "xwininfo: error: No such window" >&2
    exit 1
fi
echo "  Map State: IsViewable"'
    write_stub xdotool '
case $1 in
    get_desktop) echo 0 ;;
    getmouselocation) printf "X=100\nY=100\nSCREEN=0\nWINDOW=1\n" ;;
esac'
    write_stub xrandr '
echo "Monitors: 1"
echo " 0: +*TEST-1 1920/527x1080/296+0+0  TEST-1"'
    write_stub notify-send ''
}

add_window() {
    local class=$2 dir="$tmp_root/windows/$1"
    mkdir -p "$dir"
    echo "WM_CLASS(STRING) = $class" >"$dir/WM_CLASS"
    echo "_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_NORMAL" >"$dir/_NET_WM_WINDOW_TYPE"
    echo "_NET_WM_DESKTOP(CARDINAL) = 0" >"$dir/_NET_WM_DESKTOP"
    echo "_NET_FRAME_EXTENTS(CARDINAL) = 0, 0, 36, 0" >"$dir/_NET_FRAME_EXTENTS"
}

# Resets the stub world: a foreign window is managed, Nemo's window is not.
reset_world() {
    rm -rf "$tmp_root/windows" "$tmp_root/runtime" "$tmp_root/managed" \
        "$tmp_root/calls.log" "$tmp_root/nemo-creates-window" "$tmp_root"/nemo-fds.*
    mkdir -p "$tmp_root/runtime"
    chmod 700 "$tmp_root/runtime"
    touch "$tmp_root/calls.log"
    add_window "$FOREIGN_WID" '"terminator", "Terminator"'
    add_window "$NEMO_WID" '"nemo", "Nemo"'
}

# Runs the toggle; leaves its exit code in $rc and its stderr in $err.
run_toggle() {
    rc=0
    PATH="$stub_bin:$PATH" XDG_RUNTIME_DIR="$tmp_root/runtime" \
        NEMO_DROPDOWN_TIMEOUT_SECONDS="$TEST_TIMEOUT_SECONDS" \
        "$toggle" 2>"$tmp_root/stderr" || rc=$?
    err=$(cat "$tmp_root/stderr")
}

nemo_launches() {
    local log count=0 line
    log=$(cat "$tmp_root/calls.log")
    while read -r line; do
        if [[ $line == "nemo "* ]]; then
            count=$((count + 1))
        fi
    done <<<"$log"
    echo "$count"
}

calls_contain() {
    local log
    log=$(cat "$tmp_root/calls.log")
    [[ $log == *"$1"* ]]
}

case_launched_nemo_does_not_hold_lock() {
    local name="launched nemo does not inherit the lock" fds_file fds
    reset_world
    run_toggle
    fds_file=$(find "$tmp_root" -maxdepth 1 -name 'nemo-fds.*' -print -quit)
    if [[ -z $fds_file ]]; then
        fail "$name" "the nemo stub never ran (rc=$rc err='$err')"
        return 0
    fi
    fds=$(cat "$fds_file")
    if [[ $fds == *"$tmp_root/runtime/nemo-dropdown/lock"* ]]; then
        fail "$name" "nemo has the lock file open"
        return 0
    fi
    pass "$name"
}

case_second_run_gets_lock() {
    local name="second run gets the lock while the launched nemo lives"
    reset_world
    run_toggle
    run_toggle
    if [[ $(nemo_launches) -ne 2 || $err != *"no new Nemo window appeared"* ]]; then
        fail "$name" "nemo launched $(nemo_launches) time(s), second run rc=$rc err='$err'"
        return 0
    fi
    pass "$name"
}

case_timeout_exits_with_message() {
    local name="timeout exits 1 with a message and a notification"
    reset_world
    run_toggle
    if [[ $rc -ne 1 || $err != *"ran 'nemo $HOME' but no new Nemo window appeared within ${TEST_TIMEOUT_SECONDS}s"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! calls_contain "notify-send "; then
        fail "$name" "no notification sent"
        return 0
    fi
    pass "$name"
}

# check_rejected <case name> <saved wid>
check_rejected() {
    local name=$1 saved=$2
    reset_world
    mkdir -m 700 "$tmp_root/runtime/nemo-dropdown"
    echo "$saved" >"$tmp_root/runtime/nemo-dropdown/wid"
    run_toggle
    if [[ $(nemo_launches) -ne 1 ]]; then
        fail "$name" "saved wid '$saved' was not replaced by a new dropdown (rc=$rc err='$err')"
        return 0
    fi
    if calls_contain "xdotool windowunmap $saved" || calls_contain "xprop -id $saved -f"; then
        fail "$name" "the script acted on window '$saved'"
        return 0
    fi
    pass "$name"
}

case_create_then_hide() {
    local name="create adopts and marks the new window, next run hides it" saved
    reset_world
    touch "$tmp_root/nemo-creates-window"
    run_toggle
    saved=$(cat "$tmp_root/runtime/nemo-dropdown/wid" 2>/dev/null || true)
    if [[ $rc -ne 0 || $saved != "$NEMO_WID" ]]; then
        fail "$name" "first run rc=$rc saved='$saved' err='$err'"
        return 0
    fi
    if ! calls_contain "xprop -id $NEMO_WID -f NEMO_DROPDOWN"; then
        fail "$name" "window $NEMO_WID was not marked"
        return 0
    fi
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowunmap $NEMO_WID"; then
        fail "$name" "second run did not hide it (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

case_symlinked_lock_is_refused() {
    local name="symlinked lock file is refused"
    reset_world
    mkdir -m 700 "$tmp_root/runtime/nemo-dropdown"
    ln -s "$tmp_root/elsewhere" "$tmp_root/runtime/nemo-dropdown/lock"
    run_toggle
    if [[ $rc -ne 1 || $err != *"it is a symlink"* || -e $tmp_root/elsewhere ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    pass "$name"
}

write_stubs
case_launched_nemo_does_not_hold_lock
case_second_run_gets_lock
case_timeout_exits_with_message
check_rejected "non-numeric saved wid is rejected" "abc"
check_rejected "foreign saved wid is rejected" "$FOREIGN_WID"
case_create_then_hide
case_symlinked_lock_is_refused

if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
