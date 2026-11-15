/**
 * SimilarQuestionsRailView — similar-rail (E2/E6) 讲评栏「配相似」/
 * 「相似篇章」结果态。
 *
 * Pure presentational: PaperBrowsePage owns the fetch lifecycle
 * (`similarRequest`), the selection Set, and the toast timer; this
 * component only renders whichever state it's handed and reports user
 * intent back via callbacks. Mirrors prototype.html's `#view-similar`
 * (docs/cuts/similar-questions/prototype.html, owner 拍板 2026-07-10).
 *
 * similar-passages-entry (E6): cloze/sevenChoices retired their
 * small-question recipe (program.md §配方 v2) — the CTA for those two
 * groupTypes now seeds `POST /api/similar-passages` instead. `request.data`
 * is therefore a discriminated union (`kind: 'questions' | 'passages'`) so
 * this one view keeps rendering both shapes: the passages branch has no
 * `matchedQuestionIds` (normalized to `[]` below, same as SW-2's existing
 * "may be empty" handling) and carries the server's honest-empty `notice`.
 * The head-row label ("配相似" vs "相似篇章") and seed-line/recipe text are
 * decided by the caller (`seed.mode`) at CTA-click time, before the
 * response arrives.
 *
 * CR 硬交接 (docs/cuts/similar-engine/cr.md) 处置 — 落在这个文件里:
 *   - SW-1（engine-rewire 撤刀，2026-07-13）: 曾经按 "同体裁" label 前缀过滤
 *     cloze secondary reason 的恒真过滤器函数已摘除。真值落库后
 *     `discourse_type` 不再 ≡ `group_type`（不再恒定），cloze 的 `同体裁 X`
 *     chip 重新变成有效信号，reasons 全量渲染。
 *   - SW-2: `matchedQuestionIds` 可能为空——"含 N 题" 前缀 chip 只在非空时
 *     渲染，不假设非空。
 *   - SW-3: `questionGroupById` 查不到的候选 = thin（paper-asset 已解析、
 *     DB 未同步），复选框禁用 + title 提示，仍然渲染（池子诚实，不隐藏）。
 */
import type { ReactNode } from 'react'
import { FluidHoverList } from '../../components/FluidHoverList'
import { Button } from '../../shared-ui/Button.tsx'
import { Toast } from '../../shared-ui/Toast.tsx'
import { Chip } from '../../shared-ui/Chip.tsx'
import { RotateCcw } from '../../icons'
import type {
  QuestionGroupCard,
  SimilarPassagesResponse,
  SimilarQuestionReason,
  SimilarQuestionsResponse,
} from '../../domain/questionBank'

export type SimilarRailSeedInfo = {
  /** E6: which endpoint this seed was fetched against — drives the head-row
   * label ("配相似" stays for questions mode; "相似篇章" for passages mode,
   * per plan §6 "头行文案"). */
  mode: 'questions' | 'passages'
  groupTitle: string
  questionNo: number | null
  groupTypeLabel: string
  recipeSummary: string
}

export type SimilarRailData =
  | { kind: 'questions'; response: SimilarQuestionsResponse }
  | { kind: 'passages'; response: SimilarPassagesResponse }

export type SimilarRailRequestState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: SimilarRailData }

/** Unified shape both response kinds render through — `matchedQuestionIds`
 * is a small-question-only concept, normalized to `[]` for passages
 * results (renderChips already treats an empty array as "no chip", not a
 * synthesized truth). */
type UnifiedResult = {
  groupId: string
  paperId: string | null
  title: string
  sourceLabel: string
  score: number
  reasons: SimilarQuestionReason[]
  matchedQuestionIds: string[]
}

function toUnifiedResults(data: SimilarRailData): UnifiedResult[] {
  if (data.kind === 'questions') {
    return data.response.results
  }
  return data.response.results.map((result) => ({ ...result, matchedQuestionIds: [] }))
}

export type SimilarQuestionsRailViewProps = {
  seed: SimilarRailSeedInfo
  request: SimilarRailRequestState
  questionGroupById: Map<string, QuestionGroupCard>
  selectedGroupIds: Set<string>
  onToggleGroup: (groupId: string) => void
  onBack: () => void
  onRetry: () => void
  onAddToDraft: () => void
  /** `null` = no toast. 要说什么由父组件（PaperBrowsePage 的 `similarToast`）定；
   * 2026-11-15 起停留计时在共用 Toast 里（成功 2.2 秒，鼠标停在上面、焦点在里面时停住），到时叫 onToastClose。 */
  toastMessage: SimilarToast | null
  onToastClose: () => void
}

/** 「加入草稿卷」之后那一行：成功（2.2 秒后收起）或没加入（原话照登，带「重试」时行尾一个键，不自动收起）。 */
export type SimilarToast =
  | { kind: 'success'; text: string }
  | { kind: 'error'; text: string; detail: string; retry?: () => void }

function renderChips(matchedQuestionIds: string[], reasons: SimilarQuestionReason[]): ReactNode {
  return (
    <div className="similar-rcard-chips">
      {matchedQuestionIds.length > 0 && (
        <Chip className="similar-chip">含 {matchedQuestionIds.length} 题</Chip>
      )}
      {reasons.map((reason, index) => (
        <Chip key={`${reason.kind}-${index}`} className="similar-chip">
          {reason.label}
        </Chip>
      ))}
    </div>
  )
}

export function SimilarQuestionsRailView(props: SimilarQuestionsRailViewProps): ReactNode {
  const { seed, request, questionGroupById, selectedGroupIds, onToggleGroup, onBack, onRetry, onAddToDraft, toastMessage, onToastClose } =
    props

  const questionLabel = seed.questionNo != null ? `第${seed.questionNo}题` : ''
  const seedLine = [seed.groupTitle, questionLabel].filter(Boolean).join(' · ')
  const headLabel = seed.mode === 'passages' ? '相似篇章' : '配相似'

  return (
    <div className="similar-rail">
      <div className="similar-rail-head">
        <h4 className="paper-browse-lecture-title">
          {headLabel} · {seed.groupTypeLabel}
        </h4>
        <Button tone="quiet" size="sm" className="similar-backlink" onClick={onBack}>
          ← 返回解析
        </Button>
      </div>

      {request.status !== 'loading' && (
        <p className="similar-seed-line">
          种子：<b>{seedLine}</b>　配方：{seed.recipeSummary}　<span>已排除本卷</span>
        </p>
      )}

      {request.status === 'loading' && <p className="paper-browse-lecture-empty">{headLabel}加载中…</p>}

      {request.status === 'error' && (
        <div className="similar-rail-error">
          <p className="paper-browse-lecture-empty">{request.message}</p>
          <Button tone="strong" size="sm" className="similar-btn" onClick={onRetry}>
            重试
          </Button>
        </div>
      )}

      {request.status === 'ready' && (() => {
        const results = toUnifiedResults(request.data)
        const poolStats = request.data.response.poolStats
        const notice = request.data.kind === 'passages' ? request.data.response.notice : null
        return (
          <>
            {results.length === 0 ? (
              <p className="paper-browse-lecture-empty">{notice || '库里暂时没有匹配的相似题。'}</p>
            ) : (
              <FluidHoverList
                as="div"
                axis="y"
                itemSelector=".similar-rcard"
                className="similar-rcard-list"
              >
                {results.map((result) => {
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
              </FluidHoverList>
            )}
            <p className="similar-pool-note">
              库内同类还剩 {Math.max(poolStats.totalInPool - poolStats.returned, 0)} 组
            </p>
          </>
        )
      })()}

      {request.status === 'ready' && (
        <div className="similar-rail-foot">
          <span className="similar-count">
            {selectedGroupIds.size > 0 ? `已选 ${selectedGroupIds.size} 篇` : '未选择'}
          </span>
          <Button tone="primary" size="sm" className="similar-btn" disabled={selectedGroupIds.size === 0} onClick={onAddToDraft}>
            加入草稿卷
          </Button>
        </div>
      )}

      {/* 共用构件 shared-ui/Toast（2026-11-15，原来是共用提示行的 floating 放法）：白底、e3、视口底部正中，
          一次只显示一条。成功 2.2 秒收起；没加入的不自己收起（留着「重试」）。类名 similar-toast 留作挂钩。 */}
      <Toast
        message={toastMessage?.text ?? null}
        token={toastMessage}
        kind={toastMessage?.kind ?? 'success'}
        duration={toastMessage?.kind === 'error' ? null : 2200}
        className="similar-toast"
        detail={toastMessage?.kind === 'error' ? toastMessage.detail : null}
        action={toastMessage?.kind === 'error' && toastMessage.retry
          ? { label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: toastMessage.retry }
          : undefined}
        onClose={onToastClose}
      />
    </div>
  )
}
