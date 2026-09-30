import { stableStringify } from '../paper-canonical/stable.mjs'
import { createPersonalMutationId } from './autosave.mjs'

const HISTORY_DEFAULT_LIMIT = 100

const MUTABLE_FIELDS = Object.freeze({
  highlight: ['style', 'textAnchor'],
  underline: ['style', 'textAnchor'],
  'anchored-note': ['document', 'placement', 'textAnchor'],
  'text-box': ['document', 'placement'],
  commentary: ['document'],
})

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value))
}

function sameValue(left, right) {
  return stableStringify(left) === stableStringify(right)
}

export function personalTextAnchorToInput(anchor) {
  return {
    paperId: anchor.paperId,
    sourceRevision: anchor.sourceRevision,
    sourceProjectionVersion: anchor.sourceProjectionVersion,
    segments: anchor.segments.map((segment) => ({
      streamId: segment.streamId,
      start: segment.start,
      end: segment.end,
      exactText: segment.exactText,
    })),
  }
}

/*
 * Converts a stored object back into the create input that rebuilds it. The
 * server recomputes anchor context, so only the client-owned fields travel.
 */
export function personalObjectToCreateInput(object, id = object.id) {
  const input = { id, type: object.type }
  if (object.textAnchor) input.textAnchor = personalTextAnchorToInput(object.textAnchor)
  if (object.style) input.style = clone(object.style)
  if (object.document) input.document = clone(object.document)
  if (object.placement) input.placement = clone(object.placement)
  if (object.target) input.target = clone(object.target)
  return input
}

function comparableFields(input) {
  if (!input) return null
  const fields = { type: input.type }
  for (const key of MUTABLE_FIELDS[input.type]) {
    if (input[key] !== undefined) fields[key] = input[key]
  }
  if (input.target) fields.target = input.target
  return fields
}

function patchBetween(from, to) {
  const patch = {}
  for (const key of MUTABLE_FIELDS[to.type]) {
    if (!sameValue(from[key], to[key])) patch[key] = clone(to[key])
  }
  return patch
}

/*
 * Undo history for one layer session. Entries refer to logical ids because
 * the server tombstones deleted ids forever: undoing a delete re-creates the
 * object under a fresh physical id, and later entries follow it through the
 * logical-to-physical map instead of naming a dead id.
 *
 * `undo()`/`redo()` only plan operations. The caller applies them and then
 * calls `commit()` on success, so a rejected apply leaves history unchanged.
 */
export function createPersonalLayerHistory({ createId = createPersonalMutationId, limit = HISTORY_DEFAULT_LIMIT } = {}) {
  let past = []
  let future = []
  const physicalByLogical = new Map()
  const logicalByPhysical = new Map()

  function logicalFor(physicalId) {
    const known = logicalByPhysical.get(physicalId)
    if (known) return known
    logicalByPhysical.set(physicalId, physicalId)
    physicalByLogical.set(physicalId, physicalId)
    return physicalId
  }

  function bind(logicalId, physicalId) {
    const previous = physicalByLogical.get(logicalId)
    if (previous) logicalByPhysical.delete(previous)
    physicalByLogical.set(logicalId, physicalId)
    logicalByPhysical.set(physicalId, logicalId)
  }

  function describe(objects, operations) {
    const byId = new Map(objects.map((object) => [object.id, personalObjectToCreateInput(object)]))
    const changes = new Map()
    for (const operation of operations) {
      const physicalId = operation.op === 'create' ? operation.object.id : operation.objectId
      const logicalId = logicalFor(physicalId)
      const current = byId.has(physicalId) ? byId.get(physicalId) : null
      if (!changes.has(logicalId)) changes.set(logicalId, { logicalId, before: clone(current), after: null })
      let next
      if (operation.op === 'create') next = clone(operation.object)
      else if (operation.op === 'delete') next = null
      else next = { ...current, ...clone(operation.patch) }
      if (next) byId.set(physicalId, next)
      else byId.delete(physicalId)
      changes.get(logicalId).after = clone(next)
    }
    return [...changes.values()].filter((change) => !sameValue(change.before, change.after))
  }

  function planTransition(objects, changes, direction) {
    const byPhysical = new Map(objects.map((object) => [object.id, personalObjectToCreateInput(object)]))
    const ordered = direction === 'undo' ? [...changes].reverse() : changes
    const operations = []
    const rebinds = []
    for (const change of ordered) {
      const from = direction === 'undo' ? change.after : change.before
      const to = direction === 'undo' ? change.before : change.after
      const physicalId = physicalByLogical.get(change.logicalId)
      const current = physicalId && byPhysical.has(physicalId) ? byPhysical.get(physicalId) : null
      // The layer moved on without this history (conflict resolution,
      // discarded draft), so replaying the entry would overwrite real work.
      if (!sameValue(comparableFields(current), comparableFields(from))) return null
      if (!to) {
        operations.push({ op: 'delete', objectId: physicalId })
      } else if (!from) {
        const freshId = createId()
        operations.push({ op: 'create', object: { ...clone(to), id: freshId } })
        rebinds.push([change.logicalId, freshId])
      } else {
        const patch = patchBetween(from, to)
        if (Object.keys(patch).length > 0) operations.push({ op: 'update', objectId: physicalId, patch })
      }
    }
    return { operations, rebinds }
  }

  function planStep(objects, direction) {
    const stack = direction === 'undo' ? past : future
    const entry = stack[stack.length - 1]
    if (!entry) return { ok: false, code: 'HISTORY_EMPTY' }
    const plan = planTransition(objects, entry.changes, direction)
    if (!plan) {
      past = []
      future = []
      return { ok: false, code: 'HISTORY_STALE' }
    }
    let committed = false
    return {
      ok: true,
      operations: plan.operations,
      commit() {
        if (committed || stack[stack.length - 1] !== entry) return
        committed = true
        for (const [logicalId, physicalId] of plan.rebinds) bind(logicalId, physicalId)
        stack.pop()
        const nextEntry = { ...entry, mergeKey: null }
        if (direction === 'undo') future.push(nextEntry)
        else past.push(nextEntry)
      },
    }
  }

  return {
    /*
     * Records one user action. `objects` is the layer before the operations
     * were applied. Consecutive records with the same mergeKey collapse into
     * one step, so a typing session or a drag undoes as a whole.
     */
    record(objects, operations, { mergeKey = null } = {}) {
      const changes = describe(objects, operations)
      if (changes.length === 0) return
      future = []
      const last = past[past.length - 1]
      if (mergeKey && last && last.mergeKey === mergeKey) {
        const merged = new Map(last.changes.map((change) => [change.logicalId, { ...change }]))
        for (const change of changes) {
          const existing = merged.get(change.logicalId)
          if (existing) existing.after = change.after
          else merged.set(change.logicalId, change)
        }
        const kept = [...merged.values()].filter((change) => !sameValue(change.before, change.after))
        if (kept.length === 0) past.pop()
        else past[past.length - 1] = { mergeKey, changes: kept }
        return
      }
      past.push({ mergeKey, changes })
      if (past.length > limit) past = past.slice(past.length - limit)
    },
    // Ends a merge run so the next record with the same key starts a new step.
    seal() {
      const last = past[past.length - 1]
      if (last && last.mergeKey) past[past.length - 1] = { ...last, mergeKey: null }
    },
    undo(objects) {
      return planStep(objects, 'undo')
    },
    redo(objects) {
      return planStep(objects, 'redo')
    },
    currentId(logicalOrPhysicalId) {
      const logicalId = logicalByPhysical.get(logicalOrPhysicalId) ?? logicalOrPhysicalId
      return physicalByLogical.get(logicalId) ?? logicalOrPhysicalId
    },
    clear() {
      past = []
      future = []
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
  }
}
