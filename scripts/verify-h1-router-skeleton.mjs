#!/usr/bin/env node
import { Readable } from 'node:stream'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

function makeRequest(method = 'GET') {
  return { method }
}

console.log('H1 verify: router skeleton')

const routerSource = read('server/router/index.mjs')
const apiSource = read('server/api.mjs')
const verifyCiSource = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

const routerModule = await import(pathToFileURL(path.join(rootDir, 'server/router/index.mjs')).href)
const exportNames = Object.keys(routerModule).sort()
assert(
  'router exports exactly three helpers',
  JSON.stringify(exportNames) === JSON.stringify(['defineRoute', 'readJsonRouteBody', 'runRoutes']),
  `exports: ${exportNames.join(', ')}`,
)

assert('defineRoute helper is exported', typeof routerModule.defineRoute === 'function')
assert('runRoutes helper is exported', typeof routerModule.runRoutes === 'function')
assert('readJsonRouteBody helper is exported', typeof routerModule.readJsonRouteBody === 'function')
assert('readJsonRouteBody preserves 1MB default', /maxBytes\s*=\s*1_000_000/.test(routerSource))

const forbiddenRouterTerms = [
  'middleware',
  'use(',
  'next(',
  'Express',
  'Fastify',
  'Hono',
  'auth',
  'group(',
  'createRouter',
]
for (const term of forbiddenRouterTerms) {
  assert(`router avoids framework concept: ${term}`, !routerSource.includes(term))
}

let handled = false
const testRoutes = [
  routerModule.defineRoute('GET', /^\/api\/health$/, ({ match, context }) => {
    handled = match[0] === '/api/health' && context.marker === 'ok'
  }),
]
assert(
  'runRoutes returns false for no match',
  (await routerModule.runRoutes(testRoutes, {
    request: makeRequest('POST'),
    response: {},
    url: new URL('http://127.0.0.1/api/health'),
    context: { marker: 'ok' },
  })) === false,
)
assert(
  'runRoutes returns true for exact method/path match',
  (await routerModule.runRoutes(testRoutes, {
    request: makeRequest('GET'),
    response: {},
    url: new URL('http://127.0.0.1/api/health'),
    context: { marker: 'ok' },
  })) === true,
)
assert('runRoutes passes match and context to handler', handled)

const emptyBody = Readable.from([])
const parsedEmpty = await routerModule.readJsonRouteBody(emptyBody)
assert('readJsonRouteBody parses empty body as object', JSON.stringify(parsedEmpty) === '{}')

const tooLarge = Readable.from(['123456'])
let tooLargeRejected = false
try {
  await routerModule.readJsonRouteBody(tooLarge, { maxBytes: 5 })
} catch (error) {
  tooLargeRejected = error instanceof Error && error.message === 'Request body too large'
}
assert('readJsonRouteBody enforces maxBytes', tooLargeRejected)

const utf8Expected = { name: '生态机器光合作用布置核查' }
const utf8Bytes = Buffer.from(JSON.stringify(utf8Expected), 'utf8')
let utf8AllSplitsOk = true
let utf8MidSeqSplits = 0
let utf8AnyUfffd = false
const UFFFD = '\uFFFD'
for (let i = 1; i < utf8Bytes.length; i += 1) {
  const splitStream = Readable.from([utf8Bytes.subarray(0, i), utf8Bytes.subarray(i)])
  const parsed = await routerModule.readJsonRouteBody(splitStream)
  if (JSON.stringify(parsed) !== JSON.stringify(utf8Expected)) utf8AllSplitsOk = false
  if (JSON.stringify(parsed).includes(UFFFD)) utf8AnyUfffd = true
  const lead = utf8Bytes[i]
  if (lead !== undefined && lead >= 0x80 && lead <= 0xbf) utf8MidSeqSplits += 1
}
assert('readJsonRouteBody decodes multi-byte UTF-8 split across chunks', utf8AllSplitsOk)
assert('readJsonRouteBody covered mid-sequence chunk splits', utf8MidSeqSplits > 0)
assert('readJsonRouteBody emits no U+FFFD on chunk-split multi-byte UTF-8', !utf8AnyUfffd)

assert('api imports router skeleton', apiSource.includes("from './router/index.mjs'"))
assert('api defines H1 route registry', /const h1Routes = \[/.test(apiSource))
assert('api moves only health route into H1 registry', /defineRoute\('GET', \/\^\\\/api\\\/health/.test(apiSource))
assert('api no longer has inline health if branch', !apiSource.includes("url.pathname === '/api/health'"))
assert('api uses server route registry', apiSource.includes('await runRoutes(serverRoutes'))
assert(
  'api uses runRoutes before remaining inline AI routes',
  apiSource.indexOf('await runRoutes(serverRoutes') < apiSource.indexOf("url.pathname === '/api/ai/verify-trace'"),
)
assert('router does not contain Draft Paper routes', !/draft-papers|my-space|paper-import|exports\/pdf/.test(routerSource))
assert('verify-ci includes H1 router skeleton verify', verifyCiSource.includes('verify-h1-router-skeleton.mjs'))
assert('scripts README documents H1 router skeleton verify', scriptsReadme.includes('verify-h1-router-skeleton.mjs'))

if (failed > 0) {
  console.error(`\nH1 router skeleton verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH1 router skeleton verify passed: ${passed} passed, 0 failed`)
