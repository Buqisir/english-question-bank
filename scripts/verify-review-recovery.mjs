#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { reviewBuildIdentityProvider } from '../server/import-review/reviewBuildIdentity.mjs'
import { ensureReviewCompatibilityShape } from '../server/import-review/reviewCompatibilitySchema.mjs'
import { appendReviewCompatibility, createReviewCompatibilityStore, captureReviewCompatibilitySnapshot } from '../server/import-review/reviewCompatibilityStore.mjs'
import { createAutomaticReviewSubjectBackfillStore, reviewBackfillInputToken, readBackfillRetryState } from '../server/import-review/automaticReviewSubjectBackfill.mjs'
import { REVIEW_BACKFILL_RETRY_DELAYS_MS, reviewCompatibilityEligibility } from '../server/import-review/reviewRecoveryPolicy.mjs'
import { finalizeReviewFixture, freezeReviewFixture } from './lib/reviewPublicationFixture.mjs'
import { isReviewCompatible } from '../import-ops/public/owner-review.js'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(tmpdir(), 'eqb-review-recovery-'))
let checks = 0
const pass = message => { checks++; console.log(`PASS ${message}`) }
const dbRun = (file, fn) => {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA foreign_keys=ON')
  try { return fn(db) } finally { db.close() }
}
try {
  await reviewBuildIdentityProvider().ready()
  const { reviewRoot } = makeReviewRoot(path.join(root, 'source'), 'paper-recovery-policy')
  const projection = freezeReviewFixture(reviewRoot)
  const output = path.join(root, 'base')
  const fixture = finalizeReviewFixture({ directory: reviewRoot, output, projection, approve: false })
  const filesRoot = path.join(output, 'files')
  const target = reviewBuildIdentityProvider()()
  const revision = fixture.revision
  for (const [result, reasonCode] of [
    ['equal', 'CONTENT_EQUAL'], ['different', 'CONTENT_DIFFERENT'],
    ...['MISSING_BASELINE', 'BACKFILL_PENDING', 'WORKER_TIMEOUT', 'WORKER_OOM', 'WORKER_EXIT',
      'IO_ERROR', 'EXHAUSTED', 'TARGET_IDENTITY_UNAVAILABLE', 'TARGET_IDENTITY_PENDING',
      'LEGACY_REVIEW_SUBJECTS_PRESENT', 'NOT_CHECKED'].map(reason => ['unknown', reason]),
  ]) {
    for (const stale of [false, true]) {
      const dbPath = path.join(root, `${reasonCode}-${stale}.sqlite`)
      copyFileSync(fixture.dbPath, dbPath)
      dbRun(dbPath, db => {
        db.exec('DELETE FROM review_compatibility')
        if (result === 'unknown') db.exec('DELETE FROM review_subject')
        const subjectDigest = db.prepare('SELECT subject_digest FROM review_subject').get()?.subject_digest
        db.exec('BEGIN IMMEDIATE')
        appendReviewCompatibility(db, revision, null, {
          result, reasonCode, subjectDigest, targetBuildId: target.targetBuildId,
        })
        db.exec('COMMIT')
      })
      const store = createImportReviewStore({ dbPath, filesRoot,
        rendererBuildId: stale ? 'different-renderer' : revision.rendererBuildId })
      const compatibility = store.compatibilityForRevision(revision.id)
      assert.equal(compatibility.result, result)
      const allowed = result === 'equal' || (result === 'unknown' && !stale)
      assert.equal(compatibility.eligible, allowed)
      assert.equal(isReviewCompatible(compatibility), allowed)
      assert.equal(compatibility.fallback, result === 'unknown')
      assert.equal(store.paperDetail(revision.paperId).rendererStale, !allowed)
      assert.equal(store.listPapers()[0].rendererStale, !allowed)
      const approve = () => store.approveRevision(revision.paperId, revision.id,
        { bundleDigest: revision.bundleDigest }, 'recovery-owner')
      if (allowed) assert.equal(approve().revisionId, revision.id)
      else assert.throws(approve, { code: 'IMPORT_REVIEW_RENDERER_STALE' })
      if (result === 'unknown') assert.equal(dbRun(dbPath, db => db.prepare('SELECT COUNT(*) n FROM review_subject').get().n), 0)
      pass(`${result}/${reasonCode}, rendererStale=${stale}: approval=${allowed}, no manufactured baseline`)
    }
  }
  const conflictPath = path.join(root, 'different-conflict.sqlite')
  copyFileSync(fixture.dbPath, conflictPath)
  dbRun(conflictPath, db => {
    db.exec('DELETE FROM review_compatibility; BEGIN IMMEDIATE')
    const subjectDigest = db.prepare('SELECT subject_digest FROM review_subject').get().subject_digest
    appendReviewCompatibility(db, revision, null, { result: 'different', reasonCode: 'CONTENT_DIFFERENT', subjectDigest, targetBuildId: target.targetBuildId })
    appendReviewCompatibility(db, revision, null, { result: 'equal', reasonCode: 'CONTENT_EQUAL', subjectDigest, targetBuildId: target.targetBuildId })
    db.exec('COMMIT')
  })
  const conflictStore = createImportReviewStore({ dbPath: conflictPath, filesRoot, rendererBuildId: revision.rendererBuildId })
  assert.equal(conflictStore.compatibilityForRevision(revision.id).result, 'different')
  assert.equal(conflictStore.listPapers()[0].compatibility.result, 'different')
  assert.throws(() => conflictStore.approveRevision(revision.paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'owner'),
    { code: 'IMPORT_REVIEW_RENDERER_STALE' })
  pass('a retained definitive different cannot fall back even after a later unknown integrity-conflict attempt')
  // Actual empty subject/missing attempt and cold identity states.
  const emptyPath = path.join(root, 'missing.sqlite')
  copyFileSync(fixture.dbPath, emptyPath)
  dbRun(emptyPath, db => db.exec('DELETE FROM review_compatibility; DELETE FROM review_subject'))
  const emptyStore = createImportReviewStore({ dbPath: emptyPath, filesRoot, rendererBuildId: revision.rendererBuildId })
  assert.equal(emptyStore.compatibilityForRevision(revision.id).result, 'pending')
  assert.equal(emptyStore.approveRevision(revision.paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'owner').revisionId, revision.id)
  pass('real missing subject and unchecked pending permit the exact legacy approval path')

  const retryPath = path.join(root, 'retry.sqlite')
  copyFileSync(fixture.dbPath, retryPath)
  dbRun(retryPath, db => db.exec('DELETE FROM review_compatibility; DELETE FROM review_subject'))
  const backfill = createAutomaticReviewSubjectBackfillStore({ dbPath: retryPath, filesRoot })
  const job = backfill.prepare(revision.id)
  const timeout = await backfill.compute(job, { timeoutMs: 1 })
  assert.equal(timeout.comparison.reasonCode, 'WORKER_TIMEOUT')
  assert.equal((await backfill.commit(job, timeout)).outcome, 'retry_pending')
  assert.equal(backfill.prepare(revision.id), null)
  const token = dbRun(retryPath, db => reviewBackfillInputToken(captureReviewCompatibilitySnapshot(db, revision.id), filesRoot))
  let now = Date.now()
  for (let index = 0; index < REVIEW_BACKFILL_RETRY_DELAYS_MS.length; index++) {
    dbRun(retryPath, db => {
      const state = readBackfillRetryState(db, revision.id, token, now)
      assert.equal(state.eligible, false)
      now = state.nextRetryAt
      assert.equal(readBackfillRetryState(db, revision.id, token, now - 1).eligible, false)
      assert.equal(readBackfillRetryState(db, revision.id, token, now).eligible, true)
      db.prepare(`INSERT INTO review_subject_backfill_attempt
        (revision_id,input_token,reason_code,checked_at,diagnostic_json) VALUES (?,?,'IO_ERROR',?,'{"retained":true}')`)
        .run(revision.id, token, new Date(now).toISOString())
    })
  }
  assert.equal(backfill.prepare(revision.id, { nowMs: now + 1e9 }), null)
  assert.equal(backfill.status().exhausted, 1)
  const oldAttempts = dbRun(retryPath, db => db.prepare('SELECT * FROM review_subject_backfill_attempt').all())
  assert.throws(() => backfill.resetTransientBudget(revision.id), /operator and reason/)
  assert.equal(backfill.resetTransientBudget(revision.id, { actor: 'maintenance-owner', reason: 'IO restored' }).eligible, true)
  assert.equal(dbRun(retryPath, db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill_attempt').get().n), 7)
  assert.deepEqual(dbRun(retryPath, db => db.prepare('SELECT * FROM review_subject_backfill_attempt WHERE id<=6').all()), oldAttempts)
  assert(backfill.prepare(revision.id))
  pass('real worker timeout is retriable; five bounded exponential retries exhaust; audited reset retains all six attempts')

  const comparePath = path.join(root, 'compare-retry.sqlite')
  copyFileSync(fixture.dbPath, comparePath)
  const comparator = createReviewCompatibilityStore({ dbPath: comparePath, filesRoot })
  dbRun(comparePath, db => {
    db.exec('DELETE FROM review_compatibility; BEGIN IMMEDIATE')
    for (const reasonCode of ['MISSING_BASELINE', 'BACKFILL_PENDING', 'WORKER_TIMEOUT']) {
      appendReviewCompatibility(db, revision, null, { result: 'unknown', reasonCode, targetBuildId: target.targetBuildId })
    }
    db.exec('COMMIT')
  })
  assert.equal(comparator.scan().includes(revision.id), false)
  assert.equal(comparator.scan({ nowMs: Date.now() + 31_000 }).includes(revision.id), true)
  pass('MISSING_BASELINE and BACKFILL_PENDING do not consume comparison transient retry quota')

  // Offline SQLite copies preserve raw rows, FKs and old-code readability.
  const migration = path.join(root, 'migration.sqlite')
  copyFileSync(fixture.dbPath, migration)
  dbRun(migration, db => {
    db.exec(`DELETE FROM review_subject; DROP TABLE review_subject;
      CREATE TABLE review_subject(revision_id TEXT PRIMARY KEY REFERENCES import_review_revisions(id),
        subject_version TEXT CHECK(subject_version='review-content-subject-v1'), subject_json TEXT);
      INSERT INTO review_subject_backfill(revision_id,input_token,outcome,reason_code,checked_at)
        SELECT id,'legacy-token','skipped','MISSING_BASELINE','2026-10-20' FROM import_review_revisions;`)
  })
  const before = dbRun(migration, db => ({
    attempts: db.prepare('SELECT * FROM review_compatibility').all(),
    skips: db.prepare('SELECT * FROM review_subject_backfill').all(),
    revisions: db.prepare('SELECT * FROM import_review_revisions').all(),
  }))
  dbRun(migration, db => {
    ensureReviewCompatibilityShape(db); ensureReviewCompatibilityShape(db)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
    for (const [key, table] of [['attempts', 'review_compatibility'], ['skips', 'review_subject_backfill'], ['revisions', 'import_review_revisions']]) {
      assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), before[key])
    }
  })
  const oldStoreSource = execFileSync('git', ['show', '97c63a3b:server/import-review/importReviewStore.mjs'],
    { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' })
  const oldModule = path.join(root, 'legacy-importReviewStore.mjs')
  // Resolve the old module's relative imports against this task's release.
  const moduleUrl = new URL('../server/import-review/importReviewStore.mjs', import.meta.url)
  writeFileSync(oldModule, oldStoreSource.replace(/from (['"])(\.[^'"]+)\1/g,
    (_all, _quote, name) => `from ${JSON.stringify(new URL(name, moduleUrl).href)}`))
  const { createImportReviewStore: oldCreate } = await import(pathToFileURL(oldModule).href)
  const oldStore = oldCreate({ dbPath: migration, filesRoot, rendererBuildId: revision.rendererBuildId })
  assert.deepEqual(oldStore.getRevision(revision.id), revision)
  assert.equal(oldStore.listPapers()[0].paperId, revision.paperId)
  assert.deepEqual(oldStore.productPreviewForRevision(revision.id).preview,
    fixture.store.productPreviewForRevision(revision.id).preview)
  pass('offline empty v1 upgrade is idempotent, FK-clean, raw-row preserving and readable by exact 97c63a3b store code')
  dbRun(migration, db => db.exec(`DROP TABLE review_subject;
    CREATE TABLE review_subject(revision_id TEXT,subject_version TEXT CHECK(subject_version='review-content-subject-v1'),subject_json TEXT);
    INSERT INTO review_subject VALUES('legacy','review-content-subject-v1','{"preserve":true}');`))
  const legacyStore = createImportReviewStore({ dbPath: migration, filesRoot, rendererBuildId: revision.rendererBuildId })
  assert.equal(legacyStore.compatibilityForRevision(revision.id).reasonCode, 'LEGACY_REVIEW_SUBJECTS_PRESENT')
  assert.equal(legacyStore.listPapers()[0].rendererStale, false)
  assert.equal(legacyStore.approveRevision(revision.paperId, revision.id, { bundleDigest: revision.bundleDigest }, 'owner').revisionId, revision.id)
  assert.equal(createReviewCompatibilityStore({ dbPath: migration, filesRoot }).scan().length, 0)
  assert.equal(createAutomaticReviewSubjectBackfillStore({ dbPath: migration, filesRoot }).prepare(revision.id), null)
  assert.equal(dbRun(migration, db => db.prepare('SELECT subject_json FROM review_subject').get().subject_json), '{"preserve":true}')
  pass('nonempty v1 starts, lists, falls back for approval, disables both workers and preserves legacy bytes')

  const release = makeReviewRelease(path.join(root, 'identity-release'))
  const workerFile = path.join(release, 'server/import-review/reviewBuildIdentityWorker.mjs')
  writeFileSync(workerFile, "import { appendFileSync } from 'node:fs'\n" + readFileSync(workerFile, 'utf8').replace('try {', `try {
    appendFileSync(process.env.BUB90_COUNTER, 'attempt\\n')
    await new Promise(resolve => setTimeout(resolve, 30))
    if (process.env.BUB90_FAILURE) throw Object.assign(new Error('injected identity failure'),
      { code: process.env.BUB90_FAILURE === 'deterministic' ? 'REVIEW_TARGET_IDENTITY_INVALID'
        : 'REVIEW_TARGET_IDENTITY_UNAVAILABLE', reasonCode: 'WORKER_EXIT' })
  `))
  const program = `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { reviewBuildIdentityProvider } from './server/import-review/reviewBuildIdentity.mjs';
    import { createImportReviewStore } from './server/import-review/importReviewStore.mjs';
    let now=Date.now(); Date.now=()=>now;
    const count=()=>readFileSync(process.env.BUB90_COUNTER,'utf8').trim().split('\\n').length;
    process.env.BUB90_FAILURE='1';
    const provider=reviewBuildIdentityProvider({production:true});
    await Promise.all(Array.from({length:8},()=>assert.rejects(provider.ready(),{code:'REVIEW_TARGET_IDENTITY_UNAVAILABLE'})));
    assert.equal(count(),1);
    delete process.env.BUB90_FAILURE;
    await assert.rejects(provider.ready(),{code:'REVIEW_TARGET_IDENTITY_UNAVAILABLE'});
    assert.equal(count(),1);
    now+=60001;
    const first=await provider.ready(); assert.equal(count(),2);
    process.env.BUB90_FAILURE='1';
    await assert.rejects(provider.fresh(),{code:'REVIEW_TARGET_IDENTITY_UNAVAILABLE'});
    assert.throws(provider,{code:'REVIEW_TARGET_IDENTITY_UNAVAILABLE'});
    const [dbPath,filesRoot,revisionId,rendererBuildId]=process.argv.slice(1);
    const store=createImportReviewStore({dbPath,filesRoot,rendererBuildId});
    const revision=store.getRevision(revisionId);
    const status=store.compatibilityForRevision(revisionId);
    assert.equal(status.fallback,true); assert.equal(status.eligible,true);
    assert.equal(store.approveRevision(revision.paperId,revisionId,{bundleDigest:revision.bundleDigest},'owner').revisionId,revisionId);
    delete process.env.BUB90_FAILURE;
    now+=60001;
    assert.equal((await provider.ready()).targetBuildId,first.targetBuildId);
    await Promise.all([provider.fresh(),provider.fresh()]);
    assert.equal(count(),6);
    process.env.BUB90_FAILURE='deterministic';
    await assert.rejects(provider.fresh(),{code:'REVIEW_TARGET_IDENTITY_INVALID'});
    now+=3600000;
    await assert.rejects(provider.ready(),{code:'REVIEW_TARGET_IDENTITY_INVALID'});
    assert.equal(count(),7);
    console.log('PASS identity initialization single flight, 60s retry, fresh failure recovery, deterministic failure isolation and real approval fallback');
  `
  const identityPath = path.join(root, 'identity.sqlite')
  copyFileSync(fixture.dbPath, identityPath)
  console.log(execFileSync(process.execPath, ['-e', program, identityPath, filesRoot,
    revision.id, revision.rendererBuildId], { cwd: release, encoding: 'utf8', timeout: 120_000,
    env: { ...process.env, NODE_ENV: 'production', BUB90_COUNTER: path.join(root, 'identity-attempts') } }))
  checks++
  assert.equal(reviewCompatibilityEligibility({ result: 'different', reasonCode: 'CONTENT_DIFFERENT' }, false).fallback, false)
  console.log(`PASS ${checks} review recovery checks`)
} finally {
  rmSync(root, { recursive: true, force: true })
}
