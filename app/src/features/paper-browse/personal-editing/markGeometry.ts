import type { PersonalLayerSource, PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import { segmentToDomRanges } from './anchorDomRange'

export type LayerRect = { left: number; top: number; width: number; height: number }

export type AnchorGeometry = {
  objectId: string
  rects: LayerRect[]
}

/*
 * A Range's own client rects include whole element boxes when an element is
 * fully inside it, which would paint blocks over headings or option labels.
 * Measuring per text node keeps every rect on glyphs.
 */
export function textRects(range: Range): DOMRect[] {
  const root = range.commonAncestorContainer
  if (root.nodeType === Node.TEXT_NODE) return [...range.getClientRects()]
  // Ranges may live in the paper view's iframe document, not the host window.
  const doc = range.startContainer.ownerDocument ?? document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const rects: DOMRect[] = []
  let node = walker.nextNode() as Text | null
  while (node) {
    if (range.intersectsNode(node) && node.data.length > 0) {
      const part = doc.createRange()
      part.setStart(node, node === range.startContainer ? range.startOffset : 0)
      part.setEnd(node, node === range.endContainer ? range.endOffset : node.data.length)
      if (!part.collapsed) rects.push(...part.getClientRects())
    }
    node = walker.nextNode() as Text | null
  }
  return rects
}

// Joins fragments of one line so a mark is one shape per line, not per text node.
export function mergeLineRects(rects: LayerRect[]): LayerRect[] {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left)
  const merged: LayerRect[] = []
  for (const rect of sorted) {
    const last = merged[merged.length - 1]
    if (
      last
      && Math.abs(last.top - rect.top) < 2
      && Math.abs(last.height - rect.height) < 2
      && rect.left <= last.left + last.width + 2
    ) {
      const right = Math.max(last.left + last.width, rect.left + rect.width)
      last.width = right - last.left
      continue
    }
    merged.push({ ...rect })
  }
  return merged
}

export function measureAnchorRects(
  host: HTMLElement,
  origin: DOMRect,
  source: PersonalLayerSource,
  object: PersonalObject,
): LayerRect[] | null {
  if (!('textAnchor' in object)) return null
  const rects: LayerRect[] = []
  for (const segment of object.textAnchor.segments) {
    const ranges = segmentToDomRanges(host, source, segment)
    if (!ranges) return null
    for (const range of ranges) {
      for (const rect of textRects(range)) {
        if (rect.width < 0.5 || rect.height < 0.5) continue
        rects.push({
          left: rect.left - origin.left,
          top: rect.top - origin.top,
          width: rect.width,
          height: rect.height,
        })
      }
    }
  }
  return rects.length > 0 ? mergeLineRects(rects) : null
}

export function rectContainsPoint(rect: LayerRect, x: number, y: number, slop = 0) {
  return x >= rect.left - slop && x <= rect.left + rect.width + slop
    && y >= rect.top - slop && y <= rect.top + rect.height + slop
}
