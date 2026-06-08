// reading-difficulty domain normalizer — surfaceQuestion / synonymDifficulty / difficultyProfile.
// Extracted VERBATIM (indent 0, no re-indent) from server/api.mjs (cut H5-J,
// refactor-roadmap-2026-06). The function bodies are byte-identical to their pre-cut form so the
// T-card override matrix, the giant nested ternary, and the Chinese reason/boundaryCheck template
// literals are preserved exactly — these drive the persisted ai_difficulty_score + the UI, so they
// are a contract, not inert. Deps are module-scoped bindings the factory populates; everything the
// normalizers consume that still lives in api.mjs (optionalString / normalizeAnswerValue /
// cleanDraftText / objectValue / the synonym-knowledge + synonym helpers) is injected. The
// READING_* enum sets, the T-card score floors, and the ~16 stem/option heuristic predicates are
// this module's PRIVATE vocabulary — moved in, NOT exported (folding them in avoids pass-through
// churn). Only the 3 public normalizers are exported. Module never imports api.mjs (no cycle).

let optionalString
let normalizeAnswerValue
let cleanDraftText
let objectValue
let loadSynonymDifficultyKnowledge
let normalizeSynonymCardId
let normalizeSynonymConfidence
let normalizeSynonymBoolean
let uniqueSynonymFlags

export function createReadingDifficultyNormalizer(deps) {
  ;({
    optionalString,
    normalizeAnswerValue,
    cleanDraftText,
    objectValue,
    loadSynonymDifficultyKnowledge,
    normalizeSynonymCardId,
    normalizeSynonymConfidence,
    normalizeSynonymBoolean,
    uniqueSynonymFlags,
  } = deps)
  return {
    normalizeReadingSurfaceQuestion,
    normalizeReadingSynonymDifficulty,
    normalizeReadingDifficultyProfile,
  }
}

const READING_SURFACE_QUESTION_TYPES = new Set([
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
const READING_SURFACE_SCOPES = new Set(['word_or_phrase', 'sentence', 'paragraph', 'passage', 'example'])
const READING_ANSWERING_MOVES = new Set([
  'direct_locating',
  'option_backtracking',
  'context_guessing',
  'coverage_test',
  'function_to_argument',
  'rhetorical_method_identification',
  'minimal_inference',
  'description_to_adjective',
  'multi_point_matching',
  'elimination',
])
const READING_LOAD_LEVELS = new Set(['low', 'medium', 'high'])
const READING_REASONING_LEVELS = new Set(['low', 'medium', 'high', 'very_high'])
const READING_INFO_SPAN_LEVELS = new Set(['single_point', 'multi_point', 'cross_paragraph'])
const READING_INFO_SPAN_SOURCES = new Set(['derived_from_t_card', 'overridden_by_evidence'])
const READING_BLOCKER_POSITIONS = new Set([
  'answer_path',
  'correct_option',
  'distractor',
  'question_stem',
  'passage_background',
])
const READING_BLOCKER_ROLES = new Set(['semantic_bridge', 'distractor_trap', 'answer_key', 'context_clue'])
const READING_MAIN_BLOCKERS = new Set(['vocab', 'syntax', 'distractor', 'abstraction', 'info_span', 'topic'])
const READING_FINAL_LABELS = new Set(['low', 'medium', 'high'])
const READING_T_CARD_SCORE_FLOORS = {
  T1: 1,
  T2: 2,
  T3: 3,
  T4: 3,
  T5: 4,
  T6: 4,
  T7: 4,
  T8: 4,
  T9: 4,
  T10: 7,
}

function readingFinalLabelFromScore(score) {
  if (!score) return ''
  return score <= 3 ? 'low' : score <= 6 ? 'medium' : 'high'
}

function readingScoreFloorForCard(cardId) {
  return READING_T_CARD_SCORE_FLOORS[normalizeSynonymCardId(cardId)] || 0
}

function normalizeEnumString(value, allowed, fallback = '') {
  const normalized = optionalString(value).toLowerCase().replace(/[\s-]+/g, '_')
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeEnumArray(values, allowed) {
  const result = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : [values]).forEach((value) => {
    const normalized = normalizeEnumString(value, allowed)
    if (!normalized || seen.has(normalized)) return
    seen.add(normalized)
    result.push(normalized)
  })
  return result
}

function readingQuestionStemText(item, context = {}) {
  return cleanDraftText([
    context?.originalQuestion?.stem,
    item?.stem,
    item?.question,
    item?.questionText,
    item?.questionStem,
    item?.questionTranslation,
  ].filter(Boolean).join(' '))
}

// The ONE non-private predicate: it is also consumed by the synonym-difficulty routing code that
// stays in api.mjs (hasMentionIntentSignal) and by the H5-K synonym service (which injects it).
// Exported so api.mjs can re-import it for that caller; all other predicates remain file-private.
export function isEntityPurposeMentionStem(stemText) {
  return /\bpurpose\s+of\s+(?:the\s+)?(?:laws?|rules?|polic(?:y|ies)|measures?|programs?|projects?|strateg(?:y|ies))\s+(?:mentioned|listed|discussed)\b/i.test(stemText)
}

function isExampleFunctionStem(stemText) {
  if (isEntityPurposeMentionStem(stemText)) return false
  return /\b(?:mention(?:s|ed|ing)?|discuss(?:es|ed|ing)?|illustrate|show|demonstrate|prove|cite|cited|refer(?:red)? to|list(?:s|ed|ing)?|example)\b/i.test(stemText) ||
    /提及|提到|引用|举例|例子|为了说明|用来说明/.test(stemText)
}

function inferCoverageScopeFromStem(stemText) {
  const text = String(stemText || '')
  if (/\b(?:paragraph|para\.)\b|段/.test(text)) return 'paragraph'
  if (/\b(?:title|text|passage|article)\b|全文|文章|标题/.test(text)) return 'passage'
  return 'paragraph'
}

function readingCorrectOptionTextFromContext(item, context = {}) {
  const answer = normalizeAnswerValue(item?.answer || context?.originalQuestion?.answer).toUpperCase()
  const answerLabel = answer.match(/[A-G]/)?.[0] || ''
  const options = Array.isArray(context?.originalQuestion?.options) ? context.originalQuestion.options : []
  const option = answerLabel
    ? options.find((entry) => optionalString(entry.label).toUpperCase() === answerLabel)
    : null
  return (
    optionalString(option?.content) ||
    optionalString(option?.text) ||
    optionalString(item?.synonymDifficulty?.optionExpression || item?.synonymDifficulty?.option_expression)
  )
}

function optionLooksLikeAdjectiveSummary(optionText) {
  const text = optionalString(optionText)
    .replace(/^[A-G]\s*[.、)]\s*/i, '')
    .replace(/[.。]+$/g, '')
    .trim()
  if (!text) return false
  if (/^(?:to|for|by|because|why|how|what|when|where|who|the|a|an)\b/i.test(text)) return false
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 3) return false
  return words.every((word) => /^[A-Za-z][A-Za-z-]*$/.test(word))
}

function isAdjectiveSummaryStem(stemText, optionText) {
  if (!optionLooksLikeAdjectiveSummary(optionText)) return false
  return (
    /\b(?:best\s+describes?|describe(?:s|d)?|what\s+does\s+.+?\s+think\s+of|how\s+does\s+.+?\s+(?:view|feel\s+about|see))\b/i.test(stemText) ||
    /最能描述|如何评价|怎么看|认为.*怎么样/.test(stemText)
  )
}

function normalizeReadingSurfaceQuestion(item, context = {}) {
  const source = objectValue(item?.surfaceQuestion || item?.surface_question)
  const type = normalizeEnumString(
    source.type || source.questionType || item?.surfaceQuestionType || item?.surface_question_type,
    READING_SURFACE_QUESTION_TYPES,
  )
  let answeringMove = normalizeEnumString(
    source.answeringMove || source.answering_move || item?.answeringMove || item?.answering_move,
    READING_ANSWERING_MOVES,
  )
  let scope = normalizeEnumString(source.scope || item?.questionScope || item?.question_scope, READING_SURFACE_SCOPES)
  let reason = optionalString(source.reason || source.analysis || item?.surfaceQuestionReason || item?.surface_question_reason)
  let normalizedType = type
  const stemText = readingQuestionStemText(item, context)
  const correctOptionText = readingCorrectOptionTextFromContext(item, context)
  const asksExampleFunction = isExampleFunctionStem(stemText)
  const asksAdjectiveSummary = isAdjectiveSummaryStem(stemText, correctOptionText)
  const asksPersonPurpose =
    /\b(?:trying to do|try to do|tried to do|intend(?:ed)? to|aim(?:ed)? to|goal|purpose|want(?:ed)? to|seek(?:ing)? to|call(?:ed)? on)\b/i.test(stemText) ||
    /为什么|为何|目的|试图|想要|旨在/.test(stemText)

  if (asksAdjectiveSummary && normalizedType !== 'adjective_summary') {
    normalizedType = 'adjective_summary'
    answeringMove = 'description_to_adjective'
    reason = reason
      ? `${reason}（后端校正：题干要求用一两个形容词/评价词压缩原文描述，属于 adjective_summary。）`
      : '后端校正：题干要求用一两个形容词/评价词压缩原文描述，属于 adjective_summary。'
  }
  if (['why_did', 'single_detail_normal'].includes(type) && asksExampleFunction) {
    normalizedType = 'example_function'
    scope = 'example'
    answeringMove = answeringMove === 'direct_locating' ? 'function_to_argument' : answeringMove
    reason = reason
      ? `${reason}（后端校正：题干问作者提及/引用某例子的功能，属于例子功能。）`
      : '后端校正：题干问作者提及/引用某例子的功能，属于例子功能。'
  }
  if (type === 'example_function' && asksPersonPurpose && !asksExampleFunction) {
    normalizedType = 'why_did'
    scope = scope === 'example' ? 'sentence' : scope
    answeringMove = answeringMove === 'function_to_argument' ? 'direct_locating' : answeringMove
    reason = reason
      ? `${reason}（后端校正：题干问人物/群体目的，不是例子功能。）`
      : '后端校正：题干问人物/群体目的，不是作者提及例子的功能。'
  }
  if (normalizedType === 'single_detail_normal' && answeringMove === 'coverage_test') {
    const coverageScope = scope || inferCoverageScopeFromStem(stemText)
    if (coverageScope === 'paragraph') {
      normalizedType = 'paragraph_main_idea'
      scope = coverageScope
      reason = reason
        ? `${reason}（后端校正：coverage_test + paragraph 属于段落主旨/归纳，不是普通单细节。）`
        : '后端校正：coverage_test + paragraph 属于段落主旨/归纳，不是普通单细节。'
    } else if (coverageScope === 'passage') {
      normalizedType = 'passage_main_idea'
      scope = coverageScope
      reason = reason
        ? `${reason}（后端校正：coverage_test + passage 属于文章主旨/归纳，不是普通单细节。）`
        : '后端校正：coverage_test + passage 属于文章主旨/归纳，不是普通单细节。'
    }
  }
  if (
    normalizedType === 'passage_main_idea' &&
    /\b(?:author'?s?\s+purpose|purpose\s+in\s+writing|why\s+(?:does|did)\s+the\s+author\s+write)\b/i.test(stemText)
  ) {
    normalizedType = 'author_purpose'
    scope = scope || 'passage'
    answeringMove = answeringMove || 'coverage_test'
    reason = reason
      ? `${reason}（后端校正：题干问作者写作目的，surfaceQuestion.type 应为 author_purpose。）`
      : '后端校正：题干问作者写作目的，surfaceQuestion.type 应为 author_purpose。'
  }
  if (normalizedType === 'why_did' && isWhyDifficultStem(stemText)) {
    answeringMove = 'minimal_inference'
    reason = reason
      ? `${reason}（后端校正：why difficult/hard/challenging 题通常要求推出底层原因，做题动作为 minimal_inference。）`
      : '后端校正：why difficult/hard/challenging 题通常要求推出底层原因，做题动作为 minimal_inference。'
  }
  const rawSynonymSource = objectValue(item?.synonymDifficulty || item?.synonym_difficulty)
  const rawSynonymCardId = normalizeSynonymCardId(rawSynonymSource.cardId || rawSynonymSource.card_id || rawSynonymSource.typeId || rawSynonymSource.type_id || rawSynonymSource.type)
  if (normalizedType === 'multi_detail_learn_from' && ['T1', 'T2', 'T3'].includes(rawSynonymCardId)) {
    normalizedType = 'single_detail_normal'
    reason = reason
      ? `${reason}（后端校正：证据与T卡均为单点，不能标多细节回文验证。）`
      : '后端校正：证据与T卡均为单点，不能标多细节回文验证。'
  }
  if (!type && !answeringMove && !scope && !reason) return null

  return {
    type: normalizedType,
    scope,
    answeringMove,
    reason,
  }
}

function normalizeReadingDifficultyProfile(item, context = {}) {
  const source = objectValue(item?.difficultyProfile || item?.difficulty_profile)
  if (Object.keys(source).length === 0) return null
  const surfaceQuestion = context?.surfaceQuestion || normalizeReadingSurfaceQuestion(item, context)
  const isWordMeaningQuestion = surfaceQuestion?.type === 'word_meaning'
  const synonymCardId =
    context?.synonymDifficulty?.cardId ||
    normalizeSynonymCardId(item?.synonymDifficulty?.cardId || item?.synonymDifficulty?.typeId || item?.synonymDifficulty?.type)
  const scoreFloor = readingScoreFloorForCard(synonymCardId)
  const hasBoundaryFlag = (context?.synonymDifficulty?.boundaryFlags || []).length > 0

  const vocabLoadRaw = objectValue(source.vocabLoad || source.vocab_load)
  const densityRaw = objectValue(vocabLoadRaw.starWordDensity || vocabLoadRaw.star_word_density)
  const blockerWordsRaw = Array.isArray(vocabLoadRaw.blockerWords || vocabLoadRaw.blocker_words)
    ? (vocabLoadRaw.blockerWords || vocabLoadRaw.blocker_words)
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null
          const word = optionalString(entry.word || entry.phrase)
          if (!word) return null
          return {
            word,
            position: normalizeEnumString(entry.position, READING_BLOCKER_POSITIONS),
            role: normalizeEnumString(entry.role, READING_BLOCKER_ROLES),
            reason: optionalString(entry.reason || entry.analysis),
          }
        })
        .filter(Boolean)
    : []
  const blockerWords = isWordMeaningQuestion
    ? blockerWordsRaw.filter((word) => word.position !== 'question_stem')
    : blockerWordsRaw

  const syntaxLoadRaw = objectValue(source.syntaxLoad || source.syntax_load)
  const infoSpanRaw = objectValue(source.infoSpan || source.info_span)
  const rawInfoSpan = typeof (source.infoSpan || source.info_span) === 'string' ? source.infoSpan || source.info_span : ''
  const finalScoreNumber = Number(source.finalScore ?? source.final_score)
  const rawFinalScore = Number.isFinite(finalScoreNumber)
    ? Math.max(1, Math.min(10, Math.round(finalScoreNumber)))
    : 0
  const boundaryFloor = hasBoundaryFlag && scoreFloor > 0 ? Math.min(10, scoreFloor + 1) : scoreFloor
  const finalScore = Math.max(rawFinalScore, boundaryFloor)
  const finalLabel = readingFinalLabelFromScore(finalScore)
  const rawMainBlockers = normalizeEnumArray(source.mainBlockers || source.main_blockers || [], READING_MAIN_BLOCKERS)
  const rawVocabLevel = normalizeEnumString(vocabLoadRaw.level, READING_LOAD_LEVELS)
  const hasSemanticBridge = blockerWords.some((word) => word.role === 'semantic_bridge')
  const vocabLevel = blockerWords.length === 0 ? 'low' : hasSemanticBridge && rawVocabLevel === 'low' ? 'medium' : rawVocabLevel
  const mainBlockers = vocabLevel === 'low' ? rawMainBlockers.filter((blocker) => blocker !== 'vocab') : rawMainBlockers

  return {
    vocabLoad: {
      starWordDensity: {
        passage: normalizeEnumString(densityRaw.passage, READING_LOAD_LEVELS),
        answerPath: normalizeEnumString(densityRaw.answerPath || densityRaw.answer_path, READING_LOAD_LEVELS),
        options: normalizeEnumString(densityRaw.options, READING_LOAD_LEVELS),
      },
      blockerWords,
      level: vocabLevel,
    },
    syntaxLoad: {
      level: normalizeEnumString(syntaxLoadRaw.level, READING_LOAD_LEVELS),
      evidenceSentence: optionalString(syntaxLoadRaw.evidenceSentence || syntaxLoadRaw.evidence_sentence),
      reason: optionalString(syntaxLoadRaw.reason || syntaxLoadRaw.analysis),
    },
    infoSpan: {
      level: normalizeEnumString(infoSpanRaw.level || rawInfoSpan, READING_INFO_SPAN_LEVELS),
      source: normalizeEnumString(infoSpanRaw.source, READING_INFO_SPAN_SOURCES),
      evidence: optionalString(infoSpanRaw.evidence || infoSpanRaw.reason),
    },
    reasoningAbstraction: normalizeEnumString(
      source.reasoningAbstraction || source.reasoning_abstraction,
      READING_REASONING_LEVELS,
    ),
    distractorStrength: normalizeEnumString(
      source.distractorStrength || source.distractor_strength,
      READING_LOAD_LEVELS,
    ),
    topicAbstractness: normalizeEnumString(source.topicAbstractness || source.topic_abstractness, READING_LOAD_LEVELS),
    mainBlockers,
    finalScore,
    finalLabel,
    reason: optionalString(source.reason || source.analysis),
  }
}

function isEllipticalQuestionTitle(optionExpression) {
  const text = optionalString(optionExpression)
  if (!text || !/\?$/.test(text)) return false
  const match = text.match(/^(?:why|what|where|who|when|how)\b\s+(.+)\?$/i)
  if (!match) return false
  return !/\b(?:am|is|are|was|were|be|being|been|do|does|did|can|could|will|would|should|may|might|must|have|has|had)\b/i.test(match[1])
}

function hasCrossSentenceEvidence(sourceExpression) {
  const text = optionalString(sourceExpression)
  if (!text) return false
  if (/…|\.\.\.|[；;]/.test(text)) return true
  const sentenceEnds = text.match(/[.!?。！？](?:\s|$|["'”’])/g) || []
  return sentenceEnds.length >= 2
}

function hasMultiPointSelfDescription(...values) {
  const text = values.map((value) => optionalString(value)).filter(Boolean).join(' ')
  return /(?:多句|多个|两句|两处|多处|multi(?:ple)?|two|several)/i.test(text)
}

function isCausalReadingStem(stemText) {
  return /\b(?:what\s+(?:has\s+)?led\s+to|what\s+(?:has\s+)?caused|why\b|reason|resulted?\s+in|bring(?:s|ing)?\s+about)\b/i.test(stemText) ||
    /为什么|为何|原因|导致|造成|引起/.test(stemText)
}

function optionAddsMissingJudgment(sourceExpression, optionExpression) {
  const source = optionalString(sourceExpression).toLowerCase()
  const option = optionalString(optionExpression).toLowerCase()
  const judgmentWords = ['improper', 'wrong', 'flawed', 'poor', 'incorrect', 'inadequate', 'misleading']
  return judgmentWords.some((word) => option.includes(word) && !source.includes(word))
}

function isWhyDifficultStem(stemText) {
  const text = optionalString(stemText)
  return /\bwhy\b.+\b(?:difficult|hard|challenging|challenge|tricky|complicated)\b/i.test(text) ||
    /为什么.+(?:难|困难|不容易|有挑战)/.test(text)
}

function optionAddsUnderlyingCause(sourceExpression, optionExpression) {
  const source = optionalString(sourceExpression).toLowerCase()
  const option = optionalString(optionExpression).toLowerCase()
  const causePatterns = [
    /\brooted in\b/,
    /\bdeep(?:ly)?\s+(?:rooted|held)\b/,
    /\bfundamental\b/,
    /\binherent\b/,
    /\bunderlying\b/,
    /\btendency\b/,
  ]
  return causePatterns.some((pattern) => pattern.test(option) && !pattern.test(source))
}

const READING_SURFACE_CARD_OVERRIDES = {
  paragraph_main_idea: 'T5',
  passage_main_idea: 'T5',
  author_purpose: 'T5',
  inference_general: 'T6',
  example_function: 'T7',
  attitude_tone: 'T9',
}

function normalizeReadingSynonymDifficulty(item, context = {}) {
  if (!item || typeof item !== 'object') return null

  const knowledge = loadSynonymDifficultyKnowledge()
  const rawCardId = normalizeSynonymCardId(item.cardId || item.typeId || item.type)
  const sourceExpression = optionalString(item.sourceExpression || item.source_expression)
  const optionExpression = optionalString(item.optionExpression || item.option_expression)
  const rawReason = optionalString(item.reason || item.reasoning || item.analysis)
  const rawBoundaryCheck = optionalString(item.boundaryCheck || item.boundary_check)
  const stemText = readingQuestionStemText(item, context)
  const isWordMeaningQuestion = context?.surfaceQuestion?.type === 'word_meaning'
  const isAbstractPhraseSummary = context?.surfaceQuestion?.type === 'abstract_phrase_summary'
  const isWritingTechniqueQuestion = ['writing_technique', 'paragraph_function'].includes(context?.surfaceQuestion?.type)
  const isAdjectiveSummary = context?.surfaceQuestion?.type === 'adjective_summary'
  const isEntityPurposeMention = isEntityPurposeMentionStem(stemText)
  const isAbstractTitleCompression =
    context?.surfaceQuestion?.type === 'passage_main_idea' &&
    context?.surfaceQuestion?.answeringMove === 'coverage_test' &&
    isEllipticalQuestionTitle(optionExpression)
  const forcedWordMeaningCard = isWordMeaningQuestion && rawCardId !== 'T1'
  const forcedAbstractPhraseCard = isAbstractPhraseSummary && rawCardId !== 'T10'
  const forcedAbstractTitleCard = isAbstractTitleCompression && rawCardId !== 'T10'
  const forcedWritingTechniqueCard = isWritingTechniqueQuestion && rawCardId !== 'T8'
  const forcedAdjectiveSummaryCard = isAdjectiveSummary && !['T6', 'T10'].includes(rawCardId)
  const forcedWhyDidInferenceCard =
    context?.surfaceQuestion?.type === 'why_did' &&
    rawCardId === 'T2' &&
    hasCrossSentenceEvidence(sourceExpression)
  const forcedCausalJudgmentInferenceCard =
    rawCardId === 'T2' &&
    isCausalReadingStem(stemText) &&
    optionAddsMissingJudgment(sourceExpression, optionExpression)
  const forcedWhyDifficultInferenceCard =
    rawCardId === 'T2' &&
    isWhyDifficultStem(stemText) &&
    optionAddsUnderlyingCause(sourceExpression, optionExpression)
  const forcedMultiPointSelfDescribedCard =
    rawCardId === 'T2' &&
    hasCrossSentenceEvidence(sourceExpression) &&
    hasMultiPointSelfDescription(rawReason, rawBoundaryCheck)
  const forcedEntityPurposeMentionCard = isEntityPurposeMention && rawCardId === 'T7'
  const surfaceOverrideCardId = READING_SURFACE_CARD_OVERRIDES[context?.surfaceQuestion?.type] || ''
  const forcedSurfaceCard = Boolean(surfaceOverrideCardId) && !isAbstractTitleCompression && rawCardId !== surfaceOverrideCardId
  const cardId = forcedWordMeaningCard
    ? 'T3'
    : forcedAbstractPhraseCard
      ? 'T10'
      : forcedAbstractTitleCard
        ? 'T10'
        : forcedWritingTechniqueCard
          ? 'T8'
          : forcedAdjectiveSummaryCard
            ? 'T10'
            : forcedWhyDidInferenceCard
              ? 'T6'
              : forcedCausalJudgmentInferenceCard
                ? 'T6'
                : forcedWhyDifficultInferenceCard
                  ? 'T6'
                  : forcedMultiPointSelfDescribedCard
                    ? 'T4'
                    : forcedEntityPurposeMentionCard
                      ? 'T2'
                      : forcedSurfaceCard
                        ? surfaceOverrideCardId
                        : rawCardId
  const card = knowledge.cardMap.get(cardId)
  if (!card) return null
  const shouldFlagWhyDifficultInference =
    cardId === 'T6' &&
    isWhyDifficultStem(stemText) &&
    optionAddsUnderlyingCause(sourceExpression, optionExpression)
  const shouldFlagExampleFunctionBoundary =
    context?.surfaceQuestion?.type === 'example_function' &&
    cardId === 'T7'
  const shouldFlagWritingTechniqueBoundary =
    isWritingTechniqueQuestion &&
    cardId === 'T8'
  const shouldFlagMainIdeaBoundary =
    ['paragraph_main_idea', 'passage_main_idea', 'author_purpose'].includes(context?.surfaceQuestion?.type) &&
    ['T5', 'T10'].includes(cardId)

  const confidence = normalizeSynonymConfidence(item.confidence ?? item.score ?? item.conf, 0.82)
  const reviewThreshold = ['T6', 'T8'].includes(cardId) ? 0.78 : 0.72
  const forcedCard =
    forcedWordMeaningCard ||
    forcedAbstractPhraseCard ||
    forcedAbstractTitleCard ||
    forcedWritingTechniqueCard ||
    forcedAdjectiveSummaryCard ||
    forcedWhyDidInferenceCard ||
    forcedCausalJudgmentInferenceCard ||
    forcedWhyDifficultInferenceCard ||
    forcedMultiPointSelfDescribedCard ||
    forcedEntityPurposeMentionCard ||
    forcedSurfaceCard
  const reviewNeeded =
    normalizeSynonymBoolean(item.reviewNeeded ?? item.review_needed ?? item.needsReview) ||
    forcedWordMeaningCard ||
    isAbstractPhraseSummary ||
    forcedAbstractTitleCard ||
    forcedWritingTechniqueCard ||
    isAdjectiveSummary ||
    forcedWhyDidInferenceCard ||
    forcedCausalJudgmentInferenceCard ||
    forcedWhyDifficultInferenceCard ||
    forcedMultiPointSelfDescribedCard ||
    forcedEntityPurposeMentionCard ||
    forcedSurfaceCard ||
    ['T9', 'T10'].includes(cardId) ||
    confidence < reviewThreshold

  const boundaryFlags = uniqueSynonymFlags(item.boundaryFlags || item.boundary_flags || [])
  const normalizedBoundaryFlags = forcedWordMeaningCard
    ? uniqueSynonymFlags([
        ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6'].includes(flag)),
        'T3_T6',
      ])
    : forcedAbstractPhraseCard
      ? uniqueSynonymFlags([
          ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T6_T9'].includes(flag)),
          'T6_T10',
        ])
      : forcedAbstractTitleCard
        ? uniqueSynonymFlags([
            ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T6_T9', 'T7_T8'].includes(flag)),
            'T5_T10',
          ])
        : forcedWritingTechniqueCard || shouldFlagWritingTechniqueBoundary
        ? uniqueSynonymFlags([
            ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T9'].includes(flag)),
            'T7_T8',
          ])
        : isAdjectiveSummary
          ? uniqueSynonymFlags([
              ...boundaryFlags.filter((flag) => !['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T9'].includes(flag)),
              'T6_T10',
            ])
          : forcedWhyDidInferenceCard
            ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
            : forcedCausalJudgmentInferenceCard
            ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
            : forcedWhyDifficultInferenceCard
              ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
              : shouldFlagWhyDifficultInference
                ? uniqueSynonymFlags([...boundaryFlags, 'T2_T6'])
                : shouldFlagExampleFunctionBoundary
                  ? uniqueSynonymFlags([...boundaryFlags, 'T7_T8'])
                  : shouldFlagMainIdeaBoundary
                    ? uniqueSynonymFlags([...boundaryFlags, 'T5_T10'])
                    : forcedMultiPointSelfDescribedCard
                      ? uniqueSynonymFlags([...boundaryFlags, 'T2_T4'])
                      : forcedEntityPurposeMentionCard
                        ? uniqueSynonymFlags(boundaryFlags.filter((flag) => flag !== 'T7_T8'))
                        : boundaryFlags
  const reason = forcedWordMeaningCard
    ? `单点类 T3：题干要求推测词/短语在语境中的含义，目标是确定词义本身，因此是${card.name}。`
    : forcedAbstractPhraseCard
      ? `抽象拓展类 T10：题面要求把具体描述压缩成抽象概念短语，正确选项属于抽象标签，因此是${card.name}。`
      : forcedAbstractTitleCard
        ? `抽象拓展类 T10：题干虽是标题/主旨题，但正确标题是省略式疑问标题，需要将全文具体批评压缩为抽象标题，因此是${card.name}。`
        : forcedWritingTechniqueCard
          ? `关联类 T8：题干要求判断作者如何展开段落或呈现问题，目标是识别段落修辞/写作手法功能，因此是${card.name}。`
          : forcedAdjectiveSummaryCard
          ? `抽象拓展类 T10：题干要求把原文描述压缩成形容词评价标签，正确选项不是单句同义替换，而是性质概括，因此是${card.name}。`
          : forcedWhyDidInferenceCard
            ? `关联类 T6：题干问原因/目的，但答案需要跨句情感、因果或目的推断，不能只按单句同义改写处理，因此是${card.name}。`
            : forcedCausalJudgmentInferenceCard
              ? `关联类 T6：题干问原因/结果，正确选项加入了原文未直接给出的评价性判断，需要从原文原因线索推出，因此是${card.name}。`
              : forcedWhyDifficultInferenceCard
                ? `关联类 T6：题干问为什么困难，正确选项概括的是原文现象背后的底层原因，而非单句同义替换，因此是${card.name}。`
                : forcedMultiPointSelfDescribedCard
                  ? `多点类 T4：原文证据跨句，且解析自身说明存在多个动作/信息点，正确选项需要拼合这些信息后概括，因此是${card.name}。`
                  : forcedEntityPurposeMentionCard
                    ? `单点类 T2：题干问法律/政策本身的目的，原文单句给出其保护对象或用途，选项只是同义概括，不是作者举例意图，因此是${card.name}。`
                    : forcedSurfaceCard
                      ? `${card.soloLevel || ''} ${cardId}：题型画像为${context?.surfaceQuestion?.type}，后端按题型轴将T卡校正为${card.name || cardId}。`.trim()
                      : rawReason
  const boundaryCheck = forcedWordMeaningCard
    ? '不是T2单句同义改写：猜词题的任务不是识别普通同义替换，而是根据上下文确定目标词在本文中的语境义。'
    : forcedAbstractPhraseCard
      ? '不是T6隐含逻辑推断：本题重点不是推出一个事实性结论，而是将具体描述概括为抽象概念标签。'
      : forcedAbstractTitleCard
        ? '不是普通T5主旨覆盖：本题正确标题不是直接概括文章讲什么，而是用省略式疑问将全文批评压缩成抽象标题。'
        : forcedWritingTechniqueCard
          ? '不是T2单句同义改写：正确选项即使是简短手法标签，也是在判断段落展开方式或修辞功能，而不是把某个单句换词表达。'
          : forcedAdjectiveSummaryCard
            ? '不是T2单句同义改写：形容词压缩题要求从具体描述概括性质或评价，学生要完成抽象标签匹配，而不是识别原文单句换词。'
            : forcedWhyDidInferenceCard
              ? '不是T2单句同义改写：答案不是单句直接换词，而是从跨句线索推出人物目的或原因。'
              : forcedCausalJudgmentInferenceCard
                ? '不是T2单句同义改写：原文只给出原因线索，选项中的评价性判断不是原文原词或直接同义词。'
                : forcedWhyDifficultInferenceCard
                  ? '不是T2单句同义改写：原文没有直接说出这个底层原因，而是需要从现象或例子推出为什么困难。'
                  : forcedMultiPointSelfDescribedCard
                    ? '不是T2单句同义改写：T2只适用于单句单点换词；跨句多个动作/信息点压缩成选项应判T4。'
                    : forcedEntityPurposeMentionCard
                      ? '不是T7举例引用意图：mentioned 在这里只是修饰 laws/policies，题干问法律/政策目的，不是作者为什么提及该例子。'
                      : forcedSurfaceCard
                        ? '后端一致性校正：surfaceQuestion.type 已经确定题型轴，synonymDifficulty.cardId 必须与题型轴一致。'
                        : rawBoundaryCheck

  return {
    cardId,
    name: forcedCard
      ? card.name || cardId
      : optionalString(item.name) || card.name || cardId,
    soloLevel: forcedCard
      ? card.soloLevel || ''
      : optionalString(item.soloLevel || item.solo_level) || card.soloLevel || '',
    higherOrderThinking: forcedCard
      ? card.higherOrderThinking || ''
      : optionalString(item.higherOrderThinking || item.higher_order_thinking) || card.higherOrderThinking || '',
    difficultyDefault: Number(card.difficultyDefault || item.difficultyDefault || item.difficulty || 0) || 0,
    confidence,
    sourceExpression,
    optionExpression,
    reason,
    boundaryCheck,
    studentBlocker: forcedCard
      ? card.studentBlocker || ''
      : optionalString(item.studentBlocker || item.student_blocker) || card.studentBlocker || '',
    teachingMove: forcedCard
      ? card.teachingMove || ''
      : optionalString(item.teachingMove || item.teaching_move) || card.teachingMove || '',
    reviewNeeded,
    boundaryFlags: normalizedBoundaryFlags,
    evidenceSource: 'deepseek_reading_parse',
  }
}
