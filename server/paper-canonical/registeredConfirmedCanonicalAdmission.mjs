import { readFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  resolveCanonicalAuthority,
  trustedDocxCandidateAuthorityRef,
  trustedLegacyHistoricalCandidateAuthorityRef,
  trustedLegacyCaptureCandidateAuthorityRef,
} from '../../shared/paper-canonical/authority.mjs'
import {
  rederiveConfirmedCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import {
  digestJson,
  exactKeys,
  sha256,
  stableStringify,
  withoutKey,
} from '../../shared/paper-canonical/stable.mjs'

export const registeredConfirmedCanonicalAdmissionSchemaVersion =
  'registered-confirmed-canonical-admission-v1'

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')
const migrationManifestPath =
  'docs/cuts/paper-canonical-unification/migration/manifest-v2.json'
const migrationManifestDigest =
  'sha256:9992329a6de0fa3dcbff9fea8a0d6d92b660f0e8049b7978ceb5ff0000610e41'
const trustedDocxSourcePath =
  'test-fixtures/paper-import/paper-2025-i-docx-source-adapter/2025-nck1-answer-source.docx'
const admittedAuthorities = [
  trustedDocxCandidateAuthorityRef,
  trustedLegacyHistoricalCandidateAuthorityRef,
  trustedLegacyCaptureCandidateAuthorityRef,
]
const admittedProofs = new WeakMap()

function admissionError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function sameBytes(left, right) {
  return left instanceof Uint8Array
    && right instanceof Uint8Array
    && left.byteLength === right.byteLength
    && left.every((byte, index) => byte === right[index])
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

function registeredAuthority(authority) {
  return admittedAuthorities.find((candidate) => sameAuthority(candidate, authority)) || null
}

// Consumers must retain the report shape emitted by these already-confirmed
// compiler versions. Admission still requires the opaque exact-record proof
// below; this helper is only the corresponding read-side compatibility edge.
export function isRegisteredConfirmedCanonicalPublicationAuthority(authority) {
  return Boolean(registeredAuthority(authority))
}

function repositoryBytes(relativePath, label) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.includes('..')
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${label} has an unsafe repository path`,
    )
  }
  const absolutePath = resolve(repositoryRoot, relativePath)
  if (!absolutePath.startsWith(`${repositoryRoot}${sep}`)) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${label} escapes the repository root`,
    )
  }
  try {
    return new Uint8Array(readFileSync(absolutePath))
  } catch (error) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${label} cannot be read: ${error.message}`,
    )
  }
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch (error) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${label} is unreadable JSON: ${error.message}`,
    )
  }
}

function artifactBytes(descriptor, label) {
  if (
    !descriptor
    || typeof descriptor.path !== 'string'
    || !Number.isInteger(descriptor.byteLength)
    || descriptor.byteLength < 1
    || typeof descriptor.fileSha256 !== 'string'
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${label} descriptor is incomplete`,
    )
  }
  const bytes = repositoryBytes(descriptor.path, label)
  if (
    bytes.byteLength !== descriptor.byteLength
    || sha256(bytes) !== descriptor.fileSha256
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${label} bytes differ from the pinned migration registry`,
    )
  }
  return bytes
}

function candidateFromArtifact(artifact) {
  return artifact?.candidate?.candidateDigest ? artifact.candidate : artifact
}

function confirmationFromArtifact(artifact) {
  return artifact?.teacherConfirmation || artifact?.confirmation || artifact
}

function canonicalFromArtifact(artifact) {
  return artifact?.canonicalPaper || artifact
}

function candidateBody(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return body
}

function parseEnvelope(envelope) {
  if (
    !exactKeys(envelope, [
      'schemaVersion',
      'paperId',
      'sourceBytes',
      'candidateBytes',
      'confirmationBytes',
      'canonicalPaperBytes',
    ])
    || envelope.schemaVersion !== registeredConfirmedCanonicalAdmissionSchemaVersion
    || typeof envelope.paperId !== 'string'
    || envelope.paperId.length === 0
    || [
      envelope.sourceBytes,
      envelope.candidateBytes,
      envelope.confirmationBytes,
      envelope.canonicalPaperBytes,
    ].some((bytes) => !(bytes instanceof Uint8Array) || bytes.byteLength === 0)
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_ENVELOPE_INVALID',
      'Registered confirmation admission requires one exact source/candidate/confirmation/canonical evidence envelope',
    )
  }
  return envelope
}

function registeredManifest() {
  const bytes = repositoryBytes(migrationManifestPath, 'Migration manifest')
  const manifest = parseJson(bytes, 'Migration manifest')
  if (
    manifest?.schemaVersion !== 'paper-canonical-migration-manifest-v2'
    || manifest.manifestDigest !== migrationManifestDigest
    || manifest.manifestDigest !== digestJson(withoutKey(manifest, 'manifestDigest'))
    || !Array.isArray(manifest.papers)
    || manifest.membership?.completeUnpublishedCanonicalPapers !== 33
    || manifest.publication?.publications !== 0
    || manifest.publication?.currentRefs !== 0
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      'Migration manifest is not the pinned complete unpublished corpus registry',
    )
  }
  return manifest
}

function registeredRecord(manifest, paperId) {
  const records = manifest.papers.filter((record) => record?.paperId === paperId)
  if (records.length !== 1) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_PAPER_UNKNOWN',
      `Paper ${paperId} does not resolve to one registered complete confirmation chain`,
    )
  }
  const record = records[0]
  const authority = registeredAuthority(record.authority)
  const resolved = authority && resolveCanonicalAuthority(authority)
  if (!authority || !resolved?.ok || !['trusted-docx', 'legacy-json'].includes(record.sourceType)) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_AUTHORITY_UNAVAILABLE',
      `Paper ${paperId} does not use a registered publisher bridge authority`,
    )
  }
  if (
    record.canonicalPaper?.completeness !== 'complete'
    || record.canonicalPaper?.publication !== 'unpublished'
    || !record.candidate?.candidateDigest
    || !record.confirmation?.candidateDigest
    || !record.confirmation?.sourceDigest
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `Paper ${paperId} does not close a complete unpublished confirmation chain`,
    )
  }
  return { record, authority }
}

function expectedSourceBytes(record, candidate) {
  const captureBytes = artifactBytes(record.sourceCapture, `${record.paperId} Source Capture`)
  if (record.sourceType === 'legacy-json') return captureBytes
  const docxBytes = repositoryBytes(trustedDocxSourcePath, `${record.paperId} DOCX source`)
  if (
    candidate?.source?.sha256 !== sha256(docxBytes)
    || candidate?.source?.byteLength !== docxBytes.byteLength
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_REGISTRY_INVALID',
      `${record.paperId} DOCX source is not bound to its registered Candidate`,
    )
  }
  return docxBytes
}

function assertExactEvidence(actual, expected, label) {
  if (!sameBytes(actual, expected)) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_EVIDENCE_MISMATCH',
      `${label} differs from the registered immutable confirmation chain`,
    )
  }
}

function sourceAssetFor(compilation, sourceDigest) {
  const documents = compilation?.artifacts?.sourceCapture?.documents || []
  const matches = documents.filter((document) => document?.sha256 === sourceDigest)
  if (matches.length !== 1 || typeof matches[0].encodedBytes !== 'string') {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_SOURCE_UNBOUND',
      'Registered Candidate source does not resolve to one captured immutable document',
    )
  }
  const bytes = new Uint8Array(Buffer.from(matches[0].encodedBytes, 'base64'))
  if (
    bytes.byteLength !== matches[0].byteLength
    || sha256(bytes) !== matches[0].sha256
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_SOURCE_UNBOUND',
      'Registered Candidate source bytes do not close the re-derived capture',
    )
  }
  return bytes
}

function expectedCanonicalFor(candidate, compilation, canonical) {
  return Object.hasOwn(canonical, 'sourceCapture')
    ? {
        ...compilation.artifacts.canonicalPaper,
        sourceCapture: compilation.artifacts.sourceCapture,
      }
    : compilation.artifacts.canonicalPaper
}

/**
 * Re-open one immutable Ticket 30 confirmation chain. The envelope can carry
 * bytes, but its authority and every semantic identity are resolved solely
 * from the pinned repository registry before admission receives a write proof.
 */
export function resolveRegisteredConfirmedCanonicalAdmission(envelope) {
  const supplied = parseEnvelope(envelope)
  const manifest = registeredManifest()
  const { record, authority } = registeredRecord(manifest, supplied.paperId)
  const candidateBytes = artifactBytes(record.candidate, `${record.paperId} Candidate`)
  const confirmationBytes = artifactBytes(record.confirmation, `${record.paperId} Teacher Confirmation`)
  const canonicalPaperBytes = artifactBytes(record.canonicalPaper, `${record.paperId} Canonical Paper`)
  const candidateArtifact = parseJson(candidateBytes, `${record.paperId} Candidate`)
  const candidate = candidateFromArtifact(candidateArtifact)
  const confirmation = confirmationFromArtifact(
    parseJson(confirmationBytes, `${record.paperId} Teacher Confirmation`),
  )
  const canonical = canonicalFromArtifact(
    parseJson(canonicalPaperBytes, `${record.paperId} Canonical Paper`),
  )
  const sourceBytes = expectedSourceBytes(record, candidate)

  assertExactEvidence(supplied.sourceBytes, sourceBytes, `${record.paperId} source`)
  assertExactEvidence(supplied.candidateBytes, candidateBytes, `${record.paperId} Candidate`)
  assertExactEvidence(supplied.confirmationBytes, confirmationBytes, `${record.paperId} Teacher Confirmation`)
  assertExactEvidence(supplied.canonicalPaperBytes, canonicalPaperBytes, `${record.paperId} Canonical Paper`)

  if (
    candidate?.candidateDigest !== record.candidate.candidateDigest
    || candidate.candidateDigest !== digestJson(candidateBody(candidate))
    || !sameAuthority(candidate.authority, authority)
    || candidate?.source?.sha256 !== sha256(sourceBytes)
    || candidate?.source?.byteLength !== sourceBytes.byteLength
    || candidate?.interpretation?.paperId !== record.paperId
    || confirmation?.candidateDigest !== candidate.candidateDigest
    || confirmation?.sourceDigest !== candidate.source.sha256
    || canonical?.paperPlan?.paperId !== record.paperId
    || !sameAuthority(canonical?.paperPlan?.authorityRef, authority)
    || canonical?.paperPlan?.completeness?.status !== 'complete'
  ) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_CHAIN_INVALID',
      `${record.paperId} registered evidence does not close source, Candidate, Confirmation, and Canonical Paper identities`,
    )
  }

  const confirmed = rederiveConfirmedCanonicalCandidate({
    ...candidate,
    sourceBytes: new Uint8Array(sourceBytes),
  }, confirmation)
  if (!confirmed.compilation) {
    const codes = confirmed.unresolvedIssues?.map((issue) => issue.code).join(', ') || 'unknown'
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_CONFIRMATION_INVALID',
      `${record.paperId} registered confirmation no longer re-derives: ${codes}`,
    )
  }
  const expectedCanonical = expectedCanonicalFor(
    candidate,
    confirmed.compilation,
    canonical,
  )
  if (stableStringify(canonical) !== stableStringify(expectedCanonical)) {
    throw admissionError(
      'CANONICAL_PUBLICATION_REGISTERED_CANONICAL_MISMATCH',
      `${record.paperId} Canonical Paper does not match a fresh registered source derivation`,
    )
  }

  const sourceAsset = sourceAssetFor(confirmed.compilation, candidate.source.sha256)
  const proof = Object.freeze({})
  admittedProofs.set(proof, {
    compilation: confirmed.compilation,
    sourceAssetDigest: sha256(sourceAsset),
  })
  return {
    compilation: confirmed.compilation,
    sourceAsset,
    proof,
    identity: {
      paperId: record.paperId,
      authority,
      candidateDigest: candidate.candidateDigest,
      sourceDigest: candidate.source.sha256,
    },
  }
}

export function isRegisteredConfirmedCanonicalAdmission({
  proof,
  compilation,
  sourceAsset,
}) {
  const admitted = admittedProofs.get(proof)
  return Boolean(
    admitted
    && admitted.compilation === compilation
    && sourceAsset instanceof Uint8Array
    && admitted.sourceAssetDigest === sha256(sourceAsset),
  )
}
