# Delegation: Fable designs, Opus agents implement

Applies when the main session runs on a Fable model. Goal: spend the expensive context on analysis,
plans and review, not on execution.

## Split

**Fable (main session) keeps:** analysis, action plans, mockups, questions to the user, briefs,
review of agent hand-backs, memory updates, trivial edits (one file, a few lines), and all PR
mechanics (mark ready, merge, branch deletion, retarget, rebase) because agent sessions are denied them.

**Opus agents (`Agent` with `model: "opus"`) do:** every implementation step of a validated plan:
code, tests, docs, screenshots, browser checks. One agent per step or per PR, resumed with
`SendMessage` so it keeps its context. Agents commit and push their own branch and open a draft PR.

Planning and design are never delegated, even for research-heavy plans.

## Brief format (every agent gets this)

1. Goal in one sentence, and what is explicitly out of scope.
2. Files and docs to read first (paths), decisions already made, patterns to reuse.
3. Steps, in order.
4. Acceptance criteria as a checklist. The agent reports each item as done, failed or skipped.
5. "Run lint and tests, quote the output in your report. Report doubts, do not resolve them silently."

## Verification before telling the user "done"

- [ ] Every acceptance item reported, none silently missing.
- [ ] `git diff --stat` read, plus the key files, compared against the brief: no scope creep,
      no invented names, conventions matched.
- [ ] Test and lint output quoted by the agent, green. "Should pass" is a failed hand-back.
- [ ] Doubts raised by the agent answered or surfaced to the user.

A hand-back that fails a check goes back to the same agent with the exact gap, not to a new one.
