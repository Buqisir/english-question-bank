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
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createServer } from '../app/node_modules/vite/dist/node/index.js'

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
const visualIdentityByFigureId = {
  [bodyFigureId]: { red: 31, green: 78, blue: 216 },
  [headerFigureId]: { red: 220, green: 38, blue: 38 },
}
const requireFromApp = createRequire(new URL('../app/package.json', import.meta.url))

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
  mkdirSync(path.join(packageDir, 'word', '_rels'), { recursive: true })
  mkdirSync(path.join(packageDir, 'word', 'media'), { recursive: true })
  writeFileSync(
    path.join(packageDir, '[Content_Types].xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="xml" ContentType="application/xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  writeFileSync(
    path.join(packageDir, '_rels', '.rels'),
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  writeFileSync(
    path.join(packageDir, 'word', '_rels', 'document.xml.rels'),
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
</Relationships>`,
  )
  writeFileSync(
    path.join(packageDir, 'word', 'document.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:v="urn:schemas-microsoft-com:vml">
 <w:body>
  <w:p><w:r><w:t>Input DOCX</w:t></w:r></w:p>
  <w:p><w:r><w:pict><v:shape id="legacy-image-shape" style="width:40pt;height:20pt">
   <v:imagedata r:id="rIdImage1"/>
  </v:shape></w:pict></w:r></w:p>
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

function makeFixtureFiles(sourceBytes) {
  const files = readImportPackageFromDirectory(fixtureDir).map((file) => ({
    ...file,
    buffer: Buffer.from(file.buffer),
  }))
  const sourceFile = files.find((file) => file.fileName.endsWith('.docx'))
  assert.ok(sourceFile)
  sourceFile.buffer = sourceBytes
  const sourceDigest = sha256(sourceBytes)
  replaceJson(files, 'import-meta.json', (value) => {
    value.sourceFileSha256 = sourceDigest
  })
  replaceJson(files, 'paper-asset.json', (value) => {
    value.sources.docx.sha256 = sourceDigest
  })
  return { files, sourceFileName: sourceFile.fileName, sourceDigest }
}

function openPaperImportDb(filePath) {
  const db = new DatabaseSync(filePath)
  db.exec(readFileSync(path.join(rootDir, 'data/sql/schema.sql'), 'utf8'))
  return db
}

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG')
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function countIdentityPixels(page, buffer, identity) {
  return page.evaluate(
    async ({ imageBase64, expected }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${imageBase64}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Browser canvas 2D context is unavailable')
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let matches = 0
      for (let offset = 0; offset < pixels.length; offset += 4) {
        if (
          Math.abs(pixels[offset] - expected.red) <= 8
          && Math.abs(pixels[offset + 1] - expected.green) <= 8
          && Math.abs(pixels[offset + 2] - expected.blue) <= 8
        ) {
          matches += 1
        }
      }
      return matches
    },
    {
      imageBase64: buffer.toString('base64'),
      expected: identity,
    },
  )
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'ticket-17-docx-input-'))
try {
  const imageDocx = makeEmbeddedImageDocx(tempRoot)
  const vmlFixture = makeFixtureFiles(imageDocx)
  const vmlAssetsDir = path.join(tempRoot, 'vml-paper-assets')
  const vmlDb = openPaperImportDb(path.join(tempRoot, 'vml-question-bank.sqlite'))
  const vmlPublished = publishPaperImportPackage({
    files: vmlFixture.files,
    db: vmlDb,
    paperAssetsDir: vmlAssetsDir,
  })
  vmlDb.close()
  assert.equal(vmlPublished.ok, true, JSON.stringify(vmlPublished.validation))
  const vmlVersionRawDir = path.join(
    vmlAssetsDir,
    paperId,
    'versions',
    'v1',
    'raw',
  )
  const storedVmlSource = readFileSync(path.join(vmlVersionRawDir, vmlFixture.sourceFileName))
  assert.deepEqual(storedVmlSource, imageDocx)
  assert.equal(sha256(storedVmlSource), vmlFixture.sourceDigest)
  const storedVmlImage = readFileSync(path.join(vmlVersionRawDir, 'docx-media', 'image1.png'))
  assert.deepEqual(storedVmlImage, imageBytes)
  assert.equal(sha256(storedVmlImage), sha256(imageBytes))
  const vmlCapture = JSON.parse(
    readFileSync(path.join(vmlVersionRawDir, 'docx-source-capture.json'), 'utf8'),
  )
  assert.equal(vmlCapture.sourceSha256, vmlFixture.sourceDigest)
  assert.equal(vmlCapture.shapeCapture, null)
  assert.deepEqual(vmlCapture.embeddedImages, [{
    fileName: 'image1.png',
    mediaType: 'image/png',
    sha256: sha256(imageBytes),
    relativePath: 'docx-media/image1.png',
  }])

  const realShapeDocx = makeRealShapeDocx(tempRoot)
  const shapeFixture = makeFixtureFiles(realShapeDocx)
  replaceJson(shapeFixture.files, 'paper-asset.json', (value) => {
    value.sources.docx.shapeAssociations = [
      {
        sourcePart: 'word/document.xml',
        sourceShapeId: 'source-body-shape',
        sourcePage: 1,
        sourcePageOrder: 2,
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
        sourcePageOrder: 1,
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

  const validation = validatePaperImportPackage(shapeFixture.files, {
    now: '2026-07-28T00:00:00.000Z',
  })
  assert.equal(validation.ok, true, JSON.stringify(validation.blockingIssues))
  assert.equal(validation.packageData.sourceDocx.mediaCapture, undefined)

  const assetsDir = path.join(tempRoot, 'paper-assets')
  const db = openPaperImportDb(path.join(tempRoot, 'question-bank.sqlite'))
  const published = publishPaperImportPackage({
    files: shapeFixture.files,
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
  assert.deepEqual(
    readFileSync(path.join(rawDir, shapeFixture.sourceFileName)),
    realShapeDocx,
  )
  assert.equal(sourceCapture.sourceSha256, shapeFixture.sourceDigest)
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
  assert.equal(manifest.sourceSha256, shapeFixture.sourceDigest)
  assert.equal(manifest.figures.length, 2)
  assert.deepEqual(
    manifest.figures.map((figure) => figure.sourcePart).sort(),
    ['word/document.xml', 'word/header1.xml'],
  )
  assert.deepEqual(
    Object.fromEntries(manifest.figures.map((figure) => [figure.sourcePart, figure.sourcePageOrder])),
    {
      'word/document.xml': 2,
      'word/header1.xml': 1,
    },
  )
  const { chromium } = requireFromApp('playwright')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const figureBytesById = new Map()
  try {
    for (const figure of manifest.figures) {
      const figureBytes = readFileSync(path.join(figuresDir, figure.file))
      figureBytesById.set(figure.figureId, figureBytes)
      const dimensions = pngDimensions(figureBytes)
      assert.equal(figure.sha256, sha256(figureBytes))
      assert.equal(figure.groupId, groupId)
      assert.equal(figure.sourcePage, 1)
      assert.ok(dimensions.width < 800 && dimensions.height < 600)
      assert.deepEqual(
        { width: figure.pixelWidth, height: figure.pixelHeight },
        dimensions,
      )
      assert.ok(
        await countIdentityPixels(
          page,
          figureBytes,
          visualIdentityByFigureId[figure.figureId],
        ) > 100,
        `${figure.figureId} crop must preserve its distinct visual identity`,
      )
    }
  } finally {
    await browser.close()
  }
  assert.notEqual(
    sha256(figureBytesById.get(bodyFigureId)),
    sha256(figureBytesById.get(headerFigureId)),
  )

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
  const manifestById = Object.fromEntries(
    manifest.figures.map((figure) => [figure.figureId, figure]),
  )
  const vite = await createServer({
    root: path.join(rootDir, 'app'),
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  })
  try {
    const { PaperSurface } = await vite.ssrLoadModule(
      '/src/shared-ui/papersurface/PaperSurface.tsx',
    )
    const { createElement } = requireFromApp('react')
    const { renderToStaticMarkup } = requireFromApp('react-dom/server')
    const screenMarkup = renderToStaticMarkup(
      createElement(PaperSurface, {
        ...screen.surfaceData,
        annotations: [],
        mode: 'lecture',
        lectureFocus: null,
        readingFocusBySection: {},
        onFocusIntent() {},
      }),
    )
    const screenBrowser = await chromium.launch({ headless: true })
    let screenImages
    try {
      const screenPage = await screenBrowser.newPage()
      await screenPage.setContent(screenMarkup)
      screenImages = await screenPage.locator('img').evaluateAll((images) =>
        images.map((image) => ({
          alt: image.getAttribute('alt'),
          src: image.getAttribute('src'),
        })))
    } finally {
      await screenBrowser.close()
    }
    for (const figureId of [headerFigureId, bodyFigureId]) {
      assert.deepEqual(
        screenImages.filter((image) => image.alt === figureId),
        [{
          alt: figureId,
          src: `/paper-assets/${paperId}/latest/figures/${manifestById[figureId].file}`,
        }],
      )
    }
  } finally {
    await vite.close()
  }

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
  for (const figureId of [headerFigureId, bodyFigureId]) {
    assert.ok(printHtml.includes(
      `<img src="/paper-assets/${paperId}/latest/figures/${manifestById[figureId].file}" alt="${figureId}">`,
    ))
  }
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
