#!/bin/bash

command -v tdrop >/dev/null 2>&1 || { echo 'tdrop is not installed'; exit 1; }
command -v nemo  >/dev/null 2>&1 || { echo 'nemo is not installed';  exit 1; }


# Find WM_CLASS names
# xprop WM_CLASS
# WM_CLASS(STRING) = "nemo", "Nemo"


# Toggles the Nautilus file manager window using tdrop.
# -n Nemo: Matches the window by its WM_CLASS name.
# -w 80%: Sets the width to 80% of the screen.
# -h 60%: Sets the height to 60% of the screen.
# -x 10%: Centers the window horizontally (10% margin on each side).
# -y 0: Positions the window at the top of the screen.
tdrop -n Nemo -w 100% -h 100% -x 10% -y 0 nemo
