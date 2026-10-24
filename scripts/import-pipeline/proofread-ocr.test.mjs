import assert from 'node:assert/strict'
import { test } from 'node:test'
import { confirmOcrWithReconciliation } from './lib-proofread-ocr.mjs'

const paperId = 'paper-test'
const revisionId = 'rev-test'
const bundleDigest = `sha256:${'a'.repeat(64)}`
const receipt = { paperId, revisionId, bundleDigest, reviewerKind: 'import_agent', confirmationId: 'ocr-test' }
const success = { receipt, confirmation: { confirmed: true } }
const awaiting = { latestRevisionId: revisionId, revisions: [
  { id: revisionId, paperId, reviewKind: 'ocr', state: 'awaiting_review', bundleDigest },
] }
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})
const pending = () => json({ code: 'IMPORT_REVIEW_OCR_CONFIRMATION_PENDING' }, 404)
const network = () => new TypeError('fetch failed', { cause: Object.assign(new Error('socket closed'), { code: 'UND_ERR_SOCKET' }) })

function fixture(steps) {
  const calls = []
  const waits = []
  const logs = []
  return {
    calls, waits, logs,
    run: () => confirmOcrWithReconciliation({
      origin: 'http://localhost', credentialHeaders: { authorization: 'Bearer test' },
      paperId, revisionId, input: { bundleDigest, confirmation: { confirmed: true } },
      wait: async ms => { waits.push(ms) }, log: message => logs.push(message),
      fetchImpl: async (url, init) => {
        calls.push({ url, ...init })
        assert.ok(steps.length, `unexpected ${init.method} ${url}`)
        const step = steps.shift()
        if (step instanceof Error) throw step
        return typeof step === 'function' ? step() : step
      },
    }),
  }
}

function assertUnknown(error, attempts, observed) {
  assert.equal(error.code, 'IMPORT_REVIEW_OCR_CONFIRMATION_UNKNOWN')
  assert.match(error.message, /UNKNOWN.*revision=rev-test/u)
  assert.match(error.message, new RegExp(`POST attempts=${attempts}`))
  assert.match(error.message, observed)
  return true
}

test('network failure -> pending/latest awaiting_review -> identical POST succeeds', async () => {
  const f = fixture([network(), pending, () => json(awaiting), () => json(success)])
  assert.deepEqual(await f.run(), success)
  assert.deepEqual(f.calls.map(c => c.method), ['POST', 'GET', 'GET', 'POST'])
  assert.equal(f.calls[1].url, 'http://localhost/api/import-agent-reviews/revisions/rev-test/ocr-confirmation')
  assert.equal(f.calls[2].url, 'http://localhost/api/import-agent-reviews/papers/paper-test')
  assert.deepEqual(f.calls[0], f.calls[3], 'replay must keep exact URL, credentials and body')
  assert.deepEqual(f.waits, [30_000])
  assert.ok(f.calls.every(c => c.redirect === 'error'))
})

test('network failure -> approved receipt reconciles without a second POST', async () => {
  const f = fixture([network(), () => json(success)])
  assert.deepEqual(await f.run(), success)
  assert.deepEqual(f.calls.map(c => c.method), ['POST', 'GET'])
  assert.match(f.logs.at(-1), /reconciled after network error/u)
})

for (const patch of [
  { state: 'approved' }, { state: 'superseded' }, { reviewKind: 'candidate' },
  { bundleDigest: 'other' }, { paperId: 'paper-other' },
]) {
  test(`pending with mismatched revision ${JSON.stringify(patch)} fails UNKNOWN without replay`, async () => {
    const f = fixture([network(), pending, () => json({
      ...awaiting, revisions: [{ ...awaiting.revisions[0], ...patch }],
    })])
    await assert.rejects(f.run(), error => assertUnknown(error, 1, /revision.state=/u))
    assert.equal(f.calls.filter(c => c.method === 'POST').length, 1)
  })
}

for (const status of [
  { ...awaiting, latestRevisionId: 'rev-new' },
  { ...awaiting, revisions: [] },
]) {
  test(`pending with stale/missing revision ${JSON.stringify(status)} cannot replay`, async () => {
    const f = fixture([network(), pending, () => json(status)])
    await assert.rejects(f.run(), error => assertUnknown(error, 1, /latestRevisionId=/u))
    assert.equal(f.calls.length, 3)
  })
}

for (const status of [400, 401, 404, 409, 500, 503]) {
  test(`HTTP ${status} never reconciles or retries`, async () => {
    const f = fixture([() => json({ code: 'TEST_ERROR', error: 'terminated' }, status)])
    await assert.rejects(f.run(), error => error.status === status)
    assert.equal(f.calls.length, 1)
    assert.deepEqual(f.waits, [])
  })
}

test('HTTP headers received then body terminated never reconciles', async () => {
  const f = fixture([{
    status: 200, ok: true, headers: new Headers({ 'content-type': 'application/json' }),
    json: async () => { throw new TypeError('terminated') },
  }])
  await assert.rejects(f.run(), /terminated/u)
  assert.equal(f.calls.length, 1)
})

test('normal success preserves result and emits no retry diagnostics', async () => {
  const f = fixture([() => json(success)])
  assert.deepEqual(await f.run(), success)
  assert.deepEqual(f.logs, [])
  assert.deepEqual(f.waits, [])
})

test('POST attempts are capped at three, with final read-only reconciliation', async () => {
  const f = fixture(Array.from({ length: 3 }, () => [
    network(), pending, () => json(awaiting),
  ]).flat())
  await assert.rejects(f.run(), error => assertUnknown(error, 3, /revision.state=awaiting_review/u))
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 3)
  assert.deepEqual(f.waits, [30_000, 30_000, 30_000])
})

test('last POST may still reconcile to a matching committed receipt', async () => {
  const f = fixture([
    network(), pending, () => json(awaiting),
    network(), pending, () => json(awaiting),
    network(), () => json(success),
  ])
  assert.deepEqual(await f.run(), success)
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 3)
})

test('GET network errors allow three read-only retries and then fail UNKNOWN', async () => {
  const f = fixture([network(), network(), network(), network(), network()])
  await assert.rejects(f.run(), error => assertUnknown(error, 1, /GET.*network error/u))
  assert.deepEqual(f.calls.map(c => c.method), ['POST', 'GET', 'GET', 'GET', 'GET'])
  assert.deepEqual(f.waits, [30_000, 30_000, 30_000, 30_000])
})

test('read-only retries can recover both confirmation and status GETs', async () => {
  const f = fixture([network(), network(), pending, network(), () => json(awaiting), () => json(success)])
  assert.deepEqual(await f.run(), success)
  assert.deepEqual(f.calls.map(c => c.method), ['POST', 'GET', 'GET', 'GET', 'GET', 'POST'])
  assert.deepEqual(f.waits, [30_000, 30_000, 30_000])
})

for (const response of [
  () => json({ code: 'IMPORT_REVIEW_NOT_FOUND' }, 404),
  () => json({ code: 'UNKNOWN' }, 500),
  () => json({}, 200),
  () => json({ receipt: { ...receipt, revisionId: 'rev-other' } }),
  () => json({ receipt: { ...receipt, bundleDigest: 'other' } }),
  () => json({ receipt: { ...receipt, paperId: 'paper-other' } }),
]) {
  test('unrecognized confirmation or mismatched receipt fails UNKNOWN without replay', async () => {
    const f = fixture([network(), response])
    await assert.rejects(f.run(), error => assertUnknown(error, 1, /confirmation=|receipt revision=/u))
    assert.equal(f.calls.length, 2)
  })
}

test('non-network POST failure is not retried', async () => {
  const f = fixture([new Error('programming failure')])
  await assert.rejects(f.run(), /programming failure/u)
  assert.equal(f.calls.length, 1)
})

test('HTTP 500 on a replay stops immediately without another reconciliation', async () => {
  const f = fixture([network(), pending, () => json(awaiting), () => json({ code: 'FAILED' }, 500)])
  await assert.rejects(f.run(), error => error.status === 500)
  assert.deepEqual(f.calls.map(c => c.method), ['POST', 'GET', 'GET', 'POST'])
  assert.deepEqual(f.waits, [30_000])
})

test('status GET HTTP error reports the last observed status and never replays', async () => {
  const f = fixture([network(), pending, () => json({ code: 'AUTH_REQUIRED' }, 401)])
  await assert.rejects(f.run(), error => assertUnknown(error, 1, /HTTP 401/u))
  assert.equal(f.calls.length, 3)
})

test('status GET network exhaustion retains pending observation and never replays', async () => {
  const f = fixture([network(), pending, network(), network(), network(), network()])
  await assert.rejects(f.run(), error => {
    assertUnknown(error, 1, /IMPORT_REVIEW_OCR_CONFIRMATION_PENDING/u)
    assert.match(error.message, /GET.*network error/u)
    return true
  })
  assert.equal(f.calls.filter(c => c.method === 'POST').length, 1)
  assert.equal(f.calls.filter(c => c.method === 'GET').length, 5)
})

test('malformed confirmation JSON is UNKNOWN without retrying a received HTTP response', async () => {
  const f = fixture([network(), () => new Response('{', {
    headers: { 'content-type': 'application/json' },
  })])
  await assert.rejects(f.run(), error => assertUnknown(error, 1, /HTTP 200/u))
  assert.equal(f.calls.length, 2)
})

for (const error of [
  Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
  Object.assign(new Error('closed'), { code: 'UND_ERR_SOCKET' }),
  new Error('socket hang up'), new Error('terminated'),
]) {
  test(`network classification supports ${error.code || error.message}`, async () => {
    const f = fixture([error, () => json(success)])
    assert.deepEqual(await f.run(), success)
    assert.equal(f.calls.length, 2)
  })
}
