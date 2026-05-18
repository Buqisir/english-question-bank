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
 *   2. PaperAnnotation — curated teacher annotation; references
 *                        TextMap, does not store own offsets.
 *   3. PaperSurfaceMode + focus types (re-stated for completeness;
 *      the canonical narrative still lives in the ADR).
 *   4. FocusIntent — the host-bound message PaperSurface emits.
 *   5. PaperSurfaceProps — the controlled-component prop sketch.
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
}

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
 * Coarse classification of the annotation's subject matter. Kind is
 * METADATA only — it is NOT the primary axis of layout (ADR 0003 §2:
 * "Annotations are NOT bucketed into many sections by `kind`").
 */
export type PaperAnnotationKind =
  | 'lexical'
  | 'syntactic'
  | 'discourse'
  | 'rhetoric'
  | 'culture'

export type PaperAnnotation = {
  /** Stable id, unique within the annotation pack of this paper. */
  readonly id: string

  /** Coarse classification. Metadata only. */
  readonly kind: PaperAnnotationKind

  /** Position is addressed THROUGH a TextMap range. The annotation
   *  record itself stores no character offsets independent of the
   *  TextMap (invariant I7). */
  readonly range: PaperTextRange

  /** Reading-mode default visibility (ADR 0003 §2):
   *    - 'core'     — always-visible mark on the sentence.
   *    - 'extended' — folded by default, surfaced on demand. */
  readonly importance: PaperAnnotationImportance

  /** Whether this annotation is question-scoped (shown inside
   *  Question Analysis) or passage-scoped (shown in reading mode). */
  readonly scope: PaperAnnotationScope

  /** When `scope === 'question'`, identifies the owning question.
   *  Required for question-scoped annotations; ignored for
   *  passage-scoped ones. */
  readonly questionId?: string

  /** Sort key inside the same `importance` bucket. Lower is shown
   *  first. */
  readonly teachingPriority: number

  /** Stability tiebreaker for annotations with equal
   *  `teachingPriority`. Lower is shown first. */
  readonly sourceOrder: number
}

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
  | {
      readonly kind: 'request-read-this-sentence'
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

export type PaperQuestion = {
  readonly id: string
  /** Document order within the paper. Lower renders first. */
  readonly order: number
  /** The owning passage / section identifier, if any. Cloze /
   *  global questions may omit this. */
  readonly section?: string
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
}
