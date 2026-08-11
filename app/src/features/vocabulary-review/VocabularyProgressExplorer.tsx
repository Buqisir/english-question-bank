import { Check, ChevronUp } from 'lucide-react'
import type { RefObject } from 'react'
import type { VocabularyEntry, VocabularyProgram, VocabularyStage } from '../../domain/vocabulary'

type VocabularyProgressExplorerProps = {
  program: VocabularyProgram
  cursor: number
  selectedWeek: number
  selectedEntryId: string | null
  hasUnfinishedRun: boolean
  busy: boolean
  statusMessage: string
  errorMessage: string
  closeLabel: string
  currentPositionRef: RefObject<HTMLDivElement | null>
  onWeekChange: (week: number) => void
  onEntrySelect: (entryId: string) => void
  onConfirm: (entry: VocabularyEntry) => void
  onClose: () => void
}

function stageLabel(stage: VocabularyStage | undefined): string {
  if (stage === 'core') return '核心掌握词'
  if (stage === 'basic') return '基础识记词'
  return '认识拓展词'
}

export function VocabularyProgressExplorer({
  program,
  cursor,
  selectedWeek,
  selectedEntryId,
  hasUnfinishedRun,
  busy,
  statusMessage,
  errorMessage,
  closeLabel,
  currentPositionRef,
  onWeekChange,
  onEntrySelect,
  onConfirm,
  onClose,
}: VocabularyProgressExplorerProps) {
  const currentEntry = program.entries[cursor] ?? null
  const selectedEntry = program.entries.find((entry) => entry.id === selectedEntryId) ?? null
  const weeks = [...new Set(program.groups.map((group) => group.week))].sort((left, right) => left - right)
  const groups = program.groups
    .filter((group) => group.week === selectedWeek)
    .sort((left, right) => left.startOrder - right.startOrder)
  const selectedCursor = selectedEntry ? selectedEntry.source.globalOrder - 1 : null
  const selectionIsCurrent = selectedCursor === cursor

  return (
    <section className="vocabulary-progress-explorer" aria-labelledby="vocabulary-progress-explorer-title">
      <div className="vocabulary-progress-explorer-heading">
        <div>
          <h2 id="vocabulary-progress-explorer-title">选择下一词</h2>
          <p>按 Week 和 Day 找到实体书上的位置。确认后，下一轮从所选单词开始。</p>
        </div>
        <button className="ghost-button" type="button" onClick={onClose}>
          <ChevronUp size={16} aria-hidden="true" />{closeLabel}
        </button>
      </div>

      <div className="vocabulary-progress-current" ref={currentPositionRef} tabIndex={-1} aria-live="polite">
        <span>主进度</span>
        {currentEntry
          ? <strong>当前位置：{currentEntry.headword}（第 {currentEntry.source.globalOrder} 词）</strong>
          : <strong>已到词库末尾（{program.entries.length} / {program.entries.length}）</strong>}
      </div>

      <nav className="vocabulary-progress-weeks" aria-label="选择周次">
        {weeks.map((week) => (
          <button
            type="button"
            key={week}
            className={week === selectedWeek ? 'is-selected' : undefined}
            aria-pressed={week === selectedWeek}
            onClick={() => onWeekChange(week)}
          >
            第 {week} 周
          </button>
        ))}
      </nav>

      {selectedEntry && (
        <div className="vocabulary-progress-selection">
          <div>
            <strong>下一次将从 {selectedEntry.headword}（第 {selectedEntry.source.globalOrder} 词）开始</strong>
            <span>第 {selectedEntry.source.week} 周 · Day {selectedEntry.source.group}</span>
            {hasUnfinishedRun && (
              <small>确认后会放弃当前未结束轮次及本轮判断；已生成的生词组不受影响。</small>
            )}
          </div>
          <button
            className="primary-button"
            type="button"
            disabled={busy || selectionIsCurrent}
            onClick={() => onConfirm(selectedEntry)}
          >
            {selectionIsCurrent
              ? '这里已是下一词'
              : hasUnfinishedRun
                ? '放弃当前轮并从这里开始'
                : '确认从这里开始'}
          </button>
        </div>
      )}

      <div className="vocabulary-progress-days">
        {groups.map((group) => {
          const entries = program.entries.filter((entry) =>
            entry.source.week === group.week
            && entry.source.group === group.group
            && (!group.stage || entry.source.stage === group.stage))
          return (
            <section className="vocabulary-progress-day" key={group.id} aria-labelledby={`vocabulary-progress-day-${group.id}`}>
              <div className="vocabulary-progress-day-heading">
                <div>
                  <h3 id={`vocabulary-progress-day-${group.id}`}>Day {group.group}</h3>
                  <span>{stageLabel(group.stage)}</span>
                </div>
                <small>{entries.length} 词</small>
              </div>
              <div className="vocabulary-progress-words">
                {entries.map((entry) => {
                  const order = entry.source.globalOrder
                  const isProcessed = order <= cursor
                  const isCurrent = order === cursor + 1
                  const isSelected = entry.id === selectedEntryId
                  const classNames = [
                    'vocabulary-progress-word',
                    isProcessed ? 'is-processed' : '',
                    isCurrent ? 'is-current' : '',
                    isSelected ? 'is-selected' : '',
                  ].filter(Boolean).join(' ')
                  return (
                    <button
                      type="button"
                      className={classNames}
                      key={entry.id}
                      aria-label={`第 ${order} 词 ${entry.headword}`}
                      aria-current={isCurrent ? 'step' : undefined}
                      aria-pressed={isSelected}
                      onClick={() => onEntrySelect(entry.id)}
                    >
                      <span className="vocabulary-progress-word-order">
                        {isProcessed ? <Check size={12} strokeWidth={2} aria-hidden="true" /> : order}
                      </span>
                      <strong>{entry.headword}</strong>
                      {(isSelected || isCurrent) && (
                        <span className="vocabulary-progress-word-state">
                          {isSelected ? '已选' : '当前'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {statusMessage && <p className="vocabulary-progress-status" aria-live="polite">{statusMessage}</p>}
      {errorMessage && <p className="vocabulary-request-error" role="alert">{errorMessage}</p>}
    </section>
  )
}
