---
name: commit
description: Commit the current changes with an Angular-convention message and no AI attribution. Triggered by /commit or by the user typing "commit", "commit this", "commit changes", "commit no verif".
---

# Commit

1. `git status --short` and `git diff --stat`. If the tree mixes unrelated changes, ask which
   files belong to this commit. Never `git add -A` on a dirty tree.
2. Stage the files of the change only.
3. Message: `type(scope): imperative summary`, subject under 72 characters, body only if the
   change needs a why. No sign-off, no Co-Authored-By, no mention of Claude or AI, ever.
4. Run `git commit`. Add `--no-verify` only if the user wrote "no verif" or "no verify".
5. Report the hash and the subject line. Do not push unless asked.

If the current branch is `main` or `develop`: stop and propose a `<type>/<topic>` branch first.
