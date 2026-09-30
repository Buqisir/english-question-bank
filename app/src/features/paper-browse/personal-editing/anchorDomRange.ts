import type { PaperSelectionSource, PaperSelectionStream } from '../../../../../shared/paper-selection/sourceProjection.mjs'
import type { PersonalTextAnchorInput } from '../../../../../shared/personal-paper-layer/index.mjs'
import type { MappedSegment } from '../selection/mapDomSelection'

type Leaf = PaperSelectionStream['leaves'][number]

function cssAttr(value: string): string {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/[^a-zA-Z0-9_-]/gu, '\\$&')
}

function groupScope(host: Element, groupId: string | null): Element | null {
  if (!groupId) return host
  return host.querySelector(`.paper-browse-group-card[data-paper-browse-anchor="${cssAttr(groupId)}"]`)
}

/*
 * Finds the DOM root that mapDomSelection's leafTarget() resolves for this
 * leaf, so both directions agree on the same element and text offsets.
 */
function leafRoot(scope: Element, leaf: Leaf): Element | null {
  if (leaf.kind === 'option') {
    const split = leaf.id.lastIndexOf(':')
    if (split <= 0) return null
    const questionId = leaf.id.slice(0, split)
    const label = leaf.id.slice(split + 1)
    const question = scope.querySelector(`[data-paper-question-id="${cssAttr(questionId)}"]`)
    return question?.querySelector(`[data-paper-option-label="${cssAttr(label)}"] .ps-option-text`) ?? null
  }
  if (leaf.kind === 'option-bank') {
    return [...scope.querySelectorAll(`[data-paper-option-label="${cssAttr(leaf.id)}"] .ps-option-text`)]
      .find((element) => !element.closest('[data-paper-question-id]')) ?? null
  }
  if (leaf.kind === 'table-cell') {
    return scope.querySelector(`[data-canonical-cell-id="${cssAttr(leaf.id)}"]`)
  }
  if (leaf.kind === 'paragraph') {
    const id = cssAttr(leaf.id)
    return [...scope.querySelectorAll(`[data-paper-paragraph-id="${id}"], [data-canonical-block-id="${id}"]`)]
      .find((element) => element.getAttribute('data-canonical-block-kind') !== 'table') ?? null
  }
  if (leaf.kind === 'question-stem') {
    return scope.querySelector(`[data-paper-question-id="${cssAttr(leaf.id)}"]`)
  }
  return null
}

function pointAt(root: Element, offset: number, preferNext: boolean): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let consumed = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const length = node.data.length
    const inside = preferNext ? offset < consumed + length : offset <= consumed + length
    if (inside && offset >= consumed) return { node, offset: offset - consumed }
    consumed += length
    node = walker.nextNode() as Text | null
  }
  return null
}

/*
 * Maps one stored segment back to DOM ranges, one per leaf it touches.
 * Returns null when the rendered text no longer matches the source, so a
 * mark is never drawn over the wrong words.
 */
export function segmentToDomRanges(
  host: Element,
  source: PaperSelectionSource,
  segment: { streamId: string; start: number; end: number },
): Range[] | null {
  const stream = source.streams.find((item) => item.streamId === segment.streamId)
  if (!stream) return null
  const scope = groupScope(host, stream.groupId)
  if (!scope) return null
  const ranges: Range[] = []
  for (const leaf of stream.leaves) {
    if (leaf.end <= segment.start || leaf.start >= segment.end) continue
    const root = leafRoot(scope, leaf)
    if (!root) return null
    const rootText = root.textContent ?? ''
    const leafText = stream.text.slice(leaf.start, leaf.end)
    const localBase = rootText === leafText ? 0 : rootText.indexOf(leafText)
    if (localBase < 0) return null
    const from = localBase + Math.max(segment.start, leaf.start) - leaf.start
    const to = localBase + Math.min(segment.end, leaf.end) - leaf.start
    const start = pointAt(root, from, true)
    const end = pointAt(root, to, false)
    if (!start || !end) return null
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    ranges.push(range)
  }
  const drawn = ranges.map((range) => range.toString()).join('')
  const expected = stream.text.slice(segment.start, segment.end).replace(/\n/gu, '')
  if (ranges.length === 0 || drawn.replace(/\n/gu, '') !== expected) return null
  return ranges
}

export function mappedSegmentsToAnchorInput(
  source: PaperSelectionSource,
  segments: readonly MappedSegment[],
): PersonalTextAnchorInput {
  return {
    paperId: source.paperId,
    sourceRevision: source.sourceRevision,
    sourceProjectionVersion: source.sourceProjectionVersion,
    segments: segments.map((segment) => ({
      streamId: segment.streamId,
      start: segment.start,
      end: segment.end,
      exactText: segment.selectedText,
    })),
  }
}
