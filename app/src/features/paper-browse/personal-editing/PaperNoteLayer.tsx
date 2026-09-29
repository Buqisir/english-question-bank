import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import {
  isPersonalTextDocumentBlank,
  type PersonalTextDocumentV1,
  type PersonalTextPresentation,
} from '../../../../../shared/personal-text/index.mjs'
import { PersonalTextEditor } from './PersonalTextEditor'
import { PersonalTextView } from './PersonalTextView'
import { TextBoxPresentationControls, type TextBoxPresentationChange } from './PaperTextBoxStrip'
import { BookMarked, Trash } from '../../../icons'
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

// 「回到原文」锚线闪烁：class 挂这么久，动画本身只跑两个 motion-slow 脉冲。
const FLASH_MS = 900

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

// The note being edited. Like the text box: the draft reserves its mergeKey up
// front so the whole editing session (typed text + presentation tweaks) is one
// undo step; changes stay local until the editor closes.
type NoteEditing = {
  key: string
  mergeKey: string
  objectId: string
  document: PersonalTextDocumentV1
}

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

// First scrollable ancestor of the overlay layer (the paper view scrolls inside
// the app shell, not the window); null falls back to window scrolling.
function scrollContainerOf(element: Element): HTMLElement | null {
  let node: HTMLElement | null = element.parentElement
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) return node
    node = node.parentElement
  }
  return null
}

/*
 * Anchored-note cards on the fixed paper view. page-position notes render at
 * their stored spot (same mm→px conversion as the text boxes); auto-near-anchor
 * notes resolve against the shared anchor geometry each layout — side margin
 * first, then the flow beside the anchor — display only, never written back.
 * Selected notes get the text-box strip (presentation, 回到原文, delete) and an
 * in-place editor (Enter/double-click). Notes with no free spot (or a foreign
 * layoutId) stay unrendered and surface the 逐个摆放 notice instead.
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
  const [editing, setEditing] = useState<NoteEditing | null>(null)
  const flashTimeoutRef = useRef<number | null>(null)

  const { canEdit, selectedId, setSelectedId, setPopover, apply, seal } = api

  // Synchronous mirror: pointer events and blur can race the next render, and
  // the close guards below must not read a stale editing state.
  const editingRef = useRef<NoteEditing | null>(null)
  editingRef.current = editing

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
  // nothing. The card being edited is skipped: its editor height is transient,
  // and re-resolving mid-typing would move the card under the caret.
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    const updates: Record<string, number> = {}
    for (const node of layer.querySelectorAll<HTMLElement>('[data-note-key][data-note-slot]')) {
      const id = node.dataset.noteKey ?? ''
      if (!id || id === editing?.objectId) continue
      const slot: NoteSlot = node.dataset.noteSlot === 'margin' ? 'margin' : 'flow'
      const key = `${id}:${slot}`
      const heightMm = pxToMm(node.offsetHeight)
      if (Math.abs(heightMm - (measuredHeights[key] ?? ESTIMATED_HEIGHT_MM[slot])) > 1) updates[key] = heightMm
    }
    if (Object.keys(updates).length === 0) return
    setMeasuredHeights((current) => ({ ...current, ...updates }))
  }, [placed, measuredHeights, editing])

  // Same flow as the text box: seal at entry, one mergeKey for the session.
  const openNoteEditor = useCallback((objectId: string) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'anchored-note' || !canEdit) return
    seal()
    const mergeKey = api.nextEditKey()
    const state: NoteEditing = {
      key: `note-${mergeKey}`,
      mergeKey,
      objectId,
      document: structuredClone(object.document),
    }
    editingRef.current = state
    setEditing(state)
  }, [api, canEdit, seal])

  // Exit editing: one {document} update when the content actually changed.
  // A note emptied while editing is NOT deleted (deletion is explicit) — the
  // untouched stored document simply stays, which restores the pre-edit text.
  const closeEditing = useCallback((state: NoteEditing) => {
    if (editingRef.current?.key !== state.key) return
    editingRef.current = null
    setEditing(null)
    const object = api.objectById.get(state.objectId)
    if (!object || object.type !== 'anchored-note') return
    if (JSON.stringify(state.document) === JSON.stringify(object.document)) return
    if (isPersonalTextDocumentBlank(state.document)) return
    apply([{ op: 'update', objectId: state.objectId, patch: { document: state.document } }], { mergeKey: state.mergeKey })
  }, [api.objectById, apply])

  // Selected (not editing) presentation changes go straight to the store, one
  // op per change, same as the text-box strip.
  const applySelectedPresentation = useCallback((objectId: string, patch: TextBoxPresentationChange) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'anchored-note') return
    seal()
    apply([{
      op: 'update',
      objectId,
      patch: {
        document: {
          ...object.document,
          presentation: { ...object.document.presentation, ...patch } as PersonalTextPresentation,
        },
      },
    }])
  }, [api.objectById, apply, seal])

  // While editing, presentation changes ride the session's mergeKey via the
  // close-time diff — no store write per click.
  const applyEditingPresentation = useCallback((state: NoteEditing, patch: TextBoxPresentationChange) => {
    const document: PersonalTextDocumentV1 = {
      ...state.document,
      presentation: { ...state.document.presentation, ...patch } as PersonalTextPresentation,
    }
    setEditing((current) => (current?.key === state.key ? { ...current, document } : current))
  }, [])

  // 「回到原文」: scroll the anchor's first line to the viewport center. The
  // overlay layer is unscaled layout px under a canvas transform, so the live
  // layer rect's ratio to its offsetWidth recovers the zoom factor.
  const scrollAnchorIntoView = useCallback((objectId: string) => {
    const layer = layerRef.current
    const rects = anchorGeometry.rectsByObjectId.get(objectId)
    if (!layer || !rects || rects.length === 0 || layer.offsetWidth === 0) return
    const layerRect = layer.getBoundingClientRect()
    const scale = layerRect.width / layer.offsetWidth
    const anchorTopPx = Math.min(...rects.map((rect) => rect.top)) * scale
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const
    const container = scrollContainerOf(layer)
    if (!container) {
      window.scrollTo({ top: window.scrollY + layerRect.top + anchorTopPx - window.innerHeight / 2, behavior })
      return
    }
    const containerRect = container.getBoundingClientRect()
    container.scrollTo({
      top: layerRect.top - containerRect.top + container.scrollTop + anchorTopPx - container.clientHeight / 2,
      behavior,
    })
  }, [anchorGeometry])

  // One opacity pulse pair on the anchor's mark fragments (the mark layer
  // draws one element per merged line — the class hits them all at once).
  const flashAnchor = useCallback((objectId: string) => {
    const marks = document.querySelectorAll(`[data-paper-mark-id="${CSS.escape(objectId)}"]`)
    if (marks.length === 0) return
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    for (const mark of marks) {
      mark.classList.remove('is-flash')
      // Reflow so a repeat flash restarts the animation.
      void (mark as HTMLElement).offsetWidth
      mark.classList.add('is-flash')
    }
    flashTimeoutRef.current = window.setTimeout(() => {
      for (const mark of marks) mark.classList.remove('is-flash')
      flashTimeoutRef.current = null
    }, FLASH_MS)
  }, [])

  useEffect(() => () => {
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
  }, [])

  const backToSource = useCallback((objectId: string) => {
    scrollAnchorIntoView(objectId)
    flashAnchor(objectId)
  }, [flashAnchor, scrollAnchorIntoView])

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
    const layer = layerRef.current
    if (!layer || layer.offsetWidth === 0) return
    if (placing) {
      const rect = layer.getBoundingClientRect()
      const scale = rect.width / layer.offsetWidth
      const xPx = (event.clientX - rect.left) / scale
      const yPx = (event.clientY - rect.top) / scale
      const frame = frameAtPoint(frames, xPx, yPx)
      if (!frame) return
      commitFirstPending(frame, pxToMm(xPx - frame.leftPx), pxToMm(yPx - frame.topPx))
      return
    }
    // Blank-paper click while a note is selected or edited: deselect, and
    // close the editor (which commits) — the text-box hit-surface mechanism.
    if (editingRef.current) closeEditing(editingRef.current)
    setSelectedId(null)
  }, [closeEditing, commitFirstPending, frames, placing, setSelectedId])

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

  const renderNote = (note: PlacedNote): ReactNode => {
    const { object, frame, xMm, yMm, widthMm, slot, auto } = note
    const editingState = editing?.objectId === object.id ? editing : null
    const editingNow = editingState != null
    const selected = selectedId === object.id && !editingNow
    const showStrip = selected && canEdit
    // A right-side margin card's strip and editing toolbar would run past the
    // page's right edge anchored at the card's left edge — anchor them at the
    // right edge instead.
    const rightSide = slot === 'margin' && xMm + widthMm / 2 > frame.widthMm / 2
    return (
      <div
        key={object.id}
        className={`paper-personal-paper-note${selected ? ' is-selected' : ''}${editingNow ? ' is-editing' : ''}${rightSide ? ' is-strip-right' : ''}`}
        style={{
          left: frame.leftPx + mmToPx(xMm),
          top: frame.topPx + mmToPx(yMm),
          width: mmToPx(widthMm),
        }}
        tabIndex={0}
        aria-label="旁注"
        data-note-key={object.id}
        data-note-slot={slot}
        data-note-auto={auto ? 'true' : undefined}
        onClick={(event) => {
          event.stopPropagation()
          setSelectedId(object.id)
          // The mark layer keeps the selection when a pointerdown lands inside
          // the note card, so the popover must be closed here instead.
          setPopover(null)
        }}
        onDoubleClick={() => {
          if (!editingNow) openNoteEditor(object.id)
        }}
        onKeyDown={(event: ReactKeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' && !editingNow) openNoteEditor(object.id)
        }}
        onKeyDownCapture={(event) => {
          if (!editingState || event.key !== 'Escape' || event.nativeEvent.isComposing) return
          event.preventDefault()
          event.stopPropagation()
          closeEditing(editingState)
        }}
        onBlur={(event) => {
          if (!editingState) return
          const next = event.relatedTarget
          if (next instanceof Node && event.currentTarget.contains(next)) return
          closeEditing(editingState)
        }}
      >
        {editingState ? (
          <PersonalTextEditor
            documentKey={editingState.key}
            value={editingState.document}
            ariaLabel="旁注内容"
            autoFocus
            toolbarExtra={canEdit ? (
              <TextBoxPresentationControls
                document={editingState.document}
                subject="旁注"
                onChange={(patch) => applyEditingPresentation(editingState, patch)}
              />
            ) : null}
            onChange={(next) => {
              setEditing((current) => (current?.key === editingState.key ? { ...current, document: next } : current))
            }}
          />
        ) : (
          <>
            <PersonalTextView document={object.document} />
            {showStrip ? (
              <div
                className="paper-personal-text-box__strip"
                role="toolbar"
                aria-label="旁注操作"
              >
                <TextBoxPresentationControls
                  document={object.document}
                  subject="旁注"
                  onChange={(patch) => applySelectedPresentation(object.id, patch)}
                />
                <span className="paper-personal-strip-divider" aria-hidden="true" />
                <button
                  type="button"
                  className="paper-personal-text-box__strip-action"
                  aria-label="回到原文"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPopover(null)
                    backToSource(object.id)
                  }}
                >
                  <BookMarked size={16} />
                  回到原文
                </button>
                <button
                  type="button"
                  className="paper-personal-text-box__strip-action paper-personal-text-box__strip-action--danger"
                  aria-label="删除旁注"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPopover(null)
                    api.deleteObject(object.id)
                  }}
                >
                  <Trash size={16} />
                  删除
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    )
  }

  const noteSelected = selectedId != null && placed.some((note) => note.object.id === selectedId)
  return (
    <>
      <div
        ref={layerRef}
        className={`paper-personal-paper-note-layer${placing ? ' is-placing' : ''}`}
        onClick={handleLayerClick}
      >
        {placed.map((note) => renderNote(note))}
        {/* Hit surfaces while a note is selected or edited (not just when
         * placing): the paper iframe swallows clicks, so this is what lets a
         * blank-paper click deselect or close the editor. */}
        {(placing || editing || noteSelected) && frames.map((frame) => (
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
