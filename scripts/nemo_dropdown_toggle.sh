#!/bin/bash
#
# Toggle one dropdown Nemo window.
# First run opens a Nemo window on $HOME, next run hides it, next run shows
# the same window again on the current workspace, centered on the monitor
# under the pointer. A new dropdown opens at WIDTH_PERCENT x HEIGHT_PERCENT of
# that monitor; afterwards its size is never changed, so it keeps the size the
# user gives it.
#
# Keybinding: Cinnamon custom shortcut "Dropdown Nemo", binding Super+E,
# command /home/bgi/Repos/dotfiles/scripts/nemo_dropdown_toggle.sh
# (System Settings > Keyboard > Shortcuts > Custom Shortcuts).
#
# Needs: xdotool xprop xwininfo xrandr flock setsid python3 with python3-gi
# (GdkX11). Optional: notify-send, which shows errors as a notification,
# since a keybinding's stderr is never seen.
#
# Why not tdrop: Nemo is a single-instance application. A `nemo` command
# hands its request to the running process and exits, so the new window never
# belongs to the launched pid; tdrop waits for a window of that pid and times
# out. This script tracks its own window instead.
#
# Limitation: the dropdown is the first new normal Nemo window that appears
# after launching nemo. Another Nemo window opened in the same second, such as
# a file operation window, can be adopted instead. The title cannot narrow it:
# Nemo shows "nemo" until the folder loads, and the folder name is localized.
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
readonly POLL_SECONDS=0.1
readonly MICROSECONDS_PER_SECOND=1000000

readonly NEMO_WM_CLASS='WM_CLASS(STRING) = "nemo", "Nemo"'
readonly MARK_PROPERTY=NEMO_DROPDOWN
readonly MARK_VALUE=1
readonly STICKY_DESKTOP=4294967295
readonly NOTIFY_TITLE="Dropdown Nemo"

if [[ ${XDG_RUNTIME_DIR:-} == /* ]]; then
    readonly STATE_DIR="$XDG_RUNTIME_DIR/nemo-dropdown"
else
    readonly STATE_DIR="/tmp/nemo-dropdown-$UID"
fi
readonly WID_FILE="$STATE_DIR/wid"
readonly LOCK_FILE="$STATE_DIR/lock"

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

require_valid_timeout() {
    if [[ ! $TIMEOUT_SECONDS =~ ^[1-9][0-9]*$ ]]; then
        die "NEMO_DROPDOWN_TIMEOUT_SECONDS must be a positive integer, got '$TIMEOUT_SECONDS'"
    fi
}

# require_version only checks that the GdkX11 typelib exists, at about half
# the cost of importing it on every key press.
require_commands() {
    local cmd
    for cmd in nemo xdotool xprop xwininfo xrandr flock setsid python3; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            die "$cmd is not installed"
        fi
    done
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

is_in_list() {
    local wid=$1 ids=$2
    [[ $'\n'$ids$'\n' == *$'\n'$wid$'\n'* ]]
}

is_managed() {
    is_in_list "$1" "$(managed_window_ids)"
}

window_property() {
    local wid=$1 property=$2
    xprop -id "$wid" "$property" 2>/dev/null
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
    local wid=$1
    if [[ ! $wid =~ ^[0-9]+$ ]]; then
        return 1
    fi
    if ! is_nemo_window "$wid"; then
        return 1
    fi
    property_matches "$wid" "$MARK_PROPERTY" "$MARK_PROPERTY(STRING) = \"$MARK_VALUE\""
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

window_desktop() {
    local wid=$1 desktop
    desktop=$(window_property "$wid" _NET_WM_DESKTOP || true)
    if [[ $desktop =~ =\ ([0-9]+)$ ]]; then
        echo "${BASH_REMATCH[1]}"
    fi
}

# Muffin keeps the windows of other workspaces mapped (IsViewable), so
# viewable alone does not mean the user can see the window.
is_shown_here() {
    local wid=$1 desktop
    if ! is_viewable "$wid"; then
        return 1
    fi
    if has_wm_state "$wid" _NET_WM_STATE_HIDDEN; then
        return 1
    fi
    desktop=$(window_desktop "$wid")
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

# Prints "width height x y" of the monitor containing the pointer, or of the
# first monitor when the pointer is outside every monitor.
pointer_monitor_geometry() {
    local location pointer_x pointer_y monitors line first=""
    local width height x y
    if ! location=$(xdotool getmouselocation --shell); then
        die "could not read the pointer location with xdotool"
    fi
    pointer_x=$(sed -n 's/^X=//p' <<<"$location")
    pointer_y=$(sed -n 's/^Y=//p' <<<"$location")
    if [[ ! $pointer_x =~ ^-?[0-9]+$ || ! $pointer_y =~ ^-?[0-9]+$ ]]; then
        die "unexpected pointer location from 'xdotool getmouselocation': $location"
    fi
    if ! monitors=$(xrandr --listmonitors); then
        die "could not list the monitors with xrandr"
    fi
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
        if ((pointer_x >= x && pointer_x < x + width && pointer_y >= y && pointer_y < y + height)); then
            echo "$width $height $x $y"
            return 0
        fi
    done <<<"$monitors"
    if [[ -z $first ]]; then
        die "no monitor found in 'xrandr --listmonitors'"
    fi
    echo "$first"
}

# Prints "left right top bottom" of the window frame, zeros when unknown.
frame_extents() {
    local wid=$1 extents
    extents=$(window_property "$wid" _NET_FRAME_EXTENTS || true)
    if [[ $extents =~ =\ ([0-9]+),\ ([0-9]+),\ ([0-9]+),\ ([0-9]+)$ ]]; then
        echo "${BASH_REMATCH[1]} ${BASH_REMATCH[2]} ${BASH_REMATCH[3]} ${BASH_REMATCH[4]}"
        return 0
    fi
    echo "0 0 0 0"
}

# Right after a map the WM may not have set the frame extents yet; without
# them the frame is taken as the client area alone.
wait_for_frame_extents() {
    local wid=$1
    if ! wait_until property_matches "$wid" _NET_FRAME_EXTENTS "*=*"; then
        echo "$SCRIPT_NAME: window $wid has no frame extents, assuming no frame" >&2
    fi
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

# Prints "width height" of the window's frame, title bar and borders included.
frame_size() {
    local wid=$1 client client_width client_height extents left right top bottom
    if ! client=$(client_size "$wid"); then
        return 1
    fi
    extents=$(frame_extents "$wid")
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
    local wid=$1 frame_width=$2 frame_height=$3 extents left right top bottom
    extents=$(frame_extents "$wid")
    read -r left right top bottom <<<"$extents"
    if ! xdotool windowsize "$wid" $((frame_width - left - right)) $((frame_height - top - bottom)); then
        die "could not resize window $wid"
    fi
}

# center_and_activate <wid> <"width height x y" of the monitor> <frame width> <frame height>
# The frame size is passed in: right after a resize the window still reports
# its old size.
center_and_activate() {
    local wid=$1 monitor=$2 frame_width=$3 frame_height=$4
    local monitor_width monitor_height monitor_x monitor_y offset_x offset_y
    read -r monitor_width monitor_height monitor_x monitor_y <<<"$monitor"
    offset_x=$(centered_offset "$frame_width" "$monitor_width")
    offset_y=$(centered_offset "$frame_height" "$monitor_height")
    if ! xdotool windowmove "$wid" $((monitor_x + offset_x)) $((monitor_y + offset_y)); then
        die "could not move window $wid"
    fi
    if ! xdotool windowactivate "$wid"; then
        die "could not activate window $wid"
    fi
}

# GTK maximizes the window again each time it is mapped, and the WM ignores
# a resize of a maximized window. This xdotool has no windowstate command and
# wmctrl is not installed, so the request goes through GDK (python3-gi).
unmaximize_window() {
    local wid=$1
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
bring_to_current_desktop() {
    local wid=$1 maximized_size
    xdotool set_desktop_for_window "$wid" "$(xdotool get_desktop)"
    if ! has_wm_state "$wid" _NET_WM_STATE_MAXIMIZED_; then
        return 0
    fi
    maximized_size=$(client_size "$wid")
    unmaximize_window "$wid"
    if ! wait_while client_size_is "$wid" "$maximized_size"; then
        return 0
    fi
}

hide_dropdown() {
    xdotool windowunmap "$1"
}

# A window that is minimized or on another workspace is withdrawn first, so
# it is shown again through the same path as a hidden one.
show_dropdown() {
    local wid=$1 monitor size frame_width frame_height
    if is_managed "$wid"; then
        xdotool windowunmap "$wid"
        if ! wait_while is_managed "$wid"; then
            die "window $wid is still managed ${TIMEOUT_SECONDS}s after unmapping it"
        fi
    fi
    xdotool windowmap "$wid"
    if ! wait_until is_managed "$wid"; then
        die "window $wid is not managed ${TIMEOUT_SECONDS}s after mapping it"
    fi
    bring_to_current_desktop "$wid"
    wait_for_frame_extents "$wid"
    monitor=$(pointer_monitor_geometry)
    size=$(frame_size "$wid")
    read -r frame_width frame_height <<<"$size"
    center_and_activate "$wid" "$monitor" "$frame_width" "$frame_height"
}

# Prints the id of a normal, viewable Nemo window managed now but absent from $1.
find_new_nemo_window() {
    local known_ids=$1 wid
    for wid in $(managed_window_ids); do
        if is_in_list "$wid" "$known_ids"; then
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
    local known_ids wid monitor monitor_width monitor_height size frame_width frame_height
    known_ids=$(managed_window_ids)
    # The launched nemo can become the long-lived Nemo process: it must not
    # inherit the lock, or every later press would be skipped.
    setsid -f nemo "$HOME" 9>&- >/dev/null 2>&1 </dev/null
    if ! wid=$(wait_until find_new_nemo_window "$known_ids"); then
        die "ran 'nemo $HOME' but no new Nemo window appeared within ${TIMEOUT_SECONDS}s"
    fi
    mark_dropdown_window "$wid"
    echo "$wid" >"$WID_FILE"
    bring_to_current_desktop "$wid"
    wait_for_frame_extents "$wid"
    monitor=$(pointer_monitor_geometry)
    read -r monitor_width monitor_height _ <<<"$monitor"
    size=$(default_frame_size "$monitor_width" "$monitor_height")
    read -r frame_width frame_height <<<"$size"
    resize_frame "$wid" "$frame_width" "$frame_height"
    center_and_activate "$wid" "$monitor" "$frame_width" "$frame_height"
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
    for file in "$LOCK_FILE" "$WID_FILE"; do
        if [[ -L $file ]]; then
            die "refusing to use $file: it is a symlink"
        fi
    done
}

saved_window_id() {
    if [[ -f $WID_FILE ]]; then
        cat "$WID_FILE"
    fi
}

main() {
    local wid
    require_valid_timeout
    require_commands
    ensure_state_dir

    # A press while another run of this script is still working is ignored,
    # so a fast double press cannot create two dropdowns.
    exec 9>"$LOCK_FILE"
    if ! flock -n 9; then
        exit 0
    fi

    wid=$(saved_window_id)
    if ! is_dropdown_window "$wid"; then
        create_dropdown
        return 0
    fi
    if is_shown_here "$wid"; then
        hide_dropdown "$wid"
        return 0
    fi
    show_dropdown "$wid"
}

main "$@"
