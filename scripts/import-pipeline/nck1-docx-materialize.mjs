import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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
  nck1OcrProducerVersion,
  produceNck1OcrMaterialization,
} from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import {
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3,
  NCK1_OCR_CONFIRMATION_FILE_NAME,
  NCK1_OCR_EVIDENCE_FILE_NAME,
} from '../../server/paper-import/nck1OcrSourceEvidence.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  assertNck1ImageBundlePageArtifacts,
} from '../../server/paper-import/nck1ImageSourceBundle.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { restoreOcrSourcePresentation } from './materialization-presentation.mjs'

const WRITER_LOCK_NAME = '.universal-nck1-writer.lock'
export const NCK1_MATERIALIZATION_BINDING_MISMATCH = 'NCK1_MATERIALIZATION_BINDING_MISMATCH'
export const NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE =
  'Existing materialization artifacts are not bound to this source and producer; refusing to overwrite them'

const DOCX_PRODUCER = Object.freeze({
  version: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
  historicalVersions: ['nck1-docx-materialization-producer-v9', 'nck1-docx-materialization-producer-v11', 'nck1-docx-materialization-producer-v12', 'nck1-docx-materialization-producer-v13', 'nck1-docx-materialization-producer-v14', 'nck1-docx-materialization-producer-v15', 'nck1-docx-materialization-producer-v16', 'nck1-docx-materialization-producer-v17', 'nck1-docx-materialization-producer-v18', 'nck1-docx-materialization-producer-v19', 'nck1-docx-materialization-producer-v20', 'nck1-docx-materialization-producer-v21'],
  sourceDigest: nck1DocxProducerSourceDigest,
  produce: produceNck1DocxMaterialization,
  reviewName: 'nck1-docx-materialization-review-v1.json',
  receiptName: 'nck1-docx-materialization-producer-receipt-v1.json',
  receiptSchemaVersion: 'nck1-docx-materialization-producer-receipt-v1',
})

const PDF_PRODUCER = Object.freeze({
  version: NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION,
  historicalVersions: ['nck1-pdf-materialization-producer-v6', 'nck1-pdf-materialization-producer-v8', 'nck1-pdf-materialization-producer-v9', 'nck1-pdf-materialization-producer-v10', 'nck1-pdf-materialization-producer-v11', 'nck1-pdf-materialization-producer-v12', 'nck1-pdf-materialization-producer-v13', 'nck1-pdf-materialization-producer-v14', 'nck1-pdf-materialization-producer-v15', 'nck1-pdf-materialization-producer-v16', 'nck1-pdf-materialization-producer-v17', 'nck1-pdf-materialization-producer-v18'],
  sourceDigest: nck1PdfProducerSourceDigest,
  produce: produceNck1PdfMaterialization,
  reviewName: 'nck1-pdf-materialization-review-v1.json',
  receiptName: 'nck1-pdf-materialization-producer-receipt-v1.json',
  receiptSchemaVersion: 'nck1-pdf-materialization-producer-receipt-v1',
})

const OCR_PRODUCER = Object.freeze({
  version: NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION,
  historicalVersions: ['nck1-ocr-materialization-producer-v6', 'nck1-ocr-materialization-producer-v7', 'nck1-ocr-materialization-producer-v9', 'nck1-ocr-materialization-producer-v11', 'nck1-ocr-materialization-producer-v13', 'nck1-ocr-materialization-producer-v15', 'nck1-ocr-materialization-producer-v17', 'nck1-ocr-materialization-producer-v19', 'nck1-ocr-materialization-producer-v21', 'nck1-ocr-materialization-producer-v23', 'nck1-ocr-materialization-producer-v25', 'nck1-ocr-materialization-producer-v27'],
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
    const paperId = path.basename(paperDir)
    const rolesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..',
      'imports', 'ocr-proofread', paperId, 'source-reference-roles.json')
    const roleFile = existsSync(rolesPath) ? JSON.parse(readFileSync(rolesPath, 'utf8')) : null
    return {
      evidence: existsSync(evidencePath)
        ? JSON.parse(readFileSync(evidencePath, 'utf8'))
        : null,
      confirmation: existsSync(confirmationPath)
        ? JSON.parse(readFileSync(confirmationPath, 'utf8'))
        : null,
      writingRoleDeclarations: roleFile ? (roleFile.entries ?? roleFile) : null,
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
    'universal-nck1-source-manifest-v3',
  ].includes(manifest?.schemaVersion)) throw new Error('NCK1 materialization requires a universal Source Manifest')
  const documents = loadDocuments(paperDir, manifest)
  const producer = selectProducer(paperDir, documents)
  const producerInputs = producer.loadInputs?.(paperDir) || {}
  const producerVersion = producer === OCR_PRODUCER ? nck1OcrProducerVersion(producerInputs.confirmation) : producer.version
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
  // Read retained provenance; this does not authorize old output as a current cache.
  const sourceDigest = producer.sourceDigest(documents, { ...producerInputs, producerVersion: receipt.producerVersion })
  // Confirmation v3 has a separate lineage; v6/v7 never attested its visuals.
  const historicalVersions = producer === OCR_PRODUCER
    && producerInputs.confirmation?.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3
    ? ['nck1-ocr-materialization-producer-v8', 'nck1-ocr-materialization-producer-v10', 'nck1-ocr-materialization-producer-v12', 'nck1-ocr-materialization-producer-v14', 'nck1-ocr-materialization-producer-v16', 'nck1-ocr-materialization-producer-v18', 'nck1-ocr-materialization-producer-v20', 'nck1-ocr-materialization-producer-v22', 'nck1-ocr-materialization-producer-v24', 'nck1-ocr-materialization-producer-v26', 'nck1-ocr-materialization-producer-v28', 'nck1-ocr-materialization-producer-v29'] : producer.historicalVersions
  const acceptedVersions = [producerVersion, ...historicalVersions]
  if (receipt.schemaVersion !== producer.receiptSchemaVersion
    || !acceptedVersions.includes(receipt.producerVersion)
    || receipt.paperId !== manifest.paperId
    || receipt.sourceDigest !== sourceDigest
    || review.schemaVersion !== producer.reviewName.replace('.json', '')
    || review.paperId !== manifest.paperId
    || review.sourceDigest !== sourceDigest
    || review.producerVersion !== receipt.producerVersion
    || !Array.isArray(review.required)) {
    throw new Error('Materialization producer evidence is not bound to the current source and producer')
  }
  const listeningPartition = review.listeningSourcePartition
  const partitionDigest = receipt.listeningSourcePartitionDigest
  // Retained receipts keep the requirements of their own producer version.
  const requiresPartition = receipt.producerVersion === producerVersion || [
    'nck1-docx-materialization-producer-v13',
    'nck1-docx-materialization-producer-v14',
    'nck1-docx-materialization-producer-v15',
    'nck1-docx-materialization-producer-v16',
    'nck1-docx-materialization-producer-v17',
    'nck1-docx-materialization-producer-v18',
    'nck1-docx-materialization-producer-v19',
    'nck1-docx-materialization-producer-v20',
    'nck1-docx-materialization-producer-v21',
    'nck1-pdf-materialization-producer-v10',
    'nck1-pdf-materialization-producer-v11',
    'nck1-pdf-materialization-producer-v12',
    'nck1-pdf-materialization-producer-v13',
    'nck1-pdf-materialization-producer-v14',
    'nck1-pdf-materialization-producer-v15',
    'nck1-pdf-materialization-producer-v16',
    'nck1-pdf-materialization-producer-v17',
    'nck1-pdf-materialization-producer-v18',
    'nck1-ocr-materialization-producer-v11',
    'nck1-ocr-materialization-producer-v12',
    'nck1-ocr-materialization-producer-v13',
    'nck1-ocr-materialization-producer-v14',
    'nck1-ocr-materialization-producer-v15',
    'nck1-ocr-materialization-producer-v16',
    'nck1-ocr-materialization-producer-v17',
    'nck1-ocr-materialization-producer-v19',
    'nck1-ocr-materialization-producer-v18',
    'nck1-ocr-materialization-producer-v20',
    'nck1-ocr-materialization-producer-v21',
    'nck1-ocr-materialization-producer-v22',
    'nck1-ocr-materialization-producer-v23',
    'nck1-ocr-materialization-producer-v24',
    'nck1-ocr-materialization-producer-v25',
    'nck1-ocr-materialization-producer-v26',
    'nck1-ocr-materialization-producer-v27',
    'nck1-ocr-materialization-producer-v28',
    'nck1-ocr-materialization-producer-v29',
  ].includes(receipt.producerVersion)
  if ((requiresPartition && !partitionDigest)
    || (partitionDigest && (!listeningPartition
      || digestJson(listeningPartition) !== partitionDigest
      || listeningPartition.schemaVersion !== 'nck1-listening-source-partition-v1'
      || listeningPartition.paperId !== manifest.paperId
      || listeningPartition.producerVersion !== receipt.producerVersion
      || listeningPartition.producerSourceDigest !== receipt.sourceDigest
      || listeningPartition.originalMaterializationOutputDigest !== receipt.outputDigest))) {
    throw new Error('Materialization listening partition does not match its receipt digest and source')
  }
  assertReceiptMediaFiles(paperDir, receipt)
  const outputBytes = readFileSync(outputPath)
  const outputDigest = sha256(outputBytes)
  const materialization = JSON.parse(outputBytes.toString('utf8'))
  if (!Array.isArray(materialization.issues)
    || (outputDigest === receipt.outputDigest
      && digestJson(review.required) !== digestJson(materialization.issues))) {
    throw new Error('Materialization review does not bind the current issues')
  }
  const outputMediaDigests = (materialization.media || []).map((item) => item.sha256).sort()
  const receiptMediaDigests = (receipt.mediaFiles || []).map((file) => file.sha256).sort()
  if (digestJson(outputMediaDigests) !== digestJson(receiptMediaDigests)) {
    throw new Error('Materialization receipt media does not close the output inventory')
  }
  return {
    disposition: receipt.disposition,
    producerVersion: receipt.producerVersion,
    producerState: receipt.producerVersion === producerVersion ? 'current' : 'historical',
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
    'universal-nck1-source-manifest-v3',
  ].includes(manifest?.schemaVersion)) {
    throw new Error('NCK1 materialization requires a universal Source Manifest')
  }
  const documents = loadDocuments(paperDir, manifest)
  const producer = selectProducer(paperDir, documents)
  const producerInputs = producer.loadInputs?.(paperDir) || {}
  const producerVersion = producer === OCR_PRODUCER ? nck1OcrProducerVersion(producerInputs.confirmation) : producer.version
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
      && receipt.producerVersion === producerVersion
      && receipt.paperId === manifest.paperId
      && receipt.sourceDigest === sourceDigest
    ) {
      if (!existsSync(reviewPath)) {
        throw new Error('Digest-bound producer review is missing; refusing to overwrite the existing materialization')
      }
      const inspected = inspectNck1Materialization({ paperDir, manifest })
      let outputState = inspected.outputState
      if (producer === OCR_PRODUCER && inspected.disposition === 'ready_for_verification') {
        const materialization = JSON.parse(readFileSync(outputPath, 'utf8'))
        if (materialization.listening?.state === 'captured') {
          const restored = restoreOcrSourcePresentation({ materialization, ...producerInputs })
          if (digestJson(restored) !== digestJson(materialization)) {
            atomicJson(outputPath, restored)
            outputState = 'agent_modified'
          }
        }
      }
      return {
        cached: true,
        disposition: inspected.disposition,
        outputState,
        sourceDigest,
        outputPath,
        reviewPath,
        receiptPath,
      }
    }
    if (
      producer.allowSourceInputRevision
      && receipt.schemaVersion === producer.receiptSchemaVersion
      && receipt.producerVersion === producerVersion
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
    const error = new Error(NCK1_MATERIALIZATION_BINDING_MISMATCH_MESSAGE)
    error.code = NCK1_MATERIALIZATION_BINDING_MISMATCH
    throw error
  }
  const produced = producer.produce({
    paperId: manifest.paperId,
    documents,
    ...producerInputs,
  })
  // The raw producer stays receipt-bound. This local post-pass closes presentation before
  // a ready OCR materialization leaves this job; independent presentation runs are idempotent.
  const presented = producer === OCR_PRODUCER && produced.disposition === 'ready_for_verification'
    && produced.materialization.listening?.state === 'captured'
    ? restoreOcrSourcePresentation({ materialization: produced.materialization, ...producerInputs })
    : produced.materialization
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
    producerVersion,
    sourceDigest,
    outputDigest,
    disposition: produced.disposition,
    listeningSourcePartitionDigest: digestJson(produced.review.listeningSourcePartition),
    mediaFiles,
  })
  const presentationChanged = digestJson(presented) !== digestJson(produced.materialization)
  if (presentationChanged) atomicJson(outputPath, presented)
  return {
    cached: false,
    disposition: produced.disposition,
    outputState: presentationChanged ? 'agent_modified' : 'producer_output_written',
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
