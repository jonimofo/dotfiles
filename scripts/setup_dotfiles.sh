#!/bin/bash

ln --symbolic --force "$PWD"/.bashrc ~/.bashrc

ln --symbolic --force "$PWD"/.bash_aliases ~/.bash_aliases

ln --symbolic --force "$PWD"/.inputrc ~/.inputrc

ln --symbolic --force "$PWD"/.tmux.conf ~/.config/terminator/.tmux.conf

# TODO vim/nvim