// question-group parse service — the 4 DeepSeek per-type parse owners
// (reading / cloze / grammar-fill / seven-choices) moved VERBATIM (indent 0, no re-indent)
// out of server/api.mjs (cut H5-L, refactor-roadmap-2026-06).
//
// The owners build a Chinese user-message template literal and call callDeepSeekWithFallback,
// then normalize and return a parse envelope. That envelope IS the persisted payload_json shape
// (saved later by retained route code in api.mjs); there are NO DB writes here. Keeping every
// moved fn at module indent 0 keeps those inline Chinese template literals byte-identical — a
// mechanical re-indent into a factory body would corrupt the template interiors.
//
// The 4 big frozen system prompts (DEEPSEEK_*_PROMPT) are NOT moved — they stay defined in
// api.mjs and are INJECTED into this factory under the SAME names, so the moved owner bodies
// that reference them are byte-identical to main. Same discipline for every other free identifier
// (callDeepSeekWithFallback, getQuestionGroupDetail, the normalize* helpers, etc.): injected by
// the factory at init, before any request-time call.
//
// The 4 PUBLIC owners (parseReadingByQuestionGroup / parseClozeByQuestionGroup /
// parseGrammarByQuestionGroup / parseSevenChoicesByQuestionGroup) are returned by the factory.
// The 8 helpers (formatQuestionFor* / formatOptionsForSevenChoicesParse / callDeepSeekParse*)
// stay FILE-PRIVATE. randomUUID is imported DIRECTLY from node:crypto. Module never imports api.mjs.

import { randomUUID } from 'node:crypto'

let callDeepSeekWithFallback
let getQuestionGroupDetail
let describeKeySource
let normalizeDeepSeekModel
let maskApiKey
let elapsedMs
let optionalString
let formatSynonymDifficultyKnowledgeForReadingPrompt
let normalizeReadingParseQuestion
let normalizeReadingParseArticle
let normalizeClozeParseQuestion
let normalizeSevenChoicesParseQuestion
let DEEPSEEK_API_KEY
let DEEPSEEK_READING_PARSE_PROMPT
let DEEPSEEK_GRAMMAR_PARSE_PROMPT
let DEEPSEEK_CLOZE_PARSE_PROMPT
let DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT

export function createQuestionGroupParseImplementation(deps) {
  ;({
    callDeepSeekWithFallback,
    getQuestionGroupDetail,
    describeKeySource,
    normalizeDeepSeekModel,
    maskApiKey,
    elapsedMs,
    optionalString,
    formatSynonymDifficultyKnowledgeForReadingPrompt,
    normalizeReadingParseQuestion,
    normalizeReadingParseArticle,
    normalizeClozeParseQuestion,
    normalizeSevenChoicesParseQuestion,
    DEEPSEEK_API_KEY,
    DEEPSEEK_READING_PARSE_PROMPT,
    DEEPSEEK_GRAMMAR_PARSE_PROMPT,
    DEEPSEEK_CLOZE_PARSE_PROMPT,
    DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT,
  } = deps)
  return {
    parseReadingByQuestionGroup,
    parseClozeByQuestionGroup,
    parseGrammarByQuestionGroup,
    parseSevenChoicesByQuestionGroup,
  }
}

function formatQuestionForReadingParse(question) {
  const optionsText = question.options?.length
    ? question.options
        .map((option) => `${option.label}. ${option.content}`)
        .join('\n')
    : '（无）'

  return [
    `题号：${question.questionNo}`,
    `题型：${question.questionType || '阅读理解'}`,
    `题干：${question.stem}`,
    `选项：\n${optionsText}`,
    question.answer ? `当前答案：${question.answer}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function callDeepSeekParseReading(context) {
  const questionSummaries = context.questions
    .map((question, index) => `【题目${index + 1}】\n${formatQuestionForReadingParse(question)}`)
    .join('\n\n')

  const selectedModel = context.model
  const messages = [
    {
      role: 'system',
      content: `${DEEPSEEK_READING_PARSE_PROMPT}

同义替换难度知识卡（必须只使用这些类型，不要自创分类）：
${formatSynonymDifficultyKnowledgeForReadingPrompt()}`,
    },
    {
      role: 'user',
      content: `请按上述要求处理以下题组。\n\n篇章：${context.passageTitle}\n\n原文（节选）：\n${context.passageText}\n\n题目：\n${questionSummaries}`,
    },
  ]

  const requestStartAt = Date.now()
  const parsedResult = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: selectedModel,
    expectedResponseSchema: 'reading_parse',
    messages,
    temperature: 0.2,
    maxTokens: 8192,
    thinkingMode: context.thinkingMode,
    responseFormat: context.thinkingMode ? undefined : 'json_object',
  })

  const parsedPayload = parsedResult.parsed
  if (!parsedPayload || typeof parsedPayload !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期 JSON。')
  }

  const rawQuestions = Array.isArray(parsedPayload.questions) ? parsedPayload.questions : []
  const originalQuestionByNo = new Map(
    (context.questions || []).map((question) => [String(question.questionNo || '').trim(), question]),
  )
  const questions = rawQuestions
    .map((item) =>
      normalizeReadingParseQuestion(item, {
        originalQuestion: originalQuestionByNo.get(optionalString(item?.questionNo)),
      }),
    )
    .filter(Boolean)

  const articleAnalysis = parsedPayload.articleAnalysis
    ? normalizeReadingParseArticle(parsedPayload.articleAnalysis)
    : null
  const passageSummary =
    optionalString(parsedPayload.passageSummary || parsedPayload.passage_summary) ||
    optionalString(articleAnalysis?.summary)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效题目解析。')
  }

  return {
    questions,
    articleAnalysis,
    passageSummary,
    requestLatencyMs: parsedResult.latencyMs,
    totalLatencyMs: elapsedMs(requestStartAt),
    rawTextLength: parsedResult.rawText.length,
  }
}

async function parseReadingByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }

  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail) {
    throw new Error('题组未找到。')
  }

  const questionsForParse = detail.questions
    .map((question) => ({
      questionNo: question.questionNo,
      questionType: question.questionType,
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      explanation: question.explanation,
    }))
    .filter((question) => question.stem)

  if (questionsForParse.length === 0) {
    throw new Error('该题组缺少可解析题干。')
  }

  console.log(
    `AI reading parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${questionsForParse.length}`,
  )

  const parseResult = await callDeepSeekParseReading({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 4200) || '',
    questions: questionsForParse,
    thinkingMode,
  })

  const parsedByNo = new Map(parseResult.questions.map((item) => [item.questionNo, item]))
  const questionNoList = questionsForParse.map((question) => String(question.questionNo))

  return {
    questionGroupId,
    title: detail.title,
    questionCount: questionsForParse.length,
    parsedCount: parseResult.questions.length,
    matchedCount: questionNoList.filter((questionNo) => parsedByNo.has(questionNo)).length,
    unmatchedQuestionNos: questionNoList.filter((questionNo) => !parsedByNo.has(questionNo)),
    passageSummary: parseResult.passageSummary || optionalString(parseResult.articleAnalysis?.summary),
    articleAnalysis: parseResult.articleAnalysis || null,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    requestMs: parseResult.requestLatencyMs,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
    questions: parseResult.questions,
  }
}

async function callDeepSeekParseGrammar(context) {
  const questionText = context.questions
    .map((q, i) => `题目${i + 1}：第${q.questionNo}题${q.stem ? '，题干：' + q.stem : ''}`)
    .join('\n')

  const messages = [
    { role: 'system', content: DEEPSEEK_GRAMMAR_PARSE_PROMPT },
    {
      role: 'user',
      content: `请按上述要求处理以下语法填空篇章。\n\n篇章标题：${context.passageTitle}\n\n原文：\n${context.passageText}\n\n题目：\n${questionText}`,
    },
  ]

  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    messages,
    temperature: 0.15,
    maxTokens: 6000,
    thinkingMode: context.thinkingMode,
  })

  return result.parsed
}

function formatQuestionForClozeParse(question) {
  const optionsText = question.options?.length
    ? question.options
        .map((option) => `${option.label}. ${option.content}`)
        .join('\n')
    : '（无）'

  return [
    `题号：${question.questionNo}`,
    question.stem ? `题干：${question.stem}` : '',
    `选项：\n${optionsText}`,
    question.answer ? `当前答案：${question.answer}` : '',
    question.explanation ? `已有解析：${question.explanation}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

async function callDeepSeekParseCloze(context) {
  const questionText = context.questions
    .map((question, index) => `【空${index + 1}】\n${formatQuestionForClozeParse(question)}`)
    .join('\n\n')

  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    messages: [
      { role: 'system', content: DEEPSEEK_CLOZE_PARSE_PROMPT },
      {
        role: 'user',
        content: `请按上述“完形填空处理”模式解析以下题组。\n\n篇章标题：${context.passageTitle}\n\n原文：\n${context.passageText}\n\n题目与选项：\n${questionText}`,
      },
    ],
    temperature: 0.18,
    maxTokens: context.thinkingMode ? 8192 : 6500,
    thinkingMode: context.thinkingMode,
  })

  return result.parsed
}

async function parseClozeByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail || detail.groupType !== 'cloze') {
    throw new Error('仅支持完形填空题组。')
  }

  console.log(
    `AI cloze parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${detail.questions.length}`,
  )

  const parsed = await callDeepSeekParseCloze({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 3200) || '',
    questions: detail.questions,
    thinkingMode,
  })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期。')
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((item) => normalizeClozeParseQuestion(item))
    .filter(Boolean)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效完形填空解析。')
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    parsedCount: questions.length,
    answerLine: optionalString(parsed.answerLine),
    storyTitle: optionalString(parsed.storyTitle),
    storySummary: optionalString(parsed.storySummary),
    condensedStory: optionalString(parsed.condensedStory),
    questions,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
  }
}

async function parseGrammarByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail || detail.groupType !== 'grammar_cloze') {
    throw new Error('仅支持语法填空题组。')
  }

  console.log(
    `AI grammar parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel}`,
  )

  const parsed = await callDeepSeekParseGrammar({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 2500) || '',
    questions: detail.questions,
    thinkingMode,
  })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期。')
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).map((item) => ({
    questionNo: String(item.questionNo || ''),
    answer: String(item.answer || ''),
    hintMeaning: String(item.hintMeaning || ''),
    analysis: String(item.analysis || ''),
    sentenceTranslation: String(item.sentenceTranslation || ''),
  })).filter((item) => item.questionNo)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效题目解析。')
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    parsedCount: questions.length,
    fullTranslation: String(parsed.fullTranslation || ''),
    questions,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
  }
}

function formatQuestionForSevenChoicesParse(question) {
  return [
    `题号：${question.questionNo}`,
    question.stem ? `题干：${question.stem}` : '',
    question.answer ? `当前答案：${question.answer}` : '',
    question.explanation ? `已有解析：${question.explanation}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function formatOptionsForSevenChoicesParse(questions) {
  const optionsByLabel = new Map()
  questions.forEach((question) => {
    question.options?.forEach((option) => {
      const label = optionalString(option.label).toUpperCase()
      if (label && !optionsByLabel.has(label)) {
        optionsByLabel.set(label, optionalString(option.content))
      }
    })
  })
  return Array.from(optionsByLabel.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, content]) => `${label}. ${content}`)
    .join('\n')
}

async function callDeepSeekParseSevenChoices(context) {
  const questionText = context.questions
    .map((question, index) => `【空${index + 1}】\n${formatQuestionForSevenChoicesParse(question)}`)
    .join('\n\n')
  const optionsText = formatOptionsForSevenChoicesParse(context.questions) || '（无）'

  const result = await callDeepSeekWithFallback({
    apiKey: context.apiKey,
    model: context.model,
    messages: [
      {
        role: 'system',
        content: `${DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT}

请严格只返回 JSON 对象，不要 markdown 代码块。JSON 结构如下：
{
  "articleSummary": "文章主旨中文概括",
  "answerLine": "36. D 37. C 38. B 39. G 40. A",
  "questions": [
    {
      "questionNo": "36",
      "answer": "D",
      "optionText": "选项英文原句",
      "optionTranslation": "选项中文翻译",
      "positionContext": "位置与上下文",
      "analysis": "对应解析"
    }
  ]
}`,
      },
      {
        role: 'user',
        content: `请按上述“七选五处理”模式解析以下题组。\n\n篇章标题：${context.passageTitle}\n\n原文：\n${context.passageText}\n\n备选项：\n${optionsText}\n\n题目：\n${questionText}`,
      },
    ],
    temperature: 0.18,
    maxTokens: context.thinkingMode ? 8192 : 6500,
    thinkingMode: context.thinkingMode,
  })

  return result.parsed
}

async function parseSevenChoicesByQuestionGroup(questionGroupId, apiKey, model, parseRequestId, thinkingMode = false) {
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }
  const selectedModel = normalizeDeepSeekModel(model)
  const resolvedParseRequestId = parseRequestId || randomUUID()
  const parseStartedAt = Date.now()

  const detail = getQuestionGroupDetail(questionGroupId)
  if (!detail || detail.groupType !== 'seven_choices') {
    throw new Error('仅支持七选五题组。')
  }

  console.log(
    `AI seven choices parse trace=${resolvedParseRequestId} group=${questionGroupId} model=${selectedModel} thinking=${
      thinkingMode ? 'on' : 'off'
    } keySource=${keySource.source} keyMask=${maskApiKey(key)} questionCount=${detail.questions.length}`,
  )

  const parsed = await callDeepSeekParseSevenChoices({
    apiKey: key,
    model: selectedModel,
    passageTitle: detail.passage.title,
    passageText: detail.passage.materialText?.slice(0, 3200) || '',
    questions: detail.questions,
    thinkingMode,
  })

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('DeepSeek 返回结果不符合预期。')
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .map((item) => normalizeSevenChoicesParseQuestion(item))
    .filter(Boolean)

  if (questions.length === 0) {
    throw new Error('DeepSeek 未返回有效七选五解析。')
  }

  return {
    questionGroupId,
    title: detail.title,
    questionCount: detail.questions.length,
    parsedCount: questions.length,
    answerLine: optionalString(parsed.answerLine),
    articleSummary: optionalString(parsed.articleSummary),
    questions,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedParseRequestId,
    model: selectedModel,
    thinkingMode,
    provider: keySource.provider,
    totalLatencyMs: elapsedMs(parseStartedAt),
  }
}
