import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { digestJson, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { REVIEW_COMPONENTS, REVIEW_SUBJECT_VERSION, validateReviewSubject } from './reviewSubject.mjs'
import { REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import { reviewBuildIdentityProvider } from './reviewBuildIdentity.mjs'
import { runReviewCompatibilityWorker } from './runReviewCompatibilityWorker.mjs'

const now = () => new Date().toISOString()
const error = code => Object.assign(new Error(code), { code })
const json = value => stableStringify(value)

function storedSubject(db, revisionId) {
  const row = db.prepare('SELECT * FROM review_subject WHERE revision_id = ?').get(revisionId)
  if (!row) return null
  const subject = JSON.parse(row.subject_json)
  const checked = validateReviewSubject(subject)
  if (!checked.ok || checked.subjectDigest !== row.subject_digest
    || subject.revisionId !== row.revision_id || subject.bundleDigest !== row.bundle_digest
    || subject.sourceRendererBuildId !== row.source_renderer_build_id
    || REVIEW_COMPONENTS.some(key => digestJson(subject.components[key]) !== row[`${key}_digest`])) {
    throw error('BASELINE_UNTRUSTED')
  }
  return { row, subject }
}

export function getReviewCompatibility(db, revision, targetDescriptor) {
  try {
    const baseline = storedSubject(db, revision.id)
    if (baseline && (baseline.row.bundle_digest !== revision.bundleDigest
      || baseline.row.source_renderer_build_id !== revision.rendererBuildId)) throw error('BASELINE_UNTRUSTED')
    const rows = db.prepare(`SELECT * FROM review_compatibility
      WHERE revision_id = ? AND target_build_id = ? AND comparator_version = ? ORDER BY attempt_no DESC`)
      .all(revision.id, targetDescriptor.targetBuildId, REVIEW_COMPARATOR_VERSION)
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

// Caller owns BEGIN IMMEDIATE. These are INSERT-only; no UPDATE/REPLACE/DELETE.
// Used by finalize in its existing preview/state transaction and by CAS below.
export function appendReviewCompatibility(db, revision, baseline, comparison) {
  if (!db.isTransaction) throw error('REVIEW_TRANSACTION_REQUIRED')
  if (!/^sha256:[a-f0-9]{64}$/.test(comparison.targetBuildId || '')
    || !['equal', 'different', 'unknown'].includes(comparison.result)) throw error('REVIEW_RESULT_INVALID')
  let existing
  try { existing = storedSubject(db, revision.id) }
  catch {
    const row = db.prepare('SELECT * FROM review_subject WHERE revision_id = ?').get(revision.id)
    existing = row ? { row, subject: null } : null
    baseline = null
    comparison = { ...comparison, result: 'unknown', reasonCode: 'BASELINE_UNTRUSTED' }
  }
  if (baseline?.ok) {
    const checked = validateReviewSubject(baseline.subject)
    if (!checked.ok || checked.subjectDigest !== baseline.subjectDigest
      || baseline.subject.revisionId !== revision.id || baseline.subject.bundleDigest !== revision.bundleDigest
      || baseline.subject.sourceRendererBuildId !== revision.rendererBuildId) throw error('BASELINE_UNTRUSTED')
    if (existing && json(existing.subject) !== json(baseline.subject)) {
      comparison = { ...comparison, result: 'unknown', reasonCode: 'BASELINE_UNTRUSTED' }
    } else if (!existing) {
      db.prepare(`INSERT INTO review_subject
        (revision_id, subject_version, origin, source_renderer_build_id, bundle_digest,
         identity_digest, consumer_digest, sidecar_digest, media_digest, products_digest, inventory_digest,
         subject_digest, subject_json, provenance_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        revision.id, REVIEW_SUBJECT_VERSION, baseline.origin, revision.rendererBuildId, revision.bundleDigest,
        ...REVIEW_COMPONENTS.map(key => digestJson(baseline.subject.components[key])),
        checked.subjectDigest, json(baseline.subject), json(baseline.provenance), now())
      existing = storedSubject(db, revision.id)
    }
  }
  const previous = db.prepare(`SELECT * FROM review_compatibility
    WHERE revision_id = ? AND target_build_id = ? AND comparator_version = ? ORDER BY attempt_no DESC`)
    .all(revision.id, comparison.targetBuildId, REVIEW_COMPARATOR_VERSION)
  const terminal = previous.find(row => row.result !== 'unknown')
  const subjectDigest = existing?.row.subject_digest ?? null
  if (comparison.result === 'equal' && (!subjectDigest || comparison.subjectDigest !== subjectDigest)) {
    throw error('BASELINE_UNTRUSTED')
  }
  if (terminal) {
    // A transient inability to recompute is not a contradictory content result.
    // Automatic scheduling never reruns terminal keys; manual diagnostics may
    // return unknown, but cannot replace an already complete terminal record.
    if (comparison.result === 'unknown' && ['WORKER_TIMEOUT', 'WORKER_OOM', 'WORKER_EXIT',
      'IO_ERROR', 'COMPUTATION_FAILED', 'TARGET_COMPUTATION_FAILED'].includes(comparison.reasonCode)) {
      return { appended: false, attemptNo: previous[0].attempt_no }
    }
    if (comparison.result === terminal.result && subjectDigest === terminal.subject_digest
      && !previous.some(row => ['TERMINAL_INTEGRITY_CONFLICT', 'BASELINE_UNTRUSTED'].includes(row.reason_code))) {
      return { appended: false, attemptNo: terminal.attempt_no }
    }
    // Keep the original terminal row byte-for-byte; a new fault makes reads
    // fail closed, including when a former equal's sealed bytes changed.
    comparison = { ...comparison, result: 'unknown', reasonCode: 'TERMINAL_INTEGRITY_CONFLICT' }
  }
  const attemptNo = (previous[0]?.attempt_no ?? 0) + 1
  const evidence = {
    result: comparison.result, reasonCode: comparison.reasonCode,
    componentDigests: comparison.componentDigests || {}, differences: comparison.differences || [],
    metrics: comparison.metrics || {}, publicationMappingVersion: 'review-publication-content-v1',
  }
  db.prepare(`INSERT INTO review_compatibility
    (revision_id, target_build_id, comparator_version, attempt_no, subject_digest, bundle_digest,
     result, reason_code, evidence_digest, evidence_json, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(revision.id, comparison.targetBuildId, REVIEW_COMPARATOR_VERSION, attemptNo, subjectDigest,
      revision.bundleDigest, comparison.result, comparison.reasonCode, digestJson(evidence), json(evidence), now())
  return { appended: true, attemptNo }
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
    subject: db.prepare('SELECT * FROM review_subject WHERE revision_id = ?').get(revisionId) ?? null }
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
    jobs.set(job, { value, target, token: digestJson(value) })
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
  function commit(job, output) {
    const captured = jobs.get(job)
    const computed = results.get(output)
    if (!captured || computed?.job !== job) throw error('REVIEW_RESULT_INVALID')
    try {
      if (descriptor().targetBuildId !== captured.target.targetBuildId) return { committed: false, reasonCode: 'TARGET_CHANGED' }
      return withDb(true, db => {
        db.exec('BEGIN IMMEDIATE')
        try {
          const current = snapshot(db, job.revisionId)
          if (!eligible(current) || digestJson(current) !== captured.token) {
            db.exec('ROLLBACK')
            return { committed: false, reasonCode: 'CAS_CHANGED' }
          }
          const revision = revisionValue(current.revision)
          const { baseline, comparison } = computed.output
          if (['LEADER_BUSY', 'ACTIVITY_PENDING'].includes(comparison.reasonCode)) {
            db.exec('ROLLBACK')
            return { committed: false, reasonCode: comparison.reasonCode }
          }
          const outcome = appendReviewCompatibility(db, revision, baseline, comparison)
          db.exec('COMMIT')
          return { committed: true, ...outcome }
        } catch (failure) { if (db.isTransaction) db.exec('ROLLBACK'); throw failure }
      })
    } finally { pending.delete(job.revisionId); jobs.delete(job); results.delete(output) }
  }
  async function checkRevision(revisionId, options = {}) {
    const job = prepare(revisionId)
    if (!job) return { committed: false, reasonCode: 'NOT_ELIGIBLE' }
    const output = await compute(job, options)
    return { ...commit(job, output), comparison: output.comparison }
  }
  function discard(job) {
    pending.delete(job.revisionId)
    jobs.delete(job)
  }
  function get(revisionId) {
    const target = descriptor()
    return withDb(false, db => {
      const row = db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(revisionId)
      if (!row) return { result: 'unknown', reasonCode: 'NOT_FOUND', pending: false }
      const result = getReviewCompatibility(db, revisionValue(row), target)
      return { ...result, pending: pending.has(revisionId) || result.pending }
    })
  }
  function scan({ nowMs = Date.now(), limit = 5 } = {}) {
    const target = descriptor()
    return withDb(false, db => {
      if (db.prepare('SELECT 1 FROM import_review_shipping_guards LIMIT 1').get()
        || db.prepare("SELECT 1 FROM import_review_promotions WHERE state = 'publishing' LIMIT 1").get()) return []
      const rows = db.prepare(`SELECT r.* FROM import_review_revisions r JOIN import_review_papers p
        ON p.latest_revision_id = r.id WHERE r.state IN ('awaiting_review','changes_requested','approved')
        ORDER BY r.finalized_at, r.id`).all()
      return rows.filter(row => {
        if (revisionValue(row).reviewKind !== 'candidate') return false
        const latest = db.prepare(`SELECT * FROM review_compatibility WHERE revision_id = ?
          AND target_build_id = ? AND comparator_version = ? ORDER BY attempt_no DESC LIMIT 1`)
          .get(row.id, target.targetBuildId, REVIEW_COMPARATOR_VERSION)
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
  return { prepare, compute, commit, discard, checkRevision, get, scan, isBusy }
}
