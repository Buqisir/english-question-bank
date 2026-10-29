// Heavy acceptance fixture. Importing this module does no PDF/browser/raster work;
// only the explicitly invoked async factory performs those deferred operations.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { digestJson, sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { bindInImageOptionLabelsV2 } from './in-image-option-labels-v2.mjs'

export async function makeInImageOptionLabelsV2Fixture({ shared = false } = {}) {
  const { makeInImageOptionLabelsFixture } = await import('./in-image-option-labels.mjs')
  const { rasterPdfRegion } = await import('../../../server/paper-canonical/pdfRegionRaster.mjs')
  const { buildNck1OcrSourceEvidence } = await import('../../../server/paper-import/nck1OcrSourceEvidence.mjs')
  const { inImageLabelPageMetadata } = await import('../../../server/paper-canonical/nck1MaterializationAdapter.mjs')
  const { default: playwright } = await import('../../../app/node_modules/playwright/index.js')
  const f = await makeInImageOptionLabelsFixture()
  const raw = structuredClone(f.materialization), selection = structuredClone(f.selection)
  const confirmation = structuredClone(f.confirmation), engineDocuments = structuredClone(f.evidence.documents)
  const question = raw.groups.find(group => group.groupId === selection.groupId).questions.find(q => q.questionId === selection.questionId)
  const source = selection.parentSource, parent = source.region
  const relative = r => ({ x: parent.x + parent.width * r.x, y: parent.y + parent.height * r.y,
    width: parent.width * r.width, height: parent.height * r.height })
  const childBoxes = [{ x: .02, y: .02 }, { x: .52, y: .02 }, { x: .02, y: .46 }, { x: .52, y: .46 }]
    .map(r => ({ ...r, width: .46, height: shared ? .34 : .4 }))
  const labelBoxes = childBoxes.map(r => ({ ...r, width: .1, height: .12 }))
  selection.schemaVersion = 'reading-in-image-option-labels-selection-v2'
  selection.layout = 'grid_2x2_row_major'
  selection.labels.forEach((label, i) => { label.childRegion = relative(childBoxes[i]); label.labelRegion = relative(labelBoxes[i]) })
  selection.sharedFigure = shared ? { role: 'legend', mediaId: 'synthetic-shared-legend', sha256: '',
    region: relative({ x: .02, y: .84, width: .96, height: .14 }), blockId: 'synthetic-shared-legend-block' } : null
  const bubbleBox = relative({ x: .62, y: .64, width: .25, height: .08 })
  const observations = [bubbleBox, selection.labels[2].labelRegion, selection.labels[3].labelRegion].map((region, i) => ({
    observationId: `synthetic-grid-word-${i}`, regionId: `synthetic-grid-word-region-${i}`, region,
    text: ['Bubble', 'C.', 'D.'][i], confidence: .995, alternatives: [],
  }))
  const page = confirmation.documents.find(d => d.documentId === source.documentId).pages.find(p => p.page === source.page)
  const observed = engineDocuments.find(d => d.documentId === source.documentId).pages.find(p => p.page === source.page)
  const stemIndex = page.orderedItems.findIndex(item => item.itemId === selection.anchorItemId)
  const item = { itemId: 'synthetic-grid-owned-item', text: 'Bubble C. D.', observationIds: observations.map(o => o.observationId) }
  page.orderedItems.splice(stemIndex + 1, 0, item)
  page.visualClassifications.find(v => v.regionId === selection.parentRegionId).itemIds = [item.itemId]
  const observationIndex = observed.observations.findIndex(o => page.orderedItems[stemIndex].observationIds.includes(o.observationId))
  observed.observations.splice(observationIndex + 1, 0, ...observations)
  observed.regions.push(...observations.map(o => ({ regionId: o.regionId, kind: 'text', region: o.region })))
  observed.readingOrderEdges = observed.observations.slice(1).map((o, i) => ({ before: observed.observations[i].observationId, after: o.observationId }))
  selection.itemOwnership = [{ ...item, fragments: [
    { start: 0, end: 7, observationIds: [observations[0].observationId], target: { kind: 'option', label: 'D' } },
    { start: 7, end: 10, observationIds: [observations[1].observationId], target: { kind: 'option', label: 'C' } },
    { start: 10, end: 12, observationIds: [observations[2].observationId], target: { kind: 'option', label: 'D' } },
  ] }]
  delete selection.itemOwnership[0].observationIds
  selection.reason = 'Original synthetic grid with explicit A/B above C/D and all bubble/legend pixels retained.'
  const documents = raw.documents.map(d => ({ ...d, bytes: f.input.documents.find(v => v.documentId === d.documentId).bytes }))
  const target = documents.find(d => d.documentId === source.documentId)
  const style = '<style>@page{size:A4;margin:0}body{margin:0}section{position:relative;width:210mm;height:297mm;break-after:page;overflow:hidden}section:last-child{break-after:auto}img{width:100%;height:100%;display:block}</style>'
  const browser = await playwright.chromium.launch({ channel: 'chromium', headless: true })
  try {
    const view = await browser.newPage()
    const pages = Array.from({ length: target.pageCount }, (_, i) => {
      const raster = rasterPdfRegion({ pdfBytes: target.bytes, page: i + 1, region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      const svg = i + 1 === source.page ? `<svg viewBox="0 0 1000 1000" preserveAspectRatio="none" style="position:absolute;left:${parent.x * 100}%;top:${parent.y * 100}%;width:${parent.width * 100}%;height:${parent.height * 100}%">
        <rect width="1000" height="1000" fill="white"/>
        ${childBoxes.map((r, j) => `<g transform="translate(${r.x * 1000} ${r.y * 1000})">
          <rect x="1" y="1" width="${r.width * 1000 - 2}" height="${r.height * 1000 - 2}" fill="none" stroke="black"/>
          <text x="0" y="90" font-size="85">${'ABCD'[j]}.</text>
          ${Array.from({ length: j + 1 }, (_, k) => `<circle cx="${150 + 60 * k}" cy="150" r="18"/>`).join('')}</g>`).join('')}
        <text x="620" y="710" font-size="65">Bubble</text>
        ${shared ? '<rect x="20" y="840" width="960" height="140" fill="none" stroke="black"/><text x="30" y="940" font-size="70">Legend: dots count</text>' : ''}
        </svg>` : ''
      return `<section><img alt="" src="data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}">${svg}</section>`
    })
    await view.setContent(style + pages.join(''), { waitUntil: 'load' })
    const intermediate = new Uint8Array(await view.pdf({ printBackground: true, preferCSSPageSize: true }))
    // Flatten the complete intermediate PDF, including newly drawn A-D glyphs.
    // The accepted fixture must prove wordCount=0, rather than assume SVG text
    // disappeared from Chromium's native PDF text layer.
    const flattened = Array.from({ length: target.pageCount }, (_, i) => {
      const raster = rasterPdfRegion({ pdfBytes: intermediate, page: i + 1, region: { x: 0, y: 0, width: 1, height: 1 }, density: 144 })
      return `<section><img alt="" src="data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}"></section>`
    })
    await view.setContent(style + flattened.join(''), { waitUntil: 'load' })
    target.bytes = new Uint8Array(await view.pdf({ printBackground: true, preferCSSPageSize: true }))
    target.sha256 = sha256(target.bytes); target.byteLength = target.bytes.byteLength
  } finally { await browser.close() }
  raw.documents = documents.map(({ bytes, ...record }) => record)
  const evidence = buildNck1OcrSourceEvidence({ paperId: raw.paperId, documents,
    engine: { name: 'synthetic-grid-pixel-labels', version: '2' }, confidenceThreshold: .97, engineDocuments })
  confirmation.sourceSetDigest = evidence.sourceSetDigest; confirmation.evidenceDigest = evidence.evidenceDigest
  const raster = evidence.documents.find(d => d.documentId === source.documentId).pages.find(p => p.page === source.page).raster
  selection.sourceReview = { reviewedBy: 'import_agent', labelsInParentPixels: true, allParentContentRetained: true,
    noOrdinaryProseConsumed: true, reviewedPageRasterDigest: digestJson(raster), reason: selection.reason,
    ...(shared ? { sharedContextForAllOptions: true } : {}) }
  for (const label of selection.labels) raw.media.find(m => m.mediaId === label.childMediaId).extraction.region = label.childRegion
  if (shared) {
    const m = structuredClone(raw.media.find(m => m.mediaId === selection.labels[0].childMediaId))
    m.mediaId = selection.sharedFigure.mediaId; m.extraction.region = selection.sharedFigure.region; raw.media.push(m)
    question.stemFigures = [{ kind: 'figure', blockId: selection.sharedFigure.blockId, mediaId: m.mediaId,
      caption: '', source: { ...source, region: m.extraction.region } }]
    raw.sourceCoverage.visuals.push({ visualId: `visual:${m.mediaId}`, page: source.page, region: m.extraction.region,
      disposition: 'content_media', targetId: m.mediaId })
  }
  const media = raw.media.map(m => {
    const doc = documents.find(d => d.documentId === m.extraction.documentId)
    const crop = rasterPdfRegion({ pdfBytes: doc.bytes, ...m.extraction })
    m.sha256 = sha256(crop.bytes); m.pixelWidth = crop.pixelWidth; m.pixelHeight = crop.pixelHeight
    m.publication = { selection: 'source_crop', sourceSha256: m.sha256 }
    const label = selection.labels.find(label => label.childMediaId === m.mediaId)
    if (label) {
      label.childSha256 = m.sha256
      raw.sourceCoverage.visuals.find(v => v.targetId === m.mediaId).region = m.extraction.region
    }
    if (selection.sharedFigure?.mediaId === m.mediaId) selection.sharedFigure.sha256 = m.sha256
    return { mediaId: m.mediaId, bytes: crop.bytes }
  })
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-grid-measurement-'))
  let metadata, nativeWordCount
  try {
    const file = path.join(temp, 'source.pdf'); writeFileSync(file, target.bytes)
    const bbox = execFileSync('pdftotext', ['-f', String(source.page), '-l', String(source.page), '-bbox', file, '-'], { encoding: 'utf8' })
    const info = execFileSync('pdfinfo', ['-f', String(source.page), '-l', String(source.page), '-box', file], { encoding: 'utf8' })
    nativeWordCount = [...bbox.matchAll(/<word\b/gu)].length
    assert.equal(nativeWordCount, 0, 'image-label v2 fixture must have no native target-page words')
    metadata = inImageLabelPageMetadata(bbox, info, source.page)
  } finally { rmSync(temp, { recursive: true, force: true }) }
  raw.schemaVersion = 'nck1-source-materialization-v13'
  const decision = bindInImageOptionLabelsV2({ raw, selection, evidence, confirmation, ...metadata })
  return { input: { ...f.input, materializationBytes: Buffer.from(JSON.stringify(raw)), documents: documents.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media, ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(evidence)), confirmationBytes: Buffer.from(JSON.stringify(confirmation)) } },
  materialization: raw, selection, decision, evidence, confirmation, nativeWordCount }
}
