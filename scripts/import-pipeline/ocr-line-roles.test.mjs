import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { LINE_ROLE_RULES, firstLineRole, matchesLineRole, inlineSampleParts } from './ocr-line-roles.mjs'
import { referenceLineBoundary } from './ocr-proofread.mjs'

test('作答示例 is an essay label and splits from an exact section heading', () => {
  assert.equal(firstLineRole('entry-label', computeLineFacts({ text: '作答示例' }))?.id, 'entry.general')
  assert.equal(firstLineRole('entry-kind', computeLineFacts({ text: '作答示例' }))?.value, 'essays')
  for (const section of ['第一节', '第二节']) {
    for (const separator of [' ', '：', ': ', '']) {
      for (const label of ['作答示例', '作答示例：', '作答示例 ：']) {
        assert.deepEqual(inlineSampleParts(`${section}${separator}${label}`), [section, label])
        assert.equal(firstLineRole('entry-label', computeLineFacts({ text: label }))?.id, 'entry.general')
      }
    }
    assert.equal(inlineSampleParts(`${section} 阅读理解 作答示例`), undefined)
    assert.equal(inlineSampleParts(`${section}：作答示例说明如下。`), undefined)
    for (const separator of ['', '：', ': ']) {
      assert.equal(inlineSampleParts(`${section}${separator}(One possible version)`), undefined)
    }
  }
  assert.equal(firstLineRole('entry-label', computeLineFacts({ text: '作答示例说明如下。' })), null)
})

test('parenthesized writing headings use explicit task words rather than their ordinal', () => {
  for (const [text, task] of [
    ['（二）应用文写作', 'application'], ['（三）读后续写（满分25分）', 'continuation'],
    ['（三）应用文写作', 'application'], ['（二）读后续写（满分25分）', 'continuation'],
    ['（２）应用文写作', 'application'], ['（３）读后续写（满分２５分）', 'continuation'],
  ]) for (const variant of new Set([text, text.normalize('NFKC')])) {
    const facts = computeLineFacts({ text: variant })
    assert.equal(firstLineRole('writing-section', facts)?.value, task, variant)
    assert.equal(facts.text, variant)
  }
  for (const text of ['（二）语法适用', '（三）语法填空', '（二）', '说明：（二）应用文写作',
    '（二）应用文写作需要认真审题。', '（三）读后续写评分说明如下。']) {
    assert.equal(firstLineRole('writing-section', computeLineFacts({ text })), null, text)
  }
})

test('Arabic entry numbers are limited to exact known sample and scoring labels', () => {
  for (const [text, kind] of [
    ['2. 参考范文', 'essays'], ['4. 评分细则', 'scoring'], ['２． 作答示例', 'essays'],
    ['４． 评分原则：', 'scoring'],
  ]) for (const variant of new Set([text, text.normalize('NFKC')])) {
    const facts = computeLineFacts({ text: variant })
    assert(firstLineRole('entry-label', facts), variant)
    assert.equal(firstLineRole('entry-kind', facts)?.value, kind, variant)
  }
  for (const text of ['4. 评分时应考虑要点。', '2. 参考范文说明如下', '4. 【任意标签】',
    '4. 语法适用', '正文 2. 参考范文', '100. 评分细则']) {
    assert.equal(firstLineRole('entry-label', computeLineFacts({ text })), null, text)
  }
})

for (const rule of LINE_ROLE_RULES) {
  for (const [label, samples, expected] of [
    ['positive', rule.examples, true], ['counterexample', rule.counterExamples, false],
  ]) test(`${rule.id} ${label}`, () => {
    assert(samples.length > 0)
    for (const { context = {}, ...line } of samples) {
      assert.equal(Boolean(matchesLineRole(rule.id, computeLineFacts(line), context)), expected, line.text)
    }
  })
}

test('candidate priorities are unique within each phase, preserve precedence and reject unknown rules', () => {
  assert.equal(new Set(LINE_ROLE_RULES.map(rule => rule.id)).size, LINE_ROLE_RULES.length)
  assert.equal(new Set(LINE_ROLE_RULES.map(rule => `${rule.phase}:${rule.priority}`)).size, LINE_ROLE_RULES.length)
  const facts = computeLineFacts({ text: '【评分参考答案】' })
  assert.equal(firstLineRole('entry-kind', facts).id, 'entry.scoring-kind')
  assert.equal(firstLineRole('entry-label', computeLineFacts({ text: '【示例一】' })).id, 'entry.general')
  assert.throws(() => matchesLineRole('missing', facts), /Unknown line-role rule/u)
  assert.throws(() => firstLineRole('missing', facts), /Unknown line-role phase/u)
})

test('line facts preserve source text/order and distinguish normalized regions from pixel boxes', () => {
  const input = { text: '  Dear Sam,  ', page: 2, words: [
    { number: 2, text: 'Sam,', box: { left: 70, top: 50, width: 30, height: 12 } },
    { number: 1, text: 'Dear', box: { left: 10, top: 48, width: 40, height: 10 } },
  ], boxes: [
    { region: { x: .4, y: .3, width: .2, height: .02 } },
    { region: { x: .1, y: .2, width: .15, height: .03 } },
  ] }
  const before = structuredClone(input)
  const facts = computeLineFacts(input)
  assert.deepEqual(input, before)
  assert.equal(facts.text, '  Dear Sam,  ')
  assert.equal(facts.trimmed, 'Dear Sam,')
  assert.deepEqual(facts.box, { left: 10, right: 100, top: 48, bottom: 62, height: 12 })
  assert.deepEqual(facts.region, { x: .1, y: .2, width: .5, height: .12 })
  assert.equal(facts.left, .1)
  assert.equal(facts.firstObservationWidth, .15)
  assert.equal(facts.firstWordWidth, 40)
  assert(Object.isFrozen(facts))
  assert.deepEqual(facts.sortedWords.map(word => word.number), [1, 2])
  assert.doesNotThrow(() => computeLineFacts({ text: 'Dear Sam,', words: 'w1-w3' }))
})

test('a lowercase line cannot continue a short previous line', () => {
  const result = referenceLineBoundary({ role: 'body', right: .5, page: 1 },
    { text: 'and these continue that turn', left: .1, page: 1,
      boxes: [{ region: { x: .1, y: .3, width: .1, height: .02 } }] },
    { left: .1, right: .9 })
  assert.equal(result.previousShort, true)
  assert.equal(result.continues, false)
})

test('cross-page short-line comparison uses the previous margin independently of the current margin', () => {
  const previous = { role: 'body', right: .8, page: 1 }
  const line = { text: 'Unexpectedly everything changed.', left: .1, page: 2,
    boxes: [{ region: { x: .1, y: .3, width: .01, height: .02 } }] }
  const previousMargin = { left: .1, right: .82 }
  assert.equal(referenceLineBoundary(previous, line, { left: .1, right: .9 }, previousMargin).previousShort, false)
  assert.equal(referenceLineBoundary(previous, line, { left: .1, right: .82 }, previousMargin).previousShort, false)
  assert.equal(referenceLineBoundary(previous, line, { left: .1, right: .82 }, { left: .1, right: .9 }).previousShort, true)
})
