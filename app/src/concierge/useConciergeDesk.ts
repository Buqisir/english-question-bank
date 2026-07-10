/**
 * useConciergeDesk — owns AI 取题台 V1.1 state.
 *
 * V1.1 IA:
 *   - User searches in natural language (existing runConciergeSearch).
 *   - The hits are aggregated client-side into "来源卷 / 试卷" rows
 *     (see aggregatePaperResults).
 *   - The desk expands ONE paper at a time (`expandedPaperKey`).
 *   - Expanding a paper does NOT fetch question-group detail. We render the
 *     groups inside the paper card from the cards we already have.
 *   - `detailCache` is preserved (and exported on `retrieval.groupDetail.cache`)
 *     for future per-group detail drawers, but no longer driven by the paper
 *     expand toggle.
 *
 * Public surface:
 *   - retrieval: a stable view object with the current 取题流 state.
 *   - actions:   a stable action object with the 取题流 commands.
 *
 * App.tsx wires `retrieval` + `actions` straight through to ConciergeDesk and
 * never reads the internal flat fields. This keeps the Retrieval Module's
 * internals (paper buckets, expansion key) opaque to App. (similar-entrypoints
 * E3 retired the old text-search-fill 找类似 flow that used to live here —
 * 配相似 is now a plain deep-link owned by ConciergeGroupCard, not a hook
 * action.)
 *
 * Important: this hook owns its own detailCache, separate from App.tsx's
 * previewDetails / loadPreviewForBasketItems. They are NOT shared.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { QuestionGroupCard, QuestionGroupDetail } from '../domain/questionBank.ts'
import { fetchQuestionGroupDetail } from '../services/questionGroups.ts'
import { fetchAiStatus } from '../services/aiStatus.ts'
import {
  runConciergeSearch,
  type ConciergeSearchHit,
  type ConciergeSearchOutcome,
} from './conciergeSearch.ts'
import { aggregatePaperResults, type PaperResult } from './aggregatePaperResults.ts'

export type ConciergeDeskState =
  | { kind: 'empty' }
  | { kind: 'loading'; query: string }
  | { kind: 'results'; hits: ConciergeSearchHit[]; assistantMessage: string; query: string; usedFallback: boolean; fallbackReason?: string }
  | { kind: 'clarification'; question: string; assistantMessage: string; pendingQuery: string }
  | { kind: 'error'; message: string; query: string }

export type ConciergeDetailEntry =
  | { status: 'loading' }
  | { status: 'ready'; detail: QuestionGroupDetail }
  | { status: 'error'; error: string }

export type ConciergeDetailCache = Record<string, ConciergeDetailEntry>

export type UseConciergeDeskInput = {
  questionGroups: QuestionGroupCard[]
  apiKey: string
  /** Whether to enable thinking mode for AI steward search. */
  thinkingMode?: boolean
  /** Test seam — replace network call. */
  searchOverride?: typeof runConciergeSearch
  /** Test seam — replace the detail fetch. */
  detailFetchOverride?: typeof fetchQuestionGroupDetail
  /** Test seam — replace the AI-status fetch (cut ai-key-server-fallback). */
  aiStatusFetchOverride?: typeof fetchAiStatus
}

/** View slice of the 取题流: read-only render input for ConciergeDesk. */
export type ConciergeRetrievalView = {
  intent: string
  state: ConciergeDeskState
  paperResults: PaperResult[]
  expandedPaperKey: string | null
  groupDetail: {
    cache: ConciergeDetailCache
  }
}

/** Action slice of the 取题流: every command ConciergeDesk can fire. */
export type ConciergeRetrievalActions = {
  setIntent: (value: string) => void
  submit: (intentOverride?: string) => Promise<void>
  togglePaper: (paperKey: string) => void
  retryGroupDetail: (groupId: string) => void
  reset: () => void
}

export type UseConciergeDeskResult = {
  retrieval: ConciergeRetrievalView
  actions: ConciergeRetrievalActions
}

export function useConciergeDesk(input: UseConciergeDeskInput): UseConciergeDeskResult {
  const [intent, setIntent] = useState('')
  const [state, setState] = useState<ConciergeDeskState>({ kind: 'empty' })
  const [expandedPaperKey, setExpandedPaperKey] = useState<string | null>(null)
  const [detailCache, setDetailCache] = useState<ConciergeDetailCache>({})
  // cut ai-key-server-fallback (MF-2 seam a): mount-time probe for whether the server
  // holds its own DeepSeek key. Defaults false — pre-fetch-resolution searches behave
  // exactly like before this cut (honest degradation, no loading gate; plan.md §3).
  const [serverKeyAvailable, setServerKeyAvailable] = useState(false)
  // cut m0-5-ai-daily-limit (C5): same mount-time probe now also reports whether
  // today's server-key AI quota is exhausted. Defaults false (pre-fetch-resolution
  // searches behave exactly like before this cut).
  const [dailyLimitExceeded, setDailyLimitExceeded] = useState(false)

  const fetchDetail = input.detailFetchOverride || fetchQuestionGroupDetail
  const fetchStatus = input.aiStatusFetchOverride || fetchAiStatus

  useEffect(() => {
    let cancelled = false
    fetchStatus().then((status) => {
      if (!cancelled) {
        setServerKeyAvailable(status.serverKeyAvailable)
        setDailyLimitExceeded(status.dailyLimitExceeded)
      }
    })
    return () => {
      cancelled = true
    }
  }, [fetchStatus])

  const loadDetail = useCallback(
    (groupId: string) => {
      setDetailCache((prev) => ({ ...prev, [groupId]: { status: 'loading' } }))
      Promise.resolve()
        .then(() => fetchDetail(groupId))
        .then((detail: QuestionGroupDetail | null | undefined) => {
          if (!detail) {
            setDetailCache((prev) => ({
              ...prev,
              [groupId]: { status: 'error', error: '没找到这个题组，可能已被移除。刷新试试，或换一组。' },
            }))
            return
          }
          setDetailCache((prev) => ({ ...prev, [groupId]: { status: 'ready', detail } }))
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error)
          if (typeof console !== 'undefined' && console.warn) {
            console.warn('[concierge] group detail fetch failed:', message)
          }
          setDetailCache((prev) => ({ ...prev, [groupId]: { status: 'error', error: message } }))
        })
    },
    [fetchDetail],
  )

  const retryGroupDetail = useCallback(
    (groupId: string) => {
      loadDetail(groupId)
    },
    [loadDetail],
  )

  // Single-paper auto-expand: when a fresh result set resolves to exactly one
  // bucket, open it ONCE. After that, the user's explicit collapse (set to
  // null via togglePaper) wins — do not snap it back open. We track which
  // result set we already auto-expanded for via a ref keyed on the lone bucket.
  const lastAutoExpandKeyRef = useRef<string | null>(null)

  const clearExpansion = useCallback(() => {
    setExpandedPaperKey(null)
    setDetailCache({})
    lastAutoExpandKeyRef.current = null
  }, [])

  const latestGroupById = useMemo(
    () => new Map(input.questionGroups.map((group) => [group.id, group])),
    [input.questionGroups],
  )

  // Aggregate hits → paper buckets. Hits keep the query/reason context, but
  // the card data itself must stay live so add-to-draft state can update in
  // the existing result list without forcing the teacher to search again.
  const paperResults = useMemo<PaperResult[]>(() => {
    if (state.kind !== 'results') return []
    return aggregatePaperResults(
      state.hits.map((hit) => ({
        ...hit,
        group: latestGroupById.get(hit.group.id) || hit.group,
      })),
    )
  }, [latestGroupById, state])

  useEffect(() => {
    if (paperResults.length === 1) {
      const onlyKey = paperResults[0].key
      if (lastAutoExpandKeyRef.current !== onlyKey) {
        lastAutoExpandKeyRef.current = onlyKey
        setExpandedPaperKey(onlyKey)
      }
      return
    }
    // Multi-bucket / empty → forget the auto-expand sentinel so a future
    // single-bucket search can auto-open again.
    lastAutoExpandKeyRef.current = null
  }, [paperResults])

  const togglePaper = useCallback((paperKey: string) => {
    // Toggle: if already expanded, collapse; otherwise switch to this one.
    // No fetch. No detail-cache touch. The paper expand renders directly from
    // the cards we already have.
    setExpandedPaperKey((current) => (current === paperKey ? null : paperKey))
  }, [])

  const runSearch = useCallback(
    async (rawIntent: string, pendingQuery: string | null) => {
      const trimmed = rawIntent.trim()
      if (!trimmed) {
        setState({ kind: 'empty' })
        clearExpansion()
        return
      }
      setState({ kind: 'loading', query: trimmed })
      clearExpansion()
      try {
        const search = input.searchOverride || runConciergeSearch
        const outcome: ConciergeSearchOutcome = await search({
          intent: trimmed,
          pendingQuery,
          questionGroups: input.questionGroups,
          apiKey: input.apiKey,
          serverKeyAvailable,
          dailyLimitExceeded,
          thinkingMode: input.thinkingMode ?? false,
        })
        if (outcome.kind === 'clarification') {
          setState({
            kind: 'clarification',
            question: outcome.clarificationQuestion,
            assistantMessage: outcome.assistantMessage,
            pendingQuery: outcome.query,
          })
          return
        }
        setState({
          kind: 'results',
          hits: outcome.hits,
          assistantMessage: outcome.assistantMessage,
          query: outcome.query,
          usedFallback: outcome.source === 'fallback',
          // cut m0-5-ai-daily-limit (C5): the notice bar needs the reason to keep
          // the daily-limit explanation visible even when the all-weak honest-degrade
          // line would otherwise replace it (see pickResultsNoticeLine).
          fallbackReason: outcome.source === 'fallback' ? outcome.fallbackReason : undefined,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[concierge] desk submit failed:', message)
        }
        setState({ kind: 'error', message, query: trimmed })
      }
    },
    [
      clearExpansion,
      input.apiKey,
      input.questionGroups,
      input.searchOverride,
      input.thinkingMode,
      serverKeyAvailable,
      dailyLimitExceeded,
    ],
  )

  const submit = useCallback(
    async (intentOverride?: string) => {
      const value = intentOverride !== undefined ? intentOverride : intent
      const pendingQuery = state.kind === 'clarification' ? state.pendingQuery : null
      // Cut ⑥: keep the query in the input after submit. Natural-language
      // retrieval is iterative — the teacher edits the same sentence to
      // narrow/refine, so clearing it on every submit threw away the exact
      // text they need to tweak.
      setIntent(value)
      await runSearch(value, pendingQuery)
    },
    [intent, runSearch, state],
  )

  const reset = useCallback(() => {
    setIntent('')
    setState({ kind: 'empty' })
    clearExpansion()
  }, [clearExpansion])

  const retrieval = useMemo<ConciergeRetrievalView>(
    () => ({
      intent,
      state,
      paperResults,
      expandedPaperKey,
      groupDetail: {
        cache: detailCache,
      },
    }),
    [intent, state, paperResults, expandedPaperKey, detailCache],
  )

  const actions = useMemo<ConciergeRetrievalActions>(
    () => ({
      setIntent,
      submit,
      togglePaper,
      retryGroupDetail,
      reset,
    }),
    [setIntent, submit, togglePaper, retryGroupDetail, reset],
  )

  return {
    retrieval,
    actions,
  }
}
