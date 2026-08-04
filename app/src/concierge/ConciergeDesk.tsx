/**
 * ConciergeDesk — V1.1 AI 取题台 (源-卷优先).
 *
 * Stateless wrapper over state owned by useConciergeDesk. Receives the
 * Retrieval Module surface as `retrieval` (view) + `actions` (commands), so
 * App.tsx no longer needs to know about paperResults / expandedPaperKey /
 * etc. (similar-entrypoints E3 retired the old「找类似」text-search-fill
 * hack — 配相似 is now a plain deep-link, same family as 看解析, owned by
 * ConciergeGroupCard itself.)
 *
 * The primary list maps over retrieval.paperResults (one row per source paper),
 * and clicking expands the paper to show its matching question groups.
 *
 * `basketIds` and `onAdd` remain plain props because 加入草稿卷 belongs to
 * the Assembly Basket layer, not Retrieval.
 */

import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react'
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
import { fetchSimilarPassages } from '../services/similarQuestions.ts'
import { usePresence } from '../features/shared/useToastPresence.ts'
import type { SimilarPassagesRequestState } from '../features/similar-passages/SimilarPassagesPanel'
import './ConciergeDesk.css'

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

  /**
   * home-blank — whether `?view=browse` is active (owned by App.tsx, same
   * boot-read-URL-once + popstate pattern as its sibling routes). Feeds the
   * `showListSurface` invariant below; App.tsx is the only writer.
   */
  browseActive?: boolean
  /** home-blank — whisper click: pushes `?view=browse`. */
  onEnterBrowse?: () => void
  /** home-blank — wordmark click (logo=home semantics): clears the browse param. */
  onExitBrowse?: () => void
}

/**
 * home-blank — rotating placeholder examples for the pure-blank static
 * stage only (硬契约: 仅静止态 + 未聚焦 + 非 dataLoading 时轮换). Every entry
 * must start with "比如：" — golden-path's locator regex
 * (smoke-golden-path.mjs `/找一道|正在连接|比如/`) and the clarification-state
 * placeholder both already rely on that substring being present.
 */
const ROTATING_PLACEHOLDERS = [
  '比如：找一道讲生态恢复的阅读 C，主旨概括',
  '比如：2024 新课标Ⅰ 的七选五',
  '比如：讲 AI 的说明文，高难',
] as const

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
  const {
    retrieval,
    actions,
    basketIds,
    onAdd,
    onOpenDetail,
    onOpenPaperBrowse,
    questionGroups,
    dataStatus,
    thinkingMode,
    onThinkingModeChange,
    browseActive,
    onEnterBrowse,
    onExitBrowse,
  } = props
  const { intent, state, paperResults, expandedPaperKey } = retrieval
  const { setIntent, submit, togglePaper } = actions
  const inputId = useId()
  const thinkingToggleId = useId()
  const thinkingHintId = useId()
  const dataLoading = dataStatus === 'loading'
  const [feedExpanded, setFeedExpanded] = useState(false)

  // similar-passages-entry (E6): full corpus lookup for resolving a「相似
  // 篇章」candidate's groupId to a full QuestionGroupCard — same map App.tsx
  // builds for PaperBrowsePage, recomputed here from the `questionGroups`
  // prop this component already receives (defaultFeed's data source).
  const questionGroupById = useMemo(
    () => new Map(questionGroups.map((group) => [group.id, group])),
    [questionGroups],
  )
  // similar-passages-entry (E6): only one search-card's候选面板 open at a
  // time across the whole desk（"切卡自动收起"）— a single expanded-groupId
  // + single request slot (mirrors PaperBrowsePage's similarSeed/similarRequest
  // single-slot pattern) is sufficient since only one panel is ever visible.
  const [expandedSimilarGroupId, setExpandedSimilarGroupId] = useState<string | null>(null)
  const [similarPassagesRequest, setSimilarPassagesRequest] = useState<SimilarPassagesRequestState | null>(null)

  async function loadSimilarPassages(groupId: string): Promise<void> {
    setSimilarPassagesRequest({ status: 'loading' })
    try {
      const data = await fetchSimilarPassages(groupId)
      setSimilarPassagesRequest({ status: 'ready', data })
    } catch (error) {
      setSimilarPassagesRequest({
        status: 'error',
        message: error instanceof Error ? error.message : '加载相似篇章失败，请重试',
      })
    }
  }

  function handleToggleSimilar(groupId: string): void {
    if (expandedSimilarGroupId === groupId) {
      setExpandedSimilarGroupId(null)
      return
    }
    setExpandedSimilarGroupId(groupId)
    void loadSimilarPassages(groupId)
  }
  // home-blank — rotation gating state: the input's own focus, so typing (or
  // just focusing) stops the placeholder from changing under the caret.
  const [inputFocused, setInputFocused] = useState(false)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)

  // Cut ai-mode-filter-chips (C1/C2): structured chip filters — a pure
  // client-side AND layer on top of whatever the search/feed already
  // produced. Lives at this component's local state, same layer as
  // `feedExpanded` (participants agreed a hook migration isn't needed —
  // see plan.md 参考实现).
  //
  // C4 (trust-cracks) — 筛选进 URL: read `f.groupType` / `f.year` /
  // `f.region` / `f.sourceType` / `f.topicGroup` once at mount (same
  // boot-read-URL-once initializer pattern App.tsx already uses for its own
  // routes). An illegal `f.year` (non-finite after Number()) is ignored for
  // that one dimension rather than crashing or defaulting the whole filter
  // set. Re-mounting this component (e.g. after returning from the detail
  // view) re-reads the URL, so filters survive that round-trip too.
  const [filters, setFilters] = useState<ConciergeFilters>(() => {
    if (typeof window === 'undefined') return {}
    const params = new URLSearchParams(window.location.search)
    const next: ConciergeFilters = {}
    const groupType = params.get('f.groupType')
    if (groupType) next.groupType = groupType
    const yearRaw = params.get('f.year')
    if (yearRaw !== null) {
      const year = Number(yearRaw)
      if (Number.isFinite(year)) next.year = year
    }
    const region = params.get('f.region')
    if (region) next.region = region
    const sourceType = params.get('f.sourceType')
    if (sourceType) next.sourceType = sourceType
    const topicGroup = params.get('f.topicGroup')
    if (topicGroup) next.topicGroup = topicGroup
    return next
  })

  // C4 — write filters back to the URL on every change via replaceState (a
  // refinement, not a new navigation — no history entry). Only the `f.*`
  // keys are touched; every other param already in the URL (view, groupId,
  // search intent, …) survives untouched.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (typeof window.history?.replaceState !== 'function') return
    try {
      const url = new URL(window.location.href)
      const FILTER_PARAM_BY_DIM = {
        groupType: 'f.groupType',
        year: 'f.year',
        region: 'f.region',
        sourceType: 'f.sourceType',
        topicGroup: 'f.topicGroup',
      } as const
      for (const [dim, param] of Object.entries(FILTER_PARAM_BY_DIM)) {
        const value = filters[dim as keyof ConciergeFilters]
        if (value === undefined) {
          url.searchParams.delete(param)
        } else {
          url.searchParams.set(param, String(value))
        }
      }
      const nextSearch = url.searchParams.toString()
      const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash || ''}`
      window.history.replaceState(window.history.state, '', nextUrl)
    } catch {
      // URL rewrite is best-effort; filter state itself is unaffected.
    }
  }, [filters])
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
  // home-blank 硬契约 — showListSurface invariant:
  //   showListSurface = browseActive || anyFilterActive || state.kind !== 'empty'
  // !showListSurface ⇔ the pure-blank static stage (no feed, no chips, no
  // results DOM at all — not just visually hidden). A `f.*` deep link sets
  // hasActiveFilters at mount, which alone flips this true without App.tsx
  // needing to also know about filters — "带 f.* ... 深链落浏览态" falls out
  // of this formula for free.
  const browseSurfaceActive = Boolean(browseActive) || hasActiveFilters
  const showListSurface = browseSurfaceActive || state.kind !== 'empty'
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
  // 复评工艺账（2026-07-17 C 路）：面板入场有 keyframe、关闭裸卸载。
  // usePresence 延迟卸载补退场，退（motion-micro）快于入（motion-slow）。
  const filterPanelPresence = usePresence(filterPanelExpanded, 80)
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

  // home-blank 硬契约 — 回落条件: query 空 && state.kind==='empty' && 无激活
  // f.* && 非 browse 态 ⇔ 纯空白. Clicking the centered wordmark is the
  // explicit "logo=home" reset: clear the query, clear filters, and exit
  // browse — the showListSurface formula above then lands on blank on its
  // own, no separate "force blank" flag needed.
  const handleWordmarkClick = () => {
    actions.reset()
    clearFilters()
    onExitBrowse?.()
  }

  const handleEnterBrowse = () => {
    onEnterBrowse?.()
  }

  // home-blank 硬契约 — esc 只清 query（不清筛选/不退浏览态）. Named handlers
  // (not inline arrows) keep the <input> tag itself short — a verify-
  // concierge-desk.mjs regex windows the span between `className=` and
  // `disabled={dataLoading}` on that element.
  const handleInputKeyDown = (event: { key: string }) => {
    if (event.key === 'Escape') actions.reset()
  }
  const handleInputFocus = () => setInputFocused(true)
  const handleInputBlur = () => setInputFocused(false)

  // Default feed — home-blank 硬契约: feed 显示条件从「state.kind === 'empty'」
  // 改为「browseSurfaceActive && state.kind === 'empty'」(浏览态里发起搜索后
  // 结果列表取代 feed，同今天行为); 诚实真空态 (isVacuumResultsState — a
  // search actually ran and found nothing) still shows the feed regardless
  // of browse/filter state, exactly as before this cut.
  const showFeed =
    !dataLoading &&
    ((browseSurfaceActive && state.kind === 'empty') || isVacuumResultsState(state))
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

  // home-blank 硬契约 — placeholder 轮换: only in the pure-blank static stage
  // (!showListSurface), only while the input isn't focused, only outside
  // dataLoading, and stopped entirely under prefers-reduced-motion. List
  // surface (typing/browsing/results) keeps the first rotating string as a
  // static default — rotation would be a distraction once the teacher is
  // already mid-flow.
  useEffect(() => {
    if (showListSurface || dataLoading || inputFocused) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = window.setInterval(() => {
      setPlaceholderIndex((index) => (index + 1) % ROTATING_PLACEHOLDERS.length)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [showListSurface, dataLoading, inputFocused])

  const placeholder = useMemo(() => {
    if (dataLoading) return '正在连接本地题库…'
    if (state.kind === 'clarification') return '换个说法，比如：偏说明文 / 主旨概括'
    if (!showListSurface) return ROTATING_PLACEHOLDERS[placeholderIndex]
    return ROTATING_PLACEHOLDERS[0]
  }, [dataLoading, state, showListSurface, placeholderIndex])

  const submitDisabled = dataLoading || state.kind === 'loading' || intent.trim().length === 0

  return (
    <section className="concierge-desk" aria-label="题库取题流" data-surface={showListSurface ? 'list' : 'blank'}>
      {/* home-blank — the stage wrapper holds wordmark + searchbox + whisper.
          `concierge-stage-inner` stays centered/narrow in the pure-blank
          static state and widens back to the full command-bar row (the
          pre-cut layout) once showListSurface flips true — the "提交那一拍
          stage 上移" beat is the margin-top transition below, token-driven
          per DESIGN.md (--motion-entrance + --ease-out). */}
      <div className="concierge-stage">
        <div className={`concierge-stage-inner${showListSurface ? ' concierge-stage-inner--risen' : ''}`}>
          {/* 词标: centered in the stage (topbar's brand block hides for the
              home list view — see AppTopbar's hideBrand prop). Click = 清空
              回纯空白 (logo=home semantics): reset() + clearFilters() +
              exitBrowse, letting the showListSurface formula land on blank
              on its own. */}
          <button type="button" className="concierge-wordmark" onClick={handleWordmarkClick}>
            英语题库<span>工作台</span>
          </button>

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
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onKeyDown={handleInputKeyDown}
                placeholder={placeholder}
                autoComplete="off"
                autoFocus={!showListSurface}
                disabled={dataLoading}
                aria-busy={dataLoading || undefined}
              />
              {intent.length > 0 && !dataLoading && (
                <button
                  type="button"
                  className="concierge-intent-clear"
                  onClick={() => actions.reset()}
                  aria-label="清除搜索"
                  title="清除搜索"
                >
                  ×
                </button>
              )}
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

            {/* home-blank CR SW-1: the pure-blank static stage is wordmark +
                searchbox + whisper only (owner-ratified prototype D baseline)
                — the thinking toggle rides the command bar on the list
                surface, same gate as the filter toggle / count below. */}
            {showListSurface && (
              <div className="concierge-thinking-toggle" title="用 AI 理解你的描述，更准但稍慢">
                <input
                  type="checkbox"
                  id={thinkingToggleId}
                  checked={thinkingMode ?? false}
                  onChange={(event) => onThinkingModeChange?.(event.target.checked)}
                  aria-label="思考模式：理解复杂描述"
                  aria-describedby={thinkingHintId}
                />
                <label htmlFor={thinkingToggleId}>理解复杂描述</label>
                <span id={thinkingHintId} className="visually-hidden">用 AI 理解你的描述，更准但稍慢</span>
              </div>
            )}

            {/* ui-p1-panels #7: this button used to unmount entirely while a
                search was in flight (state.kind === 'loading'), yanking the
                command bar's width around (audit 62 "筛选按钮被条件卸载
                ConciergeDesk.tsx:354"). It now stays mounted through the same
                states plus 'loading', going `disabled` instead. home-blank —
                additionally gated on showListSurface: 筛选 chips 只活在列表面,
                静止态零 chips (硬契约 4). */}
            {showListSurface &&
              !dataLoading &&
              (state.kind === 'empty' || state.kind === 'results' || state.kind === 'loading') && (
                <button
                  type="button"
                  className="concierge-command-filter-toggle"
                  aria-expanded={filterPanelExpanded}
                  aria-controls={filterPanelId}
                  disabled={state.kind === 'loading'}
                  onClick={() => setFilterPanelExpanded((value) => !value)}
                >
                  筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
                </button>
              )}

            {showListSurface && !dataLoading && (
              <span className="concierge-command-count">
                {catalogPaperCount} 套卷 · {catalogGroupCount} 篇章
              </span>
            )}
          </div>

          {/* home-blank — whisper: only in the pure-blank static stage. A
              real, clickable count (硬契约: 计数真值 — catalogPaperCount /
              catalogGroupCount, no digits while dataLoading to avoid a 0
              flash) that pushes `?view=browse` on click. */}
          {!showListSurface && (
            <p className="concierge-whisper">
              {dataLoading ? (
                '正在连接本地题库，稍候即可搜索。'
              ) : (
                <>
                  <button type="button" className="concierge-whisper-browse" onClick={handleEnterBrowse}>
                    {catalogPaperCount} 套卷 · {catalogGroupCount} 篇章
                  </button>
                  ，一句话描述你要的题
                </>
              )}
            </p>
          )}
        </div>

        {showListSurface && (
          <div className="concierge-list-surface">
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
      {!dataLoading && (state.kind === 'empty' || state.kind === 'results') && filterPanelPresence.mounted && (
        <div
          className="concierge-filter-row"
          id={filterPanelId}
          aria-label="结构化筛选"
          data-visible={filterPanelPresence.visible}
        >
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

      {/* C2 (trust-cracks) — 前端空态一个声音: a steward-source (non-fallback)
          result with zero hits is the honest empty state (concierge_search
          returned honest empty matches, C1). Don't also narrate an
          assistantMessage paragraph here — the true vacuum is carried by the
          `concierge-empty` block below ("没找到匹配…返回浏览全部 N 套卷") +
          the default feed, a single voice instead of two. Local fallback
          paths (state.usedFallback) are untouched — this only gates the
          steward-source paragraph. */}
      {state.kind === 'results' && !state.usedFallback && state.hits.length > 0 && state.assistantMessage && (
        <p className="concierge-assistant">{state.assistantMessage}</p>
      )}

      {state.kind === 'error' && (
        <div className="concierge-error" role="alert">
          <span>取题台暂时没连上，原来的描述已经保留。</span>
          <button type="button" onClick={() => void actions.submit(state.query)}>
            重新取题
          </button>
        </div>
      )}

      <div className="concierge-results" aria-live="polite">
        {state.kind === 'loading' && (
          <>
            <p className="concierge-loading">正在为「{state.query}」找题…</p>
            {/* ui-p1-panels #7 — 找题主面状态三缺: an AI search in flight
                used to blank straight to this one line with nothing else
                on screen (audit 62 "取题中整屏白屏"). Reuse the same
                skeleton placeholder the dataLoading (SQLite connect) path
                already shows, instead of introducing a second loading
                idiom — verify-home-default-feed.mjs locks the feed block
                itself to `showFeed` only, so this is a sibling skeleton,
                not a faded copy of the feed. */}
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

        {state.kind === 'results' && paperResults.length === 0 && (
          <p className="concierge-empty">
            没找到匹配。可以换个说法，或
            <button type="button" className="concierge-filter-clear-inline" onClick={() => actions.reset()}>
              返回浏览全部 {catalogPaperCount} 套卷
            </button>
          </p>
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
            {filteredPaperResults.map((paper, index) => {
              // C7 (trust-cracks) — search-result year column: only the first
              // of a run of consecutive same-year rows shows the year digits;
              // a null year never counts as a repeat (each "—" stays its own).
              const previous = filteredPaperResults[index - 1]
              const hideYear =
                index > 0 && paper.year !== null && previous !== undefined && paper.year === previous.year
              return (
                <li key={paper.key}>
                  <ConciergePaperRow
                    paper={paper}
                    expanded={expandedPaperKey === paper.key}
                    basketIds={basketIds}
                    onTogglePaper={togglePaper}
                    onAdd={onAdd}
                    onOpenDetail={onOpenDetail}
                    onOpenPaperBrowse={onOpenPaperBrowse}
                    hideYear={hideYear}
                    questionGroupById={questionGroupById}
                    expandedSimilarGroupId={expandedSimilarGroupId}
                    similarPassagesRequest={similarPassagesRequest}
                    onToggleSimilar={handleToggleSimilar}
                    onRetrySimilar={() => expandedSimilarGroupId && void loadSimilarPassages(expandedSimilarGroupId)}
                  />
                </li>
              )
            })}
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
                            onOpenDetail={onOpenDetail}
                            questionGroupById={questionGroupById}
                            expandedSimilarGroupId={expandedSimilarGroupId}
                            similarPassagesRequest={similarPassagesRequest}
                            onToggleSimilar={handleToggleSimilar}
                            onRetrySimilar={() => expandedSimilarGroupId && void loadSimilarPassages(expandedSimilarGroupId)}
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
          </div>
        )}
      </div>
    </section>
  )
}
