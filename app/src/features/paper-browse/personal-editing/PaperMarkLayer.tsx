import { useLayoutEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { printSegmentToDomRanges, type PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import { mergeLineRects, textRects, type LayerRect } from './markGeometry'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'

type AnchoredMarkObject = Extract<PersonalObject, { textAnchor: unknown }>

type PaperMark = {
  id: string
  type: AnchoredMarkObject['type']
  color?: string
  ink?: string
  rects: LayerRect[]
}

/*
 * The teacher's existing marks (highlights, underlines, note anchors) drawn
 * over the fixed paper view's iframe. Rects are measured against the iframe
 * document itself, so the layer aligns with the page stack at scale 1 — the
 * canvas transform scales the whole overlay together with the paper.
 */
export function PaperMarkLayer({
  api,
  iframe,
  measureKey,
  noticeTarget,
}: {
  api: PersonalAnnotationsApi
  iframe: HTMLIFrameElement | null
  /** Changes whenever the page geometry is re-measured (layout refresh, fonts.ready). */
  measureKey: string
  /** Mount point for the quiet notices above the paper (outside the zoom transform). */
  noticeTarget: HTMLElement | null
}): ReactNode {
  const [marks, setMarks] = useState<PaperMark[]>([])
  const [unplacedCount, setUnplacedCount] = useState(0)
  const { objects, source } = api

  useLayoutEffect(() => {
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!source || !iframe || !doc || !win) {
      setMarks([])
      setUnplacedCount(0)
      return
    }
    const next: PaperMark[] = []
    let unplaced = 0
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
      if (!placed) {
        unplaced += 1
        continue
      }
      const rects: LayerRect[] = []
      for (const range of ranges) {
        for (const rect of textRects(range)) {
          if (rect.width < 0.5 || rect.height < 0.5) continue
          rects.push({
            // getClientRects are iframe-viewport coords; the overlay lives in
            // iframe-document coords (the same space the page frames use).
            left: rect.left + win.scrollX,
            top: rect.top + win.scrollY,
            width: rect.width,
            height: rect.height,
          })
        }
      }
      if (rects.length === 0) {
        unplaced += 1
        continue
      }
      next.push({
        id: object.id,
        type: object.type,
        color: object.type === 'highlight' ? object.style.color : undefined,
        ink: object.type === 'underline' ? object.style.ink : undefined,
        rects: mergeLineRects(rects),
      })
    }
    setMarks(next)
    setUnplacedCount(unplaced)
  }, [iframe, measureKey, objects, source])

  return (
    <>
      <div className="paper-personal-paper-marks" aria-hidden="true">
        {marks.flatMap((mark) => mark.rects.map((rect, index) => (
          <div
            key={`${mark.id}-${index}`}
            className={`paper-personal-mark paper-personal-mark--${mark.type} paper-personal-paper-mark`}
            data-paper-mark-id={mark.id}
            data-color={mark.color}
            data-ink={mark.ink}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          />
        )))}
      </div>
      {unplacedCount > 0 && noticeTarget ? createPortal((
        <p className="paper-personal-paper-notice" role="status">
          {unplacedCount} 处标注在纸张上找不到原文，先在阅读视图查看
        </p>
      ), noticeTarget) : null}
    </>
  )
}
