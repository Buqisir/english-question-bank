#!/usr/bin/env node
// H10-B PR2 — AI-proxy route owners (semantic-search / question-bank-steward / verify-question-group).
// Drives each defineRoute handler with stub context fns and asserts: route surface (POST + exact path),
// the exact context.fn call args, the 200 envelope pass-through, and the verify-question-group
// x-verify-request-id header contract (result.requestId on success / minted id on 500) + {error,requestId}.
// Hermetic: no provider, no DB, no git. Also a used-but-undefined guard on the module + serverContext wiring.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAiProxyRoutes } from '../server/ai-proxy/routes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0
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
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value
    },
  }
}

// M0-4 (docs/cuts/m0-4-user-scope/plan.md decision 7 / PA MF-1): both AI-search
// routes now call context.resolveDataUserId(context) — the stub context needs the
// real function (open-mode semantics: authMode 'open' -> 'local') so the route
// handlers under test don't throw before reaching the stubbed search fns.
function makeContext(overrides = {}) {
  return {
    DEFAULT_DEEPSEEK_MODEL: 'deepseek-v4-flash',
    authMode: 'open',
    resolveDataUserId(context) {
      if (context?.authMode === 'enforced') return context?.session?.userId
      return 'local'
    },
    async readJsonBody(request) {
      return request.body || {}
    },
    sendJson(response, statusCode, body) {
      response.statusCode = statusCode
      response.body = body
    },
    ...overrides,
  }
}

function routeBy(routes, method, pathname) {
  return routes.find((route) => route.method === method && pathname.match(route.pattern))
}

const routes = createAiProxyRoutes()

// --- Route surface ---
// cut ai-key-server-fallback: GET /api/ai/status joined the 3 pre-existing POST routes.
assert('exactly 4 routes', routes.length === 4, `got ${routes.length}`)
for (const p of ['/api/ai/semantic-search', '/api/ai/question-bank-steward', '/api/ai/verify-question-group']) {
  assert(`POST ${p} defined`, Boolean(routeBy(routes, 'POST', p)))
}
assert('GET /api/ai/status defined', Boolean(routeBy(routes, 'GET', '/api/ai/status')))
assert('GET semantic-search NOT matched (POST only)', !routeBy(routes, 'GET', '/api/ai/semantic-search'))
assert('verify-trace NOT owned here (stays inline in api.mjs)', !routeBy(routes, 'GET', '/api/ai/verify-trace'))

// --- semantic-search ---
// M0-4 (PA MF-1): a 5th userId arg is now always forwarded, resolved via
// context.resolveDataUserId(context) (open mode here -> 'local').
{
  let args = null
  const ctx = makeContext({
    async semanticSearchQuestionGroups(query, apiKey, requestId, thinkingMode, userId) {
      args = { query, apiKey, requestId, thinkingMode, userId }
      return { matches: ['m1'], provider: 'stub' }
    },
  })
  const response = createResponse()
  const route = routeBy(routes, 'POST', '/api/ai/semantic-search')
  await route.handle({ request: { body: { query: 'q', apiKey: 'k', requestId: 'r' } }, response, context: ctx })
  assert('semantic-search forwards (query, apiKey, requestId) exactly',
    args && args.query === 'q' && args.apiKey === 'k' && args.requestId === 'r', JSON.stringify(args))
  assert('semantic-search forwards resolved userId as the 5th arg (M0-4 PA MF-1)', args.userId === 'local', JSON.stringify(args))
  assert('semantic-search returns 200 with the raw result',
    response.statusCode === 200 && response.body.matches[0] === 'm1' && response.body.provider === 'stub')
}

// --- question-bank-steward: message||query fallback + thinkingMode coercion ---
// M0-4 (PA MF-1): a 5th userId arg is now always forwarded.
{
  let args = null
  const ctx = makeContext({
    async questionBankStewardSearch(message, apiKey, requestId, thinkingMode, userId) {
      args = { message, apiKey, requestId, thinkingMode, userId }
      return { plan: 'p' }
    },
  })
  // message present
  let response = createResponse()
  const route = routeBy(routes, 'POST', '/api/ai/question-bank-steward')
  await route.handle({ request: { body: { message: 'msg', query: 'qq', apiKey: 'k', requestId: 'r', thinkingMode: true } }, response, context: ctx })
  assert('steward uses message when present (not query)', args.message === 'msg')
  assert('steward forwards apiKey/requestId + thinkingMode===true', args.apiKey === 'k' && args.requestId === 'r' && args.thinkingMode === true)
  assert('steward forwards resolved userId as the 5th arg (M0-4 PA MF-1)', args.userId === 'local', JSON.stringify(args))
  assert('steward returns 200 with raw result', response.statusCode === 200 && response.body.plan === 'p')
  // message absent -> falls back to query; thinkingMode non-true coerces to false
  response = createResponse()
  await route.handle({ request: { body: { query: 'qq', thinkingMode: 'yes' } }, response, context: ctx })
  assert('steward falls back to query when message absent', args.message === 'qq')
  assert('steward thinkingMode strictly === true (non-true -> false)', args.thinkingMode === false)
}

// --- verify-question-group: success path (header from result.requestId) ---
{
  let args = null
  const ctx = makeContext({
    async verifyQuestionGroup(groupId, apiKey, model, requestId, thinkingMode) {
      args = { groupId, apiKey, model, requestId, thinkingMode }
      return { results: [], verifiedCount: 0, requestId: 'inner-rid' }
    },
  })
  const response = createResponse()
  const route = routeBy(routes, 'POST', '/api/ai/verify-question-group')
  await route.handle({ request: { body: { questionGroupId: 'g1', apiKey: 'k', model: 'm', thinkingMode: true } }, response, context: ctx })
  assert('verify forwards (groupId, apiKey, model, <minted rid>, thinkingMode)',
    args.groupId === 'g1' && args.apiKey === 'k' && args.model === 'm' && args.thinkingMode === true && typeof args.requestId === 'string' && args.requestId.length > 0)
  assert('verify success sets x-verify-request-id from result.requestId', response.headers['x-verify-request-id'] === 'inner-rid')
  assert('verify success returns 200 with the result', response.statusCode === 200 && response.body.verifiedCount === 0)
}

// --- verify-question-group: success WITHOUT result.requestId -> no header ---
{
  const ctx = makeContext({ async verifyQuestionGroup() { return { results: [], verifiedCount: 1 } } })
  const response = createResponse()
  const route = routeBy(routes, 'POST', '/api/ai/verify-question-group')
  await route.handle({ request: { body: { questionGroupId: 'g' } }, response, context: ctx })
  assert('verify success with no result.requestId sets NO header', !('x-verify-request-id' in response.headers))
  assert('verify success (no rid) still 200', response.statusCode === 200)
}

// --- verify-question-group: error path (header = minted id, 500 {error, requestId}) ---
{
  const ctx = makeContext({
    async verifyQuestionGroup() { throw new Error('boom') },
  })
  const response = createResponse()
  const route = routeBy(routes, 'POST', '/api/ai/verify-question-group')
  await route.handle({ request: { body: { questionGroupId: 'g' } }, response, context: ctx })
  assert('verify error sets x-verify-request-id to the minted id', typeof response.headers['x-verify-request-id'] === 'string' && response.headers['x-verify-request-id'].length > 0)
  assert('verify error returns 500', response.statusCode === 500)
  assert('verify error envelope is {error, requestId}',
    response.body.error === 'boom' && response.body.requestId === response.headers['x-verify-request-id'])
}

// --- Wiring guards (source-text, working-tree only — hermetic) ---
const apiSource = readFileSync(path.join(rootDir, 'server/api.mjs'), 'utf8')
const moduleSource = readFileSync(path.join(rootDir, 'server/ai-proxy/routes.mjs'), 'utf8')
assert('api.mjs imports createAiProxyRoutes', apiSource.includes("from './ai-proxy/routes.mjs'"))
assert('api.mjs registers ...createAiProxyRoutes() in serverRoutes', /\.\.\.createAiProxyRoutes\(\),/.test(apiSource))
for (const fn of ['semanticSearchQuestionGroups', 'questionBankStewardSearch', 'verifyQuestionGroup', 'DEFAULT_DEEPSEEK_MODEL']) {
  assert(`api.mjs exposes ${fn} on serverContext`, new RegExp(`serverContext\\.${fn} = ${fn}`).test(apiSource))
}
assert('inline /api/ai/semantic-search removed from api.mjs', !apiSource.includes("url.pathname === '/api/ai/semantic-search'"))
assert('inline /api/ai/question-bank-steward removed from api.mjs', !apiSource.includes("url.pathname === '/api/ai/question-bank-steward'"))
assert('inline /api/ai/verify-question-group removed from api.mjs', !apiSource.includes("url.pathname === '/api/ai/verify-question-group'"))
assert('verify-trace reader STAYS inline in api.mjs', apiSource.includes("url.pathname === '/api/ai/verify-trace'"))
assert('route module does not import api.mjs (no cycle)', !/from ['"][^'"]*\/api\.mjs['"]/.test(moduleSource))
assert('module imports randomUUID directly from node:crypto', /import \{ randomUUID \} from 'node:crypto'/.test(moduleSource))

console.log(`\nH10-B ai-proxy routes verify: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
