// Exact DDL from e664eecd:server/import-review/reviewCompatibilitySchema.mjs.
export const reviewCompatibilityV1Sql = `
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
      CREATE TABLE IF NOT EXISTS review_subject_backfill (
        id INTEGER PRIMARY KEY,
        revision_id TEXT NOT NULL REFERENCES import_review_revisions(id),
        input_token TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('inserted','skipped')),
        reason_code TEXT NOT NULL,
        checked_at TEXT NOT NULL,
        UNIQUE(revision_id, input_token)
      );
    `

export function installV1Subject(db, revisionId = null) {
  db.exec('DROP TABLE review_subject')
  db.exec(reviewCompatibilityV1Sql.split('CREATE TABLE IF NOT EXISTS review_compatibility')[0])
  if (revisionId) db.prepare(`INSERT INTO review_subject VALUES (
    ?,'review-content-subject-v1','stored_evidence','historical-renderer',
    'bundle','identity','consumer','sidecar','media','products','inventory','subject',
    '{"preserved":true}','{"origin":"e664eecd"}','2026-10-20')`).run(revisionId)
}
