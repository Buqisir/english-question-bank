import assert from 'node:assert/strict'
import test from 'node:test'
import Ajv from '../../server/node_modules/ajv/dist/2020.js'
import materializationSchema from '../../schemas/paper-canonical/nck1-source-materialization-v13.schema.json' with { type: 'json' }
import intentSchema from '../../schemas/paper-canonical/reading-option-figure-source-layout-intent-v1.schema.json' with { type: 'json' }
import { bindInImageOptionLabelsV2, makeInImageOptionLabelsV2ShapeFixture as make, makeInImageOptionLabelsV2PlanFixture } from '../../test-fixtures/paper-import/nck1-ocr-evidence-v1/in-image-option-labels-v2.mjs'
import { resolveInImageOptionLabels, verifyInImageOptionLabelsV2Ownership } from '../../shared/paper-canonical/inImageOptionLabels.mjs'
import { validateReadingFigureLayout, validateInImageLabelMeasurementBinding } from '../../shared/paper-canonical/readingFigureLayout.mjs'
import { closureAdmitsInImageOptionLabelMeasurements, nck1InImageOptionLabelsV2AuthorityRef,
  nck1InImageOptionLabelsAuthorityRef, resolveCanonicalAuthority, validateJsonSchema } from '../../shared/paper-canonical/authority.mjs'
import { validateReadingContract } from '../../shared/paper-canonical/reading.mjs'
import { inImageLabelPageMetadata } from '../../server/paper-canonical/nck1MaterializationAdapter.mjs'
import { planInImageOptionLabels } from './in-image-option-labels.mjs'
import { compileCanonicalPaper, importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../shared/paper-canonical/compiler.mjs'
import { makeReadyCanonicalFixture } from '../../test-fixtures/paper-canonical/foundationFixture.mjs'
import { digestJson, withoutKey } from '../../shared/paper-canonical/stable.mjs'

function structural(f) {
  resolveInImageOptionLabels(f.raw)
  verifyInImageOptionLabelsV2Ownership(f.decision, f.confirmation, f.evidence)
}
function rebind(f) {
  f.question.figureLayout.measurementEvidenceBody.labelEvidence.decisionDigest = digestJson(f.decision)
  resign(f.question.figureLayout)
}
function resign(layout) {
  layout.intent.measurementEvidence.evidenceDigest = digestJson(layout.measurementEvidenceBody)
  layout.intent.intentDigest = digestJson(withoutKey(layout.intent, 'intentDigest'))
}
const layoutValid = (f, allowed = true) => validateReadingFigureLayout(f.question.figureLayout,
  f.question.questionId, f.question.options, f.raw.documents[0].sha256, f.question.source,
  f.raw.media, { allowInImageLabelMeasurement: allowed })

// Public structural Reading contract used by compiler/projector. This does not
// claim source admission or raster replay for the placeholder plan fixture.
function readingContract(f) {
  const questionId = f.question.questionId
  const options = f.question.options.map(option => ({ ...option, optionId: `option:${questionId}:${option.label}` }))
  return {
    questionIds: [questionId], blankIds: [],
    content: { blocks: [{ kind: 'paragraph', nodeId: 'passage', inlines: [
      { kind: 'text', nodeId: 'passage-text', text: 'Synthetic passage.' },
    ] }] },
    media: f.raw.media.map(m => ({ ...m, mimeType: 'image/png', pixelWidth: 420, pixelHeight: 320,
      sourceArtifactRef: { artifactId: `artifact:${m.mediaId}` } })),
    variant: { family: 'reading', passageBlockRoles: [], choiceOwnership: { ownership: 'per_question',
      sets: [{ questionId, options }] },
    questions: [{ questionId, stem: [{ kind: 'text', nodeId: 'stem-text', text: 'Choose the image.' }],
      correctOptionId: options[2].optionId, figureLayout: f.question.figureLayout,
      ...(f.question.stemFigures ? { stemFigures: f.question.stemFigures.map(figure => ({
        kind: 'figure', nodeId: figure.blockId, mediaId: figure.mediaId, caption: [],
      })) } : {}),
    }] },
    assertions: [{ questionId, authority: 'official', answer: 'C' }],
    allowFigureOptions: true, allowStemFigures: true, allowInImageLabelMeasurement: true,
  }
}

for (const shared of [false, true]) for (const cLeftOfA of [false, true]) {
  test(`R1 interior labels retain full 2x2 crops through native plan and public Reading contract, shared=${shared}, C-left-of-A=${cLeftOfA}`, () => {
    const f = makeInImageOptionLabelsV2PlanFixture({ shared })
    // Establish synthetic source geometry before binding; C can begin left of A.
    if (cLeftOfA) f.selection.labels[0].childRegion.x = .12
    for (const entry of f.selection.labels) {
      entry.labelRegion.x = entry.childRegion.x + .01
      entry.labelRegion.y = entry.childRegion.y + .01
    }
    const sourceBefore = structuredClone({ media: f.raw.media, selection: f.selection, source: f.question.source,
      documents: f.raw.documents })
    f.decision = bindInImageOptionLabelsV2({ ...f, pageWidthPt: 600, pageHeightPt: 800 })
    f.input.materializationBytes = Buffer.from(JSON.stringify(f.raw))
    const inputBefore = structuredClone(f.input)
    const plan = planInImageOptionLabels(f.input, f.selection)
    assert.deepEqual(plan.decision, f.decision)
    assert.deepEqual(structuredClone(f.input), inputBefore)
    assert.deepEqual({ media: f.raw.media, selection: f.selection, source: f.question.source,
      documents: f.raw.documents }, sourceBefore)
    assert.equal(plan.decision.layout, 'grid_2x2_row_major')
    assert(layoutValid(f))
    assert(validateInImageLabelMeasurementBinding(f.question.figureLayout, plan.decision))
    assert.deepEqual(validateReadingContract(readingContract(f)), [])
    const { intent, measurementEvidenceBody: m } = f.question.figureLayout
    assert.deepEqual(intent.placements.map(p => p.label), ['A', 'B', 'C', 'D'])
    assert.deepEqual(intent.placements.map(p => p.optionId), f.question.options.map(o => `option:${f.question.questionId}:${o.label}`))
    assert.deepEqual(m.images, f.selection.labels.map(e => ({ mediaId: e.childMediaId, sha256: e.childSha256 })))
    assert.deepEqual(intent.placements.map(p => p.imageLeftPt), cLeftOfA ? [12, 240, 0, 240] : [0, 240, 0, 240])
    assert.equal(intent.rowWidthPt, 450)
    assert.equal(intent.bankHeightPt, 320)
    intent.placements.forEach((p, i) => {
      const { childRegion: r, labelRegion: label } = f.selection.labels[i]
      assert.deepEqual(p.sourcePlacementMatrix, [r.width * 600, 0, 0, -r.height * 800, r.x * 600, (r.y + r.height) * 800])
      assert.deepEqual(m.labels[i], { label: p.label, leftPt: label.x * 600, topPt: label.y * 800,
        widthPt: label.width * 600, heightPt: label.height * 800 })
      assert.equal(p.imageWidthPt, 210)
      assert.equal(p.imageHeightPt, 160)
      for (const key of ['imageLeftPt', 'imageTopPt', 'labelLeftPt', 'labelTopPt']) assert(p[key] >= 0)
      assert(Math.abs(p.labelLeftPt - p.imageLeftPt - 6) < .01)
      assert(Math.abs(p.labelTopPt - p.imageTopPt - 8) < .01)
      assert(p.labelLeftPt + m.labels[i].widthPt <= p.imageLeftPt + p.imageWidthPt)
      assert(p.labelTopPt + m.labels[i].heightPt <= p.imageTopPt + p.imageHeightPt)
    })
    assert(intent.placements[0].imageTopPt === intent.placements[1].imageTopPt)
    assert(intent.placements[2].imageTopPt === intent.placements[3].imageTopPt)
    assert(intent.placements[2].imageTopPt > intent.placements[0].imageTopPt)
    for (const imagesAlsoShifted of [false, true]) {
      const bad = structuredClone(f), layout = bad.question.figureLayout
      for (const p of layout.intent.placements) {
        p.labelLeftPt += 6
        if (imagesAlsoShifted) p.imageLeftPt += 6
      }
      if (imagesAlsoShifted) layout.intent.rowWidthPt += 6
      resign(layout)
      assert.deepEqual(validateJsonSchema(layout.intent, intentSchema), [])
      assert.equal(layoutValid(bad), false)
      bad.input.materializationBytes = Buffer.from(JSON.stringify(bad.raw))
      assert.throws(() => planInImageOptionLabels(bad.input, bad.selection), /source-bound measured figureLayout/u)
      assert(validateReadingContract(readingContract(bad)).some(issue => issue.code === 'READING_FIGURE_LAYOUT_INVALID'))
    }
  })
}

test('R1 preserves historical v1 A-label origin and frozen v75 authority closure', () => {
  const f = make(), layout = f.question.figureLayout, m = layout.measurementEvidenceBody
  m.schemaVersion = 'reading-source-layout-measurement-v1'; delete m.labelEvidence
  layout.intent.measurementEvidence.evidenceSchemaVersion = m.schemaVersion
  m.labels = [...'ABCD'].map((label, i) => ({ label, leftPt: 60 + i * 120, topPt: 200, widthPt: 12, heightPt: 16 }))
  layout.intent.rowWidthPt = 456; layout.intent.bankHeightPt = 80
  layout.intent.labelFontSizePt = 10; layout.intent.labelLineHeightPt = 12
  layout.intent.placements.forEach((p, i) => {
    Object.assign(p, { sourcePlacementMatrix: [90, 0, 0, -80, 66 + i * 120, 240],
      imageLeftPt: 6 + i * 120, imageTopPt: 0, imageWidthPt: 90, imageHeightPt: 80,
      labelLeftPt: i * 120, labelTopPt: 40 })
    f.raw.media[i].extraction.region = { x: (66 + i * 120) / 600, y: .2, width: .15, height: .1 }
  })
  resign(layout)
  const before = structuredClone(layout)
  assert(layoutValid(f, false))
  assert.deepEqual(validateReadingContract({ ...readingContract(f), allowInImageLabelMeasurement: false }), [])
  assert.deepEqual(layout, before)
  const interior = make()
  for (const entry of interior.selection.labels) entry.labelRegion.x += .01
  bindInImageOptionLabelsV2({ ...interior, pageWidthPt: 600, pageHeightPt: 800 })
  const interiorLayout = interior.question.figureLayout
  interiorLayout.measurementEvidenceBody.schemaVersion = 'reading-source-layout-measurement-v1'
  delete interiorLayout.measurementEvidenceBody.labelEvidence
  interiorLayout.intent.measurementEvidence.evidenceSchemaVersion = 'reading-source-layout-measurement-v1'
  resign(interiorLayout)
  assert.equal(layoutValid(interior, false), false)
  const old = resolveCanonicalAuthority(nck1InImageOptionLabelsAuthorityRef)
  assert(old.ok)
  assert.equal(digestJson({ schemas: old.closure.schemas, artifacts: old.closure.artifacts }),
    'sha256:66baf8c3b2a9cd2c16c11b5b6fd4ad37606e2d2e08146267b87c923cf550b21f')
})

for (const shared of [false, true]) test(`closed 2x2 ownership and native structural plan, shared=${shared}`, () => {
  const f = make({ shared })
  structural(f)
  assert(layoutValid(f))
  assert.equal(layoutValid(f, false), false)
  assert(validateInImageLabelMeasurementBinding(f.question.figureLayout, f.decision))
  assert.equal(f.raw.media.length, shared ? 5 : 4)
  const p = makeInImageOptionLabelsV2PlanFixture({ shared })
  const before = structuredClone(p.input)
  const plan = planInImageOptionLabels(p.input, p.selection)
  assert.equal(plan.schemaVersion, 'reading-in-image-option-labels-plan-v2')
  assert.deepEqual(plan.decision, p.decision)
  assert.equal(plan.planDigest, digestJson(withoutKey(plan, 'planDigest')))
  assert.deepEqual(structuredClone(p.input), before)
})

const mutations = {
  'missing C/D ownership item': f => { f.decision.itemOwnership = [] },
  'lost whitespace': f => { f.decision.itemOwnership[0].fragments[0].end-- },
  'duplicate observation': f => { f.decision.itemOwnership[0].fragments[1].observationIds = ['word-bubble'] },
  'reversed observation partition': f => { f.decision.itemOwnership[0].fragments[0].observationIds = ['word-d'] },
  'wrong confirmed text': f => { f.decision.itemOwnership[0].text = 'Bubble X. D.' },
  'wrong declared crop': f => { f.decision.itemOwnership[0].fragments[0].target.label = 'C' },
  'observation crosses crop boundary': f => { f.evidence.documents[0].pages[0].observations[0].region.width = .5 },
  'extra decision field': f => { f.decision.verified = true },
  'missing raster review': f => { delete f.decision.sourceReview.reviewedPageRasterDigest },
  'file SHA replaces descriptor digest': f => { f.decision.sourceReview.reviewedPageRasterDigest = f.evidence.documents[0].pages[0].raster.sha256 },
  'wrong sealed generation': f => { f.evidence.evidenceDigest = `sha256:${'b'.repeat(64)}` },
  'wrong shared output': f => { f.question.stemFigures = [] },
  'shared overlaps D': f => { f.decision.sharedFigure.region = structuredClone(f.decision.labels[3].childRegion) },
  'surrogate split': f => {
    f.decision.itemOwnership[0].text = '😀bble C. D.'
    f.decision.itemOwnership[0].fragments[0].end = 1
    f.decision.itemOwnership[0].fragments[1].start = 1
  },
}
for (const [name, mutate] of Object.entries(mutations)) test(`structural proof rejects ${name}`, () => {
  const f = make({ shared: true }); mutate(f); rebind(f)
  assert.throws(() => structural(f))
})

test('labels derive from decision within 0.01pt, even after measurement and intent are re-signed', () => {
  const f = make()
  f.question.figureLayout.measurementEvidenceBody.labels[0].leftPt += .02
  resign(f.question.figureLayout)
  assert.equal(validateInImageLabelMeasurementBinding(f.question.figureLayout, f.decision), false)
  assert.throws(() => resolveInImageOptionLabels(f.raw))
})

for (const [name, mutate] of Object.entries({
  'unknown label evidence': m => { m.labelEvidence.kind = 'verified' },
  'extra evidence field': m => { m.labelEvidence.verified = true },
  'missing images': m => { m.images = null },
  'extra measurement field': m => { m.source = 'pixels' },
  'negative label size': m => { m.labels[0].widthPt = -1 },
  'zero page size': m => { m.pageWidthPt = 0 },
})) test(`closed measurement rejects ${name}`, () => {
  const f = make(); mutate(f.question.figureLayout.measurementEvidenceBody); resign(f.question.figureLayout)
  assert.equal(layoutValid(f), false)
})

test('old measurement-v1 remains default-admitted without the new capability', () => {
  const f = make(), m = f.question.figureLayout.measurementEvidenceBody
  m.schemaVersion = 'reading-source-layout-measurement-v1'; delete m.labelEvidence
  f.question.figureLayout.intent.measurementEvidence.evidenceSchemaVersion = m.schemaVersion
  resign(f.question.figureLayout)
  assert(layoutValid(f, false))
  assert.equal(validateInImageLabelMeasurementBinding(f.question.figureLayout, f.decision), false)
  assert.throws(() => resolveInImageOptionLabels(f.raw))
})

test('capability requires exact schema, v13 and behavior19 declaration', () => {
  const result = resolveCanonicalAuthority(nck1InImageOptionLabelsV2AuthorityRef)
  assert(result.ok, JSON.stringify(result.issues))
  assert(closureAdmitsInImageOptionLabelMeasurements(result.closure))
  assert.equal(closureAdmitsInImageOptionLabelMeasurements(resolveCanonicalAuthority(nck1InImageOptionLabelsAuthorityRef).closure), false)
  for (const mutate of [
    c => { delete c.schemas['reading-source-layout-measurement-v2'] },
    c => { c.schemas['reading-source-layout-measurement-v2'].additionalProperties = true },
    c => { delete c.schemas['nck1-source-materialization-v13'] },
    c => { c.artifacts.adapter.adapters.find(a => a.adapterId === 'nck1-source-materialization' && a.version === '19').capabilities = [] },
  ]) {
    const closure = structuredClone(result.closure); mutate(closure)
    assert.equal(closureAdmitsInImageOptionLabelMeasurements(closure), false)
  }
})

const bbox = '<doc><page width="595.276000" height="841.890000"></page></doc>'
const metadata = 'Page    4 rot: 0\nPage    4 MediaBox: 0.00 0.00 595.28 841.89\nPage    4 CropBox: 0.00 0.00 595.28 841.89\n'
test('metadata parser admits empty native word output and exact page coordinate system', () => {
  assert.deepEqual(inImageLabelPageMetadata(bbox, metadata, 4), { pageWidthPt: 595.276, pageHeightPt: 841.89 })
})
for (const [name, changed] of Object.entries({
  rotation: metadata.replace('rot: 0', 'rot: 90'),
  differentBox: metadata.replace('CropBox: 0.00 0.00 595.28', 'CropBox: 0.00 0.00 590.28'),
  origin: metadata.replaceAll('0.00 0.00', '1.00 0.00'),
  wrongPage: metadata.replaceAll('4 ', '3 '),
  duplicate: metadata + 'Page    4 rot: 0\n',
  dimensions: metadata.replaceAll('595.28', '600.00'),
})) test(`metadata rejects ${name}`, () => { assert.throws(() => inImageLabelPageMetadata(bbox, changed, 4)) })

test('native plan binds exact external media bytes and reviewed raster descriptor', () => {
  const f = makeInImageOptionLabelsV2PlanFixture()
  const changed = structuredClone(f.input); changed.media[0].bytes = Buffer.from('changed')
  assert.throws(() => planInImageOptionLabels(changed, f.selection), /exact candidate media bytes/u)
  const stale = structuredClone(f.selection); stale.sourceReview.reviewedPageRasterDigest = `sha256:${'f'.repeat(64)}`
  assert.throws(() => planInImageOptionLabels(f.input, stale))
})

test('public compiler rejects loose fixture input under unpublished v81', () => {
  const f = makeReadyCanonicalFixture()
  f.request.authority = nck1InImageOptionLabelsV2AuthorityRef
  const result = compileCanonicalPaper(f.request)
  assert.equal(result.disposition, 'unsupported')
  assert(result.artifacts.normalizationReport.diagnostics.some(issue => issue.code === 'AUTHORITY_RETIRED'))
})

test('public import rejects v2 under old authority before any PDF or media subprocess', () => {
  const f = makeInImageOptionLabelsV2PlanFixture()
  const result = importCanonicalCandidate(f.input, undefined, { materializationAuthorityRef: nck1InImageOptionLabelsAuthorityRef })
  assert(result.issues.some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'))
  assert(!compileNck1MaterializationCandidatePreview(result.candidate).compilation)
})

test('actual v13 schema closes both measurement versions and mixed v1/v2 decisions', () => {
  const ajv = new Ajv({ strict: false })
  const validate = ajv.compile({ $defs: materializationSchema.$defs, type: 'object', additionalProperties: false,
    required: ['figureLayout', 'inImageOptionLabels'], properties: {
      figureLayout: materializationSchema.$defs.question.properties.figureLayout,
      inImageOptionLabels: materializationSchema.properties.inImageOptionLabels,
    } })
  const f = make({ shared: true })
  const legacy = structuredClone(f.decision)
  legacy.schemaVersion = 'reading-in-image-option-labels-v1'
  delete legacy.layout; delete legacy.itemOwnership; delete legacy.sharedFigure
  legacy.sourceReview = { reviewedBy: 'import_agent', labelsInParentPixels: true, reason: 'Historical v1 shape' }
  const value = { figureLayout: f.question.figureLayout, inImageOptionLabels: [legacy, f.decision] }
  assert(validate(value), JSON.stringify(validate.errors))
  const v1 = structuredClone(value)
  v1.figureLayout.measurementEvidenceBody.schemaVersion = 'reading-source-layout-measurement-v1'
  delete v1.figureLayout.measurementEvidenceBody.labelEvidence
  v1.figureLayout.intent.measurementEvidence.evidenceSchemaVersion = 'reading-source-layout-measurement-v1'
  resign(v1.figureLayout)
  assert(validate(v1), JSON.stringify(validate.errors))
  const malformed = structuredClone(value); malformed.figureLayout.measurementEvidenceBody.labelEvidence.extra = true
  assert.equal(validate(malformed), false)
  const onlyLegacy = { ...value, inImageOptionLabels: [legacy] }
  assert.equal(validate(onlyLegacy), false)
})
