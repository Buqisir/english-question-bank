import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertFullTranslationZh,
  assertSelectedLongSentences,
  createAnalyzerProviderShell,
  readTeachingAnalysisPrompt,
  rewriteApiPrompt,
} from './analyzerProviderShell.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/cloze-analysis-v1.md')

const VALID_POS = new Set(['verb', 'noun', 'adjective', 'adverb', 'phrase', 'other'])

const VALID_SIGNATURE_FACETS = new Set([
  'cloze.signature.verb.action-sequence',
  'cloze.signature.noun.semantic-field',
  'cloze.signature.adjective.affective-consistency',
  'cloze.signature.adverb.affective-consistency',
  'cloze.signature.phrase.contextual-composition',
])

// Each signature facet's POS prefix — used to enforce pos / facet match.
const SIGNATURE_POS_PREFIX = {
  'cloze.signature.verb.action-sequence': 'verb',
  'cloze.signature.noun.semantic-field': 'noun',
  'cloze.signature.adjective.affective-consistency': 'adjective',
  'cloze.signature.adverb.affective-consistency': 'adverb',
  'cloze.signature.phrase.contextual-composition': 'phrase',
}

const VALID_EVIDENCE_TYPES = new Set([
  'collocation-partner',
  'repetition-echo',
  'semantic-field',
  'affective-cue',
  'logical-connector',
])

const VALID_SIGNAL_SIDES = new Set(['context-before', 'context-after', 'stem', 'option'])

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readApiPrompt() {
  return rewriteApiPrompt(readTeachingAnalysisPrompt(promptPath))
}

function assertClozeAnalyzeInput(input) {
  const paper = input?.paper
  const group = input?.group
  if (!paper || typeof paper !== 'object') throw new Error('缺少 paper。')
  if (!group || typeof group !== 'object') throw new Error('缺少 cloze group。')
  if (!optionalString(paper.paperId)) throw new Error('paper.paperId 不能为空。')
  if (!optionalString(group.groupId)) throw new Error('group.groupId 不能为空。')
  if (!Array.isArray(group.paragraphs) || group.paragraphs.length === 0) throw new Error('group.paragraphs 不能为空。')
  // 新课标完形 15 空 (q41–q55)；浙江 6 月卷完形 20 空 (q36–q55)。两种官方格式都接受。
  if (!Array.isArray(group.questions) || (group.questions.length !== 15 && group.questions.length !== 20)) throw new Error('完形填空 group 必须有 15 道题（新课标）或 20 道题（浙江 6 月卷）。')
  for (const question of group.questions) {
    if (!optionalString(question?.id)) throw new Error('题目缺少 id。')
    if (!optionalString(question?.blankId)) throw new Error(`题目 ${question?.id || ''} 缺少 blankId。`)
    if (!question?.options || typeof question.options !== 'object') throw new Error(`题目 ${question?.id || ''} 缺少 options。`)
  }
}

function buildPromptInput({ paper, group }) {
  const sourceAssetVersion = Number(paper.sourceAssetVersion || 1) || 1
  return {
    paper: {
      paperId: paper.paperId,
      sourceFilename: paper.sourceFilename || '',
      sourceHash: paper.sourceHash || '',
      sourceAssetVersion,
    },
    targetGroups: [group.groupId],
    content: {
      groups: {
        [group.groupId]: {
          groupId: group.groupId,
          groupType: 'cloze',
          title: group.title || '完形填空',
          order: Number(group.order || 0),
          passage: {
            paragraphs: group.paragraphs.map((paragraph) => ({
              paragraphId: paragraph.id,
              text: paragraph.text,
            })),
          },
          questions: group.questions.map((q) => ({
            questionId: q.id,
            blankNo: Number(q.stem) || 0,
            blankId: q.blankId,
            options: q.options,
          })),
        },
      },
    },
    answerKey: Object.fromEntries(group.questions.map((q) => [q.id, q.answerKey || ''])),
  }
}

export function buildClozeAnalysisMessages({ paper, group }) {
  const promptInput = buildPromptInput({ paper, group })
  return [
    {
      role: 'system',
      content: readApiPrompt(),
    },
    {
      role: 'user',
      content: [
        'Create exactly one cloze-analysis-v1 JSON object for the target group below.',
        'Return JSON text only. The first character must be { and the final character must be }.',
        '',
        'Structured input:',
        JSON.stringify(promptInput, null, 2),
      ].join('\n'),
    },
  ]
}

export function validateClozeShape(analysis, {
  paper,
  group,
  requireFullTranslation = false,
  requireSelectedLongSentences = false,
}) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('AI 未返回 JSON 对象。')
  if (analysis.schemaVersion !== 'cloze-analysis-v1') throw new Error('AI JSON schemaVersion 不正确。')
  if (analysis.paperId !== paper.paperId) throw new Error('AI JSON paperId 与当前试卷不一致。')
  if (Number(analysis.sourceAssetVersion || 0) < 1) throw new Error('AI JSON sourceAssetVersion 无效。')
  if (!Array.isArray(analysis.targetGroups) || analysis.targetGroups.length !== 1 || analysis.targetGroups[0] !== group.groupId) {
    throw new Error('AI JSON targetGroups 必须只包含当前题组。')
  }
  if (!analysis.blanks || typeof analysis.blanks !== 'object' || Array.isArray(analysis.blanks)) {
    throw new Error('AI JSON blanks 必须是对象。')
  }
  const groupAnalysis = analysis.groups?.[group.groupId]
  if (requireFullTranslation) {
    assertFullTranslationZh(groupAnalysis, group, { requireBlankMarkers: true })
  }
  assertSelectedLongSentences(groupAnalysis, group, {
    required: requireSelectedLongSentences,
  })
  if (groupAnalysis?.similaritySummary !== undefined) {
    const summary = optionalString(groupAnalysis.similaritySummary)
    if (!summary) throw new Error('AI JSON groups.similaritySummary 不能为空。')
    if (/[\r\n]/u.test(summary)) throw new Error('AI JSON groups.similaritySummary 必须是一句话。')
  }

  const expectedQuestionIds = group.questions.map((q) => q.id).sort()
  const actualQuestionIds = Object.keys(analysis.blanks).sort()
  if (JSON.stringify(actualQuestionIds) !== JSON.stringify(expectedQuestionIds)) {
    throw new Error(`AI JSON blanks questionIds 不匹配：expected ${expectedQuestionIds.join(', ')}, got ${actualQuestionIds.join(', ')}`)
  }

  // Build passage text for exact-quote validation.
  const passageText = group.paragraphs.map((p) => p.text).join('\n')

  for (const questionId of expectedQuestionIds) {
    const sourceQuestion = group.questions.find((q) => q.id === questionId)
    const item = analysis.blanks[questionId]
    if (!item || typeof item !== 'object') throw new Error(`${questionId}: 缺少空格分析。`)

    // Required fields
    if (!optionalString(item.blankId)) throw new Error(`${questionId}: 缺少 blankId。`)
    if (item.blankId !== sourceQuestion?.blankId) throw new Error(`${questionId}: blankId does not match source question.`)
    if (typeof item.blankNo !== 'number') throw new Error(`${questionId}: blankNo 必须是数字。`)
    if (item.blankNo !== Number(sourceQuestion?.stem)) throw new Error(`${questionId}: blankNo does not match source question.`)
    if (!VALID_POS.has(item.pos)) throw new Error(`${questionId}: pos 值无效：${item.pos}。`)
    if (!item.correctFit || typeof item.correctFit !== 'object') throw new Error(`${questionId}: 缺少 correctFit。`)
    if (!optionalString(item.correctFit.reason)) throw new Error(`${questionId}: 缺少 correctFit.reason。`)
    if (!Array.isArray(item.distractorGlosses)) throw new Error(`${questionId}: distractorGlosses 必须是数组。`)
    // Validate that distractorGlosses covers each non-answer option exactly (set equality on labels).
    {
      const allOptionLabels = Object.keys(sourceQuestion?.options || {})
      const answerLabel = sourceQuestion?.answerKey || ''
      const expectedDistractorLabels = new Set(allOptionLabels.filter((l) => l !== answerLabel))
      const actualLabels = item.distractorGlosses.map((g) => (g && typeof g === 'object' ? String(g.optionLabel || '') : ''))
      const actualLabelSet = new Set(actualLabels)
      // Duplicate check: if actualLabels has more entries than the set, there's a dupe.
      const hasDupe = actualLabels.length !== actualLabelSet.size
      const missing = [...expectedDistractorLabels].filter((l) => !actualLabelSet.has(l))
      const extra = [...actualLabelSet].filter((l) => !expectedDistractorLabels.has(l))
      if (hasDupe || missing.length > 0 || extra.length > 0) {
        throw new Error(`${questionId}: distractorGlosses 必须覆盖每个非正确选项（缺/多/重复）。`)
      }
    }
    if (!Array.isArray(item.evidence)) throw new Error(`${questionId}: evidence 必须是数组。`)
    if (item.evidence.length === 0) throw new Error(`${questionId}: evidence 不能为空，至少需要 1 个 collocation-partner。`)
    if (!optionalString(item.teachingNote)) throw new Error(`${questionId}: 缺少 teachingNote。`)

    // signatureFacet: present only when pos !== 'other'; must be valid + POS prefix match
    if (item.signatureFacet !== undefined && item.signatureFacet !== null && item.signatureFacet !== '') {
      const facet = String(item.signatureFacet)
      if (!VALID_SIGNATURE_FACETS.has(facet)) {
        throw new Error(`${questionId}: signatureFacet 值无效：${facet}。`)
      }
      if (item.pos === 'other') {
        throw new Error(`${questionId}: pos 为 "other" 时不能设置 signatureFacet。`)
      }
      const requiredPos = SIGNATURE_POS_PREFIX[facet]
      if (requiredPos !== item.pos) {
        throw new Error(`${questionId}: signatureFacet "${facet}" 的 POS 前缀与 pos "${item.pos}" 不一致。`)
      }
    }

    // Validate answer key match (non-retryable if conflict).
    const correctLabel = optionalString(item.correctFit?.optionLabel)
    if (sourceQuestion?.answerKey && correctLabel && correctLabel !== sourceQuestion.answerKey) {
      const conflictError = new Error(`${questionId}: AI 答案与答案解析版不一致：官方 ${sourceQuestion.answerKey}，AI ${correctLabel}。`)
      conflictError.isAnswerConflict = true
      throw conflictError
    }

    // Validate ≥1 collocation-partner evidence.
    const hasCollocationPartner = item.evidence.some((ev) => ev?.type === 'collocation-partner')
    if (!hasCollocationPartner) {
      throw new Error(`${questionId}: evidence 必须包含至少 1 个 collocation-partner。`)
    }

    // Validate each evidence item's exact-substring rule.
    for (const ev of item.evidence) {
      if (!ev || typeof ev !== 'object') continue
      const signalText = optionalString(ev.signalText)
      const signalSide = optionalString(ev.signalSide)
      if (!signalText) continue
      if (!VALID_SIGNAL_SIDES.has(signalSide)) {
        throw new Error(`${questionId}: evidence signalSide 值无效：${signalSide}。`)
      }
      if (!VALID_EVIDENCE_TYPES.has(ev.type)) {
        throw new Error(`${questionId}: evidence type 值无效：${ev.type}。`)
      }
      if (signalSide === 'option') {
        // signalText must appear in one of the blank's A–D option texts.
        const optionTexts = Object.values(sourceQuestion?.options || {}).map(String)
        const found = optionTexts.some((t) => t.includes(signalText))
        if (!found) {
          throw new Error(`${questionId}: evidence signalText "${signalText}" (signalSide=option) 未在该空格选项中定位。`)
        }
      } else {
        // context-before / context-after / stem: must appear in passage text.
        if (!passageText.includes(signalText)) {
          throw new Error(`${questionId}: evidence signalText "${signalText}" 必须精确匹配原文。`)
        }
      }
    }
  }
}

function isRetryableClozeError(error) {
  // Answer conflicts are never retryable — they are a fundamental mismatch.
  if (error && error.isAnswerConflict) return false
  // Per the I8 policy, every other validateClozeShape error is a transient
  // shape defect that should be retried. Retry by default so new/changed
  // validator wording does not silently regress into a non-retryable class.
  return true
}

// The provider/date/review provenance is authoritative server-side — never
// trust the model's self-reported meta (it hallucinates model names + dates).
function stampClozeMeta(analysis, { providerResult, providerId }) {
  if (!analysis || typeof analysis !== 'object') return
  const prior = analysis.meta && typeof analysis.meta === 'object' ? analysis.meta : {}
  analysis.meta = {
    ...prior,
    generatedBy: 'external-ai',
    model: optionalString(providerResult?.model) || String(providerId || ''),
    promptVersion: 'cloze-analysis-v1',
    reviewStatus: 'reviewed',
    reviewedBy: '',
    reviewedAt: new Date().toISOString().slice(0, 10),
  }
}

export const analyzeClozeImportCandidate = createAnalyzerProviderShell({
  assertInput: assertClozeAnalyzeInput,
  buildMessages: buildClozeAnalysisMessages,
  validate: validateClozeShape,
  isRetryable: isRetryableClozeError,
  beforeValidate: stampClozeMeta,
})
