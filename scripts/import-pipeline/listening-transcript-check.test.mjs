import assert from 'node:assert/strict'
import test from 'node:test'
import { adjudicate } from './listening-transcript-check.mjs'
import { preserveSourceForms, timedReading } from './listening-transcript-check-alignment.mjs'
import { listeningTurnWordVotes, rewriteTurns } from './listening-transcript-check-turns.mjs'
import { applySpellingReview, listeningEditSpeakerLabels, prepareSpellingReview } from '../../server/paper-import/spellingReview.mjs'

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

const sha256 = `sha256:${'a'.repeat(64)}`
function decideTurns(text, parakeet, apple = parakeet, remote) {
  const engines = Object.fromEntries(Object.entries({ apple, 'parakeet-v2': parakeet }).map(([engine, heard]) =>
    [engine, { '01': heard.split(' ').map((text, index) => ({ text, start: index * 0.4, end: index * 0.4 + 0.3 })) }]))
  const readings = Object.entries(engines).map(([engine, results]) => ({ engine, ...timedReading(results['01'], []) }))
  return rewriteTurns(group, text, readings, engines, sha256, remote)
}

test('whole-turn replacements apply together or leave the entire passage for listening review', async () => {
  const text = 'W: I carried the brown boxes to the front door today.\nM: My sister put the red bag next to my chair.'
  const parakeet = 'I carried the green boxes to the front door today. My sister put the blue bag next to my chair.'
  const accepted = await decideTurns(text, parakeet)
  assert.deepEqual(accepted.review, [])
  assert.deepEqual(accepted.edits.map(edit => edit.before), [
    'I carried the brown boxes to the front door today.', 'My sister put the red bag next to my chair.',
  ])
  const raw = Buffer.from(JSON.stringify({ listening: { state: 'captured', transcript: [{ segmentId: group.segmentId, text }] } }))
  const report = { ...prepareSpellingReview(raw), reviewedBy: 'import_agent', reviewedAt: '2026-11-20T00:00:00Z',
    listeningEdits: accepted.edits }
  for (const target of report.targets) target.decision = 'unchanged'
  const applied = applySpellingReview(raw, Buffer.from(JSON.stringify(report)), { sha256, durationSeconds: 60 })
  assert.equal(applied.listening.transcript[0].text, 'W: I carried the green boxes to the front door today.\nM: My sister put the blue bag next to my chair.')
  const rejected = await decideTurns(text, parakeet, parakeet.replace('blue bag', 'black bag'))
  assert.deepEqual(rejected.edits, [])
  assert.equal(rejected.review.length, 1)
  assert.match(rejected.review[0].reason, /整段听核/)
  const resolved = await decideTurns(text, parakeet, parakeet.replace('blue bag', 'black bag'), interval => {
    assert.ok(interval.startSeconds > group.occurrence.startSeconds)
    assert.ok(interval.endSeconds < group.occurrence.endSeconds)
    return { text: 'My sister put the blue bag next to my chair.' }
  })
  assert.equal(resolved.edits[1].evidence['gpt-transcribe'], resolved.edits[1].after)
})

test('whole turns route embedded speaker labels to listening review', async () => {
  const text = 'I carried the brown boxes to the front door today.'
  for (const label of ['Mary:', 'M/W:', '(Mary):']) {
    const speech = `${text} I can help.`
    const withLabel = `${text} ${label} I can help.`
    if (label !== '(Mary):') {
      const original = await decideTurns(`M: ${withLabel}`, speech)
      assert.deepEqual(original.edits, [])
      assert.match(original.review[0].reason, /正文疑似含说话人标签/)
    }
    const replacement = await decideTurns(`M: ${speech}`, withLabel)
    assert.deepEqual(replacement.edits, [])
    assert.match(replacement.review[0].reason, /同一说话人的单行正文/)
  }
})

test('whole turns drop announcements and route unassigned words to listening review', async () => {
  const text = 'W: I carried the brown boxes to the front door today.\nM: My sister put the red bag next to my chair.'
  const first = 'I carried the green boxes to the front door today.'
  const second = 'My sister put the blue bag next to my chair.'
  const accepted = await decideTurns(text, `听下面一段对话。 Text one. ${first} Question 12. ${second}`)
  assert.deepEqual(accepted.review, [])
  assert.deepEqual(accepted.edits.map(edit => edit.after), [first, second])
  assert.ok(accepted.edits.every(edit => Object.values(edit.evidence).every(heard => !/text one|question 12|对话/iu.test(heard))))
  for (const heard of [`Stand by. ${first} ${second}`, `${first} Stand by. ${second}`]) {
    const unresolved = await decideTurns(text, heard)
    assert.deepEqual(unresolved.edits, [])
    assert.equal(unresolved.review.length, 1)
    assert.match(unresolved.review[0].reason, /无法完整归到说话轮次/u)
  }
  const ambiguous = await decideTurns(text, `${first} Question 12 ${second}`)
  assert.deepEqual(ambiguous.edits, [])
  assert.match(ambiguous.review[0].reason, /疑似报幕/u)
})

test('whole turns retain near names and equivalent written forms without rewriting the evidence', async () => {
  const before = 'We told Dr. Allan to bring his favourite book and 12 pencils to the new school down the road before lunch.'
  const heard = 'We told Doctor Alan to bring his favorite book and twelve pencils to the new school down the road before lunch.'
  assert.equal(preserveSourceForms(before, heard, listeningEditSpeakerLabels), before)
  const unchanged = await decideTurns(`W: ${before}`, heard)
  assert.deepEqual(unchanged.edits, [])
  assert.deepEqual(unchanged.review, [])
  const revised = heard.replace('book', 'folder')
  assert.equal(preserveSourceForms(before, revised, listeningEditSpeakerLabels), before.replace('book', 'folder'))
  const accepted = await decideTurns(`W: ${before}`, revised)
  assert.equal(accepted.edits[0].after, before.replace('book', 'folder'))
  assert.equal(accepted.edits[0].evidence['parakeet-v2'], revised)
})

test('turn words can use different pairs in order and share limited spelling equivalences', () => {
  const after = "I'm sure Allan said they're taking their second storybooks home, and won't need any more."
  const voted = listeningTurnWordVotes('Allan already had his 2nd book.', after, {
    apple: "I am Allan said they are taking their 2nd story books home, and won't need anymore.",
    'parakeet-v2': "I'm sure Alan said they're taking their second storybooks home, and won't need any more.",
    'gpt-transcribe': "I'm sure Allan said they are taking their second storybooks home, and won't need.",
  })
  assert.ok(voted.every(word => word.engines.length >= 2))
  assert.deepEqual(voted.find(word => word.token === 'sure').engines, ['parakeet-v2', 'gpt-transcribe'])
  assert.deepEqual(voted.find(word => word.token === 'anymore').engines, ['apple', 'parakeet-v2'])
  const reordered = listeningTurnWordVotes('', 'First take the books home today.', {
    apple: 'First take the books home today.',
    'parakeet-v2': 'First take the books today home.',
  })
  assert.ok(reordered.some(word => word.engines.length < 2))
})
