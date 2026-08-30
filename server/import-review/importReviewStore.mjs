import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { MEDIA_AI_CONFIRMATION_CHECKS } from '../../shared/paper-canonical/mediaPresentation.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import {
  buildImportReviewProjection,
  resolveReviewFile,
  validateNck1OcrReviewConfirmation,
} from './revisionProjection.mjs'

const PAPER_ID = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHA256 = /^sha256:[a-f0-9]{64}$/
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024
const MAX_FILES = 200
const SURFACES = new Set(['screen', 'student_print', 'teacher_print', 'pdf', 'source'])
const UNRESOLVED_ISSUE_STATES = new Set(['open', 'fixed_pending_review'])

function storeError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
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
    sourceDigest: input.sourceDigest,
    candidateDigest: input.candidateDigest,
    visibleStructureDigest: input.visibleStructureDigest,
    ...(input.analysisDigest ? { analysisDigest: input.analysisDigest } : {}),
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
  if (input?.schemaVersion !== 'web-import-review-bundle-v1') {
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
  const manifest = {
    schemaVersion: input.schemaVersion,
    paperId,
    paperName: requiredString(input.paperName, 'paperName', 300),
    sourceDigest: requiredString(input.sourceDigest, 'sourceDigest', 160),
    candidateDigest: requiredString(input.candidateDigest, 'candidateDigest', 160),
    visibleStructureDigest: requiredString(
      input.visibleStructureDigest,
      'visibleStructureDigest',
      160,
    ),
    analysisDigest: requiredString(input.analysisDigest, 'analysisDigest', 160),
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
    manifest.analysisDigest,
  ]) {
    if (!SHA256.test(digest)) {
      throw storeError('IMPORT_REVIEW_DIGEST_INVALID', 'Review identity digest is invalid', 400)
    }
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
    CREATE TABLE IF NOT EXISTS import_review_issues (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES import_review_papers(paper_id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
      surface TEXT NOT NULL,
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

function promotionRow(row) {
  if (!row) return null
  return {
    schemaVersion: 'web-import-review-promotion-v1',
    promotionId: row.id,
    paperId: row.paper_id,
    revisionId: row.revision_id,
    approvalId: row.approval_id,
    sourceDigest: row.source_digest,
    candidateDigest: row.candidate_digest,
    visibleStructureDigest: row.visible_structure_digest,
    analysisDigest: row.analysis_digest,
    bundleDigest: row.bundle_digest,
    guardId: row.guard_id,
    state: row.state,
    attemptCount: Number(row.attempt_count),
    requestedBy: row.requested_by,
    requestedAt: row.requested_at,
    assetVersion: row.asset_version == null ? null : Number(row.asset_version),
    versionName: row.version_name,
    canonicalPublicationDigest: row.canonical_publication_digest,
    analysisPublicationDigest: row.analysis_publication_digest,
    failureCode: row.failure_code,
    failureMessage: row.failure_message,
    failedAt: row.failed_at,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  }
}

function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`
}

export function createImportReviewStore({
  dbPath,
  filesRoot,
  rendererBuildId,
  projectRevision = buildImportReviewProjection,
}) {
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

  function createRevision(rawManifest) {
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

  function assertStoredRevisionFiles(revision, currentDb = null) {
    const readFiles = (db) => db.prepare(`
      SELECT * FROM import_review_files WHERE revision_id = ? ORDER BY path
    `).all(revision.id).map(fileRow)
    const files = currentDb ? readFiles(currentDb) : withDb(false, readFiles)
    for (const file of files) {
      const filePath = resolveReviewFile(revisionDirectory(revision.id), file.path)
      if (
        !file.uploadedAt
        || !existsSync(filePath)
        || statSync(filePath).isDirectory()
        || statSync(filePath).size !== file.byteLength
        || sha256File(filePath) !== file.sha256
      ) throw storeError('IMPORT_REVIEW_FILE_DIGEST_MISMATCH', `Stored file changed: ${file.path}`)
    }
    return files
  }

  function assertProjectionIdentity(projection, revision) {
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

  function finalizeRevision(revisionId) {
    const status = uploadStatus(revisionId)
    if (status.revision.state !== 'uploading') return status.revision
    if (status.missingFiles.length > 0) {
      throw storeError('IMPORT_REVIEW_UPLOAD_INCOMPLETE', 'Revision upload is incomplete')
    }
    const directory = revisionDirectory(revisionId)
    assertStoredRevisionFiles(status.revision)
    const projection = projectRevision(directory, {
      reviewKind: status.revision.reviewKind,
      requireAnalyses: status.revision.reviewKind === 'candidate',
    })
    assertProjectionIdentity(projection, status.revision)
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
    return withDb(false, (db) => db.prepare(`
      SELECT p.paper_id, p.paper_name, p.latest_revision_id, p.updated_at,
             r.revision_number, r.state, r.bundle_digest, r.manifest_json,
             r.approval_receipt_json,
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
    `).all().map((row) => ({
      paperId: row.paper_id,
      paperName: row.paper_name,
      latestRevisionId: row.latest_revision_id,
      revisionNumber: row.revision_number,
      state: row.state || 'uploading',
      reviewKind: reviewKind(parseJson(row.manifest_json, {})),
      bundleDigest: row.bundle_digest,
      promotionState:
        parseJson(row.approval_receipt_json)?.approvalId === row.promotion_approval_id
          ? row.promotion_state
          : null,
      unresolvedCount: Number(row.unresolved_count || 0),
      updatedAt: row.updated_at,
    })))
  }

  function paperDetail(paperId) {
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
    const latestProjection = latest && latest.state !== 'uploading'
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
      latestRevisionId: paper.latest_revision_id,
      latest,
      revisions,
      issues,
      issueMessages,
      files,
      visibleStructure,
      sourceVisuals,
      mediaDerivations,
      mediaConfirmations,
      ocrReview: latestProjection?.ocrReview || null,
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
        { reviewKind: revision.reviewKind, requireAnalyses: false },
      )
      assertProjectionIdentity(projection, revision)
      projectionCache.set(revisionId, projection)
    }
    return { revision, projection: projectionCache.get(revisionId) }
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
      !groupId
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
    const timestamp = nowIso()
    const id = `issue-${randomUUID()}`
    withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const current = db.prepare(`
          SELECT p.latest_revision_id, r.state, r.manifest_json
          FROM import_review_papers p
          LEFT JOIN import_review_revisions r ON r.id = p.latest_revision_id
          WHERE p.paper_id = ?
        `).get(paperId)
        if (!current) throw storeError('IMPORT_REVIEW_NOT_FOUND', 'Paper not found', 404)
        assertPaperNotShipping(db, paperId)
        if (current.latest_revision_id !== revisionId || current.state === 'uploading') {
          throw storeError(
            'IMPORT_REVIEW_STALE_REVISION',
            'Issues must target the latest finalized revision',
          )
        }
        if (reviewKind(parseJson(current.manifest_json, {})) !== 'candidate') {
          throw storeError(
            'IMPORT_REVIEW_CANDIDATE_REQUIRED',
            'OCR review uses exact observation confirmation instead of Candidate issues',
          )
        }
        db.prepare(`
          INSERT INTO import_review_issues (
            id, paper_id, revision_id, surface, group_id, question_id, block_id,
            media_id, content_node_id, page_number, rect_json, message, state,
            created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
        `).run(
          id,
          paperId,
          revisionId,
          surface,
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
        )
        db.prepare(`
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

  function approveRevision(paperId, revisionId, input, actor) {
    const approvedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
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
        if (!['awaiting_review', 'changes_requested'].includes(revision.state)) {
          throw storeError('IMPORT_REVIEW_REVISION_NOT_REVIEWABLE', 'Revision is not awaiting review')
        }
        if (input?.bundleDigest !== revision.bundleDigest) {
          throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Browser revision digest is stale')
        }
        const unresolvedCount = Number(db.prepare(`
          SELECT COUNT(*) AS count FROM import_review_issues
          WHERE paper_id = ? AND state IN ('open', 'fixed_pending_review')
        `).get(paperId).count)
        if (unresolvedCount > 0) {
          throw storeError('IMPORT_REVIEW_ISSUES_UNRESOLVED', 'Unresolved issues block approval')
        }
        assertStoredRevisionFiles(revision, db)
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
          bundleDigest: revision.bundleDigest,
          producerBuildId: revision.producerBuildId,
          rendererBuildId: revision.rendererBuildId,
          approvedAt,
          approvedBy: actor,
        }
        db.prepare(`
          UPDATE import_review_revisions
          SET state = 'approved', approval_receipt_json = ?, updated_at = ?
          WHERE id = ?
        `).run(JSON.stringify(receipt), approvedAt, revisionId)
        db.prepare(`UPDATE import_review_papers SET updated_at = ? WHERE paper_id = ?`)
          .run(approvedAt, paperId)
        db.exec('COMMIT')
        return receipt
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  function confirmOcrRevision(paperId, revisionId, input, actor) {
    const { revision, projection } = projectionForRevision(revisionId)
    if (revision.paperId !== paperId || revision.reviewKind !== 'ocr') {
      throw storeError('IMPORT_REVIEW_OCR_REQUIRED', 'OCR review revision not found', 404)
    }
    if (input?.bundleDigest !== revision.bundleDigest) {
      throw storeError('IMPORT_REVIEW_STALE_REVISION', 'Browser OCR revision digest is stale')
    }
    const confirmation = validateNck1OcrReviewConfirmation(
      projection,
      input?.confirmation,
    )
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
        assertStoredRevisionFiles(current, db)
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
      analysisDigest: requiredString(input?.analysisDigest, 'analysisDigest', 160),
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
      'analysisDigest',
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
      'analysisDigest',
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
    return withDb(false, (db) => promotionRow(db.prepare(`
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
        const existing = promotionRow(db.prepare(`
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
          const promotion = promotionRow(db.prepare(`
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
          approval.analysisDigest,
          approval.bundleDigest,
          guardId,
          requestedBy,
          requestedAt,
          requestedAt,
        )
        const promotion = promotionRow(db.prepare(`
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
        const promotion = promotionRow(db.prepare(`
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
        const updated = promotionRow(db.prepare(`
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
    const analysisPublicationDigest = requiredString(
      input?.analysisPublicationDigest,
      'analysisPublicationDigest',
      160,
    )
    if (!SHA256.test(analysisPublicationDigest)) {
      throw storeError('IMPORT_REVIEW_DIGEST_INVALID', 'Published analysis digest is invalid', 400)
    }
    const publishedAt = nowIso()
    return withDb(true, (db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const promotion = promotionRow(db.prepare(`
          SELECT * FROM import_review_promotions WHERE id = ? AND paper_id = ?
        `).get(promotionId, paperId))
        if (!promotion) throw storeError('IMPORT_REVIEW_PROMOTION_NOT_FOUND', 'Promotion not found', 404)
        if (promotion.state === 'published') {
          if (promotion.analysisPublicationDigest !== analysisPublicationDigest) {
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
        `).run(analysisPublicationDigest, publishedAt, publishedAt, promotionId)
        db.prepare(`DELETE FROM import_review_shipping_guards WHERE id = ?`)
          .run(promotion.guardId)
        const updated = promotionRow(db.prepare(`
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
        const promotion = promotionRow(db.prepare(`
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
        const updated = promotionRow(db.prepare(`
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
      latestRevisionId: detail.latestRevisionId,
      latest: detail.latest,
      revisions: detail.revisions,
      issues: detail.issues,
      issueMessages: detail.issueMessages,
      files: detail.files,
      visibleStructure: detail.visibleStructure,
      sourceVisuals: detail.sourceVisuals,
      ocrReview: detail.ocrReview,
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
      analysisDigest: requiredString(input?.analysisDigest, 'analysisDigest', 160),
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
          'analysisDigest',
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
        const promotion = promotionRow(db.prepare(`
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
          const updated = promotionRow(db.prepare(`
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
    acquireShippingGuard,
    addIssueMessage,
    approveRevision,
    agentPaperStatus,
    beginPromotion,
    completeFileUpload,
    confirmOcrRevision,
    confirmMediaDerivation,
    createIssue,
    createRevision,
    fileForUpload,
    finalizeRevision,
    getRevision,
    latestPromotion,
    listPapers,
    markPromotionFailed,
    markPromotionPublished,
    mediaConfirmation,
    paperDetail,
    projectionForRevision,
    recordPromotionTarget,
    releaseShippingGuard,
    revisionDirectory,
    updateIssue,
    uploadStatus,
  }
}
