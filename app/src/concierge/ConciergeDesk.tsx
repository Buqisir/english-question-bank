/**
 * ConciergeDesk — AI-mode home page of the question bank.
 *
 * Stateless wrapper around the desk state owned by useConciergeDesk in App.tsx,
 * so search state survives detail / preview round-trips.
 */

import { useId, useMemo, type FormEvent, type ReactNode } from 'react'
import type { QuestionGroupCard } from '../domain/questionBank.ts'
import { ConciergeResultRow } from './ConciergeResultRow.tsx'
import { pickClarificationLine } from './clarificationCopy.ts'
import type { ConciergeDeskState } from './useConciergeDesk.ts'

export type ConciergeDeskProps = {
  intent: string
  onIntentChange: (value: string) => void
  onSubmit: () => void
  state: ConciergeDeskState
  basketIds: Set<string>
  onPreview: (group: QuestionGroupCard) => void
  onAdd: (group: QuestionGroupCard) => void
  onSimilar: (group: QuestionGroupCard) => void
}

const STARTER_CHIPS = ['生态主题 C 篇', '2025 浙江卷', '中等难度主旨题'] as const

export function ConciergeDesk(props: ConciergeDeskProps): ReactNode {
  const { intent, onIntentChange, onSubmit, state, basketIds, onPreview, onAdd, onSimilar } = props
  const inputId = useId()

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  const placeholder = useMemo(() => {
    if (state.kind === 'clarification') return '换个说法，比如：偏说明文 / 中等难度'
    return '比如：找一道讲生态恢复的阅读 C，中等难度'
  }, [state])

  const submitDisabled = state.kind === 'loading' || intent.trim().length === 0

  return (
    <section className="concierge-desk" aria-label="题库取题台">
      <header className="concierge-headline">
        <h2>你找什么题 / 卷子？</h2>
        <p className="concierge-subhead">自然语言或关键词皆可。</p>
      </header>

      <form className="concierge-intent-bar" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="visually-hidden">
          自然语言搜索
        </label>
        <input
          id={inputId}
          className="concierge-intent-input"
          value={intent}
          onChange={(event) => onIntentChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          type="submit"
          className="concierge-intent-submit"
          disabled={submitDisabled}
          aria-label="开始取题"
          title="开始取题"
        >
          {state.kind === 'loading' ? '…' : '→'}
        </button>
      </form>

      {(state.kind === 'empty' || state.kind === 'error') && (
        <ul className="concierge-starter-chips" aria-label="示例搜索">
          {STARTER_CHIPS.map((chip) => (
            <li key={chip}>
              <button
                type="button"
                className="concierge-starter-chip"
                onClick={() => onIntentChange(chip)}
              >
                {chip}
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.kind === 'clarification' && (
        <div className="concierge-clarification" role="status">
          <p className="concierge-clarification-line">
            {pickClarificationLine(state.pendingQuery, state.question)}
          </p>
          <p className="concierge-clarification-examples">
            比如：科技话题 / 中等难度 / 主旨概括 / 抽象推断。
          </p>
        </div>
      )}

      {state.kind === 'results' && state.usedFallback && (
        <p className="concierge-notice">{state.assistantMessage}</p>
      )}

      {state.kind === 'results' && !state.usedFallback && state.assistantMessage && (
        <p className="concierge-assistant">{state.assistantMessage}</p>
      )}

      {state.kind === 'error' && (
        <p className="concierge-error">取题台暂时出错了，可以稍后再试。</p>
      )}

      <div className="concierge-results" aria-live="polite">
        {state.kind === 'loading' && (
          <p className="concierge-loading">正在为「{state.query}」找题…</p>
        )}

        {state.kind === 'results' && state.hits.length === 0 && (
          <p className="concierge-empty">没找到匹配。可以换个说法，或在经典模式里精筛。</p>
        )}

        {state.kind === 'results' && state.hits.length > 0 && (
          <ul className="concierge-result-list">
            {state.hits.map((hit) => (
              <li key={hit.group.id}>
                <ConciergeResultRow
                  group={hit.group}
                  reason={hit.reason}
                  alreadyInBasket={basketIds.has(hit.group.id)}
                  onPreview={onPreview}
                  onAdd={onAdd}
                  onSimilar={onSimilar}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
