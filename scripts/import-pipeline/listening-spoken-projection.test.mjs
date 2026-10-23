import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { evaluateListeningEngine, listeningSourceTurns, normalizeListeningText,
  projectListeningSpokenText, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'

const source = { kind: 'page_region', documentId: 'answers', page: 2,
  region: { x: 0.1, y: 0.2, width: 0.8, height: 0.3 } }
const text = 'M: Could you bring the blue folder to the station before the morning train leaves?\nW: Yes I will meet you there at seven.'
const target = { segmentId: 'listening-text-1', questionNumbers: [1], source, text: text.replace('M: ', 'M: [1] ') }
const peers = [
  { segmentId: 'listening-text-6', questionNumbers: [6, 7], source,
    text: 'W: [6] Can you come? M: Great!\nM: [7]① Yes, I can.\nW: [7]② We will see you.' },
  { segmentId: 'listening-text-8', questionNumbers: [8], source, text: 'M: [8] Thanks for coming.' },
]
const corpus = [target, ...peers]
const fixture = JSON.parse(readFileSync(new URL('./fixtures/listening-apple-run-v2.json', import.meta.url)))
const pauses = [{ startSeconds: 0, endSeconds: 1.9 }, { startSeconds: 6.9, endSeconds: 10 }]
const evaluate = (group, overrides = {}) => evaluateListeningEngine({
  groups: [group], corpus: [group, ...peers], instructions: [{ slotId: 'listening.short-dialogue', text: '每段读一遍' }],
  windows: [structuredClone(fixture)], durationSeconds: 30, pauses, ...overrides,
})

test('question annotations require source layout proof; raw source and exact exclusions survive', () => {
  assert.ok(normalizeListeningText(projectListeningSpokenText(target).text).includes('one'),
    'a matching question number by itself is insufficient')
  const projected = projectListeningSpokenText(target, corpus)
  assert.equal(projected.sourceText, target.text)
  assert.equal(projected.text.length, target.text.length)
  assert.deepEqual(listeningSourceTurns(target, corpus).flat(), normalizeListeningText(text.replace(/(?:M|W):/gu, '')))
  const removed = projected.exclusions.find(e => e.reason === 'question_evidence_annotation')
  assert.equal(removed.text, '[1]')
  assert.equal(target.text.slice(removed.start, removed.end), '[1]')
  assert.deepEqual(removed.source, source)
  assert.equal(removed.segmentId, target.segmentId)
  assert.ok(removed.evidence.some(e => e.segmentId === 'listening-text-6'))
  const anotherDocument = { ...target, source: { ...source, documentId: 'other' } }
  assert.ok(projectListeningSpokenText(anotherDocument, [...peers, anotherDocument]).text.includes('[1]'))
})

test('real bracketed quantities, prices, dates, room numbers and unbound numbers remain spoken', () => {
  for (const phrase of ['There are [1] apples.', 'Read [2] carefully.', 'The price is £200.',
    'Meet on October 13th, then October 31st.', 'Go to Room303.', 'Go to Room 303.']) {
    const group = { ...target, text: `M: ${phrase}` }
    const projected = projectListeningSpokenText(group, [group, ...peers])
    assert.deepEqual(normalizeListeningText(projected.text), normalizeListeningText(phrase), phrase)
    assert.ok(!projected.exclusions.some(e => e.reason === 'question_evidence_annotation'))
  }
  const actual = { ...target, text: 'M: [2] Three apples.' }
  assert.ok(projectListeningSpokenText(actual, [actual, ...peers]).text.includes('[2]'))
})

test('only whole recognized instruction/title lines are excluded; a monologue prefix is never sliced away', () => {
  const group = { ...target, text: `第一节\n听下面5段录音。每段录音播放两遍。\n(Text 1)\n${target.text}` }
  const projection = projectListeningSpokenText(group, [group, ...peers])
  assert.ok(projection.exclusions.some(e => e.reason === 'group_heading'))
  assert.ok(projection.exclusions.some(e => e.reason === 'playback_instruction'))
  assert.deepEqual(listeningSourceTurns(group, [group, ...peers]), listeningSourceTurns(target, corpus))
  for (const prefix of ['Welcome everyone to our annual meeting.', 'Call £200 the starting price.',
    '听下面5段录音。Hello everyone.', '(Text 2)']) {
    const monologue = { ...target, text: `${prefix}\n${text}` }
    const projected = projectListeningSpokenText(monologue, [monologue, ...peers])
    assert.ok(projected.text.includes(prefix), prefix)
  }
  const afterSpeaker = { ...target, text: 'M: The sign says:\n(Text 1)\nGo through the next door.' }
  assert.ok(projectListeningSpokenText(afterSpeaker, corpus).text.includes('(Text 1)'))
})

test('anchors, critical alignment and both engines share the projection without altering source identity', () => {
  const primary = evaluate(target), secondary = evaluate(target, { engine: 'faster-whisper' })
  const result = reconcileListeningEngines(primary, secondary)[0]
  assert.equal(result.decision, 'usable', JSON.stringify(result.issues))
  assert.equal(result.sourceText, target.text)
  assert.equal(result.sourceProjection.sourceText, target.text)
  assert.ok(!result.issues.includes('CRITICAL_WORD_MISSING'))
  const changed = structuredClone(fixture)
  changed.result.segments[0].runs.at(-1).text = 'eight'
  assert.equal(reconcileListeningEngines(primary, evaluate(target,
    { windows: [changed], engine: 'faster-whisper' }))[0].decision, 'usable')
})

test('projection preserves readings and duplicate count while reconciliation notes isolated edge speech', () => {
  const single = evaluate(target, { windows: [fixture, structuredClone(fixture)] })
  assert.equal(single.groups[0].occurrences.length, 1)
  const twice = evaluate(target, { instructions: [{ slotId: 'listening.short-dialogue', text: '每段读两遍' }] })
  assert.equal(twice.groups[0].decision, 'review_required')
  assert.ok(twice.groups[0].issues.includes('READING_COUNT_MISMATCH'))
  const extra = structuredClone(fixture)
  extra.result.segments[0].runs.push({ text: 'not', start: 8, end: 8.2 })
  const result = reconcileListeningEngines(single, evaluate(target, { windows: [extra], engine: 'faster-whisper' }))[0]
  assert.equal(result.decision, 'usable')
  assert.ok(result.engineNotes.some(c => c.kind === 'isolated_edge_asr'))
})
