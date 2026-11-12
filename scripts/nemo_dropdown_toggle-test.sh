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
readonly STUB_CLIENT_WIDTH=800
readonly STUB_CLIENT_HEIGHT=600
readonly STUB_POINTER="100 100"
readonly STUB_MONITORS=" 0: +*TEST-1 1920/527x1080/296+0+0  TEST-1"
readonly STUB_UNMAXIMIZED_SIZE="1400 700"
readonly STUB_UNMAXIMIZE_DELAY_SECONDS=0.3

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
title=nemo
if [[ -f $dir/title ]]; then
    title=$(cat "$dir/title")
fi
read -r width height <"$dir/size"
echo ""
echo "xwininfo: Window id: $2 \"$title\""
echo ""
echo "  Width: $width"
echo "  Height: $height"
if [[ -e $dir/unmapped ]]; then
    echo "  Map State: IsUnMapped"
else
    echo "  Map State: IsViewable"
fi'
    write_stub xdotool '
case $1 in
    get_desktop) echo 0 ;;
    getmouselocation)
        read -r x y <"$STUB_ROOT/pointer"
        printf "X=%s\nY=%s\nSCREEN=0\nWINDOW=1\n" "$x" "$y"
        ;;
    windowsize)
        if [[ -e $STUB_ROOT/windowsize-fails ]]; then
            exit 1
        fi
        ;;
    windowunmap)
        touch "$STUB_ROOT/windows/$2/unmapped"
        rm -f "$STUB_ROOT/managed"
        ;;
    windowmap)
        rm -f "$STUB_ROOT/windows/$2/unmapped"
        echo "'"$NEMO_WID_HEX"'" >"$STUB_ROOT/managed"
        ;;
esac'
    write_stub xrandr '
echo "Monitors: 1"
cat "$STUB_ROOT/monitors"'
    write_stub notify-send ''
    # Answers the dependency probe; an unmaximize request clears the maximized
    # state at once but changes the size only later, as a WM may.
    write_stub python3 '
if [[ ${2:-} != - ]]; then
    exit 0
fi
cat >/dev/null
dir="$STUB_ROOT/windows/$3"
rm -f "$dir/_NET_WM_STATE"
(sleep '"$STUB_UNMAXIMIZE_DELAY_SECONDS"'; echo "'"$STUB_UNMAXIMIZED_SIZE"'" >"$dir/size") &'
}

add_window() {
    local class=$2 dir="$tmp_root/windows/$1"
    mkdir -p "$dir"
    echo "WM_CLASS(STRING) = $class" >"$dir/WM_CLASS"
    echo "_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_NORMAL" >"$dir/_NET_WM_WINDOW_TYPE"
    echo "_NET_WM_DESKTOP(CARDINAL) = 0" >"$dir/_NET_WM_DESKTOP"
    echo "_NET_FRAME_EXTENTS(CARDINAL) = 0, 0, 36, 0" >"$dir/_NET_FRAME_EXTENTS"
    echo "$STUB_CLIENT_WIDTH $STUB_CLIENT_HEIGHT" >"$dir/size"
}

# Resets the stub world: a foreign window is managed, Nemo's window is not.
reset_world() {
    rm -rf "$tmp_root/windows" "$tmp_root/runtime" "$tmp_root/managed" \
        "$tmp_root/calls.log" "$tmp_root/nemo-creates-window" "$tmp_root"/nemo-fds.* \
        "$tmp_root/windowsize-fails"
    echo "$STUB_POINTER" >"$tmp_root/pointer"
    echo "$STUB_MONITORS" >"$tmp_root/monitors"
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

# Prints how many recorded calls start with $1.
count_calls() {
    local log count=0 line
    log=$(cat "$tmp_root/calls.log")
    while read -r line; do
        if [[ $line == "$1"* ]]; then
            count=$((count + 1))
        fi
    done <<<"$log"
    echo "$count"
}

nemo_launches() {
    count_calls "nemo "
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

# Monitor 1920x1080, frame extents 0 0 36 0. A new dropdown is 80% x 80%:
# frame 1536x864 at 192,108. Shown again, the stub window reports a client of
# STUB_CLIENT_WIDTH x STUB_CLIENT_HEIGHT: frame 800x636 at 560,222, not resized.
case_size_is_set_once_and_always_centered() {
    local name="new dropdown is sized once, every show centers it" resizes
    reset_world
    touch "$tmp_root/nemo-creates-window"
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowsize $NEMO_WID 1536 828" \
        || ! calls_contain "xdotool windowmove $NEMO_WID 192 108"; then
        fail "$name" "create did not size and center (rc=$rc err='$err')"
        return 0
    fi
    run_toggle
    run_toggle
    resizes=$(count_calls "xdotool windowsize")
    if [[ $rc -ne 0 || $resizes -ne 1 ]] || ! calls_contain "xdotool windowmove $NEMO_WID 560 222"; then
        fail "$name" "show resized $resizes time(s) or did not center (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

case_failed_resize_stops_the_run() {
    local name="a failed resize exits 1 with a notification, no centering"
    reset_world
    touch "$tmp_root/nemo-creates-window" "$tmp_root/windowsize-fails"
    run_toggle
    if [[ $rc -ne 1 || $err != *"could not resize window $NEMO_WID"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! calls_contain "notify-send " || calls_contain "xdotool windowmove"; then
        fail "$name" "no notification, or the window was centered anyway"
        return 0
    fi
    pass "$name"
}

# Leaves a marked, hidden dropdown whose id is saved: the next run shows it.
prepare_hidden_dropdown() {
    local dir="$tmp_root/windows/$NEMO_WID"
    reset_world
    mkdir -m 700 "$tmp_root/runtime/nemo-dropdown"
    echo "$NEMO_WID" >"$tmp_root/runtime/nemo-dropdown/wid"
    echo 'NEMO_DROPDOWN(STRING) = "1"' >"$dir/NEMO_DROPDOWN"
    touch "$dir/unmapped"
}

# check_show_moves_to <case name> <expected "x y">: runs a show and checks the move.
check_show_moves_to() {
    local name=$1 position=$2
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowmove $NEMO_WID $position"; then
        fail "$name" "not moved to $position (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

# Client 2000x1200 plus a 36 px title bar is larger than the 1920x1080 monitor.
case_oversize_window_starts_at_monitor_origin() {
    prepare_hidden_dropdown
    echo "2000 1200" >"$tmp_root/windows/$NEMO_WID/size"
    check_show_moves_to "a window larger than the monitor starts at its origin" "0 0"
}

# Frame 800x636 on the second monitor, at +1920+0: 1920 + 560, 0 + 222.
case_offset_monitor_adds_its_origin() {
    prepare_hidden_dropdown
    printf '%s\n%s\n' "$STUB_MONITORS" " 1: +TEST-2 1920/527x1080/296+1920+0  TEST-2" >"$tmp_root/monitors"
    echo "2000 100" >"$tmp_root/pointer"
    check_show_moves_to "the pointer's monitor origin is added" "2480 222"
}

# A title cannot inject a size: frame stays 800x636, at 560,222.
case_title_cannot_fake_the_size() {
    prepare_hidden_dropdown
    echo "Width: 7 notes Height: 9" >"$tmp_root/windows/$NEMO_WID/title"
    check_show_moves_to "a window title cannot fake its size" "560 222"
}

# Maximized at 1920x1044; once restored the client is 1400x700, frame 1400x736,
# centered at 260,172. Centering with the maximized size would give 0,0.
case_maximized_dropdown_is_unmaximized_first() {
    local name="a maximized dropdown is unmaximized, then centered with its new size"
    local dir="$tmp_root/windows/$NEMO_WID"
    prepare_hidden_dropdown
    echo "1920 1044" >"$dir/size"
    echo "_NET_WM_STATE(ATOM) = _NET_WM_STATE_MAXIMIZED_HORZ, _NET_WM_STATE_MAXIMIZED_VERT" >"$dir/_NET_WM_STATE"
    run_toggle
    if ! calls_contain "python3 -I - $NEMO_WID"; then
        fail "$name" "no unmaximize request (rc=$rc err='$err')"
        return 0
    fi
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowmove $NEMO_WID 260 172"; then
        fail "$name" "not centered with the restored size (rc=$rc err='$err')"
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
case_size_is_set_once_and_always_centered
case_failed_resize_stops_the_run
case_oversize_window_starts_at_monitor_origin
case_offset_monitor_adds_its_origin
case_title_cannot_fake_the_size
case_maximized_dropdown_is_unmaximized_first
case_symlinked_lock_is_refused

if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
