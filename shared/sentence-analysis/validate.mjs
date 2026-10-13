import { LIMITS, SCHEMA_VERSION, TOKENIZER_VERSION } from './constants.mjs'
import {
  CONNECTORS,
  FORMS,
  LAYER_FORMS,
  MARKS,
  NONFINITE_FORMS,
  OBSTACLES,
  isLexicalObstacle,
  RELATION_KINDS,
  RESTORE_KINDS,
  ROLES,
  SENSES,
  VOICES,
} from './enums.mjs'
import { tokenizeSentence } from './tokenize.mjs'

const TOP_FIELDS = new Set([
  'schemaVersion', 'tokenizerVersion', 'source', 'producer', 'status',
  'unavailableReason', 'tokens', 'rootClauseIds', 'units', 'relations',
  'restores', 'translation', 'gaps',
])
const SOURCE_FIELDS = new Set(['paperId', 'sourceRevision', 'streamId', 'start', 'end', 'sentenceText'])
const PRODUCER_FIELDS = new Set(['kind', 'id'])
const TOKEN_FIELDS = new Set(['index', 'start', 'end', 'text', 'kind'])
const UNIT_FIELDS = new Set([
  'id', 'spans', 'form', 'role', 'layerId', 'parentId', 'sense', 'connector',
  'obstacles', 'marks', 'noteZh', 'translationRanges', 'collocationSpans', 'focusObstacles',
  'voice', 'actionZh',
])
const SPAN_FIELDS = new Set(['start', 'end'])
const RANGE_FIELDS = new Set(['start', 'end', 'quote'])
const RELATION_FIELDS = new Set(['id', 'kind', 'from', 'to', 'certainty', 'implied', 'noteZh'])
const RESTORE_FIELDS = new Set(['id', 'unitId', 'scopeId', 'kind', 'segments'])
const SOURCE_SEGMENT_FIELDS = new Set(['start', 'end', 'lowercase'])
const INSERTED_SEGMENT_FIELDS = new Set(['text'])
const TRANSLATION_FIELDS = new Set(['textZh'])
const ID_RE = /^[a-z][a-z0-9-]{0,39}$/

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function byteLength(value) {
  const json = JSON.stringify(value)
  if (typeof Buffer !== 'undefined') return Buffer.byteLength(json)
  return new TextEncoder().encode(json).length
}

function splitsSurrogate(text, start, end) {
  const trail = (index) => {
    if (index < 0 || index >= text.length) return false
    const code = text.charCodeAt(index)
    return code >= 0xDC00 && code <= 0xDFFF
  }
  return trail(start) || trail(end)
}

export function validateSentenceAnalysis(value) {
  const errors = []
  const push = (code, path, message) => errors.push({ code, path, message })

  if (!isObject(value)) {
    push('SCHEMA_VERSION', '', 'analysis must be an object')
    return { ok: false, errors }
  }

  for (const key of Object.keys(value)) {
    if (!TOP_FIELDS.has(key)) push('UNKNOWN_FIELD', key, `unexpected field ${key}`)
  }

  if (value.schemaVersion !== SCHEMA_VERSION) {
    push('SCHEMA_VERSION', 'schemaVersion', `schemaVersion must be ${SCHEMA_VERSION}`)
  }
  if (value.tokenizerVersion !== TOKENIZER_VERSION) {
    push('SCHEMA_VERSION', 'tokenizerVersion', `tokenizerVersion must be ${TOKENIZER_VERSION}`)
  }

  const source = value.source
  let sentenceText = ''
  if (!isObject(source)) {
    push('SOURCE_TEXT', 'source', 'source must be an object')
  } else {
    for (const key of Object.keys(source)) {
      if (!SOURCE_FIELDS.has(key)) push('UNKNOWN_FIELD', `source.${key}`, `unexpected field ${key}`)
    }
    sentenceText = typeof source.sentenceText === 'string' ? source.sentenceText : ''
    if (typeof source.sentenceText !== 'string' || source.sentenceText.length === 0) {
      push('SOURCE_TEXT', 'source.sentenceText', 'sentenceText must be a non-empty string')
    } else if (source.sentenceText !== source.sentenceText.trim()) {
      push('SOURCE_TEXT', 'source.sentenceText', 'sentenceText must not have leading or trailing whitespace')
    } else if (source.sentenceText.length > LIMITS.sentenceText) {
      push('SOURCE_TEXT', 'source.sentenceText', 'sentenceText exceeds the length limit')
      push('SIZE_LIMIT', 'source.sentenceText', 'sentenceText exceeds the length limit')
    }
    for (const key of ['paperId', 'sourceRevision', 'streamId']) {
      if (typeof source[key] !== 'string') push('SOURCE_TEXT', `source.${key}`, `${key} must be a string`)
    }
    if (!Number.isInteger(source.start) || !Number.isInteger(source.end) || source.end < source.start) {
      push('SOURCE_TEXT', 'source', 'source offsets must be a half-open integer range')
    }
  }

  if (!isObject(value.producer)) {
    push('BAD_ENUM', 'producer', 'producer must be an object')
  } else {
    for (const key of Object.keys(value.producer)) {
      if (!PRODUCER_FIELDS.has(key)) push('UNKNOWN_FIELD', `producer.${key}`, `unexpected field ${key}`)
    }
    if (value.producer.kind !== 'fixture' && value.producer.kind !== 'model') {
      push('BAD_ENUM', 'producer.kind', 'producer.kind must be fixture or model')
    }
    if (typeof value.producer.id !== 'string' || value.producer.id.length === 0) {
      push('BAD_ENUM', 'producer.id', 'producer.id must be a non-empty string')
    }
  }

  const status = value.status
  if (status !== 'ok' && status !== 'partial' && status !== 'unavailable') {
    push('STATUS_SHAPE', 'status', 'status must be ok, partial, or unavailable')
  }
  const units = Array.isArray(value.units) ? value.units : null
  if (status === 'unavailable') {
    if (typeof value.unavailableReason !== 'string' || value.unavailableReason.length === 0) {
      push('STATUS_SHAPE', 'unavailableReason', 'unavailable analysis requires a reason')
    }
    if (units && units.length > 0) push('STATUS_SHAPE', 'units', 'unavailable analysis must not contain units')
  }
  if (status === 'partial' && (!Array.isArray(value.gaps) || value.gaps.length === 0 || value.gaps.some((gap) => typeof gap !== 'string'))) {
    push('STATUS_SHAPE', 'gaps', 'partial analysis requires gap notes')
  }
  if (status === 'ok' && value.gaps !== undefined) {
    push('STATUS_SHAPE', 'gaps', 'ok analysis must not contain gaps')
  }
  if (Array.isArray(value.gaps)) {
    value.gaps.forEach((gap, index) => {
      if (typeof gap !== 'string') push('STATUS_SHAPE', `gaps[${index}]`, 'gap notes must be strings')
    })
  }

  let expectedTokens = null
  if (typeof sentenceText === 'string' && sentenceText.length > 0 && sentenceText === sentenceText.trim() && sentenceText.length <= LIMITS.sentenceText) {
    try {
      expectedTokens = tokenizeSentence(sentenceText)
    } catch (error) {
      push('SOURCE_TEXT', 'source.sentenceText', error.message)
    }
  }

  const tokens = Array.isArray(value.tokens) ? value.tokens : null
  if (!tokens) {
    push('TOKENS_MISMATCH', 'tokens', 'tokens must be an array')
  } else {
    if (tokens.length > LIMITS.tokens) push('SIZE_LIMIT', 'tokens', 'too many tokens')
    tokens.forEach((token, index) => {
      if (!isObject(token)) {
        push('TOKENS_MISMATCH', `tokens[${index}]`, 'token must be an object')
        return
      }
      for (const key of Object.keys(token)) {
        if (!TOKEN_FIELDS.has(key)) push('UNKNOWN_FIELD', `tokens[${index}].${key}`, `unexpected field ${key}`)
      }
    })
    if (expectedTokens && !sameTokens(tokens, expectedTokens)) {
      push('TOKENS_MISMATCH', 'tokens', 'tokens do not match tokenizeSentence(sentenceText)')
    }
  }

  const tokenCount = tokens?.length ?? 0
  const unitById = new Map()
  const seenIds = new Set()

  function takeId(id, path) {
    if (typeof id !== 'string' || !ID_RE.test(id)) {
      push('BAD_ENUM', path, 'id must match /^[a-z][a-z0-9-]{0,39}$/')
      return false
    }
    if (seenIds.has(id)) {
      push('DUPLICATE_ID', path, `duplicate id ${id}`)
      return false
    }
    seenIds.add(id)
    return true
  }

  if (!units) {
    push('STATUS_SHAPE', 'units', 'units must be an array')
  } else if (units.length > LIMITS.units) {
    push('SIZE_LIMIT', 'units', 'too many units')
  } else {
    units.forEach((unit, index) => {
      const path = `units[${index}]`
      if (!isObject(unit)) {
        push('BAD_SPAN', path, 'unit must be an object')
        return
      }
      for (const key of Object.keys(unit)) {
        if (!UNIT_FIELDS.has(key)) push('UNKNOWN_FIELD', `${path}.${key}`, `unexpected field ${key}`)
      }
      if (takeId(unit.id, `${path}.id`)) unitById.set(unit.id, unit)
      if (!FORMS.includes(unit.form)) push('BAD_ENUM', `${path}.form`, 'invalid form')
      if (unit.role !== null && !ROLES.includes(unit.role)) push('BAD_ENUM', `${path}.role`, 'invalid role')
      if (unit.sense !== undefined && !SENSES.includes(unit.sense)) push('BAD_ENUM', `${path}.sense`, 'invalid sense')
      if (unit.connector !== undefined && !CONNECTORS.includes(unit.connector)) {
        push('BAD_ENUM', `${path}.connector`, 'invalid connector')
      }
      if (unit.sense !== undefined && unit.role !== 'adverbial') {
        push('SENSE_MISPLACED', `${path}.sense`, 'only adverbials may carry sense')
      }
      if (!Array.isArray(unit.obstacles) || unit.obstacles.some((item) => !OBSTACLES.includes(item))) {
        push('BAD_ENUM', `${path}.obstacles`, 'invalid obstacles')
      }
      if (unit.marks !== undefined && (
        !Array.isArray(unit.marks)
        || unit.marks.length === 0
        || unit.marks.some((item) => !MARKS.includes(item))
        || new Set(unit.marks).size !== unit.marks.length
      )) {
        push('BAD_ENUM', `${path}.marks`, 'marks must be distinct known marks')
      }
      if (unit.noteZh !== undefined && (typeof unit.noteZh !== 'string' || unit.noteZh.length > LIMITS.noteZh)) {
        push('SIZE_LIMIT', `${path}.noteZh`, 'noteZh exceeds 80 characters')
      }
      if (unit.voice !== undefined && (!VOICES.includes(unit.voice) || !NONFINITE_FORMS.includes(unit.form))) {
        push('BAD_ENUM', `${path}.voice`, 'voice must be a known voice on a nonfinite structure')
      }
      if (unit.actionZh !== undefined && (typeof unit.actionZh !== 'string' || !unit.actionZh || unit.actionZh.length > LIMITS.actionZh || unit.voice === undefined)) {
        push('SIZE_LIMIT', `${path}.actionZh`, `actionZh needs a voice and at most ${LIMITS.actionZh} characters`)
      }
      if (
        NONFINITE_FORMS.includes(unit.form)
        && unit.role === 'predicate'
        && !(Array.isArray(unit.obstacles) && unit.obstacles.includes('ellipsis'))
      ) {
        push('NONFINITE_AS_PREDICATE', path, 'a nonfinite unit cannot be a predicate unless the clause is elliptical')
      }
      checkSpans(unit.spans, tokenCount, `${path}.spans`, push)
      if (unit.focusObstacles !== undefined && (!Array.isArray(unit.focusObstacles)
        || new Set(unit.focusObstacles).size !== unit.focusObstacles.length
        || unit.focusObstacles.some(item => !OBSTACLES.includes(item) || !Array.isArray(unit.obstacles) || !unit.obstacles.includes(item)))) {
        push('BAD_ENUM', `${path}.focusObstacles`, 'focus obstacles must be a unique subset of the unit obstacles')
      }
      if (unit.collocationSpans !== undefined) {
        checkSpans(unit.collocationSpans, tokenCount, `${path}.collocationSpans`, push)
        if (!Array.isArray(unit.obstacles) || !unit.obstacles.some(isLexicalObstacle)) push('BAD_SPAN', `${path}.collocationSpans`, 'collocation spans require a word-level obstacle')
        if (Array.isArray(unit.collocationSpans) && Array.isArray(unit.spans)
          && !unit.collocationSpans.some(span => span && unit.spans.some(own => own && own.start < span.end && span.start < own.end))) {
          push('BAD_SPAN', `${path}.collocationSpans`, 'collocation must overlap its anchor unit')
        }
      }
      checkTranslationRanges(unit.translationRanges, value.translation, `${path}.translationRanges`, push)
    })
  }

  const relations = Array.isArray(value.relations) ? value.relations : null
  if (!relations) push('STATUS_SHAPE', 'relations', 'relations must be an array')
  else if (relations.length > LIMITS.relations) push('SIZE_LIMIT', 'relations', 'too many relations')
  else {
    relations.forEach((relation, index) => {
      const path = `relations[${index}]`
      if (!isObject(relation)) {
        push('BAD_ENUM', path, 'relation must be an object')
        return
      }
      for (const key of Object.keys(relation)) {
        if (!RELATION_FIELDS.has(key)) push('UNKNOWN_FIELD', `${path}.${key}`, `unexpected field ${key}`)
      }
      takeId(relation.id, `${path}.id`)
      if (!RELATION_KINDS.includes(relation.kind)) push('BAD_ENUM', `${path}.kind`, 'invalid relation kind')
      if (relation.certainty !== 'certain' && relation.certainty !== 'uncertain') {
        push('BAD_ENUM', `${path}.certainty`, 'certainty must be certain or uncertain')
      }
      if (!Array.isArray(relation.to)) push('RELATION_EMPTY', `${path}.to`, 'to must be an array')
      else if (relation.certainty === 'certain' && relation.to.length === 0) {
        push('RELATION_EMPTY', `${path}.to`, 'a certain relation needs a target')
      }
      if (relation.noteZh !== undefined && (typeof relation.noteZh !== 'string' || relation.noteZh.length > LIMITS.noteZh)) {
        push('SIZE_LIMIT', `${path}.noteZh`, 'relation note exceeds 80 characters')
      }
      if (relation.implied !== undefined && (relation.implied !== true || relation.kind !== 'subject-predicate')) {
        push('BAD_ENUM', `${path}.implied`, 'implied is true and only marks a shared predicate')
      }
      const ends = [relation.from, ...(Array.isArray(relation.to) ? relation.to : [])]
      for (const id of ends) {
        if (typeof id !== 'string' || !unitById.has(id)) push('DANGLING_REF', path, `relation endpoint ${id} is missing`)
      }
      if (relation.kind === 'subject-predicate' && ends.every((id) => unitById.has(id))) {
        const endpoints = ends.map((id) => unitById.get(id))
        const layers = new Set(endpoints.map((unit) => unit.layerId ?? null))
        const badRole = endpoints.some((unit) => unit.role !== 'subject' && unit.role !== 'predicate')
        if ((layers.size > 1 && relation.implied !== true) || badRole) {
          push('CROSS_LAYER_SP', path, 'subject-predicate must stay inside one layer and join a subject with a predicate')
        }
      }
    })
  }

  const restores = Array.isArray(value.restores) ? value.restores : null
  if (!restores) push('STATUS_SHAPE', 'restores', 'restores must be an array')
  else if (restores.length > LIMITS.restores) push('SIZE_LIMIT', 'restores', 'too many restores')
  else {
    restores.forEach((restore, index) => {
      const path = `restores[${index}]`
      if (!isObject(restore)) {
        push('BAD_ENUM', path, 'restore must be an object')
        return
      }
      for (const key of Object.keys(restore)) {
        if (!RESTORE_FIELDS.has(key)) push('UNKNOWN_FIELD', `${path}.${key}`, `unexpected field ${key}`)
      }
      takeId(restore.id, `${path}.id`)
      if (!unitById.has(restore.unitId)) push('DANGLING_REF', `${path}.unitId`, 'restore unit is missing')
      if (!RESTORE_KINDS.includes(restore.kind)) push('BAD_ENUM', `${path}.kind`, 'invalid restore kind')
      const scope = unitById.get(restore.scopeId)
      if (!scope) push('DANGLING_REF', `${path}.scopeId`, 'restore scope is missing')
      else if (!LAYER_FORMS.includes(scope.form)) push('RESTORE_SEGMENT', `${path}.scopeId`, 'restore scope must be a clause or a layer')
      checkRestoreSegments(restore.segments, scope ? coverageOf(scope) : null, path, push)
    })
  }

  if (value.translation === null) {
    // no ranges should remain; checked per unit
  } else if (!isObject(value.translation)) {
    push('TRANSLATION_RANGE', 'translation', 'translation must be an object or null')
  } else {
    for (const key of Object.keys(value.translation)) {
      if (!TRANSLATION_FIELDS.has(key)) push('UNKNOWN_FIELD', `translation.${key}`, `unexpected field ${key}`)
    }
    if (typeof value.translation.textZh !== 'string') {
      push('TRANSLATION_RANGE', 'translation.textZh', 'textZh must be a string')
    } else if (value.translation.textZh.length > LIMITS.translationTextZh) {
      push('SIZE_LIMIT', 'translation.textZh', 'translation exceeds 1000 characters')
    }
  }

  const rootIds = Array.isArray(value.rootClauseIds) ? value.rootClauseIds : null
  if (!rootIds) push('ROOT_INVALID', 'rootClauseIds', 'rootClauseIds must be an array')
  else if (status !== 'unavailable' && rootIds.length === 0) {
    push('ROOT_INVALID', 'rootClauseIds', 'a usable analysis needs a root clause')
  } else {
    for (const id of rootIds) {
      const root = unitById.get(id)
      if (!root || root.form !== 'clause' || root.role !== null || root.layerId !== null || root.parentId !== null) {
        push('ROOT_INVALID', 'rootClauseIds', `root ${id} must be a clause with null role, layer, and parent`)
      }
    }
  }

  if (units) {
    for (const unit of units) {
      if (!unit || typeof unit.id !== 'string') continue
      const isRoot = rootIds?.includes(unit.id)
      if (!isRoot && unit.role === null && !unit.connector) {
        push('ROLE_MISSING', unit.id, 'a non-root unit needs a role or a connector')
      }
      if (unit.layerId !== null && unit.layerId !== undefined) {
        const layer = unitById.get(unit.layerId)
        if (!layer) push('DANGLING_REF', unit.id, `layer ${unit.layerId} is missing`)
        else if (!LAYER_FORMS.includes(layer.form)) {
          push('LAYER_INVALID', unit.id, 'layer must be a clause or a nonfinite unit')
        }
      }
      if (unit.parentId !== null && unit.parentId !== undefined && !unitById.has(unit.parentId)) {
        push('DANGLING_REF', unit.id, `parent ${unit.parentId} is missing`)
      }
    }
  }

  if (hasCycle([...unitById.keys()], (id) => unitById.get(id)?.parentId || null)) {
    push('PARENT_CYCLE', 'parentId', 'parentId forms a cycle')
  }
  if (hasCycle([...unitById.keys()], (id) => unitById.get(id)?.layerId || null)) {
    push('PARENT_CYCLE', 'layerId', 'layerId forms a cycle')
  }

  for (const id of unitById.keys()) {
    const depth = parentDepth(id, unitById)
    if (depth > LIMITS.depth) push('DEPTH_LIMIT', id, 'parent chain is too deep')
  }

  if (units && !errors.some((error) => error.code === 'PARENT_CYCLE')) {
    for (const unit of units) {
      if (!unit?.parentId || !unitById.has(unit.parentId)) continue
      const parentTokens = coverageOf(unitById.get(unit.parentId))
      const ownTokens = coverageOf(unit)
      for (const token of ownTokens) {
        if (!parentTokens.has(token)) {
          push('CONTAINMENT', unit.id, 'a child unit must stay inside its parent')
          break
        }
      }
    }
  }

  if (byteLength(value) > LIMITS.serializedBytes) {
    push('SIZE_LIMIT', '', 'serialized analysis exceeds 128 KiB')
  }

  return errors.length === 0 ? { ok: true, value } : { ok: false, errors }
}

function sameTokens(actual, expected) {
  if (actual.length !== expected.length) return false
  return actual.every((token, index) => {
    const other = expected[index]
    return token.index === other.index
      && token.start === other.start
      && token.end === other.end
      && token.text === other.text
      && token.kind === other.kind
  })
}

function checkSpans(spans, tokenCount, path, push) {
  if (!Array.isArray(spans) || spans.length === 0) {
    push('BAD_SPAN', path, 'a unit needs at least one span')
    return
  }
  let previousEnd = -1
  spans.forEach((span, index) => {
    if (!isObject(span)) {
      push('BAD_SPAN', `${path}[${index}]`, 'span must be an object')
      return
    }
    for (const key of Object.keys(span)) {
      if (!SPAN_FIELDS.has(key)) push('UNKNOWN_FIELD', `${path}[${index}].${key}`, `unexpected field ${key}`)
    }
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end) || span.end <= span.start) {
      push('BAD_SPAN', `${path}[${index}]`, 'span must be a non-empty half-open range')
      return
    }
    if (span.start < 0 || span.end > tokenCount) push('BAD_SPAN', `${path}[${index}]`, 'span is outside the token list')
    if (span.start < previousEnd) push('BAD_SPAN', `${path}[${index}]`, 'spans must be ordered and must not overlap')
    previousEnd = span.end
  })
}

function checkRestoreSegments(segments, scopeTokens, path, push) {
  if (!Array.isArray(segments) || segments.length === 0) {
    push('RESTORE_SEGMENT', `${path}.segments`, 'restore needs segments')
    return
  }
  const used = new Set()
  let reused = 0
  segments.forEach((segment, index) => {
    const segmentPath = `${path}.segments[${index}]`
    if (!isObject(segment)) {
      push('RESTORE_SEGMENT', segmentPath, 'segment must be an object')
      return
    }
    const source = 'start' in segment || 'end' in segment
    const fields = source ? SOURCE_SEGMENT_FIELDS : INSERTED_SEGMENT_FIELDS
    for (const key of Object.keys(segment)) {
      if (!fields.has(key)) push('UNKNOWN_FIELD', `${segmentPath}.${key}`, `unexpected field ${key}`)
    }
    if (!source) {
      if (typeof segment.text !== 'string' || !segment.text.trim() || segment.text.length > LIMITS.restoreInsert) {
        push('RESTORE_SEGMENT', segmentPath, 'an inserted segment needs short non-empty text')
      }
      return
    }
    if (segment.lowercase !== undefined && segment.lowercase !== true) push('RESTORE_SEGMENT', segmentPath, 'lowercase is true when present')
    if (!Number.isInteger(segment.start) || !Number.isInteger(segment.end) || segment.end <= segment.start) {
      push('RESTORE_SEGMENT', segmentPath, 'a source segment is a non-empty token range')
      return
    }
    reused += 1
    for (let token = segment.start; token < segment.end; token += 1) {
      if (scopeTokens && !scopeTokens.has(token)) {
        push('RESTORE_SEGMENT', segmentPath, 'a source segment must stay inside the restore scope')
        return
      }
      if (used.has(token)) {
        push('RESTORE_SEGMENT', segmentPath, 'a source word may appear only once')
        return
      }
      used.add(token)
    }
  })
  if (reused === 0) push('RESTORE_SEGMENT', `${path}.segments`, 'a restore must reuse words of the sentence')
}

function checkTranslationRanges(ranges, translation, path, push) {
  if (!Array.isArray(ranges)) {
    push('TRANSLATION_RANGE', path, 'translationRanges must be an array')
    return
  }
  if (ranges.length === 0) return
  if (!isObject(translation) || typeof translation.textZh !== 'string') {
    push('TRANSLATION_RANGE', path, 'translation ranges require translation.textZh')
    return
  }
  ranges.forEach((range, index) => {
    const rangePath = `${path}[${index}]`
    if (!isObject(range)) {
      push('TRANSLATION_RANGE', rangePath, 'range must be an object')
      return
    }
    for (const key of Object.keys(range)) {
      if (!RANGE_FIELDS.has(key)) push('UNKNOWN_FIELD', `${rangePath}.${key}`, `unexpected field ${key}`)
    }
    if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || typeof range.quote !== 'string') {
      push('TRANSLATION_RANGE', rangePath, 'range needs integer offsets and a quote')
      return
    }
    if (range.start < 0 || range.end > translation.textZh.length || range.end < range.start || splitsSurrogate(translation.textZh, range.start, range.end)) {
      push('TRANSLATION_RANGE', rangePath, 'range is out of bounds or splits a surrogate pair')
      return
    }
    if (translation.textZh.slice(range.start, range.end) !== range.quote) {
      push('TRANSLATION_RANGE', rangePath, 'quote does not match the translation slice')
    }
  })
}

function coverageOf(unit) {
  const covered = new Set()
  if (!Array.isArray(unit?.spans)) return covered
  for (const span of unit.spans) {
    if (!Number.isInteger(span?.start) || !Number.isInteger(span?.end)) continue
    for (let index = span.start; index < span.end; index += 1) covered.add(index)
  }
  return covered
}

function hasCycle(ids, next) {
  for (const start of ids) {
    const seen = new Set()
    let current = next(start)
    while (current) {
      if (current === start || seen.has(current)) return true
      seen.add(current)
      current = next(current)
    }
  }
  return false
}

function parentDepth(id, unitById) {
  let depth = 0
  const seen = new Set([id])
  let current = unitById.get(id)
  while (current?.parentId) {
    if (seen.has(current.parentId)) return depth
    seen.add(current.parentId)
    depth += 1
    current = unitById.get(current.parentId)
  }
  return depth
}
