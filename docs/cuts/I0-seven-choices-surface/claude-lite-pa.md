# PA-Lite Review Report — I0-D Seven Choices PaperSurface Experience

Cut: I0-D 七选五 PaperSurface experience
PR: n/a (pre-DEV PA review)
Reviewer: Claude Sonnet 4.6 (external PA-lite)
Model / tool: claude-sonnet-4-6
Date: 2026-05-25

## Baseline Reviewed

- Base branch: github/main
- Head branch: codex/h5-a-post-merge-audit
- Head commit: 13a7dd8 (cherry-pick 2024 jslk source docx)
- Files / diff source: static review of decisions.md, analysis contract, fixture JSON,
  paper-asset.json, PaperSurface.tsx, PaperIntelligencePaperSurfaceHarness.tsx

## Token / Cost Metadata

- Input tokens: not available
- Output tokens: not available
- Estimated cost: not available

## Verdict

APPROVE WITH MUST FIX

Must Fix count: 2
Should Watch count: 3
Open PO Decisions count: 3

## Must Fix

### MF-1: `signalSide` rendering specification absent from decisions.md

The "Left Passage Highlighting" section lists `mechanismSignals.signalText` as
the #1-priority passage highlight. In the fixture, 3 of 5 blanks have ALL their
`mechanismSignals` on the OPTION side (`signalSide: "option"`):

- q-036: "If" is in option B text, not in passage text.
- q-039: "While" is in option F text, not in passage text.
- q-040: "uncomfortable" is in option D text, not in passage text.

A DEV that follows the decisions literally will search the passage text for
these strings, find nothing (or find false matches in unrelated sentences), and
produce incorrect highlight output.

**Required fix:** Add a rule to decisions.md under "Left Passage Highlighting":
signals with `signalSide: "option"` must NOT be highlighted in the left
passage; they must be highlighted within the correct-option card on the right.
For the left passage, when all `mechanismSignals` are option-side, fall back to
`topicClues` as the primary highlight. Update the right option pool section to
confirm that `mechanismSignals` with `signalSide: "option"` appear as a
highlighted span inside the expanded option card.

### MF-2: Inline blank-marker click-target strategy not specified

Decisions require that clicking the blank marker in the left passage toggles
the chain (e.g., clicking `36` highlights chain 36→B; clicking again closes it).
The current `PaperSurface.tsx` renders sentence text as plain text `<span>`
elements with no support for inline interactive sub-elements. The blank numbers
(`36`, `37`, …) appear as raw text within sentence strings in `paper-asset.json`
(e.g., `"…common mistakes,which can interfere(妨碍)with training or lead to
injury. 36 ,keep these things in mind…"`).

No implementation path is documented that achieves clickable inline blank
markers without modifying `shared/papersurface/PaperSurface.tsx`, which is in
the forbidden scope for this slice.

**Required fix before DEV starts:** Choose and record in decisions.md exactly
ONE of the following approaches:

A. **PO-approved deferral**: In v1, blank-chain toggle is available via the
   right option-pool click only. Left-passage blank markers are read-only text.
   Blank-marker display state (`36` vs `36 · B`) is driven by CSS keyed on
   host state via a data-attribute or CSS custom property on the harness shell.
   This is the simplest path and avoids any PaperSurface change.

B. **Annotation overlay at host level**: The seven-choices host adapter
   produces one `PaperAnnotation` per blank, with character offsets pointing at
   the blank number text inside the sentence. The host registers a custom
   annotation renderer that wraps the blank text in an interactive `<button>`
   or `<span role="button">`. This requires either a render-prop on
   PaperSurface (new, touches shared) or a host-owned overlay component
   positioned via `data-paper-annotation-id` DOM anchors (no PaperSurface
   change, but needs DOM reads in the host, similar to the existing
   StructureBraceOverlay pattern).

C. **Seven-choices host renders its own passage**: The host renders the
   passage text independently (not via PaperSurface's sentence renderer)
   for the left slot, achieving full control over blank markers. PaperSurface
   is not used for the passage column in this slice.

Option A is recommended for v1 given the scope constraint. Record the decision.

## Should Watch

### SW-1: `topicClues` text-matching strategy undefined

`topicClues` are short strings that must be located as substrings in passage
text for highlighting (e.g., `"Common Mistakes New Runners Make"` is a topicClue
for q-036 and appears as the article title). Some clues are headings
(`"Doing too much too soon"` for q-037), some are sentence fragments, some
appear multiple times. The decisions do not specify:

- First-occurrence vs. all-occurrences matching.
- Whether heading paragraphs count as highlightable passage text.
- Fallback when a clue string is not found in the visible passage text.

DEV should document the chosen matching strategy in a verify script or a
brief note in decisions.md before implementing highlights.

### SW-2: URL param key and precedence for initial chain not locked

Decisions state: "If the URL includes a specific `blankId` or `questionId`,
open that chain." Neither the exact URL param key string (e.g.,
`?blankId=...` vs `?blank=...` vs `?questionId=...`) nor which takes
precedence when both are present is specified. The existing harness uses
`questionId` and `groupId` (see `PaperIntelligencePaperSurfaceHarness.tsx`
`initialQuestionId` / `initialGroupId` props). The seven-choices host should
align with this convention or explicitly document a deviation.

### SW-3: `optionFit.correctOptionText` is a non-contract convenience field

The fixture JSON includes `optionFit.correctOptionText` (e.g., `"If you're
just starting out"`) that does not appear in the `seven-choices-analysis-v1`
contract. DEV must derive displayed option text from `optionBank` in
`paper-asset.json` keyed by `optionFit.correctOptionLabel`, not from this
non-contract field. Relying on `correctOptionText` would break if the fixture
is regenerated without it.

## Open PO Decisions

### OPD-1: Search / concierge entry in first PR

Decisions list this explicitly as an open question. PA recommendation: defer
search entry. A direct static route
(`?paperId=paper-2024-jslk-english&groupId=group-2024-jslk-seven-choices&source=paper-asset`)
is sufficient to prove the experience. Concierge entry adds scope without
unlocking any new teacher workflow in v1.

### OPD-2: Weak affordance for closed correct options

Decisions allow "a very weak affordance, such as a subtle dot or hairline
border" on correct options whose chain is closed, so that closed correct
options are visually distinct from distractors. This is teacher-facing only
and does partially reveal the answer mapping (teacher scanning the option
pool can infer which options have correct-answer status). PO should confirm
this is acceptable for the teacher讲题 context, or specify that correct
options in closed state are entirely unstyled (indistinguishable from
distractors) until their chain opens.

### OPD-3: Blank-marker click in v1 (tied to MF-2)

Must Fix #2 requires a product decision: is a clickable blank marker in the
left passage required for the v1 teacher experience, or is the right-side
option-pool click sufficient as the sole chain-toggle entry? Deferring the
left-passage click (Option A in MF-2) unblocks DEV immediately and avoids any
architectural risk in the passage rendering layer.

## Verify / QA Gaps

- No verify script exists for the seven-choices host fixture contract (adapter
  input shape → rendered output). A smoke-test that loads the fixture and
  checks blank-chain state transitions should accompany the first PR.
- The `paper-asset.json` passage text contains whitespace around blank numbers
  (e.g., `" 36 ,"`). The highlight adapter must account for variable spacing
  around blank numbers when computing character offsets.
- q-038 is a heading blank (`•38`): its passage "paragraph" is a heading
  (`para-2024-jslk-seven-h2`). Confirm the left-passage renderer shows this
  as a heading-style blank marker and that the topicClue highlight logic
  correctly targets the body paragraph (`para-2024-jslk-seven-p2`), not the
  heading paragraph.

## Scope Notes

- Allowed scope respected: not applicable (pre-DEV review; no code written yet).
- Forbidden scope touched: not applicable.
- Forbidden-scope audit: no code diff to audit. Confirmed forbidden scope
  (`shared/papersurface/**`, server routes, database schema, import pipeline,
  search/concierge entry, reading-choice behavior) is not addressed in
  decisions.md and is correctly marked as out of scope.

## Decision Sync

- `decisions.md` status update required: yes
- Last synced: 2026-05-25 (PM grill captured)
- Open items from external review:
  - Record signalSide rendering rule (MF-1): left vs right slot per signalSide value.
  - Record blank-marker click-target approach (MF-2 / OPD-3): Option A, B, or C.
  - Record answer for OPD-1 (search entry deferral).
  - Record answer for OPD-2 (closed-correct-option affordance).
  - Add topicClue text-matching strategy note (SW-1).
  - Confirm URL param key convention alignment with existing harness (SW-2).

## Recommendation

The layout model (left passage / right option pool), blank-chain toggle
semantics, color model, and data consumption model are coherent and consistent
with the fixture. The PaperSurface frame can be safely reused for v1 without
touching shared renderer files provided MF-2 is resolved via the option-pool-
only toggle path (OPD-3 Option A).

Two blockers must be resolved in decisions.md before DEV starts: the signalSide
rendering rule (MF-1) and the blank-marker click strategy (MF-2). Both are
documentation gaps, not implementation gaps — they can be resolved in a short
PO/PM sync and recorded in decisions.md with no code changes. Once those two
items are documented, the first DEV slice is ready to proceed within the stated
allowed scope.
