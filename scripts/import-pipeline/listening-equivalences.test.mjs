import test from 'node:test'
import assert from 'node:assert/strict'
import { LISTENING_SEGMENT_RULE, evaluateListeningEngine, listeningAsrTokens, normalizeListeningText, reconcileListeningEngines } from './lib-listening-segment-rule.mjs'

const normal = normalizeListeningText
const ordinal = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth',
  'ninth', 'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth',
  'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth', 'twentieth', 'twenty first',
  'twenty second', 'twenty third', 'twenty fourth', 'twenty fifth', 'twenty sixth',
  'twenty seventh', 'twenty eighth', 'twenty ninth', 'thirtieth', 'thirty first']
const suffix = n => n >= 11 && n <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th')
test('v2 equates exactly the first thirty-one ordinal spellings, preserving their value', () => {
  assert.equal(LISTENING_SEGMENT_RULE.normalizationVersion, 'listening-equivalences-v5')
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
    assert.ok(![...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
  }
})
test('unequal ordinals, clocks, years, amounts and negation remain critical differences', () => {
  for (const [a,b] of [['first','2nd'], ['third','4th'], ['twenty first','22nd'],
    ['at 7:30','at 7:13'], ['at 7:30 pm','at 7:30 am'], ['in 2026','in twenty twenty-seven'],
    ['$25','$26'], ['folder to','folder not to'], ['too','two'], ['at 09:30','at 931'],
    ['at 7:30','at 7.31']]) {
    const result = evaluate(a,b)
    assert.equal(result.decision, result.issues.includes('BODY_ALIGNMENT_LOW') ? 'review_required' : 'usable', `${a} / ${b}`)
    assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'), `${a} / ${b}: ${result.issues}`)
  }
})
test('only a source colon clock licenses compact, decimal and spaced ASR clock forms', () => {
  for (const [source, forms] of [
    ['10:35', ['1035', '10.35', '10 35', 'ten thirty-five']],
    ['9:35', ['935', '0935', '9.35', '9 35', 'nine thirty-five']],
    ['9:05', ['905', '0905', '9.05', '9 05', 'nine oh five']],
    ['9:00', ['900', '0900', '9.00', '9 00', "nine o'clock"]],
  ]) for (const actual of forms) {
    const result = evaluate(`at ${source}`, `at ${actual}`)
    assert.equal(result.decision, 'usable', `${source} / ${actual}: ${result.issues}`)
    assert.ok(![...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
  }
  for (const [source, actual] of [
    ['10.35', '1035'], ['1035', 'ten thirty-five'], ['10 35', '1035'],
    ['10:35', '10.36'], ['10:35', '1036'], ['10:35', '10 36'],
    ['10:35', '$10.35'], ['10:35', '10350'], ['10:35', '11035'],
    ['25:35', '2535'], ['10:65', '1065'], ['in 2026', 'in 20 26'],
  ]) {
    const result = evaluate(source, actual)
    assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'), `${source} / ${actual}`)
  }
})
test('complete meridiem clocks keep precedence over a bare clock alias in the same group', () => {
  for (const meridiem of ['am', 'pm', 'a.m.', 'p.m.']) {
    for (const clock of ['10.35', '1035', '10 .35']) {
      const result = evaluate(`at 10:35 and at 10:35 ${meridiem}`,
        `at 10:35 and at ${clock} ${meridiem}`)
      assert.equal(result.decision, 'usable', `${clock} ${meridiem}: ${result.issues}`)
      assert.equal(result.occurrences[0].alignment.editDistance, 0)
      const qualified = result.observedWindows[0].words.filter(w => w.expressionText === `${clock} ${meridiem}`)
      assert.equal(qualified.length, 4)
      assert.ok(qualified.every(w => w.expressionType === 'time'))
    }
  }
})

test('a bare clock in another source group cannot intercept a complete meridiem clock', () => {
  for (const meridiem of ['am', 'pm', 'a.m.', 'p.m.']) {
    const groups = [
      { segmentId: 'listening-text-1', questionNumbers: [1], text: 'We meet at 10:35 beside the quiet harbor today' },
      { segmentId: 'listening-text-2', questionNumbers: [2], text: `We arrive at 10:35 ${meridiem} beside the village garden today` },
    ]
    const parts = groups[1].text.replace('10:35', '10.35').split(' ')
    const end = 2 + parts.length * .2
    const result = evaluateListeningEngine({ groups: [groups[1]], corpus: groups, windows: [windowFor(parts)],
      instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}], durationSeconds: 100,
      pauses: [{startSeconds: 1, endSeconds: 1.95}, {startSeconds: end + .05, endSeconds: end + 1}],
    }).groups[0]
    assert.equal(result.decision, 'usable', `${meridiem}: ${result.issues}`)
    assert.equal(result.occurrences[0].alignment.editDistance, 0)
    assert.ok(!result.observedWindows[0].words.some(w => w.expressionType === 'source_clock_alias'))
  }
})

test('source-licensed clock aliases retain raw timing and never cross invalid acoustic boundaries', () => {
  const group = { segmentId: 'listening-text-1', questionNumbers: [1],
    text: 'We arrive at 10:35 beside the quiet village harbor today' }
  const run = window => evaluateListeningEngine({ groups: [group], windows: [window],
    instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}], durationSeconds: 100 }).groups[0]
  for (const parts of [['10', '.35'], ['10', '35'], ['1035']]) {
    const raw = windowFor(['We', 'arrive', 'at', ...parts, 'beside', 'the', 'quiet', 'village', 'harbor', 'today'])
    const result = run(raw)
    assert.equal(result.occurrences[0].alignment.editDistance, 0)
    const clock = result.observedWindows[0].words.filter(w => w.expressionType === 'source_clock_alias')
    assert.deepEqual(clock.map(w => w.token), ['ten', 'thirty', 'five'])
    assert.ok(clock.every(w => w.rawRunText === parts.join(' ') && w.expressionText === parts.join(' ')))
    assert.ok(clock.every(w => w.runStartSeconds === 2.6 && w.runEndSeconds === 2 + (3 + parts.length) * .2))
  }
  for (const edit of [
    words => { words[4].start += 3; words[4].end += 3 },
    words => { words[4].end = NaN },
    words => { words[4].start = 1; words[4].end = 1.5 },
  ]) {
    const raw = windowFor(['We', 'arrive', 'at', '10', '.35', 'beside', 'the', 'quiet', 'village', 'harbor', 'today'])
    edit(raw.result.segments[0].words)
    assert.ok(!run(raw).observedWindows[0].words.some(w => w.expressionType === 'source_clock_alias'))
  }
  const raw = windowFor(['We', 'arrive', 'at', '10', '.35', 'beside', 'the', 'quiet', 'village', 'harbor', 'today'])
  const words = raw.result.segments[0].words
  raw.result.segments = [words.slice(0, 4), words.slice(4)].map(part => ({ words: part }))
  assert.ok(!run(raw).observedWindows[0].words.some(w => w.expressionType === 'source_clock_alias'))
})

test('a clock in a different source group cannot turn this group quantity into a time', () => {
  const groups = [
    { segmentId: 'listening-text-1', questionNumbers: [1], text: 'We meet at 10:35 tomorrow beside the village harbor' },
    { segmentId: 'listening-text-2', questionNumbers: [2],
      text: 'Our club welcomes young readers beside the village harbor with 1035 books inside a quiet reading room where children study together every day' },
  ]
  for (const [actual, equal] of [[groups[1].text, true],
    [groups[1].text.replace('1035', 'one thousand thirty-five'), true],
    [groups[1].text.replace('1035', 'ten thirty-five'), false]]) {
    const result = evaluateListeningEngine({ groups: [groups[1]], corpus: groups, windows: [windowFor(actual.split(' '))],
      instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}], durationSeconds: 100 }).groups[0]
    assert.equal(result.occurrences[0].alignment.editDistance === 0, equal, actual)
    assert.equal([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'), !equal, actual)
  }
})
for (const [source, actual] of [['by 2026', 'by 20:26'], ['before 2013', 'before 20:13'],
  ['in 2026', 'in 20 26']]) {
  test(`a year cannot equal a time or separate numeric runs: ${source} / ${actual}`, () => {
    const result = evaluate(source, actual)
    assert.equal(result.decision, result.issues.includes('BODY_ALIGNMENT_LOW') ? 'review_required' : 'usable')
    assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
  })
}
test('year literals accept explicit word readings in either direction, including and', () => {
  for (const [a, b] of [['by 2026', 'by twenty twenty-six'],
    ['before 2013', 'before two thousand and thirteen'], ['in 2026', 'in two thousand and twenty-six']]) {
    for (const [source, actual] of [[a, b], [b, a]]) assert.equal(evaluate(source, actual).decision, 'usable')
  }
})
test('mixed digits and words cannot masquerade as a year even when their expanded tokens coincide', () => {
  for (const actual of ['in 2 thousand 26', 'in two thousand 26', 'in twenty 26', 'in 20 twenty-six']) {
    for (const [source, target] of [['in 2026', actual], [actual, 'in 2026']]) {
      const result = evaluate(source, target)
      assert.equal(result.decision, 'review_required', `${source} / ${target}`)
      assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
    }
  }
})
test('timed tokens retain original year, time, cardinal and ordinal expression types', () => {
  for (const [text, type] of [['in 2026', 'year'], ['at 20:26', 'time'], ['in 20 26', 'cardinal'],
    ['the 21st', 'ordinal'], ['in twenty twenty-six', 'year']]) {
    const words = listeningAsrTokens([windowFor(text.split(' '))]).words.slice(1)
    assert.ok(words.length && words.every(w => w.expressionType === type), text)
  }
})
test('a four-digit literal licenses year rewriting; identical expressions remain unchanged', () => {
  for (const text of ['in 2026', 'in twenty twenty-six', 'in two thousand and twenty-six']) {
    assert.equal(evaluate(text, text).decision, 'usable')
  }
  const result = evaluate('in twenty twenty-six', 'in two thousand and twenty-six')
  assert.equal(result.decision, result.issues.includes('BODY_ALIGNMENT_LOW') ? 'review_required' : 'usable')
  assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
  assert.deepEqual(normal('2026.'), normal('twenty twenty-six.'))
})

test('v3 expands finite negative auxiliaries and preserves not', () => {
  for (const [a, b] of [["doesn't", 'does not'], ["don't", 'do not'], ["isn't", 'is not'],
    ["aren't", 'are not'], ["wasn't", 'was not'], ["weren't", 'were not'],
    ["didn't", 'did not'], ["hasn't", 'has not'], ["haven't", 'have not'],
    ["hadn't", 'had not'], ["can't", 'can not'], ['cannot', 'can not'],
    ["won't", 'will not'], ["shan't", 'shall not'], ["wouldn't", 'would not'],
    ["shouldn't", 'should not'], ["couldn't", 'could not'], ["mustn't", 'must not'],
    ["mightn't", 'might not'], ["needn't", 'need not'], ["oughtn't", 'ought not']]) {
    assert.deepEqual(normal(a), normal(b), `${a} / ${b}`)
    for (const [source, actual] of [[a, b], [b, a]]) assert.equal(evaluate(source, actual).decision, 'usable')
    for (const [source, actual] of [[a, b.replace(' not', '')], [b.replace(' not', ''), a]]) {
      const result = evaluate(source, actual)
      assert.equal(result.decision, result.issues.includes('BODY_ALIGNMENT_LOW') ? 'review_required' : 'usable')
      assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'), `${source} / ${actual}`)
    }
  }
})
test('unambiguous positive contractions expand before exact anchors and body alignment', () => {
  for (const [a, b] of [["I'm afraid", 'I am afraid'], ["you’re welcome", 'you are welcome'],
    ["we're ready", 'we are ready'], ["they're waiting", 'they are waiting'],
    ["you've improved", 'you have improved'], ["I'll attend", 'I will attend'],
    ["we’ve finished", 'we have finished'], ["I'd be glad", 'I would be glad'],
    ["she'd been waiting", 'she had been waiting'], ["I'd better leave", 'I had better leave']]) {
    assert.deepEqual(normal(a), normal(b), `${a} / ${b}`)
    assert.equal(evaluate(a, b).decision, 'usable')
  }
})
test('s contractions expand only in determinate local contexts; possessives and ambiguous predicates remain differences', () => {
  for (const [a, b] of [["the city's been focusing", 'the city has been focusing'],
    ["he's been working", 'he has been working'], ["she's being careful", 'she is being careful'],
    ["what's wrong", 'what is wrong'], ["it's our anniversary", 'it is our anniversary']]) {
    assert.deepEqual(normal(a), normal(b))
    assert.equal(evaluate(a, b).decision, 'usable')
  }
  for (const [a, b] of [["John's running", 'John is running'], ["it's gone", 'it has gone'],
    ["he's finished", 'he is finished'], ["the city's park", 'the city is park'],
    ["she'd read", 'she had read'], ["she'd read", 'she would read'],
    ["he's. Been waiting", 'he has been waiting']]) assert.notDeepEqual(normal(a), normal(b), `${a} / ${b}`)
  const ambiguous = evaluate("it's finished", 'it has finished')
  assert.ok(ambiguous.occurrences[0].alignment.differences.length)
  assert.ok(!ambiguous.issues.some(code => code.startsWith('CRITICAL_WORD')))
})
test('expanded contractions retain the whole acoustic run and cannot create internal playback boundaries', () => {
  const words = listeningAsrTokens([windowFor(["I'm", 'afraid', "doesn't", "we'll"])]).words
  assert.deepEqual(words.map(w => w.token), normal('I am afraid does not we will'))
  for (const token of ["I'm", "doesn't", "we'll"]) {
    const expanded = words.filter(w => w.rawRunText === token)
    assert.equal(expanded.length, 2)
    assert.equal(expanded[0].startBoundary, true)
    assert.equal(expanded[0].endBoundary, false)
    assert.equal(expanded[1].startBoundary, false)
    assert.equal(expanded[1].endBoundary, true)
    assert.equal(expanded[0].runStartSeconds, expanded[1].runStartSeconds)
    assert.equal(expanded[0].runEndSeconds, expanded[1].runEndSeconds)
  }
})
test('exact heads accept contracted source and expanded ASR without fuzzy matching', () => {
  for (const [source, actual] of [["I'm afraid I have to bring the blue folder home today", 'I am afraid I have to bring the blue folder home today'],
    ["Hey Leo you've improved a lot in physics this year", 'Hey Leo you have improved a lot in physics this year']]) {
    const raw = windowFor(actual.split(' ')), end = raw.result.segments[0].end
    const result = evaluateListeningEngine({groups: [{segmentId: 'listening-text-1', questionNumbers: [1], text: source}],
      instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}], windows: [raw],
      durationSeconds: 100, pauses: [{startSeconds: 1, endSeconds: 1.95}, {startSeconds: end + 0.05, endSeconds: end + 1}]}).groups[0]
    assert.equal(result.decision, 'usable', result.issues.join(','))
    assert.equal(result.anchors.mode, 'exact')
  }
})
test('context-bound contractions never cross invalid timestamps, long pauses or segment boundaries', () => {
  for (const edit of [
    words => { words[1].start += 3; words[1].end += 3 },
    words => { words[1].end = NaN },
    words => { words[1].start = 1; words[1].end = 1.5 },
  ]) {
    const raw = windowFor(["city's", 'been', 'focusing'])
    edit(raw.result.segments[0].words)
    assert.ok(!listeningAsrTokens([raw]).words.some(w => w.token === 'has'))
  }
  const raw = windowFor(["he's", 'been'])
  raw.result.segments = raw.result.segments[0].words.map(word => ({text: word.word, words: [word]}))
  assert.ok(!listeningAsrTokens([raw]).words.some(w => w.token === 'has'))
  for (const [source, target] of [["he's being", 'he has being'], ["city's been", 'city is been'],
    ["he'd been", 'he would been'], ["he'd be", 'he had be'],
    ["what's wrong", 'what has wrong'], ["it's our anniversary", 'it has our anniversary']]) {
    assert.notDeepEqual(normal(source), normal(target))
    assert.ok(evaluate(source, target).occurrences[0].alignment.differences.length)
  }
})
test('all nine modal auxiliaries are critical for deletion, insertion and substitution', () => {
  for (const word of ['will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must']) {
    for (const [source, actual] of [[`we ${word} go`, 'we go'], ['we go', `we ${word} go`],
      [`we ${word} go`, 'we often go'], ['we often go', `we ${word} go`]]) {
      const result = evaluate(source, actual)
      assert.equal(result.decision, result.issues.includes('BODY_ALIGNMENT_LOW') ? 'review_required' : 'usable', `${source} / ${actual}`)
      assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
    }
  }
  for (const [a, b] of [["we'll go", 'we go'], ["we'd be glad", 'we are glad']]) {
    for (const [source, actual] of [[a, b], [b, a]]) {
      const result = evaluate(source, actual)
      assert.ok([...result.issues, ...result.notes].includes('CRITICAL_WORD_DIFFERENCE'))
    }
  }
  for (const [a, b] of [["we'll go", 'we will go'], ["we'd go", 'we would go'],
    ["we'd been waiting", 'we had been waiting']]) {
    for (const [source, actual] of [[a, b], [b, a]]) assert.equal(evaluate(source, actual).decision, 'usable')
  }
})

test('hyphen compounds accept only exact joined or spaced spellings in either direction', () => {
  for (const [a, b] of [['second-hand', 'secondhand'], ['second-hand', 'second hand'],
    ['Second-Hand', 'SECONDHAND'], ['well-known', 'wellknown'],
    ['state-of-the-art', 'stateoftheart'], ['state-of-the-art', 'state of the art']]) {
    for (const [source, actual] of [[a, b], [b, a]]) {
      const result = evaluate(source, actual)
      assert.equal(result.occurrences[0].alignment.editDistance, 0, `${source} / ${actual}`)
      assert.equal(result.decision, 'usable', `${source} / ${actual}: ${result.issues}`)
    }
  }
  for (const [a, b] of [['second-hand', 'second'], ['secondhand', 'second hard'],
    ['second-hand', 'second hard'], ['secondhand', 'second hand']]) {
    for (const [source, actual] of [[a, b], [b, a]]) {
      assert.ok(evaluate(source, actual).occurrences[0].alignment.editDistance > 0, `${source} / ${actual}`)
    }
  }
})

test('compound spans retain raw runs and cannot cross invalid timing, silence or segments', () => {
  const source = 'Bright birds gather around our second-hand shop beside the peaceful village harbor today'
  const run = raw => evaluateListeningEngine({ groups: [{segmentId: 'listening-text-1', questionNumbers: [1], text: source}],
    windows: [raw], instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}], durationSeconds: 100 }).groups[0]
  for (const spelling of ['secondhand', 'second-hand', 'second hand', 'second -hand', 'second- hand']) {
    const raw = windowFor(source.replace('second-hand', spelling).split(' '))
    const words = run(raw).observedWindows[0].words.filter(w => w.compoundValue === 'secondhand')
    assert.deepEqual(words.map(w => w.token), ['second', 'hand'])
    assert.ok(words.every(w => w.rawRunText === spelling))
    assert.ok(words.every(w => w.runStartSeconds === words[0].runStartSeconds
      && w.runEndSeconds === words[0].runEndSeconds))
  }
  for (const edit of [
    words => { words[6].start += 3; words[6].end += 3 },
    words => { words[6].end = NaN },
    words => { words[6].start = 1; words[6].end = 1.5 },
  ]) {
    const raw = windowFor(source.replace('second-hand', 'second hand').split(' '))
    edit(raw.result.segments[0].words)
    const result = run(raw)
    assert.ok(result.occurrences.every(o => o.alignment.editDistance > 0))
    assert.ok(!result.observedWindows[0].words.some(w => w.compoundValue))
  }
  const raw = windowFor(source.replace('second-hand', 'second hand').split(' '))
  const words = raw.result.segments[0].words
  raw.result.segments = [words.slice(0, 6), words.slice(6)].map(words => ({words}))
  assert.ok(run(raw).occurrences[0].alignment.editDistance > 0)
  assert.ok(!run(raw).observedWindows[0].words.some(w => w.compoundValue))
})

test('compound expansion never grants an internal token a playback boundary', () => {
  const aliases = [{pattern: 'secondhand|second-hand|second\\s+hand',
    matches: /^(?:secondhand|second-hand|second\s+hand)$/iu,
    compoundValue: 'secondhand', tokens: ['second', 'hand']}]
  for (const parts of [['secondhand'], ['second-hand'], ['second', 'hand']]) {
    const words = listeningAsrTokens([windowFor(parts)], aliases).words
    assert.deepEqual(words.map(w => w.token), ['second', 'hand'])
    assert.equal(words[0].startBoundary, true)
    assert.equal(words[0].endBoundary, false)
    assert.equal(words[1].startBoundary, false)
    assert.equal(words[1].endBoundary, true)
    assert.equal(words[0].runStartSeconds, words[1].runStartSeconds)
    assert.equal(words[0].runEndSeconds, words[1].runEndSeconds)
    assert.ok(words.every(w => w.rawRunText === parts.join(' ')))
  }
})

test('reconciliation uses each engine normalization context for the same source', () => {
  const text = 'Bright birds gather around our quiet secondhand shop beside the peaceful village harbor today'
  const engine = (actual, name) => {
    const window = windowFor(actual.split(' '))
    return evaluateListeningEngine({groups: [{segmentId: 'listening-text-1', questionNumbers: [1], text}],
      windows: [window], engine: name, durationSeconds: 100,
      instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}],
      pauses: [{startSeconds: 1, endSeconds: 1.95},
        {startSeconds: window.result.segments[0].end + .05, endSeconds: window.result.segments[0].end + 1}]})
  }
  const joined = engine(text, 'Apple SpeechAnalyzer')
  const hyphen = engine(text.replace('secondhand', 'second-hand'), 'faster-whisper')
  for (const pair of [[joined, hyphen], [hyphen, joined]]) {
    const result = reconcileListeningEngines(...pair)[0]
    assert.equal(result.decision, 'usable', JSON.stringify(result.engineConflicts))
    assert.ok(!result.engineNotes.some(n => n.kind === 'observed_critical_word_difference'))
  }
})

test('a different source group cannot license an unhyphenated word split here', () => {
  const text = 'Bright birds gather around our quiet secondhand shop beside the peaceful village harbor today'
  const group = {segmentId: 'listening-text-1', questionNumbers: [1], text}
  const other = {segmentId: 'listening-text-2', questionNumbers: [2], text: 'A second-hand book'}
  const result = evaluateListeningEngine({groups: [group], corpus: [group, other],
    windows: [windowFor(text.replace('secondhand', 'second hand').split(' '))], durationSeconds: 100,
    instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}]}).groups[0]
  assert.ok(result.occurrences[0].alignment.editDistance > 0)
})

test('an ASR hyphen attached to either adjacent run licenses the joined source', () => {
  const text = 'Bright birds gather around our quiet secondhand shop beside the peaceful village harbor today'
  for (const spelling of ['second -hand', 'second- hand']) {
    const window = windowFor(text.replace('secondhand', spelling).split(' '))
    window.result.segments[0].text = text.replace('secondhand', 'second-hand')
    const result = evaluateListeningEngine({groups: [{segmentId: 'listening-text-1', questionNumbers: [1], text}],
      windows: [window], durationSeconds: 100,
      instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}]}).groups[0]
    assert.equal(result.occurrences[0].alignment.editDistance, 0)
  }
})

const halfPastSentence = phrase => `Bright birds gather around our quiet garden at ${phrase} beside the peaceful village harbor today`
function halfPastEngine(source, actual, candidate, engine = 'Apple SpeechAnalyzer') {
  const text = halfPastSentence(source)
  const group = {segmentId: 'listening-text-1', questionNumbers: [1], text}
  const window = windowFor(halfPastSentence(actual).split(' '))
  if (candidate === 'segment') window.result.segments[0].text = halfPastSentence('half-past seven')
  const corpus = [group, ...(candidate === 'other-group'
    ? [{segmentId: 'listening-text-2', questionNumbers: [2], text: 'Meet at half-past seven'}] : [])]
  return evaluateListeningEngine({groups: [group], corpus, windows: [window], engine, durationSeconds: 100,
    instructions: [{slotId: 'listening.short-dialogue', text: '读一遍'}],
    pauses: [{startSeconds: 1, endSeconds: 1.95},
      {startSeconds: window.result.segments[0].end + .05, endSeconds: window.result.segments[0].end + 1}]})
}
for (const candidate of ['segment', 'other-group']) {
  test(`a ${candidate} half-past candidate cannot license an unhyphenated time rewrite`, () => {
    for (const [source, actual] of [['half past seven', 'halfpast seven'], ['halfpast seven', 'half past seven']]) {
      const baseline = halfPastEngine(source, actual).groups[0]
      const result = halfPastEngine(source, actual, candidate).groups[0]
      assert.equal(baseline.decision, 'review_required')
      assert.ok(result.occurrences[0].alignment.editDistance > 0, `${source} / ${actual}`)
      assert.equal(result.decision, 'review_required', `${source} / ${actual}`)
    }
  })
}
test('time rewrites retain compound licensing in both engine observation directions', () => {
  for (const [source, actual] of [['half past seven', 'halfpast seven'], ['halfpast seven', 'half past seven']]) {
    const reference = halfPastEngine(source, source)
    const observed = halfPastEngine(source, actual, 'segment', 'faster-whisper')
    for (const pair of [[reference, observed], [observed, reference]]) {
      const result = reconcileListeningEngines(...pair)[0]
      const notes = [...result.engineNotes, ...result.engineConflicts]
      assert.ok(notes.some(n => n.kind === 'observed_critical_word_difference'), `${source} / ${actual}`)
    }
  }
})
test('half-past candidates preserve ordinary clock equivalence and literal hyphen permission', () => {
  for (const [source, actual] of [['half past seven', '7:30'], ['7:30', 'half past seven'],
    ['half-past seven', 'halfpast seven'], ['halfpast seven', 'half-past seven'],
    ['half-past seven', '7:30'], ['7:30', 'half-past seven']]) {
    const result = halfPastEngine(source, actual, 'segment').groups[0]
    assert.equal(result.occurrences[0].alignment.editDistance, 0, `${source} / ${actual}`)
    assert.equal(result.decision, 'usable', `${source} / ${actual}`)
  }
})
