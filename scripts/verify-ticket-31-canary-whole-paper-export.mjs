#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
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

function groupTypeForPrint(groupType) {
  if (groupType === 'grammarFill') return 'grammar_cloze'
  if (groupType === 'sevenChoices') return 'seven_choices'
  if (groupType === 'continuation') return 'writing'
  return groupType
}

function canonicalPayload(consumption) {
  const groups = []
  for (const selection of consumption.selections) {
    for (const groupId of selection.groupIds) {
      const group = projectCanonicalConsumerGroup({
        consumption,
        familyContractId: selection.familyContractId,
        groupId,
      })
      groups.push({
        detail: {
          id: groupId,
          paperId: consumption.paperId,
          title: groupId,
          source: consumption.paperId,
          groupType: groupTypeForPrint(group.groupType),
          passage: { title: groupId, materialText: '' },
          questions: group.questions.map((question) => ({
            id: question.questionId,
            questionNo: String(question.questionNo),
            stem: question.stem ?? '',
            answer: question.correctOptionId
              ? question.options.find(
                (option) => option.optionId === question.correctOptionId,
              )?.label || ''
              : '',
            explanation: '',
            note: '',
            options: question.options.map((option) => ({
              label: option.label,
              content: option.text,
            })),
          })),
        },
        score: 0,
        sectionTitle: '',
        note: '',
      })
    }
  }
  const details = new Map(groups.map((group) => [group.detail.id, group.detail]))
  const blocks = consumption.visibleStructure.flatMap((node) => {
    if (node.kind === 'group') {
      return [{
        type: 'question_group',
        questionGroupId: node.groupId,
      }]
    }
    if (node.kind !== 'instruction' || node.renderPolicy !== 'render') {
      return []
    }
    if (node.placement === 'part_heading' || node.placement === 'section_heading') {
      return [{
        type: 'section_header',
        title: node.text,
        instructionId: node.instructionId,
      }]
    }
    if (node.placement === 'group_instruction') {
      return [{
        type: 'instruction',
        text: node.text,
        instructionId: node.instructionId,
      }]
    }
    return []
  })
  return {
    title: consumption.paperId,
    printStyle: 'exam',
    questionNumberStart: 1,
    items: groups.map((group) => ({ questionGroupId: group.detail.id })),
    blocks,
    details,
  }
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
  const payload = canonicalPayload(consumption)
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

async function assertDirectChromiumPdfs(exports) {
  const outputDir = mkdtempSync(path.join(tmpdir(), 'eqb-ticket-31-pdf-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  const observations = []
  try {
    for (const entry of exports) {
      const page = await browser.newPage()
      await page.setContent(entry.html, { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      const pdfPath = path.join(outputDir, `${entry.paperId}-${entry.versionType}.pdf`)
      const pdfBytes = await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
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
  const browser = await playwright.default.chromium.launch({ headless: true })
  const observations = []
  try {
    for (const consumption of consumptions) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
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
      observations.push({
        paperId: consumption.paperId,
        groupCount: expectedGroupIds.length,
        screenshotSha256: sha256(await page.screenshot({ fullPage: true })),
      })
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
const pdfObservations = await assertDirectChromiumPdfs(exports)

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
  directChromiumPdf: pdfObservations,
  adversarialSourceBinding: [
    'valid legacy publication passes',
    'tampered structured source rejects',
    'swapped structured source rejects',
    'missing structured source rejects',
  ],
}))
