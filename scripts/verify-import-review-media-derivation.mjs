#!/usr/bin/env node
import './lib/reviewTestLockRoot.mjs'

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { buildPrintHtml } from '../server/print-renderer.mjs'
import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import {
  createImportReviewStore,
} from '../server/import-review/importReviewStore.mjs'
import {
  buildNck1ReviewConsumption,
  buildNck1ReviewProjection,
  printConsumption,
} from '../server/import-review/revisionProjection.mjs'
import {
  produceNck1DocxMaterialization,
} from '../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { runRoutes } from '../server/router/index.mjs'
import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../shared/paper-canonical/compiler.mjs'
import {
  MEDIA_AI_CONFIRMATION_CHECKS,
  mediaPresentationDigest,
} from '../shared/paper-canonical/mediaPresentation.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import {
  makeSyntheticNck1DocxFixture,
} from '../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { freezeReviewFixture, reviewFixtureManifest } from './lib/reviewPublicationFixture.mjs'

const encoder = new TextEncoder()
const checklist = Object.fromEntries(MEDIA_AI_CONFIRMATION_CHECKS.map((key) => [key, true]))

function clone(value) {
  return structuredClone(value)
}

function makeInput(materialization, produced, fixture, renditionById = new Map()) {
  return {
    kind: 'nck1-source-materialization',
    materializationBytes: encoder.encode(JSON.stringify(materialization)),
    documents: fixture.sourceDocuments.map((document) => ({
      documentId: document.documentId,
      bytes: new Uint8Array(document.bytes),
    })),
    media: produced.mediaFiles.map((media) => ({
      mediaId: media.mediaId,
      bytes: new Uint8Array(media.bytes),
      ...(renditionById.has(media.mediaId)
        ? { renditionBytes: new Uint8Array(renditionById.get(media.mediaId)) }
        : {}),
    })),
  }
}

function compile(input) {
  const imported = importCanonicalCandidate(input)
  assert.deepEqual(imported.issues, [])
  assert(imported.candidate)
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  assert.deepEqual(preview.unresolvedIssues || [], [])
  assert(preview.compilation)
  return {
    candidate: preview.candidate,
    compilation: preview.compilation,
    consumption: buildNck1ReviewConsumption(preview.candidate, preview.compilation),
  }
}

function assertImportIssue(input, code) {
  const result = importCanonicalCandidate(input)
  assert.equal(
    result.issues.some((issue) => issue.code === code),
    true,
    `${code} must fail closed`,
  )
}

function imageDescription(bytes, kind, extra) {
  const [pixelWidth, pixelHeight, mimeType] = execFileSync(
    'magick', ['identify', '-format', '%w,%h,%m', '-'], {
      encoding: 'utf8',
      input: bytes,
    },
  ).split(',')
  return {
    kind,
    mimeType: ({ PNG: 'image/png', JPEG: 'image/jpeg', WEBP: 'image/webp' })[mimeType],
    sha256: sha256(bytes),
    pixelWidth: Number(pixelWidth),
    pixelHeight: Number(pixelHeight),
    ...extra,
  }
}

function deterministicEnhancement(bytes) {
  return new Uint8Array(execFileSync('magick', [
    '-',
    '-auto-orient',
    '-strip',
    '-colorspace', 'sRGB',
    '-contrast-stretch', '0.5%x0.5%',
    '-unsharp', '0x0.75+0.75+0.008',
    'png32:-',
  ], { input: bytes }))
}

function responseCapture() {
  const capture = {
    status: null,
    headers: {},
    body: Buffer.alloc(0),
  }
  capture.response = {
    writeHead(status, headers = {}) {
      capture.status = status
      capture.headers = headers
    },
    end(value) {
      capture.body = value == null ? Buffer.alloc(0) : Buffer.from(value)
    },
  }
  return capture
}

async function invokeGet(routes, pathname) {
  const capture = responseCapture()
  const handled = await runRoutes(routes, {
    request: { method: 'GET', headers: {} },
    response: capture.response,
    url: new URL(`http://localhost${pathname}`),
    context: {
      session: { role: 'owner', accountKind: 'human', username: 'owner' },
      sendJson(response, status, body) {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(JSON.stringify(body))
      },
    },
  })
  assert.equal(handled, true)
  return capture
}

const fixture = makeSyntheticNck1DocxFixture({ mediaLayout: true })
const produced = produceNck1DocxMaterialization({
  paperId: fixture.paperId,
  documents: fixture.sourceDocuments,
})
assert.equal(produced.disposition, 'ready_for_verification')
assert.equal(produced.materialization.schemaVersion, 'nck1-source-materialization-v2')
assert.equal(produced.mediaFiles.length, 3)

// Clean source-only DOCX media stays byte-exact and keeps one shared layout intent.
const sourceOnly = compile(makeInput(produced.materialization, produced, fixture))
assert.deepEqual(
  sourceOnly.consumption.mediaArtifacts.map((media) => media.sha256),
  produced.materialization.media.map((media) => media.sha256),
)
assert.deepEqual(
  sourceOnly.consumption.selections[0].projectedOccurrences[0].media
    .map((media) => media.presentation),
  produced.materialization.media.map((media) => media.presentation),
)

const firstInventory = produced.materialization.media[0]
const firstBytes = produced.mediaFiles[0].bytes
const renditionById = new Map()

// The fixed ImageMagick recipe is replayed, not trusted from metadata.
const deterministicBytes = deterministicEnhancement(firstBytes)
const deterministicMaterialization = clone(produced.materialization)
deterministicMaterialization.media[0].publication = {
  selection: 'deterministic_enhancement',
  sourceSha256: firstInventory.sha256,
  candidate: imageDescription(
    deterministicBytes,
    'deterministic_enhancement',
    {
      tool: 'imagemagick',
      toolVersion: execFileSync('magick', ['-version'], { encoding: 'utf8' })
        .split('\n')[0]
        .trim(),
      preset: 'document-light-cleanup-v1',
    },
  ),
}
renditionById.set(firstInventory.mediaId, deterministicBytes)
const deterministic = compile(makeInput(
  deterministicMaterialization,
  produced,
  fixture,
  renditionById,
))
assert.equal(deterministic.consumption.mediaArtifacts[0].sha256, sha256(deterministicBytes))

const alteredBytes = new Uint8Array(execFileSync('magick', [
  '-size', '48x32', 'xc:white', '-fill', 'black', '-draw', 'line 1,1 46,30', 'png:-',
]))
const replayMismatch = clone(deterministicMaterialization)
replayMismatch.media[0].publication.candidate = imageDescription(
  alteredBytes,
  'deterministic_enhancement',
  {
    tool: 'imagemagick',
    toolVersion: deterministicMaterialization.media[0].publication.candidate.toolVersion,
    preset: 'document-light-cleanup-v1',
  },
)
assertImportIssue(
  makeInput(replayMismatch, produced, fixture, new Map([[firstInventory.mediaId, alteredBytes]])),
  'MATERIALIZATION_MEDIA_ENHANCEMENT_REPLAY_MISMATCH',
)
assertImportIssue(
  makeInput(deterministicMaterialization, produced, fixture),
  'MATERIALIZATION_MEDIA_RENDITION_MISSING',
)
const digestMismatchInput = makeInput(
  deterministicMaterialization,
  produced,
  fixture,
  new Map([[firstInventory.mediaId, alteredBytes]]),
)
assertImportIssue(digestMismatchInput, 'MATERIALIZATION_MEDIA_RENDITION_MISMATCH')

// An AI redraw may be reviewed while the source remains selected. It is never
// silently promoted by the adapter.
const aiMaterialization = clone(produced.materialization)
const aiCandidate = imageDescription(alteredBytes, 'ai_assisted_redraw', {
  tool: 'synthetic-test-only',
  toolVersion: '1',
  promptSummarySha256: sha256(encoder.encode('preserve every source fact')),
})
aiMaterialization.media[0].publication = {
  selection: 'source_crop',
  sourceSha256: firstInventory.sha256,
  candidate: aiCandidate,
}
const aiInput = makeInput(
  aiMaterialization,
  produced,
  fixture,
  new Map([[firstInventory.mediaId, alteredBytes]]),
)
const latentAi = compile(aiInput)
assert.equal(latentAi.consumption.mediaArtifacts[0].sha256, firstInventory.sha256)

// Review media routes return the exact immutable bytes and digest headers.
const mediaDerivation = {
  mediaId: firstInventory.mediaId,
  source: {
    mimeType: firstInventory.mimeType,
    sha256: firstInventory.sha256,
    encodedBytes: Buffer.from(firstBytes).toString('base64'),
  },
  candidate: {
    mimeType: aiCandidate.mimeType,
    sha256: aiCandidate.sha256,
    encodedBytes: Buffer.from(alteredBytes).toString('base64'),
  },
}
const routeRevisionId = 'rev-00000000-0000-0000-0000-000000000001'
const routes = createImportReviewRoutes({
  getStore: () => ({
    projectionForRevision: () => ({
      revision: { id: routeRevisionId, reviewKind: 'candidate' },
      projection: { mediaDerivations: [mediaDerivation] },
    }),
  }),
  agentToken: '',
  shipToken: '',
  buildPrintHtml,
})
for (const [rendition, expectedBytes, expectedDigest] of [
  ['source', firstBytes, firstInventory.sha256],
  ['candidate', alteredBytes, aiCandidate.sha256],
]) {
  const response = await invokeGet(
    routes,
    `/api/import-review-preview/revisions/${routeRevisionId}/media/${encodeURIComponent(firstInventory.mediaId)}/${rendition}`,
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers['x-eqb-media-digest'], expectedDigest)
  assert.deepEqual(response.body, Buffer.from(expectedBytes))
}

// Screen consumption and both print modes resolve the same presentation,
// source bytes, and source-confirmed caption.
const captioned = clone(produced.materialization)
captioned.groups[0].blocks[1].caption = 'Synthetic source caption.'
const captionedResult = compile(makeInput(captioned, produced, fixture))
const screenMedia = captionedResult.consumption.selections[0]
  .projectedOccurrences[0].media[0]
const screenFigure = captionedResult.consumption.selections[0]
  .projectedOccurrences[0].content.blocks[1]
assert.deepEqual(screenMedia.presentation, firstInventory.presentation)
assert.equal(screenFigure.caption[0].text, 'Synthetic source caption.')
for (const versionType of ['student', 'teacher']) {
  const print = printConsumption(captionedResult.consumption)
  const payload = canonicalConsumptionPrintPayload(print, 'Synthetic media paper')
  const html = buildPrintHtml({
    title: payload.title,
    versionType,
    printStyle: payload.printStyle,
    items: payload.items.map((item) => ({
      detail: payload.details.get(item.questionGroupId),
      note: '',
      score: 0,
      sectionTitle: '',
    })),
    blocks: payload.blocks,
    questionNumberStart: 1,
    canonicalConsumption: print,
  })
  assert.equal(
    html.includes(`data:${firstInventory.mimeType};base64,${Buffer.from(firstBytes).toString('base64')}`),
    true,
  )
  assert.equal(html.includes('Synthetic source caption.'), true)
  assert.equal(html.includes('style="--canonical-media-width-ratio:0.4"'), true)
  assert.equal(html.includes('data-canonical-media-alignment="left"'), true)
}

async function verifyActualScreenAndPdf() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert(appUrl)
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
        body: JSON.stringify(captionedResult.consumption),
      }))
    const screenUrl = new URL('canonical-reading-qa.html', appUrl)
    screenUrl.searchParams.set(
      'groupId',
      captionedResult.consumption.selections[0].groupIds[0],
    )
    await page.goto(screenUrl.href)
    const figure = page.locator(
      `[data-canonical-media-id="${firstInventory.mediaId}"]`,
    ).first()
    await figure.waitFor()
    assert.equal(
      await figure.getAttribute('data-canonical-media-alignment'),
      firstInventory.presentation.alignment,
    )
    assert.equal(
      await figure.locator('figcaption').textContent(),
      'Synthetic source caption.',
    )
    assert.equal(
      await figure.locator('img').evaluate(async (image) => {
        const response = await fetch(image.src)
        const digest = await crypto.subtle.digest('SHA-256', await response.arrayBuffer())
        return `sha256:${[...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
      }),
      firstInventory.sha256,
    )
    const ratio = await figure.locator('img').evaluate((image) => {
      const width = image.getBoundingClientRect().width
      const contentWidth = image.closest('.ps-canonical-reading')
        .getBoundingClientRect().width
      return width / contentWidth
    })
    assert(Math.abs(ratio - firstInventory.presentation.widthRatio) < 0.01)
    const tableMedia = page.locator(
      `[data-canonical-media-id="${produced.materialization.media[2].mediaId}"]`,
    ).first()
    const tableRatio = await tableMedia.evaluate((image) => {
      const width = image.getBoundingClientRect().width
      const contentWidth = image.closest('.ps-canonical-reading')
        .getBoundingClientRect().width
      return width / contentWidth
    })
    assert(Math.abs(
      tableRatio - produced.materialization.media[2].presentation.widthRatio,
    ) < 0.01)

    for (const versionType of ['student', 'teacher']) {
      const print = printConsumption(captionedResult.consumption)
      const payload = canonicalConsumptionPrintPayload(print, 'Synthetic media paper')
      const html = buildPrintHtml({
        title: payload.title,
        versionType,
        printStyle: payload.printStyle,
        items: payload.items.map((item) => ({
          detail: payload.details.get(item.questionGroupId),
          note: '',
          score: 0,
          sectionTitle: '',
        })),
        blocks: payload.blocks,
        questionNumberStart: 1,
        canonicalConsumption: print,
      })
      await page.setContent(html, { waitUntil: 'load' })
      assert.equal(
        await page.locator(
          `[data-canonical-media-id="${firstInventory.mediaId}"]`,
        ).first().getAttribute('data-canonical-media-alignment'),
        firstInventory.presentation.alignment,
      )
      const pdf = await page.pdf({ format: 'A4', printBackground: true })
      assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
      assert(pdf.byteLength > 10_000)
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await verifyActualScreenAndPdf()

// A selected AI candidate needs an exact Owner receipt from an earlier
// revision. A structurally convincing receipt supplied by an Agent is not
// authority.
const temp = mkdtempSync(path.join(tmpdir(), 'eqb-media-review-store-'))
try {
  const paperId = 'paper-media-receipt-fixture'
  const previous = process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
  let makeReviewRoot
  try {
    process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = '1'
    ;({ makeReviewRoot } = await import('./verify-universal-nck1-publish.mjs'))
  } finally {
    if (previous === undefined) delete process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY
    else process.env.EQB_ANALYZED_PACKAGE_FIXTURE_ONLY = previous
  }
  const sourceSha256 = firstInventory.sha256
  const candidateSha256 = aiCandidate.sha256
  const presentationDigest = mediaPresentationDigest(firstInventory.presentation)
  const projectionForMarker = (directory) => {
    const projection = buildNck1ReviewProjection(directory, { requireAnalyses: true })
    const marker = JSON.parse(readFileSync(path.join(directory, 'config.json'), 'utf8')).mediaReceiptFixture
    const confirmation = marker.confirmation || null
    return {
      ...projection,
      mediaDerivations: [{
        mediaId: firstInventory.mediaId,
        presentationDigest,
        publication: confirmation
          ? { selection: 'human_confirmed_ai_candidate', confirmation }
          : { selection: 'source_crop' },
        source: { sha256: sourceSha256 },
        candidate: { kind: 'ai_assisted_redraw', sha256: marker.candidateSha256 },
      }],
    }
  }
  const store = createImportReviewStore({
    dbPath: path.join(temp, 'review.sqlite'),
    filesRoot: path.join(temp, 'files'),
    rendererBuildId: 'renderer-media-v1',
    projectRevision: projectionForMarker,
  })
  function createAndFinalize(marker) {
    // Keep the synthetic receipt decisions, but bind them to a complete
    // frozen Review so the real content-eligibility gate remains exercised.
    const { reviewRoot } = makeReviewRoot(path.join(temp, marker.candidateDigest.slice(7)), paperId)
    const configPath = path.join(reviewRoot, 'config.json')
    const config = JSON.parse(readFileSync(configPath))
    writeFileSync(configPath, JSON.stringify({ ...config, mediaReceiptFixture: marker }))
    freezeReviewFixture(reviewRoot)
    const manifest = reviewFixtureManifest(reviewRoot, projectionForMarker(reviewRoot))
    const created = store.createRevision(manifest)
    for (const file of manifest.files) {
      const upload = store.fileForUpload(created.revision.id, file.path)
      mkdirSync(path.dirname(upload.destination), { recursive: true })
      writeFileSync(upload.destination, readFileSync(path.join(reviewRoot, file.path)))
      store.completeFileUpload(created.revision.id, file.path, file)
    }
    return { revision: created.revision, manifest, finalize: () => store.finalizeRevision(created.revision.id) }
  }

  await store.ready()
  const firstDigest = sha256(encoder.encode('candidate-1'))
  const first = createAndFinalize({ candidateDigest: firstDigest, candidateSha256 })
  assert.equal(first.finalize().state, 'awaiting_review')
  const receipt = store.confirmMediaDerivation(
    paperId,
    first.revision.id,
    {
      bundleDigest: first.manifest.bundleDigest,
      mediaId: firstInventory.mediaId,
      sourceSha256,
      candidateSha256,
      presentationDigest,
      checklist,
    },
    'owner',
  )
  assert.equal(store.getRevision(first.revision.id).state, 'awaiting_review')
  assert.equal(store.mediaConfirmation(first.revision.id, firstInventory.mediaId).confirmationId, receipt.confirmationId)

  const issueDetail = store.createIssue(paperId, {
    revisionId: first.revision.id,
    surface: 'screen',
    mediaId: firstInventory.mediaId,
    contentNodeId: 'block:synthetic-media',
    message: 'Synthetic media placement issue.',
  }, 'owner')
  assert.equal(issueDetail.issues[0].mediaId, firstInventory.mediaId)
  assert.equal(issueDetail.issues[0].contentNodeId, 'block:synthetic-media')

  const fake = createAndFinalize({
    candidateDigest: sha256(encoder.encode('candidate-2')),
    candidateSha256,
    confirmation: {
      receiptId: 'media-confirmation-fake',
      reviewMethod: 'side_by_side_overlay',
      sourceSha256,
      candidateSha256,
      presentationDigest,
      checklist,
    },
  })
  assert.throws(fake.finalize, { code: 'IMPORT_REVIEW_MEDIA_CONFIRMATION_REQUIRED' })

  const staleCandidateSha256 = sha256(encoder.encode('different-candidate'))
  const stale = createAndFinalize({
    candidateDigest: sha256(encoder.encode('candidate-3')),
    candidateSha256: staleCandidateSha256,
    confirmation: {
      receiptId: receipt.confirmationId,
      reviewMethod: 'side_by_side_overlay',
      sourceSha256,
      candidateSha256: staleCandidateSha256,
      presentationDigest,
      checklist,
    },
  })
  assert.throws(stale.finalize, { code: 'IMPORT_REVIEW_MEDIA_CONFIRMATION_STALE' })

  const accepted = createAndFinalize({
    candidateDigest: sha256(encoder.encode('candidate-4')),
    candidateSha256,
    confirmation: {
      receiptId: receipt.confirmationId,
      reviewMethod: 'side_by_side_overlay',
      sourceSha256,
      candidateSha256,
      presentationDigest,
      checklist,
    },
  })
  assert.equal(accepted.finalize().state, 'awaiting_review')
} finally {
  rmSync(temp, { recursive: true, force: true })
}

console.log('verify-import-review-media-derivation: PASS')
