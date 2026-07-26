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
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
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
import { createDraftPaperStore } from '../server/draft-paper/draftPaperStore.mjs'
import { createDraftPaperRoutes } from '../server/draft-paper/draftPaperRoutes.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import {
  createPaperCanonicalConsumerRoutes,
} from '../server/paper-canonical/consumerRoutes.mjs'
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
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
        `${label}: row ${rowIndex + 1} column ${column + 1} stays within 1pt`,
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
    await page.locator('.pi-cloze-blank-card').waitFor()
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
    await page.locator('.pi-gf-blank-card').waitFor()
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
    await page.locator('.pi-cloze-blank-card').waitFor()
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

function makeDraftPaperFixture(rootDir, resolveCanonicalConsumption) {
  const detailByGroupId = new Map(items.map((item) => [item.detail.id, item.detail]))
  const userDbPath = path.join(rootDir, 'draft-paper.sqlite')
  const fixtureDb = new DatabaseSync(userDbPath)
  fixtureDb.exec(`
    CREATE TABLE draft_papers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      current_marker INTEGER NOT NULL DEFAULT 0,
      last_printed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      student_label TEXT,
      print_form TEXT
    );
    CREATE TABLE draft_paper_items (
      id TEXT PRIMARY KEY,
      draft_paper_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      source_paper_id TEXT,
      order_index INTEGER NOT NULL,
      page_break_before INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `)
  const userId = 'ticket-05-teacher'
  const draftPaperId = 'draft-paper-canonical-reference'
  fixtureDb.prepare(`
    INSERT INTO draft_papers (
      id, user_id, title, subject, status, current_marker,
      created_at, updated_at, print_form
    ) VALUES (?, ?, ?, 'english', 'active', 1, datetime('now'), datetime('now'), 'a4')
  `).run(draftPaperId, userId, 'Canonical Draft Paper Reference')
  const insertItem = fixtureDb.prepare(`
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
  fixtureDb.close()

  const store = createDraftPaperStore({
    exportImplementation: {
      exportDocx() {
        throw new Error('Draft canonical Print/PDF fixture does not export DOCX')
      },
    },
    getPrintReadyByGroupId: (_db, groupIds) =>
      new Map(groupIds.map((groupId) => [groupId, { ok: true, reason: null }])),
    getQuestionGroupDetail: (groupId) => detailByGroupId.get(groupId) || null,
    groupTypeLabels: {
      cloze: '完形填空',
      grammar_cloze: '语法填空',
    },
    isGroupPrintReady: () => ({ ok: true, reason: null }),
    openDatabase: () => ({ close() {} }),
    openUserDatabase: ({ readOnly = false } = {}) =>
      new DatabaseSync(userDbPath, { readOnly }),
    paperAssetsDir: path.resolve('app/public/paper-assets'),
    resolveCanonicalConsumption,
    selectQuestionGroupCards: (_db, _where, groupIds) =>
      groupIds.map((groupId) => {
        const detail = detailByGroupId.get(groupId)
        return {
          id: groupId,
          groupType: detail.groupType,
          defaultScore: items.find((item) => item.detail.id === groupId)?.score,
          questionCount: detail.questions.length,
        }
      }),
  })
  return {
    store,
    userId,
    draftPaperId,
    openUserDatabase: (options) =>
      new DatabaseSync(userDbPath, options),
    openBankDatabase: () => ({ close() {} }),
  }
}

async function invokeDraftRoute({
  method,
  pathName,
  context,
  body = {},
}) {
  const url = new URL(pathName, 'http://eqb.test')
  const route = createDraftPaperRoutes().find(
    (candidate) =>
      candidate.method === method
      && url.pathname.match(candidate.pattern),
  )
  assert.ok(route, `public draft route exists: ${method} ${url.pathname}`)
  const match = url.pathname.match(route.pattern)
  const result = {
    status: null,
    headers: {},
    body: null,
    json: null,
  }
  const response = {
    writeHead(status, headers) {
      result.status = status
      result.headers = headers
    },
    end(responseBody) {
      result.body = responseBody
    },
  }
  await route.handle({
    request: {},
    response,
    url,
    match,
    context: {
      ...context,
      readJsonBody: async () => body,
      sendJson: (_response, status, json) => {
        result.status = status
        result.json = json
      },
      sendPdf: (_response, responseBody, fileName, outputPath) => {
        result.status = 200
        result.body = responseBody
        result.fileName = fileName
        result.outputPath = outputPath
      },
    },
  })
  return result
}

async function assertActualDraftPrintPdfBoundary({
  rootDir,
  readyResolver,
  legacyResolver,
  partialConsumption,
}) {
  let resolveConsumption = readyResolver
  const fixture = makeDraftPaperFixture(rootDir, (input) => {
    assert.equal(input.consumerId, 'print_pdf')
    return resolveConsumption(input)
  })
  const { store, userId, draftPaperId } = fixture
  const routeContext = {
    draftPaperStore: store,
    openUserDatabase: ({ readOnly = false } = {}) =>
      fixture.openUserDatabase({ readOnly }),
    openDatabase: () => fixture.openBankDatabase(),
    resolveDataUserId: () => userId,
  }

  const canonicalPreview = await invokeDraftRoute({
    method: 'GET',
    pathName: `/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
    context: routeContext,
  })
  assert.equal(canonicalPreview.status, 200)
  assert.equal(
    (canonicalPreview.body.match(/data-canonical-placement-signature=/g) || []).length,
    15,
    'public draft Print preview carries the shared canonical layoutPlan',
  )

  try {
    const pagination = await invokeDraftRoute({
      method: 'GET',
      pathName: `/api/draft-papers/${draftPaperId}/pagination?versionType=student`,
      context: routeContext,
    })
    assert.equal(
      pagination.status,
      200,
      'public draft pagination route succeeds',
    )
    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true })
    try {
      const page = await browser.newPage()
      await page.setContent(pagination.json.paginatedHtml, { waitUntil: 'load' })
      assertBrowserColumnGates(
        await readBrowserColumnStarts(
          page,
          '.canonical-options--four_columns',
          ':scope > span',
        ),
        'Draft Print/PDF',
      )
    } finally {
      await browser.close()
    }

    const exportedPdf = await invokeDraftRoute({
      method: 'POST',
      pathName: `/api/draft-papers/${draftPaperId}/print-pdf`,
      context: routeContext,
      body: { versionType: 'student' },
    })
    assert.equal(
      exportedPdf.status,
      200,
      'public draft PDF route succeeds',
    )
    assert.equal(
      exportedPdf.body.subarray(0, 4).toString(),
      '%PDF',
      'public draft PDF export returns the planned pagination artifact',
    )

    resolveConsumption = legacyResolver
    const legacyPagination = await invokeDraftRoute({
      method: 'GET',
      pathName: `/api/draft-papers/${draftPaperId}/pagination?versionType=student`,
      context: routeContext,
    })
    assert.equal(
      legacyPagination.status,
      200,
      `public draft legacy pagination succeeds: ${JSON.stringify(legacyPagination.json)}`,
    )
    assert.equal(
      (legacyPagination.json.paginatedHtml.match(/data-canonical-placement-signature=/g) || []).length,
      0,
      'public draft pagination preserves explicit whole-family legacy selection',
    )
    assert.equal(
      legacyPagination.json.reused,
      false,
      'Consumption Plan change invalidates the physical artifact cache',
    )

    resolveConsumption = () => partialConsumption
    const partialPagination = await invokeDraftRoute({
      method: 'GET',
      pathName: `/api/draft-papers/${draftPaperId}/pagination?versionType=student`,
      context: routeContext,
    })
    assert.equal(partialPagination.status, 400)
    assert.equal(
      partialPagination.json.paginatedHtml,
      undefined,
      'public draft pagination rejects a partial plan with no cached artifact exposure',
    )
    const partialPdf = await invokeDraftRoute({
      method: 'POST',
      pathName: `/api/draft-papers/${draftPaperId}/print-pdf`,
      context: routeContext,
      body: { versionType: 'student' },
    })
    assert.equal(partialPdf.status, 400)
    assert.equal(
      partialPdf.body,
      null,
      'public draft PDF rejects a partial plan with no artifact exposure',
    )
  } finally {
    await closeChromiumPool()
  }

  resolveConsumption = legacyResolver
  const legacyPreview = await invokeDraftRoute({
    method: 'GET',
    pathName: `/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
    context: routeContext,
  })
  assert.equal(legacyPreview.status, 200)
  assert.equal(
    (legacyPreview.body.match(/data-canonical-placement-signature=/g) || []).length,
    0,
    'public draft Print preview preserves explicit whole-family legacy selection',
  )

  resolveConsumption = () => partialConsumption
  await assert.rejects(
    () => invokeDraftRoute({
      method: 'GET',
      pathName: `/api/draft-papers/${draftPaperId}/print-html?versionType=student`,
      context: routeContext,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'public draft Print preview rejects a partial Consumption Plan before rendering',
  )
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
  const publicRenderer = createDocxRenderer({
    groupTypeLabels: { cloze: '完形填空', grammar_cloze: '语法填空' },
    optionalString: (value) => typeof value === 'string' ? value.trim() : '',
  })
  const publicExports = createExportImplementation({
    rootDir,
    exportDir: path.join(rootDir, 'exports'),
    getQuestionGroupDetail: (groupId) =>
      items.find((item) => item.detail.id === groupId)?.detail || null,
    buildDocumentXml: publicRenderer.buildDocumentXml,
    writeDocxPackage: publicRenderer.writeDocxPackage,
    buildPrintHtml,
    convertDocxToPdf: publicRenderer.convertDocxToPdf,
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
  const publicDocx = publicExports.exportDocx(publicInput)
  const publicTeacherDocx = publicExports.exportDocx({
    ...publicInput,
    versionType: 'teacher',
  })
  assert.equal(
    publicDocx.normalizationDiagnostics.filter(
      (diagnostic) => diagnostic.source === 'whole-paper-consumption',
    ).length,
    2,
  )
  const publicStudentDocumentXml = execFileSync(
    'unzip',
    ['-p', publicDocx.outputPath, 'word/document.xml'],
    { encoding: 'utf8' },
  )
  const publicTeacherDocumentXml = execFileSync(
    'unzip',
    ['-p', publicTeacherDocx.outputPath, 'word/document.xml'],
    { encoding: 'utf8' },
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
    if (consumerId === 'docx') {
      const renderer = createDocxRenderer({
        groupTypeLabels: { cloze: '完形填空', grammar_cloze: '语法填空' },
        optionalString: (value) => typeof value === 'string' ? value.trim() : '',
      })
      const student = renderer.buildDocumentXml({
        title: asset.paper.title,
        versionType: 'student',
        printStyle: 'exam',
        items,
        blocks,
        questionNumberStart: 41,
        canonicalConsumption: consumption,
      })
      const teacher = renderer.buildDocumentXml({
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
      assert.equal((student.match(/w:val="single"/g) || []).length >= 25, true)
      assert.equal(
        (student.match(/<w:gridCol w:w="2080"\/>/g) || []).length,
        45,
      )
      assert.equal(
        (student.match(/<w:gridCol w:w="420"\/>/g) || []).length,
        15,
      )
      artifactProof.docx = { renderer, student, teacher }
    }
  }
  assert.deepEqual(signatures.get('screen'), signatures.get('print_pdf'))
  assert.deepEqual(signatures.get('screen'), signatures.get('docx'))
  artifactProof.print = {
    student: publicPrint.body,
    teacher: publicTeacherPrint.body,
  }
  artifactProof.docx = {
    renderer: publicRenderer,
    student: publicStudentDocumentXml,
    teacher: publicTeacherDocumentXml,
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
    consumerContract: consumerContractRefs.docx,
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
  const oneColumnXml = artifactProof.docx.renderer.buildDocumentXml({
    title: asset.paper.title,
    versionType: 'student',
    printStyle: 'exam',
    items: [items[0]],
    blocks: [blocks[0]],
    questionNumberStart: 41,
    canonicalConsumption: oneColumnConsumption,
  })
  assert.equal(
    oneColumnXml.includes('<w:ind w:left="420" w:hanging="420"/>'),
    true,
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
    buildDocumentXml: publicRenderer.buildDocumentXml,
    writeDocxPackage: publicRenderer.writeDocxPackage,
    buildPrintHtml,
    convertDocxToPdf: publicRenderer.convertDocxToPdf,
    resolveCanonicalConsumption: legacyRuntime.resolveForItems,
  })
  for (const result of [
    legacyExports.exportPrintHtml(publicInput),
    legacyExports.exportDocx(publicInput),
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
  await assertActualPaperBrowseBoundary({
    readyConsumption: screenRouteResult.body,
    legacyConsumption: explicitLegacy,
    invalidConsumption: partial,
    outputDir: actualOutputDir,
  })
  await assertActualDraftPrintPdfBoundary({
    rootDir,
    readyResolver: runtime.resolveForItems,
    legacyResolver: legacyRuntime.resolveForItems,
    partialConsumption: partial,
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

  const canonicalGroupsPath = path.join(
    rootDir,
    fixture.source.paperId,
    'versions',
    'v1',
    'canonical',
    'canonical-question-groups-v1.json',
  )
  const canonicalGroupsBytes = readFileSync(canonicalGroupsPath)
  const corruptGroups = JSON.parse(canonicalGroupsBytes)
  corruptGroups.groups[0].identity.groupId = 'corrupt-group'
  writeFileSync(canonicalGroupsPath, `${JSON.stringify(corruptGroups)}\n`)
  assert.throws(
    () => runtime.load({
      paperId: fixture.source.paperId,
      consumerId: 'screen',
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
  const corruptDraftRoot = path.join(rootDir, 'corrupt-draft')
  mkdirSync(corruptDraftRoot, { recursive: true })
  const corruptDraft = makeDraftPaperFixture(
    corruptDraftRoot,
    (input) => runtime.resolveForItems(input),
  )
  const corruptDraftContext = {
    draftPaperStore: corruptDraft.store,
    openUserDatabase: ({ readOnly = false } = {}) =>
      corruptDraft.openUserDatabase({ readOnly }),
    openDatabase: () => corruptDraft.openBankDatabase(),
    resolveDataUserId: () => corruptDraft.userId,
  }
  await assert.rejects(
    () => invokeDraftRoute({
      method: 'GET',
      pathName: `/api/draft-papers/${corruptDraft.draftPaperId}/print-html?versionType=student`,
      context: corruptDraftContext,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
    'public draft Print preview rejects a corrupt Publication before rendering',
  )
  for (const request of [
    {
      method: 'GET',
      pathName: `/api/draft-papers/${corruptDraft.draftPaperId}/pagination?versionType=student`,
    },
    {
      method: 'POST',
      pathName: `/api/draft-papers/${corruptDraft.draftPaperId}/print-pdf`,
      body: { versionType: 'student' },
    },
  ]) {
    const corruptResponse = await invokeDraftRoute({
      ...request,
      context: corruptDraftContext,
    })
    assert.equal(
      corruptResponse.status,
      400,
      `${request.method} ${request.pathName} rejects a corrupt Publication`,
    )
    assert.equal(
      corruptResponse.body,
      null,
      `${request.method} ${request.pathName} exposes no partial physical artifact`,
    )
  }
  writeFileSync(canonicalGroupsPath, canonicalGroupsBytes)

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

    const studentDocxPath = path.join(outputDir, 'student.docx')
    artifactProof.docx.renderer.writeDocxPackage({
      documentXml: artifactProof.docx.student,
      outputPath: studentDocxPath,
      title: asset.paper.title,
    })
    artifactProof.docx.renderer.convertDocxToPdf(
      studentDocxPath,
      path.join(outputDir, 'student-docx.pdf'),
    )
    writeFileSync(
      path.join(outputDir, 'student-document.xml'),
      artifactProof.docx.student,
    )
    writeFileSync(
      path.join(outputDir, 'teacher-document.xml'),
      artifactProof.docx.teacher,
    )
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
