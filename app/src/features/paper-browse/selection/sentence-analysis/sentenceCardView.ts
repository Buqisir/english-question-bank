import { coverage, mainFocus, trunkTokenIndexes, difficultyBubble, unitBubble, restoreSummary, restoreText, focusView, unitText, unitDisplayLabel } from '../../../../../../shared/sentence-analysis/derive.mjs'
import type { Difficulty, FocusState, SentenceAnalysisV1, TextRange, BubbleModel } from '../../../../../../shared/sentence-analysis/types.d.mts'
import { ROLE_LABELS } from './sentencePresentation.ts'
import type { interactionView } from './sentenceInteraction'

export type SentenceBubble = { key: string; model: BubbleModel; unitId: string; flagId: string | null; restored: boolean }

function mainTranslationRanges(analysis: SentenceAnalysisV1): TextRange[] {
  const ranges: TextRange[] = []
  for (const unit of mainFocus(analysis).primary) {
    const trunk = new Set(trunkTokenIndexes(analysis, unit))
    const whole = [...coverage(analysis, unit.id)].every((index) => trunk.has(index))
    if (whole) {
      ranges.push(...unit.translationRanges)
      continue
    }
    const inner = analysis.units
      .filter((item) => item.translationRanges.length > 0 && [...coverage(analysis, item.id)].every((index) => trunk.has(index)))
      .sort((a, b) => coverage(analysis, b.id).size - coverage(analysis, a.id).size)[0]
    if (inner) ranges.push(...inner.translationRanges)
  }
  return ranges
}

export function translationRanges(analysis: SentenceAnalysisV1, focus: FocusState): TextRange[] {
  if (!analysis.translation) return []
  if (focus.kind === 'main') return mainTranslationRanges(analysis)
  const unit = analysis.units.find((item) => item.id === focus.unitId)
  if (!unit) return []
  if (unit.translationRanges.length > 0) return unit.translationRanges
  return innerTranslationRanges(analysis, unit.id)
}

// The model may skip the Chinese for a unit while giving it for the parts
// inside; the largest such parts stand in for the whole, never anything outside it.
function innerTranslationRanges(analysis: SentenceAnalysisV1, unitId: string): TextRange[] {
  const own = coverage(analysis, unitId)
  const candidates = analysis.units
    .filter((item) => item.id !== unitId && item.translationRanges.length > 0)
    .map((item) => ({ item, covered: coverage(analysis, item.id) }))
    .filter(({ covered }) => covered.size > 0 && [...covered].every((index) => own.has(index)))
    .sort((a, b) => b.covered.size - a.covered.size)
  const taken = new Set<number>()
  const ranges: TextRange[] = []
  for (const { item, covered } of candidates) {
    if ([...covered].every((index) => taken.has(index))) continue
    covered.forEach((index) => taken.add(index))
    ranges.push(...item.translationRanges)
  }
  return ranges
}

export function sentenceCardView(ready: SentenceAnalysisV1 | null, flags: Difficulty[], view: ReturnType<typeof interactionView>) {
  const { open, focus, restored, selectedRole, mainActive } = view
  const activeRestore = ready?.restores.find(item => item.id === restored)
  const flagIndex = open?.kind === 'flag' ? flags.findIndex((flag) => flag.id === open.id) : -1
  const bubble: SentenceBubble | null = (() => {
    if (!ready || !open) return null
    if (open.kind === 'flag') {
      const flag = flags[flagIndex]
      if (!flag) return null
      return { key: `flag:${flag.id}`, model: difficultyBubble(ready, flag), unitId: flag.unitId, flagId: flag.id, restored: false }
    }
    const model = unitBubble(ready, open.unitId)
    return model ? { key: `unit:${open.unitId}`, model, unitId: open.unitId, flagId: null, restored: false } : null
  })()
  if (bubble) bubble.restored = Boolean(bubble.model.restore && bubble.model.restore.id === restored)
  if (ready && bubble?.restored && restored) {
    const summary = restoreSummary(ready, restored)
    if (summary) bubble.model = { ...bubble.model, body: activeRestore?.kind === 'antecedent' ? '框内为局部还原，外围保留原文' : summary }
  }

  const announcement = (() => {
    if (!ready) return ''
    if (restored) {
      const restore = ready.restores.find((item) => item.id === restored)
      return restore ? `${restore.kind === 'antecedent' ? '局部代入' : '已还原'}：${restoreText(ready, restore)}` : ''
    }
    const relationOnly = bubble && !bubble.flagId && !bubble.model.body && !bubble.model.restore && !bubble.model.uncertain
    if (bubble && !relationOnly) return `${bubble.model.title}${bubble.model.uncertain ? '（不确定）' : ''}：${bubble.model.body}`
    if (selectedRole && focus.kind === 'main') return `查看${ROLE_LABELS[selectedRole]}`
    if (focus.kind === 'unit') {
      const unit = ready.units.find(item => item.id === focus.unitId)
      if (!unit) return ''
      const subjects = focusView(ready, unit.id).relations.filter(relation => relation.kind === 'logical-subject' && relation.from === unit.id)
        .flatMap(relation => relation.to.map(id => ready.units.find(item => item.id === id)))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
      const relation = !subjects.length && relationOnly && bubble.unitId === unit.id ? bubble.model.relation : ''
      return [unitDisplayLabel(ready, unit), ...subjects.map(subject => `逻辑主语是 ${unitText(ready, subject)}`), ...(relation ? [relation] : [])].join('，')
    }
    return mainActive ? '主句' : '句子结构'
  })()
  return { flagIndex, bubble, announcement, activeRestore }
}
