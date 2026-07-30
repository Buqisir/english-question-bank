#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  abcdLayoutRules,
  abcdPlacementSignature,
  expectedAbcdRendererFontClosure,
  layoutAbcdOptionSet,
  layoutFixedFourColumnClozeOptionSet,
  resolveAbcdRendererFontClosure,
  translateAbcdPlanToPaperSurface,
  translateAbcdPlanToPointPlacement,
  translateAbcdPlanToPrintPdf,
} from '../shared/paper-canonical/abcdLayout.mjs'
import {
  canonicalAuthorityRef,
  resolveCanonicalAuthority,
  validateAuthorityClosure,
} from '../shared/paper-canonical/authority.mjs'
import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { digestJson } from '../shared/paper-canonical/stable.mjs'
import { abcdLayoutReferenceFixture } from '../test-fixtures/paper-canonical/abcdLayoutReferenceFixture.mjs'
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

function sha256File(filePath) {
  return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`
}

for (const sourceImage of abcdLayoutReferenceFixture.sourceImages) {
  assert.equal(
    sha256File(sourceImage.path),
    sourceImage.sha256,
    `accepted visual reference stays hash-bound: ${sourceImage.path}`,
  )
}

const gold = abcdLayoutReferenceFixture.cases
for (const fixture of gold) {
  const result = layoutAbcdOptionSet(optionSet(fixture.questionId, fixture.redactedText))
  assert.equal(result.status, 'selected')
  assert.equal(result.mode, fixture.expectedMode)
  result.placements.forEach((placement, index) => {
    assert.equal(
      Math.abs(placement.advanceTwip - fixture.expectedAdvanceTwip[index]) <= 20,
      true,
      `${fixture.questionId} redacted proxy remains within 1pt of accepted measurement`,
    )
  })
  assert.deepEqual(result.placements.map(({ label }) => label), ['A', 'B', 'C', 'D'])
  assert.match(result.rulesetRef.digest, /^sha256:[0-9a-f]{64}$/)
  assert.match(result.rulesetRef.shapingImplementationDigest, /^sha256:[0-9a-f]{64}$/)
  assert.match(result.rulesetRef.fontMetricsDigest, /^sha256:[0-9a-f]{64}$/)
}

assert.deepEqual(
  resolveAbcdRendererFontClosure({
    primary: {
      fontFaceId: expectedAbcdRendererFontClosure.primary.fontFaceId,
      fontVersion: expectedAbcdRendererFontClosure.primary.fontVersion,
      fontBytes: new Uint8Array([0]),
    },
    fallbacks: [],
    fontMetricsDigest: expectedAbcdRendererFontClosure.fontMetricsDigest,
    shapingImplementationDigest:
      expectedAbcdRendererFontClosure.shapingImplementationDigest,
  }),
  {
    status: 'needs_review',
    reason: 'pinned_renderer_font_closure_unavailable',
  },
)

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

const plan = layoutAbcdOptionSet(optionSet('parity', gold[2].redactedText))
const authority = resolveCanonicalAuthority(canonicalAuthorityRef).closure
const rendererTypography = authority.artifacts['renderer-typography']
const authoritativeOuterOriginTwip =
  rendererTypography.coordinates.questionStemAndOuterOptionBlockStartTwip
function validateRedigestedOuterOrigin(questionStemStartTwip) {
  const artifacts = {
    ...authority.artifacts,
    'renderer-typography': structuredClone(rendererTypography),
  }
  artifacts[
    'renderer-typography'
  ].coordinates.questionStemAndOuterOptionBlockStartTwip = questionStemStartTwip
  const manifest = structuredClone(authority.manifest)
  manifest.artifacts.find(
    ({ id }) => id === 'renderer-typography',
  ).sha256 = digestJson(artifacts['renderer-typography'])
  return validateAuthorityClosure({
    manifest,
    artifacts,
    schemas: authority.schemas,
  })
}

const fractionalOuterOriginValidation = validateRedigestedOuterOrigin(420.5)
assert.equal(
  fractionalOuterOriginValidation.issues.some(
    ({ code, path }) =>
      code === 'SCHEMA_TYPE'
      && path === '$.artifacts.renderer-typography.coordinates.questionStemAndOuterOptionBlockStartTwip',
  ),
  true,
  'a re-digested renderer authority rejects a fractional outer physical origin',
)
const negativeOuterOriginValidation = validateRedigestedOuterOrigin(-20)
assert.equal(
  negativeOuterOriginValidation.issues.some(
    ({ code, path }) =>
      code === 'SCHEMA_MINIMUM'
      && path === '$.artifacts.renderer-typography.coordinates.questionStemAndOuterOptionBlockStartTwip',
  ),
  true,
  'a re-digested renderer authority rejects a negative outer physical origin',
)
const driftedAuthorityArtifacts = {
  ...authority.artifacts,
  'renderer-typography': structuredClone(rendererTypography),
}
driftedAuthorityArtifacts[
  'renderer-typography'
].coordinates.questionStemAndOuterOptionBlockStartTwip += 20
assert.equal(
  validateAuthorityClosure({
    manifest: authority.manifest,
    artifacts: driftedAuthorityArtifacts,
    schemas: authority.schemas,
  }).issues.some((issue) => issue.code === 'AUTHORITY_DIGEST_MISMATCH'),
  true,
  'the manifest digest closure rejects a changed outer physical origin',
)
assert.equal(
  plan.questionStemAndOuterOptionBlockStartTwip,
  authoritativeOuterOriginTwip,
)
assert.equal(
  plan.rulesetRef.rendererTypographyDigest,
  digestJson(rendererTypography),
)
assert.equal(
  abcdLayoutRules.questionStemAndOuterOptionBlockStartTwip,
  authoritativeOuterOriginTwip,
)
assert.equal(
  translateAbcdPlanToPointPlacement(plan).questionStemStartPt,
  authoritativeOuterOriginTwip / 20,
)
assert.equal(abcdPlacementSignature(plan), plan.placementSignature)

const tamperedOuterOriginPlan = structuredClone(plan)
tamperedOuterOriginPlan.questionStemAndOuterOptionBlockStartTwip += 20
assert.notEqual(
  abcdPlacementSignature(tamperedOuterOriginPlan),
  plan.placementSignature,
  'the physical signature binds the outer Question/Option-block origin',
)
assert.throws(
  () => translateAbcdPlanToPointPlacement(tamperedOuterOriginPlan),
  { code: 'ABCD_LAYOUT_AUTHORITY_MISMATCH' },
  'a physical origin cannot move outside the digest-closed renderer authority',
)
assert.throws(
  () => translateAbcdPlanToPaperSurface(plan),
  { code: 'ABCD_RENDERER_FONT_CLOSURE_UNAVAILABLE' },
)
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
const fixedClozeWrapped = layoutFixedFourColumnClozeOptionSet(
  optionSet('cloze-wrapped', [
    'short',
    'short',
    'short',
    Array.from({ length: 5 }, () => 'look forward to').join(' '),
  ]),
)
assert.equal(fixedClozeWrapped.status, 'selected')
assert.equal(fixedClozeWrapped.mode, 'four_columns')
assert.deepEqual(
  fixedClozeWrapped.placements.map((placement) => placement.startTwip),
  [0, 2080, 4160, 6240],
  'Cloze wrapped text preserves one fixed four-track strategy',
)
assert.deepEqual(
  layoutFixedFourColumnClozeOptionSet(
    optionSet('cloze-hard-break', [
      'short',
      'short',
      'short',
      'look forward\nto',
    ]),
  ),
  {
    status: 'needs_review',
    reason: 'fixed_four_column_contains_unrenderable_content',
  },
  'Cloze fixed tracks fail closed on authored hard breaks',
)
assert.deepEqual(
  layoutFixedFourColumnClozeOptionSet(
    optionSet('cloze-unbreakable', [
      'short',
      'short',
      'short',
      'x'.repeat(100),
    ]),
  ),
  {
    status: 'needs_review',
    reason: 'fixed_four_column_contains_unrenderable_content',
  },
  'Cloze fixed tracks fail closed on an overwide unbreakable token',
)
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

const corpusFiles = readdirSync('app/public/paper-assets')
  .map((paperId) => ({
    paperId,
    assetPath: path.join(
      'app/public/paper-assets',
      paperId,
      'latest/paper-asset.json',
    ),
  }))
  .filter(({ assetPath }) => {
    try {
      readFileSync(assetPath)
      return true
    } catch {
      return false
    }
  })
  .sort((left, right) => left.paperId.localeCompare(right.paperId))
assert.equal(corpusFiles.length, 33)
assert.equal(
  digestJson(corpusFiles.map(({ paperId, assetPath }) => [
    paperId,
    sha256File(assetPath),
  ])),
  'sha256:e931779c94dda458df0bd94207e5712160bf59adc174d30bcd990df8aa7270e4',
  'the complete current 33-paper asset closure stays hash-bound',
)

const corpusModes = {
  four_columns: 0,
  two_by_two: 0,
  one_column: 0,
  needs_review: 0,
}
const boundaryModes = new Map()
const boundaryOptionSets = new Map()
for (const { paperId, assetPath } of corpusFiles) {
  const asset = JSON.parse(readFileSync(assetPath, 'utf8'))
  for (const question of Object.values(asset.content.questions)) {
    if (
      question.options?.length !== 4
      || question.options.map(({ label }) => label).join('') !== 'ABCD'
    ) continue
    const currentOptionSet = optionSet(
      question.questionId,
      question.options.map(({ text }) => text),
    )
    const selected = layoutAbcdOptionSet(currentOptionSet)
    corpusModes[selected.mode || 'needs_review'] += 1
    if (
      ['q-2022-jia-021', 'q-2020-jia-030', 'q-2020-jia-035']
        .includes(question.questionId)
    ) {
      boundaryModes.set(question.questionId, selected.mode)
      boundaryOptionSets.set(question.questionId, currentOptionSet)
    }
  }
}
assert.deepEqual(corpusModes, {
  four_columns: 641,
  two_by_two: 330,
  one_column: 64,
  needs_review: 0,
})
assert.deepEqual(Object.fromEntries(boundaryModes), {
  'q-2020-jia-030': 'one_column',
  'q-2020-jia-035': 'one_column',
  'q-2022-jia-021': 'two_by_two',
})

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

function escapeHtml(value) {
  return escapeXml(value)
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

function htmlFor(translation, embeddedFont = '') {
  const rowHeightPt = 72
  return `<!doctype html><meta charset="utf-8"><style>
    @page { size: A4; margin: 24mm; }
    ${embeddedFont ? `@font-face { font-family: "EQB Pinned Times"; src: url(data:font/ttf;base64,${embeddedFont}); }` : ''}
    body { margin: 0; font-family: "EQB Pinned Times", "Times New Roman", "Songti SC"; font-size: 10.5pt; font-kerning: normal; }
    .set { position: relative; width: ${translation.rowWidthPt}pt; height: ${rowsFor(translation).length * rowHeightPt}pt; }
    .option { position: absolute; box-sizing: border-box; line-height: 18pt; overflow: visible; }
    .dense { white-space: nowrap; }
    .one { padding-left: 21pt; text-indent: -21pt; white-space: pre-wrap; overflow-wrap: normal; word-break: normal; }
  </style><div class="set">${translation.placements.map((placement) =>
    `<span class="option ${translation.mode === 'one_column' ? 'one' : 'dense'}" data-label="${placement.label}" style="left:${placement.startPt}pt;top:${placement.row * rowHeightPt}pt;width:${translation.mode === 'one_column' ? translation.rowWidthPt : translation.rowWidthPt - placement.startPt}pt">${escapeHtml(placement.renderedText)}</span>`).join('')}</div>`
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

function pdfAllWords(pdfPath, outputRoot) {
  const bboxPath = path.join(outputRoot, `${path.basename(pdfPath)}.all.bbox.html`)
  execFileSync('pdftotext', ['-bbox', pdfPath, bboxPath])
  const source = readFileSync(bboxPath, 'utf8')
  return [...source.matchAll(/<word xMin="([^"]+)" yMin="([^"]+)" xMax="([^"]+)" yMax="([^"]+)">([^<]*)<\/word>/g)]
    .map((match) => ({
      x: Number(match[1]),
      y: Number(match[2]),
      xMax: Number(match[3]),
      yMax: Number(match[4]),
      text: match[5],
    }))
}

function assertRenderedContent(pdfPath, outputRoot, placements, label) {
  const extracted = execFileSync('pdftotext', [pdfPath, '-'], { encoding: 'utf8' })
  for (const placement of placements) {
    for (const line of placement.renderedText.split('\n')) {
      const probes = line.length > 100 ? [...new Set(line.split(/\s+/u))] : [line]
      for (const probe of probes) {
        assert.equal(
          extracted.includes(probe),
          true,
          `${label}: full option content is present`,
        )
      }
    }
  }
  const words = pdfAllWords(pdfPath, outputRoot)
  assert.equal(words.length > placements.length, true, `${label}: content words render`)
  assert.equal(
    Math.max(...words.map(({ xMax }) => xMax))
      - Math.min(...words.map(({ x }) => x)) <= 439.2,
    true,
    `${label}: rendered content stays inside the option row`,
  )
}

function assertDenseContentNoWrap(pdfPath, outputRoot, placements, label) {
  const words = pdfAllWords(pdfPath, outputRoot)
  let cursor = 0
  placements.forEach((placement, placementIndex) => {
    const labelIndex = words.findIndex(
      ({ text }, index) => index >= cursor && text === `${placement.label}.`,
    )
    assert.equal(labelIndex >= cursor, true, `${label}: ${placement.label} label found`)
    const nextPlacement = placements[placementIndex + 1]
    const nextLabelIndex = nextPlacement
      ? words.findIndex(
          ({ text }, index) =>
            index > labelIndex && text === `${nextPlacement.label}.`,
        )
      : words.length
    const endIndex = nextLabelIndex === -1 ? words.length : nextLabelIndex
    const optionWords = words.slice(labelIndex, endIndex)
    assert.equal(optionWords.length >= 2, true, `${label}: option content follows label`)
    assert.equal(
      Math.max(...optionWords.map(({ y }) => y))
        - Math.min(...optionWords.map(({ y }) => y)) <= 0.5,
      true,
      `${label}: ${placement.label} dense content does not wrap`,
    )
    const nextWord = words[endIndex]
    if (nextPlacement?.row === placement.row && nextWord) {
      assert.equal(
        Math.max(...optionWords.map(({ xMax }) => xMax)) <= nextWord.x - 20,
        true,
        `${label}: ${placement.label} preserves the 20pt dense gutter`,
      )
    }
    cursor = endIndex
  })
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
    if (rowWords.length > 1) {
      assert.equal(
        rowWords.every(({ y, yMax }) => yMax - y <= 18.5),
        true,
        `${label}: dense option content remains one line`,
      )
    }
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

async function readScreenPositions(page) {
  return page.locator('.option').evaluateAll((nodes) => {
    const root = document.querySelector('.set').getBoundingClientRect()
    return nodes.map((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      return {
        label: node.dataset.label,
        x: (rect.x - root.x) * 72 / 96,
        y: (rect.y - root.y) * 72 / 96,
        xMax: (rect.right - root.x) * 72 / 96,
        yMax: (rect.bottom - root.y) * 72 / 96,
      }
    })
  })
}

function hostFontClosure() {
  function resolveFont(pattern) {
    const [file, fontVersion, family] = execFileSync(
      'fc-match',
      ['-f', '%{file}\\n%{fontversion}\\n%{family}\\n', pattern],
      { encoding: 'utf8' },
    ).trim().split('\n')
    return {
      fontFaceId: family.split(',')[0],
      fontVersion: `fc:${fontVersion}`,
      file,
      fontBytes: readFileSync(file),
    }
  }
  const primary = resolveFont('Times New Roman')
  const fallback = resolveFont('Songti SC')
  const candidate = {
    primary: {
      fontFaceId: primary.fontFaceId,
      fontVersion: primary.fontVersion,
      fontBytes: primary.fontBytes,
    },
    fallbacks: [{
      fontFaceId: fallback.fontFaceId,
      characters: '．﹣',
      fontVersion: fallback.fontVersion,
      fontBytes: fallback.fontBytes,
    }],
    fontMetricsDigest: expectedAbcdRendererFontClosure.fontMetricsDigest,
    shapingImplementationDigest:
      expectedAbcdRendererFontClosure.shapingImplementationDigest,
  }
  const resolved = resolveAbcdRendererFontClosure(candidate)
  assert.equal(
    resolved.status,
    'ready',
    'actual artifacts require the exact pinned primary and fallback font files',
  )
  return { closure: resolved.closure, primaryFile: primary.file }
}

async function verifyActualArtifacts() {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'eqb-abcd-artifacts-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true })
  const actualFont = hostFontClosure()
  const embeddedFont = readFileSync(actualFont.primaryFile).toString('base64')
  try {
    const actualCases = [
      ...gold.map(({ questionId, redactedText }) => ({
        questionId,
        texts: redactedText,
      })),
      {
        questionId: 'hard-break',
        texts: ['first\nsecond', 'short', 'short', 'short'],
      },
      {
        questionId: 'wrappable',
        texts: [
          Array.from({ length: 90 }, () => 'word').join(' '),
          'short',
          'short',
          'short',
        ],
      },
      ...[...boundaryOptionSets.values()].map((set) => ({
        questionId: set.questionId,
        texts: set.options.map(({ content }) =>
          content.map(({ text }) => text).join('')),
      })),
    ]
    for (const { questionId, texts } of actualCases) {
      const selected = layoutAbcdOptionSet(optionSet(questionId, texts))
      const screen = translateAbcdPlanToPaperSurface(selected, actualFont.closure)
      const print = translateAbcdPlanToPrintPdf(selected, actualFont.closure)
      assert.equal(screen.placementSignature, print.placementSignature)
      assert.equal([screen, print].every(({ shrinkToFit }) =>
        shrinkToFit === false), true)
      assert.equal([screen, print].every(({ clipping }) =>
        clipping === 'forbidden'), true)
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
      await page.setContent(htmlFor(screen, embeddedFont))
      await page.evaluate(() => document.fonts.ready)
      const screenPositions = await readScreenPositions(page)
      assertPhysicalPlacement(selected.placements, screenPositions, `${questionId} PaperSurface`)
      if (questionId === 'hard-break' || questionId === 'wrappable') {
        assert.equal(
          screenPositions[0].yMax - screenPositions[0].y > 18,
          true,
          `${questionId} PaperSurface preserves multi-line content`,
        )
      }
      const screenshot = await page.screenshot()
      assert.equal(screenshot.subarray(1, 4).toString(), 'PNG')

      await page.setContent(htmlFor(print, embeddedFont))
      await page.evaluate(() => document.fonts.ready)
      const pdfPath = path.join(outputRoot, `${questionId}-print.pdf`)
      writeFileSync(pdfPath, await page.pdf({ format: 'A4', printBackground: true }))
      assert.equal(readFileSync(pdfPath).subarray(0, 4).toString(), '%PDF')
      assertPhysicalPlacement(
        selected.placements,
        pdfWords(pdfPath, outputRoot),
        `${questionId} Print/PDF`,
      )
      assertRenderedContent(
        pdfPath,
        outputRoot,
        selected.placements,
        `${questionId} Print/PDF`,
      )
      if (selected.mode !== 'one_column') {
        assertDenseContentNoWrap(
          pdfPath,
          outputRoot,
          selected.placements,
          `${questionId} Print/PDF`,
        )
      }
      await page.close()

    }

    const clozeScreen = {
      ...translateAbcdPlanToPaperSurface(clozePlans[0], actualFont.closure),
      placements: clozePlans.flatMap((selected, row) =>
        translateAbcdPlanToPaperSurface(selected, actualFont.closure).placements.map((placement) => ({
          ...placement,
          row,
        }))),
    }
    const clozePrint = {
      ...translateAbcdPlanToPrintPdf(clozePlans[0], actualFont.closure),
      placements: clozePlans.flatMap((selected, row) =>
        translateAbcdPlanToPrintPdf(selected, actualFont.closure).placements.map((placement) => ({
          ...placement,
          row,
        }))),
    }
    const clozePlacements = clozePlans.flatMap((selected, row) =>
      selected.placements.map((placement) => ({
        ...placement,
        row,
      })))

    const clozePage = await browser.newPage({ viewport: { width: 1000, height: 1200 } })
    await clozePage.setContent(htmlFor(clozeScreen, embeddedFont))
    await clozePage.evaluate(() => document.fonts.ready)
    const clozeScreenWords = await readScreenPositions(clozePage)
    assertPhysicalPlacement(clozePlacements, clozeScreenWords, 'Cloze PaperSurface')
    assertSameColumnSpread(clozePlacements, clozeScreenWords, 'Cloze PaperSurface')

    await clozePage.setContent(htmlFor(clozePrint, embeddedFont))
    await clozePage.evaluate(() => document.fonts.ready)
    const clozePrintPdf = path.join(outputRoot, 'cloze-print.pdf')
    writeFileSync(clozePrintPdf, await clozePage.pdf({ format: 'A4', printBackground: true }))
    const clozePrintWords = pdfWords(clozePrintPdf, outputRoot)
    assertPhysicalPlacement(clozePlacements, clozePrintWords, 'Cloze Print/PDF')
    assertSameColumnSpread(clozePlacements, clozePrintWords, 'Cloze Print/PDF')
    assertRenderedContent(
      clozePrintPdf,
      outputRoot,
      clozePlacements,
      'Cloze Print/PDF',
    )
    assertDenseContentNoWrap(
      clozePrintPdf,
      outputRoot,
      clozePlacements,
      'Cloze Print/PDF',
    )
    await clozePage.close()

  } finally {
    await browser.close()
    rmSync(outputRoot, { recursive: true, force: true })
  }
}

if (process.argv.includes('--actual-artifacts')) await verifyActualArtifacts()

console.log(`PASS paper canonical shared A-D layout${process.argv.includes('--actual-artifacts') ? ' actual artifacts' : ''}`)
