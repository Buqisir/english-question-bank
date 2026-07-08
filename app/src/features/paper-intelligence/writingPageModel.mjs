// Derive the ordered A4 page chrome for one writing group from a paper asset's
// whole-paper flat `content.blocks`. Pure logic (no React / no PaperSurface) so
// it is unit-testable by the node verify harness — I6-writing-render.
//
// The group is anchored by its own `group` block and the `answerBox` block that
// shares its `writingTaskId`. Chrome is the run from the nearest preceding
// `sectionHeading` (plus an adjacent `partHeading`) through the `answerBox`. The
// continuation starter instruction is folded into the box (rendered as the box's
// given lines), not emitted as a standalone instruction.

// Locate the run of `asset.content.blocks` indices a writing group's page
// chrome consumes: from the nearest preceding `sectionHeading` (plus an
// adjacent `partHeading`) through the group's `answerBox`. Pure index lookup,
// no `task` needed — shared by `buildWritingPageModel` and by callers (e.g.
// PaperBrowsePage) that need to know which top-level blocks a writing page
// model has already rendered, so they don't render them a second time.
export function findWritingBlockRange(asset, group) {
  const allBlocks = (asset && asset.content && asset.content.blocks) || []
  const groupId = group.groupId
  const writingTaskId = group.writingTaskId

  const gIdx = allBlocks.findIndex((b) => b.type === 'group' && b.groupId === groupId)
  if (gIdx < 0) return null
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

  return { startIdx, endIdx, groupIdx: gIdx }
}

// Collapse an accidentally doubled "Paragraph N: Paragraph N: " prefix that
// may already be baked into a stale imported instruction block's text (seen
// on the 960d0f8d-era import, before this guard existed) so that block is
// still recognized below as *the* starter instruction and folded into the
// answer box, instead of falling through and rendering a second time with
// the doubled prefix intact.
function collapseDoubledParagraphPrefix(text) {
  return text.replace(/(Paragraph \d+:\s*)\1+/g, '$1')
}

// surface-question-policy cut (owner 验收反馈): an application-letter
// group's passage.paragraphs stores the given greeting/opening and
// closing/signature as plain paragraphs (e.g. 960d0f8d: "Dear Chris," /
// an opening sentence / "Yours," / "Li Hua") rather than as a structured
// `task.applicationGiven.{top,bottom}` — the import pipeline never
// populated that field for any paper seen so far. Derive the scaffold
// at read time instead of touching the import pipeline / stored assets
// (both out of scope for this cut).
//
// Matches a whole paragraph that opens with "Dear" (the greeting line)
// through the end of the paragraph list; splits at the first paragraph
// opening with "Yours" into `top` (greeting + given opening) and
// `bottom` (closing + signature). Returns null when no paragraph opens
// with "Dear" — e.g. paper-2026-i's application task is an opinion-
// column submission with no letter scaffold at all; callers keep their
// current (empty-box) behavior in that case.
const DEAR_LINE_RE = /^Dear\b.*,?\s*$/
const YOURS_LINE_RE = /^Yours\b/i

export function extractApplicationScaffold(paragraphs) {
  const list = paragraphs || []
  const dearIdx = list.findIndex((p) => DEAR_LINE_RE.test(String((p && p.text) || '').trim()))
  if (dearIdx < 0) return null
  const scaffold = list.slice(dearIdx)
  const yoursIdx = scaffold.findIndex((p) => YOURS_LINE_RE.test(String((p && p.text) || '').trim()))
  const splitAt = yoursIdx >= 0 ? yoursIdx : scaffold.length
  return {
    top: scaffold.slice(0, splitAt).map((p) => p.text),
    bottom: scaffold.slice(splitAt).map((p) => p.text),
    paragraphIds: new Set(scaffold.map((p) => p.paragraphId)),
  }
}

export function buildWritingPageModel(asset, group, task) {
  const allBlocks = (asset && asset.content && asset.content.blocks) || []
  const groupId = group.groupId

  const range = findWritingBlockRange(asset, group)
  if (!range) return { blocks: [] }
  const { startIdx, endIdx } = range

  const starters = (task && task.continuationStarters) || []
  // Guard: a starter may already carry its own "Paragraph N:" prefix (stored
  // data) — don't prefix it a second time.
  const starterText = starters.length >= 2
    ? [starters[0], starters[1]]
        .map((s, i) => (/^Paragraph \d+:/.test(s) ? s : `Paragraph ${i + 1}: ${s}`))
        .join('\n\n')
    : ''
  // Answer-box given content: continuation → starters as givenTop; application →
  // its captured 上下格式 (top/bottom), derived at read time from the group's
  // own Dear.../Yours... passage paragraphs when present (surface-question-
  // policy cut), falling back to task.applicationGiven / empty when the
  // group has no letter scaffold. Continuation never routes via either.
  const scaffold = task && task.taskType === 'application'
    ? extractApplicationScaffold(group.passage && group.passage.paragraphs)
    : null
  const appGiven = (task && task.applicationGiven) || null
  const givenTop = scaffold ? scaffold.top : appGiven ? (appGiven.top || []) : starters
  const givenBottom = scaffold ? scaffold.bottom : appGiven ? (appGiven.bottom || []) : []

  const blocks = []
  for (let i = startIdx; i <= endIdx; i += 1) {
    const b = allBlocks[i]
    if (b.type === 'partHeading') blocks.push({ kind: 'partHeading', text: b.text })
    else if (b.type === 'sectionHeading') blocks.push({ kind: 'sectionHeading', text: b.text })
    else if (b.type === 'instruction') {
      // The starter instruction is rendered inside the answer box, not standalone.
      if (starterText && collapseDoubledParagraphPrefix(b.text) === starterText) continue
      blocks.push({ kind: 'instruction', text: b.text })
    } else if (b.type === 'group') {
      if (b.groupId === groupId) blocks.push({ kind: 'passage' })
    } else if (b.type === 'answerBox') {
      blocks.push({ kind: 'answerBox', label: b.label || '', givenTop, givenBottom })
    }
  }
  return { blocks }
}
