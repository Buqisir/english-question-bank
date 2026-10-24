import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import { fitSourceReferencePng } from './sourceReferencePngSizing.mjs'
import { SOURCE_REFERENCE_IMAGE_LIMITS as limits, captureSourceReferenceFigure,
  assertSourceReferenceFigureReplay, decodeSourceReferencePng } from './sourceReferenceImages.mjs'
import { sourceReferenceFigureItemPresentation } from './sourceReferencePresentation.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { validateSourceReferences } from './sourceReferences.mjs'

function chunk(type, data) {
  const bytes = Buffer.alloc(data.length + 12)
  bytes.writeUInt32BE(data.length)
  bytes.write(type, 4)
  data.copy(bytes, 8)
  bytes.writeUInt32BE(crc32(bytes.subarray(4, -4)), bytes.length - 4)
  return bytes
}
function syntheticCrop(width, height, noise = false) {
  const data = Buffer.alloc(height * (width * 4 + 1))
  let seed = 73
  for (let y = 0; y < height; y++) for (let x = 0; x < width * 4; x++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    data[y * (width * 4 + 1) + x + 1] = noise ? seed & 255 : x % 4 === 3 ? 255 : 90
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 6
  return { bytes: Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(data, { level: 0 })), chunk('IEND', Buffer.alloc(0))]),
  pixelWidth: width, pixelHeight: height }
}

test('small new PNGs keep the exact original bytes and digest', () => {
  const crop = syntheticCrop(30, 40)
  const fitted = fitSourceReferencePng(crop, limits)
  assert.equal(fitted.bytes, crop.bytes)
  assert.equal(sha256(fitted.bytes), sha256(crop.bytes))
  assert.equal(fitted.processing, null)
})

test('an oversized synthetic PNG fits losslessly without changing a single RGBA value', () => {
  const crop = syntheticCrop(800, 800)
  assert(crop.bytes.length > limits.pngBytes)
  const fitted = fitSourceReferencePng(crop, limits)
  assert(fitted.bytes.length <= limits.pngBytes)
  assert.equal(fitted.processing.method, 'lossless')
  assert.equal(fitted.pixelWidth, crop.pixelWidth)
  assert.equal(fitted.pixelHeight, crop.pixelHeight)
  const pixels = decodeSourceReferencePng({ profile: 'source-reference-pdf-crop-v1', mediaType: 'image/png',
    sha256: sha256(fitted.bytes), byteLength: fitted.bytes.length, base64: fitted.bytes.toString('base64'),
    pixelWidth: 800, pixelHeight: 800 }).pixels
  for (let i = 0; i < pixels.length; i++) assert.equal(pixels[i], i % 4 === 3 ? 255 : 90)
  assert.deepEqual(fitSourceReferencePng(crop, limits), fitted, 'repeat input yields exact bytes, SHA and receipt')
})

test('incompressible RGBA uses deterministic downsampling with a recorded 150 DPI floor', () => {
  const crop = syntheticCrop(900, 900, true)
  const fitted = fitSourceReferencePng(crop, limits)
  assert.equal(fitted.processing.method, 'downsample')
  assert(fitted.processing.dpi >= 150 && fitted.processing.dpi < 288)
  assert(fitted.bytes.length <= limits.pngBytes)
  assert.equal(fitted.processing.originalPixelWidth, 900)
  assert.equal(fitted.processing.originalPixelHeight, 900)
  assert.equal(fitted.processing.reason, 'png_exceeds_2_mib')
  assert(fitted.pixelWidth / 900 * 288 >= 150)
  assert.deepEqual(fitSourceReferencePng(crop, limits), fitted)
})

test('a PNG still above 2 MiB at 150 DPI fails closed instead of shrinking farther', () => {
  assert.throws(() => fitSourceReferencePng(syntheticCrop(1600, 1600, true), limits),
    { code: 'SOURCE_REFERENCES_FIGURE_PNG_INVALID', message: /resolution floor/u })
})

function noisePdf() {
  const width = 1000, data = Buffer.alloc(width * width * 3)
  let seed = 19
  for (let i = 0; i < data.length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
    data[i] = seed & 255
  }
  const image = deflateSync(data)
  const drawing = Buffer.from('q 250 0 0 250 0 0 cm /Im0 Do Q')
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),
    Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 250] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>'),
    Buffer.concat([Buffer.from(`<< /Length ${drawing.length} >>\nstream\n`), drawing, Buffer.from('\nendstream')]),
    Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${width} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${image.length} >>\nstream\n`),
      image, Buffer.from('\nendstream')]),
  ]
  const parts = [Buffer.from('%PDF-1.4\n')], offsets = []
  for (const [i, object] of objects.entries()) {
    offsets.push(parts.reduce((sum, part) => sum + part.length, 0))
    parts.push(Buffer.from(`${i + 1} 0 obj\n`), object, Buffer.from('\nendobj\n'))
  }
  const xref = parts.reduce((sum, part) => sum + part.length, 0)
  parts.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.map(offset =>
    `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`))
  return Buffer.concat(parts)
}

test('new v2 raster replays its exact PDF, rejects receipt tampering, and keeps physical display size', () => {
  const bytes = noisePdf(), region = { x: 0, y: 0, width: 1, height: 1 }
  const notices = []
  const raster = captureSourceReferenceFigure({ pdfBytes: bytes, page: 1, region,
    onProcessing: processing => notices.push(processing) })
  assert.equal(raster.profile, 'source-reference-pdf-crop-v2')
  assert.equal(notices[0].method, 'downsample')
  assert.deepEqual(captureSourceReferenceFigure({ pdfBytes: bytes, page: 1, region }), raster)
  const figure = { raster, figureId: 'noise-figure', source: { documentSha256: sha256(bytes),
    locator: { page: 1, region } } }
  const document = { role: 'official_answers', mediaType: 'application/pdf', sha256: sha256(bytes), bytes }
  assertSourceReferenceFigureReplay({ figure, document })
  const tampered = structuredClone(figure)
  tampered.raster.sizing.originalByteLength++
  assert.throws(() => assertSourceReferenceFigureReplay({ figure: tampered, document }),
    { code: 'SOURCE_REFERENCES_FIGURE_SOURCE_DISAGREES' })
  const view = sourceReferenceFigureItemPresentation({ referenceId: 'noise' }, figure, 'test')
  assert.equal(view.widthMm, 1000 / 288 * 25.4)
  assert.equal(view.heightMm, 1000 / 288 * 25.4)
  const input = scoringFiguresFixture()
  const sidecar = captureScoringReferences(input)
  sidecar.groups[0].scoring.entries[0].blocks.find(block => block.kind === 'figure').raster = raster
  assert.deepEqual(validateSourceReferences({ ...input, sidecar }), [], 'v4 accepts the bounded v2 raster shape')
  delete raster.sizing
  assert.throws(() => decodeSourceReferencePng(raster), { code: 'SOURCE_REFERENCES_FIGURE_PNG_INVALID' })
})
