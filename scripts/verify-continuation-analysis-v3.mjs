#!/usr/bin/env node
// Continuation writing V3 contract and validator.
// Spec: docs/cuts/continuation-writing-v3/spec.md (D1, D3, D7).

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from '../server/node_modules/ajv/dist/2020.js'

import {
  validateContinuationAnalysisV3,
  validateNarrativeContinuationAnalysis,
} from '../server/paper-import-ai/analyzeNarrativeContinuation.mjs'
import {
  CONTINUATION_ANALYSIS_V3,
  isContinuationAnalysisV3,
} from '../shared/writing/continuationAnalysisV3.mjs'
import { projectNck1StagedWritingAnalysis } from '../server/import-review/nck1AnalysisProjection.mjs'
import { assertNoRetiredAnalysisFields } from '../server/paper-import/analyzedPackage.mjs'
import {
  persistWritingAnalysisGroup,
  validateWritingAnalysisCandidate,
} from '../server/writing-analysis/writingAnalysisBackfillService.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = path.join(root, 'docs/cuts/continuation-writing-v3/qa/fixtures')
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, ...JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8')) }))
assert.equal(fixtures.length, 17, 'seventeen trial fixtures')
assert.ok(fixtures.every(({ name }) => !name.includes('zj-2026-jan')), 'paper-zj-2026-jan stays held out')

const run = ({ output, writingTask }) => validateContinuationAnalysisV3({ analysis: output, writingTask })

// Round 2 ran before the prompt pinned beyondStandard to 2–3; these two wrote 4
// and fail D3.9 as they should.
const roundTwoOverLimit = new Set(['round2-paper-2022-i.json', 'round2-paper-2024-i.json'])
let passing = 0
for (const fixture of fixtures) {
  if (roundTwoOverLimit.has(fixture.name)) {
    assert.throws(() => run(fixture), /advanced\.beyondStandard has 4 entries, want 2–3/, fixture.name)
    continue
  }
  const { writing, wordCounts } = run(fixture)
  assert.equal(writing.continuationAnalysis.schemaVersion, CONTINUATION_ANALYSIS_V3, fixture.name)
  assert.equal(writing.modelAnswer, fixture.output.standard.essay, fixture.name)
  assert.ok(isContinuationAnalysisV3(writing.continuationAnalysis), fixture.name)
  assert.ok(wordCounts.standard >= 170 && wordCounts.standard <= 210, fixture.name)
  assert.ok(wordCounts.advanced >= 240 && wordCounts.advanced <= 280, fixture.name)
  passing += 1
}
assert.equal(passing, 15)

// Warnings do not fail. The round 2 2025-ii essays named a new person "Emma";
// the round 3 essays for the same paper raise nothing.
const emma = fixtures.find((fixture) => fixture.name === 'round2-paper-2025-ii.json')
assert.deepEqual(run(emma).warnings, [
  'standard.essay possible new named character: Emma',
  'advanced.essay possible new named character: Emma',
])
for (const fixture of fixtures.filter(({ name }) => name.startsWith('round3-') || name.startsWith('fix-check-'))) {
  assert.deepEqual(run(fixture).warnings, [], fixture.name)
}

// One failing case per D3 rule, each on a copy of the round 3 2026 Ⅰ fixture.
const base = fixtures.find((fixture) => fixture.name === 'round3-paper-2026-i.json')
assert.ok(base, 'round 3 2026 Ⅰ fixture')
const [starter1, starter2] = base.writingTask.continuationStarters
const mutate = (change) => {
  const copy = structuredClone(base)
  change(copy.output, copy.writingTask)
  return copy
}
const failures = [
  ['D3.1 blocked', /blocked/, (out) => { out.blocked = '题面缺段首句' }],
  ['D3.1 unknown field', /unknown field extra/, (out) => { out.standard.extra = 'x' }],
  ['D3.1 missing field', /standard\.pitfalls is missing/, (out) => { delete out.standard.pitfalls }],
  ['D3.2 paragraphs', /paragraphs, want 2/, (out) => { out.standard.essay = out.standard.essay.replace('\n\n', '\n') }],
  ['D3.2 starter 1', /paragraph 1 does not start with starter 1/, (out) => {
    out.standard.essay = out.standard.essay.replace(starter1, 'Then something happened.')
  }],
  ['D3.2 starter 2', /paragraph 2 does not start with starter 2/, (out) => {
    out.advanced.essay = out.advanced.essay.replace(starter2, 'Later that week, things changed.')
  }],
  ['D3.3 Chinese', /contains Chinese/, (out) => { out.advanced.essay = out.advanced.essay.replace('Emily', 'Emily 艾米丽') }],
  ['D3.3 numbering', /Markdown or numbering/, (out) => { out.standard.essay = `1. ${out.standard.essay}` }],
  ['D3.4 word count', /new words, want 170–210/, (out) => {
    out.standard.essay = `${starter1} She agreed.\n\n${starter2} She drove home.`
  }],
  ['D3.4 non-150 target', /not supported by V3/, (_out, task) => { task.wordCountTarget = 200 }],
  ['D3.5 copied source', /copies 8\+ consecutive source words/, (out, task) => {
    const run8 = task.materialText.split(/\s+/).slice(0, 10).join(' ')
    out.standard.essay = out.standard.essay.replace(starter2, `${starter2} ${run8}`)
  }],
  ['D3.6 three questions', /reading\.questions has 2 entries, want 3/, (out) => { out.reading.questions.pop() }],
  ['D3.6 sourceQuote', /sourceLinks\[0\]\.sourceQuote is not verbatim/, (out) => { out.reading.sourceLinks[0].sourceQuote = 'Not in the source.' }],
  ['D3.7 taskRequires', /taskRequires has 1 entries, want 2–4/, (out) => { out.taskCard.taskRequires = out.taskCard.taskRequires.slice(0, 1) }],
  ['D3.7 thisEssayChooses', /thisEssayChooses is empty/, (out) => { out.taskCard.thisEssayChooses = ' ' }],
  ['D3.8 notes quote', /notes\[0\]\.items\[0\]\.quote is not verbatim/, (out) => { out.standard.notes[0].items[0].quote = 'Not in the essay.' }],
  ['D3.8 notes paragraph', /paragraph 3 does not exist/, (out) => { out.standard.notes[0].paragraph = 3 }],
  ['D3.8 notes coverage', /no note for paragraph 2/, (out) => { out.standard.notes = out.standard.notes.filter((note) => note.paragraph !== 2) }],
  ['D3.8 notes items', /items has 1 entries, want 2–4/, (out) => { out.standard.notes[0].items = out.standard.notes[0].items.slice(0, 1) }],
  ['D3.9 expressions', /expressions has 1 entries/, (out) => { out.standard.expressions = out.standard.expressions.slice(0, 1) }],
  ['D3.9 pitfalls', /pitfalls has 4 entries/, (out) => {
    out.standard.pitfalls = [...out.standard.pitfalls, ...out.standard.pitfalls].slice(0, 4)
  }],
  ['D3.9 beyondStandard quote', /beyondStandard\[0\]\.quote is not verbatim/, (out) => { out.advanced.beyondStandard[0].quote = 'Not in the essay.' }],
]
for (const [label, pattern, change] of failures) {
  assert.throws(() => run(mutate(change)), pattern, label)
}

// Warning: direct speech far above the source (2026 Ⅰ quotes nothing).
const chatty = mutate((out) => {
  out.standard.essay = out.standard.essay
    .replace('Daniel explained that he had pulled it out of the ditch the day after Christmas.', '"I pulled it out the day after Christmas," Daniel explained.')
    .replace('Rachel invited them in, and', '"Come in out of the cold, both of you," Rachel said, and')
    .replace('At first Emily hesitated.', '"I can\'t just leave it," Emily said.')
})
const chattyResult = run(chatty)
assert.ok(chattyResult.warnings.some((w) => /direct speech, source 0%/.test(w)), JSON.stringify(chattyResult.warnings))

// Schema (D1): V3 envelope valid; closed object; V1/V2 and I19 still valid.
const schema = JSON.parse(readFileSync(path.join(root, 'schemas/paper-import/writing-analysis-v1.schema.json'), 'utf8'))
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
const stored = run(base).writing
const envelope = (writing) => ({ schemaVersion: 'writing-analysis-v1', paperId: 'paper-cw3', groups: { g: { writing } } })
assert.ok(validate(envelope(stored)), JSON.stringify(validate.errors))
assert.equal(validate(envelope({ ...stored, continuationAnalysis: { ...stored.continuationAnalysis, extra: 1 } })), false, 'closed object')
assert.equal(validate(envelope({ ...stored, reviewCard: {} })), false, 'V3 with reviewCard')
const bareV2 = { schemaVersion: 'continuation-analysis-v2', storyUnderstanding: {}, continuationContract: {}, developmentPlan: {} }
assert.ok(validate(envelope({ taskType: 'continuation', continuationAnalysis: bareV2 })), 'V2 still valid')
const { developmentPlan: _plan, ...v2WithoutPlan } = bareV2
assert.equal(validate(envelope({ taskType: 'continuation', continuationAnalysis: v2WithoutPlan })), false, 'V2 still needs developmentPlan')
const { storyUnderstanding: _story, ...v2WithoutStory } = bareV2
assert.equal(validate(envelope({ taskType: 'continuation', continuationAnalysis: v2WithoutStory })), false, 'V2 still needs storyUnderstanding')
assert.ok(validate(envelope({
  taskType: 'continuation', modelAnswer: 'A.',
  continuationDesign: { theme: 't', paragraphs: ['a', 'b'] },
  highlightExpressions: [{ text: 'a', note: 'n' }, { text: 'b', note: 'n' }, { text: 'c', note: 'n' }],
})), 'I19 still valid')

// Analyzer entry: the V1/V2 validator hands V3 to the V3 check.
assert.equal(validateNarrativeContinuationAnalysis(stored.continuationAnalysis, { writingTask: base.writingTask }), stored.continuationAnalysis)
assert.throws(() => validateNarrativeContinuationAnalysis(
  { ...stored.continuationAnalysis, reading: { ...stored.continuationAnalysis.reading, questions: [] } },
  { writingTask: base.writingTask },
), /reading\.questions has 0 entries/)

// Staged projection: V3 kept; mismatched modelAnswer rejected; V2 still accepted.
assert.deepEqual(projectNck1StagedWritingAnalysis(stored), stored)
assert.throws(() => projectNck1StagedWritingAnalysis({ ...stored, modelAnswer: 'Different.' }), /must equal the standard essay/)
assert.deepEqual(
  projectNck1StagedWritingAnalysis({ taskType: 'continuation', modelAnswer: 'A.', continuationAnalysis: bareV2 }),
  { taskType: 'continuation', modelAnswer: 'A.', continuationAnalysis: bareV2 },
)

// Analyzed-package intake: V3 passes the root-key and retired-field gate; the
// retired I19 fields stay rejected.
assert.doesNotThrow(() => assertNoRetiredAnalysisFields('continuation', stored))
assert.throws(() => assertNoRetiredAnalysisFields('continuation', { ...stored, highlightExpressions: [] }), /highlightExpressions/)

// Backfill: candidate checks and persistence keep the V3 object.
validateWritingAnalysisCandidate(stored)
assert.throws(() => validateWritingAnalysisCandidate({ ...stored, modelAnswer: 'Different.' }), /must equal/)
assert.throws(() => validateWritingAnalysisCandidate({
  ...stored, continuationAnalysis: { ...stored.continuationAnalysis, advanced: {} },
}), /V3 is malformed/)
const tempRoot = mkdtempSync(path.join(tmpdir(), 'cw3-'))
try {
  const latest = path.join(tempRoot, 'paper-cw3', 'latest')
  mkdirSync(latest, { recursive: true })
  writeFileSync(path.join(latest, 'paper-asset.json'), '{}\n')
  persistWritingAnalysisGroup({ paperAssetsDir: tempRoot }, { paperId: 'paper-cw3', groupId: 'g' }, stored)
  const written = JSON.parse(readFileSync(path.join(latest, 'analyses', 'writing-analysis-v1.json'), 'utf8'))
  assert.deepEqual(written.groups.g.writing, stored)
  assert.ok(validate(written), JSON.stringify(validate.errors))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`verify-continuation-analysis-v3: ${passing} fixtures pass, ${roundTwoOverLimit.size} round 2 fixtures fail D3.9 as expected, ${failures.length} rule failures caught`)
