import {
  nck1MaterializationCandidateAuthorityRef,
} from '../../shared/paper-canonical/authority.mjs'
import {
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import {
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
    outputs,
  }
}
