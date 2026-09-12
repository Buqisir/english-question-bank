import { execFile } from 'node:child_process'
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import { DatabaseSync } from 'node:sqlite'

import { sha256, stableStringify } from '../../shared/paper-canonical/stable.mjs'
import {
  NCK1_LISTENING_STAGED_ANALYSIS,
  NCK1_STAGED_ANALYSIS_FILES,
} from '../import-review/nck1AnalysisProjection.mjs'
import {
  buildNck1ReviewProjection,
  loadNck1ReviewSource,
  resolveReviewFile,
} from '../import-review/revisionProjection.mjs'
import { loadAnalyzedPackageFiles } from './analyzedPackage.mjs'
import { readAnalyzedPackageArchive } from '../source-intake/analyzedPackageArchive.mjs'

const execute = promisify(execFile)
const archiveCli = path.resolve(import.meta.dirname, '../../scripts/import-pipeline/analyzed-package-archive.py')
const encoder = new TextEncoder()

function fail(location, message, code = 'ANALYZED_PACKAGE_EXPORT_INVALID') {
  const error = new Error(`${location}: ${message}`)
  error.path = location
  error.code = code
  throw error
}

function jsonBytes(value) {
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`)
}

function readJsonBytes(bytes, location) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch {
    fail(location, 'Expected UTF-8 JSON')
  }
}

function assertSealedRevision({ dbPath, filesRoot, revisionId, expectedPaperId }) {
  if (!/^rev-[a-f0-9-]{36}$/u.test(revisionId || '')) {
    fail('revisionId', 'An exact Review revision ID is required', 'IMPORT_REVIEW_REVISION_INVALID')
  }
  const db = new DatabaseSync(dbPath, { readOnly: true })
  let row
  let files
  try {
    row = db.prepare('SELECT * FROM import_review_revisions WHERE id = ?').get(revisionId)
    files = db.prepare(`
      SELECT path, sha256, byte_length AS byteLength
      FROM import_review_files WHERE revision_id = ? ORDER BY path
    `).all(revisionId)
  } finally { db.close() }
  if (!row) fail('revisionId', 'Review revision was not found', 'IMPORT_REVIEW_NOT_FOUND')
  if (row.paper_id !== expectedPaperId) {
    fail('revisionId', `Revision belongs to ${row.paper_id}, not ${expectedPaperId}`, 'ANALYZED_PACKAGE_PAPER_ID_MISMATCH')
  }
  if (row.state === 'uploading' || !row.finalized_at) {
    fail('revisionId', 'Revision is not finalized and immutable', 'IMPORT_REVIEW_REVISION_NOT_FINALIZED')
  }
  const rootDir = path.join(filesRoot, revisionId)
  for (const descriptor of files) {
    const filePath = resolveReviewFile(rootDir, descriptor.path, `sealed file ${descriptor.path}`)
    if (!existsSync(filePath) || !lstatSync(filePath).isFile()) {
      fail(descriptor.path, 'Sealed revision file is missing', 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH')
    }
    const bytes = new Uint8Array(readFileSync(filePath))
    if (bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) {
      fail(descriptor.path, 'Sealed revision file changed', 'IMPORT_REVIEW_FILE_DIGEST_MISMATCH')
    }
  }
  const projection = buildNck1ReviewProjection(rootDir, { requireAnalyses: true })
  const manifest = JSON.parse(row.manifest_json)
  for (const [actual, expected, label] of [
    [projection.sourceDigest, row.source_digest, 'sourceDigest'],
    [projection.candidateDigest, row.candidate_digest, 'candidateDigest'],
    [projection.visibleStructureDigest, row.visible_structure_digest, 'visibleStructureDigest'],
    [projection.analysisDigest, manifest.analysisDigest, 'analysisDigest'],
  ]) {
    if (actual !== expected) fail(label, 'Sealed projection identity changed', 'IMPORT_REVIEW_PROJECTION_MISMATCH')
  }
  return { rootDir, projection }
}

function nativePackage(loaded) {
  const original = loaded.sourceInput.members.find(({ memberId }) => memberId === 'package-manifest')
  if (!original) fail('analyzed-package/members', 'Native package lacks its original package manifest')
  const manifest = readJsonBytes(original.bytes, 'package-manifest')
  const byId = new Map(loaded.sourceInput.members.map((member) => [member.memberId, member]))
  const output = new Map([['package.json', original.bytes]])
  for (const [index, descriptor] of manifest.files.entries()) {
    const member = byId.get(descriptor.memberId)
    if (!member) fail(`package.json/files/${index}/memberId`, 'Native package member is missing')
    output.set(descriptor.path, member.bytes)
  }
  return output
}

function pointerEscape(value) {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}

function packageLocators(value, pointer = '') {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    value.forEach((item, index) => packageLocators(item, `${pointer}/${index}`))
    return
  }
  for (const [key, child] of Object.entries(value)) {
    if (['page_region', 'docx_part'].includes(child?.kind)) {
      value[key] = { kind: 'package_json_pointer', documentId: 'content', pointer }
    } else packageLocators(child, `${pointer}/${pointerEscape(key)}`)
  }
}

export function convertRepresentableNck1ReviewSourceToAnalyzedPackageFiles(
  rootDir,
  loaded,
  { includeOriginalAttachments = false } = {},
) {
  if (!Number.isInteger(Number(loaded.config.provenance?.year))) {
    fail('config.json/provenance/year', 'Raw Review cannot be faithfully converted without an integer year', 'ANALYZED_PACKAGE_EXPORT_UNSUPPORTED')
  }
  for (const field of ['paperName', 'region', 'sourceType']) {
    if (typeof loaded.config.provenance?.[field] !== 'string' || !loaded.config.provenance[field].trim()) {
      fail(`config.json/provenance/${field}`, 'Raw Review cannot be faithfully converted without this source declaration', 'ANALYZED_PACKAGE_EXPORT_UNSUPPORTED')
    }
  }
  const content = structuredClone(loaded.materialization)
  delete content.documents
  delete content.sourceCoverage
  content.schemaVersion = 'nck1-analyzed-package-content-v1'
  if (content.listening.state === 'not_supplied') {
    content.listening.evidence = { kind: 'package_declares_no_listening_content', documentId: 'content' }
  }
  packageLocators(content)
  const officialAnswers = {
    answers: content.answers.map(({ questionId, canonicalNumber, value }) => ({ questionId, canonicalNumber, value })),
    ...(content.listening.state === 'captured' ? {
      listeningAnswers: content.listening.answers.map(({ questionId, canonicalNumber, value }) => ({ questionId, canonicalNumber, value })),
    } : {}),
  }
  content.answers.forEach((answer, index) => {
    answer.authority = { kind: 'package_json_pointer', documentId: 'official-answers', pointer: `/answers/${index}` }
  })
  if (content.listening.state === 'captured') content.listening.answers.forEach((answer, index) => {
    answer.authority = { kind: 'package_json_pointer', documentId: 'official-answers', pointer: `/listeningAnswers/${index}` }
  })

  const output = new Map()
  const files = [
    { memberId: 'content', path: 'content.json', role: 'content', mediaType: 'application/json' },
    { memberId: 'official-answers', path: 'official-answers.json', role: 'official_answers', mediaType: 'application/json' },
  ]
  output.set('content.json', jsonBytes(content))
  output.set('official-answers.json', jsonBytes(officialAnswers))
  for (const descriptor of NCK1_STAGED_ANALYSIS_FILES) {
    const memberId = `analysis-${descriptor.key}`
    files.push({ memberId, path: descriptor.path, role: 'analysis', mediaType: 'application/json', analysisKey: descriptor.key })
    output.set(descriptor.path, new Uint8Array(readFileSync(resolveReviewFile(rootDir, descriptor.path))))
  }
  if (content.listening.state === 'captured') {
    files.push({ memberId: 'analysis-listening', path: NCK1_LISTENING_STAGED_ANALYSIS.path, role: 'analysis', mediaType: 'application/json', analysisKey: 'listening-unit' })
    output.set(NCK1_LISTENING_STAGED_ANALYSIS.path, new Uint8Array(readFileSync(resolveReviewFile(rootDir, NCK1_LISTENING_STAGED_ANALYSIS.path))))
    const attachment = loaded.manifest.attachments?.find(({ role }) => role === 'listening_audio_playback')
      || loaded.manifest.attachments?.find(({ role }) => role === 'listening_audio_original')
    if (!attachment) fail('listening', 'Captured listening has no sealed playable MP3')
    files.push({ memberId: 'listening-audio', path: 'resources/listening.mp3', role: 'audio', mediaType: 'audio/mpeg' })
    output.set('resources/listening.mp3', new Uint8Array(readFileSync(resolveReviewFile(rootDir, attachment.path))))
  }
  const sourceMedia = new Map((loaded.sourceInput.media || []).map((media) => [media.mediaId, media]))
  content.media.forEach((media, index) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(media.mimeType)) {
      fail(`content.media/${index}/mimeType`, `Cannot faithfully package source media type ${media.mimeType}`, 'ANALYZED_PACKAGE_EXPORT_UNSUPPORTED')
    }
    const source = sourceMedia.get(media.mediaId)
    if (!source?.bytes || sha256(source.bytes) !== media.sha256) {
      fail(`content.media/${index}/extraction`, 'Cannot resolve the exact source media bytes', 'ANALYZED_PACKAGE_EXPORT_UNSUPPORTED')
    }
    const memberId = `media-${index + 1}`
    const extension = media.mimeType === 'image/jpeg' ? 'jpg' : media.mimeType.split('/')[1]
    const resourcePath = `resources/${memberId}.${extension}`
    media.extraction = { kind: 'package_member', memberId }
    files.push({ memberId, path: resourcePath, role: 'media', mediaType: media.mimeType })
    output.set(resourcePath, source.bytes)
  })
  // media extraction was normalized after the initial serialization.
  output.set('content.json', jsonBytes(content))

  if (includeOriginalAttachments) {
    for (const [index, document] of loaded.manifest.documents.entries()) {
      if (!['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(document.mediaType)) continue
      const extension = document.mediaType === 'application/pdf' ? 'pdf' : 'docx'
      const memberId = `original-${index + 1}`
      const attachmentPath = `originals/${memberId}.${extension}`
      files.push({ memberId, path: attachmentPath, role: 'attachment', mediaType: document.mediaType })
      output.set(attachmentPath, new Uint8Array(readFileSync(resolveReviewFile(rootDir, document.path))))
    }
  }
  output.set('package.json', jsonBytes({
    schemaVersion: 'eqb-analyzed-package-v1',
    paperId: content.paperId,
    profileId: 'nck1',
    paperName: loaded.config.provenance.paperName,
    metadata: {
      year: Number(loaded.config.provenance.year),
      region: loaded.config.provenance.region,
      sourceType: loaded.config.provenance.sourceType,
    },
    sources: [{
      sourceId: 'question-transcription', role: 'question_source', memberId: 'content',
      description: 'EQB normalized external transcription from the sealed Review revision; package pointers do not claim replay of raw OCR, crops, or DOCX extraction.',
      suppliedBy: 'EQB analyzed-package exporter',
    }, {
      sourceId: 'official-answer-transcription', role: 'official_answers', memberId: 'official-answers',
      description: 'EQB normalized official-answer transcription from the sealed Review revision; authenticity remains subject to Owner Review.',
      suppliedBy: 'EQB analyzed-package exporter',
    }],
    files,
  }))
  return output
}

function writeDirectory(destination, files) {
  // Exclusive creation is the ownership latch, including against concurrent exporters.
  // Keep it outside cleanup: a failed mkdir never grants ownership of the target.
  mkdirSync(destination)
  try {
    for (const [relativePath, bytes] of files) {
      const filePath = resolveReviewFile(destination, relativePath, 'Export member')
      mkdirSync(path.dirname(filePath), { recursive: true })
      writeFileSync(filePath, bytes, { flag: 'wx' })
    }
  } catch (error) {
    rmSync(destination, { recursive: true, force: true })
    throw error
  }
}

export async function exportAnalyzedPackageRevision({
  dbPath, filesRoot, revisionId, expectedPaperId, destination,
  includeOriginalAttachments = false,
}) {
  if (!dbPath || !filesRoot || !destination || !expectedPaperId) fail('$', 'dbPath, filesRoot, revisionId, expectedPaperId, and destination are required')
  const sealed = assertSealedRevision({ dbPath, filesRoot, revisionId, expectedPaperId })
  const loaded = loadNck1ReviewSource(sealed.rootDir)
  const files = loaded.analyzedPackage
    ? nativePackage(loaded)
    : convertRepresentableNck1ReviewSourceToAnalyzedPackageFiles(
        sealed.rootDir,
        loaded,
        { includeOriginalAttachments },
      )
  mkdirSync(path.dirname(destination), { recursive: true })
  if (existsSync(destination)) fail('destination', 'Destination already exists')
  const temporary = mkdtempSync(path.join(path.dirname(destination), '.analyzed-package-export-'))
  const scratch = path.join(temporary, 'content')
  try {
    writeDirectory(scratch, files)
    loadAnalyzedPackageFiles(scratch, { expectedPaperId })
    if (destination.endsWith('.zip')) {
      const archivePath = path.join(temporary, 'package.zip')
      await execute('python3', ['-B', archiveCli, '--create-from', scratch, archivePath], { timeout: 60_000 })
      const archive = await readAnalyzedPackageArchive(archivePath)
      // Atomic no-overwrite installation; never remove a caller-owned target.
      linkSync(archivePath, destination)
      return { revisionId, paperId: expectedPaperId, conversionVersion: 'analyzed-package-export-v1', format: 'zip', files: archive.files }
    }
    // Directory output is populated only after validation, under an exclusive
    // mkdir latch. Unlike rename, it cannot replace a concurrently created directory.
    writeDirectory(destination, files)
    return { revisionId, paperId: expectedPaperId, conversionVersion: 'analyzed-package-export-v1', format: 'directory', files: [...files.keys()] }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}

function versionNeutral(value, versions, location = '$') {
  if (Array.isArray(value)) return value.map((item, index) => versionNeutral(item, versions, `${location}/${index}`))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => {
    if (key === 'sourceAssetVersion') {
      versions.push({ path: `${location}/${key}`, value: child })
      return [key, '<internal-source-asset-version>']
    }
    return [key, versionNeutral(child, versions, `${location}/${pointerEscape(key)}`)]
  }))
}

export function analyzedPackageSemanticSnapshot(loaded) {
  const versions = []
  const manifestById = new Map(loaded.manifest.files.map((file) => [file.memberId, file]))
  const members = loaded.members.map((member) => {
    const descriptor = manifestById.get(member.memberId)
    if (member.mediaType === 'application/json') {
      return {
        identity: descriptor?.analysisKey || member.role,
        role: member.role,
        value: versionNeutral(readJsonBytes(member.bytes, member.memberId), versions, `members/${descriptor?.analysisKey || member.memberId}`),
      }
    }
    return { identity: descriptor?.analysisKey || member.memberId, role: member.role, sha256: sha256(member.bytes), byteLength: member.bytes.byteLength }
  }).sort((a, b) => a.identity.localeCompare(b.identity))
  return {
    semantic: {
      paperId: loaded.manifest.paperId,
      profileId: loaded.manifest.profileId,
      paperName: loaded.manifest.paperName,
      metadata: structuredClone(loaded.manifest.metadata),
      sources: structuredClone(loaded.manifest.sources),
      members,
    },
    sourceAssetVersions: versions,
  }
}

export function compareAnalyzedPackageSemantics(left, right) {
  const a = analyzedPackageSemanticSnapshot(left)
  const b = analyzedPackageSemanticSnapshot(right)
  return {
    equal: stableStringify(a.semantic) === stableStringify(b.semantic),
    contentDifference: stableStringify(a.semantic) === stableStringify(b.semantic) ? null : { left: a.semantic, right: b.semantic },
    sourceAssetVersionDifferences: stableStringify(a.sourceAssetVersions) === stableStringify(b.sourceAssetVersions)
      ? [] : { left: a.sourceAssetVersions, right: b.sourceAssetVersions },
  }
}
