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
import {
  buildCanonicalReadingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  digestJson,
  sha256,
} from '../shared/paper-canonical/stable.mjs'
import { createDocxRenderer } from '../server/exports/docxRenderer.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
} from '../server/paper-canonical/publication.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import {
  makeReadingCanonicalReferenceFixture,
} from '../test-fixtures/paper-canonical/readingReferenceFixture.mjs'

function sourceDocumentArtifactId(bytes) {
  const mediaDigest = sha256(bytes)
  return {
    mediaDigest,
    artifactId:
      `source-document:${digestJson({ sha256: mediaDigest }).slice('sha256:'.length, 28)}`,
  }
}

function makeCanonicalFigureFixture() {
  const fixture = makeReadyCanonicalFixture()
  const mediaBytes = new Uint8Array(readFileSync(new URL(
    '../app/public/paper-assets/paper-2026-i/latest/figures/reading-a-table-1.png',
    import.meta.url,
  )))
  const { mediaDigest, artifactId } = sourceDocumentArtifactId(mediaBytes)
  const group = fixture.source.groups.find(
    (candidate) => candidate.slotId === 'reading.d',
  )
  const mediaId = 'media:reading:figure-proof'
  const mediaObservationId = 'observation:reading:figure-proof'
  group.media = [{
    mediaId,
    mimeType: 'image/png',
    sha256: mediaDigest,
    pixelWidth: 1780,
    pixelHeight: 348,
    sourceArtifactRef: { artifactId },
  }]
  group.content.blocks.push({
    kind: 'figure',
    nodeId: 'figure:reading:proof',
    mediaId,
    caption: [{
      kind: 'text',
      nodeId: 'text:reading:figure-caption',
      text: 'Source-backed diagram.',
    }],
  })
  group.sourceSpanRefsByTarget = {
    [`media:${mediaId}`]: [`source-span:${mediaObservationId}`],
  }
  fixture.source.observations.push({
    observationId: mediaObservationId,
    kind: 'source_figure',
    documentInputKey: 'reading_figure',
    value: {
      mediaId,
      sha256: mediaDigest,
      pixelWidth: 1780,
      pixelHeight: 348,
    },
    span: { start: 0, end: mediaBytes.byteLength },
  })
  for (let pass = 0; pass < 3; pass += 1) {
    const mappingLength =
      new TextEncoder().encode(JSON.stringify(fixture.source)).byteLength
    for (const observation of fixture.source.observations) {
      if (observation.documentInputKey === 'questions') {
        observation.span.end = mappingLength
      }
    }
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(fixture.source))
  fixture.request.evidence.documents[0].bytes = mappingBytes
  fixture.request.evidence.documents.push({
    inputKey: 'reading_figure',
    roles: ['source_media'],
    bytes: mediaBytes,
    declared: {
      mediaType: 'image/png',
      originalName: 'reading-proof.png',
    },
  })
  fixture.sourceAsset = mappingBytes
  return fixture
}

async function publishAndLoad(fixture) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-reading-rendered-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    })
    const consumption = await loadPaperForConsumption({
      paperId: compilation.artifacts.canonicalPaper.paperPlan.paperId,
      consumerContract: consumerContractRefs.screen,
    }, createFileSystemCanonicalPublicationStore({ rootDir, db }))
    assert.equal(consumption.disposition, 'ready')
    return { compilation, consumption }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
}

function canonicalGroup(consumption, groupId) {
  return projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId,
  })
}

function exportItem(asset, groupId) {
  const group = asset.content.groups[groupId]
  return {
    detail: {
      id: groupId,
      paperId: asset.paper.paperId,
      title: group.title,
      source: asset.paper.title,
      groupType: 'reading',
      passage: {
        title: group.title,
        materialText: 'POISONED LEGACY READING MARKERS [表: fake]',
      },
      questions: group.questionIds.map((questionId) => {
        const question = asset.content.questions[questionId]
        return {
          id: questionId,
          questionNo: String(question.questionNo),
          stem: 'POISONED LEGACY STEM',
          answer: 'POISONED LEGACY ANSWER',
          explanation: 'teacher explanation supplement',
          options: [
            { label: 'A', content: 'POISONED LEGACY OPTION' },
          ],
        }
      }),
    },
    score: 2.5,
    sectionTitle: '阅读理解',
    note: '',
  }
}

function count(text, pattern) {
  return (text.match(pattern) || []).length
}

function bookmarkName(kind, value) {
  return `${kind}_${createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, 24)}`
}

function canonicalInlineNodeIds(group) {
  return [
    ...group.blocks.flatMap((block) => {
      if (block.kind === 'table') {
        return block.rows.flatMap((row) =>
          row.cells.flatMap((cell) =>
            cell.inlines.map((inline) => inline.nodeId)))
      }
      return (block.kind === 'figure'
        ? block.captionInlines
        : block.inlines).map((inline) => inline.nodeId)
    }),
    ...group.questions.flatMap((question) => [
      ...question.stemContent.map((inline) => inline.nodeId),
      ...question.options.flatMap((option) =>
        option.content.map((inline) => inline.nodeId)),
    ]),
  ]
}

function assertEachExactlyOnce(text, values, attribute) {
  for (const value of values) {
    assert.equal(
      text.split(`${attribute}="${value}"`).length - 1,
      1,
      `${attribute}=${value} occurs exactly once`,
    )
  }
}

const realFixture = makeReadingCanonicalReferenceFixture()
const real = await publishAndLoad(realFixture)
const tableGroupId = 'group-2026-i-reading-a'
const tableGroup = canonicalGroup(real.consumption, tableGroupId)
assert.equal(tableGroup.groupType, 'reading')
assert.equal(tableGroup.blocks.some((block) => block.kind === 'table'), true)
assert.equal(
  tableGroup.questions.every(
    (question) =>
      question.options.length === 4
      && typeof question.placementSignature === 'string'
      && question.options.some(
        (option) => option.optionId === question.correctOptionId,
      ),
  ),
  true,
)
const readingPlacementModes = new Set(
  real.consumption.selections
    .find((selection) => selection.familyContractId === 'reading')
    .projectedOccurrences
    .flatMap((occurrence) =>
      canonicalGroup(real.consumption, occurrence.groupId).questions)
    .map((question) => question.layoutPlan.mode),
)
assert.deepEqual(
  [...readingPlacementModes].sort(),
  ['four_columns', 'one_column', 'two_by_two'],
)
const readingSelection = real.consumption.selections.find(
  (selection) => selection.familyContractId === 'reading',
)
const oneColumnGroup = readingSelection.projectedOccurrences
  .map((occurrence) => canonicalGroup(real.consumption, occurrence.groupId))
  .find((group) =>
    group.questions.some((question) => question.layoutPlan.mode === 'one_column'))
assert.ok(oneColumnGroup)
const oneColumnQuestion = oneColumnGroup.questions.find(
  (question) => question.layoutPlan.mode === 'one_column',
)
assert.ok(oneColumnQuestion)
const oneColumnContinuationTwip =
  oneColumnQuestion.layoutPlan.placements[0].continuationStartTwip
assert.ok(Number.isInteger(oneColumnContinuationTwip))
const oneColumnContinuationPt = oneColumnContinuationTwip / 20

const figureFixture = makeCanonicalFigureFixture()
const figure = await publishAndLoad(figureFixture)
const figureSelection = figure.consumption.selections.find(
  (selection) => selection.familyContractId === 'reading',
)
const figureGroupId = figureSelection.projectedOccurrences.find(
  (occurrence) => occurrence.media?.length > 0,
)?.groupId
assert.ok(figureGroupId)
const figureGroup = canonicalGroup(figure.consumption, figureGroupId)
const figureBlock = figureGroup.blocks.find((block) => block.kind === 'figure')
assert.ok(figureBlock)
assert.equal(figureBlock.media.sha256, sha256(
  new Uint8Array(Buffer.from(figureBlock.mediaArtifact.encodedBytes, 'base64')),
))

for (const mutator of [
  (consumption) => { consumption.mediaArtifacts = [] },
  (consumption) => {
    consumption.mediaArtifacts[0].encodedBytes =
      Buffer.from('not the captured media').toString('base64')
  },
]) {
  const invalid = structuredClone(figure.consumption)
  mutator(invalid)
  assert.throws(
    () => canonicalGroup(invalid, figureGroupId),
    { code: 'CANONICAL_CONSUMPTION_REJECTED' },
  )
}

const exactHead = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim()
const persistActualArtifacts = process.argv.includes('--actual-artifacts')
const actualArtifactRoot = persistActualArtifacts
  ? path.resolve('.scratch/paper-canonical-ticket-09-qa', exactHead)
  : mkdtempSync(path.join(tmpdir(), 'eqb-reading-artifacts-'))
mkdirSync(actualArtifactRoot, { recursive: true })

const asset = JSON.parse(new TextDecoder().decode(realFixture.sourceAsset))
const item = exportItem(asset, tableGroupId)
const blocks = [{
  type: 'question_group',
  questionGroupId: tableGroupId,
  score: 2.5,
}]
const printCases = []
const deliberatelyWrongCallerSeed = 3
const tableSurfacePayload = buildCanonicalReadingConsumptionSurfaceData({
  consumption: real.consumption,
  groupId: tableGroupId,
})
assert.equal(
  JSON.stringify(tableSurfacePayload.surfaceData).includes('correctOptionId'),
  false,
)
assert.deepEqual(
  tableSurfacePayload.surfaceData.questions.map((question) =>
    question.questionNo),
  tableGroup.questions.map((question) => String(question.questionNo)),
)

for (const versionType of ['student', 'teacher']) {
  const html = buildPrintHtml({
    title: 'Canonical Reading QA',
    versionType,
    items: [item],
    blocks,
    questionNumberStart: deliberatelyWrongCallerSeed,
    printStyle: 'exam',
    canonicalConsumption: real.consumption,
  })
  assert.deepEqual(
    [...html.matchAll(/data-canonical-block-id="([^"]+)"/g)]
      .map((match) => match[1]),
    tableGroup.blocks.map((block) => block.nodeId),
  )
  assert.equal(count(html, /data-canonical-cell-id=/g), 12)
  assert.equal(count(html, /data-canonical-question-id=/g), 3)
  assert.equal(count(html, /data-canonical-option-id=/g), 12)
  assert.equal(
    count(html, /data-canonical-placement-signature=/g),
    tableGroup.questions.length,
  )
  assert.equal(html.includes('POISONED LEGACY'), false)
  assert.deepEqual(
    [...html.matchAll(/<span class="qnum">([^<]+)\.<\/span>/g)]
      .map((match) => Number(match[1])),
    tableGroup.questions.map((question) => question.questionNo),
  )
  assert.equal(
    html.includes('data-canonical-correct-option-id='),
    versionType === 'teacher',
  )
  assertEachExactlyOnce(
    html,
    canonicalInlineNodeIds(tableGroup),
    'data-canonical-content-node-id',
  )
  const officialAnswers = tableGroup.questions.map((question) =>
    question.options.find(
      (option) => option.optionId === question.correctOptionId,
    ).label)
  for (const answer of officialAnswers) {
    assert.equal(
      html.includes(`<strong>【答案】</strong>${answer}`),
      versionType === 'teacher',
    )
  }
  writeFileSync(
    path.join(actualArtifactRoot, `reading-table-${versionType}.html`),
    html,
  )
  printCases.push({ versionType, html })

  const images = []
  const renderer = createDocxRenderer({
    groupTypeLabels: { reading: '阅读理解' },
    optionalString: (value) =>
      typeof value === 'string' ? value.trim() : '',
  })
  const xml = renderer.buildDocumentXml({
    title: 'Canonical Reading QA',
    versionType,
    items: [item],
    blocks,
    questionNumberStart: deliberatelyWrongCallerSeed,
    printStyle: 'exam',
    canonicalConsumption: real.consumption,
    images,
  })
  assert.equal(xml.includes('<w:tbl>'), true)
  assert.equal(
    xml.includes(bookmarkName('canonical_semantic', tableGroup.semanticSignature)),
    true,
  )
  for (const block of tableGroup.blocks) {
    assert.equal(
      xml.includes(bookmarkName('canonical_block', block.nodeId)),
      true,
    )
  }
  for (const question of tableGroup.questions) {
    assert.equal(
      xml.includes(
        bookmarkName('canonical_question', question.questionId),
      ),
      true,
    )
    assert.equal(
      xml.includes(
        `<w:t xml:space="preserve">${question.questionNo}.  </w:t>`,
      ),
      true,
    )
    assert.equal(
      xml.includes(
        bookmarkName('canonical_placement', question.placementSignature),
      ),
      true,
    )
    for (const option of question.options) {
      assert.equal(
        xml.includes(bookmarkName('canonical_option', option.optionId)),
        true,
      )
    }
  }
  for (const nodeId of canonicalInlineNodeIds(tableGroup)) {
    assert.equal(
      xml.includes(bookmarkName('canonical_content', nodeId)),
      true,
    )
  }
  assert.equal(xml.includes('POISONED LEGACY'), false)
  const docxPath =
    path.join(actualArtifactRoot, `reading-table-${versionType}.docx`)
  const bytes = renderer.writeDocxPackage({
    documentXml: xml,
    outputPath: docxPath,
    title: 'Canonical Reading QA',
    images,
  })
  assert.equal(bytes.subarray(0, 2).toString(), 'PK')
  assert.equal(
    execFileSync('unzip', ['-p', docxPath, 'word/document.xml'], {
      encoding: 'utf8',
    }),
    xml,
  )
  if (persistActualArtifacts) {
    renderer.convertDocxToPdf(
      docxPath,
      path.join(actualArtifactRoot, `reading-table-${versionType}-docx.pdf`),
    )
  }
}

const oneColumnItem = exportItem(asset, oneColumnGroup.groupId)
const oneColumnBlocks = [{
  type: 'question_group',
  questionGroupId: oneColumnGroup.groupId,
  score: 2.5,
}]
const oneColumnHtml = buildPrintHtml({
  title: 'Canonical Reading One-column QA',
  versionType: 'student',
  items: [oneColumnItem],
  blocks: oneColumnBlocks,
  questionNumberStart: deliberatelyWrongCallerSeed,
  printStyle: 'exam',
  canonicalConsumption: real.consumption,
})
assert.equal(oneColumnHtml.includes('data-canonical-correct-option-id='), false)
assert.equal(
  oneColumnHtml.includes(
    `data-canonical-continuation-start-pt="${oneColumnContinuationPt}"`,
  ),
  true,
)
assert.equal(
  oneColumnHtml.includes(
    `style="padding-left:${oneColumnContinuationPt}pt;text-indent:-${oneColumnContinuationPt}pt"`,
  ),
  true,
)
assert.deepEqual(
  [...oneColumnHtml.matchAll(/<span class="qnum">([^<]+)\.<\/span>/g)]
    .map((match) => Number(match[1])),
  oneColumnGroup.questions.map((question) => question.questionNo),
)
assertEachExactlyOnce(
  oneColumnHtml,
  canonicalInlineNodeIds(oneColumnGroup),
  'data-canonical-content-node-id',
)
writeFileSync(
  path.join(actualArtifactRoot, 'reading-one-column-student.html'),
  oneColumnHtml,
)
printCases.push({ versionType: 'one-column-student', html: oneColumnHtml })

const oneColumnRenderer = createDocxRenderer({
  groupTypeLabels: { reading: '阅读理解' },
  optionalString: (value) =>
    typeof value === 'string' ? value.trim() : '',
})
const oneColumnXml = oneColumnRenderer.buildDocumentXml({
  title: 'Canonical Reading One-column QA',
  versionType: 'student',
  items: [oneColumnItem],
  blocks: oneColumnBlocks,
  questionNumberStart: deliberatelyWrongCallerSeed,
  printStyle: 'exam',
  canonicalConsumption: real.consumption,
  images: [],
})
const oneColumnOptionBookmark = bookmarkName(
  'canonical_option',
  oneColumnQuestion.options[0].optionId,
)
const oneColumnBookmarkIndex = oneColumnXml.indexOf(oneColumnOptionBookmark)
assert.notEqual(oneColumnBookmarkIndex, -1)
const oneColumnParagraphStart =
  oneColumnXml.lastIndexOf('<w:p>', oneColumnBookmarkIndex)
const oneColumnParagraphEnd =
  oneColumnXml.indexOf('</w:p>', oneColumnBookmarkIndex)
const oneColumnParagraph = oneColumnXml.slice(
  oneColumnParagraphStart,
  oneColumnParagraphEnd,
)
assert.equal(
  oneColumnParagraph.includes(
    `<w:ind w:left="${oneColumnContinuationTwip}" w:hanging="${oneColumnContinuationTwip}"/>`,
  ),
  true,
)
for (const question of oneColumnGroup.questions) {
  assert.equal(
    oneColumnXml.includes(
      bookmarkName('canonical_question', question.questionId),
    ),
    true,
  )
}
for (const nodeId of canonicalInlineNodeIds(oneColumnGroup)) {
  assert.equal(
    oneColumnXml.includes(bookmarkName('canonical_content', nodeId)),
    true,
  )
}
const oneColumnDocxPath =
  path.join(actualArtifactRoot, 'reading-one-column-student.docx')
oneColumnRenderer.writeDocxPackage({
  documentXml: oneColumnXml,
  outputPath: oneColumnDocxPath,
  title: 'Canonical Reading One-column QA',
  images: [],
})
if (persistActualArtifacts) {
  oneColumnRenderer.convertDocxToPdf(
    oneColumnDocxPath,
    path.join(actualArtifactRoot, 'reading-one-column-student-docx.pdf'),
  )
}

function syntheticFigureItem() {
  return {
    detail: {
      id: figureGroupId,
      paperId: figure.consumption.paperId,
      title: 'Canonical Figure',
      source: 'Canonical Figure',
      groupType: 'reading',
      passage: {
        title: 'POISONED LEGACY FIGURE',
        materialText: '〔表格：见原卷〕',
      },
      questions: figureGroup.questions.map((question) => ({
        id: question.questionId,
        questionNo: String(question.questionNo),
        stem: 'POISONED LEGACY STEM',
        answer: 'POISONED LEGACY ANSWER',
        explanation: '',
        options: [],
      })),
    },
    score: 2.5,
    sectionTitle: '阅读理解',
    note: '',
  }
}

const figureItem = syntheticFigureItem()
const figureBlocks = [{
  type: 'question_group',
  questionGroupId: figureGroupId,
  score: 2.5,
}]
const figureHtml = buildPrintHtml({
  title: 'Canonical Figure QA',
  versionType: 'student',
  items: [figureItem],
  blocks: figureBlocks,
  questionNumberStart: deliberatelyWrongCallerSeed,
  printStyle: 'exam',
  canonicalConsumption: figure.consumption,
})
assert.equal(count(figureHtml, /data-canonical-media-id=/g), 1)
assert.equal(figureHtml.includes('data:image/png;base64,'), true)
assert.equal(figureHtml.includes('〔表格：见原卷〕'), false)
assert.equal(figureHtml.includes('data-canonical-correct-option-id='), false)
writeFileSync(
  path.join(actualArtifactRoot, 'reading-figure-student.html'),
  figureHtml,
)

const figureImages = []
const figureRenderer = createDocxRenderer({
  groupTypeLabels: { reading: '阅读理解' },
  optionalString: (value) =>
    typeof value === 'string' ? value.trim() : '',
})
const figureXml = figureRenderer.buildDocumentXml({
  title: 'Canonical Figure QA',
  versionType: 'student',
  items: [figureItem],
  blocks: figureBlocks,
  questionNumberStart: deliberatelyWrongCallerSeed,
  printStyle: 'exam',
  canonicalConsumption: figure.consumption,
  images: figureImages,
})
assert.equal(figureImages.length, 1)
assert.equal(
  figureXml.includes(bookmarkName('canonical_media', figureBlock.mediaId)),
  true,
)
assert.equal(figureXml.includes('〔表格：见原卷〕'), false)
const figureDocxPath =
  path.join(actualArtifactRoot, 'reading-figure-student.docx')
figureRenderer.writeDocxPackage({
  documentXml: figureXml,
  outputPath: figureDocxPath,
  title: 'Canonical Figure QA',
  images: figureImages,
})
assert.equal(
  execFileSync('unzip', ['-l', figureDocxPath], { encoding: 'utf8' })
    .includes('word/media/image1.png'),
  true,
)
if (persistActualArtifacts) {
  figureRenderer.convertDocxToPdf(
    figureDocxPath,
    path.join(actualArtifactRoot, 'reading-figure-student-docx.pdf'),
  )
}

async function assertActualBrowserArtifacts() {
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
    for (const { label, consumption, group } of [
      { label: 'table', consumption: real.consumption, group: tableGroup },
      {
        label: 'one-column',
        consumption: real.consumption,
        group: oneColumnGroup,
      },
      { label: 'figure', consumption: figure.consumption, group: figureGroup },
    ]) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      })
      await page.route('**/qa/canonical-reading-consumption.json', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(consumption),
        }))
      const url = new URL('canonical-reading-qa.html', appUrl)
      url.searchParams.set('groupId', group.groupId)
      await page.goto(url.href)
      await page.locator('[data-canonical-reading-semantic-signature]').waitFor()
      assert.equal(
        await page.locator(
          '[data-canonical-reading-semantic-signature]',
        ).getAttribute('data-canonical-reading-semantic-signature'),
        group.semanticSignature,
      )
      assert.deepEqual(
        await page.locator('[data-canonical-block-id]').evaluateAll(
          (elements) => elements.map(
            (element) => element.getAttribute('data-canonical-block-id'),
          ),
        ),
        group.blocks.map((block) => block.nodeId),
      )
      assert.equal(
        await page.locator('[data-canonical-option-id]').count(),
        group.questions.length * 4,
      )
      assert.equal(
        await page.locator('[data-canonical-correct-option-id]').count(),
        0,
      )
      assert.deepEqual(
        await page.locator('[data-canonical-question-id]').evaluateAll(
          (elements) => elements.map(
            (element) => element.getAttribute('data-canonical-question-id'),
          ),
        ),
        group.questions.map((question) => question.questionId),
      )
      assert.deepEqual(
        (await page.locator(
          '[data-canonical-content-node-id]',
        ).evaluateAll((elements) => elements.map(
          (element) =>
            element.getAttribute('data-canonical-content-node-id'),
        ))).sort(),
        canonicalInlineNodeIds(group).sort(),
      )
      assert.deepEqual(
        await page.locator(
          '[data-canonical-placement-signature]',
        ).evaluateAll((elements) => elements.map(
          (element) =>
            element.getAttribute('data-canonical-placement-signature'),
        )),
        group.questions.map((question) => question.placementSignature),
      )
      if (label === 'table') {
        assert.equal(await page.locator('table').count(), 1)
        assert.equal(await page.locator('table td').count(), 12)
      } else if (label === 'figure') {
        assert.equal(await page.locator('figure img').count(), 1)
        assert.equal(
          (await page.locator('figure img').getAttribute('src'))
            ?.startsWith('data:image/png;base64,'),
          true,
        )
        assert.equal(
          (await page.locator('body').innerText()).includes('见原卷'),
          false,
        )
      } else {
        const option = page.locator(
          `[data-canonical-option-id="${oneColumnQuestion.options[0].optionId}"]`,
        )
        const placement = await option.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            continuation:
              element.getAttribute('data-canonical-continuation-start-pt'),
            paddingLeftPx: Number.parseFloat(style.paddingLeft),
            textIndentPx: Number.parseFloat(style.textIndent),
          }
        })
        assert.equal(
          Number(placement.continuation),
          oneColumnContinuationPt,
        )
        const expectedPx = oneColumnContinuationPt * (96 / 72)
        assert.ok(Math.abs(placement.paddingLeftPx - expectedPx) <= 96 / 72)
        assert.ok(Math.abs(placement.textIndentPx + expectedPx) <= 96 / 72)
      }
      if (persistActualArtifacts) {
        await page.screenshot({
          path: path.join(actualArtifactRoot, `screen-${label}.png`),
          fullPage: true,
        })
      }
      await page.close()
    }

    for (const printCase of [...printCases, {
      versionType: 'figure-student',
      html: figureHtml,
    }]) {
      const page = await browser.newPage()
      await page.setContent(printCase.html, { waitUntil: 'load' })
      assert.equal(
        await page.locator('[data-canonical-correct-option-id]').count(),
        printCase.versionType === 'teacher' ? tableGroup.questions.length : 0,
      )
      if (printCase.versionType === 'one-column-student') {
        const option = page.locator(
          `[data-canonical-option-id="${oneColumnQuestion.options[0].optionId}"]`,
        )
        const placement = await option.evaluate((element) => {
          const style = getComputedStyle(element)
          return {
            continuation:
              element.getAttribute('data-canonical-continuation-start-pt'),
            paddingLeftPx: Number.parseFloat(style.paddingLeft),
            textIndentPx: Number.parseFloat(style.textIndent),
          }
        })
        const expectedPx = oneColumnContinuationPt * (96 / 72)
        assert.equal(Number(placement.continuation), oneColumnContinuationPt)
        assert.ok(Math.abs(placement.paddingLeftPx - expectedPx) <= 96 / 72)
        assert.ok(Math.abs(placement.textIndentPx + expectedPx) <= 96 / 72)
      }
      const pdfPath = path.join(
        actualArtifactRoot,
        `reading-${printCase.versionType}.pdf`,
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
      assert.equal(pdfText.includes('POISONED LEGACY'), false)
      if (['student', 'teacher'].includes(printCase.versionType)) {
        assert.equal(
          pdfText.includes('Los Angeles Rams v Dallas')
            && pdfText.includes('Cowboys'),
          true,
        )
      }
      await page.close()
    }
  } finally {
    await browser.close()
    await viteServer.close()
  }
}

await assertActualBrowserArtifacts()

if (!persistActualArtifacts) {
  rmSync(actualArtifactRoot, { recursive: true, force: true })
}

console.log('PASS Reading rendered behavior')
