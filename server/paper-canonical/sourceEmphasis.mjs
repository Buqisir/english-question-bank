import { canonicalizeVisibleEnglishTypography } from '../../shared/paper-canonical/visibleTypography.mjs'

// Corrections have already passed the source-text review validator. Coordinates
// are original UTF-16 offsets; never relocate a repeated word by text search.
export function mapSourceEmphasisEdits(text, ranges, corrections) {
  const mapped = structuredClone(ranges)
  let shift = 0
  for (const correction of corrections) {
    const start = correction.start + shift
    const end = start + correction.before.length
    const delta = correction.after.length - correction.before.length
    if (text.slice(start, end) !== correction.before) throw new Error('Source emphasis correction preimage differs')
    for (const range of mapped) {
      if (end <= range.start) { range.start += delta; range.end += delta }
      else if (start >= range.end) continue
      else if (start >= range.start && end <= range.end) range.end += delta
      else throw new Error('Source emphasis correction crosses a mark boundary')
    }
    text = text.slice(0, start) + correction.after + text.slice(end)
    shift += delta
  }
  return { text, ranges: mapped }
}

export function splitSourceEmphasis(text, ranges, nodeId, ruleVersion = '3') {
  if (!['3', '4'].includes(ruleVersion)) throw new Error('Unknown source emphasis typography rule version')
  const nodes = []
  let cursor = 0
  const append = (start, end, marks) => {
    if (start === end) return
    nodes.push({ kind: 'text', nodeId: `${nodeId}:run-${nodes.length + 1}`,
      text: text.slice(start, end), ...(marks ? { marks } : {}) })
  }
  for (const range of ranges) {
    if (range.start < cursor || range.end <= range.start || range.end > text.length) {
      throw new Error('Source emphasis range cannot map to the exact text')
    }
    append(cursor, range.start)
    append(range.start, range.end, range.marks)
    cursor = range.end
  }
  append(cursor, text.length)
  const closes = (version) => nodes.map((node) => canonicalizeVisibleEnglishTypography(node.text, version)).join('')
    === canonicalizeVisibleEnglishTypography(text, version)
  // Preserve every historically accepted split; only an explicit v4 rule may
  // additionally admit a boundary that closes under v4 but not under v3.
  if (!closes('3') && !(ruleVersion === '4' && closes('4'))) {
    throw new Error('Source emphasis boundary changes visible typography normalization')
  }
  return nodes
}
