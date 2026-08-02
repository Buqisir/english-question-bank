import { compileTrustedDocxCandidate } from '../../shared/paper-canonical/compiler.mjs'
import { trustedDocxCandidateAuthorityRef } from '../../shared/paper-canonical/authority.mjs'
import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  DOCX_MEDIA_TYPE,
  DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
  deriveDocxCanonicalSource,
} from './docxSourceAdapter.mjs'

const candidateSchemaVersion = 'trusted-docx-import-candidate-v1'
const confirmationSchemaVersion = 'teacher-confirmation-v1'
const textEncoder = new TextEncoder()

function issue(code, message) {
  return { code, disposition: 'incomplete_source', message }
}

function normalizeOperatorChoices(value) {
  if (value === undefined) return { originalName: 'source.docx' }
  if (!exactKeys(value, ['originalName']) || typeof value.originalName !== 'string' || value.originalName.length === 0) {
    return null
  }
  return { originalName: value.originalName }
}

function candidateBody({ sourceBytes, sourceDigest, operatorChoices, interpretation, issues }) {
  return {
    schemaVersion: candidateSchemaVersion,
    authority: trustedDocxCandidateAuthorityRef,
    source: {
      mediaType: DOCX_MEDIA_TYPE,
      sha256: sourceDigest,
      byteLength: sourceBytes.byteLength,
      originalName: operatorChoices.originalName,
    },
    operatorChoices,
    interpretation,
    issues,
  }
}

function buildTrustedDocxCompilerRequest(docxBytes, originalName) {
  const sourceDocument = {
    inputKey: 'source_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: sha256(docxBytes),
    byteLength: docxBytes.byteLength,
  }
  return {
    evidence: {
      documents: [
        {
          inputKey: sourceDocument.inputKey,
          roles: ['question_source', 'official_answer_source', 'source_provenance'],
          bytes: new Uint8Array(docxBytes),
          declared: { mediaType: DOCX_MEDIA_TYPE, originalName },
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          bytes: textEncoder.encode(JSON.stringify({
            schemaVersion: 'docx-source-envelope-v2',
            sourceDocument,
          })),
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
        },
      ],
    },
  }
}

function suppliedCandidateBody(candidate) {
  const { candidateDigest: _candidateDigest, sourceBytes: _sourceBytes, ...body } = candidate
  return body
}

function isCandidateShape(candidate) {
  return exactKeys(candidate, [
    'schemaVersion',
    'authority',
    'source',
    'operatorChoices',
    'interpretation',
    'issues',
    'candidateDigest',
    'sourceBytes',
  ])
    && candidate.schemaVersion === candidateSchemaVersion
    && candidate.sourceBytes instanceof Uint8Array
}

function candidateFromBytes(sourceBytes, operatorChoices) {
  const immutableBytes = new Uint8Array(sourceBytes)
  const sourceDigest = sha256(immutableBytes)
  let derivedSource
  let compilation
  let issues = []
  try {
    derivedSource = deriveDocxCanonicalSource(immutableBytes)
    compilation = compileTrustedDocxCandidate(buildTrustedDocxCompilerRequest(
      immutableBytes,
      operatorChoices.originalName,
    ))
    issues = compilation.artifacts.normalizationReport.diagnostics
      .filter((diagnostic) => diagnostic.disposition !== 'ready')
      .map(({ code, disposition, message, path }) => ({ code, disposition, message, path }))
  } catch {
    issues = [issue('DOCX_SOURCE_DOCUMENT_INVALID', 'The immutable source bytes cannot be derived by the trusted DOCX adapter')]
  }
  const body = candidateBody({
    sourceBytes: immutableBytes,
    sourceDigest,
    operatorChoices,
    interpretation: derivedSource || null,
    issues,
  })
  return {
    candidate: {
      ...body,
      candidateDigest: digestJson(body),
      sourceBytes: immutableBytes,
    },
    compilation,
  }
}

/**
 * The only import entrypoint: source bytes are the semantic authority. Caller
 * choices may name the source but cannot supply questions, answers, groups, or
 * a profile.
 */
export function importCanonicalCandidate(sourceBytes, operatorChoices) {
  if (!(sourceBytes instanceof Uint8Array) || sourceBytes.byteLength === 0) {
    return { candidate: null, issues: [issue('SOURCE_BYTES_REQUIRED', 'Import Candidate requires immutable non-empty DOCX source bytes')] }
  }
  const normalizedChoices = normalizeOperatorChoices(operatorChoices)
  if (!normalizedChoices) {
    return { candidate: null, issues: [issue('CALLER_SEMANTICS_REJECTED', 'Operator choices may contain only the source originalName')] }
  }
  const result = candidateFromBytes(sourceBytes, normalizedChoices)
  return { candidate: result.candidate, issues: result.candidate.issues }
}

/**
 * Re-derives the candidate from its exact bytes before honoring a teacher's
 * bounded confirmation. It either returns one complete Canonical Paper or no
 * paper and unresolved issues.
 */
export function confirmCanonicalCandidate(candidate, teacherConfirmation) {
  if (!exactKeys(teacherConfirmation, ['schemaVersion', 'candidateDigest', 'sourceDigest', 'confirmed']) || teacherConfirmation.schemaVersion !== confirmationSchemaVersion) {
    return { unresolvedIssues: [issue('CALLER_SEMANTICS_REJECTED', 'Teacher Confirmation may bind only the candidate digest, source digest, and explicit confirmation')] }
  }
  if (!isCandidateShape(candidate)) {
    return { unresolvedIssues: [issue('CANDIDATE_REQUIRED', 'Teacher Confirmation requires one trusted Import Candidate')] }
  }
  if (candidate.candidateDigest !== digestJson(suppliedCandidateBody(candidate))) {
    return { unresolvedIssues: [issue('CANDIDATE_BINDING_MISMATCH', 'Teacher Confirmation candidate digest does not bind the supplied candidate')] }
  }
  const rerun = candidateFromBytes(candidate.sourceBytes, candidate.operatorChoices)
  if (candidate.candidateDigest !== rerun.candidate.candidateDigest) {
    return { unresolvedIssues: [issue('CANDIDATE_BINDING_MISMATCH', 'Teacher Confirmation candidate does not match a fresh trusted derivation')] }
  }
  if (teacherConfirmation.candidateDigest !== rerun.candidate.candidateDigest) {
    return { unresolvedIssues: [issue('CONFIRMATION_CANDIDATE_MISMATCH', 'Teacher Confirmation must bind the exact Import Candidate digest')] }
  }
  if (teacherConfirmation.sourceDigest !== rerun.candidate.source.sha256) {
    return { unresolvedIssues: [issue('CONFIRMATION_SOURCE_MISMATCH', 'Teacher Confirmation must bind the exact immutable source digest')] }
  }
  if (teacherConfirmation.confirmed !== true) {
    return { unresolvedIssues: [issue('TEACHER_CONFIRMATION_REQUIRED', 'A teacher must explicitly confirm the exact Import Candidate')] }
  }
  if (rerun.candidate.issues.length > 0 || !rerun.compilation?.artifacts?.canonicalPaper) {
    return {
      unresolvedIssues: rerun.candidate.issues.length > 0
        ? rerun.candidate.issues
        : [issue('CANONICAL_DERIVATION_INCOMPLETE', 'The confirmed candidate did not produce one complete Canonical Paper')],
    }
  }
  return {
    canonicalPaper: rerun.compilation.artifacts.canonicalPaper,
    confirmation: {
      schemaVersion: confirmationSchemaVersion,
      candidateDigest: rerun.candidate.candidateDigest,
      sourceDigest: rerun.candidate.source.sha256,
    },
  }
}
