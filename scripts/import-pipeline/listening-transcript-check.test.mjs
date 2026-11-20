import assert from 'node:assert/strict'
import test from 'node:test'
import { adjudicate } from './listening-transcript-check.mjs'

const group = { key: '01', segmentId: 'listening-text-1', occurrence: { startSeconds: 10, endSeconds: 60 } }
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

test('dense edits use complete Parakeet sentences and keep the source speaker', async () => {
  const lead = 'Tell me what you see as your main responsibility in this role and how you support the team each week.'
  const text = `W: ${lead}\nM: I’m committed; improving team performance is my duty, so I’ll work extra hours when needed.`
  const replacement = "Well, I see myself as a committed person. I consider it my duty to improve my team performance. So I'll work extra hours when needed."
  const heard = `${lead} ${replacement}`
  const { edits } = await run(text, heard)
  assert.equal(edits.length, 1)
  assert.match(edits[0].reason, /整句/)
  assert.equal(text.slice(0, edits[0].start) + edits[0].after + text.slice(edits[0].start + edits[0].before.length),
    `W: ${lead}\nM: ${replacement}`)
})

test('near-sounding proper names go to review while an unrelated name may change', async () => {
  const mountain = await run('She reached the Mt. Qomolangma Base Camp.', 'She reached the Mount Chomalangma Base Camp.')
  assert.deepEqual(mountain.edits, [])
  assert.match(mountain.review[0].reason, /专有名词/)
  const person = await run('W: Mike, any plans for the weekend?', 'Tom, any plans for the weekend?')
  assert.equal(person.edits[0].after, 'Tom')
})

test('question numbers and ranges are deleted with their brackets and spacing', async () => {
  const text = 'Good morning. (Q1–Q2) Could we settle the bill?'
  const { edits } = await run(text, 'Good morning. Could we settle the bill?')
  assert.deepEqual(edits.map(({ before, after }) => ({ before, after })), [{ before: '(Q1–Q2) ', after: '' }])
  const mixed = await run('The storm ended. (Q3) I’ll watch the film at home.',
    'The storm ended. I watched the film at home.')
  assert.deepEqual(mixed.edits.map(({ before, after }) => ({ before, after })), [
    { before: '(Q3) I’ll watch', after: 'I watched' },
  ])
})
