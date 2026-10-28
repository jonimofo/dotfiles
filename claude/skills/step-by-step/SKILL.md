---
name: step-by-step
description: Execution mode after a validated design. One step per screen, validated each time. Use when executing a plan or when the user says /step-by-step.
---

# Step by step: one step per screen, validated every time

## Golden rule

ONE step per message. Never the whole sequence in one block.

## Format of every step

1. Step N of M: what I am going to do
2. Why
3. Expected result, and how to verify it
4. `Validate to move to the next step` (AskUserQuestion with the next action as recommended option)

## Progression

- Wait for validation before the next step.
- Flag any improvement spotted on the way as "Separately: ...", do not apply it silently.
- Ambiguity: ONE question at a time, with context.
- A step that invalidates the design: STOP, back to `/design-first`. No improvisation.
- Commands the user runs themselves (deploys, production): give the command, wait for the output.
- Under the delegation rule, each implementation step may be briefed to an Opus agent; the
  screen then shows the brief and, after hand-back, the verification result.
