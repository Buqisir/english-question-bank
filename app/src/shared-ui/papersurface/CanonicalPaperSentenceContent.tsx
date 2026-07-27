import type { CSSProperties, ReactElement, ReactNode } from 'react'
import { paperSurfaceAnchorAttrs } from '../../../../shared/papersurface/anchorKeys.mjs'
import { paperBlankRuling } from '../../../../shared/papersurface/blankRuling.mjs'
import type {
  CanonicalSurfaceBlankNode,
  CanonicalSurfaceParagraph,
  CanonicalSurfaceTextNode,
} from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { formatCanonicalBlankVisibleText } from '../../../../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import type { PaperEvidence } from '../../../../shared/papersurface/types'

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
  activeEvidence?: PaperEvidence,
): ReactNode {
  const visibleLength = nodes.reduce(
    (length, node) => length + canonicalNodeVisibleText(node).length,
    0,
  )
  if (
    activeEvidence
    && (
      !Number.isInteger(activeEvidence.range.start)
      || !Number.isInteger(activeEvidence.range.end)
      || activeEvidence.range.start < 0
      || activeEvidence.range.end <= activeEvidence.range.start
      || activeEvidence.range.end > visibleLength
    )
  ) {
    throw new Error(
      `[CANONICAL_EVIDENCE_RANGE_OUT_OF_BOUNDS] ${activeEvidence.id} references `
      + `${keyPrefix}[${activeEvidence.range.start},${activeEvidence.range.end}) `
      + `with length ${visibleLength}.`,
    )
  }

  let visibleOffset = 0
  return nodes.flatMap((node, index) => {
    const nodeStart = visibleOffset
    const nodeEnd = nodeStart + canonicalNodeVisibleText(node).length
    visibleOffset = nodeEnd

    if (node.type === 'text') {
      if (
        !activeEvidence
        || activeEvidence.range.end <= nodeStart
        || activeEvidence.range.start >= nodeEnd
      ) {
        return [<span key={`${keyPrefix}-semantic-text-${index}`}>{node.text}</span>]
      }
      const activeStart = Math.max(activeEvidence.range.start, nodeStart) - nodeStart
      const activeEnd = Math.min(activeEvidence.range.end, nodeEnd) - nodeStart
      const renderedText: ReactElement[] = []
      if (node.text.slice(0, activeStart)) {
        renderedText.push(
          <span key={`${keyPrefix}-semantic-text-${index}-pre`}>
            {node.text.slice(0, activeStart)}
          </span>,
        )
      }
      renderedText.push(
        <mark
          key={`${keyPrefix}-semantic-text-${index}-active`}
          className="ps-evidence-anchor ps-evidence-anchor--active"
          {...{
            [paperSurfaceAnchorAttrs.evidenceId]: activeEvidence.id,
            [paperSurfaceAnchorAttrs.evidenceKind]: activeEvidence.kind,
          }}
        >
          {node.text.slice(activeStart, activeEnd)}
        </mark>,
      )
      if (node.text.slice(activeEnd)) {
        renderedText.push(
          <span key={`${keyPrefix}-semantic-text-${index}-post`}>
            {node.text.slice(activeEnd)}
          </span>,
        )
      }
      return renderedText
    }

    const isClickable = blankFocus !== null
    const isActive = blankFocus?.activeQuestionId === node.questionId
    const className = isClickable
      ? isActive
        ? 'ps-paper-blank ps-paper-blank--semantic ps-paper-blank--clickable ps-paper-blank--active'
        : 'ps-paper-blank ps-paper-blank--semantic ps-paper-blank--clickable'
      : 'ps-paper-blank ps-paper-blank--semantic'
    const style = {
      '--ps-paper-blank-width': paperBlankRuling[groupType].width,
    } as CanonicalBlankStyle
    const canonicalPairAttrs = groupType === 'sevenChoices'
      ? {
          'data-canonical-pair': `${node.questionId}:${node.blankId}`,
          'data-canonical-question-id': node.questionId,
          'data-canonical-blank-id': node.blankId,
        }
      : {}
    const blank = isClickable ? (
      <button
        key={`${keyPrefix}-semantic-blank-${node.blankId}`}
        type="button"
        className={className}
        style={style}
        aria-pressed={isActive}
        aria-label={`聚焦第 ${node.questionNo} 题`}
        onClick={() => blankFocus.onQuestionClick(node.questionId)}
        {...{
          [paperSurfaceAnchorAttrs.blankId]: node.blankId,
          ...canonicalPairAttrs,
        }}
      >
        {node.questionNo}
      </button>
    ) : (
      <span
        key={`${keyPrefix}-semantic-blank-${node.blankId}`}
        className={className}
        style={style}
        {...{
          [paperSurfaceAnchorAttrs.blankId]: node.blankId,
          ...canonicalPairAttrs,
        }}
      >
        {node.questionNo}
      </span>
    )

    const blankUnit = !node.hint ? blank : (
      <span
        key={`${keyPrefix}-semantic-blank-with-hint-${node.blankId}`}
        className="ps-paper-blank-unit"
      >
        {blank}
        <span className="ps-paper-blank-hint">({node.hint})</span>
      </span>
    )

    if (
      !activeEvidence
      || activeEvidence.range.end <= nodeStart
      || activeEvidence.range.start >= nodeEnd
    ) {
      return [blankUnit]
    }
    if (
      activeEvidence.range.start > nodeStart
      || activeEvidence.range.end < nodeEnd
    ) {
      throw new Error(
        `[CANONICAL_EVIDENCE_SPLITS_BLANK] ${activeEvidence.id} splits ${node.blankId}.`,
      )
    }
    return [
      <mark
        key={`${keyPrefix}-semantic-blank-${node.blankId}-active-evidence`}
        className="ps-evidence-anchor ps-evidence-anchor--active"
        {...{
          [paperSurfaceAnchorAttrs.evidenceId]: activeEvidence.id,
          [paperSurfaceAnchorAttrs.evidenceKind]: activeEvidence.kind,
        }}
      >
        {blankUnit}
      </mark>,
    ]
  })
}

function canonicalNodeVisibleText(
  node: CanonicalSurfaceTextNode | CanonicalSurfaceBlankNode,
): string {
  if (node.type === 'text') return node.text
  return formatCanonicalBlankVisibleText(node.questionNo, node.hint)
}
