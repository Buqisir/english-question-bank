#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { importCanonicalCandidate } from '../shared/paper-canonical/compiler.mjs'
import { rasterPdfRegion } from '../server/paper-canonical/pdfRegionRaster.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import { makeFixture } from './verify-nck1-source-materialization.mjs'

// `rasterPdfRegion` is the deterministic core for the replayable `pdf_crop`
// media recipe. ImageMagick's `png32:-` writer emits an ancillary `tIME` chunk
// (wall-clock time at one-second resolution) by default, so the crop output
// would otherwise drift across UTC seconds even for identical inputs — breaking
// `validateBundle`'s byte-for-byte replay assertion (`MATERIALIZATION_MEDIA_RECIPE_MISMATCH`).
// These checks pin the crop output to be byte-stable across a wall-clock second.

const ONE_PAGE_REGION = { x: 0.6, y: 0.3, width: 0.2, height: 0.2 }
const CROP_DENSITY = 150

function bytesEqual(left, right) {
  if (left.byteLength !== right.byteLength) return false
  const a = new Uint8Array(left)
  const b = new Uint8Array(right)
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

function pngChunkTypes(bytes) {
  const buffer = Buffer.from(bytes)
  assert.equal(buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50
    && buffer[2] === 0x4e && buffer[3] === 0x47, true,
  'rasterPdfRegion crop output must be a PNG')
  const types = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    offset += 4
    const type = buffer.toString('ascii', offset, offset + 4)
    offset += 4 + length + 4
    types.push(type)
    if (type === 'IEND') break
  }
  return types
}

function buildThreePagePdf(dir) {
  const pdfPath = path.join(dir, 'crop-replay-source.pdf')
  execFileSync('magick', [
    '-size', '800x1100', 'xc:#f5f5f5',
    '-size', '800x1100', 'xc:#e0e8f0',
    '-size', '800x1100', 'xc:#d0e8d0',
    pdfPath,
  ])
  const info = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf8' })
  const pageCount = Number(/^Pages:\s+(\d+)$/mu.exec(info)[1])
  assert.equal(pageCount, 3, 'synthetic crop-replay fixture PDF must have three pages')
  return new Uint8Array(readFileSync(pdfPath))
}

function buildAnswersPdf(dir) {
  const pdfPath = path.join(dir, 'crop-replay-answers.pdf')
  execFileSync('magick', ['-size', '600x800', 'xc:#ffeedd', pdfPath])
  return new Uint8Array(readFileSync(pdfPath))
}

function rgbaPixels(pngBytes) {
  return new Uint8Array(execFileSync('magick', ['png:-', 'rgba:-'], {
    input: pngBytes,
    maxBuffer: 50 * 1024 * 1024,
  }))
}

const temp = mkdtempSync(path.join(tmpdir(), 'eqb-pdf-crop-recipe-replay-'))
try {
  const paperBytes = buildThreePagePdf(temp)
  const recipePdfBytes = paperBytes
  const region = structuredClone(ONE_PAGE_REGION)

  const first = rasterPdfRegion({ pdfBytes: recipePdfBytes, page: 3, region, density: CROP_DENSITY })
  const firstChunks = pngChunkTypes(first.bytes)
  assert.equal(firstChunks.includes('tIME'), false,
    'rasterPdfRegion crop output must not embed a non-deterministic PNG tIME chunk')
  for (const required of ['IHDR', 'IDAT', 'IEND']) {
    assert.equal(firstChunks.includes(required), true,
      `rasterPdfRegion crop output must retain the PNG ${required} chunk`)
  }

  await new Promise((resolve) => { setTimeout(resolve, 1100) })

  const second = rasterPdfRegion({ pdfBytes: recipePdfBytes, page: 3, region, density: CROP_DENSITY })
  assert.equal(second.pixelWidth, first.pixelWidth)
  assert.equal(second.pixelHeight, first.pixelHeight)
  assert.equal(bytesEqual(first.bytes, second.bytes), true,
    'rasterPdfRegion crop output must be byte-stable across a wall-clock second for identical recipe inputs')
  assert.equal(sha256(first.bytes), sha256(second.bytes))

  const firstPixels = rgbaPixels(first.bytes)
  const secondPixels = rgbaPixels(second.bytes)
  assert.equal(bytesEqual(firstPixels, secondPixels), true,
    'rasterPdfRegion decoded RGBA pixels must remain identical after stripping the tIME chunk (OCR raster and source-visual consumers rely on pixel, not PNG-container, equality)')

  const materialization = makeFixture({ mixedTable: true })
  materialization.documents[0] = {
    ...materialization.documents[0],
    sha256: sha256(paperBytes),
    byteLength: paperBytes.byteLength,
    pageCount: 3,
  }
  materialization.sourceCoverage.reviewedPages = [1, 2, 3]
  const extraction = materialization.media[0].extraction
  assert.equal(extraction.kind, 'pdf_crop')
  assert.equal(extraction.page, 3)

  const captured = rasterPdfRegion({
    pdfBytes: paperBytes,
    page: extraction.page,
    region: extraction.region,
    density: extraction.density,
  })
  materialization.media[0] = {
    ...materialization.media[0],
    sha256: sha256(captured.bytes),
    pixelWidth: captured.pixelWidth,
    pixelHeight: captured.pixelHeight,
  }

  const answersBytes = buildAnswersPdf(temp)
  materialization.documents[1] = {
    ...materialization.documents[1],
    sha256: sha256(answersBytes),
    byteLength: answersBytes.byteLength,
    pageCount: 1,
  }

  const materializationInput = {
    kind: 'nck1-source-materialization',
    materializationBytes: new TextEncoder().encode(JSON.stringify(materialization)),
    documents: [
      { documentId: 'paper', bytes: paperBytes },
      { documentId: 'answers', bytes: answersBytes },
    ],
    media: [{ mediaId: materialization.media[0].mediaId, bytes: captured.bytes }],
  }

  await new Promise((resolve) => { setTimeout(resolve, 1100) })

  const replayA = importCanonicalCandidate(materializationInput)
  assert.deepEqual(replayA.issues, [],
    'a pdf_crop media item captured and replayed across a wall-clock second must close validateBundle without MATERIALIZATION_MEDIA_RECIPE_MISMATCH')

  const replayB = importCanonicalCandidate(materializationInput)
  assert.deepEqual(replayB.issues, [],
    'a pdf_crop media item re-replayed at a later wall-clock second must remain closure-clean')

  const tampered = JSON.parse(JSON.stringify(materialization))
  tampered.media[0].extraction.page = 2
  const mismatched = importCanonicalCandidate({
    ...materializationInput,
    materializationBytes: new TextEncoder().encode(JSON.stringify(tampered)),
  })
  assert.equal(
    mismatched.issues.some((item) => item.code === 'MATERIALIZATION_MEDIA_RECIPE_MISMATCH'),
    true,
    'a pdf_crop recipe that no longer replays the supplied immutable bytes must still raise MATERIALIZATION_MEDIA_RECIPE_MISMATCH',
  )
} finally {
  rmSync(temp, { recursive: true, force: true })
}

console.log('verify-nck1-pdf-crop-recipe-replay: PASS')
