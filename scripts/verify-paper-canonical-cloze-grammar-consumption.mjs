#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import {
  copyFileSync,
  cpSync,
  existsSync,
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

import manifestV17 from '../standards/paper-canonical/manifest-v17.json' with { type: 'json' }
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
  grammarFillRhythmForPaperAuthority,
} from '../shared/paper-canonical/grammarFillRhythm.mjs'
import {
  grammarFillBlankRulingForRhythm,
} from '../shared/papersurface/blankRuling.mjs'
import { clozeRhythm } from '../shared/paper-canonical/clozeRhythm.mjs'
import {
  createPaperCanonicalConsumerRoutes,
} from '../server/paper-canonical/consumerRoutes.mjs'
import {
  loadCanonicalGrammarFillPrintChrome,
} from '../server/paper-canonical/grammarFillPrintSourceBinding.mjs'
import {
  immutablePublicationSourceForConsumption,
} from '../server/paper-canonical/publication.mjs'
import {
  loadPublicationBoundSourceAssetRepresentation,
} from '../server/paper-canonical/sourceAssetRepresentation.mjs'
import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { createDraftPaperStore } from '../server/draft-paper/draftPaperStore.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'
import {
  seedConfirmedCanonicalDraftFixture,
} from './lib/canonicalDraftE2eFixture.mjs'

const fixture = makeClozeGrammarCanonicalReferenceFixture()
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')
const asset = JSON.parse(new TextDecoder().decode(fixture.sourceAsset))
const clozeAnalysis = JSON.parse(readFileSync(
  'app/public/paper-assets/paper-2026-i/latest/analyses/cloze-analysis-v1.json',
  'utf8',
))
const grammarFillAnalysisPath =
  'app/public/paper-assets/paper-2026-i/latest/analyses/grammar-fill-analysis-v1.json'
const grammarFillAnalysisBytes = readFileSync(grammarFillAnalysisPath)
const grammarFillAnalysis = JSON.parse(grammarFillAnalysisBytes)
const officialAnswers = JSON.parse(readFileSync(
  'test-fixtures/paper-import/paper-2026-i-canonical-pilot/answer-key.json',
  'utf8',
))

function grammarFillExplanation(entry) {
  return [
    entry?.reason ? `【${entry.answer}】${entry.reason}` : '',
    entry?.teachingNote ? `点拨：${entry.teachingNote}` : '',
  ].filter(Boolean).join('\n')
}

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
        const grammarFillEntry =
          group.groupType === 'grammarFill'
            ? grammarFillAnalysis.blanks[questionId]
            : null
        return {
          id: questionId,
          questionNo: String(question.questionNo),
          stem: question.stem ?? '',
          answer:
            group.groupType === 'grammarFill'
              ? officialAnswers.answers[questionId].answer
              : 'teacher supplement',
          explanation:
            group.groupType === 'grammarFill'
              ? grammarFillExplanation(grammarFillEntry)
              : 'teacher explanation',
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
const EXPECTED_FOUR_COLUMN_STARTS_PT = [0, 110.5, 214.6, 319.25]

async function readBrowserColumnStarts(page, rowSelector, optionSelector) {
  return page.locator(rowSelector).evaluateAll((rows, childSelector) =>
    rows.map((row) => {
      const root = row.getBoundingClientRect()
      return [...row.querySelectorAll(childSelector)].map((option) =>
        (option.getBoundingClientRect().x - root.x) * 72 / 96)
    }), optionSelector)
}

function assertBrowserColumnGates(rows, label, { anchorColumn = 0 } = {}) {
  assert.equal(rows.length, 15, `${label}: all 15 Cloze rows render`)
  for (const [rowIndex, starts] of rows.entries()) {
    assert.equal(starts.length, 4, `${label}: row ${rowIndex + 1} has A-D`)
    starts.forEach((start, column) => {
      if (anchorColumn !== 0 && column === 0) return
      const normalizedStart = start - starts[anchorColumn]
      const normalizedExpected =
        EXPECTED_FOUR_COLUMN_STARTS_PT[column]
        - EXPECTED_FOUR_COLUMN_STARTS_PT[anchorColumn]
      assert.equal(
        Math.abs(normalizedStart - normalizedExpected) <= 1,
        true,
        `${label}: row ${rowIndex + 1} column ${column + 1} stays within 1pt `
        + `(actual ${normalizedStart.toFixed(3)}, expected ${normalizedExpected})`,
      )
    })
  }
  for (let column = 0; column < 4; column += 1) {
    if (anchorColumn !== 0 && column === 0) continue
    const starts = rows.map((row) => row[column] - row[anchorColumn])
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
  browserAssetSource = asset,
  onReady = null,
  outputDir = null,
  verifyRejection = true,
}) {
  const browserAsset = structuredClone(browserAssetSource)
  const readyGroupIds = new Set(
    readyConsumption.selections.flatMap((selection) => selection.groupIds),
  )
  const familyGroupType = {
    reading: 'reading',
    'seven-choices': 'sevenChoices',
    cloze: 'cloze',
    'grammar-fill': 'grammarFill',
    'application-writing': 'writing',
    'continuation-writing': 'writing',
  }
  const sourceGroups = Object.values(browserAsset.content.groups)
  const alignedGroups = Object.fromEntries(
    Object.entries(browserAsset.content.groups).filter(
      ([groupId, group]) =>
        group.groupType === 'listening' && readyGroupIds.has(groupId),
    ),
  )
  for (const selection of readyConsumption.selections) {
    for (const groupId of selection.groupIds) {
      const template = browserAsset.content.groups[groupId]
        || sourceGroups.find((group) =>
          group.groupType === familyGroupType[selection.familyContractId])
      assert.ok(template, `browser fixture has ${selection.familyContractId}`)
      alignedGroups[groupId] = {
        ...structuredClone(template),
        groupId,
      }
    }
  }
  browserAsset.content.groups = alignedGroups
  browserAsset.content.blocks = browserAsset.content.blocks.filter(
    (block) =>
      block.type !== 'group'
      || browserAsset.content.groups[block.groupId],
  )
  const sourceBlockGroupIds = new Set(
    browserAsset.content.blocks
      .filter((block) => block.type === 'group')
      .map((block) => block.groupId),
  )
  for (const groupId of readyGroupIds) {
    if (!sourceBlockGroupIds.has(groupId)) {
      browserAsset.content.blocks.push({ type: 'group', groupId })
    }
  }
  const browserGroupIds = new Set(
    Object.keys(browserAsset.content.groups),
  )
  const consumptionForBrowserAsset = (input) => {
    const next = structuredClone(input)
    if (!Array.isArray(next.selections)) return next
    next.selections = next.selections
      .map((selection) => ({
        ...selection,
        groupIds: selection.groupIds.filter((groupId) =>
          browserGroupIds.has(groupId)),
        ...(selection.projectedOccurrences
          ? {
              projectedOccurrences: selection.projectedOccurrences.filter(
                (occurrence) => browserGroupIds.has(occurrence.groupId),
              ),
            }
          : {}),
      }))
      .filter((selection) => selection.groupIds.length > 0)
    return next
  }
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl, 'Vite exposes the PaperBrowse QA mount')

  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
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
        body: JSON.stringify(consumptionForBrowserAsset(consumption)),
      }))
    await page.route('**/paper-assets/**/paper-asset.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(browserAsset),
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
    try {
      await page.locator('[data-paper-question-id]').first().waitFor()
    } catch (error) {
      throw new Error(
        `PaperBrowse did not mount canonical Cloze/Grammar: ${
          await page.locator('body').innerText()
        }`,
        { cause: error },
      )
    }
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
      await page.locator(
        '[data-paper-browse-anchor="group-2026-i-cloze"] [data-paper-question-id]',
      ).count(),
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
      await page.locator(
        '[data-paper-browse-anchor="group-2026-i-cloze"] [data-canonical-placement-signature]',
      ).count(),
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
    if (onReady) await onReady(page)

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

    if (verifyRejection) {
      consumption = legacyConsumption
      await page.goto(qaUrl.href)
      await page.getByText(
        /whole-family selection|Family cloze has no unambiguous whole-family selection/,
      ).waitFor()
      assert.equal(
        await page.locator(
          '[data-paper-browse-anchor="group-2026-i-cloze"] [data-paper-question-id]',
        ).count(),
        0,
        'a caller-supplied legacy Screen plan exposes no question output',
      )

      consumption = invalidConsumption
      await page.reload()
      await page.getByText(
        /partial or ambiguous|Canonical visible structure is invalid/,
      ).waitFor()
      assert.equal(
        await page.locator('[data-paper-question-id]').count(),
        0,
        'actual PaperBrowsePage exposes no partial paper after plan rejection',
      )
    }
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

function seedDraftRows(userDbPath, groupIds = items.map((item) => item.detail.id)) {
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
  for (const [index, groupId] of groupIds.entries()) {
    insertItem.run(
      `draft-item-${index + 1}`,
      draftPaperId,
      groupId,
      fixture.source.paperId,
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
  groupIds,
}, callback) {
  mkdirSync(fixtureRoot, { recursive: true })
  const bankDbPath = path.join(fixtureRoot, 'question-bank.sqlite')
  const userDbPath = path.join(fixtureRoot, 'user-data.sqlite')
  seedConfirmedCanonicalDraftFixture({
    repositoryRoot: path.resolve('.'),
    bankDbPath,
    copyPaperAssets: false,
  })
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
    const draft = seedDraftRows(userDbPath, groupIds)
    await callback({ baseUrl, bankDbPath, userDbPath, ...draft })
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
  const words = source.split(/<page\b[^>]*>/).slice(1).flatMap(
    (pageSource, page) => [...pageSource.matchAll(
      /<word xMin="([^"]+)" yMin="([^"]+)" xMax="[^"]+" yMax="[^"]+">([^<]+)<\/word>/g,
    )].map((match) => {
      const combined = match[3].match(/^(?:([0-9]+)\.)?([A-D])\.$/)
      return {
        page,
        x: Number(match[1]),
        y: Number(match[2]),
        text: match[3],
        questionNo: combined?.[1] || match[3].match(/^([0-9]+)\.$/)?.[1] || null,
        label: combined?.[2] || null,
      }
    }),
  )
  const optionWords = words.filter((word) => word.label)
  const rows = []
  const questionStarts = []
  const clozeQuestions = words.filter((word) =>
    Number(word.questionNo) >= 41 && Number(word.questionNo) <= 55,
  )
  assert.equal(clozeQuestions.length, 15, `${label}: all 15 Cloze qnums render`)
  for (const question of clozeQuestions) {
    const candidate = optionWords.filter((word) =>
      word.page === question.page && Math.abs(word.y - question.y) <= 0.5,
    ).sort((left, right) => left.x - right.x)
    assert.deepEqual(
      candidate.map((word) => word.label),
      ['A', 'B', 'C', 'D'],
      `${label}: question ${question.questionNo} retains its A-D option labels`,
    )
    const firstOptionStart = candidate[0].questionNo
      ? question.x + clozeRhythm.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt
      : candidate[0].x
    assert.equal(
      Math.abs(
        firstOptionStart
        - question.x
        - clozeRhythm.horizontalChoiceGeometry.rendererMapping.questionLabelWidthPt,
      ) <= 1,
      true,
      `${label}: qnum box meets the A anchor with no added layout gap (actual ${firstOptionStart - question.x})`,
    )
    questionStarts.push(question.x)
    rows.push([firstOptionStart, ...candidate.slice(1).map((word) => word.x)])
  }
  assert.equal(
    Math.max(...questionStarts) - Math.min(...questionStarts) <= 0.5,
    true,
    `${label}: all Cloze question labels share the passage left boundary`,
  )
  assertBrowserColumnGates(rows, label, { anchorColumn: 1 })
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
    assert.equal(
      preview.status,
      200,
      `real HTTP draft Print preview succeeds: ${previewHtml}`,
    )
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
    const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
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

    await assertRejectedPhysicalRoutes({
      baseUrl,
      draftPaperId,
      label: 'legacy-only raw asset',
    })
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

// Ticket 35 Owner QA: a Writing Question Group deliberately owns zero
// Questions. The public draft-add route must therefore reach the canonical
// whole-paper gate instead of rejecting the group as if it were malformed
// objective content. This is deliberately an HTTP assertion: the failed Owner
// QA flow encountered the friendly `题组没有小题` response at this exact seam.
async function assertWritingDraftGateDoesNotRequireQuestions({
  rootDir,
  paperAssetsRoot,
  canonicalReference,
}) {
  await withActualDraftApi({
    fixtureRoot: path.join(rootDir, 'actual-http-writing-readiness'),
    paperAssetsRoot,
    canonicalReference,
  }, async ({ baseUrl }) => {
    for (const groupId of [
      'group-2026-i-writing-application',
      'group-2026-i-writing-continuation',
    ]) {
      const response = await fetchPublic(
        `${baseUrl}/api/draft-papers/current/items`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ groupId }),
        },
      )
      const result = await readHttpResponse(response)
      assert.notEqual(
        result.json?.error,
        '题组没有小题',
        `real public draft add recognizes ${groupId} as a zero-question Writing Task`,
      )
    }
  })
}

const ticket35PublicationStore = path.resolve(
  'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store',
)

function mixedDraftDetail(consumption, groupId) {
  const familyContractId = consumption.selections.find(
    (selection) => selection.groupIds.includes(groupId),
  )?.familyContractId
  assert.ok(familyContractId, `${groupId} has one canonical family`)
  const group = projectCanonicalConsumerGroup({
    consumption,
    familyContractId,
    groupId,
  })
  return {
    id: groupId,
    paperId: consumption.paperId,
    title: groupId,
    source: consumption.paperId,
    groupType: group.groupType === 'grammarFill'
      ? 'grammar_cloze'
      : group.groupType,
    defaultScore: 1,
    passage: { title: groupId, materialText: '', summary: '' },
    questions: group.questions.map((question) => ({
      id: question.questionId,
      questionNo: String(question.questionNo),
      stem: question.stem || '',
      answer: '',
      explanation: '',
      note: '',
      options: (question.options || []).map((option) => ({
        label: option.label,
        content: option.text,
      })),
    })),
  }
}

function assertMixedSourceDraftCanonicalComposition() {
  const mixedDb = new DatabaseSync(
    path.join(ticket35PublicationStore, 'publication.sqlite'),
    { readOnly: true },
  )
  try {
    const runtime = createCanonicalConsumerRuntime({
      rootDir: ticket35PublicationStore,
      db: mixedDb,
    })
    const sourceGroups = [
      ['paper-2023-i', 'group-2023-i-grammar-fill'],
      ['paper-2026-i', 'group-2026-i-grammar-fill'],
    ]
    const details = new Map(sourceGroups.map(([paperId, groupId]) => {
      const consumption = runtime.load({ paperId, consumerId: 'print_pdf' })
      return [groupId, mixedDraftDetail(consumption, groupId)]
    }))
    const publicGrammarConsumption = runtime.load({
      paperId: 'paper-2026-i',
      consumerId: 'print_pdf',
    })
    const publicGrammarDetail = details.get('group-2026-i-grammar-fill')
    const publicGrammarChrome = loadCanonicalGrammarFillPrintChrome({
      exportItems: [{ detail: publicGrammarDetail }],
      canonicalConsumption: publicGrammarConsumption,
      paperAssetsDir: ticket35PublicationStore,
      versionType: 'student',
    })
    for (const supplement of publicGrammarChrome.sourceBinding.questionSupplements) {
      const question = publicGrammarDetail.questions.find(
        (candidate) => candidate.id === supplement.questionId,
      )
      question.answer = supplement.answer
      question.explanation = supplement.explanation || ''
    }
    const mixedExportItems = sourceGroups.map(([, groupId]) => ({
      detail: details.get(groupId),
    }))
    const mixedConsumption = runtime.resolveForItems({
      consumerId: 'print_pdf',
      items: mixedExportItems,
    })
    assert.equal(mixedConsumption.composition.kind, 'draft-paper')
    assert.equal(mixedConsumption.paperId, undefined)
    assert.equal(mixedConsumption.authorityRef, undefined)
    assert.deepEqual(
      mixedConsumption.composition.sources.map((source) => ({
        paperId: source.paperId,
        groupIds: source.groupIds,
      })),
      sourceGroups.map(([paperId, groupId]) => ({
        paperId,
        groupIds: [groupId],
      })),
    )
    for (const source of mixedConsumption.composition.sources) {
      const original = runtime.load({
        paperId: source.paperId,
        consumerId: 'print_pdf',
      })
      assert.equal(source.publicationDigest, original.publicationDigest)
      assert.equal(source.sourceAssetDigest, original.sourceAssetDigest)
      assert.deepEqual(source.authorityRef, original.authorityRef)
    }
    const changedSecondarySource = structuredClone(mixedConsumption)
    changedSecondarySource.composition.sources[0].publicationDigest =
      'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
    assert.notEqual(
      sha256(JSON.stringify(mixedConsumption)),
      sha256(JSON.stringify(changedSecondarySource)),
      'a secondary Publication digest invalidates the Draft pagination signature',
    )
    const store = createDraftPaperStore({
      exportDir: path.join(tmpdir(), 'eqb-mixed-source-draft-export'),
      getQuestionGroupDetail: (groupId) => details.get(groupId) || null,
      groupTypeLabels: { grammar_cloze: '语法填空' },
      isGroupPrintReady: () => ({ ok: true, reason: null }),
      openDatabase: () => {
        throw new Error('mixed-source render fixture does not open the bank DB')
      },
      paperAssetsDir: ticket35PublicationStore,
      resolveCanonicalConsumption: runtime.resolveForItems,
      rootDir,
      selectQuestionGroupCards: () => [],
    })
    const draftPaper = {
      id: 'draft-paper-mixed-source',
      title: 'Mixed source draft',
      items: sourceGroups.map(([, groupId], index) => ({
        id: `item-${index + 1}`,
        groupId,
        sourcePaperId: details.get(groupId).paperId,
        orderIndex: index + 1,
        pageBreakBefore: false,
        groupType: 'grammar_cloze',
        defaultScore: 1,
        questionGroup: { groupType: 'grammar_cloze', defaultScore: 1 },
      })),
    }
    const html = store.buildDraftPrintHtml(draftPaper)
    for (const [, groupId] of sourceGroups) {
      assert.match(
        html,
        new RegExp(`data-canonical-group-id="${groupId}"`),
        `mixed-source Draft Paper renders ${groupId} canonically`,
      )
    }
  } finally {
    mixedDb.close()
  }
}

function assertDocxSourcedGrammarFillPrintChromeSkipsJsonDigest() {
  const docxMediaType =
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  const synthRoot = path.join(tmpdir(), `eqb-docx-gf-synth-${process.pid}`)
  const synthVersionDir = path.join(synthRoot, 'paper-docx-synth', 'versions', 'v1')
  mkdirSync(path.join(synthVersionDir, 'canonical'), { recursive: true })
  const synthBin = Buffer.from('PK-fake-docx-source-asset')
  const synthPaperAsset = {
    content: { blocks: [{ type: 'pageBreakHint', afterGroupId: 'g1' }] },
  }
  writeFileSync(path.join(synthVersionDir, 'canonical', 'source-asset.bin'), synthBin)
  writeFileSync(path.join(synthVersionDir, 'paper-asset.json'), JSON.stringify(synthPaperAsset))
  const synthDigest = sha256(synthBin)
  assert.notEqual(
    digestJson(synthPaperAsset),
    synthDigest,
    'DOCX fixture keeps paper-asset.json distinct from the sealed Publication source',
  )
  assert.equal(
    sha256(readFileSync(path.join(synthVersionDir, 'canonical', 'source-asset.bin'))),
    synthDigest,
    'DOCX fixture binds Publication source to canonical/source-asset.bin',
  )
  try {
    const pageBreakSource = loadPublicationBoundSourceAssetRepresentation({
      versionDir: synthVersionDir,
      publicationSource: {
        mediaType: docxMediaType,
        sha256: synthDigest,
        byteLength: synthBin.byteLength,
      },
      reject: (message) => {
        throw new Error(message)
      },
      label: 'Canonical visible page-break source',
    })
    assert.equal(
      pageBreakSource.kind,
      'source_asset',
      'DOCX page-break binding reads derived paper-asset.json after sealed source verification',
    )
    assert.ok(
      pageBreakSource.asset.content.blocks.some(
        (block) => block.type === 'pageBreakHint',
      ),
      'DOCX page-break binding exposes pageBreakHint blocks from the derived representation',
    )
  } finally {
    rmSync(synthRoot, { recursive: true, force: true })
  }

  const docxPaperId = 'paper-mock-gd-2026-m1'
  const docxAssetsRoot = path.resolve('app/public/paper-assets')
  const versionDir = path.join(
    docxAssetsRoot,
    docxPaperId,
    'versions',
    'v2',
  )
  const liveManifestPath = path.join(
    versionDir,
    'canonical',
    'canonical-paper-publication-v37.json',
  )
  if (!existsSync(liveManifestPath)) return
  const publicationManifest = JSON.parse(readFileSync(liveManifestPath, 'utf8'))
  const paperAssetBytes = readFileSync(path.join(versionDir, 'paper-asset.json'))
  const sourceAssetBytes = readFileSync(
    path.join(versionDir, 'canonical', 'source-asset.bin'),
  )
  assert.notEqual(
    digestJson(JSON.parse(paperAssetBytes.toString('utf8'))),
    publicationManifest.sourceAssetDigest,
    'DOCX fixture keeps paper-asset.json distinct from the sealed Publication source',
  )
  assert.equal(
    sha256(sourceAssetBytes),
    publicationManifest.sourceAssetDigest,
    'DOCX fixture binds Publication source to canonical/source-asset.bin',
  )
  const docxDbPath = path.join(tmpdir(), `eqb-docx-gf-chrome-${process.pid}.sqlite`)
  setCanonicalReference(docxDbPath, {
    paperId: docxPaperId,
    versionName: 'v2',
    sourceAssetVersion: publicationManifest.sourceAssetVersion,
    publicationDigest: publicationManifest.publicationDigest,
  })
  const docxDbLive = new DatabaseSync(docxDbPath)
  try {
    const runtime = createCanonicalConsumerRuntime({
      rootDir: docxAssetsRoot,
      db: docxDbLive,
    })
    const consumption = runtime.load({
      paperId: docxPaperId,
      consumerId: 'print_pdf',
    })
    const readingDetail = mixedDraftDetail(
      consumption,
      'group-mock-gd-2026-m1-reading-c',
    )
    assert.equal(
      loadCanonicalGrammarFillPrintChrome({
        exportItems: [{ detail: readingDetail }],
        canonicalConsumption: consumption,
        paperAssetsDir: docxAssetsRoot,
        versionType: 'student',
      }),
      null,
      'DOCX-sourced Publication skips grammar-fill chrome without JSON digest rejection',
    )
    const publicationSource = immutablePublicationSourceForConsumption(consumption)
    const pageBreakSource = loadPublicationBoundSourceAssetRepresentation({
      versionDir,
      publicationSource,
      reject: (message) => {
        throw new Error(message)
      },
      label: 'Canonical visible page-break source',
    })
    assert.equal(
      pageBreakSource.kind,
      'source_asset',
      'DOCX page-break binding reads derived paper-asset.json after sealed source verification',
    )
    assert.ok(
      pageBreakSource.asset.content.blocks.some(
        (block) => block.type === 'pageBreakHint',
      ),
      'DOCX page-break binding exposes pageBreakHint blocks from the derived representation',
    )
  } finally {
    docxDbLive.close()
    rmSync(docxDbPath, { force: true })
  }
}

const ticket35GroupIds = [
  'group-2026-i-reading-a',
  'group-2026-i-reading-b',
  'group-2026-i-reading-c',
  'group-2026-i-reading-d',
  'group-2026-i-seven-choices',
  'group-2026-i-cloze',
  'group-2026-i-grammar-fill',
  'group-2026-i-writing-application',
  'group-2026-i-writing-continuation',
]
const ownerQaOzoneText = 'ground-level ozone (臭氧)—a major factor'
const ownerQaLegacyOzoneText = 'ground-level ozone (臭氧) 一a major factor'
const ownerQaApplicationTitle = 'Ranking My College Life Essentials'
const ownerQaBlankWidthsPx = Object.freeze({
  q36: 64.390625,
  q41: 46.1875,
  q56: 46.1875,
})

function ticket35V4Source() {
  return ticket35Source('v4')
}

function ticket35V2Source() {
  return ticket35Source('v2')
}

function ticket35Source(versionName) {
  const versionRoot = path.join(
    ticket35PublicationStore,
    fixture.source.paperId,
    'versions',
    versionName,
  )
  const sourceCaptureBytes = readFileSync(path.join(versionRoot, 'paper-asset.json'))
  const sourceCapture = JSON.parse(sourceCaptureBytes)
  const assetObservation = sourceCapture.observations.find(
    (observation) => observation?.value?.role === 'asset-projection',
  )
  const assetDocument = sourceCapture.documents.find(
    (document) => document.documentId === assetObservation?.documentId,
  )
  assert.ok(assetDocument?.encodedBytes, 'Ticket 35 v3 has one sealed asset-projection document')
  const assetBytes = Buffer.from(assetDocument.encodedBytes, 'base64')
  assert.equal(assetBytes.byteLength, assetDocument.byteLength)
  assert.equal(sha256(assetBytes), assetDocument.sha256)
  const paperAsset = JSON.parse(assetBytes)
  assert.equal(paperAsset.schemaVersion, 'paper-asset-v1')
  return { versionRoot, paperAsset }
}

function ticket35V4Reference() {
  const db = new DatabaseSync(path.join(ticket35PublicationStore, 'publication.sqlite'), {
    readOnly: true,
  })
  try {
    const row = db.prepare(`
      SELECT paper_id, version_name, source_asset_version, publication_digest
      FROM canonical_paper_publications
      WHERE paper_id = ? AND is_current = 1
    `).get(fixture.source.paperId)
    assert.ok(row, 'Ticket 35 v4 Publication is current in its immutable fixture store')
    assert.equal(row.version_name, 'v4')
    assert.equal(row.source_asset_version, 4)
    return {
      paperId: row.paper_id,
      versionName: row.version_name,
      sourceAssetVersion: row.source_asset_version,
      publicationDigest: row.publication_digest,
    }
  } finally {
    db.close()
  }
}

function ticket35WritingSourceText(paperAsset) {
  const blocks = paperAsset.content.blocks
  const application = blocks.findIndex(
    (block) => block.type === 'group' && block.groupId === 'group-2026-i-writing-application',
  )
  const notice = blocks[application + 1]?.text
  const continuation = blocks.find(
    (block) => block.type === 'instruction' && String(block.text).startsWith('Paragraph 1:'),
  )?.text
  assert.equal(typeof notice, 'string', 'Ticket 35 source owns the Application Writing notice')
  const starters = String(continuation || '')
    .split(/\n\s*\n/)
    .map((line) => line.replace(/^Paragraph \d+:\s*/, '').trim())
    .filter(Boolean)
  assert.deepEqual(starters.length, 2, 'Ticket 35 source owns two Continuation starters')
  return { notice, starters }
}

// Both list rendering and the public draft-add route must reject an immutable
// Paper Asset whose internal paper identity conflicts with the directory that
// contains it.  Use an otherwise DB-ready Cloze group: a zero-question Writing
// group would hide a batch fallback behind its ordinary readiness failure.
async function assertTicket35BatchAssetIdentity({
  rootDir,
  paperAsset,
  canonicalReference,
}) {
  const mismatchedAssetsRoot = path.join(rootDir, 'ticket-35-batch-paper-id-mismatch')
  const directoryPaperId = paperAsset.paper.paperId
  const groupId = 'group-2026-i-cloze'
  const mismatchedAsset = structuredClone(paperAsset)
  mismatchedAsset.paper.paperId = 'paper-2026-i-conflicting-asset'
  const assetPath = path.join(
    mismatchedAssetsRoot,
    directoryPaperId,
    'paper-asset.json',
  )
  mkdirSync(path.dirname(assetPath), { recursive: true })
  const mismatchedAssetBytes = `${stableStringify(mismatchedAsset)}\n`
  writeFileSync(assetPath, mismatchedAssetBytes)

  const previousPaperAssetsRoot = process.env.QUESTION_BANK_PAPER_ASSET_ROOT
  process.env.QUESTION_BANK_PAPER_ASSET_ROOT = mismatchedAssetsRoot
  try {
    const { getPrintReadyByGroupId, isGroupPrintReady } = await import('../server/api.mjs')
    const bankDbPath = path.join(rootDir, 'ticket-35-batch-question-bank.sqlite')
    seedConfirmedCanonicalDraftFixture({
      repositoryRoot: path.resolve('.'),
      bankDbPath,
      groupIds: [groupId],
      copyPaperAssets: false,
    })
    const bankDb = new DatabaseSync(bankDbPath, {
      readOnly: true,
    })
    try {
      const single = isGroupPrintReady(bankDb, groupId)
      const batch = getPrintReadyByGroupId(bankDb, [groupId]).get(groupId)
      assert.deepEqual(
        single,
        { ok: false, reason: '试卷资产身份不一致' },
        'a directory/asset identity conflict makes the DB-ready single Cloze group fail closed',
      )
      assert.deepEqual(
        batch,
        single,
        'the batch path reports the same explicit identity conflict instead of falling back to DB readiness',
      )
      assert.equal(
        readFileSync(assetPath, 'utf8'),
        mismatchedAssetBytes,
        'batch identity rejection mutates no mismatched source asset',
      )
    } finally {
      bankDb.close()
    }

    await withActualDraftApi({
      fixtureRoot: path.join(rootDir, 'ticket-35-batch-paper-id-http'),
      paperAssetsRoot: mismatchedAssetsRoot,
      canonicalReference,
      groupIds: [],
    }, async ({ baseUrl, userDbPath, draftPaperId }) => {
      const before = new DatabaseSync(userDbPath, { readOnly: true })
      const beforeItems = before.prepare(
        'SELECT group_id FROM draft_paper_items WHERE draft_paper_id = ? ORDER BY order_index ASC',
      ).all(draftPaperId)
      before.close()

      const detailResponse = await fetchPublic(
        `${baseUrl}/api/question-groups/${groupId}`,
      )
      const detail = await readHttpResponse(detailResponse)
      assert.equal(
        detailResponse.status,
        404,
        'public question-group detail fails closed instead of projecting a conflicting Cloze asset',
      )
      assert.equal(
        detail.json?.error,
        'Question group not found',
        'conflicting Cloze detail exposes no partial canonical projection',
      )

      const addResponse = await fetchPublic(
        `${baseUrl}/api/draft-papers/current/items`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ groupId }),
        },
      )
      const add = await readHttpResponse(addResponse)
      assert.equal(addResponse.ok, false, 'public draft add rejects a conflicting DB-ready Cloze asset')
      assert.equal(add.json?.error, '试卷资产身份不一致', 'public draft add exposes the carried identity conflict')

      const after = new DatabaseSync(userDbPath, { readOnly: true })
      const afterItems = after.prepare(
        'SELECT group_id FROM draft_paper_items WHERE draft_paper_id = ? ORDER BY order_index ASC',
      ).all(draftPaperId)
      after.close()
      assert.deepEqual(afterItems, beforeItems, 'identity conflict rejects before the draft write')

      const htmlResponse = await fetchPublic(
        `${baseUrl}/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
      )
      const html = await htmlResponse.text()
      assert.equal(htmlResponse.ok, false, 'identity conflict leaves no public Print HTML output')
      assert.equal(JSON.parse(html).error, '请先添加题组', 'rejected identity conflict leaves the draft empty before Print HTML')
      const pdfResponse = await fetchPublic(
        `${baseUrl}/api/draft-papers/${draftPaperId}/print-pdf`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ versionType: 'student' }),
        },
      )
      const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer())
      assert.notEqual(pdfBytes.subarray(0, 4).toString(), '%PDF', 'identity conflict leaves no PDF export output')
      assert.equal(
        readFileSync(assetPath, 'utf8'),
        mismatchedAssetBytes,
        'public identity rejection preserves source asset bytes',
      )
    })
  } finally {
    if (previousPaperAssetsRoot === undefined) delete process.env.QUESTION_BANK_PAPER_ASSET_ROOT
    else process.env.QUESTION_BANK_PAPER_ASSET_ROOT = previousPaperAssetsRoot
    rmSync(mismatchedAssetsRoot, { recursive: true, force: true })
  }
}

async function assertTicket35Screen(page, paperAsset, outputDir) {
  const { notice, starters } = ticket35WritingSourceText(paperAsset)
  const observation = await page.evaluate(({
    noticeText,
    starterLines,
    ozoneText,
    legacyOzoneText,
    applicationTitle,
  }) => {
    const application = document.querySelector('[data-paper-browse-anchor="group-2026-i-writing-application"]')
    const continuation = document.querySelector('[data-paper-browse-anchor="group-2026-i-writing-continuation"]')
    const grammarBlank = document.querySelector('[data-canonical-group-type="grammarFill"] .ps-paper-blank')
    const clozeOptions = document.querySelector('[data-canonical-group-type="cloze"] .ps-question-options-inline--four_columns')
    const clozeRow = clozeOptions?.closest('.ps-question-stem-button')
    const clozeNumber = clozeRow?.querySelector('.ps-question-no')
    const clozeFirstLabel = clozeRow?.querySelector('[data-canonical-cloze-rhythm-role="choice_label"]')
    const clozePassage = document.querySelector('[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="passage_body_line"]')
    const part = [...document.querySelectorAll('h1, h2, h3')].find((node) => node.textContent?.includes('第四部分'))
    const peer = [...document.querySelectorAll('h1, h2, h3')].find((node) => node.textContent?.includes('第三部分'))
    const font = (node) => node ? (() => {
      const style = getComputedStyle(node)
      return [style.fontFamily, style.fontSize, style.fontWeight, style.fontVariantNumeric]
    })() : null
    const normalize = (value) => value.replace(/\s+/g, ' ').trim()
    const prompt = application?.querySelector('.pi-writing-passage')
    const response = application?.querySelector('[data-canonical-answer-region-ref]')
    const continuationResponse = continuation?.querySelector('[data-canonical-answer-region-ref]')
    const starterOccurrences = starterLines.map((starter) => {
      const matches = [...(continuation?.querySelectorAll('p') || [])]
        .filter((node) => normalize(node.textContent || '').includes(normalize(starter)))
      const inside = matches.filter((node) => continuationResponse?.contains(node)).length
      return { total: matches.length, inside, outside: matches.length - inside }
    })
    return {
      applicationNoticeBeforeResponse: Boolean(
        application && prompt && response
        && normalize(application.innerText).includes(normalize(noticeText))
        && prompt.getBoundingClientRect().bottom <= response.getBoundingClientRect().top,
      ),
      startersInResponse: starterLines.every((starter) => Boolean(
        [...document.querySelectorAll('[data-canonical-starter-id]')]
          .find((node) => node.textContent?.trim() === starter)
          ?.closest('[data-canonical-answer-region-ref]'),
      )),
      starterOccurrences,
      figureCaptions: [...document.querySelectorAll('figcaption')].map((node) => node.textContent?.trim()),
      publicProvenanceAttributes: [...document.querySelectorAll(
        '[data-canonical-media-sha256], [data-canonical-source-artifact-id]',
      )].map((node) => node.getAttributeNames().filter((name) => name.startsWith('data-canonical-'))),
      grammarRhythm: grammarBlank?.getAttribute('data-canonical-grammar-fill-rhythm') || null,
      grammarRuleWidth: grammarBlank
        ? getComputedStyle(grammarBlank).getPropertyValue('--ps-paper-blank-rule-width').trim()
        : null,
      grammarRuleAlignItems: grammarBlank
        ? getComputedStyle(grammarBlank).getPropertyValue('--ps-paper-blank-rule-align-items').trim()
        : null,
      grammarBorder: grammarBlank ? getComputedStyle(grammarBlank).borderBottomWidth : null,
      grammarAlignItems: grammarBlank ? getComputedStyle(grammarBlank).alignItems : null,
      grammarPseudo: grammarBlank ? getComputedStyle(grammarBlank, '::after').content : null,
      clozeNumberOffset: clozeRow && clozeNumber
        ? clozeNumber.getBoundingClientRect().left - clozeRow.getBoundingClientRect().left
        : Number.NaN,
      clozeNumberToFirstLabelGap: clozeNumber && clozeFirstLabel
        ? clozeFirstLabel.getBoundingClientRect().left - clozeNumber.getBoundingClientRect().right
        : Number.NaN,
      clozeNumberToPassageContinuationOffset: clozeNumber && clozePassage
        ? clozeNumber.getBoundingClientRect().left - clozePassage.getBoundingClientRect().left
        : Number.NaN,
      writingHeading: font(part),
      peerHeading: font(peer),
      applicationPresent: Boolean(application),
      continuationPresent: Boolean(continuation),
      ownerQaContent: {
        hasOzoneEmDash: document.body.innerText.includes(ozoneText),
        hasLegacyOzoneText: document.body.innerText.includes(legacyOzoneText),
        applicationTitleOccurrences: application
          ? application.innerText.split(applicationTitle).length - 1
          : 0,
        applicationTitleInsideResponse: response
          ? response.innerText.split(applicationTitle).length - 1
          : 0,
        screenQ36BlankBottomRelation: document.querySelector(
          '[data-canonical-group-type="sevenChoices"] .ps-paper-blank[data-canonical-question-id="q-2026-i-036"]',
        )
          ? {
              alignItems: getComputedStyle(document.querySelector(
                '[data-canonical-group-type="sevenChoices"] .ps-paper-blank[data-canonical-question-id="q-2026-i-036"]',
              )).alignItems,
              borderBottomWidth: getComputedStyle(document.querySelector(
                '[data-canonical-group-type="sevenChoices"] .ps-paper-blank[data-canonical-question-id="q-2026-i-036"]',
              )).borderBottomWidth,
            }
          : null,
      },
    }
  }, {
    noticeText: notice,
    starterLines: starters,
    ozoneText: ownerQaOzoneText,
    legacyOzoneText: ownerQaLegacyOzoneText,
    applicationTitle: ownerQaApplicationTitle,
  })
  assert.equal(observation.applicationPresent, true, 'v3 Screen contains Application Writing')
  assert.equal(observation.continuationPresent, true, 'v3 Screen contains Continuation Writing')
  assert.equal(observation.applicationNoticeBeforeResponse, true, `v3 Screen keeps the exact Application notice before the response box: ${JSON.stringify(observation)}`)
  assert.equal(observation.startersInResponse, true, `v3 Screen puts both Continuation starters inside the response box: ${JSON.stringify(observation)}`)
  assert.deepEqual(
    observation.starterOccurrences,
    starters.map(() => ({ total: 1, inside: 1, outside: 0 })),
    `v3 Screen renders each Continuation starter exactly once inside its response box: ${JSON.stringify(observation)}`,
  )
  assert.deepEqual(observation.figureCaptions, [], 'v3 Screen hides internal figure provenance captions')
  assert.deepEqual(observation.publicProvenanceAttributes, [], 'v3 Screen emits no public provenance attributes')
  assert.equal(observation.grammarRhythm, 'grammar-fill-rhythm-v7', 'v3 Screen derives Grammar Fill from the digest-bound v44/v7 authority')
  assert.equal(observation.grammarRuleWidth, '1px', 'v3 Screen receives the v7 rule thickness through its rendered blank')
  assert.equal(observation.grammarRuleAlignItems, 'flex-end', 'v3 Screen receives the v7 blank-bottom relation through its rendered blank')
  assert.equal(observation.grammarBorder, '1px', 'v3 Screen uses the shared inline blank rule for Grammar Fill')
  assert.equal(observation.grammarAlignItems, 'flex-end', 'v3 Screen consumes the authority-derived blank-bottom alignment in CSS')
  assert.equal(observation.grammarPseudo, 'none', 'v3 Screen has no independent Grammar Fill rule lift')
  assert.equal(Math.abs(observation.clozeNumberOffset) <= 0.5, true, 'v3 Screen starts Cloze question labels at the passage boundary')
  assert.equal(Math.abs(observation.clozeNumberToPassageContinuationOffset) <= 0.5, true, 'v3 Screen aligns the Cloze qnum box with the passage continuation boundary')
  assert.equal(Math.abs(observation.clozeNumberToFirstLabelGap) <= 0.5, true, 'v3 Screen has no added qnum-box→A layout gap')
  assert.deepEqual(observation.writingHeading, observation.peerHeading, 'v3 Screen gives every part score run one typographic treatment')
  if (outputDir) {
    writeFileSync(path.join(outputDir, 'screen.html'), await page.content())
    await page.screenshot({ path: path.join(outputDir, 'screen.png'), fullPage: true })
  }
  return observation
}

async function assertTicket35V43Screen(page) {
  const observation = await page.locator(
    '[data-canonical-group-type="grammarFill"] .ps-paper-blank',
  ).first().evaluate((blank) => ({
    rhythm: blank.getAttribute('data-canonical-grammar-fill-rhythm'),
    ruleWidth: getComputedStyle(blank).getPropertyValue('--ps-paper-blank-rule-width').trim(),
    ruleAlignItems: getComputedStyle(blank).getPropertyValue('--ps-paper-blank-rule-align-items').trim(),
    border: getComputedStyle(blank).borderBottomWidth,
    alignItems: getComputedStyle(blank).alignItems,
  }))
  assert.deepEqual(
    observation,
    {
      rhythm: null,
      ruleWidth: '',
      ruleAlignItems: '',
      border: '1px',
      alignItems: 'flex-end',
    },
    'v43 Screen retains its historical static Grammar Fill ruling instead of receiving the v44/v7 successor projection',
  )
}

async function assertTicket35CompletePublication({ rootDir }) {
  const { paperAsset } = ticket35V4Source()
  const { paperAsset: v43PaperAsset } = ticket35V2Source()
  const canonicalReference = ticket35V4Reference()
  const grammarFillAuthority = grammarFillRhythmForPaperAuthority({
    paperId: canonicalReference.paperId,
    manifestVersion: 45,
  })
  assert.equal(grammarFillAuthority.version, '7', 'Ticket 35 selects the bound Grammar Fill v7 authority')
  assert.equal(
    grammarFillAuthority.ruleVerticalGeometry.verticalAlignment,
    'blank-bottom',
    'Ticket 35 Grammar Fill v7 retires the independent upward lift into the shared bottom rule relation',
  )
  assert.equal(
    Object.hasOwn(grammarFillAuthority.ruleVerticalGeometry, 'rendererMapping'),
    false,
    'Ticket 35 Grammar Fill v7 has no independent Screen/Print rule lift',
  )
  assert.throws(
    () => grammarFillBlankRulingForRhythm(grammarFillRhythmForPaperAuthority({
      paperId: canonicalReference.paperId,
      manifestVersion: 43,
    })),
    /bound bottom-rule authority/,
    'the contradictory v6 lift cannot fall through to an unversioned shared blank ruling',
  )
  const v4Root = path.join(rootDir, 'ticket-35-v4-publication')
  cpSync(
    path.join(ticket35PublicationStore, fixture.source.paperId),
    path.join(v4Root, fixture.source.paperId),
    { recursive: true },
  )
  const outputDir = provisionActualArtifacts
    ? path.resolve('.scratch', 'ticket-35-owner-qa', execFileSync(
        'git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' },
      ).trim())
    : null
  if (outputDir) mkdirSync(outputDir, { recursive: true })

  const v43Root = path.join(rootDir, 'ticket-35-v43-publication')
  cpSync(ticket35PublicationStore, v43Root, { recursive: true })
  const v43Publication = JSON.parse(readFileSync(path.join(
    v43Root,
    fixture.source.paperId,
    'versions',
    'v2',
    'canonical',
    'canonical-paper-publication-v43.json',
  ), 'utf8'))
  writeFileSync(path.join(
    v43Root,
    fixture.source.paperId,
    'latest',
    'canonical-paper-publication-ref-v1.json',
  ), `${stableStringify({
    paperId: fixture.source.paperId,
    publicationDigest: v43Publication.publicationDigest,
    sourceAssetVersion: 2,
    versionName: 'v2',
  })}\n`)
  const v43Db = new DatabaseSync(path.join(v43Root, 'publication.sqlite'))
  try {
    v43Db.prepare(
      'UPDATE canonical_paper_publications SET is_current = 0 WHERE paper_id = ?',
    ).run(fixture.source.paperId)
    v43Db.prepare(
      'UPDATE canonical_paper_publications SET is_current = 1 WHERE paper_id = ? AND version_name = ?',
    ).run(fixture.source.paperId, 'v2')
  } finally {
    v43Db.close()
  }

  let screenObservation
  const fixtureDb = new DatabaseSync(path.join(ticket35PublicationStore, 'publication.sqlite'), {
    readOnly: true,
  })
  try {
    let publicationScanAttempted = false
    const unboundRuntime = createCanonicalConsumerRuntime({
      rootDir: ticket35PublicationStore,
      db: new Proxy(fixtureDb, {
        get(target, property, receiver) {
          if (property !== 'prepare') return Reflect.get(target, property, receiver)
          return (sql) => {
            if (/SELECT\s+paper_id\s+FROM\s+canonical_paper_publications/i.test(String(sql))) {
              publicationScanAttempted = true
            }
            return target.prepare(sql)
          }
        },
      }),
    })
    const unboundItems = ticket35GroupIds.map((groupId) => exportItem(groupId))
    for (const item of unboundItems) delete item.detail.paperId
    const unboundItemsBefore = stableStringify(unboundItems)
    assert.throws(
      () => unboundRuntime.resolveForItems({ consumerId: 'print_pdf', items: unboundItems }),
      { code: 'CANONICAL_CONSUMPTION_REJECTED' },
      'unbound public draft items fail closed instead of inferring a current Publication by group ID',
    )
    assert.equal(publicationScanAttempted, false, 'an unbound draft cannot scan another current Publication for identity')
    assert.equal(stableStringify(unboundItems), unboundItemsBefore, 'unbound identity rejection mutates no draft input')
    const runtime = createCanonicalConsumerRuntime({
      rootDir: ticket35PublicationStore,
      db: fixtureDb,
    })
    const v43RuntimeDb = new DatabaseSync(path.join(v43Root, 'publication.sqlite'), {
      readOnly: true,
    })
    try {
      const v43Consumption = createCanonicalConsumerRuntime({
        rootDir: v43Root,
        db: v43RuntimeDb,
      }).load({ paperId: fixture.source.paperId, consumerId: 'screen' })
      assert.equal(v43Consumption.disposition, 'ready')
      assert.equal(v43Consumption.sourceAssetVersion, 2)
      assert.equal(v43Consumption.authorityRef?.manifestVersion, '43')
      const v43GrammarFillSurface = buildCanonicalConsumptionSurfaceData({
        consumption: v43Consumption,
        familyContractId: 'grammar-fill',
        groupId: 'group-2026-i-grammar-fill',
      })
      assert.equal(
        Object.hasOwn(v43GrammarFillSurface.surfaceData, 'grammarFillScreenRuling'),
        false,
        'v43 carries no v44/v7 Screen ruling projection',
      )
      await assertActualPaperBrowseBoundary({
        readyConsumption: v43Consumption,
        browserAssetSource: v43PaperAsset,
        legacyConsumption: null,
        invalidConsumption: null,
        outputDir: null,
        verifyRejection: false,
        onReady: assertTicket35V43Screen,
      })
    } finally {
      v43RuntimeDb.close()
    }
    const screenConsumption = runtime.load({ paperId: fixture.source.paperId, consumerId: 'screen' })
    assert.equal(screenConsumption.disposition, 'ready')
    assert.equal(screenConsumption.sourceAssetVersion, 4)
    assert.equal(screenConsumption.authorityRef?.manifestVersion, '45')
    const grammarFillScreenSurface = buildCanonicalConsumptionSurfaceData({
      consumption: screenConsumption,
      familyContractId: 'grammar-fill',
      groupId: 'group-2026-i-grammar-fill',
    })
    assert.equal(
      grammarFillScreenSurface.surfaceData.grammarFillScreenRuling?.rhythmSchemaVersion,
      'grammar-fill-rhythm-v7',
      'the v44 Screen surface derives its rule from the exact bound v7 authority before PaperSurface receives it',
    )
    await assertActualPaperBrowseBoundary({
      readyConsumption: screenConsumption,
      browserAssetSource: paperAsset,
      legacyConsumption: null,
      invalidConsumption: null,
      outputDir: null,
      verifyRejection: false,
      onReady: async (page) => {
        screenObservation = await assertTicket35Screen(page, paperAsset, outputDir)
      },
    })
  } finally {
    fixtureDb.close()
  }

  await assertTicket35BatchAssetIdentity({ rootDir, paperAsset, canonicalReference })

  await withActualDraftApi({
    fixtureRoot: path.join(rootDir, 'ticket-35-v4-http'),
    paperAssetsRoot: v4Root,
    canonicalReference,
    groupIds: ticket35GroupIds,
  }, async ({ baseUrl, draftPaperId }) => {
    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
    try {
      const page = await browser.newPage()
      const { notice, starters } = ticket35WritingSourceText(paperAsset)
      const ownerQaPrintObservations = []
      for (const versionType of ['student', 'teacher']) {
        const htmlResponse = await fetchPublic(
          `${baseUrl}/api/draft-papers/${draftPaperId}/print-html?versionType=${versionType}`,
        )
        const html = await htmlResponse.text()
        assert.equal(htmlResponse.status, 200, `v3 complete ${versionType} public Print HTML succeeds: ${html}`)
        await page.setContent(html, { waitUntil: 'load' })
        const observation = await page.evaluate(({
          noticeText,
          starterLines,
          ozoneText,
          legacyOzoneText,
          applicationTitle,
        }) => {
          const application = document.querySelector('[data-canonical-group-id="group-2026-i-writing-application"]')
          const continuation = document.querySelector('[data-canonical-group-id="group-2026-i-writing-continuation"]')
          const grammarBlank = document.querySelector('[data-canonical-group-type="grammarFill"] .print-blank')
          const clozeRow = document.querySelector('[data-canonical-group-type="cloze"] .options-inline--numbered')
          const clozeNumber = clozeRow?.querySelector('.qnum')
          const clozeFirstLabel = clozeRow?.querySelector('[data-canonical-cloze-rhythm-role="choice_label"]')
          const clozePassage = document.querySelector('[data-canonical-group-type="cloze"] [data-canonical-cloze-rhythm-role="passage_body_line"]')
          const headingNodes = [...document.querySelectorAll(
            '.section-header, [data-canonical-writing-chrome-role="part_heading"]',
          )]
          const part = headingNodes.find((node) => node.textContent?.includes('第四部分'))
          const peer = headingNodes.find((node) => node.textContent?.includes('第三部分'))
          const font = (node) => node ? (() => {
            const style = getComputedStyle(node)
            return [style.fontFamily, style.fontSize, style.fontWeight, style.fontVariantNumeric]
          })() : null
          const normalize = (value) => value.replace(/\s+/g, ' ').trim()
          const response = application?.querySelector('[data-canonical-answer-region-ref]')
          const continuationResponse = continuation?.querySelector('[data-canonical-answer-region-ref]')
          const starterOccurrences = starterLines.map((starter) => {
            const matches = [...(continuation?.querySelectorAll('p') || [])]
              .filter((node) => normalize(node.textContent || '').includes(normalize(starter)))
            const inside = matches.filter((node) => continuationResponse?.contains(node)).length
            return { total: matches.length, inside, outside: matches.length - inside }
          })
          const blankGeometry = Object.fromEntries([
            ['q36', 'q-2026-i-036'],
            ['q41', 'q-2026-i-041'],
            ['q56', 'q-2026-i-056'],
          ].map(([key, questionId]) => {
            const blank = document.querySelector(`[data-canonical-question-id="${questionId}"] .print-blank`)
            const number = blank?.querySelector('.print-blank-num')
            const blankStyle = blank ? getComputedStyle(blank) : null
            const numberStyle = number ? getComputedStyle(number) : null
            const blankRect = blank?.getBoundingClientRect()
            const numberRect = number?.getBoundingClientRect()
            const fontSize = Number.parseFloat(numberStyle?.fontSize || '')
            return [key, {
              blankWidthPx: blankRect?.width ?? Number.NaN,
              blankLineHeightRatio: Number.parseFloat(blankStyle?.lineHeight || '') / fontSize,
              numberLineHeightRatio: Number.parseFloat(numberStyle?.lineHeight || '') / fontSize,
              numberBoxBottomGapPx: blankRect && numberRect
                ? blankRect.bottom - numberRect.bottom
                : Number.NaN,
            }]
          }))
          return {
            groupIds: [...document.querySelectorAll('[data-canonical-group-id]')].map((node) => node.getAttribute('data-canonical-group-id')),
            partHeadings: headingNodes.map((node) => node.textContent?.trim()),
            applicationNoticeBeforeResponse: Boolean(
              application && response
              && normalize(application.innerText).includes(normalize(noticeText))
              && application.querySelector('.canonical-application-prompt, .canonical-legacy-opaque-source')?.getBoundingClientRect().bottom
                <= response.getBoundingClientRect().top,
            ),
            startersInResponse: starterLines.every((starter) => Boolean(
              [...document.querySelectorAll('[data-canonical-starter-id]')]
                .find((node) => node.textContent?.trim() === starter)
                ?.closest('[data-canonical-answer-region-ref]'),
            )),
            starterOccurrences,
            figureCaptions: [...document.querySelectorAll('figcaption')].map((node) => node.textContent?.trim()),
            publicProvenanceAttributes: [...document.querySelectorAll(
              '[data-canonical-media-sha256], [data-canonical-source-artifact-id]',
            )].map((node) => node.getAttributeNames().filter((name) => name.startsWith('data-canonical-'))),
            grammarRule: grammarBlank ? getComputedStyle(grammarBlank).backgroundImage : '',
            grammarPseudo: grammarBlank ? getComputedStyle(grammarBlank, '::after').content : null,
            clozeNumberOffset: clozeRow && clozeNumber ? clozeNumber.getBoundingClientRect().left - clozeRow.getBoundingClientRect().left : Number.NaN,
            clozeNumberToFirstLabelGap: clozeNumber && clozeFirstLabel
              ? clozeFirstLabel.getBoundingClientRect().left - clozeNumber.getBoundingClientRect().right
              : Number.NaN,
            clozeNumberToPassageContinuationOffset: clozeNumber && clozePassage
              ? clozeNumber.getBoundingClientRect().left - clozePassage.getBoundingClientRect().left
              : Number.NaN,
            writingHeading: font(part),
            peerHeading: font(peer),
            ownerQaContent: {
              hasOzoneEmDash: document.body.innerText.includes(ozoneText),
              hasLegacyOzoneText: document.body.innerText.includes(legacyOzoneText),
              applicationTitleOccurrences: application
                ? application.innerText.split(applicationTitle).length - 1
                : 0,
              applicationTitleInsideResponse: response
                ? response.innerText.split(applicationTitle).length - 1
                : 0,
              blankGeometry,
            },
          }
        }, {
          noticeText: notice,
          starterLines: starters,
          ozoneText: ownerQaOzoneText,
          legacyOzoneText: ownerQaLegacyOzoneText,
          applicationTitle: ownerQaApplicationTitle,
        })
        assert.deepEqual(observation.groupIds.filter(Boolean), ticket35GroupIds, `v3 complete ${versionType} document retains all canonical groups in source order`)
        assert.equal(observation.partHeadings.some((text) => text?.includes('第二部分')), true, `v3 complete ${versionType} document retains Reading chrome`)
        assert.equal(observation.partHeadings.some((text) => text?.includes('第三部分')), true, `v3 complete ${versionType} document retains Language chrome`)
        assert.equal(observation.partHeadings.some((text) => text?.includes('第四部分')), true, `v3 complete ${versionType} document retains Writing chrome: ${JSON.stringify(observation)}`)
        assert.equal(observation.applicationNoticeBeforeResponse, true, `v3 complete ${versionType} Print keeps the exact Application notice before its response box`)
        assert.equal(observation.startersInResponse, true, `v3 complete ${versionType} Print puts both Continuation starters inside the response box`)
        assert.deepEqual(
          observation.starterOccurrences,
          starters.map(() => ({ total: 1, inside: 1, outside: 0 })),
          `v3 complete ${versionType} Print renders each Continuation starter exactly once inside its response box: ${JSON.stringify(observation)}`,
        )
        assert.deepEqual(observation.figureCaptions, [], `v3 complete ${versionType} Print hides internal figure provenance captions`)
        assert.deepEqual(observation.publicProvenanceAttributes, [], `v3 complete ${versionType} Print emits no public provenance attributes`)
        assert.equal(observation.grammarRule.includes('linear-gradient'), true, `v3 complete ${versionType} Print uses the shared inline blank rule for Grammar Fill`)
        assert.equal(observation.grammarPseudo, 'none', `v3 complete ${versionType} Print has no independent Grammar Fill rule lift`)
        assert.equal(Math.abs(observation.clozeNumberOffset) <= 0.5, true, `v3 complete ${versionType} Print starts Cloze question labels at the passage boundary`)
        assert.equal(Math.abs(observation.clozeNumberToPassageContinuationOffset) <= 0.5, true, `v3 complete ${versionType} Print aligns the Cloze qnum box with the passage continuation boundary`)
        assert.equal(Math.abs(observation.clozeNumberToFirstLabelGap) <= 0.5, true, `v3 complete ${versionType} Print has no added qnum-box→A layout gap`)
        assert.deepEqual(observation.writingHeading, observation.peerHeading, `v3 complete ${versionType} Print gives every part score run one typographic treatment`)
        ownerQaPrintObservations.push({
          versionType,
          ...observation.ownerQaContent,
        })
        const pdfResponse = await fetchPublic(
          `${baseUrl}/api/draft-papers/${draftPaperId}/print-pdf`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ versionType }),
          },
        )
        const pdfBytes = Buffer.from(await pdfResponse.arrayBuffer())
        assert.equal(pdfResponse.status, 200, `v3 complete ${versionType} public Print PDF succeeds: ${pdfBytes.toString('utf8')}`)
        assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
        readPdfColumnStarts(
          pdfBytes,
          outputDir || rootDir,
          `v3 complete ${versionType} public Print PDF`,
        )
        if (outputDir) {
          writeFileSync(path.join(outputDir, `print-${versionType}.html`), html)
          writeFileSync(path.join(outputDir, `print-${versionType}.pdf`), pdfBytes)
        }
      }
      const compactBlankGeometry = (geometry) => Object.entries(geometry).every(([key, value]) => (
        Math.abs(value.blankWidthPx - ownerQaBlankWidthsPx[key]) <= 0.02
        && Math.abs(value.blankLineHeightRatio - 1.05) <= 0.02
        && Math.abs(value.numberLineHeightRatio - 1.05) <= 0.02
        && Math.abs(value.numberBoxBottomGapPx) <= 0.02
      ))
      const sharedPrintLineHeight = (geometry) => {
        const ratios = Object.values(geometry).map((value) => value.numberLineHeightRatio)
        return Math.max(...ratios) - Math.min(...ratios) <= 0.001
      }
      assert.deepEqual(
        {
          screen: {
            hasOzoneEmDash: screenObservation.ownerQaContent.hasOzoneEmDash,
            hasLegacyOzoneText: screenObservation.ownerQaContent.hasLegacyOzoneText,
            applicationTitleOccurrences: screenObservation.ownerQaContent.applicationTitleOccurrences,
            applicationTitleInsideResponse: screenObservation.ownerQaContent.applicationTitleInsideResponse,
            q36BottomRule: screenObservation.ownerQaContent.screenQ36BlankBottomRelation,
          },
          print: ownerQaPrintObservations.map((entry) => ({
            versionType: entry.versionType,
            hasOzoneEmDash: entry.hasOzoneEmDash,
            hasLegacyOzoneText: entry.hasLegacyOzoneText,
            applicationTitleOccurrences: entry.applicationTitleOccurrences,
            applicationTitleInsideResponse: entry.applicationTitleInsideResponse,
            compactBlankGeometry: compactBlankGeometry(entry.blankGeometry),
            sharedPrintLineHeight: sharedPrintLineHeight(entry.blankGeometry),
          })),
        },
        {
          screen: {
            hasOzoneEmDash: true,
            hasLegacyOzoneText: false,
            applicationTitleOccurrences: 1,
            applicationTitleInsideResponse: 1,
            q36BottomRule: { alignItems: 'flex-end', borderBottomWidth: '1px' },
          },
          print: ['student', 'teacher'].map((versionType) => ({
            versionType,
            hasOzoneEmDash: true,
            hasLegacyOzoneText: false,
            applicationTitleOccurrences: 1,
            applicationTitleInsideResponse: 1,
            compactBlankGeometry: true,
            sharedPrintLineHeight: true,
          })),
        },
        'Ticket 35 Owner QA content and shared Print blank geometry are source-true on every public surface',
      )
    } finally {
      await browser.close()
    }
  })
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
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  const publishedGrammarFillAnalysisDir = path.join(
    rootDir,
    fixture.source.paperId,
    'latest',
    'analyses',
  )
  mkdirSync(publishedGrammarFillAnalysisDir, { recursive: true })
  writeFileSync(
    path.join(
      publishedGrammarFillAnalysisDir,
      'grammar-fill-analysis-v1.json',
    ),
    grammarFillAnalysisBytes,
  )
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
    paperAssetsDir: rootDir,
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
      const studentGrammarFillChrome =
        loadCanonicalGrammarFillPrintChrome({
          exportItems: items,
          canonicalConsumption: consumption,
          paperAssetsDir: rootDir,
          versionType: 'student',
        })
      const teacherGrammarFillChrome =
        loadCanonicalGrammarFillPrintChrome({
          exportItems: items,
          canonicalConsumption: consumption,
          paperAssetsDir: rootDir,
          versionType: 'teacher',
        })
      const student = buildPrintHtml({
        title: asset.paper.title,
        versionType: 'student',
        printStyle: 'exam',
        items,
        blocks,
        questionNumberStart: 41,
        canonicalConsumption: consumption,
        grammarFillChrome: studentGrammarFillChrome,
      })
      const teacher = buildPrintHtml({
        title: asset.paper.title,
        versionType: 'teacher',
        printStyle: 'exam',
        items,
        blocks,
        questionNumberStart: 41,
        canonicalConsumption: consumption,
        grammarFillChrome: teacherGrammarFillChrome,
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
        (
          student.match(
            /grid-template-columns:110\.5pt 104\.1pt 104\.65pt 101\.65pt/g,
          ) || []
        ).length,
        15,
      )
      assert.equal(
        (
          student.match(
            /data-canonical-column-starts-pt="17\.3,127\.8,231\.9,336\.55"/g,
          ) || []
        ).length,
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
  assert.throws(
    () => projectCanonicalConsumerGroup({
      consumption: oneColumnConsumption,
      familyContractId: 'cloze',
      groupId: 'group-2026-i-cloze',
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'post-loader Cloze text mutation cannot manufacture a valid long-option variant',
  )
  assert.throws(
    () => buildPrintHtml({
      title: asset.paper.title,
      versionType: 'student',
      printStyle: 'exam',
      items: [items[0]],
      blocks: [blocks[0]],
      questionNumberStart: 41,
      canonicalConsumption: oneColumnConsumption,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'Print rejects the poisoned Cloze occurrence before rendering',
  )
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
  const fakePreV18Consumption = structuredClone(complete)
  fakePreV18Consumption.authorityRef = {
    manifestId: manifestV17.manifestId,
    manifestVersion: manifestV17.version,
    manifestDigest: digestJson(manifestV17),
  }
  const fakePreV18Selection = fakePreV18Consumption.selections.find(
    (selection) => selection.familyContractId === 'cloze',
  )
  delete fakePreV18Selection.projectedOccurrenceDigests
  fakePreV18Selection.projectedOccurrences[0]
    .choices.sets[0].options[0].content[0].text =
      'POISONED FAKE PRE-V18 CLOZE OPTION'
  const fakePreV18Before = stableStringify(fakePreV18Consumption)
  assert.throws(
    () => projectCanonicalConsumerGroup({
      consumption: fakePreV18Consumption,
      familyContractId: 'cloze',
      groupId: 'group-2026-i-cloze',
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'a current Cloze Plan cannot downgrade integrity through a registered v17 authorityRef',
  )
  assert.throws(
    () => buildCanonicalConsumptionSurfaceData({
      consumption: fakePreV18Consumption,
      familyContractId: 'cloze',
      groupId: 'group-2026-i-cloze',
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'Screen exposes no artifact for a fake pre-v18 Cloze integrity downgrade',
  )
  assert.throws(
    () => buildPrintHtml({
      title: asset.paper.title,
      versionType: 'student',
      printStyle: 'exam',
      items: [items[0]],
      blocks: [blocks[0]],
      questionNumberStart: 41,
      canonicalConsumption: fakePreV18Consumption,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'Print exposes no artifact for a fake pre-v18 Cloze integrity downgrade',
  )
  assert.equal(
    stableStringify(fakePreV18Consumption),
    fakePreV18Before,
    'failed Screen/Print projection does not mutate the poisoned Consumption Plan',
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
  assert.throws(
    () => legacyRuntime.resolveForItems({
      consumerId: 'screen',
      items,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'legacy-only raw fields do not create a Screen plan',
  )
  const databaseLegacyItems = structuredClone(items)
  for (const item of databaseLegacyItems) {
    delete item.detail.paperId
    item.sourcePaperId = 'legacy-paper-ticket-05'
  }
  assert.throws(
    () => legacyRuntime.resolveForItems({
      consumerId: 'print_pdf',
      items: databaseLegacyItems,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'DB-only legacy groups do not create a Print/PDF plan',
  )
  const legacyExports = createExportImplementation({
    rootDir,
    exportDir: path.join(rootDir, 'legacy-exports'),
    getQuestionGroupDetail: (groupId) =>
      items.find((item) => item.detail.id === groupId)?.detail || null,
    buildPrintHtml,
    resolveCanonicalConsumption: legacyRuntime.resolveForItems,
  })
  assert.throws(
    () => legacyExports.exportPrintHtml(publicInput),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'public Print HTML exposes no artifact for legacy-only input',
  )
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
  const browserLegacyConsumption = {
    disposition: 'ready',
    paperId: fixture.source.paperId,
    selections: [
      {
        familyContractId: 'cloze',
        mode: 'legacy',
        groupIds: ['group-2026-i-cloze'],
      },
      {
        familyContractId: 'grammar-fill',
        mode: 'legacy',
        groupIds: ['group-2026-i-grammar-fill'],
      },
    ],
  }
  for (const selection of screenRouteResult.body.selections) {
    if (browserLegacyConsumption.selections.some(
      (candidate) =>
        candidate.familyContractId === selection.familyContractId,
    )) continue
    browserLegacyConsumption.selections.push({
      familyContractId: selection.familyContractId,
      mode: 'legacy',
      groupIds: [...selection.groupIds],
    })
  }
  await assertActualPaperBrowseBoundary({
    readyConsumption: screenRouteResult.body,
    legacyConsumption: browserLegacyConsumption,
    invalidConsumption: partial,
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
  await assertWritingDraftGateDoesNotRequireQuestions({
    rootDir,
    paperAssetsRoot: httpPaperAssetsRoot,
    canonicalReference,
  })
  await assertTicket35CompletePublication({ rootDir })
  assertMixedSourceDraftCanonicalComposition()
  assertDocxSourcedGrammarFillPrintChromeSkipsJsonDigest()
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
    const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
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
