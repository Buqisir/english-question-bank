import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSourceFlagTargets } from './text-review-parts.mjs'
import { applySpellingReview, isSourceMarkCorrection, listeningEditTurns, prepareSpellingReview, SPELLING_REVIEW_POLICY, TEXT_REVIEW_POLICY_V2, TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V4, verifyListeningEditOccurrences, verifyListeningInsertionOccurrences } from '../../server/paper-import/spellingReview.mjs'
import { mapSourceEmphasisEdits } from '../../server/paper-canonical/sourceEmphasis.mjs'

const at = (text, flag) => findSourceFlagTargets([{ before: text }], flag).flatMap(hit => hit.at)

function listeningInsertionFixture(text, afterSentence) {
  const transcript = [{ segmentId: 'listening-text-1', text }]
  const bytes = Buffer.from(JSON.stringify({ listening: { state: 'captured', transcript } }))
  const report = prepareSpellingReview(bytes)
  report.reviewedBy = 'import_agent'
  report.reviewedAt = '2026-11-19T00:00:00Z'
  report.targets[0].decision = 'unchanged'
  const audio = { sha256: `sha256:${'a'.repeat(64)}`, durationSeconds: 60 }
  const evidence = { segmentId: 'listening-text-1', afterSentence,
    text: 'It is my favorite part of the day.', model: 'gpt-transcribe',
    audioSha256: audio.sha256, startSeconds: 20, endSeconds: 24, occurrence: { startSeconds: 10, endSeconds: 30 } }
  const withInsertion = insertion => Buffer.from(JSON.stringify({ ...report, listeningInsertions: [insertion] }))
  const apply = insertion => applySpellingReview(bytes, withInsertion(insertion), audio)
  return { audio, evidence, withInsertion, apply }
}

test('recording evidence allows inserting missing sentences with the expected speakers', () => {
  const { audio, evidence, withInsertion, apply } = listeningInsertionFixture(
    'W: I agree. We should go.\nM: What else should I do?', 'We should go.')

  assert.equal(apply(evidence).listening.transcript[0].text,
    'W: I agree. We should go. It is my favorite part of the day.\nM: What else should I do?')
  assert.throws(() => apply({ ...evidence, before: 'I agree.' }), /listening insertion/)
  assert.equal(apply({ ...evidence, text: 'M:Why? I am curious.' }).listening.transcript[0].text,
    'W: I agree. We should go.\nM:Why? I am curious.\nM: What else should I do?')
  assert.throws(() => apply({ ...evidence, endSeconds: 31 }), /outside the reviewed occurrence/)
  const review = { subject: { playbackAudioSha256: audio.sha256 }, groups: [
    { segmentId: evidence.segmentId, decision: 'usable', occurrences: [evidence.occurrence] },
    { segmentId: 'listening-text-2', decision: 'usable', occurrences: [{ startSeconds: 30, endSeconds: 50 }] },
  ] }
  verifyListeningInsertionOccurrences(withInsertion(evidence), () => review)
  assert.throws(() => verifyListeningInsertionOccurrences(withInsertion({
    ...evidence, startSeconds: 35, endSeconds: 38, occurrence: review.groups[1].occurrences[0],
  }), () => review), /match a reviewed occurrence of listening-text-1/)
  for (const key of ['model', 'audioSha256', 'startSeconds', 'endSeconds']) {
    assert.throws(() => apply({ ...evidence, [key]: undefined }), /listening insertion/)
  }
  assert.throws(() => apply({ ...evidence, audioSha256: `sha256:${'b'.repeat(64)}` }), /playback hash/)
  assert.throws(() => apply({ ...evidence, endSeconds: 61 }), /audio interval/)
})

test('recording insertions reject ambiguous boundaries and changes to displayed sentences or speakers', () => {
  for (const [source, afterSentence, text, error] of [
    ['W: I met Capt. Smith.', 'I met Capt.', 'It snowed.', /sentence boundary/],
    ['W: I met Gov. Smith.', 'I met Gov.', 'It snowed.', /sentence boundary/],
    ['W: I climbed Mt. Everest.', 'I climbed Mt.', 'It snowed.', /sentence boundary/],
    ['W: Take the No. 5 bus.', 'Take the No.', 'It snowed.', /sentence boundary/],
    ['W: I agree. I will go.', 'I agree.', 'M:Why?', /expected sentences or speakers/],
    ['W: I agree.\nM: I will go.', 'I agree.', 'M：Why?', /expected sentences or speakers/],
    ['W: I agree', 'I agree', 'It snowed.', /sentence boundary/],
  ]) {
    const { evidence, apply } = listeningInsertionFixture(source, afterSentence)
    assert.throws(() => apply({ ...evidence, text }), error, `${source} + ${text}`)
  }
})

test('listening edits bind UTF-16 coordinates after spelling and retained insertions', () => {
  const text = 'W: 😀 I agre. We should go.\nM: Did you really already leave today?'
  const original = {
    paperId: 'paper-listening-edit',
    listening: { state: 'captured', transcript: [{ segmentId: 'listening-text-1', text }] },
    groups: [{ groupId: 'g', questions: [{ questionId: 'q', number: 1, options: [{ label: 'A', text: 'Yes' }] }] }],
    answers: [{ questionId: 'q', value: 'A' }],
  }
  const bytes = Buffer.from(JSON.stringify(original))
  const report = prepareSpellingReview(bytes)
  report.reviewedBy = 'import_agent'
  report.reviewedAt = '2026-11-20T00:00:00Z'
  for (const target of report.targets) target.decision = 'unchanged'
  Object.assign(report.targets.find(target => target.before === text), { decision: 'correct', corrections: [{
    start: text.indexOf('agre'), before: 'agre', after: 'agree', category: 'spelling', certainty: 'unambiguous', reason: '拼写。',
  }] })
  const { audio, evidence: insertion } = listeningInsertionFixture(text, 'We should go.')
  report.listeningInsertions = [insertion]
  const encode = extra => Buffer.from(JSON.stringify({ ...report, ...extra }))
  const baseline = applySpellingReview(bytes, encode(), audio).listening.transcript[0].text
  assert.equal(baseline, 'W: 😀 I agree. We should go. It is my favorite part of the day.\nM: Did you really already leave today?')
  const edit = (start, before, after, heard) => ({
    segmentId: insertion.segmentId, start, before, after, audioSha256: audio.sha256,
    startSeconds: 12, endSeconds: 15, occurrence: insertion.occurrence,
    evidence: { apple: heard, 'parakeet-v2': heard }, reason: '两家转写一致。',
  })
  const edits = [
    edit(baseline.indexOf('leave'), '', 'just ', 'Did you really already just leave today?'),
    edit(baseline.indexOf('go.'), 'go', 'walk', 'We should walk. It is'),
    edit(baseline.indexOf('already'), 'already ', '', 'Did you really leave today?'),
  ]
  const reportBytes = encode({ listeningEdits: edits })
  const effective = applySpellingReview(bytes, reportBytes, audio)
  assert.deepEqual(effective, { ...original, listening: { ...original.listening, transcript: [{
    segmentId: insertion.segmentId,
    text: 'W: 😀 I agree. We should walk. It is my favorite part of the day.\nM: Did you really just leave today?',
  }] } })
  const review = { subject: { playbackAudioSha256: audio.sha256 }, groups: [
    { segmentId: insertion.segmentId, decision: 'usable', occurrences: [insertion.occurrence] },
  ] }
  verifyListeningEditOccurrences(reportBytes, review, () => assert.fail('current occurrence should be sufficient'))
  verifyListeningEditOccurrences(reportBytes, null, () => review)
  assert.throws(() => verifyListeningEditOccurrences(reportBytes, null), /match a reviewed occurrence/)
  const apply = (...listeningEdits) => applySpellingReview(bytes, encode({ listeningEdits }), audio)
  assert.throws(() => apply(edits[1], edit(edits[1].start, 'go. It', 'walk. It', 'We should walk. It is my')), /overlapping/)
  assert.throws(() => apply({ ...edits[1], before: 'no' }), /before does not match/)
  assert.throws(() => apply({ ...edits[0], start: baseline.length + 1 }), /before does not match/)
  assert.throws(() => apply({ ...edits[1], segmentId: 'other-paper-segment' }), /before does not match/)
  assert.throws(() => apply({ ...edits[1], audioSha256: `sha256:${'b'.repeat(64)}` }), /playback hash/)
  assert.throws(() => apply({ ...edits[1], endSeconds: 31 }), /outside the reviewed occurrence/)
  assert.throws(() => apply({ ...edits[2], evidence: { ...edits[2].evidence, apple: 'Did you really already leave today?' } }),
    /two engines/)
})

test('Text 7 insertions reject replay against a restored transcript and require adjacent evidence', () => {
  const base = 'W: We know that birds sing quieter on the weekend mornings.'
  const after = ' Here, I’ve recorded a call. Listen for the difference.'
  const { audio, evidence } = listeningInsertionFixture(base, null)
  const apply = (text, heard, start = base.length) => {
    const bytes = Buffer.from(JSON.stringify({ listening: { state: 'captured',
      transcript: [{ segmentId: 'listening-text-7', text }] } }))
    const report = prepareSpellingReview(bytes)
    report.reviewedBy = 'import_agent'
    report.reviewedAt = '2026-11-20T00:00:00Z'
    report.targets[0].decision = 'unchanged'
    report.listeningEdits = [{
      segmentId: 'listening-text-7', start, before: '', after,
      audioSha256: audio.sha256, startSeconds: evidence.startSeconds, endSeconds: evidence.endSeconds,
      occurrence: evidence.occurrence, evidence: { apple: heard, 'parakeet-v2': heard }, reason: '补录两句。',
    }]
    return applySpellingReview(bytes, Buffer.from(JSON.stringify(report)), audio)
  }
  const heard = `weekend mornings.${after}`
  assert.equal(apply(base, heard).listening.transcript[0].text, base + after)
  const restored = `${base}${after.toUpperCase().replace('’', "'")}`
  assert.throws(() => apply(restored, heard), /two engines/)
  assert.throws(() => apply(restored, heard, restored.length), /two engines/)
  assert.throws(() => apply(`${base} W: What happened?`, heard), /two engines/)
  assert.throws(() => apply(base, `Wrong place.${after}`), /two engines/)
})

function applyListeningEditFixture(source, start, before, after, heard) {
  const { audio, evidence } = listeningInsertionFixture(source, null)
  const bytes = Buffer.from(JSON.stringify({ listening: { state: 'captured',
    transcript: [{ segmentId: evidence.segmentId, text: source }] } }))
  const report = prepareSpellingReview(bytes)
  report.reviewedBy = 'import_agent'
  report.reviewedAt = '2026-11-20T00:00:00Z'
  report.targets[0].decision = 'unchanged'
  report.listeningEdits = [{
    segmentId: evidence.segmentId, start, before, after, audioSha256: audio.sha256,
    startSeconds: evidence.startSeconds, endSeconds: evidence.endSeconds, occurrence: evidence.occurrence,
    evidence: { apple: heard, 'parakeet-v2': heard }, reason: '按录音更正。',
  }]
  return applySpellingReview(bytes, Buffer.from(JSON.stringify(report)), audio).listening.transcript[0].text
}

test('listening edits require the complete evidence to identify exactly the declared occurrence', () => {
  const text = 'I can go today. I can go tomorrow.'
  const apply = applyListeningEditFixture
  const heard = 'I can not go tomorrow'
  assert.throws(() => apply(text, text.indexOf('go'), '', 'not ', heard), /two engines/)
  assert.equal(apply(text, text.lastIndexOf('go'), '', 'not ', heard), 'I can go today. I can not go tomorrow.')
  assert.throws(() => apply('I can go today.', 2, 'can', 'could', 'I could go tomorrow'), /two engines/)
  assert.throws(() => apply('I can go today.', 2, 'can ', '', 'I go tomorrow'), /two engines/)
  const repeated = 'Today I can go home. Tomorrow I can go home.'
  for (const start of [repeated.indexOf('go'), repeated.lastIndexOf('go')]) {
    assert.throws(() => apply(repeated, start, '', 'not ', 'I can not go home'), /two engines/)
  }
  const distinct = 'Tomorrow, I can not go home.'
  assert.throws(() => apply(repeated, repeated.indexOf('go'), '', 'not ', distinct), /two engines/)
  assert.equal(apply(repeated, repeated.lastIndexOf('go'), '', 'not ', distinct),
    'Today I can go home. Tomorrow I can not go home.')
})

test('whole-turn edits bind the original turn and use ordered evidence without adjacent anchors', () => {
  const text = 'W: We walk to work.\nM: I agre. Could you carry these over to the car today?\nW: I will help.'
  const inline = text.replaceAll('\n', ' ')
  assert.deepEqual(listeningEditTurns(inline).map(({ start, end }) => inline.slice(start, end)),
    ['We walk to work.', 'I agre. Could you carry these over to the car today?', 'I will help.'])
  const before = 'I agre. Could you carry these over to the car today?'
  const after = 'Of course. Could you take those things into the car today?'
  const { audio, evidence } = listeningInsertionFixture(text, null)
  const bytes = Buffer.from(JSON.stringify({ listening: { state: 'captured', transcript: [{ segmentId: evidence.segmentId, text }] } }))
  const report = prepareSpellingReview(bytes)
  Object.assign(report, { reviewedBy: 'import_agent', reviewedAt: '2026-11-20T00:00:00Z' })
  Object.assign(report.targets[0], { decision: 'correct', corrections: [
    { start: text.indexOf('walk'), before: 'walk', after: 'walked', category: 'spelling', certainty: 'unambiguous', reason: '拼写。' },
    { start: text.indexOf('agre'), before: 'agre', after: 'agree', category: 'spelling', certainty: 'unambiguous', reason: '拼写。' },
  ] })
  const turn = { scope: 'turn', turnIndex: 1, segmentId: evidence.segmentId, start: text.indexOf(before), before, after,
    audioSha256: audio.sha256, occurrence: evidence.occurrence, startSeconds: 14, endSeconds: 19,
    evidence: { apple: `May I join you? ${after} Sure.`, 'parakeet-v2': after.replace('those', 'these') },
    reason: '整轮替换。' }
  const apply = (...listeningEdits) => applySpellingReview(bytes, Buffer.from(JSON.stringify({ ...report, listeningEdits })), audio)
  assert.equal(apply(turn).listening.transcript[0].text, `W: We walked to work.\nM: ${after}\nW: I will help.`)
  assert.equal(apply({ ...turn, evidence: { 'faster-whisper': after, 'parakeet-v2': after } }).listening.transcript[0].text,
    `W: We walked to work.\nM: ${after}\nW: I will help.`)
  assert.throws(() => apply({ ...turn, before: 'I agre.' }), /complete original turn/)
  assert.throws(() => apply({ ...turn, before: before.replace('agre', 'agree') }), /complete original turn/)
  assert.throws(() => apply({ ...turn, turnIndex: 0 }), /complete original turn/)
  assert.throws(() => apply({ ...turn, evidence: { ...turn.evidence,
    apple: after.split(' ').reverse().join(' ') } }), /two engines/)
  assert.throws(() => apply({ ...turn, after: `${after}\nW: Sure.` }), /speaker label/)
  const { scope, turnIndex, ...local } = turn
  assert.throws(() => apply(turn, { ...local, start: text.indexOf('carry') + 3, before: 'carry', after: 'move',
    evidence: { apple: 'Could you move these over', 'parakeet-v2': 'Could you move these over' } }), /overlapping listening edits/)
  assert.throws(() => apply(turn, turn), /overlapping listening edits/)
  const applyWithInsertion = afterSentence => applySpellingReview(bytes, Buffer.from(JSON.stringify({ ...report,
    listeningInsertions: [{ ...evidence, afterSentence }], listeningEdits: [turn] })), audio)
  assert.equal(applyWithInsertion('We walked to work.').listening.transcript[0].text,
    `W: We walked to work. ${evidence.text}\nM: ${after}\nW: I will help.`)
  assert.throws(() => applyWithInsertion('I agree.'), /overlapping listening edits/)
})

test('audio that says Well cannot assign it to either side of a speaker change', () => {
  const text = 'W: Tell me more.\nM: I can explain.'
  const heard = 'Tell me more. Well, I can explain.'
  for (const start of [text.indexOf('\n'), text.indexOf('I can')]) {
    assert.throws(() => applyListeningEditFixture(text, start, '', ' Well, ', heard), /speaker change/)
  }
  const spanning = 'more.\nM: I'
  for (const after of ['', 'more. Well, I']) {
    assert.throws(() => applyListeningEditFixture(text, text.indexOf(spanning), spanning, after, heard), /speaker change/)
  }
  const same = text.replace('\nM:', '\nW:')
  assert.equal(applyListeningEditFixture(same, same.indexOf('I can'), '', 'Well, ', heard),
    'W: Tell me more.\nW: Well, I can explain.')
})

test('uncertain source phrase survives an OCR line wrap', () => {
  assert.deepEqual(at('children’s desire\nof learning can be inspired',
    { quote: 'desire of learning', decision: 'uncertain' }), [11])
})

test('source context still pins a repeated uncertain phrase', () => {
  const text = 'desire of learning. Children’s desire\nof learning can be inspired.'
  assert.deepEqual(at(text,
    { quote: 'desire of learning', decision: 'uncertain', context: 'Children’s desire of learning can be inspired.' }), [31])
})

test('corrections retain exact source offsets and whole-word boundaries', () => {
  assert.deepEqual(at('a desire\nof learning', { quote: 'desire of learning', category: 'grammar' }), [])
  assert.deepEqual(at('minds mind mindless', { quote: 'mind', category: 'grammar' }), [6])
})

test('uncertain whitespace matching cannot change words or interpret regex syntax', () => {
  assert.deepEqual(at('desire to learn', { quote: 'desire of learning', decision: 'uncertain' }), [])
  assert.deepEqual(at('A+ (B)\nC', { quote: 'A+ (B) C', decision: 'uncertain' }), [0])
  assert.deepEqual(at('AAAA B\nC', { quote: 'A+ (B) C', decision: 'uncertain' }), [])
})

test('existing exact bindings are preserved when another target wraps the phrase', () => {
  const exact = { jsonPointer: '/exact', before: 'desire of learning' }
  const wrapped = { jsonPointer: '/wrapped', before: 'desire\nof learning' }
  assert.deepEqual(findSourceFlagTargets([exact, wrapped],
    { quote: 'desire of learning', decision: 'uncertain' }), [{ target: exact, at: [0] }])
})

// Exercise the real auto CLI and final admission together, with a minimal
// source workspace. Only short Heze/Zaozhuang excerpts are retained here.
function autoFixture(text, quote, after, run, category = 'spelling') {
  const scratch = path.resolve(import.meta.dirname, '../../.scratch')
  mkdirSync(scratch, { recursive: true })
  const dir = mkdtempSync(path.join(scratch, 'eqb-spelling-flags-'))
  try {
    const materialization = { paperId: 'paper-spelling-test', documents: [], media: [],
      groups: [{ family: 'continuation-writing', blocks: [], questions: [],
        writingTask: { material: [text, text] } }] }
    const bytes = Buffer.from(JSON.stringify(materialization))
    const report = prepareSpellingReview(bytes, TEXT_REVIEW_POLICY)
    const save = (name, value) => writeFileSync(path.join(dir, name), JSON.stringify(value))
    mkdirSync(path.join(dir, 'flags'))
    save('materialization.json', materialization)
    save('config.json', { paperId: materialization.paperId })
    save('universal-source-manifest.json', { schemaVersion: 'universal-nck1-source-manifest-v1',
      paperId: materialization.paperId, documents: [], materializationPath: 'materialization.json' })
    save('request.json', { paperId: materialization.paperId, materialization, report })
    save('flags/source.json', { flags: quote === undefined ? [] : [{ quote, after, category, reason: '原印拼写有误，更正完整词形。' }] })
    const output = path.join(dir, 'review.json')
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL('./text-review-parts.mjs', import.meta.url)), 'auto',
      path.join(dir, 'request.json'), '--flags', path.join(dir, 'flags'),
      '--output', output, '--paper-dir', dir,
    ], { encoding: 'utf8' })
    run({ result, output, bytes })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('apostrophe typography survives auto and admission with exact original correction records', () => {
  const text = "😀 won’ t Grandma’ s you' re I ' ve else 's we ' ll he’ d I ' m don't."
  const after = '😀 won’t Grandma’s you’re I’ve else’s we’ll he’d I’m don’t.'
  autoFixture(text, undefined, undefined, ({ result, output, bytes }) => {
    assert.equal(result.status, 0, result.stderr)
    const review = JSON.parse(readFileSync(output))
    for (const target of review.targets) {
      assert.equal(target.decision, 'correct')
      assert.equal(target.corrections.length, 9)
      for (const correction of target.corrections) {
        assert.equal(correction.category, 'punctuation')
        assert.equal(correction.certainty, 'unambiguous')
        assert.match(correction.reason, /撇号/u)
        assert.equal(text.slice(correction.start, correction.start + correction.before.length), correction.before)
      }
    }
    assert.deepEqual(applySpellingReview(bytes, Buffer.from(JSON.stringify(review))).groups[0].writingTask.material,
      [after, after])
  })
})

test('apostrophe automation leaves other tokens and existing punctuation behavior byte-identical', () => {
  const unchanged = 'We won’t change Grandma’s text, ’90s, 7’ s, ’ s, x’ tree or x’ starter.'
  for (const [text, after] of [[unchanged, unchanged], ['word—word “ inside ”next  word', 'word – word “inside” next word']]) {
    autoFixture(text, undefined, undefined, ({ result, output, bytes }) => {
      assert.equal(result.status, 0, result.stderr)
      const reviewBytes = readFileSync(output)
      assert.deepEqual(applySpellingReview(bytes, reviewBytes).groups[0].writingTask.material, [after, after])
      if (text === unchanged) {
        assert.equal(JSON.parse(reviewBytes).targets[0].decision, 'unchanged')
        assert.equal(JSON.stringify(applySpellingReview(bytes, reviewBytes)), bytes.toString())
      }
    })
  }
})

test('retained punctuation reports replay byte-identically without adopting new apostrophe typography', () => {
  const bytes = Buffer.from(JSON.stringify({ groups: [{ questions: [{ stem: "Don't—worry." }] }] }))
  const report = prepareSpellingReview(bytes, TEXT_REVIEW_POLICY)
  report.reviewedBy = 'import_agent'
  report.reviewedAt = '2026-10-24T00:00:00Z'
  Object.assign(report.targets[0], { decision: 'correct', corrections: [
    { start: 0, before: "Don't—worry", after: "Don't – worry", category: 'punctuation',
      certainty: 'unambiguous', reason: '只规范英文破折号。' },
  ] })
  assert.equal(applySpellingReview(bytes, Buffer.from(JSON.stringify(report))).groups[0].questions[0].stem,
    "Don't – worry.")
})

test('apostrophe boundaries preserve quoted letters and possessives before hyphenated words', () => {
  const text = "The letter 's' is silent. I bought the boys' T-shirts. boys' sake; rock 'n' roll; didn ’ t."
  const after = text.replace('didn ’ t', 'didn’t')
  autoFixture(text, undefined, undefined, ({ result, output, bytes }) => {
    assert.equal(result.status, 0, result.stderr)
    const reviewBytes = readFileSync(output)
    assert.deepEqual(applySpellingReview(bytes, reviewBytes).groups[0].writingTask.material, [after, after])
    for (const target of JSON.parse(reviewBytes).targets) {
      assert.equal(target.corrections.length, 1)
      assert.equal(target.corrections[0].before, 'n ’ t')
    }
  })
})

test('apostrophe admission rejects a truncated suffix boundary in the full source target', () => {
  const bytes = Buffer.from(JSON.stringify({ groups: [{ questions: [{ stem: "A word 'stable' appears here." }] }] }))
  const report = prepareSpellingReview(bytes, TEXT_REVIEW_POLICY)
  report.reviewedBy = 'import_agent'
  report.reviewedAt = '2026-10-24T00:00:00Z'
  Object.assign(report.targets[0], { decision: 'correct', corrections: [
    { start: 5, before: "d 's", after: 'd’s', category: 'punctuation',
      certainty: 'unambiguous', reason: '伪造截短的后缀边界。' },
  ] })
  assert.throws(() => applySpellingReview(bytes, Buffer.from(JSON.stringify(report))), /only exact/)
})

test('terminal possessive source flags survive auto and admission for spelling and grammar', () => {
  for (const apostrophe of ["'", '’']) for (const category of ['spelling', 'grammar']) {
    const quote = `second${apostrophe}s`, after = `seconds${apostrophe}`
    autoFixture(`Two ${quote} silence.`, quote, after, ({ result, output, bytes }) => {
      assert.equal(result.status, 0, result.stderr)
      const reviewed = applySpellingReview(bytes, readFileSync(output))
      assert.deepEqual(reviewed.groups[0].writingTask.material, Array(2).fill(`Two ${after} silence.`))
    }, category)
  }
})

test('compound source flags survive auto and final validation with duplicate targets synchronized', () => {
  for (const [text, quote, after] of [
    ['eatables like lemon-favoured chocolates', 'lemon-favoured', 'lemon-flavoured'],
    ['near Moscow, 7-year-year-old Filonenko Rodion', '7-year-year-old', '7-year-old'],
    ['😀 Their fanily.', 'fanily', 'family'],
    ['We dont know.', 'dont', "don't"],
    ['We dont know.', 'dont', 'don’t'],
    ['That is its purpose.', 'its', "it's"],
    ['That is its purpose.', 'its', 'it’s'],
    ["Their fanily's home.", "fanily's", "family's"],
    ['Their fanily’s home.', 'fanily’s', 'family’s'],
    ['fanily', 'fanily', 'family’s'],
    ["Don't worry.", "Don't", 'Dont'],
    ['Don’t worry.', 'Don’t', 'Dont'],
  ]) {
    autoFixture(text, quote, after, ({ result, output, bytes }) => {
      assert.equal(result.status, 0, result.stderr)
      const reviewBytes = readFileSync(output)
      const reviewed = JSON.parse(reviewBytes)
      for (const target of reviewed.targets) {
        assert.equal(target.corrections[0].start, text.indexOf(quote))
        assert.equal(target.corrections[0].before, quote)
      }
      assert.deepEqual(applySpellingReview(bytes, reviewBytes).groups[0].writingTask.material,
        [text.replace(quote, after), text.replace(quote, after)])
    })
  }
})

test('auto rejects partial tokens, changed or added or removed digits and non-token marks', () => {
  for (const [text, quote, after] of [
    ['lemon-favoured', 'favoured', 'flavoured'],
    ['mindless', 'mind', 'mend'],
    ['7-year-old', '7-year-old', '8-year-old'],
    ['7-year-old', '7-year-old', 'year-old'],
    ['year-old', 'year-old', '7-year-old'],
    ['07-year-old', '07-year-old', '7-year-old'],
    ['7-year-old', '7-year-old', '7-year-8-old'],
    ['fanily', 'fanily', 'family!'],
  ]) {
    autoFixture(text, quote, after, ({ result, output }) => {
      assert.equal(result.status, 1, `${quote} → ${after}: ${result.stderr}`)
      assert.match(result.stderr, /not found in any target|one whole spelling token/)
      assert.equal(existsSync(output), false)
    })
  }
})

test('compound corrections still cannot cross source emphasis', () => {
  const before = 'lemon-favoured'
  const correction = { start: 0, before, after: 'lemon-flavoured' }
  assert.throws(() => mapSourceEmphasisEdits(before,
    [{ start: 6, end: before.length, marks: ['underline'] }], [correction]), /crosses a mark boundary/)
})

test('source_mark accepts circulated-source fixes through auto and v3/v4 admission', () => {
  for (const [before, after] of [
    ['Sometimes.students', 'Sometimes, students'], ['mother-in -law', 'mother-in-law'],
    ['snow—covered', 'snow-covered'], ['Seniors£', 'Seniors £'], ['Children£', 'Children £'],
    ['Children £5. Seniors £8', 'Children £5, Seniors £8'],
  ]) {
    autoFixture(`😀 ${before}20`, before, after, ({ result, output, bytes }) => {
      assert.equal(result.status, 0, result.stderr)
      const report = JSON.parse(readFileSync(output))
      for (const policy of [TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V4]) {
        report.schemaVersion = policy
        assert.deepEqual(applySpellingReview(bytes, Buffer.from(JSON.stringify(report))).groups[0].writingTask.material,
          Array(2).fill(`😀 ${after}20`))
      }
    }, 'source_mark')
  }
})

test('source_mark rejects letter/case drift, legacy policies and invalid evidence', () => {
  const before = 'Sometimes.students', after = 'Sometimes, students'
  const bytes = Buffer.from(JSON.stringify({ groups: [{ questions: [{ stem: before }] }] }))
  for (const [policy, edit] of [
    [SPELLING_REVIEW_POLICY, {}], [TEXT_REVIEW_POLICY_V2, {}],
    [TEXT_REVIEW_POLICY, { after: 'Sometimes, student' }],
    [TEXT_REVIEW_POLICY, { after: 'sometimes, students' }],
    [TEXT_REVIEW_POLICY, { reason: 'Fix punctuation' }],
    [TEXT_REVIEW_POLICY, { after: 'Sometimes,  students' }],
    [TEXT_REVIEW_POLICY, { after: 'Sometimes,\nstudents' }],
    [TEXT_REVIEW_POLICY, { after: `Sometimes,${' '.repeat(30)}students` }],
    [TEXT_REVIEW_POLICY, { start: 1 }], [TEXT_REVIEW_POLICY, { certainty: 'uncertain' }],
  ]) {
    const report = prepareSpellingReview(bytes, policy)
    report.reviewedBy = 'import_agent'
    report.reviewedAt = '2026-11-11T00:00:00Z'
    Object.assign(report.targets[0], { decision: 'correct', corrections: [
      { start: 0, before, after, category: 'source_mark', certainty: 'unambiguous', reason: '修正流传标点', ...edit },
    ] })
    assert.throws(() => applySpellingReview(bytes, Buffer.from(JSON.stringify(report))), /only exact/)
  }
})

test('source_mark keeps numeric values, blanks and bracketed labels intact', () => {
  for (const [before, after] of [
    ['costs £5.20 now', 'costs £520 now'], ['about 5,000 people', 'about 5000 people'],
    ['at 10:30 am', 'at 1030 am'], ['word ___ here', 'word __ here'], ['word ___ here', 'word here'],
    ['(A) word', 'A word'], ['.', ','],
  ]) assert.equal(isSourceMarkCorrection(before, after), false, before)
  assert.equal(isSourceMarkCorrection('Children £5. Seniors', 'Children £5, Seniors'), true)
  assert.equal(isSourceMarkCorrection('Fill ___ with', 'Fill with ___'), false)
  assert.equal(isSourceMarkCorrection('It was -5°C.', 'It was 5°C.'), false)
  assert.equal(isSourceMarkCorrection('Save 50% today.', 'Save 50 today.'), false)
  assert.equal(isSourceMarkCorrection('costs£5 each', 'costs 5 each'), false)
  assert.equal(isSourceMarkCorrection('Children£20', 'Children £20'), true)
  // A comma before four digits is a date separator, not a thousands group.
  assert.equal(isSourceMarkCorrection('June 1,1989 in', 'June 1, 1989 in'), true)
  assert.equal(isSourceMarkCorrection('about 1,198 people', 'about 1, 198 people'), false)
  assert.equal(isSourceMarkCorrection('in 2018,2020 we', 'in 2018–2020 we'), false)
  assert.equal(isSourceMarkCorrection('in 2018,2020 we', 'in 2018, 2020 we'), false)
  assert.equal(isSourceMarkCorrection('on 1,1989 we', 'on 1, 1989 we'), false)
  assert.equal(isSourceMarkCorrection('June 1,1989 in', 'June 1–1989 in'), false)
})

test('source_mark rechecks numeric values on the whole corrected target', () => {
  const text = 'Children £5.20 each'
  const bytes = Buffer.from(JSON.stringify({ groups: [{ questions: [{ stem: text }] }] }))
  const report = prepareSpellingReview(bytes, TEXT_REVIEW_POLICY)
  report.reviewedBy = 'import_agent'
  report.reviewedAt = '2026-11-11T00:00:00Z'
  Object.assign(report.targets[0], { decision: 'correct', corrections: [
    { start: 0, before: 'Children £5.', after: 'Children £5', category: 'source_mark', certainty: 'unambiguous', reason: '修正流传标点' },
  ] })
  assert.throws(() => applySpellingReview(bytes, Buffer.from(JSON.stringify(report))), /numeric value/)
})

test('source_mark keeps an enclosing underline aligned at UTF-16 offsets', () => {
  const before = 'Sometimes.students', after = 'Sometimes, students'
  const text = `😀 ${before} end`
  const mapped = mapSourceEmphasisEdits(text, [{ start: 3, end: 3 + before.length, marks: ['underline'] }],
    [{ start: 3, before, after, category: 'source_mark' }])
  assert.equal(mapped.text, `😀 ${after} end`)
  assert.deepEqual(mapped.ranges, [{ start: 3, end: 3 + after.length, marks: ['underline'] }])
  assert.equal(mapped.text.slice(mapped.ranges[0].start, mapped.ranges[0].end), after)
})
