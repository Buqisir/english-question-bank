import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeFixture } from './verify-nck1-source-materialization.mjs'
import { buildNck1AnalysisProjection, validateNck1StagedAnalysis } from '../server/import-review/nck1AnalysisProjection.mjs'
import { buildNck1CompatibilityPaperAsset, buildNck1ReviewConsumption } from '../server/import-review/revisionProjection.mjs'
import { buildListeningAnalysisAgentRequest } from '../server/paper-import-ai/analyzeListening.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { sha256, digestJson } from '../shared/paper-canonical/stable.mjs'
import { canonicalizeVisibleEnglishTypography } from '../shared/paper-canonical/visibleTypography.mjs'

// Reuse existing synthetic publication fixtures without running its DB/HTTP suite.
const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { objectiveFixtureGroup, writeStagedAnalyses } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous

const root = mkdtempSync(path.join(tmpdir(), 'single-group-analysis-'))
try {
  const source = makeFixture({ listening: true })
  // Raw 2023 I/II gloss typography; analyses use the teacher-visible spelling.
  source.groups.find(g => g.slotId === 'seven-choices').blocks[1].content[0].text +=
    ' To err（犯错）is human. feedback(反馈) portrayed(描绘) coding (编码)experiences. '
  source.groups.find(g => g.slotId === 'seven-choices').optionBank[0].text += " Don't discard feedback(反馈)."
  const displaySource = structuredClone(source)
  for (const group of displaySource.groups) {
    for (const option of group.optionBank) option.text = canonicalizeVisibleEnglishTypography(option.text, '4')
    for (const block of group.blocks.filter(b => b.kind === 'paragraph')) {
      for (const inline of block.content.filter(i => i.kind === 'text')) {
        inline.text = canonicalizeVisibleEnglishTypography(inline.text, '4')
      }
    }
  }
  writeStagedAnalyses(root, displaySource)
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
    if (key === 'seven') {
      Object.values(analysis.questions)[0].contextEvidence.afterQuote = 'feedback (反馈)'
      Object.values(analysis.questions)[0].mechanismSignals[1].signalText = 'Don’t discard feedback (反馈).'
      writeFileSync(path.join(root, filename), JSON.stringify(analysis))
    }
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

    if (key === 'seven') {
      const canonicalSource = structuredClone(source)
      const documents = canonicalSource.documents.map(document => {
        const bytes = new TextEncoder().encode(`%PDF-1.7 synthetic ${document.documentId}`.padEnd(100, 'x'))
        document.sha256 = sha256(bytes)
        return { documentId: document.documentId, bytes }
      })
      const imported = importCanonicalCandidate({ kind: 'nck1-source-materialization', documents, media: [],
        materializationBytes: new TextEncoder().encode(JSON.stringify(canonicalSource)) })
      assert.deepEqual(imported.issues, [])
      const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
      assert.ok(preview.compilation, JSON.stringify(preview.unresolvedIssues))
      const consumption = buildNck1ReviewConsumption(preview.candidate, preview.compilation)
      const consumptionPath = path.join(root, 'consumption.json')
      const runWithConsumption = () => spawnSync(process.execPath,
        ['scripts/import-pipeline/validate-analysis.mjs', requestPath, candidatePath, '--consumption', consumptionPath],
        { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' })
      writeFileSync(consumptionPath, JSON.stringify(consumption))
      const aligned = runWithConsumption()
      assert.equal(aligned.status, 0, aligned.stderr)
      const paperAsset = buildNck1CompatibilityPaperAsset({
        config: { provenance: { paperName: 'Gloss fixture', source: 'Verifier', year: 2026 } },
        materialization: source, sourceAssetVersion: 1,
      })
      const authorityBefore = JSON.stringify({ source, paperAsset })
      const full = () => buildNck1AnalysisProjection({ rootDir: root,
        materialization: source, paperAsset, requireTeachingContent: true })
      assert.ok(full().sidecars['seven-choices-analysis-v1.json'])
      const forged = structuredClone(analysis)
      Object.values(forged.questions)[0].contextEvidence.afterQuote = 'FORGED (伪造)'
      writeFileSync(candidatePath, JSON.stringify(forged))
      writeFileSync(path.join(root, filename), JSON.stringify(forged))
      for (const runCheck of [run, runWithConsumption]) {
        const rejected = runCheck()
        assert.equal(rejected.status, 1, rejected.stdout)
        assert.match(rejected.stderr, /afterQuote 必须精确匹配原文/)
      }
      assert.throws(full, /afterQuote 必须精确匹配原文/)
      writeFileSync(candidatePath, JSON.stringify(analysis))
      writeFileSync(path.join(root, filename), JSON.stringify(analysis))
      assert.equal(JSON.stringify({ source, paperAsset }), authorityBefore)
      const selection = consumption.selections.find(s => s.familyContractId === 'seven-choices')
      const occurrence = selection.projectedOccurrences.find(o => o.groupId === group.groupId)
      const paragraph = occurrence.content.blocks.find(b => b.nodeId === 'block:seven-choices')
      paragraph.inlines[0].text = paragraph.inlines[0].text
        .replace('To err (犯错) is human.', 'Invented sentence.')
      selection.projectedOccurrenceDigests.find(d => d.groupId === group.groupId).digest = digestJson(occurrence)
      writeFileSync(consumptionPath, JSON.stringify(consumption))
      const mismatch = runWithConsumption()
      assert.equal(mismatch.status, 1, mismatch.stdout)
      assert.match(mismatch.stderr, /source paragraph .* does not match TextMap/)
      rmSync(consumptionPath)
      assert.equal(readFileSync(requestPath, 'utf8'), JSON.stringify(request))
      assert.equal(readFileSync(candidatePath, 'utf8'), JSON.stringify(analysis))
      console.log('PASS gloss quotes: raw 2023 I/II source accepted at single/freeze/TextMap seams; forged quote and TextMap drift rejected; source unchanged')
    }

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
      const withoutModel = structuredClone(analysis)
      delete withoutModel.modelAnswer
      assert.equal(validateNck1StagedAnalysis(request, withoutModel).ok, true)
      writeFileSync(candidatePath, JSON.stringify(withoutModel))
      const noModelResult = run()
      assert.equal(noModelResult.status, 0, `${key} without modelAnswer: ${noModelResult.stderr}`)
      assert.equal(noModelResult.stderr, '', 'no absent-essay word-count warning')
      for (const modelAnswer of ['', ' ', null, 42]) {
        assert.throws(() => validateNck1StagedAnalysis(request, { ...withoutModel, modelAnswer }))
      }
      assert.throws(() => validateNck1StagedAnalysis(request,
        { ...withoutModel, officialModelAnswer: 'Invented official answer' }), /source authority/)
      if (key === 'application') {
        assert.throws(() => validateNck1StagedAnalysis(request,
          { ...analysis, modelAnswer: 'Dear Chris, Too short. Yours, Li Hua' }), /word count/)
        const missingCard = structuredClone(withoutModel)
        delete missingCard.reviewCard
        assert.throws(() => validateNck1StagedAnalysis(request, missingCard), /keys|reviewCard/)
      } else {
        const badEvidence = structuredClone(withoutModel)
        badEvidence.continuationAnalysis.storyUnderstanding.centralSituation.evidence[0].excerpt = 'FORGED'
        assert.throws(() => validateNck1StagedAnalysis(request, badEvidence), /evidence excerpt/)
      }
      const officialRequest = structuredClone(request)
      officialRequest.authoritativeAnswers.officialModelAnswer = 'A source-owned official sample.'
      officialRequest.sourceGroup.material.writingTask.officialModelAnswer = 'A source-owned official sample.'
      assert.equal(validateNck1StagedAnalysis(officialRequest, analysis).ok, true)
      assert.equal(validateNck1StagedAnalysis(officialRequest, withoutModel).ok, true)
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

  // Accept the complete official key or a legacy single branch, never a
  // different joined answer. Exercise both public seams with immutable authority.
  for (const answerKey of ['which/that', 'that']) {
    const alternatives = structuredClone(displaySource)
    const grammarSource = alternatives.groups.find((group) => group.slotId === 'grammar-fill')
    const questionId = grammarSource.questions.find((question) => question.canonicalNumber === 57).questionId
    alternatives.answers.find((answer) => answer.questionId === questionId).value = answerKey
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
      ['which', answerKey === 'which/that'], ['that', true], ['  ThAt  ', true],
      ['who', false], ['which/that', answerKey === 'which/that'], ['that/which', false],
      ['that.', false], ['whiches', false], ['', false],
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
  }
  console.log('PASS grammar alternatives: exact complete key and legacy branches accepted; different joined answers, invalid, punctuation, stemming and empty rejected at single/full seams; authority unchanged')

  const usage = spawnSync(process.execPath, ['scripts/import-pipeline/validate-analysis.mjs'], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.throws(() => validateNck1StagedAnalysis({ group: 'unknown', sourceGroup: { groupKey: 'unknown', material: {} }, authoritativeAnswers: {} }, {}), /Unsupported/)
  console.log('PASS single-group analysis: all 10 staged groups; no models, APIs or paper workspaces')
} finally {
  rmSync(root, { recursive: true, force: true })
}
