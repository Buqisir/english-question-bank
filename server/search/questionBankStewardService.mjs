// question-bank steward service — NL -> intent-plan -> filtered semantic search.
// Extracted VERBATIM (indent 0, no re-indent) from server/api.mjs (cut H5-I,
// refactor-roadmap-2026-06) so the QUESTION_BANK_STEWARD_PROMPT template literal stays
// byte-identical — the prompt text is the frozen AI contract and whitespace there is NOT inert.
// The plan-normalization + heuristic-inference + filter-matrix helpers stay file-private; the
// only public entry points are questionBankStewardSearch + planQuestionBankStewardSearch. Deps
// are module-scoped bindings the factory populates; callDeepSeekWithFallback +
// semanticSearchQuestionGroups are injected (semantic search comes from the H5-H module,
// re-imported in api.mjs — injected here, never back-imported, so no cycle). Module never
// imports api.mjs.

import { randomUUID } from 'node:crypto'

let callDeepSeekWithFallback
let semanticSearchQuestionGroups
let describeKeySource
let optionalString
let objectValue
let normalizeSynonymCardId
let maskApiKey
let elapsedMs
let DEEPSEEK_API_KEY
let DEFAULT_DEEPSEEK_MODEL
let QUESTION_BANK_STEWARD_TOP_K

export function createQuestionBankStewardImplementation(deps) {
  ;({
    callDeepSeekWithFallback,
    semanticSearchQuestionGroups,
    describeKeySource,
    optionalString,
    objectValue,
    normalizeSynonymCardId,
    maskApiKey,
    elapsedMs,
    DEEPSEEK_API_KEY,
    DEFAULT_DEEPSEEK_MODEL,
    QUESTION_BANK_STEWARD_TOP_K,
  } = deps)
  return { questionBankStewardSearch, planQuestionBankStewardSearch }
}

const QUESTION_BANK_STEWARD_PROMPT = `你是高中英语题库搜索管家，只负责把老师的自然语言转成检索意图。
不要做阅读题解析，不要判断答案对错，不要生成讲评稿。

可用相似维度：
- skill：考查技能、SOLO、T1-T10、题面题型、做题动作，如 T6 推断、T10 抽象压缩、猜词题、例子功能。
- theme：文章主题、话题标签、语篇内容，如科技发展、人与自然、购物、环保。
- difficulty：难度相近，如高难、中等、低难、干扰项强、抽象度高。
- source：来源相似，如浙江卷、全国卷、2023年、1月卷、真题/模拟题。
- mixed：用户明确要求多个维度同时相似。

交互口径：
- 前台面对老师时只说自然语言，不说 skill/theme/difficulty/source，不说“按维度选择”。
- 如果要澄清，用“做题思路像 / 文章内容像 / 学生卡点像”这类老师能直接理解的话。
- 不要要求用户回复固定枚举；允许用户直接补一句描述。

澄清规则：
如果用户只说“找相似题/类似题/同款题/推荐几道”但没有说明相似维度，必须 needsClarification=true。
澄清问题必须用自然语言，不要暴露 skill/theme/difficulty/source、SOLO T卡、来源年份等内部字段。
推荐口吻：你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。
注意：“高阶题/T5-T10”是 skill 维度，不等于 difficultyLevels=high；只有用户明确说“高难/难度高”才设置 difficultyLevels。

返回 JSON 对象，不要 markdown，不要额外说明：
{
  "intent": "find_similar/search/clarify",
  "needsClarification": false,
  "clarificationQuestion": "",
  "similarityDimension": "skill/theme/difficulty/source/mixed/null",
  "rewrittenQuery": "适合后端检索的一句话，保留T卡、题型、主题、年份等关键词",
  "filters": {
    "groupType": "reading/cloze/seven_choices/grammar_cloze/null",
    "sourceType": "real_exam/mock_exam/self_made/null",
    "years": ["2023"],
    "regions": ["浙江"],
    "tCardIds": ["T6"],
    "surfaceQuestionTypes": ["passage_main_idea"],
    "difficultyLevels": ["high"]
  },
  "answer": "一句中文说明你会怎么找"
}`

function normalizeStewardArray(value) {
  if (Array.isArray(value)) {
    return value.map(optionalString).filter(Boolean).slice(0, 8)
  }
  const normalized = optionalString(value)
  return normalized ? [normalized] : []
}

function inferStewardDimensionFromQuery(query) {
  const text = optionalString(query)
  if (!text) return ''

  if (
    /(做题思路|解题思路|解题方法|学生卡点|卡点|考法|考查方式|题型|题面|SOLO|T10|T[1-9]\b|猜词|词义|推断|主旨|标题|例子|引用|态度|写作手法|段落功能|why mention|why did|抽象概括|抽象压缩|抽象短语)/i.test(
      text,
    )
  ) {
    return 'skill'
  }
  if (/(文章内容|内容像|讲的内容|主题|话题|语篇|材料内容|科技|环保|城市|购物|自然|社会|文化|人物|故事)/i.test(text)) {
    return 'theme'
  }
  if (/(难度|高难|难题|低难|简单|容易|中等|干扰|迷惑|词汇|语法|抽象度|信息跨度)/i.test(text)) {
    return 'difficulty'
  }
  if (/(来源|年份|真题|模拟|浙江|全国|新课标|北京|上海|广东|深圳|一模|二模|20\d{2}|1月|6月|卷)/i.test(text)) {
    return 'source'
  }

  return ''
}

function inferStewardSurfaceQuestionTypesFromQuery(query) {
  const text = optionalString(query)
  const types = []
  const push = (type) => {
    if (!types.includes(type)) types.push(type)
  }

  if (/(抽象概括|抽象压缩|抽象短语|low barrier|barrier to entry)/i.test(text)) push('abstract_phrase_summary')
  if (/(形容词压缩|一两个形容词|adjective)/i.test(text)) push('adjective_summary')
  if (/(猜词|词义|划线词|underlined word|underlined phrase)/i.test(text)) push('word_meaning')
  if (/(例子功能|举例|引用|why mention|mentioning)/i.test(text)) push('example_function')
  if (/(why did|为什么.*做|原因题)/i.test(text)) push('why_did')
  if (/(段落主旨|paragraph main)/i.test(text)) push('paragraph_main_idea')
  if (/(文章主旨|全文主旨|mainly about|passage main)/i.test(text)) push('passage_main_idea')
  if (/(写作手法|writing technique|修辞手法)/i.test(text)) push('writing_technique')
  if (/(态度|语气|attitude|tone)/i.test(text)) push('attitude_tone')
  if (/(推断|infer|inference)/i.test(text)) push('inference_general')

  return types
}

function inferStewardTCardIdsFromQuery(query) {
  const text = optionalString(query)
  return Array.from(text.matchAll(/\bT(10|[1-9])\b/gi))
    .map((match) => normalizeSynonymCardId(match[0]))
    .filter(Boolean)
}

function normalizeQuestionBankStewardPlan(payload, fallbackQuery) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const allowedIntents = new Set(['find_similar', 'search', 'clarify'])
  const allowedDimensions = new Set(['skill', 'theme', 'difficulty', 'source', 'mixed', 'null'])
  const allowedSurfaceTypes = new Set([
    'single_detail_normal',
    'multi_detail_learn_from',
    'why_did',
    'word_meaning',
    'paragraph_main_idea',
    'passage_main_idea',
    'writing_technique',
    'paragraph_function',
    'author_purpose',
    'attitude_tone',
    'inference_general',
    'example_function',
    'adjective_summary',
    'abstract_phrase_summary',
  ])
  const filters = objectValue(source.filters)
  const intent = optionalString(source.intent)
  const similarityDimension = optionalString(source.similarityDimension || source.similarity_dimension)
  const groupType = optionalString(filters.groupType || filters.group_type)
  const sourceType = optionalString(filters.sourceType || filters.source_type)
  const queryText = optionalString(fallbackQuery)
  const inferredDimension = inferStewardDimensionFromQuery(queryText)
  const inferredSurfaceTypes = inferStewardSurfaceQuestionTypesFromQuery(queryText).filter((type) => allowedSurfaceTypes.has(type))
  const inferredTCardIds = inferStewardTCardIdsFromQuery(queryText)
  const hasExplicitDifficultySignal =
    /(高难|难度高|难题|低难|难度低|简单|容易|中等难度|难度中等|difficulty)/i.test(queryText)
  const normalizedDifficultyLevels = normalizeStewardArray(filters.difficultyLevels || filters.difficulty_levels)
    .map((value) => {
      const normalizedValue = value.toLowerCase()
      if (['high', '高', '高难'].includes(normalizedValue)) return 'high'
      if (['medium', '中', '中等'].includes(normalizedValue)) return 'medium'
      if (['low', '低', '低难', '简单'].includes(normalizedValue)) return 'low'
      return ''
    })
    .filter(Boolean)
  const normalized = {
    intent: allowedIntents.has(intent) ? intent : 'search',
    needsClarification: source.needsClarification === true || source.needs_clarification === true,
    clarificationQuestion: optionalString(source.clarificationQuestion || source.clarification_question),
    similarityDimension: allowedDimensions.has(similarityDimension) ? similarityDimension : 'null',
    rewrittenQuery: optionalString(source.rewrittenQuery || source.rewritten_query) || optionalString(fallbackQuery),
    filters: {
      groupType: ['reading', 'cloze', 'seven_choices', 'grammar_cloze'].includes(groupType) ? groupType : '',
      sourceType: ['real_exam', 'mock_exam', 'self_made'].includes(sourceType) ? sourceType : '',
      years: normalizeStewardArray(filters.years || filters.year),
      regions: normalizeStewardArray(filters.regions || filters.region),
      tCardIds: Array.from(
        new Set([...normalizeStewardArray(filters.tCardIds || filters.t_card_ids).map(normalizeSynonymCardId).filter(Boolean), ...inferredTCardIds]),
      ),
      surfaceQuestionTypes: normalizeStewardArray(filters.surfaceQuestionTypes || filters.surface_question_types).filter((type) =>
        allowedSurfaceTypes.has(type),
      ),
      difficultyLevels: hasExplicitDifficultySignal ? Array.from(new Set(normalizedDifficultyLevels)) : [],
    },
    answer: optionalString(source.answer),
  }
  if (inferredSurfaceTypes.length) {
    normalized.filters.surfaceQuestionTypes = Array.from(new Set([...normalized.filters.surfaceQuestionTypes, ...inferredSurfaceTypes]))
  }
  if (normalized.similarityDimension === 'null' && inferredDimension) {
    normalized.similarityDimension = inferredDimension
  }
  if (inferredDimension && normalized.needsClarification) {
    normalized.needsClarification = false
    normalized.clarificationQuestion = ''
    if (normalized.intent === 'clarify') normalized.intent = 'find_similar'
    if (!normalized.answer) normalized.answer = `我按${summarizeStewardDimension(normalized.similarityDimension)}来找。`
  }

  if (normalized.intent === 'clarify') {
    normalized.needsClarification = true
  }
  if (normalized.needsClarification && !normalized.clarificationQuestion) {
    normalized.clarificationQuestion =
      '你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。'
  }

  return normalized
}

function shouldForceStewardClarification(query, plan) {
  const text = optionalString(query)
  if (!text) return false
  const asksSimilar = /(相似|类似|同款|同类|推荐.*题|找.*题)/.test(text)
  if (!asksSimilar) return false
  const hasDimensionSignal =
    /(做题思路|解题思路|学生卡点|文章内容|讲的内容|技能|SOLO|T10|T[1-9]\b|题型|猜词|推断|主旨|标题|例子|引用|态度|写作手法|压缩|抽象|主题|话题|难度|高难|中等|简单|干扰|浙江|全国|新课标|北京|上海|真题|模拟|年份|20\d{2})/i.test(
      text,
    )
  return !hasDimensionSignal && plan.similarityDimension === 'null'
}

function buildStewardSemanticQuery(query, plan) {
  const filters = plan.filters || {}
  const parts = [
    plan.rewrittenQuery,
    plan.similarityDimension && plan.similarityDimension !== 'null' ? `相似维度:${plan.similarityDimension}` : '',
    filters.groupType ? `题组类型:${filters.groupType}` : '',
    filters.sourceType ? `来源:${filters.sourceType}` : '',
    filters.years?.length ? `年份:${filters.years.join(' ')}` : '',
    filters.regions?.length ? `地区:${filters.regions.join(' ')}` : '',
    filters.tCardIds?.length ? `T卡:${filters.tCardIds.join(' ')}` : '',
    filters.surfaceQuestionTypes?.length ? `题面:${filters.surfaceQuestionTypes.join(' ')}` : '',
    filters.difficultyLevels?.length ? `难度:${filters.difficultyLevels.join(' ')}` : '',
  ].filter(Boolean)

  const semanticQuery = parts.join('；').trim()
  return semanticQuery || optionalString(query)
}

function summarizeStewardDimension(dimension) {
  const labels = {
    skill: '做题思路相似',
    theme: '文章内容相似',
    difficulty: '难度接近',
    source: '真题风格相近',
    mixed: '综合相似',
  }
  return labels[dimension] || '综合语义'
}

function buildQuestionBankStewardMessage(plan, searchResult) {
  if (plan.needsClarification) {
    return (
      plan.clarificationQuestion ||
      '你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。'
    )
  }

  const count = searchResult?.matches?.length || 0
  const dimension = summarizeStewardDimension(plan.similarityDimension)
  const lead = plan.answer || `我按${dimension}来找。`
  if (count === 0) {
    return `${lead} 目前没有找到稳定匹配，可以换一个主题、T卡或年份再试。`
  }
  return `${lead} 已按${dimension}推荐 ${count} 个候选，优先看列表前几项的匹配理由。`
}

function matchStewardFilter(match, plan) {
  const filters = plan.filters || {}
  const group = match.questionGroup || match.group || {}
  const signals = group.readingSearchSignals || {}

  if (filters.groupType && group.groupType !== filters.groupType) return false
  if (filters.sourceType && group.sourceType !== filters.sourceType) return false
  if (filters.years?.length && !filters.years.includes(String(group.year || ''))) return false
  if (filters.regions?.length && !filters.regions.some((region) => optionalString(group.region).includes(region))) return false
  if (filters.tCardIds?.length) {
    const groupCards = Array.isArray(signals.tCardIds) ? signals.tCardIds : []
    if (!filters.tCardIds.some((cardId) => groupCards.includes(cardId))) return false
  }
  if (filters.surfaceQuestionTypes?.length) {
    const surfaceTypes = Array.isArray(signals.surfaceTypes) ? signals.surfaceTypes : []
    if (!filters.surfaceQuestionTypes.some((surfaceType) => surfaceTypes.includes(surfaceType))) return false
  }
  if (filters.difficultyLevels?.length) {
    const requested = filters.difficultyLevels.map((value) => optionalString(value).toLowerCase())
    const difficultyAliases = {
      high: 'high',
      hard: 'high',
      '高': 'high',
      '高难': 'high',
      medium: 'medium',
      mid: 'medium',
      '中': 'medium',
      '中等': 'medium',
      low: 'low',
      easy: 'low',
      '低': 'low',
      '低难': 'low',
      '简单': 'low',
    }
    const difficulty = difficultyAliases[optionalString(group.difficulty).toLowerCase()] || optionalString(group.difficulty).toLowerCase()
    const scores = Array.isArray(signals.finalScores) ? signals.finalScores : []
    const hasScoreMatch = scores.some((score) => {
      if (requested.includes('high')) return score >= 7
      if (requested.includes('medium')) return score >= 4 && score <= 6
      if (requested.includes('low')) return score <= 3
      return false
    })
    if (!requested.includes(difficulty) && !hasScoreMatch) return false
  }

  return true
}

function applyStewardFiltersToMatches(matches, plan) {
  const filters = plan.filters || {}
  const hasHardFilter = Boolean(
    filters.groupType ||
      filters.sourceType ||
      filters.years?.length ||
      filters.regions?.length ||
      filters.tCardIds?.length ||
      filters.surfaceQuestionTypes?.length ||
      filters.difficultyLevels?.length,
  )
  if (!hasHardFilter) return matches

  const filtered = matches.filter((match) => matchStewardFilter(match, plan))
  if (filtered.length === 0) return []

  return filtered.map((match) => ({
    ...match,
    reason: `管家规则过滤；${match.reason}`,
  }))
}

async function planQuestionBankStewardSearch(query, apiKey, requestId, thinkingMode = false) {
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!key) {
    throw new Error('未设置 DeepSeek API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }

  const result = await callDeepSeekWithFallback({
    apiKey: key,
    model: DEFAULT_DEEPSEEK_MODEL,
    provider: 'deepseek',
    messages: [
      {
        role: 'system',
        content: QUESTION_BANK_STEWARD_PROMPT,
      },
      {
        role: 'user',
        content: `老师的问题：${query}`,
      },
    ],
    temperature: 0,
    maxTokens: 900,
    thinkingMode: thinkingMode,
    responseFormat: 'json_object',
  })

  const plan = normalizeQuestionBankStewardPlan(result.parsed, query)
  if (shouldForceStewardClarification(query, plan)) {
    plan.intent = 'clarify'
    plan.needsClarification = true
    plan.clarificationQuestion =
      '你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。'
  }

  return {
    plan,
    latencyMs: result.latencyMs,
    requestId,
  }
}

async function questionBankStewardSearch(query, apiKey, requestId, thinkingMode = false) {
  const normalizedQuery = optionalString(query)
  if (!normalizedQuery) {
    throw new Error('请输入想让题库管家查找的问题。')
  }

  const resolvedRequestId = requestId || randomUUID()
  const startedAt = Date.now()
  const keySource = describeKeySource(apiKey)
  const key = String(apiKey || DEEPSEEK_API_KEY).trim()
  const { plan } = await planQuestionBankStewardSearch(normalizedQuery, key, resolvedRequestId, thinkingMode)

  if (plan.needsClarification) {
    return {
      query: normalizedQuery,
      assistantMessage: buildQuestionBankStewardMessage(plan, null),
      needsClarification: true,
      clarificationQuestion: plan.clarificationQuestion,
      intent: plan,
      matches: [],
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      thinkingMode: thinkingMode,
      keySource: keySource.source,
      keyFingerprint: maskApiKey(key),
      keyMask: maskApiKey(key),
      requestId: resolvedRequestId,
      totalLatencyMs: elapsedMs(startedAt),
      pipeline: 'deepseek-flash-steward',
    }
  }

  const semanticQuery = buildStewardSemanticQuery(normalizedQuery, plan)
  const searchResult = await semanticSearchQuestionGroups(semanticQuery, key, `${resolvedRequestId}-search`, thinkingMode)
  const matches = applyStewardFiltersToMatches(searchResult.matches, plan).slice(0, QUESTION_BANK_STEWARD_TOP_K)
  const limitedSearchResult = {
    ...searchResult,
    query: semanticQuery,
    matches,
  }

  return {
    query: normalizedQuery,
    assistantMessage: buildQuestionBankStewardMessage(plan, limitedSearchResult),
    needsClarification: false,
    clarificationQuestion: '',
    intent: plan,
    search: limitedSearchResult,
    matches,
    provider: 'deepseek',
    model: DEFAULT_DEEPSEEK_MODEL,
    thinkingMode: thinkingMode,
    keySource: keySource.source,
    keyFingerprint: maskApiKey(key),
    keyMask: maskApiKey(key),
    requestId: resolvedRequestId,
    totalLatencyMs: elapsedMs(startedAt),
    pipeline: `deepseek-flash-steward+${searchResult.pipeline || 'semantic-search'}`,
  }
}
