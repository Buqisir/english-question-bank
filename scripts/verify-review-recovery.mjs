#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createSinglePaperPromotionService } from '../server/import-review/singlePaperPromotion.mjs'
import { createBlobStore } from '../server/paper-import/blobStore.mjs'
import { finalizeReviewFixture, freezeReviewFixture } from './lib/reviewPublicationFixture.mjs'

process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-recovery-'))
try {
  const native = makeReviewRoot(path.join(root, 'source'), 'paper-review-recovery', undefined, { listening: true })
  const projection = freezeReviewFixture(native.reviewRoot)
  for (const unsealed of [false, true]) {
    const output = path.join(root, String(unsealed))
    const fixture = finalizeReviewFixture({ directory: native.reviewRoot, output, projection })
    const bank = path.join(output, 'bank.sqlite')
    const db = new DatabaseSync(bank)
    try { db.exec(readFileSync(new URL('../data/sql/schema.sql', import.meta.url), 'utf8')) } finally { db.close() }
    const common = { openDatabase: () => new DatabaseSync(bank), paperAssetsDir: path.join(output, 'assets'),
      blobStore: createBlobStore({ rootDir: path.join(output, 'blobs') }) }
    const { revision, approval } = fixture
    const interrupted = createSinglePaperPromotionService({ ...common, getStore: () => fixture.store,
      afterPublish() { throw new Error('forced receipt loss') } })
    await assert.rejects(async () => interrupted.promote(revision.paperId, { ...approval, intent: 'ship' }, 'owner'), /forced receipt loss/)
    assert.equal(fixture.store.latestPromotion(revision.paperId).state, 'publishing')
    if (unsealed) {
      const review = new DatabaseSync(fixture.dbPath)
      try { review.exec('UPDATE import_review_product_previews SET sealed_publication_manifest_digest=NULL') }
      finally { review.close() }
    }
    const reopened = createImportReviewStore({ dbPath: fixture.dbPath, filesRoot: path.join(output, 'files'),
      rendererBuildId: 'different-build', projectRevision() { throw new Error('recovery must not project') } })
    const result = await createSinglePaperPromotionService({ ...common, getStore: () => reopened,
      publish() { throw new Error('recovery must not republish') } })
      .promote(revision.paperId, { ...approval, intent: 'retry_ship' }, 'owner')
    assert.equal(result.status, 'idempotent')
    assert.equal(result.promotion.state, 'published')
    assert.deepEqual(reopened.getRevision(revision.id).approval, approval)
    const published = new DatabaseSync(bank, { readOnly: true })
    try { assert.equal(published.prepare('SELECT count(*) n FROM paper_asset_versions').get().n, 1) }
    finally { published.close() }
    console.log(`PASS ${unsealed ? 'historical unsealed' : 'sealed'} committed target reconciles without another write`)
  }
} finally { rmSync(root, { recursive: true, force: true }) }
