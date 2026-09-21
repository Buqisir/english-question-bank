import { useLayoutEffect, useRef } from 'react'
import { autoUpdate, computePosition, flip, inline, offset, shift, size } from '@floating-ui/react-dom'

export type SelectionOverlayPhase = 'toolbar' | 'loading' | 'result' | 'error'

export type SelectionOverlayProps = {
  phase: SelectionOverlayPhase
  range: Range
  taskMode?: 'contextual-fragment' | 'selected-text'
  translation?: string
  errorMessage?: string
  liveMessage: string
  onTranslate: () => void
  onRetry: () => void
  onPointerInsideChange: (inside: boolean) => void
}

export function SelectionOverlay({
  phase,
  range,
  taskMode,
  translation,
  errorMessage,
  liveMessage,
  onTranslate,
  onRetry,
  onPointerInsideChange,
}: SelectionOverlayProps) {
  const floatingRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const floating = floatingRef.current
    if (!floating) return undefined
    const virtual = {
      getBoundingClientRect: () => {
        const rects = [...range.getClientRects()]
        return rects.at(-1) ?? range.getBoundingClientRect()
      },
      getClientRects: () => range.getClientRects(),
    }
    const update = () => {
      void computePosition(virtual, floating, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: [
          inline(),
          offset(8),
          flip({ padding: 12 }),
          shift({ padding: 12 }),
          size({
            padding: 12,
            apply({ availableWidth, availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxWidth: `${Math.min(320, availableWidth)}px`,
                maxHeight: `${Math.min(360, availableHeight, window.innerHeight * 0.5)}px`,
              })
            },
          }),
        ],
      }).then(({ x, y }) => {
        Object.assign(floating.style, {
          left: `${x}px`,
          top: `${y}px`,
        })
      })
    }
    update()
    return autoUpdate(virtual, floating, update)
  }, [range, phase])

  const kicker = taskMode === 'selected-text' ? '参考译文' : '本文参考译法'

  return (
    <div
      ref={floatingRef}
      className="paper-selection-overlay"
      role="region"
      aria-label="选区翻译"
      onPointerEnter={() => onPointerInsideChange(true)}
      onPointerLeave={() => onPointerInsideChange(false)}
    >
      <div className="paper-selection-live" aria-live="polite">{liveMessage}</div>
      {phase === 'toolbar' ? (
        <div className="paper-selection-toolbar">
          <button
            type="button"
            className="paper-selection-translate"
            onClick={onTranslate}
          >
            翻译
          </button>
        </div>
      ) : (
        <div className="paper-selection-card">
          <p className="paper-selection-card-kicker">{kicker}</p>
          {phase === 'loading' ? (
            <p className="paper-selection-card-status">正在翻译…</p>
          ) : null}
          {phase === 'result' ? (
            <p className="paper-selection-card-body">{translation}</p>
          ) : null}
          {phase === 'error' ? (
            <>
              <p className="paper-selection-card-error">{errorMessage}</p>
              <button type="button" className="paper-selection-retry" onClick={onRetry}>
                重试
              </button>
            </>
          ) : null}
          {phase !== 'loading' ? (
            <p className="paper-selection-privacy">
              机器参考翻译由阿里云提供。选中的文字及其相邻句子会发送到配置的服务区域。
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
