#!/usr/bin/env node
// Regression checks for #487. No real provider, secrets or production files.
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createServer, request as httpRequest } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { createUsageLedger, initializeUsageLedger } from '../server/paper-translation/usageLedger.mjs'
import { createSingleFlight } from '../server/paper-translation/singleFlight.mjs'
import { createTranslationScheduler } from '../server/paper-translation/scheduler.mjs'
import { createPaperTranslationRoutes } from '../server/paper-translation/routes.mjs'
import { buildTranslationDomains } from '../shared/paper-selection/prompt.mjs'

const temp = mkdtempSync(path.join(tmpdir(), 'eqb-translation-repair-'))
let passed = 0
async function check(name, run) {
  await run()
  passed += 1
  console.log(`PASS ${name}`)
}
async function until(predicate) {
  const deadline = Date.now() + 3000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for test condition')
    await delay(5)
  }
}

try {
  const filePath = path.join(temp, 'usage.sqlite')
  const open = () => createUsageLedger({ filePath, monthlyBudgetCny: 0.001 })
  await check('missing ledger fails closed without creating a file', () => {
    assert.throws(open, { code: 'TRANSLATION_LEDGER_UNAVAILABLE' })
    assert.equal(existsSync(filePath), false)
  })
  await check('explicit first-time initialization preserves real costs on restart', () => {
    initializeUsageLedger({ filePath })
    const ledger = open()
    try {
      const receipt = ledger.reserve({ inputTokens: 1000, outputTokens: 0 })
      ledger.markDispatched(receipt.receiptId)
      ledger.settle(receipt.receiptId, { promptTokens: 1000, completionTokens: 0 })
      assert.equal(ledger.usedMicro(), 700)
      assert.equal(ledger.canReserve(700), false)
    } finally { ledger.close() }
    const restarted = open()
    try { assert.equal(restarted.usedMicro(), 700) } finally { restarted.close() }
  })
  await check('bootstrap refuses to overwrite an existing ledger', () => {
    assert.throws(() => initializeUsageLedger({ filePath }), { code: 'EEXIST' })
    const ledger = open()
    try { assert.equal(ledger.usedMicro(), 700) } finally { ledger.close() }
  })
  await check('deleting a previously initialized ledger never resets the budget', () => {
    rmSync(filePath)
    assert.throws(open, { code: 'TRANSLATION_LEDGER_UNAVAILABLE' })
    assert.equal(existsSync(filePath), false)
  })
  await check('empty and corrupt ledgers fail closed and are not overwritten', () => {
    for (const contents of ['', 'not a sqlite database']) {
      const target = path.join(temp, `invalid-${contents.length}.sqlite`)
      writeFileSync(target, contents)
      assert.throws(() => createUsageLedger({ filePath: target, monthlyBudgetCny: 1 }), { code: 'TRANSLATION_LEDGER_UNAVAILABLE' })
      assert.throws(() => initializeUsageLedger({ filePath: target }), { code: 'EEXIST' })
    }
  })
  await check('schema loss and partial schema are unavailable, not new ledgers', () => {
    for (const [index, sql] of [
      'CREATE TABLE unrelated (id TEXT)',
      'CREATE TABLE translation_receipts (receipt_id TEXT PRIMARY KEY)',
    ].entries()) {
      const target = path.join(temp, `schema-${index}.sqlite`)
      const db = new DatabaseSync(target)
      db.exec(sql)
      db.close()
      assert.throws(() => createUsageLedger({ filePath: target, monthlyBudgetCny: 1 }), { code: 'TRANSLATION_LEDGER_UNAVAILABLE' })
    }
  })
  await check('an intact legacy receipt schema remains readable without cost migration', () => {
    const target = path.join(temp, 'legacy.sqlite')
    // The initializer retains f360b62's receipt schema, without a new required marker.
    initializeUsageLedger({ filePath: target })
    const db = new DatabaseSync(target)
    db.exec('PRAGMA user_version=0')
    db.close()
    const ledger = createUsageLedger({ filePath: target, monthlyBudgetCny: 1 })
    try { assert.equal(ledger.available, true) } finally { ledger.close() }
  })

  const before = 'Earlier unrelated context '.repeat(60) + ' The doctor measured the '
  const after = ' of the patient. ' + 'Following context '.repeat(90)
  await check('domains preserve the nearest pre-context and complete long after-context', () => {
    const domains = buildTranslationDomains({ taskMode: 'contextual-fragment', beforeSelection: before, selectedText: 'pulse', afterSelection: after })
    assert.ok(domains.includes(`Context before: ${before}`))
    assert.ok(domains.includes('The doctor measured the '))
    assert.ok(domains.endsWith(`Context after: ${after}`))
  })
  await check('long selected text and Unicode are not silently clipped in domains', () => {
    const selectedText = 'Selected text '.repeat(90) + '🧪'
    const domains = buildTranslationDomains({ taskMode: 'selected-text', beforeSelection: before, selectedText, afterSelection: after })
    assert.ok(domains.includes(`Selected: ${selectedText}`))
    assert.ok(domains.length > 4000)
    assert.ok(!domains.includes('…'))
  })

  await check('an already aborted single-flight subscriber starts no work', async () => {
    let calls = 0
    const flights = createSingleFlight()
    const controller = new AbortController()
    controller.abort()
    await assert.rejects(flights.subscribe('pre-aborted', async () => { calls += 1 }, controller.signal), { code: 'TRANSLATION_CANCELLED' })
    assert.equal(calls, 0)
    assert.equal(flights.size, 0)
  })
  await check('one subscriber cancelling does not abort another subscriber', async () => {
    const flights = createSingleFlight()
    let finish
    let taskSignal
    const work = ({ signal }) => { taskSignal = signal; return new Promise((resolve) => { finish = resolve }) }
    const a = new AbortController()
    const first = flights.subscribe('shared', work, a.signal)
    const firstRejected = assert.rejects(first, { code: 'TRANSLATION_CANCELLED' })
    const second = flights.subscribe('shared', work)
    await until(() => Boolean(finish))
    a.abort()
    assert.equal(taskSignal.aborted, false)
    finish('shared result')
    await firstRejected
    assert.equal(await second, 'shared result')
  })
  await check('reselecting an abandoned key never joins its already aborted flight', async () => {
    const flights = createSingleFlight()
    let releaseOld
    const controller = new AbortController()
    const old = flights.subscribe('same-key', () => new Promise((resolve) => { releaseOld = resolve }), controller.signal)
    const rejected = assert.rejects(old, { code: 'TRANSLATION_CANCELLED' })
    await until(() => Boolean(releaseOld))
    controller.abort()
    const next = flights.subscribe('same-key', async () => 'fresh result')
    releaseOld('obsolete result')
    await rejected
    assert.equal(await next, 'fresh result')
    assert.equal(flights.size, 0)
  })
  await check('zero subscribers before dispatch leave queued work uncharged', async () => {
    const scheduler = createTranslationScheduler()
    const releaseA = await scheduler.acquireSlot()
    const releaseB = await scheduler.acquireSlot()
    const flights = createSingleFlight()
    const controller = new AbortController()
    let dispatches = 0
    const pending = flights.subscribe('queued', async ({ signal, hasSubscribers, markDispatched }) => {
      const release = await scheduler.acquireSlot()
      try {
        if (signal.aborted && !hasSubscribers()) throw Object.assign(new Error('cancelled'), { code: 'TRANSLATION_CANCELLED' })
        markDispatched()
        dispatches += 1
        return 'provider stub'
      } finally { release() }
    }, controller.signal)
    const rejected = assert.rejects(pending, { code: 'TRANSLATION_CANCELLED' })
    try {
      await until(() => scheduler.queued === 1)
      controller.abort()
      await rejected
    } finally { releaseA(); releaseB() }
    await until(() => flights.size === 0)
    assert.equal(dispatches, 0)
    assert.equal(scheduler.inFlight, 0)
  })

  // Actual Node HTTP lifecycle + actual route/body-reader/CSRF. Runtime is an
  // explicitly controlled stub so no canonical store or model is involved.
  const captures = []
  const calls = []
  const route = createPaperTranslationRoutes().find((item) => item.method === 'POST')
  const server = createServer((request, response) => {
    const capture = { request, response, beforeRequest: request.listenerCount('aborted'), beforeResponse: response.listenerCount('close') }
    captures.push(capture)
    void route.handle({ request, response, context: {
      resolveDataUserId: () => 'fixture',
      paperTranslation: {
        config: {},
        translate({ signal }) {
          return new Promise((resolve, reject) => {
            calls.push({ signal, resolve })
            signal.addEventListener('abort', () => reject(Object.assign(new Error('cancelled'), { code: 'TRANSLATION_CANCELLED' })), { once: true })
          })
        },
      },
    } }).then(() => { capture.finished = true })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  function post() {
    let request
    const result = new Promise((resolve, reject) => {
      request = httpRequest(origin + '/api/paper-translation/translate', {
        method: 'POST', headers: { origin, 'content-type': 'application/json' },
      }, (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
        response.on('error', reject)
      })
      request.on('error', reject)
      request.end('{}')
    })
    // A deliberate disconnect is expected; attach a handler before destroying.
    result.catch(() => {})
    return { request, result }
  }
  try {
    await check('normal HTTP request-body completion does not cancel translation', async () => {
      const client = post()
      await until(() => calls.length === 1 && captures[0].request.complete)
      await delay(15)
      assert.ok(calls[0].signal instanceof AbortSignal)
      assert.equal(calls[0].signal.aborted, false)
      calls[0].resolve({ ok: true })
      const response = await client.result
      assert.equal(response.status, 200)
      assert.equal(calls[0].signal.aborted, false)
    })
    await check('disconnect after reading the body cancels the waiting HTTP subscriber', async () => {
      const client = post()
      await until(() => calls.length === 2 && captures[1].request.complete)
      client.request.destroy()
      await client.result.catch(() => {})
      await until(() => calls[1].signal.aborted && captures[1].finished)
      assert.equal(captures[1].response.writableEnded, false)
    })
    await check('HTTP cancellation listeners are removed on success and disconnect', async () => {
      await until(() => captures.every((capture) => capture.finished))
      for (const capture of captures) {
        assert.equal(capture.request.listenerCount('aborted'), capture.beforeRequest)
        assert.equal(capture.response.listenerCount('close'), capture.beforeResponse)
      }
    })
  } finally {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  }
} finally {
  rmSync(temp, { recursive: true, force: true })
}
console.log(`OK translation repair ${passed}`)
