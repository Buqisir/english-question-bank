#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLegacyImportRoutes } from '../server/imports/legacyImportRoutes.mjs'

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
    async readJsonBody(request, options) {
      calls.push(`readJsonBody:${options?.maxBytes || 'default'}`)
      return request.body || {}
    },
    sendJson(response, statusCode, body) {
      calls.push(`sendJson:${statusCode}:${body.error || ''}`)
      response.writeHead(statusCode, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    },
    listImportFiles: () => [{ id: 'file-1' }],
    createImportFile: (input) => ({ id: 'file-created', input }),
    listImportBundles: () => [{ id: 'bundle-1' }],
    generateImportBundleDraft: (id, input) => ({ id, input }),
    generateAnswerAlignmentDraft: (id) => ({ id, kind: 'alignment' }),
    applyAnswerAlignment: (id, input) => ({ id, input, applied: true }),
    listImportBatches: () => [{ id: 'batch-1' }],
    scanImportDirectory: (input) => ({ id: 'batch-created', input }),
    runImportBatch: (id, input) => ({ id, input }),
    getImportFileParse: (id) => ({ id, kind: 'parse' }),
    parseImportFile: (id) => ({ id, parsed: true }),
    deleteImportFile: (id) => ({ id, deleted: true }),
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

console.log('H1-F verify: legacy import route extraction')

const api = read('server/api.mjs')
const routeSource = read('server/imports/legacyImportRoutes.mjs')
const verifyCi = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

assert('legacy import routes module exports createLegacyImportRoutes', /export function createLegacyImportRoutes\(\)/.test(routeSource))
assert('legacy import routes module uses minimal router helper', routeSource.includes("from '../router/index.mjs'"))
assert('legacy import routes preserve upload max body size', routeSource.includes('maxBytes: 35_000_000'))

for (const routeText of [
  '/api\\/import-files$',
  '/api\\/import-files\\/([^/]+)\\/parse$',
  '/api\\/import-bundles$',
  '/api\\/import-bundles\\/([^/]+)\\/draft$',
  '/api\\/import-bundles\\/([^/]+)\\/answer-alignment$',
  '/api\\/import-bundles\\/([^/]+)\\/answer-alignment\\/apply$',
  '/api\\/import-batches$',
  '/api\\/import-batches\\/scan$',
  '/api\\/import-batches\\/([^/]+)\\/import$',
]) {
  assert(`legacy import route registered ${routeText}`, routeSource.includes(routeText))
}

for (const errorText of [
  'Import batch not found',
  'Parsed import bundle not found',
  'Import bundle not found',
  'Import parse not found',
  'Import file not found',
]) {
  assert(`legacy import route preserves 404 text: ${errorText}`, routeSource.includes(errorText))
}

assert('api imports legacy import routes module', api.includes("from './imports/legacyImportRoutes.mjs'"))
assert('api registers legacy import routes in serverRoutes', api.includes('...createLegacyImportRoutes(),'))

for (const contextName of [
  'applyAnswerAlignment',
  'createImportFile',
  'deleteImportFile',
  'generateAnswerAlignmentDraft',
  'generateImportBundleDraft',
  'getImportFileParse',
  'listImportBatches',
  'listImportBundles',
  'listImportFiles',
  'parseImportFile',
  'runImportBatch',
  'scanImportDirectory',
]) {
  assert(`api exposes ${contextName} through context`, new RegExp(`\\b${contextName},`).test(api))
}

assert(
  'api no longer owns inline legacy import route branches',
  !api.includes("url.pathname === '/api/import-files'") &&
    !api.includes("url.pathname === '/api/import-bundles'") &&
    !api.includes("url.pathname === '/api/import-batches'") &&
    !api.includes('importFileParseMatch') &&
    !api.includes('importBatchRunMatch') &&
    !api.includes('importBundleDraftMatch') &&
    !api.includes('answerAlignmentMatch') &&
    !api.includes('answerAlignmentApplyMatch') &&
    !api.includes('deleteImportFileMatch'),
)

const routes = createLegacyImportRoutes()
assert('createLegacyImportRoutes returns twelve routes', routes.length === 12)

const listContext = makeContext()
const importFilesResponse = await dispatch(routes, 'GET', '/api/import-files', listContext)
assert('GET /api/import-files returns importFiles array', importFilesResponse.statusCode === 200 && importFilesResponse.body.includes('file-1'))

const uploadContext = makeContext()
const uploadResponse = await dispatch(routes, 'POST', '/api/import-files', uploadContext, { fileName: 'paper.docx' })
assert('POST /api/import-files returns 201', uploadResponse.statusCode === 201 && uploadResponse.body.includes('file-created'))
assert('POST /api/import-files preserves 35MB body limit', uploadContext.calls.includes('readJsonBody:35000000'))

const draftResponse = await dispatch(routes, 'POST', '/api/import-bundles/bundle%201/draft', makeContext(), { mode: 'draft' })
assert('bundle draft route decodes bundle id', draftResponse.statusCode === 200 && draftResponse.body.includes('bundle 1'))

const batch404Response = await dispatch(
  routes,
  'POST',
  '/api/import-batches/missing/import',
  makeContext({ runImportBatch: () => null }),
)
assert('missing import batch maps to 404', batch404Response.statusCode === 404 && batch404Response.body.includes('Import batch not found'))

const parse404Response = await dispatch(
  routes,
  'GET',
  '/api/import-files/missing/parse',
  makeContext({ getImportFileParse: () => null }),
)
assert('missing import parse maps to 404', parse404Response.statusCode === 404 && parse404Response.body.includes('Import parse not found'))

const parsePost404Response = await dispatch(
  routes,
  'POST',
  '/api/import-files/missing/parse',
  makeContext({ parseImportFile: () => null }),
)
assert('missing import file parse maps to 404', parsePost404Response.statusCode === 404 && parsePost404Response.body.includes('Import file not found'))

assert('verify-ci includes H1-F legacy import routes verify', verifyCi.includes('verify-h1f-legacy-import-routes.mjs'))
assert('scripts README documents H1-F legacy import routes verify', scriptsReadme.includes('verify-h1f-legacy-import-routes.mjs'))

if (failed > 0) {
  console.error(`\nH1-F legacy import routes verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH1-F legacy import routes verify passed: ${passed} passed, 0 failed`)
