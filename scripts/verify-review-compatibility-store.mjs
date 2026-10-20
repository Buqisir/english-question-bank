#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync,
  symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { createServer } from 'node:http'
import { performance } from 'node:perf_hooks'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths } from '../server/import-review/revisionProjection.mjs'
import { ensureReviewCompatibilityShape } from '../server/import-review/reviewCompatibilitySchema.mjs'
import { makeReviewRelease } from '../test-fixtures/review-compatibility/release.mjs'
import { verifyReviewCompatibilityScheduling } from '../test-fixtures/review-compatibility/scheduling.mjs'
import { inspectSealedReviewFiles } from '../server/import-review/sealedReviewFiles.mjs'
import { acquireReviewCompatibilityLeader, beginReviewActivity } from '../server/import-review/reviewCompatibilityScheduling.mjs'
import { manifestProductFiles } from '../server/paper-import/pdfProductSet.mjs'
import { prepareSourceReferences, SOURCE_REFERENCES_FILE } from '../server/paper-import/sourceReferences.mjs'
import { productInputDigest } from '../server/paper-import/frozenProducts.mjs'
import { productPdfBytes } from '../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'

const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs')
if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
const root = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-compatibility-store-'))
let server
let checks = 0
const pass = label => { checks++; console.log(`PASS ${label}`) }
const json = (file, value) => writeFileSync(file, JSON.stringify(value))
const readJson = file => JSON.parse(readFileSync(file))

try {
  const isolatedRoot = process.env.EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT
  const isolatedLeader = acquireReviewCompatibilityLeader()
  assert.ok(isolatedLeader)
  try {
    const record = readJson(path.join(isolatedRoot, 'leader'))
    assert.equal(record.pid, process.pid)
    assert.equal(record.uid, process.getuid())
    assert.equal(typeof record.processToken, 'string')
    assert.equal(typeof record.token, 'string')
  } finally { isolatedLeader.release() }
  pass('verifier lock root is isolated and leader records identify the owning process')
  await verifyReviewCompatibilityScheduling(pass)

  const empty = new DatabaseSync(':memory:')
  empty.exec('PRAGMA foreign_keys=ON; CREATE TABLE import_review_revisions(id TEXT PRIMARY KEY)')
  ensureReviewCompatibilityShape(empty)
  ensureReviewCompatibilityShape(empty)
  assert.deepEqual(empty.prepare('PRAGMA foreign_key_check').all(), [])
  assert.equal(empty.prepare('PRAGMA user_version').get().user_version, 0)
  empty.close()
  const nested = new DatabaseSync(':memory:')
  nested.exec('CREATE TABLE import_review_revisions(id TEXT PRIMARY KEY); BEGIN IMMEDIATE')
  ensureReviewCompatibilityShape(nested)
  assert.equal(nested.isTransaction, true)
  nested.exec('ROLLBACK')
  assert.equal(nested.prepare("SELECT name FROM sqlite_master WHERE name='review_subject'").get(), undefined)
  nested.close()
  pass('empty DB idempotency, outer transaction rollback and foreign keys')

  const fixture = makeReviewRoot(path.join(root, 'fixture'), 'paper-content-binding-store')
  const source = fixture.reviewRoot
  const config = readJson(path.join(source, 'config.json'))
  config.pdfProductsRequired = true
  config.provenance.month = 10
  json(path.join(source, 'config.json'), config)
  const projection = buildNck1ReviewProjection(source)
  const references = prepareSourceReferences(projection)
  const evidence = projection.materialization.documents.filter(file => file.role === 'official_answers').map(file => ({
    documentSha256: file.sha256, locator: { kind: 'page_region', documentId: file.documentId,
      page: 1, region: { x: 0, y: 0, width: 1, height: 1 } },
  }))
  for (const group of references.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', evidence, entries: [] }
  }
  json(path.join(source, SOURCE_REFERENCES_FILE), references)
  mkdirSync(path.join(source, 'products'))
  const products = { schemaVersion: 'paper-pdf-products-v3', listening: 'absent-by-exam-design',
    economyPageLimit: 8, paperId: projection.paperId, paperName: projection.paperName,
    examDate: { year: 2026, month: 10 }, inputDigest: productInputDigest(source, reviewBundleFilePaths(source)), files: [] }
  for (const [index, file] of manifestProductFiles(products).entries()) {
    const pageCount = [10, 8, 2][index]
    const bytes = productPdfBytes(pageCount, file.path)
    writeFileSync(path.join(source, file.path), bytes)
    products.files.push({ ...file, pageCount, sha256: sha256(bytes), byteLength: bytes.length })
  }
  json(path.join(source, 'products/manifest-v1.json'), products)
  const frozenProjection = buildNck1ReviewProjection(source)
  const files = reviewBundleFilePaths(source).map(file => {
    const bytes = readFileSync(path.join(source, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.length }
  })
  const manifest = { schemaVersion: 'web-import-review-bundle-v1', paperId: frozenProjection.paperId,
    paperName: frozenProjection.paperName, sourceDigest: frozenProjection.sourceDigest,
    candidateDigest: frozenProjection.candidateDigest, visibleStructureDigest: frozenProjection.visibleStructureDigest,
    analysisDigest: frozenProjection.analysisDigest, producerBuildId: 'fixture', files }
  manifest.bundleDigest = reviewBundleDigest(manifest)
  const dbPath = path.join(root, 'review.sqlite')
  const filesRoot = path.join(root, 'revisions')
  const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'historical-renderer' })
  const revision = store.createRevision(manifest).revision
  for (const file of files) {
    const { destination } = store.fileForUpload(revision.id, file.path)
    mkdirSync(path.dirname(destination), { recursive: true })
    writeFileSync(destination, readFileSync(path.join(source, file.path)))
    store.completeFileUpload(revision.id, file.path, file)
  }
  function dbRun(callback) {
    const db = new DatabaseSync(dbPath)
    try { return callback(db) } finally { db.close() }
  }
  const newRows = () => dbRun(db => ['import_review_product_previews', 'review_subject', 'review_compatibility']
    .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()))
  const historical = () => dbRun(db => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'import_review_%' ORDER BY name")
    .all().map(({ name }) => ({ name, rows: db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all() })))

  dbRun(db => db.exec(`CREATE TRIGGER fail_compatibility BEFORE INSERT ON review_compatibility
    BEGIN SELECT RAISE(ABORT, 'fixture atomic failure'); END`))
  assert.throws(() => store.finalizeRevision(revision.id), /fixture atomic failure/)
  assert.equal(store.getRevision(revision.id).state, 'uploading')
  assert.deepEqual(newRows().map(rows => rows.length), [0, 0, 0])
  dbRun(db => db.exec('DROP TRIGGER fail_compatibility'))
  await store.finalizeUploadedRevision(revision.id)
  assert.deepEqual(newRows().map(rows => rows.length), [1, 1, 1])
  assert.equal(newRows()[2][0].result, 'equal')
  assert.equal(newRows()[1][0].origin, 'finalize')
  const atomicRows = JSON.stringify(newRows())
  store.finalizeRevision(revision.id)
  assert.equal(JSON.stringify(newRows()), atomicRows)
  pass('finalize preview/subject/self equal rollback together; replay is byte-stable')

  // Model an old DB: drop only the additive empty-authority tables in this
  // synthetic fixture, leaving every original table and row untouched.
  const oldRows = JSON.stringify(historical())
  dbRun(db => db.exec('DROP TABLE review_compatibility; DROP TABLE review_subject'))
  const oldDbBytes = readFileSync(dbPath)
  const runDryRunCli = () => JSON.parse(execFileSync(process.execPath, [path.resolve('scripts/backfill-review-subjects.mjs'),
    '--db', dbPath, '--files-root', filesRoot], { encoding: 'utf8', timeout: 120_000 }))
  const cliLeader = acquireReviewCompatibilityLeader()
  assert.ok(cliLeader)
  try {
    const paused = runDryRunCli()
    assert.equal(paused.paused, 'LEADER_BUSY')
    assert.equal(paused.locks.root, isolatedRoot)
    assert.equal(paused.locks.leader.pid, process.pid)
    assert.equal(paused.locks.leader.alive, true)
  } finally { cliLeader.release() }
  writeFileSync(path.join(isolatedRoot, 'leader'), '', { flag: 'wx', mode: 0o600 })
  try {
    const paused = runDryRunCli()
    assert.equal(paused.paused, 'LEADER_BUSY')
    assert.equal(paused.locks.leader.state, 'malformed')
    assert.equal(paused.locks.leader.pid, null)
    assert.equal(paused.locks.leader.alive, null)
    assert.equal(readFileSync(path.join(isolatedRoot, 'leader'), 'utf8'), '')
  } finally { unlinkSync(path.join(isolatedRoot, 'leader')) }
  const cliActivity = beginReviewActivity('finalize-cli-fixture')
  try {
    const paused = runDryRunCli()
    assert.equal(paused.paused, 'ACTIVITY_PENDING')
    assert.equal(paused.locks.activities[0].pid, process.pid)
    assert.equal(paused.locks.activities[0].alive, true)
  } finally { cliActivity() }
  pass('CLI dry-run identifies live leader/activity owners and diagnoses empty records without stealing them')
  const oldDryRun = runDryRunCli()
  assert.equal(oldDryRun.dryRun, true)
  assert.equal(oldDryRun.results[0].comparison.result, 'equal')
  assert.deepEqual(readFileSync(dbPath), oldDbBytes)
  assert.equal(dbRun(db => db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('review_subject','review_compatibility')").get()).n, 0)
  pass('pre-migration CLI dry-run works without additive tables and preserves every DB byte')
  createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'historical-renderer' })
  createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'historical-renderer' })
  assert.equal(JSON.stringify(historical()), oldRows)
  assert.deepEqual(dbRun(db => db.prepare('PRAGMA foreign_key_check').all()), [])
  pass('old DB migration is idempotent and original rows stay byte-for-byte')

  const targetRoot = makeReviewRelease(path.join(root, 'target'))
  const { computeReviewBuildIdentity, reviewBuildIdentityProvider } = await import(
    pathToFileURL(path.join(targetRoot, 'server/import-review/reviewBuildIdentity.mjs')).href)
  const { createReviewCompatibilityStore } = await import(
    pathToFileURL(path.join(targetRoot, 'server/import-review/reviewCompatibilityStore.mjs')).href)
  const { runReviewCompatibilityBatch, REVIEW_WORKER_BUDGET } = await import(
    pathToFileURL(path.join(targetRoot, 'server/import-review/runReviewCompatibilityWorker.mjs')).href)
  const parser = path.join(targetRoot, 'scripts/import-pipeline/lib.mjs')
  const parserSource = readFileSync(parser, 'utf8')
  writeFileSync(path.join(targetRoot, 'app/src/main.css'), 'body{}')
  const firstBuild = computeReviewBuildIdentity({ repoRoot: targetRoot })
  writeFileSync(path.join(targetRoot, 'app/src/main.css'), 'body{color:red}')
  assert.equal(computeReviewBuildIdentity({ repoRoot: targetRoot }).targetBuildId, firstBuild.targetBuildId)
  const cached = reviewBuildIdentityProvider({ repoRoot: targetRoot, production: true })
  const cachedBuild = cached()
  writeFileSync(parser, `${parserSource}\n// target build 2\n`)
  assert.notEqual(computeReviewBuildIdentity({ repoRoot: targetRoot }).targetBuildId, firstBuild.targetBuildId)
  assert.equal(cached(), cachedBuild)
  pass('target identity ignores frontend, detects server edits and caches immutable releases')

  const compatibility = createReviewCompatibilityStore({ dbPath, filesRoot, repoRoot: targetRoot })
  const second = createReviewCompatibilityStore({ dbPath, filesRoot, repoRoot: targetRoot })
  assert.deepEqual(compatibility.get(revision.id), { result: 'unknown', reasonCode: 'NOT_CHECKED', pending: true })
  const a = compatibility.prepare(revision.id)
  const b = second.prepare(revision.id)
  const oldPath = process.env.PATH
  let resultA
  try {
    process.env.PATH = path.join(root, 'no-executables')
    resultA = await compatibility.compute(a)
  } finally { process.env.PATH = oldPath }
  assert.equal(resultA.comparison.result, 'equal', JSON.stringify(resultA.comparison))
  const resultB = await second.compute(b)
  assert.equal(resultB.comparison.result, 'equal')
  let previousTick = performance.now()
  let maxCommitDelayMs = 0
  let commitTicks = 0
  const commitTimer = setInterval(() => {
    const now = performance.now()
    maxCommitDelayMs = Math.max(maxCommitDelayMs, now - previousTick - 2)
    previousTick = now
    commitTicks++
  }, 2)
  let firstCommit
  try {
    await yieldFor(10)
    firstCommit = await compatibility.commit(a, resultA)
    await yieldFor(10)
  } finally { clearInterval(commitTimer) }
  assert.equal(firstCommit.committed, true)
  assert(commitTicks > 0)
  console.log(JSON.stringify({ check: 'compatibility-commit-event-loop', maxCommitDelayMs, commitTicks }))
  assert(maxCommitDelayMs < 50, `commit event loop delay ${maxCommitDelayMs.toFixed(2)}ms must be below 50ms`)
  pass('asynchronous commit keeps maximum main-thread event loop delay below 50ms')
  assert.equal((await second.commit(b, resultB)).reasonCode, 'CAS_CHANGED')
  assert.equal(newRows()[1].length, 1)
  assert.equal(newRows()[1][0].origin, 'stored_evidence')
  assert.equal(newRows()[2].length, 1)
  assert.equal(JSON.stringify(historical()), oldRows)
  pass('two overlapping worker snapshots produce one baseline and one terminal; no pdfinfo/executable required')

  const terminalRows = JSON.stringify(newRows().slice(1))
  assert.equal((await compatibility.checkRevision(revision.id)).appended, false)
  assert.equal(JSON.stringify(newRows().slice(1)), terminalRows)
  const tamperJob = compatibility.prepare(revision.id)
  const legitimate = await compatibility.compute(tamperJob, { timeoutMs: 1 })
  legitimate.comparison.result = 'equal'
  legitimate.comparison.reasonCode = 'FORGED'
  legitimate.baseline = {}
  await compatibility.commit(tamperJob, legitimate)
  assert.notEqual(compatibility.get(revision.id).reasonCode, 'FORGED')
  assert.equal(compatibility.get(revision.id).result, 'equal', 'transient diagnostic failure cannot overwrite a terminal result')
  pass('terminal rows cannot be overwritten and external diagnostic objects cannot forge results')

  // Use a fresh build namespace for each race so earlier terminal evidence
  // cannot mask a failed CAS or supply another revision's result.
  let build = 3
  const bump = () => writeFileSync(parser, `${parserSource}\n// target build ${build++}\n`)
  const beforeWorkerMismatch = readFileSync(parser, 'utf8')
  const mismatchJob = compatibility.prepare(revision.id)
  bump()
  const mismatchOutput = await compatibility.compute(mismatchJob)
  assert.equal(mismatchOutput.comparison.result, 'unknown')
  assert.equal(mismatchOutput.comparison.reasonCode, 'TARGET_IDENTITY_MISMATCH')
  writeFileSync(parser, beforeWorkerMismatch)
  assert.equal((await compatibility.commit(mismatchJob, mismatchOutput)).reasonCode, 'TARGET_IDENTITY_MISMATCH')
  assert.equal(JSON.stringify(newRows().slice(1)), terminalRows)
  pass('worker verifies its executing release; restoring supervisor identity cannot admit a mismatched worker')

  const productionStore = createReviewCompatibilityStore({ dbPath, filesRoot, repoRoot: targetRoot, production: true })
  const cachedJob = productionStore.prepare(revision.id)
  const cachedOutput = await productionStore.compute(cachedJob)
  bump()
  assert.equal((await productionStore.commit(cachedJob, cachedOutput)).reasonCode, 'TARGET_CHANGED')
  pass('commit bypasses production descriptor cache and rechecks executing files')
  bump()
  const changedBuildJob = compatibility.prepare(revision.id)
  const changedBuildResult = await compatibility.compute(changedBuildJob)
  bump()
  assert.equal((await compatibility.commit(changedBuildJob, changedBuildResult)).reasonCode, 'TARGET_CHANGED')
  assert.equal(compatibility.get(revision.id).reasonCode, 'NOT_CHECKED')
  pass('old target worker cannot write credentials for a new target')

  const issueJob = compatibility.prepare(revision.id)
  const issueResult = await compatibility.compute(issueJob)
  const issueCommit = compatibility.commit(issueJob, issueResult)
  const issue = store.createIssue(revision.paperId, { revisionId: revision.id, surface: 'paper',
    bundleDigest: revision.bundleDigest, message: 'Fixture Owner feedback' }, 'owner-fixture')
  const afterIssue = JSON.stringify(historical())
  assert.equal((await issueCommit).reasonCode, 'CAS_CHANGED')
  assert.equal(store.getRevision(revision.id).state, 'changes_requested')
  assert.equal(JSON.stringify(historical()), afterIssue)
  assert.ok(issue)
  pass('new issue while asynchronous commit identity is running preserves Owner state and rejects stale CAS')

  // The media receipt digest is independently part of CAS, without touching
  // revision.updated_at. A synthetic receipt row is sufficient to test that seam.
  const mediaJob = compatibility.prepare(revision.id)
  const mediaResult = await compatibility.compute(mediaJob)
  dbRun(db => db.prepare(`INSERT INTO import_review_media_confirmations VALUES
    (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('fixture-media', revision.paperId, revision.id,
    'media-fixture', sha256(Buffer.from('source')), sha256(Buffer.from('candidate')),
    sha256(Buffer.from('presentation')), '{}', 'fixture', new Date().toISOString()))
  assert.equal((await compatibility.commit(mediaJob, mediaResult)).reasonCode, 'CAS_CHANGED')
  pass('media confirmation changes invalidate CAS independently of revision.updated_at')

  const revisionJob = compatibility.prepare(revision.id)
  const revisionResult = await compatibility.compute(revisionJob)
  const nextManifest = { ...manifest, producerBuildId: 'next-fixture', expectedBaseRevisionId: revision.id }
  nextManifest.bundleDigest = reviewBundleDigest(nextManifest)
  const next = store.createRevision(nextManifest).revision
  for (const file of files) {
    const target = store.fileForUpload(next.id, file.path)
    mkdirSync(path.dirname(target.destination), { recursive: true })
    writeFileSync(target.destination, readFileSync(path.join(source, file.path)))
    store.completeFileUpload(next.id, file.path, file)
  }
  await store.finalizeUploadedRevision(next.id)
  const afterNext = JSON.stringify(historical())
  assert.equal((await compatibility.commit(revisionJob, revisionResult)).reasonCode, 'CAS_CHANGED')
  assert.equal(store.getRevision(revision.id).state, 'superseded')
  assert.equal(compatibility.get(next.id).reasonCode, 'NOT_CHECKED')
  assert.equal(JSON.stringify(historical()), afterNext)
  pass('new latest revision never borrows the old result or restores superseded state')

  const nextDir = store.revisionDirectory(next.id)
  const configFile = files.find(file => file.path === 'config.json')
  renameSync(path.join(nextDir, 'config.json'), path.join(nextDir, 'config-real.json'))
  symlinkSync('config-real.json', path.join(nextDir, 'config.json'))
  assert.equal(realpathSync(path.join(nextDir, 'config.json')), path.join(nextDir, 'config-real.json'))
  assert.throws(() => inspectSealedReviewFiles(nextDir, [configFile]))
  const leaf = await compatibility.checkRevision(next.id)
  assert.equal(leaf.comparison.result, 'unknown')
  assert.equal(leaf.comparison.reasonCode, 'SEALED_PATH_UNSAFE')
  unlinkSync(path.join(nextDir, 'config.json'))
  renameSync(path.join(nextDir, 'config-real.json'), path.join(nextDir, 'config.json'))
  renameSync(path.join(nextDir, 'source'), path.join(nextDir, 'source-real'))
  symlinkSync('source-real', path.join(nextDir, 'source'))
  assert.equal(realpathSync(path.join(nextDir, 'source')), path.join(nextDir, 'source-real'))
  assert.throws(() => inspectSealedReviewFiles(nextDir, files.filter(file => file.path.startsWith('source/'))),
    { reasonCode: 'SEALED_PATH_UNSAFE' })
  assert.equal((await compatibility.checkRevision(next.id)).comparison.result, 'unknown')
  unlinkSync(path.join(nextDir, 'source'))
  renameSync(path.join(nextDir, 'source-real'), path.join(nextDir, 'source'))
  pass('symlink leaf and every symlink parent rejected using actual filesystem counterexamples')

  bump()
  server = createServer((_request, response) => {
    // This long-running fixture measures health, not pooled socket expiry.
    response.setHeader('Connection', 'close')
    response.end('ok')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const healthUrl = `http://127.0.0.1:${server.address().port}/api/health`
  const workspaces = () => readdirSync(realpathSync(tmpdir())).filter(name => name.startsWith('eqb-review-job-')).sort()
  const beforeFaultWorkspaces = workspaces()
  const timeout = await compatibility.checkRevision(next.id, { timeoutMs: 1 })
  assert.equal(timeout.comparison.reasonCode, 'WORKER_TIMEOUT')
  assert.equal(await (await fetch(healthUrl)).text(), 'ok')
  const aborted = new AbortController()
  const exitJob = compatibility.prepare(next.id)
  const exitPending = compatibility.compute(exitJob, { signal: aborted.signal })
  aborted.abort()
  const exitResult = await exitPending
  await compatibility.commit(exitJob, exitResult)
  assert.equal(exitResult.comparison.reasonCode, 'WORKER_EXIT')
  const oom = await compatibility.checkRevision(next.id, { heapMb: 16 })
  assert.equal(oom.comparison.reasonCode, 'WORKER_OOM', JSON.stringify(oom.comparison))
  assert.deepEqual(workspaces(), beforeFaultWorkspaces, 'supervisor cleans custody after timeout, exit and OOM')
  assert.equal(await (await fetch(healthUrl)).text(), 'ok')
  assert.equal(store.getRevision(next.id).state, 'awaiting_review')
  assert.equal(compatibility.get(next.id).result, 'unknown')
  assert.equal(compatibility.scan({ nowMs: Date.now() + 600_000 }).includes(next.id), false,
    'at most two automatic retries, three attempts total')
  pass('timeout, worker exit and real bounded-heap OOM append unknown; API stays responsive; retry cap holds')

  bump()
  assert.equal((await compatibility.checkRevision(next.id, { timeoutMs: 1 })).comparison.reasonCode, 'WORKER_TIMEOUT')
  assert.equal(compatibility.scan().includes(next.id), false)
  assert.equal(compatibility.scan({ nowMs: Date.now() + 31_000 }).includes(next.id), true)
  await compatibility.checkRevision(next.id, { timeoutMs: 1 })
  assert.equal(compatibility.scan({ nowMs: Date.now() + 31_000 }).includes(next.id), false)
  assert.equal(compatibility.scan({ nowMs: Date.now() + 301_000 }).includes(next.id), true)
  pass('transient retries wait 30 seconds then 5 minutes; no hot loop')

  const leader = acquireReviewCompatibilityLeader()
  assert.ok(leader)
  try {
    const moduleUrl = new URL('../server/import-review/reviewCompatibilityScheduling.mjs', import.meta.url).href
    const child = execFileSync(process.execPath, ['--input-type=module', '-e',
      `import { acquireReviewCompatibilityLeader } from ${JSON.stringify(moduleUrl)}; console.log(acquireReviewCompatibilityLeader() === null)`],
    { encoding: 'utf8' })
    assert.equal(child.trim(), 'true')
    assert.equal((await runReviewCompatibilityBatch(compatibility)).paused, 'LEADER_BUSY')
  } finally { leader.release() }
  const finish = beginReviewActivity('finalize-fixture')
  try { assert.equal((await runReviewCompatibilityBatch(compatibility)).paused, 'ACTIVITY_PENDING') }
  finally { finish() }
  assert.deepEqual(REVIEW_WORKER_BUDGET, { heapMb: 384, deadlineMs: 120_000, batchSize: 5, yieldMs: 1000 })
  pass('host-wide leader excludes another process and finalize pauses new work; resource defaults exact')

  bump()
  const beforeDryRun = JSON.stringify(newRows())
  let completed = false
  const dryRunPending = runReviewCompatibilityBatch(compatibility, { dryRun: true }).finally(() => { completed = true })
  assert.equal(await (await fetch(healthUrl)).text(), 'ok')
  assert.equal(completed, false, 'health responds while compatibility computation is still running')
  const dryRun = await dryRunPending
  assert.equal(dryRun.results.length, 1)
  assert.equal(dryRun.results[0].comparison.result, 'equal')
  assert.equal(JSON.stringify(newRows()), beforeDryRun)
  assert.equal(compatibility.get(next.id).reasonCode, 'NOT_CHECKED')
  pass('dry-run computes real evidence without migration or writes')

  const issueId = dbRun(db => db.prepare('SELECT id FROM import_review_issues LIMIT 1').get().id)
  store.updateIssue(next.paperId, issueId, { action: 'dismiss', note: 'Synthetic Owner resolution' })
  const approvalJob = compatibility.prepare(next.id)
  const approvalResult = await compatibility.compute(approvalJob)
  const approval = store.approveRevision(next.paperId, next.id, { bundleDigest: next.bundleDigest }, 'owner-fixture')
  const afterApproval = JSON.stringify(historical())
  assert.equal((await compatibility.commit(approvalJob, approvalResult)).reasonCode, 'CAS_CHANGED')
  assert.deepEqual(store.getRevision(next.id).approval, approval)
  assert.equal(store.getRevision(next.id).state, 'approved')
  assert.equal(JSON.stringify(historical()), afterApproval)
  pass('approval during computation is preserved and stale worker CAS is rejected')

  // A terminal equal followed by changed sealed bytes must retain the terminal
  // row and append an integrity fault, never choose the favorable old result.
  await compatibility.checkRevision(next.id)
  const beforeTamper = newRows()[2]
  const original = readFileSync(path.join(nextDir, 'products/answerOnly.pdf'))
  const changed = Buffer.from(original)
  changed[changed.length - 1] ^= 1
  assert.notDeepEqual(changed, original)
  writeFileSync(path.join(nextDir, 'products/answerOnly.pdf'), changed)
  const changedFile = await compatibility.checkRevision(next.id)
  assert.equal(changedFile.comparison.reasonCode, 'SEALED_FILE_CHANGED')
  assert.equal(compatibility.get(next.id).reasonCode, 'TERMINAL_INTEGRITY_CONFLICT')
  assert.deepEqual(newRows()[2].slice(0, beforeTamper.length), beforeTamper)
  assert.deepEqual(dbRun(db => db.prepare('PRAGMA foreign_key_check').all()), [])
  pass('changed frozen bytes append integrity fault and retain every original terminal row')

  const originalSubject = dbRun(db => db.prepare('SELECT subject_json FROM review_subject WHERE revision_id=?').get(next.id).subject_json)
  dbRun(db => db.prepare('UPDATE review_subject SET subject_json=? WHERE revision_id=?').run('{broken', next.id))
  assert.notEqual(dbRun(db => db.prepare('SELECT subject_json FROM review_subject WHERE revision_id=?').get(next.id).subject_json), originalSubject)
  assert.equal((await compatibility.checkRevision(next.id)).comparison.reasonCode, 'BASELINE_UNTRUSTED')
  assert.equal(compatibility.get(next.id).reasonCode, 'BASELINE_UNTRUSTED')
  assert.equal(dbRun(db => db.prepare('SELECT subject_json FROM review_subject WHERE revision_id=?').get(next.id).subject_json), '{broken')
  pass('corrupt original subject appends unknown without crashing or repairing historical evidence')
  const beforeInvalidGraph = readFileSync(parser, 'utf8')
  const invalidGraphJob = compatibility.prepare(next.id)
  const invalidGraphOutput = await compatibility.compute(invalidGraphJob)
  try {
    writeFileSync(parser, `${parserSource}\nexport const invalidDynamicImport = value => import(value)\n`)
    assert.equal((await compatibility.commit(invalidGraphJob, invalidGraphOutput)).reasonCode, 'TARGET_IDENTITY_INVALID')
    assert.equal(compatibility.get(next.id).reasonCode, 'TARGET_IDENTITY_INVALID')
    const invalidResult = await compatibility.checkRevision(next.id)
    assert.equal(invalidResult.comparison.result, 'unknown')
    assert.equal(invalidResult.comparison.reasonCode, 'TARGET_IDENTITY_INVALID')
    const invalidBatch = await runReviewCompatibilityBatch(compatibility)
    assert.equal(invalidBatch.compatibility.result, 'unknown')
    assert.equal(invalidBatch.paused, 'TARGET_IDENTITY_INVALID')
  } finally { writeFileSync(parser, beforeInvalidGraph) }
  pass('an unresolved import graph produces unknown through store and batch public seams')
  console.log(`PASS review compatibility store/worker: ${checks} checks`)
} finally {
  if (server) await new Promise(resolve => server.close(resolve))
  rmSync(root, { recursive: true, force: true })
}
