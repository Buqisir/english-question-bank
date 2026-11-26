import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { hostname, tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { receiveVerifiedUpload } from '../../server/import-ops/receiveVerifiedUpload.mjs'
import { digestJson } from '../../shared/paper-canonical/stable.mjs'
import { assertSubmissionPaper, boundOcrReceipt, matchingOcr, strandedUploads } from './review.mjs'
import { finishSubmissionHandoff } from './fast-import.mjs'
import { withReviewPaperLock } from './review-target.mjs'
import { readUploadReceipt, reconcileRevision, uploadReviewBundle, writeUploadReceipt } from './lib-review-upload.mjs'

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

async function fixture(t, { status = 503, failures = 0, lostResponse = false,
  missingPaths = null, unknownPath = false, requestDelay = 60, failPhase = null,
  metrics = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'eqb-upload-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const files = Array.from({ length: 8 }, (_, i) => {
    const bytes = Buffer.alloc(4096 + i, i)
    const name = `file ${i}.bin`
    writeFileSync(path.join(dir, name), bytes)
    return { path: name, byteLength: bytes.length, sha256: digest(bytes), mediaType: 'application/octet-stream' }
  })
  const manifest = { paperId: 'paper-test', files }
  const received = new Map()
  const attempts = new Map()
  const state = { active: 0, maximum: 0, finalized: 0, manifestCalls: 0, serverErrors: [] }
  const requested = missingPaths ?? files.map(f => f.path)
  const telemetry = (operation, durationsMs, failedStage = null) => metrics ? { metrics: {
    operation, outcome: failedStage ? 'failed' : 'succeeded', failedStage,
    durationsMs, totalMs: Object.values(durationsMs).reduce((sum, value) => sum + value, 0),
  } } : {}
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const json = (code, body) => {
      res.writeHead(code, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    try {
      if (req.method === 'PUT') {
        state.active++
        state.maximum = Math.max(state.maximum, state.active)
        try {
          const name = url.searchParams.get('path')
          const attempt = (attempts.get(name) || 0) + 1
          attempts.set(name, attempt)
          await delay(requestDelay)
          if (name === files[0].path && attempt <= failures) {
            req.resume()
            json(status, { error: 'simulated failure' })
            return
          }
          const file = files.find(f => f.path === name)
          const destination = path.join(dir, `stored-${name}`)
          const verified = await receiveVerifiedUpload(req, destination, file)
          received.set(name, verified)
          if (lostResponse && name === files[0].path && attempt === 1) {
            req.socket.destroy()
            return
          }
          json(200, telemetry('put', {
            status: attempt, receive: attempt > 1 ? 0 : 2, adoption: 3, installationAndMark: 4,
          }))
        } finally {
          state.active--
        }
      } else if (url.pathname.endsWith('/finalize')) {
        state.finalized++
        assert.equal(state.active, 0, 'finalize must wait for all active PUTs')
        assert.equal(received.size, requested.length)
        const timing = telemetry('finalize', {
          status: 1, fileHash: 2, projection: 3, identityAndReport: 4, inventory: 5, transactionAndPreview: 6,
        }, failPhase === 'finalize' ? 'projection' : null)
        if (failPhase === 'finalize') return json(503, timing)
        json(200, { revision: { id: 'rev-test', state: 'awaiting_review' }, ...timing })
      } else {
        state.manifestCalls++
        let body = ''
        for await (const chunk of req) body += chunk
        assert.deepEqual(JSON.parse(body), manifest)
        if (failPhase === 'manifest') return json(503, {})
        json(201, { revision: { id: 'rev-test' }, missingFiles: unknownPath ? ['unknown'] : requested,
          ...telemetry('register', { registration: 1, reuse: 2 }) })
      }
    } catch (error) {
      state.serverErrors.push(error)
      json(500, { error: error.message })
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => new Promise(resolve => server.close(resolve)))
  const api = async (pathname, init) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${pathname}`, init)
    const body = await response.json()
    if (!response.ok) throw Object.assign(new Error(`HTTP ${response.status}`), {
      status: response.status, ...(body.metrics ? { metrics: body.metrics } : {}),
    })
    return body
  }
  const localOrigin = `http://127.0.0.1:${server.address().port}`
  const run = (concurrency, retainLocalReceipt = false) => uploadReviewBundle({
    paperDir: dir, manifest, api, resolveReviewFile: path.join,
    timelinePath: path.join(dir, 'timing.jsonl'), concurrency,
    ...(retainLocalReceipt ? { localOrigin } : {}),
  })
  const timing = () => JSON.parse(readFileSync(path.join(dir, 'timing.jsonl'), 'utf8').trim())
  return { dir, manifest, run, timing, state, received, attempts, localOrigin }
}

test('local HTTP: successful upload returns the ID of its exact loopback receipt', async t => {
  const f = await fixture(t, { missingPaths: [] })
  const result = await f.run(1, true)
  assert.match(result.localUploadId, /^[0-9a-f-]{36}$/u)
  assert.deepEqual(f.timing().localReceipt,
    { uploadId: result.localUploadId, origin: f.localOrigin, revisionId: result.revision.id })
  const failed = await fixture(t, { missingPaths: [], failPhase: 'finalize' })
  await assert.rejects(failed.run(1, true), /HTTP 503/)
  assert(!failed.timing().localReceipt)
})

test('local HTTP: parallel and serial produce identical verified bytes and finalize results', async t => {
  const serial = await fixture(t)
  const parallel = await fixture(t)
  const started = performance.now()
  const a = await serial.run(1)
  const serialMs = performance.now() - started
  const parallelStarted = performance.now()
  const b = await parallel.run(4)
  const parallelMs = performance.now() - parallelStarted
  assert.deepEqual(a, b)
  assert.deepEqual([...serial.received].sort(), [...parallel.received].sort())
  assert.equal(serial.state.maximum, 1)
  assert.equal(parallel.state.maximum, 4)
  for (const f of [serial, parallel]) {
    assert.equal(f.state.finalized, 1)
    assert.deepEqual(f.state.serverErrors, [])
    assert.equal(f.timing().uploadedFiles, 8)
    assert.equal(f.timing().uploadedBytes, f.manifest.files.reduce((sum, f) => sum + f.byteLength, 0))
    assert.equal(f.timing().putAttempts, 8)
    assert.equal(f.timing().putRetries, 0)
    assert.equal(f.timing().completed, true)
    assert.ok(f.timing().putWallSeconds > 0)
    assert.ok(f.timing().putSeconds >= f.timing().putWallSeconds * 0.9)
    assert.ok(f.timing().finalizeSeconds > 0)
    for (const field of ['registerMetrics', 'putMetrics', 'finalizeMetrics']) {
      assert.equal(Object.hasOwn(f.timing(), field), false, `${field} stays absent on legacy servers`)
    }
  }
  // Report timings without making correctness depend on scheduler performance.
  t.diagnostic(`serial=${serialMs.toFixed(1)}ms parallel=${parallelMs.toFixed(1)}ms speedup=${(serialMs / parallelMs).toFixed(2)}x`)
})

for (const options of [{ failures: 1 }, { lostResponse: true }]) {
  test(`local HTTP: transient PUT retry (${JSON.stringify(options)}) counts each file once`, async t => {
    const f = await fixture(t, options)
    await f.run(4)
    assert.equal(f.attempts.get(f.manifest.files[0].path), 2)
    assert.equal(f.timing().uploadedFiles, 8)
    assert.equal(f.timing().uploadedBytes, f.manifest.files.reduce((sum, f) => sum + f.byteLength, 0))
    assert.equal(f.timing().putAttempts, 9)
    assert.equal(f.timing().putRetries, 1)
    assert.equal(f.timing().completed, true)
    assert.deepEqual(f.state.serverErrors, [])
  })
}

for (const [status, expectedAttempts] of [[503, 3], [400, 1], [401, 1], [409, 1]]) {
  test(`local HTTP: HTTP ${status} failure drains workers and never finalizes`, async t => {
    const f = await fixture(t, { status, failures: 99 })
    await assert.rejects(f.run(4), new RegExp(`HTTP ${status}`))
    assert.equal(f.state.active, 0)
    assert.equal(f.state.finalized, 0)
    assert.equal(f.attempts.get(f.manifest.files[0].path), expectedAttempts)
    assert.equal(f.timing().uploadedFiles, f.received.size)
    assert.equal(f.timing().completed, false)
    assert.equal(f.timing().finalizeSeconds, 0)
    assert.deepEqual(f.state.serverErrors, [])
  })
}

test('local HTTP: resume uploads only missing files; unknown paths fail before any PUT', async t => {
  const resumed = await fixture(t, { missingPaths: ['file 2.bin'] })
  await resumed.run(4)
  assert.equal(resumed.timing().manifestFiles, 8)
  assert.equal(resumed.timing().uploadedFiles, 1)
  assert.equal(resumed.timing().uploadedBytes, 4098)
  assert.equal(resumed.timing().reusedFiles, 7)
  assert.equal(resumed.timing().reusedBytes, resumed.manifest.files.reduce((sum, f) => sum + f.byteLength, 0) - 4098)
  const complete = await fixture(t, { missingPaths: [] })
  await complete.run(4)
  assert.equal(complete.timing().uploadedFiles, 0)
  assert.equal(complete.timing().reusedFiles, 8)
  assert.equal(complete.timing().reusedBytes, complete.manifest.files.reduce((sum, f) => sum + f.byteLength, 0))
  assert.equal(complete.state.finalized, 1)
  const unknown = await fixture(t, { unknownPath: true })
  await assert.rejects(unknown.run(4), /unknown file/)
  assert.equal(unknown.attempts.size, 0)
  assert.equal(unknown.state.finalized, 0)
})

test('local HTTP: metrics record registration, aggregate PUT/replay phases and successful finalize', async t => {
  const f = await fixture(t, { metrics: true, lostResponse: true, requestDelay: 0 })
  await f.run(4)
  const timing = f.timing()
  assert.deepEqual(timing.registerMetrics, {
    operation: 'register', outcome: 'succeeded', failedStage: null,
    durationsMs: { registration: 1, reuse: 2 }, totalMs: 3,
  })
  assert.deepEqual(timing.putMetrics, {
    count: 8, totalMs: 79, maxTotalMs: 10,
    durationsMs: { status: 9, receive: 14, adoption: 24, installationAndMark: 32 },
    maxDurationsMs: { status: 2, receive: 2, adoption: 3, installationAndMark: 4 },
  })
  assert.equal(timing.finalizeMetrics.operation, 'finalize')
  assert.equal(timing.finalizeMetrics.outcome, 'succeeded')
  assert.equal(timing.finalizeMetrics.durationsMs.transactionAndPreview, 6)
  assert.equal(timing.reusedFiles, 0)
  assert.equal(timing.reusedBytes, 0)
  assert.deepEqual(f.state.serverErrors, [])
})

test('local HTTP: reused files need no PUT and failed finalize retains metrics', async t => {
  const f = await fixture(t, { metrics: true, missingPaths: [], failPhase: 'finalize' })
  await assert.rejects(f.run(4), /HTTP 503/)
  const timing = f.timing()
  assert.equal(timing.reusedFiles, 8)
  assert.equal(timing.reusedBytes, f.manifest.files.reduce((sum, file) => sum + file.byteLength, 0))
  assert.equal(timing.finalizeMetrics.outcome, 'failed')
  assert.equal(timing.finalizeMetrics.failedStage, 'projection')
  assert.equal(timing.finalizeMetrics.durationsMs.fileHash, 2)
  assert.equal(Object.hasOwn(timing, 'putMetrics'), false)
  assert.equal(timing.completed, false)
  assert.deepEqual(f.state.serverErrors, [])
})

for (const failPhase of ['manifest', 'finalize']) {
  test(`local HTTP: ${failPhase} is never retried`, async t => {
    const f = await fixture(t, { failPhase })
    await assert.rejects(f.run(4), /HTTP 503/)
    assert.equal(f.state.manifestCalls, 1)
    assert.equal(f.state.finalized, failPhase === 'finalize' ? 1 : 0)
    assert.equal(f.timing().completed, false)
  })
}

test('production resumes the frozen manifest through lost PUT and finalize replies', async t => {
  const { dir, manifest } = await fixture(t)
  const { paperId } = manifest
  Object.assign(manifest, { producerBuildId: 'old-build', bundleDigest: digest('frozen') })
  const revision = { paperId, id: 'rev-own', bundleDigest: manifest.bundleDigest, reviewKind: 'candidate',
    state: 'uploading', finalizedAt: null, manifest }
  const stranded = { ...revision, id: 'rev-old', bundleDigest: digest('old invalid report') }
  const status = { paperId, latest: null, latestRevisionId: null, revisions: [stranded] }
  const observe = () => reconcileRevision(status, manifest, 'candidate', null, [stranded])
  const missing = new Set(manifest.files.slice(0, 2).map(file => file.path))
  const operations = []
  const api = async (route, init) => {
    operations.push(init.method)
    if (route.endsWith('/revisions')) {
      assert.deepEqual(JSON.parse(init.body), manifest)
      const created = !status.revisions.includes(revision)
      if (created) status.revisions.push(revision)
      return { revision, created, missingFiles: [...missing] }
    }
    if (init.method === 'PUT') {
      assert(missing.delete(decodeURIComponent(route.split('path=')[1])))
      if (missing.size) throw new TypeError('lost PUT reply')
      return {}
    }
    assert.equal(missing.size, 0)
    Object.assign(revision, { finalizedAt: '2026-01-01', state: 'awaiting_review' })
    Object.assign(status, { latest: revision, latestRevisionId: revision.id })
    throw new TypeError('lost finalize reply')
  }
  const run = () => uploadReviewBundle({ paperDir: dir, manifest, api, resolveReviewFile: path.join,
    timelinePath: path.join(dir, 'production.jsonl'), concurrency: 1, observe })
  status.revisions.push({ ...stranded, id: 'rev-foreign' })
  await assert.rejects(run, /UNKNOWN/)
  assert.deepEqual(operations, [])
  status.revisions.pop()
  await assert.rejects(run, /lost PUT/)
  await assert.rejects(run, /lost finalize/)
  assert.deepEqual(await run(), { revision, reconciled: true })
  assert.deepEqual(operations, ['POST', 'PUT', 'POST', 'PUT', 'POST'])
})

test('candidate referencing loopback OCR fails the production receipt check', async t => {
  const { dir, manifest } = await fixture(t)
  const file = 'agent-ocr-correction-report-v2.json'
  const report = { ocrRevisionId: 'rev-local', ocrConfirmationId: 'local-confirmation' }
  writeFileSync(path.join(dir, file), JSON.stringify(report))
  await assert.rejects(() => boundOcrReceipt(dir, { ...manifest, files: [{ path: file }],
    ocrCorrectionReportDigest: digestJson(report) }, async () => ({ receipt: {
      schemaVersion: 'web-import-ocr-review-confirmation-v1', paperId: manifest.paperId, revisionId: 'rev-production',
    } })), /exact historical correction binding/)
})

test('an absent production OCR needs upload, an exact evidence match reuses its revision', () => {
  const projection = { sourceSetDigest: digest('source'), evidenceDigest: digest('evidence') }
  const ocr = { reviewKind: 'ocr', manifest: projection }
  assert.equal(matchingOcr([], projection), undefined)
  assert.equal(matchingOcr([{ ...ocr, manifest: { ...projection, evidenceDigest: digest('other') } }, ocr], projection), ocr)
})

test('the command paperId binds both OCR and Candidate registration', () => {
  assertSubmissionPaper('paper-one', { paperId: 'paper-one' })
  assert.throws(() => assertSubmissionPaper('paper-one', { paperId: 'paper-two' }), /paperId 不一致/)
})

test('latest finalized reconciliation fills missing screenshots and an unreviewed handoff', async t => {
  const { dir, manifest: { paperId } } = await fixture(t)
  const ctx = { paperId, fast: dir, work: dir, statePath: path.join(dir, 'state.json'),
    state: { steps: { screen: { finishedAt: 'yesterday', result: { skipped: 'offline' } } } } }
  const pushed = { revisionId: 'rev-final', reconciled: true, target: 'https://example.test' }
  let captures = 0
  const capture = async (_, id, qa) => {
    assert.equal(id, pushed.revisionId)
    captures++
    mkdirSync(qa, { recursive: true })
    writeFileSync(path.join(qa, 'screen-tile-00.png'), '')
    return { tiles: 1, url: `https://example.test/?paperId=${paperId}&reviewRevision=${id}` }
  }
  await finishSubmissionHandoff(ctx, pushed, false, capture)
  await finishSubmissionHandoff(ctx, pushed, false, capture)
  assert.equal(captures, 1)
  const report = readFileSync(path.join(dir, 'handoff/校正报告与预处理完成表.md'), 'utf8')
  assert.match(report, /rev-final/)
  assert.match(report, /Screen 和 PDF 待目检/)
})

test('a fresh worktree reconciles stranded Candidates against production OCR history', () => {
  const paperId = 'paper-test'
  const manifest = { paperId, bundleDigest: digest('lecture') }
  const base = { paperId, id: 'rev-base', reviewKind: 'candidate', state: 'approved', finalizedAt: '2026-01-01',
    bundleDigest: digest('base'), revisionNumber: 3 }
  const report = { paperId, ocrRevisionId: 'rev-local' }
  const old = { paperId, id: 'rev-old', reviewKind: 'candidate', state: 'uploading', finalizedAt: null,
    revisionNumber: 1, bundleDigest: digest('old'), manifest: { schemaVersion: 'web-import-review-bundle-v3', ocrCorrectionReportDigest: digestJson(report) } }
  const status = { paperId, latest: base, latestRevisionId: base.id, revisions: [base, old] }
  const observe = report => reconcileRevision(status, manifest, 'candidate', base.id, strandedUploads(status, report))
  assert.equal(observe(), undefined)
  const ocr = { ...base, reviewKind: 'ocr', id: 'rev-production', revisionNumber: 2 }
  status.revisions.push(ocr)
  assert.equal(observe(), undefined)
  old.revisionNumber = 4
  assert.throws(() => observe(), /UNKNOWN/)
  assert.equal(observe(report), undefined)
  assert.throws(() => observe({ ...report, ocrRevisionId: 'rev-other' }), /UNKNOWN/)
  ocr.id = report.ocrRevisionId
  assert.throws(() => observe(report), /UNKNOWN/)
  status.revisions.splice(2)
  delete old.manifest.ocrCorrectionReportDigest
  assert.throws(() => observe(), /UNKNOWN/)
})

test('a truncated upload receipt is absent until replaced after exact finalized reconciliation', async t => {
  const { dir, manifest } = await fixture(t)
  const file = path.join(dir, 'upload-receipt.json')
  writeFileSync(file, '{"revision":')
  assert.equal(readUploadReceipt(file), null)
  const revision = { paperId: manifest.paperId, reviewKind: 'candidate', id: 'rev-latest',
    state: 'awaiting_review', finalizedAt: '2026-01-01', bundleDigest: digest('sealed') }
  const status = { paperId: manifest.paperId, latestRevisionId: revision.id, latest: revision, revisions: [revision] }
  manifest.bundleDigest = revision.bundleDigest
  const result = await uploadReviewBundle({ manifest, api: assert.fail, timelinePath: path.join(dir, 'timing.jsonl'),
    observe: () => reconcileRevision(status, manifest, 'candidate', null, strandedUploads(status)) })
  writeUploadReceipt(file, result)
  assert.deepEqual(readUploadReceipt(file), { revision, reconciled: true })
})

test('only a dead same-host lock owner can be replaced', async t => {
  const { dir } = await fixture(t)
  const lock = path.join(dir, 'review.lock')
  const moduleUrl = new URL('./review-target.mjs', import.meta.url).href
  const child = spawn(process.execPath, ['--input-type=module', '-e',
    `import {withReviewPaperLock} from ${JSON.stringify(moduleUrl)}
     await withReviewPaperLock(process.argv[1], () => { process.send('locked'); return new Promise(() => setInterval(() => {}, 1000)) })`, lock],
    { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] })
  t.after(() => { if (child.exitCode === null && !child.signalCode) child.kill() })
  await once(child, 'message')
  const file = path.join(lock, 'owner.json'), owner = JSON.parse(readFileSync(file))
  assert.equal(owner.pid, child.pid)
  assert.equal(owner.host, hostname())
  await assert.rejects(() => withReviewPaperLock(lock, assert.fail), /已持锁/)
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
  writeFileSync(file, JSON.stringify({ ...owner, host: 'another-host' }))
  await assert.rejects(() => withReviewPaperLock(lock, assert.fail), /已持锁/)
  writeFileSync(file, JSON.stringify(owner))
  await withReviewPaperLock(lock, () => assert.equal(JSON.parse(readFileSync(file)).pid, process.pid))
})
