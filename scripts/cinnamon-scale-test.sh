#!/bin/bash
# Logic tests of the scale-wheel-switch@bgi Scale overview: the search blocks clicks on the
# other screens, a middle click on a window does nothing, drop highlights are cleared after
# a fast drop, dock icon size at 2x display scaling, no bar left after a failing constructor,
# and the fit-to-width rule. Runs on fake actors and a fake overview, no running Cinnamon is
# touched.
# Usage: scripts/cinnamon-scale-test.sh (from any directory). Needs gjs.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
extension_dir="$script_dir/../cinnamon/extensions/scale-wheel-switch@bgi"

gjs "$script_dir/cinnamon-scale-test.js" "$extension_dir"
