import { useCallback, type ReactNode } from 'react'
import { frameAtPoint, mmToPx, type PaperPageFrame } from './paperPlacement'
import { scrollElementToVerticalCenter } from './paperScroll'
import { usePaperContentBoxes } from './usePaperContentBoxes'
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

type MarkerPosition = { left: number; top: number; centered: boolean }

// 自由文字框：编号挂在 origin（页内 mm）。旁注：锚点首行起点更近的一侧页边，
// 水平居中于该页边，顶端对齐首行 top。算不出位置的条目不画标记。
function markerPosition(
  entry: AppendixPlanEntry,
  frames: readonly PaperPageFrame[],
  contentBoxes: readonly { pageId: string; leftPx: number; rightPx: number }[],
): MarkerPosition | null {
  if (entry.origin) {
    const frame = frames.find((candidate) => candidate.pageId === entry.origin?.pageId)
    if (!frame) return null
    return {
      left: frame.leftPx + mmToPx(entry.origin.xMm),
      top: frame.topPx + mmToPx(entry.origin.yMm),
      centered: false,
    }
  }
  if (!entry.anchorRect) return null
  const frame = frameAtPoint(frames, entry.anchorRect.left + 1, entry.anchorRect.top + 1)
  const box = contentBoxes.find((candidate) => candidate.pageId === frame?.pageId)
  if (!frame || !box) return null
  const pageLeft = frame.leftPx
  const pageRight = frame.leftPx + mmToPx(frame.widthMm)
  const inLeftMargin = entry.anchorRect.left - pageLeft < pageRight - entry.anchorRect.left
  const marginStart = inLeftMargin ? pageLeft : box.rightPx
  const marginEnd = inLeftMargin ? box.leftPx : pageRight
  return { left: (marginStart + marginEnd) / 2, top: entry.anchorRect.top, centered: true }
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
        const position = markerPosition(entry, frames, contentBoxes)
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
