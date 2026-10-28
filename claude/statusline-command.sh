#!/bin/bash
# Claude Code status line: <dir> │ <model> │ effort: <level> │ ⎇ <git branch> │ week <bar> <pct> (resets …)
# Reads the status-line JSON payload from stdin. No colours.

input=$(cat)
cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
effort=$(echo "$input" | jq -r '.effort.level // empty')

# Directory: home-relative with ~ when under $HOME.
dir="$cwd"
case "$cwd" in
  "$HOME") dir="~" ;;
  "$HOME"/*) dir="~${cwd#$HOME}" ;;
esac

out=""
[ -n "$dir" ] && out="$dir"
[ -n "$model" ] && { [ -n "$out" ] && out="$out │ $model" || out="$model"; }
[ -n "$effort" ] && out="$out │ effort: $effort"

if [ -n "$cwd" ] && git --no-optional-locks -C "$cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git --no-optional-locks -C "$cwd" branch --show-current 2>/dev/null)
  [ -z "$branch" ] && branch="(detached)"
  out="$out │ ⎇ $branch"
fi

# Weekly quota (all models), absent for API-key sessions.
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
week_reset=$(echo "$input" | jq -r '.rate_limits.seven_day.resets_at // empty')
if [ -n "$week_pct" ]; then
  pct=${week_pct%.*}
  filled=$(( (pct + 5) / 10 )); [ "$filled" -gt 10 ] && filled=10
  bar=""
  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ "$i" -le "$filled" ] && bar="$bar▓" || bar="$bar░"
  done
  out="$out │ week $bar $pct%"
  [ -n "$week_reset" ] && out="$out (resets $(LC_TIME=C date -d "@$week_reset" '+%a %H:%M'))"
fi

printf '%s' "$out"
