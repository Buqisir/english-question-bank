import assert from 'node:assert/strict'

import { digestJson, sha256, withoutKey } from '../shared/paper-canonical/stable.mjs'
import * as visualCandidateModule from '../server/paper-canonical/visualCandidate.mjs'
import {
  makeVisualCandidateFixture,
  visualCandidateFixtureOracle,
} from '../test-fixtures/paper-import/source-faithful-visual-candidate-v1/fixture.mjs'

const {
  confirmVisualImportCandidate,
  createVisualImportCandidate,
  rebindExactVisualTeacherConfirmation,
} = visualCandidateModule

assert.deepEqual(
  Object.keys(visualCandidateModule).sort(),
  [
    'confirmVisualImportCandidate',
    'createVisualImportCandidate',
    'rebindExactVisualTeacherConfirmation',
  ],
  'the backend-only visual candidate seam exposes creation, exact confirmation, and migration-only exact rebind',
)

function assertCode(operation, code, message) {
  assert.throws(
    operation,
    (error) => error?.code === code,
    message,
  )
}

function rebindPackage(candidate) {
  const rebound = structuredClone(candidate)
  rebound.packageDigest = digestJson(withoutKey(rebound, 'packageDigest'))
  return rebound
}

function rebindCandidateRecord(candidate, index) {
  const rebound = structuredClone(candidate)
  rebound.candidates[index].candidateDigest = digestJson(
    withoutKey(rebound.candidates[index], 'candidateDigest'),
  )
  return rebindPackage(rebound)
}

function pngChunks(bytes) {
  const chunks = []
  let offset = 8
  while (offset + 12 <= bytes.byteLength) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.subarray(offset + 4, offset + 8).toString('ascii')
    const next = offset + length + 12
    chunks.push({ type, bytes: bytes.subarray(offset, next) })
    offset = next
  }
  return chunks
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBytes = Buffer.from(type, 'ascii')
  const chunk = Buffer.alloc(data.byteLength + 12)
  chunk.writeUInt32BE(data.byteLength, 0)
  typeBytes.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), data.byteLength + 8)
  return chunk
}

function pngFromChunks(signature, chunks) {
  return Buffer.concat([signature, ...chunks.map((chunk) => chunk.bytes ?? chunk)])
}

function artifactFromPngBytes(bytes, originalArtifact) {
  return {
    ...structuredClone(originalArtifact),
    encodedBytes: bytes.toString('base64'),
    byteLength: bytes.byteLength,
    sha256: sha256(new Uint8Array(bytes)),
  }
}

function assertRejectedPng(bytes, message) {
  const invalid = makeVisualCandidateFixture()
  invalid.request.candidates[1].artifact = artifactFromPngBytes(
    bytes,
    invalid.request.candidates[1].artifact,
  )
  assertCode(
    () => createVisualImportCandidate(invalid.request),
    'VISUAL_CANDIDATE_PNG_BYTES_INVALID',
    message,
  )
}

function confirmationFor(candidate, selections) {
  return {
    schemaVersion: 'visual-teacher-confirmation-v1',
    packageDigest: candidate.packageDigest,
    decisions: selections.map(({ observationId, owner, candidateDigest }) => ({
      observationId,
      owner: structuredClone(owner),
      disposition: 'confirmed',
      selectedCandidateDigest: candidateDigest,
    })),
  }
}

function refreshSourceCapture(sourceCapture) {
  const body = withoutKey(withoutKey(sourceCapture, 'captureId'), 'digest')
  const digest = digestJson(body)
  return {
    ...body,
    captureId: `source-capture:${digest.slice('sha256:'.length, 28)}`,
    digest,
  }
}

function successorRequestWithJobOnlyEvidence(request) {
  const successor = structuredClone(request)
  const capture = successor.sourceCapture
  const questionDocument = capture.documents[0]
  const predecessorDocumentId = questionDocument.documentId
  questionDocument.inputKey = 'successor_question_source'
  questionDocument.originalName = 'successor-question.pdf'
  questionDocument.documentId = `document:${digestJson({
    digest: questionDocument.sha256,
    roles: questionDocument.roles,
    inputKey: questionDocument.inputKey,
  }).slice('sha256:'.length, 28)}`
  for (const observation of capture.observations) {
    if (observation.documentId === predecessorDocumentId) {
      observation.documentId = questionDocument.documentId
    }
  }
  for (const span of capture.sourceSpans) {
    if (span.documentId === predecessorDocumentId) {
      span.documentId = questionDocument.documentId
    }
  }

  const answerBytes = new TextEncoder().encode('%PDF-1.7\n% nonvisual Job answer evidence\n')
  const answerDigest = sha256(answerBytes)
  const answerInputKey = 'successor_answer_source'
  const answerRoles = ['official_answer_source', 'source_provenance']
  const answerArtifactId = `source-document:${digestJson({
    sha256: answerDigest,
  }).slice('sha256:'.length, 28)}`
  capture.documents.push({
    documentId: `document:${digestJson({
      digest: answerDigest,
      roles: answerRoles,
      inputKey: answerInputKey,
    }).slice('sha256:'.length, 28)}`,
    inputKey: answerInputKey,
    roles: answerRoles,
    mediaType: 'application/pdf',
    originalName: 'successor-answers.pdf',
    byteLength: answerBytes.byteLength,
    sha256: answerDigest,
    immutableArtifactRef: {
      artifactId: answerArtifactId,
      relativePath: `source-evidence/${answerArtifactId.slice('source-document:'.length)}.bin`,
      sha256: answerDigest,
      byteLength: answerBytes.byteLength,
    },
    encodedBytes: Buffer.from(answerBytes).toString('base64'),
  })
  const layoutObservationId = 'observation:format2-source-layout:reading-d-1'
  const layoutSourceSpanId = `source-span:${layoutObservationId}`
  capture.observations.push({
    observationId: layoutObservationId,
    documentId: questionDocument.documentId,
    kind: 'reading_option_figure_source_layout',
    value: { intentDigest: `sha256:${'1'.repeat(64)}` },
    order: capture.observations.length,
    extraction: { adapterId: 'format2-source-layout-evidence', version: '1' },
    sourceSpanId: layoutSourceSpanId,
  })
  capture.sourceSpans.push({
    sourceSpanId: layoutSourceSpanId,
    documentId: questionDocument.documentId,
    documentDigest: questionDocument.sha256,
    coordinate: {
      kind: 'page_region',
      page: 2,
      region: { x: 0.1, y: 0.2, width: 0.8, height: 0.2 },
    },
  })
  successor.sourceCapture = refreshSourceCapture(capture)
  return successor
}

const fixture = makeVisualCandidateFixture()
const candidate = createVisualImportCandidate(fixture.request)

const validPng = Buffer.from(fixture.sourceArtifacts.vector.encodedBytes, 'base64')
const signature = validPng.subarray(0, 8)
const validChunks = pngChunks(validPng)
const ihdr = validChunks.find((chunk) => chunk.type === 'IHDR')
const idat = validChunks.find((chunk) => chunk.type === 'IDAT')
const iend = validChunks.find((chunk) => chunk.type === 'IEND')

assertRejectedPng(
  pngFromChunks(signature, [ihdr, iend]),
  'PNG framing without any IDAT payload must fail closed',
)

const badCrc = Buffer.from(validPng)
badCrc[29] ^= 0x01
assertRejectedPng(
  badCrc,
  'every PNG chunk CRC must be verified against the exact retained bytes',
)

assertRejectedPng(
  validPng.subarray(0, validPng.byteLength - 3),
  'truncated PNG chunk framing must fail closed',
)

assertRejectedPng(
  Buffer.concat([validPng, Buffer.from([0])]),
  'bytes trailing PNG IEND must fail closed',
)

assertRejectedPng(
  pngFromChunks(signature, [idat, ihdr, iend]),
  'IHDR must be the single first PNG chunk',
)

assertRejectedPng(
  pngFromChunks(signature, [ihdr, idat, pngChunk('tEXt'), idat, iend]),
  'IDAT chunks must remain consecutive',
)

assertRejectedPng(
  pngFromChunks(signature, [ihdr, ihdr, idat, iend]),
  'duplicate IHDR chunks must fail closed',
)

assertRejectedPng(
  pngFromChunks(signature, [ihdr, pngChunk('ABCD'), idat, iend]),
  'unknown critical PNG chunks must fail closed',
)

assert.equal(candidate.schemaVersion, 'visual-import-candidate-v1')
assert.equal(candidate.status, 'awaiting_teacher_confirmation')
assert.equal(candidate.unresolvedIssues.length, 2)
assert.ok(candidate.unresolvedIssues.every((issue) => issue.code === 'VISUAL_CONFIRMATION_REQUIRED'))
assert.equal(Object.hasOwn(candidate, 'canonicalPaper'), false)
assert.equal(Object.hasOwn(candidate, 'media'), false)
assert.equal(candidate.packageDigest, digestJson(withoutKey(candidate, 'packageDigest')))
assert.deepEqual(candidate.sourceCaptureRef, {
  captureId: candidate.sourceCapture.captureId,
  digest: candidate.sourceCapture.digest,
})
assert.deepEqual(
  new Set(candidate.candidates.map((entry) => entry.method)),
  new Set(['source_crop', 'vector_authored', 'reference_restored']),
  'the frozen fixture must exercise all supported reconstruction methods',
)
assert.ok(candidate.candidates.every((entry) => (
  entry.candidateDigest === digestJson(withoutKey(entry, 'candidateDigest'))
  && entry.artifact.sha256 === sha256(new Uint8Array(Buffer.from(entry.artifact.encodedBytes, 'base64')))
)))
assert.equal(candidate.observations[0].source.coordinate.kind, 'page_region')
assert.equal(candidate.observations[0].source.coordinate.page, 2)

const optionVector = candidate.candidates.find((entry) => (
  entry.observationId === visualCandidateFixtureOracle.optionObservationId
  && entry.method === 'vector_authored'
))
const optionSourceCrop = candidate.candidates.find((entry) => (
  entry.observationId === visualCandidateFixtureOracle.optionObservationId
  && entry.method === 'source_crop'
))
const passageSourceCrop = candidate.candidates.find((entry) => (
  entry.observationId === visualCandidateFixtureOracle.passageObservationId
  && entry.method === 'source_crop'
))
const passageRestored = candidate.candidates.find((entry) => (
  entry.observationId === visualCandidateFixtureOracle.passageObservationId
  && entry.method === 'reference_restored'
))

const exactConfirmation = confirmationFor(candidate, [
  {
    observationId: visualCandidateFixtureOracle.optionObservationId,
    owner: visualCandidateFixtureOracle.optionOwner,
    candidateDigest: optionVector.candidateDigest,
  },
  {
    observationId: visualCandidateFixtureOracle.passageObservationId,
    owner: visualCandidateFixtureOracle.passageOwner,
    candidateDigest: passageSourceCrop.candidateDigest,
  },
])
const confirmed = confirmVisualImportCandidate(candidate, exactConfirmation)
assert.equal(confirmed.schemaVersion, 'confirmed-visual-selection-v1')
assert.equal(confirmed.status, 'confirmed')
assert.deepEqual(confirmed.unresolvedIssues, [])
assert.deepEqual(confirmed.confirmedSelections.map((entry) => entry.method), [
  'vector_authored',
  'source_crop',
])
assert.equal(confirmed.confirmedSelections[0].artifact.sha256, fixture.sourceArtifacts.vector.sha256)
assert.equal(confirmed.confirmedSelections[1].artifact.sha256, fixture.sourceArtifacts.sourceCrop.sha256)
assert.equal(confirmed.candidatePackageDigest, candidate.packageDigest)
assert.equal(confirmed.confirmationDigest, digestJson(exactConfirmation))
assert.equal(Object.hasOwn(confirmed, 'canonicalMediaRef'), false)
assert.equal(Object.hasOwn(confirmed, 'transformationRecord'), false)
assert.equal(Object.hasOwn(confirmed, 'correctOptionId'), false)
assert.equal(JSON.stringify(confirmed).includes('reproducibility'), false)
assert.equal(JSON.stringify(confirmed).includes('prompt'), false)

const successor = createVisualImportCandidate(
  successorRequestWithJobOnlyEvidence(fixture.request),
)
assert.notEqual(successor.packageDigest, candidate.packageDigest)
const reboundConfirmation = rebindExactVisualTeacherConfirmation({
  predecessorCandidatePackage: candidate,
  predecessorTeacherConfirmation: exactConfirmation,
  successorCandidatePackage: successor,
})
assert.equal(reboundConfirmation.schemaVersion, 'visual-teacher-confirmation-v1')
assert.equal(reboundConfirmation.packageDigest, successor.packageDigest)
assert.deepEqual(reboundConfirmation.decisions, exactConfirmation.decisions)
assert.equal(
  confirmVisualImportCandidate(successor, reboundConfirmation).status,
  'confirmed',
)

const stalePredecessorConfirmation = structuredClone(exactConfirmation)
stalePredecessorConfirmation.packageDigest = `sha256:${'0'.repeat(64)}`
assertCode(
  () => rebindExactVisualTeacherConfirmation({
    predecessorCandidatePackage: candidate,
    predecessorTeacherConfirmation: stalePredecessorConfirmation,
    successorCandidatePackage: successor,
  }),
  'VISUAL_CONFIRMATION_PACKAGE_MISMATCH',
  'rebind must first validate the complete predecessor Teacher Confirmation',
)

const changedOwnerRequest = structuredClone(fixture.request)
changedOwnerRequest.observations[0].owner.optionId = 'option:reading.d.1.changed'
for (const entry of changedOwnerRequest.candidates.filter(
  (candidateEntry) => candidateEntry.observationId
    === visualCandidateFixtureOracle.optionObservationId,
)) {
  entry.owner.optionId = 'option:reading.d.1.changed'
}
const changedOwnerSuccessor = createVisualImportCandidate(changedOwnerRequest)
assertCode(
  () => rebindExactVisualTeacherConfirmation({
    predecessorCandidatePackage: candidate,
    predecessorTeacherConfirmation: exactConfirmation,
    successorCandidatePackage: changedOwnerSuccessor,
  }),
  'VISUAL_CONFIRMATION_REBIND_MISMATCH',
  'reviewed visual owner mutation must fail exact confirmation rebind',
)

const changedLineageRequest = structuredClone(fixture.request)
changedLineageRequest.sourceCapture.sourceSpans[0].coordinate.page += 1
changedLineageRequest.sourceCapture = refreshSourceCapture(
  changedLineageRequest.sourceCapture,
)
const changedLineageSuccessor = createVisualImportCandidate(
  changedLineageRequest,
)
assertCode(
  () => rebindExactVisualTeacherConfirmation({
    predecessorCandidatePackage: candidate,
    predecessorTeacherConfirmation: exactConfirmation,
    successorCandidatePackage: changedLineageSuccessor,
  }),
  'VISUAL_CONFIRMATION_REBIND_MISMATCH',
  'reviewed source document location mutation must fail exact confirmation rebind',
)

const changedCandidateRequest = structuredClone(fixture.request)
changedCandidateRequest.candidates[1]
  .sourceTruthChecklist[0].sourceTruth += ' changed'
const changedCandidateSuccessor = createVisualImportCandidate(
  changedCandidateRequest,
)
assertCode(
  () => rebindExactVisualTeacherConfirmation({
    predecessorCandidatePackage: candidate,
    predecessorTeacherConfirmation: exactConfirmation,
    successorCandidatePackage: changedCandidateSuccessor,
  }),
  'VISUAL_CONFIRMATION_REBIND_MISMATCH',
  'reviewed candidate alternative mutation must fail exact confirmation rebind',
)

const allSourceCropConfirmation = confirmationFor(candidate, [
  {
    observationId: visualCandidateFixtureOracle.optionObservationId,
    owner: visualCandidateFixtureOracle.optionOwner,
    candidateDigest: optionSourceCrop.candidateDigest,
  },
  {
    observationId: visualCandidateFixtureOracle.passageObservationId,
    owner: visualCandidateFixtureOracle.passageOwner,
    candidateDigest: passageSourceCrop.candidateDigest,
  },
])
const allSourceCrop = confirmVisualImportCandidate(candidate, allSourceCropConfirmation)
assert.equal(allSourceCrop.status, 'confirmed')
assert.ok(allSourceCrop.confirmedSelections.every((entry) => entry.method === 'source_crop'))

const allRejected = confirmVisualImportCandidate(candidate, {
  schemaVersion: 'visual-teacher-confirmation-v1',
  packageDigest: candidate.packageDigest,
  decisions: candidate.observations.map((observation) => ({
    observationId: observation.observationId,
    owner: structuredClone(observation.owner),
    disposition: 'rejected',
  })),
})
assert.equal(allRejected.status, 'unresolved')
assert.deepEqual(allRejected.confirmedSelections, [])
assert.deepEqual(allRejected.unresolvedIssues.map((issue) => issue.code), [
  'VISUAL_SELECTION_REJECTED',
  'VISUAL_SELECTION_REJECTED',
])
assert.equal(Object.hasOwn(allRejected, 'canonicalMediaRef'), false)

const unconfirmed = confirmVisualImportCandidate(candidate, {
  schemaVersion: 'visual-teacher-confirmation-v1',
  packageDigest: candidate.packageDigest,
  decisions: [],
})
assert.equal(unconfirmed.status, 'unresolved')
assert.deepEqual(unconfirmed.confirmedSelections, [])
assert.deepEqual(unconfirmed.unresolvedIssues.map((issue) => issue.code), [
  'VISUAL_SELECTION_UNCONFIRMED',
  'VISUAL_SELECTION_UNCONFIRMED',
])

const missingSourceEvidence = structuredClone(fixture.request)
delete missingSourceEvidence.sourceCapture.documents[0].encodedBytes
assertCode(
  () => createVisualImportCandidate(missingSourceEvidence),
  'VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID',
  'missing immutable Source Capture evidence must fail closed',
)

const changedSourceBytes = structuredClone(candidate)
changedSourceBytes.sourceCapture.documents[0].encodedBytes = Buffer.from('changed source bytes').toString('base64')
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(changedSourceBytes), exactConfirmation),
  'VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID',
  'changed Source Capture bytes must fail fresh confirmation',
)

const swappedCandidateOwner = structuredClone(fixture.request)
swappedCandidateOwner.candidates[1].owner.optionId = 'option:reading.d.1.b'
assertCode(
  () => createVisualImportCandidate(swappedCandidateOwner),
  'VISUAL_CANDIDATE_OWNER_MISMATCH',
  'candidate bytes cannot be attached to a different semantic owner',
)

const changedCandidateBytes = structuredClone(candidate)
changedCandidateBytes.candidates[1].artifact.encodedBytes = fixture.sourceArtifacts.restored.encodedBytes
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(changedCandidateBytes), exactConfirmation),
  'VISUAL_CANDIDATE_PNG_BYTE_LENGTH_MISMATCH',
  'changed retained candidate bytes must fail before selection',
)

const changedDimensions = structuredClone(candidate)
changedDimensions.candidates[1].artifact.pixelWidth = 2
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(changedDimensions), exactConfirmation),
  'VISUAL_CANDIDATE_PNG_DIMENSIONS_MISMATCH',
  'changed declared dimensions must fail against fresh PNG IHDR parsing',
)

const wrongArtifactDigest = structuredClone(candidate)
wrongArtifactDigest.candidates[1].artifact.sha256 = fixture.sourceArtifacts.restored.sha256
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(wrongArtifactDigest), exactConfirmation),
  'VISUAL_CANDIDATE_PNG_DIGEST_MISMATCH',
  'wrong PNG digest must fail against fresh retained-byte hashing',
)

const unsupportedMime = structuredClone(candidate)
unsupportedMime.candidates[1].artifact.mimeType = 'image/svg+xml'
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(unsupportedMime), exactConfirmation),
  'VISUAL_CANDIDATE_PNG_MIME_UNSUPPORTED',
  'unsupported visual candidate MIME must fail closed',
)

const changedCandidateDigest = structuredClone(candidate)
changedCandidateDigest.candidates[1].candidateDigest = passageRestored.candidateDigest
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(changedCandidateDigest), exactConfirmation),
  'VISUAL_CANDIDATE_DIGEST_MISMATCH',
  'candidate digest must bind its complete exact persisted body',
)

const reboundWrongOwner = structuredClone(candidate)
reboundWrongOwner.candidates[1].owner.optionId = 'option:reading.d.1.b'
assertCode(
  () => confirmVisualImportCandidate(rebindCandidateRecord(reboundWrongOwner, 1), exactConfirmation),
  'VISUAL_CANDIDATE_OWNER_MISMATCH',
  'recomputed digests cannot move reviewed bytes to a different Option',
)

const changedObservationLineage = structuredClone(candidate)
changedObservationLineage.observations[0].source.coordinate.page = 9
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(changedObservationLineage), exactConfirmation),
  'VISUAL_CANDIDATE_OBSERVATION_INVALID',
  'persisted visual observations must freshly re-derive source document/page/crop lineage',
)

const changedSourceCrop = structuredClone(candidate)
changedSourceCrop.observations[0].sourceCrop = structuredClone(fixture.sourceArtifacts.vector)
assertCode(
  () => confirmVisualImportCandidate(rebindPackage(changedSourceCrop), exactConfirmation),
  'VISUAL_CANDIDATE_SOURCE_CROP_REQUIRED',
  'the source_crop candidate must remain the exact preserved source evidence',
)

const wrongSelectedDigest = structuredClone(exactConfirmation)
wrongSelectedDigest.decisions[0].selectedCandidateDigest = passageRestored.candidateDigest
assertCode(
  () => confirmVisualImportCandidate(candidate, wrongSelectedDigest),
  'VISUAL_CONFIRMATION_CANDIDATE_MISMATCH',
  'a digest from another observation cannot satisfy exact selection',
)

const swappedConfirmationOwner = structuredClone(exactConfirmation)
swappedConfirmationOwner.decisions[0].owner.optionId = 'option:reading.d.1.b'
assertCode(
  () => confirmVisualImportCandidate(candidate, swappedConfirmationOwner),
  'VISUAL_CONFIRMATION_OWNER_MISMATCH',
  'Teacher Confirmation must repeat the exact reviewed owner',
)

const changedConfirmationObservation = structuredClone(exactConfirmation)
changedConfirmationObservation.decisions[0].observationId = 'observation:visual:unknown'
assertCode(
  () => confirmVisualImportCandidate(candidate, changedConfirmationObservation),
  'VISUAL_CONFIRMATION_OBSERVATION_MISMATCH',
  'Teacher Confirmation must identify one exact reviewed observation',
)

const staleConfirmation = structuredClone(exactConfirmation)
staleConfirmation.packageDigest = `sha256:${'0'.repeat(64)}`
assertCode(
  () => confirmVisualImportCandidate(candidate, staleConfirmation),
  'VISUAL_CONFIRMATION_PACKAGE_MISMATCH',
  'Teacher Confirmation cannot survive a candidate package change',
)

const emptyChecklist = structuredClone(fixture.request)
emptyChecklist.candidates[1].sourceTruthChecklist = []
assertCode(
  () => createVisualImportCandidate(emptyChecklist),
  'VISUAL_CANDIDATE_CHECKLIST_INVALID',
  'visual reconstruction requires a non-empty source-truth checklist',
)

const malformedChecklist = structuredClone(fixture.request)
malformedChecklist.candidates[1].sourceTruthChecklist[0].answer = 'A'
assertCode(
  () => createVisualImportCandidate(malformedChecklist),
  'VISUAL_CANDIDATE_CHECKLIST_INVALID',
  'checklist entries reject answer-bearing extra fields',
)

const notesWithoutBytes = structuredClone(fixture.request)
delete notesWithoutBytes.candidates[1].artifact
assertCode(
  () => createVisualImportCandidate(notesWithoutBytes),
  'VISUAL_CANDIDATE_SHAPE_INVALID',
  'editable vector notes cannot substitute for exact candidate PNG bytes',
)

const noSourceCropFallback = structuredClone(fixture.request)
noSourceCropFallback.candidates = noSourceCropFallback.candidates.filter((entry) => !(
  entry.observationId === visualCandidateFixtureOracle.optionObservationId
  && entry.method === 'source_crop'
))
assertCode(
  () => createVisualImportCandidate(noSourceCropFallback),
  'VISUAL_CANDIDATE_SOURCE_CROP_REQUIRED',
  'every visual observation requires one exact source_crop fallback',
)

const nonPngCandidate = structuredClone(fixture.request)
const nonPngBytes = new TextEncoder().encode('not a PNG')
nonPngCandidate.candidates[1].artifact = {
  mimeType: 'image/png',
  encodedBytes: Buffer.from(nonPngBytes).toString('base64'),
  byteLength: nonPngBytes.byteLength,
  sha256: sha256(nonPngBytes),
  pixelWidth: 1,
  pixelHeight: 1,
}
assertCode(
  () => createVisualImportCandidate(nonPngCandidate),
  'VISUAL_CANDIDATE_PNG_BYTES_INVALID',
  'declared image/png without closed PNG bytes must fail',
)

const requestWithAnswerAuthority = structuredClone(fixture.request)
requestWithAnswerAuthority.correctOptionId = 'option:reading.d.1.a'
assertCode(
  () => createVisualImportCandidate(requestWithAnswerAuthority),
  'VISUAL_CANDIDATE_REQUEST_INVALID',
  'visual candidate creation must reject caller-supplied answer authority',
)

const candidateWithAnswerAuthority = structuredClone(fixture.request)
candidateWithAnswerAuthority.candidates[1].answer = 'A'
assertCode(
  () => createVisualImportCandidate(candidateWithAnswerAuthority),
  'VISUAL_CANDIDATE_SHAPE_INVALID',
  'visual candidate records must reject answer-bearing extra fields',
)

console.log('PASS visual candidate exact-byte Teacher Confirmation contract')
