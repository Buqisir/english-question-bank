import assert from 'node:assert/strict'
import { fork, spawn, spawnSync } from 'node:child_process'
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { matchingReviewProcess, reviewProcessIdentity, reviewProcessGroupMembers, killReviewProcessTree } from '../../server/import-review/reviewProcessTree.mjs'
import { createPromotionOperationStore } from '../../server/import-review/promotionOperationStore.mjs'
import { writeFixtureJson } from './faults.mjs'

const hook = new URL('./hook.mjs', import.meta.url).pathname
const driver = new URL('./api.mjs', import.meta.url)
// Budgets describe the work preceding a checkpoint, not its stage name.
// Full publication/recovery retains the existing 45s cap; harness IPC is 60s.
// CI seed publication took about 14s; failing late checkpoints were still
// running at 20s. Records below retain evidence of where the extra time goes.
const checkpointBudgets = { control: 20_000, publication: 45_000, recovery: 45_000 }
const publicationStages = ['before-publisher', 'after-bank-commit',
  'before-mark-published', 'after-mark-published', 'before-worker-ipc']
const publicationRecords = Object.fromEntries(publicationStages.map(stage => [stage, 'record']))
const safeTail = value => String(value).replace(/(bearer\s+)\S+/gi, '$1<redacted>')
  .replace(/((?:token|nonce|secret|authorization)["']?\s*[:=]\s*["']?)[^\s"',}]+/gi, '$1<redacted>').slice(-4000)
function replySummary(value, transport) {
  const reply = transport === 'http' ? value?.body : value
  const summary = { transport, httpStatus: transport === 'http' ? value?.status : undefined }
  for (const key of ['type', 'code', 'reasonCode', 'message', 'error', 'operationId']) {
    if (['string', 'number', 'boolean'].includes(typeof reply?.[key])) summary[key] = safeTail(reply[key])
  }
  for (const key of ['status', 'completed', 'rejected', 'blocked']) {
    if (['string', 'number', 'boolean'].includes(typeof reply?.result?.[key])) summary[key] = safeTail(reply.result[key])
  }
  return summary
}
function clientDiagnostics(client) {
  try {
    if (typeof client.diagnostics === 'function') return client.diagnostics()
  } catch {}
  // Manual HTTP clients have no IPC call ledger. Never mask the trial error.
  return { pid: client.child?.pid, exitCode: client.child?.exitCode,
    signalCode: client.child?.signalCode, diagnostics: 'unavailable' }
}
async function waitCheckpoint(marker, label, stage, pendingCall, { flow, transport }) {
  assert.ok(stage && /^[a-z-]+$/.test(stage), 'exact checkpoint stage required')
  assert.ok(Object.hasOwn(checkpointBudgets, flow), 'explicit checkpoint flow required')
  assert.ok(['ipc', 'http', 'reconcile'].includes(transport), 'explicit call transport required')
  assert.ok(pendingCall && typeof pendingCall.then === 'function', 'current pending call required')
  const file = `${marker}.${stage}`
  let terminal
  pendingCall.then(value => { terminal = { value } }, error => { terminal = { error } })
  const timeoutMs = checkpointBudgets[flow]
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (existsSync(file)) {
      const value = JSON.parse(readFileSync(file))
      assert.equal(value.stage, stage)
      return value
    }
    if (terminal) {
      const reply = terminal.error
        ? { transport, error: safeTail(terminal.error.message || terminal.error) }
        : replySummary(terminal.value, transport)
      throw new Error(`Promotion call ended before ${label}: ${stage}: ${JSON.stringify(reply)}`)
    }
    await yieldFor(25)
  }
  throw new Error(`Timed out: ${label}: ${stage} (${flow}, ${timeoutMs}ms)`)
}
function query(file, sql, parameters = []) {
  const db = new DatabaseSync(file, { readOnly: true })
  try { return db.prepare(sql).all(...parameters) } finally { db.close() }
}
async function until(predicate, label, timeout = 20_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try { const value = await predicate(); if (value) return value } catch {}
    await yieldFor(25)
  }
  throw new Error(`Timed out: ${label}`)
}
function api(env) {
  const child = fork(driver, [], { env, detached: true, execArgv: [], stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
  const pending = new Map()
  let stderr = ''
  const calls = []
  const summary = value => replySummary(value, 'ipc')
  child.stderr.on('data', bytes => { stderr = (stderr + bytes).slice(-8192) })
  let ready
  const opened = new Promise(resolve => { ready = resolve })
  child.on('message', message => {
    if (message.type === 'ready') ready(message)
    else if (pending.has(message.requestId)) {
      pending.get(message.requestId)(message); pending.delete(message.requestId)
    }
  })
  child.on('exit', () => {
    ready({ exited: true, stderr })
    for (const resolve of pending.values()) resolve({ type: 'exited', stderr })
    pending.clear()
  })
  return { child, opened,
    diagnostics: () => ({ pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode,
      calls: calls.slice(-8), stderrTail: safeTail(stderr) }),
    call(message) {
      const requestId = randomUUID()
      const started = Date.now()
      const record = { requestId, type: message.type, state: 'pending' }
      calls.push(record)
      if (calls.length > 8) calls.shift()
      return new Promise(resolve => {
        const timer = setTimeout(() => { pending.delete(requestId); resolve({ type: 'timeout', stderr }) }, 60_000)
        pending.set(requestId, value => { clearTimeout(timer); resolve(value) })
        child.send({ ...message, requestId }, error => {
          if (error) { clearTimeout(timer); pending.delete(requestId); resolve({ type: 'exited' }) }
        })
      }).then(value => {
        Object.assign(record, { state: 'settled', elapsedMs: Date.now() - started, reply: summary(value) })
        return value
      })
    },
    async stop() {
      if (child.exitCode !== null || child.signalCode) return
      const closed = new Promise(resolve => child.once('exit', resolve))
      child.send({ type: 'stop' })
      await closed
    },
  }
}
export async function verifyPromotionWorkerMatrix({ root, seedDb, ship, scoped, owner }) {
  async function trial(label, stage, action, body, budget = {}) {
    if (process.env.EQB_PROMOTION_VERIFY_FILTER && !label.includes(process.env.EQB_PROMOTION_VERIFY_FILTER)) return
    const disk = statfsSync(tmpdir())
    if (disk.bavail * disk.bsize < 10_000_000_000) throw new Error('DISK_STOP_BELOW_10_GB')
    const outputRoot = process.env.EQB_PROMOTION_VERIFY_OUTPUT_ROOT
    const directory = mkdtempSync(path.join(outputRoot || tmpdir(), 'eqb-promotion-fault-'))
    const dbPath = path.join(directory, 'review.sqlite')
    copyFileSync(seedDb, dbPath)
    cpSync(path.join(root, 'files'), path.join(directory, 'files'), { recursive: true })
    mkdirSync(path.join(directory, 'assets'))
    mkdirSync(path.join(directory, 'locks'), { mode: 0o700 })
    const bank = new DatabaseSync(path.join(directory, 'bank.sqlite'))
    bank.exec(readFileSync(new URL('../../data/sql/schema.sql', import.meta.url), 'utf8')); bank.close()
    const marker = path.join(directory, 'checkpoint.json')
    const env = { ...process.env, QUESTION_BANK_DB: path.join(directory, 'bank.sqlite'),
      QUESTION_BANK_IMPORT_OPS_DB: dbPath, QUESTION_BANK_IMPORT_OPS_ROOT: path.join(directory, 'files'),
      QUESTION_BANK_PAPER_ASSET_ROOT: path.join(directory, 'assets'), QUESTION_BANK_BLOB_ROOT: path.join(directory, 'blobs'),
      EQB_REVIEW_COMPATIBILITY_TEST_LOCK_ROOT: path.join(directory, 'locks'),
      EQB_REVIEW_SUBJECT_BACKFILL: '1', EQB_REVIEW_COMPATIBILITY_AUTORUN: '1',
      ...(stage ? { NODE_OPTIONS: `--import=${hook}`, EQB_PROMOTION_FAULT_STAGE: stage,
        EQB_PROMOTION_FAULT_ACTION: action, EQB_PROMOTION_FAULT_MARKER: marker } : {}),
      ...budget }
    const clients = []
    const started = Date.now()
    const ownedIdentities = []
    const ownedWorkspaces = []
    let passed = false
    let diskStopped = false
    let emergencyCleanup
    const cleanupProof = []
    async function stopExact(identity, group = true) {
      const state = await matchingReviewProcess(identity)
      assert.ok(['live', 'dead'].includes(state), 'owned process identity became ambiguous')
      if (group && (state === 'live' || (await reviewProcessGroupMembers(identity.pid)).length)) {
        await killReviewProcessTree({ pid: identity.pid })
      } else if (state === 'live') process.kill(identity.pid, 'SIGKILL')
      await until(async () => await matchingReviewProcess(identity) === 'dead', 'exact owned process death')
      if (group) assert.deepEqual(await reviewProcessGroupMembers(identity.pid), [])
      cleanupProof.push({ ...identity, state: 'dead', group: group ? 'empty' : 'not-detached' })
    }
    const diskMonitor = setInterval(() => {
      const disk = statfsSync(tmpdir())
      if (disk.bavail * disk.bsize >= 10_000_000_000 || diskStopped) return
      diskStopped = true
      emergencyCleanup = (async () => {
        for (const client of clients) if (client.identity) await stopExact(client.identity)
        for (const identity of context.registered()) await stopExact(identity)
        for (const row of context.rows()) {
          for (const [pid, startId] of [[row.supervisor_pid, row.supervisor_start_id], [row.worker_pid, row.worker_start_id]]) {
            if (pid) await stopExact({ bootId: row.owner_boot_id, pid, startId })
          }
        }
        for (const identity of ownedIdentities) await stopExact(identity)
      })()
      emergencyCleanup.catch(error => console.error('Exact disk-stop cleanup failed:', error))
    }, 500)
    const context = {
      directory, dbPath, env, marker,
      clients, ownedIdentities, ownedWorkspaces, proof: {}, beforeFinallyProof: [],
      registered() {
        const locks = path.join(directory, 'locks')
        return readdirSync(locks).filter(name => name === 'promotion' || name.startsWith('.promotion-closed-'))
          .flatMap(name => {
            const location = path.join(locks, name)
            return readdirSync(location).filter(file => /^[a-f0-9-]{36}-(supervisor|executor)/.test(file))
              .map(file => ({ ...JSON.parse(readFileSync(path.join(location, file))), role: file.slice(37, -5) }))
          })
      },
      slot(row) {
        const reserved = path.join(directory, 'locks/promotion/reservation.json')
        const closed = path.join(directory, 'locks', `.promotion-closed-${row.host_slot_token}`, 'reservation.json')
        const file = existsSync(reserved) ? reserved : closed
        assert.ok(existsSync(file), 'exact slot evidence must exist')
        const receipt = JSON.parse(readFileSync(file))
        assert.equal(receipt.token, row.host_slot_token)
        assert.equal(receipt.operationId, row.id)
        assert.equal(receipt.dbIdentity, dbPath)
        return file === reserved ? 'reserved' : 'closed'
      },
      plan(value) {
        const control = path.join(directory, 'fault-plan.json')
        writeFixtureJson(control, { ...publicationRecords, ...value })
        env.NODE_OPTIONS = `--import=${hook}`
        env.EQB_PROMOTION_FAULT_STAGE = 'plan'
        env.EQB_PROMOTION_FAULT_CONTROL = control
        env.EQB_PROMOTION_FAULT_MARKER = marker
      },
      rows: () => query(dbPath, 'SELECT * FROM import_review_promotion_operations ORDER BY created_at'),
      promotions: () => query(dbPath, 'SELECT * FROM import_review_promotions'),
      async client({ faults = true } = {}) {
        const childEnv = { ...env }
        if (!faults) {
          delete childEnv.NODE_OPTIONS; delete childEnv.EQB_PROMOTION_FAULT_STAGE
          delete childEnv.EQB_PROMOTION_FAULT_ACTION
          delete childEnv.EQB_PROMOTION_FAULT_CONTROL
        }
        const client = api(childEnv); clients.push(client)
        client.identity = await reviewProcessIdentity(client.child.pid)
        assert.ok(client.identity)
        const opened = await client.opened
        assert.ok(!opened.exited, opened.stderr); client.port = opened.port
        return client
      },
      checkpoint: (stage, pendingCall, options) => waitCheckpoint(marker, label, stage, pendingCall, options),
      async deadSupervisor(row) {
        const identity = { bootId: row.owner_boot_id, pid: row.supervisor_pid, startId: row.supervisor_start_id }
        await until(async () => await matchingReviewProcess(identity) === 'dead', 'exact supervisor death')
        assert.deepEqual(await reviewProcessGroupMembers(identity.pid), [])
      },
      async deadWorker(row) {
        assert.ok(row.worker_pid && row.worker_start_id && row.process_group_id)
        assert.equal(await matchingReviewProcess({ bootId: row.owner_boot_id,
          pid: row.worker_pid, startId: row.worker_start_id }), 'dead', 'supervisor returned with its exact worker alive')
        assert.deepEqual(await reviewProcessGroupMembers(row.process_group_id), [], 'supervisor returned with native descendants alive')
      },
    }
    try {
      // Record instrumentation is appended without replacing any selected fault.
      context.plan(stage ? { [stage]: action } : {})
      await body(context)
      // Acceptance evidence precedes cleanup. Include inspect roles retained in
      // slot metadata, not only the original two identities in the operation row.
      {
        for (const client of clients) await client.stop()
        const identities = [...clients.map(client => ({ ...client.identity, role: 'api' })),
          ...context.registered(), ...ownedIdentities,
          ...context.rows().flatMap(row => [
            { bootId: row.owner_boot_id, pid: row.supervisor_pid, startId: row.supervisor_start_id, role: 'supervisor' },
            { bootId: row.owner_boot_id, pid: row.worker_pid, startId: row.worker_start_id, role: 'executor' },
          ]).filter(identity => identity.pid)]
        for (const identity of identities) {
          await until(async () => await matchingReviewProcess(identity) === 'dead', `before-finally ${identity.role} death`)
          assert.deepEqual(await reviewProcessGroupMembers(identity.pid), [], `before-finally ${identity.role} group remains`)
          context.beforeFinallyProof.push({ ...identity, state: 'dead', group: 'empty' })
        }
        console.log(`  BEFORE_FINALLY ${JSON.stringify(context.beforeFinallyProof)}`)
      }
      assert.equal(diskStopped, false, 'DISK_STOP_BELOW_10_GB')
      passed = true
      console.log(`PASS ${label}`)
    } catch (error) {
      // Read this trial before cleanup, not the successful seed operation.
      const read = fn => { try { return fn() } catch (failure) { return { readError: failure.code || failure.name } } }
      console.error(`PROMOTION_TRIAL_FAILURE ${JSON.stringify({
        label, directory, elapsedMs: Date.now() - started,
        rows: read(() => context.rows().map(row => {
          const outcome = row.outcome_json ? JSON.parse(row.outcome_json) : {}
          return { id: row.id, state: row.state, promotionId: row.promotion_id,
            workerPid: row.worker_pid, supervisorPid: row.supervisor_pid,
            startedAt: row.started_at, deadlineAt: row.deadline_at,
            reasonCode: outcome.reasonCode, status: outcome.status, failureCode: outcome.failure?.failureCode }
        })),
        promotions: read(() => context.promotions().map(row => ({
          id: row.id, state: row.state, failureCode: row.failure_code,
        }))),
        clients: clients.map(clientDiagnostics),
        stages: read(() => publicationStages
          .flatMap(stage => {
            const file = `${marker}.${stage}`
            if (!existsSync(file)) return []
            const { at, pid } = JSON.parse(readFileSync(file))
            return [{ stage, pid, elapsedMs: at - started }]
          })),
      })}`)
      throw error
    } finally {
      clearInterval(diskMonitor)
      await emergencyCleanup
      // Only this trial's exact recorded process identities/groups are stopped.
      // Never remove a DB/evidence directory while an owned writer is alive.
      let rows = []
      try { rows = context.rows() } catch {}
      for (const client of clients) {
        if (client.identity) await stopExact(client.identity)
        else if (client.child.exitCode === null && !client.child.signalCode) client.child.kill('SIGKILL')
      }
      for (const client of clients) {
        await until(() => client.child.exitCode !== null || client.child.signalCode, 'owned API exit before fixture cleanup')
      }
      for (const identity of ownedIdentities) {
        await stopExact(identity)
      }
      for (const identity of context.registered()) await stopExact(identity)
      for (const row of rows) {
        for (const [pid, startId] of [[row.supervisor_pid, row.supervisor_start_id], [row.worker_pid, row.worker_start_id]]) {
          if (!pid) continue
          const identity = { bootId: row.owner_boot_id, pid, startId }
          await stopExact(identity)
        }
      }
      const evidence = { label, passed, diskStopped, directory, rows: context.rows(),
        promotions: context.promotions(), proof: context.proof, beforeFinallyProof: context.beforeFinallyProof,
        checkpoints: readdirSync(directory).filter(name => name.startsWith('checkpoint.json') && !name.endsWith('.release'))
          .map(name => ({ name, ...JSON.parse(readFileSync(path.join(directory, name))) })), cleanupProof }
      if (outputRoot) writeFileSync(path.join(outputRoot, `${path.basename(directory)}.evidence.json`), JSON.stringify(evidence, null, 2))
      console.log(`CLEANUP ${JSON.stringify({ label, exactProcesses: cleanupProof, diskStopped })}`)
      if (passed) {
        for (const workspace of ownedWorkspaces) rmSync(workspace, { recursive: true, force: true })
        rmSync(directory, { recursive: true, force: true })
      }
      else console.error(`Retained failed promotion fixture: ${directory}`)
    }
  }
  const shipMessage = { type: 'start', mode: 'ship', paperId: ship.paperId, input: { ...ship, intent: 'ship' } }
  const retryMessage = { ...shipMessage, mode: 'retry_ship', input: { ...ship, intent: 'retry_ship' } }
  const ownerMessage = { type: 'start', mode: 'owner_publish', paperId: owner.paperId, input: owner }
  await trial('v4 A pre-begin rejection survives API death before ACK and restart frees exact old slot',
    null, null, async t => {
      t.plan({ 'executor-before-begin': 'throw', 'api-before-ack': 'gate', 'supervisor-after-outcome': 'gate' })
      const a = await t.client()
      const running = a.call(shipMessage)
      const checkpoint = await t.checkpoint('api-before-ack', running, { flow: 'control', transport: 'ipc' })
      await t.checkpoint('supervisor-after-outcome', running, { flow: 'control', transport: 'ipc' })
      const original = t.rows()[0]
      assert.equal(checkpoint.pid, a.child.pid)
      assert.equal(original.state, 'rejected')
      assert.equal(original.promotion_id, null)
      assert.equal(JSON.parse(original.outcome_json).reasonCode, 'FIXTURE_REPAIRABLE')
      assert.ok(existsSync(path.join(t.directory, 'locks/promotion/reservation.json')))
      await t.deadWorker(original)
      assert.equal(await matchingReviewProcess(a.identity), 'live')
      a.child.kill('SIGKILL')
      assert.equal((await running).type, 'exited')
      const supervisor = { bootId: original.owner_boot_id, pid: original.supervisor_pid, startId: original.supervisor_start_id }
      assert.equal(await matchingReviewProcess(supervisor), 'live')
      await killReviewProcessTree({ pid: supervisor.pid })
      await t.deadSupervisor(original)
      assert.equal(t.rows()[0].outcome_json, original.outcome_json)
      const b = await t.client({ faults: false })
      const reconciliation = await b.call({ type: 'reconcile' })
      assert.equal(reconciliation.result?.rejected, original.id, JSON.stringify(reconciliation))
      assert.equal(t.rows()[0].state, 'rejected')
      assert.equal(t.rows()[0].outcome_json, original.outcome_json)
      assert.equal(t.promotions().length, 0)
      assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 0)
      assert.equal(existsSync(path.join(t.directory, 'locks/promotion')), false)
      const published = await b.call(ownerMessage)
      assert.equal(published.result?.status, 'published', JSON.stringify(published))
      assert.notEqual(published.result.operationId, original.id)
      await t.deadWorker(t.rows().find(row => row.id === published.result.operationId))
      console.log(`  checkpoint=api-before-ack operation=${original.id} reason=FIXTURE_REPAIRABLE rejected receipt unchanged; exact supervisor/worker dead; old slot closed; other operation=${published.result.operationId} published`)
    })
  await trial('v4 B explicit Owner resubmission repairs unlinked rejection and retains old audit',
    null, null, async t => {
      t.plan({ 'executor-before-begin': 'throw' })
      const a = await t.client()
      const rejected = await a.call(ownerMessage)
      assert.equal(rejected.code, 'FIXTURE_REPAIRABLE', JSON.stringify(rejected))
      const original = t.rows()[0]
      assert.equal(original.state, 'rejected')
      assert.equal(original.promotion_id, null)
      assert.equal(t.promotions().length, 0)
      assert.equal(existsSync(path.join(t.directory, 'locks/promotion')), false)
      await t.deadWorker(original)
      await t.deadSupervisor(original)
      t.plan({})
      const repaired = await a.call(ownerMessage)
      assert.equal(repaired.result?.status, 'published', JSON.stringify(repaired))
      assert.notEqual(repaired.result.operationId, original.id)
      const old = t.rows().find(row => row.id === original.id)
      assert.deepEqual(old, original)
      assert.equal(t.rows().length, 2)
      assert.equal(t.promotions().length, 1)
      assert.equal(t.promotions()[0].state, 'published')
      assert.equal(repaired.result.promotion.assetVersion, 1)
      assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 1)
      assert.equal(existsSync(path.join(t.directory, 'locks/promotion')), false)
      await t.deadWorker(t.rows().find(row => row.id === repaired.result.operationId))
      console.log(`  checkpoint=executor-before-begin reason=FIXTURE_REPAIRABLE owner old=${original.id} rejected unchanged; new=${repaired.result.operationId} completed; promotion/v1=1 slot closed`)
    })
  await trial('v4 C HTTP timeout callback after ACK preserves terminal receipt before supervisor slot close',
    null, null, async t => {
      t.plan({ 'api-after-ack': 'http-timeout', 'supervisor-ack-before-recheck': 'gate' })
      const a = await t.client()
      const listening = await a.call({ type: 'http-listen' })
      assert.ok(listening.result?.port, JSON.stringify(listening))
      const request = () => fetch(`http://127.0.0.1:${listening.result.port}/promotion`, {
        method: 'POST', body: JSON.stringify(shipMessage), signal: AbortSignal.timeout(60_000),
      }).then(async response => ({ status: response.status, body: await response.json() }))
      const running = request()
      running.catch(() => {})
      // The intentional HTTP409/UNKNOWN is released only AFTER both markers.
      // A reply/rejection before either marker is an unexpected early terminal.
      const ack = await t.checkpoint('supervisor-ack-before-recheck', running, { flow: 'publication', transport: 'http' })
      const apiAck = await t.checkpoint('api-after-ack', running, { flow: 'publication', transport: 'http' })
      const original = t.rows()[0]
      assert.equal(ack.pid, original.supervisor_pid)
      assert.equal(apiAck.pid, a.child.pid)
      assert.equal(original.state, 'completed')
      assert.ok(existsSync(path.join(t.directory, 'locks/promotion/reservation.json')))
      await t.deadWorker(original)
      writeFileSync(`${t.marker}.http-timeout.release`, '')
      const response = await running
      assert.equal(response.status, 409)
      assert.equal(response.body.code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      assert.equal(response.body.operationId, original.id)
      assert.equal(t.rows()[0].state, 'completed', 'real HTTP timeout callback must not demote the ACKed receipt')
      assert.equal(t.rows()[0].outcome_json, original.outcome_json)
      assert.ok(existsSync(path.join(t.directory, 'locks/promotion/reservation.json')), 'supervisor gate still holds the slot')
      writeFileSync(`${t.marker}.release`, '')
      await t.deadSupervisor(original)
      assert.equal(existsSync(path.join(t.directory, 'locks/promotion')), false)
      assert.equal(t.rows()[0].state, 'completed')
      assert.equal(t.rows()[0].outcome_json, original.outcome_json)
      const replay = await request()
      assert.equal(replay.status, 201, JSON.stringify(replay))
      assert.equal(replay.body.result.operationId, original.id)
      assert.equal(t.rows().length, 1)
      assert.equal(t.promotions().length, 1)
      assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 1)
      console.log(`  checkpoint=supervisor-ack-before-recheck+api-after-ack callback=HTTP_WAIT_TIMEOUT HTTP=409/UNKNOWN operation=${original.id} stays completed while reserved; supervisor released slot; replay same operation; promotion/v1=1`)
    })
  async function missedOutcome(t, nextGate) {
    t.plan({ 'api-after-go': 'http-timeout', 'supervisor-before-outcome': 'gate' })
    const a = await t.client()
    assert.equal((await a.call({ type: 'cache-prime' })).result?.primed, true)
    const listening = await a.call({ type: 'http-listen' })
    assert.ok(listening.result?.port, JSON.stringify(listening))
    const request = () => fetch(`http://127.0.0.1:${listening.result.port}/promotion`, {
      method: 'POST', body: JSON.stringify(shipMessage), signal: AbortSignal.timeout(60_000),
    }).then(async response => ({ status: response.status, body: await response.json() }))
    const running = request()
    running.catch(() => {})
    const afterGo = await t.checkpoint('api-after-go', running, { flow: 'control', transport: 'http' })
    const beforeOutcome = await t.checkpoint('supervisor-before-outcome', running, { flow: 'publication', transport: 'http' })
    const original = t.rows()[0]
    assert.equal(afterGo.pid, a.child.pid)
    assert.equal(afterGo.phase, 'running')
    assert.equal(afterGo.result, null)
    assert.equal(beforeOutcome.pid, original.supervisor_pid)
    assert.equal(original.state, 'completed')
    assert.equal(t.promotions()[0].state, 'published')
    assert.equal(t.slot(original), 'reserved')
    await t.deadWorker(original)
    t.proof.missedOutcome = { afterGo, beforeOutcome, originalOperation: original.id,
      oldExecutorGroupDeadBeforeARelease: true }
    // Kill only this SUP. Its executor and native group are already proven dead.
    process.kill(original.supervisor_pid, 'SIGKILL')
    // Let Node reap the killed direct child, but pause the real late callback
    // before it reads/writes anything. A still has running/null and no outcome.
    // This avoids mistaking a zombie (held by the after-GO gate) for a live SUP.
    const observations = { 'api-unknown-callback': 'record', 'api-received-outcome': 'record',
      'unknown-write-lock-acquired': 'record' }
    t.plan({ ...observations, 'api-unknown-callback': 'callback-gate' })
    writeFileSync(`${t.marker}.http-timeout.release`, '')
    const callbackGate = await t.checkpoint('api-unknown-callback', running, { flow: 'control', transport: 'http' })
    assert.equal(callbackGate.pid, a.child.pid)
    assert.equal(callbackGate.phase, 'running')
    assert.equal(callbackGate.result, null)
    assert.equal(callbackGate.settled, false)
    t.proof.missedOutcome.callbackGateBeforeStateAccess = callbackGate
    try { await t.deadSupervisor(original) }
    catch (error) {
      // A synchronous JS gate also prevents Node from reaping its direct SUP.
      // Preserve that environment gap rather than treating a zombie as an
      // exact dead identity or allowing A to consume IPC just to make B pass.
      const identity = { bootId: original.owner_boot_id, pid: original.supervisor_pid, startId: original.supervisor_start_id }
      t.plan({})
      const observer = await t.client({ faults: false })
      t.proof.setupGap = {
        code: 'SYNC_API_GATE_PREVENTS_SUPERVISOR_REAP',
        exactSupervisorState: await matchingReviewProcess(identity),
        activeSupervisorGroup: await reviewProcessGroupMembers(original.supervisor_pid),
        ps: spawnSync('ps', ['-o', 'pid,ppid,pgid,stat,etime,command', '-p', `${a.child.pid},${original.supervisor_pid}`],
          { encoding: 'utf8' }).stdout,
        independentReconcile: await observer.call({ type: 'reconcile' }),
        state: t.rows()[0].state, slot: t.slot(original),
        promotions: t.promotions().length,
        versions: query(t.env.QUESTION_BANK_DB, 'SELECT asset_version FROM paper_asset_versions'),
      }
      console.error(`SETUP_GAP ${JSON.stringify(t.proof.setupGap)}`)
      throw error
    }
    assert.equal(await matchingReviewProcess(a.identity), 'live')
    t.plan({ ...observations, ...(nextGate ? { [nextGate]: 'gate' } : {}) })
    const b = await t.client()
    assert.equal((await b.call({ type: 'cache-prime' })).result?.primed, true)
    t.proof.missedOutcome.oldSupervisorDeadBeforeARelease = true
    return { a, b, original, running, request, observations }
  }
  function onlyV1(t, original) {
    assert.equal(t.rows().length, 1)
    assert.equal(t.rows()[0].id, original.id)
    assert.equal(t.rows()[0].state, 'completed')
    assert.equal(t.slot(original), 'closed')
    assert.equal(t.promotions().length, 1)
    assert.equal(t.promotions()[0].state, 'published')
    assert.equal(t.promotions()[0].id, original.promotion_id)
    const versions = query(t.env.QUESTION_BANK_DB, 'SELECT * FROM paper_asset_versions')
    assert.equal(versions.length, 1)
    assert.equal(versions[0].asset_version, 1)
    t.proof.final = { operationId: original.id, state: 'completed', slot: 'exact-closed',
      promotions: 1, assetVersions: 1, version: 1 }
  }
  function missedCallback(t, a) {
    const file = `${t.marker}.${a.child.pid}.api-unknown-callback`
    assert.ok(existsSync(file), 'A must execute its real late transport/timeout callback')
    const callback = JSON.parse(readFileSync(file))
    assert.equal(callback.phase, 'running', 'this must not exercise the phase ACK guard')
    assert.equal(callback.result, null, 'A must never have received an outcome')
    assert.equal(callback.settled, false)
    assert.equal(existsSync(`${t.marker}.${a.child.pid}.api-received-outcome`), false)
    t.proof.lateCallback = callback
  }
  async function cacheProof(t, client, expectedInvalidations = 1) {
    const response = await client.call({ type: 'cache-consume' })
    assert.equal(response.type, 'result', JSON.stringify(response))
    const proof = response.result
    assert.deepEqual(proof.invalidations, { similar: expectedInvalidations,
      facets: expectedInvalidations, availability: expectedInvalidations })
    for (const key of ['similar', 'facets', 'availability']) {
      assert.equal(proof.refreshed[key], true, `${key} consumer retained its primed cache`)
      assert.ok(proof.sizes[key] > 0, `${key} consumer must observe published data`)
    }
    t.proof[`cache-${client.child.pid}`] = proof
  }
  await trial('v8 D missed outcome late running callback preserves independently completed and closed receipt',
    null, null, async t => {
      const { a, b, original, running, request } = await missedOutcome(t)
      const reconciled = await b.call({ type: 'reconcile' })
      assert.equal(reconciled.result?.completed, original.id, JSON.stringify(reconciled))
      onlyV1(t, original)
      const recoveredOutcome = t.rows()[0].outcome_json
      const recovered = JSON.parse(recoveredOutcome)
      const requiredFields = ['schemaVersion', 'promotionId', 'paperId', 'revisionId', 'approvalId',
        'sourceDigest', 'candidateDigest', 'visibleStructureDigest', 'analysisDigest', 'bundleDigest',
        'guardId', 'state', 'assetVersion', 'versionName', 'canonicalPublicationDigest', 'analysisPublicationDigest']
      for (const field of requiredFields) {
        assert.ok(Object.hasOwn(recovered.promotion, field), `persisted receipt missing ${field}`)
        assert.notEqual(recovered.promotion[field], undefined, `persisted receipt undefined ${field}`)
        assert.notEqual(recovered.promotion[field], null, `persisted receipt null ${field}`)
        assert.notEqual(recovered.promotion[field], '', `persisted receipt empty ${field}`)
      }
      // Independent inspection refreshes only these publication timestamps.
      // Compare every other field, including any additional stable receipt fields.
      const stablePromotion = promotion => Object.fromEntries(Object.entries(promotion)
        .filter(([key]) => !['publishedAt', 'updatedAt'].includes(key)))
      const expectedPromotion = stablePromotion(recovered.promotion)
      t.proof.stableReceipt = { excludedDynamicFields: ['publishedAt', 'updatedAt'],
        requiredFields, persisted: expectedPromotion }
      writeFileSync(`${t.marker}.callback.release`, '')
      const response = await running
      assert.equal(response.status, 201, JSON.stringify(response))
      assert.equal(response.body.result.operationId, original.id)
      assert.equal(response.body.result.status, recovered.status,
        'late A must return the exact independently verified success outcome')
      assert.deepEqual(stablePromotion(response.body.result.promotion), expectedPromotion,
        'first HTTP success must carry the independently persisted stable receipt')
      t.proof.stableReceipt.firstHttp = stablePromotion(response.body.result.promotion)
      missedCallback(t, a)
      assert.equal(t.rows()[0].outcome_json, recoveredOutcome)
      await cacheProof(t, a)
      await cacheProof(t, b)
      const replay = await request()
      assert.equal(replay.status, 201, JSON.stringify(replay))
      assert.equal(replay.body.result.operationId, original.id)
      assert.equal(replay.body.result.status, recovered.status)
      assert.deepEqual(stablePromotion(replay.body.result.promotion), expectedPromotion,
        'HTTP replay must carry the independently persisted stable receipt')
      t.proof.stableReceipt.replay = stablePromotion(replay.body.result.promotion)
      onlyV1(t, original)
      console.log(`  D phase=running result=null missed-outcome HTTP=201 same=${original.id} completed+exact-closed promotion/v1=1; all three real cache consumers refreshed in A+B`)
    })
  await trial('v8 E acknowledge writer lock prevents late unknown from demoting terminal before slot close',
    null, null, async t => {
      const { a, b, original, running, request } = await missedOutcome(t, 'ack-locked-before-release')
      const inspecting = b.call({ type: 'reconcile' })
      const locked = await t.checkpoint('ack-locked-before-release', inspecting, { flow: 'recovery', transport: 'reconcile' })
      assert.notEqual(locked.pid, original.supervisor_pid)
      assert.ok(t.registered().some(record => record.pid === locked.pid && record.role.startsWith('supervisor-inspect-')))
      assert.equal(t.rows()[0].state, 'completed')
      const recoveredOutcome = t.rows()[0].outcome_json
      assert.equal(t.slot(original), 'reserved')
      writeFileSync(`${t.marker}.callback.release`, '')
      const response = await running
      assert.equal(response.status, 409, JSON.stringify(response))
      assert.equal(response.body.code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      assert.equal(response.body.operationId, original.id)
      missedCallback(t, a)
      assert.equal(existsSync(`${t.marker}.${a.child.pid}.unknown-write-lock-acquired`), false,
        'zero-busy API must fail to acquire the acknowledgement writer lock')
      assert.equal(t.rows()[0].state, 'completed', 'ack lock must prevent a late API unknown write')
      assert.equal(t.rows()[0].outcome_json, recoveredOutcome)
      assert.equal(t.slot(original), 'reserved')
      t.proof.lockFirst = { locked, lateHttp: response, zeroBusyWriteRefused: true, stateWhileLocked: 'completed', slotWhileLocked: 'reserved' }
      writeFileSync(`${t.marker}.release`, '')
      assert.equal((await inspecting).result?.completed, original.id)
      onlyV1(t, original)
      const replay = await request()
      assert.equal(replay.status, 201, JSON.stringify(replay))
      assert.equal(replay.body.result.operationId, original.id)
      await cacheProof(t, a)
      await cacheProof(t, b)
      onlyV1(t, original)
      console.log(`  E ack writer first; A running/null late HTTP=409 UNKNOWN zero-busy write refused; completed+reserved unchanged until release; completed+exact-closed replay=${original.id} promotion/v1=1`)
    })
  await trial('v8 F unknown writer first prevents stale acknowledge close until fresh read-only inspection',
    null, null, async t => {
      const { a, b, original, running, request, observations } = await missedOutcome(t, 'supervisor-ack-before-recheck')
      const inspecting = b.call({ type: 'reconcile' })
      const beforeAck = await t.checkpoint('supervisor-ack-before-recheck', inspecting, { flow: 'recovery', transport: 'reconcile' })
      assert.notEqual(beforeAck.pid, original.supervisor_pid)
      assert.equal(t.rows()[0].state, 'completed')
      assert.equal(t.slot(original), 'reserved')
      writeFileSync(`${t.marker}.callback.release`, '')
      const response = await running
      assert.equal(response.status, 409, JSON.stringify(response))
      assert.equal(response.body.code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      assert.equal(response.body.operationId, original.id)
      missedCallback(t, a)
      assert.ok(existsSync(`${t.marker}.${a.child.pid}.unknown-write-lock-acquired`))
      assert.equal(t.rows()[0].state, 'unknown')
      assert.equal(t.slot(original), 'reserved')
      t.proof.unknownFirst = { beforeAck, lateHttp: response, realUnknownWrite: true, state: 'unknown', slot: 'reserved' }
      writeFileSync(`${t.marker}.release`, '')
      const staleInspection = await inspecting
      assert.equal(staleInspection.result?.completed, undefined, JSON.stringify(staleInspection))
      assert.equal(t.rows()[0].state, 'unknown')
      assert.equal(t.slot(original), 'reserved', 'stale ACK must never produce unknown+closed')
      for (const identity of t.registered()) {
        await until(async () => await matchingReviewProcess(identity) === 'dead', 'first inspection exact death before fresh inspection')
        assert.deepEqual(await reviewProcessGroupMembers(identity.pid), [])
      }
      t.plan(observations)
      const recovered = await b.call({ type: 'reconcile' })
      assert.equal(recovered.result?.completed, original.id, JSON.stringify(recovered))
      onlyV1(t, original)
      const replay = await request()
      assert.equal(replay.status, 201, JSON.stringify(replay))
      assert.equal(replay.body.result.operationId, original.id)
      await cacheProof(t, a)
      await cacheProof(t, b)
      onlyV1(t, original)
      console.log(`  F A real unknown writer first; UNKNOWN+reserved survives stale ACK; fresh inspect restores completed+exact-closed same=${original.id} promotion/v1=1`)
    })
  await trial('real server API remains responsive under prepared Review write lock and returns retryable conflict',
    'guard-write-lock', 'lock-pause', async t => {
      const delayFile = path.join(t.directory, 'api-delay.json')
      const child = spawn(process.execPath, ['--import', new URL('./api-delay.mjs', import.meta.url).pathname,
        new URL('../../server/api.mjs', import.meta.url).pathname], {
        cwd: new URL('../../', import.meta.url).pathname,
        env: { ...t.env, USER_DATA_DB: path.join(t.directory, 'users.sqlite'),
          QUESTION_BANK_USER_SPACE_ROOT: path.join(t.directory, 'user-files'),
          QUESTION_BANK_API_PORT: '0', QUESTION_BANK_IMPORT_OPS_SHIP_TOKEN: 'synthetic-http-ship-token',
          EQB_REVIEW_COMPATIBILITY_AUTORUN: '0', EQB_REVIEW_SUBJECT_BACKFILL: '0',
          EQB_PROMOTION_API_DELAY: delayFile },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      })
      const identity = await reviewProcessIdentity(child.pid)
      assert.ok(identity)
      t.clients.push({ child, identity, async stop() {
        if (await matchingReviewProcess(identity) === 'live') child.kill('SIGTERM')
        await until(() => child.exitCode !== null || child.signalCode, 'real API stopped')
      } })
      let output = ''
      const collect = bytes => {
        output = (output + bytes).slice(-32_768)
        writeFileSync(path.join(t.directory, 'real-api.log'), output)
      }
      child.stdout.on('data', collect); child.stderr.on('data', collect)
      // The API logs the requested port, so obtain the bound ephemeral address
      // through a test-only preload IPC message rather than guessing a port.
      const addressFile = path.join(t.directory, 'api-address.json')
      // The preload below observes listen without replacing any request logic.
      // Its output path is inherited only by this isolated API.
      await until(() => existsSync(addressFile) || child.exitCode !== null, 'real API listen')
      assert.equal(child.exitCode, null, output)
      const origin = `http://127.0.0.1:${JSON.parse(readFileSync(addressFile)).port}`
      const headers = { 'content-type': 'application/json', authorization: 'Bearer synthetic-http-ship-token' }
      const requests = t.proof.httpRequests = []
      const request = async (endpoint, options = {}, clientTimeoutMs = 8000) => {
        const started = performance.now()
        const record = { endpoint, method: options.method || 'GET', clientTimeoutMs,
          at: new Date().toISOString(), phase: 'fetch' }
        requests.push(record)
        const save = () => writeFileSync(path.join(t.directory, 'http-requests.json'), JSON.stringify(requests))
        save()
        try {
          const response = await fetch(`${origin}${endpoint}`, { ...options, signal: AbortSignal.timeout(clientTimeoutMs) })
          Object.assign(record, { status: response.status, fetchMs: performance.now() - started, phase: 'body' })
          save()
          const body = await response.json()
          Object.assign(record, { phase: 'complete', ms: performance.now() - started, endedAt: new Date().toISOString() })
          save()
          return { status: response.status, body, ms: record.ms }
        } catch (error) {
          Object.assign(record, { failedPhase: record.phase, phase: 'error', error: `${error.name}: ${error.message}`,
            ms: performance.now() - started, endedAt: new Date().toISOString() })
          save()
          throw error
        }
      }
      const health = await request('/api/health')
      assert.equal(health.status, 200, output)
      assert.equal(health.body.dbPath, t.env.QUESTION_BANK_DB)
      assert.equal((await request('/api/question-groups?limit=1')).status, 200)
      writeFileSync(`${delayFile}.reset`, '')
      await until(() => existsSync(delayFile) && JSON.parse(readFileSync(delayFile)).reset, 'API loop monitor reset')
      const publishing = request(`/api/import-agent-reviews/papers/${ship.paperId}/promotions`,
        // Publication includes executor startup and real rendering before the
        // write-lock checkpoint. Only this completion wait uses the IPC client
        // budget; responsiveness probes retain their 8s abort and 1200ms limit.
        { method: 'POST', headers, body: JSON.stringify({ ...ship, intent: 'ship' }) }, 60_000)
      publishing.catch(() => {}) // The awaited assertion below still observes rejection.
      const checkpoint = await t.checkpoint('guard-write-lock', publishing, { flow: 'publication', transport: 'http' })
      assert.equal(checkpoint.stage, 'guard-write-lock')
      assert.notEqual(checkpoint.pid, child.pid)
      const samples = []
      t.proof.httpSamples = samples
      for (let round = 0; round < 5; round++) {
        const roundSamples = await Promise.all([
          request('/api/health'),
          request('/api/question-groups?limit=1'),
          request(`/api/import-agent-reviews/papers/${ship.paperId}/shipping-guards`,
            { method: 'POST', headers, body: JSON.stringify({ ...ship, approvalId: 'invalid-conflict-probe' }) }),
        ])
        samples.push(roundSamples)
        for (const [index, sample] of roundSamples.entries()) {
          assert.equal(sample.status, index === 2 ? 409 : 200, JSON.stringify(sample))
          if (index === 2) assert.equal(sample.body.retryable, true, JSON.stringify(sample.body))
          assert.ok(sample.ms < 1200, `HTTP probe blocked: ${JSON.stringify(sample)}`)
        }
        await yieldFor(100)
      }
      const published = await publishing
      assert.equal(published.status, 201, JSON.stringify(published))
      assert.equal(published.body.status, 'published')
      await yieldFor(100)
      const delay = JSON.parse(readFileSync(delayFile))
      t.proof.httpResult = { delay, published }
      assert.equal(delay.pid, child.pid)
      assert.ok(delay.maxMs < 1200, JSON.stringify(delay))
      writeFileSync(path.join(t.directory, 'http-probes.json'), JSON.stringify({ samples, delay, published }))
      await t.deadWorker(t.rows()[0])
      console.log(`  real API probe max=${Math.max(...samples.flat().map(row => row.ms)).toFixed(1)}ms loop max=${delay.maxMs.toFixed(1)}ms`)
    })
  await trial('live reserved launch survives both API reconciliations and stale reject CAS cannot overwrite linked running audit',
    null, null, async t => {
      t.plan({ 'live-reserve-before-fork': 'gate' })
      const a = await t.client(), b = await t.client({ faults: false })
      const running = a.call(shipMessage)
      await t.checkpoint('live-reserve-before-fork', running, { flow: 'control', transport: 'ipc' })
      const snapshot = t.rows()[0]
      assert.equal(snapshot.state, 'reserved')
      assert.equal(snapshot.supervisor_pid, null)
      for (const client of [b, a, b, a]) {
        assert.deepEqual((await client.call({ type: 'reconcile' })).result.pending, [snapshot.id])
        assert.equal(t.rows()[0].state, 'reserved')
        assert.ok(existsSync(path.join(t.directory, 'locks/promotion/reservation.json')))
      }
      writeFileSync(`${t.marker}.release`, '')
      const result = await running
      assert.equal(result.result?.status, 'published', JSON.stringify(result))
      assert.equal(t.rows().length, 1)
      assert.equal(t.promotions().length, 1)
      await t.deadWorker(t.rows()[0])
      const auditPath = path.join(t.directory, 'cas-audit.sqlite')
      copyFileSync(t.dbPath, auditPath)
      const db = new DatabaseSync(auditPath)
      try { db.prepare("UPDATE import_review_promotion_operations SET state='running' WHERE id=?").run(snapshot.id) }
      finally { db.close() }
      const audit = createPromotionOperationStore({ dbPath: auditPath })
      const before = audit.get(snapshot.id)
      assert.ok(before.promotion_id)
      assert.equal(audit.rejectUnbegun(snapshot), false)
      assert.deepEqual(audit.get(snapshot.id), before)
      const mutateAudit = sql => {
        const db = new DatabaseSync(auditPath)
        try { db.exec(sql) } finally { db.close() }
      }
      // Each snapshot predates a real launch transition. Recovery must not
      // erase registration or claim merely because begin has not linked yet.
      mutateAudit("UPDATE import_review_promotion_operations SET state='reserved',promotion_id=NULL,started_at=NULL")
      const registered = audit.get(snapshot.id)
      assert.equal(audit.rejectUnbegun(snapshot), false)
      assert.deepEqual(audit.get(snapshot.id), registered)
      mutateAudit("UPDATE import_review_promotion_operations SET started_at='2026-10-21T00:00:00.000Z'")
      const claimed = audit.get(snapshot.id)
      assert.equal(audit.rejectUnbegun(registered), false)
      assert.deepEqual(audit.get(snapshot.id), claimed)
    })
  await trial('compatibility child survives API SIGKILL and blocks promotion until exact old tree is dead',
    'compatibility-input', 'block', async t => {
      const a = await t.client()
      const running = a.call({ type: 'compatibility' })
      const checkpoint = await t.checkpoint('compatibility-input', running, { flow: 'control', transport: 'ipc' })
      const identity = await reviewProcessIdentity(checkpoint.pid)
      assert.ok(identity)
      t.ownedIdentities.push(identity)
      assert.equal(path.dirname(checkpoint.workspace), tmpdir())
      assert.ok(path.basename(checkpoint.workspace).startsWith('eqb-review-job-'))
      t.ownedWorkspaces.push(checkpoint.workspace)
      assert.equal(await matchingReviewProcess(identity), 'live')
      a.child.kill('SIGKILL')
      await until(() => a.child.signalCode, 'compatibility API killed')
      const b = await t.client({ faults: false })
      const busy = await b.call(shipMessage)
      assert.equal(busy.code, 'IMPORT_REVIEW_PROMOTION_BUSY', JSON.stringify(busy))
      assert.equal(await matchingReviewProcess(identity), 'live', 'promotion admission must not kill compatibility work')
      assert.equal(t.rows().length, 0)
      assert.equal(t.promotions().length, 0)
      assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 0)
      // Explicit test cleanup only AFTER proving admission preserved the child.
      await killReviewProcessTree({ pid: identity.pid })
      await until(async () => await matchingReviewProcess(identity) === 'dead', 'exact compatibility child dead')
      assert.deepEqual(await reviewProcessGroupMembers(identity.pid), [])
      await b.call({ type: 'reconcile' })
      const published = await b.call(shipMessage)
      assert.equal(published.result?.status, 'published', JSON.stringify(published))
      await t.deadWorker(t.rows()[0])
    })
  await trial('same lease pending native group blocks another worker until exact old group dies',
    null, null, async t => {
      const a = await t.client({ faults: false })
      const response = await a.call({ type: 'pending-lease' })
      assert.equal(response.type, 'result', JSON.stringify(response))
      const proof = response.result
      assert.equal(proof.oldState, 'dead')
      assert.equal(proof.finishRefused, true)
      assert.ok(proof.nativeGroupBefore > 0)
      assert.ok(proof.nativeGroupAfter > 0)
      assert.equal(proof.busyReason, 'LEADER_BUSY')
      assert.equal(proof.recordsBefore, 1)
      assert.equal(proof.recordsAfter, proof.recordsBefore, 'busy same-lease call must not fork')
      assert.equal(proof.oldGroupDead, true)
      assert.equal(proof.finishAfterDeath, true)
      assert.equal(proof.readmittedReason, 'TARGET_IDENTITY_MISMATCH')
      assert.equal(proof.recordsReadmitted, proof.recordsBefore + 1)
      assert.equal(proof.allOwnedGroupsDead, true)
      assert.equal(proof.leaderReleased, true)
      assert.equal(t.promotions().length, 0)
      assert.equal(t.rows().length, 0)
      console.log(`  pending lease proof=${JSON.stringify(proof)}`)
    })
  await trial('rejected explicit retry can be repaired and resubmitted with same promotion version and audited attempts',
    null, null, async t => {
      t.plan({ 'before-publisher': 'reject-content' })
      const a = await t.client()
      const failed = await a.call({ ...shipMessage, type: 'legacy-start' })
      assert.equal(failed.code, 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED', JSON.stringify(failed))
      const original = t.promotions()[0]
      assert.equal(original.state, 'failed')
      t.plan({ 'executor-before-begin': 'throw' })
      const rejected = await a.call(retryMessage)
      assert.equal(rejected.type, 'error', JSON.stringify(rejected))
      assert.equal(t.rows().at(-1).state, 'rejected')
      const rejectedId = rejected.operationId
      assert.equal(t.promotions()[0].attempt_count, original.attempt_count)
      t.plan({})
      const repaired = await a.call(retryMessage)
      assert.equal(repaired.result?.status, 'published', JSON.stringify(repaired))
      assert.notEqual(repaired.result.operationId, rejectedId)
      assert.equal(repaired.result.promotion.promotionId, original.id)
      assert.equal(repaired.result.promotion.assetVersion, original.asset_version || 1)
      assert.equal(t.promotions().length, 1)
      assert.equal(t.promotions()[0].attempt_count, original.attempt_count + 1)
      assert.equal(t.rows().length, 2)
      assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 1)
      await t.deadWorker(t.rows().at(-1))
    })
  await trial('retry B returns B receipt after reconciling orphan published A and invalidates both caches',
    null, null, async t => {
      t.plan({ 'before-publisher': 'reject-content' })
      const a = await t.client()
      assert.equal((await a.call({ ...shipMessage, type: 'legacy-start' })).code, 'IMPORT_REVIEW_PUBLICATION_CONTENT_REJECTED')
      const failedB = t.promotions()[0]
      t.plan({ 'before-worker-ipc': 'block' })
      const orphan = a.call({ type: 'start', mode: 'owner_publish', paperId: owner.paperId, input: owner })
      await t.checkpoint('before-worker-ipc', orphan, { flow: 'publication', transport: 'ipc' })
      const orphanRow = t.rows().find(row => row.paper_id === owner.paperId)
      process.kill(orphanRow.worker_pid, 'SIGKILL')
      assert.equal((await orphan).code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      assert.equal(t.promotions().find(row => row.paper_id === owner.paperId).state, 'published')
      const b = await t.client({ faults: false })
      const retried = await b.call(retryMessage)
      assert.equal(retried.result?.status, 'published', JSON.stringify(retried))
      assert.equal(retried.result.promotion.paperId, ship.paperId)
      assert.equal(retried.result.promotion.promotionId, failedB.id)
      assert.equal(retried.invalidations, 2)
      assert.equal(t.rows().find(row => row.id === orphanRow.id).state, 'completed')
    })
  await trial('legacy consumed scoped grant replays its exact promotion despite a newer revision promotion',
    null, null, async t => {
      const a = await t.client()
      const message = { type: 'start', mode: 'scoped', paperId: scoped.paperId, input: scoped }
      const consumed = await a.call(message)
      assert.equal(consumed.result?.status, 'published', JSON.stringify(consumed))
      const next = await a.call({ type: 'new-revision', revisionId: consumed.result.promotion.revisionId })
      assert.ok(next.result?.revisionId, JSON.stringify(next))
      assert.notEqual(next.result.revisionId, consumed.result.promotion.revisionId)
      const newer = await a.call({ type: 'start', mode: 'ship', paperId: scoped.paperId, input: { ...next.result, intent: 'ship' } })
      assert.equal(newer.result?.status, 'published', JSON.stringify(newer))
      assert.notEqual(newer.result.promotion.promotionId, consumed.result.promotion.promotionId)
      const db = new DatabaseSync(t.dbPath)
      try { db.prepare('DELETE FROM import_review_promotion_operations WHERE id=?').run(consumed.result.operationId) }
      finally { db.close() }
      const replay = await a.call(message)
      assert.equal(replay.result?.promotion?.promotionId, consumed.result.promotion.promotionId, JSON.stringify(replay))
      assert.equal(replay.result.promotion.revisionId, consumed.result.promotion.revisionId)
      assert.equal(t.promotions().length, 2)
      assert.equal(query(t.dbPath, 'SELECT state FROM import_review_publication_requests WHERE id=?', [scoped.requestId])[0].state, 'consumed')
    })
  await trial('supervisor SIGKILL after durable slot release preserves completed receipt and no unresolved operation',
    'after-slot-release', 'block', async t => {
      const a = await t.client()
      const running = a.call(shipMessage)
      const checkpoint = await t.checkpoint('after-slot-release', running, { flow: 'publication', transport: 'ipc' })
      const row = t.rows()[0]
      assert.equal(checkpoint.pid, row.supervisor_pid)
      assert.equal(row.state, 'completed')
      await t.deadWorker(row)
      process.kill(checkpoint.pid, 'SIGKILL')
      const result = await running
      assert.equal(result.result?.status, 'published', JSON.stringify(result))
      assert.equal(t.rows()[0].state, 'completed')
      assert.equal((await a.call({ type: 'operation' })).result.length, 0)
      assert.equal(existsSync(path.join(t.directory, 'locks/promotion/reservation.json')), false)
    })
  await trial('supervisor SIGKILL after slot release preserves exact rejected receipt',
    'after-slot-release', 'block', async t => {
      t.plan({ 'executor-before-begin': 'throw', 'after-slot-release': 'block' })
      const a = await t.client()
      const running = a.call(shipMessage)
      const checkpoint = await t.checkpoint('after-slot-release', running, { flow: 'control', transport: 'ipc' })
      const row = t.rows()[0]
      assert.equal(checkpoint.pid, row.supervisor_pid)
      assert.equal(row.state, 'rejected')
      assert.equal(JSON.parse(row.outcome_json).reasonCode, 'FIXTURE_REPAIRABLE')
      await t.deadWorker(row)
      process.kill(checkpoint.pid, 'SIGKILL')
      const response = await running
      assert.equal(response.code, 'FIXTURE_REPAIRABLE', JSON.stringify(response))
      assert.equal(t.rows()[0].state, 'rejected')
      assert.equal(t.promotions().length, 0)
      assert.equal((await a.call({ type: 'operation' })).result.length, 0)
      assert.equal(existsSync(path.join(t.directory, 'locks/promotion')), false)
    })
  await trial('explicit retry survives a transient writer conflict after slot handoff',
    'after-archive', 'block', async t => {
      t.plan({ 'after-archive': 'block' })
      const a = await t.client()
      const originalRequest = a.call(shipMessage)
      const checkpoint = await t.checkpoint('after-archive', originalRequest, { flow: 'control', transport: 'ipc' })
      process.kill(checkpoint.pid, 'SIGKILL')
      assert.equal((await originalRequest).code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      const original = t.rows()[0]
      assert.ok(original.promotion_id)
      await t.deadWorker(original)
      t.plan({ 'retry-after-handoff': 'gate' })
      const interruptedRetry = a.call(retryMessage)
      await t.checkpoint('retry-after-handoff', interruptedRetry, { flow: 'control', transport: 'ipc' })
      const writer = new DatabaseSync(t.dbPath)
      try {
        writer.exec('PRAGMA busy_timeout=0;BEGIN IMMEDIATE')
        writeFileSync(`${t.marker}.release`, '')
        assert.equal((await interruptedRetry).code, 'IMPORT_REVIEW_PROMOTION_BUSY')
      } finally { if (writer.isTransaction) writer.exec('ROLLBACK'); writer.close() }
      assert.equal(t.rows().length, 1)
      assert.equal(t.rows()[0].state, 'unknown')
      t.plan({})
      const repaired = await a.call(retryMessage)
      assert.equal(repaired.result?.status, 'published', JSON.stringify(repaired))
      assert.equal(repaired.result.promotion.promotionId, original.promotion_id)
      assert.equal(repaired.result.promotion.assetVersion, 1)
      assert.equal(t.promotions().length, 1)
      assert.equal(t.rows()[0].state, 'rejected')
      assert.equal(JSON.parse(t.rows()[0].outcome_json).nextOperationId, repaired.result.operationId)
      assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 1)
      await t.deadWorker(t.rows().at(-1))
    })
  await trial('cross-process two papers, same request and three entrypoints share one slot; scanner/backfills never overlap',
    'before-archive', 'block', async t => {
      const a = await t.client(), b = await t.client({ faults: false })
      const running = a.call(shipMessage)
      await t.checkpoint('before-archive', running, { flow: 'control', transport: 'ipc' })
      const operationId = t.rows()[0].id
      const duplicate = await b.call(shipMessage)
      assert.equal(duplicate.code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      assert.equal(duplicate.operationId, operationId)
      for (const message of [{ type: 'start', mode: 'owner_publish', paperId: owner.paperId, input: owner },
        { type: 'start', mode: 'scoped', paperId: scoped.paperId, input: scoped }]) {
        const busy = await b.call(message)
        assert.equal(busy.code, 'IMPORT_REVIEW_PROMOTION_BUSY')
        assert.equal(busy.operationId, operationId)
      }
      const competition = (await b.call({ type: 'compete' })).result
      assert.equal(competition.single.comparison.reasonCode, 'LEADER_BUSY')
      for (const kind of ['scan', 'manual', 'automatic']) assert.equal(competition[kind].paused, 'LEADER_BUSY')
      assert.equal(query(t.dbPath, 'SELECT approval_receipt_json FROM import_review_revisions WHERE id=?', [owner.revisionId])[0].approval_receipt_json, null)
      assert.equal(query(t.dbPath, 'SELECT state FROM import_review_publication_requests WHERE id=?', [scoped.requestId])[0].state, 'granted')
      process.kill(t.rows()[0].worker_pid, 'SIGKILL')
      assert.equal((await running).code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN')
      assert.equal(t.promotions().length, 1)
    })
  // Launch/archive controls precede publication. Preparation and durable output
  // checkpoints traverse the real publisher; classify this flow explicitly.
  const killCheckpoints = [
    ...['after-host-slot', 'after-job-before-fork', 'api-before-go', 'supervisor-ready', 'supervisor-before-go',
      'begin-before-commit', 'begin-after-commit', 'before-archive', 'after-archive']
      .map(stage => ({ stage, flow: 'control' })),
    ...['before-on-prepared', 'after-target-binding', 'after-on-prepared', 'after-version-rename', 'after-latest-swap',
      'after-bank-commit', 'before-mark-published', 'after-mark-published', 'before-worker-ipc']
      .map(stage => ({ stage, flow: 'publication' })),
  ]
  // Target binding occurs inside onPrepared, after the same publisher preparation.
  for (const stage of ['before-on-prepared', 'after-target-binding', 'after-on-prepared']) {
    assert.equal(killCheckpoints.find(checkpoint => checkpoint.stage === stage)?.flow, 'publication')
  }
  for (const { stage, flow } of killCheckpoints) {
    await trial(`SIGKILL at ${stage} retains identity and never silently replays`, stage, 'block', async t => {
      const a = await t.client()
      const result = a.call(shipMessage)
      // Record-only markers must never satisfy the requested block checkpoint.
      const checkpoint = await t.checkpoint(stage, result, { flow, transport: 'ipc' })
      if (flow === 'publication') {
        console.log(`PROMOTION_CHECKPOINT_TIMING ${JSON.stringify([...new Set([...publicationStages, stage])]
          .filter(name => existsSync(`${t.marker}.${name}`)).map(name => {
            const { at, pid } = JSON.parse(readFileSync(`${t.marker}.${name}`))
            return { stage: name, at, pid }
          }))}`)
      }
      process.kill(checkpoint.pid, 'SIGKILL')
      const answer = await result
      assert.ok(['error', 'exited'].includes(answer.type))
      const b = await t.client({ faults: false })
      const reconciliation = await b.call({ type: 'reconcile' })
      const rows = t.rows()
      if (stage === 'after-host-slot') {
        assert.equal(rows.length, 0)
        assert.equal(reconciliation.result.blocked, 'FILE_WITHOUT_OPERATION')
      } else {
        assert.equal(rows.length, 1)
        const row = rows[0]
        if (['after-mark-published', 'before-worker-ipc'].includes(stage)) {
          const recovered = reconciliation.result?.completed ? reconciliation : await until(async () => {
            const reply = await b.call({ type: 'reconcile' })
            return reply.result?.completed ? reply : false
          }, 'published receipt reconciliation', checkpointBudgets.recovery)
          assert.equal(recovered.invalidations, 1)
          assert.equal(t.rows()[0].state, 'completed')
        } else if (t.promotions().length) {
          assert.equal(row.state, 'unknown')
          const promotion = t.promotions()[0]
          const retry = await b.call(retryMessage)
          assert.equal(retry.type, 'result', JSON.stringify(retry))
          assert.equal(retry.result.promotion.promotionId, promotion.id)
          assert.equal(retry.result.promotion.assetVersion, promotion.asset_version || 1)
          assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 1)
        } else {
          assert.ok(['reserved', 'unknown', 'rejected'].includes(row.state))
          assert.equal(t.promotions().length, 0)
        }
      }
    })
  }
  for (const action of ['exit', 'forged', 'truncated', 'out-of-order', 'native', 'rss', 'oom']) {
    await trial(`executor ${action} fails closed with bounded supervisor`, 'executor-before-begin', action, async t => {
      const a = await t.client()
      const started = Date.now()
      const running = a.call(shipMessage)
      let checkpoint
      if (action === 'oom') {
        // The heap cap can abort module loading before the injected checkpoint.
        // Both timings must still prove WORKER_OOM and no publication writes.
        await running
        const file = `${t.marker}.executor-before-begin`
        checkpoint = existsSync(file) ? JSON.parse(readFileSync(file)) : null
      } else {
        checkpoint = await t.checkpoint('executor-before-begin', running, { flow: 'control', transport: 'ipc' })
      }
      if (checkpoint) assert.equal(checkpoint.stage, 'executor-before-begin')
      if (action === 'native') {
        await until(() => existsSync(`${t.marker}.native`), 'native child actually blocked')
        const identity = await reviewProcessIdentity(Number(readFileSync(`${t.marker}.native`, 'utf8')))
        assert.ok(identity)
        t.ownedIdentities.push({ ...identity, role: 'native' })
      }
      const response = await running
      assert.equal(response.code, 'IMPORT_REVIEW_PROMOTION_UNKNOWN', JSON.stringify(response))
      const row = t.rows()[0]
      assert.equal(row.state, 'unknown')
      assert.equal(t.promotions().length, 0)
      assert.ok(existsSync(path.join(t.directory, 'locks/promotion/reservation.json')))
      if (checkpoint) assert.equal(checkpoint.pid, row.worker_pid)
      if (action === 'oom') {
        assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM paper_asset_versions')[0].n, 0)
        assert.equal(query(t.env.QUESTION_BANK_DB, 'SELECT COUNT(*) n FROM sources')[0].n, 0)
        assert.deepEqual(readdirSync(t.env.QUESTION_BANK_PAPER_ASSET_ROOT), [])
        assert.ok(Date.now() - started < 40000, 'OOM escaped bounded deadline')
      }
      if (action === 'out-of-order') {
        assert.equal(checkpoint.operationId, row.id)
        assert.equal(checkpoint.nonceHash, row.launch_nonce_hash,
          'out-of-order ready must use the current authenticated launch identity')
        assert.equal(Object.hasOwn(checkpoint, 'nonce'), false, 'checkpoint must never persist raw nonce')
        t.proof.outOfOrderIdentity = { operationId: checkpoint.operationId,
          nonceHash: checkpoint.nonceHash, launchNonceHash: row.launch_nonce_hash, messageType: 'ready' }
      }
      const reason = { exit: 'WORKER_EXIT', forged: 'INVALID_WORKER_IPC', truncated: 'INVALID_WORKER_IPC',
        'out-of-order': 'INVALID_WORKER_IPC', rss: 'WORKER_RSS_LIMIT', native: 'WORKER_TIMEOUT', oom: 'WORKER_OOM' }[action]
      assert.equal(JSON.parse(row.outcome_json).reasonCode, reason)
      if (action === 'native') {
        assert.ok(Date.now() - started >= 25000, 'deadline fired prematurely')
        assert.ok(Date.now() - started < 40000, 'native blocking escaped bounded deadline')
      }
      await t.deadWorker(row)
      t.proof.fault = { action, reason, elapsedMs: Date.now() - started, checkpoint,
        nativePID: action === 'native' ? Number(readFileSync(`${t.marker}.native`, 'utf8')) : null }
      console.log(`  fault=${action} reason=${reason} elapsed=${Date.now() - started}ms exact worker/group dead before cleanup`)
    }, action === 'rss' ? { EQB_PROMOTION_RSS_MB: '700', EQB_PROMOTION_DEADLINE_MS: '30000' }
      : action === 'oom' ? { EQB_PROMOTION_HEAP_MB: '128', EQB_PROMOTION_DEADLINE_MS: '30000' }
        : { EQB_PROMOTION_DEADLINE_MS: '30000' })
  }
  await trial('API SIGKILL after GO leaves supervisor alive; restart independently verifies exact receipt and invalidates caches',
    'before-archive', 'pause', async t => {
      const a = await t.client()
      const running = a.call(shipMessage)
      await t.checkpoint('before-archive', running, { flow: 'control', transport: 'ipc' })
      const row = t.rows()[0]
      a.child.kill('SIGKILL')
      assert.equal(await matchingReviewProcess({ bootId: row.owner_boot_id, pid: row.supervisor_pid, startId: row.supervisor_start_id }), 'live')
      const b = await t.client({ faults: false })
      await until(() => t.promotions()[0]?.state === 'published', 'orphan business completes', checkpointBudgets.publication)
      await until(async () => (await b.call({ type: 'reconcile' })).result?.completed, 'restart receipt reconciled', checkpointBudgets.recovery)
      assert.equal(t.rows()[0].state, 'completed')
      assert.equal(t.promotions().length, 1)
    })
  await trial('Owner double click and scoped consumed replay reuse exact durable operation',
    null, null, async t => {
      const a = await t.client(), b = await t.client()
      const ownerMessage = { type: 'start', mode: 'owner_publish', paperId: owner.paperId, input: owner }
      const published = await a.call(ownerMessage)
      assert.equal(published.result?.status, 'published', JSON.stringify(published))
      const replay = await b.call(ownerMessage)
      assert.equal(replay.result.operationId, published.result.operationId)
      const scopedMessage = { type: 'start', mode: 'scoped', paperId: scoped.paperId, input: scoped }
      const consumed = await a.call(scopedMessage)
      assert.equal(consumed.result?.status, 'published', JSON.stringify(consumed))
      const consumedAgain = await b.call(scopedMessage)
      assert.equal(consumedAgain.result.operationId, consumed.result.operationId)
      assert.equal(t.promotions().length, 2)
    })
  await trial('corrupt host reservation fails closed without a fork or business mutation',
    null, null, async t => {
      mkdirSync(path.join(t.directory, 'locks/promotion'), { mode: 0o700 })
      writeFileSync(path.join(t.directory, 'locks/promotion/reservation.json'), '{', { mode: 0o600 })
      const a = await t.client()
      const reply = await a.call(shipMessage)
      assert.equal(reply.code, 'IMPORT_REVIEW_PROMOTION_BUSY')
      assert.equal(t.rows().length, 0)
      assert.equal(t.promotions().length, 0)
      assert.equal((await a.call({ type: 'reconcile' })).result.blocked, 'AMBIGUOUS_RESERVATION')
    })
  await trial('scoped expiry after admission is rechecked by the child without consuming the grant',
    'executor-before-begin', 'pause', async t => {
      const a = await t.client()
      const response = a.call({ type: 'start', mode: 'scoped', paperId: scoped.paperId, input: scoped })
      await t.checkpoint('executor-before-begin', response, { flow: 'control', transport: 'ipc' })
      const db = new DatabaseSync(t.dbPath)
      try { db.prepare('UPDATE import_review_publication_requests SET expires_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', scoped.requestId) }
      finally { db.close() }
      assert.equal((await response).type, 'error')
      assert.equal(t.promotions().length, 0)
      assert.equal(query(t.dbPath, 'SELECT state FROM import_review_publication_requests WHERE id=?', [scoped.requestId])[0].state, 'granted')
    })
}
