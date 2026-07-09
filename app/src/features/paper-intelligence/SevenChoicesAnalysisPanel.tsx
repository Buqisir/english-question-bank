import { useMemo, useRef, useState, type ReactNode } from 'react'
import type {
  SevenChoicesChainView,
  SevenChoicesMechanismSignal,
  SevenChoicesOptionView,
} from './sevenChoicesSurfaceAdapter.ts'

type Props = {
  options: SevenChoicesOptionView[]
  chains: SevenChoicesChainView[]
  openQuestionIds: string[]
  onToggleChain: (questionId: string) => void
  onShowAll: () => void
  onHideAll: () => void
}

export function SevenChoicesAnalysisPanel({
  options,
  chains,
  openQuestionIds,
  onToggleChain,
  onShowAll,
  onHideAll,
}: Props): ReactNode {
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set())
  const optionCardRefs = useRef<Record<string, HTMLElement | null>>({})
  const jumpedCardRef = useRef<HTMLElement | null>(null)
  const jumpResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openSet = useMemo(() => new Set(openQuestionIds), [openQuestionIds])
  const openCount = openQuestionIds.length

  const chainByOptionLabel = useMemo(() => {
    return new Map(chains.map((chain) => [chain.correctOptionLabel, chain]))
  }, [chains])

  const flashOption = (label: string): void => {
    const target = optionCardRefs.current[label]
    jumpedCardRef.current?.removeAttribute('data-jumped')
    target?.removeAttribute('data-jumped')
    if (target) {
      // Restart the short attention animation even when the teacher clicks the same chip twice.
      window.getComputedStyle(target).opacity
      target.setAttribute('data-jumped', 'true')
      jumpedCardRef.current = target
    }
    if (jumpResetRef.current) {
      clearTimeout(jumpResetRef.current)
    }
    jumpResetRef.current = setTimeout(() => {
      target?.removeAttribute('data-jumped')
      if (jumpedCardRef.current === target) {
        jumpedCardRef.current = null
      }
      jumpResetRef.current = null
    }, 1000)
  }

  const scrollToOption = (label: string): void => {
    const target = optionCardRefs.current[label]
    target?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
    flashOption(label)
  }

  const jumpToOption = (label: string, chain: SevenChoicesChainView | undefined): void => {
    if (chain) {
      onToggleChain(chain.questionId)
      window.setTimeout(() => scrollToOption(label), 0)
      return
    }
    scrollToOption(label)
  }

  const toggleDetails = (questionId: string): void => {
    setExpandedDetails((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) {
        next.delete(questionId)
      } else {
        next.add(questionId)
      }
      return next
    })
  }

  return (
    <section className="pi-seven-panel" aria-label="七选五解析">
      <div className="pi-seven-panel-header">
        <div>
          <p className="pi-seven-eyebrow">七选五解析</p>
          <h2>A-G 选项池</h2>
        </div>
        <span className="pi-seven-open-count">{openCount} / {chains.length}</span>
      </div>
      <div className="pi-seven-panel-actions" aria-label="七选五显示控制">
        <button type="button" onClick={onShowAll} disabled={openCount === chains.length}>
          全部显示
        </button>
        <button type="button" onClick={onHideAll} disabled={openCount === 0}>
          全部隐藏
        </button>
      </div>
      <div className="pi-seven-option-jump" aria-label="A-G 选项跳转">
        {options.map((option) => {
          const chain = chainByOptionLabel.get(option.label)
          const isOpen = !!chain && openSet.has(chain.questionId)
          return (
            <button
              key={`jump-${option.label}`}
              type="button"
              className="pi-seven-option-jump-chip"
              data-seven-color={chain?.colorIndex ?? undefined}
              data-active={isOpen ? 'true' : undefined}
              onClick={() => jumpToOption(option.label, chain)}
              aria-pressed={isOpen}
              aria-label={`${isOpen ? '收起' : '展开'}选项 ${option.label}`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      <div className="pi-seven-option-list">
        {options.map((option) => {
          const chain = option.chain
          const isCorrect = !!chain
          const isOpen = !!chain && openSet.has(chain.questionId)
          const detailsOpen = !!chain && expandedDetails.has(chain.questionId)
          return (
            <article
              key={option.label}
              ref={(node) => {
                optionCardRefs.current[option.label] = node
              }}
              className={[
                'pi-seven-option-card',
                isCorrect ? 'pi-seven-option-card--correct' : '',
                isOpen ? 'pi-seven-option-card--open' : '',
              ].filter(Boolean).join(' ')}
              data-seven-color={chain?.colorIndex ?? undefined}
            >
              <button
                type="button"
                className="pi-seven-option-main"
                onClick={chain ? () => onToggleChain(chain.questionId) : undefined}
                aria-pressed={isOpen}
                disabled={!chain}
              >
                <span className="pi-seven-option-label">{option.label}</span>
                <span className="pi-seven-option-text">
                  {chain && isOpen
                    ? renderOptionTextWithSignals(option.text, chain.optionSignals)
                    : option.text}
                </span>
                {isOpen && chain && (
                  <span className="pi-seven-blank-tag">{chain.questionNo}</span>
                )}
              </button>
              {isOpen && chain && (
                <div className="pi-seven-chain-body">
                  <p className="pi-seven-fit-line">{chain.fitSummary}</p>
                  <div className="pi-seven-chain-meta" aria-label="解题分类">
                    <span>{chain.positionLabel}</span>
                    <span>{chain.roleLabel}</span>
                    {chain.primaryMechanismLabel && <span>{chain.primaryMechanismLabel}</span>}
                  </div>
                  <button
                    type="button"
                    className="pi-seven-details-toggle"
                    onClick={() => toggleDetails(chain.questionId)}
                    aria-expanded={detailsOpen}
                  >
                    {detailsOpen ? '收起细节' : '展开细节'}
                  </button>
                  {detailsOpen && (
                    <div className="pi-seven-details">
                      <DetailBlock title="匹配线索">
                        <ul>
                          {chain.matchedClues.map((clue, index) => (
                            <li key={`${chain.questionId}-match-${index}`}>
                              <span>{clue.contextSide}</span>
                              <span aria-hidden="true">→</span>
                              <span>{clue.optionSide}</span>
                              <small>{clue.relation}</small>
                            </li>
                          ))}
                        </ul>
                      </DetailBlock>
                      {chain.allSignals.length > 0 && (
                        <DetailBlock title="衔接信号">
                          <ul>
                            {chain.allSignals.map((signal, index) => (
                              <li key={`${chain.questionId}-signal-${index}`}>
                                <span>{signal.signalText}</span>
                                <small>{signal.relation}</small>
                              </li>
                            ))}
                          </ul>
                        </DetailBlock>
                      )}
                      {/* 「讲题提示」display retired (owner 2026-07-09: 衔接链
                          讲解已足够，提示属重复噪音)。teachingNote stays in the
                          adapter/data contract — display-only removal. */}
                    </div>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function DetailBlock({
  title,
  children,
}: {
  title: string
  children: ReactNode
}): ReactNode {
  return (
    <section className="pi-seven-detail-block">
      <h3>{title}</h3>
      {children}
    </section>
  )
}

function renderOptionTextWithSignals(
  text: string,
  signals: SevenChoicesMechanismSignal[],
): ReactNode {
  const signalTexts = signals.map((signal) => signal.signalText).filter(Boolean)
  if (signalTexts.length === 0) return text

  const matches = signalTexts
    .flatMap((signalText) => {
      const start = text.indexOf(signalText)
      return start === -1 ? [] : [{ start, end: start + signalText.length }]
    })
    .sort((a, b) => a.start - b.start)

  if (matches.length === 0) return text
  const parts: ReactNode[] = []
  let cursor = 0
  matches.forEach((match, index) => {
    if (match.start < cursor) return
    if (match.start > cursor) parts.push(text.slice(cursor, match.start))
    parts.push(
      <mark key={`${match.start}-${index}`} className="pi-seven-option-signal">
        {text.slice(match.start, match.end)}
      </mark>,
    )
    cursor = match.end
  })
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts
}
