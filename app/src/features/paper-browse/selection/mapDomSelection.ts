type SourceLeaf = {
  kind: string
  id: string
  start: number
  end: number
}

type SourceStream = {
  streamId: string
  text: string
  role: string
  groupId: string | null
  leaves: SourceLeaf[]
}

export type PaperSelectionSourceView = {
  paperId: string
  sourceRevision: string
  streams: readonly SourceStream[]
}

export type MappedSegment = {
  streamId: string
  start: number
  end: number
  selectedText: string
}

const FORBIDDEN_SELECTOR = [
  'input',
  'textarea',
  '[contenteditable="true"]',
  '.paper-browse-lecture',
  '.paper-browse-rail',
  '.app-topbar',
  '.paper-browse-audio',
  '.ps-question-no',
  '.ps-option-label',
  '[data-paper-annotation-id]',
].join(',')

function closestElement(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element
  return node.parentElement
}

function textOf(el: Element): string {
  return el.textContent ?? ''
}

function isForbidden(node: Node): boolean {
  const el = closestElement(node)
  if (!el) return true
  return Boolean(el.closest(FORBIDDEN_SELECTOR))
}

function groupIdNear(el: Element): string | null {
  const card = el.closest('.paper-browse-group-card')
  return card?.getAttribute('data-paper-browse-anchor') || null
}

function leafTarget(el: Element): { kind: string; id: string; root: Element } | null {
  const optionText = el.closest('.ps-option-text')
  if (optionText) {
    const option = optionText.closest('[data-paper-option-label]')
    const question = optionText.closest('[data-paper-question-id]')
    const label = option?.getAttribute('data-paper-option-label')
    const questionId = question?.getAttribute('data-paper-question-id')
    if (label && questionId) {
      return { kind: 'option', id: `${questionId}:${label}`, root: optionText }
    }
    if (label) return { kind: 'option-bank', id: label, root: optionText }
  }
  const cell = el.closest('[data-canonical-cell-id]')
  if (cell) {
    return { kind: 'table-cell', id: cell.getAttribute('data-canonical-cell-id') || '', root: cell }
  }
  const paragraph = el.closest('[data-paper-paragraph-id], [data-canonical-block-id]')
  if (paragraph && paragraph.getAttribute('data-canonical-block-kind') !== 'table') {
    const id = paragraph.getAttribute('data-paper-paragraph-id')
      || paragraph.getAttribute('data-canonical-block-id')
      || ''
    return { kind: 'paragraph', id, root: paragraph }
  }
  const question = el.closest('[data-paper-question-id]')
  if (question && !el.closest('[data-paper-option-label]')) {
    const id = question.getAttribute('data-paper-question-id') || ''
    return { kind: 'question-stem', id, root: question }
  }
  return null
}

function findStream(source: PaperSelectionSourceView, target: { kind: string; id: string }, groupId: string | null) {
  return source.streams.find((stream) => (
    (groupId == null || stream.groupId === groupId)
    && stream.leaves.some((leaf) => leaf.kind === target.kind && leaf.id === target.id)
  )) || source.streams.find((stream) => (
    stream.leaves.some((leaf) => leaf.kind === target.kind && leaf.id === target.id)
  )) || null
}

function offsetInRoot(root: Element, node: Node, offset: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let count = 0
  let current = walker.nextNode()
  while (current) {
    if (current === node) return count + offset
    count += current.textContent?.length ?? 0
    current = walker.nextNode()
  }
  return -1
}

export function mapDomRangeToSegments(
  range: Range,
  source: PaperSelectionSourceView,
  host: Element,
): MappedSegment[] | null {
  if (!host.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== host) {
    return null
  }
  if (isForbidden(range.startContainer) || isForbidden(range.endContainer)) return null

  const startEl = closestElement(range.startContainer)
  const endEl = closestElement(range.endContainer)
  if (!startEl || !endEl) return null

  const startTarget = leafTarget(startEl)
  const endTarget = leafTarget(endEl)
  if (!startTarget || !endTarget) return null

  const walkRoot = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentNode
  if (!walkRoot) return null
  const walker = document.createTreeWalker(
    walkRoot,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT
        if (isForbidden(node)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    },
  )

  type Piece = {
    streamId: string
    streamStart: number
    streamEnd: number
    text: string
  }
  const pieces: Piece[] = []
  let node = walker.nextNode()
  while (node) {
    if (isForbidden(node)) return null
    const el = closestElement(node)
    if (!el) return null
    const target = leafTarget(el)
    if (!target || !target.id) return null
    const groupId = groupIdNear(el)
    const stream = findStream(source, target, groupId)
    if (!stream) return null
    const leaf = stream.leaves.find((item) => item.kind === target.kind && item.id === target.id)
    if (!leaf) return null
    const rootText = textOf(target.root)
    const leafText = stream.text.slice(leaf.start, leaf.end)
    if (rootText !== leafText && !rootText.includes(leafText)) return null
    const localBase = rootText === leafText ? 0 : rootText.indexOf(leafText)
    if (localBase < 0) return null

    const nodeStart = offsetInRoot(target.root, node, 0)
    const selectedStart = node === range.startContainer
      ? offsetInRoot(target.root, node, range.startOffset)
      : nodeStart
    const selectedEnd = node === range.endContainer
      ? offsetInRoot(target.root, node, range.endOffset)
      : nodeStart + (node.textContent?.length ?? 0)
    if (selectedStart < 0 || selectedEnd < 0) return null
    const overlapStart = Math.max(selectedStart, localBase)
    const overlapEnd = Math.min(selectedEnd, localBase + leafText.length)
    if (overlapEnd <= overlapStart) {
      node = walker.nextNode()
      continue
    }
    const streamStart = leaf.start + (overlapStart - localBase)
    const streamEnd = leaf.start + (overlapEnd - localBase)
    pieces.push({
      streamId: stream.streamId,
      streamStart,
      streamEnd,
      text: stream.text.slice(streamStart, streamEnd),
    })
    node = walker.nextNode()
  }

  if (pieces.length === 0) return null
  const segments: MappedSegment[] = []
  for (const piece of pieces) {
    const last = segments[segments.length - 1]
    if (last && last.streamId === piece.streamId && last.end === piece.streamStart) {
      last.end = piece.streamEnd
      last.selectedText += piece.text
    } else if (last && last.streamId !== piece.streamId) {
      segments.push({
        streamId: piece.streamId,
        start: piece.streamStart,
        end: piece.streamEnd,
        selectedText: piece.text,
      })
    } else if (!last) {
      segments.push({
        streamId: piece.streamId,
        start: piece.streamStart,
        end: piece.streamEnd,
        selectedText: piece.text,
      })
    } else {
      return null
    }
  }
  if (segments.some((segment) => !segment.selectedText)) return null
  return segments
}

export function selectionRange(): Range | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  return selection.getRangeAt(0)
}
