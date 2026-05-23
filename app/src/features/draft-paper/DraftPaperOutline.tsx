import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { groupTypeLabel, type DraftPaper, type DraftPaperItem } from '../../domain/questionBank'

export type DraftPaperOutlineProps = {
  items: DraftPaperItem[]
  pageBreakSuggestions: DraftPaper['pageBreakSuggestions']
  onDragStart: (itemId: string) => void
  onDrop: (targetId: string) => void
  onMoveItem: (itemId: string, direction: -1 | 1) => void
  onTogglePageBreak: (item: DraftPaperItem, nextValue: boolean) => void
  onDeleteItem: (item: DraftPaperItem) => void
}

function compactSource(item: DraftPaperItem) {
  const group = item.questionGroup
  if (!group) return '来源未载入'
  return [group.year, group.region, group.paperName, group.section].filter(Boolean).join(' · ')
}

export function DraftPaperOutline(props: DraftPaperOutlineProps): ReactNode {
  const {
    items,
    pageBreakSuggestions,
    onDragStart,
    onDrop,
    onMoveItem,
    onTogglePageBreak,
    onDeleteItem,
  } = props

  return (
    <aside className="draft-outline-panel" aria-label="题组目录">
      <div className="draft-outline-head">
        <strong>题组目录</strong>
        <span>拖动或按钮调整顺序</span>
      </div>

      {pageBreakSuggestions.length > 0 && (
        <div className="draft-suggestions">
          <strong>分页建议</strong>
          {pageBreakSuggestions.map((suggestion) => {
            const item = items.find((entry) => entry.id === suggestion.itemId)
            if (!item) return null
            return (
              <button key={suggestion.itemId} type="button" onClick={() => onTogglePageBreak(item, true)}>
                在「{item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId}」前分页 · {suggestion.reason}
              </button>
            )
          })}
        </div>
      )}

      <div className="draft-outline-list">
        {items.map((item, index) => {
          const canPageBreakBefore = index > 0
          return (
            <article
              className={`draft-outline-item${canPageBreakBefore && item.pageBreakBefore ? ' has-break' : ''}`}
              data-draft-group-id={item.groupId}
              draggable
              key={item.id}
              onDragStart={() => onDragStart(item.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDrop(item.id)}
            >
              {canPageBreakBefore && item.pageBreakBefore && <div className="draft-break-marker">分页</div>}
              <div className="draft-outline-item-main">
                <GripVertical size={15} aria-hidden="true" />
                <div>
                  <strong>{index + 1}. {item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId}</strong>
                  <span>{groupTypeLabel[item.questionGroup?.groupType || 'other']} · {item.questionGroup?.questionCount || 0} 题</span>
                  <em>{compactSource(item)}</em>
                  {!item.printReady && <small>{item.printUnavailableReason}</small>}
                </div>
              </div>
              <div className="draft-outline-actions">
                <button type="button" onClick={() => onMoveItem(item.id, -1)} aria-label="上移">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => onMoveItem(item.id, 1)} aria-label="下移">
                  <ArrowDown size={14} />
                </button>
                {canPageBreakBefore && (
                  <button type="button" onClick={() => onTogglePageBreak(item, !item.pageBreakBefore)}>
                    {item.pageBreakBefore ? '取消分页' : '前置分页'}
                  </button>
                )}
                <button type="button" onClick={() => onDeleteItem(item)} aria-label="删除题组">
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          )
        })}
        {items.length === 0 && <p className="draft-outline-empty">从搜索结果添加题组。</p>}
      </div>
    </aside>
  )
}
