import { digestJson, stableStringify } from '../paper-canonical/stable.mjs'
import { validatePersonalTextDocument } from '../personal-text/document.mjs'
import { normalizeTextAnchor, textAnchorsCoverSameRange } from './anchor.mjs'
import {
  PERSONAL_HIGHLIGHT_COLORS,
  PERSONAL_ID_PATTERN,
  PERSONAL_LAYER_MAX_CONTENT_BYTES,
  PERSONAL_LAYER_MAX_OBJECTS,
  PERSONAL_LAYER_MAX_OPERATIONS,
  PERSONAL_LAYER_SCHEMA_VERSION,
  PERSONAL_LAYER_SNAPSHOT_VERSION,
  PERSONAL_MARK_TYPES,
  PERSONAL_OBJECT_TYPES,
  PERSONAL_PLACEMENT_MAX_MM,
  PERSONAL_PLACEMENT_MAX_WIDTH_MM,
  PERSONAL_PLACEMENT_MIN_WIDTH_MM,
  PERSONAL_UNDERLINE_INKS,
} from './constants.mjs'
import { personalLayerError } from './errors.mjs'

const LAYOUT_REF_PATTERN = /^[A-Za-z0-9_.:/-]{1,128}$/u

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function onlyKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

export function isPersonalId(value) {
  return typeof value === 'string' && PERSONAL_ID_PATTERN.test(value)
}

function assertId(value, label) {
  if (!isPersonalId(value)) {
    throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', `${label} must match ${PERSONAL_ID_PATTERN}`)
  }
}

function finiteInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function normalizePagePosition(input) {
  if (
    !isRecord(input)
    || !onlyKeys(input, ['kind', 'layoutId', 'pageId', 'xMm', 'yMm', 'widthMm'])
    || typeof input.layoutId !== 'string' || !LAYOUT_REF_PATTERN.test(input.layoutId)
    || typeof input.pageId !== 'string' || !LAYOUT_REF_PATTERN.test(input.pageId)
    || !finiteInRange(input.xMm, 0, PERSONAL_PLACEMENT_MAX_MM)
    || !finiteInRange(input.yMm, 0, PERSONAL_PLACEMENT_MAX_MM)
    || !finiteInRange(input.widthMm, PERSONAL_PLACEMENT_MIN_WIDTH_MM, PERSONAL_PLACEMENT_MAX_WIDTH_MM)
  ) {
    throw personalLayerError('PERSONAL_PLACEMENT_INVALID', 'page-position placement is invalid')
  }
  return {
    kind: 'page-position',
    layoutId: input.layoutId,
    pageId: input.pageId,
    xMm: input.xMm,
    yMm: input.yMm,
    widthMm: input.widthMm,
  }
}

function normalizePlacement(type, input) {
  if (!isRecord(input) || typeof input.kind !== 'string') {
    throw personalLayerError('PERSONAL_PLACEMENT_INVALID', 'placement must have a kind')
  }
  if (input.kind === 'auto-near-anchor') {
    if (type !== 'anchored-note' || !onlyKeys(input, ['kind'])) {
      throw personalLayerError('PERSONAL_PLACEMENT_INVALID', 'auto-near-anchor is only for anchored notes')
    }
    return { kind: 'auto-near-anchor' }
  }
  if (input.kind === 'page-position') return normalizePagePosition(input)
  if (input.kind === 'appendix') {
    if (!onlyKeys(input, ['kind', 'origin'])) {
      throw personalLayerError('PERSONAL_PLACEMENT_INVALID', 'appendix placement has unknown keys')
    }
    // A text box has no source anchor, so its number needs the confirmed page spot.
    if (type === 'text-box' && !input.origin) {
      throw personalLayerError('PERSONAL_PLACEMENT_INVALID', 'a text box in the appendix keeps its page origin')
    }
    return {
      kind: 'appendix',
      origin: input.origin ? normalizePagePosition({ ...input.origin, kind: 'page-position' }) : null,
    }
  }
  throw personalLayerError('PERSONAL_PLACEMENT_INVALID', `unknown placement ${input.kind}`)
}

function normalizeDocument(input) {
  const result = validatePersonalTextDocument(input)
  if (!result.ok) {
    throw personalLayerError('PERSONAL_TEXT_INVALID', result.errors[0].message, result.errors)
  }
  return clone(input)
}

function normalizeStyle(type, input) {
  if (type === 'highlight') {
    if (!isRecord(input) || !onlyKeys(input, ['color']) || !PERSONAL_HIGHLIGHT_COLORS.includes(input.color)) {
      throw personalLayerError('PERSONAL_STYLE_INVALID', 'highlight color is not a preset')
    }
    return { color: input.color }
  }
  if (!isRecord(input) || !onlyKeys(input, ['ink']) || !PERSONAL_UNDERLINE_INKS.includes(input.ink)) {
    throw personalLayerError('PERSONAL_STYLE_INVALID', 'underline ink is not a preset')
  }
  return { ink: input.ink }
}

function sourceHasQuestion(source, groupId, questionId) {
  return source.streams.some((stream) => stream.groupId === groupId && stream.leaves.some(
    (leaf) => (leaf.kind === 'question-stem' && leaf.id === questionId)
      || (leaf.kind === 'option' && leaf.id.startsWith(`${questionId}:`)),
  ))
}

function sourceHasWritingTask(source, groupId) {
  return source.streams.some((stream) => stream.groupId === groupId
    && (stream.role === 'writing-prompt' || stream.role === 'writing-material'))
}

function normalizeCommentaryTarget(source, input) {
  if (!isRecord(input) || typeof input.groupId !== 'string') {
    throw personalLayerError('PERSONAL_TARGET_INVALID', 'commentary target is malformed')
  }
  if (input.kind === 'question') {
    if (
      !onlyKeys(input, ['kind', 'groupId', 'questionId'])
      || typeof input.questionId !== 'string'
      || !sourceHasQuestion(source, input.groupId, input.questionId)
    ) {
      throw personalLayerError('PERSONAL_TARGET_INVALID', 'commentary question is not in this paper')
    }
    return { kind: 'question', groupId: input.groupId, questionId: input.questionId }
  }
  if (input.kind === 'writing-task') {
    if (!onlyKeys(input, ['kind', 'groupId']) || !sourceHasWritingTask(source, input.groupId)) {
      throw personalLayerError('PERSONAL_TARGET_INVALID', 'commentary writing task is not in this paper')
    }
    return { kind: 'writing-task', groupId: input.groupId }
  }
  throw personalLayerError('PERSONAL_TARGET_INVALID', 'commentary target kind is unknown')
}

const CREATE_KEYS = Object.freeze({
  highlight: ['id', 'type', 'textAnchor', 'style'],
  underline: ['id', 'type', 'textAnchor', 'style'],
  'anchored-note': ['id', 'type', 'textAnchor', 'document', 'placement'],
  'text-box': ['id', 'type', 'document', 'placement'],
  commentary: ['id', 'type', 'target', 'document'],
})

const PATCH_KEYS = Object.freeze({
  highlight: ['style', 'textAnchor'],
  underline: ['style', 'textAnchor'],
  'anchored-note': ['document', 'placement', 'textAnchor'],
  'text-box': ['document', 'placement'],
  commentary: ['document'],
})

function normalizeField(source, type, key, value) {
  if (key === 'textAnchor') return normalizeTextAnchor(source, value)
  if (key === 'style') return normalizeStyle(type, value)
  if (key === 'document') return normalizeDocument(value)
  if (key === 'placement') return normalizePlacement(type, value)
  if (key === 'target') return normalizeCommentaryTarget(source, value)
  throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', `unknown field ${key}`)
}

export function normalizePersonalObjectInput(source, input) {
  if (!isRecord(input) || !PERSONAL_OBJECT_TYPES.includes(input.type)) {
    throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'object type is unknown')
  }
  assertId(input.id, 'object id')
  const keys = CREATE_KEYS[input.type]
  if (!onlyKeys(input, keys)) {
    throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', `${input.type} has unknown fields`)
  }
  const object = { id: input.id, type: input.type }
  for (const key of keys.slice(2)) {
    if (input[key] === undefined) {
      throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', `${input.type} needs ${key}`)
    }
    object[key] = normalizeField(source, input.type, key, input[key])
  }
  return object
}

export function createEmptyPersonalLayerState(source) {
  return {
    schemaVersion: PERSONAL_LAYER_SCHEMA_VERSION,
    paperId: source.paperId,
    sourceRevision: source.sourceRevision,
    sourceProjectionVersion: source.sourceProjectionVersion,
    version: 0,
    objects: [],
    deletedObjectIds: [],
  }
}

export function personalLayerContentBytes(objects) {
  const encoder = new TextEncoder()
  return objects.reduce((total, object) => total + encoder.encode(stableStringify(object)).length, 0)
}

function assertUniqueMark(objects, candidate) {
  if (!PERSONAL_MARK_TYPES.includes(candidate.type)) return
  const duplicate = objects.find((object) => object.id !== candidate.id
    && object.type === candidate.type
    && textAnchorsCoverSameRange(object.textAnchor, candidate.textAnchor))
  if (duplicate) {
    throw personalLayerError(
      'PERSONAL_LAYER_DUPLICATE_MARK',
      `a ${candidate.type} already covers this exact range`,
      { objectId: duplicate.id },
    )
  }
}

function assertUniqueCommentary(objects, candidate) {
  if (candidate.type !== 'commentary') return
  const key = stableStringify(candidate.target)
  const duplicate = objects.find((object) => object.id !== candidate.id
    && object.type === 'commentary'
    && stableStringify(object.target) === key)
  if (duplicate) {
    throw personalLayerError(
      'PERSONAL_LAYER_DUPLICATE_COMMENTARY',
      'this question already has personal commentary',
      { objectId: duplicate.id },
    )
  }
}

export function validatePersonalOperations(operations) {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'operations must be a non-empty array')
  }
  if (operations.length > PERSONAL_LAYER_MAX_OPERATIONS) {
    throw personalLayerError('PERSONAL_LAYER_LIMIT', `at most ${PERSONAL_LAYER_MAX_OPERATIONS} operations per batch`)
  }
  for (const operation of operations) {
    if (!isRecord(operation) || !['create', 'update', 'delete'].includes(operation.op)) {
      throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'operation op is unknown')
    }
  }
}

/*
 * Applies one batch atomically to a copy of the layer. Any invalid operation
 * throws and the input state is untouched. Version comparison, idempotency
 * and ownership are the store's job; this function only defines the result.
 */
export function applyPersonalLayerOperations(state, operations, { source, now }) {
  validatePersonalOperations(operations)
  if (
    state.paperId !== source.paperId
    || state.sourceRevision !== source.sourceRevision
    || state.sourceProjectionVersion !== source.sourceProjectionVersion
  ) {
    throw personalLayerError('PERSONAL_ANCHOR_SOURCE_MISMATCH', 'layer belongs to another source revision')
  }
  if (typeof now !== 'string' || Number.isNaN(Date.parse(now))) {
    throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'now must be an ISO timestamp')
  }
  const objects = clone(state.objects)
  const deleted = new Set(state.deletedObjectIds)
  const byId = new Map(objects.map((object, index) => [object.id, index]))
  const affected = new Set()

  for (const operation of operations) {
    if (operation.op === 'create') {
      if (!onlyKeys(operation, ['op', 'object'])) {
        throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'create has unknown fields')
      }
      const normalized = normalizePersonalObjectInput(source, operation.object)
      if (byId.has(normalized.id) || deleted.has(normalized.id)) {
        throw personalLayerError('PERSONAL_LAYER_OBJECT_EXISTS', 'object id was already used', { objectId: normalized.id })
      }
      const object = { ...normalized, revision: 1, createdAt: now, updatedAt: now }
      assertUniqueMark(objects, object)
      assertUniqueCommentary(objects, object)
      byId.set(object.id, objects.length)
      objects.push(object)
      affected.add(object.id)
      continue
    }
    assertId(operation.objectId, 'objectId')
    const index = byId.get(operation.objectId)
    if (index === undefined) {
      throw personalLayerError('PERSONAL_LAYER_OBJECT_MISSING', 'object does not exist', { objectId: operation.objectId })
    }
    if (operation.op === 'delete') {
      if (!onlyKeys(operation, ['op', 'objectId'])) {
        throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'delete has unknown fields')
      }
      objects.splice(index, 1)
      byId.clear()
      objects.forEach((object, position) => byId.set(object.id, position))
      deleted.add(operation.objectId)
      affected.add(operation.objectId)
      continue
    }
    if (!onlyKeys(operation, ['op', 'objectId', 'patch']) || !isRecord(operation.patch)) {
      throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', 'update needs a patch')
    }
    const current = objects[index]
    const allowed = PATCH_KEYS[current.type]
    const keys = Object.keys(operation.patch)
    if (keys.length === 0 || !keys.every((key) => allowed.includes(key))) {
      throw personalLayerError('PERSONAL_LAYER_REQUEST_INVALID', `${current.type} cannot patch ${keys.join(', ')}`)
    }
    const next = { ...current }
    for (const key of keys) next[key] = normalizeField(source, current.type, key, operation.patch[key])
    next.revision = current.revision + 1
    next.updatedAt = now
    assertUniqueMark(objects, next)
    objects[index] = next
    affected.add(next.id)
  }

  if (objects.length > PERSONAL_LAYER_MAX_OBJECTS) {
    throw personalLayerError('PERSONAL_LAYER_LIMIT', `a layer holds at most ${PERSONAL_LAYER_MAX_OBJECTS} objects`)
  }
  if (personalLayerContentBytes(objects) > PERSONAL_LAYER_MAX_CONTENT_BYTES) {
    throw personalLayerError('PERSONAL_LAYER_LIMIT', 'layer content exceeds 8 MiB')
  }
  return {
    state: {
      ...state,
      version: state.version + 1,
      objects,
      deletedObjectIds: [...deleted],
    },
    affectedObjectIds: [...affected],
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child)
    Object.freeze(value)
  }
  return value
}

export function createPersonalLayerSnapshot(state) {
  const objects = clone(state.objects)
  return deepFreeze({
    snapshotVersion: PERSONAL_LAYER_SNAPSHOT_VERSION,
    schemaVersion: state.schemaVersion,
    paperId: state.paperId,
    sourceRevision: state.sourceRevision,
    sourceProjectionVersion: state.sourceProjectionVersion,
    layerVersion: state.version,
    objects,
    objectsDigest: digestJson(objects),
  })
}
