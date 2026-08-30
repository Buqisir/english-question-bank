#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import {
  createImportReviewStore,
  ocrReviewBundleDigest,
} from '../server/import-review/importReviewStore.mjs'
import {
  buildNck1OcrReviewProjection,
  ocrReviewBundleFilePaths,
  resolveReviewFile,
} from '../server/import-review/revisionProjection.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  buildNck1ImageSourceBundle,
  inspectNck1SourceImage,
  nck1ImageExtension,
} from '../server/paper-import/nck1ImageSourceBundle.mjs'
import {
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
  NCK1_OCR_EVIDENCE_FILE_NAME,
  buildNck1OcrSourceEvidence,
} from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  readJsonRouteBody,
  runRoutes,
} from '../server/router/index.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '..')
const paperId = `paper-synthetic-ocr-review-${process.pid}`
const owner = { role: 'owner', accountKind: 'human', username: 'owner' }
const agentToken = 'synthetic-import-agent-token'

function syntheticPage(seed) {
  return new Uint8Array(execFileSync('magick', [
    '-size', '400x560', 'xc:#ffffff',
    '-fill', seed % 2 ? '#eaf1ed' : '#ededea',
    '-draw', 'rectangle 32,32 368,112',
    '-fill', '#d8d8d2',
    '-draw', 'rectangle 32,148 368,164 rectangle 32,204 320,220 rectangle 32,260 352,276',
    'png:-',
  ], { maxBuffer: 16 * 1024 * 1024 }))
}

function textObservation(documentId, page, index, region, text, options = {}) {
  return {
    observationId: `${documentId}:page-${page}:observation-${index}`,
    regionId: `${documentId}:page-${page}:text-${index}`,
    region,
    text,
    confidence: options.confidence ?? 0.995,
    alternatives: options.alternatives || [],
  }
}

function enginePage(documentId, page, observations, visual = null) {
  return {
    page,
    regions: [
      ...observations.map((observation) => ({
        regionId: observation.regionId,
        kind: 'text',
        region: structuredClone(observation.region),
      })),
      ...(visual ? [{
        regionId: visual.regionId,
        kind: 'visual',
        region: structuredClone(visual.region),
      }] : []),
    ],
    observations,
    readingOrderEdges: observations.slice(1).map((observation, index) => ({
      before: observations[index].observationId,
      after: observation.observationId,
    })),
  }
}

function bundleDocument(documentId, role, pages) {
  const bytes = buildNck1ImageSourceBundle(pages)
  return {
    documentId,
    role,
    mediaType: NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    pageCount: pages.length,
    bytes,
  }
}

function writeSyntheticSource(rootDir) {
  const questionPages = [
    { page: 1, bytes: syntheticPage(1) },
    { page: 2, bytes: syntheticPage(2) },
  ]
  const answerPages = [{ page: 1, bytes: syntheticPage(3) }]
  const sourceDocuments = [
    bundleDocument('question-source-1', 'question_source', questionPages),
    bundleDocument('official-answers-1', 'official_answers', answerPages),
  ]
  const questionOne = [
    textObservation(
      'question-source-1',
      1,
      1,
      { x: 0.08, y: 0.08, width: 0.84, height: 0.12 },
      'Synthetic passage heading',
    ),
    textObservation(
      'question-source-1',
      1,
      2,
      { x: 0.08, y: 0.27, width: 0.78, height: 0.12 },
      '1. Synthetic question A B C D',
      {
        confidence: 0.84,
        alternatives: [{ text: '1. Synthetic question A B C O', confidence: 0.42 }],
      },
    ),
  ]
  const questionTwo = [textObservation(
    'question-source-1',
    2,
    1,
    { x: 0.08, y: 0.08, width: 0.84, height: 0.14 },
    '2. Synthetic second-page question',
  )]
  const answerOne = [
    textObservation(
      'official-answers-1',
      1,
      1,
      { x: 0.08, y: 0.08, width: 0.42, height: 0.1 },
      '1. A',
    ),
    textObservation(
      'official-answers-1',
      1,
      2,
      { x: 0.08, y: 0.24, width: 0.42, height: 0.1 },
      '2. B',
    ),
  ]
  const engineDocuments = [{
    documentId: 'question-source-1',
    pages: [
      enginePage('question-source-1', 1, questionOne),
      enginePage('question-source-1', 2, questionTwo, {
        regionId: 'question-source-1:page-2:visual-1',
        region: { x: 0.91, y: 0.02, width: 0.04, height: 0.04 },
      }),
    ],
  }, {
    documentId: 'official-answers-1',
    pages: [enginePage('official-answers-1', 1, answerOne)],
  }]
  const evidence = buildNck1OcrSourceEvidence({
    paperId,
    documents: sourceDocuments,
    engine: { name: 'synthetic-fixed-ocr', version: '1.0.0' },
    confidenceThreshold: 0.97,
    engineDocuments,
  })
  const manifestDocuments = sourceDocuments.map((document, documentIndex) => {
    const pages = documentIndex === 0 ? questionPages : answerPages
    const relativePath = `source/${document.documentId}.image-bundle.json`
    mkdirSync(path.dirname(path.join(rootDir, relativePath)), { recursive: true })
    writeFileSync(path.join(rootDir, relativePath), document.bytes)
    return {
      ...Object.fromEntries(Object.entries(document).filter(([key]) => key !== 'bytes')),
      path: relativePath,
      pages: pages.map(({ page, bytes }) => {
        const inspected = inspectNck1SourceImage(bytes)
        const pagePath = `source/${document.documentId}/page-${String(page).padStart(4, '0')}.${nck1ImageExtension(inspected.mediaType)}`
        mkdirSync(path.dirname(path.join(rootDir, pagePath)), { recursive: true })
        writeFileSync(path.join(rootDir, pagePath), bytes)
        return { page, path: pagePath, ...inspected }
      }),
    }
  })
  const manifest = {
    schemaVersion: 'universal-nck1-source-manifest-v1',
    paperId,
    profileId: 'nck1',
    provenance: {
      paperName: 'Anonymous synthetic image-pair review',
      source: 'anonymous synthetic fixture',
    },
    documents: manifestDocuments,
    materializationPath: 'materialization/nck1-source-materialization-v1.json',
    mediaDirectory: 'materialization/media',
    canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
  }
  mkdirSync(path.join(rootDir, 'materialization'), { recursive: true })
  writeFileSync(path.join(rootDir, 'config.json'), `${JSON.stringify({
    paperId,
    format: 'universal-nck1',
    provenance: manifest.provenance,
    universalSourceManifestPath: 'universal-source-manifest.json',
    canonicalRequestPath: manifest.canonicalRequestPath,
  }, null, 2)}\n`)
  writeFileSync(
    path.join(rootDir, 'universal-source-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  writeFileSync(
    path.join(rootDir, 'materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
    `${JSON.stringify(evidence, null, 2)}\n`,
  )
  return { evidence, manifest, questionPages, answerPages }
}

function reviewManifest(stagingRoot) {
  const projection = buildNck1OcrReviewProjection(stagingRoot)
  const files = ocrReviewBundleFilePaths(stagingRoot).map((file) => {
    const bytes = readFileSync(resolveReviewFile(stagingRoot, file.path))
    return {
      ...file,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
  const input = {
    schemaVersion: 'web-import-ocr-review-bundle-v1',
    paperId: projection.paperId,
    paperName: projection.paperName,
    sourceSetDigest: projection.sourceSetDigest,
    evidenceDigest: projection.evidenceDigest,
    reviewStructureDigest: projection.reviewStructureDigest,
    producerBuildId: 'synthetic-ocr-review-verifier',
    files,
  }
  return { ...input, bundleDigest: ocrReviewBundleDigest(input) }
}

function uploadRevision(store, created, stagingRoot, files) {
  for (const file of files) {
    const target = store.fileForUpload(created.revision.id, file.path)
    const bytes = readFileSync(resolveReviewFile(stagingRoot, file.path))
    mkdirSync(path.dirname(target.destination), { recursive: true })
    writeFileSync(target.destination, bytes)
    store.completeFileUpload(created.revision.id, file.path, {
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    })
  }
}

function send(response, status, body, contentType) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': bytes.byteLength,
    'content-type': contentType,
  })
  response.end(bytes)
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-import-review-ocr-'))
const stagingRoot = path.join(tempRoot, 'staging')
let server = null
let browser = null
try {
  mkdirSync(stagingRoot, { recursive: true })
  const fixture = writeSyntheticSource(stagingRoot)
  const manifest = reviewManifest(stagingRoot)
  const store = createImportReviewStore({
    dbPath: path.join(tempRoot, 'review.sqlite'),
    filesRoot: path.join(tempRoot, 'files'),
    rendererBuildId: 'renderer-ocr-review-verifier',
  })
  assert.throws(
    () => store.createRevision({
      ...manifest,
      bundleDigest: `sha256:${'0'.repeat(64)}`,
    }),
    (error) => error.code === 'IMPORT_REVIEW_BUNDLE_DIGEST_MISMATCH',
    'OCR review manifest digest mismatch fails closed',
  )
  const created = store.createRevision(manifest)
  assert.equal(created.revision.reviewKind, 'ocr')
  uploadRevision(store, created, stagingRoot, manifest.files)
  const finalized = store.finalizeRevision(created.revision.id)
  assert.equal(finalized.state, 'awaiting_review')
  assert.equal(store.listPapers()[0].reviewKind, 'ocr')
  const detail = store.paperDetail(paperId)
  assert.equal(detail.latest.reviewKind, 'ocr')
  assert.equal(detail.ocrReview.documents.length, 2)
  assert(detail.ocrReview.reviewFindings.some((item) =>
    item.code === 'NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED'))
  assert(detail.ocrReview.reviewFindings.some((item) =>
    item.code === 'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED'))

  assert.throws(
    () => store.createIssue(paperId, {
      revisionId: finalized.id,
      surface: 'source',
      pageNumber: 1,
      message: 'OCR revision does not accept Candidate issues',
    }, 'owner'),
    (error) => error.code === 'IMPORT_REVIEW_CANDIDATE_REQUIRED',
  )
  assert.throws(
    () => store.approveRevision(
      paperId,
      finalized.id,
      { bundleDigest: finalized.bundleDigest },
      'owner',
    ),
    (error) => error.code === 'IMPORT_REVIEW_CANDIDATE_REQUIRED',
  )
  assert.throws(
    () => store.acquireShippingGuard(paperId, {
      approvalId: 'approval-not-candidate',
      revisionId: finalized.id,
      sourceDigest: finalized.sourceDigest,
      candidateDigest: finalized.candidateDigest,
      visibleStructureDigest: finalized.visibleStructureDigest,
      analysisDigest: `sha256:${'1'.repeat(64)}`,
      bundleDigest: finalized.bundleDigest,
    }, 'import-agent-token'),
    (error) => error.code === 'IMPORT_REVIEW_SHIPPING_GUARD_STALE',
  )
  const staleConfirmation = {
    schemaVersion: NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
    paperId,
    sourceSetDigest: fixture.evidence.sourceSetDigest,
    evidenceDigest: `sha256:${'2'.repeat(64)}`,
    confirmed: true,
    documents: [],
  }
  assert.throws(
    () => store.confirmOcrRevision(paperId, finalized.id, {
      bundleDigest: finalized.bundleDigest,
      confirmation: staleConfirmation,
    }, 'owner'),
    (error) => error.code === 'NCK1_OCR_CONFIRMATION_STALE',
  )

  const routes = createImportReviewRoutes({
    getStore: () => store,
    agentToken,
    shipToken: 'synthetic-shipping-token',
    buildPrintHtml: () => '',
  })
  const indexHtml = readFileSync(path.join(root, 'import-ops/public/index.html'))
  const appJs = readFileSync(path.join(root, 'import-ops/public/app.js'))
  const styles = readFileSync(path.join(root, 'import-ops/public/styles.css'))
  server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    if (url.pathname === '/ops/' || url.pathname === '/ops/index.html') {
      send(response, 200, indexHtml, 'text/html; charset=utf-8')
      return
    }
    if (url.pathname === '/ops/app.js') {
      send(response, 200, appJs, 'text/javascript; charset=utf-8')
      return
    }
    if (url.pathname === '/ops/styles.css') {
      send(response, 200, styles, 'text/css; charset=utf-8')
      return
    }
    if (url.pathname === '/api/auth/me') {
      send(
        response,
        200,
        JSON.stringify({ authRequired: true, user: owner }),
        'application/json',
      )
      return
    }
    const handled = await runRoutes(routes, {
      request,
      response,
      url,
      context: {
        session: owner,
        readJsonBody: readJsonRouteBody,
        sendJson(target, status, body) {
          send(target, status, JSON.stringify(body), 'application/json')
        },
      },
    })
    if (!handled) send(response, 404, 'not found', 'text/plain')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  const origin = `http://127.0.0.1:${address.port}`
  const rawPageResponse = await fetch(
    `${origin}/api/import-review-preview/revisions/${finalized.id}`
      + '/ocr/pages/question-source-1/1',
  )
  assert.equal(rawPageResponse.status, 200)
  assert.equal(
    rawPageResponse.headers.get('x-eqb-source-digest'),
    sha256(fixture.questionPages[0].bytes),
  )
  assert.deepEqual(
    new Uint8Array(await rawPageResponse.arrayBuffer()),
    fixture.questionPages[0].bytes,
    'image OCR review returns exact immutable page bytes',
  )
  const pendingAgentResponse = await fetch(
    `${origin}/api/import-agent-reviews/revisions/${finalized.id}/ocr-confirmation`,
    { headers: { authorization: `Bearer ${agentToken}` } },
  )
  assert.equal(pendingAgentResponse.status, 404)
  const candidateSurfaceResponse = await fetch(
    `${origin}/api/import-review-preview/revisions/${finalized.id}/consumption`,
  )
  assert.equal(candidateSurfaceResponse.status, 409)
  assert.equal(
    (await candidateSurfaceResponse.json()).code,
    'IMPORT_REVIEW_CANDIDATE_REQUIRED',
  )

  const playwright = await import('../app/node_modules/playwright/index.js')
  browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } })
  await page.goto(`${origin}/ops/?view=review`)
  const sourceImage = page.locator('.ocr-page-canvas img')
  await sourceImage.waitFor()
  assert.equal(await sourceImage.evaluate((image) => image.naturalWidth > 0), true)
  await page.getByText('置信度 84%').waitFor()
  await page.getByText(/备选：/u).waitFor()
  if (process.env.OCR_REVIEW_SCREENSHOT) {
    await page.screenshot({ path: process.env.OCR_REVIEW_SCREENSHOT })
  }

  const originalText = await page.locator('[data-ocr-text]').first().inputValue()
  await page.locator('[data-ocr-text]').first().fill(`${originalText} [owner checked]`)
  await page.locator('[data-ocr-item]').first().getByRole('button', { name: '下移' }).click()
  await page.getByRole('button', { name: '本页全部已核对' }).click()
  await page.getByRole('tab', { name: '第 2 页' }).click()
  const visualClassification = page.locator('[data-ocr-visual-classification]')
  await visualClassification.selectOption('unsupported_content')
  await page.locator('[data-ocr-visual-verified]').check()
  await page.getByRole('button', { name: '本页全部已核对' }).click()
  assert.equal(await page.locator('#confirm-ocr').isDisabled(), true)
  await visualClassification.selectOption('furniture')
  await page.getByRole('tab', { name: '答案图' }).click()
  await page.getByRole('button', { name: '本页全部已核对' }).click()
  await page.getByText('6 / 6 项已核对').waitFor()
  assert.equal(await page.locator('#confirm-ocr').isEnabled(), true)
  await page.getByRole('button', { name: '确认全部 OCR' }).click()
  await page.getByRole('heading', { name: 'OCR 已确认' }).waitFor()

  const confirmedRevision = store.getRevision(finalized.id)
  assert.equal(confirmedRevision.state, 'approved')
  const confirmedPage = confirmedRevision.approval.confirmation.documents
    .find((document) => document.documentId === 'question-source-1').pages[0]
  assert.equal(
    confirmedPage.orderedItems[0].observationIds[0],
    questionOneObservationId('question-source-1', 1, 2),
    'Owner reorder is preserved in the exact confirmation',
  )
  assert(confirmedPage.orderedItems.some((item) =>
    item.text.endsWith('[owner checked]')))
  const agentResponse = await fetch(
    `${origin}/api/import-agent-reviews/revisions/${finalized.id}/ocr-confirmation`,
    { headers: { authorization: `Bearer ${agentToken}` } },
  )
  assert.equal(agentResponse.status, 200)
  const agentConfirmation = await agentResponse.json()
  assert.equal(
    agentConfirmation.confirmation.evidenceDigest,
    fixture.evidence.evidenceDigest,
  )

  console.log('verify-import-review-ocr-confirmation: PASS')
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  rmSync(tempRoot, { recursive: true, force: true })
}

function questionOneObservationId(documentId, page, index) {
  return `${documentId}:page-${page}:observation-${index}`
}
