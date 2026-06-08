#!/usr/bin/env node
// H5-J — reading-difficulty domain normalizer.
// Golden-output fixtures over the 3 public normalizers: the T-card surface-override matrix,
// the six-dimension difficultyProfile scoring + score-floor logic + word_meaning blocker
// filtering, and surfaceQuestion type/answeringMove correction. Pure normalization — NO provider,
// NO DB, NO file read: the synonym knowledge + the small pure helpers that still live in api.mjs
// are injected as faithful stubs (the helper bodies below are byte-mirrors of api.mjs so the
// golden outputs reflect production behavior). Includes an invocation smoke through the factory
// and a source-level seam guard (module is the sole definer; api.mjs re-imports only what it uses).
import { createReadingDifficultyNormalizer, isEntityPurposeMentionStem } from '../server/reading-analysis/readingDifficultyNormalizer.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-J reading-difficulty normalizer')

// ── Faithful stub deps (byte-mirrors of the api.mjs pure helpers) ──────────────────────────────
function optionalString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}
function cleanDraftText(text) {
  return optionalString(text).replace(/\s+/g, ' ').trim()
}
function normalizeAnswerValue(value) {
  return optionalString(value)
}
function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}
function normalizeSynonymCardId(value) {
  const raw = optionalString(value).toUpperCase().replace(/\s+/g, '')
  if (!raw) return ''
  const match = raw.match(/T(?:10|[1-9])/)
  return match ? match[0] : raw
}
function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
function normalizeSynonymConfidence(value, fallback = 0.68) {
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
function normalizeSynonymBoolean(value) {
  if (value === true) return true
  if (value === false) return false
  const text = optionalString(value).toLowerCase()
  if (!text) return false
  return ['true', 'yes', '需要', '是', '1', 'review', 'review_needed'].includes(text)
}
function uniqueSynonymFlags(values) {
  const allowedFlags = new Set(['T1_T2', 'T2_T4', 'T2_T6', 'T3_T6', 'T4_T6', 'T5_T10', 'T6_T10', 'T7_T8', 'T6_T9'])
  const flags = []
  const seen = new Set()
  ;(Array.isArray(values) ? values : [values]).forEach((value) => {
    const flag = optionalString(value).toUpperCase()
    if (!allowedFlags.has(flag) || seen.has(flag)) return
    seen.add(flag)
    flags.push(flag)
  })
  return flags
}
// Representative T-card knowledge (cardId/name/soloLevel/difficultyDefault), no file read.
const T_CARDS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10'].map((id) => ({
  cardId: id,
  name: `${id}卡`,
  soloLevel: 'multistructural',
  higherOrderThinking: 'no',
  difficultyDefault: Number(id.slice(1)),
  studentBlocker: `${id}-blocker`,
  teachingMove: `${id}-move`,
}))
function loadSynonymDifficultyKnowledge() {
  const cardMap = new Map(T_CARDS.map((card) => [card.cardId, card]))
  return { cards: T_CARDS, cardMap, cardIds: new Set(T_CARDS.map((c) => c.cardId)) }
}

const normalizer = createReadingDifficultyNormalizer({
  optionalString,
  normalizeAnswerValue,
  cleanDraftText,
  objectValue,
  loadSynonymDifficultyKnowledge,
  normalizeSynonymCardId,
  normalizeSynonymConfidence,
  normalizeSynonymBoolean,
  uniqueSynonymFlags,
})
const { normalizeReadingSurfaceQuestion, normalizeReadingSynonymDifficulty, normalizeReadingDifficultyProfile } =
  normalizer

// ── surfaceQuestion: type/answeringMove correction matrix ───────────────────────────────────────
verifier.section('normalizeReadingSurfaceQuestion (type-correction matrix)')

// coverage_test + single_detail_normal + paragraph stem -> paragraph_main_idea
const sqCoverage = normalizeReadingSurfaceQuestion({
  surfaceQuestion: { type: 'single_detail_normal', answeringMove: 'coverage_test', scope: 'paragraph' },
  stem: 'Which of the following best summarizes paragraph 2?',
})
verifier.assert(sqCoverage.type === 'paragraph_main_idea', 'coverage_test + paragraph -> paragraph_main_idea')
verifier.assert(sqCoverage.scope === 'paragraph', 'coverage scope preserved as paragraph')

// author-purpose lift from passage_main_idea
const sqAuthor = normalizeReadingSurfaceQuestion({
  surfaceQuestion: { type: 'passage_main_idea', answeringMove: 'coverage_test' },
  stem: "What is the author's purpose in writing the text?",
})
verifier.assert(sqAuthor.type === 'author_purpose', "author's purpose stem -> author_purpose")
verifier.assert(sqAuthor.scope === 'passage', 'author_purpose default scope passage')

// example_function detection from why_did + mention stem
const sqExample = normalizeReadingSurfaceQuestion({
  surfaceQuestion: { type: 'why_did', answeringMove: 'direct_locating' },
  stem: 'Why does the author mention the example of the bridge?',
})
verifier.assert(sqExample.type === 'example_function', 'mention/example stem -> example_function')
verifier.assert(sqExample.scope === 'example', 'example_function scope=example')
verifier.assert(sqExample.answeringMove === 'function_to_argument', 'direct_locating -> function_to_argument')

// person-purpose demotes example_function back to why_did
const sqPerson = normalizeReadingSurfaceQuestion({
  surfaceQuestion: { type: 'example_function', answeringMove: 'function_to_argument', scope: 'example' },
  stem: 'Why did the scientists aim to do this?',
})
verifier.assert(sqPerson.type === 'why_did', 'person-purpose (no example signal) -> why_did')
verifier.assert(sqPerson.answeringMove === 'direct_locating', 'function_to_argument -> direct_locating on demotion')

// adjective-summary detection
const sqAdj = normalizeReadingSurfaceQuestion(
  { surfaceQuestion: { type: 'single_detail_normal' }, stem: 'Which word best describes the man?' },
  { originalQuestion: { answer: 'B', options: [{ label: 'B', content: 'generous' }] } },
)
verifier.assert(sqAdj.type === 'adjective_summary', 'best-describes + adjective option -> adjective_summary')
verifier.assert(sqAdj.answeringMove === 'description_to_adjective', 'adjective_summary answeringMove')

// multi_detail demotion when T-card is single-point
const sqMulti = normalizeReadingSurfaceQuestion({
  surfaceQuestion: { type: 'multi_detail_learn_from' },
  synonymDifficulty: { cardId: 'T2' },
  stem: 'According to the text, what happened?',
})
verifier.assert(sqMulti.type === 'single_detail_normal', 'multi_detail + T2 -> single_detail_normal')

// empty input -> null
verifier.assert(normalizeReadingSurfaceQuestion({}) === null, 'no surface signals -> null')

// ── synonymDifficulty: T-card override matrix ───────────────────────────────────────────────────
verifier.section('normalizeReadingSynonymDifficulty (T-card override matrix)')

// word_meaning forces T3
const sdWord = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.9 },
  { surfaceQuestion: { type: 'word_meaning' } },
)
verifier.assert(sdWord.cardId === 'T3', 'word_meaning forces T3')
verifier.assert(sdWord.reviewNeeded === true, 'forced word_meaning -> reviewNeeded')
verifier.assert(sdWord.boundaryFlags.includes('T3_T6'), 'forced word_meaning adds T3_T6 flag')
verifier.assert(sdWord.reason.includes('单点类 T3'), 'forced word_meaning reason text')

// abstract_phrase_summary forces T10
const sdAbstract = normalizeReadingSynonymDifficulty(
  { cardId: 'T6', confidence: 0.9 },
  { surfaceQuestion: { type: 'abstract_phrase_summary' } },
)
verifier.assert(sdAbstract.cardId === 'T10', 'abstract_phrase_summary forces T10')
verifier.assert(sdAbstract.boundaryFlags.includes('T6_T10'), 'forced abstract adds T6_T10')

// writing_technique forces T8
const sdWriting = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.9 },
  { surfaceQuestion: { type: 'writing_technique' } },
)
verifier.assert(sdWriting.cardId === 'T8', 'writing_technique forces T8')
verifier.assert(sdWriting.boundaryFlags.includes('T7_T8'), 'forced writing adds T7_T8')

// surface-override map: inference_general -> T6
const sdInfer = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.95 },
  { surfaceQuestion: { type: 'inference_general' } },
)
verifier.assert(sdInfer.cardId === 'T6', 'surfaceOverride inference_general -> T6')

// attitude_tone -> T9 (and T9 always reviewNeeded)
const sdAttitude = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.95 },
  { surfaceQuestion: { type: 'attitude_tone' } },
)
verifier.assert(sdAttitude.cardId === 'T9', 'surfaceOverride attitude_tone -> T9')
verifier.assert(sdAttitude.reviewNeeded === true, 'T9 -> reviewNeeded')

// why_did + cross-sentence evidence forces T6 from T2
const sdWhyDid = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.95, sourceExpression: 'He left early. He never returned.' },
  { surfaceQuestion: { type: 'why_did' } },
)
verifier.assert(sdWhyDid.cardId === 'T6', 'why_did + cross-sentence evidence -> T6')
verifier.assert(sdWhyDid.boundaryFlags.includes('T2_T6'), 'forced why_did adds T2_T6')

// entity-purpose mention demotes T7 -> T2
const sdEntity = normalizeReadingSynonymDifficulty(
  { cardId: 'T7', confidence: 0.9 },
  { surfaceQuestion: { type: 'single_detail_normal' }, originalQuestion: { stem: 'What is the purpose of the laws mentioned in paragraph 3?' } },
)
verifier.assert(sdEntity.cardId === 'T2', 'entity-purpose mention demotes T7 -> T2')

// no override: low confidence still drives reviewNeeded
const sdPlain = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.5, reason: 'r', boundaryCheck: 'b' },
  { surfaceQuestion: { type: 'single_detail_normal' } },
)
verifier.assert(sdPlain.cardId === 'T2', 'no-override keeps raw T2')
verifier.assert(sdPlain.reviewNeeded === true, 'confidence < 0.72 -> reviewNeeded')
verifier.assert(sdPlain.reason === 'r' && sdPlain.boundaryCheck === 'b', 'unforced reason/boundaryCheck passthrough')
verifier.assert(sdPlain.evidenceSource === 'deepseek_reading_parse', 'evidenceSource constant preserved')

// null guards
verifier.assert(normalizeReadingSynonymDifficulty(null) === null, 'null item -> null')
verifier.assert(normalizeReadingSynonymDifficulty({ cardId: 'TZ' }) === null, 'unknown card -> null')

// ── difficultyProfile: six-dimension scoring + floor + blocker filtering ────────────────────────
verifier.section('normalizeReadingDifficultyProfile (six-dimension scoring)')

const dpFull = normalizeReadingDifficultyProfile(
  {
    difficultyProfile: {
      vocabLoad: {
        level: 'high',
        starWordDensity: { passage: 'high', answerPath: 'medium', options: 'low' },
        blockerWords: [
          { word: 'salient', position: 'answer_path', role: 'semantic_bridge', reason: 'key' },
          { word: 'noise', position: 'question_stem', role: 'distractor_trap' },
        ],
      },
      syntaxLoad: { level: 'medium', evidenceSentence: 'A long clause.', reason: 'nested' },
      infoSpan: { level: 'multi_point', source: 'overridden_by_evidence', evidence: 'two spots' },
      reasoningAbstraction: 'high',
      distractorStrength: 'high',
      topicAbstractness: 'medium',
      mainBlockers: ['vocab', 'syntax'],
      finalScore: 7,
      reason: 'overall hard',
    },
  },
  { synonymDifficulty: { cardId: 'T6', boundaryFlags: ['T2_T6'] } },
)
// boundaryFloor = min(10, T6 floor 4 + 1) = 5; raw finalScore 7 wins via Math.max -> 7
verifier.assert(dpFull.finalScore === 7, 'raw finalScore 7 beats boundary floor 5 (T6 floor 4 + 1)')
verifier.assert(dpFull.finalLabel === 'high', 'finalScore 7 -> high label')
verifier.assert(dpFull.vocabLoad.level === 'high', 'vocab level preserved when blockers present')
verifier.assert(dpFull.vocabLoad.blockerWords.length === 2, 'blockerWords kept (non word_meaning)')
verifier.assert(dpFull.infoSpan.level === 'multi_point', 'infoSpan level normalized')
verifier.assert(dpFull.mainBlockers.join(',') === 'vocab,syntax', 'mainBlockers preserved')

// word_meaning filters question_stem blockers + low-vocab drops vocab mainBlocker
const dpWord = normalizeReadingDifficultyProfile(
  {
    surfaceQuestion: { type: 'word_meaning' },
    difficultyProfile: {
      vocabLoad: {
        level: 'low',
        blockerWords: [{ word: 'q', position: 'question_stem', role: 'context_clue' }],
      },
      mainBlockers: ['vocab', 'distractor'],
      finalScore: 5,
    },
  },
  { surfaceQuestion: { type: 'word_meaning' } },
)
verifier.assert(dpWord.vocabLoad.blockerWords.length === 0, 'word_meaning drops question_stem blocker')
verifier.assert(dpWord.vocabLoad.level === 'low', 'no blockers -> vocab level low')
verifier.assert(!dpWord.mainBlockers.includes('vocab'), 'low vocab drops vocab from mainBlockers')
verifier.assert(dpWord.mainBlockers.includes('distractor'), 'non-vocab mainBlocker kept')

// semantic_bridge lifts low vocab to medium
const dpBridge = normalizeReadingDifficultyProfile(
  {
    difficultyProfile: {
      vocabLoad: { level: 'low', blockerWords: [{ word: 'x', position: 'answer_path', role: 'semantic_bridge' }] },
      finalScore: 3,
    },
  },
  {},
)
verifier.assert(dpBridge.vocabLoad.level === 'medium', 'semantic_bridge + low -> medium vocab')
verifier.assert(dpBridge.finalLabel === 'low', 'finalScore 3 -> low label')

// empty profile -> null
verifier.assert(normalizeReadingDifficultyProfile({ difficultyProfile: {} }) === null, 'empty difficultyProfile -> null')

// score floor without boundary flag (T10 floor 7 beats raw 5)
const dpFloor = normalizeReadingDifficultyProfile(
  { difficultyProfile: { finalScore: 5 } },
  { synonymDifficulty: { cardId: 'T10', boundaryFlags: [] } },
)
verifier.assert(dpFloor.finalScore === 7, 'T10 score floor 7 lifts raw 5 -> 7 (no boundary flag)')

// boundary-flag floor lift: T6 floor 4 + 1 = 5 beats raw finalScore 3
const dpBoundaryLift = normalizeReadingDifficultyProfile(
  { difficultyProfile: { finalScore: 3 } },
  { synonymDifficulty: { cardId: 'T6', boundaryFlags: ['T2_T6'] } },
)
verifier.assert(dpBoundaryLift.finalScore === 5, 'boundary-flag floor (T6 4+1=5) lifts raw 3 -> 5')
verifier.assert(dpBoundaryLift.finalLabel === 'medium', 'finalScore 5 -> medium label')

// ── invocation smoke: end-to-end through normalizeReadingParseQuestion-shaped input ──────────────
verifier.section('Invocation smoke (factory result wired through public surface)')
const smokeSurface = normalizeReadingSurfaceQuestion(
  { surfaceQuestion: { type: 'why_did', answeringMove: 'minimal_inference' }, stem: 'Why is the task difficult?' },
)
const smokeSyn = normalizeReadingSynonymDifficulty(
  { cardId: 'T2', confidence: 0.9, sourceExpression: 'a phenomenon', optionExpression: 'a fundamental tendency', reason: 'Why difficult' },
  { surfaceQuestion: smokeSurface, originalQuestion: { stem: 'Why is the task difficult?' } },
)
const smokeProfile = normalizeReadingDifficultyProfile(
  { difficultyProfile: { finalScore: 4 } },
  { synonymDifficulty: smokeSyn, surfaceQuestion: smokeSurface },
)
verifier.assert(smokeSurface.answeringMove === 'minimal_inference', 'smoke: why_did + difficult keeps minimal_inference')
verifier.assert(smokeSyn.cardId === 'T6', 'smoke: why-difficult + underlying-cause option forces T6')
verifier.assert(smokeProfile && smokeProfile.finalScore >= 4, 'smoke: profile computes with T6 floor')

// isEntityPurposeMentionStem export (the one shared predicate api.mjs re-imports)
verifier.assert(isEntityPurposeMentionStem('the purpose of the laws mentioned here') === true, 'isEntityPurposeMentionStem matches entity-purpose stem')
verifier.assert(isEntityPurposeMentionStem('why does the author mention this') === false, 'isEntityPurposeMentionStem rejects plain mention')

// ── source-level seam guard (used-but-undefined / sole-definer / no cycle) ──────────────────────
verifier.section('Extraction seam')
const apiSource = readText(root, 'server/api.mjs')
const moduleSource = readText(root, 'server/reading-analysis/readingDifficultyNormalizer.mjs')

const movedPrivate = [
  'readingQuestionStemText', 'isExampleFunctionStem', 'inferCoverageScopeFromStem',
  'readingCorrectOptionTextFromContext', 'optionLooksLikeAdjectiveSummary', 'isAdjectiveSummaryStem',
  'isEllipticalQuestionTitle', 'hasCrossSentenceEvidence', 'hasMultiPointSelfDescription',
  'isCausalReadingStem', 'optionAddsMissingJudgment', 'isWhyDifficultStem', 'optionAddsUnderlyingCause',
  'normalizeEnumString', 'normalizeEnumArray', 'readingFinalLabelFromScore', 'readingScoreFloorForCard',
]
for (const name of movedPrivate) {
  verifier.assert(!new RegExp(`function ${name}\\(`).test(apiSource), `api.mjs no longer defines ${name}`)
  verifier.assert(new RegExp(`function ${name}\\(`).test(moduleSource), `module defines ${name}`)
  // file-private: not exported
  verifier.assert(!new RegExp(`^export function ${name}\\(`, 'm').test(moduleSource), `module keeps ${name} private (not exported)`)
}
const movedConsts = ['READING_SURFACE_QUESTION_TYPES', 'READING_SURFACE_CARD_OVERRIDES', 'READING_T_CARD_SCORE_FLOORS', 'READING_FINAL_LABELS']
for (const name of movedConsts) {
  verifier.assert(!new RegExp(`const ${name} `).test(apiSource), `api.mjs no longer defines ${name}`)
  verifier.assert(new RegExp(`const ${name} `).test(moduleSource), `module defines ${name}`)
}
// the 3 public normalizers: module is sole definer, exported only via factory return (not export function)
const publicNormalizers = ['normalizeReadingSurfaceQuestion', 'normalizeReadingSynonymDifficulty', 'normalizeReadingDifficultyProfile']
for (const name of publicNormalizers) {
  verifier.assert(!new RegExp(`function ${name}\\(`).test(apiSource), `api.mjs no longer defines ${name}`)
  verifier.assert(new RegExp(`function ${name}\\(`).test(moduleSource), `module defines ${name}`)
  verifier.assert(apiSource.includes(name), `api.mjs still references ${name} (destructured from factory)`)
}
// exactly two export functions (factory + the shared predicate); the 3 normalizers ship via the
// factory return value, NOT as standalone exports (no 14-predicate pass-through churn)
verifier.assert((moduleSource.match(/^export function /gm) || []).length === 2, 'module has exactly 2 export functions (factory + isEntityPurposeMentionStem)')
verifier.assert(/^export function isEntityPurposeMentionStem\(/m.test(moduleSource), 'isEntityPurposeMentionStem is exported')
verifier.assert(/export function createReadingDifficultyNormalizer\(/.test(moduleSource), 'factory createReadingDifficultyNormalizer exported')
// api.mjs wires the factory + re-imports the shared predicate
verifier.assert(apiSource.includes("from './reading-analysis/readingDifficultyNormalizer.mjs'"), 'api.mjs imports the extracted module')
verifier.assert(apiSource.includes('createReadingDifficultyNormalizer({'), 'api.mjs calls the factory')
// api.mjs re-imports the shared predicate and still uses it. (Since H5-K, its sole call site —
// hasMentionIntentSignal — moved into ai-parse/synonymDifficultyService.mjs, so api.mjs no longer
// CALLS it directly; it imports the binding and injects it into the H5-K factory. Assert the
// import + injection rather than a direct `(`-call.)
verifier.assert(/import \{[^}]*\bisEntityPurposeMentionStem\b[^}]*\} from '\.\/reading-analysis\/readingDifficultyNormalizer\.mjs'/.test(apiSource), 'api.mjs re-imports isEntityPurposeMentionStem')
verifier.assert(/createSynonymDifficultyImplementation\(\{[\s\S]*?\bisEntityPurposeMentionStem\b[\s\S]*?\}\)/.test(apiSource), 'api.mjs injects isEntityPurposeMentionStem into the H5-K synonym-difficulty factory')
// no cycle: module never imports api.mjs
verifier.assert(!/from ['"][^'"]*\/api\.mjs['"]/.test(moduleSource) && !/from ['"]\.\.\/api\.mjs['"]/.test(moduleSource), 'module does not import from api.mjs')
// objectValue retained in api.mjs (shared with non-reading callers)
verifier.assert(/function objectValue\(/.test(apiSource), 'objectValue retained in api.mjs (shared)')

verifier.summary()
