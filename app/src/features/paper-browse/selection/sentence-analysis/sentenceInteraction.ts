import type { FocusState, SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import type { GrammarFilter } from './underlines'
import { hasPersistentLabel } from './sentencePresentation.ts'

type Selection =
  | { kind: 'none' }
  | { kind: 'main' }
  | { kind: 'role'; role: GrammarFilter }
  | { kind: 'unit'; unitId: string; flagId: string | null }

export type SentenceInteraction = {
  scopePath: string[]
  selection: Selection
  logicalSubjectActive: boolean
  restored: string | null
  pending: { to: string | null } | null
  keyboard: boolean
  locate: number
}

export type SentenceAction =
  | { type: 'reset' }
  | { type: 'select-unit'; unitId: string }
  | { type: 'select-flag'; unitId: string; flagId: string; step?: boolean }
  | { type: 'enter'; unitId: string }
  | { type: 'back' }
  | { type: 'path'; depth: number }
  | { type: 'main' }
  | { type: 'role'; role: GrammarFilter }
  | { type: 'move'; focus: FocusState }
  | { type: 'keyboard'; active: boolean }
  | { type: 'logical-subject' }
  | { type: 'restore-start'; to: string | null }
  | { type: 'restore-finish'; to: string | null }
  | { type: 'escape' }

export function initialInteraction(): SentenceInteraction {
  return { scopePath: [], selection: { kind: 'none' }, logicalSubjectActive: false,
    restored: null, pending: null, keyboard: false, locate: 0 }
}

function clearSelection(state: SentenceInteraction): SentenceInteraction {
  return { ...state, selection: { kind: 'none' }, logicalSubjectActive: false, restored: null, pending: null }
}

export function interactionView(state: SentenceInteraction) {
  const selected = state.selection
  const focus: FocusState = selected.kind === 'unit' ? { kind: 'unit', unitId: selected.unitId } : { kind: 'main' }
  const open = selected.kind !== 'unit' ? null : selected.flagId
    ? { kind: 'flag' as const, id: selected.flagId }
    : { kind: 'unit' as const, unitId: selected.unitId }
  return { ...state, scopeId: state.scopePath.at(-1) || null, focus, open,
    mainActive: selected.kind === 'main', selectedRole: selected.kind === 'role' ? selected.role : null }
}

export function canEscape(state: SentenceInteraction) {
  return state.scopePath.length > 0 || state.selection.kind !== 'none' || Boolean(state.restored || state.pending)
}

// All input routes share the same transitions. Presentation and geometry never
// mutate this state; selecting something always clears the previous inspection.
export function reduceInteraction(state: SentenceInteraction, action: SentenceAction, analysis: SentenceAnalysisV1 | null): SentenceInteraction {
  switch (action.type) {
    case 'reset': return clearSelection(state)
    case 'select-unit': {
      const same = state.selection.kind === 'unit' && state.selection.unitId === action.unitId && !state.selection.flagId
      return { ...clearSelection(state), selection: same ? { kind: 'none' }
        : { kind: 'unit', unitId: action.unitId, flagId: null } }
    }
    case 'select-flag': {
      const same = !action.step && state.selection.kind === 'unit' && state.selection.flagId === action.flagId
      return { ...clearSelection(state), keyboard: action.step ? false : state.keyboard,
        selection: same ? { kind: 'none' } : { kind: 'unit', unitId: action.unitId, flagId: action.flagId } }
    }
    case 'enter': {
      const next = clearSelection(state)
      if (state.scopePath.includes(action.unitId)) return next
      const chain: string[] = []
      let unit = analysis?.units.find(item => item.id === action.unitId)
      while (analysis && unit && unit.id !== state.scopePath.at(-1)) {
        if (unit.id === action.unitId || hasPersistentLabel(analysis, unit)) chain.unshift(unit.id)
        const parentId = unit.parentId
        unit = analysis.units.find(item => item.id === parentId)
      }
      return { ...next, scopePath: [...state.scopePath, ...(chain.length ? chain : [action.unitId])] }
    }
    case 'back': return { ...clearSelection(state), scopePath: state.scopePath.slice(0, -1) }
    case 'path': return { ...clearSelection(state), scopePath: state.scopePath.slice(0, action.depth) }
    case 'main': return { ...clearSelection(state), scopePath: [], selection: { kind: 'main' }, keyboard: false, locate: state.locate + 1 }
    case 'role': return { ...clearSelection(state), keyboard: false,
      selection: state.selection.kind === 'role' && state.selection.role === action.role
        ? { kind: 'none' } : { kind: 'role', role: action.role } }
    case 'move': return action.focus.kind === 'main'
      ? { ...clearSelection(state), scopePath: [], selection: { kind: 'main' } }
      : { ...clearSelection(state), selection: { kind: 'unit', unitId: action.focus.unitId, flagId: null } }
    case 'keyboard': return { ...state, keyboard: action.active }
    case 'logical-subject': return { ...state, logicalSubjectActive: !state.logicalSubjectActive }
    case 'restore-start': return { ...state, pending: { to: action.to } }
    case 'restore-finish': return { ...state, restored: action.to, pending: null }
    case 'escape': {
      const view = interactionView(state)
      if (state.scopePath.length && view.focus.kind === 'main' && !view.selectedRole && !view.open && !state.restored && !state.pending) {
        return { ...clearSelection(state), scopePath: state.scopePath.slice(0, -1) }
      }
      return canEscape(state) ? { ...clearSelection(state), keyboard: true } : state
    }
  }
}
