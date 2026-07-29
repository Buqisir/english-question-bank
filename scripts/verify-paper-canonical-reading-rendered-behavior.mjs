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
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  validateAuthorityClosure,
} from '../shared/paper-canonical/authority.mjs'
import {
  translateAbcdPlanToPointPlacement,
} from '../shared/paper-canonical/abcdLayout.mjs'
import {
  projectCanonicalConsumerGroup,
} from '../shared/paper-canonical/consumerProjection.mjs'
import {
  readingPassageLetterTypography,
} from '../shared/paper-canonical/readingPassageLetter.mjs'
import {
  buildCanonicalReadingConsumptionSurfaceData,
} from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import {
  digestJson,
  sha256,
} from '../shared/paper-canonical/stable.mjs'
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
      request: fixture.request,
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

function bookmarkId(kind, value) {
  return Number.parseInt(
    createHash('sha256').update(`${kind}:${value}`).digest('hex').slice(0, 7),
    16,
  )
}

function assertPdfStemOptionAlignment(pdfPath, group, label) {
  const bbox = execFileSync(
    'pdftotext',
    ['-bbox-layout', pdfPath, '-'],
    { encoding: 'utf8' },
  )
  const words = [...bbox.matchAll(
    /<word xMin="([^"]+)" yMin="[^"]+" xMax="[^"]+" yMax="[^"]+">([^<]+)<\/word>/g,
  )].map((match) => ({
    x: Number(match[1]),
    text: match[2],
  }))
  let cursor = 0
  for (const question of group.questions) {
    const questionIndex = words.findIndex(
      (word, index) =>
        index >= cursor && word.text === `${question.questionNo}.`,
    )
    assert.notEqual(
      questionIndex,
      -1,
      `${label} contains Plan-owned Question ${question.questionNo}`,
    )
    const stemWord = words[questionIndex + 1]
    assert.ok(stemWord, `${label} contains Question ${question.questionNo} stem`)
    const optionIndex = words.findIndex(
      (word, index) => index > questionIndex && word.text === 'A.',
    )
    assert.notEqual(
      optionIndex,
      -1,
      `${label} contains Question ${question.questionNo} Option A`,
    )
    assert.ok(
      Math.abs(stemWord.x - words[optionIndex].x) <= 1,
      `${label} Question ${question.questionNo} A. aligns with the stem-text start (${words[optionIndex].x} vs ${stemWord.x})`,
    )
    cursor = optionIndex + 1
  }
}

function assertPdfInstructionRhythm(pdfPath, group, label) {
  const rhythm = readingPassageLetterTypography.verticalRhythm.targets.printPdf
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const pageSize = /Page size:\s+([\d.]+) x ([\d.]+) pts \(A4\)/.exec(info)
  assert.ok(pageSize, `${label} declares A4`)
  assert.ok(
    Math.abs(Number(pageSize[1]) - 595.276) <= 0.5
    && Math.abs(Number(pageSize[2]) - 841.89) <= 0.5,
    `${label} is exact CSS A4`,
  )
  const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
  })
  const words = [...bbox.matchAll(
    /<word xMin="[^"]+" yMin="([^"]+)" xMax="[^"]+" yMax="([^"]+)">([^<]+)<\/word>/g,
  )].map((match) => ({
    centerY: (Number(match[1]) + Number(match[2])) / 2,
    text: match[3]
      .replace(/&#x([0-9a-f]+);/gi, (_value, codePoint) =>
        String.fromCodePoint(Number.parseInt(codePoint, 16)))
      .normalize('NFKC'),
  }))
  const marker = group.blocks[0].text.split(/\s+/).slice(0, 3)
  const markerIndex = words.findIndex((word, index) =>
    marker.every((token, tokenIndex) =>
      words[index + tokenIndex]?.text === token))
  assert.notEqual(markerIndex, -1, `${label} finds first passage line`)
  const letter = words[markerIndex - 1]
  assert.equal(letter.text, group.passageLetter)
  const instructionIndex = words.findLastIndex(
    (word, index) =>
      index < markerIndex - 1
      && word.text.includes('最佳选项'),
  )
  const instructionFirstIndex = words.findLastIndex(
    (word, index) =>
      index <= instructionIndex
      && word.text.includes('阅读下列短文'),
  )
  const sectionIndex = words.findLastIndex(
    (word, index) =>
      index < instructionFirstIndex
      && word.text.includes('阅读理解'),
  )
  assert.notEqual(instructionIndex, -1, `${label} finds instruction tail`)
  assert.notEqual(instructionFirstIndex, -1, `${label} finds instruction head`)
  assert.notEqual(sectionIndex, -1, `${label} finds Reading heading`)
  assert.ok(
    Math.abs(
      letter.centerY
      - words[instructionIndex].centerY
      - rhythm.baselineStepPt,
    ) <= rhythm.oneStepTolerancePt,
    `${label} keeps instruction_to_a 1x: ${JSON.stringify({
      actual: letter.centerY - words[instructionIndex].centerY,
      expected: rhythm.baselineStepPt,
      tolerance: rhythm.oneStepTolerancePt,
    })}`,
  )
  assert.ok(
    Math.abs(
      words[instructionFirstIndex].centerY
      - words[sectionIndex].centerY
      - rhythm.baselineStepPt,
    ) <= rhythm.oneStepTolerancePt,
    `${label} keeps chrome_internal 1x: ${JSON.stringify({
      actual:
        words[instructionFirstIndex].centerY - words[sectionIndex].centerY,
      expected: rhythm.baselineStepPt,
      tolerance: rhythm.oneStepTolerancePt,
    })}`,
  )
}

function assertPdfWrappedOptionRhythm(pdfPath, question, label) {
  const rhythm = readingPassageLetterTypography.verticalRhythm.targets.printPdf
  const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
  })
  const words = [...bbox.matchAll(
    /<word xMin="[^"]+" yMin="([^"]+)" xMax="[^"]+" yMax="([^"]+)">([^<]+)<\/word>/g,
  )].map((match) => ({
    centerY: (Number(match[1]) + Number(match[2])) / 2,
    text: match[3]
      .replace(/&#x([0-9a-f]+);/gi, (_value, codePoint) =>
        String.fromCodePoint(Number.parseInt(codePoint, 16)))
      .normalize('NFKC'),
  }))
  const questionIndex = words.findIndex(
    (word) => word.text === `${question.questionNo}.`,
  )
  assert.notEqual(questionIndex, -1, `${label} finds the exact Question stem`)
  const optionAIndex = words.findIndex(
    (word, index) => index > questionIndex && word.text === 'A.',
  )
  const optionBIndex = words.findIndex(
    (word, index) => index > optionAIndex && word.text === 'B.',
  )
  assert.notEqual(optionAIndex, -1, `${label} finds Option A`)
  assert.notEqual(optionBIndex, -1, `${label} finds Option B`)
  const optionAText = question.options[0].content
    .map((inline) => inline.text)
    .join('')
    .normalize('NFKC')
  const extractedText = words
    .slice(optionAIndex + 1, optionBIndex)
    .map((word) => word.text)
    .join(' ')
  assert.equal(
    optionAText.split(/\s+/).every((token) => extractedText.includes(token)),
    true,
    `${label} binds the wrapped lines to exact Option A text`,
  )
  const lines = words
    .slice(optionAIndex, optionBIndex)
    .map((word) => word.centerY)
    .sort((left, right) => left - right)
    .reduce((centers, center) => {
      if (
        centers.at(-1) === undefined
        || Math.abs(center - centers.at(-1)) > 1
      ) {
        centers.push(center)
      }
      return centers
    }, [])
  assert.equal(lines.length >= 2, true, `${label} wraps Option A`)
  for (let index = 1; index < lines.length; index += 1) {
    assert.ok(
      Math.abs(
        lines[index] - lines[index - 1] - rhythm.baselineStepPt,
      ) <= rhythm.oneStepTolerancePt,
      `${label} keeps wrapped option line-height 1x`,
    )
  }
}

function assertPdfTwoLineStemRhythm(pdfPath, question, label) {
  const rhythm = readingPassageLetterTypography.verticalRhythm.targets.printPdf
  const bbox = execFileSync('pdftotext', ['-bbox', pdfPath, '-'], {
    encoding: 'utf8',
  })
  const words = [...bbox.matchAll(
    /<word xMin="[^"]+" yMin="([^"]+)" xMax="[^"]+" yMax="([^"]+)">([^<]+)<\/word>/g,
  )].map((match) => ({
    centerY: (Number(match[1]) + Number(match[2])) / 2,
    text: match[3]
      .replace(/&#x([0-9a-f]+);/gi, (_value, codePoint) =>
        String.fromCodePoint(Number.parseInt(codePoint, 16)))
      .normalize('NFKC'),
  }))
  const questionIndex = words.findIndex(
    (word) => word.text === `${question.questionNo}.`,
  )
  const optionAIndex = words.findIndex(
    (word, index) => index > questionIndex && word.text === 'A.',
  )
  assert.notEqual(questionIndex, -1, `${label} finds the exact Question stem`)
  assert.notEqual(optionAIndex, -1, `${label} finds Option A after the stem`)
  const stemText = question.stemContent
    .map((inline) => inline.text)
    .join('')
    .normalize('NFKC')
  const extractedText = words
    .slice(questionIndex + 1, optionAIndex)
    .map((word) => word.text)
    .join(' ')
  assert.equal(
    stemText.split(/\s+/).every((token) => extractedText.includes(token)),
    true,
    `${label} binds both lines to the exact stem text`,
  )
  const lines = words
    .slice(questionIndex, optionAIndex)
    .map((word) => word.centerY)
    .sort((left, right) => left - right)
    .reduce((centers, center) => {
      if (
        centers.at(-1) === undefined
        || Math.abs(center - centers.at(-1)) > 1
      ) {
        centers.push(center)
      }
      return centers
    }, [])
  assert.equal(lines.length, 2, `${label} renders a two-line stem`)
  assert.ok(
    Math.abs(lines[1] - lines[0] - rhythm.baselineStepPt)
      <= rhythm.oneStepTolerancePt,
    `${label} keeps two-line stem line-height 1x`,
  )
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
assert.deepEqual(
  readingSelection.projectedOccurrences.map((occurrence) => occurrence.slotId),
  ['reading.a', 'reading.b', 'reading.c', 'reading.d'],
)
assert.deepEqual(
  readingSelection.projectedOccurrences.map((occurrence) =>
    canonicalGroup(real.consumption, occurrence.groupId).passageLetter),
  ['A', 'B', 'C', 'D'],
)
{
  const authority = resolveCanonicalAuthority(canonicalAuthorityRef).closure
  const artifacts = {
    ...authority.artifacts,
    'renderer-typography': structuredClone(
      authority.artifacts['renderer-typography'],
    ),
  }
  artifacts['renderer-typography'].readingPassageLetters
    .slotIdentity[0].letter = 'D'
  const manifest = structuredClone(authority.manifest)
  manifest.artifacts.find(
    ({ id }) => id === 'renderer-typography',
  ).sha256 = digestJson(artifacts['renderer-typography'])
  assert.equal(
    validateAuthorityClosure({
      manifest,
      artifacts,
      schemas: authority.schemas,
    }).issues.some(({ code }) =>
      code === 'RENDERER_READING_PASSAGE_LETTERS_INVALID'),
    true,
    'a re-digested renderer artifact cannot remap Reading slot identity',
  )
}
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
const questionStemStartPt = translateAbcdPlanToPointPlacement(
  oneColumnQuestion.layoutPlan,
).questionStemStartPt
assert.equal(questionStemStartPt, 21)
const questionStemStartTwip = questionStemStartPt * 20

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
assert.equal(tableSurfacePayload.passageLetter, 'A')
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
  assert.equal(
    count(html, /data-canonical-passage-letter="A"/g),
    1,
  )
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


}

for (const versionType of ['student', 'teacher']) {
  const tableCase = printCases.find(
    (candidate) => candidate.versionType === versionType,
  )
  const html = tableCase.html.replace(
    '</style>',
    `[data-canonical-question-id="${tableGroup.questions[0].questionId}"] .canonical-stem-text{display:block;max-width:270pt}</style>`,
  )
  const variant = `two-line-stem-${versionType}`
  writeFileSync(
    path.join(actualArtifactRoot, `reading-${variant}.html`),
    html,
  )
  printCases.push({ versionType: variant, html })
}

const instructionText =
  '阅读下列短文，从每题所给的 A、B、C、D 四个选项中选出最佳选项。'
for (const versionType of ['student', 'teacher']) {
  const html = buildPrintHtml({
    title: 'Canonical Reading Instruction QA',
    versionType,
    items: [item],
    blocks: [
      { type: 'section_header', title: '第一部分 阅读理解' },
      { type: 'instruction', text: instructionText },
      ...blocks,
    ],
    questionNumberStart: deliberatelyWrongCallerSeed,
    printStyle: 'exam',
    canonicalConsumption: real.consumption,
  })
  assert.equal(
    count(html, /data-canonical-reading-rhythm-role="meta_instruction"/g),
    1,
  )
  assert.equal(
    html.includes(
      'data-canonical-reading-preceding-for="group-2026-i-reading-a"'
      + ' data-canonical-reading-preceding-kind="reading_heading"'
      + ' data-canonical-reading-anchor-id="print-instruction-1"',
    ),
    true,
  )
  writeFileSync(
    path.join(
      actualArtifactRoot,
      `reading-instruction-present-${versionType}.html`,
    ),
    html,
  )
  printCases.push({
    versionType: `instruction-present-${versionType}`,
    html,
  })
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
const wrappedOneColumnHtml = oneColumnHtml.replace(
  '</style>',
  '.canonical-options--one_column{width:180pt!important;grid-template-columns:180pt!important}</style>',
)
writeFileSync(
  path.join(actualArtifactRoot, 'reading-wrapped-one-column-student.html'),
  wrappedOneColumnHtml,
)
printCases.push({
  versionType: 'wrapped-one-column-student',
  html: wrappedOneColumnHtml,
})


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
      for (const question of group.questions) {
        const questionElement = page.locator(
          `[data-canonical-question-id="${question.questionId}"]`,
        )
        const stemX = await questionElement.locator(
          '.ps-question-stem [data-canonical-content-node-id]',
        ).first().evaluate((element) => element.getBoundingClientRect().x)
        const questionGeometry = await questionElement.evaluate((element) => ({
          questionX: element.getBoundingClientRect().x,
          buttonX: element.querySelector('.ps-question-stem-button')
            ?.getBoundingClientRect().x,
        }))
        const optionGeometry = await questionElement.locator(
          `[data-canonical-option-id="${question.options[0].optionId}"] .ps-option-label`,
        ).evaluate((element) => ({
          labelX: element.getBoundingClientRect().x,
          optionX: element.parentElement?.getBoundingClientRect().x,
          listX: element.parentElement?.parentElement?.getBoundingClientRect().x,
        }))
        const optionLabelX = optionGeometry.labelX
        assert.ok(
          Math.abs(stemX - optionLabelX) <= 96 / 72,
          `Screen ${question.questionId} A. aligns with the stem-text start (${JSON.stringify({ optionGeometry, questionGeometry })} vs ${stemX})`,
        )
      }
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
        printCase.versionType.includes('teacher')
          ? tableGroup.questions.length
          : 0,
      )
      if (printCase.versionType.startsWith('instruction-present-')) {
        const rhythm = await page.evaluate(() => {
          const bottom = (selector) => {
            const element = document.querySelector(selector)
            const range = document.createRange()
            range.selectNodeContents(element)
            return Math.max(
              ...[...range.getClientRects()].map((rect) => rect.bottom),
            )
          }
          return {
            section: bottom(
              '[data-canonical-reading-rhythm-role="part_title"]',
            ),
            instruction: bottom(
              '[data-canonical-reading-rhythm-role="meta_instruction"]',
            ),
            letter: bottom(
              '[data-canonical-reading-rhythm-role="passage_letter"]',
            ),
          }
        })
        assert.ok(
          Math.abs(rhythm.instruction - rhythm.section - 24) <= 1.25,
          `Print instruction fixture keeps chrome_internal 1x: ${JSON.stringify(rhythm)}`,
        )
        assert.ok(
          Math.abs(rhythm.letter - rhythm.instruction - 24) <= 1.25,
          `Print instruction fixture keeps chrome_to_a 1x: ${JSON.stringify(rhythm)}`,
        )
      }
      if (
        ['one-column-student', 'wrapped-one-column-student'].includes(
          printCase.versionType,
        )
      ) {
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
        if (printCase.versionType === 'wrapped-one-column-student') {
          const lineCount = await option.evaluate((element) => {
            const range = document.createRange()
            range.selectNodeContents(element)
            return [...range.getClientRects()]
              .map((rect) => rect.bottom)
              .sort((left, right) => left - right)
              .reduce((lines, bottom) => {
                if (
                  lines.at(-1) === undefined
                  || Math.abs(bottom - lines.at(-1)) > 1
                ) {
                  lines.push(bottom)
                }
                return lines
              }, []).length
          })
          assert.equal(
            lineCount >= 2,
            true,
            'Print HTML executes a wrapped one-column option',
          )
        }
      }
      if (printCase.versionType.startsWith('two-line-stem-')) {
        const lineCount = await page.locator(
          `[data-canonical-question-id="${tableGroup.questions[0].questionId}"] [data-canonical-reading-rhythm-role="question_stem_line"]`,
        ).evaluate((element) => {
          const walker = document.createTreeWalker(
            element,
            NodeFilter.SHOW_TEXT,
          )
          const bottoms = []
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            bottoms.push(
              ...[...range.getClientRects()].map((rect) => rect.bottom),
            )
          }
          return bottoms
            .sort((left, right) => left - right)
            .reduce((lines, bottom) => {
              if (
                lines.at(-1) === undefined
                || Math.abs(bottom - lines.at(-1)) > 1
              ) {
                lines.push(bottom)
              }
              return lines
            }, []).length
        })
        assert.equal(lineCount, 2, 'Print HTML executes a two-line stem')
      }
      if (
        [
          'student',
          'teacher',
          'one-column-student',
          'wrapped-one-column-student',
        ].includes(
          printCase.versionType,
        )
        || printCase.versionType.startsWith('instruction-present-')
        || printCase.versionType.startsWith('two-line-stem-')
      ) {
        const expectedGroup = printCase.versionType.includes(
          'one-column-student',
        )
          ? oneColumnGroup
          : tableGroup
        for (const question of expectedGroup.questions) {
          const questionElement = page.locator(
            `[data-canonical-question-id="${question.questionId}"]`,
          )
          const stemX = await questionElement.locator(
            '.stem [data-canonical-content-node-id]',
          ).first().evaluate((element) => element.getBoundingClientRect().x)
          const optionLabelX = await questionElement.locator(
            `[data-canonical-option-id="${question.options[0].optionId}"] > span`,
          ).first().evaluate((element) => element.getBoundingClientRect().x)
          assert.ok(
            Math.abs(stemX - optionLabelX) <= 96 / 72,
            `Print ${question.questionId} A. aligns with the stem-text start (${optionLabelX} vs ${stemX})`,
          )
        }
      }
      const pdfPath = path.join(
        actualArtifactRoot,
        `reading-${printCase.versionType}.pdf`,
      )
      const pdfBytes = await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
      })
      assert.equal(pdfBytes.subarray(0, 4).toString(), '%PDF')
      if (
        [
          'student',
          'teacher',
          'one-column-student',
          'wrapped-one-column-student',
        ].includes(
          printCase.versionType,
        )
        || printCase.versionType.startsWith('instruction-present-')
      ) {
        assertPdfStemOptionAlignment(
          pdfPath,
          printCase.versionType.includes('one-column-student')
            ? oneColumnGroup
            : tableGroup,
          `Print/PDF ${printCase.versionType}`,
        )
      }
      if (printCase.versionType.startsWith('instruction-present-')) {
        assertPdfInstructionRhythm(
          pdfPath,
          tableGroup,
          `Print/PDF ${printCase.versionType}`,
        )
      }
      if (printCase.versionType === 'wrapped-one-column-student') {
        assertPdfWrappedOptionRhythm(
          pdfPath,
          oneColumnQuestion,
          'Print/PDF wrapped-one-column-student',
        )
      }
      if (printCase.versionType.startsWith('two-line-stem-')) {
        assertPdfTwoLineStemRhythm(
          pdfPath,
          tableGroup.questions[0],
          `Print/PDF ${printCase.versionType}`,
        )
      }
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

    const rejectedPage = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    })
    await rejectedPage.route(
      '**/qa/canonical-reading-consumption.json',
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(real.consumption),
        }),
    )
    const rejectedUrl = new URL('canonical-reading-qa.html', appUrl)
    rejectedUrl.searchParams.set('groupId', tableGroup.groupId)
    rejectedUrl.searchParams.set('invalidCompanion', 'missing-letter')
    const pageError = rejectedPage.waitForEvent('pageerror')
    await rejectedPage.goto(rejectedUrl.href)
    assert.match(
      (await pageError).message,
      /Canonical Reading blocks and passage letter must be provided together/,
      'PaperSurface fails closed when canonical Reading blocks lose their passage letter',
    )
    assert.equal(
      await rejectedPage.locator('[data-canonical-block-id]').count(),
      0,
      'PaperSurface emits no partial canonical Reading artifact after companion rejection',
    )
    await rejectedPage.close()
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
