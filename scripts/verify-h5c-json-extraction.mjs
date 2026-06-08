#!/usr/bin/env node
// H5-C — AI-completion JSON / verify-verdict extraction leaf.
// Behavioral coverage of the extracted pure functions + extraction-seam assertions.
// The byte-identical move itself is proven in CI by the unchanged I8/I13 verify paths
// (which exercise verify-verdict normalization + JSON extraction end-to-end via stubs).
import {
  parseJsonFromString,
  getDeepSeekMessageText,
  collectDeepSeekMessageTexts,
  parseLooseVerifyResult,
  extractVerifyResultFromPayload,
  extractReadingParsePayloadFromPayload,
  extractFirstJson,
  safeTruncate,
} from '../server/ai-providers/jsonExtraction.mjs'
import { createVerifier, readText, repoRootFrom } from './lib/verifyScope.mjs'

const root = repoRootFrom(import.meta.url)
const verifier = createVerifier('H5-C json-extraction leaf')

verifier.section('Verdict vocabulary (extractVerifyResultFromPayload / parseLooseVerifyResult)')
const verdictCases = [
  [{ verdict: 'correct', reason: 'r', correctAnswer: 'A' }, 'correct'],
  [{ verdict: '答案错误' }, 'answer_wrong'],
  [{ verdict: '解析有误' }, 'explanation_wrong'],
  [{ verdict: '答案和解析均错' }, 'both_wrong'],
  [{ verdict: 'uncertain' }, 'uncertain'],
  [{ result: 'both_wrong' }, 'both_wrong'],
]
for (const [payload, expected] of verdictCases) {
  const got = extractVerifyResultFromPayload(payload)
  verifier.assert(got && got.verdict === expected, `verdict ${JSON.stringify(payload)} -> ${expected} (got ${got && got.verdict})`)
}
verifier.assert(extractVerifyResultFromPayload('not json at all') === null, 'non-json string -> null')
verifier.assert(extractVerifyResultFromPayload({ verdict: 'correct', reason: 'r', correctAnswer: 'A' }).correctAnswer === 'A', 'correctAnswer carried through')

const loose = parseLooseVerifyResult('verdict: explanation_wrong\nreason: the explanation is off')
verifier.assert(loose && loose.verdict === 'explanation_wrong', 'parseLooseVerifyResult reads explicit verdict line')
const looseCn = parseLooseVerifyResult('结论：答案正确')
verifier.assert(looseCn && looseCn.verdict === 'correct', 'parseLooseVerifyResult infers correct from Chinese text')

verifier.section('JSON extraction')
verifier.assert(JSON.stringify(extractFirstJson('prefix {"a":1} suffix')) === '{"a":1}', 'extractFirstJson finds embedded object')
verifier.assert(JSON.stringify(extractFirstJson('```json\n{"b":2}\n```')) === '{"b":2}', 'extractFirstJson reads code-fenced json')
verifier.assert(JSON.stringify(extractFirstJson({ choices: [{ message: { content: '{"c":3}' } }] })) === '{"c":3}', 'extractFirstJson reads choices[].message.content')
verifier.assert(parseJsonFromString('{"x":9}').x === 9, 'parseJsonFromString parses')
verifier.assert(parseJsonFromString('not json') === null, 'parseJsonFromString returns null on garbage')
const reading = extractReadingParsePayloadFromPayload({ wrapper: { questions: [{ q: 1 }, { q: 2 }] } })
verifier.assert(reading && Array.isArray(reading.questions) && reading.questions.length === 2, 'extractReadingParsePayloadFromPayload finds nested {questions:[]}')

verifier.section('Message text')
verifier.assert(getDeepSeekMessageText({ content: 'hello' }) === 'hello', 'getDeepSeekMessageText reads content')
verifier.assert(getDeepSeekMessageText({ content: '', reasoning_content: 'rc' }) === 'rc', 'getDeepSeekMessageText falls back to reasoning_content')
const collected = collectDeepSeekMessageTexts({ content: 'a', reasoning: 'b' })
verifier.assert(collected.includes('a') && collected.includes('b'), 'collectDeepSeekMessageTexts gathers content + reasoning')

verifier.section('safeTruncate')
verifier.assert(safeTruncate('abc', 10) === 'abc', 'safeTruncate keeps short text')
verifier.assert(safeTruncate('abcdef', 3) === 'abc…', 'safeTruncate truncates with ellipsis')
verifier.assert(safeTruncate(123) === '', 'safeTruncate non-string -> empty')

verifier.section('Extraction seam')
const apiSource = readText(root, 'server/api.mjs')
const moduleSource = readText(root, 'server/ai-providers/jsonExtraction.mjs')

const moved = [
  'parseJsonFromString', 'isPlainObject', 'extractBalancedJsonCandidates', 'parseJsonObject',
  'normalizeVerifyVerdict', 'inferVerifyVerdictFromText', 'getDeepSeekMessageText',
  'collectDeepSeekMessageTexts', 'parseLooseVerifyResult', 'extractJsonCandidates',
  'extractVerifyResultFromPayload', 'extractReadingParsePayloadFromPayload',
  'normalizeVerifyResultObject', 'extractFirstJson', 'safeTruncate',
]
for (const name of moved) {
  verifier.assert(!new RegExp(`^(export )?function ${name}\\(`, 'm').test(apiSource), `api.mjs no longer defines ${name}`)
  verifier.assert(new RegExp(`^(export )?function ${name}\\(`, 'm').test(moduleSource), `module defines ${name}`)
}
const publicExports = [
  'parseJsonFromString', 'getDeepSeekMessageText', 'collectDeepSeekMessageTexts', 'parseLooseVerifyResult',
  'extractVerifyResultFromPayload', 'extractReadingParsePayloadFromPayload', 'extractFirstJson', 'safeTruncate',
]
for (const name of publicExports) {
  verifier.assert(new RegExp(`^export function ${name}\\(`, 'm').test(moduleSource), `module exports ${name}`)
}
// no over-export: exactly the 8 public functions are exported
const exportedCount = (moduleSource.match(/^export function /gm) || []).length
verifier.assert(exportedCount === publicExports.length, `module exports exactly ${publicExports.length} functions (got ${exportedCount})`)
// dead extractBalancedJson removed; live candidates retained
verifier.assert(!/function extractBalancedJson\(/.test(apiSource) && !/function extractBalancedJson\(/.test(moduleSource), 'dead extractBalancedJson removed everywhere')
verifier.assert(/function extractBalancedJsonCandidates\(/.test(moduleSource), 'live extractBalancedJsonCandidates retained in module')
// no circular import
verifier.assert(!/from ['"]\.\.\/api\.mjs['"]/.test(moduleSource) && !/from ['"]\.\.\/\.\.\/server\/api\.mjs['"]/.test(moduleSource), 'module does not import from api.mjs')
verifier.assert(apiSource.includes("from './ai-providers/jsonExtraction.mjs'"), 'api.mjs imports the extracted leaf')

verifier.summary()
