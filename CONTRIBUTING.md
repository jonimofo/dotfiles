# Contributing to dotfiles

Adapted from the BAF workflow (`QDV/baf/CONTRIBUTING.md`), without the Laravel, Ansible and
release-versioning parts.

## Branch model

```
feat/* | fix/* | docs/* | chore/*  ─(PR, squash)→  develop  ─(PR, merge commit)→  main
```

- **`main`**: the stable config, mirrored to GitLab. Never commit directly.
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
| `develop → main` | **Merge commit (`--no-ff`)**, no deletion | Keeps `develop` history and marks promotions. Never squash a long-lived branch. |

- Squash: the **PR title becomes the commit message**, so it must follow the Angular convention.

```bash
# <type>/* → develop
gh pr merge <#> --squash --delete-branch
git fetch --prune

# develop → main (promotion)
gh pr create --base main --head develop --title "release: promote develop to main (YYYY-MM-DD)" --body "…"
gh pr merge <#> --merge

# then mirror main to GitLab
git checkout main
git pull --ff-only origin main
git push gitlab main
```

**`main` is mirrored to GitLab**: after every promotion, push `main` to the `gitlab` remote.
It is the only direct push the `pre-push` hook allows (`gitlab` remote, `main` branch).
Branches and `develop` stay on GitHub (`origin`) only.

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
- `pre-push`: rejects pushes to `main`/`develop`, except `main` to the `gitlab` mirror.

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
- ❌ Forgetting `git pull --ff-only` after a merge, or `git push gitlab main` after a promotion.
