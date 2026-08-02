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
  rendered.push({ ...testCase, canonical, html })
}

const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true })
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
