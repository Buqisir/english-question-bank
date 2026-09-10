#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { assertPaperFonts } from './lib/assert-paper-fonts.mjs'
import { assertSharedPaperLayout, assertWritingBoxesInsidePages } from './lib/assert-shared-paper-layout.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'

const artifacts = process.argv.includes('--actual-artifacts')
  ? path.resolve('.amp/in/artifacts/font-migration') : null
if (artifacts) mkdirSync(artifacts, { recursive: true })

const canaryRoot =
  'test-fixtures/paper-canonical/publications/ticket-31-canary-v1/store'
const paperIds = [
  'paper-960d0f8d',
  'paper-2025-ii',
  'paper-2023-yi',
  'paper-zj-2022-jun',
]

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function withRuntime(rootDir, run) {
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    return run(createCanonicalConsumerRuntime({ rootDir, db }))
  } finally {
    db.close()
  }
}

function makePublicExports({ rootDir, runtime, payload }) {
  return createExportImplementation({
    rootDir,
    exportDir: path.join(rootDir, '.ticket-31-exports'),
    getQuestionGroupDetail: (groupId) => payload.details.get(groupId) || null,
    buildPrintHtml,
    paperAssetsDir: rootDir,
    resolveCanonicalConsumption: runtime.resolveForItems,
  })
}

function exportWholePaper({ rootDir, runtime, paperId, versionType }) {
  const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
  assert.equal(consumption.disposition, 'ready')
  const payload = canonicalConsumptionPrintPayload(consumption)
  const result = makePublicExports({ rootDir, runtime, payload }).exportPrintHtml({
    ...payload,
    versionType,
  })
  assert.equal(
    (result.body.match(/data-canonical-group-id=/g) || []).length,
    payload.items.length,
    `${paperId} ${versionType} renders every canonical group exactly once`,
  )
  assert.equal(
    (result.body.match(/data-canonical-question-id=/g) || []).length > 0,
    true,
    `${paperId} ${versionType} emits canonical question identities`,
  )
  return { consumption, payload, html: result.body }
}

function expectRejected(action, label) {
  assert.throws(action, (error) => error?.code === 'CANONICAL_CONSUMPTION_REJECTED', label)
}

function structuredSourceArtifact(rootDir, paperId) {
  const versionDir = path.join(rootDir, paperId, 'versions', 'v1')
  const capture = JSON.parse(readFileSync(
    path.join(versionDir, 'canonical', 'source-capture-v1.json'),
    'utf8',
  ))
  const document = capture.documents.find(
    (candidate) => candidate.roles?.includes('structured_source'),
  )
  assert.ok(document?.immutableArtifactRef?.relativePath)
  return path.join(versionDir, document.immutableArtifactRef.relativePath)
}

function immutableAssetProjectionBytes(rootDir, paperId) {
  const versionDir = path.join(rootDir, paperId, 'versions', 'v1')
  const capture = JSON.parse(readFileSync(
    path.join(versionDir, 'paper-asset.json'),
    'utf8',
  ))
  const document = capture.documents.find(
    (candidate) => candidate.roles?.includes('asset-projection'),
  )
  assert.ok(document?.immutableArtifactRef?.relativePath)
  const bytes = readFileSync(path.join(
    versionDir,
    document.immutableArtifactRef.relativePath,
  ))
  assert.equal(
    `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    document.sha256,
    `${paperId} Screen source projection retains its immutable capture binding`,
  )
  return bytes
}

function assertLegacySourceBindingAdversaries() {
  const corruptRoot = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-31-binding-'))
  try {
    cpSync(canaryRoot, corruptRoot, { recursive: true })
    const target = structuredSourceArtifact(corruptRoot, 'paper-960d0f8d')
    const original = readFileSync(target)
    writeFileSync(target, Buffer.concat([original, Buffer.from(' ')]))
    withRuntime(corruptRoot, (runtime) => {
      expectRejected(
        () => exportWholePaper({
          rootDir: corruptRoot,
          runtime,
          paperId: 'paper-960d0f8d',
          versionType: 'student',
        }),
        'tampered structured legacy source is rejected at the public export seam',
      )
    })

    cpSync(canaryRoot, corruptRoot, { recursive: true, force: true })
    writeFileSync(
      structuredSourceArtifact(corruptRoot, 'paper-960d0f8d'),
      readFileSync(structuredSourceArtifact(corruptRoot, 'paper-2025-ii')),
    )
    withRuntime(corruptRoot, (runtime) => {
      expectRejected(
        () => exportWholePaper({
          rootDir: corruptRoot,
          runtime,
          paperId: 'paper-960d0f8d',
          versionType: 'student',
        }),
        'swapped structured legacy source is rejected at the public export seam',
      )
    })

    cpSync(canaryRoot, corruptRoot, { recursive: true, force: true })
    rmSync(structuredSourceArtifact(corruptRoot, 'paper-960d0f8d'))
    withRuntime(corruptRoot, (runtime) => {
      expectRejected(
        () => exportWholePaper({
          rootDir: corruptRoot,
          runtime,
          paperId: 'paper-960d0f8d',
          versionType: 'student',
        }),
        'missing structured legacy source is rejected at the public export seam',
      )
    })
  } finally {
    rmSync(corruptRoot, { recursive: true, force: true })
  }
}

async function assertPaginatedPdfs(exports) {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-31-pdf-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const observations = []
  try {
    for (const entry of exports) {
      const page = await browser.newPage()
      await page.setContent(entry.html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const printFonts = await assertPaperFonts(page, '.paper-print')
      const requiredLayout = entry.paperId === paperIds[0]
        ? ['seven', 'cloze', 'grammar', 'bank', 'options', 'cloze-cell', 'part', 'section', 'application', 'continuation'] : []
      await assertSharedPaperLayout(page, '.paper-print', requiredLayout)
      const pdfPath = path.join(outputDir, `${entry.paperId}-${entry.versionType}.pdf`)
      const result = await renderPaginatedPaper(entry.html, {
        inspect: async pagedPage => {
          await assertPaperFonts(pagedPage, '.pagedjs_pages')
          await assertWritingBoxesInsidePages(pagedPage)
          await assertSharedPaperLayout(pagedPage, '.pagedjs_pages', requiredLayout)
          if (artifacts && entry.paperId === paperIds[0]) {
            await pagedPage.setViewportSize({ width: 900, height: 1200 })
            await pagedPage.screenshot({ path: path.join(artifacts, `${entry.versionType}-paged.png`) })
          }
        },
      })
      const pdfBytes = result.pdfBytes
      writeFileSync(pdfPath, pdfBytes)
      if (artifacts && entry.paperId === paperIds[0]) cpSync(pdfPath, path.join(artifacts, `${entry.versionType}.pdf`))
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      const pdfInfo = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
      assert.match(pdfInfo, /Page size:\s+594\.96 x 841\.92 pts \(A4\)/)
      const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
      assert.equal(
        pdfText.includes('【答案】'),
        entry.versionType === 'teacher',
        `${entry.paperId} ${entry.versionType} PDF preserves answer visibility`,
      )
      observations.push({
        printFonts,
        paperId: entry.paperId,
        versionType: entry.versionType,
        sha256: sha256(pdfBytes),
        pageCount: Number(pdfInfo.match(/^Pages:\s+(\d+)$/m)?.[1]),
        answerMarkers: (pdfText.match(/【答案】/g) || []).length,
      })
      await page.close()
    }
  } finally {
    await browser.close()
    await closeChromiumPool()
    rmSync(outputDir, { recursive: true, force: true })
  }
  return observations
}

async function assertWholePaperScreen(consumptions) {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: new URL('../app', import.meta.url).pathname,
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const observations = []
  try {
    for (const consumption of consumptions) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
      const pageErrors = []
      page.on('pageerror', (error) => pageErrors.push(error.message))
      await page.route('**/api/paper-canonical/consumption?*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(consumption),
        }))
      await page.route('**/paper-assets/**/paper-asset.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: immutableAssetProjectionBytes(canaryRoot, consumption.paperId),
        }))
      await page.route('**/paper-assets/**/analyses/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      await page.route('**/paper-assets/**/figures/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      const url = new URL('canonical-consumption-qa.html', appUrl)
      url.searchParams.set('paperId', consumption.paperId)
      await page.goto(url.href)
      const expectedGroupIds = consumption.selections.flatMap(
        (selection) => selection.groupIds,
      )
      const groupCards = page.locator(
        'section.paper-browse-group-card[data-paper-browse-anchor]',
      )
      await groupCards.first().waitFor()
      assert.equal(
        await groupCards.count(),
        expectedGroupIds.length,
        `${consumption.paperId} Screen mounts every canonical group`,
      )
      for (const selection of consumption.selections) {
        for (const groupId of selection.groupIds) {
          const group = projectCanonicalConsumerGroup({
            consumption,
            familyContractId: selection.familyContractId,
            groupId,
          })
          const card = page.locator(
            `section.paper-browse-group-card[data-paper-browse-anchor="${groupId}"]`,
          )
          assert.equal(await card.count(), 1)
          assert.equal(
            await card.getAttribute('data-canonical-semantic-signature'),
            group.semanticSignature,
            `${consumption.paperId} Screen preserves ${groupId} canonical semantics`,
          )
        }
      }
      assert.equal(
        await page.locator('.paper-browse-group-card--error').count(),
        0,
        `${consumption.paperId} Screen has no group-level canonical error`,
      )
      assert.deepEqual(pageErrors, [])
      const screenFonts = await assertPaperFonts(page, '.paper-browse-zoom')
      await assertSharedPaperLayout(page, '.paper-browse-zoom', consumption.paperId === paperIds[0]
        ? ['seven', 'cloze', 'grammar', 'bank', 'options', 'cloze-cell', 'part', 'section', 'application', 'continuation'] : [])
      if (artifacts && consumption.paperId === paperIds[0]) {
        await page.screenshot({ path: path.join(artifacts, 'screen.png') })
      }
      observations.push({
        screenFonts,
        paperId: consumption.paperId,
        groupCount: expectedGroupIds.length,
        screenshotSha256: sha256(await page.screenshot({ fullPage: true })),
      })
      await page.setViewportSize({ width: 390, height: 844 })
      await assertPaperFonts(page, '.paper-browse-zoom')
      assert.equal(await groupCards.count(), expectedGroupIds.length)
      const rail = await page.locator('.paper-browse-rail').evaluate(el => {
        const bounds = el.getBoundingClientRect()
        const header = document.querySelector('.topbar').getBoundingClientRect()
        return { transform: getComputedStyle(el).transform, belowHeader: bounds.top >= header.bottom,
          insideViewport: bounds.left >= 0 && bounds.right <= innerWidth }
      })
      assert.deepEqual(rail, { transform: 'none', belowHeader: true, insideViewport: true })
      if (artifacts && consumption.paperId === paperIds[0]) {
        await page.screenshot({ path: path.join(artifacts, 'screen-narrow.png') })
      }
      await page.route('**/fonts/paper/**', route => route.fulfill({ status: 200, body: 'not a font' }))
      await page.reload()
      await page.getByRole('alert').filter({ hasText: '试卷字体加载失败' }).waitFor()
      assert.equal(await page.locator('.ps-surface').count(), 0)
      await page.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
  return observations
}

const exports = withRuntime(canaryRoot, (runtime) => paperIds.flatMap((paperId) =>
  ['student', 'teacher'].map((versionType) => ({
    ...exportWholePaper({ rootDir: canaryRoot, runtime, paperId, versionType }),
    paperId,
    versionType,
  })),
))
const screenConsumptions = withRuntime(canaryRoot, (runtime) =>
  paperIds.map((paperId) => runtime.load({ paperId, consumerId: 'screen' })),
)

assertLegacySourceBindingAdversaries()
const screenObservations = await assertWholePaperScreen(screenConsumptions)
const pdfObservations = await assertPaginatedPdfs(exports)

console.log('PASS Ticket 31 complete-paper canary public Print/PDF export')
console.log(JSON.stringify({
  canaries: paperIds,
  screen: screenObservations,
  print: exports.map((entry) => ({
    paperId: entry.paperId,
    versionType: entry.versionType,
    htmlSha256: sha256(entry.html),
    answerMarkers: (entry.html.match(/【答案】/g) || []).length,
  })),
  paginatedPdf: pdfObservations,
  adversarialSourceBinding: [
    'valid legacy publication passes',
    'tampered structured source rejects',
    'swapped structured source rejects',
    'missing structured source rejects',
  ],
}))
