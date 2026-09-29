import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  createPersonalMutationId,
  PERSONAL_PLACEMENT_MAX_WIDTH_MM,
  PERSONAL_PLACEMENT_MIN_WIDTH_MM,
  type PersonalObject,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import {
  createEmptyPersonalTextDocument,
  isPersonalTextDocumentBlank,
  type PersonalTextDocumentV1,
  type PersonalTextPresentation,
} from '../../../../../shared/personal-text/index.mjs'
import { PersonalTextEditor } from './PersonalTextEditor'
import { PersonalTextView } from './PersonalTextView'
import { AlertTriangle } from '../../../icons'
import {
  TextBoxPresentationControls,
  TextBoxSelectionStrip,
  type TextBoxPresentationChange,
} from './PaperTextBoxStrip'
import { clampPlacement, frameAtPoint, mmToPx, pxToMm, type PaperPageFrame } from './paperPlacement'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'
import './personalAnnotations.css'

// New boxes start at 60mm — wide enough for a sentence, clamped per page.
const DEFAULT_WIDTH_MM = 60

// Pointer movement below this screen distance is a click, not a drag.
// Exported for the note card layer's identical drag gesture.
export const DRAG_THRESHOLD_PX = 3

// Copy/paste duplicates offset by this much so the copy is visibly separate.
// Exported for the note card layer's identical duplicate flow.
export const PASTE_OFFSET_MM = 5

// Page-box checks compare server-measured mm against iframe-rendered px; the
// same 2px geometry tolerance as the layout check, in mm, absorbs that drift
// so a box flush against the clamp limit is not flagged as overflowing.
// Exported for the note card layer's identical overflow check.
export const OVERFLOW_TOLERANCE_MM = 1

type TextBoxObject = Extract<PersonalObject, { type: 'text-box' }>
type PagePositionedTextBox = TextBoxObject & {
  placement: Extract<TextBoxObject['placement'], { kind: 'page-position' }>
}
type BoxPlacement = { pageId: string; xMm: number; yMm: number; widthMm: number }

function isPageTextBox(object: PersonalObject, layoutId: string): object is PagePositionedTextBox {
  return object.type === 'text-box'
    && object.placement.kind === 'page-position'
    && object.placement.layoutId === layoutId
}

// A text box placed under a previous layout: still page-positioned, just not
// this layout, so it renders nowhere until the teacher re-homes it.
function isForeignPageTextBox(object: PersonalObject, layoutId: string): object is PagePositionedTextBox {
  return object.type === 'text-box'
    && object.placement.kind === 'page-position'
    && object.placement.layoutId !== layoutId
}

/*
 * The box being edited. A draft reserves its mutation id up front; the first
 * non-blank change turns it into the created object's id, and the mergeKey
 * (shared with the annotations hook's edit sequence) keeps create + typing in
 * one undo step.
 */
type TextBoxEditing = {
  key: string
  mergeKey: string
  id: string
  objectId: string | null
  placement: BoxPlacement
  document: PersonalTextDocumentV1
}

/*
 * Transient pointer state: the live placement lives here (never in an op)
 * until release commits exactly one update {placement}.
 */
type MoveInteraction = {
  kind: 'move'
  pointerId: number
  objectId: string
  scale: number
  startClient: { x: number; y: number }
  grabOffsetMm: { x: number; y: number }
  placement: BoxPlacement
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
type BoxInteraction = MoveInteraction | ResizeInteraction

// In-memory duplicate buffer: deliberately not the system clipboard and not
// storage — a text box only pastes back into this layer session.
type BoxClipboard = {
  document: PersonalTextDocumentV1
  placement: BoxPlacement
}

// Shared with the note card layer's window keydown handling (same guard
// semantics, no behavior of its own here).
const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

export function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR))
}

export function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform)
}

/*
 * Free text boxes on the paper view: renders every text-box of the current
 * layout on its page, hosts the in-place editor, and owns selection
 * interactions (drag to move, resize width, keyboard nudge, copy/paste).
 * Placed at the click point while 「添加文字」 is armed.
 */
export function PaperTextBoxLayer({
  api,
  frames,
  layoutId,
  armed,
  onPlaced,
  noticeTarget,
}: {
  api: PersonalAnnotationsApi
  frames: readonly PaperPageFrame[]
  layoutId: string
  armed: boolean
  onPlaced: () => void
  /** Mount point for the quiet notices above the paper (outside the zoom transform). */
  noticeTarget: HTMLElement | null
}): ReactNode {
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [editing, setEditing] = useState<TextBoxEditing | null>(null)
  const [interaction, setInteraction] = useState<BoxInteraction | null>(null)
  // Keys (object id, or the draft key while editing) of boxes whose rendered
  // bottom/right edge leaves their page box.
  const [overflowKeys, setOverflowKeys] = useState<ReadonlySet<string>>(new Set())
  // 「逐个摆放」 armed: hit surfaces turn crosshair and the next page click
  // re-homes the first old-layout box.
  const [rePlacing, setRePlacing] = useState(false)
  const clipboardRef = useRef<BoxClipboard | null>(null)
  const nudgeMergeKeyRef = useRef<string | null>(null)
  const nudgeSeqRef = useRef(0)
  // Latest-value mirrors so native listeners and guards read synchronously
  // between renders (blur/pointerdown can both close the same editor).
  const editingRef = useRef<TextBoxEditing | null>(null)
  const interactionRef = useRef<BoxInteraction | null>(null)
  editingRef.current = editing
  interactionRef.current = interaction

  // Synchronous mirror: pointer events can race the next render (e.g. a
  // pointerdown right after pointerup), and the guards below must not read a
  // stale interaction.
  const setInteractionState = useCallback((next: BoxInteraction | null) => {
    interactionRef.current = next
    setInteraction(next)
  }, [])

  const { apply, canEdit, seal, selectedId, setSelectedId } = api

  const frameByPageId = useMemo(
    () => new Map(frames.map((frame) => [frame.pageId, frame])),
    [frames],
  )
  const boxes = useMemo(
    () => api.objects.filter((object) => isPageTextBox(object, layoutId)),
    [api.objects, layoutId],
  )
  const selectedBox = useMemo(
    () => (selectedId ? boxes.find((object) => object.id === selectedId) ?? null : null),
    [boxes, selectedId],
  )
  // Boxes placed under a previous layout: never rendered, never moved or
  // deleted automatically — the teacher re-homes them one by one.
  const foreignBoxes = useMemo(
    () => api.objects.filter((object) => isForeignPageTextBox(object, layoutId)),
    [api.objects, layoutId],
  )
  const rePlaceTarget = rePlacing ? foreignBoxes[0] ?? null : null
  const rePlaceTargetRef = useRef<typeof rePlaceTarget>(null)
  rePlaceTargetRef.current = rePlaceTarget

  // A new layout invalidates transient pointer state (page ids change).
  useEffect(() => {
    setInteractionState(null)
    nudgeMergeKeyRef.current = null
  }, [layoutId, setInteractionState])

  // Consecutive nudges share one mergeKey; any other edit resets it first.
  useEffect(() => {
    nudgeMergeKeyRef.current = null
  }, [selectedId])

  const resetNudgeRun = useCallback(() => {
    nudgeMergeKeyRef.current = null
  }, [])

  // Same flow as the reading-view note: draft not saved until non-blank;
  // later changes update {document} with the same mergeKey.
  const saveEditingDocument = useCallback((state: TextBoxEditing, document: PersonalTextDocumentV1) => {
    if (state.objectId) {
      apply([{ op: 'update', objectId: state.objectId, patch: { document } }], { mergeKey: state.mergeKey })
      return
    }
    if (isPersonalTextDocumentBlank(document)) return
    const result = apply([{
      op: 'create',
      object: {
        id: state.id,
        type: 'text-box',
        document,
        placement: { kind: 'page-position', layoutId, ...state.placement },
      },
    }], { mergeKey: state.mergeKey })
    if (result.ok) {
      setSelectedId(state.id)
      setEditing((current) => (current?.key === state.key ? { ...current, objectId: state.id } : current))
    }
  }, [apply, layoutId, setSelectedId])

  // A box emptied during this session is removed in the same undo step.
  // Must stay idempotent: blur and the iframe pointerdown can both close the
  // same editor before React re-renders, and a doubled delete op would raise
  // a false failure notice.
  const closeEditing = useCallback((state: TextBoxEditing) => {
    if (editingRef.current?.key !== state.key) return
    editingRef.current = null
    setEditing(null)
    const object = state.objectId ? api.objectById.get(state.objectId) : null
    if (object && object.type === 'text-box' && isPersonalTextDocumentBlank(object.document)) {
      apply([{ op: 'delete', objectId: object.id }], { mergeKey: state.mergeKey })
    }
    seal()
  }, [api.objectById, apply, seal])

  const placeDraft = useCallback((frame: PaperPageFrame, xMm: number, yMm: number) => {
    if (!canEdit) return
    seal()
    resetNudgeRun()
    const mergeKey = api.nextEditKey()
    const state: TextBoxEditing = {
      key: `text-box-${mergeKey}`,
      mergeKey,
      id: createPersonalMutationId(),
      objectId: null,
      placement: { pageId: frame.pageId, ...clampPlacement(xMm, yMm, DEFAULT_WIDTH_MM, frame) },
      document: createEmptyPersonalTextDocument(),
    }
    editingRef.current = state
    setEditing(state)
    onPlaced()
  }, [api, canEdit, onPlaced, resetNudgeRun, seal])

  const openBoxEditor = useCallback((objectId: string) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'text-box' || !canEdit) return
    if (object.placement.kind !== 'page-position') return
    seal()
    resetNudgeRun()
    setInteractionState(null)
    const mergeKey = api.nextEditKey()
    const state: TextBoxEditing = {
      key: `text-box-${mergeKey}`,
      mergeKey,
      id: objectId,
      objectId,
      placement: {
        pageId: object.placement.pageId,
        xMm: object.placement.xMm,
        yMm: object.placement.yMm,
        widthMm: object.placement.widthMm,
      },
      document: object.document,
    }
    editingRef.current = state
    setEditing(state)
  }, [api, canEdit, resetNudgeRun, seal, setInteractionState])

  // Re-place commit: ONE update op at the click point, keeping the box's own
  // width (clamped to the new page). The old layoutId only survives in undo
  // history, so Cmd/Ctrl+Z puts the box back into the old-layout set.
  const reHomeBox = useCallback((target: TextBoxObject, frame: PaperPageFrame, xMm: number, yMm: number) => {
    if (target.placement.kind !== 'page-position') return
    seal()
    resetNudgeRun()
    apply([{
      op: 'update',
      objectId: target.id,
      patch: {
        placement: {
          kind: 'page-position',
          layoutId,
          pageId: frame.pageId,
          ...clampPlacement(xMm, yMm, target.placement.widthMm, frame),
        },
      },
    }])
  }, [apply, layoutId, resetNudgeRun, seal])

  // Armed click on the page stack starts a draft at the click point (an open
  // editor is closed first); box clicks stopPropagation before reaching here.
  // While 「逐个摆放」 is armed the click re-homes the first old-layout box
  // instead — re-place takes priority over placing a new draft.
  const handleLayerClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (event.target instanceof Element && event.target.closest('.paper-personal-text-box')) return
    const rePlaceTarget = rePlaceTargetRef.current
    if (!rePlaceTarget && !armed) {
      setSelectedId(null)
      if (editingRef.current) closeEditing(editingRef.current)
      return
    }
    const layer = layerRef.current
    if (!layer || !canEdit) return
    // getBoundingClientRect is scaled by the canvas transform; offsetWidth is
    // the unscaled layout width, so their ratio recovers the zoom factor.
    const rect = layer.getBoundingClientRect()
    const scale = rect.width / layer.offsetWidth
    const xPx = (event.clientX - rect.left) / scale
    const yPx = (event.clientY - rect.top) / scale
    const frame = frameAtPoint(frames, xPx, yPx)
    if (rePlaceTarget) {
      if (!frame) return
      reHomeBox(rePlaceTarget, frame, pxToMm(xPx - frame.leftPx), pxToMm(yPx - frame.topPx))
      return
    }
    if (!frame) return
    if (editingRef.current) closeEditing(editingRef.current)
    setSelectedId(null)
    placeDraft(frame, pxToMm(xPx - frame.leftPx), pxToMm(yPx - frame.topPx))
  }, [armed, canEdit, closeEditing, frames, placeDraft, reHomeBox, setSelectedId])

  // One op per completed gesture: drag, resize and nudge all end here.
  const commitPlacement = useCallback((objectId: string, placement: BoxPlacement) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'text-box' || object.placement.kind !== 'page-position') return
    const stored = object.placement
    if (
      stored.pageId === placement.pageId
      && stored.xMm === placement.xMm
      && stored.yMm === placement.yMm
      && stored.widthMm === placement.widthMm
    ) return
    seal()
    resetNudgeRun()
    apply([{ op: 'update', objectId, patch: { placement: { kind: 'page-position', layoutId, ...placement } } }])
  }, [api.objectById, apply, layoutId, resetNudgeRun, seal])

  const layerScale = useCallback(() => {
    const layer = layerRef.current
    if (!layer || layer.offsetWidth === 0) return 1
    return layer.getBoundingClientRect().width / layer.offsetWidth
  }, [])

  // Canvas-relative point (unscaled px + mm) from a pointer event.
  const canvasPoint = useCallback((event: ReactPointerEvent, scale: number) => {
    const layer = layerRef.current
    if (!layer) return null
    const rect = layer.getBoundingClientRect()
    const xPx = (event.clientX - rect.left) / scale
    const yPx = (event.clientY - rect.top) / scale
    return { xPx, yPx, xMm: pxToMm(xPx), yMm: pxToMm(yPx) }
  }, [])

  const startMove = useCallback((event: ReactPointerEvent<HTMLDivElement>, objectId: string, placement: BoxPlacement) => {
    if (editingRef.current || interactionRef.current || event.button !== 0) return
    if (!canEdit || selectedId !== objectId) return
    // Strip and resize handle clicks belong to their own controls.
    if (event.target instanceof Element && event.target.closest('.paper-personal-text-box__strip, .paper-personal-text-box__resize-handle')) return
    const scale = layerScale()
    const point = canvasPoint(event, scale)
    if (!point) return
    event.preventDefault()
    // preventDefault above also blocks the native focus move, which Enter-to-edit needs.
    event.currentTarget.focus({ preventScroll: true })
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

  const startResize = useCallback((event: ReactPointerEvent<HTMLDivElement>, objectId: string, placement: BoxPlacement, frame: PaperPageFrame) => {
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
      pageWidthMm: frame.widthMm,
      xMm: placement.xMm,
      yMm: placement.yMm,
      widthMm: placement.widthMm,
      moved: false,
    })
  }, [canEdit, layerScale, selectedId, setInteractionState])

  const updateInteraction = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const current = interactionRef.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.kind === 'move') {
      const point = canvasPoint(event, current.scale)
      if (point) {
        // Over a page: follow the pointer and re-home to that page. Between
        // pages: keep the last valid transient position.
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
        PERSONAL_PLACEMENT_MAX_WIDTH_MM,
        Math.max(PERSONAL_PLACEMENT_MIN_WIDTH_MM, current.startWidthMm + deltaMm),
        Math.max(PERSONAL_PLACEMENT_MIN_WIDTH_MM, current.pageWidthMm - current.xMm),
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
    const selected = selectedBox
    if (!selected || selected.placement.kind !== 'page-position') return
    const frame = frameByPageId.get(selected.placement.pageId)
    if (!frame) return
    const next = clampPlacement(
      selected.placement.xMm + dxMm,
      selected.placement.yMm + dyMm,
      selected.placement.widthMm,
      frame,
    )
    if (next.xMm === selected.placement.xMm && next.yMm === selected.placement.yMm) return
    if (!nudgeMergeKeyRef.current) {
      seal()
      nudgeSeqRef.current += 1
      nudgeMergeKeyRef.current = `text-box-nudge-${nudgeSeqRef.current}`
    }
    apply(
      [{ op: 'update', objectId: selected.id, patch: { placement: { kind: 'page-position', layoutId, pageId: selected.placement.pageId, ...next } } }],
      { mergeKey: nudgeMergeKeyRef.current },
    )
  }, [apply, frameByPageId, layoutId, seal, selectedBox])

  const copySelectedBox = useCallback(() => {
    const selected = selectedBox
    if (!selected || selected.placement.kind !== 'page-position') return
    clipboardRef.current = {
      document: structuredClone(selected.document),
      placement: {
        pageId: selected.placement.pageId,
        xMm: selected.placement.xMm,
        yMm: selected.placement.yMm,
        widthMm: selected.placement.widthMm,
      },
    }
  }, [selectedBox])

  const pasteCopiedBox = useCallback(() => {
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
        type: 'text-box',
        document: structuredClone(clipboard.document),
        placement: { kind: 'page-position', layoutId, pageId: frame.pageId, ...next },
      },
    }])
    if (result.ok) setSelectedId(id)
  }, [apply, canEdit, layoutId, resetNudgeRun, seal, setSelectedId])

  // 复制文字框 = copy + paste immediately: one duplicate next to the original.
  const duplicateSelectedBox = useCallback(() => {
    copySelectedBox()
    pasteCopiedBox()
  }, [copySelectedBox, pasteCopiedBox])

  // 转到附页: one update op to the appendix placement. The current page
  // position rides along as the origin — it is what the appendix numbering
  // and a later 移回卷面 read back. Shared by the strip (selected box) and
  // the overflow notice (first overflowing box).
  const moveBoxToAppendix = useCallback((objectId: string) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'text-box' || object.placement.kind !== 'page-position') return
    seal()
    resetNudgeRun()
    setInteractionState(null)
    apply([{
      op: 'update',
      objectId,
      patch: { placement: { kind: 'appendix', origin: { ...object.placement } } },
    }])
    setSelectedId((current) => (current === objectId ? null : current))
  }, [api.objectById, apply, resetNudgeRun, seal, setSelectedId, setInteractionState])

  const moveSelectedBoxToAppendix = useCallback(() => {
    if (selectedBox) moveBoxToAppendix(selectedBox.id)
  }, [moveBoxToAppendix, selectedBox])

  // Notice action: the first overflowing box goes to the appendix — same
  // implementation as the strip's 转到附页.
  const moveFirstOverflowingBoxToAppendix = useCallback(() => {
    const target = boxes.find((object) => overflowKeys.has(object.id))
    if (target) moveBoxToAppendix(target.id)
  }, [boxes, moveBoxToAppendix, overflowKeys])

  const deleteSelectedBox = useCallback(() => {
    if (!selectedBox) return
    resetNudgeRun()
    api.deleteObject(selectedBox.id)
  }, [api, resetNudgeRun, selectedBox])

  const applySelectedPresentation = useCallback((objectId: string, patch: TextBoxPresentationChange) => {
    const object = api.objectById.get(objectId)
    if (!object || object.type !== 'text-box') return
    seal()
    resetNudgeRun()
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
  }, [api.objectById, apply, resetNudgeRun, seal])

  // While editing, presentation changes ride the editor's own mergeKey, so
  // font/size changes merge into the same undo step as the typing.
  const applyEditingPresentation = useCallback((state: TextBoxEditing, patch: TextBoxPresentationChange) => {
    const document: PersonalTextDocumentV1 = {
      ...state.document,
      presentation: { ...state.document.presentation, ...patch } as PersonalTextPresentation,
    }
    setEditing((current) => (current?.key === state.key ? { ...current, document } : current))
    saveEditingDocument(state, document)
  }, [saveEditingDocument])

  // Boxes carry data-box-key/data-page-id so the measured node maps back to
  // its page frame; offset* values are layout px, untouched by the canvas
  // zoom transform, and the layer aligns with the iframe document the frames
  // were measured in.
  const measureOverflow = useCallback(() => {
    const layer = layerRef.current
    if (!layer) return
    const next = new Set<string>()
    for (const node of layer.querySelectorAll<HTMLElement>('.paper-personal-text-box[data-box-key]')) {
      const frame = frameByPageId.get(node.dataset.pageId ?? '')
      const key = node.dataset.boxKey ?? ''
      if (!frame || !key) continue
      const bottomMm = pxToMm(node.offsetTop + node.offsetHeight - frame.topPx)
      const rightMm = pxToMm(node.offsetLeft + node.offsetWidth - frame.leftPx)
      if (
        bottomMm > frame.heightMm + OVERFLOW_TOLERANCE_MM
        || rightMm > frame.widthMm + OVERFLOW_TOLERANCE_MM
      ) next.add(key)
    }
    setOverflowKeys((current) => {
      if (current.size === next.size && [...next].every((key) => current.has(key))) return current
      return next
    })
  }, [frameByPageId])

  // Cheap enough to run after every render (a handful of boxes), which covers
  // object changes, font/size changes and live drag positions in one place.
  useEffect(() => {
    measureOverflow()
  })

  // Font loading and typing change a box's rendered height without an objects
  // change: watch the elements themselves, and re-check once fonts settle.
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return undefined
    const observer = new ResizeObserver(() => measureOverflow())
    for (const node of layer.querySelectorAll('.paper-personal-text-box')) observer.observe(node)
    return () => observer.disconnect()
  }, [measureOverflow, boxes, editing])

  useEffect(() => {
    let cancelled = false
    document.fonts.ready.then(() => {
      if (!cancelled) measureOverflow()
    }).catch(() => {})
    return () => { cancelled = true }
  }, [measureOverflow])

  // One window listener for everything the layer owns; bails early whenever
  // the state does not apply (editing, editable focus, no selection).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (interactionRef.current) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setInteractionState(null)
        }
        return
      }
      if (event.key === 'Escape' && rePlaceTargetRef.current) {
        event.preventDefault()
        setRePlacing(false)
        return
      }
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
      if (editingRef.current || isEditableTarget(event.target) || !canEdit) return
      const mod = isMac() ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && !event.altKey && !event.shiftKey && key === 'c') {
        // A real text selection elsewhere keeps its native copy behavior.
        const selection = window.getSelection()
        if (selection && !selection.isCollapsed) return
        event.preventDefault()
        copySelectedBox()
        return
      }
      if (mod && !event.altKey && !event.shiftKey && key === 'v') {
        event.preventDefault()
        pasteCopiedBox()
        return
      }
      if (mod || event.altKey) return
      if (event.key === 'ArrowLeft') applyNudge(event.shiftKey ? -5 : -1, 0)
      else if (event.key === 'ArrowRight') applyNudge(event.shiftKey ? 5 : 1, 0)
      else if (event.key === 'ArrowUp') applyNudge(0, event.shiftKey ? -5 : -1)
      else if (event.key === 'ArrowDown') applyNudge(0, event.shiftKey ? 5 : 1)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [applyNudge, canEdit, copySelectedBox, pasteCopiedBox, setInteractionState])

  const renderBox = (
    key: string,
    objectId: string | null,
    placement: BoxPlacement,
    document: PersonalTextDocumentV1,
    editingState: TextBoxEditing | null,
    interacting: BoxInteraction | null,
  ): ReactNode => {
    const frame = frameByPageId.get(placement.pageId)
    if (!frame) return null
    const editingNow = editingState != null
    const selected = objectId != null && selectedId === objectId && !editingNow
    const showStrip = selected && !interacting && canEdit
    // The draft has no object id yet; its editing key is stable per draft.
    const measureKey = objectId ?? editingState?.key ?? ''
    const overflowing = overflowKeys.has(measureKey)
    return (
      <div
        key={key}
        className={`paper-personal-text-box${selected ? ' is-selected' : ''}${editingNow ? ' is-editing' : ''}${interacting ? ' is-dragging' : ''}`}
        style={{
          left: frame.leftPx + mmToPx(placement.xMm),
          top: frame.topPx + mmToPx(placement.yMm),
          width: mmToPx(placement.widthMm),
        }}
        tabIndex={0}
        aria-label="文字框"
        data-box-key={measureKey}
        data-page-id={placement.pageId}
        data-overflow={overflowing ? 'true' : undefined}
        onClick={(event) => {
          event.stopPropagation()
          if (objectId) setSelectedId(objectId)
        }}
        onDoubleClick={() => {
          if (objectId) openBoxEditor(objectId)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !editingNow && objectId) openBoxEditor(objectId)
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
          if (!objectId) return
          startMove(event, objectId, placement)
        }}
        onPointerMove={(event) => {
          if (interacting) updateInteraction(event)
        }}
        onPointerUp={() => {
          if (interacting) finishInteraction()
        }}
        onPointerCancel={() => {
          if (interacting) setInteractionState(null)
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
            value={document}
            ariaLabel="文字框内容"
            autoFocus
            toolbarExtra={canEdit ? (
              <TextBoxPresentationControls
                document={document}
                onChange={(patch) => applyEditingPresentation(editingState, patch)}
              />
            ) : null}
            onChange={(next) => {
              setEditing((current) => (current?.key === editingState.key ? { ...current, document: next } : current))
              saveEditingDocument(editingState, next)
            }}
          />
        ) : (
          <>
            <PersonalTextView document={document} />
            {showStrip && objectId ? (
              <TextBoxSelectionStrip
                document={document}
                onPresentationChange={(patch) => applySelectedPresentation(objectId, patch)}
                onMoveToAppendix={moveSelectedBoxToAppendix}
                onDuplicate={duplicateSelectedBox}
                onDelete={deleteSelectedBox}
              />
            ) : null}
            {/* The handle stays mounted through its own gesture: unmounting a
             * pointer-captured element mid-drag loses the capture. */}
            {selected && canEdit && objectId ? (
              <div
                className="paper-personal-text-box__resize-handle"
                onPointerDown={(event) => startResize(event, objectId, placement, frame)}
              />
            ) : null}
          </>
        )}
      </div>
    )
  }

  const overflowCount = overflowKeys.size
  const foreignCount = foreignBoxes.length
  return (
    <>
      <div
        ref={layerRef}
        className={`paper-personal-text-box-layer${armed ? ' is-armed' : ''}${rePlaceTarget ? ' is-replacing' : ''}`}
        onClick={handleLayerClick}
      >
        {/* The open editor keeps its draft key after the first save, so focus and text history survive. */}
        {boxes.map((object) => renderBox(
          editing?.objectId === object.id ? editing.key : object.id,
          object.id,
          interaction?.objectId === object.id ? interactionPlacement(interaction) : object.placement,
          object.document,
          editing?.objectId === object.id ? editing : null,
          interaction?.objectId === object.id ? interaction : null,
        ))}
        {editing && !editing.objectId
          ? renderBox(editing.key, null, editing.placement, editing.document, editing, null)
          : null}
        {(armed || rePlaceTarget || selectedBox || editing) && frames.map((frame) => (
          <div
            key={`hit-${frame.pageId}`}
            className="paper-personal-text-box-hit"
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
      {/* Notices live in the host toolbar, outside the zoom transform, so they stay
       * quiet 13px UI at every zoom level. */}
      {noticeTarget && (overflowCount > 0 || foreignCount > 0) ? createPortal((
        <>
          {overflowCount > 0 ? (
            <p className="paper-personal-paper-notice" role="status">
              <AlertTriangle size={16} />
              有 {overflowCount} 个文字框超出纸张，调整位置、宽度或字号。
              {canEdit ? (
                <button type="button" className="paper-personal-retry" onClick={moveFirstOverflowingBoxToAppendix}>转到附页</button>
              ) : null}
            </p>
          ) : null}
          {foreignCount > 0 ? (
            <p className="paper-personal-paper-notice" role="status">
              {foreignCount} 个文字框属于旧的纸张版式，需要重新摆放。
              {canEdit ? (
                <button type="button" className="paper-personal-retry" onClick={() => setRePlacing(true)}>逐个摆放</button>
              ) : null}
            </p>
          ) : null}
        </>
      ), noticeTarget) : null}
    </>
  )
}

// Live placement of an interacting box: move carries the full placement,
// resize overrides only the width.
function interactionPlacement(interaction: BoxInteraction): BoxPlacement {
  if (interaction.kind === 'move') return interaction.placement
  return {
    pageId: interaction.pageId,
    xMm: interaction.xMm,
    yMm: interaction.yMm,
    widthMm: interaction.widthMm,
  }
}
