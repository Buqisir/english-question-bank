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
  createFormat2ImportJobRuntime,
} from '../server/paper-import/internal/format2ImportJobRuntime.mjs'
import {
  confirmVisualImportCandidate,
} from '../server/paper-canonical/visualCandidate.mjs'
import { readingOptionFigureAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  makeFormat2ImportJobFixture,
} from '../test-fixtures/paper-import/format2-import-job-v1/fixture.mjs'

const { resumeFormat2ImportJob, startOrContinueFormat2ImportJob } = format2ImportJobModule
assert.deepEqual(
  Object.keys(format2ImportJobModule),
  ['resumeFormat2ImportJob', 'startOrContinueFormat2ImportJob'],
  'the public Job exposes only start-or-continue and exact-confirmation resume operations',
)
assert.equal(
  startOrContinueFormat2ImportJob.length,
  1,
  'the public operation accepts exactly one domain input',
)
assert.equal(
  resumeFormat2ImportJob.length,
  1,
  'the public resume operation accepts exactly one domain input',
)

function freshFixture(suffix = '') {
  const repositoryRoot = mkdtempSync(path.join(tmpdir(), `eqb-format2-job-${suffix}`))
  const fixture = makeFormat2ImportJobFixture({
    sourceDir: path.join(repositoryRoot, 'fixture-sources'),
  })
  return { repositoryRoot, fixture }
}

function run(repositoryRoot, input) {
  return createFormat2ImportJobRuntime({ repositoryRoot })
    .startOrContinueFormat2ImportJob(input)
}

function resume(repositoryRoot, input, runtimeOptions = {}) {
  return createFormat2ImportJobRuntime({ repositoryRoot, ...runtimeOptions })
    .resumeFormat2ImportJob(input)
}

function exactConfirmation(candidatePackage) {
  return {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidatePackage.packageDigest,
    decisions: candidatePackage.observations.map((observation) => ({
      observationId: observation.observationId,
      owner: structuredClone(observation.owner),
      disposition: 'confirmed',
      selectedCandidateDigest: candidatePackage.candidates.find(
        (candidate) => candidate.observationId === observation.observationId,
      ).candidateDigest,
    })),
  }
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
const pathChoiceRoot = mkdtempSync(path.join(tmpdir(), 'eqb-format2-public-path-choice-'))
const publicPathChoice = startOrContinueFormat2ImportJob(
  fixture.input,
  { repositoryRoot: pathChoiceRoot },
)
assertFailed(publicPathChoice, 'FORMAT2_JOB_REQUEST_INVALID')
assert.equal(
  existsSync(path.join(
    pathChoiceRoot,
    'scripts/import-pipeline/papers',
    fixture.input.paperId,
    'job',
  )),
  false,
  'public callers cannot redirect Job storage through a second argument',
)
const publicInputPathChoice = structuredClone(fixture.input)
publicInputPathChoice.repositoryRoot = pathChoiceRoot
assertFailed(
  startOrContinueFormat2ImportJob(publicInputPathChoice),
  'FORMAT2_JOB_REQUEST_INVALID',
)
assert.equal(
  existsSync(path.join(
    pathChoiceRoot,
    'scripts/import-pipeline/papers',
    fixture.input.paperId,
    'job',
  )),
  false,
  'public domain input rejects embedded repository/storage path selection',
)
assertFailed(
  resumeFormat2ImportJob({
    paperId: fixture.input.paperId,
    jobId: 'format2-job:aaaaaaaaaaaaaaaaaaaaa',
    teacherConfirmation: {},
  }, { repositoryRoot: pathChoiceRoot }),
  'FORMAT2_JOB_REQUEST_INVALID',
)
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
  authorityDigest: digestJson(readingOptionFigureAuthorityRef),
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

const rejectedResume = resume(repositoryRoot, {
  paperId: fixture.input.paperId,
  jobId: result.jobId,
  teacherConfirmation: {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidatePackage.packageDigest,
    decisions: candidatePackage.observations.map((observation) => ({
      observationId: observation.observationId,
      owner: structuredClone(observation.owner),
      disposition: 'rejected',
    })),
  },
})
assert.equal(rejectedResume.lifecycle, 'importing')
assert.ok(rejectedResume.diagnostics.every((issue) => issue.code === 'VISUAL_SELECTION_REJECTED'))
assert.equal(existsSync(path.join(repositoryRoot, 'app/public/paper-assets', fixture.input.paperId)), false)

const incompleteResume = resume(repositoryRoot, {
  paperId: fixture.input.paperId,
  jobId: result.jobId,
  teacherConfirmation: {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidatePackage.packageDigest,
    decisions: [],
  },
})
assert.equal(incompleteResume.lifecycle, 'importing')
assert.ok(incompleteResume.diagnostics.every((issue) => issue.code === 'VISUAL_SELECTION_UNCONFIRMED'))

const exactTeacherConfirmation = exactConfirmation(candidatePackage)
const staleConfirmation = structuredClone(exactTeacherConfirmation)
staleConfirmation.packageDigest = `sha256:${'a'.repeat(64)}`
assertFailed(
  resume(repositoryRoot, {
    paperId: fixture.input.paperId,
    jobId: result.jobId,
    teacherConfirmation: staleConfirmation,
  }),
  'FORMAT2_JOB_CONFIRMATION_STALE',
)
const substitutedConfirmation = structuredClone(exactTeacherConfirmation)
substitutedConfirmation.decisions[0].selectedCandidateDigest =
  substitutedConfirmation.decisions[1].selectedCandidateDigest
assertFailed(
  resume(repositoryRoot, {
    paperId: fixture.input.paperId,
    jobId: result.jobId,
    teacherConfirmation: substitutedConfirmation,
  }),
  'VISUAL_CONFIRMATION_CANDIDATE_MISMATCH',
)

const completed = resume(repositoryRoot, {
  paperId: fixture.input.paperId,
  jobId: result.jobId,
  teacherConfirmation: exactTeacherConfirmation,
})
assert.equal(completed.lifecycle, 'awaiting_qa')
assert.equal(completed.stopReason.code, 'owner_qa_required')
assert.equal(completed.canonicalPublication.paperId, fixture.input.paperId)
assert.equal(completed.canonicalPublication.versionName, 'v1')
assert.equal(completed.canonicalPublication.sourceAssetVersion, 1)
assert.match(completed.canonicalPublication.publicationDigest, /^sha256:[a-f0-9]{64}$/u)
assert.equal(completed.canonicalPublication.reloads.screen.disposition, 'ready')
assert.equal(completed.canonicalPublication.reloads.printPdf.disposition, 'ready')
assert.deepEqual(completed.humanEntryPoints.firstFocusState, {
  view: 'paper-browse',
  paperId: fixture.input.paperId,
  lecture: false,
})
assert.match(completed.humanEntryPoints.screen.href, /view=paper-browse/u)
assert.equal(completed.humanEntryPoints.studentPrint.href.includes('lecture=1'), false)
assert.equal(completed.humanEntryPoints.teacherPrint.href.includes('lecture=1'), true)
assert.equal(JSON.stringify(completed.humanEntryPoints.studentPrint).includes('answer'), false)
assert.equal(JSON.stringify(completed.humanEntryPoints.studentPrint).includes('Analysis'), false)
assert.match(completed.humanEntryPoints.pdf.mode, /pdf/u)
assert.match(completed.humanEntryPoints.gateSummary, /exact reload/u)
assert.equal(
  existsSync(path.join(repositoryRoot, 'app/public/paper-assets', fixture.input.paperId, 'latest')),
  true,
  'awaiting_qa requires one exact committed local latest Publication',
)
assert.equal(existsSync(path.join(durablePaperDir, 'signals/ai-answer-check.json')), true)
assert.equal(existsSync(signalPath), false, 'exact confirmation clears the help-needed projection')
assert.equal(existsSync(path.join(durablePaperDir, 'signals/qa-accepted.json')), false)
assert.equal(existsSync(path.join(durablePaperDir, 'signals/shipped.json')), false)
assert.equal(existsSync(path.join(repositoryRoot, 'production')), false)
const completedReceipt = JSON.parse(readFileSync(currentPath, 'utf8'))
assert.equal(completedReceipt.result.lifecycle, 'awaiting_qa')
assert.equal(completedReceipt.nextStopReason, 'owner_qa_required')
assert.equal(Object.hasOwn(completedReceipt.result, 'authority'), false)

const completedAgain = resume(repositoryRoot, {
  paperId: fixture.input.paperId,
  jobId: result.jobId,
  teacherConfirmation: exactTeacherConfirmation,
})
assert.deepEqual(completedAgain, completed, 'unchanged completed resume is an exact proven no-op')
const authorityBoundReceiptBytes = readFileSync(currentPath)
const staleAuthorityReceipt = JSON.parse(authorityBoundReceiptBytes)
staleAuthorityReceipt.inputDigests.authorityDigest = `sha256:${'b'.repeat(64)}`
writeFileSync(currentPath, `${JSON.stringify(staleAuthorityReceipt, null, 2)}\n`)
assertFailed(
  resume(repositoryRoot, {
    paperId: fixture.input.paperId,
    jobId: result.jobId,
    teacherConfirmation: exactTeacherConfirmation,
  }),
  'FORMAT2_JOB_AUTHORITY_STALE',
)
writeFileSync(currentPath, authorityBoundReceiptBytes)
assertFailed(
  resume(repositoryRoot, {
    paperId: fixture.input.paperId,
    jobId: result.jobId,
    teacherConfirmation: {
      ...structuredClone(exactTeacherConfirmation),
      decisions: [...exactTeacherConfirmation.decisions].reverse(),
    },
  }),
  'FORMAT2_JOB_CONFIRMATION_STALE',
)

const currentBytesBefore = readFileSync(currentPath)
const repeat = run(repositoryRoot, fixture.input)
assert.deepEqual(repeat, completed, 'unchanged start-or-continue retains exact committed awaiting_qa')
assert.deepEqual(readFileSync(currentPath), currentBytesBefore)
const runsRoot = path.join(durablePaperDir, 'job/runs')
assert.equal(readdirSync(runsRoot).length, 1, 'unchanged retry must not duplicate immutable runs')

const changedGeometryInput = structuredClone(fixture.input)
changedGeometryInput.transcription.visuals[0].source.pointGeometry.x += 1
const changedGeometry = run(repositoryRoot, changedGeometryInput)
assert.equal(changedGeometry.lifecycle, 'importing')
assert.equal(changedGeometry.stopReason.code, 'exact_teacher_confirmation_required')
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
assert.equal(
  existsSync(path.join(durablePaperDir, 'signals/ai-answer-check.json')),
  false,
  'upstream invalidation cannot retain awaiting_qa',
)
assertFailed(
  resume(repositoryRoot, {
    paperId: fixture.input.paperId,
    jobId: result.jobId,
    teacherConfirmation: exactTeacherConfirmation,
  }),
  'FORMAT2_JOB_IDENTITY_MISMATCH',
)

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
  (input) => { input.transcription.officialAnswers[0].answer = 'Z' },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_ANSWER_OPTION_MISMATCH',
)
failureCase(
  (input) => { input.transcription.groups[1].questions[0].questionId = 'question:reading-a:21' },
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
  (input) => { input.transcription.canonicalPaper = { questionGroups: [] } },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => { input.transcription.publicationManifest = { versionName: 'v1' } },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => { delete input.transcription.groups[0].slotId },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => {
    delete input.transcription.groups
      .find((group) => group.slotId === 'writing.continuation')
      .blocks[0].wordCountTarget
  },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
failureCase(
  (input) => {
    delete input.transcription.groups
      .find((group) => group.slotId === 'writing.application')
      .blocks[0].applicationEvidence
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_TRANSCRIPTION_GROUP_SHAPE_INVALID',
)
failureCase(
  (input) => {
    delete input.transcription.groups
      .find((group) => group.slotId === 'writing.continuation')
      .blocks[0].sourceInstruction
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_TRANSCRIPTION_GROUP_SHAPE_INVALID',
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

const recovery = freshFixture('recovery-')
const recoveryStarted = run(recovery.repositoryRoot, recovery.fixture.input)
const recoveryCandidate = JSON.parse(readFileSync(
  artifactPath(recovery.repositoryRoot, recoveryStarted, 'candidatePackage'),
  'utf8',
))
const recoveryConfirmation = exactConfirmation(recoveryCandidate)
assertFailed(
  resume(recovery.repositoryRoot, {
    paperId: recovery.fixture.input.paperId,
    jobId: recoveryStarted.jobId,
    teacherConfirmation: recoveryConfirmation,
  }, { publicationFailurePoint: 'after-version-rename-crash' }),
  'CANONICAL_PUBLICATION_FORCED_CRASH',
)
const recoveryJournal = path.join(
  recovery.repositoryRoot,
  'app/public/paper-assets',
  recovery.fixture.input.paperId,
  '.canonical-latest-swap-v1.json',
)
assert.equal(existsSync(recoveryJournal), true, 'interrupted publish retains exact recovery evidence')
const recovered = resume(recovery.repositoryRoot, {
  paperId: recovery.fixture.input.paperId,
  jobId: recoveryStarted.jobId,
  teacherConfirmation: recoveryConfirmation,
})
assert.equal(recovered.lifecycle, 'awaiting_qa')
assert.equal(recovered.canonicalPublication.versionName, 'v1')
assert.equal(existsSync(recoveryJournal), false, 'retry consumes the recovery journal')

const immutable = freshFixture('immutable-')
const immutableStarted = run(immutable.repositoryRoot, immutable.fixture.input)
const immutableCandidate = JSON.parse(readFileSync(
  artifactPath(immutable.repositoryRoot, immutableStarted, 'candidatePackage'),
  'utf8',
))
const immutableConfirmation = exactConfirmation(immutableCandidate)
const immutableCompleted = resume(immutable.repositoryRoot, {
  paperId: immutable.fixture.input.paperId,
  jobId: immutableStarted.jobId,
  teacherConfirmation: immutableConfirmation,
})
assert.equal(immutableCompleted.lifecycle, 'awaiting_qa')
const immutableManifestPath = path.join(
  immutable.repositoryRoot,
  'app/public/paper-assets',
  immutable.fixture.input.paperId,
  'versions/v1/canonical/canonical-paper-publication-v46.json',
)
const immutableManifestBefore = readFileSync(immutableManifestPath)
const changedCanonicalInput = structuredClone(immutable.fixture.input)
changedCanonicalInput.transcription.groups
  .find((group) => group.slotId === 'reading.c')
  .blocks[0].text += ' Changed exact source transcription.'
const changedCanonicalStarted = run(immutable.repositoryRoot, changedCanonicalInput)
assert.equal(changedCanonicalStarted.lifecycle, 'importing')
assert.notEqual(changedCanonicalStarted.jobId, immutableStarted.jobId)
const changedCanonicalCandidate = JSON.parse(readFileSync(
  artifactPath(immutable.repositoryRoot, changedCanonicalStarted, 'candidatePackage'),
  'utf8',
))
assertFailed(
  resume(immutable.repositoryRoot, {
    paperId: immutable.fixture.input.paperId,
    jobId: changedCanonicalStarted.jobId,
    teacherConfirmation: exactConfirmation(changedCanonicalCandidate),
  }),
  'CANONICAL_PUBLICATION_IDENTITY_CONFLICT',
)
assert.deepEqual(
  readFileSync(immutableManifestPath),
  immutableManifestBefore,
  'incompatible immutable publication is neither overwritten nor mixed',
)

console.log('PASS Format 2 Import Job exact confirmation resume to durable local QA')
