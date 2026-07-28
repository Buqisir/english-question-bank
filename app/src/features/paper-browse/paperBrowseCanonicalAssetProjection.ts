import type {
  PaperAssetV1,
  PaperContentBlock,
} from '../../domain/paperAsset.ts'
import type {
  WholePaperConsumption,
} from '../paper-intelligence/canonicalConsumptionClient.ts'

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
