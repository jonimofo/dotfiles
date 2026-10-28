#!/usr/bin/env bash
# Regression tests for release.sh --next-only, on throwaway repos (bare origin + clone).
# Usage: scripts/release-test.sh
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
release="$script_dir/release.sh"
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/release-test.XXXXXX")"
failures=0
case_id=0

export GIT_AUTHOR_NAME="release-test" GIT_AUTHOR_EMAIL="release-test@example.invalid"
export GIT_COMMITTER_NAME="release-test" GIT_COMMITTER_EMAIL="release-test@example.invalid"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

cleanup() {
    rm -rf "$tmp_root"
}
trap cleanup EXIT

say() {
    printf '%s\n' "$*"
}

# Creates a bare origin and a clone with one commit on main, optionally tagged with the
# given tags, and a develop branch. Leaves the clone path in $work and cds into it.
new_repo() {
    local tag
    case_id=$((case_id + 1))
    local dir="$tmp_root/case$case_id"
    git init -q --bare -b main "$dir/origin.git"
    git clone -q "$dir/origin.git" "$dir/work" 2>/dev/null
    work="$dir/work"
    cd "$work"
    git config commit.gpgsign false
    git config tag.gpgsign false
    git checkout -q -b main
    git commit -q --allow-empty -m "chore: initial"
    for tag in "$@"; do
        git tag "$tag"
    done
    git push -q origin main
    git checkout -q -b develop
}

commit() {
    git commit -q --allow-empty "$@"
}

push_develop() {
    git push -q origin develop
}

# Adds $1 filler commits on develop, then one with subject $2, in a single fast-import.
bulk_commits() {
    local total="$1"
    local last_subject="$2"
    local parent i
    parent="$(git rev-parse HEAD)"
    {
        for ((i = 1; i <= total; i++)); do
            say "commit refs/heads/develop"
            say "committer release-test <release-test@example.invalid> $((1700000000 + i)) +0000"
            say "data <<END_OF_MESSAGE"
            say "chore: filler commit $i"
            say "END_OF_MESSAGE"
            if [[ $i -eq 1 ]]; then
                say "from $parent"
            fi
            say ""
        done
        say "commit refs/heads/develop"
        say "committer release-test <release-test@example.invalid> $((1700000000 + total + 1)) +0000"
        say "data <<END_OF_MESSAGE"
        say "$last_subject"
        say "END_OF_MESSAGE"
        say ""
    } > "$tmp_root/fast-import.txt"
    git fast-import --quiet < "$tmp_root/fast-import.txt"
    git reset -q --hard develop
}

# check <name> <expected rc> <expected stdout> <expected stderr substring or ""> [release args]
check() {
    local name="$1"
    local want_rc="$2"
    local want_out="$3"
    local want_err="$4"
    shift 4
    local out err rc=0
    out="$("$release" --next-only --no-fetch "$@" 2>"$tmp_root/stderr")" || rc=$?
    err="$(cat "$tmp_root/stderr")"
    if [[ $rc -ne $want_rc || "$out" != "$want_out" || "$err" != *"$want_err"* ]]; then
        say "FAIL $name: rc=$rc out='$out' err='$err' (want rc=$want_rc out='$want_out' err~'$want_err')"
        failures=$((failures + 1))
        return 0
    fi
    say "PASS $name"
}

new_repo
commit -m "fix: a"
push_develop
check "no tag gives v1.0.0" 0 "v1.0.0" ""

new_repo v1.2.3
commit -m "fix: a"
push_develop
check "v1.2.3 + fix gives v1.2.4" 0 "v1.2.4" ""
check "--bump minor gives v1.3.0" 0 "v1.3.0" "" --bump minor

new_repo v1.2.3
commit -m "feat(x)!: drop the old flag"
push_develop
check "feat(x)!: gives v2.0.0 + notice" 0 "v2.0.0" "BREAKING change detected: MAJOR bump."
check "--bump patch with BREAKING exits 1" 1 "" "--bump patch refused" --bump patch

new_repo v1.2.3
commit -m "feat: a" -m "BREAKING CHANGE: the old flag is gone"
push_develop
check "body BREAKING CHANGE: gives v2.0.0" 0 "v2.0.0" "BREAKING"

new_repo v1.2.3
commit -m "feat: a" -m "BREAKING-CHANGE: the old flag is gone"
push_develop
check "body BREAKING-CHANGE: gives v2.0.0" 0 "v2.0.0" "BREAKING"

new_repo v1.2.3
commit -m "fix: a" -m "This is not a BREAKING CHANGE: just prose in text."
push_develop
check "mid-line prose stays v1.2.4" 0 "v1.2.4" ""

new_repo v1.2.3 v2.0.0-rc1
commit -m "fix: a"
push_develop
check "v2.0.0-rc1 beside v1.2.3 gives v1.2.4" 0 "v1.2.4" ""

new_repo v9.9.9 v10.0.0
commit -m "fix: a"
push_develop
check "v10.0.0 beside v9.9.9 gives v10.0.1" 0 "v10.0.1" ""

new_repo v1.2.3
bulk_commits 5000 "feat(x)!: newest commit is breaking"
push_develop
check "5000 commits, newest breaking gives v2.0.0" 0 "v2.0.0" "BREAKING"

cd /
if [[ $failures -gt 0 ]]; then
    say "$failures failure(s)."
    exit 1
fi
say "All cases passed."
