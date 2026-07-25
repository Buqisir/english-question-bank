import type { ReactNode } from 'react'
import { paperBlankPattern } from '../../../../shared/papersurface/blankPattern.mjs'
import { grammarFillBlankPattern } from './grammarFillBlank.ts'

export type LegacyBlankFocusContext = {
  readonly renderer: 'grammar-fill' | 'paper-blank'
  readonly questionIdByNo: Map<string, string>
  readonly activeQuestionId: string | null
  readonly onQuestionClick: (questionId: string) => void
} | null

/**
 * Legacy-only raw-marker renderer. Canonical semantic rendering is isolated
 * in CanonicalPaperSentenceContent and never imports these patterns.
 */
export function renderLegacyPaperSentenceContent(
  text: string,
  keyPrefix: string,
  blankFocus: LegacyBlankFocusContext = null,
): ReactNode {
  if (blankFocus?.renderer === 'grammar-fill') {
    return renderTextWithGrammarFillBlanks(text, keyPrefix, blankFocus)
  }
  if (blankFocus?.renderer === 'paper-blank') {
    return renderTextWithClickablePaperBlanks(text, keyPrefix, blankFocus)
  }
  if (!paperBlankPattern.test(text)) return text
  paperBlankPattern.lastIndex = 0
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = paperBlankPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }
    nodes.push(
      <span key={`${keyPrefix}-paper-blank-${index}`} className="ps-paper-blank">
        {match[1]}
      </span>,
    )
    cursor = match.index + match[0].length
    index += 1
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }
  return nodes
}

function renderTextWithClickablePaperBlanks(
  text: string,
  keyPrefix: string,
  blankFocus: NonNullable<LegacyBlankFocusContext>,
): ReactNode {
  if (!paperBlankPattern.test(text)) return text
  paperBlankPattern.lastIndex = 0
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = paperBlankPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }
    const blankNo = match[1]
    const questionId = blankFocus.questionIdByNo.get(blankNo) ?? null
    const key = `${keyPrefix}-paper-blank-${index}`
    if (questionId) {
      const isActive = blankFocus.activeQuestionId === questionId
      nodes.push(
        <button
          key={key}
          type="button"
          className={
            isActive
              ? 'ps-paper-blank ps-paper-blank--clickable ps-paper-blank--active'
              : 'ps-paper-blank ps-paper-blank--clickable'
          }
          aria-pressed={isActive}
          aria-label={`聚焦第 ${blankNo} 题`}
          onClick={() => blankFocus.onQuestionClick(questionId)}
        >
          {blankNo}
        </button>,
      )
    } else {
      nodes.push(
        <span key={key} className="ps-paper-blank">
          {blankNo}
        </span>,
      )
    }
    cursor = match.index + match[0].length
    index += 1
  }
  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }
  return nodes
}

function renderTextWithGrammarFillBlanks(
  text: string,
  keyPrefix: string,
  blankFocus: NonNullable<LegacyBlankFocusContext>,
): ReactNode {
  grammarFillBlankPattern.lastIndex = 0
  const nodes: ReactNode[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  let index = 0
  while ((match = grammarFillBlankPattern.exec(text)) !== null) {
    if (match.index > cursor) {
      nodes.push(text.slice(cursor, match.index))
    }
    const blankNo = match[1]
    const label = match[0]
    const questionId = blankFocus.questionIdByNo.get(blankNo) ?? null
    const key = `${keyPrefix}-gf-blank-${index}`
    if (questionId) {
      const isActive = blankFocus.activeQuestionId === questionId
      nodes.push(
        <button
          key={key}
          type="button"
          className={
            isActive
              ? 'ps-paper-blank-button ps-paper-blank-button--active'
              : 'ps-paper-blank-button'
          }
          aria-pressed={isActive}
          aria-label={`聚焦第 ${blankNo} 题`}
          onClick={() => blankFocus.onQuestionClick(questionId)}
        >
          {label}
        </button>,
      )
    } else {
      nodes.push(
        <span key={key} className="ps-paper-blank-text">
          {label}
        </span>,
      )
    }
    cursor = match.index + match[0].length
    index += 1
  }
  if (index === 0) return text
  if (cursor < text.length) {
    nodes.push(text.slice(cursor))
  }
  return nodes
}
