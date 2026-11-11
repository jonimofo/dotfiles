#!/usr/bin/env bash
# Enable, disable or reload one Cinnamon extension without touching the other enabled ones.
# Usage: extension.sh enable|disable|reload <uuid>
set -euo pipefail

readonly SCHEMA="org.cinnamon"
readonly KEY="enabled-extensions"
readonly EMPTY_LIST="@as []"
# Cinnamon unloads the extension asynchronously: wait before loading it again.
readonly RELOAD_PAUSE_SECONDS=2

say() {
    printf '%s\n' "$*"
}

usage() {
    say "Usage: $(basename "$0") enable|disable|reload <uuid>" >&2
    exit 2
}

is_enabled() {
    local current
    current=$(gsettings get "$SCHEMA" "$KEY")
    [[ "$current" == *"'$uuid'"* ]]
}

enable() {
    local current
    if is_enabled; then
        say "unchanged: $uuid is already enabled"
        return
    fi
    current=$(gsettings get "$SCHEMA" "$KEY")
    if [[ "$current" == "$EMPTY_LIST" || "$current" == "[]" ]]; then
        gsettings set "$SCHEMA" "$KEY" "['$uuid']"
    else
        gsettings set "$SCHEMA" "$KEY" "${current%]}, '$uuid']"
    fi
    say "enabled: $uuid"
}

disable() {
    local current remaining
    if ! is_enabled; then
        say "unchanged: $uuid is not enabled"
        return
    fi
    current=$(gsettings get "$SCHEMA" "$KEY")
    remaining=${current//"'$uuid', "/}
    remaining=${remaining//", '$uuid'"/}
    if [[ "$remaining" == "['$uuid']" ]]; then
        remaining="$EMPTY_LIST"
    fi
    gsettings set "$SCHEMA" "$KEY" "$remaining"
    say "disabled: $uuid"
}

if [[ $# -ne 2 ]]; then
    usage
fi
action="$1"
uuid="$2"

case "$action" in
    enable) enable ;;
    disable) disable ;;
    reload)
        disable
        sleep "$RELOAD_PAUSE_SECONDS"
        enable
        ;;
    *) usage ;;
esac
