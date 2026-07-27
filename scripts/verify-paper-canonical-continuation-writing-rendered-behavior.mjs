#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import {
  buildCanonicalContinuationWritingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  makeContinuationWritingReferenceFixture,
  makePollutedContinuationCapture,
} from '../test-fixtures/paper-canonical/continuationWritingReferenceFixture.mjs'

const persistActualArtifacts =
  process.env.EQB_PERSIST_ACTUAL_ARTIFACTS === '1'
const actualArtifactRoot = path.resolve(
  process.env.EQB_ACTUAL_ARTIFACT_ROOT
    || '.scratch/ticket-13-continuation-writing',
)
if (persistActualArtifacts) {
  mkdirSync(actualArtifactRoot, { recursive: true })
}
const docxRenderer = createDocxRenderer({
  groupTypeLabels: { writing: '写作' },
  optionalString: (value) => value == null ? '' : String(value),
})

function readyConsumption(paperId) {
  const fixture = makeContinuationWritingReferenceFixture(paperId)
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const projected = projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
  const occurrences = projected.nodes.filter(
    (node) =>
      node.kind === 'group'
      && node.familyContractId === 'continuation-writing',
  )
  assert.equal(occurrences.length, 1)
  return {
    disposition: 'ready',
    paperId,
    selections: [{
      mode: 'canonical',
      familyContractId: 'continuation-writing',
      groupIds: [occurrences[0].groupId],
      projectedOccurrences: occurrences,
    }],
  }
}

function continuationGroup(consumption) {
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'continuation-writing',
  )
  assert.equal(selection.mode, 'canonical')
  assert.equal(selection.groupIds.length, 1)
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'continuation-writing',
    groupId: selection.groupIds[0],
  })
}

function poisonedExportItem(canonical, legacyTaskVariant = 'poisoned') {
  const item = {
    detail: {
      id: canonical.groupId,
      paperId: canonical.paperId,
      title: 'POISONED LEGACY CONTINUATION TITLE',
      source: 'POISONED LEGACY CONTINUATION SOURCE',
      groupType: 'writing',
      passage: {
        title: 'POISONED LEGACY CONTINUATION PASSAGE',
        materialText:
          'POISONED LEGACY MATERIAL\nParagraph 1: INVENTED PREFIX\nParagraph 2: INVENTED PREFIX',
      },
      writingTask: {
        taskType: 'application',
        continuationStarters: [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
          'POISONED LEGACY STARTER THREE',
        ],
      },
      analysis: {
        continuationStarters: ['FORGED ANALYSIS ONE', 'FORGED ANALYSIS TWO'],
        instructions: ['FORGED ANALYSIS INSTRUCTION'],
      },
      questions: [],
    },
    score: 25,
    sectionTitle: 'POISONED LEGACY CONTINUATION SECTION',
    note: 'POISONED LEGACY CONTINUATION INSTRUCTION',
  }
  if (legacyTaskVariant === 'absent') {
    delete item.detail.writingTask.taskType
  }
  return item
}

function bookmarkName(kind, value) {
  return `${kind}_${createHash('sha256').update(`${kind}:${value}`)
    .digest('hex').slice(0, 24)}`
}

function compactText(value) {
  return String(value).replaceAll(/\s/g, '')
}

function assertVisibleCanonicalText(renderedText, canonical) {
  const compact = compactText(renderedText)
  assert.equal(compact.includes('POISONEDLEGACY'), false)
  assert.equal(compact.includes('FORGEDANALYSIS'), false)
  for (const block of canonical.materialBlocks) {
    assert.equal(
      compact.split(compactText(block.text)).length - 1,
      1,
      `material ${block.nodeId} must occur once`,
    )
  }
  for (const starter of canonical.answerRegion.starterLines) {
    assert.equal(
      compact.split(compactText(starter.text)).length - 1,
      1,
      `starter ${starter.starterId} must occur once`,
    )
  }
}

function assertPollutedProofBlocked() {
  const fixture = makeContinuationWritingReferenceFixture('paper-2026-i')
  const request = structuredClone(fixture.request)
  const captureDocument = request.evidence.documents.find(
    (document) => document.inputKey === 'continuation_writing_capture',
  )
  captureDocument.bytes = new TextEncoder().encode(
    JSON.stringify(makePollutedContinuationCapture()),
  )
  const blocked = compileCanonicalPaper(request)
  assert.notEqual(blocked.disposition, 'ready')
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
}

const cases = []
for (const paperId of ['paper-2026-i', 'paper-zj-2020-jul']) {
  const consumption = readyConsumption(paperId)
  const selection = consumption.selections[0]
  const canonical = continuationGroup(consumption)
  assert.equal(canonical.groupType, 'continuation')
  assert.equal(canonical.questions.length, 0)
  assert.equal(canonical.wordCountRuling.countScope, 'student_authored_only')
  assert.equal(canonical.answerRegion.responseSlotId, 'writing.continuation')
  assert.equal(
    canonical.answerRegion.starterLines.length,
    paperId === 'paper-2026-i' ? 2 : 0,
  )
  const surface =
    buildCanonicalContinuationWritingConsumptionSurfaceData({
      consumption,
      groupId: selection.groupIds[0],
    })
  assert.equal(surface.semanticDigest, canonical.semanticSignature)
  assert.equal(surface.occurrenceSignature, canonical.occurrenceSignature)
  assert.equal(
    surface.pageModel.blocks.filter((block) => block.kind === 'passage')
      .length,
    1,
  )
  assert.equal(
    surface.pageModel.blocks.filter((block) => block.kind === 'answerBox')
      .length,
    1,
  )
  cases.push({
    label: paperId === 'paper-2026-i' ? 'two-starter' : 'zero-starter',
    consumption,
    canonical,
    surface,
  })
}

assertPollutedProofBlocked()

const printArtifacts = []
for (const { label, consumption, canonical } of cases) {
  for (const versionType of ['student', 'teacher']) {
    const html = buildPrintHtml({
      title: `Continuation ${label}`,
      versionType,
      printStyle: 'exam',
      items: [poisonedExportItem(
        canonical,
        label === 'two-starter' ? 'absent' : 'poisoned',
      )],
      blocks: [{
        type: 'question_group',
        questionGroupId: canonical.groupId,
        score: 25,
      }],
      questionNumberStart: 1,
      canonicalConsumption: consumption,
    })
    assert.equal(
      (html.match(/data-canonical-writing-semantic-signature=/g) || [])
        .length,
      1,
    )
    assert.equal(
      html.includes(
        `data-canonical-writing-semantic-signature="${canonical.semanticSignature}"`,
      ),
      true,
    )
    assert.equal(
      (html.match(/data-canonical-writing-occurrence-signature=/g) || [])
        .length,
      1,
    )
    assert.equal(
      html.includes(
        `data-canonical-writing-occurrence-signature="${canonical.occurrenceSignature}"`,
      ),
      true,
    )
    for (const instruction of [
      canonical.paperChrome.part,
      canonical.paperChrome.section,
      ...canonical.paperChrome.instructions,
    ]) {
      assert.equal(
        (html.match(new RegExp(
          `data-canonical-instruction-id="${instruction.instructionId}"`,
          'g',
        )) || []).length,
        1,
      )
    }
    assert.equal(
      (html.match(/data-canonical-response-slot-id=/g) || []).length,
      1,
    )
    assert.equal(
      (html.match(/data-canonical-starter-id=/g) || []).length,
      canonical.answerRegion.starterLines.length,
    )
    assert.equal(
      html.includes('data-canonical-word-count-scope="student_authored_only"'),
      true,
    )
    assertVisibleCanonicalText(html, canonical)
    printArtifacts.push({ label, versionType, html, canonical })
    if (persistActualArtifacts) {
      writeFileSync(
        path.join(actualArtifactRoot, `print-${label}-${versionType}.html`),
        html,
      )
    }
  }
}

for (const { label, consumption, canonical } of cases) {
  for (const versionType of ['student', 'teacher']) {
    const xml = docxRenderer.buildDocumentXml({
      title: `Continuation ${label}`,
      versionType,
      printStyle: 'exam',
      items: [poisonedExportItem(
        canonical,
        label === 'two-starter' ? 'absent' : 'poisoned',
      )],
      blocks: [{
        type: 'question_group',
        questionGroupId: canonical.groupId,
        score: 25,
      }],
      questionNumberStart: 1,
      canonicalConsumption: consumption,
    })
    assertVisibleCanonicalText(xml, canonical)
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_semantic',
        canonical.semanticSignature,
      )),
      true,
    )
    for (const instruction of [
      canonical.paperChrome.part,
      canonical.paperChrome.section,
      ...canonical.paperChrome.instructions,
    ]) {
      assert.equal(
        xml.includes(bookmarkName(
          'canonical_instruction',
          instruction.instructionId,
        )),
        true,
      )
    }
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_occurrence',
        canonical.occurrenceSignature,
      )),
      true,
    )
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_response',
        canonical.answerRegion.responseSlotId,
      )),
      true,
    )
    assert.equal(
      xml.includes(bookmarkName(
        'canonical_word_ruling',
        canonical.wordCountRuling.authorityObservationRef,
      )),
      true,
    )
    assert.equal(
      (xml.match(/<w:tbl>/g) || []).length,
      canonical.answerRegion.starterLines.length === 2 ? 2 : 1,
      'Continuation owns one outer response table and an optional nested starter layout table',
    )
    assert.equal(
      (xml.match(/<w:cantSplit\/>/g) || []).length,
      1,
      'Continuation response owns one indivisible outer DOCX row',
    )
    for (const starter of canonical.answerRegion.starterLines) {
      assert.equal(
        xml.includes(bookmarkName('canonical_starter', starter.starterId)),
        true,
      )
    }
    const docxRoot = mkdtempSync(path.join(tmpdir(), 'eqb-continuation-docx-'))
    try {
      const docxPath = path.join(docxRoot, `${label}-${versionType}.docx`)
      const pdfPath = path.join(
        docxRoot,
        `${label}-${versionType}-converted.pdf`,
      )
      docxRenderer.writeDocxPackage({
        documentXml: xml,
        outputPath: docxPath,
        title: `Continuation ${label}`,
      })
      const packagedXml = execFileSync(
        'unzip',
        ['-p', docxPath, 'word/document.xml'],
        { encoding: 'utf8' },
      )
      assert.equal(packagedXml, xml)
      docxRenderer.convertDocxToPdf(docxPath, pdfPath)
      assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
      const convertedText = execFileSync(
        'pdftotext',
        ['-layout', pdfPath, '-'],
        { encoding: 'utf8' },
      )
      assertVisibleCanonicalText(convertedText, canonical)
      if (persistActualArtifacts) {
        copyFileSync(
          docxPath,
          path.join(actualArtifactRoot, `docx-${label}-${versionType}.docx`),
        )
        copyFileSync(
          pdfPath,
          path.join(
            actualArtifactRoot,
            `docx-${label}-${versionType}-converted.pdf`,
          ),
        )
      }
    } finally {
      rmSync(docxRoot, { recursive: true, force: true })
    }
  }
}

{
  const { consumption, canonical } = cases.find(
    ({ label }) => label === 'two-starter',
  )
  const dummy = {
    detail: {
      id: 'dummy-writing-boundary-group',
      paperId: 'dummy-writing-boundary-paper',
      title: 'Application task',
      source: 'boundary fixture',
      groupType: 'writing',
      passage: {
        title: '',
        materialText:
          'Filler paragraph with enough words to occupy one ordinary line.',
      },
      questions: [],
    },
    score: 15,
    sectionTitle: '',
    note: '',
  }
  const boundaryArgs = {
    title: 'Continuation boundary probe',
    versionType: 'student',
    printStyle: 'exam',
    items: [dummy, poisonedExportItem(canonical, 'absent')],
    blocks: [
      {
        type: 'question_group',
        questionGroupId: dummy.detail.id,
        score: 15,
      },
      {
        type: 'question_group',
        questionGroupId: canonical.groupId,
        score: 25,
      },
    ],
    questionNumberStart: 1,
    canonicalConsumption: consumption,
  }
  const root = mkdtempSync(path.join(
    tmpdir(),
    'eqb-continuation-docx-boundary-',
  ))
  try {
    const docxPath = path.join(root, 'boundary.docx')
    const pdfPath = path.join(root, 'boundary.pdf')
    const xml = docxRenderer.buildDocumentXml(boundaryArgs)
    docxRenderer.writeDocxPackage({
      documentXml: xml,
      outputPath: docxPath,
      title: boundaryArgs.title,
    })
    docxRenderer.convertDocxToPdf(docxPath, pdfPath)
    const pages = execFileSync(
      'pdftotext',
      ['-layout', pdfPath, '-'],
      { encoding: 'utf8' },
    ).split('\f')
    const starterPages = canonical.answerRegion.starterLines.map(
      (starter) =>
        pages.findIndex((pageText) => pageText.includes(starter.text)) + 1,
    )
    assert.ok(
      starterPages.every((pageNumber) => pageNumber > 0),
      'DOCX boundary PDF contains both canonical starter lines',
    )
    assert.equal(
      new Set(starterPages).size,
      1,
      'DOCX boundary PDF keeps both starter lines in one unsplit response box/page',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

async function assertBrowserArtifacts() {
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: path.resolve('app'),
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  try {
    for (const { label, consumption, canonical } of cases) {
      const signatures = []
      for (const teacher of [false, true]) {
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        })
        await page.route(
          '**/qa/canonical-continuation-writing-consumption.json',
          (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(consumption),
          }),
        )
        const url = new URL('canonical-continuation-writing-qa.html', appUrl)
        url.searchParams.set('groupId', canonical.groupId)
        if (teacher) url.searchParams.set('teacher', '1')
        await page.goto(url.href)
        const response = page.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        await response.waitFor()
        assert.equal(await response.count(), 1)
        assert.equal(
          await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          canonical.semanticSignature,
        )
        assert.equal(
          await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
          canonical.occurrenceSignature,
        )
        assert.equal(
          await page.locator('[data-canonical-continuation-material]')
            .count(),
          1,
        )
        assert.equal(
          await page.locator('[data-canonical-starter-id]').count(),
          canonical.answerRegion.starterLines.length,
        )
        assert.deepEqual(
          await page.locator(
            '.pi-writing-part, .pi-writing-section, .pi-writing-instruction',
          ).allInnerTexts(),
          [
            canonical.paperChrome.part.text,
            canonical.paperChrome.section.text,
            ...canonical.paperChrome.instructions.map(
              (instruction) => instruction.text,
            ),
          ],
        )
        const bodyText = await page.locator('body').innerText()
        assertVisibleCanonicalText(bodyText, canonical)
        assert.equal(
          bodyText.includes('TEACHER SUPPLEMENT — not paper semantics'),
          teacher,
        )
        const box = await response.boundingBox()
        assert.ok(box)
        assert.ok(Math.abs(box.width - (145 / 25.4 * 96)) <= 1)
        assert.ok(Math.abs(box.height - (57 / 25.4 * 96)) <= 1)
        signatures.push({
          semantic: await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          occurrence: await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
          response: await response.getAttribute(
            'data-canonical-response-slot-id',
          ),
          width: box.width,
          height: box.height,
        })
        if (persistActualArtifacts) {
          await page.screenshot({
            path: path.join(
              actualArtifactRoot,
              `screen-${label}-${teacher ? 'teacher' : 'student'}.png`,
            ),
            fullPage: true,
          })
        }
        await page.close()
      }
      assert.deepEqual(signatures[0], signatures[1])
    }

    for (const { label, consumption, canonical } of cases) {
      const asset = JSON.parse(readFileSync(
        new URL(
          `../app/public/paper-assets/${consumption.paperId}/latest/paper-asset.json`,
          import.meta.url,
        ),
        'utf8',
      ))
      const legacyGroup = asset.content.groups[canonical.groupId]
      asset.content.blocks = asset.content.blocks.filter(
        (block) =>
          block.type === 'group'
          && block.groupId === canonical.groupId,
      )
      legacyGroup.passage.paragraphs = [{
        paragraphId: 'poisoned-legacy-continuation',
        text:
          'POISONED LEGACY MATERIAL Paragraph 1: INVENTED PREFIX Paragraph 2: INVENTED PREFIX',
      }]
      asset.content.writingTasks[legacyGroup.writingTaskId]
        .continuationStarters = [
          'POISONED LEGACY STARTER ONE',
          'POISONED LEGACY STARTER TWO',
          'POISONED LEGACY STARTER THREE',
        ]
      const legacyTask = asset.content.writingTasks[legacyGroup.writingTaskId]
      if (label === 'two-starter') delete legacyTask.taskType
      else legacyTask.taskType = 'application'

      const analysisVariants = [
        {
          label: 'valid',
          payload: {
            schemaVersion: 'writing-analysis-v1',
            paperId: consumption.paperId,
            groups: {
              [canonical.groupId]: {
                writing: {
                  taskType: 'continuation',
                  modelAnswer: 'FORGED ANALYSIS MODEL ANSWER',
                  continuationDesign: {
                    theme: 'FORGED ANALYSIS THEME',
                    paragraphs: [
                      'FORGED ANALYSIS PARAGRAPH ONE',
                      'FORGED ANALYSIS PARAGRAPH TWO',
                    ],
                  },
                  highlightExpressions: [{
                    text: 'FORGED ANALYSIS EXPRESSION',
                    note: 'FORGED ANALYSIS NOTE',
                  }],
                },
              },
            },
          },
        },
        {
          label: 'invalid',
          payload: {
            schemaVersion: 'writing-analysis-v1',
            paperId: consumption.paperId,
            groups: {
              [canonical.groupId]: {
                writing: {
                  taskType: 'continuation',
                  modelAnswer: null,
                  continuationDesign: {
                    theme: 'FORGED ANALYSIS INVALID THEME',
                    paragraphs: ['FORGED ANALYSIS ONLY ONE PARAGRAPH'],
                  },
                  highlightExpressions: 'FORGED ANALYSIS INVALID EXPRESSIONS',
                },
              },
            },
          },
        },
      ]
      const productionSignatures = []
      for (const analysisVariant of analysisVariants) {
        let writingAnalysisRequestCount = 0
        const page = await browser.newPage({
          viewport: { width: 1280, height: 900 },
        })
        await page.route(
          '**/api/paper-canonical/consumption?*',
          (route) => route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(consumption),
          }),
        )
        await page.route('**/paper-assets/**/paper-asset.json', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(asset),
          }))
        await page.route('**/paper-assets/**/analyses/**', (route) => {
          if (route.request().url().endsWith(
            '/analyses/writing-analysis-v1.json',
          )) {
            writingAnalysisRequestCount += 1
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(analysisVariant.payload),
            })
          }
          return route.fulfill({ status: 404, body: '' })
        })
        await page.route('**/paper-assets/**/figures/**', (route) =>
          route.fulfill({ status: 404, body: '' }))
        const url = new URL('canonical-consumption-qa.html', appUrl)
        url.searchParams.set('paperId', consumption.paperId)
        url.searchParams.set('focusGroupId', canonical.groupId)
        url.searchParams.set('lecture', '1')
        await page.goto(url.href)
        const response = page.locator(
          `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
        )
        try {
          await response.waitFor({ timeout: 10_000 })
        } catch (error) {
          throw new Error(
            `PaperBrowse did not mount canonical Continuation Writing (${label}/${analysisVariant.label}): ${
              await page.locator('body').innerText()
            }`,
            { cause: error },
          )
        }
        const writingPage = response.locator(
          'xpath=ancestor::*[@data-pi-writing-page]',
        )
        if (analysisVariant.label === 'valid') {
          await page.getByText('FORGED ANALYSIS THEME', { exact: true })
            .waitFor()
        } else {
          await page.locator('.paper-browse-lecture-empty')
            .filter({ hasText: '解析未发布' })
            .waitFor()
        }
        assert.equal(
          writingAnalysisRequestCount,
          1,
          'PaperBrowse lecture route fetches the present Analysis exactly once',
        )
        assert.equal(await response.count(), 1)
        assert.equal(
          await writingPage.locator('[data-canonical-continuation-material]')
            .count(),
          1,
        )
        assert.equal(
          await writingPage.locator('[data-canonical-response-slot-id]')
            .count(),
          1,
        )
        assert.deepEqual(
          await writingPage.locator('[data-canonical-starter-id]')
            .allInnerTexts(),
          canonical.answerRegion.starterLines.map((starter) => starter.text),
        )
        assert.deepEqual(
          await writingPage.locator(
            '.pi-writing-part, .pi-writing-section, .pi-writing-instruction',
          ).allInnerTexts(),
          [
            canonical.paperChrome.part.text,
            canonical.paperChrome.section.text,
            ...canonical.paperChrome.instructions.map(
              (instruction) => instruction.text,
            ),
          ],
        )
        assert.equal(
          await writingPage.locator('[data-writing-answer-supplement]').count(),
          0,
        )
        assertVisibleCanonicalText(await writingPage.innerText(), canonical)
        productionSignatures.push({
          semantic: await response.getAttribute(
            'data-canonical-writing-semantic-signature',
          ),
          occurrence: await response.getAttribute(
            'data-canonical-writing-occurrence-signature',
          ),
        })
        await page.close()
      }
      assert.deepEqual(productionSignatures[0], productionSignatures[1])
      assert.deepEqual(productionSignatures[0], {
        semantic: canonical.semanticSignature,
        occurrence: canonical.occurrenceSignature,
      })
    }

    for (const { label, versionType, html, canonical } of printArtifacts) {
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'load' })
      const response = page.locator(
        `[data-canonical-response-slot-id="${canonical.answerRegion.responseSlotId}"]`,
      )
      assert.equal(await response.count(), 1)
      const box = await response.boundingBox()
      assert.ok(box)
      assert.ok(Math.abs(box.width - (145 / 25.4 * 96)) <= 1)
      assert.ok(Math.abs(box.height - (57 / 25.4 * 96)) <= 1)
      const pdfRoot = mkdtempSync(path.join(tmpdir(), 'eqb-continuation-pdf-'))
      try {
        const pdfPath = path.join(pdfRoot, `${label}-${versionType}.pdf`)
        await page.pdf({
          path: pdfPath,
          format: 'A4',
          printBackground: true,
          preferCSSPageSize: true,
        })
        assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
        const pdfText = execFileSync(
          'pdftotext',
          ['-layout', pdfPath, '-'],
          { encoding: 'utf8' },
        )
        assertVisibleCanonicalText(pdfText, canonical)
        if (persistActualArtifacts) {
          copyFileSync(
            pdfPath,
            path.join(
              actualArtifactRoot,
              `print-${label}-${versionType}.pdf`,
            ),
          )
        }
      } finally {
        rmSync(pdfRoot, { recursive: true, force: true })
      }
      await page.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertBrowserArtifacts()

console.log(
  'paper canonical Continuation Writing rendered behavior verification passed',
)
