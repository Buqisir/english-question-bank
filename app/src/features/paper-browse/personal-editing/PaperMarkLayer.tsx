import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import type { LayerRect } from './markGeometry'
import { PersonalMarkPopover } from './PersonalMarkPopover'
import type { PaperAnchorGeometry } from './usePaperAnchorGeometry'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'

type AnchoredMarkObject = Extract<PersonalObject, { textAnchor: unknown }>

type PaperMark = {
  id: string
  type: AnchoredMarkObject['type']
  color?: string
  ink?: string
  rects: LayerRect[]
}

// Same labels as TYPE_LABEL in PersonalMarkPopover; kept local so the paper
// layer does not pull the popover module just for its strings.
const PAPER_MARK_LABEL: Record<string, string> = { highlight: '高亮', underline: '下划线', 'anchored-note': '旁注' }

function isAnchoredMarkType(type: PersonalObject['type']): type is AnchoredMarkObject['type'] {
  return type === 'highlight' || type === 'underline' || type === 'anchored-note'
}

/*
 * The teacher's existing marks (highlights, underlines, note anchors) drawn
 * over the fixed paper view's iframe. Rects are measured against the iframe
 * document itself, so the layer aligns with the page stack at scale 1 — the
 * canvas transform scales the whole overlay together with the paper.
 */
export function PaperMarkLayer({
  api,
  anchorGeometry,
  iframe,
  noticeTarget,
}: {
  api: PersonalAnnotationsApi
  anchorGeometry: PaperAnchorGeometry
  /** The paper iframe; highlight fills are painted inside its document. */
  iframe: HTMLIFrameElement | null
  /** Mount point for the quiet notices above the paper (outside the zoom transform). */
  noticeTarget: HTMLElement | null
}): ReactNode {
  const { objects } = api
  const { rectsByObjectId, unplacedIds } = anchorGeometry
  const unplacedCount = unplacedIds.length

  const marks = useMemo(() => {
    const next: PaperMark[] = []
    for (const object of objects) {
      if (!('textAnchor' in object)) continue
      const rects = rectsByObjectId.get(object.id)
      if (!rects) continue
      next.push({
        id: object.id,
        type: object.type,
        color: object.type === 'highlight' ? object.style.color : undefined,
        ink: object.type === 'underline' ? object.style.ink : undefined,
        rects,
      })
    }
    return next
  }, [objects, rectsByObjectId])

  // Clicking anywhere else (toolbar, gutter, chrome) closes the popover again,
  // mirroring the reading view. Clicks inside the iframe never reach this
  // window, so the popover just stays there — acceptable, same as before.
  // Pointerdowns inside a paper note card (its strip buttons especially) also
  // keep the selection: the card is chrome of the selected object itself, and
  // clearing here would unmount the strip before its click ever lands.
  useEffect(() => {
    if (!api.popover && !api.selectedId) return undefined
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element
        && (target.closest('.paper-personal-popover') || target.closest('.paper-personal-paper-marks') || target.closest('.paper-personal-paper-note'))) return
      api.setPopover(null)
      const selected = api.selectedId ? api.objectById.get(api.selectedId) : null
      if (selected && isAnchoredMarkType(selected.type)) api.setSelectedId(null)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [api.popover, api.selectedId, api.objectById, api.setPopover, api.setSelectedId])

  const interactive = api.canEdit

  // Highlight fills live inside the iframe document, not on this overlay:
  // mix-blend-mode cannot reach into an iframe that the browser composites on
  // its own layer (embedded Chromium/Electron panes do), and the fill then
  // paints as an opaque block over the words. Blending inside the same
  // document keeps the text readable everywhere. The overlay rects stay as
  // transparent click targets and carry the selection outline.
  const marksRef = useRef<HTMLDivElement | null>(null)
  const [fillHost, setFillHost] = useState<HTMLElement | null>(null)
  const [fillColors, setFillColors] = useState<Record<string, string>>({})
  useEffect(() => {
    const doc = iframe?.contentDocument
    if (!doc?.body) return undefined
    const host = doc.createElement('div')
    host.setAttribute('data-eqb-personal-highlight-fills', '')
    host.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;'
    doc.body.appendChild(host)
    setFillHost(host)
    return () => {
      host.remove()
      setFillHost(null)
    }
  }, [iframe])
  useEffect(() => {
    const element = marksRef.current
    if (!element) return
    // Tokens are defined on the overlay in the app stylesheet, which the
    // iframe document does not load; resolve them here and pass them down.
    const style = getComputedStyle(element)
    const next: Record<string, string> = {}
    for (const color of ['yellow', 'green', 'blue', 'pink']) {
      next[color] = style.getPropertyValue(`--personal-highlight-${color}`).trim()
    }
    setFillColors(next)
  }, [])

  const highlightFills = fillHost ? createPortal(
    marks.filter((mark) => mark.type === 'highlight').flatMap((mark) => mark.rects.map((rect, index) => (
      <div
        key={`${mark.id}-${index}`}
        data-paper-mark-fill={mark.id}
        style={{
          position: 'absolute',
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          background: fillColors[mark.color ?? ''] ?? 'transparent',
          mixBlendMode: 'multiply',
        }}
      />
    ))),
    fillHost,
  ) : null

  return (
    <>
      {highlightFills}
      <div ref={marksRef} className="paper-personal-paper-marks" aria-hidden={interactive ? undefined : true}>
        {marks.flatMap((mark) => mark.rects.map((rect, index) => (
          <div
            key={`${mark.id}-${index}`}
            className={`paper-personal-mark paper-personal-mark--${mark.type} paper-personal-paper-mark${interactive && api.selectedId === mark.id ? ' is-selected' : ''}`}
            data-paper-mark-id={mark.id}
            data-color={mark.color}
            data-ink={mark.ink}
            role={interactive ? 'button' : undefined}
            tabIndex={interactive ? -1 : undefined}
            aria-label={interactive ? PAPER_MARK_LABEL[mark.type] : undefined}
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              // The container is pointer-events:none; each fragment re-enables
              // itself so any piece of the mark can be clicked.
              ...(interactive ? { pointerEvents: 'auto' as const } : {}),
            }}
            onClick={interactive ? (event) => {
              event.stopPropagation()
              api.setSelectedId(mark.id)
              api.setPopover({ ids: [mark.id], activeId: mark.id, point: { x: event.clientX, y: event.clientY } })
            } : undefined}
          />
        )))}
      </div>
      {unplacedCount > 0 && noticeTarget ? createPortal((
        <p className="paper-personal-paper-notice" role="status">
          {unplacedCount} 处标注在纸张上找不到原文，先在阅读视图查看
        </p>
      ), noticeTarget) : null}
      {api.popover ? createPortal(<PersonalMarkPopover api={api} />, document.body) : null}
    </>
  )
}
