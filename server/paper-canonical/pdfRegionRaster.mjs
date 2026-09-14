import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
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

export function rasterPdfRegion({ pdfBytes, page, region, density = 300 }) {
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

  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-pdf-region-raster-'))
  try {
    const sourcePath = path.join(temp, 'source.pdf')
    const pagePrefix = path.join(temp, 'page')
    const pagePath = `${pagePrefix}.png`
    writeFileSync(sourcePath, pdfBytes)
    execFileSync('pdftoppm', [
      '-f', String(page),
      '-l', String(page),
      '-singlefile',
      '-r', String(density),
      '-png', sourcePath, pagePrefix,
    ], { maxBuffer })
    const [pageWidth, pageHeight] = execFileSync(
      'magick', ['identify', '-format', '%w,%h', pagePath], {
        encoding: 'utf8',
        maxBuffer,
      },
    ).split(',').map(Number)
    const geometry = `${Math.round(region.width * pageWidth)}x${Math.round(region.height * pageHeight)}+${Math.round(region.x * pageWidth)}+${Math.round(region.y * pageHeight)}`
    const bytes = new Uint8Array(execFileSync('magick', [
      pagePath, '-crop', geometry, '+repage',
      // Exclude both binary time and date:* text, retaining color and density.
      '-define', 'png:exclude-chunks=tEXt,zTXt,iTXt,tIME', 'png32:-',
    ], { maxBuffer }))
    const [pixelWidth, pixelHeight] = execFileSync(
      'magick', ['identify', '-format', '%w,%h', '-'], {
        encoding: 'utf8',
        input: bytes,
        maxBuffer,
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
