import { coverage } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { SentenceAnalysisV1, Unit } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { capsuleGroupMembers, capsuleLabel } from './sentencePresentation.ts'

export type CapsuleGroup = {
  kind: 'plain' | 'nested' | 'parallel' | 'member'
  units: Unit[]
  persistent: boolean
  sharedLabel?: string
  numbers?: string[]
}

export const firstToken = (unit: Unit) => Math.min(...unit.spans.map(span => span.start))
const NUMBERS = ['①', '②', '③', '④', '⑤', '⑥']

/** Grammar determines the groups; selection never changes their membership. */
export function capsuleGroups(analysis: SentenceAnalysisV1, units: Unit[], scopeId: string | null) {
  const byId = new Map(analysis.units.map(unit => [unit.id, unit]))
  const visible = new Set(units.map(unit => unit.id))
  const anchors = new Map<string, number>()
  const at = new Map<number, CapsuleGroup[]>()
  const add = (index: number, group: CapsuleGroup) => at.set(index, [...(at.get(index) || []), group])
  const consumed = new Set<string>()
  const inside = (inner: Unit, outer: Unit) => {
    const visited = new Set<string>()
    let parent = inner.parentId
    while (parent && !visited.has(parent)) {
      if (parent === outer.id) return true
      visited.add(parent)
      parent = byId.get(parent)?.parentId || null
    }
    return false
  }
  const ordered = [...new Map(units.map(unit => [unit.id, unit])).values()].sort((a, b) =>
    firstToken(a) - firstToken(b) || (inside(b, a) ? -1 : inside(a, b) ? 1 : coverage(analysis, b.id).size - coverage(analysis, a.id).size))
  const sharedLabel = (unit: Unit) => capsuleLabel(analysis, unit, true)
    .replace(/^并列/, '').replace(/[①②③④⑤⑥]/g, '').replace(/\s+（/g, '（').trim()

  for (const unit of ordered) {
    if (consumed.has(unit.id)) continue
    const parent = byId.get(unit.parentId || '')
    const siblings = parent ? capsuleGroupMembers(analysis, parent) : []
    // Do not group a partial coordination or blur different semantic labels.
    if (siblings[0]?.id !== unit.id || siblings.length > NUMBERS.length
      || siblings.some(member => !visible.has(member.id) || member.id === scopeId
        || sharedLabel(member) !== sharedLabel(unit))) continue
    const start = firstToken(unit)
    add(start, { kind: 'parallel', units: siblings, persistent: true,
      sharedLabel: sharedLabel(unit), numbers: NUMBERS.slice(0, siblings.length) })
    siblings.forEach((member, index) => {
      consumed.add(member.id)
      anchors.set(member.id, start)
      // A distant member retains an entry immediately above its own words.
      if (index) add(firstToken(member), { kind: 'member', units: [member], persistent: true, numbers: [NUMBERS[index]] })
    })
  }

  for (const unit of ordered) {
    if (consumed.has(unit.id)) continue
    const start = firstToken(unit)
    const chain = [unit]
    consumed.add(unit.id)
    for (const child of ordered) {
      if (chain.length === 3) break
      if (consumed.has(child.id) || firstToken(child) - start > 3 || firstToken(child) < start) continue
      // A chain, not siblings that merely happen to begin at the same word.
      if (!inside(child, chain.at(-1)!)) continue
      chain.push(child)
      consumed.add(child.id)
    }
    add(start, { kind: chain.length > 1 ? 'nested' : 'plain', units: chain, persistent: true })
    chain.forEach(member => anchors.set(member.id, start))
  }
  return { at, anchors }
}
