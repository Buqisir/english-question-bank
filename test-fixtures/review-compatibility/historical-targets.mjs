import assert from 'node:assert/strict'
import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { installV1Subject } from './schema-v1.mjs'
import { ensureReviewCompatibilityShape } from '../../server/import-review/reviewCompatibilitySchema.mjs'
import { createImportReviewStore } from '../../server/import-review/importReviewStore.mjs'
import { createReviewCompatibilityStore, captureReviewCompatibilitySnapshot } from '../../server/import-review/reviewCompatibilityStore.mjs'
import { createAutomaticReviewSubjectBackfillStore, reviewBackfillInputToken } from '../../server/import-review/automaticReviewSubjectBackfill.mjs'

export async function verifyHistoricalReviewTargets({ root, fixture, filesRoot, pass }) {
  const revision = fixture.revision
  for (const result of ['equal', 'different', 'unknown']) {
    const dbPath = path.join(root, `historical-${result}.sqlite`)
    copyFileSync(fixture.dbPath, dbPath)
    const db = new DatabaseSync(dbPath)
    const oldTarget = 'sha256:' + 'd'.repeat(64)
    let oldRow
    try {
      db.exec('PRAGMA foreign_keys=ON; DELETE FROM review_compatibility')
      installV1Subject(db, revision.id)
      // These are actual v1 columns and namespaces, before v2 ensure.
      const evidence = { result, reasonCode: `OLD_${result.toUpperCase()}` }
      db.prepare(`INSERT INTO review_compatibility VALUES(?,?,?,1,?,?,?,?,?,?,?)`)
        .run(revision.id, oldTarget, 'review-content-equivalence-v1', result === 'equal' ? 'v1-subject' : null,
          revision.bundleDigest, result, evidence.reasonCode, digestJson(evidence), JSON.stringify(evidence), '2026-10-20')
      oldRow = db.prepare('SELECT * FROM review_compatibility').get()
      ensureReviewCompatibilityShape(db)
      const value = captureReviewCompatibilitySnapshot(db, revision.id)
      const oldToken = reviewBackfillInputToken(value, filesRoot, 'review-backfill-extractor-v1')
      const newToken = reviewBackfillInputToken(value, filesRoot)
      assert.notEqual(oldToken, newToken)
      db.prepare(`INSERT INTO review_subject_backfill(revision_id,input_token,outcome,reason_code,checked_at)
        VALUES(?,?,'skipped','MISSING_BASELINE','2026-10-20')`).run(revision.id, oldToken)
      assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    } finally { db.close() }
    const comparison = createReviewCompatibilityStore({ dbPath, filesRoot })
    await comparison.ready()
    const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'new-renderer' })
    assert.notEqual(store.compatibilityForRevision(revision.id).result, 'equal', 'v1 equal cannot authorize v2')
    assert.ok(comparison.scan().includes(revision.id), `old ${result} cannot stop current-target scanning`)
    const backfill = createAutomaticReviewSubjectBackfillStore({ dbPath, filesRoot })
    const job = backfill.prepare(revision.id)
    assert.ok(job, `old ${result}/v1 skip cannot suppress v2 backfill`)
    const output = await backfill.compute(job)
    assert.equal((await backfill.commit(job, output)).outcome, 'inserted')
    const committed = await comparison.checkRevision(revision.id)
    assert.equal(committed.committed, true, JSON.stringify(committed))
    assert.equal(committed.comparison.result, 'equal')
    const restored = store.compatibilityForRevision(revision.id)
    assert.equal(restored.result, 'equal')
    assert.equal(restored.eligible, true)
    const after = new DatabaseSync(dbPath)
    try {
      assert.deepEqual(after.prepare('SELECT * FROM review_compatibility WHERE target_build_id=?').get(oldTarget), oldRow)
      assert.equal(after.prepare('SELECT COUNT(*) n FROM review_subject_legacy_v1').get().n, 1)
      assert.equal(after.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
      assert.deepEqual(after.prepare('PRAGMA foreign_key_check').all(), [])
    } finally { after.close() }
    pass(`actual v1 ${result}: old namespace/skip preserved, current scan/backfill/commit succeeds and later current equal restores eligibility`)
  }
}
