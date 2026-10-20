import { createHash } from 'node:crypto'
import { lstatSync, statfsSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { reviewBuildIdentityProvider } from './reviewBuildIdentity.mjs'
import { captureReviewCompatibilitySnapshot as capture, sameReviewCompatibilitySnapshot as same } from './reviewCompatibilityStore.mjs'
import { reviewCompatibilityAttempts, applyReviewCompatibilityWrite } from './reviewCompatibilityWrite.mjs'
import { runReviewCompatibilityWorker } from './runReviewCompatibilityWorker.mjs'
import { acquireReviewCompatibilityLeader, reviewCompatibilityBusy } from './reviewCompatibilityScheduling.mjs'
import { backfillScopeSql, readReviewSubjectBackfillStatus, reviewSubjectBackfillEnabled } from './reviewSubjectBackfillStatus.mjs'
import { REVIEW_BACKFILL_FILE_BUDGET } from './reviewSubjectBackfill.mjs'

export const REVIEW_BACKFILL_BUDGET = Object.freeze({
  heapMb: 128, deadlineMs: 10_000, batchSize: 1, scanLimit: 5, ...REVIEW_BACKFILL_FILE_BUDGET,
})
export const REVIEW_BACKFILL_EXTRACTOR_VERSION = 'review-backfill-extractor-v2'

// A scheduling token, not content evidence. Native hashing covers the original
// SQLite cells; lstat detects repaired/replaced files without reading their
// bytes on the API thread. The worker still verifies every SHA and sealed path.
export function reviewBackfillInputToken(value, filesRoot, extractorVersion = REVIEW_BACKFILL_EXTRACTOR_VERSION) {
  const hash = createHash('sha256').update(JSON.stringify([extractorVersion, value]))
  if (!/^rev-[a-f0-9-]{36}$/.test(value.revision.id)) return hash.digest('hex')
  const root = path.resolve(filesRoot, value.revision.id)
  const paths = new Set([root])
  for (const file of value.files) {
    if (typeof file.path !== 'string' || path.isAbsolute(file.path)
      || file.path.split('/').some(part => !part || part === '..' || part === '.')) continue
    let current = root
    for (const part of file.path.split('/')) { current = path.join(current, part); paths.add(current) }
  }
  for (const file of paths) {
    try {
      const stat = lstatSync(file, { bigint: true })
      // Directory membership changes are irrelevant; identity/type changes are
      // relevant. File ctime cannot be restored by utimes after byte tampering.
      hash.update(JSON.stringify([file, String(stat.dev), String(stat.ino), String(stat.mode),
        ...(stat.isDirectory() ? [] : [String(stat.size), String(stat.mtimeNs), String(stat.ctimeNs)])]))
    } catch (error) { hash.update(JSON.stringify([file, error.code])) }
  }
  return hash.digest('hex')
}

export function createAutomaticReviewSubjectBackfillStore({ dbPath, filesRoot }) {
  const target = reviewBuildIdentityProvider()
  const jobs = new WeakMap()
  const outputs = new WeakMap()
  let cursor = ''
  const withDb = (write, fn) => {
    const db = new DatabaseSync(dbPath, { readOnly: !write })
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000')
    try { return fn(db) } finally { db.close() }
  }
  function prepare(revisionId) {
    if (!reviewSubjectBackfillEnabled()) return null
    const descriptor = target()
    return withDb(false, db => {
      const value = capture(db, revisionId)
      if (!value?.revision || value.subject || value.paper?.latest_revision_id !== revisionId
        || !['awaiting_review', 'approved'].includes(value.revision.state)) return null
      const token = reviewBackfillInputToken(value, filesRoot)
      if (db.prepare('SELECT 1 FROM review_subject_backfill WHERE revision_id=? AND input_token=?').get(revisionId, token)) return null
      const job = Object.freeze({ revisionId })
      jobs.set(job, { value, token, descriptor,
        previous: reviewCompatibilityAttempts(db, revisionId, descriptor.targetBuildId) })
      return job
    })
  }
  function scan() {
    const ids = withDb(false, db => db.prepare(`SELECT r.id ${backfillScopeSql}
      AND NOT EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id) ORDER BY r.id`).all().map(row => row.id))
    const next = ids.findIndex(id => id > cursor)
    for (let i = 0; i < Math.min(ids.length, REVIEW_BACKFILL_BUDGET.scanLimit); i++) {
      cursor = ids[((next < 0 ? 0 : next) + i) % ids.length]
      const job = prepare(cursor)
      if (job) return job
    }
    return null
  }
  async function compute(job, { signal, leaderLease } = {}) {
    const data = jobs.get(job)
    if (!data) throw new Error('Unknown backfill job')
    const output = await runReviewCompatibilityWorker({
      mode: 'backfill', value: data.value, previous: data.previous,
      directory: path.join(filesRoot, job.revisionId), targetBuildId: data.descriptor.targetBuildId,
    }, { signal, leaderLease, heapMb: REVIEW_BACKFILL_BUDGET.heapMb, timeoutMs: REVIEW_BACKFILL_BUDGET.deadlineMs })
    outputs.set(output, { job, output: structuredClone(output) })
    return output
  }
  async function commit(job, diagnostic, { signal } = {}) {
    const data = jobs.get(job)
    const computed = outputs.get(diagnostic)
    if (!data || computed?.job !== job) return { committed: false, reasonCode: 'INVALID_JOB' }
    jobs.delete(job)
    outputs.delete(diagnostic)
    const output = computed.output
    if (['LEADER_BUSY', 'ACTIVITY_PENDING', 'TARGET_CHANGED', 'TARGET_IDENTITY_INVALID',
      'TARGET_IDENTITY_MISMATCH'].includes(output.comparison.reasonCode)) {
      return { committed: false, reasonCode: output.comparison.reasonCode }
    }
    const fresh = await target.fresh()
    if (signal?.aborted) return { committed: false, reasonCode: 'WORKER_EXIT' }
    if (fresh.targetBuildId !== data.descriptor.targetBuildId) return { committed: false, reasonCode: 'TARGET_CHANGED' }
    if (reviewCompatibilityBusy() || !reviewSubjectBackfillEnabled()) return { committed: false, reasonCode: 'ACTIVITY_PENDING' }
    return withDb(true, db => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const record = (outcome, reason) => db.prepare(`INSERT OR IGNORE INTO review_subject_backfill
          (revision_id,input_token,outcome,reason_code,checked_at,diagnostic_json) VALUES (?,?,?,?,?,?)`)
          .run(job.revisionId, data.token, outcome, reason, new Date().toISOString(),
            JSON.stringify(output.comparison.diagnostic ?? null))
        const current = capture(db, job.revisionId)
        if (reviewCompatibilityBusy()) { db.exec('ROLLBACK'); return { committed: false, reasonCode: 'ACTIVITY_PENDING' } }
        if (!same(current, data.value) || reviewBackfillInputToken(current, filesRoot) !== data.token) {
          // Record only the stale input. A current input remains independently
          // eligible; compatibility-attempt churn alone must not suppress it.
          record('skipped', 'CAS_CHANGED')
          db.exec('COMMIT')
          return { committed: false, reasonCode: 'CAS_CHANGED' }
        }
        if (JSON.stringify(reviewCompatibilityAttempts(db, job.revisionId, fresh.targetBuildId)) !== JSON.stringify(data.previous)) {
          db.exec('ROLLBACK')
          return { committed: false, reasonCode: 'CAS_CHANGED' }
        }
        if (db.prepare('SELECT 1 FROM review_subject_backfill WHERE revision_id=? AND input_token=?')
          .get(job.revisionId, data.token)) {
          db.exec('ROLLBACK')
          return { committed: false, reasonCode: 'ALREADY_PROCESSED' }
        }
        const inserted = Boolean(output.writePlan?.subjectValues && output.baseline?.origin === 'stored_evidence'
          && output.comparison.result === 'unknown' && output.comparison.reasonCode === 'BACKFILL_PENDING'
          && output.executionIdentity?.targetBuildId === fresh.targetBuildId
          && output.executionIdentity?.releaseRoot === fresh.releaseRoot)
        if (inserted) applyReviewCompatibilityWrite(db, output.writePlan)
        const reasonCode = inserted ? 'BACKFILL_PENDING' : output.comparison.reasonCode
        record(inserted ? 'inserted' : 'skipped', reasonCode)
        db.exec('COMMIT')
        return { committed: true, outcome: inserted ? 'inserted' : 'skipped', reasonCode }
      } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error }
    })
  }
  function status() { return withDb(false, db => readReviewSubjectBackfillStatus(db)) }
  async function runBatch({ signal } = {}) {
    if (!reviewSubjectBackfillEnabled() || signal?.aborted) return { paused: 'DISABLED', results: [] }
    const leader = acquireReviewCompatibilityLeader()
    if (!leader) return { paused: 'LEADER_BUSY', results: [] }
    try {
      if (reviewCompatibilityBusy()) return { paused: 'ACTIVITY_PENDING', results: [] }
      await target.ready({ signal })
      const disk = statfsSync('/tmp')
      const free = disk.bavail * disk.bsize
      if (free < 10 * 1024 ** 3) return {
        paused: free < 7 * 1024 ** 3 ? 'DISK_STOP_BELOW_7_GIB' : 'DISK_WAIT_BELOW_10_GIB', results: [],
      }
      const job = scan()
      if (!job) return { results: [] }
      const output = await compute(job, { signal, leaderLease: leader.lease })
      if (signal?.aborted) { jobs.delete(job); return { results: [] } }
      const result = await commit(job, output, { signal })
      return { results: [{ revisionId: job.revisionId, ...result }], more: status().pending > 0 }
    } finally { leader.release() }
  }
  return { ready: target.ready, prepare, compute, commit, runBatch, status }
}
