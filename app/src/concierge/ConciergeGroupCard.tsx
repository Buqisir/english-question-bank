/**
 * ConciergeGroupCard — one 题组/篇章 row inside the expanded 卷面目录
 * (home-editorial cut retired the old nine-card grid; this component now
 * renders a dense index row, not a card — the file name is kept unchanged
 * per the cut's contract even though the visual is a list row).
 *
 * Carries the per-group reason and the teacher-facing actions (加入草稿卷,
 * 找类似, 详情), plus a lightweight PaperSurface entry (Cut 3) for groups
 * that are eligible. The action cluster reveals on row hover/focus-within;
 * clicking the row body (outside the action cluster) opens the same detail
 * view as the explicit 详情 button, for mouse convenience.
 *
 * Smallest add unit is still QuestionGroup. There is no per-question add UI.
 */

import { type MouseEvent, type ReactNode } from 'react'
import { type QuestionGroupCard } from '../domain/questionBank.ts'

function isDisplayTag(tag: string | undefined): tag is string {
  const value = (tag || '').trim()
  if (!value) return false
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value)) return false
  if (/^[\x21-\x7E]+$/.test(value) && value.length > 16) return false
  return !/(deepseek|steward|parse|eval|import|reading-parse|source-gap|gap-fill|导入草稿|管家规则|待审阅)/i.test(value)
}

function compactPassageTitle(group: QuestionGroupCard): string {
  const passageTitle = (group.passageTitle || '').trim()
  if (passageTitle && isDisplayTag(passageTitle)) return passageTitle
  const title = (group.title || '').trim()
  if (title && isDisplayTag(title)) return title
  return '篇章题组'
}

function compactSummary(group: QuestionGroupCard): string {
  return (group.summary || '').trim()
}

/**
 * Topic labels are stored as a full `theme-themeGroup-subtopic` path (e.g.
 * "人与自然-自然生态-生态环境"). The row shows only the leaf subtopic — the
 * specific, teacher-recognizable phrase — not the whole path.
 */
function topicLeafLabel(group: QuestionGroupCard): string | null {
  const first = group.topicLabels?.[0]
  if (!first) return null
  const leaf = (first.subtopic || first.label.split('-').pop() || '').trim()
  return leaf || null
}

/** Falls back to the first display-worthy free tag when no topic leaf is usable. */
function buildTopicText(group: QuestionGroupCard): string | null {
  const topic = topicLeafLabel(group)
  if (topic && isDisplayTag(topic)) return topic
  const tag = group.tags?.find(isDisplayTag)
  return tag || null
}

export type ConciergeGroupCardProps = {
  group: QuestionGroupCard
  reason: string
  alreadyInBasket: boolean
  onAdd: (group: QuestionGroupCard) => void
  onSimilar: (group: QuestionGroupCard) => void
  /** classic-retire-2-detail-view — opens the read-only detail view for this group. */
  onOpenDetail?: (group: QuestionGroupCard) => void
  /**
   * home-editorial — search-hit rows render at full ink; non-hit rows inside
   * an expanded search result dim to ink-faint instead of the retired
   * green-tint/teal-stripe treatment. Feed rows (browsing, no search) never
   * pass true here — every group in a browse feed is trivially "hit".
   */
  dimmed?: boolean
}

export function ConciergeGroupCard(props: ConciergeGroupCardProps): ReactNode {
  const { group, reason, alreadyInBasket, onAdd, onSimilar, onOpenDetail, dimmed } = props
  const passageTitle = compactPassageTitle(group)
  const summary = compactSummary(group)
  const topicText = buildTopicText(group)
  const paperSurfaceAnalysisHref =
    group.hasPaperSurfaceAnalysis && group.paperSurfaceHref && group.paperSurfaceLabel
      ? group.paperSurfaceHref
      : null
  const draftState = group.draftPaperButtonState || (alreadyInBasket ? 'in_current_draft' : 'add')
  const draftButtonLabel =
    draftState === 'in_current_draft'
      ? '✓ 已在草稿卷中'
      : draftState === 'disabled'
        ? '暂不可组卷'
        : '加入草稿卷'
  const draftButtonTitle =
    draftState === 'disabled'
      ? group.printUnavailableReason || '该题组暂不可加入草稿卷'
      : draftState === 'in_current_draft'
        ? '打开当前草稿卷并定位到该题组'
        : '加入当前草稿卷'

  const handleRowBodyClick = (event: MouseEvent<HTMLElement>) => {
    if (!onOpenDetail) return
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"]')) return
    onOpenDetail(group)
  }

  return (
    <div
      className={`concierge-group-row${dimmed ? ' is-dim' : ''}`}
      data-group-id={group.id}
    >
      <div className="concierge-group-row-body" onClick={handleRowBodyClick}>
        <div className="concierge-group-row-main">
          <strong className="concierge-group-row-title" title={passageTitle}>
            {passageTitle}
          </strong>
          <span className="concierge-group-row-count">{group.questionCount} 题</span>
          {summary && (
            <span className="concierge-group-row-summary" title={summary}>
              {summary}
            </span>
          )}
          {topicText && <span className="concierge-group-row-topic">{topicText}</span>}
        </div>
        {reason && (
          <p className="concierge-group-row-reason" title={reason}>
            <span className="concierge-group-reason-label">推荐理由：</span>
            {reason}
          </p>
        )}
      </div>

      <div className="concierge-group-row-actions" aria-label="题组操作">
        <button
          type="button"
          className="concierge-action concierge-action-add"
          onClick={() => onAdd(group)}
          disabled={draftState === 'disabled'}
          aria-pressed={draftState === 'in_current_draft'}
          title={draftButtonTitle}
        >
          {draftButtonLabel}
        </button>
        <button
          type="button"
          className="concierge-action"
          onClick={() => onSimilar(group)}
        >
          找类似
        </button>
        {onOpenDetail && (
          <button
            type="button"
            className="concierge-action"
            onClick={() => onOpenDetail(group)}
          >
            详情
          </button>
        )}
        {paperSurfaceAnalysisHref && (
          // Lightweight link, NOT a button — opens the analysis route in
          // the same tab. Reuses `.concierge-action` styling so it visually
          // belongs to the same row of group actions but doesn't compete
          // with the primary 加入草稿卷.
          <a
            className="concierge-action concierge-action-reading-analysis"
            href={paperSurfaceAnalysisHref}
            data-ra-entry="group-card"
            data-ra-group-id={group.id}
          >
            {group.paperSurfaceLabel}
          </a>
        )}
      </div>
    </div>
  )
}
