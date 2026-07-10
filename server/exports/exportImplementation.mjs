import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

function requiredString(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} is required`)
  }

  return value.trim()
}

function optionalString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function requiredEnum(value, allowed, label) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} is invalid`)
  }

  return value
}

function docxFileName(title, versionType) {
  const versionLabel = versionType === 'student' ? '学生版' : '教师版'
  const cleanTitle = String(title || '英语题集')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)

  return `${cleanTitle || '英语题集'}-${versionLabel}.docx`
}

function pdfFileName(title, versionType) {
  return docxFileName(title, versionType).replace(/\.docx$/, '.pdf')
}

function defaultTimestampPrefix() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function sendBinary(response, { body, fileName, outputPath, contentType }) {
  response.writeHead(200, {
    'access-control-allow-origin': 'http://127.0.0.1:5173',
    'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-expose-headers': 'content-disposition, x-file-name, x-output-path',
    'content-disposition': `attachment; filename="${encodeURIComponent(fileName)}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    'content-type': contentType,
    'x-file-name': encodeURIComponent(fileName),
    'x-output-path': encodeURIComponent(outputPath),
  })
  response.end(body)
}

function sendDocx(response, body, fileName, outputPath) {
  sendBinary(response, {
    body,
    fileName,
    outputPath,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

function sendPdf(response, body, fileName, outputPath) {
  sendBinary(response, {
    body,
    fileName,
    outputPath,
    contentType: 'application/pdf',
  })
}

function resolveExportItems(input, getQuestionGroupDetail) {
  const items = Array.isArray(input.items) ? input.items : []

  if (items.length === 0) {
    throw new Error('items are required')
  }

  return items.map((item) => {
    const itemInput = item && typeof item === 'object' ? item : {}
    const questionGroupId = requiredString(itemInput.questionGroupId, 'questionGroupId')
    const detail = getQuestionGroupDetail(questionGroupId)

    if (!detail) {
      throw new Error(`questionGroupId not found: ${questionGroupId}`)
    }

    return {
      detail,
      note: optionalString(itemInput.note),
      score: Math.max(0, Number.isFinite(Number(itemInput.score)) ? Number(itemInput.score) : detail.defaultScore),
      sectionTitle: optionalString(itemInput.sectionTitle),
    }
  })
}

function normalizedQuestionNumberStart(input) {
  return Number.isInteger(Number(input.questionNumberStart)) && Number(input.questionNumberStart) >= 1
    ? Number(input.questionNumberStart)
    : 1
}

function resolveVivliostyleBin(rootDir) {
  const vivliostylePaths = [
    path.join(rootDir, 'node_modules', '.bin', 'vivliostyle'),
    path.join(rootDir, 'server', 'node_modules', '.bin', 'vivliostyle'),
  ]

  for (const candidate of vivliostylePaths) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error('vivliostyle CLI not found. Install with: npm install @vivliostyle/cli')
}

function renderPrintPdfWithVivliostyle({ htmlPath, pdfPath, rootDir }) {
  execFileSync(resolveVivliostyleBin(rootDir), ['build', htmlPath, '-o', pdfPath], { timeout: 60000 })
}

export function createExportImplementation({
  rootDir,
  exportDir,
  getQuestionGroupDetail,
  buildDocumentXml,
  writeDocxPackage,
  buildPrintHtml,
  convertDocxToPdf,
  renderPrintPdf = renderPrintPdfWithVivliostyle,
  timestampPrefix = defaultTimestampPrefix,
  // figure-render cut (fig-token P0): optional — a caller/test that omits
  // it (every existing one does) gets pre-cut byte-identical output, since
  // buildDocumentXml/buildPrintHtml never even look up figures without a
  // real paperAssetsDir. Used to resolve each group's figures/manifest.json
  // for DOCX embedding (exportDocx) and to pick the right <img> URL scheme
  // for print/PDF (exportPrintHtml uses web-relative paths for the
  // browser-rendered preview; exportPrintPdf overrides to absolute file://
  // paths since Vivliostyle CLI converts the HTML from a scratch tempdir
  // with no web server underneath it — see print-renderer.mjs's
  // `figureImageSrc` doc comment for the full "why two modes" story).
  paperAssetsDir = null,
}) {
  if (typeof getQuestionGroupDetail !== 'function') {
    throw new Error('getQuestionGroupDetail is required')
  }
  if (typeof buildDocumentXml !== 'function') {
    throw new Error('buildDocumentXml is required')
  }
  if (typeof writeDocxPackage !== 'function') {
    throw new Error('writeDocxPackage is required')
  }
  if (typeof buildPrintHtml !== 'function') {
    throw new Error('buildPrintHtml is required')
  }
  if (typeof convertDocxToPdf !== 'function') {
    throw new Error('convertDocxToPdf is required')
  }

  function exportDocx(input) {
    const title = requiredString(input.title, 'title')
    const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
    const exportItems = resolveExportItems(input, getQuestionGroupDetail)
    const questionNumberStart = normalizedQuestionNumberStart(input)
    const blocks = Array.isArray(input.blocks) ? input.blocks : null

    mkdirSync(exportDir, { recursive: true })
    const fileName = docxFileName(title, versionType)
    const outputPath = path.join(exportDir, `${timestampPrefix()}-${fileName}`)
    const printStyle = input.printStyle === 'exam' ? 'exam' : 'handout'
    // figure-render cut: `images` is an out-parameter buildDocumentXml
    // populates while walking the passage — see docxRenderer.mjs's header
    // comment above buildExamDocumentXml for why it isn't a return value.
    const images = []
    const documentXml = buildDocumentXml({ title, versionType, items: exportItems, blocks, questionNumberStart, printStyle, paperAssetsDir, images })
    const body = writeDocxPackage({ documentXml, images, outputPath, title })

    return {
      body,
      fileName,
      outputPath,
    }
  }

  function exportPdf(input) {
    const title = requiredString(input.title, 'title')
    const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
    const docxResult = exportDocx({ ...input, title, versionType })
    const fileName = pdfFileName(title, versionType)
    const outputPath = docxResult.outputPath.replace(/\.docx$/, '.pdf')

    convertDocxToPdf(docxResult.outputPath, outputPath)
    rmSync(docxResult.outputPath, { force: true })

    return {
      body: readFileSync(outputPath),
      fileName,
      outputPath,
    }
  }

  // figure-render cut: `imageMode` is an internal option (never taken from
  // `input`, so it isn't attacker/caller controllable over the public
  // export HTTP input) — 'web' (default) for the browser-rendered preview
  // route, 'file' only from exportPrintPdf's internal call below. See
  // print-renderer.mjs's `figureImageSrc` doc comment.
  // figure-render cut: `images` is an out-parameter buildPrintHtml
  // populates ONLY in imageMode:'file' (see print-renderer.mjs's
  // figureImageSrc doc comment) — exportPrintHtml returns it so
  // exportPrintPdf can copy the real PNGs into the SAME tempdir as the
  // HTML before invoking Vivliostyle. Destructuring callers (sendHtml
  // picks only `{ body, fileName }`) safely ignore the extra field.
  function exportPrintHtml(input, { imageMode = 'web' } = {}) {
    const title = requiredString(input.title, 'title')
    const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
    const exportItems = resolveExportItems(input, getQuestionGroupDetail)
    const printStyle = input.printStyle === 'handout' ? 'handout' : 'exam'
    const questionNumberStart = normalizedQuestionNumberStart(input)
    const blocks = Array.isArray(input.blocks) ? input.blocks : null

    const images = []
    const html = buildPrintHtml({ title, versionType, printStyle, items: exportItems, blocks, questionNumberStart, paperAssetsDir, imageMode, images })
    const versionLabel = versionType === 'student' ? '学生版' : '教师版'
    const fileName = `${title}-${versionLabel}-精排.html`

    return { body: html, fileName, images }
  }

  function exportPrintPdf(input) {
    const htmlResult = exportPrintHtml(input, { imageMode: 'file' })
    const title = requiredString(input.title, 'title')
    const versionType = requiredEnum(input.versionType, ['student', 'teacher'], 'versionType')
    const versionLabel = versionType === 'student' ? '学生版' : '教师版'

    mkdirSync(exportDir, { recursive: true })
    const tempDir = mkdtempSync(path.join(tmpdir(), 'question-bank-print-'))
    const htmlPath = path.join(tempDir, 'paper.html')
    const pdfPath = path.join(tempDir, 'paper.pdf')

    try {
      writeFileSync(htmlPath, htmlResult.body)
      // figure-render cut: copy each referenced PNG into the SAME tempdir
      // as paper.html, using the relative filename buildPrintHtml already
      // baked into the <img src> — same-directory file:// resource
      // loading works with headless Chromium; cross-directory does not
      // (browser-QA finding, see print-renderer.mjs's figureImageSrc doc).
      for (const image of htmlResult.images) {
        copyFileSync(image.absoluteSourcePath, path.join(tempDir, image.relativeName))
      }
      renderPrintPdf({ html: htmlResult.body, htmlPath, pdfPath, rootDir })
      const fileName = `${title}-${versionLabel}-精排.pdf`
      const outputPath = path.join(exportDir, `${timestampPrefix()}-${fileName}`)
      copyFileSync(pdfPath, outputPath)
      return { body: readFileSync(outputPath), fileName, outputPath }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  return {
    exportDocx,
    exportPdf,
    exportPrintHtml,
    exportPrintPdf,
    sendBinary,
    sendDocx,
    sendPdf,
  }
}

export { sendBinary, sendDocx, sendPdf }
