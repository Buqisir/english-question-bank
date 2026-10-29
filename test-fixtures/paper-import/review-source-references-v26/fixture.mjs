import { readFileSync } from 'node:fs'
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { buildNck1OcrSourceEvidence, NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2 } from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'

const read = name => readFileSync(new URL(name, import.meta.url))
export const currentReviewAnswerSha = () => sha256(read('answers.pdf'))

// Fixed, readable source pages; raster commitments are captured on this runtime.
// No machine-specific raster descriptors are stored with this fixture.
export function makeCurrentReviewSource({ paperId, questionSourceLabel, listening = false }) {
  const items = JSON.parse(read('ocr-items.json'))
  let questions = read('questions.pdf')
  if (!listening) {
    // Keep ten actual pages while supplying an end-of-paper final page for
    // the no-listening variant. A standard incremental PDF update preserves
    // fonts/resources and needs neither a browser nor a PDF library at runtime.
    const { objectId, dictionary, size, root, previousXref } = items.listeningPage
    const replacement = dictionary.replace(/\/Contents\s+\d+\s+0\s+R/u, `/Contents ${size} 0 R`)
      .replace('/Font <<', `/Font <</FEnd ${size + 1} 0 R `)
    if (replacement === dictionary) throw new Error('Fixture listening page content is unavailable')
    const pageObject = `\n${objectId} 0 obj\n${replacement}\nendobj\n`
    const stream = items.noListening.stream
    const emptyContent = `${size} 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream\nendobj\n`
    const fontObject = `${size + 1} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
    const pageOffset = questions.length + 1
    const contentOffset = questions.length + Buffer.byteLength(pageObject)
    const fontOffset = questions.length + Buffer.byteLength(pageObject + emptyContent)
    const xref = fontOffset + Buffer.byteLength(fontObject)
    const update = `${pageObject}${emptyContent}${fontObject}xref\n${objectId} 1\n${String(pageOffset).padStart(10, '0')} 00000 n \n`
      + `${size} 2\n${String(contentOffset).padStart(10, '0')} 00000 n \n${String(fontOffset).padStart(10, '0')} 00000 n \n`
      + `trailer\n<< /Size ${size + 2} /Root ${root} /Prev ${previousXref} >>\nstartxref\n${xref}\n%%EOF\n`
    questions = Buffer.concat([questions, Buffer.from(update)])
    const regionId = 'paper:end-region', observationId = 'paper:end-observation'
    Object.assign(items.documents.find(document => document.documentId === 'paper').pages[9], {
      regions: [{ regionId, kind: 'text', region: items.noListening.region }],
      observations: [{ regionId, observationId, text: items.noListening.text,
        region: items.noListening.region, confidence: .995, alternatives: [] }], readingOrderEdges: [],
    })
  }
  const questionBytes = Buffer.concat([questions,
    Buffer.from(`\n% fixture-label ${Buffer.from(questionSourceLabel).toString('hex')}\n`)])
  const answerBytes = read('answers.pdf')
  const documents = [
    { documentId: 'paper', role: 'question_source', pageCount: 10, bytes: questionBytes },
    { documentId: 'answers', role: 'official_answers', pageCount: 2, bytes: answerBytes },
  ].map(document => ({ ...document, mediaType: 'application/pdf',
    sha256: sha256(document.bytes), byteLength: document.bytes.byteLength }))
  const evidence = buildNck1OcrSourceEvidence({ paperId, documents,
    engine: { name: 'review-v26-fixed-pdf-text', version: '1' }, confidenceThreshold: .9,
    engineDocuments: items.documents })
  const confirmation = { schemaVersion: NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V2, paperId,
    sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest, confirmed: true,
    documents: evidence.documents.map(document => ({ documentId: document.documentId,
      pages: document.pages.map(page => ({ page: page.page,
        orderedItems: page.observations.map((observation, index) => ({
          itemId: `${document.documentId}:page-${page.page}:item-${index + 1}`,
          observationIds: [observation.observationId], text: observation.text,
        })), furnitureObservationIds: [], visualClassifications: [] })),
    })) }
  return { questionBytes, answerBytes, evidence, confirmation }
}

// The new source has one group per page and listening on page 10.
export function locateCurrentReviewQuestions(materialization) {
  function locate(value, page) {
    if (!value || typeof value !== 'object') return
    if (value.kind === 'page_region' && value.documentId === 'paper') value.page = page
    else for (const child of Object.values(value)) locate(child, page)
  }
  materialization.groups.forEach((group, index) => locate(group, index + 1))
  if (materialization.listening.state === 'captured') locate(materialization.listening.questions, 10)
}
