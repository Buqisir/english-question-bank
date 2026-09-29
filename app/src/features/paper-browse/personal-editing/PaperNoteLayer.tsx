import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import { PersonalTextView } from './PersonalTextView'
import { placeNoteNearAnchor, type NoteSlot } from './paperNotePlacement'
import { clampPlacement, frameAtPoint, MM_TO_PX, mmToPx, pxToMm, type PaperPageFrame } from './paperPlacement'
import type { LayerRect } from './markGeometry'
import type { PaperAnchorGeometry } from './usePaperAnchorGeometry'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'
import './personalAnnotations.css'

// 旁注卡手摆/流内宽度；高度随内容，auto 摆位先按分槽估计值探空位，渲染后用
// 实测高度（见下方 layout effect）收敛一轮。
const NOTE_WIDTH_MM = 56
const ESTIMATED_HEIGHT_MM: Record<NoteSlot, number> = { margin: 40, flow: 24 }

// Ink probe sampling grid (px) over the candidate rect, far edges included.
const PROBE_GRID_PX = 12

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'

type AnchoredNoteObject = Extract<PersonalObject, { type: 'anchored-note' }>

type PlacedNote = {
  object: AnchoredNoteObject
  frame: PaperPageFrame
  xMm: number
  yMm: number
  widthMm: number
  slot: NoteSlot
  auto: boolean
}

type CardRectPx = { left: number; top: number; width: number; height: number }

type PageContentBox = { pageId: string; leftPx: number; rightPx: number }

// An element carries print ink when it is an image, part of an SVG, or
// directly holds non-blank text — text nested one level down belongs to the
// child element, which the probe hits in the same stack anyway.
function carriesInk(element: Element): boolean {
  if (element.tagName === 'IMG' || element.namespaceURI === SVG_NAMESPACE) return true
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.nodeValue ?? '').trim() !== '') return true
  }
  return false
}

// The page frame placeNoteNearAnchor resolves against: same sort key and +1
// probe point as its internal frameOfPoint choice, so the contentBox passed
// in is the one for the page it actually picks.
function anchorFrameOf(anchorRects: readonly LayerRect[], frames: readonly PaperPageFrame[]): PaperPageFrame | null {
  const sorted = [...anchorRects].sort((a, b) => a.top - b.top || a.left - b.left)
  const first = sorted[0]
  return frameAtPoint(frames, first.left + 1, first.top + 1)
}

/*
 * Anchored-note cards on the fixed paper view. page-position notes render at
 * their stored spot (same mm→px conversion as the text boxes); auto-near-anchor
 * notes resolve against the shared anchor geometry each layout — side margin
 * first, then the flow beside the anchor — display only, never written back.
 * Notes with no free spot (or a foreign layoutId) stay unrendered and surface
 * the 逐个摆放 notice instead.
 */
export function PaperNoteLayer({
  api,
  anchorGeometry,
  frames,
  layoutId,
  iframe,
  noticeTarget,
}: {
  api: PersonalAnnotationsApi
  anchorGeometry: PaperAnchorGeometry
  frames: readonly PaperPageFrame[]
  layoutId: string
  iframe: HTMLIFrameElement | null
  /** Mount point for the quiet notices above the paper (outside the zoom transform). */
  noticeTarget: HTMLElement | null
}): ReactNode {
  const layerRef = useRef<HTMLDivElement | null>(null)
  // Measured card heights (mm), keyed `${id}:${slot}`: the one-round
  // convergence state for auto placement — re-resolving with the real height
  // measures the same height on the next pass, so the loop stops by itself.
  // Slots are keyed apart because a card that moves between margin (narrow)
  // and flow (56mm) reflows to a different height.
  const [measuredHeights, setMeasuredHeights] = useState<Record<string, number>>({})
  // 「逐个摆放」 armed: pages turn crosshair and the next click commits the
  // first pending note as a page-position placement.
  const [placing, setPlacing] = useState(false)

  const { canEdit, selectedId, setSelectedId, apply, seal } = api

  const frameByPageId = useMemo(
    () => new Map(frames.map((frame) => [frame.pageId, frame])),
    [frames],
  )

  const probe = useCallback((rect: { left: number; top: number; width: number; height: number }): boolean => {
    const doc = iframe?.contentDocument
    if (!doc) return true
    const xs: number[] = []
    for (let x = 0; x < rect.width; x += PROBE_GRID_PX) xs.push(x)
    xs.push(rect.width)
    const ys: number[] = []
    for (let y = 0; y < rect.height; y += PROBE_GRID_PX) ys.push(y)
    ys.push(rect.height)
    for (const dx of xs) {
      for (const dy of ys) {
        // The iframe is exactly the full paper height and never scrolls, so
        // elementsFromPoint's viewport coords are the document coords the
        // rects and frames were measured in.
        for (const element of doc.elementsFromPoint(rect.left + dx, rect.top + dy)) {
          if (carriesInk(element)) return false
        }
      }
    }
    return true
  }, [iframe])

  // Per-page content-area left/right edges (document px) for margin placement.
  // Paged.js structure: .pagedjs_page > … > .pagedjs_area (the pagebox grid's
  // center cell, i.e. inside the page margins) > .pagedjs_page_content; prefer
  // the area, fall back to the page content, and give a page with neither no
  // margin candidates. Re-measured with the anchor geometry (same measureKey
  // cadence) so the boxes track re-layouts and font settles.
  const contentBoxes = useMemo<PageContentBox[]>(() => {
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!doc || !win) return []
    const pages = doc.querySelectorAll('.pagedjs_page')
    const boxes: PageContentBox[] = []
    for (const [index, frame] of frames.entries()) {
      const page = pages[index]
      if (!page) continue
      const area = page.querySelector('.pagedjs_area') ?? page.querySelector('.pagedjs_page_content')
      if (!area) continue
      const box = area.getBoundingClientRect()
      boxes.push({ pageId: frame.pageId, leftPx: box.left + win.scrollX, rightPx: box.right + win.scrollX })
    }
    return boxes
  }, [iframe, frames, anchorGeometry])

  const { placed, pending } = useMemo(() => {
    const placed: PlacedNote[] = []
    const pending: AnchoredNoteObject[] = []
    // Cards already on the paper (page-position + auto resolved so far, in
    // api.objects order) that later candidates must not overlap.
    const occupied: CardRectPx[] = []
    for (const object of api.objects) {
      if (object.type !== 'anchored-note') continue
      if (object.placement.kind === 'page-position') {
        if (object.placement.layoutId !== layoutId) {
          pending.push(object)
          continue
        }
        const frame = frameByPageId.get(object.placement.pageId)
        if (!frame) {
          pending.push(object)
          continue
        }
        const heightMm = measuredHeights[`${object.id}:flow`] ?? ESTIMATED_HEIGHT_MM.flow
        occupied.push({
          left: frame.leftPx + mmToPx(object.placement.xMm),
          top: frame.topPx + mmToPx(object.placement.yMm),
          width: mmToPx(object.placement.widthMm),
          height: mmToPx(heightMm),
        })
        placed.push({
          object,
          frame,
          xMm: object.placement.xMm,
          yMm: object.placement.yMm,
          widthMm: object.placement.widthMm,
          slot: 'flow',
          auto: false,
        })
        continue
      }
      if (object.placement.kind !== 'auto-near-anchor') continue
      const anchorRects = anchorGeometry.rectsByObjectId.get(object.id)
      if (!anchorRects || anchorRects.length === 0) {
        pending.push(object)
        continue
      }
      const anchorFrame = anchorFrameOf(anchorRects, frames)
      const contentBox = contentBoxes.find((box) => box.pageId === anchorFrame?.pageId)
      const heightMm = {
        margin: measuredHeights[`${object.id}:margin`] ?? ESTIMATED_HEIGHT_MM.margin,
        flow: measuredHeights[`${object.id}:flow`] ?? ESTIMATED_HEIGHT_MM.flow,
      }
      const candidate = placeNoteNearAnchor({
        anchorRects,
        frames,
        flowWidthMm: NOTE_WIDTH_MM,
        heightMm,
        probe,
        contentBox,
        occupied,
      })
      const frame = candidate ? frameByPageId.get(candidate.pageId) : undefined
      // No fit (or nothing resolvable): the layer stays quiet and the notice
      // offers 逐个摆放 — never cover body text silently.
      if (!candidate || !candidate.fits || !frame) {
        pending.push(object)
        continue
      }
      // The resolved card reserves its spot for the next notes in line.
      occupied.push({
        left: candidate.xMm * MM_TO_PX,
        top: candidate.yMm * MM_TO_PX,
        width: mmToPx(candidate.widthMm),
        height: mmToPx(heightMm[candidate.slot]),
      })
      // placeNoteNearAnchor speaks document-absolute mm (px / MM_TO_PX,
      // page offsets included); stored placements and rendering are
      // page-internal, so strip this page's own offset here.
      placed.push({
        object,
        frame,
        xMm: candidate.xMm - frame.leftPx / MM_TO_PX,
        yMm: candidate.yMm - frame.topPx / MM_TO_PX,
        widthMm: candidate.widthMm,
        slot: candidate.slot,
        auto: true,
      })
    }
    return { placed, pending }
  }, [api.objects, anchorGeometry, contentBoxes, frameByPageId, frames, layoutId, measuredHeights, probe])

  // Cards' real height feeds back into placement once: the estimate only
  // steers the ink probe; when the rendered height differs by more than 1mm,
  // re-resolve with the measured height (per slot key). The memo above
  // converges — the next pass measures the same content height and updates
  // nothing.
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const updates: Record<string, number> = {}
    for (const node of layer.querySelectorAll<HTMLElement>('[data-note-key][data-note-slot]')) {
      const id = node.dataset.noteKey ?? ''
      if (!id) continue
      const slot: NoteSlot = node.dataset.noteSlot === 'margin' ? 'margin' : 'flow'
      const key = `${id}:${slot}`
      const heightMm = pxToMm(node.offsetHeight)
      if (Math.abs(heightMm - (measuredHeights[key] ?? ESTIMATED_HEIGHT_MM[slot])) > 1) updates[key] = heightMm
    }
    if (Object.keys(updates).length === 0) return
    setMeasuredHeights((current) => ({ ...current, ...updates }))
  }, [placed, measuredHeights])

  const commitFirstPending = useCallback((frame: PaperPageFrame, xMm: number, yMm: number) => {
    const target = pending[0]
    if (!target || !canEdit) return
    seal()
    apply([{
      op: 'update',
      objectId: target.id,
      patch: { placement: { kind: 'page-position', layoutId, pageId: frame.pageId, ...clampPlacement(xMm, yMm, NOTE_WIDTH_MM, frame) } },
    }])
  }, [apply, canEdit, layoutId, pending, seal])

  // Armed click on the page stack: same conversion as the text-box layer's
  // re-place (getBoundingClientRect is scaled by the canvas transform,
  // offsetWidth is not). Card clicks stopPropagation before reaching here.
  const handleLayerClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.paper-personal-paper-note')) return
    if (!placing) return
    const layer = layerRef.current
    if (!layer || layer.offsetWidth === 0) return
    const rect = layer.getBoundingClientRect()
    const scale = rect.width / layer.offsetWidth
    const xPx = (event.clientX - rect.left) / scale
    const yPx = (event.clientY - rect.top) / scale
    const frame = frameAtPoint(frames, xPx, yPx)
    if (!frame) return
    commitFirstPending(frame, pxToMm(xPx - frame.leftPx), pxToMm(yPx - frame.topPx))
  }, [commitFirstPending, frames, placing])

  // Stays armed while pending notes remain (same 逐个摆放 flow as the text
  // boxes); disarms itself when the last one finds a home, or on Escape.
  useEffect(() => {
    if (placing && pending.length === 0) setPlacing(false)
  }, [placing, pending.length])

  useEffect(() => {
    if (!placing) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setPlacing(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placing])

  return (
    <>
      <div
        ref={layerRef}
        className={`paper-personal-paper-note-layer${placing ? ' is-placing' : ''}`}
        onClick={handleLayerClick}
      >
        {placed.map(({ object, frame, xMm, yMm, widthMm, slot, auto }) => (
          <div
            key={object.id}
            className={`paper-personal-paper-note${selectedId === object.id ? ' is-selected' : ''}`}
            style={{
              left: frame.leftPx + mmToPx(xMm),
              top: frame.topPx + mmToPx(yMm),
              width: mmToPx(widthMm),
            }}
            data-note-key={object.id}
            data-note-slot={slot}
            data-note-auto={auto ? 'true' : undefined}
            onClick={(event) => {
              event.stopPropagation()
              setSelectedId(object.id)
            }}
          >
            <PersonalTextView document={object.document} />
          </div>
        ))}
        {placing && frames.map((frame) => (
          <div
            key={`hit-${frame.pageId}`}
            className="paper-personal-paper-note-hit"
            style={{
              left: frame.leftPx,
              top: frame.topPx,
              width: mmToPx(frame.widthMm),
              height: mmToPx(frame.heightMm),
            }}
            aria-hidden="true"
          />
        ))}
      </div>
      {pending.length > 0 && noticeTarget ? createPortal((
        <p className="paper-personal-paper-notice" role="status">
          {pending.length} 条旁注在纸上没有空位
          {canEdit ? (
            <button type="button" className="paper-personal-retry" onClick={() => setPlacing(true)}>逐个摆放</button>
          ) : null}
        </p>
      ), noticeTarget) : null}
    </>
  )
}
