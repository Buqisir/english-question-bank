#!/usr/bin/env node
// Verifies the POST /api/draft-papers/:id/print-pdf error classifier (and its
// parity with the sibling GET /api/draft-papers/:id/pagination route).
//
// Before the fix, the print-pdf catch block mapped ANY thrown error whose
// message contained the substring "not found" to 503 "精排 PDF 不可用". The
// per-item data error `questionGroupId not found: <id>` (thrown by
// resolveDraftExportItems in draftPaperStore.mjs when getQuestionGroupDetail
// returns null, e.g. under the identityConflict fail-closed state) contains
// that substring and so was misclassified as 503, while the sibling pagination
// route — calling the same getDraftPaperPagination — mapped the identical
// throw to 400 via sendDraftMutationError.
//
// The fix replaces substring classification with a typed error code
// (`error.code === 'RENDERER_MISSING'`) for the renderer-unavailable lane,
// shared by both routes through sendDraftMutationError: 404 for
// NOT_FOUND_MESSAGES, 503 for RENDERER_MISSING/ENOENT, 400 for everything
// else (incl. the data error).
//
// This script is hermetic: it imports createDraftPaperRoutes and invokes the
// route handlers directly with a stubbed context.draftPaperStore that throws
// the exact error shapes the real export path throws. No HTTP server, no
// Chromium, no paper-asset store. Run: `node scripts/verify-print-pdf-error-classification.mjs`.

import { createDraftPaperRoutes } from '../server/draft-paper/draftPaperRoutes.mjs'

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

function findRoute(routes, method, pathname) {
  return routes.find((route) => route.method === method && pathname.match(route.pattern))
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

// Build a stub handler invocation context. `storeThrows` is a function that
// throws the error shape under test (called as exportDraftPaperPdf /
// getDraftPaperPagination). The stub faithfully reproduces the real throw
// sites: resolveDraftExportItems throws a plain Error (no `code`), while
// resolvePagedjsPolyfillPath / chromium.launch set `error.code = 'RENDERER_MISSING'`.
function createContext(storeThrows) {
  return {
    resolveDataUserId() {
      return 'user-self'
    },
    async readJsonBody() {
      return { versionType: 'student' }
    },
    sendJson(response, statusCode, body) {
      response.writeHead(statusCode)
      response.end(JSON.stringify(body))
    },
    sendPdf(response, body) {
      response.writeHead(200)
      response.end(body)
    },
    draftPaperStore: {
      async exportDraftPaperPdf() {
        storeThrows()
      },
      async getDraftPaperPagination() {
        storeThrows()
      },
    },
  }
}

function decodeBody(response) {
  if (response.body == null) return null
  try {
    return JSON.parse(response.body)
  } catch {
    return null
  }
}

const routes = createDraftPaperRoutes()
const printPdfPath = '/api/draft-papers/draft-conflicted-asset/print-pdf'
const paginationPath = '/api/draft-papers/draft-conflicted-asset/pagination'
const printPdfRoute = findRoute(routes, 'POST', printPdfPath)
const paginationRoute = findRoute(routes, 'GET', paginationPath)

assert('print-pdf route is registered', Boolean(printPdfRoute))
assert('pagination route is registered', Boolean(paginationRoute))

async function runPrintPdf(storeThrows) {
  const response = createResponse()
  const context = createContext(storeThrows)
  const match = printPdfPath.match(printPdfRoute.pattern)
  const url = new URL(`http://localhost${printPdfPath}`)
  await printPdfRoute.handle({ request: {}, response, url, match, context })
  return response
}

async function runPagination(storeThrows) {
  const response = createResponse()
  const context = createContext(storeThrows)
  const match = paginationPath.match(paginationRoute.pattern)
  const url = new URL(`http://localhost${paginationPath}?versionType=student`)
  await paginationRoute.handle({ request: {}, response, url, match, context })
  return response
}

console.log('print-pdf error classification verify')

// --- Case A: the per-item data error "questionGroupId not found: <id>" -----
// Faithfully reproduces resolveDraftExportItems (draftPaperStore.mjs:764): a
// plain Error with no `code`. Before the fix this hit
// `message.includes('not found')` → 503 (the bug). After the fix it has no
// RENDERER_MISSING code and no ENOENT, so it falls through to 400.
const dataErrorThrow = () => {
  throw new Error('questionGroupId not found: g-conflicted-asset')
}

const caseA = await runPrintPdf(dataErrorThrow)
const caseABody = decodeBody(caseA)
assert(
  'A. print-pdf maps "questionGroupId not found" data error to 400 (bug fixed)',
  caseA.statusCode === 400,
  `expected 400, got ${caseA.statusCode} body=${JSON.stringify(caseABody)}`,
)
assert(
  'A. response body carries the data-error message unchanged',
  caseABody?.error === 'questionGroupId not found: g-conflicted-asset',
  `body=${JSON.stringify(caseABody)}`,
)

// --- Case B: sibling parity — the SAME throw via the pagination route -------
// The pagination route always classified via sendDraftMutationError (400 for
// this throw). The fix makes print-pdf use the same helper, so both routes
// now agree.
const caseB = await runPagination(dataErrorThrow)
assert(
  'B. pagination maps the SAME throw to 400 (sibling parity)',
  caseB.statusCode === 400,
  `expected 400, got ${caseB.statusCode}`,
)
assert(
  'B. pagination & print-pdf see the same throw and agree on status',
  caseA.statusCode === caseB.statusCode,
  `print-pdf=${caseA.statusCode} pagination=${caseB.statusCode}`,
)

// --- Case C: renderer-missing lane must stay 503 (regression guard) --------
// Faithfully reproduces resolvePagedjsPolyfillPath (paginationRenderer.mjs)
// AFTER the fix: the message still says "pagedjs polyfill not found (...)" but
// the error now carries `code === 'RENDERER_MISSING'`. Without the typed code
// this would wrongly fall through to 400 — this case is the guard against
// that regression.
const rendererMissingThrow = () => {
  const error = new Error(
    'pagedjs polyfill not found (dist/paged.polyfill.js in any of the usual node_modules locations). ' +
      'Install with: npm install pagedjs --prefix server',
  )
  error.code = 'RENDERER_MISSING'
  throw error
}

const caseC = await runPrintPdf(rendererMissingThrow)
const caseCBody = decodeBody(caseC)
assert(
  'C. print-pdf maps legitimate RENDERER_MISSING "pagedjs polyfill not found" to 503',
  caseC.statusCode === 503,
  `expected 503, got ${caseC.statusCode} body=${JSON.stringify(caseCBody)}`,
)
assert(
  'C. 503 body keeps the 精排 PDF 不可用 envelope + root-cause message',
  typeof caseCBody?.error === 'string' &&
    caseCBody.error.startsWith('精排 PDF 不可用: ') &&
    caseCBody.error.includes('pagedjs polyfill not found'),
  `body=${JSON.stringify(caseCBody)}`,
)

// --- Case D: Chromium launch failure (ENOENT-style) stays 503 ---------------
// Reproduces the chromium.launch wrapper (chromiumPool.mjs) after the fix: a
// launch failure is rethrown with `code === 'RENDERER_MISSING'`.
const chromiumLaunchThrow = () => {
  const error = new Error('chromium channel: executable not found at /path/to/chromium')
  error.code = 'RENDERER_MISSING'
  throw error
}

const caseD = await runPrintPdf(chromiumLaunchThrow)
assert(
  'D. print-pdf maps chromium launch failure (RENDERER_MISSING) to 503',
  caseD.statusCode === 503,
  `expected 503, got ${caseD.statusCode}`,
)

// --- Case E: raw ENOENT fallback still 503 ---------------------------------
// A filesystem ENOENT from the renderer toolchain that escaped the typed-code
// wrappers (e.g. a polyfill file that vanished between resolve and
// addScriptTag) is still classified as renderer-missing via the ENOENT
// fallback in sendDraftMutationError.
const enoentThrow = () => {
  const error = new Error("ENOENT: no such file or directory, open '/srv/paged.polyfill.js'")
  error.code = 'ENOENT'
  throw error
}

const caseE = await runPrintPdf(enoentThrow)
assert(
  'E. print-pdf maps a raw ENOENT (renderer toolchain) to 503',
  caseE.statusCode === 503,
  `expected 503, got ${caseE.statusCode}`,
)

// --- Case F: baseline non-"not found" throw stays 400 -----------------------
// A validation-style throw with no "not found" substring and no renderer
// code is unaffected by the fix (it always was 400).
const validationThrow = () => {
  throw new Error('请先添加题组')
}

const caseF = await runPrintPdf(validationThrow)
assert(
  'F. print-pdf maps a non-"not found" throw to 400 (baseline unaffected)',
  caseF.statusCode === 400,
  `expected 400, got ${caseF.statusCode}`,
)

// --- Case G: draft-not-found sentinel stays 404 on both routes -------------
// NOT_FOUND_MESSAGES carve-out: "Draft paper not found" is a draft-level
// sentinel that must 404, not 503/400 — the M0-4 carve-out preserved by the
// fix on both routes.
const draftNotFoundThrow = () => {
  throw new Error('Draft paper not found')
}

const caseGPrint = await runPrintPdf(draftNotFoundThrow)
const caseGPage = await runPagination(draftNotFoundThrow)
assert(
  'G. print-pdf maps "Draft paper not found" sentinel to 404',
  caseGPrint.statusCode === 404,
  `expected 404, got ${caseGPrint.statusCode}`,
)
assert(
  'G. pagination maps "Draft paper not found" sentinel to 404 (parity)',
  caseGPage.statusCode === 404,
  `expected 404, got ${caseGPage.statusCode}`,
)

// --- Case H: "Draft item not found" sentinel stays 404 ---------------------
const draftItemNotFoundThrow = () => {
  throw new Error('Draft item not found')
}

const caseH = await runPrintPdf(draftItemNotFoundThrow)
assert(
  'H. print-pdf maps "Draft item not found" sentinel to 404',
  caseH.statusCode === 404,
  `expected 404, got ${caseH.statusCode}`,
)

// --- Case I: pagination route also classifies RENDERER_MISSING as 503 -------
// Confirms the shared classifier keeps the sibling route consistent for the
// renderer-missing lane too (defense-in-depth: both routes agree).
const caseI = await runPagination(rendererMissingThrow)
assert(
  'I. pagination maps RENDERER_MISSING to 503 (shared classifier, both lanes agree)',
  caseI.statusCode === 503,
  `expected 503, got ${caseI.statusCode}`,
)

if (failed > 0) {
  console.error(`\nprint-pdf error classification verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nprint-pdf error classification verify passed: ${passed} passed, 0 failed`)
