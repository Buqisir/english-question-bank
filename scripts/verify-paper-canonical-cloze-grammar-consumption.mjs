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
    await page.route('**/paper-assets/**/figures/**', (route) =>
      route.fulfill({ status: 404, body: '' }))

    const qaUrl = new URL('canonical-consumption-qa.html', appUrl)
    qaUrl.searchParams.set('paperId', fixture.source.paperId)
    await page.goto(qaUrl.href)
    await page.locator('[data-paper-question-id]').first().waitFor()
    assert.equal(
      await page.locator('[data-paper-question-id]').count(),
      15,
      'actual PaperBrowsePage renders every Cloze question',
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
      'actual PaperBrowsePage carries every Cloze placement signature',
    )
    assertBrowserColumnGates(
      await readBrowserColumnStarts(
        page,
        '.ps-question-options-inline--four_columns',
        '.ps-question-options-inline-item',
      ),
      'Screen',
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
    await page.reload()
    await page.locator('[data-paper-question-id]').first().waitFor()
    assert.equal(
      await page.locator('[data-paper-question-id]').count(),
      15,
      'actual PaperBrowsePage honors an explicit whole-family legacy plan',
    )
    assert.equal(
      await page.locator('[data-canonical-placement-signature]').count(),
      0,
      'explicit legacy selection does not invoke canonical projection',
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
  legacyDb.close()
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
