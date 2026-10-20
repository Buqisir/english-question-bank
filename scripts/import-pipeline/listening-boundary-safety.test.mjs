import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateListeningEngine, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'

const firstText = 'Bright birds gather beside our quiet river near the peaceful village'
const nextText = 'Fresh apples grow around these green hills beyond a distant harbor'
const group = (number, text) => ({segmentId: `listening-text-${number}`, questionNumbers: [number], text})
function segment(text, at, duration = text.split(' ').length * 0.2) {
  const words = text.split(' ')
  return {text, start: at, end: at + duration, words: words.map((word, i) => ({
    word, start: at + i * duration / words.length, end: at + (i + 1) * duration / words.length,
  }))}
}
const window = segments => ({startSeconds: 0, endSeconds: 30, result: {segments}})
const pause = (startSeconds, endSeconds) => ({startSeconds, endSeconds})
function run(segments, pauses, options = {}) {
  return evaluateListeningEngine({groups: [group(1, firstText), group(2, nextText)],
    instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}],
    windows: [window(segments)], pauses, durationSeconds: 30, ...options})
}
const endPauses = [pause(1, 1.9), pause(4.12, 4.203), pause(4.62, 7.2),
  pause(7.4, 8), pause(10.5, 12)]
test('Astra: a farther ending pause cannot include Text Two between 4.200 and 4.620', () => {
  const result = run([segment(firstText, 2), segment('Text Two', 4.25, 0.3), segment(nextText, 8.2)], endPauses)
  assert.equal(result.groups[0].decision, 'review_required')
  assert.ok(result.groups[0].issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
  assert.equal(result.groups[0].playback, null)
  assert.equal(result.groups[1].decision, 'usable')
})
test('a farther starting pause cannot jump across preceding timed speech', () => {
  const result = run([segment(firstText, 2), segment('Text Two', 8.05, 0.1), segment(nextText, 8.2)],
    [pause(1, 1.9), pause(4.3, 6), pause(7.4, 8), pause(8.197, 8.28), pause(10.5, 12)])
  assert.equal(result.groups[1].decision, 'review_required')
  assert.ok(result.groups[1].issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
  assert.equal(result.groups[1].playback, null)
})
test('unclassified and Chinese timed prompts in any observed window also obstruct a boundary', () => {
  for (const text of ['note', '请准备', 'Text Two']) {
    const clean = window([segment(firstText, 2), segment(nextText, 8.2)])
    const other = window([segment(text, 4.25, 0.3)])
    for (const options of [{globalAnchorWindows: [other]}, {windows: [clean, other]}]) {
      const result = run(clean.result.segments, endPauses, options)
      assert.ok(result.groups[0].issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'), text)
    }
  }
})
test('reconciliation cannot approve a primary boundary across speech observed only by the other engine', () => {
  const clean = [segment(firstText, 2), segment(nextText, 8.2)]
  const primary = run(clean, endPauses)
  assert.equal(primary.groups[0].decision, 'usable')
  const secondary = run([...clean, segment('note', 4.25, 0.3)], endPauses, {engine: 'faster-whisper'})
  for (const fallback of [secondary, {groups: [secondary.groups[1]]}]) {
    const resolved = reconcileListeningEngines(primary, fallback)
    assert.equal(resolved[0].decision, 'review_required')
    assert.ok(resolved[0].issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
    assert.equal(resolved[0].playback, null)
    assert.equal(primary.groups[0].decision, 'usable')
    assert.ok(primary.groups[0].occurrences[0].playback)
  }
})
test('an ending midpoint cannot cross the next reading opening', () => {
  const result = run([segment(firstText, 2), segment(firstText, 6)], [
    pause(1, 1.9), pause(4.3, 12), pause(5.1, 5.9), pause(8.3, 12),
  ], {groups: [{...group(1, firstText), instruction: '读两遍'}]})
  assert.equal(result.groups[0].decision, 'usable', result.groups[0].issues.join(','))
  assert.ok(result.groups[0].occurrences[0].playback.endSeconds < 6)
  assert.ok(result.groups[0].occurrences[0].playback.endSeconds >= 4.22)
})
test('an ending midpoint cannot cross a successful neighboring skeleton playback start', () => {
  const result = run([segment(firstText, 2), segment(nextText, 6.2)], [
    pause(1, 1.9), pause(4.12, 4.203), pause(4.62, 7.2), pause(5.2, 5.6), pause(8.5, 10),
  ])
  assert.equal(result.groups[0].decision, 'usable', result.groups[0].issues.join(','))
  assert.ok(result.groups[0].playback.endSeconds <= result.groups[1].playback.startSeconds)
  assert.ok(result.groups[0].playback.endSeconds >= 4.22)
})
test('a neighbor limit outside the selected pause cannot become a physical boundary', () => {
  const result = run([segment(firstText, 2), segment(nextText, 6.3)], [
    pause(1, 1.9), pause(3.9, 5.4), pause(4.12, 4.203), pause(5.6, 7.2), pause(8.6, 10),
  ])
  assert.equal(result.groups[0].decision, 'review_required')
  assert.ok(result.groups[0].issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
  assert.equal(result.groups[0].playback, null)
})
