import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSourceFlagTargets } from './text-review-parts.mjs'
import { applySpellingReview, isSourceMarkCorrection, prepareSpellingReview, SPELLING_REVIEW_POLICY, TEXT_REVIEW_POLICY_V2, TEXT_REVIEW_POLICY, TEXT_REVIEW_POLICY_V4 } from '../../server/paper-import/spellingReview.mjs'
import { mapSourceEmphasisEdits } from '../../server/paper-canonical/sourceEmphasis.mjs'

const at = (text, flag) => findSourceFlagTargets([{ before: text }], flag).flatMap(hit => hit.at)
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
