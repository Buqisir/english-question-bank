import { createHash } from 'node:crypto'
import { stableStringify } from '../../shared/paper-canonical/stable.mjs'
import { buildSelectionSourceFromConsumption } from '../../shared/paper-selection/sourceProjection.mjs'
import {
  PERSONAL_ID_PATTERN,
  PERSONAL_LAYER_API_SCHEMA,
  PERSONAL_LAYER_SCHEMA_VERSION,
  createEmptyPersonalLayerState,
  resolveTextAnchor,
} from '../../shared/personal-paper-layer/index.mjs'
import { createPersonalPaperLayerStore, ensurePersonalPaperLayerShape } from './store.mjs'

export { PERSONAL_LAYER_API_SCHEMA }

// Scopes browser-side draft recovery to one account without exposing the user id.
export function personalLayerOwnerKey(userId) {
  return createHash('sha256').update(`eqb-personal-layer-owner-v1\u0000${userId}`).digest('hex').slice(0, 32)
}
const COMMIT_KEYS = new Set([
  'schemaVersion', 'paperId', 'sourceRevision', 'expectedVersion', 'clientMutationId', 'operations',
])
const PAPER_ID_PATTERN = /^[A-Za-z0-9_.-]{1,160}$/u
const WRITES_PER_MINUTE = 120
const PRUNE_INTERVAL_MS = 60 * 60 * 1000

function fail(code, message, status = 400, details) {
  const error = new Error(message)
  error.code = code
  error.status = status
  if (details !== undefined) error.details = details
  return error
}

function withStatus(error) {
  if (error.status) return error
  // Shared contract errors carry codes only; every one of them is a client input problem.
  if (typeof error.code === 'string' && /^PERSONAL_/u.test(error.code)) {
    error.status = error.code === 'PERSONAL_ANCHOR_SOURCE_MISMATCH' ? 409 : 400
  }
  return error
}

function objectDiagnostics(source, state) {
  if (state.sourceRevision !== source.sourceRevision) return []
  const diagnostics = []
  for (const object of state.objects) {
    if (!object.textAnchor) continue
    const resolved = resolveTextAnchor(source, object.textAnchor)
    if (resolved.status !== 'ok') {
      diagnostics.push({ objectId: object.id, code: 'needs-reanchor', reasons: resolved.reasons })
    }
  }
  return diagnostics
}

export function createPersonalPaperLayerRuntime({
  openUserDatabase,
  loadCanonicalConsumption,
  loadSource: loadSourceOverride,
  now = () => new Date(),
} = {}) {
  const writeWindows = new Map()
  let lastPruneMs = 0

  function loadSource(paperId) {
    if (typeof paperId !== 'string' || !PAPER_ID_PATTERN.test(paperId)) {
      throw fail('PERSONAL_LAYER_REQUEST_INVALID', '试卷编号不正确')
    }
    try {
      if (loadSourceOverride) return loadSourceOverride(paperId)
      return buildSelectionSourceFromConsumption(
        loadCanonicalConsumption({ paperId, consumerId: 'screen' }),
      )
    } catch (error) {
      if (error?.status) throw error
      throw fail('PERSONAL_LAYER_SOURCE_UNAVAILABLE', '这张卷子暂时不能批注', 404)
    }
  }

  function throttle(userId, nowMs) {
    const windowStart = nowMs - 60_000
    const recent = (writeWindows.get(userId) || []).filter((at) => at > windowStart)
    if (recent.length >= WRITES_PER_MINUTE) {
      throw fail('PERSONAL_LAYER_RATE_LIMITED', '保存太频繁，稍后自动重试', 429)
    }
    recent.push(nowMs)
    writeWindows.set(userId, recent)
  }

  function read(userId, { paperId, sourceRevision }) {
    const source = loadSource(paperId)
    const revision = sourceRevision || source.sourceRevision
    const db = openUserDatabase({ readOnly: true })
    try {
      const store = createPersonalPaperLayerStore(db)
      const stored = store.readLayer(userId, paperId, revision)
      const state = stored ?? (revision === source.sourceRevision ? createEmptyPersonalLayerState(source) : null)
      return {
        schemaVersion: PERSONAL_LAYER_API_SCHEMA,
        paperId,
        ownerKey: personalLayerOwnerKey(userId),
        currentSourceRevision: source.sourceRevision,
        sourceProjectionVersion: source.sourceProjectionVersion,
        sourceRevision: revision,
        stale: revision !== source.sourceRevision,
        layer: state,
        diagnostics: state ? objectDiagnostics(source, state) : [],
        revisions: store.listRevisions(userId, paperId),
      }
    } finally {
      db.close()
    }
  }

  function commit(userId, paperId, body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw fail('PERSONAL_LAYER_REQUEST_INVALID', '保存请求不正确')
    }
    for (const key of Object.keys(body)) {
      if (!COMMIT_KEYS.has(key)) throw fail('PERSONAL_LAYER_REQUEST_INVALID', '保存请求不正确')
    }
    if (body.schemaVersion !== PERSONAL_LAYER_API_SCHEMA || body.paperId !== paperId) {
      throw fail('PERSONAL_LAYER_REQUEST_INVALID', '保存请求不正确')
    }
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0) {
      throw fail('PERSONAL_LAYER_REQUEST_INVALID', 'expectedVersion 不正确')
    }
    if (typeof body.clientMutationId !== 'string' || !PERSONAL_ID_PATTERN.test(body.clientMutationId)) {
      throw fail('PERSONAL_LAYER_REQUEST_INVALID', 'clientMutationId 不正确')
    }
    const source = loadSource(paperId)
    if (body.sourceRevision !== source.sourceRevision) {
      throw fail('PERSONAL_LAYER_SOURCE_MISMATCH', '卷子已经更新，这批修改没有保存', 409, {
        currentSourceRevision: source.sourceRevision,
      })
    }
    const at = now()
    throttle(userId, at.getTime())
    const bodyDigest = createHash('sha256').update(stableStringify({
      paperId,
      sourceRevision: body.sourceRevision,
      expectedVersion: body.expectedVersion,
      operations: body.operations,
    })).digest('hex')
    const db = openUserDatabase({ readOnly: false })
    try {
      ensurePersonalPaperLayerShape(db)
      const store = createPersonalPaperLayerStore(db)
      if (at.getTime() - lastPruneMs > PRUNE_INTERVAL_MS) {
        lastPruneMs = at.getTime()
        store.pruneMutations(at.getTime())
      }
      const result = store.commit(userId, {
        source,
        expectedVersion: body.expectedVersion,
        clientMutationId: body.clientMutationId,
        operations: body.operations,
        bodyDigest,
        now: at.toISOString(),
      })
      return { schemaVersion: PERSONAL_LAYER_API_SCHEMA, paperId, sourceRevision: source.sourceRevision, ...result }
    } catch (error) {
      throw withStatus(error)
    } finally {
      db.close()
    }
  }

  return {
    capability() {
      return { schemaVersion: PERSONAL_LAYER_API_SCHEMA, enabled: true, layerSchemaVersion: PERSONAL_LAYER_SCHEMA_VERSION }
    },
    read,
    commit,
  }
}
