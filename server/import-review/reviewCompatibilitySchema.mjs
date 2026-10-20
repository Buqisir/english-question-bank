export const REVIEW_COMPATIBILITY_SCHEMA_VERSION = 'review-compatibility-schema-v1'

// Additive only. Never rewrite old review rows or the bank's user_version.
export function ensureReviewCompatibilityShape(db) {
  const ownTransaction = !db.isTransaction
  if (ownTransaction) db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS review_subject (
        revision_id TEXT PRIMARY KEY REFERENCES import_review_revisions(id),
        subject_version TEXT NOT NULL CHECK(subject_version = 'review-content-subject-v1'),
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
    `)
    if (ownTransaction) db.exec('COMMIT')
  } catch (error) {
    if (ownTransaction) db.exec('ROLLBACK')
    throw error
  }
}
