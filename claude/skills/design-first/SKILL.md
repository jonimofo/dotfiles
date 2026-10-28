---
name: design-first
description: Design mode. Produce a design to validate without modifying anything. Use before any non-trivial change (feature, layout, schema, infra) or when the user says /design-first.
---

# Design first: design and get validation before changing anything

## Golden rule

Change NOTHING until validated: no file, config, commit, migration or non-read-only command.

## Workflow

1. **Explore.** Reuse patterns, helpers and components already in place. Do not reinvent.
2. **Mock up**, by task type:
   - UI: ASCII wireframe inside the AskUserQuestion option preview, plus the components reused.
     After validation of the ASCII, ask whether to render an Artifact page or take screenshots.
   - Code or infra: files touched, before and after, dependencies, risk points.
   - SQL or business data: the query, plus the real schema checked at the source.
3. **Suggest** improvements and alternatives with trade-offs. State the recommended one first.
4. **Clarify**: questions ONE at a time, each with context and a recommendation.
5. **Wait for explicit validation.**

## Escape hatch

Trivial task (typo, one-line fix): say so and offer to do it directly, without the ceremony.

## Hand-off

Design validated: switch to `/step-by-step` for execution.
