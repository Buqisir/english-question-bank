import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseOfficialAnswers, parseOfficialWritingSamples } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { joinTranscriptTurns } from './ocr-proofread.mjs'

const body = (texts) => texts.map((text, sourceIndex) => ({ kind: 'paragraph', text, sourceIndex }))

test('spaced slashes do not consume the text answer word allowance', () => {
  const issues = []
  const answers = parseOfficialAnswers(body([
    '61. repetitive/repeated 62. a 63. studios 64. and 65. while / though / although',
  ]), 'answers', issues)
  assert.deepEqual(issues, [])
  assert.deepEqual([...answers].map(([number, { value }]) => [number, value]), [
    [61, 'repetitive/repeated'], [62, 'a'], [63, 'studios'], [64, 'and'], [65, 'while / though / although'],
  ])
  const invalid = []
  parseOfficialAnswers(body(['65. while / though / although because more words follow']), 'answers', invalid)
  assert.equal(invalid[0]?.code, 'NCK1_ANSWER_VALUE_BOUNDARY_AMBIGUOUS')
})

test('an explicit explanation divider ends the key writing sections before repeated teaching headings', () => {
  const issues = []
  const result = parseOfficialWritingSamples(body([
    '第四部分 写作（共两节，满分40分）', '第一节 应用文写作', 'A possible version:',
    'Cherishing our books shows respect.',
    '第二节 读后续写', 'A possible version:', 'Paragraph 1:', 'Arthur paused.',
    'Paragraph 2:', 'The pigeon cooed softly.',
    '答案详解', '第四部分 写作（共两节，满分40分）',
    '第一节 应用文写作', 'A possible version:', 'Teaching duplicate.',
    '第二节 读后续写', 'A possible version:', 'Another teaching duplicate.',
  ]), 'answers', issues)
  assert.deepEqual(issues, [])
  assert.equal(result.application, 'Cherishing our books shows respect.')
  assert.equal(result.continuation, 'Paragraph 1:\nArthur paused.\nParagraph 2:\nThe pigeon cooed softly.')
})

test('repeated writing sections without an explanation divider remain ambiguous', () => {
  const issues = []
  parseOfficialWritingSamples(body([
    '第四部分 写作', '第一节 应用文写作', 'A possible version:', 'One sample.',
    '第二节 读后续写', 'A possible version:', 'Another sample.',
    '第四部分 写作', '第一节 应用文写作', 'Another competing section.',
  ]), 'answers', issues)
  assert.equal(issues[0]?.code, 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS')
})

test('an explanation heading before writing does not truncate detailed-only writing answers', () => {
  const issues = []
  const result = parseOfficialWritingSamples(body([
    '答案详解', '第四部分 写作', '第一节 应用文写作', 'A possible version:', 'One sample.',
    '第二节 读后续写', 'A possible version:', 'Another sample.',
  ]), 'answers', issues)
  assert.deepEqual(issues, [])
  assert.deepEqual(result, { application: 'One sample.', continuation: 'Another sample.' })
})

test('transcript note joins leave key answers and writing section items intact', () => {
  const items = [
    { text: '64. and 65. while / though / although' },
    { text: '第四部分 写作（共两节，满分40分）' },
    { text: '第一节 应用文写作' },
    { text: 'A possible version:' },
    { text: 'A short sample.' },
    { text: '第二节 读后续写' },
  ]
  // Both initial state and a prior transcript followed by the writing boundary.
  for (const state of [{}, { inTranscript: true }]) {
    assert.deepEqual(joinTranscriptTurns(items, [], state, 'key').items, items)
  }
})
