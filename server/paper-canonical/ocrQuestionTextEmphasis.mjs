import { digestJson } from '../../shared/paper-canonical/stable.mjs'

// Resolve by the exact question locator and contiguous source order, never by
// searching for equal option words elsewhere in the document. Offsets remain
// in the sealed paragraph's original UTF-16 coordinate system.
export function resolveOcrQuestionTextEmphasis(question, structure) {
  const body = structure?.body || []
  const anchors = body.flatMap((item, index) => item.kind === 'paragraph'
    && digestJson(item.sourceIndex) === digestJson(question.source) ? [index] : [])
  if (anchors.length !== 1) throw new Error('OCR option emphasis needs one exact question anchor')
  const options = question.options
  if (!options.length || options.some((option, index) => option.figure
    || option.label !== String.fromCharCode(65 + index) || typeof option.text !== 'string')) {
    throw new Error('OCR option emphasis requires an ordered literal option bank')
  }
  const paragraphs = []
  let text = ''
  for (let index = anchors[0]; index < body.length; index += 1) {
    const item = body[index]
    if (item.kind !== 'paragraph' || item.materializedMedia
      || (index !== anchors[0] && /^\s*\d+[.．、]/u.test(item.text))) break
    const start = text.length + (paragraphs.length ? 1 : 0)
    text += `${paragraphs.length ? '\n' : ''}${item.text}`
    paragraphs.push({ paragraph: item, start, end: text.length })
    const prefix = text.match(/^\s*\d+[.．、]\s*/u)?.[0]
    if (prefix === undefined || text.slice(prefix.length, prefix.length + question.stem.length) !== question.stem) continue
    let cursor = prefix.length + question.stem.length
    const targets = [{ key: 'stem', start: prefix.length, end: cursor, text: question.stem }]
    for (const [optionIndex, option] of options.entries()) {
      const label = text.slice(cursor).match(new RegExp(`^\\s+${option.label}[.．、]\\s*`, 'u'))
      if (!label) break
      cursor += label[0].length
      if (text.slice(cursor, cursor + option.text.length) !== option.text) break
      targets.push({ key: `option:${optionIndex}`, start: cursor, end: cursor + option.text.length, text: option.text })
      cursor += option.text.length
    }
    if (targets.length !== options.length + 1 || text.slice(cursor).trim()) continue
    const marked = paragraphs.filter(({ paragraph }) => paragraph.sourceEmphasis?.length)
    const mapped = targets.map(target => ({ ...target, ranges: [], fragments: [] }))
    for (const { paragraph, start } of marked) {
      for (const range of paragraph.sourceEmphasis) {
        if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
          || range.start < 0 || range.end <= range.start || range.end > paragraph.text.length) {
          throw new Error('OCR option emphasis range is outside its confirmed paragraph')
        }
        const absoluteStart = start + range.start, absoluteEnd = start + range.end
        const owners = mapped.filter(target => absoluteStart >= target.start && absoluteEnd <= target.end)
        if (owners.length !== 1) throw new Error('OCR option emphasis crosses an option or label boundary')
        const owner = owners[0]
        owner.ranges.push({ start: absoluteStart - owner.start, end: absoluteEnd - owner.start, marks: range.marks })
        if (!owner.fragments.some(fragment => fragment.paragraph === paragraph)) owner.fragments.push({ paragraph })
      }
    }
    return { targets: mapped, paragraphs: marked.map(({ paragraph }) => paragraph) }
  }
  throw new Error('OCR option emphasis does not replay the complete literal stem and ordered options')
}
