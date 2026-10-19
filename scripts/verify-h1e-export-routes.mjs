#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExportRoutes } from '../server/exports/exportRoutes.mjs'

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
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
    },
    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      Object.assign(this.headers, headers)
    },
    end(body) {
      this.body = body
    },
  }
}

function routeByPath(routes, pathname, method = 'POST') {
  return routes.find((route) => route.method === method && pathname.match(route.pattern))
}

console.log('H1-E verify: export route extraction')

const api = read('server/api.mjs')
const routeSource = read('server/exports/exportRoutes.mjs')
const verifyCi = read('scripts/verify-ci.mjs')
const scriptsReadme = read('scripts/README.md')

assert('export routes module exports createExportRoutes', /export function createExportRoutes\([^)]*\)/.test(routeSource))
assert('export routes module uses minimal router helper', routeSource.includes("from '../router/index.mjs'"))
assert('generated DOCX export route is absent', !routeSource.includes('/api\\/exports\\/docx$'))
assert('obsolete DOCX-converted PDF route is absent', !routeSource.includes('/api\\/exports\\/pdf$'))
assert('Print HTML/PDF share the product route', routeSource.includes('/api\\/exports\\/print-(html|pdf)$'))
assert('product renderer errors use the typed unavailable signal', routeSource.includes("error?.code === 'RENDERER_MISSING' ? 503 : 400"))

assert('api imports export implementation module', api.includes("from './exports/exportImplementation.mjs'"))
assert('api imports export routes module', api.includes("from './exports/exportRoutes.mjs'"))
assert('api registers export routes with implementation', api.includes('...createExportRoutes(exportImplementation),'))
assert('api no longer exposes sendDocx through context', !api.includes('sendDocx,'))
assert('api no longer exposes exportDocx through context', !api.includes('exportDocx,'))
assert('api no longer exposes exportPdf through context', !api.includes('exportPdf,'))
assert('api no longer exposes exportPrintHtml through context', !api.includes('exportPrintHtml,'))
assert('api no longer exposes exportPrintPdf through context', !api.includes('exportPrintPdf,'))
assert('api no longer owns export implementation', !/function exportDocx\(input\)/.test(api) && !/function exportPrintPdf\(input\)/.test(api))
assert('api no longer owns inline export route branches', !api.includes("url.pathname === '/api/exports/docx'") && !api.includes("url.pathname === '/api/exports/pdf'") && !api.includes("url.pathname === '/api/exports/print-html'") && !api.includes("url.pathname === '/api/exports/print-pdf'"))

const implementation = {
  sendPdf(response, body, fileName, outputPath) {
    calls.push(`sendPdf:${fileName}:${outputPath}:${body.toString()}`)
    response.writeHead(200, { 'content-type': 'pdf' })
    response.end(body)
  },
}

const routes = createExportRoutes(implementation)
assert('createExportRoutes returns the supported Print, product inventory and companion-analysis routes', routes.length === 5)
for (const [method, pathname] of [
  ['POST', '/api/exports/companion-analysis-html'],
  ['POST', '/api/exports/companion-analysis-pdf'],
  ['POST', '/api/exports/print-html'],
  ['POST', '/api/exports/print-pdf'],
  ['GET', '/api/exports/papers/paper-test/products'],
  ['GET', '/api/exports/papers/paper-test/pdf'],
  ['HEAD', '/api/exports/papers/paper-test/pdf'],
  ['GET', '/api/exports/papers/paper-test/print'],
  ['HEAD', '/api/exports/papers/paper-test/print'],
]) {
  assert(`${method} ${pathname} selects exactly one supported route`,
    routes.filter(route => route.method === method && route.pattern.test(pathname)).length === 1)
}

const inventoryPath = '/api/exports/papers/paper%3Atest/products'
const inventoryRoute = routeByPath(routes, inventoryPath, 'GET')
assert('product inventory is available to authenticated members', inventoryRoute.ownerOnly === false)
for (const method of ['HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']) {
  assert(`product inventory does not accept ${method}`, routeByPath(routes, inventoryPath, method) === undefined)
}
const inventory = { editions: ['largeNoListening', 'economy8', 'answerOnly'] }
const inventoryResponse = createResponse()
const inventoryUrl = new URL(`http://127.0.0.1${inventoryPath}?publicationDigest=sha256%3Apublication`)
const inventoryContext = {
  sendJson(response, statusCode, body) {
    response.writeHead(statusCode, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  },
  draftPaperStore: {
    async getPublishedPaperProductInventory(paperId, publicationDigest) {
      assert('product inventory delegates decoded identity and exact publication digest',
        paperId === 'paper:test' && publicationDigest === 'sha256:publication')
      return inventory
    },
  },
}
await inventoryRoute.handle({ response: inventoryResponse, url: inventoryUrl,
  match: inventoryPath.match(inventoryRoute.pattern), context: inventoryContext })
assert('product inventory returns the published inventory', inventoryResponse.statusCode === 200
  && inventoryResponse.body === JSON.stringify(inventory))
assert('product inventory response is private and never cached',
  inventoryResponse.headers['cache-control'] === 'private, no-store')
const invalidInventoryResponse = createResponse()
await inventoryRoute.handle({ response: invalidInventoryResponse, url: inventoryUrl,
  match: inventoryPath.match(inventoryRoute.pattern), context: { ...inventoryContext,
    draftPaperStore: { getPublishedPaperProductInventory() { throw new Error('Publication changed') } },
  } })
assert('product inventory rejects a stale publication with 409', invalidInventoryResponse.statusCode === 409
  && JSON.parse(invalidInventoryResponse.body).error === 'Publication changed')

const input = { title: 'test', edition: 'largeNoListening', items: [{ questionGroupId: 'group-1' }] }
const request = { method: 'POST' }
let readCount = 0
const calls = []
const context = {
  async readJsonBody(receivedRequest) {
    readCount += 1
    assert('route passes request into readJsonBody', receivedRequest === request)
    return input
  },
  sendJson(response, statusCode, body) {
    calls.push(`sendJson:${statusCode}:${body.error || ''}`)
    response.writeHead(statusCode, { 'content-type': 'application/json' })
    response.end(JSON.stringify(body))
  },
  draftPaperStore: {
    async getAssemblyPaperProduct(receivedInput) {
      assert('route delegates the exact assembly input to product rendering', receivedInput === input)
      return { draftPaper: { title: 'test' }, paginatedHtml: '<html></html>', pdfBytes: Buffer.from('%PDF-fixture') }
    },
  },
}

assert('generated DOCX route cannot be selected', routeByPath(routes, '/api/exports/docx') === undefined)
assert('obsolete DOCX-converted PDF route cannot be selected', routeByPath(routes, '/api/exports/pdf') === undefined)

const htmlResponse = createResponse()
const htmlRoute = routeByPath(routes, '/api/exports/print-html')
await htmlRoute.handle({ request, response: htmlResponse, context, match: '/api/exports/print-html'.match(htmlRoute.pattern) })
assert('print-html route sends html response', htmlResponse.statusCode === 200 && htmlResponse.body === '<html></html>')
assert('print-html route preserves content type', htmlResponse.headers['content-type'] === 'text/html; charset=utf-8')
assert('print-html route names the selected product', htmlResponse.headers['x-file-name'] === encodeURIComponent('test-大字无听力版.html'))

const printPdfResponse = createResponse()
const pdfRoute = routeByPath(routes, '/api/exports/print-pdf')
const pdfMatch = '/api/exports/print-pdf'.match(pdfRoute.pattern)
await pdfRoute.handle({ request, response: printPdfResponse, context, match: pdfMatch })
assert('print-pdf sends the same product renderer bytes', printPdfResponse.statusCode === 200 && printPdfResponse.body.toString() === '%PDF-fixture')
const unavailableResponse = createResponse()
await pdfRoute.handle({ request, response: unavailableResponse, context: { ...context,
  draftPaperStore: { getAssemblyPaperProduct() { throw Object.assign(new Error('Chromium unavailable'), { code: 'RENDERER_MISSING' }) } },
}, match: pdfMatch })
assert('print-pdf maps typed renderer unavailability to 503', unavailableResponse.statusCode === 503 && String(unavailableResponse.body).includes('Chromium unavailable'))
assert('routes parsed JSON once per request', readCount === 3)

assert('verify-ci includes H1-E export routes verify', verifyCi.includes('verify-h1e-export-routes.mjs'))
assert('scripts README documents H1-E export routes verify', scriptsReadme.includes('verify-h1e-export-routes.mjs'))

if (failed > 0) {
  console.error(`\nH1-E export routes verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nH1-E export routes verify passed: ${passed} passed, 0 failed`)
