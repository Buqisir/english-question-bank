#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, truncateSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:http'
import path from 'node:path'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { DatabaseSync } from 'node:sqlite'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { createAutomaticReviewSubjectBackfillStore, REVIEW_BACKFILL_BUDGET, reviewBackfillInputToken } from '../server/import-review/automaticReviewSubjectBackfill.mjs'
import { captureReviewCompatibilitySnapshot } from '../server/import-review/reviewCompatibilityStore.mjs'
import { finalizeReviewFixture, freezeReviewFixture, reviewFixtureManifest } from './lib/reviewPublicationFixture.mjs'
import { saveProductPreview } from '../test-fixtures/review-compatibility/legacy-preview-6dc7530b.mjs'
import { beginReviewActivity, reviewCompatibilityLockDiagnostics } from '../server/import-review/reviewCompatibilityScheduling.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const temporaryRoot = realpathSync(tmpdir())
const root = mkdtempSync(path.join(temporaryRoot, 'eqb-review-auto-backfill-'))
const repository = path.resolve(import.meta.dirname, '..')
const dbPath = path.join(root, 'review.sqlite'), filesRoot = path.join(root, 'files')
const dbRun = (file, fn) => {
  const db = new DatabaseSync(file)
  db.exec('PRAGMA busy_timeout=5000')
  try { return fn(db) } finally { db.close() }
}
const query = fn => dbRun(dbPath, fn)
const originalRows = () => query(db => JSON.stringify(db.prepare(`SELECT name FROM sqlite_master
  WHERE type='table' AND name LIKE 'import_review_%' ORDER BY name`).all()
  .map(({ name }) => [name, db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()])))
let api, exit, log = ''
async function until(check, description, timeout = 60_000) {
  const deadline = performance.now() + timeout
  while (performance.now() < deadline) {
    if (check()) return
    if (api) assert.equal(api.exitCode, null, log)
    await yieldFor(10)
  }
  const evidence = query(db => ({
    revisions: db.prepare('SELECT id, state FROM import_review_revisions').all(),
    attempts: db.prepare('SELECT revision_id, result, reason_code FROM review_compatibility').all(),
    outcomes: db.prepare('SELECT revision_id, outcome, reason_code FROM review_subject_backfill').all(),
  }))
  throw new Error(`Timed out: ${description}\n${JSON.stringify({ ...evidence, locks: reviewCompatibilityLockDiagnostics() })}\n${log}`)
}
async function startApi(enabled) {
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  log = ''
  const env = { ...process.env, NODE_ENV: 'production', QUESTION_BANK_API_PORT: String(port),
    QUESTION_BANK_DB: path.join(root, 'bank.sqlite'), USER_DATA_DB: path.join(root, 'users.sqlite'),
    QUESTION_BANK_IMPORT_OPS_DB: dbPath, QUESTION_BANK_IMPORT_OPS_ROOT: filesRoot,
    QUESTION_BANK_PAPER_ASSET_ROOT: path.join(root, 'assets'), QUESTION_BANK_USER_SPACE_ROOT: path.join(root, 'user-space') }
  if (enabled) delete env.EQB_REVIEW_SUBJECT_BACKFILL
  else env.EQB_REVIEW_SUBJECT_BACKFILL = '0'
  api = spawn(process.execPath, ['server/api.mjs'], { cwd: repository, env, stdio: ['ignore', 'pipe', 'pipe'] })
  api.stdout.on('data', bytes => { log += bytes })
  api.stderr.on('data', bytes => { log += bytes })
  exit = new Promise(resolve => api.once('exit', (code, signal) => resolve({ code, signal })))
  return port
}
async function stopApi() {
  let timer
  const started = performance.now()
  try {
    api.kill('SIGTERM')
    const result = await Promise.race([exit, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`SIGTERM exceeded 5s\n${log}`)), 5000)
    })])
    assert.deepEqual(result, { code: 0, signal: null }, log)
    api = null
    return performance.now() - started
  } finally { clearTimeout(timer) }
}
try {
  const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'historical-auto-backfill' })
  await store.ready()
  const fixtures = []
  for (const [index, approve] of [false, true].entries()) {
    const { reviewRoot } = makeReviewRoot(path.join(root, `source-${index}`), `paper-auto-backfill-${index}`,
      undefined, { listening: index === 1 })
    const projection = freezeReviewFixture(reviewRoot)
    const fixture = finalizeReviewFixture({ directory: reviewRoot, output: root, projection, store, approve })
    query(db => {
      db.prepare('DELETE FROM import_review_product_previews WHERE revision_id=?').run(fixture.revision.id)
      saveProductPreview(db, fixture.revision, fixture.revision.rendererBuildId, projection)
    })
    fixtures.push({ ...fixture, directory: reviewRoot })
  }
  query(db => db.exec('DELETE FROM review_compatibility; DELETE FROM review_subject'))
  const oldRows = originalRows()
  {
    const versionDb = path.join(root, 'extractor-version.sqlite')
    copyFileSync(dbPath, versionDb)
    const id = fixtures[0].revision.id
    const value = dbRun(versionDb, db => captureReviewCompatibilitySnapshot(db, id))
    const oldToken = reviewBackfillInputToken(value, filesRoot, 'review-backfill-extractor-v1')
    const newToken = reviewBackfillInputToken(value, filesRoot)
    assert.notEqual(oldToken, newToken)
    dbRun(versionDb, db => db.prepare(`INSERT INTO review_subject_backfill
      (revision_id,input_token,outcome,reason_code,checked_at,diagnostic_json) VALUES (?,?,'skipped','COMPUTATION_FAILED',?,?)`)
      .run(id, oldToken, new Date().toISOString(), '{"reasonCode":"LISTENING_REVIEW_INVALID","pointer":"listening-review-v1.json#/subject/transcriptDigest"}'))
    const upgraded = createAutomaticReviewSubjectBackfillStore({ dbPath: versionDb, filesRoot })
    await upgraded.ready()
    assert(upgraded.prepare(id), 'new extractor must retry unchanged legacy input once')
    dbRun(versionDb, db => db.prepare(`INSERT INTO review_subject_backfill
      (revision_id,input_token,outcome,reason_code,checked_at) VALUES (?,?,'skipped','MISSING_BASELINE',?)`)
      .run(id, newToken, new Date().toISOString()))
    assert.equal(upgraded.prepare(id), null)
    assert.equal(createAutomaticReviewSubjectBackfillStore({ dbPath: versionDb, filesRoot }).prepare(id), null)
    assert.equal(dbRun(versionDb, db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill').get().n), 2)
    assert.equal(dbRun(versionDb, db => JSON.parse(db.prepare('SELECT diagnostic_json FROM review_subject_backfill WHERE input_token=?')
      .get(oldToken).diagnostic_json).reasonCode), 'LISTENING_REVIEW_INVALID')
    console.log('PASS extractor version retries unchanged old skips once, retains history/diagnostics and suppresses same-version restart retries')
  }

  // Exercise the same async compute -> short CAS boundary as the API worker.
  // Approval is correctly denied by the current API without equal. A direct
  // old-writer receipt change also must not be overwritten by an in-flight job.
  const casPath = path.join(root, 'cas.sqlite')
  copyFileSync(dbPath, casPath)
  const casStore = createImportReviewStore({ dbPath: casPath, filesRoot, rendererBuildId: 'historical-auto-backfill' })
  await casStore.ready()
  const backfill = createAutomaticReviewSubjectBackfillStore({ dbPath: casPath, filesRoot })
  await backfill.ready()
  const fixture = fixtures[0], id = fixture.revision.id, paperId = fixture.revision.paperId
  const saved = dbRun(casPath, db => ({
    revision: db.prepare('SELECT * FROM import_review_revisions WHERE id=?').get(id),
    paper: db.prepare('SELECT * FROM import_review_papers WHERE paper_id=?').get(paperId),
  }))
  assert.throws(() => casStore.approveRevision(paperId, id, { bundleDigest: fixture.revision.bundleDigest }, 'racing-owner'),
    error => Boolean(error.compatibility))
  const pausedJob = backfill.prepare(id)
  const finishActivity = beginReviewActivity('backfill-pause-fixture')
  let pausedOutput
  try { pausedOutput = await backfill.compute(pausedJob) } finally { finishActivity() }
  assert.equal((await backfill.commit(pausedJob, pausedOutput)).reasonCode, 'ACTIVITY_PENDING')
  assert.equal(dbRun(casPath, db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill').get().n), 0)
  console.log('PASS a transient activity pause never becomes a permanent skipped input')
  for (const kind of ['approval', 'return', 'issue', 'finalize']) {
    const job = backfill.prepare(id)
    assert(job)
    const output = await backfill.compute(job)
    assert.equal(output.comparison.reasonCode, 'BACKFILL_PENDING', JSON.stringify(output.comparison))
    assert(output.writePlan.subjectValues)
    if (kind === 'approval') dbRun(casPath, db => db.prepare(`UPDATE import_review_revisions
      SET state='approved', approval_receipt_json=? WHERE id=?`).run(JSON.stringify({ approvalId: 'legacy-racing-approval' }), id))
    if (kind === 'return' || kind === 'issue') casStore.createIssue(paperId, {
      revisionId: id, surface: kind === 'return' ? 'paper' : 'pdf',
      ...(kind === 'return' ? { bundleDigest: fixture.revision.bundleDigest } : { edition: 'answerOnly', pageNumber: 1 }),
      message: 'Concurrent original evidence issue',
    }, 'racing-owner')
    if (kind === 'finalize') {
      const manifest = reviewFixtureManifest(fixture.directory, fixture.projection)
      manifest.producerBuildId = 'concurrent-finalize'
      manifest.bundleDigest = reviewBundleDigest(manifest)
      finalizeReviewFixture({ directory: fixture.directory, output: root, projection: fixture.projection,
        manifest, store: casStore, approve: false })
    }
    const changed = dbRun(casPath, db => JSON.stringify({
      revision: db.prepare('SELECT * FROM import_review_revisions WHERE id=?').get(id),
      paper: db.prepare('SELECT * FROM import_review_papers WHERE paper_id=?').get(paperId),
      issues: db.prepare('SELECT * FROM import_review_issues WHERE paper_id=?').all(paperId),
    }))
    const result = await backfill.commit(job, output)
    assert.equal(result.committed, false, kind)
    assert.equal(result.reasonCode, 'CAS_CHANGED', kind)
    assert.equal(dbRun(casPath, db => db.prepare('SELECT COUNT(*) n FROM review_subject WHERE revision_id=?').get(id).n), 0, kind)
    assert.equal(dbRun(casPath, db => JSON.stringify({
      revision: db.prepare('SELECT * FROM import_review_revisions WHERE id=?').get(id),
      paper: db.prepare('SELECT * FROM import_review_papers WHERE paper_id=?').get(paperId),
      issues: db.prepare('SELECT * FROM import_review_issues WHERE paper_id=?').all(paperId),
    })), changed, kind)
    if (kind !== 'finalize') dbRun(casPath, db => {
      db.exec('DELETE FROM review_subject_backfill; DELETE FROM import_review_issues')
      for (const [table, key, row] of [['import_review_revisions', 'id', saved.revision], ['import_review_papers', 'paper_id', saved.paper]]) {
        db.prepare(`UPDATE ${table} SET ${Object.keys(row).map(name => `${name}=?`).join(',')} WHERE ${key}=?`)
          .run(...Object.values(row), row[key])
      }
    })
  }
  console.log('PASS automatic backfill refuses stale approval/return/issue/finalize snapshots; current approval still requires equal')
  const diagnosticJob = backfill.prepare(fixtures[1].revision.id)
  const diagnostic = await backfill.compute(diagnosticJob)
  assert(diagnostic.writePlan?.subjectValues, JSON.stringify(diagnostic.comparison))
  const originalSubjectJson = diagnostic.writePlan.subjectValues[12]
  diagnostic.writePlan.subjectValues[12] = '{}'
  diagnostic.writePlan.compatibilityValues[6] = 'equal'
  assert.equal((await backfill.commit(diagnosticJob, diagnostic)).outcome, 'inserted')
  assert.equal(dbRun(casPath, db => db.prepare('SELECT subject_json FROM review_subject WHERE revision_id=?')
    .get(fixtures[1].revision.id).subject_json), originalSubjectJson)
  assert(dbRun(casPath, db => db.prepare('SELECT result FROM review_compatibility WHERE revision_id=?')
    .all(fixtures[1].revision.id)).every(row => row.result === 'unknown'))
  console.log('PASS mutating a diagnostic cannot forge subject bytes or manufacture equal from a backfill write plan')

  // Make a real pre-upgrade DB; API startup, not a maintenance command,
  // creates its additive schema. One sealed PDF remains tampered.
  query(db => db.exec('DROP TABLE review_subject_backfill; DROP TABLE review_compatibility; DROP TABLE review_subject'))
  const badFile = path.join(filesRoot, fixtures[0].revision.id, 'products/answerOnly.pdf')
  const originalPdf = readFileSync(badFile), tampered = Buffer.from(originalPdf)
  tampered[tampered.length - 1] ^= 1
  writeFileSync(badFile, tampered)
  // Sparse corruption larger than the allowed file budget must be rejected
  // before copying its unexpected bytes into the worker workspace.
  truncateSync(badFile, REVIEW_BACKFILL_BUDGET.maxFileBytes + 1)
  dbRun(path.join(root, 'bank.sqlite'), db => db.exec(readFileSync(path.join(repository, 'data/sql/schema.sql'), 'utf8')))
  await startApi(false)
  await until(() => query(db => db.prepare("SELECT 1 FROM sqlite_master WHERE name='review_compatibility'").get()
    && db.prepare('SELECT COUNT(*) n FROM review_compatibility').get().n === 2), 'disabled API completes normal missing-baseline scan')
  assert.equal(query(db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill').get().n), 0)
  assert.equal(query(db => db.prepare('SELECT COUNT(*) n FROM review_subject').get().n), 0)
  await stopApi()
  assert.equal(originalRows(), oldRows)
  console.log('PASS EQB_REVIEW_SUBJECT_BACKFILL=0 disables writes without disabling normal compatibility scanning')

  // All normal MISSING_BASELINE attempts already exist for this exact target,
  // so the next observed worker belongs to automatic backfill.
  const beforeWorkspaces = new Set(readdirSync(temporaryRoot).filter(name => name.startsWith('eqb-review-job-')))
  await startApi(true)
  let workspace
  const leader = path.join(process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT, 'leader')
  await until(() => {
    workspace = readdirSync(temporaryRoot).find(name => name.startsWith('eqb-review-job-') && !beforeWorkspaces.has(name))
    return workspace && existsSync(leader) && JSON.parse(readFileSync(leader)).pid === api.pid
  }, 'active automatic backfill thread')
  const shutdownMs = await stopApi()
  assert.equal(existsSync(leader), false)
  assert.equal(existsSync(path.join(temporaryRoot, workspace)), false)
  assert.equal(query(db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill').get().n), 0)
  console.log(JSON.stringify({ check: 'automatic-backfill-SIGTERM', shutdownMs, leaderReleased: true, workspaceRemoved: true }))

  await startApi(true)
  await until(() => query(db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill').get().n === 2
    && db.prepare("SELECT COUNT(*) n FROM review_compatibility WHERE result='equal'").get().n === 1),
  'old DB -> durable inserted/skipped -> real normal worker equal')
  await stopApi()
  assert.equal(originalRows(), oldRows)
  const status = store.agentPaperStatus(fixtures[0].revision.paperId).subjectBackfill
  assert.deepEqual({ inserted: status.inserted, skipped: status.skipped, pending: status.pending,
    completed: status.completed, reason: status.revision.reasonCode },
  { inserted: 1, skipped: 1, pending: 0, completed: true, reason: 'SEALED_FILE_CHANGED' })
  assert.equal(status.skippedByReason.SEALED_FILE_CHANGED, 1)
  assert.equal(status.revision.diagnostic.reasonCode, 'SEALED_FILE_CHANGED')
  assert.equal(typeof status.revision.diagnostic.message, 'string')
  assert(status.revision.diagnostic.message.length <= 256)
  assert.deepEqual(query(db => db.prepare('SELECT origin FROM review_subject').all().map(row => row.origin)), ['stored_evidence'])
  const count = () => query(db => db.prepare('SELECT COUNT(*) n FROM review_subject_backfill').get().n)
  await startApi(true)
  await until(() => log.includes('listening') || log.includes('http://'), 'restart API ready')
  await yieldFor(2000)
  await stopApi()
  assert.equal(count(), 2)
  assert.equal(log.includes('"event":"review-subject-backfill"'), false)
  assert.equal(originalRows(), oldRows)
  console.log('PASS real API startup recovers historical listening evidence to equal; tampering is visible in probe; restart neither retries nor duplicates unchanged outcomes')

  writeFileSync(badFile, originalPdf)
  await startApi(true)
  await until(() => count() === 3 && query(db => db.prepare("SELECT COUNT(*) n FROM review_compatibility WHERE result='equal'").get().n === 2),
    'repaired original input becomes eligible once')
  await stopApi()
  assert.equal(originalRows(), oldRows)
  assert.equal(store.agentPaperStatus(paperId).subjectBackfill.inserted, 2)
  assert.equal(store.agentPaperStatus(paperId).subjectBackfill.skipped, 0)
  assert.deepEqual(query(db => db.prepare('PRAGMA foreign_key_check').all()), [])
  console.log(JSON.stringify({ check: 'automatic-backfill-budget', ...REVIEW_BACKFILL_BUDGET }))
  console.log('PASS changed original evidence retries once; subjects/attempts remain append-only and original revision/preview/approval rows stay unchanged')
} finally {
  if (api && api.exitCode === null) { api.kill('SIGKILL'); await exit }
  rmSync(root, { recursive: true, force: true })
}
