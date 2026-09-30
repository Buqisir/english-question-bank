#!/usr/bin/env node
// verify-resource: browser-render
// #489 personal base layout of a published paper, through the real publication
// pipeline, the real draft natural student builder and the real Paged.js
// renderer. The base edition is fixed to the ordinary student A4 paper (the
// draft default PDF export's natural pipeline, listening always included) so
// legacy_opaque papers stay renderable. The cloze/grammar reference fixture
// publishes as paper-2026-i with the byte-exact committed paper asset. A
// publication whose canonical structure is incomplete is refused with a
// distinct code instead of rendering a trimmed paper.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import http from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { runRoutes } from '../server/router/index.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { publishCanonicalPaperPublication } from '../server/paper-canonical/publication.mjs'
import { createDraftPaperStore } from '../server/draft-paper/draftPaperStore.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { createPersonalPaperLayerRoutes } from '../server/personal-paper-layer/routes.mjs'
import {
  PERSONAL_BASE_EDITION,
  PERSONAL_BASE_LAYOUT_VERSION,
  PERSONAL_LAYOUT_API_SCHEMA,
  createPersonalPaperLayoutRuntime,
  measuringRender,
  personalLayoutId,
  renderPersonalBaseLayout,
  stablePaginatedHtmlDigest,
} from '../server/personal-paper-layer/layout.mjs'
import { computeSourceRevision } from '../shared/paper-selection/sourceProjection.mjs'
import { paperFontFaces } from '../shared/papersurface/paperFonts.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

// The reference fixture publishes the real hash-bound paper-2026-i asset; the
// committed file is copied byte for byte so consumption and the app asset
// route read identical bytes (scripts/verify-personal-annotations-browser.mjs
// seedFixture).
const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-layout-'))
const paperAssetsDir = path.join(tempRoot, 'paper-assets')
mkdirSync(paperAssetsDir, { recursive: true })
const dbPath = path.join(paperAssetsDir, 'publication.sqlite')

const db = new DatabaseSync(dbPath)
const fixture = makeClozeGrammarCanonicalReferenceFixture()
const fixtureAsset = JSON.parse(new TextDecoder().decode(fixture.sourceAsset))
const paperId = fixtureAsset.paper.paperId
const published = publishCanonicalPaperPublication({
  rootDir: paperAssetsDir,
  db,
  request: fixture.request,
  sourceAssetVersion: 1,
  sourceAsset: fixture.sourceAsset,
})
if (published.status !== 'published') throw new Error(`publication failed: ${JSON.stringify(published)}`)
const committedAsset = readFileSync(path.join(rootDir, 'app/public/paper-assets', paperId, 'latest/paper-asset.json'))
if (committedAsset.compare(fixture.sourceAsset) !== 0) throw new Error('fixture source asset is not the committed paper asset')
const versionDir = path.join(paperAssetsDir, paperId, 'versions', published.versionName)
writeFileSync(path.join(versionDir, 'paper-asset.json'), committedAsset)

const canonicalRuntime = createCanonicalConsumerRuntime({ rootDir: paperAssetsDir, db })
const loadCanonicalConsumption = (input) => canonicalRuntime.load(input)
const printConsumption = loadCanonicalConsumption({ paperId, consumerId: 'print_pdf' })
// Published NCK1 imports carry an import-meta pagination binding; an explicit
// null plan binding selects the bounded planner, as for an unplanned import.
writeFileSync(path.join(versionDir, 'import-meta.json'), `${JSON.stringify({
  paginationPlanBinding: {
    schemaVersion: 'paper-pagination-binding-v1',
    paperId,
    sourceAssetVersion: printConsumption.sourceAssetVersion,
    sourceDigest: printConsumption.sourceAssetDigest,
    canonicalSourceDigest: printConsumption.sourceAssetDigest,
    candidateDigest: null,
    planDigest: null,
  },
})}\n`)
const assetAnswerKey = JSON.parse(committedAsset.toString('utf8')).answerKey
const answers = new Map(Object.entries(assetAnswerKey.answers).map(([questionId, answer]) => [questionId, answer.answer]))
const details = new Map(canonicalConsumptionPrintPayload(printConsumption, paperId, answers).details)
const unused = () => { throw new Error('the published-paper path must not open a draft database') }
const draftPaperStore = createDraftPaperStore({
  getQuestionGroupDetail: (groupId) => (details.has(groupId) ? structuredClone(details.get(groupId)) : null),
  groupTypeLabels: {},
  openDatabase: unused,
  openUserDatabase: unused,
  paperAssetsDir,
  resolveCanonicalConsumption: (input) => canonicalRuntime.resolveForItems(input),
  selectQuestionGroupCards: unused,
})

let renderCount = 0
const countingRender = (...args) => {
  renderCount += 1
  return renderPaginatedPaper(...args)
}
let clock = Date.parse('2026-09-29T10:00:00.000Z')
const layoutRuntime = createPersonalPaperLayoutRuntime({
  loadCanonicalConsumption,
  draftPaperStore,
  render: countingRender,
  now: () => clock,
})

const routes = createPersonalPaperLayerRoutes()
let sessionUser = 'alice'
const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1')
  // api.mjs resolves the session before routing and answers 401 for anonymous
  // calls to every non-public route; mirror that seam here.
  if (!sessionUser) {
    response.writeHead(401, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ error: 'not_authenticated' }))
    return
  }
  const handled = await runRoutes(routes, {
    request,
    response,
    url,
    context: {
      authMode: 'enforced',
      session: sessionUser ? { userId: sessionUser } : null,
      personalPaperLayout: layoutRuntime,
      paperTranslation: { config: { publicOrigin: '' } },
    },
  })
  if (!handled) {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
async function call(pathname, headers = {}) {
  const response = await fetch(`${origin}${pathname}`, { headers })
  const text = await response.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* non-JSON */ }
  return { status: response.status, json, text, cache: response.headers.get('x-personal-layout-cache'), cacheControl: response.headers.get('cache-control') }
}

try {
  const screen = canonicalRuntime.load({ paperId, consumerId: 'screen' })
  const print = canonicalRuntime.load({ paperId, consumerId: 'print_pdf' })
  const expectedRevision = computeSourceRevision(screen)
  check('the base edition is fixed to the natural student A4 product', PERSONAL_BASE_EDITION === 'naturalStudentA4')

  const startedAt = performance.now()
  const first = await call(`/api/personal-paper-layers/${paperId}/layout`)
  const firstMs = Math.round(performance.now() - startedAt)
  const body = first.json
  check('GET layout renders the published paper for a signed-in member', first.status === 200 && first.cache === 'miss',
    `status=${first.status} ${first.text.slice(0, 300)}`)
  if (first.status !== 200) throw new Error('cannot continue without a layout')
  const firstRenders = renderCount
  console.log(`INFO first layout render ${firstMs} ms, ${firstRenders} Paged.js renders, ${body.pages.length} pages, ${(first.text.length / 1024).toFixed(0)} KiB response`)
  check('the response is private and not cacheable', first.cacheControl === 'private, no-store')
  check('the response carries the API schema, paper and current source revision',
    body.schemaVersion === PERSONAL_LAYOUT_API_SCHEMA && body.paperId === paperId
    && body.sourceRevision === expectedRevision && body.layoutRef.sourceRevision === expectedRevision)
  check('the layout records the natural student product in canonical group order',
    body.edition === 'naturalStudentA4' && body.layoutRef.product.edition === 'naturalStudentA4'
    && body.layoutRef.product.versionType === 'student' && body.layoutRef.product.contentScope === 'whole-paper'
    && body.layoutRef.product.includeListening === true && body.layoutRef.product.mode === 'natural'
    && JSON.stringify(body.layoutRef.product.groupIds)
      === JSON.stringify(print.visibleStructure.filter((node) => node.kind === 'group').map((node) => node.groupId)))
  check('the natural product exposes no fontSizePt', body.fontSizePt === undefined && body.layoutRef.fontSizePt === undefined)
  check('layoutId is short, pattern-valid and derived from the layout reference',
    /^lay_[0-9a-f]{24}$/.test(body.layoutId) && /^[A-Za-z0-9_.:/-]{1,128}$/.test(body.layoutId)
    && personalLayoutId(body.layoutRef) === body.layoutId)
  check('the layout reference binds the layout version, publication, fonts, paper and HTML digest',
    body.layoutRef.layoutVersion === PERSONAL_BASE_LAYOUT_VERSION
    && body.layoutRef.source.publicationDigest === print.publicationDigest
    && body.layoutRef.source.sourceAssetDigest === print.sourceAssetDigest
    && body.layoutRef.fonts.faces.length === paperFontFaces.length
    && body.layoutRef.fonts.faces.every((face, index) => face.sha256 === paperFontFaces[index].sha256)
    && body.layoutRef.paper.size === 'A4' && body.layoutRef.paper.orientation === 'portrait'
    && /^sha256:[0-9a-f]{64}$/.test(body.layoutRef.paginatedHtmlDigest)
    && /^sha256:[0-9a-f]{64}$/.test(body.layoutRef.printHtmlDigest))
  const htmlPageCount = (body.paginatedHtml.match(/<div class="[^"]*\bpagedjs_page\b[^"]*"/g) || []).length
  check('page count equals the .pagedjs_page count in the HTML',
    body.pages.length === htmlPageCount && body.layoutRef.pageCount === htmlPageCount && htmlPageCount > 0,
    `pages=${body.pages.length} html=${htmlPageCount}`)
  check('pages are measured A4 with stable ids', body.pages.every((page, index) =>
    page.pageId === `p${index + 1}` && page.index === index
    && Math.abs(page.widthMm - 210) <= 1 && Math.abs(page.heightMm - 297) <= 1),
  JSON.stringify(body.pages.slice(0, 2)))
  check('measured margins are the natural student A4 margins', body.layoutRef.pages.every(({ marginsMm }) =>
    Math.abs(marginsMm.top - 21) <= 0.5 && Math.abs(marginsMm.right - 24) <= 0.5
    && Math.abs(marginsMm.bottom - 24) <= 0.5 && Math.abs(marginsMm.left - 24) <= 0.5),
  JSON.stringify(body.layoutRef.pages[0].marginsMm))
  check('the paginated HTML has no script', !/<script\b/i.test(body.paginatedHtml))
  check('paragraph, question and option source ids survive pagination',
    /data-canonical-block-id="/.test(body.paginatedHtml)
    && /data-canonical-question-id="/.test(body.paginatedHtml)
    && /data-canonical-option-id="/.test(body.paginatedHtml))
  const fontUrls = [...body.paginatedHtml.matchAll(/url\(["']?(\/fonts\/paper\/[^"')]+)["']?\)/g)].map((match) => match[1])
  check('paper fonts load from the app origin instead of embedded data',
    !body.paginatedHtml.includes('data:font/') && fontUrls.length >= paperFontFaces.length
    && fontUrls.every((url) => paperFontFaces.some((face) => url === `/fonts/paper/${face.path}`)))
  const externalRefs = [...body.paginatedHtml.matchAll(/(?:src|href)="([^"]*)"|url\(["']?([^"')]+)["']?\)/g)]
    .map((match) => match[1] ?? match[2])
    .filter((ref) => ref && !ref.startsWith('data:') && !ref.startsWith('#') && !ref.startsWith('/fonts/paper/'))
  check('no other external resource is referenced', externalRefs.length === 0, externalRefs.slice(0, 5).join(', '))

  const second = await call(`/api/personal-paper-layers/${paperId}/layout`)
  check('a second request is a cache hit with no render', second.status === 200 && second.cache === 'hit' && renderCount === firstRenders)
  check('the cached layout is identical', second.json?.layoutId === body.layoutId && second.json?.paginatedHtml === body.paginatedHtml)
  sessionUser = 'bob'
  const other = await call(`/api/personal-paper-layers/${paperId}/layout`)
  check('another member shares the public base layout without re-rendering',
    other.status === 200 && other.json?.layoutId === body.layoutId && renderCount === firstRenders)
  sessionUser = 'alice'

  // A fresh runtime renders again from scratch: the layout id must not drift.
  const freshRuntime = createPersonalPaperLayoutRuntime({ loadCanonicalConsumption, draftPaperStore })
  const [concurrentA, concurrentB] = await Promise.all([
    freshRuntime.getLayout('carol', { paperId }),
    freshRuntime.getLayout('carol', { paperId }),
  ])
  check('identical concurrent requests share one render', concurrentA.cache === 'miss' && concurrentB.cache === 'shared')
  const refDelta = (left, right, prefix = '') => {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    return [...keys].filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]))
      .map((key) => `${prefix}${key}`).join(',')
  }
  check('an independent render yields the same layoutId and stable HTML digest',
    concurrentA.body.layoutId === body.layoutId
    && stablePaginatedHtmlDigest(concurrentA.body.paginatedHtml) === stablePaginatedHtmlDigest(body.paginatedHtml),
    `layoutId ${concurrentA.body.layoutId} vs ${body.layoutId}; ref deltas: ${refDelta(concurrentA.body.layoutRef, body.layoutRef)}`)

  const renderInput = await freshRuntime.baseRenderInput('carol', { paperId, layoutId: body.layoutId })
  check('the base render input is the exact bound print HTML',
    `sha256:${sha256(renderInput.printHtml)}` === body.layoutRef.printHtmlDigest
    && renderInput.edition === body.edition)
  // Stage-5 zero-annotation consistency depends on the base being exactly this
  // pipeline's clean output: the bound digest must equal a plain re-render of
  // the same print HTML with no planner or layout step in between.
  const directRender = await renderPaginatedPaper(renderInput.printHtml)
  check('the natural base is the plain paginated render of the same printHtml',
    stablePaginatedHtmlDigest(directRender.paginatedHtml) === body.layoutRef.paginatedHtmlDigest
    && directRender.pageCount === body.pages.length)
  const replay = await renderPersonalBaseLayout(renderInput, { render: measuringRender() })
  check('replaying the chosen plan reproduces the bound paginated HTML digest',
    stablePaginatedHtmlDigest(replay.paginatedHtml) === body.layoutRef.paginatedHtmlDigest
    && replay.pageCount === body.pages.length)
  let mismatch
  try { await freshRuntime.baseRenderInput('carol', { paperId, layoutId: 'lay_000000000000000000000000' }) } catch (error) { mismatch = error }
  check('a render input for a different layout is refused', mismatch?.status === 409 && mismatch.code === 'PERSONAL_LAYOUT_MISMATCH')

  const refWith = (changes) => personalLayoutId({ ...body.layoutRef, ...changes })
  check('layoutId changes with the product edition',
    refWith({ product: { ...body.layoutRef.product, edition: 'otherEdition' } }) !== body.layoutId)
  check('layoutId changes with the layout version', refWith({ layoutVersion: 'eqb-personal-base-layout-v2' }) !== body.layoutId)
  check('layoutId changes with the source revision', refWith({ sourceRevision: 'sha256:other' }) !== body.layoutId)
  check('layoutId changes with the font assets',
    refWith({ fonts: { ...body.layoutRef.fonts, digest: 'sha256:other' } }) !== body.layoutId)
  check('layoutId changes with a page size', refWith({ pages: body.layoutRef.pages.map((page, index) =>
    (index === 0 ? { ...page, heightMm: page.heightMm + 1 } : page)) }) !== body.layoutId)

  const stale = await call(`/api/personal-paper-layers/${paperId}/layout?sourceRevision=sha256:old`)
  check('a stale sourceRevision reuses the layer stale code', stale.status === 409 && stale.json?.code === 'PERSONAL_LAYER_SOURCE_MISMATCH'
    && stale.json?.details?.currentSourceRevision === expectedRevision)
  const current = await call(`/api/personal-paper-layers/${paperId}/layout?sourceRevision=${encodeURIComponent(expectedRevision)}`)
  check('the current sourceRevision is accepted', current.status === 200 && current.cache === 'hit')

  const before = renderCount
  const unavailable = createPersonalPaperLayoutRuntime({
    loadCanonicalConsumption: (input) => {
      const consumption = loadCanonicalConsumption(input)
      if (input.consumerId !== 'print_pdf') return consumption
      // A publication missing one canonical group owns no complete opening.
      return { ...consumption, visibleStructure: consumption.visibleStructure.slice(0, -1) }
    },
    draftPaperStore,
  })
  let incomplete
  try { await unavailable.getLayout('alice', { paperId }) } catch (error) { incomplete = error }
  check('an incomplete publication is refused as unavailable, not rendered',
    incomplete?.status === 422 && incomplete.code === 'PERSONAL_LAYOUT_UNAVAILABLE' && renderCount === before,
    JSON.stringify(incomplete && { code: incomplete.code, status: incomplete.status }))
  const missing = await call('/api/personal-paper-layers/paper-does-not-exist/layout')
  check('an unknown paper is a 404 source error', missing.status === 404 && missing.json?.code === 'PERSONAL_LAYER_SOURCE_UNAVAILABLE')
  const invalid = await call('/api/personal-paper-layers/bad%20id/layout')
  check('an invalid paper id is a 400', invalid.status === 400 && invalid.json?.code === 'PERSONAL_LAYER_REQUEST_INVALID')

  const crossSite = await call(`/api/personal-paper-layers/${paperId}/layout`, { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' })
  check('a cross-site request is refused with 403', crossSite.status === 403)
  const foreignOrigin = await call(`/api/personal-paper-layers/${paperId}/layout`, { origin: 'https://evil.example' })
  check('a foreign Origin is refused with 403', foreignOrigin.status === 403)

  const beforeAnonymous = renderCount
  sessionUser = null
  const anonymous = await call(`/api/personal-paper-layers/${paperId}/layout`)
  check('an anonymous request is 401 and renders nothing', anonymous.status === 401 && renderCount === beforeAnonymous)
  sessionUser = 'alice'

  // Renderer failures are 503 without internals; an incomplete publication is
  // 422 and a publication changed mid-prepare is the stale-source 409.
  const brokenStore = { ...draftPaperStore, renderPreparedNaturalStudent: async () => { throw new Error('Chromium crashed at /srv/secret') } }
  const brokenRuntime = createPersonalPaperLayoutRuntime({ loadCanonicalConsumption, draftPaperStore: brokenStore })
  let renderFailure
  try { await brokenRuntime.getLayout('alice', { paperId }) } catch (error) { renderFailure = error }
  check('a renderer failure is a distinct 503 with a fixed message', renderFailure?.status === 503 && renderFailure.code === 'PERSONAL_LAYOUT_RENDER_FAILED'
    && renderFailure.message === '纸张版暂时生成失败，稍后重试')
  const changedMidPrepareStore = {
    ...draftPaperStore,
    preparePublishedPaperNaturalStudent: () => { throw Object.assign(new Error('Canonical publication changed while preparing the paper'), { code: 'CANONICAL_PUBLICATION_CHANGED' }) },
  }
  let changedMidPrepare
  try { await createPersonalPaperLayoutRuntime({ loadCanonicalConsumption, draftPaperStore: changedMidPrepareStore }).getLayout('alice', { paperId }) } catch (error) { changedMidPrepare = error }
  check('a publication changed mid-prepare is a stale-source 409, not unavailable',
    changedMidPrepare?.status === 409 && changedMidPrepare.code === 'PERSONAL_LAYOUT_SOURCE_STALE')

  const throttledRuntime = createPersonalPaperLayoutRuntime({ loadCanonicalConsumption, draftPaperStore: brokenStore, now: () => clock })
  const statuses = []
  for (let attempt = 0; attempt < 7; attempt += 1) {
    try { await throttledRuntime.getLayout('dave', { paperId }) } catch (error) { statuses.push(error.status) }
  }
  check('renders are throttled per member', statuses.slice(0, 6).every((status) => status === 503) && statuses[6] === 429,
    statuses.join(','))
  clock += 61_000
  let afterWindow
  try { await throttledRuntime.getLayout('dave', { paperId }) } catch (error) { afterWindow = error }
  check('the throttle window slides', afterWindow?.status === 503)
} finally {
  await new Promise((resolve) => server.close(resolve))
  await closeChromiumPool()
  db.close()
  rmSync(tempRoot, { recursive: true, force: true })
}

if (failed) {
  console.error(`\nPersonal paper layout verify failed: ${failed} failed`)
  process.exit(1)
}
console.log('\nPersonal paper layout verify passed')
