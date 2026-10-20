#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'

// Isolated synthetic package; never connects to a production database or approves audio.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createImportReviewStore, reviewBundleDigest } from '../server/import-review/importReviewStore.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { buildNck1ReviewProjection, reviewBundleFilePaths, resolveReviewFile } from '../server/import-review/revisionProjection.mjs'
import { prepareNck1AnalyzedPackageReview } from '../server/paper-import/analyzedPackage.mjs'
import { exportAnalyzedPackageRevision } from '../server/paper-import/analyzedPackageExport.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { readJsonRouteBody, runRoutes } from '../server/router/index.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
const { makeReviewRoot, makeExternalAnalyzedPackage } = await import('./verify-universal-nck1-publish.mjs')
const root = path.resolve(import.meta.dirname, '..')
const temporary = fs.mkdtempSync(path.join(tmpdir(), 'eqb-external-review-e2e-'))
const paperId = 'paper-mock-contract-2026-m1'
const serve = process.argv.includes('--serve')
const artifactDir = process.env.EQB_REVIEW_ARTIFACT_DIR
let server
let browser
let vite
try {
  const raw = makeReviewRoot(temporary, paperId, undefined, { listening: true })
  const continuationPath = path.join(raw.reviewRoot, 'analysis-continuation.json')
  const continuation = JSON.parse(fs.readFileSync(continuationPath, 'utf8'))
  continuation.modelAnswer = [
    'Paragraph one starter. The protagonist paused to consider the unresolved problem. Instead of inventing a new conflict, the response followed the information already available in the story. A small practical action gave the other character a chance to respond. They discussed what could be done next and agreed on a manageable first step. That decision prepared the situation required by the second paragraph.',
    'Paragraph two starter. The characters carried out their plan and checked its result together. One remaining difficulty called for a modest adjustment, rather than an unrelated surprise. Their final action resolved the original problem and returned to the earlier clue. The ending stayed within the facts provided by the source. This is synthetic layout-test prose, not an official answer or an approved teaching model.',
  ].join('\n\n')
  fs.writeFileSync(continuationPath, JSON.stringify(continuation))
  const packageRoot = path.join(temporary, 'package')
  makeExternalAnalyzedPackage(raw.reviewRoot, packageRoot)
  const reviewRoot = path.join(temporary, 'external-review')
  await prepareNck1AnalyzedPackageReview({ sourcePath: packageRoot, destinationDir: reviewRoot, expectedPaperId: paperId })
  const projection = buildNck1ReviewProjection(reviewRoot, { requireAnalyses: true })
  assert.equal(projection.listeningReview.audio.state, 'included_in_candidate_review')
  assert.equal(Object.keys(projection.analysisSidecars).length, 6)
  const dbPath = path.join(temporary, 'review.sqlite')
  const filesRoot = path.join(temporary, 'sealed')
  const store = createImportReviewStore({ dbPath, filesRoot, rendererBuildId: 'external-review-e2e' })
  const files = reviewBundleFilePaths(reviewRoot).map((file) => {
    const bytes = fs.readFileSync(resolveReviewFile(reviewRoot, file.path))
    return { ...file, sha256: sha256(bytes), byteLength: bytes.byteLength }
  })
  const manifest = {
    schemaVersion: 'web-import-review-bundle-v1', paperId,
    paperName: '合成验收卷（12 秒测试音，不是真题听力）',
    sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
    visibleStructureDigest: projection.visibleStructureDigest, analysisDigest: projection.analysisDigest,
    producerBuildId: 'external-review-e2e', files, resolvesIssueIds: [],
  }
  manifest.bundleDigest = reviewBundleDigest(manifest)
  const revision = store.createRevision(manifest).revision
  for (const file of files) {
    const upload = store.fileForUpload(revision.id, file.path)
    fs.mkdirSync(path.dirname(upload.destination), { recursive: true })
    fs.writeFileSync(upload.destination, fs.readFileSync(resolveReviewFile(reviewRoot, file.path)))
    store.completeFileUpload(revision.id, file.path, file)
  }
  store.finalizeRevision(revision.id)
  const exportOptions = { dbPath, filesRoot, revisionId: revision.id, expectedPaperId: paperId }
  for (const format of ['zip', 'directory']) {
    const destination = path.join(temporary, `existing-${format}${format === 'zip' ? '.zip' : ''}`)
    if (format === 'zip') fs.writeFileSync(destination, 'caller-owned archive')
    else fs.mkdirSync(destination)
    const inode = fs.statSync(destination).ino
    await assert.rejects(() => exportAnalyzedPackageRevision({ ...exportOptions, destination }))
    assert.equal(fs.statSync(destination).ino, inode)
    if (format === 'zip') assert.equal(fs.readFileSync(destination, 'utf8'), 'caller-owned archive')
    else assert.deepEqual(fs.readdirSync(destination), [])
  }
  // Inject the precise race after the preflight exists check but before installation.
  // An empty caller directory distinguishes no-replace from POSIX rename-over-empty.
  for (const format of ['zip', 'directory']) {
    const destination = path.join(temporary, `racing-${format}${format === 'zip' ? '.zip' : ''}`)
    const original = fs.mkdtempSync
    let inode
    fs.mkdtempSync = (...args) => {
      const result = original(...args)
      if (String(args[0]).includes('.analyzed-package-export-')) {
        if (format === 'zip') fs.writeFileSync(destination, 'concurrent archive')
        else fs.mkdirSync(destination)
        inode = fs.statSync(destination).ino
      }
      return result
    }
    syncBuiltinESMExports()
    try {
      await assert.rejects(() => exportAnalyzedPackageRevision({ ...exportOptions, destination }),
        (error) => error.code === 'EEXIST')
    } finally {
      fs.mkdtempSync = original
      syncBuiltinESMExports()
    }
    assert.equal(fs.statSync(destination).ino, inode, 'concurrent target must retain its identity')
    if (format === 'zip') assert.equal(fs.readFileSync(destination, 'utf8'), 'concurrent archive')
    else assert.deepEqual(fs.readdirSync(destination), [])
  }
  const exported = await exportAnalyzedPackageRevision({ ...exportOptions, destination: path.join(temporary, 'new-directory') })
  assert.equal(exported.format, 'directory')

  const { createServer: createViteServer } = await import('../app/node_modules/vite/dist/node/index.js')
  vite = await createViteServer({ root: path.join(root, 'app'), appType: 'custom',
    server: { middlewareMode: true }, logLevel: 'error' })
  const routes = createImportReviewRoutes({ getStore: () => store, buildPrintHtml })
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture')
      // Local synthetic actor only. This service has no production data or credentials.
      const session = request.headers.cookie?.includes('eqb-fixture-owner=1')
        ? { role: 'owner', accountKind: 'human', username: 'synthetic-owner' } : null
      const sendJson = (target, status, body) => {
        target.writeHead(status, { 'content-type': 'application/json' })
        target.end(JSON.stringify(body))
      }
      if (url.pathname === '/fixture-owner') {
        response.writeHead(302, { 'set-cookie': 'eqb-fixture-owner=1; HttpOnly; SameSite=Lax; Path=/', location: '/ops/' })
        return response.end()
      }
      if (url.pathname === '/api/auth/me') return sendJson(response, 200, { authRequired: true, user: session })
      if (url.pathname.startsWith('/ops/')) {
        const name = url.pathname === '/ops/' ? 'index.html' : path.basename(url.pathname)
        const file = path.join(root, 'import-ops/public', name)
        if (fs.existsSync(file)) {
          response.writeHead(200, { 'content-type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' })
          return response.end(fs.readFileSync(file))
        }
      }
      if (await runRoutes(routes, { request, response, url,
        context: { session, sendJson, readJsonBody: readJsonRouteBody } })) return
      if (url.pathname === '/') {
        const html = await vite.transformIndexHtml(request.url,
          fs.readFileSync(path.join(root, 'app/canonical-consumption-qa.html'), 'utf8'))
        response.writeHead(200, { 'content-type': 'text/html' }); return response.end(html)
      }
      vite.middlewares(request, response, () => { response.writeHead(404); response.end('Not found') })
    } catch (error) {
      response.writeHead(500); response.end(error.message)
    }
  })
  await new Promise((resolve) => server.listen(serve ? 4319 : 0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const teachingPath = `/api/import-reviews/papers/${paperId}/revisions/${revision.id}/teaching`
  assert.equal((await fetch(origin + teachingPath)).status, 403)
  if (serve) {
    console.log(`Synthetic external Review ready on port 4319 /fixture-owner; revision ${revision.id}. No approval or publication performed.`)
    await new Promise(() => {})
  }
  const playwright = await import('../app/node_modules/playwright/index.js')
  browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(origin + '/fixture-owner')
  await page.getByRole('heading', { name: '试卷审核' }).waitFor()
  assert.equal(await page.locator('#review-frame, [role="tab"], #approve-revision, [data-external-listening-check]').count(), 0,
    'compact Owner review has no iframe, teaching tab, approval button, or listening checkboxes')
  const paperLink = page.getByRole('link', { name: '合成验收卷（12 秒测试音，不是真题听力）' })
  const screenHref = new URL(await paperLink.getAttribute('href'), origin)
  assert.equal(screenHref.searchParams.get('view'), 'paper-browse')
  assert.equal(screenHref.searchParams.get('paperId'), paperId)
  assert.equal(screenHref.searchParams.get('reviewRevision'), revision.id)
  assert.equal(await paperLink.getAttribute('target'), '_blank')
  const screenPage = await context.newPage()
  await screenPage.goto(screenHref.toString())
  await screenPage.locator('[data-paper-paragraph-id]').first().waitFor()
  assert.equal(await screenPage.getByText('没找到这份卷面').count(), 0)
  const listRow = store.listPapers().find((paper) => paper.paperId === paperId)
  assert.equal(listRow.reviewKind, 'candidate')
  assert.equal(listRow.latestRevisionId, revision.id)
  assert.equal(typeof listRow.bundleDigest, 'string')
  assert.equal(listRow.rendererBuildId, 'external-review-e2e')
  assert.equal(typeof listRow.unresolvedCount, 'number')
  const sealed = store.projectionForRevision(revision.id)
  assert.equal(sealed.projection.listeningReview.audio.state, 'included_in_candidate_review')
  const audioFile = sealed.revision.manifest.files.find((file) =>
    file.role === 'analyzed_package_audio' && file.mediaType === 'audio/mpeg')
  assert(audioFile, 'sealed package keeps the playback MP3 as a revision file')
  const audioResponse = await page.context().request.get(
    `${origin}/api/import-review-preview/revisions/${revision.id}/files?path=${encodeURIComponent(audioFile.path)}`,
  )
  assert.equal(audioResponse.status(), 200)
  assert.match(audioResponse.headers()['content-type'] || '', /audio\/mpeg/)
  const audioPage = await context.newPage()
  await audioPage.setContent('<audio id="probe" controls></audio>')
  const playback = await audioPage.evaluate(async (bytes) => {
    const audio = document.querySelector('#probe')
    audio.src = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }))
    if (!Number.isFinite(audio.duration)) await new Promise((resolve, reject) => {
      audio.addEventListener('loadedmetadata', resolve, { once: true })
      audio.addEventListener('error', reject, { once: true })
    })
    await audio.play()
    await new Promise((resolve) => setTimeout(resolve, 400))
    return { duration: audio.duration, currentTime: audio.currentTime, paused: audio.paused, error: audio.error }
  }, [...new Uint8Array(await audioResponse.body())])
  assert(playback.duration > 11 && playback.duration < 13)
  assert.equal(playback.paused, false)
  assert.equal(playback.error, null)
  if (artifactDir) {
    fs.mkdirSync(artifactDir, { recursive: true })
    await page.screenshot({ path: path.join(artifactDir, 'external-review-audio.png') })
  }
  await audioPage.close()
  const teachingDocument = await context.newPage()
  await teachingDocument.goto(origin + teachingPath)
  const frame = teachingDocument.locator('body')
  await frame.locator('.listening-material').first().waitFor()
  assert.equal(await frame.locator('.listening-material').count(), 10)
  const targets = [
    ['listening', '.listening-material'],
    ['objective', '.question--reading'],
    ['application', '.review-card'],
    ['continuation', '[data-continuation-section="developmentPlan"]'],
  ]
  for (const [name, selector] of targets) {
    const target = frame.locator(selector).first()
    await target.scrollIntoViewIfNeeded()
    assert((await target.innerText()).length > 40, `${name}: actual teaching text, not just a tab or heading`)
    if (artifactDir) await teachingDocument.screenshot({ path: path.join(artifactDir, `external-review-${name}.png`) })
  }
  assert.equal(await frame.locator('.source-relationships p').first().locator('.translation-marker').count(), 1,
    'overlapping evidence and sentence-structure must not print the same question marker inside a word')
  assert.equal(await frame.locator('[data-continuation-section="modelAnswer"] div[lang="en"]').last().locator('p').count(), 2,
    'both synthetic continuation paragraphs survive sealed projection and companion rendering')
  const teaching = await page.context().request.get(origin + teachingPath)
  assert.equal(teaching.status(), 200)
  const htmlPath = path.join(temporary, 'companion.html')
  const pdfPath = path.join(temporary, 'companion.pdf')
  fs.writeFileSync(htmlPath, await teaching.text())
  // Use the production companion export engine, not Chromium's different column pagination.
  execFileSync(path.join(root, 'server/node_modules/.bin/vivliostyle'), ['build', htmlPath, '-o', pdfPath], { timeout: 120_000, stdio: 'pipe' })
  const firstPage = execFileSync('pdftotext', ['-f', '1', '-l', '1', pdfPath, '-'], { encoding: 'utf8' })
  assert.match(firstPage, /答案速查/)
  assert.match(firstPage, /听力材料/, 'teaching starts on the first sheet, not after an empty cover remainder')
  if (artifactDir) fs.copyFileSync(pdfPath, path.join(artifactDir, 'external-review-companion.pdf'))
  assert.equal(store.projectionForRevision(revision.id).revision.state, 'awaiting_review')
  console.log('PASS external package real sealed Review: six sidecars, 10 listening materials, 12s MP3 playback, compact Owner candidate link, teaching route, directory/ZIP no-overwrite regressions; no approval/publication')
} finally {
  await browser?.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  await vite?.close()
  fs.rmSync(temporary, { recursive: true, force: true })
}
