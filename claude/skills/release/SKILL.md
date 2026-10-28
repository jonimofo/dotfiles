---
name: release
description: Promote develop to main as a versioned release (merge commit, SemVer tag vX.Y.Z, GitHub Release) using ~/Repos/dotfiles/scripts/release.sh, after a full audit. Triggered by /release or by the user typing "promote to main" or "release".
---

# Release: promote develop to main, versioned

Read `CONTRIBUTING.md` first. A repo with its own release tooling (for example baf's `make release`)
uses that tooling; this skill writes the PR body and reminds the command. Everything else uses
`~/Repos/dotfiles/scripts/release.sh`.

## Version rules (SemVer, same as baf)

- PATCH bumps automatically.
- MINOR only on the user's decision: ask "minor bump?" when the promoted commits contain a `feat`,
  then pass `--bump minor`. Never deduce it.
- MAJOR only when a commit is `type!:` or has a body line starting with `BREAKING CHANGE:` or
  `BREAKING-CHANGE:`. The script asks for confirmation, or takes `--bump major` / `--yes` for
  non-interactive runs. A first release with no tag starts at `v1.0.0`.
- The record of a release is the annotated tag plus the GitHub Release notes (promoted commits
  grouped by type). No changelog file unless the repo already has one.

## Steps

1. `git fetch --prune origin` and `git fetch --tags origin` (never `--prune-tags`), then `git log --oneline origin/main..origin/develop`.
   Nothing to promote: say so, stop.
2. Run `/audit full` on `origin/main..origin/develop`. Open HIGH findings block the release until
   fixed or explicitly accepted by the user. Skip only when the user says so, and say it was skipped.
3. Check sync: local `develop` and `main` are fast-forwards of origin, tree clean. Otherwise stop.
4. Open the release PR: `gh pr create --base main --head develop --title "release: promote develop
   to main (YYYY-MM-DD)"`. Body: promoted commits with their `(#PR)`, notable impacts, manual
   steps collected from each promoted PR's body (read them, do not reinvent), and the deploy
   commands from the project docs. If `gh pr edit` fails on the repo, use
   `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@file`.
5. Dry run: `~/Repos/dotfiles/scripts/release.sh --pr <n> --dry-run` (add `--bump minor` if
   decided). Show the user the planned version, head SHA and notes. `--next-only` prints only the
   version (`--no-fetch` skips its fetch, for tests).
6. Wait for the user's "merge" or "release". Then run the script without `--dry-run`. It merges
   with a merge commit, tags `vX.Y.Z` on `main`, pushes the tag, creates the GitHub Release, mirrors
   `main` and the tag to a `gitlab` remote if one exists, and fast-forwards local `main` and `develop`. The merge is refused if `develop` moved since the plan: re-run the dry run.
   If it fails after the merge, it prints a "RELEASE PARTIALLY DONE" block: show it to the user and
   run the listed remaining commands only after the user's OK. Never re-run the script then.
7. Report the version, the release URL and the merge commit. Deploys after the release are run by
   the user: give the command from the project docs, wait.
