#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { createReviewCompatibilityStore } from '../server/import-review/reviewCompatibilityStore.mjs'
import { reviewBuildIdentityProvider } from '../server/import-review/reviewBuildIdentity.mjs'
import { saveProductPreview } from '../test-fixtures/review-compatibility/legacy-preview-6dc7530b.mjs'
import { freezeReviewFixture, finalizeReviewFixture } from './lib/reviewPublicationFixture.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-backfill-'))
const dbPath = path.join(root, 'review.sqlite')
const filesRoot = path.join(root, 'files')
function withDb(fn) {
  const db = new DatabaseSync(dbPath)
  try { return fn(db) } finally { db.close() }
}
function rows() {
  return withDb(db => JSON.stringify(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'import_review_%' ORDER BY name")
    .all().map(({ name }) => ({ name, rows: db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all() }))))
}
const cli = (...args) => JSON.parse(execFileSync(process.execPath, [
  path.resolve('scripts/backfill-review-subjects.mjs'), '--db', dbPath, '--files-root', filesRoot, ...args,
], { encoding: 'utf8', env: { ...process.env, NODE_ENV: '' }, timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] }))
function productionProcess(revisions, compare) {
  const program = `
    import assert from 'node:assert/strict';
    import { createImportReviewStore } from './server/import-review/importReviewStore.mjs';
    import { createReviewCompatibilityStore } from './server/import-review/reviewCompatibilityStore.mjs';
    import { reviewBuildIdentityProvider } from './server/import-review/reviewBuildIdentity.mjs';
    const [dbPath, filesRoot, idsJson, compare] = process.argv.slice(1);
    const ids = JSON.parse(idsJson);
    createImportReviewStore({dbPath, filesRoot});
    const compatibility = createReviewCompatibilityStore({dbPath, filesRoot});
    await compatibility.ready();
    if (compare === 'yes') assert.deepEqual(new Set(compatibility.scan()), new Set(ids));
    for (const id of ids) {
      const result = await compatibility.checkRevision(id);
      assert.equal(result.committed, true);
      assert.equal(result.comparison.result, compare === 'yes' ? 'equal' : 'unknown');
      if (compare !== 'yes') assert.equal(result.comparison.reasonCode, 'MISSING_BASELINE');
    }
    console.log(JSON.stringify({targetBuildId: reviewBuildIdentityProvider()().targetBuildId}));
  `
  return JSON.parse(execFileSync(process.execPath, ['-e', program,
    dbPath, filesRoot, JSON.stringify(revisions.map(row => row.id)), compare ? 'yes' : 'no'], {
    cwd: path.resolve(import.meta.dirname, '..'), env: { ...process.env, NODE_ENV: 'production' },
    encoding: 'utf8', timeout: 120_000,
  }))
}
try {
  const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'historical-preview-renderer' })
  await store.ready()
  const revisions = []
  for (const [index, approve] of [false, true].entries()) {
    const { reviewRoot } = makeReviewRoot(path.join(root, `source-${index}`), `paper-old-backfill-${index}`,
      undefined, { listening: index === 1 })
    const projection = freezeReviewFixture(reviewRoot)
    const fixture = finalizeReviewFixture({ directory: reviewRoot, output: root, projection, store, approve })
    const { revision } = fixture
    // Exercise the original Review DB preview writer, not a newly fabricated
    // baseline or directly inserted equal. Remove only additive tables below.
    withDb(db => {
      db.prepare('DELETE FROM import_review_product_previews WHERE revision_id=?').run(revision.id)
      saveProductPreview(db, revision, revision.rendererBuildId, projection)
    })
    revisions.push(revision)
  }
  withDb(db => db.exec('DROP TABLE review_compatibility; DROP TABLE review_subject'))
  const originalRows = rows()
  const originalBytes = readFileSync(dbPath)
  const dry = cli()
  assert.equal(dry.dryRun, true)
  assert.equal(dry.canBackfill, 2, JSON.stringify(dry))
  assert.equal(dry.applied, 0)
  assert.equal(dry.skipped, 0)
  assert.deepEqual(readFileSync(dbPath), originalBytes)
  assert.equal(rows(), originalRows)
  console.log('PASS old DB with original preview writer: dry-run verifies both review states without any DB byte change')
  const productionTarget = productionProcess(revisions, false).targetBuildId

  const file = path.join(filesRoot, revisions[0].id, 'products/answerOnly.pdf')
  const originalPdf = readFileSync(file)
  const corruptedPdf = Buffer.from(originalPdf)
  corruptedPdf[corruptedPdf.length - 1] ^= 1
  writeFileSync(file, corruptedPdf)
  const first = cli('--apply')
  assert.equal(first.applied, 1, JSON.stringify(first))
  assert.equal(first.skipped, 1)
  assert.equal(first.results.find(row => row.revisionId === revisions[0].id).reasonCode, 'SEALED_FILE_CHANGED')
  assert.equal(rows(), originalRows)
  assert.deepEqual(withDb(db => db.prepare('SELECT origin FROM review_subject').all().map(row => row.origin)), ['stored_evidence'])
  assert.equal(withDb(db => db.prepare('SELECT result FROM review_compatibility').get().result), 'unknown')
  assert.equal(withDb(db => db.prepare('SELECT reason_code FROM review_compatibility ORDER BY rowid DESC LIMIT 1').get().reason_code), 'BACKFILL_PENDING')
  console.log('PASS tampered sealed PDF is skipped; intact original evidence is CAS inserted and queued, never marked equal by CLI')

  writeFileSync(file, originalPdf)
  const second = cli('--apply')
  assert.equal(second.applied, 1)
  assert.equal(second.alreadyPresent, 1)
  const beforeRepeat = readFileSync(dbPath)
  const repeated = cli('--apply')
  assert.equal(repeated.applied, 0)
  assert.equal(repeated.alreadyPresent, 2)
  assert.deepEqual(readFileSync(dbPath), beforeRepeat)
  assert.equal(rows(), originalRows)
  console.log('PASS repeated apply preserves subjects, attempts and every original row; repaired evidence can be backfilled once')
  assert.notEqual(withDb(db => db.prepare(`SELECT target_build_id FROM review_compatibility
    WHERE reason_code='BACKFILL_PENDING' LIMIT 1`).get().target_build_id), productionTarget)
  productionProcess(revisions, true)
  console.log('PASS separate production API scanner recovers its MISSING_BASELINE after CLI backfill under another environment/target')

  await reviewBuildIdentityProvider().ready()
  const compatibility = createReviewCompatibilityStore({ dbPath, filesRoot })
  await compatibility.ready()
  assert.deepEqual(new Set(compatibility.scan()), new Set(revisions.map(row => row.id)))
  for (const revision of revisions) {
    const result = await compatibility.checkRevision(revision.id)
    assert.equal(result.committed, true, JSON.stringify(result))
    assert.equal(result.comparison.result, 'equal', JSON.stringify(result.comparison))
    assert.equal(store.compatibilityForRevision(revision.id).result, 'equal')
    assert.equal(store.getRevision(revision.id).state, revision.state)
  }
  assert.equal(rows(), originalRows)
  assert.deepEqual(withDb(db => db.prepare('PRAGMA foreign_key_check').all()), [])
  console.log('PASS real worker compares backfilled listening/no-listening fixtures to equal without changing approval or review state')
  console.log('PASS review subject backfill: 5 scenarios')
} finally { rmSync(root, { recursive: true, force: true }) }
