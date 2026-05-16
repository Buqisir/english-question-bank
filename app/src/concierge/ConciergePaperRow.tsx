/**
 * ConciergePaperRow — top-level row of the V1.1 concierge stream.
 *
 * Each row represents a 来源卷/原卷 (one bucket of question groups grouped by
 * paperName + year + region + source signature). Click to expand/collapse;
 * inside, render one ConciergeGroupCard per matching question group.
 *
 * No fetch happens on expand — we render what we already have from the search
 * hits.
 */

import { type MouseEvent, type ReactNode } from 'react'
import { groupTypeLabel, type QuestionGroupCard } from '../domain/questionBank.ts'
import type { PaperResult } from './aggregatePaperResults.ts'
import { ConciergeGroupCard } from './ConciergeGroupCard.tsx'

const SOURCE_TYPE_LABEL: Record<string, string> = {
  real_exam: '真题',
  mock_exam: '模拟题',
  self_made: '自建',
  other: '其他',
}

function buildSourceTypeLabel(paper: PaperResult): string {
  if (!paper.sourceType) return ''
  return SOURCE_TYPE_LABEL[paper.sourceType] || ''
}

function buildHeadline(paper: PaperResult): string {
  if (paper.isFallback) return '其他来源'
  const yearText = paper.year ? `${paper.year} 年` : ''
  const region = paper.region ? `· ${paper.region} ` : ''
  return `${yearText}${region}${paper.paperName}`.trim()
}

export type ConciergePaperRowProps = {
  paper: PaperResult
  expanded: boolean
  basketIds: Set<string>
  onTogglePaper: (key: string) => void
  onAdd: (group: QuestionGroupCard) => void
  onSimilar: (group: QuestionGroupCard) => void
}

export function ConciergePaperRow(props: ConciergePaperRowProps): ReactNode {
  const { paper, expanded, basketIds, onTogglePaper, onAdd, onSimilar } = props

  const headline = buildHeadline(paper)
  const sourceTypeLabel = buildSourceTypeLabel(paper)
  const groupTypeStrip = paper.groupTypes
    .map((g) => groupTypeLabel[g as keyof typeof groupTypeLabel] || g)
    .join(' · ')

  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"], .concierge-paper-detail')) return
    onTogglePaper(paper.key)
  }

  return (
    <article
      className={`concierge-paper-row${expanded ? ' is-expanded' : ''}`}
      aria-label={headline}
      onClick={handleRowClick}
    >
      <div className="concierge-paper-anchor">
        <button
          type="button"
          className={`concierge-row-expand${expanded ? ' open' : ''}`}
          onClick={() => onTogglePaper(paper.key)}
          aria-expanded={expanded}
          aria-controls={`concierge-paper-detail-${paper.key}`}
          aria-label={expanded ? '收起来源卷' : '展开来源卷'}
          title={expanded ? '收起来源卷' : '展开来源卷'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <div className="concierge-paper-anchor-text">
          <strong className="concierge-paper-headline" title={headline}>{headline}</strong>
          {sourceTypeLabel && (
            <span className="concierge-paper-sourcetype">{sourceTypeLabel}</span>
          )}
        </div>
      </div>

      <div className="concierge-paper-body">
        <p className="concierge-paper-meta">
          <span className="concierge-paper-hitcount">命中 {paper.hitCount} 组</span>
          {groupTypeStrip && (
            <span className="concierge-paper-grouptypes" title={groupTypeStrip}>
              {groupTypeStrip}
            </span>
          )}
        </p>
        {paper.representativeReason && (
          <p className="concierge-paper-reason" title={paper.representativeReason}>
            <span className="concierge-group-reason-label">推荐理由：</span>
            <span>{paper.representativeReason}</span>
          </p>
        )}
      </div>

      <div className="concierge-paper-actions" aria-label="来源卷操作">
        <button
          type="button"
          className="concierge-action"
          onClick={() => onTogglePaper(paper.key)}
          aria-pressed={expanded}
        >
          {expanded ? '收起' : '展开题组'}
        </button>
      </div>

      {expanded && (
        <section
          className="concierge-paper-detail"
          id={`concierge-paper-detail-${paper.key}`}
          aria-live="polite"
        >
          <ul className="concierge-group-card-list" aria-label="该卷命中的题组">
            {paper.groups.map(({ group, reason }) => (
              <li key={group.id}>
                <ConciergeGroupCard
                  group={group}
                  reason={reason}
                  alreadyInBasket={basketIds.has(group.id)}
                  onAdd={onAdd}
                  onSimilar={onSimilar}
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
