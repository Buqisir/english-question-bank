#!/usr/bin/env node

import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { digestJson, sha256, withoutKey } from '../shared/paper-canonical/stable.mjs'
import { rasterPdfRegion } from '../server/paper-canonical/pdfRegionRaster.mjs'
import { produceNck1DocxMaterialization } from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { makeSyntheticNck1DocxFixture } from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../shared/paper-canonical/compiler.mjs'
import { buildNck1ReviewConsumption, printConsumption } from '../server/import-review/revisionProjection.mjs'
import { validateNck1SourceMaterialization } from '../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { buildCanonicalReadingConsumptionSurfaceData } from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'

const fixture = makeSyntheticNck1DocxFixture({ mediaLayout: true })
const produced = produceNck1DocxMaterialization({ paperId: fixture.paperId, documents: fixture.sourceDocuments })
assert.equal(produced.disposition, 'ready_for_verification')
const materialization = structuredClone(produced.materialization)
materialization.schemaVersion = 'nck1-source-materialization-v3'
// Synthetic repeated source raster, with four separate occurrence identities.
// This tests transport/ownership, not source-faithful visual measurement.
const figures = 'ABCD'.split('').map((label) => ({
  ...structuredClone(materialization.media[0]),
  mediaId: `media:option-${label}`,
}))
materialization.media.push(...figures)
materialization.sourceCoverage.visuals.push(...figures.map((figure) => ({
  visualId: `visual:${figure.mediaId}`, page: 1, disposition: 'content_media', targetId: figure.mediaId,
})))
materialization.groups[0].questions[0].options = figures.map((figure, index) => ({
  label: 'ABCD'[index], figure: { mediaId: figure.mediaId },
}))
const media = [
  ...produced.mediaFiles.map(({ mediaId, bytes }) => ({ mediaId, bytes })),
  ...figures.map(({ mediaId }) => ({ mediaId, bytes: produced.mediaFiles[0].bytes })),
]
// Optional focused replay of the owner's original Q33; the surrounding paper
// remains synthetic. No copyrighted source PDF is committed as a fixture.
const sourcePdf = process.env.EQB_SHENZHEN_QUESTION_PDF
if (sourcePdf) {
  const bytes = new Uint8Array(readFileSync(sourcePdf))
  const sourceSha256 = sha256(bytes)
  assert.equal(sourceSha256, 'sha256:df0c4e0a0d1aee4557f122591e3b778d7b48f2f324d75dba120343bb00926c80')
  const documentId = 'shenzhen-question-source'
  materialization.documents.push({ documentId, role: 'question_source', mediaType: 'application/pdf', sha256: sourceSha256, byteLength: bytes.length, pageCount: 8 })
  fixture.sourceDocuments.push({ documentId, bytes })
  const target = materialization.groups[0].questions[0]
  target.source = { kind: 'page_region', documentId, page: 4, region: { x: 0, y: 0.69, width: 1, height: 0.1 } }
  target.stem = 'Q33 images only — synthetic question and answer, not the original Q33'
  const matrices = [
    [20.52, 0, 0, -51.48, 74.64, 658.56],
    [24.6, 0, 0, -51.96, 194.04, 658.56],
    [22.08, 0, 0, -51.96, 314.04, 657.84],
    [19.56, 0, 0, -51.96, 410.16, 659.52],
  ]
  const labels = [60, 180, 300, 396].map((leftPt, index) => ({ label: 'ABCD'[index], leftPt, topPt: 646, widthPt: 11.33, heightPt: 16 }))
  const measurementEvidenceBody = { schemaVersion: 'reading-source-layout-measurement-v1', questionId: target.questionId, sourcePdfSha256: sourceSha256, sourcePage: 4, pageWidthPt: 595, pageHeightPt: 841.9, coordinateSystem: 'question_page_top_left_pt', labels }
  const intent = {
    schemaVersion: 'reading-option-figure-source-layout-intent-v1', questionId: target.questionId,
    sourcePage: 4, coordinateSystem: 'question_content_box_pt',
    measurementEvidence: { kind: 'digest_bound_external_evidence', evidenceSchemaVersion: measurementEvidenceBody.schemaVersion, evidenceDigest: digestJson(measurementEvidenceBody), sourceDocumentSha256: sourceSha256 },
    rowStartPt: 24, rowWidthPt: 369.72, bankHeightPt: 56.12, labelFontSizePt: 10.5,
    labelLineHeightPt: 16, stemToBankGapPt: 4.5, questionTailGapPt: 9,
    placements: matrices.map((matrix, index) => ({
      optionId: `option:${target.questionId}:${'ABCD'[index]}`, label: 'ABCD'[index],
      sourceSpanId: `source-span:q33:${'ABCD'[index]}`, sourcePlacementMatrix: matrix,
      labelLeftPt: labels[index].leftPt - 60, labelTopPt: 40.12,
      imageLeftPt: matrix[4] - 60, imageTopPt: matrix[5] + matrix[3] - 605.88,
      imageWidthPt: matrix[0], imageHeightPt: -matrix[3],
    })),
  }
  intent.intentDigest = digestJson(intent)
  target.figureLayout = { intent, measurementEvidenceBody }
  matrices.forEach((matrix, index) => {
    const extraction = { kind: 'pdf_crop', documentId, page: 4, density: 300, region: { x: matrix[4] / 595, y: (matrix[5] + matrix[3]) / 841.9, width: matrix[0] / 595, height: -matrix[3] / 841.9 } }
    const raster = rasterPdfRegion({ pdfBytes: bytes, ...extraction })
    const figure = materialization.media.find((entry) => entry.mediaId === figures[index].mediaId)
    Object.assign(figure, { extraction, sha256: sha256(raster.bytes), pixelWidth: raster.pixelWidth, pixelHeight: raster.pixelHeight })
    figure.publication.sourceSha256 = figure.sha256
    media.find((entry) => entry.mediaId === figure.mediaId).bytes = raster.bytes
  })
  measurementEvidenceBody.images = figures.map(({ mediaId }) => {
    const captured = materialization.media.find((entry) => entry.mediaId === mediaId)
    return { mediaId, sha256: captured.sha256 }
  })
  intent.measurementEvidence.evidenceDigest = digestJson(measurementEvidenceBody)
  intent.intentDigest = digestJson(withoutKey(intent, 'intentDigest'))
}
function input(value = materialization) {
  return {
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(value)),
    documents: fixture.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media,
  }
}
const imported = importCanonicalCandidate(input())
assert.deepEqual(imported.issues, [])
const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
assert.deepEqual(preview.unresolvedIssues || [], [])
assert(preview.compilation)
const consumption = buildNck1ReviewConsumption(preview.candidate, preview.compilation)
const question = consumption.selections[0].projectedOccurrences[0].questions[0]
assert.deepEqual(question.options.map((option) => option.figure.mediaId), figures.map((figure) => figure.mediaId))
const surface = buildCanonicalReadingConsumptionSurfaceData({ consumption, groupId: consumption.selections[0].groupIds[0] })
assert.equal(Object.hasOwn(surface.surfaceData.questions[0], 'correctOptionId'), false, 'Student surface excludes official answer')

for (const [name, mutate] of [
  ['old schema', (value) => { value.schemaVersion = 'nck1-source-materialization-v2' }],
  ['mixed text', (value) => { value.groups[0].questions[0].options[0] = { label: 'A', text: 'Wrong mixed mode' } }],
  ['missing media', (value) => { value.groups[0].questions[0].options[0].figure.mediaId = 'missing' }],
  ['duplicate occurrence', (value) => { value.groups[0].questions[0].options[0].figure.mediaId = figures[1].mediaId }],
  ['malformed options', (value) => { value.groups[0].questions[0].options = {} }],
  ['non-reading family', (value) => { value.groups[5].questions[0].options = structuredClone(value.groups[0].questions[0].options) }],
]) {
  const invalid = structuredClone(materialization)
  mutate(invalid)
  assert(validateNck1SourceMaterialization(invalid).length > 0, `${name} must reject`)
  assert(importCanonicalCandidate(input(invalid)).issues.length > 0, `${name} cannot import`)
}
const tampered = input()
tampered.media = media.map((entry) => entry.mediaId === figures[0].mediaId
  ? { ...entry, bytes: new Uint8Array([1, 2, 3]) } : entry)
assert(importCanonicalCandidate(tampered).issues.length > 0, 'Changed image bytes must reject')
if (sourcePdf) {
  for (const change of ['digest', 'label', 'question', 'permutation', 'crop-page', 'crop-document', 'crop-box', 'locator-page', 'empty-placements', 'empty-images', 'empty-labels', 'zero-page', 'coordinate-system']) {
    const invalid = structuredClone(materialization)
    const target = invalid.groups[0].questions[0]
    const layout = target.figureLayout
    const image = invalid.media.find((entry) => entry.mediaId === figures[0].mediaId)
    if (change === 'digest') layout.intent.rowWidthPt += 1
    if (change === 'question') layout.intent.questionId = 'wrong-question'
    if (change === 'permutation') [target.options[0].figure, target.options[1].figure] = [target.options[1].figure, target.options[0].figure]
    if (change === 'crop-page') image.extraction.page = 3
    if (change === 'crop-document') image.extraction.documentId = 'question-source-1'
    if (change === 'crop-box') image.extraction.region.x += 0.01
    if (change === 'locator-page') target.source.page = 3
    if (change === 'empty-placements') layout.intent.placements = []
    if (change === 'empty-images') layout.measurementEvidenceBody.images = []
    if (change === 'empty-labels') layout.measurementEvidenceBody.labels = []
    if (change === 'zero-page') layout.measurementEvidenceBody.pageWidthPt = 0
    if (change === 'coordinate-system') layout.measurementEvidenceBody.coordinateSystem = 'invented'
    if (change === 'label') layout.measurementEvidenceBody.labels[0] = null
    if (change !== 'digest') {
      layout.intent.measurementEvidence.evidenceDigest = digestJson(layout.measurementEvidenceBody)
      layout.intent.intentDigest = digestJson(withoutKey(layout.intent, 'intentDigest'))
    }
    assert(validateNck1SourceMaterialization(invalid).length > 0, `Malformed ${change} must reject`)
  }
  const fabricated = structuredClone(materialization)
  const layout = fabricated.groups[0].questions[0].figureLayout
  layout.measurementEvidenceBody.labels.forEach((label) => { label.topPt += 10 })
  layout.intent.placements.forEach((placement) => { placement.labelTopPt += 10 })
  layout.intent.bankHeightPt += 10
  layout.intent.measurementEvidence.evidenceDigest = digestJson(layout.measurementEvidenceBody)
  layout.intent.intentDigest = digestJson(withoutKey(layout.intent, 'intentDigest'))
  assert.deepEqual(validateNck1SourceMaterialization(fabricated), [], 'Fabricated coordinates can be internally consistent')
  assert(importCanonicalCandidate(input(fabricated)).issues.some((issue) => issue.code === 'MATERIALIZATION_FIGURE_MEASUREMENT_UNVERIFIED'), 'Actual source PDF must reject internally consistent but fabricated label positions')
}

const printHtml = new Map()
for (const versionType of ['student', 'teacher']) {
  const print = printConsumption(consumption)
  const payload = canonicalConsumptionPrintPayload(print, 'Synthetic figure-option paper')
  const html = buildPrintHtml({
    title: payload.title, versionType, printStyle: payload.printStyle,
    items: payload.items.map((item) => ({ detail: payload.details.get(item.questionGroupId), note: '', score: 0, sectionTitle: '' })),
    blocks: payload.blocks, questionNumberStart: 1, canonicalConsumption: print,
  })
  assert.equal((html.match(/data-canonical-figure-options/g) || []).length, 1)
  for (const figure of figures) assert(html.includes(`data-canonical-media-id="${figure.mediaId}"`))
  assert.equal(html.includes('data-canonical-correct-option-id='), versionType === 'teacher')
  printHtml.set(versionType, html)
}

const { createServer } = await import('../app/node_modules/vite/dist/node/index.js')
const { chromium } = await import('../app/node_modules/playwright/index.mjs')
const vite = await createServer({ root: path.resolve('app'), server: { host: '127.0.0.1', port: 0 } })
await vite.listen()
const browser = await chromium.launch({ headless: true, channel: 'chromium' })
const artifacts = process.env.EQB_FIGURE_QA_ARTIFACTS
if (artifacts) mkdirSync(artifacts, { recursive: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  await page.route('**/qa/canonical-reading-consumption.json', (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(consumption),
  }))
  const url = new URL('canonical-reading-qa.html', vite.resolvedUrls.local[0])
  url.searchParams.set('groupId', consumption.selections[0].groupIds[0])
  await page.goto(url.href)
  async function checkImages() {
    const bank = page.locator('[data-canonical-figure-options]')
    await bank.waitFor()
    assert.equal(await bank.locator('img').count(), 4)
    const geometry = await bank.locator('img').evaluateAll((images) => images.map((image) => ({
      width: image.getBoundingClientRect().width, left: image.getBoundingClientRect().left,
      top: image.getBoundingClientRect().top, loaded: image.complete && image.naturalWidth > 0,
      fit: getComputedStyle(image).objectFit, alt: image.alt,
    })))
    geometry.forEach((image, index) => {
      assert(image.loaded && image.width > 0)
      assert.equal(image.fit, sourcePdf ? 'fill' : 'contain')
      assert.equal(image.alt, `Option ${'ABCD'[index]}`)
      if (sourcePdf) {
        const placement = materialization.groups[0].questions[0].figureLayout.intent.placements[index]
        assert(Math.abs(image.width - placement.imageWidthPt * 4 / 3) < 0.1)
        assert(Math.abs(image.left - geometry[0].left - (placement.imageLeftPt - 14.64) * 4 / 3) < 0.1)
      }
      if (index) {
        assert(image.left > geometry[index - 1].left)
        if (!sourcePdf) assert(Math.abs(image.top - geometry[0].top) < 1)
      }
    })
    return bank
  }
  await checkImages()
  assert.equal(await page.locator('[data-canonical-correct-option-id]').count(), 0)
  if (artifacts) await page.locator('.ps-question').first().screenshot({ path: path.join(artifacts, 'figure-options-screen.png') })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileBank = await checkImages()
  if (artifacts) await page.locator('.ps-question').first().screenshot({ path: path.join(artifacts, 'figure-options-mobile.png') })
  await mobileBank.evaluate((bank) => {
    const scroller = getComputedStyle(bank).position === 'relative' ? bank.parentElement : bank
    scroller.scrollLeft = scroller.scrollWidth
  })
  assert(await mobileBank.evaluate((bank) => {
    const lastImage = bank.querySelector('img:last-of-type')
    const images = bank.querySelectorAll('img')
    const right = images[images.length - 1].getBoundingClientRect().right
    const scroller = getComputedStyle(bank).position === 'relative' ? bank.parentElement : bank
    return lastImage && right <= scroller.getBoundingClientRect().right + 1
  }), 'Narrow screens must be able to scroll to option D')
  if (artifacts) await page.locator('.ps-question').first().screenshot({ path: path.join(artifacts, 'figure-options-mobile-scrolled.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  for (const [versionType, html] of printHtml) {
    await page.setContent(html, { waitUntil: 'load' })
    await checkImages()
    const pdf = await page.pdf({ format: 'A4', printBackground: true })
    assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
    assert(pdf.length > 10000)
    if (artifacts) {
      writeFileSync(path.join(artifacts, `figure-options-${versionType}.pdf`), pdf)
      await page.locator('.question').first().screenshot({ path: path.join(artifacts, `figure-options-${versionType}-print.png`) })
    }
  }
} finally {
  await browser.close()
  await vite.close()
}
console.log('verify-nck1-reading-figure-options: PASS')
