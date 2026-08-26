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
import { extractAnswerTextFromPdfBytes } from '../server/paper-import/internal/answerTextExtraction.mjs'
import {
  confirmVisualImportCandidate,
} from '../server/paper-canonical/visualCandidate.mjs'
import {
  buildConfirmedFormat2CanonicalRequest,
} from '../server/paper-canonical/format2CanonicalRequest.mjs'
import { readingOptionFigureAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { readingOptionFigureConsumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaperBrowseDisplayAsset } from '../shared/paper-canonical/paperBrowseDisplayAsset.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumptionSync,
} from '../server/paper-canonical/publication.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { grammarFillRhythm } from '../shared/paper-canonical/grammarFillRhythm.mjs'
import {
  translateReadingOptionFigureLayout,
} from '../shared/paper-canonical/readingOptionFigureLayout.mjs'
import { probePaper } from '../import-ops/lib/probe.mjs'
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

function refreshSourceMeasuredLayoutDigests(layout) {
  const measurement = layout.measurementEvidenceBody
  if (Object.hasOwn(measurement, 'measurementDigest')) {
    const { measurementDigest: _measurementDigest, ...body } = measurement
    measurement.measurementDigest = digestJson(body)
  }
  layout.intent.measurementEvidence.evidenceDigest =
    Object.hasOwn(measurement, 'measurementDigest')
      ? measurement.measurementDigest
      : digestJson(measurement)
  const { intentDigest: _intentDigest, ...intentBody } = layout.intent
  layout.intent.intentDigest = digestJson(intentBody)
}

function rebindSourceMeasuredLayouts(transcription, sourceDocumentSha256) {
  for (const layout of transcription.sourceMeasuredFigureLayouts || []) {
    const measurement = layout.measurementEvidenceBody
    if (Object.hasOwn(measurement, 'sourcePdfSha256')) {
      measurement.sourcePdfSha256 = sourceDocumentSha256
    }
    if (Object.hasOwn(measurement, 'sourceDocumentSha256')) {
      measurement.sourceDocumentSha256 = sourceDocumentSha256
    }
    layout.intent.measurementEvidence.sourceDocumentSha256 =
      sourceDocumentSha256
    refreshSourceMeasuredLayoutDigests(layout)
  }
}

function addSecondFigureQuestionWithLocalOptionIds(fixture) {
  const transcription = fixture.input.transcription
  const labels = ['A', 'B', 'C', 'D']
  const localOptionIds = labels.map((label) => `option:local:${label.toLowerCase()}`)
  const firstLayout = transcription.sourceMeasuredFigureLayouts[0]
  const firstQuestion = transcription.groups
    .find((group) => group.groupId === 'group:reading-b')
    .questions.find((question) => question.questionId === firstLayout.intent.questionId)
  const firstVisuals = firstQuestion.options.map((option) => (
    transcription.visuals.find(
      (visual) => visual.observationId === option.visualObservationId,
    )
  ))
  for (const [index, option] of firstQuestion.options.entries()) {
    option.optionId = localOptionIds[index]
    firstVisuals[index].owner.optionId = localOptionIds[index]
    firstLayout.intent.placements[index].optionId = localOptionIds[index]
  }
  refreshSourceMeasuredLayoutDigests(firstLayout)

  const secondGroup = transcription.groups.find(
    (group) => group.groupId === 'group:reading-c',
  )
  const secondQuestion = secondGroup.questions[0]
  const secondObservationIds = labels.map(
    (label) => `observation:reading-c:q28:${label.toLowerCase()}`,
  )
  secondQuestion.stem = 'Which second source-authored figure matches?'
  secondQuestion.options = labels.map((label, index) => ({
    optionId: localOptionIds[index],
    label,
    contentKind: 'figure',
    visualObservationId: secondObservationIds[index],
  }))
  const sourcePage = 2
  const pageHeight = 842
  const imageTopPt = 180
  const imageWidthPt = 90
  const imageHeightPt = 72
  const rowOriginPt = 50
  const imageLeftPt = labels.map((_label, index) => 70 + index * 110)
  const secondVisuals = firstVisuals.map((visual, index) => {
    const secondVisual = {
      ...structuredClone(visual),
      observationId: secondObservationIds[index],
      owner: {
        kind: 'reading_option',
        groupId: secondGroup.groupId,
        questionId: secondQuestion.questionId,
        optionId: localOptionIds[index],
      },
      source: {
        ...structuredClone(visual.source),
        page: sourcePage,
        pointGeometry: {
          x: imageLeftPt[index],
          y: imageTopPt,
          width: imageWidthPt,
          height: imageHeightPt,
        },
        extraction: {
          ...structuredClone(visual.source.extraction),
          objectId: `xref:${210 + index}`,
        },
      },
    }
    delete secondVisual.stableIdentities
    return secondVisual
  })
  transcription.visuals.push(...secondVisuals)

  const secondLayout = structuredClone(firstLayout)
  secondLayout.measurementEvidenceBody.questionId = secondQuestion.questionId
  secondLayout.measurementEvidenceBody.sourcePage = sourcePage
  secondLayout.measurementEvidenceBody.labels = labels.map((label, index) => ({
    label,
    leftPt: rowOriginPt + index * 110,
    topPt: imageTopPt,
    widthPt: 10,
    heightPt: 16,
  }))
  secondLayout.intent.questionId = secondQuestion.questionId
  secondLayout.intent.sourcePage = sourcePage
  secondLayout.intent.rowStartPt = rowOriginPt
  secondLayout.intent.rowWidthPt = 440
  secondLayout.intent.placements = labels.map((label, index) => ({
    ...structuredClone(firstLayout.intent.placements[index]),
    optionId: localOptionIds[index],
    label,
    sourceSpanId: `source-span:${secondObservationIds[index]}`,
    sourcePlacementMatrix: [
      imageWidthPt,
      0,
      0,
      -imageHeightPt,
      imageLeftPt[index],
      pageHeight - imageTopPt,
    ],
    labelLeftPt: index * 110,
    labelTopPt: 0,
    imageLeftPt: imageLeftPt[index] - rowOriginPt,
    imageTopPt: 0,
    imageWidthPt,
    imageHeightPt,
  }))
  refreshSourceMeasuredLayoutDigests(secondLayout)
  transcription.sourceMeasuredFigureLayouts.push(secondLayout)
  return {
    firstQuestionId: firstQuestion.questionId,
    secondQuestionId: secondQuestion.questionId,
    firstNormalizedY: firstVisuals[0].source.pointGeometry.y
      / firstVisuals[0].source.pageSizePoints.height,
    secondNormalizedY: imageTopPt / pageHeight,
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

function upgradeFixtureToTranscriptionV2(input) {
  const transcription = input.transcription
  transcription.schemaVersion = 'format2-transcription-v2'
  transcription.groups = transcription.groups.filter(
    (group) => group.groupType !== 'listening',
  )
  transcription.listeningSource = {
    disposition: 'not_supplied',
    source: {
      documentRole: 'question_pdf',
      questionPdfSha256: transcription.sourceBindings.questionPdfSha256,
      firstSuppliedSection: 'reading',
      page: 1,
    },
  }
  const answersByQuestionId = new Map(transcription.officialAnswers.map(
    (answer) => [answer.questionId, answer.answer],
  ))
  const readingGroups = transcription.groups.filter(
    (group) => group.groupType === 'reading',
  )
  const readingAnalysis = {
    schemaVersion: 'reading-choice-analysis-v1',
    paperId: transcription.paperId,
    sourceAssetVersion: 1,
    targetGroups: readingGroups.map((group) => group.groupId),
    meta: { reviewStatus: 'reviewed' },
    groups: {},
    questions: Object.fromEntries(readingGroups.flatMap((group) => (
      group.questions.map((question) => [question.questionId, {
        skill: {},
        questionFocus: `Reviewed focus for ${question.questionId}`,
        stemTranslationZh: '定向测试题干。',
        optionAnalysis: question.options.map((option) => ({
          label: option.label,
          optionTranslationZh: `选项 ${option.label}`,
          status: option.label === answersByQuestionId.get(question.questionId)
            ? 'correct'
            : 'wrong',
        })),
        locationParaphrases: [],
      }])
    ))),
  }
  const sevenChoicesGroup = transcription.groups.find(
    (group) => group.groupType === 'seven_choices',
  )
  const sevenChoicesAnalysis = {
    schemaVersion: 'seven-choices-analysis-v1',
    paperId: transcription.paperId,
    sourceAssetVersion: 1,
    targetGroups: [sevenChoicesGroup.groupId],
    meta: { reviewStatus: 'reviewed' },
    groups: { [sevenChoicesGroup.groupId]: { overview: 'Reviewed seven choices.' } },
    questions: Object.fromEntries(sevenChoicesGroup.questions.map((question) => [
      question.questionId,
      {
        blankId: `blank:${question.questionId}`,
        positionFacet: 'middle',
        roleFacet: 'detail',
        primaryMechanismFacet: 'cohesion',
        topicClues: ['Synthetic'],
        contextEvidence: { beforeQuote: 'Synthetic left column.' },
        mechanismSignals: [
          { signalText: 'Synthetic left column.', signalSide: 'passage' },
          { signalText: 'Shared synthetic option A', signalSide: 'option' },
        ],
        optionFit: { correctOptionLabel: answersByQuestionId.get(question.questionId) },
        teachingNote: 'Use the exact shared option bank.',
      },
    ])),
  }
  const clozeGroup = transcription.groups.find((group) => group.groupType === 'cloze')
  const clozeAnalysis = {
    schemaVersion: 'cloze-analysis-v1',
    paperId: transcription.paperId,
    sourceAssetVersion: 1,
    targetGroups: [clozeGroup.groupId],
    meta: { reviewStatus: 'reviewed' },
    groups: { [clozeGroup.groupId]: { overview: 'Reviewed cloze.' } },
    blanks: Object.fromEntries(clozeGroup.questions.map((question) => [
      question.questionId,
      {
        blankId: `blank:${question.questionId}`,
        blankNo: question.questionNo,
        pos: 'other',
        correctFit: {
          optionLabel: answersByQuestionId.get(question.questionId),
          reason: 'The source context supports the admitted answer.',
        },
        distractorGlosses: question.options
          .filter((option) => option.label !== answersByQuestionId.get(question.questionId))
          .map((option) => ({ optionLabel: option.label })),
        evidence: [{
          type: 'collocation-partner',
          signalSide: 'context-before',
          signalText: 'compact cloze',
        }],
        teachingNote: 'Read the local collocation.',
      },
    ])),
  }
  const grammarFillGroup = transcription.groups.find(
    (group) => group.groupType === 'grammar_fill',
  )
  grammarFillGroup.questions.forEach((question, index) => {
    question.promptProvision = index === 0
      ? { provision: 'source_prompt', prompt: 'hold' }
      : { provision: 'source_proven_none' }
  })
  const grammarFillAnalysis = {
    schemaVersion: 'grammar-fill-analysis-v2',
    paperId: transcription.paperId,
    sourceAssetVersion: 1,
    targetGroups: [grammarFillGroup.groupId],
    meta: { reviewStatus: 'reviewed' },
    groups: { [grammarFillGroup.groupId]: { overview: 'Reviewed grammar fill.' } },
    blanks: Object.fromEntries(grammarFillGroup.questions.map((question) => {
      const prompted = question.promptProvision.provision === 'source_prompt'
      return [question.questionId, {
        blankId: `blank:${question.questionId}`,
        blankNo: question.questionNo,
        blankType: prompted ? 'given' : 'no-hint',
        hint: prompted ? question.promptProvision.prompt : null,
        facetKey: prompted
          ? 'grammar-fill.given.verb.non-finite'
          : 'grammar-fill.no-hint.article',
        ...(prompted ? { role: 'object', path: 'fast' } : {}),
        reason: 'The source context determines this form.',
        teachingNote: 'Check the exact local structure.',
        answer: answersByQuestionId.get(question.questionId),
        evidence: [{ type: 'clause-frame', signalText: 'compact grammar' }],
      }]
    })),
  }
  transcription.analysisSidecars = [
    readingAnalysis,
    sevenChoicesAnalysis,
    clozeAnalysis,
    grammarFillAnalysis,
  ]
  const applicationBlock = transcription.groups
    .find((group) => group.groupType === 'application_writing')
    .blocks.find((block) => block.kind === 'writing_material')
  applicationBlock.applicationEvidence.answerRegionAbsent = false
  applicationBlock.applicationGiven = {
    provision: 'source_provided',
    parts: [{
      partId: 'given-part:group:application:title',
      blockId: 'paragraph:group:application:given:title',
      role: 'title',
      text: 'Reading Club Invitation',
    }],
  }
  return input
}

function v2FailureCase(mutator, code, diagnosticCode = code) {
  const { repositoryRoot, fixture } = freshFixture('v2-negative-')
  const input = upgradeFixtureToTranscriptionV2(structuredClone(fixture.input))
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
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].questionNo = 22
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')
failureCase((input) => {
  input.transcription.officialAnswers[0].answer = 'B'
  input.transcription.answerTranscriptionCheck.officialAnswersDigest = digestJson(
    input.transcription.officialAnswers,
  )
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].answer = 'B'
  input.transcription.answerTranscriptionCheck.sourceMarkings[0].sourceMarking = '21=B'
}, 'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID')

const imageAnswer = freshFixture('image-answer-')
const imageAnswerFixture = makeFormat2ImportJobFixture({
  sourceDir: path.join(imageAnswer.repositoryRoot, 'image-answer-sources'),
  paperId: 'paper-format2-image-answer',
  writerId: 'image-answer-writer',
  answerEvidenceKind: 'image',
})
const imageAnswerText = extractAnswerTextFromPdfBytes(imageAnswerFixture.answerPdfBytes).extractedText
assert.match(imageAnswerText, /^\f+$/u, 'image-only answer fixture has no extracted answer text')
const imageAnswerResult = run(imageAnswer.repositoryRoot, imageAnswerFixture.input)
assert.equal(imageAnswerResult.lifecycle, 'importing')
assert.equal(
  imageAnswerFixture.input.transcription.answerTranscriptionCheck.evidenceKind,
  'page_image_regions',
)
const tamperedImageAnswer = structuredClone(imageAnswerFixture.input)
tamperedImageAnswer.state.writerId = 'image-answer-negative-writer'
tamperedImageAnswer.paperId = 'paper-format2-image-answer-negative'
tamperedImageAnswer.transcription.paperId = tamperedImageAnswer.paperId
tamperedImageAnswer.transcription.answerTranscriptionCheck.regions[0].sha256 = `sha256:${'f'.repeat(64)}`
assertFailed(
  run(mkdtempSync(path.join(tmpdir(), 'eqb-format2-image-negative-')), tamperedImageAnswer),
  'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID',
)

function completedFixtureForInvalidation(suffix) {
  const prepared = freshFixture(suffix)
  const started = run(prepared.repositoryRoot, prepared.fixture.input)
  const candidate = JSON.parse(readFileSync(
    artifactPath(prepared.repositoryRoot, started, 'candidatePackage'),
    'utf8',
  ))
  const confirmation = exactConfirmation(candidate)
  const completedResult = resume(prepared.repositoryRoot, {
    paperId: prepared.fixture.input.paperId,
    jobId: started.jobId,
    teacherConfirmation: confirmation,
  })
  assert.equal(completedResult.lifecycle, 'awaiting_qa')
  const durableDir = paperDir(prepared.repositoryRoot, prepared.fixture.input.paperId)
  writeFileSync(
    path.join(durableDir, 'signals/qa-accepted.json'),
    `${JSON.stringify({
      ...completedResult.humanEntryPoints.qaAcceptance.expectedReceipt,
      acceptedAt: '2026-08-25T00:00:00.000Z',
    }, null, 2)}\n`,
  )
  return { ...prepared, started, confirmation, durableDir }
}

const completionWindow = freshFixture('completion-window-')
const completionWindowStarted = run(completionWindow.repositoryRoot, completionWindow.fixture.input)
const completionWindowCandidate = JSON.parse(readFileSync(
  artifactPath(completionWindow.repositoryRoot, completionWindowStarted, 'candidatePackage'),
  'utf8',
))
const completionWindowConfirmation = exactConfirmation(completionWindowCandidate)
assertFailed(
  resume(completionWindow.repositoryRoot, {
    paperId: completionWindow.fixture.input.paperId,
    jobId: completionWindowStarted.jobId,
    teacherConfirmation: completionWindowConfirmation,
  }, {
    completionFailurePoint: 'after-awaiting-qa-dependencies-before-current-crash',
  }),
  'FORMAT2_JOB_PERSISTENCE_FORCED_CRASH',
)
const completionWindowPaperDir = paperDir(
  completionWindow.repositoryRoot,
  completionWindow.fixture.input.paperId,
)
const completionWindowCurrentPath = path.join(completionWindowPaperDir, 'job/current.json')
const interruptedCompletionReceipt = JSON.parse(readFileSync(completionWindowCurrentPath, 'utf8'))
assert.equal(interruptedCompletionReceipt.result.lifecycle, 'importing')
assert.equal(interruptedCompletionReceipt.result.stopReason.code, 'exact_teacher_confirmation_required')
assert.equal(interruptedCompletionReceipt.result.canonicalPublication, null)
assert.equal(
  existsSync(path.join(completionWindowPaperDir, 'signals/ai-answer-check.json')),
  true,
  'the exact AI answer-check dependency is durable before the completion marker',
)
assert.deepEqual(
  JSON.parse(readFileSync(path.join(
    completionWindowPaperDir,
    'job/publication-store.json',
  ), 'utf8')),
  {
    schemaVersion: 'format2-local-publication-store-v1',
    database: 'data/question-bank.sqlite',
  },
)
const interruptedCompletionProbe = probePaper({
  repoRoot: completionWindow.repositoryRoot,
  paperId: completionWindow.fixture.input.paperId,
})
assert.equal(interruptedCompletionProbe.status, 'importing')
assert.equal(interruptedCompletionProbe.gatesGreen, false)
assert.equal(interruptedCompletionProbe.format2Qa, null)
const completionWindowRecovered = resume(completionWindow.repositoryRoot, {
  paperId: completionWindow.fixture.input.paperId,
  jobId: completionWindowStarted.jobId,
  teacherConfirmation: completionWindowConfirmation,
})
assert.equal(completionWindowRecovered.lifecycle, 'awaiting_qa')
assert.equal(
  probePaper({
    repoRoot: completionWindow.repositoryRoot,
    paperId: completionWindow.fixture.input.paperId,
  }).gatesGreen,
  true,
  'exact retry promotes the current receipt only after its dependencies verify',
)

const completionWindowSignals = path.join(completionWindowPaperDir, 'signals')
writeFileSync(
  path.join(completionWindowSignals, 'qa-accepted.json'),
  `${JSON.stringify({
    ...completionWindowRecovered.humanEntryPoints.qaAcceptance.expectedReceipt,
    acceptedAt: '2026-08-25T00:00:00.000Z',
  }, null, 2)}\n`,
)
writeFileSync(
  path.join(completionWindowSignals, 'help-needed.json'),
  `${JSON.stringify({ code: 'stale-completed-help-signal' }, null, 2)}\n`,
)
const completedReceiptBeforeInvalidation = readFileSync(completionWindowCurrentPath)
const staleCompletedConfirmation = structuredClone(completionWindowConfirmation)
staleCompletedConfirmation.packageDigest = `sha256:${'d'.repeat(64)}`
assertFailed(
  resume(completionWindow.repositoryRoot, {
    paperId: completionWindow.fixture.input.paperId,
    jobId: completionWindowStarted.jobId,
    teacherConfirmation: staleCompletedConfirmation,
  }),
  'FORMAT2_JOB_CONFIRMATION_STALE',
)
assertFailed(
  resume(completionWindow.repositoryRoot, {
    paperId: completionWindow.fixture.input.paperId,
    jobId: completionWindowStarted.jobId,
    teacherConfirmation: {
      ...structuredClone(completionWindowConfirmation),
      unsupported: true,
    },
  }),
  'FORMAT2_JOB_CONFIRMATION_STALE',
)
const substitutedCompletedConfirmation = structuredClone(completionWindowConfirmation)
substitutedCompletedConfirmation.decisions[0].selectedCandidateDigest =
  substitutedCompletedConfirmation.decisions[1].selectedCandidateDigest
assertFailed(
  resume(completionWindow.repositoryRoot, {
    paperId: completionWindow.fixture.input.paperId,
    jobId: completionWindowStarted.jobId,
    teacherConfirmation: substitutedCompletedConfirmation,
  }),
  'FORMAT2_JOB_CONFIRMATION_STALE',
)
assert.deepEqual(
  readFileSync(completionWindowCurrentPath),
  completedReceiptBeforeInvalidation,
  'stale, malformed, and substituted completed confirmations preserve the exact completed no-op',
)

const changedCompletedConfirmation = {
  ...structuredClone(completionWindowConfirmation),
  decisions: [...completionWindowConfirmation.decisions].reverse(),
}
assert.notEqual(
  digestJson(changedCompletedConfirmation),
  digestJson(completionWindowConfirmation),
)
assertFailed(
  resume(completionWindow.repositoryRoot, {
    paperId: completionWindow.fixture.input.paperId,
    jobId: completionWindowStarted.jobId,
    teacherConfirmation: changedCompletedConfirmation,
  }),
  'FORMAT2_JOB_CONFIRMATION_CHANGED',
)
const invalidatedConfirmationReceipt = JSON.parse(readFileSync(completionWindowCurrentPath, 'utf8'))
assert.equal(invalidatedConfirmationReceipt.result.jobId, completionWindowStarted.jobId)
assert.equal(invalidatedConfirmationReceipt.result.lifecycle, 'importing')
assert.equal(
  invalidatedConfirmationReceipt.result.stopReason.code,
  'exact_teacher_confirmation_required',
)
assert.equal(invalidatedConfirmationReceipt.result.canonicalPublication, null)
assert.deepEqual(
  Object.keys(invalidatedConfirmationReceipt.result.artifacts).sort(),
  ['candidatePackage', 'comparison', 'sourceCapture', 'transcription'],
)
assert.equal(
  invalidatedConfirmationReceipt.result.humanEntryPoints.comparison.packageDigest,
  completionWindowCandidate.packageDigest,
)
assert.equal(
  Object.hasOwn(invalidatedConfirmationReceipt.contractVersions, 'canonicalPublication'),
  false,
)
for (const signal of ['ai-answer-check.json', 'qa-accepted.json', 'help-needed.json']) {
  assert.equal(existsSync(path.join(completionWindowSignals, signal)), false)
}
const invalidatedConfirmationProbe = probePaper({
  repoRoot: completionWindow.repositoryRoot,
  paperId: completionWindow.fixture.input.paperId,
})
assert.equal(invalidatedConfirmationProbe.status, 'importing')
assert.equal(invalidatedConfirmationProbe.gatesGreen, false)
assert.equal(invalidatedConfirmationProbe.format2Qa, null)
const changedConfirmationRecovered = resume(completionWindow.repositoryRoot, {
  paperId: completionWindow.fixture.input.paperId,
  jobId: completionWindowStarted.jobId,
  teacherConfirmation: changedCompletedConfirmation,
})
assert.equal(changedConfirmationRecovered.lifecycle, 'awaiting_qa')
assert.equal(
  changedConfirmationRecovered.artifacts.confirmedSelection.confirmationDigest,
  digestJson(changedCompletedConfirmation),
)
assert.equal(
  probePaper({
    repoRoot: completionWindow.repositoryRoot,
    paperId: completionWindow.fixture.input.paperId,
  }).gatesGreen,
  true,
)

const invalidSourceJob = completedFixtureForInvalidation('invalidated-source-')
const changedInvalidSourceInput = structuredClone(invalidSourceJob.fixture.input)
const changedInvalidQuestionBytes = Buffer.from('%PDF-1.7\n% changed source paired with invalid transcription\n')
writeFileSync(changedInvalidSourceInput.sources.questionPdf.absolutePath, changedInvalidQuestionBytes)
const changedInvalidQuestionDigest = sha256(new Uint8Array(changedInvalidQuestionBytes))
changedInvalidSourceInput.sources.questionPdf.sha256 = changedInvalidQuestionDigest
changedInvalidSourceInput.transcription.sourceBindings.questionPdfSha256 = changedInvalidQuestionDigest
delete changedInvalidSourceInput.transcription.groups
assertFailed(
  run(invalidSourceJob.repositoryRoot, changedInvalidSourceInput),
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
for (const signal of ['ai-answer-check.json', 'qa-accepted.json']) {
  assert.equal(existsSync(path.join(invalidSourceJob.durableDir, 'signals', signal)), false)
}
assert.equal(
  JSON.parse(readFileSync(path.join(invalidSourceJob.durableDir, 'job/current.json'), 'utf8')).result.lifecycle,
  'failed',
  'changed source invalidates the prior durable awaiting_qa state before new semantic validation',
)
assert.equal(
  JSON.parse(readFileSync(path.join(invalidSourceJob.durableDir, 'signals/blocked.json'), 'utf8')).code,
  'format2_input_invalidated',
)
assertFailed(
  resume(invalidSourceJob.repositoryRoot, {
    paperId: invalidSourceJob.fixture.input.paperId,
    jobId: invalidSourceJob.started.jobId,
    teacherConfirmation: invalidSourceJob.confirmation,
  }),
  'FORMAT2_JOB_IDENTITY_MISMATCH',
)

const invalidTranscriptionJob = completedFixtureForInvalidation('invalidated-transcription-')
const invalidChangedTranscription = structuredClone(invalidTranscriptionJob.fixture.input)
invalidChangedTranscription.transcription.answerTranscriptionCheck.sourceMarkings[0].questionNo = 999
assertFailed(
  run(invalidTranscriptionJob.repositoryRoot, invalidChangedTranscription),
  'FORMAT2_ANSWER_TRANSCRIPTION_CHECK_INVALID',
)
for (const signal of ['ai-answer-check.json', 'qa-accepted.json']) {
  assert.equal(existsSync(path.join(invalidTranscriptionJob.durableDir, 'signals', signal)), false)
}
assert.equal(
  JSON.parse(readFileSync(path.join(invalidTranscriptionJob.durableDir, 'job/current.json'), 'utf8')).result.lifecycle,
  'failed',
  'changed invalid transcription cannot leave the old Job ready_to_ship',
)

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
assert.equal(
  fixture.input.transcription.answerTranscriptionCheck.sourceMarkings[0].questionId,
  'q-2026-i-021',
  'answer evidence accepts opaque Question IDs and uses explicit schema numbering',
)
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
const visualSourceObservations = sourceCapture.observations.filter(
  (observation) => observation.kind === 'source_figure',
)
assert.equal(visualSourceObservations.length, fixture.input.transcription.visuals.length)
assert.ok(visualSourceObservations.every((observation) => (
  observation.value.pointGeometry
  && observation.value.pageSizePoints
  && observation.value.targetSizePoints
)))
const stableVisual = fixture.input.transcription.visuals.find(
  (visual) => visual.stableIdentities,
)
const defaultVisual = fixture.input.transcription.visuals.find(
  (visual) => !visual.stableIdentities,
)
assert.equal(
  visualSourceObservations.find(
    (observation) => observation.observationId === stableVisual.observationId,
  ).sourceSpanId,
  fixture.stableOptionIdentities.sourceSpanId,
  'runtime Candidate capture retains an explicit stable source-span identity',
)
assert.equal(
  visualSourceObservations.find(
    (observation) => observation.observationId === defaultVisual.observationId,
  ).sourceSpanId,
  `source-span:${defaultVisual.observationId}`,
  'visuals without explicit identities retain the previous derivation',
)
const figureLayoutObservation = sourceCapture.observations.find(
  (observation) => observation.kind === 'reading_option_figure_source_layout',
)
assert.equal(figureLayoutObservation.documentId, questionDocument.documentId)
assert.deepEqual(
  figureLayoutObservation.value,
  fixture.input.transcription.sourceMeasuredFigureLayouts[0],
)

const candidatePackage = JSON.parse(readFileSync(artifactPath(repositoryRoot, result, 'candidatePackage'), 'utf8'))
assert.equal(candidatePackage.packageDigest, result.artifacts.candidatePackage.packageDigest)
assert.equal(candidatePackage.status, 'awaiting_teacher_confirmation')
assert.equal(candidatePackage.candidates.length, 5)
assert.ok(candidatePackage.candidates.every((candidate) => candidate.method === 'source_crop'))
assert.equal(
  candidatePackage.observations.find(
    (observation) => observation.observationId === stableVisual.observationId,
  ).source.sourceSpanId,
  fixture.stableOptionIdentities.sourceSpanId,
  'the exact Candidate observation retains the explicit stable source span',
)
assert.equal(Object.hasOwn(candidatePackage, 'canonicalPaper'), false)
assert.equal(Object.hasOwn(candidatePackage, 'media'), false)

const layoutMutationFixture = freshFixture('layout-mutation-')
const layoutMutationStarted = run(
  layoutMutationFixture.repositoryRoot,
  layoutMutationFixture.fixture.input,
)
const layoutMutationCandidate = JSON.parse(readFileSync(
  artifactPath(
    layoutMutationFixture.repositoryRoot,
    layoutMutationStarted,
    'candidatePackage',
  ),
  'utf8',
))
const layoutMutationInput = structuredClone(layoutMutationFixture.fixture.input)
const changedLayout = layoutMutationInput.transcription.sourceMeasuredFigureLayouts[0]
for (const label of changedLayout.measurementEvidenceBody.labels) {
  label.leftPt += 1
}
refreshSourceMeasuredLayoutDigests(changedLayout)
const layoutMutationResult = run(
  layoutMutationFixture.repositoryRoot,
  layoutMutationInput,
)
assert.equal(layoutMutationResult.lifecycle, 'importing')
assert.notEqual(layoutMutationResult.jobId, layoutMutationStarted.jobId)
assert.notEqual(
  layoutMutationResult.artifacts.sourceCapture.digest,
  layoutMutationStarted.artifacts.sourceCapture.digest,
)
assert.notEqual(
  layoutMutationResult.artifacts.candidatePackage.packageDigest,
  layoutMutationStarted.artifacts.candidatePackage.packageDigest,
)
assertFailed(
  resume(layoutMutationFixture.repositoryRoot, {
    paperId: layoutMutationFixture.fixture.input.paperId,
    jobId: layoutMutationStarted.jobId,
    teacherConfirmation: exactConfirmation(layoutMutationCandidate),
  }),
  'FORMAT2_JOB_IDENTITY_MISMATCH',
)

const localOptionIdentityFixture = freshFixture('local-option-identity-')
const localOptionIdentity = addSecondFigureQuestionWithLocalOptionIds(
  localOptionIdentityFixture.fixture,
)
const localOptionIdentityStarted = run(
  localOptionIdentityFixture.repositoryRoot,
  localOptionIdentityFixture.fixture.input,
)
const localOptionSourceCapture = JSON.parse(readFileSync(
  artifactPath(
    localOptionIdentityFixture.repositoryRoot,
    localOptionIdentityStarted,
    'sourceCapture',
  ),
  'utf8',
))
const localOptionLayoutObservations = localOptionSourceCapture.observations.filter(
  (observation) => observation.kind === 'reading_option_figure_source_layout',
)
const localOptionSourceSpans = new Map(localOptionSourceCapture.sourceSpans.map(
  (span) => [span.sourceSpanId, span],
))
const runtimeLayoutRegion = (questionId) => {
  const observation = localOptionLayoutObservations.find(
    (candidate) => candidate.value.intent.questionId === questionId,
  )
  return {
    sourceSpanId: observation.sourceSpanId,
    region: localOptionSourceSpans.get(observation.sourceSpanId).coordinate.region,
  }
}
const firstRuntimeLayoutRegion = runtimeLayoutRegion(
  localOptionIdentity.firstQuestionId,
)
const secondRuntimeLayoutRegion = runtimeLayoutRegion(
  localOptionIdentity.secondQuestionId,
)
assert.notEqual(
  firstRuntimeLayoutRegion.sourceSpanId,
  secondRuntimeLayoutRegion.sourceSpanId,
)
assert.equal(firstRuntimeLayoutRegion.region.y, localOptionIdentity.firstNormalizedY)
assert.equal(secondRuntimeLayoutRegion.region.y, localOptionIdentity.secondNormalizedY)

const localOptionCandidate = JSON.parse(readFileSync(
  artifactPath(
    localOptionIdentityFixture.repositoryRoot,
    localOptionIdentityStarted,
    'candidatePackage',
  ),
  'utf8',
))
const localOptionSelection = confirmVisualImportCandidate(
  localOptionCandidate,
  exactConfirmation(localOptionCandidate),
)
const localOptionCanonicalRequest = buildConfirmedFormat2CanonicalRequest({
  transcription: localOptionIdentityFixture.fixture.input.transcription,
  questionPdfBytes: localOptionIdentityFixture.fixture.questionPdfBytes,
  answerPdfBytes: localOptionIdentityFixture.fixture.answerPdfBytes,
  confirmedSelection: localOptionSelection,
})
const localOptionSourceEnvelope = JSON.parse(Buffer.from(
  localOptionCanonicalRequest.sourceAsset,
).toString('utf8'))
const canonicalLayoutRegion = (questionId) => (
  localOptionSourceEnvelope.observations.find((observation) => (
    observation.kind === 'reading_option_figure_source_layout'
    && observation.value.intent.questionId === questionId
  )).span.region
)
assert.equal(
  canonicalLayoutRegion(localOptionIdentity.firstQuestionId).y,
  localOptionIdentity.firstNormalizedY,
)
assert.equal(
  canonicalLayoutRegion(localOptionIdentity.secondQuestionId).y,
  localOptionIdentity.secondNormalizedY,
)

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
  const expectedFigureLayout =
    fixture.input.transcription.sourceMeasuredFigureLayouts[0].intent
  assert.deepEqual(screenConsumption.figureLayoutIntents, [expectedFigureLayout])
  assert.deepEqual(printConsumption.figureLayoutIntents, [expectedFigureLayout])
  const screenFigureGroup = projectCanonicalConsumerGroup({
    consumption: screenConsumption,
    familyContractId: 'reading',
    groupId: 'group:reading-b',
  })
  const printFigureGroup = projectCanonicalConsumerGroup({
    consumption: printConsumption,
    familyContractId: 'reading',
    groupId: 'group:reading-b',
  })
  const screenFigureQuestion = screenFigureGroup.questions.find(
    (question) => question.questionId === expectedFigureLayout.questionId,
  )
  const printFigureQuestion = printFigureGroup.questions.find(
    (question) => question.questionId === expectedFigureLayout.questionId,
  )
  const stableScreenOption = screenFigureQuestion.options.find(
    (option) => option.optionId === stableVisual.owner.optionId,
  )
  const stablePrintOption = printFigureQuestion.options.find(
    (option) => option.optionId === stableVisual.owner.optionId,
  )
  assert.equal(
    stableScreenOption.figure.mediaId,
    fixture.stableOptionIdentities.canonicalMediaId,
    'Screen consumes the explicit stable Canonical media identity',
  )
  assert.equal(
    stablePrintOption.figure.mediaId,
    fixture.stableOptionIdentities.canonicalMediaId,
    'Print/PDF consumes the same explicit stable Canonical media identity',
  )
  assert.equal(
    expectedFigureLayout.placements.find(
      (placement) => placement.optionId === stableVisual.owner.optionId,
    ).sourceSpanId,
    fixture.stableOptionIdentities.sourceSpanId,
    'media and source-span identities remain independently data-bound',
  )
  assert.equal(
    screenFigureQuestion.figureLayoutIntentRequirement.intentDigest,
    expectedFigureLayout.intentDigest,
  )
  assert.deepEqual(
    screenFigureQuestion.figureLayoutIntentRequirement,
    printFigureQuestion.figureLayoutIntentRequirement,
  )
  const screenFigurePlacement = translateReadingOptionFigureLayout({
    consumerId: 'screen',
    consumption: screenConsumption,
    question: screenFigureQuestion,
  })
  const printFigurePlacement = translateReadingOptionFigureLayout({
    consumerId: 'print_pdf',
    consumption: printConsumption,
    question: printFigureQuestion,
  })
  assert.equal(screenFigurePlacement.mode, 'figure_source_measured')
  assert.equal(printFigurePlacement.mode, 'figure_source_measured')
  assert.equal(
    screenFigurePlacement.sourceIntentDigest,
    expectedFigureLayout.intentDigest,
  )
  assert.deepEqual(
    screenFigurePlacement.placements.map((placement) => (
      placement.sourcePlacementMatrix
    )),
    expectedFigureLayout.placements.map((placement) => (
      placement.sourcePlacementMatrix
    )),
  )
  assert.deepEqual(
    printFigurePlacement.placements,
    screenFigurePlacement.placements,
    'Screen and Print/PDF consume one exact source-measured placement',
  )
  const genericConsumption = structuredClone(screenConsumption)
  delete genericConsumption.figureLayoutIntents
  const genericQuestion = structuredClone(screenFigureQuestion)
  delete genericQuestion.figureLayoutIntentRequirement
  assert.equal(
    translateReadingOptionFigureLayout({
      consumerId: 'screen',
      consumption: genericConsumption,
      question: genericQuestion,
    }).mode,
    'figure_four_equal_tracks',
    'a compatible Figure Option set without measured evidence retains generic layout',
  )
  const publicRuntime = createCanonicalConsumerRuntime({
    rootDir: path.join(repositoryRoot, 'app/public/paper-assets'),
    db: publicDb,
  })
  const publicScreenConsumption = publicRuntime.load({
    paperId: fixture.input.paperId,
    consumerId: 'screen',
  })
  assert.equal(publicScreenConsumption.disposition, 'ready')
  assert.equal(
    publicScreenConsumption.publicationDigest,
    completed.canonicalPublication.publicationDigest,
    'the public Screen runtime resolves the exact current committed Publication',
  )
  assert.deepEqual(
    publicScreenConsumption.consumerContractRef,
    readingOptionFigureConsumerContractRefs.screen,
    'the public Screen runtime selects the Consumer Contract bound to v46 authority',
  )
  const committedManifestPath = path.join(
    repositoryRoot,
    'app/public/paper-assets',
    fixture.input.paperId,
    'versions',
    completed.canonicalPublication.versionName,
    'canonical/canonical-paper-publication-v46.json',
  )
  const committedManifestBytes = readFileSync(committedManifestPath)
  const substitutedManifest = JSON.parse(committedManifestBytes.toString('utf8'))
  substitutedManifest.publicationDigest = `sha256:${'0'.repeat(64)}`
  writeFileSync(committedManifestPath, JSON.stringify(substitutedManifest))
  assert.throws(
    () => publicRuntime.load({ paperId: fixture.input.paperId, consumerId: 'screen' }),
    (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED'
      && error.diagnostics?.[0]?.code === 'CANONICAL_PUBLICATION_REF_MISMATCH',
    'a merely-present v46 file cannot choose the Screen contract unless it matches the current committed ref',
  )
  writeFileSync(committedManifestPath, committedManifestBytes)
  const screenDisplayAsset = projectCanonicalPaperBrowseDisplayAsset(
    publicScreenConsumption,
  )
  assert.equal(screenDisplayAsset.schemaVersion, 'paper-asset-v1')
  assert.equal(screenDisplayAsset.paper.paperId, fixture.input.paperId)
  assert.deepEqual(
    screenDisplayAsset.content.blocks
      .filter((block) => block.type === 'group')
      .map((block) => block.groupId),
    publicScreenConsumption.visibleStructure
      .filter((node) => node.kind === 'group')
      .map((node) => node.groupId),
    'PaperBrowse display shell is projected from the exact committed visible Group order',
  )
  assert.equal(screenDisplayAsset.answerKey.answers['q-2026-i-021'], undefined)
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

const v1CanonicalGroups = JSON.parse(readFileSync(path.join(
  repositoryRoot,
  'app/public/paper-assets',
  fixture.input.paperId,
  'versions',
  completed.canonicalPublication.versionName,
  'canonical/canonical-question-groups-v1.json',
), 'utf8')).groups
assert.deepEqual(
  v1CanonicalGroups.find(
    (group) => group.identity.groupId === 'group:application',
  ).variant.givenSkeleton,
  {
    presence: 'none',
    answerRegionAbsenceAssertionRef:
      'observation:group:application:answer-region-empty',
  },
  'v1 Application Writing retains its source-proven absent Given Skeleton',
)

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
rebindSourceMeasuredLayouts(
  changedSourceInput.transcription,
  changedQuestionDigest,
)
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
  (input) => { input.transcription.groups[1].questions[0].questionId = 'q-2026-i-021' },
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
    input.transcription.sourceMeasuredFigureLayouts[0]
      .measurementEvidenceBody.labels[0].leftPt += 1
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_SOURCE_LAYOUT_EVIDENCE_INVALID',
)
failureCase(
  (input) => {
    const intent = input.transcription.sourceMeasuredFigureLayouts[0].intent
    intent.placements[0].labelLeftPt += 1
    const { intentDigest: _intentDigest, ...body } = intent
    intent.intentDigest = digestJson(body)
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_SOURCE_LAYOUT_PLACEMENT_INVALID',
)
failureCase(
  (input) => {
    const intent = input.transcription.sourceMeasuredFigureLayouts[0].intent
    intent.placements[0].sourcePlacementMatrix[4] += 1
    const { intentDigest: _intentDigest, ...body } = intent
    intent.intentDigest = digestJson(body)
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_SOURCE_LAYOUT_PLACEMENT_INVALID',
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

v2FailureCase(
  (input) => { delete input.transcription.listeningSource },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
v2FailureCase(
  (input) => { input.transcription.listeningSource.source.firstSuppliedSection = 'listening' },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
v2FailureCase(
  (input) => {
    input.transcription.listeningSource.source.questionPdfSha256 =
      `sha256:${'0'.repeat(64)}`
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_LISTENING_SOURCE_CLOSURE_INVALID',
)
v2FailureCase(
  (input, { fixture }) => {
    input.transcription.groups.push(structuredClone(
      fixture.input.transcription.groups.find((group) => group.groupType === 'listening'),
    ))
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_LISTENING_SOURCE_CLOSURE_INVALID',
)
v2FailureCase(
  (input) => {
    delete input.transcription.groups
      .find((group) => group.groupType === 'grammar_fill')
      .questions[0].promptProvision
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_GRAMMAR_PROMPT_PROVISION_INVALID',
)
v2FailureCase(
  (input) => {
    input.transcription.groups
      .find((group) => group.groupType === 'grammar_fill')
      .questions[1].promptProvision.prompt = 'invented'
  },
  'FORMAT2_TRANSCRIPTION_SCHEMA_INVALID',
)
v2FailureCase(
  (input) => {
    input.transcription.groups
      .find((group) => group.groupType === 'application_writing')
      .blocks[0].applicationEvidence.answerRegionAbsent = true
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_APPLICATION_GIVEN_PROVISION_INVALID',
)
v2FailureCase(
  (input) => { input.transcription.analysisSidecars[0].paperId = 'paper-other' },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_ANALYSIS_SIDECAR_INVALID',
)
v2FailureCase(
  (input) => {
    delete input.transcription.analysisSidecars[0].questions[
      Object.keys(input.transcription.analysisSidecars[0].questions)[0]
    ]
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_ANALYSIS_SIDECAR_INVALID',
)
v2FailureCase(
  (input) => {
    const analysis = input.transcription.analysisSidecars.find(
      (sidecar) => sidecar.schemaVersion === 'seven-choices-analysis-v1',
    )
    analysis.questions[Object.keys(analysis.questions)[0]].positionFacet = null
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_ANALYSIS_SIDECAR_CONTENT_INVALID',
)
v2FailureCase(
  (input) => {
    const analysis = input.transcription.analysisSidecars.find(
      (sidecar) => sidecar.schemaVersion === 'cloze-analysis-v1',
    )
    analysis.blanks[Object.keys(analysis.blanks)[0]].correctFit = null
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_ANALYSIS_SIDECAR_CONTENT_INVALID',
)
v2FailureCase(
  (input) => {
    const analysis = input.transcription.analysisSidecars.find(
      (sidecar) => sidecar.schemaVersion === 'grammar-fill-analysis-v2',
    )
    analysis.blanks[Object.keys(analysis.blanks)[0]].facetKey = null
  },
  'FORMAT2_TRANSCRIPTION_INVALID',
  'FORMAT2_ANALYSIS_SIDECAR_CONTENT_INVALID',
)

const transcriptionV2CompleteListening = freshFixture('v2-complete-listening-')
const retainedListeningGroup = structuredClone(
  transcriptionV2CompleteListening.fixture.input.transcription.groups.find(
    (group) => group.groupType === 'listening',
  ),
)
upgradeFixtureToTranscriptionV2(transcriptionV2CompleteListening.fixture.input)
transcriptionV2CompleteListening.fixture.input.transcription.groups.push(
  retainedListeningGroup,
)
transcriptionV2CompleteListening.fixture.input.transcription.listeningSource = {
  disposition: 'complete',
  groupId: retainedListeningGroup.groupId,
}
assert.equal(
  run(
    transcriptionV2CompleteListening.repositoryRoot,
    transcriptionV2CompleteListening.fixture.input,
  ).lifecycle,
  'importing',
  'v2 can combine complete existing Listening evidence with successor fields',
)

const transcriptionV2 = freshFixture('v2-completeness-')
upgradeFixtureToTranscriptionV2(transcriptionV2.fixture.input)
const transcriptionV2Started = run(
  transcriptionV2.repositoryRoot,
  transcriptionV2.fixture.input,
)
assert.equal(
  transcriptionV2Started.lifecycle,
  'importing',
  JSON.stringify(transcriptionV2Started.diagnostics),
)
assert.equal(
  transcriptionV2Started.artifacts.transcription.schemaVersion,
  'format2-transcription-v2',
)
const transcriptionV2Candidate = JSON.parse(readFileSync(
  artifactPath(
    transcriptionV2.repositoryRoot,
    transcriptionV2Started,
    'candidatePackage',
  ),
  'utf8',
))
assert.equal(
  transcriptionV2Candidate.sourceCapture.documents.find(
    (document) => document.inputKey === 'listening_answer_source',
  ).roles.includes('transcript_source'),
  false,
  'Reading-first source does not invent transcript authority on the answer PDF',
)
assert.equal(
  transcriptionV2Candidate.sourceCapture.observations.some(
    (observation) => observation.kind.startsWith('listening_'),
  ),
  false,
  'Reading-first source does not invent Listening observations',
)
const transcriptionV2Confirmation = exactConfirmation(transcriptionV2Candidate)
const transcriptionV2Completed = resume(transcriptionV2.repositoryRoot, {
  paperId: transcriptionV2.fixture.input.paperId,
  jobId: transcriptionV2Started.jobId,
  teacherConfirmation: transcriptionV2Confirmation,
})
assert.equal(
  transcriptionV2Completed.lifecycle,
  'awaiting_qa',
  JSON.stringify(transcriptionV2Completed.diagnostics),
)
const transcriptionV2VersionDir = path.join(
  transcriptionV2.repositoryRoot,
  'app/public/paper-assets',
  transcriptionV2.fixture.input.paperId,
  'versions',
  transcriptionV2Completed.canonicalPublication.versionName,
)
const transcriptionV2Plan = JSON.parse(readFileSync(
  path.join(transcriptionV2VersionDir, 'canonical/canonical-paper-plan-v1.json'),
  'utf8',
))
assert.deepEqual(
  transcriptionV2Plan.slotBindings
    .filter((binding) => binding.slotId.startsWith('listening.'))
    .map((binding) => ({
      slotId: binding.slotId,
      state: binding.state,
      sourceState: binding.sourceState,
    })),
  [
    { slotId: 'listening.short-dialogue', state: 'inactive', sourceState: 'not_supplied' },
    { slotId: 'listening.long-form', state: 'inactive', sourceState: 'not_supplied' },
  ],
  'Reading-first Format 2 source uses existing inactive not_supplied bindings',
)
const transcriptionV2Groups = JSON.parse(readFileSync(
  path.join(transcriptionV2VersionDir, 'canonical/canonical-question-groups-v1.json'),
  'utf8',
)).groups
assert.equal(
  JSON.stringify(transcriptionV2Groups).includes('Reviewed focus for'),
  false,
  'Analysis model output stays outside Canonical Question Group authority',
)
const transcriptionV2Grammar = transcriptionV2Groups.find(
  (group) => group.identity.groupId === 'group:grammar',
)
assert.deepEqual(
  transcriptionV2Grammar.variant.promptBindings.slice(0, 2).map((binding) => ({
    provision: binding.provision,
    prompt: binding.prompt ?? null,
  })),
  [
    { provision: 'source_prompt', prompt: 'hold' },
    { provision: 'source_proven_none', prompt: null },
  ],
  'Grammar Fill preserves exact per-blank prompt provision',
)
const transcriptionV2Application = transcriptionV2Groups.find(
  (group) => group.identity.groupId === 'group:application',
)
assert.deepEqual(
  transcriptionV2Application.variant.givenSkeleton,
  {
    presence: 'provided',
    parts: [{
      givenPartId: 'given-part:group:application:title',
      role: 'title',
      placement: 'answer_region_top',
      blockRef: 'paragraph:group:application:given:title',
      authorityAssertionRef:
        'observation:group:application:given:given-part:group:application:title',
    }],
  },
  'Application Writing preserves the source-provided title skeleton',
)
assert.equal(
  transcriptionV2Application.content.blocks.find(
    (block) => block.nodeId === 'paragraph:group:application:given:title',
  ).inlines[0].text,
  'Reading Club Invitation',
)
const analysisFileBySchemaVersion = new Map([
  ['reading-choice-analysis-v1', 'reading-choice-analysis-v1.json'],
  ['seven-choices-analysis-v1', 'seven-choices-analysis-v1.json'],
  ['cloze-analysis-v1', 'cloze-analysis-v1.json'],
  ['grammar-fill-analysis-v2', 'grammar-fill-analysis-v1.json'],
])
for (const analysis of transcriptionV2.fixture.input.transcription.analysisSidecars) {
  const analysisPath = path.join(
    transcriptionV2VersionDir,
    'analyses',
    analysisFileBySchemaVersion.get(analysis.schemaVersion),
  )
  assert.deepEqual(
    JSON.parse(readFileSync(analysisPath, 'utf8')),
    analysis,
    `${analysis.schemaVersion} publishes unchanged beside the atomic version`,
  )
  assert.equal(
    transcriptionV2Completed.artifacts.analysisSidecars.items.find(
      (item) => item.schemaVersion === analysis.schemaVersion,
    ).sha256,
    sha256(new Uint8Array(readFileSync(analysisPath))),
  )
}
const transcriptionV2AnalysisPath = path.join(
  transcriptionV2VersionDir,
  'analyses/reading-choice-analysis-v1.json',
)
const transcriptionV2Noop = resume(transcriptionV2.repositoryRoot, {
  paperId: transcriptionV2.fixture.input.paperId,
  jobId: transcriptionV2Started.jobId,
  teacherConfirmation: transcriptionV2Confirmation,
})
assert.equal(transcriptionV2Noop.canonicalPublication.publicationDigest,
  transcriptionV2Completed.canonicalPublication.publicationDigest)
writeFileSync(transcriptionV2AnalysisPath, '{}\n')
assertFailed(
  resume(transcriptionV2.repositoryRoot, {
    paperId: transcriptionV2.fixture.input.paperId,
    jobId: transcriptionV2Started.jobId,
    teacherConfirmation: transcriptionV2Confirmation,
  }),
  'FORMAT2_ANALYSIS_SIDECAR_INVALID',
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
