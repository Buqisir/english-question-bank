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
  // Group paragraphs by section for ordered rendering.
  const sections = useMemo(() => {
    const sectionSet = new Set<string>()
    for (const para of textMap.paragraphs) {
      sectionSet.add(para.section)
    }
    return Array.from(sectionSet)
  }, [textMap])

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
  onQuestionClick: (questionId: string) => void
}

function PaperSurfaceSection({
  section,
  textMap,
  questions,
  evidenceForSection,
  annotationsBySentence,
  lectureFocus,
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
}

function PaperSurfaceParagraph({
  paragraph,
  evidenceBySentence,
  annotationsBySentence,
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
}

function PaperSurfaceSentence({
  sentence,
  evidenceItems,
  annotationItems,
}: PaperSurfaceSentenceProps): ReactNode {
  // Render sentence text as a span with the sentence anchor.
  // Evidence and annotation anchors are emitted as neutral marks
  // (no visual paint in B3).
  return (
    <span
      className="ps-sentence"
      {...{ [paperSurfaceAnchorAttrs.sentenceId]: sentence.id }}
    >
      {sentence.text}
      {/* Neutral evidence anchors — invisible in B3 */}
      {evidenceItems && evidenceItems.map((ev) => (
        <span
          key={ev.id}
          className="ps-evidence-anchor"
          {...{
            [paperSurfaceAnchorAttrs.evidenceId]: ev.id,
            [paperSurfaceAnchorAttrs.evidenceKind]: ev.kind,
          }}
          aria-hidden="true"
        />
      ))}
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
  return (
    <li
      className={isActive ? 'ps-question ps-question--active' : 'ps-question'}
      {...{ [paperSurfaceAnchorAttrs.questionId]: question.id }}
    >
      <button
        type="button"
        className="ps-question-stem-button"
        onClick={() => onQuestionClick(question.id)}
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
