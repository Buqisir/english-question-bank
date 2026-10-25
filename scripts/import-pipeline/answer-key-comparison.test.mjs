import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerKeyValuesMatch } from './lib-answer-key-comparison.mjs'

for (const [actual, expected] of [
  ['that / which', 'which / that'], // Nanning April 2026, question 59.
  [' THAT / which / that ', 'Which/That'],
  ['a b / c', 'C / ab'],
  ['although/while/though', 'while / though / although'],
]) test(`slash alternatives match as sets: ${actual}`, () => {
  assert.equal(answerKeyValuesMatch(actual, expected), true)
})

for (const [actual, expected] of [
  ['that', 'which'], ['that', 'which/that'], ['that/which', 'that/what'],
  ['that/which', 'that/which/what'], ['that/that', 'that'],
  ['some time', 'sometime'], ['that//which', 'that/which'], ['that/', 'that'],
]) test(`different or malformed answers remain mismatches: ${actual} vs ${expected}`, () => {
  assert.equal(answerKeyValuesMatch(actual, expected), false)
})

test('single-answer case, spaces and apostrophe normalization remain unchanged', () => {
  assert.equal(answerKeyValuesMatch('  SOME   Time ', 'some time'), true)
  assert.equal(answerKeyValuesMatch('it’s', "it's"), true)
  assert.equal(answerKeyValuesMatch('A', 'a'), true)
})
