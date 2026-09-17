import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
  nck1DocxProducerSourceDigest,
  produceNck1DocxMaterialization,
} from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import {
  NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION,
  nck1PdfProducerSourceDigest,
  produceNck1PdfMaterialization,
} from '../../server/paper-import/nck1PdfMaterializationProducer.mjs'
import {
  NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION,
  nck1OcrProducerSourceDigest,
  produceNck1OcrMaterialization,
} from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import {
  NCK1_OCR_CONFIRMATION_FILE_NAME,
  NCK1_OCR_EVIDENCE_FILE_NAME,
} from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
} from '../../server/paper-import/nck1ImageSourceBundle.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

const WRITER_LOCK_NAME = '.universal-nck1-writer.lock'

const DOCX_PRODUCER = Object.freeze({
  version: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
  sourceDigest: nck1DocxProducerSourceDigest,
  produce: produceNck1DocxMaterialization,
  reviewName: 'nck1-docx-materialization-review-v1.json',
  receiptName: 'nck1-docx-materialization-producer-receipt-v1.json',
  receiptSchemaVersion: 'nck1-docx-materialization-producer-receipt-v1',
})

const PDF_PRODUCER = Object.freeze({
  version: NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION,
  sourceDigest: nck1PdfProducerSourceDigest,
  produce: produceNck1PdfMaterialization,
  reviewName: 'nck1-pdf-materialization-review-v1.json',
  receiptName: 'nck1-pdf-materialization-producer-receipt-v1.json',
  receiptSchemaVersion: 'nck1-pdf-materialization-producer-receipt-v1',
})

const OCR_PRODUCER = Object.freeze({
  version: NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION,
  sourceDigest: nck1OcrProducerSourceDigest,
  produce: produceNck1OcrMaterialization,
  reviewName: 'nck1-ocr-materialization-review-v1.json',
  receiptName: 'nck1-ocr-materialization-producer-receipt-v1.json',
  receiptSchemaVersion: 'nck1-ocr-materialization-producer-receipt-v1',
  allowSourceInputRevision: true,
  loadInputs(paperDir) {
    const directory = path.join(paperDir, 'materialization')
    const evidencePath = path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME)
    const confirmationPath = path.join(directory, NCK1_OCR_CONFIRMATION_FILE_NAME)
    return {
      evidence: existsSync(evidencePath)
        ? JSON.parse(readFileSync(evidencePath, 'utf8'))
        : null,
      confirmation: existsSync(confirmationPath)
        ? JSON.parse(readFileSync(confirmationPath, 'utf8'))
        : null,
    }
  },
})

export function paperWriterLockPath(paperDir) {
  return path.join(paperDir, WRITER_LOCK_NAME)
}

export function withPaperWriterLock({ paperDir, paperId }, operation) {
  mkdirSync(paperDir, { recursive: true })
  const writerLock = paperWriterLockPath(paperDir)
  try {
    mkdirSync(writerLock)
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Universal NCK1 import already has a writer: ${paperId || paperDir}`)
    }
    throw error
  }
  try {
    return operation()
  } finally {
    rmSync(writerLock, { recursive: true, force: true })
  }
}

function atomicJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, filePath)
}

function atomicBytes(filePath, bytes) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  writeFileSync(temporary, bytes)
  renameSync(temporary, filePath)
}

function producerMediaFileName(media) {
  const extension = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
  })[media?.mimeType]
  if (!extension) throw new Error(`Unsupported producer media type: ${media?.mimeType}`)
  return `${media.mediaId.replaceAll(':', '__')}.${extension}`
}

function assertReceiptMediaFiles(paperDir, receipt) {
  for (const file of receipt.mediaFiles || []) {
    const filePath = path.join(paperDir, file.path)
    if (
      !existsSync(filePath)
      || sha256(readFileSync(filePath)) !== file.sha256
      || readFileSync(filePath).byteLength !== file.byteLength
    ) throw new Error(`Digest-bound producer media is missing or changed: ${file.path}`)
  }
}

function loadDocuments(paperDir, manifest) {
  return manifest.documents.map((document) => {
    const filePath = path.join(paperDir, document.path)
    if (!existsSync(filePath)) throw new Error(`Captured source is missing: ${document.documentId}`)
    const bytes = new Uint8Array(readFileSync(filePath))
    if (bytes.byteLength !== document.byteLength || sha256(bytes) !== document.sha256) {
      throw new Error(`Captured source digest mismatch: ${document.documentId}; create a new Source Capture`)
    }
    const captured = { ...document, bytes }
    if (document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) {
      assertNck1ImageBundlePageArtifacts(captured, (document.pages || []).map((page) => {
        const pagePath = path.join(paperDir, page.path)
        if (!existsSync(pagePath)) {
          throw new Error(`Captured source page is missing: ${document.documentId}:${page.page}`)
        }
        return { ...page, bytes: new Uint8Array(readFileSync(pagePath)) }
      }))
    }
    return captured
  })
}

function selectProducer(paperDir, documents) {
  const allPdf = documents.length > 0
    && documents.every((document) => document.mediaType === 'application/pdf')
  const sourceDocuments = documents.filter((document) => !document.renditionOf)
  const allImageBundles = sourceDocuments.length > 0
    && sourceDocuments.every((document) =>
      document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE)
    && documents.filter((document) => document.renditionOf).every((document) =>
      document.mediaType === 'application/pdf')
  if (allImageBundles) return OCR_PRODUCER
  if (!allPdf) return DOCX_PRODUCER
  return existsSync(path.join(
    paperDir,
    'materialization',
    NCK1_OCR_EVIDENCE_FILE_NAME,
  )) ? OCR_PRODUCER : PDF_PRODUCER
}

// Read-only counterpart of the cache branch below. Status callers must use the
// same producer selection and evidence contract without invoking a producer.
export function inspectNck1Materialization({ paperDir, manifest }) {
  if (![
    'universal-nck1-source-manifest-v1',
    'universal-nck1-source-manifest-v2',
  ].includes(manifest?.schemaVersion)) throw new Error('NCK1 materialization requires a universal Source Manifest')
  const documents = loadDocuments(paperDir, manifest)
  const producer = selectProducer(paperDir, documents)
  const producerInputs = producer.loadInputs?.(paperDir) || {}
  const sourceDigest = producer.sourceDigest(documents, producerInputs)
  const outputPath = path.join(paperDir, manifest.materializationPath)
  const directory = path.dirname(outputPath)
  const receiptPath = path.join(directory, producer.receiptName)
  const reviewPath = path.join(directory, producer.reviewName)
  const existing = [outputPath, receiptPath, reviewPath].map(existsSync)
  if (!existing.some(Boolean)) return null
  if (!existing.every(Boolean)) {
    throw new Error('Partial materialization evidence exists; inspect it before running a producer')
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
  if (receipt.schemaVersion !== producer.receiptSchemaVersion
    || receipt.producerVersion !== producer.version
    || receipt.paperId !== manifest.paperId
    || receipt.sourceDigest !== sourceDigest
    || review.schemaVersion !== producer.reviewName.replace('.json', '')
    || review.paperId !== manifest.paperId
    || review.sourceDigest !== sourceDigest
    || review.producerVersion !== producer.version
    || !Array.isArray(review.required)) {
    throw new Error('Materialization producer evidence is not bound to the current source and producer')
  }
  assertReceiptMediaFiles(paperDir, receipt)
  const materialization = JSON.parse(readFileSync(outputPath, 'utf8'))
  if (!Array.isArray(materialization.issues)
    || digestJson(review.required) !== digestJson(materialization.issues)) {
    throw new Error('Materialization review does not bind the current issues')
  }
  const outputMediaDigests = (materialization.media || []).map((item) => item.sha256).sort()
  const receiptMediaDigests = (receipt.mediaFiles || []).map((file) => file.sha256).sort()
  if (digestJson(outputMediaDigests) !== digestJson(receiptMediaDigests)) {
    throw new Error('Materialization receipt media does not close the output inventory')
  }
  const outputDigest = sha256(readFileSync(outputPath))
  return {
    disposition: receipt.disposition,
    outputDigest: receipt.outputDigest,
    outputState: outputDigest === receipt.outputDigest ? 'producer_output_unchanged' : 'agent_modified',
    sourceDigest,
  }
}

function preserveFailedPdfForOcr(manifest, documents, outputPath) {
  const directory = path.dirname(outputPath)
  const receiptPath = path.join(directory, PDF_PRODUCER.receiptName)
  const reviewPath = path.join(directory, PDF_PRODUCER.reviewName)
  if (!existsSync(outputPath) || !existsSync(receiptPath) || !existsSync(reviewPath)) return
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  const review = JSON.parse(readFileSync(reviewPath, 'utf8'))
  const expectedDigest = digestJson({
    producerVersion: receipt.producerVersion,
    documents: documents.map(({ documentId, sha256, byteLength }) => ({ documentId, sha256, byteLength })),
  })
  if (receipt.schemaVersion !== PDF_PRODUCER.receiptSchemaVersion
    || !/^nck1-pdf-materialization-producer-v\d+$/u.test(receipt.producerVersion)
    || receipt.paperId !== manifest.paperId
    || receipt.sourceDigest !== expectedDigest
    || receipt.disposition !== 'needs_agent_review'
    || receipt.mediaFiles?.length !== 0
    || sha256(readFileSync(outputPath)) !== receipt.outputDigest
    || review.sourceDigest !== receipt.sourceDigest
    || review.producerVersion !== receipt.producerVersion
    || review.schemaVersion !== 'nck1-pdf-materialization-review-v1'
    || review.paperId !== manifest.paperId
    || !Array.isArray(review.required) || review.required.length === 0
    || digestJson(review.required) !== digestJson(JSON.parse(readFileSync(outputPath, 'utf8')).issues)) return
  // Preserve all old evidence before retiring only the untouched, failed output.
  // On interruption the original remains, or OCR can restart from the archive;
  // old PDF receipts/reviews are never deleted or forged to unlock a retry.
  const archive = path.join(directory, 'producer-history', receipt.outputDigest.replace('sha256:', ''))
  mkdirSync(archive, { recursive: true })
  for (const original of [outputPath, receiptPath, reviewPath]) {
    const saved = path.join(archive, path.basename(original))
    const bytes = readFileSync(original)
    if (existsSync(saved)) {
      if (!readFileSync(saved).equals(bytes)) throw new Error('Producer history differs; refusing to overwrite recovery evidence')
    } else atomicBytes(saved, bytes)
  }
  rmSync(outputPath)
}

export function runNck1MaterializationJobUnlocked({ paperDir, manifest }) {
  if (![
    'universal-nck1-source-manifest-v1',
    'universal-nck1-source-manifest-v2',
  ].includes(manifest?.schemaVersion)) {
    throw new Error('NCK1 materialization requires a universal Source Manifest')
  }
  const documents = loadDocuments(paperDir, manifest)
  const producer = selectProducer(paperDir, documents)
  const producerInputs = producer.loadInputs?.(paperDir) || {}
  const sourceDigest = producer.sourceDigest(documents, producerInputs)
  const outputPath = path.join(paperDir, manifest.materializationPath)
  const receiptPath = path.join(path.dirname(outputPath), producer.receiptName)
  const reviewPath = path.join(path.dirname(outputPath), producer.reviewName)
  if (producer === OCR_PRODUCER && !existsSync(receiptPath) && !existsSync(reviewPath)) {
    preserveFailedPdfForOcr(manifest, documents, outputPath)
  }
  if (existsSync(receiptPath) && existsSync(outputPath)) {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    if (
      receipt.schemaVersion === producer.receiptSchemaVersion
      && receipt.producerVersion === producer.version
      && receipt.paperId === manifest.paperId
      && receipt.sourceDigest === sourceDigest
    ) {
      if (!existsSync(reviewPath)) {
        throw new Error('Digest-bound producer review is missing; refusing to overwrite the existing materialization')
      }
      assertReceiptMediaFiles(paperDir, receipt)
      const currentDigest = sha256(readFileSync(outputPath))
      return {
        cached: true,
        disposition: receipt.disposition,
        outputState: currentDigest === receipt.outputDigest
          ? 'producer_output_unchanged'
          : 'agent_modified',
        sourceDigest,
        outputPath,
        reviewPath,
        receiptPath,
      }
    }
    if (
      producer.allowSourceInputRevision
      && receipt.schemaVersion === producer.receiptSchemaVersion
      && receipt.paperId === manifest.paperId
      && receipt.sourceDigest !== sourceDigest
      && existsSync(reviewPath)
      && sha256(readFileSync(outputPath)) === receipt.outputDigest
    ) {
      assertReceiptMediaFiles(paperDir, receipt)
      for (const file of receipt.mediaFiles || []) {
        rmSync(path.join(paperDir, file.path))
      }
      rmSync(outputPath)
      rmSync(reviewPath)
      rmSync(receiptPath)
    }
  }
  if (existsSync(outputPath) || existsSync(reviewPath) || existsSync(receiptPath)) {
    throw new Error('Existing materialization artifacts are not bound to this source and producer; refusing to overwrite them')
  }
  const produced = producer.produce({
    paperId: manifest.paperId,
    documents,
    ...producerInputs,
  })
  const mediaById = new Map(produced.materialization.media.map((media) => [
    media.mediaId,
    media,
  ]))
  const producedMediaIds = new Set((produced.mediaFiles || []).map((file) => file.mediaId))
  if (
    producedMediaIds.size !== produced.materialization.media.length
    || produced.materialization.media.some((media) => !producedMediaIds.has(media.mediaId))
  ) throw new Error('Producer media files do not close the Materialization media inventory')
  const mediaFiles = (produced.mediaFiles || []).map((file) => {
    const media = mediaById.get(file.mediaId)
    if (!(file.bytes instanceof Uint8Array) || sha256(file.bytes) !== media?.sha256) {
      throw new Error(`Producer media bytes do not match Materialization: ${file.mediaId}`)
    }
    const relativePath = path.posix.join(
      manifest.mediaDirectory,
      producerMediaFileName(media),
    )
    const targetPath = path.join(paperDir, relativePath)
    if (existsSync(targetPath)) {
      throw new Error(`Existing producer media is not receipt-bound: ${relativePath}`)
    }
    atomicBytes(targetPath, file.bytes)
    return {
      path: relativePath,
      sha256: media.sha256,
      byteLength: file.bytes.byteLength,
    }
  })
  atomicJson(outputPath, produced.materialization)
  atomicJson(reviewPath, produced.review)
  const outputDigest = sha256(readFileSync(outputPath))
  atomicJson(receiptPath, {
    schemaVersion: producer.receiptSchemaVersion,
    paperId: manifest.paperId,
    producerVersion: producer.version,
    sourceDigest,
    outputDigest,
    disposition: produced.disposition,
    mediaFiles,
  })
  return {
    cached: false,
    disposition: produced.disposition,
    outputState: 'producer_output_written',
    sourceDigest,
    outputPath,
    reviewPath,
    receiptPath,
  }
}

export function runNck1MaterializationJob({ paperDir, manifest }) {
  return withPaperWriterLock({ paperDir, paperId: manifest?.paperId }, () =>
    runNck1MaterializationJobUnlocked({ paperDir, manifest }))
}

export const runNck1DocxMaterializationJobUnlocked = runNck1MaterializationJobUnlocked
export const runNck1DocxMaterializationJob = runNck1MaterializationJob
