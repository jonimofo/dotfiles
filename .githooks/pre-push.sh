#!/bin/sh

# Reject direct pushes to main/develop: they only change through a merged PR.
# Exception: main can be pushed to the gitlab mirror after a promotion.
# Install: cp .githooks/pre-push.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

remote="$1"
protected="main develop"

while read -r local_ref local_sha remote_ref remote_sha; do
    branch=$(printf '%s' "$remote_ref" | sed 's#refs/heads/##')
    if [ "$remote" = "gitlab" ] && [ "$branch" = "main" ]; then
        continue
    fi
    for p in $protected; do
        if [ "$branch" = "$p" ]; then
            echo "✖ Direct push to '$p' on '$remote' is forbidden."
            echo "  Use a <type>/* branch + a Pull Request."
            exit 1
        fi
    done
done

exit 0
