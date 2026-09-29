/*
 * Per-text-node glyph measurement for anchored marks (#489 4c). DOM-only and
 * framework-free: the paper editing view, the shared anchor-geometry hook and
 * the server-side export measure pass all resolve mark rectangles through
 * this one implementation.
 */

/**
 * A Range's own client rects include whole element boxes when an element is
 * fully inside it, which would paint blocks over headings or option labels.
 * Measuring per text node keeps every rect on glyphs.
 */
export function textRects(range) {
  const root = range.commonAncestorContainer
  if (root.nodeType === Node.TEXT_NODE) return [...range.getClientRects()]
  // Ranges may live in the paper view's iframe document, not the host window.
  const doc = range.startContainer.ownerDocument ?? document
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const rects = []
  let node = walker.nextNode()
  while (node) {
    if (range.intersectsNode(node) && node.data.length > 0) {
      const part = doc.createRange()
      part.setStart(node, node === range.startContainer ? range.startOffset : 0)
      part.setEnd(node, node === range.endContainer ? range.endOffset : node.data.length)
      if (!part.collapsed) rects.push(...part.getClientRects())
    }
    node = walker.nextNode()
  }
  return rects
}

/** Joins fragments of one line so a mark is one shape per line, not per text node. */
export function mergeLineRects(rects) {
  const sorted = [...rects].sort((a, b) => a.top - b.top || a.left - b.left)
  const merged = []
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
