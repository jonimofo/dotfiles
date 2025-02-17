
# =============================================================================
# Prompt
# =============================================================================
# Add git branch to prompt

# Uses git symbolic-ref --short HEAD, which is faster than git branch
# Falls back to git rev-parse --short HEAD for detached HEAD state
parse_git_branch() {
    local branch
    branch=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --short HEAD 2>/dev/null)
    [[ -n $branch ]] && echo " ($branch)"
}
