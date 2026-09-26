#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { embeddedPaperFontCss } from '../server/paper-fonts.mjs'
import { paperFontStack, paperFontFaces } from '../shared/papersurface/paperFonts.mjs'
import adaptiveTypography from '../standards/paper-canonical/rendering/paper-typography-v11.json' with { type: 'json' }
import {
  abcdLayoutRules,
  adaptiveAbcdLayoutRules,
  abcdPlacementSignature,
  layoutAbcdOptionGroup,
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
import { clozeRhythm } from '../shared/paper-canonical/clozeRhythm.mjs'
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

// A left-heavy A/C pair may move one shared anchor right, provided B/D still
// fit with the original 420-twip gutter and 20-twip end safety. The old
// authority remains fixed at 4160 and must not inherit the new selection.
const adaptivePair = optionSet('adaptive-pair', ['W'.repeat(19), 'W'.repeat(19), 'W'.repeat(19), 'W'.repeat(20)])
const fixedPair = layoutAbcdOptionSet(adaptivePair)
const movedPair = layoutAbcdOptionSet(adaptivePair, adaptiveAbcdLayoutRules.rulesetId)
assert.equal(fixedPair.mode, 'one_column')
assert.equal(movedPair.mode, 'two_by_two')
assert.equal(movedPair.placements[1].startTwip, 4464)
assert.equal(movedPair.placements[3].startTwip, 4464)
assert.equal(movedPair.placements[0].advanceTwip + 420 + 20 <= 4464, true)
assert.equal(movedPair.placements[2].advanceTwip + 420 + 20 <= 4464, true)
assert.equal(movedPair.placements[3].advanceTwip <= movedPair.rowWidthTwip - 4464 - 20, true)
const lowerRowDrivesAnchor = layoutAbcdOptionSet(
  optionSet('lower-row-drives', ['W'.repeat(18), 'W'.repeat(19), 'W'.repeat(19), 'W'.repeat(20)]),
  adaptiveAbcdLayoutRules.rulesetId,
)
assert.equal(lowerRowDrivesAnchor.mode, 'two_by_two')
assert.equal(lowerRowDrivesAnchor.placements[1].startTwip, 4452)
assert.equal(lowerRowDrivesAnchor.placements[3].startTwip, 4452)
assert.equal(layoutAbcdOptionSet(
  optionSet('too-wide-right', ['W'.repeat(20), 'W'.repeat(20), 'W'.repeat(20), 'W'.repeat(21)]),
  adaptiveAbcdLayoutRules.rulesetId,
).mode, 'one_column')
assert.deepEqual(
  translateAbcdPlanToPointPlacement(movedPair).columnStartsPt,
  [0, 223.2],
)
assert.equal(adaptiveAbcdLayoutRules.optionRowWidthTwip,
  adaptiveTypography.optionAnchorFramework.rowWidthTwip)
assert.equal(adaptiveAbcdLayoutRules.fourColumnPitchTwip,
  adaptiveTypography.optionAnchorFramework.reading.fourColumnStartsTwip[1])
assert.equal(adaptiveAbcdLayoutRules.twoColumnSecondTabTwip,
  adaptiveTypography.optionAnchorFramework.reading.twoColumnStartsTwip[1])
assert.equal(adaptiveAbcdLayoutRules.questionStemAndOuterOptionBlockStartTwip,
  adaptiveTypography.coordinates.questionStemAndOuterOptionBlockStartTwip)
const passageSets = [
  adaptivePair,
  optionSet('short-left', ['short', 'W'.repeat(19), 'short', 'W'.repeat(20)]),
  optionSet('tight-right', ['short', 'W'.repeat(21), 'short', 'W'.repeat(21)]),
  optionSet('four-columns', ['a', 'b', 'c', 'd']),
]
const individualPassagePlans = passageSets.map((set) =>
  layoutAbcdOptionSet(set, adaptiveAbcdLayoutRules.rulesetId))
assert.equal(individualPassagePlans[1].placements[1].startTwip, 4160)
assert.equal(individualPassagePlans[2].mode, 'two_by_two')
const alignedPassagePlans = layoutAbcdOptionGroup(passageSets, adaptiveAbcdLayoutRules.rulesetId)
assert.deepEqual(alignedPassagePlans.map((plan) => plan.mode), [
  'two_by_two', 'two_by_two', 'one_column', 'four_columns',
])
assert.deepEqual(alignedPassagePlans.slice(0, 2).map((plan) =>
  plan.placements[1].startTwip), [4464, 4464])
assert.deepEqual(alignedPassagePlans[3].placements.map(({ startTwip }) => startTwip),
  [0, 2080, 4464, 6240], 'four-column C shares the passage B/D anchor without moving A/B/D')
assert.equal(alignedPassagePlans[3].placements[2].startTwip,
  alignedPassagePlans[0].placements[1].startTwip)
assert.deepEqual(translateAbcdPlanToPointPlacement(alignedPassagePlans[3]).columnStartsPt,
  [0, 104, 223.2, 312])
assert.equal(alignedPassagePlans[1].placements[3].advanceTwip
  <= alignedPassagePlans[1].rowWidthTwip - 4464 - 20, true)
const shiftedD = optionSet('shifted-D', ['a', 'b', 'W'.repeat(6), 'd'])
assert.equal(layoutAbcdOptionSet(shiftedD, adaptiveAbcdLayoutRules.rulesetId).mode,
  'four_columns', 'the short C fits the historical four-column track')
const [alignedPair, shiftedFour] = layoutAbcdOptionGroup([adaptivePair, shiftedD],
  adaptiveAbcdLayoutRules.rulesetId)
assert.equal(alignedPair.placements[1].startTwip, 4464)
assert.equal(shiftedFour.mode, 'four_columns')
assert.deepEqual(shiftedFour.placements.map(({ startTwip }) => startTwip),
  [0, 2080, 4464, 6339], 'D moves only as far as the measured C plus gutter and safety require')
assert.equal(shiftedFour.placements[2].advanceTwip + 420 + 20,
  shiftedFour.placements[3].startTwip - shiftedFour.placements[2].startTwip)
const tightFour = optionSet('tight-four', ['a', 'b', 'W'.repeat(7), 'W'.repeat(10)])
assert.equal(layoutAbcdOptionSet(tightFour, adaptiveAbcdLayoutRules.rulesetId).mode,
  'four_columns', 'the original four-column tracks admit both C and D')
const [, safeFallback] = layoutAbcdOptionGroup([adaptivePair, tightFour],
  adaptiveAbcdLayoutRules.rulesetId)
assert.equal(safeFallback.mode, 'two_by_two',
  'four columns fall back when shifting D would leave too little right-hand width')
assert.deepEqual(safeFallback.placements.map(({ startTwip }) => startTwip),
  [0, 4464, 0, 4464])
assert.equal(safeFallback.placements[2].advanceTwip > 6240 - 4464 - 420 - 20, true)
assert.equal(safeFallback.placements[2].advanceTwip <= 4464 - 420 - 20, true)
const initiallyTwo = optionSet('initially-two', ['a', 'b', 'W'.repeat(8), 'W'])
assert.equal(layoutAbcdOptionSet(initiallyTwo, adaptiveAbcdLayoutRules.rulesetId).mode,
  'two_by_two')
assert.equal(layoutAbcdOptionGroup([adaptivePair, initiallyTwo],
  adaptiveAbcdLayoutRules.rulesetId)[1].mode, 'two_by_two',
  'passage alignment cannot unexpectedly promote an existing two-row question into four columns')
assert.deepEqual(layoutAbcdOptionGroup(passageSets).map((plan) =>
  plan.placementSignature), passageSets.map((set) =>
  layoutAbcdOptionSet(set).placementSignature))
assert.deepEqual(layoutAbcdOptionGroup([adaptivePair, passageSets[3]]).at(-1)
  .placements.map(({ startTwip }) => startTwip), [0, 2080, 4160, 6240],
  'the v1 historical four-column geometry does not move with the passage')

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

const uncommonSourceGlyph = layoutAbcdOptionSet(
  optionSet('uncommon-source-glyph', [
    '45×36×25cm',
    'up to £400',
    'short',
    'short',
  ]),
)
assert.equal(uncommonSourceGlyph.status, 'selected')
assert.equal(
  uncommonSourceGlyph.placements[0].renderedText,
  'A. 45×36×25cm',
  'uncommon source glyphs are preserved while conservatively measured',
)

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
  fractionalOuterOriginValidation.ok,
  false,
  'a re-digested renderer authority rejects a fractional outer physical origin',
)
assert.equal(
  fractionalOuterOriginValidation.issues.some(
    ({ code }) =>
      code === 'SCHEMA_CONST'
      || code === 'RENDERER_OWNER_QA_TYPOGRAPHY_CONTRACT_INVALID',
  ),
  true,
)
const negativeOuterOriginValidation = validateRedigestedOuterOrigin(-20)
assert.equal(
  negativeOuterOriginValidation.ok,
  false,
  'a re-digested renderer authority rejects a negative outer physical origin',
)
assert.equal(
  negativeOuterOriginValidation.issues.some(
    ({ code }) =>
      code === 'SCHEMA_CONST'
      || code === 'RENDERER_OWNER_QA_TYPOGRAPHY_CONTRACT_INVALID',
  ),
  true,
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

// The cloze layout gate must track the same geometry the print/PDF renderer
// paints. Bind the layout's anchor-framework cloze geometry to the
// cloze-rhythm-v4 renderer mapping so a future drift between the two
// standards artifacts cannot silently re-open the D admission band.
const clozeFramework = rendererTypography.optionAnchorFramework.cloze
const clozeMapping = clozeRhythm.horizontalChoiceGeometry.rendererMapping
assert.deepEqual(
  clozeFramework.optionColumnStartsTwip,
  clozeMapping.columnStartsPt.map((pt) => Math.round(pt * 20)),
  'the cloze anchor-framework starts track the cloze-rhythm-v4 renderer mapping',
)
assert.deepEqual(
  clozeFramework.optionColumnWidthsTwip,
  clozeMapping.columnWidthsPt.map((pt) => Math.round(pt * 20)),
  'the cloze anchor-framework widths track the cloze-rhythm-v4 renderer mapping',
)
assert.equal(clozeFramework.labelToTextGapEm, clozeMapping.labelToTextGapEm)

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
  [346, 2556, 4638, 6731],
  'Cloze placement reports the rendered cloze-rhythm four-column starts, not the Reading pitch',
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
// Regression: an unbreakable D token wider than the renderer's D text cell but
// narrower than the legacy Reading-derived residual (the (87.08, 125.2] pt
// admission band) must fail closed. ad29d17b shrank the renderer's D track to
// 101.65 pt but left the gate on Reading geometry; this canary probes the band
// edge that went untested.
assert.deepEqual(
  layoutFixedFourColumnClozeOptionSet(
    optionSet('cloze-d-band', ['short', 'short', 'short', 'counterrevolutionary']),
  ),
  {
    status: 'needs_review',
    reason: 'fixed_four_column_contains_unrenderable_content',
  },
  'Cloze D band token wider than the rendered D cell but narrower than the legacy Reading residual fails closed',
)
// No regression: a D token below the rendered D text cell still selects.
assert.equal(
  layoutFixedFourColumnClozeOptionSet(
    optionSet('cloze-short-d', ['short', 'short', 'short', 'characteristically']),
  ).status,
  'selected',
  'A short D word below the rendered D cell still selects four columns',
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

const frozenCorpusManifest = JSON.parse(readFileSync(
  'docs/cuts/paper-canonical-unification/migration/manifest-v2.json',
  'utf8',
))
const corpusFiles = frozenCorpusManifest.membership.paperIds
  .map((paperId) => ({
    paperId,
    assetPath: path.join(
      'app/public/paper-assets',
      paperId,
      'latest/paper-asset.json',
    ),
  }))
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
  two_by_two: 337,
  one_column: 57,
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

function htmlFor(translation) {
  const rowHeightPt = 72
  return `<!doctype html><meta charset="utf-8"><style>
    @page { size: A4; margin: 24mm; }
    ${embeddedPaperFontCss()}
    ${readFileSync(new URL('../shared/papersurface/fontRendering.css', import.meta.url), 'utf8')}
    body { margin: 0; font-family: ${paperFontStack}; font-size: 10.5pt; }
    .set { position: relative; width: ${translation.rowWidthPt}pt; height: ${rowsFor(translation).length * rowHeightPt}pt; }
    .option { position: absolute; box-sizing: border-box; line-height: 18pt; overflow: visible; }
    .dense { white-space: nowrap; }
    .one { padding-left: 21pt; text-indent: -21pt; white-space: pre-wrap; overflow-wrap: normal; word-break: normal; }
  </style><body class="paper-print"><div class="set">${translation.placements.map((placement) =>
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
      const probes = line.length > 100 ? [...new Set(line.split(/\s+/u))] : [line.trimEnd()]
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
  function bytesFor(family) {
    const face = paperFontFaces.find(face => face.family === family && face.style === 'normal' && face.weight === '400')
    return readFileSync(new URL(`../app/public/fonts/paper/${face.path}`, import.meta.url))
  }
  const candidate = {
    primary: {
      ...expectedAbcdRendererFontClosure.primary,
      fontBytes: bytesFor(expectedAbcdRendererFontClosure.primary.fontFaceId),
    },
    fallbacks: expectedAbcdRendererFontClosure.fallbacks.map(fallback => ({
      ...fallback,
      fontBytes: bytesFor(fallback.fontFaceId),
    })),
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
  return { closure: resolved.closure }
}

async function verifyActualArtifacts() {
  const outputRoot = mkdtempSync(path.join(tmpdir(), 'eqb-abcd-artifacts-'))
  const playwright = await import('../app/node_modules/playwright/index.js')
  const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
  const actualFont = hostFontClosure()
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
    if (process.env.EQB_ADAPTIVE_ABCD_SOURCE) {
      const source = JSON.parse(readFileSync(process.env.EQB_ADAPTIVE_ABCD_SOURCE, 'utf8'))
      const readingOptions = [32, 33, 34].map((number) => {
        const question = source.groups.flatMap((group) => group.questions || [])
          .find((entry) => entry.questionId.endsWith(`:${number}`))
        assert(question, `Source question ${number} is present`)
        return optionSet(`zj-${number}`, question.options.map(({ text }) => text))
      })
      const aligned = layoutAbcdOptionGroup(readingOptions, adaptiveAbcdLayoutRules.rulesetId)
      assert.deepEqual(aligned.map((plan) => plan.mode), ['two_by_two', 'two_by_two', 'two_by_two'])
      assert.equal(new Set(aligned.map((plan) => plan.placements[1].startTwip)).size, 1)
      assert.equal(aligned[0].placements[1].startTwip, 4371)
      for (const number of [32, 34]) {
        const question = source.groups.flatMap((group) => group.questions || [])
          .find((entry) => entry.questionId.endsWith(`:${number}`))
        assert(question, `Source question ${number} is present`)
        const texts = question.options.map(({ text }) => text)
        const option = optionSet(`zj-${number}`, texts)
        assert.equal(layoutAbcdOptionSet(option).mode, 'one_column')
        assert.equal(layoutAbcdOptionSet(option, adaptiveAbcdLayoutRules.rulesetId).mode, 'two_by_two')
        actualCases.push({ questionId: `zj-${number}`, texts, rulesetId: adaptiveAbcdLayoutRules.rulesetId })
      }
    }
    for (const { questionId, texts, rulesetId } of actualCases) {
      const selected = layoutAbcdOptionSet(optionSet(questionId, texts), rulesetId)
      const screen = translateAbcdPlanToPaperSurface(selected, actualFont.closure)
      const print = translateAbcdPlanToPrintPdf(selected, actualFont.closure)
      assert.equal(screen.placementSignature, print.placementSignature)
      assert.equal([screen, print].every(({ shrinkToFit }) =>
        shrinkToFit === false), true)
      assert.equal([screen, print].every(({ clipping }) =>
        clipping === 'forbidden'), true)
      const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
      await page.setContent(htmlFor(screen))
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
      if (rulesetId) writeFileSync(`.amp/in/artifacts/${questionId}-adaptive-screen.png`, screenshot)

      await page.setContent(htmlFor(print))
      await page.evaluate(() => document.fonts.ready)
      const pdfPath = path.join(outputRoot, `${questionId}-print.pdf`)
      writeFileSync(pdfPath, await page.pdf({ format: 'A4', printBackground: true }))
      if (rulesetId) writeFileSync(`.amp/in/artifacts/${questionId}-adaptive-print.pdf`, readFileSync(pdfPath))
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
    await clozePage.setContent(htmlFor(clozeScreen))
    await clozePage.evaluate(() => document.fonts.ready)
    const clozeScreenWords = await readScreenPositions(clozePage)
    assertPhysicalPlacement(clozePlacements, clozeScreenWords, 'Cloze PaperSurface')
    assertSameColumnSpread(clozePlacements, clozeScreenWords, 'Cloze PaperSurface')

    await clozePage.setContent(htmlFor(clozePrint))
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
