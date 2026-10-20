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
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { createImportReviewRoutes } from '../server/import-review/importReviewRoutes.mjs'
import { runFinalizeWorker } from '../server/import-review/runFinalizeWorker.mjs'
import {
  createImportReviewStore,
  ocrReviewBundleDigest,
  reviewBundleDigest,
} from '../server/import-review/importReviewStore.mjs'
import {
  buildNck1OcrReviewProjection,
  ocrReviewBundleFilePaths,
  resolveReviewFile,
  validateAgentOcrCorrectionSidecar,
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
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '..')
const paperId = `paper-synthetic-ocr-review-${process.pid}`
const owner = { role: 'owner', accountKind: 'human', username: 'owner' }
const agentToken = 'synthetic-import-agent-token'

function syntheticPage(seed, size = '400x560') {
  return new Uint8Array(execFileSync('magick', [
    '-size', size, 'xc:#ffffff',
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

function writeSyntheticSource(rootDir, { imageSize } = {}) {
  const questionPages = [
    { page: 1, bytes: syntheticPage(1, imageSize) },
    { page: 2, bytes: syntheticPage(2, imageSize) },
  ]
  const answerPages = [{ page: 1, bytes: syntheticPage(3, imageSize) }]
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

export { writeSyntheticSource, reviewManifest, uploadRevision }

if (process.env.EQB_OCR_REVIEW_FIXTURE_ONLY !== '1') {
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
  const workerResult = await runFinalizeWorker(stagingRoot, created.revision)
  assert.deepEqual(workerResult.projection, buildNck1OcrReviewProjection(stagingRoot),
    'OCR worker projection preserves all fields and source image bytes')
  assert.deepEqual(workerResult.expectedFiles, ocrReviewBundleFilePaths(stagingRoot)
    .map(({ path, mediaType, role }) => `${path}\0${mediaType}\0${role}`).sort())
  const finalized = await store.finalizeUploadedRevision(created.revision.id)
  assert.equal(finalized.state, 'awaiting_review')
  assert.equal(store.listPapers()[0].reviewKind, 'ocr')
  const detail = store.paperDetail(paperId)
  assert.equal(detail.latest.reviewKind, 'ocr')
  assert.equal(detail.ocrReview.documents.length, 2)
  assert.equal(detail.ocrReview.reviewFindings.some((item) =>
    item.code === 'NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED'), false,
  'confidence and alternatives are diagnostic, not an Owner review gate')
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
  const clipboardJs = readFileSync(path.join(root, 'import-ops/public/clipboard.js'))
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
    if (url.pathname === '/ops/owner-review.js') {
      send(response, 200, readFileSync(path.join(root, 'import-ops/public/owner-review.js')), 'text/javascript; charset=utf-8')
      return
    }
    if (url.pathname === '/ops/clipboard.js') {
      send(response, 200, clipboardJs, 'text/javascript; charset=utf-8')
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
        session: request.headers.authorization === `Bearer ${agentToken}`
          ? { role: 'member', accountKind: 'import_agent', username: 'synthetic-agent' }
          : owner,
        readJsonBody: readJsonRouteBody,
        sendJson(target, status, body) {
          send(target, status, JSON.stringify(body), 'application/json')
        },
      },
    })
    if (!handled) send(response, 404, 'not found', 'text/plain')
  })
  // Synchronous synthetic bundle finalization can exceed Node's default 5s
  // keep-alive timeout while this in-process client cannot service its socket.
  server.keepAliveTimeout = 60_000
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
  await page.goto(`${origin}/ops/`)
  await page.getByRole('heading', { name: '试卷审核' }).waitFor()
  await page.getByText('还没有送审试卷').waitFor()
  assert.equal(await page.getByRole('link', { name: 'Anonymous synthetic image-pair review' }).count(), 0,
    'OCR-only papers are absent from the Owner candidate list')
  assert.equal(await page.locator('[data-ocr-text], #confirm-ocr, #review-frame').count(), 0,
    'Owner candidate list has no OCR transcription, confirmation, or report iframe')
  if (process.env.OCR_REVIEW_SCREENSHOT) {
    await page.screenshot({ path: process.env.OCR_REVIEW_SCREENSHOT })
  }

  // Historical Owner receipts remain readable, but the web no longer asks
  // the Owner to manufacture them. Exercise that retained API separately.
  const legacyConfirmation = {
    schemaVersion: NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
    paperId, sourceSetDigest: fixture.evidence.sourceSetDigest,
    evidenceDigest: fixture.evidence.evidenceDigest, confirmed: true,
    documents: fixture.evidence.documents.map((document) => ({
      documentId: document.documentId,
      pages: document.pages.map((sourcePage) => ({
        page: sourcePage.page,
        orderedItems: sourcePage.observations.map((observation) => ({
          itemId: `item:${observation.observationId}`, observationIds: [observation.observationId], text: observation.text,
        })),
        furnitureObservationIds: [],
        visualClassifications: sourcePage.regions.filter((region) => region.kind === 'visual')
          .map((region) => ({ regionId: region.regionId, classification: 'furniture' })),
      })),
    })),
  }
  legacyConfirmation.documents[0].pages[0].orderedItems[0].text += ' [owner checked]'
  legacyConfirmation.documents[0].pages[0].orderedItems.reverse()
  store.confirmOcrRevision(paperId, finalized.id, {
    bundleDigest: finalized.bundleDigest, confirmation: legacyConfirmation,
  }, 'owner')

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

  const proofread = (revision, input, authenticated = true) => fetch(
    `${origin}/api/import-agent-reviews/papers/${paperId}/revisions/${revision.id}/proofread-ocr`,
    { method: 'POST', headers: { 'content-type': 'application/json',
      ...(authenticated ? { authorization: `Bearer ${agentToken}` } : {}) },
      body: JSON.stringify({ bundleDigest: revision.bundleDigest, ...input }) },
  ).catch((cause) => { throw new Error(`proofread request failed (authenticated=${authenticated}, notes=${input.correctionNotes?.length})`, { cause }) })
  const confirmation = agentConfirmation.confirmation
  let result = await proofread(finalized, { confirmation, correctionNotes: [] })
  assert.equal((await result.json()).code, 'IMPORT_REVIEW_AGENT_OCR_PROFILE_REQUIRED')
  const configPath = path.join(stagingRoot, 'config.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  writeFileSync(configPath, JSON.stringify({ ...config, importProfile: 'public-paper-v1' }))
  const publicManifest = reviewManifest(stagingRoot)
  const publicCreated = store.createRevision(publicManifest)
  uploadRevision(store, publicCreated, stagingRoot, publicManifest.files)
  const publicRevision = store.finalizeRevision(publicCreated.revision.id)
  result = await proofread(publicRevision, { confirmation }, false)
  assert.equal(result.status, 401, 'Owner session alone cannot act as the Agent')
  result = await proofread(publicRevision, { confirmation, correctionNotes: [] })
  assert.equal((await result.json()).code, 'IMPORT_REVIEW_OCR_REPORT_INVALID', 'changed text needs an audit note')
  const editedItem = confirmedPage.orderedItems.find((item) => item.text.endsWith('[owner checked]'))
  const questionItem = confirmedPage.orderedItems.find((item) => item.text.startsWith('1. '))
  const correctionNotes = [
    { itemId: editedItem.itemId, kind: 'ocr_repair',
      sourceText: editedItem.text, reason: 'Synthetic pixel comparison correction' },
    { itemId: questionItem.itemId, kind: 'ocr_repair',
      sourceText: questionItem.text, reason: 'Preserve the numbered source item before stem projection' },
  ]
  result = await proofread(publicRevision, { confirmation, correctionNotes,
    bundleDigest: `sha256:${'0'.repeat(64)}` })
  assert.equal((await result.json()).code, 'IMPORT_REVIEW_STALE_REVISION')
  result = await proofread(publicRevision, { confirmation, correctionNotes: [correctionNotes[0], correctionNotes[0]] })
  assert.equal((await result.json()).code, 'IMPORT_REVIEW_OCR_REPORT_INVALID')
  result = await proofread(publicRevision, { confirmation, correctionNotes })
  assert.equal(result.status, 200)
  const receipt = (await result.json()).receipt
  assert.equal(receipt.reviewerKind, 'import_agent')
  assert.equal(receipt.confirmedBy, 'synthetic-agent')
  assert.equal(receipt.correctionReport.entries.length, 2)
  assert.equal(receipt.correctionReport.entries[0].correctedText, editedItem.text)
  assert.equal(receipt.correctionReport.entries[0].page, 1)
  assert.equal(receipt.correctionReport.sourceSetDigest, fixture.evidence.sourceSetDigest)
  assert.equal(receipt.correctionReport.entries[0].ocrText, editedItem.text.replace(' [owner checked]', ''))
  const finalApproval = await fetch(
    `${origin}/api/import-reviews/papers/${paperId}/revisions/${publicRevision.id}/approve`,
    { method: 'POST', headers: { authorization: `Bearer ${agentToken}`, 'content-type': 'application/json' }, body: '{}' },
  )
  assert.equal(finalApproval.status, 403, 'Agent proofreading never grants final Owner approval')

  const reportContext = {
    paperId, documents: fixture.manifest.documents,
    sourceDocuments: fixture.manifest.documents.map((document) => ({
      documentId: document.documentId, bytes: readFileSync(path.join(stagingRoot, document.path)),
    })),
    sourceDigest: `sha256:${'a'.repeat(64)}`, candidateDigest: `sha256:${'b'.repeat(64)}`,
    materialization: { text: 'Corrected text' },
  }
  const candidateReport = {
    schemaVersion: 'agent-ocr-correction-report-v2', paperId,
    ocrRevisionId: publicRevision.id, ocrConfirmationId: receipt.confirmationId,
    originalSourceSetDigest: receipt.sourceSetDigest, ocrEvidenceDigest: receipt.evidenceDigest,
    sourceDigest: reportContext.sourceDigest, candidateDigest: reportContext.candidateDigest,
    entries: [{ ocrItemId: editedItem.itemId, category: 'source_spelling_error',
      before: 'Correted text', after: 'Corrected text', reason: 'Source spelling error',
      sourceLocator: { documentId: 'question-source-1', page: 1 },
      materializationTarget: { jsonPointer: '/text' } }],
  }
  assert.doesNotThrow(() => validateAgentOcrCorrectionSidecar(candidateReport, reportContext))
  for (const change of [
    { candidateDigest: `sha256:${'c'.repeat(64)}` },
    { sourceDigest: `sha256:${'d'.repeat(64)}` },
    { documents: fixture.manifest.documents.map((document) => ({ ...document, sha256: `sha256:${'e'.repeat(64)}` })) },
    { materialization: { text: 'Later edited text' } },
    { sourceDocuments: reportContext.sourceDocuments.map((document) => ({ ...document, bytes: Buffer.from('different source') })) },
  ]) assert.throws(() => validateAgentOcrCorrectionSidecar(candidateReport, { ...reportContext, ...change }),
    (error) => error.code === 'IMPORT_REVIEW_OCR_CORRECTION_REPORT_INVALID')
  assert.throws(() => validateAgentOcrCorrectionSidecar({ ...candidateReport,
    entries: [{ ...candidateReport.entries[0], category: 'grammar_error' }],
  }, reportContext), /incomplete/)
  assert.doesNotThrow(() => validateAgentOcrCorrectionSidecar({ ...candidateReport, entries: [] }, reportContext))
  assert.throws(() => validateAgentOcrCorrectionSidecar(null, reportContext), /identity is incomplete/)

  // Retain real server-held OCR receipts and exercise Candidate finalization.
  // The synthetic projection isolates the structural field mapping from the
  // unrelated full-paper compiler, as in the media-receipt verifier.
  const bindingStore = createImportReviewStore({
    dbPath: path.join(tempRoot, 'review.sqlite'),
    filesRoot: path.join(tempRoot, 'candidate-files'),
    rendererBuildId: 'renderer-ocr-review-verifier',
    projectRevision(directory) {
      const marker = JSON.parse(readFileSync(path.join(directory, 'marker.json'), 'utf8'))
      validateAgentOcrCorrectionSidecar(marker.report, {
        ...reportContext, materialization: marker.materialization,
      })
      return {
        paperId, importProfile: 'public-paper-v1', manifest: fixture.manifest,
        sourceDigest: reportContext.sourceDigest, candidateDigest: reportContext.candidateDigest,
        visibleStructureDigest: sha256(Buffer.from('synthetic-visible-structure')),
        paragraphSummariesDigest: sha256(Buffer.from('synthetic-summaries')),
        publicSearchMetadataDigest: sha256(Buffer.from('synthetic-search-metadata')),
        sourceInput: { materializationBytes: Buffer.from(JSON.stringify(marker.materialization)) },
        ocrCorrectionReport: marker.report,
      }
    },
  })
  function finalizeBindingCase(materialization, entry) {
    const report = { ...candidateReport, entries: [entry] }
    const bytes = Buffer.from(JSON.stringify({ materialization, report }))
    const input = {
      schemaVersion: 'web-import-review-bundle-v3', paperId,
      paperName: 'Synthetic OCR structural mapping', importProfile: 'public-paper-v1',
      sourceDigest: reportContext.sourceDigest, candidateDigest: reportContext.candidateDigest,
      visibleStructureDigest: sha256(Buffer.from('synthetic-visible-structure')),
      paragraphSummariesDigest: sha256(Buffer.from('synthetic-summaries')),
      publicSearchMetadataDigest: sha256(Buffer.from('synthetic-search-metadata')),
      ocrCorrectionReportVersion: report.schemaVersion, ocrCorrectionReportDigest: digestJson(report),
      producerBuildId: 'synthetic-ocr-structural-mapping',
      files: [{ path: 'marker.json', mediaType: 'application/json', role: 'synthetic-projection',
        sha256: sha256(bytes), byteLength: bytes.byteLength }],
    }
    const created = bindingStore.createRevision({ ...input, bundleDigest: reviewBundleDigest(input) })
    const target = bindingStore.fileForUpload(created.revision.id, 'marker.json')
    writeFileSync(target.destination, bytes)
    bindingStore.completeFileUpload(created.revision.id, 'marker.json', input.files[0])
    return bindingStore.finalizeRevision(created.revision.id)
  }
  const source = { kind: 'page_region', documentId: 'question-source-1', page: 1 }
  const stem = questionItem.text.slice('1. '.length)
  const questionEntry = {
    ocrItemId: questionItem.itemId, category: 'ocr_misrecognition',
    before: questionItem.text, after: stem, reason: 'Question number is a structural field',
    sourceLocator: source, materializationTarget: { jsonPointer: '/listening/questions/0/stem' },
  }
  const questionMaterialization = { listening: { questions: [{ canonicalNumber: 1, stem, source }] } }
  const tablePointer = '/groups/0/blocks/0/rows/0/cells/0/content/0/text'
  const tableEntry = {
    ocrItemId: questionItem.itemId, category: 'ocr_misrecognition',
    before: questionItem.text, after: `${questionItem.text}\n`,
    reason: 'Separate the source heading from the next table-cell text run',
    sourceLocator: source, materializationTarget: { jsonPointer: tablePointer },
  }
  const tableMaterialization = { groups: [{ blocks: [{ kind: 'table', source, rows: [{ cells: [{
    content: [{ kind: 'text', text: tableEntry.after }, { kind: 'text', text: editedItem.text }],
  }] }] }] }] }
  const readingMaterialization = { groups: [{ questions: [{ sourceNumber: 1, canonicalNumber: 1, stem, source }] }] }
  for (const [materialization, entry] of [
    [questionMaterialization, questionEntry],
    [readingMaterialization, { ...questionEntry, materializationTarget: { jsonPointer: '/groups/0/questions/0/stem' } }],
    [tableMaterialization, tableEntry],
  ]) {
    const finalized = finalizeBindingCase(materialization, entry)
    assert.equal(finalized.state, 'awaiting_review')
    assert.equal(finalized.approval, null, 'Structural projection is not final Owner approval')
  }
  const wrongNumber = structuredClone(questionMaterialization)
  wrongNumber.listening.questions[0].canonicalNumber = 2
  const wrongSource = structuredClone(questionMaterialization)
  wrongSource.listening.questions[0].source.page = 2
  const finalRun = structuredClone(tableMaterialization)
  finalRun.groups[0].blocks[0].rows[0].cells[0].content.pop()
  const wrongTableSource = structuredClone(tableMaterialization)
  wrongTableSource.groups[0].blocks[0].source.page = 2
  const wrongFollowingItem = structuredClone(tableMaterialization)
  wrongFollowingItem.groups[0].blocks[0].rows[0].cells[0].content[1].text = 'Unrelated source item'
  for (const [materialization, entry] of [
    [wrongNumber, questionEntry], [wrongSource, questionEntry],
    [finalRun, tableEntry], [wrongTableSource, tableEntry], [wrongFollowingItem, tableEntry],
    [{ text: tableEntry.after }, { ...tableEntry, materializationTarget: { jsonPointer: '/text' } }],
    [questionMaterialization, { ...questionEntry, before: 'Changed historical OCR' }],
    [questionMaterialization, { ...questionEntry, sourceLocator: { ...source, page: 2 } }],
  ]) assert.throws(() => finalizeBindingCase(materialization, entry),
    (error) => error.code === 'IMPORT_REVIEW_OCR_CORRECTION_RECEIPT_INVALID')
  for (const after of [`${questionItem.text} `, `${questionItem.text}\n\n`, `${questionItem.text} altered\n`]) {
    const materialization = structuredClone(tableMaterialization)
    materialization.groups[0].blocks[0].rows[0].cells[0].content[0].text = after
    assert.throws(() => finalizeBindingCase(materialization, { ...tableEntry, after }),
      (error) => error.code === 'IMPORT_REVIEW_OCR_CORRECTION_RECEIPT_INVALID')
  }

  assert.equal(receipt.candidateReportRequired, true)
  const nextOcrManifest = { ...publicManifest, producerBuildId: 'synthetic-ocr-review-successor' }
  nextOcrManifest.bundleDigest = ocrReviewBundleDigest(nextOcrManifest)
  const nextOcr = store.createRevision(nextOcrManifest)
  uploadRevision(store, nextOcr, stagingRoot, nextOcrManifest.files)
  assert.equal(store.finalizeRevision(nextOcr.revision.id).state, 'awaiting_review',
    'Candidate report requirement must not block a later OCR-stage revision')
  const historicalConfirmation = await fetch(
    `${origin}/api/import-agent-reviews/revisions/${publicRevision.id}/ocr-confirmation`,
    { headers: { authorization: `Bearer ${agentToken}` } },
  )
  assert.equal(historicalConfirmation.status, 200, 'repair can retrieve a superseded OCR receipt')
  assert.deepEqual((await historicalConfirmation.json()).receipt, receipt,
    'historical evidence remains unchanged after a newer revision')
  const pendingConfirmation = await fetch(
    `${origin}/api/import-agent-reviews/revisions/${nextOcr.revision.id}/ocr-confirmation`,
    { headers: { authorization: `Bearer ${agentToken}` } },
  )
  assert.equal(pendingConfirmation.status, 404, 'finalization without confirmation supplies no receipt')

  console.log('verify-import-review-ocr-confirmation: PASS')
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  rmSync(tempRoot, { recursive: true, force: true })
}
}

function questionOneObservationId(documentId, page, index) {
  return `${documentId}:page-${page}:observation-${index}`
}
