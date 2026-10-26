import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { inspectNck1Materialization, runNck1MaterializationJob } from './nck1-docx-materialize.mjs'
import { nck1DocxProducerSourceDigest, NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION } from '../../server/paper-import/nck1DocxMaterializationProducer.mjs'
import { nck1PdfProducerSourceDigest, NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION } from '../../server/paper-import/nck1PdfMaterializationProducer.mjs'
import { nck1OcrProducerSourceDigest, nck1OcrProducerVersion } from '../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { makeSyntheticNck1DocxFixture } from '../../test-fixtures/paper-import/nck1-docx-materialization-v1/fixture.mjs'
import { productPdfBytes } from '../../test-fixtures/paper-import/frozen-products-v1/fixture.mjs'

const docx = makeSyntheticNck1DocxFixture({ transformXml: xml => xml
  .replace('第一节：应用文（满分15分）', '第一节：作答示例')
  .replace('第二节：读后续写（满分25分）', '第二节：作答示例') })
const pdfDocuments = ['question_source', 'official_answers'].map((role, index) => {
  const bytes = productPdfBytes(1, `Synthetic retained ${role}`)
  return { documentId: `source-${index + 1}`, role, mediaType: 'application/pdf',
    pageCount: 1, byteLength: bytes.length, sha256: sha256(bytes), path: `source-${index + 1}.pdf`, bytes }
})
const variants = [
  { name: 'DOCX', carrier: 'docx', oldVersion: 'nck1-docx-materialization-producer-v20',
    version: NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION, digest: nck1DocxProducerSourceDigest },
  { name: 'PDF', carrier: 'pdf', oldVersion: 'nck1-pdf-materialization-producer-v17',
    version: NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION, digest: nck1PdfProducerSourceDigest },
  ...[1, 2, 3].map(confirmationVersion => ({
    name: `OCR confirmation v${confirmationVersion}`, carrier: 'ocr',
    oldVersion: `nck1-ocr-materialization-producer-v${confirmationVersion === 3 ? 26 : 25}`,
    confirmation: { schemaVersion: `nck1-ocr-source-confirmation-v${confirmationVersion}` },
    version: nck1OcrProducerVersion({ schemaVersion: `nck1-ocr-source-confirmation-v${confirmationVersion}` }),
    digest: nck1OcrProducerSourceDigest,
  })),
]
// The immediately preceding identities must remain inspectable, but may not
// return stale contaminated transcripts as current producer cache hits.
variants.push(
  { ...variants[0], name: 'DOCX previous v21', oldVersion: 'nck1-docx-materialization-producer-v21' },
  { ...variants[1], name: 'PDF previous v18', oldVersion: 'nck1-pdf-materialization-producer-v18' },
  ...[1, 2, 3].map(confirmationVersion => ({
    ...variants[confirmationVersion + 1], name: `OCR previous confirmation v${confirmationVersion}`,
    oldVersion: `nck1-ocr-materialization-producer-v${confirmationVersion === 3 ? 28 : 27}`,
  })),
  { ...variants[4], name: 'OCR previous page-top v29', oldVersion: 'nck1-ocr-materialization-producer-v29' },
)

function sourceWindow(root, variant) {
  const documents = variant.carrier === 'docx' ? docx.sourceDocuments : pdfDocuments
  const manifest = variant.carrier === 'docx' ? docx.manifest : {
    schemaVersion: 'universal-nck1-source-manifest-v1', paperId: 'paper-synthetic-retained-receipt',
    materializationPath: 'materialization/nck1-source-materialization-v1.json',
    documents: documents.map(({ bytes: _bytes, ...record }) => record),
  }
  mkdirSync(path.join(root, 'materialization'), { recursive: true })
  for (const document of documents) {
    const target = path.join(root, manifest.documents.find(item => item.documentId === document.documentId).path)
    mkdirSync(path.dirname(target), { recursive: true })
    writeFileSync(target, document.bytes)
  }
  // Receipt inspection reads retained provenance, without replaying OCR or
  // raster admission. Minimal inputs isolate producer identity/cache behavior.
  const inputs = variant.carrier === 'ocr'
    ? { evidence: { evidenceDigest: `sha256:${'a'.repeat(64)}` }, confirmation: variant.confirmation } : {}
  for (const [name, value] of Object.entries(inputs)) writeFileSync(
    path.join(root, `materialization/nck1-ocr-source-${name}-v1.json`), JSON.stringify(value))
  return { paperDir: root, manifest, documents, inputs }
}

for (const variant of variants) test(`${variant.name} retains old receipts without current cache hits or evidence writes`, () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-producer-version-'))
  try {
    const job = sourceWindow(root, variant)
    const producerVersion = variant.oldVersion
    const sourceDigest = variant.digest(job.documents, { ...job.inputs, producerVersion })
    const prefix = `nck1-${variant.carrier}-materialization`
    const outputPath = path.join(root, job.manifest.materializationPath)
    const receiptPath = path.join(root, `materialization/${prefix}-producer-receipt-v1.json`)
    const reviewPath = path.join(root, `materialization/${prefix}-review-v1.json`)
    for (const disposition of ['needs_agent_review', 'ready_for_verification']) {
      const required = disposition === 'needs_agent_review'
        ? [{ code: 'NCK1_ANSWER_WRITING_SAMPLE_BOUNDARY_AMBIGUOUS', path: 'answers.writingSamples',
            message: 'Synthetic retained sample boundary issue', source: null }] : []
      const output = JSON.stringify({ issues: required, media: [] })
      const outputDigest = sha256(Buffer.from(output))
      const partition = { schemaVersion: 'nck1-listening-source-partition-v1', paperId: job.manifest.paperId,
        producerVersion, producerSourceDigest: sourceDigest, originalMaterializationOutputDigest: outputDigest }
      const receipt = { schemaVersion: `${prefix}-producer-receipt-v1`, paperId: job.manifest.paperId,
        producerVersion, sourceDigest, outputDigest, disposition, mediaFiles: [],
        listeningSourcePartitionDigest: digestJson(partition) }
      const review = { schemaVersion: `${prefix}-review-v1`, paperId: job.manifest.paperId,
        producerVersion, sourceDigest, required, listeningSourcePartition: partition }
      const paths = [outputPath, receiptPath, reviewPath]
      const artifacts = [output, JSON.stringify(receipt), JSON.stringify(review)]
      artifacts.forEach((bytes, i) => writeFileSync(paths[i], bytes))
      const retained = paths.map(file => readFileSync(file))
      const inspected = inspectNck1Materialization(job)
      assert.equal(inspected.producerState, 'historical')
      assert.equal(inspected.disposition, disposition)
      assert.equal(inspected.outputState, 'producer_output_unchanged')
      assert.equal(inspected.sourceDigest, sourceDigest)
      assert.notEqual(variant.version, producerVersion)
      assert.notEqual(variant.digest(job.documents, job.inputs), sourceDigest)
      assert.throws(() => runNck1MaterializationJob(job), /refusing to overwrite/)
      paths.forEach((file, index) => assert.deepEqual(readFileSync(file), retained[index]))
      if (variant.carrier === 'ocr') {
        const otherVersion = variant.confirmation.schemaVersion.endsWith('-v3')
          ? 'nck1-ocr-materialization-producer-v27' : 'nck1-ocr-materialization-producer-v28'
        const otherDigest = variant.digest(job.documents, { ...job.inputs, producerVersion: otherVersion })
        const otherPartition = { ...partition, producerVersion: otherVersion, producerSourceDigest: otherDigest }
        writeFileSync(receiptPath, JSON.stringify({ ...receipt, producerVersion: otherVersion,
          sourceDigest: otherDigest, listeningSourcePartitionDigest: digestJson(otherPartition) }))
        writeFileSync(reviewPath, JSON.stringify({ ...review, producerVersion: otherVersion,
          sourceDigest: otherDigest, listeningSourcePartition: otherPartition }))
        assert.throws(() => inspectNck1Materialization(job), /not bound/,
          'matching digests do not let the other OCR lineage attest this confirmation')
      }
      // Versions that originally required a partition must keep that guard
      // after becoming historical, even if both optional fields disappear.
      delete receipt.listeningSourcePartitionDigest
      delete review.listeningSourcePartition
      writeFileSync(receiptPath, JSON.stringify(receipt))
      writeFileSync(reviewPath, JSON.stringify(review))
      assert.throws(() => inspectNck1Materialization(job), /listening partition/)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a fresh DOCX output window uses the new producer and repaired sample boundaries', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'eqb-current-producer-'))
  try {
    const job = sourceWindow(root, variants[0])
    const produced = runNck1MaterializationJob(job)
    assert.equal(produced.cached, false)
    assert.equal(produced.disposition, 'ready_for_verification')
    const output = JSON.parse(readFileSync(produced.outputPath))
    const writing = output.groups.filter(group => group.writingTask)
    assert.equal(writing.length, 2)
    assert(writing.every(group => group.writingTask.officialModelAnswer?.length > 0))
    assert.equal(inspectNck1Materialization(job).producerState, 'current')
    assert.equal(inspectNck1Materialization(job).producerVersion, NCK1_DOCX_MATERIALIZATION_PRODUCER_VERSION)
    assert.equal(runNck1MaterializationJob(job).cached, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
