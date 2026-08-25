#!/usr/bin/env node
import assert from 'node:assert/strict'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as format2ImportJobModule from '../server/paper-import/format2ImportJob.mjs'
import {
  confirmVisualImportCandidate,
} from '../server/paper-canonical/visualCandidate.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  makeFormat2ImportJobFixture,
} from '../test-fixtures/paper-import/format2-import-job-v1/fixture.mjs'

const { startOrContinueFormat2ImportJob } = format2ImportJobModule
assert.deepEqual(
  Object.keys(format2ImportJobModule),
  ['startOrContinueFormat2ImportJob'],
  'Ticket 01 exposes one start-or-continue operation and no internal adapter/path controls',
)

function freshFixture(suffix = '') {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), `eqb-format2-job-${suffix}`))
  const fixture = makeFormat2ImportJobFixture({
    sourceDir: path.join(repositoryRoot, 'fixture-sources'),
  })
  return { repositoryRoot, fixture }
}

function run(repositoryRoot, input) {
  return startOrContinueFormat2ImportJob(input, { repositoryRoot })
}

function paperDir(repositoryRoot, paperId) {
  return path.join(repositoryRoot, 'scripts/import-pipeline/papers', paperId)
}

function artifactPath(repositoryRoot, result, artifactName) {
  return path.join(
    paperDir(repositoryRoot, 'paper-format2-synthetic'),
    result.artifacts[artifactName].relativePath,
  )
}

function assertFailed(result, code, diagnosticCode = code) {
  assert.equal(result.lifecycle, 'failed')
  assert.equal(result.stopReason.code, code)
  assert.equal(result.jobId, null)
  assert.equal(result.paperId, null)
  assert.equal(result.canonicalPublication, null)
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === diagnosticCode),
    `expected diagnostic ${diagnosticCode}, received ${JSON.stringify(result.diagnostics)}`,
  )
}

function failureCase(mutator, code, diagnosticCode = code) {
  const { repositoryRoot, fixture } = freshFixture('negative-')
  const input = structuredClone(fixture.input)
  mutator(input, { repositoryRoot, fixture })
  assertFailed(run(repositoryRoot, input), code, diagnosticCode)
}

const { repositoryRoot, fixture } = freshFixture('happy-')
const result = run(repositoryRoot, fixture.input)
assert.equal(result.schemaVersion, 'format2-import-job-result-v1')
assert.equal(result.paperId, fixture.input.paperId)
assert.deepEqual(result.provenance, fixture.input.provenance)
assert.equal(result.lifecycle, 'importing')
assert.equal(result.stopReason.code, 'exact_teacher_confirmation_required')
assert.match(result.jobId, /^format2-job:[a-f0-9]+$/u)
assert.equal(result.diagnostics.length, 5)
assert.ok(result.diagnostics.every((diagnostic) => diagnostic.code === 'VISUAL_CONFIRMATION_REQUIRED'))
assert.equal(result.canonicalPublication, null)
assert.equal(Object.hasOwn(result, 'authority'), false, 'callers and results do not select Canonical authority')
assert.equal(
  result.humanEntryPoints.comparison.packageDigest,
  result.artifacts.candidatePackage.packageDigest,
)
assert.equal(
  result.humanEntryPoints.comparison.href,
  '/papers/paper-format2-synthetic/format2-comparison',
)

const durablePaperDir = paperDir(repositoryRoot, fixture.input.paperId)
const currentPath = path.join(durablePaperDir, 'job/current.json')
const signalPath = path.join(durablePaperDir, 'signals/help-needed.json')
assert.equal(existsSync(currentPath), true)
assert.equal(existsSync(signalPath), true)
assert.equal(
  existsSync(path.join(repositoryRoot, 'app/public/paper-assets', fixture.input.paperId, 'latest')),
  false,
  'pre-confirmation start must not produce a local Publication',
)
const current = JSON.parse(readFileSync(currentPath, 'utf8'))
const currentText = readFileSync(currentPath, 'utf8')
assert.equal(current.schemaVersion, 'format2-import-job-receipt-v1')
assert.equal(current.disposition, 'stopped')
assert.equal(current.nextStopReason, 'exact_teacher_confirmation_required')
assert.equal(current.result.jobId, result.jobId)
assert.deepEqual(current.inputDigests, {
  questionPdfSha256: fixture.input.sources.questionPdf.sha256,
  answerPdfSha256: fixture.input.sources.answerPdf.sha256,
  transcriptionDigest: result.artifacts.transcription.digest,
})
assert.deepEqual(current.contractVersions, {
  transcription: 'format2-transcription-v1',
  sourceCapture: 'source-capture-v1',
  visualCandidate: 'visual-import-candidate-v1',
})
assert.equal(currentText.includes('Short synthetic passage'), false)
assert.equal(currentText.includes('officialAnswers'), false)
const signalText = readFileSync(signalPath, 'utf8')
const signal = JSON.parse(signalText)
assert.deepEqual(Object.keys(signal).sort(), [
  'at',
  'code',
  'comparisonEntryPoint',
  'packageDigest',
  'question',
  'resumeInstruction',
])
assert.equal(signal.packageDigest, result.artifacts.candidatePackage.packageDigest)
assert.equal(signalText.includes('Short synthetic passage'), false)
assert.equal(signalText.includes('Synthetic option'), false)
assert.equal(signalText.includes('officialAnswers'), false)

const sourceCapture = JSON.parse(readFileSync(artifactPath(repositoryRoot, result, 'sourceCapture'), 'utf8'))
assert.equal(sourceCapture.schemaVersion, 'source-capture-v1')
assert.equal(sourceCapture.documents.length, 2)
const questionDocument = sourceCapture.documents.find((document) => document.inputKey === 'question_pdf')
const answerDocument = sourceCapture.documents.find((document) => document.inputKey === 'answer_pdf')
assert.deepEqual(Buffer.from(questionDocument.encodedBytes, 'base64'), fixture.questionPdfBytes)
assert.deepEqual(Buffer.from(answerDocument.encodedBytes, 'base64'), fixture.answerPdfBytes)
assert.equal(questionDocument.sha256, fixture.input.sources.questionPdf.sha256)
assert.equal(answerDocument.sha256, fixture.input.sources.answerPdf.sha256)
assert.ok(sourceCapture.observations.every((observation) => (
  observation.value.pointGeometry
  && observation.value.pageSizePoints
  && observation.value.targetSizePoints
)))

const candidatePackage = JSON.parse(readFileSync(artifactPath(repositoryRoot, result, 'candidatePackage'), 'utf8'))
assert.equal(candidatePackage.packageDigest, result.artifacts.candidatePackage.packageDigest)
assert.equal(candidatePackage.status, 'awaiting_teacher_confirmation')
assert.equal(candidatePackage.candidates.length, 5)
assert.ok(candidatePackage.candidates.every((candidate) => candidate.method === 'source_crop'))
assert.equal(Object.hasOwn(candidatePackage, 'canonicalPaper'), false)
assert.equal(Object.hasOwn(candidatePackage, 'media'), false)
const comparisonText = readFileSync(artifactPath(repositoryRoot, result, 'comparison'), 'utf8')
assert.match(comparisonText, /normal target size/u)
assert.match(comparisonText, /question numbers, stems, and A-D labels remain renderer text/u)
assert.match(comparisonText, new RegExp(candidatePackage.packageDigest))
assert.equal(comparisonText.includes('Short synthetic passage'), false)
assert.equal(comparisonText.includes('Synthetic option'), false)

const rejectedSelection = confirmVisualImportCandidate(candidatePackage, {
  schemaVersion: 'visual-teacher-confirmation-v1',
  packageDigest: candidatePackage.packageDigest,
  decisions: candidatePackage.observations.map((observation) => ({
    observationId: observation.observationId,
    owner: structuredClone(observation.owner),
    disposition: 'rejected',
  })),
})
assert.equal(rejectedSelection.status, 'unresolved')
assert.equal(rejectedSelection.confirmedSelections.length, 0)
assert.ok(rejectedSelection.unresolvedIssues.every((issue) => issue.code === 'VISUAL_SELECTION_REJECTED'))
const incompleteSelection = confirmVisualImportCandidate(candidatePackage, {
  schemaVersion: 'visual-teacher-confirmation-v1',
  packageDigest: candidatePackage.packageDigest,
  decisions: [],
})
assert.equal(incompleteSelection.status, 'unresolved')
assert.equal(incompleteSelection.confirmedSelections.length, 0)

const currentBytesBefore = readFileSync(currentPath)
const signalBytesBefore = readFileSync(signalPath)
const repeat = run(repositoryRoot, fixture.input)
assert.deepEqual(repeat, result, 'unchanged start-or-continue must reproduce the exact public result')
assert.deepEqual(readFileSync(currentPath), currentBytesBefore)
assert.deepEqual(readFileSync(signalPath), signalBytesBefore)
const runsRoot = path.join(durablePaperDir, 'job/runs')
assert.equal(readdirSync(runsRoot).length, 1, 'unchanged retry must not duplicate immutable runs')

const changedGeometryInput = structuredClone(fixture.input)
changedGeometryInput.transcription.visuals[0].source.pointGeometry.x += 1
const changedGeometry = run(repositoryRoot, changedGeometryInput)
assert.equal(changedGeometry.lifecycle, 'importing')
assert.notEqual(changedGeometry.jobId, result.jobId)
assert.notEqual(
  changedGeometry.artifacts.sourceCapture.digest,
  result.artifacts.sourceCapture.digest,
)
assert.notEqual(
  changedGeometry.artifacts.candidatePackage.packageDigest,
  result.artifacts.candidatePackage.packageDigest,
)
assert.equal(readdirSync(runsRoot).length, 2, 'changed upstream evidence creates a new immutable run')
assert.equal(JSON.parse(readFileSync(currentPath, 'utf8')).result.jobId, changedGeometry.jobId)

const changedSourceInput = structuredClone(changedGeometryInput)
const changedQuestionBytes = Buffer.from('%PDF-1.7\n% changed exact synthetic question bytes\n')
writeFileSync(changedSourceInput.sources.questionPdf.absolutePath, changedQuestionBytes)
const changedQuestionDigest = sha256(new Uint8Array(changedQuestionBytes))
changedSourceInput.sources.questionPdf.sha256 = changedQuestionDigest
changedSourceInput.transcription.sourceBindings.questionPdfSha256 = changedQuestionDigest
const changedSource = run(repositoryRoot, changedSourceInput)
assert.equal(changedSource.lifecycle, 'importing')
assert.notEqual(changedSource.jobId, changedGeometry.jobId)
assert.notEqual(
  changedSource.artifacts.candidatePackage.packageDigest,
  changedGeometry.artifacts.candidatePackage.packageDigest,
)
assert.equal(readdirSync(runsRoot).length, 3)

const secondWriter = structuredClone(changedSourceInput)
secondWriter.state.writerId = 'another-writer'
assertFailed(run(repositoryRoot, secondWriter), 'FORMAT2_JOB_SECOND_WRITER')

failureCase(
  (input) => { input.paperId = '../unsafe-paper' },
  'FORMAT2_JOB_PAPER_ID_UNSAFE',
)
failureCase(
  (input) => { input.sources.format = 'format3-docx-pair-v1' },
  'FORMAT2_JOB_FORMAT_UNSUPPORTED',
)
failureCase(
  (input) => { input.sources.answerPdf.absolutePath += '.missing' },
  'FORMAT2_JOB_ANSWER_SOURCE_MISSING',
)
failureCase(
  (input) => { input.sources.questionPdf.absolutePath += '.missing' },
  'FORMAT2_JOB_QUESTION_SOURCE_MISSING',
)
failureCase(
  (input) => { input.sources.answerPdf.sha256 = `sha256:${'0'.repeat(64)}` },
  'FORMAT2_JOB_ANSWER_SOURCE_DIGEST_MISMATCH',
)
failureCase(
  (input) => { input.sources.questionPdf.sha256 = `sha256:${'0'.repeat(64)}` },
  'FORMAT2_JOB_QUESTION_SOURCE_DIGEST_MISMATCH',
)
failureCase(
  (input) => { input.transcription.sourceBindings.answerPdfSha256 = `sha256:${'0'.repeat(64)}` },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_TRANSCRIPTION_SOURCE_MISMATCH',
)
failureCase(
  (input) => { input.transcription.officialAnswers.pop() },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_OBJECTIVE_ANSWER_COVERAGE_INCOMPLETE',
)
failureCase(
  (input) => { input.transcription.groups[1].questions[0].questionId = 'question:reading-a:1' },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_TRANSCRIPTION_IDENTITY_DUPLICATE',
)
failureCase(
  (input) => { input.transcription.groups.shift() },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_VISUAL_OWNER_UNRESOLVED',
)
failureCase(
  (input) => {
    input.transcription.groups[1].questions[0].options[0] = {
      optionId: 'option:question:reading-b:2:a',
      label: 'A',
      contentKind: 'text',
      text: 'Mixed text Option is unsupported',
    }
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_READING_FIGURE_OPTIONS_UNSUPPORTED',
)
failureCase(
  (input) => { input.transcription.visuals[0].owner.groupId = 'group:unknown' },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_VISUAL_OWNER_UNRESOLVED',
)
failureCase(
  (input) => { input.transcription.visuals[1].owner = structuredClone(input.transcription.visuals[0].owner) },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_VISUAL_OWNER_DUPLICATE',
)
failureCase(
  (input) => { delete input.transcription.visuals[0].sourceCrop },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => { input.transcription.visuals[0].owner.kind = 'writing_poster' },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => { input.transcription.visuals[0].sourceCrop.pixelWidth += 1 },
  'VISUAL_CANDIDATE_PNG_DIMENSIONS_MISMATCH',
)
failureCase(
  (input) => { input.transcription.visuals[0].sourceCrop.encodedBytes = input.transcription.visuals[1].sourceCrop.encodedBytes },
  'VISUAL_CANDIDATE_PNG_BYTE_LENGTH_MISMATCH',
)
failureCase(
  (input) => { input.transcription.visuals[0].source.pointGeometry.width = 999 },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_VISUAL_GEOMETRY_INVALID',
)
failureCase(
  (input) => {
    input.transcription.visuals[0].alternatives.push({
      method: 'vector_authored',
      artifact: structuredClone(input.transcription.visuals[0].sourceCrop),
      sourceTruthChecklist: structuredClone(input.transcription.visuals[0].sourceTruthChecklist),
      reproducibility: { tool: 'fixture' },
    })
  },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => { input.authority = { manifestVersion: '999' } },
  'FORMAT2_JOB_REQUEST_INVALID',
)
failureCase(
  (input) => { input.transcription.officialAnswers[0].modelReasoning = 'A looks plausible' },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)

const conflict = freshFixture('conflict-')
const conflictResult = run(conflict.repositoryRoot, conflict.fixture.input)
const conflictCandidatePath = artifactPath(
  conflict.repositoryRoot,
  conflictResult,
  'candidatePackage',
)
writeFileSync(conflictCandidatePath, '{}\n')
assertFailed(
  run(conflict.repositoryRoot, conflict.fixture.input),
  'FORMAT2_JOB_DURABLE_STATE_CONFLICT',
)

console.log('PASS Format 2 Import Job start-or-continue exact pre-confirmation seam')
