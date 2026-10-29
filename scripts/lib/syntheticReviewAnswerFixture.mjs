import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { prepareSourceReferences, SOURCE_REFERENCES_FILE } from '../../server/paper-import/sourceReferences.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { importNck1ReviewCandidate, loadNck1ReviewSource } from '../../server/import-review/revisionProjection.mjs'
import { buildSourceReferences } from '../import-pipeline/ocr-proofread.mjs'
import { currentReviewAnswerSha } from '../../test-fixtures/paper-import/review-source-references-v26/fixture.mjs'

const ownedReferenceBytes = new Set()

export function removeOwnedReviewReferences(directory) {
  const file = path.join(directory, SOURCE_REFERENCES_FILE)
  if (!existsSync(file) || !ownedReferenceBytes.has(sha256(readFileSync(file)))) return false
  unlinkSync(file)
  return true
}

// Bind directly from import, before the first projection. Rebinding is allowed
// only for exact bytes this helper wrote; custom/tampered sidecars reach normal
// validation unchanged.
export function prebindReviewFixtureReferences(directory, { expectedCandidateDigest } = {}) {
  const file = path.join(directory, SOURCE_REFERENCES_FILE)
  if (existsSync(file) && !ownedReferenceBytes.has(sha256(readFileSync(file)))) return false
  const loaded = loadNck1ReviewSource(directory)
  const imported = importNck1ReviewCandidate(directory, loaded, expectedCandidateDigest)
  if (!imported.candidate || imported.issues.length) throw new Error(`Invalid fixture candidate: ${imported.issues[0]?.code}`)
  const binding = { materialization: loaded.materialization, sourceInput: loaded.sourceInput,
    sourceDigest: imported.candidate.source.sha256, candidateDigest: imported.candidate.candidateDigest }
  const references = syntheticReviewReferences(binding) || prepareSourceReferences(binding)
  const evidence = (loaded.materialization.documents || []).filter(document => document.role === 'official_answers')
    .map(document => ({ documentSha256: document.sha256, locator: { kind: 'page_region',
      documentId: document.documentId, page: 1, region: { x: 0, y: 0, width: 1, height: 1 } } }))
  if (!evidence.length) evidence.push(...(loaded.sourceInput.members || []).filter(member => member.role === 'official_answers')
    .map(member => ({ documentSha256: sha256(member.bytes),
      locator: { kind: 'package_json_pointer', documentId: member.memberId, pointer: '' } })))
  for (const group of references.groups) for (const kind of ['essays', 'scoring']) {
    if (evidence.length && group[kind].state === 'unprocessed') group[kind] = { state: 'not_supplied', evidence, entries: [] }
  }
  mkdirSync(path.dirname(file), { recursive: true })
  const bytes = Buffer.from(JSON.stringify(references))
  writeFileSync(file, bytes)
  ownedReferenceBytes.add(sha256(bytes))
  return true
}

// These invented texts are rendered into the two source pages below. The first
// sample deliberately continues across pages to exercise provenance recovery.
export const syntheticApplicationParts = ['Official application sample', 'from the supplied answer source.']
export const syntheticApplicationSample = syntheticApplicationParts.join(' ')
export const syntheticContinuationSample = 'Official continuation sample from the supplied answer source.'

export function syntheticReviewAnswerPdf() {
  const stream = lines => {
    const body = lines.map((line, i) => `BT /F1 12 Tf 36 ${160 - 24 * i} Td (${line.replace(/[\\()]/g, '\\$&')}) Tj ET`).join('\n') + '\n'
    return `<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}endstream`
  }
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 200] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
    stream([syntheticApplicationParts[0]]),
    stream([syntheticApplicationParts[1], syntheticContinuationSample]),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = objects.map((object, i) => {
    const offset = Buffer.byteLength(pdf)
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  return Buffer.from(`${pdf}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

// Only recognizes this exact invented PDF and its two matching task samples.
// This is fixture data, never an independent review or a production capture.
export function syntheticReviewReferences(projection) {
  const document = projection.materialization.documents?.find(item => item.role === 'official_answers')
  if (document?.sha256 === currentReviewAnswerSha()) {
    const ocr = projection.sourceInput.ocrSourceBytes
    const capture = buildSourceReferences(projection.materialization,
      JSON.parse(Buffer.from(ocr.evidenceBytes)), JSON.parse(Buffer.from(ocr.confirmationBytes)), {
        sourceInput: projection.sourceInput, sourceDocuments: projection.sourceInput.documents,
        sourceDigest: projection.sourceDigest, candidateDigest: projection.candidateDigest,
      })
    return { ...prepareSourceReferences({ ...projection, structuredScoring: capture.structuredScoring }),
      ...(capture.schemaVersion ? { schemaVersion: capture.schemaVersion } : {}), groups: capture.groups }
  }
  if (!document || document.sha256 !== sha256(syntheticReviewAnswerPdf())) return null
  const source = page => ({ documentSha256: document.sha256,
    locator: { kind: 'page_region', documentId: document.documentId, page,
      region: { x: 0, y: 0, width: 1, height: 1 } } })
  const sidecar = prepareSourceReferences(projection)
  for (const group of sidecar.groups) {
    const task = projection.materialization.groups.find(item => item.groupId === group.groupId).writingTask
    const application = group.taskType === 'application'
    const text = application ? syntheticApplicationSample : syntheticContinuationSample
    if (task.officialModelAnswer !== text) throw new Error('Synthetic answer PDF and materialization disagree')
    group.essays = { state: 'captured', evidence: [], entries: [{
      referenceId: `reference:synthetic-${group.taskType}`, authority: 'source_reference',
      sourceLabel: null, labelSource: null,
      paragraphs: [{ paragraphId: `paragraph:synthetic-${group.taskType}`, role: 'body', text,
        source: source(application ? 1 : 2), ...(application ? { continuationSources: [source(2)] } : {}) }],
    }] }
    // The invented two-page PDF contains no scoring criteria.
    group.scoring = { state: 'not_supplied', evidence: [source(1), source(2)], entries: [] }
  }
  return sidecar
}
