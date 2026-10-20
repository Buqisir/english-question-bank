import test from 'node:test'
import assert from 'node:assert/strict'
import { LISTENING_SEGMENT_RULE, evaluateListeningEngine, normalizeListeningText, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'

const body = 'Blue dolphins travel beyond distant islands while young sailors carefully study maps beside the harbor and curious children quietly gather orange leaves around their peaceful village during bright summer holidays'
const tokens = normalizeListeningText(body)
const group = { segmentId: 'listening-text-1', questionNumbers: [1], text: body }
const questions = [{ canonicalNumber: 1, stem: 'Where are the speakers?', options: [{ text: 'Harbor.' }] }]
function windowFor(words, at = 2) {
  return { startSeconds: 0, endSeconds: 100, result: { segments: [
    { text: words.join(' '), start: at, end: at + words.length * 0.2,
      words: words.map((word, i) => ({ word, start: at + i * 0.2, end: at + (i + 1) * 0.2 })) },
  ] } }
}
function evaluate({ text = body, actual = tokens, ...options } = {}) {
  const window = windowFor(actual)
  return evaluateListeningEngine({ groups: [{ ...group, text }], questions, instructions: [
    { slotId: 'listening.short-dialogue', text: '每段读一遍' },
  ], windows: [window], pauses: [{ startSeconds: 1, endSeconds: 1.95 },
    { startSeconds: 2 + actual.length * 0.2 + 0.05, endSeconds: 4 + actual.length * 0.2 }],
  durationSeconds: 100, fuzzyAnchors: true, ...options }).groups[0]
}
const change = (index, word, words = tokens) => words.map((w, i) => i === index ? word : w)

test('fuzzy anchor defaults off; one harmless substitution requires exactly twelve words and retains evidence', () => {
  assert.equal(LISTENING_SEGMENT_RULE.fuzzyAnchorsEnabled, false)
  const actual = change(1, 'porpoises')
  assert.equal(evaluate({ actual, fuzzyAnchors: false }).decision, 'review_required')
  const result = evaluate({ actual })
  assert.equal(result.decision, 'usable', result.issues.join(', '))
  assert.equal(result.anchors.width, 12)
  assert.equal(result.anchors.mode, 'one_substitution_12')
  assert.equal(result.sourceText, body)
  assert.deepEqual(result.occurrences[0].anchorSubstitutions.map(d => [
    d.sourceWord, d.targetWord, d.sourceWordIndex, d.asrWordIndex, d.rawSourceWord, d.rawAsrRun,
  ]), [['dolphins', 'porpoises', 1, 1, 'dolphins', 'porpoises']])
})
test('tail-only substitution is supported; changes to both endpoints cannot pass', () => {
  const actual = change(tokens.length - 1, 'vacations')
  assert.equal(evaluate({ actual }).decision, 'usable')
  const result = evaluate({ actual: change(1, 'porpoises', actual) })
  assert.equal(result.decision, 'review_required')
  assert.ok(result.issues.includes('FUZZY_ANCHOR_BOTH_ENDS_CHANGED'))
})
test('a twelve-word fuzzy anchor never accepts insertions, deletions or two substitutions', () => {
  for (const actual of [
    [...tokens.slice(0, 2), 'playful', ...tokens.slice(2)],
    tokens.filter((_, i) => i !== 2), change(2, 'swim', change(1, 'porpoises')),
  ]) assert.equal(evaluate({ actual }).decision, 'review_required')
})
test('critical words and question or option content words are protected on both sides', () => {
  for (const [sourceWord, actualWord] of [['dolphins', 'not'], ['dolphins', "don't"],
    ['dolphins', 'twenty'], ['dolphins', 'dollars'], ['dolphins', 'noon'],
    ['never', 'often'], ['seven', 'several'], ['pounds', 'pebbles'], ['midnight', 'darkness']]) {
    const src = change(1, sourceWord)
    const result = evaluate({ text: src.join(' '), actual: change(1, actualWord, src) })
    assert.equal(result.decision, 'review_required', `${sourceWord} -> ${actualWord}`)
    assert.ok(result.issues.includes('FUZZY_ANCHOR_PROTECTED_WORD'))
  }
  for (const word of ['dolphins', 'porpoises']) {
    const result = evaluate({ actual: change(1, 'porpoises'), questions: [
      { canonicalNumber: 1, stem: `Why ${word}?`, options: [{ text: word }] },
    ] })
    assert.ok(result.issues.includes('FUZZY_ANCHOR_PROTECTED_WORD'))
  }
  assert.ok(evaluate({ actual: change(1, 'porpoises'), questions: undefined }).issues.includes('FUZZY_ANCHOR_QUESTION_CONTEXT_MISSING'))
})
test('source and audio uniqueness count every one-substitution candidate, even protected substitutions', () => {
  const actual = change(1, 'porpoises')
  const other = { segmentId: 'listening-text-2', questionNumbers: [2], text: change(1, 'not').join(' ') }
  const sourceConflict = evaluate({ actual, corpus: [group, other] })
  assert.ok(sourceConflict.issues.includes('ANCHOR_AMBIGUOUS'))
  const a = windowFor(actual), b = windowFor(change(1, 'not'), 20)
  const raw = { ...a, result: { segments: [...a.result.segments, ...b.result.segments] } }
  assert.ok(evaluate({ actual, windows: [raw] }).issues.includes('ANCHOR_AMBIGUOUS'))
})
test('a Whisper crop cannot prove whole-recording uniqueness; failed coverage never counts', () => {
  const actual = change(1, 'porpoises')
  const crop = windowFor(actual)
  crop.endSeconds = 15
  for (const globalAnchorWindows of [[crop], [{ ...windowFor(actual), error: 'unavailable' }]]) {
    const result = evaluate({ actual, globalAnchorWindows })
    assert.equal(result.decision, 'review_required')
    assert.ok(result.issues.includes('FUZZY_ANCHOR_GLOBAL_UNPROVEN'))
  }
})
test('under twenty words is ineligible; overlapping short anchors require another exact engine', () => {
  const short = tokens.slice(0, 19)
  assert.equal(evaluate({ text: short.join(' '), actual: change(1, 'porpoises', short) }).anchors.mode, 'exact')
  for (const length of [20, 21, 22, 23]) {
    const src = tokens.slice(0, length)
    const fuzzy = evaluate({ text: src.join(' '), actual: change(1, 'porpoises', src) })
    assert.ok(fuzzy.issues.includes('FUZZY_ANCHOR_OVERLAP_NEEDS_EXACT_ENGINE'), String(length))
    assert.equal(reconcileListeningEngines({ groups: [fuzzy] })[0].decision, 'review_required')
    const exact = evaluate({ text: src.join(' '), actual: src, engine: 'faster-whisper' })
    const resolved = reconcileListeningEngines({ groups: [fuzzy] }, { groups: [exact] })[0]
    assert.equal(resolved.decision, 'usable')
    assert.equal(resolved.selectedEngine, 'faster-whisper')
    const alsoFuzzy = { ...structuredClone(fuzzy), engine: 'faster-whisper' }
    assert.equal(reconcileListeningEngines({ groups: [fuzzy] }, { groups: [alsoFuzzy] })[0].decision, 'review_required')
  }
})
test('fuzzy candidates keep physical boundary, reading count and engine conflict gates', () => {
  const actual = change(1, 'porpoises')
  assert.ok(evaluate({ actual, pauses: [] }).issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
  assert.ok(evaluate({ actual, instructions: [{ slotId: 'listening.short-dialogue', text: '读两遍' }] })
    .issues.includes('READING_COUNT_MISMATCH'))
  const primary = evaluate({ actual })
  const secondary = evaluate({ engine: 'faster-whisper' })
  secondary.occurrences[0].playback.endSeconds += 1
  assert.equal(reconcileListeningEngines({ groups: [primary] }, { groups: [secondary] })[0].decision, 'review_required')
})
test('each reading has its own single-substitution allowance and exact opposite endpoint', () => {
  const a = windowFor(change(1, 'porpoises')), b = windowFor(change(tokens.length - 1, 'vacations'), 20)
  const result = evaluate({ windows: [{ ...a, result: { segments: [...a.result.segments, ...b.result.segments] } }],
    instructions: [{ slotId: 'listening.short-dialogue', text: '读两遍' }],
    pauses: [{ startSeconds: 1, endSeconds: 1.95 }, { startSeconds: 8.05, endSeconds: 9 },
      { startSeconds: 19, endSeconds: 19.95 }, { startSeconds: 26.05, endSeconds: 27 }] })
  assert.equal(result.decision, 'usable', result.issues.join(', '))
  assert.deepEqual(result.occurrences.map(o => o.anchorSubstitutions.map(s => s.side)), [['head'], ['tail']])
})
test('global evidence must cover the same candidate times and every group question must be available', () => {
  const actual = change(1, 'porpoises')
  const elsewhere = evaluate({ actual, globalAnchorWindows: [windowFor(actual, 20)] })
  assert.ok(elsewhere.issues.includes('FUZZY_ANCHOR_GLOBAL_UNPROVEN'))
  const incomplete = evaluate({ actual, groups: [{ ...group, questionNumbers: [1, 2] }] })
  assert.ok(incomplete.issues.includes('FUZZY_ANCHOR_QUESTION_CONTEXT_MISSING'))
})
