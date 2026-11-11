#!/bin/bash

command -v tdrop >/dev/null 2>&1 || { echo 'tdrop is not installed'; exit 1; }
command -v nemo  >/dev/null 2>&1 || { echo 'nemo is not installed';  exit 1; }


# Find WM_CLASS names
# xprop WM_CLASS
# WM_CLASS(STRING) = "nemo", "Nemo"


# Toggles a full-screen Nemo window with tdrop (bound to Super+E in Cinnamon, see cinnamon/README.md).
# -n Nemo: matches the window by its WM_CLASS name.
# The window manager keeps it below the panel, so 100% height stops at the panel's edge.
tdrop -n Nemo -w 100% -h 100% -x 0 -y 0 nemo
