#!/usr/bin/env node
// H5-H — semantic-search recall + rerank service extraction.
// INVOCATION smoke: actually constructs createSemanticSearchImplementation with stubs + a
// fixture DB and CALLS semanticSearchQuestionGroups end-to-end (the only check that catches a
// missing call-time dependency — node --check + import-smoke do not). Asserts the full
// prefilter -> score -> rerank -> matches envelope is byte-identical to the pre-cut behavior for
// fixed inputs (deterministic stub DeepSeek), plus the extraction-seam, prompt-not-over-indented,
// and used-but-undefined guards. Fully hermetic (no git show, no network, no real DB).
import { createSemanticSearchImplementation } from '../server/search/semanticSearchService.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-H semantic-search')

// ── Fixtures ────────────────────────────────────────────────────────────────
// Two cards; "alpha" matches the query lexically, "beta" does not. One card has a
// reading_parse_results row that buildReadingSearchSignals folds into the candidate text.
const CARDS = [
  {
    id: 'g-alpha',
    title: '推断题 阅读 climate science',
    passageTitle: 'Climate change study',
    summary: 'A passage about climate science and inference.',
    groupType: 'reading',
    hit: 'What can be inferred about climate?',
    answerPreview: 'B',
    tags: ['climate', 'inference'],
    topicLabels: [{ label: '人与自然' }],
    source: '浙江卷',
    region: '浙江',
    paperName: '2023-01',
    section: '阅读',
    year: 2023,
  },
  {
    id: 'g-beta',
    title: '购物 完形 shopping mall',
    passageTitle: 'A day at the mall',
    summary: 'A cloze passage about shopping.',
    groupType: 'cloze',
    hit: '',
    answerPreview: '',
    tags: ['shopping'],
    topicLabels: [],
    source: '全国卷',
    region: '全国',
    paperName: '2022-06',
    section: '完形',
    year: 2022,
  },
]

// reading_parse_results payload for g-alpha — exercises the signals SQL + builder path.
const READING_PARSE_ROWS = {
  'g-alpha': JSON.stringify({
    questions: [
      {
        questionNo: '21',
        questionType: '推断题',
        surfaceQuestion: { type: 'passage_inference', answeringMove: 'infer' },
        synonymDifficulty: { cardId: 'T6', name: '推断' },
        difficultyProfile: { finalScore: 72 },
      },
    ],
  }),
}

function makeFixtureDb() {
  return {
    prepare() {
      return {
        // getReadingSearchSignalsForQuestionGroups calls .all(...ids)
        all(...ids) {
          return ids
            .filter((id) => READING_PARSE_ROWS[id])
            .map((id) => ({ question_group_id: id, payload_json: READING_PARSE_ROWS[id] }))
        },
      }
    },
    close() {},
  }
}

verifier.section('Invocation smoke (catches missing injected deps at call time)')
const fallbackCalls = []
const impl = createSemanticSearchImplementation({
  openDatabase: () => makeFixtureDb(),
  selectQuestionGroupCards: () => CARDS,
  callDeepSeekWithFallback: async (reqObj) => {
    fallbackCalls.push(reqObj)
    // Deterministic rerank: alpha first (0.9), beta second (0.4).
    return {
      parsed: {
        rankings: [
          { questionGroupId: 'g-alpha', score: 0.9, reason: '主题命中 climate' },
          { questionGroupId: 'g-beta', score: 0.4, reason: '弱相关' },
        ],
      },
      rawText: '{}',
      latencyMs: 7,
    }
  },
  describeKeySource: () => ({ source: 'env', provider: 'deepseek' }),
  optionalString: (v) => (v == null ? '' : String(v).trim()),
  objectValue: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
  parseSavedJson: (raw) => {
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  },
  normalizeSynonymCardId: (v) => (v == null ? '' : String(v).trim().toUpperCase()),
  maskApiKey: () => '***',
  elapsedMs: () => 42,
  groupTypeLabels: { reading: '阅读', cloze: '完形填空' },
  SEMANTIC_SEARCH_PREFILTER_TOP_K: 72,
  SEMANTIC_SEARCH_TOP_K: 12,
  DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
  DEEPSEEK_API_KEY: 'env-key',
})
verifier.assert(typeof impl.semanticSearchQuestionGroups === 'function', 'factory returns semanticSearchQuestionGroups')

const result = await impl.semanticSearchQuestionGroups('climate science inference', 'caller-key', 'trace-1', false)
verifier.assert(fallbackCalls.length === 1, 'callDeepSeekWithFallback invoked exactly once (rerank step)')

verifier.section('matches envelope — byte-identical pipeline output for fixed inputs')
verifier.assert(result.query === 'climate science inference', 'query echoed back trimmed')
verifier.assert(result.provider === 'deepseek', 'provider = deepseek')
verifier.assert(result.model === 'deepseek-v4-flash', 'model = DEFAULT_DEEPSEEK_MODEL')
verifier.assert(result.pipeline === 'local-recall+deepseek-flash', 'pipeline = local-recall+deepseek-flash')
verifier.assert(result.thinkingMode === false, 'thinkingMode forwarded')
verifier.assert(result.keySource === 'env', 'keySource from describeKeySource')
verifier.assert(result.keyFingerprint === '***' && result.keyMask === '***', 'key fingerprint/mask masked')
verifier.assert(result.requestId === 'trace-1', 'requestId preserved')
verifier.assert(result.totalLatencyMs === 42, 'totalLatencyMs from elapsedMs')

verifier.assert(Array.isArray(result.matches) && result.matches.length === 2, 'two matches returned')
const [m0, m1] = result.matches
verifier.assert(m0.questionGroupId === 'g-alpha', 'rank 1 is g-alpha (DeepSeek top + lexical match)')
verifier.assert(m1.questionGroupId === 'g-beta', 'rank 2 is g-beta')
// Final score = clamp01(0.35 * prefilterScore + 0.65 * rerankScore). Assert deterministic shape.
verifier.assert(typeof m0.score === 'number' && m0.score >= 0 && m0.score <= 1, 'match score clamped to [0,1]')
verifier.assert(m0.score > m1.score, 'alpha scores higher than beta (rerank + lexical)')
verifier.assert(m0.reason === 'DeepSeek 检测第 1 位；主题命中 climate', 'rank-1 reason from buildDeepSeekSemanticSearchReason + DeepSeek reason')
verifier.assert(m1.reason === 'DeepSeek 检测第 2 位；弱相关', 'rank-2 reason from DeepSeek reason')
verifier.assert(m0.questionGroup && m0.questionGroup.id === 'g-alpha', 'match carries full questionGroup card')

// Reading-search signals folded into the candidate text sent to DeepSeek (proves the
// reading_parse_results SQL + buildReadingSearchSignals path moved intact).
const userPrompt = fallbackCalls[0].messages[1].content
verifier.assert(userPrompt.includes('检索意图：climate science inference'), 'user prompt carries the search intent')
verifier.assert(userPrompt.includes('阅读解析标签：') && userPrompt.includes('T卡:T6'), 'candidate text includes reading-search signals (T-card from reading_parse_results)')
verifier.assert(userPrompt.includes('请按相关度返回最多 12 个 rankings'), 'user prompt carries SEMANTIC_SEARCH_TOP_K')

verifier.section('Empty-DB short-circuit envelope (no DeepSeek call)')
const emptyImpl = createSemanticSearchImplementation({
  openDatabase: () => makeFixtureDb(),
  selectQuestionGroupCards: () => [],
  callDeepSeekWithFallback: async () => {
    throw new Error('must not call DeepSeek when there are no groups')
  },
  describeKeySource: () => ({ source: 'env', provider: 'deepseek' }),
  optionalString: (v) => (v == null ? '' : String(v).trim()),
  objectValue: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
  parseSavedJson: () => null,
  normalizeSynonymCardId: (v) => (v == null ? '' : String(v)),
  maskApiKey: () => '***',
  elapsedMs: () => 1,
  groupTypeLabels: {},
  SEMANTIC_SEARCH_PREFILTER_TOP_K: 72,
  SEMANTIC_SEARCH_TOP_K: 12,
  DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
  DEEPSEEK_API_KEY: 'env-key',
})
const emptyResult = await emptyImpl.semanticSearchQuestionGroups('anything', 'k', 'trace-2', true)
verifier.assert(Array.isArray(emptyResult.matches) && emptyResult.matches.length === 0, 'empty DB => no matches')
verifier.assert(emptyResult.pipeline === 'deepseek-flash', 'empty-DB pipeline = deepseek-flash')
verifier.assert(emptyResult.keySource === 'missing' && emptyResult.keyFingerprint === 'missing', 'empty-DB key fields = missing')
verifier.assert(emptyResult.thinkingMode === true, 'empty-DB thinkingMode forwarded')

verifier.section('Prompt-content integrity — rerank prompt NOT over-indented (frozen AI contract)')
const sysPrompt = fallbackCalls[0].messages[0].content
verifier.assert(sysPrompt.startsWith('你是高中英语题库语义检索重排助手。'), 'rerank prompt starts at column 0 (no leading indent)')
verifier.assert(sysPrompt.includes('\n规则：') && !sysPrompt.includes('\n  规则：'), 'rerank prompt 规则 line is NOT over-indented')
verifier.assert(sysPrompt.includes('\n返回格式：') && !sysPrompt.includes('\n  返回格式：'), 'rerank prompt 返回格式 line is NOT over-indented')
verifier.assert(sysPrompt.includes('\n{\n  "rankings": [') && !sysPrompt.includes('\n  {\n'), 'rerank prompt JSON example block keeps its original 0/2-space structure')

verifier.section('Extraction seam')
const apiSource = readText(root, 'server/api.mjs')
const moduleSource = readText(root, 'server/search/semanticSearchService.mjs')
const MOVED = [
  'formatSemanticSearchCandidateForDeepSeek',
  'normalizeSemanticSearchRankings',
  'buildSemanticSearchMatchesFromRankings',
  'buildDeepSeekSemanticSearchReason',
  'normalizeSemanticSearchText',
  'buildSemanticSearchTerms',
  'scoreSemanticSearchField',
  'scoreSemanticSearchCandidate',
  'buildSemanticSearchCandidatePool',
  'normalizeReadingSearchSignalQuestion',
  'buildReadingSearchSignals',
  'getReadingSearchSignalsForQuestionGroups',
  'semanticSearchQuestionGroups',
]
for (const name of MOVED) {
  verifier.assert(!new RegExp(`^(export )?(async )?function ${name}\\(`, 'm').test(apiSource), `api.mjs no longer defines ${name}`)
  // functions live at module top-level (indent 0, NOT nested/re-indented) so the prompt stays byte-identical
  verifier.assert(new RegExp(`^(async )?function ${name}\\(`, 'm').test(moduleSource), `module owns ${name} (indent 0)`)
}
verifier.assert(!new RegExp('const DEEPSEEK_SEMANTIC_RERANK_PROMPT', 'm').test(apiSource), 'api.mjs no longer defines the rerank prompt')
verifier.assert(new RegExp('^const DEEPSEEK_SEMANTIC_RERANK_PROMPT', 'm').test(moduleSource), 'module owns the rerank prompt (indent 0)')
verifier.assert(!new RegExp('function formatQuestionGroupForSemanticSearch', 'm').test(apiSource), 'dead formatQuestionGroupForSemanticSearch dropped from api.mjs')
verifier.assert(!new RegExp('formatQuestionGroupForSemanticSearch', 'm').test(moduleSource), 'dead formatQuestionGroupForSemanticSearch NOT carried into the module')
verifier.assert(/^function clamp01\(/m.test(apiSource), 'clamp01 STAYS in api.mjs (still used by the synonym-difficulty path)')
verifier.assert(/^function clamp01\(/m.test(moduleSource), 'module keeps its own file-private clamp01 (no shallow util module)')
verifier.assert(apiSource.includes("from './search/semanticSearchService.mjs'"), 'api.mjs imports the semantic-search service')
verifier.assert(apiSource.includes('createSemanticSearchImplementation({'), 'api.mjs instantiates the factory')
verifier.assert(!/from ['"]\.\.\/api\.mjs['"]/.test(moduleSource), 'module does not import from api.mjs (no cycle)')

verifier.section('Used-but-undefined: re-import surface complete')
{
  const m = apiSource.match(/const\s*\{([^{}]*)\}\s*=\s*semanticSearchImplementation/)
  const reImport = new Set((m ? m[1] : '').split(',').map((s) => s.trim()).filter((n) => /^\w+$/.test(n)))
  // strip the import line + the factory destructure so remaining references = real call sites
  const without = apiSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/search\/semanticSearchService\.mjs['"]/g, '')
    .replace(/const\s*\{[^{}]*\}\s*=\s*semanticSearchImplementation/g, '')
  for (const name of MOVED) {
    if (new RegExp(`\\b${name}\\b`).test(without)) {
      verifier.assert(reImport.has(name), `moved fn ${name} referenced in api.mjs => must be re-imported`)
    }
  }
  verifier.assert(reImport.has('semanticSearchQuestionGroups'), 'semanticSearchQuestionGroups is re-imported (called by steward + the semantic-search route)')
  // Only the public entry point is re-imported — the private helpers must NOT leak back.
  for (const name of MOVED.filter((n) => n !== 'semanticSearchQuestionGroups')) {
    verifier.assert(!reImport.has(name), `private helper ${name} is NOT re-imported (stays file-private)`)
  }
}

verifier.summary()
