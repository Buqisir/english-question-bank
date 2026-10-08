/**
 * filters.ts — structured (chip) filtering for the AI 取题台.
 *
 * Cut ai-mode-filter-chips (C1): pure functions, no React, no IO. This module
 * is the client-side "hard condition" layer that sits alongside natural-
 * language search (`conciergeSearch.ts`) — that module handles "what the
 * query said"; this module handles "what the teacher clicked". Both apply to
 * the same `QuestionGroupCard[]`, so they compose as a plain AND with zero
 * coupling: this file never imports conciergeSearch, and conciergeSearch
 * never imports this file.
 *
 * Four dimensions (PM 拍板 #2 — 一体化 chips 精简版):
 *   - groupType (题型): fixed business order (reading/seven_choices/cloze/
 *     grammar_cloze/writing — the five types the plan names), other types
 *     that happen to exist in data are appended afterward so nothing silently
 *     disappears from the option list.
 *   - year (年份): descending.
 *   - region (地区): by count descending (ties broken by name for stability).
 *   - sourceType (来源): fixed order (real_exam then mock_exam), other values
 *     appended afterward for the same reason as groupType.
 *
 * Difficulty and topic are explicitly out of scope (see plan.md Forbidden).
 */

import {
  groupTypeLabel,
  sourceTypeLabel,
  type GroupType,
  type QuestionGroupCard,
  type SourceType,
} from '../domain/questionBank.ts'

export type FilterOption<TValue extends string = string> = {
  value: TValue
  label: string
  count: number
}

export type ConciergeFilterOptions = {
  groupType: FilterOption[]
  year: FilterOption[]
  month: FilterOption[]
  region: FilterOption[]
  sourceType: FilterOption[]
  topicGroup: FilterOption[]
}

/** All five dimensions optional; a missing field means "do not filter on this". */
export type ConciergeFilters = {
  groupType?: string
  year?: number
  month?: number
  /** Browse 「更早」: keep groups whose year is strictly older than this cutoff. */
  yearBefore?: number
  region?: string
  sourceType?: string
  /**
   * Single selected `theme_group` (I16d) — the cross-type topic mid-tier
   * (9 categories), sourced from `QuestionGroupCard.topicLabels[].themeGroup`.
   * A group can carry multiple topic labels (avg 1.87), so this is OR
   * semantics against that group's set, not an exact single-value match.
   */
  topicGroup?: string
}

/** Business-fixed display order for 题型 (plan.md C1). Anything else sorts after. */
const GROUP_TYPE_ORDER: GroupType[] = [
  'reading',
  'seven_choices',
  'cloze',
  'grammar_cloze',
  'writing',
]

/** Business-fixed display order for 来源 (plan.md C1: 真题/模拟题). */
const SOURCE_TYPE_ORDER: SourceType[] = ['real_exam', 'mock_exam']

function countBy<T extends string>(
  groups: QuestionGroupCard[],
  pick: (group: QuestionGroupCard) => T | null | undefined,
): Map<T, number> {
  const counts = new Map<T, number>()
  for (const group of groups) {
    const value = pick(group)
    if (value === null || value === undefined) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

function orderedOptions<T extends string>(
  counts: Map<T, number>,
  fixedOrder: readonly T[],
  labelFor: (value: T) => string,
): FilterOption[] {
  const options: FilterOption[] = []
  const seen = new Set<T>()
  for (const value of fixedOrder) {
    const count = counts.get(value)
    if (count === undefined) continue
    options.push({ value, label: labelFor(value), count })
    seen.add(value)
  }
  // Anything present in the data but not in the fixed order sorts after,
  // by count descending — so an unexpected value is visible, not hidden.
  const rest = Array.from(counts.entries())
    .filter(([value]) => !seen.has(value))
    .sort((a, b) => b[1] - a[1])
  for (const [value, count] of rest) {
    options.push({ value, label: labelFor(value), count })
  }
  return options
}

/**
 * Build the four filter dimensions from the live corpus — distinct values +
 * counts, no hardcoding. Options recompute whenever `groups` changes, so a
 * newly-imported paper's region/year/groupType shows up automatically.
 */
export function buildFilterOptions(groups: QuestionGroupCard[]): ConciergeFilterOptions {
  const groupTypeCounts = countBy(groups, (g) => g.groupType)
  const groupType = orderedOptions(
    groupTypeCounts,
    GROUP_TYPE_ORDER,
    (value) => groupTypeLabel[value] || value,
  )

  const yearCounts = countBy(groups, (g) =>
    Number.isFinite(g.year) && g.year > 0 ? String(g.year) : null,
  )
  const year: FilterOption[] = Array.from(yearCounts.entries())
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([value, count]) => ({ value, label: value, count }))

  const monthCounts = countBy(groups, (g) =>
    Number.isInteger(g.month) && g.month! >= 1 && g.month! <= 12 ? String(g.month) : null,
  )
  const month: FilterOption[] = Array.from(monthCounts.entries())
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([value, count]) => ({ value, label: `${value}月`, count }))

  const regionCounts = countBy(groups, (g) => {
    const region = String(g.region ?? '').trim()
    return region && region !== '未标地区' && region !== '未标' ? region : null
  })
  const region: FilterOption[] = Array.from(regionCounts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([value, count]) => ({ value, label: value, count }))

  const sourceTypeCounts = countBy(groups, (g) => g.sourceType)
  const sourceType = orderedOptions(
    sourceTypeCounts,
    SOURCE_TYPE_ORDER,
    (value) => sourceTypeLabel[value] || value,
  )

  // topicGroup (I16d): a group can carry multiple topicLabels, so this is a
  // distinct-per-group count, not a plain countBy over a single picked value
  // (countBy's signature assumes one value per group and stays untouched).
  // Each group contributes at most one count per distinct themeGroup, even
  // if two of its labels share that themeGroup.
  const topicGroupCounts = new Map<string, number>()
  for (const group of groups) {
    const seenThemeGroups = new Set<string>()
    for (const label of group.topicLabels ?? []) {
      const themeGroup = label.themeGroup
      if (!themeGroup || seenThemeGroups.has(themeGroup)) continue
      seenThemeGroups.add(themeGroup)
      topicGroupCounts.set(themeGroup, (topicGroupCounts.get(themeGroup) ?? 0) + 1)
    }
  }
  const topicGroup: FilterOption[] = Array.from(topicGroupCounts.entries())
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'zh-Hans-CN'))
    .map(([value, count]) => ({ value, label: value, count }))

  return { groupType, year, month, region, sourceType, topicGroup }
}

/**
 * UI 门面刀 F2 — faceted chip counts (上刀 CR SW-2).
 *
 * The chip *option set* must stay the full-corpus set (chips never appear/
 * disappear/reorder as filters change — that's `buildFilterOptions(groups)`,
 * unchanged). Only each dimension's per-option *count* should narrow, and it
 * narrows using every *other* active dimension's filter (never the
 * dimension's own selection) — standard faceted-search semantics, so a
 * teacher can still compare counts within the dimension they just picked.
 *
 * Implementation is intentionally the dumb version: for each of the 4 fixed
 * dimensions, filter groups by the other 3 active filters via the existing
 * `applyConciergeFilters`, then recompute counts with `buildFilterOptions`
 * and splice just that dimension's counts onto the full-corpus option list
 * (preserving the full-corpus order/labels/value set).
 */
export function buildFacetedFilterOptions(
  groups: QuestionGroupCard[],
  filters: ConciergeFilters,
): ConciergeFilterOptions {
  const fullOptions = buildFilterOptions(groups)
  const dimensions = ['groupType', 'year', 'month', 'region', 'sourceType', 'topicGroup'] as const

  const result = { ...fullOptions }
  for (const dimension of dimensions) {
    const otherFilters: ConciergeFilters = { ...filters }
    delete otherFilters[dimension]
    const facetGroups = applyConciergeFilters(groups, otherFilters)
    const facetCounts = new Map(
      buildFilterOptions(facetGroups)[dimension].map((option) => [option.value, option.count]),
    )
    result[dimension] = fullOptions[dimension].map((option) => ({
      ...option,
      count: facetCounts.get(option.value) ?? 0,
    }))
  }
  return result
}

/**
 * Apply the four (optional) chip filters as an AND over `groups`. A filter
 * dimension left unset does not narrow the result at all. An empty
 * `ConciergeFilters` returns `groups` unchanged (same reference-shape, new
 * array). Filtering to zero legitimately returns `[]` — chips are a hard
 * condition, not a search fallback, so there is no "fall back to full corpus"
 * behavior here (that's conciergeSearch's job for query intent, not this
 * module's).
 */
export function applyConciergeFilters(
  groups: QuestionGroupCard[],
  filters: ConciergeFilters,
): QuestionGroupCard[] {
  const { groupType, year, month, yearBefore, region, sourceType, topicGroup } = filters
  if (
    groupType === undefined &&
    year === undefined &&
    month === undefined &&
    yearBefore === undefined &&
    region === undefined &&
    sourceType === undefined &&
    topicGroup === undefined
  ) {
    return groups.slice()
  }
  return groups.filter((group) => {
    if (groupType !== undefined && group.groupType !== groupType) return false
    if (year !== undefined && group.year !== year) return false
    if (month !== undefined && group.month !== month) return false
    if (yearBefore !== undefined && !(typeof group.year === 'number' && group.year < yearBefore)) return false
    if (region !== undefined && String(group.region ?? '').trim() !== region) return false
    if (sourceType !== undefined && group.sourceType !== sourceType) return false
    if (topicGroup !== undefined && !group.topicLabels?.some((l) => l.themeGroup === topicGroup)) {
      return false
    }
    return true
  })
}
