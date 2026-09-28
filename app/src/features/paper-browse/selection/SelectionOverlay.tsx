import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { PaperTranslationResultItem } from '../../../services/paperTranslation'
import { autoUpdate, computePosition, flip, offset, shift, size, type Placement } from '@floating-ui/react-dom'
import type { ReactNode } from 'react'
import { Translate, BookOpen, Copy, Check, X, RefreshCw } from '../../../icons'

export type SelectionOverlayPhase = 'toolbar' | 'lookup' | 'loading' | 'result' | 'error' | 'dictionary'

export type SelectionOverlayProps = {
  phase: SelectionOverlayPhase
  range: Range
  anchor?: { x: number; y: number } | null
  taskMode?: 'contextual-fragment' | 'selected-text'
  translation?: string
  results?: readonly PaperTranslationResultItem[]
  errorMessage?: string
  liveMessage: string
  onTranslate: () => void
  onLookup?: () => void
  /** False when the translation service is off; the translate button hides. */
  translateEnabled?: boolean
  /** Personal annotations (#489): local-only actions, no paid calls. */
  annotationActions?: {
    onHighlight: () => void
    onUnderline: () => void
    onNote: () => void
  }
  onRetry: () => void
  onClose?: () => void
  onPointerInsideChange: (inside: boolean) => void
  dictionary?: ReactNode
  focusLookup?: boolean
}

export function SelectionOverlay({
  phase,
  range,
  anchor,
  taskMode,
  translation,
  results = [],
  errorMessage,
  liveMessage,
  onTranslate,
  onLookup,
  translateEnabled = true,
  annotationActions,
  onRetry,
  onClose,
  onPointerInsideChange,
  dictionary,
  focusLookup = false,
}: SelectionOverlayProps) {
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<number | null>(null)
  const lockedPlacementRef = useRef<Placement | null>(null)

  useLayoutEffect(() => {
    const floating = floatingRef.current
    if (!floating) return undefined
    lockedPlacementRef.current = null
    const virtual = {
      getBoundingClientRect: () => {
        const rects = [...range.getClientRects()]
        if (rects.length === 0) return range.getBoundingClientRect()
        if (!anchor) return rects.at(-1)!
        const line = rects.find((r) => anchor.y >= r.top && anchor.y <= r.bottom)
          ?? rects.reduce((best, r) => Math.abs((r.top + r.bottom) / 2 - anchor.y) < Math.abs((best.top + best.bottom) / 2 - anchor.y) ? r : best)
        const x = Math.min(Math.max(anchor.x, line.left), line.right)
        return new DOMRect(x, line.top, 0, line.height)
      },
    }
    const update = () => {
      const locked = lockedPlacementRef.current
      void computePosition(virtual, floating, {
        strategy: 'fixed',
        placement: locked ?? 'bottom-start',
        middleware: [
          offset({ mainAxis: 6, crossAxis: 0 }),
          ...(locked ? [] : [flip({ padding: 12 })]),
          shift({ padding: 12 }),
          size({
            padding: 12,
            apply({ availableWidth, availableHeight, elements }) {
              Object.assign(elements.floating.style, {
                maxWidth: `${Math.min(340, availableWidth)}px`,
                maxHeight: `${Math.min(380, availableHeight, window.innerHeight * 0.55)}px`,
              })
            },
          }),
        ],
      }).then(({ x, y, placement }) => {
        lockedPlacementRef.current ??= placement
        floating.style.setProperty(
          '--paper-selection-origin',
          placement.startsWith('top') ? 'bottom left' : 'top left',
        )
        Object.assign(floating.style, {
          left: `${x}px`,
          top: `${y}px`,
        })
      })
    }
    update()
    return autoUpdate(virtual, floating, update)
  }, [range, phase, anchor])

  const kicker = taskMode === 'selected-text' ? '参考译文' : '本文参考译法'
  const hasErrors = results.some((item) => item.status === 'error')
  const partial = hasErrors && results.some((item) => item.status === 'ok')

  const canCopy = phase === 'result'
    || (results.length > 0 && results.some((item) => item.status === 'ok'))

  const handleCopy = useCallback(() => {
    const textToCopy = results.length > 0
      ? results.filter((item) => item.status === 'ok').map((item) => item.translation).join('\n')
      : (translation ?? '')
    if (!textToCopy) return
    void navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true)
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1800)
    })
  }, [results, translation])

  return (
    <div
      ref={floatingRef}
      className="paper-selection-overlay"
      role={phase === 'dictionary' ? 'dialog' : 'region'}
      aria-modal={phase === 'dictionary' ? false : undefined}
      aria-label={phase === 'dictionary' || phase === 'lookup' ? '单词查词' : '选区翻译'}
      onMouseDown={(event) => event.preventDefault()}
      onPointerEnter={() => onPointerInsideChange(true)}
      onPointerLeave={() => onPointerInsideChange(false)}
    >
      <div className="paper-selection-live" aria-live="polite">{liveMessage}</div>
      {phase === 'toolbar' || phase === 'lookup' ? (
        <div className="paper-selection-toolbar">
          {phase === 'lookup' ? (
            <button
              type="button"
              className="paper-selection-lookup"
              autoFocus={focusLookup}
              onClick={onLookup}
            >
              <BookOpen size={16} className="paper-selection-btn-icon" />
              <span>查词</span>
            </button>
          ) : translateEnabled ? (
            <button
              type="button"
              className="paper-selection-translate"
              onClick={onTranslate}
            >
              <Translate size={16} className="paper-selection-btn-icon" />
              <span>翻译</span>
            </button>
          ) : null}
          {annotationActions ? (
            <div className="paper-selection-annotations" role="group" aria-label="我的批注">
              <button type="button" onClick={annotationActions.onHighlight}>高亮</button>
              <button type="button" onClick={annotationActions.onUnderline}>下划线</button>
              <button type="button" onClick={annotationActions.onNote}>批注</button>
            </div>
          ) : null}
        </div>
      ) : phase === 'dictionary' ? dictionary : (
        <div className="paper-selection-card">
          <div className="paper-selection-card-header">
            <span className="paper-selection-card-kicker">
              <Translate size={13} className="paper-selection-kicker-icon" />
              {kicker}
            </span>
            <div className="paper-selection-card-actions">
              {canCopy && (
                <button
                  type="button"
                  className="paper-selection-action-btn"
                  onClick={handleCopy}
                  title={copied ? '已复制' : '复制译文'}
                  aria-label={copied ? '已复制' : '复制译文'}
                >
                  {copied ? <Check size={16} className="paper-selection-copied-icon" /> : <Copy size={16} />}
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  className="paper-selection-action-btn"
                  onClick={onClose}
                  title="关闭"
                  aria-label="关闭"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {phase === 'loading' ? (
            <p className="paper-selection-card-status">
              <span className="paper-selection-spinner" aria-hidden="true" />
              <span>正在翻译…</span>
            </p>
          ) : null}

          {partial ? (
            <p className="paper-selection-card-error">部分内容未完成，请重试失败段落。</p>
          ) : null}

          {results.map((item) => (
            <div
              key={item.segmentIndex}
              data-selection-segment-index={item.segmentIndex}
              className="paper-selection-segment-row"
            >
              {item.selectedText ? (
                <p className="paper-selection-segment-source">{item.selectedText}</p>
              ) : null}
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
              <RefreshCw size={16} className="paper-selection-retry-icon" />
              <span>{partial ? '重试失败段落' : '重试'}</span>
            </button>
          ) : null}

          {phase !== 'loading' ? (
            <p className="paper-selection-privacy">机器参考译文 · Qwen-MT（阿里云）· 选中文字及相邻句会发送到服务区域</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
