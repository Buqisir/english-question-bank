import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { sourceBlocks } from './agentPassage.mjs'

const OCR_EVIDENCE = 'nck1-ocr-source-evidence-v1'
const IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'))
}

function readEvidence(versionDir, descriptor) {
  if (!/^source-evidence\/[a-z0-9._-]+\.bin$/i.test(descriptor?.relativePath ?? '')) return null
  const bytes = readFileSync(path.join(versionDir, descriptor.relativePath))
  return bytes.length === descriptor.byteLength && sha256(bytes) === descriptor.sha256 ? bytes : null
}

function isOcrEvidence(descriptor) {
  // Source Capture's compiler keys document IDs by the original bytes, roles
  // and input key. Resolve this descriptor without opening the embedded PDFs.
  const commitment = digestJson({ digest: descriptor.sha256, roles: ['source_provenance'], inputKey: 'ocr_source_evidence' })
  return descriptor.documentId === `document:${commitment.slice('sha256:'.length).slice(0, 28)}`
}

export function publishedAgentSource(versionDir, publicationDigest) {
  const dir = path.join(versionDir, 'canonical')
  try {
    const manifests = readdirSync(dir).filter(name => /^canonical-paper-publication-v\d+\.json$/.test(name))
    const manifest = manifests.map(name => readJson(path.join(dir, name)))
      .find(({ publicationDigest: digest, ...value }) => digest === publicationDigest && digestJson(value) === digest)
    if (!manifest) return {}
    const bytes = readFileSync(path.join(dir, 'source-asset.bin'))
    if (sha256(bytes) !== manifest.sourceAssetDigest) return {}
    const materialization = JSON.parse(bytes)
    if (!materialization.schemaVersion?.startsWith('nck1-source-materialization-v')) return {}
    return {
      materialization,
      media: materialization.media,
      readMedia(item) {
        const descriptor = manifest.sourceEvidence?.find(entry => entry.sha256 === item.sha256)
        return readEvidence(versionDir, descriptor)
      },
      readAnswerOcr() {
        const bytes = readEvidence(versionDir, manifest.sourceEvidence?.find(isOcrEvidence))
        return bytes ? JSON.parse(bytes) : null
      },
    }
  } catch {
    return {}
  }
}

function referencesMedia(materialization, mediaId) {
  return materialization?.groups?.some(group =>
    Array.from(sourceBlocks(group.blocks)).some(block => block.kind === 'figure' && block.mediaId === mediaId)
    || group.questions?.some(question => question.options?.some(option => option.figure?.mediaId === mediaId)))
}

export function agentMedia(source, mediaId) {
  if (!referencesMedia(source.materialization, mediaId)) return null
  const item = source.media?.find(item => item.mediaId === mediaId)
  if (!item || !IMAGE_MIME_TYPES.has(item.mimeType)) return null
  try {
    const bytes = item.encodedBytes ? Buffer.from(item.encodedBytes, 'base64') : source.readMedia?.(item)
    if (!bytes?.length || sha256(bytes) !== item.sha256) return null
    return { bytes, mimeType: item.mimeType, etag: `"${item.sha256}"` }
  } catch {
    return null
  }
}

export function agentAnswerSource(source) {
  const entries = []
  try {
    const { materialization } = source
    const ocr = source.readAnswerOcr?.()
    if (ocr?.schemaVersion !== OCR_EVIDENCE || ocr.paperId !== materialization?.paperId) return { notice: 'none' }
    for (const doc of ocr.documents) {
      const role = materialization.documents.find(item => item.documentId === doc.documentId)?.role
      if (role !== 'official_answers' && role !== 'question_and_answers') continue
      const authorities = [...materialization.answers, ...(materialization.listening?.answers || [])]
        .map(answer => answer.authority).filter(locator => locator?.documentId === doc.documentId && locator.kind === 'page_region')
        .sort((a, b) => a.page - b.page || a.region.y - b.region.y)
      const start = authorities[0]
      for (const { page, observations } of doc.pages) {
        for (const { text, region } of observations) {
          if (!text || !region) continue
          if (role === 'question_and_answers' && (!start || page < start.page
            || (page === start.page && region.y + region.height <= start.region.y))) continue
          entries.push({ documentId: doc.documentId, page, region, text })
        }
      }
    }
  } catch {
    return { notice: 'none' }
  }
  return entries.length ? { entries } : { notice: 'none' }
}
