import type { CSSProperties, ReactNode } from 'react'
import { paperSurfaceAnchorAttrs } from '../../../../shared/papersurface/anchorKeys.mjs'
import { paperBlankRuling } from '../../../../shared/papersurface/blankRuling.mjs'
import type {
  CanonicalSurfaceBlankNode,
  CanonicalSurfaceParagraph,
  CanonicalSurfaceTextNode,
} from '../../../../shared/paper-normalization/canonicalClozeSurfaceAdapter.mjs'

type CanonicalBlankFocus = {
  readonly renderer: 'grammar-fill' | 'paper-blank'
  readonly activeQuestionId: string | null
  readonly onQuestionClick: (questionId: string) => void
} | null

type CanonicalBlankStyle = CSSProperties & Record<`--${string}`, string | number>

/**
 * Render canonical semantic nodes without importing or reparsing legacy
 * raw-marker patterns.
 */
export function renderCanonicalPaperSentenceContent(
  nodes: ReadonlyArray<CanonicalSurfaceTextNode | CanonicalSurfaceBlankNode>,
  keyPrefix: string,
  groupType: CanonicalSurfaceParagraph['groupType'],
  blankFocus: CanonicalBlankFocus,
): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === 'text') {
      return <span key={`${keyPrefix}-semantic-text-${index}`}>{node.text}</span>
    }

    const isClickable = blankFocus?.renderer === 'paper-blank'
    const isActive = blankFocus?.activeQuestionId === node.questionId
    const className = isClickable
      ? isActive
        ? 'ps-paper-blank ps-paper-blank--semantic ps-paper-blank--clickable ps-paper-blank--active'
        : 'ps-paper-blank ps-paper-blank--semantic ps-paper-blank--clickable'
      : 'ps-paper-blank ps-paper-blank--semantic'
    const style = {
      '--ps-paper-blank-width': paperBlankRuling[groupType].width,
    } as CanonicalBlankStyle
    const blank = isClickable ? (
      <button
        key={`${keyPrefix}-semantic-blank-${node.blankId}`}
        type="button"
        className={className}
        style={style}
        aria-pressed={isActive}
        aria-label={`聚焦第 ${node.questionNo} 题`}
        onClick={() => blankFocus.onQuestionClick(node.questionId)}
        {...{ [paperSurfaceAnchorAttrs.blankId]: node.blankId }}
      >
        {node.questionNo}
      </button>
    ) : (
      <span
        key={`${keyPrefix}-semantic-blank-${node.blankId}`}
        className={className}
        style={style}
        {...{ [paperSurfaceAnchorAttrs.blankId]: node.blankId }}
      >
        {node.questionNo}
      </span>
    )

    if (!node.hint) return blank
    return (
      <span
        key={`${keyPrefix}-semantic-blank-with-hint-${node.blankId}`}
        className="ps-paper-blank-unit"
      >
        {blank}
        <span className="ps-paper-blank-hint">({node.hint})</span>
      </span>
    )
  })
}
