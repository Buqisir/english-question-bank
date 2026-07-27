/**
 * Paper Surface — types-only sketch.
 *
 * Issue #21-B1.5 (Must Fix 2).
 *
 * This file is a TYPES SKETCH. It captures the target shape of the
 * data the eventual production `PaperSurface` module will consume,
 * so the B3 / B4a / B4b implementation cuts have a frozen reference
 * to write against. It is intentionally narrow:
 *
 *   - No runtime initializer is exported.
 *   - No `.mjs` companion is required.
 *   - No file in `app/` or `server/` currently imports these types.
 *     B3+ may begin to consume them; this PR does not change that.
 *   - This file is NOT wired into the app's `tsc` build. It is not
 *     intended to trigger a TS build by its presence.
 *
 * The invariants written into the comments below are NORMATIVE.
 * They restate, in structural form, the decisions in
 * `docs/adr/0003-paper-surface-interaction-model.md`, plus the
 * extensions added in #21-B1.5 (Must Fix 2 / Must Fix 4).
 *
 * --------------------------------------------------------------
 *  Section index
 * --------------------------------------------------------------
 *   1. PaperTextMap  — read-only position map.
 *   2. PaperAnnotation — curated teacher annotation; SCOPE-SAFE
 *                        discriminated union (question vs passage);
 *                        references TextMap, does not store own
 *                        offsets, does not embed explanation payload.
 *   3. PaperSurfaceMode + focus types (re-stated for completeness;
 *      the canonical narrative still lives in the ADR).
 *   4. FocusIntent — the host-bound message PaperSurface emits.
 *   5. PaperSurfaceProps — the controlled-component prop sketch;
 *      includes the renderable PaperQuestion / PaperQuestionOption
 *      pair the PaperSurface left column needs.
 *
 * --------------------------------------------------------------
 *  Companion ADRs / plans
 * --------------------------------------------------------------
 *   - docs/adr/0003-paper-surface-interaction-model.md
 *       (B1.5 locked design note — narrative source.)
 *   - docs/paper-surface-textmap-adapter-plan.md
 *       (B2 adapter plan — how PI / Assembly Basket /
 *        reading-analysis materialise these types.)
 */

/* ============================================================== *
 * 1. PaperTextMap — read-only position map
 * ============================================================== *
 *
 * INVARIANTS (locked):
 *
 *   I1.  PaperTextMap is a READ-ONLY position map. It maps the
 *        rendered paper text to addressable positions (paragraph,
 *        sentence, token, range). It is computed once per paper
 *        and never mutated thereafter.
 *
 *   I2.  PaperTextMap does NOT contain any active / selected /
 *        hover / focus state. State of any kind belongs to the
 *        focus props (see §3) or to the host. A TextMap from one
 *        render must be byte-identical to a TextMap from any other
 *        render of the same paper.
 *
 *   I3.  PaperTextMap does NOT depend on evidence. It contains no
 *        evidence ids, no evidence kinds, no support / trap data.
 *        Evidence and annotations layer ON TOP OF TextMap by
 *        anchoring to its node ids.
 *
 *   I4.  PaperTextMap is the only authoritative position oracle.
 *        Annotations and evidence MUST address positions through a
 *        TextMap reference, never via independent character offsets
 *        (see §2 invariant I7).
 */

export type PaperTextMap = {
  /** Stable id of the source paper this map was derived from. */
  readonly paperId: string

  /** Paragraphs in document order. The paragraph list is closed —
   *  there is no "open" / streaming variant of a TextMap. */
  readonly paragraphs: ReadonlyArray<PaperTextParagraph>
}

export type PaperTextParagraph = {
  /** Stable id, unique within the paper. Matches the
   *  `data-paper-paragraph-id` DOM attribute when rendered. */
  readonly id: string

  /** The owning passage / section identifier (e.g. 'A', 'B', 'C',
   *  'D'). Matches `data-paper-section` on the section root. */
  readonly section: string

  /** Sentences in document order. Always closed. */
  readonly sentences: ReadonlyArray<PaperTextSentence>

  /**
   * figure-render cut (fig-token P0). OPTIONAL, undefined for every
   * paragraph pre-cut and for every non-figure paragraph post-cut — a
   * paragraph carries `figure` ONLY when its whole text is a manifest
   * `[表:`/`[图:` marker (paragraph-granular substitution, PA MF-4: never
   * a substring hide inside a mixed paragraph). When present, PaperSurface
   * renders the figure/placeholder INSTEAD OF `sentences` for this
   * paragraph — `sentences` still carries the raw marker text (the
   * adapter's normal segmentation output, unchanged) but is not rendered
   * for a figure paragraph. Producing this field is the adapter's job
   * (`paperAssetSurfaceAdapter.ts`) — PaperSurface itself does no marker
   * detection, no fetch, no manifest knowledge (I12 unchanged).
   */
  readonly figure?: PaperTextFigure
}

export type PaperTextFigure =
  | { readonly kind: 'figure'; readonly src: string; readonly alt: string }
  | { readonly kind: 'placeholder' }

export type PaperTextSentence = {
  /** Stable id, unique within the paper. Matches the
   *  `data-paper-sentence-id` DOM attribute when rendered. */
  readonly id: string

  /** The full text of the sentence as rendered. Whitespace is
   *  preserved in the form the renderer will emit. */
  readonly text: string

  /** Tokens in document order. May be empty for sentences whose
   *  tokenization is deferred; rendering does not require tokens. */
  readonly tokens: ReadonlyArray<PaperTextToken>
}

export type PaperTextToken = {
  /** Stable id, unique within the sentence. */
  readonly id: string

  /** Half-open character range `[start, end)` within the sentence's
   *  `text`. The range is in UTF-16 code units, matching DOM Range
   *  semantics. */
  readonly start: number
  readonly end: number
}

/**
 * A `PaperTextRange` addresses a contiguous span of text by
 * referencing TextMap node ids plus a half-open offset range. It is
 * the only allowed shape for "where this annotation/evidence lives".
 *
 *   - `sentenceId` is REQUIRED. The sentence is the addressing root.
 *   - `start` / `end` are character offsets within the sentence text
 *     (UTF-16 code units, half-open `[start, end)`).
 *   - `tokenIds`, when present, MUST be a contiguous subsequence of
 *     the sentence's `tokens`. They are an optional cache, not the
 *     truth — the truth is `(sentenceId, start, end)`.
 */
export type PaperTextRange = {
  readonly sentenceId: string
  readonly start: number
  readonly end: number
  readonly tokenIds?: ReadonlyArray<string>
}

/* ============================================================== *
 * 2. PaperAnnotation — curated teacher annotation
 * ============================================================== *
 *
 * INVARIANTS (locked):
 *
 *   I5.  Annotations are pre-generated by the Paper Intelligence
 *        pipeline (ADR 0003 §1). They are a closed teacher pack;
 *        not click-time generated; not encyclopedic.
 *
 *   I6.  Annotations are READ-ONLY in v1. PaperSurface MUST NOT
 *        accept or expose mutators (no edit / hide / star / add /
 *        delete) (ADR 0003 §1).
 *
 *   I7.  Annotations DO NOT store independent character offsets.
 *        A `PaperAnnotation` references position by carrying a
 *        `PaperTextRange` (`sentenceId` + `start` + `end`) that
 *        points into a `PaperTextMap`. Independent offsets are
 *        forbidden because they drift from the rendered text.
 *
 *   I8.  Annotations DO NOT carry an explanation payload as a hard
 *        prop on the annotation record. The teaching content
 *        (`why-worth-teaching`, `key-expressions`, `lex/gram
 *        points`) is loaded by the host via a separate teaching-
 *        flow lookup keyed by `annotation.id`. Keeping the
 *        annotation record minimal protects the wire payload.
 */

export type PaperAnnotationImportance = 'core' | 'extended'
export type PaperAnnotationScope = 'question' | 'passage'

/**
 * v1 annotation kind taxonomy (single source of truth).
 *
 * This is the ONLY enumeration of annotation kinds in the
 * PaperSurface contract. Earlier sketches floated multiple parallel
 * taxonomies (a "5 coarse buckets" version and a "3 worked
 * examples" version) — both have been retired. The v1 kinds below
 * are the closed set; adding or removing a kind is an ADR-
 * superseding change.
 *
 * Kind is METADATA only. Reading mode does NOT bucket annotations
 * into many sections by `kind` (ADR 0003 §2). Display layout is
 * driven by `importance` + `teachingPriority` + `sourceOrder`,
 * not by kind.
 *
 * Kind groups (for documentation only — not encoded in the type):
 *   sentence-level     : 'long-sentence', 'discourse-structure',
 *                        'culture-context'
 *   word/phrase-level  : 'derived-word', 'compound-word',
 *                        'phrase-chunk', 'familiar-new-meaning',
 *                        'synonym'
 *   question-evidence  : 'evidence-support', 'evidence-trap'
 *
 * The two `evidence-*` kinds are intentionally part of the
 * annotation taxonomy: when an evidence span is also a thing a
 * teacher would teach about (and therefore part of the curated
 * annotation pack), it is represented as an annotation with
 * `kind: 'evidence-support' | 'evidence-trap'` and
 * `scope: 'question'`. PaperEvidence (§5) remains the separate
 * lightweight geometry channel that lecture-mode dotted lines
 * paint against; the two are NOT in conflict.
 */
export type PaperAnnotationKind =
  | 'long-sentence'
  | 'derived-word'
  | 'compound-word'
  | 'phrase-chunk'
  | 'familiar-new-meaning'
  | 'synonym'
  | 'evidence-support'
  | 'evidence-trap'
  | 'discourse-structure'
  | 'culture-context'

/**
 * The fields every PaperAnnotation carries, regardless of scope.
 * The two scope-specific shapes below extend this with their
 * scope-required (or scope-forbidden) fields.
 */
type PaperAnnotationCommon = {
  /** Stable id, unique within the annotation pack of this paper. */
  readonly id: string

  /** Coarse classification. Metadata only (see PaperAnnotationKind
   *  doc above). */
  readonly kind: PaperAnnotationKind

  /** Position is addressed THROUGH a TextMap range. The annotation
   *  record itself stores no character offsets independent of the
   *  TextMap (invariant I7). */
  readonly range: PaperTextRange

  /** Reading-mode default visibility (ADR 0003 §2):
   *    - 'core'     — always-visible mark on the sentence.
   *    - 'extended' — folded by default, surfaced on demand. */
  readonly importance: PaperAnnotationImportance

  /** Sort key inside the same `importance` bucket. Lower is shown
   *  first. */
  readonly teachingPriority: number

  /** Stability tiebreaker for annotations with equal
   *  `teachingPriority`. Lower is shown first. */
  readonly sourceOrder: number
}

/**
 * Question-scoped annotation. Shown inside Question Analysis in
 * lecture mode (and inside the active sentence's teaching flow when
 * the sentence is the evidence sentence for this question). The
 * `questionId` field is REQUIRED — at the type level, not via a
 * comment.
 */
export type PaperQuestionAnnotation = PaperAnnotationCommon & {
  readonly scope: 'question'
  /** Owning question id. REQUIRED for question scope. */
  readonly questionId: string
}

/**
 * Passage-scoped annotation. Shown in reading mode against a
 * paragraph / sentence span. The `questionId` field is FORBIDDEN at
 * the type level — passage annotations have no owning question.
 *
 * The explicit `questionId?: never` carries the no-questionId rule
 * structurally so a discriminated narrow on `scope === 'passage'`
 * removes `questionId` from the inferred type entirely.
 */
export type PaperPassageAnnotation = PaperAnnotationCommon & {
  readonly scope: 'passage'
  /** Forbidden for passage scope. */
  readonly questionId?: never
}

/**
 * PaperAnnotation is a SCOPE-SAFE discriminated union.
 *
 *   - `scope: 'question'` MUST carry `questionId: string`.
 *   - `scope: 'passage'`  MUST NOT carry `questionId` at all.
 *
 * The constraint is structural. It is not enforced by a runtime
 * comment. A consumer that narrows on `scope` gets the correct
 * `questionId` shape automatically.
 */
export type PaperAnnotation =
  | PaperQuestionAnnotation
  | PaperPassageAnnotation

/* ============================================================== *
 * 3. PaperSurfaceMode + focus types
 * ============================================================== *
 *
 * Restated from ADR 0003 §3–§5 / §8 for completeness. The ADR is
 * still the canonical narrative; this section is the structural
 * reference the implementation will write against.
 */

export type PaperSurfaceMode = 'lecture' | 'reading'

export type LectureFocus = {
  readonly kind: 'question'
  readonly questionId: string
  readonly activeEvidenceId?: string
}

export type ReadingFocus =
  | { readonly kind: 'overview' }
  | {
      readonly kind: 'sentence'
      readonly sentenceId: string
      readonly activeAnnotationId?: string
    }

export type PaperSurfaceFocusState = {
  readonly mode: PaperSurfaceMode
  readonly lectureFocus: LectureFocus | null
  readonly readingFocusBySection: Readonly<Record<string, ReadingFocus>>
}

/* ============================================================== *
 * 4. FocusIntent — the host-bound message
 * ============================================================== *
 *
 * INVARIANTS (locked):
 *
 *   I9.  PaperSurface does NOT mutate focus state. It emits a
 *        `PaperSurfaceFocusIntent` to the host through the
 *        `onFocusIntent` callback. The host is the only writer.
 *
 *   I10. The intent set is closed. Adding a new intent kind is an
 *        ADR-superseding change.
 */

export type PaperSurfaceFocusIntent =
  | { readonly kind: 'request-mode'; readonly mode: PaperSurfaceMode }
  | {
      readonly kind: 'request-lecture-focus'
      readonly questionId: string
      readonly activeEvidenceId?: string
    }
  | {
      readonly kind: 'request-reading-focus'
      readonly section: string
      readonly focus: ReadingFocus
    }
  /**
   * `request-read-this-sentence` is an ATOMIC intent.
   *
   * It expresses BOTH:
   *   (a) switch the surface into reading mode, and
   *   (b) focus this specific sentence (with the named section as
   *       the active passage).
   *
   * It exists as a single intent — instead of being expressed as
   * `request-mode` followed by `request-reading-focus` — to remove
   * the half-state where the host has switched mode but not yet
   * applied focus, or applied focus but not yet switched mode. Both
   * orderings are observably wrong: one shows reading-mode chrome
   * with the wrong sentence highlighted, the other keeps lecture
   * chrome briefly on a sentence-focus state.
   *
   * Carrying mode + focus in a single intent is what lets the host
   * apply them in one reducer step, so PaperSurface never observes
   * the half-state.
   */
  | {
      readonly kind: 'request-read-this-sentence'
      readonly section: string
      readonly sentenceId: string
    }

/** Convenience alias matching the verb `FocusIntent` used in
 *  conversation; implementations may import either name. */
export type FocusIntent = PaperSurfaceFocusIntent

/* ============================================================== *
 * 5. PaperSurfaceProps — controlled-component sketch
 * ============================================================== *
 *
 * INVARIANTS (locked):
 *
 *   I11. PaperSurface is a CONTROLLED component. It receives
 *        `mode`, `lectureFocus`, `readingFocusBySection` as props,
 *        and emits `onFocusIntent`. It MUST NOT call `useState`
 *        to hold any active* / focus* / mode* state.
 *
 *   I12. PaperSurface MUST NOT fetch. PaperSurface MUST NOT model.
 *        PaperSurface MUST NOT persist. PaperSurface MUST NOT read
 *        the router. PaperSurface MUST NOT know about the basket.
 *        Anything that smells like a side effect lives in the host.
 *
 *   I13. PaperSurface receives a fully-realized `PaperTextMap`,
 *        `annotations`, and (optional) `evidence` data. It does
 *        not derive them from a paper id at runtime.
 */

export type PaperEvidence = {
  readonly id: string
  readonly questionId: string
  readonly kind: 'support' | 'trap' | 'context'
  readonly range: PaperTextRange
}

/**
 * One displayable option on a multiple-choice question.
 *
 * The PaperSurface left column needs to RENDER options inline with
 * the question stem, so the option text and (optional) translation
 * are part of the surface contract — not host-only metadata.
 *
 * What does NOT live here:
 *   - which option is correct (`answer`),
 *   - the per-option distractor analysis,
 *   - synonym / paraphrase relationships against the correct option.
 *
 * Those remain host / right-panel concerns (Question Analysis), per
 * ADR 0003 §7. Keeping them off PaperQuestionOption stops the wire
 * payload for the left column from secretly leaking the answer key.
 */
export type PaperQuestionOption = {
  /** Option letter as authored ('A' | 'B' | 'C' | 'D' for v1
   *  multiple-choice; typed as `string` to leave room for future
   *  question types without a schema break). */
  readonly label: string

  /** Displayable option text. */
  readonly text: string

  /** Optional Chinese translation of the option text. PaperSurface
   *  may render it under the option as a faint companion line; the
   *  host decides whether translations are visible. */
  readonly translation?: string
}

/**
 * One question, in the shape PaperSurface needs to render it.
 *
 * Renderable means: stem, options, and optional translations are
 * all included. PaperSurface MUST NOT have to call back into a
 * model / service to display a question.
 *
 * NOT included on PaperQuestion (host / right-panel concerns):
 *   - the correct answer,
 *   - explanation / `answerEvidence` / `synonymSummary`,
 *   - distractor analysis,
 *   - difficulty / boundary flags.
 *
 * Those are loaded by the host through Question Analysis when a
 * question is focused (ADR 0003 §7). PaperQuestion remains a
 * minimal surface payload.
 */
export type PaperQuestion = {
  /** Stable id, unique within the paper. Matches the
   *  `data-paper-question-id` DOM attribute when rendered. */
  readonly id: string

  /** The owning passage / section identifier, if any. Cloze /
   *  global questions may omit this. */
  readonly section?: string

  /** Document order within the paper. Lower renders first. */
  readonly order: number

  /** Human-facing question number as it appears on the paper
   *  (e.g. "21", "32", "70"). Kept as a string because real papers
   *  use values like "21" / "B-3" / "(1)". */
  readonly questionNo: string

  /** Question stem text. */
  readonly stem: string

  /** Optional Chinese translation of the stem. */
  readonly stemTranslation?: string

  /** Displayable options in label order. May be empty for question
   *  types that have no inline options (e.g. some writing tasks);
   *  PaperSurface treats an empty array as "no options to render". */
  readonly options: ReadonlyArray<PaperQuestionOption>

  /** Shared canonical A-D placement selected before any renderer starts. */
  readonly canonicalPlacement?: {
    readonly mode: 'four_columns' | 'two_by_two' | 'one_column'
    readonly signature: string
    readonly rowWidthPt: number
    readonly columnStartsPt: ReadonlyArray<number>
    readonly columnWidthsPt: ReadonlyArray<number>
  }

  /** Stable canonical Reading identity; display state never changes it. */
  readonly canonicalIdentity?: {
    readonly questionId: string
    readonly correctOptionId: string
    readonly optionIds: ReadonlyArray<string>
  }
}

export type PaperSurfaceProps = {
  /** The paper text + position map. Read-only; see invariants
   *  I1–I4. */
  readonly textMap: PaperTextMap

  /** Closed, pre-generated curated annotation pack for this paper.
   *  Read-only; see invariants I5–I8. */
  readonly annotations: ReadonlyArray<PaperAnnotation>

  /** Evidence spans. Optional — lecture mode without explicit
   *  evidence wiring is allowed. */
  readonly evidence?: ReadonlyArray<PaperEvidence>

  /** Question metadata in document order. */
  readonly questions: ReadonlyArray<PaperQuestion>

  /**
   * seven-options-on-paper (2026-07-08): the 七选五 A-G option pool,
   * printed once after the passage — NOT per-question options. Real
   * exam papers print the candidate sentence pool once under the
   * blanked passage; PaperSurface renders it purely for paper fidelity.
   *
   * Optional — omitted (or empty) for every group type except
   * 七选五, and silently renders nothing when empty/undefined (no
   * placeholder). PaperSurface attaches stable canonical bank/Option
   * identity anchors but no interactive paper-option anchor or click
   * handler: it is display-only and never
   * participates in `onFocusIntent` / evidence / annotation wiring.
   */
  readonly optionBank?: ReadonlyArray<PaperQuestionOption>

  /** Stable identity carried only by a canonical shared option bank. */
  readonly optionBankIdentity?: {
    readonly bankId: string
    readonly semanticSignature: string
    readonly occurrenceSignature: string
  }

  /** ============ controlled-component props (host-owned) ============ */

  /** Current surface mode. Host-owned. PaperSurface MUST NOT
   *  default this internally. */
  readonly mode: PaperSurfaceMode

  /** Current lecture-mode focus, or `null` if no question is
   *  focused. Host-owned. */
  readonly lectureFocus: LectureFocus | null

  /** Current per-passage reading focus map. Host-owned. */
  readonly readingFocusBySection: Readonly<Record<string, ReadingFocus>>

  /** ============ outbound channel ============ */

  /** PaperSurface emits all focus / mode change requests through
   *  this single callback. The host is the only writer of focus
   *  state (invariant I9). */
  readonly onFocusIntent: (intent: PaperSurfaceFocusIntent) => void

  /** How a lecture-mode blank is focused (I15). Optional; defaults to
   *  `'rail'` — the bottom question list (`56. 57. …`) is the focus
   *  target, byte-for-byte the historical behavior (reading / 七选五 /
   *  cloze). `'in-passage'` (grammar fill) retires the rail and makes
   *  the in-passage blank itself a clickable focus button; it emits the
   *  same `request-lecture-focus` intent — no new intent kind. */
  readonly blankFocusMode?: 'rail' | 'in-passage'
}
