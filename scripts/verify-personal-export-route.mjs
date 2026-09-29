#!/usr/bin/env node
// verify-resource: browser-render
// #489 5d-1: the POST /api/personal-paper-layers/:paperId/exports route over
// the real publication pipeline — auth gate, version/layout conflicts, the
// 422 per-object diagnostics gate, a real PDF saved through the My Space
// artifact store and re-authenticated on download, the user-scoped file
// cache (cache hit without a second render, cross-user isolation) and the
// never-log-personal-text rule.
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
import { createMySpaceRoutes } from '../server/my-space/mySpaceRoutes.mjs'
import { ensureMySpaceDatabaseShape } from '../server/my-space/mySpace.mjs'
import { createPersonalPaperLayerRoutes } from '../server/personal-paper-layer/routes.mjs'
import { PERSONAL_LAYER_API_SCHEMA, createPersonalPaperLayerRuntime } from '../server/personal-paper-layer/runtime.mjs'
import { createPersonalPaperLayoutRuntime } from '../server/personal-paper-layer/layout.mjs'
import { createPersonalPaperExportRuntime } from '../server/personal-paper-layer/exportRuntime.mjs'
import { measurePersonalExportPlan } from '../server/personal-paper-layer/exportPlan.mjs'
import { buildPersonalLayerSource } from '../shared/personal-paper-layer/index.mjs'
import { createPersonalTextDocumentFromPlainText } from '../shared/personal-text/index.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// A string that exists only inside alice's note text: no JSON response body
// and no log line may ever carry it. (The PDF itself is supposed to contain
// the note — that is the product.)
const SENTINEL = '私语哨兵EQB7q9z'

let failed = 0
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS ${name}`)
  else {
    failed += 1
    console.log(`FAIL ${name}${detail ? ` ${detail}` : ''}`)
  }
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-personal-export-route-'))
const paperAssetsDir = path.join(tempRoot, 'paper-assets')
mkdirSync(paperAssetsDir, { recursive: true })
const userSpaceFilesDir = path.join(tempRoot, 'user-space-files')
const dbPath = path.join(tempRoot, 'user-data.sqlite')

// Mirrors server/api.mjs's openUserDatabase: writable opens self-heal the shape.
// api.mjs's ensureUserDatabaseShape owns the full user schema; the verifier
// seeds just the tables the exercised routes read or write (my-space artifact
// rows LEFT JOIN draft_papers for their source-draft chips).
function openUserDatabase({ readOnly = false } = {}) {
  const db = new DatabaseSync(dbPath, { readOnly })
  if (!readOnly) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS draft_papers (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL DEFAULT 'local',
        title TEXT NOT NULL,
        subject TEXT NOT NULL DEFAULT 'english',
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
        current_marker INTEGER NOT NULL DEFAULT 0 CHECK (current_marker IN (0, 1)),
        last_printed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    ensureMySpaceDatabaseShape(db)
  }
  return db
}

let consoleLines = []
const origConsoleInfo = console.info
console.info = (...args) => {
  consoleLines.push(args.map(String).join(' '))
}

const db = new DatabaseSync(path.join(paperAssetsDir, 'publication.sqlite'))
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
const committedAsset = readFileSync(path.join(__dirname, '..', 'app/public/paper-assets', paperId, 'latest/paper-asset.json'))
const versionDir = path.join(paperAssetsDir, paperId, 'versions', published.versionName)
writeFileSync(path.join(versionDir, 'paper-asset.json'), committedAsset)
// The personal-export file name resolves the paper title from this latest
// asset (api.mjs's resolvePublishedPaperTitle seam).
mkdirSync(path.join(paperAssetsDir, paperId, 'latest'), { recursive: true })
writeFileSync(path.join(paperAssetsDir, paperId, 'latest', 'paper-asset.json'), committedAsset)
const PAPER_TITLE = String(fixtureAsset.paper.title || '').trim()

const canonicalRuntime = createCanonicalConsumerRuntime({ rootDir: paperAssetsDir, db })
const loadCanonicalConsumption = (input) => canonicalRuntime.load(input)
const printConsumption = loadCanonicalConsumption({ paperId, consumerId: 'print_pdf' })
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
const unused = () => { throw new Error('the export route must not open a draft database') }
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
let measureCount = 0
const countingMeasure = (...args) => {
  measureCount += 1
  return measurePersonalExportPlan(...args)
}

const layerRuntime = createPersonalPaperLayerRuntime({ openUserDatabase, loadCanonicalConsumption })
const layoutRuntime = createPersonalPaperLayoutRuntime({ loadCanonicalConsumption, draftPaperStore, render: countingRender })
// Mirrors api.mjs's wiring: the title comes from the published paper asset,
// falling back to the paperId when the asset is missing.
const resolvePublishedPaperTitle = (titlePaperId) => {
  try {
    const assetPath = path.join(paperAssetsDir, titlePaperId, 'latest', 'paper-asset.json')
    if (!existsSync(assetPath)) return ''
    return String(JSON.parse(readFileSync(assetPath, 'utf8'))?.paper?.title || '').trim()
  } catch {
    return ''
  }
}
const exportRuntime = createPersonalPaperExportRuntime({
  openUserDatabase,
  personalPaperLayer: layerRuntime,
  personalPaperLayout: layoutRuntime,
  filesRoot: userSpaceFilesDir,
  measure: countingMeasure,
  render: countingRender,
  resolvePaperTitle: resolvePublishedPaperTitle,
})

const routes = [...createMySpaceRoutes(), ...createPersonalPaperLayerRoutes()]
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
      session: { userId: sessionUser },
      personalPaperLayer: layerRuntime,
      personalPaperLayout: layoutRuntime,
      personalPaperExport: exportRuntime,
      resolveDataUserId: (context) => context.session.userId,
      openUserDatabase,
      userSpaceFilesDir,
      paperTranslation: { config: { publicOrigin: '' } },
      sendJson: (res, status, body) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(body))
      },
    },
  })
  if (!handled) {
    response.writeHead(404)
    response.end()
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const responseTexts = []
async function call(pathname, { method = 'GET', headers = {}, payload, user } = {}) {
  const previous = sessionUser
  if (user !== undefined) sessionUser = user
  try {
    const response = await fetch(`${origin}${pathname}`, { method, headers, body: payload })
    const text = await response.text()
    responseTexts.push(text)
    let json = null
    try { json = JSON.parse(text) } catch { /* non-JSON */ }
    return {
      status: response.status,
      json,
      text,
      contentType: response.headers.get('content-type'),
      fileName: response.headers.get('x-file-name'),
      disposition: response.headers.get('content-disposition'),
    }
  } finally {
    sessionUser = previous
  }
}

// Binary download seam: bytes are not recorded in responseTexts — the PDF is
// supposed to contain the private note text.
async function download(pathname, user) {
  const previous = sessionUser
  if (user !== undefined) sessionUser = user
  try {
    const response = await fetch(`${origin}${pathname}`)
    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      status: response.status,
      buffer,
      contentType: response.headers.get('content-type'),
      fileName: response.headers.get('x-file-name'),
      disposition: response.headers.get('content-disposition'),
      cacheControl: response.headers.get('cache-control'),
      xContentTypeOptions: response.headers.get('x-content-type-options'),
      accessControlAllowOrigin: response.headers.get('access-control-allow-origin'),
    }
  } finally {
    sessionUser = previous
  }
}

try {
  const layoutResponse = await call(`/api/personal-paper-layers/${paperId}/layout`)
  const layout = layoutResponse.json
  check('the layout is ready for the export route', layoutResponse.status === 200 && layout?.layoutId, layoutResponse.text.slice(0, 200))
  if (layoutResponse.status !== 200) throw new Error('cannot continue without a layout')
  const currentRevision = layout.sourceRevision
  const pageOne = layout.pages[0].pageId

  const commitLayer = (user, expectedVersion, operations, mutationSeq) => layerRuntime.commit(user, paperId, {
    schemaVersion: PERSONAL_LAYER_API_SCHEMA,
    paperId,
    sourceRevision: currentRevision,
    expectedVersion,
    clientMutationId: `mut_${String(mutationSeq).padStart(8, '0')}`,
    operations,
  })

  const source = buildPersonalLayerSource(loadCanonicalConsumption({ paperId, consumerId: 'screen' }))
  const passageStream = source.streams.find((item) => item.role === 'passage-body' && item.text.length > 60)
  if (!passageStream) throw new Error('no passage-body stream for anchors')
  const anchor = (start, end) => ({
    paperId,
    sourceRevision: currentRevision,
    sourceProjectionVersion: source.sourceProjectionVersion,
    segments: [{ streamId: passageStream.streamId, start, end, exactText: passageStream.text.slice(start, end) }],
  })
  const exportHeaders = { origin, 'content-type': 'application/json' }
  const exportBody = (overrides = {}) => JSON.stringify({
    sourceRevision: currentRevision,
    layerVersion: 0,
    layoutId: layout.layoutId,
    ...overrides,
  })

  // ---- auth, unknown paper, request shape -----------------------------------
  const anonymous = await call(`/api/personal-paper-layers/${paperId}/exports`, { method: 'POST', headers: exportHeaders, payload: exportBody(), user: null })
  check('an unauthenticated export is 401 at the auth gate', anonymous.status === 401)
  const unknown = await call('/api/personal-paper-layers/paper-does-not-exist/exports', { method: 'POST', headers: exportHeaders, payload: exportBody() })
  check('an unknown paper is a 404 like the sibling layer routes', unknown.status === 404
    && unknown.json?.code === 'PERSONAL_LAYER_SOURCE_UNAVAILABLE')
  const malformed = await call(`/api/personal-paper-layers/${paperId}/exports`, { method: 'POST', headers: exportHeaders, payload: JSON.stringify({ sourceRevision: currentRevision, layoutId: layout.layoutId }) })
  check('a request without layerVersion is a 400', malformed.status === 400 && malformed.json?.code === 'PERSONAL_EXPORT_REQUEST_INVALID')
  const crossSite = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: { ...exportHeaders, origin: 'https://evil.example' }, payload: exportBody(),
  })
  check('a cross-origin export is refused with 403', crossSite.status === 403)

  // ---- version and layout conflicts (no render may happen) ------------------
  const rendersBeforeConflicts = renderCount
  const versionConflict = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 5 }),
  })
  check('a stale layerVersion is a 409 naming the current version',
    versionConflict.status === 409 && versionConflict.json?.code === 'PERSONAL_EXPORT_VERSION_MISMATCH'
      && versionConflict.json?.details?.currentVersion === 0,
    versionConflict.text.slice(0, 200))
  const layoutConflict = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layoutId: 'lay_000000000000000000000000' }),
  })
  check('a stale layoutId is a 409 layout mismatch', layoutConflict.status === 409
    && layoutConflict.json?.code === 'PERSONAL_EXPORT_LAYOUT_MISMATCH'
    && layoutConflict.json?.details?.currentLayoutId === layout.layoutId)
  const revisionConflict = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ sourceRevision: 'sha256:old' }),
  })
  check('a stale sourceRevision is a 409 layout mismatch', revisionConflict.status === 409
    && revisionConflict.json?.code === 'PERSONAL_EXPORT_LAYOUT_MISMATCH')
  check('the conflict path renders nothing', renderCount === rendersBeforeConflicts)

  // ---- happy path ------------------------------------------------------------
  commitLayer('alice', 0, [
    { op: 'create', object: { id: 'rt-hl-00001', type: 'highlight', textAnchor: anchor(0, 60), style: { color: 'yellow' } } },
    {
      op: 'create',
      object: {
        id: 'rt-box-0001',
        type: 'text-box',
        document: createPersonalTextDocumentFromPlainText(`${SENTINEL} 这是 Alice 的私有文字框。`),
        placement: { kind: 'page-position', layoutId: layout.layoutId, pageId: pageOne, xMm: 30, yMm: 40, widthMm: 60 },
      },
    },
  ], 1)
  const rendersBeforeFirst = renderCount
  const measureBeforeFirst = measureCount
  const first = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 1 }),
  })
  if (first.status !== 200) {
    console.error('DEBUG captured log lines:', consoleLines.join('\n'))
    throw new Error(`first export failed: ${first.text.slice(0, 400)}`)
  }
  check('the first export renders and returns the export contract', first.status === 200
    && first.json?.cached === false
    && /^[0-9a-f-]{36}$/iu.test(first.json?.fileId || '')
    && first.json?.downloadUrl === `/api/personal-paper-layers/${encodeURIComponent(paperId)}/exports/${first.json?.fileId}.pdf`
    && first.json?.fileName === `${PAPER_TITLE}-我的批注版.pdf`
    && first.json?.layerVersion === 1
    && first.json?.sourceRevision === currentRevision
    && first.json?.layoutId === layout.layoutId
    && first.json?.pageCount > 0,
    first.text.slice(0, 300))
  check('the first export ran one measure pass and at least one render',
    measureCount === measureBeforeFirst + 1 && renderCount > rendersBeforeFirst,
    `measure ${measureCount - measureBeforeFirst}, render ${renderCount - rendersBeforeFirst}`)

  const ownerDownload = await download(first.json.downloadUrl, 'alice')
  check('the owner downloads a real PDF from the export download route',
    ownerDownload.status === 200
      && ownerDownload.contentType === 'application/pdf'
      && ownerDownload.buffer.subarray(0, 5).toString('latin1') === '%PDF-',
    `status=${ownerDownload.status} type=${ownerDownload.contentType}`)
  check('the download attaches with the annotated-edition file name',
    ownerDownload.disposition.startsWith('attachment;')
      && ownerDownload.fileName === encodeURIComponent(`${PAPER_TITLE}-我的批注版.pdf`)
      && ownerDownload.disposition.includes(`filename*=UTF-8''${encodeURIComponent(`${PAPER_TITLE}-我的批注版.pdf`)}`),
    ownerDownload.disposition ?? '')
  check('the attachment download is private: no-store, nosniff and no cross-origin allow',
    ownerDownload.cacheControl === 'private, no-store'
      && ownerDownload.xContentTypeOptions === 'nosniff'
      && ownerDownload.accessControlAllowOrigin === null,
    JSON.stringify({
      cacheControl: ownerDownload.cacheControl,
      xContentTypeOptions: ownerDownload.xContentTypeOptions,
      accessControlAllowOrigin: ownerDownload.accessControlAllowOrigin,
    }))

  const otherDownload = await download(first.json.downloadUrl, 'bob')
  check("user B gets the same 404 as a missing file for user A's file id, not a 403",
    otherDownload.status === 404)
  const crossPaper = await download(`/api/personal-paper-layers/paper-does-not-exist/exports/${first.json.fileId}.pdf`, 'alice')
  check("the owner's file id under a different paperId path is a 404 too", crossPaper.status === 404)
  const anonymousDownload = await download(first.json.downloadUrl, null)
  check('an anonymous download is 401 at the auth gate', anonymousDownload.status === 401)

  // ---- cache: an identical request reuses the file without rendering --------
  const rendersBeforeCached = renderCount
  const measureBeforeCached = measureCount
  const cached = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 1 }),
  })
  const sameExceptCached = cached.status === 200 && cached.json?.cached === true
    && ['fileId', 'downloadUrl', 'fileName', 'layerVersion', 'sourceRevision', 'layoutId', 'pageCount']
      .every((key) => cached.json[key] === first.json[key])
  check('a second identical export is a cache hit with no second render and an identical payload',
    sameExceptCached && measureCount === measureBeforeCached && renderCount === rendersBeforeCached,
    `measure ${measureCount - measureBeforeCached}, render ${renderCount - rendersBeforeCached}`)

  // The raw v1 object rows, taken while the layer is still at version 1: the
  // undo-back test below restores them byte-identically (revision/updatedAt
  // included) so the v3 objects digest equals v1's.
  const v1ObjectRows = (() => {
    const db = openUserDatabase({ readOnly: true })
    try {
      return db.prepare(`
        SELECT o.object_id AS objectId, o.body_json AS bodyJson
        FROM personal_paper_objects o JOIN personal_paper_layers l ON l.id = o.layer_id
        WHERE l.user_id = 'alice' AND l.paper_id = ? AND l.source_revision = ?
        ORDER BY o.object_id
      `).all(paperId, currentRevision)
    } finally {
      db.close()
    }
  })()

  // ---- isolation: the same paper exports a different file per user ----------
  const bobExport = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 0 }), user: 'bob',
  })
  check("user B's export of the same paper is its own file, not user A's cache entry",
    bobExport.status === 200 && bobExport.json?.cached === false && bobExport.json?.fileId !== first.json.fileId,
    bobExport.text.slice(0, 200))
  const bobDownload = await download(bobExport.json.downloadUrl, 'bob')
  check("user B can download user B's own export", bobDownload.status === 200
    && bobDownload.buffer.subarray(0, 5).toString('latin1') === '%PDF-')

  const mySpace = await call('/api/my-space/artifacts', { user: 'alice' })
  check('the personal export does not appear in the My Space artifact list',
    mySpace.status === 200 && Array.isArray(mySpace.json?.artifacts)
      && mySpace.json.artifacts.every((artifact) => !String(artifact.fileName || '').includes('我的批注版')),
    mySpace.text.slice(0, 200))

  // ---- a layer edit invalidates the old version, not the new one ------------
  commitLayer('alice', 1, [
    { op: 'update', objectId: 'rt-box-0001', patch: { document: createPersonalTextDocumentFromPlainText(`${SENTINEL} 第二版文字框。`) } },
  ], 2)
  const staleVersion = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 1 }),
  })
  check('after an edit, the old version request is a 409 with the new current version',
    staleVersion.status === 409 && staleVersion.json?.code === 'PERSONAL_EXPORT_VERSION_MISMATCH'
      && staleVersion.json?.details?.currentVersion === 2)
  const rendersBeforeSecond = renderCount
  const second = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 2 }),
  })
  check('the new version exports a new file', second.status === 200 && second.json?.cached === false
    && second.json?.fileId !== first.json.fileId && renderCount > rendersBeforeSecond,
    second.text.slice(0, 200))

  // ---- a cache hit reports the request's version, not the stored row's ------
  // Undoing the edit lands the layer back on the exact v1 objects under a new
  // version 3 — the same objectsDigest, so the cache key matches the first
  // export, but the response must say version 3, not the stored row's version.
  const undoDb = openUserDatabase({ readOnly: false })
  try {
    const layer = undoDb.prepare(`
      SELECT id FROM personal_paper_layers
      WHERE user_id = 'alice' AND paper_id = ? AND source_revision = ?
    `).get(paperId, currentRevision)
    for (const row of v1ObjectRows) {
      undoDb.prepare('UPDATE personal_paper_objects SET body_json = ? WHERE layer_id = ? AND object_id = ?')
        .run(row.bodyJson, layer.id, row.objectId)
    }
    undoDb.prepare('UPDATE personal_paper_layers SET version = 3 WHERE id = ?').run(layer.id)
  } finally {
    undoDb.close()
  }
  const reverted = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 3 }),
  })
  check('undoing back to identical objects cache-hits and reports the request layerVersion',
    reverted.status === 200 && reverted.json?.cached === true
      && reverted.json?.layerVersion === 3
      && reverted.json?.fileId === first.json.fileId
      && reverted.json?.sourceRevision === currentRevision
      && reverted.json?.layoutId === layout.layoutId,
    reverted.text.slice(0, 300))

  // ---- retention: the newest 3 exports per (user, paper) survive -------------
  // Two more distinct exports make four rows; the oldest (the first export)
  // must be pruned together with its file.
  commitLayer('alice', 3, [
    { op: 'update', objectId: 'rt-box-0001', patch: { document: createPersonalTextDocumentFromPlainText(`${SENTINEL} 第三版文字框。`) } },
  ], 5)
  const fourth = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 4 }),
  })
  check('the fourth distinct export succeeds', fourth.status === 200 && fourth.json?.cached === false,
    fourth.text.slice(0, 200))
  commitLayer('alice', 4, [
    { op: 'update', objectId: 'rt-box-0001', patch: { document: createPersonalTextDocumentFromPlainText(`${SENTINEL} 第四版文字框。`) } },
  ], 6)
  const fifth = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 5 }),
  })
  check('the fifth distinct export succeeds', fifth.status === 200 && fifth.json?.cached === false,
    fifth.text.slice(0, 200))
  const retentionDb = openUserDatabase({ readOnly: true })
  let rowCount = null
  let remainingPaths = []
  try {
    rowCount = retentionDb.prepare(`
      SELECT COUNT(*) AS n FROM personal_paper_export_files WHERE user_id = 'alice' AND paper_id = ?
    `).get(paperId).n
    remainingPaths = retentionDb.prepare(`
      SELECT file_path FROM personal_paper_export_files WHERE user_id = 'alice' AND paper_id = ?
    `).all(paperId)
  } finally {
    retentionDb.close()
  }
  const countPdfFiles = (dir) => {
    try {
      return readdirSync(dir, { recursive: true }).filter((name) => name.endsWith('.pdf')).length
    } catch {
      return -1
    }
  }
  check('four distinct exports leave exactly 3 rows and 3 files for the user+paper',
    rowCount === 3
      && remainingPaths.length === 3
      && remainingPaths.every((row) => existsSync(path.join(userSpaceFilesDir, row.file_path))),
    JSON.stringify({ rowCount, remainingPaths }))
  const aliceExportFiles = countPdfFiles(path.join(userSpaceFilesDir, 'personal-exports'))
  check('the personal-exports root holds 3 alice files plus bob\'s one', aliceExportFiles === 4,
    `files: ${aliceExportFiles}`)
  const prunedDownload = await download(first.json.downloadUrl, 'alice')
  check('the oldest export download is gone after the prune (404)', prunedDownload.status === 404,
    `status=${prunedDownload.status}`)
  const survivorDownload = await download(second.json.downloadUrl, 'alice')
  check('a surviving export still downloads after the prune', survivorDownload.status === 200
    && survivorDownload.buffer.subarray(0, 5).toString('latin1') === '%PDF-',
    `status=${survivorDownload.status}`)

  // ---- 422 with per-object diagnostics --------------------------------------
  commitLayer('carol', 0, [
    { op: 'create', object: { id: 'rt-hl-carol', type: 'highlight', textAnchor: anchor(10, 40), style: { color: 'green' } } },
  ], 3)
  const userDb = openUserDatabase({ readOnly: false })
  const carolLayerId = userDb.prepare(`SELECT id FROM personal_paper_layers WHERE user_id = 'carol'`).get().id
  const storedRow = userDb.prepare(`
    SELECT body_json AS bodyJson FROM personal_paper_objects WHERE layer_id = ? AND object_id = 'rt-hl-carol'
  `).get(carolLayerId)
  const corrupted = JSON.parse(storedRow.bodyJson)
  corrupted.textAnchor.segments[0].exactText = 'drifted away from the source text'
  userDb.prepare('UPDATE personal_paper_objects SET body_json = ? WHERE layer_id = ? AND object_id = ?')
    .run(JSON.stringify(corrupted), carolLayerId, 'rt-hl-carol')
  userDb.close()
  const rendersBeforeDiagnostics = renderCount
  const refused = await call(`/api/personal-paper-layers/${paperId}/exports`, {
    method: 'POST', headers: exportHeaders, payload: exportBody({ layerVersion: 1 }), user: 'carol',
  })
  const diagnostic = refused.json?.diagnostics?.find((entry) => entry.objectId === 'rt-hl-carol')
  check('an unresolved anchor refuses the export with 422 and per-object diagnostics',
    refused.status === 422 && refused.json?.code === 'PERSONAL_EXPORT_HAS_DIAGNOSTICS'
      && diagnostic?.code === 'anchor-unresolved'
      && refused.json.diagnostics.every((entry) => typeof entry.objectId === 'string' && typeof entry.code === 'string'),
    refused.text.slice(0, 300))
  check('the diagnostics gate renders nothing', renderCount === rendersBeforeDiagnostics)

  // ---- privacy: the sentinel text never leaves the layer ---------------------
  const leaks = [
    ...responseTexts.filter((text) => text.includes(SENTINEL)).map((text) => `response: ${text.slice(0, 120)}`),
    ...consoleLines.filter((line) => line.includes(SENTINEL)).map((line) => `log: ${line.slice(0, 120)}`),
  ]
  check('no response body and no log line carries the private note text', leaks.length === 0, leaks.join(' | '))
  const exportLogs = consoleLines.filter((line) => line.startsWith('personal-export '))
  check('export log lines carry ids and codes only',
    exportLogs.length > 0 && exportLogs.every((line) => /^personal-export \{.*\}$/u.test(line.trim())),
    exportLogs.slice(0, 3).join(' | '))
} finally {
  await new Promise((resolve) => server.close(resolve))
  await closeChromiumPool()
  db.close()
  console.info = origConsoleInfo
  rmSync(tempRoot, { recursive: true, force: true })
}

if (failed) {
  console.error(`\nPersonal export route verify failed: ${failed} failed`)
  process.exit(1)
}
console.log('\nPersonal export route verify passed')
