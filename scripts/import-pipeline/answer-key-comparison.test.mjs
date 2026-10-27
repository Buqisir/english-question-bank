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

test('explicit Chinese English alternatives compare symmetrically as complete sets', () => {
  for (const [left, right] of [
    ['most stable或者stablest', 'most stable / stablest'],
    ['stablest 或者 most stable', 'most stable / stablest'],
    ['most stable或者stablest', 'stablest 或者 most stable'],
    ["well-known或者it's fine", "it’s fine / well-known"],
    ['one或者two/three', 'three / two / one'],
  ]) {
    assert.equal(answerKeyValuesMatch(left, right), true, `${left} vs ${right}`)
    assert.equal(answerKeyValuesMatch(right, left), true, `${right} vs ${left}`)
  }
})

test('Chinese alternatives require complete matching sets and valid English branches', () => {
  for (const [left, right] of [
    ['most stable或者stablest', 'most stable / stable'],
    ['most stable或者stablest', 'most stable / stablest / stable'],
    ['that或者that', 'that'],
    ['some time', 'sometime'],
    ['或者that', 'that / other'],
    ['that或者', 'that / other'],
    ['that或者或者other', 'that / other'],
    ['that或者/other', 'that / other'],
    ['that或者other', 'that//other'],
    ['that//other', 'that//other'],
    ['答案或者其他', '答案/其他'],
    ['that或者答案', 'that / 答案'],
    ['that or other', 'that / other'],
    ['that或other', 'that / other'],
    ['that和other', 'that / other'],
    ['that及other', 'that / other'],
  ]) {
    assert.equal(answerKeyValuesMatch(left, right), false, `${left} vs ${right}`)
    assert.equal(answerKeyValuesMatch(right, left), false, `${right} vs ${left}`)
  }
  assert.equal(answerKeyValuesMatch('答案或者其他', '答案或者其他'), true)
  assert.equal(answerKeyValuesMatch('that或者', 'that或者'), true)
})
