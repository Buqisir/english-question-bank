import { prepareSourceReferences } from '../../server/paper-import/sourceReferences.mjs'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'

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
