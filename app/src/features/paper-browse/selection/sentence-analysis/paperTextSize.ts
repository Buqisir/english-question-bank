export function paperTextSize(range: Range | null | undefined): number | null {
  const node = range?.startContainer
  const element = node instanceof Element ? node : node?.parentElement
  if (!element) return null
  const size = Number.parseFloat(getComputedStyle(element).fontSize)
  if (!Number.isFinite(size) || size <= 0) return null
  // The paper zooms on wider screens; the card is portalled outside it.
  // Read ancestor zooms because currentCSSZoom is not available in every browser.
  let zoom = 1
  for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
    const value = getComputedStyle(ancestor).zoom
    const scale = Number.parseFloat(value)
    if (Number.isFinite(scale) && scale > 0) zoom *= value.endsWith('%') ? scale / 100 : scale
  }
  return Math.round(size * zoom * 10) / 10
}
