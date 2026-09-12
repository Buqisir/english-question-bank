#!/usr/bin/env node
// Verifies the missing-figure-file classification fix for the three draft-paper
// render routes that share the server-side paged.js/Chromium render path:
//   POST /:id/print-pdf, GET /:id/pagination, GET /:id/reorder-suggestion
//
// Before the fix, `inlineFigureImages` (server/draft-paper/draftPaperStore.mjs)
// did an unguarded `readFileSync(image.absoluteSourcePath)`. When a figure file
// referenced by figures/manifest.json was absent on disk, that threw a raw Node
// ENOENT (error.code === 'ENOENT', message starting 'ENOENT:'). The shared route
// classifier `sendDraftMutationError` (server/draft-paper/draftPaperRoutes.mjs)
// has a `message.includes('ENOENT')` fallback (added by 359b0bc6) that maps ANY
// ENOENT-bearing message to HTTP 503 "精排 PDF 不可用" (renderer unavailable) —
// but a missing figure file is a paper-assets DATA error, not a renderer
// condition. Before 359b0bc6 the pagination and reorder-suggestion routes mapped
// this same throw to 400; the over-broad ENOENT lane silently regressed them to
// 503.
//
// The fix guards `inlineFigureImages` with `existsSync`: a missing figure now
// throws a typed `FIGURE_ASSET_MISSING` error (message `Figure asset not found:
// <absoluteSourcePath>`, no 'ENOENT' token), which the classifier routes to 400.
// The renderer-toolchain ENOENT fallback still catches genuine polyfill/chromium
// filesystem ENOENTs as 503.
//
// This script is hermetic: it imports the REAL `inlineFigureImages` (the fixed
// throw site) and the REAL `createDraftPaperRoutes` (the real route handlers +
// the real sendDraftMutationError classifier), invoked directly with a stubbed
// context.draftPaperStore that rethrows the exact error the real throw site
// produces. No HTTP server, no Chromium, no paper-asset store. It drives the
// real readFileSync on a non-existent path to document the raw-ENOENT behavior
// the guard now precedes.
// Run: `node scripts/verify-inline-figure-enoent-classification.mjs`.

import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { inlineFigureImages } from '../server/draft-paper/draftPaperStore.mjs'
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
// getDraftPaperPagination / getReorderSuggestion). The stub faithfully
// reproduces how the real throw site propagates: inlineFigureImages throws an
// Error carrying `code === 'FIGURE_ASSET_MISSING'` (after the fix), while the
// renderer-toolchain sites throw errors carrying `code === 'RENDERER_MISSING'`
// or a raw Node ENOENT carrying `code === 'ENOENT'`.
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
      async getReorderSuggestion() {
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
const printPdfPath = '/api/draft-papers/draft-missing-figure/print-pdf'
const paginationPath = '/api/draft-papers/draft-missing-figure/pagination'
const reorderPath = '/api/draft-papers/draft-missing-figure/reorder-suggestion'
const printPdfRoute = findRoute(routes, 'POST', printPdfPath)
const paginationRoute = findRoute(routes, 'GET', paginationPath)
const reorderRoute = findRoute(routes, 'GET', reorderPath)

assert('print-pdf route is registered', Boolean(printPdfRoute))
assert('pagination route is registered', Boolean(paginationRoute))
assert('reorder-suggestion route is registered', Boolean(reorderRoute))

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

async function runReorder(storeThrows) {
  const response = createResponse()
  const context = createContext(storeThrows)
  const match = reorderPath.match(reorderRoute.pattern)
  const url = new URL(`http://localhost${reorderPath}?versionType=student`)
  await reorderRoute.handle({ request: {}, response, url, match, context })
  return response
}

console.log('inline-figure ENOENT classification verify')

// --- §1: the real readFileSync throw site the guard now precedes -------------
// A bare readFileSync on a non-existent path throws a raw Node ENOENT — this is
// the exact throw the unguarded inlineFigureImages used to surface, and the
// error shape the renderer-toolchain ENOENT fallback in sendDraftMutationError
// is meant to catch. The fix adds an existsSync gate in front of this read so
// the figure-file branch never reaches readFileSync for a missing file.
const missingFigurePath = path.join(os.tmpdir(), `eqb-missing-figure-${randomUUID()}`, 'figure.png')

let rawEnoent = null
try {
  readFileSync(missingFigurePath)
} catch (error) {
  rawEnoent = error
}
assert(
  '§1. real readFileSync on a missing figure path throws a raw ENOENT',
  rawEnoent instanceof Error && rawEnoent.code === 'ENOENT' && String(rawEnoent.message).startsWith('ENOENT:'),
  `got code=${rawEnoent?.code} message=${JSON.stringify(rawEnoent?.message)}`,
)
assert(
  '§1. the raw ENOENT message includes the missing figure path',
  rawEnoent && String(rawEnoent.message).includes(missingFigurePath),
  `message=${JSON.stringify(rawEnoent?.message)}`,
)

// --- §2: the fixed throw site — real inlineFigureImages on a missing figure ---
// Faithfully exercises the REAL inlineFigureImages (exported for testability)
// with the same { relativeName, absoluteSourcePath } shape figureImageSrc
// (server/print-renderer.mjs) populates. Before the fix this threw the raw
// ENOENT captured above; after the fix it throws a typed FIGURE_ASSET_MISSING
// data error whose message carries the missing path but contains no 'ENOENT'
// token, so the classifier falls through to 400 instead of the 503 lane.
const figureHtml = `<figure class="print-figure"><img src="fig-1.png" alt="fig-1"></figure>`
const figureImages = [{ relativeName: 'fig-1.png', absoluteSourcePath: missingFigurePath }]

let figureError = null
try {
  inlineFigureImages(figureHtml, figureImages)
} catch (error) {
  figureError = error
}
assert(
  '§2. inlineFigureImages throws on a missing figure file',
  figureError instanceof Error,
  `got ${figureError}`,
)
assert(
  '§2. the thrown error carries code === "FIGURE_ASSET_MISSING" (typed data error)',
  figureError?.code === 'FIGURE_ASSET_MISSING',
  `got code=${JSON.stringify(figureError?.code)}`,
)
assert(
  '§2. the thrown error message is "Figure asset not found: <absoluteSourcePath>"',
  figureError?.message === `Figure asset not found: ${missingFigurePath}`,
  `got message=${JSON.stringify(figureError?.message)}`,
)
assert(
  '§2. the thrown error message does NOT contain the ENOENT token (classifier won\'t match the 503 lane)',
  figureError && !figureError.message.includes('ENOENT'),
  `message=${JSON.stringify(figureError?.message)}`,
)
assert(
  '§2. the thrown error is not a Node fs ENOENT (no error.code === "ENOENT")',
  figureError?.code !== 'ENOENT',
  `got code=${JSON.stringify(figureError?.code)}`,
)
assert(
  '§2. the missing figure path is preserved in the error message (root cause not lost)',
  figureError && figureError.message.includes(missingFigurePath),
  `message=${JSON.stringify(figureError?.message)}`,
)

// --- §3: the real sendDraftMutationError classifier routes FIGURE_ASSET_MISSING
// to 400 on ALL three render routes (print-pdf, pagination, reorder-suggestion).
// This is the bug fixed: before the fix the same throw (then a raw ENOENT) landed
// in the 503 "精排 PDF 不可用" lane on all three routes (print-pdf always; the
// pagination and reorder-suggestion routes regressed from 400 to 503 by 359b0bc6).
const figureMissingThrow = () => {
  throw Object.assign(new Error(`Figure asset not found: ${missingFigurePath}`), { code: 'FIGURE_ASSET_MISSING' })
}

const case3Print = await runPrintPdf(figureMissingThrow)
const case3PrintBody = decodeBody(case3Print)
assert(
  '§3a. print-pdf classifies the inlineFigureImages missing-figure error as 400 (bug fixed)',
  case3Print.statusCode === 400,
  `expected 400, got ${case3Print.statusCode} body=${JSON.stringify(case3PrintBody)}`,
)
assert(
  '§3a. print-pdf 400 body carries the data-error message unchanged (no 精排 PDF 不可用 envelope)',
  case3PrintBody?.error === `Figure asset not found: ${missingFigurePath}`,
  `body=${JSON.stringify(case3PrintBody)}`,
)

const case3Page = await runPagination(figureMissingThrow)
const case3PageBody = decodeBody(case3Page)
assert(
  '§3b. pagination classifies the inlineFigureImages missing-figure error as 400 (regression from pre-359b0bc6 400 fixed)',
  case3Page.statusCode === 400,
  `expected 400, got ${case3Page.statusCode} body=${JSON.stringify(case3PageBody)}`,
)
assert(
  '§3b. pagination 400 body carries the data-error message unchanged (no 精排 PDF 不可用 envelope)',
  case3PageBody?.error === `Figure asset not found: ${missingFigurePath}`,
  `body=${JSON.stringify(case3PageBody)}`,
)

const case3Reorder = await runReorder(figureMissingThrow)
const case3ReorderBody = decodeBody(case3Reorder)
assert(
  '§3c. reorder-suggestion classifies the inlineFigureImages missing-figure error as 400 (regression from pre-359b0bc6 400 fixed)',
  case3Reorder.statusCode === 400,
  `expected 400, got ${case3Reorder.statusCode} body=${JSON.stringify(case3ReorderBody)}`,
)
assert(
  '§3c. reorder-suggestion 400 body carries the data-error message unchanged (no 精排 PDF 不可用 envelope)',
  case3ReorderBody?.error === `Figure asset not found: ${missingFigurePath}`,
  `body=${JSON.stringify(case3ReorderBody)}`,
)

assert(
  '§3d. all three render routes agree on 400 for the missing-figure error (route-family parity)',
  case3Print.statusCode === 400 && case3Page.statusCode === 400 && case3Reorder.statusCode === 400,
  `print-pdf=${case3Print.statusCode} pagination=${case3Page.statusCode} reorder=${case3Reorder.statusCode}`,
)

// --- §4: regression — genuine renderer-toolchain ENOENT stays 503 on all three
// routes. The fix narrows the figure-file throw to a typed data error; it does
// NOT touch the sendDraftMutationError `message.includes('ENOENT')` fallback,
// so a genuine polyfill/chromium filesystem ENOENT (error.code === 'ENOENT')
// is still classified as renderer-unavailable 503 with the 精排 PDF 不可用
// envelope on every render route.
const enoentThrow = () => {
  const error = new Error(`ENOENT: no such file or directory, open '${missingFigurePath}'`)
  error.code = 'ENOENT'
  throw error
}

const case4Print = await runPrintPdf(enoentThrow)
assert(
  '§4a. print-pdf maps a raw renderer-toolchain ENOENT to 503 (regression guard)',
  case4Print.statusCode === 503,
  `expected 503, got ${case4Print.statusCode}`,
)
const case4PrintBody = decodeBody(case4Print)
assert(
  '§4a. print-pdf 503 body keeps the 精排 PDF 不可用 envelope + ENOENT root-cause message',
  typeof case4PrintBody?.error === 'string' &&
    case4PrintBody.error.startsWith('精排 PDF 不可用: ') &&
    case4PrintBody.error.includes('ENOENT'),
  `body=${JSON.stringify(case4PrintBody)}`,
)

const case4Page = await runPagination(enoentThrow)
assert(
  '§4b. pagination maps a raw renderer-toolchain ENOENT to 503 (regression guard)',
  case4Page.statusCode === 503,
  `expected 503, got ${case4Page.statusCode}`,
)
const case4PageBody = decodeBody(case4Page)
assert(
  '§4b. pagination 503 body keeps the 精排 PDF 不可用 envelope + ENOENT root-cause message',
  typeof case4PageBody?.error === 'string' &&
    case4PageBody.error.startsWith('精排 PDF 不可用: ') &&
    case4PageBody.error.includes('ENOENT'),
  `body=${JSON.stringify(case4PageBody)}`,
)

const case4Reorder = await runReorder(enoentThrow)
assert(
  '§4c. reorder-suggestion maps a raw renderer-toolchain ENOENT to 503 (regression guard)',
  case4Reorder.statusCode === 503,
  `expected 503, got ${case4Reorder.statusCode}`,
)
const case4ReorderBody = decodeBody(case4Reorder)
assert(
  '§4c. reorder-suggestion 503 body keeps the 精排 PDF 不可用 envelope + ENOENT root-cause message',
  typeof case4ReorderBody?.error === 'string' &&
    case4ReorderBody.error.startsWith('精排 PDF 不可用: ') &&
    case4ReorderBody.error.includes('ENOENT'),
  `body=${JSON.stringify(case4ReorderBody)}`,
)

assert(
  '§4d. FIGURE_ASSET_MISSING (400) and raw ENOENT (503) are classified differently on every route',
  case3Print.statusCode === 400 && case4Print.statusCode === 503 &&
    case3Page.statusCode === 400 && case4Page.statusCode === 503 &&
    case3Reorder.statusCode === 400 && case4Reorder.statusCode === 503,
  `print-pdf: ${case3Print.statusCode}/${case4Print.statusCode}, pagination: ${case3Page.statusCode}/${case4Page.statusCode}, reorder: ${case3Reorder.statusCode}/${case4Reorder.statusCode}`,
)

// --- §5: regression — the other classifier lanes are unaffected by the fix ---
// RENDERER_MISSING stays 503, the per-item "questionGroupId not found" data
// error stays 400, "Draft paper not found" stays 404, and a plain validation
// error stays 400 — across the render routes. These guard against the fix
// accidentally widening or narrowing any lane.
const rendererMissingThrow = () => {
  const error = new Error(
    'pagedjs polyfill not found (dist/paged.polyfill.js in any of the usual node_modules locations). ' +
      'Install with: npm install pagedjs --prefix server',
  )
  error.code = 'RENDERER_MISSING'
  throw error
}

const r5Print = await runPrintPdf(rendererMissingThrow)
assert(
  '§5a. print-pdf maps RENDERER_MISSING to 503 (renderer lane intact)',
  r5Print.statusCode === 503,
  `expected 503, got ${r5Print.statusCode}`,
)

const dataErrorThrow = () => {
  throw new Error('questionGroupId not found: g-missing-figure')
}

const r5Page = await runPagination(dataErrorThrow)
assert(
  '§5b. pagination maps "questionGroupId not found" data error to 400 (data lane intact)',
  r5Page.statusCode === 400,
  `expected 400, got ${r5Page.statusCode}`,
)

const draftNotFoundThrow = () => {
  throw new Error('Draft paper not found')
}

const r5Reorder = await runReorder(draftNotFoundThrow)
assert(
  '§5c. reorder-suggestion maps "Draft paper not found" sentinel to 404 (not-found lane intact)',
  r5Reorder.statusCode === 404,
  `expected 404, got ${r5Reorder.statusCode}`,
)

const validationThrow = () => {
  throw new Error('请先添加题组')
}

const r5v = await runPrintPdf(validationThrow)
assert(
  '§5d. print-pdf maps a plain validation error to 400 (validation lane intact)',
  r5v.statusCode === 400,
  `expected 400, got ${r5v.statusCode}`,
)

// --- §6: a missing figure in a multi-figure pass throws before any read -------
// Confirms the existsSync gate fires on the FIRST missing entry (so no partial
// inlining of earlier figures leaks through), and throws the typed data error.
// The first figure is a REAL file on disk (so the loop inlines it and advances);
// the second is absent, so the gate throws FIGURE_ASSET_MISSING on entry 2.
const presentPath = path.join(os.tmpdir(), `eqb-present-figure-${randomUUID()}.png`)
writeFileSync(presentPath, Buffer.from('89504e470d0a1a0a', 'hex'))
const secondMissingPath = path.join(os.tmpdir(), `eqb-missing-figure-${randomUUID()}`, 'second.png')
const multiHtml = `<img src="fig-1.png"><img src="fig-2.png">`
const multiImages = [
  { relativeName: 'fig-1.png', absoluteSourcePath: presentPath },
  { relativeName: 'fig-2.png', absoluteSourcePath: secondMissingPath },
]

let multiError = null
try {
  inlineFigureImages(multiHtml, multiImages)
} catch (error) {
  multiError = error
}
assert(
  '§6. inlineFigureImages throws FIGURE_ASSET_MISSING for a missing figure in a multi-figure pass',
  multiError?.code === 'FIGURE_ASSET_MISSING' && multiError?.message === `Figure asset not found: ${secondMissingPath}`,
  `got code=${JSON.stringify(multiError?.code)} message=${JSON.stringify(multiError?.message)}`,
)

// --- §7: happy path — a present figure still inlines as a base64 data URI ------
// Regression guard: the existsSync gate must NOT change the successful inlining
// path. A real on-disk PNG is inlined as a `data:image/png;base64,...` URI, the
// bare filename src is replaced, and no error is thrown.
const happyPresentPath = path.join(os.tmpdir(), `eqb-happy-figure-${randomUUID()}.png`)
const happyPngBytes = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
writeFileSync(happyPresentPath, happyPngBytes)
const happyHtml = `<figure class="print-figure"><img src="fig-1.png" alt="fig-1"></figure>`
const happyImages = [{ relativeName: 'fig-1.png', absoluteSourcePath: happyPresentPath }]

const inlined = inlineFigureImages(happyHtml, happyImages)
assert(
  '§7. inlineFigureImages inlines a present figure as a data: URI (happy path intact)',
  typeof inlined === 'string' && inlined.includes('src="data:image/png;base64,') && !inlined.includes('src="fig-1.png"'),
  `inlined=${JSON.stringify(inlined).slice(0, 200)}`,
)
assert(
  '§7. the inlined data URI carries the real base64 payload of the figure file',
  inlined && inlined.includes(happyPngBytes.toString('base64')),
  `inlined does not contain the expected base64 payload`,
)

if (failed > 0) {
  console.error(`\ninline-figure ENOENT classification verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\ninline-figure ENOENT classification verify passed: ${passed} passed, 0 failed`)
