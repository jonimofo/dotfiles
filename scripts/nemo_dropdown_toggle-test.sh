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
state_dir="$tmp_root/runtime/nemo-dropdown"
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
readonly TEST_POLL_SECONDS=0.02
# 250 polls of TEST_POLL_SECONDS: a 5 s ceiling, so a broken case cannot hang.
readonly TEST_WAIT_POLLS=250
readonly SYSTEM_PATH=$PATH
readonly PASSTHROUGH_PROGRAMS=(flock chmod setsid sleep rm mkdir id)
readonly SHOW_STARTS_BEFORE_MAP=6
readonly HIDE_STARTS=5
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

# A stub body runs with the system PATH for its own helpers (cat, touch...).
write_stub() {
    local name=$1 body=$2
    printf '#!/bin/bash\nset -euo pipefail\nPATH=%q\nSTUB_ROOT=%q\necho "%s $*" >>"$STUB_ROOT/calls.log"\n%s\n' \
        "$SYSTEM_PATH" "$tmp_root" "$name" "$body" >"$stub_bin/$name"
    chmod +x "$stub_bin/$name"
}

# A pass-through stub logs its call, so that it is counted, then runs the real
# program with the toggle's PATH: setsid then starts the nemo stub, never Nemo.
write_passthrough_stub() {
    local name=$1 program
    program=$(command -v "$name")
    printf '#!/bin/bash\necho "%s $*" >>%q\nexec %q "$@"\n' \
        "$name" "$tmp_root/calls.log" "$program" >"$stub_bin/$name"
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
    # The root's _NET_CLIENT_LIST is computed from $STUB_ROOT/managed, every
    # other property is a file, printed in the order asked as xprop does.
    write_stub xprop '
if [[ $1 == -root ]]; then
    ids="'"$FOREIGN_WID_HEX"'"
    if [[ -f $STUB_ROOT/managed ]]; then
        ids="$ids, $(cat "$STUB_ROOT/managed")"
    fi
    echo "_NET_CLIENT_LIST(WINDOW): window id # $ids" >"$STUB_ROOT/root/_NET_CLIENT_LIST"
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
    # $STUB_ROOT/xwininfo-fails-when-mapped makes it fail on the mapped window,
    # only at the size the file holds when it is not empty.
    write_stub xwininfo '
dir="$STUB_ROOT/windows/$2"
if [[ ! -d $dir ]]; then
    echo "xwininfo: error: No such window" >&2
    exit 1
fi
if [[ -e $STUB_ROOT/xwininfo-fails-when-mapped && ! -e $dir/unmapped ]]; then
    fails_at=$(cat "$STUB_ROOT/xwininfo-fails-when-mapped")
    if [[ -z $fails_at || $fails_at == "$(cat "$dir/size")" ]]; then
        echo "xwininfo: error: No such window" >&2
        exit 1
    fi
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
    # Runs a command chain as xdotool does: each command takes its arguments,
    # the next word starts the next command, and the first failure ends the
    # chain with status 1. Each command is logged as "xdo <command> <args>";
    # $STUB_ROOT/xdo-fails-<command> makes that command fail, and
    # $STUB_ROOT/unmap-keeps-managed keeps an unmapped window managed.
    write_stub xdotool '
while (($# > 0)); do
    command=$1
    shift
    case $command in
        get_desktop) count=0 ;;
        getmouselocation | windowmap | windowunmap | windowactivate) count=1 ;;
        set_desktop_for_window) count=2 ;;
        windowmove | windowsize) count=3 ;;
        *)
            echo "xdotool stub: unknown command $command" >&2
            exit 2
            ;;
    esac
    arguments=("${@:1:count}")
    shift "$count"
    echo "xdo $command ${arguments[*]}" >>"$STUB_ROOT/calls.log"
    if [[ -e $STUB_ROOT/xdo-fails-$command ]]; then
        exit 1
    fi
    case $command in
        get_desktop) echo 0 ;;
        getmouselocation)
            read -r x y <"$STUB_ROOT/pointer"
            printf "X=%s\nY=%s\nSCREEN=0\nWINDOW=1\n" "$x" "$y"
            ;;
        set_desktop_for_window)
            echo "_NET_WM_DESKTOP(CARDINAL) = ${arguments[1]}" >"$STUB_ROOT/windows/${arguments[0]}/_NET_WM_DESKTOP"
            ;;
        windowunmap)
            touch "$STUB_ROOT/windows/${arguments[0]}/unmapped"
            if [[ ! -e $STUB_ROOT/unmap-keeps-managed ]]; then
                rm -f "$STUB_ROOT/managed"
            fi
            ;;
        windowmap)
            rm -f "$STUB_ROOT/windows/${arguments[0]}/unmapped"
            echo "'"$NEMO_WID_HEX"'" >"$STUB_ROOT/managed"
            ;;
    esac
done'
    # Records the file on its fd 9: the lock during a press.
    write_stub xrandr '
echo "xrandr-fd9 $(readlink /proc/$$/fd/9 || echo closed)" >>"$STUB_ROOT/calls.log"
if [[ -e $STUB_ROOT/xrandr-fails ]]; then
    exit 1
fi
echo "Monitors: 1"
cat "$STUB_ROOT/monitors"'
    write_stub notify-send ''
    # $STUB_ROOT/mv-fails makes it fail. With $STUB_ROOT/mv-blocks it records
    # the file on its fd 9, creates mv-started, then waits for mv-release.
    write_stub mv '
if [[ -e $STUB_ROOT/mv-fails ]]; then
    exit 1
fi
if [[ -e $STUB_ROOT/mv-blocks ]]; then
    echo "mv-fd9 $(readlink /proc/$$/fd/9 || echo closed)" >>"$STUB_ROOT/calls.log"
    touch "$STUB_ROOT/mv-started"
    for ((poll = 0; poll < '"$TEST_WAIT_POLLS"'; poll++)); do
        if [[ -e $STUB_ROOT/mv-release ]]; then
            break
        fi
        sleep '"$TEST_POLL_SECONDS"'
    done
fi
exec '"$(command -v mv)"' "$@"'
    local program
    for program in "${PASSTHROUGH_PROGRAMS[@]}"; do
        write_passthrough_stub "$program"
    done
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
    echo "'"$STUB_USER_POSITION_LINE"'" >>"$dir/WM_NORMAL_HINTS"
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
        "$tmp_root"/xdo-fails-* "$tmp_root/root" "$tmp_root/hint-fails" \
        "$tmp_root/gi-missing" "$tmp_root/xwininfo-fails-when-mapped" \
        "$tmp_root/unmap-keeps-managed" "$tmp_root/xrandr-fails" "$tmp_root"/mv-* \
        "$tmp_root/fake-tmp" "$tmp_root/stderr"
    echo "$STUB_POINTER" >"$tmp_root/pointer"
    mkdir -p "$tmp_root/root"
    echo "$STUB_LAYOUT_KEY" >"$tmp_root/root/_GTK_WORKAREAS_D0"
    echo "_NET_CURRENT_DESKTOP(CARDINAL) = 0" >"$tmp_root/root/_NET_CURRENT_DESKTOP"
    echo "$STUB_MONITORS" >"$tmp_root/monitors"
    mkdir -p "$tmp_root/runtime"
    chmod 700 "$tmp_root/runtime"
    touch "$tmp_root/calls.log"
    add_window "$FOREIGN_WID" '"terminator", "Terminator"'
    add_window "$NEMO_WID" '"nemo", "Nemo"'
}

# PATH holds only the stubs: a program the script starts without a stub fails
# the case instead of escaping the process counts. With DISPLAY empty, no X
# client can reach the real desktop.
toggle_with_stubs() {
    PATH="$stub_bin" DISPLAY="" XDG_RUNTIME_DIR="$tmp_root/runtime" \
        NEMO_DROPDOWN_TIMEOUT_SECONDS="$TEST_TIMEOUT_SECONDS" "$toggle"
}

# Runs the toggle without XDG_RUNTIME_DIR, in user and mount namespaces whose
# /tmp is $tmp_root/fake-tmp, with $tmp_root bound at its own path inside:
# the shared fallback lands under the test root, never in the real /tmp. The
# script runs from a copy in $tmp_root, which stays reachable there.
toggle_in_private_tmp() {
    local fake_tmp="$tmp_root/fake-tmp"
    local inside="$fake_tmp${tmp_root#/tmp}" copy="$tmp_root/toggle-copy/${toggle##*/}"
    mkdir -p "$inside" "${copy%/*}"
    cp "$toggle" "$copy"
    unshare --user --map-root-user --mount /bin/bash -c '
set -euo pipefail
mount --bind "$1" "$2"
mount --rbind "$3" /tmp
exec unshare --user --map-user="$4" --map-group="$5" env -u XDG_RUNTIME_DIR \
    PATH="$6" DISPLAY="" NEMO_DROPDOWN_TIMEOUT_SECONDS="$7" "$8"' \
        _ "$tmp_root" "$inside" "$fake_tmp" "$UID" "$(id -g)" "$stub_bin" "$TEST_TIMEOUT_SECONDS" "$copy"
}

# run_toggle [runner]: leaves the exit code in $rc and stderr in $err. Reading
# stderr through a pipe also waits for the background cache write, which
# keeps stderr open until it ends.
run_toggle() {
    local runner=${1:-toggle_with_stubs}
    rc=0
    err=$("$runner" 2>&1 >/dev/null) || rc=$?
}

# wait_for_file <path>: fails when it does not appear within the ceiling.
wait_for_file() {
    local poll
    for ((poll = 0; poll < TEST_WAIT_POLLS; poll++)); do
        if [[ -e $1 ]]; then
            return 0
        fi
        sleep "$TEST_POLL_SECONDS"
    done
    return 1
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
    if [[ $fds == *"$state_dir/lock"* ]]; then
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
    mkdir -m 700 "$state_dir"
    echo "$saved" >"$state_dir/wid"
    run_toggle
    if [[ $(nemo_launches) -ne 1 ]]; then
        fail "$name" "saved wid '$saved' was not replaced by a new dropdown (rc=$rc err='$err')"
        return 0
    fi
    if calls_contain "xdo windowunmap $saved" || calls_contain "xprop -id $saved -f"; then
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
    saved=$(cat "$state_dir/wid" 2>/dev/null || true)
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
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowunmap $NEMO_WID"; then
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
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowsize $NEMO_WID 1536 828" \
        || ! calls_contain "xdo windowmove $NEMO_WID 192 108"; then
        fail "$name" "create did not size and center (rc=$rc err='$err')"
        return 0
    fi
    run_toggle
    run_toggle
    resizes=$(count_calls "xdo windowsize")
    if [[ $rc -ne 0 || $resizes -ne 1 ]] || ! calls_contain "xdo windowmove $NEMO_WID 560 222"; then
        fail "$name" "show resized $resizes time(s) or did not center (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

case_failed_resize_stops_the_run() {
    local name="a failed resize exits 1 with a notification, no centering"
    reset_world
    touch "$tmp_root/nemo-creates-window" "$tmp_root/xdo-fails-windowsize"
    run_toggle
    if [[ $rc -ne 1 || $err != *"could not resize window $NEMO_WID"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! calls_contain "notify-send " || calls_contain "xdo windowmove"; then
        fail "$name" "no notification, or the window was centered anyway"
        return 0
    fi
    pass "$name"
}

# prepare_hidden_dropdown [state directory]: leaves a marked, hidden dropdown
# whose id is saved there: the next run shows it.
prepare_hidden_dropdown() {
    local state=${1:-$state_dir} dir="$tmp_root/windows/$NEMO_WID"
    reset_world
    mkdir -p "${state%/*}"
    mkdir -m 700 "$state"
    echo "$NEMO_WID" >"$state/wid"
    echo 'NEMO_DROPDOWN(STRING) = "1"' >"$dir/NEMO_DROPDOWN"
    touch "$dir/unmapped"
}

# check_show_moves_to <case name> <expected "x y">: runs a show and checks the move.
check_show_moves_to() {
    local name=$1 position=$2
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowmove $NEMO_WID $position"; then
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
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowmove $NEMO_WID 260 172"; then
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
    if [[ $rc -ne 0 ]] || ! is_before "xdo windowmove $NEMO_WID 560 222" "xdo windowmap $NEMO_WID"; then
        fail "$name" "windowmove not before windowmap (rc=$rc err='$err')"
        return 0
    fi
    if [[ $(count_calls "xdo windowmove") -ne 1 ]]; then
        fail "$name" "moved $(count_calls "xdo windowmove") times"
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
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowunmap $NEMO_WID"; then
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
    if ! is_before "xdo windowmap $NEMO_WID" "xdo windowmove $NEMO_WID 560 222" || calls_contain "notify-send "; then
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
    if ! is_before "xdo windowmap $NEMO_WID" "xdo windowmove $NEMO_WID 560 240"; then
        fail "$name" "not mapped then moved to 560 240"
        return 0
    fi
    pass "$name"
}

readonly CACHE_MONITORS=" 0: +*CACHED-1 1920/527x1080/296+1920+0  CACHED-1"

# write_monitor_cache <key>: a cache that puts the only monitor at +1920+0,
# while the xrandr stub reports one at +0+0.
write_monitor_cache() {
    printf '%s\n%s\n%s\n' "$1" "Monitors: 1" "$CACHE_MONITORS" >"$state_dir/monitors"
}

# Pointer 2000,100. From the cache: frame 800x636 at 1920 + 560, 222. From
# xrandr the pointer is outside the only monitor, so the first one: 560,222.
prepare_cache_case() {
    prepare_hidden_dropdown
    set_user_position_hint
    echo "2000 100" >"$tmp_root/pointer"
}

synchronous_xrandr_calls() {
    count_calls "xrandr-fd9 $state_dir/lock"
}

case_cache_hit_skips_xrandr() {
    local name="a cache with the current key is used, no xrandr at all"
    prepare_cache_case
    write_monitor_cache "$STUB_LAYOUT_KEY"
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowmove $NEMO_WID 2480 222"; then
        fail "$name" "not centered on the cached monitor (rc=$rc err='$err')"
        return 0
    fi
    if [[ $(count_calls "xrandr ") -ne 0 ]]; then
        fail "$name" "xrandr ran during or after the press"
        return 0
    fi
    pass "$name"
}

# check_cache_fallback <case name>: the press calls xrandr itself, then the
# background write stores the current key and the xrandr monitors.
check_cache_fallback() {
    local name=$1 cache
    run_toggle
    if [[ $rc -ne 0 || $(synchronous_xrandr_calls) -ne 1 ]] || ! calls_contain "xdo windowmove $NEMO_WID 560 222"; then
        fail "$name" "no synchronous xrandr or wrong place (rc=$rc err='$err')"
        return 0
    fi
    cache=$(cat "$state_dir/monitors" 2>/dev/null || true)
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
    printf '%s\n%s\n' "$STUB_LAYOUT_KEY" "garbage" >"$state_dir/monitors"
    check_cache_fallback "an unreadable cache falls back to xrandr"
}

case_no_layout_key_always_calls_xrandr() {
    local name="no layout key: xrandr at every show, no cache written"
    prepare_cache_case
    rm "$tmp_root/root/_GTK_WORKAREAS_D0"
    run_toggle
    run_toggle
    run_toggle
    if [[ $rc -ne 0 || $(synchronous_xrandr_calls) -ne 2 || -e $state_dir/monitors ]]; then
        fail "$name" "$(synchronous_xrandr_calls) synchronous xrandr call(s) (rc=$rc err='$err')"
        return 0
    fi
    pass "$name"
}

# The cache write runs with fd 9 closed: a press while it is blocked is not
# skipped as if another run held the lock. The first press must return while
# the write is still blocked, so it never waits for it.
case_background_cache_write_does_not_hold_lock() {
    local name="the background cache write does not hold the lock" first_rc=0
    prepare_cache_case
    touch "$tmp_root/mv-blocks"
    toggle_with_stubs 2>"$tmp_root/stderr" >/dev/null || first_rc=$?
    if ! wait_for_file "$tmp_root/mv-started" || [[ -e $state_dir/monitors ]]; then
        touch "$tmp_root/mv-release"
        fail "$name" "the cache write never started, or the press waited for it (rc=$first_rc)"
        return 0
    fi
    run_toggle
    touch "$tmp_root/mv-release"
    if ! wait_for_file "$state_dir/monitors"; then
        fail "$name" "the background cache write never ended"
        return 0
    fi
    if [[ $first_rc -ne 0 || $rc -ne 0 ]] || ! calls_contain "xdo windowunmap $NEMO_WID"; then
        fail "$name" "the press during the write did not hide (rc=$first_rc then $rc err='$err')"
        return 0
    fi
    if ! calls_contain "mv-fd9 closed"; then
        fail "$name" "the cache write did not run with fd 9 closed"
        return 0
    fi
    pass "$name"
}

# process_starts [command]: prints how many programs started before the first
# logged command starting with $1, or in the whole run without $1. The toggle
# runs with only the stubs on PATH and every stub logs its start, so every
# process start is counted, sleep from the polling loops included. A plain
# show needs no poll before its map, so a sleep there counts against it.
process_starts() {
    local stop=${1:-} log count=0 line program
    log=$(cat "$tmp_root/calls.log")
    while read -r line; do
        if [[ -n $stop && $line == "$stop"* ]]; then
            break
        fi
        program=${line%% *}
        if [[ -n $program && -f $stub_bin/$program ]]; then
            count=$((count + 1))
        fi
    done <<<"$log"
    echo "$count"
}

case_show_starts_few_programs_before_map() {
    local name="a plain show starts $SHOW_STARTS_BEFORE_MAP programs up to the map request" starts
    prepare_hidden_dropdown
    set_user_position_hint
    mkdir -p "$state_dir"
    printf '%s\n%s\n' "$STUB_LAYOUT_KEY" "$STUB_MONITORS" >"$state_dir/monitors"
    run_toggle
    starts=$(process_starts "xdo windowmap")
    if [[ $rc -ne 0 || $starts -ne $SHOW_STARTS_BEFORE_MAP ]]; then
        fail "$name" "$starts programs before the map (rc=$rc err='$err'): $(cat "$tmp_root/calls.log")"
        return 0
    fi
    pass "$name"
}

case_hide_starts_few_programs() {
    local name="a plain hide starts $HIDE_STARTS programs" starts
    prepare_hidden_dropdown
    set_user_position_hint
    run_toggle
    : >"$tmp_root/calls.log"
    run_toggle
    starts=$(process_starts)
    if [[ $rc -ne 0 || $starts -ne $HIDE_STARTS ]] || ! calls_contain "xdo windowunmap $NEMO_WID"; then
        fail "$name" "$starts programs (rc=$rc err='$err'): $(cat "$tmp_root/calls.log")"
        return 0
    fi
    pass "$name"
}

case_no_trace_file_without_switch() {
    local name="no timing log without the trace switch"
    prepare_hidden_dropdown
    run_toggle
    run_toggle
    if [[ $rc -ne 0 || -e $state_dir/timing.log ]]; then
        fail "$name" "rc=$rc, timing.log exists"
        return 0
    fi
    pass "$name"
}

readonly SHOW_STAGES="--- start checks-done lock validated decided-show show-monitor show-placed show-map-sent show-managed show-activated show-viewable"
readonly HIDE_STAGES="--- start checks-done lock validated decided-hide hide-done"

# Prints the stages of timing.log, one run after the other, and fails when a
# line is not "<microseconds> <stage>".
logged_stages() {
    local line stages=""
    while read -r line; do
        if [[ ! $line =~ ^[0-9]+\ (.+)$ ]]; then
            return 1
        fi
        stages="$stages ${BASH_REMATCH[1]}"
    done <"$state_dir/timing.log"
    echo "${stages# }"
}

case_trace_switch_logs_stages() {
    local name="with the trace switch, a show then a hide log their stages in order" stages
    prepare_hidden_dropdown
    set_user_position_hint
    touch "$state_dir/trace"
    run_toggle
    run_toggle
    if ! stages=$(logged_stages); then
        fail "$name" "malformed timing.log: $(cat "$state_dir/timing.log")"
        return 0
    fi
    if [[ $rc -ne 0 || $stages != "$SHOW_STAGES $HIDE_STAGES" ]]; then
        fail "$name" "rc=$rc stages='$stages'"
        return 0
    fi
    pass "$name"
}

case_trace_write_error_does_not_fail() {
    local name="a timing log that cannot be written does not fail the press"
    prepare_hidden_dropdown
    touch "$state_dir/trace"
    mkdir "$state_dir/timing.log"
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowmap $NEMO_WID"; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    pass "$name"
}

case_missing_current_desktop_asks_xdotool() {
    local name="no _NET_CURRENT_DESKTOP on the root: the workspace comes from xdotool"
    prepare_hidden_dropdown
    set_user_position_hint
    rm "$tmp_root/root/_NET_CURRENT_DESKTOP"
    run_toggle
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo get_desktop" || ! calls_contain "xdo set_desktop_for_window $NEMO_WID 0"; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    pass "$name"
}

case_failed_chained_command_stops_the_run() {
    local name="a failed command in an xdotool chain exits 1 with context"
    prepare_hidden_dropdown
    set_user_position_hint
    touch "$tmp_root/xdo-fails-windowmap"
    run_toggle
    if [[ $rc -ne 1 || $err != *"could not move window $NEMO_WID to 560,222 and map it"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! calls_contain "notify-send " || calls_contain "xdo windowactivate"; then
        fail "$name" "no notification, or the run went on"
        return 0
    fi
    pass "$name"
}

case_symlinked_lock_is_refused() {
    local name="symlinked lock file is refused"
    reset_world
    mkdir -m 700 "$state_dir"
    ln -s "$tmp_root/elsewhere" "$state_dir/lock"
    run_toggle
    if [[ $rc -ne 1 || $err != *"it is a symlink"* || -e $tmp_root/elsewhere ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    pass "$name"
}

# calls_after <first call> <call>: prints how many calls starting with $2 were
# recorded after the first call starting with $1.
calls_after() {
    local log line seen=false count=0
    log=$(cat "$tmp_root/calls.log")
    while read -r line; do
        if [[ $seen == false ]]; then
            if [[ $line == "$1"* ]]; then
                seen=true
            fi
            continue
        fi
        if [[ $line == "$2"* ]]; then
            count=$((count + 1))
        fi
    done <<<"$log"
    echo "$count"
}

# check_failed_press <case name> <error> <call reached> <call forbidden after it>:
# the press exits 1 with the error and one notification, and stops there.
check_failed_press() {
    local name=$1 error=$2 reached=$3 forbidden=$4 notifications
    run_toggle
    notifications=$(count_calls "notify-send ")
    if [[ $rc -ne 1 || $err != *"$error"* || $notifications -ne 1 ]]; then
        fail "$name" "rc=$rc, $notifications notification(s), err='$err'"
        return 0
    fi
    if [[ $(first_call_line "$reached") -eq 0 || $(calls_after "$reached" "$forbidden") -ne 0 ]]; then
        fail "$name" "'$reached' not reached, or '$forbidden' ran after it: $(cat "$tmp_root/calls.log")"
        return 0
    fi
    pass "$name"
}

# The stub fails once the restored size shows: inside the wait for that size.
case_xwininfo_failure_while_restoring_stops_the_run() {
    local dir="$tmp_root/windows/$NEMO_WID"
    prepare_hidden_dropdown
    echo "1920 1044" >"$dir/size"
    echo "_NET_WM_STATE(ATOM) = _NET_WM_STATE_MAXIMIZED_HORZ, _NET_WM_STATE_MAXIMIZED_VERT" >"$dir/_NET_WM_STATE"
    echo "$STUB_UNMAXIMIZED_SIZE" >"$tmp_root/xwininfo-fails-when-mapped"
    check_failed_press "xwininfo failing while a maximized dropdown is restored stops the press" \
        "could not run xwininfo on window $NEMO_WID" "xdo windowmap" "xdo windowmove"
}

case_xwininfo_failure_without_extents_stops_the_run() {
    prepare_hidden_dropdown
    set_user_position_hint
    rm "$tmp_root/windows/$NEMO_WID/_NET_FRAME_EXTENTS"
    touch "$tmp_root/xwininfo-fails-when-mapped"
    check_failed_press "xwininfo failing after the map of a dropdown without extents stops the press" \
        "could not run xwininfo on window $NEMO_WID" "xdo windowmap" "xdo windowmove"
}

# Leaves the dropdown mapped and managed, as muffin keeps a window that is
# minimized or on another workspace.
make_dropdown_managed() {
    rm "$tmp_root/windows/$NEMO_WID/unmapped"
    echo "$NEMO_WID_HEX" >"$tmp_root/managed"
}

prepare_dropdown_on_other_workspace() {
    prepare_hidden_dropdown
    set_user_position_hint
    make_dropdown_managed
    echo "_NET_WM_DESKTOP(CARDINAL) = 1" >"$tmp_root/windows/$NEMO_WID/_NET_WM_DESKTOP"
}

# check_withdrawn_then_shown <case name>: withdrawn, moved, mapped, in that
# order, then sent to the current workspace; the trace logs the withdraw.
check_withdrawn_then_shown() {
    local name=$1
    touch "$state_dir/trace"
    run_toggle
    if [[ $rc -ne 0 ]] || ! is_before "xdo windowunmap $NEMO_WID" "xdo windowmove $NEMO_WID 560 222" \
        || ! is_before "xdo windowmove $NEMO_WID 560 222" "xdo windowmap $NEMO_WID"; then
        fail "$name" "not withdrawn, moved, then mapped (rc=$rc err='$err')"
        return 0
    fi
    if ! calls_contain "xdo set_desktop_for_window $NEMO_WID 0" || [[ $(cat "$state_dir/timing.log") != *show-withdrawn* ]]; then
        fail "$name" "not sent to workspace 0, or the withdraw was not traced"
        return 0
    fi
    pass "$name"
}

case_dropdown_on_other_workspace_is_withdrawn_first() {
    prepare_dropdown_on_other_workspace
    check_withdrawn_then_shown "a dropdown managed on another workspace is withdrawn, moved, then mapped"
}

case_minimized_dropdown_is_withdrawn_first() {
    prepare_hidden_dropdown
    set_user_position_hint
    make_dropdown_managed
    echo "_NET_WM_STATE(ATOM) = _NET_WM_STATE_HIDDEN" >"$tmp_root/windows/$NEMO_WID/_NET_WM_STATE"
    check_withdrawn_then_shown "a minimized dropdown is withdrawn, moved, then mapped"
}

case_failed_withdraw_stops_the_run() {
    prepare_dropdown_on_other_workspace
    touch "$tmp_root/xdo-fails-windowunmap"
    check_failed_press "a failed withdraw stops the press before the map" \
        "could not withdraw window $NEMO_WID" "xdo windowunmap" "xdo windowmap"
}

case_withdraw_timeout_stops_the_run() {
    prepare_dropdown_on_other_workspace
    touch "$tmp_root/unmap-keeps-managed"
    check_failed_press "a window still managed after its withdraw stops the press before the map" \
        "window $NEMO_WID is still managed ${TEST_TIMEOUT_SECONDS}s after unmapping it" "xdo windowunmap" "xdo windowmap"
}

case_shared_tmp_fallback_enforces_its_mode() {
    local name="without XDG_RUNTIME_DIR the state is /tmp/nemo-dropdown-\$UID, chmod 700 at each run"
    local fake_state="$tmp_root/fake-tmp/nemo-dropdown-$UID" real_state="/tmp/nemo-dropdown-$UID" real_existed=false
    if ! unshare --user --map-root-user --mount true 2>/dev/null; then
        say "SKIP $name: no unprivileged user and mount namespaces here"
        return 0
    fi
    if [[ -e $real_state ]]; then
        real_existed=true
    fi
    prepare_hidden_dropdown "$fake_state"
    set_user_position_hint
    chmod 755 "$fake_state"
    run_toggle toggle_in_private_tmp
    if [[ $rc -ne 0 ]] || ! calls_contain "xdo windowmap $NEMO_WID" || ! calls_contain "chmod 700 $real_state"; then
        fail "$name" "no show or no chmod (rc=$rc err='$err')"
        return 0
    fi
    if [[ $(stat -c %a "$fake_state") != 700 ]]; then
        fail "$name" "mode $(stat -c %a "$fake_state")"
        return 0
    fi
    if [[ $real_existed == false && -e $real_state ]]; then
        fail "$name" "the real $real_state was created"
        return 0
    fi
    pass "$name"
}

# check_cache_write_failed <case name>: the press shows the dropdown and
# leaves no temp file.
check_cache_write_failed() {
    local name=$1 leftovers
    leftovers=$(find "$state_dir" -maxdepth 1 -name 'monitors*' -print)
    if [[ $rc -ne 0 || $err != *"could not "*"/monitors"* ]] || ! calls_contain "xdo windowmap $NEMO_WID"; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if [[ -n $leftovers ]] || calls_contain "notify-send "; then
        fail "$name" "left '$leftovers', or sent a notification"
        return 0
    fi
    pass "$name"
}

case_unwritable_cache_keeps_the_press() {
    prepare_cache_case
    : >"$state_dir/lock"
    chmod 500 "$state_dir"
    run_toggle
    chmod 700 "$state_dir"
    check_cache_write_failed "a monitor cache that cannot be written: the press succeeds, no temp file"
}

case_failed_cache_replace_keeps_the_press() {
    prepare_cache_case
    touch "$tmp_root/mv-fails"
    run_toggle
    check_cache_write_failed "a monitor cache that cannot be replaced: the press succeeds, no temp file"
}

case_failed_xrandr_stops_the_show() {
    prepare_cache_case
    touch "$tmp_root/xrandr-fails"
    check_failed_press "a failed xrandr on a cache miss stops the show before the map" \
        "could not list the monitors with xrandr" "xdo getmouselocation" "xdo windowmap"
}

case_leading_zero_cache_calls_xrandr() {
    prepare_cache_case
    printf '%s\n%s\n%s\n' "$STUB_LAYOUT_KEY" "Monitors: 1" " 0: +*CACHED-1 1920/527x1080/296+01920+0  CACHED-1" \
        >"$state_dir/monitors"
    check_cache_fallback "a cached number with a leading zero is not used"
}

case_hint_failure_at_creation_still_sizes_and_centers() {
    local name="a failed hint write at creation still sizes and centers, exit 0, no notification"
    reset_world
    touch "$tmp_root/nemo-creates-window" "$tmp_root/hint-fails"
    run_toggle
    if [[ $rc -ne 0 || $err != *"will be moved after it is mapped at each show"* ]]; then
        fail "$name" "rc=$rc err='$err'"
        return 0
    fi
    if ! calls_contain "xdo windowsize $NEMO_WID 1536 828" || ! calls_contain "xdo windowmove $NEMO_WID 192 108" \
        || calls_contain "notify-send "; then
        fail "$name" "not sized and centered, or a notification was sent"
        return 0
    fi
    pass "$name"
}

case_unreadable_wid_file_stops_the_run() {
    prepare_hidden_dropdown
    chmod 000 "$state_dir/wid"
    check_failed_press "an unreadable saved id stops the press, no new dropdown" \
        "could not read the saved window id in $state_dir/wid" "flock" "setsid"
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
case_background_cache_write_does_not_hold_lock
case_show_starts_few_programs_before_map
case_hide_starts_few_programs
case_no_trace_file_without_switch
case_trace_switch_logs_stages
case_trace_write_error_does_not_fail
case_missing_current_desktop_asks_xdotool
case_failed_chained_command_stops_the_run
case_xwininfo_failure_while_restoring_stops_the_run
case_xwininfo_failure_without_extents_stops_the_run
case_dropdown_on_other_workspace_is_withdrawn_first
case_minimized_dropdown_is_withdrawn_first
case_failed_withdraw_stops_the_run
case_withdraw_timeout_stops_the_run
case_shared_tmp_fallback_enforces_its_mode
case_unwritable_cache_keeps_the_press
case_failed_cache_replace_keeps_the_press
case_failed_xrandr_stops_the_show
case_leading_zero_cache_calls_xrandr
case_hint_failure_at_creation_still_sizes_and_centers
case_unreadable_wid_file_stops_the_run

if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
