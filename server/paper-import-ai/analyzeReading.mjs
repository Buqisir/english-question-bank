import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { callDeepSeekJson } from '../ai-providers/deepseek.mjs'
import { callGptRelayJson } from '../ai-providers/gptRelay.mjs'
import { extractFirstJsonObject } from './extractJson.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/reading-choice-analysis-v1.md')

export const PAPER_IMPORT_AI_PROVIDERS = ['deepseek-v4-pro', 'gpt-5.5']

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readPrompt() {
  return readFileSync(promptPath, 'utf8')
}

function normalizeProviderId(providerId) {
  const raw = String(providerId || '').trim().toLowerCase()
  if (raw === 'gpt-5.5' || raw === 'openai' || raw === 'chatgpt') return 'gpt-5.5'
  return 'deepseek-v4-pro'
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

function validateAnalysisShape(analysis, { paper, group }) {
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
  for (const questionId of expectedQuestionIds) {
    const sourceQuestion = group.questions.find((question) => question.id === questionId)
    const item = analysis.questions[questionId]
    if (!item || typeof item !== 'object') throw new Error(`${questionId}: 缺少题目分析。`)
    if (!item.skill || typeof item.skill !== 'object' || Array.isArray(item.skill)) throw new Error(`${questionId}: skill 必须是对象。`)
    if (!optionalString(item.questionFocus)) throw new Error(`${questionId}: 缺少 questionFocus。`)
    if (!optionalString(item.stemTranslationZh)) throw new Error(`${questionId}: 缺少 stemTranslationZh。`)
    if (!Array.isArray(item.optionAnalysis)) throw new Error(`${questionId}: optionAnalysis 必须是数组。`)
    if (!Array.isArray(item.locationParaphrases)) throw new Error(`${questionId}: locationParaphrases 必须是数组。`)
    const correctCount = item.optionAnalysis.filter((option) => option?.status === 'correct').length
    if (correctCount !== 1) throw new Error(`${questionId}: optionAnalysis 必须有且只有一个 correct。`)
    const correctOption = item.optionAnalysis.find((option) => option?.status === 'correct')
    if (sourceQuestion?.answerKey && correctOption?.label !== sourceQuestion.answerKey) {
      throw new Error(`${questionId}: AI 答案与答案解析版不一致：官方 ${sourceQuestion.answerKey}，AI ${correctOption?.label || '空'}。`)
    }
    for (const option of item.optionAnalysis) {
      for (const evidence of option?.evidence || []) assertExactQuote(questionId, 'evidence', evidence)
      for (const evidence of option?.trapEvidence || []) assertExactQuote(questionId, 'trapEvidence', evidence)
      if (option?.trap?.sourceQuote) assertExactQuote(questionId, 'trap.sourceQuote', {
        paragraphId: option.trap.paragraphId || option.trap.targetParagraphId,
        quote: option.trap.sourceQuote,
      })
    }
    for (const relation of item.locationParaphrases) assertExactQuote(questionId, 'locationParaphrases.targetText', relation)
  }
}

async function callProvider({ providerId, messages, providerCallers }) {
  const provider = normalizeProviderId(providerId)
  if (provider === 'gpt-5.5') {
    return (providerCallers?.gptRelay || callGptRelayJson)({ messages, model: 'gpt-5.5' })
  }
  return (providerCallers?.deepseek || callDeepSeekJson)({ messages, model: 'deepseek-v4-pro' })
}

async function callProviderWithRetry(args, { retries = 1 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await callProvider(args)
    } catch (error) {
      lastError = error
      if (attempt >= retries) break
    }
  }
  throw lastError
}

function isRetryableAnalysisError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/答案解析版不一致/.test(message)) return false
  return /JSON|schemaVersion|questionIds|精确匹配原文|缺少|必须|不匹配|无效/.test(message)
}

export async function analyzeReadingImportCandidate(input, options = {}) {
  assertReadingAnalyzeInput(input)
  const requestId = options.requestId || randomUUID()
  const providerId = normalizeProviderId(input.providerId)
  const messages = buildReadingAnalysisMessages(input)
  const analysisRetries = Number.isInteger(options.analysisRetries) ? options.analysisRetries : 1
  let lastError
  for (let attempt = 0; attempt <= analysisRetries; attempt += 1) {
    const providerResult = await callProviderWithRetry({
      providerId,
      messages,
      providerCallers: options.providerCallers,
    }, { retries: Number.isInteger(options.providerRetries) ? options.providerRetries : 1 })
    try {
      const analysis = extractFirstJsonObject(providerResult.rawText)
      validateAnalysisShape(analysis, input)
      return {
        analysis,
        provider: providerResult.provider,
        model: providerResult.model,
        requestId,
        latencyMs: providerResult.latencyMs,
      }
    } catch (error) {
      lastError = error
      if (attempt >= analysisRetries || !isRetryableAnalysisError(error)) break
    }
  }
  throw lastError
}
