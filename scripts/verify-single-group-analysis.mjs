import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { buildNck1AnalysisProjection, validateNck1StagedAnalysis } from '../server/import-review/nck1AnalysisProjection.mjs'
import { buildNck1CompatibilityPaperAsset } from '../server/import-review/revisionProjection.mjs'
import { buildListeningAnalysisAgentRequest } from '../server/paper-import-ai/analyzeListening.mjs'

// Reuse existing synthetic publication fixtures without running its DB/HTTP suite.
const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { objectiveFixtureGroup, writeStagedAnalyses } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous

const root = mkdtempSync(path.join(tmpdir(), 'single-group-analysis-'))
try {
  const source = makeFixture({ listening: true })
  writeStagedAnalyses(root, source)
  const paper = { paperId: source.paperId, sourceAssetVersion: 1 }
  const answers = new Map(source.answers.map(({ questionId, value }) => [questionId, value]))
  const slots = { 'reading-a': 'reading.a', 'reading-b': 'reading.b',
    'reading-c': 'reading.c', 'reading-d': 'reading.d', seven: 'seven-choices',
    cloze: 'cloze', grammar: 'grammar-fill', application: 'writing.application',
    continuation: 'writing.continuation', 'listening-unit': null }
  for (const [key, slot] of Object.entries(slots)) {
    const sourceGroup = source.groups.find((group) => group.slotId === slot)
    const group = sourceGroup && objectiveFixtureGroup(sourceGroup, answers)
    let request
    if (key === 'listening-unit') {
      request = buildListeningAnalysisAgentRequest({ materialization: source, teachingDoctrine: 'fixture' })
    } else {
      request = { group: key, sourceGroup: { groupKey: key, material: { paper, group } },
        authoritativeAnswers: Object.fromEntries(group.questions.map(({ id, answerKey }) => [id, { questionId: id, answer: answerKey }])) }
      if (sourceGroup.writingTask) {
        const task = sourceGroup.writingTask
        request.sourceGroup.material.writingTask = { groupId: group.groupId, taskType: task.taskType,
          instruction: task.prompt, materialText: task.material.join('\n'), continuationStarters: task.starters }
        request.authoritativeAnswers = { officialModelAnswer: null }
      }
    }
    const filename = `analysis-${key === 'listening-unit' ? 'listening' : key}.json`
    const analysis = JSON.parse(readFileSync(path.join(root, filename), 'utf8'))
    if (key === 'application') {
      // The publication fixture has placeholder English instructions, not a
      // recoverable writing task. Supply an explicit synthetic given skeleton.
      request.sourceGroup.material.writingTask.applicationGiven = { top: ['Dear Chris,'], bottom: ['Yours, Li Hua'] }
      request.sourceGroup.material.writingTask.wordCountTarget = 80
      analysis.modelAnswer = `Dear Chris,\n${Array(90).fill('information').join(' ')}\nYours, Li Hua`
    }
    const before = JSON.stringify({ request, analysis })
    assert.equal(validateNck1StagedAnalysis(request, analysis).ok, true, key)
    assert.equal(JSON.stringify({ request, analysis }), before, `${key} does not mutate inputs`)

    const requestPath = path.join(root, 'request.json')
    const candidatePath = path.join(root, 'candidate.json')
    writeFileSync(requestPath, JSON.stringify(request))
    writeFileSync(candidatePath, JSON.stringify(analysis))
    const files = readdirSync(root).sort()
    const run = () => spawnSync(process.execPath, ['scripts/import-pipeline/validate-analysis.mjs', requestPath, candidatePath],
      { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' })
    const passed = run()
    assert.equal(passed.status, 0, `${key}: ${passed.stderr}`)
    assert.match(passed.stdout, /PASS .*no files written/)
    assert.equal(readFileSync(candidatePath, 'utf8'), JSON.stringify(analysis))
    assert.equal(readFileSync(requestPath, 'utf8'), JSON.stringify(request))
    assert.deepEqual(readdirSync(root).sort(), files)

    const wrong = structuredClone(analysis)
    if (key.startsWith('reading-')) {
      const options = Object.values(wrong.questions)[0].optionAnalysis
      const correct = options.find((option) => option.status === 'correct')
      const other = options.find((option) => option.status !== 'correct')
      correct.status = other.status
      other.status = 'correct'
    } else if (key === 'seven') {
      const fit = Object.values(wrong.questions)[0].optionFit
      fit.correctOptionLabel = fit.correctOptionLabel === 'A' ? 'B' : 'A'
    } else if (key === 'cloze') {
      const fit = Object.values(wrong.blanks)[0].correctFit
      fit.optionLabel = fit.optionLabel === 'A' ? 'B' : 'A'
    } else if (key === 'grammar') Object.values(wrong.blanks)[0].answer = 'FORGED'
    else if (key === 'application') wrong.officialModelAnswer = 'Invented official answer'
    else if (key === 'continuation') wrong.continuationAnalysis.storyUnderstanding.centralSituation.evidence[0].excerpt = 'FORGED'
    else Object.values(wrong.questions)[0].evidence.quote = 'FORGED'
    writeFileSync(candidatePath, JSON.stringify(wrong))
    const rejected = run()
    assert.equal(rejected.status, 1, `${key} must reject wrong content: ${rejected.stdout}`)
    assert.match(rejected.stderr, /FAIL:/)
    assert.equal(readFileSync(candidatePath, 'utf8'), JSON.stringify(wrong))
    assert.deepEqual(readdirSync(root).sort(), files)

    const drift = structuredClone(request)
    if (key === 'listening-unit') drift.authoritativeAnswers[Object.keys(drift.authoritativeAnswers)[0]] = 'Z'
    else if (sourceGroup.writingTask) drift.authoritativeAnswers.officialModelAnswer = 'Not in source'
    else Object.values(drift.authoritativeAnswers)[0].answer = 'Z'
    assert.throws(() => validateNck1StagedAnalysis(drift, analysis), /authority disagree/)

    if (sourceGroup?.writingTask) {
      const officialRequest = structuredClone(request)
      officialRequest.authoritativeAnswers.officialModelAnswer = 'A source-owned official sample.'
      officialRequest.sourceGroup.material.writingTask.officialModelAnswer = 'A source-owned official sample.'
      assert.equal(validateNck1StagedAnalysis(officialRequest, analysis).ok, true)
      assert.throws(() => validateNck1StagedAnalysis(officialRequest, { ...analysis, officialModelAnswer: 'FORGED' }), /does not match/)
      if (key === 'application') {
        assert.throws(() => validateNck1StagedAnalysis(request, { ...analysis, modelAnswer: analysis.modelAnswer.replace('Dear Chris,', 'Dear Robin,') }), /required given text/)
      }
    }
    if (!sourceGroup?.writingTask && key !== 'listening-unit') {
      const missingTeaching = structuredClone(analysis)
      delete missingTeaching.groups[group.groupId].teachingContent
      assert.throws(() => validateNck1StagedAnalysis(request, missingTeaching), /teachingContent/)
      const stale = structuredClone(analysis)
      stale.sourceAssetVersion = 2
      assert.throws(() => validateNck1StagedAnalysis(request, stale), /sourceAssetVersion/)
    }
    console.log(`PASS ${key}: CLI acceptance/rejection, source authority, immutable inputs`)
  }

  // Official alternatives are a set of accepted answers, not one literal AI
  // answer. Exercise both public seams with the same immutable authority.
  const alternatives = structuredClone(source)
  const grammarSource = alternatives.groups.find((group) => group.slotId === 'grammar-fill')
  const questionId = grammarSource.questions.find((question) => question.canonicalNumber === 57).questionId
  alternatives.answers.find((answer) => answer.questionId === questionId).value = 'which/that'
  writeStagedAnalyses(root, alternatives)
  const group = objectiveFixtureGroup(grammarSource,
    new Map(alternatives.answers.map(({ questionId, value }) => [questionId, value])))
  const request = { group: 'grammar', sourceGroup: { groupKey: 'grammar', material: { paper, group } },
    authoritativeAnswers: Object.fromEntries(group.questions.map(({ id, answerKey }) => [id, { questionId: id, answer: answerKey }])) }
  const paperAsset = buildNck1CompatibilityPaperAsset({
    config: { provenance: { paperName: 'Alternatives fixture', source: 'Verifier', year: 2026 } },
    materialization: alternatives, sourceAssetVersion: 1,
  })
  const grammarPath = path.join(root, 'analysis-grammar.json')
  const grammar = JSON.parse(readFileSync(grammarPath, 'utf8'))
  const authorityBefore = JSON.stringify({ alternatives, request, paperAsset })
  for (const [answer, accepted] of [
    ['which', true], ['that', true], ['  ThAt  ', true],
    ['who', false], ['which/that', false], ['that.', false], ['whiches', false], ['', false],
  ]) {
    const candidate = structuredClone(grammar)
    candidate.blanks[questionId].answer = answer
    const bytes = JSON.stringify(candidate)
    writeFileSync(grammarPath, bytes)
    const single = () => validateNck1StagedAnalysis(request, candidate)
    const full = () => buildNck1AnalysisProjection({ rootDir: root,
      materialization: alternatives, paperAsset, requireTeachingContent: true })
    if (accepted) {
      assert.equal(single().ok, true, `single grammar accepts ${JSON.stringify(answer)}`)
      assert.equal(full().sidecars['grammar-fill-analysis-v1.json'].blanks[questionId].answer, answer)
    } else {
      assert.throws(single, `single grammar rejects ${JSON.stringify(answer)}`)
      assert.throws(full, `full grammar rejects ${JSON.stringify(answer)}`)
    }
    assert.equal(JSON.stringify(candidate), bytes)
    assert.equal(readFileSync(grammarPath, 'utf8'), bytes)
    assert.equal(JSON.stringify({ alternatives, request, paperAsset }), authorityBefore)
  }
  console.log('PASS grammar alternatives: both branches/case/whitespace accepted; invalid, joined, punctuation, stemming and empty rejected at single/full seams; authority unchanged')

  const usage = spawnSync(process.execPath, ['scripts/import-pipeline/validate-analysis.mjs'], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.throws(() => validateNck1StagedAnalysis({ group: 'unknown', sourceGroup: { groupKey: 'unknown', material: {} }, authoritativeAnswers: {} }, {}), /Unsupported/)
  console.log('PASS single-group analysis: all 10 staged groups; no models, APIs or paper workspaces')
} finally {
  rmSync(root, { recursive: true, force: true })
}
