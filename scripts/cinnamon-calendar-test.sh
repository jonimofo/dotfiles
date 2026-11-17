#!/bin/bash
# Logic tests of the calendar@bgi applet: panel text, popup header texts, second time zone
# (unknown id, DST, day change), day marker, settings defaults, stylesheet conventions.
# The tick clock runs on the memory GSettings backend. English dates and wording also under
# a French locale. Fabricated dates and events only; no calendar server, real setting or desktop is
# touched.
# Usage: scripts/cinnamon-calendar-test.sh (from any directory). Needs gjs and the
# CinnamonDesktop typelib.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
applet_dir="$script_dir/../cinnamon/applets/calendar@bgi"

readonly FRENCH_LOCALE="fr_FR.utf8"

GSETTINGS_BACKEND=memory gjs "$script_dir/cinnamon-calendar-test.js" "$applet_dir"

# Dates are worded in English whatever the locale: run again under a French LC_TIME when this
# machine has that locale.
locales="$(locale -a)"
if grep -qx "$FRENCH_LOCALE" <<<"$locales"; then
    printf 'Again with LC_ALL=%s\n' "$FRENCH_LOCALE"
    LC_ALL="$FRENCH_LOCALE" GSETTINGS_BACKEND=memory gjs "$script_dir/cinnamon-calendar-test.js" "$applet_dir"
else
    printf 'Skipped the %s run: locale not installed\n' "$FRENCH_LOCALE"
fi
