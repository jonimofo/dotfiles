---
name: release
description: Promote develop to main with a merge-commit PR, then mirror main to the gitlab remote if it exists. Triggered by /release or by the user typing "promote to main".
---

# Release: promote develop to main

Read `CONTRIBUTING.md` first; its release section wins over this generic flow.

1. `git fetch --prune`, then `git log --oneline main..develop`. Nothing to promote: say so, stop.
2. Run `/audit full` on `main..develop`. Open HIGH findings block the release until fixed or
   explicitly accepted by the user.
3. Check sync: local `develop` and `main` are fast-forwards of origin. Not the case: stop and report.
4. `gh pr create --base main --head develop --title "release: promote develop to main (YYYY-MM-DD)"`
   with a body listing the squashed PRs (`gh pr list --state merged --base develop` since last release).
5. Wait for the user's "merge". Then `gh pr merge <#> --merge`, never squash.
6. `git checkout main && git pull --ff-only origin main`. If a `gitlab` remote exists:
   `git push gitlab main`.
7. Back to `develop`, `git pull --ff-only`. Report the release commit hash.

Deploys after the release are run by the user: give the command from the project docs, wait.
