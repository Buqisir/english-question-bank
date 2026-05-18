# PaperSurface Interaction Model

PaperSurface is the **interactive teaching paper substrate** for the
paper-intelligence feature. It renders a real exam page, exposes
anchor points that other layers can attach to, and emits focus
intent. It does **not** own teaching content, model calls, persistence,
or panel layout.

This ADR locks down the boundary so future cuts (B3 PaperSurface
Module, C-series annotation work, D-series passage insights, basket /
export integration) cannot quietly grow PaperSurface into a generic
teaching engine.

Issue reference: `#21-B1.5 PaperSurface Interaction Model ADR`.

## Context

The visual spike (#21-A1), the gate cleanup (#21-B0), and the A-thin
shared primitive tokens (#21-B1) landed a working PaperSurface
prototype at:

```text
?view=paper-intelligence&paperId=paper-2024-xkb1-reading&surface=paper
```

with shared primitives in `shared/papersurface/tokens.mjs` and
follow-up notes in `docs/paper-surface-spike-follow-up.md`.

A product / front-end review then enumerated the entries PaperSurface
will eventually have to host: question explanations, evidence
sentences, long-sentence walkthroughs, derived words, compound words,
phrase chunks, familiar-word-new-meaning entries, synonym
substitutions, passage insights, and draft-paper selection state.

The risk is obvious: PaperSurface either grows into a content engine
that owns every teaching-language feature, or it tries to surface every
entry simultaneously and the page stops looking like a paper. Both
outcomes break the core posture (passage-first, teacher-operable,
evidence-before-feature-excitement).

This ADR records the architectural decisions that prevent that drift.

## Considered Options

- **Let PaperSurface grow organically per cut.** Easiest in the short
  term, but each new entry adds a new bespoke surface API
  (long-sentence anchor, derived-word anchor, chunk anchor, ...) and
  the substrate slowly becomes the place where teaching content gets
  rendered.
- **Lock PaperSurface as a substrate now, push content out.** Slightly
  more friction per cut, but the substrate stays small, the entries
  stay swappable, and the right panel stays the single content slot.
  Picked.

## Decision

### 1. PaperSurface positioning

PaperSurface is the **interactive teaching paper substrate**.

PaperSurface owns:

- real paper-style layout and typography,
- paragraph / sentence / evidence / question / option anchors,
- baseline visual treatment for selection and active state,
- `data-*` anchors that other layers can address,
- emitting focus intent outward.

PaperSurface does **not** own:

- how a long sentence is explained,
- how a derived word is explained,
- how a compound word is decomposed,
- how a phrase chunk is taught,
- which model produced any explanation,
- how the right-side panel is organized,
- fetch / model calls / persistence / basket / export.

In short: **PaperSurface does not fetch, does not run model calls,
does not persist anything, and does not render explanation content.**
Those responsibilities live behind the focus-intent boundary, in
adjacent feature modules.

### 2. TextMap / AnnotationModel layering

Two distinct layers, distinct responsibilities. **TextMap and
AnnotationModel are layered** — the substrate consumes both, but
neither is rendered by PaperSurface as content.

#### `PaperTextMap` — pure read-only position map

May contain:

- paragraph,
- sentence,
- token,
- range / offset,
- anchor key.

Must not contain:

- active state,
- selected state,
- hover state,
- explanation payload,
- teacher-facing explanation content.

That is, **TextMap does not contain active, selected, or hover
state.** TextMap is a coordinate system, not a UI state holder.

#### `PaperAnnotationModel` — teaching annotation layer

May contain:

- long sentence,
- derived word,
- compound word,
- phrase / chunk,
- familiar-word / new-meaning,
- synonym,
- evidence-support,
- evidence-trap.

Constraints:

- An annotation does **not** carry its own independent offset.
  **Every annotation references a TextMap anchor.**
- Annotation payload (the explanation, the model output, the teacher
  notes) is **not rendered by PaperSurface**. PaperSurface only shows
  the annotation anchor and emits focus intent when the anchor is
  activated.

This keeps the substrate language-agnostic. Long sentence, derived
word, compound word, phrase chunk, familiar-new-meaning, synonym all
flow through the same channel; PaperSurface does not learn a new API
per teaching feature.

### 3. Data fine, rendering restrained

The data model may evolve to full-text token granularity. The DOM
must not.

In the DOM, PaperSurface emits only:

- paragraph anchor,
- sentence anchor,
- evidence anchor,
- question anchor,
- option anchor.

Token-level information lives in TextMap only. Token / phrase spans
get wrapped in DOM only when an annotation actually targets them — and
only at that local position. **The DOM is not full-text token-level
wrapped.** A 300-word passage does not produce 300 `<span>`s.

One-liner: **data can be word-precise; the DOM only thickens where
interaction is actually attached.**

### 4. Entry / visual restraint

The page must keep looking like a paper. Entries surface in layers as
the reader naturally reaches them, not all at once.

#### First layer (always-on)

Capped to:

- question number,
- question stem,
- options,
- basket / question-group state,
- light active-question indication,
- evidence highlight for the current question.

Not allowed in the always-on layer:

- derived-word badges,
- compound-word badges,
- per-sentence icons / long-sentence icons,
- bulk word-chunk highlights.

#### Second layer

Surfaces only under the current focus / mode.

#### Third layer

A **single right-panel slot**. Explanation content lives there, one
slot at a time. **No multi-tab panel, no eight stacked sections.** The
**right panel is a single slot**, not a tab navigation surface.

### 5. Two primary modes

PaperSurface has at most two primary modes:

- **Question mode (讲题模式)** — default. Question / option / evidence
  anchors are active. The right panel slot renders Question Analysis.
- **Reading-assist mode (阅读辅助模式)** — explicit opt-in. Sentence /
  chunk / word annotation anchors are active. The right panel slot
  renders Text / Language Analysis.

Rules: the **two modes** are **Question (讲题) and Reading-assist
(阅读辅助)**. Switching between them is **explicit** — never inferred
from where the user clicked. A mode switch must not change the overall
layout. It changes only:

- which anchors are clickable,
- what the right panel slot renders.

### 6. Focus state direction

Long-term, focus collapses to a single union:

```ts
type ActiveFocus =
  | { kind: 'question'; questionId: string }
  | { kind: 'option'; questionId: string; optionLabel: string }
  | { kind: 'text-annotation'; annotationId: string }
  | { kind: 'passage-insight'; paperSection: string }
```

Short term, the existing fields can stay:

- `activeQuestionId`,
- `activeEvidenceId`,
- `activeInsightSection`.

Recommended evolution:

1. Centralize "switching focus deactivates the others" into a
   reducer.
2. Then collapse to the `ActiveFocus` union.

In all cases, **PaperSurface does not own active state.** It receives
focus as props and **emits focus intent** outward; the active state
lives in the host feature shell.

### 7. B3 PaperSurface Module anchor reservations

B3 (the formal PaperSurface Module cut) must reserve these `data-*`
anchors up front, even where the feature behind them has not been
built yet:

- `data-pi-paper-section`
- `data-pi-paper-paragraph-id`
- `data-pi-paper-sentence-id`
- `data-pi-question-id`
- `data-pi-option-label`
- `data-pi-evidence-id`
- `data-pi-evidence-kind`
- `data-pi-text-annotation-id`
- `data-pi-text-annotation-kind`

Constraints on B3:

- **B3 must already emit `data-pi-paper-sentence-id` (the sentence
  anchor)** even though no reading-assist UI consumes it yet. The
  anchor is cheap; retrofitting it later is not.
- B3 must **not** emit a token span per word in the passage body.
- B3 must not invent a per-feature surface API. Long sentence, derived
  word, compound word, phrase chunk, familiar-new-meaning, synonym
  substitution all share a **single unified text-annotation channel**:
  `data-pi-text-annotation-id` + `data-pi-text-annotation-kind`. There
  is one annotation channel, not six.

### 8. Out of scope for PaperSurface

PaperSurface explicitly does not do:

- model calls,
- fetching business data,
- rendering annotation content,
- long-sentence explanation text,
- derived-word explanation text,
- compound-word explanation text,
- basket / draft / persistence,
- export / PDF business logic,
- mode-switch UI chrome,
- tab navigation / multi-panel layout,
- full-token DOM rendering,
- popover content.

Anything in this list belongs to a sibling module. PaperSurface
reaches them through focus intent, not through inheritance.

## Consequences

- B3 (PaperSurface Module) ships with the anchor set in section 7 and
  the substrate-only API surface in section 1. It does not ship a
  text-annotation feature; it ships the channel that text-annotation
  features will plug into later.
- C-series cuts (long sentence, derived / compound words, chunks,
  familiar-new-meaning, synonyms) implement themselves as
  text-annotations against TextMap anchors and render their content in
  the right panel slot. They do not extend the PaperSurface API.
- D-series passage-insight cuts attach via `data-pi-paper-section` and
  the `passage-insight` focus kind. They do not introduce a parallel
  insight surface.
- Basket / draft / export remain outside PaperSurface and continue to
  live in their existing modules. PaperSurface only exposes question /
  option anchors that those modules can read.
- The right panel becomes a single content slot driven by the active
  focus + mode. Future tabs, if any, live above the slot, not inside
  PaperSurface.
- Verification of this ADR is doc-only:
  `scripts/verify-paper-surface-interaction-model-doc.mjs` asserts the
  decisions above are present in this file. No runtime, no install,
  no build, no Vite dev server, no Playwright.
