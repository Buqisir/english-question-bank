#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from 'node:http'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { Worker } from 'node:worker_threads'
import { createImportReviewStore } from '../server/import-review/importReviewStore.mjs'
import { finalizeReviewFixture, freezeReviewFixture } from './lib/reviewPublicationFixture.mjs'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'
import { ensureReviewCompatibilityShape } from '../server/import-review/reviewCompatibilitySchema.mjs'
import { reviewCompatibilityV1Sql } from '../test-fixtures/review-compatibility/schema-v1.mjs'

{
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(`PRAGMA foreign_keys=ON; CREATE TABLE import_review_revisions(id TEXT PRIMARY KEY);
      INSERT INTO import_review_revisions VALUES('old-revision');`)
    db.exec(reviewCompatibilityV1Sql)
    db.exec(`
      INSERT INTO review_subject_backfill VALUES(1,'old-revision','old-token','skipped','COMPUTATION_FAILED','2026-10-20');`)
    ensureReviewCompatibilityShape(db)
    ensureReviewCompatibilityShape(db)
    assert.match(db.prepare("SELECT sql FROM sqlite_master WHERE name='review_subject'").get().sql, /review-content-subject-v2/)
    assert.equal(db.prepare('SELECT input_token FROM review_subject_backfill').get().input_token, 'old-token')
    assert(db.prepare('PRAGMA table_info(review_subject_backfill)').all().some(row => row.name === 'diagnostic_json'))
    assert.equal(db.prepare('SELECT COUNT(*) n FROM review_subject_legacy_v1').get().n, 0)
    console.log('PASS exact empty v1 schema migrates idempotently; skip history and empty archive survive')
  } finally { db.close() }
}

export async function measureReviewOperation(action) {
  const windows = []
  const timers = []
  const emit = Worker.prototype.emit
  const ownEmit = Object.hasOwn(Worker.prototype, 'emit')
  let captureWorkerEvents = false
  function sample(phase) {
    const started = performance.now()
    const cpu = process.threadCpuUsage()
    const loop = performance.eventLoopUtilization()
    windows.push(new Promise(resolve => {
      timers.push(setTimeout(() => {
        const elapsedMs = performance.now() - started
        const usage = process.threadCpuUsage(cpu)
        const utilization = performance.eventLoopUtilization(loop)
        resolve({ phase, elapsedMs, delayMs: Math.max(0, elapsedMs - 2),
          threadCpuMs: (usage.user + usage.system) / 1000,
          activeMs: utilization.active, idleMs: utilization.idle })
      }, 2))
    }))
  }
  // Probe the public entry and its real worker callbacks, including their
  // promise continuations (publish/CAS), through the first following timer.
  // A periodic timer spanning the worker's idle wait measures unrelated turns
  // and scheduler stalls. No CPU/idle subtraction or threshold adjustment is used.
  Worker.prototype.emit = function (event, ...args) {
    if (captureWorkerEvents && ['message', 'error', 'exit'].includes(event)) sample(event)
    return emit.call(this, event, ...args)
  }
  const started = performance.now()
  try {
    sample('entry')
    const pending = action()
    captureWorkerEvents = Boolean(pending && typeof pending.then === 'function')
    const value = await pending
    const callMs = performance.now() - started
    captureWorkerEvents = false
    const phases = await Promise.all(windows)
    return { value, callMs, phases, maxDelayMs: Math.max(...phases.map(phase => phase.delayMs)) }
  } finally {
    if (ownEmit) Worker.prototype.emit = emit
    else delete Worker.prototype.emit
    for (const timer of timers) clearTimeout(timer)
  }
}

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const temporaryRoot = realpathSync(tmpdir())
const root = mkdtempSync(path.join(temporaryRoot, 'eqb-review-startup-'))
const repository = path.resolve(import.meta.dirname, '..')
let api
try {
  const source = makeReviewRoot(path.join(root, 'source'), 'paper-identity-startup', undefined, { listening: true })
  const output = path.join(root, 'review')
  const dbPath = path.join(output, 'review.sqlite'), filesRoot = path.join(output, 'files')
  const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'historical-startup' })
  await store.ready()
  const fixture = finalizeReviewFixture({ directory: source.reviewRoot, output,
    projection: freezeReviewFixture(source.reviewRoot), store })
  const release = makeReviewRelease(path.join(root, 'release'))
  const program = `
    import assert from 'node:assert/strict';
    import { readFileSync, writeFileSync } from 'node:fs';
    import { setTimeout as yieldFor } from 'node:timers/promises';
    import { PerformanceObserver } from 'node:perf_hooks';
    import { Worker } from 'node:worker_threads';
    import { createImportReviewStore } from './server/import-review/importReviewStore.mjs';
    import { createReviewCompatibilityStore } from './server/import-review/reviewCompatibilityStore.mjs';
    import { reviewBuildIdentityProvider } from './server/import-review/reviewBuildIdentity.mjs';
    const [dbPath, filesRoot, revisionId] = process.argv.slice(1);
    const gcEvents = [];
    const observer = new PerformanceObserver(entries => {
      for (const entry of entries.getEntries()) gcEvents.push({ at: entry.startTime, ms: entry.duration });
    });
    observer.observe({ entryTypes: ['gc'] });
    const measureReviewOperation = ${measureReviewOperation.toString()};
    // Cold means the identity is not ready, not cold fixture pages or module
    // garbage. Settle those before constructing either identity consumer.
    readFileSync(dbPath);
    globalThis.gc();
    await yieldFor(5);
    const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'new-startup-renderer' });
    const compatibility = createReviewCompatibilityStore({ dbPath, filesRoot });
    assert.equal(store.ready, compatibility.ready, 'read and scan stores share one identity initialization');
    const samples = [];
    async function measure(name, action, enforceColdBudget = true) {
      await yieldFor(5);
      const windowStart = performance.now();
      const { callMs, maxDelayMs, phases } = await measureReviewOperation(action);
      // CPU/GC explain failures; the original wall-clock 50ms gate still decides.
      const gc = gcEvents.filter(entry => entry.at >= windowStart);
      const sample = { name, callMs, maxDelayMs, phases, gc, mode: process.env.NODE_ENV };
      samples.push(sample); console.log(JSON.stringify(sample));
      if (enforceColdBudget) assert(maxDelayMs < 50, JSON.stringify(sample));
      return sample;
    }
    let coldRow, approval;
    await measure('cold-list', () => {
      coldRow = store.listPapers()[0];
      assert.equal(coldRow.compatibility.result, 'pending');
    });
    // These are separate public operations, not part of the list endpoint.
    await measure('cold-revision', () => { approval = store.getRevision(revisionId).approval; });
    await measure('cold-promotion-denial', () => {
      assert.throws(() => store.beginPromotion(coldRow.paperId, { ...approval, intent: 'ship' }, 'fixture-owner'),
        error => error.compatibility.result === 'pending');
    });
    await measure('cold-scan', () => assert.deepEqual(compatibility.scan(), []));
    await measure('identity-initialization', () => store.ready());
    const readyTarget = reviewBuildIdentityProvider()();
    for (let i = 0; i < 3; i++) {
      // Warm reads still validate the original subject; prove identity reuse
      // separately from that existing payload-validation cost.
      await measure('warm-list', () => store.listPapers(), false);
      await measure('warm-scan', () => compatibility.scan(), false);
      assert.equal(reviewBuildIdentityProvider()(), readyTarget);
    }
    if (process.env.NODE_ENV !== 'production') {
      const provider = reviewBuildIdentityProvider();
      const before = provider().targetBuildId;
      const file = './server/import-review/rendererBuildIdProvider.mjs';
      const bytes = readFileSync(file);
      globalThis.gc();
      writeFileSync(file, Buffer.concat([bytes, Buffer.from('\\n// startup invalidation fixture\\n')]));
      await yieldFor(20);
      assert.equal(store.listPapers()[0].compatibility.result, 'pending');
      await measure('development-refresh', () => store.ready());
      assert.notEqual(provider().targetBuildId, before);
    }
    observer.disconnect();
  `
  for (const mode of ['production', 'development']) {
    console.log(execFileSync(process.execPath, ['--expose-gc', '-e', program,
      dbPath, filesRoot, fixture.revision.id], { cwd: release, encoding: 'utf8',
      env: { ...process.env, NODE_ENV: mode }, timeout: 30_000 }))
  }
  const db = new DatabaseSync(dbPath)
  db.exec('DELETE FROM review_compatibility')
  db.close()
  const bankPath = path.join(root, 'bank.sqlite')
  const bank = new DatabaseSync(bankPath)
  bank.exec(readFileSync(path.join(repository, 'data/sql/schema.sql'), 'utf8'))
  bank.close()
  const reservation = createServer()
  await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  // Keep the active-batch shutdown coverage through the existing explicit
  // scheduler option, enabled only in this copied runtime (as in backfill QA).
  symlinkSync(path.join(repository, 'data'), path.join(release, 'data'), 'dir')
  const schedulerApi = path.join(release, 'server/api.mjs')
  const apiSource = readFileSync(schedulerApi, 'utf8')
  const schedulerCall = 'startReviewCompatibilityWorker(compatibilityStore, {'
  assert(apiSource.includes(schedulerCall))
  writeFileSync(schedulerApi, apiSource.replace(schedulerCall, `${schedulerCall} enabled: true,`))
  const leader = path.join(process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT, 'leader')
  for (const enabled of [false, true]) {
    const workspaces = new Set(readdirSync(root).filter(name => name.startsWith('eqb-review-job-')))
    let log = ''
    api = spawn(process.execPath, ['server/api.mjs'], { cwd: enabled ? release : repository, env: {
      ...process.env, NODE_ENV: 'production', TMPDIR: root, QUESTION_BANK_API_PORT: String(port),
      EQB_REVIEW_COMPATIBILITY_AUTORUN: '1', EQB_REVIEW_SUBJECT_BACKFILL: '0',
      QUESTION_BANK_DB: bankPath, USER_DATA_DB: path.join(root, 'users.sqlite'),
      QUESTION_BANK_IMPORT_OPS_DB: dbPath, QUESTION_BANK_IMPORT_OPS_ROOT: filesRoot,
      QUESTION_BANK_PAPER_ASSET_ROOT: path.join(root, 'assets'),
      QUESTION_BANK_USER_SPACE_ROOT: path.join(root, 'user-space'),
    }, stdio: ['ignore', 'pipe', 'pipe'] })
    api.stdout.on('data', bytes => { log += bytes })
    api.stderr.on('data', bytes => { log += bytes })
    const exit = new Promise(resolve => api.once('exit', (code, signal) => resolve({ code, signal })))
    let activeWorkspace
    const newWorkspace = () => readdirSync(root).find(name => name.startsWith('eqb-review-job-') && !workspaces.has(name))
    if (enabled) {
      for (let attempt = 0; attempt < 1500; attempt++) {
        assert.equal(api.exitCode, null, log)
        activeWorkspace = newWorkspace()
        if (activeWorkspace && existsSync(leader) && JSON.parse(readFileSync(leader)).pid === api.pid) break
        activeWorkspace = null
        await yieldFor(10)
      }
      assert(activeWorkspace, `No explicitly enabled API compatibility batch observed: ${log}`)
    } else {
      for (let attempt = 0; attempt < 1500 && !log.includes('API listening'); attempt++) {
        assert.equal(api.exitCode, null, log)
        await yieldFor(10)
      }
      assert(log.includes('API listening'), log)
      // Observe the initial tick/yield window; startup must leave the review
      // unchecked even when the legacy emergency switch permits scheduling.
      for (let attempt = 0; attempt < 500; attempt++) {
        assert.equal(api.exitCode, null, log)
        assert.equal(newWorkspace(), undefined, 'default API must not create a compatibility batch')
        assert.equal(existsSync(leader), false, 'default API must not acquire a compatibility leader')
        await yieldFor(10)
      }
      const unchanged = new DatabaseSync(dbPath, { readOnly: true })
      try {
        assert.equal(unchanged.prepare('SELECT count(*) n FROM review_compatibility WHERE revision_id=?')
          .get(fixture.revision.id).n, 0)
        assert.equal(unchanged.prepare('SELECT state FROM import_review_revisions WHERE id=?')
          .get(fixture.revision.id).state, fixture.revision.state)
      } finally { unchanged.close() }
      const unchecked = store.compatibilityForRevision(fixture.revision.id)
      assert.equal(unchecked.result, 'pending')
      assert.equal(unchecked.reasonCode, 'NOT_CHECKED')
      assert.equal(unchecked.pending, true)
      console.log('PASS default API startup creates no compatibility batch and leaves Review unchecked without changing its state')
    }
    let deadline
    const started = performance.now()
    try {
      api.kill('SIGTERM')
      const result = await Promise.race([exit, new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error(`Active-batch shutdown exceeded 15s: ${log}`)), 15_000)
      })])
      assert.deepEqual(result, { code: 0, signal: null }, log)
      assert.equal(existsSync(leader), false)
      if (activeWorkspace) assert.equal(existsSync(path.join(root, activeWorkspace)), false)
      console.log(JSON.stringify({ check: enabled ? 'api-active-batch-SIGTERM' : 'api-default-SIGTERM',
        shutdownMs: performance.now() - started, leaderReleased: true, workspaceRemoved: true, ...result }))
    } finally { clearTimeout(deadline) }
  }
  console.log('PASS cold list/scan, shared target, pending denial, asynchronous development invalidation and explicitly enabled active API shutdown')
} finally {
  if (api && api.exitCode === null) api.kill('SIGKILL')
  rmSync(root, { recursive: true, force: true })
}
