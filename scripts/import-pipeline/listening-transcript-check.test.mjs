import assert from 'node:assert/strict'
import test from 'node:test'
import { adjudicate } from './listening-transcript-check.mjs'

test('a standalone insertion at a speaker change needs listening review', async () => {
  const group = { key: '01', segmentId: 'listening-text-1', occurrence: { startSeconds: 10, endSeconds: 20 } }
  const text = 'W: Hello there.\nM: I agree with you.'
  const run = heard => {
    const words = heard.split(' ').map((text, index) => ({ text, start: index, end: index + 0.5 }))
    return adjudicate(group, text, { apple: { '01': words }, 'parakeet-v2': { '01': words } },
      () => assert.fail('local engines agree'), 'sha256:test')
  }
  const ambiguous = await run('Hello there. Yes. I agree with you.')
  assert.deepEqual(ambiguous.edits, [])
  assert.match(ambiguous.review[0].reason, /说话人/)

  const attached = await run('Hello there. Oh, I agree with you.')
  assert.deepEqual(attached.review, [])
  assert.equal(attached.edits[0].start, text.indexOf('I agree'))
  assert.equal(attached.edits[0].after, 'Oh, ')
})
