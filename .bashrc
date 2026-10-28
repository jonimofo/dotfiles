#!/bin/bash

# =============================================================================
# Ensure this file is only loaded in interactive shells
# =============================================================================
case $- in
    *i*) ;;
      *) return;;
esac

# =============================================================================
# Host identity
# =============================================================================
# Hostname of the laptop. Blocks that only make sense there (secrets, local
# services, aliases in .bash_aliases) are gated on it; servers skip them silently.
LAPTOP_HOSTNAME="xps"

# =============================================================================
# Prompt
# =============================================================================
# Hostname color: green = staging, orange = production servers
prompt_color=''
case "$(hostname -s)" in
    baf-staging)
        prompt_color='\[\033[01;32m\]'
        ;;
    baf-production|pi|astrohub-server|scranton)
        prompt_color='\[\033[38;5;208m\]'
        ;;
esac

if [ -n "$prompt_color" ]; then
    # Servers: user@host:path (branch) $
    PS1="${prompt_color}\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$(parse_git_branch) \$ "
else
    # Any other host (laptop): [user host dir] (branch) $
    PS1="[\[\e[1;33m\]\u\[\e[m\] \[\e[1;32m\]\h\[\e[m\] \[\e[1;36m\]\W\[\e[m\]]\$(parse_git_branch) $ "
fi
unset prompt_color


# -----------------------------------------------------------------------------
# (Optional) Set terminal title for xterm, rxvt, etc.
# -----------------------------------------------------------------------------
case "$TERM" in
    xterm*|rxvt*)
        PS1="\[\e]0;${debian_chroot:+($debian_chroot)}\u@\h: \w\a\]$PS1"
        ;;
esac

unset color_prompt force_color_prompt


# =============================================================================
# History Settings
# =============================================================================
export HISTCONTROL=ignoredups   # Ignore duplicate consecutive commands
export HISTSIZE=1000            # Max commands to keep in history
export HISTFILESIZE=2000        # Max commands in history file
shopt -s histappend             # Append history instead of overwriting
shopt -s checkwinsize           # Adjust terminal size dynamically


# =============================================================================
# ls and LESS Settings
# =============================================================================
# colored ls output
export LS_OPTIONS="--color=auto"
# display raw ANSI color escape sequences
export LESS='-R'
# Improve `less` behavior for colored output in `man`
export LESS_TERMCAP_mb=$'\E[1;31m'     # begin bold
export LESS_TERMCAP_md=$'\E[1;36m'     # begin blink
export LESS_TERMCAP_me=$'\E[0m'        # reset bold/blink
export LESS_TERMCAP_so=$'\E[01;44;33m' # begin reverse video
export LESS_TERMCAP_se=$'\E[0m'        # reset reverse video
export LESS_TERMCAP_us=$'\E[1;32m'     # begin underline
export LESS_TERMCAP_ue=$'\E[0m'        # reset underline
export GROFF_NO_SGR=1                  # Fix formatting in Konsole/Gnome-Terminal


# =============================================================================
# Enable Bash Completion
# =============================================================================
if ! shopt -oq posix; then
    if [ -f /usr/share/bash-completion/bash_completion ]; then
        source /usr/share/bash-completion/bash_completion
    elif [ -f /etc/bash_completion ]; then
        source /etc/bash_completion
    fi
fi



# =============================================================================
# zoxide
# =============================================================================
# Enable `zoxide` for quick directory jumps (z, zi) if installed
if command -v zoxide >/dev/null 2>&1; then
    eval "$(zoxide init bash)"
fi


# =============================================================================
# Bun
# =============================================================================
if [ -d "$HOME/.bun" ]; then
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi


# =============================================================================
# Sourcing External Files
# =============================================================================
if [ -f ~/.bash_aliases ]; then
    source ~/.bash_aliases
else
    echo "Warning: ~/.bash_aliases does not exist"
fi

if [ -f ~/.bash_functions ]; then
    source ~/.bash_functions
else
    echo "Warning: ~/.bash_functions does not exist"
fi

if [ -f ~/.git-completion.bash ]; then
    source ~/.git-completion.bash
else
    echo "Warning: ~/.git-completion.bash does not exist"
fi

if [ -f ~/.fzf.bash ]; then
    source ~/.fzf.bash
else
    echo "Warning: ~/.fzf.bash does not exist"
fi

# SOPS age key: laptop only, servers never hold it.
if [ "$HOSTNAME" = "$LAPTOP_HOSTNAME" ]; then
    if [ -f ~/.secrets/sops/age/keys.txt ]; then
        export SOPS_AGE_KEY_FILE=~/.secrets/sops/age/keys.txt
    else
        echo "Warning: ~/.secrets/sops/age/keys.txt does not exist, impossible to source SOPS_AGE_KEY_FILE"
    fi
fi
