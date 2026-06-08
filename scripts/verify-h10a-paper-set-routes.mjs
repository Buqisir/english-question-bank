#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPaperSetRoutes } from '../server/paper-sets/routes.mjs'
import { createQuestionGroupRoutes } from '../server/question-bank/questionGroupRoutes.mjs'
import { runRoutes } from '../server/router/index.mjs'

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

function makeContext(overrides = {}) {
  const calls = []
  return {
    calls,
    async readJsonBody(request) {
      calls.push('readJsonBody')
      return request.body || {}
    },
    sendJson(response, statusCode, body) {
      calls.push(`sendJson:${statusCode}`)
      response.writeHead(statusCode, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    },
    listPaperSets: () => [{ id: 'set-1', title: 'Set 1' }],
    listPaperWorkflowStatuses: () => [{ id: 'wf-1', status: 'ready' }],
    getPaperSet: (id) => ({ id, title: 'Found' }),
    createPaperSet: (input) => ({ id: input.id || 'set-created', input }),
    ...overrides,
  }
}

// Dispatch through the REAL runRoutes ordering so shadowing would surface.
async function dispatch(routes, method, pathname, context, body = {}) {
  const response = createResponse()
  const url = { pathname }
  const request = { method, body }
  const handled = await runRoutes(routes, { request, response, url, context })
  return { response, handled }
}

console.log('H10-A verify: paper-set route extraction')

const api = read('server/api.mjs')
const routeSource = read('server/paper-sets/routes.mjs')
const verifyCi = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

// --- Source-level invariants ---------------------------------------------
assert('paper-set routes module exports createPaperSetRoutes', /export function createPaperSetRoutes\(\)/.test(routeSource))
assert('paper-set routes module uses minimal router helper', routeSource.includes("from '../router/index.mjs'"))
assert('paper-set routes module does NOT import api.mjs (no cycle)', !routeSource.includes('api.mjs'))
assert('paper-set routes preserve 404 error text', routeSource.includes('Paper set not found'))

for (const routeText of [
  '/api\\/paper-sets$',
  '/api\\/paper-workflows$',
  '/api\\/paper-sets\\/([^/]+)$',
]) {
  assert(`paper-set route registered ${routeText}`, routeSource.includes(routeText))
}

assert('api imports paper-set routes module', api.includes("from './paper-sets/routes.mjs'"))
assert('api registers paper-set routes in serverRoutes', api.includes('...createPaperSetRoutes(),'))

for (const contextName of ['createPaperSet', 'getPaperSet', 'listPaperSets', 'listPaperWorkflowStatuses']) {
  assert(`api exposes ${contextName} through context`, new RegExp(`\\b${contextName},`).test(api))
}

assert(
  'api no longer owns inline paper-set route matcher variables',
  !api.includes("url.pathname === '/api/paper-sets'") &&
    !api.includes("url.pathname === '/api/paper-workflows'") &&
    !api.includes('paperSetMatch'),
)

// --- Route count + structure ---------------------------------------------
const routes = createPaperSetRoutes()
assert('createPaperSetRoutes returns five routes', routes.length === 5, `got ${routes.length}`)

// --- No-shadow guard ------------------------------------------------------
// Within the paper-set routes, no later route may swallow an earlier one for
// the same method+path. Cross-check the immediate serverRoutes neighbour
// (question-group routes) so a question-group pattern cannot capture a
// paper-set path or vice-versa.
function findShadow(routeList) {
  const probes = [
    ['GET', '/api/paper-sets'],
    ['GET', '/api/paper-workflows'],
    ['GET', '/api/paper-sets/set-1'],
    ['POST', '/api/paper-sets'],
    ['PUT', '/api/paper-sets/set-1'],
  ]
  for (const [method, pathname] of probes) {
    const matches = routeList.filter((route) => route.method === method && pathname.match(route.pattern))
    if (matches.length > 1) {
      return `${method} ${pathname} matched ${matches.length} routes`
    }
  }
  return null
}

assert('no paper-set route shadows another', findShadow(routes) === null, String(findShadow(routes)))
const combined = [...createQuestionGroupRoutes(), ...createPaperSetRoutes()]
assert(
  'paper-set paths are not shadowed by question-group routes (ordering safe)',
  findShadow(combined) === null,
  String(findShadow(combined)),
)

// --- Behaviour parity vs pre-cut inline blocks ---------------------------

// GET /api/paper-sets -> 200 { paperSets }
const listSets = await dispatch(routes, 'GET', '/api/paper-sets', makeContext())
assert(
  'GET /api/paper-sets returns 200 { paperSets }',
  listSets.handled &&
    listSets.response.statusCode === 200 &&
    listSets.response.body === JSON.stringify({ paperSets: [{ id: 'set-1', title: 'Set 1' }] }),
  listSets.response.body,
)

// GET /api/paper-workflows -> 200 { paperWorkflows }
const listWorkflows = await dispatch(routes, 'GET', '/api/paper-workflows', makeContext())
assert(
  'GET /api/paper-workflows returns 200 { paperWorkflows }',
  listWorkflows.handled &&
    listWorkflows.response.statusCode === 200 &&
    listWorkflows.response.body === JSON.stringify({ paperWorkflows: [{ id: 'wf-1', status: 'ready' }] }),
  listWorkflows.response.body,
)

// GET /api/paper-sets/:id present -> 200 { paperSet }
const getPresentCtx = makeContext()
const getPresent = await dispatch(routes, 'GET', '/api/paper-sets/set%201', getPresentCtx)
assert(
  'GET /api/paper-sets/:id present returns 200 { paperSet } with decoded id',
  getPresent.handled &&
    getPresent.response.statusCode === 200 &&
    getPresent.response.body === JSON.stringify({ paperSet: { id: 'set 1', title: 'Found' } }),
  getPresent.response.body,
)

// GET /api/paper-sets/:id missing -> 404 { error }
const getMissing = await dispatch(routes, 'GET', '/api/paper-sets/missing', makeContext({ getPaperSet: () => null }))
assert(
  'GET /api/paper-sets/:id missing returns 404 { error }',
  getMissing.handled &&
    getMissing.response.statusCode === 404 &&
    getMissing.response.body === JSON.stringify({ error: 'Paper set not found' }),
  getMissing.response.body,
)

// POST /api/paper-sets -> 201, calls createPaperSet(input verbatim)
const postCtx = makeContext()
const postCreate = await dispatch(routes, 'POST', '/api/paper-sets', postCtx, { title: 'Brand new' })
assert(
  'POST /api/paper-sets returns 201 (create) via createPaperSet',
  postCreate.handled &&
    postCreate.response.statusCode === 201 &&
    postCreate.response.body === JSON.stringify({ paperSet: { id: 'set-created', input: { title: 'Brand new' } } }),
  postCreate.response.body,
)
assert('POST create reads request body', postCtx.calls.includes('readJsonBody'))

// PUT /api/paper-sets/:id -> 200 (merge), calls createPaperSet({ ...input, id })
const putCtx = makeContext()
const putMerge = await dispatch(routes, 'PUT', '/api/paper-sets/set%201', putCtx, { title: 'Edited' })
assert(
  'PUT /api/paper-sets/:id returns 200 (merge) via createPaperSet with merged decoded id',
  putMerge.handled &&
    putMerge.response.statusCode === 200 &&
    putMerge.response.body ===
      JSON.stringify({ paperSet: { id: 'set 1', input: { title: 'Edited', id: 'set 1' } } }),
  putMerge.response.body,
)

// Create-vs-merge branch: POST omits id; PUT injects decoded id. Both call createPaperSet.
let createPaperSetArgs = []
const branchCtx = makeContext({ createPaperSet: (input) => { createPaperSetArgs.push(input); return { id: input.id || 'gen', input } } })
await dispatch(routes, 'POST', '/api/paper-sets', branchCtx, { title: 'p' })
await dispatch(routes, 'PUT', '/api/paper-sets/abc', branchCtx, { title: 'p' })
assert('POST-create passes input WITHOUT injected id', !('id' in createPaperSetArgs[0]))
assert('PUT-merge passes input WITH decoded id injected', createPaperSetArgs[1].id === 'abc')

// --- Registry wiring ------------------------------------------------------
assert('verify-ci includes H10-A paper-set routes verify', verifyCi.includes('verify-h10a-paper-set-routes.mjs'))
assert('scripts README documents H10-A paper-set routes verify', scriptsReadme.includes('verify-h10a-paper-set-routes.mjs'))

if (failed > 0) {
  console.error(`\nH10-A paper-set routes verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH10-A paper-set routes verify passed: ${passed} passed, 0 failed`)
