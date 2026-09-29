/*
 * Print-ink probe for note placement: samples a grid over a candidate rect
 * and reports whether it is free of paper ink. DOM-only and framework-free,
 * shared by the paper editing view and the server-side export measure pass.
 */

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

/**
 * An element carries print ink when it is an image, part of an SVG, or
 * directly holds non-blank text — text nested one level down belongs to the
 * child element, which the probe hits in the same stack anyway.
 * @param {Element} element
 */
function carriesInk(element) {
  if (element.tagName === 'IMG' || element.namespaceURI === SVG_NAMESPACE) return true
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? '').trim() !== '') return true
  }
  return false
}

/**
 * @param {Document | null | undefined} doc The paginated print document.
 * @param {{ left: number, top: number, width: number, height: number }} rect
 *   Document px — `elementsFromPoint` wants viewport coordinates, so this
 *   contract only holds for documents that never scroll (the paper iframe and
 *   the measure-pass page are exactly that).
 * @param {number} gridPx Sampling grid; far edges are always sampled.
 * @returns {boolean} True when no sampled point hits print ink; a missing
 *   document is treated as free (nothing to hit).
 */
export function inkFreeRect(doc, rect, gridPx) {
  if (!doc) return true
  const xs = []
  for (let x = 0; x < rect.width; x += gridPx) xs.push(x)
  xs.push(rect.width)
  const ys = []
  for (let y = 0; y < rect.height; y += gridPx) ys.push(y)
  ys.push(rect.height)
  for (const dx of xs) {
    for (const dy of ys) {
      for (const element of doc.elementsFromPoint(rect.left + dx, rect.top + dy)) {
        if (carriesInk(element)) return false
      }
    }
  }
  return true
}
