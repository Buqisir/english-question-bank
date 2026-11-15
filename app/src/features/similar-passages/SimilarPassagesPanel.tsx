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
import { type ReactNode } from 'react'
import { ChevronUp } from '../../icons'
import { Button } from '../../shared-ui/Button.tsx'
import { Notice } from '../../shared-ui/Notice.tsx'
import { DraftAddButton } from '../../shared-ui/DraftAddButton.tsx'
import { Chip } from '../../shared-ui/Chip.tsx'
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
  onCollapse: () => void
  onRetry: () => void
}

export function SimilarPassagesPanel(props: SimilarPassagesPanelProps): ReactNode {
  const { recipeSummary, request, questionGroupById, onCollapse, onRetry } = props

  return (
    <div className="similar-passages-panel">
      <div className="similar-passages-head">
        <h4 className="paper-browse-lecture-title">相似篇章</h4>
        <span className="similar-passages-sub">{recipeSummary}</span>
        <Button tone="quiet" size="sm" className="similar-backlink" onClick={onCollapse}>
          收起 <ChevronUp size={12} aria-hidden="true" />
        </Button>
      </div>

      {request.status === 'loading' && <Notice kind="waiting">加载中…</Notice>}

      {request.status === 'error' && (
        <Notice kind="error" className="similar-rail-error" action={{ label: '重试', onClick: onRetry }}>
          {request.message}
        </Notice>
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
                          <Chip key={`${reason.kind}-${index}`} className="similar-chip">
                            {reason.label}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="similar-rcard-actions">
                      {/* Owner 2026-11-14 决定 #17：每张卡片一个键，一页会有好几个，不用雾薄荷主键（每页一处），
                          改成墨字键 strong。详情页上方「加入草稿卷」仍是那一页唯一的主键。
                          走查第四节第 6 条：能加的换成共用加入键（加入后「已加入 · 撤回」就在卡片上），
                          原来点完不管成没成都弹的「已把「…」加入草稿卷」提示条去掉了。 */}
                      {card ? (
                        <DraftAddButton className="similar-btn" target={card} tone="strong" size="sm" />
                      ) : (
                        <Button
                          tone="strong"
                          size="sm"
                          className="similar-btn"
                          disabled={isThin}
                          title="该卷未入库存，暂不能加入"
                        >
                          ＋ 加入草稿卷
                        </Button>
                      )}
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
