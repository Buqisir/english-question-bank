import assert from 'node:assert/strict'
import { test } from 'node:test'
import { joinTranscriptTurns, isAnswerFurniture, referenceLineBoundary } from './ocr-proofread.mjs'

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
