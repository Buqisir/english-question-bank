import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

import {
  NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
  nck1DocxProducerSourceDigest,
  produceNck1DocxMaterialization,
} from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

const REVIEW_NAME = 'nck1-docx-materialization-review-v1.json'
const RECEIPT_NAME = 'nck1-docx-materialization-producer-receipt-v1.json'

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

export function runNck1DocxMaterializationJob({ paperDir, manifest }) {
  if (manifest?.schemaVersion !== 'universal-nck1-source-manifest-v1') {
    throw new Error('NCK1 DOCX materialization requires a universal Source Manifest')
  }
  const documents = loadDocuments(paperDir, manifest)
  const sourceDigest = nck1DocxProducerSourceDigest(documents)
  const outputPath = path.join(paperDir, manifest.materializationPath)
  const receiptPath = path.join(path.dirname(outputPath), RECEIPT_NAME)
  const reviewPath = path.join(path.dirname(outputPath), REVIEW_NAME)
  if (existsSync(receiptPath) && existsSync(outputPath)) {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
    if (
      receipt.schemaVersion === 'nck1-docx-materialization-producer-receipt-v1'
      && receipt.producerVersion === NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION
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
  }
  if (existsSync(outputPath) || existsSync(reviewPath) || existsSync(receiptPath)) {
    throw new Error('Existing materialization artifacts are not bound to this source and producer; refusing to overwrite them')
  }
  const produced = produceNck1DocxMaterialization({
    paperId: manifest.paperId,
    documents,
  })
  atomicJson(outputPath, produced.materialization)
  atomicJson(reviewPath, produced.review)
  const outputDigest = sha256(readFileSync(outputPath))
  atomicJson(receiptPath, {
    schemaVersion: 'nck1-docx-materialization-producer-receipt-v1',
    paperId: manifest.paperId,
    producerVersion: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION,
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
