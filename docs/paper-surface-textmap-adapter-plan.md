# PaperSurface TextMap / AnnotationModel Adapter Plan (Issue #21-B2)

> Status: **Locked planning note.** Documentation-only. No runtime
> code is introduced or changed by this plan. PaperSurface itself is
> not built here; this file answers, in advance, how the data the
> production PaperSurface needs will be _materialised_ from the data
> we already have on disk.
>
> Companion docs:
> - `docs/adr/0003-paper-surface-interaction-model.md` — the B1.5
>   locked design note that defines the contract this plan adapts
>   onto.
> - `shared/papersurface/types.d.ts` — the types-only sketch this
>   plan keeps in lockstep. Where this doc says "the type", it
>   means the type declared there.
> - `shared/papersurface/anchorKeys.mjs` — the frozen neutral
>   `data-paper-*` anchor protocol PaperSurface emits.
>
> Companion verify:
> - `scripts/verify-paper-surface-textmap-adapter-plan.mjs` — locks
>   the assertions in this plan so a later draft cannot drop a
>   constraint silently.

## 0. Why this plan exists

This plan introduces no runtime code; it is documentation-only and
does not change runtime behaviour. B1.5 fixed the PaperSurface contract: `PaperTextMap`,
`PaperAnnotation`, `PaperSurfaceFocusState`, `FocusIntent`. What it
deliberately did NOT answer was **where the bytes come from**. The
existing data sources are:

1. **Paper Intelligence reports** (`PaperIntelligenceReport`,
   schema V0). These are the curated AI-generated reports under
   `app/public/reports/paper-intelligence/<paper>/report.json`,
   paired with an `input.json` that carries the original passage
   bodies. This is what the PI host renders against today.
2. **Assembly Basket / 草稿卷** (`BasketItem`, `QuestionGroupCard`,
   `QuestionGroupDetail` in `app/src/domain/questionBank.ts`). This
   is the workspace data the teacher composes a paper out of —
   typically without any AI-generated annotation pack attached.
3. **reading-analysis** (`?surface=reading-analysis`). The current
   sentence-anchor / evidence-link prototype, which already ships
   its own `data-ra-*` namespace and its own
   `ReadingAnalysisFixture`.

PaperSurface needs ONE shape (`PaperTextMap` + `PaperAnnotation` +
`PaperQuestion`) regardless of which of those three the bytes came
from. This plan locks the three adapter paths so B3+ can build
PaperSurface against frozen mappings instead of inventing them at
implementation time.

## 1. Invariants this plan rests on

These are restated from B1.5; they are NOT debated here.

- **TextMap is a position map, not a state map.** It maps the
  rendered paper text to addressable nodes (`paragraph` →
  `sentence` → optional `token`). PaperTextMap does NOT depend on
  evidence. A paper with no evidence at all (e.g. a freshly
  composed 草稿卷) MUST still produce a valid PaperTextMap.
- **Annotation references TextMap.** `PaperAnnotation.range` is a
  `PaperTextRange` (`sentenceId` + `start` + `end`) that points
  into the TextMap. Annotations DO NOT store independent character
  offsets.
- **Annotation payload is host-owned.** PaperAnnotation carries no
  explanation payload on the record. Teaching content
  (`why-worth-teaching`, key expressions, lex / gram points) is
  loaded by the host through a separate teaching-flow lookup keyed
  by `annotation.id`. PaperSurface only consumes the anchor and
  the focus intent.
- **PaperAnnotation is scope-safe.** `scope: 'question'` requires
  `questionId: string`. `scope: 'passage'` forbids `questionId`.
  This is a structural rule (`shared/papersurface/types.d.ts`),
  not a comment.
- **Annotation kind is one taxonomy.** The v1 kinds are
  `long-sentence`, `derived-word`, `compound-word`, `phrase-chunk`,
  `familiar-new-meaning`, `synonym`, `evidence-support`,
  `evidence-trap`, `discourse-structure`, `culture-context`.
  Adapter implementations MUST map their source-shape categories
  onto this set; they MUST NOT invent a parallel kind.

## 2. PI report / input → PaperTextMap

This is the richest source. The Paper Intelligence pipeline already
emits (per paper):

- `report.json` — `PaperIntelligenceReport` with `passages[]` and
  per-passage `questions[]`, `keyChunks`, `passageOutline`,
  `loads`, `aiInitialBand`.
- `input.json` — companion file carrying `passageBody` per
  `paperSection`. The PI evidence audit script and the existing
  evidence adapter (`features/paper-intelligence/evidence`)
  already consume this.

### 2.1 Section, paragraph, sentence

- Each `PassageReport` becomes one **section** in the TextMap.
  `passageReport.paperSection` → `PaperTextParagraph.section`.
  Sections are typically `'A' | 'B' | 'C' | 'D'`, but the TextMap
  treats `section` as an opaque string — adapters MUST NOT special-
  case the four-letter convention.
- `passageBody` (from the companion `input.json`, accessed through
  `AdapterOptions.bodies` in the existing evidence adapter
  signature) is split into paragraphs by blank-line boundary. Each
  paragraph becomes one `PaperTextParagraph`.
- Each paragraph is split into sentences. Sentence segmentation is
  the single source of `PaperTextSentence.id` and the addressable
  unit `PaperTextRange` references. The B2 plan does NOT pick a
  segmenter implementation; it locks the contract that segmentation
  is **deterministic and idempotent** for a given `passageBody` so
  repeated TextMap builds are byte-identical.
- `tokens` are optional. The B2 plan deliberately leaves
  tokenisation deferred — `PaperTextSentence.tokens` MAY be empty.
  Annotations whose `range` aligns to a sub-sentence span use
  `(sentenceId, start, end)` directly.

### 2.2 Question id, stem, options

- `PaperQuestion.id` is built from `(paperSection, questionNo)`
  exactly the way the existing PI adapter builds evidence ids
  (e.g. `A-21`). The questionNo comes verbatim from
  `QuestionAnalysis.questionNo`; the section comes from
  `QuestionAnalysis.paperSection`.
- `PaperQuestion.questionNo`, `stem`, `stemTranslation` map
  directly from the same `QuestionAnalysis` fields.
- `QuestionAnalysis.options` (when present) maps to
  `PaperQuestion.options` as
  `{ label: option.label, text: option.content }`. Translations are
  not part of the V0 PI option schema; `PaperQuestionOption.translation`
  remains `undefined` until a future PI schema bump emits it.
- The legacy V0 case where `options` is absent maps to
  `options: []`. PaperSurface treats an empty option array as "no
  options to render" — it does NOT fall back to scraping options
  out of the stem.
- Correct answer (`QuestionAnalysis.answer`), distractor analysis,
  synonym summary, and `answerEvidence.explanationZh` are NOT part
  of `PaperQuestion`. They stay host-owned and are loaded by
  Question Analysis when a question is focused. This protects the
  left-column wire payload from leaking the answer key.

### 2.3 Evidence as an annotation source

The existing evidence adapter (`toEvidenceModel(report, {bodies})`)
already projects PI report rows onto `EvidenceItem`. This is the
seam the PaperSurface adapter reuses:

- Each `EvidenceItem` with `evidenceKind === 'support'` and a
  resolvable `quote` projects into a `PaperEvidence` row
  (`kind: 'support'`) AND, when the quote is part of the curated
  teacher pack, into a question-scoped `PaperAnnotation` with
  `kind: 'evidence-support'` and the matching `questionId`.
- Each `EvidenceItem` with `evidenceKind === 'trap'` and a
  resolvable `quote` projects into `PaperEvidence` (`kind: 'trap'`)
  and a question-scoped `PaperAnnotation` with
  `kind: 'evidence-trap'`.
- The two channels (PaperEvidence vs PaperAnnotation) carry
  overlapping but distinct purposes: PaperEvidence is the
  lightweight geometry channel lecture-mode dotted lines paint
  against; PaperAnnotation is the teaching-pack record the right
  panel reads. Adapters keep both for support/trap rows that the
  curated pack chose to teach. They keep ONLY PaperEvidence for
  rows the pack did not pick up.
- Evidence audit failures (quote that doesn't resolve verbatim
  against `passageBody`) MUST drop the row from BOTH channels for
  this paper. PaperSurface never paints a placeholder line.

### 2.4 TextMap does NOT depend on evidence

The PI adapter MUST emit a usable `PaperTextMap` even when:

- the report has no evidence rows that resolve verbatim, or
- the companion `input.json` is missing (the adapter raises
  `passageBody: null` per the existing evidence adapter contract,
  which means TextMap is empty for that section but the surface
  still renders the questions).

PaperTextMap, PaperEvidence, and PaperAnnotation are three
independent channels. The adapter does not gate any one of them on
the presence of another.

### 2.5 Anchor protocol

When PaperSurface renders, the section / paragraph / sentence /
question / option / evidence / annotation nodes carry the neutral
`data-paper-*` attributes from `shared/papersurface/anchorKeys.mjs`.
The adapter does NOT touch DOM; it only emits the data. The DOM
attributes are PaperSurface's responsibility, not the adapter's.

## 3. Assembly Basket / 草稿卷 → PaperTextMap

The Assembly Basket is the workspace path: a teacher composes a
paper from `BasketItem` rows (each one a `QuestionGroupCard` plus
score / sectionTitle / note overrides). The teacher MAY want to
preview such a draft on PaperSurface long before any annotation
pack exists. The B2 plan locks how:

### 3.1 Group → section / paragraphs / sentences

- Each `BasketItem` becomes one section in the TextMap. The
  `sectionTitle` field is presentation chrome (the teacher's
  overridden header label); the addressable identity comes from
  `basketItem.id` (the underlying `QuestionGroupCard.id`).
- The group's passage body (loaded via `QuestionGroupDetail.passage.materialText`
  when the surface upgrades a card to a detail) becomes the
  paragraphs / sentences for that section. Same segmentation rules
  as §2.1.
- Groups whose `groupType` is non-passage (e.g. `cloze`,
  `seven_choices`, `grammar_cloze`, `writing`, `continuation`)
  produce a section with zero or one paragraph; PaperSurface's
  rendering rules for those group types live in B4a's scope, not
  here.

### 3.2 Questions → PaperQuestion

- `QuestionGroupDetail.questions[]` projects onto `PaperQuestion`
  using the same field-by-field mapping as §2.2: `id`, `questionNo`,
  `stem`, options (`label`, `content` → `text`).
- `PaperQuestionOption.translation` is unavailable for basket-
  sourced questions in v1. The field stays `undefined`. A later
  cut MAY pull translations from a parse result (e.g.
  `ReadingParseQuestionGroupResult.questions[].questionTranslation`),
  but the B2 plan does not promise that.
- Correct answers and explanations live in
  `QuestionDetail.answer` / `QuestionDetail.explanation`. They are
  host concerns, not PaperQuestion concerns, exactly as in §2.2.

### 3.3 Annotations and evidence — typically absent

- A 草稿卷 typically has NO `PaperIntelligenceReport`. The basket
  adapter MUST NOT fabricate one. It emits `annotations: []` and
  `evidence: []` and lets PaperSurface render the paper without
  highlights.
- If a draft paper later gets a paired report (e.g. the teacher
  runs PI on a saved Paper Set), the adapter merges by mapping
  `paperSection` → basket section id and falling back to the §2
  PI adapter for the annotations / evidence channels only. The
  TextMap stays under basket-adapter ownership; it is not
  rebuilt from the PI report.

### 3.4 Edit chrome / persistence stays out of TextMap

- The basket draft state — score overrides, sectionTitle, note,
  basket-row drag-reorder, "is this draft saved" state, the
  basket persistence key in `localStorage` — does NOT leak into
  the TextMap. PaperSurface MUST NOT learn about basket
  persistence; per ADR 0003 §11 it MUST NOT know about the
  basket at all.
- The basket adapter sits OUTSIDE PaperSurface. Its job is to
  produce the same `PaperTextMap` + `PaperQuestion` shape the PI
  adapter produces. PaperSurface receives the result and cannot
  tell which adapter built it.

## 4. reading-analysis → PaperSurface

`reading-analysis` is the closest current relative of PaperSurface
reading mode. It already ships its own anchor protocol under
`data-ra-*` and its own fixture shape (`ReadingAnalysisFixture` /
`ReadingAnnotation` / `ReadingAnnotationSidecarEntry`).

### 4.1 `data-ra-*` is frozen for the duration of #21-B

- The 11 known `data-ra-*` attributes (per ADR 0003 §10:
  `data-ra-source-note`, `data-ra-link-source`,
  `data-ra-option-anchor`, `data-ra-quote-anchor`,
  `data-ra-sentence-id`, `data-ra-anchor-id`, `data-ra-kind`,
  `data-ra-correct`, `data-ra-blocked`, `data-ra-entry`,
  `data-ra-group-id`, `data-ra-hit-scope`) stay at their current
  scope.
- No new `data-ra-*` attribute is introduced before B4a, regardless
  of feature pull. Every new attribute is one more compatibility
  surface B4a then has to migrate.
- PaperSurface does NOT copy, mirror, or rename `data-ra-*`. The
  PaperSurface anchor protocol is `data-paper-*` only. Two parallel
  namespaces is the accepted state for the duration of #21-B.

### 4.2 Migration vs long-lived sibling — B4a decision

- B4a MUST decide, as part of its scope, whether
  `reading-analysis` migrates onto PaperSurface (and the
  `data-ra-*` namespace retires) OR remains a long-lived sibling
  surface alongside PaperSurface reading mode.
- The B2 plan does NOT pick the answer. It locks: **B4a cannot
  ship without the answer.** Either choice is consistent with this
  adapter plan; both are documented below so neither requires
  re-discovery later.

### 4.3 If migration is chosen — anchor mapping

When B4a chooses migration, the reading-analysis sentence /
quote-mark experience folds into PaperTextMap and PaperAnnotation
as follows. This mapping is the migration's reference table; it is
NOT a runtime adapter the B2 plan ships.

| reading-analysis source                            | PaperSurface target                                  |
| -------------------------------------------------- | ---------------------------------------------------- |
| `Passage` / `PassageParagraph` / `PassageSentence` | `PaperTextMap` paragraphs / sentences (§2.1 rules)   |
| `TextAnchor.sentenceId`                            | `PaperTextRange.sentenceId`                          |
| `TextAnchor.quote` (verbatim quote)                | resolved to `(start, end)` inside the sentence text  |
| `data-ra-sentence-id`                              | `data-paper-sentence-id`                             |
| `data-ra-quote-anchor` (`<mark>` wrapping a quote) | `data-paper-annotation-id` on the same `<mark>`      |
| `ReadingAnnotation.kind === 'evidence'`            | `PaperAnnotation.kind === 'evidence-support'`        |
| `ReadingAnnotation.kind === 'trap'`                | `PaperAnnotation.kind === 'evidence-trap'`           |
| `EvidenceLink.from.questionId` / `optionKey`       | `PaperEvidence.questionId` (option detail is host)   |
| `data-ra-link-source` / `data-ra-option-anchor`    | `data-paper-question-id` / `data-paper-option-label` |
| `ReadingAnnotationSidecarEntry`                    | one curated `PaperAnnotation` row in the host pack   |

Cross-cutting rules:

- The reading-analysis paragraph-index addressing
  (`paragraphIndex: number`) does NOT survive migration. PaperTextMap
  addresses paragraphs by stable `id`; index-based addressing was a
  reading-analysis-specific shortcut.
- Sidecar entries that were stem-scoped (`optionLabel` absent)
  collapse to `scope: 'passage'` annotations. Option-scoped
  entries collapse to `scope: 'question'` annotations with the
  `questionId` set to the corresponding question id.
- Once migration lands, `app/src/features/reading-analysis` either
  retires entirely or keeps only the pieces PaperSurface does NOT
  cover (e.g. authoring chrome). That decision is part of B4a's
  follow-up; this plan only locks the data shape.

### 4.4 If long-lived sibling is chosen

- `reading-analysis` keeps its own route, fixture, anchor
  protocol, and overlay code. PaperSurface does not consume any
  reading-analysis runtime code.
- The PaperSurface reading-mode panel and `reading-analysis` may
  visually resemble each other; that is acceptable. They MUST NOT
  share state, anchors, or DOM scopes.
- In this branch, the §4.3 mapping is documentation only — it
  describes how a future migration could be done, but no code
  follows it.

## 5. Annotation payload boundary

The annotation pack ships **anchors and metadata only** to
PaperSurface. It does NOT ship explanation payload on the record.

What lives on the `PaperAnnotation` record:

- `id`, `kind`, `range`, `importance`, `scope`, `teachingPriority`,
  `sourceOrder`, plus `questionId` for question-scoped entries.

What does NOT live on the `PaperAnnotation` record:

- `why-worth-teaching` prose,
- key-expression list,
- lexical / grammatical point breakdowns,
- distractor analysis,
- synonym mappings,
- difficulty profile,
- any natural-language Chinese explanation.

How the host loads the payload:

- The right panel keeps a parallel store keyed by
  `annotation.id` (or, when convenient, a payload key the
  annotation references). When a sentence / annotation is focused,
  the host looks up the payload, formats it into the
  Question-Analysis or sentence-teaching-flow view, and renders.
- PaperSurface knows nothing about this store. It only emits
  `FocusIntent` (§6) so the host knows when to load.
- The reason this boundary is firm: the annotation pack wire
  payload otherwise grows linearly with content depth. A record
  with anchors-only is small enough to ship for a whole paper at
  once; a record with embedded prose is not.

## 6. `request-read-this-sentence` is an atomic intent

The `FocusIntent` discriminated union includes
`request-read-this-sentence` as a single atomic intent. It carries
both the target `section` and the target `sentenceId`.

It exists because it expresses, in one message, BOTH:

- (a) **switch the surface into reading mode**, and
- (b) **focus this specific sentence** (with `section` as the
  active passage).

A two-step decomposition (`request-mode` + `request-reading-focus`)
is observably wrong on either ordering:

- If `request-mode` arrives first, the host briefly renders
  reading-mode chrome with the WRONG focus (whatever was last
  cached for that section, or `overview`).
- If `request-reading-focus` arrives first, the host briefly
  applies a sentence focus while the chrome is still in lecture
  mode, which is a half-state the surface never wants to be in.

Carrying mode + focus together lets the host apply both in one
reducer step. PaperSurface never observes the half-state.

This rationale is also embedded as JSDoc in
`shared/papersurface/types.d.ts` against the intent variant. The
two MUST NOT drift; if a future cut decomposes the intent, the
ADR (and this plan) must be superseded explicitly.

## 7. Acceptance + scope guards

What this plan introduces:

- This file (`docs/paper-surface-textmap-adapter-plan.md`).
- A locking verify script (`scripts/verify-paper-surface-textmap-adapter-plan.mjs`).
- Types-only refinement of `shared/papersurface/types.d.ts`
  (scope-safe `PaperAnnotation`, renderable `PaperQuestion`,
  single `PaperAnnotationKind` taxonomy, atomic-intent JSDoc).
- A small allow-list bump in
  `scripts/verify-paper-surface-interaction-model-doc.mjs` so it
  recognises the two new files above as part of the planning
  cut.

What this plan does NOT introduce:

- No PaperSurface runtime in `app/src/`. None.
- No `app/src/features/reading-analysis/` runtime change.
- No `app/src/features/paper-intelligence/` runtime change.
- No `server/` change.
- No `package.json` / `pnpm-lock.yaml` change.
- No CSS change.
- No route change.
- No `PaperSurfacePrototype` runtime change.
- No `PaperIntelligencePreview` runtime change.

## 8. Verify

`scripts/verify-paper-surface-textmap-adapter-plan.mjs` locks the
assertions in this plan. It is documentation-only — it parses this
markdown file and the types file, checks the locked phrases /
shapes, and consults `git diff` to confirm runtime files were not
touched.

The verify script asserts, at minimum:

- this plan exists at the canonical path,
- it covers the **PI report / input → PaperTextMap** adapter path,
- it covers the **Assembly Basket / 草稿卷 → PaperTextMap** adapter
  path,
- it covers the **reading-analysis → PaperSurface** relation
  (frozen `data-ra-*`, B4a decision required, sentence/quote
  anchor mapping documented, no copying of `data-ra-*`),
- it states that **TextMap does not depend on evidence**,
- it states that **PaperAnnotation stores no independent char
  offset**,
- it states that **annotation payload is host-owned, not embedded**
  on the record,
- it documents the **`request-read-this-sentence` atomic-intent
  rationale**,
- the v1 `PaperAnnotationKind` set is the single 10-kind taxonomy
  (single source of truth, no parallel taxonomy in this plan or
  the types file),
- `shared/papersurface/types.d.ts` declares `PaperAnnotation` as a
  scope-discriminated union (question-scope requires `questionId`,
  passage-scope excludes / does not require `questionId`),
- `shared/papersurface/types.d.ts` declares `PaperQuestion` with
  `stem`, `questionNo`, and `options`, and declares
  `PaperQuestionOption` with `label`, `text`, and optional
  `translation`,
- runtime code remains untouched: no edits under `app/src/`, no
  edits under `server/`, no `package.json` / lockfile / CSS
  changes.

Run only:

```
node scripts/verify-paper-surface-textmap-adapter-plan.mjs
node scripts/verify-paper-surface-interaction-model-doc.mjs
git diff --check
```

Do NOT run install / build / lint / dev-server / Playwright /
Vivliostyle for this cut.
