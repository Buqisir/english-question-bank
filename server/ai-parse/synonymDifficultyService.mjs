// synonym-difficulty service — local-Qwen "原文表达 -> 正确选项表达" 同义替换难度初判.
// Extracted VERBATIM (indent 0, no re-indent) from server/api.mjs (cut H5-K,
// refactor-roadmap-2026-06) so the buildSynonymDifficultyPrompt + classifySynonymDifficultyQuestion
// Chinese prompt template literals stay byte-identical — the prompt text is the frozen AI contract
// and whitespace there is NOT inert. Re-indenting these into a factory body would corrupt the
// multi-line template interiors and silently change the model prompt.
//
// classifySynonymDifficultyQuestion stays file-private (only generateSynonymDifficultyByQuestionGroup
// calls it). The export surface is larger than the roadmap's "only the formatter" note: api.mjs
// re-imports loadSynonymDifficultyKnowledge + the four pure normalizers
// (normalizeSynonymCardId/Confidence/Boolean, uniqueSynonymFlags) +
// formatSynonymDifficultyKnowledgeForReadingPrompt to keep existing injection/call sites working
// (createReadingDifficultyNormalizer injection, createSemanticSearchService /
// createQuestionBankStewardImplementation normalizeSynonymCardId injection, and the always-on
// reading-parse prompt call site). The four pure normalizers take no injected deps; the loader +
// reading-prompt formatter use module-level injected deps (optionalString, knowledgePath) set when
// api.mjs calls the factory at init — before any request-time call.
//
// extractFirstJson + safeTruncate are imported DIRECTLY from the leaf jsonExtraction module (matches
// api.mjs, no cycle). readFileSync (node:fs) + randomUUID (node:crypto) are imported directly.
// isEntityPurposeMentionStem is injected (api.mjs imports it from readingDifficultyNormalizer.mjs and
// passes the binding). Module never imports api.mjs.

import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

import { extractFirstJson, safeTruncate } from '../ai-providers/jsonExtraction.mjs'

let optionalString
let clamp01
let normalizeAnswerValue
let isEntityPurposeMentionStem
let callLocalQwenCompletion
let getQuestionGroupDetail
let elapsedMs
let knowledgePath
let LOCAL_QWEN_CHAT_MODEL
let LOCAL_QWEN_PROVIDER
let QUESTION_BANK_ENABLE_LOCAL_QWEN

export function createSynonymDifficultyImplementation(deps) {
  ;({
    optionalString,
    clamp01,
    normalizeAnswerValue,
    isEntityPurposeMentionStem,
    callLocalQwenCompletion,
    getQuestionGroupDetail,
    elapsedMs,
    knowledgePath,
    LOCAL_QWEN_CHAT_MODEL,
    LOCAL_QWEN_PROVIDER,
    QUESTION_BANK_ENABLE_LOCAL_QWEN,
  } = deps)
  return { generateSynonymDifficultyByQuestionGroup }
}

let synonymDifficultyKnowledgeCache = null

export function loadSynonymDifficultyKnowledge() {
  if (synonymDifficultyKnowledgeCache) return synonymDifficultyKnowledgeCache
  const payload = JSON.parse(readFileSync(knowledgePath, 'utf8'))
  const cards = Array.isArray(payload.cards) ? payload.cards : []
  const cardMap = new Map(cards.map((card) => [optionalString(card.cardId).toUpperCase(), card]))
  synonymDifficultyKnowledgeCache = {
    ...payload,
    cards,
    cardMap,
    cardIds: new Set(cards.map((card) => optionalString(card.cardId).toUpperCase()).filter(Boolean)),
  }
  return synonymDifficultyKnowledgeCache
}

export function normalizeSynonymCardId(value) {
  const raw = optionalString(value).toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''
  const match = raw.match(/^T(?:10|[1-9])$/)
  return match ? match[0] : raw
}

export function normalizeSynonymConfidence(value, fallback = 0.68) {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['high', '高', '较高'].includes(normalized)) return 0.85
    if (['medium', '中', '中等'].includes(normalized)) return 0.66
    if (['low', '低', '较低'].includes(normalized)) return 0.45
  }
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return clamp01(number > 1 ? number / 100 : number)
}

export function normalizeSynonymBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  const text = optionalString(value).toLowerCase()
  if (!text) return false
  return ['true', 'yes', '需要', '是', '1', 'review', 'review_needed'].includes(text)
}

export function uniqueSynonymFlags(values) {
  const allowedFlags = new Set(['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T10', 'T7_T8', 'T6_T9'])
  const flags = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : [values]).forEach((value) => {
    const flag = optionalString(value)
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '')
    if (!flag || seen.has(flag) || !allowedFlags.has(flag)) return
    seen.add(flag)
    flags.push(flag)
  })
  return flags
}

function getCorrectOptionText(question) {
  const answer = normalizeAnswerValue(question.answer).toUpperCase()
  const answerLabel = answer.match(/[A-G]/)?.[0] || ''
  const option = answerLabel
    ? question.options?.find((item) => optionalString(item.label).toUpperCase() === answerLabel)
    : null
  if (option) return `${option.label}. ${option.content}`
  return answer ? `答案：${answer}` : ''
}

function findReadingParseItem(detail, question, overrideReadingParseResult) {
  const parseResult = overrideReadingParseResult || detail.readingParseResult
  const questionNo = optionalString(question.questionNo)
  if (!parseResult || !Array.isArray(parseResult.questions) || !questionNo) return null
  return parseResult.questions.find((item) => optionalString(item.questionNo) === questionNo) || null
}

function selectSynonymMappingForQuestion(readingParseItem, answerLabel) {
  const mappings = Array.isArray(readingParseItem?.synonymMappings) ? readingParseItem.synonymMappings : []
  if (mappings.length === 0) return null
  if (!answerLabel) return mappings[0]

  const matching = mappings.find((mapping) =>
    optionalString(mapping.replacement).toUpperCase().includes(answerLabel.toUpperCase()),
  )
  return matching || mappings[0]
}

function buildSynonymSourceAndOption(detail, question, overrideReadingParseResult) {
  const readingParseItem = findReadingParseItem(detail, question, overrideReadingParseResult)
  const answerLabel = normalizeAnswerValue(question.answer).toUpperCase().match(/[A-G]/)?.[0] || ''
  const mapping = selectSynonymMappingForQuestion(readingParseItem, answerLabel)
  const correctOption = getCorrectOptionText(question)
  let evidenceSource = 'passage_excerpt'
  let sourceExpression = optionalString(mapping?.text)
  if (sourceExpression) {
    evidenceSource = 'saved_synonym_mapping'
  } else {
    sourceExpression = optionalString(readingParseItem?.answerSentence) || optionalString(readingParseItem?.locationSentence)
    if (sourceExpression) {
      evidenceSource = 'saved_reading_parse'
    } else {
      sourceExpression = optionalString(question.explanation)
      if (sourceExpression) {
        evidenceSource = 'question_explanation'
      } else {
        sourceExpression = safeTruncate(optionalString(detail.passage?.materialText), 900)
      }
    }
  }
  const optionExpression =
    optionalString(mapping?.replacement) ||
    correctOption ||
    optionalString(readingParseItem?.answer) ||
    optionalString(question.answer)

  return {
    sourceExpression,
    optionExpression,
    readingParseItem,
    correctOption,
    evidenceSource,
    evidenceWeak: evidenceSource === 'passage_excerpt' || !sourceExpression || !optionExpression,
  }
}

function addSynonymCandidate(target, cardId) {
  const normalized = normalizeSynonymCardId(cardId)
  if (!normalized || target.includes(normalized)) return
  target.push(normalized)
}

function hasLexicalMeaningSignal(stemLower) {
  if (/find out/.test(stemLower)) return false
  return (
    /underlined/.test(stemLower) ||
    /closest in meaning/.test(stemLower) ||
    /\brefer(?:s|red|ring)? to\b/.test(stemLower) ||
    /\bstand(?:s)? for\b/.test(stemLower) ||
    /what does [\s\S]{0,80}\bmean\b/.test(stemLower) ||
    /meaning of/.test(stemLower)
  )
}

function hasMentionIntentSignal(stemLower) {
  if (isEntityPurposeMentionStem(stemLower)) return false
  return (
    /\bmention(?:s|ed|ing)?\b/.test(stemLower) ||
    /\bdiscuss(?:es|ed|ing)?\b/.test(stemLower) ||
    /\blist(?:s|ed|ing)?\b/.test(stemLower) ||
    /by mentioning/.test(stemLower) ||
    /purpose in mentioning/.test(stemLower) ||
    /why does [\s\S]{0,80}\b(?:refer to|cite|give the example|use the example)\b/.test(stemLower) ||
    /提及|提到|引用|举例|例子|为了说明|用来说明/.test(stemLower)
  )
}

function hasParagraphFunctionSignal(stemLower, optionLower) {
  if (hasMentionIntentSignal(stemLower)) return false
  return (
    /function of (?:the )?(?:paragraph|section)/.test(stemLower) ||
    /purpose of (?:the )?(?:paragraph|section)/.test(stemLower) ||
    /how does (?:the )?author (?:present|develop|organize)/.test(stemLower) ||
    /by giving examples|by comparison|by analogy/.test(optionLower)
  )
}

function hasTitleOrMainIdeaSignal(stemLower) {
  return (
    /best title/.test(stemLower) ||
    /suitable title/.test(stemLower) ||
    /main idea/.test(stemLower) ||
    /mainly about/.test(stemLower) ||
    /mainly talk/.test(stemLower) ||
    /what is (?:the )?(?:text|passage|paragraph)[\s\S]{0,60}mainly/.test(stemLower) ||
    /\btitle\b/.test(stemLower)
  )
}

function hasAttitudeSignal(stemLower, optionLower) {
  return (
    /\battitude\b|\btone\b|\bview\b|\bfeel(?:s|ing)? about\b|\bthink(?:s)? of\b/.test(stemLower) ||
    /critical|objective|supportive|skeptical|sceptical|neutral|positive|negative|workable|attached/.test(optionLower)
  )
}

function hasAbstractPhraseOptionSignal(optionLower) {
  return (
    /barrier to entry|low barrier|far-reaching|unforgettable experience/.test(optionLower) ||
    /\bthe (?:value|importance|significance|nature|role|impact|effect|potential|limitation|challenge|appeal|benefit|drawback) of\b/.test(optionLower)
  )
}

function hasInferenceSignal(stemLower) {
  return (
    /\binfer\b|\bimply\b|\bimplies\b|\bsuggest(?:s|ed)?\b|\bconclude\b|\bindicate(?:s|d)?\b/.test(stemLower) ||
    /what can we learn/.test(stemLower) ||
    /\bwhy\b/.test(stemLower) ||
    /\breason\b/.test(stemLower)
  )
}

function hasMultiPointSignal(stemLower, sourceLower) {
  return (
    /how many|how much|when|where|which of the following|according to/.test(stemLower) &&
    /(?:\d|am|pm|monday|tuesday|wednesday|thursday|friday|saturday|sunday|first|second|third|condition|if|unless)/.test(sourceLower)
  )
}

function routeSynonymDifficultyCandidates({ question, sourceExpression, optionExpression }) {
  const stemLower = optionalString(question.stem).toLowerCase()
  const sourceLower = optionalString(sourceExpression).toLowerCase()
  const optionLower = optionalString(optionExpression).toLowerCase()
  const candidates = []
  const routeReasons = []
  const boundaryFlags = []
  const abstractPhraseSignal = hasAbstractPhraseOptionSignal(optionLower)

  if (hasLexicalMeaningSignal(stemLower)) {
    addSynonymCandidate(candidates, 'T3')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T6')
    routeReasons.push('题干含猜词或指代信号，优先走T3。')
  }

  if (hasMentionIntentSignal(stemLower)) {
    addSynonymCandidate(candidates, 'T7')
    addSynonymCandidate(candidates, 'T8')
    addSynonymCandidate(candidates, 'T6')
    boundaryFlags.push('T7_T8')
    routeReasons.push('题干含mention/举例意图信号，优先走T7。')
  } else if (hasParagraphFunctionSignal(stemLower, optionLower)) {
    addSynonymCandidate(candidates, 'T8')
    addSynonymCandidate(candidates, 'T7')
    addSynonymCandidate(candidates, 'T5')
    boundaryFlags.push('T7_T8')
    routeReasons.push('题干或选项含段落功能信号，优先走T8。')
  }

  if (hasTitleOrMainIdeaSignal(stemLower)) {
    addSynonymCandidate(candidates, 'T5')
    addSynonymCandidate(candidates, 'T10')
    addSynonymCandidate(candidates, 'T6')
    boundaryFlags.push('T5_T10')
    routeReasons.push('题干含主旨或标题信号，只在T5/T10为主的候选内判断。')
  }

  if (hasAttitudeSignal(stemLower, optionLower)) {
    addSynonymCandidate(candidates, 'T9')
    addSynonymCandidate(candidates, 'T6')
    addSynonymCandidate(candidates, 'T10')
    boundaryFlags.push('T6_T9')
    routeReasons.push('题干或选项含态度立场信号，纳入T9。')
  }

  if (hasInferenceSignal(stemLower) && candidates.length === 0) {
    addSynonymCandidate(candidates, 'T6')
    if (abstractPhraseSignal) addSynonymCandidate(candidates, 'T10')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T4')
    if (abstractPhraseSignal) boundaryFlags.push('T6_T10')
    routeReasons.push('题干含推断信号，优先走T6。')
  }

  if (abstractPhraseSignal && !candidates.includes('T10')) {
    addSynonymCandidate(candidates, 'T10')
    addSynonymCandidate(candidates, 'T6')
    boundaryFlags.push('T6_T10')
    routeReasons.push('正确选项含抽象概念短语，纳入T10并检查T6/T10边界。')
  }

  if (hasMultiPointSignal(stemLower, sourceLower)) {
    addSynonymCandidate(candidates, 'T4')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T6')
    routeReasons.push('题干与证据含时间、数字或多条件信号，纳入T4。')
  }

  if (candidates.length === 0) {
    addSynonymCandidate(candidates, 'T1')
    addSynonymCandidate(candidates, 'T2')
    addSynonymCandidate(candidates, 'T6')
    routeReasons.push('无特殊题干信号，按细节题常见T1/T2/T6判断。')
  }

  if (candidates.includes('T1') && candidates.includes('T2')) {
    boundaryFlags.push('T1_T2')
  }
  if (candidates.includes('T2') && candidates.includes('T6')) {
    boundaryFlags.push('T2_T6')
  }

  return {
    candidateCards: candidates.slice(0, 5),
    routeReasons,
    boundaryFlags: uniqueSynonymFlags(boundaryFlags),
  }
}

function formatSynonymDifficultyCardForPrompt(card) {
  return [
    `${card.cardId} ${card.name}`,
    `SOLO：${card.soloLevel}；高阶思维：${card.higherOrderThinking}；默认难度：${card.difficultyDefault}`,
    `定义：${card.definition}`,
    `信号：${(card.signals || []).join('；')}`,
    `边界：${card.caution || '无'}`,
    `8B提示：${card.promptHintFor8B || ''}`,
  ].join('\n')
}

export function formatSynonymDifficultyKnowledgeForReadingPrompt() {
  const knowledge = loadSynonymDifficultyKnowledge()
  return knowledge.cards
    .map((card) =>
      [
        `${card.cardId} ${card.name}`,
        `SOLO：${card.soloLevel}；高阶思维：${card.higherOrderThinking}；默认难度：${card.difficultyDefault}`,
        `定义：${card.definition}`,
        `信号：${(card.signals || []).join('；')}`,
        `边界：${card.caution || '无'}`,
      ].join('；'),
    )
    .join('\n')
}

function buildSynonymDifficultyPrompt({ knowledge, question, sourceExpression, optionExpression, candidateCards, routeReasons }) {
  const cardText = candidateCards
    .map((cardId) => knowledge.cardMap.get(cardId))
    .filter(Boolean)
    .map(formatSynonymDifficultyCardForPrompt)
    .join('\n\n')
  const optionsText = question.options?.length
    ? question.options.map((option) => `${option.label}. ${option.content}`).join('\n')
    : '（无选项）'

  return `你是高考英语阅读题“原文表达 -> 正确选项表达”的同义替换难度初判助手。

你只能从候选卡中选择cardId，不能输出候选卡以外的类型。
候选cardId：${candidateCards.join(', ')}

硬规则：
1. 输出必须是一个JSON对象，不要markdown，不要解释性正文。
2. cardId只能是候选cardId之一。
3. difficultyDefault不用你判断，程序会根据cardId回填；你可以不输出。
4. T10必须review_needed=true。
5. T7/T8先找上下文论点，再判断例子/段落服务于哪个论点；不允许只从选项里“To show”“By giving examples”等标签反推。
6. T3只用于underlined/closest in meaning/refer to/mean等词义语境题；find out不是T3信号。
7. T1只用于近乎原词复现；只要有明确语义或句式改写，优先T2。

候选知识卡：
${cardText}

路由依据：
${routeReasons.join('\n') || '无'}

题目信息：
题号：${question.questionNo}
题型：${question.questionType || '阅读理解'}
题干：${question.stem}
选项：
${optionsText}
录入答案：${question.answer || '（无）'}

原文表达（不要缩写，按给定内容判断）：
${sourceExpression || '（缺少明确原文表达，请降低置信度）'}

正确选项表达（不要缩写，按给定内容判断）：
${optionExpression || '（缺少明确选项表达，请降低置信度）'}

只返回JSON：
{
  "cardId": "候选cardId之一",
  "confidence": 0.0,
  "review_needed": false,
  "boundaryFlags": ["可选，如T5_T10"],
  "reason": "用中文一句话说明为什么是这个类型，必须基于原文表达与正确选项表达。"
}`
}

function extractSynonymDifficultyPayload(payload) {
  if (!payload || typeof payload !== 'object') return null
  if (payload.cardId || payload.typeId || payload.type || payload.label) return payload
  const candidates = [payload.result, payload.classification, payload.answer, payload.output, payload.data]
  for (const candidate of candidates) {
    const nested = extractSynonymDifficultyPayload(candidate)
    if (nested) return nested
  }
  if (Array.isArray(payload.results) && payload.results.length > 0) {
    return extractSynonymDifficultyPayload(payload.results[0])
  }
  return null
}

function buildSynonymDeepSeekTriggers({ cardId, confidence, reviewNeeded, boundaryFlags, candidateCards, invalidCardId, evidenceWeak }) {
  const triggers = []
  if (reviewNeeded) triggers.push('review_needed')
  if (['T7', 'T8', 'T9', 'T10'].includes(cardId)) triggers.push('advanced_type')
  if (confidence < 0.72) triggers.push('low_confidence')
  if (evidenceWeak) triggers.push('weak_evidence_anchor')
  if (boundaryFlags.some((flag) => ['T5_T10', 'T6_T10', 'T7_T8', 'T6_T9', 'T2_T6'].includes(flag))) {
    triggers.push('boundary_fuzzy')
  }
  if (candidateCards.length > 2) triggers.push('wide_candidate_set')
  if (invalidCardId) triggers.push('invalid_card_replaced')
  return [...new Set(triggers)]
}

function normalizeSynonymDifficultyResult(rawPayload, context) {
  const knowledge = context.knowledge
  const candidateSet = new Set(context.candidateCards)
  const payload = extractSynonymDifficultyPayload(rawPayload) || {}
  const rawCardId = normalizeSynonymCardId(payload.cardId || payload.typeId || payload.type || payload.label)
  const invalidCardId = rawCardId && !candidateSet.has(rawCardId)
  const fallbackCardId = context.candidateCards[0] || 'T2'
  const cardId = !invalidCardId && rawCardId ? rawCardId : fallbackCardId
  const card = knowledge.cardMap.get(cardId) || knowledge.cardMap.get(fallbackCardId)
  const confidence = normalizeSynonymConfidence(payload.confidence ?? payload.score ?? payload.conf, invalidCardId ? 0.45 : 0.68)
  const rawReviewNeeded =
    normalizeSynonymBoolean(payload.review_needed ?? payload.reviewNeeded ?? payload.needsReview ?? payload.review)
  const boundaryFlags = uniqueSynonymFlags([
    ...context.boundaryFlags,
    ...(Array.isArray(payload.boundaryFlags) ? payload.boundaryFlags : []),
    ...(Array.isArray(payload.boundary_flags) ? payload.boundary_flags : []),
    context.evidenceWeak ? 'BROAD_PASSAGE_EVIDENCE' : '',
    invalidCardId ? 'INVALID_CARD_REPLACED' : '',
  ])
  const reviewNeeded =
    rawReviewNeeded ||
    invalidCardId ||
    context.evidenceWeak ||
    cardId === 'T10' ||
    confidence < 0.72 ||
    ['T7', 'T8', 'T9'].includes(cardId)
  const deepSeekTriggers = buildSynonymDeepSeekTriggers({
    cardId,
    confidence,
    reviewNeeded,
    boundaryFlags,
    candidateCards: context.candidateCards,
    invalidCardId,
    evidenceWeak: context.evidenceWeak,
  })

  return {
    questionId: context.question.id,
    questionNo: context.question.questionNo,
    cardId,
    name: card?.name || cardId,
    soloLevel: card?.soloLevel || '',
    higherOrderThinking: card?.higherOrderThinking || '',
    difficultyDefault: Number(card?.difficultyDefault || 0) || 0,
    confidence,
    reviewNeeded,
    boundaryFlags,
    deepSeekRecommended: deepSeekTriggers.length > 0,
    deepSeekTriggers,
    candidateCards: context.candidateCards,
    routeReasons: context.routeReasons,
    reason: optionalString(payload.reason || payload.reasoning || payload.whyThisType || payload.analysis) ||
      (invalidCardId ? '8B输出了候选范围外的类型，已按路由候选兜底并标记复核。' : '8B未返回明确理由，需人工复核。'),
    sourceExpression: context.sourceExpression,
    optionExpression: context.optionExpression,
    evidenceSource: context.evidenceSource,
    provider: LOCAL_QWEN_PROVIDER,
    model: LOCAL_QWEN_CHAT_MODEL,
    latencyMs: context.latencyMs,
    retryCount: context.retryCount,
    rawCardId: rawCardId || '',
    invalidCardId: Boolean(invalidCardId),
  }
}

async function classifySynonymDifficultyQuestion(context) {
  const messages = [
    {
      role: 'system',
      content: '你只输出JSON对象。你必须遵守候选cardId白名单，不能编造类型。',
    },
    {
      role: 'user',
      content: buildSynonymDifficultyPrompt(context),
    },
  ]

  const startedAt = Date.now()
  const firstResult = await callLocalQwenCompletion({
    model: LOCAL_QWEN_CHAT_MODEL,
    provider: LOCAL_QWEN_PROVIDER,
    messages,
    temperature: 0,
    maxTokens: 700,
  })
  let parsed = extractFirstJson(firstResult.rawText) || extractFirstJson(firstResult.firstMessageText) || extractFirstJson(firstResult.rawStatusText)
  let normalized = normalizeSynonymDifficultyResult(parsed, {
    ...context,
    latencyMs: firstResult.latencyMs,
    retryCount: 0,
  })

  if (normalized.invalidCardId || !parsed) {
    const retryResult = await callLocalQwenCompletion({
      model: LOCAL_QWEN_CHAT_MODEL,
      provider: LOCAL_QWEN_PROVIDER,
      messages: [
        messages[0],
        {
          role: 'user',
          content: `${messages[1].content}\n\n上次输出无效。请重新输出一个JSON对象，cardId必须严格属于：${context.candidateCards.join(', ')}。`,
        },
      ],
      temperature: 0,
      maxTokens: 500,
    })
    parsed = extractFirstJson(retryResult.rawText) || extractFirstJson(retryResult.firstMessageText) || extractFirstJson(retryResult.rawStatusText)
    normalized = normalizeSynonymDifficultyResult(parsed, {
      ...context,
      latencyMs: elapsedMs(startedAt),
      retryCount: 1,
    })
  }

  return normalized
}

async function generateSynonymDifficultyByQuestionGroup(questionGroupId, input = {}) {
  if (!QUESTION_BANK_ENABLE_LOCAL_QWEN) {
    throw new Error('题库本地 Qwen 初判已停用。请使用 DeepSeek 阅读解析内置的 synonymDifficulty。')
  }

  const startedAt = Date.now()
  const resolvedRequestId = input.requestId || randomUUID()
  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }
  if (detail.groupType !== 'reading') {
    throw new Error('同义替换难度初判目前仅支持阅读理解题组。')
  }

  const knowledge = loadSynonymDifficultyKnowledge()
  console.log(
    `AI synonym difficulty trace=${resolvedRequestId} group=${questionGroupId} model=${LOCAL_QWEN_CHAT_MODEL} provider=${LOCAL_QWEN_PROVIDER} questionCount=${detail.questions.length}`,
  )

  const results = []
  for (const question of detail.questions) {
    const { sourceExpression, optionExpression, evidenceSource, evidenceWeak } = buildSynonymSourceAndOption(
      detail,
      question,
      input.readingParseResult,
    )
    const routed = routeSynonymDifficultyCandidates({ question, sourceExpression, optionExpression })
    const candidateCards = routed.candidateCards.filter((cardId) => knowledge.cardIds.has(cardId))
    if (candidateCards.length === 0) {
      candidateCards.push('T2')
    }

    try {
      const result = await classifySynonymDifficultyQuestion({
        knowledge,
        question,
        sourceExpression,
        optionExpression,
        evidenceSource,
        evidenceWeak,
        candidateCards,
        routeReasons: routed.routeReasons,
        boundaryFlags: routed.boundaryFlags,
      })
      results.push(result)
    } catch (error) {
      const card = knowledge.cardMap.get(candidateCards[0]) || knowledge.cardMap.get('T2')
      results.push({
        questionId: question.id,
        questionNo: question.questionNo,
        cardId: card?.cardId || candidateCards[0] || 'T2',
        name: card?.name || '待复核',
        soloLevel: card?.soloLevel || '',
        higherOrderThinking: card?.higherOrderThinking || '',
        difficultyDefault: Number(card?.difficultyDefault || 0) || 0,
        confidence: 0.35,
        reviewNeeded: true,
        boundaryFlags: uniqueSynonymFlags([...routed.boundaryFlags, 'LOCAL_MODEL_ERROR']),
        deepSeekRecommended: true,
        deepSeekTriggers: ['local_model_error', 'review_needed'],
        candidateCards,
        routeReasons: routed.routeReasons,
        reason: error instanceof Error ? `本地8B初判失败：${error.message}` : '本地8B初判失败。',
        sourceExpression,
        optionExpression,
        evidenceSource,
        provider: LOCAL_QWEN_PROVIDER,
        model: LOCAL_QWEN_CHAT_MODEL,
        latencyMs: 0,
        retryCount: 0,
        rawCardId: '',
        invalidCardId: false,
      })
    }
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    classifiedCount: results.length,
    reviewNeededCount: results.filter((item) => item.reviewNeeded).length,
    deepSeekRecommendedCount: results.filter((item) => item.deepSeekRecommended).length,
    provider: LOCAL_QWEN_PROVIDER,
    model: LOCAL_QWEN_CHAT_MODEL,
    keySource: 'local',
    requestId: resolvedRequestId,
    knowledgeVersion: knowledge.version || '',
    totalLatencyMs: elapsedMs(startedAt),
    results,
  }
}
