import { ArrowDown, ArrowUp, GripVertical, Trash2 } from 'lucide-react'
import type { KeyboardEvent, ReactNode } from 'react'
import { groupTypeLabel, type DraftPaperItem, type QuestionGroupCard } from '../../domain/questionBank'
import type { SimilarPassagesRequestState } from '../similar-passages/SimilarPassagesPanel'

/** similar-workbench-swap (E7, plan.md "抽屉"): the swap drawer's own props,
 * kept in this file (not similar-passages/SimilarPassagesPanel.tsx) — plan's
 * 施工要点 3 calls for a sibling view when extending that shared panel with
 * per-card replace/add actions would cost more than it's worth (its `onAdd`
 * contract hands back a full QuestionGroupCard for a client-only basket;
 * this drawer's two actions are both server round-trips keyed by groupId
 * alone, and needs a SECOND action per card, not a single primary one). The
 * `.similar-*` chip/card class language is reused verbatim (DESIGN.md §7 —
 * no new color literal), only the structural wrapper (`.draft-swap-drawer`)
 * and the two-button `.similar-rcard-actions` stack are new.
 */
export type DraftPaperSwapDrawerProps = {
  seedTitle: string
  recipeSummary: string
  request: SimilarPassagesRequestState
  /** groupIds already present as an item in THIS draft paper (including the
   * seed's own item) — disables both actions, C8 "已在草稿卷中" wording. */
  existingGroupIds: Set<string>
  /** Full corpus lookup (App.tsx's questionGroupById, threaded through
   * DraftPaperWorkbench) — a candidate groupId absent here is "thin" (paper
   * asset analyzed, DB not yet synced), same SW-3 parity as
   * SimilarPassagesPanel. */
  questionGroupById: Map<string, QuestionGroupCard>
  onCollapse: () => void
  onRetry: () => void
  onReplace: (candidateGroupId: string) => void
  onAdd: (candidateGroupId: string) => void
}

export function DraftPaperSwapDrawer(props: DraftPaperSwapDrawerProps): ReactNode {
  const { seedTitle, recipeSummary, request, existingGroupIds, questionGroupById, onCollapse, onRetry, onReplace, onAdd } = props

  return (
    <div className="draft-swap-drawer">
      <div className="similar-passages-head">
        <h4 className="paper-browse-lecture-title">相似篇章 · {seedTitle}</h4>
        <button type="button" className="similar-backlink" onClick={onCollapse}>
          返回目录
        </button>
      </div>
      <p className="similar-passages-sub">{recipeSummary}</p>

      {request.status === 'loading' && <p className="paper-browse-lecture-empty">加载中…</p>}

      {request.status === 'error' && (
        <div className="similar-rail-error">
          <p className="paper-browse-lecture-empty">{request.message}</p>
          <button type="button" className="similar-btn" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {request.status === 'ready' && (
        <>
          {request.data.results.length === 0 ? (
            <p className="paper-browse-lecture-empty">
              {request.data.notice || '库里暂时没有匹配的相似篇章。'}
            </p>
          ) : (
            <div className="similar-rcard-list">
              {request.data.results.map((result) => {
                const isThin = !questionGroupById.has(result.groupId)
                const alreadyInDraft = existingGroupIds.has(result.groupId)
                const disabled = isThin || alreadyInDraft
                const title = alreadyInDraft
                  ? '已在草稿卷中'
                  : isThin
                    ? '该卷未入库存，暂不能加入'
                    : undefined
                return (
                  <div key={result.groupId} className="similar-rcard" data-group-id={result.groupId}>
                    <div className="similar-rcard-body">
                      <div className="similar-rcard-title">{result.title}</div>
                      <div className="similar-rcard-source">{result.sourceLabel}</div>
                      <div className="similar-rcard-chips">
                        {result.reasons.map((reason, index) => (
                          <span key={`${reason.kind}-${index}`} className="similar-chip similar-chip--hit">
                            {reason.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="similar-rcard-actions">
                      <button
                        type="button"
                        className="similar-btn similar-btn--primary"
                        disabled={disabled}
                        title={title}
                        onClick={() => onReplace(result.groupId)}
                      >
                        ⇄ 替换这篇
                      </button>
                      <button
                        type="button"
                        className="similar-btn"
                        disabled={disabled}
                        title={title}
                        onClick={() => onAdd(result.groupId)}
                      >
                        ＋ 加入
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <p className="similar-pool-note">
            库内同话题还剩 {Math.max(request.data.poolStats.totalInPool - request.data.poolStats.returned, 0)} 组
          </p>
        </>
      )}
    </div>
  )
}

export type DraftPaperRailProps = {
  items: DraftPaperItem[]
  activeGroupId: string | null
  onItemClick: (groupId: string) => void
  onDragStart: (itemId: string) => void
  onDrop: (targetId: string) => void
  onMoveItem: (itemId: string, direction: -1 | 1) => void
  onDeleteItem: (item: DraftPaperItem) => void
  /* workbench-header-unify Locked Decision 5: the "共 N 页 · 双面 M 张 · A4"
     真值 text retired from `.draft-paper-meta-row` (which retired along with
     it) and relocates here as a quiet annotation at the rail's top —
     DraftPaperWorkbench.tsx still owns the pageCount/printForm math, this
     component only renders the finished string. */
  metaText?: string
  /* similar-workbench-swap (E7, plan.md "抽屉（rail 原地切换）"): non-null
     swaps the ENTIRE rail body (this nav's content) for the swap drawer —
     "目录 ⇄ 抽屉两态原地切换", never both at once. `<nav>` itself (width/
     sticky positioning) is unchanged either way. */
  swapDrawer?: DraftPaperSwapDrawerProps | null
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
  const { items, activeGroupId, onItemClick, onDragStart, onDrop, onMoveItem, onDeleteItem, metaText, swapDrawer } = props

  if (swapDrawer) {
    return (
      <nav className="draft-paper-rail" aria-label="相似篇章候选">
        <DraftPaperSwapDrawer {...swapDrawer} />
      </nav>
    )
  }

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
      {metaText && <p className="draft-paper-rail-meta">{metaText}</p>}
      {items.map((item) => {
        const isMissing = item.groupMissing
        const printableRank = printableRankByItemId.get(item.id)
        const label = isMissing
          ? '题组已从题库中移除'
          : item.questionGroup?.passageTitle || item.questionGroup?.title || item.groupId
        // C6 (trust-cracks) — rail 行尾计数改为 "N 题"（去题型词）：题型已经在
        // 同一行的 groupTypeLabel 里显示过一次，行尾再复读一遍对阅读四项
        // (A/B/C/D 都读 "阅读") 尤其重复。`title` 补回 label · 题型 · N 题的
        // 全文，鼠标悬停/长按仍能看到被截断的完整信息。
        const groupTypeText = groupTypeLabel[item.questionGroup?.groupType || 'other']
        const questionCount = item.questionGroup?.questionCount || 0
        const rowTitle = isMissing ? undefined : `${label} · ${groupTypeText} · ${questionCount} 题`

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
            title={rowTitle}
          >
            <GripVertical aria-hidden="true" className="draft-paper-rail-grip" size={13} />
            {!isMissing && <span className="draft-paper-rail-no">{chineseNumeral(printableRank ?? 0)}</span>}
            <span className="draft-paper-rail-label">{label}</span>
            {!isMissing && (
              <span className="draft-paper-rail-count">{questionCount} 题</span>
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
