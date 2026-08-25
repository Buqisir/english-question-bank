import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { sha256 } from '../../../shared/paper-canonical/stable.mjs'

const fixedParameters = Object.freeze(['-png', '-singlefile'])

function imageEvidenceError(message) {
  const error = new Error(message)
  error.code = 'FORMAT2_ANSWER_IMAGE_EVIDENCE_FAILED'
  return error
}

function runPdftoppm(args) {
  const result = spawnSync('pdftoppm', args, {
    encoding: args.includes('-v') ? 'utf8' : null,
    env: {
      PATH: process.env.PATH || '/usr/bin:/bin',
      LANG: 'C',
      LC_ALL: 'C',
    },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error || result.status !== 0) {
    throw imageEvidenceError(
      `pdftoppm failed: ${result.error?.message || String(result.stderr || '').trim() || `exit ${result.status}`}`,
    )
  }
  return result
}

export function describeAnswerImageRasterizer() {
  const result = runPdftoppm(['-v'])
  const versionText = `${result.stdout || ''}\n${result.stderr || ''}`
  const toolVersion = /pdftoppm version\s+([^\s]+)/u.exec(versionText)?.[1]
  if (!toolVersion) throw imageEvidenceError('pdftoppm version is unavailable')
  return {
    schemaVersion: 'answer-page-rasterization-v1',
    tool: 'pdftoppm',
    toolVersion,
    parameters: [...fixedParameters],
  }
}

function pngDimensions(bytes) {
  if (
    bytes.byteLength < 24
    || !Buffer.from(bytes).subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  ) throw imageEvidenceError('pdftoppm did not produce one PNG page raster')
  return {
    pixelWidth: Buffer.from(bytes).readUInt32BE(16),
    pixelHeight: Buffer.from(bytes).readUInt32BE(20),
  }
}

export function renderAnswerPdfPageRegion(answerPdfBytes, {
  page,
  dpi,
  pixelBox = null,
}) {
  if (
    !(answerPdfBytes instanceof Uint8Array)
    || !Number.isInteger(page)
    || page < 1
    || !Number.isInteger(dpi)
    || dpi < 36
    || dpi > 600
    || (pixelBox && (
      !['x', 'y', 'width', 'height'].every((key) => Number.isInteger(pixelBox[key]))
      || pixelBox.x < 0
      || pixelBox.y < 0
      || pixelBox.width < 1
      || pixelBox.height < 1
    ))
  ) throw imageEvidenceError('Answer-page raster request is invalid')
  const renderDir = mkdtempSync(path.join(tmpdir(), 'eqb-answer-raster-'))
  try {
    const pdfPath = path.join(renderDir, 'answers.pdf')
    const outputPrefix = path.join(renderDir, 'page')
    writeFileSync(pdfPath, Buffer.from(answerPdfBytes))
    const cropArgs = pixelBox
      ? [
          '-x', String(pixelBox.x),
          '-y', String(pixelBox.y),
          '-W', String(pixelBox.width),
          '-H', String(pixelBox.height),
        ]
      : []
    runPdftoppm([
      '-f', String(page),
      '-l', String(page),
      '-r', String(dpi),
      ...fixedParameters,
      ...cropArgs,
      pdfPath,
      outputPrefix,
    ])
    const bytes = readFileSync(`${outputPrefix}.png`)
    const dimensions = pngDimensions(bytes)
    return {
      bytes,
      ...dimensions,
      byteLength: bytes.byteLength,
      sha256: sha256(new Uint8Array(bytes)),
    }
  } catch (error) {
    if (error?.code === 'FORMAT2_ANSWER_IMAGE_EVIDENCE_FAILED') throw error
    throw imageEvidenceError(error instanceof Error ? error.message : String(error))
  } finally {
    rmSync(renderDir, { recursive: true, force: true })
  }
}
