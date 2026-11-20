import { resolveConsumerPresentation } from './consumers.mjs'

// Writing questions are numbered 10 or higher, so prompt list items such as
// "1. 学习活动状况描述" never match.
const NUMBER_PREFIX = /^\s*[1-9]\d{1,2}\s*[.．、]\s*/u

// Display only: preserve source IDs/marks and all later numbered list items.
/** @template T @param {ReadonlyArray<T>} blocks @returns {T[]} */
export function writingPromptBlocksForDisplay(blocks) {
  const first = blocks.findIndex(block => block.kind !== 'figure')
  return blocks.map((block, index) => {
    if (index !== first) return block
    const key = block.inlines ? 'inlines' : 'nodes'
    const nodes = block[key]
    if (!Array.isArray(nodes)) {
      const prefix = typeof block.text === 'string' && block.text.match(NUMBER_PREFIX)?.[0]
      return prefix ? { ...block, text: block.text.slice(prefix.length) } : block
    }
    let leadingText = ''
    for (const node of nodes) {
      if (typeof node.text !== 'string') break
      leadingText += node.text
    }
    const prefix = leadingText.match(NUMBER_PREFIX)?.[0]
    if (!prefix) return block
    let remaining = prefix.length
    const displayed = nodes.map(node => {
      if (!remaining || typeof node.text !== 'string') return node
      const removed = Math.min(remaining, node.text.length)
      remaining -= removed
      return removed ? { ...node, text: node.text.slice(removed) } : node
    })
    return {
      ...block,
      [key]: displayed,
      ...(typeof block.text === 'string' && block.text.startsWith(prefix)
        ? { text: block.text.slice(prefix.length) } : {}),
    }
  })
}

// Presentation is deliberately separate from the signed semantic projection.
// Callers supply the selected group's source consumer, including in composites.
export function continuationWritingPresentation(group, consumerContractRef) {
  const presentation = resolveConsumerPresentation(consumerContractRef)
  const opaque = group.writingMode === 'legacy_opaque'
  const sourceBlocks = opaque ? group.sourceBlocks : group.materialBlocks
  const useSourceRefs = opaque && (
    (presentation?.policy.continuationStarters === 'validated_source_refs_in_response'
      && group.sourceStarterBlockRefs?.length === 2)
    || group.sourceStarterLinesInResponse
  )
  const starterLines = useSourceRefs
    ? (group.sourceStarterBlockRefs || []).map((contentRef) => {
        const block = sourceBlocks.find((candidate) => candidate.nodeId === contentRef)
        if (!block) throw new Error(`Canonical Continuation Writing starter ${contentRef} is absent from source blocks`)
        return {
          starterId: contentRef,
          contentRef,
          authorityObservationRef: group.occurrenceSignature,
          text: block.text,
          inlines: block.inlines,
        }
      })
    : group.answerRegion.starterLines || []
  const refs = new Set(starterLines.map((starter) => starter.contentRef || starter.starterId))
  return {
    materialBlocks: writingPromptBlocksForDisplay(sourceBlocks).filter((block) => !refs.has(block.nodeId)),
    starterLines,
    presentationPolicyRef: presentation?.ref || null,
  }
}
