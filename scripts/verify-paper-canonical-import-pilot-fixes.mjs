#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import {
  buildNck1CanonicalImportRequest,
} from '../server/paper-canonical/nck1SourceAdapter.mjs'
import {
  compileCanonicalPaper,
} from '../shared/paper-canonical/compiler.mjs'
import {
  makeReviewedReadingSourceCapture,
} from '../test-fixtures/paper-canonical/readingReferenceFixture.mjs'
import {
  projectAssetBlocksToCanonicalConsumption,
} from '../app/src/features/paper-browse/paperBrowseCanonicalAssetProjection.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '..')
const packageDir = path.join(
  repositoryRoot,
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot',
)
const paperId = 'paper-2026-i'

function bytes(fileName) {
  return readFileSync(path.join(packageDir, fileName))
}

function buildPilotRequest(overrides = {}) {
  const paperAssetBytes =
    overrides.paperAssetBytes || bytes('paper-asset.json')
  const paperAsset = JSON.parse(paperAssetBytes)
  return buildNck1CanonicalImportRequest({
    paperId,
    paperAssetBytes,
    answerKeyBytes: bytes('answer-key.json'),
    sourcePdfBytes: bytes('paper.pdf'),
    answersPdfBytes: bytes('canonical-evidence/06-source_answers_pdf.pdf'),
    instructionEvidenceBytes: bytes(
      'canonical-evidence/03-continuation_writing_instruction_evidence.json',
    ),
    listeningQuestionsBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/listening/questions.json',
    )),
    listeningAnswersBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/listening/answers.json',
    )),
    listeningTranscriptBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/listening/transcript.json',
    )),
    listeningInventoryBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/listening-source-inventory-paper-2026-i.json',
    )),
    sourceProvenanceBytes: bytes('import-meta.json'),
    readingSourceCaptureBytes: new TextEncoder().encode(JSON.stringify(
      makeReviewedReadingSourceCapture(paperAsset),
    )),
    tableVisualProofBytes: readFileSync(path.join(
      repositoryRoot,
      'app/public/paper-assets/paper-2026-i/latest/figures/reading-a-table-1.png',
    )),
    applicationWritingCaptureBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/application-writing-paper-2026-i-corrected.json',
    )),
    applicationWritingTranscriptionBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/application-writing-transcription-paper-2026-i-corrected.json',
    )),
    continuationWritingCaptureBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/continuation-writing-paper-2026-i.json',
    )),
    continuationWritingTranscriptionBytes: readFileSync(path.join(
      repositoryRoot,
      'test-fixtures/paper-canonical/evidence/continuation-writing-transcription-paper-2026-i.json',
    )),
    ...overrides,
  })
}

function withoutOfficialAnswer(questionId) {
  const paperAsset = JSON.parse(bytes('paper-asset.json'))
  const answerKey = JSON.parse(bytes('answer-key.json'))
  delete paperAsset.answerKey.answers[questionId]
  delete answerKey.answers[questionId]
  return buildPilotRequest({
    paperAssetBytes: Buffer.from(JSON.stringify(paperAsset)),
    answerKeyBytes: Buffer.from(JSON.stringify(answerKey)),
  })
}

const missingAnswer = compileCanonicalPaper(
  withoutOfficialAnswer('q-2026-i-021'),
)
assert.equal(
  missingAnswer.disposition,
  'incomplete_source',
  'the compiler seam blocks a missing official answer instead of defaulting to A',
)
assert.equal(
  missingAnswer.artifacts.normalizationReport.diagnostics.some(
    (item) =>
      item.code === 'OFFICIAL_ANSWER_MISSING'
      || item.code === 'READING_QUESTION_EVIDENCE_INCOMPLETE',
  ),
  true,
  'the blocked result names missing official-answer evidence',
)

const listeningMediaTypes = [
  'application/vnd.eqb.listening-questions+json',
  'application/vnd.eqb.listening-answers+json',
  'application/vnd.eqb.listening-transcript+json',
  'application/vnd.eqb.listening-source-inventory+json',
]
const pilotRequest = buildPilotRequest()
const sourceEnvelopeDocument = pilotRequest.evidence.documents.find(
  (document) =>
    document.declared?.mediaType
      === 'application/vnd.eqb.canonical-fixture+json',
)
assert.ok(sourceEnvelopeDocument, 'pilot carries one registered source envelope')
const sourceEnvelope = JSON.parse(
  new TextDecoder().decode(sourceEnvelopeDocument.bytes),
)
for (const key of [
  'observations',
  'assertions',
  'groups',
  'transformations',
  'inactiveSourceClosures',
]) {
  assert.deepEqual(
    sourceEnvelope[key],
    [],
    `the source envelope does not preconstruct ${key}`,
  )
}
assert.deepEqual(
  sourceEnvelope.inactiveSlots,
  {},
  'the source envelope does not preclose inactive Listening',
)

const readingCaptureDocument = pilotRequest.evidence.documents.find(
  (document) => {
    if (document.declared?.mediaType !== 'application/json') return false
    try {
      return JSON.parse(new TextDecoder().decode(document.bytes))
        .schemaVersion === 'reading-source-capture-v1'
    } catch {
      return false
    }
  },
)
assert.ok(
  readingCaptureDocument,
  'the pilot carries reviewed structured Reading source evidence',
)
const withoutReadingCapture = structuredClone(pilotRequest)
withoutReadingCapture.evidence.documents =
  withoutReadingCapture.evidence.documents.filter(
    (document) => document.inputKey !== readingCaptureDocument.inputKey,
  )
assert.equal(
  compileCanonicalPaper(withoutReadingCapture).disposition,
  'incomplete_source',
  'flattened paper-asset marker text cannot replace structured Reading evidence',
)
const readyPilot = compileCanonicalPaper(pilotRequest)
assert.equal(readyPilot.disposition, 'ready')
assert.deepEqual(
  readyPilot.artifacts.canonicalPaper.questionGroups.map(
    (group) => group.identity.groupId,
  ),
  readyPilot.artifacts.canonicalPaper.paperPlan.slotBindings
    .filter((binding) => binding.state === 'bound')
    .map((binding) => binding.groupRef.groupId),
  'compiler output follows the closed Profile slot order, not adapter append order',
)
const readingA = readyPilot.artifacts.canonicalPaper.questionGroups.find(
  (group) => group.identity.groupId === 'group-2026-i-reading-a',
)
assert.ok(readingA, 'compiler derives Reading A behind the public seam')
assert.equal(
  JSON.stringify(readingA.content).includes('[表:'),
  false,
  'flattened table markers never enter ready canonical content',
)
const tableTargets = readingA.sourceMap.entries.filter(
  (entry) =>
    entry.target.kind === 'content_node'
    && (
      entry.target.id === 'table:reading-a:events'
      || entry.target.id.startsWith('row:reading-a:events:')
      || entry.target.id.startsWith('cell:reading-a:events:')
      || entry.target.id.startsWith('text:reading-a:events:')
    ),
)
assert.equal(tableTargets.length > 0, true, 'native table identities are mapped')
const spansById = new Map(
  readyPilot.artifacts.sourceCapture.sourceSpans.map(
    (span) => [span.sourceSpanId, span],
  ),
)
const recordsById = new Map(
  readyPilot.artifacts.normalizationReport.transformationRecords.map(
    (record) => [record.recordId, record],
  ),
)
for (const entry of tableTargets) {
  assert.equal(entry.sourceSpanRefs.length, 1)
  assert.equal(entry.transformationRecordIds.length, 1)
  const span = spansById.get(entry.sourceSpanRefs[0])
  assert.equal(span?.coordinate?.kind, 'page_region')
  assert.equal(span?.coordinate?.page, 4)
  assert.equal(
    span?.documentDigest,
    'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
    `${entry.target.id} binds the immutable question PDF`,
  )
  assert.ok(
    recordsById.has(entry.transformationRecordIds[0]),
    `${entry.target.id} binds an accepted Transformation Record`,
  )
}

const browseAsset = JSON.parse(bytes('paper-asset.json'))
const browseGroupIds = browseAsset.content.blocks.flatMap((block) =>
  block.type === 'group'
  && browseAsset.content.groups[block.groupId]?.groupType !== 'listening'
    ? [block.groupId]
    : [])
const browseConsumption = {
  disposition: 'ready',
  paperId,
  selections: [{
    mode: 'canonical',
    familyContractId: 'reading',
    groupIds: browseGroupIds,
  }],
}
assert.doesNotThrow(() =>
  projectAssetBlocksToCanonicalConsumption(
    browseAsset,
    browseConsumption,
  ))
const planExternalAsset = structuredClone(browseAsset)
planExternalAsset.content.groups['group-plan-external'] = {
  groupId: 'group-plan-external',
  groupType: 'reading',
  questionIds: [],
  passage: { paragraphs: [] },
}
planExternalAsset.content.blocks.push({
  type: 'group',
  groupId: 'group-plan-external',
})
assert.throws(
  () =>
    projectAssetBlocksToCanonicalConsumption(
      planExternalAsset,
      browseConsumption,
    ),
  /outside the Consumption Plan/,
  'PaperBrowse rejects a non-Listening Group outside the whole-paper plan',
)

function mutateJsonDocument(request, mediaType, mutate) {
  const candidate = structuredClone(request)
  const document = candidate.evidence.documents.find(
    (item) => item.declared?.mediaType === mediaType,
  )
  assert.ok(document, `fixture carries ${mediaType}`)
  const value = JSON.parse(new TextDecoder().decode(document.bytes))
  mutate(value)
  document.bytes = new TextEncoder().encode(JSON.stringify(value))
  return candidate
}

for (const mediaType of listeningMediaTypes) {
  assert.equal(
    pilotRequest.evidence.documents.some(
      (document) => document.declared?.mediaType === mediaType,
    ),
    true,
    `the source package carries real ${mediaType} evidence`,
  )
  const missingDocument = structuredClone(pilotRequest)
  missingDocument.evidence.documents =
    missingDocument.evidence.documents.filter(
      (document) => document.declared?.mediaType !== mediaType,
    )
  assert.equal(
    compileCanonicalPaper(missingDocument).disposition,
    'incomplete_source',
    `missing ${mediaType} evidence fails closed at the compiler seam`,
  )
}

const incompleteListeningCases = [
  {
    label: 'Question 1',
    mediaType: listeningMediaTypes[0],
    mutate: (value) => value.section1.questions.shift(),
  },
  {
    label: 'Question 1 option C',
    mediaType: listeningMediaTypes[0],
    mutate: (value) => delete value.section1.questions[0].options.C,
  },
  {
    label: 'Question 1 official answer',
    mediaType: listeningMediaTypes[1],
    mutate: (value) => delete value.answers['1'],
  },
  {
    label: 'Text 10 transcript segment',
    mediaType: listeningMediaTypes[2],
    mutate: (value) => value.texts.pop(),
  },
  {
    label: 'supplied timing table',
    mediaType: listeningMediaTypes[2],
    mutate: (value) => delete value.timingTable,
  },
  {
    label: 'closed audio inventory',
    mediaType: listeningMediaTypes[3],
    mutate: (value) => delete value.audio,
  },
]
for (const testCase of incompleteListeningCases) {
  const result = compileCanonicalPaper(
    mutateJsonDocument(
      pilotRequest,
      testCase.mediaType,
      testCase.mutate,
    ),
  )
  assert.equal(
    result.disposition,
    'incomplete_source',
    `missing ${testCase.label} evidence fails closed`,
  )
  assert.equal(
    result.artifacts.canonicalPaper == null,
    true,
    `missing ${testCase.label} evidence exposes no canonical paper`,
  )
}

console.log('PASS canonical import pilot focused review fixes')
