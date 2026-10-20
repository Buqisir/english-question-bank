import test from 'node:test'
import assert from 'node:assert/strict'
import { LISTENING_SEGMENT_RULE, evaluateListeningEngine, listeningAsrTokens, normalizeListeningText } from './lib-listening-segment-rule.mjs'

const normal = normalizeListeningText
const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
  'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty first',
  'twenty second', 'twenty third', 'twenty fourth', 'twenty fifth', 'twenty sixth',
  'twenty seventh', 'twenty eighth', 'twenty ninth', 'thirtieth', 'thirty first']
const suffix = n => n >= 11 && n <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')
test('v2 equates exactly the first thirty-one ordinal spellings, preserving their value', () => {
  assert.equal(LISTENING_SEGMENT_RULE.normalizationVersion, 'listening-equivalences-v2')
  ordinal.forEach((word, i) => {
    assert.deepEqual(normal(`${i + 1}${suffix(i + 1)}`), normal(word))
    assert.deepEqual(normal(word.replaceAll(' ', '-')), normal(word))
    assert.notDeepEqual(normal(word), normal(String(i + 1)))
    if (i) assert.notDeepEqual(normal(word), normal(ordinal[i - 1]))
  })
  assert.notDeepEqual(normal('2st'), normal('second'))
})
test('meridiem aliases and explicit clock spellings preserve the same hour and minute', () => {
  for (const [a,b] of [['AM', 'a.m.'], ['PM', 'p.m.'], ['am','a.m.'], ['pm','p.m.'],
    ['9:00 am', '9am'], ['1:00 pm', 'one p.m.'], ['3:00 p.m.', '3 pm'],
    ['7:30', 'seven thirty'], ['7:30 pm', '7.30PM'], ['1:15 pm', '115 p.m.'],
    ['2:45 pm', '2 .45pm'], ['9:00', "nine o 'clock"], ['7:30', 'half past seven']]) {
    assert.deepEqual(normal(a), normal(b), `${a} / ${b}`)
  }
  for (const [a,b] of [['7:30','7:13'], ['7am','7pm'], ['1:15pm','1:50pm'],
    ['9:30','930'], ['half past seven','half past eight'], ['7:30','19:30'],
    ['7:30','$7.30'], ['7:30','7:99']]) assert.notDeepEqual(normal(a), normal(b), `${a} / ${b}`)
})
test('year readings are bounded to explicit year context or a standalone year expression', () => {
  for (const [a,b] of [['2026','twenty twenty-six'], ['in 2026','in twenty twenty six'],
    ['the year 2026','the year twenty twenty-six'], ['in 2006','in twenty oh six'],
    ['in 2013','in twenty thirteen'], ['in 2099','in twenty ninety-nine']]) {
    assert.deepEqual(normal(a), normal(b), `${a} / ${b}`)
  }
  assert.notDeepEqual(normal('in 2026'), normal('in twenty twenty-seven'))
  assert.notDeepEqual(normal('twenty twenty-six dollars'), normal('2026 dollars'))
  assert.notDeepEqual(normal('twenty six'), normal('2006'))
})
test('grouped integer and money readings remain stable; an unmarked decimal is never a clock', () => {
  for (const [a, b] of [['1,000', 'one thousand'], ['123,456', 'one hundred twenty three thousand four hundred fifty six'],
    ['$1,000.25', 'one thousand dollars twenty five cents'], ['£12.50', 'twelve pounds fifty cents']]) {
    assert.deepEqual(normal(a), normal(b), `${a} / ${b}`)
  }
  for (const a of ['7.30', '7 .30', '7 . 30']) assert.notDeepEqual(normal(a), normal('7:30'))
})
function windowFor(parts) {
  return { startSeconds: 0, endSeconds: 100, result: { segments: [{
    text: parts.join(' '), start: 2, end: 2 + parts.length * 0.2,
    words: parts.map((word, i) => ({ word, start: 2 + i * 0.2, end: 2 + (i + 1) * 0.2 })),
  }] } }
}
test('ASR normalization crosses run boundaries while preserving complete acoustic boundaries', () => {
  for (const [parts, expected] of [
    [['at','1','.15pm'], 'at one fifteen pm'],
    [['at','nine','o',"'clock"], "at nine o'clock"],
    [['at','nine','a.','m.'], 'at nine am'],
    [['in','twenty','twenty','six'], 'in two thousand twenty six'],
  ]) {
    const words = listeningAsrTokens([windowFor(parts)]).words
    assert.deepEqual(words.map(w=>w.token), normal(expected))
    assert.equal(words[0].runStartSeconds, 2)
    assert.equal(words[0].startBoundary, true)
    assert.equal(words.at(-1).endBoundary, true)
    assert.equal(words.at(-1).runEndSeconds, 2 + parts.length * 0.2)
    assert.ok(words.every(w => w.startSeconds < w.endSeconds))
  }
})
test('normalization never grants internal tokens a new acoustic boundary or loses their raw text', () => {
  const raw = windowFor(['before 1', '.15pm after'])
  const words = listeningAsrTokens([raw]).words
  assert.deepEqual(words.map(w => w.token), normal('before 1:15pm after'))
  const clock = words.slice(1, -1)
  assert.ok(clock.every(w => !w.startBoundary && !w.endBoundary))
  assert.ok(clock.every(w => w.rawRunText === 'before 1 .15pm after'))
  assert.ok(clock.every(w => w.timing === 'interpolated_within_normalized_span'))
  assert.equal(words[0].startBoundary, true)
  assert.equal(words.at(-1).endBoundary, true)
})
test('a silence, invalid timestamp, reversed clock or separate segment cannot complete a clock expression', () => {
  for (const edit of [
    words => { words[2].start += 3; words[2].end += 3 },
    words => { words[2].end = NaN },
    words => { words[2].start = 1; words[2].end = 1.5 },
  ]) {
    const raw = windowFor(['at', '1', '.15pm'])
    edit(raw.result.segments[0].words)
    assert.notDeepEqual(listeningAsrTokens([raw]).words.map(w => w.token), normal('at 1:15pm'))
  }
  const raw = windowFor(['at', 'nine', 'o', "'clock"])
  const words = raw.result.segments[0].words
  raw.result.segments = [words.slice(0, 3), words.slice(3)].map(part => ({
    text: part.map(w => w.word).join(' '), words: part, start: part[0].start, end: part.at(-1).end,
  }))
  assert.notDeepEqual(listeningAsrTokens([raw]).words.map(w => w.token), normal("at nine o'clock"))
})
function evaluate(phrase, actual) {
  const before = 'Blue dolphins travel beyond distant islands while young sailors carefully study maps'
  const after = 'and curious children quietly gather orange leaves around their peaceful village beside the harbor'
  const parts = `${before} ${actual} ${after}`.split(' ')
  const raw = windowFor(parts)
  return evaluateListeningEngine({ groups: [{ segmentId: 'listening-text-1', questionNumbers: [1],
    text: `${before} ${phrase} ${after}` }], windows: [raw], durationSeconds: 100,
  instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}],
  pauses: [{startSeconds: 1, endSeconds: 1.95},
    {startSeconds: 2 + parts.length * 0.2 + 0.05, endSeconds: 4 + parts.length * 0.2}] }).groups[0]
}
test('the public rule accepts equivalent notation after normalization', () => {
  for (const [a,b] of [['first','1st'], ['twenty-first','21st'], ['at 7:30 pm','at 7.30PM'],
    ['at 1:00 pm','at one p.m.'], ['at 1:15pm','at 115 p.m.'], ['at 7:30','at half past seven'],
    ['in 2026','in twenty twenty-six']]) {
    const result = evaluate(a,b)
    assert.equal(result.decision, 'usable', `${a} / ${b}: ${result.issues}`)
    assert.ok(!result.issues.includes('CRITICAL_WORD_DIFFERENCE'))
  }
})
test('unequal ordinals, clocks, years, amounts and negation remain critical differences', () => {
  for (const [a,b] of [['first','2nd'], ['third','4th'], ['twenty first','22nd'],
    ['at 7:30','at 7:13'], ['at 7:30 pm','at 7:30 am'], ['in 2026','in twenty twenty-seven'],
    ['$25','$26'], ['folder to','folder not to'], ['too','two'], ['at 09:30','at 930'],
    ['at 7:30','at 7.30']]) {
    const result = evaluate(a,b)
    assert.equal(result.decision, 'review_required', `${a} / ${b}`)
    assert.ok(result.issues.includes('CRITICAL_WORD_DIFFERENCE'), `${a} / ${b}: ${result.issues}`)
  }
})
