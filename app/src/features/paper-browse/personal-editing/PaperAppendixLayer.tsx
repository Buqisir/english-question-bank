import { useCallback, useMemo, type ReactNode } from 'react'
import { appendixMarkerPosition } from '../../../../../shared/personal-paper-layer/index.mjs'
import { frameAtPoint, mmToPx, pxToMm, type PaperPageFrame } from './paperPlacement'
import { scrollElementToVerticalCenter } from './paperScroll'
import { usePaperContentBoxes, type PaperContentBox } from './usePaperContentBoxes'
import { usePaperOccupiedRects } from './usePaperOccupiedRects'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'
import './personalAnnotations.css'

/*
 * One appendix entry of the current personal layer: number, ordering inputs,
 * and whatever spot the paper still knows about. Computed once in
 * PaperEditingView (via orderAppendixEntries) and shared with the appendix
 * preview, so paper markers and preview numbers always agree.
 */
export type AppendixPlanEntry = {
  id: string
  number: number
  pageIndex: number | null
  /** Page-internal mm of the ordering spot; both null when unpositioned. */
  yMm: number | null
  xMm: number | null
  /** anchored-note only: the anchor's first-line rect in canvas px. */
  anchorRect: { left: number; top: number } | null
  /** text-box only: the usable origin (current layout) in page-internal mm. */
  origin: { pageId: string; xMm: number; yMm: number } | null
}

type MarkerPlacement = {
  pageId: string
  left: number
  top: number
  centered: boolean
  /** The chip's reserved rect in page-internal mm (fed back as occupied). */
  rectMm: { xMm: number; yMm: number; widthMm: number; heightMm: number }
}

// 自由文字框：编号挂在 origin（页内 mm）。旁注：锚点首行起点更近的一侧页边，
// 水平居中于该页边，顶端对齐首行 top。位置与避让算法在 shared/personal-paper-layer/
// appendix.mjs（导出量测遍共用，输入等价：页面 mm 的占用矩形）；这里只做画布
// px ↔ 页内 mm 的换算。
function markerPlacement(
  entry: AppendixPlanEntry,
  frames: readonly PaperPageFrame[],
  contentBoxes: readonly PaperContentBox[],
  occupiedByPage: ReadonlyMap<string, ReadonlyArray<{ xMm: number; yMm: number; widthMm: number; heightMm: number }>>,
): MarkerPlacement | null {
  const occupied = (pageId: string) => occupiedByPage.get(pageId) ?? []
  if (entry.origin) {
    const frame = frames.find((candidate) => candidate.pageId === entry.origin?.pageId)
    if (!frame) return null
    const box = contentBoxes.find((candidate) => candidate.pageId === frame.pageId)
    const position = appendixMarkerPosition({
      origin: { xMm: entry.origin.xMm, yMm: entry.origin.yMm },
      contentBoxTopMm: box ? pxToMm(box.topPx - frame.topPx) : null,
      contentBoxBottomMm: box ? pxToMm(box.bottomPx - frame.topPx) : null,
      occupiedRectsMm: occupied(frame.pageId),
    })
    if (!position) return null
    return { pageId: frame.pageId, left: frame.leftPx + mmToPx(position.xMm), top: frame.topPx + mmToPx(position.yMm), centered: position.centered, rectMm: position.rectMm }
  }
  if (!entry.anchorRect) return null
  const frame = frameAtPoint(frames, entry.anchorRect.left + 1, entry.anchorRect.top + 1)
  const box = contentBoxes.find((candidate) => candidate.pageId === frame?.pageId)
  if (!frame || !box) return null
  const position = appendixMarkerPosition({
    anchorRectMm: {
      leftMm: pxToMm(entry.anchorRect.left - frame.leftPx),
      topMm: pxToMm(entry.anchorRect.top - frame.topPx),
    },
    contentBoxLeftMm: pxToMm(box.leftPx - frame.leftPx),
    contentBoxRightMm: pxToMm(box.rightPx - frame.leftPx),
    contentBoxTopMm: pxToMm(box.topPx - frame.topPx),
    contentBoxBottomMm: pxToMm(box.bottomPx - frame.topPx),
    pageWidthMm: frame.widthMm,
    occupiedRectsMm: occupied(frame.pageId),
  })
  if (!position) return null
  return { pageId: frame.pageId, left: frame.leftPx + mmToPx(position.xMm), top: frame.topPx + mmToPx(position.yMm), centered: position.centered, rectMm: position.rectMm }
}

/*
 * 「附N」markers on the fixed paper at each appendix object's original spot.
 * Render-only: the objects themselves live in the appendix preview; a click
 * scrolls that preview entry into view and selects the object.
 */
export function PaperAppendixLayer({
  api,
  iframe,
  frames,
  entries,
}: {
  api: PersonalAnnotationsApi
  iframe: HTMLIFrameElement | null
  frames: readonly PaperPageFrame[]
  entries: readonly AppendixPlanEntry[]
}): ReactNode {
  const contentBoxes = usePaperContentBoxes(iframe, frames, entries)
  const occupiedRects = usePaperOccupiedRects(frames)

  // 落位按条目编号顺序一次性算好：页上的卡片矩形先占位，每个已落的标记
  // 对下一个条目也是占用矩形——编号顺序下的确定性避让，与导出量测遍同一
  // 共享算法、等价输入。
  const placements = useMemo(() => {
    const occupiedByPage = new Map<string, Array<{ xMm: number; yMm: number; widthMm: number; heightMm: number }>>()
    for (const rect of occupiedRects) {
      if (!occupiedByPage.has(rect.pageId)) occupiedByPage.set(rect.pageId, [])
      occupiedByPage.get(rect.pageId)!.push({ xMm: rect.xMm, yMm: rect.yMm, widthMm: rect.widthMm, heightMm: rect.heightMm })
    }
    const result = new Map<string, MarkerPlacement>()
    for (const entry of entries) {
      const placement = markerPlacement(entry, frames, contentBoxes, occupiedByPage)
      if (!placement) continue
      result.set(entry.id, placement)
      if (!occupiedByPage.has(placement.pageId)) occupiedByPage.set(placement.pageId, [])
      occupiedByPage.get(placement.pageId)!.push(placement.rectMm)
    }
    return result
  }, [entries, frames, contentBoxes, occupiedRects])

  const onMarkerClick = useCallback((id: string) => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const
    const entry = document.querySelector(`[data-appendix-entry="${CSS.escape(id)}"]`)
    // Vertical only — scrollIntoView would drag the paper view sideways.
    if (entry) scrollElementToVerticalCenter(entry, behavior)
    api.setSelectedId(id)
  }, [api])

  if (entries.length === 0) return null
  return (
    <div className="paper-personal-paper-appendix-layer">
      {entries.map((entry) => {
        const position = placements.get(entry.id)
        if (!position) return null
        return (
          <button
            key={entry.id}
            type="button"
            className={`paper-personal-appendix-marker${position.centered ? ' is-centered' : ''}${api.selectedId === entry.id ? ' is-selected' : ''}`}
            style={{ left: position.left, top: position.top }}
            data-paper-appendix-marker={entry.id}
            aria-label={`附页条目 ${entry.number}`}
            onClick={() => onMarkerClick(entry.id)}
          >
            附{entry.number}
          </button>
        )
      })}
    </div>
  )
}
