import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { digestJson } from '../../shared/paper-canonical/stable.mjs'

const INTAKE_ID = /^intake-[a-f0-9-]{36}$/
const SUBMISSION_ID = /^submission-[a-f0-9-]{36}$/
const FILE_ID = /^source-file-[a-f0-9-]{36}$/
const PAPER_ID = /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/
const AMP_THREAD_ID = /^T-[a-f0-9-]{36}$/
const SHA256 = /^sha256:[a-f0-9]{64}$/
const DOCUMENT_FILE_ROLES = new Set([
  'question_source',
  'official_answers',
  'question_and_answers',
])
const FILE_ROLES = new Set([...DOCUMENT_FILE_ROLES, 'listening_audio', 'analyzed_package'])
const PLATFORMS = new Set(['wechat_official', 'xiaohongshu', 'teacher_group', 'other'])
const MEDIA_TYPES = new Map([
  ['.pdf', 'application/pdf'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.mp3', 'audio/mpeg'],
  ['.zip', 'application/zip'],
])
const MAX_FILE_BYTES = 64 * 1024 * 1024
const MAX_BUNDLE_BYTES = 256 * 1024 * 1024
const MIN_LEASE_SECONDS = 60
const MAX_LEASE_SECONDS = 30 * 60
const DEFAULT_LEASE_SECONDS = 10 * 60
const ORB_RESERVATION_SECONDS = 5 * 60

function intakeError(code, message, status = 409) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

function requiredString(value, label, maxLength = 500) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength) {
    throw intakeError('SOURCE_INTAKE_INPUT_INVALID', `${label} is required`, 400)
  }
  return text
}

function optionalString(value, label, maxLength = 1000) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > maxLength) {
    throw intakeError('SOURCE_INTAKE_INPUT_INVALID', `${label} is too long`, 400)
  }
  return text || null
}

function parseJson(value, fallback = null) {
  return typeof value === 'string' && value ? JSON.parse(value) : fallback
}

function normalizeSources(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 10) {
    throw intakeError('SOURCE_INTAKE_SOURCES_INVALID', 'At least one source is required', 400)
  }
  return input.map((source) => {
    const platform = requiredString(source?.platform, 'source platform', 40)
    if (!PLATFORMS.has(platform)) {
      throw intakeError('SOURCE_INTAKE_SOURCE_PLATFORM_INVALID', 'Source platform is invalid', 400)
    }
    const sourceUrl = optionalString(source?.sourceUrl, 'source URL', 2000)
    if (sourceUrl) {
      let url
      try {
        url = new URL(sourceUrl)
      } catch {
        throw intakeError('SOURCE_INTAKE_SOURCE_URL_INVALID', 'Source URL is invalid', 400)
      }
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw intakeError('SOURCE_INTAKE_SOURCE_URL_INVALID', 'Source URL must be http(s)', 400)
      }
    }
    return {
      platform,
      sourceName: requiredString(source?.sourceName, 'source name', 300),
      sourceUrl,
    }
  })
}

export function validateSourceIntakeFileManifest(input) {
  const role = requiredString(input?.role, 'file role', 50)
  if (!FILE_ROLES.has(role)) {
    throw intakeError('SOURCE_INTAKE_FILE_ROLE_INVALID', 'File role is invalid', 400)
  }
  const fileName = requiredString(input?.fileName, 'fileName', 300)
  if (
    fileName !== path.basename(fileName)
    || fileName.includes('/')
    || fileName.includes('\\')
    || fileName === '.'
    || fileName === '..'
  ) {
    throw intakeError('SOURCE_INTAKE_FILE_NAME_INVALID', 'File name is invalid', 400)
  }
  const extension = path.extname(fileName).toLowerCase()
  const expectedMediaType = MEDIA_TYPES.get(extension)
  if (
    !expectedMediaType
    || input?.mediaType !== expectedMediaType
    || (role === 'listening_audio') !== (extension === '.mp3')
    || (role === 'analyzed_package') !== (extension === '.zip')
  ) {
    throw intakeError(
      'SOURCE_INTAKE_FILE_TYPE_INVALID',
      'Question sources accept DOCX/PDF; listening audio accepts MP3; analyzed packages accept ZIP',
      400,
    )
  }
  if (!SHA256.test(input?.sha256 || '')) {
    throw intakeError('SOURCE_INTAKE_FILE_DIGEST_INVALID', 'File SHA-256 is invalid', 400)
  }
  const byteLength = Number(input.byteLength)
  const limit = role === 'analyzed_package' ? MAX_BUNDLE_BYTES : MAX_FILE_BYTES
  if (!Number.isInteger(byteLength) || byteLength < 1 || byteLength > limit) {
    throw intakeError('SOURCE_INTAKE_FILE_SIZE_INVALID', 'File size is invalid', 413)
  }
  return {
    role,
    fileName,
    extension,
    mediaType: expectedMediaType,
    sha256: input.sha256,
    byteLength,
  }
}

function ensureShape(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS source_intakes (
      id TEXT PRIMARY KEY,
      paper_name TEXT NOT NULL,
      state TEXT NOT NULL CHECK (state IN (
        'draft', 'awaiting_answers', 'ready_for_agent', 'queued',
        'claimed', 'needs_owner', 'handed_off'
      )),
      current_submission_id TEXT,
      handed_off_paper_id TEXT,
      target_paper_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_intake_sources (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL REFERENCES source_intakes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      platform TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_url TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(intake_id, position)
    );
    CREATE TABLE IF NOT EXISTS source_intake_files (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL REFERENCES source_intakes(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN (
        'question_source', 'official_answers', 'question_and_answers', 'listening_audio', 'analyzed_package'
      )),
      file_name TEXT NOT NULL,
      extension TEXT NOT NULL,
      media_type TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      byte_length INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      uploaded_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_source_intake_active_role
      ON source_intake_files(intake_id, role) WHERE active = 1;
    CREATE TABLE IF NOT EXISTS source_intake_submissions (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL REFERENCES source_intakes(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      state TEXT NOT NULL CHECK (state IN ('queued', 'claimed', 'needs_owner', 'handed_off')),
      snapshot_json TEXT NOT NULL,
      submission_digest TEXT NOT NULL,
      needs_owner_code TEXT,
      needs_owner_message TEXT,
      handed_off_paper_id TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(intake_id, revision_number)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_source_intake_handed_off_paper
      ON source_intake_submissions(handed_off_paper_id)
      WHERE handed_off_paper_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS source_intake_claims (
      submission_id TEXT PRIMARY KEY REFERENCES source_intake_submissions(id) ON DELETE CASCADE,
      agent_id TEXT NOT NULL,
      amp_thread_id TEXT,
      lease_token TEXT NOT NULL UNIQUE,
      claimed_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_intake_orb_workers (
      submission_id TEXT PRIMARY KEY REFERENCES source_intake_submissions(id) ON DELETE CASCADE,
      submission_digest TEXT NOT NULL,
      webhook_event_id TEXT NOT NULL,
      reservation_token TEXT,
      reservation_expires_at TEXT,
      amp_thread_id TEXT UNIQUE,
      paper_id TEXT UNIQUE,
      state TEXT NOT NULL CHECK (state IN ('reserved', 'bound', 'needs_owner', 'handed_off')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS source_intake_events (
      id TEXT PRIMARY KEY,
      intake_id TEXT NOT NULL REFERENCES source_intakes(id) ON DELETE CASCADE,
      submission_id TEXT REFERENCES source_intake_submissions(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      payload_json TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_source_intakes_state_updated
      ON source_intakes(state, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_source_intake_submissions_queue
      ON source_intake_submissions(state, created_at);
    CREATE INDEX IF NOT EXISTS idx_source_intake_events_intake
      ON source_intake_events(intake_id, created_at DESC);
  `)
  const claimColumns = new Set(
    db.prepare('PRAGMA table_info(source_intake_claims)').all().map((column) => column.name),
  )
  if (!claimColumns.has('amp_thread_id')) {
    db.exec('ALTER TABLE source_intake_claims ADD COLUMN amp_thread_id TEXT')
  }
  const intakeColumns = new Set(
    db.prepare('PRAGMA table_info(source_intakes)').all().map((column) => column.name),
  )
  if (!intakeColumns.has('target_paper_id')) {
    db.exec('ALTER TABLE source_intakes ADD COLUMN target_paper_id TEXT')
  }
  if (!intakeColumns.has('package_target_json')) {
    db.exec('ALTER TABLE source_intakes ADD COLUMN package_target_json TEXT')
  }
  const sourceFileTable = db.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'source_intake_files'
  `).get()
  if (!sourceFileTable?.sql?.includes("'analyzed_package'")) {
    db.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON')
    try {
      db.exec(`
        BEGIN IMMEDIATE;
        ALTER TABLE source_intake_files RENAME TO source_intake_files_before_listening;
        DROP INDEX idx_source_intake_active_role;
        CREATE TABLE source_intake_files (
          id TEXT PRIMARY KEY,
          intake_id TEXT NOT NULL REFERENCES source_intakes(id) ON DELETE CASCADE,
          role TEXT NOT NULL CHECK (role IN (
            'question_source', 'official_answers', 'question_and_answers', 'listening_audio', 'analyzed_package'
          )),
          file_name TEXT NOT NULL,
          extension TEXT NOT NULL,
          media_type TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          byte_length INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
          uploaded_at TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO source_intake_files (
          id, intake_id, role, file_name, extension, media_type,
          sha256, byte_length, active, uploaded_at, created_at
        ) SELECT
          id, intake_id, role, file_name, extension, media_type,
          sha256, byte_length, active, uploaded_at, created_at
        FROM source_intake_files_before_listening;
        DROP TABLE source_intake_files_before_listening;
        CREATE UNIQUE INDEX idx_source_intake_active_role
          ON source_intake_files(intake_id, role) WHERE active = 1;
        COMMIT;
      `)
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK')
      throw error
    } finally {
      db.exec('PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON')
    }
  }
  const foreignKeyErrors = db.prepare('PRAGMA foreign_key_check').all()
  if (foreignKeyErrors.length > 0) {
    throw new Error(
      `Source Intake migration left ${foreignKeyErrors.length} foreign-key violation(s)`,
    )
  }
}

function sourceRow(row) {
  return {
    id: row.id,
    platform: row.platform,
    sourceName: row.source_name,
    sourceUrl: row.source_url,
    position: row.position,
  }
}

function fileRow(row) {
  if (!row) return null
  return {
    id: row.id,
    intakeId: row.intake_id,
    role: row.role,
    fileName: row.file_name,
    extension: row.extension,
    mediaType: row.media_type,
    sha256: row.sha256,
    byteLength: row.byte_length,
    active: Boolean(row.active),
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
  }
}

function submissionRow(row) {
  if (!row) return null
  return {
    id: row.id,
    intakeId: row.intake_id,
    revisionNumber: row.revision_number,
    state: row.state,
    snapshot: parseJson(row.snapshot_json, {}),
    submissionDigest: row.submission_digest,
    needsOwnerCode: row.needs_owner_code,
    needsOwnerMessage: row.needs_owner_message,
    handedOffPaperId: row.handed_off_paper_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function claimRow(row) {
  if (!row) return null
  return {
    submissionId: row.submission_id,
    agentId: row.agent_id,
    ampThreadId: row.amp_thread_id,
    leaseToken: row.lease_token,
    claimedAt: row.claimed_at,
    heartbeatAt: row.heartbeat_at,
    leaseExpiresAt: row.lease_expires_at,
  }
}

function workerRow(row) {
  if (!row) return null
  return {
    submissionId: row.submission_id,
    submissionDigest: row.submission_digest,
    webhookEventId: row.webhook_event_id,
    reservationExpiresAt: row.reservation_expires_at,
    ampThreadId: row.amp_thread_id,
    paperId: row.paper_id,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function addSeconds(iso, seconds) {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString()
}

export function sourceIntakeSubmissionDigest(snapshot) {
  return digestJson(snapshot)
}

export function createSourceIntakeStore({ dbPath, filesRoot, now = () => new Date() }) {
  mkdirSync(path.dirname(dbPath), { recursive: true })
  mkdirSync(filesRoot, { recursive: true })
  const initialize = new DatabaseSync(dbPath)
  ensureShape(initialize)
  initialize.close()

  function nowIso() {
    return now().toISOString()
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

  function transaction(db, callback) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = callback()
      db.exec('COMMIT')
      return result
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  function event(db, intakeId, submissionId, eventType, actor, payload = null) {
    db.prepare(`
      INSERT INTO source_intake_events (
        id, intake_id, submission_id, event_type, payload_json, actor, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `source-event-${randomUUID()}`,
      intakeId,
      submissionId,
      eventType,
      payload ? JSON.stringify(payload) : null,
      requiredString(actor, 'actor', 200),
      nowIso(),
    )
  }

  function intakeDirectory(intakeId) {
    if (!INTAKE_ID.test(intakeId || '')) {
      throw intakeError('SOURCE_INTAKE_ID_INVALID', 'intakeId is invalid', 400)
    }
    return path.join(filesRoot, 'source-intakes', intakeId)
  }

  function storedFilePath(file) {
    if (!FILE_ID.test(file?.id || '') || !INTAKE_ID.test(file?.intakeId || '')) {
      throw intakeError('SOURCE_INTAKE_FILE_ID_INVALID', 'Source file identity is invalid', 400)
    }
    return path.join(intakeDirectory(file.intakeId), `${file.id}${file.extension}`)
  }

  function assertIntakeExists(db, intakeId) {
    const intake = db.prepare('SELECT * FROM source_intakes WHERE id = ?').get(intakeId)
    if (!intake) throw intakeError('SOURCE_INTAKE_NOT_FOUND', 'Source intake not found', 404)
    return intake
  }

  function assertOwnerMutable(intake) {
    if (['queued', 'claimed', 'handed_off'].includes(intake.state)) {
      throw intakeError(
        'SOURCE_INTAKE_IMMUTABLE',
        'Queued, claimed, and handed-off intakes cannot be edited',
      )
    }
  }

  function importReviewPaper(db, paperId) {
    const table = db.prepare(`
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'import_review_papers'
    `).get()
    if (!table) return null
    return db.prepare(`
      SELECT paper_id, paper_name FROM import_review_papers WHERE paper_id = ?
    `).get(paperId) || null
  }

  function normalizeTargetPaperId(value) {
    const paperId = optionalString(value, 'targetPaperId', 160)
    if (paperId && !PAPER_ID.test(paperId)) {
      throw intakeError('SOURCE_INTAKE_TARGET_PAPER_ID_INVALID', 'targetPaperId is invalid', 400)
    }
    return paperId
  }

  function assertTargetPaper(db, targetPaperId) {
    if (!targetPaperId) return null
    const paper = importReviewPaper(db, targetPaperId)
    if (!paper) {
      throw intakeError(
        'SOURCE_INTAKE_TARGET_PAPER_NOT_FOUND',
        'Listening supplement target does not exist in Import Review',
        404,
      )
    }
    return paper
  }

  function assertPackageRevisionTarget(db, target) {
    const paper = db.prepare(`
      SELECT p.paper_id, p.paper_name, p.latest_revision_id, r.state
      FROM import_review_papers p JOIN import_review_revisions r ON r.id = p.latest_revision_id
      WHERE p.paper_id = ?
    `).get(target.paperId)
    if (!paper || paper.latest_revision_id !== target.revisionId) {
      throw intakeError('ANALYZED_PACKAGE_REVISION_STALE', 'Review revision changed; start a new corrected-package upload')
    }
    if (!['awaiting_review', 'changes_requested', 'approved'].includes(paper.state)) {
      throw intakeError('ANALYZED_PACKAGE_REVISION_UNAVAILABLE', 'Target revision is not available for correction')
    }
    if (db.prepare('SELECT 1 FROM import_review_shipping_guards WHERE paper_id = ?').get(target.paperId)) {
      throw intakeError('ANALYZED_PACKAGE_PAPER_SHIPPING', 'Paper is publishing; do not replace its revision')
    }
    return paper
  }

  function activeFiles(db, intakeId) {
    return db.prepare(`
      SELECT * FROM source_intake_files
      WHERE intake_id = ? AND active = 1
      ORDER BY role, created_at
    `).all(intakeId).map(fileRow)
  }

  function draftStateForFiles(files, targetPaperId = null) {
    const uploadedRoles = new Set(
      files.filter((file) => file.uploadedAt).map((file) => file.role),
    )
    if (uploadedRoles.has('analyzed_package')) {
      return uploadedRoles.size === 1 && !targetPaperId ? 'ready_for_agent' : 'draft'
    }
    if (targetPaperId) {
      return uploadedRoles.size === 1 && uploadedRoles.has('listening_audio')
        ? 'ready_for_agent'
        : 'draft'
    }
    if (
      uploadedRoles.has('question_and_answers')
      || (uploadedRoles.has('question_source') && uploadedRoles.has('official_answers'))
    ) return 'ready_for_agent'
    if (uploadedRoles.has('question_source')) return 'awaiting_answers'
    return 'draft'
  }

  function refreshDraftState(db, intakeId, timestamp = nowIso()) {
    const intake = assertIntakeExists(db, intakeId)
    const state = draftStateForFiles(activeFiles(db, intakeId), intake.target_paper_id)
    db.prepare(`
      UPDATE source_intakes
      SET state = ?, current_submission_id = NULL, updated_at = ?
      WHERE id = ?
    `).run(state, timestamp, intakeId)
    return state
  }

  function latestNotification(db, intakeId) {
    const row = db.prepare(`
      SELECT event_type, payload_json, created_at
      FROM source_intake_events
      WHERE intake_id = ? AND event_type IN (
        'agent_notification_sent', 'agent_notification_failed', 'agent_notification_skipped'
      )
      ORDER BY created_at DESC
      LIMIT 1
    `).get(intakeId)
    return row ? {
      state: row.event_type.replace('agent_notification_', ''),
      detail: parseJson(row.payload_json, {}),
      createdAt: row.created_at,
    } : null
  }

  function detailWithDb(db, intakeId) {
    const intake = assertIntakeExists(db, intakeId)
    const sources = db.prepare(`
      SELECT * FROM source_intake_sources WHERE intake_id = ? ORDER BY position
    `).all(intakeId).map(sourceRow)
    const files = activeFiles(db, intakeId)
    const currentSubmission = intake.current_submission_id
      ? submissionRow(db.prepare(`
          SELECT * FROM source_intake_submissions WHERE id = ?
        `).get(intake.current_submission_id))
      : null
    const claim = currentSubmission
      ? claimRow(db.prepare(`
          SELECT * FROM source_intake_claims WHERE submission_id = ?
        `).get(currentSubmission.id))
      : null
    const worker = currentSubmission
      ? workerRow(db.prepare(`
          SELECT * FROM source_intake_orb_workers WHERE submission_id = ?
        `).get(currentSubmission.id))
      : null
    return {
      id: intake.id,
      paperName: intake.paper_name,
      mode: intake.target_paper_id ? 'listening_supplement' : 'new_paper',
      targetPaperId: intake.target_paper_id,
      packageTarget: parseJson(intake.package_target_json),
      state: intake.state,
      sources,
      files,
      currentSubmission,
      claim: claim ? {
        agentId: claim.agentId,
        ampThreadId: claim.ampThreadId,
        claimedAt: claim.claimedAt,
        heartbeatAt: claim.heartbeatAt,
        leaseExpiresAt: claim.leaseExpiresAt,
      } : null,
      orbWorker: worker,
      handedOffPaperId: intake.handed_off_paper_id || intake.target_paper_id,
      lastNotification: latestNotification(db, intakeId),
      createdBy: intake.created_by,
      createdAt: intake.created_at,
      updatedAt: intake.updated_at,
    }
  }

  function createIntake(input, actor) {
    const targetPaperId = normalizeTargetPaperId(input?.targetPaperId)
    let paperName
    let sources
    const intakeId = `intake-${randomUUID()}`
    const timestamp = nowIso()
    withDb(true, (db) => transaction(db, () => {
      let packageTarget = null
      let previous = null
      if (input?.packageRevisionOf) {
        if (targetPaperId) throw intakeError('SOURCE_INTAKE_MODE_FILES_CONFLICT', 'Package correction cannot be a listening supplement', 400)
        previous = detailWithDb(db, requiredString(input.packageRevisionOf, 'packageRevisionOf', 100))
        if (previous.state !== 'handed_off' || !previous.handedOffPaperId) {
          throw intakeError('ANALYZED_PACKAGE_TARGET_UNAVAILABLE', 'Open the existing paper in Review before uploading a corrected package')
        }
        const paper = db.prepare('SELECT latest_revision_id FROM import_review_papers WHERE paper_id = ?')
          .get(previous.handedOffPaperId)
        packageTarget = { paperId: previous.handedOffPaperId, revisionId: paper?.latest_revision_id }
      }
      const targetPaper = packageTarget
        ? assertPackageRevisionTarget(db, packageTarget)
        : assertTargetPaper(db, targetPaperId)
      paperName = targetPaper
        ? targetPaper.paper_name
        : requiredString(input?.paperName, 'paperName', 300)
      sources = previous
        ? normalizeSources(previous.sources)
        : targetPaper
        ? [{ platform: 'other', sourceName: '听力音频补充', sourceUrl: null }]
        : normalizeSources(input?.sources)
      db.prepare(`
        INSERT INTO source_intakes (
          id, paper_name, state, target_paper_id, package_target_json, created_by, created_at, updated_at
        ) VALUES (?, ?, 'draft', ?, ?, ?, ?, ?)
      `).run(
        intakeId,
        paperName,
        targetPaperId,
        packageTarget ? JSON.stringify(packageTarget) : null,
        requiredString(actor, 'actor', 200),
        timestamp,
        timestamp,
      )
      const insertSource = db.prepare(`
        INSERT INTO source_intake_sources (
          id, intake_id, position, platform, source_name, source_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      sources.forEach((source, index) => insertSource.run(
        `source-${randomUUID()}`,
        intakeId,
        index,
        source.platform,
        source.sourceName,
        source.sourceUrl,
        timestamp,
      ))
      event(db, intakeId, null, 'draft_created', actor, {
        mode: targetPaperId ? 'listening_supplement' : 'new_paper',
        targetPaperId,
      })
    }))
    mkdirSync(intakeDirectory(intakeId), { recursive: true })
    return intakeDetail(intakeId)
  }

  function updateIntake(intakeId, input, actor) {
    const targetPaperId = normalizeTargetPaperId(input?.targetPaperId)
    withDb(true, (db) => transaction(db, () => {
      const intake = assertIntakeExists(db, intakeId)
      assertOwnerMutable(intake)
      if (intake.package_target_json && targetPaperId) {
        throw intakeError('SOURCE_INTAKE_MODE_FILES_CONFLICT', 'Package correction cannot become a listening supplement')
      }
      const targetPaper = assertTargetPaper(db, targetPaperId)
      const paperName = targetPaper
        ? targetPaper.paper_name
        : requiredString(input?.paperName, 'paperName', 300)
      const sources = targetPaper
        ? [{ platform: 'other', sourceName: '听力音频补充', sourceUrl: null }]
        : normalizeSources(input?.sources)
      const incompatible = activeFiles(db, intakeId).filter((file) => targetPaperId
        ? file.role !== 'listening_audio'
        : false)
      if (incompatible.length > 0) {
        throw intakeError(
          'SOURCE_INTAKE_MODE_FILES_CONFLICT',
          'Remove question documents before changing this intake to a listening supplement',
        )
      }
      const timestamp = nowIso()
      db.prepare(`
        UPDATE source_intakes
        SET paper_name = ?, target_paper_id = ?, updated_at = ? WHERE id = ?
      `).run(paperName, targetPaperId, timestamp, intakeId)
      db.prepare('DELETE FROM source_intake_sources WHERE intake_id = ?').run(intakeId)
      const insertSource = db.prepare(`
        INSERT INTO source_intake_sources (
          id, intake_id, position, platform, source_name, source_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      sources.forEach((source, index) => insertSource.run(
        `source-${randomUUID()}`,
        intakeId,
        index,
        source.platform,
        source.sourceName,
        source.sourceUrl,
        timestamp,
      ))
      refreshDraftState(db, intakeId, timestamp)
      event(db, intakeId, null, 'draft_updated', actor, {
        mode: targetPaperId ? 'listening_supplement' : 'new_paper',
        targetPaperId,
      })
    }))
    return intakeDetail(intakeId)
  }

  function registerFile(intakeId, input, actor) {
    const manifest = validateSourceIntakeFileManifest(input)
    const result = withDb(true, (db) => transaction(db, () => {
      const intake = assertIntakeExists(db, intakeId)
      assertOwnerMutable(intake)
      if (
        (intake.package_target_json && manifest.role !== 'analyzed_package')
        || (intake.target_paper_id && manifest.role !== 'listening_audio')
        || (!intake.target_paper_id && !FILE_ROLES.has(manifest.role))
      ) {
        throw intakeError(
          'SOURCE_INTAKE_MODE_FILES_CONFLICT',
          intake.package_target_json
            ? 'Package corrections accept exactly one ZIP'
            : 'Listening supplements accept exactly one MP3 and no question documents',
          400,
        )
      }
      const existing = fileRow(db.prepare(`
        SELECT * FROM source_intake_files
        WHERE intake_id = ? AND role = ? AND active = 1
      `).get(intakeId, manifest.role))
      if (
        existing
        && existing.fileName === manifest.fileName
        && existing.mediaType === manifest.mediaType
        && existing.sha256 === manifest.sha256
        && existing.byteLength === manifest.byteLength
      ) return { file: existing, created: false }

      const pending = fileRow(db.prepare(`
        SELECT * FROM source_intake_files
        WHERE intake_id = ? AND role = ? AND active = 0 AND uploaded_at IS NULL
          AND file_name = ? AND media_type = ? AND sha256 = ? AND byte_length = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(
        intakeId,
        manifest.role,
        manifest.fileName,
        manifest.mediaType,
        manifest.sha256,
        manifest.byteLength,
      ))
      if (pending) return { file: pending, created: false }

      const replacedRoles = manifest.role === 'analyzed_package'
        ? FILE_ROLES
        : manifest.role === 'question_and_answers'
        ? new Set([...DOCUMENT_FILE_ROLES, 'analyzed_package'])
        : new Set([manifest.role, 'analyzed_package', ...(DOCUMENT_FILE_ROLES.has(manifest.role)
          ? ['question_and_answers']
          : [])])
      const retainedBytes = activeFiles(db, intakeId)
        .filter((file) => !replacedRoles.has(file.role))
        .reduce((total, file) => total + file.byteLength, 0)
      if (retainedBytes + manifest.byteLength > MAX_BUNDLE_BYTES) {
        throw intakeError('SOURCE_INTAKE_BUNDLE_TOO_LARGE', 'Source intake bundle is too large', 413)
      }
      const file = {
        id: `source-file-${randomUUID()}`,
        intakeId,
        ...manifest,
      }
      const timestamp = nowIso()
      db.prepare(`
        INSERT INTO source_intake_files (
          id, intake_id, role, file_name, extension, media_type,
          sha256, byte_length, active, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(
        file.id,
        intakeId,
        file.role,
        file.fileName,
        file.extension,
        file.mediaType,
        file.sha256,
        file.byteLength,
        timestamp,
      )
      event(db, intakeId, null, 'file_registered', actor, {
        fileId: file.id,
        role: file.role,
        sha256: file.sha256,
        byteLength: file.byteLength,
      })
      return { file: { ...file, active: false, uploadedAt: null, createdAt: timestamp }, created: true }
    }))
    mkdirSync(intakeDirectory(intakeId), { recursive: true })
    return { ...result, intake: intakeDetail(intakeId) }
  }

  function fileForUpload(intakeId, fileId) {
    if (!FILE_ID.test(fileId || '')) {
      throw intakeError('SOURCE_INTAKE_FILE_ID_INVALID', 'Source file id is invalid', 400)
    }
    return withDb(false, (db) => {
      const intake = assertIntakeExists(db, intakeId)
      assertOwnerMutable(intake)
      const file = fileRow(db.prepare(`
        SELECT * FROM source_intake_files
        WHERE id = ? AND intake_id = ? AND (active = 1 OR uploaded_at IS NULL)
      `).get(fileId, intakeId))
      if (!file) throw intakeError('SOURCE_INTAKE_FILE_NOT_FOUND', 'Source file not found', 404)
      return { file, destination: storedFilePath(file) }
    })
  }

  function completeFileUpload(intakeId, fileId, received, actor) {
    const expected = fileForUpload(intakeId, fileId)
    if (
      expected.file.sha256 !== received.sha256
      || expected.file.byteLength !== received.byteLength
    ) {
      throw intakeError(
        'SOURCE_INTAKE_FILE_DIGEST_MISMATCH',
        'Uploaded file does not match manifest',
        400,
      )
    }
    withDb(true, (db) => transaction(db, () => {
      const timestamp = nowIso()
      const file = fileRow(db.prepare(`
        SELECT * FROM source_intake_files WHERE id = ? AND intake_id = ?
      `).get(fileId, intakeId))
      if (!file || (!file.active && file.uploadedAt)) {
        throw intakeError('SOURCE_INTAKE_FILE_NOT_FOUND', 'Source file not found', 404)
      }
      if (!file.active) {
        if (file.role === 'analyzed_package') {
          db.prepare('UPDATE source_intake_files SET active = 0 WHERE intake_id = ? AND active = 1')
            .run(intakeId)
        } else {
          db.prepare("UPDATE source_intake_files SET active = 0 WHERE intake_id = ? AND active = 1 AND role = 'analyzed_package'")
            .run(intakeId)
        }
        if (file.role === 'question_and_answers') {
          db.prepare(`
            UPDATE source_intake_files SET active = 0
            WHERE intake_id = ? AND active = 1
              AND role IN ('question_source', 'official_answers', 'question_and_answers')
          `).run(intakeId)
        } else if (DOCUMENT_FILE_ROLES.has(file.role)) {
          db.prepare(`
            UPDATE source_intake_files SET active = 0
            WHERE intake_id = ? AND active = 1 AND role IN (?, 'question_and_answers')
          `).run(intakeId, file.role)
        } else {
          db.prepare(`
            UPDATE source_intake_files SET active = 0
            WHERE intake_id = ? AND active = 1 AND role = ?
          `).run(intakeId, file.role)
        }
      }
      db.prepare(`
        UPDATE source_intake_files
        SET active = 1, uploaded_at = COALESCE(uploaded_at, ?)
        WHERE id = ? AND intake_id = ?
      `).run(timestamp, fileId, intakeId)
      refreshDraftState(db, intakeId, timestamp)
      event(db, intakeId, null, 'file_uploaded', actor, {
        fileId,
        sha256: received.sha256,
        byteLength: received.byteLength,
      })
    }))
    return intakeDetail(intakeId)
  }

  function sha256File(filePath) {
    return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`
  }

  function assertStoredFile(file) {
    const filePath = storedFilePath(file)
    if (
      !file.uploadedAt
      || !existsSync(filePath)
      || statSync(filePath).isDirectory()
      || statSync(filePath).size !== file.byteLength
      || sha256File(filePath) !== file.sha256
    ) {
      throw intakeError(
        'SOURCE_INTAKE_FILE_DIGEST_MISMATCH',
        `Stored source file changed: ${file.fileName}`,
      )
    }
    return filePath
  }

  function submissionSnapshot(db, intakeId, revisionNumber, timestamp) {
    const intake = assertIntakeExists(db, intakeId)
    const sources = db.prepare(`
      SELECT * FROM source_intake_sources WHERE intake_id = ? ORDER BY position
    `).all(intakeId).map(sourceRow).map(({ id: _id, position: _position, ...source }) => source)
    const files = activeFiles(db, intakeId).map((file) => ({
      id: file.id,
      role: file.role,
      fileName: file.fileName,
      mediaType: file.mediaType,
      sha256: file.sha256,
      byteLength: file.byteLength,
    }))
    const supplement = Boolean(intake.target_paper_id)
    const analyzedPackage = files.some((file) => file.role === 'analyzed_package')
    const packageTarget = parseJson(intake.package_target_json)
    return {
      schemaVersion: analyzedPackage
        ? 'source-intake-submission-v3'
        : supplement
        ? 'source-intake-submission-v2'
        : 'source-intake-submission-v1',
      intakeId,
      revisionNumber,
      ...(analyzedPackage ? { mode: 'analyzed_package' } : {}),
      ...(packageTarget ? { targetPaperId: packageTarget.paperId, baseRevisionId: packageTarget.revisionId } : {}),
      ...(supplement ? {
        mode: 'listening_supplement',
        targetPaperId: intake.target_paper_id,
      } : {}),
      paperName: intake.paper_name,
      sources,
      files,
      submittedAt: timestamp,
    }
  }

  function submitIntake(intakeId, actor) {
    const before = intakeDetail(intakeId)
    if (before.state !== 'ready_for_agent') {
      throw intakeError(
        'SOURCE_INTAKE_NOT_READY',
        before.targetPaperId
          ? 'A listening supplement requires exactly one uploaded MP3'
          : 'Question and official-answer files, or one complete analyzed package, are required before submission',
      )
    }
    before.files.forEach(assertStoredFile)
    const submission = withDb(true, (db) => transaction(db, () => {
      const intake = assertIntakeExists(db, intakeId)
      assertOwnerMutable(intake)
      if (intake.package_target_json) assertPackageRevisionTarget(db, JSON.parse(intake.package_target_json))
      if (
        draftStateForFiles(activeFiles(db, intakeId), intake.target_paper_id)
          !== 'ready_for_agent'
      ) {
        throw intakeError('SOURCE_INTAKE_NOT_READY', 'Source intake is no longer ready')
      }
      const revisionNumber = Number(db.prepare(`
        SELECT COALESCE(MAX(revision_number), 0) + 1 AS next
        FROM source_intake_submissions WHERE intake_id = ?
      `).get(intakeId).next)
      const timestamp = nowIso()
      const snapshot = submissionSnapshot(db, intakeId, revisionNumber, timestamp)
      const submissionDigest = sourceIntakeSubmissionDigest(snapshot)
      const submissionId = `submission-${randomUUID()}`
      db.prepare(`
        INSERT INTO source_intake_submissions (
          id, intake_id, revision_number, state, snapshot_json,
          submission_digest, created_by, created_at, updated_at
        ) VALUES (?, ?, ?, 'queued', ?, ?, ?, ?, ?)
      `).run(
        submissionId,
        intakeId,
        revisionNumber,
        JSON.stringify(snapshot),
        submissionDigest,
        requiredString(actor, 'actor', 200),
        timestamp,
        timestamp,
      )
      db.prepare(`
        UPDATE source_intakes
        SET state = 'queued', current_submission_id = ?, updated_at = ?
        WHERE id = ?
      `).run(submissionId, timestamp, intakeId)
      event(db, intakeId, submissionId, 'submission_queued', actor, { submissionDigest })
      return submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
    }))
    return { submission, intake: intakeDetail(intakeId) }
  }

  function recordNotification(submissionId, outcome, actor) {
    if (!['sent', 'failed', 'skipped'].includes(outcome?.state)) {
      throw intakeError('SOURCE_INTAKE_NOTIFICATION_INVALID', 'Notification state is invalid', 400)
    }
    return withDb(true, (db) => transaction(db, () => {
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      if (!submission) {
        throw intakeError('SOURCE_INTAKE_SUBMISSION_NOT_FOUND', 'Submission not found', 404)
      }
      event(
        db,
        submission.intakeId,
        submissionId,
        `agent_notification_${outcome.state}`,
        actor,
        outcome.reason ? { reason: String(outcome.reason).slice(0, 120) } : null,
      )
      return detailWithDb(db, submission.intakeId)
    }))
  }

  function assertQueuedForNotification(submissionId) {
    return withDb(false, (db) => {
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      if (!submission) {
        throw intakeError('SOURCE_INTAKE_SUBMISSION_NOT_FOUND', 'Submission not found', 404)
      }
      if (submission.state !== 'queued') {
        throw intakeError('SOURCE_INTAKE_NOTIFICATION_NOT_NEEDED', 'Only queued work can be notified')
      }
      return submission
    })
  }

  function intakeDetail(intakeId) {
    return withDb(false, (db) => detailWithDb(db, intakeId))
  }

  function listIntakes({ query = '', state = '' } = {}) {
    const normalizedQuery = String(query || '').trim().toLowerCase()
    const normalizedState = String(state || '').trim()
    return withDb(false, (db) => db.prepare(`
      SELECT id FROM source_intakes ORDER BY updated_at DESC, created_at DESC
    `).all()
      .map((row) => detailWithDb(db, row.id))
      .filter((intake) => !normalizedState || intake.state === normalizedState)
      .filter((intake) => {
        if (!normalizedQuery) return true
        return [
          intake.paperName,
          ...intake.sources.flatMap((source) => [source.sourceName, source.sourceUrl]),
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery))
      }))
  }

  function listQueue() {
    const timestamp = nowIso()
    return withDb(false, (db) => db.prepare(`
      SELECT s.*
      FROM source_intake_submissions s
      LEFT JOIN source_intake_claims c ON c.submission_id = s.id
      WHERE s.state = 'queued'
         OR (s.state = 'claimed' AND (c.submission_id IS NULL OR c.lease_expires_at <= ?))
      ORDER BY s.created_at
    `).all(timestamp).map(submissionRow).map((submission) => ({
      submissionId: submission.id,
      intakeId: submission.intakeId,
      revisionNumber: submission.revisionNumber,
      submissionDigest: submission.submissionDigest,
      createdAt: submission.createdAt,
    })))
  }

  function leaseSeconds(value) {
    if (value == null) return DEFAULT_LEASE_SECONDS
    const seconds = Number(value)
    if (!Number.isInteger(seconds) || seconds < MIN_LEASE_SECONDS || seconds > MAX_LEASE_SECONDS) {
      throw intakeError('SOURCE_INTAKE_LEASE_INVALID', 'Lease duration is invalid', 400)
    }
    return seconds
  }

  function normalizeAmpThreadId(value, { required = false } = {}) {
    const threadId = typeof value === 'string' ? value.trim() : ''
    if (!threadId && !required) return null
    if (!AMP_THREAD_ID.test(threadId)) {
      throw intakeError('SOURCE_INTAKE_THREAD_ID_INVALID', 'Amp thread identity is invalid', 400)
    }
    return threadId
  }

  function assertSubmissionForWorker(db, submissionId, submissionDigest) {
    if (!SUBMISSION_ID.test(submissionId || '')) {
      throw intakeError('SOURCE_INTAKE_SUBMISSION_ID_INVALID', 'submissionId is invalid', 400)
    }
    if (!SHA256.test(submissionDigest || '')) {
      throw intakeError('SOURCE_INTAKE_SUBMISSION_DIGEST_INVALID', 'submissionDigest is invalid', 400)
    }
    const submission = submissionRow(db.prepare(`
      SELECT * FROM source_intake_submissions WHERE id = ?
    `).get(submissionId))
    if (!submission) {
      throw intakeError('SOURCE_INTAKE_SUBMISSION_NOT_FOUND', 'Submission not found', 404)
    }
    if (submission.submissionDigest !== submissionDigest) {
      throw intakeError(
        'SOURCE_INTAKE_SUBMISSION_DIGEST_MISMATCH',
        'Submission digest does not match the immutable queue entry',
      )
    }
    return submission
  }

  function reserveOrbWorker(submissionId, input, actor) {
    const submissionDigest = requiredString(input?.submissionDigest, 'submissionDigest', 80)
    const webhookEventId = requiredString(input?.webhookEventId, 'webhookEventId', 200)
    return withDb(true, (db) => transaction(db, () => {
      const submission = assertSubmissionForWorker(db, submissionId, submissionDigest)
      const timestamp = nowIso()
      let worker = workerRow(db.prepare(`
        SELECT * FROM source_intake_orb_workers WHERE submission_id = ?
      `).get(submissionId))
      if (worker?.ampThreadId) {
        return {
          action: worker.state === 'bound' ? 'resume' : 'busy',
          submissionId,
          submissionDigest,
          ampThreadId: worker.ampThreadId,
          state: worker.state,
        }
      }
      if (worker?.reservationExpiresAt && worker.reservationExpiresAt > timestamp) {
        return {
          action: 'busy',
          submissionId,
          submissionDigest,
          state: worker.state,
        }
      }
      const activeClaim = claimRow(db.prepare(`
        SELECT * FROM source_intake_claims WHERE submission_id = ?
      `).get(submissionId))
      if (
        !['queued', 'claimed'].includes(submission.state)
        || (activeClaim && activeClaim.leaseExpiresAt > timestamp)
      ) {
        return {
          action: 'busy',
          submissionId,
          submissionDigest,
          state: submission.state,
        }
      }
      const reservationToken = `orb-reservation-${randomUUID()}`
      const reservationExpiresAt = addSeconds(timestamp, ORB_RESERVATION_SECONDS)
      if (worker) {
        db.prepare(`
          UPDATE source_intake_orb_workers
          SET webhook_event_id = ?, reservation_token = ?, reservation_expires_at = ?,
              state = 'reserved', updated_at = ?
          WHERE submission_id = ?
        `).run(
          webhookEventId,
          reservationToken,
          reservationExpiresAt,
          timestamp,
          submissionId,
        )
      } else {
        db.prepare(`
          INSERT INTO source_intake_orb_workers (
            submission_id, submission_digest, webhook_event_id, reservation_token,
            reservation_expires_at, state, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 'reserved', ?, ?)
        `).run(
          submissionId,
          submissionDigest,
          webhookEventId,
          reservationToken,
          reservationExpiresAt,
          timestamp,
          timestamp,
        )
      }
      event(db, submission.intakeId, submissionId, 'orb_worker_reserved', actor, {
        webhookEventId,
        reservationExpiresAt,
      })
      return {
        action: 'create',
        submissionId,
        submissionDigest,
        reservationToken,
        reservationExpiresAt,
        state: 'reserved',
      }
    }))
  }

  function bindOrbWorker(submissionId, input, actor) {
    const submissionDigest = requiredString(input?.submissionDigest, 'submissionDigest', 80)
    const reservationToken = requiredString(input?.reservationToken, 'reservationToken', 100)
    const ampThreadId = normalizeAmpThreadId(input?.ampThreadId, { required: true })
    return withDb(true, (db) => transaction(db, () => {
      const submission = assertSubmissionForWorker(db, submissionId, submissionDigest)
      const row = db.prepare(`
        SELECT * FROM source_intake_orb_workers WHERE submission_id = ?
      `).get(submissionId)
      const worker = workerRow(row)
      if (!worker) {
        throw intakeError('SOURCE_INTAKE_WORKER_RESERVATION_INVALID', 'Orb reservation is missing')
      }
      if (worker.ampThreadId) {
        if (worker.ampThreadId !== ampThreadId) {
          throw intakeError('SOURCE_INTAKE_WORKER_ALREADY_BOUND', 'Submission already has an Orb worker')
        }
        return {
          submissionId,
          submissionDigest,
          ampThreadId,
          state: worker.state,
        }
      }
      const timestamp = nowIso()
      if (
        row.reservation_token !== reservationToken
        || !worker.reservationExpiresAt
        || worker.reservationExpiresAt <= timestamp
      ) {
        throw intakeError('SOURCE_INTAKE_WORKER_RESERVATION_INVALID', 'Orb reservation is invalid or expired')
      }
      try {
        db.prepare(`
          UPDATE source_intake_orb_workers
          SET amp_thread_id = ?, reservation_token = NULL, reservation_expires_at = NULL,
              state = 'bound', updated_at = ?
          WHERE submission_id = ?
        `).run(ampThreadId, timestamp, submissionId)
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) {
          throw intakeError('SOURCE_INTAKE_THREAD_ID_CONFLICT', 'Amp thread is already bound')
        }
        throw error
      }
      event(db, submission.intakeId, submissionId, 'orb_worker_bound', actor, { ampThreadId })
      return { submissionId, submissionDigest, ampThreadId, state: 'bound' }
    }))
  }

  function assertBoundWorkerThread(db, submissionId, ampThreadId) {
    const worker = workerRow(db.prepare(`
      SELECT * FROM source_intake_orb_workers WHERE submission_id = ?
    `).get(submissionId))
    if (worker?.ampThreadId && worker.ampThreadId !== normalizeAmpThreadId(ampThreadId)) {
      throw intakeError(
        'SOURCE_INTAKE_THREAD_MISMATCH',
        'The bound Amp thread identity is required',
        403,
      )
    }
    return worker
  }

  function claimSubmission(submissionId, actor, requestedLeaseSeconds = null, ampThreadId = null) {
    if (!SUBMISSION_ID.test(submissionId || '')) {
      throw intakeError('SOURCE_INTAKE_SUBMISSION_ID_INVALID', 'submissionId is invalid', 400)
    }
    const seconds = leaseSeconds(requestedLeaseSeconds)
    return withDb(true, (db) => transaction(db, () => {
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      if (!submission) {
        throw intakeError('SOURCE_INTAKE_SUBMISSION_NOT_FOUND', 'Submission not found', 404)
      }
      const worker = assertBoundWorkerThread(db, submissionId, ampThreadId)
      if (worker && !worker.ampThreadId) {
        throw intakeError(
          'SOURCE_INTAKE_WORKER_NOT_BOUND',
          'The reserved Orb worker must be bound before claim',
        )
      }
      const currentClaim = claimRow(db.prepare(`
        SELECT * FROM source_intake_claims WHERE submission_id = ?
      `).get(submissionId))
      const timestamp = nowIso()
      if (
        currentClaim
        && currentClaim.leaseExpiresAt > timestamp
      ) {
        throw intakeError('SOURCE_INTAKE_ALREADY_CLAIMED', 'Submission already has an active claim')
      }
      if (!['queued', 'claimed'].includes(submission.state)) {
        throw intakeError('SOURCE_INTAKE_NOT_CLAIMABLE', 'Submission is not claimable')
      }
      const claim = {
        submissionId,
        agentId: requiredString(actor, 'actor', 200),
        ampThreadId: worker?.ampThreadId || null,
        leaseToken: `source-lease-${randomUUID()}`,
        claimedAt: timestamp,
        heartbeatAt: timestamp,
        leaseExpiresAt: addSeconds(timestamp, seconds),
      }
      db.prepare('DELETE FROM source_intake_claims WHERE submission_id = ?').run(submissionId)
      db.prepare(`
        INSERT INTO source_intake_claims (
          submission_id, agent_id, amp_thread_id, lease_token,
          claimed_at, heartbeat_at, lease_expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        claim.submissionId,
        claim.agentId,
        claim.ampThreadId,
        claim.leaseToken,
        claim.claimedAt,
        claim.heartbeatAt,
        claim.leaseExpiresAt,
      )
      db.prepare(`
        UPDATE source_intake_submissions SET state = 'claimed', updated_at = ? WHERE id = ?
      `).run(timestamp, submissionId)
      db.prepare(`
        UPDATE source_intakes SET state = 'claimed', updated_at = ? WHERE id = ?
      `).run(timestamp, submission.intakeId)
      event(db, submission.intakeId, submissionId, 'submission_claimed', actor, {
        ampThreadId: claim.ampThreadId,
        leaseExpiresAt: claim.leaseExpiresAt,
      })
      return { submission: { ...submission, state: 'claimed', updatedAt: timestamp }, claim }
    }))
  }

  function assertActiveClaim(db, submissionId, actor, leaseToken, ampThreadId) {
    const worker = assertBoundWorkerThread(db, submissionId, ampThreadId)
    const claim = claimRow(db.prepare(`
      SELECT * FROM source_intake_claims WHERE submission_id = ?
    `).get(submissionId))
    if (
      !claim
      || claim.agentId !== actor
      || (claim.ampThreadId && claim.ampThreadId !== normalizeAmpThreadId(ampThreadId))
      || (worker?.ampThreadId && claim.ampThreadId !== worker.ampThreadId)
      || claim.leaseToken !== leaseToken
      || claim.leaseExpiresAt <= nowIso()
    ) {
      throw intakeError(
        'SOURCE_INTAKE_CLAIM_INVALID',
        'An active matching claim is required',
        403,
      )
    }
    return claim
  }

  function claimedSubmission(submissionId, actor, leaseToken, ampThreadId = null) {
    return withDb(false, (db) => {
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      if (!submission) {
        throw intakeError('SOURCE_INTAKE_SUBMISSION_NOT_FOUND', 'Submission not found', 404)
      }
      assertActiveClaim(db, submissionId, actor, leaseToken, ampThreadId)
      return submission
    })
  }

  function heartbeat(
    submissionId,
    actor,
    leaseToken,
    requestedLeaseSeconds = null,
    ampThreadId = null,
  ) {
    const seconds = leaseSeconds(requestedLeaseSeconds)
    return withDb(true, (db) => transaction(db, () => {
      const claim = assertActiveClaim(db, submissionId, actor, leaseToken, ampThreadId)
      const timestamp = nowIso()
      const leaseExpiresAt = addSeconds(timestamp, seconds)
      db.prepare(`
        UPDATE source_intake_claims
        SET heartbeat_at = ?, lease_expires_at = ?
        WHERE submission_id = ?
      `).run(timestamp, leaseExpiresAt, submissionId)
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      event(db, submission.intakeId, submissionId, 'claim_heartbeat', actor, { leaseExpiresAt })
      return { ...claim, heartbeatAt: timestamp, leaseExpiresAt }
    }))
  }

  function fileForDownload(submissionId, fileId, actor, leaseToken, ampThreadId = null) {
    const submission = claimedSubmission(submissionId, actor, leaseToken, ampThreadId)
    const snapshotFile = submission.snapshot.files?.find((file) => file.id === fileId)
    if (!snapshotFile) {
      throw intakeError('SOURCE_INTAKE_FILE_NOT_FOUND', 'Submission file not found', 404)
    }
    const file = withDb(false, (db) => fileRow(db.prepare(`
      SELECT * FROM source_intake_files WHERE id = ? AND intake_id = ?
    `).get(fileId, submission.intakeId)))
    if (
      !file
      || file.sha256 !== snapshotFile.sha256
      || file.byteLength !== snapshotFile.byteLength
    ) {
      throw intakeError('SOURCE_INTAKE_FILE_DIGEST_MISMATCH', 'Submission file identity changed')
    }
    return { file, path: assertStoredFile(file) }
  }

  function needsOwner(submissionId, actor, leaseToken, input, ampThreadId = null) {
    const reasonCode = requiredString(input?.reasonCode, 'reasonCode', 100)
    const message = requiredString(input?.message, 'message', 2000)
    return withDb(true, (db) => transaction(db, () => {
      const worker = assertActiveClaim(db, submissionId, actor, leaseToken, ampThreadId)
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      const timestamp = nowIso()
      db.prepare(`
        UPDATE source_intake_submissions
        SET state = 'needs_owner', needs_owner_code = ?, needs_owner_message = ?, updated_at = ?
        WHERE id = ?
      `).run(reasonCode, message, timestamp, submissionId)
      db.prepare('DELETE FROM source_intake_claims WHERE submission_id = ?').run(submissionId)
      if (worker?.ampThreadId) {
        db.prepare(`
          UPDATE source_intake_orb_workers
          SET state = 'needs_owner', updated_at = ? WHERE submission_id = ?
        `).run(timestamp, submissionId)
      }
      db.prepare(`
        UPDATE source_intakes SET state = 'needs_owner', updated_at = ? WHERE id = ?
      `).run(timestamp, submission.intakeId)
      event(db, submission.intakeId, submissionId, 'submission_needs_owner', actor, {
        reasonCode,
        message,
      })
      return detailWithDb(db, submission.intakeId)
    }))
  }

  function handoff(submissionId, actor, leaseToken, input, ampThreadId = null) {
    const paperId = requiredString(input?.paperId, 'paperId', 160)
    if (!PAPER_ID.test(paperId)) {
      throw intakeError('SOURCE_INTAKE_PAPER_ID_INVALID', 'paperId is invalid', 400)
    }
    return withDb(true, (db) => transaction(db, () => {
      const worker = assertActiveClaim(db, submissionId, actor, leaseToken, ampThreadId)
      const submission = submissionRow(db.prepare(`
        SELECT * FROM source_intake_submissions WHERE id = ?
      `).get(submissionId))
      const initializationVersion = worker?.ampThreadId
        ? 'source-intake-initialization-v2'
        : input?.initialization?.schemaVersion
      if (
        !['source-intake-initialization-v1', 'source-intake-initialization-v2']
          .includes(input?.initialization?.schemaVersion)
        || input.initialization.schemaVersion !== initializationVersion
        || input.initialization.submissionId !== submissionId
        || input.initialization.submissionDigest !== submission.submissionDigest
        || input.initialization.paperId !== paperId
        || (
          input.initialization.schemaVersion === 'source-intake-initialization-v2'
          && input.initialization.ampThreadId !== normalizeAmpThreadId(ampThreadId, { required: true })
        )
      ) {
        throw intakeError(
          'SOURCE_INTAKE_INITIALIZATION_REQUIRED',
          'A matching local initialization receipt is required',
          400,
        )
      }
      const targetPaperId = submission.snapshot.targetPaperId || null
      const supplement = submission.snapshot.mode === 'listening_supplement'
      const packageCorrection = submission.snapshot.mode === 'analyzed_package' && Boolean(submission.snapshot.baseRevisionId)
      const existingPaper = supplement || packageCorrection
      if (existingPaper && paperId !== targetPaperId) {
        throw intakeError(
          'SOURCE_INTAKE_TARGET_PAPER_MISMATCH',
          'Supplement or correction must hand off to its immutable target paperId',
          400,
        )
      }
      if (packageCorrection) {
        assertPackageRevisionTarget(db, { paperId, revisionId: submission.snapshot.baseRevisionId })
      }
      if (existingPaper && !importReviewPaper(db, paperId)) {
        throw intakeError(
          'SOURCE_INTAKE_TARGET_PAPER_NOT_FOUND',
          'Listening supplement target no longer exists in Import Review',
          404,
        )
      }
      if (!existingPaper && importReviewPaper(db, paperId)) {
        throw intakeError(
          'SOURCE_INTAKE_PAPER_ID_CONFLICT',
          'paperId already exists in Import Review',
        )
      }
      const timestamp = nowIso()
      try {
        db.prepare(`
          UPDATE source_intake_submissions
          SET state = 'handed_off', handed_off_paper_id = ?, updated_at = ?
          WHERE id = ?
        `).run(existingPaper ? null : paperId, timestamp, submissionId)
      } catch (error) {
        if (String(error.message).includes('UNIQUE')) {
          throw intakeError('SOURCE_INTAKE_PAPER_ID_CONFLICT', 'paperId is already handed off')
        }
        throw error
      }
      db.prepare('DELETE FROM source_intake_claims WHERE submission_id = ?').run(submissionId)
      if (worker?.ampThreadId) {
        try {
          db.prepare(`
            UPDATE source_intake_orb_workers
            SET state = 'handed_off', paper_id = ?, updated_at = ?
            WHERE submission_id = ?
          `).run(existingPaper ? null : paperId, timestamp, submissionId)
        } catch (error) {
          if (String(error.message).includes('UNIQUE')) {
            throw intakeError('SOURCE_INTAKE_PAPER_ID_CONFLICT', 'paperId is already bound to a worker')
          }
          throw error
        }
      }
      db.prepare(`
        UPDATE source_intakes
        SET state = 'handed_off', handed_off_paper_id = ?, updated_at = ?
        WHERE id = ?
      `).run(supplement ? null : paperId, timestamp, submission.intakeId)
      event(
        db,
        submission.intakeId,
        submissionId,
        supplement ? 'listening_supplement_handed_off' : 'submission_handed_off',
        actor,
        { paperId },
      )
      return detailWithDb(db, submission.intakeId)
    }))
  }

  return {
    assertQueuedForNotification,
    bindOrbWorker,
    claimSubmission,
    claimedSubmission,
    completeFileUpload,
    createIntake,
    fileForDownload,
    fileForUpload,
    handoff,
    heartbeat,
    intakeDetail,
    listIntakes,
    listQueue,
    needsOwner,
    recordNotification,
    registerFile,
    reserveOrbWorker,
    storedFilePath,
    submitIntake,
    updateIntake,
  }
}
