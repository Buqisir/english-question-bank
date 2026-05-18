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
  '--ps-passage-line-height': paperSurfaceTokens.passageLineHeight,
  '--ps-question-line-height': paperSurfaceTokens.questionLineHeight,
  '--ps-passage-indent': paperSurfaceTokens.passageIndent,
  '--ps-options-grid-columns': paperSurfaceTokens.optionsGridColumns,
  '--ps-options-grid-gap-x': paperSurfaceTokens.optionsGridGapX,
}

export function PaperSurface(props: PaperSurfaceProps): ReactNode {
  const {
    textMap,
    annotations,
    evidence,
    questions,
    mode,
    lectureFocus,
    // readingFocusBySection is accepted but not rendered in B3.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    readingFocusBySection: _readingFocusBySection,
    onFocusIntent,
  } = props

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
          />
        ))}
        {/* Render global questions (no section) */}
        {questionsBySection.has('__global__') && (
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

  return (
    <section
      className="ps-section"
      {...{ [paperSurfaceAnchorAttrs.section]: section }}
    >
      <div className="ps-passage-body">
        {paragraphs.map((para) => (
          <PaperSurfaceParagraph
            key={para.id}
            paragraph={para}
            evidenceBySentence={evidenceBySentence}
            annotationsBySentence={annotationsBySentence}
            activeEvidenceId={activeEvidenceId}
          />
        ))}
      </div>
      {questions.length > 0 && (
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
}

function PaperSurfaceParagraph({
  paragraph,
  evidenceBySentence,
  annotationsBySentence,
  activeEvidenceId,
}: PaperSurfaceParagraphProps): ReactNode {
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
}

function PaperSurfaceSentence({
  sentence,
  evidenceItems,
  annotationItems,
  activeEvidenceId,
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
      {hasInlineActive && activeEv ? (
        <>
          {text.slice(0, activeStart)}
          <mark
            className="ps-evidence-anchor ps-evidence-anchor--active"
            {...{
              [paperSurfaceAnchorAttrs.evidenceId]: activeEv.id,
              [paperSurfaceAnchorAttrs.evidenceKind]: activeEv.kind,
            }}
          >
            {text.slice(activeStart, activeEnd)}
          </mark>
          {text.slice(activeEnd)}
        </>
      ) : (
        text
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
  return (
    <li
      className={isActive ? 'ps-question ps-question--active' : 'ps-question'}
      {...{ [paperSurfaceAnchorAttrs.questionId]: question.id }}
      onClick={() => onQuestionClick(question.id)}
    >
      <button
        type="button"
        className="ps-question-stem-button"
        aria-pressed={isActive}
        aria-label={`Focus question ${question.questionNo}`}
      >
        <span className="ps-question-no">{question.questionNo}.</span>
        <span className="ps-question-stem">{question.stem}</span>
      </button>
      {question.options.length > 0 && (
        <PaperSurfaceOptionList
          questionId={question.id}
          options={question.options}
        />
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
