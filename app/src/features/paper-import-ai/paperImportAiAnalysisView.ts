import type { PaperImportAiQuestion, PaperImportAiReadingGroup } from '../../services/paperImportAi'

export type AnalysisRecord = Record<string, unknown>

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function firstPassageLine(group: PaperImportAiReadingGroup) {
  return group.paragraphs.find((paragraph) => paragraph.text.trim())?.text || '未识别到段落文本'
}

export function reasonLabel(reason: string) {
  if (reason.endsWith('_out_of_scope_for_i1')) return 'I1 范围外'
  if (reason.includes('missing_questions_or_options')) return '题干或选项不完整'
  if (reason.includes('missing_passage')) return '缺少语篇正文'
  return reason
}

export function asRecord(value: unknown): AnalysisRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnalysisRecord) : {}
}

export function asArray(value: unknown): AnalysisRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : []
}

export function textOf(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

export function statusLabel(status: unknown) {
  if (status === 'correct') return '正确'
  if (status === 'wrong') return '干扰项'
  return textOf(status, '待核对')
}

export function trapTypeLabel(type: unknown) {
  if (type === 'sourceLexicalTrap') return '原文词钩干扰'
  if (type === 'polarityReversal') return '黑白颠倒'
  if (type === 'scopeShift') return '范围偷换'
  if (type === 'entityMismatch') return '对象错配'
  if (type === 'unsupportedClaim') return '无中生有'
  return textOf(type, '干扰诊断')
}

export function relationTypeLabel(type: unknown) {
  if (type === 'locationCue') return '定位线索'
  if (type === 'paraphrase') return '同义替换'
  if (type === 'wordFamily') return '词族关联'
  if (type === 'calculation') return '计算/推算'
  return textOf(type, '定位关系')
}

export function skillText(skill: unknown) {
  const record = asRecord(skill)
  const primary = textOf(record.primary)
  const secondary = textOf(record.secondary)
  return [primary, secondary].filter(Boolean).join(' / ') || '未标注'
}

export function optionNote(option: AnalysisRecord) {
  const evidence = asArray(option.evidence)
  if (evidence.length > 0) {
    return textOf(evidence[0].anchor) || textOf(evidence[0].quote)
  }
  const trap = asRecord(option.trap)
  return (
    textOf(trap.relationNote) ||
    textOf(trap.explanation) ||
    textOf(trap.claim) ||
    textOf(trap.sourceQuote) ||
    textOf(trap.sourceText)
  )
}

export function correctLabelFromAnalysis(questionAnalysis: AnalysisRecord) {
  const correct = asArray(questionAnalysis.optionAnalysis).find((option) => option.status === 'correct')
  return textOf(correct?.label)
}

export function groupLetter(group: PaperImportAiReadingGroup) {
  const match = group.groupId.match(/reading-([abcd])$/i)
  return match ? match[1].toUpperCase() : ''
}

export function answerState(question: PaperImportAiQuestion, questionAnalysis: AnalysisRecord) {
  const official = question.answerKey
  const ai = correctLabelFromAnalysis(questionAnalysis)
  if (!official && ai) return { label: `AI 判断 ${ai}`, tone: 'pending' }
  if (official && !ai) return { label: `答案 ${official} · AI 未标出`, tone: 'warning' }
  if (official && ai && official !== ai) return { label: `冲突：答案版 ${official} / AI ${ai}`, tone: 'danger' }
  if (official && ai) return { label: `一致：${official}`, tone: 'ok' }
  return { label: '待核对', tone: 'pending' }
}
