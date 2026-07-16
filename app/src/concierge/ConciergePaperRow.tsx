/**
 * ConciergePaperRow — top-level row of the V1.1 concierge stream.
 *
 * Each row represents a 来源卷/原卷 (one bucket of question groups grouped by
 * paperName + year + region + source signature). Click to expand/collapse;
 * inside, render one ConciergeGroupCard per matching question group, grouped
 * by 部分 header into a 卷面目录 list (home-editorial cut — the old 9-card
 * grid is retired).
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
 *
 * home-editorial additions:
 *   - A dedicated year column (行首独立列) replaces the year prefix that used
 *     to live inside the headline text.
 *   - round 2 (方向 C): for `variant='feed'` the year column retires again —
 *     the desk now groups feed rows under a year group head ("2026 · N 套"),
 *     so repeating the year per-row would be redundant weight. The column
 *     stays for `variant='search'` (flat, ungrouped results list). Gated via
 *     a `data-variant` attribute rather than an extra class on the row's own
 *     className (verify-concierge-desk.mjs pins that template literal to
 *     exactly `concierge-paper-row${expanded ? ' is-expanded' : ''}`).
 *   - The five-groupType strip is retired in favor of a fixed "全卷 · N 篇章"
 *     line (N = paper.hitCount, which already equals paper.groups.length).
 *   - Topic chips move from pill badges to a plain text line under the
 *     headline.
 *   - The explicit "展开题组"/"收起" button is retired; the whole row stays
 *     clickable (unchanged handler) and a hover/focus-reveal text hint
 *     replaces the button at the row's trailing edge.
 *   - Groups inside the expanded detail are bucketed by a best-effort "部分"
 *     header parsed from `group.section` (see `parseSectionGroupLabel`).
 */

import { useEffect, useRef, type MouseEvent, type ReactNode } from 'react'
import { type QuestionGroupCard } from '../domain/questionBank.ts'
import type { PaperHitContext, PaperResult, PaperResultGroup } from './aggregatePaperResults.ts'
import { ConciergeGroupCard } from './ConciergeGroupCard.tsx'
import { parsePaperIdFromHref } from './paperSurfaceHref.ts'
import { scrollBehavior } from '../features/shared/reducedMotionScroll.ts'
import type { SimilarPassagesRequestState } from '../features/similar-passages/SimilarPassagesPanel'

const SOURCE_TYPE_LABEL: Record<string, string> = {
  real_exam: '真题',
  mock_exam: '模拟',
  self_made: '自建',
  other: '其他',
}

function buildSourceTypeLabel(paper: PaperResult): string {
  if (!paper.sourceType) return ''
  return SOURCE_TYPE_LABEL[paper.sourceType] || ''
}

/**
 * home-editorial — the year now renders in its own column, so the headline
 * should not repeat it. `paperName` occasionally carries its own leading
 * year token (e.g. "26.3 广东深圳..."); we strip that best-effort so it
 * doesn't visually double up with the year column. Not a hard guarantee —
 * a paperName that embeds the year in an unrecognized shape will still show
 * it once in the headline (Should Watch, not hard-scrubbed per plan).
 *
 * C5a (trust-cracks) — the year token is sometimes followed by a `.M` month
 * digit ("26.3重庆市…"), which the old separator-only strip left as a bare
 * leading digit ("3重庆市…", read as a stray "3"). We now capture that month
 * digit explicitly and rewrite it as "M月" instead of dropping or leaving it
 * bare — "26.3重庆市…" → "3月重庆市…".
 */
function stripLeadingYearToken(paperName: string, year: number | null): string {
  if (!year) return paperName
  const full = String(year)
  const short = full.slice(2)
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^\\s*(?:${escape(full)}|${escape(short)})(?:\\.(\\d{1,2}))?[.\\-年\\s]*`)
  const match = paperName.match(pattern)
  if (!match) return paperName
  const month = match[1]
  const rest = paperName.slice(match[0].length).trim()
  if (!rest) return paperName
  return month ? `${Number(month)}月${rest}` : rest
}

/**
 * C5b (trust-cracks) — 卷名结巴: dedupe `region` against the (year-stripped)
 * `paperName` before joining them. Real卷名 frequently already embed the
 * region ("全国甲卷" paperName + "全国甲卷" region, or "新课标Ⅰ卷" paperName +
 * "全国新课标Ⅰ" region) — prefixing region again reads as a stutter
 * ("全国甲卷 全国甲卷"). We compare `name` (with a trailing "卷" stripped, so
 * "新课标Ⅰ卷" contributes its "新课标Ⅰ" core) against `region` in both
 * directions: either containing the other counts as overlap, and when it
 * does we show only the paperName. No overlap → keep the existing
 * "region 卷名" shape.
 */
function buildHeadline(paper: PaperResult): string {
  if (paper.isFallback) return '其他来源'
  const name = stripLeadingYearToken(paper.paperName, paper.year).trim()
  const region = (paper.region || '').trim()
  if (!region) return name
  if (!name) return region
  const core = name.endsWith('卷') ? name.slice(0, -1) : name
  const overlaps = core.length > 0 && (name.includes(region) || region.includes(core))
  return overlaps ? name : `${region} ${name}`.trim()
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

/**
 * paper-row-browse-entry — the row-level "看整卷" button only appears when at
 * least one group in this bucket actually has a paper-browse asset to jump
 * to. We take the first group with `hasPaperSurfaceAnalysis` and a
 * `paperSurfaceHref` that parses to a paperId (same eligibility check as
 * ConciergeGroupCard's own per-group link, ConciergeGroupCard.tsx:91) —
 * no eligible group means no button, never a disabled one.
 */
function findRowPaperId(paper: PaperResult): string | null {
  for (const { group } of paper.groups) {
    if (!group.hasPaperSurfaceAnalysis || !group.paperSurfaceHref) continue
    const paperId = parsePaperIdFromHref(group.paperSurfaceHref)
    if (paperId) return paperId
  }
  return null
}

/**
 * home-editorial — best-effort "部分" header parsed from `group.section`
 * (e.g. "第三部分 语言运用/完形填空" → "第三部分 语言运用"). Unparseable
 * sections return null and their groups fall into a header-less bucket
 * rendered inline (never crash, never render an empty catalog).
 */
function parseSectionGroupLabel(section: string | undefined): string | null {
  const raw = (section || '').trim()
  if (!raw) return null
  const partMatch = raw.match(/^(第[一二三四五六七八九十百]+部分[^/]*)/)
  if (partMatch) return partMatch[1].trim()
  const slashIndex = raw.indexOf('/')
  if (slashIndex > 0) return raw.slice(0, slashIndex).trim()
  return null
}

type GroupBucket = {
  label: string | null
  rows: PaperResultGroup[]
}

/**
 * Groups stay in their original (search-hit / feed) order; a new bucket
 * starts only when the parsed section label changes from the previous row,
 * so consecutive header-less rows collapse into one flat, header-less
 * bucket instead of one bucket per row.
 */
function bucketGroupsBySection(groups: PaperResultGroup[]): GroupBucket[] {
  const buckets: GroupBucket[] = []
  for (const item of groups) {
    const label = parseSectionGroupLabel(item.group.section)
    const last = buckets[buckets.length - 1]
    if (last && last.label === label) {
      last.rows.push(item)
    } else {
      buckets.push({ label, rows: [item] })
    }
  }
  return buckets
}

export type ConciergePaperRowProps = {
  paper: PaperResult
  expanded: boolean
  basketIds: Set<string>
  onTogglePaper: (key: string) => void
  onAdd: (group: QuestionGroupCard) => void
  /** classic-retire-2-detail-view — opens the read-only detail view for a group. */
  onOpenDetail?: (group: QuestionGroupCard) => void
  /** paper-row-browse-entry — opens the whole-paper preview page for this row's paperId (no focusGroupId — from the paper's start). */
  onOpenPaperBrowse?: (paperId: string) => void
  /**
   * 'search' rows describe a query outcome（命中）；'feed' rows are plain
   * browsing — nothing was searched, so the badge must not claim a hit.
   */
  variant?: 'search' | 'feed'
  /**
   * C7 (trust-cracks) — 搜索结果年份列去复读: when this row directly follows
   * another row with the same year in a flat search list, the desk passes
   * `hideYear` so the year column renders blank instead of repeating the
   * digits down the column. The row's aria-label always carries the year
   * regardless (see below), so a screen reader loses nothing. Ignored for
   * `variant='feed'` (feed rows already don't render the year column at all —
   * they're grouped under a year head instead).
   */
  hideYear?: boolean

  /** similar-passages-entry (E6): full corpus lookup, single expanded-groupId
   * slot, and its request state — threaded straight through to each row's
   * ConciergeGroupCard so only one card's候选面板 is open at a time across
   * the whole desk (owned by ConciergeDesk, see its own doc comment). */
  questionGroupById: Map<string, QuestionGroupCard>
  expandedSimilarGroupId: string | null
  similarPassagesRequest: SimilarPassagesRequestState | null
  onToggleSimilar: (groupId: string) => void
  onRetrySimilar: () => void
}

export function ConciergePaperRow(props: ConciergePaperRowProps): ReactNode {
  const {
    paper,
    expanded,
    basketIds,
    onTogglePaper,
    onAdd,
    onOpenDetail,
    onOpenPaperBrowse,
    variant = 'search',
    hideYear = false,
    questionGroupById,
    expandedSimilarGroupId,
    similarPassagesRequest,
    onToggleSimilar,
    onRetrySimilar,
  } = props
  const rowPaperId = onOpenPaperBrowse ? findRowPaperId(paper) : null

  const headline = buildHeadline(paper)
  const sourceTypeLabel = buildSourceTypeLabel(paper)
  const topicChips = buildTopicChips(paper)
  const groupBuckets = bucketGroupsBySection(paper.groups)

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
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'nearest' })
    })
  }, [expanded, paper.hitContext.primaryGroupId])

  const hitIds = new Set(paper.hitContext.hitGroupIds)

  return (
    <article
      className={`concierge-paper-row${expanded ? ' is-expanded' : ''}`}
      data-variant={variant}
      // CR should-watch 收口：年份列 aria-hidden 后，行级 label 补回年份，
      // 屏幕阅读器才能区分同名不同年卷。
      aria-label={paper.year ? `${paper.year} 年 ${headline}` : headline}
      onClick={handleRowClick}
    >
      {variant !== 'feed' && (
        <div className="concierge-paper-year" aria-hidden="true">
          {hideYear ? '' : paper.year ?? '—'}
        </div>
      )}

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
          <div className="concierge-paper-title-line">
            <strong className="concierge-paper-headline" title={headline}>{headline}</strong>
            {sourceTypeLabel && (
              <span className="concierge-paper-sourcetype">{sourceTypeLabel}</span>
            )}
          </div>
          {topicChips.length > 0 && (
            <p className="concierge-paper-topics-line" aria-label="题组主题">
              {topicChips.join(' · ')}
            </p>
          )}
        </div>
      </div>

      <div className="concierge-paper-body">
        <p className="concierge-paper-meta">
          {/* feed=库存事实「全卷 · N 篇章」；搜索=命中语义。二者互斥不叠报
              （曾双渲重复报数），且搜索场景 hitCount 是命中数≠篇章总数，
              不得冠「全卷」。 */}
          <span
            className="concierge-paper-hitcount"
            data-ra-hit-scope={paper.hitContext.scope}
          >
            {variant === 'feed'
              ? `全卷 · ${paper.hitCount} 篇章`
              : `${badgePrefix(paper.hitContext.scope)}${paper.hitCount}${badgeSuffix(paper.hitContext.scope)}`}
          </span>
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
        {rowPaperId && (
          <button
            type="button"
            className="concierge-action"
            onClick={() => onOpenPaperBrowse?.(rowPaperId)}
          >
            看整卷
          </button>
        )}
        <span className="concierge-row-expand-hint" aria-hidden="true">
          {expanded ? '收起 ↑' : '展开题组 ↓'}
        </span>
      </div>

      {expanded && (
        <section
          className="concierge-paper-detail"
          id={`concierge-paper-detail-${paper.key}`}
          aria-live="polite"
        >
          <ul className="concierge-group-index" aria-label={variant === 'feed' ? '该卷的题组' : '该卷命中的题组'}>
            {groupBuckets.map((bucket, bucketIndex) => (
              <li key={bucket.label ?? `flat-${bucketIndex}`} className="concierge-group-index-bucket">
                {bucket.label && (
                  <div className="concierge-group-section-head">{bucket.label}</div>
                )}
                <ul className="concierge-group-index-rows">
                  {bucket.rows.map(({ group, reason }) => {
                    const isHit = hitIds.has(group.id)
                    const isPrimaryHit =
                      isHit && group.id === paper.hitContext.primaryGroupId
                    return (
                      <li
                        key={group.id}
                        data-hit={isHit ? 'true' : undefined}
                        data-primary-hit={isPrimaryHit ? 'true' : undefined}
                        ref={isPrimaryHit ? primaryHitRef : null}
                      >
                        <ConciergeGroupCard
                          group={group}
                          reason={reason}
                          onOpenDetail={onOpenDetail}
                          alreadyInBasket={basketIds.has(group.id)}
                          dimmed={!isHit}
                          onAdd={onAdd}
                          questionGroupById={questionGroupById}
                          isSimilarPassagesOpen={expandedSimilarGroupId === group.id}
                          similarPassagesRequest={expandedSimilarGroupId === group.id ? similarPassagesRequest : null}
                          onToggleSimilar={onToggleSimilar}
                          onRetrySimilar={onRetrySimilar}
                        />
                      </li>
                    )
                  })}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  )
}
