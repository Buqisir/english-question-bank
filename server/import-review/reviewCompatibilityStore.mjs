import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import { reviewBuildIdentityProvider } from './reviewBuildIdentity.mjs'
import { runReviewCompatibilityWorker } from './runReviewCompatibilityWorker.mjs'
import {
  checkedStoredReviewSubject, reviewCompatibilityAttempts, prepareReviewCompatibilityWrite, applyReviewCompatibilityWrite,
} from './reviewCompatibilityWrite.mjs'

const error = code => Object.assign(new Error(code), { code })
const hasTable = (db, table) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))
const identityUnknown = () => ({ result: 'unknown', reasonCode: 'TARGET_IDENTITY_INVALID', pending: false,
  targetBuildId: null, comparatorVersion: REVIEW_COMPARATOR_VERSION })
const subjectWithPreview = `SELECT s.*, v.revision_id AS preview_revision_id,
  v.bundle_digest AS preview_bundle_digest, v.renderer_build_id AS preview_renderer_build_id,
  v.payload_digest AS preview_payload_digest
  FROM review_subject s LEFT JOIN import_review_product_previews v ON v.revision_id = s.revision_id`

function compatibilityFromRows(revision, subject, rows) {
  try {
    const baseline = checkedStoredReviewSubject(subject)
    if (baseline && (baseline.row.bundle_digest !== revision.bundleDigest
      || baseline.row.source_renderer_build_id !== revision.rendererBuildId)) throw error('BASELINE_UNTRUSTED')
    if (baseline && !subject.preview_revision_id) {
      return { result: 'unknown', reasonCode: 'MISSING_BASELINE', pending: false }
    }
    if (baseline && (subject.preview_bundle_digest !== revision.bundleDigest
      || subject.preview_renderer_build_id !== revision.rendererBuildId
      || subject.preview_payload_digest !== baseline.row.consumer_digest)) throw error('BASELINE_UNTRUSTED')
    if (!rows.length) return { result: 'unknown', reasonCode: 'NOT_CHECKED', pending: true }
    for (const row of rows) {
      const evidence = JSON.parse(row.evidence_json)
      if (digestJson(evidence) !== row.evidence_digest
        || evidence.result !== row.result || evidence.reasonCode !== row.reason_code
        || row.bundle_digest !== revision.bundleDigest
        || (row.subject_digest && row.subject_digest !== baseline?.row.subject_digest)) throw error('BASELINE_UNTRUSTED')
    }
    const row = rows[0]
    if (row.result === 'equal' && !baseline) throw error('BASELINE_UNTRUSTED')
    return { result: row.result, reasonCode: row.reason_code, pending: false, attemptNo: row.attempt_no,
      subjectDigest: row.subject_digest, targetBuildId: row.target_build_id,
      comparatorVersion: row.comparator_version, checkedAt: row.checked_at }
  } catch { return { result: 'unknown', reasonCode: 'BASELINE_UNTRUSTED', pending: false } }
}

export function getReviewCompatibility(db, revision, targetDescriptor) {
  const subject = hasTable(db, 'review_subject')
    ? db.prepare(`${subjectWithPreview} WHERE s.revision_id = ?`).get(revision.id) : null
  const rows = hasTable(db, 'review_compatibility') ? db.prepare(`SELECT * FROM review_compatibility
    WHERE revision_id = ? AND target_build_id = ? AND comparator_version = ? ORDER BY attempt_no DESC`)
    .all(revision.id, targetDescriptor.targetBuildId, REVIEW_COMPARATOR_VERSION) : []
  return compatibilityFromRows(revision, subject, rows)
}

// List reads the latest-revision namespace in two queries, without deriving
// content or issuing a subject/attempt query for each paper.
export function getLatestReviewCompatibilities(db, revisions, targetDescriptor) {
  const subjects = new Map(db.prepare(`${subjectWithPreview}
    JOIN import_review_papers p ON p.latest_revision_id = s.revision_id`).all().map(row => [row.revision_id, row]))
  const attempts = Map.groupBy(db.prepare(`SELECT c.* FROM review_compatibility c
    JOIN import_review_papers p ON p.latest_revision_id = c.revision_id
    WHERE c.target_build_id = ? AND c.comparator_version = ? ORDER BY c.attempt_no DESC`)
    .all(targetDescriptor.targetBuildId, REVIEW_COMPARATOR_VERSION), row => row.revision_id)
  return new Map(revisions.map(revision => [revision.id,
    compatibilityFromRows(revision, subjects.get(revision.id), attempts.get(revision.id) || [])]))
}

// Caller owns BEGIN IMMEDIATE. These are INSERT-only; no UPDATE/REPLACE/DELETE.
// Used by finalize in its existing preview/state transaction and by CAS below.
export function appendReviewCompatibility(db, revision, baseline, comparison) {
  if (!db.isTransaction) throw error('REVIEW_TRANSACTION_REQUIRED')
  const subject = db.prepare('SELECT * FROM review_subject WHERE revision_id = ?').get(revision.id)
  const previous = reviewCompatibilityAttempts(db, revision.id, comparison.targetBuildId)
  return applyReviewCompatibilityWrite(db, prepareReviewCompatibilityWrite(revision, subject, previous, baseline, comparison))
}

// Snapshot values are raw SQLite cells (including exact JSON strings), not
// decoded JSON. Compare every cell directly instead of serializing/hashing a
// potentially large preview again while holding the write transaction.
function sameSnapshot(left, right) {
  if (left === right) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  if (left instanceof Uint8Array || right instanceof Uint8Array) {
    return left instanceof Uint8Array && right instanceof Uint8Array && Buffer.compare(left, right) === 0
  }
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length
    && keys.every(key => Object.hasOwn(right, key) && sameSnapshot(left[key], right[key]))
}
function snapshot(db, revisionId) {
  const revision = db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(revisionId)
  if (!revision) return null
  const paper = db.prepare('SELECT * FROM import_review_papers WHERE paper_id = ?').get(revision.paper_id)
  const related = {}
  for (const table of ['issues', 'media_confirmations', 'shipping_guards', 'promotions', 'publication_requests']) {
    related[table] = db.prepare(`SELECT * FROM import_review_${table} WHERE paper_id = ? ORDER BY rowid`).all(revision.paper_id)
  }
  return { revision, paper, ...related,
    files: db.prepare('SELECT * FROM import_review_files WHERE revision_id = ? ORDER BY path').all(revisionId),
    preview: db.prepare('SELECT * FROM import_review_product_previews WHERE revision_id = ?').get(revisionId) ?? null,
    subject: hasTable(db, 'review_subject')
      ? db.prepare('SELECT * FROM review_subject WHERE revision_id = ?').get(revisionId) ?? null : null }
}

function revisionValue(row) {
  const manifest = JSON.parse(row.manifest_json)
  return { id: row.id, paperId: row.paper_id, state: row.state,
    reviewKind: manifest.schemaVersion === 'web-import-ocr-review-bundle-v1' ? 'ocr' : 'candidate', rendererBuildId: row.renderer_build_id,
    bundleDigest: row.bundle_digest, sourceDigest: row.source_digest, candidateDigest: row.candidate_digest,
    visibleStructureDigest: row.visible_structure_digest, manifest }
}
const eligible = value => value && value.paper.latest_revision_id === value.revision.id
  && ['awaiting_review', 'changes_requested', 'approved'].includes(value.revision.state)
  && !value.shipping_guards.length && !value.promotions.some(row => row.state === 'publishing')
  && revisionValue(value.revision).reviewKind === 'candidate'

export function createReviewCompatibilityStore({ dbPath, filesRoot, repoRoot, production } = {}) {
  const descriptor = reviewBuildIdentityProvider({ repoRoot, production })
  const jobs = new WeakMap()
  const results = new WeakMap()
  const pending = new Set()
  function withDb(write, callback) {
    const db = new DatabaseSync(dbPath, { readOnly: !write })
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000')
    try { return callback(db) } finally { db.close() }
  }
  function prepare(revisionId) {
    if (!/^rev-[a-f0-9-]{36}$/.test(revisionId || '')) throw error('REVIEW_REVISION_INVALID')
    if (isBusy()) return null
    const value = withDb(false, db => snapshot(db, revisionId))
    if (!eligible(value)) return null
    const target = descriptor()
    const job = Object.freeze({ revisionId, targetBuildId: target.targetBuildId })
    jobs.set(job, { value, target })
    pending.add(revisionId)
    return job
  }
  async function compute(job, options = {}) {
    const captured = jobs.get(job)
    if (!captured) throw error('REVIEW_JOB_INVALID')
    const value = captured.value
    const revision = revisionValue(value.revision)
    const output = await runReviewCompatibilityWorker({
      directory: path.join(filesRoot, revision.id), revision, preview: value.preview,
      storedFiles: value.files.map(row => ({ path: row.path, role: row.role, mediaType: row.media_type,
        sha256: row.sha256, byteLength: row.byte_length })),
      storedSubjectJson: value.subject?.subject_json ?? null,
      targetBuildId: captured.target.targetBuildId,
    }, options)
    // Keep our own copy: mutating the diagnostic object returned to an internal
    // caller cannot forge equal, baseline, projection or build identity.
    results.set(output, { job, output: structuredClone(output) })
    return output
  }
  async function commit(job, output) {
    const captured = jobs.get(job)
    const computed = results.get(output)
    if (!captured || computed?.job !== job) throw error('REVIEW_RESULT_INVALID')
    try {
      let currentTarget
      try {
        currentTarget = await descriptor.fresh({
          dbPath, revision: revisionValue(captured.value.revision), subject: captured.value.subject,
          baseline: computed.output.baseline, comparison: computed.output.comparison,
          expectedTargetBuildId: captured.target.targetBuildId,
        })
      }
      catch { return { committed: false, reasonCode: 'TARGET_IDENTITY_INVALID' } }
      if (currentTarget.targetBuildId !== captured.target.targetBuildId) return { committed: false, reasonCode: 'TARGET_CHANGED' }
      if (jobs.get(job) !== captured || results.get(output) !== computed) return { committed: false, reasonCode: 'REVIEW_JOB_INVALID' }
      const { comparison, executionIdentity } = computed.output
      if (comparison.targetBuildId !== captured.target.targetBuildId
        || ['TARGET_CHANGED', 'TARGET_IDENTITY_MISMATCH', 'TARGET_IDENTITY_INVALID'].includes(comparison.reasonCode)
        || (comparison.result !== 'unknown' && !executionIdentity)
        || (executionIdentity && (executionIdentity.targetBuildId !== captured.target.targetBuildId
          || executionIdentity.releaseRoot !== captured.target.releaseRoot))) {
        return { committed: false, reasonCode: 'TARGET_IDENTITY_MISMATCH' }
      }
      return withDb(true, db => {
        db.exec('BEGIN IMMEDIATE')
        try {
          const current = snapshot(db, job.revisionId)
          if (!eligible(current) || !sameSnapshot(current, captured.value)
            || !sameSnapshot(reviewCompatibilityAttempts(db, job.revisionId, captured.target.targetBuildId), currentTarget.previous)) {
            db.exec('ROLLBACK')
            return { committed: false, reasonCode: 'CAS_CHANGED' }
          }
          const { comparison } = computed.output
          if (['LEADER_BUSY', 'ACTIVITY_PENDING'].includes(comparison.reasonCode)) {
            db.exec('ROLLBACK')
            return { committed: false, reasonCode: comparison.reasonCode }
          }
          const outcome = applyReviewCompatibilityWrite(db, currentTarget.writePlan)
          db.exec('COMMIT')
          return { committed: true, ...outcome }
        } catch (failure) { if (db.isTransaction) db.exec('ROLLBACK'); throw failure }
      })
    } finally { pending.delete(job.revisionId); jobs.delete(job); results.delete(output) }
  }
  async function checkRevision(revisionId, options = {}) {
    try {
      await descriptor.ready(options)
      const job = prepare(revisionId)
      if (!job) return { committed: false, reasonCode: 'NOT_ELIGIBLE' }
      const output = await compute(job, options)
      return { ...await commit(job, output), comparison: output.comparison }
    } catch (error) {
      if (error.code !== 'REVIEW_TARGET_IDENTITY_INVALID') throw error
      return { committed: false, reasonCode: 'TARGET_IDENTITY_INVALID', comparison: identityUnknown() }
    }
  }
  function discard(job) {
    pending.delete(job.revisionId)
    jobs.delete(job)
  }
  function get(revisionId) {
    let target
    try { target = descriptor() } catch (error) {
      return error.code === 'REVIEW_TARGET_IDENTITY_PENDING'
        ? { result: 'pending', reasonCode: 'TARGET_IDENTITY_PENDING', pending: true } : identityUnknown()
    }
    return withDb(false, db => {
      const row = db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(revisionId)
      if (!row) return { result: 'unknown', reasonCode: 'NOT_FOUND', pending: false }
      const result = getReviewCompatibility(db, revisionValue(row), target)
      return { ...result, pending: pending.has(revisionId) || result.pending }
    })
  }
  function scan({ nowMs = Date.now(), limit = 5 } = {}) {
    let target
    try { target = descriptor() } catch (failure) {
      if (failure.code === 'REVIEW_TARGET_IDENTITY_PENDING') return []
      throw failure
    }
    return withDb(false, db => {
      if (db.prepare('SELECT 1 FROM import_review_shipping_guards LIMIT 1').get()
        || db.prepare("SELECT 1 FROM import_review_promotions WHERE state = 'publishing' LIMIT 1").get()) return []
      const rows = db.prepare(`SELECT r.* FROM import_review_revisions r JOIN import_review_papers p
        ON p.latest_revision_id = r.id WHERE r.state IN ('awaiting_review','changes_requested','approved')
        ORDER BY r.finalized_at, r.id`).all()
      return rows.filter(row => {
        if (revisionValue(row).reviewKind !== 'candidate') return false
        const latest = hasTable(db, 'review_compatibility') ? db.prepare(`SELECT * FROM review_compatibility WHERE revision_id = ?
          AND target_build_id = ? AND comparator_version = ? ORDER BY attempt_no DESC LIMIT 1`)
          .get(row.id, target.targetBuildId, REVIEW_COMPARATOR_VERSION) : null
        if (!latest) return true
        const transient = ['WORKER_TIMEOUT', 'WORKER_OOM', 'WORKER_EXIT', 'IO_ERROR', 'COMPUTATION_FAILED']
        return latest.result === 'unknown' && transient.includes(latest.reason_code) && latest.attempt_no <= 2
          && nowMs >= Date.parse(latest.checked_at) + (latest.attempt_no === 1 ? 30_000 : 300_000)
      }).slice(0, Math.min(limit, 5)).map(row => row.id)
    })
  }
  function isBusy() {
    return withDb(false, db => Boolean(db.prepare('SELECT 1 FROM import_review_shipping_guards LIMIT 1').get()
      || db.prepare("SELECT 1 FROM import_review_promotions WHERE state='publishing' LIMIT 1").get()))
  }
  return { prepare, compute, commit, discard, checkRevision, get, scan, isBusy, ready: descriptor.ready }
}
