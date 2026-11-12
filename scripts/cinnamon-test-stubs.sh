# shellcheck shell=bash
# Stub gsettings and gdbus for the cinnamon/*.sh tests, so no test reads or writes the real
# org.cinnamon keys or calls the running Cinnamon. Sourced, never run.
# write_cinnamon_stubs <root>: creates <root>/bin/{gsettings,gdbus}; put <root>/bin first on
# PATH. gsettings keeps one file per key in <root>/keys; gdbus appends its arguments to
# <root>/gdbus.log and prints nothing.
# The stub bodies are single-quoted on purpose: they expand when a stub runs.
# shellcheck disable=SC2016

write_cinnamon_stubs() {
    local root="$1"
    mkdir -p "$root/bin" "$root/keys"
    printf '#!/bin/bash\nset -euo pipefail\nSTUB_ROOT=%q\n%s\n' "$root" '
file="$STUB_ROOT/keys/$3"
case "$1" in
    get) cat "$file" ;;
    set) printf "%s\n" "$4" >"$file" ;;
    *) exit 1 ;;
esac' >"$root/bin/gsettings"
    printf '#!/bin/bash\nset -euo pipefail\nSTUB_ROOT=%q\n%s\n' "$root" '
printf "%s\n" "$*" >>"$STUB_ROOT/gdbus.log"' >"$root/bin/gdbus"
    chmod +x "$root/bin/gsettings" "$root/bin/gdbus"
}
