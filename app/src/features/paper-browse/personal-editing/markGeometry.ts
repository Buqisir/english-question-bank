import type { PersonalLayerSource, PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
// 矩形量测与同行合并已上收 shared/personal-paper-layer/markGeometry.mjs
// （导出量测遍共用）；这里保留 re-export，既有调用点不动。
import { mergeLineRects, textRects } from '../../../../../shared/personal-paper-layer/index.mjs'
export { mergeLineRects, textRects }
import { segmentToDomRanges } from './anchorDomRange'

export type LayerRect = { left: number; top: number; width: number; height: number }

export type AnchorGeometry = {
  objectId: string
  rects: LayerRect[]
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
