#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import {
  buildCanonicalReadingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import {
  format2RichCandidateAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import {
  format2RichConsumerContractRefs,
} from '../shared/paper-canonical/consumers.mjs'
import {
  translateReadingOptionFigureLayout,
} from '../shared/paper-canonical/readingOptionFigureLayout.mjs'
import { digestJson, sha256, stableStringify } from '../shared/paper-canonical/stable.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  createFormat2ImportJobRuntime,
} from '../server/paper-import/internal/format2ImportJobRuntime.mjs'
import {
  confirmVisualImportCandidate,
  rebindExactVisualTeacherConfirmation,
} from '../server/paper-canonical/visualCandidate.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumptionSync,
} from '../server/paper-canonical/publication.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const paperId = 'paper-mock-sz-2026-m1'
const groupId = 'group-mock-sz-2026-m1-reading-d'
const questionId = 'q-mock-sz-2026-m1-033'
const labels = ['A', 'B', 'C', 'D']
const paperPipelineRoot = path.join(
  repoRoot,
  'scripts/import-pipeline/papers',
  paperId,
)
const evidenceRoot = path.join(
  repoRoot,
  'scripts/import-pipeline/papers',
  paperId,
  'visual-candidates/q33',
)
const canaryRoot = path.join(evidenceRoot, 'canary')
const artifactRoot = path.join(
  repoRoot,
  'output/playwright/source-faithful-visual-import-q33',
)
const pdfRoot = path.join(repoRoot, 'output/pdf')
const pdfPath = path.join(pdfRoot, 'shenzhen-q33-source-crop-student.pdf')
mkdirSync(artifactRoot, { recursive: true })
mkdirSync(pdfRoot, { recursive: true })
assert.equal(
  existsSync(path.join(
    repoRoot,
    'scripts/materialize-paper-mock-sz-2026-m1-q33-option-figure-canary.mjs',
  )),
  false,
  'the superseded Q33-only Canonical materializer stays retired',
)

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function paperArtifactPath(repositoryRoot, result, artifactName) {
  return path.join(
    repositoryRoot,
    'scripts/import-pipeline/papers',
    paperId,
    result.artifacts[artifactName].relativePath,
  )
}

function assertFailed(result, code) {
  assert.equal(result.lifecycle, 'failed')
  assert.equal(result.stopReason?.code, code, JSON.stringify(result.diagnostics))
  assert.ok(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    `expected ${code}, received ${JSON.stringify(result.diagnostics)}`,
  )
}

function optionIdentity(group) {
  if (group.variant.choiceOwnership.ownership === 'none') return []
  if (group.variant.choiceOwnership.ownership === 'shared_bank') {
    return group.variant.choiceOwnership.options.map(({ optionId, label }) => ({
      optionId,
      label,
    }))
  }
  return group.variant.choiceOwnership.sets.map((set) => ({
    questionId: set.questionId,
    options: set.options.map(({ optionId, label }) => ({ optionId, label })),
  }))
}

function stablePaperBoundary({ plan, groups, answerKey }) {
  return {
    paperId: plan.paperId,
    slotBindings: plan.slotBindings.map((binding) => ({
      slotId: binding.slotId,
      state: binding.state,
      sourceState: binding.sourceState,
      groupId: binding.groupRef?.groupId || null,
    })),
    groups: groups.map((group) => ({
      groupId: group.identity.groupId,
      paperId: group.identity.paperId,
      family: group.variant.family,
      questionIds: group.questionRefs.map((question) => question.questionId),
      options: optionIdentity(group),
    })),
    answers: Object.values(answerKey.answers).map((answer) => ({
      questionId: answer.questionId,
      questionNo: answer.questionNo,
      answer: answer.answer,
    })),
  }
}

const config = readJson(path.join(paperPipelineRoot, 'config.json'))
const transcription = readJson(path.join(
  paperPipelineRoot,
  'format2-job/format2-transcription-v4.json',
))
const historicalCandidate = readJson(path.join(
  evidenceRoot,
  'visual-import-candidate-v1.json',
))
const historicalConfirmation = readJson(path.join(
  evidenceRoot,
  'visual-teacher-confirmation-v1.json',
))
for (const visual of transcription.visuals) {
  visual.alternatives = historicalCandidate.candidates
    .filter((candidate) => (
      candidate.observationId === visual.observationId
      && candidate.method !== 'source_crop'
    ))
    .map(({
      candidateDigest: _candidateDigest,
      observationId: _observationId,
      owner: _owner,
      ...candidate
    }) => ({
      ...candidate,
      trigger: {
        kind: 'owner_request',
        note: 'Retained from the exact historical Q33 comparison surface for migration parity.',
      },
    }))
}
const questionPdfSha256 = transcription.sourceBindings.questionPdfSha256
const answerPdfSha256 = transcription.sourceBindings.answerPdfSha256
const jobInput = {
  paperId,
  sources: {
    schemaVersion: 'format2-source-pair-v1',
    format: 'format2-pdf-pair-v1',
    questionPdf: {
      absolutePath: config.paperPath,
      sha256: questionPdfSha256,
    },
    answerPdf: {
      absolutePath: config.answersPath,
      sha256: answerPdfSha256,
    },
  },
  provenance: transcription.provenance,
  transcription,
  state: { writerId: 'ticket-05-shenzhen-q33-parity' },
}

const jobRepositoryRoot = mkdtempSync(path.join(tmpdir(), 'eqb-sz-q33-generic-job-'))
process.once('exit', () => rmSync(jobRepositoryRoot, { recursive: true, force: true }))
const runtime = createFormat2ImportJobRuntime({ repositoryRoot: jobRepositoryRoot })
const started = runtime.startOrContinueFormat2ImportJob(jobInput)
assert.equal(started.lifecycle, 'importing', JSON.stringify(started.diagnostics))
assert.equal(started.stopReason?.code, 'exact_teacher_confirmation_required')
assert.deepEqual(
  runtime.startOrContinueFormat2ImportJob(jobInput),
  started,
  'identical generic Job replay is idempotent before confirmation',
)

const successorCandidate = readJson(
  paperArtifactPath(jobRepositoryRoot, started, 'candidatePackage'),
)
assert.equal(
  successorCandidate.sourceCapture.documents.find(
    (document) => document.inputKey === 'original_question_source',
  )?.sha256,
  questionPdfSha256,
  'generic Candidate stays bound to the exact admitted question PDF',
)
assert.equal(
  successorCandidate.sourceCapture.documents.find(
    (document) => document.inputKey === 'listening_answer_source',
  )?.sha256,
  answerPdfSha256,
  'generic Candidate stays bound to the exact admitted answer PDF',
)
assert.deepEqual(
  successorCandidate.candidates.map((candidate) => candidate.candidateDigest),
  historicalCandidate.candidates.map((candidate) => candidate.candidateDigest),
  'generic replay retains the complete twelve-candidate reviewed visual surface',
)
const reboundConfirmation = rebindExactVisualTeacherConfirmation({
  predecessorCandidatePackage: historicalCandidate,
  predecessorTeacherConfirmation: historicalConfirmation,
  successorCandidatePackage: successorCandidate,
})
assert.deepEqual(
  reboundConfirmation.decisions.map((decision) => decision.selectedCandidateDigest),
  historicalConfirmation.decisions.map((decision) => decision.selectedCandidateDigest),
  'generic Job rebind preserves the four exact accepted source-crop candidates',
)
const completed = runtime.resumeFormat2ImportJob({
  paperId,
  jobId: started.jobId,
  teacherConfirmation: reboundConfirmation,
})
assert.equal(completed.lifecycle, 'awaiting_qa', JSON.stringify(completed.diagnostics))
assert.equal(completed.stopReason?.code, 'owner_qa_required')
assert.deepEqual(completed.diagnostics, [])
assert.equal(completed.canonicalPublication.reloads.screen.disposition, 'ready')
assert.equal(completed.canonicalPublication.reloads.printPdf.disposition, 'ready')
assert.deepEqual(
  runtime.startOrContinueFormat2ImportJob(jobInput),
  completed,
  'identical completed replay returns the exact committed publication',
)

const confirmedSelection = confirmVisualImportCandidate(
  successorCandidate,
  reboundConfirmation,
)
const publicDb = new DatabaseSync(path.join(jobRepositoryRoot, 'data/question-bank.sqlite'))
let screenConsumption
let printConsumption
try {
  const store = createFileSystemCanonicalPublicationStore({
    rootDir: path.join(jobRepositoryRoot, 'app/public/paper-assets'),
    db: publicDb,
  })
  screenConsumption = loadPaperForConsumptionSync({
    paperId,
    version: completed.canonicalPublication.versionName,
    consumerContract: format2RichConsumerContractRefs.screen,
  }, store)
  printConsumption = loadPaperForConsumptionSync({
    paperId,
    version: completed.canonicalPublication.versionName,
    consumerContract: format2RichConsumerContractRefs.print_pdf,
  }, store)
} finally {
  publicDb.close()
}
assert.equal(screenConsumption.disposition, 'ready')
assert.equal(printConsumption.disposition, 'ready')

const genericLatestRoot = path.join(
  jobRepositoryRoot,
  'app/public/paper-assets',
  paperId,
  'versions',
  completed.canonicalPublication.versionName,
)
const genericGroups = readJson(path.join(
  genericLatestRoot,
  'canonical/canonical-question-groups-v1.json',
)).groups
const canonicalGroup = genericGroups.find(
  (group) => group.identity.groupId === groupId,
)
assert.ok(canonicalGroup)
const predecessorLatestRoot = path.join(
  repoRoot,
  'app/public/paper-assets',
  paperId,
  'latest',
)
const predecessorBoundary = stablePaperBoundary({
  plan: readJson(path.join(
    predecessorLatestRoot,
    'canonical/canonical-paper-plan-v1.json',
  )),
  groups: readJson(path.join(
    predecessorLatestRoot,
    'canonical/canonical-question-groups-v1.json',
  )).groups,
  answerKey: readJson(path.join(predecessorLatestRoot, 'answer-key.json')),
})
const predecessorQ33Group = readJson(path.join(
  predecessorLatestRoot,
  'canonical/canonical-question-groups-v1.json',
)).groups.find((group) => group.identity.groupId === groupId)
assert.notEqual(
  canonicalGroup.semanticDigest,
  predecessorQ33Group.semanticDigest,
  'generic compilation derives a new semantic digest for the confirmed figure semantics',
)
const genericBoundary = stablePaperBoundary({
  plan: readJson(path.join(
    genericLatestRoot,
    'canonical/canonical-paper-plan-v1.json',
  )),
  groups: genericGroups,
  answerKey: {
    answers: Object.fromEntries(transcription.officialAnswers.map((answer) => [
      answer.questionId,
      {
        questionId: answer.questionId,
        questionNo: Number(answer.questionId.slice(-3)),
        answer: answer.answer,
      },
    ])),
  },
})
assert.deepEqual(
  genericBoundary,
  predecessorBoundary,
  'generic replay preserves B08 paper, slot, group, question, Option, order, numbering, and answer identities',
)

const layout = transcription.sourceMeasuredFigureLayouts[0]
const historicalPolicy = readJson(path.join(canaryRoot, 'asset-framing-policy-v1.json'))
assert.deepEqual(
  layout.intent.placements.map((placement) => placement.sourcePlacementMatrix),
  historicalPolicy.sourceLayoutIntent.placements.map(
    (placement) => placement.sourcePlacementMatrix,
  ),
  'generic replay preserves the exact accepted PDF placement matrices',
)
const policy = structuredClone(historicalPolicy)
policy.sourceLayoutIntent = layout.intent
const canary = {
  confirmedSelection,
  canonicalGroup,
  policy,
  sourceLayoutMeasurement: layout.measurementEvidenceBody,
  screenConsumption,
  printConsumption,
  canaryManifest: {
    canaryDigest: digestJson({
      jobId: completed.jobId,
      publicationDigest: completed.canonicalPublication.publicationDigest,
      sourceLayoutIntentDigest: layout.intent.intentDigest,
    }),
    sourceLayoutMeasurementDigest: digestJson(layout.measurementEvidenceBody),
  },
}

const qaFixturePath = path.join(
  jobRepositoryRoot,
  'app/public/qa/paper-mock-sz-2026-m1-q33-screen-consumption.json',
)
mkdirSync(path.dirname(qaFixturePath), { recursive: true })
writeFileSync(qaFixturePath, `${JSON.stringify(screenConsumption, null, 2)}\n`)

const sourceMutationRoot = mkdtempSync(path.join(tmpdir(), 'eqb-sz-q33-source-mutation-'))
try {
  const mutatedSource = structuredClone(jobInput)
  mutatedSource.sources.questionPdf.sha256 = `sha256:${'0'.repeat(64)}`
  assertFailed(
    createFormat2ImportJobRuntime({ repositoryRoot: sourceMutationRoot })
      .startOrContinueFormat2ImportJob(mutatedSource),
    'FORMAT2_JOB_QUESTION_SOURCE_DIGEST_MISMATCH',
  )
} finally {
  rmSync(sourceMutationRoot, { recursive: true, force: true })
}

const confirmationMutationRoot = mkdtempSync(
  path.join(tmpdir(), 'eqb-sz-q33-confirmation-mutation-'),
)
try {
  const mutationRuntime = createFormat2ImportJobRuntime({
    repositoryRoot: confirmationMutationRoot,
  })
  const mutationStarted = mutationRuntime.startOrContinueFormat2ImportJob(jobInput)
  assert.equal(mutationStarted.lifecycle, 'importing')
  const mutatedConfirmation = structuredClone(reboundConfirmation)
  mutatedConfirmation.decisions[0].selectedCandidateDigest =
    reboundConfirmation.decisions[1].selectedCandidateDigest
  assertFailed(
    mutationRuntime.resumeFormat2ImportJob({
      paperId,
      jobId: mutationStarted.jobId,
      teacherConfirmation: mutatedConfirmation,
    }),
    'VISUAL_CONFIRMATION_CANDIDATE_MISMATCH',
  )
} finally {
  rmSync(confirmationMutationRoot, { recursive: true, force: true })
}

const comparisonManifest = JSON.parse(readFileSync(
  path.join(evidenceRoot, 'comparison-manifest.json'),
  'utf8',
))
const historicalLayoutRef = comparisonManifest.layout.layoutRef
const historicalLayoutAuthority = resolveCanonicalAuthority(
  historicalLayoutRef.authorityRef,
)
assert.equal(
  historicalLayoutAuthority.ok,
  true,
  'immutable comparison evidence resolves its exact historical v47 authority',
)
assert.deepEqual(
  historicalLayoutAuthority.closure.authorityRef,
  historicalLayoutRef.authorityRef,
)
assert.equal(
  digestJson(
    historicalLayoutAuthority.closure.artifacts[
      'renderer-reading-option-figure-layout'
    ],
  ),
  historicalLayoutRef.digest,
)

assert.equal(canary.confirmedSelection.status, 'confirmed')
assert.equal(canary.confirmedSelection.unresolvedIssues.length, 0)
assert.deepEqual(
  canary.confirmedSelection.confirmedSelections.map((selection) => selection.method),
  ['source_crop', 'source_crop', 'source_crop', 'source_crop'],
)
const richAuthority = resolveCanonicalAuthority(format2RichCandidateAuthorityRef)
assert.equal(richAuthority.ok, true)
const readingFamilyContract = richAuthority.closure.families.get('reading')
assert.deepEqual(canary.canonicalGroup.contractRef, {
  manifestId: format2RichCandidateAuthorityRef.manifestId,
  manifestVersion: format2RichCandidateAuthorityRef.manifestVersion,
  manifestDigest: format2RichCandidateAuthorityRef.manifestDigest,
  familyContractId: readingFamilyContract.familyContractId,
  familyContractVersion: readingFamilyContract.version,
  familyContractDigest: digestJson(readingFamilyContract),
})
assert.equal(canary.canonicalGroup.media.length, 4)
assert.deepEqual(
  canary.canonicalGroup.media.map((media) => media.mediaId),
  labels.map((label) => `media:${questionId}:${label}`),
  'generic replay preserves the four accepted Canonical media identities',
)
assert.equal(stableStringify(canary.canonicalGroup).includes('[Fig.]'), false)
assert.equal(stableStringify(canary.canonicalGroup).includes('reading-d-q33.png'), false)
const canonicalPassageText = stableStringify(canary.canonicalGroup.content)
assert.equal(canonicalPassageText.includes('( 电 荷 分 离 ) , a process'), true)
assert.equal(canonicalPassageText.includes('(水力 发电) relies'), true)

const canonicalQuestion = canary.canonicalGroup.variant.questions.find(
  (question) => question.questionId === questionId,
)
const canonicalSet = canary.canonicalGroup.variant.choiceOwnership.sets.find(
  (set) => set.questionId === questionId,
)
assert.ok(canonicalQuestion)
assert.ok(canonicalSet)
assert.equal(canonicalQuestion.correctOptionId, `option:${questionId}:D`)
assert.deepEqual(canonicalSet.options.map((option) => option.label), labels)
assert.deepEqual(
  canonicalSet.options.map((option) => Object.keys(option).sort()),
  labels.map(() => ['figure', 'label', 'optionId']),
)
assert.deepEqual(
  canonicalSet.options.map((option) => option.figure.mediaId),
  canary.canonicalGroup.media.map((media) => media.mediaId),
)
for (const [index, label] of labels.entries()) {
  const option = canonicalSet.options[index]
  const media = canary.canonicalGroup.media[index]
  const selection = canary.confirmedSelection.confirmedSelections.find(
    (candidate) => candidate.owner.optionId === option.optionId,
  )
  assert.ok(selection)
  assert.equal(media.sha256, selection.artifact.sha256)
  assert.equal(media.pixelWidth, selection.artifact.pixelWidth)
  assert.equal(media.pixelHeight, selection.artifact.pixelHeight)
  const optionEntry = canary.canonicalGroup.sourceMap.entries.find(
    (entry) => entry.target.kind === 'option' && entry.target.id === option.optionId,
  )
  const mediaEntry = canary.canonicalGroup.sourceMap.entries.find(
    (entry) => entry.target.kind === 'media' && entry.target.id === media.mediaId,
  )
  assert.deepEqual(
    optionEntry?.sourceSpanRefs,
    [`source-span:observation:paper-mock-sz-2026-m1:q33:option:${label}`],
  )
  assert.deepEqual(mediaEntry?.sourceSpanRefs, optionEntry.sourceSpanRefs)
}

assert.equal(
  canary.policy.principle,
  'The asset owns complete source-authored figure pixels; the source layout intent owns source-authored placement; every renderer projects that intent.',
)
assert.equal(canary.policy.contentEnvelope.kind, 'exact_pdf_embedded_image_extent')
assert.equal(canary.policy.contentEnvelope.excludes.includes('A-D option labels'), true)
assert.equal(canary.policy.contentEnvelope.excludes.includes('page margins'), true)
assert.equal(canary.policy.contentEnvelope.noAutomaticTrim.includes('not an authority'), true)
assert.equal(canary.policy.contentEnvelope.noTransparencyRewrite.includes('question meaning'), true)
assert.equal(canary.policy.rendererOwnership.invariant.includes('source-measured'), true)
assert.equal(canary.policy.rendererOwnership.invariant.includes('source-authored X/Y scale'), true)
assert.equal(canary.policy.rendererOwnership.invariant.includes('consumer crop, stretch'), true)
assert.equal(canary.policy.sourceLayoutIntent.schemaVersion, 'reading-option-figure-source-layout-intent-v1')
assert.equal(
  canary.policy.sourceLayoutIntent.measurementEvidence.evidenceDigest,
  digestJson(canary.sourceLayoutMeasurement),
)
assert.equal(
  canary.canaryManifest.sourceLayoutMeasurementDigest,
  digestJson(canary.sourceLayoutMeasurement),
)
assert.equal(
  canary.sourceLayoutMeasurement.sourceMeasurementRef.measurementDigest,
  readJson(path.join(canaryRoot, 'source-layout-measurement-v1.json')).measurementDigest,
)
assert.equal(
  canary.sourceLayoutMeasurement.sourcePdfSha256,
  'sha256:df0c4e0a0d1aee4557f122591e3b778d7b48f2f324d75dba120343bb00926c80',
)
assert.equal(canary.policy.sourceLayoutIntent.rowStartPt, 24)
assert.equal(canary.policy.sourceLayoutIntent.rowWidthPt, 369.72)
assert.equal(canary.policy.sourceLayoutIntent.bankHeightPt, 56.12)
assert.deepEqual(
  canary.policy.sourceLayoutIntent.placements.map((placement) => ({
    label: placement.label,
    labelLeftPt: placement.labelLeftPt,
    imageLeftPt: placement.imageLeftPt,
    imageTopPt: placement.imageTopPt,
    imageWidthPt: placement.imageWidthPt,
    imageHeightPt: placement.imageHeightPt,
  })),
  [
    { label: 'A', labelLeftPt: 0, imageLeftPt: 14.64, imageTopPt: 1.2, imageWidthPt: 20.52, imageHeightPt: 51.48 },
    { label: 'B', labelLeftPt: 120, imageLeftPt: 134.04, imageTopPt: 0.72, imageWidthPt: 24.6, imageHeightPt: 51.96 },
    { label: 'C', labelLeftPt: 240, imageLeftPt: 254.04, imageTopPt: 0, imageWidthPt: 22.08, imageHeightPt: 51.96 },
    { label: 'D', labelLeftPt: 336, imageLeftPt: 350.16, imageTopPt: 1.68, imageWidthPt: 19.56, imageHeightPt: 51.96 },
  ],
)

function project(consumption) {
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId,
  })
}

function figureQuestion(group) {
  const question = group.questions.find((candidate) => candidate.questionId === questionId)
  assert.equal(question?.optionMode, 'figure')
  return question
}

function dataUrlSources(html, className) {
  return [...html.matchAll(new RegExp(
    `<img class="${className}" src="(data:image\\/png;base64,[^"]+)"`,
    'g',
  ))].map((match) => match[1])
}

function bytesFromDataUrl(source) {
  return new Uint8Array(Buffer.from(source.split(',')[1], 'base64'))
}

function extractPdfImageDataUrls(pdfFile) {
  const extractionRoot = mkdtempSync(path.join(tmpdir(), 'eqb-q33-pdfimages-'))
  try {
    execFileSync('pdfimages', [
      '-png',
      pdfFile,
      path.join(extractionRoot, 'q33-image'),
    ])
    const imageFiles = readdirSync(extractionRoot)
      .filter((name) => /^q33-image-\d+\.png$/.test(name))
      .sort()
    assert.equal(imageFiles.length, 4, 'PDF contains exactly four decoded image streams')
    return imageFiles.map((name) =>
      `data:image/png;base64,${readFileSync(path.join(extractionRoot, name)).toString('base64')}`)
  } finally {
    rmSync(extractionRoot, { recursive: true, force: true })
  }
}

async function decodedRgbaIdentities(page, sources) {
  const decoded = await page.evaluate(async (imageSources) => Promise.all(
    imageSources.map(async (source) => {
      const image = new Image()
      image.src = source
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', {
        alpha: true,
        colorSpace: 'srgb',
        willReadFrequently: true,
      })
      context.drawImage(image, 0, 0)
      const rgba = context.getImageData(
        0,
        0,
        image.naturalWidth,
        image.naturalHeight,
        { colorSpace: 'srgb' },
      ).data
      return {
        pixelWidth: image.naturalWidth,
        pixelHeight: image.naturalHeight,
        rgba: [...rgba],
      }
    }),
  ), sources)
  return decoded.map(({ rgba, ...identity }) => ({
    ...identity,
    rgbaSha256: sha256(Uint8Array.from(rgba)),
  }))
}

function syntheticPrintItem(group) {
  return {
    detail: {
      id: group.groupId,
      paperId: group.paperId,
      title: '2026 Shenzhen First Mock - Reading D',
      source: 'Owner-confirmed local Q33 canary',
      groupType: 'reading',
      passage: {
        title: 'POISONED LEGACY TITLE',
        materialText: 'POISONED LEGACY PASSAGE [Fig.]',
      },
      questions: group.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: question.questionId === questionId
          ? 'WRONG-LEGACY-ANSWER'
          : 'A',
        explanation: question.questionId === questionId
          ? 'Official answer identity retained from the admitted answer source.'
          : '',
        options: [{ label: 'A', content: 'POISONED LEGACY OPTION' }],
      })),
    },
    score: 2.5,
    sectionTitle: 'Reading',
    note: '',
  }
}

const screenGroup = project(canary.screenConsumption)
const printGroup = project(canary.printConsumption)
const screenQuestion = figureQuestion(screenGroup)
const printQuestion = figureQuestion(printGroup)
assert.equal(Object.hasOwn(screenQuestion, 'correctOptionId'), false)
assert.equal(printQuestion.correctOptionId, `option:${questionId}:D`)
const selectedArtifactDigests = canary.confirmedSelection.confirmedSelections
  .sort((left, right) => left.owner.optionId.localeCompare(right.owner.optionId))
  .map((selection) => selection.artifact.sha256)
assert.deepEqual(
  screenQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
  selectedArtifactDigests,
)
assert.deepEqual(
  printQuestion.options.map((option) => option.figure.mediaArtifact.sha256),
  selectedArtifactDigests,
)
const surface = buildCanonicalReadingConsumptionSurfaceData({
  consumption: canary.screenConsumption,
  groupId,
})
const surfaceQuestion = surface.surfaceData.questions.find(
  (question) => question.id === questionId,
)
assert.ok(surfaceQuestion?.figurePlacement)
assert.equal(surfaceQuestion.figurePlacement.mode, 'figure_source_measured')
assert.equal(surfaceQuestion.figurePlacement.objectFit, 'fill')
assert.equal(surfaceQuestion.figurePlacement.objectPosition, 'center')
assert.equal(
  surfaceQuestion.figurePlacement.sourceMatrixScalePolicy,
  'reproduce_source_authored_xy_scale',
)
assert.equal(
  surfaceQuestion.figurePlacement.consumerTransformPolicy,
  'no_additional_crop_or_stretch',
)
assert.equal(
  surfaceQuestion.figurePlacement.sourceIntentDigest,
  canary.policy.sourceLayoutIntent.intentDigest,
)
assert.deepEqual(
  surfaceQuestion.options.map((option) => option.figure.sha256),
  selectedArtifactDigests,
)

assert.deepEqual(
  screenQuestion.figureLayoutIntentRequirement,
  printQuestion.figureLayoutIntentRequirement,
)
assert.equal(
  screenQuestion.figureLayoutIntentRequirement.intentDigest,
  canary.policy.sourceLayoutIntent.intentDigest,
)
for (const mutate of [
  (consumption) => { delete consumption.figureLayoutIntents },
  (consumption) => { consumption.figureLayoutIntents[0].placements[0].imageWidthPt += 1 },
  (consumption) => { consumption.figureLayoutIntents.push(structuredClone(consumption.figureLayoutIntents[0])) },
]) {
  const invalid = structuredClone(canary.screenConsumption)
  mutate(invalid)
  assert.throws(
    () => buildCanonicalReadingConsumptionSurfaceData({
      consumption: invalid,
      groupId,
    }),
    (error) => error?.code === 'READING_OPTION_FIGURE_LAYOUT_REJECTED',
  )
}
for (const [consumerId, consumption] of [
  ['screen', canary.screenConsumption],
  ['print_pdf', canary.printConsumption],
]) {
  const strippedLayoutBinding = structuredClone(consumption)
  delete strippedLayoutBinding.figureLayoutIntents
  delete strippedLayoutBinding.figureLayoutIntentRequirements
  const strippedQuestion = figureQuestion(project(strippedLayoutBinding))
  assert.throws(
    () => translateReadingOptionFigureLayout({
      consumerId,
      consumption: strippedLayoutBinding,
      question: strippedQuestion,
    }),
    (error) => error?.code === 'READING_OPTION_FIGURE_LAYOUT_REJECTED',
    `${consumerId} rejects deletion of both top-level source-layout fields`,
  )
}

const otherPageConsumption = structuredClone(canary.screenConsumption)
const otherPageIntent = otherPageConsumption.figureLayoutIntents[0]
otherPageIntent.sourcePage = 5
const { intentDigest: _oldIntentDigest, ...otherPageIntentBody } = otherPageIntent
otherPageIntent.intentDigest = digestJson(otherPageIntentBody)
const otherPageQuestion = structuredClone(screenQuestion)
otherPageQuestion.figureLayoutIntentRequirement.intentDigest =
  otherPageIntent.intentDigest
assert.equal(
  translateReadingOptionFigureLayout({
    consumerId: 'screen',
    consumption: otherPageConsumption,
    question: otherPageQuestion,
  }).mode,
  'figure_source_measured',
  'shared translator accepts positive source pages; page 4 remains canary evidence',
)

const blocks = [{
  type: 'question_group',
  questionGroupId: groupId,
  score: 2.5,
}]
const item = syntheticPrintItem(printGroup)
const printCases = new Map()
for (const versionType of ['student', 'teacher']) {
  const html = buildPrintHtml({
    title: '2026 Shenzhen First Mock - Reading D Q33 canary',
    versionType,
    items: [item],
    blocks,
    questionNumberStart: 32,
    printStyle: 'exam',
    canonicalConsumption: canary.printConsumption,
  })
  assert.equal(html.includes('POISONED LEGACY'), false)
  assert.equal(html.includes('[Fig.]'), false)
  assert.equal(html.includes('Which of the following best illustrates'), true)
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher')
  assert.equal(html.includes('<strong>【答案】</strong>D'), versionType === 'teacher')
  assert.equal(html.includes('WRONG-LEGACY-ANSWER'), false)
  const sources = dataUrlSources(html, 'canonical-figure-option-image')
  assert.equal(sources.length, 4)
  assert.deepEqual(
    sources.map((source) => sha256(bytesFromDataUrl(source))),
    selectedArtifactDigests,
  )
  const outputPath = path.join(artifactRoot, `q33-${versionType}-print.html`)
  writeFileSync(outputPath, html)
  printCases.set(versionType, { html, sources })
}
assert.deepEqual(
  printCases.get('student').sources,
  printCases.get('teacher').sources,
)

function pdfImageDimensions(pdfFile) {
  const listing = execFileSync('pdfimages', ['-list', pdfFile], { encoding: 'utf8' })
  return {
    listing,
    dimensions: [...listing.matchAll(
      /^\s+\d+\s+\d+\s+image\s+(\d+)\s+(\d+)/gm,
    )].map((match) => [Number(match[1]), Number(match[2])]),
  }
}

let pdfImagePixelIdentityEvidence = null

function assertNear(actual, expected, message, tolerance = 0.35) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`,
  )
}

async function renderedSourceGeometry(page, {
  bankSelector,
  labelSelector,
  boxSelector,
}) {
  return page.evaluate(({ bankSelector, labelSelector, boxSelector }) => {
    const bank = document.querySelector(bankSelector)
    if (!bank) throw new Error(`Missing source-measured bank ${bankSelector}`)
    const bankBox = bank.getBoundingClientRect()
    const labels = [...bank.querySelectorAll(labelSelector)].map((label) => {
      const box = label.getBoundingClientRect()
      return { left: box.left - bankBox.left, top: box.top - bankBox.top }
    })
    const images = [...bank.querySelectorAll(boxSelector)].map((image) => {
      const box = image.getBoundingClientRect()
      return {
        left: box.left - bankBox.left,
        top: box.top - bankBox.top,
        width: box.width,
        height: box.height,
      }
    })
    return { width: bankBox.width, height: bankBox.height, labels, images }
  }, { bankSelector, labelSelector, boxSelector })
}

function assertSourceGeometry(geometry, surfaceName) {
  const pxPerPt = 96 / 72
  const intent = canary.policy.sourceLayoutIntent
  assertNear(geometry.width / pxPerPt, intent.rowWidthPt, `${surfaceName} row width`)
  assertNear(geometry.height / pxPerPt, intent.bankHeightPt, `${surfaceName} bank height`)
  for (const [index, expected] of intent.placements.entries()) {
    assertNear(
      geometry.labels[index].left / pxPerPt,
      expected.labelLeftPt,
      `${surfaceName} Option ${expected.label} label left`,
    )
    assertNear(
      geometry.labels[index].top / pxPerPt,
      expected.labelTopPt,
      `${surfaceName} Option ${expected.label} label top`,
    )
    assertNear(
      geometry.images[index].left / pxPerPt,
      expected.imageLeftPt,
      `${surfaceName} Option ${expected.label} image left`,
    )
    assertNear(
      geometry.images[index].top / pxPerPt,
      expected.imageTopPt,
      `${surfaceName} Option ${expected.label} image top`,
    )
    assertNear(
      geometry.images[index].width / pxPerPt,
      expected.imageWidthPt,
      `${surfaceName} Option ${expected.label} image width`,
    )
    assertNear(
      geometry.images[index].height / pxPerPt,
      expected.imageHeightPt,
      `${surfaceName} Option ${expected.label} image height`,
    )
  }
}

async function verifyRenderedArtifacts() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve(repoRoot, 'app'),
    publicDir: path.join(jobRepositoryRoot, 'app/public'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({
    headless: true,
    channel: 'chromium',
  })
  try {
    const screenPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const screenUrl = new URL('canonical-reading-qa.html', appUrl)
    screenUrl.searchParams.set('groupId', groupId)
    screenUrl.searchParams.set('fixture', 'q33-source-crop')
    await screenPage.goto(screenUrl.href)
    const bank = screenPage.locator('[data-canonical-layout-id="reading-option-figure-layout"]')
    await bank.waitFor()
    const readingGroup = screenPage.locator('[data-canonical-group-type="reading"]')
    assert.equal(await readingGroup.count(), 1)
    assert.equal(await readingGroup.getAttribute('data-canonical-group-id'), groupId)
    assert.equal(
      await readingGroup.getAttribute('data-canonical-semantic-signature'),
      surface.semanticDigest,
    )
    assert.deepEqual(
      await readingGroup.locator('.ps-question-no').evaluateAll(
        (elements) => elements.map((element) => getComputedStyle(element).fontWeight),
      ),
      surface.surfaceData.questions.map(() => '400'),
      'Reading Screen question numbers use the canonical visible weight',
    )
    assert.deepEqual(
      await readingGroup.locator('.ps-option-label').evaluateAll(
        (elements) => elements.map((element) => getComputedStyle(element).fontWeight),
      ),
      surface.surfaceData.questions.flatMap(
        (question) => question.options.map(() => '400'),
      ),
      'Reading Screen option labels use the canonical visible weight',
    )
    assert.equal(await screenPage.locator('.ps-option--figure').count(), 4)
    assert.deepEqual(
      await screenPage.locator('.ps-option-label--figure').allTextContents(),
      ['A.', 'B.', 'C.', 'D.'],
    )
    assert.deepEqual(
      await screenPage.locator('.ps-option-figure-image').evaluateAll(
        (images) => images.map((image) => ({
          src: image.getAttribute('src'),
          naturalWidth: image.naturalWidth,
          naturalHeight: image.naturalHeight,
          objectFit: getComputedStyle(image).objectFit,
          objectPosition: getComputedStyle(image).objectPosition,
        })),
      ),
      surfaceQuestion.options.map((option) => ({
        src: `data:image/png;base64,${option.figure.encodedBytes}`,
        naturalWidth: option.figure.pixelWidth,
        naturalHeight: option.figure.pixelHeight,
        objectFit: 'fill',
        objectPosition: '50% 50%',
      })),
    )
    assertSourceGeometry(await renderedSourceGeometry(screenPage, {
      bankSelector: '.ps-option-list--figure-source-measured',
      labelSelector: '.ps-option-label--figure',
      boxSelector: '.ps-option-figure-box',
    }), 'Screen')
    assert.equal(await screenPage.locator('text=[Fig.]').count(), 0)
    assert.equal(await screenPage.locator('[data-canonical-correct-option-id]').count(), 0)
    await screenPage.screenshot({
      path: path.join(artifactRoot, 'q33-screen.png'),
      fullPage: true,
    })
    writeFileSync(
      path.join(artifactRoot, 'q33-screen-url.txt'),
      `${screenUrl.href}\n`,
    )
    await screenPage.close()

    for (const [versionType, printCase] of printCases) {
      const page = await browser.newPage({ viewport: { width: 900, height: 1100 } })
      await page.setContent(printCase.html, { waitUntil: 'load' })
      await page.locator('.canonical-figure-options').waitFor()
      assert.equal(await page.locator('.canonical-figure-option-image').count(), 4)
      assert.deepEqual(
        await page.locator('.canonical-figure-option-image').evaluateAll(
          (images) => images.map((image) => getComputedStyle(image).objectFit),
        ),
        ['fill', 'fill', 'fill', 'fill'],
      )
      assertSourceGeometry(await renderedSourceGeometry(page, {
        bankSelector: '.canonical-figure-options--source-measured',
        labelSelector: '.canonical-figure-option-label',
        boxSelector: '.canonical-figure-option-box',
      }), `${versionType} Print`)
      await page.screenshot({
        path: path.join(artifactRoot, `q33-${versionType}-print.png`),
        fullPage: true,
      })
      await page.close()
    }

    const pdfPage = await browser.newPage()
    await pdfPage.setContent(printCases.get('student').html, { waitUntil: 'load' })
    const pdfBytes = await pdfPage.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
    const confirmedSources = printCases.get('student').sources
    const extractedPdfSources = extractPdfImageDataUrls(pdfPath)
    const confirmedPixelIdentities = await decodedRgbaIdentities(
      pdfPage,
      confirmedSources,
    )
    const pdfPixelIdentities = await decodedRgbaIdentities(
      pdfPage,
      extractedPdfSources,
    )
    assert.deepEqual(
      pdfPixelIdentities,
      confirmedPixelIdentities,
      'PDF decoded RGBA pixels retain the four confirmed source images in A-D order',
    )
    pdfImagePixelIdentityEvidence = labels.map((label, index) => ({
      label,
      confirmedArtifactSha256: selectedArtifactDigests[index],
      ...confirmedPixelIdentities[index],
      pdfRgbaSha256: pdfPixelIdentities[index].rgbaSha256,
    }))
    await pdfPage.close()
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await verifyRenderedArtifacts()

const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
assert.match(pdfInfo, /Page size:\s+[\d.]+ x [\d.]+ pts \(A4\)/)
const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
assert.equal(pdfText.includes('Which of the following best illustrates'), true)
assert.equal(pdfText.includes('[Fig.]'), false)
for (const label of labels) assert.equal(pdfText.includes(`${label}.`), true)
const pdfImages = pdfImageDimensions(pdfPath)
assert.deepEqual(
  pdfImages.dimensions,
  surfaceQuestion.options.map((option) => [
    option.figure.pixelWidth,
    option.figure.pixelHeight,
  ]),
)
assert.ok(pdfImagePixelIdentityEvidence)
writeFileSync(path.join(artifactRoot, 'q33-student.pdfinfo.txt'), pdfInfo)
writeFileSync(path.join(artifactRoot, 'q33-student.pdfimages.txt'), pdfImages.listing)
writeFileSync(path.join(artifactRoot, 'q33-student.txt'), pdfText)
execFileSync('pdftoppm', [
  '-png',
  '-r',
  '140',
  pdfPath,
  path.join(artifactRoot, 'q33-student-page'),
])
const rasterFiles = readdirSync(artifactRoot)
  .filter((name) => /^q33-student-page-\d+\.png$/.test(name))
  .sort()
assert.ok(rasterFiles.length > 0)
writeFileSync(
  path.join(artifactRoot, 'evidence.json'),
  `${JSON.stringify({
    canaryDigest: canary.canaryManifest.canaryDigest,
    confirmationDigest: canary.confirmedSelection.confirmationDigest,
    selectedArtifactDigests,
    placementPolicy: canary.policy.rendererOwnership,
    screenPlacementSignature: surfaceQuestion.figurePlacement.signature,
    pdfPath: path.relative(repoRoot, pdfPath),
    rasterFiles,
    pdfImageDimensions: pdfImages.dimensions,
    pdfImagePixelIdentities: pdfImagePixelIdentityEvidence,
  }, null, 2)}\n`,
)

console.log(JSON.stringify({
  status: 'PASS',
  canaryDigest: canary.canaryManifest.canaryDigest,
  selectedMethods: canary.confirmedSelection.confirmedSelections.map(
    (selection) => selection.method,
  ),
  artifactRoot,
  pdfPath,
  rasterFiles,
}, null, 2))
