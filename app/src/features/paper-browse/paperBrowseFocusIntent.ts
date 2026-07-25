import type { PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'

type PaperBrowseFocusIntentActions = {
  groupId: string
  intent: PaperSurfaceFocusIntent
  suppressScrollspyClear: (durationMs?: number) => void
  activateGroup: (groupId: string) => void
  selectLectureQuestion: (groupId: string, questionId: string) => void
}

export function shouldClearLectureSelectionForActiveGroup(input: {
  activeGroupId: string | null
  selectedGroupId: string
  selectedGroupVisible: boolean
}): boolean {
  return Boolean(
    input.activeGroupId
    && input.activeGroupId !== input.selectedGroupId
    && !input.selectedGroupVisible
  )
}

/**
 * Public behavior seam for PaperSurface focus requests. The scrollspy guard
 * and authoritative group must be committed before the selection because
 * clicking a paper control can move the viewport and schedule a stale
 * IntersectionObserver update.
 */
export function applyPaperSurfaceFocusIntent(
  actions: PaperBrowseFocusIntentActions,
): boolean {
  if (actions.intent.kind !== 'request-lecture-focus') return false
  actions.suppressScrollspyClear()
  actions.activateGroup(actions.groupId)
  actions.selectLectureQuestion(actions.groupId, actions.intent.questionId)
  return true
}
