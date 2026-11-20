import assert from 'node:assert/strict'
import test from 'node:test'
import { adjudicate } from './listening-transcript-check.mjs'

const group = { key: '01', segmentId: 'listening-text-1', occurrence: { startSeconds: 10, endSeconds: 30 } }
const run = (text, heard) => {
  const words = heard.split(' ').map((text, index) => ({ text, start: index, end: index + 0.5 }))
  return adjudicate(group, text, { apple: { '01': words }, 'parakeet-v2': { '01': words } },
    () => assert.fail('local engines agree'), 'sha256:test')
}

test('a standalone insertion at a speaker change needs listening review', async () => {
  const text = 'W: Hello there.\nM: I agree with you.'
  const ambiguous = await run(text, 'Hello there. Yes. I agree with you.')
  assert.deepEqual(ambiguous.edits, [])
  assert.match(ambiguous.review[0].reason, /说话人/)

  const attached = await run(text, 'Hello there. Oh, I agree with you.')
  assert.deepEqual(attached.review, [])
  assert.equal(attached.edits[0].start, text.indexOf('I agree'))
  assert.equal(attached.edits[0].after, 'Oh, ')
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
