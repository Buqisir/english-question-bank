#!/usr/bin/env node
// Continuation writing V3 contract and validator.
// Spec: docs/cuts/continuation-writing-v3/spec.md (D1, D3, D7).

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv from '../server/node_modules/ajv/dist/2020.js'

import {
  analyzeNarrativeContinuationImportCandidate,
  buildNarrativeContinuationAnalysisMessages,
  buildNarrativeContinuationStagedAnalysisContract,
  readContinuationV3PromptBody,
  validateContinuationAnalysisV3,
  validateNarrativeContinuationAnalysis,
} from '../server/paper-import-ai/analyzeNarrativeContinuation.mjs'
import {
  CONTINUATION_ANALYSIS_V3,
  isContinuationAnalysisV3,
} from '../shared/writing/continuationAnalysisV3.mjs'
import {
  projectNck1StagedWritingAnalysis,
  validateNck1StagedAnalysis,
} from '../server/import-review/nck1AnalysisProjection.mjs'
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
const newFormat = mutate((out, task) => {
  const evidence = task.materialText.split(/\s+/).slice(0, 6).join(' ')
  out.reading.questions = [
    { question: '人物', answer: 'Emily 和帮助她的那对夫妇。' },
    { question: '视角与风格', answer: '第三人称叙述。', evidence: [evidence] },
    { question: '待解决问题', answer: 'Emily 怎样去见男友，陷在雪里的车怎么办？' },
  ]
  out.reading.characters = [{
    name: 'Emily', role: '主人公', lines: [{ label: '此刻', text: '被雪困住。', evidence }],
  }]
  out.taskCard = {
    route: '夫妇先帮 Emily 脱困，再接她回来取车。',
    paragraphs: [
      { paragraph: 1, must: '交代怎样离开。', draft: '夫妇安排拖车并送 Emily 去车站。', bridgeQuote: starter2, bridge: '她回来时，车修好了吗？' },
      { paragraph: 2, must: '接上她回来取车。', draft: '车已经停在夫妇家，Emily 留下来和他们喝热巧克力。' },
    ],
  }
})
const newWriting = run(newFormat).writing
assert.ok(validate(envelope(newWriting)), JSON.stringify(validate.errors))
assert.deepEqual(projectNck1StagedWritingAnalysis(newWriting), newWriting)
for (const [pattern, change] of [
  [/questions\[1\]\.evidence\[0\] is not verbatim/, (out) => { out.reading.questions[1].evidence = ['Not in the source.'] }],
  [/characters\[0\]\.lines\[0\]\.evidence is not verbatim/, (out) => { out.reading.characters[0].lines[0].evidence = starter1 }],
  [/paragraphs\[0\]\.bridgeQuote is not verbatim/, (out) => { out.taskCard.paragraphs[0].bridgeQuote = 'Not in the source.' }],
]) {
  const candidate = structuredClone(newFormat)
  change(candidate.output)
  assert.throws(() => run(candidate), pattern)
}
const crossSource = 'journey by train. Three days later,'
assert.ok(`${starter1} ${starter2}`.includes(crossSource))
const stitchedQuotes = structuredClone(newFormat)
stitchedQuotes.output.taskCard.paragraphs[0].bridgeQuote = crossSource
stitchedQuotes.output.reading.sourceLinks[0].sourceQuote = crossSource
assert.throws(() => run(stitchedQuotes), (error) => {
  assert.match(error.message, /taskCard\.paragraphs\[0\]\.bridgeQuote is not verbatim/)
  assert.match(error.message, /reading\.sourceLinks\[0\]\.sourceQuote is not verbatim/)
  return true
})
for (const change of [
  (analysis) => { analysis.taskCard.taskRequires = ['旧稿要求一', '旧稿要求二'] },
  (analysis) => { delete analysis.taskCard.route },
  (analysis) => { analysis.taskCard.paragraphs[1].bridge = '位置错了' },
  (analysis) => { delete analysis.taskCard.paragraphs[0].bridge },
  (analysis) => { analysis.reading.questions.reverse() },
]) {
  const candidate = structuredClone(newWriting)
  change(candidate.continuationAnalysis)
  assert.equal(isContinuationAnalysisV3(candidate.continuationAnalysis), false)
  assert.equal(validate(envelope(candidate)), false)
}
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

// ─── Ticket 02: prompt and routes (spec D2, D4) ─────────────────────────────

// Runtime prompt: byte-identical to what the blind trials sent. Run the trial's
// own prep script on a tracked paper and compare with the builder.
const prepOut = mkdtempSync(path.join(tmpdir(), 'cw3-prep-'))
try {
  const prep = spawnSync(process.execPath, [
    path.join(root, 'docs/cuts/continuation-writing-v3/trial/prep.mjs'), prepOut,
  ], { cwd: root, env: { ...process.env, CW_PAPERS: 'paper-2026-i' }, encoding: 'utf8' })
  assert.equal(prep.status, 0, prep.stderr)
  const trialPrompt = readFileSync(path.join(prepOut, 'paper-2026-i', 'v3-prompt.txt'), 'utf8')
  const asset = JSON.parse(readFileSync(path.join(
    root, 'test-fixtures/retired-paper-assets/paper-2026-i/latest/paper-asset.json'), 'utf8'))
  const task = Object.values(asset.content.writingTasks).find((t) => t.taskType === 'continuation')
  const messages = buildNarrativeContinuationAnalysisMessages({ writingTask: task })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].role, 'user')
  assert.equal(messages[0].content, trialPrompt, 'runtime prompt equals the trial prompt byte for byte')
} finally {
  rmSync(prepOut, { recursive: true, force: true })
}
const promptBody = readContinuationV3PromptBody()
assert.ok(promptBody.startsWith('你是一名'))
assert.doesNotMatch(promptBody, /STATUS: PRODUCTION|Owner decision/, 'maintainer notes stay out of the model prompt')

// Staged contract: V3 heading, the same body, the V3 packaging contract; no
// doctrine, no V2 prompt, no V2 schema.
const stagedContract = buildNarrativeContinuationStagedAnalysisContract()
assert.ok(stagedContract.startsWith('# Continuation Writing Model Answer Prompt — V3\n\n你是一名'))
assert.ok(stagedContract.includes(promptBody.trimEnd()))
assert.match(stagedContract, /^# NCK1 Staged Narrative Continuation Packaging Contract — V3$/m)
assert.doesNotMatch(stagedContract, /Teaching Analysis Style|continuation-analysis-v2|Narrative Continuation Analysis Prompt/)

// The plugin's V3 markers and doctrine omission: verify-nck1-analysis-agent-plugin.

// Provider shell: a V3 raw output passes and comes back unchanged.
const provided = await analyzeNarrativeContinuationImportCandidate(
  { writingTask: base.writingTask, providerId: 'deepseek-v4-pro' },
  {
    analysisRetries: 0,
    providerRetries: 0,
    providerCallers: {
      deepseek: async () => ({ rawText: JSON.stringify(base.output), provider: 'fixture', model: 'fixture', latencyMs: 1 }),
    },
  },
)
assert.deepEqual(provided.analysis, base.output)
assert.deepEqual(run({ output: provided.analysis, writingTask: base.writingTask }).writing, stored)

// Staged NCK1 route: a packaged V3 draft passes the local acceptance check; a
// mismatched modelAnswer does not.
const stagedRequest = {
  group: 'continuation',
  sourceGroup: {
    groupKey: 'continuation',
    material: {
      paper: { paperId: 'paper-cw3', sourceAssetVersion: 1 },
      group: { groupId: 'g' },
      writingTask: { ...base.writingTask, groupId: 'g', officialModelAnswer: null },
    },
  },
  authoritativeAnswers: { officialModelAnswer: null },
}
assert.deepEqual(validateNck1StagedAnalysis(stagedRequest, stored), { ok: true, warnings: [] })
assert.throws(() => validateNck1StagedAnalysis(stagedRequest, { ...stored, modelAnswer: 'Different.' }), /standard essay/)

// Backfill driver end to end on a temporary paper: list writes the V3 prompt;
// persist refuses MUST_FIX and a missing review, then persists on PASS.
const driverRoot = mkdtempSync(path.join(tmpdir(), 'cw3-driver-'))
try {
  const assets = path.join(driverRoot, 'assets')
  const work = path.join(driverRoot, 'work')
  const latest = path.join(assets, 'paper-cw3', 'latest')
  mkdirSync(latest, { recursive: true })
  const writingTask = { ...base.writingTask, writingTaskId: 'wt-cw3', groupId: 'g' }
  writeFileSync(path.join(latest, 'paper-asset.json'), JSON.stringify({
    paper: { paperId: 'paper-cw3' },
    content: { groups: { g: { groupType: 'writing', writingTaskId: 'wt-cw3' } }, writingTasks: { 'wt-cw3': writingTask } },
  }))
  const driver = (mode) => spawnSync(process.execPath, [
    path.join(root, 'scripts/import-pipeline/writing-analysis-driver.mjs'), mode, 'continuation',
  ], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      WRITING_ANALYSIS_PAPER_ASSETS_DIR: assets,
      WRITING_ANALYSIS_WORK_DIR: work,
      WRITING_ANALYSIS_ALLOWED_PAPERS: 'paper-cw3',
    },
  })
  const key = 'paper-cw3__g'
  const listed = driver('list')
  assert.equal(listed.status, 0, listed.stderr)
  assert.equal(
    readFileSync(path.join(work, `${key}.analysis-v3.prompt.txt`), 'utf8'),
    buildNarrativeContinuationAnalysisMessages({ writingTask })[0].content,
  )
  writeFileSync(path.join(work, `${key}.analysis-v3.json`), JSON.stringify(base.output))
  const analysisFile = path.join(latest, 'analyses', 'writing-analysis-v1.json')

  const noReview = driver('persist')
  assert.equal(noReview.status, 1)
  assert.match(noReview.stdout, /MISSING independent review/)
  writeFileSync(path.join(work, `${key}.review.json`), JSON.stringify({
    verdict: 'MUST_FIX',
    findings: [{ code: 'ending-moral', problem: 'The last line states a moral.', requiredChange: 'End on the action.' }],
  }))
  const mustFix = driver('persist')
  assert.equal(mustFix.status, 1)
  assert.match(mustFix.stdout, /verdict is MUST_FIX; persist is blocked/)
  assert.equal(existsSync(analysisFile), false)

  writeFileSync(path.join(work, `${key}.review.json`), JSON.stringify({ verdict: 'PASS', findings: [] }))
  const passed = driver('persist')
  assert.equal(passed.status, 0, passed.stdout + passed.stderr)
  const persisted = JSON.parse(readFileSync(analysisFile, 'utf8'))
  assert.deepEqual(persisted.groups.g.writing, stored)
  assert.ok(validate(persisted), JSON.stringify(validate.errors))
  // Persisted groups leave the work list.
  assert.match(driver('list').stdout, /work groups: 0/)
} finally {
  rmSync(driverRoot, { recursive: true, force: true })
}

console.log(`verify-continuation-analysis-v3: ${passing} fixtures pass, ${roundTwoOverLimit.size} round 2 fixtures fail D3.9 as expected, ${failures.length} rule failures caught`)
