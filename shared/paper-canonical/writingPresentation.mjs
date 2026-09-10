import { resolveConsumerPresentation } from './consumers.mjs'

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
    materialBlocks: sourceBlocks.filter((block) => !refs.has(block.nodeId)),
    starterLines,
    presentationPolicyRef: presentation?.ref || null,
  }
}
