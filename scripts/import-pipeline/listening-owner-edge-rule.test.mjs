import test from 'node:test'
import assert from 'node:assert/strict'
import {evaluateListeningEngine, reconcileListeningEngines} from './lib-listening-segment-rule.mjs'

const text = 'Bright birds gather beside our quiet river near the peaceful village'
const nextText = 'Fresh apples grow around these green hills beyond a distant harbor'
const group = (number, text) => ({segmentId: `listening-text-${number}`, questionNumbers: [number], text})
const pauses = [{startSeconds: 1, endSeconds: 1.9}, {startSeconds: 4.3, endSeconds: 7.2},
  {startSeconds: 7.4, endSeconds: 8}, {startSeconds: 10.5, endSeconds: 12}]
function segment(text, start, duration = text.split(' ').length * 0.2) {
  const tokens = text.split(' ')
  return {text, start, end: start + duration, words: tokens.map((word, i) => ({
    word, start: start + duration * i / tokens.length, end: start + duration * (i + 1) / tokens.length,
  }))}
}
function engine(name, extras = [], options = {}) {
  return evaluateListeningEngine({engine: name, groups: [group(1, text), group(2, nextText)],
    instructions: [{slotId: 'listening.short-dialogue', text: '每段录音读一遍'}],
    windows: [{startSeconds: 0, endSeconds: 30, evidencePaths: [`${name}.json`],
      result: {segments: [segment(text, 2), segment(nextText, 8.2), ...extras]}}],
    durationSeconds: 30, pauses, ...options})
}
const primary = (extras, options) => engine('Apple SpeechAnalyzer', extras, options)
const secondary = (extras, options) => engine('faster-whisper', extras, options)
const isolated = result => result.engineNotes.filter(n => n.kind === 'isolated_edge_asr')
const unions = result => result.engineNotes.filter(n => n.kind === 'silent_playback_boundary_union')
function blocks(a, b, label = '') {
  for (const pair of [[a, b], [b, a]]) {
    const result = reconcileListeningEngines(...pair)[0]
    assert.equal(result.decision, 'review_required', `${label}: ${JSON.stringify(result.engineNotes)}`)
    assert.equal(result.playback, null)
    assert.equal(isolated(result).length, 0)
  }
}
function earlierStart(extras = []) {
  return secondary(extras, {pauses: [{startSeconds: 0, endSeconds: 1.3}, ...pauses.slice(1)]})
}
// Retain a >0.5s disputed interval inside v6's 0.8s buffer ceiling.
function narrowStart(attempt) {
  attempt.groups[0].playback.startSeconds = 1.9
  attempt.groups[0].occurrences[0].playback.startSeconds = 1.9
  return attempt
}

test('A: isolated edge words pass at the inclusive three-word / 1.5-second limits in either engine', () => {
  for (const [words, duration] of [['Tien', 0.64], ['Yung', 1.44], ['And', 0.48],
    ['Thank you', 0.64], ['Thank', 0.68], ['Tien Yung And', 1.5]]) {
    const a = primary([segment(words, 5, duration)]), b = secondary()
    const before = JSON.stringify([a, b])
    for (const pair of [[a, b], [b, a]]) {
      const result = reconcileListeningEngines(...pair)[0]
      assert.equal(result.decision, 'usable', words)
      assert.equal(isolated(result).length, 1)
      assert.ok(isolated(result)[0].evidencePaths.includes('Apple SpeechAnalyzer.json'))
      assert.equal(result.engineAttempts[0], pair[0].groups[0], 'retain original engine evidence')
    }
    assert.equal(JSON.stringify([a, b]), before, 'reconciliation must not mutate input attempts')
  }
})
test('A: both engines hearing a word, or different words in the same interval, still blocks', () => {
  for (const other of ['Tien', 'something']) {
    blocks(primary([segment('Tien', 5, 0.4)]), secondary([segment(other, 5, 0.4)]))
  }
  blocks(primary([segment('Tien', 5, 0.2)]), secondary([segment('Tien', 5.8, 0.2)]))
})
test('A: four words and a phrase longer than 1.5 seconds cannot be split into passing pieces', () => {
  blocks(primary([segment('one stray extra word', 5, 1.2)]), secondary())
  blocks(primary([segment('Thank you', 5, 1.5001)]), secondary())
  blocks(primary([segment('Thank', 5, 1.02), segment('you', 6.02, 1.02)]), secondary())
  blocks(primary([segment('Thank', 4.3, 0.2), segment('you', 6.7, 0.2)]), secondary())
})
test('A: interior alignment words never get the isolated edge exception', () => {
  const a = primary([segment('Tien', 3, 0.2)]), b = secondary()
  for (const pair of [[a, b], [b, a]]) {
    assert.equal(isolated(reconcileListeningEngines(...pair)[0]).length, 0)
  }
})
test('A: adjacent source prefixes and instructions block; Chinese prompts never receive an isolated-word exception', () => {
  for (const words of ['Fresh', 'Fresh apples', 'Text Two', '第2段', '请准备']) {
    const a = primary([segment(words, 4.8, 0.6)]), b = secondary()
    if (words === '请准备') {
      for (const pair of [[a, b], [b, a]]) {
        const result = reconcileListeningEngines(...pair)[0]
        assert.equal(isolated(result).length, 0)
        if (result.decision === 'usable') assert.ok(result.playback.endSeconds <= 4.8)
        else assert.equal(result.playback, null)
      }
    } else blocks(a, b, words)
  }
  const options = {instructions: [{slotId: 'listening.short-dialogue', text: '每段录音读一遍。Please prepare.'}]}
  for (const words of ['prepare', 'please prepare now']) {
    blocks(primary([segment(words, 5, 0.3)], options), secondary([], options))
  }
})
test('A: missing other-engine coverage and unknown reading count cannot certify silence or completeness', () => {
  const a = primary([segment('Tien', 5, 0.4)]), b = secondary()
  b.groups[0].observedWindows[0].endSeconds = 4.9
  blocks(a, b)
  const legacy = secondary()
  delete legacy.groups[0].boundarySpeechRuns
  blocks(a, legacy)
  const result = reconcileListeningEngines(primary([segment('Tien', 5, 0.4)], {instructions: []}),
    secondary([], {instructions: []}))[0]
  assert.equal(result.decision, 'review_required')
  assert.equal(isolated(result).length, 0)
})
test('B: silent disputed starts use the earlier playback boundary and preserve all evidence', () => {
  const a = narrowStart(primary()), b = earlierStart(), before = JSON.stringify([a, b])
  const result = reconcileListeningEngines(a, b)[0]
  assert.equal(result.decision, 'usable', JSON.stringify(result.engineConflicts))
  assert.equal(unions(result).length, 1)
  assert.equal(result.playback.startSeconds, b.groups[0].playback.startSeconds)
  assert.equal(result.occurrences[0].playback.startSeconds, result.playback.startSeconds)
  assert.deepEqual(result.occurrences[0].boundaryEvidence.beforePause, b.groups[0].occurrences[0].boundaryEvidence.beforePause)
  assert.equal(JSON.stringify([a, b]), before)
})
test('B: a disputed interval containing A-qualified words can use the union', () => {
  const result = reconcileListeningEngines(narrowStart(primary([segment('Tien', 1.25, 0.2)])), earlierStart())[0]
  assert.equal(result.decision, 'usable', JSON.stringify(result.engineConflicts))
  assert.equal(isolated(result).length, 1)
  assert.equal(unions(result).length, 1)
})
test('B: silent disputed ending unions retain the v6 word-edge buffer ceiling', () => {
  const a = primary(), b = secondary()
  b.groups[0].occurrences[0].playback.endSeconds += 0.7
  for (const pair of [[a, b], [b, a]]) {
    const result = reconcileListeningEngines(...pair)[0]
    assert.equal(result.decision, 'usable')
    assert.equal(unions(result).length, 1)
    assert.equal(result.playback.endSeconds, result.occurrences[0].endSeconds + 0.8)
    assert.equal(result.occurrences[0].playback.endSeconds, result.playback.endSeconds)
  }
})
test('B: spoken instructions and Chinese-only runs in the disputed interval still block', () => {
  for (const words of ['Text One', '请准备']) {
    const result = reconcileListeningEngines(narrowStart(primary([segment(words, 1.25, 0.2)])), earlierStart())[0]
    assert.equal(result.decision, 'review_required', words)
    assert.equal(unions(result).length, 0)
    assert.ok(result.engineConflicts.some(c => c.kind === 'playback_boundary'), words)
  }
})
test('B: a disputed boundary through body words and a missing coverage interval still block', () => {
  const a = primary(), b = secondary()
  b.groups[0].occurrences[0].playback.startSeconds = 2.1
  const result = reconcileListeningEngines(a, b)[0]
  assert.equal(result.decision, 'review_required')
  assert.equal(unions(result).length, 0)
  const missing = earlierStart()
  missing.groups[0].observedWindows[0].startSeconds = 1.3
  assert.equal(reconcileListeningEngines(narrowStart(a), missing)[0].decision, 'review_required')
})
test('B: silence does not authorize a union overlapping a neighboring group', () => {
  for (const failedCount of [false, true]) {
    const a = primary(), b = secondary()
    b.groups[0].occurrences[0].playback.endSeconds = 7.9
    if (failedCount) for (const attempt of [a, b]) {
      Object.assign(attempt.groups[1], {decision: 'review_required', independentlyAnchored: false,
        playback: null, issues: ['READING_COUNT_MISMATCH']})
    }
    const result = reconcileListeningEngines(a, b)[0]
    assert.equal(result.decision, 'review_required')
    assert.equal(unions(result).length, 0)
    assert.ok(result.engineConflicts.some(c => c.kind === 'playback_boundary'))
  }
})
test('B: proposed unions are checked together against every other occurrence', () => {
  const options = {groups: [{...group(1, text), instruction: '读两遍'}],
    windows: [{startSeconds: 0, endSeconds: 30,
      result: {segments: [segment(text, 2), segment(text, 8.2)]}}]}
  const a = primary([], options), b = secondary([], options)
  assert.equal(a.groups[0].decision, 'usable')
  b.groups[0].occurrences[0].playback.endSeconds = 7.1
  b.groups[0].occurrences[1].playback.startSeconds = 6.8
  const result = reconcileListeningEngines(a, b)[0]
  assert.equal(result.decision, 'review_required')
  assert.equal(unions(result).length, 0)
  assert.equal(result.engineConflicts.filter(c => c.kind === 'playback_boundary').length, 2)
})
