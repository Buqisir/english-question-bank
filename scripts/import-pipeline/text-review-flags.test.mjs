import assert from 'node:assert/strict'
import test from 'node:test'
import { findSourceFlagTargets } from './text-review-parts.mjs'

const at = (text, flag) => findSourceFlagTargets([{ before: text }], flag).flatMap(hit => hit.at)
test('uncertain source phrase survives an OCR line wrap', () => {
  assert.deepEqual(at('children’s desire\nof learning can be inspired',
    { quote: 'desire of learning', decision: 'uncertain' }), [11])
})

test('source context still pins a repeated uncertain phrase', () => {
  const text = 'desire of learning. Children’s desire\nof learning can be inspired.'
  assert.deepEqual(at(text,
    { quote: 'desire of learning', decision: 'uncertain', context: 'Children’s desire of learning can be inspired.' }), [31])
})

test('corrections retain exact source offsets and whole-word boundaries', () => {
  assert.deepEqual(at('a desire\nof learning', { quote: 'desire of learning', category: 'grammar' }), [])
  assert.deepEqual(at('minds mind mindless', { quote: 'mind', category: 'grammar' }), [6])
})

test('uncertain whitespace matching cannot change words or interpret regex syntax', () => {
  assert.deepEqual(at('desire to learn', { quote: 'desire of learning', decision: 'uncertain' }), [])
  assert.deepEqual(at('A+ (B)\nC', { quote: 'A+ (B) C', decision: 'uncertain' }), [0])
  assert.deepEqual(at('AAAA B\nC', { quote: 'A+ (B) C', decision: 'uncertain' }), [])
})

test('existing exact bindings are preserved when another target wraps the phrase', () => {
  const exact = { jsonPointer: '/exact', before: 'desire of learning' }
  const wrapped = { jsonPointer: '/wrapped', before: 'desire\nof learning' }
  assert.deepEqual(findSourceFlagTargets([exact, wrapped],
    { quote: 'desire of learning', decision: 'uncertain' }), [{ target: exact, at: [0] }])
})
