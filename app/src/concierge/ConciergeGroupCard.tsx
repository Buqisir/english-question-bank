/**
 * ConciergeGroupCard — a single 题组/篇章 card rendered INSIDE the expanded
 * area of a paper bucket row. Carries the per-group reason and the two
 * teacher-facing actions (加入草稿卷, 找类似), plus a lightweight PaperSurface
 * entry (Cut 3) for groups that are eligible.
 *
 * Smallest add unit is still QuestionGroup. There is no per-question add UI.
 */

import { type ReactNode } from 'react'
import {
  groupTypeLabel,
  type QuestionGroupCard,
} from '../domain/questionBank.ts'

function isDisplayTag(tag: string | undefined): tag is string {
  const value = (tag || '').trim()
  if (!value) return false
  if (/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/i.test(value)) return false
  if (/^[\x21-\x7E]+$/.test(value) && value.length > 16) return false
  return !/(deepseek|steward|parse|eval|import|reading-parse|source-gap|gap-fill|导入草稿|管家规则|待审阅)/i.test(value)
}

function compactSection(group: QuestionGroupCard): string | null {
  const section = (group.section || '').trim()
  if (!section) return null
  return section
    .replace(/阅读理解\s*/g, '阅读 ')
    .replace(/\s+/g, ' ')
    .trim()
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
 * "人与自然-自然生态-生态环境"). A card pill shows only the leaf subtopic —
 * the specific, teacher-recognizable phrase — not the whole path.
 */
function topicLeafLabel(group: QuestionGroupCard): string | null {
  const first = group.topicLabels?.[0]
  if (!first) return null
  const leaf = (first.subtopic || first.label.split('-').pop() || '').trim()
  return leaf || null
}

function buildTagPills(group: QuestionGroupCard): string[] {
  const pills: string[] = []
  const type = groupTypeLabel[group.groupType]
  if (type) pills.push(type)
  if (Number.isFinite(group.questionCount) && group.questionCount > 0) {
    pills.push(`${group.questionCount} 题`)
  }
  const topic = topicLeafLabel(group)
  if (topic && isDisplayTag(topic)) {
    pills.push(topic)
  } else {
    const t = group.tags?.find(isDisplayTag)
    if (t) pills.push(t)
  }
  return pills
}

export type ConciergeGroupCardProps = {
  group: QuestionGroupCard
  reason: string
  alreadyInBasket: boolean
  onAdd: (group: QuestionGroupCard) => void
  onSimilar: (group: QuestionGroupCard) => void
  /** classic-retire-2-detail-view — opens the read-only detail view for this group. */
  onOpenDetail?: (group: QuestionGroupCard) => void
}

export function ConciergeGroupCard(props: ConciergeGroupCardProps): ReactNode {
  const { group, reason, alreadyInBasket, onAdd, onSimilar, onOpenDetail } = props
  const section = compactSection(group)
  const passageTitle = compactPassageTitle(group)
  const summary = compactSummary(group)
  const pills = buildTagPills(group)
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

  return (
    <article
      className="concierge-group-card"
      data-group-id={group.id}
      aria-label={`${section || groupTypeLabel[group.groupType]} ${passageTitle}`}
    >
      <header className="concierge-group-head">
        <div className="concierge-group-head-text">
          {section && <span className="concierge-group-section">{section}</span>}
          <strong className="concierge-group-title" title={passageTitle}>{passageTitle}</strong>
        </div>
      </header>

      {summary && (
        <p className="concierge-group-summary" title={summary}>
          {summary}
        </p>
      )}

      <div className="concierge-group-pills" aria-label="题组标签">
        {pills.map((pill, idx) => (
          <span className="concierge-group-pill" key={`${pill}-${idx}`}>{pill}</span>
        ))}
      </div>

      {reason && (
        <p className="concierge-group-reason" title={reason}>
          <span className="concierge-group-reason-label">推荐理由：</span>
          <span>{reason}</span>
        </p>
      )}

      <div className="concierge-group-actions" aria-label="题组操作">
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
    </article>
  )
}
