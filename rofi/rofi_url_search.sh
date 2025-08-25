#!/usr/bin/env bash

# Rofi Custom URL Search Script (One-Line Version)
#
# USAGE:
#   <shortcut> <query>
#   e.g., "g linux" will search Google for "linux"
#   e.g., "d test" will search a dictionary for "test"
#
# If the first word is not a valid shortcut, the entire input
# is searched using the default engine.
#   e.g., "my linux query" will search Google for "my linux query"


USER=$USER

# -- CONFIGURATION --
# Define the shortcut for the default search engine.
DEFAULT_ENGINE="d"

# Add or remove search engines here.
# The format is: urls["shortcut"]="Search URL"
# Use short, memorable shortcuts for speed.
declare -A urls
urls[g]="https://www.google.com/search?q="
urls[d]="https://dictionary.cambridge.org/dictionary/english/"
urls[y]="https://www.youtube.com/results?search_query="
urls[m]="https://www.google.com/maps/search/?api=1&query="
urls[i]="https://www.google.com/search?tbm=isch&q="

# -- SCRIPT LOGIC --
# 1. Ask the user for their search query using a single Rofi prompt.
#    The prompt text gives an example of how to use the script.
input=$(rofi -no-config -dmenu -theme /home/${USER}/Repos/dotfiles/rofi/search-bar.rasi -i -p "URL Search  ")

# 2. Check if the user made a choice. If they pressed Esc, exit.
if [[ -z "$input" ]]; then
    exit 0
fi

# 3. Parse the input.
#    'potential_shortcut' is the first word of the input.
potential_shortcut=$(echo "$input" | awk '{print $1}')

# 4. Determine which search engine to use.
#    Check if the first word of the input exists as a key in our 'urls' array.
#    The `-v` operator tests if an array key exists, which is safer than checking if empty.
if [[ -v "urls[$potential_shortcut]" ]]; then
    # The shortcut is valid. Use it and set the query to the rest of the input.
    base_url=${urls[$potential_shortcut]}
    query=$(echo "$input" | cut -d' ' -f2-)
else
    # The shortcut is not valid (or wasn't provided).
    # Use the default engine and treat the entire input as the query.
    base_url=${urls[$DEFAULT_ENGINE]}
    query="$input"
fi

# 5. Construct the final URL.
#    Note: We are not manually URL-encoding the query. Modern browsers and `xdg-open`
#    are very good at handling this automatically. For queries with complex special
#    characters, a dedicated URL encoder tool could be piped in if needed.
final_url="${base_url}${query}"

# 6. Open the final URL in the default web browser.
#    `xdg-open` is the standard way to open files and URLs on most Linux desktops.
xdg-open "$final_url"

exit 0
