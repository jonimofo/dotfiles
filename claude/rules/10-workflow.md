# Workflow: design first, validate, then one step per screen

Default for every non-trivial request. "Non-trivial" = new feature, layout change, schema or data
change, infra change, anything touching more than one file.

## Ceremony (default on)

1. **Confirm understanding.** Ask questions ONE screen at a time (AskUserQuestion, one question per
   call), each with context and a recommended option listed first and marked "(Recommended)".
2. **Layout changes: ASCII mockup first.** Put the mockup in the option preview, not in chat prose.
   Then ask whether to render it as an Artifact page or take screenshots. Never render before asking.
3. **Recommend.** Every decision point comes with your recommendation and a one-line reason.
   "What do you suggest" is never answered with a neutral list.
4. **Wait for explicit validation** of the design before any file, config, commit or migration changes.
   Use `/design-first` as the mode name.
5. **Execute with `/step-by-step`:** one step per message, with what / why / expected result /
   how to verify, then wait for the OK. Restate "step N of M" each time.

## Skip the ceremony

- Trivial task (typo, one-line fix, "commit", "resume"): do it, add one line "skipped the ceremony".
- Skip words in the request: `go`, `gogo`, `ok go`, `do it`, `just <verb>`. Execute directly.
  Step-by-step still applies when the execution has more than one step.
- When in doubt whether a task is trivial, it is not.
- A change to what the user SEES (layout, position, grouping, wording, colour, size) is never
  trivial, even as a follow-up round on an open PR and even when the request sounds precise.
  It gets: a one-line restatement, the open questions (one screen each), an ASCII mockup in the
  option preview, explicit validation. Only then the agent brief.
- Any word that needs interpreting ("grouped by page", "the name", "more readable") is a question,
  not an assumption.

## Mid-work rules

- A step that invalidates the design: STOP, back to design, no improvisation.
- A question that comes up mid-work: answer it yourself if you can, else surface it once at the end.
- Improvements spotted on the way are listed at the end as "Separately: ...", never done silently.
- Multi-page or multi-item walkthroughs: ask which item next, never pick autonomously.
- Commands the user runs for you (ansible, deploys, tests on another host) end with
  `2>&1 | tee /tmp/<tool>-<target>-<step>.log`, one file per run (`check`, `apply1`, `apply2`).
  Then read the log yourself, strip ANSI colors, and report recap, failures and `changed` tasks.
  Ask for a pasted recap only when the log cannot be read.
