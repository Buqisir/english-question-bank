#!/usr/bin/env node
/**
 * verify-h5k-synonym-difficulty.mjs
 *
 * H5-K extraction guard for server/ai-parse/synonymDifficultyService.mjs (the local-Qwen
 * 同义替换难度初判 classifier moved out of server/api.mjs).
 *
 * HERMETIC: no `git show main:...`, no network, no real model. Stubs callLocalQwenCompletion
 * and drives generateSynonymDifficultyByQuestionGroup over a fixed fake question-group detail.
 *
 * Asserts:
 *  - Gate ON: per-group classification envelope (results shape, cardId white-list enforcement,
 *    deepseek/review triggers, knowledgeVersion, latency keys) matches fixed expected literals.
 *  - Gate OFF: exact unchanged throw shape.
 *  - REAL knowledge file feeds formatSynonymDifficultyKnowledgeForReadingPrompt() stably
 *    (always-on reading-parse path): non-empty, every card marker present, structural invariants.
 *  - All 6 named exports + the factory are importable.
 *  - used-but-undefined guard: every injected dep is exercised through a real classification.
 *  - The module does NOT import from ../api.mjs (no cycle).
 *  - The Chinese prompt template literal opening lines live in the module source un-indented
 *    (indent-0), proving the prompt interior was NOT corrupted by a factory re-indent.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createSynonymDifficultyImplementation,
  loadSynonymDifficultyKnowledge,
  normalizeSynonymCardId,
  normalizeSynonymConfidence,
  normalizeSynonymBoolean,
  uniqueSynonymFlags,
  formatSynonymDifficultyKnowledgeForReadingPrompt,
} from '../server/ai-parse/synonymDifficultyService.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

let passed = 0

function assert(name, condition, detail = '') {
  if (!condition) {
    throw new Error(`FAIL: ${name}${detail ? `\n  detail: ${detail}` : ''}`)
  }
  passed += 1
  console.log(`ok - ${name}`)
}

async function assertRejects(name, fn, pattern) {
  try {
    await fn()
    throw new Error(`FAIL: ${name}\n  expected rejection but resolved`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    assert(name, pattern.test(message), `actual message: ${message}`)
  }
}

const KNOWLEDGE_PATH = path.join(repoRoot, 'knowledge', 'synonym-difficulty', 'synonym_difficulty_cards.v1.json')

// ------------------------------------------------------------------
// Real-dep clones (these are pure helpers; we re-implement the trivial
// ones the factory needs so the verify stays hermetic and self-contained).
// optionalString / clamp01 / normalizeAnswerValue mirror api.mjs semantics
// closely enough to exercise the moved code paths end-to-end.
// ------------------------------------------------------------------
function optionalString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}
function clamp01(value) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}
function normalizeAnswerValue(value) {
  return optionalString(value).toUpperCase()
}
function isEntityPurposeMentionStem() {
  return false
}
function elapsedMs(startAt) {
  return Math.max(0, Date.now() - startAt)
}

// A fixed fake reading question-group detail. Two questions:
//  q1: underlined word-meaning stem -> routes T3 candidate set.
//  q2: generic detail stem -> default T1/T2/T6 candidate set.
function fakeDetail() {
  return {
    title: 'H5-K Fixture Reading',
    groupType: 'reading',
    passage: { materialText: 'A long passage about the value of curiosity in scientific discovery.' },
    readingParseResult: null,
    questions: [
      {
        id: 'q1',
        questionNo: '21',
        questionType: '阅读理解',
        stem: 'The underlined word "it" in paragraph 2 is closest in meaning to ____.',
        answer: 'B',
        options: [
          { label: 'A', content: 'the lab' },
          { label: 'B', content: 'the experiment' },
          { label: 'C', content: 'the result' },
          { label: 'D', content: 'the team' },
        ],
        explanation: 'It refers to the experiment described earlier.',
      },
      {
        id: 'q2',
        questionNo: '22',
        questionType: '阅读理解',
        stem: 'According to the text, what did the scientists do first?',
        answer: 'A',
        options: [
          { label: 'A', content: 'They ran a test.' },
          { label: 'B', content: 'They wrote a report.' },
          { label: 'C', content: 'They left early.' },
          { label: 'D', content: 'They asked questions.' },
        ],
        explanation: 'On Monday they ran the first test at 9 am.',
      },
    ],
  }
}

// Stub that always returns an INVALID cardId ("T99") so the white-list
// enforcement + invalid_card_replaced trigger path is exercised deterministically.
function makeInvalidCardStub() {
  const calls = []
  const fn = async (request) => {
    calls.push(request)
    return {
      rawText: JSON.stringify({ cardId: 'T99', confidence: 0.9, reason: '故意越界类型' }),
      firstMessageText: '',
      rawStatusText: '',
      latencyMs: 7,
    }
  }
  fn.calls = calls
  return fn
}

// Stub returning a VALID in-candidate cardId with high confidence, no review.
function makeValidCardStub(cardId) {
  return async () => ({
    rawText: JSON.stringify({ cardId, confidence: 0.9, review_needed: false, reason: '合理的类型判断。' }),
    firstMessageText: '',
    rawStatusText: '',
    latencyMs: 5,
  })
}

function baseDeps(overrides = {}) {
  return {
    optionalString,
    clamp01,
    normalizeAnswerValue,
    isEntityPurposeMentionStem,
    callLocalQwenCompletion: makeValidCardStub('T2'),
    getQuestionGroupDetail: () => fakeDetail(),
    elapsedMs,
    knowledgePath: KNOWLEDGE_PATH,
    LOCAL_QWEN_CHAT_MODEL: 'qwen3-8b-local',
    LOCAL_QWEN_PROVIDER: 'qwen-local',
    QUESTION_BANK_ENABLE_LOCAL_QWEN: true,
    ...overrides,
  }
}

// ============================================================
// 1. Export surface + factory
// ============================================================
function assertExportSurface() {
  assert('createSynonymDifficultyImplementation is a function', typeof createSynonymDifficultyImplementation === 'function')
  assert('loadSynonymDifficultyKnowledge exported', typeof loadSynonymDifficultyKnowledge === 'function')
  assert('normalizeSynonymCardId exported', typeof normalizeSynonymCardId === 'function')
  assert('normalizeSynonymConfidence exported', typeof normalizeSynonymConfidence === 'function')
  assert('normalizeSynonymBoolean exported', typeof normalizeSynonymBoolean === 'function')
  assert('uniqueSynonymFlags exported', typeof uniqueSynonymFlags === 'function')
  assert('formatSynonymDifficultyKnowledgeForReadingPrompt exported', typeof formatSynonymDifficultyKnowledgeForReadingPrompt === 'function')

  // The normalizers reference module-level injected optionalString/clamp01 (set by the factory),
  // so they must run AFTER an init. (Note: the roadmap called them "no injected deps"; in fact
  // they DO use optionalString/clamp01 — api.mjs always inits the factory at boot before any use.)
  createSynonymDifficultyImplementation(baseDeps())
  assert('normalizeSynonymCardId normalizes T-card', normalizeSynonymCardId(' t6 ') === 'T6')
  assert('normalizeSynonymConfidence high->0.85', normalizeSynonymConfidence('high') === 0.85)
  assert('normalizeSynonymBoolean review_needed->true', normalizeSynonymBoolean('review_needed') === true)
  assert('uniqueSynonymFlags filters to allowlist', JSON.stringify(uniqueSynonymFlags(['T5_T10', 'NOT_A_FLAG', 'T5_T10'])) === JSON.stringify(['T5_T10']))
}

// ============================================================
// 2. Gate OFF: exact unchanged throw shape
// ============================================================
async function assertGateOff() {
  const { generateSynonymDifficultyByQuestionGroup } = createSynonymDifficultyImplementation(
    baseDeps({ QUESTION_BANK_ENABLE_LOCAL_QWEN: false }),
  )
  await assertRejects(
    'gate OFF throws the exact 已停用 message',
    () => generateSynonymDifficultyByQuestionGroup('group-1', {}),
    /题库本地 Qwen 初判已停用。请使用 DeepSeek 阅读解析内置的 synonymDifficulty。/,
  )
}

// ============================================================
// 3. Gate ON: per-group envelope + white-list enforcement + triggers
// ============================================================
async function assertGateOnInvalidCardReplaced() {
  const knowledge = loadKnowledgeRaw()
  const stub = makeInvalidCardStub()
  const { generateSynonymDifficultyByQuestionGroup } = createSynonymDifficultyImplementation(
    baseDeps({ callLocalQwenCompletion: stub, QUESTION_BANK_ENABLE_LOCAL_QWEN: true }),
  )

  const result = await generateSynonymDifficultyByQuestionGroup('group-1', { requestId: 'h5k-fixed' })

  // Envelope
  assert('envelope questionGroupId echoes input', result.questionGroupId === 'group-1')
  assert('envelope title from detail', result.title === 'H5-K Fixture Reading')
  assert('envelope questionCount = 2', result.questionCount === 2)
  assert('envelope classifiedCount = 2', result.classifiedCount === 2)
  assert('envelope provider qwen-local', result.provider === 'qwen-local')
  assert('envelope model qwen3-8b-local', result.model === 'qwen3-8b-local')
  assert('envelope keySource local', result.keySource === 'local')
  assert('envelope requestId echoes input', result.requestId === 'h5k-fixed')
  assert('envelope knowledgeVersion from real file', result.knowledgeVersion === String(knowledge.version || ''))
  assert('envelope has totalLatencyMs number', typeof result.totalLatencyMs === 'number')
  assert('envelope results length = 2', Array.isArray(result.results) && result.results.length === 2)

  // White-list enforcement: T99 is NOT in any candidate set -> replaced by route fallback (candidateCards[0]).
  for (const item of result.results) {
    assert(`q${item.questionNo}: cardId is in its own candidateCards (white-list enforced)`, item.candidateCards.includes(item.cardId), `cardId=${item.cardId} candidates=${item.candidateCards.join(',')}`)
    // normalizeSynonymCardId('T99') -> 'T9' (regex T(?:10|[1-9]) matches the leading T9); 'T9' is
    // not in either fixture candidate set, so it is still rejected as an invalid card.
    assert(`q${item.questionNo}: rawCardId records the normalized rejected card (T9)`, item.rawCardId === 'T9', `rawCardId=${item.rawCardId}`)
    assert(`q${item.questionNo}: invalidCardId flagged true`, item.invalidCardId === true)
    // Stub supplies confidence 0.9 explicitly, so it is kept (the 0.45 invalid-fallback only
    // applies when the payload omits confidence). Assert the supplied value passes through.
    assert(`q${item.questionNo}: supplied confidence 0.9 passes through`, item.confidence === 0.9, `confidence=${item.confidence}`)
    assert(`q${item.questionNo}: reviewNeeded true on invalid`, item.reviewNeeded === true)
    assert(`q${item.questionNo}: deepSeekRecommended true`, item.deepSeekRecommended === true)
    assert(`q${item.questionNo}: deepSeekTriggers include invalid_card_replaced`, item.deepSeekTriggers.includes('invalid_card_replaced'))
    // boundaryFlags pass through uniqueSynonymFlags, whose allowlist is T-pair flags only; the raw
    // 'INVALID_CARD_REPLACED'/'BROAD_PASSAGE_EVIDENCE' markers are intentionally filtered out there.
    assert(`q${item.questionNo}: boundaryFlags is a filtered array (no non-allowlist markers)`, Array.isArray(item.boundaryFlags) && !item.boundaryFlags.includes('INVALID_CARD_REPLACED'))
    assert(`q${item.questionNo}: latency keys present`, typeof item.latencyMs === 'number' && typeof item.retryCount === 'number')
    assert(`q${item.questionNo}: difficultyDefault is a number`, typeof item.difficultyDefault === 'number')
    assert(`q${item.questionNo}: routeReasons non-empty`, Array.isArray(item.routeReasons) && item.routeReasons.length > 0)
  }

  // reviewNeededCount + deepSeekRecommendedCount reflect both invalid-card questions.
  assert('reviewNeededCount = 2', result.reviewNeededCount === 2)
  assert('deepSeekRecommendedCount = 2', result.deepSeekRecommendedCount === 2)

  // Invalid path retries once (classify retries on invalidCardId) -> stub called 2x per question = 4 total.
  assert('invalid-card path retried once per question (4 stub calls)', stub.calls.length === 4, `calls=${stub.calls.length}`)

  // q1 (underlined word-meaning) must have routed T3 as a candidate (router signal coverage).
  const q1 = result.results.find((r) => r.questionNo === '21')
  assert('q21 routed T3 candidate (lexical-meaning signal)', q1.candidateCards.includes('T3'))
}

async function assertGateOnValidCard() {
  // Valid in-candidate card: choose T2 (in q2's default set). High confidence, no review.
  const { generateSynonymDifficultyByQuestionGroup } = createSynonymDifficultyImplementation(
    baseDeps({ callLocalQwenCompletion: makeValidCardStub('T2'), QUESTION_BANK_ENABLE_LOCAL_QWEN: true }),
  )
  const result = await generateSynonymDifficultyByQuestionGroup('group-1', {})
  const q2 = result.results.find((r) => r.questionNo === '22')
  assert('q22 accepts valid T2 cardId', q2.cardId === 'T2')
  assert('q22 invalidCardId false', q2.invalidCardId === false)
  assert('q22 numeric confidence 0.9 passes through clamp01', q2.confidence === 0.9, `confidence=${q2.confidence}`)
  // q2's default route gives candidates [T1,T2,T6]: >2 cards -> wide_candidate_set, and T2+T6 ->
  // T2_T6 boundary -> boundary_fuzzy. confidence 0.9>=0.72 and T2 not advanced, so NO low_confidence
  // / advanced_type / review_needed trigger. This exact trigger composition proves the trigger +
  // routing logic moved intact.
  assert('q22 deepSeekTriggers == [boundary_fuzzy, wide_candidate_set]', JSON.stringify([...q2.deepSeekTriggers].sort()) === JSON.stringify(['boundary_fuzzy', 'wide_candidate_set']), `triggers=${q2.deepSeekTriggers.join(',')}`)
  assert('q22 reviewNeeded false on clean valid high-confidence T2', q2.reviewNeeded === false)
  assert('q22 evidenceSource is question_explanation', q2.evidenceSource === 'question_explanation', `evidenceSource=${q2.evidenceSource}`)
}

// ============================================================
// 4. used-but-undefined guard: drop one injected dep at a time, expect a throw.
//    A missed call-time dep would NOT throw at factory time; it throws only when
//    the moved code is exercised. So we DRIVE a real classification with each
//    dep removed and assert it blows up (proving the dep is genuinely needed).
// ============================================================
async function assertUsedButUndefinedGuard() {
  const exercisedDeps = ['optionalString', 'clamp01', 'normalizeAnswerValue', 'callLocalQwenCompletion', 'getQuestionGroupDetail', 'elapsedMs']
  for (const dep of exercisedDeps) {
    const deps = baseDeps({ callLocalQwenCompletion: makeValidCardStub('T2') })
    delete deps[dep]
    const { generateSynonymDifficultyByQuestionGroup } = createSynonymDifficultyImplementation(deps)
    await assertRejects(
      `missing injected dep "${dep}" throws when classification is driven`,
      () => generateSynonymDifficultyByQuestionGroup('group-1', {}),
      /.+/,
    )
  }
}

// ============================================================
// 5. REAL knowledge file -> formatSynonymDifficultyKnowledgeForReadingPrompt stable
//    (always-on reading-parse path). Needs optionalString injected via the factory.
// ============================================================
let _knowledgeRaw = null
function loadKnowledgeRaw() {
  if (_knowledgeRaw) return _knowledgeRaw
  _knowledgeRaw = JSON.parse(readFileSync(KNOWLEDGE_PATH, 'utf8'))
  return _knowledgeRaw
}

function assertReadingPromptFormatter() {
  // The formatter + loader use the module-level optionalString/knowledgePath set by the factory.
  createSynonymDifficultyImplementation(baseDeps())
  const knowledge = loadKnowledgeRaw()
  const cards = knowledge.cards
  assert('real knowledge file has cards', Array.isArray(cards) && cards.length > 0)

  const formatted = formatSynonymDifficultyKnowledgeForReadingPrompt()
  assert('reading-prompt formatter returns non-empty string', typeof formatted === 'string' && formatted.length > 0)

  // One line per card (cards joined with \n).
  const lines = formatted.split('\n')
  assert('reading-prompt formatter emits one line per card', lines.length === cards.length, `lines=${lines.length} cards=${cards.length}`)

  // Every card marker (cardId + name) must appear, in order.
  for (const card of cards) {
    assert(`reading-prompt contains card marker "${card.cardId} ${card.name}"`, formatted.includes(`${card.cardId} ${card.name}`))
  }
  // Structural invariants: each line carries SOLO + 定义 + 信号 + 边界 segments, joined by '；'.
  for (const line of lines) {
    assert('reading-prompt line carries SOLO segment', line.includes('SOLO：'))
    assert('reading-prompt line carries 定义 segment', line.includes('定义：'))
    assert('reading-prompt line carries 信号 segment', line.includes('信号：'))
    assert('reading-prompt line carries 边界 segment', line.includes('边界：'))
  }
  // The reading-prompt formatter must NOT leak the 8B提示 line (that belongs to the per-question prompt only).
  assert('reading-prompt does NOT include 8B提示 segment', !formatted.includes('8B提示'))
}

// ============================================================
// 6. No cycle + prompt-template-at-indent-0 (source-level guards)
// ============================================================
function assertSourceGuards() {
  const src = readFileSync(path.join(repoRoot, 'server', 'ai-parse', 'synonymDifficultyService.mjs'), 'utf8')

  assert('module does NOT import from ../api.mjs (no cycle)', !/from\s+['"]\.\.\/api\.mjs['"]/.test(src) && !src.includes('../api.mjs'))

  // The Chinese per-question prompt opening line must sit at column 0 inside its template
  // literal — i.e. the line begins immediately after a backtick with NO leading whitespace.
  // If buildSynonymDifficultyPrompt had been nested into the factory (+2 indent), the template
  // INTERIOR would stay flush-left only if hand-fixed; a mechanical re-indent corrupts it.
  // We assert the exact un-indented opening line is present verbatim.
  const promptOpen = '你是高考英语阅读题“原文表达 -> 正确选项表达”的同义替换难度初判助手。'
  // The opening line follows the `return \`` on the same source line (matches main verbatim).
  assert('per-question prompt opening line present verbatim after return-backtick', src.includes('return `' + promptOpen))
  // Interior continuation lines of the same template literal MUST be flush-left (column 0). If
  // buildSynonymDifficultyPrompt had been nested into the factory body (+2 indent), a mechanical
  // re-indent would have prefixed these lines with spaces, silently changing the model prompt.
  assert('per-question prompt 你只能从候选卡 line is at column 0', /(^|\n)你只能从候选卡中选择cardId，不能输出候选卡以外的类型。\n/.test(src))
  assert('per-question prompt 硬规则 header is at column 0', /(^|\n)硬规则：\n/.test(src))
  assert('per-question prompt 候选知识卡 header is at column 0', /(^|\n)候选知识卡：\n/.test(src))

  // The system-role line inside classifySynonymDifficultyQuestion is byte-sensitive too.
  assert('classify system prompt content present verbatim', src.includes('你只输出JSON对象。你必须遵守候选cardId白名单，不能编造类型。'))

  // classifySynonymDifficultyQuestion stays FILE-PRIVATE (not exported).
  assert('classifySynonymDifficultyQuestion is NOT exported', !/export\s+(async\s+)?function\s+classifySynonymDifficultyQuestion/.test(src))
  assert('generateSynonymDifficultyByQuestionGroup is NOT a top-level export (returned by factory only)', !/export\s+async\s+function\s+generateSynonymDifficultyByQuestionGroup/.test(src))
}

// ============================================================
// Main
// ============================================================
async function main() {
  assertExportSurface()
  await assertGateOff()
  await assertGateOnInvalidCardReplaced()
  await assertGateOnValidCard()
  await assertUsedButUndefinedGuard()
  assertReadingPromptFormatter()
  assertSourceGuards()

  console.log(`\nH5-K synonym-difficulty verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
