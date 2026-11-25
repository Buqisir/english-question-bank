export const codePointOffset = (text, utf16Offset) => [...text.slice(0, utf16Offset)].length

// The producer supplies the start of its trimmed sentence in the leaf.
// Persist that origin in code points, in the same coordinate system as start/end/parts.
export function indexPhraseOccurrence(leafText, sentenceStart, [start, end], parts) {
  const origin = codePointOffset(leafText, sentenceStart)
  const offset = index => codePointOffset(leafText, index) - origin
  return {
    sentenceStart: origin,
    surface: leafText.slice(start, end),
    start: offset(start),
    end: offset(end),
    ...(parts ? { parts: parts.map(([from, to]) => [offset(from), offset(to)]) } : {}),
  }
}

const wordCharacter = /[\p{L}\p{M}\p{N}_]/u
const sentenceEnding = /[.!?…。！？][\p{Pe}\p{Pf}"']*\s+$/u

export function locatePhraseOccurrence(points, row) {
  const { start, end, surface } = row
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null
  const at = origin => {
    const from = origin + start
    const to = origin + end
    if (origin < 0 || from < origin || to <= from || to > points.length) return null
    if (surface && points.slice(from, to).join('') !== surface) return null
    return { from, to, origin }
  }
  if (Number.isInteger(row.sentenceStart)) return at(row.sentenceStart)

  // Legacy rows have the quote and sentence-relative offsets. The first
  // sentence has a known origin; later rows require a unique literal anchor.
  if (!surface) return null
  const leading = points.findIndex(char => !/\s/u.test(char))
  if (leading < 0) return null
  if (row.sentence === 1) return at(leading)
  let match = null
  for (let from = leading + start + 1; from + end - start <= points.length; from += 1) {
    const origin = from - start
    if (!/\s/u.test(points[origin - 1] ?? '') || /\s/u.test(points[origin] ?? '')) continue
    if (wordCharacter.test(points[from - 1] ?? '') || wordCharacter.test(points[from + end - start] ?? '')) continue
    const candidate = at(origin)
    if (!candidate || !sentenceEnding.test(points.slice(0, origin).join(''))) continue
    if (match) return null
    match = candidate
  }
  return match
}
