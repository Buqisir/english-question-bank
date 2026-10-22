import { promotionBootstrap, openPromotionBank, rendererBuildId } from './promotionBootstrap.mjs'
import { createPromotionOperationStore, PROMOTION_PROTOCOL } from './promotionOperationStore.mjs'
import { inspectPromotionReservation } from './reviewCompatibilityScheduling.mjs'
import { createImportReviewStore } from './importReviewStore.mjs'
import { createSinglePaperPromotionService } from './singlePaperPromotion.mjs'

// Fixed executor. Never imports api.mjs, starts HTTP, scanner or backfill.
// IPC carries only identity/challenge and a bounded receipt.
const config = promotionBootstrap()
const inspecting = process.argv[3] === 'inspect'
const operations = createPromotionOperationStore({ dbPath: config.reviewDbPath, busyTimeoutMs: 5000 })
let prepared = null
let started = false
function valid(message, type) {
  return message && Object.keys(message).sort().join(',') === 'nonce,operationId,type,version'
    && message.version === PROMOTION_PROTOCOL && message.type === type
    && /^[a-f0-9-]{36}$/.test(message.operationId) && /^[a-f0-9-]{36}$/.test(message.nonce)
}
function send(type, extra = {}) {
  if (process.connected) process.send({ version: PROMOTION_PROTOCOL, type,
    operationId: prepared.operationId, nonce: prepared.nonce, ...extra })
}
process.on('disconnect', () => {
  // Supplement only: supervisor's independent deadline/group kill is authority.
  if (!started) process.exit(1)
})
process.on('message', async message => {
  if (!prepared) {
    if (!valid(message, 'prepare')) return process.exit(1)
    const row = operations.get(message.operationId)
    const slot = inspectPromotionReservation()
    if (!row || slot.state !== 'reserved' || slot.operationId !== row.id
      || slot.token !== row.host_slot_token || row.release_identity !== config.releaseIdentity) return process.exit(1)
    prepared = message
    send('ready')
    return
  }
  if (started || !valid(message, 'go') || message.operationId !== prepared.operationId
    || message.nonce !== prepared.nonce) return process.exit(1)
  started = true
  try {
    const row = inspecting ? operations.get(message.operationId)
      : operations.claim(message.operationId, message.nonce, config.releaseIdentity)
    const store = createImportReviewStore({ dbPath: config.reviewDbPath,
      filesRoot: config.filesRoot, rendererBuildId, initializeSchema: false })
    // Resolve the executing target before capturing a legacy/content guard;
    // asynchronous identity warmup must not switch modes during blob archive.
    if (!inspecting) await store.ready()
    const service = createSinglePaperPromotionService({ getStore: () => store,
      openDatabase: options => openPromotionBank(config, options), paperAssetsDir: config.paperAssetsDir })
    if (inspecting) {
      const receipt = row.promotion_id ? service.inspectReceipt(row.paper_id, row.promotion_id) : null
      send('outcome', { outcome: receipt || { reasonCode: 'NO_EXACT_PUBLISHED_RECEIPT' } })
      process.disconnect()
      return
    }
    const execution = { id: row.id, nonce: message.nonce }
    const result = await (row.mode === 'owner_publish'
      ? service.promoteOwner(row.paper_id, row.revision_id, row.expected, row.actor, execution)
      : row.mode === 'scoped'
        ? service.promoteScoped(row.paper_id, row.request_id, null, row.actor, execution)
        : service.promote(row.paper_id, row.expected, row.actor, execution))
    const outcome = { status: result.status, promotion: result.promotion,
      ...(result.failure ? { failure: result.failure } : {}) }
    if (['published', 'idempotent'].includes(result.status)) operations.finish(row.id, 'completed', outcome)
    else if (result.status === 'failed') operations.finish(row.id, 'rejected', outcome)
    else throw new Error('Promotion did not yield a committed receipt')
    send('outcome', { outcome })
    process.disconnect()
  } catch (error) {
    const row = operations.get(prepared.operationId)
    const outcome = { reasonCode: error.code || 'WORKER_ERROR', error: String(error.message).slice(0, 1000),
      status: Number(error.status || 409) }
    try {
      if (inspecting) { /* Inspection never writes business/operation state. */ }
      else if (row && !row.promotion_id && row.state === 'reserved') operations.finish(row.id, 'rejected', outcome)
      else operations.unknown(prepared.operationId, outcome.reasonCode, outcome.error)
    } catch { /* Retain reservation/running if SQLite is locked. */ }
    send('outcome', { outcome })
    if (process.connected) process.disconnect()
  }
})
