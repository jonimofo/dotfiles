#!/bin/bash

# Exit if any command fails
set -e

# Define the dotfiles directory
DOTFILES_DIR="/home/bgi/Repos/dotfiles/"

# Dry run flag (default is false)
DRY_RUN=true

# Parse command line arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift # Remove --dry-run from processing
      ;;
  esac
done

# Array of file mappings (source, destination)
declare -a FILES_TO_LINK=(
    # Bash
    ".bashrc ~/.bashrc"
    ".bash_aliases ~/.bash_aliases"
    ".inputrc ~/.inputrc"
    ".xbindkeysrc ~/.xbindkeysrc"
    
    # Git
    ".git-completion.bash ~/.git-completion.bash"
    #TODO git config
    
    # Vim / Nvim
    ".vimrc ~/.vimrc"
    "init.vim ~/.config/nvim/init.vim"
    "monokai.vim ~/.vim/colors/monokai"
    
    # Tmux
    ".tmux.conf ~/.tmux.conf"
    
    # Terminator
    "terminator_config.ini ~/.config/terminator/config"
    
    # Sublime Text
    "subl/Preferences.sublime-settings ~/.config/sublime-text-3/Packages/User/Preferences.sublime-settings"
    "subl/Default\\ \\(Linux\\).sublime-keymap ~/.config/sublime-text-3/Packages/User/Default\\ \\(Linux\\).sublime-keymap"
    
    # Espanso
    "espanso/base.yml ~/.config/espanso/match/base.yml"
)

# Create directories if they don't exist
create_dirs() {
    echo "Creating necessary directories..."
    mkdir -p ~/.config/nvim ~/.vim/colors ~/.config/terminator ~/.config/sublime-text-3/Packages/User ~/.config/espanso/match
}

# Function to create symbolic links or simulate the operation if in dry run mode
create_symlinks() {
    for file in "${FILES_TO_LINK[@]}"; do
        # Split the source and destination
        src="${file%% *}"
        dest="${file##* }"

        if [ "$DRY_RUN" = true ]; then
            # Dry run: just print the action without executing it
            echo "[Dry Run] Linking $DOTFILES_DIR/$src -> $dest"
        else
            # Actual run: create the symlink
            echo "Linking $DOTFILES_DIR/$src -> $dest"
            ln --symbolic --force "$DOTFILES_DIR/$src" "$dest"
        fi
    done
}

# Main
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
    echo "All dotfiles linked successfully!"
fi


