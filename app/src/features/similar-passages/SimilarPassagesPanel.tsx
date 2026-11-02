/**
 * SimilarPassagesPanel — shared "相似篇章" candidate panel
 * (similar-passages-entry, E6).
 *
 * Pure presentational, owns no fetch: the host (QuestionGroupDetailView's
 * detail-page entry, ConciergeGroupCard's search-card entry) owns the
 * `fetchSimilarPassages` lifecycle and hands this component whichever
 * request state it's in — mirrors SimilarQuestionsRailView's split
 * (PaperBrowsePage owns fetch, the view is pure). Renders inline, "hero下方
 * 原地展开" per prototype-passage-entry.html 场景 1/3 (owner 拍板
 * 2026-07-15): head row (title + recipe subhead + 收起), one candidate card
 * per result (title, sourceLabel, reason chips, one immediate 加入草稿卷
 * button — no checkbox/batch selection, unlike the讲评栏 rail which persists
 * a multi-select), a pool-honesty note, and the server's diagnostic
 * `notice` (种子零话题标签的诚实空态) rendered verbatim when present.
 *
 * Styling reuses the `.similar-*` / `.paper-browse-lecture-*` class
 * language already established in
 * app/src/features/paper-browse/paperBrowsePage.css (DESIGN.md §7 — no new
 * color literals invented here); this file adds no CSS import of its own —
 * that stylesheet is part of the single app bundle regardless of route
 * (PaperBrowsePage.tsx is statically imported by App.tsx). The handful of
 * panel-specific rules this component needs
 * (`.similar-passages-panel/-head/-sub`) live alongside the rest of the
 * `.similar-*` block in that same file, not duplicated here.
 *
 * SW-3 parity: a candidate groupId absent from `questionGroupById` (paper-
 * asset analyzed, DB not yet synced) renders thin — disabled add button +
 * title tooltip, still shown (pool honesty, not hidden).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronUp } from '../../icons'
import type { QuestionGroupCard, SimilarPassagesResponse } from '../../domain/questionBank'

export type SimilarPassagesRequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SimilarPassagesResponse }

/** Per-groupType one-line recipe description for the panel subtitle —
 * 篇位 only ever scores for reading (server findSimilarPassages), so only
 * reading's line mentions it (CR SW-4: no overclaiming for the other three).
 * Purely presentational — the real ordering/scoring lives server-side. */
export function similarPassagesRecipeSummary(groupType: string): string {
  return groupType === 'reading'
    ? '同话题硬门槛 · 同篇位优先 · 真题优先'
    : '同话题硬门槛 · 真题优先 · 年份新优先'
}

export type SimilarPassagesPanelProps = {
  /** One-line recipe description shown next to the panel title. Purely
   * presentational — the real ordering/scoring lives server-side. */
  recipeSummary: string
  request: SimilarPassagesRequestState
  questionGroupById: Map<string, QuestionGroupCard>
  onAdd: (card: QuestionGroupCard) => void
  onCollapse: () => void
  onRetry: () => void
}

export function SimilarPassagesPanel(props: SimilarPassagesPanelProps): ReactNode {
  const { recipeSummary, request, questionGroupById, onAdd, onCollapse, onRetry } = props
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    return (): void => {
      if (toastTimeoutRef.current != null) window.clearTimeout(toastTimeoutRef.current)
    }
  }, [])

  function handleAdd(card: QuestionGroupCard): void {
    onAdd(card)
    if (toastTimeoutRef.current != null) window.clearTimeout(toastTimeoutRef.current)
    setToastMessage(`已加入草稿卷 · ${card.title || card.id}`)
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 2200)
  }

  return (
    <div className="similar-passages-panel">
      <div className="similar-passages-head">
        <h4 className="paper-browse-lecture-title">相似篇章</h4>
        <span className="similar-passages-sub">{recipeSummary}</span>
        <button type="button" className="similar-backlink" onClick={onCollapse}>
          收起 <ChevronUp size={12} aria-hidden="true" />
        </button>
      </div>

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
                const card = questionGroupById.get(result.groupId)
                const isThin = !card
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
                        disabled={isThin}
                        title={isThin ? '该卷未入库存，暂不能加入' : undefined}
                        onClick={() => card && handleAdd(card)}
                      >
                        ＋ 加入草稿卷
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

      <div className={`similar-toast${toastMessage ? ' similar-toast--on' : ''}`}>{toastMessage}</div>
    </div>
  )
}
