import { LIMITS, lineWidth } from './constants.mjs'
import {
  PRIMARY_ROLES,
  RESTORE_BUTTON_LABELS,
  RESTORE_KIND_LABELS,
  adverbialRoleLabel,
  clauseTitleLabel,
  connectorLabel,
  formLabel,
  isLayerForm,
  isLexicalObstacle,
  isNonfiniteForm,
  markLabel,
  obstacleLabel,
  roleLabel,
  senseLabel,
  unitChipLabel,
  unitTitleLabel,
} from './enums.mjs'
import { restoreDisplay } from './restore.mjs'

const CN_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩']

function indexUnits(analysis) {
  return new Map(analysis.units.map((unit) => [unit.id, unit]))
}

function firstToken(unit) {
  return unit.spans[0]?.start ?? 0
}

function byFirstToken(left, right) {
  return firstToken(left) - firstToken(right) || left.id.localeCompare(right.id)
}

export function coverage(analysis, unitId) {
  const unit = indexUnits(analysis).get(unitId)
  const covered = new Set()
  if (!unit) return covered
  for (const span of unit.spans) {
    for (let index = span.start; index < span.end; index += 1) covered.add(index)
  }
  return covered
}

function parentDepth(analysis, unitId) {
  const units = indexUnits(analysis)
  let depth = 0
  const seen = new Set([unitId])
  let current = units.get(unitId)
  while (current?.parentId) {
    if (seen.has(current.parentId)) break
    seen.add(current.parentId)
    depth += 1
    current = units.get(current.parentId)
  }
  return depth
}

export function tokenOwners(analysis) {
  const map = new Map()
  const ranked = analysis.units
    .map((unit) => ({
      id: unit.id,
      size: coverage(analysis, unit.id).size,
      depth: parentDepth(analysis, unit.id),
      tokens: coverage(analysis, unit.id),
    }))
    .sort((left, right) => left.size - right.size || right.depth - left.depth || left.id.localeCompare(right.id))
  for (const unit of ranked) {
    for (const token of unit.tokens) {
      const owners = map.get(token) || []
      owners.push(unit.id)
      map.set(token, owners)
    }
  }
  return map
}

export function hitTest(analysis, tokenIndex) {
  const owners = tokenOwners(analysis).get(tokenIndex) || []
  return owners.find((id) => !analysis.rootClauseIds.includes(id)) || null
}

export function textOfTokenIndexes(analysis, indexes) {
  const sorted = [...indexes].sort((left, right) => left - right)
  let text = ''
  sorted.forEach((tokenIndex, position) => {
    const token = analysis.tokens[tokenIndex]
    if (position > 0) {
      const previous = analysis.tokens[sorted[position - 1]]
      text += tokenIndex === sorted[position - 1] + 1
        ? analysis.source.sentenceText.slice(previous.end, token.start)
        : ' '
    }
    text += token.text
  })
  return text
}

export function unitText(analysis, unitOrId) {
  const unit = typeof unitOrId === 'string' ? indexUnits(analysis).get(unitOrId) : unitOrId
  if (!unit) return ''
  return textOfTokenIndexes(analysis, coverage(analysis, unit.id))
}

function isDescendant(analysis, unit, ancestorId) {
  const units = indexUnits(analysis)
  const seen = new Set()
  let current = unit
  while (current?.parentId) {
    if (seen.has(current.id)) return false
    seen.add(current.id)
    if (current.parentId === ancestorId) return true
    current = units.get(current.parentId)
  }
  return false
}

export function trunkTokenIndexes(analysis, unit) {
  const blocked = new Set()
  for (const other of analysis.units) {
    if (other.id === unit.id) continue
    if (!isDescendant(analysis, other, unit.id)) continue
    if (isLayerForm(other.form)) {
      for (const token of coverage(analysis, other.id)) blocked.add(token)
    }
  }
  return [...coverage(analysis, unit.id)].filter((token) => !blocked.has(token))
}

export function unitTrunkText(analysis, unitOrId) {
  const unit = typeof unitOrId === 'string' ? indexUnits(analysis).get(unitOrId) : unitOrId
  if (!unit) return ''
  return textOfTokenIndexes(analysis, trunkTokenIndexes(analysis, unit))
}

// A trunk unit hangs off the root clause, directly or through coordination.
// A preposition's object shares the root layer (phrases open no layer) but
// sits under its adverbial, so it is not part of the trunk.
export function primaryUnits(analysis) {
  const roots = new Set(analysis.rootClauseIds)
  const units = indexUnits(analysis)
  const onTrunk = (unit) => {
    let parent = units.get(unit.parentId)
    while (parent?.form === 'coordination') parent = units.get(parent.parentId)
    return Boolean(parent && roots.has(parent.id))
  }
  return analysis.units
    .filter((unit) => unit.layerId && roots.has(unit.layerId) && PRIMARY_ROLES.includes(unit.role) && unit.form !== 'coordination' && onTrunk(unit))
    .sort(byFirstToken)
}

function sameLayer(analysis, unit, role) {
  return analysis.units.filter((other) => other.id !== unit.id && other.layerId === unit.layerId && other.role === role)
}

// A connector's containing clause is not necessarily the structure it connects.
export function connectorTarget(analysis, connector) {
  const parent = indexUnits(analysis).get(connector.parentId)
  if (!parent) return connector
  const indexes = coverage(analysis, parent.id)
  if (![...coverage(analysis, connector.id)].every(index => indexes.has(index))) return connector
  if (connector.connector === 'coordinator') return parent.form === 'coordination' ? parent : connector
  if (parent.form !== 'clause' || analysis.rootClauseIds.includes(parent.id)
    || parent.marks?.includes('explanatory')) return connector
  const roles = {
    'relative-pronoun': ['attributive'], 'relative-adverb': ['attributive'],
    'conjunctive-pronoun': ['subject', 'object', 'predicative', 'appositive'],
    'conjunctive-adverb': ['subject', 'object', 'predicative', 'appositive'],
    subordinator: ['subject', 'object', 'predicative', 'appositive', 'adverbial'],
  }
  return roles[connector.connector]?.includes(parent.role) ? parent : connector
}

function isComparisonConnector(analysis, unit) {
  if (!/^(as|than)$/i.test(unitText(analysis, unit).trim()) || unit.connector !== 'subordinator') return false
  const indexes = [...coverage(analysis, unit.id)]
  return analysis.units.some(candidate => {
    const comparison = candidate.sense === 'comparison' || candidate.obstacles?.some(flag =>
      ['comparison', 'as-comparison', 'comparative', 'multiple-comparison', 'double-comparative'].includes(flag))
    return comparison && indexes.every(index => coverage(analysis, candidate.id).has(index))
  })
}

// Recover only explicit paired constructions within the recorded containing
// unit. These ranges are reading feedback, never invented grammatical units.
export function connectorParts(analysis, connector) {
  if (!connector?.connector || connectorTarget(analysis, connector).id !== connector.id) return []
  const parent = indexUnits(analysis).get(connector.parentId)
  if (!parent || parent.spans.length !== 1 || connector.spans.length !== 1) return []
  const { start, end } = parent.spans[0]
  const at = connector.spans[0].start
  const tokens = analysis.tokens
  const word = index => tokens[index]?.text.toLowerCase()
  const boundary = index => /^[,;:.!?—]$/.test(tokens[index]?.text || '')
  const range = (from, to) => {
    while (from < to && tokens[from].kind === 'punct') from++
    while (to > from && tokens[to - 1].kind === 'punct') to--
    return Array.from({ length: to - from }, (_, index) => from + index)
  }
  let rightEnd = at + 1
  while (rightEnd < end && !boundary(rightEnd)) rightEnd++
  if (connector.connector === 'coordinator' && word(at) === 'but') {
    let left = at - 1
    // A comma immediately before 'but' belongs to the paired construction.
    if (word(left) === ',') left--
    while (left >= start && !boundary(left) && word(left) !== 'not') left--
    // 'not only ... but also' is additive, not corrective; a plain 'but'
    // falls through to the ordinary peer and clause rules below.
    if (word(left) === 'not' && word(left + 1) !== 'only' && word(at + 1) !== 'also') {
      const parts = [range(left + 1, at), range(at + 1, rightEnd)]
      if (parts.every(part => part.length)) return parts
    }
  }
  if (connector.connector === 'coordinator') {
    // Predicates on both sides mean whole clauses or predicates are joined;
    // matching the first peer alone would link just their subjects.
    const clauses = clauseParts(analysis, connector, parent, at)
    if (clauses) return clauses.map(([from, to]) => range(from, to))
    // Only link recorded peer constituents; never guess phrase boundaries from words.
    const peers = analysis.units.filter(unit => unit.id !== connector.id && !unit.connector
      && unit.layerId === connector.layerId && unit.role && unit.form !== 'coordination')
    const before = peers.filter(unit => unit.spans.every(span => span.end <= at))
      .sort((a, b) => Math.max(...b.spans.map(span => span.end)) - Math.max(...a.spans.map(span => span.end)))
    const after = peers.filter(unit => unit.spans.every(span => span.start > at))
      .sort(byFirstToken)
    const right = after[0]
    // both/either/neither open the pair, so both peers follow them.
    const left = right && (/^(both|either|neither)$/.test(word(at))
      ? after.find(unit => unit !== right && unit.role === right.role && unit.parentId === right.parentId)
      : before.find(unit => unit.role === right.role && unit.parentId === right.parentId))
    if (left && right) {
      const [a, b] = [left, right].sort(byFirstToken)
      const from = Math.max(...a.spans.map(span => span.end))
      const to = Math.min(...b.spans.map(span => span.start))
      // Between the two peers only the pair's own and/or/nor may appear.
      const paired = a !== left
      const clear = tokens.slice(from, to).every((token, offset) => from + offset === at
        || !/^[;:.!?—]$/.test(token.text) && (paired || !/^(and|or|but|yet|nor)$/i.test(token.text)))
      if (clear) return [[...coverage(analysis, a.id)], [...coverage(analysis, b.id)]]
    }
  }
  if (word(at) === 'as' && isComparisonConnector(analysis, connector)) {
    let first = at
    let second = at + 1
    while (second < rightEnd && word(second) !== 'as') second++
    if (second >= rightEnd) {
      second = at
      first = at - 1
      while (first >= start && !boundary(first) && word(first) !== 'as') first--
      if (first < start || word(first) !== 'as') return []
    }
    const parts = [range(first + 1, second), range(second + 1, rightEnd)]
    return parts.every(part => part.length) ? parts : []
  }
  return []
}

// A coordinator between two recorded predicates of one clause, when the model
// flattened both sides into that clause instead of wrapping them in a
// coordination. With a subject on each side it joins two clauses; with the
// right side subjectless it joins two predicates that share the subject.
// Boundaries come from those recorded units and the neighbouring
// coordinators, never from the words themselves.
function clauseParts(analysis, connector, parent, at) {
  if (parent.form !== 'clause') return null
  const first = (unit) => Math.min(...unit.spans.map(span => span.start))
  const last = (unit) => Math.max(...unit.spans.map(span => span.end))
  const children = analysis.units.filter(unit => unit.parentId === parent.id)
  const coordinators = children.filter(unit => unit.connector === 'coordinator' && unit.id !== connector.id && unit.spans.length === 1)
  const floor = Math.max(first(parent), ...coordinators.filter(unit => last(unit) <= at).map(last))
  const ceiling = Math.min(last(parent), ...coordinators.filter(unit => first(unit) > at).map(first))
  const members = children.filter(unit => !unit.connector && unit.role && first(unit) >= floor && last(unit) <= ceiling)
  const side = (role, onLeft) => members.filter(unit => unit.role === role && (onLeft ? last(unit) <= at : first(unit) > at))
  const leftPredicates = side('predicate', true)
  // The right side may be recorded as one nested clause rather than flat.
  const rightClause = members.filter(unit => unit.form === 'clause' && first(unit) > at).sort(byFirstToken)[0]
  const rightPredicate = side('predicate', false).sort(byFirstToken)[0]
  const opening = rightClause && (!rightPredicate || first(rightClause) < first(rightPredicate)) ? rightClause : null
  if (!leftPredicates.length || !(rightPredicate || opening)) return null
  const rightSubject = Boolean(opening) || side('subject', false).some(unit => first(unit) < first(rightPredicate))
  const leftSubject = side('subject', true).length > 0
  if (rightSubject && !leftSubject) return null
  const leftStart = rightSubject
    ? Math.min(...members.filter(unit => last(unit) <= at).map(first))
    : Math.max(...leftPredicates.map(first))
  return [[leftStart, at], [at + 1, ceiling]]
}

const LEAD_WORDS = new Set(['not', 'to', 'the', 'a', 'an', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'as', 'that', 'and', 'or', 'but'])

// Clicking a coordinator highlights both parts in the sentence, so the
// explanation only names where each part starts.
function partStart(text) {
  const words = text.split(/\s+/)
  if (words.length <= 3) return text
  const keep = LEAD_WORDS.has(words[0].toLowerCase()) ? 2 : 1
  return `${words.slice(0, keep).join(' ')} …`
}

function connectorDescription(analysis, connector, brief = false) {
  const text = unitText(analysis, connector)
  const target = connectorTarget(analysis, connector)
  const ranges = connectorParts(analysis, connector)
  const parts = ranges.map(indexes => textOfTokenIndexes(analysis, indexes))
  if (parts.length === 2) {
    const [first, second] = brief ? parts.map(partStart) : parts
    return connector.connector === 'coordinator'
      ? (/^but$/i.test(text.trim()) && analysis.tokens[ranges[0][0] - 1]?.text.toLowerCase() === 'not'
        ? `不是 ${first}，而是 ${second}` : `${brief ? '' : '并列：'}${first} / ${second}`)
      : `as … as …：比较内容 ${parts[0]}；比较对象 ${parts[1]}`
  }
  // Without a recorded range the line stays empty: the title still names the
  // connector kind, and admitting a gap only reads as unfinished.
  if (connector.connector === 'coordinator') {
    return target.id === connector.id ? '' : `${text} 连接${unitDisplayLabel(analysis, target)}`
  }
  if (isComparisonConnector(analysis, connector)) return `${text} 用于比较结构`
  if (target.id === connector.id) return ''
  const lead = `${text} 引导${clauseTitleLabel(target)}`
  return connector.role ? `${lead}，在从句中作${roleLabel(connector.role)}` : lead
}

// The chip text above a unit: 系动词 and 直接宾语 come from the unit's
// neighbours, 并列宾语 ② from its coordination group.
export function unitDisplayLabel(analysis, unitOrId) {
  const unit = typeof unitOrId === 'string' ? indexUnits(analysis).get(unitOrId) : unitOrId
  if (!unit) return ''
  if (unit.connector) {
    const label = isComparisonConnector(analysis, unit) ? '比较标记' : connectorLabel(unit.connector)
    return unit.spans.length > 1 ? `成对${label}` : label
  }
  if (unit.form === 'coordination') return `并列${roleLabel(unit.role)}`
  const parent = unit.parentId ? indexUnits(analysis).get(unit.parentId) : null
  let label = unitChipLabel(unit)
  if (parent?.form === 'coordination' && parent.role === unit.role) {
    const members = analysis.units.filter((other) => other.parentId === parent.id && other.role === unit.role).sort(byFirstToken)
    const position = members.findIndex((other) => other.id === unit.id)
    label = `并列${label} ${CIRCLED[position] || position + 1}`
  } else if (unit.role === 'predicate' && sameLayer(analysis, unit, 'predicative').length > 0) {
    label = '系动词'
  } else if (unit.role === 'object' && unit.form !== 'clause' && sameLayer(analysis, unit, 'indirect-object').length > 0) {
    label = '直接宾语'
  }
  const marks = unit.marks || []
  if (marks.includes('direct-speech')) label = `${label}（${markLabel('direct-speech')}）`
  if (marks.includes('explanatory')) label = markLabel('explanatory')
  if (marks.includes('emphasized')) label = `${label}·${markLabel('emphasized')}`
  if (unit.role === 'predicate' && unit.obstacles?.includes('passive')) label = `${label}（被动）`
  return label
}

export function restoreSegments(analysis, restore) {
  return restoreDisplay(analysis.source.sentenceText, analysis.tokens, restore.segments)
}

export function restoreText(analysis, restore) {
  return restoreSegments(analysis, restore).map((segment) => `${segment.spaceBefore ? ' ' : ''}${segment.text}`).join('')
}

function translationText(unit) {
  return (unit?.translationRanges || []).map((range) => range.quote).join('')
}

export function mainFocus(analysis) {
  const primary = primaryUnits(analysis)
  const primaryIds = new Set(primary.map((unit) => unit.id))
  const relations = analysis.relations.filter((relation) => (
    relation.kind === 'subject-predicate'
    && primaryIds.has(relation.from)
    && relation.to.every((id) => primaryIds.has(id))
  ))
  const tokens = new Set()
  for (const unit of primary) {
    for (const token of trunkTokenIndexes(analysis, unit)) tokens.add(token)
  }
  const trunkZh = primary.reduce((text, unit) => {
    if (text === null) return null
    const source = unit.role === 'object'
      ? analysis.units.find((child) => child.role === 'head' && child.parentId === unit.id) || null
      : unit
    const quote = translationText(source)
    if (!source || !quote) return null
    return text + quote
  }, '')
  return {
    primary,
    relations,
    trunkText: textOfTokenIndexes(analysis, tokens),
    trunkZh: trunkZh || null,
  }
}

function summaryBlocks(analysis) {
  const roots = new Set(analysis.rootClauseIds)
  const primaryIds = new Set(primaryUnits(analysis).map((unit) => unit.id))
  return analysis.units.filter((unit) => {
    if (primaryIds.has(unit.id)) return false
    const structural = unit.form === 'clause' || isNonfiniteForm(unit.form) || unit.role === 'adverbial'
    if (!structural) return false
    return (unit.layerId && roots.has(unit.layerId)) || (unit.parentId && primaryIds.has(unit.parentId))
  }).sort(byFirstToken)
}

function blockRelation(analysis, unit) {
  const relation = analysis.relations.find((item) => (
    item.from === unit.id && (item.kind === 'modifies' || item.kind === 'complements') && item.to.length > 0
  ))
  if (!relation) return null
  const target = indexUnits(analysis).get(relation.to[0])
  const text = unitTrunkText(analysis, target)
  if (relation.kind === 'complements') return { prefix: '补充 ', text, targetId: target.id }
  if (target.role === 'predicate') return { prefix: '说明 ', text, targetId: target.id }
  return { prefix: '修饰 ', text, targetId: target.id }
}

function containedStructures(analysis, unit) {
  return analysis.units
    .filter((child) => child.parentId === unit.id && (child.form === 'clause' || isNonfiniteForm(child.form)))
    .sort(byFirstToken)
}

export function structureSummarySegments(analysis) {
  const focus = mainFocus(analysis)
  const segments = [
    { text: '主干：', unitId: null, lang: 'zh' },
    { text: focus.trunkText, unitId: null, lang: 'en' },
  ]
  if (focus.trunkZh) {
    segments.push(
      { text: '（', unitId: null, lang: 'zh' },
      { text: focus.trunkZh, unitId: null, lang: 'zh' },
      { text: '）', unitId: null, lang: 'zh' },
    )
  }
  for (const block of summaryBlocks(analysis)) {
    segments.push({ text: '｜', unitId: null, lang: 'sep' })
    const relation = blockRelation(analysis, block)
    const label = unitChipLabel(block)
    if (!relation) {
      segments.push({ text: label, unitId: block.id, lang: 'zh' })
    } else {
      const head = label.endsWith('）') ? `${label}${relation.prefix}` : `${label} ${relation.prefix}`
      segments.push({ text: head, unitId: block.id, lang: 'zh' })
      segments.push({ text: relation.text, unitId: block.id, lang: 'en' })
    }
    const children = containedStructures(analysis, block)
    if (children.length > 0) {
      segments.push({ text: '，内含', unitId: block.id, lang: 'zh' })
      children.forEach((child, index) => {
        if (index > 0) segments.push({ text: '、', unitId: null, lang: 'sep' })
        segments.push({ text: unitChipLabel(child), unitId: child.id, lang: 'zh' })
      })
    }
  }
  return segments
}

export function structureSummary(analysis) {
  return structureSummarySegments(analysis).map((segment) => segment.text).join('')
}

export function layerLabel(analysis, unit) {
  if (!unit.layerId || analysis.rootClauseIds.includes(unit.layerId)) return '主句'
  const layer = indexUnits(analysis).get(unit.layerId)
  if (!layer) return '主句'
  if (layer.form === 'clause') return `${clauseTitleLabel(layer)}内`
  if (isLayerForm(layer.form)) return `${unitTitleLabel(layer)}内`
  return '主句'
}

export function focusView(analysis, unitId) {
  const units = indexUnits(analysis)
  const focused = units.get(unitId)
  const relations = analysis.relations.filter((relation) => relation.from === unitId || relation.to.includes(unitId))
  const relatedIds = new Set()
  for (const relation of relations) {
    if (relation.from !== unitId) relatedIds.add(relation.from)
    for (const id of relation.to) if (id !== unitId) relatedIds.add(id)
  }
  return {
    focused,
    related: analysis.units.filter((unit) => relatedIds.has(unit.id)),
    relations,
    connectorOf: focused?.form === 'clause'
      ? analysis.units.find((unit) => unit.connector && connectorTarget(analysis, unit).id === unitId) || null
      : null,
    layerLabel: focused ? layerLabel(analysis, focused) : '主句',
  }
}

export function siblings(analysis, unitId) {
  const unit = indexUnits(analysis).get(unitId)
  if (!unit) return []
  return analysis.units.filter((item) => item.parentId === unit.parentId).sort(byFirstToken)
}

export function next(analysis, unitId) {
  const list = siblings(analysis, unitId)
  const index = list.findIndex((unit) => unit.id === unitId)
  return index >= 0 && index < list.length - 1 ? list[index + 1].id : null
}

export function prev(analysis, unitId) {
  const list = siblings(analysis, unitId)
  const index = list.findIndex((unit) => unit.id === unitId)
  return index > 0 ? list[index - 1].id : null
}

export function parentOf(analysis, unitId) {
  const units = indexUnits(analysis)
  const seen = new Set([unitId])
  let current = units.get(unitId)?.parentId || null
  while (current) {
    if (seen.has(current) || analysis.rootClauseIds.includes(current)) return 'main'
    seen.add(current)
    const parent = units.get(current)
    if (parent && isLayerForm(parent.form)) return current
    current = parent?.parentId || null
  }
  return 'main'
}

export function firstChild(analysis, unitId) {
  const children = analysis.units.filter((unit) => unit.parentId === unitId).sort(byFirstToken)
  return children[0]?.id || null
}

export function moveFocus(analysis, focus, key) {
  if (focus.kind === 'main') {
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      const child = firstChild(analysis, analysis.rootClauseIds[0])
      return child ? { kind: 'unit', unitId: child } : focus
    }
    return focus
  }
  const id = focus.unitId
  if (key === 'ArrowRight') {
    const idNext = next(analysis, id)
    return idNext ? { kind: 'unit', unitId: idNext } : focus
  }
  if (key === 'ArrowLeft') {
    const idPrev = prev(analysis, id)
    return idPrev ? { kind: 'unit', unitId: idPrev } : focus
  }
  if (key === 'ArrowUp') {
    const parent = parentOf(analysis, id)
    return parent === 'main' ? { kind: 'main' } : { kind: 'unit', unitId: parent }
  }
  if (key === 'ArrowDown') {
    const child = firstChild(analysis, id)
    return child ? { kind: 'unit', unitId: child } : focus
  }
  if (key === 'Home' || key === 'End') {
    const list = siblings(analysis, id)
    const target = key === 'Home' ? list[0] : list[list.length - 1]
    return target ? { kind: 'unit', unitId: target.id } : focus
  }
  return focus
}

function line(label, text, unitIds = []) {
  return { label, text, unitIds }
}

function counterparts(analysis, unit, relationKind, wantRole) {
  const found = []
  for (const relation of analysis.relations) {
    if (relation.kind !== relationKind) continue
    const ends = [relation.from, ...relation.to]
    if (!ends.includes(unit.id)) continue
    for (const id of ends) {
      if (id === unit.id) continue
      const other = indexUnits(analysis).get(id)
      if (!wantRole || other?.role === wantRole) found.push(other)
    }
  }
  return found.filter(Boolean)
}

function outgoing(analysis, unit, kind) {
  return analysis.relations.find((relation) => relation.kind === kind && relation.from === unit.id) || null
}

// A target that contains the unit itself ("…, which surprised everyone"
// pointing at its whole sentence) has no separate stretch to point at.
export function enclosesUnit(analysis, targetId, unitId) {
  const outer = coverage(analysis, targetId)
  const inner = coverage(analysis, unitId)
  return inner.size > 0 && [...inner].every(index => outer.has(index))
}

// A relative clause whose antecedent is not a noun (a phrase, or the whole
// sentence before it) is easily misread as modifying the nearest noun.
function unusualAntecedent(analysis, unit) {
  if (unit.role !== 'attributive' || unit.form !== 'clause') return ''
  const relation = outgoing(analysis, unit, 'modifies')
  if (relation?.to.length !== 1) return ''
  const target = indexUnits(analysis).get(relation.to[0])
  if (!target) return ''
  if (enclosesUnit(analysis, target.id, unit.id)) return '前面整句'
  return target.form === 'word' || target.form === 'phrase' ? '' : ` ${briefText(unitText(analysis, target))}`
}

function clauseRelationLabel(unit, target) {
  if (unit.role === 'appositive' || target?.role === 'predicate') return '说明'
  if (unit.role === 'adverbial' && target?.role === 'predicate') return '说明'
  const relation = unit.__relationKind
  if (relation === 'complements') return '补充说明'
  return '修饰'
}

function mainExplanation(analysis) {
  const lines = []
  const grouped = analysis.rootClauseIds.length > 1
  analysis.rootClauseIds.forEach((rootId, index) => {
    if (grouped) lines.push(line(`主句${CN_NUMERALS[index] || index + 1}`, '', [rootId]))
    const primary = primaryUnits(analysis).filter((unit) => unit.layerId === rootId)
    for (const role of PRIMARY_ROLES) {
      const units = primary.filter((unit) => unit.role === role)
      if (units.length === 0) continue
      lines.push(line(
        roleLabel(role),
        units.map((unit) => unitText(analysis, unit)).join('、'),
        units.map((unit) => unit.id),
      ))
    }
  })
  return {
    title: '主句',
    lines,
    obstacles: [],
    restores: [],
    uncertain: false,
  }
}

function unitExplanation(analysis, unitId) {
  const unit = indexUnits(analysis).get(unitId)
  const view = focusView(analysis, unitId)
  const lines = []
  if (unit.role === 'subject') {
    const predicates = counterparts(analysis, unit, 'subject-predicate', 'predicate')
    if (predicates.length > 0) {
      lines.push(line('对应谓语', predicates.map((item) => unitText(analysis, item)).join('、'), predicates.map((item) => item.id)))
    }
  } else if (unit.role === 'predicate') {
    const subjects = counterparts(analysis, unit, 'subject-predicate', 'subject')
    if (subjects.length > 0) {
      lines.push(line('对应主语', subjects.map((item) => unitText(analysis, item)).join('、'), subjects.map((item) => item.id)))
    }
  } else if (unit.role === 'head') {
    const modifiers = analysis.relations
      .filter((item) => (item.kind === 'modifies' || item.kind === 'complements') && item.to.includes(unit.id))
      .map((item) => item.from)
    if (modifiers.length > 0) {
      lines.push(line('被修饰', modifiers.map((id) => unitTrunkText(analysis, id)).join('、'), modifiers))
    }
  }

  if (unit.form === 'clause') {
    const relation = analysis.relations.find((item) => (
      item.from === unit.id && (item.kind === 'modifies' || item.kind === 'complements')
    ))
    if (relation?.to.length) {
      const target = indexUnits(analysis).get(relation.to[0])
      const label = relation.kind === 'complements'
        ? '补充说明'
        : clauseRelationLabel({ ...unit, __relationKind: relation.kind }, target)
      lines.push(line(label, relation.to.map((id) => unitTrunkText(analysis, id)).join('、'), relation.to))
    }
  }

  if (isNonfiniteForm(unit.form) && unit.role !== 'predicate') {
    lines.push(line('所作成分', adverbialRoleLabel(unit), []))
    const relation = analysis.relations.find((item) => (
      item.from === unit.id && (item.kind === 'modifies' || item.kind === 'complements')
    ))
    if (relation?.to.length) {
      lines.push(line('作用对象', relation.to.map((id) => unitText(analysis, id)).join('、'), relation.to))
    }
  }

  const connector = unit.connector ? unit : view.connectorOf
  const connected = connector ? connectorDescription(analysis, connector) : ''
  if (connected) lines.push(line('连接', connected, [connector.id]))

  const reference = outgoing(analysis, unit, 'refers-to')
  if (reference?.to.length) {
    lines.push(line('指代', reference.to.map((id) => unitTrunkText(analysis, id)).join('、'), reference.to))
  }

  const logical = outgoing(analysis, unit, 'logical-subject')
  if (logical?.to.length) {
    lines.push(line('逻辑主语', logical.to.map((id) => unitText(analysis, id)).join('、'), logical.to))
  }

  if (isNonfiniteForm(unit.form) && unit.role !== 'predicate') {
    lines.push(line('形式', `${formLabel(unit.form)}短语`, []))
  } else if (unit.form === 'clause') {
    const guide = view.connectorOf
    lines.push(line('形式', guide ? `从句，由 ${unitText(analysis, guide)} 引导` : '从句', guide ? [guide.id] : []))
  }

  return {
    title: `${unitTitleLabel(unit)} · ${view.layerLabel}`,
    lines,
    note: unit.noteZh,
    obstacles: (unit.obstacles || []).map(obstacleLabel),
    restores: analysis.restores
      .filter((restore) => restore.unitId === unit.id)
      .map((restore) => ({
        kindLabel: RESTORE_KIND_LABELS[restore.kind],
        segments: restoreSegments(analysis, restore),
      })),
    uncertain: view.relations.some((relation) => relation.certainty === 'uncertain'),
  }
}

export function explanation(analysis, focus) {
  if (!focus || focus.kind === 'main' || focus === 'main') return mainExplanation(analysis)
  return unitExplanation(analysis, focus.unitId || focus)
}

// One-line rules for the difficulty bubble. A model note wins for the types
// whose meaning depends on the sentence (collocations, negation, separation).
const DIFFICULTY_RULES = {
  fronting: '成分提到句首，读时放回原位',
  inversion: '谓语或助动词放到了主语前',
  'full-inversion': '整个谓语放到了主语前',
  'partial-inversion': '只把助动词提到主语前',
  cleft: '去掉 It is/was … that 后句子仍完整',
  ellipsis: '省略了上文已有或能推知的词',
  gapping: '省去了与前一分句相同的谓语',
  passive: '',
  subjunctive: '这里表达假设、愿望或要求，不能直接当作事实陈述',
  'subjunctive-present': '这里假设现在的情况有所不同，过去式不一定表示过去时间',
  'subjunctive-past': '这里假设过去发生了另一种情况，结果也可能不同',
  'subjunctive-future': '这里假设将来可能出现的情况，尚不能断定结果',
  parenthesis: '插在句中的补充，可以先跳过再读',
  'dummy-it': 'it 作形式主语，真正的主语在后面',
  'postponed-subject': '真正的主语，用 it 代替后放到后面',
  'dummy-object': 'it 作形式宾语，真正的宾语在后面',
  'postponed-object': '真正的宾语，用 it 代替后放到后面',
  split: '谓语被隔开，几段合起来才完整',
  separation: '被别的成分隔开，要连起来读',
  collocation: '',
  negation: '注意否定的范围',
  'partial-negation': '部分否定：并非都……',
  'total-negation': '全部否定：都不……',
  'double-negation': '双重否定表示肯定',
  'transferred-negation': '否定转移：意思上否定的是从句',
  'implied-negation': '形式肯定，意思否定',
  comparison: '比较结构',
  'as-comparison': 'as＋原级＋as：和……一样',
  comparative: '比较级＋than：比……更',
  'multiple-comparison': '倍数＋as…as / 倍数＋比较级＋than',
  'double-comparative': 'the＋比较级…，the＋比较级…：越……越……',
}

const NOTE_FIRST = new Set([
  'ellipsis', 'gapping', 'separation', 'collocation', 'idiom', 'metaphor', 'rare-sense', 'negation', 'partial-negation', 'total-negation',
  'double-negation', 'transferred-negation', 'implied-negation',
  'subjunctive', 'subjunctive-present', 'subjunctive-past', 'subjunctive-future',
  'comparison', 'as-comparison', 'comparative', 'multiple-comparison', 'double-comparative',
])

// Recognition is retained even when it does not warrant a standing badge.
// Basic constructions need a sentence-specific reason to become a reading obstacle.
const ON_DEMAND_OBSTACLES = new Set([
  'comparison', 'as-comparison', 'comparative', 'multiple-comparison', 'double-comparative',
  'ellipsis', 'passive', 'parenthesis', 'fronting', 'negation', 'total-negation',
])
const PRIORITY_OBSTACLES = new Set([
  'subjunctive', 'subjunctive-present', 'subjunctive-past', 'subjunctive-future',
  'inversion', 'full-inversion', 'partial-inversion', 'gapping', 'split', 'separation',
  'partial-negation', 'double-negation', 'transferred-negation', 'implied-negation',
])

function teachingAttention(unit, obstacle) {
  if (PRIORITY_OBSTACLES.has(obstacle)) return 'priority'
  if (unit.focusObstacles?.includes(obstacle) && unit.noteZh) return 'priority'
  return ON_DEMAND_OBSTACLES.has(obstacle) ? 'on-demand' : 'hint'
}

const RESTORE_FOR = {
  fronting: ['normal-order'],
  inversion: ['normal-order'],
  'full-inversion': ['normal-order'],
  'partial-inversion': ['normal-order'],
  split: ['normal-order'],
  cleft: ['normal-order'],
  ellipsis: ['ellipsis'],
  gapping: ['ellipsis'],
  'preposition-relative': ['antecedent'],
  'double-comparative': ['rewrite', 'normal-order'],
}

function fitsLine(text) {
  return lineWidth(text) <= LIMITS.noteLine
}

function ancestors(analysis, unit) {
  const units = indexUnits(analysis)
  const list = []
  const seen = new Set([unit.id])
  let current = unit.parentId ? units.get(unit.parentId) : null
  while (current && !seen.has(current.id)) {
    list.push(current)
    seen.add(current.id)
    current = current.parentId ? units.get(current.parentId) : null
  }
  return list
}

function quotedLayer(analysis, unit) {
  const layerId = unit.form === 'clause' ? unit.id : unit.layerId
  return analysis.units.some((other) => other.layerId === layerId && other.marks?.includes('direct-speech'))
}

// Older payloads can carry the same stock definition as a model note.
// Keep concrete explanations, but do not fill the detail area with a definition.
function meaningfulUnitNote(unit) {
  const note = unit.noteZh || ''
  if (unit.obstacles?.includes('passive')
    && /^(?:被动(?:语态)?[：:，,]?)?主语是动作的?承受者[。.!！]?$/.test(note.trim())) return ''
  return note
}

function difficultyRule(analysis, unit, obstacle) {
  if (obstacle === 'passive') return meaningfulUnitNote(unit)
  if (unit.noteZh && NOTE_FIRST.has(obstacle)) return unit.noteZh
  if (obstacle === 'full-inversion' && quotedLayer(analysis, unit)) return '直接引语之后，引述句常整体倒装'
  if (obstacle === 'preposition-relative') {
    const words = unitText(analysis, unit)
    const target = outgoing(analysis, unit, 'refers-to')?.to[0]
    const role = unit.role ? `，在从句中作${roleLabel(unit.role)}` : ''
    const full = target ? `${words.split(' ').at(-1)} 指 ${unitTrunkText(analysis, target)}${role}` : ''
    if (full && fitsLine(full)) return full
    return `${words} 整体引导从句${role}`
  }
  return DIFFICULTY_RULES[obstacle] || unit.noteZh || ''
}

function restoreFor(analysis, unit, kinds) {
  if (!kinds) return null
  const layerId = unit.form === 'clause' ? unit.id : unit.layerId
  const fits = (restore) => kinds.includes(restore.kind)
  return analysis.restores.find((restore) => restore.unitId === unit.id && fits(restore))
    || analysis.restores.find((restore) => restore.scopeId === layerId && fits(restore))
    || null
}

// All recognized teaching points, in reading order. A difficulty the
// enclosing unit already names (the ellipsis of "if implemented") is not repeated.
export function teachingPoints(analysis) {
  const items = []
  for (const unit of [...analysis.units].sort(byFirstToken)) {
    const inherited = new Set(ancestors(analysis, unit).flatMap((item) => item.obstacles || []))
    for (const obstacle of unit.obstacles || []) {
      const lexical = isLexicalObstacle(obstacle)
      if ((inherited.has(obstacle) && !lexical) || !obstacleLabel(obstacle)) continue
      // A generic badge without an actual explanation adds no teaching value.
      if (lexical && (!unit.noteZh || /^(固定搭配|习语|比喻|熟词生义)([，,]?整体理解(意思)?)?$/.test(unit.noteZh.trim()))) continue
      if (lexical && items.some(item => item.obstacle === obstacle
        && item.rule === unit.noteZh
        && JSON.stringify(item.highlightSpans) === JSON.stringify(unit.collocationSpans || unit.spans))) continue
      // A Chinese gloss is not an English parenthetical construction.
      const text = unitText(analysis, unit)
      if (obstacle === 'parenthesis' && /\p{Script=Han}/u.test(text) && !/[a-z]/i.test(text)) continue
      // Ordinary initial time/condition clauses do not need a fronting lesson.
      if (obstacle === 'fronting' && unit.role === 'adverbial' && unit.form === 'clause'
        && !analysis.units.some(item => item.layerId === unit.layerId && item.obstacles.some(value => value.includes('inversion')))) continue
      const restore = restoreFor(analysis, unit, RESTORE_FOR[obstacle])
      items.push({
        id: `${unit.id}:${obstacle}`,
        unitId: unit.id,
        obstacle,
        label: obstacleLabel(obstacle),
        rule: difficultyRule(analysis, unit, obstacle),
        attention: teachingAttention(unit, obstacle),
        ...(lexical ? { highlightSpans: unit.collocationSpans || unit.spans } : {}),
        restoreId: restore?.id || null,
      })
    }
  }
  return items
}

// Navigation visits comprehension obstacles first; labels remain anchored to
// their source words. The original order breaks ties within each priority.
export function difficulties(analysis) {
  return teachingPoints(analysis).filter(item => item.attention !== 'on-demand')
    .sort((a, b) => Number(b.attention === 'priority') - Number(a.attention === 'priority'))
}

function unitBody(analysis, unit) {
  // The bubble title already names the connector (并列连词), so the body skips 并列：.
  if (unit.connector) return connectorDescription(analysis, unit, true)
  const note = meaningfulUnitNote(unit)
  if (note && !/^位于.+(?:句|短语)(?:内|中)?[。.]?$/.test(note)) return note
  const text = unitText(analysis, unit)
  const marks = unit.marks || []
  // Only what the capsule, lines and lit partner cannot show; a textbook
  // definition that reads the same under every sentence stays out.
  if (marks.includes('infinitive-complex')) return 'for 后的词是不定式的逻辑主语'
  if (unit.form === 'perfect-participle') return '动作先于谓语动作'
  if (unit.role === 'cleft-frame') return '强调句框架，去掉后句子仍完整'
  if (unit.role === 'expletive') return 'there be 句型，真正的主语在 be 后'
  if (unit.form === 'clause') {
    const guide = analysis.units.find((item) => item.parentId === unit.id && item.connector)
    const words = guide ? unitText(analysis, guide) : ''
    const antecedent = unusualAntecedent(analysis, unit)
    if (guide?.role && antecedent) return `${words} 指代${antecedent}，在从句中作${roleLabel(guide.role)}`
    if (guide?.role) return `${words} 在从句中作${roleLabel(guide.role)}`
    if (words.toLowerCase() === 'that' && ['appositive', 'attributive'].includes(unit.role)) {
      return unit.role === 'appositive' ? 'that 在从句中不作成分 → 同位语从句' : 'that 在从句中作成分 → 定语从句'
    }
    if (guide) return ''
    if (unit.role === 'attributive') return '省略了关系词'
  }
  return ''
}

function briefText(text) {
  const words = text.split(/\s+/)
  return words.length > 7 ? `${words.slice(0, 4).join(' ')} … ${words.slice(-2).join(' ')}` : text
}

// One line built only from recorded units and relations; a missing neighbour
// gives no line rather than a guess. The neighbour it names is returned too,
// so the sentence can light exactly the word the line talks about.
// The same-layer unit of a role closest to this one, preferring the given
// side. A layer may hold two flattened clauses ("A joined me, and we decided
// B"), so the first match in the layer can belong to the other clause.
function nearest(analysis, unit, role, prefer) {
  const at = Math.min(...unit.spans.map(span => span.start))
  const end = Math.max(...unit.spans.map(span => span.end))
  const candidates = sameLayer(analysis, unit, role)
  const before = candidates.filter(other => Math.max(...other.spans.map(span => span.end)) <= at)
    .sort((a, b) => Math.max(...b.spans.map(span => span.end)) - Math.max(...a.spans.map(span => span.end)))
  const after = candidates.filter(other => Math.min(...other.spans.map(span => span.start)) >= end).sort(byFirstToken)
  return (prefer === 'before' ? before[0] || after[0] : after[0] || before[0]) || candidates[0] || null
}

function relationLine(analysis, unit) {
  const units = indexUnits(analysis)
  const target = (kind) => {
    const relation = outgoing(analysis, unit, kind)
    return relation?.to.length === 1 ? units.get(relation.to[0]) : null
  }
  const verb = () => nearest(analysis, unit, 'predicate', 'before') || nearest(analysis, unit, 'nonfinite-verb', 'before')
  const none = { text: '', targetId: null }
  if (unit.connector) return none
  let partner = null
  let say = () => ''
  // Whether the words are worth saying; the partner lights up either way.
  let worth = () => apart(analysis, unit, partner)
  if (unit.role === 'adverbial') {
    const named = target('modifies')
    partner = named || verb()
    // The title already carries the sense (时间状语); only an explicitly
    // recorded, non-adjacent target (PP attachment) adds anything.
    say = (words) => `修饰 ${words}`
    worth = () => Boolean(named) && apart(analysis, unit, named)
  } else if (unit.role === 'attributive' || unit.role === 'appositive') {
    partner = target('modifies')
    if (partner && enclosesUnit(analysis, partner.id, unit.id)) partner = null
    say = (words) => `${unit.role === 'attributive' ? '修饰' : '说明'} ${words}`
    // An appositive is the explanation of its noun ("fears: heights, bears…"):
    // the named target is the content, so even one seated beside it says so.
    if (unit.role === 'appositive') worth = () => true
  } else if (['object', 'indirect-object', 'predicative'].includes(unit.role)) {
    partner = verb()
    say = (words) => `${words} 的${roleLabel(unit.role)}`
  } else if (unit.role === 'object-complement' || unit.role === 'subject-complement') {
    partner = target('complements')
    say = (words) => `补充说明 ${words}`
    // Which word a complement completes is the point of the explanation.
    worth = () => true
  } else if (unit.role === 'subject') {
    partner = nearest(analysis, unit, 'predicate', 'after')
    say = (words) => `${words} 的主语`
  } else if (unit.role === 'predicate') {
    partner = nearest(analysis, unit, 'subject', 'before')
    say = (words) => `主语是 ${words}`
  }
  if (!partner) {
    // A sentence appositive ("…, a choice that …") renames the whole clause
    // before it rather than one head noun, so no modifies target is recorded.
    return unit.role === 'appositive' ? { text: '说明前面的整句', targetId: null } : none
  }
  const words = briefText(unitTrunkText(analysis, partner))
  const text = words && worth() ? say(words) : ''
  return { text: text && fitsLine(text) ? text : '', targetId: partner.id }
}

const WORD = /[\p{L}\p{N}]/u

// True when at least one word stands between the two units, so the lit
// partner may not be where the eye already is.
function apart(analysis, unit, partner) {
  if (!partner) return false
  const own = coverage(analysis, unit.id)
  const other = coverage(analysis, partner.id)
  if (own.size === 0 || other.size === 0) return false
  const [a, b] = [[...own], [...other]].map(list => [Math.min(...list), Math.max(...list)])
  const [from, to] = a[1] < b[0] ? [a[1], b[0]] : b[1] < a[0] ? [b[1], a[0]] : [0, 0]
  for (let index = from + 1; index < to; index += 1) {
    if (WORD.test(analysis.tokens[index].text)) return true
  }
  return false
}

function bubbleRestore(analysis, restoreId) {
  const restore = restoreId ? analysis.restores.find((item) => item.id === restoreId) : null
  return restore ? { id: restore.id, label: RESTORE_BUTTON_LABELS[restore.kind], kindLabel: RESTORE_KIND_LABELS[restore.kind] } : null
}

export function difficultyBubble(analysis, difficulty) {
  return {
    title: difficulty.label,
    body: difficulty.rule,
    uncertain: focusView(analysis, difficulty.unitId).relations.some((relation) => relation.certainty === 'uncertain'),
    restore: bubbleRestore(analysis, difficulty.restoreId),
  }
}

// How a nonfinite structure's doer relates to its action, from the recorded
// voice: "逻辑主语是 medals，与「颁发」是被动关系". The doer is the logical
// subject, else the word an attributive modifies or a complement completes.
// The form is shown before this line, not inside it.
export function voiceLine(analysis, unitOrId) {
  const units = indexUnits(analysis)
  const unit = typeof unitOrId === 'string' ? units.get(unitOrId) : unitOrId
  if (!unit?.voice) return null
  const from = (kind) => analysis.relations.find(relation => relation.kind === kind && relation.from === unit.id
    && relation.certainty === 'certain' && relation.to.length === 1)
  const relation = from('logical-subject')
    || (unit.role === 'attributive' ? from('modifies') : null)
    || (['object-complement', 'subject-complement'].includes(unit.role) ? from('complements') : null)
  const doer = relation ? units.get(relation.to[0]) : null
  if (!doer) return null
  const words = briefText(unitTrunkText(analysis, doer))
  const action = unit.actionZh ? `「${unit.actionZh}」` : '动作'
  const subject = `逻辑主语是 ${words}`
  const options = {
    // 主动/被动关系 rather than 发出者/承受者: a path that leads somewhere does nothing.
    // Without a named action (or room for it) the plain 表示主动/被动 reads
    // better than a vague 与动作是…关系.
    active: [unit.actionZh ? `${subject}，与${action}是主动关系` : '', `${subject}，表示主动`],
    passive: [unit.actionZh ? `${subject}，与${action}是被动关系` : '', `${subject}，表示被动`],
    completed: [unit.actionZh ? `${subject}，表示已经${action}` : '', '表示完成，不是被动'],
  }[unit.voice] || []
  const text = options.find(item => item && lineWidth(item) <= LIMITS.voiceLine)
  return text ? { text, targetId: doer.id } : null
}

// The neighbour a selection relates to, lit even when the bubble stays silent.
export function unitPartnerId(analysis, unitId) {
  const unit = indexUnits(analysis).get(unitId)
  if (!unit) return null
  return voiceLine(analysis, unit)?.targetId || relationLine(analysis, unit).targetId
}

export function unitBubble(analysis, unitId) {
  const unit = indexUnits(analysis).get(unitId)
  if (!unit) return null
  const own = analysis.restores.find((restore) => restore.unitId === unit.id)
    || (unit.form === 'clause' ? analysis.restores.find((restore) => analysis.units.some((child) => child.id === restore.unitId && child.parentId === unit.id && child.connector)) : null)
  const points = teachingPoints(analysis).filter(item => item.unitId === unitId && item.rule)
  const point = points.find(item => item.attention === 'priority') || points.find(item => item.attention === 'on-demand')
  let body = point ? point.rule : unitBody(analysis, unit)
  // The voice line names the same partner and says more, so it takes the
  // relation line's place.
  const line = voiceLine(analysis, unit) || relationLine(analysis, unit)
  // A relation line only exists when the partner sits apart, so a clause far from
  // its verb says first what it does there; the connector follows if it fits.
  if (!point && unit.form === 'clause' && body && line.text) {
    const both = `${line.text}；${body}`
    body = fitsLine(both) ? both : line.text
  }
  const relation = body ? '' : line.text
  const uncertain = focusView(analysis, unitId).relations.some((relation) => relation.certainty === 'uncertain')
  if (!body && !relation && !own && !uncertain) return null
  return {
    title: unitDisplayLabel(analysis, unit) || unitTitleLabel(unit),
    body,
    relation,
    relationTargetId: line.targetId,
    uncertain,
    restore: bubbleRestore(analysis, own?.id || null),
  }
}

const CLOSING = /^[,.;:!?)\]”’%，。；：！？）]/u
const OPENING = /[(\[“‘（]$/u

// The sentence in reading order with one restore applied: kept words carry
// their token index (so underlines and arrows follow them), added words only text.
const SUBSTITUTES = new Set(['do', 'does', 'did', 'so', 'one', 'ones'])

function substitutesDropped(analysis, restore, scope) {
  if (restore.kind !== 'ellipsis') return []
  const kept = new Set()
  for (const segment of restore.segments) {
    if ('start' in segment) for (let index = segment.start; index < segment.end; index += 1) kept.add(index)
  }
  const dropped = []
  for (const span of scope.spans) {
    for (let index = span.start; index < span.end; index += 1) {
      if (!kept.has(index) && SUBSTITUTES.has(analysis.tokens[index].text.toLowerCase())) dropped.push(index)
    }
  }
  return dropped
}

// The bubble line once an ellipsis is filled in: what was added, and what it replaced.
export function restoreSummary(analysis, restoreId) {
  const restore = analysis.restores.find((item) => item.id === restoreId)
  const scope = restore ? indexUnits(analysis).get(restore.scopeId) : null
  if (!restore || !scope) return null
  if (restore.kind === 'antecedent') return `局部代入：${restoreText(analysis, restore)}`
  if (restore.kind !== 'ellipsis') return null
  const added = restore.segments.filter((segment) => 'text' in segment).map((segment) => segment.text)
  if (added.length === 0) return null
  const replaced = substitutesDropped(analysis, restore, scope).map((index) => analysis.tokens[index].text)
  const text = `补出 ${added.join('、')}`
  const full = replaced.length > 0 ? `${text}（替代 ${replaced.join('、')}）` : text
  if (fitsLine(full)) return full
  return fitsLine(text) ? text : null
}

export function restoreLayout(analysis, restoreId) {
  const { tokens } = analysis
  const text = analysis.source.sentenceText
  const restore = restoreId ? analysis.restores.find((item) => item.id === restoreId) : null
  const scope = restore ? indexUnits(analysis).get(restore.scopeId) : null
  const items = []
  const keep = (index, lowercase = false) => items.push({ kind: 'token', index, lowercase })
  if (!restore || !scope) {
    tokens.forEach((_, index) => keep(index))
  } else {
    const start = Math.min(...scope.spans.map((span) => span.start))
    const end = Math.max(...scope.spans.map((span) => span.end))
    for (let index = 0; index < start; index += 1) keep(index)
    for (const segment of restore.segments) {
      if ('text' in segment) {
        items.push({ kind: 'insert', text: segment.text })
        continue
      }
      for (let index = segment.start; index < segment.end; index += 1) keep(index, Boolean(segment.lowercase) && index === segment.start)
    }
    for (let index = end; index < tokens.length; index += 1) keep(index)
    // A substitute ("memristors do") stays in place, struck through, before the words it stood for.
    for (const index of substitutesDropped(analysis, restore, scope)) {
      const after = items.findIndex((item) => item.kind === 'token' && item.index === index - 1)
      const before = items.findIndex((item) => item.kind === 'token' && item.index === index + 1)
      const position = after >= 0 ? after + 1 : before
      if (position >= 0) items.splice(position, 0, { kind: 'token', index, lowercase: false, struck: true })
    }
  }
  const shown = (item) => (item.kind === 'insert' ? item.text : tokens[item.index].text)
  const capital = /^[A-Z]/.test(tokens[0]?.text || '')
  return items.map((item, position) => {
    const previous = items[position - 1]
    let gap = ''
    if (previous) {
      if (item.kind === 'token' && previous.kind === 'token' && item.index === previous.index + 1) {
        gap = text.slice(tokens[previous.index].end, tokens[item.index].start)
      } else if (!CLOSING.test(shown(item)) && !OPENING.test(shown(previous))) {
        gap = ' '
      }
    }
    // A restore that starts the sentence starts it with a capital, like the original did.
    const capitalize = position === 0 && capital && !(item.kind === 'token' && item.index === 0)
    return { ...item, gap, capitalize }
  })
}

// Everything the card can show, as plain text: the sentence, the translation,
// every teaching rule and every restore, whether or not it has a standing badge.
export function copyText(analysis) {
  const lines = [analysis.source.sentenceText]
  if (analysis.translation) lines.push(analysis.translation.textZh)
  // Some rules are deliberately blank (passive is explained by the voice line);
  // a bare label would read as missing text once pasted into a handout.
  const rules = [...new Set(teachingPoints(analysis).filter((item) => item.rule).map((item) => `${item.label}：${item.rule}`))]
  if (rules.length > 0) lines.push('', ...rules)
  const capital = /^[A-Z]/.test(analysis.tokens[0]?.text || '')
  const restores = analysis.restores.map((restore) => {
    const scope = indexUnits(analysis).get(restore.scopeId)
    let text = restoreText(analysis, restore)
    if (capital && scope && Math.min(...scope.spans.map((span) => span.start)) === 0) text = text[0].toUpperCase() + text.slice(1)
    return `${RESTORE_KIND_LABELS[restore.kind]}：${text}`
  })
  if (restores.length > 0) lines.push('', ...restores)
  return lines.join('\n')
}
