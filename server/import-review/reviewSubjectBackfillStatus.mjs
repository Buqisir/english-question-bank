import { reviewCompatibilityShapeAvailable } from './reviewCompatibilitySchema.mjs'
import { isTransientReviewFailure, reviewBackfillRetryState } from './reviewRecoveryPolicy.mjs'
export const reviewSubjectBackfillEnabled = () => process.env.EQB_REVIEW_SUBJECT_BACKFILL !== '0'
export const backfillScopeSql = `FROM import_review_revisions r
  JOIN import_review_papers p ON p.latest_revision_id=r.id
  WHERE r.state IN ('awaiting_review','approved')
    AND json_extract(r.manifest_json, '$.schemaVersion') <> 'web-import-ocr-review-bundle-v1'`

// Read-only, small row/aggregate queries; no subject, preview or file hashing.
export function readReviewSubjectBackfillStatus(db, revisionId = null) {
  const enabled = reviewSubjectBackfillEnabled()
  const has = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
  if (!reviewCompatibilityShapeAvailable(db)) return {
    enabled: false, reasonCode: 'LEGACY_REVIEW_SUBJECTS_PRESENT', completed: false,
    inserted: 0, skipped: 0, skippedByReason: {}, pending: null, revision: null,
  }
  if (!has('review_subject_backfill')) return {
    enabled, completed: false, inserted: 0, skipped: 0, skippedByReason: {}, pending: null, revision: null,
  }
  const inserted = db.prepare(`SELECT COUNT(*) n ${backfillScopeSql}
    AND EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id AND s.origin='stored_evidence')`).get().n
  const missing = db.prepare(`SELECT COUNT(*) n ${backfillScopeSql}
    AND NOT EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id)`).get().n
  const hasAttempts = has('review_subject_backfill_attempt')
  const skippedRows = db.prepare(`SELECT b.reason_code, COUNT(*) n
    FROM review_subject_backfill b JOIN import_review_revisions r ON r.id=b.revision_id
    JOIN import_review_papers p ON p.latest_revision_id=r.id
    WHERE r.state IN ('awaiting_review','approved') AND b.outcome='skipped'
      AND NOT EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id)
      AND b.id=(SELECT MAX(b2.id) FROM review_subject_backfill b2 WHERE b2.revision_id=b.revision_id)
      ${hasAttempts ? `AND NOT EXISTS (SELECT 1 FROM review_subject_backfill_attempt a
        WHERE a.revision_id=b.revision_id AND a.checked_at>=b.checked_at)` : ''}
    GROUP BY b.reason_code`).all().filter(row => !isTransientReviewFailure(row.reason_code))
  const skipped = skippedRows.reduce((sum, row) => sum + row.n, 0)
  let revision = revisionId ? db.prepare(`SELECT outcome, reason_code AS reasonCode, checked_at AS checkedAt, diagnostic_json
    FROM review_subject_backfill WHERE revision_id=? ORDER BY id DESC LIMIT 1`).get(revisionId) ?? null : null
  const transientRows = hasAttempts ? db.prepare(`SELECT a.* FROM review_subject_backfill_attempt a
    JOIN import_review_revisions r ON r.id=a.revision_id JOIN import_review_papers p ON p.latest_revision_id=r.id
    WHERE r.state IN ('awaiting_review','approved')
      AND NOT EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id)
      AND NOT EXISTS (SELECT 1 FROM review_subject_backfill b
        WHERE b.revision_id=a.revision_id AND b.checked_at>a.checked_at)
    ORDER BY a.id`).all() : []
  const byRevision = Map.groupBy(transientRows, row => row.revision_id)
  let exhausted = 0
  for (const [id, rows] of byRevision) {
    const latest = rows.at(-1)
    const state = reviewBackfillRetryState(rows.filter(row => row.input_token === latest.input_token))
    if (state.exhausted) exhausted++
    if (id === revisionId && (!revision || latest.checked_at >= revision.checkedAt)) {
      revision = { outcome: state.exhausted ? 'exhausted' : 'retry_pending',
        reasonCode: latest.reason_code, checkedAt: latest.checked_at,
        diagnostic_json: latest.diagnostic_json, ...state }
    }
  }
  if (revision) {
    revision.diagnostic = JSON.parse(revision.diagnostic_json || 'null')
    delete revision.diagnostic_json
  }
  return { enabled, completed: missing === skipped + exhausted, inserted, skipped, exhausted,
    skippedByReason: Object.fromEntries(skippedRows.map(row => [row.reason_code, row.n])),
    pending: missing - skipped - exhausted, revision,
    lastCheckedAt: db.prepare(hasAttempts ? `SELECT MAX(checked_at) value FROM (
      SELECT checked_at FROM review_subject_backfill UNION ALL SELECT checked_at FROM review_subject_backfill_attempt)`
      : 'SELECT MAX(checked_at) value FROM review_subject_backfill').get().value }
}
