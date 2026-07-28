#!/usr/bin/env node
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import {
  captureDocxSourceMedia,
} from '../server/paper-import/docxSourceMedia.mjs'
import { resolveGroupFigures } from '../server/figures/paperFigures.mjs'
import { parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import {
  readImportPackageFromDirectory,
  sha256,
  validatePaperImportPackage,
} from '../server/paper-import/validator.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = path.join(rootDir, 'test-fixtures/paper-import/paper-2024-jslk-english')
const shapeSourcePath = path.join(rootDir, 'test-fixtures/paper-import/docx-source-shapes.fodt')
const imageBytes = Buffer.from('ticket-17-embedded-image-bytes')
const paperId = 'paper-2024-jslk-english'
const groupId = 'group-2024-jslk-reading-a'
const bodyFigureId = 'fig-paper-2024-jslk-english-reading-a-body-shape'
const headerFigureId = 'fig-paper-2024-jslk-english-reading-a-header-shape'
const bodyMarker = `[图: ${bodyFigureId}]`
const headerMarker = `[图: ${headerFigureId}]`

function findSoffice() {
  return [
    process.env.SOFFICE_PATH,
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    'soffice',
  ].filter(Boolean).find((candidate) => candidate === 'soffice' || existsSync(candidate))
}

function makeEmbeddedImageDocx(tempRoot) {
  const packageDir = path.join(tempRoot, 'embedded-image-package')
  mkdirSync(path.join(packageDir, '_rels'), { recursive: true })
  mkdirSync(path.join(packageDir, 'word', 'media'), { recursive: true })
  writeFileSync(path.join(packageDir, '[Content_Types].xml'), '<Types/>')
  writeFileSync(path.join(packageDir, '_rels', '.rels'), '<Relationships/>')
  writeFileSync(
    path.join(packageDir, 'word', 'document.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <w:body>
  <w:p><w:r><w:t>Input DOCX</w:t></w:r></w:p>
  <w:p><w:r><w:drawing><a:blip r:embed="rIdImage1"/></w:drawing></w:r></w:p>
 </w:body>
</w:document>`,
  )
  writeFileSync(path.join(packageDir, 'word', 'media', 'image1.png'), imageBytes)
  const docxPath = path.join(tempRoot, 'embedded-image-source.docx')
  execFileSync('zip', ['-X', '-q', '-r', docxPath, '.'], { cwd: packageDir })
  return readFileSync(docxPath)
}

function makeRealShapeDocx(tempRoot) {
  const sofficePath = findSoffice()
  assert.ok(sofficePath, 'LibreOffice is required for the real DOCX shape input proof')
  const outputDir = path.join(tempRoot, 'real-shape-input')
  mkdirSync(outputDir, { recursive: true })
  const profileUrl = pathToFileURL(path.join(tempRoot, 'libreoffice-fodt-profile')).href
  execFileSync(
    sofficePath,
    [
      `-env:UserInstallation=${profileUrl}`,
      '--headless',
      '--convert-to',
      'docx',
      '--outdir',
      outputDir,
      shapeSourcePath,
    ],
    { stdio: 'pipe', timeout: 60_000 },
  )
  const docxPath = path.join(outputDir, 'docx-source-shapes.docx')
  assert.equal(existsSync(docxPath), true, 'LibreOffice must create the real shape DOCX fixture')
  return readFileSync(docxPath)
}

function replaceJson(files, fileName, mutate) {
  const file = files.find((candidate) => candidate.fileName === fileName)
  assert.ok(file, `missing ${fileName}`)
  const value = JSON.parse(file.buffer.toString('utf8'))
  mutate(value)
  file.buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'ticket-17-docx-input-'))
try {
  const imageDocx = makeEmbeddedImageDocx(tempRoot)
  const imageCapture = captureDocxSourceMedia({
    fileName: 'embedded-image-source.docx',
    buffer: imageDocx,
  })
  assert.equal(imageCapture.embeddedImages.length, 1)
  assert.equal(imageCapture.embeddedImages[0].fileName, 'image1.png')
  assert.deepEqual(imageCapture.embeddedImages[0].buffer, imageBytes)
  assert.equal(imageCapture.embeddedImages[0].sha256, sha256(imageBytes))
  assert.equal(imageCapture.shapeCapture, null)

  const realShapeDocx = makeRealShapeDocx(tempRoot)
  const fixtureFiles = readImportPackageFromDirectory(fixtureDir).map((file) => ({
    ...file,
    buffer: Buffer.from(file.buffer),
  }))
  const sourceFile = fixtureFiles.find((file) => file.fileName.endsWith('.docx'))
  assert.ok(sourceFile)
  sourceFile.buffer = realShapeDocx
  const sourceDigest = sha256(realShapeDocx)
  replaceJson(fixtureFiles, 'import-meta.json', (value) => {
    value.sourceFileSha256 = sourceDigest
  })
  replaceJson(fixtureFiles, 'paper-asset.json', (value) => {
    value.sources.docx.sha256 = sourceDigest
    value.sources.docx.shapeAssociations = [
      {
        sourcePart: 'word/document.xml',
        sourceShapeId: 'source-body-shape',
        sourcePage: 1,
        figureId: bodyFigureId,
        groupId,
        kind: 'figure',
        placeholderMarker: bodyMarker,
        caption: 'Body shape from the immutable DOCX source',
      },
      {
        sourcePart: 'word/header1.xml',
        sourceShapeId: 'source-header-shape',
        sourcePage: 1,
        figureId: headerFigureId,
        groupId,
        kind: 'figure',
        placeholderMarker: headerMarker,
        caption: 'Header shape from the immutable DOCX source',
      },
    ]
    value.content.groups[groupId].passage.paragraphs.unshift(
      {
        paragraphId: 'p-ticket17-header-shape',
        text: `${headerMarker} HEADER SHAPE`,
      },
      {
        paragraphId: 'p-ticket17-body-shape',
        text: `${bodyMarker} BODY SHAPE`,
      },
    )
  })

  const validation = validatePaperImportPackage(fixtureFiles, {
    now: '2026-07-28T00:00:00.000Z',
  })
  assert.equal(validation.ok, true, JSON.stringify(validation.blockingIssues))
  assert.equal(validation.packageData.sourceDocx.mediaCapture, undefined)

  const assetsDir = path.join(tempRoot, 'paper-assets')
  const db = new DatabaseSync(path.join(tempRoot, 'question-bank.sqlite'))
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  const published = publishPaperImportPackage({
    files: fixtureFiles,
    db,
    paperAssetsDir: assetsDir,
  })
  db.close()
  assert.equal(published.ok, true, JSON.stringify(published.validation))
  assert.equal(published.publish.paperId, paperId)

  const versionDir = path.join(assetsDir, paperId, 'versions', 'v1')
  const rawDir = path.join(
    versionDir,
    'raw',
  )
  const shapePdf = readFileSync(path.join(rawDir, 'docx-shapes.pdf'))
  assert.equal(shapePdf.subarray(0, 4).toString('ascii'), '%PDF')
  const sourceCapture = JSON.parse(readFileSync(path.join(rawDir, 'docx-source-capture.json'), 'utf8'))
  assert.equal(sourceCapture.sourceSha256, sourceDigest)
  assert.equal(sourceCapture.shapeCapture.sha256, sha256(shapePdf))
  assert.deepEqual(
    sourceCapture.shapeCapture.sourceParts.sort(),
    ['word/document.xml', 'word/header1.xml'],
  )

  const latestDir = path.join(assetsDir, paperId, 'latest')
  const figuresDir = path.join(latestDir, 'figures')
  const manifest = JSON.parse(readFileSync(path.join(figuresDir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.schemaVersion, 'paper-figures-manifest-v1')
  assert.equal(manifest.paperId, paperId)
  assert.equal(manifest.sourceSha256, sourceDigest)
  assert.equal(manifest.figures.length, 2)
  assert.deepEqual(
    manifest.figures.map((figure) => figure.sourcePart).sort(),
    ['word/document.xml', 'word/header1.xml'],
  )
  for (const figure of manifest.figures) {
    const figureBytes = readFileSync(path.join(figuresDir, figure.file))
    const dimensions = pngDimensions(figureBytes)
    assert.equal(figure.sha256, sha256(figureBytes))
    assert.equal(figure.groupId, groupId)
    assert.equal(figure.sourcePage, 1)
    assert.ok(dimensions.width < 800 && dimensions.height < 600)
    assert.deepEqual(
      { width: figure.pixelWidth, height: figure.pixelHeight },
      dimensions,
    )
  }

  const figuresInfo = resolveGroupFigures(assetsDir, groupId)
  assert.ok(figuresInfo)
  assert.equal(figuresInfo.figures.length, 2)
  const publishedAsset = JSON.parse(readFileSync(path.join(latestDir, 'paper-asset.json'), 'utf8'))
  const publishedAnalysis = JSON.parse(readFileSync(
    path.join(latestDir, 'analyses', 'reading-choice-analysis-v1.json'),
    'utf8',
  ))
  const { buildPaperAssetSurfaceModel } = await import(
    '../app/src/features/paper-intelligence/paperAssetSurfaceAdapter.ts'
  )
  const screen = buildPaperAssetSurfaceModel({
    asset: publishedAsset,
    analysis: publishedAnalysis,
    groupId,
    figures: figuresInfo.figures,
    assetBase: `/paper-assets/${paperId}/latest`,
  })
  assert.equal(
    screen.surfaceData.textMap.paragraphs.filter((paragraph) => paragraph.figure?.kind === 'figure').length,
    2,
  )

  const group = publishedAsset.content.groups[groupId]
  const materialText = group.passage.paragraphs.map((paragraph) => paragraph.text).join('\n\n')
  const printHtml = buildPrintHtml({
    title: 'Ticket 17 DOCX shape input',
    versionType: 'student',
    printStyle: 'exam',
    items: [{
      detail: {
        id: groupId,
        title: group.title,
        groupType: group.groupType,
        passage: { materialText, summary: materialText },
        questions: [],
      },
      note: '',
      score: 1,
      sectionTitle: '',
    }],
    blocks: [{ type: 'question_group', questionGroupId: groupId, score: 1 }],
    questionNumberStart: 1,
    paperAssetsDir: assetsDir,
    imageMode: 'web',
  })
  assert.equal((printHtml.match(/<figure class="print-figure">/g) || []).length, 2)
  assert.equal(printHtml.includes(bodyMarker), false)
  assert.equal(printHtml.includes(headerMarker), false)

  const realSource = readFileSync(
    path.join(fixtureDir, '2024-jslk-english-source.docx'),
  )
  const split = await parseReadingDocxBuffer(realSource, {
    sourceFilename: '2024-jslk-english-source.docx',
  })
  assert.equal(split.paper.sourceHash, sha256(realSource))
  assert.ok(split.readingGroups.length > 0)

  assert.equal(
    existsSync(path.join(rootDir, 'server/exports/docxRenderer.mjs')),
    false,
  )
  for (const inputModule of [
    'server/paper-import/docxSourceMedia.mjs',
    'server/paper-import/validator.mjs',
    'server/paper-import/storage.mjs',
    'server/paper-import-ai/docxSplitter.mjs',
  ]) {
    const source = readFileSync(path.join(rootDir, inputModule), 'utf8')
    assert.doesNotMatch(source, /exports\/docxRenderer|exportImplementation/)
  }

  console.log('PASS: real DOCX shapes publish as cropped, digest-bound Screen/Print figures')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
