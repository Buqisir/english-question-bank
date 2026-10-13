import { useLayoutEffect, useRef } from 'react'
import type { PaperTranslationResultItem } from '../../../services/paperTranslation'
import { autoUpdate, computePosition, flip, offset, shift, size, type Placement } from '@floating-ui/react-dom'
import type { ReactNode } from 'react'
import { Translate, DictionaryLookup, X, RefreshCw, SentenceAnalysis } from '../../../icons'
import { CopyFeedbackIcon } from '../../../icons/MotionIcons'
import { iconMotionInput } from '../../../icons/motionInput'
import { useClipboardCopy } from '../../../hooks/useClipboardCopy'

export type SelectionOverlayPhase = 'toolbar' | 'lookup' | 'loading' | 'result' | 'error' | 'dictionary' | 'sentence-analysis'

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
  onRetry: () => void
  onClose?: () => void
  onPointerInsideChange: (inside: boolean) => void
  dictionary?: ReactNode
  focusLookup?: boolean
  showTranslate?: boolean
  showAnalyze?: boolean
  analyzeLabel?: string
  onAnalyze?: () => void
  analysis?: ReactNode
}

function reserveRoomBelow(range: Range, contextElement: Element | null) {
  const rect = range.getBoundingClientRect()
  const targetBottom = Math.max(window.innerHeight * .32, rect.height + 96)
  const distance = rect.bottom - targetBottom
  if (distance <= 0) return
  let scroller = contextElement
  while (scroller && !(scroller.scrollHeight > scroller.clientHeight
    && /auto|scroll/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
  const target = scroller || document.scrollingElement
  if (target) target.scrollTop += distance
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
  onRetry,
  onClose,
  onPointerInsideChange,
  dictionary,
  focusLookup = false,
  showTranslate = true,
  showAnalyze = false,
  analyzeLabel = '分析此句',
  onAnalyze,
  analysis,
}: SelectionOverlayProps) {
  const floatingRef = useRef<HTMLDivElement | null>(null)
  const clipboard = useClipboardCopy()
  const copied = clipboard.copied
  const lockedPlacementRef = useRef<Placement | null>(null)

  useLayoutEffect(() => {
    const floating = floatingRef.current
    if (!floating) return undefined
    lockedPlacementRef.current = null
    const sentence = phase === 'sentence-analysis'
    const contextElement = range.startContainer instanceof Element
      ? range.startContainer : range.startContainer.parentElement
    const paragraph = contextElement?.closest('[data-paper-paragraph-id], [data-canonical-block-id]')
    const textColumn = paragraph ?? contextElement?.closest('.ps-page')
    // Reserve room below the whole sentence on entry. Subsequent scrolling
    // follows the source; the card never flips over the sentence being read.
    if (sentence) reserveRoomBelow(range, contextElement)
    const virtual = {
      contextElement: contextElement || undefined,
      getBoundingClientRect: () => {
        const rects = [...range.getClientRects()]
        if (rects.length === 0) return range.getBoundingClientRect()
        if (sentence) {
          const bottom = Math.max(...rects.map(rect => rect.bottom))
          const column = textColumn?.getBoundingClientRect() ?? range.getBoundingClientRect()
          // Anchor to the text column, not the selected word or a short last line.
          return new DOMRect(column.left, bottom, column.width, 0)
        }
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
        placement: locked ?? (sentence ? 'bottom' : 'bottom-start'),
        middleware: [
          offset({ mainAxis: sentence ? 12 : 6, crossAxis: 0 }),
          ...(sentence || locked ? [] : [flip({ padding: 12 })]),
          shift({ padding: 12 }),
          size({
            padding: 12,
            apply({ availableWidth, availableHeight, elements }) {
              if (phase === 'sentence-analysis') {
                Object.assign(elements.floating.style, {
                  width: `${Math.min(760, availableWidth)}px`,
                  maxWidth: `${Math.min(760, availableWidth)}px`,
                  maxHeight: '',
                  '--sa-available-height': `${Math.max(0, Math.min(availableHeight, window.innerHeight * 0.85))}px`,
                })
                return
              }
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

  const handleCopy = () => {
    const textToCopy = results.length > 0
      ? results.filter((item) => item.status === 'ok').map((item) => item.translation).join('\n')
      : (translation ?? '')
    if (!textToCopy) return
    void clipboard.copy(textToCopy)
  }

  return (
    <div
      ref={floatingRef}
      className="paper-selection-overlay"
      role={phase === 'dictionary' ? 'dialog' : 'region'}
      aria-modal={phase === 'dictionary' ? false : undefined}
      aria-label={phase === 'sentence-analysis' ? '句子分析' : phase === 'dictionary' || phase === 'lookup' ? '单词查词' : '选区翻译'}
      onMouseDown={(event) => {
        if (phase === 'sentence-analysis') return
        event.preventDefault()
      }}
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
              <DictionaryLookup size={16} className="paper-selection-btn-icon" />
              <span>查词</span>
            </button>
          ) : showTranslate ? (
            <button
              type="button"
              className="paper-selection-translate"
              onClick={onTranslate}
            >
              <Translate size={16} className="paper-selection-btn-icon" />
              <span>翻译</span>
            </button>
          ) : null}
          {showAnalyze ? (
            <button
              type="button"
              className="paper-selection-analyze"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onAnalyze}
            >
              <SentenceAnalysis size={16} className="paper-selection-btn-icon" />
              <span>{analyzeLabel}</span>
            </button>
          ) : null}
        </div>
      ) : phase === 'sentence-analysis' ? analysis : phase === 'dictionary' ? dictionary : (
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
                  {...iconMotionInput}
                  onClick={handleCopy}
                  disabled={clipboard.state === 'pending'}
                  aria-busy={clipboard.state === 'pending'}
                  title={copied ? '已复制' : '复制译文'}
                  aria-label={copied ? '已复制' : '复制译文'}
                >
                  <CopyFeedbackIcon size={16} state={clipboard.state} />
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

          {clipboard.error && <p className="paper-selection-card-error" role="alert">{clipboard.error}</p>}

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
