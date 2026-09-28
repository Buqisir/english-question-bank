import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  createEmptyPersonalTextDocument,
  type PersonalTextDocumentV1,
} from '../../../../../shared/personal-text/index.mjs'
import type { PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import { Trash } from '../../../icons'
import { measureAnchorRects, rectContainsPoint, type LayerRect } from './markGeometry'
import { PersonalMarkPopover } from './PersonalMarkPopover'
import { PersonalTextEditor } from './PersonalTextEditor'
import { PersonalTextView } from './PersonalTextView'
import { personalDrawOrder, type PersonalAnnotationsApi, type PersonalNoteEditor } from './usePersonalAnnotations'
import './personalAnnotations.css'

type Geometry = {
  anchors: Map<string, LayerRect[]>
  paper: { left: number; right: number }
  gutter: { left: number; width: number }
}

const EMPTY_GEOMETRY: Geometry = { anchors: new Map(), paper: { left: 0, right: 0 }, gutter: { left: 0, width: 0 } }
const GUTTER_MIN_WIDTH = 200
const GUTTER_MAX_WIDTH = 280
const CARD_GAP = 8

type AnchoredObject = Extract<PersonalObject, { textAnchor: unknown }>

function hasAnchor(object: PersonalObject): object is AnchoredObject {
  return 'textAnchor' in object
}

function useLayerGeometry(hostRef: RefObject<HTMLElement | null>, api: PersonalAnnotationsApi): Geometry {
  const [geometry, setGeometry] = useState<Geometry>(EMPTY_GEOMETRY)
  const { source, objects, snapshot } = api
  const unresolved = useMemo(
    () => new Set((snapshot?.diagnostics ?? []).map((diagnostic) => diagnostic.objectId)),
    [snapshot?.diagnostics],
  )

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host || !source) return undefined
    let frame = 0
    const measure = () => {
      frame = 0
      const origin = host.getBoundingClientRect()
      const paperElement = host.querySelector(':scope > .paper-browse-zoom')
      const paperRect = paperElement?.getBoundingClientRect() ?? origin
      const anchors = new Map<string, LayerRect[]>()
      for (const object of objects) {
        if (!hasAnchor(object) || unresolved.has(object.id)) continue
        const rects = measureAnchorRects(host, origin, source, object)
        if (rects) anchors.set(object.id, rects)
      }
      const panel = document.querySelector('.paper-browse-lecture-panel')
      const panelLeft = panel ? panel.getBoundingClientRect().left : Number.POSITIVE_INFINITY
      const limit = Math.min(window.innerWidth, panelLeft) - origin.left - 16
      const paper = { left: paperRect.left - origin.left, right: paperRect.right - origin.left }
      const gutterLeft = paper.right + 16
      setGeometry({
        anchors,
        paper,
        gutter: { left: gutterLeft, width: Math.min(GUTTER_MAX_WIDTH, limit - gutterLeft) },
      })
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    measure()
    const paperElement = host.querySelector(':scope > .paper-browse-zoom')
    const resize = new ResizeObserver(schedule)
    resize.observe(host)
    if (paperElement) resize.observe(paperElement)
    const mutations = new MutationObserver(schedule)
    if (paperElement) mutations.observe(paperElement, { childList: true, subtree: true, characterData: true })
    // Opening the lecture moves the paper; remeasure the gutter once it settles.
    mutations.observe(host, { attributes: true, attributeFilter: ['data-moving'] })
    window.addEventListener('resize', schedule)
    void document.fonts?.ready.then(schedule)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [hostRef, objects, source, unresolved])

  return geometry
}

function readingOrder(geometry: Geometry, notes: AnchoredObject[]) {
  return notes
    .filter((note) => geometry.anchors.has(note.id))
    .sort((left, right) => {
      const a = geometry.anchors.get(left.id)![0]
      const b = geometry.anchors.get(right.id)![0]
      return a.top - b.top || a.left - b.left || personalDrawOrder(left, right)
    })
}

function NoteCard({
  api,
  note,
  editor,
  index,
  draftDocument,
}: {
  api: PersonalAnnotationsApi
  note: AnchoredObject | null
  editor: PersonalNoteEditor | null
  index: number | null
  draftDocument: PersonalTextDocumentV1
}) {
  const label = index ? `旁注 ${index}` : '新旁注'
  const document = note && 'document' in note ? note.document : draftDocument
  const editing = Boolean(editor)
  return (
    <div
      className={`paper-personal-note-card${editing ? ' is-editing' : ''}${note && api.selectedId === note.id ? ' is-selected' : ''}`}
      data-personal-note-id={note?.id ?? ''}
      onKeyDownCapture={(event) => {
        if (!editor || event.key !== 'Escape' || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        api.closeNote(editor)
      }}
      onBlur={(event) => {
        if (!editor) return
        const next = event.relatedTarget
        if (next instanceof Node && event.currentTarget.contains(next)) return
        api.closeNote(editor)
      }}
    >
      <div className="paper-personal-note-card__head">
        <span className="paper-personal-note-card__label">{label}</span>
        {note && api.canEdit ? (
          <button
            type="button"
            className="paper-personal-icon-button"
            aria-label={`删除${label}`}
            title="删除旁注"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => api.deleteObject(note.id)}
          >
            <Trash size={16} />
          </button>
        ) : null}
      </div>
      {editor ? (
        <PersonalTextEditor
          documentKey={editor.key}
          value={document}
          ariaLabel={`${label}内容`}
          autoFocus
          onChange={(next) => api.saveNoteDocument(editor, next)}
        />
      ) : (
        <button
          type="button"
          className="paper-personal-note-card__view"
          aria-label={`编辑${label}`}
          disabled={!api.canEdit}
          onClick={() => note && api.openNote(note.id)}
        >
          <PersonalTextView document={document} />
        </button>
      )}
    </div>
  )
}

export function PersonalAnnotationLayer({
  api,
  hostRef,
}: {
  api: PersonalAnnotationsApi
  hostRef: RefObject<HTMLElement | null>
}) {
  const geometry = useLayerGeometry(hostRef, api)
  const cardsRef = useRef<HTMLDivElement | null>(null)
  const { objects, noteEditor, selectedId, setSelectedId, setPopover } = api
  const draftDocument = useMemo(() => createEmptyPersonalTextDocument(), [])

  const marks = useMemo(() => {
    const drawn = objects.filter((object): object is AnchoredObject => hasAnchor(object) && geometry.anchors.has(object.id))
    const order = (type: string) => (type === 'highlight' ? 0 : type === 'underline' ? 1 : 2)
    return drawn.sort((left, right) => order(left.type) - order(right.type) || personalDrawOrder(left, right))
  }, [geometry.anchors, objects])

  const notes = useMemo(
    () => readingOrder(geometry, objects.filter((object): object is AnchoredObject => object.type === 'anchored-note')),
    [geometry, objects],
  )
  const noteIndex = useMemo(() => new Map(notes.map((note, index) => [note.id, index + 1])), [notes])
  const wide = geometry.gutter.width >= GUTTER_MIN_WIDTH

  // Clicking inside a mark opens its popover; the click still reaches the paper.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) return
      const target = event.target
      if (target instanceof Element && target.closest('.paper-personal-layer, button, a, input, textarea, [contenteditable="true"]')) return
      const selection = window.getSelection()
      if (selection && !selection.isCollapsed) return
      const origin = host.getBoundingClientRect()
      const x = event.clientX - origin.left
      const y = event.clientY - origin.top
      const hits = marks.filter((object) => geometry.anchors.get(object.id)!.some((rect) => rectContainsPoint(rect, x, y, 1)))
      if (hits.length === 0) {
        setSelectedId(null)
        setPopover(null)
        return
      }
      const ids = hits.map((object) => object.id)
      setSelectedId(ids.length === 1 ? ids[0] : null)
      setPopover({ ids, activeId: ids.length === 1 ? ids[0] : null, point: { x: event.clientX, y: event.clientY } })
    }
    host.addEventListener('click', onClick)
    return () => host.removeEventListener('click', onClick)
  }, [geometry.anchors, hostRef, marks, setPopover, setSelectedId])

  // Stack gutter cards below their anchors without overlapping each other.
  useLayoutEffect(() => {
    const container = cardsRef.current
    if (!container) return undefined
    const place = () => {
      let floor = Number.NEGATIVE_INFINITY
      const cards = [...container.querySelectorAll<HTMLElement>('[data-card-top]')]
        .sort((a, b) => Number(a.dataset.cardTop) - Number(b.dataset.cardTop))
      for (const card of cards) {
        const top = Math.max(Number(card.dataset.cardTop), floor)
        card.style.top = `${top}px`
        floor = top + card.offsetHeight + CARD_GAP
      }
    }
    place()
    const observer = new ResizeObserver(place)
    for (const card of container.querySelectorAll<HTMLElement>('[data-card-top]')) observer.observe(card)
    return () => observer.disconnect()
  })

  const editingRects = useEditingRects(hostRef, api, noteEditor, geometry)

  const cardStyle = (rects: LayerRect[]) => {
    if (wide) return { left: geometry.gutter.left, width: geometry.gutter.width }
    const last = rects[rects.length - 1]
    const width = Math.min(GUTTER_MAX_WIDTH + 40, geometry.paper.right - geometry.paper.left - 24)
    const left = Math.max(geometry.paper.left + 12, Math.min(last.left, geometry.paper.right - width - 12))
    return { left, width }
  }

  const floatingCardTop = (rects: LayerRect[]) => {
    const last = rects[rects.length - 1]
    return wide ? rects[0].top : last.top + last.height + 6
  }

  return (
    <div className="paper-personal-layer" data-personal-layer="">
      <div className="paper-personal-marks" aria-hidden="true">
        {marks.map((object) => geometry.anchors.get(object.id)!.map((rect, index) => (
          <span
            key={`${object.id}-${index}`}
            className={`paper-personal-mark paper-personal-mark--${object.type}${selectedId === object.id ? ' is-selected' : ''}`}
            data-color={object.type === 'highlight' ? object.style.color : undefined}
            data-ink={object.type === 'underline' ? object.style.ink : undefined}
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          />
        )))}
      </div>
      {notes.map((note) => {
        const rects = geometry.anchors.get(note.id)!
        const last = rects[rects.length - 1]
        const index = noteIndex.get(note.id)!
        return (
          <button
            key={`badge-${note.id}`}
            type="button"
            className={`paper-personal-note-badge${noteEditor?.objectId === note.id ? ' is-open' : ''}`}
            style={{ left: last.left + last.width + 2, top: last.top - 6 }}
            aria-label={`打开旁注 ${index}`}
            aria-expanded={noteEditor?.objectId === note.id}
            onClick={() => (noteEditor?.objectId === note.id ? api.closeNote(noteEditor) : api.openNote(note.id))}
          >
            {index}
          </button>
        )
      })}
      <div className="paper-personal-note-cards" ref={cardsRef}>
        {wide ? notes.filter((note) => note.id !== noteEditor?.objectId).map((note) => {
          const rects = geometry.anchors.get(note.id)!
          return (
            <div
              key={note.id}
              className="paper-personal-note-slot"
              data-card-top={rects[0].top}
              style={cardStyle(rects)}
            >
              <NoteCard api={api} note={note} editor={null} index={noteIndex.get(note.id) ?? null} draftDocument={draftDocument} />
            </div>
          )
        }) : null}
        {/* The open editor keeps one slot and key from draft to saved note, so focus survives the first save. */}
        {noteEditor && editingRects ? (
          <div
            key={noteEditor.key}
            className="paper-personal-note-slot"
            data-card-top={floatingCardTop(editingRects)}
            style={cardStyle(editingRects)}
          >
            <NoteCard
              api={api}
              note={noteEditor.objectId ? (api.objectById.get(noteEditor.objectId) as AnchoredObject | undefined) ?? null : null}
              editor={noteEditor}
              index={noteEditor.objectId ? noteIndex.get(noteEditor.objectId) ?? null : null}
              draftDocument={draftDocument}
            />
          </div>
        ) : null}
      </div>
      {api.popover ? createPortal(<PersonalMarkPopover api={api} />, document.body) : null}
    </div>
  )
}

// The open note is measured from its editor state, so a draft and the note it becomes share one position.
function useEditingRects(
  hostRef: RefObject<HTMLElement | null>,
  api: PersonalAnnotationsApi,
  editor: PersonalNoteEditor | null,
  geometry: Geometry,
) {
  const [rects, setRects] = useState<LayerRect[] | null>(null)
  const { source } = api
  const textAnchor = editor?.textAnchor ?? null
  useLayoutEffect(() => {
    const host = hostRef.current
    const frame = requestAnimationFrame(() => {
      if (!host || !source || !textAnchor) {
        setRects(null)
        return
      }
      const pseudo = {
        id: 'editing',
        type: 'highlight',
        textAnchor: {
          ...textAnchor,
          anchorVersion: '',
          groupId: null,
          segments: textAnchor.segments.map((segment) => ({ ...segment, prefix: '', suffix: '', leafIds: [] })),
        },
        style: { color: 'yellow' },
        revision: 0,
        createdAt: '',
        updatedAt: '',
      } as PersonalObject
      setRects(measureAnchorRects(host, host.getBoundingClientRect(), source, pseudo))
    })
    return () => cancelAnimationFrame(frame)
  }, [geometry, hostRef, source, textAnchor])
  return textAnchor ? rects : null
}
