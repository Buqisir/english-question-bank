export type PaperSurfaceHostStructureTarget = {
  paperSection: string
  mode: 'passage' | 'paragraph'
  paragraphId?: string
}

export type PaperSurfaceHostInteractionState = {
  activeQuestionId: string | null
  activeEvidenceId: string | null
  activeOptionLabel: string | null
  activeInsightSection: string | null
  activeStructureTarget: PaperSurfaceHostStructureTarget | null
  railLocked: boolean
  isStackedMode: boolean
  isWideDesktop: boolean
}

export type PaperSurfaceHostInteractionAction =
  | {
      type: 'request-lecture-focus'
      questionId: string
      optionLabel?: string | null
      evidenceId?: string | null
    }
  | { type: 'seed-support-evidence'; evidenceId: string | null }
  | { type: 'seed-option-evidence'; optionLabel: string | null; evidenceId: string | null }
  | { type: 'select-option-evidence'; optionLabel: string; evidenceId: string | null }
  | { type: 'select-evidence'; evidenceId: string }
  | { type: 'toggle-insight'; paperSection: string }
  | { type: 'close-insight' }
  | {
      type: 'toggle-structure-target'
      paperSection: string
      mode: 'passage' | 'paragraph'
      paragraphId?: string
    }
  | { type: 'toggle-rail-lock' }
  | { type: 'rail-escape' }
  | { type: 'sync-viewport'; isStackedMode: boolean; isWideDesktop: boolean }
  | { type: 'resize' }

export const paperSurfaceHostInitialState: PaperSurfaceHostInteractionState = {
  activeQuestionId: null,
  activeEvidenceId: null,
  activeOptionLabel: null,
  activeInsightSection: null,
  activeStructureTarget: null,
  railLocked: false,
  isStackedMode: false,
  isWideDesktop: false,
}

export function paperSurfaceHostInteractionReducer(
  state: PaperSurfaceHostInteractionState,
  action: PaperSurfaceHostInteractionAction,
): PaperSurfaceHostInteractionState {
  switch (action.type) {
    case 'request-lecture-focus': {
      const shouldClearLegacyFocus =
        state.activeQuestionId === action.questionId &&
        action.optionLabel === undefined &&
        action.evidenceId === undefined
      return {
        ...state,
        activeQuestionId: shouldClearLegacyFocus ? null : action.questionId,
        activeEvidenceId: shouldClearLegacyFocus ? null : action.evidenceId ?? null,
        activeOptionLabel: shouldClearLegacyFocus ? null : action.optionLabel ?? null,
        activeInsightSection: null,
        railLocked: false,
      }
    }
    case 'seed-support-evidence': {
      return {
        ...state,
        activeEvidenceId: action.evidenceId,
      }
    }
    case 'seed-option-evidence': {
      return {
        ...state,
        activeOptionLabel: action.optionLabel,
        activeEvidenceId: action.evidenceId,
      }
    }
    case 'select-option-evidence': {
      return {
        ...state,
        activeOptionLabel: action.optionLabel,
        activeEvidenceId: action.evidenceId,
      }
    }
    case 'select-evidence': {
      if (!action.evidenceId) return state
      return {
        ...state,
        activeEvidenceId: action.evidenceId,
      }
    }
    case 'toggle-insight': {
      return {
        ...state,
        activeInsightSection:
          state.activeInsightSection === action.paperSection ? null : action.paperSection,
        activeStructureTarget: null,
      }
    }
    case 'close-insight': {
      return {
        ...state,
        activeInsightSection: null,
        activeStructureTarget: null,
      }
    }
    case 'toggle-structure-target': {
      const prev = state.activeStructureTarget
      if (
        prev &&
        prev.paperSection === action.paperSection &&
        prev.mode === action.mode &&
        (action.mode === 'passage' || prev.paragraphId === action.paragraphId)
      ) {
        return {
          ...state,
          activeStructureTarget: null,
        }
      }
      return {
        ...state,
        activeStructureTarget: {
          paperSection: action.paperSection,
          mode: action.mode,
          paragraphId: action.paragraphId,
        },
      }
    }
    case 'toggle-rail-lock': {
      return {
        ...state,
        railLocked: !state.railLocked,
      }
    }
    case 'rail-escape': {
      if (state.activeInsightSection) {
        return {
          ...state,
          activeInsightSection: null,
          activeStructureTarget: null,
        }
      }
      if (state.railLocked) {
        return {
          ...state,
          railLocked: false,
        }
      }
      return state
    }
    case 'sync-viewport': {
      return {
        ...state,
        isStackedMode: action.isStackedMode,
        isWideDesktop: action.isWideDesktop,
        activeInsightSection: null,
        railLocked: false,
        activeStructureTarget: null,
      }
    }
    case 'resize': {
      return {
        ...state,
        activeStructureTarget: null,
      }
    }
    default: {
      return state
    }
  }
}
