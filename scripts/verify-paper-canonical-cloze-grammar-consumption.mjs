#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
  withoutKey,
} from '../shared/paper-canonical/stable.mjs'
import {
  buildCanonicalConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  createCanonicalConsumerRuntime,
} from '../server/paper-canonical/consumerRuntime.mjs'
import {
  createPaperCanonicalConsumerRoutes,
} from '../server/paper-canonical/consumerRoutes.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const fixture = makeClozeGrammarCanonicalReferenceFixture()
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')
const asset = JSON.parse(new TextDecoder().decode(fixture.sourceAsset))
const clozeAnalysis = JSON.parse(readFileSync(
  'app/public/paper-assets/paper-2026-i/latest/analyses/cloze-analysis-v1.json',
  'utf8',
))
const grammarFillAnalysis = JSON.parse(readFileSync(
  'app/public/paper-assets/paper-2026-i/latest/analyses/grammar-fill-analysis-v1.json',
  'utf8',
))

function exportItem(groupId) {
  const group = asset.content.groups[groupId]
  return {
    detail: {
      id: groupId,
      paperId: asset.paper.paperId,
      title: group.title,
      source: asset.paper.title,
      groupType: group.groupType === 'grammarFill' ? 'grammar_cloze' : group.groupType,
      passage: {
        title: group.title,
        materialText: group.passage.paragraphs.map((paragraph) => paragraph.text).join('\n'),
      },
      questions: group.questionIds.map((questionId) => {
        const question = asset.content.questions[questionId]
        return {
          id: questionId,
          questionNo: String(question.questionNo),
          stem: question.stem ?? '',
          answer: 'teacher supplement',
          explanation: 'teacher explanation',
          note: '',
          options: (question.options || []).map((option) => ({
            label: option.label,
            content: option.text,
          })),
        }
      }),
    },
    score: 1.5,
    sectionTitle: '',
    note: '',
  }
}

const items = [
  exportItem('group-2026-i-cloze'),
  exportItem('group-2026-i-grammar-fill'),
]
const blocks = items.map((item) => ({
  type: 'question_group',
  questionGroupId: item.detail.id,
  score: 1.5,
}))
const provisionActualArtifacts = process.argv.includes('--actual-artifacts')
const artifactProof = {}
const EXPECTED_FOUR_COLUMN_STARTS_PT = [0, 104, 208, 312]

async function readBrowserColumnStarts(page, rowSelector, optionSelector) {
  return page.locator(rowSelector).evaluateAll((rows, childSelector) =>
    rows.map((row) => {
      const root = row.getBoundingClientRect()
      return [...row.querySelectorAll(childSelector)].map((option) =>
        (option.getBoundingClientRect().x - root.x) * 72 / 96)
    }), optionSelector)
}

function assertBrowserColumnGates(rows, label) {
  assert.equal(rows.length, 15, `${label}: all 15 Cloze rows render`)
  for (const [rowIndex, starts] of rows.entries()) {
    assert.equal(starts.length, 4, `${label}: row ${rowIndex + 1} has A-D`)
    starts.forEach((start, column) => {
      assert.equal(
        Math.abs(start - EXPECTED_FOUR_COLUMN_STARTS_PT[column]) <= 1,
        true,
        `${label}: row ${rowIndex + 1} column ${column + 1} stays within 1pt `
        + `(actual ${start.toFixed(3)}, expected ${EXPECTED_FOUR_COLUMN_STARTS_PT[column]})`,
      )
    })
  }
  for (let column = 0; column < 4; column += 1) {
    const starts = rows.map((row) => row[column])
    assert.equal(
      Math.max(...starts) - Math.min(...starts) <= 0.5,
      true,
      `${label}: column ${column + 1} spread stays within 0.5pt`,
    )
  }
}

async function assertActualPaperBrowseBoundary({
  readyConsumption,
  legacyConsumption,
  invalidConsumption,
  outputDir = null,
}) {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl, 'Vite exposes the PaperBrowse QA mount')

  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    let consumption = readyConsumption
    let successfulAnalysisResponses = 0
    let resolveSuccessfulAnalyses
    const successfulAnalyses = new Promise((resolve) => {
      resolveSuccessfulAnalyses = resolve
    })
    const markSuccessfulAnalysis = () => {
      successfulAnalysisResponses += 1
      if (successfulAnalysisResponses === 2) resolveSuccessfulAnalyses()
    }
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
        body: JSON.stringify(asset),
      }))
    await page.route('**/paper-assets/**/analyses/**', (route) =>
      route.fulfill({ status: 404, body: '' }))
    await page.route('**/paper-assets/**/analyses/cloze-analysis-v1.json', (route) => {
      markSuccessfulAnalysis()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(clozeAnalysis),
      })
    })
    await page.route('**/paper-assets/**/analyses/grammar-fill-analysis-v1.json', (route) => {
      markSuccessfulAnalysis()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(grammarFillAnalysis),
      })
    })
    await page.route('**/paper-assets/**/figures/**', (route) =>
      route.fulfill({ status: 404, body: '' }))

    const qaUrl = new URL('canonical-consumption-qa.html', appUrl)
    qaUrl.searchParams.set('paperId', fixture.source.paperId)
    qaUrl.searchParams.set('lecture', '1')
    qaUrl.searchParams.set('focusGroupId', 'group-2026-i-cloze')
    qaUrl.searchParams.set('questionId', 'q-2026-i-041')
    await page.goto(qaUrl.href)
    await page.locator('[data-paper-question-id]').first().waitFor()
    await successfulAnalyses
    await page.getByText(
      clozeAnalysis.blanks['q-2026-i-041'].correctFit.reason,
      { exact: true },
    ).waitFor()
    assert.equal(
      successfulAnalysisResponses,
      2,
      'actual lecture mode consumes successful Cloze and Grammar Analysis responses',
    )
    assert.equal(
      await page.locator('[data-paper-question-id]').count(),
      15,
      'actual lecture-mode PaperBrowsePage renders every Cloze question',
    )
    for (const groupId of [
      'group-2026-i-cloze',
      'group-2026-i-grammar-fill',
    ]) {
      assert.equal(
        await page.locator(`[data-paper-browse-anchor="${groupId}"]`).count(),
        1,
        `actual PaperBrowsePage mounts ${groupId}`,
      )
    }
    assert.equal(
      await page.locator('[data-canonical-placement-signature]').count(),
      15,
      'successful Analysis preserves every canonical Cloze placement signature',
    )
    assertBrowserColumnGates(
      await readBrowserColumnStarts(
        page,
        '.ps-question-options-inline--four_columns',
        '.ps-question-options-inline-item',
      ),
      'Screen',
    )

    const grammarQaUrl = new URL(qaUrl)
    grammarQaUrl.searchParams.set('focusGroupId', 'group-2026-i-grammar-fill')
    grammarQaUrl.searchParams.set('questionId', 'q-2026-i-056')
    await page.goto(grammarQaUrl.href)
    await page.getByText(
      grammarFillAnalysis.blanks['q-2026-i-056'].reason,
      { exact: true },
    ).waitFor()
    assert.equal(
      successfulAnalysisResponses,
      4,
      'actual lecture mode mounts both successful Analysis models',
    )
    if (outputDir) {
      writeFileSync(path.join(outputDir, 'screen.html'), await page.content())
      await page.screenshot({
        path: path.join(outputDir, 'screen.png'),
        fullPage: true,
      })
      await page.pdf({
        path: path.join(outputDir, 'screen.pdf'),
        format: 'A4',
        printBackground: true,
      })
    }

    consumption = legacyConsumption
    await page.goto(qaUrl.href)
    await page.locator('[data-paper-question-id]').first().waitFor()
    await page.getByText(
      clozeAnalysis.blanks['q-2026-i-041'].correctFit.reason,
      { exact: true },
    ).waitFor()
    assert.equal(
      await page.locator('[data-paper-question-id]').count(),
      15,
      'actual lecture-mode PaperBrowsePage honors an explicit whole-family legacy plan',
    )
    assert.equal(
      await page.locator('[data-canonical-placement-signature]').count(),
      0,
      'successful Analysis does not upgrade an explicit legacy selection',
    )

    consumption = invalidConsumption
    await page.reload()
    await page.getByText(/partial or ambiguous/).waitFor()
    assert.equal(
      await page.locator('[data-paper-question-id]').count(),
      0,
      'actual PaperBrowsePage exposes no partial paper after plan rejection',
    )
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

async function availablePort() {
  const net = await import('node:net')
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close((error) => {
        if (error) reject(error)
        else resolve(address.port)
      })
    })
  })
}

async function waitForHttp(url, child, timeoutMs = 20_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (child.exitCode !== null) {
      throw new Error(`API exited before readiness (${child.exitCode}): ${child.output}`)
    }
    try {
      const response = await fetch(url)
      if (response.status) return
    } catch {
      // Keep waiting for the real API process.
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error(`Timed out waiting for ${url}\n${child.output}`)
}

function seedDraftRows(userDbPath) {
  const userId = 'local'
  const draftPaperId = 'draft-paper-canonical-reference'
  const userDb = new DatabaseSync(userDbPath)
  userDb.prepare(`
    INSERT INTO draft_papers (
      id, user_id, title, subject, status, current_marker,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'english', 'active', 1, datetime('now'), datetime('now'))
  `).run(draftPaperId, userId, 'Canonical Draft Paper Reference')
  const insertItem = userDb.prepare(`
    INSERT INTO draft_paper_items (
      id, draft_paper_id, group_id, source_paper_id, order_index,
      page_break_before, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
  `)
  for (const [index, item] of items.entries()) {
    insertItem.run(
      `draft-item-${index + 1}`,
      draftPaperId,
      item.detail.id,
      item.detail.paperId,
      index + 1,
    )
  }
  userDb.close()
  return { userId, draftPaperId }
}

function setCanonicalReference(bankDbPath, reference) {
  const bankDb = new DatabaseSync(bankDbPath)
  bankDb.exec(`
    CREATE TABLE IF NOT EXISTS canonical_paper_publications (
      paper_id TEXT NOT NULL,
      version_name TEXT NOT NULL,
      source_asset_version INTEGER NOT NULL,
      publication_digest TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (paper_id, version_name),
      UNIQUE (paper_id, source_asset_version, publication_digest)
    );
    DELETE FROM canonical_paper_publications;
  `)
  if (reference) {
    bankDb.prepare(`
      INSERT INTO canonical_paper_publications (
        paper_id, version_name, source_asset_version, publication_digest, is_current
      ) VALUES (?, ?, ?, ?, 1)
    `).run(
      reference.paperId,
      reference.versionName,
      reference.sourceAssetVersion,
      reference.publicationDigest,
    )
  }
  bankDb.close()
}

async function withActualDraftApi({
  fixtureRoot,
  paperAssetsRoot,
  canonicalReference,
}, callback) {
  mkdirSync(fixtureRoot, { recursive: true })
  const bankDbPath = path.join(fixtureRoot, 'question-bank.sqlite')
  const userDbPath = path.join(fixtureRoot, 'user-data.sqlite')
  copyFileSync(path.resolve('data/question-bank.sqlite'), bankDbPath)
  const port = await availablePort()
  const baseUrl = `http://127.0.0.1:${port}`
  const child = spawn('node', ['server/api.mjs'], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      QUESTION_BANK_API_PORT: String(port),
      QUESTION_BANK_DB: bankDbPath,
      QUESTION_BANK_PAPER_ASSET_ROOT: paperAssetsRoot,
      QUESTION_BANK_USER_SPACE_ROOT: path.join(fixtureRoot, 'user-space'),
      USER_DATA_DB: userDbPath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.output = ''
  child.stdout.on('data', (chunk) => { child.output += chunk.toString() })
  child.stderr.on('data', (chunk) => { child.output += chunk.toString() })
  try {
    await waitForHttp(`${baseUrl}/api/health`, child)
    setCanonicalReference(bankDbPath, canonicalReference)
    const draft = seedDraftRows(userDbPath)
    await callback({ baseUrl, bankDbPath, ...draft })
  } finally {
    child.kill('SIGTERM')
    const closed = new Promise((resolve) => {
      if (child.exitCode !== null) resolve()
      else child.once('close', resolve)
    })
    const exited = await Promise.race([
      closed.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 3_000)),
    ])
    if (!exited) {
      child.kill('SIGKILL')
      await closed
    }
  }
}

async function readHttpResponse(response) {
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return { status: response.status, json: await response.json(), body: null }
  }
  return {
    status: response.status,
    json: null,
    body: Buffer.from(await response.arrayBuffer()),
  }
}

function fetchPublic(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: AbortSignal.timeout(30_000),
  })
}

function readPdfColumnStarts(pdfBytes, outputRoot, label) {
  const pdfPath = path.join(outputRoot, `${label.replaceAll(' ', '-')}.pdf`)
  const bboxPath = `${pdfPath}.bbox.html`
  writeFileSync(pdfPath, pdfBytes)
  execFileSync('pdftotext', ['-bbox', pdfPath, bboxPath])
  const source = readFileSync(bboxPath, 'utf8')
  const words = [...source.matchAll(
    /<word xMin="([^"]+)" yMin="([^"]+)" xMax="[^"]+" yMax="[^"]+">([A-D])\.<\/word>/g,
  )].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    label: match[3],
  }))
  const rows = []
  for (let index = 0; index <= words.length - 4; index += 1) {
    const candidate = words.slice(index, index + 4)
    if (
      candidate.map((word) => word.label).join('') === 'ABCD'
      && Math.max(...candidate.map((word) => word.y))
        - Math.min(...candidate.map((word) => word.y)) <= 0.5
    ) {
      rows.push(candidate.map((word) => word.x - candidate[0].x))
      index += 3
    }
  }
  assertBrowserColumnGates(rows, label)
}

async function assertRejectedPhysicalRoutes({ baseUrl, draftPaperId, label }) {
  for (const request of [
    {
      method: 'GET',
      path: `/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
    },
    {
      method: 'GET',
      path: `/api/draft-papers/${draftPaperId}/pagination?versionType=student`,
    },
    {
      method: 'POST',
      path: `/api/draft-papers/${draftPaperId}/print-pdf`,
      body: { versionType: 'student' },
    },
  ]) {
    const response = await fetchPublic(`${baseUrl}${request.path}`, {
      method: request.method,
      headers: request.body ? { 'content-type': 'application/json' } : undefined,
      body: request.body ? JSON.stringify(request.body) : undefined,
    })
    const result = await readHttpResponse(response)
    assert.equal(
      response.ok,
      false,
      `${label}: ${request.method} ${request.path} rejects before exposure`,
    )
    assert.equal(result.body, null, `${label}: no HTML or PDF artifact escapes`)
    assert.equal(
      result.json?.paginatedHtml,
      undefined,
      `${label}: no paginated artifact escapes`,
    )
  }
}

async function assertActualDraftPrintPdfBoundary({
  rootDir,
  paperAssetsRoot,
  canonicalReference,
  partialPaperAssetsRoot,
  partialReference,
  corruptPaperAssetsRoot,
}) {
  await withActualDraftApi({
    fixtureRoot: path.join(rootDir, 'actual-http-ready'),
    paperAssetsRoot,
    canonicalReference,
  }, async ({ baseUrl, bankDbPath, draftPaperId }) => {
    const preview = await fetchPublic(
      `${baseUrl}/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
    )
    const previewHtml = await preview.text()
    assert.equal(preview.status, 200, 'real HTTP draft Print preview succeeds')
    assert.equal(
      (previewHtml.match(/data-canonical-placement-signature=/g) || []).length,
      15,
      'real HTTP draft Print preview carries the shared layoutPlan',
    )

    const paginationResponse = await fetchPublic(
      `${baseUrl}/api/draft-papers/${draftPaperId}/pagination?versionType=student`,
    )
    const pagination = await paginationResponse.json()
    assert.equal(paginationResponse.status, 200, 'real HTTP pagination succeeds')
    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(pagination.paginatedHtml, { waitUntil: 'load' })
      assertBrowserColumnGates(
        await readBrowserColumnStarts(
          page,
          '.canonical-options--four_columns',
          ':scope > span',
        ),
        'Draft pagination HTML',
      )
    } finally {
      await browser.close()
    }

    const pdfResponse = await fetchPublic(
      `${baseUrl}/api/draft-papers/${draftPaperId}/print-pdf`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionType: 'student' }),
      },
    )
    const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer())
    assert.equal(pdfResponse.status, 200, 'real HTTP draft PDF succeeds')
    assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
    readPdfColumnStarts(pdfBytes, rootDir, 'Draft public PDF')

    copyFileSync(
      path.join(
        paperAssetsRoot,
        canonicalReference.paperId,
        'versions',
        canonicalReference.versionName,
        'paper-asset.json',
      ),
      path.join(paperAssetsRoot, canonicalReference.paperId, 'paper-asset.json'),
    )
    setCanonicalReference(bankDbPath, null)

    const legacyPreview = await fetchPublic(
      `${baseUrl}/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
    )
    const legacyPreviewHtml = await legacyPreview.text()
    assert.equal(legacyPreview.status, 200, 'real HTTP legacy Print preview succeeds')
    assert.equal(
      (legacyPreviewHtml.match(/data-canonical-placement-signature=/g) || []).length,
      0,
      'real HTTP Print preview preserves explicit whole-family legacy',
    )
    const legacyPaginationResponse = await fetchPublic(
      `${baseUrl}/api/draft-papers/${draftPaperId}/pagination?versionType=student`,
    )
    const legacyPagination = await legacyPaginationResponse.json()
    assert.equal(legacyPaginationResponse.status, 200)
    assert.equal(
      (legacyPagination.paginatedHtml.match(/data-canonical-placement-signature=/g) || []).length,
      0,
      'real HTTP pagination preserves explicit whole-family legacy',
    )
    assert.equal(
      legacyPagination.reused,
      false,
      'real HTTP Consumption Plan change invalidates the physical artifact cache',
    )
    const legacyPdf = await fetchPublic(
      `${baseUrl}/api/draft-papers/${draftPaperId}/print-pdf`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ versionType: 'student' }),
      },
    )
    assert.equal(legacyPdf.status, 200, 'real HTTP legacy PDF succeeds')
    assert.equal(
      Buffer.from(await legacyPdf.arrayBuffer()).subarray(0, 4).toString(),
      '%PDF',
    )
  })

  await withActualDraftApi({
    fixtureRoot: path.join(rootDir, 'actual-http-partial'),
    paperAssetsRoot: partialPaperAssetsRoot,
    canonicalReference: partialReference,
  }, ({ baseUrl, draftPaperId }) =>
    assertRejectedPhysicalRoutes({ baseUrl, draftPaperId, label: 'partial Publication' }))

  await withActualDraftApi({
    fixtureRoot: path.join(rootDir, 'actual-http-corrupt'),
    paperAssetsRoot: corruptPaperAssetsRoot,
    canonicalReference,
  }, ({ baseUrl, draftPaperId }) =>
    assertRejectedPhysicalRoutes({ baseUrl, draftPaperId, label: 'corrupt Publication' }))
}

function cloneCanonicalPaperRoot(sourceRoot, targetRoot) {
  mkdirSync(targetRoot, { recursive: true })
  cpSync(
    path.join(sourceRoot, fixture.source.paperId),
    path.join(targetRoot, fixture.source.paperId),
    { recursive: true },
  )
}

function createPartialPublicationRoot(sourceRoot, targetRoot, reference) {
  cloneCanonicalPaperRoot(sourceRoot, targetRoot)
  const versionRoot = path.join(
    targetRoot,
    reference.paperId,
    'versions',
    reference.versionName,
  )
  const groupsPath = path.join(
    versionRoot,
    'canonical',
    'canonical-question-groups-v1.json',
  )
  const groups = JSON.parse(readFileSync(groupsPath, 'utf8'))
  groups.groups = groups.groups.filter(
    (group) => group.identity.groupId !== 'group-2026-i-grammar-fill',
  )
  const groupsBytes = Buffer.from(`${stableStringify(groups)}\n`)
  writeFileSync(groupsPath, groupsBytes)

  const canonicalDir = path.join(versionRoot, 'canonical')
  const manifestName = readdirSync(canonicalDir).find(
    (name) => /^canonical-paper-publication-v\d+\.json$/.test(name),
  )
  assert.ok(manifestName, 'partial fixture finds the sealed Publication manifest')
  const manifestPath = path.join(canonicalDir, manifestName)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  const descriptor = manifest.artifacts.find(
    (artifact) => artifact.role === 'question_groups',
  )
  descriptor.byteLength = groupsBytes.byteLength
  descriptor.sha256 = sha256(groupsBytes)
  manifest.publicationDigest = digestJson(withoutKey(manifest, 'publicationDigest'))
  writeFileSync(manifestPath, `${stableStringify(manifest)}\n`)

  const latestDir = path.join(targetRoot, reference.paperId, 'latest')
  const latestName = readdirSync(latestDir).find((name) => name.endsWith('.json'))
  assert.ok(latestName, 'partial fixture finds the latest Publication reference')
  const latestPath = path.join(latestDir, latestName)
  const latest = JSON.parse(readFileSync(latestPath, 'utf8'))
  latest.publicationDigest = manifest.publicationDigest
  writeFileSync(latestPath, `${stableStringify(latest)}\n`)
  return { ...reference, publicationDigest: manifest.publicationDigest }
}

function createCorruptPublicationRoot(sourceRoot, targetRoot, reference) {
  cloneCanonicalPaperRoot(sourceRoot, targetRoot)
  const groupsPath = path.join(
    targetRoot,
    reference.paperId,
    'versions',
    reference.versionName,
    'canonical',
    'canonical-question-groups-v1.json',
  )
  writeFileSync(groupsPath, `${readFileSync(groupsPath, 'utf8')} `)
}

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-consumption-'))
const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))

try {
  publishCanonicalPaperPublication({
    rootDir,
    db,
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  const store = {
    ...createFileSystemCanonicalPublicationStore({ rootDir, db }),
    projectLegacyFamily: async ({ familyContractId }) => [
      { kind: 'legacy_family', familyContractId },
    ],
  }
  const runtime = createCanonicalConsumerRuntime({ rootDir, db })
  const screenConsumption = runtime.load({
    paperId: fixture.source.paperId,
    consumerId: 'screen',
  })
  assert.equal(screenConsumption.disposition, 'ready')
  assert.equal(
    screenConsumption.selections.find(
      (selection) => selection.familyContractId === 'cloze',
    )?.mode,
    'canonical',
  )
  const screenRoute = createPaperCanonicalConsumerRoutes()[0]
  let screenRouteResult = null
  await screenRoute.handle({
    response: {},
    url: new URL(
      `http://eqb.test/api/paper-canonical/consumption?paperId=${fixture.source.paperId}`,
    ),
    context: {
      loadCanonicalConsumption: runtime.load,
      sendJson: (_response, status, body) => {
        screenRouteResult = { status, body }
      },
    },
  })
  assert.equal(screenRouteResult.status, 200)
  assert.equal(screenRouteResult.body.publicationDigest, screenConsumption.publicationDigest)
  const publicExports = createExportImplementation({
    rootDir,
    exportDir: path.join(rootDir, 'exports'),
    getQuestionGroupDetail: (groupId) =>
      items.find((item) => item.detail.id === groupId)?.detail || null,
    buildPrintHtml,
    resolveCanonicalConsumption: runtime.resolveForItems,
  })
  const publicInput = {
    title: asset.paper.title,
    versionType: 'student',
    printStyle: 'exam',
    items: items.map((item) => ({
      questionGroupId: item.detail.id,
      score: item.score,
    })),
    blocks,
    questionNumberStart: 41,
  }
  const publicPrint = publicExports.exportPrintHtml(publicInput)
  const publicTeacherPrint = publicExports.exportPrintHtml({
    ...publicInput,
    versionType: 'teacher',
  })
  assert.equal(
    publicPrint.normalizationDiagnostics.filter(
      (diagnostic) => diagnostic.source === 'whole-paper-consumption',
    ).length,
    2,
  )
  assert.equal(
    (publicPrint.body.match(/data-canonical-placement-signature=/g) || []).length,
    15,
  )
  const signatures = new Map()
  for (const [consumerId, consumerContract] of Object.entries(consumerContractRefs)) {
    const consumption = await loadPaperForConsumption({
      paperId: fixture.source.paperId,
      consumerContract,
    }, store)
    assert.equal(consumption.disposition, 'ready')

    const cloze = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'cloze',
      groupId: 'group-2026-i-cloze',
    })
    const grammar = projectCanonicalConsumerGroup({
      consumption,
      familyContractId: 'grammar-fill',
      groupId: 'group-2026-i-grammar-fill',
    })
    assert.equal(cloze.questions.length, 15)
    assert.equal(grammar.questions.length, 10)
    assert.equal(cloze.paragraphs.flatMap((paragraph) => paragraph.nodes).filter((node) => node.type === 'blank').length, 15)
    assert.equal(grammar.paragraphs.flatMap((paragraph) => paragraph.nodes).filter((node) => node.type === 'blank').length, 10)
    assert.equal(cloze.questions.every((question) => question.layoutPlan?.status === 'selected'), true)
    signatures.set(consumerId, {
      semantic: [cloze.semanticSignature, grammar.semanticSignature],
      placement: cloze.questions.map((question) => question.placementSignature),
    })

    if (consumerId === 'screen') {
      const screenArtifact = buildCanonicalConsumptionSurfaceData({
        consumption: screenRouteResult.body,
        familyContractId: 'cloze',
        groupId: 'group-2026-i-cloze',
      })
      assert.equal(screenArtifact.surfaceData.semanticParagraphs.length, 4)
      assert.deepEqual(
        screenArtifact.placementSignatures,
        cloze.questions.map((question) => question.placementSignature),
      )
      assert.equal(
        screenArtifact.surfaceData.questions.every(
          (question) => question.canonicalPlacement?.mode === 'four_columns',
        ),
        true,
      )
      assert.deepEqual(
        screenArtifact.surfaceData.questions[0].canonicalPlacement,
        {
          mode: 'four_columns',
          signature: cloze.questions[0].placementSignature,
          rowWidthPt: 438.2,
          columnStartsPt: [0, 104, 208, 312],
          columnWidthsPt: [104, 104, 104, 126.2],
        },
      )
      artifactProof.screen = {
        cloze: screenArtifact,
        grammar: buildCanonicalConsumptionSurfaceData({
          consumption: screenRouteResult.body,
          familyContractId: 'grammar-fill',
          groupId: 'group-2026-i-grammar-fill',
        }),
      }
    }
    if (consumerId === 'print_pdf') {
      const student = buildPrintHtml({
        title: asset.paper.title,
        versionType: 'student',
        printStyle: 'exam',
        items,
        blocks,
        questionNumberStart: 41,
        canonicalConsumption: consumption,
      })
      const teacher = buildPrintHtml({
        title: asset.paper.title,
        versionType: 'teacher',
        printStyle: 'exam',
        items,
        blocks,
        questionNumberStart: 41,
        canonicalConsumption: consumption,
      })
      assert.equal(student.includes('teacher supplement'), false)
      assert.equal(student.includes('teacher explanation'), false)
      assert.equal(teacher.includes('teacher supplement'), true)
      assert.equal((student.match(/class="print-blank-num"/g) || []).length, 25)
      assert.equal(
        (student.match(/data-canonical-placement-signature=/g) || []).length,
        15,
      )
      assert.equal(
        (student.match(/grid-template-columns:104pt 104pt 104pt 126\.2pt/g) || []).length,
        15,
      )
      artifactProof.print = { student, teacher }
    }

  }
  assert.deepEqual(signatures.get('screen'), signatures.get('print_pdf'))
  artifactProof.print = {
    student: publicPrint.body,
    teacher: publicTeacherPrint.body,
  }

  const legacyMisalignedItems = structuredClone(items)
  legacyMisalignedItems[0].detail.passage.materialText =
    legacyMisalignedItems[0].detail.passage.materialText.replace('__41__', '')
  assert.throws(
    () => buildPrintHtml({
      title: asset.paper.title,
      versionType: 'student',
      printStyle: 'exam',
      items: legacyMisalignedItems,
      blocks,
      questionNumberStart: 41,
    }),
    /in-text blank count/,
  )

  const complete = await loadPaperForConsumption({
    paperId: fixture.source.paperId,
    consumerContract: consumerContractRefs.screen,
  }, store)
  const oneColumnConsumption = structuredClone(await loadPaperForConsumption({
    paperId: fixture.source.paperId,
    consumerContract: consumerContractRefs.print_pdf,
  }, store))
  const oneColumnOccurrence = oneColumnConsumption.selections
    .find((selection) => selection.familyContractId === 'cloze')
    .projectedOccurrences[0]
  for (const option of oneColumnOccurrence.choices.sets[0].options) {
    option.content[0].text = Array.from({ length: 24 }, () => 'word').join(' ')
  }
  const oneColumnGroup = projectCanonicalConsumerGroup({
    consumption: oneColumnConsumption,
    familyContractId: 'cloze',
    groupId: 'group-2026-i-cloze',
  })
  assert.equal(oneColumnGroup.questions[0].layoutPlan.mode, 'one_column')
  const oneColumnHtml = buildPrintHtml({
    title: asset.paper.title,
    versionType: 'student',
    printStyle: 'exam',
    items: [items[0]],
    blocks: [blocks[0]],
    questionNumberStart: 41,
    canonicalConsumption: oneColumnConsumption,
  })
  assert.equal(oneColumnHtml.includes('canonical-options--one_column'), true)
  const partial = structuredClone(complete)
  partial.selections.find((selection) => selection.familyContractId === 'cloze').projectedOccurrences.pop()
  assert.throws(
    () => projectCanonicalConsumerGroup({
      consumption: partial,
      familyContractId: 'cloze',
      groupId: 'group-2026-i-cloze',
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
  const legacyRoot = path.join(rootDir, 'legacy-only')
  mkdirSync(path.join(legacyRoot, fixture.source.paperId), { recursive: true })
  writeFileSync(
    path.join(legacyRoot, fixture.source.paperId, 'paper-asset.json'),
    fixture.sourceAsset,
  )
  const legacyDb = new DatabaseSync(path.join(legacyRoot, 'publication.sqlite'))
  const legacyRuntime = createCanonicalConsumerRuntime({
    rootDir: legacyRoot,
    db: legacyDb,
  })
  const explicitLegacy = legacyRuntime.resolveForItems({
    consumerId: 'screen',
    items,
  })
  assert.deepEqual(
    explicitLegacy.selections.map((selection) => selection.mode),
    ['legacy', 'legacy'],
    'runtime preserves the explicit whole-family legacy plan',
  )
  assert.throws(
    () => legacyRuntime.resolveForItems({
      consumerId: 'screen',
      items: [
        items[0],
        {
          ...items[1],
          detail: { ...items[1].detail, paperId: 'another-paper' },
        },
      ],
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
  const databaseLegacyItems = structuredClone(items)
  for (const item of databaseLegacyItems) {
    delete item.detail.paperId
    item.sourcePaperId = 'legacy-paper-ticket-05'
  }
  const databaseLegacy = legacyRuntime.resolveForItems({
    consumerId: 'print_pdf',
    items: databaseLegacyItems,
  })
  assert.deepEqual(
    databaseLegacy.selections.map((selection) => selection.mode),
    ['legacy', 'legacy'],
    'DB-only groups retain an explicit contract-authorized whole-family legacy plan',
  )
  const mixedDatabaseLegacyItems = structuredClone(databaseLegacyItems)
  mixedDatabaseLegacyItems[1].sourcePaperId = 'another-legacy-paper'
  assert.throws(
    () => legacyRuntime.resolveForItems({
      consumerId: 'print_pdf',
      items: mixedDatabaseLegacyItems,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'DB-only legacy selection rejects mixed source identity',
  )
  const legacyExports = createExportImplementation({
    rootDir,
    exportDir: path.join(rootDir, 'legacy-exports'),
    getQuestionGroupDetail: (groupId) =>
      items.find((item) => item.detail.id === groupId)?.detail || null,
    buildPrintHtml,
    resolveCanonicalConsumption: legacyRuntime.resolveForItems,
  })
  for (const result of [
    legacyExports.exportPrintHtml(publicInput),
  ]) {
    assert.equal(
      result.normalizationDiagnostics.filter(
        (diagnostic) =>
          diagnostic.source === 'whole-paper-consumption'
          && diagnostic.status === 'legacy',
      ).length,
      2,
      'public export honors explicit whole-family legacy selections',
    )
  }
  const actualOutputDir = provisionActualArtifacts
    ? path.resolve(
        '.scratch',
        'paper-canonical-ticket-05-qa',
        execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
          encoding: 'utf8',
        }).trim(),
      )
    : null
  if (actualOutputDir) mkdirSync(actualOutputDir, { recursive: true })
  const withBrowserFixtureReading = (consumption) => {
    const browserConsumption = structuredClone(consumption)
    let readingSelection = browserConsumption.selections.find(
      (selection) => selection.familyContractId === 'reading',
    )
    if (!readingSelection) {
      readingSelection = { familyContractId: 'reading' }
      browserConsumption.selections.push(readingSelection)
    }
    readingSelection.mode = 'legacy'
    readingSelection.groupIds = Object.values(asset.content.groups)
      .filter((candidate) => candidate.groupType === 'reading')
      .map((candidate) => candidate.groupId)
    delete readingSelection.projectedOccurrences
    let applicationSelection = browserConsumption.selections.find(
      (selection) => selection.familyContractId === 'application-writing',
    )
    if (!applicationSelection) {
      applicationSelection = { familyContractId: 'application-writing' }
      browserConsumption.selections.push(applicationSelection)
    }
    applicationSelection.mode = 'legacy'
    applicationSelection.groupIds = Object.values(asset.content.groups)
      .filter((candidate) => {
        if (candidate.groupType !== 'writing' || !candidate.writingTaskId) {
          return false
        }
        return asset.content.writingTasks?.[candidate.writingTaskId]?.taskType
          === 'application'
      })
      .map((candidate) => candidate.groupId)
    delete applicationSelection.projectedOccurrences
    return browserConsumption
  }
  await assertActualPaperBrowseBoundary({
    readyConsumption: withBrowserFixtureReading(screenRouteResult.body),
    legacyConsumption: withBrowserFixtureReading(explicitLegacy),
    invalidConsumption: withBrowserFixtureReading(partial),
    outputDir: actualOutputDir,
  })
  const canonicalReferenceRow = db.prepare(`
    SELECT paper_id, version_name, source_asset_version, publication_digest
    FROM canonical_paper_publications
    WHERE paper_id = ? AND is_current = 1
  `).get(fixture.source.paperId)
  const canonicalReference = {
    paperId: canonicalReferenceRow.paper_id,
    versionName: canonicalReferenceRow.version_name,
    sourceAssetVersion: canonicalReferenceRow.source_asset_version,
    publicationDigest: canonicalReferenceRow.publication_digest,
  }
  const httpPaperAssetsRoot = path.join(rootDir, 'actual-http-assets')
  const partialPaperAssetsRoot = path.join(rootDir, 'partial-http-assets')
  const corruptPaperAssetsRoot = path.join(rootDir, 'corrupt-http-assets')
  cloneCanonicalPaperRoot(rootDir, httpPaperAssetsRoot)
  const partialReference = createPartialPublicationRoot(
    rootDir,
    partialPaperAssetsRoot,
    canonicalReference,
  )
  createCorruptPublicationRoot(
    rootDir,
    corruptPaperAssetsRoot,
    canonicalReference,
  )
  await assertActualDraftPrintPdfBoundary({
    rootDir,
    paperAssetsRoot: httpPaperAssetsRoot,
    canonicalReference,
    partialPaperAssetsRoot,
    partialReference,
    corruptPaperAssetsRoot,
  })
  legacyDb.close()
  const mismatchedBlankJoin = structuredClone(complete)
  const clozeOccurrence = mismatchedBlankJoin.selections
    .find((selection) => selection.familyContractId === 'cloze')
    .projectedOccurrences[0]
  clozeOccurrence.blanks[1].questionId = clozeOccurrence.blanks[0].questionId
  assert.throws(
    () => projectCanonicalConsumerGroup({
      consumption: mismatchedBlankJoin,
      familyContractId: 'cloze',
      groupId: 'group-2026-i-cloze',
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
  for (const disposition of ['not_found', 'retryable_unavailable', 'incompatible']) {
    assert.throws(
      () => projectCanonicalConsumerGroup({
        consumption: { disposition },
        familyContractId: 'cloze',
        groupId: 'group-2026-i-cloze',
      }),
      { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    )
  }

  if (provisionActualArtifacts) {
    const outputDir = actualOutputDir
    const printStudentPath = path.join(outputDir, 'print-student.html')
    const printTeacherPath = path.join(outputDir, 'print-teacher.html')
    writeFileSync(printStudentPath, artifactProof.print.student)
    writeFileSync(printTeacherPath, artifactProof.print.teacher)

    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true })
    try {
      const printPage = await browser.newPage()
      await printPage.goto(new URL(`file://${printStudentPath}`).href)
      assert.equal(
        await printPage.locator('.print-blank-num').count(),
        25,
      )
      assert.equal(
        await printPage.locator('.options-inline--canonical').evaluateAll(
          (rows) => rows.every((row) => row.scrollWidth <= row.clientWidth + 1),
        ),
        true,
      )
      assertBrowserColumnGates(
        await readBrowserColumnStarts(
          printPage,
          '.canonical-options--four_columns',
          ':scope > span',
        ),
        'Print',
      )
      await printPage.screenshot({
        path: path.join(outputDir, 'print-student.png'),
        fullPage: true,
      })
      await printPage.pdf({
        path: path.join(outputDir, 'print-student.pdf'),
        format: 'A4',
        printBackground: true,
      })
    } finally {
      await browser.close()
    }

    writeFileSync(
      path.join(outputDir, 'HEAD.txt'),
      `${execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()}\n`,
    )
    execFileSync(
      process.execPath,
      ['scripts/verify-paper-canonical-abcd-layout.mjs', '--actual-artifacts'],
      { stdio: 'inherit' },
    )
    console.log(`QA artifacts: ${outputDir}`)
  }
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS Cloze and Grammar Fill canonical consumption')
