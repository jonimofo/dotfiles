# Git rules

## Commits

- Angular convention: `type(scope): imperative summary`, subject under 72 characters.
  Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- Never sign commits. Never add `Co-Authored-By`, `Signed-off-by`, "Generated with" or any
  mention of Claude or AI, in commits, PRs, issues or code.
- Stage only the files of the change. Never `git add -A` on a dirty tree.
- `--no-verify` only when the user says "no verif" / "no verify".
- The bare word "commit" from the user means: run `/commit` on the current changes.

## Branch model (default when CONTRIBUTING.md says nothing)

1. Read `CONTRIBUTING.md` first; it wins.
2. `develop` exists: `<type>/<topic>` from `develop`, PR to `develop` (squash), `develop` to `main`
   by PR with merge commit, never squash. Mirror `main` to a `gitlab` remote if one exists.
3. Only `main` exists: `<type>/<topic>` from `main`, PR to `main` (squash).
4. `main` and `develop` only fast-forward from origin. Never commit or push on them directly.
   Never force-push them.

## Pull requests and issues

- `gh pr create` with: summary, test plan, manual steps (symlink, package, migration).
- Check a PR's state (open, merged) before editing its body or assuming its scope.
- Anything postponed becomes a GitHub issue, not a `TODO` in a file.
- Merge conflicts: `develop` is the source of truth when both sides are equivalent.

## Safety

- Never delete a branch, local or remote, without explicit approval in the current session.
- Deploys (ansible, make deploy, ssh to a server) are run by the user. Give the command, wait.
- Audit reports, smoke outputs and scratch files go to the scratchpad or `/tmp`, never the repo root.
- Local-only files (`todo.txt`, `TEMP/`, screenshots) are never committed unless the repo tracks them.
