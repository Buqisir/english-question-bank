import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PersonalObject } from '../../../../../shared/personal-paper-layer/index.mjs'
import { PAPER_SHEET_BOX_SHADOW } from './PaperEditingView'
import { PersonalTextView } from './PersonalTextView'
import type { AppendixPlanEntry } from './PaperAppendixLayer'
import { scrollElementToVerticalCenter } from './paperScroll'
import type { PersonalAnnotationsApi } from './usePersonalAnnotations'
import './personalAnnotations.css'

// 回到原处：标记 is-flash 挂这么久（同 4c 锚线闪烁）。
const FLASH_MS = 900

type AppendixEntry = {
  entry: AppendixPlanEntry
  object: Extract<PersonalObject, { type: 'anchored-note' | 'text-box' }>
}

// 出处行：旁注「第 N 页 · “首段前 24 字”」，文字框「第 N 页 · 文字框」；页码未知时省略前缀。
function sourceLine(item: AppendixEntry): string {
  const pagePrefix = item.entry.pageIndex != null ? `第 ${item.entry.pageIndex + 1} 页 · ` : ''
  if (item.object.type === 'text-box') return `${pagePrefix}文字框`
  const text = item.object.textAnchor.segments[0]?.exactText ?? ''
  const quoted = text.length > 24 ? `${text.slice(0, 24)}…` : text
  return `${pagePrefix}“${quoted}”`
}

/*
 * 附页预览（#489 §8 4d-A，仅纸张视图）：转附页的对象按编号完整排在这里，
 * 不占原题页。与纸张同一缩放；编号来自 PaperEditingView 的一次计算。
 */
export function PaperAppendixPreview({
  api,
  entries,
  contentWidthPx,
  pageWidthPx,
  leftPx,
  scale,
}: {
  api: PersonalAnnotationsApi
  entries: readonly AppendixPlanEntry[]
  /** The paper zoom block's unscaled width — the preview box matches it exactly. */
  contentWidthPx: number
  /** First page width in unscaled px (layout.pages[0].widthMm). */
  pageWidthPx: number
  /** The paper pages' left offset in unscaled canvas px. */
  leftPx: number
  scale: number
}): ReactNode {
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const [sheetHeight, setSheetHeight] = useState(0)
  const flashTimeoutRef = useRef<number | null>(null)
  const flashedRef = useRef<Element | null>(null)

  // The sheet's height is content-driven; the ResizeObserver feeds the scaled
  // outer box so the preview reserves its real footprint.
  useEffect(() => {
    const sheet = sheetRef.current
    if (!sheet) return undefined
    const observer = new ResizeObserver(() => setSheetHeight(sheet.offsetHeight))
    observer.observe(sheet)
    return () => observer.disconnect()
  })

  useEffect(() => () => {
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
  }, [])

  const visible = entries
    .map((entry) => ({ entry, object: api.objectById.get(entry.id) }))
    .filter((item): item is AppendixEntry => item.object != null
      && (item.object.type === 'anchored-note' || item.object.type === 'text-box'))
  if (visible.length === 0) return null

  const scrollToOriginSpot = (id: string) => {
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' as const : 'smooth' as const
    const marker = document.querySelector(`[data-paper-appendix-marker="${CSS.escape(id)}"]`)
    // No marker (no computable spot): fall back to the anchor's own mark.
    const target = marker ?? document.querySelector(`[data-paper-mark-id="${CSS.escape(id)}"]`)
    if (!target) return
    // Vertical only — scrollIntoView would drag the paper view sideways.
    scrollElementToVerticalCenter(target, behavior)
    if (flashedRef.current) flashedRef.current.classList.remove('is-flash')
    target.classList.remove('is-flash')
    // Reflow so a repeat flash restarts the animation.
    void (target as HTMLElement).offsetWidth
    target.classList.add('is-flash')
    flashedRef.current = target
    if (flashTimeoutRef.current != null) window.clearTimeout(flashTimeoutRef.current)
    flashTimeoutRef.current = window.setTimeout(() => {
      target.classList.remove('is-flash')
      flashedRef.current = null
      flashTimeoutRef.current = null
    }, FLASH_MS)
  }

  const moveBackToPaper = (item: AppendixEntry) => {
    if (!api.canEdit) return
    const placement = item.object.type === 'anchored-note'
      ? { kind: 'auto-near-anchor' as const }
      : item.object.placement.kind === 'appendix' ? item.object.placement.origin : null
    if (!placement) return
    api.seal()
    api.apply([{ op: 'update', objectId: item.object.id, patch: { placement } }])
  }

  return (
    <div
      className="paper-personal-appendix-preview"
      // Same box as the paper zoom block: the wrapping flex line centers it
      // exactly like the paper, and the sheet lands on the paper's left edge
      // via the inner offset — the container's scrollWidth never grows.
      style={{ width: contentWidthPx * scale, height: sheetHeight * scale }}
    >
      <div
        className="paper-personal-appendix-sheet-outer"
        style={{ left: leftPx * scale, width: pageWidthPx * scale, height: sheetHeight * scale }}
      >
        <div
          ref={sheetRef}
          className="paper-personal-appendix-sheet"
          style={{ width: pageWidthPx, transform: `scale(${scale})`, boxShadow: PAPER_SHEET_BOX_SHADOW }}
        >
          <h2 className="paper-personal-appendix-title">附页</h2>
          <p className="paper-personal-appendix-hint">导出「我的批注版」时排在卷末，页数以导出结果为准</p>
          <ol className="paper-personal-appendix-entries">
            {visible.map((item) => {
              const selected = api.selectedId === item.object.id
              return (
                <li
                  key={item.object.id}
                  className={`paper-personal-appendix-entry${selected ? ' is-selected' : ''}`}
                  data-appendix-entry={item.object.id}
                  onClick={() => api.setSelectedId(item.object.id)}
                >
                  <span className="paper-personal-appendix-marker" aria-hidden="true">附{item.entry.number}</span>
                  <div className="paper-personal-appendix-entry-body">
                    <p className="paper-personal-appendix-entry-source">{sourceLine(item)}</p>
                    <PersonalTextView document={item.object.document} />
                  </div>
                  <div className="paper-personal-appendix-entry-actions">
                    <button
                      type="button"
                      className="paper-personal-appendix-entry-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        scrollToOriginSpot(item.object.id)
                      }}
                    >
                      回到原处
                    </button>
                    <button
                      type="button"
                      className="paper-personal-appendix-entry-action"
                      onClick={(event) => {
                        event.stopPropagation()
                        moveBackToPaper(item)
                      }}
                    >
                      移回卷面
                    </button>
                  </div>
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}
