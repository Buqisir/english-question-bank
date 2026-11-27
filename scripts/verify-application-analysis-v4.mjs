#!/usr/bin/env node
// Application writing V4 contract and validator.
// Spec: docs/cuts/application-writing-v4/spec.md (D1, D3, D7).

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from '../server/node_modules/ajv/dist/2020.js'

import {
  buildApplicationStagedAnalysisContract,
  validateApplicationAnalysisV4,
} from '../server/paper-import-ai/applicationWritingWorkflow.mjs'
import {
  APPLICATION_ANALYSIS_V4,
  isApplicationAnalysisV4,
} from '../shared/writing/applicationAnalysisV4.mjs'
import {
  projectNck1StagedWritingAnalysis,
  validateNck1StagedAnalysis,
} from '../server/import-review/nck1AnalysisProjection.mjs'
import {
  persistWritingAnalysisGroup,
  validateWritingAnalysisCandidate,
} from '../server/writing-analysis/writingAnalysisBackfillService.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = path.join(root, 'docs/cuts/application-writing-v4/qa/fixtures')
const fixtures = readdirSync(fixtureDir)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, ...JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8')) }))
assert.equal(fixtures.length, 5, 'five trial fixtures')

const run = ({ output, writingTask, groupPassage }) =>
  validateApplicationAnalysisV4({ analysis: output, writingTask, groupPassage })

// Every trial output passes and yields the stored form.
for (const fixture of fixtures) {
  const { writing, wordCounts } = run(fixture)
  assert.equal(writing.applicationAnalysis.schemaVersion, APPLICATION_ANALYSIS_V4, fixture.name)
  assert.equal(writing.modelAnswer, fixture.output.standard.essay, fixture.name)
  assert.ok(isApplicationAnalysisV4(writing.applicationAnalysis), fixture.name)
  assert.ok(wordCounts.standard >= 100 && wordCounts.standard <= 120, fixture.name)
  assert.ok(wordCounts.advanced >= 130 && wordCounts.advanced <= 150, fixture.name)
}

// One failing case per D3 rule, each on a copy of the 2026 Ⅱ fixture.
const base = fixtures.find((fixture) => fixture.name === 'paper-gaokao-2026-ii.json')
assert.ok(base, '2026 Ⅱ fixture')
const mutate = (change) => {
  const copy = structuredClone(base)
  change(copy.output, copy.writingTask)
  return copy
}
const firstSentence = 'It’s a great idea to make a collection of our English essays.'
const failures = [
  ['D3.1 blocked', /blocked/, (out) => { out.blocked = '题面缺要点' }],
  ['D3.1 unknown field', /unknown field extra/, (out) => { out.standard.extra = 'x' }],
  ['D3.2 given line missing', /given text is missing or misplaced/, (out) => {
    out.standard.essay = out.standard.essay.replace(firstSentence, 'It is a good idea to collect our essays.')
  }],
  ['D3.2 Chinese', /contains Chinese/, (out) => { out.advanced.essay = out.advanced.essay.replace('Li Hua', 'Li Hua 李华') }],
  ['D3.2 numbering', /Markdown or numbering/, (out) => {
    out.standard.essay = out.standard.essay.replace('\n\n', '\n\n1. ')
  }],
  ['D3.3 paragraphs', /paragraphs, want 3 or 4/, (out) => {
    out.standard.essay = out.standard.essay.replace(/\n\n/g, '\n')
  }],
  ['D3.4 word count', /new words, want 100–120/, (out) => {
    out.standard.essay = out.standard.essay.replace(/\n\n([^\n]+)\n\nYours,/, '\n\nShort ending.\n\nYours,')
  }],
  ['D3.4 non-80 target', /not supported by V4/, (_out, task) => { task.wordCountTarget = 100 }],
  ['D3.5 pointMap quote', /pointMap\[0\]\.quote is not verbatim/, (out) => { out.standard.pointMap[0].quote += ' extra' }],
  ['D3.6 notes quote', /notes\[0\]\.items\[0\]\.quote is not verbatim/, (out) => { out.standard.notes[0].items[0].quote = 'Not in the essay.' }],
  ['D3.6 notes paragraph', /paragraph 9 does not exist/, (out) => { out.standard.notes[0].paragraph = 9 }],
  ['D3.7 expressions count', /expressions has 1 entries/, (out) => { out.standard.expressions = out.standard.expressions.slice(0, 1) }],
  ['D3.7 beyondStandard quote', /beyondStandard\[0\]\.quote is not verbatim/, (out) => { out.advanced.beyondStandard[0].quote = 'Not in the essay.' }],
  ['D3.8 taskCard', /taskRequires has 0 entries/, (out) => { out.taskCard.taskRequires = [] }],
]
for (const [label, pattern, change] of failures) {
  assert.throws(() => run(mutate(change)), pattern, label)
}

// Warnings do not fail: a one-sentence middle paragraph.
const eight = fixtures.find((fixture) => fixture.name === 'paper-gaokao-2021-eight-provinces-jan.json')
assert.deepEqual(run(eight).warnings, ['standard.essay paragraph 2 is one sentence'])

// Schema (D1): V4 envelope valid; both cards, missing modelAnswer, and V4 on continuation invalid.
const schema = JSON.parse(readFileSync(path.join(root, 'schemas/paper-import/writing-analysis-v1.schema.json'), 'utf8'))
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema)
const stored = run(base).writing
const envelope = (writing) => ({ schemaVersion: 'writing-analysis-v1', paperId: 'paper-v4', groups: { g: { writing } } })
assert.ok(validate(envelope(stored)), JSON.stringify(validate.errors))
const newFixture = mutate((out) => {
  out.taskCard.basics = {
    form: '写给外教的建议信', personTense: '第一人称、一般现在时',
    readerTone: '对熟悉的外教礼貌建议', goal: '提出作文集配图的建议并自荐',
  }
  out.taskCard.taskRequires = ['说明配图意见及理由', '自荐担任插画作者']
})
const newWriting = run(newFixture).writing
assert.ok(validate(envelope(newWriting)), JSON.stringify(validate.errors))
assert.deepEqual(projectNck1StagedWritingAnalysis(newWriting), newWriting)
const incompleteBasics = structuredClone(newWriting)
delete incompleteBasics.applicationAnalysis.taskCard.basics.readerTone
assert.equal(isApplicationAnalysisV4(incompleteBasics.applicationAnalysis), false)
assert.equal(validate(envelope(incompleteBasics)), false)
const v2Card = {
  schemaVersion: 'application-review-card-v2', form: '邮件', topic: '作文集', purpose: '提建议',
  person: '第一人称', tense: '一般现在时', points: ['配图'], reader: '外教', relationship: '师生',
  readerNeeds: '知道怎么回复', value: '让作文集更好读',
}
assert.ok(validate(envelope({ taskType: 'application', modelAnswer: 'A.', reviewCard: v2Card })), 'V2 card still valid')
assert.equal(validate(envelope({ ...stored, reviewCard: v2Card })), false, 'card and V4 together')
const { modelAnswer: _dropped, ...withoutModelAnswer } = stored
assert.equal(validate(envelope(withoutModelAnswer)), false, 'V4 without modelAnswer')
assert.equal(validate(envelope({ ...stored, applicationAnalysis: { ...stored.applicationAnalysis, extra: 1 } })), false, 'closed object')
assert.equal(validate(envelope({ taskType: 'continuation', applicationAnalysis: stored.applicationAnalysis, continuationAnalysis: {} })), false, 'V4 on continuation')

// Staged projection: V4 kept; mismatched modelAnswer rejected; V2 path unchanged.
assert.deepEqual(projectNck1StagedWritingAnalysis(stored), stored)
assert.throws(() => projectNck1StagedWritingAnalysis({ ...stored, modelAnswer: 'Different.' }), /must equal the standard essay/)
assert.throws(() => projectNck1StagedWritingAnalysis({ ...stored, reviewCard: v2Card }), /closure mismatch/)
assert.deepEqual(
  projectNck1StagedWritingAnalysis({ taskType: 'application', modelAnswer: 'A.', reviewCard: v2Card }),
  { taskType: 'application', modelAnswer: 'A.', reviewCard: v2Card },
)

// Staged route (D4): the request contract is V4 plus the V2 packaging contract,
// and a packaged V4 draft passes the same gate validate-analysis.mjs runs.
const stagedRequest = {
  group: 'application',
  sourceGroup: { groupKey: 'application', material: {
    paper: { paperId: 'paper-v4', sourceAssetVersion: 1 },
    group: { groupId: 'g' },
    writingTask: { ...base.writingTask, groupId: 'g', taskType: 'application' },
  } },
  authoritativeAnswers: { officialModelAnswer: null },
  outputContract: buildApplicationStagedAnalysisContract(),
}
assert.match(stagedRequest.outputContract, /^# Application Writing Model Answer Prompt — V4\n/)
assert.match(stagedRequest.outputContract, /^# NCK1 Staged Application Analysis Packaging Contract — V2$/m)
assert.equal(validateNck1StagedAnalysis(stagedRequest, stored).ok, true)
assert.equal(validateNck1StagedAnalysis(stagedRequest, newWriting).ok, true)
assert.throws(() => validateNck1StagedAnalysis(stagedRequest, {
  ...stored, applicationAnalysis: { ...stored.applicationAnalysis, standard: { ...stored.applicationAnalysis.standard, essay: stored.modelAnswer.replace(firstSentence, 'Hello.') } },
}), /must equal the standard essay|given text/)

// Backfill: candidate checks and persistence keep the V4 object.
validateWritingAnalysisCandidate(stored)
assert.throws(() => validateWritingAnalysisCandidate({ ...stored, reviewCard: v2Card }), /one or the other/)
assert.throws(() => validateWritingAnalysisCandidate({ ...stored, modelAnswer: 'Different.' }), /must equal/)
const tempRoot = mkdtempSync(path.join(tmpdir(), 'aw4-'))
try {
  const latest = path.join(tempRoot, 'paper-v4', 'latest')
  mkdirSync(latest, { recursive: true })
  writeFileSync(path.join(latest, 'paper-asset.json'), '{}\n')
  persistWritingAnalysisGroup({ paperAssetsDir: tempRoot }, { paperId: 'paper-v4', groupId: 'g' }, stored)
  const written = JSON.parse(readFileSync(path.join(latest, 'analyses', 'writing-analysis-v1.json'), 'utf8'))
  assert.deepEqual(written.groups.g.writing, stored)
  assert.ok(validate(written), JSON.stringify(validate.errors))
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`verify-application-analysis-v4: ${fixtures.length} fixtures pass, ${failures.length} rule failures caught`)
