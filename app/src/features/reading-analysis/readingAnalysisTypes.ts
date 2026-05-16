/**
 * Reading Analysis Layer — minimal types.
 *
 * This is the V0 PoC for the "题目 ↔ 原文证据虚线" loop. The model is small on
 * purpose: a Passage is an array of paragraphs (each with sentence-level
 * spans), a Question is a stem + 4 options, and an EvidenceLink connects
 * (question or option) → annotation.
 */

export type AnnotationKind = 'evidence' | 'trap'

/**
 * A range inside the passage. We address paragraphs by index (0-based) and
 * use a sentence-id to anchor the DOM. `start` / `end` are kept for future
 * use when we render via offsets, but the V0 renderer uses sentenceId only.
 */
export type TextAnchor = {
  id: string
  paragraphIndex: number
  sentenceId: string
  start: number
  end: number
  quote: string
}

export type ReadingAnnotation = {
  id: string
  kind: AnnotationKind
  target: TextAnchor
}

export type EvidenceLinkSource = {
  questionId: string
  optionKey?: 'A' | 'B' | 'C' | 'D'
}

export type EvidenceLink = {
  id: string
  from: EvidenceLinkSource
  toAnnotationId: string
  kind: 'support' | 'trap'
}

export type PassageSentence = {
  id: string
  text: string
}

export type PassageParagraph = {
  id: string
  sentences: PassageSentence[]
}

export type Passage = {
  id: string
  title: string
  paragraphs: PassageParagraph[]
}

export type QuestionOption = {
  key: 'A' | 'B' | 'C' | 'D'
  text: string
  correct: boolean
  rationale: string
}

export type Question = {
  id: string
  stem: string
  options: QuestionOption[]
  /** Human-readable explanation shown next to the question card. */
  explanation: string
}

export type ReadingAnalysisFixture = {
  passage: Passage
  annotations: ReadingAnnotation[]
  question: Question
  /** Bidirectional set of links — UI picks which one to render based on selection. */
  links: EvidenceLink[]
}

/** Selection in the question panel that drives which (if any) link is drawn. */
export type ActiveSelection =
  | { kind: 'none' }
  | { kind: 'stem'; questionId: string }
  | { kind: 'option'; questionId: string; optionKey: 'A' | 'B' | 'C' | 'D' }
