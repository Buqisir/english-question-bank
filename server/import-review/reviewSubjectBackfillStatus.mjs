export const reviewSubjectBackfillEnabled = () => process.env.EQB_REVIEW_SUBJECT_BACKFILL !== '0'
export const backfillScopeSql = `FROM import_review_revisions r
  JOIN import_review_papers p ON p.latest_revision_id=r.id
  WHERE r.state IN ('awaiting_review','approved')
    AND json_extract(r.manifest_json, '$.schemaVersion') <> 'web-import-ocr-review-bundle-v1'`

// Read-only, small row/aggregate queries; no subject, preview or file hashing.
export function readReviewSubjectBackfillStatus(db, revisionId = null) {
  const enabled = reviewSubjectBackfillEnabled()
  const has = name => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
  if (!has('review_subject_backfill')) return {
    enabled, completed: false, inserted: 0, skipped: 0, skippedByReason: {}, pending: null, revision: null,
  }
  const inserted = db.prepare(`SELECT COUNT(*) n ${backfillScopeSql}
    AND EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id AND s.origin='stored_evidence')`).get().n
  const missing = db.prepare(`SELECT COUNT(*) n ${backfillScopeSql}
    AND NOT EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id)`).get().n
  const skippedRows = db.prepare(`SELECT b.reason_code, COUNT(*) n
    FROM review_subject_backfill b JOIN import_review_revisions r ON r.id=b.revision_id
    JOIN import_review_papers p ON p.latest_revision_id=r.id
    WHERE r.state IN ('awaiting_review','approved') AND b.outcome='skipped'
      AND NOT EXISTS (SELECT 1 FROM review_subject s WHERE s.revision_id=r.id)
      AND b.id=(SELECT MAX(b2.id) FROM review_subject_backfill b2 WHERE b2.revision_id=b.revision_id)
    GROUP BY b.reason_code`).all()
  const skipped = skippedRows.reduce((sum, row) => sum + row.n, 0)
  const revision = revisionId ? db.prepare(`SELECT outcome, reason_code AS reasonCode, checked_at AS checkedAt
    FROM review_subject_backfill WHERE revision_id=? ORDER BY id DESC LIMIT 1`).get(revisionId) ?? null : null
  return { enabled, completed: missing === skipped, inserted, skipped,
    skippedByReason: Object.fromEntries(skippedRows.map(row => [row.reason_code, row.n])),
    pending: missing - skipped, revision,
    lastCheckedAt: db.prepare('SELECT MAX(checked_at) value FROM review_subject_backfill').get().value }
}
