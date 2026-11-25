import { analysisSentences } from '../sentence-analysis/resolveTarget.mjs'

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

export function phraseOccurrenceSentences(text) {
  return analysisSentences(text).map(sentence => {
    const trimmed = sentence.text.trimStart()
    const origin = codePointOffset(text, sentence.start + sentence.text.length - trimmed.length)
    return { origin, points: [...trimmed.trimEnd()] }
  })
}

export function locatePhraseOccurrence(sentences, row) {
  const { sentence, sentenceStart, start, end, surface } = row
  if (!Number.isInteger(sentence) || sentence < 1 || !Number.isInteger(start) || !Number.isInteger(end)) return null
  const indexed = sentences[sentence - 1]
  if (!indexed || (sentenceStart != null && sentenceStart !== indexed.origin)) return null
  const { origin, points } = indexed
  if (start < 0 || end <= start || end > points.length || !surface || points.slice(start, end).join('') !== surface) return null
  return { from: origin + start, to: origin + end, origin, sentenceText: points.join('') }
}
