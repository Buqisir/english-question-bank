import type { PaperSurfaceFocusIntent } from '../../../../shared/papersurface/types'

type LectureFocusArbitration =
  | { action: 'apply' }
  | { action: 'suppress' }
  | { action: 'defer'; waitMs: number }

type PaperBrowseFocusIntentActions = {
  groupId: string
  intent: PaperSurfaceFocusIntent
  suppressScrollspyClear: (durationMs?: number) => void
  activateGroup: (groupId: string) => void
  selectLectureQuestion: (groupId: string, questionId: string) => void
  arbitrateLectureFocus?: () => LectureFocusArbitration
  scheduleDeferredLectureFocus?: (waitMs: number, apply: () => void) => void
}

/**
 * Public behavior seam for PaperSurface focus requests. The scrollspy guard
 * and authoritative group must be committed before the selection because
 * clicking a paper control can move the viewport and schedule a stale
 * IntersectionObserver update.
 *
 * Selection translation may suppress or defer this seam so drag-select and
 * double-click do not fire lecture side effects before the browser selection
 * exists.
 */
export function applyPaperSurfaceFocusIntent(
  actions: PaperBrowseFocusIntentActions,
): boolean {
  if (actions.intent.kind !== 'request-lecture-focus') return false
  const decision = actions.arbitrateLectureFocus?.() ?? { action: 'apply' }
  if (decision.action === 'suppress') return false
  if (decision.action === 'defer') {
    actions.scheduleDeferredLectureFocus?.(decision.waitMs, () => {
      applyPaperSurfaceFocusIntent({
        ...actions,
        arbitrateLectureFocus: undefined,
        scheduleDeferredLectureFocus: undefined,
      })
    })
    return false
  }
  actions.suppressScrollspyClear()
  actions.activateGroup(actions.groupId)
  actions.selectLectureQuestion(actions.groupId, actions.intent.questionId)
  return true
}
