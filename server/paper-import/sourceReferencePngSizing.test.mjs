import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { test } from 'node:test'
import { crc32, deflateSync } from 'node:zlib'
import { fitSourceReferencePng } from './sourceReferencePngSizing.mjs'
import { SOURCE_REFERENCE_IMAGE_LIMITS as limits, decodeSourceReferencePng } from './sourceReferenceImages.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { scoringFiguresFixture, captureScoringReferences } from '../../test-fixtures/paper-import/source-reference-scoring-v4/fixture.mjs'
import { validateSourceReferences } from './sourceReferences.mjs'
import { assertSourceReferenceAdmission } from './sourceReferenceAdmission.mjs'

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
  // Match the production scoring crop dimensions without retaining source content.
  const crop = syntheticCrop(1754, 1470)
  assert(crop.bytes.length > limits.pngBytes)
  const fitted = fitSourceReferencePng(crop, limits)
  assert(fitted.bytes.length <= limits.pngBytes)
  assert.equal(fitted.processing.method, 'lossless')
  assert.equal(fitted.pixelWidth, crop.pixelWidth)
  assert.equal(fitted.pixelHeight, crop.pixelHeight)
  const pixels = decodeSourceReferencePng({ profile: 'source-reference-pdf-crop-v1', mediaType: 'image/png',
    sha256: sha256(fitted.bytes), byteLength: fitted.bytes.length, base64: fitted.bytes.toString('base64'),
    pixelWidth: crop.pixelWidth, pixelHeight: crop.pixelHeight }).pixels
  for (let i = 0; i < pixels.length; i++) assert.equal(pixels[i], i % 4 === 3 ? 255 : 90)
  assert.deepEqual(fitSourceReferencePng(crop, limits), fitted, 'repeat input yields exact bytes, SHA and receipt')
})

test('a PNG still above 2 MiB after lossless compression fails without resizing', () => {
  assert.throws(() => fitSourceReferencePng(syntheticCrop(900, 900, true), limits),
    { code: 'SOURCE_REFERENCES_FIGURE_PNG_INVALID', message: /after lossless compression/u })
})

for (const nativeError of [
  Object.assign(new Error('spawnSync magick ENOENT /private/internal-command'), { code: 'ENOENT' }),
  Object.assign(new Error('Command failed with private arguments'), {
    status: 1, signal: null,
    stderr: Buffer.from("convert: cache resources exhausted '/opt/private source/image.png' "
      + '`/Users/private user/crop.png` C:\\private\\crop.png @ error/cache.c/123\n' + 'x'.repeat(2000)),
  }),
  Object.assign(new Error('spawnSync magick ETIMEDOUT'), { code: 'ETIMEDOUT', signal: 'SIGKILL' }),
]) {
  test(`native failure includes bounded safe diagnostics (${nativeError.code ?? 'stderr'})`, t => {
    const stub = t.mock.method(childProcess, 'execFileSync', () => { throw nativeError })
    syncBuiltinESMExports()
    try {
      assert.throws(() => fitSourceReferencePng(syntheticCrop(800, 800), limits), error => {
        assert.equal(error.code, 'SOURCE_REFERENCES_FIGURE_PNG_INVALID')
        assert.match(error.message, /PNG sizing failed bounded native processing/u)
        if (nativeError.code) assert(error.message.includes(nativeError.code))
        else assert.match(error.message, /exit=1.*cache resources exhausted/u)
        if (nativeError.signal) assert(error.message.includes(nativeError.signal))
        assert(!/private|internal-command|[\\/]|[\r\n]/u.test(error.message), error.message)
        assert(error.message.length < 700)
        assert.equal(error.cause, nativeError)
        return true
      })
    } finally {
      stub.mock.restore()
      syncBuiltinESMExports()
    }
  })
}

test('unchanged v1 schema and PDF pixel replay accept PNG24 re-encoding', () => {
  const input = scoringFiguresFixture()
  const sidecar = captureScoringReferences(input)
  const figure = sidecar.groups[0].scoring.entries[0].blocks.find(block => block.kind === 'figure')
  const raster = figure.raster
  const { pixels, pixelWidth: width, pixelHeight: height } = decodeSourceReferencePng(raster)
  const rgb = Buffer.alloc(height * (width * 3 + 1))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4
    assert.equal(pixels[offset + 3], 255)
    pixels.copy(rgb, y * (width * 3 + 1) + 1 + x * 3, offset, offset + 3)
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width); header.writeUInt32BE(height, 4)
  header[8] = 8; header[9] = 2
  const bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(rgb, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
  Object.assign(raster, { base64: bytes.toString('base64'), sha256: sha256(bytes), byteLength: bytes.length })
  assert.equal(bytes[25], 2, 'truecolor PNG24 uses the existing v1 profile')
  assert.equal(raster.profile, 'source-reference-pdf-crop-v1')
  assert.deepEqual(validateSourceReferences({ ...input, sidecar }), [])
  const frozen = JSON.stringify(sidecar)
  assertSourceReferenceAdmission({ ...input, sidecar })
  assert.equal(JSON.stringify(sidecar), frozen, 'receiver must not re-encode frozen assets')
})
