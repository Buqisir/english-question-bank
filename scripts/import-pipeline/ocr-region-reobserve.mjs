// Add engine observations, never proofreader-supplied text. Canonical observations keep
// their closed schema; trace words and the append-only run ledger retain provenance.
import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { rasterPdfRegion } from '../../server/paper-canonical/pdfRegionRaster.mjs'
import { nck1OcrSourceSetDigest } from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'

const run = promisify(execFile)
const round = value => Number(value.toFixed(6))
const SCALE = 3
const LANGUAGE = 'chi_sim+eng'
const PSM = 6
const DENSITY = 144

function keysExactly(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}

// Request array only: [{ page: "official-answers-2-p04", bbox: { x, y, width, height } }].
// No free-form metadata/text channel is accepted, even inside the bbox.
export function parseRegionRequests(value, pages) {
  if (!Array.isArray(value) || !value.length) throw new Error('Region requests must be a non-empty array')
  const requests = value.map(entry => {
    if (!keysExactly(entry, ['page', 'bbox']) || typeof entry.page !== 'string'
      || !pages.some(page => page.key === entry.page)
      || !keysExactly(entry.bbox, ['x', 'y', 'width', 'height'])
      || !Object.values(entry.bbox).every(Number.isSafeInteger)
      || entry.bbox.x < 0 || entry.bbox.y < 0 || entry.bbox.width <= 0 || entry.bbox.height <= 0) {
      throw new Error('Region requests allow only a known page id and a positive integer pixel bbox; text fields are forbidden')
    }
    return structuredClone(entry)
  }).sort((a, b) => a.page < b.page ? -1 : a.page > b.page ? 1
    : a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x
      || a.bbox.width - b.bbox.width || a.bbox.height - b.bbox.height)
  return requests.filter((entry, index) => index === 0
    || stableStringify(entry) !== stableStringify(requests[index - 1]))
}

export function mapRegionTsv(tsv, bbox, scale = SCALE) {
  const [header, ...lines] = tsv.trimEnd().split('\n')
  const keys = header.split('\t')
  const rows = lines.filter(Boolean).map(line => Object.fromEntries(
    keys.map((key, i) => [key, line.split('\t')[i] ?? ''])))
  const page = rows.find(row => row.level === '1')
  if (!page || Number(page.width) !== bbox.width * scale || Number(page.height) !== bbox.height * scale) {
    throw new Error('Region Tesseract page box does not match the scaled crop')
  }
  return rows.filter(row => row.level === '5' && row.text.trim()).map(row => {
    const [left, top, width, height, conf] = ['left', 'top', 'width', 'height', 'conf'].map(key => Number(row[key]))
    if (![left, top, width, height, conf].every(Number.isFinite) || conf < 0 || conf > 100
      || ![left, top, width, height].every(Number.isSafeInteger)
      || left < 0 || top < 0 || width <= 0 || height <= 0
      || left + width > bbox.width * scale || top + height > bbox.height * scale) {
      throw new Error('Region Tesseract word has invalid geometry or confidence')
    }
    // Native Tesseract boxes use integer page pixels. Enclose the full mapped
    // glyph rather than leaking subpixel band boundaries to figure auto-cropping.
    const x0 = Math.floor(bbox.x + left / scale), y0 = Math.floor(bbox.y + top / scale)
    const x1 = Math.ceil(bbox.x + (left + width) / scale), y1 = Math.ceil(bbox.y + (top + height) / scale)
    return { text: row.text, conf, line: `${row.block_num}:${row.par_num}:${row.line_num}`,
      box: { left: x0, top: y0, width: x1 - x0, height: y1 - y0 } }
  })
}

function overlaps(a, b) {
  return a.left < b.left + b.width && a.left + a.width > b.left
    && a.top < b.top + b.height && a.top + a.height > b.top
}

export function appendRegionObservations(page, candidates, provenance, size) {
  if (![size.width, size.height].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error('Region observation page size must use positive finite integer pixels')
  }
  const bounded = candidates.map(word => {
    if (!word.box || !['left', 'top', 'width', 'height'].every(key => Number.isSafeInteger(word.box[key]))
      || word.box.width <= 0 || word.box.height <= 0) {
      throw new Error('Region observation boxes must use finite integer pixels with positive extent')
    }
    const clip = (value, limit) => Math.max(0, Math.min(limit, value))
    const left = clip(word.box.left, size.width), top = clip(word.box.top, size.height)
    const right = clip(word.box.left + word.box.width, size.width)
    const bottom = clip(word.box.top + word.box.height, size.height)
    const box = { left, top, width: right - left, height: bottom - top }
    if (!Object.values(box).every(Number.isSafeInteger) || box.width <= 0 || box.height <= 0) {
      throw new Error('Region observation boxes must enclose positive finite integer pixels inside the page')
    }
    return { ...word, box }
  })
  // Compare with earlier observations, including earlier region runs, without
  // rejecting overlapping glyph boxes emitted together by Tesseract itself.
  const accepted = bounded.filter(word => !page.words.some(old => overlaps(word.box, old.box)))
  let number = Math.max(0, ...page.words.map(word => word.number))
  const words = accepted.map(word => ({ ...word, number: ++number,
    line: `region-${provenance.runId}:${word.line}`,
    source: 'region-reobserve', reobserveRunId: provenance.runId }))
  const observations = words.map(word => {
    const id = `${page.documentId}:page-${page.page}:word-${word.number}`
    const x = round(word.box.left / size.width), y = round(word.box.top / size.height)
    return { observationId: id, regionId: id,
      region: { x, y, width: Math.min(round(word.box.width / size.width), round(1 - x)),
        height: Math.min(round(word.box.height / size.height), round(1 - y)) },
      text: word.text, confidence: round(word.conf / 100), alternatives: [] }
  })
  // Append rather than insert: existing word/line references and observations are immutable.
  const before = page.record.observations.at(-1)?.observationId
  const addedIds = observations.map(item => item.observationId)
  const chain = [...(before ? [before] : []), ...addedIds]
  return { page: { ...page, words: [...page.words, ...words], record: { ...page.record,
    observations: [...page.record.observations, ...observations],
    regions: [...page.record.regions, ...observations.map(item => ({
      regionId: item.regionId, kind: 'text', region: item.region,
    }))],
    readingOrderEdges: [...page.record.readingOrderEdges,
      ...chain.slice(1).map((after, i) => ({ before: chain[i], after }))],
  } }, acceptedObservationIds: addedIds, discarded: candidates.length - accepted.length }
}

export async function reobserveRegions({ trace, documents, work, requests }) {
  if (trace.schemaVersion !== 'ocr-proofread-trace-v2'
    || trace.sourceSetDigest !== nck1OcrSourceSetDigest(documents)
    || documents.some(document => sha256(document.bytes) !== document.sha256
      || document.bytes.byteLength !== document.byteLength)) {
    throw new Error('Region re-observation requires the exact immutable source set of a v2 trace')
  }
  const plan = parseRegionRequests(requests, trace.pages)
  const versionOutput = (await run('tesseract', ['--version'])).stdout
  const version = /tesseract\s+(\S+)/u.exec(versionOutput)?.[1]
  if (!version || trace.engine.name !== 'tesseract' || !trace.engine.version.startsWith(`${version} `)) {
    throw new Error('Region re-observation requires the same Tesseract engine version as the trace')
  }
  const output = structuredClone(trace)
  const rasters = new Map()
  for (const request of plan) {
    const index = output.pages.findIndex(page => page.key === request.page)
    const page = output.pages[index]
    const document = documents.find(document => document.documentId === page.documentId)
    if (!document || page.page < 1 || page.page > document.pageCount) throw new Error('Region page is outside its source document')
    if (!rasters.has(page.key)) {
      const raster = rasterPdfRegion({ pdfBytes: document.bytes, page: page.page,
        region: { x: 0, y: 0, width: 1, height: 1 }, density: DENSITY })
      // A copied or tampered page PNG cannot become the source of new observations.
      if (sha256(readFileSync(page.imagePath)) !== sha256(raster.bytes)) {
        throw new Error(`${page.key}: page image does not match its immutable source raster`)
      }
      rasters.set(page.key, raster)
    }
    const raster = rasters.get(page.key)
    const bbox = request.bbox
    if (bbox.x + bbox.width > raster.pixelWidth || bbox.y + bbox.height > raster.pixelHeight) {
      throw new Error(`${page.key}: region bbox exceeds the immutable page raster`)
    }
    const parameters = { language: LANGUAGE, psm: PSM, scale: SCALE, density: DENSITY, ompThreadLimit: 1,
      pixelMapping: 'outward-integer-v1' }
    const identity = { page: page.key, bbox, sourceDocumentDigest: document.sha256,
      sourceImageDigest: sha256(raster.bytes), engine: { name: 'tesseract', version }, parameters }
    const runId = sha256(stableStringify(identity)).slice('sha256:'.length)
    if (output.regionReobservations?.some(item => item.runId === runId)) continue
    const directory = path.join(work, 'region-reobserve', `${page.key}-${runId}`)
    mkdirSync(directory, { recursive: true })
    const crop = path.join(directory, 'crop.png')
    const tsvBase = path.join(directory, 'ocr')
    await run('magick', [page.imagePath, '-crop', `${bbox.width}x${bbox.height}+${bbox.x}+${bbox.y}`,
      '+repage', '-resize', `${bbox.width * SCALE}x${bbox.height * SCALE}!`,
      '-define', 'png:exclude-chunks=tEXt,zTXt,iTXt,tIME', crop])
    await run('tesseract', [crop, tsvBase, '-l', LANGUAGE, '--psm', String(PSM), 'tsv'],
      { env: { ...process.env, OMP_THREAD_LIMIT: '1' }, maxBuffer: 8 * 1024 * 1024 })
    const tsv = readFileSync(`${tsvBase}.tsv`, 'utf8')
    const provenance = { source: 'region-reobserve', runId, ...identity,
      rawTsv: path.relative(work, `${tsvBase}.tsv`), rawTsvDigest: sha256(tsv),
      cropImageDigest: sha256(readFileSync(crop)) }
    const result = appendRegionObservations(page, mapRegionTsv(tsv, bbox), provenance,
      { width: raster.pixelWidth, height: raster.pixelHeight })
    output.pages[index] = result.page
    const receipt = { ...provenance, acceptedObservationIds: result.acceptedObservationIds, discarded: result.discarded }
    output.regionReobservations ||= []
    output.regionReobservations.push(receipt)
    writeFileSync(path.join(directory, 'run.json'), `${JSON.stringify(receipt, null, 2)}\n`)
  }
  return output
}
