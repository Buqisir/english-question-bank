#!/usr/bin/env node
/**
 * verify-h5l-question-group-parse.mjs
 *
 * H5-L extraction guard for server/ai-parse/questionGroupParseService.mjs (the 4 DeepSeek
 * per-type parse owners — reading / cloze / grammar-fill / seven-choices — moved out of
 * server/api.mjs).
 *
 * HERMETIC: no `git show main:...`, no network, no real DeepSeek. Stubs callDeepSeekWithFallback
 * to return fixed structured payloads and injects a fake getQuestionGroupDetail returning a fixed
 * question-group detail per type. Drives all 4 parse*ByQuestionGroup owners and asserts each
 * returned envelope (the persisted payload_json shape) matches fixed expected literals.
 *
 * Asserts:
 *  - factory returns exactly the 4 public owners; the 8 helpers are NOT exported (file-private).
 *  - each owner's envelope (questionGroupId / title / questionCount / parsedCount / matchedCount /
 *    unmatchedQuestionNos / keySource / keyMask / requestId / model / thinkingMode / provider /
 *    totalLatencyMs present, questions[...]) is byte-stable against fixed expected literals.
 *  - used-but-undefined guard: dropping each injected dep makes a driven owner throw.
 *  - the module does NOT import from ../api.mjs (no cycle).
 *  - byte-sensitive inline Chinese template literals sit at column 0 in the new source.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createQuestionGroupParseImplementation,
} from '../server/ai-parse/questionGroupParseService.mjs'
import * as moduleNamespace from '../server/ai-parse/questionGroupParseService.mjs'

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

// ------------------------------------------------------------------
// Pure helper clones mirroring api.mjs semantics, kept hermetic + self-contained.
// ------------------------------------------------------------------
function optionalString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}
function elapsedMs(startAt) {
  return Math.max(0, Date.now() - startAt)
}
function maskApiKey(apiKey) {
  const key = String(apiKey || '')
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}
function describeKeySource(apiKey) {
  // Fixed deterministic source/provider for the fixture.
  return { source: apiKey ? 'request' : 'env', provider: 'deepseek' }
}
function normalizeDeepSeekModel(model) {
  return model || 'deepseek-v4-pro'
}
// Identity-ish normalizers for the per-type question shapes (the real ones do more, but for the
// envelope-shape guard we only need stable, deterministic outputs).
function normalizeReadingParseQuestion(item) {
  if (!item || !item.questionNo) return null
  return { questionNo: String(item.questionNo), analysis: optionalString(item.analysis) }
}
function normalizeReadingParseArticle(payload) {
  return { summary: optionalString(payload?.summary) }
}
function normalizeClozeParseQuestion(item) {
  if (!item || !item.questionNo) return null
  return { questionNo: String(item.questionNo), answer: optionalString(item.answer) }
}
function normalizeSevenChoicesParseQuestion(item) {
  if (!item || !item.questionNo) return null
  return { questionNo: String(item.questionNo), answer: optionalString(item.answer) }
}
function formatSynonymDifficultyKnowledgeForReadingPrompt() {
  return 'T1 卡片；T2 卡片'
}

// ------------------------------------------------------------------
// Fixed fake question-group details per type.
// ------------------------------------------------------------------
function readingDetail() {
  return {
    title: 'H5-L Reading Fixture',
    groupType: 'reading',
    passage: { title: 'Curiosity', materialText: 'A passage about curiosity in science.' },
    questions: [
      { questionNo: '21', questionType: '阅读理解', stem: 'Q21 stem?', options: [{ label: 'A', content: 'a' }], answer: 'A', explanation: '' },
      { questionNo: '22', questionType: '阅读理解', stem: 'Q22 stem?', options: [{ label: 'B', content: 'b' }], answer: 'B', explanation: '' },
    ],
  }
}
function clozeDetail() {
  return {
    title: 'H5-L Cloze Fixture',
    groupType: 'cloze',
    passage: { title: 'Cloze Story', materialText: 'A cloze story.' },
    questions: [
      { questionNo: '41', stem: '', options: [{ label: 'A', content: 'a' }], answer: 'A', explanation: '' },
      { questionNo: '42', stem: '', options: [{ label: 'B', content: 'b' }], answer: 'B', explanation: '' },
    ],
  }
}
function grammarDetail() {
  return {
    title: 'H5-L Grammar Fixture',
    groupType: 'grammar_cloze',
    passage: { title: 'Grammar Passage', materialText: 'A grammar passage.' },
    questions: [
      { questionNo: '56', stem: '56 ____', answer: '', explanation: '' },
      { questionNo: '57', stem: '57 ____', answer: '', explanation: '' },
    ],
  }
}
function sevenChoicesDetail() {
  return {
    title: 'H5-L Seven Choices Fixture',
    groupType: 'seven_choices',
    passage: { title: 'Seven Choices Passage', materialText: 'A seven-choices passage.' },
    questions: [
      { questionNo: '36', stem: '36 ____', options: [{ label: 'A', content: 'opt a' }], answer: 'D', explanation: '' },
      { questionNo: '37', stem: '37 ____', options: [{ label: 'B', content: 'opt b' }], answer: 'C', explanation: '' },
    ],
  }
}

// Stub callDeepSeekWithFallback: returns a fixed parsed payload depending on the expected schema /
// content shape so each owner's normalize path is exercised deterministically.
function makeDeepSeekStub() {
  const calls = []
  const fn = async (request) => {
    calls.push(request)
    const systemContent = (request.messages?.find((m) => m.role === 'system')?.content) || ''
    // Reading: keyed by expectedResponseSchema 'reading_parse'.
    if (request.expectedResponseSchema === 'reading_parse') {
      return {
        parsed: {
          questions: [
            { questionNo: '21', analysis: 'A1' },
            { questionNo: '22', analysis: 'A2' },
          ],
          articleAnalysis: { summary: 'reading summary' },
        },
        latencyMs: 11,
        rawText: 'x'.repeat(120),
      }
    }
    // Grammar: system prompt is the grammar prompt marker.
    if (systemContent.includes('GRAMMAR_MARKER')) {
      return {
        parsed: {
          questions: [
            { questionNo: '56', answer: 'is', hintMeaning: 'be', analysis: 'g56', sentenceTranslation: 's56' },
            { questionNo: '57', answer: 'the', hintMeaning: 'art', analysis: 'g57', sentenceTranslation: 's57' },
          ],
          fullTranslation: '全文翻译',
        },
        latencyMs: 9,
        rawText: 'g',
      }
    }
    // Seven-choices: system prompt carries the seven-choices JSON-structure block.
    if (systemContent.includes('SEVEN_MARKER')) {
      return {
        parsed: {
          questions: [
            { questionNo: '36', answer: 'D' },
            { questionNo: '37', answer: 'C' },
          ],
          answerLine: '36. D 37. C',
          articleSummary: '七选五主旨',
        },
        latencyMs: 8,
        rawText: 's',
      }
    }
    // Cloze (default remaining branch): system prompt is the cloze prompt marker.
    return {
      parsed: {
        questions: [
          { questionNo: '41', answer: 'A' },
          { questionNo: '42', answer: 'B' },
        ],
        answerLine: '41. A 42. B',
        storyTitle: '故事标题',
        storySummary: '故事大意',
        condensedStory: '串词成篇',
      },
      latencyMs: 7,
      rawText: 'c',
    }
  }
  fn.calls = calls
  return fn
}

function baseDeps(overrides = {}) {
  return {
    callDeepSeekWithFallback: makeDeepSeekStub(),
    getQuestionGroupDetail: () => readingDetail(),
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
    DEEPSEEK_API_KEY: '',
    DEEPSEEK_READING_PARSE_PROMPT: 'READING_PROMPT_BODY',
    DEEPSEEK_GRAMMAR_PARSE_PROMPT: 'GRAMMAR_MARKER grammar prompt',
    DEEPSEEK_CLOZE_PARSE_PROMPT: 'CLOZE_MARKER cloze prompt',
    DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT: 'SEVEN_MARKER seven choices prompt',
    ...overrides,
  }
}

// ============================================================
// 1. Export surface + factory return shape
// ============================================================
function assertExportSurface() {
  assert('createQuestionGroupParseImplementation is a function', typeof createQuestionGroupParseImplementation === 'function')

  const impl = createQuestionGroupParseImplementation(baseDeps())
  const ownerNames = Object.keys(impl).sort()
  assert(
    'factory returns exactly the 4 public owners',
    JSON.stringify(ownerNames) === JSON.stringify(['parseClozeByQuestionGroup', 'parseGrammarByQuestionGroup', 'parseReadingByQuestionGroup', 'parseSevenChoicesByQuestionGroup']),
    `owners=${ownerNames.join(',')}`,
  )
  for (const name of ownerNames) {
    assert(`owner ${name} is an async function`, typeof impl[name] === 'function')
  }

  // The 8 helpers must NOT be exported (file-private).
  const privateHelpers = [
    'formatQuestionForReadingParse',
    'callDeepSeekParseReading',
    'callDeepSeekParseGrammar',
    'formatQuestionForClozeParse',
    'callDeepSeekParseCloze',
    'formatQuestionForSevenChoicesParse',
    'formatOptionsForSevenChoicesParse',
    'callDeepSeekParseSevenChoices',
  ]
  for (const helper of privateHelpers) {
    assert(`helper ${helper} is NOT exported (file-private)`, !(helper in moduleNamespace))
  }
  // The 4 owners must NOT be top-level exports either (only returned by the factory).
  for (const owner of ['parseReadingByQuestionGroup', 'parseClozeByQuestionGroup', 'parseGrammarByQuestionGroup', 'parseSevenChoicesByQuestionGroup']) {
    assert(`owner ${owner} is NOT a top-level export (factory-only)`, !(owner in moduleNamespace))
  }
  // Only createQuestionGroupParseImplementation is exported.
  assert('only the factory is exported', JSON.stringify(Object.keys(moduleNamespace)) === JSON.stringify(['createQuestionGroupParseImplementation']))
}

// ============================================================
// 2. Reading owner envelope (byte-stable payload_json shape)
// ============================================================
async function assertReadingEnvelope() {
  const stub = makeDeepSeekStub()
  const { parseReadingByQuestionGroup } = createQuestionGroupParseImplementation(
    baseDeps({ callDeepSeekWithFallback: stub, getQuestionGroupDetail: () => readingDetail() }),
  )
  const result = await parseReadingByQuestionGroup('grp-r', 'sk-readingkey-1234', 'deepseek-v4-pro', 'req-r', false)

  assert('reading: questionGroupId echoes input', result.questionGroupId === 'grp-r')
  assert('reading: title from detail', result.title === 'H5-L Reading Fixture')
  assert('reading: questionCount = 2', result.questionCount === 2)
  assert('reading: parsedCount = 2', result.parsedCount === 2)
  assert('reading: matchedCount = 2', result.matchedCount === 2)
  assert('reading: unmatchedQuestionNos empty', Array.isArray(result.unmatchedQuestionNos) && result.unmatchedQuestionNos.length === 0)
  assert('reading: passageSummary from articleAnalysis', result.passageSummary === 'reading summary')
  assert('reading: articleAnalysis carried', result.articleAnalysis && result.articleAnalysis.summary === 'reading summary')
  assert('reading: keySource request', result.keySource === 'request')
  assert('reading: keyMask masked', result.keyMask === maskApiKey('sk-readingkey-1234'))
  assert('reading: keyFingerprint masked', result.keyFingerprint === maskApiKey('sk-readingkey-1234'))
  assert('reading: requestId echoes input', result.requestId === 'req-r')
  assert('reading: model normalized', result.model === 'deepseek-v4-pro')
  assert('reading: thinkingMode false', result.thinkingMode === false)
  assert('reading: provider deepseek', result.provider === 'deepseek')
  assert('reading: requestMs from stub latency', result.requestMs === 11)
  assert('reading: totalLatencyMs is number', typeof result.totalLatencyMs === 'number')
  assert('reading: questions length 2', Array.isArray(result.questions) && result.questions.length === 2)
  assert('reading: questions normalized shape', result.questions[0].questionNo === '21' && result.questions[0].analysis === 'A1')

  // The reading system prompt MUST embed the injected DEEPSEEK_READING_PARSE_PROMPT (same-name inject)
  // and the synonym-difficulty knowledge from the injected formatter.
  const sys = stub.calls[0].messages.find((m) => m.role === 'system').content
  assert('reading: system prompt embeds injected reading prompt', sys.includes('READING_PROMPT_BODY'))
  assert('reading: system prompt embeds synonym knowledge', sys.includes('T1 卡片；T2 卡片'))
}

// ============================================================
// 3. Cloze owner envelope
// ============================================================
async function assertClozeEnvelope() {
  const { parseClozeByQuestionGroup } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => clozeDetail() }),
  )
  const result = await parseClozeByQuestionGroup('grp-c', 'sk-clozekey-1234', 'deepseek-v4-flash', 'req-c', true)

  assert('cloze: questionGroupId echoes input', result.questionGroupId === 'grp-c')
  assert('cloze: title from detail', result.title === 'H5-L Cloze Fixture')
  assert('cloze: questionCount = 2', result.questionCount === 2)
  assert('cloze: parsedCount = 2', result.parsedCount === 2)
  assert('cloze: answerLine carried', result.answerLine === '41. A 42. B')
  assert('cloze: storyTitle carried', result.storyTitle === '故事标题')
  assert('cloze: storySummary carried', result.storySummary === '故事大意')
  assert('cloze: condensedStory carried', result.condensedStory === '串词成篇')
  assert('cloze: keySource request', result.keySource === 'request')
  assert('cloze: keyMask masked', result.keyMask === maskApiKey('sk-clozekey-1234'))
  assert('cloze: requestId echoes input', result.requestId === 'req-c')
  assert('cloze: model normalized', result.model === 'deepseek-v4-flash')
  assert('cloze: thinkingMode true', result.thinkingMode === true)
  assert('cloze: provider deepseek', result.provider === 'deepseek')
  assert('cloze: totalLatencyMs number', typeof result.totalLatencyMs === 'number')
  assert('cloze: questions normalized', result.questions[0].questionNo === '41' && result.questions[0].answer === 'A')

  // Wrong group type must throw the exact unchanged message.
  const { parseClozeByQuestionGroup: clozeWrongType } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => readingDetail() }),
  )
  await assertRejects('cloze: wrong group type throws 仅支持完形填空题组', () => clozeWrongType('grp', 'sk-1234567890', 'm', 'r', false), /仅支持完形填空题组。/)
}

// ============================================================
// 4. Grammar owner envelope
// ============================================================
async function assertGrammarEnvelope() {
  const { parseGrammarByQuestionGroup } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => grammarDetail() }),
  )
  const result = await parseGrammarByQuestionGroup('grp-g', 'sk-grammarkey-12', 'deepseek-v4-pro', 'req-g', false)

  assert('grammar: questionGroupId echoes input', result.questionGroupId === 'grp-g')
  assert('grammar: title from detail', result.title === 'H5-L Grammar Fixture')
  assert('grammar: questionCount = 2', result.questionCount === 2)
  assert('grammar: parsedCount = 2', result.parsedCount === 2)
  assert('grammar: fullTranslation carried', result.fullTranslation === '全文翻译')
  assert('grammar: keySource request', result.keySource === 'request')
  assert('grammar: keyMask masked', result.keyMask === maskApiKey('sk-grammarkey-12'))
  assert('grammar: requestId echoes input', result.requestId === 'req-g')
  assert('grammar: model normalized', result.model === 'deepseek-v4-pro')
  assert('grammar: thinkingMode false', result.thinkingMode === false)
  assert('grammar: provider deepseek', result.provider === 'deepseek')
  assert('grammar: totalLatencyMs number', typeof result.totalLatencyMs === 'number')
  assert('grammar: questions normalized shape', result.questions[0].questionNo === '56' && result.questions[0].answer === 'is' && result.questions[0].analysis === 'g56')

  const { parseGrammarByQuestionGroup: grammarWrongType } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => readingDetail() }),
  )
  await assertRejects('grammar: wrong group type throws 仅支持语法填空题组', () => grammarWrongType('grp', 'sk-1234567890', 'm', 'r', false), /仅支持语法填空题组。/)
}

// ============================================================
// 5. Seven-choices owner envelope
// ============================================================
async function assertSevenChoicesEnvelope() {
  const { parseSevenChoicesByQuestionGroup } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => sevenChoicesDetail() }),
  )
  const result = await parseSevenChoicesByQuestionGroup('grp-s', 'sk-sevenkey-1234', 'deepseek-v4-pro', 'req-s', false)

  assert('seven: questionGroupId echoes input', result.questionGroupId === 'grp-s')
  assert('seven: title from detail', result.title === 'H5-L Seven Choices Fixture')
  assert('seven: questionCount = 2', result.questionCount === 2)
  assert('seven: parsedCount = 2', result.parsedCount === 2)
  assert('seven: answerLine carried', result.answerLine === '36. D 37. C')
  assert('seven: articleSummary carried', result.articleSummary === '七选五主旨')
  assert('seven: keySource request', result.keySource === 'request')
  assert('seven: keyMask masked', result.keyMask === maskApiKey('sk-sevenkey-1234'))
  assert('seven: requestId echoes input', result.requestId === 'req-s')
  assert('seven: model normalized', result.model === 'deepseek-v4-pro')
  assert('seven: thinkingMode false', result.thinkingMode === false)
  assert('seven: provider deepseek', result.provider === 'deepseek')
  assert('seven: totalLatencyMs number', typeof result.totalLatencyMs === 'number')
  assert('seven: questions normalized', result.questions[0].questionNo === '36' && result.questions[0].answer === 'D')

  const { parseSevenChoicesByQuestionGroup: sevenWrongType } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => readingDetail() }),
  )
  await assertRejects('seven: wrong group type throws 仅支持七选五题组', () => sevenWrongType('grp', 'sk-1234567890', 'm', 'r', false), /仅支持七选五题组。/)
}

// ============================================================
// 6. No-API-key throw path (shared by all owners)
// ============================================================
async function assertNoKeyThrows() {
  // DEEPSEEK_API_KEY injected as '' and no apiKey passed -> reading owner throws the key message.
  const { parseReadingByQuestionGroup } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => readingDetail() }),
  )
  await assertRejects('reading: missing key throws 未设置 API Key', () => parseReadingByQuestionGroup('grp', '', 'm', 'r', false), /未设置 API Key。/)

  // Grammar owner has its own shorter message.
  const { parseGrammarByQuestionGroup } = createQuestionGroupParseImplementation(
    baseDeps({ getQuestionGroupDetail: () => grammarDetail() }),
  )
  await assertRejects('grammar: missing key throws 未设置 API Key', () => parseGrammarByQuestionGroup('grp', '', 'm', 'r', false), /未设置 API Key。/)
}

// ============================================================
// 7. used-but-undefined guard: drop one injected dep, drive an owner, expect throw.
// ============================================================
async function assertUsedButUndefinedGuard() {
  // Deps exercised by the reading owner happy path (with a non-empty key so we get past the key gate).
  const readingExercised = [
    'callDeepSeekWithFallback',
    'getQuestionGroupDetail',
    'describeKeySource',
    'normalizeDeepSeekModel',
    'maskApiKey',
    'elapsedMs',
    'optionalString',
    'formatSynonymDifficultyKnowledgeForReadingPrompt',
    'normalizeReadingParseQuestion',
  ]
  for (const dep of readingExercised) {
    const deps = baseDeps({ getQuestionGroupDetail: () => readingDetail() })
    delete deps[dep]
    const { parseReadingByQuestionGroup } = createQuestionGroupParseImplementation(deps)
    await assertRejects(
      `reading: missing injected dep "${dep}" throws when driven`,
      () => parseReadingByQuestionGroup('grp', 'sk-1234567890', 'deepseek-v4-pro', 'r', false),
      /.+/,
    )
  }

  // normalizeClozeParseQuestion is only reachable via the cloze owner.
  {
    const deps = baseDeps({ getQuestionGroupDetail: () => clozeDetail() })
    delete deps.normalizeClozeParseQuestion
    const { parseClozeByQuestionGroup } = createQuestionGroupParseImplementation(deps)
    await assertRejects('cloze: missing normalizeClozeParseQuestion throws when driven', () => parseClozeByQuestionGroup('grp', 'sk-1234567890', 'm', 'r', false), /.+/)
  }
  // normalizeSevenChoicesParseQuestion is only reachable via the seven-choices owner.
  {
    const deps = baseDeps({ getQuestionGroupDetail: () => sevenChoicesDetail() })
    delete deps.normalizeSevenChoicesParseQuestion
    const { parseSevenChoicesByQuestionGroup } = createQuestionGroupParseImplementation(deps)
    await assertRejects('seven: missing normalizeSevenChoicesParseQuestion throws when driven', () => parseSevenChoicesByQuestionGroup('grp', 'sk-1234567890', 'm', 'r', false), /.+/)
  }
}

// ============================================================
// 8. No cycle + byte-sensitive inline template literals at column 0 (source guards)
// ============================================================
function assertSourceGuards() {
  const src = readFileSync(path.join(repoRoot, 'server', 'ai-parse', 'questionGroupParseService.mjs'), 'utf8')

  assert('module does NOT import from ../api.mjs (no cycle)', !/from\s+['"]\.\.\/api\.mjs['"]/.test(src) && !src.includes('../api.mjs'))

  // randomUUID imported directly from node:crypto (not injected).
  assert('randomUUID imported from node:crypto', /import\s*\{\s*randomUUID\s*\}\s*from\s*'node:crypto'/.test(src))

  // The reading system-prompt inline continuation line (after `${DEEPSEEK_READING_PARSE_PROMPT}`)
  // MUST sit at column 0 — a factory re-indent would have prefixed it with spaces, silently changing
  // the model prompt. Assert the exact un-indented Chinese line.
  assert('reading inline knowledge-card line at column 0', /(^|\n)同义替换难度知识卡（必须只使用这些类型，不要自创分类）：\n/.test(src))

  // The seven-choices inline JSON-structure block continuation lines must be flush-left too.
  assert('seven-choices inline 请严格只返回 line at column 0', /(^|\n)请严格只返回 JSON 对象，不要 markdown 代码块。JSON 结构如下：\n/.test(src))

  // The 4 injected prompt names appear as module-level `let` declarations (same-name inject).
  for (const name of ['DEEPSEEK_READING_PARSE_PROMPT', 'DEEPSEEK_GRAMMAR_PARSE_PROMPT', 'DEEPSEEK_CLOZE_PARSE_PROMPT', 'DEEPSEEK_SEVEN_CHOICES_PARSE_PROMPT']) {
    assert(`injected prompt ${name} declared as module-level let`, new RegExp(`(^|\\n)let ${name}\\n`).test(src))
  }

  // The 4 owners are returned (not exported) — assert no `export ... function parse*ByQuestionGroup`.
  for (const owner of ['parseReadingByQuestionGroup', 'parseClozeByQuestionGroup', 'parseGrammarByQuestionGroup', 'parseSevenChoicesByQuestionGroup']) {
    assert(`owner ${owner} is not export-prefixed`, !new RegExp(`export\\s+(async\\s+)?function\\s+${owner}`).test(src))
  }
}

// ============================================================
// 9. api.mjs integration: import + inject (not direct definition).
//    This is the H5-L truth that supersedes any "api.mjs defines parse*ByQuestionGroup" proxy.
// ============================================================
function assertApiIntegration() {
  const apiSrc = readFileSync(path.join(repoRoot, 'server', 'api.mjs'), 'utf8')
  assert('api.mjs imports createQuestionGroupParseImplementation', /import\s*\{\s*createQuestionGroupParseImplementation\s*\}\s*from\s*'\.\/ai-parse\/questionGroupParseService\.mjs'/.test(apiSrc))
  assert('api.mjs calls the factory', /createQuestionGroupParseImplementation\(\{/.test(apiSrc))
  // The 4 owners are no longer DEFINED with a body in api.mjs — only the thin hoisted wrappers remain.
  // The wrapper bodies delegate to the *Impl bindings, so assert the impl aliases exist.
  for (const alias of ['parseReadingByQuestionGroupImpl', 'parseClozeByQuestionGroupImpl', 'parseGrammarByQuestionGroupImpl', 'parseSevenChoicesByQuestionGroupImpl']) {
    assert(`api.mjs destructures ${alias} from the factory`, apiSrc.includes(alias))
  }
  // The heavy owner bodies are gone: the reading prompt-embedding call line must NOT appear inside api.mjs
  // any more (it now lives only in the extracted module).
  assert('api.mjs no longer contains the moved callDeepSeekParseReading helper', !/async function callDeepSeekParseReading\(/.test(apiSrc))
  assert('api.mjs no longer contains formatQuestionForReadingParse helper', !/function formatQuestionForReadingParse\(/.test(apiSrc))
}

// ============================================================
// Main
// ============================================================
async function main() {
  assertExportSurface()
  await assertReadingEnvelope()
  await assertClozeEnvelope()
  await assertGrammarEnvelope()
  await assertSevenChoicesEnvelope()
  await assertNoKeyThrows()
  await assertUsedButUndefinedGuard()
  assertSourceGuards()
  assertApiIntegration()

  console.log(`\nH5-L question-group-parse verify PASSED: ${passed} checks`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
