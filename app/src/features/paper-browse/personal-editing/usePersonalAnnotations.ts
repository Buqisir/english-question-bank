import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import {
  PERSONAL_DEFAULT_HIGHLIGHT_COLOR,
  PERSONAL_DEFAULT_UNDERLINE_INK,
  buildPersonalLayerSource,
  createPersonalLayerHistory,
  createPersonalMutationId,
  personalTextAnchorToInput,
  type PersonalHighlightColor,
  type PersonalLayerApplyResult,
  type PersonalLayerSource,
  type PersonalObject,
  type PersonalOperation,
  type PersonalTextAnchorInput,
  type PersonalUnderlineInk,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import {
  isPersonalTextDocumentBlank,
  type PersonalTextDocumentV1,
} from '../../../../../shared/personal-text/index.mjs'
import type { WholePaperConsumption } from '../../paper-intelligence/canonicalConsumptionClient.ts'
import type { MappedSegment } from '../selection/mapDomSelection'
import { mappedSegmentsToAnchorInput } from './anchorDomRange'
import { usePersonalLayerSession } from './usePersonalLayerSession'

export type PersonalMarkType = 'highlight' | 'underline'
export type PersonalPopoverState = {
  /** Every object under the pointer or selection, in draw order. */
  ids: string[]
  activeId: string | null
  point: { x: number; y: number }
}
/*
 * The note being edited. `key` stays the same when a draft becomes a saved
 * object, so the editor keeps focus and its own text history.
 */
export type PersonalNoteEditor = {
  key: string
  objectId: string | null
  textAnchor: PersonalTextAnchorInput
  mergeKey: string
}

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

function isEditableTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR))
}

function isMac() {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform)
}

function rangesOverlap(object: PersonalObject, segments: readonly MappedSegment[]) {
  if (!('textAnchor' in object)) return false
  return object.textAnchor.segments.some((stored) => segments.some((segment) => (
    stored.streamId === segment.streamId && stored.start < segment.end && segment.start < stored.end
  )))
}

function coversExactly(object: PersonalObject, segments: readonly MappedSegment[]) {
  if (!('textAnchor' in object)) return false
  const stored = object.textAnchor.segments
  return stored.length === segments.length && stored.every((segment, index) => (
    segment.streamId === segments[index].streamId
    && segment.start === segments[index].start
    && segment.end === segments[index].end
  ))
}

export function personalDrawOrder(left: PersonalObject, right: PersonalObject) {
  return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
}

const FAILURE_COPY: Record<string, string> = {
  PERSONAL_LAYER_DUPLICATE_MARK: '这段文字已经有同样的标注。',
  PERSONAL_LAYER_DUPLICATE_COMMENTARY: '这道题已经有你的讲评。',
  PERSONAL_LAYER_LIMIT: '批注数量或长度超过上限，这次修改没有保存。',
  PERSONAL_ANCHOR_UNSUPPORTED: '标注不能跨越两个题组，请分开选择。',
  PERSONAL_LAYER_READ_ONLY: '批注当前只读，这次修改没有保存。',
  HISTORY_STALE: '批注已在别处更新，之前的撤销记录已失效。',
}

function failureMessage(result: { code: string; message?: string }) {
  return FAILURE_COPY[result.code] ?? '这次修改没有保存，请重试。'
}

/*
 * Owns one teacher's personal layer on the Paper page: the autosave session,
 * undo history, the selected object and page-level shortcuts. Rendering and
 * geometry live in the layer components; this hook never touches the DOM
 * beyond keyboard listeners.
 */
export function usePersonalAnnotations({
  accountKey,
  paperId,
  consumption,
  enabled,
}: {
  accountKey: string | null
  paperId: string
  consumption: WholePaperConsumption | null
  enabled: boolean
}) {
  const source = useMemo<PersonalLayerSource | null>(() => {
    if (!consumption) return null
    try {
      return buildPersonalLayerSource(consumption)
    } catch {
      return null
    }
  }, [consumption])
  const active = enabled && Boolean(accountKey)
  const { session, snapshot } = usePersonalLayerSession({ accountKey, paperId, source, enabled: active })
  // A new session (account, paper or revision change) never inherits history.
  const history = useMemo(() => (session ? createPersonalLayerHistory() : null), [session])
  const [, bumpHistory] = useReducer((value: number) => value + 1, 0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [popover, setPopover] = useState<PersonalPopoverState | null>(null)
  const [noteEditorState, setNoteEditor] = useState<PersonalNoteEditor | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const editSeqRef = useRef(0)

  const objects = useMemo(() => snapshot?.layer?.objects ?? [], [snapshot?.layer])
  const objectById = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects])
  const canEdit = Boolean(session && snapshot && snapshot.layer && !snapshot.readOnly)

  // Drop UI state that points at an object the layer no longer has.
  const liveSelectedId = selectedId && objectById.has(selectedId) ? selectedId : null
  const noteEditor = noteEditorState && (!noteEditorState.objectId || objectById.has(noteEditorState.objectId))
    ? noteEditorState
    : null
  const livePopover = useMemo(() => {
    if (!popover) return null
    const ids = popover.ids.filter((id) => objectById.has(id))
    if (ids.length === 0) return null
    const activeId = popover.activeId && ids.includes(popover.activeId) ? popover.activeId : (ids.length === 1 ? ids[0] : null)
    return { ...popover, ids, activeId }
  }, [objectById, popover])

  useEffect(() => {
    if (!notice) return undefined
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const apply = useCallback((operations: PersonalOperation[], options: { mergeKey?: string | null } = {}): PersonalLayerApplyResult => {
    if (!session || !history) return { ok: false, code: 'PERSONAL_LAYER_UNAVAILABLE' }
    const before = session.getSnapshot().layer?.objects ?? []
    const result = session.apply(operations)
    if (result.ok) {
      history.record(before, operations, options)
      bumpHistory()
    } else {
      setNotice(failureMessage(result))
    }
    return result
  }, [history, session])

  const step = useCallback((direction: 'undo' | 'redo') => {
    if (!session || !history) return
    history.seal()
    const layer = session.getSnapshot().layer
    if (!layer) return
    const plan = direction === 'undo' ? history.undo(layer.objects) : history.redo(layer.objects)
    if (!plan.ok) {
      if (plan.code === 'HISTORY_STALE') setNotice(failureMessage(plan))
      bumpHistory()
      return
    }
    if (plan.operations.length > 0) {
      const result = session.apply(plan.operations)
      if (!result.ok) {
        setNotice(failureMessage(result))
        return
      }
    }
    plan.commit()
    bumpHistory()
  }, [history, session])

  const deleteObject = useCallback((id: string) => {
    if (!objectById.has(id)) return
    history?.seal()
    const result = apply([{ op: 'delete', objectId: id }])
    if (result.ok) {
      setSelectedId(null)
      setNoteEditor((current) => (current?.objectId === id ? null : current))
    }
  }, [apply, history, objectById])

  const createMark = useCallback((
    type: PersonalMarkType,
    segments: readonly MappedSegment[],
    point: { x: number; y: number },
    // 纸张视图的笔式创建传入记忆的颜色；阅读视图不带（走默认色并开弹层）。
    style: { color?: PersonalHighlightColor; ink?: PersonalUnderlineInk } = {},
    options: { openPopover?: boolean } = {},
  ) => {
    if (!source || !canEdit) return
    history?.seal()
    const existing = objects.find((object) => object.type === type && coversExactly(object, segments))
    if (existing) {
      // Same range, same kind: edit the object that is already there.
      if (options.openPopover === false) return
      setSelectedId(existing.id)
      setPopover({ ids: [existing.id], activeId: existing.id, point })
      return
    }
    const id = createPersonalMutationId()
    const textAnchor = mappedSegmentsToAnchorInput(source, segments)
    const operation: PersonalOperation = type === 'highlight'
      ? { op: 'create', object: { id, type, textAnchor, style: { color: style.color ?? PERSONAL_DEFAULT_HIGHLIGHT_COLOR } } }
      : { op: 'create', object: { id, type, textAnchor, style: { ink: style.ink ?? PERSONAL_DEFAULT_UNDERLINE_INK } } }
    const result = apply([operation])
    if (result.ok && options.openPopover !== false) {
      setSelectedId(id)
      setPopover({ ids: [id], activeId: id, point })
    }
  }, [apply, canEdit, history, objects, source])

  const startNote = useCallback((segments: readonly MappedSegment[]) => {
    if (!source || !canEdit) return
    history?.seal()
    editSeqRef.current += 1
    setPopover(null)
    // Nothing is saved until the teacher types; cancelling leaves no empty shell.
    setNoteEditor({
      key: `draft-${editSeqRef.current}`,
      objectId: null,
      textAnchor: mappedSegmentsToAnchorInput(source, segments),
      mergeKey: `edit-${editSeqRef.current}`,
    })
  }, [canEdit, history, source])

  const openNote = useCallback((id: string) => {
    const object = objectById.get(id)
    if (!object || object.type !== 'anchored-note') return
    history?.seal()
    editSeqRef.current += 1
    setPopover(null)
    setSelectedId(id)
    setNoteEditor({
      key: `note-${id}`,
      objectId: id,
      textAnchor: personalTextAnchorToInput(object.textAnchor),
      mergeKey: `edit-${editSeqRef.current}`,
    })
  }, [history, objectById])

  const saveNoteDocument = useCallback((editor: PersonalNoteEditor, document: PersonalTextDocumentV1) => {
    if (editor.objectId) {
      apply([{ op: 'update', objectId: editor.objectId, patch: { document } }], { mergeKey: editor.mergeKey })
      return
    }
    if (isPersonalTextDocumentBlank(document)) return
    const id = createPersonalMutationId()
    const result = apply([{
      op: 'create',
      object: { id, type: 'anchored-note', textAnchor: editor.textAnchor, document, placement: { kind: 'auto-near-anchor' } },
    }], { mergeKey: editor.mergeKey })
    if (result.ok) {
      setSelectedId(id)
      setNoteEditor((current) => (current?.key === editor.key ? { ...current, objectId: id } : current))
    }
  }, [apply])

  const closeNote = useCallback((editor: PersonalNoteEditor) => {
    const object = editor.objectId ? session?.getSnapshot().layer?.objects.find((item) => item.id === editor.objectId) : null
    // A note emptied during this session is removed in the same undo step.
    if (object && 'document' in object && isPersonalTextDocumentBlank(object.document)) {
      apply([{ op: 'delete', objectId: object.id }], { mergeKey: editor.mergeKey })
    }
    history?.seal()
    setNoteEditor((current) => (current?.key === editor.key ? null : current))
  }, [apply, history, session])

  const overlapping = useCallback((segments: readonly MappedSegment[]) => (
    objects.filter((object) => object.type !== 'commentary' && rangesOverlap(object, segments)).sort(personalDrawOrder)
  ), [objects])

  const nextEditKey = useCallback(() => {
    editSeqRef.current += 1
    return `edit-${editSeqRef.current}`
  }, [])

  useEffect(() => {
    if (!session || !history) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return
      if (isEditableTarget(event.target)) return
      const mod = isMac() ? event.metaKey : event.ctrlKey
      const key = event.key.toLowerCase()
      if (mod && !event.altKey && key === 'z') {
        const redo = event.shiftKey
        if (redo ? !history.canRedo : !history.canUndo) return
        event.preventDefault()
        step(redo ? 'redo' : 'undo')
        return
      }
      if (mod && !event.altKey && !event.shiftKey && key === 'y' && !isMac()) {
        if (!history.canRedo) return
        event.preventDefault()
        step('redo')
        return
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && liveSelectedId && canEdit) {
        event.preventDefault()
        deleteObject(liveSelectedId)
        setPopover(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canEdit, deleteObject, history, liveSelectedId, session, step])

  return {
    active,
    source,
    session,
    snapshot,
    objects,
    objectById,
    canEdit,
    apply,
    undo: () => step('undo'),
    redo: () => step('redo'),
    canUndo: Boolean(history?.canUndo),
    canRedo: Boolean(history?.canRedo),
    currentId: (id: string) => history?.currentId(id) ?? id,
    seal: () => history?.seal(),
    nextEditKey,
    selectedId: liveSelectedId,
    setSelectedId,
    popover: livePopover,
    setPopover,
    noteEditor,
    openNote,
    saveNoteDocument,
    closeNote,
    notice,
    setNotice,
    createMark,
    startNote,
    deleteObject,
    overlapping,
  }
}

export type PersonalAnnotationsApi = ReturnType<typeof usePersonalAnnotations>
