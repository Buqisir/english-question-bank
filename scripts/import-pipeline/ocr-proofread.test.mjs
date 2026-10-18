import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinTranscriptTurns, isAnswerFurniture, referenceLineBoundary, writingSectionAfterPart, buildSourceReferences } from './ocr-proofread.mjs'

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

function referencesFixture(texts, taskTypes = ['continuation']) {
  const observations = texts.map((text, i) => ({
    observationId: `o${i}`, region: { x: .1, y: .15 + i * .025, width: .8, height: .02 },
  }))
  return buildSourceReferences({
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: 'abc' }],
    groups: taskTypes.map(taskType => ({ groupId: taskType, writingTask: { taskType } })),
  }, { documents: [{ documentId: 'answers', pages: [{ observations }] }] },
  { documents: [{ documentId: 'answers', pages: [{ page: 1,
    orderedItems: texts.map((text, i) => ({ itemId: `i${i}`, text, observationIds: [`o${i}`] })),
  }] }] })
}

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

test('an adjacent sample label establishes writing context without a part heading', () => {
  const result = referencesFixture(['第一节', '21—23 ABC', '第二节', '36—40 ABCDE',
    '第一节', 'One possible version:', 'Dear Daniel,', 'A source application.',
    '第二节', 'One possible version:', 'A source story.'], ['application', 'continuation'])
  assert.deepEqual(result.groups[0].essays.entries[0].paragraphs.map(p => p.text),
    ['Dear Daniel,', 'A source application.'])
  assert.deepEqual(result.groups[1].essays.entries[0].paragraphs.map(p => p.text), ['A source story.'])
})
