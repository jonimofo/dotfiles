# =============================================================================
# Ensure this file is only loaded in interactive shells
# =============================================================================
case $- in
    *i*) ;;
      *) return;;
esac

# =============================================================================
# Prompt
# =============================================================================
# Set the prompt based on the hostname
case "$(hostname -s)" in
    staging)
        # Bright Green prompt for staging
        PS1='\[\033[01;32m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$(parse_git_branch) \$ '
        ;;
    production)
        # Orange prompt for production
        PS1='\[\033[38;5;208m\]\u@\h\[\033[00m\]:\[\033[01;34m\]\w\[\033[00m\]\$(parse_git_branch) \$ '
        ;;
    *)
        # Your custom default prompt for any other host
        PS1="[\[\e[1;33m\]\u\[\e[m\] \[\e[1;32m\]\h\[\e[m\] \[\e[1;36m\]\W\[\e[m\]]\$(parse_git_branch) $ "
        ;;
esac


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
export HISTIGNORE="&:ls:ll:lt *:history:pwd:man *:fg:bg:jobs *"  # Ignore certain commands
export HISTSIZE=1000            # Max commands to keep in history
export HISTFILESIZE=2000        # Max commands in history file
shopt -s histappend             # Append history instead of overwriting
shopt -s checkwinsize           # Adjust terminal size dynamically


# =============================================================================
# ls and LESS Settings
# =============================================================================
# colored ls output
export LS_OPTIONS="--color=auto"
alias ls='ls $LS_OPTIONS'
alias ll='ls -lah --color=auto'
alias la='ls -A --color=auto'
alias l='ls -CF --color=auto'

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
# fasd
# =============================================================================
# Enable `fasd` for quick file access if installed
if command -v fasd >/dev/null 2>&1; then
    eval "$(fasd --init auto)"
fi


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
# Sourcing External Files
# =============================================================================
[ -f ~/.bash_aliases ] && source ~/.bash_aliases || echo "Warning: ~/.bash_aliases does not exist"
[ -f ~/.bash_functions ] && source ~/.bash_functions || echo "Warning: ~/.bash_functions does not exist"
[ -f ~/.git-completion.bash ] && source ~/.git-completion.bash || echo "Warning: ~/.git-completion.bash does not exist"
[ -f ~/.fzf.bash ] && source ~/.fzf.bash || echo "Warning: ~/.fzf.bash does not exist"
[ -f ~/.secrets/xfreerdp.sh ] && source ~/.secrets/xfreerdp.sh || echo "Warning: ~/.secrets/xfreerdp.sh does not exist"

