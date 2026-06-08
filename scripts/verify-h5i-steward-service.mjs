#!/usr/bin/env node
// H5-I — question-bank steward service extraction (NL -> intent-plan -> filtered search).
// INVOCATION smoke: actually constructs createQuestionBankStewardImplementation with stubs
// (stub semanticSearchQuestionGroups + callDeepSeekWithFallback) and CALLS the steward entry
// point end-to-end — the only check that catches a missing call-time dependency (node --check +
// import-smoke do not). Asserts the full plan / filter / message envelope is byte-identical to
// the pre-cut behavior for fixed NL inputs (deterministic stubs), plus the extraction-seam,
// steward-prompt-not-over-indented, and used-but-undefined guards. Fully hermetic (no git show,
// no network, no real DB, no local-main dependency).
import { createQuestionBankStewardImplementation } from '../server/search/questionBankStewardService.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-I question-bank-steward')

// ── Stub deps (byte-faithful to the api.mjs helpers the steward relies on) ────────
const optionalString = (v) => {
  if (v === undefined || v === null) return ''
  if (typeof v === 'string') return v.trim()
  return String(v).trim()
}
const objectValue = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})
const normalizeSynonymCardId = (v) => {
  const s = optionalString(v).toUpperCase()
  const m = s.match(/^T(10|[1-9])$/)
  return m ? m[0] : ''
}
const maskApiKey = (k) => {
  const s = String(k || '')
  return s ? `${s.slice(0, 4)}***` : ''
}
const elapsedMs = () => 0

function makeImpl(captured) {
  return createQuestionBankStewardImplementation({
    callDeepSeekWithFallback: async (ctx) => {
      captured.deepSeek.push(ctx)
      return { parsed: captured.parsed, latencyMs: 7 }
    },
    semanticSearchQuestionGroups: async (q, key, rid, tm) => {
      captured.semantic.push({ q, key, rid, tm })
      return { matches: captured.matches || [], pipeline: 'semantic-search-stub' }
    },
    describeKeySource: (k) => ({ source: k ? 'request' : 'env' }),
    optionalString,
    objectValue,
    normalizeSynonymCardId,
    maskApiKey,
    elapsedMs,
    DEEPSEEK_API_KEY: 'envkey',
    DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
    QUESTION_BANK_STEWARD_TOP_K: 8,
  })
}

verifier.section('Invocation smoke (catches missing injected deps at call time)')
{
  const captured = { deepSeek: [], semantic: [], parsed: { intent: 'search', filters: {} }, matches: [] }
  const impl = makeImpl(captured)
  verifier.assert(typeof impl.questionBankStewardSearch === 'function', 'factory returns questionBankStewardSearch')
  verifier.assert(typeof impl.planQuestionBankStewardSearch === 'function', 'factory returns planQuestionBankStewardSearch')
}

// ── Golden envelopes — captured from the extracted module under fixed stubs; these freeze the
//    pre-cut plan/filter/message contract byte-for-byte. ──────────────────────────────────────

verifier.section('Case A — bare "找相似题" forces clarification (no semantic call)')
{
  const captured = { deepSeek: [], semantic: [], parsed: { intent: 'search', filters: {} }, matches: [] }
  const impl = makeImpl(captured)
  const out = await impl.questionBankStewardSearch('找相似题', 'sk-test1234', 'rid-A', false)
  const EXPECTED_A =
    '{"query":"找相似题","assistantMessage":"你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。","needsClarification":true,"clarificationQuestion":"你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。","intent":{"intent":"clarify","needsClarification":true,"clarificationQuestion":"你更想找“学生做题思路像”的，还是“文章讲的内容像”的？也可以直接补一句，比如“找同样要抽象概括的”。","similarityDimension":"null","rewrittenQuery":"找相似题","filters":{"groupType":"","sourceType":"","years":[],"regions":[],"tCardIds":[],"surfaceQuestionTypes":[],"difficultyLevels":[]},"answer":""},"matches":[],"provider":"deepseek","model":"deepseek-v4-flash","thinkingMode":false,"keySource":"request","keyFingerprint":"sk-t***","keyMask":"sk-t***","requestId":"rid-A","totalLatencyMs":0,"pipeline":"deepseek-flash-steward"}'
  verifier.assert(JSON.stringify(out) === EXPECTED_A, 'Case A envelope byte-identical to pre-cut')
  verifier.assert(captured.deepSeek.length === 1, 'Case A: planning calls DeepSeek exactly once')
  verifier.assert(captured.semantic.length === 0, 'Case A: clarification short-circuits before semantic search')
}

verifier.section('Case B — skill-dimension inference + filter matrix (thinkingMode forwarded)')
{
  const captured = {
    deepSeek: [],
    semantic: [],
    parsed: {
      intent: 'find_similar',
      similarityDimension: 'skill',
      rewrittenQuery: '抽象概括题',
      filters: { tCardIds: ['T6'] },
      answer: '我帮你找思路像的',
    },
    matches: [
      { questionGroup: { groupType: 'reading', readingSearchSignals: { tCardIds: ['T6'], surfaceTypes: [], finalScores: [8] } }, reason: '语义匹配', score: 0.9 },
      { questionGroup: { groupType: 'reading', readingSearchSignals: { tCardIds: ['T1'], surfaceTypes: [], finalScores: [2] } }, reason: '其它', score: 0.5 },
    ],
  }
  const impl = makeImpl(captured)
  const out = await impl.questionBankStewardSearch('找同样要抽象概括的 T6 推断', '', 'rid-B', true)
  const EXPECTED_B =
    '{"query":"找同样要抽象概括的 T6 推断","assistantMessage":"我帮你找思路像的 目前没有找到稳定匹配，可以换一个主题、T卡或年份再试。","needsClarification":false,"clarificationQuestion":"","intent":{"intent":"find_similar","needsClarification":false,"clarificationQuestion":"","similarityDimension":"skill","rewrittenQuery":"抽象概括题","filters":{"groupType":"","sourceType":"","years":[],"regions":[],"tCardIds":["T6"],"surfaceQuestionTypes":["abstract_phrase_summary","inference_general"],"difficultyLevels":[]},"answer":"我帮你找思路像的"},"search":{"matches":[],"pipeline":"semantic-search-stub","query":"抽象概括题；相似维度:skill；T卡:T6；题面:abstract_phrase_summary inference_general"},"matches":[],"provider":"deepseek","model":"deepseek-v4-flash","thinkingMode":true,"keySource":"env","keyFingerprint":"envk***","keyMask":"envk***","requestId":"rid-B","totalLatencyMs":0,"pipeline":"deepseek-flash-steward+semantic-search-stub"}'
  verifier.assert(JSON.stringify(out) === EXPECTED_B, 'Case B envelope byte-identical to pre-cut (inferred dimension + surface types + filter)')
  verifier.assert(captured.semantic.length === 1, 'Case B: semantic search invoked once')
  verifier.assert(captured.semantic[0].q === '抽象概括题；相似维度:skill；T卡:T6；题面:abstract_phrase_summary inference_general', 'Case B: buildStewardSemanticQuery produces the exact composed query')
  verifier.assert(captured.semantic[0].tm === true, 'Case B: thinkingMode forwarded to semantic search')
}

verifier.section('Case C — planQuestionBankStewardSearch source-dimension plan envelope')
{
  const captured = {
    deepSeek: [],
    semantic: [],
    parsed: { intent: 'search', similarityDimension: 'source', filters: { years: ['2023'], regions: ['浙江'], sourceType: 'real_exam' } },
    matches: [],
  }
  const impl = makeImpl(captured)
  const out = await impl.planQuestionBankStewardSearch('浙江 2023 真题', 'sk-plan', 'rid-C', false)
  const EXPECTED_C =
    '{"plan":{"intent":"search","needsClarification":false,"clarificationQuestion":"","similarityDimension":"source","rewrittenQuery":"浙江 2023 真题","filters":{"groupType":"","sourceType":"real_exam","years":["2023"],"regions":["浙江"],"tCardIds":[],"surfaceQuestionTypes":[],"difficultyLevels":[]},"answer":""},"latencyMs":7,"requestId":"rid-C"}'
  verifier.assert(JSON.stringify(out) === EXPECTED_C, 'Case C plan envelope byte-identical to pre-cut')
}

verifier.section('Steward prompt — system message NOT over-indented (frozen AI contract)')
{
  const captured = { deepSeek: [], semantic: [], parsed: { intent: 'search', filters: {} }, matches: [] }
  const impl = makeImpl(captured)
  await impl.questionBankStewardSearch('随便问问', 'k', 'rid-P', false)
  const sysPrompt = captured.deepSeek[0].messages[0].content
  verifier.assert(sysPrompt.startsWith('你是高中英语题库搜索管家，只负责把老师的自然语言转成检索意图。'), 'steward prompt starts at column 0 (no leading indent)')
  verifier.assert(sysPrompt.includes('\n可用相似维度：') && !sysPrompt.includes('\n  可用相似维度：'), 'steward prompt 可用相似维度 line is NOT over-indented')
  verifier.assert(sysPrompt.includes('\n澄清规则：') && !sysPrompt.includes('\n  澄清规则：'), 'steward prompt 澄清规则 line is NOT over-indented')
  // The JSON example block keeps its original 0-space brace + 2-space key structure.
  verifier.assert(sysPrompt.includes('\n{\n  "intent":') && !sysPrompt.includes('\n  {\n'), 'steward prompt JSON example keeps original 0/2-space structure')
}

verifier.section('Extraction seam')
const apiSource = readText(root, 'server/api.mjs')
const moduleSource = readText(root, 'server/search/questionBankStewardService.mjs')
const MOVED = [
  'normalizeStewardArray',
  'inferStewardDimensionFromQuery',
  'inferStewardSurfaceQuestionTypesFromQuery',
  'inferStewardTCardIdsFromQuery',
  'normalizeQuestionBankStewardPlan',
  'shouldForceStewardClarification',
  'buildStewardSemanticQuery',
  'summarizeStewardDimension',
  'buildQuestionBankStewardMessage',
  'matchStewardFilter',
  'applyStewardFiltersToMatches',
  'planQuestionBankStewardSearch',
  'questionBankStewardSearch',
]
for (const name of MOVED) {
  verifier.assert(!new RegExp(`^(export )?(async )?function ${name}\\(`, 'm').test(apiSource), `api.mjs no longer defines ${name}`)
  // functions live at module top-level (indent 0, NOT nested/re-indented) so the prompt stays byte-identical
  verifier.assert(new RegExp(`^(async )?function ${name}\\(`, 'm').test(moduleSource), `module owns ${name} (indent 0)`)
}
verifier.assert(!new RegExp('const QUESTION_BANK_STEWARD_PROMPT', 'm').test(apiSource), 'api.mjs no longer defines the steward prompt')
verifier.assert(new RegExp('^const QUESTION_BANK_STEWARD_PROMPT', 'm').test(moduleSource), 'module owns the steward prompt (indent 0)')
verifier.assert(apiSource.includes("from './search/questionBankStewardService.mjs'"), 'api.mjs imports the steward service')
verifier.assert(apiSource.includes('createQuestionBankStewardImplementation({'), 'api.mjs instantiates the factory')
verifier.assert(!/from ['"]\.\.\/api\.mjs['"]/.test(moduleSource), 'module does not import from api.mjs (no cycle)')
verifier.assert(/semanticSearchQuestionGroups,/.test(apiSource.match(/createQuestionBankStewardImplementation\(\{[\s\S]*?\}\)/)?.[0] || ''), 'semanticSearchQuestionGroups is INJECTED into the steward factory (not re-extracted)')

verifier.section('Used-but-undefined: re-import surface complete')
{
  const m = apiSource.match(/const\s*\{([^{}]*)\}\s*=\s*questionBankStewardImplementation/)
  const reImport = new Set((m ? m[1] : '').split(',').map((s) => s.trim()).filter((n) => /^\w+$/.test(n)))
  // strip the import line + the factory destructure so remaining references = real call sites
  const without = apiSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/search\/questionBankStewardService\.mjs['"]/g, '')
    .replace(/const\s*\{[^{}]*\}\s*=\s*questionBankStewardImplementation/g, '')
  for (const name of MOVED) {
    if (new RegExp(`\\b${name}\\b`).test(without)) {
      verifier.assert(reImport.has(name), `moved fn ${name} referenced in api.mjs => must be re-imported`)
    }
  }
  verifier.assert(reImport.has('questionBankStewardSearch'), 'questionBankStewardSearch is re-imported (called by the steward route)')
  // Only the public entry point is re-imported — the private helpers (and the unused planner) must NOT leak back.
  for (const name of MOVED.filter((n) => n !== 'questionBankStewardSearch')) {
    verifier.assert(!reImport.has(name), `private helper ${name} is NOT re-imported (stays file-private / unused in api.mjs)`)
  }
}

verifier.summary()
