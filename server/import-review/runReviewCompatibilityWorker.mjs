import { Worker } from 'node:worker_threads'
import { mkdtempSync, realpathSync, rmSync, statfsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import {
  acquireReviewCompatibilityLeader, reviewCompatibilityBusy, reviewCompatibilityLockDiagnostics,
  validReviewCompatibilityLease,
} from './reviewCompatibilityScheduling.mjs'

import { REVIEW_WORKER_BUDGET, REVIEW_BACKFILL_WORKER_BUDGET } from './reviewRecoveryPolicy.mjs'
export { REVIEW_WORKER_BUDGET } from './reviewRecoveryPolicy.mjs'
const running = new WeakSet()

export async function runReviewCompatibilityWorker(input, {
  timeoutMs = (input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET).deadlineMs,
  heapMb = (input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET).heapMb,
  signal, leaderLease,
} = {}) {
  const budget = input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET
  const owned = leaderLease ? null : acquireReviewCompatibilityLeader()
  const lease = leaderLease || owned?.lease
  const unknown = reasonCode => ({ baseline: null, comparison: {
    result: 'unknown', reasonCode, targetBuildId: input.targetBuildId, subjectDigest: null,
    comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: [], metrics: { heapLimitMb: heapMb, deadlineMs: timeoutMs,
      ...(['LEADER_BUSY', 'ACTIVITY_PENDING'].includes(reasonCode) ? { locks: reviewCompatibilityLockDiagnostics() } : {}) },
  } })
  let worker
  let timer
  let onAbort
  let ownsRunning = false
  let workspace
  try {
    if (!validReviewCompatibilityLease(lease)) return unknown('LEADER_BUSY')
    if (running.has(lease)) return unknown('LEADER_BUSY')
    if (reviewCompatibilityBusy()) return unknown('ACTIVITY_PENDING')
    running.add(lease)
    ownsRunning = true
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > budget.deadlineMs
      || !Number.isInteger(heapMb) || heapMb < 16 || heapMb > budget.heapMb) throw new Error('Invalid worker budget')
    if (signal?.aborted) return unknown('WORKER_EXIT')
    // The supervisor owns temporary custody. Terminating an OOM/timed-out
    // thread does not run its finally blocks, so cleanup must happen here.
    workspace = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-job-'))
    worker = new Worker(new URL('./reviewCompatibilityWorker.mjs', import.meta.url), {
      workerData: input, resourceLimits: { maxOldGenerationSizeMb: heapMb },
      env: { ...process.env, TMPDIR: workspace, TMP: workspace, TEMP: workspace },
    })
    return await new Promise(resolve => {
      timer = setTimeout(() => resolve(unknown('WORKER_TIMEOUT')), timeoutMs)
      onAbort = () => resolve(unknown('WORKER_EXIT'))
      signal?.addEventListener('abort', onAbort, { once: true })
      worker.once('message', output => {
        output.comparison.metrics = { ...output.comparison.metrics, heapLimitMb: heapMb, deadlineMs: timeoutMs }
        resolve(output)
      })
      worker.once('error', error => resolve(unknown(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'WORKER_OOM' : 'WORKER_EXIT')))
      worker.once('exit', () => resolve(unknown('WORKER_EXIT')))
    })
  } catch (error) {
    return unknown(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'WORKER_OOM' : 'WORKER_EXIT')
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
    try { await worker?.terminate() } finally {
      try { if (workspace) rmSync(workspace, { recursive: true, force: true }) }
      finally { if (ownsRunning) running.delete(lease); owned?.release() }
    }
  }
}

// Additive/shadow scheduler: D wires lifecycle/API queueing. Promotion is
// checked by scan; finalize marks host-wide activity before starting its work.
export async function runReviewCompatibilityBatch(store, { dryRun = false, signal } = {}) {
  const leader = acquireReviewCompatibilityLeader()
  if (!leader) return { paused: 'LEADER_BUSY', results: [], locks: reviewCompatibilityLockDiagnostics() }
  try {
    if (reviewCompatibilityBusy()) return { paused: 'ACTIVITY_PENDING', results: [], locks: reviewCompatibilityLockDiagnostics() }
    await store.ready({ signal })
    const ids = store.scan({ limit: REVIEW_WORKER_BUDGET.batchSize })
    const results = []
    for (const revisionId of ids) {
      if (signal?.aborted) break
      if (reviewCompatibilityBusy()) return { paused: 'ACTIVITY_PENDING', results, locks: reviewCompatibilityLockDiagnostics() }
      if (store.isBusy()) break
      const disk = statfsSync('/tmp')
      const free = disk.bavail * disk.bsize
      if (free < 10 * 1024 ** 3) return { paused: free < 7 * 1024 ** 3 ? 'DISK_STOP_BELOW_7_GIB' : 'DISK_WAIT_BELOW_10_GIB', results }
      const job = store.prepare(revisionId)
      if (!job) continue
      const output = await store.compute(job, { signal, leaderLease: leader.lease })
      if (signal?.aborted) { store.discard(job); break }
      const committed = dryRun ? { committed: false, reasonCode: 'DRY_RUN' } : await store.commit(job, output)
      if (dryRun) store.discard(job)
      results.push({ revisionId, ...committed, comparison: output.comparison })
      if (results.length < ids.length) await yieldFor(REVIEW_WORKER_BUDGET.yieldMs, undefined, { signal })
    }
    return { results }
  } catch (error) {
    if (!['REVIEW_TARGET_IDENTITY_INVALID', 'REVIEW_TARGET_IDENTITY_UNAVAILABLE'].includes(error.code)) throw error
    return { paused: 'TARGET_IDENTITY_INVALID', results: [], compatibility: { result: 'unknown', reasonCode: 'TARGET_IDENTITY_INVALID' } }
  } finally { leader.release() }
}

// D calls this once from the API's lifecycle. Startup and periodic scans are
// asynchronous; requests never wait for compilation. Each process may own a
// timer, but only the host leader is allowed to scan/compute a batch.
export function startReviewCompatibilityWorker(store, { onError = () => {}, backfillStore = null } = {}) {
  const controller = new AbortController()
  let timer
  let active
  async function tick() {
    let delay = 30_000
    try {
      active = (async () => {
        // Normal comparison always gets the first slot. Only then spend one
        // bounded idle slot recovering original evidence in a separate thread.
        const normal = await runReviewCompatibilityBatch(store, { signal: controller.signal })
        if (normal.results.length) delay = REVIEW_WORKER_BUDGET.yieldMs
        if (normal.paused || controller.signal.aborted || !backfillStore) return
        if (normal.results.length) await yieldFor(REVIEW_WORKER_BUDGET.yieldMs, undefined, { signal: controller.signal })
        const backfill = await backfillStore.runBatch({ signal: controller.signal })
        if (backfill.more || backfill.results?.some(row => row.outcome === 'inserted'
          || row.reasonCode === 'CAS_CHANGED')) delay = REVIEW_WORKER_BUDGET.yieldMs
        if (backfill.results?.length) console.info(JSON.stringify({ event: 'review-subject-backfill',
          results: backfill.results, summary: backfillStore.status() }))
      })()
      await active
    }
    catch (error) { if (!controller.signal.aborted) onError(error) }
    finally {
      active = null
      if (!controller.signal.aborted) {
        timer = setTimeout(tick, delay)
        timer.unref()
      }
    }
  }
  timer = setTimeout(tick, 0)
  timer.unref()
  return { async stop() {
    clearTimeout(timer)
    controller.abort()
    // tick already reports failures. Shutdown still awaits disposal, without
    // rethrowing the same batch error from an EventEmitter close listener.
    await active?.catch(() => {})
  } }
}
