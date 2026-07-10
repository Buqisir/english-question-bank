/**
 * SimilarQuestionsRailView — similar-rail (E2) 讲评栏「配相似」结果态。
 *
 * Pure presentational: PaperBrowsePage owns the fetch lifecycle
 * (`similarRequest`), the selection Set, and the toast timer; this
 * component only renders whichever state it's handed and reports user
 * intent back via callbacks. Mirrors prototype.html's `#view-similar`
 * (docs/cuts/similar-questions/prototype.html, owner 拍板 2026-07-10).
 *
 * CR 硬交接 (docs/cuts/similar-engine/cr.md) 处置 — 落在这个文件里:
 *   - SW-1: 恒真 reason 不渲染。`discourse_type` 在真实数据里 ≡
 *     `group_type`（同池恒定），引擎对 cloze 候选恒发 `同体裁 X`
 *     （kind: 'secondary', label 以 "同体裁" 开头）——白名单渲染时按这个
 *     label 前缀过滤掉，其余 kind 一律照渲染（含 reading 的
 *     position-proxy，那个 label 混了词数邻近度，不是纯常量）。
 *   - SW-2: `matchedQuestionIds` 可能为空——"含 N 题" 前缀 chip 只在非空时
 *     渲染，不假设非空。
 *   - SW-3: `questionGroupById` 查不到的候选 = thin（paper-asset 已解析、
 *     DB 未同步），复选框禁用 + title 提示，仍然渲染（池子诚实，不隐藏）。
 */
import type { ReactNode } from 'react'
import type { QuestionGroupCard, SimilarQuestionReason, SimilarQuestionsResponse } from '../../domain/questionBank'

export type SimilarRailSeedInfo = {
  groupTitle: string
  questionNo: number | null
  groupTypeLabel: string
  recipeSummary: string
}

export type SimilarRailRequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SimilarQuestionsResponse }

export type SimilarQuestionsRailViewProps = {
  seed: SimilarRailSeedInfo
  request: SimilarRailRequestState
  questionGroupById: Map<string, QuestionGroupCard>
  selectedGroupIds: Set<string>
  onToggleGroup: (groupId: string) => void
  onBack: () => void
  onRetry: () => void
  onAddToDraft: () => void
  /** `null` = no toast. Parent owns the show/clear timer (PaperBrowsePage's
   * `similarToast` state) so there is one source of truth for the fade
   * timing instead of splitting it between parent-set and component-local
   * clocks. */
  toastMessage: string | null
}

// SW-1: the one constant-discourse reason shape the E1 CR flagged (cloze's
// `secondary` term — DB discourse_type ≡ group_type in the same pool, so
// this reads "同体裁" on every candidate, zero区分度). Everything else the
// engine emits is a real signal and renders as a chip.
function isConstantDiscourseReason(reason: SimilarQuestionReason): boolean {
  return reason.kind === 'secondary' && reason.label.startsWith('同体裁')
}

function renderChips(matchedQuestionIds: string[], reasons: SimilarQuestionReason[]): ReactNode {
  const visibleReasons = reasons.filter((reason) => !isConstantDiscourseReason(reason))
  return (
    <div className="similar-rcard-chips">
      {matchedQuestionIds.length > 0 && (
        <span className="similar-chip similar-chip--hit">含 {matchedQuestionIds.length} 题</span>
      )}
      {visibleReasons.map((reason, index) => (
        <span key={`${reason.kind}-${index}`} className="similar-chip similar-chip--hit">
          {reason.label}
        </span>
      ))}
    </div>
  )
}

export function SimilarQuestionsRailView(props: SimilarQuestionsRailViewProps): ReactNode {
  const { seed, request, questionGroupById, selectedGroupIds, onToggleGroup, onBack, onRetry, onAddToDraft, toastMessage } =
    props

  const questionLabel = seed.questionNo != null ? `第${seed.questionNo}题` : ''
  const seedLine = [seed.groupTitle, questionLabel].filter(Boolean).join(' · ')

  return (
    <div className="similar-rail">
      <div className="similar-rail-head">
        <h4 className="paper-browse-lecture-title">配相似 · {seed.groupTypeLabel}</h4>
        <button type="button" className="similar-backlink" onClick={onBack}>
          ← 返回解析
        </button>
      </div>

      {request.status !== 'loading' && (
        <p className="similar-seed-line">
          种子：<b>{seedLine}</b>　配方：{seed.recipeSummary}　<span>已排除本卷</span>
        </p>
      )}

      {request.status === 'loading' && <p className="paper-browse-lecture-empty">配相似加载中…</p>}

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
            <p className="paper-browse-lecture-empty">库里暂时没有匹配的相似题。</p>
          ) : (
            <div className="similar-rcard-list">
              {request.data.results.map((result) => {
                const card = questionGroupById.get(result.groupId)
                const isThin = !card
                const checked = selectedGroupIds.has(result.groupId)
                return (
                  <label
                    key={result.groupId}
                    className={`similar-rcard${checked ? ' similar-rcard--checked' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isThin}
                      title={isThin ? '该卷未入库存，暂不能加入' : undefined}
                      onChange={() => onToggleGroup(result.groupId)}
                    />
                    <div className="similar-rcard-body">
                      <div className="similar-rcard-title">{result.title}</div>
                      <div className="similar-rcard-source">{result.sourceLabel}</div>
                      {renderChips(result.matchedQuestionIds, result.reasons)}
                    </div>
                  </label>
                )
              })}
            </div>
          )}
          <p className="similar-pool-note">
            库内同类还剩 {Math.max(request.data.poolStats.totalInPool - request.data.poolStats.returned, 0)} 组
          </p>
        </>
      )}

      {request.status === 'ready' && (
        <div className="similar-rail-foot">
          <span className="similar-count">
            {selectedGroupIds.size > 0 ? `已选 ${selectedGroupIds.size} 篇` : '未选择'}
          </span>
          <button type="button" className="similar-btn similar-btn--primary" disabled={selectedGroupIds.size === 0} onClick={onAddToDraft}>
            加入草稿卷
          </button>
        </div>
      )}

      <div className={`similar-toast${toastMessage ? ' similar-toast--on' : ''}`}>{toastMessage}</div>
    </div>
  )
}
