import {
  produceNck1MaterializationFromStructures,
} from './nck1DocxMaterializationProducer.mjs'
import {
  nck1OcrSourceSetDigest,
  resolveConfirmedNck1OcrEvidence,
  validateNck1OcrSourceEvidence,
} from './nck1OcrSourceEvidence.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION =
  'nck1-ocr-materialization-producer-v1'

const PDF = 'application/pdf'
const FULL_PAGE = Object.freeze({ x: 0, y: 0, width: 1, height: 1 })

function source(document, page = 1, region = FULL_PAGE) {
  return {
    documentId: document?.documentId || 'unresolved-source',
    page,
    region: structuredClone(region),
  }
}

function addIssue(issues, code, path, message, document, page = 1, region = FULL_PAGE) {
  issues.push({ code, path, message, source: source(document, page, region) })
}

function emptyStructure() {
  return { body: [], paragraphs: [], tables: [], unsupportedParagraphCount: 0 }
}

function closeIssueSource(item, document) {
  if (!item.code?.startsWith('NCK1_OCR_')) return item
  const located = item.source
    && typeof item.source.documentId === 'string'
    && Number.isInteger(item.source.page)
    && item.source.page > 0
    && item.source.region
  return located ? item : { ...item, source: source(document) }
}

export function nck1OcrProducerSourceDigest(documents, { evidence = null, confirmation = null } = {}) {
  return digestJson({
    producerVersion: NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION,
    sourceSetDigest: nck1OcrSourceSetDigest(documents),
    evidenceDigest: evidence?.evidenceDigest || null,
    confirmationDigest: confirmation ? digestJson(confirmation) : null,
  })
}

export function produceNck1OcrMaterialization({
  paperId,
  documents,
  evidence = null,
  confirmation = null,
}) {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(paperId || '')) {
    throw new TypeError('NCK1 OCR materialization requires one valid paperId')
  }
  if (!Array.isArray(documents)) {
    throw new TypeError('NCK1 OCR materialization requires captured documents')
  }
  const issues = []
  for (const document of documents) {
    if (!(document.bytes instanceof Uint8Array)) {
      addIssue(issues, 'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
        `documents.${document.documentId}`, 'Captured source bytes are unavailable', document)
    } else if (sha256(document.bytes) !== document.sha256
      || document.bytes.byteLength !== document.byteLength) {
      addIssue(issues, 'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
        `documents.${document.documentId}`, 'Source bytes no longer match immutable Source Capture', document)
    }
  }
  const questionDocs = documents.filter((document) =>
    document.role === 'question_source' && document.mediaType === PDF)
  const answerDocs = documents.filter((document) =>
    document.role === 'official_answers' && document.mediaType === PDF)
  const question = questionDocs[0]
  const answer = answerDocs[0]
  if (documents.length !== 2 || questionDocs.length !== 1 || answerDocs.length !== 1) {
    addIssue(
      issues,
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      'documents',
      'OCR producer requires exactly one question PDF and one official-answer PDF',
      question || documents[0],
    )
  }

  let questionStructure = emptyStructure()
  let answerStructure = emptyStructure()
  let sourceVisuals = []
  if (!evidence) {
    for (const document of [question, answer].filter(Boolean)) {
      addIssue(
        issues,
        'NCK1_OCR_TEXT_LAYER_REQUIRED',
        `documents.${document.documentId}`,
        'Scanned PDF requires staged OCR observations and explicit human confirmation',
        document,
      )
    }
  } else if (!confirmation) {
    issues.push(...validateNck1OcrSourceEvidence({
      paperId,
      documents,
      evidence,
      includeReviewFindings: true,
    }))
    addIssue(
      issues,
      'NCK1_OCR_TEXT_LAYER_REQUIRED',
      'ocrConfirmation',
      'OCR observations are evidence only until a human confirms text, source order, and visual classification',
      question || documents[0],
    )
  } else {
    const resolved = resolveConfirmedNck1OcrEvidence({
      paperId,
      documents,
      evidence,
      confirmation,
    })
    issues.push(...resolved.issues)
    questionStructure = resolved.structures.get(question?.documentId) || emptyStructure()
    answerStructure = resolved.structures.get(answer?.documentId) || emptyStructure()
    sourceVisuals = resolved.sourceVisuals
  }

  const produced = produceNck1MaterializationFromStructures({
    paperId,
    documents,
    question,
    answer,
    coverage: question,
    questionStructure,
    answerStructure,
    issues,
    sourceVisuals,
    codePrefix: 'NCK1_OCR',
    producerVersion: NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION,
    reviewSchemaVersion: 'nck1-ocr-materialization-review-v1',
    sourceDigest: nck1OcrProducerSourceDigest(documents, { evidence, confirmation }),
  })
  produced.materialization.issues = produced.materialization.issues.map((item) =>
    closeIssueSource(item, question || documents[0]))
  produced.review.required = produced.review.required.map((item) =>
    closeIssueSource(item, question || documents[0]))
  return produced
}
