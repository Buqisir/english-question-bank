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
import { DatabaseSync } from 'node:sqlite'

import * as format2ImportJobModule from '../server/paper-import/format2ImportJob.mjs'
import {
  createFormat2ImportJobRuntime,
} from '../server/paper-import/internal/format2ImportJobRuntime.mjs'
import {
  confirmVisualImportCandidate,
} from '../server/paper-canonical/visualCandidate.mjs'
import { readingOptionFigureAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { readingOptionFigureConsumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumptionSync,
} from '../server/paper-canonical/publication.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { grammarFillRhythm } from '../shared/paper-canonical/grammarFillRhythm.mjs'
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

function visibleStructureBlocks(consumption) {
  return consumption.visibleStructure.flatMap((node) => {
    if (node.kind === 'group') {
      return [{ type: 'question_group', questionGroupId: node.groupId, score: 0 }]
    }
    if (node.kind !== 'instruction' || node.renderPolicy !== 'render') return []
    if (node.placement === 'part_heading' || node.placement === 'section_heading') {
      return [{ type: 'section_header', title: node.text, instructionId: node.instructionId }]
    }
    if (node.placement === 'group_instruction') {
      return [{ type: 'instruction', text: node.text, instructionId: node.instructionId }]
    }
    return []
  })
}

function failureCase(mutator, code, diagnosticCode = code) {
  const { repositoryRoot, fixture } = freshFixture('negative-')
  const input = structuredClone(fixture.input)
  mutator(input, { repositoryRoot, fixture })
  assertFailed(run(repositoryRoot, input), code, diagnosticCode)
}

failureCase((input) => {
  delete input.transcription.answerTranscriptionCheck
}, 'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID')
failureCase((input) => {
  input.transcription.answerTranscriptionCheck.answerPdfSha256 = `sha256:${'a'.repeat(64)}`
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')
failureCase((input) => {
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].answer = 'B'
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')
failureCase((input) => {
  input.transcription.answerTranscriptionCheck.extraction.extractedText += ' tampered'
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')
failureCase((input) => {
  input.transcription.answerTranscriptionCheck.extraction.extractedText += ' forged but digest-consistent'
  input.transcription.answerTranscriptionCheck.extraction.extractedTextSha256 = sha256(
    new TextEncoder().encode(input.transcription.answerTranscriptionCheck.extraction.extractedText),
  )
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')
failureCase((input) => {
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].byteSpan.start += 1
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')
failureCase((input) => {
  input.transcription.officialAnswers[0].answer = 'B'
  input.transcription.answerTranscriptionCheck.officialAnswersDigest = digestJson(
    input.transcription.officialAnswers,
  )
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].answer = 'B'
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].sourceMarking = '21=B'
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')

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
  answerTranscriptionCheckDigest: digestJson(fixture.input.transcription.answerTranscriptionCheck),
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
const questionDocument = sourceCapture.documents.find((document) => document.inputKey === 'original_question_source')
const answerDocument = sourceCapture.documents.find((document) => document.inputKey === 'listening_answer_source')
assert.deepEqual(Buffer.from(questionDocument.encodedBytes, 'base64'), fixture.questionPdfBytes)
assert.deepEqual(Buffer.from(answerDocument.encodedBytes, 'base64'), fixture.answerPdfBytes)
assert.equal(
  Buffer.from(answerDocument.encodedBytes, 'base64').toString('utf8').includes('21-23'),
  false,
  'compressed/encoded answer PDF bytes need not expose answer markings as plaintext',
)
const extractedAnswerText = fixture.input.transcription.answerTranscriptionCheck.extraction.extractedText
assert.deepEqual(
  fixture.input.transcription.answerTranscriptionCheck.extraction.parameters,
  ['-layout', '-enc', 'UTF-8', '-', '-'],
  'shared answer extraction covers the entire PDF and has no paper-specific page truncation',
)
assert.match(extractedAnswerText, /21-23 AAA/u)
for (const officialAnswer of fixture.input.transcription.officialAnswers) {
  const marking = fixture.input.transcription.answerTranscriptionCheck.sourceMarkings.find(
    (candidate) => candidate.questionId === officialAnswer.questionId,
  )
  assert.equal(
    Buffer.from(extractedAnswerText).subarray(marking.byteSpan.start, marking.byteSpan.end).toString('utf8'),
    marking.sourceMarking,
  )
  assert.equal(
    Buffer.from(extractedAnswerText)
      .subarray(marking.answerByteSpan.start, marking.answerByteSpan.end)
      .toString('utf8'),
    officialAnswer.answer,
  )
}
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
assert.deepEqual(completed.humanEntryPoints.service, {
  command: 'PORT=5173 bash scripts/dev.sh',
  appOrigin: 'http://127.0.0.1:5173',
  qaArtifactCommand: 'node import-ops/server.mjs',
  qaArtifactOrigin: 'http://127.0.0.1:8790',
})
assert.equal(
  new URL(completed.humanEntryPoints.screen.href).origin,
  completed.humanEntryPoints.service.appOrigin,
)
for (const key of ['studentPrint', 'teacherPrint', 'pdf']) {
  const entry = completed.humanEntryPoints[key]
  assert.equal(new URL(entry.href).origin, completed.humanEntryPoints.service.qaArtifactOrigin)
  assert.equal(entry.kind, 'artifact_url')
  assert.equal(entry.method, 'GET')
  assert.match(entry.sha256, /^sha256:[a-f0-9]{64}$/u)
  assert.ok(entry.byteLength > 0)
}
assert.match(completed.humanEntryPoints.studentPrint.mediaType, /^text\/html/u)
assert.match(completed.humanEntryPoints.teacherPrint.mediaType, /^text\/html/u)
assert.equal(completed.humanEntryPoints.pdf.mediaType, 'application/pdf')
assert.match(completed.humanEntryPoints.gateSummary, /exact reload/u)
assert.equal(completed.humanEntryPoints.qaAcceptance.identity.jobId, completed.jobId)
assert.equal(
  completed.humanEntryPoints.qaAcceptance.identity.publicationDigest,
  completed.canonicalPublication.publicationDigest,
)
assert.equal(
  completed.humanEntryPoints.qaAcceptance.expectedReceipt.qaIdentityDigest,
  completed.humanEntryPoints.qaAcceptance.identity.qaIdentityDigest,
)
assert.equal(
  completed.humanEntryPoints.qaAcceptance.identity.qaArtifactsManifestDigest,
  digestJson(completed.artifacts.qa),
)
assert.equal(
  completed.humanEntryPoints.qaAcceptance.expectedReceipt.qaArtifactsManifestDigest,
  digestJson(completed.artifacts.qa),
)
assert.equal(
  existsSync(path.join(repositoryRoot, 'app/public/paper-assets', fixture.input.paperId, 'latest')),
  true,
  'awaiting_qa requires one exact committed local latest Publication',
)
assert.equal(
  existsSync(path.join(repositoryRoot, 'data/question-bank.sqlite')),
  true,
  'awaiting_qa is committed to the same default database consumed by server/api.mjs',
)
assert.equal(
  existsSync(path.join(durablePaperDir, 'job/canonical-publication.sqlite')),
  false,
  'the Job cannot self-prove through a private publication database',
)

const publicDb = new DatabaseSync(path.join(repositoryRoot, 'data/question-bank.sqlite'))
try {
  const publicStore = createFileSystemCanonicalPublicationStore({
    rootDir: path.join(repositoryRoot, 'app/public/paper-assets'),
    db: publicDb,
  })
  const screenConsumption = loadPaperForConsumptionSync({
    paperId: fixture.input.paperId,
    version: completed.canonicalPublication.versionName,
    consumerContract: readingOptionFigureConsumerContractRefs.screen,
  }, publicStore)
  const printConsumption = loadPaperForConsumptionSync({
    paperId: fixture.input.paperId,
    version: completed.canonicalPublication.versionName,
    consumerContract: readingOptionFigureConsumerContractRefs.print_pdf,
  }, publicStore)
  assert.equal(screenConsumption.disposition, 'ready')
  assert.equal(printConsumption.disposition, 'ready')
  assert.equal(screenConsumption.selections.some((selection) => selection.familyContractId === 'listening'), false)
  assert.equal(printConsumption.selections.some((selection) => selection.familyContractId === 'listening'), false)
  const qaArtifacts = completed.artifacts.qa
  assert.equal(qaArtifacts.schemaVersion, 'format2-qa-artifacts-v1')
  const artifactBytes = Object.fromEntries(['studentPrint', 'teacherPrint', 'pdf'].map((key) => {
    const artifact = qaArtifacts[key]
    const bytes = readFileSync(path.join(durablePaperDir, artifact.relativePath))
    assert.equal(bytes.byteLength, artifact.byteLength)
    assert.equal(sha256(new Uint8Array(bytes)), artifact.sha256)
    assert.equal(completed.humanEntryPoints[key].sha256, artifact.sha256)
    return [key, bytes]
  }))
  assert.equal(artifactBytes.pdf.subarray(0, 4).toString(), '%PDF')
  const studentArtifactHtml = artifactBytes.studentPrint.toString('utf8')
  const teacherArtifactHtml = artifactBytes.teacherPrint.toString('utf8')
  assert.equal(studentArtifactHtml.includes('<strong>【答案】</strong>'), false)
  assert.equal(studentArtifactHtml.includes('Analysis sentinel'), false)
  assert.equal(teacherArtifactHtml.includes('<strong>【答案】</strong>'), true)
  const expectedGroupIds = printConsumption.visibleStructure
    .filter((node) => node.kind === 'group')
    .map((node) => node.groupId)
  for (const groupId of expectedGroupIds) {
    assert.equal(
      (studentArtifactHtml.match(new RegExp(`data-canonical-group-id="${groupId}"`, 'gu')) || []).length,
      1,
      `Student Print contains canonical Group ${groupId} exactly once`,
    )
    assert.equal(
      (teacherArtifactHtml.match(new RegExp(`data-canonical-group-id="${groupId}"`, 'gu')) || []).length,
      1,
      `Teacher Print contains canonical Group ${groupId} exactly once`,
    )
  }
  for (const selection of printConsumption.selections) {
    for (const groupId of selection.groupIds) {
      const projected = projectCanonicalConsumerGroup({
        consumption: printConsumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      for (const question of projected.questions) {
        assert.equal(studentArtifactHtml.includes(`data-canonical-question-id="${question.questionId}"`), true)
        assert.equal(teacherArtifactHtml.includes(`data-canonical-question-id="${question.questionId}"`), true)
      }
    }
  }
  for (const support of qaArtifacts.support) {
    const bytes = readFileSync(path.join(durablePaperDir, support.relativePath))
    assert.equal(bytes.byteLength, support.byteLength)
    assert.equal(sha256(new Uint8Array(bytes)), support.sha256)
  }
  const printGroup = projectCanonicalConsumerGroup({
    consumption: printConsumption,
    familyContractId: 'reading',
    groupId: 'group:reading-a',
  })
  const admittedAnswer = printGroup.questions[0].options.find(
    (option) => option.optionId === printGroup.questions[0].correctOptionId,
  ).label
  const item = {
    detail: {
      id: printGroup.groupId,
      paperId: printGroup.paperId,
      title: 'Committed Format 2 renderer proof',
      source: 'Committed Format 2 renderer proof',
      groupType: 'reading',
      passage: { title: '', materialText: '' },
      questions: printGroup.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: question.stem,
        answer: question.options.find((option) => option.optionId === question.correctOptionId).label,
        explanation: 'Analysis sentinel must be teacher-only',
        options: question.options.map((option) => ({ label: option.label, content: option.text })),
      })),
    },
    score: 2.5,
    sectionTitle: 'Reading',
    note: '',
  }
  const blocks = [{ type: 'question_group', questionGroupId: printGroup.groupId, score: 2.5 }]
  const studentHtml = buildPrintHtml({
    title: 'Committed Format 2 renderer proof',
    versionType: 'student',
    printStyle: 'exam',
    items: [item],
    blocks,
    canonicalConsumption: printConsumption,
  })
  const teacherHtml = buildPrintHtml({
    title: 'Committed Format 2 renderer proof',
    versionType: 'teacher',
    printStyle: 'exam',
    items: [item],
    blocks,
    canonicalConsumption: printConsumption,
  })
  assert.equal(studentHtml.includes('<strong>【答案】</strong>'), false)
  assert.equal(studentHtml.includes('Analysis sentinel'), false)
  assert.equal(teacherHtml.includes(`<strong>【答案】</strong>${admittedAnswer}`), true)

  const internalExporterInput = {
    title: 'Canonical visible structure fail-closed proof',
    versionType: 'student',
    items: [{ questionGroupId: item.detail.id, score: 2.5, sectionTitle: 'Reading' }],
    blocks: visibleStructureBlocks(printConsumption),
  }
  const internalExporter = createExportImplementation({
    rootDir: repositoryRoot,
    exportDir: path.join(repositoryRoot, 'qa-export-negative'),
    getQuestionGroupDetail: (groupId) => groupId === item.detail.id ? item.detail : null,
    buildPrintHtml,
    resolveCanonicalConsumption: () => printConsumption,
  })
  assert.throws(
    () => internalExporter.exportPrintHtml({
      ...internalExporterInput,
      blocks: internalExporterInput.blocks.slice(1),
    }, { canonicalVisibleStructureChrome: true }),
    (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED',
    'internal Format 2 chrome rejects caller blocks that differ from committed visibleStructure',
  )

  const publicOracleConsumption = structuredClone(printConsumption)
  publicOracleConsumption.paperId = grammarFillRhythm.publicArtifactOracle.paperId
  publicOracleConsumption.authorityRef = {
    ...publicOracleConsumption.authorityRef,
    manifestVersion: 20,
  }
  const publicOracleExporter = createExportImplementation({
    rootDir: repositoryRoot,
    exportDir: path.join(repositoryRoot, 'qa-export-oracle-negative'),
    getQuestionGroupDetail: (groupId) => groupId === item.detail.id ? item.detail : null,
    buildPrintHtml,
    resolveCanonicalConsumption: () => publicOracleConsumption,
  })
  assert.throws(
    () => publicOracleExporter.exportPrintHtml({
      ...internalExporterInput,
      blocks: visibleStructureBlocks(publicOracleConsumption),
    }, { canonicalVisibleStructureChrome: true }),
    (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED',
    'internal option cannot bypass immutable public-oracle source binding',
  )
} finally {
  publicDb.close()
}

const normalizationReport = JSON.parse(readFileSync(path.join(
  repositoryRoot,
  'app/public/paper-assets',
  fixture.input.paperId,
  'versions',
  completed.canonicalPublication.versionName,
  'canonical/normalization-report-v46.json',
), 'utf8'))
assert.equal(normalizationReport.inactiveSourceClosures.length, 2)
assert.deepEqual(
  normalizationReport.inactiveSourceClosures.map((closure) => ({
    slotId: closure.slotId,
    questionCount: closure.questionCount,
    officialAnswerCount: closure.officialAnswerCount,
    transcriptSegmentCount: closure.transcriptSegmentCount,
  })),
  [
    { slotId: 'listening.short-dialogue', questionCount: 5, officialAnswerCount: 5, transcriptSegmentCount: 5 },
    { slotId: 'listening.long-form', questionCount: 15, officialAnswerCount: 15, transcriptSegmentCount: 5 },
  ],
)
assert.equal(existsSync(path.join(durablePaperDir, 'signals/ai-answer-check.json')), true)
const answerCheckSignal = JSON.parse(readFileSync(path.join(durablePaperDir, 'signals/ai-answer-check.json'), 'utf8'))
assert.equal(answerCheckSignal.ok, true)
assert.equal(answerCheckSignal.answerPdfSha256, fixture.input.sources.answerPdf.sha256)
assert.equal(answerCheckSignal.officialAnswersDigest, digestJson(fixture.input.transcription.officialAnswers))
assert.equal(answerCheckSignal.checkDigest, digestJson(fixture.input.transcription.answerTranscriptionCheck))
assert.equal(
  answerCheckSignal.extractedTextSha256,
  fixture.input.transcription.answerTranscriptionCheck.extraction.extractedTextSha256,
)
assert.equal(answerCheckSignal.markingCount, fixture.input.transcription.officialAnswers.length)
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
const completedStudentPath = path.join(
  durablePaperDir,
  completed.artifacts.qa.studentPrint.relativePath,
)
const completedStudentBytes = readFileSync(completedStudentPath)
writeFileSync(completedStudentPath, Buffer.concat([completedStudentBytes, Buffer.from('tampered')]))
assertFailed(
  resume(repositoryRoot, {
    paperId: fixture.input.paperId,
    jobId: result.jobId,
    teacherConfirmation: exactTeacherConfirmation,
  }),
  'FORMAT2_QA_ARTIFACT_INVALID',
)
writeFileSync(completedStudentPath, completedStudentBytes)
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

const oldQaReceipt = {
  ...completed.humanEntryPoints.qaAcceptance.expectedReceipt,
  acceptedAt: '2026-08-25T00:00:00.000Z',
}
writeFileSync(
  path.join(durablePaperDir, 'signals/qa-accepted.json'),
  `${JSON.stringify(oldQaReceipt, null, 2)}\n`,
)
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
assert.equal(
  existsSync(path.join(durablePaperDir, 'signals/qa-accepted.json')),
  false,
  'a new upstream Job identity removes the old exact Owner QA receipt',
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
