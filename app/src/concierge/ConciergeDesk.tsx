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
 * `basketIds` remains a plain prop because 加入草稿卷 belongs to the Assembly
 * Basket layer, not Retrieval. The add/undo actions themselves come from
 * DraftAddContext (App provides it; shared-ui/DraftAddButton consumes it).
 */

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { QuestionBank, RotateCcw } from '../icons'
import type { QuestionGroupCard } from '../domain/questionBank.ts'
import { aggregatePaperResults, type PaperResult } from './aggregatePaperResults.ts'
import { ConciergePaperRow } from './ConciergePaperRow.tsx'
import { pickClarificationLine, pickResultsNoticeLine } from './clarificationCopy.ts'
import { buildDefaultFeed, buildRecentFeed } from './defaultFeed.ts'
import { HomeContinueSection, HomeDailyPassage } from './ConciergeHomeSections.tsx'
import { FluidHoverList } from '../components/FluidHoverList.tsx'
import { Button } from '../shared-ui/Button.tsx'
import { ChipToggle } from '../shared-ui/Chip.tsx'
import { Notice } from '../shared-ui/Notice.tsx'
import { EmptyState } from '../shared-ui/EmptyState.tsx'
import { SearchField } from '../shared-ui/SearchField.tsx'

/** Fluid hover: an expanded paper row's open body still belongs to its head,
 *  so the highlight stays on that head instead of jumping to the next paper. */
const paperRowHitArea = (head: HTMLElement): HTMLElement => head.closest<HTMLElement>('.concierge-paper-row') ?? head
import type { RecentlyOpenedEntry } from './recentlyOpened.ts'
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
   * is still being fetched; 'error' means it never loaded (走查第四节第 7 条，Owner 2026-11-14：
   * 不再悄悄换成仓库里的样例题，直说「题库没连上」并给「重试」）。两种情况下手里都没有真题，
   * 搜索、浏览都先关着。
   */
  dataStatus?: 'loading' | 'sqlite' | 'error'
  /** dataStatus 为 'error' 时服务器（或浏览器）的原话，照登在「题库没连上」后面。 */
  dataError?: string | null
  /** 「题库没连上」那一行的「重试」。 */
  onRetryData?: () => void

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

  /**
   * 首页是归来 — the teacher's own trail for the home「接着做」section.
   * `recentlyOpened` is the localStorage list App.tsx records in openDetail;
   * the draft fields are the same values the draft pill already derives.
   */
  recentlyOpened?: RecentlyOpenedEntry[]
  currentDraftPaperId?: string | null
  currentDraftGroupCount?: number
  onOpenDraftPaper?: (draftPaperId: string) => void
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
const DEFAULT_FEED_PAGE_SIZE = 4

/** UI 门面刀 F2 — muted dimension labels in front of each chip row. */
const FILTER_DIM_LABEL: Record<'groupType' | 'year' | 'month' | 'region' | 'sourceType' | 'topicGroup', string> = {
  groupType: '题型',
  year: '年份',
  month: '月份',
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
const DEFAULT_FILTER_DIMS = ['groupType', 'year', 'month', 'topicGroup'] as const
const ALL_FILTER_DIMS = ['groupType', 'year', 'month', 'topicGroup', 'region', 'sourceType'] as const

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
    onOpenDetail,
    onOpenPaperBrowse,
    questionGroups,
    dataStatus,
    dataError = null,
    onRetryData,
    thinkingMode,
    onThinkingModeChange,
    browseActive,
    onEnterBrowse,
    recentlyOpened = [],
    currentDraftPaperId = null,
    currentDraftGroupCount = 0,
    onOpenDraftPaper,
  } = props
  const { intent, state, paperResults, expandedPaperKey } = retrieval
  const { setIntent, submit, togglePaper } = actions
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  // dataLoading：手里还没有真题（在连，或没连上），搜索、浏览、默认列表都先关着。
  const dataLoading = dataStatus === 'loading' || dataStatus === 'error'
  const dataConnecting = dataStatus === 'loading'
  const dataDown = dataStatus === 'error'

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
    const monthRaw = params.get('f.month')
    if (monthRaw !== null && /^(?:[1-9]|1[0-2])$/.test(monthRaw)) next.month = Number(monthRaw)
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
        month: 'f.month',
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
    filters.month !== undefined ||
    filters.yearBefore !== undefined ||
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
    filters.month,
    filters.yearBefore,
    filters.region,
    filters.sourceType,
    filters.topicGroup,
  ].filter((value) => value !== undefined).length
  // Collapsed-state active chip summary — reuses the same faceted option
  // labels the open filter panel already computes, just picked out for the
  // currently-active dimensions.
  const activeFilterEntries = useMemo(() => {
    const dims = ['groupType', 'year', 'month', 'region', 'sourceType', 'topicGroup'] as const
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
  const handleEnterBrowse = () => {
    onEnterBrowse?.()
  }

  function selectBrowseSource(sourceType: 'real_exam' | 'mock_exam' | undefined) {
    setFilters((prev) => {
      const next = { ...prev }
      if (sourceType === undefined) delete next.sourceType
      else next.sourceType = sourceType
      return next
    })
    if (!browseActive) onEnterBrowse?.()
  }

  function selectBrowseYear(year: number) {
    setFilters((prev) => {
      const next = { ...prev }
      delete next.yearBefore
      delete next.month
      if (prev.year === year) delete next.year
      else next.year = year
      return next
    })
    if (!browseActive) onEnterBrowse?.()
  }

  function selectBrowseMonth(month: number | undefined) {
    setFilters((prev) => {
      const next = { ...prev }
      if (month === undefined || prev.month === month) delete next.month
      else next.month = month
      return next
    })
  }

  function selectBrowseOlder(cutoff: number) {
    setFilters((prev) => {
      const next = { ...prev }
      delete next.year
      delete next.month
      if (prev.yearBefore === cutoff) delete next.yearBefore
      else next.yearBefore = cutoff
      return next
    })
    if (!browseActive) onEnterBrowse?.()
  }

  // home-blank 硬契约 — esc 只清 query（不清筛选/不退浏览态）. Named handlers
  // (not inline arrows) keep the SearchField element short — a verify-
  // concierge-desk.mjs regex windows the span between the SearchField tag
  // and its `disabled={dataLoading}` prop.
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
    (state.kind === 'empty' || isVacuumResultsState(state))
  const isBrowseScreen = Boolean(browseActive) || hasActiveFilters
  const isHomeScreen = !isBrowseScreen && state.kind === 'empty'
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
  // Browse retains the full year-grouped catalog and truthful year totals.
  // Only the home additions list below is capped.
  const feedByYear = useMemo(() => groupFeedByYear(defaultFeed), [defaultFeed])
  const homeRecentFeed = useMemo(
    () => (showFeed && !isBrowseScreen ? buildRecentFeed(questionGroups, DEFAULT_FEED_PAGE_SIZE) : []),
    [showFeed, isBrowseScreen, questionGroups],
  )
  const browseYears = useMemo(
    () => buildFacetedFilterOptions(questionGroups, {}).year.map((option) => Number(option.value)),
    [questionGroups],
  )
  const browseRecentYears = browseYears.slice(0, 4)
  const browseOlderCutoff = browseRecentYears[browseRecentYears.length - 1]
  const browseMonths = filterOptions.month.filter(option => option.count > 0 || Number(option.value) === filters.month)

  // Browse-all and search recovery refer to the full, unfiltered catalog.
  const catalogFeed = useMemo(() => buildDefaultFeed(questionGroups), [questionGroups])
  const catalogPaperCount = catalogFeed.length

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
    if (dataDown) return '题库没连上，暂时搜不了'
    if (dataLoading) return '正在连接本地题库…'
    if (state.kind === 'clarification') return '换个说法，比如：偏说明文 / 主旨概括'
    if (!showListSurface) return ROTATING_PLACEHOLDERS[placeholderIndex]
    return ROTATING_PLACEHOLDERS[0]
  }, [dataLoading, dataDown, state, showListSurface, placeholderIndex])

  const submitDisabled = dataLoading || state.kind === 'loading' || intent.trim().length === 0

  return (
    <section
      className="concierge-desk"
      aria-label="题库取题流"
      data-surface={isBrowseScreen ? 'browse' : state.kind === 'empty' ? 'home' : 'list'}
      data-screen={isBrowseScreen ? 'browse' : 'home'}
    >
      <div className="concierge-stage">
        <div className="concierge-stage-inner concierge-stage-inner--risen">
          <div className="concierge-command-bar">
            {/* 搜索框构件（shared-ui/SearchField，构件厂 2026-11-15）：首页 hero、浏览页 compact，换前换后逐像素一样。
                concierge-intent-* 类名留作钩子：宽度和摆法在 App.css，测试脚本也按它们认。
                ✕：Owner 2026-11-14 决定 #14，清完把焦点放回输入框。不放的话 ✕ 跟着空字一起卸掉，焦点掉到 body，
                键盘用户要从页首重新 Tab，鼠标用户也得再点一次输入框才能接着打字。 */}
            <SearchField
              tier={isBrowseScreen ? 'compact' : 'hero'}
              label="自然语言搜索"
              hooks={{
                form: 'concierge-intent-bar',
                input: 'concierge-intent-input',
                clear: 'concierge-intent-clear',
                submit: 'concierge-intent-submit',
              }}
              inputRef={inputRef}
              id={inputId}
              value={intent}
              onValueChange={setIntent}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onKeyDown={handleInputKeyDown}
              placeholder={placeholder}
              autoFocus={isHomeScreen}
              disabled={dataLoading}
              aria-busy={dataLoading || undefined}
              onSubmit={handleSubmit}
              submitLabel="搜索"
              submitDisabled={submitDisabled}
              submitBusy={state.kind === 'loading' || dataConnecting}
              loading={state.kind === 'loading'}
              onClear={() => {
                actions.reset()
                inputRef.current?.focus()
              }}
              clearLabel="清除搜索"
            />
            {/* 题库还没拿到（在连或没连上）时不出这个键：原来会写成「浏览全部 0 套卷」，像是题库空了。 */}
            {isHomeScreen && onEnterBrowse && !dataLoading && (
              // 构件厂第 4 步第八页：换成 shared-ui/Button 次要灰中号带图标（高 32，原来也是 32）。
              <Button
                className="concierge-browse-entry"
                tone="subtle"
                icon={<QuestionBank size={16} aria-hidden="true" />}
                onClick={handleEnterBrowse}
                disabled={dataLoading}
              >
                浏览全部 {catalogPaperCount} 套卷
              </Button>
            )}
            {isBrowseScreen && !dataLoading && state.kind === 'empty' && (
              <FluidHoverList as="div" axis="xy" className="concierge-browse-chips" itemSelector=".concierge-browse-chip" gapClick={false} role="group" aria-label="筛选">
                {/* 胶囊构件（shared-ui/Chip.tsx 的 ChipToggle，aria-pressed）。类名 concierge-browse-chip 只当
                    FluidHoverList 的 itemSelector 和检查脚本的钩子，样子全在 chip.css。 */}
                <ChipToggle
                  className="concierge-browse-chip"
                  pressed={!hasActiveFilters}
                  onClick={() => {
                    clearFilters()
                    if (!browseActive) onEnterBrowse?.()
                  }}
                >
                  全部
                </ChipToggle>
                <ChipToggle
                  className="concierge-browse-chip"
                  pressed={filters.sourceType === 'real_exam'}
                  onClick={() => selectBrowseSource(filters.sourceType === 'real_exam' ? undefined : 'real_exam')}
                >
                  真题
                </ChipToggle>
                <ChipToggle
                  className="concierge-browse-chip"
                  pressed={filters.sourceType === 'mock_exam'}
                  onClick={() => selectBrowseSource(filters.sourceType === 'mock_exam' ? undefined : 'mock_exam')}
                >
                  模拟
                </ChipToggle>
                {browseRecentYears.map((year) => (
                  <ChipToggle
                    key={year}
                    className="concierge-browse-chip"
                    pressed={filters.year === year}
                    onClick={() => selectBrowseYear(year)}
                  >
                    {year}
                  </ChipToggle>
                ))}
                {browseYears.length > 4 && browseOlderCutoff !== undefined && (
                  <ChipToggle
                    className="concierge-browse-chip"
                    pressed={filters.yearBefore === browseOlderCutoff}
                    onClick={() => selectBrowseOlder(browseOlderCutoff)}
                  >
                    更早
                  </ChipToggle>
                )}
              </FluidHoverList>
            )}
            {isBrowseScreen && !dataLoading && state.kind === 'empty' && filters.year !== undefined && browseMonths.length > 0 && (
              <FluidHoverList as="div" axis="xy" className="concierge-browse-chips" itemSelector=".concierge-browse-chip" gapClick={false} role="group" aria-label="月份">
                <ChipToggle className="concierge-browse-chip" pressed={filters.month === undefined} onClick={() => selectBrowseMonth(undefined)}>全部月份</ChipToggle>
                {browseMonths.map(option => (
                  <ChipToggle key={option.value} className="concierge-browse-chip" pressed={filters.month === Number(option.value)} onClick={() => selectBrowseMonth(Number(option.value))}>
                    {option.label}
                  </ChipToggle>
                ))}
              </FluidHoverList>
            )}
          </div>
          {/* 题库的连接状态：命令行下面固定一处，一行（共用提示行）。
              没连上时不悄悄换成样例题（走查第四节第 7 条），直说并给「重试」；草稿卷在服务器上，不受影响。 */}
          {(dataConnecting || dataDown) && (
            <div className="concierge-status-slot">
              {dataDown ? (
                <Notice
                  kind="error"
                  className="concierge-data-error"
                  detail={dataError}
                  action={onRetryData ? { label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: onRetryData } : undefined}
                >
                  题库没连上，草稿卷里的题还在
                </Notice>
              ) : (
                <Notice kind="waiting" className="concierge-data-loading">正在连接本地题库，连上就能搜</Notice>
              )}
            </div>
          )}
          {state.kind !== 'empty' && onThinkingModeChange && (
            <label className="concierge-thinking-toggle">
              <input
                type="checkbox"
                checked={Boolean(thinkingMode)}
                onChange={(event) => onThinkingModeChange(event.target.checked)}
              />
              思考模式
            </label>
          )}
          {state.kind === 'results' && !dataLoading && (
            // 构件厂第 4 步第八页：换成 shared-ui/Button 墨字大号（高 36，原来也是 36）。展开时用构件的
            // 「打开着」样子（桌色底、墨字），原来是把细描边换成石板墨色。
            // 开的是筛选面板，不是菜单，不加 aria-haspopup；挂 data-opens-popup 让 button.css 认它是弹出类，
            // 展开时照旧垫桌色（Owner 2026-11-14 第 18 条：就地展开的键不垫，「筛选」保持 11-14 认下的样子）。
            <Button
              className="concierge-command-filter-toggle"
              tone="strong"
              size="lg"
              aria-expanded={filterPanelExpanded}
              data-opens-popup=""
              aria-controls={filterPanelId}
              onClick={() => setFilterPanelExpanded((value) => !value)}
            >
              筛选{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
            </Button>
          )}
        </div>

        {(showListSurface || showFeed) && (
          <div className="concierge-list-surface">
      {/* 好默认: 筛选默认收起。收起态下若有激活筛选，命令行下方露出可移除的
          激活 chip 摘要，替代整块筛选面板。 */}
      {!dataLoading &&
        (state.kind === 'empty' || state.kind === 'results') &&
        !filterPanelExpanded &&
        hasActiveFilters && (
          <ul className="concierge-active-filter-chips" aria-label="已激活筛选">
            {/* 胶囊第二轮（2026-11-14）：已选筛选点了是「移除这个筛选」，是动作，不是标记也不是开关，
                照「胶囊只给标签类」归 Button（墨字小号 28），不再是胶囊；一直垫桌色底（Button「打开着」的样子，App.css）。
                读屏名以看得见的字开头，后面补上点了会怎样（「×」是装饰，不念）。 */}
            {activeFilterEntries.map((entry) => (
              <li key={entry.key}>
                <Button
                  tone="strong"
                  size="sm"
                  className="concierge-active-filter-chip"
                  aria-label={`${FILTER_DIM_LABEL[entry.key]}：${entry.text}，移除这个筛选`}
                  onClick={() => removeFilter(entry.key)}
                >
                  {FILTER_DIM_LABEL[entry.key]}：{entry.text}
                  <span aria-hidden="true"> ×</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

      {dataConnecting && (
        <>
          {/* ui-search-feel 刀⑤ #1 — dataLoading skeleton. The status line
              (.concierge-status-slot under the command bar) carries the a11y state; these blocks are pure visual
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
              <FluidHoverList
                className="concierge-starter-chips"
                axis="xy"
                itemSelector=".concierge-starter-chip"
                gapClick={false}
                aria-label={dimension}
              >
                {/* 胶囊第二轮（2026-11-14）：筛选胶囊换成 shared-ui/Chip.tsx 的 ChipToggle（aria-pressed），样子在 chip.css。
                    类名 concierge-starter-chip 留给 FluidHoverList 的 itemSelector 和脚本当钩子；is-zero（这一项 0 条）的变淡还在 App.css。 */}
                {filterOptions[dimension].map((option) => {
                  const selected = String(filters[dimension] ?? '') === option.value
                  const isZero = option.count === 0
                  return (
                    <li key={option.value}>
                      <ChipToggle
                        pressed={selected}
                        className={`concierge-starter-chip${isZero ? ' is-zero' : ''}`}
                        onClick={() =>
                          toggleFilter(
                            dimension,
                            (dimension === 'year' || dimension === 'month' ? Number(option.value) : option.value) as never,
                          )
                        }
                      >
                        {option.label} {option.count}
                      </ChipToggle>
                    </li>
                  )
                })}
              </FluidHoverList>
            </div>
          ))}
          {(canToggleFilters || hasActiveFilters) && (
            <div className="concierge-filter-actions">
              {/* Owner 2026-11-14 决定 #1：这一排的两个纯文字键换成淡墨小号（quiet sm），负边距见 App.css
                  .concierge-filter-actions。句子里带下划线的「清除筛选」（concierge-filter-clear-inline）不动。 */}
              {canToggleFilters && (
                <Button
                  tone="quiet"
                  size="sm"
                  className="concierge-filter-more"
                  aria-expanded={showAllFilterDims}
                  onClick={() => setFiltersExpanded((value) => !value)}
                >
                  {filtersExpanded ? '收起筛选' : '更多筛选'}
                </Button>
              )}
              {hasActiveFilters && (
                <Button tone="quiet" size="sm" className="concierge-filter-clear" onClick={clearFilters}>
                  清除筛选
                </Button>
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
        <Notice kind="info" className="concierge-notice">
          {pickResultsNoticeLine(isAllWeakResultsState(state), state.assistantMessage, state.fallbackReason)}
        </Notice>
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
        // 连不上搜索不会丢东西（输入还在），不上危险色；后面照登原话（No-Literal-Fallback）。
        <Notice
          kind="error"
          className="concierge-error"
          detail={state.message}
          action={{ label: '重试', icon: <RotateCcw size={16} aria-hidden="true" />, onClick: () => void actions.submit(state.query) }}
        >
          搜索没连上，你输入的内容还在
        </Notice>
      )}

      <div className="concierge-results" aria-live="polite">
        {state.kind === 'loading' && (
          <>
            <Notice kind="waiting" className="concierge-loading">{`正在为「${state.query}」找题…`}</Notice>
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
          // 「没找到」做成卡片，摊手獭獭从卡片上沿露出半身（BRAND.md 第 118、119、31 条）。话照原来那一行：
          // 两条出路，「换个说法」留在句子里，「返回浏览全部 N 套卷」原来是行内墨字链接，现在是卡片里的墨字键。
          // 类名 concierge-empty 留着给 smoke 脚本认。
          <EmptyState
            className="concierge-empty"
            otter="not-found"
            action={{ label: `返回浏览全部 ${catalogPaperCount} 套卷`, tone: 'strong', onClick: () => actions.reset() }}
          >
            没找到匹配。可以换个说法。
          </EmptyState>
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
          <FluidHoverList className="concierge-paper-list" itemSelector=".concierge-paper-row-head" hitArea={paperRowHitArea}>
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
          </FluidHoverList>
        )}
      </div>

      {showFeed && (
        <div className="concierge-default-feed" role="region" aria-label={isBrowseScreen ? '题库浏览' : '备课桌'}>
          {questionGroups.length === 0 ? (
            <EmptyState className="concierge-feed-empty-corpus" illustration="question-bank">题库还没有题目。先导入一套卷，这里就能按卷浏览。</EmptyState>
          ) : hasActiveFilters && feedPaperCount === 0 ? (
            <p className="concierge-empty">
              筛选条件太严格，题库里没有匹配的卷。
              <button type="button" className="concierge-filter-clear-inline" onClick={clearFilters}>
                清除筛选
              </button>
            </p>
          ) : isBrowseScreen ? (
            <div className="concierge-feed-groups">
              {feedByYear.map((yearGroup) => (
                <div key={yearGroup.label} className="concierge-feed-year-group">
                  <div className="concierge-feed-year-head">
                    <span className="concierge-feed-year-label">{yearGroup.label}</span>
                    <span className="concierge-feed-year-count">{yearGroup.papers.length} 套</span>
                  </div>
                  <FluidHoverList className="concierge-paper-list" itemSelector=".concierge-paper-row-head" hitArea={paperRowHitArea}>
                    {yearGroup.papers.map((paper) => (
                      <li key={paper.key}>
                        <ConciergePaperRow
                          paper={paper}
                          variant="feed"
                          expanded={expandedPaperKey === paper.key}
                          basketIds={basketIds}
                          onTogglePaper={togglePaper}
                          onOpenDetail={onOpenDetail}
                          onOpenPaperBrowse={onOpenPaperBrowse}
                          questionGroupById={questionGroupById}
                          expandedSimilarGroupId={expandedSimilarGroupId}
                          similarPassagesRequest={similarPassagesRequest}
                          onToggleSimilar={handleToggleSimilar}
                          onRetrySimilar={() => expandedSimilarGroupId && void loadSimilarPassages(expandedSimilarGroupId)}
                        />
                      </li>
                    ))}
                  </FluidHoverList>
                </div>
              ))}
            </div>
          ) : (
            <div className="home-sections">
              {onOpenDetail && onOpenDraftPaper && (
                <HomeContinueSection
                  questionGroupById={questionGroupById}
                  recentlyOpened={recentlyOpened}
                  draftPaperId={currentDraftPaperId}
                  draftGroupCount={currentDraftGroupCount}
                  onOpenDetail={onOpenDetail}
                  onOpenDraftPaper={onOpenDraftPaper}
                />
              )}
              {homeRecentFeed.length > 0 && (
                <section className="home-section" aria-label="最近上新">
                  <h2 className="concierge-feed-label home-section-label">最近上新</h2>
                  <FluidHoverList className="concierge-paper-list" itemSelector=".concierge-paper-row-head" hitArea={paperRowHitArea}>
                    {homeRecentFeed.map((paper) => (
                      <li key={paper.key}>
                        <ConciergePaperRow
                          paper={paper}
                          variant="feed"
                          recentAddition
                          expanded={expandedPaperKey === paper.key}
                          basketIds={basketIds}
                          onTogglePaper={togglePaper}
                          onOpenDetail={onOpenDetail}
                          onOpenPaperBrowse={onOpenPaperBrowse}
                          questionGroupById={questionGroupById}
                          expandedSimilarGroupId={expandedSimilarGroupId}
                          similarPassagesRequest={similarPassagesRequest}
                          onToggleSimilar={handleToggleSimilar}
                          onRetrySimilar={() => expandedSimilarGroupId && void loadSimilarPassages(expandedSimilarGroupId)}
                        />
                      </li>
                    ))}
                  </FluidHoverList>
                </section>
              )}
              {onOpenDetail && (
                <HomeDailyPassage questionGroups={questionGroups} onOpenDetail={onOpenDetail} />
              )}
            </div>
          )}
        </div>
      )}
          </div>
        )}
      </div>
    </section>
  )
}
