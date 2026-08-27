#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  buildCanonicalApplicationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  makeApplicationWritingReferenceFixture,
} from '../test-fixtures/paper-canonical/applicationWritingReferenceFixture.mjs'

const posterPng = Object.freeze({
  pixelWidth: 160,
  pixelHeight: 80,
  encodedBytes: 'iVBORw0KGgoAAAANSUhEUgAAAKAAAABQCAYAAACeXX40AAAA+0lEQVR4nO3bsQkDAQwEwS/n+2/QbuJgkT0DlyvYVM8HQk99AP9NgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCkBEhKgKQESEqApARISoCk5gG+72s/viUBmgDt1pYEaAK0W1sSoAnQbm1JgCZAu7UlAZoA7daWBGgCtFtbEqAJ0G5tSYAmQLu1JQGaAO3WlvyEkBIgKQGSEiApAZISICkBkhIgKQGSEiApAZISICkBkhIgKQGSEiApAZISICkBkhIgKQGSEiApAZISIKkvO7Kh6t2kgxoAAAAASUVORK5CYII=',
})
const posterBytes = new Uint8Array(Buffer.from(posterPng.encodedBytes, 'base64'))
const posterSha256 = sha256(posterBytes)
const posterMediaId = 'media:application-writing:source-poster'
const posterArtifactId = 'source-document:application-writing-source-poster'
const posterBlockId = 'figure:application-writing-source-poster'
const posterCaptionId = 'text:application-writing-source-poster:caption'
const posterCaption = 'Source-authored event poster'

async function publishAndLoad(consumerContract) {
  const fixture = makeApplicationWritingReferenceFixture('paper-2026-i')
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-application-figure-'))
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
      paperId: fixture.paperId,
      consumerContract,
    }, createFileSystemCanonicalPublicationStore({ rootDir, db }))
    assert.equal(consumption.disposition, 'ready')
    return consumption
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function applicationSelection(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'application-writing',
  )
  assert.ok(selection)
  assert.equal(selection.projectedOccurrences.length, 1)
  return selection
}

function refreshOccurrenceDigest(selection) {
  if (!Array.isArray(selection.projectedOccurrenceDigests)) return
  const occurrence = selection.projectedOccurrences[0]
  const digest = selection.projectedOccurrenceDigests.find(
    (entry) => entry.groupId === occurrence.groupId,
  )
  assert.ok(digest)
  digest.digest = digestJson(occurrence)
}

function withApplicationFigure(sourceConsumption) {
  const consumption = structuredClone(sourceConsumption)
  const selection = applicationSelection(consumption)
  const occurrence = selection.projectedOccurrences[0]
  const media = {
    mediaId: posterMediaId,
    mimeType: 'image/png',
    sha256: posterSha256,
    pixelWidth: posterPng.pixelWidth,
    pixelHeight: posterPng.pixelHeight,
    sourceArtifactRef: { artifactId: posterArtifactId },
  }
  const mediaArtifact = {
    ...media,
    encodedBytes: posterPng.encodedBytes,
  }
  const figure = {
    kind: 'figure',
    nodeId: posterBlockId,
    mediaId: posterMediaId,
    caption: [{
      kind: 'text',
      nodeId: posterCaptionId,
      text: posterCaption,
    }],
  }
  occurrence.media = [...(occurrence.media || []), media]
  const firstPromptId = occurrence.prompt.blocks[0].nodeId
  const contentIndex = occurrence.content.blocks.findIndex(
    (block) => block.nodeId === firstPromptId,
  )
  assert.notEqual(contentIndex, -1)
  occurrence.content.blocks.splice(contentIndex + 1, 0, structuredClone(figure))
  occurrence.prompt.blocks.splice(1, 0, structuredClone(figure))
  occurrence.anchors.contentNodeIds.push(posterBlockId, posterCaptionId)
  consumption.mediaArtifacts = [
    ...(consumption.mediaArtifacts || []),
    mediaArtifact,
  ]
  refreshOccurrenceDigest(selection)
  return {
    consumption,
    groupId: occurrence.groupId,
    selection,
    occurrence,
  }
}

function projectApplication(consumption, groupId) {
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'application-writing',
    groupId,
  })
}

function applicationExportItem(paperId, groupId) {
  return {
    detail: {
      id: groupId,
      paperId,
      title: 'Poisoned legacy title',
      source: 'Poisoned legacy source',
      groupType: 'writing',
      passage: {
        title: 'Poisoned legacy passage',
        materialText: 'POISONED LEGACY PROMPT',
      },
      writingTask: { taskType: 'application' },
      questions: [],
    },
    score: 15,
    sectionTitle: 'Poisoned legacy section',
    note: 'Poisoned legacy instruction',
  }
}

function buildApplicationPrintHtml(consumption, groupId) {
  return buildPrintHtml({
    title: 'Application Figure Consumption',
    versionType: 'student',
    printStyle: 'exam',
    items: [applicationExportItem(consumption.paperId, groupId)],
    blocks: [{
      type: 'question_group',
      questionGroupId: groupId,
      score: 15,
    }],
    questionNumberStart: 1,
    canonicalConsumption: consumption,
  })
}

function assertProjectionRejects(baseConsumption, mutate) {
  const fixture = withApplicationFigure(baseConsumption)
  mutate(fixture)
  refreshOccurrenceDigest(fixture.selection)
  assert.throws(
    () => projectApplication(fixture.consumption, fixture.groupId),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
}

const screenBase = await publishAndLoad(consumerContractRefs.screen)
const screenFixture = withApplicationFigure(screenBase)
const screenProjection = projectApplication(
  screenFixture.consumption,
  screenFixture.groupId,
)
assert.deepEqual(
  screenProjection.promptBlocks.map((block) => ({
    kind: block.kind || 'paragraph',
    nodeId: block.nodeId,
  })),
  [
    { kind: 'paragraph', nodeId: screenFixture.occurrence.prompt.blocks[0].nodeId },
    { kind: 'figure', nodeId: posterBlockId },
    { kind: 'paragraph', nodeId: screenFixture.occurrence.prompt.blocks[2].nodeId },
  ],
)
const projectedFigure = screenProjection.promptBlocks[1]
assert.equal(projectedFigure.kind, 'figure')
assert.equal(projectedFigure.caption, posterCaption)
assert.equal(projectedFigure.media.sha256, posterSha256)
assert.equal(projectedFigure.mediaArtifact.encodedBytes, posterPng.encodedBytes)
assert.deepEqual(
  Object.keys(screenProjection.promptBlocks[0]).sort(),
  ['inlines', 'nodeId', 'text'],
  'paragraph projection remains byte-shape compatible',
)
const screenSurface = buildCanonicalApplicationWritingConsumptionSurfaceData({
  consumption: screenFixture.consumption,
  groupId: screenFixture.groupId,
})
assert.deepEqual(
  screenSurface.promptBlocks.map((block) => block.nodeId),
  screenProjection.promptBlocks.map((block) => block.nodeId),
)
assert.deepEqual(
  screenSurface.surfaceData.textMap.paragraphs.map((paragraph) => paragraph.id),
  screenProjection.promptBlocks
    .filter((block) => block.kind !== 'figure')
    .map((block) => block.nodeId),
  'the text position oracle excludes Figure bytes without reordering the prompt',
)

assertProjectionRejects(screenBase, ({ consumption }) => {
  const artifact = consumption.mediaArtifacts.find(
    (candidate) => candidate.mediaId === posterMediaId,
  )
  artifact.encodedBytes = `${artifact.encodedBytes.slice(0, -4)}AAAA`
})
assertProjectionRejects(screenBase, ({ consumption }) => {
  const artifact = consumption.mediaArtifacts.find(
    (candidate) => candidate.mediaId === posterMediaId,
  )
  artifact.pixelWidth += 1
})
assertProjectionRejects(screenBase, ({ consumption }) => {
  consumption.mediaArtifacts = consumption.mediaArtifacts.filter(
    (candidate) => candidate.mediaId !== posterMediaId,
  )
})
assertProjectionRejects(screenBase, ({ consumption, occurrence }) => {
  const artifact = consumption.mediaArtifacts.find(
    (candidate) => candidate.mediaId === posterMediaId,
  )
  const media = occurrence.media.find(
    (candidate) => candidate.mediaId === posterMediaId,
  )
  artifact.mimeType = 'image/jpeg'
  media.mimeType = 'image/jpeg'
})
assertProjectionRejects(screenBase, ({ occurrence }) => {
  occurrence.prompt.blocks.splice(1, 0, structuredClone(occurrence.prompt.blocks[1]))
})
assertProjectionRejects(screenBase, ({ occurrence }) => {
  occurrence.media.push({
    ...structuredClone(occurrence.media[0]),
    mediaId: 'media:application-writing:unplaced',
  })
})

const printBase = await publishAndLoad(consumerContractRefs.print_pdf)
const printFixture = withApplicationFigure(printBase)
const printProjection = projectApplication(
  printFixture.consumption,
  printFixture.groupId,
)
const printHtml = buildApplicationPrintHtml(
  printFixture.consumption,
  printFixture.groupId,
)
const printBlockIndexes = printProjection.promptBlocks.map((block) =>
  printHtml.indexOf(`data-canonical-block-id="${block.nodeId}"`))
assert.equal(printBlockIndexes.every((index) => index >= 0), true)
assert.deepEqual(printBlockIndexes, [...printBlockIndexes].sort((a, b) => a - b))
assert.equal(printHtml.includes(`data-canonical-media-id="${posterMediaId}"`), true)
assert.equal(printHtml.includes(`data-canonical-media-sha256="${posterSha256}"`), true)
assert.equal(printHtml.includes(`data:image/png;base64,${posterPng.encodedBytes}`), true)
assert.equal(printHtml.includes(posterCaption), true)
assert.equal(printHtml.includes('POISONED LEGACY'), false)

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
const artifactRoot = mkdtempSync(path.join(tmpdir(), 'eqb-application-figure-rendered-'))
try {
  const screenPage = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await screenPage.route(
    '**/qa/canonical-application-writing-consumption.json',
    (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(screenFixture.consumption),
    }),
  )
  const screenUrl = new URL('canonical-application-writing-qa.html', appUrl)
  screenUrl.searchParams.set('groupId', screenFixture.groupId)
  await screenPage.goto(screenUrl.href)
  const screenFigure = screenPage.locator(
    `[data-canonical-block-id="${posterBlockId}"][data-canonical-block-kind="figure"]`,
  )
  await screenFigure.waitFor()
  assert.deepEqual(
    await screenPage.locator(
      '[data-canonical-application-prompt] > [data-canonical-block-id]',
    ).evaluateAll((elements) => elements.map(
      (element) => element.getAttribute('data-canonical-block-id'),
    )),
    screenProjection.promptBlocks.map((block) => block.nodeId),
  )
  assert.equal(await screenFigure.getAttribute('data-canonical-media-id'), posterMediaId)
  assert.equal(await screenFigure.getAttribute('data-canonical-media-sha256'), posterSha256)
  assert.equal((await screenFigure.locator('figcaption').innerText()).trim(), posterCaption)
  assert.deepEqual(
    await screenFigure.locator('img').evaluate((image) => ({
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    })),
    { complete: true, naturalWidth: 160, naturalHeight: 80 },
  )
  await screenPage.close()

  const printPage = await browser.newPage()
  await printPage.setContent(printHtml, { waitUntil: 'load' })
  const printFigure = printPage.locator(
    `[data-canonical-block-id="${posterBlockId}"][data-canonical-block-kind="figure"]`,
  )
  await printFigure.waitFor()
  assert.deepEqual(
    await printFigure.locator('img').evaluate((image) => ({
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
    })),
    { complete: true, naturalWidth: 160, naturalHeight: 80 },
  )
  const pdfPath = path.join(artifactRoot, 'application-writing-figure.pdf')
  await printPage.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  })
  assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
  const pdfImages = execFileSync('pdfimages', ['-list', pdfPath], {
    encoding: 'utf8',
  })
  assert.match(pdfImages, /\s160\s+80\s+/)
  const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
  })
  assert.equal(pdfText.includes(posterCaption), true)
  await printPage.close()
} finally {
  rmSync(artifactRoot, { recursive: true, force: true })
  await browser.close()
  await viteServer.close()
}

console.log('Application Writing Figure consumption verifier: PASS')
