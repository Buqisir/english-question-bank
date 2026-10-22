import { setTimeout as yieldFor } from 'node:timers/promises'
import { promotionBootstrap, forkPromotionProcess } from './promotionBootstrap.mjs'
import { createPromotionOperationStore, PROMOTION_PROTOCOL } from './promotionOperationStore.mjs'
import { inspectPromotionReservation, recordPromotionSlotProcess } from './reviewCompatibilityScheduling.mjs'
import { reviewProcessIdentity, readReviewProcessTree, killReviewProcessTree,
  reviewProcessGroupMembers, matchingReviewProcess } from './reviewProcessTree.mjs'

// Intentionally no store/compiler/publisher imports. This process remains
// responsive while the executor is in synchronous JS or a blocked native call.
const config = promotionBootstrap()
const inspecting = process.argv[3] === 'inspect'
// A bounded control-plane wait tolerates a short concurrent API transaction;
// it stays below the sampling interval. API connections themselves never wait.
const operations = createPromotionOperationStore({ dbPath: config.reviewDbPath, busyTimeoutMs: 50 })
let identityMessage, row, executor, phase = 'prepare', terminal = false, failureReason = null
let deadline, sampler, sampling, pids = [], peakTreeRssBytes = 0, outcome = null
const observedProcesses = new Map()
async function observedStillPresent() {
  let present = false
  for (const identity of observedProcesses.values()) {
    if (await matchingReviewProcess(identity) !== 'dead') present = true
  }
  return present
}
async function stopExecutor() {
  if (!executor?.pid) return
  let identity = observedProcesses.get(executor.pid)
  if (!identity) {
    identity = await reviewProcessIdentity(executor.pid)
    if (identity) observedProcesses.set(identity.pid, identity)
  }
  if (identity && !['dead', 'live'].includes(await matchingReviewProcess(identity))) {
    failureReason = 'PROCESS_IDENTITY_AMBIGUOUS'
    return
  }
  try { process.kill(-executor.pid, 'SIGTERM') }
  catch (error) { if (!['ESRCH', 'EPERM'].includes(error.code)) throw error }
  for (const identity of observedProcesses.values()) {
    if (await matchingReviewProcess(identity) === 'live') {
      try { process.kill(identity.pid, 'SIGTERM') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
  await yieldFor(200)
  if (identity && !['dead', 'live'].includes(await matchingReviewProcess(identity))) {
    failureReason = 'PROCESS_IDENTITY_AMBIGUOUS'
    return
  }
  if ((await reviewProcessGroupMembers(executor.pid)).length) await killReviewProcessTree(executor)
  for (const identity of observedProcesses.values()) {
    if (await matchingReviewProcess(identity) === 'live') {
      try { process.kill(identity.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }
}
function send(type, extra = {}) {
  if (process.connected) process.send({ ...identityMessage, type, ...extra }, () => {})
}
function valid(message, type) {
  return message && Object.keys(message).sort().join(',') === 'nonce,operationId,type,version'
    && message.version === PROMOTION_PROTOCOL && message.type === type
    && /^[a-f0-9-]{36}$/.test(message.operationId) && /^[a-f0-9-]{36}$/.test(message.nonce)
    && (!identityMessage || (message.operationId === identityMessage.operationId && message.nonce === identityMessage.nonce))
}
async function finish(reason = null) {
  if (terminal) return
  terminal = true
  clearTimeout(deadline); clearInterval(sampler)
  await sampling
  if (reason) {
    failureReason ||= reason
    try { operations.unknown(row.id, failureReason) } catch { /* Fail closed on DB contention. */ }
    await stopExecutor()
  }
  const group = executor?.pid ? await reviewProcessGroupMembers(executor.pid) : []
  // Normal completion requires exact bounded IPC, clean process exit AND no
  // native descendants. A lingering tree is never a vacant slot.
  if (group.length || await observedStillPresent()) {
    failureReason ||= 'PROCESS_TREE_REMAINS'
    try { operations.unknown(row.id, failureReason) } catch {}
    await stopExecutor()
  }
  if (inspecting && !failureReason && outcome?.promotion?.promotionId === row.promotion_id
    && ['published', 'idempotent'].includes(outcome.status)
    && (await reviewProcessGroupMembers(executor?.pid || -1)).length === 0) {
    operations.finish(row.id, 'completed', outcome, { reconciled: true })
  }
  const current = operations.get(row.id)
  const canRelease = !failureReason && outcome && ['completed', 'rejected'].includes(current?.state)
    && JSON.stringify(current.outcome) === JSON.stringify(outcome)
    && (await reviewProcessGroupMembers(executor?.pid || -1)).length === 0
  if (canRelease) phase = 'ack'
  send(canRelease ? 'outcome' : 'unknown', { ...(canRelease ? { outcome } : { reasonCode: failureReason || outcome?.reasonCode || current?.outcome?.reasonCode || 'WORKER_EXIT' }),
    metrics: { peakTreeRssBytes, heapLimitMb: config.heapMb, rssLimitMb: config.rssMb, deadlineMs: config.deadlineMs } })
  if (canRelease && process.connected) {
    deadline = setTimeout(() => {
      try { operations.unknown(row.id, 'API_ACK_LOST') } catch {}
      if (process.connected) process.disconnect()
    }, 5000)
  } else if (process.connected) {
    phase = 'done'
    process.disconnect()
  }
}
async function fail(reason) {
  failureReason ||= reason
  await finish(failureReason)
}
process.on('disconnect', () => {
  // Only GO commits the launch. After GO, keep watchdog alive independently of API.
  if (row && phase !== 'done') {
    try { operations.unknown(row.id, phase === 'running' || phase === 'ack' ? 'API_IPC_LOST' : 'API_DISCONNECTED_BEFORE_GO') } catch {}
  }
  if (phase === 'ack') clearTimeout(deadline)
  if (phase !== 'running' && !terminal && row) void fail('API_DISCONNECTED_BEFORE_GO')
})
process.on('message', async message => {
  try {
    if (phase === 'ack' && valid(message, 'ack') && !failureReason) {
      clearTimeout(deadline)
      try {
        operations.acknowledge(row.id, outcome)
      } finally {
        phase = 'done'
        if (process.connected) process.disconnect()
      }
      return
    }
    if (phase === 'prepare') {
      if (!valid(message, 'prepare')) return process.exit(1)
      identityMessage = message
      row = operations.get(message.operationId)
      const slot = inspectPromotionReservation()
      if (!row || (!inspecting && row.state !== 'reserved') || slot.operationId !== row.id
        || slot.token !== row.host_slot_token || row.release_identity !== config.releaseIdentity) return process.exit(1)
      phase = 'registering'
      const identity = await reviewProcessIdentity()
      recordPromotionSlotProcess(row.host_slot_token, inspecting ? `supervisor-inspect-${message.nonce}` : 'supervisor', identity)
      if (!inspecting) operations.registerSupervisor(row.id, message.nonce, identity)
      deadline = setTimeout(() => void fail('WORKER_TIMEOUT'), inspecting ? config.deadlineMs : Math.max(1, Date.parse(row.deadline_at) - Date.now()))
      phase = 'launch'
      send('ready')
      return
    }
    if (phase === 'launch' && valid(message, 'launch') && process.connected) {
      phase = 'spawning'
      executor = forkPromotionProcess('executor', [row.id, inspecting ? 'inspect' : 'execute'], config.heapMb)
      let stderr = ''
      executor.stderr.on('data', bytes => {
        stderr = (stderr + bytes.toString()).slice(-4096)
        if (/heap out of memory|Allocation failed/i.test(stderr)) failureReason ||= 'WORKER_OOM'
        // Drain all bytes; retain only a bounded diagnostic tail.
      })
      executor.on('error', () => void fail('WORKER_IPC_LOST'))
      executor.on('message', async message => {
        try {
          if (phase === 'spawning' && valid(message, 'ready')) {
            phase = 'registering-executor'
            const identity = await reviewProcessIdentity(executor.pid)
            if (!identity) return fail('WORKER_EXIT')
            observedProcesses.set(identity.pid, identity)
            recordPromotionSlotProcess(row.host_slot_token, inspecting ? `executor-inspect-${identityMessage.nonce}` : 'executor', identity)
            if (!inspecting) operations.registerWorker(row.id, identityMessage.nonce, identity)
            // Watchdog and executor identity are durable before either GO.
            sampler = setInterval(() => {
              if (sampling || terminal) return
              sampling = (async () => {
                const tree = await readReviewProcessTree(executor.pid)
                pids = tree.pids
                for (const pid of pids) {
                  if (!observedProcesses.has(pid)) {
                    const identity = await reviewProcessIdentity(pid)
                    if (identity) observedProcesses.set(pid, identity)
                  }
                }
                peakTreeRssBytes = Math.max(peakTreeRssBytes, tree.rssBytes + process.memoryUsage().rss)
                if (peakTreeRssBytes > config.rssMb * 1024 ** 2) void fail('WORKER_RSS_LIMIT')
              })().catch(() => void fail('TREE_SAMPLE_FAILED')).finally(() => { sampling = null })
            }, 250)
            phase = 'go'
            send('armed')
          } else if (phase === 'running' && message?.type === 'outcome'
            && message.version === PROMOTION_PROTOCOL && message.operationId === row.id
            && message.nonce === identityMessage.nonce
            && Object.keys(message).sort().join(',') === 'nonce,operationId,outcome,type,version'
            && Buffer.byteLength(JSON.stringify(message)) <= 16_384 && !outcome && !failureReason) {
            outcome = message.outcome
          } else void fail('INVALID_WORKER_IPC')
        } catch { void fail('WORKER_IPC_LOST') }
      })
      executor.once('close', (code, signal) => {
        if (!terminal) void finish(code === 0 && !signal && outcome && !failureReason ? null : failureReason || 'WORKER_EXIT')
      })
      executor.send({ ...identityMessage, type: 'prepare' }, error => { if (error) void fail('WORKER_IPC_LOST') })
      return
    }
    if (phase === 'go' && valid(message, 'go') && process.connected) {
      phase = 'running'
      executor.send({ ...identityMessage, type: 'go' }, error => { if (error) void fail('WORKER_IPC_LOST') })
      return
    }
    await fail('INVALID_API_IPC')
  } catch (error) {
    console.error('[promotion-supervisor]', error.code || 'SUPERVISOR_ERROR', String(error.message).slice(0, 300))
    if (row) await fail('SUPERVISOR_ERROR'); else process.exit(1)
  }
})
