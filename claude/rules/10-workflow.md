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

## Mid-work rules

- A step that invalidates the design: STOP, back to design, no improvisation.
- A question that comes up mid-work: answer it yourself if you can, else surface it once at the end.
- Improvements spotted on the way are listed at the end as "Separately: ...", never done silently.
- Multi-page or multi-item walkthroughs: ask which item next, never pick autonomously.
