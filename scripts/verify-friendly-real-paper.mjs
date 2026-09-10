#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { planFixedPagePdf } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

const head = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
const valueAfter = (name, fallback) => {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}
const targetPages = Number(valueAfter('--pages', '8'))
assert.ok([8, 10].includes(targetPages))
const omitCover = process.argv.includes('--omit-cover')
const stem = `friendly-real-paper-${targetPages}${omitCover ? '-special' : ''}`
const inputKind = targetPages === 8 ? 'complete real nine-group paper-2026-i'
  : 'local composition of real paper-2026-i and its hash-bound 20 listening questions; not a publication'
const inputPath = path.resolve(valueAfter(
  '--html',
  `.scratch/ticket-35-owner-qa/${head}/print-student.html`,
))
const outputDir = path.resolve(valueAfter(
  '--output',
  '.amp/in/artifacts/listening-layout-final',
))
const html = readFileSync(inputPath, 'utf8')
const groupIds = [...html.matchAll(/<section\b[^>]*data-canonical-group-id="([^"]+)"/g)]
  .map((match) => match[1])
const expectedGroupIds = [
  ...(targetPages === 10 ? ['group:paper-2026-i:listening.short-dialogue', 'group:paper-2026-i:listening.long-form'] : []),
  'group-2026-i-reading-a',
  'group-2026-i-reading-b',
  'group-2026-i-reading-c',
  'group-2026-i-reading-d',
  'group-2026-i-seven-choices',
  'group-2026-i-cloze',
  'group-2026-i-grammar-fill',
  'group-2026-i-writing-application',
  'group-2026-i-writing-continuation',
]
assert.deepEqual(groupIds, expectedGroupIds, 'input is the complete paper in canonical order')
if (targetPages === 8) assert.doesNotMatch(html, /<section\b[^>]*data-canonical-group-type="listening"/, 'friendly8 source excludes listening groups')
assert.match(html, /group-2026-i-reading-a[\s\S]*<figure[\s\S]*<img\b[^>]*src="data:image\/png;base64,/, 'Reading A is multimodal with an inline real figure')
assert.match(html, /When attending an event at SoFi Stadium[\s\S]*Make sure to download your parking pass/, 'Reading A retains its long prose, not an abbreviated universal fixture')

mkdirSync(outputDir, { recursive: true })
const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
let decodedFigures
let sourceGroupTexts
try {
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'load' })
  sourceGroupTexts = await page.locator('section[data-canonical-group-id]').allTextContents()
  decodedFigures = await page.locator('img').evaluateAll((images) => images.map((image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
    currentSrcPrefix: image.currentSrc.slice(0, 22),
  })))
} finally {
  await browser.close()
}
assert.equal(decodedFigures.length, 1, 'the real paper has its Reading A figure')
assert.equal(decodedFigures.every(({ complete, naturalWidth, naturalHeight }) => complete && naturalWidth > 0 && naturalHeight > 0), true, 'every source figure decodes to real pixels')
const retainedTextMarkers = [
  'When attending an event at SoFi Stadium',
  'Make sure to download your parking pass',
  'Ranking My College Life Essentials',
  'Emily Sanders, a 25-year-old from Detroit',
]
const assertPdfTextRetention = (pdfPath) => {
  const pdfText = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
  for (const retained of retainedTextMarkers) {
    assert.match(pdfText, new RegExp(retained.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `PDF retains: ${retained}`)
  }
}

let result
const coverMeasurements = []
try {
  result = await planFixedPagePdf(html, { targetPages, omitCover, render: (candidate, options) => renderPaginatedPaper(candidate, {
    inspect: async (page) => {
      const measurement = await page.evaluate(() => {
        const cover = document.querySelector('.pagedjs_pages .canonical-paper-opening')
        const title = document.querySelector('.pagedjs_pages .canonical-paper-cover-title')
        const group = document.querySelector('.pagedjs_pages section[data-canonical-group-id]')
        return { coverVisible: Boolean(cover && cover.getBoundingClientRect().height > 0),
          topPx: cover ? parseFloat(getComputedStyle(cover).paddingTop) : null,
          belowPx: title ? parseFloat(getComputedStyle(title).marginBottom) : null,
          bodyFont: [getComputedStyle(group).fontFamily, getComputedStyle(group).fontSize, getComputedStyle(group).fontWeight].join('|'),
          bodyLineHeight: getComputedStyle(group).lineHeight }
      })
      coverMeasurements.push(measurement)
      assert.equal(measurement.coverVisible, !omitCover)
      assert.equal(measurement.bodyFont, coverMeasurements[0].bodyFont)
      assert.equal(measurement.bodyLineHeight, coverMeasurements[0].bodyLineHeight)
      const splitProtectedBlocks = await page.evaluate((relaxed) => {
        const seen = new Map()
        const split = []
        const bank = relaxed ? '' : ', .pagedjs_pages .canonical-option-bank-region'
        for (const block of document.querySelectorAll('.pagedjs_pages .question, .pagedjs_pages .canonical-option-bank-item, .pagedjs_pages .canonical-listening-chrome' + bank)) {
          const id = block.getAttribute('data-ref')
          const sheet = block.closest('.pagedjs_page').getAttribute('data-page-number')
          if (seen.has(id) && seen.get(id) !== sheet) split.push({ id, className: block.className })
          seen.set(id, sheet)
        }
        return split
      }, candidate.includes('data-pdf-option-bank-fallback'))
      assert.deepEqual(splitProtectedBlocks, [], 'questions/options, listening instructions and seven-choice banks stay intact')
      const texts = await page.locator('.pagedjs_pages section[data-canonical-group-id]').evaluateAll((groups) => {
        const byId = new Map()
        for (const group of groups) {
          const id = group.getAttribute('data-canonical-group-id')
          byId.set(id, (byId.get(id) || '') + group.textContent)
        }
        return [...byId.values()]
      })
      const normalize = (text) => text.replace(/\s+/gu, '')
      assert.deepEqual(texts.map(normalize), sourceGroupTexts.map(normalize), 'every group retains its full text')
      return options.inspect(page)
    },
  }) })
} catch (error) {
  if (error?.code !== 'PAPER_FIXED_PAGE_IMPOSSIBLE') throw error
  const natural = await renderPaginatedPaper(html)
  const diagnosticStem = `friendly-real-paper-natural-${natural.pageCount}`
  const diagnosticPdf = path.join(outputDir, `${diagnosticStem}.pdf`)
  writeFileSync(diagnosticPdf, natural.pdfBytes)
  assertPdfTextRetention(diagnosticPdf)
  execFileSync('pdftoppm', [
    '-png', '-r', '120', diagnosticPdf,
    path.join(outputDir, `${diagnosticStem}-page`),
  ])
  writeFileSync(path.join(outputDir, `${stem}-impossible.json`), `${JSON.stringify({
    input: path.relative(process.cwd(), inputPath),
    inputKind,
    longMultimodalA: { groupId: 'group-2026-i-reading-a', figures: decodedFigures },
    constraint: { targetPages: error.targetPages, actualNaturalPages: error.actualPages },
    searchedCandidates: error.searchedCandidates,
    exactFailure: error.message,
    pdfTextMarkersRetained: retainedTextMarkers,
    naturalGroupOrder: natural.inspection?.map(({ id }) => id) || groupIds,
    diagnosticPdf: path.basename(diagnosticPdf),
  }, null, 2)}\n`)
  throw Object.assign(new Error(`${error.message} Diagnostic artifacts: ${outputDir}`), {
    cause: error,
    code: error.code,
  })
} finally {
  await closeChromiumPool()
}
assert.equal(result.pageCount, targetPages, 'actual complete paper reaches exact target pages')
assert.equal(result.pdfBytes.subarray(0, 4).toString(), '%PDF')
const renderedGroupIds = result.inspection.map(({ id }) => id)
assert.deepEqual(renderedGroupIds, expectedGroupIds, 'Paged DOM retains canonical group order')

const pdfPath = path.join(outputDir, `${stem}.pdf`)
const rasterPrefix = path.join(outputDir, `${stem}-page`)
writeFileSync(pdfPath, result.pdfBytes)
for (const old of execFileSync('find', [outputDir, '-maxdepth', '1', '-name', `${stem}-page-*.png`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)) rmSync(old)
execFileSync('pdftoppm', ['-png', '-r', '120', pdfPath, rasterPrefix])
assertPdfTextRetention(pdfPath)

const evidence = {
  input: path.relative(process.cwd(), inputPath),
  inputKind,
  longMultimodalA: {
    groupId: 'group-2026-i-reading-a',
    proseMarkersRetained: true,
    figures: decodedFigures,
  },
  pageCount: result.pageCount,
  groupOrder: renderedGroupIds,
  groupPages: result.inspection.map(({ id, pages }) => ({ id, pages })),
  plannedBreakGroupIds: result.plannedBreakGroupIds,
  searchedCandidates: result.searchedCandidates,
  coverGapsPt: result.coverGapsPt,
  crossingGroupIds: result.crossingGroupIds,
  splitGroupIds: result.splitGroupIds,
  splitOptionBankCount: result.splitOptionBankCount,
  omitCover,
  coverMeasurements,
  pdfTextMarkersRetained: retainedTextMarkers,
  pdf: path.basename(pdfPath),
  rasterPages: targetPages,
}
writeFileSync(path.join(outputDir, `${stem}-evidence.json`), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`PASS friendly real paper: ${JSON.stringify(evidence)}`)
