import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const REFERENCE_DOWNSAMPLE_DPIS = Object.freeze([264, 240, 216, 192, 168, 150])
const sourceDpi = 288
const nativeLimits = ['-limit', 'memory', '128MiB', '-limit', 'map', '128MiB',
  '-limit', 'disk', '0', '-limit', 'thread', '1', '-limit', 'time', '10']
const encoding = ['-define', 'png:compression-level=9', '-define', 'png:compression-filter=5',
  '-define', 'png:exclude-chunks=tEXt,zTXt,iTXt,tIME']
const fail = (message, cause) => { throw Object.assign(new Error(message, { cause }), { code: 'SOURCE_REFERENCES_FIGURE_PNG_INVALID' }) }

// This seam accepts only a freshly rendered, bounded PNG32 crop. Small crops
// keep their exact historical bytes. Frozen assets never pass through it.
export function fitSourceReferencePng(crop, limits, { allowDownsample = true } = {}) {
  if (crop.bytes.length <= limits.pngBytes) return { ...crop, processing: null }
  const { pixelWidth: width, pixelHeight: height } = crop
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > limits.dimension || height > limits.dimension || width * height > limits.pixels) {
    fail('PNG decoded dimensions exceed limits')
  }
  const directory = mkdtempSync(path.join(tmpdir(), 'eqb-reference-size-'))
  const deadline = performance.now() + 15_000
  try {
    const input = path.join(directory, 'source.png')
    writeFileSync(input, crop.bytes)
    const run = args => {
      const remaining = Math.floor(deadline - performance.now())
      if (remaining < 1) fail('PNG sizing exceeded its total subprocess time budget')
      return execFileSync('magick', [...nativeLimits, '-regard-warnings', ...args], {
        maxBuffer: limits.pixels * 4 + 1024, timeout: remaining, killSignal: 'SIGKILL',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }
    const pixels = file => run([file, '-colorspace', 'sRGB', '-alpha', 'on', '-depth', '8', 'rgba:-'])
    const original = pixels(input)
    if (original.length !== width * height * 4) fail('PNG sizing dimensions disagree with the fresh crop')
    let opaque = true
    for (let i = 3; i < original.length; i += 4) if (original[i] !== 255) { opaque = false; break }
    const encode = (dpi, codec) => {
      const pixelWidth = Math.ceil(width * dpi / sourceDpi), pixelHeight = Math.ceil(height * dpi / sourceDpi)
      const file = path.join(directory, `${dpi}-${codec}.png`)
      run([input, ...(dpi === sourceDpi ? [] : [
        '-filter', 'Lanczos', '-resize', `${pixelWidth}x${pixelHeight}!`,
      ]), ...encoding, `${codec}:${file}`])
      return { bytes: readFileSync(file), pixelWidth, pixelHeight, file }
    }
    const result = (image, dpi, codec) => ({
      bytes: image.bytes, pixelWidth: image.pixelWidth, pixelHeight: image.pixelHeight,
      processing: { method: dpi === sourceDpi ? 'lossless' : 'downsample',
        originalPixelWidth: width, originalPixelHeight: height, originalByteLength: crop.bytes.length,
        originalDpi: sourceDpi, dpi, pixelWidth: image.pixelWidth, pixelHeight: image.pixelHeight,
        byteLength: image.bytes.length, codec, reason: 'png_exceeds_2_mib' },
    })
    // Dropping an opaque alpha channel is lossless only after exact RGBA replay.
    for (const codec of opaque ? ['png32', 'png24'] : ['png32']) {
      const image = encode(sourceDpi, codec)
      if (!pixels(image.file).equals(original)) fail('Lossless PNG encoding changed source pixels')
      if (image.bytes.length <= limits.pngBytes) return result(image, sourceDpi, codec)
    }
    if (allowDownsample) for (const dpi of REFERENCE_DOWNSAMPLE_DPIS) {
      const codec = opaque ? 'png24' : 'png32'
      const image = encode(dpi, codec)
      if (image.bytes.length <= limits.pngBytes) return result(image, dpi, codec)
    }
    fail('PNG exceeds 2 MiB after lossless compression and the permitted resolution floor')
  } catch (error) {
    if (error.code === 'SOURCE_REFERENCES_FIGURE_PNG_INVALID') throw error
    fail('PNG sizing failed bounded native processing', error)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
