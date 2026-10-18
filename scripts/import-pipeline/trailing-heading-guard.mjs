const WRITING_FAMILIES = new Set(['application-writing', 'continuation-writing'])
const HEADING_ROLES = new Set(['subtitle', 'title', 'heading'])

export function trailingHeadingHints(materialization) {
  return (materialization.groups || []).flatMap((group) => {
    if (WRITING_FAMILIES.has(group.family)) return []
    const block = group.blocks?.at(-1)
    if (!HEADING_ROLES.has(block?.role)) return []
    return [{ groupId: group.groupId, blockId: block.blockId, role: block.role }]
  })
}

export function trailingHeadingMessage(hints) {
  return `Materialization 非写作篇章以标题结尾，可能漏图或漏正文：\n${
    hints.map(({ groupId, blockId, role }) => `题组 ${groupId}，block ${blockId}（${role}）`).join('\n')
  }\n请回 OCR 校对，对照原页补 figure / figureRegion 或遗漏正文，再用 --redo-from compile 重跑。`
}
