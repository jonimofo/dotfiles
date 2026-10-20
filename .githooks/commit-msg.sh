#!/bin/sh

# Enforce the Angular commit convention (see CONTRIBUTING.md).
# Install: cp .githooks/commit-msg.sh .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg

msg_file="$1"

# Drop comments and everything below the scissors line (git commit -v)
msg=$(sed -e '/^# -\{24\} >8 -\{24\}$/,$d' -e '/^#/d' "$msg_file")
subject=$(printf '%s\n' "$msg" | sed -n '/./{p;q;}')

# Let git-generated subjects through
case "$subject" in
    "Merge "*|"Revert "*|"fixup! "*|"squash! "*|"amend! "*)
        exit 0
        ;;
esac

types="feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert"
if ! printf '%s' "$subject" | grep -Eq "^($types)(\([A-Za-z0-9_./-]+\))?!?: [^ ].*"; then
    echo "✖ Invalid commit subject: $subject"
    echo "  Expected: <type>(<scope>): <imperative summary>"
    echo "  Types: $(printf '%s' "$types" | sed 's/|/, /g')"
    exit 1
fi

length=$(printf '%s' "$subject" | wc -m)
if [ "$length" -ge 72 ]; then
    echo "✖ Commit subject is $length characters, must be under 72."
    exit 1
fi

if printf '%s\n' "$msg" | grep -Eiq '^(co-authored-by|generated[ -](by|with))|noreply@anthropic\.com'; then
    echo "✖ Co-Authored-By and generated-by footers are forbidden."
    exit 1
fi

exit 0
