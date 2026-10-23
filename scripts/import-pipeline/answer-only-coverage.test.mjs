import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerOnlyCoveredNumbers } from './answer-only-coverage.mjs'

const wrapped = `56. are arranged         57.              58. as      59. have       60. whose
                         Originating                  gone
61.                      62. a            63.         64. and        65. while / though /
repetitive/repeated                       studios                    although`
const expected = Array.from({ length: 10 }, (_, i) => i + 56)
const missing = (text, numbers = expected) => {
  const covered = answerOnlyCoveredNumbers(text)
  return numbers.filter((n) => !covered.has(n))
}

test('covers answers wrapped onto the next layout line in the same column', () => {
  assert.deepEqual(missing(wrapped), [])
})

test('reports the actual empty cell instead of consuming its next question number', () => {
  assert.deepEqual(missing(wrapped.replace('Originating', '           ')), [57])
  assert.deepEqual(missing(wrapped.replace('repetitive/repeated', '                  ')), [61])
  assert.deepEqual(missing(wrapped.replace('studios', '       ')), [63])
  assert.deepEqual(missing('57.              58. as', [57, 58]), [57])
})

test('keeps normal numbered and choice-range answers', () => {
  assert.deepEqual(missing('56. arranged   57． Originating\n58、 as', [56, 57, 58]), [])
  assert.deepEqual(missing('41-45 ACDDB   46–50 AADCB   51—55 BCBCD',
    Array.from({ length: 15 }, (_, i) => i + 41)), [])
  assert.deepEqual(missing('41-45 ACD', [41, 42, 43, 44, 45]), [41, 42, 43, 44, 45])
})

test('allows three columns of drift but rejects adjacent cells and new question rows', () => {
  assert.deepEqual(missing('57.              58. as\n   Originating', [57, 58]), [])
  assert.deepEqual(missing('57.              58. as\n                  gone', [57, 58]), [57])
  assert.deepEqual(missing('57.\n58. as', [57, 58]), [57])
  assert.deepEqual(missing('57.\fOriginating', [57]), [57])
})
