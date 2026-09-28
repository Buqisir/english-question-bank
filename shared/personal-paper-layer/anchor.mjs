import { findStream } from '../paper-selection/sourceProjection.mjs'
import { isLeadSurrogate, isTrailSurrogate } from '../paper-selection/utf16.mjs'
import {
  PERSONAL_ANCHOR_CONTEXT_UTF16,
  PERSONAL_ANCHOR_MAX_SEGMENTS,
  PERSONAL_ANCHOR_MAX_SELECTED_UTF16,
  PERSONAL_TEXT_ANCHOR_VERSION,
} from './constants.mjs'
import { personalLayerError } from './errors.mjs'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function contextStart(text, start) {
  let index = Math.max(0, start - PERSONAL_ANCHOR_CONTEXT_UTF16)
  if (isTrailSurrogate(text, index)) index += 1
  return index
}

function contextEnd(text, end) {
  let index = Math.min(text.length, end + PERSONAL_ANCHOR_CONTEXT_UTF16)
  if (index < text.length && isLeadSurrogate(text, index - 1)) index -= 1
  return index
}

function rangeIsValid(text, start, end) {
  return Number.isSafeInteger(start)
    && Number.isSafeInteger(end)
    && start >= 0
    && end > start
    && end <= text.length
    && !isTrailSurrogate(text, start)
    && !isTrailSurrogate(text, end)
}

function leafIdsForRange(stream, start, end) {
  return stream.leaves
    .filter((leaf) => leaf.start < end && leaf.end > start)
    .map((leaf) => leaf.id)
}

/*
 * Rebuilds a text anchor from the trusted source projection. Client-sent
 * exactText must equal the source slice; prefix/suffix and leaf identity are
 * always recomputed server-side so they cannot be forged.
 */
export function normalizeTextAnchor(source, input) {
  if (!isRecord(input) || !Array.isArray(input.segments)) {
    throw personalLayerError('PERSONAL_ANCHOR_INVALID', 'textAnchor must have segments')
  }
  if (
    input.paperId !== source.paperId
    || input.sourceRevision !== source.sourceRevision
    || input.sourceProjectionVersion !== source.sourceProjectionVersion
  ) {
    throw personalLayerError('PERSONAL_ANCHOR_SOURCE_MISMATCH', 'textAnchor targets another source revision')
  }
  if (input.segments.length === 0) {
    throw personalLayerError('PERSONAL_ANCHOR_INVALID', 'textAnchor needs at least one segment')
  }
  if (input.segments.length > PERSONAL_ANCHOR_MAX_SEGMENTS) {
    throw personalLayerError('PERSONAL_LAYER_LIMIT', 'textAnchor has too many segments')
  }
  const streamOrder = new Map(source.streams.map((stream, index) => [stream.streamId, index]))
  let selectedUnits = 0
  let groupId
  let previous = null
  const segments = input.segments.map((segment) => {
    if (
      !isRecord(segment)
      || typeof segment.streamId !== 'string'
      || typeof segment.exactText !== 'string'
    ) {
      throw personalLayerError('PERSONAL_ANCHOR_INVALID', 'anchor segment is malformed')
    }
    const stream = findStream(source, segment.streamId)
    if (!stream) {
      throw personalLayerError('PERSONAL_ANCHOR_SOURCE_MISMATCH', 'anchor segment names an unknown stream')
    }
    const { start, end } = segment
    if (!rangeIsValid(stream.text, start, end)) {
      throw personalLayerError('PERSONAL_ANCHOR_RANGE_INVALID', 'anchor segment range is invalid')
    }
    const exactText = stream.text.slice(start, end)
    if (exactText !== segment.exactText) {
      throw personalLayerError('PERSONAL_ANCHOR_SOURCE_MISMATCH', 'exactText does not match the source range')
    }
    if (groupId === undefined) groupId = stream.groupId
    else if (groupId !== stream.groupId) {
      throw personalLayerError('PERSONAL_ANCHOR_UNSUPPORTED', 'an anchor cannot span question groups')
    }
    const order = streamOrder.get(stream.streamId)
    if (
      previous
      && (order < previous.order || (order === previous.order && start < previous.end))
    ) {
      throw personalLayerError('PERSONAL_ANCHOR_INVALID', 'anchor segments must be ordered and disjoint')
    }
    previous = { order, end }
    selectedUnits += end - start
    return {
      streamId: stream.streamId,
      start,
      end,
      exactText,
      prefix: stream.text.slice(contextStart(stream.text, start), start),
      suffix: stream.text.slice(end, contextEnd(stream.text, end)),
      leafIds: leafIdsForRange(stream, start, end),
    }
  })
  if (selectedUnits > PERSONAL_ANCHOR_MAX_SELECTED_UTF16) {
    throw personalLayerError('PERSONAL_LAYER_LIMIT', 'textAnchor selects too much text')
  }
  return {
    anchorVersion: PERSONAL_TEXT_ANCHOR_VERSION,
    paperId: source.paperId,
    sourceRevision: source.sourceRevision,
    sourceProjectionVersion: source.sourceProjectionVersion,
    groupId: groupId ?? null,
    segments,
  }
}

/*
 * Checks a stored anchor against the current source without guessing a new
 * location. Any mismatch is reported as needs-reanchor; the caller keeps the
 * object and its content.
 */
export function resolveTextAnchor(source, anchor) {
  const reasons = []
  if (anchor.paperId !== source.paperId) reasons.push('paper-mismatch')
  if (anchor.sourceRevision !== source.sourceRevision) reasons.push('source-revision-changed')
  if (anchor.sourceProjectionVersion !== source.sourceProjectionVersion) {
    reasons.push('projection-version-changed')
  }
  for (const segment of anchor.segments) {
    const stream = findStream(source, segment.streamId)
    if (!stream) {
      reasons.push('stream-missing')
      continue
    }
    if (!rangeIsValid(stream.text, segment.start, segment.end)) {
      reasons.push('range-invalid')
      continue
    }
    if (stream.text.slice(segment.start, segment.end) !== segment.exactText) {
      reasons.push('text-mismatch')
    }
  }
  const unique = [...new Set(reasons)]
  return unique.length === 0
    ? { status: 'ok', reasons: [] }
    : { status: 'needs-reanchor', reasons: unique }
}

export function textAnchorsCoverSameRange(left, right) {
  if (left.segments.length !== right.segments.length) return false
  return left.segments.every((segment, index) => {
    const other = right.segments[index]
    return segment.streamId === other.streamId
      && segment.start === other.start
      && segment.end === other.end
  })
}
