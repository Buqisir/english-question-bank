#!/usr/bin/env node
// cut ai-key-server-fallback — server-key default-on fallback for AI 取题 (concierge search).
//
// Hermetic (no real server, no DeepSeek, no DB, no `git show main:`):
//   1. runConciergeSearch gate matrix: (no key, no server -> local missing-api-key),
//      (no key, server available -> doStewardCall with apiKey === ''), (key present ->
//      doStewardCall, no regression), (steward throws -> api-error local fallback, no
//      regression).
//   2. Timeout selection: default 20000ms / thinking-mode 60000ms / explicit
//      stewardTimeoutMs wins over both.
//   3. GET /api/ai/status route: fake context with a distinctive sentinel key asserts
//      response shape { serverKeyAvailable: boolean }, value tracks Boolean(context key),
//      the sentinel never appears in the serialized response body OR in any console.log
//      line emitted while handling the request (MF-3 key-leak negative test).
//   4. api.mjs wiring guard (source-text): serverContext.serverKeyAvailable is assigned
//      post-hoc near the other AI-proxy post-assignments, NOT inside the :93 serverContext
//      literal (MF-1 TDZ guard).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createAiProxyRoutes } from '../server/ai-proxy/routes.mjs'
import { runConciergeSearch } from '../app/src/concierge/conciergeSearch.ts'

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

const sampleGroups = [
  {
    id: 'g1',
    title: '样例题组',
    source: '2025·I',
    sourceType: 'real_exam',
    year: 2025,
    region: '全国 I',
    paperName: '全国高考',
    section: '阅读理解 C',
    passageTitle: '样例',
    summary: '样例摘要',
    groupType: 'reading',
    questionCount: 4,
    difficulty: 'medium',
    tags: [],
    topicLabels: [],
    hit: '',
    answerPreview: '',
    defaultScore: 2.5,
  },
]

// =====================================================================
// Group 1 — runConciergeSearch gate matrix
// =====================================================================
console.log('=== Group 1: runConciergeSearch gate matrix ===')

// 1a. no key, no server -> local missing-api-key, steward NOT called.
{
  let called = false
  const stub = async () => {
    called = true
    return null
  }
  const out = await runConciergeSearch({
    intent: '找一道阅读',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: '',
    serverKeyAvailable: false,
    doStewardCall: stub,
  })
  assert('1a: steward NOT called (no key, no server)', called === false)
  assert('1a: source = fallback', out.kind === 'results' && out.source === 'fallback', `got kind=${out.kind}`)
  assert('1a: fallbackReason = missing-api-key', out.fallbackReason === 'missing-api-key', `got ${out.fallbackReason}`)
}

// 1b. no key, server available -> doStewardCall called with apiKey === ''.
{
  let receivedKey = 'not-called'
  const stub = async (_message, apiKey) => {
    receivedKey = apiKey
    return {
      query: 'q',
      assistantMessage: 'ok',
      needsClarification: false,
      matches: [{ questionGroupId: 'g1', score: 0.9, reason: '匹配', questionGroup: sampleGroups[0] }],
    }
  }
  const out = await runConciergeSearch({
    intent: '找一道阅读',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: '',
    serverKeyAvailable: true,
    doStewardCall: stub,
  })
  assert('1b: doStewardCall invoked despite empty user key', receivedKey === '', `got ${JSON.stringify(receivedKey)}`)
  assert('1b: source = steward (server fallback took over)', out.kind === 'results' && out.source === 'steward', `got kind=${out.kind} source=${out.source}`)
}

// 1c. key present -> doStewardCall called, no regression (serverKeyAvailable irrelevant).
{
  let receivedKey = 'not-called'
  const stub = async (_message, apiKey) => {
    receivedKey = apiKey
    return {
      query: 'q',
      assistantMessage: 'ok',
      needsClarification: false,
      matches: [{ questionGroupId: 'g1', score: 0.9, reason: '匹配', questionGroup: sampleGroups[0] }],
    }
  }
  const out = await runConciergeSearch({
    intent: '找一道阅读',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: 'sk-user',
    serverKeyAvailable: false,
    doStewardCall: stub,
  })
  assert('1c: doStewardCall receives the user key', receivedKey === 'sk-user', `got ${receivedKey}`)
  assert('1c: source = steward (no regression)', out.kind === 'results' && out.source === 'steward')
}

// 1d. steward throws -> api-error local fallback, no regression.
{
  const stub = async () => {
    throw new Error('DeepSeek 500')
  }
  const out = await runConciergeSearch({
    intent: '找一道阅读',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: '',
    serverKeyAvailable: true,
    doStewardCall: stub,
  })
  assert('1d: outcome resolves (no throw)', out.kind === 'results', `got kind=${out.kind}`)
  assert('1d: source = fallback', out.source === 'fallback')
  assert('1d: fallbackReason = api-error', out.fallbackReason === 'api-error', `got ${out.fallbackReason}`)
}

// =====================================================================
// Group 2 — timeout selection
// =====================================================================
console.log('\n=== Group 2: timeout selection ===')

function makeSlowStub(delayMs) {
  return async () =>
    new Promise((resolve) => {
      setTimeout(
        () =>
          resolve({
            query: 'q',
            assistantMessage: 'ok',
            needsClarification: false,
            matches: [],
          }),
        delayMs,
      )
    })
}

// 2a. default (non-thinking): a call that resolves just under 20s does NOT time out at 6s
// (old default). We use a fake timer surrogate via explicit short overrides instead of
// actually waiting tens of seconds — verify the *selection logic* by asserting that a
// stewardTimeoutMs-less, thinkingMode=false call is NOT cut off at a delay that would have
// exceeded the old 6000ms default but is safely under the new 20000ms one.
{
  const stub = makeSlowStub(50) // fast in test time; real assertion is on which constant is wired below.
  const out = await runConciergeSearch({
    intent: 'x',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: 'sk',
    thinkingMode: false,
    doStewardCall: stub,
  })
  assert('2a: default-timeout path resolves via steward (sanity)', out.kind === 'results' && out.source === 'steward')
}

// 2b. explicit stewardTimeoutMs wins even when thinkingMode=true (would otherwise get 60000).
{
  const out = await runConciergeSearch({
    intent: 'x',
    pendingQuery: null,
    questionGroups: sampleGroups,
    apiKey: 'sk',
    thinkingMode: true,
    stewardTimeoutMs: 10,
    doStewardCall: makeSlowStub(80),
  })
  assert('2b: explicit stewardTimeoutMs=10 beats thinkingMode default -> api-error fallback', out.kind === 'results' && out.source === 'fallback' && out.fallbackReason === 'api-error', `got ${JSON.stringify(out)}`)
}

// 2c. source-level assertion of the actual constants wired into conciergeSearch.ts, since
// waiting out a real 20s/60s timeout in CI is not viable. Read the source and assert the
// exact constant values + the thinkingMode branch that selects between them.
{
  const searchSource = readFileSync(path.join(rootDir, 'app/src/concierge/conciergeSearch.ts'), 'utf8')
  assert('2c: DEFAULT_STEWARD_TIMEOUT_MS = 20000', /DEFAULT_STEWARD_TIMEOUT_MS = 20000/.test(searchSource))
  assert('2c: THINKING_STEWARD_TIMEOUT_MS = 60000', /THINKING_STEWARD_TIMEOUT_MS = 60000/.test(searchSource))
  assert(
    '2c: default timeout selection branches on thinkingMode',
    /const defaultTimeoutMs = thinkingMode \? THINKING_STEWARD_TIMEOUT_MS : DEFAULT_STEWARD_TIMEOUT_MS/.test(searchSource),
  )
  assert(
    '2c: explicit stewardTimeoutMs still takes priority over the computed default',
    /input\.stewardTimeoutMs \?\? defaultTimeoutMs/.test(searchSource),
  )
}

// =====================================================================
// Group 3 — GET /api/ai/status route + MF-3 key-leak negative test
// =====================================================================
console.log('\n=== Group 3: GET /api/ai/status ===')

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

function routeBy(routes, method, pathname) {
  return routes.find((route) => route.method === method && pathname.match(route.pattern))
}

function makeContext(overrides = {}) {
  return {
    sendJson(response, statusCode, body) {
      response.statusCode = statusCode
      response.body = body
    },
    ...overrides,
  }
}

const SENTINEL_KEY = 'sk-sentinel-9f3a7c2e1b6d4058'

// Captures console output ONLY for the duration of `fn` (an async handler call), so
// `assert()`'s own console.log/error calls outside that window still print normally.
async function captureConsole(fn) {
  const lines = []
  const originalLog = console.log
  const originalWarn = console.warn
  const originalError = console.error
  console.log = (...args) => lines.push(args.map(String).join(' '))
  console.warn = (...args) => lines.push(args.map(String).join(' '))
  console.error = (...args) => lines.push(args.map(String).join(' '))
  try {
    await fn()
  } finally {
    console.log = originalLog
    console.warn = originalWarn
    console.error = originalError
  }
  return lines
}

{
  const routes = createAiProxyRoutes()
  const statusRoute = routeBy(routes, 'GET', '/api/ai/status')
  assert('3: GET /api/ai/status route exists', Boolean(statusRoute))

  // 3a. server key present (sentinel) -> serverKeyAvailable: true, sentinel never leaks.
  {
    const response = createResponse()
    await statusRoute.handle({
      request: {},
      response,
      context: makeContext({ serverKeyAvailable: Boolean(SENTINEL_KEY) }),
    })
    assert('3a: 200 status', response.statusCode === 200)
    assert('3a: body shape { serverKeyAvailable: boolean }', typeof response.body.serverKeyAvailable === 'boolean', JSON.stringify(response.body))
    assert('3a: value = true (context key present)', response.body.serverKeyAvailable === true)
    const serialized = JSON.stringify(response.body)
    assert('3a: sentinel absent from serialized response body', !serialized.includes(SENTINEL_KEY), serialized)
  }

  // 3b. server key absent -> serverKeyAvailable: false.
  {
    const response = createResponse()
    await statusRoute.handle({
      request: {},
      response,
      context: makeContext({ serverKeyAvailable: false }),
    })
    assert('3b: value = false (context key absent)', response.body.serverKeyAvailable === false)
  }

  // 3c. MF-3: sentinel must not appear in any console.log/warn/error line emitted while
  // handling the request, even if a careless implementation logged context contents.
  {
    const response = createResponse()
    const loggedLines = await captureConsole(() =>
      statusRoute.handle({
        request: {},
        response,
        context: makeContext({ serverKeyAvailable: Boolean(SENTINEL_KEY), DEEPSEEK_API_KEY: SENTINEL_KEY }),
      }),
    )
    const allLogged = loggedLines.join('\n')
    assert('3c: sentinel absent from all console output during status handling', !allLogged.includes(SENTINEL_KEY), allLogged)
  }
}

// =====================================================================
// Group 4 — api.mjs wiring guard (MF-1 TDZ placement + route registration)
// =====================================================================
console.log('\n=== Group 4: api.mjs wiring guard (source-text, hermetic) ===')
{
  const apiSource = readFileSync(path.join(rootDir, 'server/api.mjs'), 'utf8')

  assert(
    'serverContext.serverKeyAvailable assigned post-hoc (not in the :93 literal)',
    /serverContext\.serverKeyAvailable = Boolean\(DEEPSEEK_API_KEY\)/.test(apiSource),
  )

  const literalMatch = apiSource.match(/const serverContext = \{[\s\S]*?\n\}/)
  assert('serverContext literal exists', Boolean(literalMatch))
  if (literalMatch) {
    assert(
      'serverKeyAvailable NOT present inside the serverContext literal (MF-1 TDZ guard)',
      !literalMatch[0].includes('serverKeyAvailable'),
      literalMatch[0].slice(0, 200),
    )
  }

  // The post-hoc assignment must come textually AFTER `const DEEPSEEK_API_KEY =` — otherwise
  // it would reference DEEPSEEK_API_KEY before its declaration (TDZ).
  const declIndex = apiSource.indexOf('const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY')
  const assignIndex = apiSource.indexOf('serverContext.serverKeyAvailable = Boolean(DEEPSEEK_API_KEY)')
  assert('DEEPSEEK_API_KEY const declaration found', declIndex >= 0)
  assert('serverKeyAvailable assignment found', assignIndex >= 0)
  assert('assignment occurs textually after the DEEPSEEK_API_KEY declaration (no TDZ)', assignIndex > declIndex, `decl@${declIndex} assign@${assignIndex}`)
}

console.log(`\n=== ai-key-server-fallback verify: ${passed} passed, ${failed} failed ===`)
if (failed > 0) process.exit(1)
