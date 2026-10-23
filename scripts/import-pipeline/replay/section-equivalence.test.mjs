import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { entryPath, resolveRef, snapshot } from './snapshot.mjs'

const repo = path.resolve(import.meta.dirname, '../../..')
mkdirSync(path.join(repo, '.scratch'), { recursive: true })
const directory = mkdtempSync(path.join(repo, '.scratch/section-equivalence-'))
after(() => rmSync(directory, { recursive: true, force: true }))
const baselineSha = '2d39e86946cce738db7fb727b9e6cfbf4aaa6e02'
snapshot(repo, resolveRef(repo, baselineSha), path.join(directory, 'baseline'))
const baseline = path.join(directory, 'baseline', entryPath)
const candidate = path.join(repo, entryPath)

function fixture(texts, taskTypes) {
  const observations = texts.map((text, i) => ({
    observationId: `o${i}`, region: { x: .1, y: .15 + i * .025, width: .8, height: .02 },
  }))
  return [{
    documents: [{ documentId: 'answers', role: 'official_answers', sha256: 'abc' }],
    groups: taskTypes.map(taskType => ({ groupId: taskType, writingTask: { taskType } })),
  }, { documents: [{ documentId: 'answers', pages: [{ observations }] }] },
  { documents: [{ documentId: 'answers', pages: [{ page: 1,
    orderedItems: texts.map((text, i) => ({ itemId: `i${i}`, text, observationIds: [`o${i}`] })),
  }] }] }]
}

function capture(modulePath, input) {
  // Isolate fail()/process.exit(1), just as the corpus replay does.
  const script = `import { buildSourceReferences } from ${JSON.stringify(pathToFileURL(modulePath).href)};
    console.log(JSON.stringify(buildSourceReferences(...JSON.parse(process.argv[1]))));`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(input)],
    { encoding: 'utf8', timeout: 10_000 })
  assert.ifError(result.error)
  assert.equal(result.signal, null)
  return { status: result.status, output: result.stdout ? JSON.parse(result.stdout) : null, error: result.stderr }
}

const boundaries = [
  { name: 'small colon and trailing first section', taskType: 'application', texts: [
    '第四部分﹕写作\n第一节', 'Our club will plant herbs.', '第二节', 'Ada brought a watering can.',
  ], reviews: 1 },
  { name: 'small colon, trailing first section and omission', taskType: 'application', texts: [
    '第四部分﹕写作\n第一节', 'Our club will plant herbs.', '略', '第二节', 'Ada brought a watering can.',
  ], reviews: 2 },
  { name: 'small colon and trailing second section', taskType: 'continuation', texts: [
    '第四部分﹕写作\n第二节', 'Ada brought a watering can.', '第一节', 'Our club will plant herbs.',
  ], reviews: 1 },
]

for (const { name, taskType, texts, reviews } of boundaries) {
  test(`cross-commit equivalence: ${name} retains two samples in the selected task`, () => {
    const input = fixture(texts, [taskType])
    const expected = capture(baseline, input)
    assert.equal(expected.status, 0)
    assert.equal(expected.output.groups[0].essays.entries.length, 2)
    assert.equal(expected.output.review.length, reviews)
    // The historical entry predates this flag; successful fixtures contain no scoring tables.
    expected.output.structuredScoring = false
    // Compare every field, including review, IDs, text and source locators.
    assert.deepEqual(capture(candidate, input), expected)
  })

  test(`cross-commit equivalence: ${name} rejects a missing second task`, () => {
    const input = fixture(texts, ['application', 'continuation'])
    const expected = capture(baseline, input)
    assert.equal(expected.status, 1)
    assert.match(expected.error, /No answer-document section found for/u)
    assert.deepEqual(capture(candidate, input), expected)
  })
}

test('cross-commit equivalence: full-width colon enters writing before trailing-task omission', () => {
  const input = fixture(['第四部分：写作\n第一节', '略', '第二节', 'Ada brought a watering can.'],
    ['application', 'continuation'])
  const expected = capture(baseline, input)
  assert.equal(expected.status, 0)
  assert.deepEqual(expected.output.groups.map(group => group.essays.state), ['not_supplied', 'captured'])
  expected.output.structuredScoring = false
  assert.deepEqual(capture(candidate, input), expected)
})
