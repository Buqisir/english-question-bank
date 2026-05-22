/**
 * ConciergeGroupCard — a single 题组/篇章 card rendered INSIDE the expanded
 * area of a paper bucket row. Carries the per-group reason and the two
 * teacher-facing actions (加入草稿卷, 找类似), plus a lightweight 阅读解析
 * entry (Cut 3) for groups that are eligible.
 *
 * Smallest add unit is still QuestionGroup. There is no per-question add UI.
 */

import { type ReactNode } from 'react'
import {
  difficultyLabel,
  groupTypeLabel,
  type Difficulty,
  type QuestionGroupCard,
} from '../domain/questionBank.ts'

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  low: 'concierge-difficulty-low',
  medium: 'concierge-difficulty-medium',
  high: 'concierge-difficulty-high',
}

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

function buildTagPills(group: QuestionGroupCard): string[] {
  const pills: string[] = []
  pills.push(difficultyLabel[group.difficulty])
  const type = groupTypeLabel[group.groupType]
  if (type) pills.push(type)
  if (Number.isFinite(group.questionCount) && group.questionCount > 0) {
    pills.push(`${group.questionCount} 题`)
  }
  const topic = group.topicLabels?.[0]?.label
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
}

export function ConciergeGroupCard(props: ConciergeGroupCardProps): ReactNode {
  const { group, reason, alreadyInBasket, onAdd, onSimilar } = props
  const section = compactSection(group)
  const passageTitle = compactPassageTitle(group)
  const summary = compactSummary(group)
  const pills = buildTagPills(group)
  const readingAnalysisHref =
    group.hasPaperSurfaceAnalysis && group.paperSurfaceHref ? group.paperSurfaceHref : null

  return (
    <article className="concierge-group-card" aria-label={`${section || groupTypeLabel[group.groupType]} ${passageTitle}`}>
      <header className="concierge-group-head">
        <div className="concierge-group-head-text">
          {section && <span className="concierge-group-section">{section}</span>}
          <strong className="concierge-group-title" title={passageTitle}>{passageTitle}</strong>
        </div>
        <span
          className={`concierge-difficulty-dot ${DIFFICULTY_CLASS[group.difficulty]}`}
          aria-hidden="true"
        />
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
          disabled={alreadyInBasket}
          aria-pressed={alreadyInBasket}
        >
          {alreadyInBasket ? '已加入' : '加入草稿卷'}
        </button>
        <button
          type="button"
          className="concierge-action"
          onClick={() => onSimilar(group)}
        >
          找类似
        </button>
        {readingAnalysisHref && (
          // Lightweight link, NOT a button — opens the analysis route in
          // the same tab. Reuses `.concierge-action` styling so it visually
          // belongs to the same row of group actions but doesn't compete
          // with the primary 加入草稿卷.
          <a
            className="concierge-action concierge-action-reading-analysis"
            href={readingAnalysisHref}
            data-ra-entry="group-card"
            data-ra-group-id={group.id}
          >
            阅读解析
          </a>
        )}
      </div>
    </article>
  )
}
