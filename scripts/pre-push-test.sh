#!/usr/bin/env bash
# Regression tests for .githooks/pre-push.sh, in throwaway repos with a fake
# scripts/check-all.sh that records each run. The only pushes go to a local bare repo.
# Usage: scripts/pre-push-test.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hook="$script_dir/../.githooks/pre-push.sh"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/pre-push-test.XXXXXX")"
failures=0

readonly SHA="1111111111111111111111111111111111111111"
readonly ZERO="0000000000000000000000000000000000000000"

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME="pre-push-test" GIT_AUTHOR_EMAIL="pre-push-test@example.invalid"
export GIT_COMMITTER_NAME="pre-push-test" GIT_COMMITTER_EMAIL="pre-push-test@example.invalid"

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

# The checks must not see the repository variables git exports to hooks.
cat >"$repo/scripts/check-all.sh" <<'EOF'
#!/bin/sh
env | grep -E '^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|COMMON_DIR)=' >>"$(dirname "$0")/../checks.log"
echo run >>"$(dirname "$0")/../checks.log"
EOF
GIT_DIR="$repo/.git" GIT_INDEX_FILE="$repo/.git/index" GIT_WORK_TREE="$repo" run_hook origin "$(branch_line fix/topic)"
check "check-all runs without the GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE of the push" 0 1

# End to end, as on 2026-11-16: a real push from a linked worktree, with a check that
# creates throwaway repos like release-test.sh. The pushing repo must stay a work tree.
e2e="$tmp_root/e2e"
git init -q --bare -b main "$e2e/remote.git"
git init -q -b main "$e2e/main"
mkdir -p "$e2e/main/scripts"
cat >"$e2e/main/scripts/check-all.sh" <<'EOF'
#!/bin/sh
scratch="$(mktemp -d)"
git init -q "$scratch/work"
git init -q --bare "$scratch/bare.git"
git -C "$scratch/work" config commit.gpgsign false
rm -rf "$scratch"
EOF
chmod +x "$e2e/main/scripts/check-all.sh"
git -C "$e2e/main" add scripts/check-all.sh
git -C "$e2e/main" commit -q -m "chore: initial"
git -C "$e2e/main" remote add origin "$e2e/remote.git"
cp "$hook" "$e2e/main/.git/hooks/pre-push"
chmod +x "$e2e/main/.git/hooks/pre-push"
git -C "$e2e/main" worktree add -q -b fix/topic "$e2e/worktree"
git -C "$e2e/worktree" commit -q --allow-empty -m "fix: topic"

e2e_check() {
    local label="$1"
    local bare gpgsign
    bare="$(git -C "$e2e/main" config --get core.bare || true)"
    gpgsign="$(git -C "$e2e/main" config --get commit.gpgsign || true)"
    if [[ "$push_status" == 0 && "$bare" == false && -z "$gpgsign" ]]; then
        say "PASS $label"
    else
        say "FAIL $label: push exit $push_status, core.bare=$bare, commit.gpgsign=${gpgsign:-unset}"
        failures=$((failures + 1))
    fi
}

set +e
git -C "$e2e/worktree" push -q origin fix/topic >/dev/null 2>&1
push_status=$?
set -e
e2e_check "a push from a linked worktree leaves the repository config untouched"

git -C "$e2e/main" switch -q -c fix/second
git -C "$e2e/main" commit -q --allow-empty -m "fix: second"
set +e
git -C "$e2e/main" push -q origin fix/second >/dev/null 2>&1
push_status=$?
set -e
e2e_check "a push from the main work tree leaves the repository config untouched"

if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
