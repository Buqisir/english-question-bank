import assert from 'node:assert/strict'
import { deriveReadingAnalysisRanges } from '../server/paper-import-ai/deriveReadingAnalysisRanges.mjs'

const group = { groupId: 'g', paragraphs: [{ id: 'p', text: '😀 same same e\u0301.' }] }
const raw = { groups: { g: {
  fullTranslationZh: '前😀。\r\n他😀来了。',
  selectedLongSentences: [{ sentenceId: 's', displayText: '😀 same same',
    underlineRanges: [{ start: 7, end: 11, quote: 'same' }] }],
  teachingContent: {
    sourceTextId: 'source',
    translation: { textId: 'zh', paragraphs: [
      { paragraphId: 'z1', start: 0, end: 3, quote: '前😀。' },
      { paragraphId: 'z2', start: 6, end: 12, quote: '他😀来了。' },
    ] },
    annotations: [{ annotationId: 'a', questionIds: ['q'],
      sourceRanges: [{ textId: 'source', paragraphId: 'p', start: 90, end: 92, quote: 'e\u0301' }],
      translationRanges: [{ textId: 'zh', paragraphId: 'z2', start: 7, end: 9, quote: '来了' }],
    }],
  },
} } }
const original = structuredClone(raw)
const result = deriveReadingAnalysisRanges(raw, group)
assert.deepEqual(raw, original, 'Raw evidence must not be mutated')
const value = result.groups.g
assert.deepEqual(value.teachingContent.translation.paragraphs[1], {
  paragraphId: 'z2', start: 5, end: 10, quote: '他😀来了。',
})
assert.deepEqual(value.teachingContent.annotations[0].translationRanges[0], {
  textId: 'zh', paragraphId: 'z2', start: 2, end: 4, quote: '来了',
})
assert.deepEqual(value.teachingContent.annotations[0].sourceRanges[0], {
  textId: 'source', paragraphId: 'p', start: 12, end: 14, quote: 'e\u0301',
})
assert.deepEqual(value.selectedLongSentences[0].underlineRanges, [{ start: 7, end: 11, quote: 'same' }],
  'A valid second occurrence must never become the first')
assert.deepEqual(deriveReadingAnalysisRanges(result, group), result, 'Derivation is idempotent')
function withoutOffsets(value) {
  return JSON.parse(JSON.stringify(value, (key, entry) => ['start', 'end'].includes(key) ? undefined : entry))
}
assert.deepEqual(withoutOffsets(result), withoutOffsets(raw), 'Only offsets may change')
for (const quote of ['same', 'é', 'absent', '']) {
  const invalid = structuredClone(raw)
  invalid.groups.g.teachingContent.annotations[0].sourceRanges[0].quote = quote
  assert.throws(() => deriveReadingAnalysisRanges(invalid, group), /exact|quote/,
    'Ambiguous, normalized, missing and empty quotes must fail')
  assert.deepEqual(raw, original)
}
const wrongParagraph = structuredClone(raw)
wrongParagraph.groups.g.teachingContent.annotations[0].translationRanges[0].paragraphId = 'z1'
assert.throws(() => deriveReadingAnalysisRanges(wrongParagraph, group), /exactly once/,
  'A quote found in another paragraph must not be silently relocated')
const unknown = structuredClone(raw)
unknown.groups.g.teachingContent.annotations[0].sourceRanges[0].textId = 'other'
assert.throws(() => deriveReadingAnalysisRanges(unknown, group), /missing exact text/)
console.log('PASS reading range derivation: paragraph-local Unicode offsets, CRLF, repeated occurrence, no mutation, ambiguity and identity rejection')
