// semantic-search recall + rerank service — local prefilter/score, DeepSeek rerank, matches envelope.
// Extracted VERBATIM (indent 0, no re-indent) from server/api.mjs (cut H5-H,
// refactor-roadmap-2026-06) so the rerank prompt template literal stays byte-identical — the
// prompt text is the frozen AI contract and whitespace there is NOT inert. The ~14
// prefilter/score/rerank/signals helpers stay file-private; the only public entry point is
// semanticSearchQuestionGroups. Deps are module-scoped bindings the factory populates;
// callDeepSeekWithFallback is injected (re-imported from completionRunner in api.mjs). Module
// never imports api.mjs (no cycle). clamp01 is kept file-private here (a 3-line pure leaf, also
// still defined in api.mjs for the synonym-difficulty path) rather than spinning a shallow util
// module just for it.

import { randomUUID } from 'node:crypto'
import { safeTruncate } from '../ai-providers/jsonExtraction.mjs'

let openDatabase
let selectQuestionGroupCards
let getDraftSearchContext
let callDeepSeekWithFallback
let describeKeySource
let optionalString
let objectValue
let parseSavedJson
let normalizeSynonymCardId
let maskApiKey
let elapsedMs
let groupTypeLabels
let SEMANTIC_SEARCH_PREFILTER_TOP_K
let SEMANTIC_SEARCH_TOP_K
let DEFAULT_DEEPSEEK_MODEL
let DEEPSEEK_API_KEY

export function createSemanticSearchImplementation(deps) {
  ;({
    openDatabase,
    selectQuestionGroupCards,
    getDraftSearchContext,
    callDeepSeekWithFallback,
    describeKeySource,
    optionalString,
    objectValue,
    parseSavedJson,
    normalizeSynonymCardId,
    maskApiKey,
    elapsedMs,
    groupTypeLabels,
    SEMANTIC_SEARCH_PREFILTER_TOP_K,
    SEMANTIC_SEARCH_TOP_K,
    DEFAULT_DEEPSEEK_MODEL,
    DEEPSEEK_API_KEY,
  } = deps)
  return { semanticSearchQuestionGroups }
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

const DEEPSEEK_SEMANTIC_RERANK_PROMPT = `你是高中英语题库语义检索重排助手。
你只能根据给定候选题组为用户的检索意图排序，不要新增候选，不要输出解释性正文。

规则：
1. 优先理解语义，不要只看字面词。
2. 重点看题组标题、篇章标题、摘要、命中题干、答案提示、标签、话题标签。
3. 候选都不匹配时，也必须返回最相关的候选。
4. score 是 0 到 1 之间的小数，越大越相关。
5. reason 控制在 30 字以内，说明最关键的匹配点。
6. 只返回 JSON 对象，不要 markdown 代码块，不要额外说明。

返回格式：
{
  "rankings": [
    {
      "questionGroupId": "题组 ID",
      "score": 0.96,
      "reason": "匹配点说明"
    }
  ]
}`

function formatSemanticSearchCandidateForDeepSeek(candidate, rank) {
  const group = candidate.group
  return [
    `${rank + 1}. 题组ID：${group.id}`,
    `题组标题：${group.title}`,
    `篇章标题：${group.passageTitle || '（无）'}`,
    `题组类型：${groupTypeLabels[group.groupType] || group.groupType}`,
    Number.isFinite(candidate.score) ? `预排序分：${Math.round(clamp01(candidate.score) * 100)}%` : '',
    group.summary ? `摘要：${safeTruncate(group.summary, 180)}` : '',
    group.hit ? `命中题干：${safeTruncate(group.hit, 140)}` : '',
    group.answerPreview ? `答案提示：${safeTruncate(group.answerPreview, 80)}` : '',
    group.tags?.length ? `标签：${group.tags.join('，')}` : '',
    group.topicLabels?.length ? `话题标签：${group.topicLabels.map((topicLabel) => topicLabel.label).join('，')}` : '',
    group.readingSearchSignals?.text ? `阅读解析标签：${safeTruncate(group.readingSearchSignals.text, 260)}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function normalizeSemanticSearchRankings(payload) {
  const rawRankings = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rankings)
      ? payload.rankings
      : Array.isArray(payload?.matches)
        ? payload.matches
      : Array.isArray(payload?.results)
        ? payload.results
        : []

  return rawRankings
    .map((item, index) => {
      const questionGroupId = optionalString(item?.questionGroupId || item?.id || item?.groupId)
      if (!questionGroupId) return null
      const rawScore = Number(item?.score ?? item?.relevanceScore ?? item?.rankScore)
      return {
        questionGroupId,
        score: Number.isFinite(rawScore) ? rawScore : null,
        reason: optionalString(item?.reason || item?.explanation || item?.analysis),
        index,
      }
    })
    .filter(Boolean)
}

function buildSemanticSearchMatchesFromRankings(candidates, rankings, candidateById, scoreFromRanking) {
  const seenIds = new Set()
  const rankedMatches = []

  rankings.forEach((ranking) => {
    const candidate = candidateById.get(ranking.questionGroupId)
    if (!candidate || seenIds.has(candidate.group.id)) return

    const defaultRankScore = clamp01(1 - rankedMatches.length / Math.max(rankings.length - 1, 1))
    const rankingScore =
      ranking.score === null ? defaultRankScore : clamp01(ranking.score > 1 ? ranking.score / 100 : ranking.score)

    seenIds.add(candidate.group.id)
    rankedMatches.push({
      ...candidate,
      deepSeekReason: ranking.reason,
      deepSeekScore: rankingScore,
      score: scoreFromRanking(candidate, rankingScore),
    })
  })

  candidates.forEach((candidate) => {
    if (!seenIds.has(candidate.group.id)) {
      rankedMatches.push(candidate)
    }
  })

  return rankedMatches
}

function buildDeepSeekSemanticSearchReason(group, reason, rank, sourceName = 'DeepSeek') {
  if (reason) {
    return `${sourceName} 检测第 ${rank + 1} 位；${safeTruncate(reason, 40)}`
  }

  const labelPieces = []
  if (group.topicLabels?.length) {
    labelPieces.push(group.topicLabels.slice(0, 2).map((topicLabel) => topicLabel.label).join(' / '))
  }
  if (group.tags?.length) {
    labelPieces.push(group.tags.slice(0, 3).join(' / '))
  }
  const evidence = labelPieces.filter(Boolean).join('；')
  return evidence
    ? `${sourceName} 检测第 ${rank + 1} 位；命中 ${evidence}。`
    : `${sourceName} 检测第 ${rank + 1} 位。`
}

function normalizeSemanticSearchText(value) {
  return optionalString(value)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\w\u4e00-\u9fff]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildSemanticSearchTerms(query) {
  const normalizedQuery = normalizeSemanticSearchText(query)
  if (!normalizedQuery) return []

  const terms = []
  const seen = new Set()
  const pushTerm = (term) => {
    const normalizedTerm = normalizeSemanticSearchText(term)
    if (!normalizedTerm || normalizedTerm.length < 2 || seen.has(normalizedTerm)) return
    seen.add(normalizedTerm)
    terms.push(normalizedTerm)
  }

  pushTerm(normalizedQuery)
  normalizedQuery.split(' ').forEach(pushTerm)
  return terms.slice(0, 10)
}

function scoreSemanticSearchField(text, exactQuery, terms) {
  const normalizedText = normalizeSemanticSearchText(text)
  if (!normalizedText) return 0

  let score = 0
  if (exactQuery && normalizedText.includes(exactQuery)) {
    score += 0.7
  }

  const candidateTerms = terms.filter((term) => term !== exactQuery)
  if (candidateTerms.length > 0) {
    let matchedTerms = 0
    candidateTerms.forEach((term) => {
      if (normalizedText.includes(term)) {
        matchedTerms += 1
      }
    })
    score += Math.min(0.3, (matchedTerms / candidateTerms.length) * 0.3)
  }

  return Math.min(1, score)
}

function scoreSemanticSearchCandidate(group, exactQuery, terms) {
  const topicLabelText = Array.isArray(group.topicLabels) ? group.topicLabels.map((topicLabel) => topicLabel.label).join(' ') : ''
  const fieldScores = [
    scoreSemanticSearchField(group.title, exactQuery, terms) * 0.24,
    scoreSemanticSearchField(group.passageTitle, exactQuery, terms) * 0.14,
    scoreSemanticSearchField(group.summary, exactQuery, terms) * 0.14,
    scoreSemanticSearchField(group.hit, exactQuery, terms) * 0.14,
    scoreSemanticSearchField(group.answerPreview, exactQuery, terms) * 0.08,
    scoreSemanticSearchField(Array.isArray(group.tags) ? group.tags.join(' ') : '', exactQuery, terms) * 0.12,
    scoreSemanticSearchField(topicLabelText, exactQuery, terms) * 0.1,
    scoreSemanticSearchField(group.readingSearchSignals?.text || '', exactQuery, terms) * 0.18,
    scoreSemanticSearchField([group.source, group.region, group.paperName, group.section].filter(Boolean).join(' '), exactQuery, terms) * 0.04,
  ]

  return clamp01(fieldScores.reduce((sum, value) => sum + value, 0))
}

function buildSemanticSearchCandidatePool(groups, query) {
  const exactQuery = normalizeSemanticSearchText(query)
  const terms = buildSemanticSearchTerms(query)
  const scoredGroups = groups
    .map((group, index) => ({
      group,
      score: scoreSemanticSearchCandidate(group, exactQuery, terms),
      index,
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score
      if (scoreDelta !== 0) return scoreDelta
      const yearDelta = (Number(right.group.year) || 0) - (Number(left.group.year) || 0)
      if (yearDelta !== 0) return yearDelta
      return left.index - right.index
    })

  return scoredGroups.slice(0, Math.min(SEMANTIC_SEARCH_PREFILTER_TOP_K, scoredGroups.length))
}

function normalizeReadingSearchSignalQuestion(item) {
  if (!item || typeof item !== 'object') return null
  const questionNo = optionalString(item.questionNo || item.question_no)
  const surfaceQuestion = objectValue(item.surfaceQuestion || item.surface_question)
  const synonymDifficulty = objectValue(item.synonymDifficulty || item.synonym_difficulty)
  const difficultyProfile = objectValue(item.difficultyProfile || item.difficulty_profile)
  const surfaceType = optionalString(surfaceQuestion.type)
  const answeringMove = optionalString(surfaceQuestion.answeringMove || surfaceQuestion.answering_move)
  const cardId = normalizeSynonymCardId(
    synonymDifficulty.cardId || synonymDifficulty.card_id || synonymDifficulty.typeId || synonymDifficulty.type_id,
  )
  const cardName = optionalString(synonymDifficulty.name)
  const finalScore = Number(difficultyProfile.finalScore ?? difficultyProfile.final_score)
  const scoreText = Number.isFinite(finalScore) ? `难度${Math.round(finalScore)}` : ''
  const optionExpression = optionalString(synonymDifficulty.optionExpression || synonymDifficulty.option_expression)
  const questionType = optionalString(item.questionType || item.question_type)
  const pieces = [
    questionNo ? `Q${questionNo}` : '',
    questionType,
    surfaceType,
    answeringMove,
    cardId,
    cardName,
    scoreText,
    optionExpression ? `正确选项:${safeTruncate(optionExpression, 32)}` : '',
  ].filter(Boolean)

  if (pieces.length === 0) return null
  return {
    text: pieces.join(' '),
    surfaceType,
    answeringMove,
    cardId,
    finalScore: Number.isFinite(finalScore) ? finalScore : null,
  }
}

function buildReadingSearchSignals(payload) {
  const questions = Array.isArray(payload?.questions) ? payload.questions : []
  const signalQuestions = questions.map(normalizeReadingSearchSignalQuestion).filter(Boolean)
  if (signalQuestions.length === 0) return null

  const unique = (values) => Array.from(new Set(values.map(optionalString).filter(Boolean)))
  const tCardIds = unique(signalQuestions.map((question) => question.cardId))
  const surfaceTypes = unique(signalQuestions.map((question) => question.surfaceType))
  const answeringMoves = unique(signalQuestions.map((question) => question.answeringMove))
  const finalScores = signalQuestions
    .map((question) => question.finalScore)
    .filter((score) => Number.isFinite(score))
    .map((score) => Math.round(score))
  const highOrderCount = signalQuestions.filter((question) =>
    ['T5', 'T6', 'T7', 'T8', 'T9', 'T10'].includes(question.cardId),
  ).length
  const finalScoreText =
    finalScores.length > 0
      ? `难度分:${unique(finalScores.map(String)).join('/')}`
      : ''
  const summaryPieces = [
    tCardIds.length ? `T卡:${tCardIds.join('/')}` : '',
    surfaceTypes.length ? `题面:${surfaceTypes.join('/')}` : '',
    answeringMoves.length ? `动作:${answeringMoves.join('/')}` : '',
    highOrderCount ? `高阶题:${highOrderCount}` : '',
    finalScoreText,
  ].filter(Boolean)

  return {
    text: [summaryPieces.join('；'), signalQuestions.map((question) => question.text).join('；')].filter(Boolean).join('；'),
    tCardIds,
    surfaceTypes,
    answeringMoves,
    highOrderCount,
    finalScores,
  }
}

function getReadingSearchSignalsForQuestionGroups(db, questionGroupIds) {
  const ids = Array.from(new Set((questionGroupIds || []).map((id) => optionalString(id)).filter(Boolean)))
  const signalsByGroupId = new Map(ids.map((id) => [id, null]))
  if (ids.length === 0) return signalsByGroupId

  const placeholders = ids.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
      SELECT question_group_id, payload_json
      FROM reading_parse_results
      WHERE question_group_id IN (${placeholders})
      `,
    )
    .all(...ids)

  rows.forEach((row) => {
    const payload = parseSavedJson(row.payload_json)
    const signals = buildReadingSearchSignals(payload)
    if (signals) {
      signalsByGroupId.set(row.question_group_id, signals)
    }
  })

  return signalsByGroupId
}

// M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 7 / PA MF-1): userId appended as the
// 5th positional parameter (not inserted earlier) so existing stub call sites in
// scripts/verify-h5h-semantic-search.mjs / scripts/verify-h5i-steward-service.mjs that
// pass exactly 4 args keep working with an explicit userId argument added, rather than
// silently shifting every other positional arg. Required — this is the search-results
// button-state seam that PA flagged as the AI-mode analogue of the M0-1 cross-user
// button-state bug this plan cites.
async function semanticSearchQuestionGroups(query, apiKey, requestId, thinkingMode = false, userId) {
  const normalizedQuery = optionalString(query)
  if (!normalizedQuery) {
    throw new Error('请输入要检索的关键词或语义描述。')
  }
  if (typeof userId !== 'string' || !userId) {
    throw new Error('semanticSearchQuestionGroups: userId is required')
  }

  const resolvedRequestId = requestId || randomUUID()
  const startedAt = Date.now()
  const db = openDatabase()
  let groups
  try {
    const cards = selectQuestionGroupCards(db, '', [], getDraftSearchContext(userId))
    const readingSignalsByGroupId = getReadingSearchSignalsForQuestionGroups(
      db,
      cards.map((group) => group.id),
    )
    groups = cards.map((group) => ({
      ...group,
      readingSearchSignals: readingSignalsByGroupId.get(group.id) || null,
    }))
  } finally {
    db.close()
  }

  const groupById = new Map(groups.map((group) => [group.id, group]))
  if (groups.length === 0) {
    return {
      query: normalizedQuery,
      matches: [],
      provider: 'deepseek',
      model: DEFAULT_DEEPSEEK_MODEL,
      thinkingMode: thinkingMode,
      keySource: 'missing',
      keyFingerprint: 'missing',
      keyMask: 'missing',
      requestId: resolvedRequestId,
      totalLatencyMs: elapsedMs(startedAt),
      pipeline: 'deepseek-flash',
    }
  }

  const deepSeekKeySource = describeKeySource(apiKey)
  const deepSeekKey = String(apiKey || DEEPSEEK_API_KEY).trim()
  if (!deepSeekKey) {
    throw new Error('未设置 DeepSeek API Key。请在右上角输入 DeepSeek Key 或设环境变量 DEEPSEEK_API_KEY。')
  }

  const candidatePool = buildSemanticSearchCandidatePool(groups, normalizedQuery)
  console.log(
    `AI semantic search trace=${resolvedRequestId} model=${DEFAULT_DEEPSEEK_MODEL} provider=deepseek thinking=off candidates=${candidatePool.length}/${groups.length}`,
  )

  const candidateText = candidatePool
    .map((candidate, index) => formatSemanticSearchCandidateForDeepSeek(candidate, index))
    .join('\n\n')
  const deepSeekResult = await callDeepSeekWithFallback({
    apiKey: deepSeekKey,
    model: DEFAULT_DEEPSEEK_MODEL,
    provider: 'deepseek',
    messages: [
      {
        role: 'system',
        content: DEEPSEEK_SEMANTIC_RERANK_PROMPT,
      },
      {
        role: 'user',
        content: `检索意图：${normalizedQuery}\n\n候选题组：\n${candidateText}\n\n请按相关度返回最多 ${SEMANTIC_SEARCH_TOP_K} 个 rankings。`,
      },
    ],
    temperature: 0,
    maxTokens: 1800,
    thinkingMode: thinkingMode,
  })
  const deepSeekRankings = normalizeSemanticSearchRankings(deepSeekResult.parsed)
  const candidateById = new Map(candidatePool.map((candidate) => [candidate.group.id, candidate]))
  const matches = buildSemanticSearchMatchesFromRankings(
    candidatePool,
    deepSeekRankings,
    candidateById,
    (candidate, rankingScore) => clamp01(0.35 * candidate.score + 0.65 * rankingScore),
  ).slice(0, SEMANTIC_SEARCH_TOP_K)

  return {
    query: normalizedQuery,
    matches: matches.map((match, index) => ({
      questionGroupId: match.group.id,
      score: clamp01(match.score),
      reason: buildDeepSeekSemanticSearchReason(match.group, match.deepSeekReason, index),
      questionGroup: groupById.get(match.group.id),
    })),
    provider: 'deepseek',
    model: DEFAULT_DEEPSEEK_MODEL,
    pipeline: 'local-recall+deepseek-flash',
    thinkingMode: thinkingMode,
    keySource: deepSeekKeySource.source,
    keyFingerprint: maskApiKey(deepSeekKey),
    keyMask: maskApiKey(deepSeekKey),
    requestId: resolvedRequestId,
    totalLatencyMs: elapsedMs(startedAt),
  }
}
