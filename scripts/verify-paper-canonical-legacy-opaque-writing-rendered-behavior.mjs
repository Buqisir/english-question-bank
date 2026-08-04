#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'

function compactText(value) {
  return value.replaceAll(/\s/g, '')
}

function confirmedOpaqueWriting(capturePath, familyContractId) {
  const captureBytes = new Uint8Array(readFileSync(capturePath))
  const imported = importCanonicalCandidate({
    kind: 'ticket-26-source-capture-v1',
    sourceCaptureBytes: captureBytes,
  })
  assert.ok(imported.candidate)
  const confirmed = confirmCanonicalCandidate(imported.candidate, {
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    confirmed: true,
  })
  assert.ok(confirmed.canonicalPaper)
  assert.equal('publication' in confirmed, false)
  const projected = projectCanonicalPaper({
    plan: confirmed.canonicalPaper.paperPlan,
    groups: confirmed.canonicalPaper.questionGroups,
    sourceCapture: confirmed.canonicalPaper.sourceCapture,
  })
  const occurrence = projected.nodes.find((node) =>
    node.kind === 'group' && node.familyContractId === familyContractId)
  assert.ok(occurrence)
  return {
    occurrence,
    consumption: {
      disposition: 'ready',
      paperId: projected.paperId,
      selections: [{
        mode: 'canonical',
        familyContractId,
        groupIds: [occurrence.groupId],
        projectedOccurrences: [occurrence],
      }],
    },
  }
}

const cases = [
  {
    label: 'application',
    familyContractId: 'application-writing',
    capturePath: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-2020-i/source-capture-v1.json',
    score: 15,
    screen: buildCanonicalApplicationWritingConsumptionSurfaceData,
  },
  {
    label: 'continuation',
    familyContractId: 'continuation-writing',
    capturePath: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-zj-2022-jun/source-capture-v1.json',
    score: 25,
    screen: buildCanonicalContinuationWritingConsumptionSurfaceData,
  },
]

const rendered = []
for (const testCase of cases) {
  const { occurrence, consumption } = confirmedOpaqueWriting(
    testCase.capturePath,
    testCase.familyContractId,
  )
  const canonical = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: testCase.familyContractId,
    groupId: occurrence.groupId,
  })
  assert.equal(canonical.writingMode, 'legacy_opaque')
  assert.equal(canonical.answerRegion.ownership, 'product')
  assert.deepEqual(
    canonical.sourceBlocks.map((block) => block.nodeId),
    occurrence.sourceBlocks.map((block) => block.nodeId),
    `${testCase.label}: consumer keeps every source block in projector order`,
  )
  assert.equal('wordCountRuling' in canonical, false)
  assert.equal('situation' in canonical, false)
  assert.equal('contentRequirements' in canonical, false)
  assert.equal('starterLines' in canonical.answerRegion, false)

  const screen = testCase.screen({
    consumption,
    groupId: occurrence.groupId,
    renderedGroupIds: [occurrence.groupId],
  })
  const screenAnswerBox = screen.pageModel.blocks.at(-1)
  assert.deepEqual(
    screen.surfaceData.textMap.paragraphs.map((paragraph) => paragraph.id),
    canonical.sourceBlocks.map((block) => block.nodeId),
    `${testCase.label}: Screen source text remains in complete source order`,
  )
  assert.equal(screenAnswerBox.kind, 'answerBox')
  assert.equal(screenAnswerBox.ownership, 'product')
  assert.equal(screenAnswerBox.label, '写作答题区')
  assert.deepEqual(screenAnswerBox.givenTop, [])
  assert.deepEqual(screenAnswerBox.givenBottom, [])

  const html = buildPrintHtml({
    title: `Opaque ${testCase.label}`,
    versionType: 'student',
    printStyle: 'exam',
    items: [{
      detail: {
        id: occurrence.groupId,
        paperId: consumption.paperId,
        title: 'POISONED LEGACY TITLE',
        source: 'POISONED LEGACY SOURCE',
        groupType: 'writing',
        passage: { materialText: 'POISONED LEGACY MATERIAL' },
        writingTask: {
          taskType: 'application',
          continuationStarters: ['POISONED LEGACY STARTER'],
        },
        questions: [],
      },
      score: testCase.score,
      sectionTitle: 'POISONED LEGACY SECTION',
      note: 'POISONED LEGACY NOTE',
    }],
    blocks: [{
      type: 'question_group',
      questionGroupId: occurrence.groupId,
      score: testCase.score,
    }],
    questionNumberStart: 1,
    canonicalConsumption: consumption,
  })
  assert.equal(html.includes('POISONED LEGACY'), false)
  assert.equal((html.match(/data-canonical-legacy-opaque-source-block=/g) || []).length, canonical.sourceBlocks.length)
  assert.equal((html.match(/data-canonical-legacy-opaque-response=/g) || []).length, 1)
  assert.equal(html.includes('data-canonical-response-ownership="product"'), true)
  assert.equal(html.includes('data-canonical-given-part-id='), false)
  assert.equal(html.includes('data-canonical-starter-id='), false)
  const lastSourceBlock = canonical.sourceBlocks.at(-1)
  assert.ok(html.indexOf(`data-canonical-block-id="${lastSourceBlock.nodeId}"`) < html.indexOf('data-canonical-legacy-opaque-response='))
  for (const block of canonical.sourceBlocks) {
    assert.equal(compactText(html).includes(compactText(block.text)), true)
  }
  rendered.push({ ...testCase, canonical, consumption, html })
}

async function assertActualOpaqueScreenArtifacts() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  try {
    for (const { label, canonical, consumption } of rendered) {
      const isApplication = label === 'application'
      const qaPath = isApplication
        ? 'canonical-application-writing-qa.html'
        : 'canonical-continuation-writing-qa.html'
      const consumptionPath = isApplication
        ? '**/qa/canonical-application-writing-consumption.json'
        : '**/qa/canonical-continuation-writing-consumption.json'
      const sourceSelector = isApplication
        ? '[data-canonical-application-prompt] > [data-canonical-block-id]'
        : '[data-canonical-continuation-material] > [data-canonical-block-id]'
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      try {
        await page.route(consumptionPath, (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(consumption),
        }))
        const url = new URL(qaPath, appUrl)
        url.searchParams.set('groupId', canonical.groupId)
        await page.goto(url.href)

        const response = page.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        await response.waitFor()
        assert.equal(await response.count(), 1)
        assert.equal(
          await response.getAttribute('data-canonical-response-ownership'),
          'product',
          `${label}: Screen renders the product-owned generic response region`,
        )
        assert.equal(await response.getAttribute('aria-label'), '写作答题区')
        assert.equal(await response.locator('[data-canonical-block-id]').count(), 0)
        assert.equal(await page.locator('[data-canonical-given-part-id]').count(), 0)
        assert.equal(await page.locator('[data-canonical-starter-id]').count(), 0)

        assert.deepEqual(
          await page.locator(sourceSelector).evaluateAll((elements) => elements.map(
            (element) => element.getAttribute('data-canonical-block-id'),
          )),
          canonical.sourceBlocks.map((block) => block.nodeId),
          `${label}: Screen renders every frozen source block in source order`,
        )
        for (const block of canonical.sourceBlocks) {
          const sourceBlock = page.locator(
            `${sourceSelector}[data-canonical-block-id="${block.nodeId}"]`,
          )
          assert.equal(await sourceBlock.count(), 1)
          assert.equal(
            compactText(await sourceBlock.innerText()).includes(compactText(block.text)),
            true,
            `${label}: Screen visibly retains ${block.nodeId}`,
          )
        }
        const lastSourceBlock = page.locator(sourceSelector).last()
        const [lastSourceBottom, responseTop] = await Promise.all([
          lastSourceBlock.evaluate((element) => element.getBoundingClientRect().bottom),
          response.evaluate((element) => element.getBoundingClientRect().top),
        ])
        assert.ok(
          responseTop >= lastSourceBottom,
          `${label}: generic response follows the complete frozen source stream`,
        )
      } finally {
        await page.close()
      }
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertActualOpaqueScreenArtifacts()

const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
try {
  for (const { label, canonical, html } of rendered) {
    const pdfRoot = mkdtempSync(path.join(tmpdir(), 'eqb-legacy-opaque-writing-'))
    try {
      const pdfPath = path.join(pdfRoot, `${label}.pdf`)
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      await page.close()
      const pdfBytes = readFileSync(pdfPath)
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      const pdfText = compactText(execFileSync(
        'pdftotext',
        ['-layout', pdfPath, '-'],
        { encoding: 'utf8' },
      ))
      for (const block of canonical.sourceBlocks) {
        assert.equal(pdfText.includes(compactText(block.text)), true, `${label}: PDF retains ${block.nodeId}`)
      }
    } finally {
      rmSync(pdfRoot, { recursive: true, force: true })
    }
  }
} finally {
  await browser.close()
}

console.log('paper canonical legacy opaque writing rendered behavior verification passed')
