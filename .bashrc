#!/bin/bash


# =============================================================================
# Prompt
# =============================================================================
parse_git_branch() {
    BRANCH=$(git branch 2> /dev/null | sed -e '/^[^*]/d' -e 's/* \(.*\)/ (\1)/')

    if [[ -z ${BRANCH} ]]; then
        echo ""
    else
        echo "${BRANCH}"
    fi
}

# Prompt
#PS1="\w\$(parse_git_branch) ~> "; export PS1
# Custom prompt
export PS1="[\[\e[1;33m\]\u\[\e[m\]\[\e[1;32m\] \[\e[m\]\[\e[1;32m\]\h\[\e[m\] \[\e[1;36m\]\W\[\e[m\]] \\$ "



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

# Docker rootless
#export PATH=/home/bgi/bin:$PATH
#export DOCKER_HOST=unix:///run/user/1000/docker.sock


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
# TODO git completion
# TODO docker completion
