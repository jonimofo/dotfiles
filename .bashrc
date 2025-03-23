# Ensure this file is only loaded in interactive shells
[[ $- != *i* ]] && return

# =============================================================================
# Prompt
# =============================================================================
[ -f ~/.bash_prompt ] && source ~/.bash_prompt || echo "Warning: ~/.bash_prompt does not exist"

# =============================================================================
# Environment Variables
# =============================================================================
export PATH="$HOME/.local/bin:/opt:$PATH"
export EDITOR="nvim"

# Ensure aliases are expanded in scripts
shopt -s expand_aliases

# =============================================================================
# History Settings
# =============================================================================
# Ignore duplicate commands in history
export HISTCONTROL=ignoredups

# Ignore specific commands in history
# - `&` prevents duplicate consecutive commands
# - Commands starting with `_` or whitespace are ignored
export HISTIGNORE="&:ls:ll:lt *:history:pwd:man *:fg:bg:jobs *"

# Ignore commands that start with a space (or `_` for custom scripts)
export HISTCONTROL=ignoreboth

# Ensure history is appended instead of overwritten when a session exits
shopt -s histappend

# Adjust terminal window size after each command to prevent display issues
shopt -s checkwinsize


# =============================================================================
# Sourcing External Files
# =============================================================================
[ -f ~/.bash_aliases ] && source ~/.bash_aliases || echo "Warning: ~/.bash_aliases does not exist"
[ -f $HOME/.bash_functions ] && source ~/.bash_functions || echo "Warning: $HOME/.bash_functions does not exist"
[ -f ~/.git-completion.bash ] && source ~/.git-completion.bash || echo "Warning: ~/.git-completion.bash does not exist"
[ -f ~/.fzf.bash ] && source ~/.fzf.bash || echo "Warning: ~/.fzf.bash does not exist"

# =============================================================================
# Other Customizations
# =============================================================================
if command -v fasd >/dev/null 2>&1; then
    eval "$(fasd --init auto)"
fi

# Prevent Middle Mouse Button Paste (Common on Dell XPS & ThinkPads)
xbindkeys -p

# less / man
export LESS_TERMCAP_mb=$'\E[1;31m'     # begin bold
export LESS_TERMCAP_md=$'\E[1;36m'     # begin blink
export LESS_TERMCAP_me=$'\E[0m'        # reset bold/blink
export LESS_TERMCAP_so=$'\E[01;44;33m' # begin reverse video
export LESS_TERMCAP_se=$'\E[0m'        # reset reverse video
export LESS_TERMCAP_us=$'\E[1;32m'     # begin underline
export LESS_TERMCAP_ue=$'\E[0m'        # reset underline
export GROFF_NO_SGR=1                  # for konsole and gnome-terminal
