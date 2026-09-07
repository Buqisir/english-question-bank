/**
 * segmentPaperText — pure paragraph + sentence segmentation for
 * PaperSurface.
 *
 * Issue #21-B3.
 *
 * This module takes a raw passage body string and returns an array
 * of paragraph objects, each containing an array of sentence objects.
 * It is the deterministic, idempotent segmenter that feeds
 * `PaperTextMap` paragraph/sentence nodes.
 *
 * Constraints (locked):
 *   - Pure ESM. No React import. No app/ import. No server/ import.
 *   - Deterministic: same input always produces identical output.
 *   - Idempotent: running twice on same input returns identical output.
 *   - Paragraph segmentation: split on blank-line boundaries.
 *   - Sentence segmentation: split on sentence-ending punctuation
 *     followed by whitespace or end-of-string.
 *   - Token segmentation: DEFERRED. Tokens are always empty arrays.
 *
 * The sentence segmenter handles English prose (the primary use case
 * for reading comprehension papers). It splits on `.` `!` `?` followed
 * by whitespace or end-of-string, but avoids splitting on common
 * abbreviations (Mr., Mrs., Dr., etc.) and mid-sentence periods
 * (e.g. numbers like "3.5").
 */

/**
 * @typedef {Object} SegmentedToken
 * @property {string} id
 * @property {number} start
 * @property {number} end
 */

/**
 * @typedef {Object} SegmentedSentence
 * @property {string} id
 * @property {string} text
 * @property {SegmentedToken[]} tokens
 */

/**
 * @typedef {Object} SegmentedParagraph
 * @property {string} id
 * @property {SegmentedSentence[]} sentences
 */

/**
 * @typedef {Object} SegmentResult
 * @property {SegmentedParagraph[]} paragraphs
 */

/**
 * Segment a passage body into paragraphs and sentences.
 *
 * @param {string} passageBody - The raw passage text.
 * @param {object} options
 * @param {string} options.sectionId - The section identifier (e.g. 'A').
 *   Used as a prefix for stable paragraph/sentence ids.
 * @returns {SegmentResult}
 */
export function segmentPaperText(passageBody, options) {
  const { sectionId } = options
  if (!passageBody || typeof passageBody !== 'string') {
    return { paragraphs: [] }
  }

  const rawParagraphs = passageBody
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)

  const paragraphs = rawParagraphs.map((paraText, paraIdx) => {
    const paraId = `${sectionId}-p${paraIdx}`
    const sentences = segmentSentences(paraText, paraId)
    return { id: paraId, sentences }
  })

  return { paragraphs }
}

/**
 * Split a paragraph into sentences.
 *
 * Strategy: split on sentence-ending punctuation (. ! ?) followed by
 * one or more whitespace characters or end-of-string. Avoid splitting
 * on common abbreviations and decimal numbers.
 *
 * @param {string} text
 * @param {string} paragraphId
 * @returns {SegmentedSentence[]}
 */
function segmentSentences(text, paragraphId) {
  if (!text) return []

  // Common abbreviations that should not trigger a split.
  const ABBREVS = /(?:\bMr|\bMrs|\bMs|\bDr|\bProf|\bSr|\bJr|\bSt|\bvs|\betc|\bInc|\bLtd|\bCorp|\bapprox|\bdept|\bgovt|i\.e|e\.g)\./gi

  // Replace abbreviation periods with a placeholder to avoid false splits.
  const PLACEHOLDER = '\x00'
  let working = text.replace(ABBREVS, (match) =>
    match.slice(0, -1) + PLACEHOLDER,
  )

  // Protect decimal numbers (e.g. "3.5", "0.1")
  working = working.replace(/(\d)\.(\d)/g, `$1${PLACEHOLDER}$2`)

  // Split on sentence-ending punctuation followed by space or EOS.
  // We keep the punctuation with the preceding sentence.
  const parts = []
  let lastIdx = 0

  const sentenceEndRe = /[.!?]+(?:\s+|$)/g
  let match
  while ((match = sentenceEndRe.exec(working)) !== null) {
    const endIdx = match.index + match[0].length
    parts.push(working.slice(lastIdx, endIdx).trim())
    lastIdx = endIdx
  }

  // Remainder (text after last sentence-ending punctuation)
  if (lastIdx < working.length) {
    const remainder = working.slice(lastIdx).trim()
    if (remainder) parts.push(remainder)
  }

  // If no splits found, treat the whole text as one sentence.
  if (parts.length === 0 && text.trim()) {
    parts.push(working.trim())
  }

  // Restore placeholders back to periods.
  const restoredParts = parts.map((p) =>
    p.replace(new RegExp(PLACEHOLDER.replace('\x00', '\\x00'), 'g'), '.'),
  )

  return restoredParts.map((sentenceText, sentIdx) => ({
    id: `${paragraphId}-s${sentIdx}`,
    text: sentenceText,
    tokens: [], // Token segmentation deferred per B3 spec.
  }))
}
