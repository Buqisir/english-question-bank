/**
 * useReadingAnalysisViewState — React glue for the Reading Analysis route.
 *
 * The pure decisions (route → initial state, fetch/selector outcomes →
 * derived state) live in `./readingAnalysisViewState.ts`. This hook owns:
 *
 *   1. Reading the route query once at mount.
 *   2. The `useState`/`useEffect` machinery and the cancelled-during-fetch
 *      guard.
 *   3. Calling `fetchQuestionGroupDetail` (services), `getReadingAnalysisSidecar`
 *      (sidecar module), and `selectReadingAnalysisFromDetail` (selector).
 *   4. Handing the results to `deriveReadingAnalysisViewState` and stashing
 *      the result in component state.
 *
 * The hook returns `ReadingAnalysisViewState` directly — no `loading`,
 * `error`, `data` shape, no callbacks. The route component branches on
 * `phase` and renders accordingly.
 *
 * Why this is a separate hook (and not the route component's body):
 * isolating the data lifecycle keeps the route a thin renderer, makes the
 * pure state-shaping rules independently testable, and decouples the demo
 * fixture import from the test surface (the pure module never imports it).
 */

import { useEffect, useState } from 'react'
import { fetchQuestionGroupDetail } from '../../../services/questionGroups.ts'
import type { QuestionGroupDetail } from '../../../domain/questionBank.ts'
import {
  parseReadingAnalysisRoute,
  type ReadingAnalysisRouteMatch,
} from '../readingAnalysisRoute.ts'
import { READING_ANALYSIS_FIXTURE } from '../readingAnalysisFixture.ts'
import {
  selectReadingAnalysisFromDetail,
  type SelectReadingAnalysisInput,
} from '../selectors/selectReadingAnalysis.ts'
import { getReadingAnalysisSidecar } from '../sidecar/readingAnalysisSidecar.ts'
import {
  deriveReadingAnalysisViewState,
  getInitialReadingAnalysisViewState,
  type ReadingAnalysisFetchOutcome,
  type ReadingAnalysisRouteQuery,
  type ReadingAnalysisViewState,
} from './readingAnalysisViewState.ts'

/**
 * Read the current `window.location` and project it into the small query
 * shape the view state cares about. SSR-safe: returns a demo-alias query
 * when there is no `window`.
 */
function readRouteQuery(): ReadingAnalysisRouteQuery {
  if (typeof window === 'undefined') {
    return { source: 'view-param', groupId: null, questionNo: null }
  }
  const match: ReadingAnalysisRouteMatch = parseReadingAnalysisRoute(
    window.location,
  )
  if (match.kind !== 'reading-analysis') {
    // The router only mounts this hook for `kind === 'reading-analysis'`.
    // If we somehow got here without a match (e.g. someone imported the
    // hook directly), default to demo-alias / no group so the phone-box
    // fixture renders rather than a blank screen.
    return { source: 'demo-alias', groupId: null, questionNo: null }
  }
  return {
    source: match.source,
    groupId: match.groupId,
    questionNo: match.questionNo,
  }
}

export function useReadingAnalysisViewState(): ReadingAnalysisViewState {
  // Resolve URL once. Lazy state init keeps StrictMode's double-invoke safe
  // and is the same pattern the inline route used.
  const [query] = useState<ReadingAnalysisRouteQuery>(() => readRouteQuery())
  const [state, setState] = useState<ReadingAnalysisViewState>(() =>
    getInitialReadingAnalysisViewState({
      query,
      demoFixture: READING_ANALYSIS_FIXTURE,
    }),
  )

  useEffect(() => {
    if (!query.groupId) return
    let cancelled = false

    ;(async () => {
      // 1. Fetch the question-group detail. We type the local outcome on
      // the full `QuestionGroupDetail` so that when we hand
      // `fetchOutcome.detail` to `selectReadingAnalysisFromDetail` below
      // — which requires the full type — TypeScript sees the right shape
      // rather than the structural `ReadingAnalysisDetailLike` the pure
      // module reads.
      let fetchOutcome: ReadingAnalysisFetchOutcome<QuestionGroupDetail>
      try {
        const detail = await fetchQuestionGroupDetail(query.groupId!)
        if (cancelled) return
        if (!detail) {
          fetchOutcome = { kind: 'missing' }
        } else {
          fetchOutcome = { kind: 'ok', detail }
        }
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        fetchOutcome = { kind: 'error', message }
      }

      // 2. Run the selector (only when we actually have a detail).
      let selectorResult: ReturnType<
        typeof selectReadingAnalysisFromDetail
      > | null = null
      if (fetchOutcome.kind === 'ok') {
        const sidecar = getReadingAnalysisSidecar(query.groupId!)
        // Only pass `questionNo` to the selector when the URL provided
        // one, so the selector falls back to the first question naturally.
        const selectorInput: SelectReadingAnalysisInput =
          query.questionNo === null
            ? { detail: fetchOutcome.detail, sidecar }
            : {
                detail: fetchOutcome.detail,
                sidecar,
                questionNo: query.questionNo,
              }
        selectorResult = selectReadingAnalysisFromDetail(selectorInput)
      }

      if (cancelled) return

      // 3. Hand off to the pure state-shaping function.
      setState(
        deriveReadingAnalysisViewState({
          query,
          fetchOutcome,
          selectorResult,
        }),
      )
    })()

    return () => {
      cancelled = true
    }
  }, [query])

  return state
}
