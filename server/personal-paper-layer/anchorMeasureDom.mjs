/*
 * The in-page anchor measurement shared by the export measure pass
 * (exportPlan.mjs) and the compose pass's positional base check
 * (exportComposer.mjs): per-text-node rects of the anchor's segments, merged
 * per line, in document px. Runs through page.evaluate against the
 * __eqbPersonalOverlay bundle and the __eqbPersonalSource the caller installs;
 * returns null when any segment no longer resolves to DOM ranges.
 */
export function measureAnchorRectsInPage(segments) {
  const overlay = window.__eqbPersonalOverlay
  const anchorSource = window.__eqbPersonalSource
  const ranges = []
  for (const segment of segments) {
    const segmentRanges = overlay.printSegmentToDomRanges(document, anchorSource, segment)
    if (!segmentRanges) return null
    ranges.push(...segmentRanges)
  }
  const rects = []
  for (const range of ranges) {
    for (const rect of overlay.textRects(range)) {
      if (rect.width < 0.5 || rect.height < 0.5) continue
      rects.push({
        left: rect.left + window.scrollX,
        top: rect.top + window.scrollY,
        width: rect.width,
        height: rect.height,
      })
    }
  }
  return rects.length > 0 ? overlay.mergeLineRects(rects) : null
}
