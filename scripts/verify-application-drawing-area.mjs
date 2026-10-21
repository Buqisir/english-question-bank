import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { admitCanonicalPaperImport, loadPaperForConsumptionSync } from '../server/paper-canonical/publication.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { assertApplicationGivenOwnership } from './import-pipeline/lib-nck1-new-paper-locks.mjs'
import { applyStudentProductLayout, planStudentProductPdf } from '../server/draft-paper/studentProductPdf.mjs'
import { makeDrawingAreaCompilation, drawingAreaConsumption, makeDrawingAreaMaterialization, makeDrawingAreaSourceInput } from '../test-fixtures/paper-canonical/applicationDrawingAreaFixture.mjs'
import { validateNck1SourceMaterialization } from '../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { nck1MaterializationCandidateAuthorityRef } from '../shared/paper-canonical/authority.mjs'
import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { validateApplicationWritingContract } from '../shared/paper-canonical/applicationWriting.mjs'
import oldConsumer from '../standards/paper-canonical/consumers/print-pdf-v48.json' with { type: 'json' }

export function verifyDrawingAreaContract() {
const source = makeDrawingAreaMaterialization()
assert.deepEqual(validateNck1SourceMaterialization(source), [])
makeDrawingAreaCompilation({ labelFirst: true })
const docxCapture = makeDrawingAreaCompilation({ drawingDocx: true }).compilation.artifacts.sourceCapture
const docxObservation = docxCapture.observations.find(item => item.kind === 'application_drawing_area')
assert.deepEqual(docxCapture.sourceSpans.find(span => span.sourceSpanId === docxObservation.sourceSpanId).coordinate,
  { kind: 'docx_part', part: 'word/document.xml', selector: '//w:p[normalize-space(.)="作图处"]' })
for (const mutate of [
  area => { delete area.source },
  area => { area.source.kind = 'invalid' },
  area => { area.source.documentId = 'answers' },
  area => { area.source.region.width = 0 },
  area => { area.labelBlockRef = 'missing' },
  area => { area.placement = 'bottom_left' },
]) {
  const changed = structuredClone(source)
  mutate(changed.groups.find(group => group.family === 'application-writing').writingTask.drawingArea)
  assert(validateNck1SourceMaterialization(changed).length, 'invalid drawing source must fail')
}
const oldVersion = structuredClone(source)
oldVersion.schemaVersion = 'nck1-source-materialization-v4'
assert(validateNck1SourceMaterialization(oldVersion).length, 'v4 remains closed')
const oldAuthority = importCanonicalCandidate(makeDrawingAreaSourceInput(), undefined, {
  materializationAuthorityRef: nck1MaterializationCandidateAuthorityRef,
})
assert(oldAuthority.issues.some(issue => issue.code === 'MATERIALIZATION_DRAWING_AREA_UNSUPPORTED'))
const { compilation } = makeDrawingAreaCompilation()
const consumption = drawingAreaConsumption(compilation)
const selection = consumption.selections.find(item => item.familyContractId === 'application-writing')
const groupId = selection.groupIds[0]
const group = projectCanonicalConsumerGroup({ consumption, groupId, familyContractId: 'application-writing' })
assert.equal(group.answerRegion.drawingArea.text, '作图处')
assert.equal(group.answerRegion.givenTop[0].text, 'This is my logo for World Smile Day activities.')
assert.equal(group.answerRegion.givenBottom[0].text, 'Li Hua from Class 2, Senior 3')
assert(!group.promptBlocks.some(block => block.nodeId === group.answerRegion.drawingArea.labelBlockRef))
const legacy = structuredClone(consumption)
legacy.consumerContractRef = { id: oldConsumer.consumerId, version: oldConsumer.version, digest: oldConsumer.contractDigest }
assert.throws(() => projectCanonicalConsumerGroup({ consumption: legacy, groupId, familyContractId: 'application-writing' }))
const absent = drawingAreaConsumption(makeDrawingAreaCompilation({ drawing: false }).compilation)
const absentLegacy = structuredClone(absent)
absentLegacy.consumerContractRef = legacy.consumerContractRef
assert.deepEqual(projectCanonicalConsumerGroup({ consumption: absent, groupId, familyContractId: 'application-writing' }),
  projectCanonicalConsumerGroup({ consumption: absentLegacy, groupId, familyContractId: 'application-writing' }),
  'no drawing area preserves projected fields and both historical signatures')
const area = group.answerRegion.drawingArea
const canonical = compilation.artifacts.canonicalPaper.questionGroups.find(item => item.identity.groupId === groupId)
const capture = compilation.artifacts.sourceCapture
const observation = capture.observations.find(item => item.observationId === canonical.variant.response.drawingArea.authorityObservationRef)
assert(observation)
assert.deepEqual(observation.extraction, { adapterId: 'nck1-source-materialization', version: '9' })
assert.deepEqual(capture.sourceSpans.find(span => span.sourceSpanId === observation.sourceSpanId).coordinate,
  { kind: 'page_region', page: 1, region: { x: 0, y: 0, width: 1, height: 1 } })
assert.deepEqual(canonical.sourceMap.entries.find(entry => entry.target.kind === 'drawing_area').sourceSpanRefs,
  [observation.sourceSpanId])
const labelInline = canonical.content.blocks.find(block => block.nodeId === area.labelBlockRef).inlines[0]
assert(!canonical.sourceMap.entries.find(entry => entry.target.id === labelInline.nodeId).sourceSpanRefs.includes(observation.sourceSpanId),
  'label retains its own source paragraph evidence')
const packageWithoutMapping = { plan: compilation.artifacts.canonicalPaper.paperPlan,
  groups: structuredClone(compilation.artifacts.canonicalPaper.questionGroups), sourceCapture: capture }
packageWithoutMapping.groups.find(item => item.identity.groupId === groupId).sourceMap.entries =
  canonical.sourceMap.entries.filter(entry => entry.target.kind !== 'drawing_area')
assert.throws(() => projectCanonicalPaper(packageWithoutMapping))
for (const mutate of [
  item => { item.observations = item.observations.filter(value => value.observationId !== observation.observationId) },
  item => { item.sourceSpans = item.sourceSpans.filter(value => value.sourceSpanId !== observation.sourceSpanId) },
  item => { item.observations.find(value => value.observationId === observation.observationId).value.groupId = 'another-group' },
]) {
  const changed = structuredClone(capture)
  mutate(changed)
  const issues = validateApplicationWritingContract({ groupId, content: canonical.content, variant: canonical.variant,
    questionIds: [], blankIds: [], sourceCapture: changed, allowDrawingArea: true })
  assert(issues.some(issue => issue.code === 'APPLICATION_DRAWING_AREA_UNPROVEN'))
}
assertApplicationGivenOwnership(canonical)
for (const mutate of [
  item => item.variant.promptBlockRefs.push(area.labelBlockRef),
  item => { item.variant.givenSkeleton.parts[0].blockRef = area.labelBlockRef },
  item => { item.content.blocks.find(block => block.nodeId === area.labelBlockRef).inlines = [] },
]) {
  const changed = structuredClone(canonical)
  mutate(changed)
  assert.throws(() => assertApplicationGivenOwnership(changed))
}
console.log('PASS drawing-area materialization, source authority, compiler, exclusive label projection and old-consumer rejection')
}

export function verifyDrawingAreaPublication() {
  const { sourceInput, confirmation } = makeDrawingAreaCompilation({ listening: false })
  const materialized = materializeNck1CanonicalRequest(sourceInput, confirmation)
  const admission = admitCanonicalPaperImport({ request: materialized.request, sourceAssetVersion: 1 })
  assert.equal(admission.ok, true, JSON.stringify(admission.diagnostics))
  const { sealed } = admission
  const ref = { paperId: sealed.manifest.paperId, versionName: 'v1', sourceAssetVersion: 1,
    publicationDigest: sealed.manifest.publicationDigest }
  const store = {
    readPublishedRefs: () => ({ current: ref, latest: ref }),
    readSourceAsset: () => sealed.sourceAsset,
    readVersionArtifact: (_ref, relativePath) => relativePath === `canonical/${sealed.manifest.schemaVersion}.json`
      ? new TextEncoder().encode(JSON.stringify(sealed.manifest))
      : sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath] || null,
  }
  for (const consumerContract of Object.values(consumerContractRefs)) {
    const loaded = loadPaperForConsumptionSync({ paperId: ref.paperId, version: 'v1', consumerContract }, store)
    assert.equal(loaded.disposition, 'ready', JSON.stringify(loaded.diagnostics))
    const selection = loaded.selections.find(item => item.familyContractId === 'application-writing')
    assert.equal(projectCanonicalConsumerGroup({ consumption: loaded, groupId: selection.groupIds[0],
      familyContractId: 'application-writing' }).answerRegion.drawingArea.text, '作图处')
  }
  const old = loadPaperForConsumptionSync({ paperId: ref.paperId, version: 'v1',
    consumerContract: { id: oldConsumer.consumerId, version: oldConsumer.version, digest: oldConsumer.contractDigest } }, store)
  assert.equal(old.disposition, 'incompatible')
  assert.equal(old.diagnostics[0].code, 'CANONICAL_CONSUMER_APPLICATION_DRAWING_AREA_UNAVAILABLE')
  console.log('PASS drawing-area live admission, sealed publication, reopen Screen/Print and legacy consumer rejection')
}

export async function verifyDrawingAreaProductPolicy() {
  const html = '<html><head><style>@page{size:A4;margin: 21mm 24mm 24mm 24mm;}</style></head><body><section data-canonical-group-id="application"><div class="canonical-application-response"><div data-canonical-drawing-area-id="area">作图处</div></div></section></body></html>'
  const layout = { profile: 'student-friendly-v1', fontSizePt: 12, figureLayout: 'natural',
    answerBoxHeightsMm: { application: 65, continuation: 57 } }
  for (const edition of ['largeComplete', 'largeNoListening', 'economy8']) {
    assert(applyStudentProductLayout(html, layout, edition).includes('作图处'))
    assert.throws(() => applyStudentProductLayout(html,
      { ...layout, answerBoxHeightsMm: { application: 24, continuation: 57 } }, edition),
    error => error.code === 'PAPER_LAYOUT_OVERFLOW')
    const heights = []
    const result = await planStudentProductPdf(html, { edition, listeningSectionCount: 2,
      render: async source => {
        const height = Number(source.match(/canonical-application-response\{height:(\d+)mm/)?.[1])
        heights.push(height)
        return { pageCount: 8, inspection: [{ id: 'application', type: 'writing', pages: [7], applicationPresent: true,
          applicationPromptPages: [7], applicationAnswerPages: [7], applicationPromptPage: 7, applicationAnswerPage: 7 }],
          pdfBytes: Buffer.from('fixture') }
      } })
    assert(heights.length && heights.every(height => height >= 65))
    assert(result.layout.answerBoxHeightsMm.application >= 65)
  }
  console.log('PASS drawing-area all question products retain 65mm and explicitly reject 24mm')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDrawingAreaContract()
  verifyDrawingAreaPublication()
  await verifyDrawingAreaProductPolicy()
}
