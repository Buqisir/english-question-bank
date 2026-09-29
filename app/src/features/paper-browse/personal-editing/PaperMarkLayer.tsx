import { useEffect, useMemo, type ReactNode } from 'react'
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
  noticeTarget,
}: {
  api: PersonalAnnotationsApi
  anchorGeometry: PaperAnchorGeometry
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

  return (
    <>
      <div className="paper-personal-paper-marks" aria-hidden={interactive ? undefined : true}>
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
