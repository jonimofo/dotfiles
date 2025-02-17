#!/bin/bash

# Exit on error, unset variables, and pipe failures
set -euo pipefail

# Get the directory of the script, then move one level up to get the dotfiles directory
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
DOTFILES_DIR="$(realpath "$SCRIPT_DIR/..")"

# Default to dry run mode
DRY_RUN=true

# Usage function
usage() {
    echo "Usage: $(basename "$0") [--dry-run | --no-dry-run] [--help]"
    echo "  --dry-run     Simulate actions without making changes (default)"
    echo "  --no-dry-run  Actually create symbolic links"
    echo "  --help        Show this help message"
    exit 0
}

# Parse command line arguments
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=true ;;
        --no-dry-run) DRY_RUN=false ;;
        --help) usage ;;
        *) echo "Invalid option: $arg"; usage ;;
    esac
done

# Declare an array of dotfiles to be symlinked (absolute paths)
declare -a FILES_TO_LINK=(
    # Bash session
    "$DOTFILES_DIR/.bashrc $HOME/.bashrc"
    "$DOTFILES_DIR/.bash_aliases $HOME/.bash_aliases"
    "$DOTFILES_DIR/.bash_functions $HOME/.bash_functions"
    "$DOTFILES_DIR/.bash_prompt $HOME/.bash_prompt"
    "$DOTFILES_DIR/.inputrc $HOME/.inputrc"
    "$DOTFILES_DIR/.xbindkeysrc $HOME/.xbindkeysrc"

    # Git
    "$DOTFILES_DIR/.git-completion.bash $HOME/.git-completion.bash"

    # Vim / Nvim
    # "$DOTFILES_DIR/.vimrc $HOME/.vimrc"
    # "$DOTFILES_DIR/init.vim $HOME/.config/nvim/init.vim"
    "$DOTFILES_DIR/monokai.vim $HOME/.vim/colors/monokai"

    # Tmux
    "$DOTFILES_DIR/.tmux.conf $HOME/.tmux.conf"

    # Terminator
    "$DOTFILES_DIR/terminator_config $HOME/.config/terminator/config"

    # Sublime Text
    "$DOTFILES_DIR/subl/Preferences.sublime-settings $HOME/.config/sublime-text-3/Packages/User/Preferences.sublime-settings"
    "$DOTFILES_DIR/subl/Default (Linux).sublime-keymap $HOME/.config/sublime-text-3/Packages/User/Default (Linux).sublime-keymap"

    # Espanso
    "$DOTFILES_DIR/espanso/base.yml $HOME/.config/espanso/match/base.yml"
)

# Function to create necessary directories
create_dirs() {
    local directories=(
        "$HOME/.config/nvim"
        "$HOME/.vim/colors"
        "$HOME/.config/terminator"
        "$HOME/.config/sublime-text-3/Packages/User"
        "$HOME/.config/espanso/match"
    )

    echo "Ensuring necessary directories exist..."
    for dir in "${directories[@]}"; do
        if [ ! -d "$dir" ]; then
            if [ "$DRY_RUN" = true ]; then
                echo "[Dry Run] Would create directory: $dir"
            else
                echo "Creating directory: $dir"
                mkdir -p "$dir"
            fi
        fi
    done
}

# Function to create symbolic links
create_symlinks() {
    for file in "${FILES_TO_LINK[@]}"; do
        src="${file%% *}"  # Get the first part (source file, absolute path)
        dest="${file##* }" # Get the last part (destination file, absolute path)

        if [ "$DRY_RUN" = true ]; then
            echo "[Dry Run] Would link: $src -> $dest"
        else
            # Check if the destination file already exists
            if [ -e "$dest" ] || [ -L "$dest" ]; then
                echo "File already exists: $dest (Removing old link)"
                rm -f "$dest"  # Remove existing file/symlink
            fi

            # Create symbolic link
            echo "Linking: $src -> $dest"
            ln -s "$src" "$dest"
        fi
    done
}

# Main function
main() {
    create_dirs

    if [ "$DRY_RUN" = true ]; then
        echo "Running in dry run mode. No changes will be made."
    else
        echo "Creating symbolic links..."
    fi

    create_symlinks

    if [ "$DRY_RUN" = true ]; then
        echo "Dry run completed. No files were modified."
    else
        echo "All dotfiles linked successfully."
    fi
}

# Run main function
main
