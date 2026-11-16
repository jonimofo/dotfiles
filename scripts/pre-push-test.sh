#!/usr/bin/env bash
# Regression tests for .githooks/pre-push.sh, in a throwaway repo with a fake
# scripts/check-all.sh that records each run. Nothing is pushed anywhere.
# Usage: scripts/pre-push-test.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hook="$script_dir/../.githooks/pre-push.sh"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/pre-push-test.XXXXXX")"
failures=0

readonly SHA="1111111111111111111111111111111111111111"
readonly ZERO="0000000000000000000000000000000000000000"

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

cleanup() {
    rm -rf "$tmp_root"
}
trap cleanup EXIT

say() {
    printf '%s\n' "$*"
}

# A repo whose check-all appends one line to checks.log per run and exits with
# FAKE_CHECK_EXIT (0 by default).
repo="$tmp_root/repo"
git init -q "$repo"
mkdir -p "$repo/scripts"
cat >"$repo/scripts/check-all.sh" <<'EOF'
#!/bin/sh
echo run >>"$(dirname "$0")/../checks.log"
exit "${FAKE_CHECK_EXIT:-0}"
EOF
chmod +x "$repo/scripts/check-all.sh"

# Runs the hook for one remote with the given ref lines on stdin.
# Sets $status (hook exit code) and $runs (number of check-all runs).
run_hook() {
    local remote="$1"
    shift
    rm -f "$repo/checks.log"
    set +e
    (cd "$repo" && printf '%s\n' "$@" | sh "$hook" "$remote" "git@example.invalid:repo.git" >/dev/null 2>&1)
    status=$?
    set -e
    runs=0
    if [[ -f "$repo/checks.log" ]]; then
        runs=$(wc -l <"$repo/checks.log")
    fi
}

check() {
    local label="$1" want_status="$2" want_runs="$3"
    if [[ "$status" == "$want_status" && "$runs" == "$want_runs" ]]; then
        say "PASS $label"
    else
        say "FAIL $label: exit $status (want $want_status), check-all runs $runs (want $want_runs)"
        failures=$((failures + 1))
    fi
}

branch_line() {
    printf 'refs/heads/%s %s refs/heads/%s %s' "$1" "${2:-$SHA}" "$1" "$ZERO"
}

for protected in main develop server; do
    run_hook origin "$(branch_line "$protected")"
    check "push to $protected on origin is refused, no check run" 1 0
done

SKIP_CHECKS=1 run_hook origin "$(branch_line develop)"
check "SKIP_CHECKS=1 does not lift the develop guard" 1 0

run_hook origin "$(branch_line develop "$ZERO")"
check "deleting develop on origin is refused" 1 0

run_hook gitlab "$(branch_line main)"
check "main to the gitlab mirror is allowed and runs no check" 0 0

run_hook origin "refs/tags/v1.1.0 $SHA refs/tags/v1.1.0 $ZERO"
check "a tag push runs no check" 0 0

run_hook gitlab "refs/tags/v1.1.0 $SHA refs/tags/v1.1.0 $ZERO"
check "a tag push to the gitlab mirror runs no check" 0 0

run_hook origin "$(branch_line fix/topic)"
check "a feature branch push runs the checks once" 0 1

FAKE_CHECK_EXIT=1 run_hook origin "$(branch_line fix/topic)"
check "a failing check cancels a feature branch push" 1 1

SKIP_CHECKS=1 run_hook origin "$(branch_line fix/topic)"
check "SKIP_CHECKS=1 skips the checks of a feature branch push" 0 0

run_hook origin "$(branch_line fix/topic "$ZERO")"
check "deleting a feature branch runs no check" 0 0

run_hook origin "refs/tags/v1.1.0 $SHA refs/tags/v1.1.0 $ZERO" "$(branch_line fix/topic)" "$(branch_line feat/other)"
check "a tag and 2 branches in one push run the checks once" 0 1

if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
