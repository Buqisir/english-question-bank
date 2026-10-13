#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readExamDate } from '../../shared/examDate.mjs'

import {
  compileNck1MaterializationCandidatePreview,
  importCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import { validateInlineBlankTextBoundaries } from '../../shared/paper-canonical/inlineBlankBoundaries.mjs'
import {
  sha256,
} from '../../shared/paper-canonical/stable.mjs'
import {
  NCK1_OCR_CONFIRMATION_FILE_NAME,
  NCK1_OCR_EVIDENCE_FILE_NAME,
  NCK1_OCR_REVIEW_CODES,
  resolveConfirmedNck1OcrEvidence,
  validateNck1OcrSourceEvidence,
} from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
  buildNck1ImageSourceBundle,
  inspectNck1SourceImage,
  nck1ImageExtension,
} from '../../server/paper-import/nck1ImageSourceBundle.mjs'
import {
  NCK1_ANSWER_ATTACHMENT_DUPLICATE,
  NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
  NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
  assertNotNck1SourceOnly,
  listNck1SourceOnlyCaptures,
  makeNck1SourceOnlyCapture,
  nck1QuestionSetDigest,
  nck1SourceOnlyDirectory,
  nck1SourceOnlyExists,
  readNck1SourceOnlyCapture,
  validNck1SourceSetId,
  writeNck1SourceOnlyCapture,
  writeNck1SourceOnlySuccessor,
} from './nck1-source-only.mjs'
import {
  runNck1MaterializationJobUnlocked,
  withPaperWriterLock,
} from './nck1-docx-materialize.mjs'
import {
  runImportEnvironmentPreflight,
  writeImportEnvironmentPreflightReceipt,
} from './import-environment-preflight.mjs'
import { rasterPdfRegion } from '../../server/paper-canonical/pdfRegionRaster.mjs'
import {
  finalizeListeningAudio,
  stageListeningAudio,
  stageSignalListeningAudio,
} from './listening-audio.mjs'
import { buildNck1ReviewProjection, loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { TEXT_REVIEW_POLICY } from '../../server/paper-import/spellingReview.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const papersRoot = path.join(import.meta.dirname, 'papers')
const docxMediaType =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function fail(message) {
  throw new Error(message)
}

function failCode(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function validPaperId(paperId) {
  return /^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paperId || '')
}

function paperDirFor(paperId) {
  if (!validPaperId(paperId)) fail('command requires a valid paperId')
  return path.join(papersRoot, paperId)
}

function writeBlockedSignal(paperId, error) {
  const signalsDir = path.join(papersRoot, paperId, 'signals')
  mkdirSync(signalsDir, { recursive: true })
  writeFileSync(path.join(signalsDir, 'blocked.json'), `${JSON.stringify({
    code: 'source_incomplete',
    at: new Date().toISOString(),
    note: String(error.message).slice(0, 240),
  }, null, 2)}\n`)
}

function retireRecoveredSpellingBlock(paperDir) {
  const blockedPath = path.join(paperDir, 'signals', 'blocked.json')
  if (!existsSync(blockedPath)) return
  const bytes = readFileSync(blockedPath)
  let blocked
  try { blocked = JSON.parse(bytes.toString('utf8')) } catch { return }
  if (blocked.code !== 'source_incomplete'
    || !blocked.note?.startsWith('Spelling review:')) return
  const historyDir = path.join(paperDir, 'signals', 'history')
  const historyPath = path.join(historyDir, `blocked-${sha256(bytes)}.json`)
  mkdirSync(historyDir, { recursive: true })
  if (existsSync(historyPath)) throw new Error('Recovered blocker history already exists')
  renameSync(blockedPath, historyPath)
}

function runPaperCommand(paperId, operation, { blockOnFailure = false } = {}) {
  const paperDir = paperDirFor(paperId)
  return withPaperWriterLock({ paperDir, paperId }, () => {
    let result
    try {
      result = operation()
    } catch (error) {
      if (blockOnFailure) writeBlockedSignal(paperId, error)
      throw error
    }
    if (process.argv[2] === 'verify') retireRecoveredSpellingBlock(paperDir)
    return result
  })
}

function values(name) {
  const result = []
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) {
      result.push(process.argv[index + 1])
      index += 1
    }
  }
  return result
}

function value(name) {
  return values(name)[0] || null
}

function mediaTypeFor(filePath) {
  const bytes = readFileSync(filePath)
  if (bytes.subarray(0, 4).toString() === '%PDF') return 'application/pdf'
  if (bytes.subarray(0, 2).toString() === 'PK') return docxMediaType
  fail(`Source is not PDF or DOCX: ${filePath}`)
}

function pdfPageCount(filePath) {
  const output = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' })
  const count = Number(/^Pages:\s+(\d+)$/m.exec(output)?.[1])
  if (!Number.isInteger(count) || count < 1) fail(`Cannot read PDF pages: ${filePath}`)
  return count
}

function fileRecord(documentId, role, filePath, relativePath, mediaType) {
  const bytes = readFileSync(filePath)
  return {
    documentId,
    role,
    mediaType,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    pageCount: mediaType === 'application/pdf' ? pdfPageCount(filePath) : null,
    path: relativePath,
  }
}

function renderDocx(docxPath, targetPath) {
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-docx-render-'))
  try {
    execFileSync('soffice', [
      '--headless',
      '--convert-to',
      'pdf',
      '--outdir',
      temp,
      docxPath,
    ], { stdio: 'pipe' })
    const rendered = path.join(
      temp,
      `${path.basename(docxPath, path.extname(docxPath))}.pdf`,
    )
    if (!existsSync(rendered)) fail(`LibreOffice did not render ${docxPath}`)
    copyFileSync(rendered, targetPath)
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function parseSource(value, index) {
  const separator = value.indexOf('=')
  if (separator < 1) fail('--source must be role=/absolute/path')
  const role = value.slice(0, separator)
  const sourcePath = path.resolve(value.slice(separator + 1))
  if (!['question_source', 'official_answers', 'question_and_answers'].includes(role)) {
    fail(`Unsupported source role: ${role}`)
  }
  if (!existsSync(sourcePath)) fail(`Source is missing: ${sourcePath}`)
  return { role, sourcePath, index }
}

function parseSourcePage(input, index) {
  const match = /^(question_source|official_answers|question_and_answers):([1-9]\d*)=(.+)$/u
    .exec(input)
  if (!match || !path.isAbsolute(match[3])) {
    fail('--source-page must be role:page=/absolute/path')
  }
  const sourcePath = path.resolve(match[3])
  if (!existsSync(sourcePath)) fail(`Source page is missing: ${sourcePath}`)
  return { role: match[1], page: Number(match[2]), sourcePath, index }
}

function groupedSourcePages(sourcePages) {
  const groups = new Map()
  for (const sourcePage of sourcePages) {
    const pages = groups.get(sourcePage.role) || []
    pages.push(sourcePage)
    groups.set(sourcePage.role, pages)
  }
  return [...groups].map(([role, pages], index) => {
    const pageNumbers = pages.map((page) => page.page)
    if (new Set(pageNumbers).size !== pageNumbers.length) {
      const error = new Error(`Image ${role} declares a duplicate page`)
      error.code = 'NCK1_IMAGE_PAGE_DUPLICATE'
      throw error
    }
    pages.sort((left, right) => left.page - right.page)
    if (pages.some((page, pageIndex) => page.page !== pageIndex + 1)) {
      const error = new Error(`Image ${role} pages must cover 1..N without gaps`)
      error.code = 'NCK1_IMAGE_BUNDLE_ORDER_INVALID'
      throw error
    }
    return { role, pages, index }
  })
}

function renderImageBundlePdf(pages, targetPath) {
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-image-rendition-'))
  try {
    const normalized = pages.map((sourcePage, index) => {
      const pagePath = path.join(temp, `page-${String(index + 1).padStart(4, '0')}.png`)
      execFileSync('magick', [
        sourcePage.sourcePath,
        '-auto-orient',
        '-resize', '1240x1754>',
        '-gravity', 'center',
        '-background', 'white',
        '-extent', '1240x1754',
        pagePath,
      ], { stdio: 'pipe' })
      return pagePath
    })
    execFileSync('magick', [
      ...normalized,
      '-units', 'PixelsPerInch',
      '-density', '150',
      targetPath,
    ], { stdio: 'pipe' })
    if (!existsSync(targetPath)) fail('Image bundle PDF rendition was not created')
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

function validateSourceInputs({ paperId, paperName, provenance, sources, imageSources }) {
  if (!validPaperId(paperId)) {
    fail('init requires a valid paperId')
  }
  if (!paperName || !provenance || (sources.length === 0 && imageSources.length === 0)) {
    fail('init requires --paper-name, --provenance, and --source or --source-page input')
  }
  if (sources.length > 0 && imageSources.length > 0) {
    fail('One init cannot mix whole-document --source with image --source-page input')
  }
  const sourceRoles = [...sources, ...imageSources].map((item) => item.role)
  if (!sourceRoles.some((role) => ['official_answers', 'question_and_answers'].includes(role))) {
    failCode(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      'Authoritative answers are required; use capture-source-only instead of generating answers',
    )
  }
  if (!sourceRoles.some((role) => ['question_source', 'question_and_answers'].includes(role))) {
    fail('One complete question source is required')
  }
}

function captureSourceDocuments({ targetDirectory, sources, imageSources }) {
  const sourceDir = path.join(targetDirectory, 'source')
  const renditionDir = path.join(sourceDir, 'renditions')
  mkdirSync(renditionDir, { recursive: true })
  const documents = []
  for (const source of sources) {
    const mediaType = mediaTypeFor(source.sourcePath)
    const extension = mediaType === 'application/pdf' ? 'pdf' : 'docx'
    const documentId = `${source.role.replaceAll('_', '-')}-${source.index + 1}`
    const relativePath = path.posix.join('source', `${documentId}.${extension}`)
    const targetPath = path.join(targetDirectory, relativePath)
    copyFileSync(source.sourcePath, targetPath)
    const record = fileRecord(
      documentId,
      source.role,
      targetPath,
      relativePath,
      mediaType,
    )
    if (mediaType === docxMediaType) {
      const renditionId = `${documentId}-pdf-rendition`
      const renditionRelativePath = path.posix.join(
        'source',
        'renditions',
        `${renditionId}.pdf`,
      )
      const renditionPath = path.join(targetDirectory, renditionRelativePath)
      renderDocx(targetPath, renditionPath)
      record.pageCount = pdfPageCount(renditionPath)
      record.renditionDocumentId = renditionId
      documents.push(record)
      documents.push({
        ...fileRecord(
          renditionId,
          source.role,
          renditionPath,
          renditionRelativePath,
          'application/pdf',
        ),
        renditionOf: documentId,
      })
    } else {
      documents.push(record)
    }
  }
  for (const imageSource of imageSources) {
    const documentId = `${imageSource.role.replaceAll('_', '-')}-${imageSource.index + 1}`
    const pageDirectory = path.posix.join('source', documentId)
    const descriptorRelativePath = path.posix.join(
      'source',
      `${documentId}.image-bundle.json`,
    )
    const pageRecords = imageSource.pages.map((sourcePage) => {
      const bytes = new Uint8Array(readFileSync(sourcePage.sourcePath))
      const inspected = inspectNck1SourceImage(bytes)
      const relativePath = path.posix.join(
        pageDirectory,
        `page-${String(sourcePage.page).padStart(4, '0')}.${nck1ImageExtension(inspected.mediaType)}`,
      )
      const targetPath = path.join(targetDirectory, relativePath)
      mkdirSync(path.dirname(targetPath), { recursive: true })
      writeFileSync(targetPath, bytes)
      return {
        page: sourcePage.page,
        path: relativePath,
        ...inspected,
        bytes,
        sourcePath: targetPath,
      }
    })
    const descriptorBytes = buildNck1ImageSourceBundle(pageRecords)
    const descriptorPath = path.join(targetDirectory, descriptorRelativePath)
    writeFileSync(descriptorPath, descriptorBytes)
    const renditionId = `${documentId}-pdf-rendition`
    const renditionRelativePath = path.posix.join(
      'source',
      'renditions',
      `${renditionId}.pdf`,
    )
    const renditionPath = path.join(targetDirectory, renditionRelativePath)
    renderImageBundlePdf(pageRecords, renditionPath)
    documents.push({
      documentId,
      role: imageSource.role,
      mediaType: NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
      sha256: sha256(descriptorBytes),
      byteLength: descriptorBytes.byteLength,
      pageCount: pageRecords.length,
      path: descriptorRelativePath,
      renditionDocumentId: renditionId,
      pages: pageRecords.map(({ bytes: _bytes, sourcePath: _sourcePath, ...page }) => page),
    })
    documents.push({
      ...fileRecord(
        renditionId,
        imageSource.role,
        renditionPath,
        renditionRelativePath,
        'application/pdf',
      ),
      renditionOf: documentId,
    })
  }
  return documents
}

function initializeCompleteSourceSet({
  paperId,
  paperName,
  provenance,
  year,
  month,
  sources,
  imageSources,
}) {
  validateSourceInputs({ paperId, paperName, provenance, sources, imageSources })
  const examDate = readExamDate({ year, month }, { required: true })
  const environment = runImportEnvironmentPreflight()
  const paperDir = path.join(papersRoot, paperId)
  const configPath = path.join(paperDir, 'config.json')
  if (existsSync(configPath)) fail(`Paper already has a writer/config: ${paperId}`)
  const documents = captureSourceDocuments({
    targetDirectory: paperDir,
    sources,
    imageSources,
  })
  const manifest = {
    schemaVersion: 'universal-nck1-source-manifest-v1',
    paperId,
    profileId: 'nck1',
    provenance: { paperName, source: provenance, ...examDate },
    documents,
    materializationPath: 'materialization/nck1-source-materialization-v1.json',
    mediaDirectory: 'materialization/media',
    canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
  }
  mkdirSync(path.join(paperDir, 'materialization', 'media'), { recursive: true })
  writeFileSync(
    path.join(paperDir, 'universal-source-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  writeFileSync(configPath, `${JSON.stringify({
    paperId,
    format: 'universal-nck1',
    importProfile: 'public-paper-v1',
    pdfProductsRequired: true,
    spellingReview: TEXT_REVIEW_POLICY,
    provenance: { paperName, source: provenance, ...examDate },
    universalSourceManifestPath: 'universal-source-manifest.json',
    canonicalRequestPath: manifest.canonicalRequestPath,
  }, null, 2)}\n`)
  writeImportEnvironmentPreflightReceipt(paperDir, environment)
  console.log(`INITIALIZED ${paperId}: ${path.relative(root, paperDir)}`)
  return { paperDir, manifest }
}

function initialize() {
  const paperId = process.argv[3]
  const paperName = value('--paper-name')
  const provenance = value('--provenance')
  const sources = values('--source').map(parseSource)
  const sourcePages = values('--source-page').map(parseSourcePage)
  const imageSources = groupedSourcePages(sourcePages)
  return initializeCompleteSourceSet({
    paperId,
    paperName,
    provenance,
    year: Number(value('--year')),
    month: Number(value('--month')),
    sources,
    imageSources,
  })
}

function captureSourceOnly() {
  const sourceSetId = process.argv[3]
  const paperName = value('--paper-name')
  const provenance = value('--provenance')
  const sources = values('--source').map(parseSource)
  const imageSources = groupedSourcePages(values('--source-page').map(parseSourcePage))
  if (!validNck1SourceSetId(sourceSetId)) {
    fail('capture-source-only requires a valid sourceSetId beginning with source-set-')
  }
  if (!paperName || !provenance || (sources.length === 0 && imageSources.length === 0)) {
    fail('capture-source-only requires --paper-name, --provenance, and question source input')
  }
  if (sources.length > 0 && imageSources.length > 0) {
    fail('One source-only capture cannot mix whole-document and image page input')
  }
  if ([...sources, ...imageSources].some((input) => input.role !== 'question_source')) {
    fail('capture-source-only accepts question_source input only')
  }
  const directory = nck1SourceOnlyDirectory(sourceSetId)
  if (existsSync(directory)) {
    failCode(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      `Source-only directory already exists: ${sourceSetId}`,
    )
  }
  return withPaperWriterLock({ paperDir: directory, paperId: sourceSetId }, () => {
    try {
      const environment = runImportEnvironmentPreflight()
      const documents = captureSourceDocuments({
        targetDirectory: directory,
        sources,
        imageSources,
      })
      const capture = makeNck1SourceOnlyCapture({
        sourceSetId,
        provenance: { paperName, source: provenance },
        documents,
        environmentDigest: environment.environmentDigest,
      })
      writeNck1SourceOnlyCapture(directory, capture)
      console.log(JSON.stringify({
        ok: true,
        sourceSetId,
        state: capture.state,
        reasonCode: capture.reasonCode,
        questionSetDigest: capture.questionSetDigest,
        captureDigest: capture.captureDigest,
        capturePath: path.relative(root, path.join(directory, 'capture.json')),
      }, null, 2))
      return capture
    } catch (error) {
      rmSync(directory, { recursive: true, force: true })
      throw error
    }
  })
}

function questionInputsFromSourceOnly(context) {
  const primaryDocuments = context.capture.documents.filter((document) =>
    document.role === 'question_source' && !document.renditionOf)
  const imageDocuments = primaryDocuments.filter((document) =>
    document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE)
  if (imageDocuments.length > 0 && imageDocuments.length !== primaryDocuments.length) {
    fail('Source-only capture has mixed question carriers that the current router cannot complete')
  }
  if (imageDocuments.length > 0) {
    return {
      sources: [],
      imageSources: imageDocuments.map((document, index) => ({
        role: 'question_source',
        index,
        pages: document.pages.map((page) => ({
          role: 'question_source',
          page: page.page,
          sourcePath: path.join(context.directory, page.path),
          index: page.page - 1,
        })),
      })),
    }
  }
  return {
    sources: primaryDocuments.map((document, index) => ({
      role: 'question_source',
      sourcePath: path.join(context.directory, document.path),
      index,
    })),
    imageSources: [],
  }
}

function attachAnswers() {
  const sourceSetId = process.argv[3]
  const paperId = process.argv[4]
  const expectedQuestionSetDigest = value('--question-set-digest')
  const answerProvenance = value('--answer-provenance')
  const answerSources = values('--source').map(parseSource)
  const answerImageSources = groupedSourcePages(values('--source-page').map(parseSourcePage))
  if (!validPaperId(paperId)) fail('attach-answers requires a new valid paperId')
  if (!expectedQuestionSetDigest || !answerProvenance) {
    fail('attach-answers requires --question-set-digest and --answer-provenance')
  }
  if (answerSources.length === 0 && answerImageSources.length === 0) {
    fail('attach-answers requires an authoritative answer --source or --source-page')
  }
  if ([...answerSources, ...answerImageSources].some((input) =>
    input.role !== 'official_answers')) {
    fail('attach-answers accepts official_answers input only')
  }
  if (!nck1SourceOnlyExists(sourceSetId)) {
    failCode(
      NCK1_AUTHORITATIVE_ANSWERS_AWAITED,
      `Source-only capture is missing: ${sourceSetId}`,
    )
  }
  const directory = nck1SourceOnlyDirectory(sourceSetId)
  return withPaperWriterLock({ paperDir: directory, paperId: sourceSetId }, () => {
    const context = readNck1SourceOnlyCapture(sourceSetId)
    if (context.successor) {
      failCode(
        NCK1_ANSWER_ATTACHMENT_DUPLICATE,
        `Authoritative answers were already attached to ${sourceSetId}`,
      )
    }
    if (expectedQuestionSetDigest !== context.capture.questionSetDigest) {
      failCode(
        NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
        'The answer attachment does not name the immutable questionSetDigest',
      )
    }
    const questionInputs = questionInputsFromSourceOnly(context)
    if (
      (questionInputs.sources.length > 0 && answerImageSources.length > 0)
      || (questionInputs.imageSources.length > 0 && answerSources.length > 0)
    ) {
      fail('The current complete-source router cannot mix document and image carriers')
    }
    const sources = [
      ...questionInputs.sources,
      ...answerSources,
    ].map((source, index) => ({ ...source, index }))
    const imageSources = [
      ...questionInputs.imageSources,
      ...answerImageSources,
    ].map((source, index) => ({ ...source, index }))
    const completeProvenance = `${context.capture.provenance.source}; authoritative answers: ${answerProvenance}`
    const initialized = runPaperCommand(paperId, () => initializeCompleteSourceSet({
      paperId,
      paperName: context.capture.provenance.paperName,
      provenance: completeProvenance,
      year: Number(value('--year')),
      month: Number(value('--month')),
      sources,
      imageSources,
    }))
    const completeQuestionSetDigest = nck1QuestionSetDigest(initialized.manifest.documents)
    if (completeQuestionSetDigest !== context.capture.questionSetDigest) {
      rmSync(initialized.paperDir, { recursive: true, force: true })
      failCode(
        NCK1_ANSWER_ATTACHMENT_QUESTION_MISMATCH,
        'The complete source set did not preserve the captured question identity',
      )
    }
    const manifestBytes = readFileSync(
      path.join(initialized.paperDir, 'universal-source-manifest.json'),
    )
    const answerDocuments = initialized.manifest.documents.filter((document) =>
      document.role === 'official_answers' && !document.renditionOf)
    const successor = writeNck1SourceOnlySuccessor({
      context,
      paperId,
      completeManifestSha256: sha256(manifestBytes),
      answerProvenance,
      answerDocuments,
    })
    console.log(JSON.stringify({
      ok: true,
      sourceSetId,
      questionSetDigest: context.capture.questionSetDigest,
      successor: successor.completeSourceSet,
      state: 'complete_source_set_created',
    }, null, 2))
  })
}

function sourceOnlyStatus() {
  const sourceSetId = process.argv[3]
  const context = readNck1SourceOnlyCapture(sourceSetId)
  console.log(JSON.stringify({
    ...context.capture,
    lifecycleState: context.successor
      ? 'complete_source_set_created'
      : context.capture.state,
    successor: context.successor,
  }, null, 2))
}

function listSourceOnly() {
  console.log(JSON.stringify({
    sourceOnly: listNck1SourceOnlyCaptures(),
  }, null, 2))
}

function paperContext(paperId) {
  const paperDir = path.join(papersRoot, paperId)
  const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
  if (!existsSync(manifestPath)) fail(`Universal source manifest is missing: ${paperId}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return { paperDir, manifest }
}

function capturedDocuments(paperDir, manifest) {
  return manifest.documents.map((document) => {
    const sourcePath = path.join(paperDir, document.path)
    if (!existsSync(sourcePath)) fail(`Captured source is missing: ${document.documentId}`)
    const bytes = new Uint8Array(readFileSync(sourcePath))
    if (bytes.byteLength !== document.byteLength || sha256(bytes) !== document.sha256) {
      fail(`Captured source digest mismatch: ${document.documentId}`)
    }
    const captured = { ...document, bytes }
    if (document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) {
      assertNck1ImageBundlePageArtifacts(captured, (document.pages || []).map((page) => {
        const pagePath = path.join(paperDir, page.path)
        if (!existsSync(pagePath)) fail(`Captured source page is missing: ${document.documentId}:${page.page}`)
        return { ...page, bytes: new Uint8Array(readFileSync(pagePath)) }
      }))
    }
    return captured
  })
}

function jsonSidecar(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing: ${filePath}`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON: ${filePath}`)
  }
}

function writeImmutableSidecar(targetPath, value, label) {
  if (existsSync(targetPath)) {
    const existing = jsonSidecar(targetPath, label)
    if (JSON.stringify(existing) === JSON.stringify(value)) return 'unchanged'
    fail(`Existing ${label} is immutable; stage a new Source Capture instead of overwriting it`)
  }
  writeFileSync(targetPath, `${JSON.stringify(value, null, 2)}\n`)
  return 'written'
}

function stageOcr(paperId) {
  const inputPath = path.resolve(process.argv[4] || '')
  const { paperDir, manifest } = paperContext(paperId)
  const documents = capturedDocuments(paperDir, manifest)
  const evidence = jsonSidecar(inputPath, 'OCR evidence')
  const issues = validateNck1OcrSourceEvidence({
    paperId,
    documents,
    evidence,
    includeReviewFindings: true,
  })
  const blocking = issues.filter((item) => !NCK1_OCR_REVIEW_CODES.includes(item.code))
  if (blocking.length > 0) {
    fail(`${blocking[0].code}: ${blocking[0].message}`)
  }
  const state = writeImmutableSidecar(
    path.join(paperDir, 'materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
    evidence,
    'OCR evidence',
  )
  console.log(JSON.stringify({
    ok: true,
    paperId,
    state,
    evidenceDigest: evidence.evidenceDigest,
    reviewRequired: issues.map((item) => ({
      code: item.code,
      source: item.source,
    })),
  }, null, 2))
}

function confirmOcr(paperId) {
  const inputPath = path.resolve(process.argv[4] || '')
  const { paperDir, manifest } = paperContext(paperId)
  const documents = capturedDocuments(paperDir, manifest)
  const evidence = jsonSidecar(
    path.join(paperDir, 'materialization', NCK1_OCR_EVIDENCE_FILE_NAME),
    'staged OCR evidence',
  )
  const confirmation = jsonSidecar(inputPath, 'OCR confirmation')
  const resolved = resolveConfirmedNck1OcrEvidence({
    paperId,
    documents,
    evidence,
    confirmation,
  })
  if (resolved.issues.length > 0) {
    fail(`${resolved.issues[0].code}: ${resolved.issues[0].message}`)
  }
  const state = writeImmutableSidecar(
    path.join(paperDir, 'materialization', NCK1_OCR_CONFIRMATION_FILE_NAME),
    confirmation,
    'OCR confirmation',
  )
  console.log(JSON.stringify({
    ok: true,
    paperId,
    state,
    sourceSetDigest: confirmation.sourceSetDigest,
    evidenceDigest: confirmation.evidenceDigest,
    confirmedItems: [...resolved.structures.values()].reduce(
      (count, structure) => count + structure.body.length,
      0,
    ),
  }, null, 2))
}

function loadInput(paperId) {
  const { paperDir } = paperContext(paperId)
  return loadNck1ReviewSource(paperDir).sourceInput
}

function verify(paperId) {
  const input = loadInput(paperId)
  const imported = importCanonicalCandidate(input)
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  const preview = compileNck1MaterializationCandidatePreview(imported.candidate)
  if (!preview.compilation) fail(JSON.stringify(preview.unresolvedIssues))
  const boundaryIssues = validateInlineBlankTextBoundaries(preview.compilation.artifacts.canonicalPaper.questionGroups)
  if (boundaryIssues.length) fail(JSON.stringify(boundaryIssues, null, 2))
  const { paperDir } = paperContext(paperId)
  const config = JSON.parse(readFileSync(path.join(paperDir, 'config.json'), 'utf8'))
  console.log(JSON.stringify({
    ok: true,
    paperId,
    sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest,
    groups: imported.candidate.interpretation.groups.length,
    assertions: imported.candidate.interpretation.assertions.length,
    media: imported.candidate.interpretation.groups.reduce((count, group) =>
      count + group.media.length, 0),
    listening: JSON.parse(new TextDecoder().decode(input.materializationBytes)).listening?.state || 'not_supplied',
    ...(config.importProfile ? { importProfile: config.importProfile } : {}),
  }, null, 2))
}

function preflight(paperId) {
  const paperDir = paperId ? paperContext(paperId).paperDir : null
  const result = runImportEnvironmentPreflight({ paperDir })
  console.log(JSON.stringify({
    ok: true,
    environmentDigest: result.environmentDigest,
    checks: result.checks.map(({ name, executable, launch }) => ({ name, executable, launch })),
    receiptPath: result.receiptPath,
  }, null, 2))
}

function materialize(paperId) {
  const { paperDir, manifest } = paperContext(paperId)
  runImportEnvironmentPreflight({ paperDir })
  const result = runNck1MaterializationJobUnlocked({ paperDir, manifest })
  console.log(JSON.stringify({
    ok: true,
    paperId,
    cached: result.cached,
    outputState: result.outputState,
    disposition: result.disposition,
    sourceDigest: result.sourceDigest,
    materializationPath: path.relative(root, result.outputPath),
    reviewPath: path.relative(root, result.reviewPath),
  }, null, 2))
}

function stageAudio(paperId) {
  const sourcePath = path.resolve(value('--audio') || '')
  if (process.argv.includes('--signal-only')) {
    const result = stageSignalListeningAudio({ paperDir: paperDirFor(paperId), paperId, sourcePath })
    console.log(JSON.stringify({ ok: true, ...result }, null, 2))
    return
  }
  const result = stageListeningAudio({
    paperDir: paperDirFor(paperId),
    paperId,
    sourcePath,
    asrFixturePath: value('--asr-fixture'),
  })
  console.log(JSON.stringify({
    ok: true,
    state: 'awaiting_agent_content_review',
    ...result,
    asrPath: path.relative(root, path.join(
      paperDirFor(paperId),
      'materialization/listening-audio/asr-v1.json',
    )),
  }, null, 2))
}

function finalizeAudio(paperId) {
  const reviewPath = value('--review')
  if (!reviewPath) fail('finalize-listening-audio requires --review <content-review.json>')
  const result = finalizeListeningAudio({
    paperDir: paperDirFor(paperId),
    paperId,
    reviewPath,
    referencePath: value('--reference'),
  })
  console.log(JSON.stringify({
    ok: true,
    state: result.scope ? 'listening_audio_first_dialogue_matched' : 'listening_audio_verified',
    ...result,
  }, null, 2))
}

function build(paperId) {
  const { paperDir } = paperContext(paperId)
  const imported = importCanonicalCandidate(loadInput(paperId))
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  const outputDir = path.join(paperDir, 'canonical-evidence')
  // A summary rebuild is not authority to delete confirmation or audit evidence.
  // Any retained receipt for an older Candidate remains stale at admission.
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'candidate-summary.json'), `${JSON.stringify({
    paperId,
    sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest,
  }, null, 2)}\n`)
  const confirmationPath = path.join(outputDir, 'teacher-confirmation-v1.json')
  if (!existsSync(confirmationPath)) {
    writeFileSync(confirmationPath, `${JSON.stringify({
      schemaVersion: 'teacher-confirmation-v1',
      candidateDigest: imported.candidate.candidateDigest,
      sourceDigest: imported.candidate.source.sha256,
      confirmed: false,
    }, null, 2)}\n`, { flag: 'wx' })
  }
  console.log(`BUILT CANDIDATE ${paperId}: awaiting external Teacher Confirmation in ${path.relative(root, outputDir)}`)
}

function extractDocxMedia() {
  const sourcePath = path.resolve(process.argv[3] || '')
  const entryName = process.argv[4]
  const outputPath = path.resolve(process.argv[5] || '')
  const density = Number(value('--density') || 0)
  if (!existsSync(sourcePath) || !/^word\/media\/[^/]+$/.test(entryName || '')) {
    fail('extract-docx-media requires <source.docx> <word/media/entry> <output>')
  }
  const bytes = execFileSync('unzip', ['-p', sourcePath, entryName])
  mkdirSync(path.dirname(outputPath), { recursive: true })
  if (density > 0) {
    execFileSync('magick', ['-density', String(density), 'svg:-', 'png32:' + outputPath], { input: bytes })
  } else {
    writeFileSync(outputPath, bytes)
  }
  console.log(`${sha256(readFileSync(outputPath))} ${outputPath}`)
}

function cropPdf() {
  const sourcePath = path.resolve(process.argv[3] || '')
  const page = Number(process.argv[4])
  const region = String(process.argv[5] || '').split(',').map(Number)
  const outputPath = path.resolve(process.argv[6] || '')
  const density = Number(value('--density') || 300)
  if (!existsSync(sourcePath) || !Number.isInteger(page) || page < 1 || region.length !== 4 || region.some((number) => !Number.isFinite(number))) {
    fail('crop-pdf requires <source.pdf> <page> <x,y,width,height> <output.png>')
  }
  const [x, y, width, height] = region
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
    fail('PDF crop region must be normalized inside 0..1')
  }
  const crop = rasterPdfRegion({
    pdfBytes: new Uint8Array(readFileSync(sourcePath)),
    page,
    region: { x, y, width, height },
    density,
  })
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, crop.bytes)
  console.log(`${sha256(readFileSync(outputPath))} ${outputPath}`)
}

const command = process.argv[2]
let paperId = process.argv[3]
try {
  if (command === 'preflight') {
    if (paperId) runPaperCommand(paperId, () => preflight(paperId))
    else preflight(null)
  } else if (command === 'init') {
    runPaperCommand(paperId, initialize)
  } else if (command === 'capture-source-only') {
    captureSourceOnly()
  } else if (command === 'source-only-status') {
    sourceOnlyStatus()
  } else if (command === 'list-source-only') {
    listSourceOnly()
  } else if (command === 'attach-answers') {
    attachAnswers()
  } else if (command === 'stage-listening-audio') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => stageAudio(paperId), { blockOnFailure: true })
  } else if (command === 'finalize-listening-audio') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => finalizeAudio(paperId), { blockOnFailure: true })
  } else if (command === 'materialize') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => materialize(paperId), { blockOnFailure: true })
  } else if (command === 'stage-ocr') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => stageOcr(paperId), { blockOnFailure: true })
  } else if (command === 'confirm-ocr') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => confirmOcr(paperId), { blockOnFailure: true })
  } else if (command === 'verify') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => verify(paperId), { blockOnFailure: true })
  } else if (command === 'build') {
    assertNotNck1SourceOnly(paperId, command)
    runPaperCommand(paperId, () => build(paperId), { blockOnFailure: true })
  } else if (command === 'extract-docx-media') extractDocxMedia()
  else if (command === 'crop-pdf') cropPdf()
  else fail('Usage: universal-nck1.mjs preflight|init|capture-source-only|source-only-status|list-source-only|attach-answers|stage-listening-audio|finalize-listening-audio|stage-ocr|confirm-ocr|materialize|verify|build|extract-docx-media|crop-pdf ...')
} catch (error) {
  console.error(error.code ? `${error.code}: ${error.message}` : error.message)
  process.exitCode = 1
}
