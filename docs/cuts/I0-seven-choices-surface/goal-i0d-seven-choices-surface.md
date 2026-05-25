# Goal — I0-D Seven Choices PaperSurface Experience

Date: 2026-05-25
Branch: `codex/h5-a-post-merge-audit`
Cut size: medium
Touches: product boundary, data-contract consumption, teaching interpretation
Claude consulted: yes, PA-lite report accepted and compressed into `decisions.md`

## Goal Prompt

Implement I0-D Seven Choices PaperSurface direct-route experience end to end.

Read first:

- `docs/cuts/I0-seven-choices-surface/agent-entrypoint.md`
- `docs/cuts/I0-seven-choices-surface/decisions.md`
- `docs/cuts/I0-seven-choices-surface/claude-lite-pa.md`
- `docs/cuts/I0-seven-choices-analysis-contract/seven-choices-analysis-v1.contract.md`
- `app/public/paper-assets/paper-2024-jslk-english/paper-asset.json`
- `app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json`

## Scope

Build the first teacher-facing 七选五解析 experience by reusing the existing
PaperSurface left-article / right-panel frame.

The first slice must prove the direct fixture experience for:

- paperId: `paper-2024-jslk-english`
- groupId: `group-2024-jslk-seven-choices`

Expected UX:

- Left side shows the original 七选五 passage with blanks preserved.
- Right side shows A-G option pool.
- Correct options can toggle their blank chain on / off.
- Multiple blank chains can be open at the same time.
- `全部显示` opens all chains.
- `全部隐藏` closes all chains.
- Closed correct options show only a very weak affordance.
- Open correct options show:
  - same-color highlight
  - blank-number tag
  - one short explanation line from `optionFit.fitSummary`
  - in-card details control
- Details show:
  - full `optionFit.fitSummary`
  - `optionFit.matchedClues`
  - `mechanismSignals`
  - `teachingNote`

Left highlighting rules:

- Context-side `mechanismSignals.signalText` highlights strongest on the left.
- `topicClues` highlights as secondary clue marks on the left.
- Option-side `mechanismSignals.signalText` must be highlighted inside the
  right correct-option card, not searched in the left passage.
- `contextEvidence` is only evidence range / fallback / audit. Do not present it
  as "context clue" / "上下文线索".
- If a reviewed clue cannot be located, skip that highlight and keep the UI
  stable. Do not invent replacement clues.

Initial state:

- If URL has `questionId`, open that chain.
- Otherwise all chains are closed.
- `questionId` takes precedence over any future `blankId`.

## Forbidden

Do not implement:

- search / concierge entry
- left-passage blank-marker click
- wrong-option explanation mode
- option-elimination mode
- auxiliary search / similarity UI
- database facet tables
- server routes
- import validation
- answerKey migration

Do not touch unless you stop and escalate first:

- `shared/papersurface/**`
- `app/src/shared-ui/papersurface/PaperSurface.tsx`
- `app/src/shared-ui/papersurface/PaperSurface.css`

Do not change reading-choice behavior.

## Architecture Lean

Prefer host-level implementation:

- seven-choices adapter / view model
- seven-choices right panel
- host state for open blank chains
- local CSS for the seven-choices panel / highlights
- verify script for view-model / fixture mapping if useful

Reuse existing PaperSurface frame where possible, but do not rewrite the shared
renderer for this slice. If left highlight rendering cannot be done without
shared renderer changes, stop and report the blocker instead of widening scope.

## Verification Required

Run and report:

- existing I0-C verifier:
  `node scripts/verify-i0c-seven-choices-analysis-v1.mjs --self-check`
  `node scripts/verify-i0c-seven-choices-analysis-v1.mjs`
- any new I0-D verify script added in this cut
- app build / typecheck command used by this repo
- `git diff --check`

Browser QA required:

- Open the direct PaperSurface route for the seven-choices group.
- Confirm all chains closed by default when no `questionId` is in URL.
- Confirm URL with `questionId=q-2024-jslk-037` opens only 37.
- Toggle one correct option open / closed.
- Toggle multiple correct options open.
- Use 全部显示 / 全部隐藏.
- Confirm wrong options stay plain.
- Confirm option-side mechanism signal highlights only in the option card.
- Confirm left highlights do not destabilize layout.
- Confirm reading-choice PaperSurface still works for an existing Reading A-D
  group.

## Codex CR-Lite Required

Before final response, perform a code-review pass and report:

- findings first, if any
- scope leaks checked
- forbidden files checked
- verification evidence
- browser QA evidence
- residual risk

Write a cut note after DEV finishes:

```text
docs/cuts/I0-seven-choices-surface/cut-note.md
```

## Stop Conditions

Stop and report before continuing if:

- implementation appears to require shared PaperSurface renderer changes
- the direct route cannot load the seven-choices fixture without changing server
  or import behavior
- data contract must change again
- reading-choice behavior regresses
- browser QA cannot be run locally
