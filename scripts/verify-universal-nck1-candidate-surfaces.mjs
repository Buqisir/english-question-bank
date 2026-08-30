#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import { buildPrintHtml } from '../server/print-renderer.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { continuationStarterDisplayText } from '../shared/paper-canonical/applicationWritingDisplay.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'

const root = path.resolve(import.meta.dirname, '..')
const papersRoot = path.join(root, 'scripts/import-pipeline/papers')
const outputDir = process.env.NCK1_SURFACE_OUTPUT_DIR
  ? path.resolve(process.env.NCK1_SURFACE_OUTPUT_DIR)
  : path.join(root, '.amp/in/artifacts/nck1-blind-qa')
const defaultPaperIds = [
  'paper-mock-cq-2026-m5',
  'paper-mock-foshan-2026-m1',
  'paper-mock-binzhou-2026-final',
]

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

function slug(paperId) {
  return paperId.replace(/^paper-mock-/, '').replace(/-2026(?:-m\d+|-final)?$/, '')
}

async function candidateConsumption(paperId, index) {
  const port = 45100 + index
  const child = spawn(
    process.execPath,
    ['scripts/import-pipeline/nck1-candidate-preview-server.mjs', paperId],
    {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  let logs = ''
  child.stdout.on('data', (chunk) => { logs += chunk })
  child.stderr.on('data', (chunk) => { logs += chunk })
  try {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(logs.trim() || `Preview server exited ${child.exitCode}`)
      try {
        const consumptionResponse = await fetch(`http://127.0.0.1:${port}/api/paper-canonical/consumption?paperId=${paperId}`)
        const assetResponse = await fetch(`http://127.0.0.1:${port}/paper-assets/${paperId}/latest/paper-asset.json`)
        if (consumptionResponse.ok && assetResponse.ok) {
          return {
            consumption: await consumptionResponse.json(),
            paperAsset: await assetResponse.json(),
          }
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`Timed out loading Candidate consumption for ${paperId}`)
  } finally {
    child.kill('SIGTERM')
    await new Promise((resolve) => {
      if (child.exitCode !== null) resolve()
      else child.once('exit', resolve)
    })
  }
}

function printConsumption(screenConsumption) {
  return {
    ...structuredClone(screenConsumption),
    consumerContractRef: structuredClone(consumerContractRefs.print_pdf),
  }
}

function config(paperId) {
  return JSON.parse(readFileSync(path.join(papersRoot, paperId, 'config.json'), 'utf8'))
}

function pageCount(pdfPath) {
  const bytes = readFileSync(pdfPath)
  assert.equal(bytes.subarray(0, 4).toString(), '%PDF')
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  return Number(info.match(/^Pages:\s+(\d+)$/m)?.[1])
}

function decodeHtmlText(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function normalizedRenderedText(value) {
  return value.replace(/\s+/gu, '')
}

function withoutSourceListMarker(value) {
  return value.replace(/^(?:\(\d+\)|（\d+）|\d+[.、])\s*/u, '')
}

function assertPdfTextPresence(pdfText, sourceText, message) {
  const rendered = normalizedRenderedText(pdfText)
  const expected = normalizedRenderedText(sourceText)
  if (rendered.includes(expected)) return
  // PDF text extraction may reorder bilingual parentheticals placed on the
  // same visual line, so use a short source-identity prefix as the canary.
  const edgeLength = Math.min(12, expected.length)
  assert.ok(
    edgeLength > 0 && rendered.includes(expected.slice(0, edgeLength)),
    message,
  )
}

function richParagraphTexts(blocks) {
  return (blocks || []).flatMap((block) => {
    if (block?.kind === 'paragraph') return [block.text]
    if (block?.kind === 'framed_columns') {
      return block.columns.flatMap((column) => richParagraphTexts(column.blocks))
    }
    if (block?.kind === 'figure' && block.caption) return [block.caption]
    return []
  }).filter(Boolean)
}

function richTableCount(blocks) {
  return (blocks || []).reduce((count, block) => {
    if (block?.kind === 'table') return count + 1
    if (block?.kind === 'framed_columns') {
      return count + block.columns.reduce(
        (columnCount, column) => columnCount + richTableCount(column.blocks),
        0,
      )
    }
    return count
  }, 0)
}

function canonicalParagraphTexts(group) {
  if (group.familyContractId === 'reading') return richParagraphTexts(group.blocks)
  if (Array.isArray(group.paragraphs)) {
    return group.paragraphs.flatMap((paragraph) => paragraph.nodes
      .filter((node) => node.type === 'text')
      .map((node) => node.text))
      .filter(Boolean)
  }
  if (group.familyContractId === 'application-writing') {
    return [
      ...group.promptBlocks.map((block) => withoutSourceListMarker(block.text)),
      ...group.answerRegion.givenTop.map((part) => part.text),
      ...group.answerRegion.givenBottom.map((part) => part.text),
    ]
  }
  if (group.familyContractId === 'continuation-writing') {
    return [
      ...group.materialBlocks.map((block) => withoutSourceListMarker(block.text)),
      ...group.answerRegion.starterLines.map((line, index) =>
        continuationStarterDisplayText(line.text, index)),
    ]
  }
  return []
}

function projectGroups(consumption) {
  return consumption.selections.flatMap((selection) => selection.groupIds.map((groupId) =>
    projectCanonicalConsumerGroup({
      consumption,
      familyContractId: selection.familyContractId,
      groupId,
    })))
}

async function startScreenServer() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const server = await vite.createServer({
    root: path.join(root, 'app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await server.listen()
  const appUrl = server.resolvedUrls?.local?.[0]
  assert.ok(appUrl, 'Vite exposes a local QA URL')
  return { server, appUrl }
}

mkdirSync(outputDir, { recursive: true })
const observations = []
const paperIds = process.argv.slice(2).length > 0 ? process.argv.slice(2) : defaultPaperIds
const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
const screenServer = await startScreenServer()
try {
  for (const [index, paperId] of paperIds.entries()) {
    const preview = await candidateConsumption(paperId, index)
    const consumption = printConsumption(preview.consumption)
    const title = config(paperId).provenance.paperName
    const answers = new Map(Object.entries(preview.paperAsset.answerKey.answers)
      .map(([questionId, answer]) => [questionId, answer.answer]))
    assert.equal(answers.size, 45, `${paperId} closes all 45 non-listening answers`)
    const groups = projectGroups(preview.consumption)
    const paragraphTexts = groups.flatMap(canonicalParagraphTexts)
    const pdfParagraphTexts = groups
      .filter((group) => !Array.isArray(group.paragraphs))
      .flatMap(canonicalParagraphTexts)
    const expectedTableCount = groups.reduce(
      (count, group) => count + richTableCount(group.blocks),
      0,
    )
    const expectedImageCount = groups.reduce((count, group) => count + (group.media?.length || 0), 0)
    const payload = canonicalConsumptionPrintPayload(consumption, title, answers)
    const items = payload.items.map((item) => ({
      detail: payload.details.get(item.questionGroupId),
      note: '',
      score: 0,
      sectionTitle: '',
    }))
    const paperObservation = { paperId, surfaces: {} }

    const screenPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const screenErrors = []
    screenPage.on('pageerror', (error) => screenErrors.push(error.message))
    await screenPage.route('**/api/paper-canonical/consumption?*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(preview.consumption),
    }))
    await screenPage.route('**/paper-assets/**/paper-asset.json', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(preview.paperAsset),
    }))
    await screenPage.route('**/paper-assets/**/analyses/**', (route) => route.fulfill({ status: 404, body: '' }))
    await screenPage.route('**/paper-assets/**/figures/**', (route) => route.fulfill({ status: 404, body: '' }))
    const screenUrl = new URL('canonical-consumption-qa.html', screenServer.appUrl)
    screenUrl.searchParams.set('paperId', paperId)
    await screenPage.goto(screenUrl.href)
    const screenCards = screenPage.locator('section.paper-browse-group-card[data-paper-browse-anchor]')
    await screenCards.first().waitFor()
    assert.equal(await screenCards.count(), groups.length, `${paperId} Screen renders every group once`)
    for (const group of groups) {
      const card = screenPage.locator(`section.paper-browse-group-card[data-paper-browse-anchor="${group.groupId}"]`)
      assert.equal(await card.count(), 1, `${paperId} Screen renders ${group.groupId}`)
      assert.equal(
        await card.getAttribute('data-canonical-semantic-signature'),
        group.semanticSignature,
        `${paperId} Screen preserves ${group.groupId} semantics`,
      )
      const cardText = normalizedRenderedText(await card.innerText())
      for (const text of canonicalParagraphTexts(group)) {
        assert.ok(cardText.includes(normalizedRenderedText(text)), `${paperId} Screen preserves source paragraph: ${text.slice(0, 40)}`)
      }
    }
    assert.equal(await screenPage.locator('.paper-browse-group-card--error').count(), 0)
    assert.equal(await screenPage.locator('[data-canonical-block-kind="table"]').count(), expectedTableCount)
    assert.equal(await screenPage.locator('img.ps-canonical-reading-table-media, img.ps-canonical-reading-figure').count(), expectedImageCount)
    const screenImageFailures = await screenPage.locator('img').evaluateAll((images) =>
      images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')))
    assert.deepEqual(screenImageFailures, [], `${paperId} Screen media loads`)
    assert.deepEqual(screenErrors, [], `${paperId} Screen has no page errors`)
    const screenPath = path.join(outputDir, `${slug(paperId)}-screen-full.png`)
    const screenBytes = await screenPage.screenshot({ path: screenPath, fullPage: true })
    paperObservation.surfaces.screen = {
      screenshot: path.relative(root, screenPath),
      screenshotSha256: sha256(screenBytes),
      groups: groups.length,
      paragraphs: paragraphTexts.length,
      tables: expectedTableCount,
      images: expectedImageCount,
    }
    await screenPage.close()

    for (const versionType of ['student', 'teacher']) {
      const htmlBody = buildPrintHtml({
        title,
        versionType,
        printStyle: payload.printStyle,
        items,
        blocks: payload.blocks,
        questionNumberStart: payload.questionNumberStart,
        canonicalConsumption: consumption,
      })
    assert.equal(
      (htmlBody.match(/data-canonical-group-id=/g) || []).length,
      payload.items.length,
      `${paperId} ${versionType} Print HTML renders every group once`,
    )
    assert.equal(
      (htmlBody.match(/【答案】/g) || []).length,
      versionType === 'teacher' ? answers.size : 0,
      `${paperId} ${versionType} Print HTML enforces answer visibility`,
    )
    if (versionType === 'teacher') {
      const renderedAnswers = [...htmlBody.matchAll(/<strong>【答案】<\/strong>([^<]*)/g)]
        .map((match) => decodeHtmlText(match[1]).trim())
      assert.deepEqual(renderedAnswers, [...answers.values()], `${paperId} Print HTML preserves every authoritative answer in order`)
      assert.equal(htmlBody.includes('【答案】待补'), false)
    }
    const htmlPath = path.join(outputDir, `${slug(paperId)}-${versionType}.html`)
    writeFileSync(htmlPath, htmlBody)
    const pdfPath = path.join(outputDir, `${slug(paperId)}-${versionType}.pdf`)
    const page = await browser.newPage()
    await page.setContent(htmlBody, { waitUntil: 'load' })
    await page.evaluate(() => document.fonts.ready)
    const imageFailures = await page.locator('img').evaluateAll((images) =>
      images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.getAttribute('src')))
    assert.deepEqual(imageFailures, [], `${paperId} ${versionType} Print media loads`)
    const imageCount = await page.locator('img').count()
    const printText = normalizedRenderedText(await page.locator('body').innerText())
    for (const text of paragraphTexts) {
      assert.ok(printText.includes(normalizedRenderedText(text)), `${paperId} ${versionType} Print preserves source paragraph: ${text.slice(0, 40)}`)
    }
    assert.equal(await page.locator('[data-canonical-block-kind="table"]').count(), expectedTableCount)
    assert.equal(imageCount, expectedImageCount)
    const pdfBytes = await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    await page.close()
    const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
    for (const text of pdfParagraphTexts) {
      assertPdfTextPresence(pdfText, text, `${paperId} ${versionType} PDF preserves source paragraph edges: ${text.slice(0, 40)}`)
    }
    assert.equal(
      (pdfText.match(/【答案】/g) || []).length,
      versionType === 'teacher' ? answers.size : 0,
      `${paperId} ${versionType} PDF enforces answer visibility`,
    )
    if (versionType === 'teacher') {
      const renderedAnswers = [...pdfText.matchAll(/【答案】([^\n]*)/g)]
        .map((match) => match[1].trim())
      assert.deepEqual(renderedAnswers, [...answers.values()], `${paperId} PDF preserves every authoritative answer in order`)
      assert.equal(pdfText.includes('【答案】待补'), false)
    }
    paperObservation.surfaces[versionType] = {
      html: path.relative(root, htmlPath),
      htmlSha256: sha256(htmlBody),
      pdf: path.relative(root, pdfPath),
      pdfSha256: sha256(pdfBytes),
      pageCount: pageCount(pdfPath),
      groups: payload.items.length,
      paragraphs: paragraphTexts.length,
      tables: expectedTableCount,
      images: imageCount,
    }
    }
    observations.push(paperObservation)
    console.log(`PASS ${paperId}: Student/Teacher Print HTML and PDF`)
  }
} finally {
  await screenServer.server.close()
  await browser.close()
}
const reportPath = path.join(outputDir, 'universal-nck1-candidate-surfaces.json')
writeFileSync(reportPath, `${JSON.stringify({ status: 'PASS', observations }, null, 2)}\n`)
console.log(`PASS universal NCK1 Candidate surfaces: ${path.relative(root, reportPath)}`)
