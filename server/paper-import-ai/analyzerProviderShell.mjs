import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { callDeepSeekJson } from '../ai-providers/deepseek.mjs'
import { callGptRelayJson } from '../ai-providers/gptRelay.mjs'
import { extractFirstJsonObject } from './extractJson.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const teachingAnalysisStylePath = path.resolve(
  __dirname,
  '../../.agents/skills/importing-nck1-papers/reference/teaching-analysis-style-v1.md',
)

// ============================================================
// Byte-identical provider-call shell shared across the 4
// import-analysis modules (analyzeReading / Cloze / GrammarFill /
// SevenChoices).  What varies per type is injected:
//   - assertInput(input)            per-type input assertion
//   - buildMessages(input)          per-type prompt builder
//   - validate(analysis, input)     per-type shape validator
//   - isRetryable(error)            per-type retry predicate (regex differs)
//   - beforeValidate(analysis, ctx) optional pre-validate hook (stampMeta)
// ============================================================

export function readPromptFile(promptPath) {
  return readFileSync(promptPath, 'utf8')
}

export function readTeachingAnalysisPrompt(promptPath) {
  return [
    readPromptFile(promptPath).trimEnd(),
    '',
    '---',
    '',
    readPromptFile(teachingAnalysisStylePath).trim(),
  ].join('\n')
}

export function rewriteApiPrompt(raw) {
  return raw.replace(
    /## Output Requirement[\s\S]*?## Reasoning Rule/,
    [
      '## Output Requirement',
      '',
      'You MUST return exactly one JSON object as plain text in this API response.',
      'The first non-whitespace character MUST be `{` and the final non-whitespace character MUST be `}`.',
      '',
      'Do NOT create or download a file.',
      'Do NOT return `UNABLE_TO_CREATE_FILE`.',
      'Do NOT wrap JSON in markdown fences.',
      'Do NOT write a filename heading.',
      'Do NOT write "Here is the JSON".',
      'Do NOT explain what you are doing.',
      '',
      '## Reasoning Rule',
    ].join('\n'),
  )
}

export function assertFullTranslationZh(groupAnalysis, group, { requireBlankMarkers = false } = {}) {
  const translation = typeof groupAnalysis?.fullTranslationZh === 'string'
    ? groupAnalysis.fullTranslationZh.trim()
    : ''
  if (!translation) {
    throw new Error('AI JSON groups.fullTranslationZh 不能为空。')
  }
  if (!requireBlankMarkers) return
  let previousMarkerIndex = -1
  for (const question of group.questions || []) {
    const blankNo = Number(question?.stem)
    if (!Number.isInteger(blankNo)) {
      throw new Error(`${question?.id || 'unknown'}: 无法确定全文译文中的空号。`)
    }
    const marker = `[${blankNo}]`
    const occurrences = translation.split(marker).length - 1
    if (occurrences !== 1) {
      throw new Error(`AI JSON groups.fullTranslationZh 必须且只能包含一次 ${marker}。`)
    }
    const markerIndex = translation.indexOf(marker)
    if (markerIndex <= previousMarkerIndex) {
      throw new Error(`AI JSON groups.fullTranslationZh 中的 ${marker} 必须按题面空号顺序出现。`)
    }
    previousMarkerIndex = markerIndex
  }
}

function selectedSentenceAnswer(question, group) {
  const answer = String(question?.answerKey || '').trim()
  if (!answer) return ''
  if (Array.isArray(question?.options)) {
    const option = question.options.find(({ label }) => label === answer)
    if (option?.text) return String(option.text)
  } else if (question?.options && typeof question.options === 'object') {
    if (question.options[answer]) return String(question.options[answer])
  }
  const bankOption = (group.optionBank || []).find(({ label }) => label === answer)
  return String(bankOption?.text || answer)
}

function answerCompletedSentence(sourceText, group) {
  const questionsByNumber = new Map((group.questions || []).map((question) => [
    Number(question.stem),
    question,
  ]))
  return sourceText.replace(/__\s*(\d{1,3})\s*__(\s*\(([^)]*)\))?/gu, (
    marker,
    rawNumber,
    possibleHint,
    possibleHintText,
    offset,
  ) => {
    const blankNo = Number(rawNumber)
    const question = questionsByNumber.get(blankNo)
    let answer = selectedSentenceAnswer(question, group)
    if (!question || !answer) {
      throw new Error(`AI JSON selectedLongSentences 无法按权威答案补全空号 ${blankNo}。`)
    }
    const prompt = String(question.prompt || '').trim()
    const consumedHint = prompt && String(possibleHintText || '').trim() === prompt
    const suffix = consumedHint ? '' : String(possibleHint || '')
    const previousCharacter = sourceText[offset - 1] || ''
    const nextCharacter = sourceText[offset + marker.length] || ''
    if (/[\p{L}\p{N}]$/u.test(previousCharacter) && /^[\p{L}\p{N}]/u.test(answer)) answer = ` ${answer}`
    if (/[\p{L}\p{N}]$/u.test(answer) && /^[\p{L}\p{N}]/u.test(nextCharacter)) answer = `${answer} `
    return `${answer}${suffix}`
  })
}

export function assertSelectedLongSentences(groupAnalysis, group, { required = false } = {}) {
  const sentences = groupAnalysis?.selectedLongSentences
  if (sentences === undefined && !required) return
  if (!Array.isArray(sentences) || sentences.length < 1 || sentences.length > 2) {
    throw new Error('AI JSON groups.selectedLongSentences 必须包含 1—2 个长难句。')
  }

  const paragraphsById = new Map((group.paragraphs || []).map((paragraph) => [
    paragraph.id,
    paragraph.text,
  ]))
  const questionIds = new Set((group.questions || []).map(({ id }) => id))
  for (const [index, sentence] of sentences.entries()) {
    const label = `selectedLongSentences[${index}]`
    if (!sentence || typeof sentence !== 'object' || Array.isArray(sentence)) {
      throw new Error(`AI JSON ${label} 必须是对象。`)
    }
    const paragraphId = String(sentence.paragraphId || '').trim()
    const sourceText = String(sentence.sourceText || '').trim()
    const displayText = String(sentence.displayText || '').trim()
    const translationZh = String(sentence.translationZh || '').trim()
    const analysisZh = String(sentence.analysisZh || '').trim()
    const paragraphText = paragraphsById.get(paragraphId)
    if (!paragraphText) throw new Error(`AI JSON ${label}.paragraphId 不属于当前题组。`)
    if (!sourceText || !paragraphText.includes(sourceText)) {
      throw new Error(`AI JSON ${label}.sourceText 必须精确匹配所在原文段落。`)
    }
    if (!displayText || displayText !== answerCompletedSentence(sourceText, group)) {
      throw new Error(`AI JSON ${label}.displayText 必须是按权威答案补全后的 sourceText。`)
    }
    if (!translationZh || !analysisZh) {
      throw new Error(`AI JSON ${label} 必须包含 translationZh 和 analysisZh。`)
    }

    const relatedQuestionIds = sentence.relatedQuestionIds
    if (
      !Array.isArray(relatedQuestionIds)
      || relatedQuestionIds.length < 1
      || new Set(relatedQuestionIds).size !== relatedQuestionIds.length
      || relatedQuestionIds.some((questionId) => !questionIds.has(questionId))
    ) {
      throw new Error(`AI JSON ${label}.relatedQuestionIds 必须引用当前题组内的不重复题目。`)
    }

    const underlineTexts = sentence.underlineTexts
    if (
      !Array.isArray(underlineTexts)
      || underlineTexts.length < 1
      || underlineTexts.length > 3
      || new Set(underlineTexts).size !== underlineTexts.length
    ) {
      throw new Error(`AI JSON ${label}.underlineTexts 必须包含 1—3 个不重复片段。`)
    }
    const spans = underlineTexts.map((rawText) => {
      const text = String(rawText || '').trim()
      const start = displayText.indexOf(text)
      if (!text || start < 0 || start !== displayText.lastIndexOf(text)) {
        throw new Error(`AI JSON ${label}.underlineTexts 必须在 displayText 中唯一精确定位。`)
      }
      return { start, end: start + text.length }
    }).sort((left, right) => left.start - right.start)
    for (let spanIndex = 1; spanIndex < spans.length; spanIndex += 1) {
      if (spans[spanIndex].start < spans[spanIndex - 1].end) {
        throw new Error(`AI JSON ${label}.underlineTexts 不能互相重叠。`)
      }
    }
  }
}

function normalizeProviderId(providerId) {
  const raw = String(providerId || '').trim().toLowerCase()
  if (raw === 'gpt-5.5' || raw === 'openai' || raw === 'chatgpt') return 'gpt-5.5'
  return 'deepseek-v4-pro'
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

/**
 * createAnalyzerProviderShell — factory that returns a single async function
 * `runAnalysis(input, options)` embodying the shared provider-call + retry +
 * JSON-extraction + validate orchestration.
 *
 * Injected per type:
 *   assertInput(input)              — throws on bad input
 *   buildMessages(input)            — returns [{role, content}] array
 *   validate(analysis, input)       — throws on bad AI JSON shape
 *   isRetryable(error) → boolean    — per-type retry predicate
 *   beforeValidate(analysis, ctx)   — optional; called after JSON extraction,
 *                                     before validate (used for stampMeta)
 */
export function createAnalyzerProviderShell({
  assertInput,
  buildMessages,
  validate,
  isRetryable,
  beforeValidate = null,
}) {
  return async function runAnalysis(input, options = {}) {
    assertInput(input)
    const requestId = options.requestId || randomUUID()
    const providerId = normalizeProviderId(input.providerId)
    const messages = buildMessages(input)
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
        if (beforeValidate) beforeValidate(analysis, { providerResult, providerId })
        validate(analysis, input)
        return {
          analysis,
          provider: providerResult.provider,
          model: providerResult.model,
          requestId,
          latencyMs: providerResult.latencyMs,
        }
      } catch (error) {
        lastError = error
        if (attempt >= analysisRetries || !isRetryable(error)) break
      }
    }
    throw lastError
  }
}
