#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { rasterPdfRegion } from '../server/paper-canonical/pdfRegionRaster.mjs'
import { captureSourceReferenceFigure, decodeSourceReferencePng, SOURCE_REFERENCE_RASTER_LIMITS } from '../server/paper-import/sourceReferenceImages.mjs'

function pagePdf(width, height, rotation = 0) {
  const drawing = '0.12 0.53 0.91 rg 8.125 8.75 35.5 24.25 re f\n'
    + `0.72 0.21 0.15 RG 0.7 w 0 0 m ${width} ${height} l S\n`
    + `0.16 0.35 0.64 rg ${width * .21} ${height * .29} ${width * .37} ${height * .31} re f\n`
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Rotate ${rotation} /Resources << >> /Contents 4 0 R >>`,
    `<< /Length ${drawing.length} >>\nstream\n${drawing}endstream`]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 5\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  return Buffer.from(`${pdf}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

const region = { x: 0.137, y: 0.114, width: 0.431, height: 0.377 }
const quote = value => `'${value.replaceAll("'", "'\\''")}'`
const directory = mkdtempSync(path.join(tmpdir(), 'eqb-reference-raster-limits-'))
const previous = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR }
const trace = path.join(directory, 'calls.log')
try {
  const localTmp = path.join(directory, 'tmp')
  mkdirSync(localTmp)
  const samplePdf = pagePdf(72, 96)
  const samplePage = rasterPdfRegion({ pdfBytes: samplePdf, page: 1, density: 288,
    region: { x: 0, y: 0, width: 1, height: 1 } })
  const sampleCrop = rasterPdfRegion({ pdfBytes: samplePdf, page: 1, region, density: 288 })
  const pagePng = path.join(directory, 'sample-page.png'), cropPng = path.join(directory, 'sample-crop.png')
  writeFileSync(pagePng, samplePage.bytes)
  writeFileSync(cropPng, sampleCrop.bytes)
  const stall = path.join(directory, 'stall.mjs')
  // Finite, idle delay: even a broken timeout cannot hang or exhaust resources.
  writeFileSync(stall, 'setTimeout(() => process.exit(86), 3000)\n')
  for (const tool of ['pdfinfo', 'pdftoppm', 'magick']) {
    const native = execFileSync('which', [tool], { encoding: 'utf8' }).trim()
    writeFileSync(path.join(directory, tool), `#!/bin/sh
stage=${quote(tool)}
if [ "$stage" = magick ]; then
  stage=magick-crop
  if [ "$1" = identify ]; then
    case "$*" in
      */page.png) stage=magick-identify-page ;;
      */crop.png) stage=magick-identify-crop ;;
    esac
  fi
fi
printf '%s|%s\\n' "$stage" "$*" >> ${quote(trace)}
if [ "$stage" = pdftoppm ] && [ "$EQB_RASTER_TEST_FORBID_RENDER" = 1 ]; then exit 85; fi
if [ "$stage" = "$EQB_RASTER_TEST_STALL" ]; then exec ${quote(process.execPath)} ${quote(stall)}; fi
if [ -n "$EQB_RASTER_TEST_STALL" ]; then
  case "$stage" in
    pdfinfo) printf 'Page    1 MediaBox: 0.00 0.00 72.00 96.00\\n'; exit 0 ;;
    pdftoppm) for last; do :; done; exec /bin/cp ${quote(pagePng)} "$last.png" ;;
    magick-identify-page) printf '${samplePage.pixelWidth},${samplePage.pixelHeight}'; exit 0 ;;
    magick-identify-crop) printf '${sampleCrop.pixelWidth},${sampleCrop.pixelHeight}'; exit 0 ;;
    magick-crop)
      for last; do :; done
      case "$last" in
        png32:*/crop.png) exec /bin/cp ${quote(cropPng)} "\${last#png32:}" ;;
      esac ;;
  esac
fi
exec ${quote(native)} "$@"
`, { mode: 0o755 })
  }
  process.env.PATH = `${directory}${path.delimiter}${previous.PATH}`
  process.env.TMPDIR = localTmp
  if (!process.argv.includes('--timeouts-only')) {
    process.env.EQB_RASTER_TEST_FORBID_RENDER = '1'
    for (const [name, pdfBytes, resourceLimits] of [
      ['tiny pixel budget', pagePdf(72, 96), { maxPagePixels: 1 }],
      ['tiny dimension budget', pagePdf(72, 96), { maxPageDimension: 1 }],
      ['one pixel beyond guarded area', pagePdf(1000, 999.75), undefined],
      ['oversized pixel area', pagePdf(1500, 1500), undefined],
      ['oversized page dimension', pagePdf(2100, 1), undefined],
      ['consumer limits cannot be raised', pagePdf(1500, 1500), { maxPagePixels: 1e12, maxPageDimension: 1e6 }],
    ]) {
      writeFileSync(trace, '')
      assert.throws(() => captureSourceReferenceFigure({ pdfBytes, page: 1, region, resourceLimits }),
        { code: 'SOURCE_REFERENCES_FIGURE_RASTER_LIMIT' }, name)
      assert(readFileSync(trace, 'utf8').startsWith('pdfinfo|'), 'check exact PDF page geometry first')
      assert(!readFileSync(trace, 'utf8').includes('pdftoppm|'), 'reject before any page raster allocation')
      assert.deepEqual(readdirSync(localTmp), [], 'failure cleans its temporary files')
    }
    delete process.env.EQB_RASTER_TEST_FORBID_RENDER
    console.log('PASS reference recrop page dimensions/pixels bounded before rendering; caller may only lower budgets')
  }
  // During timeout injection, preceding stages replay precomputed valid output.
  // Their real startup/CPU time must not consume the tiny target-stage budget.
  // Budget checks and all pixel-compatibility cases still use the real tools.
  for (const stage of ['pdfinfo', 'pdftoppm', 'magick-identify-page', 'magick-crop', 'magick-identify-crop']) {
    writeFileSync(trace, '')
    process.env.EQB_RASTER_TEST_STALL = stage
    assert.throws(() => captureSourceReferenceFigure({
      pdfBytes: pagePdf(72, 96), page: 1, region, resourceLimits: { timeoutMs: 2000 },
    }), { code: 'SOURCE_REFERENCES_FIGURE_RASTER_TIMEOUT' }, `hard timeout at ${stage}`)
    const calls = readFileSync(trace, 'utf8').trim().split('\n')
    assert(calls.at(-1).startsWith(`${stage}|`), `timeout really reached ${stage}; observed ${JSON.stringify(calls)}`)
    for (const call of calls.filter(call => call.startsWith('magick'))) {
      for (const limit of ['memory 749MiB', 'map 749MiB', 'disk 0', 'thread 1', 'time 10']) {
        assert(call.includes(`-limit ${limit}`), `${stage}: ImageMagick resource ${limit}`)
      }
    }
    assert.deepEqual(readdirSync(localTmp), [], 'timeout kills the subprocess and cleans its files')
  }
  delete process.env.EQB_RASTER_TEST_STALL
  console.log('PASS hard timeout at all five native recrop stages; ImageMagick memory/map/disk/thread/time limits')
  const nativeExec = childProcess.execFileSync
  const budgets = []
  let budgeted
  childProcess.execFileSync = (tool, args, options) => {
    budgets.push({ tool, timeout: options?.timeout, killSignal: options?.killSignal })
    return nativeExec(tool, args, options)
  }
  syncBuiltinESMExports()
  try {
    budgeted = captureSourceReferenceFigure({ pdfBytes: samplePdf, page: 1, region,
      resourceLimits: { timeoutMs: 1_000_000 } })
  } finally {
    childProcess.execFileSync = nativeExec
    syncBuiltinESMExports()
  }
  const recropCalls = budgets.slice(0, 5)
  assert.deepEqual(recropCalls.map(call => call.tool), ['pdfinfo', 'pdftoppm', 'magick', 'magick', 'magick'])
  assert(recropCalls[0].timeout > 15_000 && recropCalls[0].timeout <= 45_000,
    'consumer hard ceiling is 45 seconds even when a caller asks for more')
  for (let i = 0; i < recropCalls.length; i++) {
    assert.equal(recropCalls[i].killSignal, 'SIGKILL')
    assert(recropCalls[i].timeout > 0)
    assert(recropCalls[i].timeout <= (i ? recropCalls[i - 1].timeout : 45_000),
      'each stage receives only the remaining shared budget')
  }
  assert.equal(budgeted.pixelWidth, sampleCrop.pixelWidth)
  console.log('PASS reference recrop shares one 45s ceiling; callers cannot raise it and stages retain SIGKILL')
  for (const rotation of [0, 90, 180, 270]) {
    const pdfBytes = pagePdf(72, 96, rotation)
    const legacy = rasterPdfRegion({ pdfBytes, page: 1, region, density: 288 })
    const bounded = captureSourceReferenceFigure({ pdfBytes, page: 1, region })
    const oldRaster = { ...bounded, pixelWidth: legacy.pixelWidth, pixelHeight: legacy.pixelHeight,
      byteLength: legacy.bytes.length, sha256: sha256(legacy.bytes), base64: Buffer.from(legacy.bytes).toString('base64') }
    assert.deepEqual(decodeSourceReferencePng(bounded).pixels, decodeSourceReferencePng(oldRaster).pixels,
      `fractional crop pixels stay identical at page rotation ${rotation}`)
    assert.equal(bounded.pixelWidth, legacy.pixelWidth)
    assert.equal(bounded.pixelHeight, legacy.pixelHeight)
  }
  console.log('PASS bounded reference recrop retains v1 pixels at all rotations; question crop defaults preserved')
  // A real A4 scan plus its half-page scoring crop exceeded the old simultaneous
  // ImageMagick cache ceiling. Exercise the bounded legacy crop at that geometry with
  // colored shapes crossing crop boundaries, not an all-white large-page test.
  for (const rotation of [0, 90, 180, 270]) {
    const pdfBytes = pagePdf(595.276, 841.89, rotation)
    const largeRegion = { x: .041982, y: .126485, width: .916877, height: .505938 }
    const legacy = rasterPdfRegion({ pdfBytes, page: 1, region: largeRegion, density: 288 })
    const bounded = captureSourceReferenceFigure({ pdfBytes, page: 1, region: largeRegion })
    const oldRaster = { ...bounded, pixelWidth: legacy.pixelWidth, pixelHeight: legacy.pixelHeight,
      byteLength: legacy.bytes.length, sha256: sha256(legacy.bytes), base64: Buffer.from(legacy.bytes).toString('base64') }
    assert.deepEqual(decodeSourceReferencePng(bounded).pixels, decodeSourceReferencePng(oldRaster).pixels,
      `large scoring crop pixels stay identical at page rotation ${rotation}`)
    assert.equal(bounded.pixelWidth, legacy.pixelWidth)
    assert.equal(bounded.pixelHeight, legacy.pixelHeight)
    assert.deepEqual(readdirSync(localTmp), [], 'successful large crop cleans its temporary files')
  }
  console.log('PASS large A4 scoring crops preserve every v1 RGBA pixel at all four rotations with finite page-derived cache limits')
  // The pre-render guard adds one pixel per axis, so 3999x3999 actual
  // pixels occupy the exact 4000x4000 = 16,000,000 guarded page budget.
  // Use the raster seam: the reference PNG publication limit is separately
  // smaller (4,000,000 pixels) and must not be weakened for this stress case.
  const maximum = rasterPdfRegion({ pdfBytes: pagePdf(999.75, 999.75), page: 1,
    region: { x: 0, y: 0, width: 1, height: 1 }, density: 288,
    resourceLimits: SOURCE_REFERENCE_RASTER_LIMITS })
  assert.equal(maximum.pixelWidth, 3999)
  assert.equal(maximum.pixelHeight, 3999)
  assert.deepEqual(readdirSync(localTmp), [], 'maximum full-page crop cleans its temporary files')
  console.log('PASS exact maximum guarded page budget permits a full-page crop; one-pixel-over budget rejects before rendering')
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  delete process.env.EQB_RASTER_TEST_FORBID_RENDER
  delete process.env.EQB_RASTER_TEST_STALL
  rmSync(directory, { recursive: true, force: true })
}
