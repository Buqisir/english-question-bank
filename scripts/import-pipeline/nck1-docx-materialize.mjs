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
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

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
  allowReviewResume: true,
  loadInputs(paperDir) {
    const directory = path.join(paperDir, 'materialization')
    const evidencePath = path.join(directory, NCK1_OCR_EVIDENCE_FILE_NAME)
    const confirmationPath = path.join(directory, NCK1_OCR_CONFIRMATION_FILE_NAME)
    return {
      evidence: JSON.parse(readFileSync(evidencePath, 'utf8')),
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

function loadDocuments(paperDir, manifest) {
  return manifest.documents.map((document) => {
    const filePath = path.join(paperDir, document.path)
    if (!existsSync(filePath)) throw new Error(`Captured source is missing: ${document.documentId}`)
    const bytes = new Uint8Array(readFileSync(filePath))
    if (bytes.byteLength !== document.byteLength || sha256(bytes) !== document.sha256) {
      throw new Error(`Captured source digest mismatch: ${document.documentId}; create a new Source Capture`)
    }
    return { ...document, bytes }
  })
}

function selectProducer(paperDir, documents) {
  const allPdf = documents.length > 0
    && documents.every((document) => document.mediaType === 'application/pdf')
  if (!allPdf) return DOCX_PRODUCER
  return existsSync(path.join(
    paperDir,
    'materialization',
    NCK1_OCR_EVIDENCE_FILE_NAME,
  )) ? OCR_PRODUCER : PDF_PRODUCER
}

export function runNck1MaterializationJobUnlocked({ paperDir, manifest }) {
  if (manifest?.schemaVersion !== 'universal-nck1-source-manifest-v1') {
    throw new Error('NCK1 materialization requires a universal Source Manifest')
  }
  const documents = loadDocuments(paperDir, manifest)
  const producer = selectProducer(paperDir, documents)
  const producerInputs = producer.loadInputs?.(paperDir) || {}
  const sourceDigest = producer.sourceDigest(documents, producerInputs)
  const outputPath = path.join(paperDir, manifest.materializationPath)
  const receiptPath = path.join(path.dirname(outputPath), producer.receiptName)
  const reviewPath = path.join(path.dirname(outputPath), producer.reviewName)
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
      producer.allowReviewResume
      && receipt.schemaVersion === producer.receiptSchemaVersion
      && receipt.producerVersion === producer.version
      && receipt.paperId === manifest.paperId
      && receipt.disposition === 'needs_agent_review'
      && existsSync(reviewPath)
      && sha256(readFileSync(outputPath)) === receipt.outputDigest
    ) {
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
