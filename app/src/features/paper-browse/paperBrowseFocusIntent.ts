import type { PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'

type PaperBrowseFocusIntentActions = {
  groupId: string
  intent: PaperSurfaceFocusIntent
  suppressScrollspyClear: () => void
  selectLectureQuestion: (groupId: string, questionId: string) => void
}

/**
 * Public behavior seam for PaperSurface focus requests. The scrollspy guard
 * must be committed before the selection because clicking a paper control can
 * move the viewport and schedule a stale IntersectionObserver update.
 */
export function applyPaperSurfaceFocusIntent(
  actions: PaperBrowseFocusIntentActions,
): boolean {
  if (actions.intent.kind !== 'request-lecture-focus') return false
  actions.suppressScrollspyClear()
  actions.selectLectureQuestion(actions.groupId, actions.intent.questionId)
  return true
}
