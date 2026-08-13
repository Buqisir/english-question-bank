import {
  trustedDocxCandidateAuthorityRef,
} from '../../shared/paper-canonical/authority.mjs'
import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
  rederiveConfirmedCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import {
  digestJson,
  exactKeys,
  sha256,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'
import {
  DOCX_MEDIA_TYPE,
  DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
} from './docxSourceAdapter.mjs'

export const TEACHER_CONFIRMATION_MEDIA_TYPE =
  'application/vnd.eqb.teacher-confirmation+json'
export const TEACHER_CONFIRMATION_SCHEMA_VERSION = 'teacher-confirmation-v1'

export const TRUSTED_DOCX_SOURCE_FILE_NAME = '01-source.docx'
export const TRUSTED_DOCX_ENVELOPE_FILE_NAME = '02-docx-source-envelope.json'
export const TRUSTED_DOCX_CONFIRMATION_FILE_NAME = '03-teacher-confirmation-v1.json'
export const TRUSTED_DOCX_REQUEST_FILE_NAME = 'canonical-import-request.json'

const liveTrustedDocxProofs = new WeakMap()
const textEncoder = new TextEncoder()

function requestError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function asUint8Array(value) {
  return value instanceof Uint8Array ? new Uint8Array(value) : null
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

function documentMediaType(document) {
  return document?.declared?.mediaType || document?.mediaType || null
}

function jsonBytes(value) {
  return textEncoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function confirmationBytes(confirmation) {
  return textEncoder.encode(`${stableStringify(confirmation)}\n`)
}

function findUniqueDocument(documents, predicate, label) {
  const matches = documents.filter(predicate)
  if (matches.length !== 1) {
    throw requestError(
      'TRUSTED_DOCX_REQUEST_INVALID',
      `Trusted DOCX request requires exactly one ${label}`,
    )
  }
  return matches[0]
}

function parseTeacherConfirmation(bytes) {
  const raw = asUint8Array(bytes)
  if (!raw) {
    throw requestError(
      'TRUSTED_DOCX_CONFIRMATION_INVALID',
      'Teacher Confirmation bytes are missing',
    )
  }
  let parsed
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw))
  } catch (error) {
    throw requestError(
      'TRUSTED_DOCX_CONFIRMATION_INVALID',
      `Teacher Confirmation is unreadable: ${error.message}`,
    )
  }
  if (
    !exactKeys(parsed, [
      'schemaVersion',
      'candidateDigest',
      'sourceDigest',
      'confirmed',
    ])
    || parsed.schemaVersion !== TEACHER_CONFIRMATION_SCHEMA_VERSION
  ) {
    throw requestError(
      'TRUSTED_DOCX_CONFIRMATION_INVALID',
      'Teacher Confirmation must bind only schemaVersion, candidateDigest, sourceDigest, and confirmed',
    )
  }
  return parsed
}

export function isTrustedDocxCanonicalImportRequest(request) {
  if (!sameAuthority(request?.authority, trustedDocxCandidateAuthorityRef)) {
    return false
  }
  const documents = request?.evidence?.documents
  if (!Array.isArray(documents) || documents.length === 0) return false
  const source = documents.filter((document) => document.inputKey === 'source_docx')
  const envelope = documents.filter((document) =>
    documentMediaType(document) === DOCX_SOURCE_ENVELOPE_MEDIA_TYPE)
  const confirmation = documents.filter((document) =>
    document.inputKey === 'teacher_confirmation')
  return source.length === 1
    && envelope.length === 1
    && confirmation.length === 1
    && source[0].bytes instanceof Uint8Array
    && confirmation[0].bytes instanceof Uint8Array
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

/**
 * Derive a loadable trusted-DOCX canonical import request from immutable
 * DOCX bytes. Teacher Confirmation is bound to the exact candidate and
 * source digests; the Canonical Paper is never written as an input.
 */
export function materializeTrustedDocxCanonicalRequest(docxBytes, {
  originalName = 'source.docx',
  expectedPaperId = null,
} = {}) {
  const sourceBytes = asUint8Array(docxBytes)
  if (!sourceBytes || sourceBytes.byteLength === 0) {
    throw requestError(
      'TRUSTED_DOCX_SOURCE_REQUIRED',
      'Format ① canonical producer requires immutable non-empty DOCX bytes',
    )
  }
  if (typeof originalName !== 'string' || originalName.length === 0) {
    throw requestError(
      'TRUSTED_DOCX_SOURCE_NAME_INVALID',
      'Format ① canonical producer requires a source originalName',
    )
  }
  const imported = importCanonicalCandidate(sourceBytes, { originalName })
  if (!imported.candidate || imported.issues.length > 0) {
    const first = imported.issues[0]
    throw requestError(
      first?.code || 'DOCX_SOURCE_DOCUMENT_INVALID',
      first?.message || 'Trusted DOCX candidate derivation failed',
    )
  }
  const paperId = imported.candidate.interpretation?.paperId
  if (typeof paperId !== 'string' || paperId.length === 0) {
    throw requestError(
      'DOCX_SOURCE_DOCUMENT_INVALID',
      'DOCX source lacks a supported NCK1 paper identity',
    )
  }
  if (expectedPaperId && expectedPaperId !== paperId) {
    throw requestError(
      'TRUSTED_DOCX_PAPER_ID_MISMATCH',
      `DOCX identity ${paperId} differs from expected ${expectedPaperId}`,
    )
  }
  const confirmation = {
    schemaVersion: TEACHER_CONFIRMATION_SCHEMA_VERSION,
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    confirmed: true,
  }
  const confirmed = confirmCanonicalCandidate(imported.candidate, confirmation)
  if (!confirmed.canonicalPaper) {
    const first = confirmed.unresolvedIssues?.[0]
    throw requestError(
      first?.code || 'TEACHER_CONFIRMATION_REQUIRED',
      first?.message || 'Teacher Confirmation did not produce one Canonical Paper',
    )
  }
  const sourceDocument = {
    inputKey: 'source_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: imported.candidate.source.sha256,
    byteLength: imported.candidate.source.byteLength,
  }
  const envelope = {
    schemaVersion: 'docx-source-envelope-v2',
    sourceDocument,
  }
  const request = {
    authority: {
      manifestId: trustedDocxCandidateAuthorityRef.manifestId,
      manifestVersion: trustedDocxCandidateAuthorityRef.manifestVersion,
      manifestDigest: trustedDocxCandidateAuthorityRef.manifestDigest,
    },
    evidence: {
      documents: [
        {
          inputKey: 'source_docx',
          roles: ['question_source', 'official_answer_source', 'source_provenance'],
          declared: {
            mediaType: DOCX_MEDIA_TYPE,
            originalName,
          },
          path: TRUSTED_DOCX_SOURCE_FILE_NAME,
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
          path: TRUSTED_DOCX_ENVELOPE_FILE_NAME,
        },
        {
          inputKey: 'teacher_confirmation',
          roles: ['operator_assertions'],
          declared: {
            mediaType: TEACHER_CONFIRMATION_MEDIA_TYPE,
            originalName: 'teacher-confirmation-v1.json',
          },
          path: TRUSTED_DOCX_CONFIRMATION_FILE_NAME,
        },
      ],
    },
  }
  return {
    paperId,
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    outputs: new Map([
      [TRUSTED_DOCX_SOURCE_FILE_NAME, Buffer.from(sourceBytes)],
      [TRUSTED_DOCX_ENVELOPE_FILE_NAME, Buffer.from(jsonBytes(envelope))],
      [TRUSTED_DOCX_CONFIRMATION_FILE_NAME, Buffer.from(confirmationBytes(confirmation))],
      [TRUSTED_DOCX_REQUEST_FILE_NAME, Buffer.from(jsonBytes(request))],
    ]),
  }
}

export function compileTrustedDocxCanonicalImportRequest(request) {
  if (!isTrustedDocxCanonicalImportRequest(request)) {
    throw requestError(
      'TRUSTED_DOCX_REQUEST_INVALID',
      'Trusted DOCX admission requires v37 authority, source DOCX, envelope, and Teacher Confirmation',
    )
  }
  const documents = request.evidence.documents
  const source = findUniqueDocument(
    documents,
    (document) => document.inputKey === 'source_docx',
    'source_docx document',
  )
  const confirmationDocument = findUniqueDocument(
    documents,
    (document) => document.inputKey === 'teacher_confirmation',
    'teacher_confirmation document',
  )
  const sourceBytes = asUint8Array(source.bytes)
  if (!sourceBytes) {
    throw requestError(
      'TRUSTED_DOCX_SOURCE_REQUIRED',
      'Trusted DOCX request source_docx bytes are missing',
    )
  }
  const originalName = typeof source.declared?.originalName === 'string'
    && source.declared.originalName.length > 0
    ? source.declared.originalName
    : 'source.docx'
  const imported = importCanonicalCandidate(sourceBytes, { originalName })
  if (!imported.candidate || imported.issues.length > 0) {
    const first = imported.issues[0]
    throw requestError(
      first?.code || 'DOCX_SOURCE_DOCUMENT_INVALID',
      first?.message || 'Trusted DOCX candidate derivation failed',
    )
  }
  const confirmation = parseTeacherConfirmation(confirmationDocument.bytes)
  const confirmed = rederiveConfirmedCanonicalCandidate(
    imported.candidate,
    confirmation,
  )
  if (!confirmed.compilation) {
    const first = confirmed.unresolvedIssues?.[0]
    throw requestError(
      first?.code || 'TEACHER_CONFIRMATION_REQUIRED',
      first?.message || 'Teacher Confirmation did not re-derive one Canonical Paper',
    )
  }
  return {
    compilation: confirmed.compilation,
    candidate: confirmed.candidate,
    confirmation: confirmed.confirmation,
    sourceBytes,
  }
}

export function admitLiveConfirmedTrustedDocxImport(request) {
  const compiled = compileTrustedDocxCanonicalImportRequest(request)
  const identity = Object.freeze({
    paperId: compiled.candidate.interpretation.paperId,
    authority: Object.freeze({ ...trustedDocxCandidateAuthorityRef }),
    candidateDigest: compiled.candidate.candidateDigest,
    sourceDigest: compiled.candidate.source.sha256,
  })
  const proof = Object.freeze({})
  liveTrustedDocxProofs.set(proof, Object.freeze({
    compilation: compiled.compilation,
    sourceAssetDigest: sha256(compiled.sourceBytes),
    identity,
    snapshotDigest: proofSnapshotDigest({
      compilation: compiled.compilation,
      sourceAsset: compiled.sourceBytes,
      identity,
    }),
  }))
  return {
    compilation: compiled.compilation,
    sourceAsset: compiled.sourceBytes,
    proof,
    identity,
  }
}

export function isLiveConfirmedTrustedDocxAdmission({
  proof,
  compilation,
  sourceAsset,
}) {
  const admitted = liveTrustedDocxProofs.get(proof)
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

export function trustedDocxPublicationSourceAsset(request, fallbackBytes) {
  if (!isTrustedDocxCanonicalImportRequest(request)) {
    return fallbackBytes instanceof Uint8Array ? fallbackBytes : null
  }
  const source = request.evidence.documents.find(
    (document) => document.inputKey === 'source_docx',
  )
  return asUint8Array(source?.bytes)
}
