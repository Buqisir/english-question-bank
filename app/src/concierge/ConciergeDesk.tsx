/**
 * ConciergeDesk — V1.1 AI 取题台 (源-卷优先).
 *
 * Stateless wrapper over state owned by useConciergeDesk. Receives the
 * Retrieval Module surface as `retrieval` (view) + `actions` (commands), so
 * App.tsx no longer needs to know about paperResults / expandedPaperKey /
 * triggerSimilar / etc.
 *
 * The primary list maps over retrieval.paperResults (one row per source paper),
 * and clicking expands the paper to show its matching question groups.
 *
 * `basketIds` and `onAdd` remain plain props because 加入草稿卷 belongs to
 * the Assembly Basket layer, not Retrieval.
 */

import { useId, useMemo, type FormEvent, type ReactNode } from 'react'
import type { QuestionGroupCard } from '../domain/questionBank.ts'
import { ConciergePaperRow } from './ConciergePaperRow.tsx'
import { pickClarificationLine } from './clarificationCopy.ts'
import type {
  ConciergeRetrievalActions,
  ConciergeRetrievalView,
} from './useConciergeDesk.ts'

export type ConciergeDeskProps = {
  retrieval: ConciergeRetrievalView
  actions: ConciergeRetrievalActions
  basketIds: Set<string>
  onAdd: (group: QuestionGroupCard) => void

  /**
   * App-level data connection status. While 'loading', the local question bank
   * is still being fetched and the in-memory list is the bundled sample fixture.
   * Searching against sample groups can return ids that don't exist in the live
   * SQLite. We disable submit + show a calm notice until real data is in.
   */
  dataStatus?: 'loading' | 'sqlite' | 'sample'
}

const STARTER_CHIPS = ['生态主题 C 篇', '2025 浙江卷', '中等难度主旨题'] as const

export function ConciergeDesk(props: ConciergeDeskProps): ReactNode {
  const { retrieval, actions, basketIds, onAdd, dataStatus } = props
  const { intent, state, paperResults, expandedPaperKey } = retrieval
  const { setIntent, submit, triggerSimilar, togglePaper } = actions
  const inputId = useId()
  const dataLoading = dataStatus === 'loading'

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (dataLoading) return
    void submit()
  }

  const placeholder = useMemo(() => {
    if (dataLoading) return '正在连接本地题库…'
    if (state.kind === 'clarification') return '换个说法，比如：偏说明文 / 中等难度'
    return '比如：找一道讲生态恢复的阅读 C，中等难度'
  }, [dataLoading, state])

  const submitDisabled = dataLoading || state.kind === 'loading' || intent.trim().length === 0

  return (
    <section className="concierge-desk" aria-label="题库取题流">
      {/* Search input is the first focal element — no landing hero. */}
      <form className="concierge-intent-bar" onSubmit={handleSubmit}>
        <label htmlFor={inputId} className="visually-hidden">
          自然语言搜索
        </label>
        <input
          id={inputId}
          className="concierge-intent-input"
          value={intent}
          onChange={(event) => setIntent(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          disabled={dataLoading}
          aria-busy={dataLoading || undefined}
        />
        <button
          type="submit"
          className="concierge-intent-submit"
          disabled={submitDisabled}
          aria-label="开始取题"
          title="开始取题"
        >
          {state.kind === 'loading' || dataLoading ? '…' : '→'}
        </button>
      </form>

      {dataLoading && (
        <p className="concierge-data-loading" role="status">
          正在连接本地题库，稍候即可搜索。
        </p>
      )}

      {!dataLoading && (state.kind === 'empty' || state.kind === 'error') && (
        <ul className="concierge-starter-chips" aria-label="示例搜索">
          {STARTER_CHIPS.map((chip) => (
            <li key={chip}>
              <button
                type="button"
                className="concierge-starter-chip"
                onClick={() => setIntent(chip)}
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

        {state.kind === 'results' && paperResults.length === 0 && (
          <p className="concierge-empty">没找到匹配。可以换个说法，或在经典模式里精筛。</p>
        )}

        {state.kind === 'results' && paperResults.length > 0 && (
          <ul className="concierge-paper-list">
            {paperResults.map((paper) => (
              <li key={paper.key}>
                <ConciergePaperRow
                  paper={paper}
                  expanded={expandedPaperKey === paper.key}
                  basketIds={basketIds}
                  onTogglePaper={togglePaper}
                  onAdd={onAdd}
                  onSimilar={(group) => {
                    void triggerSimilar(group)
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
