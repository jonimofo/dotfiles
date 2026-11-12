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
# the position hint once per dropdown; without it the dropdown is moved after
# it appears. python3-gi (GdkX11) unmaximizes a maximized dropdown and is
# checked only then. Optional: notify-send, which shows errors as a
# notification, since a keybinding's stderr is never seen.
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
#
# Tests: scripts/nemo_dropdown_toggle-test.sh

set -euo pipefail
# set -e does not apply inside $(...): a function whose output is captured
# only reads and dies on failure, and every call that changes a window runs in
# the caller's shell with an explicit check.

readonly WIDTH_PERCENT=80
readonly HEIGHT_PERCENT=80
readonly DEFAULT_TIMEOUT_SECONDS=10
readonly TIMEOUT_SECONDS="${NEMO_DROPDOWN_TIMEOUT_SECONDS:-$DEFAULT_TIMEOUT_SECONDS}"
readonly POLL_SECONDS=0.02
readonly MICROSECONDS_PER_SECOND=1000000

readonly NEMO_WM_CLASS='WM_CLASS(STRING) = "nemo", "Nemo"'
readonly MARK_PROPERTY=NEMO_DROPDOWN
readonly MARK_VALUE=1
readonly STICKY_DESKTOP=4294967295
readonly USER_POSITION_LINE="user specified location:"
readonly LAYOUT_KEY_PROPERTY=_GTK_WORKAREAS_D0
readonly NOTIFY_TITLE="Dropdown Nemo"

if [[ ${XDG_RUNTIME_DIR:-} == /* ]]; then
    readonly STATE_DIR="$XDG_RUNTIME_DIR/nemo-dropdown"
else
    readonly STATE_DIR="/tmp/nemo-dropdown-$UID"
fi
readonly WID_FILE="$STATE_DIR/wid"
readonly LOCK_FILE="$STATE_DIR/lock"
readonly MONITOR_CACHE_FILE="$STATE_DIR/monitors"

readonly SCRIPT_NAME="${0##*/}"

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

# Prints the decimal ids of the windows managed by the window manager.
managed_window_ids() {
    local list token
    list=$(xprop -root _NET_CLIENT_LIST)
    for token in $list; do
        if [[ $token =~ ^(0x[0-9a-fA-F]+),?$ ]]; then
            printf '%d\n' "${BASH_REMATCH[1]}"
        fi
    done
}

# contains_line <lines> <line>
contains_line() {
    local lines=$1 line=$2
    [[ $'\n'$lines$'\n' == *$'\n'"$line"$'\n'* ]]
}

is_managed() {
    contains_line "$(managed_window_ids)" "$1"
}

# window_property <wid> <property...>: xprop prints one line per property.
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

# X window ids are reused: a saved id counts only if the window still carries
# the mark this script set on it.
is_dropdown_window() {
    local wid=$1 properties
    if [[ ! $wid =~ ^[0-9]+$ ]]; then
        return 1
    fi
    if ! properties=$(window_property "$wid" WM_CLASS "$MARK_PROPERTY"); then
        return 1
    fi
    if ! contains_line "$properties" "$NEMO_WM_CLASS"; then
        return 1
    fi
    contains_line "$properties" "$MARK_PROPERTY(STRING) = \"$MARK_VALUE\""
}

mark_dropdown_window() {
    local wid=$1
    xprop -id "$wid" -f "$MARK_PROPERTY" 8s -set "$MARK_PROPERTY" "$MARK_VALUE"
}

is_viewable() {
    local wid=$1 info
    if ! info=$(xwininfo -id "$wid" 2>/dev/null); then
        return 1
    fi
    [[ $info == *"Map State: IsViewable"* ]]
}

# Muffin keeps the windows of other workspaces mapped (IsViewable), so
# viewable alone does not mean the user can see the window.
is_shown_here() {
    local wid=$1 properties desktop
    if ! is_viewable "$wid"; then
        return 1
    fi
    if ! properties=$(window_property "$wid" _NET_WM_STATE _NET_WM_DESKTOP); then
        return 1
    fi
    if [[ $properties == *_NET_WM_STATE_HIDDEN* ]]; then
        return 1
    fi
    if [[ ! $properties =~ _NET_WM_DESKTOP\(CARDINAL\)\ =\ ([0-9]+) ]]; then
        return 1
    fi
    desktop=${BASH_REMATCH[1]}
    [[ $desktop == "$(xdotool get_desktop)" || $desktop == "$STICKY_DESKTOP" ]]
}

# EPOCHREALTIME uses the locale's decimal separator.
now_microseconds() {
    echo "${EPOCHREALTIME/[.,]/}"
}

# wait_for_status <0|1> <command...>: runs the command until its status is
# success (0) or failure (1), for at most TIMEOUT_SECONDS.
wait_for_status() {
    local wanted=$1 deadline status
    shift
    deadline=$(($(now_microseconds) + TIMEOUT_SECONDS * MICROSECONDS_PER_SECOND))
    while true; do
        if "$@"; then
            status=0
        else
            status=1
        fi
        if ((status == wanted)); then
            return 0
        fi
        if (($(now_microseconds) >= deadline)); then
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

# Prints the root property that keys the monitor cache, empty when the WM
# does not set it. _GTK_WORKAREAS_D0 holds one rectangle per monitor, so it
# changes when a monitor is added, removed, moved or resized.
layout_key() {
    local value
    if ! value=$(xprop -root "$LAYOUT_KEY_PROPERTY" 2>/dev/null); then
        return 0
    fi
    if [[ $value == "$LAYOUT_KEY_PROPERTY("*") = "* ]]; then
        echo "$value"
    fi
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

# Runs in the background after a show: xrandr costs more than the rest of the
# press. A layout change that leaves the key unchanged centers the window on
# the old layout for one press at worst. The key is read before xrandr, so a
# change during the refresh leaves an old key, never a new key on old data.
write_monitor_cache() {
    local key monitors tmp="$MONITOR_CACHE_FILE.$BASHPID"
    key=$(layout_key)
    if [[ -z $key ]]; then
        return 0
    fi
    if ! monitors=$(xrandr --current --listmonitors); then
        warn "could not refresh the monitor cache with xrandr"
        return 1
    fi
    if ! printf '%s\n%s\n' "$key" "$monitors" >"$tmp"; then
        warn "could not write $tmp"
        return 1
    fi
    if ! mv -f "$tmp" "$MONITOR_CACHE_FILE"; then
        warn "could not replace $MONITOR_CACHE_FILE"
        return 1
    fi
}

# The refresh outlives the press: it must not inherit the lock.
refresh_monitor_cache_in_background() {
    write_monitor_cache 9>&- </dev/null >/dev/null &
}

# monitor_containing <x> <y> <'xrandr --listmonitors' output>: prints
# "width height x y" of the monitor containing the point, or of the first
# monitor when no monitor contains it; fails when no monitor is listed.
monitor_containing() {
    local point_x=$1 point_y=$2 monitors=$3 line first=""
    local width height x y
    while read -r line; do
        if [[ ! $line =~ ([0-9]+)/[0-9]+x([0-9]+)/[0-9]+\+(-?[0-9]+)\+(-?[0-9]+) ]]; then
            continue
        fi
        width=${BASH_REMATCH[1]}
        height=${BASH_REMATCH[2]}
        x=${BASH_REMATCH[3]}
        y=${BASH_REMATCH[4]}
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

# Prints "width height x y" of the monitor containing the pointer, or of the
# first monitor when the pointer is outside every monitor. An unusable cache
# falls back to xrandr.
pointer_monitor_geometry() {
    local location line pointer_x="" pointer_y="" key monitors
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
    key=$(layout_key)
    if [[ -n $key ]]; then
        if monitors=$(cached_monitors "$key"); then
            if monitor_containing "$pointer_x" "$pointer_y" "$monitors"; then
                return 0
            fi
        fi
    fi
    if ! monitors=$(xrandr --current --listmonitors); then
        die "could not list the monitors with xrandr"
    fi
    if ! monitor_containing "$pointer_x" "$pointer_y" "$monitors"; then
        die "no monitor found in 'xrandr --listmonitors'"
    fi
}

# Prints "left right top bottom" of the window frame; fails when the WM has
# not set them.
frame_extents() {
    local wid=$1 extents
    if ! extents=$(window_property "$wid" _NET_FRAME_EXTENTS); then
        return 1
    fi
    if [[ ! $extents =~ =\ ([0-9]+),\ ([0-9]+),\ ([0-9]+),\ ([0-9]+)$ ]]; then
        return 1
    fi
    echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]} ${BASH_REMATCH[4]}"
}

# Right after a map the WM may not have set the frame extents yet; without
# them the frame is taken as the client area alone.
mapped_frame_extents() {
    local wid=$1
    if ! wait_until frame_extents "$wid" >/dev/null; then
        warn "window $wid has no frame extents, assuming no frame"
        echo "0 0 0 0"
        return 0
    fi
    frame_extents "$wid"
}

# Prints "width height" of the window's client area. xwininfo's header line
# holds the window title, so only whole lines count and the last match wins:
# the real Width and Height lines come after the header.
client_size() {
    local wid=$1 info line width="" height=""
    if ! info=$(xwininfo -id "$wid"); then
        die "could not run xwininfo on window $wid"
    fi
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

client_size_is() {
    local wid=$1 expected=$2 current
    current=$(client_size "$wid")
    [[ $current == "$expected" ]]
}

# frame_size <wid> <"left right top bottom">: prints "width height" of the
# window's frame, title bar and borders included.
frame_size() {
    local wid=$1 extents=$2 client client_width client_height left right top bottom
    if ! client=$(client_size "$wid"); then
        return 1
    fi
    read -r client_width client_height <<<"$client"
    read -r left right top bottom <<<"$extents"
    echo "$((client_width + left + right)) $((client_height + top + bottom))"
}

# Prints the offset that centers a span of $1 in a span of $2, never negative:
# a window larger than the monitor starts at the monitor's edge.
centered_offset() {
    local size=$1 available=$2
    if ((size >= available)); then
        echo 0
        return 0
    fi
    echo $(((available - size) / 2))
}

# The percentages apply to the frame, so the title bar counts in the height.
default_frame_size() {
    local monitor_width=$1 monitor_height=$2
    echo "$((monitor_width * WIDTH_PERCENT / 100)) $((monitor_height * HEIGHT_PERCENT / 100))"
}

resize_frame() {
    local wid=$1 frame_width=$2 frame_height=$3 extents=$4 left right top bottom
    read -r left right top bottom <<<"$extents"
    if ! xdotool windowsize "$wid" $((frame_width - left - right)) $((frame_height - top - bottom)); then
        die "could not resize window $wid"
    fi
}

# center_window <wid> <"width height x y" of the monitor> <"width height" of the frame>
# The frame size is passed in: right after a resize the window still reports
# its old size. windowmove places the frame's top-left corner, on a managed
# window and on a withdrawn one with the position hint alike.
center_window() {
    local wid=$1 monitor=$2 frame=$3
    local monitor_width monitor_height monitor_x monitor_y frame_width frame_height offset_x offset_y
    read -r monitor_width monitor_height monitor_x monitor_y <<<"$monitor"
    read -r frame_width frame_height <<<"$frame"
    offset_x=$(centered_offset "$frame_width" "$monitor_width")
    offset_y=$(centered_offset "$frame_height" "$monitor_height")
    if ! xdotool windowmove "$wid" $((monitor_x + offset_x)) $((monitor_y + offset_y)); then
        die "could not move window $wid"
    fi
}

activate_window() {
    if ! xdotool windowactivate "$1"; then
        die "could not activate window $1"
    fi
}

has_user_position_hint() {
    local hints
    if ! hints=$(window_property "$1" WM_NORMAL_HINTS); then
        return 1
    fi
    [[ $hints == "WM_NORMAL_HINTS(WM_SIZE_HINTS):"* && $hints == *"$USER_POSITION_LINE"* ]]
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

# Runs only when xprop does not show the hint; a hint that cannot be read is
# written again.
ensure_user_position_hint() {
    local wid=$1
    if has_user_position_hint "$wid"; then
        return 0
    fi
    set_user_position_hint "$wid"
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
restore_maximized_window() {
    local wid=$1 maximized_size
    maximized_size=$(client_size "$wid")
    unmaximize_window "$wid"
    if ! wait_while client_size_is "$wid" "$maximized_size"; then
        return 0
    fi
}

move_to_current_desktop() {
    local wid=$1 desktop
    if ! desktop=$(xdotool get_desktop); then
        die "could not read the current workspace with xdotool"
    fi
    if ! xdotool set_desktop_for_window "$wid" "$desktop"; then
        die "could not move window $wid to workspace $desktop"
    fi
}

hide_dropdown() {
    xdotool windowunmap "$1"
}

# A window that is minimized or on another workspace is withdrawn first, so
# it is shown again through the same path as a hidden one. Muffin keeps the
# frame extents of a withdrawn window; without them, or without the position
# hint, the window is moved once it is mapped.
show_dropdown() {
    local wid=$1 monitor extents="" frame placed=false
    if is_managed "$wid"; then
        xdotool windowunmap "$wid"
        if ! wait_while is_managed "$wid"; then
            die "window $wid is still managed ${TIMEOUT_SECONDS}s after unmapping it"
        fi
    fi
    monitor=$(pointer_monitor_geometry)
    if ! ensure_user_position_hint "$wid"; then
        warn "window $wid will be moved after it is mapped"
    elif extents=$(frame_extents "$wid"); then
        frame=$(frame_size "$wid" "$extents")
        center_window "$wid" "$monitor" "$frame"
        placed=true
    fi
    xdotool windowmap "$wid"
    if ! wait_until is_managed "$wid"; then
        die "window $wid is not managed ${TIMEOUT_SECONDS}s after mapping it"
    fi
    move_to_current_desktop "$wid"
    if has_wm_state "$wid" _NET_WM_STATE_MAXIMIZED_; then
        restore_maximized_window "$wid"
        placed=false
    fi
    if [[ $placed == false ]]; then
        extents=$(mapped_frame_extents "$wid")
        frame=$(frame_size "$wid" "$extents")
        center_window "$wid" "$monitor" "$frame"
    fi
    activate_window "$wid"
}

# Prints the id of a normal, viewable Nemo window managed now but absent from $1.
find_new_nemo_window() {
    local known_ids=$1 wid
    for wid in $(managed_window_ids); do
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
    local known_ids wid monitor monitor_width monitor_height extents frame frame_width frame_height
    known_ids=$(managed_window_ids)
    # The launched nemo can become the long-lived Nemo process: it must not
    # inherit the lock, or every later press would be skipped.
    setsid -f nemo "$HOME" 9>&- >/dev/null 2>&1 </dev/null
    if ! wid=$(wait_until find_new_nemo_window "$known_ids"); then
        die "ran 'nemo $HOME' but no new Nemo window appeared within ${TIMEOUT_SECONDS}s"
    fi
    mark_dropdown_window "$wid"
    echo "$wid" >"$WID_FILE"
    if ! ensure_user_position_hint "$wid"; then
        warn "window $wid will be moved after it is mapped at each show"
    fi
    move_to_current_desktop "$wid"
    if has_wm_state "$wid" _NET_WM_STATE_MAXIMIZED_; then
        restore_maximized_window "$wid"
    fi
    extents=$(mapped_frame_extents "$wid")
    monitor=$(pointer_monitor_geometry)
    read -r monitor_width monitor_height _ <<<"$monitor"
    frame=$(default_frame_size "$monitor_width" "$monitor_height")
    read -r frame_width frame_height <<<"$frame"
    resize_frame "$wid" "$frame_width" "$frame_height" "$extents"
    center_window "$wid" "$monitor" "$frame"
    activate_window "$wid"
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
    chmod 700 "$STATE_DIR"
    for file in "$LOCK_FILE" "$WID_FILE" "$MONITOR_CACHE_FILE"; do
        if [[ -L $file ]]; then
            die "refusing to use $file: it is a symlink"
        fi
    done
}

main() {
    local wid=""
    require_valid_timeout
    require_commands
    ensure_state_dir

    # A press while another run of this script is still working is ignored,
    # so a fast double press cannot create two dropdowns.
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        exit 0
    fi

    if [[ -f $WID_FILE ]]; then
        IFS= read -r wid <"$WID_FILE" || true
    fi
    if ! is_dropdown_window "$wid"; then
        create_dropdown
        refresh_monitor_cache_in_background
        return 0
    fi
    if is_shown_here "$wid"; then
        hide_dropdown "$wid"
        return 0
    fi
    show_dropdown "$wid"
    refresh_monitor_cache_in_background
}

main "$@"
