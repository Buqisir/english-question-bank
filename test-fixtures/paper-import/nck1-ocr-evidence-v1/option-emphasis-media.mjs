import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { makeSyntheticNck1OcrFixture } from './fixture.mjs'
import { produceNck1OcrMaterialization } from '../../../server/paper-import/nck1OcrMaterializationProducer.mjs'
import { reviewMediaFileName } from '../../../server/import-review/revisionProjection.mjs'
import { NCK1_OCR_CONFIRMATION_FILE_NAME, NCK1_OCR_EVIDENCE_FILE_NAME } from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { importCanonicalCandidate } from '../../../shared/paper-canonical/compiler.mjs'
import { digestJson } from '../../../shared/paper-canonical/stable.mjs'
import { buildSourceReferences } from '../../../scripts/import-pipeline/ocr-proofread.mjs'
import { SOURCE_REFERENCES_FILE } from '../../../server/paper-import/sourceReferences.mjs'

const encode = value => Buffer.from(JSON.stringify(value))

export async function makeOptionEmphasisMediaFixture() {
  const fixture = await makeSyntheticNck1OcrFixture({ paperId: 'paper-mock-option-emphasis-media' })
  const confirmation = structuredClone(fixture.confirmation)
  confirmation.schemaVersion = 'nck1-ocr-source-confirmation-v3'
  const page = confirmation.documents[0].pages.find(page => page.visualClassifications.length)
  const anchor = page.orderedItems.find(item => /passage/u.test(item.text))
  assert(anchor, 'synthetic source visual needs a passage owner')
  page.visualClassifications[0] = {
    regionId: page.visualClassifications[0].regionId,
    classification: 'content_media', afterItemId: anchor.itemId, itemIds: [],
  }
  const item = confirmation.documents[0].pages.flatMap(page => page.orderedItems)
    .find(item => item.text.startsWith('30. Which choice fits item 30?'))
  const label = /(?:^|\s)B[.．、]\s*/u.exec(item.text)
  const start = label.index + label[0].length
  item.sourceEmphasis = [{ start, end: start + 3, marks: ['underline'] }]
  const produced = produceNck1OcrMaterialization({ paperId: fixture.paperId,
    documents: fixture.sourceDocuments, evidence: fixture.evidence, confirmation })
  assert.deepEqual(produced.review.required, [])
  assert.equal(produced.materialization.media.length, 1)
  const media = produced.materialization.media[0]
  media.presentation = { alignment: 'right', widthRatio: 0.43, spacingBefore: 'compact', spacingAfter: 'none' }
  const input = { kind: 'nck1-source-materialization',
    materializationBytes: encode(produced.materialization),
    documents: fixture.sourceDocuments.map(({ documentId, bytes }) => ({ documentId, bytes })),
    media: produced.mediaFiles,
    ocrSourceBytes: { evidenceBytes: encode(fixture.evidence), confirmationBytes: encode(confirmation) } }
  return { ...fixture, confirmation, produced, input, media, emphasizedText: item.text.slice(start, start + 3) }
}

export function writeOptionEmphasisMediaReviewFixture(rootDir, fixture, materializationBytes) {
  const write = (relativePath, bytes) => {
    const file = path.join(rootDir, relativePath)
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, bytes)
  }
  write('config.json', encode({ paperId: fixture.paperId, sourceType: 'mock',
    listening: 'absent-by-exam-design', provenance: fixture.manifest.provenance }))
  write('universal-source-manifest.json', encode(fixture.manifest))
  write(fixture.manifest.materializationPath, materializationBytes)
  for (const document of fixture.sourceDocuments) write(document.path, document.bytes)
  for (const media of fixture.produced.mediaFiles) {
    const inventory = fixture.produced.materialization.media.find(entry => entry.mediaId === media.mediaId)
    write(path.join(fixture.manifest.mediaDirectory, reviewMediaFileName(inventory)), media.bytes)
  }
  write(path.join('materialization', NCK1_OCR_EVIDENCE_FILE_NAME), fixture.input.ocrSourceBytes.evidenceBytes)
  write(path.join('materialization', NCK1_OCR_CONFIRMATION_FILE_NAME), fixture.input.ocrSourceBytes.confirmationBytes)
  // Review must receive the real samples present in this synthetic answer PDF.
  // Bind to the caller's upgraded materialization, preserving media and marks.
  const materialization = JSON.parse(Buffer.from(materializationBytes).toString('utf8'))
  const imported = importCanonicalCandidate({ ...fixture.input, materializationBytes })
  assert.deepEqual(imported.issues, [])
  const captured = buildSourceReferences(materialization, fixture.evidence, fixture.confirmation,
    { sourceDocuments: fixture.sourceDocuments })
  write(SOURCE_REFERENCES_FILE, encode({
    schemaVersion: captured.schemaVersion || (captured.structuredScoring ? 'source-references-v2' : 'source-references-v1'),
    producerVersion: captured.producerVersion, paperId: fixture.paperId,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest,
    materializationDigest: digestJson(materialization), groups: captured.groups,
  }))
}
