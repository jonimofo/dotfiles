#!/bin/bash
# Static checks of the Cinnamon extensions and applets under cinnamon/extensions/ and
# cinnamon/applets/: JavaScript syntax, metadata.json validity, and every module reference
# between the files of one extension or applet.
# Usage: scripts/cinnamon-extension-check.sh (from any directory). Needs node and jq.
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cinnamon_dir="$(cd "$script_dir/../cinnamon" && pwd)"
readonly XLET_KINDS=(extensions applets)
failures=0
checked_files=0

fail() {
    printf 'FAIL %s\n' "$*" >&2
    failures=$((failures + 1))
}

require_commands() {
    local command_name
    for command_name in "$@"; do
        if ! command -v "$command_name" >/dev/null; then
            printf 'Missing command: %s\n' "$command_name" >&2
            exit 2
        fi
    done
}

check_syntax() {
    local js_file="$1"
    local output
    if ! output="$(node --check "$js_file" 2>&1)"; then
        fail "$js_file: syntax error"
        printf '%s\n' "$output" >&2
    fi
}

check_metadata() {
    local metadata_file="$1"
    if [[ ! -f "$metadata_file" ]]; then
        fail "$metadata_file: missing"
        return
    fi
    if ! jq empty "$metadata_file" 2>/dev/null; then
        fail "$metadata_file: invalid JSON"
    fi
}

# Cinnamon's require() exports the top-level function, const, let, var and class bindings.
is_top_level_declaration() {
    local module_file="$1" name="$2"
    local declarations
    declarations="$(grep -E "^(function|const|let|var|class) ${name}([^A-Za-z0-9_]|$)" "$module_file" || true)"
    [[ -n "$declarations" ]]
}

# Each `const Alias = require('./module')` must name a file of the extension, and each
# `Alias.name` used in the file must be declared at the top level of that module.
check_requires() {
    local js_file="$1"
    local extension_dir requires line alias module module_file uses name
    extension_dir="$(dirname "$js_file")"
    requires="$(grep -oE "const [A-Za-z_][A-Za-z0-9_]* = require\('\./[A-Za-z0-9_.-]+'\)" "$js_file" || true)"

    while IFS= read -r line; do
        if [[ -z "$line" ]]; then
            continue
        fi
        alias="$(sed -E "s/^const ([A-Za-z0-9_]+) = .*/\1/" <<<"$line")"
        module="$(sed -E "s/.*require\('\.\/([^']+)'\)/\1/" <<<"$line")"
        module_file="$extension_dir/${module%.js}.js"
        if [[ ! -f "$module_file" ]]; then
            fail "$js_file: require('./$module') has no file"
            continue
        fi

        uses="$(grep -oE "(^|[^A-Za-z0-9_.])${alias}\.[A-Za-z_][A-Za-z0-9_]*" "$js_file" \
            | sed -E "s/.*${alias}\.//" | sort -u || true)"
        while IFS= read -r name; do
            if [[ -z "$name" ]]; then
                continue
            fi
            if ! is_top_level_declaration "$module_file" "$name"; then
                fail "$js_file: ${alias}.${name} is not a top-level declaration of $(basename "$module_file")"
            fi
        done <<<"$uses"
    done <<<"$requires"
}

check_extension() {
    local extension_dir="$1"
    local js_file
    check_metadata "$extension_dir/metadata.json"
    for js_file in "$extension_dir"/*.js; do
        if [[ ! -f "$js_file" ]]; then
            continue
        fi
        check_syntax "$js_file"
        check_requires "$js_file"
        checked_files=$((checked_files + 1))
    done
}

main() {
    local kind extension_dir extension_count=0
    require_commands node jq grep sed sort
    for kind in "${XLET_KINDS[@]}"; do
        for extension_dir in "$cinnamon_dir/$kind"/*/; do
            if [[ ! -d "$extension_dir" ]]; then
                continue
            fi
            check_extension "${extension_dir%/}"
            extension_count=$((extension_count + 1))
        done
    done

    if [[ "$failures" -gt 0 ]]; then
        printf '%d failure(s)\n' "$failures" >&2
        exit 1
    fi
    printf 'ok: %d extension(s) and applet(s), %d JavaScript file(s) checked\n' "$extension_count" "$checked_files"
}

main "$@"
