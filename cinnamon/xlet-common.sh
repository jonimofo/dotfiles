# shellcheck shell=bash
# Helpers shared by extension.sh and applet.sh. Sourced, never run.
# The caller sets `uuid` before calling the uuid helpers; EMPTY_LIST is for the callers.
# shellcheck disable=SC2034,SC2154

# The uuid is pasted into a GVariant list: nothing but a plain name@domain gets through.
readonly UUID_PATTERN='^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$'
readonly EMPTY_LIST="@as []"

say() {
    printf '%s\n' "$*"
}

fail() {
    say "error: $*" >&2
    exit 1
}

# $1: the xlet kind as Cinnamon names it in messages ("extension", "applet").
require_valid_uuid() {
    if [[ ! "$uuid" =~ $UUID_PATTERN ]]; then
        fail "not an $1 uuid: $uuid"
    fi
}

# True when one of the folders given has $uuid/metadata.json.
is_installed_in() {
    local dir
    for dir in "$@"; do
        if [[ -f "$dir/$uuid/metadata.json" ]]; then
            return 0
        fi
    done
    return 1
}

# Cinnamon unloads and loads the xlet itself, in one call: no wait to guess.
# $1: the xlet type as org.Cinnamon.ReloadXlet takes it ("EXTENSION", "APPLET").
reload_xlet() {
    gdbus call --session --dest org.Cinnamon --object-path /org/Cinnamon \
        --method org.Cinnamon.ReloadXlet "$uuid" "$1" > /dev/null
}
