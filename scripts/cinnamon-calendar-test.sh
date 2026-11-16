#!/bin/bash
# Logic tests of the calendar@bgi applet: panel text, popup header texts, second time zone
# (unknown id, DST, day change), day marker, settings defaults, stylesheet conventions.
# Fabricated dates and events only; no calendar server, setting or desktop is touched.
# Usage: scripts/cinnamon-calendar-test.sh (from any directory). Needs gjs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
applet_dir="$script_dir/../cinnamon/applets/calendar@bgi"

gjs "$script_dir/cinnamon-calendar-test.js" "$applet_dir"
