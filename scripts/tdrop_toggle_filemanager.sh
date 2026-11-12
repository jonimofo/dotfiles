#!/bin/bash
#
# Toggle one dropdown Nemo window (bound to Super+E in Cinnamon).
# First run opens a Nemo window on $HOME, next run hides it, next run shows
# the same window again on the current workspace. The window is placed at the
# top of the monitor under the pointer, centered horizontally.
#
# Nemo is a single-instance application: a `nemo` command hands its request to
# the running process and exits, so the new window never belongs to the
# launched pid. tdrop waits for a window of that pid and times out, which is
# why this script tracks the window itself instead of using tdrop.

set -euo pipefail

readonly WIDTH_PERCENT=80
readonly HEIGHT_PERCENT=60
readonly TIMEOUT_SECONDS=10
readonly POLL_SECONDS=0.1
readonly POLLS_PER_SECOND=10

readonly NEMO_WM_CLASS='WM_CLASS(STRING) = "nemo", "Nemo"'
readonly MARK_PROPERTY=NEMO_DROPDOWN
readonly MARK_VALUE=1
readonly STICKY_DESKTOP=4294967295

if [[ -n ${XDG_RUNTIME_DIR:-} ]]; then
    readonly STATE_DIR="$XDG_RUNTIME_DIR/nemo-dropdown"
else
    readonly STATE_DIR="/tmp/nemo-dropdown-$UID"
fi
readonly WID_FILE="$STATE_DIR/wid"
readonly LOCK_FILE="$STATE_DIR/lock"

readonly SCRIPT_NAME="${0##*/}"

die() {
    echo "$SCRIPT_NAME: $*" >&2
    exit 1
}

require_commands() {
    local cmd
    for cmd in nemo xdotool xprop xwininfo xrandr flock setsid; do
        if ! command -v "$cmd" >/dev/null 2>&1; then
            die "$cmd is not installed"
        fi
    done
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

is_unmanaged() {
    ! is_managed "$1"
}

window_property() {
    local wid=$1 property=$2
    xprop -id "$wid" "$property" 2>/dev/null
}

is_nemo_window() {
    local wid=$1 class
    if ! class=$(window_property "$wid" WM_CLASS); then
        return 1
    fi
    [[ $class == "$NEMO_WM_CLASS" ]]
}

is_normal_window() {
    local wid=$1 type
    if ! type=$(window_property "$wid" _NET_WM_WINDOW_TYPE); then
        return 1
    fi
    [[ $type == *_NET_WM_WINDOW_TYPE_NORMAL* ]]
}

has_dropdown_mark() {
    local wid=$1 mark
    if ! mark=$(window_property "$wid" "$MARK_PROPERTY"); then
        return 1
    fi
    [[ $mark == "$MARK_PROPERTY(STRING) = \"$MARK_VALUE\"" ]]
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
    has_dropdown_mark "$wid"
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

is_minimized() {
    local wid=$1 state
    state=$(window_property "$wid" _NET_WM_STATE || true)
    [[ $state == *_NET_WM_STATE_HIDDEN* ]]
}

# Muffin keeps the windows of other workspaces mapped (IsViewable), so
# viewable alone does not mean the user can see the window.
is_shown_here() {
    local wid=$1 desktop
    if ! is_viewable "$wid"; then
        return 1
    fi
    if is_minimized "$wid"; then
        return 1
    fi
    desktop=$(window_desktop "$wid")
    [[ $desktop == "$(xdotool get_desktop)" || $desktop == "$STICKY_DESKTOP" ]]
}

# Runs "$@" until it succeeds or TIMEOUT_SECONDS elapse.
wait_until() {
    local polls=$((TIMEOUT_SECONDS * POLLS_PER_SECOND))
    while ((polls > 0)); do
        if "$@"; then
            return 0
        fi
        sleep "$POLL_SECONDS"
        polls=$((polls - 1))
    done
    return 1
}

# Prints "width height x y" of the monitor containing the pointer, or of the
# first monitor when the pointer is outside every monitor.
pointer_monitor_geometry() {
    local location pointer_x pointer_y monitors line first=""
    local width height x y
    location=$(xdotool getmouselocation --shell)
    pointer_x=$(sed -n 's/^X=//p' <<<"$location")
    pointer_y=$(sed -n 's/^Y=//p' <<<"$location")
    monitors=$(xrandr --listmonitors)
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

# The percentages apply to the frame, so the title bar counts in the height.
place_on_pointer_monitor() {
    local wid=$1
    local monitor_width monitor_height monitor_x monitor_y
    local left right top bottom outer_width outer_height monitor extents
    monitor=$(pointer_monitor_geometry)
    extents=$(frame_extents "$wid")
    read -r monitor_width monitor_height monitor_x monitor_y <<<"$monitor"
    read -r left right top bottom <<<"$extents"
    outer_width=$((monitor_width * WIDTH_PERCENT / 100))
    outer_height=$((monitor_height * HEIGHT_PERCENT / 100))
    xdotool windowsize "$wid" $((outer_width - left - right)) $((outer_height - top - bottom))
    xdotool windowmove "$wid" $((monitor_x + (monitor_width - outer_width) / 2)) "$monitor_y"
}

is_maximized() {
    local wid=$1 state
    state=$(window_property "$wid" _NET_WM_STATE || true)
    [[ $state == *_NET_WM_STATE_MAXIMIZED_* ]]
}

is_not_maximized() {
    ! is_maximized "$1"
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
        die "could not ask the WM to unmaximize window $wid (needs python3-gi)"
    fi
    if ! wait_until is_not_maximized "$wid"; then
        die "window $wid is still maximized ${TIMEOUT_SECONDS}s after asking to unmaximize it"
    fi
}

bring_here() {
    local wid=$1
    xdotool set_desktop_for_window "$wid" "$(xdotool get_desktop)"
    if is_maximized "$wid"; then
        unmaximize_window "$wid"
    fi
    place_on_pointer_monitor "$wid"
    xdotool windowactivate "$wid"
}

hide_dropdown() {
    xdotool windowunmap "$1"
}

# A window that is minimized or on another workspace is withdrawn first, so
# it is shown again through the same path as a hidden one.
show_dropdown() {
    local wid=$1
    if is_managed "$wid"; then
        xdotool windowunmap "$wid"
        if ! wait_until is_unmanaged "$wid"; then
            die "window $wid is still managed ${TIMEOUT_SECONDS}s after unmapping it"
        fi
    fi
    xdotool windowmap "$wid"
    if ! wait_until is_managed "$wid"; then
        die "window $wid is not managed ${TIMEOUT_SECONDS}s after mapping it"
    fi
    bring_here "$wid"
}

# Prints the id of a Nemo window managed now but absent from $1.
find_new_nemo_window() {
    local known_ids=$1 wid
    for wid in $(managed_window_ids); do
        if is_in_list "$wid" "$known_ids"; then
            continue
        fi
        if is_nemo_window "$wid" && is_normal_window "$wid" && is_viewable "$wid"; then
            echo "$wid"
            return 0
        fi
    done
    return 1
}

create_dropdown() {
    local known_ids wid
    known_ids=$(managed_window_ids)
    setsid -f nemo "$HOME" >/dev/null 2>&1 </dev/null
    if ! wid=$(wait_until find_new_nemo_window "$known_ids"); then
        die "ran 'nemo $HOME' but no new Nemo window appeared within ${TIMEOUT_SECONDS}s"
    fi
    mark_dropdown_window "$wid"
    echo "$wid" >"$WID_FILE"
    bring_here "$wid"
}

# The /tmp fallback is shared by all users: refuse a directory someone else
# created there, or a symlink.
ensure_state_dir() {
    if [[ ! -e $STATE_DIR ]]; then
        mkdir -m 700 "$STATE_DIR"
    fi
    if [[ -L $STATE_DIR || ! -O $STATE_DIR ]]; then
        die "state directory $STATE_DIR is a symlink or not owned by $(id -un)"
    fi
    chmod 700 "$STATE_DIR"
}

saved_window_id() {
    if [[ -f $WID_FILE ]]; then
        cat "$WID_FILE"
    fi
}

main() {
    local wid
    require_commands
    ensure_state_dir

    # A press while another run is still working is ignored, so a fast double
    # press cannot create two dropdowns.
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
