import { PERSONAL_LAYER_MAX_OPERATIONS, PERSONAL_LAYER_MAX_REQUEST_BYTES } from './constants.mjs'
import { applyPersonalLayerOperations } from './objects.mjs'

export const PERSONAL_LAYER_API_SCHEMA = 'eqb-personal-paper-layer-api-v1'
export const PERSONAL_LAYER_DRAFT_VERSION = 'eqb-personal-layer-draft-v1'

// Leaves room for the request envelope inside the server's body limit.
const BATCH_OPERATION_BYTES = PERSONAL_LAYER_MAX_REQUEST_BYTES - 32 * 1024
const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
const PATCHABLE_CREATE_KEYS = new Set(['document', 'style', 'placement'])
const BLOCKING_STATUSES = new Set(['unavailable', 'conflict', 'stale-source', 'auth-paused', 'rejected'])
const READ_ONLY_STATUSES = new Set(['loading', 'unavailable', 'conflict', 'stale-source', 'rejected'])

const encoder = new TextEncoder()
const byteLength = (value) => encoder.encode(JSON.stringify(value)).length

export function personalLayerDraftKey({ ownerKey, paperId, sourceRevision }) {
  return `${PERSONAL_LAYER_DRAFT_VERSION}|${ownerKey}|${paperId}|${sourceRevision}`
}

export function createPersonalMutationId() {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  return `m_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

/*
 * Maps a transport failure to the save status the teacher sees. Anything the
 * server did not explicitly confirm stays local; only these codes decide
 * whether to retry automatically or wait for a person.
 */
export function classifyPersonalLayerFailure(error) {
  if (!error || error.kind === 'network' || error.status === 0 || error.status === undefined) return 'offline'
  if (error.status === 401) return 'auth-paused'
  if (error.status === 409 && error.code === 'PERSONAL_LAYER_SOURCE_MISMATCH') return 'stale-source'
  if (error.status === 409) return 'conflict'
  if (error.status === 429 || error.status >= 500) return 'failed'
  return 'rejected'
}

function objectIdOf(operation) {
  return operation.op === 'create' ? operation.object.id : operation.objectId
}

/*
 * Folds a new operation into the unsent queue so a burst of edits to one
 * object becomes one write. Only operations that never left the browser are
 * merged; anything already sent is untouched.
 */
export function coalescePersonalOperations(pending, operations) {
  const queue = pending.slice()
  for (const operation of operations) {
    const id = objectIdOf(operation)
    let index = -1
    for (let cursor = queue.length - 1; cursor >= 0; cursor -= 1) {
      if (objectIdOf(queue[cursor]) === id) {
        index = cursor
        break
      }
    }
    const previous = index >= 0 ? queue[index] : null
    if (!previous || previous.op === 'delete') {
      queue.push(operation)
      continue
    }
    if (operation.op === 'delete') {
      if (previous.op === 'create') queue.splice(index, 1)
      else queue.splice(index, 1, operation)
      continue
    }
    if (operation.op === 'update' && previous.op === 'update') {
      queue[index] = { op: 'update', objectId: id, patch: { ...previous.patch, ...operation.patch } }
      continue
    }
    if (operation.op === 'update' && previous.op === 'create'
      && Object.keys(operation.patch).every((key) => PATCHABLE_CREATE_KEYS.has(key))) {
      queue[index] = { op: 'create', object: { ...previous.object, ...operation.patch } }
      continue
    }
    queue.push(operation)
  }
  return queue
}

export function takePersonalOperationBatch(pending) {
  const batch = []
  let bytes = 0
  for (const operation of pending) {
    const size = byteLength(operation)
    if (batch.length >= PERSONAL_LAYER_MAX_OPERATIONS) break
    if (batch.length > 0 && bytes + size > BATCH_OPERATION_BYTES) break
    batch.push(operation)
    bytes += size
  }
  return { batch, rest: pending.slice(batch.length) }
}

function applyInChunks(state, operations, context) {
  let next = state
  for (let start = 0; start < operations.length; start += PERSONAL_LAYER_MAX_OPERATIONS) {
    next = applyPersonalLayerOperations(next, operations.slice(start, start + PERSONAL_LAYER_MAX_OPERATIONS), context).state
  }
  return next
}

// The server copy of each affected object replaces the optimistic one, so
// server times and revisions win once a write is confirmed.
export function mergePersonalCommitResult(base, result) {
  const objects = base.objects.slice()
  for (const object of result.objects) {
    const index = objects.findIndex((candidate) => candidate.id === object.id)
    if (index >= 0) objects[index] = object
    else objects.push(object)
  }
  const deleted = new Set(result.deletedObjectIds)
  return {
    ...base,
    version: result.layerVersion,
    objects: objects.filter((object) => !deleted.has(object.id)),
    deletedObjectIds: [...new Set([...base.deletedObjectIds, ...result.deletedObjectIds])].sort(),
  }
}

/*
 * One autosave session per (account, paper, source revision). The host
 * creates a new session when any of those change and disposes the old one;
 * a disposed session ignores every late response and timer.
 */
export function createPersonalLayerSession({
  paperId,
  source,
  transport,
  localStore = null,
  createId = createPersonalMutationId,
  now = () => new Date().toISOString(),
  debounceMs = 600,
  retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
  timers = globalThis,
}) {
  let status = 'loading'
  let base = null
  let view = null
  let ownerKey = null
  let inflight = null
  let pending = []
  let sending = false
  let sendToken = 0
  let conflict = null
  let lastError = null
  let diagnostics = []
  let revisions = []
  let localDraft = localStore ? 'none' : 'unavailable'
  let disposed = false
  let flushTimer = null
  let retryIndex = 0
  let localChain = Promise.resolve()
  let snapshot = null
  const listeners = new Set()
  const settleWaiters = new Set()

  const draftKey = () => personalLayerDraftKey({ ownerKey, paperId, sourceRevision: source.sourceRevision })
  const unsentOperations = () => [...(inflight?.operations ?? []), ...pending]

  function errorSummary(error) {
    if (!error) return null
    return { status: error.status ?? 0, code: error.code || (error.kind === 'network' ? 'NETWORK' : 'UNKNOWN'), message: error.message || '' }
  }

  function emit() {
    if (disposed) return
    snapshot = Object.freeze({
      status,
      layer: view,
      confirmedVersion: base?.version ?? null,
      unsentCount: unsentOperations().length,
      localDraft,
      conflict,
      lastError,
      diagnostics,
      revisions,
      readOnly: READ_ONLY_STATUSES.has(status),
    })
    for (const listener of listeners) listener(snapshot)
    for (const waiter of [...settleWaiters]) waiter()
  }

  function rebuildView() {
    if (!base) {
      view = null
      return
    }
    try {
      view = applyInChunks(base, unsentOperations(), { source, now: now() })
    } catch {
      // Local edits no longer fit the confirmed layer; keep them for the person to decide.
      view = base
    }
  }

  function persistLocal() {
    if (!localStore || !ownerKey) return localChain
    const key = draftKey()
    const operations = unsentOperations()
    const record = operations.length === 0 ? null : {
      draftVersion: PERSONAL_LAYER_DRAFT_VERSION,
      key,
      ownerKey,
      paperId,
      sourceRevision: source.sourceRevision,
      baseVersion: base?.version ?? 0,
      inflight,
      pending,
      updatedAt: now(),
    }
    localChain = localChain.then(async () => {
      try {
        if (record) await localStore.save(key, record)
        else await localStore.clear(key)
        if (!disposed) localDraft = record ? 'protected' : 'none'
      } catch {
        if (!disposed) localDraft = 'failed'
      }
      emit()
    })
    return localChain
  }

  function clearFlushTimer() {
    if (flushTimer !== null) timers.clearTimeout(flushTimer)
    flushTimer = null
  }

  function scheduleFlush(delay = debounceMs) {
    if (disposed) return
    clearFlushTimer()
    flushTimer = timers.setTimeout(() => {
      flushTimer = null
      void flush()
    }, delay)
  }

  function refetchServer() {
    return transport.read({ paperId, sourceRevision: source.sourceRevision })
  }

  async function enterConflict(reason, localOperations) {
    status = 'conflict'
    inflight = null
    pending = localOperations
    conflict = { reason, serverLayer: null, localOperations, refreshError: null }
    rebuildView()
    await persistLocal()
    emit()
    const token = sendToken
    try {
      const server = await refetchServer()
      if (disposed || token !== sendToken || status !== 'conflict') return
      conflict = { ...conflict, serverLayer: server.layer }
      diagnostics = server.diagnostics ?? []
      revisions = server.revisions ?? []
    } catch (error) {
      if (disposed || token !== sendToken || status !== 'conflict') return
      conflict = { ...conflict, refreshError: errorSummary(error) }
    }
    emit()
  }

  function handleFailure(error) {
    lastError = errorSummary(error)
    const kind = classifyPersonalLayerFailure(error)
    if (kind === 'conflict') {
      void enterConflict('server-changed', unsentOperations())
      return
    }
    status = kind
    if (kind === 'offline' || kind === 'failed') {
      const delay = retryDelaysMs[Math.min(retryIndex, retryDelaysMs.length - 1)]
      retryIndex += 1
      scheduleFlush(delay)
    }
    emit()
  }

  function onCommitted(result) {
    const sent = inflight
    lastError = null
    retryIndex = 0
    if (result.layerVersion === sent.expectedVersion + 1 && base.version === sent.expectedVersion) {
      base = mergePersonalCommitResult(base, result)
    } else if (result.replayed && (base.version === result.layerVersion
      || (base.version > result.layerVersion && pending.length === 0))) {
      // The layer read after a reload already contains this write (and maybe later ones).
    } else {
      inflight = null
      void enterConflict('server-changed', pending)
      return
    }
    inflight = null
    rebuildView()
    void persistLocal()
    if (pending.length > 0) {
      status = 'saving'
      scheduleFlush(0)
    } else {
      status = 'saved'
    }
    emit()
  }

  async function flush() {
    if (disposed || sending || !base || BLOCKING_STATUSES.has(status)) return
    clearFlushTimer()
    if (!inflight) {
      if (pending.length === 0) {
        if (status !== 'saved') {
          status = 'saved'
          emit()
        }
        return
      }
      const { batch, rest } = takePersonalOperationBatch(pending)
      inflight = { clientMutationId: createId(), expectedVersion: base.version, operations: batch }
      pending = rest
    }
    sending = true
    const token = ++sendToken
    if (status !== 'offline' && status !== 'failed') status = 'saving'
    emit()
    // The receipt id is on disk before the request leaves, so a crash mid-send resends the same id.
    await persistLocal()
    if (disposed || token !== sendToken) return
    const body = {
      schemaVersion: PERSONAL_LAYER_API_SCHEMA,
      paperId,
      sourceRevision: source.sourceRevision,
      expectedVersion: inflight.expectedVersion,
      clientMutationId: inflight.clientMutationId,
      operations: inflight.operations,
    }
    let result
    try {
      result = await transport.commit(body)
    } catch (error) {
      if (disposed || token !== sendToken) return
      sending = false
      handleFailure(error)
      return
    }
    if (disposed || token !== sendToken) return
    sending = false
    onCommitted(result)
  }

  async function load() {
    let server
    try {
      server = await transport.read({ paperId, sourceRevision: source.sourceRevision })
    } catch (error) {
      if (disposed) return
      lastError = errorSummary(error)
      // A failed read is never shown as an empty layer that could then be saved over.
      status = classifyPersonalLayerFailure(error) === 'auth-paused' ? 'auth-paused' : 'unavailable'
      emit()
      return
    }
    if (disposed) return
    ownerKey = server.ownerKey
    base = server.layer
    diagnostics = server.diagnostics ?? []
    revisions = server.revisions ?? []
    if (server.currentSourceRevision !== source.sourceRevision || !base) {
      status = 'stale-source'
      rebuildView()
      emit()
      return
    }
    let record = null
    if (localStore) {
      try {
        record = await localStore.load(draftKey())
      } catch {
        localDraft = 'unavailable'
      }
      if (disposed) return
    }
    if (record && (record.draftVersion !== PERSONAL_LAYER_DRAFT_VERSION || record.ownerKey !== ownerKey
      || record.paperId !== paperId || record.sourceRevision !== source.sourceRevision)) {
      record = null
    }
    if (!record) {
      status = 'saved'
      rebuildView()
      emit()
      return
    }
    localDraft = 'protected'
    inflight = record.inflight ?? null
    pending = Array.isArray(record.pending) ? record.pending : []
    if (inflight) {
      // Unknown outcome: resend the same id so the server replays or rejects it; never guess.
      status = 'saving'
      rebuildView()
      emit()
      void flush()
      return
    }
    if (record.baseVersion !== base.version) {
      await enterConflict('local-draft-diverged', pending)
      return
    }
    status = 'dirty'
    rebuildView()
    emit()
    scheduleFlush(0)
  }

  function apply(operations) {
    if (disposed || !base || READ_ONLY_STATUSES.has(status)) {
      return { ok: false, code: 'PERSONAL_LAYER_READ_ONLY' }
    }
    let next
    try {
      next = applyInChunks(view, operations, { source, now: now() })
    } catch (error) {
      return { ok: false, code: error.code || 'PERSONAL_LAYER_REQUEST_INVALID', message: error.message }
    }
    pending = coalescePersonalOperations(pending, operations)
    view = next
    if (status === 'saved') status = 'dirty'
    void persistLocal()
    emit()
    if (status !== 'offline' && status !== 'failed' && status !== 'auth-paused') scheduleFlush()
    return { ok: true }
  }

  function resolveConflict(choice) {
    if (status !== 'conflict' || !conflict) return { ok: false, code: 'PERSONAL_LAYER_NO_CONFLICT' }
    if (!conflict.serverLayer) return { ok: false, code: 'PERSONAL_LAYER_SERVER_UNREAD' }
    const serverLayer = conflict.serverLayer
    const localOperations = conflict.localOperations
    if (choice === 'reapply-local') {
      try {
        applyInChunks(serverLayer, localOperations, { source, now: now() })
      } catch (error) {
        return { ok: false, code: error.code || 'PERSONAL_LAYER_REQUEST_INVALID', message: error.message }
      }
    } else if (choice !== 'keep-server') {
      return { ok: false, code: 'PERSONAL_LAYER_REQUEST_INVALID' }
    }
    sendToken += 1
    base = serverLayer
    inflight = null
    pending = choice === 'reapply-local' ? localOperations : []
    conflict = null
    lastError = null
    status = pending.length > 0 ? 'dirty' : 'saved'
    rebuildView()
    void persistLocal()
    emit()
    if (pending.length > 0) scheduleFlush(0)
    return { ok: true }
  }

  async function refreshConflict() {
    if (status !== 'conflict' || !conflict) return
    await enterConflict(conflict.reason, conflict.localOperations)
  }

  function discardUnsaved() {
    if (status !== 'rejected') return { ok: false, code: 'PERSONAL_LAYER_NOTHING_TO_DISCARD' }
    sendToken += 1
    sending = false
    inflight = null
    pending = []
    lastError = null
    status = 'saved'
    rebuildView()
    void persistLocal()
    emit()
    return { ok: true }
  }

  function retryNow() {
    if (status === 'offline' || status === 'failed') {
      retryIndex = 0
      status = inflight || pending.length ? 'saving' : 'saved'
      void flush()
    }
  }

  function resumeAfterAuth(nextOwnerKey) {
    // A different account never inherits this session's unsent edits.
    if (status !== 'auth-paused' || nextOwnerKey !== ownerKey || !ownerKey) return false
    status = inflight || pending.length ? 'saving' : 'saved'
    retryIndex = 0
    void flush()
    return true
  }

  // Resolves once every edit made so far is confirmed; rejects on any state that needs a person.
  function settle() {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (disposed) {
          settleWaiters.delete(check)
          reject(Object.assign(new Error('session disposed'), { code: 'PERSONAL_LAYER_DISPOSED' }))
        } else if (status === 'saved' && !inflight && pending.length === 0) {
          settleWaiters.delete(check)
          resolve(base.version)
        } else if (BLOCKING_STATUSES.has(status) || status === 'offline' || status === 'failed') {
          settleWaiters.delete(check)
          reject(Object.assign(new Error(`layer not saved: ${status}`), { code: 'PERSONAL_LAYER_NOT_SAVED', status }))
        }
      }
      settleWaiters.add(check)
      if (flushTimer !== null) void flush()
      check()
    })
  }

  function dispose() {
    disposed = true
    sendToken += 1
    clearFlushTimer()
    listeners.clear()
    for (const waiter of [...settleWaiters]) waiter()
    settleWaiters.clear()
  }

  emit()

  return {
    load,
    apply,
    flush,
    settle,
    retryNow,
    resumeAfterAuth,
    resolveConflict,
    refreshConflict,
    discardUnsaved,
    dispose,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    whenLocalWritten: () => localChain,
  }
}
