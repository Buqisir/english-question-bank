/**
 * ConciergeDesk — V1.1 AI 取题台 (源-卷优先).
 *
 * Stateless wrapper over state owned by useConciergeDesk. Receives the
 * Retrieval Module surface as `retrieval` (view) + `actions` (commands), so
 * App.tsx no longer needs to know about paperResults / expandedPaperKey /
 * triggerSimilar / etc.
 *
 * The primary list maps over retrieval.paperResults (one row per source paper),
 * and clicking expands the paper to show its matching question groups.
 *
 * `basketIds` and `onAdd` remain plain props because 加入草稿卷 belongs to
 * the Assembly Basket layer, not Retrieval.
 */

import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import type { QuestionGroupCard } from '../domain/questionBank.ts'
import { aggregatePaperResults, type PaperResult } from './aggregatePaperResults.ts'
import { ConciergePaperRow } from './ConciergePaperRow.tsx'
import { pickClarificationLine, pickResultsNoticeLine } from './clarificationCopy.ts'
import { buildDefaultFeed } from './defaultFeed.ts'
import {
  applyConciergeFilters,
  buildFacetedFilterOptions,
  type ConciergeFilters,
} from './filters.ts'
import type {
  ConciergeRetrievalActions,
  ConciergeRetrievalView,
} from './useConciergeDesk.ts'

export type ConciergeDeskProps = {
  retrieval: ConciergeRetrievalView
  actions: ConciergeRetrievalActions
  basketIds: Set<string>
  onAdd: (group: QuestionGroupCard) => void
  /** classic-retire-2-detail-view — opens the read-only detail view for a group. */
  onOpenDetail?: (group: QuestionGroupCard) => void
  /** paper-row-browse-entry — opens the whole-paper preview page (paper-browse) for a paperId, from the row's own "看整卷" button. */
  onOpenPaperBrowse?: (paperId: string) => void

  /**
   * Full corpus (all question groups currently loaded), used to build the
   * default browse feed shown before the teacher searches (cut ⑥). Not used
   * for anything else here — search itself still flows entirely through
   * `retrieval` / `actions`.
   */
  questionGroups: QuestionGroupCard[]

  /**
   * App-level data connection status. While 'loading', the local question bank
   * is still being fetched and the in-memory list is the bundled sample fixture.
   * Searching against sample groups can return ids that don't exist in the live
   * SQLite. We disable submit + show a calm notice until real data is in.
   */
  dataStatus?: 'loading' | 'sqlite' | 'sample'

  /** Whether thinking mode is currently enabled for AI search. */
  thinkingMode?: boolean
  /** Called when the user toggles thinking mode. */
  onThinkingModeChange?: (value: boolean) => void
}

/** Default feed shows this many papers before the "显示全部" expander. */
const DEFAULT_FEED_PAGE_SIZE = 8

/** UI 门面刀 F2 — muted dimension labels in front of each chip row. */
const FILTER_DIM_LABEL: Record<'groupType' | 'year' | 'region' | 'sourceType' | 'topicGroup', string> = {
  groupType: '题型',
  year: '年份',
  region: '地区',
  sourceType: '来源',
  topicGroup: '主题',
}

/**
 * Chip-wall progressive disclosure — 题型/年份/主题 (I16d PO 拍板: 主题默认露)
 * stay visible; 地区 (the 12-option wall) and 来源 collapse behind "更多筛选" so
 * the filter row reads as a quiet refinement, not a form wall (PRODUCT.md:
 * content is the star, don't 堆筛选控件). An active region/source filter pins
 * the full set open so a selection is never hidden.
 */
const DEFAULT_FILTER_DIMS = ['groupType', 'year', 'topicGroup'] as const
const ALL_FILTER_DIMS = ['groupType', 'year', 'topicGroup', 'region', 'sourceType'] as const

/**
 * Restart cut ⑤ — a non-empty result set is "all weak" when every hit only
 * cleared the noise floor, not the confidence floor (see `conciergeSearch.ts`
 * `isConfidentCandidate` / `WEAK_NOISE_FLOOR`). Feeds `pickResultsNoticeLine`
 * so the notice can say so plainly instead of implying a confident match.
 */
function isAllWeakResultsState(
  state: ConciergeRetrievalView['state'],
): state is Extract<ConciergeRetrievalView['state'], { kind: 'results' }> {
  return state.kind === 'results' && state.hits.length > 0 && state.hits.every((hit) => hit.weak === true)
}

/**
 * CR-5 SW-1 fix — the true vacuum state is `state.kind === 'results'` with
 * zero hits (a search actually ran and found nothing honest to show), not
 * `state.kind === 'empty'` (no search has run yet). The plan's cut ⑤
 * acceptance line "真空态+起始 chip 呈现" and "乱码 query 必须走到真空态"
 * both name this exact state — a teacher who typed a gibberish query and hit
 * the true "没找到匹配" message must still see the starter chips as the next
 * action, not a dead end.
 */
function isVacuumResultsState(state: ConciergeRetrievalView['state']): boolean {
  return state.kind === 'results' && state.hits.length === 0
}

/**
 * home-editorial round 2 (方向 C) — 年份分组（feed 态 only）.
 *
 * `buildDefaultFeed` already returns papers sorted year DESC with null-year
 * papers sorted last (see defaultFeed.ts). Grouping here is therefore just
 * "start a new bucket whenever the year changes from the previous row" —
 * no re-sorting, no re-bucketing of papers within a year. A null year
 * becomes the tail "其他" bucket, which falls out naturally from the sort.
 */
type FeedYearGroup = {
  year: number | null
  label: string
  papers: PaperResult[]
}

function groupFeedByYear(papers: PaperResult[]): FeedYearGroup[] {
  const groups: FeedYearGroup[] = []
  for (const paper of papers) {
    const year = typeof paper.year === 'number' ? paper.year : null
    const last = groups[groups.length - 1]
    if (last && last.year === year) {
      last.papers.push(paper)
    } else {
      groups.push({ year, label: year !== null ? String(year) : '其他', papers: [paper] })
    }
  }
  return groups
}

export function ConciergeDesk(props: ConciergeDeskProps): ReactNode {
  const { retrieval, actions, basketIds, onAdd, onOpenDetail, onOpenPaperBrowse, questionGroups, dataStatus, thinkingMode, onThinkingModeChange } = props
  const { intent, state, paperResults, expandedPaperKey } = retrieval
  const { setIntent, submit, triggerSimilar, togglePaper } = actions
  const inputId = useId()
  const thinkingToggleId = useId()
  const thinkingHintId = useId()
  const dataLoading = dataStatus === 'loading'
  const [feedExpanded, setFeedExpanded] = useState(false)

  // Cut ai-mode-filter-chips (C1/C2): structured chip filters — a pure
  // client-side AND layer on top of whatever the search/feed already
  // produced. Lives at this component's local state, same layer as
  // `feedExpanded` (participants agreed a hook migration isn't needed —
  // see plan.md 参考实现).
  const [filters, setFilters] = useState<ConciergeFilters>({})
  const filterOptions = useMemo(
    () => buildFacetedFilterOptions(questionGroups, filters),
    [questionGroups, filters],
  )
  const hasActiveFilters =
    filters.groupType !== undefined ||
    filters.year !== undefined ||
    filters.region !== undefined ||
    filters.sourceType !== undefined ||
    filters.topicGroup !== undefined
  // Progressive disclosure: collapse 地区/来源 by default. A hidden-dim filter
  // being active pins the full set open (never hide a live selection); the
  // toggle is suppressed in that case since 清除筛选 is the way back.
  const [filtersExpanded, setFiltersExpanded] = useState(false)
  const hasHiddenActiveFilter =
    filters.region !== undefined || filters.sourceType !== undefined
  const showAllFilterDims = filtersExpanded || hasHiddenActiveFilter
  const visibleFilterDims = showAllFilterDims ? ALL_FILTER_DIMS : DEFAULT_FILTER_DIMS
  const canToggleFilters = !hasHiddenActiveFilter
  const clearFilters = () => setFilters({})
  function toggleFilter<K extends keyof ConciergeFilters>(key: K, value: ConciergeFilters[K]) {
    setFilters((prev) => {
      const next = { ...prev }
      if (prev[key] === value) {
        delete next[key]
      } else {
        next[key] = value
      }
      return next
    })
  }
  function removeFilter(key: keyof ConciergeFilters) {
    setFilters((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // home-editorial round 2 (方向 C) — 好默认: the whole structured filter
  // panel starts collapsed. This is a separate toggle from `filtersExpanded`
  // above (which only governs the nested 地区/来源 progressive disclosure
  // once the panel itself is open).
  const [filterPanelExpanded, setFilterPanelExpanded] = useState(false)
  const filterPanelId = useId()
  const activeFilterCount = [
    filters.groupType,
    filters.year,
    filters.region,
    filters.sourceType,
    filters.topicGroup,
  ].filter((value) => value !== undefined).length
  // Collapsed-state active chip summary — reuses the same faceted option
  // labels the open filter panel already computes, just picked out for the
  // currently-active dimensions.
  const activeFilterEntries = useMemo(() => {
    const dims = ['groupType', 'year', 'region', 'sourceType', 'topicGroup'] as const
    return dims
      .filter((dim) => filters[dim] !== undefined)
      .map((dim) => {
        const option = filterOptions[dim].find((candidate) => candidate.value === String(filters[dim]))
        return { key: dim, text: option?.label ?? String(filters[dim]) }
      })
  }, [filters, filterOptions])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (dataLoading) return
    void submit()
  }

  // Default feed — the browse-the-bank content shown when there is no
  // active search. Only computed when it can actually be shown (empty state
  // or the honest-vacuum "results but zero hits" state); loading / results /
  // clarification / error never render it.
  const showFeed =
    !dataLoading && (state.kind === 'empty' || isVacuumResultsState(state))
  // C2: filters narrow the corpus BEFORE it goes into buildDefaultFeed, so
  // paper-bucketing/sorting rules stay exactly as buildDefaultFeed already
  // defines them — this cut only narrows the input set.
  const filteredQuestionGroups = useMemo(
    () => applyConciergeFilters(questionGroups, filters),
    [questionGroups, filters],
  )
  const defaultFeed = useMemo(
    () => (showFeed ? buildDefaultFeed(filteredQuestionGroups) : []),
    [showFeed, filteredQuestionGroups],
  )
  const feedPaperCount = defaultFeed.length
  const feedGroupCount = useMemo(
    () => defaultFeed.reduce((sum, paper) => sum + paper.groups.length, 0),
    [defaultFeed],
  )
  // home-editorial round 2 — feed rows group by year (组头「2026」+「N 套」);
  // defaultFeed is already year-DESC + null-last sorted (buildDefaultFeed),
  // so grouping only needs to bucket consecutive same-year runs.
  //
  // CR round-2 M1: group over the FULL feed and paginate by WHOLE year
  // groups — never slice papers mid-year. Slicing first made the collapsed
  // view show "2024 · 2 套" while the library holds 4 (组头计数失真，违反
  // 「N 套」真实计数章程). Collapsed view takes whole year groups until the
  // cumulative paper count reaches DEFAULT_FEED_PAGE_SIZE, so every header
  // it shows carries that year's true total.
  const feedByYear = useMemo(() => groupFeedByYear(defaultFeed), [defaultFeed])
  const visibleFeedByYear = useMemo(() => {
    if (feedExpanded) return feedByYear
    const visible: FeedYearGroup[] = []
    let shown = 0
    for (const yearGroup of feedByYear) {
      if (shown >= DEFAULT_FEED_PAGE_SIZE) break
      visible.push(yearGroup)
      shown += yearGroup.papers.length
    }
    return visible
  }, [feedByYear, feedExpanded])
  const visiblePaperCount = useMemo(
    () => visibleFeedByYear.reduce((sum, yearGroup) => sum + yearGroup.papers.length, 0),
    [visibleFeedByYear],
  )

  // Command-line inventory count — always the FULL, unfiltered corpus (not
  // narrowed by search/chip filters), so "34 套卷 · 278 篇章" reads as a
  // constant fact about the library, not a moving search-result count.
  const catalogFeed = useMemo(() => buildDefaultFeed(questionGroups), [questionGroups])
  const catalogPaperCount = catalogFeed.length
  const catalogGroupCount = useMemo(
    () => catalogFeed.reduce((sum, paper) => sum + paper.groups.length, 0),
    [catalogFeed],
  )

  // C2: search-result rows narrow the same way, but by construction from
  // `state.hits` rather than by editing the already-aggregated
  // `paperResults` — filter each hit's `group` down with
  // applyConciergeFilters, drop hits that no longer pass, then re-run the
  // exact same `aggregatePaperResults` bucketing the search path already
  // uses. `state.hits` itself is never mutated (this is a derived useMemo),
  // so clearing filters restores the full result set without re-running
  // the search.
  const filteredPaperResults = useMemo(() => {
    if (!hasActiveFilters) return paperResults
    if (state.kind !== 'results') return paperResults
    const filteredHits = state.hits.filter(
      (hit) => applyConciergeFilters([hit.group], filters).length > 0,
    )
    return aggregatePaperResults(filteredHits)
  }, [paperResults, filters, hasActiveFilters, state])

  const placeholder = useMemo(() => {
    if (dataLoading) return '正在连接本地题库…'
    if (state.kind === 'clarification') return '换个说法，比如：偏说明文 / 主旨概括'
    return '比如：找一道讲生态恢复的阅读 C，主旨概括'
  }, [dataLoading, state])

  const submitDisabled = dataLoading || state.kind === 'loading' || intent.trim().length === 0

  return (
    <section className="concierge-desk" aria-label="题库取题流">
      {/* home-editorial round 2 (方向 C) — 命令行一行: search input flexes,
          thinking toggle + filter toggle + inventory count ride along
          inline. No landing hero, no centered hero search box. */}
      <div className="concierge-command-bar">
        <form className="concierge-intent-bar" onSubmit={handleSubmit}>
          <label htmlFor={inputId} className="visually-hidden">
            自然语言搜索
          </label>
          <input
            id={inputId}
            className="concierge-intent-input"
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder={placeholder}
            autoComplete="off"
            disabled={dataLoading}
            aria-busy={dataLoading || undefined}
          />
          <button
            type="submit"
            className={`concierge-intent-submit${state.kind === 'loading' ? ' is-loading' : ''}`}
            disabled={submitDisabled}
            aria-label="开始取题"
            title="开始取题"
          >
            {state.kind === 'loading' || dataLoading ? '取题中…' : '→'}
          </button>
        </form>

        <div className="concierge-thinking-toggle" title="用 AI 理解你的描述，更准但稍慢">
          <input
            type="checkbox"
            id={thinkingToggleId}
            checked={thinkingMode ?? false}
            onChange={(event) => onThinkingModeChange?.(event.target.checked)}
            aria-describedby={thinkingHintId}
          />
          <label htmlFor={thinkingToggleId}>思考模式</label>
          <span id={thinkingHintId} className="visually-hidden">用 AI 理解你的描述，更准但稍慢</span>
        </div>

        {!dataLoading && (state.kind === 'empty' || state.kind === 'results') && (
          <button
            type="button"
            className="concierge-command-filter-toggle"
            aria-expanded={filterPanelExpanded}
            aria-controls={filterPanelId}
            onClick={() => setFilterPanelExpanded((value) => !value)}
          >
            筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
          </button>
        )}

        {!dataLoading && (
          <span className="concierge-command-count">
            {catalogPaperCount} 套卷 · {catalogGroupCount} 篇章
          </span>
        )}
      </div>

      {/* 好默认: 筛选默认收起。收起态下若有激活筛选，命令行下方露出可移除的
          激活 chip 摘要，替代整块筛选面板。 */}
      {!dataLoading &&
        (state.kind === 'empty' || state.kind === 'results') &&
        !filterPanelExpanded &&
        hasActiveFilters && (
          <ul className="concierge-active-filter-chips" aria-label="已激活筛选">
            {activeFilterEntries.map((entry) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className="concierge-active-filter-chip"
                  onClick={() => removeFilter(entry.key)}
                >
                  {FILTER_DIM_LABEL[entry.key]}：{entry.text}
                  <span aria-hidden="true"> ×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

      {dataLoading && (
        <>
          <p className="concierge-data-loading" role="status">
            正在连接本地题库，稍候即可搜索。
          </p>
          {/* ui-search-feel 刀⑤ #1 — dataLoading skeleton. The status line
              above carries the a11y state; these blocks are pure visual
              placeholders (aria-hidden) so the first paint isn't a blank
              page while the local SQLite connects. */}
          <ul className="concierge-skeleton-chip-row" aria-hidden="true">
            {Array.from({ length: 6 }).map((_, index) => (
              <li key={index} className="concierge-skeleton-chip" />
            ))}
          </ul>
          <div className="concierge-skeleton-feed" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="concierge-skeleton-feed-group">
                <div className="concierge-skeleton-line concierge-skeleton-feed-title" />
                <div className="concierge-skeleton-line concierge-skeleton-feed-row" />
                <div className="concierge-skeleton-line concierge-skeleton-feed-row short" />
              </div>
            ))}
          </div>
        </>
      )}

      {/* Cut ai-mode-filter-chips (C5): structured filter row replaces the
          retired STARTER_CHIPS. Shown for 'empty', 'results', and the true
          vacuum ('results' + zero hits); NOT during 'loading' or
          'clarification' (existing region left untouched per plan C5).
          home-editorial round 2 — 好默认: additionally gated on the
          command-line "筛选" toggle (`filterPanelExpanded`), default
          collapsed. */}
      {!dataLoading && (state.kind === 'empty' || state.kind === 'results') && filterPanelExpanded && (
        <div className="concierge-filter-row" id={filterPanelId} aria-label="结构化筛选">
          {visibleFilterDims.map((dimension) => (
            <div key={dimension} className="concierge-filter-dim-row">
              <span className="concierge-filter-dim-label">{FILTER_DIM_LABEL[dimension]}</span>
              <ul className="concierge-starter-chips" aria-label={dimension}>
                {filterOptions[dimension].map((option) => {
                  const selected = String(filters[dimension] ?? '') === option.value
                  const isZero = option.count === 0
                  return (
                    <li key={option.value}>
                      <button
                        type="button"
                        className={`concierge-starter-chip${selected ? ' is-selected' : ''}${isZero ? ' is-zero' : ''}`}
                        aria-pressed={selected}
                        onClick={() =>
                          toggleFilter(
                            dimension,
                            (dimension === 'year' ? Number(option.value) : option.value) as never,
                          )
                        }
                      >
                        {option.label} {option.count}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {(canToggleFilters || hasActiveFilters) && (
            <div className="concierge-filter-actions">
              {canToggleFilters && (
                <button
                  type="button"
                  className="concierge-filter-more"
                  aria-expanded={showAllFilterDims}
                  onClick={() => setFiltersExpanded((value) => !value)}
                >
                  {filtersExpanded ? '收起筛选' : '更多筛选'}
                </button>
              )}
              {hasActiveFilters && (
                <button type="button" className="concierge-filter-clear" onClick={clearFilters}>
                  清除筛选
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {state.kind === 'clarification' && (
        <div className="concierge-clarification" role="status">
          <p className="concierge-clarification-line">
            {pickClarificationLine(state.pendingQuery, state.question)}
          </p>
          <p className="concierge-clarification-examples">
            比如：科技话题 / 说明文 / 主旨概括 / 抽象推断。
          </p>
        </div>
      )}

      {state.kind === 'results' && state.usedFallback && (
        <p className="concierge-notice">
          {pickResultsNoticeLine(isAllWeakResultsState(state), state.assistantMessage, state.fallbackReason)}
        </p>
      )}

      {state.kind === 'results' && !state.usedFallback && state.assistantMessage && (
        <p className="concierge-assistant">{state.assistantMessage}</p>
      )}

      {state.kind === 'error' && (
        <p className="concierge-error">取题台暂时出错了，可以稍后再试。</p>
      )}

      <div className="concierge-results" aria-live="polite">
        {state.kind === 'loading' && (
          <p className="concierge-loading">正在为「{state.query}」找题…</p>
        )}

        {state.kind === 'results' && paperResults.length === 0 && (
          <p className="concierge-empty">没找到匹配。可以换个说法，或在经典模式里精筛。</p>
        )}

        {/* C4: honest empty handling — when the search itself found hits but
            the active chip filters narrowed them to zero, say so plainly
            (筛选筛空的, not "没搜到") and offer a one-click reset, instead of
            silently rendering a blank list. */}
        {state.kind === 'results' &&
          paperResults.length > 0 &&
          filteredPaperResults.length === 0 && (
            <p className="concierge-empty">
              筛选条件太严格，没有匹配的结果。
              <button type="button" className="concierge-filter-clear-inline" onClick={clearFilters}>
                清除筛选
              </button>
            </p>
          )}

        {state.kind === 'results' && filteredPaperResults.length > 0 && (
          <ul className="concierge-paper-list">
            {filteredPaperResults.map((paper) => (
              <li key={paper.key}>
                <ConciergePaperRow
                  paper={paper}
                  expanded={expandedPaperKey === paper.key}
                  basketIds={basketIds}
                  onTogglePaper={togglePaper}
                  onAdd={onAdd}
                  onSimilar={(group) => {
                    void triggerSimilar(group)
                  }}
                  onOpenDetail={onOpenDetail}
                  onOpenPaperBrowse={onOpenPaperBrowse}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {showFeed && (
        <div className="concierge-default-feed" aria-label="题库浏览">
          {questionGroups.length === 0 ? (
            <p className="concierge-feed-empty-corpus">
              题库还没有题目。先导入一套卷，题库会在这里展开浏览。
            </p>
          ) : hasActiveFilters && feedPaperCount === 0 ? (
            // C4: filters narrowed the browse feed to nothing — say so
            // plainly (this is the chips, not an empty corpus) with a
            // one-click reset, instead of silently showing a blank feed.
            <p className="concierge-empty">
              筛选条件太严格，题库里没有匹配的卷。
              <button type="button" className="concierge-filter-clear-inline" onClick={clearFilters}>
                清除筛选
              </button>
            </p>
          ) : (
            <>
              <p className="concierge-feed-intro">
                题库里现有 {feedPaperCount} 套卷 · {feedGroupCount} 个篇章。可以直接翻，或用一句话描述你要的题。
                {hasActiveFilters && <span className="concierge-feed-filtered-tag">（已筛选）</span>}
              </p>
              {/* home-editorial round 2 — 年份分组档案: consecutive same-year
                  runs from the already year-DESC-sorted visibleFeed become
                  one group with a "2026 · N 套" head. Null-year papers land
                  in the trailing "其他" group (defaultFeed.ts sorts them
                  last already). */}
              <div className="concierge-feed-groups">
                {visibleFeedByYear.map((yearGroup) => (
                  <div key={yearGroup.label} className="concierge-feed-year-group">
                    <div className="concierge-feed-year-head">
                      <span className="concierge-feed-year-label">{yearGroup.label}</span>
                      <span className="concierge-feed-year-count">{yearGroup.papers.length} 套</span>
                    </div>
                    <ul className="concierge-paper-list">
                      {yearGroup.papers.map((paper) => (
                        <li key={paper.key}>
                          <ConciergePaperRow
                            paper={paper}
                            variant="feed"
                            expanded={expandedPaperKey === paper.key}
                            basketIds={basketIds}
                            onTogglePaper={togglePaper}
                            onAdd={onAdd}
                            onSimilar={(group) => {
                              void triggerSimilar(group)
                            }}
                            onOpenDetail={onOpenDetail}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              {!feedExpanded && feedPaperCount > visiblePaperCount && (
                <button
                  type="button"
                  className="concierge-feed-expand"
                  onClick={() => setFeedExpanded(true)}
                >
                  显示全部 {feedPaperCount} 套卷
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
