import assert from 'node:assert/strict'
import playwright from '../../../app/node_modules/playwright/index.js'
import { importCanonicalCandidate, compileNck1MaterializationCandidatePreview } from '../../../shared/paper-canonical/compiler.mjs'
import { validateNck1SourceMaterialization } from '../../../shared/paper-canonical/nck1SourceMaterialization.mjs'
import { projectCanonicalConsumerGroup } from '../../../shared/paper-canonical/consumerProjection.mjs'
import { nck1MaterializationCandidateAuthorityRef, validateJsonSchema } from '../../../shared/paper-canonical/authority.mjs'
import { buildNck1ReviewConsumption } from '../../../server/import-review/revisionProjection.mjs'
import materializationV6Schema from '../../../schemas/paper-canonical/nck1-source-materialization-v6.schema.json' with { type: 'json' }
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { rasterPdfRegion } from '../../../server/paper-canonical/pdfRegionRaster.mjs'
import { produceNck1OcrMaterialization } from '../../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { buildNck1OcrSourceEvidence, nck1OcrEvidenceDigest, resolveConfirmedNck1OcrEvidence } from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'

const clone = structuredClone
const bytes = value => new TextEncoder().encode(JSON.stringify(value))

// Exercise the public import seam using original synthetic map drawings. The
// producer remains unchanged: B1 supplies only the new, independently proven
// ownership and v6 envelope, as the future producer will.
export async function verifyReadingStemFigures(fixture, {
  onlyPositive = false, drawingArea = false, cropDensity = 144,
} = {}) {
  const { paperId } = fixture
  const confirmation = clone(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const engineDocuments = clone(fixture.evidence.documents)
  const page = confirmation.documents[0].pages.find(page => page.orderedItems.some(item => item.text.startsWith('21. ')))
  const index = page.orderedItems.findIndex(item => item.text.startsWith('21. '))
  const item = page.orderedItems[index]
  const observed = engineDocuments[0].pages.find(value => value.page === page.page)
  const observation = observed.observations.find(value => item.observationIds.includes(value.observationId))
  const original = clone(observation.region)
  const originalText = item.text
  const split = originalText.indexOf('A.')
  assert(split > 0)
  item.text = observation.text = originalText.slice(0, split).trim()
  observation.region.height = original.height * 0.2
  observed.regions.find(value => value.regionId === observation.regionId).region = clone(observation.region)
  const options = { ...clone(observation), observationId: 'stem-options-observation', regionId: 'stem-options-region',
    text: originalText.slice(split), region: { ...original, y: original.y + original.height * 0.8, height: original.height * 0.2 } }
  observed.observations.splice(observed.observations.indexOf(observation) + 1, 0, options)
  observed.regions.push({ regionId: options.regionId, kind: 'text', region: clone(options.region) })
  const optionItem = { itemId: 'stem-options-item', observationIds: [options.observationId], text: options.text }
  page.orderedItems.splice(index + 1, 0, optionItem)
  observed.readingOrderEdges = observed.observations.slice(1).map((value, index) =>
    ({ before: observed.observations[index].observationId, after: value.observationId }))
  // Two independent identical-looking maps are legitimate source positions.
  for (let i = 0; i < 2; i += 1) {
    const region = { x: original.x + original.width * i / 2, y: original.y + original.height * 0.3,
      width: original.width * 0.4, height: original.height * 0.4 }
    observed.regions.push({ regionId: `stem-map-${i}`, kind: 'visual', region })
    page.visualClassifications.push({ regionId: `stem-map-${i}`, classification: 'content_media',
      itemIds: [], afterItemId: item.itemId })
  }
  let template
  if (drawingArea) {
    const page = confirmation.documents[0].pages.find(page =>
      page.orderedItems.some(item => item.text === 'Should We Join the Reading Club?'))
    const index = page.orderedItems.findIndex(item => item.text === 'Should We Join the Reading Club?')
    const label = page.orderedItems[index]
    const observed = engineDocuments[0].pages.find(value => value.page === page.page)
    const observation = observed.observations.find(value => label.observationIds.includes(value.observationId))
    label.text = observation.text = '（做图处）'
    const region = clone(observation.region)
    const extras = ['This is my logo.', 'Li Hua'].map((text, i) => {
      const id = `stem-drawing-template-${i}`
      const box = { x: region.x + region.width * .05, y: region.y + region.height * (.1 + i * .3),
        width: region.width * .4, height: region.height * .2 }
      observed.regions.push({ regionId: id, kind: 'text', region: box })
      observed.observations.push({ ...clone(observation), observationId: id, regionId: id, text, region: box })
      return { itemId: id, observationIds: [id], text }
    })
    page.orderedItems.splice(index + 1, 0, ...extras)
    observed.regions.push({ regionId: 'stem-drawing-template', kind: 'visual', region })
    page.visualClassifications.push({ regionId: 'stem-drawing-template', classification: 'content_media',
      itemIds: [label.itemId, ...extras.map(item => item.itemId)], afterItemId: page.orderedItems[index - 1].itemId })
    template = { page, observed, region, items: [label, ...extras] }
  }
  const browser = await playwright.chromium.launch({ channel: 'chromium', headless: true })
  const documents = fixture.sourceDocuments.map(document => ({ ...document }))
  try {
    const view = await browser.newPage()
    const pages = Array.from({ length: documents[0].pageCount }, (_, i) => {
      const raster = rasterPdfRegion({ pdfBytes: documents[0].bytes, page: i + 1,
        region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      const overlay = i + 1 === page.page
        ? observed.regions.filter(region => region.regionId.startsWith('stem-map-')).map(({ region }) =>
          `<svg viewBox="0 0 100 30" preserveAspectRatio="none" style="position:absolute;left:${region.x * 100}%;top:${region.y * 100}%;width:${region.width * 100}%;height:${region.height * 100}%;box-shadow:0 0 0 1mm white"><rect width="100" height="30" fill="white"/><path d="M5 22H95M30 16V29M70 16V29" stroke="black"/><circle cx="30" cy="22" r="4"/><circle cx="70" cy="22" r="4"/><text x="5" y="13" font-size="16">Library</text></svg>`).join('')
        : ''
      const drawing = template && i + 1 === template.page.page
        ? `<div style="position:absolute;left:${template.region.x * 100}%;top:${template.region.y * 100}%;width:${template.region.width * 100}%;height:${template.region.height * 100}%;background:white;font-size:3px">（做图处） This is my logo. Li Hua</div>` : ''
      return `<section><img src="data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}">${overlay}${drawing}</section>`
    })
    await view.setContent(`<style>@page{size:A4;margin:0}body{margin:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{display:block;width:100%;height:100%}</style>${pages.join('')}`)
    const data = new Uint8Array(await view.pdf({ printBackground: true, preferCSSPageSize: true }))
    documents[0] = { ...documents[0], bytes: data, sha256: sha256(data), byteLength: data.byteLength }
  } finally {
    await browser.close()
  }
  const evidence = buildNck1OcrSourceEvidence({ paperId, documents, engine: { name: 'synthetic-stem-map', version: '1' },
    confidenceThreshold: 0.97, engineDocuments })
  confirmation.sourceSetDigest = evidence.sourceSetDigest
  confirmation.evidenceDigest = evidence.evidenceDigest
  const sourceBytes = (ev = evidence, cf = confirmation) =>
    ({ evidenceBytes: bytes(ev), confirmationBytes: bytes(cf) })
  const produced = produceNck1OcrMaterialization({ paperId, documents, evidence, confirmation })
  const expectedIssues = ['NCK1_OCR_MEDIA_ASSOCIATION_AMBIGUOUS', ...(drawingArea ? [
    'NCK1_OCR_MATERIALIZATION_FIGURE_INVALID', 'NCK1_OCR_MATERIALIZATION_WRITING_GIVENS_PLACEMENT_INVALID',
    'NCK1_OCR_MATERIALIZATION_WRITING_TASK_INVALID',
  ] : [])]
  assert(produced.review.required.every(issue => expectedIssues.includes(issue.code)),
    JSON.stringify(produced.review.required))
  assert(!produced.materialization.groups.some(group => group.questions.some(question => question.stemFigures)),
    'B1 must not enable the producer')
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents, evidence, confirmation })
  assert.deepEqual(resolved.issues, [])
  const mat = clone(produced.materialization)
  mat.schemaVersion = 'nck1-source-materialization-v6'
  mat.sourcePresentation = { listeningExample: null, instructions: [
    ['reading.a', '阅读下列短文，从每题所给的四个选项中选出最佳选项。'],
    ['seven-choices', '阅读下面短文，从短文后的选项中选出可以填入空白处的最佳选项。'],
    ['cloze', '阅读下面短文，从每题所给的四个选项中选出最佳选项。'],
    ['grammar-fill', '阅读下面材料，在空白处填入适当的单词或括号内单词的正确形式。'],
  ].map(([slotId, text]) => {
    const paragraphs = resolved.structures.get(documents[0].documentId).paragraphs.filter(value => value.text === text)
    assert.equal(paragraphs.length, 1)
    return { slotId, text, source: clone(paragraphs[0].sourceIndex) }
  }) }
  mat.issues = []
  const group = mat.groups.find(group => group.slotId === 'reading.a')
  const question = group.questions[0]
  const body = resolved.structures.get(documents[0].documentId).body
  const markers = body.filter(item => item.materializedMedia && item.sourceIndex.page === page.page)
  assert.equal(markers.length, 2)
  question.stemFigures = markers.map((marker, i) => ({ kind: 'figure', blockId: `stem-map-block-${i}`,
    mediaId: marker.materializedMedia.mediaId, caption: '', source: clone(marker.sourceIndex) }))
  const mediaFiles = []
  function recrop(media, sourceDocuments = documents) {
    const raster = rasterPdfRegion({ pdfBytes: sourceDocuments.find(value => value.documentId === media.extraction.documentId).bytes,
      ...media.extraction })
    media.sha256 = sha256(raster.bytes)
    media.pixelWidth = raster.pixelWidth
    media.pixelHeight = raster.pixelHeight
    media.publication = { selection: 'source_crop', sourceSha256: media.sha256 }
    return { mediaId: media.mediaId, bytes: raster.bytes }
  }
  mat.media = question.stemFigures.map(figure => {
    const media = { mediaId: figure.mediaId, usage: 'content', kind: 'figure', mimeType: 'image/png',
      // Render acceptance opts into more source pixels for enlarged maps;
      // ordinary import regressions retain the historical low-cost density.
      extraction: { ...clone(figure.source), kind: 'pdf_crop', density: cropDensity },
      presentation: { alignment: 'center', widthRatio: 0.5, spacingBefore: 'compact', spacingAfter: 'compact' } }
    mediaFiles.push(recrop(media))
    return media
  })
  mat.sourceCoverage.visuals = clone(resolved.sourceVisuals)
  if (template) {
    const application = mat.groups.find(group => group.family === 'application-writing')
    const index = application.blocks.findIndex(block => block.kind === 'figure')
    assert(index >= 0)
    const figure = application.blocks[index]
    const paragraphs = template.items.map((item, i) => {
      const observation = template.observed.observations.find(value => item.observationIds.includes(value.observationId))
      const { x, y, width, height } = observation.region
      return { kind: 'paragraph', blockId: `block:stem-drawing-template-${i}`, role: 'body',
        content: [{ kind: 'text', text: item.text }],
        source: { kind: 'page_region', documentId: documents[0].documentId, page: template.page.page,
          region: { x, y, width: x + width - x, height: y + height - y } } }
    })
    application.blocks.splice(index, 1, ...paragraphs)
    application.writingTask.drawingArea = { placement: 'top_right',
      labelBlockRef: paragraphs[0].blockId, source: clone(figure.source) }
    application.writingTask.givenSkeleton = template.items.slice(1).map((item, i) =>
      ({ role: i ? 'signature' : 'opening', text: item.text }))
    const visual = mat.sourceCoverage.visuals.find(value => value.targetId === figure.mediaId)
    visual.disposition = 'structured_answer_region'
    visual.targetId = application.groupId
  }
  function imported(materialization = mat, files = mediaFiles, closure = sourceBytes(), docs = documents) {
    return importCanonicalCandidate({ kind: 'nck1-source-materialization', materializationBytes: bytes(materialization),
      documents: docs.map(({ documentId, bytes }) => ({ documentId, bytes })), media: files, ocrSourceBytes: closure })
  }
  assert.deepEqual(validateNck1SourceMaterialization(mat), [])
  assert.deepEqual(validateJsonSchema(mat, materializationV6Schema), [])
  const accepted = imported()
  assert.deepEqual(accepted.issues, [], JSON.stringify(accepted.issues))
  const derived = accepted.candidate.interpretation.groups.find(value => value.groupId === group.groupId)
  assert.deepEqual(derived.variant.questions[0].stemFigures, question.stemFigures.map(figure => ({
    kind: 'figure', nodeId: figure.blockId, mediaId: figure.mediaId, caption: [],
  })))
  assert.equal(derived.media.length, 2, 'adapter media count includes both stem figures')
  for (const figure of question.stemFigures) {
    assert.deepEqual(derived.sourceSpanRefsByTarget[`content_node:${figure.blockId}`],
      [`source-span:observation:stem-figure:${figure.blockId}`])
  }
  const preview = compileNck1MaterializationCandidatePreview(accepted.candidate)
  assert(preview.compilation, JSON.stringify(preview.unresolvedIssues))
  assert.equal(preview.compilation.artifacts.canonicalPaper.paperPlan.authorityRef.manifestVersion, '71')
  const oldAuthority = importCanonicalCandidate(accepted.candidate.sourceInput, undefined,
    { materializationAuthorityRef: nck1MaterializationCandidateAuthorityRef })
  assert(oldAuthority.issues.some(issue => issue.code === 'MATERIALIZATION_AUTHORITY_UNSUPPORTED'))
  console.log('PASS OCR stem figures: q21 synthetic maps, ordered Canonical figures, media count and source spans')
  if (onlyPositive) return { candidate: accepted.candidate, compilation: preview.compilation,
    materialization: mat, documents, mediaFiles }

  {
    const ev = clone(evidence)
    const cf = clone(confirmation)
    const removed = cf.documents[0].pages.find(value => value.page === page.page).visualClassifications
      .find(value => value.regionId === 'stem-map-1')
    cf.documents[0].pages.find(value => value.page === page.page).visualClassifications =
      cf.documents[0].pages.find(value => value.page === page.page).visualClassifications.filter(value => value !== removed)
    ev.documents[0].pages.find(value => value.page === page.page).regions =
      ev.documents[0].pages.find(value => value.page === page.page).regions.filter(value => value.regionId !== removed.regionId)
    ev.evidenceDigest = nck1OcrEvidenceDigest(ev)
    cf.evidenceDigest = ev.evidenceDigest
    const singleProduced = produceNck1OcrMaterialization({ paperId, documents, evidence: ev, confirmation: cf })
    const singleResolved = resolveConfirmedNck1OcrEvidence({ paperId, documents, evidence: ev, confirmation: cf })
    const onlyId = singleResolved.contentMedia[0].mediaId
    const single = clone(mat)
    const q = single.groups[0].questions[0]
    q.stem = singleProduced.materialization.groups[0].questions[0].stem
    q.stemFigures = q.stemFigures.filter(figure => figure.mediaId === onlyId)
    single.media = single.media.filter(media => media.mediaId === onlyId)
    single.sourceCoverage.visuals = clone(singleResolved.sourceVisuals)
    const result = imported(single, mediaFiles.filter(file => file.mediaId === onlyId), sourceBytes(ev, cf))
    assert.deepEqual(result.issues, [])
    assert.equal(result.candidate.interpretation.groups[0].variant.questions[0].stemFigures.length, 1)
    console.log('PASS OCR stem figures: single q21 map')
  }

  {
    const ev = clone(evidence)
    const sameBytes = clone(mat)
    const ep = ev.documents[0].pages.find(value => value.page === page.page)
    const files = []
    for (const media of sameBytes.media) {
      const region = ep.regions.find(value => value.kind === 'visual'
        && JSON.stringify(value.region) === JSON.stringify(media.extraction.region))
      // Two independent white corner pixels of the synthetic maps have equal
      // bytes. Identity is document/page/region, never the image SHA alone.
      const raster = ep.raster
      region.region = { x: (Math.round(region.region.x * raster.pixelWidth) + 1) / raster.pixelWidth,
        y: (Math.round(region.region.y * raster.pixelHeight) + 1) / raster.pixelHeight,
        width: 1 / raster.pixelWidth, height: 1 / raster.pixelHeight }
      media.extraction.region = clone(region.region)
      sameBytes.groups[0].questions[0].stemFigures.find(figure => figure.mediaId === media.mediaId).source.region = clone(region.region)
      sameBytes.sourceCoverage.visuals.find(value => value.targetId === media.mediaId).region = clone(region.region)
      files.push(recrop(media))
    }
    assert.equal(sameBytes.media[0].sha256, sameBytes.media[1].sha256, 'fixture must exercise equal image bytes')
    ev.evidenceDigest = nck1OcrEvidenceDigest(ev)
    const cf = { ...clone(confirmation), evidenceDigest: ev.evidenceDigest }
    const result = imported(sameBytes, files, sourceBytes(ev, cf))
    assert.deepEqual(result.issues, [], 'equal SHA at independent confirmed regions must remain valid')
    console.log('PASS OCR stem figures: equal image SHA at distinct confirmed regions')
  }

  // Public consumer independently resolves the same figure artifacts, preserving
  // the question-owned field and enforcing exactly-once media placement.
  const consumption = buildNck1ReviewConsumption(accepted.candidate, preview.compilation)
  const consumer = projectCanonicalConsumerGroup({ consumption,
    groupId: group.groupId, familyContractId: 'reading' })
  assert.equal(consumer.questions[0].stemFigures.length, 2)
  assert.equal(consumer.questions[0].stemFigures[0].mediaId, question.stemFigures[0].mediaId)
  console.log('PASS OCR stem figures: public consumer keeps ordered question-owned figures')

  const cases = [
    'move-to-q22', 'move-to-passage', 'move-to-options', 'duplicate-passage-consumption',
    'duplicate-option-consumption', 'duplicate-question-consumption', 'same-region-alias', 'confirmed-region-alias',
    'unconsumed-media', 'missing-media-inventory', 'missing-media-bytes',
    'crop-out-of-bounds', 'pdf-sha-mismatch', 'image-sha-mismatch', 'image-dimensions-mismatch',
    'crop-replay-mismatch', 'top-trim', 'wrong-question-source', 'combined-question-answers-source',
    'figure-inside-options', 'figure-after-next-question', 'cross-unconsumed-text',
    'reversed-figures', 'missing-confirmation', 'legacy-v4-field', 'legacy-v5-field', 'non-reading-field',
    'empty-stem-figures', 'null-stem-figure', 'non-figure-stem-block', 'invented-caption', 'confirmed-label-caption',
  ]
  for (const name of cases) {
    const invalid = clone(mat)
    const files = clone(mediaFiles)
    const ev = clone(evidence)
    const cf = clone(confirmation)
    const g = invalid.groups.find(value => value.groupId === group.groupId)
    const q = g.questions[0]
    const [figure] = q.stemFigures
    const media = invalid.media.find(value => value.mediaId === figure.mediaId)
    const confirmedPage = cf.documents[0].pages.find(value => value.page === page.page)
    const visual = confirmedPage.visualClassifications.find(value => value.regionId.startsWith('stem-map-'))
    const resetFiles = () => files.splice(files.findIndex(value => value.mediaId === media.mediaId), 1, recrop(media))
    if (name === 'move-to-q22') { g.questions[1].stemFigures = q.stemFigures; delete q.stemFigures }
    else if (name === 'move-to-passage') { g.blocks.push(...q.stemFigures); delete q.stemFigures }
    else if (name === 'move-to-options') { q.options = 'ABCD'.split('').map(label => ({ label, figure: { mediaId: figure.mediaId } })); delete q.stemFigures }
    else if (name === 'duplicate-passage-consumption') g.blocks.push({ ...clone(figure), blockId: 'duplicate-passage-map' })
    else if (name === 'duplicate-option-consumption') q.options = 'ABCD'.split('').map(label => ({ label, figure: { mediaId: figure.mediaId } }))
    else if (name === 'duplicate-question-consumption') g.questions[1].stemFigures = [clone(figure)]
    else if (name === 'same-region-alias') {
      const alias = { ...clone(media), mediaId: 'stem-map-region-alias' }
      invalid.media.push(alias)
      q.stemFigures.push({ ...clone(figure), blockId: 'stem-map-region-alias', mediaId: alias.mediaId })
      files.push({ mediaId: alias.mediaId, bytes: clone(files[0].bytes) })
      invalid.sourceCoverage.visuals.push({ visualId: 'stem-map-region-alias', page: alias.extraction.page,
        region: clone(alias.extraction.region), disposition: 'content_media', targetId: alias.mediaId })
    } else if (name === 'confirmed-region-alias') {
      const ep = ev.documents[0].pages.find(value => value.page === page.page)
      ep.regions.push({ regionId: 'confirmed-map-alias', kind: 'visual', region: clone(figure.source.region) })
      confirmedPage.visualClassifications.push({ regionId: 'confirmed-map-alias', classification: 'content_media',
        itemIds: [], afterItemId: item.itemId })
      ev.evidenceDigest = nck1OcrEvidenceDigest(ev)
      cf.evidenceDigest = ev.evidenceDigest
      const closure = resolveConfirmedNck1OcrEvidence({ paperId, documents, evidence: ev, confirmation: cf })
      assert.deepEqual(closure.issues, [])
      const order = closure.structures.get(documents[0].documentId).body.filter(item => item.materializedMedia)
      const aliasId = order.find(item => !invalid.media.some(media => media.mediaId === item.materializedMedia.mediaId)).materializedMedia.mediaId
      invalid.media.push({ ...clone(media), mediaId: aliasId })
      files.push({ mediaId: aliasId, bytes: clone(files.find(file => file.mediaId === figure.mediaId).bytes) })
      const priorFigures = q.stemFigures
      q.stemFigures = order.map(marker => priorFigures.find(value => value.mediaId === marker.materializedMedia.mediaId)
        || { ...clone(figure), blockId: 'confirmed-map-alias', mediaId: aliasId })
      q.stem = produceNck1OcrMaterialization({ paperId, documents, evidence: ev, confirmation: cf })
        .materialization.groups[0].questions[0].stem
      invalid.sourceCoverage.visuals = clone(closure.sourceVisuals)
    } else if (name === 'unconsumed-media') delete q.stemFigures
    else if (name === 'missing-media-inventory') invalid.media = invalid.media.filter(value => value.mediaId !== figure.mediaId)
    else if (name === 'missing-media-bytes') files.splice(files.findIndex(value => value.mediaId === figure.mediaId), 1)
    else if (name === 'crop-out-of-bounds') media.extraction.region.width = 1
    else if (name === 'pdf-sha-mismatch') invalid.documents[0].sha256 = `sha256:${'0'.repeat(64)}`
    else if (name === 'image-sha-mismatch') media.sha256 = media.publication.sourceSha256 = `sha256:${'0'.repeat(64)}`
    else if (name === 'image-dimensions-mismatch') media.pixelWidth += 1
    else if (name === 'crop-replay-mismatch') { media.extraction.region.y += 0.0001; figure.source.region.y += 0.0001 }
    else if (name === 'top-trim') {
      media.extraction.region.y += 0.0001; media.extraction.region.height -= 0.0001
      figure.source.region = clone(media.extraction.region)
      invalid.sourceCoverage.visuals.find(value => value.targetId === media.mediaId).region = clone(media.extraction.region)
      resetFiles()
    } else if (name === 'wrong-question-source') {
      media.extraction.documentId = figure.source.documentId = invalid.documents[1].documentId
      resetFiles()
    } else if (name === 'combined-question-answers-source') invalid.documents[0].role = 'question_and_answers'
    else if (name === 'figure-inside-options') visual.afterItemId = optionItem.itemId
    else if (name === 'figure-after-next-question') visual.afterItemId = confirmedPage.orderedItems.find(value => value.text.startsWith('22. ')).itemId
    else if (name === 'cross-unconsumed-text') {
      const extra = { ...clone(options), observationId: 'unconsumed-stem-observation',
        regionId: 'unconsumed-stem-region', text: 'This is unconsumed source text.' }
      const extraItem = { itemId: 'unconsumed-stem-item', observationIds: [extra.observationId], text: extra.text }
      confirmedPage.orderedItems.splice(confirmedPage.orderedItems.findIndex(value => value.itemId === item.itemId) + 1, 0, extraItem)
      const ep = ev.documents[0].pages.find(value => value.page === page.page)
      ep.observations.splice(ep.observations.findIndex(value => value.observationId === observation.observationId) + 1, 0, extra)
      ep.regions.push({ regionId: extra.regionId, kind: 'text', region: clone(extra.region) })
      ep.readingOrderEdges = ep.observations.slice(1).map((value, index) =>
        ({ before: ep.observations[index].observationId, after: value.observationId }))
      visual.afterItemId = extraItem.itemId
    } else if (name === 'reversed-figures') q.stemFigures.reverse()
    else if (name === 'legacy-v5-field') invalid.schemaVersion = 'nck1-source-materialization-v5'
    else if (name === 'legacy-v4-field') invalid.schemaVersion = 'nck1-source-materialization-v4'
    else if (name === 'non-reading-field') { invalid.groups.find(value => value.family === 'cloze').questions[0].stemFigures = q.stemFigures; delete q.stemFigures }
    else if (name === 'empty-stem-figures') q.stemFigures = []
    else if (name === 'null-stem-figure') q.stemFigures = [null]
    else if (name === 'non-figure-stem-block') figure.kind = 'paragraph'
    else if (name === 'invented-caption') figure.caption = 'Unconfirmed caption'
    else if (name === 'confirmed-label-caption') {
      const ep = ev.documents[0].pages.find(value => value.page === page.page)
      const region = figure.source.region
      const label = { ...clone(observation), observationId: 'map-label-observation',
        regionId: 'map-label-region', text: 'Library',
        region: { x: region.x + region.width * 0.05, y: region.y + region.height * 0.05,
          width: region.width * 0.5, height: region.height * 0.25 } }
      ep.observations.splice(ep.observations.findIndex(value => value.observationId === observation.observationId) + 1, 0, label)
      ep.regions.push({ regionId: label.regionId, kind: 'text', region: clone(label.region) })
      ep.readingOrderEdges = ep.observations.slice(1).map((value, index) =>
        ({ before: ep.observations[index].observationId, after: value.observationId }))
      confirmedPage.orderedItems.splice(confirmedPage.orderedItems.findIndex(value => value.itemId === item.itemId) + 1, 0,
        { itemId: 'map-label-item', observationIds: [label.observationId], text: label.text })
      visual.itemIds = ['map-label-item']
      ev.evidenceDigest = nck1OcrEvidenceDigest(ev)
      cf.evidenceDigest = ev.evidenceDigest
      assert.deepEqual(resolveConfirmedNck1OcrEvidence({ paperId, documents, evidence: ev, confirmation: cf }).issues, [])
      assert.deepEqual(imported(invalid, files, sourceBytes(ev, cf)).issues, [],
        'confirmed map labels remain valid inside the crop with an empty caption')
      figure.caption = label.text
      assert(validateJsonSchema(figure, materializationV6Schema.$defs.stemFigure).length > 0)
      assert(validateNck1SourceMaterialization(invalid).some(issue => issue.code === 'MATERIALIZATION_STEM_FIGURE_CAPTION_INVALID'))
    }
    ev.evidenceDigest = nck1OcrEvidenceDigest(ev)
    cf.evidenceDigest = ev.evidenceDigest
    const result = name === 'missing-confirmation' ? importCanonicalCandidate({
      kind: 'nck1-source-materialization', materializationBytes: bytes(invalid),
      documents: documents.map(({ documentId, bytes }) => ({ documentId, bytes })), media: files,
    }) : imported(invalid, files, sourceBytes(ev, cf))
    assert(result.issues.length > 0, `${name} must reject at the public import seam`)
    if (name === 'confirmed-region-alias') assert(result.issues.some(issue =>
      issue.message.includes('multiple media identities')), 'same-region aliases must reach the region-identity proof')
    assert(!compileNck1MaterializationCandidatePreview(result.candidate).compilation,
      `${name} must not compile`)
    console.log(`PASS OCR stem-figure rejection: ${name}`)
  }
}
