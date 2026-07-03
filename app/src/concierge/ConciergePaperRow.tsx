/**
 * ConciergePaperRow — top-level row of the V1.1 concierge stream.
 *
 * Each row represents a 来源卷/原卷 (one bucket of question groups grouped by
 * paperName + year + region + source signature). Click to expand/collapse;
 * inside, render one ConciergeGroupCard per matching question group.
 *
 * No fetch happens on expand — we render what we already have from the search
 * hits.
 *
 * Cut 6 additions:
 *   - Badge wording is driven by `paper.hitContext.scope`, not by reason text.
 *   - Every inner <li> for a hit group carries `data-hit="true"` so the
 *     stylesheet can highlight it with a small accent (left rule + warm tint).
 *   - On expand, if a `primaryGroupId` is known, the row scrolls that
 *     `<li>` into view with a single smooth `scrollIntoView` call. The
 *     scroll runs once per expand (gated by a ref) — never on every render.
 */

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { groupTypeLabel, type QuestionGroupCard } from '../domain/questionBank.ts'
import type { PaperHitContext, PaperResult } from './aggregatePaperResults.ts'
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

/**
 * Distinct topic-label leaves ("生态环境", not the full
 * "人与自然-自然生态-生态环境" path) across every matched group inside this
 * paper row, in first-seen order. Capped small — this is a scan aid on the
 * collapsed row, not a full topic index.
 */
function buildTopicChips(paper: PaperResult, max = 3): string[] {
  const seen = new Set<string>()
  for (const { group } of paper.groups) {
    const first = group.topicLabels?.[0]
    if (!first) continue
    const leaf = (first.subtopic || first.label.split('-').pop() || '').trim()
    if (leaf) seen.add(leaf)
    if (seen.size >= max) break
  }
  return Array.from(seen)
}

/**
 * Cut 6 — badge wording switches by hit scope. The badge text uses
 * `paper.hitCount` as the dynamic count so existing verify regexes
 * (`/命中\s*\{paper\.hitCount\}\s*[组个]\s*[篇组]/`) keep matching.
 *
 * - 'passage' (V1's only emitted scope): "命中 N 个篇章"
 * - 'paper'   : "试卷匹配 · N 个篇章可选"  (reserved for a future intent)
 * - 'mixed'   : "试卷 + N 个篇章命中"      (reserved for a future intent)
 *
 * The renderer always prints `paper.hitCount` (not `hitContext.hitGroupIds.length`)
 * so we have one statement that ties UI text to the source-of-truth count
 * the existing verify already pins.
 */
function badgePrefix(scope: PaperHitContext['scope']): string {
  if (scope === 'paper') return '试卷匹配 · '
  if (scope === 'mixed') return '试卷 + '
  return '命中 '
}
function badgeSuffix(scope: PaperHitContext['scope']): string {
  if (scope === 'paper') return ' 个篇章可选'
  if (scope === 'mixed') return ' 个篇章命中'
  return ' 个篇章'
}

export type ConciergePaperRowProps = {
  paper: PaperResult
  expanded: boolean
  basketIds: Set<string>
  onTogglePaper: (key: string) => void
  onAdd: (group: QuestionGroupCard) => void
  onSimilar: (group: QuestionGroupCard) => void
  /**
   * 'search' rows describe a query outcome（命中）；'feed' rows are plain
   * browsing — nothing was searched, so the badge must not claim a hit.
   */
  variant?: 'search' | 'feed'
}

export function ConciergePaperRow(props: ConciergePaperRowProps): ReactNode {
  const { paper, expanded, basketIds, onTogglePaper, onAdd, onSimilar, variant = 'search' } = props

  const headline = buildHeadline(paper)
  const sourceTypeLabel = buildSourceTypeLabel(paper)
  const groupTypeStrip = paper.groupTypes
    .map((g) => groupTypeLabel[g as keyof typeof groupTypeLabel] || g)
    .join(' · ')
  const topicChips = buildTopicChips(paper)

  const handleRowClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('button, a, input, textarea, select, [role="button"], .concierge-paper-detail')) return
    onTogglePaper(paper.key)
  }

  // Cut 6 — auto-scroll the first hit passage into view on expand.
  //
  // We hold a ref to the actual <li> element of the primary hit group and
  // run a small effect that fires only on the false→true transition of
  // `expanded`. Re-renders while already expanded (e.g. basket toggling)
  // do not re-trigger the scroll. Collapsing clears the gating ref so
  // the next expand fires again.
  const primaryHitRef = useRef<HTMLLIElement | null>(null)
  const lastScrolledForExpandRef = useRef(false)
  useEffect(() => {
    if (!expanded) {
      lastScrolledForExpandRef.current = false
      return
    }
    if (lastScrolledForExpandRef.current) return
    if (!paper.hitContext.primaryGroupId) return
    const el = primaryHitRef.current
    if (!el) return
    lastScrolledForExpandRef.current = true
    // Fire on the next frame so the freshly-rendered <li> has its layout
    // box before we scroll. `block: 'nearest'` keeps a row at the top
    // from over-scrolling the page when it's already in view.
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [expanded, paper.hitContext.primaryGroupId])

  const hitIds = new Set(paper.hitContext.hitGroupIds)

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
          <span
            className="concierge-paper-hitcount"
            data-ra-hit-scope={paper.hitContext.scope}
          >
            {variant === 'feed'
              ? `${paper.hitCount} 个篇章`
              : `${badgePrefix(paper.hitContext.scope)}${paper.hitCount}${badgeSuffix(paper.hitContext.scope)}`}
          </span>
          {groupTypeStrip && (
            <span className="concierge-paper-grouptypes" title={groupTypeStrip}>
              {groupTypeStrip}
            </span>
          )}
          {topicChips.length > 0 && (
            <span className="concierge-paper-topics" aria-label="题组主题">
              {topicChips.map((topic) => (
                <span className="concierge-paper-topic-chip" key={topic}>{topic}</span>
              ))}
            </span>
          )}
        </p>
        {paper.hitContext.displayReason && (
          <p
            className="concierge-paper-reason"
            title={paper.hitContext.displayReason}
          >
            <span className="concierge-group-reason-label">推荐理由：</span>
            <span>{paper.hitContext.displayReason}</span>
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
          <ul className="concierge-group-card-list" aria-label={variant === 'feed' ? '该卷的题组' : '该卷命中的题组'}>
            {paper.groups.map(({ group, reason }) => {
              const isHit = hitIds.has(group.id)
              const isPrimaryHit =
                isHit && group.id === paper.hitContext.primaryGroupId
              return (
                <li
                  key={group.id}
                  className={
                    isHit
                      ? 'concierge-group-card-li is-hit'
                      : 'concierge-group-card-li'
                  }
                  data-hit={isHit ? 'true' : undefined}
                  data-primary-hit={isPrimaryHit ? 'true' : undefined}
                  ref={isPrimaryHit ? primaryHitRef : null}
                >
                  <ConciergeGroupCard
                    group={group}
                    reason={reason}
                    alreadyInBasket={basketIds.has(group.id)}
                    onAdd={onAdd}
                    onSimilar={onSimilar}
                  />
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </article>
  )
}
