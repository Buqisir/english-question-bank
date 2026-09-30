import { useLayoutEffect, useRef } from 'react'
import { computePosition, flip, offset, shift } from '@floating-ui/react-dom'
import {
  PERSONAL_HIGHLIGHT_COLORS,
  PERSONAL_UNDERLINE_INKS,
  type PersonalObject,
} from '../../../../../shared/personal-paper-layer/index.mjs'
import { Pencil, Trash } from '../../../icons'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'

const HIGHLIGHT_LABEL: Record<string, string> = { yellow: '黄', green: '绿', blue: '蓝', pink: '粉' }
const INK_LABEL: Record<string, string> = { ink: '墨', red: '红' }
const TYPE_LABEL: Record<string, string> = { highlight: '高亮', underline: '下划线', 'anchored-note': '旁注' }

function MarkEditor({ api, object }: { api: PersonalAnnotationsApi; object: PersonalObject }) {
  const label = TYPE_LABEL[object.type] ?? '标注'
  return (
    <div className="paper-personal-popover__editor" role="group" aria-label={`${label}设置`}>
      <span className="paper-personal-popover__type">{label}</span>
      {object.type === 'highlight' ? (
        <div className="paper-personal-popover__swatches">
          {PERSONAL_HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="paper-personal-swatch"
              data-color={color}
              aria-label={`改成${HIGHLIGHT_LABEL[color]}色`}
              aria-pressed={object.style.color === color}
              onClick={() => api.apply([{ op: 'update', objectId: object.id, patch: { style: { color } } }])}
            />
          ))}
        </div>
      ) : null}
      {object.type === 'underline' ? (
        <div className="paper-personal-popover__swatches">
          {PERSONAL_UNDERLINE_INKS.map((ink) => (
            <button
              key={ink}
              type="button"
              className="paper-personal-swatch paper-personal-swatch--ink"
              data-ink={ink}
              aria-label={`改成${INK_LABEL[ink]}色`}
              aria-pressed={object.style.ink === ink}
              onClick={() => api.apply([{ op: 'update', objectId: object.id, patch: { style: { ink } } }])}
            />
          ))}
        </div>
      ) : null}
      {object.type === 'anchored-note' ? (
        <button
          type="button"
          className="paper-personal-popover__action"
          onClick={() => api.openNote(object.id)}
        >
          <Pencil size={16} />
          <span>编辑旁注</span>
        </button>
      ) : null}
      {api.canEdit ? (
        <button
          type="button"
          className="paper-personal-popover__action paper-personal-popover__action--danger"
          onClick={() => {
            api.deleteObject(object.id)
            api.setPopover(null)
          }}
        >
          <Trash size={16} />
          <span>删除</span>
        </button>
      ) : null}
    </div>
  )
}

/*
 * Clicking a mark opens this card at the pointer. When marks overlap it
 * first lists every object under the pointer so a specific one can be
 * picked without disturbing the others.
 */
export function PersonalMarkPopover({ api }: { api: PersonalAnnotationsApi }) {
  const popover = api.popover
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !popover) return
    const virtual = {
      getBoundingClientRect: () => new DOMRect(popover.point.x, popover.point.y, 0, 0),
    }
    void computePosition(virtual, element, {
      strategy: 'fixed',
      placement: 'bottom-start',
      middleware: [offset(8), flip({ padding: 12 }), shift({ padding: 12 })],
    }).then(({ x, y }) => {
      element.style.left = `${x}px`
      element.style.top = `${y}px`
    })
  }, [popover])

  if (!popover) return null
  const objects = popover.ids
    .map((id) => api.objectById.get(id))
    .filter((object): object is PersonalObject => Boolean(object))
  const active = popover.activeId ? api.objectById.get(popover.activeId) : null

  return (
    <div
      ref={ref}
      className="paper-personal-popover"
      role="dialog"
      aria-label="标注"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          api.setPopover(null)
        }
      }}
    >
      {objects.length > 1 && !active ? (
        <div className="paper-personal-popover__list" role="list" aria-label="重叠的标注">
          <p className="paper-personal-popover__hint">这里有 {objects.length} 条标注</p>
          {objects.map((object) => (
            <button
              key={object.id}
              type="button"
              role="listitem"
              className="paper-personal-popover__choice"
              onClick={() => api.setPopover({ ...popover, activeId: object.id })}
            >
              {TYPE_LABEL[object.type]}
              {object.type === 'highlight' ? ` · ${HIGHLIGHT_LABEL[object.style.color]}` : ''}
              {object.type === 'underline' ? ` · ${INK_LABEL[object.style.ink]}` : ''}
            </button>
          ))}
        </div>
      ) : null}
      {active ? (
        <>
          {objects.length > 1 ? (
            <button
              type="button"
              className="paper-personal-popover__back"
              onClick={() => api.setPopover({ ...popover, activeId: null })}
            >
              返回列表
            </button>
          ) : null}
          <MarkEditor api={api} object={active} />
        </>
      ) : null}
      {objects.length === 1 && !active ? <MarkEditor api={api} object={objects[0]} /> : null}
    </div>
  )
}
