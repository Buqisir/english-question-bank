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
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
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
        consumption,
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
      artifactProof.screen = {
        cloze: screenArtifact,
        grammar: buildCanonicalConsumptionSurfaceData({
          consumption,
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
    const head = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], {
      encoding: 'utf8',
    }).trim()
    const outputDir = path.resolve(
      '.scratch',
      'paper-canonical-ticket-05-qa',
      head,
    )
    mkdirSync(outputDir, { recursive: true })

    const vite = await import('../app/node_modules/vite/dist/node/index.js')
    const viteServer = await vite.createServer({
      root: path.resolve('app'),
      appType: 'custom',
      server: { middlewareMode: true },
    })
    let screenMarkup
    try {
      const screenRenderer = await viteServer.ssrLoadModule(
        '/src/qa/renderCanonicalConsumptionSurface.tsx',
      )
      screenMarkup = [
        screenRenderer.renderCanonicalConsumptionSurface(
          artifactProof.screen.cloze.surfaceData,
        ),
        screenRenderer.renderCanonicalConsumptionSurface(
          artifactProof.screen.grammar.surfaceData,
        ),
      ].join('')
    } finally {
      await viteServer.close()
    }
    const surfaceCss = readFileSync(
      'app/src/shared-ui/papersurface/PaperSurface.css',
      'utf8',
    )
    const screenHtml = `<!doctype html><html><head><meta charset="utf-8"><style>${surfaceCss}</style></head><body>${screenMarkup}</body></html>`
    const screenPath = path.join(outputDir, 'screen.html')
    const printStudentPath = path.join(outputDir, 'print-student.html')
    const printTeacherPath = path.join(outputDir, 'print-teacher.html')
    writeFileSync(screenPath, screenHtml)
    writeFileSync(printStudentPath, artifactProof.print.student)
    writeFileSync(printTeacherPath, artifactProof.print.teacher)

    const playwright = await import('../app/node_modules/playwright/index.js')
    const browser = await playwright.default.chromium.launch({ headless: true })
    try {
      const screenPage = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      await screenPage.goto(new URL(`file://${screenPath}`).href)
      assert.equal(
        await screenPage.locator('[data-paper-question-id]').count(),
        15,
      )
      assert.equal(
        await screenPage.locator('[data-canonical-placement-signature]').count(),
        15,
      )
      await screenPage.screenshot({
        path: path.join(outputDir, 'screen.png'),
        fullPage: true,
      })
      await screenPage.pdf({
        path: path.join(outputDir, 'screen.pdf'),
        format: 'A4',
        printBackground: true,
      })

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
