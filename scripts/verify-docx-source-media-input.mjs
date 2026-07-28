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
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'

import {
  captureDocxSourceMedia,
  convertDocxShapesWithLibreOffice,
} from '../server/paper-import/docxSourceMedia.mjs'
import { parseReadingDocxBuffer } from '../server/paper-import-ai/docxSplitter.mjs'
import { publishPaperImportPackage } from '../server/paper-import/publisher.mjs'
import {
  readImportPackageFromDirectory,
  sha256,
  validatePaperImportPackage,
} from '../server/paper-import/validator.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixtureDir = path.join(rootDir, 'test-fixtures/paper-import/paper-2024-jslk-english')
const imageBytes = Buffer.from('ticket-17-embedded-image-bytes')
const shapePdfBytes = Buffer.from('%PDF-ticket-17-shape-capture')

function makeDocxFixture(tempRoot) {
  const packageDir = path.join(tempRoot, 'package')
  mkdirSync(path.join(packageDir, '_rels'), { recursive: true })
  mkdirSync(path.join(packageDir, 'word', 'media'), { recursive: true })
  writeFileSync(path.join(packageDir, '[Content_Types].xml'), '<Types/>')
  writeFileSync(path.join(packageDir, '_rels', '.rels'), '<Relationships/>')
  writeFileSync(
    path.join(packageDir, 'word', 'document.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
 <w:body>
  <w:p><w:r><w:t>Input DOCX</w:t></w:r></w:p>
  <w:p><w:r><w:drawing><a:blip r:embed="rIdImage1"/></w:drawing></w:r></w:p>
  <w:p><w:r><w:pict><v:shape id="shape-1"/></w:pict></w:r></w:p>
 </w:body>
</w:document>`,
  )
  writeFileSync(path.join(packageDir, 'word', 'media', 'image1.png'), imageBytes)
  const docxPath = path.join(tempRoot, 'source.docx')
  execFileSync('zip', ['-X', '-q', '-r', docxPath, '.'], { cwd: packageDir })
  return readFileSync(docxPath)
}

function replaceJson(files, fileName, mutate) {
  const file = files.find((candidate) => candidate.fileName === fileName)
  assert.ok(file, `missing ${fileName}`)
  const value = JSON.parse(file.buffer.toString('utf8'))
  mutate(value)
  file.buffer = Buffer.from(`${JSON.stringify(value, null, 2)}\n`)
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'ticket-17-docx-input-'))
try {
  const docxBuffer = makeDocxFixture(tempRoot)

  let shapeConversionCalls = 0
  const captured = captureDocxSourceMedia({
    fileName: 'source.docx',
    buffer: docxBuffer,
    convertShapesToPdf(input) {
      shapeConversionCalls += 1
      assert.deepEqual(input, docxBuffer)
      return shapePdfBytes
    },
  })
  assert.equal(shapeConversionCalls, 1)
  assert.equal(captured.embeddedImages.length, 1)
  assert.equal(captured.embeddedImages[0].fileName, 'image1.png')
  assert.deepEqual(captured.embeddedImages[0].buffer, imageBytes)
  assert.equal(captured.embeddedImages[0].sha256, sha256(imageBytes))
  assert.equal(captured.shapeCapture.fileName, 'docx-shapes.pdf')
  assert.deepEqual(captured.shapeCapture.buffer, shapePdfBytes)
  assert.equal(captured.shapeCapture.sha256, sha256(shapePdfBytes))

  let sofficeInvocation = null
  const converted = convertDocxShapesWithLibreOffice(docxBuffer, {
    sofficePath: '/verified/input-side/soffice',
    execFileSyncImpl(command, args) {
      sofficeInvocation = { command, args }
      const outputDir = args[args.indexOf('--outdir') + 1]
      writeFileSync(path.join(outputDir, 'source.pdf'), shapePdfBytes)
    },
  })
  assert.deepEqual(converted, shapePdfBytes)
  assert.equal(sofficeInvocation.command, '/verified/input-side/soffice')
  assert.deepEqual(
    sofficeInvocation.args.slice(0, 4),
    ['--headless', '--convert-to', 'pdf', '--outdir'],
  )

  const fixtureFiles = readImportPackageFromDirectory(fixtureDir).map((file) => ({
    ...file,
    buffer: Buffer.from(file.buffer),
  }))
  const sourceFile = fixtureFiles.find((file) => file.fileName.endsWith('.docx'))
  assert.ok(sourceFile)
  sourceFile.buffer = docxBuffer
  const sourceDigest = sha256(docxBuffer)
  replaceJson(fixtureFiles, 'import-meta.json', (value) => {
    value.sourceFileSha256 = sourceDigest
  })
  replaceJson(fixtureFiles, 'paper-asset.json', (value) => {
    value.sources.docx.sha256 = sourceDigest
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
    docxSourceMediaCaptureOptions: {
      convertShapesToPdf: () => shapePdfBytes,
    },
  })
  db.close()
  assert.equal(published.ok, true, JSON.stringify(published.validation))
  const rawDir = path.join(
    assetsDir,
    'paper-2024-jslk-english',
    'versions',
    'v1',
    'raw',
  )
  assert.deepEqual(readFileSync(path.join(rawDir, 'docx-media', 'image1.png')), imageBytes)
  assert.deepEqual(readFileSync(path.join(rawDir, 'docx-shapes.pdf')), shapePdfBytes)
  const sourceCapture = JSON.parse(readFileSync(path.join(rawDir, 'docx-source-capture.json'), 'utf8'))
  assert.equal(sourceCapture.sourceSha256, sourceDigest)
  assert.equal(sourceCapture.embeddedImages[0].sha256, sha256(imageBytes))
  assert.equal(sourceCapture.shapeCapture.sha256, sha256(shapePdfBytes))

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

  console.log('PASS: DOCX source splitting, media/shape capture, LibreOffice input conversion, and immutable storage')
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}
