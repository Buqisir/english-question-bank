#!/usr/bin/env node

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
  importCanonicalCandidate,
} from '../../shared/paper-canonical/compiler.mjs'
import {
  sha256,
} from '../../shared/paper-canonical/stable.mjs'

const root = path.resolve(import.meta.dirname, '../..')
const papersRoot = path.join(import.meta.dirname, 'papers')
const docxMediaType =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

function fail(message) {
  throw new Error(message)
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

function initialize() {
  const paperId = process.argv[3]
  const paperName = value('--paper-name')
  const provenance = value('--provenance')
  const sources = values('--source').map(parseSource)
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(paperId || '')) {
    fail('init requires a valid paperId')
  }
  if (!paperName || !provenance || sources.length === 0) {
    fail('init requires --paper-name, --provenance, and at least one --source role=/absolute/path')
  }
  if (!sources.some((item) => ['official_answers', 'question_and_answers'].includes(item.role))) {
    fail('Authoritative answers are required; AI-generated answers are forbidden')
  }
  if (!sources.some((item) => ['question_source', 'question_and_answers'].includes(item.role))) {
    fail('One complete question source is required')
  }
  const paperDir = path.join(papersRoot, paperId)
  const configPath = path.join(paperDir, 'config.json')
  if (existsSync(configPath)) fail(`Paper already has a writer/config: ${paperId}`)
  const sourceDir = path.join(paperDir, 'source')
  const renditionDir = path.join(sourceDir, 'renditions')
  mkdirSync(renditionDir, { recursive: true })
  const documents = []
  for (const source of sources) {
    const mediaType = mediaTypeFor(source.sourcePath)
    const extension = mediaType === 'application/pdf' ? 'pdf' : 'docx'
    const documentId = `${source.role.replaceAll('_', '-')}-${source.index + 1}`
    const relativePath = path.posix.join('source', `${documentId}.${extension}`)
    const targetPath = path.join(paperDir, relativePath)
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
      const renditionPath = path.join(paperDir, renditionRelativePath)
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
  const manifest = {
    schemaVersion: 'universal-nck1-source-manifest-v1',
    paperId,
    profileId: 'nck1',
    provenance: { paperName, source: provenance },
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
    provenance: { paperName, source: provenance },
    universalSourceManifestPath: 'universal-source-manifest.json',
    canonicalRequestPath: manifest.canonicalRequestPath,
  }, null, 2)}\n`)
  console.log(`INITIALIZED ${paperId}: ${path.relative(root, paperDir)}`)
}

function paperContext(paperId) {
  const paperDir = path.join(papersRoot, paperId)
  const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
  if (!existsSync(manifestPath)) fail(`Universal source manifest is missing: ${paperId}`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  return { paperDir, manifest }
}

function mediaFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media.mimeType]
  if (!extension) fail(`Unsupported Canonical content media type: ${media.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}.${extension}`
}

function loadInput(paperId) {
  const { paperDir, manifest } = paperContext(paperId)
  const materializationPath = path.join(paperDir, manifest.materializationPath)
  if (!existsSync(materializationPath)) fail(`Source Materialization is missing: ${materializationPath}`)
  const materializationBytes = new Uint8Array(readFileSync(materializationPath))
  const materialization = JSON.parse(new TextDecoder().decode(materializationBytes))
  const documentPathById = new Map(manifest.documents.map((document) => [
    document.documentId,
    path.join(paperDir, document.path),
  ]))
  return {
    kind: 'nck1-source-materialization',
    materializationBytes,
    documents: materialization.documents.map((document) => {
      const sourcePath = documentPathById.get(document.documentId)
      if (!sourcePath || !existsSync(sourcePath)) fail(`Materialized document is unavailable: ${document.documentId}`)
      return { documentId: document.documentId, bytes: new Uint8Array(readFileSync(sourcePath)) }
    }),
    media: materialization.media.map((media) => {
      const mediaPath = path.join(paperDir, manifest.mediaDirectory, mediaFileName(media))
      if (!existsSync(mediaPath)) fail(`Materialized media is unavailable: ${media.mediaId}`)
      return { mediaId: media.mediaId, bytes: new Uint8Array(readFileSync(mediaPath)) }
    }),
  }
}

function verify(paperId) {
  const imported = importCanonicalCandidate(loadInput(paperId))
  if (!imported.candidate || imported.issues.length > 0) {
    const issue = imported.issues[0]
    fail(`${issue?.code || 'MATERIALIZATION_INVALID'}: ${issue?.message || 'Candidate derivation failed'}`)
  }
  console.log(JSON.stringify({
    ok: true,
    paperId,
    sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest,
    groups: imported.candidate.interpretation.groups.length,
    assertions: imported.candidate.interpretation.assertions.length,
    media: imported.candidate.interpretation.groups.reduce((count, group) =>
      count + group.media.length, 0),
    listening: imported.candidate.interpretation.inactiveSourceClosures.length === 2
      ? 'captured'
      : 'not_supplied',
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
  rmSync(outputDir, { recursive: true, force: true })
  mkdirSync(outputDir, { recursive: true })
  writeFileSync(path.join(outputDir, 'candidate-summary.json'), `${JSON.stringify({
    paperId,
    sourceDigest: imported.candidate.source.sha256,
    candidateDigest: imported.candidate.candidateDigest,
  }, null, 2)}\n`)
  writeFileSync(path.join(outputDir, 'teacher-confirmation-v1.json'), `${JSON.stringify({
    schemaVersion: 'teacher-confirmation-v1',
    candidateDigest: imported.candidate.candidateDigest,
    sourceDigest: imported.candidate.source.sha256,
    confirmed: false,
  }, null, 2)}\n`)
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
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-pdf-crop-'))
  try {
    const prefix = path.join(temp, 'page')
    execFileSync('pdftoppm', ['-f', String(page), '-l', String(page), '-singlefile', '-r', String(density), '-png', sourcePath, prefix])
    const pagePath = `${prefix}.png`
    const dimensions = execFileSync('magick', ['identify', '-format', '%w,%h', pagePath], { encoding: 'utf8' }).split(',').map(Number)
    const geometry = `${Math.round(width * dimensions[0])}x${Math.round(height * dimensions[1])}+${Math.round(x * dimensions[0])}+${Math.round(y * dimensions[1])}`
    mkdirSync(path.dirname(outputPath), { recursive: true })
    execFileSync('magick', [pagePath, '-crop', geometry, '+repage', `png32:${outputPath}`])
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
  console.log(`${sha256(readFileSync(outputPath))} ${outputPath}`)
}

const command = process.argv[2]
let paperId = process.argv[3]
try {
  if (command === 'init') initialize()
  else if (command === 'verify') verify(paperId)
  else if (command === 'build') build(paperId)
  else if (command === 'extract-docx-media') extractDocxMedia()
  else if (command === 'crop-pdf') cropPdf()
  else fail('Usage: universal-nck1.mjs init|verify|build|extract-docx-media|crop-pdf ...')
} catch (error) {
  if (['verify', 'build'].includes(command) && paperId) {
    const signalsDir = path.join(papersRoot, paperId, 'signals')
    mkdirSync(signalsDir, { recursive: true })
    writeFileSync(path.join(signalsDir, 'blocked.json'), `${JSON.stringify({
      code: 'source_incomplete',
      at: new Date().toISOString(),
      note: String(error.message).slice(0, 240),
    }, null, 2)}\n`)
  }
  console.error(error.message)
  process.exitCode = 1
}
