#!/usr/bin/env bash
# Versioned promotion develop -> main: merge the PR, tag, publish a GitHub Release, mirror to gitlab.
# Usage: release.sh --pr <n> [--bump patch|minor|major] [--dry-run] [--next-only] [--yes]
set -euo pipefail

pr=""
bump="patch"
bump_given=0
dry_run=0
next_only=0
assume_yes=0
version_re='^v[0-9]+\.[0-9]+\.[0-9]+$'
breaking_re='^[a-z]+(\([^)]*\))?!:'

say() {
    printf '%s\n' "$*"
}

die() {
    printf 'release: %s\n' "$*" >&2
    exit 1
}

usage() {
    say "usage: $0 --pr <n> [--bump patch|minor|major] [--dry-run] [--next-only] [--yes]" >&2
    exit 2
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --pr)
                if [[ $# -lt 2 ]]; then
                    usage
                fi
                pr="$2"
                shift 2
                ;;
            --bump)
                if [[ $# -lt 2 ]]; then
                    usage
                fi
                bump="$2"
                bump_given=1
                shift 2
                ;;
            --dry-run) dry_run=1; shift ;;
            --next-only) next_only=1; shift ;;
            --yes) assume_yes=1; shift ;;
            *) usage ;;
        esac
    done
    case "$bump" in
        patch|minor|major) ;;
        *) die "invalid --bump '$bump' (patch, minor or major)." ;;
    esac
    if [[ $next_only -eq 0 ]]; then
        if [[ ! "$pr" =~ ^[0-9]+$ ]]; then
            usage
        fi
    fi
}

check_repo() {
    if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        die "not inside a git repository."
    fi
    if ! git remote get-url origin >/dev/null 2>&1; then
        die "no 'origin' remote."
    fi
}

check_clean_tree() {
    if [[ -n "$(git status --porcelain)" ]]; then
        die "working tree is not clean: commit or stash your changes first."
    fi
}

check_pr() {
    local fields
    if ! fields="$(gh pr view "$pr" --json state,baseRefName,headRefName \
        --jq '[.state, .baseRefName, .headRefName] | join(" ")')"; then
        die "PR #$pr not found (gh pr view failed)."
    fi
    if [[ "$fields" != "OPEN main develop" ]]; then
        die "PR #$pr must be OPEN with base main and head develop (got: $fields)."
    fi
}

check_promoted_commits() {
    if [[ -z "$(git rev-list origin/main..origin/develop)" ]]; then
        die "nothing to promote: origin/develop has no commit missing from origin/main."
    fi
}

check_no_local_only() {
    local branch
    for branch in main develop; do
        if ! git show-ref --verify --quiet "refs/heads/$branch"; then
            continue
        fi
        if ! git merge-base --is-ancestor "refs/heads/$branch" "refs/remotes/origin/$branch"; then
            die "local '$branch' has commits not on origin/$branch: fix it before releasing."
        fi
    done
}

last_tag() {
    git tag --merged origin/main --list 'v*' --sort=-v:refname | grep -E "$version_re" | head -n1 || true
}

has_breaking() {
    if git log origin/main..origin/develop --format='%s' | grep -Eq "$breaking_re"; then
        return 0
    fi
    if git log origin/main..origin/develop --format='%b' | grep -q 'BREAKING CHANGE:'; then
        return 0
    fi
    return 1
}

# Sets the globals level and next_version.
compute_version() {
    local prev major minor patch
    prev="$(last_tag)"
    level="$bump"
    if has_breaking; then
        if [[ $bump_given -eq 1 && "$bump" != "major" ]]; then
            die "BREAKING change detected: --bump $bump refused, use --bump major."
        fi
        level="major"
        breaking=1
    fi
    if [[ -z "$prev" ]]; then
        next_version="v1.0.0"
        first_release=1
        return 0
    fi
    IFS=. read -r major minor patch <<< "${prev#v}"
    case "$level" in
        major) next_version="v$((major + 1)).0.0" ;;
        minor) next_version="v$major.$((minor + 1)).0" ;;
        patch) next_version="v$major.$minor.$((patch + 1))" ;;
    esac
}

check_tag_free() {
    if git show-ref --verify --quiet "refs/tags/$next_version"; then
        die "tag $next_version already exists locally."
    fi
    if [[ -n "$(git ls-remote --tags origin "refs/tags/$next_version")" ]]; then
        die "tag $next_version already exists on origin."
    fi
}

notes_section() {
    local title="$1"
    local lines="$2"
    if [[ -z "$lines" ]]; then
        return 0
    fi
    printf '\n## %s\n%s\n' "$title" "$lines"
}

build_notes() {
    local subjects count feat fix docs refactor other
    subjects="$(git log origin/main..origin/develop --format='%s')"
    count="$(printf '%s\n' "$subjects" | grep -c . || true)"
    feat="$(printf '%s\n' "$subjects" | grep -E '^feat(\(|!|:)' | sed 's/^/- /' || true)"
    fix="$(printf '%s\n' "$subjects" | grep -E '^fix(\(|!|:)' | sed 's/^/- /' || true)"
    docs="$(printf '%s\n' "$subjects" | grep -E '^docs(\(|!|:)' | sed 's/^/- /' || true)"
    refactor="$(printf '%s\n' "$subjects" | grep -E '^refactor(\(|!|:)' | sed 's/^/- /' || true)"
    other="$(printf '%s\n' "$subjects" | grep -Ev '^(feat|fix|docs|refactor)(\(|!|:)' | grep . | sed 's/^/- /' || true)"
    printf 'Promotion develop -> main, %s commit(s).\n' "$count"
    notes_section "Features" "$feat"
    notes_section "Fixes" "$fix"
    notes_section "Documentation" "$docs"
    notes_section "Refactoring" "$refactor"
    notes_section "Other" "$other"
}

confirm_major() {
    local answer
    if [[ "$level" != "major" || $first_release -eq 1 ]]; then
        return 0
    fi
    if [[ "$bump" == "major" || $assume_yes -eq 1 ]]; then
        return 0
    fi
    if [[ ! -t 0 ]]; then
        die "MAJOR bump needs --bump major or --yes when not run from a terminal."
    fi
    printf 'MAJOR version jump to %s. Confirm? [y/N] ' "$next_version"
    read -r answer
    if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
        die "aborted."
    fi
}

print_plan() {
    say "Release plan"
    say "  PR:       #$pr (develop -> main, merge commit)"
    say "  Previous: ${prev_tag:-none}"
    if [[ $first_release -eq 1 ]]; then
        say "  Version:  $next_version (first release)"
    else
        say "  Version:  $next_version ($level)"
    fi
    if [[ $has_gitlab -eq 1 ]]; then
        say "  Mirror:   push main and $next_version to gitlab"
    fi
    say ""
    say "$notes"
    say ""
}

fast_forward() {
    local branch="$1"
    local current
    current="$(git branch --show-current)"
    if ! git show-ref --verify --quiet "refs/heads/$branch"; then
        return 0
    fi
    if [[ "$current" == "$branch" ]]; then
        git pull --ff-only origin "$branch"
    else
        git fetch origin "$branch:$branch"
    fi
}

execute_release() {
    local merge_sha url
    say "Merging PR #$pr..."
    gh pr merge "$pr" --merge --subject "release: promote develop to main $next_version (#$pr)"
    git fetch origin
    merge_sha="$(git rev-parse origin/main)"
    if [[ "$(git log -1 --format=%s "$merge_sha")" != "release: promote develop to main $next_version (#$pr)" ]]; then
        die "origin/main ($merge_sha) is not the expected merge commit; stopping before tagging."
    fi
    if ! git merge-base --is-ancestor origin/develop origin/main; then
        die "origin/main does not contain origin/develop; stopping before tagging."
    fi
    say "Tagging $next_version..."
    git tag -a "$next_version" origin/main -m "release $next_version" -m "$notes"
    git push origin "$next_version"
    gh release create "$next_version" --verify-tag --title "$next_version" --notes "$notes"
    if [[ $has_gitlab -eq 1 ]]; then
        say "Mirroring to gitlab..."
        git push gitlab origin/main:refs/heads/main
        git push gitlab "$next_version"
    fi
    fast_forward main
    fast_forward develop
    url="$(gh release view "$next_version" --json url --jq .url)"
    say ""
    say "Released $next_version"
    say "  Release: $url"
    say "  Merge:   $merge_sha"
}

main() {
    level=""
    next_version=""
    breaking=0
    first_release=0
    has_gitlab=0
    parse_args "$@"
    check_repo
    if [[ $next_only -eq 1 ]]; then
        compute_version
        if [[ $breaking -eq 1 ]]; then
            say "BREAKING change detected: MAJOR bump." >&2
        fi
        say "$next_version"
        exit 0
    fi
    check_clean_tree
    git fetch --prune --prune-tags origin
    check_pr
    check_promoted_commits
    check_no_local_only
    prev_tag="$(last_tag)"
    compute_version
    check_tag_free
    if git remote get-url gitlab >/dev/null 2>&1; then
        has_gitlab=1
    fi
    notes="$(build_notes)"
    print_plan
    if [[ $dry_run -eq 1 ]]; then
        say "Dry run: nothing changed."
        exit 0
    fi
    confirm_major
    execute_release
}

main "$@"
