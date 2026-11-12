#!/bin/bash
# Logic tests of the quick-settings@bgi applet: Dark style, Wi-Fi, volume mapping, ddcutil
# and nordvpn parsing (captured output in fixtures/), send-on-release, brightness backends,
# in-place lists, Bluetooth, VPN and NordVPN logic.
# No real setting is changed.
# Usage: scripts/cinnamon-quick-settings-test.sh (from any directory). Needs gjs and libnm.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
applet_dir="$script_dir/../cinnamon/applets/quick-settings@bgi"

GSETTINGS_BACKEND=memory gjs "$script_dir/cinnamon-quick-settings-test.js" "$applet_dir" \
    "$script_dir/fixtures"
