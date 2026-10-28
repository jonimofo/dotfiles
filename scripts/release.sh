#!/usr/bin/env bash
# Versioned promotion develop -> main: merge the PR, tag, publish a GitHub Release, mirror to gitlab.
# Usage: release.sh --pr <n> [--bump patch|minor|major] [--dry-run] [--yes]
#        release.sh --next-only [--bump patch|minor|major] [--no-fetch]
set -euo pipefail

pr=""
bump="patch"
bump_given=0
dry_run=0
next_only=0
no_fetch=0
assume_yes=0
version_re='^v[0-9]+\.[0-9]+\.[0-9]+$'
breaking_subject_re='^[a-z]+(\([^)]*\))?!:'
breaking_body_re='^BREAKING[ -]CHANGE:'

say() {
    printf '%s\n' "$*"
}

die() {
    printf 'release: %s\n' "$*" >&2
    exit 1
}

usage() {
    say "usage: $0 --pr <n> [--bump patch|minor|major] [--dry-run] [--yes]" >&2
    say "       $0 --next-only [--bump patch|minor|major] [--no-fetch]" >&2
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
            --dry-run)
                dry_run=1
                shift
                ;;
            --next-only)
                next_only=1
                shift
                ;;
            --no-fetch)
                no_fetch=1
                shift
                ;;
            --yes)
                assume_yes=1
                shift
                ;;
            *)
                usage
                ;;
        esac
    done
    case "$bump" in
        patch|minor|major) ;;
        *) die "invalid --bump '$bump' (patch, minor or major)." ;;
    esac
    if [[ $no_fetch -eq 1 && $next_only -eq 0 ]]; then
        die "--no-fetch is only allowed with --next-only."
    fi
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

# Never --prune-tags: it would delete local tags before any guardrail runs.
fetch_origin() {
    git fetch --prune origin
    git fetch --tags origin
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

# Output is captured before filtering: a `cmd | grep -q` or `cmd | head` pipeline can die of
# SIGPIPE under pipefail and turn a match into a failure.
last_tag() {
    local tags versions
    tags="$(git tag --merged origin/main --list 'v*' --sort=-v:refname)"
    versions="$(grep -E "$version_re" <<< "$tags" || true)"
    printf '%s\n' "${versions%%$'\n'*}"
}

has_breaking() {
    local subjects bodies
    subjects="$(git log origin/main..origin/develop --format='%s')"
    bodies="$(git log origin/main..origin/develop --format='%b')"
    if grep -Eq "$breaking_subject_re" <<< "$subjects"; then
        return 0
    fi
    if grep -Eq "$breaking_body_re" <<< "$bodies"; then
        return 0
    fi
    return 1
}

# Sets the globals level, breaking, first_release and next_version.
compute_version() {
    local major minor patch
    level="$bump"
    if has_breaking; then
        if [[ $bump_given -eq 1 && "$bump" != "major" ]]; then
            die "BREAKING change detected: --bump $bump refused, use --bump major."
        fi
        level="major"
        breaking=1
    fi
    if [[ -z "$prev_tag" ]]; then
        next_version="v1.0.0"
        first_release=1
        return 0
    fi
    IFS=. read -r major minor patch <<< "${prev_tag#v}"
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

# Prints the lines of $2 matching the extended regex $1 as a "- " list.
bullet_lines() {
    local pattern="$1"
    local text="$2"
    local matched line
    matched="$(grep -E -- "$pattern" <<< "$text" || true)"
    if [[ -z "$matched" ]]; then
        return 0
    fi
    while IFS= read -r line; do
        printf -- '- %s\n' "$line"
    done <<< "$matched"
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
    local subjects count section type title
    subjects="$(git log origin/main..origin/develop --format='%s')"
    count="$(grep -c . <<< "$subjects" || true)"
    printf 'Promotion develop -> main, %s commit(s).\n' "$count"
    for section in feat:Features fix:Fixes docs:Documentation refactor:Refactoring; do
        type="${section%%:*}"
        title="${section#*:}"
        notes_section "$title" "$(bullet_lines "^$type(\(|!|:)" "$subjects")"
    done
    notes_section "Other" "$(bullet_lines '^.' "$(grep -Ev '^(feat|fix|docs|refactor)(\(|!|:)' <<< "$subjects" || true)")"
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
    say "  Head:     $head_sha (origin/develop, merge refused if it moves)"
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

# Runs on every exit. After the merge, a failure prints what is done and what is left.
print_resume() {
    local status=$?
    if [[ $status -eq 0 || $merge_done -eq 0 ]]; then
        return 0
    fi
    local target="${merge_sha:-<merge commit sha, check origin/main>}"
    {
        say ""
        say "RELEASE PARTIALLY DONE ($next_version): PR #$pr is merged, the rest failed."
        say "Done:"
        say "  - merge of PR #$pr"
        if [[ $verified -eq 1 ]]; then
            say "  - merge commit $merge_sha verified"
        fi
        if [[ $tagged -eq 1 ]]; then
            say "  - local tag $next_version"
        fi
        if [[ $tag_pushed -eq 1 ]]; then
            say "  - tag pushed to origin"
        fi
        if [[ $released -eq 1 ]]; then
            say "  - GitHub Release"
        fi
        if [[ $mirrored -eq 1 ]]; then
            say "  - gitlab mirror"
        fi
        say "Left to run, from this repo, after fixing the cause above:"
        if [[ $verified -eq 0 ]]; then
            say "  # check first that origin/main is the merge of PR #$pr with second parent $head_sha"
        fi
        if [[ $tagged -eq 0 ]]; then
            say "  git tag -a $next_version $target -m 'release $next_version' -m \"\$(cat $notes_file)\""
        fi
        if [[ $tag_pushed -eq 0 ]]; then
            say "  git push origin $next_version"
        fi
        if [[ $released -eq 0 ]]; then
            say "  gh release create $next_version --verify-tag --title $next_version --notes-file $notes_file"
        fi
        if [[ $has_gitlab -eq 1 && $mirrored -eq 0 ]]; then
            say "  git push gitlab $target:refs/heads/main"
            say "  git push gitlab $next_version"
        fi
        say "  git fetch origin main:main      # or git pull --ff-only when main is checked out"
        say "  git fetch origin develop:develop"
    } >&2
}

verify_merge() {
    local second_parent
    if [[ "$(git log -1 --format=%s "$merge_sha")" != "$merge_subject" ]]; then
        die "origin/main ($merge_sha) is not the expected merge commit; stopping before tagging."
    fi
    if ! second_parent="$(git rev-parse --verify --quiet "$merge_sha^2")"; then
        die "origin/main ($merge_sha) is not a merge commit; stopping before tagging."
    fi
    if [[ "$second_parent" != "$head_sha" ]]; then
        die "merged head $second_parent differs from the planned $head_sha; stopping before tagging."
    fi
    verified=1
}

execute_release() {
    local url
    trap print_resume EXIT
    say "Merging PR #$pr..."
    gh pr merge "$pr" --merge --match-head-commit "$head_sha" --subject "$merge_subject"
    merge_done=1
    git fetch origin
    merge_sha="$(git rev-parse origin/main)"
    verify_merge
    say "Tagging $next_version..."
    git tag -a "$next_version" "$merge_sha" -m "release $next_version" -m "$notes"
    tagged=1
    git push origin "$next_version"
    tag_pushed=1
    gh release create "$next_version" --verify-tag --title "$next_version" --notes-file "$notes_file"
    released=1
    if [[ $has_gitlab -eq 1 ]]; then
        say "Mirroring to gitlab..."
        git push gitlab "$merge_sha:refs/heads/main"
        git push gitlab "$next_version"
        mirrored=1
    fi
    fast_forward main
    fast_forward develop
    url="$(gh release view "$next_version" --json url --jq .url)"
    say ""
    say "Released $next_version"
    say "  Release: $url"
    say "  Merge:   $merge_sha"
    rm -f "$notes_file"
}

main() {
    level=""
    next_version=""
    breaking=0
    first_release=0
    has_gitlab=0
    prev_tag=""
    head_sha=""
    notes=""
    notes_file=""
    merge_sha=""
    merge_subject=""
    merge_done=0
    verified=0
    tagged=0
    tag_pushed=0
    released=0
    mirrored=0
    parse_args "$@"
    check_repo
    if [[ $next_only -eq 1 ]]; then
        if [[ $no_fetch -eq 0 ]]; then
            fetch_origin >&2
        fi
        prev_tag="$(last_tag)"
        compute_version
        if [[ $breaking -eq 1 ]]; then
            say "BREAKING change detected: MAJOR bump." >&2
        fi
        say "$next_version"
        exit 0
    fi
    check_clean_tree
    fetch_origin
    check_pr
    check_promoted_commits
    check_no_local_only
    head_sha="$(git rev-parse origin/develop)"
    prev_tag="$(last_tag)"
    compute_version
    check_tag_free
    if git remote get-url gitlab >/dev/null 2>&1; then
        has_gitlab=1
    fi
    notes="$(build_notes)"
    merge_subject="release: promote develop to main $next_version (#$pr)"
    print_plan
    if [[ $dry_run -eq 1 ]]; then
        say "Dry run: nothing changed."
        exit 0
    fi
    confirm_major
    notes_file="$(mktemp "${TMPDIR:-/tmp}/release-notes-$next_version.XXXXXX")"
    printf '%s\n' "$notes" > "$notes_file"
    execute_release
}

main "$@"
