import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  createPersonalMutationId,
  type PersonalObject,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import {
  isPersonalTextDocumentBlank,
  type PersonalTextDocumentV1,
  type PersonalTextPresentation,
} from '../../../../../shared/personal-text/index.mjs'
import { PersonalTextEditor } from './PersonalTextEditor'
import { PersonalTextView } from './PersonalTextView'
import { TextBoxPresentationControls, type TextBoxPresentationChange } from './PaperTextBoxStrip'
import { BookMarked, Copy, Trash } from '../../../icons'
import { placeNoteNearAnchor, type NoteSlot } from './paperNotePlacement'
import { clampPlacement, frameAtPoint, MM_TO_PX, mmToPx, pxToMm, type PaperPageFrame } from './paperPlacement'
import { DRAG_THRESHOLD_PX, PASTE_OFFSET_MM, isEditableTarget, isMac } from './PaperTextBoxLayer'
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

// A card's live placement (page-internal mm) — the stored placement for
// page-position notes, the resolved candidate for auto notes, and the
// transient pointer position while dragging.
type NotePlacement = { pageId: string; xMm: number; yMm: number; widthMm: number }

// Nudges use 10mm steps (5mm for text boxes): note positions are coarser, the
// card jumps between margin and content, not glyph-aligned text.
const NUDGE_STEP_MM = 1
const NUDGE_FAST_STEP_MM = 10

// A note card never shrinks below the margin-slot minimum width.
const NOTE_MIN_WIDTH_MM = 16

// Transient pointer state: the live placement lives here (never in an op)
// until release commits exactly one update {placement}.
type MoveInteraction = {
  kind: 'move'
  pointerId: number
  objectId: string
  scale: number
  startClient: { x: number; y: number }
  grabOffsetMm: { x: number; y: number }
  placement: NotePlacement
  moved: boolean
}
type ResizeInteraction = {
  kind: 'resize'
  pointerId: number
  objectId: string
  scale: number
  startClientX: number
  startWidthMm: number
  pageId: string
  pageWidthMm: number
  xMm: number
  yMm: number
  widthMm: number
  moved: boolean
}
type NoteInteraction = MoveInteraction | ResizeInteraction

// In-memory duplicate buffer: deliberately not the system clipboard and not
// storage — a note only pastes back into this layer session.
type NoteClipboard = {
  textAnchor: AnchoredNoteObject['textAnchor']
  document: PersonalTextDocumentV1
  placement: NotePlacement
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

// Live placement of an interacting card: move carries the full placement,
// resize overrides only the width.
function interactionPlacement(interaction: NoteInteraction): NotePlacement {
  if (interaction.kind === 'move') return interaction.placement
  return {
    pageId: interaction.pageId,
    xMm: interaction.xMm,
    yMm: interaction.yMm,
    widthMm: interaction.widthMm,
  }
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
  const [interaction, setInteraction] = useState<NoteInteraction | null>(null)
  const flashTimeoutRef = useRef<number | null>(null)
  const clipboardRef = useRef<NoteClipboard | null>(null)
  // Consecutive nudges share one mergeKey; any other edit resets it first.
  const nudgeMergeKeyRef = useRef<string | null>(null)
  const nudgeSeqRef = useRef(0)

  const { canEdit, selectedId, setSelectedId, setPopover, apply, seal } = api

  // Synchronous mirror: pointer events and blur can race the next render, and
  // the close guards below must not read a stale editing state.
  const editingRef = useRef<NoteEditing | null>(null)
  editingRef.current = editing
  const interactionRef = useRef<NoteInteraction | null>(null)
  interactionRef.current = interaction

  // Synchronous mirror: pointer events can race the next render (e.g. a
  // pointerdown right after pointerup), and the gesture guards must not read
  // a stale interaction.
  const setInteractionState = useCallback((next: NoteInteraction | null) => {
    interactionRef.current = next
    setInteraction(next)
  }, [])

  const resetNudgeRun = useCallback(() => {
    nudgeMergeKeyRef.current = null
  }, [])

  // A new layout invalidates transient pointer state (page ids change).
  useEffect(() => {
    setInteractionState(null)
    nudgeMergeKeyRef.current = null
  }, [layoutId, setInteractionState])

  // Consecutive nudges share one mergeKey; any other edit resets it first.
  useEffect(() => {
    nudgeMergeKeyRef.current = null
  }, [selectedId])

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
    resetNudgeRun()
    const mergeKey = api.nextEditKey()
    const state: NoteEditing = {
      key: `note-${mergeKey}`,
      mergeKey,
      objectId,
      document: structuredClone(object.document),
    }
    editingRef.current = state
    setEditing(state)
  }, [api, canEdit, resetNudgeRun, seal])

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

  const layerScale = useCallback(() => {
    const layer = layerRef.current
    if (!layer || layer.offsetWidth === 0) return 1
    return layer.getBoundingClientRect().width / layer.offsetWidth
  }, [])

  // Card-relative point (unscaled px + mm) from a pointer event.
  const canvasPoint = useCallback((event: ReactPointerEvent, scale: number) => {
    const layer = layerRef.current
    if (!layer) return null
    const rect = layer.getBoundingClientRect()
    const xPx = (event.clientX - rect.left) / scale
    const yPx = (event.clientY - rect.top) / scale
    return { xPx, yPx, xMm: pxToMm(xPx), yMm: pxToMm(yPx) }
  }, [])

  // One op per completed gesture: drag and resize both end here. The commit
  // always writes page-position at the current layoutId — an auto card the
  // teacher moved by hand is user-placed from then on (its rendered width is
  // kept, so a margin card does not jump back to 56mm).
  const commitPlacement = useCallback((objectId: string, placement: NotePlacement) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'anchored-note') return
    const stored = object.placement.kind === 'page-position' ? object.placement : null
    if (
      stored
      && stored.pageId === placement.pageId
      && stored.xMm === placement.xMm
      && stored.yMm === placement.yMm
      && stored.widthMm === placement.widthMm
    ) return
    seal()
    resetNudgeRun()
    apply([{ op: 'update', objectId, patch: { placement: { kind: 'page-position', layoutId, ...placement } } }])
  }, [api.objectById, apply, layoutId, resetNudgeRun, seal])

  const startMove = useCallback((event: ReactPointerEvent<HTMLDivElement>, objectId: string, placement: NotePlacement) => {
    if (editingRef.current || interactionRef.current || event.button !== 0) return
    if (!canEdit || selectedId !== objectId) return
    // Strip and resize handle clicks belong to their own controls.
    if (event.target instanceof Element && event.target.closest('.paper-personal-text-box__strip, .paper-personal-text-box__resize-handle')) return
    const scale = layerScale()
    const point = canvasPoint(event, scale)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setInteractionState({
      kind: 'move',
      pointerId: event.pointerId,
      objectId,
      scale,
      startClient: { x: event.clientX, y: event.clientY },
      grabOffsetMm: { x: point.xMm - placement.xMm, y: point.yMm - placement.yMm },
      placement: { ...placement },
      moved: false,
    })
  }, [canEdit, canvasPoint, layerScale, selectedId, setInteractionState])

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>, objectId: string, placement: NotePlacement) => {
    event.stopPropagation()
    if (editingRef.current || interactionRef.current || event.button !== 0) return
    if (!canEdit || selectedId !== objectId) return
    const scale = layerScale()
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setInteractionState({
      kind: 'resize',
      pointerId: event.pointerId,
      objectId,
      scale,
      startClientX: event.clientX,
      startWidthMm: placement.widthMm,
      pageId: placement.pageId,
      pageWidthMm: frameByPageId.get(placement.pageId)?.widthMm ?? 0,
      xMm: placement.xMm,
      yMm: placement.yMm,
      widthMm: placement.widthMm,
      moved: false,
    })
  }, [canEdit, frameByPageId, layerScale, selectedId, setInteractionState])

  const updateInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interactionRef.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.kind === 'move') {
      const point = canvasPoint(event, current.scale)
      if (point) {
        // Over a page: follow the pointer and re-home to that page. Between
        // pages: keep the last valid transient position. No ink probe here —
        // the teacher may deliberately place a note over the body text.
        const frame = frameAtPoint(frames, point.xPx, point.yPx)
        if (frame) {
          const next = clampPlacement(
            point.xMm - current.grabOffsetMm.x,
            point.yMm - current.grabOffsetMm.y,
            current.placement.widthMm,
            frame,
          )
          current.placement = { pageId: frame.pageId, ...next }
        }
      }
      const moved = current.moved
        || Math.hypot(event.clientX - current.startClient.x, event.clientY - current.startClient.y) >= DRAG_THRESHOLD_PX
      setInteractionState({ ...current, placement: current.placement, moved })
    } else {
      const deltaMm = pxToMm((event.clientX - current.startClientX) / current.scale)
      current.widthMm = Math.min(
        current.pageWidthMm - current.xMm,
        Math.max(NOTE_MIN_WIDTH_MM, current.startWidthMm + deltaMm),
      )
      const moved = current.moved || Math.abs(event.clientX - current.startClientX) >= DRAG_THRESHOLD_PX
      setInteractionState({ ...current, widthMm: current.widthMm, moved })
    }
  }, [canvasPoint, frames, setInteractionState])

  const finishInteraction = useCallback(() => {
    const current = interactionRef.current
    if (!current) return
    setInteractionState(null)
    if (!current.moved) return
    if (current.kind === 'move') {
      commitPlacement(current.objectId, current.placement)
    } else {
      commitPlacement(current.objectId, {
        pageId: current.pageId,
        xMm: current.xMm,
        yMm: current.yMm,
        widthMm: current.widthMm,
      })
    }
  }, [commitPlacement, setInteractionState])

  const applyNudge = useCallback((dxMm: number, dyMm: number) => {
    const note = placed.find((item) => item.object.id === selectedId)
    if (!note || editingRef.current || interactionRef.current) return
    const next = clampPlacement(note.xMm + dxMm, note.yMm + dyMm, note.widthMm, note.frame)
    if (next.xMm === note.xMm && next.yMm === note.yMm) return
    if (!nudgeMergeKeyRef.current) {
      seal()
      nudgeSeqRef.current += 1
      nudgeMergeKeyRef.current = `note-nudge-${nudgeSeqRef.current}`
    }
    apply(
      [{ op: 'update', objectId: note.object.id, patch: { placement: { kind: 'page-position', layoutId, pageId: note.frame.pageId, ...next } } }],
      { mergeKey: nudgeMergeKeyRef.current },
    )
  }, [apply, layoutId, placed, seal, selectedId])

  const copySelectedNote = useCallback(() => {
    const note = placed.find((item) => item.object.id === selectedId)
    if (!note) return
    clipboardRef.current = {
      textAnchor: structuredClone(note.object.textAnchor),
      document: structuredClone(note.object.document),
      placement: { pageId: note.frame.pageId, xMm: note.xMm, yMm: note.yMm, widthMm: note.widthMm },
    }
  }, [placed, selectedId])

  const pasteCopiedNote = useCallback(() => {
    const clipboard = clipboardRef.current
    if (!clipboard || !canEdit) return
    const frame = frameByPageId.get(clipboard.placement.pageId)
    if (!frame) return
    const next = clampPlacement(
      clipboard.placement.xMm + PASTE_OFFSET_MM,
      clipboard.placement.yMm + PASTE_OFFSET_MM,
      clipboard.placement.widthMm,
      frame,
    )
    const id = createPersonalMutationId()
    seal()
    resetNudgeRun()
    const result = apply([{
      op: 'create',
      object: {
        id,
        type: 'anchored-note',
        textAnchor: structuredClone(clipboard.textAnchor),
        document: structuredClone(clipboard.document),
        placement: { kind: 'page-position', layoutId, pageId: frame.pageId, ...next },
      },
    }])
    if (result.ok) setSelectedId(id)
  }, [apply, canEdit, frameByPageId, layoutId, resetNudgeRun, seal, setSelectedId])

  // 复制旁注 = copy + paste immediately: one duplicate down-right of the original.
  const duplicateSelectedNote = useCallback(() => {
    copySelectedNote()
    pasteCopiedNote()
  }, [copySelectedNote, pasteCopiedNote])

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

  // One window listener for everything the layer owns; bails early whenever
  // the state does not apply (editing, editable focus, no note selection). The
  // text-box layer listens on the same window: this layer mounts first so its
  // handler runs first, and it only preventDefaults when the selection is a
  // note — a text-box selection falls through to that layer untouched.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (interactionRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setInteractionState(null)
        }
        return
      }
      if (event.key === 'Escape' && placing) {
        event.preventDefault()
        setPlacing(false)
        return
      }
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
      if (editingRef.current || isEditableTarget(event.target) || !canEdit) return
      const selected = selectedId ? api.objectById.get(selectedId) : null
      if (!selected || selected.type !== 'anchored-note') return
      const mod = isMac() ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && !event.altKey && !event.shiftKey && key === 'c') {
        // A real text selection elsewhere keeps its native copy behavior.
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) return
        event.preventDefault()
        copySelectedNote()
        return
      }
      if (mod && !event.altKey && !event.shiftKey && key === 'v') {
        event.preventDefault()
        pasteCopiedNote()
        return
      }
      if (mod || event.altKey) return
      if (event.key === 'ArrowLeft') applyNudge(event.shiftKey ? -NUDGE_FAST_STEP_MM : -NUDGE_STEP_MM, 0)
      else if (event.key === 'ArrowRight') applyNudge(event.shiftKey ? NUDGE_FAST_STEP_MM : NUDGE_STEP_MM, 0)
      else if (event.key === 'ArrowUp') applyNudge(0, event.shiftKey ? -NUDGE_FAST_STEP_MM : -NUDGE_STEP_MM)
      else if (event.key === 'ArrowDown') applyNudge(0, event.shiftKey ? NUDGE_FAST_STEP_MM : NUDGE_STEP_MM)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [api.objectById, applyNudge, canEdit, copySelectedNote, pasteCopiedNote, placing, selectedId, setInteractionState])

  const renderNote = (note: PlacedNote): ReactNode => {
    const { object, slot, auto } = note
    // Live placement during a gesture: move carries the full placement, resize
    // overrides only the width; otherwise the resting placement.
    const cardInteraction = interaction?.objectId === object.id ? interaction : null
    const live: NotePlacement = cardInteraction
      ? interactionPlacement(cardInteraction)
      : { pageId: note.frame.pageId, xMm: note.xMm, yMm: note.yMm, widthMm: note.widthMm }
    const liveFrame = cardInteraction ? frameByPageId.get(live.pageId) ?? note.frame : note.frame
    const editingState = editing?.objectId === object.id ? editing : null
    const editingNow = editingState != null
    const selected = selectedId === object.id && !editingNow
    const showStrip = selected && canEdit && !cardInteraction
    // A right-side margin card's strip and editing toolbar would run past the
    // page's right edge anchored at the card's left edge — anchor them at the
    // right edge instead.
    const rightSide = slot === 'margin' && note.xMm + note.widthMm / 2 > note.frame.widthMm / 2
    return (
      <div
        key={object.id}
        className={`paper-personal-paper-note${selected ? ' is-selected' : ''}${editingNow ? ' is-editing' : ''}${rightSide ? ' is-strip-right' : ''}${cardInteraction ? ' is-dragging' : ''}`}
        style={{
          left: liveFrame.leftPx + mmToPx(live.xMm),
          top: liveFrame.topPx + mmToPx(live.yMm),
          width: mmToPx(live.widthMm),
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
        onPointerDown={(event) => {
          if (editingState) return
          startMove(event, object.id, live)
        }}
        onPointerMove={(event) => {
          if (cardInteraction) updateInteraction(event)
        }}
        onPointerUp={() => {
          if (cardInteraction) finishInteraction()
        }}
        onPointerCancel={() => {
          if (cardInteraction) setInteractionState(null)
        }}
        onLostPointerCapture={() => {
          // Capture lost without pointerup (rare): commit what moved so far;
          // no-op when the gesture already finished or was cancelled.
          finishInteraction()
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
                  className="paper-personal-text-box__strip-action"
                  aria-label="复制旁注"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPopover(null)
                    resetNudgeRun()
                    duplicateSelectedNote()
                  }}
                >
                  <Copy size={16} />
                  复制
                </button>
                <button
                  type="button"
                  className="paper-personal-text-box__strip-action paper-personal-text-box__strip-action--danger"
                  aria-label="删除旁注"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPopover(null)
                    resetNudgeRun()
                    api.deleteObject(object.id)
                  }}
                >
                  <Trash size={16} />
                  删除
                </button>
              </div>
            ) : null}
            {/* The handle stays mounted through its own gesture: unmounting a
             * pointer-captured element mid-drag loses the capture. */}
            {selected && canEdit ? (
              <div
                className="paper-personal-text-box__resize-handle"
                onPointerDown={(event) => startResize(event, object.id, live)}
              />
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
