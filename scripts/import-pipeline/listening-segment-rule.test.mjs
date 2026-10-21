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

function repeatedEngine({first = null, third = false, engine = 'Apple SpeechAnalyzer'} = {}) {
  const text = 'Bright birds gather beside our quiet river while travelers can buy lunch for twenty dollars before seven and enjoy the peaceful village over there'
  const parts = [windowFor(first ?? text, 2), windowFor(text, 12), ...(third ? [windowFor(text, 22)] : [])]
  return evaluateListeningEngine({groups: [{...group, text}], instructions: two, engine,
    windows: [{startSeconds: 0, endSeconds: 100, result: {segments: parts.flatMap(w => w.result.segments)}}],
    pauses: surrounding(parts), durationSeconds: 100})
}
test('a missing first tail is absence of evidence, paired by time with the complete second reading', () => {
  const missing = repeatedEngine({first: 'Bright birds gather beside our quiet river while travelers can buy lunch for twenty dollars before seven and enjoy the peaceful village over here'})
  const full = repeatedEngine({engine: 'faster-whisper'})
  assert.equal(missing.groups[0].occurrences.length, 1)
  const result = reconcileListeningEngines(missing, full)[0]
  assert.equal(result.decision, 'usable', JSON.stringify(result.engineConflicts))
  assert.equal(result.selectedEngine, 'faster-whisper')
  assert.equal(reconcileListeningEngines(full, missing)[0].decision, 'usable')
})
test('extra readings remain blocked with a distinct observed-count reason', () => {
  const result = reconcileListeningEngines(repeatedEngine({third: true}), repeatedEngine({engine: 'faster-whisper'}))[0]
  assert.equal(result.decision, 'review_required')
  assert.ok(result.issues.includes('OBSERVED_READING_COUNT_EXCEEDED'))
  assert.ok(!result.engineAttempts[0].issues.includes('ANCHOR_AMBIGUOUS'))
})
test('critical counterevidence in a missing-tail candidate blocks either direction', () => {
  const text = 'Bright birds gather beside our quiet river while travelers can buy lunch for twenty dollars before seven and enjoy the peaceful village over here'
  for (const first of [text.replace('can buy', 'can not buy'), text.replace('can buy', 'could buy'),
    text.replace('twenty dollars', 'thirty dollars'), text.replace('before seven', 'before eight')]) {
    const partial = repeatedEngine({first}), full = repeatedEngine({engine: 'faster-whisper'})
    for (const pair of [[partial, full], [full, partial]]) {
      const result = reconcileListeningEngines(...pair)[0]
      assert.equal(result.decision, 'review_required', first)
      assert.ok(result.issues.includes('ENGINE_CONFLICT'), first)
    }
  }
})
test('missing-head tail candidates also retain critical counterevidence in either engine', () => {
  const text = 'Blazing birds gather beside our quiet river while travelers can buy lunch for twenty dollars before seven and enjoy the peaceful village over there'
  const full = repeatedEngine({engine: 'faster-whisper'})
  assert.equal(reconcileListeningEngines(repeatedEngine({first: text}), full)[0].decision, 'usable')
  for (const first of [text.replace('can buy', 'can not buy'), text.replace('can buy', 'could buy'),
    text.replace('twenty dollars', 'thirty dollars'), text.replace('before seven', 'before eight')]) {
    const partial = repeatedEngine({first})
    for (const pair of [[partial, full], [full, partial]]) {
      assert.equal(reconcileListeningEngines(...pair)[0].decision, 'review_required', first)
    }
  }
})
const astraText = 'Bright birds gather beside our quiet river while travelers can buy lunch for twenty dollars before seven and enjoy the peaceful village over there'
function astraEngine(first = astraText, mutate = null, overrides = {}) {
  const segments = [windowFor(first, 2), windowFor(astraText, 12)].flatMap(w => w.result.segments)
  mutate?.(segments)
  return evaluateListeningEngine({groups: [{...group, text: astraText}], instructions: two,
    windows: [{startSeconds: 0, endSeconds: 30, result: {segments}}],
    pauses: [{startSeconds: 1, endSeconds: 1.95}, {startSeconds: 8.5, endSeconds: 9.5},
      {startSeconds: 11, endSeconds: 11.95}, {startSeconds: 16.85, endSeconds: 18}],
    durationSeconds: 30, ...overrides})
}
function assertCounterevidenceBlocks(partial, full, label) {
  for (const pair of [[partial, full], [full, partial]]) {
    const result = reconcileListeningEngines(...pair)[0]
    assert.equal(result.decision, 'review_required', label)
    assert.equal(result.playback, null, label)
    assert.ok(result.issues.includes('ENGINE_CONFLICT'), label)
  }
}
test('Astra P1: a late not in a missing-tail candidate cannot be clipped by reference body times', () => {
  const first = astraText.replace('over there', 'over here')
  const full = astraEngine(astraText, null, {engine: 'faster-whisper'})
  assert.equal(reconcileListeningEngines(astraEngine(first), full)[0].decision, 'usable')
  const partial = astraEngine(`${first} not`, segments => {
    segments[0].words.at(-1).start = 8
    segments[0].words.at(-1).end = 8.2
    segments[0].end = 8.2
  })
  assertCounterevidenceBlocks(partial, full, 'not at 8.0–8.2 after reference body end 6.8')
})
test('Astra P1: both anchors may be missing while observed can/could still blocks fallback', () => {
  const first = astraText.replace('Bright', 'Blazing').replace('over there', 'over here')
  const full = astraEngine(astraText, null, {engine: 'faster-whisper'})
  const clean = astraEngine(first)
  assert.equal(clean.groups[0].occurrences.length, 1)
  assert.equal(clean.groups[0].partialOccurrences.length, 0)
  for (const pair of [[clean, full], [full, clean]]) assert.equal(reconcileListeningEngines(...pair)[0].decision, 'usable')
  for (const changed of [first.replace('can buy', 'could buy'), first.replace('can buy', 'can not buy'),
    first.replace('twenty dollars', 'thirty dollars'), first.replace('before seven', 'before eight')]) {
    assertCounterevidenceBlocks(astraEngine(changed), full, changed)
  }
})
test('reference envelope edges retain negative, modal and numeric observations in both directions', () => {
  const first = astraText.replace('Bright', 'Blazing').replace('over there', 'over here')
  const full = astraEngine(astraText, null, {engine: 'faster-whisper',
    pauses: [{startSeconds: 0.1, endSeconds: 0.4}, {startSeconds: 8.5, endSeconds: 9.5},
      {startSeconds: 11, endSeconds: 11.95}, {startSeconds: 16.85, endSeconds: 18}]})
  for (const anchored of [first, first.replace('Blazing', 'Bright'), first.replace('over here', 'over there')]) {
    for (const word of ['not', 'could', 'thirty']) for (const side of ['start', 'end']) {
      const partial = astraEngine(side === 'start' ? `${word} ${anchored}` : `${anchored} ${word}`, segments => {
        if (side === 'start') {
          segments[0].words.forEach((w, i) => {
            w.start = i ? 2 + (i - 1) * 0.2 : 1
            w.end = i ? 2 + i * 0.2 : 1.2
          })
          segments[0].start = 1
        } else {
          segments[0].words.at(-1).start = 8
          segments[0].words.at(-1).end = 8.2
          segments[0].end = 8.2
        }
      })
      assertCounterevidenceBlocks(partial, full, `${side} ${word} in ${anchored}`)
    }
  }
})
test('counterevidence in a discarded overlapping window also blocks a complete reference engine', () => {
  const segments = [windowFor(astraText, 2), windowFor(astraText, 12)].flatMap(w => w.result.segments)
  const changed = astraText.replace('Bright', 'Blazing').replace('over there', 'over here').replace('can buy', 'could buy')
  const bad = astraEngine(astraText, null, {windows: [
    {startSeconds: 0, endSeconds: 30, result: {segments}},
    {...windowFor(changed, 2), endSeconds: 9},
  ]})
  assert.equal(bad.groups[0].decision, 'usable', 'the chosen anchor clock remains complete')
  assertCounterevidenceBlocks(bad, astraEngine(astraText, null, {engine: 'faster-whisper'}), 'discarded window could')
})
test('unanchored raw speech spanning two physical readings has no safe subset assignment', () => {
  const text = astraText.replace('Bright', 'Blazing').replace('over there', 'over here')
  const partial = astraEngine(text, null, {windows: [{startSeconds: 0, endSeconds: 30,
    result: {segments: [{start: 2, end: 16.8, text, words: [{word: text, start: 2, end: 16.8}]}]}}]})
  assert.equal(partial.groups[0].occurrences.length, 0)
  assert.equal(partial.groups[0].partialOccurrences.length, 0)
  assertCounterevidenceBlocks(partial, astraEngine(astraText, null, {engine: 'faster-whisper'}), 'ambiguous raw run')
})
test('unexplained ordinary edge speech cannot be treated as an unobserved prefix or suffix', () => {
  const first = astraText.replace('Bright', 'Blazing').replace('over there', 'over here')
  const full = astraEngine(astraText, null, {engine: 'faster-whisper',
    pauses: [{startSeconds: 0.1, endSeconds: 0.4}, {startSeconds: 8.5, endSeconds: 9.5},
      {startSeconds: 11, endSeconds: 11.95}, {startSeconds: 16.85, endSeconds: 18}]})
  for (const word of ['prepare', 'there']) for (const side of ['start', 'end']) {
    const partial = astraEngine(first, segments => {
      const extra = {word, start: side === 'start' ? 1 : 8, end: side === 'start' ? 1.2 : 8.2}
      segments[0].words[side === 'start' ? 'unshift' : 'push'](extra)
      segments[0][side] = side === 'start' ? 1 : 8.2
    })
    assertCounterevidenceBlocks(partial, full, `${side} ordinary ${word}`)
  }
})
test('an anchor inside a long acoustic run cannot explain extra edge words in that run', () => {
  const text = `${astraText} there`
  const partial = astraEngine(text, null, {instructions: one, windows: [{startSeconds: 0, endSeconds: 30,
    result: {segments: [{start: 2, end: 8.2, text, words: [{word: text, start: 2, end: 8.2}]}]}}]})
  const full = astraEngine(astraText, null, {instructions: one, engine: 'faster-whisper',
    windows: [{...windowFor(astraText, 2), endSeconds: 30}]})
  assert.ok(partial.groups[0].issues.includes('EDGE_WORD_SPAN_LONG'))
  assert.equal(full.groups[0].decision, 'usable')
  assertCounterevidenceBlocks(partial, full, 'extra there shares a coarse run with exact anchors')
})
test('genuinely unobserved prefixes and suffixes do not assert critical deletions', () => {
  const full = astraEngine(astraText, null, {engine: 'faster-whisper'})
  for (const side of ['prefix', 'suffix', 'both']) {
    const partial = astraEngine(astraText, segments => {
      segments[0].words = segments[0].words.filter((_, i, list) =>
        (side === 'suffix' || i >= 10) && (side === 'prefix' || i < list.length - 9))
      segments[0].start = segments[0].words[0].start
      segments[0].end = segments[0].words.at(-1).end
    })
    for (const pair of [[partial, full], [full, partial]]) {
      assert.equal(reconcileListeningEngines(...pair)[0].decision, 'usable', side)
    }
  }
})
test('common occurrences at incompatible times or in reversed order still conflict', () => {
  const full = repeatedEngine(), other = repeatedEngine({engine: 'faster-whisper'})
  other.groups[0].occurrences.reverse()
  assert.equal(reconcileListeningEngines(full, other)[0].decision, 'review_required')
  const shifted = repeatedEngine({engine: 'faster-whisper'})
  shifted.groups[0].occurrences[0].startSeconds += 30
  shifted.groups[0].occurrences[0].endSeconds += 30
  assert.equal(reconcileListeningEngines(full, shifted)[0].decision, 'review_required')
})

test('frozen Apple run fixture: one reading is usable from original instructions', () => {
  const result = evaluate()
  assert.equal(result.decision, 'usable', JSON.stringify(result.issues))
  assert.equal(result.expectedReadings, 1)
  assert.equal(result.occurrences.length, 1)
  assert.ok(result.playback.startSeconds < 2)
  assert.ok(result.playback.endSeconds > 6.8)
})
test('boundary search skips an overlapping silence that cannot retain padding and uses the next observed pause', () => {
  const raw = windowFor('Bright birds gather along the quiet river near our peaceful village')
  const end = raw.result.segments[0].end
  const result = evaluate({groups: [{...group, text: raw.result.segments[0].text}], windows: [raw],
    pauses: [{startSeconds: 1, endSeconds: 1.9},
      {startSeconds: end - 0.08, endSeconds: end + 0.003},
      {startSeconds: end + 0.42, endSeconds: end + 3}]})
  assert.equal(result.decision, 'usable', result.issues.join(','))
  assert.ok(result.playback.endSeconds >= end + 0.42)
  assert.ok(result.playback.endSeconds > end + 0.02)
  const noLaterPause = evaluate({groups: [{...group, text: raw.result.segments[0].text}], windows: [raw],
    pauses: [{startSeconds: 1, endSeconds: 1.9}, {startSeconds: end - 0.08, endSeconds: end + 0.003}]})
  assert.ok(noLaterPause.issues.includes('BOUNDARY_EVIDENCE_INSUFFICIENT'))
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
  assert.ok(result.issues.includes('ANCHOR_IDENTITY_AMBIGUOUS'))
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
test('inserted critical words cannot pass merely because every source word matched', () => {
  const raw = windowFor(source.replace(/(?:M|W):/gu, '').replace('folder to', 'folder not to'))
  const result = evaluate({ windows: [raw], pauses: surrounding([raw]) })
  assert.equal(result.decision, 'review_required')
  assert.ok(result.issues.includes('CRITICAL_WORD_DIFFERENCE'))
})
test('alignment checks critical insertions, deletions and replacements on both sides', () => {
  const plain = source.replace(/(?:M|W):/gu, '')
  for (const word of ['not', 'no', 'never', "don't", 'twenty', 'dollars', 'pounds', 'am', 'pm', 'midnight']) {
    const added = plain.replace('folder to', `folder ${word} to`)
    for (const [text, actual] of [[plain, added], [added, plain],
      [plain.replace('station', word), plain], [plain, plain.replace('station', word)]]) {
      const raw = windowFor(actual)
      const result = evaluate({ groups: [{ ...group, text }], windows: [raw], pauses: surrounding([raw]) })
      assert.equal(result.decision, 'review_required', `${text} / ${actual}`)
      assert.ok(result.issues.includes('CRITICAL_WORD_DIFFERENCE'))
      const critical = word === "don't" ? 'not' : word
      assert.ok(result.occurrences[0].alignment.differences.some(d => d.sourceWord === critical || d.targetWord === critical))
    }
  }
})
test('a failed group whose first twelve words occur in another body never constrains that body', () => {
  const prefix = 'curious children quietly gather orange leaves beside their school every autumn morning'
  const a = { ...group, text: `Blue dolphins travel beyond distant islands while ${prefix} and young sailors carefully study maps beside the harbor.` }
  const b = { segmentId: 'listening-text-2', questionNumbers: [2],
    text: `${prefix} but silver rockets carry instruments above frozen mountains tonight.` }
  const raw = windowFor(a.text)
  const result = evaluateListeningEngine({ groups: [a, b], instructions: one, windows: [raw],
    pauses: surrounding([raw]), durationSeconds: 100 })
  assert.deepEqual(result.groups.map(g => g.decision), ['usable', 'review_required'])
  assert.ok(result.groups[1].issues.includes('ANCHOR_IDENTITY_AMBIGUOUS'))
})
test('Chinese instructions permit numbering inside an English quote or English inline fragment', () => {
  for (const stem of ['请阅读句子 “Include (1) a title.” 并翻译。',
    '请翻译 “Include (1)” 并回答。', '请翻译 "Include (1)" 并回答。',
    { runs: [{ text: '请阅读句子 ' }, { text: 'Include (1) a title.' }, { text: ' 并翻译。' }] },
    { content: ['请阅读句子 ', 'Include (1)', ' 并翻译。'] }]) {
    assert.deepEqual(importSubmissionIssues({ materialization: { groups: [{ stem }] } }), [])
  }
  assert.equal(importSubmissionIssues({ materialization: { stem: '要点：(1) 介绍活动；(2) …' } })[0].matches.length, 2)
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
test('a failed previous reading count does not reassign its old announcement to the next body', () => {
  const other = { segmentId: 'listening-text-2', questionNumbers: [2],
    text: 'Fresh apples grow around this quiet village and our neighbors deliver baskets every summer.' }
  const a = windowFor(source.replace(/(?:M|W):/gu, ''), 2), b = windowFor(other.text, 15)
  const windows = [{ startSeconds: 0, endSeconds: 100, result: { segments: [
    { text: 'Text One', start: 0, end: 1, runs: [] }, ...a.result.segments,
    { text: 'Text Two', start: 12, end: 13, runs: [] }, ...b.result.segments,
  ] } }]
  const result = evaluateListeningEngine({ groups: [{ ...group, instruction: '本段读两遍' }, other],
    instructions: one, windows, pauses: surrounding([a, b]), durationSeconds: 100 })
  assert.deepEqual(result.groups.map(g => g.decision), ['review_required', 'usable'])
  assert.deepEqual(result.groups[1].occurrences[0].announcements.map(m => m.groupNumber), [2])
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
  const conflict = reconcileListeningEngines({ groups: [apple] }, { groups: [whisper] })[0]
  assert.ok(conflict.issues.includes('ENGINE_CONFLICT'))
  assert.equal(conflict.engineConflicts.find(c => c.kind === 'playback_boundary').startDeltaSeconds, 1)
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
