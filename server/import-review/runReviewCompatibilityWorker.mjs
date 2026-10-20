import { fork } from 'node:child_process'
import { readReviewProcessTree, killReviewProcessTree } from './reviewProcessTree.mjs'
import { mkdtempSync, realpathSync, rmSync, statfsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { REVIEW_COMPARATOR_VERSION } from './reviewCompatibility.mjs'
import {
  acquireReviewCompatibilityLeader, reviewCompatibilityBusy, reviewCompatibilityLockDiagnostics,
  validReviewCompatibilityLease,
} from './reviewCompatibilityScheduling.mjs'

import { REVIEW_WORKER_BUDGET, REVIEW_BACKFILL_WORKER_BUDGET, reviewCompatibilityAutorunEnabled } from './reviewRecoveryPolicy.mjs'
export { REVIEW_WORKER_BUDGET } from './reviewRecoveryPolicy.mjs'
const running = new WeakSet()

export async function runReviewCompatibilityWorker(input, {
  timeoutMs = (input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET).deadlineMs,
  heapMb = (input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET).heapMb,
  rssMb = (input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET).rssMb,
  signal, leaderLease,
} = {}) {
  const budget = input.mode === 'backfill' ? REVIEW_BACKFILL_WORKER_BUDGET : REVIEW_WORKER_BUDGET
  const owned = leaderLease ? null : acquireReviewCompatibilityLeader()
  const lease = leaderLease || owned?.lease
  const unknown = reasonCode => ({ baseline: null, comparison: {
    result: 'unknown', reasonCode, targetBuildId: input.targetBuildId, subjectDigest: null,
    comparatorVersion: REVIEW_COMPARATOR_VERSION,
    componentDigests: {}, differences: [], metrics: { heapLimitMb: heapMb, rssLimitMb: rssMb, peakTreeRssBytes: peakRssBytes, deadlineMs: timeoutMs,
      ...(['LEADER_BUSY', 'ACTIVITY_PENDING'].includes(reasonCode) ? { locks: reviewCompatibilityLockDiagnostics() } : {}) },
  } })
  let worker
  let exited
  let rssTimer
  let sampling
  let pids = []
  let peakRssBytes = 0
  let stderr = ''
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
      || !Number.isInteger(heapMb) || heapMb < 16 || heapMb > budget.heapMb
      || !Number.isFinite(rssMb) || rssMb <= 0 || rssMb > budget.rssMb) throw new Error('Invalid worker budget')
    if (signal?.aborted) return unknown('WORKER_EXIT')
    // A killed child cannot clean its own temporary files. Custody stays here.
    workspace = mkdtempSync(path.join(realpathSync(tmpdir()), 'eqb-review-job-'))
    worker = fork(new URL('./reviewCompatibilityWorker.mjs', import.meta.url), [], {
      execArgv: [`--max-old-space-size=${heapMb}`, '--expose-gc'], serialization: 'advanced', detached: true,
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: { ...process.env, TMPDIR: workspace, TMP: workspace, TEMP: workspace },
    })
    exited = new Promise(resolve => worker.once('exit', resolve))
    worker.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-8192) })
    return await new Promise(resolve => {
      let settled = false
      const finish = output => {
        if (settled) return
        settled = true
        output.comparison.metrics = { ...output.comparison.metrics,
          heapLimitMb: heapMb, rssLimitMb: rssMb, peakTreeRssBytes: peakRssBytes, deadlineMs: timeoutMs }
        resolve(output)
      }
      const fail = reason => {
        if (settled) return
        killReviewProcessTree(worker, pids)
        finish(unknown(reason))
      }
      const sample = async () => {
        if (settled || sampling) return
        sampling = (async () => {
          try {
            const tree = await readReviewProcessTree(worker.pid)
            pids = tree.pids
            peakRssBytes = Math.max(peakRssBytes, tree.rssBytes)
            if (tree.rssBytes > rssMb * 1024 ** 2) fail('WORKER_RSS_LIMIT')
          } catch { fail('WORKER_EXIT') }
        })()
        await sampling
        sampling = null
      }
      timer = setTimeout(() => fail('WORKER_TIMEOUT'), timeoutMs)
      onAbort = () => fail('WORKER_EXIT')
      signal?.addEventListener('abort', onAbort, { once: true })
      rssTimer = setInterval(() => { void sample() }, 250)
      void sample()
      worker.once('message', finish)
      worker.once('error', () => fail('WORKER_EXIT'))
      worker.once('exit', () => finish(unknown(/heap out of memory|Allocation failed/i.test(stderr)
        ? 'WORKER_OOM' : 'WORKER_EXIT')))
      worker.send(input, error => { if (error) fail('WORKER_EXIT') })
    })
  } catch (error) {
    return unknown(error.code === 'ERR_WORKER_OUT_OF_MEMORY' ? 'WORKER_OOM' : 'WORKER_EXIT')
  } finally {
    clearTimeout(timer)
    clearInterval(rssTimer)
    signal?.removeEventListener('abort', onAbort)
    try {
      await sampling
      if (worker?.pid) {
        killReviewProcessTree(worker, pids)
        await exited
      }
    } finally {
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
      const disk = statfsSync(tmpdir())
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
  if (!reviewCompatibilityAutorunEnabled()) return { async stop() {} }
  const controller = new AbortController()
  let timer
  let active
  async function tick() {
    let delay = 30_000
    try {
      if (!reviewCompatibilityAutorunEnabled()) return
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
