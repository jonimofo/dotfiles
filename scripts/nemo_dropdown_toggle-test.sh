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
readonly STUB_SLOW_XRANDR_SECONDS=1
readonly STUB_LAYOUT_KEY="_GTK_WORKAREAS_D0(CARDINAL) = 0, 30, 1920, 1050"
readonly STUB_HINTS_LINE="WM_NORMAL_HINTS(WM_SIZE_HINTS):"
readonly STUB_USER_POSITION_LINE=$'\t\tuser specified location: 0, 0'
readonly STUB_MIN_SIZE_LINE=$'\t\tprogram specified minimum size: 314 by 195'

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
if [[ $1 == -root && $2 == _NET_CLIENT_LIST ]]; then
    ids="'"$FOREIGN_WID_HEX"'"
    if [[ -f $STUB_ROOT/managed ]]; then
        ids="$ids, $(cat "$STUB_ROOT/managed")"
    fi
    echo "_NET_CLIENT_LIST(WINDOW): window id # $ids"
    exit 0
fi
if [[ $1 == -root ]]; then
    dir="$STUB_ROOT/root"
    shift 1
else
    dir="$STUB_ROOT/windows/$2"
    shift 2
fi
if [[ ! -d $dir ]]; then
    echo "X Error: BadWindow" >&2
    exit 1
fi
if [[ ${1:-} == -f ]]; then
    echo "$2(STRING) = \"$6\"" >"$dir/$2"
    exit 0
fi
for property in "$@"; do
    if [[ -f $dir/$property ]]; then
        cat "$dir/$property"
    else
        echo "$property:  not found."
    fi
done'
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
    # Records the file on its fd 9: the lock during a press, "closed" in the
    # background refresh.
    write_stub xrandr '
echo "xrandr-fd9 $(readlink /proc/$$/fd/9 || echo closed)" >>"$STUB_ROOT/calls.log"
if [[ -e $STUB_ROOT/xrandr-slow ]]; then
    sleep '"$STUB_SLOW_XRANDR_SECONDS"'
fi
echo "Monitors: 1"
cat "$STUB_ROOT/monitors"'
    write_stub notify-send ''
    # Answers the GdkX11 probe, writes the position hint, or unmaximizes: an
    # unmaximize request clears the maximized state at once but changes the
    # size only later, as a WM may.
    write_stub python3 '
if [[ ${2:-} == -c ]]; then
    if [[ -e $STUB_ROOT/gi-missing ]]; then
        exit 1
    fi
    exit 0
fi
code=$(cat)
dir="$STUB_ROOT/windows/$3"
if [[ $code == *XSetWMNormalHints* ]]; then
    echo "hint-writer $3" >>"$STUB_ROOT/calls.log"
    if [[ -e $STUB_ROOT/hint-fails ]]; then
        echo "window $3: cannot read WM_NORMAL_HINTS" >&2
        exit 1
    fi
    printf "\t\t%s\n" "user specified location: 0, 0" >>"$dir/WM_NORMAL_HINTS"
    exit 0
fi
echo "unmaximize $3" >>"$STUB_ROOT/calls.log"
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
    printf '%s\n' "$STUB_HINTS_LINE" "$STUB_MIN_SIZE_LINE" >"$dir/WM_NORMAL_HINTS"
}

# Resets the stub world: a foreign window is managed, Nemo's window is not.
reset_world() {
    rm -rf "$tmp_root/windows" "$tmp_root/runtime" "$tmp_root/managed" \
        "$tmp_root/calls.log" "$tmp_root/nemo-creates-window" "$tmp_root"/nemo-fds.* \
        "$tmp_root/windowsize-fails" "$tmp_root/root" "$tmp_root/hint-fails" \
        "$tmp_root/gi-missing" "$tmp_root/xrandr-slow"
    echo "$STUB_POINTER" >"$tmp_root/pointer"
    mkdir -p "$tmp_root/root"
    echo "$STUB_LAYOUT_KEY" >"$tmp_root/root/_GTK_WORKAREAS_D0"
    echo "$STUB_MONITORS" >"$tmp_root/monitors"
    mkdir -p "$tmp_root/runtime"
    chmod 700 "$tmp_root/runtime"
    touch "$tmp_root/calls.log"
    add_window "$FOREIGN_WID" '"terminator", "Terminator"'
    add_window "$NEMO_WID" '"nemo", "Nemo"'
}

toggle_with_stubs() {
    PATH="$stub_bin:$PATH" XDG_RUNTIME_DIR="$tmp_root/runtime" \
        NEMO_DROPDOWN_TIMEOUT_SECONDS="$TEST_TIMEOUT_SECONDS" "$toggle"
}

# Runs the toggle; leaves its exit code in $rc and its stderr in $err. Reading
# stderr through a pipe also waits for the background monitor refresh, which
# keeps stderr open until it ends.
run_toggle() {
    rc=0
    err=$(toggle_with_stubs 2>&1 >/dev/null) || rc=$?
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
    local name="create adopts, marks and hints the new window, next run hides it" saved
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
    if ! calls_contain "hint-writer $NEMO_WID"; then
        fail "$name" "the position hint was not set at creation"
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
    if ! calls_contain "python3 -I -c" || ! calls_contain "unmaximize $NEMO_WID"; then
        fail "$name" "no GdkX11 probe or no unmaximize request (rc=$rc err='$err')"
        return 0
    fi
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowmove $NEMO_WID 260 172"; then
        fail "$name" "not centered with the restored size (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

# The GdkX11 probe runs only once an unmaximize is needed, and its failure
# stops the run.
case_missing_gi_stops_the_unmaximize() {
    local name="python3-gi missing at unmaximize time exits 1 with a notification"
    local dir="$tmp_root/windows/$NEMO_WID"
    prepare_hidden_dropdown
    touch "$tmp_root/gi-missing"
    echo "_NET_WM_STATE(ATOM) = _NET_WM_STATE_MAXIMIZED_HORZ, _NET_WM_STATE_MAXIMIZED_VERT" >"$dir/_NET_WM_STATE"
    run_toggle
    if [[ $rc -ne 1 || $err != *"python3-gi with GdkX11 3.0 is not installed"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! calls_contain "notify-send " || calls_contain "unmaximize $NEMO_WID"; then
        fail "$name" "no notification, or an unmaximize was attempted"
        return 0
    fi
    pass "$name"
}

set_user_position_hint() {
    echo "$STUB_USER_POSITION_LINE" >>"$tmp_root/windows/$NEMO_WID/WM_NORMAL_HINTS"
}

# Prints the line number of the first recorded call starting with $1, 0 if none.
first_call_line() {
    local log number=0 line
    log=$(cat "$tmp_root/calls.log")
    while read -r line; do
        number=$((number + 1))
        if [[ $line == "$1"* ]]; then
            echo "$number"
            return 0
        fi
    done <<<"$log"
    echo 0
}

# is_before <first call> <second call>: both recorded, the first one earlier.
is_before() {
    local first second
    first=$(first_call_line "$1")
    second=$(first_call_line "$2")
    ((first > 0 && second > first))
}

case_show_moves_before_mapping() {
    local name="a show with the position hint moves the window before mapping it"
    prepare_hidden_dropdown
    set_user_position_hint
    run_toggle
    if [[ $rc -ne 0 ]] || ! is_before "xdotool windowmove $NEMO_WID 560 222" "xdotool windowmap $NEMO_WID"; then
        fail "$name" "windowmove not before windowmap (rc=$rc err='$err')"
        return 0
    fi
    if [[ $(count_calls "xdotool windowmove") -ne 1 ]]; then
        fail "$name" "moved $(count_calls "xdotool windowmove") times"
        return 0
    fi
    pass "$name"
}

case_plain_hide_and_show_run_no_python() {
    local name="no python on a hide and a show once the hint is set"
    prepare_hidden_dropdown
    set_user_position_hint
    run_toggle
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowunmap $NEMO_WID"; then
        fail "$name" "show then hide failed (rc=$rc err='$err')"
        return 0
    fi
    if calls_contain "python3 "; then
        fail "$name" "python3 ran"
        return 0
    fi
    pass "$name"
}

case_hint_is_written_once() {
    local name="a missing position hint is written once, keeping the other hints"
    local hints_file="$tmp_root/windows/$NEMO_WID/WM_NORMAL_HINTS"
    prepare_hidden_dropdown
    run_toggle
    run_toggle
    run_toggle
    if [[ $rc -ne 0 || $(count_calls "hint-writer $NEMO_WID") -ne 1 ]]; then
        fail "$name" "hint written $(count_calls "hint-writer $NEMO_WID") time(s) (rc=$rc err='$err')"
        return 0
    fi
    if [[ $(cat "$hints_file") != *"minimum size"* ]]; then
        fail "$name" "the other hints were lost"
        return 0
    fi
    pass "$name"
}

# The hint cannot be set: the window is mapped, then moved, and the press
# still succeeds without a notification.
case_hint_failure_falls_back_to_moving_after_map() {
    local name="a failed hint write maps then moves, exit 0, no notification"
    prepare_hidden_dropdown
    touch "$tmp_root/hint-fails"
    run_toggle
    if [[ $rc -ne 0 || $err != *"will be moved after it is mapped"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! is_before "xdotool windowmap $NEMO_WID" "xdotool windowmove $NEMO_WID 560 222" || calls_contain "notify-send "; then
        fail "$name" "not mapped then moved, or a notification was sent"
        return 0
    fi
    pass "$name"
}

# Without frame extents the window is mapped first, then the frame is taken
# as the client area: 800x600 at 560,240.
case_missing_extents_fall_back_to_moving_after_map() {
    local name="no frame extents while hidden: mapped, then moved without a frame"
    prepare_hidden_dropdown
    set_user_position_hint
    rm "$tmp_root/windows/$NEMO_WID/_NET_FRAME_EXTENTS"
    run_toggle
    if [[ $rc -ne 0 || $err != *"has no frame extents"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! is_before "xdotool windowmap $NEMO_WID" "xdotool windowmove $NEMO_WID 560 240"; then
        fail "$name" "not mapped then moved to 560 240"
        return 0
    fi
    pass "$name"
}

readonly CACHE_MONITORS=" 0: +*CACHED-1 1920/527x1080/296+1920+0  CACHED-1"

# write_monitor_cache <key>: a cache that puts the only monitor at +1920+0,
# while the xrandr stub reports one at +0+0.
write_monitor_cache() {
    printf '%s\n%s\n%s\n' "$1" "Monitors: 1" "$CACHE_MONITORS" >"$tmp_root/runtime/nemo-dropdown/monitors"
}

# Pointer 2000,100. From the cache: frame 800x636 at 1920 + 560, 222. From
# xrandr the pointer is outside the only monitor, so the first one: 560,222.
prepare_cache_case() {
    prepare_hidden_dropdown
    set_user_position_hint
    echo "2000 100" >"$tmp_root/pointer"
}

synchronous_xrandr_calls() {
    count_calls "xrandr-fd9 $tmp_root/runtime/nemo-dropdown/lock"
}

case_cache_hit_skips_xrandr() {
    local name="a cache with the current key is used, no xrandr during the press"
    prepare_cache_case
    write_monitor_cache "$STUB_LAYOUT_KEY"
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowmove $NEMO_WID 2480 222"; then
        fail "$name" "not centered on the cached monitor (rc=$rc err='$err')"
        return 0
    fi
    if [[ $(synchronous_xrandr_calls) -ne 0 ]]; then
        fail "$name" "xrandr ran while holding the lock"
        return 0
    fi
    pass "$name"
}

# check_cache_fallback <case name>: the press calls xrandr itself, then the
# background refresh stores the current key and the xrandr monitors.
check_cache_fallback() {
    local name=$1 cache
    run_toggle
    if [[ $rc -ne 0 || $(synchronous_xrandr_calls) -ne 1 ]] || ! calls_contain "xdotool windowmove $NEMO_WID 560 222"; then
        fail "$name" "no synchronous xrandr or wrong place (rc=$rc err='$err')"
        return 0
    fi
    cache=$(cat "$tmp_root/runtime/nemo-dropdown/monitors" 2>/dev/null || true)
    if [[ $cache != "$STUB_LAYOUT_KEY"*"$STUB_MONITORS"* ]]; then
        fail "$name" "cache not refreshed: '$cache'"
        return 0
    fi
    pass "$name"
}

case_missing_cache_calls_xrandr() {
    prepare_cache_case
    check_cache_fallback "no cache: xrandr during the press, cache written after"
}

case_changed_key_calls_xrandr() {
    prepare_cache_case
    write_monitor_cache "_GTK_WORKAREAS_D0(CARDINAL) = 0, 0, 1280, 1024"
    check_cache_fallback "a cache saved under another key is not used"
}

case_garbage_cache_calls_xrandr() {
    prepare_cache_case
    printf '%s\n%s\n' "$STUB_LAYOUT_KEY" "garbage" >"$tmp_root/runtime/nemo-dropdown/monitors"
    check_cache_fallback "an unreadable cache falls back to xrandr"
}

case_no_layout_key_always_calls_xrandr() {
    local name="no layout key: xrandr at every show, no cache written"
    prepare_cache_case
    rm "$tmp_root/root/_GTK_WORKAREAS_D0"
    run_toggle
    run_toggle
    run_toggle
    if [[ $rc -ne 0 || $(synchronous_xrandr_calls) -ne 2 || -e $tmp_root/runtime/nemo-dropdown/monitors ]]; then
        fail "$name" "$(synchronous_xrandr_calls) synchronous xrandr call(s) (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

# The refresh runs with fd 9 closed: a press during a slow refresh is not
# skipped as if another run held the lock.
case_background_refresh_does_not_hold_lock() {
    local name="the background refresh does not hold the lock"
    prepare_cache_case
    touch "$tmp_root/xrandr-slow"
    write_monitor_cache "$STUB_LAYOUT_KEY"
    rc=0
    toggle_with_stubs 2>"$tmp_root/stderr" >/dev/null || rc=$?
    run_toggle
    sleep "$STUB_SLOW_XRANDR_SECONDS"
    if [[ $rc -ne 0 ]] || ! calls_contain "xdotool windowunmap $NEMO_WID"; then
        fail "$name" "the press during the refresh did not hide (rc=$rc err='$err')"
        return 0
    fi
    if ! calls_contain "xrandr-fd9 closed"; then
        fail "$name" "the refresh did not run with fd 9 closed"
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
case_missing_gi_stops_the_unmaximize
case_show_moves_before_mapping
case_plain_hide_and_show_run_no_python
case_hint_is_written_once
case_hint_failure_falls_back_to_moving_after_map
case_missing_extents_fall_back_to_moving_after_map
case_cache_hit_skips_xrandr
case_missing_cache_calls_xrandr
case_changed_key_calls_xrandr
case_garbage_cache_calls_xrandr
case_no_layout_key_always_calls_xrandr
case_background_refresh_does_not_hold_lock

if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
