# Decisions — I0-D Seven Choices PaperSurface Experience

Cut: I0-D 七选五 PaperSurface experience
Status: ready for DEV after Claude lite PA + PM compression
Last synced: 2026-05-25 after Claude lite PA + PM compression
Open items from external review: 0

## Objective

Build the first teacher-facing 七选五解析 experience by reusing the
PaperSurface left-article / right-panel frame. The first screen serves讲题:
teacher selects one or more blank chains, sees the article clues highlighted on
the left, and sees the matching correct option highlighted on the right.

This is not a search taxonomy dashboard and not an all-option distractor
analysis surface.

## Locked Product Decisions

### Layout

- Left side: the original 七选五 passage with blanks preserved.
- Right side: A-G option pool.
- Reuse the existing PaperSurface left / right frame for the first version.
- The right panel is a 七选五 option-pool panel, not the reading-choice question
  analysis panel.

### Blank Chain Model

A blank chain is one solving chain for one blank, such as `36 -> B`.

- Each blank chain can be toggled on / off.
- In v1, clicking the correct option in the right option pool toggles the
  chain.
- In v1, the blank marker in the left passage is read-only display. Left-side
  blank-marker click is deferred because PaperSurface currently renders blank
  numbers as plain sentence text, and making them interactive would likely
  require shared renderer changes.
- Multiple chains may be open at the same time: 1, 2, 3, 4, or all 5.
- Clicking an open chain again closes it.
- All closed is a valid neutral state.

### Color Model

- Colors bind to blanks, not to A-G options.
- 36-40 receive fixed, low-saturation colors by question order.
- When a chain is open, its left-side clues and right-side correct option use
  the same color.
- If highlight ranges overlap, the later-opened chain wins visually in v1.
- State for both chains remains active even if one visual range is covered.

### Left Passage Highlighting

When a chain is open, highlight solving clues in this priority order:

1. `mechanismSignals.signalText` with `signalSide: "context"` — strongest on
   the left passage. This covers concrete logical words, reference words, and
   lexical signals that actually appear in the passage. Suggested UI:
   same-color underline or stronger text color.
2. `topicClues` — secondary. This covers topic-field words or chunks. Suggested
   UI: same-color light background.
3. `contextEvidence` — not a normal highlight category. Use only for location,
   audit, and fallback when no mechanism signal or topic clue can be located.

`mechanismSignals` with `signalSide: "option"` must not be searched for or
highlighted in the left passage. Highlight them inside the right-side correct
option card instead. If all mechanism signals for a chain are option-side, the
left passage highlight should rely on `topicClues` first, then
`contextEvidence` only as fallback.

Formal UI terminology must not use "context clue" / "上下文线索". Use:

- position
- sentence role
- solving mechanism
- solving clue
- evidence range

`contextEvidence` means evidence range: where to look. It is not itself a clue
type.

### Blank Marker Display

- Closed chain: show the original blank number, e.g. `36`.
- Open chain: show blank number plus answer label, e.g. `36 · B`.
- In v1 this display state may be read-only; it does not need to be clickable.
- Do not replace the blank with the full option sentence in v1.
- Preserve original exam-passage feel.

### Right Option Pool

- A-G options render as a vertical option pool.
- Wrong / unused options stay plain in v1: no explanation, no warning, no
  tooltip.
- Correct options whose chain is closed show only a very weak affordance, such
  as a subtle dot or hairline border. Do not show the blank number while closed.
  This is acceptable in teacher讲题 context even though it lightly reveals which
  options are answer-bearing.
- Correct options whose chain is open:
  - show same-color highlight
  - show a small blank-number tag, e.g. `37`
  - show one short explanation line derived from `optionFit.fitSummary`
  - offer an in-card details control
- Details expand inside the option card, not in a drawer or separate panel.
- Expanded details may show:
  - full `optionFit.fitSummary`
  - `optionFit.matchedClues`
  - `mechanismSignals`
  - `teachingNote`
- Option-side `mechanismSignals.signalText` should be highlighted within the
  correct-option card text when the chain is open.

### Global Controls

- Provide lightweight `全部显示` and `全部隐藏` controls.
- These controls should not visually dominate the passage or option pool.

### Initial State

- If the URL includes `questionId`, open that chain.
- If a future URL includes both `questionId` and `blankId`, `questionId` wins to
  stay aligned with the existing PaperSurface harness convention.
- `blankId` may be supported later, but it is not required for v1.
- Otherwise all chains are closed by default.

## Data Consumption Decisions

I0-D consumes the existing reviewed analysis fixture:

```text
app/public/paper-assets/paper-2024-jslk-english/analyses/seven-choices-analysis-v1.json
```

Relevant fields:

- `questions[qid].blankId`
- `questions[qid].positionFacet`
- `questions[qid].roleFacet`
- `questions[qid].primaryMechanismFacet`
- `questions[qid].supportingMechanismFacets`
- `questions[qid].mechanismSignals`
- `questions[qid].topicClues`
- `questions[qid].contextEvidence`
- `questions[qid].optionFit`
- `questions[qid].teachingNote`

I0-D should prefer reviewed fields and should not invent UI-only solving clues.
If a reviewed clue cannot be located in the passage text, it may be omitted from
highlighting and recorded as a warning / residual risk; do not synthesize a new
clue in the renderer.

### Text Matching Strategy

- `topicClues` matching: highlight all visible occurrences in the passage.
- Heading paragraphs count as visible passage text and may be highlighted.
- If a clue cannot be found, skip that clue and record a warning / residual
  risk; do not invent replacement highlight text.
- `optionFit.correctOptionText` is a non-contract convenience field in the first
  fixture. UI must derive option text from `paper-asset.json` `optionBank` by
  `optionFit.correctOptionLabel`.

## Architecture Lean

Preferred first implementation shape:

- Reuse PaperSurface frame.
- Add seven-choices-specific adapter / panel / host branch as needed.
- Do not rewrite shared PaperSurface renderer unless impossible.
- Keep reading-choice analysis behavior unchanged.
- Treat 七选五 option-pool panel as a typed right-panel experience, not a
  reading-choice option-analysis variant.

## Open Decisions For PA

- None.

## Claude Lite PA Compression

Claude lite PA returned `APPROVE WITH MUST FIX` with 2 Must Fix items and 3 Open
PO Decisions. PM / PO accepted the following resolutions:

- MF-1: `signalSide` rendering rule added. Context-side signals highlight in
  the left passage; option-side signals highlight in the right correct-option
  card.
- MF-2 / OPD-3: choose v1 deferral. Left blank marker is read-only display;
  right option-pool click is the only chain-toggle entry in v1.
- OPD-1: defer search / concierge entry. First DEV slice should prove the
  direct PaperSurface route / fixture experience.
- OPD-2: keep weak closed-correct-option affordance. This is acceptable because
  the surface is teacher-facing解析, not student答题.
- SW-1: text matching strategy recorded above.
- SW-2: URL convention recorded above: `questionId` first, aligned with existing
  harness.
- SW-3: UI must derive option text from paper-asset optionBank, not from
  non-contract `correctOptionText`.

## Moved / Cut

- Wrong-option / distractor explanation mode is out of v1.
- Option-elimination mode is out of v1.
- Search similarity / auxiliary retrieval UI is out of v1.
- Database facet tables are out of v1.
- Import validation changes are out of v1.
- Rewriting `shared/papersurface/**` is not planned for v1 unless PA / DEV proves
  there is no safe host-level path.
