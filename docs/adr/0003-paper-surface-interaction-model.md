# PaperSurface Future Interaction Model (Issue #21-B1.5)

> Status: **Locked design note.** Documentation-only. No runtime code is
> introduced or changed by this ADR. The shapes below are the target
> contract for the eventual production `PaperSurface` module; the
> current `PaperSurfacePrototype` (Issue #21-A spike, mounted at
> `?surface=paper`) does not implement them yet.
>
> Companion docs:
> - `docs/paper-surface-spike-follow-up.md` — the B1 / Gate 2 (A-thin
>   CSS strategy) follow-up gates.
> - `shared/papersurface/tokens.mjs` — the shared primitive token
>   surface introduced in B1.
>
> Companion verify:
> - `scripts/verify-paper-surface-interaction-model-doc.mjs` — locks
>   the decisions in this file so future drafts cannot quietly drop a
>   constraint.

## Context

PR #29 landed the visual paper-surface spike, and Issue #30 / Issue
#21-B1 resolved Gate 1 (`print` → `paper` rename) and Gate 2 (A-thin
CSS strategy via `shared/papersurface/tokens.mjs`). What was still
unresolved was **the interaction model**: what does a teacher do on
this surface, what gets pre-computed, what is editable, what state
does PaperSurface own, what does it merely receive as props.

Issue #21-B1.5 is the design grill that locked those answers. This
ADR records the locked decisions so any future B-level / C-level
implementation work has one canonical reference. None of this is
shipped yet.

## Decision

The decisions below are the locked output of the #21-B1.5 grill. They
are organized by concern, not by file.

### 1. Annotation generation policy

Annotation pack v1 is a **pre-generated curated teacher annotation
pack**.

Concretely:

- Annotations are NOT generated on click. Click-time is display-time.
- Annotations are NOT an unbounded encyclopedic dump over every word
  / phrase / sentence. The pack is a curated subset of "what is worth
  teaching on this paper".
- The Paper Intelligence pipeline pre-generates the pack for the
  paper. The classroom / lesson-prep flow never waits on a model
  round-trip to see an annotation.

v1 audience scope:

- v1 is **teacher-only**. There is no student audience in v1.
- The v1 annotation schema does NOT reserve a `studentAudience` (or
  similarly named) field. If a student-facing variant is later
  pursued, it requires a separate ADR and a schema migration. We do
  not pre-bake hooks for it now.

v1 mutability:

- v1 is **read-only** for the teacher. Teachers cannot edit, hide,
  star, add, or delete annotations on PaperSurface.
- Lesson notes / personal margin annotations are a **separate future
  capability**. They do not enter PaperSurface v1.

v1 export scope:

- The annotation pack serves **on-screen interactive 讲题 / 读文 only**.
- v1 does NOT plumb annotations into export / PDF. Export integration
  is deferred to a later cut.

### 2. Annotation importance and ordering

Each annotation in the pack carries:

```ts
importance: 'core' | 'extended'
teachingPriority: number
sourceOrder: number
```

Display rules:

- Reading mode (读文模式) shows only `core` annotations by default.
- `extended` annotations are folded; they do not permanently clutter
  the page (常驻污染卷面).
- Sort order, in priority: `core` before `extended`, then ascending
  `teachingPriority`, then ascending `sourceOrder` for stability.
- Annotations are NOT bucketed into many sections by `kind` (词汇 /
  句法 / 修辞 / ...). Kind is metadata, not the primary axis of layout.

### 3. Reading mode — overview and sentence focus

Reading mode (读文模式) behaviour:

- Switching to reading mode lands the user on the **passage overview**
  for the current contextual passage.
- Current contextual passage is resolved in this priority order:
  1. The `passage` that owns the active question, if there is one.
  2. The passage closest to the top of the current scroll viewport.
  3. Passage A as a final fallback.
- The right-side reading panel exposes **A / B / C / D passage pills**
  so the teacher can jump between passages explicitly.
- Each passage remembers **its own** reading focus:

```ts
readingFocusBySection: Record<paperSection, ReadingFocus>
```

`ReadingFocus` is a discriminated union:

```ts
type ReadingFocus =
  | { kind: 'overview' }
  | { kind: 'sentence'; sentenceId: string; activeAnnotationId?: string }
```

Passage overview content includes:

- 篇章洞察 — load / structure / lexical-bundle summary (passage
  insight).
- 值得讲的句子 — the curated "sentences worth teaching" list.
- `core` annotation summary for the passage.

The existing insight popover stays as a **shortcut summary entry
point**, but the formal home for passage-level overview is the
reading-mode overview panel, not the popover.

### 4. Lecture mode — global question focus

Lecture mode (讲题模式) is a **whole-paper global focus**. It does NOT
remember a separate focus per passage.

```ts
lectureFocus: {
  kind: 'question'
  questionId: string
  activeEvidenceId?: string
}
```

Rules:

- Primary focus in lecture mode is the **question**. Evidence is a
  **secondary**, question-internal focus.
- Clicking an evidence anchor does NOT switch the right panel out of
  Question Analysis. The right panel stays on the active question.
- To see a per-sentence language teaching pass for the evidence
  sentence, the teacher uses the **"读这句"** entry inside Question
  Analysis. That entry explicitly switches the surface into reading
  mode with a `sentence` focus.

### 5. Mode switching and memory

Modes are a closed set:

```ts
mode: 'lecture' | 'reading'
```

Rules:

- Default mode on entry is `lecture`.
- Switching mode does NOT clear the other mode's focus.
- Reading → lecture restores the last `lectureFocus` (the last active
  question).
- Lecture → reading restores `readingFocusBySection[currentSection]`
  (overview or last sentence focus for that passage).
- In reading mode, clicking a question item switches back to lecture
  mode and focuses that question.
- In lecture mode, clicking a sentence / annotation in the left
  passage column does NOT auto-switch to reading mode. Reading mode
  is entered only via the explicit segmented control or via the "读
  这句" entry.

Mode-switch UI:

- A small **segmented control labelled `[讲题] [读文]`** lives at the
  PaperSurface chrome top-right.
- It is part of the surface chrome, NOT inlaid into the paper body.
- It does not change the overall layout (no column add / remove).

### 6. Reading mode visual policy

Inside reading mode:

- Sentences that have at least one `core` annotation carry a
  **lightweight always-visible mark**.
- Word-level / phrase-level tags are NOT always visible. They appear
  only as part of the active sentence's teaching flow.
- Clicking a sentence puts the right panel into that sentence's
  teaching flow.
- Clicking an annotation marks it as the **active annotation**, and
  the left column persistently highlights it. Non-active annotations
  do not get highlighted.
- The active annotation can be a word span, a phrase span, or a
  sentence span. The shape is uniform.
- Reading mode MAY render a faded `evidence` context layer, but the
  current sentence / active annotation always wins on visual
  priority.

### 7. Right panel policy

The right panel is a **single slot**. It does NOT become an 8-tab
panel.

Lecture mode:

- The slot shows **Question Analysis**.
- Question Analysis MAY embed question-scoped annotations, restricted
  to:
  - language points on the evidence sentence,
  - synonym / paraphrase relationships for the correct option,
  - key phrase notes used by this question.
- Question Analysis exposes a **"读这句"** entry that switches the
  surface to reading mode with a `sentence` focus on the evidence
  sentence.

Reading mode:

- The slot shows either passage overview or the active sentence's
  analysis.
- Sentence analysis is organized as a **teaching flow**, NOT as a
  data-type dump. The flow is:
  1. why this sentence is worth teaching,
  2. key expressions,
  3. lexical / grammatical points,
  4. relationship to the question(s) it serves.
- By default only the top 3-4 highlights are surfaced; the rest is
  folded.

### 8. PaperSurface interface implications

The eventual production interface implied by §1–§7. **PaperSurface
itself does not own this state.** It accepts the focus state as
props and emits focus intents back up. State ownership stays with
the route / container above PaperSurface.

```ts
type PaperSurfaceMode = 'lecture' | 'reading'

type LectureFocus = {
  kind: 'question'
  questionId: string
  activeEvidenceId?: string
}

type ReadingFocus =
  | { kind: 'overview' }
  | { kind: 'sentence'; sentenceId: string; activeAnnotationId?: string }

type PaperSurfaceFocusState = {
  mode: PaperSurfaceMode
  lectureFocus: LectureFocus | null
  readingFocusBySection: Record<string, ReadingFocus>
}
```

This is a **target contract**. It is not implemented in the current
prototype. No file in `app/` or `server/` currently exports these
types. They live here, in this design note, until a B-level
implementation cut adopts them.

## Considered alternatives

- **On-click annotation generation.** Rejected: classroom / lesson-prep
  cannot tolerate a model round-trip per click.
- **Encyclopedic always-on annotation overlay.** Rejected: pollutes
  卷面 and undermines "what is worth teaching".
- **Per-passage lecture focus memory.** Rejected: 讲题 is whole-paper.
  Per-passage lecture memory invents friction without payoff.
- **Multi-tab right panel (e.g. 8 tabs for vocab / syntax / cohesion /
  ...).** Rejected: violates the "teaching flow, not data dump"
  organising principle.
- **PaperSurface owns mode + focus state.** Rejected: PaperSurface
  must remain a controlled component so route / container can
  coordinate with the rest of the workspace.
- **Reserving a `studentAudience` field in v1 schema "just in case".**
  Rejected: speculative schema surface; will be reopened via a
  dedicated ADR if/when student audience is real.
- **Plumbing annotations into export / PDF in v1.** Deferred: out of
  scope for v1; export integration is its own cut.

## Consequences

- The Paper Intelligence pipeline owns annotation pack pre-generation.
  No PaperSurface code path may invoke a model at click-time.
- The annotation schema is **teacher-only** and **read-only** in v1.
  Any future student / editable variant is gated on a new ADR.
- v1 export pipelines (`server/print-renderer.mjs`, PDF) are NOT
  expected to consume the annotation pack. Existing print / export
  contracts are unaffected by this ADR.
- Future PaperSurface implementation must accept a
  `PaperSurfaceFocusState` prop and emit focus intents; it must not
  hold mode / focus state internally.
- Future implementations must respect the mode-memory rules: cross-
  mode switches restore, never clear, the other mode's focus.
- The right panel must remain a single slot. Adding tabs requires a
  superseding ADR.

## Verify

`scripts/verify-paper-surface-interaction-model-doc.mjs` locks the
decisions in this ADR. It is documentation-only — it parses this
markdown file and the doc itself, asserts the listed phrases /
shapes are present, and does not touch any runtime code.

The verify script asserts the presence of, at minimum:

- pre-generated curated teacher annotation pack
- teacher-only v1 (no student audience field in v1 schema)
- read-only v1 (no edit / hide / star / add / delete on PaperSurface)
- no export / PDF in v1
- annotation `importance: 'core' | 'extended'`
- `teachingPriority` and `sourceOrder` fields
- `readingFocusBySection` per-passage memory
- `lectureFocus` with `activeEvidenceId` as a secondary focus
- `mode = 'lecture' | 'reading'`
- segmented control `[讲题] [读文]` at PaperSurface chrome top-right
- in reading mode, clicking a question returns to lecture mode and
  focuses that question
- "读这句" goes from Question Analysis to reading-mode sentence focus
- reading overview includes passage insight (篇章洞察)
- right panel is a single slot
- right panel is NOT an 8-tab panel

Run:

```
node scripts/verify-paper-surface-interaction-model-doc.mjs
git diff --check
```
