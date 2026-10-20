import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { MEDIA_AI_CONFIRMATION_CHECKS } from '../../shared/paper-canonical/mediaPresentation.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { PAPER_PDF_EDITIONS } from '../../shared/paperPdfProducts.mjs'
import { LISTENING_AUDIO_PATHS } from '../paper-import/listeningAudioEvidence.mjs'
import { reviewedPlaybackSegments } from '../paper-import/listeningReview.mjs'
import { nck1OcrSourceSetDigest } from '../paper-import/nck1OcrSourceEvidence.mjs'
import { assertPaperStorageMounted } from '../paper-import/paperStorageMount.mjs'
import { reviewUploadMetrics } from './reviewUploadMetrics.mjs'
import { acquireRevisionUpload, tryRevisionFinalization } from './reviewUploadLocks.mjs'
import { finalizeInventory, ocrConfirmationComputation } from './finalizeComputation.mjs'
import { restoreFinalizeError, runFinalizeWorker } from './runFinalizeWorker.mjs'
import {
  buildImportReviewProjection,
  resolveReviewFile,
} from './revisionProjection.mjs'

const PAPER_ID = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHA256 = /^sha256:[a-f0-9]{64}$/
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024
const MAX_FILES = 200
const SURFACES = new Set(['paper', 'screen', 'student_print', 'teacher_print', 'pdf', 'source'])
const UNRESOLVED_ISSUE_STATES = new Set(['open', 'fixed_pending_review'])
const liveExternalListeningReviewProofs = new WeakMap()

export function externalListeningReviewProofIdentity(proof) {
  return liveExternalListeningReviewProofs.get(proof) || null
}

function storeError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function matchesMaterializedOcrText(text, entry, materialization, followingText) {
  if (text === entry.after) return true
  const pointer = entry.materializationTarget.jsonPointer
  const stemTarget = /^\/(?:listening|groups\/(\d+))\/questions\/(\d+)\/stem$/.exec(pointer)
  if (stemTarget) {
    const question = stemTarget[1] === undefined
      ? materialization.listening?.questions?.[stemTarget[2]]
      : materialization.groups?.[stemTarget[1]]?.questions?.[stemTarget[2]]
    const number = question?.sourceNumber ?? question?.canonicalNumber
    // A number moved to its structural field is not an OCR text edit.
    return Number.isInteger(number) && number > 0
      && question.stem === entry.after
      && question.source?.documentId === entry.sourceLocator.documentId
      && question.source?.page === entry.sourceLocator.page
      && text === `${number}. ${entry.after}`
  }
  const tableTarget = /^\/groups\/(\d+)\/blocks\/(\d+)\/rows\/(\d+)\/cells\/(\d+)\/content\/(\d+)\/text$/.exec(pointer)
  if (!tableTarget || typeof text !== 'string' || text.endsWith('\n')) return false
  const [, group, blockIndex, row, cell, run] = tableTarget
  const block = materialization.groups?.[group]?.blocks?.[blockIndex]
  const content = block?.rows?.[row]?.cells?.[cell]?.content
  const current = content?.[run]
  const following = content?.[Number(run) + 1]
  // Prove a separator between two complete, consecutive confirmed source
  // items in the same table cell; never trim arbitrary field whitespace.
  return block?.kind === 'table'
    && block.source?.documentId === entry.sourceLocator.documentId
    && block.source?.page === entry.sourceLocator.page
    && current?.kind === 'text' && current.text === entry.after
    && following?.kind === 'text' && typeof followingText === 'string' && followingText.length > 0
    && following.text === followingText
    && entry.after === `${text}\n`
}

export function validateAgentOcrCorrectionReceipt(report, receipt, materialization) {
  if (receipt?.paperId !== report.paperId
    || receipt?.revisionId !== report.ocrRevisionId
    || receipt?.confirmationId !== report.ocrConfirmationId
    || receipt?.reviewerKind !== 'import_agent'
    || receipt?.sourceSetDigest !== report.originalSourceSetDigest
    || receipt?.evidenceDigest !== report.ocrEvidenceDigest
    || receipt?.correctionReport?.sourceSetDigest !== report.originalSourceSetDigest) {
    throw storeError('IMPORT_REVIEW_OCR_CORRECTION_RECEIPT_INVALID', 'Report does not match the exact server-held OCR receipt and original sources')
  }
  const confirmedItems = new Map(receipt.confirmation.documents.flatMap((document) =>
    document.pages.flatMap((page) => page.orderedItems.map((item, index) =>
      [item.itemId, { ...item, documentId: document.documentId, page: page.page,
        followingText: page.orderedItems[index + 1]?.text }]))))
  const ocrNotes = new Map(receipt.correctionReport.entries.map((entry) => [entry.itemId, entry]))
  for (const entry of report.entries) {
    const confirmed = confirmedItems.get(entry.ocrItemId)
    const note = ocrNotes.get(entry.ocrItemId)
    if (!confirmed || confirmed.documentId !== entry.sourceLocator.documentId
      || confirmed.page !== entry.sourceLocator.page
      || (entry.category === 'ocr_misrecognition'
        ? (!note || note.ocrText !== entry.before
          || !matchesMaterializedOcrText(note.correctedText, entry, materialization, confirmed.followingText))
        : entry.before !== (note?.sourceText || confirmed.text))) {
      throw storeError('IMPORT_REVIEW_OCR_CORRECTION_RECEIPT_INVALID', 'Report entry does not match its exact historical OCR item')
    }
  }
  return report
}

function requiredString(value, label, maxLength = 500) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength) {
    throw storeError('IMPORT_REVIEW_INPUT_INVALID', `${label} is required`, 400)
  }
  return text
}

function optionalString(value, maxLength = 500) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > maxLength) {
    throw storeError('IMPORT_REVIEW_INPUT_INVALID', 'Input is too long', 400)
  }
  return text || null
}

function validRelativePath(value) {
  return (
    typeof value === 'string'
    && value.length > 0
    && value.length <= 500
    && !value.includes('\\')
    && !path.posix.isAbsolute(value)
    && path.posix.normalize(value) === value
    && value.split('/').every((segment) => segment && segment !== '.' && segment !== '..')
  )
}

function nowIso() {
  return new Date().toISOString()
}

function sha256Bytes(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function mintLiveExternalListeningReviewProof({ approval, revision, projection }) {
  const review = approval.externalListeningReview
  const audio = projection.listeningReview.audio
  const audioBytes = projection.listeningAudioBytes
  const v1 = review?.schemaVersion === 'external-listening-owner-review-v1'
  const v2 = review?.schemaVersion === 'external-listening-owner-review-v2'
  const exactReview = review
    && Object.keys(review).sort().join(',') === [
      'audio',
      'reviewMethod',
      'reviewedAt',
      'reviewedBy',
      'schemaVersion',
      'scope',
      ...(v1 ? ['actualAudioContentSuitableAndSafe', 'allSegmentsQuestionsAnswersBelongTogether', 'playbackMatchesSuppliedTranscript'] : []),
    ].sort().join(',')
    && ((v1 && review.reviewMethod === 'owner_playback_against_supplied_transcript'
      && review.playbackMatchesSuppliedTranscript === true
      && review.allSegmentsQuestionsAnswersBelongTogether === true
      && review.actualAudioContentSuitableAndSafe === true)
      || (v2 && review.reviewMethod === 'owner_screen_pdf_approval'))
    && Object.keys(review.scope || {}).sort().join(',')
      === 'answerCount,questionCount,transcriptSegmentCount'
    && Object.keys(review.audio || {}).sort().join(',')
      === 'byteLength,durationSeconds,mediaType,sha256'
  if (
    !exactReview
    || approval.revisionId !== revision.id
    || approval.paperId !== revision.paperId
    || approval.sourceDigest !== revision.sourceDigest
    || approval.candidateDigest !== revision.candidateDigest
    || approval.visibleStructureDigest !== revision.visibleStructureDigest
    || approval.analysisDigest !== revision.manifest.analysisDigest
    || approval.bundleDigest !== revision.bundleDigest
    || approval.rendererBuildId !== revision.rendererBuildId
    || review.reviewedAt !== approval.approvedAt
    || review.reviewedBy !== approval.approvedBy
    || projection.sourceProvenance?.kind !== 'external_analyzed_package'
    || !['pending_external_playback_review', 'included_in_candidate_review'].includes(audio.state)
    || !(audioBytes instanceof Uint8Array)
    || review.audio.sha256 !== audio.playbackAudioSha256
    || review.audio.sha256 !== sha256Bytes(audioBytes)
    || review.audio.byteLength !== audioBytes.byteLength
    || review.audio.mediaType !== audio.mediaType
    || review.audio.durationSeconds !== audio.durationSeconds
    || review.scope.transcriptSegmentCount !== projection.materialization.listening.transcript.length
    || review.scope.questionCount !== projection.materialization.listening.questions.length
    || review.scope.answerCount !== projection.materialization.listening.answers.length
  ) {
    throw storeError(
      'IMPORT_REVIEW_EXTERNAL_LISTENING_PROOF_INVALID',
      'External Listening proof requires the exact persisted Owner review and audio binding',
    )
  }
  const identity = Object.freeze({
    paperId: revision.paperId,
    revisionId: revision.id,
    approvalId: approval.approvalId,
    sourceDigest: revision.sourceDigest,
    candidateDigest: revision.candidateDigest,
    visibleStructureDigest: revision.visibleStructureDigest,
    analysisDigest: revision.manifest.analysisDigest,
    bundleDigest: revision.bundleDigest,
    audioSha256: review.audio.sha256,
    audioByteLength: review.audio.byteLength,
  })
  const proof = Object.freeze({})
  liveExternalListeningReviewProofs.set(proof, identity)
  return proof
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || !value) return fallback
  return JSON.parse(value)
}

function fileDescriptor(file) {
  if (!validRelativePath(file?.path)) {
    throw storeError('IMPORT_REVIEW_PATH_INVALID', 'Review bundle file path is invalid', 400)
  }
  if (!SHA256.test(file?.sha256 || '')) {
    throw storeError('IMPORT_REVIEW_DIGEST_INVALID', `Invalid SHA-256 for ${file.path}`, 400)
  }
  const byteLength = Number(file.byteLength)
  if (!Number.isInteger(byteLength) || byteLength < 0 || byteLength > MAX_FILE_BYTES) {
    throw storeError('IMPORT_REVIEW_SIZE_INVALID', `Invalid byteLength for ${file.path}`, 400)
  }
  return {
    path: file.path,
    sha256: file.sha256,
    byteLength,
    mediaType: requiredString(file.mediaType, `mediaType for ${file.path}`, 200),
    role: requiredString(file.role, `role for ${file.path}`, 100),
  }
}

export function reviewBundleDigest(input) {
  return digestJson({
    schemaVersion: input.schemaVersion,
    paperId: input.paperId,
    paperName: input.paperName,
    ...(input.expectedBaseRevisionId
      ? { expectedBaseRevisionId: input.expectedBaseRevisionId }
      : {}),
    sourceDigest: input.sourceDigest,
    candidateDigest: input.candidateDigest,
    visibleStructureDigest: input.visibleStructureDigest,
    ...(input.analysisDigest ? { analysisDigest: input.analysisDigest } : {}),
    ...(input.importProfile ? { importProfile: input.importProfile } : {}),
    ...(input.paragraphSummariesDigest
      ? { paragraphSummariesDigest: input.paragraphSummariesDigest }
      : {}),
    ...(input.publicSearchMetadataDigest
      ? { publicSearchMetadataDigest: input.publicSearchMetadataDigest }
      : {}),
    ...(input.ocrCorrectionReportDigest
      ? { ocrCorrectionReportVersion: input.ocrCorrectionReportVersion, ocrCorrectionReportDigest: input.ocrCorrectionReportDigest }
      : {}),
    producerBuildId: input.producerBuildId,
    files: input.files.map(fileDescriptor).sort((a, b) => a.path.localeCompare(b.path)),
  })
}

export function ocrReviewBundleDigest(input) {
  return digestJson({
    schemaVersion: input.schemaVersion,
    paperId: input.paperId,
    paperName: input.paperName,
    sourceSetDigest: input.sourceSetDigest,
    evidenceDigest: input.evidenceDigest,
    reviewStructureDigest: input.reviewStructureDigest,
    producerBuildId: input.producerBuildId,
    files: input.files.map(fileDescriptor).sort((a, b) => a.path.localeCompare(b.path)),
  })
}

export function validateReviewBundleManifest(input) {
  if (!['web-import-review-bundle-v1', 'web-import-review-bundle-v2', 'web-import-review-bundle-v3'].includes(input?.schemaVersion)) {
    throw storeError('IMPORT_REVIEW_SCHEMA_INVALID', 'Unsupported review bundle schema', 400)
  }
  const paperId = requiredString(input.paperId, 'paperId', 160)
  if (!PAPER_ID.test(paperId)) {
    throw storeError('IMPORT_REVIEW_INPUT_INVALID', 'paperId is invalid', 400)
  }
  const files = Array.isArray(input.files) ? input.files.map(fileDescriptor) : []
  if (files.length === 0 || files.length > MAX_FILES) {
    throw storeError('IMPORT_REVIEW_FILES_INVALID', 'Review bundle files are required', 400)
  }
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw storeError('IMPORT_REVIEW_FILES_INVALID', 'Review bundle file paths must be unique', 400)
  }
  if (files.reduce((sum, file) => sum + file.byteLength, 0) > MAX_BUNDLE_BYTES) {
    throw storeError('IMPORT_REVIEW_SIZE_INVALID', 'Review bundle is too large', 413)
  }
  const publicPaper = ['web-import-review-bundle-v2', 'web-import-review-bundle-v3'].includes(input.schemaVersion)
  const manifest = {
    schemaVersion: input.schemaVersion,
    paperId,
    paperName: requiredString(input.paperName, 'paperName', 300),
    ...(input.expectedBaseRevisionId
      ? {
          expectedBaseRevisionId: requiredString(
            input.expectedBaseRevisionId,
            'expectedBaseRevisionId',
            100,
          ),
        }
      : {}),
    sourceDigest: requiredString(input.sourceDigest, 'sourceDigest', 160),
    candidateDigest: requiredString(input.candidateDigest, 'candidateDigest', 160),
    visibleStructureDigest: requiredString(
      input.visibleStructureDigest,
      'visibleStructureDigest',
      160,
    ),
    ...(publicPaper
      ? {
          importProfile: requiredString(input.importProfile, 'importProfile', 100),
          paragraphSummariesDigest: requiredString(
            input.paragraphSummariesDigest,
            'paragraphSummariesDigest',
            160,
          ),
          publicSearchMetadataDigest: requiredString(
            input.publicSearchMetadataDigest,
            'publicSearchMetadataDigest',
            160,
          ),
          ...(input.analysisDigest
            ? { analysisDigest: requiredString(input.analysisDigest, 'analysisDigest', 160) }
            : {}),
          ...(input.schemaVersion === 'web-import-review-bundle-v3' ? {
            ocrCorrectionReportVersion: input.ocrCorrectionReportVersion,
            ocrCorrectionReportDigest: requiredString(input.ocrCorrectionReportDigest, 'ocrCorrectionReportDigest', 160),
          } : {}),
        }
      : { analysisDigest: requiredString(input.analysisDigest, 'analysisDigest', 160) }),
    producerBuildId: requiredString(input.producerBuildId, 'producerBuildId', 200),
    files,
    resolvesIssueIds: Array.isArray(input.resolvesIssueIds)
      ? [...new Set(input.resolvesIssueIds.map((id) => requiredString(id, 'issueId', 100)))]
      : [],
  }
  for (const digest of [
    manifest.sourceDigest,
    manifest.candidateDigest,
    manifest.visibleStructureDigest,
    ...(manifest.analysisDigest ? [manifest.analysisDigest] : []),
    ...(manifest.paragraphSummariesDigest ? [manifest.paragraphSummariesDigest] : []),
    ...(manifest.publicSearchMetadataDigest ? [manifest.publicSearchMetadataDigest] : []),
    ...(manifest.ocrCorrectionReportDigest ? [manifest.ocrCorrectionReportDigest] : []),
  ]) {
    if (!SHA256.test(digest)) {
      throw storeError('IMPORT_REVIEW_DIGEST_INVALID', 'Review identity digest is invalid', 400)
    }
  }
  if (publicPaper && manifest.importProfile !== 'public-paper-v1') {
    throw storeError('IMPORT_REVIEW_PROFILE_INVALID', 'Unsupported public-paper import profile', 400)
  }
  if (input.schemaVersion === 'web-import-review-bundle-v3'
    && manifest.ocrCorrectionReportVersion !== 'agent-ocr-correction-report-v2') {
    throw storeError('IMPORT_REVIEW_OCR_CORRECTION_REPORT_INVALID', 'Unsupported OCR correction report version', 400)
  }
  const computed = reviewBundleDigest(manifest)
  if (input.bundleDigest !== computed) {
    throw storeError('IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH', 'bundleDigest does not match manifest', 400)
  }
  return { ...manifest, bundleDigest: computed }
}

export function validateOcrReviewBundleManifest(input) {
  if (input?.schemaVersion !== 'web-import-ocr-review-bundle-v1') {
    throw storeError('IMPORT_REVIEW_SCHEMA_INVALID', 'Unsupported OCR review bundle schema', 400)
  }
  const paperId = requiredString(input.paperId, 'paperId', 160)
  if (!PAPER_ID.test(paperId)) {
    throw storeError('IMPORT_REVIEW_INPUT_INVALID', 'paperId is invalid', 400)
  }
  const files = Array.isArray(input.files) ? input.files.map(fileDescriptor) : []
  if (files.length === 0 || files.length > MAX_FILES) {
    throw storeError('IMPORT_REVIEW_FILES_INVALID', 'OCR review bundle files are required', 400)
  }
  if (new Set(files.map((file) => file.path)).size !== files.length) {
    throw storeError('IMPORT_REVIEW_FILES_INVALID', 'OCR review bundle file paths must be unique', 400)
  }
  if (files.reduce((sum, file) => sum + file.byteLength, 0) > MAX_BUNDLE_BYTES) {
    throw storeError('IMPORT_REVIEW_SIZE_INVALID', 'OCR review bundle is too large', 413)
  }
  const manifest = {
    schemaVersion: input.schemaVersion,
    paperId,
    paperName: requiredString(input.paperName, 'paperName', 300),
    sourceSetDigest: requiredString(input.sourceSetDigest, 'sourceSetDigest', 160),
    evidenceDigest: requiredString(input.evidenceDigest, 'evidenceDigest', 160),
    reviewStructureDigest: requiredString(
      input.reviewStructureDigest,
      'reviewStructureDigest',
      160,
    ),
    producerBuildId: requiredString(input.producerBuildId, 'producerBuildId', 200),
    files,
    resolvesIssueIds: [],
  }
  for (const digest of [
    manifest.sourceSetDigest,
    manifest.evidenceDigest,
    manifest.reviewStructureDigest,
  ]) {
    if (!SHA256.test(digest)) {
      throw storeError('IMPORT_REVIEW_DIGEST_INVALID', 'OCR review identity digest is invalid', 400)
    }
  }
  const computed = ocrReviewBundleDigest(manifest)
  if (input.bundleDigest !== computed) {
    throw storeError('IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH', 'bundleDigest does not match OCR manifest', 400)
  }
  return { ...manifest, bundleDigest: computed }
}

function validateAnyReviewBundleManifest(input) {
  return input?.schemaVersion === 'web-import-ocr-review-bundle-v1'
    ? validateOcrReviewBundleManifest(input)
    : validateReviewBundleManifest(input)
}

function reviewKind(manifest) {
  return manifest?.schemaVersion === 'web-import-ocr-review-bundle-v1'
    ? 'ocr'
    : 'candidate'
}

function ensureShape(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS import_review_papers (
      paper_id TEXT PRIMARY KEY,
      paper_name TEXT NOT NULL,
      latest_revision_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_review_revisions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('uploading', 'awaiting_review', 'changes_requested', 'approved', 'superseded')),
      source_digest TEXT NOT NULL,
      candidate_digest TEXT NOT NULL,
      visible_structure_digest TEXT NOT NULL,
      bundle_digest TEXT NOT NULL,
      producer_build_id TEXT NOT NULL,
      renderer_build_id TEXT,
      manifest_json TEXT NOT NULL,
      approval_receipt_json TEXT,
      created_at TEXT NOT NULL,
      finalized_at TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(paper_id, revision_number)
    );
    CREATE TABLE IF NOT EXISTS import_review_files (
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id) ON DELETE CASCADE,
      path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      media_type TEXT NOT NULL,
      role TEXT NOT NULL,
      uploaded_at TEXT,
      PRIMARY KEY(revision_id, path)
    );
    CREATE TABLE IF NOT EXISTS import_review_product_previews (
      revision_id TEXT PRIMARY KEY REFERENCES import_review_revisions(id) ON DELETE CASCADE,
      bundle_digest TEXT NOT NULL,
      renderer_build_id TEXT NOT NULL,
      payload_digest TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_review_issues (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
      surface TEXT NOT NULL,
      edition TEXT,
      group_id TEXT,
      question_id TEXT,
      block_id TEXT,
      media_id TEXT,
      content_node_id TEXT,
      page_number INTEGER,
      rect_json TEXT,
      message TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('open', 'fixed_pending_review', 'closed', 'dismissed')),
      resolution_revision_id TEXT REFERENCES import_review_revisions(id),
      resolution_note TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_review_issue_messages (
      id TEXT PRIMARY KEY,
      issue_id TEXT NOT NULL REFERENCES import_review_issues(id) ON DELETE CASCADE,
      author_kind TEXT NOT NULL CHECK (author_kind IN ('owner', 'agent')),
      author_name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_review_media_confirmations (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id) ON DELETE CASCADE,
      media_id TEXT NOT NULL,
      source_sha256 TEXT NOT NULL,
      candidate_sha256 TEXT NOT NULL,
      presentation_digest TEXT NOT NULL,
      receipt_json TEXT NOT NULL,
      confirmed_by TEXT NOT NULL,
      confirmed_at TEXT NOT NULL,
      UNIQUE(revision_id, media_id, source_sha256, candidate_sha256, presentation_digest)
    );
    CREATE TABLE IF NOT EXISTS import_review_shipping_guards (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL UNIQUE REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
      approval_id TEXT NOT NULL,
      acquired_by TEXT NOT NULL,
      acquired_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_review_promotions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
      approval_id TEXT NOT NULL UNIQUE,
      source_digest TEXT NOT NULL,
      candidate_digest TEXT NOT NULL,
      visible_structure_digest TEXT NOT NULL,
      analysis_digest TEXT NOT NULL,
      bundle_digest TEXT NOT NULL,
      guard_id TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL CHECK (state IN ('publishing', 'published', 'failed')),
      attempt_count INTEGER NOT NULL DEFAULT 1,
      requested_by TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      asset_version INTEGER,
      version_name TEXT,
      canonical_publication_digest TEXT,
      analysis_publication_digest TEXT,
      failure_code TEXT,
      failure_message TEXT,
      failed_at TEXT,
      published_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS import_review_publication_requests (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
      approval_id TEXT,
      source_digest TEXT NOT NULL,
      candidate_digest TEXT NOT NULL,
      visible_structure_digest TEXT NOT NULL,
      analysis_digest TEXT NOT NULL,
      bundle_digest TEXT NOT NULL,
      renderer_build_id TEXT NOT NULL,
      secret_hash TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      amp_thread_id TEXT,
      state TEXT NOT NULL CHECK (state IN ('pending', 'granted', 'consumed', 'revoked')),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      granted_by TEXT,
      granted_at TEXT,
      revoked_by TEXT,
      revoked_at TEXT,
      consumed_at TEXT,
      promotion_id TEXT REFERENCES import_review_promotions(id),
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_import_review_revisions_paper
      ON import_review_revisions(paper_id, revision_number DESC);
    CREATE INDEX IF NOT EXISTS idx_import_review_issues_paper
      ON import_review_issues(paper_id, state, created_at);
    CREATE INDEX IF NOT EXISTS idx_import_review_promotions_paper
      ON import_review_promotions(paper_id, requested_at DESC);
  `)
  const issueColumns = new Set(db.prepare('PRAGMA table_info(import_review_issues)').all()
    .map((column) => column.name))
  if (!issueColumns.has('media_id')) {
    db.exec('ALTER TABLE import_review_issues ADD COLUMN media_id TEXT')
  }
  if (!issueColumns.has('content_node_id')) {
    db.exec('ALTER TABLE import_review_issues ADD COLUMN content_node_id TEXT')
  }
  if (!issueColumns.has('edition')) {
    db.exec('ALTER TABLE import_review_issues ADD COLUMN edition TEXT')
  }
  if (!issueColumns.has('publication_digest')) {
    db.exec('ALTER TABLE import_review_issues ADD COLUMN publication_digest TEXT')
  }
  const paperColumns = new Set(db.prepare('PRAGMA table_info(import_review_papers)').all().map(column => column.name))
  if (!paperColumns.has('discussion_thread_id')) {
    db.exec('ALTER TABLE import_review_papers ADD COLUMN discussion_thread_id TEXT')
  }
}

function revisionRow(row) {
  if (!row) return null
  const manifest = parseJson(row.manifest_json, {})
  return {
    id: row.id,
    paperId: row.paper_id,
    revisionNumber: row.revision_number,
    state: row.state,
    reviewKind: reviewKind(manifest),
    sourceDigest: row.source_digest,
    candidateDigest: row.candidate_digest,
    visibleStructureDigest: row.visible_structure_digest,
    bundleDigest: row.bundle_digest,
    producerBuildId: row.producer_build_id,
    rendererBuildId: row.renderer_build_id,
    manifest,
    approval: parseJson(row.approval_receipt_json),
    createdAt: row.created_at,
    finalizedAt: row.finalized_at,
    updatedAt: row.updated_at,
  }
}

function issueRow(row) {
  if (!row) return null
  return {
    id: row.id,
    paperId: row.paper_id,
    revisionId: row.revision_id,
    surface: row.surface,
    edition: row.edition,
    publicationDigest: row.publication_digest || null,
    groupId: row.group_id,
    questionId: row.question_id,
    blockId: row.block_id,
    mediaId: row.media_id,
    contentNodeId: row.content_node_id,
    pageNumber: row.page_number,
    rect: parseJson(row.rect_json),
    message: row.message,
    state: row.state,
    resolutionRevisionId: row.resolution_revision_id,
    resolutionNote: row.resolution_note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function issueMessageRow(row) {
  return {
    id: row.id,
    issueId: row.issue_id,
    authorKind: row.author_kind,
    authorName: row.author_name,
    message: row.message,
    createdAt: row.created_at,
  }
}

function fileRow(row) {
  return {
    path: row.path,
    sha256: row.sha256,
    byteLength: row.byte_length,
    mediaType: row.media_type,
    role: row.role,
    uploadedAt: row.uploaded_at,
  }
}

function shippingGuardRow(row) {
  if (!row) return null
  return {
    id: row.id,
    paperId: row.paper_id,
    revisionId: row.revision_id,
    approvalId: row.approval_id,
    acquiredBy: row.acquired_by,
    acquiredAt: row.acquired_at,
  }
}

function promotionRow(db, row) {
  if (!row) return null
  const revision = db.prepare(`
    SELECT manifest_json, approval_receipt_json
    FROM import_review_revisions WHERE id = ? AND paper_id = ?
  `).get(row.revision_id, row.paper_id)
  const manifest = parseJson(revision?.manifest_json, {})
  const approval = parseJson(revision?.approval_receipt_json)
  const exactApproval = approval?.approvalId === row.approval_id
    && approval?.revisionId === row.revision_id
    && approval?.paperId === row.paper_id
    ? approval
    : null
  const publicPaper = ['web-import-review-bundle-v2', 'web-import-review-bundle-v3'].includes(manifest.schemaVersion)
  if (publicPaper) {
    if (
      manifest.importProfile !== 'public-paper-v1'
      || !SHA256.test(manifest.paragraphSummariesDigest || '')
      || !SHA256.test(manifest.publicSearchMetadataDigest || '')
    ) {
      throw storeError(
        'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
        'Promotion public profile does not match its immutable revision manifest',
      )
    }
    const immutableIdentity = {
      sourceDigest: row.source_digest,
      candidateDigest: row.candidate_digest,
      visibleStructureDigest: row.visible_structure_digest,
      analysisDigest: row.analysis_digest || undefined,
      bundleDigest: row.bundle_digest,
      importProfile: manifest.importProfile,
      paragraphSummariesDigest: manifest.paragraphSummariesDigest,
      publicSearchMetadataDigest: manifest.publicSearchMetadataDigest,
    }
    for (const key of [
      'sourceDigest',
      'candidateDigest',
      'visibleStructureDigest',
      'analysisDigest',
      'bundleDigest',
      'importProfile',
      'paragraphSummariesDigest',
      'publicSearchMetadataDigest',
    ]) {
      if (!exactApproval || manifest[key] !== immutableIdentity[key] || approval[key] !== immutableIdentity[key]) {
        throw storeError(
          'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
          `Promotion ${key} does not match its immutable public approval`,
        )
      }
    }
  }
  return {
    schemaVersion: 'web-import-review-promotion-v1',
    promotionId: row.id,
    paperId: row.paper_id,
    revisionId: row.revision_id,
    approvalId: row.approval_id,
    sourceDigest: row.source_digest,
    candidateDigest: row.candidate_digest,
    visibleStructureDigest: row.visible_structure_digest,
    ...(publicPaper
      ? {
          importProfile: manifest.importProfile,
          paragraphSummariesDigest: manifest.paragraphSummariesDigest,
          publicSearchMetadataDigest: manifest.publicSearchMetadataDigest,
          ...(manifest.analysisDigest ? { analysisDigest: manifest.analysisDigest } : {}),
        }
      : { analysisDigest: row.analysis_digest }),
    bundleDigest: row.bundle_digest,
    guardId: row.guard_id,
    state: row.state,
    attemptCount: Number(row.attempt_count),
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    assetVersion: row.asset_version == null ? null : Number(row.asset_version),
    versionName: row.version_name,
    canonicalPublicationDigest: row.canonical_publication_digest,
    ...(publicPaper
      ? { paragraphSummariesPublicationDigest: row.analysis_publication_digest }
      : { analysisPublicationDigest: row.analysis_publication_digest }),
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    failedAt: row.failed_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

function sha256File(filePath) {
  const descriptor = openSync(filePath, 'r')
  try {
    const hash = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let length
    while ((length = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, length))
    }
    return `sha256:${hash.digest('hex')}`
  } finally { closeSync(descriptor) }
}
async function sha256FileAsync(filePath) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath, { highWaterMark: 64 * 1024 })) {
    hash.update(chunk)
  }
  return `sha256:${hash.digest('hex')}`
}

export function createImportReviewStore({
  dbPath,
  filesRoot,
  rendererBuildId,
  projectRevision = buildImportReviewProjection,
}) {
  assertPaperStorageMounted([filesRoot])
  mkdirSync(path.dirname(dbPath), { recursive: true })
  mkdirSync(filesRoot, { recursive: true })
  const initialize = new DatabaseSync(dbPath)
  ensureShape(initialize)
  initialize.close()
  const projectionCache = new Map()

  function currentRendererBuildId() {
    return requiredString(
      typeof rendererBuildId === 'function' ? rendererBuildId() : rendererBuildId,
      'rendererBuildId',
      200,
    )
  }

  function withDb(write, callback) {
    if (write) assertPaperStorageMounted([filesRoot])
    const db = new DatabaseSync(dbPath, { readOnly: !write })
    db.exec('PRAGMA foreign_keys = ON')
    try {
      return callback(db)
    } finally {
      db.close()
    }
  }

  function revisionDirectory(revisionId) {
    if (!/^rev-[a-f0-9-]{36}$/.test(revisionId || '')) {
      throw storeError('IMPORT_REVIEW_REVISION_INVALID', 'revisionId is invalid', 400)
    }
    assertPaperStorageMounted([filesRoot])
    return path.join(filesRoot, revisionId)
  }

  function getRevision(revisionId) {
    return withDb(false, (db) => revisionRow(
      db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(revisionId),
    ))
  }

  function assertPaperNotShipping(db, paperId) {
    const guard = shippingGuardRow(db.prepare(`
      SELECT * FROM import_review_shipping_guards WHERE paper_id = ?
    `).get(paperId))
    if (guard) {
      throw storeError(
        'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
        `Review state is frozen by active shipping guard ${guard.id}`,
      )
    }
  }

  function createRevision(rawManifest, { actor = 'internal' } = {}) {
    const metrics = {}
    const timer = reviewUploadMetrics('register', { actor }, ['registration', 'reuse'], metrics)
    try {
      const result = createRevisionMeasured(rawManifest)
      timer.finish()
      return { ...result, metrics }
    } catch (error) {
      timer.finish(error)
      throw error
    }
  }

  async function createRevisionUpload(rawManifest, { blobStore = null, actor = 'internal' } = {}) {
    const metrics = {}
    const identity = { actor }
    const timer = reviewUploadMetrics('register', identity, ['registration', 'reuse'], metrics)
    try {
      const result = createRevisionMeasured(rawManifest)
      identity.revisionId = result.revision.id
      timer.phase('reuse')
      await reuseRevisionFiles(result.revision.id, blobStore, actor)
      const missingFiles = uploadStatus(result.revision.id).missingFiles
      timer.finish()
      return { ...result, missingFiles, metrics }
    } catch (error) {
      timer.finish(error)
      throw error
    }
  }

  function createRevisionMeasured(rawManifest) {
    const manifest = validateAnyReviewBundleManifest(rawManifest)
    const kind = reviewKind(manifest)
    const identities = kind === 'ocr'
      ? {
          sourceDigest: manifest.sourceSetDigest,
          candidateDigest: manifest.evidenceDigest,
          visibleStructureDigest: manifest.reviewStructureDigest,
        }
      : {
          sourceDigest: manifest.sourceDigest,
          candidateDigest: manifest.candidateDigest,
          visibleStructureDigest: manifest.visibleStructureDigest,
        }
    const rendererId = currentRendererBuildId()
    const result = withDb(true, (db) => {
      const timestamp = nowIso()
      const id = `rev-${randomUUID()}`
      db.exec('BEGIN IMMEDIATE')
      try {
        assertPaperNotShipping(db, manifest.paperId)
        const existing = db.prepare(`
          SELECT * FROM import_review_revisions
          WHERE paper_id = ? AND bundle_digest = ?
            AND (state = 'uploading' OR renderer_build_id = ?)
          ORDER BY revision_number DESC
          LIMIT 1
        `).get(manifest.paperId, manifest.bundleDigest, rendererId)
        if (manifest.expectedBaseRevisionId) {
          const current = db.prepare(`
            SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?
          `).get(manifest.paperId)
          const completedSameUpload = existing?.state !== 'uploading'
            && existing?.id && current?.latest_revision_id === existing.id
          if (current?.latest_revision_id !== manifest.expectedBaseRevisionId && !completedSameUpload) {
            throw storeError(
              'IMPORT_REVIEW_BASE_REVISION_STALE',
              'Review revision changed; rebuild the corrected package upload from the current revision',
            )
          }
        }
        if (existing) {
          db.exec('COMMIT')
          return { revision: revisionRow(existing), created: false }
        }
        db.prepare(`
          INSERT INTO import_review_papers (paper_id, paper_name, created_at, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(paper_id) DO UPDATE SET
            paper_name = excluded.paper_name,
            updated_at = excluded.updated_at
        `).run(manifest.paperId, manifest.paperName, timestamp, timestamp)
        const revisionNumber = Number(db.prepare(`
          SELECT COALESCE(MAX(revision_number), 0) + 1 AS next
          FROM import_review_revisions WHERE paper_id = ?
        `).get(manifest.paperId).next)
        db.prepare(`
          INSERT INTO import_review_revisions (
            id, paper_id, revision_number, state, source_digest, candidate_digest,
            visible_structure_digest, bundle_digest, producer_build_id,
            manifest_json, created_at, updated_at
          ) VALUES (?, ?, ?, 'uploading', ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          manifest.paperId,
          revisionNumber,
          identities.sourceDigest,
          identities.candidateDigest,
          identities.visibleStructureDigest,
          manifest.bundleDigest,
          manifest.producerBuildId,
          JSON.stringify(manifest),
          timestamp,
          timestamp,
        )
        const insert = db.prepare(`
          INSERT INTO import_review_files (
            revision_id, path, sha256, byte_length, media_type, role
          ) VALUES (?, ?, ?, ?, ?, ?)
        `)
        for (const file of manifest.files) {
          insert.run(id, file.path, file.sha256, file.byteLength, file.mediaType, file.role)
        }
        db.exec('COMMIT')
        return {
          revision: revisionRow(
            db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(id),
          ),
          created: true,
        }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
    mkdirSync(revisionDirectory(result.revision.id), { recursive: true })
    return { ...result, missingFiles: uploadStatus(result.revision.id).missingFiles }
  }

  function uploadStatus(revisionId) {
    const revision = getRevision(revisionId)
    if (!revision) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Revision not found', 404)
    const files = withDb(false, (db) => db.prepare(`
      SELECT * FROM import_review_files WHERE revision_id = ? ORDER BY path
    `).all(revisionId).map(fileRow))
    return {
      revision,
      files,
      missingFiles: files.filter((file) => !file.uploadedAt).map((file) => file.path),
    }
  }

  async function beginFileUpload(revisionId, relativePath) {
    fileForUpload(revisionId, relativePath)
    const release = await acquireRevisionUpload(revisionDirectory(revisionId), relativePath)
    try {
      return { ...fileForUpload(revisionId, relativePath), release }
    } catch (error) {
      release()
      throw error
    }
  }

  async function reuseRevisionFiles(revisionId, blobStore, actor) {
    if (!blobStore?.reuseLocalFile) return
    const status = uploadStatus(revisionId)
    if (status.revision.state !== 'uploading') return
    for (const file of status.files) {
      if (file.uploadedAt || !/^(audio\/|image\/|application\/pdf$)/.test(file.mediaType)) continue
      const source = withDb(false, db => db.prepare(`
        SELECT f.revision_id, f.path FROM import_review_files f
        JOIN import_review_revisions r ON r.id = f.revision_id
        WHERE r.paper_id = ? AND r.revision_number < ? AND f.uploaded_at IS NOT NULL
          AND f.sha256 = ? AND f.byte_length = ?
        ORDER BY r.revision_number DESC, f.path LIMIT 1
      `).get(status.revision.paperId, status.revision.revisionNumber, file.sha256, file.byteLength))
      if (!source) continue
      const upload = await beginFileUpload(revisionId, file.path)
      try {
        if (upload.file.uploadedAt) continue
        if (!await blobStore.reuseLocalFile(upload.destination, file)) continue
        // beginFileUpload's lease prevents finalize while hashing/installing.
        // Recheck state immediately before marking; bytes prove no approval.
        completeFileUpload(revisionId, file.path, file)
        console.info(JSON.stringify({
          event: 'import-review-blob-reused', revisionId, path: file.path,
          sourceRevisionId: source.revision_id, sourcePath: source.path,
          sha256: file.sha256, byteLength: file.byteLength, verifiedAt: nowIso(), actor,
        }))
      } finally { upload.release() }
    }
  }

  function fileForUpload(revisionId, relativePath) {
    if (!validRelativePath(relativePath)) {
      throw storeError('IMPORT_REVIEW_PATH_INVALID', 'Upload path is invalid', 400)
    }
    const revision = getRevision(revisionId)
    if (!revision) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Revision not found', 404)
    if (revision.state !== 'uploading') {
      throw storeError('IMPORT_REVIEW_REVISION_IMMUTABLE', 'Finalized revision is immutable')
    }
    const file = withDb(false, (db) => fileRow(db.prepare(`
      SELECT * FROM import_review_files WHERE revision_id = ? AND path = ?
    `).get(revisionId, relativePath) || {}))
    if (!file.path) throw storeError('IMPORT_REVIEW_FILE_NOT_LISTED', 'File is not in manifest', 404)
    return {
      revision,
      file,
      directory: revisionDirectory(revisionId),
      destination: resolveReviewFile(revisionDirectory(revisionId), relativePath),
    }
  }

  function completeFileUpload(revisionId, relativePath, { sha256, byteLength }) {
    const expected = fileForUpload(revisionId, relativePath)
    if (expected.file.sha256 !== sha256 || expected.file.byteLength !== byteLength) {
      throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', 'Uploaded file does not match manifest', 400)
    }
    withDb(true, (db) => db.prepare(`
      UPDATE import_review_files SET uploaded_at = ?
      WHERE revision_id = ? AND path = ? AND uploaded_at IS NULL
    `).run(nowIso(), revisionId, relativePath))
    return uploadStatus(revisionId)
  }

  function storedRevisionFiles(revision, currentDb = null) {
    const readFiles = (db) => db.prepare(`
      SELECT * FROM import_review_files WHERE revision_id = ? ORDER BY path
    `).all(revision.id).map(fileRow)
    return currentDb ? readFiles(currentDb) : withDb(false, readFiles)
  }
  function storedRevisionFilePath(revision, file) {
    const filePath = resolveReviewFile(revisionDirectory(revision.id), file.path)
    if (!file.uploadedAt || !existsSync(filePath) || statSync(filePath).isDirectory()
      || statSync(filePath).size !== file.byteLength) {
      throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', `Stored file changed: ${file.path}`)
    }
    return filePath
  }
  function assertStoredRevisionFiles(revision, currentDb = null) {
    const files = storedRevisionFiles(revision, currentDb)
    for (const file of files) {
      if (sha256File(storedRevisionFilePath(revision, file)) !== file.sha256) {
        throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', `Stored file changed: ${file.path}`)
      }
    }
    return files
  }
  async function assertStoredRevisionFilesAsync(revision) {
    const files = storedRevisionFiles(revision)
    for (const file of files) {
      if (await sha256FileAsync(storedRevisionFilePath(revision, file)) !== file.sha256) {
        throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', `Stored file changed: ${file.path}`)
      }
    }
    return files
  }

  function assertProjectionIdentity(projection, revision) {
    const projectedPublicProfile = projection.importProfile === 'public-paper-v1'
    const manifestPublicProfile = ['web-import-review-bundle-v2', 'web-import-review-bundle-v3']
      .includes(revision.manifest.schemaVersion)
    if (projectedPublicProfile !== manifestPublicProfile) {
      throw storeError(
        'IMPORT_REVIEW_PROJECTION_MISMATCH',
        'importProfile does not match server-derived source truth',
      )
    }
    const identities = revision.reviewKind === 'ocr'
      ? [
          [projection.paperId, revision.paperId, 'paperId'],
          [projection.sourceSetDigest, revision.sourceDigest, 'sourceSetDigest'],
          [projection.evidenceDigest, revision.candidateDigest, 'evidenceDigest'],
          [projection.reviewStructureDigest, revision.visibleStructureDigest, 'reviewStructureDigest'],
        ]
      : [
          [projection.paperId, revision.paperId, 'paperId'],
          [projection.sourceDigest, revision.sourceDigest, 'sourceDigest'],
          [projection.candidateDigest, revision.candidateDigest, 'candidateDigest'],
          [projection.visibleStructureDigest, revision.visibleStructureDigest, 'visibleStructureDigest'],
          ...(revision.manifest.analysisDigest
            ? [[projection.analysisDigest, revision.manifest.analysisDigest, 'analysisDigest']]
            : []),
          ...(revision.manifest.paragraphSummariesDigest
            ? [
                [projection.importProfile, revision.manifest.importProfile, 'importProfile'],
                [projection.paragraphSummariesDigest, revision.manifest.paragraphSummariesDigest, 'paragraphSummariesDigest'],
                [projection.publicSearchMetadataDigest, revision.manifest.publicSearchMetadataDigest, 'publicSearchMetadataDigest'],
              ]
            : []),
        ]
    for (const [actual, expected, label] of identities) {
      if (actual !== expected) {
        throw storeError('IMPORT_REVIEW_PROJECTION_MISMATCH', `${label} does not match server derivation`)
      }
    }
  }

  function assertSelectedMediaConfirmations(db, projection, revision) {
    for (const derivation of projection.mediaDerivations || []) {
      if (derivation.publication?.selection !== 'human_confirmed_ai_candidate') {
        continue
      }
      const confirmation = derivation.publication.confirmation
      const row = db.prepare(`
        SELECT revision_id, receipt_json
        FROM import_review_media_confirmations
        WHERE id = ? AND paper_id = ? AND media_id = ?
      `).get(
        confirmation?.receiptId,
        revision.paperId,
        derivation.mediaId,
      )
      if (!row || row.revision_id === revision.id) {
        throw storeError(
          'IMPORT_REVIEW_MEDIA_CONFIRMATION_REQUIRED',
          `Media ${derivation.mediaId} requires an Owner confirmation from an earlier revision`,
        )
      }
      const receipt = parseJson(row.receipt_json)
      if (
        receipt?.confirmationId !== confirmation.receiptId
        || receipt.sourceSha256 !== derivation.source?.sha256
        || receipt.candidateSha256 !== derivation.candidate?.sha256
        || receipt.presentationDigest !== derivation.presentationDigest
        || receipt.reviewMethod !== confirmation.reviewMethod
        || digestJson(receipt.checklist) !== digestJson(confirmation.checklist)
      ) {
        throw storeError(
          'IMPORT_REVIEW_MEDIA_CONFIRMATION_STALE',
          `Media ${derivation.mediaId} confirmation no longer matches its source, Candidate, or layout intent`,
        )
      }
    }
  }

  function finalizationTimer(revisionId, metrics) {
    return reviewUploadMetrics('finalize', { revisionId }, [
      'status', 'fileHash', 'projection', 'identityAndReport', 'inventory', 'transactionAndPreview',
    ], metrics)
  }

  async function finalizeUploadedRevision(revisionId, { metrics = {} } = {}) {
    const timer = finalizationTimer(revisionId, metrics)
    let release
    try {
      release = await acquireRevisionUpload(revisionDirectory(revisionId))
    } catch (error) {
      timer.finish(error)
      throw error
    }
    try {
      const status = uploadStatus(revisionId)
      let prepared = null
      if (status.revision.state === 'uploading' && status.missingFiles.length === 0
        && projectRevision === buildImportReviewProjection) {
        timer.phase('fileHash')
        await assertStoredRevisionFilesAsync(status.revision)
        timer.phase('projection')
        prepared = await runFinalizeWorker(revisionDirectory(revisionId), status.revision, {
          onPhase: name => timer.phase(name),
        })
      }
      const revision = finalizeRevisionMeasured(revisionId, timer, prepared, status)
      timer.finish()
      return revision
    } catch (error) {
      timer.finish(error)
      throw error
    } finally { release() }
  }

  function finalizeRevision(revisionId, { metrics = {} } = {}) {
    return finalizeRevisionWithLease(revisionId, finalizationTimer(revisionId, metrics))
  }

  function finalizeRevisionWithLease(revisionId, timer, release = null) {
    try {
      if (!getRevision(revisionId)) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Revision not found', 404)
      release ||= tryRevisionFinalization(revisionDirectory(revisionId))
      const revision = finalizeRevisionMeasured(revisionId, timer)
      timer.finish()
      return revision
    } catch (error) {
      timer.finish(error)
      throw error
    } finally { release?.() }
  }

  function finalizeRevisionMeasured(revisionId, timer, prepared = null, status = uploadStatus(revisionId)) {
    if (status.revision.state !== 'uploading') {
      // Explicit finalize/replay may prepare a pre-upgrade revision. An ordinary
      // product GET must never cold-run source validation to fill this cache.
      timer.phase('transactionAndPreview')
      if (status.revision.reviewKind === 'candidate') prepareProductPreview(revisionId)
      return status.revision
    }
    if (status.missingFiles.length > 0) {
      throw storeError('IMPORT_REVIEW_UPLOAD_INCOMPLETE', 'Revision upload is incomplete')
    }
    const directory = revisionDirectory(revisionId)
    if (!prepared) {
      timer.phase('fileHash')
      assertStoredRevisionFiles(status.revision)
      timer.phase('projection')
    }
    const projection = prepared?.projection || projectRevision(directory, {
      reviewKind: status.revision.reviewKind,
      requireAnalyses: status.revision.reviewKind === 'candidate',
      expectedCandidateDigest: status.revision.candidateDigest,
    })
    timer.phase('identityAndReport')
    assertProjectionIdentity(projection, status.revision)
    if (status.revision.reviewKind === 'candidate'
      && projection.importProfile === 'public-paper-v1' && projection.manifest?.documents) {
      const originalSourceDigest = nck1OcrSourceSetDigest(projection.manifest.documents)
      const requiresReport = withDb(false, (db) => db.prepare(`
        SELECT manifest_json, approval_receipt_json FROM import_review_revisions WHERE paper_id = ?
      `).all(status.revision.paperId).some((row) => {
        if (reviewKind(parseJson(row.manifest_json, {})) !== 'ocr') return false
        const receipt = parseJson(row.approval_receipt_json)
        return receipt?.candidateReportRequired === true && receipt.sourceSetDigest === originalSourceDigest
      }))
      if (requiresReport && status.revision.manifest.schemaVersion !== 'web-import-review-bundle-v3') {
        throw storeError('IMPORT_REVIEW_OCR_CORRECTION_REPORT_INVALID', 'This Agent proofreading receipt requires a Candidate correction report')
      }
    }
    if (status.revision.manifest.schemaVersion === 'web-import-review-bundle-v3') {
      const report = projection.ocrCorrectionReport
      if (!report || digestJson(report) !== status.revision.manifest.ocrCorrectionReportDigest) {
        throw storeError('IMPORT_REVIEW_OCR_CORRECTION_REPORT_INVALID', 'Candidate OCR correction report is missing or stale')
      }
      const ocrRevision = withDb(false, (db) => revisionRow(db.prepare(`
        SELECT * FROM import_review_revisions WHERE id = ? AND paper_id = ?
      `).get(report.ocrRevisionId, status.revision.paperId)))
      const receipt = ocrRevision?.approval
      if (ocrRevision?.reviewKind !== 'ocr' || ocrRevision.state === 'uploading') {
        throw storeError('IMPORT_REVIEW_OCR_CORRECTION_RECEIPT_INVALID', 'Report does not match the exact server-held OCR receipt and original sources')
      }
      validateAgentOcrCorrectionReceipt(report, receipt,
        JSON.parse(new TextDecoder().decode(projection.sourceInput.materializationBytes)))
    }
    timer.phase('inventory')
    if (projectRevision === buildImportReviewProjection) {
      if (prepared?.inventoryError) throw restoreFinalizeError(prepared.inventoryError)
      const expectedFiles = prepared?.expectedFiles || finalizeInventory(directory, status.revision, projection)
      const actualFiles = status.revision.manifest.files
        .map(({ path: filePath, mediaType, role }) => `${filePath}\0${mediaType}\0${role}`)
        .sort()
      if (JSON.stringify(expectedFiles) !== JSON.stringify(actualFiles)) {
        throw storeError(
          'IMPORT_REVIEW_FILES_INVALID',
          'Review manifest inventory does not match the exact projection files',
        )
      }
    }
    timer.phase('transactionAndPreview')
    const timestamp = nowIso()
    const rendererId = currentRendererBuildId()
    withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = revisionRow(
          db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(revisionId),
        )
        if (!current) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Revision not found', 404)
        assertPaperNotShipping(db, current.paperId)
        if (current.state !== 'uploading') {
          db.exec('COMMIT')
          return
        }
        if (current.manifest.expectedBaseRevisionId) {
          const paper = db.prepare(`
            SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?
          `).get(current.paperId)
          if (paper?.latest_revision_id !== current.manifest.expectedBaseRevisionId) {
            throw storeError(
              'IMPORT_REVIEW_BASE_REVISION_STALE',
              'Review revision changed during upload; reconcile before finalizing this repair',
            )
          }
        }
        assertSelectedMediaConfirmations(db, projection, current)
        const newerFinalized = db.prepare(`
          SELECT id FROM import_review_revisions
          WHERE paper_id = ? AND revision_number > ? AND state <> 'uploading'
          ORDER BY revision_number DESC
          LIMIT 1
        `).get(current.paperId, current.revisionNumber)
        if (newerFinalized) {
          db.prepare(`
            UPDATE import_review_revisions
            SET state = 'superseded', renderer_build_id = ?, finalized_at = ?, updated_at = ?
            WHERE id = ? AND state = 'uploading'
          `).run(rendererId, timestamp, timestamp, revisionId)
          db.exec('COMMIT')
          return
        }
        db.prepare(`
          UPDATE import_review_revisions
          SET state = 'superseded', updated_at = ?
          WHERE paper_id = ? AND id <> ? AND state <> 'uploading'
        `).run(timestamp, status.revision.paperId, revisionId)
        db.prepare(`
          UPDATE import_review_revisions
          SET state = 'awaiting_review', renderer_build_id = ?, finalized_at = ?, updated_at = ?
          WHERE id = ? AND state = 'uploading'
        `).run(rendererId, timestamp, timestamp, revisionId)
        db.prepare(`
          UPDATE import_review_papers SET latest_revision_id = ?, updated_at = ?
          WHERE paper_id = ?
        `).run(revisionId, timestamp, status.revision.paperId)
        const manifest = current.manifest
        for (const issueId of manifest.resolvesIssueIds || []) {
          const result = db.prepare(`
            UPDATE import_review_issues
            SET state = 'fixed_pending_review', resolution_revision_id = ?, updated_at = ?
            WHERE id = ? AND paper_id = ? AND state = 'open'
          `).run(revisionId, timestamp, issueId, status.revision.paperId)
          if (result.changes === 0) {
            throw storeError(
              'IMPORT_REVIEW_ISSUE_RESOLUTION_INVALID',
              `Issue cannot be marked fixed: ${issueId}`,
            )
          }
        }
        if (current.reviewKind === 'candidate') {
          saveProductPreview(db, current, rendererId, projection)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
    projectionCache.set(revisionId, projection)
    return getRevision(revisionId)
  }

  function listPapers() {
    // Without QUESTION_BANK_BUILD_ID the build id hashes the whole renderer tree synchronously;
    // one listing reads it at most once instead of once per Candidate row.
    let rendererId
    const listingRendererBuildId = () => (rendererId ??= currentRendererBuildId())
    return withDb(false, (db) => db.prepare(`
      SELECT p.paper_id, p.paper_name, p.latest_revision_id, p.updated_at,
             r.revision_number, r.state, r.bundle_digest, r.manifest_json,
             r.approval_receipt_json, r.renderer_build_id,
             (SELECT pr.state FROM import_review_promotions pr
              WHERE pr.paper_id = p.paper_id
              ORDER BY pr.requested_at DESC, pr.rowid DESC LIMIT 1) AS promotion_state,
             (SELECT pr.approval_id FROM import_review_promotions pr
              WHERE pr.paper_id = p.paper_id
              ORDER BY pr.requested_at DESC, pr.rowid DESC LIMIT 1) AS promotion_approval_id,
             (SELECT COUNT(*) FROM import_review_issues i
              WHERE i.paper_id = p.paper_id AND i.state IN ('open', 'fixed_pending_review')) AS unresolved_count
      FROM import_review_papers p
      LEFT JOIN import_review_revisions r ON r.id = p.latest_revision_id
      ORDER BY
        CASE r.state WHEN 'changes_requested' THEN 0 WHEN 'awaiting_review' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END,
        p.updated_at DESC
    `).all().map((row) => {
      const manifest = parseJson(row.manifest_json, {})
      const kind = reviewKind(manifest)
      return {
        paperId: row.paper_id,
        paperName: row.paper_name,
        latestRevisionId: row.latest_revision_id,
        revisionNumber: row.revision_number,
        state: row.state || 'uploading',
        reviewKind: kind,
        bundleDigest: row.bundle_digest,
        hasMediaCandidates: (manifest.files || [])
          .some(file => file.role === 'content_media_candidate'),
        rendererBuildId: row.renderer_build_id,
        rendererStale: kind === 'candidate'
          && row.renderer_build_id !== listingRendererBuildId(),
        promotionState:
          parseJson(row.approval_receipt_json)?.approvalId === row.promotion_approval_id
            ? row.promotion_state
            : null,
        unresolvedCount: Number(row.unresolved_count || 0),
        updatedAt: row.updated_at,
      }
    }))
  }

  function linkDiscussionThread(paperId, { threadId, expectedThreadId } = {}) {
    const validThread = value => /^T-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value || '')
    if (!validThread(threadId) || (expectedThreadId !== null && !validThread(expectedThreadId))) {
      throw storeError('IMPORT_REVIEW_THREAD_INVALID', 'Exact new and previous Amp thread ids required (null for unbound)', 400)
    }
    return withDb(true, db => {
      const result = db.prepare(`UPDATE import_review_papers SET discussion_thread_id = ?
        WHERE paper_id = ? AND (discussion_thread_id IS ? OR discussion_thread_id = ?)`)
        .run(threadId, paperId, expectedThreadId, threadId)
      if (result.changes !== 1) {
        throw storeError('IMPORT_REVIEW_THREAD_CONFLICT', 'Paper missing or discussion thread changed; reconcile before linking')
      }
      return { paperId, discussionThreadId: threadId }
    })
  }

  function paperDetail(paperId, { includeProjection = true } = {}) {
    const paper = withDb(false, (db) => db.prepare(`
      SELECT * FROM import_review_papers WHERE paper_id = ?
    `).get(paperId))
    if (!paper) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
    const revisions = withDb(false, (db) => db.prepare(`
      SELECT * FROM import_review_revisions WHERE paper_id = ? ORDER BY revision_number DESC
    `).all(paperId).map(revisionRow))
    const issues = withDb(false, (db) => db.prepare(`
      SELECT * FROM import_review_issues WHERE paper_id = ? ORDER BY created_at DESC
    `).all(paperId).map(issueRow))
    const issueMessages = withDb(false, (db) => db.prepare(`
      SELECT m.*
      FROM import_review_issue_messages m
      JOIN import_review_issues i ON i.id = m.issue_id
      WHERE i.paper_id = ?
      ORDER BY m.created_at
    `).all(paperId).map(issueMessageRow))
    const mediaConfirmations = withDb(false, (db) => db.prepare(`
      SELECT receipt_json
      FROM import_review_media_confirmations
      WHERE paper_id = ?
      ORDER BY confirmed_at DESC
    `).all(paperId).map((row) => parseJson(row.receipt_json)))
    const latest = revisions.find((revision) => revision.id === paper.latest_revision_id) || null
    const files = latest
      ? withDb(false, (db) => db.prepare(`
          SELECT * FROM import_review_files WHERE revision_id = ? ORDER BY path
        `).all(latest.id).map(fileRow))
      : []
    const latestProjection = includeProjection && latest && latest.state !== 'uploading'
      ? projectionForRevision(latest.id).projection
      : null
    const visibleStructure = latestProjection?.consumption?.visibleStructure || []
    const sourceVisuals = latestProjection?.sourceVisuals || []
    const mediaDerivations = (latestProjection?.mediaDerivations || []).map(
      ({ source, candidate, ...derivation }) => ({
        ...derivation,
        source: { ...source, encodedBytes: undefined },
        ...(candidate
          ? { candidate: { ...candidate, encodedBytes: undefined } }
          : {}),
      }),
    )
    const rendererStale = Boolean(
      latest?.reviewKind === 'candidate'
      && latest.rendererBuildId
      && latest.rendererBuildId !== currentRendererBuildId(),
    )
    return {
      paperId: paper.paper_id,
      paperName: paper.paper_name,
      discussionThreadId: paper.discussion_thread_id || null,
      latestRevisionId: paper.latest_revision_id,
      latest,
      revisions,
      issues,
      issueMessages,
      files,
      visibleStructure,
      sourceVisuals,
      sourceProvenance: latestProjection?.sourceProvenance || null,
      mediaDerivations,
      listeningReview: latestProjection?.listeningReview || null,
      mediaConfirmations,
      ocrReview: latestProjection?.ocrReview || null,
      ocrCorrectionReport: latestProjection?.ocrCorrectionReport || null,
      historicalOcrReport: revisions.find((revision) =>
        revision.id === latestProjection?.ocrCorrectionReport?.ocrRevisionId)?.approval?.correctionReport || null,
      ocrCorrectionReportBinding: latestProjection?.ocrCorrectionReport ? {
        historical: {
          revisionId: latestProjection.ocrCorrectionReport.ocrRevisionId,
          confirmationId: latestProjection.ocrCorrectionReport.ocrConfirmationId,
          sourceSetDigest: latestProjection.ocrCorrectionReport.originalSourceSetDigest,
          evidenceDigest: latestProjection.ocrCorrectionReport.ocrEvidenceDigest,
        },
        current: {
          revisionId: latest.id,
          sourceDigest: latest.sourceDigest,
          candidateDigest: latest.candidateDigest,
          bundleDigest: latest.bundleDigest,
        },
      } : null,
      promotion: latestPromotion(paperId),
      rendererStale,
      unresolvedCount: issues.filter((issue) => UNRESOLVED_ISSUE_STATES.has(issue.state)).length,
      updatedAt: paper.updated_at,
    }
  }

  function projectionForRevision(revisionId) {
    const revision = getRevision(revisionId)
    if (!revision || revision.state === 'uploading') {
      throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Finalized revision not found', 404)
    }
    assertStoredRevisionFiles(revision)
    if (!projectionCache.has(revisionId)) {
      const projection = projectRevision(
        revisionDirectory(revisionId),
        { reviewKind: revision.reviewKind, requireAnalyses: false, expectedCandidateDigest: revision.candidateDigest },
      )
      assertProjectionIdentity(projection, revision)
      projectionCache.set(revisionId, projection)
    }
    return { revision, projection: projectionCache.get(revisionId) }
  }

  function saveProductPreview(db, revision, rendererId, projection) {
    const playback = projection.sourceInput?.listeningAudio || projection.analyzedPackage?.listeningAudio
    const playbackPath = projection.analyzedPackage
      ? projection.sourceProvenance?.members.find(member => member.role === 'audio')?.path
      : LISTENING_AUDIO_PATHS.playback
    const payload = {
      paperAsset: projection.paperAsset,
      analysisSidecars: projection.analysisSidecars || {},
      consumption: { ...projection.consumption, ...(playback ? { listeningAudio: {
        relativePath: 'listening/playback.mp3', sha256: playback.sha256, byteLength: playback.byteLength,
        durationSeconds: playback.durationSeconds, mediaType: 'audio/mpeg',
        url: `/api/import-review-preview/revisions/${encodeURIComponent(revision.id)}/files?path=${encodeURIComponent(playbackPath)}`,
        segments: reviewedPlaybackSegments(projection.reviewedListening),
      } } : {}) },
    }
    // Small derived Screen data only: no original documents, MP3/PDF bytes,
    // source rasters or new approval authority. Keep it in the same DB snapshot.
    const json = JSON.stringify(payload)
    db.prepare(`INSERT INTO import_review_product_previews
      (revision_id, bundle_digest, renderer_build_id, payload_digest, payload_json)
      VALUES (?, ?, ?, ?, ?)`).run(revision.id, revision.bundleDigest, rendererId,
      digestJson(JSON.parse(json)), json)
  }

  function prepareProductPreview(revisionId) {
    const revision = getRevision(revisionId)
    if (!revision || revision.state === 'uploading' || revision.reviewKind !== 'candidate') {
      throw storeError('IMPORT_REVIEW_CANDIDATE_REQUIRED', 'A finalized Candidate is required')
    }
    if (withDb(false, db => db.prepare(
      'SELECT revision_id FROM import_review_product_previews WHERE revision_id = ?',
    ).get(revisionId))) return
    if (revision.rendererBuildId !== currentRendererBuildId()) {
      throw storeError('IMPORT_REVIEW_RENDERER_STALE', 'Resubmit before preparing a preview with a different renderer')
    }
    const { projection } = projectionForRevision(revisionId)
    withDb(true, db => {
      db.exec('BEGIN IMMEDIATE')
      try {
        if (!db.prepare('SELECT revision_id FROM import_review_product_previews WHERE revision_id = ?').get(revisionId)) {
          saveProductPreview(db, revision, revision.rendererBuildId, projection)
        }
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    })
  }

  function productPreviewForRevision(revisionId) {
    const revision = getRevision(revisionId)
    if (!revision || revision.state === 'uploading' || revision.reviewKind !== 'candidate') {
      throw storeError('IMPORT_REVIEW_CANDIDATE_REQUIRED', 'A finalized Candidate is required')
    }
    const row = withDb(false, db => db.prepare(
      'SELECT * FROM import_review_product_previews WHERE revision_id = ?',
    ).get(revisionId))
    if (!row) throw storeError('IMPORT_REVIEW_PREVIEW_NOT_PREPARED', 'Agent must prepare this historical preview before opening it')
    const preview = JSON.parse(row.payload_json)
    if (row.bundle_digest !== revision.bundleDigest || row.renderer_build_id !== revision.rendererBuildId
      || digestJson(preview) !== row.payload_digest) {
      throw storeError('IMPORT_REVIEW_PREVIEW_IDENTITY_INVALID', 'Stored preview identity differs from the finalized revision')
    }
    assertStoredRevisionFiles(revision)
    return { revision, preview }
  }

  function verifiedFileForRead(revisionId, relativePath) {
    const revision = getRevision(revisionId)
    const file = revision?.manifest.files.find(file => file.path === relativePath)
    if (!revision || revision.state === 'uploading' || !file) {
      throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Finalized revision file not found', 404)
    }
    const filePath = resolveReviewFile(revisionDirectory(revisionId), relativePath)
    if (!existsSync(filePath) || statSync(filePath).size !== file.byteLength || sha256File(filePath) !== file.sha256) {
      throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', 'Revision file is missing or changed')
    }
    return { revision, file, filePath }
  }

  function normalizeRect(rect) {
    if (rect == null) return null
    const result = {}
    for (const key of ['x', 'y', 'width', 'height']) {
      const value = Number(rect[key])
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        throw storeError('IMPORT_REVIEW_RECT_INVALID', 'Issue rectangle must be normalized', 400)
      }
      result[key] = value
    }
    if (result.width <= 0 || result.height <= 0 || result.x + result.width > 1 || result.y + result.height > 1) {
      throw storeError('IMPORT_REVIEW_RECT_INVALID', 'Issue rectangle is outside the surface', 400)
    }
    return result
  }

  function createIssue(paperId, input, actor) {
    const revisionId = requiredString(input?.revisionId, 'revisionId', 100)
    const surface = requiredString(input.surface, 'surface', 30)
    if (!SURFACES.has(surface)) {
      throw storeError('IMPORT_REVIEW_SURFACE_INVALID', 'Issue surface is invalid', 400)
    }
    const edition = optionalString(input.edition, 30)
    if (edition && (surface !== 'pdf' || ![...PAPER_PDF_EDITIONS, 'friendly8', 'friendly10'].includes(edition))) {
      throw storeError(
        'IMPORT_REVIEW_EDITION_INVALID',
        'edition is only valid for a supported PDF product',
        400,
      )
    }
    const groupId = optionalString(input.groupId, 200)
    const questionId = optionalString(input.questionId, 200)
    const blockId = optionalString(input.blockId, 200)
    const mediaId = optionalString(input.mediaId, 200)
    const contentNodeId = optionalString(input.contentNodeId, 200)
    const pageNumber = input.pageNumber == null || input.pageNumber === ''
      ? null
      : Number(input.pageNumber)
    if (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > 1000)) {
      throw storeError('IMPORT_REVIEW_PAGE_INVALID', 'Issue page is invalid', 400)
    }
    if (
      surface !== 'paper'
      && !groupId
      && !questionId
      && !blockId
      && !mediaId
      && !contentNodeId
      && pageNumber === null
    ) {
      throw storeError('IMPORT_REVIEW_TARGET_REQUIRED', 'Issue needs a semantic target or page', 400)
    }
    const rect = normalizeRect(input.rect)
    const message = requiredString(input.message, 'message', 4000)
    const publicationDigest = optionalString(input.publicationDigest, 80)
    const timestamp = nowIso()
    const id = `issue-${randomUUID()}`
    withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = db.prepare(`
          SELECT p.latest_revision_id, r.state, r.manifest_json, r.bundle_digest
          FROM import_review_papers p
          LEFT JOIN import_review_revisions r ON r.id = p.latest_revision_id
          WHERE p.paper_id = ?
        `).get(paperId)
        if (!current) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
        assertPaperNotShipping(db, paperId)
        const publication = publicationDigest ? publicationForFeedback(db, paperId, input) : null
        if (publication && publication.revisionId !== revisionId) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Feedback differs from the viewed publication')
        }
        if (!publication && (current.latest_revision_id !== revisionId || current.state === 'uploading')) {
          throw storeError(
            'IMPORT_REVIEW_STALE_REVISION',
            'Issues must target the latest finalized revision',
          )
        }
        if (surface === 'paper' && (publication || input.bundleDigest !== current.bundle_digest)) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', '退回的试卷版本已变化，请刷新后核对。')
        }
        if (!publication && reviewKind(parseJson(current.manifest_json, {})) !== 'candidate') {
          throw storeError(
            'IMPORT_REVIEW_CANDIDATE_REQUIRED',
            'OCR review uses exact observation confirmation instead of Candidate issues',
          )
        }
        db.prepare(`
          INSERT INTO import_review_issues (
            id, paper_id, revision_id, surface, edition, group_id, question_id, block_id,
            media_id, content_node_id, page_number, rect_json, message, state,
            created_by, created_at, updated_at, publication_digest
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
        `).run(
          id,
          paperId,
          revisionId,
          surface,
          edition,
          groupId,
          questionId,
          blockId,
          mediaId,
          contentNodeId,
          pageNumber,
          rect ? JSON.stringify(rect) : null,
          message,
          actor,
          timestamp,
          timestamp,
          publicationDigest,
        )
        // Published evidence and its approval remain immutable. An open issue
        // blocks later approval/promotion but never withdraws the public paper.
        const wasPublished = db.prepare(`SELECT 1 FROM import_review_promotions
          WHERE revision_id = ? AND state = 'published' LIMIT 1`).get(revisionId)
        if (!wasPublished) db.prepare(`
          UPDATE import_review_revisions
          SET state = 'changes_requested', approval_receipt_json = NULL, updated_at = ?
          WHERE id = ?
        `).run(timestamp, revisionId)
        db.prepare(`UPDATE import_review_papers SET updated_at = ? WHERE paper_id = ?`)
          .run(timestamp, paperId)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
    return paperDetail(paperId)
  }

  function publicationForFeedback(db, paperId, input) {
    if (!SHA256.test(input?.publicationDigest || '')
      || !Number.isSafeInteger(input.sourceAssetVersion) || input.sourceAssetVersion < 1) {
      throw storeError('IMPORT_REVIEW_PUBLICATION_INVALID', 'Exact publication identity is required', 400)
    }
    const rows = db.prepare(`SELECT * FROM import_review_promotions
      WHERE paper_id = ? AND canonical_publication_digest = ? AND asset_version = ? AND state = 'published'`)
      .all(paperId, input.publicationDigest, input.sourceAssetVersion)
    if (rows.length !== 1) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Exact published Review version not found', 404)
    const publication = promotionRow(db, rows[0])
    return { revisionId: publication.revisionId, bundleDigest: publication.bundleDigest,
      publicationDigest: publication.canonicalPublicationDigest, sourceAssetVersion: publication.assetVersion }
  }

  function publishedReview(paperId, input) {
    return withDb(false, db => publicationForFeedback(db, paperId, input))
  }

  function confirmMediaDerivation(paperId, revisionId, input, actor) {
    const bundleDigest = requiredString(input?.bundleDigest, 'bundleDigest', 160)
    const mediaId = requiredString(input?.mediaId, 'mediaId', 200)
    const sourceSha256 = requiredString(input?.sourceSha256, 'sourceSha256', 80)
    const candidateSha256 = requiredString(input?.candidateSha256, 'candidateSha256', 80)
    const presentationDigest = requiredString(
      input?.presentationDigest,
      'presentationDigest',
      80,
    )
    if (
      !input?.checklist
      || typeof input.checklist !== 'object'
      || Array.isArray(input.checklist)
      || Object.keys(input.checklist).length !== MEDIA_AI_CONFIRMATION_CHECKS.length
      || MEDIA_AI_CONFIRMATION_CHECKS.some((key) => input.checklist[key] !== true)
    ) {
      throw storeError(
        'IMPORT_REVIEW_MEDIA_CHECKLIST_INCOMPLETE',
        'Every media fidelity and source-authority check must be confirmed',
        400,
      )
    }
    const revision = getRevision(revisionId)
    if (
      !revision
      || revision.paperId !== paperId
      || revision.bundleDigest !== bundleDigest
      || !['awaiting_review', 'changes_requested'].includes(revision.state)
    ) {
      throw storeError(
        'IMPORT_REVIEW_MEDIA_REVISION_STALE',
        'Media confirmation must bind the latest reviewable revision',
      )
    }
    const latest = paperDetail(paperId)
    if (latest.latestRevisionId !== revisionId) {
      throw storeError(
        'IMPORT_REVIEW_MEDIA_REVISION_STALE',
        'Media confirmation must bind the latest reviewable revision',
      )
    }
    const { projection } = projectionForRevision(revisionId)
    const derivation = projection.mediaDerivations?.find((candidate) =>
      candidate.mediaId === mediaId)
    if (
      !derivation?.candidate
      || derivation.candidate.kind !== 'ai_assisted_redraw'
      || derivation.publication.selection !== 'source_crop'
      || derivation.source.sha256 !== sourceSha256
      || derivation.candidate.sha256 !== candidateSha256
      || derivation.presentationDigest !== presentationDigest
    ) {
      throw storeError(
        'IMPORT_REVIEW_MEDIA_IDENTITY_MISMATCH',
        'Media confirmation does not match the immutable source, Candidate, and layout intent',
        400,
      )
    }
    const confirmedAt = nowIso()
    const confirmedBy = requiredString(actor, 'actor', 200)
    const confirmationId = `media-confirmation-${randomUUID()}`
    const receipt = {
      schemaVersion: 'web-import-media-confirmation-v1',
      confirmationId,
      paperId,
      revisionId,
      bundleDigest,
      mediaId,
      sourceSha256,
      candidateSha256,
      presentationDigest,
      reviewMethod: 'side_by_side_overlay',
      checklist: Object.fromEntries(MEDIA_AI_CONFIRMATION_CHECKS.map((key) => [key, true])),
      confirmedBy,
      confirmedAt,
    }
    return withDb(true, (db) => {
      const existing = db.prepare(`
        SELECT receipt_json
        FROM import_review_media_confirmations
        WHERE revision_id = ? AND media_id = ? AND source_sha256 = ?
          AND candidate_sha256 = ? AND presentation_digest = ?
      `).get(
        revisionId,
        mediaId,
        sourceSha256,
        candidateSha256,
        presentationDigest,
      )
      if (existing) return parseJson(existing.receipt_json)
      db.prepare(`
        INSERT INTO import_review_media_confirmations (
          id, paper_id, revision_id, media_id, source_sha256,
          candidate_sha256, presentation_digest, receipt_json,
          confirmed_by, confirmed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        confirmationId,
        paperId,
        revisionId,
        mediaId,
        sourceSha256,
        candidateSha256,
        presentationDigest,
        JSON.stringify(receipt),
        confirmedBy,
        confirmedAt,
      )
      return receipt
    })
  }

  function mediaConfirmation(revisionId, mediaId) {
    return withDb(false, (db) => {
      const row = db.prepare(`
        SELECT receipt_json
        FROM import_review_media_confirmations
        WHERE revision_id = ? AND media_id = ?
        ORDER BY confirmed_at DESC
        LIMIT 1
      `).get(revisionId, mediaId)
      if (!row) {
        throw storeError(
          'IMPORT_REVIEW_MEDIA_CONFIRMATION_PENDING',
          'Media confirmation is not available',
          404,
        )
      }
      return parseJson(row.receipt_json)
    })
  }

  function updateIssue(paperId, issueId, input) {
    const action = requiredString(input?.action, 'action', 30)
    const nextState = ({ close: 'closed', dismiss: 'dismissed', reopen: 'open' })[action]
    if (!nextState) throw storeError('IMPORT_REVIEW_ACTION_INVALID', 'Issue action is invalid', 400)
    const timestamp = nowIso()
    withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        assertPaperNotShipping(db, paperId)
        const issue = db.prepare(`
          SELECT * FROM import_review_issues WHERE id = ? AND paper_id = ?
        `).get(issueId, paperId)
        if (!issue) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Issue not found', 404)
        const latest = db.prepare(`
          SELECT p.latest_revision_id, r.manifest_json
          FROM import_review_papers p
          LEFT JOIN import_review_revisions r ON r.id = p.latest_revision_id
          WHERE p.paper_id = ?
        `).get(paperId)
        if (input.revisionId !== undefined && latest?.latest_revision_id !== input.revisionId) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', '反馈对应的待审版本已变化，请刷新后核对。')
        }
        if (reviewKind(parseJson(latest?.manifest_json, {})) !== 'candidate') {
          throw storeError(
            'IMPORT_REVIEW_CANDIDATE_REQUIRED',
            'Candidate issues cannot mutate an OCR review revision',
          )
        }
        if (nextState === 'closed' && issue.state !== 'fixed_pending_review') {
          throw storeError('IMPORT_REVIEW_ISSUE_NOT_FIXED', 'Only an Agent-fixed issue can be closed')
        }
        db.prepare(`
          UPDATE import_review_issues SET state = ?, resolution_note = ?, updated_at = ?
          WHERE id = ?
        `).run(nextState, optionalString(input.note, 2000), timestamp, issueId)
        if (nextState === 'open') {
          db.prepare(`
            UPDATE import_review_revisions
            SET state = 'changes_requested', approval_receipt_json = NULL, updated_at = ?
            WHERE id = ?
          `).run(timestamp, latest.latest_revision_id)
        }
        db.prepare(`UPDATE import_review_papers SET updated_at = ? WHERE paper_id = ?`)
          .run(timestamp, paperId)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
    return paperDetail(paperId)
  }

  function addIssueMessage(paperId, issueId, input, actor, authorKind) {
    if (!['owner', 'agent'].includes(authorKind)) {
      throw storeError('IMPORT_REVIEW_AUTHOR_INVALID', 'Issue message author is invalid', 400)
    }
    const message = requiredString(input?.message, 'message', 4000)
    const timestamp = nowIso()
    withDb(true, (db) => {
      const issue = db.prepare(`
        SELECT id FROM import_review_issues WHERE id = ? AND paper_id = ?
      `).get(issueId, paperId)
      if (!issue) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Issue not found', 404)
      db.prepare(`
        INSERT INTO import_review_issue_messages (
          id, issue_id, author_kind, author_name, message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `message-${randomUUID()}`,
        issueId,
        authorKind,
        requiredString(actor, 'actor', 200),
        message,
        timestamp,
      )
      db.prepare(`UPDATE import_review_papers SET updated_at = ? WHERE paper_id = ?`)
        .run(timestamp, paperId)
    })
    return paperDetail(paperId)
  }

  function approveRevision(paperId, revisionId, input, actor, publicationRequestId = null) {
    const approvedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const request = publicationRequestId ? db.prepare(
          'SELECT * FROM import_review_publication_requests WHERE id = ?',
        ).get(publicationRequestId) : null
        if (publicationRequestId) {
          if (!request || request.paper_id !== paperId || request.revision_id !== revisionId
            || request.state !== 'pending') {
            throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_PENDING', 'Publication request is not pending')
          }
          if (Date.parse(request.expires_at) <= Date.now()) {
            throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_EXPIRED', 'Publication request expired', 410)
          }
        }
        const rendererId = currentRendererBuildId()
        const paper = db.prepare(`
          SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?
        `).get(paperId)
        if (!paper) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
        assertPaperNotShipping(db, paperId)
        if (paper.latest_revision_id !== revisionId) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Only the latest revision can be approved')
        }
        const revision = revisionRow(db.prepare(`
          SELECT * FROM import_review_revisions WHERE id = ? AND paper_id = ?
        `).get(revisionId, paperId))
        if (!revision) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Revision not found', 404)
        if (revision.reviewKind !== 'candidate') {
          throw storeError(
            'IMPORT_REVIEW_CANDIDATE_REQUIRED',
            'OCR review must be confirmed before a Candidate revision can be approved',
          )
        }
        if (revision.rendererBuildId !== rendererId) {
          throw storeError(
            'IMPORT_REVIEW_RENDERER_STALE',
            'Renderer changed; Agent must resubmit this bundle for a fresh review revision',
          )
        }
        if (request && (request.renderer_build_id !== rendererId || request.bundle_digest !== revision.bundleDigest)) {
          throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_STALE', 'Publication request identity changed')
        }
        if (request?.approval_id) {
          if (revision.approval?.approvalId !== request.approval_id) {
            throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_STALE', 'Publication request approval changed')
          }
          assertCurrentApprovedRevision(db, paperId, revision.approval)
          db.exec('COMMIT')
          return revision.approval
        }
        if (!['awaiting_review', 'changes_requested'].includes(revision.state)) {
          throw storeError('IMPORT_REVIEW_REVISION_NOT_REVIEWABLE', 'Revision is not awaiting review')
        }
        if (input?.bundleDigest !== revision.bundleDigest) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Browser revision digest is stale')
        }
        if (revision.manifest.importProfile && input?.approvalScope !== 'layout_only') {
          throw storeError(
            'IMPORT_REVIEW_APPROVAL_SCOPE_INVALID',
            'Public-paper approval requires approvalScope layout_only',
            400,
          )
        }
        const unresolvedCount = Number(db.prepare(`
          SELECT COUNT(*) AS count FROM import_review_issues
          WHERE paper_id = ? AND state IN ('open', 'fixed_pending_review')
        `).get(paperId).count)
        if (unresolvedCount > 0) {
          throw storeError('IMPORT_REVIEW_ISSUES_UNRESOLVED', 'Unresolved issues block approval')
        }
        assertStoredRevisionFiles(revision, db)
        const projection = projectRevision(revisionDirectory(revision.id), {
          reviewKind: revision.reviewKind,
          requireAnalyses: !revision.manifest.importProfile,
          expectedCandidateDigest: revision.candidateDigest,
        })
        assertProjectionIdentity(projection, revision)
        const externalAudio = projection?.listeningReview?.audio?.state
          === 'included_in_candidate_review'
        let externalListeningReview = null
        if (externalAudio) {
          if (input?.externalListeningReview !== undefined) {
            throw storeError(
              'IMPORT_REVIEW_EXTERNAL_LISTENING_NOT_APPLICABLE',
              'Listening is included in ordinary Screen/PDF Candidate approval',
              400,
            )
          }
          const listening = projection.materialization.listening
          externalListeningReview = {
            schemaVersion: 'external-listening-owner-review-v2',
            reviewMethod: 'owner_screen_pdf_approval',
            scope: {
              transcriptSegmentCount: listening.transcript.length,
              questionCount: listening.questions.length,
              answerCount: listening.answers.length,
            },
            audio: {
              sha256: projection.listeningReview.audio.playbackAudioSha256,
              byteLength: projection.listeningAudioBytes.byteLength,
              mediaType: projection.listeningReview.audio.mediaType,
              durationSeconds: projection.listeningReview.audio.durationSeconds,
            },
            reviewedAt: approvedAt,
            reviewedBy: actor,
          }
        } else if (input?.externalListeningReview !== undefined) {
          throw storeError(
            'IMPORT_REVIEW_EXTERNAL_LISTENING_NOT_APPLICABLE',
            'External Listening confirmation is not applicable to this revision',
            400,
          )
        }
        const receipt = {
          schemaVersion: 'web-import-review-approval-v1',
          approvalId: `approval-${randomUUID()}`,
          paperId,
          revisionId,
          revisionNumber: revision.revisionNumber,
          sourceDigest: revision.sourceDigest,
          candidateDigest: revision.candidateDigest,
          visibleStructureDigest: revision.visibleStructureDigest,
          analysisDigest: revision.manifest.analysisDigest,
          ...(revision.manifest.importProfile
            ? {
                importProfile: revision.manifest.importProfile,
                paragraphSummariesDigest: revision.manifest.paragraphSummariesDigest,
                publicSearchMetadataDigest: revision.manifest.publicSearchMetadataDigest,
                approvalScope: 'layout_only',
              }
            : {}),
          bundleDigest: revision.bundleDigest,
          producerBuildId: revision.producerBuildId,
          rendererBuildId: revision.rendererBuildId,
          approvedAt,
          approvedBy: actor,
          ...(externalListeningReview ? { externalListeningReview } : {}),
        }
        db.prepare(`
          UPDATE import_review_revisions
          SET state = 'approved', approval_receipt_json = ?, updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(receipt), approvedAt, revisionId)
        db.prepare(`UPDATE import_review_papers SET updated_at = ? WHERE paper_id = ?`)
          .run(approvedAt, paperId)
        if (request) {
          db.prepare('UPDATE import_review_publication_requests SET approval_id = ?, updated_at = ? WHERE id = ?')
            .run(receipt.approvalId, approvedAt, request.id)
        }
        db.exec('COMMIT')
        return receipt
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function mintExternalListeningPublicationProof(paperId, expected) {
    return withDb(false, (db) => {
      const { revision, approval } = assertCurrentApprovedRevision(db, paperId, expected)
      assertStoredRevisionFiles(revision, db)
      const projection = projectRevision(revisionDirectory(revision.id), {
        reviewKind: revision.reviewKind,
        requireAnalyses: true,
        expectedCandidateDigest: revision.candidateDigest,
      })
      assertProjectionIdentity(projection, revision)
      if (!['pending_external_playback_review', 'included_in_candidate_review']
        .includes(projection?.listeningReview?.audio?.state)) {
        return null
      }
      return mintLiveExternalListeningReviewProof({ approval, revision, projection })
    })
  }

  function confirmOcrRevision(paperId, revisionId, input, actor, { reviewerKind = 'owner' } = {}) {
    const { revision, projection } = projectionForRevision(revisionId)
    return commitOcrConfirmation(paperId, revisionId, input, actor, reviewerKind, revision, projection)
  }

  async function confirmUploadedOcrRevision(paperId, revisionId, input, actor, { reviewerKind = 'owner' } = {}) {
    // Retain the injected synchronous seam for internal fixtures only.
    if (projectRevision !== buildImportReviewProjection) {
      return confirmOcrRevision(paperId, revisionId, input, actor, { reviewerKind })
    }
    const revision = getRevision(revisionId)
    if (!revision || revision.state === 'uploading') {
      throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Finalized revision not found', 404)
    }
    const release = await acquireRevisionUpload(revisionDirectory(revisionId))
    try {
      await assertStoredRevisionFilesAsync(revision)
      const prepared = await runFinalizeWorker(revisionDirectory(revisionId), revision, {
        operation: 'ocr-confirmation', input, reviewerKind,
      })
      assertProjectionIdentity(prepared.projection, revision)
      assertOcrConfirmationIdentity(paperId, revision, input)
      if (prepared.confirmationError) throw restoreFinalizeError(prepared.confirmationError)
      // Finalized files cannot be uploaded. Keep the revision lease across both
      // asynchronous integrity passes and the original synchronous transaction.
      // Defer the second pass's error until after the transaction's state checks,
      // matching the old idempotent/stale/shipping error precedence.
      try {
        prepared.verifiedFiles = await assertStoredRevisionFilesAsync(revision)
      } catch (error) { prepared.fileError = error }
      return commitOcrConfirmation(
        paperId, revisionId, input, actor, reviewerKind, revision, prepared.projection, prepared,
      )
    } finally { release() }
  }

  function assertOcrConfirmationIdentity(paperId, revision, input) {
    if (revision.paperId !== paperId || revision.reviewKind !== 'ocr') {
      throw storeError('IMPORT_REVIEW_OCR_REQUIRED', 'OCR review revision not found', 404)
    }
    if (input?.bundleDigest !== revision.bundleDigest) {
      throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Browser OCR revision digest is stale')
    }
  }

  function commitOcrConfirmation(paperId, revisionId, input, actor, reviewerKind, revision, projection, prepared = null) {
    assertOcrConfirmationIdentity(paperId, revision, input)
    const { confirmation, correctionReport } = prepared || ocrConfirmationComputation(projection, input, reviewerKind)
    const confirmedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const paper = db.prepare(`
          SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?
        `).get(paperId)
        if (!paper) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
        assertPaperNotShipping(db, paperId)
        if (paper.latest_revision_id !== revisionId) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Only the latest OCR revision can be confirmed')
        }
        const current = revisionRow(db.prepare(`
          SELECT * FROM import_review_revisions WHERE id = ? AND paper_id = ?
        `).get(revisionId, paperId))
        if (!current || current.reviewKind !== 'ocr') {
          throw storeError('IMPORT_REVIEW_OCR_REQUIRED', 'OCR review revision not found', 404)
        }
        if (current.state === 'approved' && current.approval?.confirmation) {
          db.exec('COMMIT')
          return current.approval
        }
        if (current.state !== 'awaiting_review') {
          throw storeError('IMPORT_REVIEW_REVISION_NOT_REVIEWABLE', 'OCR revision is not awaiting review')
        }
        if (prepared) {
          if (prepared.fileError) throw prepared.fileError
          const files = storedRevisionFiles(current, db)
          // Recheck the exact DB file records and on-disk presence/size in the
          // write transaction; expensive byte hashing already ran asynchronously.
          if (JSON.stringify(files) !== JSON.stringify(prepared.verifiedFiles)) {
            throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', 'Stored revision file records changed')
          }
          for (const file of files) storedRevisionFilePath(current, file)
        } else {
          assertStoredRevisionFiles(current, db)
        }
        const receipt = {
          schemaVersion: 'web-import-ocr-review-confirmation-v1',
          confirmationId: `ocr-confirmation-${randomUUID()}`,
          paperId,
          revisionId,
          revisionNumber: current.revisionNumber,
          sourceSetDigest: projection.sourceSetDigest,
          evidenceDigest: projection.evidenceDigest,
          bundleDigest: current.bundleDigest,
          producerBuildId: current.producerBuildId,
          confirmedAt,
          confirmedBy: requiredString(actor, 'actor', 200),
          reviewerKind,
          ...(correctionReport ? { correctionReport, candidateReportRequired: true } : {}),
          confirmation,
        }
        db.prepare(`
          UPDATE import_review_revisions
          SET state = 'approved', approval_receipt_json = ?, updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(receipt), confirmedAt, revisionId)
        db.prepare(`UPDATE import_review_papers SET updated_at = ? WHERE paper_id = ?`)
          .run(confirmedAt, paperId)
        db.exec('COMMIT')
        return receipt
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function promotionIdentity(input) {
    const publicPaper = input?.importProfile === 'public-paper-v1'
    return {
      approvalId: requiredString(input?.approvalId, 'approvalId', 100),
      revisionId: requiredString(input?.revisionId, 'revisionId', 100),
      sourceDigest: requiredString(input?.sourceDigest, 'sourceDigest', 160),
      candidateDigest: requiredString(input?.candidateDigest, 'candidateDigest', 160),
      visibleStructureDigest: requiredString(
        input?.visibleStructureDigest,
        'visibleStructureDigest',
        160,
      ),
      ...(publicPaper
        ? {
            importProfile: input.importProfile,
            paragraphSummariesDigest: requiredString(
              input?.paragraphSummariesDigest,
              'paragraphSummariesDigest',
              160,
            ),
            publicSearchMetadataDigest: requiredString(
              input?.publicSearchMetadataDigest,
              'publicSearchMetadataDigest',
              160,
            ),
            ...(input?.analysisDigest
              ? { analysisDigest: requiredString(input.analysisDigest, 'analysisDigest', 160) }
              : {}),
          }
        : { analysisDigest: requiredString(input?.analysisDigest, 'analysisDigest', 160) }),
      bundleDigest: requiredString(input?.bundleDigest, 'bundleDigest', 160),
    }
  }

  function assertPromotionIdentity(promotion, expected) {
    for (const key of [
      'approvalId',
      'revisionId',
      'sourceDigest',
      'candidateDigest',
      'visibleStructureDigest',
      ...(expected.importProfile ? ['importProfile', 'paragraphSummariesDigest', 'publicSearchMetadataDigest'] : []),
      ...(expected.analysisDigest ? ['analysisDigest'] : []),
      'bundleDigest',
    ]) {
      if (promotion[key] !== expected[key]) {
        throw storeError(
          'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
          `Promotion ${key} does not match its immutable approval`,
        )
      }
    }
  }

  function assertCurrentApprovedRevision(db, paperId, expected) {
    const paper = db.prepare(`
      SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?
    `).get(paperId)
    if (!paper) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
    const revision = revisionRow(db.prepare(`
      SELECT * FROM import_review_revisions WHERE id = ? AND paper_id = ?
    `).get(paper.latest_revision_id, paperId))
    const approval = revision?.approval
    if (
      revision?.state !== 'approved'
      || revision.reviewKind !== 'candidate'
      || revision.id !== expected.revisionId
      || revision.rendererBuildId !== currentRendererBuildId()
      || !approval
    ) {
      throw storeError(
        'IMPORT_REVIEW_PROMOTION_STALE',
        'Only the current renderer-matched approved Candidate can be promoted',
      )
    }
    for (const key of [
      'approvalId',
      'revisionId',
      'sourceDigest',
      'candidateDigest',
      'visibleStructureDigest',
      ...(expected.importProfile
        ? ['importProfile', 'paragraphSummariesDigest', 'publicSearchMetadataDigest']
        : ['analysisDigest']),
      ...(expected.importProfile && expected.analysisDigest ? ['analysisDigest'] : []),
      'bundleDigest',
    ]) {
      if (approval[key] !== expected[key]) {
        throw storeError(
          'IMPORT_REVIEW_PROMOTION_STALE',
          `Promotion ${key} does not match current approval`,
        )
      }
    }
    const unresolvedCount = Number(db.prepare(`
      SELECT COUNT(*) AS count FROM import_review_issues
      WHERE paper_id = ? AND state IN ('open', 'fixed_pending_review')
    `).get(paperId).count)
    if (unresolvedCount > 0) {
      throw storeError('IMPORT_REVIEW_ISSUES_UNRESOLVED', 'Unresolved issues block promotion')
    }
    assertStoredRevisionFiles(revision, db)
    return { revision, approval }
  }

  function latestPromotion(paperId) {
    return withDb(false, (db) => promotionRow(db, db.prepare(`
      SELECT * FROM import_review_promotions
      WHERE paper_id = ?
      ORDER BY requested_at DESC, rowid DESC
      LIMIT 1
    `).get(paperId)))
  }

  function beginPromotion(paperId, input, actor) {
    const expected = promotionIdentity(input)
    const intent = requiredString(input?.intent, 'intent', 30)
    if (!['ship', 'retry_ship'].includes(intent)) {
      throw storeError('IMPORT_REVIEW_PROMOTION_INTENT_INVALID', 'Promotion intent is invalid', 400)
    }
    const requestedBy = requiredString(actor, 'actor', 200)
    const requestedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const existing = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE approval_id = ?
        `).get(expected.approvalId))
        if (existing) {
          if (existing.paperId !== paperId) {
            throw storeError(
              'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
              'Promotion approval belongs to another paper',
            )
          }
          assertPromotionIdentity(existing, expected)
          if (existing.state === 'published') {
            assertCurrentApprovedRevision(db, paperId, expected)
            db.exec('COMMIT')
            return { action: 'already_published', promotion: existing }
          }
          assertCurrentApprovedRevision(db, paperId, expected)
          const guard = shippingGuardRow(db.prepare(`
            SELECT * FROM import_review_shipping_guards WHERE paper_id = ?
          `).get(paperId))
          if (existing.state === 'publishing') {
            if (
              !guard
              || guard.id !== existing.guardId
              || guard.revisionId !== existing.revisionId
              || guard.approvalId !== existing.approvalId
            ) {
              throw storeError(
                'IMPORT_REVIEW_PROMOTION_GUARD_MISSING',
                'Publishing receipt has no matching durable shipping guard',
              )
            }
            if (intent !== 'retry_ship') {
              throw storeError(
                'IMPORT_REVIEW_PROMOTION_IN_PROGRESS',
                'Interrupted publishing requires a current retry-ship authorization',
              )
            }
            db.exec('COMMIT')
            return { action: 'resume', promotion: existing }
          }
          if (intent !== 'retry_ship') {
            throw storeError(
              'IMPORT_REVIEW_PROMOTION_RETRY_REQUIRED',
              'Failed promotion requires a current retry-ship authorization',
            )
          }
          if (guard) {
            throw storeError(
              'IMPORT_REVIEW_SHIPPING_IN_PROGRESS',
              `Review state is frozen by active shipping guard ${guard.id}`,
            )
          }
          const guardId = `ship-guard-${randomUUID()}`
          db.prepare(`
            INSERT INTO import_review_shipping_guards (
              id, paper_id, revision_id, approval_id, acquired_by, acquired_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            guardId,
            paperId,
            expected.revisionId,
            expected.approvalId,
            requestedBy,
            requestedAt,
          )
          db.prepare(`
            UPDATE import_review_promotions
            SET guard_id = ?, state = 'publishing', attempt_count = attempt_count + 1,
                requested_by = ?, failure_code = NULL, failure_message = NULL,
                failed_at = NULL, updated_at = ?
            WHERE id = ?
          `).run(guardId, requestedBy, requestedAt, existing.promotionId)
          const promotion = promotionRow(db, db.prepare(`
            SELECT * FROM import_review_promotions WHERE id = ?
          `).get(existing.promotionId))
          db.exec('COMMIT')
          return { action: 'retry', promotion }
        }
        if (intent !== 'ship') {
          throw storeError(
            'IMPORT_REVIEW_PROMOTION_RETRY_INVALID',
            'Retry-ship requires an existing failed promotion for this approval',
          )
        }
        assertPaperNotShipping(db, paperId)
        const { revision, approval } = assertCurrentApprovedRevision(db, paperId, expected)
        const promotionId = `promotion-${randomUUID()}`
        const guardId = `ship-guard-${randomUUID()}`
        db.prepare(`
          INSERT INTO import_review_shipping_guards (
            id, paper_id, revision_id, approval_id, acquired_by, acquired_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          guardId,
          paperId,
          revision.id,
          approval.approvalId,
          requestedBy,
          requestedAt,
        )
        db.prepare(`
          INSERT INTO import_review_promotions (
            id, paper_id, revision_id, approval_id, source_digest,
            candidate_digest, visible_structure_digest, analysis_digest,
            bundle_digest, guard_id, state, requested_by, requested_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publishing', ?, ?, ?)
        `).run(
          promotionId,
          paperId,
          revision.id,
          approval.approvalId,
          approval.sourceDigest,
          approval.candidateDigest,
          approval.visibleStructureDigest,
          approval.analysisDigest || '',
          approval.bundleDigest,
          guardId,
          requestedBy,
          requestedAt,
          requestedAt,
        )
        const promotion = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ?
        `).get(promotionId))
        db.exec('COMMIT')
        return { action: 'publish', promotion }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function publicationRequestRow(db, row) {
    if (!row) return null
    const paper = db.prepare('SELECT paper_name FROM import_review_papers WHERE paper_id = ?').get(row.paper_id)
    const revision = db.prepare('SELECT revision_number FROM import_review_revisions WHERE id = ?').get(row.revision_id)
    const promotion = row.promotion_id ? promotionRow(db, db.prepare(
      'SELECT * FROM import_review_promotions WHERE id = ?',
    ).get(row.promotion_id)) : null
    return {
      requestId: row.id,
      paperId: row.paper_id,
      paperName: paper?.paper_name || row.paper_id,
      revisionId: row.revision_id,
      revisionNumber: revision?.revision_number || null,
      approvalId: row.approval_id,
      sourceDigest: row.source_digest,
      candidateDigest: row.candidate_digest,
      visibleStructureDigest: row.visible_structure_digest,
      analysisDigest: row.analysis_digest,
      bundleDigest: row.bundle_digest,
      rendererBuildId: row.renderer_build_id,
      requestedBy: row.requested_by,
      ampThreadId: row.amp_thread_id,
      state: row.state,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      expired: Date.parse(row.expires_at) <= Date.now(),
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
      revokedBy: row.revoked_by,
      revokedAt: row.revoked_at,
      consumedAt: row.consumed_at,
      promotion,
      updatedAt: row.updated_at,
    }
  }

  function registerPublicationRequest(paperId, input, actor) {
    const requestId = requiredString(input?.requestId, 'requestId', 100)
    if (!/^publication-request-[0-9a-f-]{36}$/i.test(requestId)) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_ID_INVALID', 'Request ID is invalid', 400)
    const secretHash = requiredString(input?.secretHash, 'secretHash', 80)
    if (!SHA256.test(secretHash)) throw storeError('IMPORT_REVIEW_PUBLICATION_SECRET_INVALID', 'Request secret hash is invalid', 400)
    const revisionId = requiredString(input?.revisionId, 'revisionId', 100)
    const requestedBy = requiredString(actor, 'actor', 200)
    const ampThreadId = optionalString(input?.ampThreadId, 200)
    const ttlSeconds = input?.ttlSeconds === undefined ? 1800 : input.ttlSeconds
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
      throw storeError('IMPORT_REVIEW_PUBLICATION_TTL_INVALID', 'ttlSeconds must be an integer from 60 through 3600', 400)
    }
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const existing = db.prepare('SELECT * FROM import_review_publication_requests WHERE id = ?').get(requestId)
        if (existing) {
          const same = existing.paper_id === paperId && existing.revision_id === revisionId
            && existing.secret_hash === secretHash && existing.requested_by === requestedBy
          if (!same) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_CONFLICT', 'Request ID is already bound to another capability or target', 409)
          const result = publicationRequestRow(db, existing)
          db.exec('COMMIT')
          return result
        }
        const paper = db.prepare('SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?').get(paperId)
        if (!paper) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
        if (paper.latest_revision_id !== revisionId) throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Publication request must name the latest exact revision')
        const revision = revisionRow(db.prepare('SELECT * FROM import_review_revisions WHERE id = ? AND paper_id = ?').get(revisionId, paperId))
        if (!revision || revision.reviewKind !== 'candidate' || !['awaiting_review', 'approved'].includes(revision.state)) {
          throw storeError('IMPORT_REVIEW_REVISION_NOT_REVIEWABLE', 'Publication request requires the finalized awaiting-review or approved Candidate')
        }
        if (revision.rendererBuildId !== currentRendererBuildId()) throw storeError('IMPORT_REVIEW_RENDERER_STALE', 'Renderer changed; submit a fresh revision')
        if (Number(db.prepare("SELECT COUNT(*) count FROM import_review_issues WHERE paper_id = ? AND state IN ('open','fixed_pending_review')").get(paperId).count)) {
          throw storeError('IMPORT_REVIEW_ISSUES_UNRESOLVED', 'Unresolved issues block publication delegation')
        }
        const approval = revision.state === 'approved' ? revision.approval : null
        const createdAt = nowIso()
        const expiresAt = new Date(Date.parse(createdAt) + ttlSeconds * 1000).toISOString()
        db.prepare(`INSERT INTO import_review_publication_requests (
          id, paper_id, revision_id, approval_id, source_digest, candidate_digest,
          visible_structure_digest, analysis_digest, bundle_digest, renderer_build_id,
          secret_hash, requested_by, amp_thread_id, state, created_at, expires_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`)
          .run(requestId, paperId, revision.id, approval?.approvalId || null,
            revision.sourceDigest, revision.candidateDigest, revision.visibleStructureDigest,
            revision.manifest.analysisDigest || '', revision.bundleDigest,
            revision.rendererBuildId, secretHash, requestedBy, ampThreadId,
            createdAt, expiresAt, createdAt)
        const result = publicationRequestRow(db, db.prepare(
          'SELECT * FROM import_review_publication_requests WHERE id = ?',
        ).get(requestId))
        db.exec('COMMIT')
        return result
      } catch (error) { db.exec('ROLLBACK'); throw error }
    })
  }

  function publicationRequest(requestId, actor = null) {
    return withDb(false, (db) => {
      const result = publicationRequestRow(db, db.prepare(
        'SELECT * FROM import_review_publication_requests WHERE id = ?',
      ).get(requestId))
      if (!result) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_FOUND', 'Publication request not found', 404)
      if (actor && result.requestedBy !== actor) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_FORBIDDEN', 'Publication request belongs to another Agent', 403)
      return result
    })
  }

  function grantPublicationRequest(requestId, actor) {
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('SELECT * FROM import_review_publication_requests WHERE id = ?').get(requestId)
        if (!row) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_FOUND', 'Publication request not found', 404)
        if (row.state !== 'pending') throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_PENDING', 'Publication request is not pending')
        if (Date.parse(row.expires_at) <= Date.now()) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_EXPIRED', 'Publication request expired', 410)
        const revision = revisionRow(db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(row.revision_id))
        assertCurrentApprovedRevision(db, row.paper_id, revision.approval)
        if (revision.rendererBuildId !== row.renderer_build_id || revision.bundleDigest !== row.bundle_digest
          || revision.sourceDigest !== row.source_digest || revision.candidateDigest !== row.candidate_digest
          || revision.visibleStructureDigest !== row.visible_structure_digest
          || (revision.manifest.analysisDigest || '') !== row.analysis_digest
          || !row.approval_id || revision.approval?.approvalId !== row.approval_id) {
          throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_STALE', 'Publication request no longer matches the exact approval')
        }
        const timestamp = nowIso()
        db.prepare(`UPDATE import_review_publication_requests SET state = 'granted',
          approval_id = ?, granted_by = ?, granted_at = ?, updated_at = ? WHERE id = ? AND state = 'pending'`)
          .run(revision.approval.approvalId, requiredString(actor, 'actor', 200), timestamp, timestamp, requestId)
        const result = publicationRequestRow(db, db.prepare('SELECT * FROM import_review_publication_requests WHERE id = ?').get(requestId))
        db.exec('COMMIT')
        return result
      } catch (error) { db.exec('ROLLBACK'); throw error }
    })
  }

  function revokePublicationRequest(requestId, actor) {
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('SELECT * FROM import_review_publication_requests WHERE id = ?').get(requestId)
        if (!row) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_FOUND', 'Publication request not found', 404)
        if (!['pending', 'granted'].includes(row.state)) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_REVOCABLE', 'Publication request is not revocable')
        const timestamp = nowIso()
        const changed = db.prepare(`UPDATE import_review_publication_requests SET state = 'revoked',
          revoked_by = ?, revoked_at = ?, updated_at = ? WHERE id = ? AND state IN ('pending','granted')`)
          .run(requiredString(actor, 'actor', 200), timestamp, timestamp, requestId)
        if (changed.changes !== 1) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_NOT_REVOCABLE', 'Publication request is not revocable')
        const result = publicationRequestRow(db, db.prepare('SELECT * FROM import_review_publication_requests WHERE id = ?').get(requestId))
        db.exec('COMMIT')
        return result
      } catch (error) { db.exec('ROLLBACK'); throw error }
    })
  }

  function beginScopedPromotion(paperId, requestId, secretHash, actor) {
    const principal = requiredString(actor, 'actor', 200)
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const row = db.prepare('SELECT * FROM import_review_publication_requests WHERE id = ?').get(requestId)
        if (!row || row.paper_id !== paperId || row.requested_by !== principal || !SHA256.test(secretHash || '') || row.secret_hash !== secretHash) {
          throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_FORBIDDEN', 'Publication request capability is invalid', 403)
        }
        if (row.state === 'consumed') {
          const request = publicationRequestRow(db, row)
          db.exec('COMMIT')
          return { action: 'consumed', promotion: request.promotion }
        }
        if (row.state !== 'granted') throw storeError('IMPORT_REVIEW_PUBLICATION_GRANT_REQUIRED', 'Exact Owner publication grant is required', 403)
        if (Date.parse(row.expires_at) <= Date.now()) throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_EXPIRED', 'Publication request expired', 410)
        const revision = revisionRow(db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(row.revision_id))
        const expected = revision?.approval
        if (!expected || expected.approvalId !== row.approval_id || revision.bundleDigest !== row.bundle_digest || revision.rendererBuildId !== row.renderer_build_id) {
          throw storeError('IMPORT_REVIEW_PUBLICATION_REQUEST_STALE', 'Publication request approval or renderer drifted')
        }
        assertPaperNotShipping(db, paperId)
        const checked = assertCurrentApprovedRevision(db, paperId, expected)
        const existing = db.prepare('SELECT id FROM import_review_promotions WHERE approval_id = ?').get(expected.approvalId)
        if (existing) {
          throw storeError('IMPORT_REVIEW_PUBLICATION_ALREADY_ATTEMPTED', 'This approval already has a retained promotion; inspect its status, do not create another attempt')
        }
        const timestamp = nowIso()
        const promotionId = `promotion-${randomUUID()}`
        const guardId = `ship-guard-${randomUUID()}`
        db.prepare(`INSERT INTO import_review_shipping_guards
          (id, paper_id, revision_id, approval_id, acquired_by, acquired_at) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(guardId, paperId, checked.revision.id, checked.approval.approvalId, `publication-request:${requestId}`, timestamp)
        db.prepare(`INSERT INTO import_review_promotions (
          id, paper_id, revision_id, approval_id, source_digest, candidate_digest,
          visible_structure_digest, analysis_digest, bundle_digest, guard_id, state,
          requested_by, requested_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'publishing', ?, ?, ?)`)
          .run(promotionId, paperId, checked.revision.id, checked.approval.approvalId,
            checked.approval.sourceDigest, checked.approval.candidateDigest,
            checked.approval.visibleStructureDigest, checked.approval.analysisDigest || '',
            checked.approval.bundleDigest, guardId, `publication-request:${requestId}`, timestamp, timestamp)
        db.prepare(`UPDATE import_review_publication_requests SET state = 'consumed',
          consumed_at = ?, promotion_id = ?, updated_at = ? WHERE id = ?`)
          .run(timestamp, promotionId, timestamp, requestId)
        const promotion = promotionRow(db, db.prepare('SELECT * FROM import_review_promotions WHERE id = ?').get(promotionId))
        db.exec('COMMIT')
        return { action: 'publish', promotion }
      } catch (error) { db.exec('ROLLBACK'); throw error }
    })
  }

  function recordPromotionTarget(paperId, promotionId, input) {
    const assetVersion = Number(input?.assetVersion)
    const versionName = requiredString(input?.versionName, 'versionName', 30)
    const canonicalPublicationDigest = requiredString(
      input?.canonicalPublicationDigest,
      'canonicalPublicationDigest',
      160,
    )
    if (
      !Number.isInteger(assetVersion)
      || assetVersion < 1
      || versionName !== `v${assetVersion}`
      || !SHA256.test(canonicalPublicationDigest)
    ) {
      throw storeError('IMPORT_REVIEW_PROMOTION_TARGET_INVALID', 'Promotion target is invalid', 400)
    }
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const promotion = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ? AND paper_id = ?
        `).get(promotionId, paperId))
        if (!promotion || promotion.state !== 'publishing') {
          throw storeError('IMPORT_REVIEW_PROMOTION_NOT_PUBLISHING', 'Promotion is not active')
        }
        const guard = shippingGuardRow(db.prepare(`
          SELECT * FROM import_review_shipping_guards WHERE paper_id = ?
        `).get(paperId))
        if (!guard || guard.id !== promotion.guardId) {
          throw storeError('IMPORT_REVIEW_PROMOTION_GUARD_MISSING', 'Promotion guard is missing')
        }
        if (promotion.assetVersion !== null) {
          if (
            promotion.assetVersion !== assetVersion
            || promotion.versionName !== versionName
            || promotion.canonicalPublicationDigest !== canonicalPublicationDigest
          ) {
            throw storeError(
              'IMPORT_REVIEW_PROMOTION_TARGET_CONFLICT',
              'Promotion retry derived a different immutable publication target',
            )
          }
          db.exec('COMMIT')
          return promotion
        }
        const updatedAt = nowIso()
        db.prepare(`
          UPDATE import_review_promotions
          SET asset_version = ?, version_name = ?, canonical_publication_digest = ?, updated_at = ?
          WHERE id = ?
        `).run(
          assetVersion,
          versionName,
          canonicalPublicationDigest,
          updatedAt,
          promotionId,
        )
        const updated = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ?
        `).get(promotionId))
        db.exec('COMMIT')
        return updated
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function markPromotionPublished(paperId, promotionId, input) {
    const publishedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const promotion = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ? AND paper_id = ?
        `).get(promotionId, paperId))
        if (!promotion) throw storeError('IMPORT_REVIEW_PROMOTION_NOT_FOUND', 'Promotion not found', 404)
        const publicationDigest = requiredString(
          promotion.importProfile
            ? input?.paragraphSummariesPublicationDigest
            : input?.analysisPublicationDigest,
          promotion.importProfile
            ? 'paragraphSummariesPublicationDigest'
            : 'analysisPublicationDigest',
          160,
        )
        if (!SHA256.test(publicationDigest)) {
          throw storeError('IMPORT_REVIEW_DIGEST_INVALID', 'Published artifact digest is invalid', 400)
        }
        if (promotion.state === 'published') {
          const storedDigest = promotion.importProfile
            ? promotion.paragraphSummariesPublicationDigest
            : promotion.analysisPublicationDigest
          if (storedDigest !== publicationDigest) {
            throw storeError(
              'IMPORT_REVIEW_PROMOTION_IDENTITY_MISMATCH',
              'Published analysis digest differs from immutable receipt',
            )
          }
          db.exec('COMMIT')
          return promotion
        }
        if (
          promotion.state !== 'publishing'
          || promotion.assetVersion === null
          || !promotion.canonicalPublicationDigest
        ) {
          throw storeError('IMPORT_REVIEW_PROMOTION_NOT_PUBLISHING', 'Promotion target is incomplete')
        }
        assertCurrentApprovedRevision(db, paperId, promotion)
        const guard = shippingGuardRow(db.prepare(`
          SELECT * FROM import_review_shipping_guards WHERE paper_id = ?
        `).get(paperId))
        if (!guard || guard.id !== promotion.guardId) {
          throw storeError('IMPORT_REVIEW_PROMOTION_GUARD_MISSING', 'Promotion guard is missing')
        }
        db.prepare(`
          UPDATE import_review_promotions
          SET state = 'published', analysis_publication_digest = ?, published_at = ?, updated_at = ?
          WHERE id = ?
        `).run(publicationDigest, publishedAt, publishedAt, promotionId)
        db.prepare(`DELETE FROM import_review_shipping_guards WHERE id = ?`)
          .run(promotion.guardId)
        const updated = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ?
        `).get(promotionId))
        db.exec('COMMIT')
        return updated
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function markPromotionFailed(paperId, promotionId, input) {
    const failureCode = requiredString(input?.failureCode, 'failureCode', 160)
    const failureMessage = requiredString(input?.failureMessage, 'failureMessage', 1000)
    const failedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const promotion = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ? AND paper_id = ?
        `).get(promotionId, paperId))
        if (!promotion) throw storeError('IMPORT_REVIEW_PROMOTION_NOT_FOUND', 'Promotion not found', 404)
        if (promotion.state === 'published') {
          throw storeError('IMPORT_REVIEW_PROMOTION_ALREADY_PUBLISHED', 'Published promotion cannot fail')
        }
        if (promotion.state === 'failed') {
          db.exec('COMMIT')
          return promotion
        }
        const guard = shippingGuardRow(db.prepare(`
          SELECT * FROM import_review_shipping_guards WHERE paper_id = ?
        `).get(paperId))
        if (!guard || guard.id !== promotion.guardId) {
          throw storeError('IMPORT_REVIEW_PROMOTION_GUARD_MISSING', 'Promotion guard is missing')
        }
        db.prepare(`
          UPDATE import_review_promotions
          SET state = 'failed', failure_code = ?, failure_message = ?, failed_at = ?, updated_at = ?
          WHERE id = ?
        `).run(failureCode, failureMessage, failedAt, failedAt, promotionId)
        db.prepare(`DELETE FROM import_review_shipping_guards WHERE id = ?`)
          .run(promotion.guardId)
        const updated = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ?
        `).get(promotionId))
        db.exec('COMMIT')
        return updated
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function agentPaperStatus(paperId) {
    const detail = paperDetail(paperId)
    return {
      paperId: detail.paperId,
      paperName: detail.paperName,
      discussionThreadId: detail.discussionThreadId,
      latestRevisionId: detail.latestRevisionId,
      latest: detail.latest,
      revisions: detail.revisions,
      issues: detail.issues,
      issueMessages: detail.issueMessages,
      files: detail.files,
      visibleStructure: detail.visibleStructure,
      sourceVisuals: detail.sourceVisuals,
      sourceProvenance: detail.sourceProvenance,
      ocrReview: detail.ocrReview,
      ocrCorrectionReport: detail.ocrCorrectionReport,
      historicalOcrReport: detail.historicalOcrReport,
      ocrCorrectionReportBinding: detail.ocrCorrectionReportBinding,
      promotion: detail.promotion,
      rendererStale: detail.rendererStale,
      unresolvedCount: detail.unresolvedCount,
      approval: detail.latest?.reviewKind === 'candidate'
        && detail.latest.state === 'approved'
        && !detail.rendererStale
        ? detail.latest.approval
        : null,
      ocrConfirmation: detail.latest?.reviewKind === 'ocr'
        && detail.latest.state === 'approved'
        ? detail.latest.approval
        : null,
    }
  }

  function acquireShippingGuard(paperId, input, actor) {
    const publicPaper = input?.importProfile === 'public-paper-v1'
    const expected = {
      approvalId: requiredString(input?.approvalId, 'approvalId', 100),
      revisionId: requiredString(input?.revisionId, 'revisionId', 100),
      sourceDigest: requiredString(input?.sourceDigest, 'sourceDigest', 160),
      candidateDigest: requiredString(input?.candidateDigest, 'candidateDigest', 160),
      visibleStructureDigest: requiredString(
        input?.visibleStructureDigest,
        'visibleStructureDigest',
        160,
      ),
      ...(publicPaper
        ? {
            importProfile: input.importProfile,
            paragraphSummariesDigest: requiredString(input?.paragraphSummariesDigest, 'paragraphSummariesDigest', 160),
            publicSearchMetadataDigest: requiredString(input?.publicSearchMetadataDigest, 'publicSearchMetadataDigest', 160),
            ...(input?.analysisDigest
              ? { analysisDigest: requiredString(input.analysisDigest, 'analysisDigest', 160) }
              : {}),
          }
        : { analysisDigest: requiredString(input?.analysisDigest, 'analysisDigest', 160) }),
      bundleDigest: requiredString(input?.bundleDigest, 'bundleDigest', 160),
    }
    const acquiredAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        assertPaperNotShipping(db, paperId)
        const paper = db.prepare(`
          SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?
        `).get(paperId)
        if (!paper) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
        const revision = revisionRow(db.prepare(`
          SELECT * FROM import_review_revisions WHERE id = ? AND paper_id = ?
        `).get(paper.latest_revision_id, paperId))
        const approval = revision?.approval
        if (
          revision?.state !== 'approved'
          || revision.reviewKind !== 'candidate'
          || revision.id !== expected.revisionId
          || revision.rendererBuildId !== currentRendererBuildId()
          || !approval
        ) {
          throw storeError(
            'IMPORT_REVIEW_SHIPPING_GUARD_STALE',
            'Only the current approved revision can be frozen for shipping',
          )
        }
        for (const key of [
          'approvalId',
          'revisionId',
          'sourceDigest',
          'candidateDigest',
          'visibleStructureDigest',
          ...(expected.importProfile
            ? ['importProfile', 'paragraphSummariesDigest', 'publicSearchMetadataDigest']
            : ['analysisDigest']),
          ...(expected.importProfile && expected.analysisDigest ? ['analysisDigest'] : []),
          'bundleDigest',
        ]) {
          if (approval[key] !== expected[key]) {
            throw storeError(
              'IMPORT_REVIEW_SHIPPING_GUARD_STALE',
              `Shipping guard ${key} does not match current approval`,
            )
          }
        }
        const unresolvedCount = Number(db.prepare(`
          SELECT COUNT(*) AS count FROM import_review_issues
          WHERE paper_id = ? AND state IN ('open', 'fixed_pending_review')
        `).get(paperId).count)
        if (unresolvedCount > 0) {
          throw storeError('IMPORT_REVIEW_ISSUES_UNRESOLVED', 'Unresolved issues block shipping')
        }
        assertStoredRevisionFiles(revision, db)
        const guard = {
          id: `ship-guard-${randomUUID()}`,
          paperId,
          revisionId: revision.id,
          approvalId: approval.approvalId,
          acquiredBy: requiredString(actor, 'actor', 200),
          acquiredAt,
        }
        db.prepare(`
          INSERT INTO import_review_shipping_guards (
            id, paper_id, revision_id, approval_id, acquired_by, acquired_at
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          guard.id,
          guard.paperId,
          guard.revisionId,
          guard.approvalId,
          guard.acquiredBy,
          guard.acquiredAt,
        )
        db.exec('COMMIT')
        return guard
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function releaseShippingGuard(paperId, guardId, actor) {
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const guard = shippingGuardRow(db.prepare(`
          SELECT * FROM import_review_shipping_guards WHERE paper_id = ?
        `).get(paperId))
        if (!guard) {
          db.exec('COMMIT')
          return { released: false }
        }
        if (guard.id !== guardId || guard.acquiredBy !== actor) {
          throw storeError(
            'IMPORT_REVIEW_SHIPPING_GUARD_MISMATCH',
            'Shipping guard can only be released by its acquiring Agent',
            403,
          )
        }
        const promotion = promotionRow(db, db.prepare(`
          SELECT * FROM import_review_promotions
          WHERE guard_id = ? AND state = 'publishing'
        `).get(guardId))
        if (promotion) {
          const failedAt = nowIso()
          db.prepare(`
            UPDATE import_review_promotions
            SET state = 'failed', failure_code = 'IMPORT_REVIEW_PROMOTION_ABORTED',
                failure_message = ?, failed_at = ?, updated_at = ?
            WHERE id = ?
          `).run(
            'Promotion was explicitly aborted after the old process and production state were inspected',
            failedAt,
            failedAt,
            promotion.promotionId,
          )
          db.prepare('DELETE FROM import_review_shipping_guards WHERE id = ?').run(guardId)
          const updated = promotionRow(db, db.prepare(`
            SELECT * FROM import_review_promotions WHERE id = ?
          `).get(promotion.promotionId))
          db.exec('COMMIT')
          return { released: true, promotion: updated }
        }
        db.prepare('DELETE FROM import_review_shipping_guards WHERE id = ?').run(guardId)
        db.exec('COMMIT')
        return { released: true }
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  return {
    createRevisionUpload,
    finalizeUploadedRevision,
    beginFileUpload,
    acquireShippingGuard,
    addIssueMessage,
    approveRevision,
    agentPaperStatus,
    beginPromotion,
    beginScopedPromotion,
    completeFileUpload,
    confirmOcrRevision,
    confirmUploadedOcrRevision,
    confirmMediaDerivation,
    createIssue,
    createRevision,
    fileForUpload,
    finalizeRevision,
    getRevision,
    latestPromotion,
    linkDiscussionThread,
    listPapers,
    markPromotionFailed,
    markPromotionPublished,
    mintExternalListeningPublicationProof,
    mediaConfirmation,
    paperDetail,
    prepareProductPreview,
    productPreviewForRevision,
    projectionForRevision,
    publishedReview,
    publicationRequest,
    grantPublicationRequest,
    registerPublicationRequest,
    revokePublicationRequest,
    recordPromotionTarget,
    releaseShippingGuard,
    verifiedFileForRead,
    revisionDirectory,
    updateIssue,
    uploadStatus,
  }
}
