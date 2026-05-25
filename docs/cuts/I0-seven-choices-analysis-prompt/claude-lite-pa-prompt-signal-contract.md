# Claude Lite PA Prompt — I0-C++ Seven Choices Signal Contract

Repo root: `/Users/huangxuewei/Projects/english-question-bank`

You are Claude acting as PA-lite for the 七选五 analysis prompt / contract
hardening draft.

## Hard Routing Rules

1. Work in the repo root above only. Do not use a temp worktree.
2. Review the current working tree, including uncommitted changes.
3. Do not modify any project file except the report path below.
4. Write your report to:

```text
docs/cuts/I0-seven-choices-analysis-prompt/claude-lite-pa-signal-contract.md
```

5. If you cannot access that exact repo root, stop and report the problem in
chat. Do not write the report elsewhere.

## Files To Read

- `docs/cuts/I0-seven-choices-analysis-prompt/decisions.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `prompts/seven-choices-analysis-v1.md`
- `docs/cuts/I0-seven-choices-analysis-prompt/external-ai-input-seven-choices.md`
- `scripts/verify-i0c-seven-choices-analysis-v1.mjs`
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`
- `docs/cuts/I0-seven-choices-surface/decisions.md`

## Context

This review is not asking you to redesign 七选五 analysis from scratch.
The owner and Codex already locked these decisions through PM grill:

- Current page priority: teacher讲题 first; fields also support future search.
- No distractor UI in this version. `keyDistractors` is optional and allowed,
  but not a focus.
- `roleFacet` answers what the inserted sentence does.
- `primaryMechanismFacet` answers how the blank is solved.
- Every blank must have `primaryMechanismFacet`.
- Primary mechanism priority is:
  1. logical connector cohesion
  2. referential cohesion
  3. topic-field alignment
- `mechanismSignals.signalSide` is now:
  - `option`
  - `context-before`
  - `context-after`
- Every blank needs 2-5 `mechanismSignals`.
- Every blank needs at least one option-side signal and at least one
  context-side signal.
- Logical connector blanks must include the connector and at least one logical
  object.
- Referential cohesion blanks must include the reference word and its
  antecedent / referent.
- Topic-field alignment blanks use compact matched chunks as strong signals.
- `topicClues` remains a broad context-side string array, 3-6 items, used for
  weak语境 marking.
- `mechanismSignals` are the strong highlightable solving clues.
- `optionFit.matchedClues` stays for expanded explanation only, not highlight.
- `fitSummary` is 1-2 Chinese sentences explaining why this option fits.
- `teachingNote` is one Chinese sentence naming the transferable solving move.

## Review Questions

Please review only these questions:

1. Are the locked rules internally consistent across decisions, contract,
   prompt, external input, verifier, and fixture?
2. Are any rules too hard for an external AI to satisfy reliably while still
   producing a downloadable JSON file?
3. Do any rules risk dirty or misleading UI highlights in PaperSurface?
4. Does the verifier enforce the right hard constraints without over-policing
   teaching judgment?
5. Is the fixture consistent with the new signal-side and signal-count rules?

## Output Format

Write a concise Markdown report at the report path.

Use:

- Verdict: `READY TO COMMIT`, `APPROVE WITH MUST FIX`, or `NOT READY`
- Must Fix
- Should Watch
- Open Questions
- Final Recommendation

After writing the report, reply in chat with only:

```text
Report path: docs/cuts/I0-seven-choices-analysis-prompt/claude-lite-pa-signal-contract.md
Verdict: <verdict>
Must Fix count: <n>
Should Watch count: <n>
Open Questions count: <n>
```
