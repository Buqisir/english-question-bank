/**
 * buildDefaultFeed — content for the AI 取题台's empty state.
 *
 * Cut ⑥ (home-default-feed): the desk used to render nothing until the
 * teacher typed a query. That's a blank canvas, not a starting point. This
 * module turns the full question-group corpus into the same `PaperResult[]`
 * shape the search results path already renders, so `ConciergePaperRow` can
 * show a "browse the bank" feed with zero changes to its own logic.
 *
 * Reuse, not reinvention:
 *   - We synthesize one `ConciergeSearchHit` per question group (empty
 *     reason — there is no search reason to show) and hand the list to the
 *     existing `aggregatePaperResults`. Bucketing / dedupe / fallback-bucket
 *     rules stay exactly as search already defines them; this file owns only
 *     the "which order do papers appear in" question.
 *   - Sort: most recent first (year DESC), ties broken by paperName so the
 *     order is stable across renders/reloads.
 */

import type { QuestionGroupCard } from '../domain/questionBank.ts'
import { aggregatePaperResults, type PaperResult } from './aggregatePaperResults.ts'
import type { ConciergeSearchHit } from './conciergeSearch.ts'

/**
 * Build the default (unsearched) feed of paper rows from the full corpus.
 *
 * - Every question group is included — real exam and mock alike, no filter.
 * - Papers with an unusable year sort last (their `year` is `null` after
 *   aggregation's fallback-bucket rule, or the group's own year is not a
 *   finite positive number).
 */
export function buildDefaultFeed(groups: QuestionGroupCard[]): PaperResult[] {
  const hits: ConciergeSearchHit[] = groups.map((group) => ({ group, reason: '' }))
  const papers = aggregatePaperResults(hits)
  return [...papers].sort((a, b) => {
    const aYear = typeof a.year === 'number' ? a.year : -Infinity
    const bYear = typeof b.year === 'number' ? b.year : -Infinity
    if (aYear !== bYear) return bYear - aYear
    return a.paperName.localeCompare(b.paperName, 'zh-Hans-CN')
  })
}

/** Home date-stream: most recently imported papers first, capped. */
export function buildRecentFeed(groups: QuestionGroupCard[], limit = 8): PaperResult[] {
  return [...buildDefaultFeed(groups)]
    .sort((a, b) => {
      const byImport = String(b.importedAt || '').localeCompare(String(a.importedAt || ''))
      if (byImport !== 0) return byImport
      return a.paperName.localeCompare(b.paperName, 'zh-Hans-CN')
    })
    .slice(0, limit)
}
