# Git rules

## Commits

- Angular convention: `type(scope): imperative summary`, subject under 72 characters.
  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- Never sign commits. Never add `Co-Authored-By`, `Signed-off-by`, "Generated with" or any
  mention of Claude or AI, in commits, PRs, issues or code.
- Stage only the files of the change. Never `git add -A` on a dirty tree.
- `--no-verify` only when the user says "no verif" / "no verify". Intermediate pushes of a
  delegated agent on its own branch (`50-delegation.md`) skip only the checks: `SKIP_CHECKS=1 git
  push` where the repo's hook supports it (dotfiles does), else a normal push. Never
  `--no-verify` for that: it also skips the branch guard.
- The bare word "commit" from the user means: run `/commit` on the current changes.

## Branch model (default when CONTRIBUTING.md says nothing)

1. Read `CONTRIBUTING.md` first; it wins.
2. `develop` exists: `<type>/<topic>` from `develop`, PR to `develop` (squash), `develop` to `main`
   by PR with merge commit, never squash. Every promotion is a release: SemVer tag `vX.Y.Z` plus
   GitHub Release through `/release` (PATCH automatic, MINOR on the user's decision, MAJOR on
   BREAKING with confirmation). Mirror `main` and tags to a `gitlab` remote if one exists.
3. Only `main` exists: `<type>/<topic>` from `main`, PR to `main` (squash).
4. `main` and `develop` only fast-forward from origin. Never commit or push on them directly.
   Never force-push them.

## Pull requests and issues

- `gh pr create` with: summary, test plan, manual steps (symlink, package, migration).
- A PR is not merged to `develop` before `/audit` (diff mode) reports 0 HIGH and the project's
  test suites (unit, feature, JS) and lints are green. The audit summary goes in the PR body.
- Check a PR's state (open, merged) before editing its body or assuming its scope.
- Anything postponed becomes a GitHub issue, not a `TODO` in a file.
- Merge conflicts: `develop` is the source of truth when both sides are equivalent.

## Safety

- A branch merged into its PR base (`develop`, or `main` where no `develop` exists) is deleted
  right after the merge, local and remote, with any worktree attached to it. This rule is the
  standing approval: no separate one is asked. Check first that the PR is merged and that
  nothing on the branch is missing from the base; otherwise stop and report. A worktree with
  uncommitted changes is reported, never forced.
- Any other branch is never deleted, local or remote, without explicit approval in the current
  session. `main`, `develop` and generated branches are never deleted.
- Deploys (ansible, make deploy, ssh to a server) are run by the user. Give the command, wait.
- File locations and what is versioned: `35-files.md`.
