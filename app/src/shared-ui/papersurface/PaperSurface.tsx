/**
 * PaperSurface — production module v1 (Issue #21-B3).
 *
 * A standalone, controlled, dumb renderer + anchor emitter for the
 * paper surface. Lecture mode only in B3.
 *
 * Invariants (from ADR 0003 / shared/papersurface/types.d.ts):
 *   - Controlled component: NO local state for mode, focus, active*.
 *   - NO fetch. NO model. NO persist. NO router. NO basket.
 *   - Receives fully-realized PaperTextMap, annotations, evidence,
 *     questions as props.
 *   - Emits focus intents through onFocusIntent callback only.
 *   - Uses neutral `data-paper-*` anchor protocol exclusively.
 *   - Consumes shared tokens via CSS custom properties.
 *
 * B3 scope:
 *   - Lecture mode rendering only.
 *   - Emits `request-lecture-focus` intent only.
 *   - Reading mode renders an explicit placeholder.
 *   - No evidence paint, no popover, no right panel.
 */

import { useMemo, useCallback, type CSSProperties, type ReactNode } from 'react'
import './PaperSurface.css'
import { paperSurfaceTokens } from '../../../../shared/papersurface/tokens.mjs'
import { paperSurfaceAnchorAttrs } from '../../../../shared/papersurface/anchorKeys.mjs'
import { renderCanonicalPaperSentenceContent } from './CanonicalPaperSentenceContent.tsx'
import {
  renderLegacyPaperSentenceContent,
  type LegacyBlankFocusContext,
} from './legacyPaperBlankRenderer.tsx'
import type {
  PaperSurfaceProps,
  PaperTextMap,
  PaperTextParagraph,
  PaperTextSentence,
  PaperQuestion,
  PaperQuestionOption,
  PaperEvidence,
  PaperAnnotation,
  PaperSurfaceFocusIntent,
  LectureFocus,
} from '../../../../shared/papersurface/types'
import type {
  CanonicalSurfaceParagraph,
} from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

/**
 * Extended CSSProperties to allow CSS custom properties on the root.
 */
type PaperSurfaceStyle = CSSProperties & Record<`--${string}`, string | number>

/**
 * Inject shared paper-surface tokens as CSS custom properties.
 * The companion CSS consumes these via `var(--ps-...)`.
 */
const paperSurfaceTokenStyle: PaperSurfaceStyle = {
  '--ps-font-stack': paperSurfaceTokens.paperFontStack,
  '--ps-ink': paperSurfaceTokens.paperInk,
  '--ps-muted': paperSurfaceTokens.paperMuted,
  '--ps-rule': paperSurfaceTokens.paperRule,
  '--ps-font-size': paperSurfaceTokens.paperFontSizePx,
  '--ps-line-height': paperSurfaceTokens.paperLineHeight,
  '--ps-passage-indent': paperSurfaceTokens.passageIndent,
  '--ps-options-grid-columns': paperSurfaceTokens.optionsGridColumns,
  '--ps-options-grid-gap-x': paperSurfaceTokens.optionsGridGapX,
  '--ps-paper-blank-width': paperSurfaceTokens.paperBlankWidth,
  '--ps-page-margin-x': paperSurfaceTokens.pageMarginX,
  '--ps-page-margin-top': paperSurfaceTokens.pageMarginTop,
}

/**
 * I15 — focus context for clickable in-passage grammar-fill blanks.
 * Non-null ONLY in 'in-passage' or 'paper-blank' mode; `null` means
 * the historical rail-driven span renderer (other surfaces are
 * unaffected).
 *
 * lecture-rail-scroll-fix: `renderer` discriminates which blank
 * pattern/markup the clickable form uses — 'grammar-fill' is I15's
 * original `NN._____` in-passage button (rail suppressed);
 * 'paper-blank' is the new cloze/七选五 `__NN__` button (rail and
 * `__global__` option pool NOT suppressed — every consumer of this
 * field must branch on `renderer`, not mere non-nullness, to decide
 * suppression).
 */
type BlankFocusContext = LegacyBlankFocusContext

/**
 * lecture-rail-scroll-fix: `blankFocusMode` gains a third value,
 * 'paper-blank', LOCAL to this component wrapper — the shared contract
 * type (`shared/papersurface/types.d.ts`, PaperSurfaceProps) is out of
 * this cut's scope and stays `'rail' | 'in-passage'` unchanged. This
 * extended prop type is a superset accepted at the JSX boundary only;
 * every internal use of the original two values is untouched.
 */
type PaperSurfaceBlankFocusMode = 'rail' | 'in-passage' | 'paper-blank'
type PaperSurfaceComponentProps = Omit<PaperSurfaceProps, 'blankFocusMode'> & {
  readonly blankFocusMode?: PaperSurfaceBlankFocusMode
  /**
   * lecture-rail-scroll-fix QA fix: supplemental blank-number →
   * questionId entries for surfaces whose `questions` prop is
   * intentionally empty (七选五 renders its A-G pool via `optionBank`,
   * never per-question rows — so the blankFocus map derived from
   * `questions` alone would be empty and every blank would fall back
   * to the non-interactive span). Entries only fill numbers missing
   * from the `questions`-derived map; they never override it. Ignored
   * in 'rail' mode.
   */
  readonly blankQuestionIdByNo?: Record<string, string>
  /**
   * Canonical visible content companion. When present, PaperSurface renders
   * these semantic nodes directly while `textMap` remains the position
   * oracle derived from the same canonical group.
   */
  readonly semanticParagraphs?: ReadonlyArray<CanonicalSurfaceParagraph>
}

export function PaperSurface(props: PaperSurfaceComponentProps): ReactNode {
  const {
    textMap,
    annotations,
    evidence,
    questions,
    optionBank,
    mode,
    lectureFocus,
    // readingFocusBySection is accepted but not rendered in B3.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readingFocusBySection: _readingFocusBySection,
    onFocusIntent,
    blankFocusMode = 'rail',
    blankQuestionIdByNo,
    semanticParagraphs,
  } = props

  if (semanticParagraphs !== undefined) {
    assertCanonicalCompanionMatchesTextMap(textMap, semanticParagraphs)
  }

  const handleQuestionClick = useCallback(
    (questionId: string) => {
      const intent: PaperSurfaceFocusIntent = {
        kind: 'request-lecture-focus',
        questionId,
      }
      onFocusIntent(intent)
    },
    [onFocusIntent],
  )

  // Group questions by section for rendering alongside passages.
  const questionsBySection = useMemo(() => {
    const map = new Map<string, PaperQuestion[]>()
    for (const q of questions) {
      const section = q.section ?? '__global__'
      const arr = map.get(section) ?? []
      arr.push(q)
      map.set(section, arr)
    }
    return map
  }, [questions])

  // I15 / lecture-rail-scroll-fix: blank focus context. Non-null in
  // 'in-passage' (grammar fill) OR 'paper-blank' (cloze/七选五) mode;
  // null in 'rail' mode so the historical path is untouched. Resolves
  // a clicked blank number → questionId by PaperQuestion.questionNo
  // string-equality. `renderer` is byte-identical to `blankFocusMode`
  // for the two clickable modes — kept as its own field (rather than
  // re-deriving from blankFocusMode) so downstream renderers only ever
  // need `blankFocus`, not a second threaded prop.
  const blankFocus = useMemo<BlankFocusContext>(() => {
    if (blankFocusMode !== 'in-passage' && blankFocusMode !== 'paper-blank') return null
    const questionIdByNo = new Map<string, string>()
    for (const q of questions) {
      const no = String(q.questionNo ?? '')
      if (no && !questionIdByNo.has(no)) questionIdByNo.set(no, q.id)
    }
    // Supplemental entries (see prop doc) fill gaps only — the
    // `questions`-derived mapping always wins on conflict.
    if (blankQuestionIdByNo) {
      for (const [no, id] of Object.entries(blankQuestionIdByNo)) {
        if (no && id && !questionIdByNo.has(no)) questionIdByNo.set(no, id)
      }
    }
    return {
      renderer: blankFocusMode === 'paper-blank' ? 'paper-blank' : 'grammar-fill',
      questionIdByNo,
      activeQuestionId: lectureFocus?.questionId ?? null,
      onQuestionClick: handleQuestionClick,
    }
  }, [blankFocusMode, questions, blankQuestionIdByNo, lectureFocus, handleQuestionClick])

  // Group evidence by section for neutral anchor emission.
  const evidenceBySection = useMemo(() => {
    if (!evidence || evidence.length === 0) return new Map<string, PaperEvidence[]>()
    const map = new Map<string, PaperEvidence[]>()
    for (const ev of evidence) {
      // Find the sentence's section from the textMap.
      const section = findSectionForSentence(textMap, ev.range.sentenceId)
      if (section) {
        const arr = map.get(section) ?? []
        arr.push(ev)
        map.set(section, arr)
      }
    }
    return map
  }, [evidence, textMap])

  // Group annotations by paragraph for rendering neutral hooks.
  const annotationsBySentence = useMemo(() => {
    if (!annotations || annotations.length === 0) return new Map<string, PaperAnnotation[]>()
    const map = new Map<string, PaperAnnotation[]>()
    for (const ann of annotations) {
      const key = ann.range.sentenceId
      const arr = map.get(key) ?? []
      arr.push(ann)
      map.set(key, arr)
    }
    return map
  }, [annotations])

  // Group paragraphs by section for ordered rendering (lecture mode).
  // Hook must execute unconditionally before any early return.
  const sections = useMemo(() => {
    const sectionSet = new Set<string>()
    for (const para of textMap.paragraphs) {
      sectionSet.add(para.section)
    }
    return Array.from(sectionSet)
  }, [textMap])

  /**
   * Derive `activeEvidenceId` from the controlled `lectureFocus` prop.
   *
   * PaperSurface stays a dumb / data-driven renderer: it never owns
   * "which evidence is active" state. The host (e.g. the harness)
   * sets `lectureFocus.activeEvidenceId` and PaperSurface paints the
   * matching anchor inline so the cross-column dotted line geometry
   * has a real, sized DOM target on the LEFT side.
   *
   * `lectureFocus.activeEvidenceId` is optional in the shared types;
   * a missing value (or any non-question lectureFocus shape) means
   * "no active evidence" and PaperSurface paints no inline highlight.
   */
  const activeEvidenceId =
    lectureFocus && lectureFocus.kind === 'question'
      ? lectureFocus.activeEvidenceId ?? null
      : null

  // Reading mode placeholder for B3.
  if (mode === 'reading') {
    return (
      <div
        className="ps-surface"
        style={paperSurfaceTokenStyle}
        data-ps-mode="reading"
      >
        <article className="ps-page">
          <div className="ps-reading-placeholder">
            Reading mode lands in B4a.
          </div>
        </article>
      </div>
    )
  }

  // Lecture mode rendering.

  return (
    <div
      className="ps-surface"
      style={paperSurfaceTokenStyle}
      data-ps-mode="lecture"
    >
      <article className="ps-page">
        {sections.map((section) => (
          <PaperSurfaceSection
            key={section}
            section={section}
            textMap={textMap}
            questions={questionsBySection.get(section) ?? []}
            evidenceForSection={evidenceBySection.get(section) ?? []}
            annotationsBySentence={annotationsBySentence}
            lectureFocus={lectureFocus}
            activeEvidenceId={activeEvidenceId}
            onQuestionClick={handleQuestionClick}
            blankFocus={blankFocus}
            semanticParagraphs={semanticParagraphs}
          />
        ))}
        {/* seven-options-on-paper: the 七选五 A-G candidate-sentence
            pool, printed once after the passage (real exam papers print
            this pool once under the blanked passage, not per blank).
            Display-only — no anchor attrs, no click handler, never
            wired into onFocusIntent. Every current adapter feeds exactly
            one section per PaperSurface mount, so rendering this once
            here (rather than per-section) matches "right after the
            passage" without a risk of duplicating it across sections. */}
        {optionBank && optionBank.length > 0 && (
          <PaperSurfaceOptionBank options={optionBank} />
        )}
        {/* Render global questions (no section). I15: the rail is
            suppressed ONLY in 'in-passage' mode (blankFocus.renderer
            === 'grammar-fill') — lecture-rail-scroll-fix's 'paper-blank'
            mode (cloze/七选五) keeps the rail AND this __global__ pool. */}
        {questionsBySection.has('__global__') && blankFocus?.renderer !== 'grammar-fill' && (
          <PaperSurfaceQuestionList
            questions={questionsBySection.get('__global__')!}
            lectureFocus={lectureFocus}
            onQuestionClick={handleQuestionClick}
          />
        )}
      </article>
    </div>
  )
}

function assertCanonicalCompanionMatchesTextMap(
  textMap: PaperTextMap,
  semanticParagraphs: ReadonlyArray<CanonicalSurfaceParagraph>,
): void {
  const semanticByParagraphId = new Map(
    semanticParagraphs.map((paragraph) => [paragraph.id, paragraph]),
  )
  if (
    semanticByParagraphId.size !== semanticParagraphs.length
    || semanticParagraphs.length !== textMap.paragraphs.length
  ) {
    throw new Error(
      '[CANONICAL_COMPANION_TEXT_MAP_MISMATCH] Paragraph companions must map one-to-one.',
    )
  }

  for (const paragraph of textMap.paragraphs) {
    const semanticParagraph = semanticByParagraphId.get(paragraph.id)
    if (!semanticParagraph) {
      throw new Error(
        `[CANONICAL_COMPANION_TEXT_MAP_MISMATCH] Missing paragraph ${paragraph.id}.`,
      )
    }
    const semanticSentenceIds = semanticParagraph.sentences.map(({ id }) => id)
    const textMapSentenceIds = paragraph.sentences.map(({ id }) => id)
    if (
      new Set(semanticSentenceIds).size !== semanticSentenceIds.length
      || semanticSentenceIds.length !== textMapSentenceIds.length
      || textMapSentenceIds.some((id) => !semanticSentenceIds.includes(id))
    ) {
      throw new Error(
        `[CANONICAL_COMPANION_TEXT_MAP_MISMATCH] Paragraph ${paragraph.id} `
        + 'sentence companions must map one-to-one.',
      )
    }
  }
}

/* ─── Helper: find section for a sentence id ───────────────────── */

function findSectionForSentence(
  textMap: PaperTextMap,
  sentenceId: string,
): string | null {
  for (const para of textMap.paragraphs) {
    for (const sent of para.sentences) {
      if (sent.id === sentenceId) return para.section
    }
  }
  return null
}

/* ─── Section renderer ─────────────────────────────────────────── */

type PaperSurfaceSectionProps = {
  section: string
  textMap: PaperTextMap
  questions: PaperQuestion[]
  evidenceForSection: PaperEvidence[]
  annotationsBySentence: Map<string, PaperAnnotation[]>
  lectureFocus: LectureFocus | null
  activeEvidenceId: string | null
  onQuestionClick: (questionId: string) => void
  blankFocus: BlankFocusContext
  semanticParagraphs?: ReadonlyArray<CanonicalSurfaceParagraph>
}

function PaperSurfaceSection({
  section,
  textMap,
  questions,
  evidenceForSection,
  annotationsBySentence,
  lectureFocus,
  activeEvidenceId,
  onQuestionClick,
  blankFocus,
  semanticParagraphs,
}: PaperSurfaceSectionProps): ReactNode {
  const paragraphs = useMemo(
    () => textMap.paragraphs.filter((p) => p.section === section),
    [textMap, section],
  )

  // Build a set of evidence sentence ids for neutral anchor emission.
  const evidenceBySentence = useMemo(() => {
    const map = new Map<string, PaperEvidence[]>()
    for (const ev of evidenceForSection) {
      const key = ev.range.sentenceId
      const arr = map.get(key) ?? []
      arr.push(ev)
      map.set(key, arr)
    }
    return map
  }, [evidenceForSection])

  // paper-passage-letter: reading passages get a centered bold A/B/C/D
  // letter row before the passage body (exam-paper-format-standards.md
  // §83-84). PaperSurfaceSection has no group.title / groupType prop to
  // derive the letter from directly, but paperAssetSurfaceAdapter (the
  // only adapter feeding reading groups) sets `section` to the bare
  // passage letter itself ("A"/"B"/"C"/"D" — see
  // SECTION_BY_READING_GROUP_ID / the group.title fallback there); every
  // other group-type adapter sets `section` to a fixed Chinese section
  // label ('完形填空' / '语法填空' / '七选五' / …) that can never match
  // this pattern. Reusing `section` here is therefore equivalent to
  // deriving from group.title (DEV-verified against every non-reading
  // adapter — none produce a trailing A-D letter) without adding a new
  // prop, per the paper-passage-letter cut's PM ruling
  // (docs/cuts/paper-passage-letter/plan.md).
  const passageLetter = /([A-D])$/.exec(section)?.[1] ?? null

  return (
    <section
      className="ps-section"
      {...{ [paperSurfaceAnchorAttrs.section]: section }}
    >
      {passageLetter && <div className="ps-passage-letter">{passageLetter}</div>}
      <div className="ps-passage-body">
        {paragraphs.map((para) => (
          <PaperSurfaceParagraph
            key={para.id}
            paragraph={para}
            evidenceBySentence={evidenceBySentence}
            annotationsBySentence={annotationsBySentence}
            activeEvidenceId={activeEvidenceId}
            blankFocus={blankFocus}
            semanticParagraph={semanticParagraphs?.find((item) => item.id === para.id)}
          />
        ))}
      </div>
      {/* I15: the rail is suppressed ONLY in 'in-passage' mode
          (blankFocus.renderer === 'grammar-fill') — the in-passage
          blank buttons are the focus target. lecture-rail-scroll-fix's
          'paper-blank' mode keeps the rail as an additional focus
          target alongside the clickable blanks. */}
      {questions.length > 0 && blankFocus?.renderer !== 'grammar-fill' && (
        <PaperSurfaceQuestionList
          questions={questions}
          lectureFocus={lectureFocus}
          onQuestionClick={onQuestionClick}
        />
      )}
    </section>
  )
}

/* ─── Paragraph renderer ───────────────────────────────────────── */

type PaperSurfaceParagraphProps = {
  paragraph: PaperTextParagraph
  evidenceBySentence: Map<string, PaperEvidence[]>
  annotationsBySentence: Map<string, PaperAnnotation[]>
  activeEvidenceId: string | null
  blankFocus: BlankFocusContext
  semanticParagraph?: CanonicalSurfaceParagraph
}

function PaperSurfaceParagraph({
  paragraph,
  evidenceBySentence,
  annotationsBySentence,
  activeEvidenceId,
  blankFocus,
  semanticParagraph,
}: PaperSurfaceParagraphProps): ReactNode {
  // figure-render cut (fig-token P0): `paragraph.figure` is set ONLY by
  // the adapter when this paragraph's WHOLE text is a manifest marker
  // (paragraph-granular, PA MF-4 — never a substring hide inside a mixed
  // paragraph). PaperSurface does no marker detection of its own (I12: no
  // fetch, no model) — it only branches on this pre-resolved field. Every
  // pre-cut paragraph (and every non-figure paragraph post-cut) has
  // `figure` undefined and renders through the unchanged sentence path
  // below, byte-for-byte (PA SW-3 additivity).
  if (paragraph.figure) {
    return (
      <div
        className="ps-paragraph ps-paragraph-figure"
        {...{ [paperSurfaceAnchorAttrs.paragraphId]: paragraph.id }}
      >
        {paragraph.figure.kind === 'figure' ? (
          <img className="ps-figure-image" src={paragraph.figure.src} alt={paragraph.figure.alt} />
        ) : (
          <div className="ps-figure-placeholder">〔表格：见原卷〕</div>
        )}
      </div>
    )
  }

  return (
    <p
      className="ps-paragraph"
      {...{ [paperSurfaceAnchorAttrs.paragraphId]: paragraph.id }}
    >
      {paragraph.sentences.map((sentence) => (
        <PaperSurfaceSentence
          key={sentence.id}
          sentence={sentence}
          evidenceItems={evidenceBySentence.get(sentence.id)}
          annotationItems={annotationsBySentence.get(sentence.id)}
          activeEvidenceId={activeEvidenceId}
          blankFocus={blankFocus}
          semanticNodes={
            semanticParagraph?.sentences.find((item) => item.id === sentence.id)?.nodes
          }
          semanticGroupType={semanticParagraph?.groupType}
        />
      ))}
    </p>
  )
}

/* ─── Sentence renderer ────────────────────────────────────────── */

type PaperSurfaceSentenceProps = {
  sentence: PaperTextSentence
  evidenceItems?: PaperEvidence[]
  annotationItems?: PaperAnnotation[]
  activeEvidenceId: string | null
  blankFocus: BlankFocusContext
  semanticNodes?: CanonicalSurfaceParagraph['sentences'][number]['nodes']
  semanticGroupType?: CanonicalSurfaceParagraph['groupType']
}

function PaperSurfaceSentence({
  sentence,
  evidenceItems,
  annotationItems,
  activeEvidenceId,
  blankFocus,
  semanticNodes,
  semanticGroupType,
}: PaperSurfaceSentenceProps): ReactNode {
  // Resolve the active evidence (if any) that lives inside THIS
  // sentence. PaperSurface stays dumb: the active id and the
  // sentence range come from props (controlled state + read-only
  // PaperEvidence record). No state, no hooks.
  //
  // Important: evidence anchors used to be zero-size sibling spans
  // appended after the sentence text, which made a visible highlight
  // impossible. C3 fixes that by slicing the sentence text into
  // [pre][match][post] for the active evidence and wrapping the
  // matching slice in a `<mark>` carrying the same neutral
  // `data-paper-evidence-id` / `data-paper-evidence-kind` anchor
  // attributes. The element kind shift (span → mark) is intentional:
  // it makes the active anchor sized and visually paintable while
  // leaving the neutral-anchor protocol untouched.
  const activeEv =
    activeEvidenceId && evidenceItems
      ? evidenceItems.find(
          (ev) =>
            ev.id === activeEvidenceId && ev.range.sentenceId === sentence.id,
        )
      : undefined

  // Clamp the range to the actual sentence text bounds so a stale or
  // mis-resolved range never throws. If the resolved range is empty
  // (start === end) we fall back to the neutral anchor — there is no
  // text to wrap inline.
  const text = sentence.text
  const rawStart = activeEv ? activeEv.range.start : 0
  const rawEnd = activeEv ? activeEv.range.end : 0
  const activeStart = activeEv ? Math.max(0, Math.min(text.length, rawStart)) : 0
  const activeEnd = activeEv
    ? Math.max(activeStart, Math.min(text.length, rawEnd))
    : 0
  const hasInlineActive = !!activeEv && activeEnd > activeStart

  return (
    <span
      className="ps-sentence"
      {...{ [paperSurfaceAnchorAttrs.sentenceId]: sentence.id }}
    >
      {semanticNodes && semanticGroupType ? (
        renderCanonicalPaperSentenceContent(
          semanticNodes,
          sentence.id,
          semanticGroupType,
          blankFocus,
          activeEv,
        )
      ) : hasInlineActive && activeEv ? (
        <>
          {renderLegacyPaperSentenceContent(text.slice(0, activeStart), `${sentence.id}-pre`, blankFocus)}
          <mark
            className="ps-evidence-anchor ps-evidence-anchor--active"
            {...{
              [paperSurfaceAnchorAttrs.evidenceId]: activeEv.id,
              [paperSurfaceAnchorAttrs.evidenceKind]: activeEv.kind,
            }}
          >
            {renderLegacyPaperSentenceContent(text.slice(activeStart, activeEnd), `${sentence.id}-active`, blankFocus)}
          </mark>
          {renderLegacyPaperSentenceContent(text.slice(activeEnd), `${sentence.id}-post`, blankFocus)}
        </>
      ) : (
        renderLegacyPaperSentenceContent(text, sentence.id, blankFocus)
      )}
      {/*
        Neutral evidence anchors — invisible, zero-size span siblings.
        We skip the active evidence here when it is already rendered
        inline above, so the cross-column dotted line geometry's
        first-DOM-occurrence policy resolves to the visible inline
        `<mark>` rather than the zero-size sibling. Non-active evidence
        keeps its neutral anchor (still queryable via
        `[data-paper-evidence-id]`) for future cuts.
      */}
      {evidenceItems &&
        evidenceItems.map((ev) =>
          hasInlineActive && activeEv && ev.id === activeEv.id ? null : (
            <span
              key={ev.id}
              className="ps-evidence-anchor"
              {...{
                [paperSurfaceAnchorAttrs.evidenceId]: ev.id,
                [paperSurfaceAnchorAttrs.evidenceKind]: ev.kind,
              }}
              aria-hidden="true"
            />
          ),
        )}
      {/* Neutral annotation anchors — invisible in B3 */}
      {annotationItems && annotationItems.map((ann) => (
        <span
          key={ann.id}
          className="ps-annotation-anchor"
          {...{
            [paperSurfaceAnchorAttrs.annotationId]: ann.id,
            [paperSurfaceAnchorAttrs.annotationKind]: ann.kind,
          }}
          aria-hidden="true"
        />
      ))}
      {' '}
    </span>
  )
}

/* ─── Question list renderer ───────────────────────────────────── */

type PaperSurfaceQuestionListProps = {
  questions: PaperQuestion[]
  lectureFocus: LectureFocus | null
  onQuestionClick: (questionId: string) => void
}

function PaperSurfaceQuestionList({
  questions,
  lectureFocus,
  onQuestionClick,
}: PaperSurfaceQuestionListProps): ReactNode {
  const sorted = useMemo(
    () => [...questions].sort((a, b) => a.order - b.order),
    [questions],
  )

  return (
    <ol className="ps-question-list">
      {sorted.map((q) => (
        <PaperSurfaceQuestionItem
          key={q.id}
          question={q}
          isActive={lectureFocus?.questionId === q.id}
          onQuestionClick={onQuestionClick}
        />
      ))}
    </ol>
  )
}

/* ─── Question item renderer ───────────────────────────────────── */

type PaperSurfaceQuestionItemProps = {
  question: PaperQuestion
  isActive: boolean
  onQuestionClick: (questionId: string) => void
}

function PaperSurfaceQuestionItem({
  question,
  isActive,
  onQuestionClick,
}: PaperSurfaceQuestionItemProps): ReactNode {
  // QA fix (PR #39): the whole question block is one focus target.
  //
  //   - The outer <li.ps-question> owns the click handler. Clicks on
  //     the question number, the stem button, OR any option label /
  //     text bubble to this single delegate.
  //   - <button.ps-question-stem-button> stays as the accessible
  //     keyboard / focus trigger (Enter / Space on the button still
  //     fires a click event that bubbles to the <li>), but it has NO
  //     own onClick. That avoids double toggling when the user
  //     mouse-clicks the stem (button click + bubbled li click would
  //     otherwise toggle twice and end up where it started).
  //   - Options remain plain <li> rows. They are NOT buttons and they
  //     do NOT carry answer-selection semantics — they are just hit
  //     surface for the question's focus delegate.
  const trimmedStem = question.stem.trim()
  const hasOptions = question.options.length > 0

  // Empty-stem policy (surface-question-policy cut) — mirrors the
  // print/docx export policy (server/print-renderer.mjs's empty-stem
  // branch): the question number is already inline in the passage
  // (cloze `__41__` / grammar-fill `56._____`), so a stem that carries
  // no information collapses instead of rendering a blank/duplicate row.
  //   - empty stem + no options → nothing to render (grammar-fill: the
  //     blank already carries the number in the passage).
  //   - empty stem + options → number + options collapse onto ONE line
  //     (real-paper cloze form "41. A. xx  B. xx  C. xx  D. xx").
  // PI analysis surfaces (I9 cloze-analysis-v1 etc.) pass a numeric,
  // non-empty stem — their adapters never suppress it — so they never
  // hit either branch here; this policy is a no-op for them.
  if (!trimmedStem && !hasOptions) {
    return null
  }

  return (
    <li
      className={isActive ? 'ps-question ps-question--active' : 'ps-question'}
      {...{ [paperSurfaceAnchorAttrs.questionId]: question.id }}
      onClick={() => onQuestionClick(question.id)}
    >
      {!trimmedStem && hasOptions ? (
        <button
          type="button"
          className="ps-question-stem-button"
          aria-pressed={isActive}
          aria-label={`Focus question ${question.questionNo}`}
        >
          <span className="ps-question-no">{question.questionNo}.</span>
          <span
            className={`ps-question-options-inline${question.canonicalPlacement ? ` ps-question-options-inline--${question.canonicalPlacement.mode}` : ''}`}
            data-canonical-placement-signature={question.canonicalPlacement?.signature}
          >
            {question.options.map((opt) => (
              <span
                key={`${question.id}-${opt.label}`}
                className="ps-question-options-inline-item"
                {...{ [paperSurfaceAnchorAttrs.optionLabel]: opt.label }}
              >
                <span className="ps-option-label">{opt.label}.</span> {opt.text}
              </span>
            ))}
          </span>
        </button>
      ) : (
        <>
          <button
            type="button"
            className="ps-question-stem-button"
            aria-pressed={isActive}
            aria-label={`Focus question ${question.questionNo}`}
          >
            <span className="ps-question-no">{question.questionNo}.</span>
            <span className="ps-question-stem">{question.stem}</span>
          </button>
          {hasOptions && (
            <PaperSurfaceOptionList
              questionId={question.id}
              options={question.options}
            />
          )}
        </>
      )}
    </li>
  )
}

/* ─── Option list renderer ─────────────────────────────────────── */

type PaperSurfaceOptionListProps = {
  questionId: string
  options: ReadonlyArray<PaperQuestionOption>
}

function PaperSurfaceOptionList({
  questionId,
  options,
}: PaperSurfaceOptionListProps): ReactNode {
  return (
    <ol className="ps-option-list">
      {options.map((opt) => (
        <li
          key={`${questionId}-${opt.label}`}
          className="ps-option"
          {...{ [paperSurfaceAnchorAttrs.optionLabel]: opt.label }}
        >
          <span className="ps-option-label">{opt.label}.</span>
          <span className="ps-option-text">{opt.text}</span>
        </li>
      ))}
    </ol>
  )
}

/* ─── Option bank renderer (seven-options-on-paper) ────────────── */

/**
 * Static A-G candidate-sentence pool for 七选五, printed once after the
 * passage. Deliberately the ONLY option renderer in this file with:
 *   - no `paperSurfaceAnchorAttrs` (no `data-paper-*` anchor of any kind),
 *   - no `onClick` / focus wiring of any kind.
 * It is pure display, mirroring the docx handout export's deduped
 * "选项" block (single column, `A. ` prefix) — see
 * `docs/cuts/seven-options-on-paper/plan.md` for the format-language
 * source. PaperSurface stays dumb: this never calls back into the host.
 */
type PaperSurfaceOptionBankProps = {
  options: ReadonlyArray<PaperQuestionOption>
}

function PaperSurfaceOptionBank({
  options,
}: PaperSurfaceOptionBankProps): ReactNode {
  return (
    <ol className="ps-option-bank">
      {options.map((opt) => (
        <li key={opt.label} className="ps-option-bank-item">
          <span className="ps-option-label">{opt.label}.</span>
          <span className="ps-option-bank-text">{opt.text}</span>
        </li>
      ))}
    </ol>
  )
}
