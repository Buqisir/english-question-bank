import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { receiveVerifiedUpload } from '../../server/import-ops/receiveVerifiedUpload.mjs'
import { uploadReviewBundle } from './lib-review-upload.mjs'

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
  const run = concurrency => uploadReviewBundle({
    paperDir: dir, manifest, api, resolveReviewFile: path.join,
    timelinePath: path.join(dir, 'timing.jsonl'), concurrency,
  })
  const timing = () => JSON.parse(readFileSync(path.join(dir, 'timing.jsonl'), 'utf8').trim())
  return { dir, manifest, run, timing, state, received, attempts }
}

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
