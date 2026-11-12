#!/bin/bash
#
# Toggle one dropdown Nemo window.
# First run opens a Nemo window on $HOME, next run hides it, next run shows
# the same window again on the current workspace, centered on the monitor
# under the pointer. A new dropdown opens at WIDTH_PERCENT x HEIGHT_PERCENT of
# that monitor; afterwards its size is never changed, so it keeps the size the
# user gives it. A hidden dropdown is moved to its centered place before it
# is mapped, so it appears there directly.
#
# Keybinding: Cinnamon custom shortcut "Dropdown Nemo", binding Super+E,
# command /home/bgi/Repos/dotfiles/scripts/nemo_dropdown_toggle.sh
# (System Settings > Keyboard > Shortcuts > Custom Shortcuts).
#
# Needs: xdotool xprop xwininfo xrandr flock setsid. python3 with libX11 sets
# the position hint whenever the dropdown lacks it, normally once at its
# creation; without it the dropdown is moved after it appears. python3-gi
# (GdkX11) unmaximizes a maximized dropdown and is checked only then.
# Optional: notify-send, which shows errors as a notification, since a
# keybinding's stderr is never seen.
#
# State directory: $XDG_RUNTIME_DIR/nemo-dropdown, else /tmp/nemo-dropdown-$UID.
# It holds wid, lock and monitors: 'xrandr --listmonitors' saved under the
# _GTK_WORKAREAS_D0 it was read with, written again in the background after a
# press finds it missing, saved under another value, or unreadable.
# Timing: while the file trace exists there, each press appends
# "microseconds-since-start stage" lines to timing.log, which grows until
# trace is removed. A traced show holds the lock until the window is viewable.
#
# Why not tdrop: Nemo is a single-instance application. A `nemo` command
# hands its request to the running process and exits, so the new window never
# belongs to the launched pid; tdrop waits for a window of that pid and times
# out. This script tracks its own window instead.
#
# Limitations:
# - The dropdown is the first new normal Nemo window that appears after
#   launching nemo. Another Nemo window opened in the same second, such as a
#   file operation window, can be adopted instead. The title cannot narrow it:
#   Nemo shows "nemo" until the folder loads, and the folder name is localized.
# - A new dropdown appears where the WM places it, then moves to the center.
# - A maximized dropdown appears maximized, then moves once it is restored.
# - A workspace switch during a show leaves the dropdown on the previous one.
# - A monitor change that keeps _GTK_WORKAREAS_D0 keeps the cached monitors.
#
# Tests: scripts/nemo_dropdown_toggle-test.sh

set -euo pipefail
# set -e does not apply inside $(...): a function whose output is captured
# only reads and dies on failure, and every call that changes a window runs in
# the caller's shell with an explicit check. A captured call that can fail is
# checked at once, never nested in another call: its die ends only its own
# subshell, so the caller then exits without a second notification.

readonly START_MICROSECONDS="${EPOCHREALTIME/[.,]/}"
readonly WIDTH_PERCENT=80
readonly HEIGHT_PERCENT=80
readonly DEFAULT_TIMEOUT_SECONDS=10
readonly TIMEOUT_SECONDS="${NEMO_DROPDOWN_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"
readonly POLL_SECONDS=0.02
readonly MICROSECONDS_PER_SECOND=1000000

readonly NEMO_WM_CLASS='WM_CLASS(STRING) = "nemo", "Nemo"'
readonly MARK_PROPERTY=NEMO_DROPDOWN
readonly MARK_VALUE=1
readonly MARK_LINE="$MARK_PROPERTY(STRING) = \"$MARK_VALUE\""
readonly STICKY_DESKTOP=4294967295
readonly HINTS_HEADER="WM_NORMAL_HINTS(WM_SIZE_HINTS):"
readonly USER_POSITION_LINE="user specified location:"
readonly LAYOUT_KEY_PROPERTY=_GTK_WORKAREAS_D0
readonly LAYOUT_KEY_PATTERN="($LAYOUT_KEY_PROPERTY\\(CARDINAL\\) = [0-9, ]+)"
# No leading zero: bash arithmetic would read the number as octal.
readonly DECIMAL='(0|[1-9][0-9]*)'
# A whole "width/mmxheight/mm+x+y" word of 'xrandr --listmonitors'.
readonly MONITOR_PATTERN='(^|[[:space:]])'"$DECIMAL"'/[0-9]+x'"$DECIMAL"'/[0-9]+\+(-?'"$DECIMAL"')\+(-?'"$DECIMAL"')([[:space:]]|$)'
readonly NOTIFY_TITLE="Dropdown Nemo"
# Everything the hot path needs from the dropdown and the root, one xprop each.
readonly WINDOW_PROPERTIES=(WM_CLASS "$MARK_PROPERTY" _NET_WM_STATE _NET_WM_DESKTOP WM_NORMAL_HINTS _NET_FRAME_EXTENTS)
readonly ROOT_PROPERTIES=(_NET_CLIENT_LIST "$LAYOUT_KEY_PROPERTY" _NET_CURRENT_DESKTOP)

# XDG_RUNTIME_DIR is private to its user (mode 0700 by the XDG spec); the
# /tmp fallback is shared, so only there is the mode enforced at each run.
if [[ ${XDG_RUNTIME_DIR:-} == /* ]]; then
    readonly STATE_DIR="$XDG_RUNTIME_DIR/nemo-dropdown"
    readonly STATE_DIR_IS_SHARED=false
else
    readonly STATE_DIR="/tmp/nemo-dropdown-$UID"
    readonly STATE_DIR_IS_SHARED=true
fi
readonly WID_FILE="$STATE_DIR/wid"
readonly LOCK_FILE="$STATE_DIR/lock"
readonly MONITOR_CACHE_FILE="$STATE_DIR/monitors"
readonly TRACE_SWITCH="$STATE_DIR/trace"
readonly TRACE_FILE="$STATE_DIR/timing.log"

readonly SCRIPT_NAME="${0##*/}"

trace_started=false

notify_error() {
    local message=$1
    if ! command -v notify-send >/dev/null 2>&1; then
        return 0
    fi
    if ! notify-send --urgency=critical "$NOTIFY_TITLE" "$message"; then
        echo "$SCRIPT_NAME: notify-send failed" >&2
    fi
}

die() {
    echo "$SCRIPT_NAME: $*" >&2
    notify_error "$*"
    exit 1
}

warn() {
    echo "$SCRIPT_NAME: $*" >&2
}

# now_microseconds <variable>: sets the variable rather than printing it, so
# that polling forks nothing. EPOCHREALTIME uses the locale's decimal separator.
now_microseconds() {
    printf -v "$1" '%s' "${EPOCHREALTIME/[.,]/}"
}

# trace <stage>: a diagnostic, so a failed write never fails the press.
trace() {
    local stage=$1 now
    if [[ ! -f $TRACE_SWITCH ]]; then
        return 0
    fi
    if [[ $trace_started == false ]]; then
        stage="--- start $stage"
        trace_started=true
    fi
    now_microseconds now
    if ! { printf '%s %s\n' "$((now - START_MICROSECONDS))" "$stage" >>"$TRACE_FILE"; } 2>/dev/null; then
        return 0
    fi
}

require_valid_timeout() {
    if [[ ! $TIMEOUT_SECONDS =~ ^[1-9][0-9]*$ ]]; then
        die "NEMO_DROPDOWN_TIMEOUT_SECONDS must be a positive integer, got '$TIMEOUT_SECONDS'"
    fi
}

require_commands() {
    local cmd
    for cmd in nemo xdotool xprop xwininfo xrandr flock setsid; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            die "$cmd is not installed"
        fi
    done
}

# require_version only checks that the GdkX11 typelib exists, at about half
# the cost of importing it.
require_python_gi() {
    if ! command -v python3 >/dev/null 2>&1; then
        die "python3 is not installed"
    fi
    if ! python3 -I -c 'import gi; gi.require_version("GdkX11", "3.0")' 2>/dev/null; then
        die "python3-gi with GdkX11 3.0 is not installed"
    fi
}

# contains_line <lines> <line>
contains_line() {
    local lines=$1 line=$2
    [[ $'\n'$lines$'\n' == *$'\n'"$line"$'\n'* ]]
}

# Prints the decimal ids of the managed windows listed in xprop's root output.
client_ids() {
    local root=$1 token
    for token in $root; do
        if [[ $token =~ ^(0x[0-9a-fA-F]+),?$ ]]; then
            printf '%d\n' "${BASH_REMATCH[1]}"
        fi
    done
}

managed_window_ids() {
    local root
    if ! root=$(xprop -root _NET_CLIENT_LIST); then
        return 1
    fi
    client_ids "$root"
}

is_managed() {
    local ids
    if ! ids=$(managed_window_ids); then
        return 1
    fi
    contains_line "$ids" "$1"
}

# window_property <wid> <property...>: xprop prints one line per property,
# several for WM_NORMAL_HINTS, and "<property>:  not found." when unset.
window_property() {
    local wid=$1
    shift
    xprop -id "$wid" "$@" 2>/dev/null
}

# property_matches <wid> <property> <glob matched against xprop's output line>
property_matches() {
    local wid=$1 property=$2 pattern=$3 value
    if ! value=$(window_property "$wid" "$property"); then
        return 1
    fi
    # shellcheck disable=SC2053 # the pattern is a glob on purpose
    [[ $value == $pattern ]]
}

has_wm_state() {
    local wid=$1 state=$2
    property_matches "$wid" _NET_WM_STATE "*$state*"
}

is_nemo_window() {
    property_matches "$1" WM_CLASS "$NEMO_WM_CLASS"
}

# Prints the WINDOW_PROPERTIES of the saved dropdown. X window ids are
# reused: a saved id counts only if the window still carries the mark this
# script set on it.
dropdown_properties() {
    local wid=$1 properties
    if [[ ! $wid =~ ^[0-9]+$ ]]; then
        return 1
    fi
    if ! properties=$(window_property "$wid" "${WINDOW_PROPERTIES[@]}"); then
        return 1
    fi
    if ! contains_line "$properties" "$NEMO_WM_CLASS"; then
        return 1
    fi
    if ! contains_line "$properties" "$MARK_LINE"; then
        return 1
    fi
    echo "$properties"
}

mark_dropdown_window() {
    local wid=$1
    if ! xprop -id "$wid" -f "$MARK_PROPERTY" 8s -set "$MARK_PROPERTY" "$MARK_VALUE"; then
        die "could not mark window $wid"
    fi
}

# xwininfo's header line holds the window title, so only whole lines count.
info_is_viewable() {
    [[ $1 == *$'\n'"  Map State: IsViewable"* ]]
}

is_viewable() {
    local info
    if ! info=$(xwininfo -id "$1" 2>/dev/null); then
        return 1
    fi
    info_is_viewable "$info"
}

# Prints the current workspace from xprop's root output, or from xdotool when
# the WM does not publish _NET_CURRENT_DESKTOP.
current_desktop() {
    local root=$1 desktop
    if [[ $root =~ _NET_CURRENT_DESKTOP\(CARDINAL\)\ =\ ([0-9]+) ]]; then
        echo "${BASH_REMATCH[1]}"
        return 0
    fi
    if ! desktop=$(xdotool get_desktop); then
        die "could not read the current workspace with xdotool"
    fi
    echo "$desktop"
}

# read_root_state <root variable> <workspace variable>: sets both variables
# of the caller from one xprop.
# shellcheck disable=SC2034 # namerefs set the caller's variables
read_root_state() {
    local -n root_out=$1 desktop_out=$2
    if ! root_out=$(xprop -root "${ROOT_PROPERTIES[@]}"); then
        die "could not read the root window properties with xprop"
    fi
    if ! desktop_out=$(current_desktop "$root_out"); then
        exit 1
    fi
}

# is_shown_here <window properties> <xwininfo output> <current workspace>
# Muffin keeps the windows of other workspaces mapped (IsViewable), so
# viewable alone does not mean the user can see the window.
is_shown_here() {
    local properties=$1 info=$2 desktop=$3
    if ! info_is_viewable "$info"; then
        return 1
    fi
    if [[ $properties == *_NET_WM_STATE_HIDDEN* ]]; then
        return 1
    fi
    if [[ ! $properties =~ _NET_WM_DESKTOP\(CARDINAL\)\ =\ ([0-9]+) ]]; then
        return 1
    fi
    [[ ${BASH_REMATCH[1]} == "$desktop" || ${BASH_REMATCH[1]} == "$STICKY_DESKTOP" ]]
}

# wait_for_status <0|1> <command...>: runs the command until its status is
# success (0) or failure (1), for at most TIMEOUT_SECONDS.
wait_for_status() {
    local wanted=$1 now deadline status
    shift
    now_microseconds now
    deadline=$((now + TIMEOUT_SECONDS * MICROSECONDS_PER_SECOND))
    while true; do
        if "$@"; then
            status=0
        else
            status=1
        fi
        if ((status == wanted)); then
            return 0
        fi
        now_microseconds now
        if ((now >= deadline)); then
            return 1
        fi
        sleep "$POLL_SECONDS"
    done
}

wait_until() {
    wait_for_status 0 "$@"
}

wait_while() {
    wait_for_status 1 "$@"
}

# Prints the cached 'xrandr --listmonitors' output if it was saved under $1.
cached_monitors() {
    local key=$1 lines
    if [[ ! -f $MONITOR_CACHE_FILE ]]; then
        return 1
    fi
    if ! mapfile -t lines <"$MONITOR_CACHE_FILE"; then
        return 1
    fi
    if [[ ${#lines[@]} -lt 2 || ${lines[0]} != "$key" ]]; then
        return 1
    fi
    printf '%s\n' "${lines[@]:1}"
}

# store_monitor_cache <key> <monitors>: a failed write leaves no temp file.
store_monitor_cache() {
    local tmp="$MONITOR_CACHE_FILE.$BASHPID"
    if printf '%s\n%s\n' "$1" "$2" >"$tmp" && mv -f "$tmp" "$MONITOR_CACHE_FILE"; then
        return 0
    fi
    warn "could not write the monitor cache $MONITOR_CACHE_FILE"
    rm -f "$tmp"
    return 1
}

# monitor_containing <x> <y> <'xrandr --listmonitors' output>: prints
# "width height x y" of the monitor containing the point, or of the first
# monitor when no monitor contains it; fails when no monitor is listed.
monitor_containing() {
    local point_x=$1 point_y=$2 monitors=$3 line first=""
    local width height x y
    while read -r line; do
        if [[ ! $line =~ $MONITOR_PATTERN ]]; then
            continue
        fi
        width=${BASH_REMATCH[2]}
        height=${BASH_REMATCH[3]}
        x=${BASH_REMATCH[4]}
        y=${BASH_REMATCH[6]}
        if [[ -z $first ]]; then
            first="$width $height $x $y"
        fi
        if ((point_x >= x && point_x < x + width && point_y >= y && point_y < y + height)); then
            echo "$width $height $x $y"
            return 0
        fi
    done <<<"$monitors"
    if [[ -z $first ]]; then
        return 1
    fi
    echo "$first"
}

# monitor_at <x> <y> <layout key, may be empty>: an unusable cache falls back
# to xrandr, whose output is then cached. The key was read before xrandr ran,
# so a layout change during the press leaves an old key, never a new key on
# old data.
monitor_at() {
    local point_x=$1 point_y=$2 key=$3 monitors
    if [[ -n $key ]]; then
        if monitors=$(cached_monitors "$key"); then
            if monitor_containing "$point_x" "$point_y" "$monitors"; then
                return 0
            fi
        fi
    fi
    if ! monitors=$(xrandr --current --listmonitors); then
        die "could not list the monitors with xrandr"
    fi
    if ! monitor_containing "$point_x" "$point_y" "$monitors"; then
        die "no monitor found in 'xrandr --listmonitors'"
    fi
    # The write outlives the press: it must not inherit the lock, nor the
    # stdout of the capture that runs this function.
    if [[ -n $key ]]; then
        store_monitor_cache "$key" "$monitors" 9>&- </dev/null >/dev/null &
    fi
}

# pointer_monitor_geometry <root properties>: prints "width height x y" of
# the monitor containing the pointer, or of the first monitor when the
# pointer is outside every monitor. _GTK_WORKAREAS_D0 holds one rectangle per
# monitor, so it changes when a monitor is added, removed, moved or resized:
# it is the cache key, empty when the WM does not set it.
pointer_monitor_geometry() {
    local root=$1 key="" location line pointer_x="" pointer_y=""
    if [[ $root =~ $LAYOUT_KEY_PATTERN ]]; then
        key=${BASH_REMATCH[1]}
    fi
    if ! location=$(xdotool getmouselocation --shell); then
        die "could not read the pointer location with xdotool"
    fi
    while read -r line; do
        case $line in
            X=*) pointer_x=${line#X=} ;;
            Y=*) pointer_y=${line#Y=} ;;
        esac
    done <<<"$location"
    if [[ ! $pointer_x =~ ^-?[0-9]+$ || ! $pointer_y =~ ^-?[0-9]+$ ]]; then
        die "unexpected pointer location from 'xdotool getmouselocation': $location"
    fi
    monitor_at "$pointer_x" "$pointer_y" "$key"
}

# Prints "left right top bottom" from xprop output; fails when the WM has not
# set the frame extents.
frame_extents_from() {
    local pattern='_NET_FRAME_EXTENTS\(CARDINAL\) = ([0-9]+), ([0-9]+), ([0-9]+), ([0-9]+)'
    if [[ ! $1 =~ $pattern ]]; then
        return 1
    fi
    echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]} ${BASH_REMATCH[4]}"
}

# Prints the frame extents of the window, silently failing while it has none.
window_frame_extents() {
    local extents
    if ! extents=$(window_property "$1" _NET_FRAME_EXTENTS); then
        return 1
    fi
    frame_extents_from "$extents"
}

# Right after a map the WM may not have set the frame extents yet; without
# them the frame is taken as the client area alone.
mapped_frame_extents() {
    local wid=$1
    if wait_until window_frame_extents "$wid"; then
        return 0
    fi
    warn "window $wid has no frame extents, assuming no frame"
    echo "0 0 0 0"
}

# client_size_from <xwininfo output> <wid>: prints "width height" of the
# client area. The last whole Width and Height lines win: the header line
# with the title comes first.
client_size_from() {
    local info=$1 wid=$2 line width="" height=""
    while read -r line; do
        if [[ $line =~ ^Width:\ ([0-9]+)$ ]]; then
            width=${BASH_REMATCH[1]}
        fi
        if [[ $line =~ ^Height:\ ([0-9]+)$ ]]; then
            height=${BASH_REMATCH[1]}
        fi
    done <<<"$info"
    if [[ -z $width || -z $height ]]; then
        die "could not read the size of window $wid from xwininfo"
    fi
    echo "$width $height"
}

client_size() {
    local wid=$1 info
    if ! info=$(xwininfo -id "$wid"); then
        die "could not run xwininfo on window $wid"
    fi
    client_size_from "$info" "$wid"
}

# A wait_while predicate: it runs in the caller's shell, so exit ends the press.
client_size_is() {
    local wid=$1 expected=$2 current
    if ! current=$(client_size "$wid"); then
        exit 1
    fi
    [[ $current == "$expected" ]]
}

# centered_position <"width height x y" of the monitor> <"width height">
# [<"left right top bottom" frame extents>]: prints the "x y" that centers the
# frame, title bar and borders included; without extents the size is the
# frame's. windowmove places the frame's top-left corner, on a managed window
# and on a withdrawn one with the position hint alike. A frame larger than
# the monitor starts at the monitor's edge.
centered_position() {
    local monitor_width monitor_height monitor_x monitor_y width height left right top bottom
    read -r monitor_width monitor_height monitor_x monitor_y <<<"$1"
    read -r width height <<<"$2"
    read -r left right top bottom <<<"${3:-0 0 0 0}"
    width=$((width + left + right))
    height=$((height + top + bottom))
    echo "$((monitor_x + (width < monitor_width ? (monitor_width - width) / 2 : 0))) $((monitor_y + (height < monitor_height ? (monitor_height - height) / 2 : 0)))"
}

# The percentages apply to the frame, so the title bar counts in the height.
default_frame_size() {
    local monitor_width monitor_height
    read -r monitor_width monitor_height _ <<<"$1"
    echo "$((monitor_width * WIDTH_PERCENT / 100)) $((monitor_height * HEIGHT_PERCENT / 100))"
}

# resize_frame <wid> <"width height" of the frame> <"left right top bottom">
resize_frame() {
    local wid=$1 frame_width frame_height left right top bottom
    read -r frame_width frame_height <<<"$2"
    read -r left right top bottom <<<"$3"
    if ! xdotool windowsize "$wid" $((frame_width - left - right)) $((frame_height - top - bottom)); then
        die "could not resize window $wid"
    fi
}

# xdotool runs chained commands in one process. Only the realistic failure
# is relied on: a window that is gone raises an X error, and Xlib's default
# error handler ends the process with status 1, so the rest of the chain
# does not run.
# place_on_workspace <wid> <workspace> <"x y">
place_on_workspace() {
    local wid=$1 desktop=$2 x y
    read -r x y <<<"$3"
    if ! xdotool set_desktop_for_window "$wid" "$desktop" windowmove "$wid" "$x" "$y" windowactivate "$wid"; then
        die "could not move window $wid to workspace $desktop, to $x,$y and activate it"
    fi
}

has_user_position_hint() {
    local properties=$1
    [[ $properties == *"$HINTS_HEADER"* && $properties == *"$USER_POSITION_LINE"* ]]
}

# Muffin places a newly mapped window itself and ignores its position unless
# WM_NORMAL_HINTS has USPosition. GTK does not set it, and neither xprop
# (wrong property type) nor xdotool can, so libX11 is called through ctypes.
# The other hints, such as Nemo's minimum size, are kept.
set_user_position_hint() {
    local wid=$1
    if ! command -v python3 >/dev/null 2>&1; then
        warn "python3 is not installed, cannot set the position hint of window $wid"
        return 1
    fi
    python3 -I - "$wid" <<'EOF'
import ctypes
import sys

US_POSITION = 1


class XSizeHints(ctypes.Structure):
    _fields_ = [("flags", ctypes.c_long)] + [
        (name, ctypes.c_int)
        for name in ("x", "y", "width", "height", "min_width", "min_height",
                     "max_width", "max_height", "width_inc", "height_inc",
                     "min_aspect_x", "min_aspect_y", "max_aspect_x",
                     "max_aspect_y", "base_width", "base_height", "win_gravity")
    ]


def fail(message):
    sys.exit(f"window {sys.argv[1]}: {message}")


try:
    x11 = ctypes.CDLL("libX11.so.6")
except OSError as error:
    fail(f"cannot load libX11: {error}")
ERROR_HANDLER = ctypes.CFUNCTYPE(ctypes.c_int, ctypes.c_void_p, ctypes.c_void_p)
x11.XSetErrorHandler.argtypes = [ERROR_HANDLER]
x11.XOpenDisplay.restype = ctypes.c_void_p
x11.XOpenDisplay.argtypes = [ctypes.c_char_p]
x11.XGetWMNormalHints.argtypes = [ctypes.c_void_p, ctypes.c_ulong,
                                  ctypes.POINTER(XSizeHints), ctypes.POINTER(ctypes.c_long)]
x11.XSetWMNormalHints.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(XSizeHints)]
x11.XSync.argtypes = [ctypes.c_void_p, ctypes.c_int]
x11.XCloseDisplay.argtypes = [ctypes.c_void_p]

x_errors = []


@ERROR_HANDLER
def record_x_error(display, event):
    x_errors.append(event)
    return 0


x11.XSetErrorHandler(record_x_error)
display = x11.XOpenDisplay(None)
if not display:
    fail("cannot open the X display")
window = int(sys.argv[1])
hints = XSizeHints()
supplied = ctypes.c_long()
found = x11.XGetWMNormalHints(display, window, ctypes.byref(hints), ctypes.byref(supplied))
x11.XSync(display, 0)
if x_errors or not found:
    fail("cannot read WM_NORMAL_HINTS")
hints.flags |= US_POSITION
x11.XSetWMNormalHints(display, window, ctypes.byref(hints))
x11.XSync(display, 0)
if x_errors:
    fail("cannot write WM_NORMAL_HINTS")
x11.XCloseDisplay(display)
EOF
}

# ensure_user_position_hint <wid> <window properties>: Python runs only when
# the properties do not show the hint; a hint that cannot be read is written
# again.
ensure_user_position_hint() {
    if has_user_position_hint "$2"; then
        return 0
    fi
    set_user_position_hint "$1"
}

# GTK maximizes the window again each time it is mapped, and the WM ignores
# a resize of a maximized window. This xdotool has no windowstate command and
# wmctrl is not installed, so the request goes through GDK (python3-gi).
unmaximize_window() {
    local wid=$1
    require_python_gi
    if ! python3 -I - "$wid" <<'EOF'
import sys
import gi
gi.require_version("GdkX11", "3.0")
from gi.repository import GdkX11
display = GdkX11.X11Display.get_default()
GdkX11.X11Window.foreign_new_for_display(display, int(sys.argv[1])).unmaximize()
display.flush()
EOF
    then
        die "could not ask the WM to unmaximize window $wid"
    fi
    if ! wait_while has_wm_state "$wid" _NET_WM_STATE_MAXIMIZED_; then
        die "window $wid is still maximized ${TIMEOUT_SECONDS}s after asking to unmaximize it"
    fi
}

# A maximized window cannot be moved or resized, so it is unmaximized first.
# The WM may drop the maximized state before the size changes; a restored
# size equal to the maximized one never changes, so that wait is not fatal.
restore_if_maximized() {
    local wid=$1 maximized_size
    if ! has_wm_state "$wid" _NET_WM_STATE_MAXIMIZED_; then
        return 0
    fi
    if ! maximized_size=$(client_size "$wid"); then
        exit 1
    fi
    unmaximize_window "$wid"
    if ! wait_while client_size_is "$wid" "$maximized_size"; then
        return 0
    fi
}

hide_dropdown() {
    if ! xdotool windowunmap "$1"; then
        die "could not hide window $1"
    fi
}

withdraw_window() {
    local wid=$1
    if ! xdotool windowunmap "$wid"; then
        die "could not withdraw window $wid"
    fi
    if ! wait_while is_managed "$wid"; then
        die "window $wid is still managed ${TIMEOUT_SECONDS}s after unmapping it"
    fi
}

# Centers a mapped window with its current size.
center_mapped_window() {
    local wid=$1 desktop=$2 monitor=$3 extents client position
    restore_if_maximized "$wid"
    extents=$(mapped_frame_extents "$wid")
    if ! client=$(client_size "$wid"); then
        exit 1
    fi
    position=$(centered_position "$monitor" "$client" "$extents")
    place_on_workspace "$wid" "$desktop" "$position"
}

# show_dropdown <wid> <window properties> <xwininfo output> <root properties>
# <current workspace>. A window that is minimized or on another workspace is
# withdrawn first, so it is shown again through the same path as a hidden
# one. Muffin keeps the frame extents and the hints of a withdrawn window;
# without them the window is moved once it is mapped. Only what places the
# window runs before the map request.
show_dropdown() {
    local wid=$1 properties=$2 info=$3 root=$4 desktop=$5
    local ids monitor extents client position="" x y
    ids=$(client_ids "$root")
    if contains_line "$ids" "$wid"; then
        withdraw_window "$wid"
        trace show-withdrawn
    fi
    if ! monitor=$(pointer_monitor_geometry "$root"); then
        exit 1
    fi
    trace show-monitor
    if ! ensure_user_position_hint "$wid" "$properties"; then
        warn "window $wid will be moved after it is mapped"
    elif extents=$(frame_extents_from "$properties"); then
        if ! client=$(client_size_from "$info" "$wid"); then
            exit 1
        fi
        position=$(centered_position "$monitor" "$client" "$extents")
    fi
    trace show-placed
    if [[ -n $position ]]; then
        read -r x y <<<"$position"
        if ! xdotool windowmove "$wid" "$x" "$y" windowmap "$wid"; then
            die "could not move window $wid to $x,$y and map it"
        fi
    elif ! xdotool windowmap "$wid"; then
        die "could not map window $wid"
    fi
    trace show-map-sent
    if ! wait_until is_managed "$wid"; then
        die "window $wid is not managed ${TIMEOUT_SECONDS}s after mapping it"
    fi
    trace show-managed
    if [[ -n $position ]] && ! has_wm_state "$wid" _NET_WM_STATE_MAXIMIZED_; then
        if ! xdotool set_desktop_for_window "$wid" "$desktop" windowactivate "$wid"; then
            die "could not move window $wid to workspace $desktop and activate it"
        fi
        return 0
    fi
    center_mapped_window "$wid" "$desktop" "$monitor"
}

# Prints the id of a normal, viewable Nemo window managed now but absent from $1.
find_new_nemo_window() {
    local known_ids=$1 ids wid
    if ! ids=$(managed_window_ids); then
        return 1
    fi
    for wid in $ids; do
        if contains_line "$known_ids" "$wid"; then
            continue
        fi
        if ! is_nemo_window "$wid"; then
            continue
        fi
        if property_matches "$wid" _NET_WM_WINDOW_TYPE "*_NET_WM_WINDOW_TYPE_NORMAL*" && is_viewable "$wid"; then
            echo "$wid"
            return 0
        fi
    done
    return 1
}

create_dropdown() {
    local known_ids wid hints extents root desktop monitor frame position
    if ! known_ids=$(managed_window_ids); then
        die "could not list the managed windows with xprop"
    fi
    # The launched nemo can become the long-lived Nemo process: it must not
    # inherit the lock, or every later press would be skipped.
    setsid -f nemo "$HOME" 9>&- >/dev/null 2>&1 </dev/null
    if ! wid=$(wait_until find_new_nemo_window "$known_ids"); then
        die "ran 'nemo $HOME' but no new Nemo window appeared within ${TIMEOUT_SECONDS}s"
    fi
    mark_dropdown_window "$wid"
    echo "$wid" >"$WID_FILE"
    if ! hints=$(window_property "$wid" WM_NORMAL_HINTS); then
        die "could not read the size hints of window $wid"
    fi
    if ! ensure_user_position_hint "$wid" "$hints"; then
        warn "window $wid will be moved after it is mapped at each show"
    fi
    restore_if_maximized "$wid"
    extents=$(mapped_frame_extents "$wid")
    read_root_state root desktop
    if ! monitor=$(pointer_monitor_geometry "$root"); then
        exit 1
    fi
    frame=$(default_frame_size "$monitor")
    resize_frame "$wid" "$frame" "$extents"
    position=$(centered_position "$monitor" "$frame")
    place_on_workspace "$wid" "$desktop" "$position"
}

# The /tmp fallback is shared by all users: refuse a directory someone else
# created there, or a symlink in place of the directory or its files.
ensure_state_dir() {
    local file
    if [[ ! -e $STATE_DIR && ! -L $STATE_DIR ]]; then
        mkdir -m 700 "$STATE_DIR"
    fi
    if [[ -L $STATE_DIR || ! -d $STATE_DIR || ! -O $STATE_DIR ]]; then
        die "state directory $STATE_DIR is a symlink, not a directory, or not owned by $(id -un)"
    fi
    if [[ $STATE_DIR_IS_SHARED == true ]]; then
        chmod 700 "$STATE_DIR"
    fi
    for file in "$LOCK_FILE" "$WID_FILE" "$MONITOR_CACHE_FILE" "$TRACE_FILE"; do
        if [[ -L $file ]]; then
            die "refusing to use $file: it is a symlink"
        fi
    done
}

main() {
    local wid="" saved properties info root desktop
    require_valid_timeout
    require_commands
    ensure_state_dir
    trace checks-done

    # A press while another run of this script is still working is ignored,
    # so a fast double press cannot create two dropdowns.
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        exit 0
    fi
    trace lock

    # No saved id is the normal "no dropdown yet" case.
    if [[ -e $WID_FILE ]]; then
        if ! mapfile -t -n 1 saved 2>/dev/null <"$WID_FILE"; then
            die "could not read the saved window id in $WID_FILE"
        fi
        wid=${saved[0]:-}
    fi
    if ! properties=$(dropdown_properties "$wid"); then
        create_dropdown
        return 0
    fi
    if ! info=$(xwininfo -id "$wid"); then
        die "could not run xwininfo on window $wid"
    fi
    read_root_state root desktop
    trace validated
    if is_shown_here "$properties" "$info" "$desktop"; then
        trace decided-hide
        hide_dropdown "$wid"
        trace hide-done
        return 0
    fi
    trace decided-show
    show_dropdown "$wid" "$properties" "$info" "$root" "$desktop"
    trace show-activated
    if [[ -f $TRACE_SWITCH ]]; then
        if wait_until is_viewable "$wid"; then
            trace show-viewable
        fi
    fi
}

main "$@"
