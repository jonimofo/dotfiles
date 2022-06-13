#!/bin/bash

DOTFILES_DIR="/home/bgi/Repos/dotfiles/"

ln --symbolic --force "$DOTFILES_DIR"/.bashrc ~/.bashrc

ln --symbolic --force "$DOTFILES_DIR"/.bash_aliases ~/.bash_aliases

ln --symbolic --force "$DOTFILES_DIR"/.inputrc ~/.inputrc

ln --symbolic --force "$DOTFILES_DIR"/.tmux.conf ~/.tmux.conf

ln --symbolic --force "$DOTFILES_DIR"/terminator_config ~/.config/terminator/config

# command -v foo >/dev/null 2>&1 || { echo "I require foo but it's not installed.  Aborting." >&2; exit 1; }

# TODO vim/nvim

# TODO setup rest of dotfiles but with checking first if concerned program is installed in user's system
