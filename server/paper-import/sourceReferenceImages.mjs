import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { rasterPdfRegion } from '../paper-canonical/pdfRegionRaster.mjs'

export const SOURCE_REFERENCE_IMAGE_LIMITS = Object.freeze({
  pngBytes: 2 * 1024 * 1024, dimension: 4096, pixels: 4_000_000,
  entryFigures: 4, sidecarFigures: 16, totalPngBytes: 8 * 1024 * 1024,
  jsonBytes: 16 * 1024 * 1024,
})
export const SOURCE_REFERENCE_IMAGE_PROFILE = 'source-reference-pdf-crop-v1'
export const SOURCE_REFERENCE_IMAGE_DPI = 288
export const SOURCE_REFERENCE_RASTER_LIMITS = Object.freeze({
  maxPagePixels: 16_000_000, maxPageDimension: 8192, timeoutMs: 15_000,
})
const signature = Buffer.from('89504e470d0a1a0a', 'hex')

function invalid(message) {
  throw Object.assign(new Error(message), { code: 'SOURCE_REFERENCES_FIGURE_PNG_INVALID' })
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// Container checks complement libpng's full decode. In particular, libpng may
// ignore bytes after IEND or animation chunks; neither is admitted here.
function inspectPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(signature)) invalid('Expected one complete PNG')
  let offset = 8
  let width, height
  let data = false
  let dataEnded = false
  let ended = false
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) invalid('Truncated PNG chunk')
    const length = bytes.readUInt32BE(offset)
    const end = offset + 12 + length
    if (end > bytes.length) invalid('Truncated PNG chunk data')
    const type = bytes.toString('ascii', offset + 4, offset + 8)
    if (!/^[A-Za-z]{4}$/u.test(type)
      || bytes.readUInt32BE(end - 4) !== crc32(bytes.subarray(offset + 4, end - 4))) invalid('Invalid PNG chunk or CRC')
    if (offset === 8) {
      if (type !== 'IHDR' || length !== 13) invalid('PNG must start with one IHDR')
      width = bytes.readUInt32BE(offset + 8)
      height = bytes.readUInt32BE(offset + 12)
      if (!width || !height || width > SOURCE_REFERENCE_IMAGE_LIMITS.dimension
        || height > SOURCE_REFERENCE_IMAGE_LIMITS.dimension
        || width * height > SOURCE_REFERENCE_IMAGE_LIMITS.pixels) invalid('PNG decoded dimensions exceed limits')
    } else if (type === 'IHDR') invalid('Multiple PNG images are unsupported')
    if (['acTL', 'fcTL', 'fdAT'].includes(type)) invalid('Animated PNG and multiple frames are unsupported')
    // Compressed ancillary payloads are unrelated to this crop profile and
    // bypass the pixel-count budget when expanded inside libpng.
    if (['zTXt', 'iTXt', 'iCCP'].includes(type)) invalid('Compressed PNG metadata is unsupported by the crop profile')
    if (type === 'IDAT') {
      if (dataEnded) invalid('PNG IDAT chunks must be consecutive')
      data = true
    } else if (data) dataEnded = true
    if (type === 'IEND') {
      if (length || !data || end !== bytes.length) invalid('PNG is missing image data or has trailing bytes')
      ended = true
    }
    offset = end
  }
  if (!ended) invalid('PNG is missing IEND')
  return { width, height }
}

export function decodeSourceReferencePng(raster) {
  const limits = SOURCE_REFERENCE_IMAGE_LIMITS
  if (raster?.profile !== SOURCE_REFERENCE_IMAGE_PROFILE || raster.mediaType !== 'image/png'
    || typeof raster.base64 !== 'string' || !raster.base64.length
    || raster.base64.length > 4 * Math.ceil(limits.pngBytes / 3)
    || raster.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(raster.base64)) {
    invalid('Figure requires bounded canonical PNG base64 and the fixed crop profile')
  }
  const bytes = Buffer.from(raster.base64, 'base64')
  if (bytes.toString('base64') !== raster.base64 || bytes.length > limits.pngBytes
    || bytes.length !== raster.byteLength || sha256(bytes) !== raster.sha256) invalid('PNG base64, byte length or SHA disagrees')
  const { width, height } = inspectPng(bytes)
  if (width !== raster.pixelWidth || height !== raster.pixelHeight) invalid('PNG dimensions disagree with the raster descriptor')
  const directory = mkdtempSync(path.join(tmpdir(), 'eqb-reference-png-'))
  try {
    const file = path.join(directory, 'image.png')
    writeFileSync(file, bytes)
    // Use the existing deployment dependency (ImageMagick/libpng), rather than
    // an IHDR-only decoder. File-backed I/O avoids macOS stdin spool stalls.
    const pixels = execFileSync('magick', [
      '-limit', 'memory', '128MiB', '-limit', 'map', '128MiB', '-limit', 'disk', '0',
      '-limit', 'thread', '1', '-limit', 'time', '10', '-regard-warnings',
      `png:${file}`, '-colorspace', 'sRGB', '-alpha', 'on', '-depth', '8', 'rgba:-',
    ], { maxBuffer: limits.pixels * 4 + 1024, timeout: 15_000, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] })
    if (pixels.length !== width * height * 4) invalid('PNG must fully decode as one RGBA frame')
    return { bytes, pixels, pixelWidth: width, pixelHeight: height }
  } catch (error) {
    if (error.code === 'SOURCE_REFERENCES_FIGURE_PNG_INVALID') throw error
    invalid('PNG failed bounded full image decoding')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// Profile v1: Poppler's displayed/rotated media page at 288 dpi; shared crop
// helper rounds x/y/width/height to nearest pixel, +repage, PNG32. Compare sRGB
// 8-bit RGBA pixels, so compression/metadata differences cannot change meaning.
// The exact admitted PNG byte SHA remains the publication commitment.
export function captureSourceReferenceFigure({ pdfBytes, page, region, resourceLimits }) {
  // Diagnostic overrides can only tighten the consumer's fixed ceilings.
  const budgets = Object.fromEntries(Object.entries(SOURCE_REFERENCE_RASTER_LIMITS)
    .map(([key, ceiling]) => [key, Math.min(resourceLimits?.[key] ?? ceiling, ceiling)]))
  let crop
  try {
    crop = rasterPdfRegion({ pdfBytes, page, region, density: SOURCE_REFERENCE_IMAGE_DPI, resourceLimits: budgets })
  } catch (error) {
    if (error.code?.startsWith('PDF_REGION_RASTER_')) {
      throw Object.assign(new Error(error.message, { cause: error }),
        { code: error.code.replace('PDF_REGION_', 'SOURCE_REFERENCES_FIGURE_') })
    }
    throw error
  }
  const bytes = Buffer.from(crop.bytes)
  const raster = { profile: SOURCE_REFERENCE_IMAGE_PROFILE, mediaType: 'image/png',
    sha256: sha256(bytes), byteLength: bytes.length, pixelWidth: crop.pixelWidth,
    pixelHeight: crop.pixelHeight, base64: bytes.toString('base64') }
  decodeSourceReferencePng(raster)
  return raster
}

export function assertSourceReferenceFigureReplay({ figure, document }) {
  if (document?.role !== 'official_answers' || document.mediaType !== 'application/pdf'
    || !(document.bytes instanceof Uint8Array) || sha256(document.bytes) !== figure.source.documentSha256
    || figure.source.documentSha256 !== document.sha256) {
    throw Object.assign(new Error('Reference figures require exact captured official_answers PDF bytes'),
      { code: 'SOURCE_REFERENCES_FIGURE_SOURCE_INVALID' })
  }
  const frozen = decodeSourceReferencePng(figure.raster)
  const locator = figure.source.locator
  const replay = decodeSourceReferencePng(captureSourceReferenceFigure({
    pdfBytes: document.bytes, page: locator.page, region: locator.region,
  }))
  if (frozen.pixelWidth !== replay.pixelWidth || frozen.pixelHeight !== replay.pixelHeight
    || !frozen.pixels.equals(replay.pixels)) {
    throw Object.assign(new Error('Frozen PNG does not replay its immutable source PDF region'),
      { code: 'SOURCE_REFERENCES_FIGURE_SOURCE_DISAGREES' })
  }
}
