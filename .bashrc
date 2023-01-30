#!/bin/bash


# =============================================================================
# Prompt
# =============================================================================
# Add git branch to prompt
parse_git_branch() {
    BRANCH=$(git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/')

    if [[ -z ${BRANCH} ]]; then
        echo ""
    else
        echo "${BRANCH}"
    fi
}

# Custom prompt
export PS1="[\[\e[1;33m\]\u\[\e[m\]\[\e[1;32m\] \[\e[m\]\[\e[1;32m\]\h\[\e[m\] \[\e[1;36m\]\W\[\e[m\]]\$(parse_git_branch) $ "

# Path
PATH=$PATH:~/.local/bin


# =============================================================================
# Apps
# =============================================================================
# Global editor
export EDITOR="nvim"

# less / man
export LESS_TERMCAP_mb=$'\E[1;31m'     # begin bold
export LESS_TERMCAP_md=$'\E[1;36m'     # begin blink
export LESS_TERMCAP_me=$'\E[0m'        # reset bold/blink
export LESS_TERMCAP_so=$'\E[01;44;33m' # begin reverse video
export LESS_TERMCAP_se=$'\E[0m'        # reset reverse video
export LESS_TERMCAP_us=$'\E[1;32m'     # begin underline
export LESS_TERMCAP_ue=$'\E[0m'        # reset underline
export GROFF_NO_SGR=1                  # for konsole and gnome-terminal

# tldr
export TLDR_HEADER='magenta bold underline'
export TLDR_QUOTE='italic'
export TLDR_DESCRIPTION='green'
export TLDR_CODE='red'
export TLDR_PARAM='blue'

# fasd
eval "$(fasd --init auto)"

# Prevent paste from middle mouse Click (on Dell xps)
# xinput set-button-map 10 1 0 3
# Prevent paste from middle click
xbindkeys -p

# Docker rootless
# export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock

# TODO
export FZF_DEFAULT_COMMAND="find \! \( -path '*/.git' -prune \) -printf '%P\n'"


# =============================================================================
# History
# =============================================================================
unset export HISTIGNORE
export HISTIGNORE=$HISTIGNORE:'l:ls:ll:lt *:history:pwd:man *:fg:bg:jobs *'
# Ignore duplicate commands
export HISTCONTROL=ignoredups



# =============================================================================
# Sourcing
# =============================================================================
[ -f ~/.bash_aliases ] && source ~/.bash_aliases
[ -f ~/.fzf.bash ] && source ~/.fzf.bash
[ -f ~/.git-completion.bash ] && . ~/.git-completion.bash

# TODO docker completion
