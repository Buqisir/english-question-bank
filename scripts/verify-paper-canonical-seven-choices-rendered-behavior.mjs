#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { resolveCanonicalAuthority } from '../shared/paper-canonical/authority.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  buildCanonicalConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  makeSevenChoicesCanonicalReferenceFixture,
} from '../test-fixtures/paper-canonical/sevenChoicesReferenceFixture.mjs'

const fixture = makeSevenChoicesCanonicalReferenceFixture('paper-2026-i')
const compilation = compileCanonicalPaper(fixture.request)
assert.equal(compilation.disposition, 'ready')

const projected = projectCanonicalPaper({
  plan: compilation.artifacts.canonicalPaper.paperPlan,
  groups: compilation.artifacts.canonicalPaper.questionGroups,
  sourceCapture: compilation.artifacts.sourceCapture,
  authorityClosure: resolveCanonicalAuthority(
    compilation.artifacts.canonicalPaper.paperPlan.authorityRef,
  ).closure,
})
const occurrence = projected.nodes.find(
  (node) => node.kind === 'group' && node.familyContractId === 'seven-choices',
)
assert.ok(occurrence)

const consumption = {
  disposition: 'ready',
  paperId: fixture.paperId,
  selections: [{
    mode: 'canonical',
    familyContractId: 'seven-choices',
    groupIds: [occurrence.groupId],
    projectedOccurrences: [occurrence],
  }],
}
const browserConsumption = {
  ...consumption,
  selections: [...new Set(
    projected.nodes
      .filter((node) => node.kind === 'group')
      .map((node) => node.familyContractId),
  )].map((familyContractId) => {
    const projectedOccurrences = projected.nodes.filter(
      (node) =>
        node.kind === 'group'
        && node.familyContractId === familyContractId,
    )
    return {
      mode: familyContractId === 'seven-choices' ? 'canonical' : 'legacy',
      familyContractId,
      groupIds: projectedOccurrences.map((node) => node.groupId),
      projectedOccurrences,
    }
  }),
}
const group = projectCanonicalConsumerGroup({
  consumption,
  familyContractId: 'seven-choices',
  groupId: occurrence.groupId,
})

assert.equal(group.groupType, 'sevenChoices')
assert.equal(group.questions.length, 5)
assert.deepEqual(group.questions.map((question) => question.options.length), [0, 0, 0, 0, 0])
assert.equal(group.questionBlankPairs.length, 5)
assert.equal(group.optionBank.options.length, 7)
assert.equal(group.optionBank.bankId, occurrence.choices.bankId)
assert.equal(new Set(group.questionBlankPairs.map((pair) => pair.questionId)).size, 5)
assert.equal(new Set(group.questionBlankPairs.map((pair) => pair.blankId)).size, 5)
assert.equal(new Set(group.optionBank.options.map((option) => option.optionId)).size, 7)
assert.equal(typeof group.semanticSignature, 'string')
assert.equal(typeof group.occurrenceSignature, 'string')

async function assertWholePaperLoaderSelections() {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-seven-loader-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerContract of [
      consumerContractRefs.screen,
      consumerContractRefs.print_pdf,
      consumerContractRefs.docx,
    ]) {
      const loaded = await loadPaperForConsumption({
        paperId: fixture.paperId,
        consumerContract,
      }, store)
      assert.equal(loaded.disposition, 'ready')
      const selection = loaded.selections.find(
        (candidate) => candidate.familyContractId === 'seven-choices',
      )
      assert.equal(selection?.mode, 'canonical')
      const loadedGroup = projectCanonicalConsumerGroup({
        consumption: loaded,
        familyContractId: 'seven-choices',
        groupId: occurrence.groupId,
      })
      assert.equal(loadedGroup.semanticSignature, group.semanticSignature)
      assert.equal(loadedGroup.occurrenceSignature, group.occurrenceSignature)
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

await assertWholePaperLoaderSelections()

function projectRejectedOccurrence(mutator) {
  const invalid = structuredClone(consumption)
  mutator(invalid.selections[0].projectedOccurrences[0])
  assert.throws(
    () => projectCanonicalConsumerGroup({
      consumption: invalid,
      familyContractId: 'seven-choices',
      groupId: occurrence.groupId,
    }),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
}

projectRejectedOccurrence((candidate) => {
  candidate.choices = {
    ownership: 'per_question',
    sets: candidate.questionBlankPairs.map(({ questionId }) => ({
      questionId,
      options: structuredClone(occurrence.choices.options),
    })),
  }
})
projectRejectedOccurrence((candidate) => {
  candidate.questionBlankPairs[0].choices =
    structuredClone(occurrence.choices.options)
})

const surface = buildCanonicalConsumptionSurfaceData({
  consumption,
  familyContractId: 'seven-choices',
  groupId: occurrence.groupId,
})
assert.equal(surface.surfaceData.questions.length, 5)
assert.equal(surface.optionBank.options.length, 7)
assert.equal(surface.questionBlankPairs.length, 5)
assert.equal(surface.semanticDigest, group.semanticSignature)
assert.equal(surface.occurrenceSignature, group.occurrenceSignature)

const asset = JSON.parse(new TextDecoder().decode(fixture.sourceAsset))
for (const selection of browserConsumption.selections) {
  if (selection.familyContractId === 'cloze') {
    selection.groupIds = Object.values(asset.content.groups)
      .filter((candidate) => candidate.groupType === 'cloze')
      .map((candidate) => candidate.groupId)
  } else if (selection.familyContractId === 'grammar-fill') {
    selection.groupIds = Object.values(asset.content.groups)
      .filter((candidate) => candidate.groupType === 'grammarFill')
      .map((candidate) => candidate.groupId)
  } else if (selection.familyContractId === 'reading') {
    selection.groupIds = Object.values(asset.content.groups)
      .filter((candidate) => candidate.groupType === 'reading')
      .map((candidate) => candidate.groupId)
  }
}
const sourceGroup = asset.content.groups[occurrence.groupId]
const repeatedBank = sourceGroup.optionBank.map((option) => ({
  label: option.label,
  content: option.text,
}))
const item = {
  detail: {
    id: occurrence.groupId,
    paperId: fixture.paperId,
    title: sourceGroup.title,
    source: asset.paper.title,
    groupType: 'seven_choices',
    passage: {
      title: sourceGroup.title,
      materialText: 'POISONED RAW MARKERS MUST NOT RENDER __1__ __2__',
    },
    questions: sourceGroup.questionIds.map((questionId) => ({
      id: questionId,
      questionNo: String(asset.content.questions[questionId].questionNo),
      stem: '',
      answer: 'teacher supplement',
      explanation: 'teacher explanation',
      options: repeatedBank,
    })),
  },
  score: 2.5,
  sectionTitle: '七选五',
  note: 'teacher group supplement',
}
const baseBlocks = [{
  type: 'question_group',
  questionGroupId: occurrence.groupId,
  score: 2.5,
}]

function count(text, pattern) {
  return (text.match(pattern) || []).length
}

function bookmarkName(kind, value) {
  return `${kind}_${createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, 24)}`
}

const persistActualArtifacts = process.argv.includes('--actual-artifacts')
const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const actualArtifactRoot = persistActualArtifacts
  ? path.resolve('.scratch/paper-canonical-ticket-07-qa', exactHead)
  : mkdtempSync(path.join(tmpdir(), 'eqb-seven-choices-rendered-'))
mkdirSync(actualArtifactRoot, { recursive: true })
const printCases = []

for (const versionType of ['student', 'teacher']) {
  for (const blocks of [
    baseBlocks,
    [{ type: 'page_break' }, ...baseBlocks, { type: 'page_break' }],
  ]) {
    const caseName =
      `${versionType}-${blocks === baseBlocks ? 'plain' : 'page-break'}`
    const html = buildPrintHtml({
      title: 'Seven Choices QA',
      versionType,
      items: [item],
      blocks,
      questionNumberStart: 36,
      printStyle: 'exam',
      canonicalConsumption: consumption,
    })
    assert.equal(count(html, /data-canonical-pair=/g), 5)
    assert.equal(count(html, /data-canonical-option-id=/g), 7)
    assert.equal(count(html, /data-canonical-bank-id=/g), 1)
    assert.equal(count(html, /class="options-(?:inline|grid|list)"/g), 0)
    assert.equal(html.includes('POISONED RAW MARKERS'), false)
    printCases.push({ caseName, html })
    writeFileSync(
      path.join(actualArtifactRoot, `print-${caseName}.html`),
      html,
    )

    const renderer = createDocxRenderer({
      groupTypeLabels: { seven_choices: '七选五' },
      optionalString: (value) => typeof value === 'string' ? value.trim() : '',
    })
    const xml = renderer.buildDocumentXml({
      title: 'Seven Choices QA',
      versionType,
      items: [item],
      blocks,
      questionNumberStart: 36,
      printStyle: 'exam',
      canonicalConsumption: consumption,
    })
    assert.equal(count(xml, /canonical_pair_/g), 5)
    assert.equal(count(xml, /canonical_option_/g), 7)
    assert.equal(count(xml, /canonical_bank_/g), 1)
    assert.equal(
      xml.includes(bookmarkName('canonical_semantic', group.semanticSignature)),
      true,
    )
    assert.equal(
      xml.includes(bookmarkName('canonical_occurrence', group.occurrenceSignature)),
      true,
    )
    assert.equal(xml.includes('POISONED RAW MARKERS'), false)
    assert.equal(
      count(xml, /A\. This capability allows for timely restoration\./g),
      1,
    )
    const docxPath = path.join(
      actualArtifactRoot,
      `docx-${caseName}.docx`,
    )
    const docxBytes = renderer.writeDocxPackage({
      documentXml: xml,
      outputPath: docxPath,
      title: 'Seven Choices QA',
    })
    assert.equal(docxBytes.subarray(0, 2).toString(), 'PK')
    assert.equal(
      execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
        encoding: 'utf8',
      }),
      xml,
    )
    if (persistActualArtifacts) {
      renderer.convertDocxToPdf(
        docxPath,
        path.join(actualArtifactRoot, `docx-${caseName}.pdf`),
      )
    }
  }
}

async function assertActualPrintPdfArtifacts() {
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  try {
    for (const printCase of printCases) {
      const page = await browser.newPage()
      await page.setContent(printCase.html, { waitUntil: 'load' })
      assert.equal(await page.locator('[data-canonical-pair]').count(), 5)
      assert.equal(await page.locator('[data-canonical-option-id]').count(), 7)
      assert.equal(await page.locator('[data-canonical-bank-id]').count(), 1)
      const pdfPath = path.join(
        actualArtifactRoot,
        `print-${printCase.caseName}.pdf`,
      )
      const pdfBytes = await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
      })
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      const pdfText = execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
        encoding: 'utf8',
      })
      for (const option of group.optionBank.options) {
        assert.equal(
          pdfText.split(option.text).length - 1,
          1,
          `actual PDF renders Option ${option.label} once`,
        )
      }
      await page.close()
    }
  } finally {
    await browser.close()
  }
}

async function assertActualPaperSurface() {
  const browserAsset = structuredClone(asset)
  browserAsset.content.groups[occurrence.groupId].passage.paragraphs = [{
    paragraphId: 'legacy-poison',
    text: 'POISONED RAW MARKERS MUST NOT RENDER __1__ __2__',
  }]
  browserAsset.content.groups[occurrence.groupId].optionBank =
    browserAsset.content.groups[occurrence.groupId].optionBank.map(
      (option) => ({ ...option, text: `LEGACY POISON ${option.label}` }),
    )
  const analysis = JSON.parse(await (await import('node:fs/promises')).readFile(
    'app/public/paper-assets/paper-2026-i/latest/analyses/seven-choices-analysis-v1.json',
    'utf8',
  ))
  const vite = await import('../app/node_modules/vite/dist/node/index.js')
  const viteServer = await vite.createServer({
    root: new URL('../app', import.meta.url).pathname,
    server: { host: '127.0.0.1', port: 0 },
  })
  await viteServer.listen()
  const appUrl = viteServer.resolvedUrls?.local?.[0]
  assert.ok(appUrl)
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  const signatures = []
  try {
    for (const { analysisCase, lecture } of [
      { analysisCase: 'valid', lecture: false },
      { analysisCase: 'valid', lecture: true },
      { analysisCase: 'missing', lecture: false },
      { analysisCase: 'missing', lecture: true },
      { analysisCase: 'wrong-schema', lecture: true },
      { analysisCase: 'stale-paper', lecture: true },
    ]) {
      const page = await browser.newPage()
      await page.route('**/api/paper-canonical/consumption?*', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(browserConsumption),
        }))
      await page.route('**/paper-assets/**/paper-asset.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(browserAsset),
        }))
      await page.route('**/paper-assets/**/analyses/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      if (analysisCase !== 'missing') {
        const responseAnalysis = structuredClone(analysis)
        if (analysisCase === 'wrong-schema') {
          responseAnalysis.schemaVersion = 'seven-choices-analysis-v0'
        } else if (analysisCase === 'stale-paper') {
          responseAnalysis.paperId = 'stale-paper-id'
        }
        await page.route('**/paper-assets/**/analyses/seven-choices-analysis-v1.json', (route) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(responseAnalysis),
          }))
      }
      await page.route('**/paper-assets/**/figures/**', (route) =>
        route.fulfill({ status: 404, body: '' }))
      const url = new URL('canonical-consumption-qa.html', appUrl)
      url.searchParams.set('paperId', fixture.paperId)
      url.searchParams.set('focusGroupId', occurrence.groupId)
      if (lecture) {
        url.searchParams.set('lecture', '1')
        url.searchParams.set('questionId', group.questions[0].questionId)
      }
      await page.goto(url.href)
      try {
        await page.locator('[data-canonical-bank-id]').waitFor({
          timeout: 10_000,
        })
      } catch (error) {
        throw new Error(
          `PaperSurface did not mount its canonical bank: ${
            await page.locator('body').innerText()
          }`,
          { cause: error },
        )
      }
      assert.equal(await page.locator('[data-canonical-pair]').count(), 5)
      assert.equal(await page.locator('[data-canonical-option-id]').count(), 7)
      assert.equal(await page.locator('[data-canonical-bank-id]').count(), 1)
      for (const pair of group.questionBlankPairs) {
        assert.equal(
          await page.locator(
            `[data-paper-question-id="${pair.questionId}"]`,
          ).count(),
          0,
        )
      }
      assert.equal(
        await page.locator('[data-canonical-bank-id]').getAttribute(
          'data-canonical-semantic-signature',
        ),
        group.semanticSignature,
      )
      assert.equal(
        await page.locator('[data-canonical-bank-id]').getAttribute(
          'data-canonical-occurrence-signature',
        ),
        group.occurrenceSignature,
      )
      signatures.push({
        semantic: await page.locator('[data-canonical-bank-id]').getAttribute(
          'data-canonical-semantic-signature',
        ),
        occurrence: await page.locator('[data-canonical-bank-id]').getAttribute(
          'data-canonical-occurrence-signature',
        ),
      })
      assert.equal((await page.locator('body').innerText()).includes('LEGACY POISON'), false)
      assert.equal((await page.locator('body').innerText()).includes('POISONED RAW MARKERS'), false)
      if (analysisCase !== 'valid' && lecture) {
        assert.equal(
          await page.getByText('解析未发布', { exact: true }).count(),
          1,
        )
      }
      if (lecture) {
        for (const pair of group.questionBlankPairs) {
          const question = group.questions.find(
            (candidate) => candidate.questionId === pair.questionId,
          )
          assert.ok(question)
          const blank = page.getByRole('button', {
            name: `聚焦第 ${question.questionNo} 题`,
            exact: true,
          })
          assert.equal(await blank.count(), 1)
          await blank.click()
          assert.equal(await blank.getAttribute('aria-pressed'), 'true')
        }
      }
      if (persistActualArtifacts) {
        const casePrefix = analysisCase === 'valid'
          ? ''
          : `${analysisCase === 'missing' ? 'no-analysis' : analysisCase}-`
        const caseName = `${casePrefix}${lecture ? 'lecture' : 'plain'}`
        writeFileSync(
          path.join(actualArtifactRoot, `papersurface-${caseName}.html`),
          await page.content(),
        )
        await page.screenshot({
          path: path.join(actualArtifactRoot, `papersurface-${caseName}.png`),
          fullPage: true,
        })
      }
      await page.close()
    }
    assert.deepEqual(
      signatures,
      Array.from({ length: 6 }, () => ({
        semantic: group.semanticSignature,
        occurrence: group.occurrenceSignature,
      })),
    )
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertActualPaperSurface()
await assertActualPrintPdfArtifacts()

if (persistActualArtifacts) {
  writeFileSync(
    path.join(actualArtifactRoot, 'artifact-manifest.json'),
    `${JSON.stringify({
      exactHead,
      paperId: fixture.paperId,
      groupId: occurrence.groupId,
      semanticSignature: group.semanticSignature,
      occurrenceSignature: group.occurrenceSignature,
      expectedAnchors: {
        questionBlankPairs: 5,
        optionAnchors: 7,
        sharedBanks: 1,
        perQuestionChoiceSets: 0,
      },
      paperSurfaceCases: [
        'plain',
        'lecture',
        'no-analysis-plain',
        'no-analysis-lecture',
        'wrong-schema-lecture',
        'stale-paper-lecture',
      ],
      artifactCases: [
        'student-plain',
        'student-page-break',
        'teacher-plain',
        'teacher-page-break',
      ],
    }, null, 2)}\n`,
  )
  writeFileSync(
    path.join(actualArtifactRoot, 'OWNER-QA-CHECKLIST.md'),
    `# Ticket 07 exact-HEAD QA artifacts

- Exact HEAD: \`${exactHead}\`
- Paper / group: \`${fixture.paperId}\` / \`${occurrence.groupId}\`
- Every PaperSurface, Print/PDF, and DOCX preview must show five numbered pair anchors (36–40), seven A–G option anchors, exactly one shared bank, and zero per-question choice sets.
- PaperSurface plain and lecture must preserve the same semantic and occurrence signatures.
- PaperSurface without the optional Seven Choices Analysis sidecar must preserve the same canonical signatures and blank-focus joins.
- PaperSurface with a wrong-schema or stale-paper Analysis sidecar must degrade to the same "解析未发布" lecture state without changing canonical signatures or blank-focus joins.
- Student and teacher artifacts must preserve the same canonical group; teacher-only supplements may appear outside it.
- Page-break artifacts must not repeat or split the shared bank.
- No artifact may display \`POISONED RAW MARKERS\` or \`LEGACY POISON\`.
- Re-run \`node scripts/verify-paper-canonical-seven-choices-rendered-behavior.mjs --actual-artifacts\` at this exact HEAD before owner QA.
`,
  )
  console.log(`ARTIFACTS ${actualArtifactRoot}`)
}
console.log('PASS Seven Choices rendered behavior')
if (!persistActualArtifacts) {
  rmSync(actualArtifactRoot, { recursive: true, force: true })
}
