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
[ -f ~/.bash_functions ] && source ~/.bash_functions || echo "Warning: ~/.bash_functions does not exist"
[ -f ~/.git-completion.bash ] && source ~/.git-completion.bash || echo "Warning: ~/.git-completion.bash does not exist"
[ -f ~/.fzf.bash ] && source ~/.fzf.bash || echo "Warning: ~/.fzf.bash does not exist"

# =============================================================================
# Other Customizations
# =============================================================================
eval "$(fasd --init auto)"

# Prevent Middle Mouse Button Paste (Common on Dell XPS & ThinkPads)
xbindkeys -p
