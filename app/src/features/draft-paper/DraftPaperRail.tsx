import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { groupTypeLabel, type DraftPaperItem } from '../../domain/questionBank'

export type DraftPaperRailProps = {
  items: DraftPaperItem[]
  activeGroupId: string | null
  onItemClick: (groupId: string) => void
  onDragStart: (itemId: string) => void
  onDrop: (targetId: string) => void
  onMoveItem: (itemId: string, direction: -1 | 1) => void
  onDeleteItem: (item: DraftPaperItem) => void
}

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九']

// draft-desk-a: mirrors server/print-renderer.mjs's chineseNumeral() (H9 Draft
// cut) closely enough for rail display purposes — no shared client helper
// exists to import (confirmed: neither app/src nor a shared module exports
// one), and this rail-only numbering is presentational, not a print/export
// source of truth, so a small duplicate is the same accepted pattern this
// file family already uses for groupTypeLabel.
function chineseNumeral(n: number): string {
  if (!Number.isInteger(n) || n < 1) return String(n)
  if (n <= 10) return n === 10 ? '十' : CHINESE_DIGITS[n]
  if (n < 20) return `十${CHINESE_DIGITS[n - 10]}`
  if (n === 20) return '二十'
  return String(n)
}

export function DraftPaperRail(props: DraftPaperRailProps): ReactNode {
  const { items, activeGroupId, onItemClick, onDragStart, onDrop, onMoveItem, onDeleteItem } = props

  // Precompute the printable (Chinese-numeral) rank per item ahead of the
  // render loop below, instead of mutating a counter from inside the .map()
  // callback — react-hooks/immutability (eslint-plugin-react-hooks, aimed at
  // React Compiler compatibility) flags reassigning a render-scoped variable
  // from within a JSX-producing callback.
  const printableRankByItemId = new Map<string, number>()
  let printableCounter = 0
  for (const item of items) {
    if (item.groupMissing) continue
    printableCounter += 1
    printableRankByItemId.set(item.id, printableCounter)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>, groupId: string, isMissing: boolean) {
    if (isMissing) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onItemClick(groupId)
    }
  }

  return (
    <nav className="draft-paper-rail" aria-label="卷面目录">
      {items.map((item) => {
        const isMissing = item.groupMissing
        const printableRank = printableRankByItemId.get(item.id)
        const label = isMissing
          ? '题组已从题库中移除'
          : item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId

        return (
          <div
            className={`draft-paper-rail-item${activeGroupId === item.groupId ? ' active' : ''}${isMissing ? ' is-missing' : ''}`}
            data-draft-group-id={item.groupId}
            draggable
            key={item.id}
            onClick={() => !isMissing && onItemClick(item.groupId)}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => onDragStart(item.id)}
            onDrop={() => onDrop(item.id)}
            onKeyDown={(event) => handleKeyDown(event, item.groupId, isMissing)}
            role="button"
            tabIndex={0}
          >
            <GripVertical aria-hidden="true" className="draft-paper-rail-grip" size={13} />
            {!isMissing && <span className="draft-paper-rail-no">{chineseNumeral(printableRank ?? 0)}</span>}
            <span className="draft-paper-rail-label">{label}</span>
            {!isMissing && (
              <span className="draft-paper-rail-count">
                {groupTypeLabel[item.questionGroup?.groupType || 'other']} · {item.questionGroup?.questionCount || 0} 题
              </span>
            )}
            {/* draft-desk-a scope note: the plan retires per-item action buttons from
                the rail in favor of the paper-hover sticker (裁点1) — but a groupMissing
                item never renders in the paper (server/draft-paper/draftPaperStore.mjs's
                buildDraftPaperBlocks skips it), so it would otherwise lose its only path
                to reorder/delete. Keeping a compact action row for this one edge case is
                a deliberate exception, not a regression of the plan's "rail = pure list"
                simplification for the common case. */}
            {isMissing && (
              <span className="draft-paper-rail-acts">
                <button
                  aria-label="上移"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMoveItem(item.id, -1)
                  }}
                  title="上移"
                  type="button"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  aria-label="下移"
                  onClick={(event) => {
                    event.stopPropagation()
                    onMoveItem(item.id, 1)
                  }}
                  title="下移"
                  type="button"
                >
                  <ArrowDown size={12} />
                </button>
                <button
                  aria-label="移除"
                  className="danger"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteItem(item)
                  }}
                  title="移除"
                  type="button"
                >
                  <Trash2 size={12} />
                </button>
              </span>
            )}
          </div>
        )
      })}
      {items.length === 0 && <p className="draft-paper-rail-empty">从搜索结果添加题组。</p>}
    </nav>
  )
}
