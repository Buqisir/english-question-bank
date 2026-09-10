#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { continuationWritingPresentation } from '../shared/paper-canonical/writingPresentation.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'

execFileSync(process.execPath, ['scripts/generate-paper-presentation-authority.mjs', '--check'])
const artifactRoot = process.argv.includes('--actual-artifacts')
  ? path.resolve('.amp/in/artifacts/font-migration/universal-writing') : null
if (artifactRoot) mkdirSync(artifactRoot, { recursive: true })

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
    ambiguous: true,
  },
  {
    label: 'continuation',
    familyContractId: 'continuation-writing',
    capturePath: 'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-zj-2023-jan/source-capture-v1.json',
    score: 25,
    screen: buildCanonicalContinuationWritingConsumptionSurfaceData,
  },
]

const rendered = []
for (const testCase of cases.flatMap((testCase) => [testCase, { ...testCase, current: true }])) {
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

  if (testCase.current) consumption.consumerContractRef = consumerContractRefs.screen
  assert.deepEqual(projectCanonicalConsumerGroup({
    consumption, familyContractId: testCase.familyContractId, groupId: occurrence.groupId,
  }), canonical, 'presentation successor must not change the signed semantic projection')
  const expectedStarters = testCase.current && testCase.label === 'continuation' && !testCase.ambiguous
    ? occurrence.sourceStarterBlockRefs : []
  if (testCase.current && testCase.label === 'continuation' && !testCase.ambiguous) assert.equal(expectedStarters.length, 2)
  if (testCase.ambiguous) assert.equal(occurrence.sourceStarterBlockRefs.length, 3)
  const expectedMaterial = canonical.sourceBlocks.filter((block) => !expectedStarters.includes(block.nodeId))
  if (testCase.label === 'continuation') {
    const historical = JSON.parse(readFileSync('standards/paper-canonical/consumers/screen-v40.json', 'utf8'))
    assert.deepEqual(continuationWritingPresentation(canonical, {
      id: historical.consumerId, version: historical.version, digest: historical.contractDigest,
    }).starterLines, [], 'explicit historical consumer retains historical placement')
    assert.throws(() => continuationWritingPresentation(canonical, {
      ...consumerContractRefs.screen, digest: 'sha256:invalid',
    }), error => error.code === 'CANONICAL_CONSUMPTION_REJECTED')
  }

  const screen = testCase.screen({
    consumption,
    groupId: occurrence.groupId,
    renderedGroupIds: [occurrence.groupId],
  })
  const screenAnswerBox = screen.pageModel.blocks.at(-1)
  assert.deepEqual(
    screen.surfaceData.textMap.paragraphs.map((paragraph) => paragraph.id),
    expectedMaterial.map((block) => block.nodeId),
    `${testCase.label}: Screen source text remains in complete source order`,
  )
  assert.equal(screenAnswerBox.kind, 'answerBox')
  assert.equal(screenAnswerBox.ownership, 'product')
  assert.equal(screenAnswerBox.label, '写作答题区')
  assert.deepEqual(screenAnswerBox.givenTop.map((starter) => starter.contentRef), expectedStarters)
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
    canonicalConsumption: testCase.current
      ? { ...consumption, consumerContractRef: consumerContractRefs.print_pdf }
      : consumption,
  })
  assert.equal(html.includes('POISONED LEGACY'), false)
  assert.equal((html.match(/data-canonical-legacy-opaque-source-block=/g) || []).length, expectedMaterial.length)
  assert.equal((html.match(/data-canonical-legacy-opaque-response=/g) || []).length, 1)
  assert.equal(html.includes('data-canonical-response-ownership="product"'), true)
  assert.equal(html.includes('data-canonical-given-part-id='), false)
  assert.equal((html.match(/data-canonical-starter-id=/g) || []).length, expectedStarters.length)
  for (const ref of expectedStarters) {
    assert.equal(html.split(`data-canonical-block-id="${ref}"`).length - 1, 1)
    assert.ok(html.indexOf(`data-canonical-block-id="${ref}"`) > html.indexOf('data-canonical-legacy-opaque-response='))
  }
  const lastSourceBlock = expectedMaterial.at(-1)
  assert.ok(html.indexOf(`data-canonical-block-id="${lastSourceBlock.nodeId}"`) < html.indexOf('data-canonical-legacy-opaque-response='))
  for (const block of canonical.sourceBlocks) {
    assert.equal(compactText(html).includes(compactText(block.text)), true)
  }
  rendered.push({ ...testCase, canonical, consumption, html, expectedMaterial, expectedStarters })
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
    for (const { label, canonical, consumption, expectedMaterial, expectedStarters } of rendered) {
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
        assert.equal(await response.locator('[data-canonical-block-id]').count(), expectedStarters.length)
        assert.equal(await page.locator('[data-canonical-given-part-id]').count(), 0)
        assert.equal(await page.locator('[data-canonical-starter-id]').count(), expectedStarters.length)
        for (const ref of expectedStarters) {
          const starter = response.locator(`[data-canonical-block-id="${ref}"]`)
          assert.equal(await starter.count(), 1)
          const source = canonical.sourceBlocks.find(block => block.nodeId === ref)
          assert.ok(compactText(await starter.innerText()).includes(compactText(source.text)))
        }
        if (artifactRoot && expectedStarters.length === 2) {
          await page.setViewportSize({ width: 1280, height: 900 })
          await response.scrollIntoViewIfNeeded()
          await page.screenshot({ path: path.join(artifactRoot, 'continuation-screen.png') })
        }

        assert.deepEqual(
          await page.locator(sourceSelector).evaluateAll((elements) => elements.map(
            (element) => element.getAttribute('data-canonical-block-id'),
          )),
          expectedMaterial.map((block) => block.nodeId),
          `${label}: Screen renders every frozen source block in source order`,
        )
        for (const block of expectedMaterial) {
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

try {
  for (const { label, canonical, html, expectedStarters } of rendered) {
    const pdfRoot = mkdtempSync(path.join(tmpdir(), 'eqb-legacy-opaque-writing-'))
    try {
      const pdfPath = path.join(pdfRoot, `${label}.pdf`)
      const result = await renderPaginatedPaper(html, { inspect: async page => {
        if (artifactRoot && expectedStarters.length === 2) {
          await page.locator('.pagedjs_page').filter({ has: page.locator('.writing-answer-box') })
            .screenshot({ path: path.join(artifactRoot, 'continuation-paged.png') })
        }
      } })
      writeFileSync(pdfPath, result.pdfBytes)
      const pdfBytes = readFileSync(pdfPath)
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      const pdfText = compactText(execFileSync(
        'pdftotext',
        ['-raw', pdfPath, '-'],
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
  await closeChromiumPool()
}

console.log('paper canonical legacy opaque writing rendered behavior verification passed')
