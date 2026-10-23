#!/usr/bin/env node
// Reuse Reading option figures and deterministic PDF crops (as in Weifang Q21).
// A reviewed plan supplies page-pixel coordinates; no image is generated or redrawn.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { rasterPdfRegion } from '../../server/paper-canonical/pdfRegionRaster.mjs'

const labels = ['A', 'B', 'C', 'D']
const assert = (condition, message) => { if (!condition) throw new Error(message) }

export function optionCropRegions(plan) {
  const { pagePixels, crops } = plan
  assert(Array.isArray(pagePixels) && pagePixels.length === 2
    && pagePixels.every(n => Number.isInteger(n) && n > 0), 'Invalid page dimensions')
  assert(Array.isArray(crops) && crops.length === 4
    && crops.every((c, i) => c.label === labels[i]), 'Expected exactly A–D in source order')
  for (const crop of crops) {
    const [x, y, width, height] = crop.pixels || []
    assert(crop.pixels?.length === 4 && crop.pixels.every(Number.isInteger)
      && x >= 0 && y >= 0 && width > 0 && height > 0
      && x + width <= pagePixels[0] && y + height <= pagePixels[1], 'Crop outside source page')
  }
  for (let i = 0; i < crops.length; i++) {
    for (let j = i + 1; j < crops.length; j++) {
      const [x, y, w, h] = crops[i].pixels
      const [a, b, c, d] = crops[j].pixels
      assert(x + w <= a || a + c <= x || y + h <= b || b + d <= y, 'Option crops overlap')
    }
  }
  return crops.map(({ label, pixels: [x, y, width, height] }) => ({
    label, region: { x: x / pagePixels[0], y: y / pagePixels[1],
      width: width / pagePixels[0], height: height / pagePixels[1] },
  }))
}

export function deriveOptionFigures({ materialization, plan, document, pdfBytes, raster = rasterPdfRegion }) {
  const regions = optionCropRegions(plan)
  assert(document?.mediaType === 'application/pdf' && document.documentId === plan.documentId
    && document.sha256 === plan.sourceSha256 && sha256(pdfBytes) === plan.sourceSha256,
  'Plan must bind the immutable source PDF')
  assert(Number.isInteger(plan.page) && plan.page > 0 && plan.page <= document.pageCount, 'Invalid source page')
  const result = structuredClone(materialization)
  const question = result.groups.flatMap(g => g.questions).find(q => q.canonicalNumber === plan.questionNumber)
  assert(question && question.source.documentId === plan.documentId && question.source.page === plan.page,
    'Question must be on the planned source page')
  assert(question.options.length === 0, 'Refusing to overwrite existing options')
  const original = result.sourceCoverage.visuals.find(v => v.visualId === plan.visualId)
  assert(original?.page === plan.page && original.disposition === 'content_media', 'Missing original content visual')
  const files = []
  const media = regions.map(({ label, region }) => {
    assert(region.x >= original.region.x - 0.001 && region.y >= original.region.y - 0.001
      && region.x + region.width <= original.region.x + original.region.width + 0.001
      && region.y + region.height <= original.region.y + original.region.height + 0.001,
    'Child crop must stay inside the reviewed parent visual')
    const crop = raster({ pdfBytes, page: plan.page, region, density: 144 })
    const expected = plan.crops.find(c => c.label === label).pixels
    assert(crop.pixelWidth === expected[2] && crop.pixelHeight === expected[3], 'Raster dimensions differ from plan')
    const mediaId = `media:${result.paperId}:q${plan.questionNumber}-${label.toLowerCase()}`
    const digest = sha256(crop.bytes)
    files.push({ mediaId, bytes: crop.bytes, sha256: digest })
    return { mediaId, usage: 'content', kind: 'figure', mimeType: 'image/png', sha256: digest,
      pixelWidth: crop.pixelWidth, pixelHeight: crop.pixelHeight,
      extraction: { kind: 'pdf_crop', documentId: plan.documentId, page: plan.page, region, density: 144 },
      presentation: { alignment: 'center', widthRatio: 1, spacingBefore: 'normal', spacingAfter: 'normal' },
      publication: { selection: 'source_crop', sourceSha256: digest } }
  })
  assert(new Set(files.map(f => f.sha256)).size === 4, 'Four options must have distinct source bytes')
  question.options = media.map((m, i) => ({ label: labels[i], figure: { mediaId: m.mediaId } }))
  result.media = result.media.filter(m => m.mediaId !== original.targetId).concat(media)
  result.sourceCoverage.visuals = result.sourceCoverage.visuals.filter(v => v !== original).concat(
    media.map(m => ({ visualId: m.mediaId.replace(/^media:/u, 'visual:'), page: plan.page,
      region: m.extraction.region, disposition: 'content_media', targetId: m.mediaId })))
  const resolved = result.issues.filter(i =>
    (i.code === 'NCK1_OCR_OPTIONS_AMBIGUOUS' && i.path === `questions.${plan.questionNumber}.options`)
    || (i.code === 'NCK1_OCR_MEDIA_ASSOCIATION_AMBIGUOUS' && i.path === `media.${original.targetId}`))
  result.issues = result.issues.filter(i => !resolved.includes(i))
  return { materialization: result, files, audit: { target: `/questions/${plan.questionNumber}/options`,
    reason: '对照源页将整组选项图按页面坐标切成四个派生子图，保留图内字母；沿用 pdf_crop 和 figure.mediaId，不重绘、不改答案。',
    source: { documentId: plan.documentId, page: plan.page, sha256: plan.sourceSha256 },
    parentVisual: original, crops: media.map((m, i) => ({ label: labels[i], pixels: plan.crops[i].pixels,
      mediaId: m.mediaId, region: m.extraction.region, sha256: m.sha256 })), resolves: resolved } }
}

function main() {
  const [paperDirArg, planArg, logArg] = process.argv.slice(2)
  assert(paperDirArg && planArg && logArg, 'Usage: derive-option-figures.mjs <paper-dir> <plan.json> <materialization-edits.json>')
  const paperDir = path.resolve(paperDirArg)
  const load = file => JSON.parse(readFileSync(file, 'utf8'))
  const manifest = load(path.join(paperDir, 'universal-source-manifest.json'))
  const plan = load(planArg)
  const document = manifest.documents.find(d => d.documentId === plan.documentId)
  assert(document, 'Missing source document')
  const materializationPath = path.join(paperDir, manifest.materializationPath)
  const derived = deriveOptionFigures({ materialization: load(materializationPath), plan, document,
    pdfBytes: readFileSync(path.join(paperDir, document.path)) })
  const files = derived.files.map(file => ({ ...file,
    path: path.join(paperDir, manifest.mediaDirectory, `${file.mediaId.replaceAll(':', '__')}.png`) }))
  for (const file of files) assert(!existsSync(file.path), `Refusing to overwrite ${file.path}`)
  const log = existsSync(logArg) ? load(logArg) : { paperId: manifest.paperId, edits: [] }
  assert(log.paperId === manifest.paperId, 'Edit log belongs to another paper')
  log.edits.push(derived.audit)
  for (const file of files) {
    mkdirSync(path.dirname(file.path), { recursive: true })
    writeFileSync(file.path, file.bytes, { flag: 'wx' })
  }
  writeFileSync(materializationPath, `${JSON.stringify(derived.materialization, null, 2)}\n`)
  writeFileSync(logArg, `${JSON.stringify(log, null, 2)}\n`)
  console.log(JSON.stringify(derived.audit, null, 2))
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
