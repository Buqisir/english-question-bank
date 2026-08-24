#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { buildCanonicalReadingConsumptionSurfaceData } from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  assertFramedColumnsFitsPrintPage,
  buildPrintHtml,
} from '../server/print-renderer.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  makeFramedColumnsCanonicalFixture,
} from '../test-fixtures/paper-canonical/framedColumnsFixture.mjs'

const FRAMED_GROUP_ID = 'group:reading.a'
const FRAMED_BLOCK_ID = 'framed-columns:puzzle-solution'

function collectReadingContentNodeIds(block) {
  if (block.kind === 'table') {
    return [
      block.nodeId,
      ...block.rows.flatMap((row) => [
        row.rowId,
        ...row.cells.flatMap((cell) => [
          cell.cellId,
          ...cell.inlines.map((inline) => inline.nodeId),
        ]),
      ]),
    ]
  }
  if (block.kind === 'framed_columns') {
    return [
      block.nodeId,
      ...block.columns.flatMap((column) => [
        column.columnId,
        ...column.blocks.flatMap((child) => collectReadingContentNodeIds(child)),
      ]),
    ]
  }
  if (block.kind === 'figure') return [block.nodeId]
  return [block.nodeId, ...block.inlines.map((inline) => inline.nodeId)]
}

async function publishAndLoad(fixture) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(
    compilation.disposition,
    'ready',
    compilation.artifacts.normalizationReport.diagnostics
      .map((item) => `${item.code}: ${item.message}`)
      .join('\n'),
  )
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-framed-columns-rendered-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    const consumption = await loadPaperForConsumption({
      paperId: compilation.artifacts.canonicalPaper.paperPlan.paperId,
      consumerContract: consumerContractRefs.screen,
    }, createFileSystemCanonicalPublicationStore({ rootDir, db }))
    assert.equal(consumption.disposition, 'ready')
    return { compilation, consumption }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function canonicalGroup(consumption, groupId) {
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId,
  })
}

function exportItem(group) {
  return {
    detail: {
      id: group.groupId,
      paperId: group.paperId,
      title: 'Canonical Framed Columns',
      source: 'Canonical Framed Columns',
      groupType: 'reading',
      passage: {
        title: 'POISONED LEGACY FRAMED COLUMNS',
        materialText: '〔表格：见原卷〕 [图: fake]',
      },
      questions: group.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: 'POISONED LEGACY ANSWER',
        explanation: '',
        options: [],
      })),
    },
    score: 2.5,
    sectionTitle: '阅读理解',
    note: '',
  }
}

function buildFramedColumnsPrintHtml(consumption, group, versionType = 'student') {
  return buildPrintHtml({
    title: 'Canonical Framed Columns QA',
    versionType,
    items: [exportItem(group)],
    blocks: [{
      type: 'question_group',
      questionGroupId: group.groupId,
      score: 2.5,
    }],
    questionNumberStart: 21,
    printStyle: 'exam',
    canonicalConsumption: consumption,
  })
}

function assertFramedColumnsMarkup(html, group) {
  const framed = group.blocks.find((block) => block.kind === 'framed_columns')
  assert.ok(framed)
  assert.equal(html.includes('data-canonical-block-kind="framed_columns"'), true)
  assert.equal(html.includes(`data-canonical-block-id="${framed.nodeId}"`), true)
  assert.equal(html.includes('[图:'), false)
  assert.equal(html.includes('〔表格：见原卷〕'), false)
  assert.equal(html.includes('data-canonical-block-kind="figure"'), false)
  assert.match(html, /\.canonical-reading-framed-columns \{[^}]*break-inside:\s*avoid/)
  assert.match(html, /\.canonical-reading-framed-columns \{[^}]*page-break-inside:\s*avoid/)
  for (const column of framed.columns) {
    assert.equal(html.includes(`data-canonical-column-id="${column.columnId}"`), true)
    if (column.columnHeading) {
      assert.match(
        html,
        new RegExp(
          `data-canonical-block-id="${column.columnHeading}"[^>]*data-canonical-column-heading=""`,
        ),
      )
    }
    for (const child of column.blocks) {
      assert.equal(html.includes(`data-canonical-block-id="${child.nodeId}"`), true)
      if (child.kind === 'table') {
        assert.equal(html.includes(`data-canonical-block-kind="table"`), true)
        for (const row of child.rows) {
          assert.equal(html.includes(`data-canonical-row-id="${row.rowId}"`), true)
          for (const cell of row.cells) {
            assert.equal(html.includes(`data-canonical-cell-id="${cell.cellId}"`), true)
          }
        }
      }
    }
  }
  assert.equal(html.includes('ბრაზილია'), true)
  assert.equal(html.includes('A Puzzle'), true)
  assert.equal(html.includes('The Solution'), true)
}

const fixture = makeFramedColumnsCanonicalFixture()
const published = await publishAndLoad(fixture)
const group = canonicalGroup(published.consumption, FRAMED_GROUP_ID)
assert.equal(group.groupType, 'reading')
assert.equal(group.blocks[1].kind, 'framed_columns')
assert.equal(group.blocks[1].columns[0].columnHeading, 'paragraph:puzzle-heading')
assert.equal(
  group.blocks[1].columns[0].blocks.find((block) => block.nodeId === 'paragraph:puzzle-heading').role,
  'body',
)

const surface = buildCanonicalReadingConsumptionSurfaceData({
  consumption: published.consumption,
  groupId: FRAMED_GROUP_ID,
})
assert.equal(surface.richBlocks[1].kind, 'framed_columns')
assert.equal(surface.richBlocks[1].columns[0].columnHeading, 'paragraph:puzzle-heading')

const studentHtml = buildFramedColumnsPrintHtml(published.consumption, group)
assertFramedColumnsMarkup(studentHtml, group)
assert.equal(studentHtml.includes('data-canonical-correct-option-id='), false)

const noHeadingConsumption = structuredClone(published.consumption)
const noHeadingOccurrence = noHeadingConsumption.selections
  .find((selection) => selection.familyContractId === 'reading')
  .projectedOccurrences
  .find((occurrence) => occurrence.groupId === FRAMED_GROUP_ID)
delete noHeadingOccurrence.blocks[1].columns[0].columnHeading
delete noHeadingOccurrence.content.blocks[1].columns[0].columnHeading
const noHeadingGroup = canonicalGroup(noHeadingConsumption, FRAMED_GROUP_ID)
assert.equal(noHeadingGroup.blocks[1].columns[0].columnHeading, undefined)
const noHeadingHtml = buildFramedColumnsPrintHtml(noHeadingConsumption, noHeadingGroup)
assert.equal(noHeadingHtml.includes('data-canonical-block-id="paragraph:puzzle-heading"'), true)
assert.equal(
  /data-canonical-block-id="paragraph:puzzle-heading"[^>]*data-canonical-column-heading=""/.test(noHeadingHtml),
  false,
)
assert.match(
  noHeadingHtml,
  /<p class="canonical-reading-body" data-canonical-block-id="paragraph:puzzle-heading"/,
)
assert.match(
  noHeadingHtml,
  /data-canonical-block-id="paragraph:solution-heading"[^>]*data-canonical-column-heading=""/,
)

const oversized = structuredClone(group.blocks[1])
for (let index = 0; index < 50; index += 1) {
  oversized.columns[0].blocks.push({
    kind: 'paragraph',
    nodeId: `paragraph:overflow:${index}`,
    role: 'body',
    text: `Overflow line ${index}.`,
    inlines: [{
      kind: 'text',
      nodeId: `text:overflow:${index}`,
      text: `Overflow line ${index}.`,
    }],
  })
}
assert.throws(
  () => assertFramedColumnsFitsPrintPage(oversized),
  (error) => error.code === 'CANONICAL_FRAMED_COLUMNS_EXCEEDS_PAGE',
)
assert.doesNotThrow(() => assertFramedColumnsFitsPrintPage(group.blocks[1]))

const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const persistActualArtifacts = process.argv.includes('--actual-artifacts')
const actualArtifactRoot = persistActualArtifacts
  ? path.resolve('.scratch/paper-canonical-framed-columns-qa', exactHead)
  : mkdtempSync(path.join(tmpdir(), 'eqb-framed-columns-artifacts-'))
mkdirSync(actualArtifactRoot, { recursive: true })
writeFileSync(path.join(actualArtifactRoot, 'framed-columns-student.html'), studentHtml)

async function assertActualBrowserArtifacts() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({
    headless: true,
    channel: 'chromium',
  })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    await page.route('**/qa/canonical-reading-consumption.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(published.consumption),
      }))
    const url = new URL('canonical-reading-qa.html', appUrl)
    url.searchParams.set('groupId', FRAMED_GROUP_ID)
    await page.goto(url.href)
    await page.locator('[data-canonical-reading-semantic-signature]').waitFor()
    assert.equal(
      await page.locator(`[data-canonical-block-id="${FRAMED_BLOCK_ID}"]`).count(),
      1,
    )
    assert.equal(
      await page.locator('[data-canonical-block-kind="framed_columns"]').count(),
      1,
    )
    assert.deepEqual(
      await page.locator('[data-canonical-block-id]').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-canonical-block-id'))),
      group.blocks.flatMap((block) => [
        block.nodeId,
        ...(block.kind === 'framed_columns'
          ? block.columns.flatMap((column) => column.blocks.map((child) => child.nodeId))
          : []),
      ]),
    )
    assert.deepEqual(
      await page.locator('[data-canonical-column-id]').evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('data-canonical-column-id'))),
      group.blocks[1].columns.map((column) => column.columnId),
    )
    assert.equal(await page.locator('table').count(), 1)
    assert.equal(await page.locator('table td').count(), 6)
    assert.equal(await page.locator('figure').count(), 0)
    assert.equal((await page.locator('body').innerText()).includes('见原卷'), false)
    assert.equal((await page.locator('body').innerText()).includes('[图:'), false)
    assert.equal(await page.locator('[data-canonical-column-heading]').count(), 2)
    const headingStyle = await page.locator(
      '[data-canonical-block-id="paragraph:puzzle-heading"]',
    ).evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        textIndent: style.textIndent,
      }
    })
    const headingWeight = headingStyle.fontWeight === 'bold'
      ? 700
      : Number(headingStyle.fontWeight)
    assert.ok(headingWeight >= 700, JSON.stringify(headingStyle))
    assert.equal(headingStyle.textAlign, 'center')
    assert.equal(Number.parseFloat(headingStyle.textIndent), 0)
    const columnBoxes = await page.locator('[data-canonical-column-id]').evaluateAll(
      (elements) => elements.map((element) => element.getBoundingClientRect().width),
    )
    assert.equal(columnBoxes.length, 2)
    assert.ok(
      Math.abs(columnBoxes[0] - columnBoxes[1]) <= 1,
      `columns must be equal width: ${columnBoxes.join(', ')}`,
    )
    const expectedInlineIds = group.blocks
      .flatMap((block) => collectReadingContentNodeIds(block))
      .filter((nodeId) => nodeId.startsWith('text:') || nodeId.startsWith('cell:'))
    const renderedInlineIds = await page.locator('[data-canonical-content-node-id]').evaluateAll(
      (elements) => elements.map((element) =>
        element.getAttribute('data-canonical-content-node-id')),
    )
    for (const nodeId of expectedInlineIds.filter((id) => id.startsWith('text:'))) {
      assert.equal(renderedInlineIds.includes(nodeId), true, `missing inline ${nodeId}`)
    }
    if (persistActualArtifacts) {
      await page.screenshot({
        path: path.join(actualArtifactRoot, 'screen-framed-columns.png'),
        fullPage: true,
      })
    }
    await page.close()

    const noHeadingPage = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    await noHeadingPage.route('**/qa/canonical-reading-consumption.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(noHeadingConsumption),
      }))
    const noHeadingUrl = new URL('canonical-reading-qa.html', appUrl)
    noHeadingUrl.searchParams.set('groupId', FRAMED_GROUP_ID)
    await noHeadingPage.goto(noHeadingUrl.href)
    await noHeadingPage.locator('[data-canonical-reading-semantic-signature]').waitFor()
    assert.equal(
      await noHeadingPage.locator(
        '[data-canonical-block-id="paragraph:puzzle-heading"][data-canonical-column-heading]',
      ).count(),
      0,
    )
    const unmarkedFirst = await noHeadingPage.locator(
      '[data-canonical-block-id="paragraph:puzzle-heading"]',
    ).evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        className: element.className,
        textAlign: style.textAlign,
        fontWeight: style.fontWeight,
      }
    })
    assert.equal(unmarkedFirst.className.includes('ps-canonical-reading-paragraph'), true)
    assert.notEqual(unmarkedFirst.textAlign, 'center')
    const unmarkedWeight = unmarkedFirst.fontWeight === 'normal'
      ? 400
      : Number(unmarkedFirst.fontWeight)
    assert.ok(unmarkedWeight < 600, JSON.stringify(unmarkedFirst))
    await noHeadingPage.close()

    const printPage = await browser.newPage()
    await printPage.setContent(studentHtml, { waitUntil: 'load' })
    assert.equal(
      await printPage.locator('[data-canonical-block-kind="framed_columns"]').count(),
      1,
    )
    assert.equal(await printPage.locator('[data-canonical-column-id]').count(), 2)
    assert.equal(await printPage.locator('table td').count(), 6)
    assert.equal(await printPage.locator('figure').count(), 0)
    const printColumns = await printPage.locator('[data-canonical-column-id]').evaluateAll(
      (elements) => elements.map((element) => element.getBoundingClientRect().width),
    )
    assert.ok(
      Math.abs(printColumns[0] - printColumns[1]) <= 1,
      `print columns must be equal width: ${printColumns.join(', ')}`,
    )
    const pdfPath = path.join(actualArtifactRoot, 'framed-columns-student.pdf')
    const pdfBytes = await printPage.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    })
    assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
    const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
      encoding: 'utf8',
    })
    assert.equal(pdfText.includes('POISONED LEGACY'), false)
    assert.equal(pdfText.includes('[图:'), false)
    assert.equal(pdfText.includes('A Puzzle'), true)
    assert.equal(pdfText.includes('The Solution'), true)
    assert.equal(pdfText.includes('Brazil'), true)
    assert.equal(pdfText.includes('ბრაზილია'), true)
    await printPage.close()
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertActualBrowserArtifacts()

if (!persistActualArtifacts) {
  rmSync(actualArtifactRoot, { recursive: true, force: true })
}

console.log('verify-paper-canonical-framed-columns-rendered: PASS')
