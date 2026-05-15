/**
 * useConciergeDesk — owns the AI取题台 search state at App level so it survives
 * detail / preview round-trips. Mounting/unmounting ConciergeDesk no longer
 * loses intent / results / clarification / pendingQuery.
 *
 * State is purely in-memory; per spec we do NOT persist results to localStorage.
 */

import { useCallback, useState } from 'react'
import type { QuestionGroupCard } from '../domain/questionBank.ts'
import {
  buildSimilarIntent,
  runConciergeSearch,
  type ConciergeSearchHit,
  type ConciergeSearchOutcome,
} from './conciergeSearch.ts'

export type ConciergeDeskState =
  | { kind: 'empty' }
  | { kind: 'loading'; query: string }
  | { kind: 'results'; hits: ConciergeSearchHit[]; assistantMessage: string; query: string; usedFallback: boolean }
  | { kind: 'clarification'; question: string; assistantMessage: string; pendingQuery: string }
  | { kind: 'error'; message: string; query: string }

export type UseConciergeDeskInput = {
  questionGroups: QuestionGroupCard[]
  apiKey: string
  /** Test seam — replace network call. */
  searchOverride?: typeof runConciergeSearch
}

export type UseConciergeDeskResult = {
  intent: string
  setIntent: (value: string) => void
  state: ConciergeDeskState
  submit: (intentOverride?: string) => Promise<void>
  triggerSimilar: (group: QuestionGroupCard) => Promise<void>
  reset: () => void
}

export function useConciergeDesk(input: UseConciergeDeskInput): UseConciergeDeskResult {
  const [intent, setIntent] = useState('')
  const [state, setState] = useState<ConciergeDeskState>({ kind: 'empty' })

  const runSearch = useCallback(
    async (rawIntent: string, pendingQuery: string | null) => {
      const trimmed = rawIntent.trim()
      if (!trimmed) {
        setState({ kind: 'empty' })
        return
      }
      setState({ kind: 'loading', query: trimmed })
      try {
        const search = input.searchOverride || runConciergeSearch
        const outcome: ConciergeSearchOutcome = await search({
          intent: trimmed,
          pendingQuery,
          questionGroups: input.questionGroups,
          apiKey: input.apiKey,
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
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[concierge] desk submit failed:', message)
        }
        setState({ kind: 'error', message, query: trimmed })
      }
    },
    [input.apiKey, input.questionGroups, input.searchOverride],
  )

  const submit = useCallback(
    async (intentOverride?: string) => {
      const value = (intentOverride !== undefined ? intentOverride : intent)
      const pendingQuery = state.kind === 'clarification' ? state.pendingQuery : null
      await runSearch(value, pendingQuery)
      setIntent('')
    },
    [intent, runSearch, state],
  )

  const triggerSimilar = useCallback(
    async (group: QuestionGroupCard) => {
      const similarIntent = buildSimilarIntent(group)
      setIntent('')
      await runSearch(similarIntent, null)
    },
    [runSearch],
  )

  const reset = useCallback(() => {
    setIntent('')
    setState({ kind: 'empty' })
  }, [])

  return { intent, setIntent, state, submit, triggerSimilar, reset }
}
