import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
} from '../../server/paper-import/nck1ImageSourceBundle.mjs'
import {
  digestJson,
  sha256,
} from '../../shared/paper-canonical/stable.mjs'

export const NCK1_SOURCE_ONLY_CAPTURE_SCHEMA_VERSION =
  'universal-nck1-source-only-capture-v1'
export const NCK1_SOURCE_ONLY_SUCCESSOR_SCHEMA_VERSION =
  'universal-nck1-source-only-successor-v1'
export const NCK1_SOURCE_ONLY_STATE = 'awaiting_authoritative_answers'
export const NCK1_AUTHORITATIVE_ANSWERS_AWAITED =
  'NCK1_AUTHORITATIVE_ANSWERS_AWAITED'
export const NCK1_SOURCE_ONLY_MATERIALIZATION_FORBIDDEN =
  'NCK1_SOURCE_ONLY_MATERIALIZATION_FORBIDDEN'
export const NCK1_SOURCE_ONLY_PUBLICATION_FORBIDDEN =
  'NCK1_SOURCE_ONLY_PUBLICATION_FORBIDDEN'
export const NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH =
  'NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH'
export const NCK1_ANSWER_ATTACHMENT_DUPLICATE =
  'NCK1_ANSWER_ATTACHMENT_DUPLICATE'

const root = path.resolve(import.meta.dirname, '../..')
export const nck1SourceOnlyRoot = path.join(root, 'imports', 'source-only')

function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export function validNck1SourceSetId(sourceSetId) {
  return /^source-set-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(sourceSetId || '')
}

export function nck1SourceOnlyDirectory(sourceSetId) {
  if (!validNck1SourceSetId(sourceSetId)) {
    throw codedError(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      'source-only intake requires a valid sourceSetId beginning with source-set-',
    )
  }
  return path.join(nck1SourceOnlyRoot, sourceSetId)
}

function artifactPath(directory, relativePath) {
  const resolved = path.resolve(directory, relativePath || '')
  if (!relativePath || !resolved.startsWith(`${path.resolve(directory)}${path.sep}`)) {
    throw codedError(
      NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
      'Source-only capture contains an unsafe artifact path',
    )
  }
  return resolved
}

function sourceDocumentIdentity(document) {
  return {
    documentId: document.documentId,
    role: document.role,
    mediaType: document.mediaType,
    sha256: document.sha256,
    byteLength: document.byteLength,
    pageCount: document.pageCount,
    ...(document.pages ? {
      pages: document.pages.map((page) => ({
        page: page.page,
        mediaType: page.mediaType,
        sha256: page.sha256,
        byteLength: page.byteLength,
        pixelWidth: page.pixelWidth,
        pixelHeight: page.pixelHeight,
      })),
    } : {}),
  }
}

export function nck1QuestionSetDigest(documents) {
  return digestJson(documents
    .filter((document) => document.role === 'question_source' && !document.renditionOf)
    .map(sourceDocumentIdentity))
}

export function makeNck1SourceOnlyCapture({
  sourceSetId,
  provenance,
  documents,
  capturedAt = new Date().toISOString(),
  environmentDigest,
}) {
  if (!validNck1SourceSetId(sourceSetId)) {
    throw codedError(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      'source-only intake requires a valid sourceSetId beginning with source-set-',
    )
  }
  const primaryDocuments = documents.filter((document) => !document.renditionOf)
  if (
    primaryDocuments.length === 0
    || primaryDocuments.some((document) => document.role !== 'question_source')
  ) {
    throw codedError(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      'A source-only capture may contain question_source documents only',
    )
  }
  const capture = {
    schemaVersion: NCK1_SOURCE_ONLY_CAPTURE_SCHEMA_VERSION,
    sourceSetId,
    profileId: 'nck1',
    state: NCK1_SOURCE_ONLY_STATE,
    reasonCode: NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
    provenance,
    capturedAt,
    environmentDigest,
    questionSetDigest: nck1QuestionSetDigest(documents),
    documents,
  }
  return { ...capture, captureDigest: digestJson(capture) }
}

function parseJson(filePath, label, code = NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    throw codedError(code, `${label} is missing or invalid`)
  }
}

function verifyCapturedArtifacts(directory, capture) {
  for (const document of capture.documents) {
    const documentPath = artifactPath(directory, document.path)
    if (!existsSync(documentPath)) {
      throw codedError(
        NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
        `Captured question artifact is missing: ${document.documentId}`,
      )
    }
    const bytes = new Uint8Array(readFileSync(documentPath))
    if (bytes.byteLength !== document.byteLength || sha256(bytes) !== document.sha256) {
      throw codedError(
        NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
        `Captured question artifact changed: ${document.documentId}`,
      )
    }
    if (document.mediaType !== NCK1_IMAGE_BUNDLE_MEDIA_TYPE) continue
    const pageArtifacts = (document.pages || []).map((page) => {
      const pagePath = artifactPath(directory, page.path)
      if (!existsSync(pagePath)) {
        throw codedError(
          NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
          `Captured question page is missing: ${document.documentId}:${page.page}`,
        )
      }
      return { ...page, bytes: new Uint8Array(readFileSync(pagePath)) }
    })
    try {
      assertNck1ImageBundlePageArtifacts({ ...document, bytes }, pageArtifacts)
    } catch (error) {
      throw codedError(
        NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
        `Captured question image bundle changed: ${error.message}`,
      )
    }
  }
}

function readSuccessor(directory, capture) {
  const successorPath = path.join(directory, 'successor.json')
  if (!existsSync(successorPath)) return null
  const successor = parseJson(successorPath, 'Source-only successor receipt')
  const { successorDigest, ...identity } = successor
  if (
    successor.schemaVersion !== NCK1_SOURCE_ONLY_SUCCESSOR_SCHEMA_VERSION
    || successor.sourceSetId !== capture.sourceSetId
    || successor.captureDigest !== capture.captureDigest
    || successor.questionSetDigest !== capture.questionSetDigest
    || successorDigest !== digestJson(identity)
  ) {
    throw codedError(
      NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
      'Source-only successor receipt no longer matches its immutable capture',
    )
  }
  return successor
}

export function nck1SourceOnlyExists(sourceSetId) {
  return validNck1SourceSetId(sourceSetId)
    && existsSync(path.join(nck1SourceOnlyRoot, sourceSetId, 'capture.json'))
}

export function readNck1SourceOnlyCapture(sourceSetId) {
  const directory = nck1SourceOnlyDirectory(sourceSetId)
  const capture = parseJson(
    path.join(directory, 'capture.json'),
    `Source-only capture ${sourceSetId}`,
  )
  const { captureDigest, ...identity } = capture
  if (
    capture.schemaVersion !== NCK1_SOURCE_ONLY_CAPTURE_SCHEMA_VERSION
    || capture.sourceSetId !== sourceSetId
    || capture.state !== NCK1_SOURCE_ONLY_STATE
    || capture.reasonCode !== NCK1_AUTHORITATIVE_ANSWERS_AWAITED
    || captureDigest !== digestJson(identity)
    || capture.questionSetDigest !== nck1QuestionSetDigest(capture.documents || [])
  ) {
    throw codedError(
      NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
      `Source-only capture identity mismatch: ${sourceSetId}`,
    )
  }
  verifyCapturedArtifacts(directory, capture)
  return {
    directory,
    capture,
    successor: readSuccessor(directory, capture),
  }
}

export function writeNck1SourceOnlyCapture(directory, capture) {
  const targetPath = path.join(directory, 'capture.json')
  if (existsSync(targetPath)) {
    throw codedError(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      `Source-only capture already exists: ${capture.sourceSetId}`,
    )
  }
  mkdirSync(directory, { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${process.pid}`
  writeFileSync(temporaryPath, `${JSON.stringify(capture, null, 2)}\n`)
  renameSync(temporaryPath, targetPath)
  return targetPath
}

export function writeNck1SourceOnlySuccessor({
  context,
  paperId,
  completeManifestSha256,
  answerProvenance,
  answerDocuments,
  attachedAt = new Date().toISOString(),
}) {
  if (context.successor || existsSync(path.join(context.directory, 'successor.json'))) {
    throw codedError(
      NCK1_ANSWER_ATTACHMENT_DUPLICATE,
      `Authoritative answers were already attached to ${context.capture.sourceSetId}`,
    )
  }
  const receipt = {
    schemaVersion: NCK1_SOURCE_ONLY_SUCCESSOR_SCHEMA_VERSION,
    sourceSetId: context.capture.sourceSetId,
    captureDigest: context.capture.captureDigest,
    questionSetDigest: context.capture.questionSetDigest,
    attachedAt,
    answerProvenance,
    answerDocuments: answerDocuments.map(sourceDocumentIdentity),
    completeSourceSet: {
      paperId,
      universalSourceManifestSha256: completeManifestSha256,
    },
  }
  const successor = { ...receipt, successorDigest: digestJson(receipt) }
  const targetPath = path.join(context.directory, 'successor.json')
  const temporaryPath = `${targetPath}.tmp-${process.pid}`
  writeFileSync(temporaryPath, `${JSON.stringify(successor, null, 2)}\n`)
  renameSync(temporaryPath, targetPath)
  return successor
}

export function listNck1SourceOnlyCaptures() {
  if (!existsSync(nck1SourceOnlyRoot)) return []
  return readdirSync(nck1SourceOnlyRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && validNck1SourceSetId(entry.name))
    .map((entry) => readNck1SourceOnlyCapture(entry.name))
    .map(({ capture, successor }) => ({
      sourceSetId: capture.sourceSetId,
      paperName: capture.provenance.paperName,
      capturedAt: capture.capturedAt,
      state: capture.state,
      reasonCode: capture.reasonCode,
      questionSetDigest: capture.questionSetDigest,
      lifecycleState: successor
        ? 'complete_source_set_created'
        : NCK1_SOURCE_ONLY_STATE,
      successorPaperId: successor?.completeSourceSet.paperId || null,
    }))
    .sort((left, right) => left.sourceSetId.localeCompare(right.sourceSetId))
}

export function assertNotNck1SourceOnly(sourceSetId, operation) {
  if (!nck1SourceOnlyExists(sourceSetId)) return
  const publicationOperation = operation === 'publish'
  const materializationOperation = [
    'materialize',
    'verify',
    'build',
  ].includes(operation)
  const code = publicationOperation
    ? NCK1_SOURCE_ONLY_PUBLICATION_FORBIDDEN
    : materializationOperation
      ? NCK1_SOURCE_ONLY_MATERIALIZATION_FORBIDDEN
      : NCK1_AUTHORITATIVE_ANSWERS_AWAITED
  throw codedError(
    code,
    publicationOperation
      ? `${sourceSetId} cannot be published; use its complete successor after answers are attached`
      : materializationOperation
        ? `${sourceSetId} cannot create Materialization or a Candidate before authoritative answers are attached`
        : `${sourceSetId} is awaiting authoritative answers and cannot enter Import Review`,
  )
}
