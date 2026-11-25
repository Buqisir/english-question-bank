export const codePointOffset = (text, utf16Offset) => [...text.slice(0, utf16Offset)].length

// Store the producer's trimmed sentence, its block origin, and the sentence-relative offsets.
export function indexPhraseOccurrence(leafText, { start: sentenceStart, text: sentenceText }, [start, end], parts) {
  const origin = codePointOffset(leafText, sentenceStart)
  const offset = index => codePointOffset(leafText, index) - origin
  return {
    sentenceStart: origin,
    sentenceText,
    surface: leafText.slice(start, end),
    start: offset(start),
    end: offset(end),
    ...(parts ? { parts: parts.map(([from, to]) => [offset(from), offset(to)]) } : {}),
  }
}

// Map normalized UTF-16 boundaries back to the unmodified code-point offsets.
export function normalizePhraseText(text) {
  const starts = []
  const ends = []
  let normalized = ''
  let offset = 0
  for (const [token] of text.matchAll(/\s+|\S/gu)) {
    const space = /^\s/u.test(token)
    const length = space ? [...token].length : 1
    if (normalized || !space) {
      starts[normalized.length] = offset
      normalized += space ? ' ' : token.replace(/[‘’]/g, "'")
      ends[normalized.length] = offset + length
    }
    offset += length
  }
  return { text: normalized.trimEnd(), starts, ends }
}

export function locatePhraseOccurrence(block, row, sentenceText) {
  const { sentence, sentenceStart, start, end, surface } = row
  if (!Number.isInteger(sentence) || sentence < 1 || !surface) return null
  const quote = normalizePhraseText(sentenceText.trim())
  const from = quote.starts.indexOf(start)
  const to = quote.ends.indexOf(end)
  if (from < 0 || to <= from || quote.text.slice(from, to) !== normalizePhraseText(surface).text) return null

  let at
  if (Object.hasOwn(row, 'sentenceStart')) {
    if (!Number.isInteger(sentenceStart) || sentenceStart < 0) return null
    at = block.starts.indexOf(sentenceStart)
    if (at < 0 || !block.text.startsWith(quote.text, at)) return null
  } else {
    at = block.text.indexOf(quote.text)
    if (at < 0 || block.text.indexOf(quote.text, at + 1) >= 0) return null
  }

  const parts = []
  for (const [partStart, partEnd] of row.parts ?? [[start, end]]) {
    const left = quote.starts.indexOf(partStart)
    const right = quote.ends.indexOf(partEnd)
    if (left < from || right > to || right <= left) return null
    parts.push([block.starts[at + left], block.ends[at + right]])
  }
  const first = block.starts[at + from]
  const last = block.ends[at + to]
  return { from: first, to: last, parts }
}
