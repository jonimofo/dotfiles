#!/bin/bash
# Runs every check of the repo: each scripts/*-test.sh, the Cinnamon extension and applet
# check, and shellcheck on every tracked shell script. Called by the pre-push hook.
# Safe on a live desktop: the tests use stubs, fakes, throwaway repos and the memory
# GSettings backend; nothing changes a real setting, device or the running Cinnamon.
# Usage: scripts/check-all.sh (from any directory). Needs bash, git, node, jq, gjs, shellcheck.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Sourced configuration files of tmux-powerline: their variables are read by that tool, and
# they carry no shebang by its convention.
readonly SHELLCHECK_EXCLUDED=(tmux/powerline-config.sh tmux/powerline-theme.sh)
failed=()

require_commands() {
    local command_name
    for command_name in "$@"; do
        if ! command -v "$command_name" >/dev/null; then
            printf 'Missing command: %s\n' "$command_name" >&2
            exit 2
        fi
    done
}

# run_check <name> <command...>: one line per check; the output only when it fails.
run_check() {
    local name="$1" output
    shift
    if output="$("$@" 2>&1)"; then
        printf 'ok    %s\n' "$name"
    else
        printf 'FAIL  %s\n%s\n' "$name" "$output"
        failed+=("$name")
    fi
}

is_excluded() {
    local file="$1" excluded
    for excluded in "${SHELLCHECK_EXCLUDED[@]}"; do
        if [[ "$file" == "$excluded" ]]; then
            return 0
        fi
    done
    return 1
}

shell_scripts() {
    local file
    while IFS= read -r -d '' file; do
        if ! is_excluded "$file"; then
            printf '%s\n' "$file"
        fi
    done < <(git -C "$repo_root" ls-files -z '*.sh')
}

main() {
    local test_script started scripts=()
    require_commands git node jq gjs shellcheck
    started=$SECONDS
    cd "$repo_root"

    for test_script in scripts/*-test.sh; do
        run_check "$(basename "$test_script")" "$test_script"
    done
    run_check cinnamon-extension-check.sh scripts/cinnamon-extension-check.sh

    mapfile -t scripts < <(shell_scripts)
    run_check "shellcheck (${#scripts[@]} scripts)" shellcheck -x --severity=warning "${scripts[@]}"

    printf '%d check(s) failed, %d s\n' "${#failed[@]}" "$((SECONDS - started))"
    if [[ ${#failed[@]} -gt 0 ]]; then
        exit 1
    fi
}

main "$@"
