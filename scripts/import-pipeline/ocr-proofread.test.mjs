import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinTranscriptTurns, isAnswerFurniture, referenceLineBoundary, writingSectionAfterPart, buildSourceReferences,
  buildTranscriptJoinDocuments } from './ocr-proofread.mjs'

function fixture(texts, lefts = []) {
  const items = texts.map((text, i) => ({ lines: `L${i + 1}`, text }))
  const lines = texts.map((text, i) => ({
    words: text.split(' ').map((text, j, words) => ({
      number: i * 100 + j + 1, text,
      box: { left: (lefts[i] ?? 10) + j * (90 / words.length), top: i * 15,
        width: 90 / words.length, height: 10 },
    })),
  }))
  return { items, lines }
}

test('production transcript orchestration owns roles, rendition filtering, trace order and document/page state', () => {
  const documents = [
    { documentId: 'question', role: 'question_source' },
    { documentId: 'copy', role: 'official_answers', renditionOf: 'answers' },
    { documentId: 'answers', role: 'official_answers' },
    { documentId: 'other', role: 'question_and_answers' },
  ]
  const drafts = {}
  const makePage = (documentId, page, texts) => {
    const { items, lines } = fixture(texts)
    const key = `${documentId}-p${page}`
    drafts[key] = { documentId, page, items }
    return { documentId, page, key, words: lines.flatMap((line, index) =>
      line.words.map((word) => ({ ...word, line: index }))) }
  }
  const trace = { schemaVersion: 'ocr-proofread-trace-v2', pages: [
    makePage('answers', 2, ['Text 1']),
    makePage('question', 1, ['Text 1', 'M: These are some words', 'and these continue that turn']),
    makePage('answers', 1, ['M: These are some words', 'and these continue that turn']),
    makePage('other', 1, ['M: These are some words', 'and these continue that turn']),
    makePage('copy', 1, ['Text 1']),
  ] }
  const input = { documents, trace, drafts }
  const original = structuredClone(input)
  const result = [...buildTranscriptJoinDocuments(input)].map(({ document, pages }) => ({ document, pages: [...pages] }))
  assert.deepEqual(result.map(({ document }) => document.documentId), ['question', 'answers', 'other'])
  assert.equal(result[0].pages[0].joins, 0)
  assert.deepEqual(result[1].pages.map(({ tracePage }) => tracePage.page), [2, 1])
  assert.deepEqual(result[1].pages.map(({ stateBefore }) => stateBefore), [false, true])
  assert.deepEqual(result[1].pages.map(({ joins }) => joins), [0, 1])
  assert.equal(result[2].pages[0].stateBefore, false)
  assert.equal(result[2].pages[0].joins, 0)
  const selected = [...buildTranscriptJoinDocuments({ ...input, only: ['answers-p1'] })]
    .flatMap(({ pages }) => [...pages])
  assert.equal(selected.length, 1)
  assert.equal(selected[0].stateBefore, false)
  assert.equal(selected[0].joins, 0)
  assert.deepEqual(input, original)
})

test('joins source bold spans and Chinese glosses without losing their occurrences', () => {
  const { items, lines } = fixture(['Text 1', 'M: Hello hello（注）', 'hello again.', 'W: Hello.'])
  items[1].emphasis = [{ text: 'hello', marks: ['bold'] }]
  items[2].emphasis = [{ text: 'hello', marks: ['underline'] }]
  const result = joinTranscriptTurns(items, lines, {}, 'fixture')
  assert.equal(result.joins, 1)
  assert.equal(result.items[1].text, 'M: Hello hello（注） hello again.')
  assert.deepEqual(result.items[1].emphasis, [
    { text: 'hello', marks: ['bold'], occurrence: 1 },
    { text: 'hello', marks: ['underline'], occurrence: 2 },
  ])
  assert.equal(result.items[2].text, 'W: Hello.')
})

test('keeps speakers, Text headings and genuine paragraph indents separate', () => {
  const { items, lines } = fixture([
    'Text 1', 'M: These are some words', 'W: These are other words',
    'Text 2（推断题）', 'Here are some more words', 'A new paragraph starts here',
  ], [10, 10, 10, 10, 10, 40])
  assert.equal(joinTranscriptTurns(items, lines, {}, 'fixture').joins, 0)
  const indented = fixture(['Text 1', 'M: These are some words', 'A new paragraph starts here'], [10, 10, 32])
  assert.equal(joinTranscriptTurns(indented.items, indented.lines, {}, 'fixture').joins, 0)
  const hanging = fixture(['Text 1', 'M: These are some words', 'and these continue that turn'], [10, 10, 28])
  assert.equal(joinTranscriptTurns(hanging.items, hanging.lines, {}, 'fixture').joins, 1)
})

test('joins a hanging continuation when OCR splits its speaker label from the physical line', () => {
  const make = () => {
    const { items, lines } = fixture([
      'Text 7', 'M: This laptop also has a', 'touchscreen for everyday use', 'W: Thank you.',
    ], [10, 14, 15, 10])
    // Source label and colon occupy their own OCR groups, but share the body's
    // vertical band. The confirmed M: repairs an OCR-misread label.
    lines[1].words[0].text = ':'
    lines[1].words[0].box.left = 11
    lines[1].words[0].box.width = 1
    const label = { number: 99, text: 'zs', box: { left: 10, top: 15, width: 3, height: 10 } }
    lines.splice(1, 0, { words: [label] })
    items[1].lines = 'L2-L3'
    items[2].lines = 'L4'
    items[3].lines = 'L5'
    return { items, lines }
  }
  const wrapped = make()
  const result = joinTranscriptTurns(wrapped.items, wrapped.lines, {}, 'fixture')
  assert.equal(result.joins, 1)
  assert.equal(result.items[1].text, 'M: This laptop also has a touchscreen for everyday use')
  assert.equal(result.items[2].text, 'W: Thank you.')

  const paragraph = make()
  paragraph.lines[3].words.forEach((word) => { word.box.left += 20 })
  assert.equal(joinTranscriptTurns(paragraph.items, paragraph.lines, {}, 'fixture').joins, 0)
  const separateLine = make()
  separateLine.lines[1].words[0].box.top = 2
  assert.equal(joinTranscriptTurns(separateLine.items, separateLine.lines, {}, 'fixture').joins, 0)
})

test('recognizes page furniture by source geometry, without dropping body text or labels', () => {
  const edge = { y: 0.04, height: 0.02 }
  assert.equal(isAnswerFurniture('英语参考答案 第2页（共5页）', edge), true)
  assert.equal(isAnswerFurniture('高三英语参考答案', edge), true)
  assert.equal(isAnswerFurniture('English Answer Key Page 2 of 5', edge), true)
  assert.equal(isAnswerFurniture('浙江省六校高三模拟考试', edge, true), true)
  assert.equal(isAnswerFurniture('A small flame of kindness.', edge, true), false)
  assert.equal(isAnswerFurniture('Possible Version', edge), false)
  assert.equal(isAnswerFurniture('English was my favorite subject.', edge), false)
  assert.equal(isAnswerFurniture('English Answer Key Page 2 of 5', { y: 0.04, height: 0.3 }), false)
  assert.equal(isAnswerFurniture('English Answer Key Page 2 of 5', { y: 0.4, height: 0.02 }), false)
})

test('joins repaired speaker punctuation and a wrapped thousands group, preserving boundaries', () => {
  const { items, lines } = fixture(['Text 9', 'M: Learn by connecting',
    'them with tutors.', 'Text 10', 'W: They move to a 2,',
    '500-acre reserve and a', 'forest.', '21. A separate question.', 'W: A new turn.'])
  for (const index of [1, 4]) {
    const top = index * 30
    lines[index].words = [
      { number: index * 100 + 1, text: index === 1 ? 'M' : 'W', box: { left: 111, top, width: 15, height: 20 } },
      { number: index * 100 + 2, text: ';', box: { left: 140, top: top + 7, width: 3, height: 9 } },
      { number: index * 100 + 3, text: items[index].text.slice(3), box: { left: 155, top, width: 920, height: 20 } },
    ]
  }
  for (const index of [2, 5, 6]) {
    lines[index].words.forEach((word, j) => {
      word.box = { left: 154 + j * 100, top: index * 30, width: j === 0 ? 94 : 100, height: 20 }
    })
    lines[index].words.at(-1).box.width = 1075 - lines[index].words.at(-1).box.left
  }
  const result = joinTranscriptTurns(items, lines, {}, 'fixture')
  assert.equal(result.joins, 3)
  assert.deepEqual(result.items.map(item => item.text), ['Text 9',
    'M: Learn by connecting them with tutors.', 'Text 10',
    'W: They move to a 2, 500-acre reserve and a forest.',
    '21. A separate question.', 'W: A new turn.'])
  const indented = structuredClone(lines)
  indented[5].words.forEach(word => { word.box.left += 25 })
  assert(!joinTranscriptTurns(items, indented, {}, 'fixture').items.some(item => item.text.includes('2, 500')))
})

test('sample line joins respect real indent and long words wrapping early', () => {
  const previous = { role: 'body', right: 0.81, page: 1 }
  const line = { text: 'Unexpectedly everything changed.', left: 0.1, page: 1,
    boxes: [{ region: { x: 0.1, y: 0.3, width: 0.1 } }] }
  assert.equal(referenceLineBoundary(previous, line, { left: 0.1, right: 0.9 }).previousShort, false)
  line.text = 'a genuinely new paragraph.'
  line.left = 0.14
  const result = referenceLineBoundary(previous, line, { left: 0.1, right: 0.9 })
  assert.equal(result.indented, true)
  assert.equal(result.continues, false)
})

test('writing part heading may carry the first section number on the same OCR item', () => {
  assert.equal(writingSectionAfterPart('第四部分 写作（共两节，满分40分）\n第一节'), 'application')
  assert.equal(writingSectionAfterPart('第四部分 写作（共两节，满分40分） 第二节'), 'continuation')
  assert.equal(writingSectionAfterPart('第四部分 写作\n第一节（满分15分）'), 'application')
  assert.equal(writingSectionAfterPart('第四部分 写作（共两节，满分40分）'), null)
  assert.equal(writingSectionAfterPart('第四部分 写作（共两节）\n第一节 Dear classmates,'), null)
  assert.equal(writingSectionAfterPart('第三部分 语言知识运用\n第一节'), null)
})

test('joins Chinese transcript footnotes within items and across physical lines', () => {
  const { items, lines } = fixture(['Text 9', '★ 剑桥大学是顶尖研究\n型大学。',
    '★ 美索不达米亚是两河之间的土地（两河指幼发', '拉底河与底格里斯河）。', '★ 另一条注释。', 'Text 10'])
  const result = joinTranscriptTurns(items, lines, {}, 'fixture')
  assert.equal(result.items[1].text, '★ 剑桥大学是顶尖研究型大学。')
  assert.equal(result.items[2].text, '★ 美索不达米亚是两河之间的土地（两河指幼发拉底河与底格里斯河）。')
  assert.equal(result.items[3].text, '★ 另一条注释。')
  // Actual note marker/body/continuation x coordinates: 141 / 173 / 172.
  lines[2].words[0].box = { left: 141, top: 1008, width: 18, height: 34 }
  lines[2].words[1].box = { left: 173, top: 1008, width: 908, height: 34 }
  lines[3].words[0].box = { left: 172, top: 1045, width: 910, height: 34 }
  assert.equal(joinTranscriptTurns(items, lines, {}, 'fixture').items[2].text, result.items[2].text)
  lines[3].words[0].box.left = 200
  assert.equal(joinTranscriptTurns(items, lines, {}, 'fixture').items[3].text, items[3].text)
})

test('joins Jiyang Text 7/8 split-label wraps at their source coordinates', () => {
  for (const [speaker, tail, continuation, top, nextTop, width, colonOffset] of [
    ['W', 'I’ve downloaded lots', 'of tasty-looking recipes', 1162, 1198, 14, 13],
    ['M', 'for me to run', 'and it’s all going', 223, 256, 32, 4],
  ]) {
    const { items, lines } = fixture(['Text 7', `${speaker}: ${tail}`, continuation])
    lines[1].words = [
      { number: 101, text: '=', box: { left: 109, top, width: 18, height: 15 } },
      { number: 102, text: ':', box: { left: 130, top: top + colonOffset, width: 2, height: 2 } },
      { number: 103, text: tail, box: { left: 139, top, width: 943, height: 19 } },
    ]
    lines.splice(1, 0, { words: [lines[1].words.shift()] })
    lines[3].words[0].box = { left: 141, top: nextTop, width, height: 27 }
    lines[3].words.slice(1).forEach((word, i) => {
      word.box = { left: 181 + i * 200, top: nextTop, width: 150, height: 19 }
    })
    items[1].lines = 'L2-L3'
    items[2].lines = 'L4'
    assert.equal(joinTranscriptTurns(items, lines, {}, 'fixture').items[1].text,
      `${speaker}: ${tail} ${continuation}`)
  }
})

test('excludes English quote fragments from writing commentary and resumes at a sample label', () => {
  const texts = ['第二节 读后续写', '参考范文', 'A completed sample.',
    '首句衔接要点：第一段需与原文', 'leave the next day.',
    'leave the next day.”自然衔接，体现离别情绪；第二段需与原文',
    'Arthur arrived.”自然衔接，呼应关键意象。', '范文', 'Another real sample.']
  const observations = texts.map((text, i) => ({ observationId: `o${i}`, region: { x: .1, y: .15+i*.04, width: .8, height: .02 } }))
  const result = buildSourceReferences({ documents: [{documentId: 'answers', role: 'official_answers', sha256: 'abc'}],
    groups: [{groupId: 'cont', writingTask: {taskType: 'continuation'}}] },
    { documents: [{ documentId: 'answers', pages: [{observations}] }] },
    { documents: [{ documentId: 'answers', pages: [{page: 1, orderedItems: texts.map((text,i)=>({itemId: `i${i}`, text, observationIds: [`o${i}`]}))}] }] })
  assert.deepEqual(result.groups[0].essays.entries.map(e=>e.paragraphs.map(p=>p.text)),
    [['A completed sample.'], ['Another real sample.']])
})

function referencesFixture(texts, taskTypes = ['continuation'], { lastQuestion, role = 'official_answers' } = {}) {
  const observations = texts.map((text, i) => ({
    observationId: `o${i}`, region: { x: .1, y: .15 + i * .025, width: .8, height: .02 },
  }))
  return buildSourceReferences({
    documents: [{ documentId: 'answers', role, sha256: 'abc' }],
    groups: [
      ...(lastQuestion ? [{ questions: [{ sourceNumber: lastQuestion }] }] : []),
      ...taskTypes.map(taskType => ({ groupId: taskType, writingTask: { taskType } })),
    ],
  }, { documents: [{ documentId: 'answers', pages: [{ observations }] }] },
  { documents: [{ documentId: 'answers', pages: [{ page: 1,
    orderedItems: texts.map((text, i) => ({ itemId: `i${i}`, text, observationIds: [`o${i}`] })),
  }] }] })
}

test('a complete letter after the final objective answers establishes a bare application section', () => {
  for (const lastQuestion of [55, 65]) {
    const texts = [`${lastQuestion - 1}. a ${lastQuestion}. growing`, '第一节', 'Dear Sam,',
      'Our club meets on Friday.', 'Please bring seeds.', 'We hope you can join us.',
      'Yours sincerely,', 'Alex', '第二节', 'Mia opened the garden gate.']
    const result = referencesFixture(texts, ['application', 'continuation'], { lastQuestion })
    assert.deepEqual(result.groups.map(g => [g.essays.state, g.essays.entries.length]),
      [['captured', 1], ['captured', 1]])
    const entry = result.groups[0].essays.entries[0]
    assert.equal(entry.sourceLabel, null)
    assert.deepEqual(entry.paragraphs.map(p => [p.role, p.text]), [
      ['salutation', texts[2]], ['body', texts.slice(3, 6).join(' ')],
      ['closing', texts[6]], ['signature', texts[7]],
    ])
    assert.deepEqual(entry.paragraphs[0].source, { documentSha256: 'abc',
      locator: { kind: 'page_region', documentId: 'answers', page: 1,
        region: { x: .1, y: .2, width: .8, height: .02 } } })
    assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text), [texts[9]])
  }
  const wrappedDate = referencesFixture(['65. growing', '第一节', 'Dear Sam,',
    'Our club meets on May', '30th.', 'Yours sincerely,', 'Alex'], ['application'], { lastQuestion: 65 })
  assert.deepEqual(wrappedDate.groups[0].essays.entries[0].paragraphs.map(p => p.text),
    ['Dear Sam,', 'Our club meets on May 30th.', 'Yours sincerely,', 'Alex'])
})

for (const [name, boundary] of [
  ['question number', '21. A reading question.'],
  ['listening speaker', 'M: A listening speech.'],
  ['numbered continuation paragraph', 'Paragraph 1:'],
  ['continuation prompt', '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。'],
]) {
  test(`a ${name} after the signature ends the admitted bare-section letter capture`, () => {
    const letter = ['Dear Sam,', 'Our club meets on Friday.', 'Yours sincerely,', 'Alex']
    for (const continuation of [[], ['第二节', 'Mia opened the garden gate.']]) {
      const result = referencesFixture(['65. growing', '第一节', ...letter,
        boundary, 'An unrelated story follows.', '参考范文', 'Another unrelated sample.',
        '评分标准', '这段评分文字已经越过边界。',
        ...continuation], continuation.length ? ['application', 'continuation'] : ['application'],
      { lastQuestion: 65 })
      const application = result.groups[0].essays
      assert.equal(application.state, 'captured')
      assert.equal(application.entries.length, 1)
      assert.equal(result.groups[0].scoring.state, 'not_supplied')
      assert.deepEqual(application.entries[0].paragraphs.map(p => [p.role, p.text]),
        [['salutation', letter[0]], ['body', letter[1]], ['closing', letter[2]], ['signature', letter[3]]])
      assert.deepEqual(application.entries[0].paragraphs.at(-1).source, { documentSha256: 'abc',
        locator: { kind: 'page_region', documentId: 'answers', page: 1,
          region: { x: .1, y: .275, width: .8, height: .02 } } })
      if (continuation.length) {
        assert.equal(result.groups[1].essays.state, 'captured')
        assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text), [continuation[1]])
      }
    }
  })
}

test('an admitted bare-section letter preserves explicit scoring labels and exact sources after its signature', () => {
  const letter = ['Dear Sam,', 'Our club meets on Friday.', 'Yours sincerely,', 'Alex']
  const scoring = ['1. 本题总分为15分，按五个档次给分。', '2. 内容完整，语言准确。']
  for (const label of ['评分标准', '评分建议']) {
    for (const taskHeading of [[], ['应用文评分细则']]) {
      const texts = ['65. growing', '第一节', ...letter, ...taskHeading, label, ...scoring]
      const result = referencesFixture(texts, ['application'], { lastQuestion: 65 })
      const named = referencesFixture(texts.map((text, i) => i === 1 ? '第一节 应用文' : text),
        ['application'], { lastQuestion: 65 })
      assert.deepEqual(result.groups, named.groups)
      assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text), letter)
      const captured = result.groups[0].scoring
      assert.equal(captured.state, 'captured')
      assert.equal(captured.entries.length, 1)
      assert.equal(captured.entries[0].sourceLabel, label)
      assert.equal(captured.entries[0].paragraphs.map(p => p.text).join(' '), scoring.join(' '))
      const labelIndex = texts.indexOf(label)
      assert.deepEqual(captured.entries[0].labelSource, { documentSha256: 'abc',
        locator: { kind: 'page_region', documentId: 'answers', page: 1,
          region: { x: .1, y: Number((.15 + labelIndex * .025).toFixed(6)), width: .8, height: .02 } } })
    }
  }
})

for (const [name, boundary] of [
  ['question number', '21. A reading question.'],
  ['listening speaker', 'M: A listening speech.'],
  ['numbered continuation paragraph', 'Paragraph 1:'],
  ['continuation prompt', '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。'],
]) {
  test(`a ${name} after scoring ends only the admitted application's references`, () => {
    const letter = ['Dear Sam,', 'Our club meets on Friday.', 'Yours sincerely,', 'Alex']
    const scoring = '1. 本题总分为15分，按五个档次给分。'
    const result = referencesFixture(['65. growing', '第一节', ...letter, '评分标准', scoring,
      boundary, 'An unrelated story follows.', '评分建议', '边界后不得重新采集。',
      '第二节', 'Mia opened the garden gate.'], ['application', 'continuation'], { lastQuestion: 65 })
    assert.deepEqual(result.groups[0].essays.entries.map(e => e.paragraphs.map(p => p.text)), [letter])
    assert.equal(result.groups[0].scoring.state, 'captured')
    assert.deepEqual(result.groups[0].scoring.entries.map(e => [e.sourceLabel, e.paragraphs.map(p => p.text)]),
      [['评分标准', [scoring]]])
    assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text),
      ['Mia opened the garden gate.'])
  })
}

test('bare sections reject incomplete letters, non-writing material and unbounded letter quotes', t => {
  const diagnostics = []
  t.mock.method(console, 'error', message => diagnostics.push(message))
  t.mock.method(process, 'exit', () => { throw new Error('missing application section') })
  const letter = ['Dear Sam,', 'Our club meets on Friday.', 'Yours sincerely,', 'Alex']
  const cases = [
    ['65. growing', '第一节', 'A story began beside the gate.'],
    ['65. growing', '第一节', 'Dear Sam,'],
    ['65. growing', '第一节', ...letter.slice(0, 2)],
    ['65. growing', '第一节', ...letter.slice(0, 3)],
    ['65. growing', '第一节', ...letter.slice(0, 3), 'The story ended beside the gate.'],
    ['65. growing', '第一节', 'Dear Sam,', 'Yours sincerely,', 'Alex'],
    ['65. growing', '第一节', 'Dear Sam,', 'Our club meets', 'Yours sincerely,', 'Alex'],
    ['65. growing', '第二节', ...letter],
    ['65. growing', '第一节', 'Paragraph 1:', ...letter],
    ['65. growing', '第一节', 'Dear Sam,', '第二节', ...letter.slice(1)],
    ['65. growing', '第一节', 'Dear Sam,', '21. A reading question.', ...letter.slice(1)],
    ['65. growing', '第一节', 'Dear Sam,', '答案解析', ...letter.slice(1)],
    ['65. growing', '第一节', 'Dear Sam,', 'Text 1', ...letter.slice(1)],
    ['65. growing', '第一节', 'Dear Sam,', 'M: Our club meets on Friday.', ...letter.slice(2)],
    ['65. growing', '第一节', ...letter, 'The story continues after the quoted letter.'],
    ['64. growing', '第一节', ...letter],
    ['第一节', ...letter],
    ...['第二部分 阅读', '第一部分 听力', '第三部分 语言运用', '听力原文', 'Text 1', '答案解析']
      .map(heading => ['65. growing', heading, '第一节', ...letter]),
  ]
  for (const texts of cases) {
    assert.throws(() => referencesFixture(texts, ['application'], { lastQuestion: 65 }),
      /missing application section/, JSON.stringify(texts))
    assert.match(diagnostics.at(-1), /No answer-document section found for application/)
  }
  assert.throws(() => referencesFixture(['65. growing', '第一节', ...letter], ['application'],
    { lastQuestion: 65, role: 'question_and_answers' }), /missing application section/)
  assert.throws(() => referencesFixture(['65. growing', '第一节', ...letter], ['application']),
    /missing application section/)
})

test('Arabic-numbered Chinese story commentary does not become an unlabeled reference', () => {
  const result = referencesFixture([
    '第四部分 写作', '第二节', '1. 故事概述', '女孩误会了邻居，随后主动道歉。',
    '2、续写方向', '续写应呼应门口的花盆。',
    '参考范文', 'Possible Version 1', 'Mia knocked gently and waited.',
  ])
  assert.equal(result.groups[0].essays.entries.length, 1)
  assert.equal(result.groups[0].essays.entries[0].sourceLabel, 'Possible Version 1')
  assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text),
    ['Mia knocked gently and waited.'])
})

test('captures three official examples per task and stops at each numbered student-script column', () => {
  const applicationLabels = ['【示例一】', '【示例二】建议调整活动安排', '【示例三】说明另一种安排']
  const continuationLabels = ['【示例一】描写共同劳动', '【示例二】描写意外收获', '【示例三】描写再次相遇']
  const result = referencesFixture([
    '第一节 应用文', '(一)考查目标与写作情境', '本题要求介绍社团活动。',
    '（二）评分说明', '注意表达清楚。', '(四)作答示例',
    applicationLabels[0], 'Dear Sam,', 'Our club will plant herbs.',
    applicationLabels[1], 'Dear Sam,', 'Please join our garden walk.',
    applicationLabels[2], 'Dear Sam,', 'We could visit the greenhouse.',
    '(五)样卷', '【示例四】学生作答', 'Dear Sam,', 'This student script must stay outside the references.',
    '第二节 读后续写', '（一）考查目标与写作情境', '续写需呼应故事。',
    '（四）作答示例', continuationLabels[0], 'Ada brought a watering can.',
    continuationLabels[1], 'A tiny green shoot appeared.',
    continuationLabels[2], 'They met beside the greenhouse.',
    '（五）样卷', '参考范文', 'This graded student story must also be excluded.', '评语：衔接自然。',
  ], ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.map(e => e.sourceLabel)),
    [applicationLabels, continuationLabels])
  assert.deepEqual(result.groups.map(g => g.essays.entries.map(e => e.paragraphs.map(p => p.text))),
    [[['Dear Sam,', 'Our club will plant herbs.'], ['Dear Sam,', 'Please join our garden walk.'],
      ['Dear Sam,', 'We could visit the greenhouse.']],
    [['Ada brought a watering can.'], ['A tiny green shoot appeared.'], ['They met beside the greenhouse.']]])
  assert.deepEqual(result.groups.map(g => g.scoring.entries), [[], []])
  for (const group of result.groups) {
    assert.equal(group.essays.state, 'captured')
    assert(group.essays.entries.every(entry => entry.paragraphs.length > 0))
  }
})

test('example recognition keeps English numbered text, inline glosses and existing source labels', () => {
  const result = referencesFixture(['第三部分 写作', '第一节', '参考范文（80词）',
    'Dear Sam,', '1. Bring seeds（种子） for the garden.', '二、评分原则', '1. 本题总分为15分。',
    '第二节', 'Possible Version', 'A Day in the Garden', '【示例一】An English sentence follows.',
    'The children found a seedling（幼苗）.', '(1) They watered it together.',
    '【示例二】另一种结尾', 'They returned the next morning.'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.map(e => e.sourceLabel)),
    [['参考范文（80词）'], ['Possible Version', '【示例二】另一种结尾']])
  assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text),
    ['Dear Sam,', '1. Bring seeds（种子） for the garden.'])
  assert.deepEqual(result.groups[0].scoring.entries[0].paragraphs.map(p => p.text),
    ['1. 本题总分为15分。'])
  const story = result.groups[1].essays.entries[0].paragraphs.map(p => p.text).join(' ')
  for (const text of ['A Day in the Garden', '【示例一】An English sentence follows.',
    'The children found a seedling（幼苗）.', '(1) They watered it together.']) {
    assert(story.includes(text), text)
  }
  assert.deepEqual(result.groups[1].essays.entries[1].paragraphs.map(p => p.text),
    ['They returned the next morning.'])
})

test('explicit writing sections accept Chinese and ASCII parentheses and retain plain headings', () => {
  for (const [application, continuation] of [
    ['第一节（应用文）', '第二节（读后续写）'],
    ['第一节(应用文)', '第二节(读后续写)'],
    ['第一节（书面表达）', '第二节（续写）'],
    ['第一节(书面表达)', '第二节(续写)'],
    ['第一节 应用文', '第二节 读后续写'],
    ['第一节：书面表达', '第二节：续写'],
  ]) {
    const result = referencesFixture(['第四部分', application, '参考范文',
      'We planted a small garden.', continuation, 'Possible Version',
      'Mia returned with a shovel.'], ['application', 'continuation'])
    assert.deepEqual(result.groups.map(g => g.essays.entries.map(e => e.paragraphs.map(p => p.text))),
      [[['We planted a small garden.']], [['Mia returned with a shovel.']]], application)
    assert.deepEqual(result.groups.map(g => g.essays.entries[0].sourceLabel),
      ['参考范文', 'Possible Version'])
  }
})

test('word-count Chinese sample labels preserve separate entries and exact source locators', () => {
  for (const [first, second, story] of [[92, 91, 162], [105, 109, 224]]) {
    const labels = [`参考范文一（${first}词）`, `参考范文二（${second}词）`, `参考范文（${story}词）`]
    const result = referencesFixture(['第四部分', '第一节（应用文）',
      labels[0], 'Our club meets on Friday.', labels[1], 'Please bring your own seeds.',
      '第二节（读后续写）', labels[2], 'Leo opened the garden gate.'],
    ['application', 'continuation'])
    const entries = result.groups.flatMap(g => g.essays.entries)
    assert.deepEqual(entries.map(e => e.sourceLabel), labels)
    assert.deepEqual(entries.map(e => e.referenceId),
      ['source-ref-app-1', 'source-ref-app-2', 'source-ref-cont-1'])
    assert.deepEqual(entries.map(e => e.paragraphs.map(p => p.text)),
      [['Our club meets on Friday.'], ['Please bring your own seeds.'], ['Leo opened the garden gate.']])
    for (const [index, itemIndex] of [2, 4, 7].entries()) {
      assert.deepEqual(entries[index].labelSource, {
        documentSha256: 'abc',
        locator: { kind: 'page_region', documentId: 'answers', page: 1,
          region: { x: .1, y: Number((.15 + itemIndex * .025).toFixed(6)), width: .8, height: .02 } },
      })
      assert.deepEqual(entries[index].paragraphs[0].source, {
        documentSha256: 'abc',
        locator: { kind: 'page_region', documentId: 'answers', page: 1,
          region: { x: .1, y: Number((.15 + (itemIndex + 1) * .025).toFixed(6)), width: .8, height: .02 } },
      })
      assert.equal(entries[index].authority, 'source_reference')
    }
  }
})

test('word-count sample labels establish bare writing sections without widening commentary labels', () => {
  const result = referencesFixture(['第一节\n参考范文一（92词）', 'Our team made a poster.',
    '参考范文二(109词)', 'We shared it at school.',
    '参考范文三（100词）需要结合题意修改', '参考范文四（很多词）', '224',
    '第二节', '参考范文(224词)', 'Nora carried the poster home.'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.map(e => e.sourceLabel)),
    [['参考范文一（92词）', '参考范文二(109词)'], ['参考范文(224词)']])
  assert.deepEqual(result.groups.map(g => g.essays.entries.map(e => e.paragraphs.map(p => p.text))),
    [[['Our team made a poster.'], ['We shared it at school.']], [['Nora carried the poster home.']]])
})

test('earlier parenthesized reading and grammar sections cannot establish writing references', () => {
  const result = referencesFixture(['第二部分', '第一节（阅读理解）', 'Possible Version',
    'The reading passage describes a garden.', '第三部分', '第二节(语法填空)',
    '参考范文（224词）', 'The grammar exercise uses a short story.',
    '第四部分 写作', '略'], ['application', 'continuation'])
  for (const group of result.groups) {
    assert.equal(group.essays.state, 'not_supplied')
    assert.deepEqual(group.essays.entries, [])
  }
})

test('third writing part establishes both bare sections without sample labels', () => {
  const result = referencesFixture(['第二部分 语言运用', '第一节', '56. A',
    '第三部分 写作（共两节，满分40分）', '第一节', 'Our club planted trees.',
    '第二节', 'Mia returned to the garden.'], ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Our club planted trees.'], ['Mia returned to the garden.']])
})

test('third writing part may carry its first bare section in the same OCR item', () => {
  const heading = '第三部分 写作（共两节，满分40分）\n第一节'
  assert.equal(writingSectionAfterPart(heading), 'application')
  const result = referencesFixture([heading, 'Our team brought seeds.',
    '第二节', 'Leo opened the garden gate.'], ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Our team brought seeds.'], ['Leo opened the garden gate.']])
})

test('a writing part and a named task heading in one confirmed item open the exact task', () => {
  for (const [section, task] of [
    ['第一节 应用文（15分）', 'application'],
    ['第二节 读后续写（25分）', 'continuation'],
  ]) {
    const heading = `第四部分 写作\n${section}`
    assert.equal(writingSectionAfterPart(heading), task)
    const result = referencesFixture([heading, 'A complete official sample.'], [task])
    assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text),
      ['A complete official sample.'])
  }
  for (const heading of ['第四部分 写作\n第一节 阅读理解', '第二部分 阅读\n第一节 应用文']) {
    assert.equal(writingSectionAfterPart(heading), null)
  }
})

test('confirmed bare fourth-part omission captures absence without inventing a model answer', () => {
  const result = referencesFixture(['第三部分', '56. on', '第四部分', '（略）',
    '听力部分原文', '第一节', 'Text 1', 'M: Not a model answer.'], ['application', 'continuation'])
  for (const group of result.groups) {
    assert.equal(group.essays.state, 'not_supplied')
    assert.deepEqual(group.essays.entries, [])
    assert(group.essays.evidence.length)
  }
})

test('an unconfirmed missing writing section still fails closed', t => {
  const diagnostics = []
  t.mock.method(console, 'error', text => diagnostics.push(text))
  t.mock.method(process, 'exit', () => { throw new Error('missing writing section') })
  for (const texts of [
    ['第四部分', '听力部分原文'], ['第四部分', 'A mystery sample.'],
    ['第三部分', '（略）', '听力部分原文'], ['略', '听力部分原文'],
  ]) {
    assert.throws(() => referencesFixture(texts, ['application', 'continuation']), /missing writing section/)
    assert.match(diagnostics.at(-1), /No answer-document section found for application/)
  }
})

test('reprinted continuation prompt and givens stay outside samples until an explicit source label', () => {
  const result = referencesFixture(['（三）读后续写（满分25分）',
    '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。',
    'It was early May, my first day as a volunteer.',
    '注意：', 'Paragraph 1:', 'I had a lot of cleanup to do.',
    'Paragraph 2:', 'Something seemed to be changing in me, too.',
    '2. 参考范文', 'I had a lot of cleanup to do. The garden needed everyone.',
    'Something seemed to be changing in me, too. I learned to listen.',
    '（故事情节构思中需重点关注以下关键点的回应和转变：①我对工作态度',
    '的转变：从回避交流到主动沟通）', '4. 评分细则', '按内容和语言给分。'])
  assert.equal(result.groups[0].essays.entries.length, 1)
  assert.equal(result.groups[0].essays.entries[0].sourceLabel, '2. 参考范文')
  assert.equal(result.groups[0].essays.entries[0].paragraphs.map(p => p.text).join(' '),
    'I had a lot of cleanup to do. The garden needed everyone. Something seemed to be changing in me, too. I learned to listen.')
  assert.equal(result.groups[0].scoring.entries[0].paragraphs[0].text, '按内容和语言给分。')
  const legitimate = referencesFixture(['第二节 读后续写', 'A volunteer trimmed weeds（杂草）.',
    '(1) The neighbors helped.', '（中文评分说明）', '4. 评分细则', '（中文评分正文）'])
  assert.equal(legitimate.groups[0].essays.entries[0].paragraphs.map(p => p.text).join(' '),
    'A volunteer trimmed weeds（杂草）. (1) The neighbors helped.')
  assert.equal(legitimate.groups[0].scoring.entries[0].paragraphs[0].text, '（中文评分正文）')
})

test('an unlabeled sample after a reprinted prompt requires confirmation instead of claiming absence', t => {
  const diagnostics = []
  t.mock.method(console, 'error', message => diagnostics.push(message))
  t.mock.method(process, 'exit', () => { throw new Error('unresolved source reference') })
  for (const ending of [[], ['听力原文'], ['（五）样卷'], ['4. 评分细则', '按内容给分。']]) {
    assert.throws(() => referencesFixture(['第二节 读后续写',
      '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。',
      'An original story.', 'Paragraph 1:', 'The neighbors joined the cleanup.', ...ending]),
    /unresolved source reference/)
    assert.match(diagnostics.at(-1), /Unresolved continuation reference.*confirm/iu)
  }
  const omitted = referencesFixture(['第二节 读后续写',
    '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。',
    'An original story.', 'Paragraph 1:', 'A given starter.', '（略）'])
  assert.equal(omitted.groups[0].essays.state, 'not_supplied')
  assert.deepEqual(omitted.groups[0].essays.entries, [])
})

test('parenthesized Chinese glosses retain their same-line English prose even after commentary', () => {
  for (const text of ['（幼苗） and planted it beside the gate.', '(幼苗) and planted it beside the gate.',
    '（幼苗 and roots）', '（幼苗） café seedlings grew.', '（一）幼苗 and planted it beside the gate.']) {
    for (const preceding of [[], ['（中文指导）']]) {
      const result = referencesFixture(['第二节 读后续写', '参考范文', 'They picked a seedling',
        ...preceding, text])
      const body = result.groups[0].essays.entries.flatMap(entry => entry.paragraphs.map(p => p.text)).join(' ')
      assert(body.includes(text), JSON.stringify({ text, preceding }))
      assert(!body.includes('中文指导'))
    }
  }
  for (const text of ['（中文指导）后续说明', '(中文指导)后续说明']) {
    const result = referencesFixture(['第二节 读后续写', '参考范文', text])
    assert.equal(result.groups[0].essays.entries[0].paragraphs[0].text, text)
  }
})

test('numbered source sample and scoring labels establish and preserve writing boundaries', () => {
  const result = referencesFixture(['第四部分', '第一节（满分15分）',
    '一、参考范文：', 'Dear Alex,', 'A source application.', '二、评分原则',
    '1. 本题总分为15分。', '第二节（满分25分）', '一、参考范文：',
    'A source story.', '二、评分原则', '1. 本题总分为25分。'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Dear Alex,', 'A source application.'], ['A source story.']])
  assert.deepEqual(result.groups.map(g => g.scoring.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['1. 本题总分为15分。'], ['1. 本题总分为25分。']])
  assert.equal(result.groups[0].essays.entries[0].sourceLabel, '一、参考范文：')
})

test('a repeated writing label merged with its bare section keeps both samples', () => {
  const result = referencesFixture(['第四部分 写作', '写作\n第一节：',
    'One possible version:', 'A source application.', '第二节：', 'A source story.'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['A source application.'], ['A source story.']])
})

test('an inline reading explanation divider closes the writing references', () => {
  const result = referencesFixture(['第二节 读后续写', 'One possible version:',
    'A complete story ends here.', '【解题导语】本文是一篇应用文。',
    '21.C 推理判断题。根据表格可知……', 'English fragments from the reading explanation.',
    '参考范文', 'A reading exercise quoted in the explanation.'])
  assert.deepEqual(result.groups[0].essays.entries.flatMap(e => e.paragraphs.map(p => p.text)),
    ['A complete story ends here.'])
})

test('a writing-part omission supplies explicit absent references for both tasks', () => {
  const result = referencesFixture(['第四部分 写作（共两节，满分40分）', '略', '听力材料',
    'Text 1:', 'W: This is not a writing sample.'], ['application', 'continuation'])
  for (const group of result.groups) {
    assert.equal(group.essays.state, 'not_supplied')
    assert.deepEqual(group.essays.entries, [])
    assert.equal(group.scoring.state, 'not_supplied')
    assert(group.essays.evidence.length > 0)
  }
})

test('an omitted section does not become an essay or suppress the other sample', () => {
  const result = referencesFixture(['第四部分 写作', '第一节', '无范文', '第二节',
    'One possible version:', 'A source-backed story.'], ['application', 'continuation'])
  assert.equal(result.groups[0].essays.state, 'not_supplied')
  assert.deepEqual(result.groups[1].essays.entries.flatMap(e => e.paragraphs.map(p => p.text)),
    ['A source-backed story.'])
})

test('a bare section merged with a sample label preserves that source label', () => {
  const result = referencesFixture(['第四部分 写作', '第一节（满分15分）\n参考范文',
    'A source application.', '第二节（满分25分）', '参考范文', 'A source story.'],
  ['application', 'continuation'])
  assert.equal(result.groups[0].essays.entries[0].sourceLabel, '参考范文')
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['A source application.'], ['A source story.']])
})

test('Yantai section and parenthesized sample label on one line preserve both official essays', () => {
  const label = '(One possible version)'
  const result = referencesFixture(['第四部分 写作（共两节，满分40分）',
    `第一节（满分15分） ${label}`, 'Dear Tom,',
    'I can’t wait to share with you the event I participated in during the school fun sports meet',
    `第二节（满分25分） ${label}`,
    '“That sounds a good idea!” Drolma and Tashi responded.'], ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries[0].sourceLabel), [label, label])
  assert.deepEqual(result.groups.map(g => g.essays.entries[0].paragraphs.map(p => p.text)),
    [['Dear Tom,', 'I can’t wait to share with you the event I participated in during the school fun sports meet'],
      ['“That sounds a good idea!” Drolma and Tashi responded.']])
  assert.equal(result.groups[0].essays.entries[0].labelSource.locator.page, 1)
  const outsideWriting = referencesFixture(['第二部分 阅读',
    `第一节（阅读理解） ${label}`, 'A quoted reading example.',
    '第四部分 写作', '略'], ['application', 'continuation'])
  assert(outsideWriting.groups.every(g => g.essays.state === 'not_supplied'))
})

test('Nantong bare continuation heading keeps the two source samples separate', () => {
  const result = referencesFixture(['第四部分 写作', '第一节 应用文',
    'One possible version:', 'Our club plants herbs.', '读后续写',
    'One possible version:', 'Mia opened the gate.'], ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Our club plants herbs.'], ['Mia opened the gate.']])
})

test('Yantai score heading touches its parenthesized sample label without whitespace', () => {
  const result = referencesFixture(['第四部分 写作（共两节，满分40分）',
    '第一节（满分15分）(One possible version)', 'Dear Sam,', 'Our club plants herbs.',
    '第二节（满分25分）(One possible version)', 'Mia opened the gate.'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries[0].sourceLabel),
    ['(One possible version)', '(One possible version)'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Dear Sam,', 'Our club plants herbs.'], ['Mia opened the gate.']])
})

test('bare continuation heading still excludes reprinted prompts and scoring from essays', () => {
  const result = referencesFixture(['读后续写',
    '阅读下面短文，根据所给情节进行续写，使之构成一个完整的故事。',
    'A reprinted story.', '参考范文', 'Mia opened the gate.',
    '评分标准', '注意内容完整。'])
  assert.deepEqual(result.groups[0].essays.entries.flatMap(e => e.paragraphs.map(p => p.text)),
    ['Mia opened the gate.'])
  assert.equal(result.groups[0].scoring.entries.length, 1)
})

test('an adjacent sample label establishes writing context without a part heading', () => {
  const result = referencesFixture(['第一节', '21—23 ABC', '第二节', '36—40 ABCDE',
    '第一节', 'One possible version:', 'Dear Daniel,', 'A source application.',
    '第二节', 'One possible version:', 'A source story.'], ['application', 'continuation'])
  assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text),
    ['Dear Daniel,', 'A source application.'])
  assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text), ['A source story.'])
})

test('task scoring headings capture separately labelled official essays without teaching notes', () => {
  const labels = ['范文一（83词）：', '范文二(97词)：', '范文1：', '范文2']
  const texts = ['第四部分 写作（共两节，满分40分）', '应用文评分细则',
    '写作 第一节（满分15分）', '请介绍校园花园。', '一、参考范文',
    labels[0], 'Dear Robin,', 'We will open the garden on Monday.', 'Yours,', 'Alex',
    labels[1], 'Dear Robin,', 'Please bring a notebook on Tuesday.', 'Yours,', 'Alex',
    '二、内容要点', '1.【语篇解读】介绍活动安排。', '范文分析：注意表达清楚。',
    '读后续写评分细则：', '一、.参考范文', labels[2], 'Rae found a packet of seeds.',
    '范文分析', '这是一段中文讲解。', labels[3], 'A new leaf appeared by the window.',
    '二、评分原则（采取双评）', '1. 本题总分为25分。']
  const result = referencesFixture(texts, ['application', 'continuation'])
  const essays = result.groups.flatMap(group => group.essays.entries)
  assert.deepEqual(essays.map(entry => entry.sourceLabel), labels)
  assert.deepEqual(essays.map(entry => entry.paragraphs.map(paragraph => paragraph.text)),
    [['Dear Robin,', 'We will open the garden on Monday.', 'Yours,', 'Alex'],
      ['Dear Robin,', 'Please bring a notebook on Tuesday.', 'Yours,', 'Alex'],
      ['Rae found a packet of seeds.'], ['A new leaf appeared by the window.']])
  for (const [index, label] of labels.entries()) {
    const labelIndex = texts.indexOf(label)
    assert.equal(essays[index].authority, 'source_reference')
    assert.deepEqual(essays[index].labelSource, {
      documentSha256: 'abc',
      locator: { kind: 'page_region', documentId: 'answers', page: 1,
        region: { x: .1, y: Number((.15 + labelIndex * .025).toFixed(6)), width: .8, height: .02 } },
    })
    assert.equal(essays[index].paragraphs[0].source.locator.page, 1)
    assert.equal(essays[index].paragraphs[0].source.documentSha256, 'abc')
  }
})

test('writing-prefixed bare sections cannot open writing scope in reading or grammar', () => {
  const result = referencesFixture(['第二部分 阅读', '写作 第一节（满分15分）',
    '参考范文', 'A quoted reading example.', '第三部分 语言运用',
    '写作 第二节（满分25分）', '参考范文', 'A quoted grammar example.',
    '第四部分 写作', '略'], ['application', 'continuation'])
  assert(result.groups.every(group => group.essays.state === 'not_supplied'))
})

test('mentions of writing tasks in commentary cannot establish task scoring scope', () => {
  const result = referencesFixture(['本篇应用文评分细则需要另行讨论。', '参考范文',
    'A quoted teaching example.', '读后续写评分细则分析', '范文1',
    'Another quoted teaching example.', '第四部分 写作', '略'],
  ['application', 'continuation'])
  assert(result.groups.every(group => group.essays.state === 'not_supplied'))
})

test('repeated task scoring headings preserve previously captured source essays', () => {
  const result = referencesFixture(['应用文评分细则：', '范文一（83词）',
    'Our garden needs a new sign.', '应用文评分细则', '评分原则', '1. 注意内容完整。',
    '读后续写评分细则', '范文1', 'Rae painted the sign.',
    '读后续写评分细则：', '评分细则', '1. 注意情节连贯。'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(group => group.essays.entries.map(entry => entry.sourceLabel)),
    [['范文一（83词）'], ['范文1']])
  assert.deepEqual(result.groups.map(group => group.essays.entries.flatMap(entry => entry.paragraphs.map(p => p.text))),
    [['Our garden needs a new sign.'], ['Rae painted the sign.']])
  assert.deepEqual(result.groups.map(group => group.scoring.entries.flatMap(entry => entry.paragraphs.map(p => p.text))),
    [['1. 注意内容完整。'], ['1. 注意情节连贯。']])
})

test('writing scope ends once and cannot be reopened by later task or sample headings', () => {
  const result = referencesFixture(['答案详解', '第一节 应用文', '参考范文',
    'Our club will plant herbs.', '第二节 读后续写', '参考范文',
    'Ada brought a watering can.', '答案详解', '第四部分 写作',
    '第一节 应用文', '参考范文', 'Please join our garden walk.',
    '第二节 读后续写', '参考范文', 'They met beside the greenhouse.'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Our club will plant herbs.'], ['Ada brought a watering can.']])
  // The same divider before any section is a counterexample to whole-scope termination.
  assert.deepEqual(result.review, [
    { itemId: 'i7', issue: 'answer explanations end the writing-reference scope' },
  ])
})

test('student-script termination is task-local and cannot resume at a sample or scoring label', () => {
  const result = referencesFixture(['第一节 应用文', '参考范文', 'Our club will plant herbs.',
    '（五）样卷', '参考范文', 'Please join our garden walk.', '评分原则', '1. 注意内容完整。',
    '第二节 读后续写', '（四）作答示例', '参考范文', 'Ada brought a watering can.'],
  ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Our club will plant herbs.'], ['Ada brought a watering can.']])
  assert(result.groups.every(g => g.scoring.state === 'not_supplied'))
  assert.equal(result.review.filter(r => r.issue.includes('student-script')).length, 1)
})

test('part boundaries leave writing scope and bare sections cannot reopen it without a sample label', () => {
  const result = referencesFixture(['第四部分 写作', '第一节', 'Our club will plant herbs.',
    '听力材料', '第一节', '无范文', 'M: Learn by connecting',
    '第二节 读后续写', 'Ada brought a watering can.'], ['application', 'continuation'])
  assert.deepEqual(result.groups.map(g => g.essays.entries.flatMap(e => e.paragraphs.map(p => p.text))),
    [['Our club will plant herbs.'], ['Ada brought a watering can.']])
  assert.deepEqual(result.review, [])
})

test('commentary pause skips fragments and mixed teaching text but resumes at an uppercase English line', () => {
  const result = referencesFixture(['第二节 读后续写', '参考范文', 'A completed sample.',
    '首句衔接要点：第一段需与原文', 'leave the next day.',
    'Arthur arrived.”自然衔接，呼应关键意象。', 'Another real sample.'])
  assert.deepEqual(result.groups[0].essays.entries.map(e => ({
    label: e.sourceLabel, id: e.referenceId, text: e.paragraphs.map(p => p.text),
  })), [
    { label: '参考范文', id: 'source-ref-cont-1', text: ['A completed sample.'] },
    { label: null, id: 'source-ref-cont-2', text: ['Another real sample.'] },
  ])
  assert.equal(result.review.length, 1)
  assert.equal(result.review[0].itemId, 'i3')
})

test('commentary labels pause before any sample and repeated commentary does not duplicate review', () => {
  const result = referencesFixture(['第二节 读后续写', '【审题重点】', '1. 故事概述',
    'leave the next day.', '【谋篇布局】', '续写需呼应故事。',
    '参考范文', 'Mia knocked gently and waited.'])
  assert.deepEqual(result.groups[0].essays.entries.map(e => [e.sourceLabel, e.referenceId]),
    [['参考范文', 'source-ref-cont-1']])
  assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text),
    ['Mia knocked gently and waited.'])
  assert.deepEqual(result.review.map(r => r.itemId), ['i1', 'i4'])
})

test('scoring labels resume paused capture and Chinese scoring lines do not pause it', () => {
  const result = referencesFixture(['第二节 读后续写', '参考范文', 'A completed sample.',
    '范文分析', '评分原则', '1. 本题总分为25分。', '注意情节连贯。',
    '参考范文', 'Another real sample.', '范文分析', 'leave the next day.',
    '范文2', 'They returned the next morning.'])
  assert.deepEqual(result.groups[0].scoring.entries[0].paragraphs.map(p => p.text),
    ['1. 本题总分为25分。注意情节连贯。'])
  assert.deepEqual(result.groups[0].essays.entries.map(e => e.paragraphs.map(p => p.text)),
    [['A completed sample.'], ['Another real sample.'], ['They returned the next morning.']])
  assert.deepEqual(result.review.map(r => r.itemId), ['i3', 'i9'])
})

test('whole-part omission stays unselected and can later enter either bare task', () => {
  const result = referencesFixture(['第四部分 写作', '略', '未提供范文',
    '参考范文', 'Our club will plant herbs.', '第二节', '参考范文',
    'Ada brought a watering can.'], ['application', 'continuation'])
  assert.equal(result.groups[0].essays.state, 'not_supplied')
  assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text),
    ['Ada brought a watering can.'])
  assert.deepEqual(result.review.map(r => r.itemId), ['i1', 'i2'])
})

test('task omission preserves prior samples and permits later source lines and a second task', () => {
  const result = referencesFixture(['第四部分 写作', '第一节', '参考范文',
    'Our club will plant herbs.', '无范文', '参考范文', 'Please join our garden walk.',
    '第二节', '（略）'], ['application', 'continuation'])
  assert.deepEqual(result.groups[0].essays.entries.map(e => e.paragraphs.map(p => p.text)),
    [['Our club will plant herbs.'], ['Please join our garden walk.']])
  assert.equal(result.groups[1].essays.state, 'not_supplied')
  assert.deepEqual(result.review.map(r => r.itemId), ['i4', 'i8'])
})

test('ordinary task restarts replace prior sections while scoring headings reuse them', () => {
  const result = referencesFixture(['第一节 应用文', '参考范文', 'Our club will plant herbs.',
    '第一节 应用文', '参考范文', 'Please join our garden walk.',
    '应用文评分细则', '评分原则', '1. 注意内容完整。'], ['application'])
  assert.deepEqual(result.groups[0].essays.entries.map(e => [e.referenceId, e.paragraphs[0].text]),
    [['source-ref-app-1', 'Please join our garden walk.']])
  assert.equal(result.groups[0].scoring.entries[0].sourceLabel, '评分原则')
  assert.deepEqual(result.review, [])
})
