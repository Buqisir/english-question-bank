import assert from 'node:assert/strict'
import { makeSyntheticNck1OcrFixture, cloneJson } from './fixture.mjs'
import { rasterPdfRegion } from '../../../server/paper-canonical/pdfRegionRaster.mjs'
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { buildNck1OcrSourceEvidence, resolveConfirmedNck1OcrEvidence } from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { produceNck1OcrMaterialization } from '../../../server/paper-import/nck1OcrMaterializationProducer.mjs'

// Original synthetic drawings; text labels exist only in source image pixels.
// Keep one ordinary figure to exercise complete inventory consumption.
export async function makeInImageOptionLabelsFixture() {
  const paperId = 'paper-synthetic-in-image-labels'
  const fixture = await makeSyntheticNck1OcrFixture({ paperId })
  const confirmation = cloneJson(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const engineDocuments = cloneJson(fixture.evidence.documents)
  const page = confirmation.documents[0].pages.find(page =>
    page.orderedItems.some(item => item.text.startsWith('30. ')))
  const itemIndex = page.orderedItems.findIndex(item => item.text.startsWith('30. '))
  const stem = page.orderedItems[itemIndex]
  const observed = engineDocuments[0].pages.find(value => value.page === page.page)
  const observation = observed.observations.find(value => stem.observationIds.includes(value.observationId))
  assert.equal(stem.observationIds.length, 1)
  const original = cloneJson(observation.region)
  const parentRegion = { ...original, y: original.y + original.height * 0.35, height: original.height * 0.65 }
  stem.text = observation.text = '30. Which drawing has three dots?'
  observation.region.height = original.height * 0.25
  observed.regions.find(value => value.regionId === observation.regionId).region = cloneJson(observation.region)
  observed.regions.push({ regionId: 'synthetic-option-bank', kind: 'visual', region: cloneJson(parentRegion) })
  page.visualClassifications.push({ regionId: 'synthetic-option-bank', classification: 'content_media',
    afterItemId: stem.itemId, itemIds: [] })

  // Keep an ordinary confirmed image too, so losing it cannot be hidden by
  // accepting the four children in place of a different parent.
  const ordinaryPage = confirmation.documents[0].pages.find(value =>
    value.orderedItems.some(item => item.text === 'C passage keeps one small promise.'))
  const ordinaryIndex = ordinaryPage.orderedItems.findIndex(item => item.text === 'C passage keeps one small promise.')
  const ordinaryItem = ordinaryPage.orderedItems[ordinaryIndex]
  const ordinaryObserved = engineDocuments[0].pages.find(value => value.page === ordinaryPage.page)
  const ordinaryObservation = ordinaryObserved.observations.find(value => ordinaryItem.observationIds.includes(value.observationId))
  ordinaryObserved.regions.push({ regionId: 'synthetic-ordinary-image', kind: 'visual', region: cloneJson(ordinaryObservation.region) })
  ordinaryPage.visualClassifications.push({ regionId: 'synthetic-ordinary-image', classification: 'content_media',
    afterItemId: ordinaryPage.orderedItems[ordinaryIndex - 1].itemId, itemIds: [ordinaryItem.itemId] })

  const { default: playwright } = await import('../../../app/node_modules/playwright/index.js')
  const browser = await playwright.chromium.launch({ channel: 'chromium', headless: true })
  const sourceDocuments = fixture.sourceDocuments.map(document => ({ ...document }))
  try {
    const view = await browser.newPage()
    const pages = Array.from({ length: sourceDocuments[0].pageCount }, (_, index) => {
      const raster = rasterPdfRegion({ pdfBytes: sourceDocuments[0].bytes, page: index + 1,
        region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      const overlay = index + 1 === page.page
        ? `<svg viewBox="0 0 400 100" preserveAspectRatio="none" style="position:absolute;left:${original.x * 100}%;top:${original.y * 100}%;width:${original.width * 100}%;height:${original.height * 100}%">
          <rect width="400" height="100" fill="white"/><text x="0" y="20" font-size="18">${stem.text}</text>
          ${[1, 2, 3, 4].map((count, i) => `<g transform="translate(${i * 100 + 10} 45)">
            <rect width="70" height="30" fill="none" stroke="black" stroke-width="2"/>
            ${Array.from({ length: count }, (_, j) => `<circle cx="${10 + j * 15}" cy="15" r="4"/>`).join('')}
            <text x="30" y="50" font-size="15">${'ABCD'[i]}.</text></g>`).join('')}</svg>`
        : ''
      return `<section><img src="data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}">${overlay}</section>`
    })
    await view.setContent(`<style>@page{size:A4;margin:0}body{margin:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{width:100%;height:100%;display:block}</style>${pages.join('')}`)
    const bytes = new Uint8Array(await view.pdf({ printBackground: true, preferCSSPageSize: true }))
    sourceDocuments[0] = { ...sourceDocuments[0], bytes, sha256: sha256(bytes), byteLength: bytes.byteLength }
  } finally {
    await browser.close()
  }
  const evidence = buildNck1OcrSourceEvidence({ paperId, documents: sourceDocuments,
    engine: { name: 'synthetic-option-bank', version: '1' }, confidenceThreshold: 0.97, engineDocuments })
  confirmation.sourceSetDigest = evidence.sourceSetDigest
  confirmation.evidenceDigest = evidence.evidenceDigest
  const produced = produceNck1OcrMaterialization({ paperId, documents: sourceDocuments, evidence, confirmation })
  assert(produced.review.required.some(issue => issue.code === 'NCK1_OCR_OPTIONS_AMBIGUOUS'))
  assert(produced.review.required.every(issue =>
    ['NCK1_OCR_OPTIONS_AMBIGUOUS', 'NCK1_OCR_MEDIA_ASSOCIATION_AMBIGUOUS'].includes(issue.code)),
  `only the synthetic picture bank may need materialization repair: ${JSON.stringify(produced.review.required)}`)
  const resolved = resolveConfirmedNck1OcrEvidence({ paperId, documents: sourceDocuments, evidence, confirmation })
  assert.deepEqual(resolved.issues, [])
  const parent = resolved.contentMedia.find(value => value.source.page === page.page
    && JSON.stringify(value.source.region) === JSON.stringify(parentRegion))
  assert(parent)
  const materialization = cloneJson(produced.materialization)
  materialization.schemaVersion = 'nck1-source-materialization-v3'
  delete materialization.sourcePresentation
  // The producer deliberately cannot parse picture options; repair only that
  // derived question and its media inventory, retaining the immutable closure.
  materialization.issues = []
  const group = materialization.groups.find(value => value.questions.some(question => question.canonicalNumber === 30))
  const question = group.questions.find(value => value.canonicalNumber === 30)
  question.stem = 'Which drawing has three dots?'
  // A bank after a question is intentionally absent from passage blocks, so
  // the producer also omits its unassociated crop from selected media.
  const parentMedia = { ...cloneJson(materialization.media[0]), mediaId: parent.mediaId,
    extraction: { ...cloneJson(parent.source), kind: 'pdf_crop', density: 144 } }
  const mediaFiles = produced.mediaFiles.filter(value => value.mediaId !== parent.mediaId)
  materialization.media = materialization.media.filter(value => value.mediaId !== parent.mediaId)
  materialization.sourceCoverage.visuals = materialization.sourceCoverage.visuals.filter(value => value.targetId !== parent.mediaId)
  const children = []
  const crop = (media, region = media.extraction.region) => {
    media.extraction.region = cloneJson(region)
    const raster = rasterPdfRegion({ pdfBytes: sourceDocuments.find(value => value.documentId === media.extraction.documentId).bytes,
      ...media.extraction })
    media.sha256 = sha256(raster.bytes)
    media.pixelWidth = raster.pixelWidth
    media.pixelHeight = raster.pixelHeight
    media.publication = { selection: 'source_crop', sourceSha256: media.sha256 }
    return { mediaId: media.mediaId, bytes: raster.bytes }
  }
  const parentFile = crop(parentMedia)
  for (let index = 0; index < 4; index += 1) {
    const media = cloneJson(parentMedia)
    media.mediaId = `synthetic-option-${'ABCD'[index]}`
    const region = { x: parentRegion.x + parentRegion.width * (index / 4 + 0.02),
      y: parentRegion.y, width: parentRegion.width * 0.21, height: parentRegion.height }
    mediaFiles.push(crop(media, region))
    children.push(media)
    materialization.media.push(media)
    materialization.sourceCoverage.visuals.push({ visualId: `visual:${media.mediaId}`, page: page.page,
      region: cloneJson(region), disposition: 'content_media', targetId: media.mediaId })
  }
  question.options = children.map((media, index) => ({ label: 'ABCD'[index], figure: { mediaId: media.mediaId } }))
  const sourceBytes = { evidenceBytes: new TextEncoder().encode(JSON.stringify(evidence)),
    confirmationBytes: new TextEncoder().encode(JSON.stringify(confirmation)) }
  const selection = { groupId: group.groupId, questionId: question.questionId,
    parentMediaId: parent.mediaId, parentRegionId: 'synthetic-option-bank', parentSource: parent.source,
    anchorItemId: stem.itemId, labels: children.map((child, index) => ({
      label: 'ABCD'[index], childMediaId: child.mediaId, childSha256: child.sha256,
      childRegion: cloneJson(child.extraction.region),
      labelRegion: { x: original.x + original.width * (index / 4 + .09),
        y: original.y + original.height * .85, width: original.width * .05, height: original.height * .1 },
    })), reason: 'Reviewed original synthetic image: each A-D glyph is inside its own drawing crop.' }
  return { input: { kind: 'nck1-source-materialization', materializationBytes: Buffer.from(JSON.stringify(materialization)),
    documents: sourceDocuments.map(document => ({documentId: document.documentId, bytes: document.bytes})),
    media: mediaFiles, ocrSourceBytes: sourceBytes }, selection, evidence, confirmation, materialization }
}
