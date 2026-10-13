import { coverage as unitCoverage, unitText, unitDisplayLabel, connectorTarget, enclosesUnit } from '../../../../../../shared/sentence-analysis/derive.mjs'
import { isLayerForm, isLexicalObstacle, unitFormPart } from '../../../../../../shared/sentence-analysis/enums.mjs'
import type { Difficulty, SentenceAnalysisV1, Unit } from '../../../../../../shared/sentence-analysis/types.d.mts'
import type { GrammarFilter, LineKind } from './underlines'

// Every word of every repaint asks these per unit; an analysis object is never
// edited once loaded, so its answers can be kept for its lifetime.
const coverageCache = new WeakMap<SentenceAnalysisV1, Map<string, ReadonlySet<number>>>()
const scopeCache = new WeakMap<SentenceAnalysisV1, Map<string | null, Unit[]>>()

function coverage(analysis: SentenceAnalysisV1, unitId: string): ReadonlySet<number> {
  let byUnit = coverageCache.get(analysis)
  if (!byUnit) coverageCache.set(analysis, byUnit = new Map())
  let found = byUnit.get(unitId)
  if (!found) byUnit.set(unitId, found = unitCoverage(analysis, unitId))
  return found
}

export function connectorAt(analysis: SentenceAnalysisV1, index: number) {
  return analysis.units.find(unit => unit.connector && coverage(analysis, unit.id).has(index)) || null
}

export { connectorTarget } from '../../../../../../shared/sentence-analysis/derive.mjs'

export function sentenceHit(analysis: SentenceAnalysisV1, index: number, scopeId: string | null = null) {
  const connector = connectorAt(analysis, index)
  if (connector) {
    const target = connectorTarget(analysis, connector)
    if (selectableUnits(analysis, scopeId).some(unit => unit.id === target.id || unit.id === connector.id)) return target.id === scopeId ? connector.id : target.id
  }
  const unit = readingUnitAt(analysis, index, scopeId)
  if (unit?.role === 'nonfinite-verb') {
    const layer = analysis.units.find(item => item.id === unit.layerId)
    if (layer && hasPersistentLabel(analysis, layer)) {
      const parent = analysis.units.find(item => item.id === scopeId)
      return compoundCore(analysis, parent)?.id === layer.id ? parent!.id : layer.id
    }
  }
  return unit?.id || null
}

export function hasPersistentLabel(analysis: SentenceAnalysisV1, unit: Unit) {
  if (analysis.rootClauseIds.includes(unit.id)) return Boolean(unit.marks?.includes('explanatory'))
  if (unit.connector) return false
  // A coordinated appositive still names its segment ("heights, bears, and
  // ageing" explains "fears"); other coordinations stay quiet so plain
  // 并列 subjects and objects don't grow capsules.
  if (unit.form === 'coordination') return unit.role === 'appositive'
  if (unit.role === 'predicate' || unit.role === 'nonfinite-verb') return false
  if (unit.form === 'clause') return Boolean(unit.role)
  // A multi-word appositive renames what stands before it ("…, a choice that
  // …") and has no stroke of its own, so the capsule is its only mark.
  // A single-word one ("my friend Tom") is left to its parent capsule and to
  // selection; a badge on one word would be clutter.
  if (unit.role === 'appositive' && coverage(analysis, unit.id).size > 1) return true
  return isLayerForm(unit.form) || Boolean(unit.marks?.includes('explanatory'))
}

// Every clause and structure inside the reading scope keeps its own capsule,
// nested ones included, so none of them needs 看内部 to be found.
export function persistentLabelUnits(analysis: SentenceAnalysisV1, scopeId: string | null = null) {
  const found = new Map<string, Unit>()
  const visit = (id: string | null) => {
    for (const unit of layerLabelUnits(analysis, id)) {
      if (found.has(unit.id)) continue
      found.set(unit.id, unit)
      visit(unit.id)
    }
  }
  visit(scopeId)
  return [...found.values()]
}

function layerLabelUnits(analysis: SentenceAnalysisV1, scopeId: string | null) {
  const current = scopeUnits(analysis, scopeId)
  if (!scopeId) current.push(...analysis.units.filter(unit => analysis.rootClauseIds.includes(unit.id)))
  const entries = current.flatMap(unit => {
    const members = capsuleGroupMembers(analysis, unit)
    return members.length ? members : [unit]
  })
  return entries.filter(unit => hasPersistentLabel(analysis, unit))
}

// Units the reader can pick directly in this scope: the scope's own layer
// plus every nested structure that shows a capsule.
export function selectableUnits(analysis: SentenceAnalysisV1, scopeId: string | null = null) {
  return [...scopeUnits(analysis, scopeId), ...persistentLabelUnits(analysis, scopeId)]
}

// A same-role wrapper starting at its first member can repeat a coordination.
// Require sibling ranges and an explicit conjunction, not merely matching labels.
export function capsuleGroupMembers(analysis: SentenceAnalysisV1, parent: Unit) {
  const members = analysis.units.filter(item => item.parentId === parent.id && item.role === parent.role
    && hasPersistentLabel(analysis, item)).sort((a, b) => Math.min(...coverage(analysis, a.id)) - Math.min(...coverage(analysis, b.id)))
  if (members.length < 2 || !members.every(item => item.form === members[0].form)) return []
  if (parent.form === 'coordination') return members
  if (parent.form !== members[0].form || Math.min(...coverage(analysis, parent.id)) !== Math.min(...coverage(analysis, members[0].id))) return []
  for (let i = 1; i < members.length; i++) {
    const end = Math.max(...coverage(analysis, members[i - 1].id))
    const start = Math.min(...coverage(analysis, members[i].id))
    if (end >= start || !analysis.tokens.slice(end + 1, start).some(token => /^(and|or)$/i.test(token.text))) return []
  }
  return members
}

// A capsule names the role only; the form (现在分词, with 复合结构) joins the
// explanation line once the unit is selected.
export function roleOnlyLabel(analysis: SentenceAnalysisV1, unit: Unit) {
  const label = unitDisplayLabel(analysis, unit)
  // A coordination usually advertises its 并列 members above the words; the
  // appositive capsule names the segment's role instead, like a plain
  // 同位语 word or clause.
  if (unit.form === 'coordination' && unit.role === 'appositive') return '同位语'
  const form = unitFormPart(unit)
  return form ? label.replace(`（${form}）`, '').replace(`${form}·`, '') : label
}

export function capsuleLabel(analysis: SentenceAnalysisV1, unit: Unit, expanded: boolean) {
  const full = roleOnlyLabel(analysis, unit)
  const parent = analysis.units.find(item => item.id === unit.parentId)
  if (!parent) return full
  const members = capsuleGroupMembers(analysis, parent)
  const index = members.findIndex(item => item.id === unit.id)
  if (index < 0) return full
  const number = ['①', '②', '③', '④', '⑤', '⑥'][index] || `(${index + 1})`
  if (index > 0 && !expanded) return number
  if (parent.form === 'coordination') return full
  return `并列${full.replace('（', ` ${number}（`)}`
}

// Collapse only a recorded compound wrapper and its single equivalent core.
// Nested infinitives with a different role or multiple members remain separate.
function compoundCore(analysis: SentenceAnalysisV1, parent: Unit | undefined) {
  if (!parent?.marks?.includes('infinitive-complex')) return null
  const children = analysis.units.filter(unit => unit.parentId === parent.id && unit.form === 'infinitive'
    && unit.role === parent.role)
  return children.length === 1 && [...coverage(analysis, children[0].id)].every(index => coverage(analysis, parent.id).has(index))
    ? children[0] : null
}

// The reading scope owns ordinary annotation, hit testing and legend membership.
export function scopeUnits(analysis: SentenceAnalysisV1, scopeId: string | null = null) {
  let byScope = scopeCache.get(analysis)
  if (!byScope) scopeCache.set(analysis, byScope = new Map())
  let found = byScope.get(scopeId)
  if (!found) byScope.set(scopeId, found = findScopeUnits(analysis, scopeId))
  return [...found]
}

function findScopeUnits(analysis: SentenceAnalysisV1, scopeId: string | null) {
  const scope = analysis.units.find(unit => unit.id === scopeId)
  const indexes = scope ? coverage(analysis, scope.id) : null
  const core = compoundCore(analysis, scope)
  const layers = scope ? [isLayerForm(scope.form) ? scope.id : scope.layerId, ...(core ? [core.id] : [])] : analysis.rootClauseIds
  return analysis.units.filter(unit => unit.id !== scopeId && unit.id !== core?.id && !analysis.rootClauseIds.includes(unit.id)
    && layers.includes(unit.layerId || '')
    && (!indexes || [...coverage(analysis, unit.id)].every(index => indexes.has(index))))
}

export function readingUnitAt(analysis: SentenceAnalysisV1, index: number, scopeId: string | null = null) {
  const covering = scopeUnits(analysis, scopeId).filter(unit => !unit.connector && unit.role !== 'head'
    && coverage(analysis, unit.id).has(index))
  // A closed structural capsule owns its words; its internal strokes wait.
  return covering.filter(unit => isLayerForm(unit.form)).sort((a, b) => coverage(analysis, a.id).size - coverage(analysis, b.id).size)[0]
    || covering.sort((a, b) => coverage(analysis, b.id).size - coverage(analysis, a.id).size)[0] || null
}

export function visibleRoleUnits(analysis: SentenceAnalysisV1, scopeId: string | null = null) {
  const owners = new Set(analysis.tokens.map((_, index) => readingUnitAt(analysis, index, scopeId)?.id))
  return scopeUnits(analysis, scopeId).filter(unit => !unit.connector && (owners.has(unit.id) || hasPersistentLabel(analysis, unit)))
}

export function canEnterUnit(analysis: SentenceAnalysisV1, unitId: string) {
  return visibleRoleUnits(analysis, unitId).some(unit => !unit.connector
    && (lineRole(unit) !== null || hasPersistentLabel(analysis, unit)))
}

export type LegendRole = 'trunk' | 'object' | 'adverbial' | 'attributive' | 'complement'

export function legendRolesIn(units: Unit[]) {
  const roles = new Set<LegendRole>()
  for (const unit of units) {
    if (unit.role === 'subject' || unit.role === 'predicate') roles.add('trunk')
    const role = lineRole(unit)
    if (role === 'object' || role === 'adverbial' || role === 'attributive' || role === 'complement') roles.add(role)
  }
  return roles
}

// Legend items are chosen once per sentence, across every layer the reader can
// enter, so the legend's width (and the explanation slot beside it) never
// changes while the card is open.
export function sentenceLegendRoles(analysis: SentenceAnalysisV1) {
  const scopes = [null, ...analysis.units.filter(unit => canEnterUnit(analysis, unit.id)).map(unit => unit.id)]
  return legendRolesIn(scopes.flatMap(scopeId => visibleRoleUnits(analysis, scopeId)))
}

export function outgoingRelations(analysis: SentenceAnalysisV1, unitId: string) {
  const parent = analysis.units.find(unit => unit.id === unitId)
  const core = compoundCore(analysis, parent)
  const owners = new Set([unitId, ...(core ? [core.id] : [])])
  const origins = new Set([...owners, ...analysis.units.filter(unit => owners.has(unit.parentId || '')
    && (unit.connector || unit.role === 'nonfinite-verb')).map(unit => unit.id)])
  return analysis.relations.filter(relation => relation.kind !== 'subject-predicate'
    && origins.has(relation.from) && relation.to.length > 0)
}

// Attention rule: the only arrow is an attributive pointing at the noun it
// modifies (a relative word's reference is the same arrow). Every other link is
// answered by the partner highlight and the explanation line.
export type RelationDisplay = 'arrow' | 'hidden'

export function relationDisplay(analysis: SentenceAnalysisV1, relation: SentenceAnalysisV1['relations'][number]): RelationDisplay {
  if (relation.kind !== 'modifies' && relation.kind !== 'refers-to') return 'hidden'
  const origin = analysis.units.find(unit => unit.id === relation.from)
  const owner = origin && (origin.connector || origin.role === 'nonfinite-verb')
    ? analysis.units.find(unit => unit.id === origin.parentId) : origin
  if (owner?.role !== 'attributive') return 'hidden'
  return relation.to.some(target => enclosesUnit(analysis, target, owner.id)) ? 'hidden' : 'arrow'
}

export function relationFallback(analysis: SentenceAnalysisV1, kind: string, targetId: string) {
  const target = analysis.units.find(unit => unit.id === targetId)
  const labels: Record<string, string> = { 'logical-subject': '逻辑主语', 'modifies': '修饰', 'refers-to': '指代', 'complements': '补足', 'explains': '解释' }
  const label = labels[kind]
  if (!target || !label) return ''
  const words = unitText(analysis, target).split(/\s+/)
  const preview = words.length > 7 ? `${words.slice(0, 4).join(' ')} … ${words.slice(-2).join(' ')}` : words.join(' ')
  return `${label}：${preview}`
}

export const ROLE_LABELS: Record<GrammarFilter, string> = {
  trunk: '主语和谓语', subject: '主语', predicate: '谓语', object: '宾语／表语', adverbial: '状语', attributive: '定语', complement: '补语',
}

// Keep grammatical roles intact: predicatives remain 表语, not 主补/宾补.
export function lineRole(unit: Unit): LineKind | null {
  if (unit.connector || unit.role === 'nonfinite-verb') return null
  if (unit.role === 'indirect-object' || unit.role === 'predicative') return 'object'
  if (unit.role === 'subject-complement' || unit.role === 'object-complement') return 'complement'
  return unit.role && Object.hasOwn(ROLE_LABELS, unit.role) ? unit.role as LineKind : null
}


export function matchesGrammarFilter(unit: Unit, filter: GrammarFilter) {
  const role = lineRole(unit)
  return filter === 'trunk' ? role === 'subject' || role === 'predicate' : role === filter
}

// Difficulty flags shown in a reading scope. A word-level difficulty is about
// its words, not the unit it hangs on: inside an unopened structure it moves
// out to the nearest visible unit, keeping its own highlight.
export function visibleFlags(analysis: SentenceAnalysisV1, flags: Difficulty[], scopeId: string | null = null) {
  const ids = new Set(visibleRoleUnits(analysis, scopeId).map(unit => unit.id))
  const parents = new Map(analysis.units.map(unit => [unit.id, unit.parentId]))
  return flags.flatMap((flag) => {
    if (ids.has(flag.unitId)) return [flag]
    if (!isLexicalObstacle(flag.obstacle)) return []
    let id = parents.get(flag.unitId)
    for (let depth = 0; id && !ids.has(id) && depth < analysis.units.length; depth += 1) id = parents.get(id)
    return id && ids.has(id) ? [{ ...flag, unitId: id }] : []
  })
}
