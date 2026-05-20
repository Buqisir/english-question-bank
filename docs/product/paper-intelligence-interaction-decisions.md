# Paper Intelligence Interaction Decisions

Date: 2026-05-18
Status: accepted for current MVP direction
Scope: Paper Intelligence preview / teaching analysis / assembly basket bridge

## One Sentence

Paper Intelligence is one page with two tasks: teaching is primary, selection is secondary.

The page should first feel like a teacher is reading and explaining a paper. Selection support, including passage insight and add-to-basket, should be present but lightweight.

## Product Roles On The Page

| Surface | Primary job | Product rule |
| --- | --- | --- |
| Left panel | Paper-like reading flow | Preserve `passage -> questions` as the main reading experience. |
| Right panel | Question teaching analysis | Always show the current question analysis; do not switch the whole panel into another mode. |
| Evidence line | Explain why the answer is grounded | Connect one right-side analysis anchor to one left-side evidence mark. |
| Passage insight | Help decide whether this passage is worth selecting | Keep it near the passage header as a compact, optional support layer. |
| Assembly basket | Capture selected passage question groups | Keep add-to-basket in the passage header; deeper basket management stays outside PI. |

## Decisions

### 1. Teaching Comes First

The main interaction is:

1. Read passage on the left.
2. Click a question.
3. See the full question analysis on the right.
4. Follow the evidence highlight and dotted line back to the passage.

Selection features must not interrupt this loop.

### 2. Left Panel Uses Paper-Like Flow

The left panel should be ordered as:

```text
Passage Header
Passage Body
Question 1
Question 2
Question 3
...
```

Do not place large AI report blocks between the passage body and the questions.

Removed from the default left document flow:

- inline load panel
- inline outline panel
- inline key chunk panel
- old V0 detail rows

Questions remain clickable, but active state should be lightweight. Use a small question-number signal, left accent, or `aria-current`; avoid large selected cards that dominate the paper flow.

### 3. Right Panel Uses Option-Integrated Analysis

The right panel is not a report document. It is the teaching surface for the active question.

Required structure:

```text
Q number / type / answer
Stem
Option A block
Option B block
Option C block
Option D block
Question navigation
```

Each option block should contain:

- option label
- English option text
- Chinese explanation or teaching note
- correctness / distractor status

The correct option block should include synonym or locating transformation when available.

Do not repeat the full evidence quote on the right. The quote belongs to the left passage highlight. The right block provides the analysis anchor.

### 4. Evidence Line Source Moves To Option Blocks

The evidence line source anchor should live on the right-side option block:

```html
data-pi-evidence-id="..."
data-pi-evidence-kind="support|trap"
data-pi-question-id="..."
data-pi-option-label="A|B|C|D"
```

Rules:

- one active question at a time
- one active evidence id at a time
- one line at a time
- text-only distractors are not clickable line sources
- left-side `mark[data-pi-evidence-id]` remains the target
- small-screen and reduced-motion behavior must not regress

### 5. Passage Insight Is Selection Support

Passage insight is valuable because this page also supports question-group selection. It should not be removed, but it should not be a permanent block in the paper flow.

Current accepted pattern:

```text
Passage Header:
[A] Passage Title   [洞察：负荷轻 · 证据适中 · 词块 6]   [加入草稿卷]
```

Default state:

- collapsed
- compact chip in the passage header
- no vertical space in the document flow beyond the chip

Expanded state:

- header-anchored popover
- does not push the passage body down
- closes through `收起洞察`, `×`, `Esc`, or clicking a question
- only one passage insight open at a time

The full insight panel may contain:

- load overview
- passage outline
- key chunk summary

It must not replace the right-side question analysis panel.

### 6. Do Not Add A Right Panel Mode Switch

Rejected for the current MVP:

- `Question Analysis` / `Passage Insight` tab switch in the right panel
- global `activePanelMode`
- manual mode switching between teaching and insight

Reason:

The right panel is the line source and teaching analysis surface. Switching it away breaks the teacher's current question context and makes the evidence line harder to reason about.

### 7. Basket Bridge Boundaries

Paper Intelligence may ask App to add a passage question group by `questionGroupId`.

Paper Intelligence must not import or know:

- `usePaperDraft`
- `QuestionGroupCard`
- `questionGroupById`
- paper assembly internals

App owns:

- `questionGroupId -> QuestionGroupCard`
- basket mutation
- localStorage persistence

Paper Intelligence owns:

- passage-level add button state
- add button copy
- toast feedback
- not disturbing active question / evidence line when adding

### 8. State Boundaries

Accepted state shape:

```ts
activeQuestionId: string | null
activeEvidenceId: string | null
activeInsightSection: string | null
```

State meanings:

- `activeQuestionId`: primary teaching state
- `activeEvidenceId`: secondary line focus inside the active question
- `activeInsightSection`: optional selection-support popover

Do not introduce:

- `activePanelMode`
- global tab state
- multi-open insight `Set<string>` for the current MVP

### 9. Cut History

| Cut | Result |
| --- | --- |
| Cut A | Paper Intelligence route moved into App shell; `questionGroupId` bridge added. |
| Cut B | Passage add-to-basket button and Assembly Basket localStorage persistence added. |
| Cut C | Return-to-workbench top bar and QA smoke strengthened. |
| Cut D1 | Paper-like flow, option-integrated right analysis, insight chip/popover. |

### 10. PaperSurface Structure Brace

The PaperSurface route may show a Structure Brace (`结构钩`) as a quiet orientation marker for passage structure. It is not an analytics surface.

PO QA contract:

- See `docs/product/paper-surface-c5b-po-qa-contract.md`.
- That contract is the source of truth for C5b visual acceptance and forbidden regressions.

Product rules:

- The Structure Brace points to a whole passage body or one confirmed paragraph.
- It uses C5a `passageStructure` paragraph ids such as `A-P1`; it must not invent paragraph ids.
- The paragraph controls live inside the open passage structure detail panel, replacing text-only segment rows. They do not appear on the collapsed main rail.
- The brace is drawn in the white `.ps-page` left padding, not in the gray matte and not over passage text.
- The brace is visible only at desktop widths where the expanded rail cannot cover the paper padding: `>=1360px`.
- At `<=1359px`, the paragraph controls still work and scroll the paper, but the brace is hidden. Do not force it visible with z-index.
- The brace and evidence line may coexist. The brace is orientation furniture; the evidence line is teaching proof.
- PaperSurface remains dumb. The harness queries existing `data-paper-section` and `data-paper-paragraph-id` anchors and owns all brace state.

Reason:

Browser QA showed that tight desktop widths can put the expanded left rail over the paper padding. Hiding the brace at `<=1359px` is the accepted product decision. Re-opening this requires a new rail layout decision, not a z-index tweak.

## Current Merge Baseline

PR #18 merged into `main` as Cut D1.

Acceptance already verified after merge:

- `npm run build`
- `scripts/verify-paper-intelligence-cut-d1.mjs`
- `scripts/smoke-paper-intelligence-preview.mjs`

## Future Watchlist

These are known follow-ups, not blockers for the current MVP:

1. Clean obsolete CSS rules no longer used by the option-integrated panel.
2. Consider a more explicit Chinese option translation field if the report schema can provide one.
3. Improve insight popover overflow handling near the right edge or on narrow screens.
4. Decide whether `草稿卷 N` should become a basket preview entry in a later cut.
5. Keep adding visual sketches before large interaction cuts.

## Working Agreement

Before large interaction cuts:

1. Produce a visual wireframe or interaction diagram.
2. Review the design direction before coding.
3. Split implementation into small cuts.
4. Run build, verify scripts, and live smoke before merge.

This reduces rework and keeps product, frontend architecture, QA, and implementation aligned.
