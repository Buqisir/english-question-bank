import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeLineFacts } from './ocr-line-facts.mjs'
import { LINE_ROLE_RULES, firstLineRole, matchesLineRole } from './ocr-line-roles.mjs'
import { referenceLineBoundary } from './ocr-proofread.mjs'

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
