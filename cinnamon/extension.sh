#!/usr/bin/env bash
# Enable, disable or reload one Cinnamon extension without touching the other enabled ones.
# Usage: extension.sh enable|disable|reload <uuid>
set -euo pipefail

# shellcheck source=cinnamon/xlet-common.sh
source "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/xlet-common.sh"

readonly SCHEMA="org.cinnamon"
readonly KEY="enabled-extensions"
# Where Cinnamon looks for extensions, user folder first.
readonly EXTENSION_DIRS=(
    "${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/extensions"
    "/usr/share/cinnamon/extensions"
)

usage() {
    say "Usage: $(basename "$0") enable|disable|reload <uuid>" >&2
    exit 2
}

# Cinnamon also accepts '!uuid': the same extension, loaded without the version check.
is_enabled() {
    local current
    current=$(gsettings get "$SCHEMA" "$KEY")
    [[ "$current" == *"'$uuid'"* || "$current" == *"'!$uuid'"* ]]
}

is_installed() {
    is_installed_in "${EXTENSION_DIRS[@]}"
}

enable_extension() {
    local current
    if is_enabled; then
        say "unchanged: $uuid is already enabled"
        return
    fi
    if ! is_installed; then
        fail "$uuid is not installed (no metadata.json in ${EXTENSION_DIRS[*]})"
    fi
    current=$(gsettings get "$SCHEMA" "$KEY")
    if [[ "$current" == "$EMPTY_LIST" || "$current" == "[]" ]]; then
        gsettings set "$SCHEMA" "$KEY" "['$uuid']"
    else
        gsettings set "$SCHEMA" "$KEY" "${current%]}, '$uuid']"
    fi
    say "enabled: $uuid"
}

disable_extension() {
    local current remaining entry
    if ! is_enabled; then
        say "unchanged: $uuid is not enabled"
        return
    fi
    remaining=$(gsettings get "$SCHEMA" "$KEY")
    for entry in "'$uuid'" "'!$uuid'"; do
        remaining=${remaining//"$entry, "/}
        remaining=${remaining//", $entry"/}
        if [[ "$remaining" == "[$entry]" ]]; then
            remaining="$EMPTY_LIST"
        fi
    done
    gsettings set "$SCHEMA" "$KEY" "$remaining"
    say "disabled: $uuid"
}

reload_extension() {
    if ! is_enabled; then
        enable_extension
        return
    fi
    reload_xlet EXTENSION
    say "reloaded: $uuid"
}

if [[ $# -ne 2 ]]; then
    usage
fi
action="$1"
uuid="$2"
require_valid_uuid extension

case "$action" in
    enable) enable_extension ;;
    disable) disable_extension ;;
    reload) reload_extension ;;
    *) usage ;;
esac
