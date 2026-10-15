import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'
import { copyText, difficulties, restoreLayout, unitText, unitDisplayLabel } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { LayoutItem, SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { useSentenceInteraction } from './useSentenceInteraction'
import { sentenceCardView, translationRanges } from './sentenceCardView'
import { ChevronLeft, ChevronRight, Target, SentenceAnalysis, X } from '../../../../icons'
import { CopyFeedbackIcon } from '../../../../icons/MotionIcons'
import { iconMotionInput } from '../../../../icons/motionInput'
import { useClipboardCopy } from '../../../../hooks/useClipboardCopy'
import { AnnotatedSentence } from './AnnotatedSentence'
import { TranslationBlock } from './TranslationBlock'
import { GrammarLegend } from './GrammarLegend'
import { visibleFlags } from './sentencePresentation'
import { detailCandidates, measureDetailHeight } from './detailSpace'
import './sentenceAnalysis.css'

export type SentenceAnalysisCardStatus = 'loading' | 'ok' | 'partial' | 'unavailable' | 'invalid' | 'error' | 'rejected'

const REJECT_TEXT = {
  'cross-sentence': '请只选一句',
  'cross-stream': '请只选一句',
  'too-long': '句子过长，暂不分析',
} as const

export function SentenceAnalysisCard({
  status,
  analysis,
  sentenceText,
  rejectReason,
  errorMessage,
  onRetry,
  onClose,
  onAnnounce,
  bindEscapeRef,
  textSize,
}: {
  status: SentenceAnalysisCardStatus
  analysis: SentenceAnalysisV1 | null
  sentenceText: string
  expanded: boolean
  rejectReason?: keyof typeof REJECT_TEXT
  errorMessage?: string
  onRetry?: () => void
  onClose?: () => void
  onAnnounce?: (message: string) => void
  bindEscapeRef?: MutableRefObject<(() => boolean) | null>
  textSize?: number | null
}) {
  const ready = (status === 'ok' || status === 'partial') && analysis?.status !== 'unavailable' ? analysis : null
  const interaction = useSentenceInteraction(ready)
  const { scopePath, scopeId, focus, mainActive, logicalSubjectActive, selectedRole, open, restored, pending, keyboard, locate, send } = interaction
  const clipboard = useClipboardCopy()
  const [detailHost, setDetailHost] = useState<HTMLDivElement | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    card.style.height = ''
    if (!ready) return
    let width = -1
    const lines = detailCandidates(ready)
    const sizeFrame = () => {
      const row = card.querySelector<HTMLElement>('.sa-detail-row')
      const slot = row?.querySelector<HTMLElement>('.sa-detail-slot')
      // Keyed on the slot, not the card: the legend sharing its row can
      // settle after the first measure and narrow the slot on its own.
      const next = slot?.clientWidth ?? card.offsetWidth
      if (width === next) return
      width = next
      // The explanation slot keeps one height for the whole sentence, so a
      // selection never resizes it; most sentences need a single line.
      if (row && slot) slot.style.height = `${measureDetailHeight(row, slot, lines)}px`
      card.style.height = ''
      // Keep the frame steady during inspection. Only the analysis pane
      // scrolls; the translation keeps its own space below it.
      card.style.height = `${card.offsetHeight}px`
    }
    sizeFrame()
    const observer = new ResizeObserver(sizeFrame)
    observer.observe(card)
    const slot = card.querySelector<HTMLElement>('.sa-detail-row .sa-detail-slot')
    if (slot) observer.observe(slot)
    const fontsReady = () => { width = -1; sizeFrame() }
    document.fonts?.addEventListener('loadingdone', fontsReady)
    return () => {
      observer.disconnect()
      document.fonts?.removeEventListener('loadingdone', fontsReady)
      card.style.height = ''
    }
  }, [ready, textSize])
  const flags = useMemo(() => {
    if (!ready) return []
    return visibleFlags(ready, difficulties(ready), scopeId)
  }, [ready, scopeId])
  const layout = useMemo<LayoutItem[]>(() => (ready ? restoreLayout(ready, restored) : []), [ready, restored])
  const nextLayout = useMemo<LayoutItem[] | null>(() => (ready && pending ? restoreLayout(ready, pending.to) : null), [ready, pending])

  const { flagIndex, bubble, announcement, activeRestore } = sentenceCardView(ready, flags, interaction)
  const reset = () => send({ type: 'reset' })
  const selectUnit = (unitId: string) => send({ type: 'select-unit', unitId })
  const enter = (unitId: string) => send({ type: 'enter', unitId })
  const back = () => send({ type: 'back' })
  const selectFlag = (flagId: string) => {
    const flag = flags.find(item => item.id === flagId)
    if (flag) send({ type: 'select-flag', unitId: flag.unitId, flagId })
  }
  const step = (delta: number) => {
    if (!flags.length) return
    const from = flagIndex < 0 ? (delta > 0 ? -1 : 0) : flagIndex
    const next = flags[(from + delta + flags.length) % flags.length]
    send({ type: 'select-flag', unitId: next.unitId, flagId: next.id, step: true })
  }
  useEffect(() => {
    if (!bindEscapeRef) return
    bindEscapeRef.current = interaction.escape
    return () => { bindEscapeRef.current = null }
  })

  useEffect(() => {
    if (announcement && onAnnounce) onAnnounce(announcement)
  }, [announcement, onAnnounce])

  const copy = () => { void clipboard.copy(ready ? copyText(ready) : sentenceText) }

  return (
    <div
      ref={cardRef}
      className="paper-selection-card paper-sentence-analysis"
      data-sa-status={status}
      style={textSize ? { '--sa-text-size': `${textSize}px`, '--sa-legend-size': `${textSize}px` } as CSSProperties : undefined}
    >
      <div className="sa-head">
        <span className="sa-kicker">
          <SentenceAnalysis size={16} />
          <span className="sa-heading"><strong>句子分析</strong></span>
        </span>
        {ready && scopePath.length > 0 ? <nav className="sa-reading-nav" aria-label="阅读层级">
          <div className="sa-reading-trail">
            {scopePath.length > 0 ? <button type="button" onClick={() => send({ type: 'path', depth: 0 })}>原句</button> : null}
            {scopePath.map((id, index) => {
              const unit = ready.units.find(item => item.id === id)
              return <span key={id}><span aria-hidden="true"> › </span><button type="button"
                aria-current={index === scopePath.length - 1 ? 'location' : undefined}
                title={unit ? unitText(ready, unit) : ''}
                onClick={() => send({ type: 'path', depth: index + 1 })}>
                {unit ? unitDisplayLabel(ready, unit) : '内部'}</button></span>
            })}

          </div>
        </nav> : null}
        <div className="sa-head-actions">
          {status === 'loading' ? (
            <span className="sa-loading">
              <span className="paper-selection-spinner" aria-hidden="true" />
              分析中…
            </span>
          ) : null}
          {ready && flags.length === 1 ? (
            <button type="button" className="sa-single-difficulty" aria-label={`查看难点：${flags[0].label}`}
              aria-pressed={flagIndex === 0} onMouseDown={event => event.preventDefault()} onClick={() => selectFlag(flags[0].id)}>
              难点 · {flags[0].label}
            </button>
          ) : ready && flags.length > 1 ? (
            <div className="sa-stepper" role="group" aria-label="难点切换">
              <span className="sa-stepper-label">难点</span>
              <button type="button" className="sa-icon-btn" aria-label="上一个难点" onMouseDown={(event) => event.preventDefault()} onClick={() => step(-1)}>
                <ChevronLeft size={16} />
              </button>
              <span className="sa-stepper-count" aria-live="off">{flagIndex >= 0 ? flagIndex + 1 : '–'}/{flags.length}</span>
              <button type="button" className="sa-icon-btn" aria-label="下一个难点" onMouseDown={(event) => event.preventDefault()} onClick={() => step(1)}>
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
          {ready ? (
            <button
              type="button"
              className="sa-main-btn"
              aria-pressed={mainActive}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => send({ type: 'main' })}
            >
              <Target size={16} />
              定位主句
            </button>
          ) : null}
          <button type="button" className="sa-icon-btn" {...iconMotionInput} onMouseDown={(event) => event.preventDefault()} onClick={copy}
            disabled={clipboard.state === 'pending'} aria-busy={clipboard.state === 'pending'}
            title={clipboard.error || undefined} aria-label={clipboard.copied ? '已复制' : clipboard.error ? '复制未成功，重试' : '复制'}>
            <CopyFeedbackIcon size={16} state={clipboard.state} />
          </button>
          {onClose ? (
            <button type="button" className="sa-icon-btn" onMouseDown={(event) => event.preventDefault()} onClick={onClose} aria-label="关闭">
              <X size={16} />
            </button>
          ) : null}
        </div>
      </div>

      {status === 'loading' ? (
        <>
          <div className="sa-sentence-wrap"><p className="sa-sentence sa-sentence-plain">{sentenceText}</p></div>
          <div className="sa-translation">
            <span className="sa-skeleton" style={{ width: '100%' }} />
            <span className="sa-skeleton" style={{ width: '64%' }} />
          </div>
        </>
      ) : null}

      {status === 'rejected' ? <p className="sa-status">{REJECT_TEXT[rejectReason || 'cross-sentence']}</p> : null}

      {status === 'error' ? (
        <div className="sa-status">
          <p className="paper-selection-card-error">{errorMessage || '分析失败，请重试'}</p>
          {onRetry ? <button type="button" className="paper-selection-retry" onMouseDown={(event) => event.preventDefault()} onClick={onRetry}>重试</button> : null}
        </div>
      ) : null}

      {ready ? (
        <>
          <div className="sa-analysis-scroll" role="region" aria-label="句子分析内容" tabIndex={0}>
          <AnnotatedSentence
            analysis={ready}
            focus={focus}
            mainActive={mainActive}
            logicalSubjectActive={logicalSubjectActive}
            onToggleLogicalSubject={() => send({ type: 'logical-subject' })}
            selectedRole={selectedRole}
            scopeId={scopeId}
            onEnter={enter}
            onBack={back}
            onSelect={selectUnit}
            onReset={reset}
            onMove={(next) => send({ type: 'move', focus: next })}
            keyboard={keyboard}
            onKeyboard={(active) => send({ type: 'keyboard', active })}
            locate={focus.kind === 'main' ? locate : 0}
            layout={layout}
            layoutKey={restored || ''}
            leaving={nextLayout}
            flags={flags}
            openFlagId={open?.kind === 'flag' ? open.id : null}
            onFlag={selectFlag}
            localRestoreScopeId={activeRestore?.kind === 'antecedent' ? activeRestore.scopeId : null}
            detailHost={detailHost}
            bubble={bubble}
            onBubbleAction={() => interaction.toggleRestore(bubble?.model.restore?.id)}
          />
          {status === 'partial' && ready.gaps && ready.gaps.length > 0 ? (
            <p className="sa-status">部分结构未能分析：{ready.gaps.join('、')}</p>
          ) : null}
          </div>
          <div className="sa-detail-row">
            <div ref={setDetailHost} className="sa-detail-slot" />
            <GrammarLegend analysis={ready} scopeId={scopeId} selected={selectedRole}
              onSelect={(role) => send({ type: 'role', role })} />
          </div>
          {ready.translation ? <TranslationBlock text={ready.translation.textZh} ranges={focus.kind === 'main' && !mainActive ? [] : translationRanges(ready, focus)} /> : null}
        </>
      ) : null}

      {status === 'unavailable' || status === 'invalid' ? (
        <>
          <div className="sa-sentence-wrap"><p className="sa-sentence sa-sentence-plain">{sentenceText}</p></div>
          <p className="sa-status">{status === 'invalid' ? '分析数据无效' : (analysis?.unavailableReason || '该句暂时无法分析')}</p>
        </>
      ) : null}
    </div>
  )
}
