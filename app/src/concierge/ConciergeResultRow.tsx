/**
 * ConciergeResultRow — slim horizontal row card for the concierge desk.
 *
 * Visual contract: warm white surface, ink text, cinnabar dot for difficulty.
 * Actions (preview / add / similar) are present-but-faded by default and
 * become clear on row hover/focus. No match score is shown.
 */

import type { ReactNode } from 'react'
import {
  difficultyLabel,
  groupTypeLabel,
  type Difficulty,
  type QuestionGroupCard,
} from '../domain/questionBank.ts'
import { cleanReason } from './reason.ts'

export { cleanReason }

export type ConciergeResultRowProps = {
  group: QuestionGroupCard
  reason: string
  alreadyInBasket: boolean
  onPreview: (group: QuestionGroupCard) => void
  onAdd: (group: QuestionGroupCard) => void
  onSimilar: (group: QuestionGroupCard) => void
}

const DIFFICULTY_CLASS: Record<Difficulty, string> = {
  low: 'concierge-difficulty-low',
  medium: 'concierge-difficulty-medium',
  high: 'concierge-difficulty-high',
}

function buildSourceAnchor(group: QuestionGroupCard): string {
  // Prefer existing concise group.source if it already looks like "2025·I" / "浙2024.1".
  const trimmed = (group.source || '').trim()
  if (trimmed && trimmed.length <= 14) return trimmed

  // Otherwise compose from year + region.
  const region = (group.region || '').replace(/(全国|新课标)\s*/g, '').trim()
  const year = group.year ? String(group.year) : ''
  if (year && region) return `${year}·${region}`
  if (year) return year
  if (region) return region
  return trimmed || group.paperName || '未标来源'
}

function buildSectionLabel(group: QuestionGroupCard): string | null {
  const section = (group.section || '').trim()
  if (!section) return null
  // Keep short section markers like "C 篇" / "阅读 C" / "Q1-5"; drop redundant 阅读理解 prefix.
  const compact = section
    .replace(/阅读理解\s*/g, '阅读 ')
    .replace(/\s+/g, ' ')
    .trim()
  return compact || null
}

function buildPrimaryText(group: QuestionGroupCard): string {
  // Prefer the passage-level summary (篇章中文简介) so the row reads as
  // "this is a passage about X" rather than echoing a single-question stem.
  const summary = (group.summary || '').trim()
  if (summary) return summary
  // Fall back to the passage title or the group title; do NOT surface group.hit
  // here — small-question stems belong to the detail view.
  return group.passageTitle || group.title
}

function buildMetaTags(group: QuestionGroupCard): string[] {
  const tags: string[] = []
  // Difficulty text (the colored dot conveys severity; text gives plain language).
  tags.push(difficultyLabel[group.difficulty])
  // Group type — but we suppress 阅读理解 since 阅读 already shows in section.
  const typeLabel = groupTypeLabel[group.groupType]
  if (typeLabel && typeLabel !== '阅读理解') {
    tags.push(typeLabel)
  } else if (!group.section) {
    // If section is empty, do show 阅读理解 so meta isn't naked.
    tags.push(typeLabel)
  }
  // First topic / tag.
  const topic = group.topicLabels?.[0]?.label
  if (topic) tags.push(topic)
  else if (group.tags && group.tags[0]) tags.push(group.tags[0])
  return tags
}

/**
 * Strip the "DeepSeek 检测第 N 位；" prefix from a steward reason string.
 * The remaining text is the human-readable rationale we want to show.
 * Pure helper exported for verification.
 */
// (cleanReason now lives in ./reason.ts and is re-exported above; no body here.)

export function ConciergeResultRow(props: ConciergeResultRowProps): ReactNode {
  const { group, reason, alreadyInBasket, onPreview, onAdd, onSimilar } = props
  const sourceAnchor = buildSourceAnchor(group)
  const sectionLabel = buildSectionLabel(group)
  const primaryText = buildPrimaryText(group)
  const metaTags = buildMetaTags(group)
  const displayReason = cleanReason(reason)

  return (
    <article
      className="concierge-row"
      aria-label={`${sourceAnchor} ${group.title}`}
      title={group.hit ? `小题命中：${group.hit}` : undefined}
    >
      <div className="concierge-row-anchor">
        <span className="concierge-source">{sourceAnchor}</span>
        {sectionLabel && <span className="concierge-section">{sectionLabel}</span>}
      </div>

      <div className="concierge-row-body">
        <p className="concierge-primary" title={primaryText}>
          {primaryText}
        </p>
        <div className="concierge-meta">
          <span className={`concierge-difficulty-dot ${DIFFICULTY_CLASS[group.difficulty]}`} aria-hidden="true" />
          {metaTags.map((tag, idx) => (
            <span className="concierge-meta-tag" key={`${tag}-${idx}`}>{tag}</span>
          ))}
        </div>
        {displayReason && (
          <p className="concierge-reason-line" title={displayReason}>
            <span className="concierge-reason-label">推荐理由：</span>
            <span className="concierge-reason-text">{displayReason}</span>
          </p>
        )}
      </div>

      <div className="concierge-actions" aria-label="题组操作">
        <button
          type="button"
          className="concierge-action"
          onClick={() => onPreview(group)}
        >
          预览
        </button>
        <button
          type="button"
          className="concierge-action"
          onClick={() => onAdd(group)}
          disabled={alreadyInBasket}
          aria-pressed={alreadyInBasket}
        >
          {alreadyInBasket ? '已加入' : '加入'}
        </button>
        <button
          type="button"
          className="concierge-action"
          onClick={() => onSimilar(group)}
        >
          类似
        </button>
      </div>
    </article>
  )
}
