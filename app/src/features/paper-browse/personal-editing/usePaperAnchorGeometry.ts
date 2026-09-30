import { useLayoutEffect, useState } from 'react'
import { printSegmentToDomRanges, type PersonalLayerSource, type PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import { mergeLineRects, textRects, type LayerRect } from './markGeometry'

export type PaperAnchorGeometry = {
  /** Merged per-line glyph rects in iframe-document px, keyed by object id. */
  rectsByObjectId: Map<string, LayerRect[]>
  /** Anchored objects whose source text could not be found on the print pages. */
  unplacedIds: string[]
}

const EMPTY: PaperAnchorGeometry = { rectsByObjectId: new Map(), unplacedIds: [] }

function measure(
  doc: Document,
  win: Window,
  source: PersonalLayerSource,
  objects: readonly PersonalObject[],
): PaperAnchorGeometry {
  const rectsByObjectId = new Map<string, LayerRect[]>()
  const unplacedIds: string[] = []
  for (const object of objects) {
    if (!('textAnchor' in object)) continue
    const ranges: Range[] = []
    let placed = true
    for (const segment of object.textAnchor.segments) {
      const segmentRanges = printSegmentToDomRanges(doc, source, segment)
      if (!segmentRanges) {
        placed = false
        break
      }
      ranges.push(...segmentRanges)
    }
    const rects: LayerRect[] = []
    if (placed) {
      for (const range of ranges) {
        for (const rect of textRects(range)) {
          if (rect.width < 0.5 || rect.height < 0.5) continue
          rects.push({
            // getClientRects are iframe-viewport coords; the overlays live in
            // iframe-document coords (the same space the page frames use).
            left: rect.left + win.scrollX,
            top: rect.top + win.scrollY,
            width: rect.width,
            height: rect.height,
          })
        }
      }
    }
    if (rects.length === 0) {
      unplacedIds.push(object.id)
      continue
    }
    rectsByObjectId.set(object.id, mergeLineRects(rects))
  }
  return { rectsByObjectId, unplacedIds }
}

/*
 * Where each text-anchored object's source text sits on the fixed paper
 * view's print pages. Shared by the mark layer and the note-card layer so
 * both draw from one measurement per layout refresh.
 */
export function usePaperAnchorGeometry(
  objects: readonly PersonalObject[],
  source: PersonalLayerSource | null | undefined,
  iframe: HTMLIFrameElement | null,
  /** Changes whenever the page geometry is re-measured (layout refresh, fonts.ready). */
  measureKey: string,
): PaperAnchorGeometry {
  const [geometry, setGeometry] = useState<PaperAnchorGeometry>(EMPTY)
  useLayoutEffect(() => {
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!source || !doc || !win) {
      setGeometry(EMPTY)
      return
    }
    setGeometry(measure(doc, win, source, objects))
  }, [iframe, measureKey, objects, source])
  return geometry
}
