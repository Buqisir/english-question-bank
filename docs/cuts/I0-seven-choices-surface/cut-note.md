# Cut Note — I0-D Seven Choices PaperSurface Experience

Date: 2026-05-25
Branch: `codex/h5-a-post-merge-audit`

## Shipped

- Added a direct PaperSurface experience for `group-2024-jslk-seven-choices`.
- The harness now detects `sevenChoices` paper-asset groups and loads
  `analyses/seven-choices-analysis-v1.json` instead of the reading-choice
  analysis file.
- Left side keeps the original 七选五 passage with blanks preserved.
- Right side renders an A-G option pool.
- Correct options toggle their blank chain on/off; multiple chains can stay
  open; `全部显示` and `全部隐藏` are available.
- Open chains render:
  - same-color option card highlight
  - blank-number answer overlay such as `37 · G`
  - left-side solving clue overlays from reviewed `topicClues` and
    context-side `mechanismSignals`
  - option-side `mechanismSignals` highlighted inside the option card
  - in-card detail sections for matched clues, mechanism signals, and
    teaching note
- Wrong options remain plain in v1.
- Reading-choice PaperSurface keeps its existing right-panel and evidence-line
  behavior.

## Implementation Notes

- Did not touch `shared/papersurface/**`,
  `app/src/shared-ui/papersurface/PaperSurface.tsx`, or
  `app/src/shared-ui/papersurface/PaperSurface.css`.
- Left highlights are host-owned overlays built from DOM Range rectangles over
  PaperSurface sentence anchors. This avoids a shared renderer change and also
  avoids relying on CSS Custom Highlight API support.
- The first browser QA found that the in-app browser does not expose
  `CSS.highlights` / `Highlight`; the implementation was changed to absolute
  overlay marks.
- The first browser QA also found the stacked-mode left rail covered the
  seven-choices panel title. Added a small stacked-mode left padding for the
  seven-choices panel.
- Preserved the previous paper-asset latest/root fallback semantics: if latest
  analysis is missing, the harness can still fall back to root fixtures.

## Verification

- `node scripts/verify-i0c-seven-choices-analysis-v1.mjs --self-check` passed.
- `node scripts/verify-i0c-seven-choices-analysis-v1.mjs` passed.
- `node scripts/verify-i0d-seven-choices-surface.mjs` passed.
- `npm run build` in `app/` passed.
- `git diff --check` passed.
- `npm run lint` was attempted and still fails on existing repo-wide lint debt
  (App.tsx, existing PaperSurface/reading-analysis hooks, draft-paper/my-space,
  etc.). The I0-D-specific hook lint issue found during the attempt was fixed.

## Browser QA

- Direct seven-choices route without `questionId`: panel loads, 7 options
  render, all chains closed, no overlays.
- Direct seven-choices route with `questionId=q-2024-jslk-037`: exactly one
  chain opens, `37 · G` overlay appears, left clue overlays appear.
- Toggling correct option B opens/closes only the 36 chain.
- Expanded details show matched clues and teaching note; q37 has no mechanism
  signal block because the reviewed analysis has no mechanismSignals for that
  blank.
- `全部显示` opens all five chains and shows `36 · B`, `37 · G`, `38 · A`,
  `39 · F`, `40 · D`.
- `全部隐藏` clears all option highlights and left overlays.
- Wrong options remain plain and never open.
- Option-side signal `If` for q36 highlights in the option card; it is not
  searched as a passage-side signal.
- Existing Reading D route still renders the reading-choice analysis panel,
  active correct option, and evidence line.

## Residual Risk

- The overlay approach depends on PaperSurface sentence anchors and DOM Range
  geometry. It avoids shared renderer edits, but future PaperSurface DOM
  restructuring should re-run the I0-D browser QA matrix.
- Overlay marks are visual highlights only; they are intentionally
  `aria-hidden` in this v1 teacher-facing surface.
