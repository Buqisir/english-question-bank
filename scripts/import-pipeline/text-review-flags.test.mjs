import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSourceFlagTargets } from './text-review-parts.mjs'
import { applySpellingReview, prepareSpellingReview, TEXT_REVIEW_POLICY } from '../../server/paper-import/spellingReview.mjs'
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
function autoFixture(text, quote, after, run) {
  const dir = mkdtempSync(path.join(tmpdir(), 'eqb-spelling-flags-'))
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
    save('flags/source.json', { flags: [{ quote, after, category: 'spelling', reason: '原印拼写有误，更正完整词形。' }] })
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
