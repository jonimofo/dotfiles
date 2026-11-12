#!/usr/bin/env bash
# Enable, disable or reload one Cinnamon applet without touching the other panel entries.
# Enable adds it at the right end of panel1's right zone.
# Usage: applet.sh enable|disable|reload <uuid>
set -euo pipefail

# shellcheck source=cinnamon/xlet-common.sh
source "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/xlet-common.sh"

readonly SCHEMA="org.cinnamon"
readonly KEY="enabled-applets"
readonly NEXT_ID_KEY="next-applet-id"
readonly PANEL="panel1"
readonly ZONE="right"
# Where Cinnamon looks for applets, user folder first.
readonly APPLET_DIRS=(
    "${XDG_DATA_HOME:-$HOME/.local/share}/cinnamon/applets"
    "/usr/share/cinnamon/applets"
)

usage() {
    say "Usage: $(basename "$0") enable|disable|reload <uuid>" >&2
    exit 2
}

# list_entries splits on "', '": an entry holding a quote or a backslash would be cut
# wrongly, so such a list is refused before anything is read or written. Runs in the main
# shell: a fail() inside list_entries' process substitution would not stop the script.
require_parseable_list() {
    local current
    current=$(gsettings get "$SCHEMA" "$KEY")
    if [[ "$current" == *\\* || "$current" =~ [^\[,\ ]\'[^,\]] ]]; then
        fail "unexpected character in $KEY, nothing changed"
    fi
}

# One entry per line, without quotes. Entries read 'panelN:zone:order:uuid:instanceId'.
list_entries() {
    local current
    current=$(gsettings get "$SCHEMA" "$KEY")
    if [[ "$current" == "$EMPTY_LIST" || "$current" == "[]" ]]; then
        return
    fi
    current=${current#[}
    current=${current%]}
    current=${current//"', '"/$'\n'}
    current=${current#\'}
    current=${current%\'}
    printf '%s\n' "$current"
}

# Cinnamon also accepts '!uuid': the same applet, loaded without the version check.
is_enabled() {
    local entry entry_uuid
    while IFS= read -r entry; do
        entry_uuid=$(cut -d: -f4 <<<"$entry")
        if [[ "$entry_uuid" == "$uuid" || "$entry_uuid" == "!$uuid" ]]; then
            return 0
        fi
    done < <(list_entries)
    return 1
}

# Order one past the highest order already used in the zone, so the applet lands at its end.
next_order_in_zone() {
    local entry panel zone order highest=-1
    while IFS= read -r entry; do
        IFS=: read -r panel zone order _ <<<"$entry"
        if [[ "$panel" == "$PANEL" && "$zone" == "$ZONE" && "$order" =~ ^[0-9]+$ ]]; then
            if (( order > highest )); then
                highest=$order
            fi
        fi
    done < <(list_entries)
    printf '%d\n' $((highest + 1))
}

# Same steps as Cinnamon Settings (Spices.enable_extension): take next-applet-id as the
# instance id, store id + 1, then append the entry.
enable_applet() {
    local current instance_id order entry
    if is_enabled; then
        say "unchanged: $uuid is already enabled"
        return
    fi
    if ! is_installed_in "${APPLET_DIRS[@]}"; then
        fail "$uuid is not installed (no metadata.json in ${APPLET_DIRS[*]})"
    fi
    instance_id=$(gsettings get "$SCHEMA" "$NEXT_ID_KEY")
    if [[ ! "$instance_id" =~ ^[0-9]+$ ]]; then
        fail "$NEXT_ID_KEY is not a number: $instance_id"
    fi
    order=$(next_order_in_zone)
    entry="$PANEL:$ZONE:$order:$uuid:$instance_id"
    current=$(gsettings get "$SCHEMA" "$KEY")
    gsettings set "$SCHEMA" "$NEXT_ID_KEY" "$((instance_id + 1))"
    if [[ "$current" == "$EMPTY_LIST" || "$current" == "[]" ]]; then
        gsettings set "$SCHEMA" "$KEY" "['$entry']"
    else
        gsettings set "$SCHEMA" "$KEY" "${current%]}, '$entry']"
    fi
    say "enabled: $uuid as $entry"
}

# Removes every instance of the applet. Cinnamon deletes their config files itself.
disable_applet() {
    local entry entry_uuid kept=()
    if ! is_enabled; then
        say "unchanged: $uuid is not enabled"
        return
    fi
    while IFS= read -r entry; do
        entry_uuid=$(cut -d: -f4 <<<"$entry")
        if [[ "$entry_uuid" != "$uuid" && "$entry_uuid" != "!$uuid" ]]; then
            kept+=("'$entry'")
        fi
    done < <(list_entries)
    if [[ ${#kept[@]} -eq 0 ]]; then
        gsettings set "$SCHEMA" "$KEY" "$EMPTY_LIST"
    else
        local joined
        joined=$(printf '%s, ' "${kept[@]}")
        gsettings set "$SCHEMA" "$KEY" "[${joined%, }]"
    fi
    say "disabled: $uuid"
}

reload_applet() {
    if ! is_enabled; then
        enable_applet
        return
    fi
    reload_xlet APPLET
    say "reloaded: $uuid"
}

if [[ $# -ne 2 ]]; then
    usage
fi
action="$1"
uuid="$2"
require_valid_uuid applet
require_parseable_list

case "$action" in
    enable) enable_applet ;;
    disable) disable_applet ;;
    reload) reload_applet ;;
    *) usage ;;
esac
