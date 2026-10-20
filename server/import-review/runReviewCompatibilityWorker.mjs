import { Worker } from 'node:worker_threads'
import { mkdtempSync, realpathSync, rmSync, statfsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import {
  acquireReviewCompatibilityLeader, reviewCompatibilityBusy, validReviewCompatibilityLease,
} from './reviewCompatibilityScheduling.mjs'

export const REVIEW_WORKER_BUDGET = Object.freeze({ heapMb: 384, deadlineMs: 120_000, batchSize: 5, yieldMs: 1000 })
const running = new WeakSet()

export async function runReviewCompatibilityWorker(input, {
  timeoutMs = REVIEW_WORKER_BUDGET.deadlineMs, heapMb = REVIEW_WORKER_BUDGET.heapMb,
  signal, leaderLease,
} = {}) {
  const owned = leaderLease ? null : acquireReviewCompatibilityLeader()
  const lease = leaderLease || owned?.lease
  const unknown = reasonCode => ({ baseline: null, comparison: {
    result: 'unknown', reasonCode, targetBuildId: input.targetBuildId, subjectDigest: null,
    comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: [], metrics: { heapLimitMb: heapMb, deadlineMs: timeoutMs },
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
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > REVIEW_WORKER_BUDGET.deadlineMs
      || !Number.isInteger(heapMb) || heapMb < 16 || heapMb > REVIEW_WORKER_BUDGET.heapMb) throw new Error('Invalid worker budget')
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
  if (!leader) return { paused: 'LEADER_BUSY', results: [] }
  try {
    if (reviewCompatibilityBusy()) return { paused: 'ACTIVITY_PENDING', results: [] }
    const ids = store.scan({ limit: REVIEW_WORKER_BUDGET.batchSize })
    const results = []
    for (const revisionId of ids) {
      if (signal?.aborted || reviewCompatibilityBusy() || store.isBusy()) break
      const disk = statfsSync('/tmp')
      const free = disk.bavail * disk.bsize
      if (free < 10 * 1024 ** 3) return { paused: free < 7 * 1024 ** 3 ? 'DISK_STOP_BELOW_7_GIB' : 'DISK_WAIT_BELOW_10_GIB', results }
      const job = store.prepare(revisionId)
      if (!job) continue
      const output = await store.compute(job, { signal, leaderLease: leader.lease })
      const committed = dryRun ? { committed: false, reasonCode: 'DRY_RUN' } : store.commit(job, output)
      if (dryRun) store.discard(job)
      results.push({ revisionId, ...committed, comparison: output.comparison })
      if (results.length < ids.length) await yieldFor(REVIEW_WORKER_BUDGET.yieldMs, undefined, { signal })
    }
    return { results }
  } finally { leader.release() }
}

// D calls this once from the API's lifecycle. Startup and periodic scans are
// asynchronous; requests never wait for compilation. Each process may own a
// timer, but only the host leader is allowed to scan/compute a batch.
export function startReviewCompatibilityWorker(store, { onError = () => {} } = {}) {
  const controller = new AbortController()
  let timer
  let active
  async function tick() {
    try { active = runReviewCompatibilityBatch(store, { signal: controller.signal }); await active }
    catch (error) { if (!controller.signal.aborted) onError(error) }
    finally {
      active = null
      if (!controller.signal.aborted) {
        timer = setTimeout(tick, 30_000)
        timer.unref()
      }
    }
  }
  timer = setTimeout(tick, 0)
  timer.unref()
  return { async stop() { clearTimeout(timer); controller.abort(); await active } }
}
