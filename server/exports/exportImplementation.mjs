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
import {
  loadCanonicalGrammarFillPrintChrome,
} from '../paper-canonical/grammarFillPrintSourceBinding.mjs'
import {
  buildCompanionAnalysisHtml,
  companionAnalysisFileName,
  loadCompanionAnalysisSource,
} from './companionAnalysisRenderer.mjs'

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

function defaultTimestampPrefix() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

function safeFileTitle(value) {
  return String(value || '').replace(/[\\/:*?"<>|]/gu, '-').trim()
}

function assertContainedIn(outputPath, dir) {
  const resolvedOutput = path.resolve(outputPath)
  const resolvedDir = path.resolve(dir)
  if (resolvedOutput !== resolvedDir && !resolvedOutput.startsWith(resolvedDir + path.sep)) {
    throw new Error('export path escapes exportDir')
  }
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
  execFileSync(resolveVivliostyleBin(rootDir), ['build', htmlPath, '-o', pdfPath], { timeout: 120000 })
}

export function createExportImplementation({
  rootDir,
  exportDir,
  getQuestionGroupDetail,
  buildPrintHtml,
  renderPrintPdf = renderPrintPdfWithVivliostyle,
  timestampPrefix = defaultTimestampPrefix,
  // Used to pick the right <img> URL scheme for Print/PDF:
  // exportPrintHtml uses web-relative paths while exportPrintPdf uses
  // same-directory file URLs inside its temporary Chromium input.
  paperAssetsDir = null,
  resolveCanonicalConsumption = null,
}) {
  if (typeof getQuestionGroupDetail !== 'function') {
    throw new Error('getQuestionGroupDetail is required')
  }
  if (typeof buildPrintHtml !== 'function') {
    throw new Error('buildPrintHtml is required')
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
    const normalizationDiagnostics = []
    const canonicalConsumption = resolveCanonicalConsumption
      ? resolveCanonicalConsumption({
          consumerId: 'print_pdf',
          items: exportItems,
        })
      : null
    const grammarFillChrome = loadCanonicalGrammarFillPrintChrome({
      exportItems,
      canonicalConsumption,
      paperAssetsDir: paperAssetsDir || rootDir,
      versionType,
    })
    const html = buildPrintHtml({
      title,
      versionType,
      printStyle,
      items: exportItems,
      blocks,
      questionNumberStart,
      paperAssetsDir,
      imageMode,
      images,
      normalizationDiagnostics,
      canonicalConsumption,
      grammarFillChrome,
    })
    const versionLabel = versionType === 'student' ? '学生版' : '教师版'
    const fileName = `${safeFileTitle(title)}-${versionLabel}-精排.html`

    return { body: html, fileName, images, normalizationDiagnostics }
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
      const fileName = `${safeFileTitle(title)}-${versionLabel}-精排.pdf`
      const outputPath = path.join(exportDir, `${timestampPrefix()}-${fileName}`)
      assertContainedIn(outputPath, exportDir)
      copyFileSync(pdfPath, outputPath)
      return {
        body: readFileSync(outputPath),
        fileName,
        outputPath,
        normalizationDiagnostics: htmlResult.normalizationDiagnostics,
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  function exportCompanionAnalysisHtml(input) {
    const paperId = requiredString(input.paperId, 'paperId')
    const source = loadCompanionAnalysisSource({ paperAssetsDir, paperId })
    return {
      body: buildCompanionAnalysisHtml(source),
      fileName: companionAnalysisFileName(source.paperAsset, 'html'),
    }
  }

  function exportCompanionAnalysisPdf(input) {
    const paperId = requiredString(input.paperId, 'paperId')
    const source = loadCompanionAnalysisSource({ paperAssetsDir, paperId })
    const html = buildCompanionAnalysisHtml(source)

    mkdirSync(exportDir, { recursive: true })
    const tempDir = mkdtempSync(path.join(tmpdir(), 'question-bank-companion-analysis-'))
    const htmlPath = path.join(tempDir, 'companion-analysis.html')
    const pdfPath = path.join(tempDir, 'companion-analysis.pdf')

    try {
      writeFileSync(htmlPath, html)
      renderPrintPdf({ html, htmlPath, pdfPath, rootDir })
      const fileName = companionAnalysisFileName(source.paperAsset)
      const outputPath = path.join(exportDir, `${timestampPrefix()}-${fileName}`)
      copyFileSync(pdfPath, outputPath)
      return {
        body: readFileSync(outputPath),
        fileName,
        outputPath,
      }
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  }

  return {
    exportCompanionAnalysisHtml,
    exportCompanionAnalysisPdf,
    exportPrintHtml,
    exportPrintPdf,
    sendBinary,
    sendPdf,
  }
}

export { sendBinary, sendPdf }
