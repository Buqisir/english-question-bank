import { coverage, mainFocus, trunkTokenIndexes, connectorParts, unitPartnerId, voiceLine } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { Difficulty, FocusState, SentenceAnalysisV1, Unit } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { connectorAt, hasPersistentLabel, readingUnitAt, lineRole, visibleRoleUnits, matchesGrammarFilter, outgoingRelations, relationDisplay, sentenceHit } from './sentencePresentation.ts'
import type { GrammarFilter, LineKind } from './underlines'
import { isLexicalObstacle } from '../../../../../../shared/sentence-analysis/enums.mjs'

export type TokenState = { state: 'focused' | 'related' | 'subject' | 'hover'; block: string }

const PUNCTUATION = /^[\p{P}\p{S}]+$/u

export function underlineOf(analysis: SentenceAnalysisV1, tokenIndex: number, activeUnits: Unit[], scopeId: string | null): { kind: LineKind; unitId: string; active?: true } | null {
  if (PUNCTUATION.test(analysis.tokens[tokenIndex].text) || connectorAt(analysis, tokenIndex)) return null
  const active = activeUnits.find(unit => coverage(analysis, unit.id).has(tokenIndex))
  if (active) {
    const kind = lineRole(active)
    if (kind) return { kind, unitId: active.id, active: true }
  }
  const unit = readingUnitAt(analysis, tokenIndex, scopeId)
  if (!unit || hasPersistentLabel(analysis, unit) && unit.role !== 'predicative') return null
  const kind = lineRole(unit)
  if (!kind) return null
  return { kind, unitId: unit.id }
}

export function tokenStates(analysis: SentenceAnalysisV1, focus: FocusState, hover: number | null, selectedRole: GrammarFilter | null, mainActive: boolean, scopeId: string | null, logicalSubjectActive: boolean, difficulty: Difficulty | null = null) {
  const states = new Map<number, TokenState>()
  const mark = (indexes: Iterable<number>, state: TokenState['state'], block: string) => {
    for (const index of indexes) {
      if (!states.has(index)) states.set(index, { state, block })
    }
  }
  if (focus.kind === 'main' && selectedRole) {
    for (const unit of visibleRoleUnits(analysis, scopeId).filter(item => matchesGrammarFilter(item, selectedRole))) mark(coverage(analysis, unit.id), 'focused', unit.id)
  } else if (focus.kind === 'main' && mainActive) {
    for (const unit of mainFocus(analysis).primary) mark(trunkTokenIndexes(analysis, unit), 'focused', unit.id)
  } else if (focus.kind === 'unit' && difficulty?.unitId === focus.unitId && isLexicalObstacle(difficulty.obstacle) && difficulty.highlightSpans) {
    for (const span of difficulty.highlightSpans) {
      mark(Array.from({ length: span.end - span.start }, (_, index) => span.start + index), 'focused', difficulty.id)
    }
  } else if (focus.kind === 'unit') {
    mark(coverage(analysis, focus.unitId), 'focused', focus.unitId)
    const connector = analysis.units.find(unit => unit.id === focus.unitId && unit.connector)
    if (connector) connectorParts(analysis, connector).forEach((indexes, index) => {
      mark(indexes, 'related', `${connector.id}-part-${index}`)
    })
    const outgoing = outgoingRelations(analysis, focus.unitId)
    const logicalRelations = outgoing.filter(relation => relation.kind === 'logical-subject')
    const logicalTargets = new Set(logicalRelations.flatMap(relation => relation.to))
    // Only the one partner the explanation is about and what the arrows
    // point at; other links (and units pointing at the selection) stay quiet.
    const partners = new Set(outgoing.filter(relation => relationDisplay(analysis, relation) === 'arrow').flatMap(relation => relation.to))
    const named = unitPartnerId(analysis, focus.unitId)
    if (named) partners.add(named)
    // A logical subject lights only through its own button, even when
    // another relation (a complement) points at the same words, unless the
    // voice line names it in place of that button.
    const voiced = voiceLine(analysis, focus.unitId)?.targetId
    for (const id of partners) if (!logicalTargets.has(id) || id === voiced) mark(coverage(analysis, id), 'related', id)
    if (logicalSubjectActive) {
      for (const relation of logicalRelations.filter(item => item.certainty === 'certain')) {
        for (const id of relation.to) {
          // An explicit logical-subject selection wins even inside the selected compound.
          for (const index of coverage(analysis, id)) states.set(index, { state: 'subject', block: id })
        }
      }
    }
  }
  const hovered = hover == null ? null : sentenceHit(analysis, hover, scopeId)
  if (hovered) mark(coverage(analysis, hovered), 'hover', hovered)
  return states
}
