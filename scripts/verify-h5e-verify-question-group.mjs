#!/usr/bin/env node
// H5-E — verify-question-group service extraction.
// INVOCATION smoke: actually constructs createVerifyImplementation with stubs and CALLS
// verifyQuestionGroup end-to-end (the only check that catches a missing call-time dependency —
// node --check + import-smoke do not). Plus the extraction-seam + audit-shape + used-but-undefined guards.
import { createVerifyImplementation } from '../server/ai-verify/verifyQuestionGroupService.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-E verify-question-group')

verifier.section('Invocation smoke (catches missing injected deps at call time)')
const audits = []
const fallbackCalls = []
const impl = createVerifyImplementation({
  getQuestionGroupDetail: () => ({
    title: '2024 Reading A',
    groupType: 'reading',
    passage: { title: 'A passage', materialText: 'hello world '.repeat(10) },
    questions: [
      { id: 'q1', questionNo: 21, answer: 'B', stem: 'What is X?', options: [{ label: 'A', content: 'a' }, { label: 'B', content: 'b' }], explanation: 'because' },
      { id: 'q2', questionNo: 22, answer: '', stem: 'No answer', options: [], explanation: '' },
    ],
  }),
  appendVerifyAudit: (e) => audits.push(e),
  callDeepSeekWithFallback: async (reqObj, onParseError) => {
    fallbackCalls.push(reqObj)
    if (typeof reqObj.onHttpResponse === 'function') reqObj.onHttpResponse({ rawStatusText: 'OK', status: 200, ok: true, latencyMs: 5 })
    return { parsed: { verdict: 'correct', reason: '答案正确', correctAnswer: '' }, rawText: '{}', latencyMs: 5 }
  },
  normalizeDeepSeekModel: (m) => m || 'deepseek-v4-flash',
  describeKeySource: () => ({ source: 'env', provider: 'deepseek' }),
  maskApiKey: () => '***',
  elapsedMs: () => 1,
  groupTypeLabels: { reading: '阅读', cloze: '完形填空' },
  DEEPSEEK_API_KEY: 'test-key',
})
verifier.assert(typeof impl.verifyQuestionGroup === 'function', 'factory returns verifyQuestionGroup')

const result = await impl.verifyQuestionGroup('g1', 'test-key', 'deepseek-v4-flash', 'trace-1', false)
verifier.assert(result && result.questionGroupId === 'g1', 'returns result for the group')
verifier.assert(result.questionCount === 2, 'questionCount = 2')
verifier.assert(result.verifiedCount === 1, 'verifiedCount = 1 (the answered question)')
verifier.assert(result.calledCount === 1, 'calledCount = 1 (skips the no-answer question)')
verifier.assert(Array.isArray(result.results) && result.results.length === 2, 'two per-question results')
verifier.assert(result.results.find((r) => r.questionId === 'q1').verdict === 'correct', 'answered question verdict from stub')
verifier.assert(result.results.find((r) => r.questionId === 'q2').verdict === 'skipped', 'no-answer question skipped')
verifier.assert(fallbackCalls.length === 1, 'callDeepSeekWithFallback invoked exactly once (only the answered question)')

// Prompt-content integrity (CR Must Fix): the verify prompt is the frozen AI contract — a blanket
// re-indent must NOT add leading whitespace to template-literal interior lines.
const sysPrompt = fallbackCalls[0].messages[0].content
const userPrompt = fallbackCalls[0].messages[1].content
verifier.assert(sysPrompt.includes('\n题型：') && !sysPrompt.includes('\n  题型：'), 'system prompt 题型 line is NOT over-indented')
verifier.assert(sysPrompt.includes('\n返回 JSON 格式：') && !sysPrompt.includes('\n  返回 JSON 格式：'), 'system prompt 返回JSON line is NOT over-indented')
verifier.assert(sysPrompt.includes('\n{"verdict":') && !sysPrompt.includes('\n  {"verdict":'), 'system prompt JSON example line is NOT over-indented')
verifier.assert(userPrompt.includes('\n试题：') && !userPrompt.includes('\n  试题：'), 'user prompt 试题 line is NOT over-indented')
verifier.assert(userPrompt.startsWith('请验证：'), 'user prompt starts at column 0 (no leading indent)')

verifier.section('Audit-JSONL shape preserved (the /api/ai/verify-trace contract)')
const types = audits.map((a) => a.type)
verifier.assert(types.includes('group_start'), 'emits group_start audit event')
verifier.assert(types.includes('group_end'), 'emits group_end audit event')
verifier.assert(types.includes('question_call_http'), 'emits question_call_http audit event')
verifier.assert(types.includes('question_call_success'), 'emits question_call_success audit event')
const groupStart = audits.find((a) => a.type === 'group_start')
verifier.assert(groupStart.traceId === 'trace-1' && groupStart.questionGroupId === 'g1' && groupStart.questionCount === 2, 'group_start carries traceId/groupId/questionCount')
const groupEnd = audits.find((a) => a.type === 'group_end')
verifier.assert(groupEnd.verifiedCount === 1 && groupEnd.calledCount === 1, 'group_end carries verifiedCount/calledCount')

verifier.section('Extraction seam')
const apiSource = readText(root, 'server/api.mjs')
const moduleSource = readText(root, 'server/ai-verify/verifyQuestionGroupService.mjs')
for (const name of ['verifyQuestionGroup', 'callDeepSeekVerify']) {
  verifier.assert(!new RegExp(`^(export )?async function ${name}\\(`, 'm').test(apiSource), `api.mjs no longer defines ${name}`)
  // functions live at module top-level (indent 0, NOT nested/re-indented) so prompt template literals stay byte-identical
  verifier.assert(new RegExp(`^async function ${name}\\(`, 'm').test(moduleSource), `module owns ${name} (indent 0)`)
}
verifier.assert(/^function appendVerifyAudit\(/m.test(apiSource), 'appendVerifyAudit STAYS in api.mjs (verify-trace reads its JSONL)')
verifier.assert(apiSource.includes('/api/ai/verify-trace'), 'verify-trace route still present')
verifier.assert(apiSource.includes("from './ai-verify/verifyQuestionGroupService.mjs'"), 'api.mjs imports the verify service')
verifier.assert(apiSource.includes('createVerifyImplementation({'), 'api.mjs instantiates the factory')
verifier.assert(!/from ['"]\.\.\/api\.mjs['"]/.test(moduleSource), 'module does not import from api.mjs (no cycle)')

verifier.section('Used-but-undefined: re-import surface complete')
{
  // format-robust: extract the destructure names via regex (handles single- AND multi-line)
  const m = apiSource.match(/const\s*\{([^{}]*)\}\s*=\s*verifyImplementation/)
  const reImport = new Set((m ? m[1] : '').split(',').map((s) => s.trim()).filter((n) => /^\w+$/.test(n)))
  // strip the import line + the destructure so remaining references = real call sites
  const without = apiSource
    .replace(/import\s*\{[^}]*\}\s*from\s*['"]\.\/ai-verify\/verifyQuestionGroupService\.mjs['"]/g, '')
    .replace(/const\s*\{[^{}]*\}\s*=\s*verifyImplementation/g, '')
  for (const name of ['verifyQuestionGroup', 'callDeepSeekVerify']) {
    if (new RegExp(`\\b${name}\\b`).test(without)) {
      verifier.assert(reImport.has(name), `moved fn ${name} referenced in api.mjs => must be re-imported`)
    }
  }
  verifier.assert(reImport.has('verifyQuestionGroup'), 'verifyQuestionGroup is re-imported (called by the verify route)')
}

verifier.summary()
