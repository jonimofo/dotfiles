#!/bin/bash

# A robust rsync script for synchronizing multiple directories.

# --- Configuration ---

# The destination directory for the backup.
# Tip: Use a full path for reliability.
DEST="/mnt/backups/my_server"

# An array of source directories to synchronize.
# Add as many folders as you need inside the parentheses.
SOURCES=(
    "/home/user/documents"
    "/home/user/pictures"
    "/etc"
)

# The path to the file containing exclusion patterns.
EXCLUDE_FILE="${PWD}/exclude-list.txt"

# --- Main Logic ---

echo "Starting rsync synchronization..."

# Ensure the destination directory exists.
mkdir -p "$DEST"

# Loop through each source directory and run rsync.
for SOURCE in "${SOURCES[@]}"; do
    echo "------------------------------------"
    echo "Syncing: $SOURCE to $DEST"
    
    # The rsync command
    # -a: archive mode (preserves permissions, ownership, etc.)
    # -v: verbose output
    # --delete: deletes files in DEST that are no longer in SOURCE
    # --exclude-from: reads patterns from our file
    # --progress: shows progress during transfer
    # To test without making changes, add the --dry-run flag.
    rsync -av --delete --exclude-from="$EXCLUDE_FILE" --progress "$SOURCE" "$DEST"  
done

echo "------------------------------------"
echo "Synchronization complete."
