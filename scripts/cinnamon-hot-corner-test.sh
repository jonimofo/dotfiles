#!/bin/bash
# Logic tests of the scale-wheel-switch@bgi hot corner module: corners stay active over
# fullscreen windows, the flag survives Cinnamon rebuilding the corners, and disable gives
# back the stock behaviour. Runs on fake chrome and manager objects, no running Cinnamon
# is touched.
# Usage: scripts/cinnamon-hot-corner-test.sh (from any directory). Needs gjs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension_dir="$script_dir/../cinnamon/extensions/scale-wheel-switch@bgi"

gjs "$script_dir/cinnamon-hot-corner-test.js" "$extension_dir"
