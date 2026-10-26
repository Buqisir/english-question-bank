import {
  nck1AnalyzedPackageCandidateAuthorityRef55,
  nck1MaterializationCandidateAuthorityRef,
  nck1ListeningInstructionAuthorityRef,
  nck1DrawingAreaAuthorityRef,
  nck1ReadingStemFiguresAuthorityRef,
  nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1ListeningSourceDecisionAuthorityRef,
  nck1MaterializationHistoricalAuthorityRef54,
  nck1MaterializationHistoricalAuthorityRef57,
  nck1MaterializationHistoricalAuthorityRef58,
  nck1MaterializationHistoricalAuthorityRef59,
  nck1MaterializationHistoricalAuthorityRef61,
  nck1MaterializationHistoricalAuthorityRef62,
  nck1MaterializationHistoricalAuthorityRef64,
  nck1MaterializationHistoricalAuthorityRef66,
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
import {
  deriveNck1AnalyzedPackageBundle,
  isNck1AnalyzedPackageInput,
  parseStrictPackageJson,
} from './nck1AnalyzedPackageAdapter.mjs'
import { externalListeningReviewProofIdentity } from '../import-review/importReviewStore.mjs'
import { validateInlineBlankTextBoundaries } from '../../shared/paper-canonical/inlineBlankBoundaries.mjs'

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
  if (![nck1MaterializationCandidateAuthorityRef, nck1ListeningInstructionAuthorityRef, nck1DrawingAreaAuthorityRef, nck1ReadingStemFiguresAuthorityRef, nck1WritingGivenRefsAuthorityRef, nck1ParagraphJoinAuthorityRef, nck1ListeningSourceDecisionAuthorityRef, nck1MaterializationHistoricalAuthorityRef54, nck1MaterializationHistoricalAuthorityRef57, nck1MaterializationHistoricalAuthorityRef58, nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef61, nck1MaterializationHistoricalAuthorityRef62, nck1MaterializationHistoricalAuthorityRef64, nck1MaterializationHistoricalAuthorityRef66]
    .some(authority => sameAuthority(request?.authority, authority))) return false
  const documents = request?.evidence?.documents
  if (!Array.isArray(documents)) return false
  const sourceAssets = documents.filter((document) =>
    document.inputKey === 'nck1_source_materialization')
  return sourceAssets.length === 1
    && sourceAssets[0].bytes instanceof Uint8Array
    && request.nck1MaterializationConfirmation?.schemaVersion
      === 'teacher-confirmation-v1'
    && request.nck1MaterializationConfirmation.confirmed === true
}

function analyzedPackageContentDocument(request) {
  const documents = request?.evidence?.documents
  if (!Array.isArray(documents)) return null
  const manifests = documents.filter((document) =>
    document.inputKey === 'nck1_analyzed_package_manifest')
  if (manifests.length !== 1 || !(manifests[0].bytes instanceof Uint8Array)) return null
  try {
    const manifest = parseStrictPackageJson(manifests[0].bytes)
    if (typeof manifest?.contentMemberId !== 'string') return null
    const inputKey = `source_document_${manifest.contentMemberId.replace(/[^a-z0-9]+/gi, '_')}`
    const matches = documents.filter((document) => document.inputKey === inputKey)
    return matches.length === 1 && matches[0].bytes instanceof Uint8Array ? matches[0] : null
  } catch {
    return null
  }
}

export function isNck1AnalyzedPackageCanonicalImportRequest(request) {
  if (!sameAuthority(
    request?.authority,
    nck1AnalyzedPackageCandidateAuthorityRef55,
  )) return false
  return Boolean(analyzedPackageContentDocument(request))
    && request.nck1MaterializationConfirmation?.schemaVersion
      === 'teacher-confirmation-v1'
    && request.nck1MaterializationConfirmation.confirmed === true
}

function isNck1CanonicalImportRequest(request) {
  return isNck1MaterializationCanonicalImportRequest(request)
    || isNck1AnalyzedPackageCanonicalImportRequest(request)
}

export function nck1MaterializationPublicationSourceAsset(request) {
  if (!isNck1CanonicalImportRequest(request)) return null
  if (isNck1AnalyzedPackageCanonicalImportRequest(request)) {
    return new Uint8Array(analyzedPackageContentDocument(request).bytes)
  }
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

function admitLiveConfirmedNck1Import(request, acceptsRequest) {
  if (!acceptsRequest(request)) {
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
  const issues = validateInlineBlankTextBoundaries(compilation.artifacts.canonicalPaper.questionGroups)
  if (issues.length) {
    const error = requestError(issues[0].code, issues.map(issue => issue.message).join('; '))
    error.diagnostics = issues
    throw error
  }
  const sourceAsset = nck1MaterializationPublicationSourceAsset(request)
  const confirmation = request.nck1MaterializationConfirmation
  const identity = Object.freeze({
    paperId: compilation.artifacts.canonicalPaper.paperPlan.paperId,
    authority: Object.freeze({ ...request.authority }),
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

export function admitLiveConfirmedNck1MaterializationImport(request) {
  return admitLiveConfirmedNck1Import(
    request,
    isNck1MaterializationCanonicalImportRequest,
  )
}

export function admitLiveConfirmedNck1AnalyzedPackageImport(request) {
  return admitLiveConfirmedNck1Import(
    request,
    isNck1AnalyzedPackageCanonicalImportRequest,
  )
}

function isLiveConfirmedNck1Admission({
  proof,
  compilation,
  sourceAsset,
}, authority) {
  const admitted = liveNck1MaterializationProofs.get(proof)
  if (
    !admitted
    || admitted.compilation !== compilation
    || !sameAuthority(admitted.identity.authority, authority)
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

export function isLiveConfirmedNck1MaterializationAdmission(admission) {
  return isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationCandidateAuthorityRef,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1DrawingAreaAuthorityRef,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef54,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef57,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef58,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef59,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef61,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef62,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef64,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1MaterializationHistoricalAuthorityRef66,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1ListeningInstructionAuthorityRef,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1ReadingStemFiguresAuthorityRef,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1WritingGivenRefsAuthorityRef,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1ParagraphJoinAuthorityRef,
  ) || isLiveConfirmedNck1Admission(
    admission,
    nck1ListeningSourceDecisionAuthorityRef,
  )
}

export function isLiveConfirmedNck1AnalyzedPackageAdmission(admission) {
  return isLiveConfirmedNck1Admission(
    admission,
    nck1AnalyzedPackageCandidateAuthorityRef55,
  )
}

export function isLiveExternalListeningReviewAdmission({
  proof,
  nck1AnalyzedPackageConfirmationProof,
  compilation,
  listeningAudioBytes,
}) {
  const reviewed = externalListeningReviewProofIdentity(proof)
  const admitted = liveNck1MaterializationProofs.get(nck1AnalyzedPackageConfirmationProof)
  if (
    !reviewed
    || !admitted
    || admitted.compilation !== compilation
    || reviewed.paperId !== admitted.identity.paperId
    || reviewed.sourceDigest !== admitted.identity.sourceDigest
    || reviewed.candidateDigest !== admitted.identity.candidateDigest
    || !(listeningAudioBytes instanceof Uint8Array)
    || reviewed.audioSha256 !== sha256(listeningAudioBytes)
    || reviewed.audioByteLength !== listeningAudioBytes.byteLength
  ) return false
  return true
}

/**
 * Materialize the trusted adapter's deterministic compiler request without
 * writing or publishing anything. The returned output map can be persisted by
 * an explicit caller and loaded with loadCanonicalImportRequest.
 */
export function materializeNck1CanonicalRequest(sourceInput, confirmation) {
  const analyzedPackage = isNck1AnalyzedPackageInput(sourceInput)
  if (!analyzedPackage && !isNck1MaterializationInput(sourceInput)) {
    throw requestError(
      'MATERIALIZATION_INPUT_INVALID',
      'NCK1 request materialization requires one exact immutable source bundle',
    )
  }
  let imported = importCanonicalCandidate(sourceInput)
  if (!analyzedPackage && confirmation?.candidateDigest !== imported.candidate?.candidateDigest) {
    for (const materializationAuthorityRef of [nck1MaterializationHistoricalAuthorityRef66, nck1MaterializationHistoricalAuthorityRef64, nck1MaterializationHistoricalAuthorityRef62, nck1MaterializationHistoricalAuthorityRef61, nck1MaterializationHistoricalAuthorityRef59, nck1MaterializationHistoricalAuthorityRef58]) {
      const historical = importCanonicalCandidate(sourceInput, undefined, { materializationAuthorityRef })
      if (historical.candidate?.candidateDigest === confirmation?.candidateDigest) { imported = historical; break }
    }
  }
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
  const derivation = analyzedPackage
    ? deriveNck1AnalyzedPackageBundle(sourceInput)
    : deriveNck1MaterializationBundle(sourceInput, imported.candidate.authority)
  const outputs = new Map()
  const authority = analyzedPackage
    ? nck1AnalyzedPackageCandidateAuthorityRef55
    : imported.candidate.authority
  const liveRequest = {
    authority,
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
    authority,
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
