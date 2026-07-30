import type {
  PaperAssetV1,
  PaperContentBlock,
} from '../../domain/paperAsset.ts'
import type {
  WholePaperConsumption,
} from '../paper-intelligence/canonicalConsumptionClient.ts'
import {
  assertCanonicalVisibleStructure,
} from '../../../../shared/paper-canonical/visibleStructure.mjs'

function rejected(message: string): Error {
  const error = new Error(message)
  error.name = 'CanonicalPaperBrowseProjectionError'
  return error
}

/**
 * Project the legacy asset's structural chrome onto the ready whole-paper
 * Consumption Plan. The Plan exclusively owns every active Group identity;
 * inactive Listening is source-only and therefore has no rendered Group.
 */
export function projectAssetBlocksToCanonicalConsumption(
  asset: PaperAssetV1,
  consumption: WholePaperConsumption,
): PaperAssetV1 {
  if (
    Array.isArray(consumption.visibleStructure)
    || Number(consumption.authorityRef?.manifestVersion) >= 30
  ) assertCanonicalVisibleStructure(consumption.visibleStructure)
  const consumedGroupIds = new Set(
    consumption.selections.flatMap((selection) => selection.groupIds),
  )
  const activeAssetGroupIds = new Set<string>()
  for (const block of asset.content.blocks) {
    if (block.type !== 'group') continue
    const group = asset.content.groups[block.groupId]
    if (!group) {
      throw rejected(`PaperBrowse asset Group is missing: ${block.groupId}`)
    }
    if (group.groupType === 'listening') {
      if (consumedGroupIds.has(block.groupId)) {
        throw rejected(
          `Inactive Listening cannot enter the Consumption Plan: ${block.groupId}`,
        )
      }
      continue
    }
    if (activeAssetGroupIds.has(block.groupId)) {
      const familyLabel =
        group.groupType === 'sevenChoices'
          ? 'Seven Choices'
          : group.groupType === 'cloze'
            ? 'Cloze'
            : 'Canonical'
      throw rejected(
        `PaperBrowse ${familyLabel} Group occurs more than once: ${block.groupId}`,
      )
    }
    activeAssetGroupIds.add(block.groupId)
    if (!consumedGroupIds.has(block.groupId)) {
      throw rejected(
        `PaperBrowse Group is outside the Consumption Plan: ${block.groupId}`,
      )
    }
  }
  for (const groupId of consumedGroupIds) {
    if (!activeAssetGroupIds.has(groupId)) {
      throw rejected(
        `Consumption Plan Group is absent from PaperBrowse: ${groupId}`,
      )
    }
  }

  if (Array.isArray(consumption.visibleStructure)) {
    const projectedBlocks: PaperContentBlock[] = []
    const sourcePartIds: string[] = []
    const sourceSectionIds: string[] = []
    const pageBreakAfterGroupIds = new Set<string>()
    let sourcePartId: string | null = null
    let sourceSectionId: string | null = null
    for (const block of asset.content.blocks) {
      if (block.type === 'partHeading') {
        sourcePartId = block.partId
        sourceSectionId = null
      } else if (block.type === 'sectionHeading') {
        sourceSectionId = block.sectionId
      } else if (
        block.type === 'group'
        && consumedGroupIds.has(block.groupId)
      ) {
        if (
          sourcePartId
          && sourcePartIds.at(-1) !== sourcePartId
        ) sourcePartIds.push(sourcePartId)
        if (
          sourceSectionId
          && sourceSectionIds.at(-1) !== sourceSectionId
        ) sourceSectionIds.push(sourceSectionId)
      }
    }
    for (const [index, block] of asset.content.blocks.entries()) {
      if (
        block.type === 'group'
        && asset.content.blocks[index + 1]?.type === 'pageBreakHint'
      ) pageBreakAfterGroupIds.add(block.groupId)
    }
    let partIndex = 0
    let sectionIndex = 0
    let pendingPart: {
      partId: string
      instructionId: string
    } | null = null
    let pendingSection: {
      sectionId: string
      instructionId: string
    } | null = null
    const visibleGroupIds = new Set<string>()
    for (const node of consumption.visibleStructure) {
      if (node.kind === 'part') {
        pendingPart = node
        pendingSection = null
        continue
      }
      if (node.kind === 'section') {
        pendingSection = node
        continue
      }
      if (node.kind === 'instruction') {
        const currentPart = pendingPart
        const currentSection = pendingSection
        if (
          node.placement === 'part_heading'
          && currentPart !== null
          && currentPart.instructionId === node.instructionId
        ) {
          projectedBlocks.push({
            type: 'partHeading',
            partId: sourcePartIds[partIndex++] || currentPart.partId,
            text: node.text,
          })
          pendingPart = null
          continue
        }
        if (
          node.placement === 'section_heading'
          && currentSection !== null
          && currentSection.instructionId === node.instructionId
        ) {
          projectedBlocks.push({
            type: 'sectionHeading',
            sectionId:
              sourceSectionIds[sectionIndex++] || currentSection.sectionId,
            text: node.text,
          })
          pendingSection = null
          continue
        }
        if (node.placement === 'group_instruction') {
          projectedBlocks.push({
            type: 'instruction',
            instructionId: node.instructionId,
            text: node.text,
          })
          continue
        }
        throw rejected(
          `Canonical visible instruction is structurally orphaned: ${node.instructionId}`,
        )
      }
      if (node.kind === 'group') {
        if (
          !consumedGroupIds.has(node.groupId)
          || visibleGroupIds.has(node.groupId)
        ) {
          throw rejected(
            `Canonical visible Group is absent, duplicated, or outside the Consumption Plan: ${node.groupId}`,
          )
        }
        visibleGroupIds.add(node.groupId)
        projectedBlocks.push({ type: 'group', groupId: node.groupId })
        if (pageBreakAfterGroupIds.has(node.groupId)) {
          projectedBlocks.push({ type: 'pageBreakHint' })
        }
      }
    }
    if (pendingPart || pendingSection) {
      throw rejected('Canonical visible chrome ends with an unresolved heading')
    }
    if (
      visibleGroupIds.size !== consumedGroupIds.size
      || [...consumedGroupIds].some((groupId) => !visibleGroupIds.has(groupId))
    ) {
      throw rejected('Canonical visible structure does not close every consumed Group')
    }
    return {
      ...asset,
      content: {
        ...asset.content,
        blocks: projectedBlocks,
      },
    }
  }

  if (Number(consumption.authorityRef?.manifestVersion) >= 30) {
    throw rejected('Current canonical Consumption Plan lacks visible structure')
  }

  const blocks = asset.content.blocks
  const firstPartIndex = blocks.findIndex(
    (block) => block.type === 'partHeading',
  )
  const projectedBlocks: PaperContentBlock[] =
    firstPartIndex < 0 ? [] : blocks.slice(0, firstPartIndex)
  const segmentStart = firstPartIndex < 0 ? 0 : firstPartIndex

  for (let start = segmentStart; start < blocks.length;) {
    let end = start + 1
    if (blocks[start]?.type === 'partHeading') {
      while (end < blocks.length && blocks[end].type !== 'partHeading') {
        end += 1
      }
    } else {
      end = blocks.length
    }
    const segment = blocks.slice(start, end)
    const hasConsumedGroup = segment.some(
      (block) =>
        block.type === 'group' && consumedGroupIds.has(block.groupId),
    )
    if (hasConsumedGroup) {
      projectedBlocks.push(...segment.filter(
        (block) =>
          block.type !== 'group' || consumedGroupIds.has(block.groupId),
      ))
    }
    start = end
  }

  return {
    ...asset,
    content: {
      ...asset.content,
      blocks: projectedBlocks,
    },
  }
}
