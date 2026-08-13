import {
  trustedDocxCandidateAuthorityRef,
} from '../../shared/paper-canonical/authority.mjs'
import {
  confirmCanonicalCandidate,
  importDocxPairCanonicalCandidate,
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
  DOCX_PAIR_IDENTITY_MEDIA_TYPE,
  DOCX_PAIR_IDENTITY_SCHEMA_VERSION,
  DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
  isReservedNck1ExamPaperId,
} from './docxSourceAdapter.mjs'
import {
  TEACHER_CONFIRMATION_MEDIA_TYPE,
  TEACHER_CONFIRMATION_SCHEMA_VERSION,
} from './trustedDocxCanonicalRequest.mjs'

export const DOCX_PAIR_QUESTION_FILE_NAME = '01-question.docx'
export const DOCX_PAIR_ANSWERS_FILE_NAME = '02-answers.docx'
export const DOCX_PAIR_IDENTITY_FILE_NAME = '03-docx-pair-identity.json'
export const DOCX_PAIR_ENVELOPE_FILE_NAME = '04-docx-source-envelope.json'
export const DOCX_PAIR_CONFIRMATION_FILE_NAME = '05-teacher-confirmation-v1.json'
export const DOCX_PAIR_REQUEST_FILE_NAME = 'canonical-import-request.json'

const liveDocxPairProofs = new WeakMap()
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
      'DOCX_PAIR_REQUEST_INVALID',
      `DOCX pair request requires exactly one ${label}`,
    )
  }
  return matches[0]
}

function parseTeacherConfirmation(bytes) {
  const raw = asUint8Array(bytes)
  if (!raw) {
    throw requestError(
      'DOCX_PAIR_CONFIRMATION_INVALID',
      'Teacher Confirmation bytes are missing',
    )
  }
  let parsed
  try {
    parsed = JSON.parse(new TextDecoder().decode(raw))
  } catch (error) {
    throw requestError(
      'DOCX_PAIR_CONFIRMATION_INVALID',
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
      'DOCX_PAIR_CONFIRMATION_INVALID',
      'Teacher Confirmation must bind only schemaVersion, candidateDigest, sourceDigest, and confirmed',
    )
  }
  return parsed
}

export function isDocxPairCanonicalImportRequest(request) {
  if (!sameAuthority(request?.authority, trustedDocxCandidateAuthorityRef)) {
    return false
  }
  const documents = request?.evidence?.documents
  if (!Array.isArray(documents) || documents.length === 0) return false
  const question = documents.filter((document) => document.inputKey === 'question_docx')
  const answers = documents.filter((document) => document.inputKey === 'official_answer_docx')
  const identity = documents.filter((document) => document.inputKey === 'docx_pair_identity')
  const envelope = documents.filter((document) =>
    documentMediaType(document) === DOCX_SOURCE_ENVELOPE_MEDIA_TYPE)
  const confirmation = documents.filter((document) =>
    document.inputKey === 'teacher_confirmation')
  return question.length === 1
    && answers.length === 1
    && identity.length === 1
    && envelope.length === 1
    && confirmation.length === 1
    && question[0].bytes instanceof Uint8Array
    && answers[0].bytes instanceof Uint8Array
    && identity[0].bytes instanceof Uint8Array
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
 * Derive a loadable format ③ canonical import request from 试题 + 答案解析
 * DOCX bytes. Identity is the required owner paperId. The Canonical Paper is
 * never written as an input.
 */
export function materializeDocxPairCanonicalRequest(questionBytes, answersBytes, {
  questionOriginalName = 'paper.docx',
  answersOriginalName = 'answers.docx',
  expectedPaperId,
} = {}) {
  const question = asUint8Array(questionBytes)
  const answers = asUint8Array(answersBytes)
  if (!question || question.byteLength === 0 || !answers || answers.byteLength === 0) {
    throw requestError(
      'DOCX_PAIR_SOURCE_REQUIRED',
      'Format ③ canonical producer requires immutable question and answer DOCX bytes',
    )
  }
  if (typeof expectedPaperId !== 'string' || expectedPaperId.length === 0) {
    throw requestError(
      'DOCX_PAIR_PAPER_ID_REQUIRED',
      'Format ③ canonical producer requires --expected-paper-id',
    )
  }
  if (isReservedNck1ExamPaperId(expectedPaperId)) {
    throw requestError(
      'DOCX_PAIR_PAPER_ID_RESERVED',
      `Format ③ must not occupy reserved NCK1 exam id ${expectedPaperId}`,
    )
  }
  if (
    typeof questionOriginalName !== 'string'
    || questionOriginalName.length === 0
    || typeof answersOriginalName !== 'string'
    || answersOriginalName.length === 0
  ) {
    throw requestError(
      'DOCX_PAIR_SOURCE_NAME_INVALID',
      'Format ③ canonical producer requires question and answer originalNames',
    )
  }
  const imported = importDocxPairCanonicalCandidate(question, answers, {
    questionOriginalName,
    answersOriginalName,
    paperId: expectedPaperId,
  })
  if (!imported.candidate || imported.issues.length > 0) {
    const first = imported.issues[0]
    throw requestError(
      first?.code || 'DOCX_SOURCE_DOCUMENT_INVALID',
      first?.message || 'DOCX pair candidate derivation failed',
    )
  }
  const paperId = imported.candidate.interpretation?.paperId
  if (paperId !== expectedPaperId) {
    throw requestError(
      'DOCX_PAIR_PAPER_ID_MISMATCH',
      `DOCX pair identity ${paperId} differs from expected ${expectedPaperId}`,
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
  const questionDocument = {
    inputKey: 'question_docx',
    mediaType: DOCX_MEDIA_TYPE,
    sha256: sha256(question),
    byteLength: question.byteLength,
  }
  const identity = {
    schemaVersion: DOCX_PAIR_IDENTITY_SCHEMA_VERSION,
    paperId: expectedPaperId,
    profileId: 'nck1',
  }
  const envelope = {
    schemaVersion: 'docx-source-envelope-v2',
    sourceDocument: questionDocument,
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
          inputKey: 'question_docx',
          roles: ['question_source', 'source_provenance'],
          declared: {
            mediaType: DOCX_MEDIA_TYPE,
            originalName: questionOriginalName,
          },
          path: DOCX_PAIR_QUESTION_FILE_NAME,
        },
        {
          inputKey: 'official_answer_docx',
          roles: ['official_answer_source'],
          declared: {
            mediaType: DOCX_MEDIA_TYPE,
            originalName: answersOriginalName,
          },
          path: DOCX_PAIR_ANSWERS_FILE_NAME,
        },
        {
          inputKey: 'docx_pair_identity',
          roles: ['operator_assertions'],
          declared: {
            mediaType: DOCX_PAIR_IDENTITY_MEDIA_TYPE,
            originalName: 'docx-pair-identity.json',
          },
          path: DOCX_PAIR_IDENTITY_FILE_NAME,
        },
        {
          inputKey: 'docx_source_envelope',
          roles: ['operator_assertions'],
          declared: {
            mediaType: DOCX_SOURCE_ENVELOPE_MEDIA_TYPE,
            originalName: 'docx-source-envelope.json',
          },
          path: DOCX_PAIR_ENVELOPE_FILE_NAME,
        },
        {
          inputKey: 'teacher_confirmation',
          roles: ['operator_assertions'],
          declared: {
            mediaType: TEACHER_CONFIRMATION_MEDIA_TYPE,
            originalName: 'teacher-confirmation-v1.json',
          },
          path: DOCX_PAIR_CONFIRMATION_FILE_NAME,
        },
      ],
    },
  }
  return {
    paperId,
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    outputs: new Map([
      [DOCX_PAIR_QUESTION_FILE_NAME, Buffer.from(question)],
      [DOCX_PAIR_ANSWERS_FILE_NAME, Buffer.from(answers)],
      [DOCX_PAIR_IDENTITY_FILE_NAME, Buffer.from(jsonBytes(identity))],
      [DOCX_PAIR_ENVELOPE_FILE_NAME, Buffer.from(jsonBytes(envelope))],
      [DOCX_PAIR_CONFIRMATION_FILE_NAME, Buffer.from(confirmationBytes(confirmation))],
      [DOCX_PAIR_REQUEST_FILE_NAME, Buffer.from(jsonBytes(request))],
    ]),
  }
}

export function compileDocxPairCanonicalImportRequest(request) {
  if (!isDocxPairCanonicalImportRequest(request)) {
    throw requestError(
      'DOCX_PAIR_REQUEST_INVALID',
      'DOCX pair admission requires v37 authority, question DOCX, answer DOCX, identity, envelope, and Teacher Confirmation',
    )
  }
  const documents = request.evidence.documents
  const question = findUniqueDocument(
    documents,
    (document) => document.inputKey === 'question_docx',
    'question_docx document',
  )
  const answers = findUniqueDocument(
    documents,
    (document) => document.inputKey === 'official_answer_docx',
    'official_answer_docx document',
  )
  const identityDocument = findUniqueDocument(
    documents,
    (document) => document.inputKey === 'docx_pair_identity',
    'docx_pair_identity document',
  )
  const confirmationDocument = findUniqueDocument(
    documents,
    (document) => document.inputKey === 'teacher_confirmation',
    'teacher_confirmation document',
  )
  const questionSource = asUint8Array(question.bytes)
  const answersSource = asUint8Array(answers.bytes)
  if (!questionSource || !answersSource) {
    throw requestError(
      'DOCX_PAIR_SOURCE_REQUIRED',
      'DOCX pair request question or answer bytes are missing',
    )
  }
  let identity
  try {
    identity = JSON.parse(new TextDecoder().decode(identityDocument.bytes))
  } catch (error) {
    throw requestError(
      'DOCX_PAIR_IDENTITY_INVALID',
      `DOCX pair identity is unreadable: ${error.message}`,
    )
  }
  const questionOriginalName = typeof question.declared?.originalName === 'string'
    && question.declared.originalName.length > 0
    ? question.declared.originalName
    : 'paper.docx'
  const answersOriginalName = typeof answers.declared?.originalName === 'string'
    && answers.declared.originalName.length > 0
    ? answers.declared.originalName
    : 'answers.docx'
  const imported = importDocxPairCanonicalCandidate(questionSource, answersSource, {
    questionOriginalName,
    answersOriginalName,
    paperId: identity.paperId,
  })
  if (!imported.candidate || imported.issues.length > 0) {
    const first = imported.issues[0]
    throw requestError(
      first?.code || 'DOCX_SOURCE_DOCUMENT_INVALID',
      first?.message || 'DOCX pair candidate derivation failed',
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
    questionBytes: questionSource,
    answersBytes: answersSource,
  }
}

export function admitLiveConfirmedDocxPairImport(request) {
  const compiled = compileDocxPairCanonicalImportRequest(request)
  const identity = Object.freeze({
    paperId: compiled.candidate.interpretation.paperId,
    authority: Object.freeze({ ...trustedDocxCandidateAuthorityRef }),
    candidateDigest: compiled.candidate.candidateDigest,
    sourceDigest: compiled.candidate.source.sha256,
  })
  const proof = Object.freeze({})
  liveDocxPairProofs.set(proof, Object.freeze({
    compilation: compiled.compilation,
    sourceAssetDigest: sha256(compiled.questionBytes),
    identity,
    snapshotDigest: proofSnapshotDigest({
      compilation: compiled.compilation,
      sourceAsset: compiled.questionBytes,
      identity,
    }),
  }))
  return {
    compilation: compiled.compilation,
    sourceAsset: compiled.questionBytes,
    proof,
    identity,
  }
}

export function isLiveConfirmedDocxPairAdmission({
  proof,
  compilation,
  sourceAsset,
}) {
  const admitted = liveDocxPairProofs.get(proof)
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

export function docxPairPublicationSourceAsset(request, fallbackBytes) {
  if (!isDocxPairCanonicalImportRequest(request)) {
    return fallbackBytes instanceof Uint8Array ? fallbackBytes : null
  }
  const source = request.evidence.documents.find(
    (document) => document.inputKey === 'question_docx',
  )
  return asUint8Array(source?.bytes)
}
