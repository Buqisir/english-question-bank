import { MAX_WORD_UTF16 } from './constants.mjs'

const WORD = /^[A-Za-z]+(?:['’-][A-Za-z]+)*['’]?$/u

function isLetter(char) {
  return char >= 'A' && char <= 'Z' || char >= 'a' && char <= 'z'
}

function isApostrophe(char) {
  return char === "'" || char === '’'
}

function isEdgeJunk(char) {
  if (!char || isLetter(char) || isApostrophe(char) || char === '-') return false
  return /[\s\p{P}\p{S}]/u.test(char)
}

function continuesWord(char) {
  return isLetter(char) || isApostrophe(char) || char === '-'
}

/**
 * A selection is one complete English word when, after stripping outer
 * punctuation, it matches word-token-v1 and is not a slice of a longer token.
 * Offsets move with the trim. This never expands a partial token.
 */
export function classifyCompleteEnglishWord(text, start, end) {
  if (typeof text !== 'string' || !Number.isInteger(start) || !Number.isInteger(end)) return null
  if (start < 0 || end > text.length || end <= start) return null
  if (end - start > MAX_WORD_UTF16 + 32) return null

  let relStart = 0
  let relEnd = end - start
  const raw = text.slice(start, end)
  while (relStart < relEnd && isEdgeJunk(raw[relStart])) relStart += 1
  while (relEnd > relStart && isEdgeJunk(raw[relEnd - 1])) relEnd -= 1
  while (relStart < relEnd && (isApostrophe(raw[relStart]) || raw[relStart] === '-')) relStart += 1
  while (relEnd > relStart && raw[relEnd - 1] === '-') relEnd -= 1
  if (relEnd <= relStart) return null

  const surface = raw.slice(relStart, relEnd)
  if (surface.length === 0 || surface.length > MAX_WORD_UTF16 || !WORD.test(surface)) return null

  const absStart = start + relStart
  const absEnd = start + relEnd
  const before = absStart > 0 ? text[absStart - 1] : ''
  const after = absEnd < text.length ? text[absEnd] : ''
  if (continuesWord(before) || continuesWord(after)) return null
  return { surface, start: absStart, end: absEnd }
}
