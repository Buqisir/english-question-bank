import { useLayoutEffect, useRef } from 'react'
import type { PaperTranslationResultItem } from '../../../services/paperTranslation'
import { autoUpdate, computePosition, flip, inline, offset, shift, size } from '@floating-ui/react-dom'

export type SelectionOverlayPhase = 'toolbar' | 'loading' | 'result' | 'error'

export type SelectionOverlayProps = {
  phase: SelectionOverlayPhase
  range: Range
  taskMode?: 'contextual-fragment' | 'selected-text'
  translation?: string
  results?: readonly PaperTranslationResultItem[]
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
  results = [],
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
  const hasErrors = results.some((item) => item.status === 'error')
  const partial = hasErrors && results.some((item) => item.status === 'ok')

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
          {partial ? (
            <p className="paper-selection-card-error">部分内容未完成，请重试失败段落。</p>
          ) : null}
          {results.map((item) => (
            <div key={item.segmentIndex} data-selection-segment-index={item.segmentIndex}>
              {item.status === 'ok' ? (
                <p className="paper-selection-card-body">{item.translation}</p>
              ) : (
                <p className="paper-selection-card-error">
                  第 {item.segmentIndex + 1} 段：{item.message || '暂时未能正确翻译'}
                </p>
              )}
            </div>
          ))}
          {results.length === 0 && phase === 'result' ? (
            <p className="paper-selection-card-body">{translation}</p>
          ) : null}
          {results.length === 0 && phase === 'error' ? (
            <p className="paper-selection-card-error">{errorMessage}</p>
          ) : null}
          {phase !== 'loading' && (hasErrors || phase === 'error') ? (
            <button type="button" className="paper-selection-retry" onClick={onRetry}>
              {partial ? '重试失败段落' : '重试'}
            </button>
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
