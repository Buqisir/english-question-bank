import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseOfficialAnswers, parseOfficialWritingSamples } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { joinTranscriptTurns } from './ocr-proofread.mjs'

const body = (texts) => texts.map((text, sourceIndex) => ({ kind: 'paragraph', text, sourceIndex }))

for (const heading of [
  'Content（内容）: 5 points',
  'Organization（结构）: 5 points',
  'Content（15分）: cover all required points.',
  'Content(内容): 5 points',
  'Organization(结构): 5 points',
  'Content(15分): cover all required points.',
]) {
  test(`bilingual scoring heading is never an unlabelled essay: ${heading}`, () => {
    const issues = []
    const result = parseOfficialWritingSamples(body([
      '第四部分 写作', '第一节 应用文', 'A short sample.',
      '第二节 读后续写', heading, 'Cover all key information.',
    ]), 'answers', issues)
    assert.deepEqual(result, { application: null, continuation: null })
    assert(issues.some(issue => issue.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'))
  })

  test(`bilingual scoring following a real gloss sample is excluded: ${heading}`, () => {
    const issues = []
    const sample = 'He looked aggressive（强势）last night.'
    const result = parseOfficialWritingSamples(body([
      '第四部分 写作', '第一节 应用文', 'A short sample.',
      '第二节 读后续写', sample, heading, 'Cover all key information.',
    ]), 'answers', issues)
    assert.deepEqual(issues, [])
    assert.equal(result.continuation, sample)
  })
}

for (const [open, close] of [['（', '）'], ['(', ')']]) {
  for (const commentary of ['内容完整，语言连贯。', '主题表达完整', '【审题重点】', '评分标准']) {
    test(`a gloss cannot cross an independent commentary paragraph: ${open}${commentary}${close}`, () => {
      const issues = []
      const result = parseOfficialWritingSamples(body([
        '第四部分 写作', '第一节 应用文', 'A short sample.', '第二节 读后续写',
        `He looked aggressive${open}强`, commentary, `势${close}last night.`,
      ]), 'answers', issues)
      assert.deepEqual(result, { application: null, continuation: null })
      assert(issues.some(issue => issue.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'))
    })
  }
}

for (const sample of [
  ['The next day, Mark asked Li Wei, “Why were you and Director Zhang so aggressive（强势）last night?”'],
  ['The next day, Mark asked Li Wei, “Why were you and Director Zhang so aggressive（强',
    '势）last night?” “Aggressive?” Li Wei smiled bitterly. “It’s our great honour to treat a guest,'],
  ['The next day, Mark asked Li Wei, “Why were you and Director Zhang so aggressive(强',
    '势)last night?”'],
  ['She was grateful（感激）and relieved (宽慰).'],
]) test(`unlabelled English sample keeps parenthesized Chinese glosses: ${sample.join('\\n')}`, () => {
  const issues = []
  const result = parseOfficialWritingSamples(body([
    '第四部分 写作', '第一节（满分15分）', 'Dear Charles,',
    '第二节（满分25分）', ...sample, '评分细则', '内容完整，语言准确。',
  ]), 'answers', issues)
  assert.deepEqual(issues, [])
  assert.deepEqual(result, { application: 'Dear Charles,', continuation: sample.join('\n') })
})

for (const first of [
  '范文（仅供参考）', '（评分标准）内容完整，语言准确。',
  'Content（内容完整语言准确表达连贯）', 'This sample 包含中文说明。',
  'The sample has an unclosed gloss（强势', 'This is a mismatched gloss（强势)',
]) test(`unlabelled scoring, Chinese titles and non-gloss Chinese remain ambiguous: ${first}`, () => {
  const issues = []
  const result = parseOfficialWritingSamples(body([
    '第四部分 写作', '第一节 应用文', 'A short sample.',
    '第二节 读后续写', first, 'An English-looking scoring example.',
  ]), 'answers', issues)
  assert.deepEqual(result, { application: null, continuation: null })
  assert(issues.some(issue => issue.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'))
})

test('a cross-line gloss never absorbs later scoring or commentary paragraphs', () => {
  for (const boundary of ['评分标准', '【审题重点】', '主题语境：人与社会']) {
    const issues = []
    const sample = 'Mark was aggressive（强\n势）last night.'
    const result = parseOfficialWritingSamples(body([
      '第四部分 写作', '第一节 应用文', 'A short sample.',
      '第二节 读后续写', ...sample.split('\n'), boundary, 'Never include this scoring example.',
    ]), 'answers', issues)
    assert.deepEqual(issues, [])
    assert.equal(result.continuation, sample)
  }
})

for (const marker of ['略', '略。', '（略）', '(略).']) {
  test(`Jinan retains the application sample when continuation explicitly says ${marker}`, () => {
    const issues = []
    const result = parseOfficialWritingSamples(body([
      '第四部分 写作（共两节，满分40分）', '第一节 应用文', 'One possible version:',
      'Dear Charles,', '读后续写', marker,
    ]), 'official-answers-2', issues)
    assert.deepEqual(issues, [])
    assert.deepEqual(result, { application: 'Dear Charles,', continuation: null })
  })
  test(`Qingdao explicitly omits the whole writing part with ${marker}`, () => {
    const issues = []
    const result = parseOfficialWritingSamples(body([
      '第四部分 写作（共两节，满分40分）', marker, '听力材料', 'Text 1', 'M: A transcript.',
    ]), 'official-answers-2', issues)
    assert.deepEqual(issues, [])
    assert.deepEqual(result, { application: null, continuation: null })
  })
}

test('an explicitly omitted application does not erase the continuation sample', () => {
  const issues = []
  assert.deepEqual(parseOfficialWritingSamples(body([
    '第四部分 写作', '第一节 应用文', '（略）', '第二节 读后续写', 'One possible version:',
    'Mina returned the key.',
  ]), 'answers', issues), { application: null, continuation: 'Mina returned the key.' })
  assert.deepEqual(issues, [])
})

test('both named writing sections may explicitly omit their labelled samples', () => {
  const issues = []
  assert.deepEqual(parseOfficialWritingSamples(body([
    '第四部分 写作', '第一节 应用文', 'One possible version:', '略。',
    '第二节 读后续写', '参考范文', '（略）', '评分细则', '按内容给分。',
  ]), 'answers', issues), { application: null, continuation: null })
  assert.deepEqual(issues, [])
})

test('an omission after completed prose retains the existing commentary boundary', () => {
  const issues = []
  assert.deepEqual(parseOfficialWritingSamples(body([
    '第四部分 写作', '第一节 应用文', 'A short notice.',
    '第二节 读后续写', 'Mina returned the key.', '略。', '听下面的录音，回答第1小题。', 'Text 1',
  ]), 'answers', issues), { application: 'A short notice.', continuation: 'Mina returned the key.' })
  assert.deepEqual(issues, [])
})

for (const lines of [
  ['略有说明'], ['（略）', 'A competing sample.'], ['略', '略'],
  ['略', '第一节 应用文', 'A competing sample.'],
  ['第一节 应用文', 'Dear Charles,', '读后续写'],
  ['第一节 应用文', 'Dear Charles,', '读后续写', '略', 'A competing sample.'],
]) test(`omission does not excuse ambiguous or competing writing text ${JSON.stringify(lines)}`, () => {
  const issues = []
  parseOfficialWritingSamples(body(['第四部分 写作', ...lines]), 'answers', issues)
  assert(issues.some(issue => issue.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'))
})

for (const [separator, label] of [
  ...[' ', '：', ': ', ''].map(separator => [separator, '作答示例']),
  [' ： ', '作答示例 ：'],
]) test(`section headings ${JSON.stringify([separator, label])} preserve essays and stop before scoring`, () => {
  const issues = []
  const result = parseOfficialWritingSamples(body([
    '第四部分 写作', `第一节${separator}${label}`, 'Our club shares books.',
    '评分原则', '只按内容评分。',
    `第二节${separator}${label}`, 'Mina returned the key.', '评分细则', '只按情节评分。',
  ]), 'answers', issues)
  assert.deepEqual(issues, [])
  assert.deepEqual(result, { application: 'Our club shares books.', continuation: 'Mina returned the key.' })
})

for (const [name, lines] of [
  ['reversed', ['第二节 作答示例', 'A short story.', '第一节 作答示例', 'A club notice.']],
  ['duplicate', ['第一节 作答示例', 'A club notice.', '第一节 作答示例', 'Another notice.',
    '第二节 作答示例', 'A short story.']],
  ['empty', ['第一节 作答示例', '第二节 作答示例', 'A short story.']],
  ['unrelated section', ['第一节 阅读理解 作答示例', 'A club notice.', '第二节 作答示例', 'A short story.']],
  ['explanatory suffix', ['第一节：作答示例说明如下。', 'A club notice.', '第二节 作答示例', 'A short story.']],
]) test(`作答示例 rejects ${name} boundaries`, () => {
  const issues = []
  assert.deepEqual(parseOfficialWritingSamples(body(['第四部分 写作', ...lines]), 'answers', issues),
    { application: null, continuation: null })
  assert(issues.some(issue => issue.code === 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS'))
})

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
