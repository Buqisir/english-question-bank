export const REVIEW_COMPATIBILITY_SCHEMA_VERSION = 'review-compatibility-schema-v2'

export function reviewCompatibilityShapeAvailable(db) {
  return Boolean(db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='review_subject'").get()?.sql
    .includes('review-content-subject-v2'))
}

// Additive only. Never rewrite old review rows or the bank's user_version.
export function ensureReviewCompatibilityShape(db) {
  const ownTransaction = !db.isTransaction
  if (ownTransaction) db.exec('BEGIN IMMEDIATE')
  try {
    const legacy = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='review_subject'").get()
    if (legacy && !legacy.sql.includes('review-content-subject-v2')) {
      // The reverted rollout inserted zero subjects. Upgrade only that proven
      // empty shape; unexpected legacy content stays intact and uses the legacy guard.
      if (db.prepare('SELECT 1 FROM review_subject LIMIT 1').get()) {
        console.warn(JSON.stringify({ event: 'review-compatibility-disabled', reasonCode: 'LEGACY_REVIEW_SUBJECTS_PRESENT' }))
        if (ownTransaction) db.exec('COMMIT')
        return { enabled: false, reasonCode: 'LEGACY_REVIEW_SUBJECTS_PRESENT' }
      }
      db.exec('DROP TABLE review_subject')
    }
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_subject (
        revision_id TEXT PRIMARY KEY REFERENCES import_review_revisions(id),
        subject_version TEXT NOT NULL CHECK(subject_version = 'review-content-subject-v2'),
        origin TEXT NOT NULL CHECK(origin IN ('finalize','stored_evidence')),
        source_renderer_build_id TEXT NOT NULL,
        bundle_digest TEXT NOT NULL,
        identity_digest TEXT NOT NULL,
        consumer_digest TEXT NOT NULL,
        sidecar_digest TEXT NOT NULL,
        media_digest TEXT NOT NULL,
        products_digest TEXT NOT NULL,
        inventory_digest TEXT NOT NULL,
        subject_digest TEXT NOT NULL,
        subject_json TEXT NOT NULL,
        provenance_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS review_compatibility (
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        target_build_id TEXT NOT NULL,
        comparator_version TEXT NOT NULL,
        attempt_no INTEGER NOT NULL CHECK(attempt_no > 0),
        subject_digest TEXT,
        bundle_digest TEXT NOT NULL,
        result TEXT NOT NULL CHECK(result IN ('equal','different','unknown')),
        reason_code TEXT NOT NULL,
        evidence_digest TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        PRIMARY KEY(revision_id, target_build_id, comparator_version, attempt_no),
        CHECK(result <> 'equal' OR subject_digest IS NOT NULL)
      );
      CREATE INDEX IF NOT EXISTS idx_review_compatibility_lookup
        ON review_compatibility(revision_id, target_build_id, comparator_version, attempt_no DESC);
      CREATE TABLE IF NOT EXISTS review_subject_backfill_attempt (
        id INTEGER PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        input_token TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        diagnostic_json TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_review_subject_backfill_attempt
        ON review_subject_backfill_attempt(revision_id,input_token,id);
      CREATE TABLE IF NOT EXISTS review_subject_backfill (
        id INTEGER PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        input_token TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('inserted','skipped')),
        reason_code TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        diagnostic_json TEXT,
        UNIQUE(revision_id, input_token)
      );
    `)
    if (!db.prepare('PRAGMA table_info(review_subject_backfill)').all().some(row => row.name === 'diagnostic_json')) {
      db.exec('ALTER TABLE review_subject_backfill ADD COLUMN diagnostic_json TEXT')
    }
    if (ownTransaction) db.exec('COMMIT')
    return { enabled: true }
  } catch (error) {
    if (ownTransaction) db.exec('ROLLBACK')
    throw error
  }
}
