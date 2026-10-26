import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateListeningEngine, padListeningWordEdges, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'
import { reviewCuts } from './listening-owner-review-pack.mjs'

const edges = {wordStartSeconds: 10, wordEndSeconds: 15, durationSeconds: 30}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`)
test('word edges receive exactly 0.8 seconds when neighboring speech is distant', () => {
  const cut = padListeningWordEdges({...edges, previousSpeechEndSeconds: 5, nextSpeechStartSeconds: 20})
  near(cut.startSeconds, 9.2)
  near(cut.endSeconds, 15.8)
})
test('pauses shorter than 1.6 seconds share the adjacent speech midpoint, including zero gap', () => {
  for (const gap of [0, 0.2, 1, 1.59, 1.6, 2]) {
    const cut = padListeningWordEdges({...edges,
      previousSpeechEndSeconds: 10 - gap, nextSpeechStartSeconds: 15 + gap})
    near(cut.startSeconds, 10 - Math.min(0.8, gap / 2))
    near(cut.endSeconds, 15 + Math.min(0.8, gap / 2))
  }
})
test('recording endpoints clip buffers without moving the first or last word', () => {
  const cut = padListeningWordEdges({wordStartSeconds: 0.1, wordEndSeconds: 29.9, durationSeconds: 30})
  assert.equal(cut.startSeconds, 0)
  assert.equal(cut.endSeconds, 30)
  const full = padListeningWordEdges({wordStartSeconds: 0, wordEndSeconds: 30, durationSeconds: 30})
  assert.equal(full.startSeconds, 0)
  assert.equal(full.endSeconds, 30)
})
test('invalid word edges, neighbors and midpoint guards cannot clip spoken words', () => {
  for (const patch of [{wordStartSeconds: NaN}, {wordEndSeconds: 31},
    {previousSpeechEndSeconds: 10.1}, {nextSpeechStartSeconds: 14.9},
    {leadingMidpoint: 10.1}, {trailingMidpoint: 14.9}]) {
    assert.equal(padListeningWordEdges({...edges, ...patch}), null)
  }
})
test('Owner review pack and producer share the same buffer/midpoint arithmetic', () => {
  const pauses = [{startSeconds: 9, endSeconds: 10}, {startSeconds: 15, endSeconds: 18}]
  const review = reviewCuts({...edges, pauses})
  const cut = padListeningWordEdges({...edges, previousSpeechEndSeconds: 9, nextSpeechStartSeconds: 18})
  near(review.startSeconds, cut.startSeconds)
  near(review.endSeconds, cut.endSeconds)
})
test('production per-reading cuts cap long silence, honor short gaps and recording endpoints', () => {
  const text = 'Bright birds gather beside our quiet river near the peaceful village'
  const words = text.split(' ')
  const segment = start => ({start, end: start + 2.2, text,
    words: words.map((word, i) => ({word, start: start + i * 0.2, end: start + (i + 1) * 0.2}))})
  for (const gap of [0.4, 1, 5]) {
    const a = segment(2), b = segment(4.2 + gap)
    const result = evaluateListeningEngine({groups: [{segmentId: 'listening-text-1',
      questionNumbers: [1], text}], instructions: [{slotId: 'listening.short-dialogue', text: '读两遍'}],
    windows: [{startSeconds: 0, endSeconds: 30, result: {segments: [a, b]}}],
    pauses: [{startSeconds: 0, endSeconds: 1.95}, {startSeconds: 4.2, endSeconds: b.start},
      {startSeconds: b.end, endSeconds: 30}], durationSeconds: 30}).groups[0]
    assert.equal(result.decision, 'usable', result.issues.join(','))
    const [first, second] = result.occurrences
    near(first.playback.endSeconds, 4.2 + Math.min(0.8, gap / 2))
    near(second.playback.startSeconds, b.start - Math.min(0.8, gap / 2))
    assert.ok(first.playback.endSeconds <= second.playback.startSeconds)
    near(second.playback.endSeconds, b.end + 0.8)
  }
  const only = segment(0)
  const result = evaluateListeningEngine({groups: [{segmentId: 'listening-text-1',
    questionNumbers: [1], text}], instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}],
  windows: [{startSeconds: 0, endSeconds: only.end, result: {segments: [only]}}],
  pauses: [], durationSeconds: only.end}).groups[0]
  assert.equal(result.decision, 'usable', result.issues.join(','))
  assert.deepEqual(result.playback, {startSeconds: 0, endSeconds: only.end})
})
test('a fallback-only neighboring voice clips the buffer at its midpoint even at the old cut endpoint', () => {
  const text = 'Bright birds gather beside our quiet river near the peaceful village'
  const words = text.split(' ').map((word, i) => ({word, start: 2 + i * 0.2, end: 2 + (i + 1) * 0.2}))
  const base = {groups: [{segmentId: 'listening-text-1', questionNumbers: [1], text}],
    instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}],
    windows: [{startSeconds: 0, endSeconds: 30, result: {segments: [{text, start: 2, end: 4.2, words}]}}],
    pauses: [{startSeconds: 0, endSeconds: 1.95}, {startSeconds: 4.3, endSeconds: 10}],
    durationSeconds: 30}
  const primary = evaluateListeningEngine(base)
  const secondary = evaluateListeningEngine({...base, engine: 'faster-whisper'})
  secondary.groups[0].boundarySpeechRuns.push({engine: 'faster-whisper', runId: 'neighbor',
    startSeconds: 5, endSeconds: 5.4, text: '请准备', tail: [], afterPause: null})
  const result = reconcileListeningEngines(primary, secondary)[0]
  assert.equal(result.decision, 'usable')
  near(result.occurrences[0].playback.endSeconds, (4.2 + 5) / 2)
  near(result.playback.endSeconds, (4.2 + 5) / 2)
})
