import { randomUUID } from 'node:crypto'
import { setTimeout as yieldFor } from 'node:timers/promises'
import { realpathSync } from 'node:fs'
import { promotionBootstrap, forkPromotionProcess } from './promotionBootstrap.mjs'
import { createPromotionOperationStore, promotionOperationError, PROMOTION_PROTOCOL } from './promotionOperationStore.mjs'
import { acquireReviewCompatibilityLeader, inspectPromotionReservation, reservePromotionSlot,
  releasePromotionSlot, reviewCompatibilityBusy, readPromotionSlotProcess,
  promotionSlotProcessRecords, handoffPromotionSlot, reconcileDeadReviewCompatibilityLeader,
  closedPromotionSlot } from './reviewCompatibilityScheduling.mjs'
import { reviewProcessIdentity, matchingReviewProcess, reviewProcessGroupMembers,
  killReviewProcessTree } from './reviewProcessTree.mjs'

export function createPromotionWorkerService({ getStore, afterPublish }) {
  const config = promotionBootstrap()
  const operations = createPromotionOperationStore({ dbPath: config.reviewDbPath })
  const invalidated = new Set()
  let recovery, recoveryTimer
  function invalidate(outcome) {
    if (!['published', 'idempotent'].includes(outcome?.status)) return
    const key = `${outcome.promotion.promotionId}:${outcome.promotion.canonicalPublicationDigest}`
    if (!invalidated.has(key)) {
      afterPublish?.()
      invalidated.add(key)
    }
  }
  function currentResult(row) {
    if (row.state === 'completed') {
      invalidate(row.outcome)
      return { ...row.outcome, operationId: row.id }
    }
    if (row.state === 'rejected') {
      if (row.outcome?.promotion) return { ...row.outcome, operationId: row.id }
      throw Object.assign(new Error(row.outcome?.error || '发布请求已拒绝'), {
        code: row.outcome?.reasonCode || 'IMPORT_REVIEW_PROMOTION_REJECTED',
        status: row.outcome?.status || 409, operationId: row.id,
      })
    }
    throw promotionOperationError('UNKNOWN', row.id)
  }
  async function supervise(row, nonce, { inspecting = false } = {}) {
    const child = forkPromotionProcess('supervisor', [row.id, inspecting ? 'inspect' : 'execute'], 64)
    child.unref()
    let stderr = ''
    child.stderr.on('data', bytes => { stderr = (stderr + bytes.toString()).slice(-4096) })
    const base = { version: PROMOTION_PROTOCOL, operationId: row.id, nonce }
    return new Promise((resolve, reject) => {
      let phase = 'ready', settled = false, result = null
      const timer = setTimeout(() => unknown('HTTP_WAIT_TIMEOUT'), Math.min(config.deadlineMs + 10_000, 300_000))
      function settle(callback) {
        if (settled) return
        settled = true; clearTimeout(timer); callback()
      }
      function unknown(reason) {
        if (settled) return
        // Another API may have reconciled and closed this exact operation
        // while this caller missed the original outcome message.
        try {
          const current = operations.get(row.id)
          if (['completed', 'rejected'].includes(current?.state)
            && closedPromotionSlot(row.host_slot_token, row.id, realpathSync(config.reviewDbPath))) {
            return settle(() => {
              try { resolve({ ...currentResult(current), metrics: result?.metrics }) }
              catch (error) { reject(error) }
            })
          }
        } catch {}
        // After receipt verification/cache invalidation, an ACK can already be
        // releasing the slot. Transport failure must not reopen that terminal
        // row. Keep the HTTP bound; the supervisor owns ACK failure/recovery.
        if (phase !== 'ack') {
          try { operations.unknown(row.id, reason, stderr || null) } catch {}
        }
        // The supervisor retains its deadline and reservation. No cancellation.
        settle(() => reject(promotionOperationError('UNKNOWN', row.id)))
      }
      function send(type) {
        if (child.connected) child.send({ ...base, type }, error => { if (error) unknown('SUPERVISOR_IPC_LOST') })
        else unknown('SUPERVISOR_IPC_LOST')
      }
      child.on('message', message => {
        if (!message || message.version !== PROMOTION_PROTOCOL || message.operationId !== row.id
          || message.nonce !== nonce || Buffer.byteLength(JSON.stringify(message)) > 20_000) return unknown('INVALID_SUPERVISOR_IPC')
        if (message.type === 'unknown') return unknown(message.reasonCode)
        if (phase === 'ready' && message.type === 'ready' && Object.keys(message).length === 4) {
          phase = 'armed'; send('launch')
        } else if (phase === 'armed' && message.type === 'armed' && Object.keys(message).length === 4) {
          phase = 'running'; send('go')
        } else if (phase === 'running' && ['outcome', 'unknown'].includes(message.type) && !result) {
          result = message
          if (message.type === 'unknown') unknown(message.reasonCode)
          else {
            try {
              const current = operations.get(row.id)
              if (!['completed', 'rejected'].includes(current?.state)
                || JSON.stringify(current.outcome) !== JSON.stringify(message.outcome)) return unknown('RECEIPT_MISMATCH')
              // All three API caches invalidate BEFORE acknowledging/releasing
              // the host slot and before the successful HTTP response.
              invalidate(current.outcome)
              phase = 'ack'
              send('ack')
            } catch { unknown('RECEIPT_MISMATCH') }
          }
        } else unknown('INVALID_SUPERVISOR_IPC')
      })
      child.once('error', () => unknown('SUPERVISOR_EXIT'))
      child.once('close', (code, signal) => {
        if (code !== 0 || signal || result?.type !== 'outcome') return unknown('SUPERVISOR_EXIT')
        if (settled) return
        try {
          const current = operations.get(row.id)
          if (!['completed', 'rejected'].includes(current?.state)
            || JSON.stringify(current.outcome) !== JSON.stringify(result.outcome)) return unknown('RECEIPT_MISMATCH')
          if (!closedPromotionSlot(row.host_slot_token, row.id, realpathSync(config.reviewDbPath))) return unknown('SLOT_CLOSE_UNCONFIRMED')
          const answer = currentResult(current)
          settle(() => resolve({ ...answer, metrics: result.metrics }))
        } catch (error) { settle(() => reject(error)) }
      })
      send('prepare')
    })
  }
  // Startup is reconciliation only: never begin/retry a publication. A live
  // independent supervisor keeps ownership after API restart.
  async function reconcileOnce() {
    await reconcileDeadReviewCompatibilityLeader()
    getStore()
    const slot = inspectPromotionReservation()
    const pending = operations.unresolved()
    if (slot.state === 'missing') return { pending: pending.map(row => row.id) }
    if (slot.state !== 'reserved' || slot.dbIdentity !== realpathSync(config.reviewDbPath)) return { blocked: 'AMBIGUOUS_RESERVATION' }
    let row = operations.get(slot.operationId)
    if (!row || row.host_slot_token !== slot.token) return { blocked: 'FILE_WITHOUT_OPERATION', operationId: slot.operationId }
    const supervisor = readPromotionSlotProcess(slot.token, 'supervisor')
    if (!supervisor && !row.supervisor_pid) {
      // A live API may be between COMMIT and supervisor registration. Its
      // periodic recovery (or another API) must never reject that launch.
      const owner = await matchingReviewProcess({
        bootId: row.owner_boot_id, pid: row.owner_pid, startId: row.owner_start_id,
      })
      if (owner === 'live') return { pending: [row.id] }
      if (owner !== 'dead') return { blocked: 'PROCESS_IDENTITY_AMBIGUOUS', operationId: row.id }
    }
    if (supervisor) {
      const state = await matchingReviewProcess(supervisor)
      if (state === 'live') return { pending: [row.id] }
      if (state !== 'dead') return { blocked: 'PROCESS_IDENTITY_AMBIGUOUS', operationId: row.id }
    } else if (row.supervisor_pid) return { blocked: 'PROCESS_EVIDENCE_MISSING', operationId: row.id }
    const executor = readPromotionSlotProcess(slot.token, 'executor')
    if (executor) {
      const state = await matchingReviewProcess(executor)
      if (state === 'different' || state === 'unknown') return { blocked: 'PROCESS_IDENTITY_AMBIGUOUS', operationId: row.id }
      if (state === 'live') {
        try { process.kill(-executor.pid, 'SIGTERM') }
        catch (error) { if (error.code !== 'ESRCH') throw error }
        await yieldFor(200)
        if (!['live', 'dead'].includes(await matchingReviewProcess(executor))) {
          return { blocked: 'PROCESS_IDENTITY_AMBIGUOUS', operationId: row.id }
        }
        await killReviewProcessTree({ pid: executor.pid })
      }
      if ((await reviewProcessGroupMembers(executor.pid)).length) return { blocked: 'PROCESS_TREE_REMAINS', operationId: row.id }
    } else if (row.worker_pid || supervisor) return { blocked: 'EXECUTOR_START_WINDOW', operationId: row.id }
    for (const identity of promotionSlotProcessRecords(slot.token)) {
      const state = await matchingReviewProcess(identity)
      if (state !== 'dead') return { blocked: state === 'live' ? 'RECOVERY_IN_PROGRESS' : 'PROCESS_IDENTITY_AMBIGUOUS', operationId: row.id }
      if ((await reviewProcessGroupMembers(identity.pid)).length) return { blocked: 'PROCESS_TREE_REMAINS', operationId: row.id }
    }
    const leader = acquireReviewCompatibilityLeader({ promotionToken: slot.token })
    if (!leader) return { pending: [row.id] }
    try {
      if (inspectPromotionReservation().operationId !== row.id) return { blocked: 'SLOT_CHANGED' }
      const fresh = operations.get(row.id)
      if (!fresh || fresh.supervisor_pid !== row.supervisor_pid || fresh.worker_pid !== row.worker_pid
        || JSON.stringify(readPromotionSlotProcess(slot.token, 'supervisor')) !== JSON.stringify(supervisor)
        || JSON.stringify(readPromotionSlotProcess(slot.token, 'executor')) !== JSON.stringify(executor)) {
        return { blocked: 'PROCESS_EVIDENCE_CHANGED', operationId: row.id }
      }
      row = fresh
      // Guard against claim/link racing the old snapshot. This CAS cannot
      // overwrite a running/linked promotion or newly registered executor.
      if (!row.promotion_id) {
        if (row.state !== 'rejected' && !operations.rejectUnbegun(row)) return { pending: [row.id] }
        releasePromotionSlot(slot.token)
        return { rejected: row.id }
      }
      try { operations.unknown(row.id, 'API_RESTART_RECONCILIATION') } catch {}
      if (storePromotionPublished(row)) {
        try {
          await supervise(operations.get(row.id), randomUUID(), { inspecting: true })
          return { completed: row.id }
        } catch { /* Retain unknown + original target; never replay publisher. */ }
      }
      return { pending: [row.id], reasonCode: 'EXPLICIT_RETRY_REQUIRED', recoverable: row.id }
    } finally { leader.release() }
  }
  function storePromotionPublished(row) {
    return getStore().operationPromotion(row.promotion_id)?.state === 'published'
  }
  function reconcile() {
    return recovery ||= reconcileOnce().finally(() => { recovery = null })
  }
  async function start(paperId, mode, input, actor, secretHash = null) {
    const store = getStore()
    const expected = store.preparePromotionOperation(paperId, mode, input, actor, secretHash)
    let duplicate = operations.find(mode, actor, expected)
    const resubmitRejected = duplicate?.state === 'rejected'
      && (mode === 'retry_ship' || duplicate.outcome?.reasonCode === 'NOT_BEGUN'
        || (mode === 'owner_publish' && !duplicate.promotion_id))
    if (duplicate && duplicate.state !== 'unknown' && !resubmitRejected) return currentResult(duplicate)
    if (duplicate?.state === 'unknown' && mode !== 'retry_ship') return currentResult(duplicate)
    // Owner's second click and consumed scoped requests are status reads.
    const prior = store.latestPromotion(paperId)
    const request = mode === 'scoped' ? store.publicationRequest(expected.requestId, actor) : null
    if (request?.state === 'consumed') return { status: request.promotion?.state || 'consumed', promotion: request.promotion }
    if (mode === 'owner_publish' && prior?.revisionId === expected.revisionId) {
      return { status: prior?.state || 'consumed', promotion: prior }
    }
    let replacesOperationId = null
    if (mode === 'retry_ship') {
      const reconciliation = await reconcile()
      if (reconciliation.completed) {
        const completed = operations.get(reconciliation.completed)
        if (completed.paper_id === paperId && completed.revision_id === expected.revisionId
          && completed.promotion_id === prior?.promotionId
          && completed.outcome?.promotion?.approvalId === expected.approvalId) return currentResult(completed)
      }
      if (reconciliation.recoverable) {
        const previous = operations.get(reconciliation.recoverable)
        if (previous.paper_id !== paperId || previous.promotion_id !== prior?.promotionId
          || previous.revision_id !== expected.revisionId) throw promotionOperationError('BUSY', previous.id)
        replacesOperationId = previous.id
      }
    }
    await reconcileDeadReviewCompatibilityLeader()
    const owner = await reviewProcessIdentity()
    const recoverySlot = replacesOperationId ? inspectPromotionReservation() : null
    const leader = acquireReviewCompatibilityLeader({ promotionToken: recoverySlot?.token })
    if (!leader) throw promotionOperationError('BUSY', inspectPromotionReservation().operationId || operations.unresolved()[0]?.id)
    let row, slot
    const nonce = randomUUID(), id = randomUUID()
    try {
      if (!replacesOperationId && reviewCompatibilityBusy()) throw promotionOperationError('BUSY')
      if (replacesOperationId) {
        const current = inspectPromotionReservation()
        if (current.state !== 'reserved' || current.token !== recoverySlot.token
          || current.operationId !== replacesOperationId) throw promotionOperationError('BUSY', replacesOperationId)
        // Recheck dead trees under the same leader before the audited handoff.
        for (const identity of promotionSlotProcessRecords(recoverySlot.token)) {
          if (await matchingReviewProcess(identity) !== 'dead'
            || (await reviewProcessGroupMembers(identity.pid)).length) throw promotionOperationError('BUSY', replacesOperationId)
        }
        slot = handoffPromotionSlot(leader.lease, recoverySlot.token, id)
      } else slot = reservePromotionSlot(leader.lease, { operationId: id,
        dbIdentity: config.reviewDbPath, releaseIdentity: config.releaseIdentity })
      if (!slot) throw promotionOperationError('BUSY', inspectPromotionReservation().operationId)
      row = operations.reserve({ id, paperId, revisionId: expected.revisionId,
        mode, actor, expected, requestId: mode === 'scoped' ? expected.requestId : null,
        nonce, slotToken: slot.token, owner, releaseIdentity: config.releaseIdentity,
        deadlineAt: new Date(Date.now() + config.deadlineMs).toISOString(),
        legacyPromotionId: mode === 'retry_ship' ? prior?.promotionId : null, replacesOperationId })
    } catch (error) {
      // This live stack proves no fork was attempted. A crash before this
      // cleanup instead preserves file-without-DB evidence for recovery.
      if (slot && !operations.get(id)) {
        if (replacesOperationId) slot.rollback()
        else releasePromotionSlot(slot.token)
      }
      throw error
    } finally { leader.release() }
    return supervise(row, nonce)
  }
  return {
    promote: (paperId, input, actor) => start(paperId, input?.intent, input, actor),
    promoteOwner: (paperId, revisionId, input, actor) => start(paperId, 'owner_publish', { ...input, revisionId }, actor),
    promoteScoped: (paperId, requestId, secretHash, actor) => start(paperId, 'scoped', { requestId }, actor, secretHash),
    reconcile,
    canCleanup() {
      try { return operations.unresolved().length === 0 && !operations.legacyPublishing() }
      catch { return false }
    },
    ready() {
      recoveryTimer ||= setInterval(() => { void reconcile().catch(() => {}) }, 5000)
      recoveryTimer.unref()
      return reconcile()
    },
    stop() { clearInterval(recoveryTimer) },
  }
}
