# CLAUDE.md

Project guidance for Claude Code. Global rules (`~/.claude/rules/`) apply; this file only adds
what is specific to this repository.

## Project overview

<One paragraph: what the project does, for whom.>

## Tech stack

- <Language and framework, versions>
- <Database>
- <Runtime: Docker, Makefile, bun, uv...>
- <Tests and linters, and the exact commands>

## Commands

```bash
make up          # <what it does>
make test        # <what it does>
make lint        # <what it does>
```

## Project rules

- <Reply language if not the default: e.g. "Always reply in English here">
- <Branch model if different from the global default, or "See CONTRIBUTING.md">
- <Data sources that must never be written: e.g. "SAP prod is read-only">
- <Conventions the global rules do not cover: naming, folder layout, design tokens>

## Documentation

- <Path of the project docs folder, read before proposing changes>
- <Audit prompts location if any (used by /audit)>

## Deployment

- <Who runs deploys and with which command>
- <Environments: staging and production hosts, what to check after a deploy>
