/**
 * section-chrome-on-solo-surface cut.
 *
 * The paper-asset `content.blocks` array is the whole-paper document-order
 * stream PaperBrowsePage already renders in full (partHeading / sectionHeading
 * / instruction / group / …). The Paper Intelligence solo-group harness only
 * ever mounts ONE group's `PaperSurface`, so it never consumed the
 * `sectionHeading` / `instruction` blocks that sit just above that group in
 * the stream — the "纸" rendered with no 节标题/指导语 on top.
 *
 * This is a pure lookup: walk `content.blocks` backward from the target
 * group's own `group` block, collecting an immediately-preceding run of
 * `sectionHeading` / `instruction` blocks. Stops at the first block that is
 * neither type — typically a `partHeading` (卷层「第二部分」标题, deliberately
 * excluded from the solo view per plan) or another `group` block (the
 * previous group's own chrome). Old assets with no such blocks resolve to
 * `EMPTY_GROUP_CHROME` — zero render, zero placeholder.
 */
import type { PaperAssetV1 } from '../../domain/paperAsset.ts'

export type GroupChromeBlocks = {
  sectionHeading: string | null
  instruction: string | null
}

export const EMPTY_GROUP_CHROME: GroupChromeBlocks = {
  sectionHeading: null,
  instruction: null,
}

export function resolveGroupChromeBlocks(asset: PaperAssetV1, groupId: string): GroupChromeBlocks {
  const blocks = asset.content.blocks
  const groupIdx = blocks.findIndex((block) => block.type === 'group' && block.groupId === groupId)
  if (groupIdx < 0) return EMPTY_GROUP_CHROME

  let sectionHeading: string | null = null
  let instruction: string | null = null
  for (let i = groupIdx - 1; i >= 0; i -= 1) {
    const block = blocks[i]
    if (block.type === 'instruction') {
      instruction = block.text
      continue
    }
    if (block.type === 'sectionHeading') {
      sectionHeading = block.text
      continue
    }
    break
  }
  return { sectionHeading, instruction }
}
