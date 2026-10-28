# Contributing to dotfiles

Adapted from the BAF workflow (`QDV/baf/CONTRIBUTING.md`), without the Laravel and Ansible parts.
Release versioning is kept, in a portable form ([`scripts/release.sh`](scripts/release.sh)).

## Branch model

```
feat/* | fix/* | docs/* | chore/*  ─(PR, squash)→  develop  ─(PR, merge commit)→  main
```

- **`main`**: the stable config, mirrored to GitLab. Never commit directly.
- **`server`**: generated from `main` for servers (see [Server branch](#server-branch-generated)). Never touch it.
- **`develop`**: integration. Never commit directly.
- **`<type>/<topic>`**: one short-lived branch per change, created from `develop`
  (`feat/`, `fix/`, `docs/`, `chore/`, `refactor/`...). With an issue: `feat/123-topic`.

## Commit convention (Angular)

Format: `<type>(<scope>): <imperative summary>`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Rules:
- Subject under 72 characters, imperative mood ("add", not "added").
- Scope = the tool or file concerned (e.g. `feat(espanso): …`, `fix(bashrc): …`).
- **Forbidden**: signing commits (`-S`), `Co-Authored-By` trailers, mentioning an AI,
  "generated-by" footers.
- Install the hooks once (see [Guardrails](#guardrails)): `commit-msg` checks the convention.

## Pull Requests

1. Push the branch: `git push -u origin <type>/<topic>`.
2. Open the PR against **`develop`** (never directly against `main`):
   ```bash
   gh pr create --base develop --head <type>/<topic> --title "feat(...): …" --body "<summary + test plan>"
   ```
3. The description lists: the summary, the test plan, and any **manual steps** needed on a
   machine (new symlink, package to install, `dconf load`...). The PR body is lost on
   squash-merge: if a manual step matters, put it in the commit body or the relevant runbook too.

## Task tracking (GitHub Issues)

Anything postponed (TODO, bug, idea) goes into a **GitHub issue**, not a `# TODO` lost in a file.

- **Title**: same spirit as commits, `feat(...) / fix(...) / chore(...)` + clear summary.
- **Labels**: use the existing ones (`bug`, `enhancement`, `documentation`…).
- **PR ↔ issue link**: `Closes #123` closes the issue on merge, `Refs #123` only references it.

```bash
gh issue create --title "feat(tmux): add session picker" --body "Context + acceptance criteria" --label enhancement
gh issue list
gh issue view <number>
gh issue close <number>
```

## Merge strategy

| Transition | Strategy | Why |
|---|---|---|
| `<type>/* → develop` | **Squash & merge** + delete the branch | One clean commit per change on `develop`, easy revert. |
| `develop → main` | **Merge commit (`--no-ff`)**, no deletion, via `scripts/release.sh` | Keeps `develop` history and marks promotions. Never squash a long-lived branch. |

- Squash: the **PR title becomes the commit message**, so it must follow the Angular convention.

```bash
# <type>/* → develop
gh pr merge <#> --squash --delete-branch
git fetch --prune

# develop → main (versioned promotion, see below)
gh pr create --base main --head develop --title "release: promote develop to main" --body "…"
scripts/release.sh --pr <#> --dry-run
scripts/release.sh --pr <#>
```

**`main` is mirrored to GitLab**: `scripts/release.sh` pushes `main` and the new tag to the
`gitlab` remote after every promotion. It is the only direct branch push the `pre-push` hook
allows (`gitlab` remote, `main` branch).
Branches and `develop` stay on GitHub (`origin`) only.

## Versioning & releases

Every `develop → main` promotion is a versioned release (SemVer `vX.Y.Z`), done by
[`scripts/release.sh`](scripts/release.sh). It works in any repo with `main`, `develop` and
`origin` on GitHub (needs `git` and `gh`).

```bash
scripts/release.sh --pr <#> --dry-run   # checks + plan + release notes, changes nothing
scripts/release.sh --pr <#>             # merge, tag, GitHub Release, gitlab mirror
```

Open the PR first with the title `release: promote develop to main (YYYY-MM-DD)`.

What it does, in order: records the head of `origin/develop` in the plan, merges the PR with a
merge commit (never squash, `develop` kept) only if `develop` still points to that head,
checks that the merge commit's second parent is that head, creates an annotated tag `vX.Y.Z`
on it, pushes the tag, publishes a GitHub Release, pushes `main` and the tag to `gitlab` if
that remote exists, then fast-forwards local `main` and `develop`.

| Bump | When |
|---|---|
| PATCH | Default. |
| MINOR | Human decision only: `--bump minor`. |
| MAJOR | A promoted commit is `type!:` or has a body line starting with `BREAKING CHANGE:` or `BREAKING-CHANGE:`. Needs confirmation, or `--bump major` / `--yes` for non-interactive runs. A lower `--bump` is refused. |
| `v1.0.0` | First release (no `vX.Y.Z` tag on `main` yet), whatever the bump. |

**Record of a release**: the annotated tag and the GitHub Release, both carrying the notes
(promoted commits grouped by type). No changelog file.

**Guardrails** (the script aborts before changing anything; it only fetches `origin` with
`git fetch --prune` and `git fetch --tags`, never `--prune-tags`): dirty working tree, PR not
open or not `develop → main`, nothing to promote, local `main`/`develop` with commits not on
`origin`, tag already existing locally or on `origin`.

**Partial release**: once the PR is merged, any later failure prints a "RELEASE PARTIALLY
DONE" block with what succeeded and the exact remaining commands (tag, tag push,
`gh release create … --notes-file <file>`, gitlab pushes, fast-forwards). The notes file is
kept under `${TMPDIR:-/tmp}`. Fix the cause and run those commands; do not re-run the script.

`scripts/release.sh --next-only [--bump …] [--no-fetch]` prints the next version only. It
fetches `origin` first unless `--no-fetch` is given.

Run `scripts/release-test.sh` after changing the release script: it checks the version logic
on throwaway repos and must print `All cases passed.`

## Server branch (generated)

Servers only get the files listed in [`server-files.txt`](server-files.txt), through the
`server` branch, so pictures, notes and laptop configs never reach them.

- `server` is **rebuilt automatically** by [`.github/workflows/server-branch.yml`](.github/workflows/server-branch.yml)
  on every push to `main` (or manually: `gh workflow run server-branch`, from `main` only:
  a run on any other ref is skipped).
- It is a single orphan commit: no history from `main`, so a shallow single-branch clone
  downloads nothing else. **Never commit or push to `server`** (the `pre-push` hook blocks it).
- To ship a new file to servers: add it to `server-files.txt` **and** to the symlink list
  `dotfiles_user_configs` in `QDV/ansible` (`roles/dotfiles/defaults/main.yml`). The workflow
  fails if a listed file is missing from `main`.
- Deploying stays manual, from `QDV/ansible`:
  ```bash
  ansible-playbook site.yml --tags dotfiles --check --diff   # which servers are behind
  ansible-playbook site.yml --tags dotfiles                  # deploy
  ```

## Branch cleanup

- When merging a branch: `--delete-branch` (remote) + `git fetch --prune` (local).
- **Never** delete `develop` or `main`.
- Check `main ↔ develop` sync regularly: `git log --oneline main..develop`.

## Guardrails

**`main` and `develop` only change through a PR.** No direct commit or push on them, so locally
they only fast-forward from `origin`.

GitHub branch protection is not available (private repo, free plan), so enforcement is
**client side**. Install the hooks once per clone:

```bash
cp .githooks/commit-msg.sh .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg
cp .githooks/pre-push.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push
git config pull.ff only      # a pull that cannot fast-forward fails (no surprise merge)
```

- `commit-msg`: rejects subjects that break the Angular convention or exceed 71 characters,
  and messages carrying `Co-Authored-By` or "generated" footers.
- `pre-push`: rejects pushes to `main`/`develop`/`server`, except `main` to the `gitlab` mirror.
  Tag pushes (`git push origin vX.Y.Z`) are allowed.

Other rules:
- 1 PR = 1 logical change (small PRs).
- No `--force` on `main`/`develop`.
- Hooks can be bypassed (`--no-verify`): they are a guardrail, not a guarantee.

## Example: from a change to main

```bash
git checkout develop && git pull --ff-only
git checkout -b feat/espanso-claude-matches
# edit...
git add espanso/
git commit -m "feat(espanso): move claude prompts to a dedicated match file"
git push -u origin feat/espanso-claude-matches
gh pr create --base develop --head feat/espanso-claude-matches \
  --title "feat(espanso): move claude prompts to a dedicated match file" \
  --body "$(cat <<'EOF'
## Summary
Move :rdoc and :ask to espanso/claude.yml.

## Test plan
- [x] `espanso restart`, both triggers expand

## Manual steps
None.
EOF
)"
gh pr merge <#> --squash --delete-branch
git checkout develop && git pull --ff-only && git fetch --prune
```

### Common mistakes

- ❌ Committing directly on `develop` or `main`: the `pre-push` hook blocks the push.
- ❌ Opening a PR from a topic branch to `main`: always go through `develop`.
- ❌ `git push --force` on `develop`/`main`.
- ❌ Squashing the `develop → main` PR: history is lost.
- ❌ Forgetting `git pull --ff-only` after a merge.
- ❌ Promoting with `gh pr merge` by hand: use `scripts/release.sh` so the release is tagged and mirrored.
