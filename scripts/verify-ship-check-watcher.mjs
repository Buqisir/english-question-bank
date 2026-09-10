import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readdirSync, statSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import plugin, { readShipCheck } from '../.amp/plugins/ship-check-watcher.js'

const head = 'a'.repeat(40)
const repo = 'Buqisir/english-question-bank'
const target = { pullRequest: 411, head }
const ctx = { thread: { id: 'T-00000000-0000-0000-0000-000000000001' } }
const pr = { number: 411, state: 'open', head: { sha: head, repo: { full_name: repo } }, base: { ref: 'main', repo: { full_name: repo } } }
const check = { id: 10, app: { id: 4835036 }, name: 'Amp Orb Verify', head_sha: head, status: 'completed', conclusion: 'success' }
const reader = (checks, current = pr) => async endpoint => endpoint.includes('/pulls/') ? current : { check_runs: checks, total_count: checks.length }
const flush = () => new Promise(resolve => setImmediate(resolve))
assert.deepEqual(await readShipCheck(target, reader([check])), { check: { id: 10, conclusion: 'success' } })
for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required', 'neutral', 'skipped', 'stale']) {
  assert.equal((await readShipCheck(target, reader([{ ...check, conclusion }]))).check.conclusion, conclusion)
}
for (const changed of [{ app: { id: 1 } }, { name: 'Other' }, { status: 'in_progress', conclusion: null }, { conclusion: null }]) {
  assert.deepEqual(await readShipCheck(target, reader([{ ...check, ...changed }])), { pending: true })
}
assert.deepEqual(await readShipCheck(target, reader([check, { ...check, id: 11, status: 'queued' }])), { pending: true })
assert.equal((await readShipCheck(target, reader([check, { ...check, id: 11, conclusion: 'failure' }]))).check.conclusion, 'failure')
await assert.rejects(readShipCheck(target, reader([check, check])), /Ambiguous/)
await assert.rejects(readShipCheck(target, reader([{ ...check, head_sha: 'b'.repeat(40) }])), /Ambiguous/)
await assert.rejects(readShipCheck(target, reader([], {})), /Unknown PR/)
assert.equal((await readShipCheck(target, reader([], { ...pr, state: 'closed' }))).stopped, 'closed')
assert.equal((await readShipCheck(target, reader([], { ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } }))).stopped, 'head-changed')
let reads = 0
assert.deepEqual(await readShipCheck(target, async endpoint => endpoint.includes('/pulls/') ? pr : {
  total_count: 1,
  check_runs: ++reads === 1 ? [check] : [{ ...check, id: 11, status: 'in_progress' }],
}), { pending: true })
reads = 0
assert.equal((await readShipCheck(target, async endpoint => endpoint.includes('/pulls/')
  ? (++reads === 1 ? pr : { ...pr, state: 'closed' }) : { check_runs: [check], total_count: 1 })).stopped, 'closed')
const page = Array.from({ length: 100 }, (_, i) => ({ ...check, id: i + 1 }))
assert.equal((await readShipCheck(target, async endpoint => endpoint.includes('/pulls/') ? pr : {
  total_count: 101,
  check_runs: endpoint.endsWith('page=1') ? page : [{ ...check, id: 101, conclusion: 'failure' }],
})).check.id, 101)
await assert.rejects(readShipCheck(target, async endpoint => endpoint.includes('/pulls/') ? pr : { check_runs: page, total_count: 2001 }), /pagination/)
await assert.rejects(readShipCheck(target, async endpoint => endpoint.includes('/pulls/') ? pr : { check_runs: [check], total_count: 2 }), /Incomplete/)
const wrongAppPage = [check, ...Array.from({ length: 99 }, (_, i) => ({ ...check, id: 1000 + i, app: { id: 1 } }))]
await assert.rejects(readShipCheck(target, async endpoint => endpoint.includes('/pulls/') ? pr : {
  total_count: 101,
  check_runs: endpoint.endsWith('page=1') ? wrongAppPage : [wrongAppPage[1]],
}), /Ambiguous Check pagination identity/, 'duplicate wrong-App run cannot hide an omitted newer authoritative Check')

const dir = mkdtempSync(path.join(os.tmpdir(), 'ship-check-watcher-'))
try {
  let currentReader = reader([]), time = 0, appended = 0, released = 0, failAppend = false, disposed
  let leaseCalls = 0, resolveLease
  let acquireLease = () => new Promise(resolve => { resolveLease = resolve })
  const lease = () => ({ unsubscribe: () => { released++ } })
  const messages = []
  const tools = new Map(), timers = new Map(), expiries = new Map()
  const amp = {
    registerTool: tool => tools.set(tool.name, tool), onDispose: callback => { disposed = callback }, logger: { log() {} },
    system: { executor: { keepAlive: () => { leaseCalls++; return acquireLease() } } },
    threads: { get: threadID => {
      assert.equal(threadID, ctx.thread.id)
      return { appendUserMessage: async (...args) => {
        appended++
        messages.push(args[0].content)
        assert.equal(args.length, 1, 'no steer option')
        assert.match(args[0].content, /Re-read the current open PR\/head/)
        assert.match(args[0].content, /adds no Ship, merge, or deployment authorization/)
        if (failAppend) throw new Error('response unknown')
      } }
    } },
  }
  plugin(amp, { stateDir: dir, now: () => time, readJson: (...args) => currentReader(...args),
    setInterval: (fn, ms) => { assert.equal(ms, 45000); timers.set(fn, fn); return fn }, clearInterval: fn => timers.delete(fn),
    setTimeout: (fn, ms) => { assert.equal(ms, 3600000); expiries.set(fn, fn); return fn }, clearTimeout: fn => expiries.delete(fn),
  })
  const start = input => tools.get('ship_watch_check').execute(input || target, ctx)
  const cancel = () => tools.get('ship_cancel_check_watch').execute({}, ctx)
  await assert.rejects(start({ ...target, threadID: 'other' }), /Invalid/)
  let registered = false
  const first = start()
  const concurrent = start().then(result => { registered = true; return result })
  await flush()
  assert.equal(registered, false, 'duplicate startup cannot confirm before keepAlive succeeds')
  assert.equal(leaseCalls, 1, 'concurrent registration shares one startup')
  resolveLease(lease())
  const registration = await first
  assert.equal(await concurrent, registration)
  acquireLease = async () => lease()
  await flush()
  const recordPath = path.join(dir, readdirSync(dir).find(name => !name.includes('.claim.')))
  const saved = readFileSync(recordPath, 'utf8')
  time = 1000
  assert.equal(await start(), registration, 'repeat registration returns the original deadline')
  assert.equal(readFileSync(recordPath, 'utf8'), saved, 'repeat does not rewrite registration')
  assert.equal(leaseCalls, 1); assert.equal(timers.size, 1); assert.equal(expiries.size, 1)
  await assert.rejects(start({ ...target, head: 'b'.repeat(40) }), /different wait/)
  await assert.rejects(start({ ...target, pullRequest: 412 }), /different wait/)
  assert.equal(appended, 0)
  currentReader = async () => { throw new Error('private error') }
  for (const fn of timers.values()) fn()
  await flush(); assert.equal(timers.size, 1)
  currentReader = reader([check])
  for (const fn of timers.values()) { fn(); fn() }
  await flush(); assert.equal(appended, 1); assert.equal(timers.size, 0); assert.equal(released, 1)
  assert.ok(!messages[0].includes('Check failure summary'), 'success message unchanged')
  for (const name of readdirSync(dir)) assert.equal(statSync(path.join(dir, name)).mode & 0o777, 0o600)
  await start(); await flush(); assert.equal(appended, 1, 'claim prevents duplicate notification')
  currentReader = reader([{ ...check, id: 12 }]); failAppend = true
  await start(); await flush(); await start(); await flush()
  assert.equal(appended, 2, 'unknown append never retries')
  currentReader = reader([])
  await start(); await flush(); await cancel(); assert.equal(timers.size, 0)
  await start(); await flush(); time += 3600000
  for (const fn of timers.values()) fn()
  await flush(); assert.equal(timers.size, 0)
  await start(); await flush(); disposed(); assert.equal(timers.size, 0)
  for (const changedPR of [{ ...pr, state: 'closed' }, { ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } }]) {
    currentReader = reader([], changedPR)
    const before = released
    await start(); await flush()
    assert.equal(released, before + 1); assert.equal(timers.size, 0); assert.equal(expiries.size, 0)
  }
  currentReader = reader([])
  await start(); await flush()
  for (const fn of expiries.values()) fn()
  assert.equal(timers.size, 0); assert.equal(expiries.size, 0)
  let resolve
  currentReader = () => new Promise(r => { resolve = r })
  await start(); await flush(); await cancel(); resolve({ ...pr, state: 'closed' })
  await flush(); assert.equal(appended, 2, 'cancel wins an in-flight read')
  currentReader = reader([{ ...check, id: 13 }])
  await start(); rmSync(dir, { recursive: true, force: true }); await flush()
  assert.equal(appended, 2, 'storage failure cannot append')
  failAppend = false
  for (const conclusion of ['failure', 'cancelled', 'timed_out', 'action_required']) {
    const summary = `Fast: FAIL (${conclusion})\nFull: PASS\nPASS 173 / SKIP 2 / FAIL 0`
    const failed = { ...check, conclusion, output: { summary } }
    const before = appended
    currentReader = reader([failed], { ...pr, head: { ...pr.head, sha: 'b'.repeat(40) } })
    await start(); await flush()
    assert.equal(appended, before, `${conclusion}: stale head cannot notify or claim`)
    let checkReads = 0
    currentReader = async endpoint => endpoint.includes('/pulls/') ? pr : {
      total_count: 1, check_runs: [{ ...failed, output: { summary: ++checkReads === 1 ? 'old summary' : summary } }],
    }
    await start(); await flush()
    assert.equal(appended, before + 1, `${conclusion}: direct target notification`)
    const message = messages.at(-1)
    assert.ok(message.includes('PR: 411'))
    assert.ok(message.includes(`Frozen head: ${head}`))
    assert.ok(message.includes(`Check: https://github.com/${repo}/runs/10`))
    assert.ok(message.includes(`conclusion: ${conclusion}`))
    assert.ok(message.endsWith(summary), 'use the confirmed Check summary verbatim')
    assert.equal(timers.size, 0); assert.equal(expiries.size, 0)
    currentReader = reader([failed])
    await start(); await flush()
    assert.equal(appended, before + 1, `${conclusion}: existing claim prevents duplicate`)
  }
  currentReader = reader([{ ...check, id: 20, conclusion: 'failure' }])
  await start(); await flush()
  assert.ok(!messages.at(-1).includes('Check failure summary'), 'missing summary cannot fabricate diagnostics')
  currentReader = reader([{ ...check, id: 21, output: { summary: 'success output must not change notice' } }])
  await start(); await flush()
  assert.ok(!messages.at(-1).includes('success output must not change notice'))
  currentReader = reader([])
  let rejectLease
  acquireLease = () => new Promise((_resolve, reject) => { rejectLease = reject })
  const failing = start(), failingDuplicate = start()
  rejectLease(new Error('lease unavailable'))
  assert.match(await failing, /Watcher unavailable/)
  assert.equal(await failingDuplicate, await failing, 'duplicates share startup failure, not a false confirmation')
  assert.equal(timers.size, 0); assert.equal(expiries.size, 0)
  acquireLease = () => new Promise(resolve => { resolveLease = resolve })
  const cancelledStartup = start(), cancelledDuplicate = start()
  await cancel()
  resolveLease(lease())
  assert.equal(await cancelledStartup, 'Wait already stopped')
  assert.equal(await cancelledDuplicate, 'Wait already stopped')
  assert.equal(timers.size, 0); assert.equal(expiries.size, 0)
  acquireLease = () => new Promise((_resolve, reject) => { rejectLease = reject })
  const obsoleteStartup = start(), obsoleteDuplicate = start()
  await cancel()
  acquireLease = async () => lease()
  time += 1000
  const successor = await start(); await flush()
  const successorState = readFileSync(recordPath, 'utf8')
  rejectLease(new Error('late rejection from cancelled registration'))
  assert.equal(await obsoleteStartup, 'Wait already stopped')
  assert.equal(await obsoleteDuplicate, 'Wait already stopped')
  assert.equal(readFileSync(recordPath, 'utf8'), successorState, 'obsolete startup cannot overwrite successor state or deadline')
  assert.equal(JSON.parse(successorState).state, 'watching')
  assert.equal(await start(), successor, 'successor remains the active registration')
  assert.equal(timers.size, 1, 'failed or cancelled startup can be explicitly retried')
  assert.equal(expiries.size, 1)
  disposed()
  console.log('PASS Ship watcher: idempotent registration/startup/failure/cancel, identity/latest/pagination/races, 45s cadence, deadline/cancel/dispose, read/storage/unknown-append failures, one-shot current-thread notification; failure/cancelled/timed_out/action_required summary delivery, stale-head and dedupe; success unchanged')
} finally { rmSync(dir, { recursive: true, force: true }) }
