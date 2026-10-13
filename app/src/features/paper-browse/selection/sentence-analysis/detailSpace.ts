import { coverage, difficulties, difficultyBubble, restoreSummary, unitBubble, unitDisplayLabel, unitText, voiceLine } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { BubbleModel, SentenceAnalysisV1 } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { unitFormPart } from '../../../../../../shared/sentence-analysis/enums.mjs'
import { canEnterUnit, capsuleLabel, hasPersistentLabel, outgoingRelations, relationDisplay, relationFallback } from './sentencePresentation'

type Piece = { className: string; text: string }

const MAX_HEIGHT = 60
const MIN_HEIGHT = 32
// Layer buttons sit outside the explanation bubble, at the slot's right end.
const NAV = 'sa-layer-btn'
const BACK: Piece = { className: `sa-bubble-action ${NAV} sa-back-action`, text: '← 返回' }
const ENTER: Piece = { className: `sa-bubble-action ${NAV} sa-enter-action`, text: '看内部 →' }

function restorePieces(model: BubbleModel): Piece[] {
  if (!model.restore) return []
  const labels = [model.restore.label, model.restore.kindLabel === '代入先行词' ? '收起代入' : '看原句']
  return [{ className: 'sa-bubble-action', text: labels.sort((a, b) => b.length - a.length)[0] }]
}

/**
 * Every explanation line this sentence can show, each at its fullest (title,
 * body, every action that may join it), across all reading layers. Erring
 * long only costs space; erring short would let a selection overflow.
 */
export function detailCandidates(analysis: SentenceAnalysisV1): Piece[][] {
  const lines: Piece[][] = []
  // Inside a layer the explanation line opens with 「← 返回」.
  const layers = analysis.units.filter(unit => canEnterUnit(analysis, unit.id)).map(unit => ({ id: unit.id, words: coverage(analysis, unit.id) }))
  if (layers.length) lines.push([BACK])
  for (const flag of difficulties(analysis)) {
    const model = difficultyBubble(analysis, flag)
    lines.push([
      ...(layers.length ? [BACK] : []),
      ...(model.uncertain ? [{ className: 'sa-bubble-unsure', text: '不确定' }] : []),
      ...(model.body ? [{ className: 'sa-bubble-body', text: model.body }] : []),
      ...restorePieces(model),
    ])
  }
  for (const unit of analysis.units) {
    const words = coverage(analysis, unit.id)
    if (!words.size) continue
    const back = layers.some(layer => layer.id !== unit.id && [...words].every(index => layer.words.has(index))) ? [BACK] : []
    const model = unitBubble(analysis, unit.id)
    // The line names a unit only when no standing capsule already does: a
    // selection-only capsule may be crowded out, a numbered member stays ②.
    const named = !hasPersistentLabel(analysis, unit) || capsuleLabel(analysis, unit, false) !== capsuleLabel(analysis, unit, true)
    const title = named ? [{ className: 'sa-bubble-title', text: unitDisplayLabel(analysis, unit) || '' }]
      : unitFormPart(unit) ? [{ className: 'sa-bubble-title sa-bubble-form', text: unitFormPart(unit) }] : []
    const relations = outgoingRelations(analysis, unit.id)
    // Only drawable relations fall back to text, and only when no route fits.
    const fallback = model?.body ? [] : [...new Set(relations.filter(relation => relationDisplay(analysis, relation) !== 'hidden')
      .flatMap(relation => relation.to.map(target => relationFallback(analysis, relation.kind, target))).filter(Boolean))]
      .map(text => ({ className: 'sa-local-action', text }))
    const subject = voiceLine(analysis, unit) ? '' : analysis.units.filter(item => relations.some(relation => relation.kind === 'logical-subject'
      && relation.certainty === 'certain' && relation.to.includes(item.id)) && coverage(analysis, item.id).size)
      .map(item => unitText(analysis, item)).join('、')
    const actions = [
      ...(subject ? [{ className: 'sa-bubble-action sa-subject-action', text: `逻辑主语：${subject}` }] : []),
      ...(canEnterUnit(analysis, unit.id) ? [ENTER] : []),
    ]
    // Fallback text appears only when a route fails; otherwise the relation
    // line may take its place, so both variants are measured.
    const relation = model?.relation && !subject ? [{ className: 'sa-bubble-body', text: model.relation }] : []
    const texts: Piece[][] = model?.body ? [[{ className: 'sa-bubble-body', text: model.body }]] : [fallback, relation]
    for (const text of texts) {
      lines.push([
        ...back,
        ...title,
        ...(model?.uncertain ? [{ className: 'sa-bubble-unsure', text: '不确定' }] : []),
        ...text,
        ...(model ? restorePieces(model) : []),
        ...actions,
      ])
    }
    const restoreId = model?.restore?.id
    const summary = restoreId ? restoreSummary(analysis, restoreId) : null
    if (model && restoreId) {
      const restored = analysis.restores.find(item => item.id === restoreId)?.kind === 'antecedent' ? '框内为局部还原，外围保留原文' : summary
      if (restored) lines.push([...back, ...title, { className: 'sa-bubble-body', text: restored }, ...restorePieces(model)])
    }
  }
  return lines.filter(line => line.some(piece => piece.text))
}

/**
 * Height of the explanation slot: the tallest line this sentence can show.
 * The legend beside it keeps the same items in every reading layer, so the
 * slot's width is the same too.
 */
export function measureDetailHeight(row: HTMLElement, slot: HTMLElement, lines: Piece[][]) {
  if (!lines.length) return MIN_HEIGHT
  const probe = document.createElement('div')
  probe.className = 'sa-detail-slot'
  probe.setAttribute('aria-hidden', 'true')
  probe.style.cssText = `position:absolute;left:0;top:0;display:block;height:auto;overflow:visible;visibility:hidden;pointer-events:none;width:${slot.clientWidth}px`
  for (const line of lines) {
    const holder = probe.appendChild(document.createElement('div'))
    holder.className = 'sa-detail-strip sa-detail-probe-line'
    const fill = (parent: HTMLElement, pieces: Piece[]) => {
      for (const piece of pieces) {
        const node = parent.appendChild(document.createElement('span'))
        node.className = piece.className
        node.textContent = piece.text
      }
    }
    const text = line.filter(piece => !piece.className.includes(NAV))
    const nav = line.filter(piece => piece.className.includes(NAV))
    if (text.length) {
      const bubble = holder.appendChild(document.createElement('div'))
      bubble.className = 'sa-bubble sa-bubble-docked'
      bubble.dataset.placed = ''
      fill(bubble, text)
    }
    if (nav.length) {
      const group = holder.appendChild(document.createElement('span'))
      group.className = 'sa-layer-nav'
      fill(group, nav)
    }
  }
  row.appendChild(probe)
  // Layout height, not the painted rect: the card may still be scaling in.
  const tallest = Math.max(...[...probe.querySelectorAll<HTMLElement>('.sa-detail-probe-line')].map(node => node.offsetHeight))
  probe.remove()
  return Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, Math.ceil(tallest)))
}
