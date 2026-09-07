import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertFullTranslationZh,
  assertSelectedLongSentences,
  createAnalyzerProviderShell,
  readTeachingAnalysisPrompt,
} from './analyzerProviderShell.mjs'
import { countQuoteMatches } from '../paper-import/validator.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/reading-choice-analysis-v1.md')

const READING_SIMILARITY_SUBTYPES = new Map([
  ['detail', new Set(['general-detail', 'behavior-reason', 'calculation', 'comparison-integration', 'situation-match'])],
  ['main-idea', new Set(['paragraph-main-idea', 'passage-main-idea', 'best-title'])],
  ['inference', new Set(['detail-inference', 'attitude', 'writing-purpose', 'character-trait', 'source'])],
  ['word-meaning', new Set(['word', 'phrase', 'sentence'])],
  ['reference', new Set(['reference'])],
  ['writing-method', new Set(['writing-method'])],
])

const READING_TECHNIQUES = new Set([
  'example',
  'comparison',
  'quotation',
  'statistics',
  'definition',
  'topic-introduction',
  'viewpoint-support',
])

const LEGACY_SKILL_BY_SIMILARITY = {
  detail: 'detail',
  'paragraph-main-idea': 'mainIdea',
  'passage-main-idea': 'mainIdea',
  'best-title': 'title',
  'detail-inference': 'inference',
  attitude: 'attitude',
  'writing-purpose': 'authorPurpose',
  'character-trait': 'inference',
  source: 'inference',
  'word-meaning': 'wordMeaning',
  reference: 'wordMeaning',
  'writing-method': 'structure',
}

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readPrompt() {
  return readTeachingAnalysisPrompt(promptPath)
}

function validateReadingSimilarityProfile(item, questionId) {
  const profile = item.similarityProfile
  if (profile === undefined) return
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error(`${questionId}: similarityProfile 必须是对象。`)
  }
  const exactFields = ['detailScope', 'family', 'subtype', 'technique']
  if (JSON.stringify(Object.keys(profile).sort()) !== JSON.stringify(exactFields)) {
    throw new Error(`${questionId}: similarityProfile 字段不完整或包含未知字段。`)
  }
  const family = optionalString(profile.family)
  const subtype = optionalString(profile.subtype)
  if (!READING_SIMILARITY_SUBTYPES.get(family)?.has(subtype)) {
    throw new Error(`${questionId}: similarityProfile family/subtype 组合无效：${family}/${subtype}。`)
  }
  if (family === 'detail') {
    if (profile.detailScope !== 'single' && profile.detailScope !== 'multiple') {
      throw new Error(`${questionId}: 细节理解 similarityProfile.detailScope 必须是 single 或 multiple。`)
    }
  } else if (profile.detailScope !== null) {
    throw new Error(`${questionId}: 非细节题 similarityProfile.detailScope 必须是 null。`)
  }
  if (family === 'writing-method') {
    if (!READING_TECHNIQUES.has(profile.technique)) {
      throw new Error(`${questionId}: 写作手法 similarityProfile.technique 值无效。`)
    }
  } else if (profile.technique !== null) {
    throw new Error(`${questionId}: 非写作手法题 similarityProfile.technique 必须是 null。`)
  }

  const expectedLegacySkill = LEGACY_SKILL_BY_SIMILARITY[subtype]
    || LEGACY_SKILL_BY_SIMILARITY[family]
  if (item.skill?.primary !== expectedLegacySkill) {
    throw new Error(`${questionId}: similarityProfile 与 skill.primary 不一致。`)
  }
}

function assertReadingAnalyzeInput(input) {
  const paper = input?.paper
  const group = input?.group
  if (!paper || typeof paper !== 'object') throw new Error('缺少 paper。')
  if (!group || typeof group !== 'object') throw new Error('缺少 reading group。')
  if (!optionalString(paper.paperId)) throw new Error('paper.paperId 不能为空。')
  if (!optionalString(group.groupId)) throw new Error('group.groupId 不能为空。')
  if (!Array.isArray(group.paragraphs) || group.paragraphs.length === 0) throw new Error('group.paragraphs 不能为空。')
  if (!Array.isArray(group.questions) || group.questions.length === 0) throw new Error('group.questions 不能为空。')
  for (const question of group.questions) {
    if (!optionalString(question?.id)) throw new Error('题目缺少 id。')
    if (!optionalString(question?.stem)) throw new Error(`题目 ${question?.id || ''} 缺少 stem。`)
    if (!question?.options || !['A', 'B', 'C', 'D'].every((label) => optionalString(question.options[label]))) {
      throw new Error(`题目 ${question?.id || ''} 缺少 A-D 选项。`)
    }
  }
}

function buildPromptInput({ paper, group }) {
  const sourceAssetVersion = Number(paper.sourceAssetVersion || 1) || 1
  const paragraphIds = group.paragraphs.map((paragraph) => paragraph.id)
  const questionIds = group.questions.map((question) => question.id)
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
          groupType: 'reading',
          title: group.title || 'Reading',
          order: Number(group.order || 0),
          passage: {
            title: group.title || 'Reading',
            paragraphIds,
            paragraphs: group.paragraphs.map((paragraph) => ({
              paragraphId: paragraph.id,
              text: paragraph.text,
            })),
          },
          questionIds,
        },
      },
      questions: Object.fromEntries(
        group.questions.map((question) => [
          question.id,
          {
            questionId: question.id,
            stem: question.stem,
            options: question.options,
          },
        ]),
      ),
    },
    // Keep provider judgment independent from imported answer keys; the UI compares
    // the model's chosen correct option against the answer file after generation.
    answerKey: Object.fromEntries(group.questions.map((question) => [question.id, ''])),
  }
}

export function buildReadingAnalysisMessages({ paper, group }) {
  const promptInput = buildPromptInput({ paper, group })
  return [
    {
      role: 'system',
      content: readPrompt(),
    },
    {
      role: 'user',
      content: [
        'Create exactly one reading-choice-analysis-v1 JSON object for the target group below.',
        'Return JSON text only. The first character must be { and the final character must be }.',
        '',
        'Structured input:',
        JSON.stringify(promptInput, null, 2),
      ].join('\n'),
    },
  ]
}

export function validateReadingAnalysisShape(analysis, {
  paper,
  group,
  requireFullTranslation = false,
  requireSelectedLongSentences = false,
}) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('AI 未返回 JSON 对象。')
  if (analysis.schemaVersion !== 'reading-choice-analysis-v1') throw new Error('AI JSON schemaVersion 不正确。')
  if (analysis.paperId !== paper.paperId) throw new Error('AI JSON paperId 与当前试卷不一致。')
  if (Number(analysis.sourceAssetVersion || 0) < 1) throw new Error('AI JSON sourceAssetVersion 无效。')
  if (!Array.isArray(analysis.targetGroups) || analysis.targetGroups.length !== 1 || analysis.targetGroups[0] !== group.groupId) {
    throw new Error('AI JSON targetGroups 必须只包含当前题组。')
  }
  if (!analysis.groups || typeof analysis.groups !== 'object' || !analysis.groups[group.groupId]) {
    throw new Error('AI JSON 缺少当前题组分析。')
  }
  if (requireFullTranslation) assertFullTranslationZh(analysis.groups[group.groupId], group)
  assertSelectedLongSentences(analysis.groups[group.groupId], group, {
    required: requireSelectedLongSentences,
  })
  if (!analysis.questions || typeof analysis.questions !== 'object' || Array.isArray(analysis.questions)) {
    throw new Error('AI JSON questions 必须是对象。')
  }
  const expectedQuestionIds = group.questions.map((question) => question.id).sort()
  const actualQuestionIds = Object.keys(analysis.questions).sort()
  if (JSON.stringify(actualQuestionIds) !== JSON.stringify(expectedQuestionIds)) {
    throw new Error(`AI JSON questionIds 不匹配：expected ${expectedQuestionIds.join(', ')}, got ${actualQuestionIds.join(', ')}`)
  }
  const paragraphsById = new Map(group.paragraphs.map((paragraph) => [paragraph.id, paragraph.text]))
  const assertExactQuote = (questionId, fieldName, reference = {}) => {
    const paragraphId = optionalString(reference.paragraphId || reference.targetParagraphId)
    const quote = optionalString(reference.quote || reference.targetText)
    if (!paragraphId || !quote) return
    const paragraphText = paragraphsById.get(paragraphId)
    if (!paragraphText) throw new Error(`${questionId}: ${fieldName} 引用了不存在的 paragraphId：${paragraphId}`)
    if (!paragraphText.includes(quote)) throw new Error(`${questionId}: ${fieldName} quote 必须精确匹配原文。`)
  }
  const assertTrapSourceQuoteMatch = (questionId, option) => {
    const sourceQuote = optionalString(option?.trap?.sourceQuote)
    if (!sourceQuote) return
    const trapAnchor = optionalString(option?.trap?.paragraphId || option?.trap?.targetParagraphId)
    if (trapAnchor) {
      const paragraphText = paragraphsById.get(trapAnchor)
      if (!paragraphText) throw new Error(`${questionId}: trap.sourceQuote 引用了不存在的 paragraphId：${trapAnchor}`)
      if (countQuoteMatches(paragraphText, sourceQuote).count === 0) {
        throw new Error(`${questionId}: trap.sourceQuote quote 必须精确匹配原文。`)
      }
      return
    }
    const candidateTexts = [...paragraphsById.values()]
    if (!candidateTexts.some((text) => countQuoteMatches(text, sourceQuote).count > 0)) {
      throw new Error(`${questionId}: trap.sourceQuote quote 必须精确匹配原文。`)
    }
  }
  for (const questionId of expectedQuestionIds) {
    const sourceQuestion = group.questions.find((question) => question.id === questionId)
    const item = analysis.questions[questionId]
    if (!item || typeof item !== 'object') throw new Error(`${questionId}: 缺少题目分析。`)
    if (!item.skill || typeof item.skill !== 'object' || Array.isArray(item.skill)) throw new Error(`${questionId}: skill 必须是对象。`)
    validateReadingSimilarityProfile(item, questionId)
    if (!optionalString(item.questionFocus)) throw new Error(`${questionId}: 缺少 questionFocus。`)
    if (!optionalString(item.stemTranslationZh)) throw new Error(`${questionId}: 缺少 stemTranslationZh。`)
    if (!Array.isArray(item.optionAnalysis)) throw new Error(`${questionId}: optionAnalysis 必须是数组。`)
    if (!Array.isArray(item.locationParaphrases)) throw new Error(`${questionId}: locationParaphrases 必须是数组。`)
    const expectedOptionLabels = Object.keys(sourceQuestion.options).sort()
    const actualOptionLabels = item.optionAnalysis.map((option) => optionalString(option?.label)).sort()
    if (
      actualOptionLabels.length !== expectedOptionLabels.length
      || new Set(actualOptionLabels).size !== actualOptionLabels.length
      || JSON.stringify(actualOptionLabels) !== JSON.stringify(expectedOptionLabels)
    ) {
      throw new Error(`${questionId}: optionAnalysis 必须按题面完整覆盖 A-D 四个选项。`)
    }
    const correctCount = item.optionAnalysis.filter((option) => option?.status === 'correct').length
    if (correctCount !== 1) throw new Error(`${questionId}: optionAnalysis 必须有且只有一个 correct。`)
    const correctOption = item.optionAnalysis.find((option) => option?.status === 'correct')
    if (sourceQuestion?.answerKey && correctOption?.label !== sourceQuestion.answerKey) {
      throw new Error(`${questionId}: AI 答案与答案解析版不一致：官方 ${sourceQuestion.answerKey}，AI ${correctOption?.label || '空'}。`)
    }
    for (const option of item.optionAnalysis) {
      if (
        option?.status === 'wrong'
        && !optionalString(option?.trap?.explanation)
        && !optionalString(option?.trap?.relationNote)
      ) {
        throw new Error(`${questionId}: 每个阅读错项都必须提供可展示的干扰项辨析。`)
      }
      for (const evidence of option?.evidence || []) assertExactQuote(questionId, 'evidence', evidence)
      for (const evidence of option?.trapEvidence || []) assertExactQuote(questionId, 'trapEvidence', evidence)
      if (option?.trap?.sourceQuote) assertTrapSourceQuoteMatch(questionId, option)
    }
    for (const relation of item.locationParaphrases) assertExactQuote(questionId, 'locationParaphrases.targetText', relation)
  }
}

function isRetryableReadingError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/答案解析版不一致/.test(message)) return false
  return /JSON|schemaVersion|questionIds|精确匹配原文|缺少|必须|不匹配|无效/.test(message)
}

export const analyzeReadingImportCandidate = createAnalyzerProviderShell({
  assertInput: assertReadingAnalyzeInput,
  buildMessages: buildReadingAnalysisMessages,
  validate: validateReadingAnalysisShape,
  isRetryable: isRetryableReadingError,
})
