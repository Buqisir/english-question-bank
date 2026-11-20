import assert from 'node:assert/strict'
import test from 'node:test'
import { adjudicate } from './listening-transcript-check.mjs'
import { timedReading } from './listening-transcript-check-alignment.mjs'
import { rewriteTurns } from './listening-transcript-check-turns.mjs'
import { applySpellingReview, prepareSpellingReview } from '../../server/paper-import/spellingReview.mjs'

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

test('whole-turn replacements apply together or leave the entire passage for listening review', () => {
  const text = 'W: I carried the brown boxes to the front door today.\nM: My sister put the red bag next to my chair.'
  const parakeet = 'I carried the green boxes to the front door today. My sister put the blue bag next to my chair.'
  const sha256 = `sha256:${'a'.repeat(64)}`
  const decide = apple => {
    const engines = Object.fromEntries(Object.entries({ apple, 'parakeet-v2': parakeet }).map(([engine, heard]) =>
      [engine, { '01': heard.split(' ').map((text, index) => ({ text, start: index * 0.4, end: index * 0.4 + 0.3 })) }]))
    const readings = Object.entries(engines).map(([engine, results]) => ({ engine, ...timedReading(results['01'], []) }))
    return rewriteTurns(group, text, readings, engines, sha256)
  }
  const accepted = decide(parakeet)
  assert.deepEqual(accepted.review, [])
  assert.deepEqual(accepted.edits.map(edit => edit.before), [
    'I carried the brown boxes to the front door today', 'My sister put the red bag next to my chair.',
  ])
  const raw = Buffer.from(JSON.stringify({ listening: { state: 'captured', transcript: [{ segmentId: group.segmentId, text }] } }))
  const report = { ...prepareSpellingReview(raw), reviewedBy: 'import_agent', reviewedAt: '2026-11-20T00:00:00Z',
    listeningEdits: accepted.edits }
  for (const target of report.targets) target.decision = 'unchanged'
  const applied = applySpellingReview(raw, Buffer.from(JSON.stringify(report)), { sha256, durationSeconds: 60 })
  assert.equal(applied.listening.transcript[0].text, 'W: I carried the green boxes to the front door today.\nM: My sister put the blue bag next to my chair.')
  const rejected = decide(parakeet.replace('blue bag', 'black bag'))
  assert.deepEqual(rejected.edits, [])
  assert.equal(rejected.review.length, 1)
  assert.match(rejected.review[0].reason, /整段听核/)
})
