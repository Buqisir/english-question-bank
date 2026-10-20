import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  LISTENING_SEGMENT_RULE, alignListeningOccurrence, evaluateListeningEngine, expectedListeningReadings,
  listeningAsrTokens, normalizeListeningText, parseListeningAnnouncements, reconcileListeningEngines, validateListeningOrder,
} from './lib-listening-segment-rule.mjs'
import { importSubmissionIssues } from './lib-import-submit-gate.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/listening-apple-run-v2.json', import.meta.url), 'utf8'))
const source = 'M: Could you bring the blue folder to the station before the morning train leaves?\nW: Yes I will meet you there at seven.'
const group = { segmentId: 'listening-text-1', questionNumbers: [1], text: source }
const one = [{ slotId: 'listening.short-dialogue', text: '每段录音读一遍。' }]
const two = [{ slotId: 'listening.short-dialogue', text: '每段录音读两遍。' }]
const pauses = [{ startSeconds: 0, endSeconds: 1.9 }, { startSeconds: 6.9, endSeconds: 10 }]
function evaluate(overrides = {}) {
  return evaluateListeningEngine({ groups: [group], instructions: one, windows: [structuredClone(fixture)],
    durationSeconds: 30, pauses, ...overrides }).groups[0]
}
function windowFor(text, at = 2) {
  const tokens = normalizeListeningText(text)
  return { startSeconds: 0, endSeconds: 100,
    result: { segments: [{ start: at, end: at + tokens.length * 0.2, text,
      words: tokens.map((word, i) => ({ word, start: at + i * 0.2, end: at + (i + 1) * 0.2 })) }] } }
}
function surrounding(windows) {
  return windows.flatMap(w => w.result.segments.map(s => [
    { startSeconds: s.start - 1, endSeconds: s.start - 0.05 },
    { startSeconds: s.end + 0.05, endSeconds: s.end + 1 },
  ])).flat().sort((a, b) => a.startSeconds - b.startSeconds)
}

test('frozen Apple run fixture: one reading is usable from original instructions', () => {
  const result = evaluate()
  assert.equal(result.decision, 'usable', JSON.stringify(result.issues))
  assert.equal(result.expectedReadings, 1)
  assert.equal(result.occurrences.length, 1)
  assert.ok(result.playback.startSeconds < 2)
  assert.ok(result.playback.endSeconds > 6.8)
})
test('reading count is never inferred from one occurrence', () => {
  assert.equal(evaluate({ instructions: two }).decision, 'review_required')
  assert.equal(evaluate({ instructions: [] }).expectedReadings, 'unknown')
})
test('group instructions override section, conflicting same-level instructions block', () => {
  assert.equal(expectedListeningReadings({ ...group, instruction: '本段读一遍' }, two).expectedReadings, 1)
  assert.equal(expectedListeningReadings(group, [...one, ...two]).issue, 'READING_INSTRUCTION_CONFLICT')
})
test('mixed one/two-reading paper respects each group instruction', () => {
  const other = { segmentId: 'listening-text-2', questionNumbers: [2],
    instruction: '本段录音读两遍', text: 'Fresh apples grow around this quiet village and our neighbors deliver baskets every summer.' }
  const a = structuredClone(fixture), b = windowFor(other.text, 15), c = windowFor(other.text, 25)
  const windows = [{ ...fixture, result: { segments: [...a.result.segments, ...b.result.segments, ...c.result.segments] }, endSeconds: 100 }]
  const result = evaluateListeningEngine({ groups: [group, other], instructions: one, windows,
    durationSeconds: 100, pauses: [...pauses, ...surrounding([b, c])] })
  assert.deepEqual(result.groups.map(g => [g.expectedReadings, g.decision]), [[1, 'usable'], [2, 'usable']])
})
test('duplicate and overlapping windows do not count as extra readings', () => {
  assert.equal(evaluate({ windows: [fixture, fixture] }).occurrences.length, 1)
  const shifted = structuredClone(fixture)
  shifted.startSeconds = 4
  shifted.endSeconds = 40
  shifted.result.segments[0].runs = shifted.result.segments[0].runs.filter(w => w.start >= 4)
    .map(w => ({ ...w, start: w.start - 4, end: w.end - 4 }))
  const first = { ...fixture, endSeconds: 7 }
  const result = evaluate({ windows: [first, shifted] })
  assert.equal(result.occurrences.length, 1)
})
test('common head/tail in wrong groups expand to 12; exact ambiguous materials cannot pass', () => {
  const ambiguous = { ...group, segmentId: 'listening-text-2', questionNumbers: [2] }
  const result = evaluate({ groups: [group, ambiguous] })
  assert.ok(result.issues.includes('ANCHOR_AMBIGUOUS'))
  const changed = { ...ambiguous, text: source.replace('to the station before the morning', 'over the bridge after the evening') }
  const expanded = evaluate({ groups: [group, changed] })
  assert.equal(expanded.anchors.width, 12)
})
test('missing a final short answer blocks even when most body words match', () => {
  const raw = structuredClone(fixture)
  raw.result.segments[0].runs.splice(-1)
  assert.equal(evaluate({ windows: [raw] }).decision, 'review_required')
})
test('missing a complete middle turn blocks despite high total score', () => {
  const text = `${source.split('\n')[0]}\nW: Perhaps.\nM: ${source.split('\n')[1].slice(3)}`
  const result = evaluate({ groups: [{ ...group, text }] })
  assert.ok(result.issues.includes('WHOLE_TURN_MISSING'))
})
test('short materials require 0.95 both recall and edit similarity', () => {
  const raw = structuredClone(fixture)
  raw.result.segments[0].runs[8].text = 'market'
  assert.equal(evaluate({ windows: [raw] }).decision, 'usable')
  raw.result.segments[0].runs[9].text = 'after'
  assert.ok(evaluate({ windows: [raw] }).issues.includes('BODY_ALIGNMENT_LOW'))
  assert.equal(LISTENING_SEGMENT_RULE.shortMatchMinimum, 0.95)
})
test('insertions have an independent edit penalty', () => {
  const src = normalizeListeningText(source)
  const actual = [...src.slice(0, 10), 'unrelated', 'extra', 'narration', ...src.slice(10)]
  const result = alignListeningOccurrence(src, actual.map(token => ({ token })))
  assert.equal(result.sourceMatchRate, 1)
  assert.ok(result.editSimilarity < 0.95)
})
test('missing a critical number or negation blocks regardless of score', () => {
  const text = source.replace('to the station', 'not to the station')
  assert.ok(evaluate({ groups: [{ ...group, text }] }).issues.includes('CRITICAL_WORD_MISSING'))
})
test('cross-reading head/tail splicing across a pause cannot pass', () => {
  const raw = structuredClone(fixture)
  for (const word of raw.result.segments[0].runs.slice(10)) { word.start += 10; word.end += 10 }
  const result = evaluate({ windows: [raw], pauses: [...pauses,
    { startSeconds: 4, endSeconds: 13.9 }, { startSeconds: 16.9, endSeconds: 20 }] })
  assert.ok(result.issues.includes('OCCURRENCE_DISCONTINUOUS'))
})
test('Chinese announcements must agree with group number and question range', () => {
  const raw = structuredClone(fixture)
  raw.result.segments.unshift({ text: '第2段，第6至8题', start: 0, end: 1.5, runs: [] })
  assert.ok(evaluate({ windows: [raw] }).issues.includes('ANNOUNCEMENT_CONFLICT'))
  assert.deepEqual(parseListeningAnnouncements('Text Six. 第十段。第6至8题').map(m => m.kind),
    ['group', 'group', 'questions'])
})
test('missing announcements alone does not fail unique complete evidence', () => {
  assert.equal(evaluate().decision, 'usable')
})
test('no local silence evidence means no approved playback', () => {
  assert.ok(evaluate({ pauses: [] }).issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
})
test('multiword attributed runs are interpolated and never copy whole-run time to each token', () => {
  const raw = { startSeconds: 0, endSeconds: 10,
    result: { segments: [{ text: 'one two three', runs: [{ text: 'one two three', start: 1, end: 4 }] }] } }
  const words = listeningAsrTokens([raw]).words
  assert.equal(words[1].timing, 'interpolated_within_run')
  assert.equal(words[1].startSeconds, 2)
  assert.equal(words[1].startBoundary, false)
  assert.equal(words[1].endBoundary, false)
})
test('edge word span >2s is uncertainty, never truncation permission', () => {
  const raw = structuredClone(fixture)
  raw.result.segments[0].runs[0].start = 0
  raw.result.segments[0].runs[0].end = 2.21
  assert.ok(evaluate({ windows: [raw] }).issues.includes('EDGE_WORD_SPAN_LONG'))
})
test('Apple failure plus complete unique Whisper evidence may pass, retaining both', () => {
  const apple = { groups: [evaluate({ windows: [{ error: 'unavailable' }] })] }
  const whisper = { groups: [evaluate({ engine: 'faster-whisper' })] }
  const result = reconcileListeningEngines(apple, whisper)[0]
  assert.equal(result.decision, 'usable')
  assert.equal(result.selectedEngine, 'faster-whisper')
  assert.equal(result.engineAttempts.length, 2)
})
test('Apple omissions plus complete Whisper evidence may pass', () => {
  const raw = structuredClone(fixture)
  raw.result.segments[0].runs.splice(9, 2)
  const result = reconcileListeningEngines({ groups: [evaluate({ windows: [raw] })] },
    { groups: [evaluate({ engine: 'faster-whisper' })] })[0]
  assert.equal(result.decision, 'usable')
})
test('two-engine identity or boundary conflict blocks', () => {
  const apple = evaluate()
  const whisper = evaluate({ engine: 'faster-whisper' })
  whisper.occurrences[0].playback.startSeconds += 1
  assert.ok(reconcileListeningEngines({ groups: [apple] }, { groups: [whisper] })[0].issues.includes('ENGINE_CONFLICT'))
  whisper.occurrences[0].playback.startSeconds -= 1
  whisper.issues.push('ANNOUNCEMENT_CONFLICT')
  assert.equal(reconcileListeningEngines({ groups: [apple] }, { groups: [whisper] })[0].decision, 'review_required')
})
test('two readings with duration ratio outside 0.85..1.15 block', () => {
  const second = structuredClone(fixture.result.segments[0])
  second.start = 15
  second.end = 24
  for (const word of second.runs) { word.start = 15 + (word.start - 2) * 1.6; word.end = 15 + (word.end - 2) * 1.6 }
  const raw = { ...fixture, result: { segments: [...fixture.result.segments, second] } }
  const result = evaluate({ instructions: two, windows: [raw],
    pauses: [...pauses, { startSeconds: 13, endSeconds: 14.9 }, { startSeconds: 22.8, endSeconds: 25 }] })
  assert.ok(result.issues.includes('READING_DURATION_CONFLICT'))
})
test('finite normalization never equates proper names', () => {
  assert.deepEqual(normalizeListeningText('OK Hey hm theatres travelled $25'), normalizeListeningText('okay Hi hmm theaters traveled twenty five dollars'))
  assert.notDeepEqual(normalizeListeningText('Meryle'), normalizeListeningText('Meryl'))
})
test('submit gate rejects unresolved or missing listening groups with explicit code', () => {
  const materialization = { listening: { state: 'captured', transcript: [group] } }
  assert.equal(importSubmissionIssues({ materialization })[0].code, 'IMPORT_SUBMIT_LISTENING_NOT_USABLE')
  assert.deepEqual(importSubmissionIssues({ materialization, listeningReview: { groups: [{ ...group, decision: 'usable' }] } }), [])
})
test('submit gate reports Chinese half-width numbering fields; English numbering and full-width pass', () => {
  const materialization = { groups: [{ stem: '你将参加英语演讲。(1) 介绍经历；(2) 提出建议。' }] }
  const issues = importSubmissionIssues({ materialization })
  assert.equal(issues[0].code, 'IMPORT_SUBMIT_CHINESE_HALF_WIDTH_NUMBERING')
  assert.equal(issues[0].field, '$.groups[0].stem')
  assert.deepEqual(issues[0].matches, ['(1)', '(2)'])
  assert.deepEqual(importSubmissionIssues({ materialization: { groups: [{ stem: 'Include (1) a title.', text: '包含（1）标题。' }] } }), [])
})
test('Chinese inline runs retain context around a separate numeric run', () => {
  const issues = importSubmissionIssues({ materialization: { groups: [{ stem: { runs: [
    { text: '内容包括：' }, { text: '(1)' }, { text: '你的建议' },
  ] } }] } })
  assert.equal(issues[0].field, '$.groups[0].stem.runs[1].text')
})
test('split inline parentheses cannot bypass the Chinese numbering submit gate', () => {
  const issues = importSubmissionIssues({ materialization: { groups: [{ stem: { runs: [
    { text: '内容包括：(' }, { text: '1' }, { text: ')你的建议' },
  ] } }] } })
  assert.equal(issues[0].field, '$.groups[0].stem.runs[0].text')
  assert.deepEqual(issues[0].matches, ['(1)'])
})
test('reading instruction variants are parsed without guessing from audio', () => {
  assert.equal(expectedListeningReadings({ ...group, instruction: '每段录音播两遍。' }).expectedReadings, 2)
  assert.equal(expectedListeningReadings({ ...group, instruction: 'You will hear each conversation twice.' }).expectedReadings, 2)
})
test('all explicit cues agree: a later correct range cannot hide a wrong group cue', () => {
  const raw = structuredClone(fixture)
  raw.result.segments.unshift({ text: '第2段', start: 0, end: 0.5, runs: [] },
    { text: '第1至1题', start: 0.7, end: 1.5, runs: [] })
  assert.ok(evaluate({ windows: [raw] }).issues.includes('ANNOUNCEMENT_CONFLICT'))
})
test('a cue spanning multiple runs remains visible before the body in a long ASR segment', () => {
  const raw = structuredClone(fixture)
  raw.result.segments[0].text = `Text Two. ${raw.result.segments[0].text}`
  raw.result.segments[0].start = 0
  raw.result.segments[0].runs.unshift({ text: 'Text', start: 0, end: 0.4 }, { text: ' Two.', start: 0.4, end: 1 })
  assert.ok(evaluate({ windows: [raw] }).issues.includes('ANNOUNCEMENT_CONFLICT'))
})

function orderScenario(times, missing = [], middleInstruction = null) {
  const texts = [
    'Blue dolphins travel beyond distant islands while young sailors carefully study maps beside the harbor.',
    'Orange butterflies settle upon purple flowers as curious children quietly gather leaves near their school.',
    'Silver rockets carry important instruments above frozen mountains where scientists patiently observe stars every evening.',
  ]
  const groups = texts.map((text, i) => ({ segmentId: `listening-text-${i + 1}`, questionNumbers: [i + 1],
    text, ...(i === 1 && middleInstruction ? { instruction: middleInstruction } : {}) }))
  const parts = groups.filter((_, i) => !missing.includes(i)).map(g => windowFor(g.text, times[groups.indexOf(g)]))
  const windows = [{ startSeconds: 0, endSeconds: 100,
    result: { segments: parts.flatMap(w => w.result.segments) } }]
  return evaluateListeningEngine({ groups, windows, instructions: one, durationSeconds: 100, pauses: surrounding(parts) })
}
test('one missing group widens the skeleton interval without failing usable neighbors', () => {
  const result = orderScenario([2, 20, 40], [1])
  assert.deepEqual(result.groups.map(g => g.decision), ['usable', 'review_required', 'usable'])
  assert.deepEqual(reconcileListeningEngines(result).map(g => g.decision), ['usable', 'review_required', 'usable'])
})
test('inverted independently anchored skeleton fails both involved groups', () => {
  const result = orderScenario([20, 2, 40])
  for (const group of result.groups.slice(0, 2)) {
    assert.ok(group.issues.includes('WHOLE_PAPER_ORDER_CONFLICT'))
    assert.equal(group.playback, null)
  }
  assert.equal(result.groups[2].decision, 'usable')
})
test('overlapping playback in the skeleton gap fails both groups before sidecar emission', () => {
  const result = orderScenario([2, 40, 80])
  result.groups[0].playback.endSeconds = 30
  result.groups[1].playback.startSeconds = 29
  validateListeningOrder(result.groups)
  assert.deepEqual(result.groups.map(g => g.decision), ['review_required', 'review_required', 'usable'])
})
test('all occurrences of an unannounced failed group must remain in its skeleton interval', () => {
  const result = orderScenario([2, 60, 40], [], '本段读两遍')
  assert.ok(result.groups[1].issues.includes('WHOLE_PAPER_ORDER_CONFLICT'))
  assert.ok(result.groups[1].issues.includes('READING_COUNT_MISMATCH'))
  assert.equal(result.groups[2].decision, 'usable')
})
test('unknown expected reading count is not a numeric count mismatch', () => {
  const result = evaluate({ instructions: [] })
  assert.ok(result.issues.includes('READING_COUNT_UNKNOWN'))
  assert.ok(!result.issues.includes('READING_COUNT_MISMATCH'))
})
test('adjacent readings share a silence boundary without clipping complete acoustic runs', () => {
  const body = source.replace(/(?:M|W):/gu, '')
  const a = windowFor(body, 2), b = windowFor(body, 6.6)
  const result = evaluate({ instructions: two,
    windows: [{ startSeconds: 0, endSeconds: 100, result: { segments: [a.result.segments[0], b.result.segments[0]] } }],
    pauses: [{ startSeconds: 0, endSeconds: 1.9 }, { startSeconds: 6.45, endSeconds: 6.79 },
      { startSeconds: 11.1, endSeconds: 13 }] })
  assert.equal(result.decision, 'usable', result.issues.join(', '))
  const [first, second] = result.occurrences
  assert.ok(first.playback.endSeconds <= second.playback.startSeconds)
  assert.ok(first.playback.endSeconds >= first.endSeconds + LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)
  assert.ok(second.playback.startSeconds <= second.startSeconds - LISTENING_SEGMENT_RULE.boundaryPaddingSeconds)
})
