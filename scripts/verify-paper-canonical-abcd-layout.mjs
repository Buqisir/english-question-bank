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

import {
  layoutAbcdOptionSet,
  translateAbcdPlanToDocx,
  translateAbcdPlanToPaperSurface,
  translateAbcdPlanToPrintPdf,
} from '../shared/paper-canonical/abcdLayout.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

function optionSet(questionId, texts) {
  return {
    owner: 'question',
    questionId,
    options: texts.map((text, index) => ({
      optionId: `option:${questionId}:${'ABCD'[index]}`,
      label: 'ABCD'[index],
      content: [{ kind: 'text', nodeId: `text:${questionId}:${index}`, text }],
    })),
  }
}

const gold = [
  ['q21', ['Small bird', 'Blue lake', 'Old bridge', 'New road'], 'four_columns'],
  [
    'q22',
    [
      'A deliberately extended answer choice that must use the full line',
      'Another deliberately extended answer choice that cannot fit a dense track',
      'A third deliberately extended answer choice for the accepted gold boundary',
      'The final deliberately extended answer choice keeps the whole set together',
    ],
    'one_column',
  ],
  [
    'q23',
    [
      'A medium answer choice',
      'Another medium answer choice',
      'The third medium answer',
      'The fourth medium answer',
    ],
    'two_by_two',
  ],
]

for (const [questionId, texts, expectedMode] of gold) {
  const result = layoutAbcdOptionSet(optionSet(questionId, texts))
  assert.equal(result.status, 'selected')
  assert.equal(result.mode, expectedMode)
  assert.deepEqual(result.placements.map(({ label }) => label), ['A', 'B', 'C', 'D'])
  assert.match(result.rulesetRef.digest, /^sha256:[0-9a-f]{64}$/)
  assert.match(result.rulesetRef.shapingImplementationDigest, /^sha256:[0-9a-f]{64}$/)
  assert.match(result.rulesetRef.fontMetricsDigest, /^sha256:[0-9a-f]{64}$/)
}

const unbreakable = layoutAbcdOptionSet(
  optionSet('overflow', ['short', 'short', 'short', 'x'.repeat(500)]),
)
assert.deepEqual(unbreakable, {
  status: 'needs_review',
  reason: 'one_column_contains_unrenderable_unbreakable_content',
})

const hardBreak = layoutAbcdOptionSet(
  optionSet('hard-break', ['first\nsecond', 'short', 'short', 'short']),
)
assert.equal(hardBreak.status, 'selected')
assert.equal(hardBreak.mode, 'one_column')
assert.equal(hardBreak.placements[0].hardBreaks, 1)
assert.equal(hardBreak.placements[0].renderedText, 'A. first\nsecond')

const plan = layoutAbcdOptionSet(optionSet('parity', gold[2][1]))
const translations = [
  translateAbcdPlanToPaperSurface(plan),
  translateAbcdPlanToPrintPdf(plan),
  translateAbcdPlanToDocx(plan),
]
assert.equal(translations.every(({ placementSignature }) =>
  placementSignature === translations[0].placementSignature), true)
assert.equal(translations.every(({ shrinkToFit }) => shrinkToFit === false), true)
assert.equal(translations.every(({ clipping }) => clipping === 'forbidden'), true)

const wrappable = layoutAbcdOptionSet(
  optionSet('wrappable', [
    Array.from({ length: 90 }, () => 'word').join(' '),
    'short',
    'short',
    'short',
  ]),
)
assert.equal(wrappable.status, 'selected')
assert.equal(wrappable.mode, 'one_column')
assert.deepEqual(
  layoutAbcdOptionSet({
    owner: 'shared_bank',
    options: optionSet('bank', ['a', 'b', 'c', 'd']).options,
  }),
  {
    status: 'not_applicable',
    reason: 'selector_requires_one_question_owned_A_B_C_D_set',
  },
)

const referenceCompilation = compileCanonicalPaper(
  makeClozeGrammarCanonicalReferenceFixture().request,
)
const canonicalBeforeLayout = structuredClone(
  referenceCompilation.artifacts.canonicalPaper,
)
const cloze = referenceCompilation.artifacts.canonicalPaper.questionGroups
  .find((group) => group.variant.family === 'cloze')
const clozePlans = cloze.variant.choiceOwnership.sets.map((set) =>
  layoutAbcdOptionSet({ owner: 'question', ...set }))
assert.equal(clozePlans.length, 15)
assert.equal(clozePlans.every((result) =>
  result.status === 'selected' && result.mode === 'four_columns'), true)
assert.deepEqual(
  referenceCompilation.artifacts.canonicalPaper,
  canonicalBeforeLayout,
  'renderer layout does not mutate canonical semantics or semantic digests',
)

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function rowsFor(translation) {
  const rows = new Map()
  for (const placement of translation.placements) {
    const row = rows.get(placement.row) || []
    row.push(placement)
    rows.set(placement.row, row)
  }
  return [...rows.values()]
}

function htmlFor(translation) {
  const rowHeightPt = 18
  return `<!doctype html><meta charset="utf-8"><style>
    @page { size: A4; margin: 24mm; }
    body { margin: 0; font-family: "Times New Roman", Times, serif; font-size: 10.5pt; }
    .set { position: relative; width: ${translation.rowWidthPt}pt; height: ${rowsFor(translation).length * rowHeightPt}pt; }
    .option { position: absolute; white-space: ${translation.denseWhiteSpace}; line-height: 18pt; }
  </style><div class="set">${translation.placements.map((placement) =>
    `<span class="option" data-label="${placement.label}" style="left:${placement.startPt}pt;top:${placement.row * rowHeightPt}pt">${placement.label}.</span>`).join('')}</div>`
}

function docxDocumentXml(translation) {
  const body = translation.paragraphs.map((paragraph) => {
    const tabs = paragraph.placements
      .filter(({ startTwip }) => startTwip > 0)
      .map(({ startTwip }) =>
        `<w:tab w:val="left" w:pos="${420 + startTwip}"/>`)
      .join('')
    const properties = translation.mode === 'one_column'
      ? '<w:ind w:left="840" w:hanging="420"/><w:tabs><w:tab w:val="left" w:pos="840"/></w:tabs>'
      : `<w:ind w:left="420"/>${tabs ? `<w:tabs>${tabs}</w:tabs>` : ''}`
    const runs = paragraph.placements.map((placement, index) =>
      `${index > 0 || translation.mode === 'one_column' ? '<w:r><w:tab/></w:r>' : ''}<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="21"/></w:rPr><w:t>${escapeXml(`${placement.label}.`)}</w:t></w:r>`).join('')
    return `<w:p><w:pPr>${properties}<w:spacing w:line="360" w:lineRule="exact"/></w:pPr>${runs}</w:p>`
  }).join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1191" w:right="1361" w:bottom="1191" w:left="1361"/></w:sectPr></w:body></w:document>`
}

function writeDocx(root, name, translation) {
  const packageDir = path.join(root, `${name}-package`)
  mkdirSync(path.join(packageDir, '_rels'), { recursive: true })
  mkdirSync(path.join(packageDir, 'word'), { recursive: true })
  writeFileSync(path.join(packageDir, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`)
  writeFileSync(path.join(packageDir, '_rels/.rels'), `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`)
  writeFileSync(path.join(packageDir, 'word/document.xml'), docxDocumentXml(translation))
  const docxPath = path.join(root, `${name}.docx`)
  execFileSync('zip', ['-X', '-q', '-r', docxPath, '.'], { cwd: packageDir })
  return docxPath
}

function pdfWords(pdfPath, outputRoot) {
  const bboxPath = path.join(outputRoot, `${path.basename(pdfPath)}.bbox.html`)
  execFileSync('pdftotext', ['-bbox', pdfPath, bboxPath])
  const source = readFileSync(bboxPath, 'utf8')
  return [...source.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([A-D])\.<\/word>/g)]
    .map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
      label: match[5],
    }))
}

function assertPhysicalPlacement(placements, actualWords, label, rowWidthPt = 438.2) {
  assert.equal(actualWords.length, placements.length, `${label}: all four labels render`)
  const baseXByRow = new Map()
  placements.forEach((placement, index) => {
    const actual = actualWords[index]
    const prior = baseXByRow.get(placement.row)
    if (prior === undefined || actual.x < prior) baseXByRow.set(placement.row, actual.x)
  })
  placements.forEach((placement, index) => {
    const actual = actualWords[index]
    assert.equal(actual.label, placement.label, `${label}: row-major label order`)
    const relativeX = actual.x - baseXByRow.get(placement.row)
    assert.equal(
      Math.abs(relativeX - placement.startTwip / 20) <= 1,
      true,
      `${label}: ${placement.label} stays within 1pt`,
    )
    assert.equal(
      actual.xMax - baseXByRow.get(placement.row) <= rowWidthPt + 1,
      true,
      `${label}: ${placement.label} is not clipped`,
    )
  })
  for (const row of new Set(placements.map(({ row }) => row))) {
    const rowWords = actualWords.filter((_, index) => placements[index].row === row)
    assert.equal(
      Math.max(...rowWords.map(({ y }) => y)) - Math.min(...rowWords.map(({ y }) => y)) <= 0.5,
      true,
      `${label}: dense row does not wrap`,
    )
  }
}

function assertSameColumnSpread(placements, actualWords, label) {
  for (const optionLabel of ['A', 'B', 'C', 'D']) {
    const positions = actualWords
      .filter((_, index) => placements[index].label === optionLabel)
      .map(({ x }) => x)
    assert.equal(positions.length, 15, `${label}: all ${optionLabel} labels render`)
    assert.equal(
      Math.max(...positions) - Math.min(...positions) <= 0.5,
      true,
      `${label}: ${optionLabel} same-column spread stays within 0.5pt`,
    )
  }
}

async function verifyActualArtifacts() {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'eqb-abcd-artifacts-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  try {
    for (const [questionId, texts] of gold) {
      const selected = layoutAbcdOptionSet(optionSet(questionId, texts))
      const screen = translateAbcdPlanToPaperSurface(selected)
      const print = translateAbcdPlanToPrintPdf(selected)
      const docx = translateAbcdPlanToDocx(selected)
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
      await page.setContent(htmlFor(screen))
      const screenPositions = await page.locator('.option').evaluateAll((nodes) => {
        const root = document.querySelector('.set').getBoundingClientRect()
        return nodes.map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            label: node.dataset.label,
            x: (rect.x - root.x) * 72 / 96,
            y: (rect.y - root.y) * 72 / 96,
            xMax: (rect.right - root.x) * 72 / 96,
            yMax: (rect.bottom - root.y) * 72 / 96,
          }
        })
      })
      assertPhysicalPlacement(selected.placements, screenPositions, `${questionId} PaperSurface`)
      const screenshot = await page.screenshot()
      assert.equal(screenshot.subarray(1, 4).toString(), 'PNG')

      await page.setContent(htmlFor(print))
      const pdfPath = path.join(outputRoot, `${questionId}-print.pdf`)
      writeFileSync(pdfPath, await page.pdf({ format: 'A4', printBackground: true }))
      assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
      assertPhysicalPlacement(
        selected.placements,
        pdfWords(pdfPath, outputRoot),
        `${questionId} Print/PDF`,
      )
      await page.close()

      const docxPath = writeDocx(outputRoot, questionId, docx)
      assert.equal(readFileSync(docxPath).subarray(0, 2).toString(), 'PK')
      execFileSync('soffice', [
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        outputRoot,
        docxPath,
      ], { stdio: 'pipe' })
      const docxPdfPath = path.join(outputRoot, `${questionId}.pdf`)
      assert.equal(readFileSync(docxPdfPath).subarray(0, 4).toString(), '%PDF')
      assertPhysicalPlacement(
        selected.placements,
        pdfWords(docxPdfPath, outputRoot),
        `${questionId} DOCX`,
      )
    }

    const clozeScreen = {
      ...translateAbcdPlanToPaperSurface(clozePlans[0]),
      placements: clozePlans.flatMap((selected, row) =>
        translateAbcdPlanToPaperSurface(selected).placements.map((placement) => ({
          ...placement,
          row,
        }))),
    }
    const clozePrint = {
      ...translateAbcdPlanToPrintPdf(clozePlans[0]),
      placements: clozePlans.flatMap((selected, row) =>
        translateAbcdPlanToPrintPdf(selected).placements.map((placement) => ({
          ...placement,
          row,
        }))),
    }
    const clozeDocx = {
      ...translateAbcdPlanToDocx(clozePlans[0]),
      paragraphs: clozePlans.flatMap((selected) =>
        translateAbcdPlanToDocx(selected).paragraphs),
    }
    const clozePlacements = clozePlans.flatMap((selected, row) =>
      selected.placements.map((placement) => ({
        ...placement,
        row,
      })))

    const clozePage = await browser.newPage({ viewport: { width: 1000, height: 1200 } })
    await clozePage.setContent(htmlFor(clozeScreen))
    const clozeScreenWords = await clozePage.locator('.option').evaluateAll((nodes) => {
      const root = document.querySelector('.set').getBoundingClientRect()
      return nodes.map((node) => {
        const rect = node.getBoundingClientRect()
        return {
          label: node.dataset.label,
          x: (rect.x - root.x) * 72 / 96,
          y: (rect.y - root.y) * 72 / 96,
          xMax: (rect.right - root.x) * 72 / 96,
          yMax: (rect.bottom - root.y) * 72 / 96,
        }
      })
    })
    assertPhysicalPlacement(clozePlacements, clozeScreenWords, 'Cloze PaperSurface')
    assertSameColumnSpread(clozePlacements, clozeScreenWords, 'Cloze PaperSurface')

    await clozePage.setContent(htmlFor(clozePrint))
    const clozePrintPdf = path.join(outputRoot, 'cloze-print.pdf')
    writeFileSync(clozePrintPdf, await clozePage.pdf({ format: 'A4', printBackground: true }))
    const clozePrintWords = pdfWords(clozePrintPdf, outputRoot)
    assertPhysicalPlacement(clozePlacements, clozePrintWords, 'Cloze Print/PDF')
    assertSameColumnSpread(clozePlacements, clozePrintWords, 'Cloze Print/PDF')
    await clozePage.close()

    const clozeDocxPath = writeDocx(outputRoot, 'cloze-docx', clozeDocx)
    execFileSync('soffice', [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      outputRoot,
      clozeDocxPath,
    ], { stdio: 'pipe' })
    const clozeDocxWords = pdfWords(path.join(outputRoot, 'cloze-docx.pdf'), outputRoot)
    assertPhysicalPlacement(clozePlacements, clozeDocxWords, 'Cloze DOCX')
    assertSameColumnSpread(clozePlacements, clozeDocxWords, 'Cloze DOCX')
  } finally {
    await browser.close()
    rmSync(outputRoot, { recursive: true, force: true })
  }
}

if (process.argv.includes('--actual-artifacts')) await verifyActualArtifacts()

console.log(`PASS paper canonical shared A-D layout${process.argv.includes('--actual-artifacts') ? ' actual artifacts' : ''}`)
