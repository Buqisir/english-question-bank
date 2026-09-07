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
import { loadNck1ReviewSource } from '../server/import-review/revisionProjection.mjs'
import { rasterPdfRegion } from '../server/paper-canonical/pdfRegionRaster.mjs'
import { runRoutes } from '../server/router/index.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '..')
const revisionId = 'rev-source-pairing-fixture'
const paperId = 'paper-source-pairing-fixture'
const visualId = 'visual:product-label'
const targetId = 'block:product-label'
const iconVisualId = 'visual:warning-icon'
const iconTargetId = 'media:warning-icon'
const imageVisualId = 'visual:image-source-page'
const region = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }
const listeningQuestionId = 'question:listening:6'

function syntheticPdf() {
  const content = [
    '0.95 0.95 0.95 rg 0 0 400 200 re f',
    '0.10 0.35 0.25 rg 100 50 200 100 re f',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]
  let output = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(output))
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n`
  output += '0000000000 65535 f \n'
  output += offsets.slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
  output += `startxref\n${xrefOffset}\n%%EOF\n`
  return new Uint8Array(Buffer.from(output))
}

function syntheticImage() {
  return new Uint8Array(execFileSync('magick', [
    '-size', '400x200', 'xc:#ededea',
    '-fill', '#2c6e56',
    '-draw', 'rectangle 100,50 300,150',
    'png:-',
  ]))
}

function jsonResponseCapture() {
  return {
    status: null,
    headers: {},
    body: Buffer.alloc(0),
    response: {
      writeHead(status, headers = {}) {
        this.capture.status = status
        this.capture.headers = headers
      },
      end(value) {
        this.capture.body = value == null ? Buffer.alloc(0) : Buffer.from(value)
      },
      capture: null,
    },
  }
}

async function invokeRoute(routes, pathname, session, headers = {}) {
  const capture = jsonResponseCapture()
  capture.response.capture = capture
  const context = {
    session,
    sendJson(response, status, body) {
      response.writeHead(status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(body))
    },
  }
  const handled = await runRoutes(routes, {
    request: { method: 'GET', headers },
    response: capture.response,
    url: new URL(`http://localhost${pathname}`),
    context,
  })
  assert.equal(handled, true)
  return capture
}

function jsonBody(capture) {
  return JSON.parse(capture.body.toString('utf8'))
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

async function readJson(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

async function waitForFocus(locator) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await locator.evaluate((element) =>
      element.ownerDocument.activeElement === element)) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  assert.fail('Screen target did not receive focus')
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-source-pairing-'))
let browser = null
let server = null
try {
  const capturedWithoutEvidenceDir = path.join(tempRoot, 'captured-without-audio-evidence')
  mkdirSync(path.join(capturedWithoutEvidenceDir, 'materialization'), { recursive: true })
  writeFileSync(
    path.join(capturedWithoutEvidenceDir, 'config.json'),
    JSON.stringify({ paperId: 'paper-captured-without-audio-evidence' }),
  )
  writeFileSync(
    path.join(capturedWithoutEvidenceDir, 'universal-source-manifest.json'),
    JSON.stringify({
      schemaVersion: 'universal-nck1-source-manifest-v1',
      paperId: 'paper-captured-without-audio-evidence',
      documents: [],
      materializationPath: 'materialization/nck1-source-materialization-v1.json',
    }),
  )
  writeFileSync(
    path.join(
      capturedWithoutEvidenceDir,
      'materialization/nck1-source-materialization-v1.json',
    ),
    JSON.stringify({ listening: { state: 'captured' } }),
  )
  assert.throws(
    () => loadNck1ReviewSource(capturedWithoutEvidenceDir),
    (error) => error.code === 'LISTENING_AUDIO_REVIEW_REQUIRED',
    'captured listening cannot enter Review without passed audio evidence',
  )

  const sourcePath = path.join(tempRoot, 'questions.pdf')
  const sourceBytes = syntheticPdf()
  const sourceDigest = sha256(sourceBytes)
  writeFileSync(sourcePath, sourceBytes)
  const imageSourcePath = path.join(tempRoot, 'questions-page-1.png')
  const imageSourceBytes = syntheticImage()
  const imageSourceDigest = sha256(imageSourceBytes)
  writeFileSync(imageSourcePath, imageSourceBytes)
  const pairedVisual = {
    visualId,
    documentId: 'paper',
    path: 'questions.pdf',
    sourceDigest,
    mediaType: 'application/pdf',
    page: 1,
    region,
    disposition: 'semantic_table',
    targetId,
    state: 'paired',
  }
  const iconVisual = {
    ...pairedVisual,
    visualId: iconVisualId,
    region: { x: 0.55, y: 0.3, width: 0.1, height: 0.2 },
    disposition: 'content_media',
    targetId: iconTargetId,
  }
  const unlocatedVisual = {
    ...pairedVisual,
    visualId: 'visual:unlocated',
    targetId: 'block:unlocated',
    region: null,
    state: 'unlocated',
  }
  const imageVisual = {
    ...pairedVisual,
    visualId: imageVisualId,
    path: 'questions-page-1.png',
    sourceDigest: imageSourceDigest,
    mediaType: 'image/png',
    disposition: 'source_region',
    targetId: 'block:image-source-page',
  }
  const projection = {
    sourceVisuals: [pairedVisual, iconVisual, imageVisual, unlocatedVisual],
  }
  const agentToken = 'source-pairing-agent-token'
  const routes = createImportReviewRoutes({
    getStore: () => ({
      projectionForRevision: () => ({
        revision: {
          id: revisionId,
          manifest: {
            files: [{
              path: 'questions.pdf',
              mediaType: 'application/pdf',
              byteLength: sourceBytes.byteLength,
              sha256: sourceDigest,
            }],
          },
        },
        projection,
      }),
      revisionDirectory: () => tempRoot,
    }),
    agentToken,
    shipToken: '',
    buildPrintHtml: () => '',
  })
  const cropPath = `/api/import-review-preview/revisions/${revisionId}`
    + `/source-visuals/${encodeURIComponent(visualId)}`
  const unauthorized = await invokeRoute(routes, cropPath, null)
  assert.equal(unauthorized.status, 403, 'source crops require a reviewer session')

  const revisionFilePath = `/api/import-review-preview/revisions/${revisionId}`
    + `/files?path=${encodeURIComponent('questions.pdf')}`
  const unauthorizedFile = await invokeRoute(routes, revisionFilePath, null)
  assert.equal(unauthorizedFile.status, 403, 'raw revision files require Review credentials')
  const agentFile = await invokeRoute(routes, revisionFilePath, null, {
    authorization: `Bearer ${agentToken}`,
  })
  assert.equal(agentFile.status, 200, 'Import Agent may hydrate raw revision files')
  assert.equal(agentFile.headers['content-type'], 'application/pdf')
  assert.deepEqual(agentFile.body, Buffer.from(sourceBytes))

  const owner = { role: 'owner', accountKind: 'human', username: 'owner' }
  const crop = await invokeRoute(routes, cropPath, owner)
  assert.equal(crop.status, 200)
  assert.equal(crop.headers['content-type'], 'image/png')
  assert.equal(crop.headers['x-eqb-source-digest'], sourceDigest)
  assert.equal(crop.headers['x-eqb-source-page'], '1')
  assert.deepEqual(JSON.parse(crop.headers['x-eqb-source-region']), region)
  assert.deepEqual([...crop.body.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  const identified = execFileSync(
    'magick', ['identify', '-format', '%w,%h', '-'], {
      encoding: 'utf8',
      input: crop.body,
    },
  ).split(',').map(Number)
  assert.deepEqual(identified, [
    Number(crop.headers['x-eqb-pixel-width']),
    Number(crop.headers['x-eqb-pixel-height']),
  ])
  assert(identified[0] > 300 && identified[1] > 150)

  const imageCrop = await invokeRoute(
    routes,
    `/api/import-review-preview/revisions/${revisionId}`
      + `/source-visuals/${encodeURIComponent(imageVisualId)}`,
    owner,
  )
  assert.equal(imageCrop.status, 200)
  assert.equal(imageCrop.headers['content-type'], 'image/png')
  assert.equal(imageCrop.headers['x-eqb-source-digest'], imageSourceDigest)
  assert.deepEqual(
    execFileSync('magick', ['identify', '-format', '%w,%h', '-'], {
      encoding: 'utf8',
      input: imageCrop.body,
    }).split(',').map(Number),
    [200, 100],
    'Candidate source proof crops the immutable image page instead of a PDF rendition',
  )

  const missing = await invokeRoute(
    routes,
    `/api/import-review-preview/revisions/${revisionId}/source-visuals/missing`,
    owner,
  )
  assert.equal(missing.status, 404)
  assert.equal(jsonBody(missing).code, 'IMPORT_REVIEW_SOURCE_VISUAL_NOT_FOUND')

  const unlocated = await invokeRoute(
    routes,
    `/api/import-review-preview/revisions/${revisionId}`
      + `/source-visuals/${encodeURIComponent('visual:unlocated')}`,
    owner,
  )
  assert.equal(unlocated.status, 409)
  assert.equal(jsonBody(unlocated).code, 'IMPORT_REVIEW_SOURCE_LOCATOR_UNAVAILABLE')

  writeFileSync(sourcePath, Buffer.from('changed source'))
  const drifted = await invokeRoute(routes, cropPath, owner)
  assert.equal(drifted.status, 409)
  assert.equal(jsonBody(drifted).code, 'IMPORT_REVIEW_SOURCE_DIGEST_MISMATCH')
  writeFileSync(sourcePath, sourceBytes)

  const browserCrop = rasterPdfRegion({
    pdfBytes: sourceBytes,
    page: 1,
    region,
    density: 150,
  }).bytes
  let capturedIssue = null
  let capturedMediaConfirmation = null
  const mediaCandidateBytes = new Uint8Array(execFileSync('magick', [
    '-', '-fill', '#173f5f', '-draw', 'line 0,0 399,199', 'png:-',
  ], { input: imageSourceBytes }))
  const mediaPresentation = {
    alignment: 'left',
    widthRatio: 0.1,
    spacingBefore: 'none',
    spacingAfter: 'none',
  }
  const mediaPresentationDigest = sha256(new TextEncoder().encode(
    JSON.stringify(mediaPresentation),
  ))
  const detail = {
    paperId,
    paperName: '原卷局部配对测试卷',
    latestRevisionId: revisionId,
    latest: {
      id: revisionId,
      revisionNumber: 1,
      state: 'awaiting_review',
      bundleDigest: `sha256:${'a'.repeat(64)}`,
    },
    revisions: [],
    issues: [],
    issueMessages: [],
    files: [{
      path: 'questions.pdf',
      mediaType: 'application/pdf',
      role: 'question_source',
      byteLength: sourceBytes.byteLength,
    }],
    visibleStructure: [],
    sourceVisuals: [pairedVisual, iconVisual, unlocatedVisual],
    mediaDerivations: [{
      mediaId: iconTargetId,
      presentation: mediaPresentation,
      presentationDigest: mediaPresentationDigest,
      publication: {
        selection: 'source_crop',
        sourceSha256: imageSourceDigest,
        candidate: {
          kind: 'ai_assisted_redraw',
          sha256: sha256(mediaCandidateBytes),
        },
      },
      source: {
        mimeType: 'image/png',
        sha256: imageSourceDigest,
        pixelWidth: 400,
        pixelHeight: 200,
      },
      candidate: {
        kind: 'ai_assisted_redraw',
        mimeType: 'image/png',
        sha256: sha256(mediaCandidateBytes),
        pixelWidth: 400,
        pixelHeight: 200,
      },
    }],
    listeningReview: {
      questions: [{
        questionId: listeningQuestionId,
        questionNo: 6,
        officialAnswer: 'B',
        transcriptSegments: [{
          segmentId: 'listening-text-6',
          text: 'The speakers are deciding when to meet at the library.',
          questionNumbers: [6, 7],
        }],
      }],
      audio: {
        durationSeconds: 1284,
        engine: { name: 'faster-whisper', model: 'large-v3', version: '1' },
        playbackAudioSha256: `sha256:${'b'.repeat(64)}`,
        asrSha256: `sha256:${'c'.repeat(64)}`,
        comparison: { verdict: 'pass', basis: 'authoritative_transcript' },
        contentSafety: { verdict: 'pass', reviewedAt: '2026-09-02T00:00:00.000Z' },
      },
    },
    mediaConfirmations: [],
    rendererStale: false,
    unresolvedCount: 0,
  }
  const indexHtml = readFileSync(path.join(root, 'import-ops/public/index.html'))
  const appJs = readFileSync(path.join(root, 'import-ops/public/app.js'))
  const clipboardJs = readFileSync(path.join(root, 'import-ops/public/clipboard.js'))
  const styles = readFileSync(path.join(root, 'import-ops/public/styles.css'))
  let listeningSupplied = true
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
    if (url.pathname === '/ops/clipboard.js') {
      send(response, 200, clipboardJs, 'text/javascript; charset=utf-8')
      return
    }
    if (url.pathname === '/ops/styles.css') {
      send(response, 200, styles, 'text/css; charset=utf-8')
      return
    }
    if (url.pathname === '/api/auth/me') {
      send(response, 200, JSON.stringify({ authRequired: true, user: owner }), 'application/json')
      return
    }
    if (url.pathname === '/api/import-reviews') {
      send(response, 200, JSON.stringify({ papers: [{
        paperId,
        paperName: detail.paperName,
        revisionNumber: 1,
        state: 'awaiting_review',
        unresolvedCount: 0,
      }] }), 'application/json')
      return
    }
    if (url.pathname === `/api/import-reviews/papers/${paperId}` && request.method === 'GET') {
      send(response, 200, JSON.stringify(detail), 'application/json')
      return
    }
    if (url.pathname === `/api/import-reviews/papers/${paperId}/issues` && request.method === 'POST') {
      capturedIssue = await readJson(request)
      detail.issues = [{
        ...capturedIssue,
        id: 'issue-source-pairing-fixture',
        revisionId,
        pageNumber: Number(capturedIssue.pageNumber),
        state: 'open',
        createdAt: '2026-08-29T00:00:00.000Z',
      }]
      detail.unresolvedCount = 1
      send(response, 201, JSON.stringify(detail), 'application/json')
      return
    }
    if (
      url.pathname === `/api/import-reviews/papers/${paperId}`
        + `/revisions/${revisionId}/confirm-media`
      && request.method === 'POST'
    ) {
      capturedMediaConfirmation = await readJson(request)
      const receipt = {
        confirmationId: 'media-confirmation-source-pairing-fixture',
        revisionId,
        mediaId: iconTargetId,
        sourceSha256: imageSourceDigest,
        candidateSha256: sha256(mediaCandidateBytes),
        presentationDigest: mediaPresentationDigest,
      }
      detail.mediaConfirmations = [receipt]
      send(response, 200, JSON.stringify({ receipt }), 'application/json')
      return
    }
    if (
      url.pathname === `/api/import-review-preview/revisions/${revisionId}`
        + `/media/${encodeURIComponent(iconTargetId)}/source`
    ) {
      send(response, 200, Buffer.from(imageSourceBytes), 'image/png')
      return
    }
    if (
      url.pathname === `/api/import-review-preview/revisions/${revisionId}`
        + `/media/${encodeURIComponent(iconTargetId)}/candidate`
    ) {
      send(response, 200, Buffer.from(mediaCandidateBytes), 'image/png')
      return
    }
    if (
      url.pathname === cropPath
      || url.pathname === `/api/import-review-preview/revisions/${revisionId}`
        + `/source-visuals/${encodeURIComponent(iconVisualId)}`
    ) {
      send(response, 200, browserCrop, 'image/png')
      return
    }
    if (
      url.pathname === `/api/import-review-preview/revisions/${revisionId}/files`
      && url.searchParams.get('path') === 'questions.pdf'
    ) {
      send(response, 200, Buffer.from(sourceBytes), 'application/pdf')
      return
    }
    if (url.pathname === '/') {
      send(response, 200, `<!doctype html><html><body>
        ${listeningSupplied ? `<div data-paper-browse-anchor="group:${paperId}:listening.long-form">
          <article data-paper-question-id="${listeningQuestionId}">Listening question 6</article>
        </div>` : ''}
        <div data-paper-browse-anchor="group:reading-a">
          <table data-canonical-block-id="${targetId}"><tbody><tr><td>Day</td><td>Task <img alt="warning" width="16" height="16" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-canonical-media-id="${iconTargetId}" data-canonical-content-node-id="media-ref:warning-icon" /></td></tr></tbody></table>
          <table data-canonical-block-id="block:unlocated"><tbody><tr><td>Unlocated</td></tr></tbody></table>
        </div>
      </body></html>`, 'text/html; charset=utf-8')
      return
    }
    send(response, 404, 'not found', 'text/plain')
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert(address && typeof address === 'object')
  const playwright = await import('../app/node_modules/playwright/index.js')
  browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1000 } })
  await page.goto(`http://127.0.0.1:${address.port}/ops/?view=review`)
  const listeningQuestion = page.frameLocator('#review-frame')
    .locator(`[data-paper-question-id="${listeningQuestionId}"]`)
  await listeningQuestion.waitFor()
  assert.equal(await listeningQuestion.count(), 1)
  await listeningQuestion.click()
  await page.getByText('听力核对 · 第 6 题').waitFor()
  assert.equal(await page.locator('#listening-review-section').evaluate((section) => {
    const rect = section.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= window.innerHeight
  }), true, 'Listening selection keeps the evidence in view instead of jumping to issue entry')
  assert.equal(await page.locator('.listening-review-answer strong').textContent(), 'B')
  assert.match(
    await page.locator('.listening-review-transcript').textContent(),
    /deciding when to meet at the library/u,
  )
  assert.match(
    await page.locator('.listening-audio-evidence').textContent(),
    /与官方听力原文比对通过/u,
  )
  assert.match(
    await page.locator('.listening-audio-evidence').textContent(),
    /内容安全检查通过/u,
  )
  assert.equal(
    await page.frameLocator('#review-frame').locator('text=官方答案').count(),
    0,
    'official answers stay outside the student Screen frame',
  )
  assert.equal(
    await page.frameLocator('#review-frame').locator('text=deciding when to meet').count(),
    0,
    'Listening transcripts stay outside the student Screen frame',
  )
  const screenTable = page.frameLocator('#review-frame')
    .locator(`[data-canonical-block-id="${targetId}"]`)
  if (process.env.LISTENING_QA_ARTIFACT_DIR) {
    mkdirSync(process.env.LISTENING_QA_ARTIFACT_DIR, { recursive: true })
    await page.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'review-captured.png') })
  }
  await screenTable.click()
  const sourceImage = page.locator('.source-proof img')
  await sourceImage.waitFor()
  await sourceImage.evaluate((image) => image.decode())
  assert.equal(await sourceImage.evaluate((image) => image.naturalWidth > 0), true)
  await page.frameLocator('#review-frame')
    .locator(`[data-canonical-media-id="${iconTargetId}"]`).click()
  await page.locator('.source-proof figcaption').getByText(iconTargetId).waitFor()
  assert.equal(
    await page.locator('#issue-form input[name="blockId"]').inputValue(),
    targetId,
    'an inline icon issue retains its semantic table block target',
  )
  assert.equal(
    await page.locator('#issue-form input[name="mediaId"]').inputValue(),
    iconTargetId,
  )
  assert.equal(
    await page.locator('#issue-form input[name="contentNodeId"]').inputValue(),
    'media-ref:warning-icon',
  )
  await page.locator('.media-compare-grid img').first().waitFor()
  assert.equal(await page.locator('.media-compare-grid img').count(), 2)
  await page.locator('.media-compare-grid img').evaluateAll((images) =>
    Promise.all(images.map((image) => image.decode())))
  assert.equal(
    await page.locator('.media-compare-grid img').evaluateAll((images) =>
      images.every((image) => image.naturalWidth > 0)),
    true,
  )
  const overlaySlider = page.locator('[data-media-overlay-opacity]')
  await overlaySlider.fill('100')
  assert.equal(
    await page.locator('[data-media-compare-layer]').evaluate((layer) => layer.style.opacity),
    '1',
  )
  const mediaConfirm = page.getByRole('button', { name: '确认这张候选图' })
  assert.equal(await mediaConfirm.isDisabled(), true)
  const mediaChecks = page.locator('#media-confirmation-form input[type="checkbox"]')
  assert.equal(await mediaChecks.count(), 11)
  for (let index = 0; index < await mediaChecks.count(); index += 1) {
    await mediaChecks.nth(index).check()
  }
  assert.equal(await mediaConfirm.isEnabled(), true)
  await Promise.all([
    page.waitForResponse((response) =>
      response.request().method() === 'GET'
      && new URL(response.url()).pathname === `/api/import-reviews/papers/${paperId}`),
    mediaConfirm.click(),
  ])
  await page.frameLocator('#review-frame')
    .locator(`[data-canonical-media-id="${iconTargetId}"]`).click()
  await page.getByText('这张候选图已确认').waitFor()
  assert(capturedMediaConfirmation)
  assert.equal(capturedMediaConfirmation.mediaId, iconTargetId)
  assert.equal(
    Object.values(capturedMediaConfirmation.checklist).every(Boolean),
    true,
  )
  await page.frameLocator('#review-frame')
    .locator('[data-canonical-block-id="block:unlocated"]').click()
  await page.getByText('源区域未配对。已知它来自第 1 页').waitFor()
  await page.getByRole('link', { name: '打开整份源文件' }).waitFor()
  await screenTable.click()
  await page.locator('.source-proof img').waitFor()
  await page.getByRole('tab', { name: 'Teacher Print' }).click()
  await page.locator('.source-proof img').waitFor()
  await page.getByRole('button', { name: '定位 Screen' }).click()
  await waitForFocus(
    page.frameLocator('#review-frame').locator(`[data-canonical-block-id="${targetId}"]`),
  )
  await page.getByRole('button', { name: '按这个原卷局部记录问题' }).click()
  await page.locator('#issue-form textarea[name="message"]').fill('原卷表格边框与 Screen 不一致')
  await page.getByRole('button', { name: '记录这个问题' }).click()
  await page.waitForFunction(() => document.querySelector('#issue-form textarea[name="message"]')?.value === '')
  assert(capturedIssue)
  assert.equal(capturedIssue.surface, 'source')
  assert.equal(capturedIssue.groupId, 'group:reading-a')
  assert.equal(capturedIssue.blockId, targetId)
  assert.equal(capturedIssue.pageNumber, '1')
  assert.deepEqual(capturedIssue.rect, region)
  await page.getByRole('button', { name: '查看原卷定位' }).click()
  await page.locator('.source-proof img').waitFor()
  assert.match(
    await page.locator('#issue-form .field-help').textContent(),
    /源文件/u,
  )

  listeningSupplied = false
  detail.listeningReview = null
  await page.reload()
  await page.frameLocator('#review-frame')
    .locator(`[data-canonical-block-id="${targetId}"]`).waitFor()
  assert.equal(
    await page.frameLocator('#review-frame')
      .locator(`[data-paper-question-id="${listeningQuestionId}"]`).count(),
    0,
    'not_supplied Screen has no Listening Question or phantom slot',
  )
  assert.equal(
    await page.locator('.listening-review-section').count(),
    0,
    'not_supplied Review has no Listening rail chrome',
  )
  if (process.env.LISTENING_QA_ARTIFACT_DIR) {
    await page.screenshot({ path: path.join(process.env.LISTENING_QA_ARTIFACT_DIR, 'review-not-supplied.png') })
  }

  console.log('verify-import-review-source-pairing: PASS')
} finally {
  if (browser) await browser.close()
  if (server) await new Promise((resolve) => server.close(resolve))
  rmSync(tempRoot, { recursive: true, force: true })
}
