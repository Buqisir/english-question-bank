import { chineseContextNumbering } from '../../shared/chineseContextNumbering.mjs'
import { CJK_NUMBERING_RULE, computeOcrNumberingProjection } from '../../shared/ocrNumberingProjection.mjs'

export { CJK_NUMBERING_RULE }

// Only complete source-backed paragraph/table runs qualify. The same proof used
// by report admission must be recomputable on the final output, not just on a
// convenient concatenated string. Unprovable cross-run numbering stays blocked.
export function normalizeMaterializationNumbering(materialization) {
  const normalized = structuredClone(materialization)
  const candidates = []
  const visit = (content, pointer, source) => {
    if (!source?.documentId || !Number.isInteger(source.page) || !Array.isArray(content)) return
    content.forEach((run, index) => {
      if (run?.kind !== 'text' || typeof run.text !== 'string') return
      const before = run.text
      const characters = before.split('')
      for (const match of chineseContextNumbering(before)) {
        characters[match.index] = '（'
        characters[match.index + match[0].length - 1] = '）'
      }
      const after = characters.join('')
      if (after === before) return
      const entry = { category: 'ocr_misrecognition', after, sourceLocator: source,
        materializationTarget: { jsonPointer: `${pointer}/${index}/text` } }
      run.text = after
      candidates.push({ run, before, after, entry })
    })
  }
  normalized.groups?.forEach((group, gi) => group.blocks?.forEach((block, bi) => {
    const pointer = `/groups/${gi}/blocks/${bi}`
    if (block.kind === 'paragraph') visit(block.content, `${pointer}/content`, block.source)
    if (block.kind === 'table') block.rows?.forEach((row, ri) => row.cells?.forEach((cell, ci) =>
      visit(cell.content, `${pointer}/rows/${ri}/cells/${ci}/content`, cell.source || row.source || block.source)))
  }))
  // Reverting one run can change another run's context; converge conservatively.
  let pending = candidates
  while (true) {
    const rejected = pending.filter(change =>
      !computeOcrNumberingProjection({}, change.entry, normalized, change.before))
    if (!rejected.length) break
    for (const change of rejected) change.run.text = change.before
    pending = pending.filter(change => !rejected.includes(change))
  }
  return { materialization: pending.length ? normalized : materialization,
    ruleVersion: CJK_NUMBERING_RULE,
    changes: pending.map(({ before, after, entry }) => ({
      pointer: entry.materializationTarget.jsonPointer, before, after,
    })) }
}
