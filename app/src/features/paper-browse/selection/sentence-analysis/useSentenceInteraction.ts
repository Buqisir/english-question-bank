import { useEffect, useReducer, useRef } from 'react'
import type { SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { restoreLayout } from '../../../../../../shared/sentence-analysis/derive.mjs'
import { canEscape, initialInteraction, interactionView, reduceInteraction } from './sentenceInteraction'
import type { SentenceAction } from './sentenceInteraction'

const LEAVE_MS = 120

// Restored pieces close in step with the move itself (AnnotatedSentence), so
// only sentence words that the next layout drops need a leave phase.
function dropsWords(analysis: SentenceAnalysisV1, from: string | null, to: string | null) {
  const next = new Set(restoreLayout(analysis, to).flatMap(item => (item.kind === 'token' ? [item.index] : [])))
  return restoreLayout(analysis, from).some(item => item.kind === 'token' && !next.has(item.index))
}

export function useSentenceInteraction(analysis: SentenceAnalysisV1 | null) {
  const [state, dispatch] = useReducer((current, action: SentenceAction) => reduceInteraction(current, action, analysis), undefined, initialInteraction)
  const leaveTimer = useRef(0)
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  const send = (action: SentenceAction) => {
    // Pointer/keyboard paint changes do not interrupt an in-flight restore.
    if (action.type !== 'keyboard' && action.type !== 'logical-subject') window.clearTimeout(leaveTimer.current)
    dispatch(action)
  }
  const toggleRestore = (id: string | undefined) => {
    if (!id) return
    const to = state.restored === id ? null : id
    // The leave phase only fades out words the next layout drops; otherwise it
    // would just be a pause before the move.
    const immediate = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      || analysis?.restores.find(item => item.id === id)?.kind === 'antecedent'
      || (analysis ? !dropsWords(analysis, state.restored, to) : false)
    if (immediate) send({ type: 'restore-finish', to })
    else {
      send({ type: 'restore-start', to })
      leaveTimer.current = window.setTimeout(() => dispatch({ type: 'restore-finish', to }), LEAVE_MS)
    }
  }
  const escape = () => {
    if (!canEscape(state)) return false
    send({ type: 'escape' })
    return true
  }
  return { state, ...interactionView(state), send, toggleRestore, escape }
}
