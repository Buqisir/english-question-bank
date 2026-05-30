// Derive the ordered A4 page chrome for one writing group from a paper asset's
// whole-paper flat `content.blocks`. Pure logic (no React / no PaperSurface) so
// it is unit-testable by the node verify harness — I6-writing-render.
//
// The group is anchored by its own `group` block and the `answerBox` block that
// shares its `writingTaskId`. Chrome is the run from the nearest preceding
// `sectionHeading` (plus an adjacent `partHeading`) through the `answerBox`. The
// continuation starter instruction is folded into the box (rendered as the box's
// given lines), not emitted as a standalone instruction.
export function buildWritingPageModel(asset, group, task) {
  const allBlocks = (asset && asset.content && asset.content.blocks) || []
  const groupId = group.groupId
  const writingTaskId = group.writingTaskId

  const gIdx = allBlocks.findIndex((b) => b.type === 'group' && b.groupId === groupId)
  if (gIdx < 0) return { blocks: [] }
  const aIdx = writingTaskId
    ? allBlocks.findIndex((b) => b.type === 'answerBox' && b.writingTaskId === writingTaskId)
    : -1
  const endIdx = aIdx > gIdx ? aIdx : gIdx

  let startIdx = 0
  for (let i = gIdx; i >= 0; i -= 1) {
    if (allBlocks[i].type === 'sectionHeading') { startIdx = i; break }
  }
  // Pull in an immediately-preceding partHeading (skipping a pageBreakHint).
  let p = startIdx - 1
  while (p >= 0 && allBlocks[p].type === 'pageBreakHint') p -= 1
  if (p >= 0 && allBlocks[p].type === 'partHeading') startIdx = p

  const starters = (task && task.continuationStarters) || []
  const starterText = starters.length >= 2
    ? `Paragraph 1: ${starters[0]}\n\nParagraph 2: ${starters[1]}`
    : ''
  // Answer-box given content: continuation → starters as givenTop; application →
  // its captured 上下格式 (top/bottom). Continuation never routes via applicationGiven.
  const appGiven = (task && task.applicationGiven) || null
  const givenTop = appGiven ? (appGiven.top || []) : starters
  const givenBottom = appGiven ? (appGiven.bottom || []) : []

  const blocks = []
  for (let i = startIdx; i <= endIdx; i += 1) {
    const b = allBlocks[i]
    if (b.type === 'partHeading') blocks.push({ kind: 'partHeading', text: b.text })
    else if (b.type === 'sectionHeading') blocks.push({ kind: 'sectionHeading', text: b.text })
    else if (b.type === 'instruction') {
      // The starter instruction is rendered inside the answer box, not standalone.
      if (starterText && b.text === starterText) continue
      blocks.push({ kind: 'instruction', text: b.text })
    } else if (b.type === 'group') {
      if (b.groupId === groupId) blocks.push({ kind: 'passage' })
    } else if (b.type === 'answerBox') {
      blocks.push({ kind: 'answerBox', label: b.label || '', givenTop, givenBottom })
    }
  }
  return { blocks }
}
