# Decisions — I0-D Seven Choices PaperSurface Experience

Cut: I0-D 七选五 PaperSurface experience
Status: ready for DEV after Claude lite PA + PM compression
Last synced: 2026-05-25 after PM grill field / UI refinement
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
- Track open chains and current focus separately:
  - `expandedQuestionIds`: which chains are currently visible; may contain
    multiple questions.
  - `currentQuestionId`: the last-clicked / focused chain; at most one.
- The expanded set controls which highlights are visible.
- The current question controls the slightly stronger blank marker / option
  card focus treatment.
- If the current chain is closed, focus moves to the most recently expanded
  chain; if no chain remains open, current focus is empty.

### Color Model

- Colors bind to blanks, not to A-G options.
- 36-40 receive fixed, low-saturation colors by question order.
- When a chain is open, its left-side clues and right-side correct option use
  the same color.
- Color identifies the blank chain. Visual style identifies clue strength.
- If highlight ranges overlap, the later-opened chain wins visually in v1.
- State for both chains remains active even if one visual range is covered.

### Left Passage Highlighting

When a chain is open, highlight solving clues in this priority order:

1. `mechanismSignals.signalText` with `signalSide: "context-before"` or
   `signalSide: "context-after"` — strongest on the left passage. This covers
   concrete logical words, reference words, and topic-field alignment chunks
   that actually decide the answer. Suggested UI: same-color translucent
   background.
2. `topicClues` — secondary. This covers broader topic-field words or chunks
   that build the local语境. Suggested UI: same-color dotted underline /
   weak marker.
3. `contextEvidence` — not a normal highlight category. Use only for location,
   audit, and fallback when no mechanism signal or topic clue can be located.

`mechanismSignals` with `signalSide: "option"` must not be searched for or
highlighted in the left passage. Highlight them inside the right-side correct
option card instead. If all mechanism signals for a chain are option-side, the
left passage highlight should rely on `topicClues` first, then
`contextEvidence` only as fallback.

If the same text is both a `topicClue` and a `mechanismSignal`, render the
strong mechanism highlight only. Do not stack both visual styles on the same
range.

`topicClues` are the broad语境 word chunks. `mechanismSignals` are the final
answer-deciding clues. When a blank has no useful logical connector or
referential clue, the core topic-field chunks should move into
`mechanismSignals` and receive strong highlighting.

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
- Open chain: keep the original blank number style; if it is the current chain,
  add a subtle same-color focus treatment around the blank marker / underline.
- In v1 this display state may be read-only; it does not need to be clickable.
- Do not replace the blank with the full option sentence in v1.
- Do not color the underline itself by default; preserve the source-paper blank
  feel.
- Preserve original exam-passage feel.

### Right Option Pool

- A-G options render as a vertical option pool.
- Wrong / unused options stay plain in v1: no explanation, no warning, no
  tooltip.
- Correct options whose chain is closed stay close to original option-pool
  display. Do not show the blank number while closed.
- Correct options whose chain is open:
  - show same-color highlight
  - show a small blank-number tag, e.g. `37`
  - show three facet labels: position, sentence role, and primary mechanism
  - show a `解题线索` block derived from `mechanismSignals`
  - show one short explanation line derived from `optionFit.fitSummary`
  - offer an in-card details control
- Details expand inside the option card, not in a drawer or separate panel.
- Expanded details may show:
  - `topicClues` as `语境词块`
  - full `optionFit.fitSummary`
  - `optionFit.matchedClues`
  - `mechanismSignals`
  - `teachingNote`
- Details must not show distractor explanation in this version.
- Option-side `mechanismSignals.signalText` should be highlighted within the
  correct-option card text when the chain is open. This right-side internal
  highlight should be slightly lighter than left-passage core highlights
  because the card itself already carries color.

The right panel uses the term `解题线索`, not `答案依据`, for
`mechanismSignals`. 七选五 is about fitting the option into空前 / 空后 discourse,
not locating a single evidence sentence.

Signal-source labels should be shown lightly in the `解题线索` block:

- `option` -> `选项`
- `context-before` -> `空前`
- `context-after` -> `空后`

These labels indicate source location only. They are not a fixed solving-step
sequence.

Sort `解题线索` by mechanism priority:

1. Signals whose `mechanismFacet` equals `primaryMechanismFacet`
2. Signals whose `mechanismFacet` appears in `supportingMechanismFacets`
3. Within the same mechanism, order as `option`, `context-before`,
   `context-after`

Do not display `keyDistractors` in this version. Wrong options remain neutral.

### Global Controls

- Provide lightweight `全部显示` and `全部隐藏` controls.
- These controls should not visually dominate the passage or option pool.

### Initial State

- If the URL includes `questionId`, use it only to locate / focus the relevant
  blank or question.
- If the URL includes `analysisOpen=1` together with `questionId`, open that
  chain.
- If the URL omits `analysisOpen=1`, all chains are closed by default.
- If a future URL includes both `questionId` and `blankId`, `questionId` wins to
  stay aligned with the existing PaperSurface harness convention.
- `blankId` may be supported later, but it is not required for v1.
- This separates "open the题面" from "open解析" for the future search-to-analysis
  workflow.

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
- `mechanismSignals.signalSide` uses three values:
  - `option`: the correct option text
  - `context-before`: title / heading / same paragraph before the blank /
    previous paragraph when it establishes the blank's语境
  - `context-after`: same paragraph after the blank / following paragraph when
    it is introduced or completed by the blank
- `context-before` / `context-after` should be judged by discourse function
  relative to the blank, not by same-sentence character position only.
- Each `mechanismSignal` should carry exactly one highlightable `signalText`.
  Multiple words such as `hurts` and `pain` should be separate signals.
- Keep `targetText` as explanatory text. It may name what the signal connects
  to, but it is not required to be independently highlightable.
- If a clue cannot be found, skip that clue and record a warning / residual
  risk; do not invent replacement highlight text.
- `optionFit.correctOptionText` is a non-contract convenience field in the first
  fixture. UI must derive option text from `paper-asset.json` `optionBank` by
  `optionFit.correctOptionLabel`.

### Mechanism Priority

Primary mechanism selection follows teaching priority:

1. Logical connector cohesion
2. Referential cohesion
3. Topic-field alignment

If a blank truly depends on a logical connector or a referential expression,
that mechanism should be primary. Topic-field alignment becomes primary when
there is no stronger logical / referential mechanism. Topic-field alignment can
still be a supporting mechanism in logical / referential blanks.

There are two common grammatical-cohesion directions:

- Option-side signal: the option contains a logical connector or reference
  expression and must fit the before / after context.
- Context-after signal: the sentence after the blank contains a logical
  connector or reference expression, so the inserted option must provide the
  required antecedent or logical setup.

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
