#!/bin/bash

DOTFILES_DIR="/home/bgi/Repos/dotfiles/"

# Bash
ln --symbolic --force "$DOTFILES_DIR"/.bashrc ~/.bashrc
ln --symbolic --force "$DOTFILES_DIR"/.bash_aliases ~/.bash_aliases
ln --symbolic --force "$DOTFILES_DIR"/.inputrc ~/.inputrc

# Tmux
ln --symbolic --force "$DOTFILES_DIR"/.tmux.conf ~/.tmux.conf

# Terminator
ln --symbolic --force "$DOTFILES_DIR"/terminator_config ~/.config/terminator/config

# Sublime Text
ln --symbolic --force "$DOTFILES_DIR"/subl/Preferences.sublime-settings	 ~/.config/sublime-text-3/Packages/User
ln --symbolic --force "$DOTFILES_DIR"/subl/Default\ \(Linux\).sublime-keymap	 ~/.config/sublime-text-3/Packages/User



# command -v foo >/dev/null 2>&1 || { echo "I require foo but it's not installed.  Aborting." >&2; exit 1; }
# TODO vim/nvim
# TODO setup rest of dotfiles but with checking first if concerned program is installed in user's system
