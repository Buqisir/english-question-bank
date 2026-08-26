import {
  cloneJson,
  digestJson,
  exactKeys,
  isRecordValue,
  sha256,
  stableStringify,
  withoutKey,
} from '../../shared/paper-canonical/stable.mjs'
import { validateSourceCaptureIntegrity } from './publication.mjs'

const candidateSchemaVersion = 'visual-import-candidate-v1'
const confirmationSchemaVersion = 'visual-teacher-confirmation-v1'
const selectionSchemaVersion = 'confirmed-visual-selection-v1'
const candidateMethods = new Set([
  'source_crop',
  'vector_authored',
  'reference_restored',
])
const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10]
const pngCriticalChunks = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND'])
const pngBeforePaletteAndIdatChunks = new Set(['cHRM', 'gAMA', 'iCCP', 'sBIT', 'sRGB'])
const pngBeforeIdatChunks = new Set(['bKGD', 'hIST', 'pHYs', 'tRNS'])
const pngSingletonChunks = new Set([
  ...pngBeforePaletteAndIdatChunks,
  'bKGD',
  'hIST',
  'pHYs',
  'tIME',
  'tRNS',
])
const pngBitDepthsByColorType = new Map([
  [0, new Set([1, 2, 4, 8, 16])],
  [2, new Set([8, 16])],
  [3, new Set([1, 2, 4, 8])],
  [4, new Set([8, 16])],
  [6, new Set([8, 16])],
])
const pngCrcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  }
  return value >>> 0
})
const reproducibilityKeys = new Set([
  'editableVector',
  'prompt',
  'tool',
  'model',
  'exportSettings',
])

function visualCandidateError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function fail(code, message) {
  throw visualCandidateError(code, message)
}

function assertExactObject(value, keys, code, message) {
  if (!exactKeys(value, keys)) fail(code, message)
}

function assertNonEmptyString(value, code, message) {
  if (typeof value !== 'string' || value.trim().length === 0) fail(code, message)
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right)
}

function normalizeOwner(owner, label) {
  if (!isRecordValue(owner)) {
    fail('VISUAL_CANDIDATE_OWNER_INVALID', `${label} must identify one closed Passage or Reading Option owner`)
  }
  if (owner.kind === 'passage') {
    assertExactObject(
      owner,
      ['kind', 'groupId'],
      'VISUAL_CANDIDATE_OWNER_INVALID',
      `${label} Passage owner must contain only kind and groupId`,
    )
    assertNonEmptyString(owner.groupId, 'VISUAL_CANDIDATE_OWNER_INVALID', `${label} Passage owner requires groupId`)
    return cloneJson(owner)
  }
  if (owner.kind === 'reading_option') {
    assertExactObject(
      owner,
      ['kind', 'groupId', 'questionId', 'optionId'],
      'VISUAL_CANDIDATE_OWNER_INVALID',
      `${label} Reading Option owner must contain only kind, groupId, questionId, and optionId`,
    )
    for (const key of ['groupId', 'questionId', 'optionId']) {
      assertNonEmptyString(owner[key], 'VISUAL_CANDIDATE_OWNER_INVALID', `${label} Reading Option owner requires ${key}`)
    }
    return cloneJson(owner)
  }
  fail('VISUAL_CANDIDATE_OWNER_INVALID', `${label} uses an unsupported visual owner kind`)
}

function decodeBase64(encodedBytes, label) {
  if (
    typeof encodedBytes !== 'string'
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encodedBytes)
  ) {
    fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} requires canonical base64 PNG bytes`)
  }
  const bytes = new Uint8Array(Buffer.from(encodedBytes, 'base64'))
  if (Buffer.from(bytes).toString('base64') !== encodedBytes) {
    fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} base64 is not canonical`)
  }
  return bytes
}

function pngCrc32(bytes, start, end) {
  let crc = 0xffffffff
  for (let offset = start; offset < end; offset += 1) {
    crc = pngCrcTable[(crc ^ bytes[offset]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngDimensions(bytes, label) {
  if (
    bytes.byteLength < 45
    || pngSignature.some((byte, index) => bytes[index] !== byte)
  ) {
    fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} is not a closed PNG artifact`)
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  let chunkIndex = 0
  let ihdrSeen = false
  let plteSeen = false
  let paletteEntries = 0
  let idatSeen = false
  let idatEnded = false
  let idatByteLength = 0
  let iendSeen = false
  let dimensions = null
  let bitDepth = null
  let colorType = null
  const ancillaryChunks = new Set()
  while (offset < bytes.byteLength) {
    if (offset + 12 > bytes.byteLength) {
      fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains truncated PNG chunk framing`)
    }
    const length = view.getUint32(offset)
    if (length > 0x7fffffff) {
      fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains an oversized PNG chunk`)
    }
    const typeBytes = bytes.slice(offset + 4, offset + 8)
    if (
      typeBytes.some((byte) => !(
        (byte >= 65 && byte <= 90)
        || (byte >= 97 && byte <= 122)
      ))
      || !(typeBytes[2] >= 65 && typeBytes[2] <= 90)
    ) {
      fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains an invalid PNG chunk type`)
    }
    const type = String.fromCharCode(...typeBytes)
    const dataStart = offset + 8
    const crcOffset = dataStart + length
    const next = crcOffset + 4
    if (crcOffset > bytes.byteLength - 4) {
      fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains a truncated PNG chunk`)
    }
    if (view.getUint32(crcOffset) !== pngCrc32(bytes, offset + 4, crcOffset)) {
      fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains a PNG chunk with an invalid CRC`)
    }
    const critical = typeBytes[0] >= 65 && typeBytes[0] <= 90
    if (critical && !pngCriticalChunks.has(type)) {
      fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains unsupported critical PNG chunk ${type}`)
    }

    if (type === 'IHDR') {
      if (chunkIndex !== 0 || ihdrSeen || length !== 13) {
        fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} must contain one 13-byte IHDR as its first PNG chunk`)
      }
      const pixelWidth = view.getUint32(dataStart)
      const pixelHeight = view.getUint32(dataStart + 4)
      if (pixelWidth < 1 || pixelHeight < 1) {
        fail('VISUAL_CANDIDATE_PNG_DIMENSIONS_INVALID', `${label} has no positive PNG dimensions`)
      }
      bitDepth = bytes[dataStart + 8]
      colorType = bytes[dataStart + 9]
      const compressionMethod = bytes[dataStart + 10]
      const filterMethod = bytes[dataStart + 11]
      const interlaceMethod = bytes[dataStart + 12]
      if (
        pixelWidth > 0x7fffffff
        || pixelHeight > 0x7fffffff
        || !pngBitDepthsByColorType.get(colorType)?.has(bitDepth)
        || compressionMethod !== 0
        || filterMethod !== 0
        || ![0, 1].includes(interlaceMethod)
      ) {
        fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains unsupported PNG IHDR fields`)
      }
      dimensions = { pixelWidth, pixelHeight }
      ihdrSeen = true
    } else {
      if (!ihdrSeen) {
        fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} does not begin with PNG IHDR`)
      }
      if (type === 'PLTE') {
        if (
          plteSeen
          || idatSeen
          || [0, 4].includes(colorType)
          || length === 0
          || length % 3 !== 0
          || length > 768
        ) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains an invalid or misordered PNG PLTE`)
        }
        paletteEntries = length / 3
        if (colorType === 3 && paletteEntries > 2 ** bitDepth) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} PNG PLTE exceeds its indexed bit depth`)
        }
        plteSeen = true
      } else if (type === 'IDAT') {
        if (idatEnded || (colorType === 3 && !plteSeen)) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains non-consecutive or pre-palette PNG IDAT chunks`)
        }
        idatSeen = true
        idatByteLength += length
      } else if (type === 'IEND') {
        if (iendSeen || length !== 0 || !idatSeen || idatByteLength === 0) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} PNG IEND does not close one non-empty IDAT sequence`)
        }
        iendSeen = true
      } else {
        if (idatSeen) idatEnded = true
        if (
          (pngBeforePaletteAndIdatChunks.has(type) && (plteSeen || idatSeen))
          || (pngBeforeIdatChunks.has(type) && idatSeen)
        ) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains misordered PNG ancillary chunk ${type}`)
        }
        if (pngSingletonChunks.has(type)) {
          if (ancillaryChunks.has(type)) {
            fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} repeats singleton PNG chunk ${type}`)
          }
          ancillaryChunks.add(type)
        }
        if ((type === 'iCCP' && ancillaryChunks.has('sRGB')) || (type === 'sRGB' && ancillaryChunks.has('iCCP'))) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} combines mutually exclusive PNG color-space chunks`)
        }
        if (type === 'hIST' && (!plteSeen || length !== paletteEntries * 2)) {
          fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} PNG hIST does not match one preceding palette`)
        }
        if (type === 'tRNS') {
          const validTransparency = (
            (colorType === 0 && length === 2)
            || (colorType === 2 && length === 6)
            || (colorType === 3 && plteSeen && length > 0 && length <= paletteEntries)
          )
          if (!validTransparency) {
            fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} PNG tRNS is invalid for its color type`)
          }
        }
      }
    }

    offset = next
    chunkIndex += 1
    if (iendSeen) {
      if (offset !== bytes.byteLength) {
        fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} contains bytes after PNG IEND`)
      }
      break
    }
  }
  if (!dimensions || !ihdrSeen || !idatSeen || idatByteLength === 0 || !iendSeen) {
    fail('VISUAL_CANDIDATE_PNG_BYTES_INVALID', `${label} is not a complete PNG artifact`)
  }
  return dimensions
}

function normalizePngArtifact(artifact, label) {
  assertExactObject(
    artifact,
    ['mimeType', 'encodedBytes', 'byteLength', 'sha256', 'pixelWidth', 'pixelHeight'],
    'VISUAL_CANDIDATE_PNG_ARTIFACT_INVALID',
    `${label} must bind exact PNG bytes, digest, byte length, and dimensions`,
  )
  if (artifact.mimeType !== 'image/png') {
    fail('VISUAL_CANDIDATE_PNG_MIME_UNSUPPORTED', `${label} must use image/png`)
  }
  const bytes = decodeBase64(artifact.encodedBytes, label)
  if (!Number.isInteger(artifact.byteLength) || artifact.byteLength !== bytes.byteLength) {
    fail('VISUAL_CANDIDATE_PNG_BYTE_LENGTH_MISMATCH', `${label} byte length differs from its retained PNG bytes`)
  }
  if (artifact.sha256 !== sha256(bytes)) {
    fail('VISUAL_CANDIDATE_PNG_DIGEST_MISMATCH', `${label} digest differs from its retained PNG bytes`)
  }
  const dimensions = pngDimensions(bytes, label)
  if (
    !Number.isInteger(artifact.pixelWidth)
    || !Number.isInteger(artifact.pixelHeight)
    || artifact.pixelWidth !== dimensions.pixelWidth
    || artifact.pixelHeight !== dimensions.pixelHeight
  ) {
    fail('VISUAL_CANDIDATE_PNG_DIMENSIONS_MISMATCH', `${label} dimensions differ from its retained PNG IHDR`)
  }
  return cloneJson(artifact)
}

function normalizeChecklist(checklist, label) {
  if (!Array.isArray(checklist) || checklist.length === 0) {
    fail('VISUAL_CANDIDATE_CHECKLIST_INVALID', `${label} requires a non-empty source-truth checklist`)
  }
  const relationships = new Set()
  return checklist.map((entry, index) => {
    assertExactObject(
      entry,
      ['relationship', 'sourceTruth'],
      'VISUAL_CANDIDATE_CHECKLIST_INVALID',
      `${label} checklist entry ${index} must bind one relationship to its source truth`,
    )
    assertNonEmptyString(entry.relationship, 'VISUAL_CANDIDATE_CHECKLIST_INVALID', `${label} checklist entry ${index} requires relationship`)
    assertNonEmptyString(entry.sourceTruth, 'VISUAL_CANDIDATE_CHECKLIST_INVALID', `${label} checklist entry ${index} requires sourceTruth`)
    if (relationships.has(entry.relationship)) {
      fail('VISUAL_CANDIDATE_CHECKLIST_INVALID', `${label} checklist repeats relationship ${entry.relationship}`)
    }
    relationships.add(entry.relationship)
    return cloneJson(entry)
  })
}

function normalizeReproducibility(value, label) {
  if (!isRecordValue(value) || Object.keys(value).length === 0) {
    fail('VISUAL_CANDIDATE_REPRODUCIBILITY_INVALID', `${label} reproducibility evidence must be a non-empty closed note`)
  }
  for (const [key, note] of Object.entries(value)) {
    if (!reproducibilityKeys.has(key) || typeof note !== 'string' || note.trim().length === 0) {
      fail('VISUAL_CANDIDATE_REPRODUCIBILITY_INVALID', `${label} has unsupported or empty reproducibility evidence`)
    }
  }
  return cloneJson(value)
}

function normalizeCandidateBody(candidate, index) {
  const label = `Visual candidate ${index}`
  const hasReproducibility = isRecordValue(candidate) && Object.hasOwn(candidate, 'reproducibility')
  assertExactObject(
    candidate,
    [
      'observationId',
      'owner',
      'method',
      'artifact',
      'sourceTruthChecklist',
      ...(hasReproducibility ? ['reproducibility'] : []),
    ],
    'VISUAL_CANDIDATE_SHAPE_INVALID',
    `${label} contains unsupported or missing fields`,
  )
  assertNonEmptyString(candidate.observationId, 'VISUAL_CANDIDATE_OBSERVATION_INVALID', `${label} requires observationId`)
  if (!candidateMethods.has(candidate.method)) {
    fail('VISUAL_CANDIDATE_METHOD_UNSUPPORTED', `${label} uses unsupported method ${String(candidate.method)}`)
  }
  const normalized = {
    observationId: candidate.observationId,
    owner: normalizeOwner(candidate.owner, label),
    method: candidate.method,
    artifact: normalizePngArtifact(candidate.artifact, label),
    sourceTruthChecklist: normalizeChecklist(candidate.sourceTruthChecklist, label),
  }
  if (hasReproducibility) {
    normalized.reproducibility = normalizeReproducibility(candidate.reproducibility, label)
  }
  return normalized
}

function validateVisualSourceCapture(sourceCapture) {
  assertExactObject(
    sourceCapture,
    ['schemaVersion', 'captureId', 'digest', 'documents', 'observations', 'sourceSpans', 'assertions'],
    'VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID',
    'Visual candidate requires one closed source-capture-v1 artifact',
  )
  if (sourceCapture.schemaVersion !== 'source-capture-v1') {
    fail('VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID', 'Visual candidate requires source-capture-v1')
  }
  try {
    return validateSourceCaptureIntegrity(sourceCapture)
  } catch (error) {
    throw visualCandidateError(
      'VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID',
      `Visual candidate Source Capture is not closed: ${error.message}`,
    )
  }
}

function sourceLineageForObservation(sourceCapture, observationId, integrity) {
  const matchingObservations = sourceCapture.observations.filter(
    (observation) => observation?.observationId === observationId,
  )
  if (matchingObservations.length !== 1) {
    fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', `Visual observation ${observationId} must resolve exactly once in Source Capture`)
  }
  const captureObservation = matchingObservations[0]
  const span = integrity.spans.get(captureObservation.sourceSpanId)
  const document = integrity.documents.get(captureObservation.documentId)
  if (!span || !document || span.documentId !== document.documentId) {
    fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', `Visual observation ${observationId} lacks immutable source lineage`)
  }
  return {
    documentId: document.documentId,
    documentInputKey: document.inputKey,
    originalName: document.originalName ?? null,
    documentDigest: document.sha256,
    sourceSpanId: span.sourceSpanId,
    coordinate: cloneJson(span.coordinate),
  }
}

function unresolvedConfirmationIssues(observations) {
  return observations.map((observation) => ({
    code: 'VISUAL_CONFIRMATION_REQUIRED',
    observationId: observation.observationId,
    owner: cloneJson(observation.owner),
  }))
}

function validateCandidateAssociations(observations, candidates) {
  const observationsById = new Map(observations.map((observation) => [observation.observationId, observation]))
  const candidateDigests = new Set()
  for (const candidate of candidates) {
    const observation = observationsById.get(candidate.observationId)
    if (!observation || !sameValue(candidate.owner, observation.owner)) {
      fail('VISUAL_CANDIDATE_OWNER_MISMATCH', `Visual candidate does not bind its exact observation owner`)
    }
    if (candidateDigests.has(candidate.candidateDigest)) {
      fail('VISUAL_CANDIDATE_DIGEST_DUPLICATE', 'Visual candidate digests must identify exactly one reviewed alternative')
    }
    candidateDigests.add(candidate.candidateDigest)
  }
  for (const observation of observations) {
    const matching = candidates.filter((candidate) => candidate.observationId === observation.observationId)
    const sourceCrops = matching.filter((candidate) => candidate.method === 'source_crop')
    if (sourceCrops.length !== 1 || !sameValue(sourceCrops[0].artifact, observation.sourceCrop)) {
      fail('VISUAL_CANDIDATE_SOURCE_CROP_REQUIRED', `Visual observation ${observation.observationId} requires one exact source_crop fallback`)
    }
  }
}

function normalizePersistedCandidate(candidate) {
  assertExactObject(
    candidate,
    [
      'schemaVersion',
      'sourceCaptureRef',
      'sourceCapture',
      'observations',
      'candidates',
      'status',
      'unresolvedIssues',
      'packageDigest',
    ],
    'VISUAL_CANDIDATE_PACKAGE_INVALID',
    'Visual candidate package contains unsupported or missing fields',
  )
  if (candidate.schemaVersion !== candidateSchemaVersion || candidate.status !== 'awaiting_teacher_confirmation') {
    fail('VISUAL_CANDIDATE_PACKAGE_INVALID', 'Visual candidate package is not awaiting exact Teacher Confirmation')
  }
  const integrity = validateVisualSourceCapture(candidate.sourceCapture)
  assertExactObject(
    candidate.sourceCaptureRef,
    ['captureId', 'digest'],
    'VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID',
    'Visual candidate Source Capture reference is not closed',
  )
  const expectedSourceCaptureRef = {
    captureId: candidate.sourceCapture.captureId,
    digest: candidate.sourceCapture.digest,
  }
  if (!sameValue(candidate.sourceCaptureRef, expectedSourceCaptureRef)) {
    fail('VISUAL_CANDIDATE_SOURCE_CAPTURE_INVALID', 'Visual candidate Source Capture reference differs from retained evidence')
  }
  if (!Array.isArray(candidate.observations) || candidate.observations.length === 0) {
    fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', 'Visual candidate package requires at least one source observation')
  }
  const observationIds = new Set()
  const observations = candidate.observations.map((observation, index) => {
    assertExactObject(
      observation,
      ['observationId', 'source', 'owner', 'sourceCrop'],
      'VISUAL_CANDIDATE_OBSERVATION_INVALID',
      `Persisted visual observation ${index} contains unsupported or missing fields`,
    )
    assertNonEmptyString(observation.observationId, 'VISUAL_CANDIDATE_OBSERVATION_INVALID', `Persisted visual observation ${index} requires observationId`)
    if (observationIds.has(observation.observationId)) {
      fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', `Visual observation ${observation.observationId} is duplicated`)
    }
    observationIds.add(observation.observationId)
    const normalized = {
      observationId: observation.observationId,
      source: sourceLineageForObservation(candidate.sourceCapture, observation.observationId, integrity),
      owner: normalizeOwner(observation.owner, `Visual observation ${observation.observationId}`),
      sourceCrop: normalizePngArtifact(observation.sourceCrop, `Visual observation ${observation.observationId} source crop`),
    }
    if (!sameValue(observation.source, normalized.source)) {
      fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', `Visual observation ${observation.observationId} source lineage has changed`)
    }
    return normalized
  })
  if (!Array.isArray(candidate.candidates) || candidate.candidates.length === 0) {
    fail('VISUAL_CANDIDATE_PACKAGE_INVALID', 'Visual candidate package requires at least one exact candidate')
  }
  const candidates = candidate.candidates.map((persisted, index) => {
    if (!isRecordValue(persisted) || !Object.hasOwn(persisted, 'candidateDigest')) {
      fail('VISUAL_CANDIDATE_SHAPE_INVALID', `Persisted visual candidate ${index} lacks candidateDigest`)
    }
    const body = normalizeCandidateBody(withoutKey(persisted, 'candidateDigest'), index)
    const candidateDigest = digestJson(body)
    if (persisted.candidateDigest !== candidateDigest) {
      fail('VISUAL_CANDIDATE_DIGEST_MISMATCH', `Persisted visual candidate ${index} digest differs from its exact body`)
    }
    return { ...body, candidateDigest }
  })
  validateCandidateAssociations(observations, candidates)
  const expectedIssues = unresolvedConfirmationIssues(observations)
  if (!sameValue(candidate.unresolvedIssues, expectedIssues)) {
    fail('VISUAL_CANDIDATE_PACKAGE_INVALID', 'Visual candidate package does not retain its unresolved Teacher Confirmation stop')
  }
  const body = withoutKey(candidate, 'packageDigest')
  if (candidate.packageDigest !== digestJson(body)) {
    fail('VISUAL_CANDIDATE_PACKAGE_DIGEST_MISMATCH', 'Visual candidate package digest differs from its retained exact evidence')
  }
  return {
    ...cloneJson(body),
    observations,
    candidates,
    packageDigest: candidate.packageDigest,
  }
}

function reviewedVisualSurface(candidate) {
  return {
    observations: candidate.observations.map((observation) => ({
      observationId: observation.observationId,
      source: {
        documentDigest: observation.source.documentDigest,
        sourceSpanId: observation.source.sourceSpanId,
        coordinate: cloneJson(observation.source.coordinate),
      },
      owner: cloneJson(observation.owner),
      sourceCrop: cloneJson(observation.sourceCrop),
    })),
    candidates: cloneJson(candidate.candidates),
  }
}

function validateSuccessorOnlyNonVisualEvidence(predecessor, successor) {
  const reviewedObservationIds = new Set(
    successor.observations.map((observation) => observation.observationId),
  )
  const predecessorDocumentDigests = new Set(
    predecessor.sourceCapture.documents.map((document) => document.sha256),
  )
  const visualEvidenceRoles = new Set([
    'comparison_baseline',
    'pdf_xobject_raw_stream',
    'source_figure_evidence',
  ])
  const unsupportedDocument = successor.sourceCapture.documents.find(
    (document) => (
      !predecessorDocumentDigests.has(document.sha256)
      && (
        document.mediaType?.startsWith('image/')
        || document.roles?.some((role) => visualEvidenceRoles.has(role))
      )
    ),
  )
  if (unsupportedDocument) {
    fail(
      'VISUAL_CONFIRMATION_REBIND_MISMATCH',
      'Successor Candidate adds an unreviewed visual evidence document',
    )
  }
  const unsupported = successor.sourceCapture.observations.find(
    (observation) => {
      if (reviewedObservationIds.has(observation.observationId)) return false
      const retained = predecessor.sourceCapture.observations.some(
        (candidate) => sameValue(candidate, observation),
      )
      return !retained
        && observation.kind !== 'reading_option_figure_source_layout'
    },
  )
  if (unsupported) {
    fail(
      'VISUAL_CONFIRMATION_REBIND_MISMATCH',
      'Successor Candidate adds evidence outside the reviewed visuals and Job source-layout observations',
    )
  }
}

export function createVisualImportCandidate(input) {
  assertExactObject(
    input,
    ['sourceCapture', 'observations', 'candidates'],
    'VISUAL_CANDIDATE_REQUEST_INVALID',
    'Visual candidate request accepts only Source Capture, observations, and candidates',
  )
  const integrity = validateVisualSourceCapture(input.sourceCapture)
  if (!Array.isArray(input.observations) || input.observations.length === 0) {
    fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', 'Visual candidate request requires at least one observation')
  }
  const observationIds = new Set()
  const observations = input.observations.map((observation, index) => {
    assertExactObject(
      observation,
      ['observationId', 'owner', 'sourceCrop'],
      'VISUAL_CANDIDATE_OBSERVATION_INVALID',
      `Visual observation ${index} contains unsupported or missing fields`,
    )
    assertNonEmptyString(observation.observationId, 'VISUAL_CANDIDATE_OBSERVATION_INVALID', `Visual observation ${index} requires observationId`)
    if (observationIds.has(observation.observationId)) {
      fail('VISUAL_CANDIDATE_OBSERVATION_INVALID', `Visual observation ${observation.observationId} is duplicated`)
    }
    observationIds.add(observation.observationId)
    return {
      observationId: observation.observationId,
      source: sourceLineageForObservation(input.sourceCapture, observation.observationId, integrity),
      owner: normalizeOwner(observation.owner, `Visual observation ${observation.observationId}`),
      sourceCrop: normalizePngArtifact(observation.sourceCrop, `Visual observation ${observation.observationId} source crop`),
    }
  })
  if (!Array.isArray(input.candidates) || input.candidates.length === 0) {
    fail('VISUAL_CANDIDATE_PACKAGE_INVALID', 'Visual candidate request requires exact PNG candidates')
  }
  const candidates = input.candidates.map((candidate, index) => {
    const body = normalizeCandidateBody(candidate, index)
    return { ...body, candidateDigest: digestJson(body) }
  })
  validateCandidateAssociations(observations, candidates)
  const body = {
    schemaVersion: candidateSchemaVersion,
    sourceCaptureRef: {
      captureId: input.sourceCapture.captureId,
      digest: input.sourceCapture.digest,
    },
    sourceCapture: cloneJson(input.sourceCapture),
    observations,
    candidates,
    status: 'awaiting_teacher_confirmation',
    unresolvedIssues: unresolvedConfirmationIssues(observations),
  }
  return { ...body, packageDigest: digestJson(body) }
}

export function confirmVisualImportCandidate(candidate, teacherConfirmation) {
  const validated = normalizePersistedCandidate(candidate)
  assertExactObject(
    teacherConfirmation,
    ['schemaVersion', 'packageDigest', 'decisions'],
    'VISUAL_CONFIRMATION_INVALID',
    'Visual Teacher Confirmation contains unsupported or missing fields',
  )
  if (teacherConfirmation.schemaVersion !== confirmationSchemaVersion) {
    fail('VISUAL_CONFIRMATION_INVALID', 'Visual Teacher Confirmation uses an unsupported version')
  }
  if (teacherConfirmation.packageDigest !== validated.packageDigest) {
    fail('VISUAL_CONFIRMATION_PACKAGE_MISMATCH', 'Visual Teacher Confirmation does not bind the exact reviewed candidate package')
  }
  if (!Array.isArray(teacherConfirmation.decisions)) {
    fail('VISUAL_CONFIRMATION_INVALID', 'Visual Teacher Confirmation decisions must be an array')
  }
  const observationsById = new Map(validated.observations.map((observation) => [observation.observationId, observation]))
  const decisionsByObservation = new Map()
  for (const [index, decision] of teacherConfirmation.decisions.entries()) {
    const confirmed = decision?.disposition === 'confirmed'
    assertExactObject(
      decision,
      confirmed
        ? ['observationId', 'owner', 'disposition', 'selectedCandidateDigest']
        : ['observationId', 'owner', 'disposition'],
      'VISUAL_CONFIRMATION_INVALID',
      `Visual Teacher Confirmation decision ${index} contains unsupported or missing fields`,
    )
    if (!['confirmed', 'rejected'].includes(decision.disposition)) {
      fail('VISUAL_CONFIRMATION_INVALID', `Visual Teacher Confirmation decision ${index} uses an unsupported disposition`)
    }
    const observation = observationsById.get(decision.observationId)
    if (!observation || decisionsByObservation.has(decision.observationId)) {
      fail('VISUAL_CONFIRMATION_OBSERVATION_MISMATCH', `Visual Teacher Confirmation decision ${index} does not identify one exact observation`)
    }
    const owner = normalizeOwner(decision.owner, `Visual Teacher Confirmation decision ${index}`)
    if (!sameValue(owner, observation.owner)) {
      fail('VISUAL_CONFIRMATION_OWNER_MISMATCH', `Visual Teacher Confirmation decision ${index} does not bind the reviewed semantic owner`)
    }
    if (confirmed) {
      assertNonEmptyString(
        decision.selectedCandidateDigest,
        'VISUAL_CONFIRMATION_CANDIDATE_MISMATCH',
        `Visual Teacher Confirmation decision ${index} requires selectedCandidateDigest`,
      )
    }
    decisionsByObservation.set(decision.observationId, cloneJson(decision))
  }
  const confirmedSelections = []
  const unresolvedIssues = []
  for (const observation of validated.observations) {
    const decision = decisionsByObservation.get(observation.observationId)
    if (!decision) {
      unresolvedIssues.push({
        code: 'VISUAL_SELECTION_UNCONFIRMED',
        observationId: observation.observationId,
        owner: cloneJson(observation.owner),
      })
      continue
    }
    if (decision.disposition === 'rejected') {
      unresolvedIssues.push({
        code: 'VISUAL_SELECTION_REJECTED',
        observationId: observation.observationId,
        owner: cloneJson(observation.owner),
      })
      continue
    }
    const selected = validated.candidates.find((candidateEntry) => (
      candidateEntry.observationId === observation.observationId
      && candidateEntry.candidateDigest === decision.selectedCandidateDigest
    ))
    if (!selected) {
      fail('VISUAL_CONFIRMATION_CANDIDATE_MISMATCH', `Visual Teacher Confirmation selected a candidate outside its reviewed observation`)
    }
    confirmedSelections.push({
      observationId: observation.observationId,
      owner: cloneJson(observation.owner),
      source: cloneJson(observation.source),
      candidateDigest: selected.candidateDigest,
      method: selected.method,
      artifact: cloneJson(selected.artifact),
    })
  }
  return {
    schemaVersion: selectionSchemaVersion,
    candidatePackageDigest: validated.packageDigest,
    sourceCaptureRef: cloneJson(validated.sourceCaptureRef),
    confirmationDigest: digestJson(teacherConfirmation),
    status: unresolvedIssues.length === 0 ? 'confirmed' : 'unresolved',
    confirmedSelections,
    unresolvedIssues,
  }
}

/**
 * Migration-only bridge for an already reviewed visual surface. New imports
 * still require a Teacher Confirmation against their exact Candidate package.
 */
export function rebindExactVisualTeacherConfirmation(input) {
  assertExactObject(
    input,
    [
      'predecessorCandidatePackage',
      'predecessorTeacherConfirmation',
      'successorCandidatePackage',
    ],
    'VISUAL_CONFIRMATION_REBIND_INVALID',
    'Exact visual confirmation rebind requires predecessor Candidate and Confirmation plus successor Candidate',
  )
  const predecessorSelection = confirmVisualImportCandidate(
    input.predecessorCandidatePackage,
    input.predecessorTeacherConfirmation,
  )
  if (
    predecessorSelection.status !== 'confirmed'
    || predecessorSelection.unresolvedIssues.length !== 0
    || predecessorSelection.confirmedSelections.length
      !== input.predecessorCandidatePackage.observations.length
  ) {
    fail(
      'VISUAL_CONFIRMATION_REBIND_PREDECESSOR_UNCONFIRMED',
      'Prior Teacher Confirmation must exactly confirm every predecessor visual',
    )
  }

  const predecessor = normalizePersistedCandidate(
    input.predecessorCandidatePackage,
  )
  const successor = normalizePersistedCandidate(input.successorCandidatePackage)
  validateSuccessorOnlyNonVisualEvidence(predecessor, successor)
  if (
    !sameValue(
      reviewedVisualSurface(predecessor),
      reviewedVisualSurface(successor),
    )
    || !sameValue(
      predecessor.sourceCapture.assertions,
      successor.sourceCapture.assertions,
    )
  ) {
    fail(
      'VISUAL_CONFIRMATION_REBIND_MISMATCH',
      'Successor Candidate differs from the exact previously reviewed visual surface',
    )
  }

  const rebound = {
    schemaVersion: confirmationSchemaVersion,
    packageDigest: successor.packageDigest,
    decisions: cloneJson(input.predecessorTeacherConfirmation.decisions),
  }
  const reboundSelection = confirmVisualImportCandidate(successor, rebound)
  if (
    reboundSelection.status !== 'confirmed'
    || reboundSelection.unresolvedIssues.length !== 0
    || reboundSelection.confirmedSelections.length !== successor.observations.length
  ) {
    fail(
      'VISUAL_CONFIRMATION_REBIND_MISMATCH',
      'Rebound Teacher Confirmation did not exactly close the successor Candidate',
    )
  }
  return rebound
}
