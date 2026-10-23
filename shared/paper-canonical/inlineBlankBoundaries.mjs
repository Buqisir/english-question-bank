import { grammarFillPromptPrefix } from './grammarFillPromptContract.mjs'

// New-write quality gate only. Never normalize signed text or change Candidate
// derivation/replay. A prose separator may stretch under justification.
// Input is compiled NCK1: both ref arrays preserve the source question order.
export function validateInlineBlankTextBoundaries(questionGroups) {
  const issues = []
  for (const [groupIndex, group] of questionGroups.entries()) {
    if (!['seven-choices', 'cloze', 'grammar-fill'].includes(group.variant?.family)) continue
    const blanks = new Map(group.blankRefs.map((blank, index) => [blank.blankId, {
      questionId: group.questionRefs[index].questionId,
      prompt: group.variant.promptBindings?.find(binding => binding.blankId === blank.blankId)?.prompt,
    }]))
    for (const [blockIndex, block] of group.content.blocks.entries()) {
      if (block.kind !== 'paragraph') continue
      for (const [index, inline] of block.inlines.entries()) {
        if (inline.kind !== 'blank_ref') continue
        const blank = blanks.get(inline.blankId)
        for (const [side, step] of [['left', -1], ['right', 1]]) {
          let text = ''
          let adjacentBlank = false
          for (let cursor = index + step; cursor >= 0 && cursor < block.inlines.length; cursor += step) {
            const node = block.inlines[cursor]
            if (node.kind !== 'text') {
              adjacentBlank = node.kind === 'blank_ref'
              break
            }
            let fragment = node.text
            if (side === 'right' && cursor === index + 1 && blank.prompt != null) {
              const prefix = grammarFillPromptPrefix(node, blank.prompt)
              if (prefix !== null) fragment = fragment.slice(prefix.length)
            }
            text = side === 'left' ? fragment + text : text + fragment
          }
          const edge = side === 'left' ? [...text].at(-1) : [...text][0]
          if ((!edge && !adjacentBlank) || (edge && edge !== '\uFEFF' && /\s/u.test(edge))) continue
          // Closing punctuation belongs to the preceding answer; opening
          // brackets belong to the following answer. An em dash separates prose
          // on either side without requiring spaces. Directional double quotes
          // delimit answers too; ambiguous quotes/apostrophes/hyphens need review.
          if (edge === '—') continue
          if (side === 'left' ? edge === '“' : edge === '”') continue
          // Source Chinese glosses delimit the preceding word even when the
          // answer line touches their closing parenthesis. Canonical text may
          // already have NFKC-normalized the fullwidth parentheses.
          if (side === 'left' && /[（(][\p{Script=Han}\p{P}\s]*\p{Script=Han}[\p{Script=Han}\p{P}\s]*[）)]$/u.test(text)) continue
          if (side === 'right' ? /[.,;:!?\)\]\}]/u.test(edge) : /[\(\[\{]/u.test(edge)) continue
          const missing = (!edge && adjacentBlank) || /[\p{L}\p{N}]/u.test(edge)
            || (side === 'left' && /[.,;:!?\)\]\}]/u.test(edge))
          issues.push({
            code: missing ? 'INLINE_BLANK_SEPARATOR_MISSING' : 'INLINE_BLANK_BOUNDARY_REVIEW_REQUIRED',
            path: `$.questionGroups[${groupIndex}].content.blocks[${blockIndex}].inlines[${index}]`,
            groupId: group.identity.groupId, blockId: block.nodeId,
            blankId: inline.blankId, questionId: blank.questionId, side,
            message: `${inline.blankId} (${blank.questionId}) ${side}: ${missing ? 'missing prose separator' : 'ambiguous punctuation boundary; compare source'}`,
          })
        }
      }
    }
  }
  return issues
}
