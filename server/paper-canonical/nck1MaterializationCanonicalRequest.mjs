import {
  nck1MaterializationCandidateAuthorityRef,
} from '../../shared/paper-canonical/authority.mjs'
import {
  compileCanonicalPaper,
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'
import {
  deriveNck1MaterializationBundle,
  isNck1MaterializationInput,
} from './nck1MaterializationAdapter.mjs'

export const NCK1_MATERIALIZATION_REQUEST_FILE_NAME =
  'canonical-import-request.json'
export const NCK1_MATERIALIZATION_CONFIRMATION_FILE_NAME =
  'teacher-confirmation-v1.json'

const textEncoder = new TextEncoder()
const liveNck1MaterializationProofs = new WeakMap()

function requestError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function safeFileStem(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function extensionFor(mediaType) {
  return ({
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
  })[mediaType] || 'json'
}

function jsonBytes(value) {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function sameAuthority(left, right) {
  return Boolean(
    left
    && right
    && left.manifestId === right.manifestId
    && left.manifestVersion === right.manifestVersion
    && left.manifestDigest === right.manifestDigest,
  )
}

export function isNck1MaterializationCanonicalImportRequest(request) {
  if (!sameAuthority(
    request?.authority,
    nck1MaterializationCandidateAuthorityRef,
  )) return false
  const documents = request?.evidence?.documents
  if (!Array.isArray(documents)) return false
  const materializations = documents.filter(
    (document) => document.inputKey === 'nck1_source_materialization',
  )
  return materializations.length === 1
    && materializations[0].bytes instanceof Uint8Array
    && request.nck1MaterializationConfirmation?.schemaVersion
      === 'teacher-confirmation-v1'
    && request.nck1MaterializationConfirmation.confirmed === true
}

export function nck1MaterializationPublicationSourceAsset(request) {
  if (!isNck1MaterializationCanonicalImportRequest(request)) return null
  return new Uint8Array(request.evidence.documents.find(
    (document) => document.inputKey === 'nck1_source_materialization',
  ).bytes)
}

function proofSnapshotDigest({ compilation, sourceAsset, identity }) {
  const canonicalPaper = compilation?.artifacts?.canonicalPaper
  return digestJson({
    compilation,
    sourceAsset: {
      sha256: sha256(sourceAsset),
      byteLength: sourceAsset.byteLength,
    },
    identity,
    canonicalIdentity: {
      paperId: canonicalPaper?.paperPlan?.paperId,
      authority: canonicalPaper?.paperPlan?.authorityRef,
      digest: digestJson(canonicalPaper),
    },
  })
}

export function admitLiveConfirmedNck1MaterializationImport(request) {
  if (!isNck1MaterializationCanonicalImportRequest(request)) {
    throw requestError(
      'NCK1_MATERIALIZATION_REQUEST_INVALID',
      'NCK1 materialization admission requires immutable source evidence and Teacher Confirmation',
    )
  }
  const compilation = compileCanonicalPaper(request)
  if (compilation.disposition !== 'ready') {
    const first = compilation.artifacts?.normalizationReport?.diagnostics?.[0]
    throw requestError(
      first?.code || 'NCK1_MATERIALIZATION_REQUEST_INVALID',
      first?.message || 'Confirmed NCK1 materialization did not derive one Canonical Paper',
    )
  }
  const sourceAsset = nck1MaterializationPublicationSourceAsset(request)
  const confirmation = request.nck1MaterializationConfirmation
  const identity = Object.freeze({
    paperId: compilation.artifacts.canonicalPaper.paperPlan.paperId,
    authority: Object.freeze({ ...nck1MaterializationCandidateAuthorityRef }),
    candidateDigest: confirmation.candidateDigest,
    sourceDigest: confirmation.sourceDigest,
  })
  const proof = Object.freeze({})
  liveNck1MaterializationProofs.set(proof, Object.freeze({
    compilation,
    sourceAssetDigest: sha256(sourceAsset),
    identity,
    snapshotDigest: proofSnapshotDigest({ compilation, sourceAsset, identity }),
  }))
  return { compilation, sourceAsset, proof, identity }
}

export function isLiveConfirmedNck1MaterializationAdmission({
  proof,
  compilation,
  sourceAsset,
}) {
  const admitted = liveNck1MaterializationProofs.get(proof)
  if (
    !admitted
    || admitted.compilation !== compilation
    || !(sourceAsset instanceof Uint8Array)
    || admitted.sourceAssetDigest !== sha256(sourceAsset)
  ) return false
  try {
    return admitted.snapshotDigest === proofSnapshotDigest({
      compilation,
      sourceAsset,
      identity: admitted.identity,
    })
  } catch {
    return false
  }
}

/**
 * Materialize the trusted adapter's deterministic compiler request without
 * writing or publishing anything. The returned output map can be persisted by
 * an explicit caller and loaded with loadCanonicalImportRequest.
 */
export function materializeNck1CanonicalRequest(sourceInput, confirmation) {
  if (!isNck1MaterializationInput(sourceInput)) {
    throw requestError(
      'MATERIALIZATION_INPUT_INVALID',
      'NCK1 request materialization requires one exact immutable source bundle',
    )
  }
  const imported = importCanonicalCandidate(sourceInput)
  if (!imported.candidate || imported.issues.length > 0) {
    const first = imported.issues[0]
    throw requestError(
      first?.code || 'MATERIALIZATION_DERIVATION_INCOMPLETE',
      first?.message || 'NCK1 Candidate derivation is incomplete',
    )
  }
  if (
    confirmation?.schemaVersion !== 'teacher-confirmation-v1'
    || confirmation.candidateDigest !== imported.candidate.candidateDigest
    || confirmation.sourceDigest !== imported.candidate.source.sha256
    || confirmation.confirmed !== true
  ) {
    throw requestError(
      'TEACHER_CONFIRMATION_REQUIRED',
      'Canonical request materialization requires an exact external Teacher Confirmation',
    )
  }
  const confirmed = rederiveConfirmedCanonicalCandidate(
    imported.candidate,
    confirmation,
  )
  if (!confirmed.compilation?.artifacts?.canonicalPaper) {
    const first = confirmed.unresolvedIssues?.[0]
    throw requestError(
      first?.code || 'CANONICAL_DERIVATION_INCOMPLETE',
      first?.message || 'Confirmed NCK1 Candidate did not derive one Canonical Paper',
    )
  }
  const derivation = deriveNck1MaterializationBundle(sourceInput)
  const outputs = new Map()
  const liveRequest = {
    authority: nck1MaterializationCandidateAuthorityRef,
    nck1MaterializationConfirmation: confirmation,
    evidence: {
      documents: derivation.request.evidence.documents.map((document) => ({
        ...document,
        bytes: new Uint8Array(document.bytes),
      })),
    },
  }
  const documents = derivation.request.evidence.documents.map((document, index) => {
    const mediaType = document.declared.mediaType
    const fileName = `${String(index + 1).padStart(2, '0')}-${safeFileStem(document.inputKey)}.${extensionFor(mediaType)}`
    outputs.set(fileName, Buffer.from(document.bytes))
    const { bytes: _bytes, ...descriptor } = document
    return { ...descriptor, path: fileName }
  })
  const request = {
    authority: nck1MaterializationCandidateAuthorityRef,
    nck1MaterializationConfirmation: confirmation,
    evidence: { documents },
  }
  outputs.set(
    NCK1_MATERIALIZATION_CONFIRMATION_FILE_NAME,
    Buffer.from(`${stableStringify(confirmation)}\n`),
  )
  outputs.set(
    NCK1_MATERIALIZATION_REQUEST_FILE_NAME,
    Buffer.from(jsonBytes(request)),
  )
  return {
    paperId: derivation.materialization.paperId,
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    canonicalPaper: confirmed.compilation.artifacts.canonicalPaper,
    request: liveRequest,
    outputs,
  }
}
