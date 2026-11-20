import assert from 'node:assert/strict'
import test from 'node:test'
import { adjudicate } from './listening-transcript-check.mjs'

const group = { key: '01', segmentId: 'listening-text-1', occurrence: { startSeconds: 10, endSeconds: 30 } }
const run = (text, heard) => {
  const words = heard.split(' ').map((text, index) => ({ text, start: index, end: index + 0.5 }))
  return adjudicate(group, text, { apple: { '01': words }, 'parakeet-v2': { '01': words } },
    () => assert.fail('local engines agree'), 'sha256:test')
}

test('both standalone sentences and attached words at a speaker change need listening review', async () => {
  const text = 'W: Hello there.\nM: I agree with you.'
  for (const heard of ['Hello there. Yes. I agree with you.', 'Hello there. Well, I agree with you.']) {
    const result = await run(text, heard)
    assert.deepEqual(result.edits, [])
    assert.match(result.review[0].reason, /说话人/)
  }
})

test('changes that share an anchor are combined into a single replacement', async () => {
  const { edits, review } = await run(
    'Look, we have time for hamburger at this former restaurant. Let’s go.',
    'Look, we have time for a hamburger from a fast food restaurant. Let’s go.')
  assert.deepEqual(review, [])
  assert.deepEqual(edits.map(({ before, after }) => ({ before, after })), [
    { before: 'hamburger at this former', after: 'a hamburger from a fast food' },
  ])
})

test('repeated phrases expand local evidence to a unique anchor or go to listening review', async () => {
  const text = 'Today I can go home. Tomorrow I can go home.'
  const { edits, review } = await run(text, 'Today I can go home. Tomorrow I can not go home.')
  assert.deepEqual(review, [])
  assert.equal(edits.length, 1)
  assert.equal(edits[0].start, text.lastIndexOf('go'))
  assert.match(edits[0].evidence.apple, /^Tomorrow I can not go home$/u)
  const unresolved = await run(text, 'Today I can go home. Later I can not go home.')
  assert.ok(unresolved.edits.every(edit => edit.after.trim() !== 'not'))
  assert.ok(unresolved.review.some(item => Object.values(item.evidence ?? {}).some(heard => heard.includes('not'))))
})
