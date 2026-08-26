import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAnalyzerProviderShell, readPromptFile, rewriteApiPrompt } from './analyzerProviderShell.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const promptPath = path.join(rootDir, 'prompts/seven-choices-analysis-v1.md')

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readApiPrompt() {
  return rewriteApiPrompt(readPromptFile(promptPath))
}

function assertSevenChoicesAnalyzeInput(input) {
  const paper = input?.paper
  const group = input?.group
  if (!paper || typeof paper !== 'object') throw new Error('缺少 paper。')
  if (!group || typeof group !== 'object') throw new Error('缺少 seven choices group。')
  if (!optionalString(paper.paperId)) throw new Error('paper.paperId 不能为空。')
  if (!optionalString(group.groupId)) throw new Error('group.groupId 不能为空。')
  if (!Array.isArray(group.paragraphs) || group.paragraphs.length === 0) throw new Error('group.paragraphs 不能为空。')
  if (!Array.isArray(group.questions) || group.questions.length !== 5) throw new Error('七选五 group 必须有 5 道题。')
  if (!Array.isArray(group.optionBank) || group.optionBank.length !== 7) throw new Error('七选五 group 必须有 7 个选项 (A-G)。')
  for (const question of group.questions) {
    if (!optionalString(question?.id)) throw new Error('题目缺少 id。')
    if (!optionalString(question?.blankId)) throw new Error(`题目 ${question?.id || ''} 缺少 blankId。`)
  }
  for (const option of group.optionBank) {
    if (!optionalString(option?.label)) throw new Error('optionBank 条目缺少 label。')
    if (!optionalString(option?.text)) throw new Error(`选项 ${option?.label || ''} 缺少 text。`)
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
          groupType: 'sevenChoices',
          title: group.title || '七选五',
          order: Number(group.order || 0),
          passage: {
            title: group.title || '七选五',
            paragraphs: group.paragraphs.map((paragraph) => ({
              paragraphId: paragraph.id,
              text: paragraph.text,
            })),
          },
          optionBank: group.optionBank.map((option) => ({
            label: option.label,
            text: option.text,
          })),
          questions: group.questions.map((q) => ({
            questionId: q.id,
            questionNo: Number(q.stem) || 0,
            blankId: q.blankId,
          })),
        },
      },
    },
    answerKey: Object.fromEntries(group.questions.map((q) => [q.id, q.answerKey || ''])),
  }
}

export function buildSevenChoicesAnalysisMessages({ paper, group }) {
  const promptInput = buildPromptInput({ paper, group })
  return [
    {
      role: 'system',
      content: readApiPrompt(),
    },
    {
      role: 'user',
      content: [
        'Create exactly one seven-choices-analysis-v1 JSON object for the target group below.',
        'Return JSON text only. The first character must be { and the final character must be }.',
        '',
        'Structured input:',
        JSON.stringify(promptInput, null, 2),
      ].join('\n'),
    },
  ]
}

export function validateSevenChoicesShape(analysis, { paper, group }) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) throw new Error('AI 未返回 JSON 对象。')
  if (analysis.schemaVersion !== 'seven-choices-analysis-v1') throw new Error('AI JSON schemaVersion 不正确。')
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

  const expectedQuestionIds = group.questions.map((q) => q.id).sort()
  const actualQuestionIds = Object.keys(analysis.questions).sort()
  if (JSON.stringify(actualQuestionIds) !== JSON.stringify(expectedQuestionIds)) {
    throw new Error(`AI JSON questionIds 不匹配：expected ${expectedQuestionIds.join(', ')}, got ${actualQuestionIds.join(', ')}`)
  }

  // Build passage text for exact-quote validation.
  const passageText = group.paragraphs.map((p) => p.text).join('\n')
  const optionTextByLabel = Object.fromEntries(group.optionBank.map((o) => [o.label, o.text]))

  const assertExactQuote = (questionId, fieldName, signalText, side) => {
    if (!signalText) return
    if (side === 'option') {
      // signalText must appear somewhere in the option bank.
      const found = group.optionBank.some((o) => o.text.includes(signalText))
      if (!found) throw new Error(`${questionId}: ${fieldName} signalText "${signalText}" 未在选项池中定位。`)
    } else {
      if (!passageText.includes(signalText)) {
        throw new Error(`${questionId}: ${fieldName} signalText "${signalText}" 必须精确匹配原文。`)
      }
    }
  }

  for (const questionId of expectedQuestionIds) {
    const sourceQuestion = group.questions.find((q) => q.id === questionId)
    const item = analysis.questions[questionId]
    if (!item || typeof item !== 'object') throw new Error(`${questionId}: 缺少题目分析。`)
    if (!optionalString(item.blankId)) throw new Error(`${questionId}: 缺少 blankId。`)
    if (!optionalString(item.positionFacet)) throw new Error(`${questionId}: 缺少 positionFacet。`)
    if (!optionalString(item.roleFacet)) throw new Error(`${questionId}: 缺少 roleFacet。`)
    if (!optionalString(item.primaryMechanismFacet)) throw new Error(`${questionId}: 缺少 primaryMechanismFacet。`)
    if (!Array.isArray(item.topicClues) || item.topicClues.length === 0) throw new Error(`${questionId}: topicClues 不能为空。`)
    if (!item.contextEvidence || typeof item.contextEvidence !== 'object') throw new Error(`${questionId}: 缺少 contextEvidence。`)
    if (!Array.isArray(item.mechanismSignals) || item.mechanismSignals.length < 2) throw new Error(`${questionId}: mechanismSignals 至少需要 2 个。`)
    if (!item.optionFit || typeof item.optionFit !== 'object') throw new Error(`${questionId}: 缺少 optionFit。`)
    if (!optionalString(item.teachingNote)) throw new Error(`${questionId}: 缺少 teachingNote。`)

    // Validate optionLabel matches answer key.
    const correctLabel = optionalString(item.optionFit?.correctOptionLabel)
    if (sourceQuestion?.answerKey && correctLabel && correctLabel !== sourceQuestion.answerKey) {
      throw new Error(`${questionId}: AI 答案与答案解析版不一致：官方 ${sourceQuestion.answerKey}，AI ${correctLabel}。`)
    }

    // Validate mechanismSignals have exact quotes.
    for (const signal of item.mechanismSignals) {
      const signalText = optionalString(signal?.signalText)
      const side = optionalString(signal?.signalSide)
      if (!signalText) continue
      assertExactQuote(questionId, 'mechanismSignals', signalText, side)
    }

    // Validate contextEvidence quotes.
    if (item.contextEvidence) {
      const beforeQuote = optionalString(item.contextEvidence.beforeQuote)
      const afterQuote = optionalString(item.contextEvidence.afterQuote)
      if (beforeQuote && !passageText.includes(beforeQuote)) {
        throw new Error(`${questionId}: contextEvidence.beforeQuote 必须精确匹配原文。`)
      }
      if (afterQuote && !passageText.includes(afterQuote)) {
        throw new Error(`${questionId}: contextEvidence.afterQuote 必须精确匹配原文。`)
      }
    }
  }
}

function isRetryableSevenChoicesError(error) {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/答案解析版不一致/.test(message)) return false
  return /JSON|schemaVersion|questionIds|精确匹配原文|缺少|必须|不匹配|无效|至少需要/.test(message)
}

export const analyzeSevenChoicesImportCandidate = createAnalyzerProviderShell({
  assertInput: assertSevenChoicesAnalyzeInput,
  buildMessages: buildSevenChoicesAnalysisMessages,
  validate: validateSevenChoicesShape,
  isRetryable: isRetryableSevenChoicesError,
})
