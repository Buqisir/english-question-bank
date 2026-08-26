#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createQuestionGroupRoutes } from '../server/question-bank/questionGroupRoutes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function createResponse() {
  return {
    statusCode: 0,
    body: null,
    writeHead(statusCode) {
      this.statusCode = statusCode
    },
    end(body) {
      this.body = body
    },
  }
}

function routeBy(routes, method, pathname) {
  return routes.find((route) => route.method === method && pathname.match(route.pattern))
}

function makeContext(overrides = {}) {
  const calls = []
  return {
    calls,
    localQwenEnabled: false,
    // M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 7): GET /api/question-groups
    // now calls context.resolveDataUserId(context) before listQuestionGroups(userId).
    authMode: 'open',
    resolveDataUserId(context) {
      if (context?.authMode === 'enforced') return context?.session?.userId
      return 'local'
    },
    async readJsonBody(request, options) {
      calls.push(`readJsonBody:${options?.maxBytes || 'default'}`)
      return request.body || {}
    },
    sendJson(response, statusCode, body) {
      calls.push(`sendJson:${statusCode}:${body.error || ''}`)
      response.writeHead(statusCode, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    },
    listQuestionGroups: (userId) => [{ id: 'group-1', userId }],
    createQuestionGroup: (input) => ({ id: 'group-created', input }),
    getQuestionGroupDetail: (id) => ({ id }),
    updateQuestionGroup: (id, input) => ({ id, input }),
    deleteQuestionGroup: (id) => ({ id, deleted: true }),
    saveReadingParseResult: (id, input) => ({ id, input, kind: 'save-reading' }),
    parseReadingByQuestionGroup: (id, apiKey, model, requestId, thinkingMode) => ({
      id,
      apiKey,
      model,
      requestId,
      thinkingMode,
      kind: 'parse-reading',
    }),
    parseClozeByQuestionGroup: (id) => ({ id, kind: 'parse-cloze' }),
    saveClozeParseResult: (id) => ({ id, kind: 'save-cloze' }),
    parseSevenChoicesByQuestionGroup: (id) => ({ id, kind: 'parse-seven' }),
    saveSevenChoicesParseResult: (id) => ({ id, kind: 'save-seven' }),
    parseGrammarByQuestionGroup: (id) => ({ id, kind: 'parse-grammar' }),
    saveGrammarParseResult: (id) => ({ id, kind: 'save-grammar' }),
    generateQuestionGroupSummary: (id) => ({ id, kind: 'summary' }),
    generateTopicLabelsByQuestionGroup: (id) => ({ id, kind: 'topic-labels' }),
    generateSynonymDifficultyByQuestionGroup: (id, input) => ({ id, input, kind: 'synonym' }),
    bindTopicLabelsToQuestionGroup: (id, input) => ({ id, input, kind: 'bind-topic-labels' }),
    saveQuestionDifficultyRating: (id, input) => ({ id, input, difficulty: 'medium' }),
    ...overrides,
  }
}

async function dispatch(routes, method, pathname, context, body = {}) {
  const route = routeBy(routes, method, pathname)
  assert(`${method} ${pathname} route exists`, Boolean(route))
  const response = createResponse()
  await route.handle({ request: { method, body }, response, match: pathname.match(route.pattern), context })
  return response
}

console.log('H1-G verify: question-group route extraction')

const api = read('server/api.mjs')
const routeSource = read('server/question-bank/questionGroupRoutes.mjs')
const verifyCi = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

assert('question-group routes module exports createQuestionGroupRoutes', /export function createQuestionGroupRoutes\(\)/.test(routeSource))
assert('question-group routes module uses minimal router helper', routeSource.includes("from '../router/index.mjs'"))
assert('question-group routes preserve parse save body limit', routeSource.includes('maxBytes: 3_000_000'))
assert('question-group routes preserve topic-label body limit', routeSource.includes('maxBytes: 1_000_000'))
assert('question difficulty route preserves small body limit', routeSource.includes('maxBytes: 20_000'))
assert('synonym difficulty disabled route preserves 410 replacement', routeSource.includes("replacement: 'POST /api/question-groups/:id/reading-parse'"))

for (const routeText of [
  '/api\\/question-groups$',
  '/api\\/question-groups\\/([^/]+)$',
  '/api\\/question-groups\\/([^/]+)\\/reading-parse$',
  '/api\\/question-groups\\/([^/]+)\\/cloze-parse$',
  '/api\\/question-groups\\/([^/]+)\\/seven-choices-parse$',
  '/api\\/question-groups\\/([^/]+)\\/grammar-parse$',
  '/api\\/question-groups\\/([^/]+)\\/summary$',
  '/api\\/question-groups\\/([^/]+)\\/topic-labels$',
  '/api\\/question-groups\\/([^/]+)\\/synonym-difficulty$',
  '/api\\/questions\\/([^/]+)\\/difficulty-rating$',
]) {
  assert(`question-group route registered ${routeText}`, routeSource.includes(routeText))
}

for (const errorText of ['Question group not found', 'Question not found', '题库本地 Qwen 初判已停用']) {
  assert(`question-group route preserves error text: ${errorText}`, routeSource.includes(errorText))
}

assert('api imports question-group routes module', api.includes("from './question-bank/questionGroupRoutes.mjs'"))
assert('api registers question-group routes in serverRoutes', api.includes('...createQuestionGroupRoutes(),'))
assert(
  'api constructs exactly one Canonical active-consumer compatibility Adapter',
  api.includes('createCanonicalActiveConsumerCompatibilityAdapter({')
    && api.match(/createCanonicalActiveConsumerCompatibilityAdapter\(\{/g)?.length === 1,
)
assert(
  'Canonical-only detail branches through the immutable compatibility snapshot before DB-only joins',
  api.indexOf('getCanonicalCompatibilitySnapshot().groupsById[id]?.detail')
    < api.indexOf('const db = openDatabase()', api.indexOf('export function getQuestionGroupDetail')),
)

for (const contextName of [
  'bindTopicLabelsToQuestionGroup',
  'createQuestionGroup',
  'deleteQuestionGroup',
  'generateQuestionGroupSummary',
  'generateSynonymDifficultyByQuestionGroup',
  'generateTopicLabelsByQuestionGroup',
  'getQuestionGroupDetail',
  'listQuestionGroups',
  'parseClozeByQuestionGroup',
  'parseGrammarByQuestionGroup',
  'parseReadingByQuestionGroup',
  'parseSevenChoicesByQuestionGroup',
  'saveClozeParseResult',
  'saveGrammarParseResult',
  'saveQuestionDifficultyRating',
  'saveReadingParseResult',
  'saveSevenChoicesParseResult',
  'updateQuestionGroup',
]) {
  assert(`api exposes ${contextName} through context`, new RegExp(`\\b${contextName},`).test(api))
}

assert('api exposes local Qwen flag through context without TDZ constant', api.includes("localQwenEnabled: process.env.QUESTION_BANK_ENABLE_LOCAL_QWEN === '1'"))
assert(
  'api no longer owns inline question-group route matcher variables',
  !api.includes("url.pathname === '/api/question-groups'") &&
    !api.includes('detailMatch') &&
    !api.includes('readingParseMatch') &&
    !api.includes('clozeParseMatch') &&
    !api.includes('sevenChoicesParseMatch') &&
    !api.includes('grammarParseMatch') &&
    !api.includes('summaryMatch') &&
    !api.includes('topicLabelsMatch') &&
    !api.includes('synonymDifficultyMatch') &&
    !api.includes('questionDifficultyMatch'),
)

const routes = createQuestionGroupRoutes()
assert('createQuestionGroupRoutes returns eighteen routes', routes.length === 18)

const listResponse = await dispatch(routes, 'GET', '/api/question-groups', makeContext())
assert('GET /api/question-groups returns questionGroups array', listResponse.statusCode === 200 && listResponse.body.includes('group-1'))

const canonicalReadContext = makeContext({
  listQuestionGroups: () => [{
    id: 'group-canonical-only',
    canAddToDraftPaper: false,
    difficulty: '',
    topicLabels: [],
  }],
  getQuestionGroupDetail: () => ({
    id: 'group-canonical-only',
    questions: [{ id: 'question-canonical-only', answer: 'B' }],
  }),
})
const canonicalListResponse = await dispatch(
  routes,
  'GET',
  '/api/question-groups',
  canonicalReadContext,
)
assert(
  'GET listing preserves a Canonical-only non-addable card without invented difficulty/topics',
  canonicalListResponse.statusCode === 200
    && canonicalListResponse.body.includes('group-canonical-only')
    && canonicalListResponse.body.includes('"difficulty":""')
    && canonicalListResponse.body.includes('"topicLabels":[]'),
)
const canonicalDetailResponse = await dispatch(
  routes,
  'GET',
  '/api/question-groups/group-canonical-only',
  canonicalReadContext,
)
assert(
  'GET detail returns the Canonical-only whole-group read model',
  canonicalDetailResponse.statusCode === 200
    && canonicalDetailResponse.body.includes('question-canonical-only')
    && canonicalDetailResponse.body.includes('"answer":"B"'),
)

const createResponseResult = await dispatch(routes, 'POST', '/api/question-groups', makeContext(), { title: 'New group' })
assert('POST /api/question-groups returns 201', createResponseResult.statusCode === 201 && createResponseResult.body.includes('group-created'))

const detail404 = await dispatch(routes, 'GET', '/api/question-groups/missing', makeContext({ getQuestionGroupDetail: () => null }))
assert('missing group detail maps to 404', detail404.statusCode === 404 && detail404.body.includes('Question group not found'))

const saveReadingContext = makeContext()
const saveReading = await dispatch(routes, 'PUT', '/api/question-groups/group%201/reading-parse', saveReadingContext, { parsed: true })
assert('PUT reading parse decodes group id', saveReading.statusCode === 200 && saveReading.body.includes('group 1'))
assert('PUT reading parse preserves 3MB body limit', saveReadingContext.calls.includes('readJsonBody:3000000'))

const parseReading = await dispatch(
  routes,
  'POST',
  '/api/question-groups/group%201/reading-parse',
  makeContext(),
  { apiKey: 'k', model: 'm', requestId: 'r', thinkingMode: true },
)
assert('POST reading parse forwards model args', parseReading.statusCode === 200 && parseReading.body.includes('"model":"m"') && parseReading.body.includes('"thinkingMode":true'))

const synonymDisabledContext = makeContext({ localQwenEnabled: false })
const synonymDisabled = await dispatch(routes, 'POST', '/api/question-groups/group-1/synonym-difficulty', synonymDisabledContext, { ignored: true })
assert('disabled synonym difficulty maps to 410', synonymDisabled.statusCode === 410 && synonymDisabled.body.includes('synonymDifficulty'))
assert('disabled synonym difficulty does not read request body', !synonymDisabledContext.calls.some((call) => call.startsWith('readJsonBody')))

const topicContext = makeContext()
const topicPut = await dispatch(routes, 'PUT', '/api/question-groups/group-1/topic-labels', topicContext, { topicLabels: [] })
assert('PUT topic labels preserves 1MB body limit', topicPut.statusCode === 200 && topicContext.calls.includes('readJsonBody:1000000'))

const difficultyThrow = await dispatch(
  routes,
  'PUT',
  '/api/questions/q-1/difficulty-rating',
  makeContext({ saveQuestionDifficultyRating: () => { throw new Error('bad rating') } }),
  { difficulty: 'bad' },
)
assert('difficulty rating validation error maps to 400', difficultyThrow.statusCode === 400 && difficultyThrow.body.includes('bad rating'))

const difficulty404 = await dispatch(
  routes,
  'PUT',
  '/api/questions/missing/difficulty-rating',
  makeContext({ saveQuestionDifficultyRating: () => null }),
  { difficulty: 'medium' },
)
assert('missing question difficulty target maps to 404', difficulty404.statusCode === 404 && difficulty404.body.includes('Question not found'))

assert('verify-ci includes H1-G question-group routes verify', verifyCi.includes('verify-h1g-question-group-routes.mjs'))
assert('scripts README documents H1-G question-group routes verify', scriptsReadme.includes('verify-h1g-question-group-routes.mjs'))

if (failed > 0) {
  console.error(`\nH1-G question-group routes verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH1-G question-group routes verify passed: ${passed} passed, 0 failed`)
