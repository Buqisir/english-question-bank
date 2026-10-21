// verify-resource: browser-render
// Source-proven v6 -> confirmed admission -> archive/reopen -> public consumers.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { makeSyntheticNck1OcrFixture } from '../test-fixtures/paper-import/nck1-ocr-evidence-v1/fixture.mjs'
import { verifyReadingStemFigures } from '../test-fixtures/paper-import/nck1-ocr-evidence-v1/stem-figures.mjs'
import { makeDrawingAreaSourceInput } from '../test-fixtures/paper-canonical/applicationDrawingAreaFixture.mjs'
import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs, consumerContractRefsForAuthority } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { buildCanonicalReadingConsumptionSurfaceData, buildCanonicalApplicationWritingConsumptionSurfaceData } from '../shared/paper-normalization/canonicalPaperGroupSurfaceAdapter.mjs'
import { digestJson, sha256, withoutKey } from '../shared/paper-canonical/stable.mjs'
import { materializeNck1CanonicalRequest } from '../server/paper-canonical/nck1MaterializationCanonicalRequest.mjs'
import { admitCanonicalPaperImport, loadPaperForConsumption, loadPaperForConsumptionSync, validateCanonicalPublicationBundle } from '../server/paper-canonical/publication.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { buildAnswerOnlyHtml } from '../server/answer-renderer.mjs'
import { prepareSourceReferences } from '../server/paper-import/sourceReferences.mjs'
import { resolveConfirmedNck1OcrEvidence } from '../server/paper-import/nck1OcrSourceEvidence.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'
import { applyStudentProductLayout, renderExplicitStudentProductPdf } from '../server/draft-paper/studentProductPdf.mjs'
import { applyPlannedGroupBreaks } from '../server/draft-paper/fixedPagePdfPlanner.mjs'
import { renderPaginatedPaper } from '../server/draft-paper/paginationRenderer.mjs'
import { closeChromiumPool } from '../server/draft-paper/chromiumPool.mjs'
import { rasterPdfRegion } from '../server/paper-canonical/pdfRegionRaster.mjs'

const bytes = value => new TextEncoder().encode(JSON.stringify(value))
const historicalOutputs = new Map()
// v6 inherits Drawing Area admission and its presentation policy; v5 keeps its
// exact historical authority, publication schema and default consumers.
for (const version of [5, 6]) for (const structuredAnswerRegion of [false, true]) {
  const input = makeDrawingAreaSourceInput({ listening: false, structuredAnswerRegion })
  const materialization = JSON.parse(new TextDecoder().decode(input.materializationBytes))
  materialization.schemaVersion = `nck1-source-materialization-v${version}`
  input.materializationBytes = bytes(materialization)
  const imported = importCanonicalCandidate(input)
  assert.deepEqual(imported.issues, [])
  const confirmation = { schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: imported.candidate.candidateDigest, sourceDigest: imported.candidate.source.sha256, confirmed: true }
  const { request } = materializeNck1CanonicalRequest(input, confirmation)
  const admitted = admitCanonicalPaperImport({ request, sourceAssetVersion: 1 })
  assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics))
  assert.equal(admitted.sealed.manifest.schemaVersion, `canonical-paper-publication-v${version === 5 ? 69 : 70}`)
  const screenModels = []
  for (const [consumerId, consumption] of Object.entries(admitted.consumers)) {
    assert.equal(consumption.authorityRef.manifestVersion, version === 5 ? '69' : '71')
    assert.equal(consumption.consumerContractRef.version,
      consumerId === 'screen' ? (version === 5 ? '48' : '49') : (version === 5 ? '49' : '50'))
    const groupId = materialization.groups.find(group => group.family === 'application-writing').groupId
    assert.equal(projectCanonicalConsumerGroup({ consumption, groupId,
      familyContractId: 'application-writing' }).answerRegion.drawingArea.text, structuredAnswerRegion ? '（做图处）' : '作图处')
    if (consumerId === 'screen') {
      for (const group of materialization.groups.filter(group => group.family === 'reading')) {
        const model = buildCanonicalReadingConsumptionSurfaceData({ consumption, groupId: group.groupId })
        screenModels.push({ surfaceData: model.surfaceData, richBlocks: model.richBlocks, passageLetter: model.passageLetter })
      }
      const model = buildCanonicalApplicationWritingConsumptionSurfaceData({ consumption, groupId })
      screenModels.push({ surfaceData: model.surfaceData, promptBlocks: model.promptBlocks, answerRegion: model.answerRegion })
    }
  }
  const output = { screen: screenModels, print: printHtml(admitted.consumers.print_pdf) }
  if (version === 5) historicalOutputs.set(structuredAnswerRegion, output)
  else assert.deepEqual(output, historicalOutputs.get(structuredAnswerRegion),
    'v6 without stemFigures preserves v5 Screen content/layout and Print HTML bytes')
}
console.log('PASS v5 fixed Screen48/Print49, v6 Screen49/Print50, identical no-stem Screen/Print output and inherited Drawing Area')
const paperId = 'paper-synthetic-jinan-stem-map'
const fixture = await verifyReadingStemFigures(await makeSyntheticNck1OcrFixture({ paperId }),
  { onlyPositive: true, drawingArea: process.argv.includes('--with-drawing-area'),
    cropDensity: process.argv.includes('--render') ? 576 : 144 })
const sourceInput = structuredClone(fixture.candidate.sourceInput)
const mat = JSON.parse(new TextDecoder().decode(sourceInput.materializationBytes))
// One selected deterministic rendition and one original crop must both survive
// sealing. The enhancement recipe is independently replayed by the real adapter.
const image = sourceInput.media[0]
image.renditionBytes = new Uint8Array(execFileSync('magick', ['-', '-auto-orient', '-strip', '-colorspace', 'sRGB',
  '-contrast-stretch', '0.5%x0.5%', '-unsharp', '0x0.75+0.75+0.008', 'png32:-'], { input: image.bytes }))
const inventory = mat.media.find(media => media.mediaId === image.mediaId)
inventory.publication = { selection: 'deterministic_enhancement', sourceSha256: inventory.sha256,
  candidate: { kind: 'deterministic_enhancement', mimeType: 'image/png', sha256: sha256(image.renditionBytes),
    pixelWidth: inventory.pixelWidth, pixelHeight: inventory.pixelHeight, tool: 'imagemagick',
    toolVersion: execFileSync('magick', ['-version'], { encoding: 'utf8' }).split('\n')[0].trim(),
    preset: 'document-light-cleanup-v1' } }
sourceInput.materializationBytes = bytes(mat)
const imported = importCanonicalCandidate(sourceInput)
assert.deepEqual(imported.issues, [])
const candidate = imported.candidate
const confirmation = { schemaVersion: 'teacher-confirmation-v1', candidateDigest: candidate.candidateDigest,
  sourceDigest: candidate.source.sha256, confirmed: true }
const { request } = materializeNck1CanonicalRequest(sourceInput, confirmation)
const admitted = admitCanonicalPaperImport({ request, sourceAssetVersion: 1 })
assert.equal(admitted.ok, true, JSON.stringify(admitted.diagnostics))
const { sealed } = admitted
assert.equal(sealed.manifest.schemaVersion, 'canonical-paper-publication-v70')
const scratch = mkdtempSync(path.join(tmpdir(), 'eqb-reading-stem-figures-'))
const outputArg = process.argv.indexOf('--output-dir')
const outputDir = outputArg < 0 ? null : path.resolve(process.argv[outputArg + 1])
function save(root, file, value) {
  const target = path.join(root, file)
  mkdirSync(path.dirname(target), { recursive: true })
  writeFileSync(target, value)
}
function printHtml(consumption) {
  const payload = canonicalConsumptionPrintPayload(consumption, '济南式 Q21 地图题 · 原创合成验证卷')
  return buildPrintHtml({ ...payload, versionType: 'student', canonicalConsumption: consumption,
    items: payload.items.map(item => ({ detail: payload.details.get(item.questionGroupId), note: '', score: 0, sectionTitle: '' })) })
}
function publicGroup(consumption) {
  const groupId = mat.groups.find(group => group.slotId === 'reading.a').groupId
  return projectCanonicalConsumerGroup({ consumption, familyContractId: 'reading', groupId })
}
function rebind(consumption) {
  for (const selection of consumption.selections) if (selection.projectedOccurrenceDigests) {
    selection.projectedOccurrenceDigests = selection.projectedOccurrences.map(occurrence =>
      ({ groupId: occurrence.groupId, digest: digestJson(occurrence) }))
  }
  return consumption
}
try {
  const manifestPath = 'canonical/canonical-paper-publication-v71.json'
  for (const [file, value] of Object.entries({ ...sealed.artifacts, ...sealed.sourceEvidence,
    [manifestPath]: bytes(sealed.manifest), 'canonical/source-asset.bin': sealed.sourceAsset })) save(scratch, file, value)
  const ref = { paperId, versionName: 'v1', sourceAssetVersion: 1, publicationDigest: sealed.manifest.publicationDigest }
  const store = { readPublishedRefs: () => ({ current: ref, latest: ref }),
    readSourceAsset: () => readFileSync(path.join(scratch, 'canonical/source-asset.bin')),
    readVersionArtifact: (_ref, file) => existsSync(path.join(scratch, file)) ? readFileSync(path.join(scratch, file)) : null }
  const reopened = validateCanonicalPublicationBundle({ manifest: JSON.parse(readFileSync(path.join(scratch, manifestPath))),
    sourceAsset: store.readSourceAsset(), readArtifact: file => store.readVersionArtifact(ref, file) })
  assert.throws(() => validateCanonicalPublicationBundle({
    manifest: { ...sealed.manifest, unexpectedField: true }, sourceAsset: sealed.sourceAsset,
    readArtifact: file => store.readVersionArtifact(ref, file),
  }), { code: 'CANONICAL_PUBLICATION_SCHEMA_INVALID' })
  const invalidReportManifest = structuredClone(sealed.manifest)
  const reportDescriptor = invalidReportManifest.artifacts.find(artifact => artifact.role === 'normalization_report')
  const invalidReport = bytes({
    ...JSON.parse(store.readVersionArtifact(ref, reportDescriptor.relativePath)), unexpectedField: true,
  })
  Object.assign(reportDescriptor, { byteLength: invalidReport.byteLength, sha256: sha256(invalidReport) })
  invalidReportManifest.publicationDigest = digestJson(withoutKey(invalidReportManifest, 'publicationDigest'))
  assert.throws(() => validateCanonicalPublicationBundle({
    manifest: invalidReportManifest, sourceAsset: sealed.sourceAsset,
    readArtifact: file => file === reportDescriptor.relativePath ? invalidReport : store.readVersionArtifact(ref, file),
  }), error => error.code === 'CANONICAL_PUBLICATION_ARTIFACT_SCHEMA_INVALID')
  console.log('PASS v71 binds v70 publication/report schemas and rejects unknown fields with recomputed digests')
  const consumers = Object.fromEntries(['screen', 'print_pdf'].map(consumerId => {
    const result = loadPaperForConsumptionSync({ paperId, consumerId }, store)
    assert.equal(result.disposition, 'ready', JSON.stringify(result.diagnostics))
    assert.deepEqual(result.consumerContractRef, consumerContractRefsForAuthority(result.authorityRef)[consumerId])
    const group = publicGroup(result)
    assert.deepEqual(group.questions[0].stemFigures.map(figure => figure.nodeId),
      mat.groups[0].questions[0].stemFigures.map(figure => figure.blockId))
    assert.equal(group.questions[0].stemFigures[0].mediaArtifact.sha256, inventory.publication.candidate.sha256)
    assert.equal(group.questions[0].stemFigures[1].mediaArtifact.sha256, mat.media[1].sha256)
    assert.deepEqual(group.questions[0].stemFigures.map(figure => figure.caption), ['', ''])
    assert.deepEqual(group.questions[0].stemFigures.map(figure => figure.media.presentation), mat.media.map(media => media.presentation))
    return [consumerId, result]
  }))
  assert.deepEqual(await loadPaperForConsumption({ paperId, consumerId: 'screen' }, store), consumers.screen)
  const model = buildCanonicalReadingConsumptionSurfaceData({ consumption: consumers.screen, groupId: publicGroup(consumers.screen).groupId })
  assert.equal(model.surfaceData.questions[0].stemFigures.length, 2)
  assert.equal(reopened.plan.authorityRef.manifestVersion, '71')
  for (const consumerContract of Object.values(consumerContractRefs)) {
    const old = loadPaperForConsumptionSync({ paperId, consumerContract }, store)
    assert.equal(old.disposition, 'incompatible')
    assert.equal(old.diagnostics[0].code, 'CANONICAL_CONSUMER_STEM_FIGURE_UNAVAILABLE')
  }
  console.log('PASS v71 confirmed admission, disk archive/reopen, source crop + rendition, both public consumers and normalization')
  const mediaDocuments = reopened.sourceCapture.documents.filter(document =>
    /^(source|candidate)_media_/u.test(document.inputKey))
  assert.equal(mediaDocuments.length, 3, 'Two original crops and the selected rendition must each remain archived')
  const originalPdf = reopened.sourceCapture.documents.find(document => document.mediaType === 'application/pdf')
  for (const document of [...mediaDocuments, originalPdf]) {
    const file = document.immutableArtifactRef.relativePath
    for (const missing of [true, false]) {
      const brokenStore = { ...store, readVersionArtifact: (ref, target) => {
        const value = store.readVersionArtifact(ref, target)
        if (target !== file) return value
        if (missing) return null
        const corrupted = new Uint8Array(value)
        corrupted[corrupted.length - 1] ^= 1
        return corrupted
      } }
      assert.equal(loadPaperForConsumptionSync({ paperId, consumerId: 'screen' }, brokenStore).disposition, 'incompatible')
    }
  }
  const corruptManifest = { ...store, readVersionArtifact: (ref, file) =>
    file === manifestPath ? bytes({ ...sealed.manifest, sourceAssetDigest: sha256(bytes('wrong')) }) : store.readVersionArtifact(ref, file) }
  assert.equal(loadPaperForConsumptionSync({ paperId, consumerId: 'screen' }, corruptManifest).disposition, 'incompatible')
  for (const mode of ['caption', 'anchors', 'unplaced', 'bytes', 'consumer']) {
    const value = structuredClone(consumers.screen)
    const occurrence = value.selections.find(selection => selection.familyContractId === 'reading').projectedOccurrences[0]
    if (mode === 'caption') occurrence.questions[0].stemFigures[0].caption = [{ kind: 'text', nodeId: 'bad-caption', text: 'Library' }]
    if (mode === 'anchors') occurrence.anchors.contentNodeIds.pop()
    if (mode === 'unplaced') delete occurrence.questions[0].stemFigures
    if (mode === 'bytes') value.mediaArtifacts[0].encodedBytes = Buffer.from('wrong').toString('base64')
    if (mode === 'consumer') value.consumerContractRef = consumerContractRefs.screen
    assert.throws(() => publicGroup(rebind(value)), { code: 'CANONICAL_CONSUMPTION_REJECTED' }, mode)
  }
  console.log('PASS missing/corrupt source, selected rendition, manifest, caption, anchors, media bytes and old consumer fail closed')
  // Exercise the consumer's separate figure-option branch with independent
  // same-group option media. This is a projection probe, not source admission.
  const figureOptions = structuredClone(consumers.screen)
  const occurrence = figureOptions.selections.find(selection => selection.familyContractId === 'reading').projectedOccurrences[0]
  occurrence.questions[0].options = occurrence.questions[0].options.map(option => {
    const mediaId = `option-image:${option.optionId}`
    occurrence.media.push({ ...structuredClone(occurrence.media[0]), mediaId })
    figureOptions.mediaArtifacts.push({ ...structuredClone(figureOptions.mediaArtifacts[0]), mediaId })
    return { optionId: option.optionId, label: option.label, figure: { mediaId } }
  })
  assert.equal(publicGroup(rebind(figureOptions)).questions[0].stemFigures.length, 2)
  assert.equal(buildCanonicalReadingConsumptionSurfaceData({ consumption: figureOptions,
    groupId: occurrence.groupId }).surfaceData.questions[0].options.filter(option => option.figure).length, 4)
  assert.match(printHtml({ ...figureOptions,
    consumerContractRef: consumerContractRefsForAuthority(figureOptions.authorityRef).print_pdf }), /data-canonical-figure-options/)
  console.log('PASS text-option and figure-option branches retain ordered stem figures')
  const html = printHtml(consumers.print_pdf)
  assert(html.indexOf('stem-map-block-0') < html.indexOf('stem-map-block-1'))
  assert(!html.includes('<figcaption>Library'))
  const sourceReferences = prepareSourceReferences({ materialization: mat,
    sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest })
  const answerDocument = mat.documents.find(document => document.role === 'official_answers')
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents: fixture.documents,
    evidence: JSON.parse(new TextDecoder().decode(sourceInput.ocrSourceBytes.evidenceBytes)),
    confirmation: JSON.parse(new TextDecoder().decode(sourceInput.ocrSourceBytes.confirmationBytes)) })
  assert.deepEqual(resolved.issues, [])
  const referenceText = {
    application: ['Should We Join the Reading Club?', 'Join us on Friday to read and share ideas.'],
    continuation: ['Mia carried the notebook to the school office. The teacher found its owner.',
      'The next morning, a student came to thank her. They became friends.'],
  }
  for (const group of sourceReferences.groups) {
    group.scoring = { state: 'not_supplied', entries: [], evidence: [{ documentSha256: answerDocument.sha256,
      locator: { kind: 'page_region', documentId: answerDocument.documentId, page: 1,
        region: { x: 0, y: 0, width: 1, height: 1 } } }] }
    group.essays = { state: 'captured', evidence: [], entries: [{
      referenceId: `source-reference:${group.groupId}`, authority: 'source_reference', sourceLabel: null, labelSource: null,
      paragraphs: referenceText[group.taskType].map((text, index) => {
        const matches = resolved.structures.get(answerDocument.documentId).paragraphs.filter(paragraph => paragraph.text === text)
        assert.equal(matches.length, 1)
        return { paragraphId: `source-reference:${group.groupId}:${index}`, role: group.taskType === 'application' && index === 0 ? 'title' : 'body',
          text, source: { documentSha256: answerDocument.sha256, locator: matches[0].sourceIndex } }
      }),
    }] }
  }
  const answerHtml = buildAnswerOnlyHtml({ paperName: '济南式 Q21 地图题 · 原创合成验证卷', materialization: mat,
    sourceReferences, sourceDigest: candidate.source.sha256, candidateDigest: candidate.candidateDigest,
    sourceDocuments: sourceInput.documents })
  assert(!/<figure|<img|Library|stem-map-block/u.test(answerHtml))
  console.log('PASS answerOnly excludes all question stem maps and image labels')
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true })
    save(outputDir, 'screen-consumption.json', bytes(consumers.screen))
    save(outputDir, 'figure-options-screen-consumption.json', bytes(figureOptions))
    save(outputDir, 'print.html', html)
    save(outputDir, 'answerOnly.html', answerHtml)
    save(outputDir, 'source-question.pdf', sourceInput.documents[0].bytes)
    save(outputDir, 'publication-v70.json', bytes(sealed.manifest))
    save(outputDir, 'materialization-v6.json', bytes(mat))
    for (const [file, value] of Object.entries({ ...sealed.artifacts, ...sealed.sourceEvidence,
      [manifestPath]: bytes(sealed.manifest), 'canonical/source-asset.bin': sealed.sourceAsset })) {
      save(outputDir, `sealed/${file}`, value)
    }
    if (process.argv.includes('--render')) {
      const layout = { profile: 'student-friendly-v1', fontSizePt: 12, figureLayout: 'natural',
        answerBoxHeightsMm: { application: 65, continuation: 57 } }
      const noListening = structuredClone(consumers.print_pdf)
      const lastListeningIndex = noListening.visibleStructure.reduce((last, node, index) =>
        node.kind === 'group' && node.familyContractId === 'listening' ? index : last, -1)
      noListening.visibleStructure = noListening.visibleStructure.slice(lastListeningIndex + 1)
      noListening.visibleStructureDigest = digestJson(noListening.visibleStructure)
      noListening.selections = noListening.selections.filter(selection => selection.familyContractId !== 'listening')
      const geometry = []
      const render = async (html, options) => {
        const result = await renderPaginatedPaper(html, options)
        return result
      }
      for (const edition of ['largeComplete', 'largeNoListening', 'economy8']) {
        const fullHtml = edition === 'largeComplete' ? html : printHtml(noListening)
        // Explicit semantic group breaks exercise the actual 8-page product
        // without adding source text or using its separately approved 9-page exception.
        const plannedBreakGroupIds = mat.groups.filter((group, index) => edition === 'economy8'
          ? index > 0 && group.slotId !== 'grammar-fill'
          : group.slotId === 'writing.continuation').map(group => group.groupId)
        const selectedLayout = edition === 'economy8' ? { ...layout, profile: 'student-friendly-economy-v2' } : layout
        const result = await renderExplicitStudentProductPdf(fullHtml, { edition, layout: selectedLayout,
          plannedBreakGroupIds, render })
        save(outputDir, `${edition}.pdf`, result.pdfBytes)
        save(outputDir, `${edition}.html`, result.paginatedHtml)
        const inspected = await renderPaginatedPaper(applyPlannedGroupBreaks(applyStudentProductLayout(fullHtml, selectedLayout, edition), plannedBreakGroupIds), {
          inspect: page => page.evaluate(() => {
            const question = document.querySelector('.pagedjs_pages [data-canonical-stem-figures]')
            const page = question.closest('.pagedjs_page')
            const area = page.querySelector('.pagedjs_area').getBoundingClientRect()
            const stem = question.querySelector('.stem').getBoundingClientRect()
            const figures = [...question.querySelectorAll('figure')].map(figure => {
              const image = figure.querySelector('img')
              const box = image.getBoundingClientRect()
              return { blockId: figure.dataset.canonicalBlockId, top: box.top, bottom: box.bottom,
                width: box.width, height: box.height, aspect: image.naturalWidth / image.naturalHeight }
            })
            const option = question.querySelector('[data-canonical-option-id]').getBoundingClientRect()
            return { page: Number(page.dataset.pageNumber), stemBottom: stem.bottom, figures,
              firstOptionTop: option.top, questionBottom: question.getBoundingClientRect().bottom,
              areaTop: area.top, areaBottom: area.bottom,
              drawing: [...document.querySelectorAll('.pagedjs_pages [data-canonical-drawing-area-id]')].map(node => {
                const response = node.closest('.canonical-application-response')
                return { page: Number(node.closest('.pagedjs_page').dataset.pageNumber),
                  heightMm: response.getBoundingClientRect().height / 96 * 25.4,
                  label: node.textContent,
                  imageCount: node.closest('[data-canonical-group-id]').querySelectorAll('img').length }
              }) }
          }),
        })
        const box = inspected.inspection
        assert(box.stemBottom <= box.figures[0].top && box.figures[0].bottom <= box.figures[1].top
          && box.figures[1].bottom <= box.firstOptionTop)
        for (const figure of box.figures) assert(Math.abs(figure.width / figure.height / figure.aspect - 1) < 0.01)
        assert(box.questionBottom <= box.areaBottom + 1, 'stem, both maps and every option fit within the page')
        if (process.argv.includes('--with-drawing-area')) {
          assert.equal(box.drawing.length, 1)
          assert(Math.abs(box.drawing[0].heightMm - 65) < .3, 'drawing answer box stays 65mm')
          assert.equal(box.drawing[0].imageCount, 0, 'structured drawing area is not duplicated as an image')
          save(outputDir, `${edition}-drawing.png`, rasterPdfRegion({ pdfBytes: result.pdfBytes,
            page: box.drawing[0].page, region: { x: 0, y: 0, width: 1, height: 1 }, density: 120 }).bytes)
        }
        save(outputDir, `${edition}-q21.png`, rasterPdfRegion({ pdfBytes: result.pdfBytes,
          page: box.page, region: { x: 0, y: 0, width: 1, height: 1 }, density: 120 }).bytes)
        geometry.push({ edition, pageCount: result.pageCount, ...box })
        console.log(`PASS ${edition}: Q21 stem -> maps -> options, page ${box.page}/${result.pageCount}, intact aspect ratio`)
      }
      save(outputDir, 'geometry.json', bytes(geometry))
      const answerPdf = await renderPaginatedPaper(answerHtml)
      save(outputDir, 'answerOnly.pdf', answerPdf.pdfBytes)
      save(outputDir, 'answerOnly.png', rasterPdfRegion({ pdfBytes: answerPdf.pdfBytes,
        page: 1, region: { x: 0, y: 0, width: 1, height: 1 }, density: 120 }).bytes)
      // Force a figure past the page's physical height. The reader must block
      // this case rather than flex-shrink an unreadable image or clip it.
      const oversized = html.replace('flex-shrink:0', 'flex-shrink:0;height:1400px')
      await assert.rejects(() => renderPaginatedPaper(oversized), error => error.code === 'PAPER_LAYOUT_OVERFLOW')
      console.log('PASS oversized stem figure blocks PDF instead of clipping or silently shrinking')
    }
    console.log(`Artifacts: ${outputDir}`)
  }
} finally {
  await closeChromiumPool()
  rmSync(scratch, { recursive: true, force: true })
}
