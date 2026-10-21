import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const maxBuffer = 50 * 1024 * 1024

function normalizedRegion(region) {
  return Boolean(
    region
    && ['x', 'y', 'width', 'height'].every((key) =>
      typeof region[key] === 'number' && Number.isFinite(region[key]))
    && region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0
    && region.x + region.width <= 1
    && region.y + region.height <= 1,
  )
}

// Optional limits leave historical question-source recipes unchanged.
export function rasterPdfRegion({ pdfBytes, page, region, density = 300, resourceLimits = null }) {
  if (!(pdfBytes instanceof Uint8Array) || pdfBytes.byteLength === 0) {
    throw new Error('PDF region raster requires non-empty PDF bytes')
  }
  if (!Number.isInteger(page) || page < 1) {
    throw new Error('PDF region raster requires a positive page number')
  }
  if (!Number.isInteger(density) || density < 72 || density > 600) {
    throw new Error('PDF region raster density must be an integer from 72 through 600')
  }
  if (!normalizedRegion(region)) {
    throw new Error('PDF region raster requires a normalized region inside 0..1')
  }

  const fail = (suffix, message) => {
    throw Object.assign(new Error(message), { code: `PDF_REGION_RASTER_${suffix}` })
  }
  if (resourceLimits && ['maxPagePixels', 'maxPageDimension', 'timeoutMs']
    .some(key => !Number.isSafeInteger(resourceLimits[key]) || resourceLimits[key] < 1)) {
    fail('LIMIT', 'PDF raster budgets must be positive safe integers')
  }
  const deadline = resourceLimits ? performance.now() + resourceLimits.timeoutMs : null
  const run = (tool, args, options = {}) => {
    if (!resourceLimits) return execFileSync(tool, args, { maxBuffer, ...options })
    const remaining = Math.floor(deadline - performance.now())
    if (remaining < 1) fail('TIMEOUT', 'PDF region raster exceeded its total subprocess time budget')
    try {
      return execFileSync(tool, args, { maxBuffer: 64 * 1024, timeout: remaining,
        killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'], ...options })
    } catch (error) {
      fail(error.code === 'ETIMEDOUT' ? 'TIMEOUT' : 'FAILED', `Bounded PDF region raster subprocess failed: ${tool}`)
    }
  }
  const checkPage = (width, height) => {
    if (resourceLimits && (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)
      || width < 1 || height < 1 || width > resourceLimits.maxPageDimension
      || height > resourceLimits.maxPageDimension || width * height > resourceLimits.maxPagePixels)) {
      fail('LIMIT', 'PDF page exceeds the reference raster dimension or pixel budget')
    }
  }
  const magickLimits = resourceLimits
    ? ['-limit', 'memory', '128MiB', '-limit', 'map', '128MiB', '-limit', 'disk', '0',
      '-limit', 'thread', '1', '-limit', 'time', '10'] : []
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-pdf-region-raster-'))
  try {
    const sourcePath = path.join(temp, 'source.pdf')
    const pagePrefix = path.join(temp, 'page')
    const pagePath = `${pagePrefix}.png`
    writeFileSync(sourcePath, pdfBytes)
    if (resourceLimits) {
      const info = run('pdfinfo', ['-f', String(page), '-l', String(page), '-box', sourcePath],
        { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } })
      // pdftoppm defaults to the MediaBox, not the potentially smaller CropBox.
      const box = info.match(/^\s*(?:Page\s+\d+\s+)?MediaBox:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*$/m)?.slice(1).map(Number)
      if (!box || box.some(value => !Number.isFinite(value)) || box[2] <= box[0] || box[3] <= box[1]) {
        fail('PAGE_INVALID', 'PDF page has no finite positive MediaBox')
      }
      // pdfinfo rounds points to two decimals. One extra pixel bounds that
      // rounding error; rotation swaps axes without changing either budget.
      checkPage(Math.ceil((box[2] - box[0]) * density / 72) + 1,
        Math.ceil((box[3] - box[1]) * density / 72) + 1)
    }
    run('pdftoppm', [
      '-f', String(page),
      '-l', String(page),
      '-singlefile',
      '-r', String(density),
      '-png', sourcePath, pagePrefix,
    ])
    const [pageWidth, pageHeight] = run(
      'magick', ['identify', ...magickLimits, '-format', '%w,%h', pagePath], {
        encoding: 'utf8',
      },
    ).split(',').map(Number)
    checkPage(pageWidth, pageHeight)
    const geometry = `${Math.round(region.width * pageWidth)}x${Math.round(region.height * pageHeight)}+${Math.round(region.x * pageWidth)}+${Math.round(region.y * pageHeight)}`
    // File-backed native I/O avoids stdin spool hangs on large scanned pages.
    const cropPath = path.join(temp, 'crop.png')
    run('magick', [
      ...magickLimits, pagePath, '-crop', geometry, '+repage',
      // Exclude both binary time and date:* text, retaining color and density.
      '-define', 'png:exclude-chunks=tEXt,zTXt,iTXt,tIME', `png32:${cropPath}`,
    ])
    const bytes = new Uint8Array(readFileSync(cropPath))
    const [pixelWidth, pixelHeight] = run(
      'magick', ['identify', ...magickLimits, '-format', '%w,%h', cropPath], {
        encoding: 'utf8',
      },
    ).split(',').map(Number)
    return {
      bytes,
      pixelWidth,
      pixelHeight,
    }
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}
