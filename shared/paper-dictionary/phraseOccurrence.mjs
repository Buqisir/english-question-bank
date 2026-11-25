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

// The apostrophe/whitespace folding here is for occurrence text and phrase forms.
// Ordinary dictionary fallback uses the original lookup spelling.
const phraseForm = text => text.replace(/[‘’]/g, "'").trim().replace(/\s+/g, ' ').toLowerCase()
const possessives = /\b(?:my|your|his|her|its|our|their)\b/g
const wordCharacter = '[\\p{L}\\p{M}\\p{N}_]'
const wordEnd = new RegExp(`${wordCharacter}$`, 'u')
const wordStart = new RegExp(`^${wordCharacter}`, 'u')
const joinedWordStart = new RegExp(`^(?:['-])?${wordCharacter}`, 'u')
const sentenceEnding = /[.!?。！？…][\p{Pe}\p{Pf}"']*$/u

function wordBoundary(text, offset) {
  const before = text.slice(0, offset)
  const after = text.slice(offset)
  return !(wordEnd.test(before) && joinedWordStart.test(after)) &&
    !(before.length > 1 && /['-]$/u.test(before) && wordEnd.test(before.slice(0, -1)) && wordStart.test(after))
}

export function locatePhraseOccurrence(block, row, sentenceText, entry) {
  const { sentence, sentenceStart, start, end, surface } = row
  if (!Number.isInteger(sentence) || sentence < 1 || typeof surface !== 'string' || !surface ||
      typeof sentenceText !== 'string') return null
  const quote = normalizePhraseText(sentenceText.trim())

  // The stored span must be inside its sentence and carry the indexed spelling.
  const from = quote.starts.indexOf(start)
  const to = quote.ends.indexOf(end)
  if (from < 0 || to <= from || quote.text.slice(from, to) !== normalizePhraseText(surface).text) return null

  // Check the indexed origin, or require one literal match for a legacy row.
  let at
  if (Object.hasOwn(row, 'sentenceStart')) {
    if (!Number.isInteger(sentenceStart) || sentenceStart < 0) return null
    at = block.starts.indexOf(sentenceStart)
    if (at < 0 || !block.text.startsWith(quote.text, at)) return null
  } else {
    at = block.text.indexOf(quote.text)
    if (at < 0 || block.text.indexOf(quote.text, at + 1) >= 0) return null
  }

  // A saved fragment must not inherit the sense of a longer or different sentence.
  const after = at + quote.text.length
  if (at > 0 && (block.text[at - 1] !== ' ' || !sentenceEnding.test(block.text.slice(0, at - 1)))) return null
  if (after < block.text.length && (block.text[after] !== ' ' || !sentenceEnding.test(quote.text))) return null

  // Check boundaries in the containing block, including the envelope of separable phrases.
  const hasBoundaries = (left, right) => wordBoundary(block.text, at + left) && wordBoundary(block.text, at + right)
  if (!hasBoundaries(from, to)) return null
  const parts = []
  const fixed = []
  let previousEnd = from
  const ranges = row.parts ?? [[start, end]]
  if (!Array.isArray(ranges)) return null
  for (const range of ranges) {
    if (!Array.isArray(range) || range.length !== 2) return null
    const [partStart, partEnd] = range
    const left = quote.starts.indexOf(partStart)
    const right = quote.ends.indexOf(partEnd)
    if (left < previousEnd || right > to || right <= left || !hasBoundaries(left, right)) return null
    parts.push([block.starts[at + left], block.ends[at + right]])
    fixed.push(quote.text.slice(left, right))
    previousEnd = right
  }
  const first = block.starts[at + from]
  const last = block.ends[at + to]
  if (parts[0]?.[0] !== first || parts.at(-1)?.[1] !== last) return null
  const actual = phraseForm(fixed.join(' '))
  const withPossessive = actual.replace(possessives, "one's")
  const forms = [entry.headword, ...entry.variants, ...entry.forms.map(item => item.form)]
  if (!forms.map(phraseForm).some(form => form === actual || form === withPossessive)) return null
  return { from: first, to: last, parts }
}
