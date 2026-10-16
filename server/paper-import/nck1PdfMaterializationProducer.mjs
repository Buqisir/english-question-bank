import {
  produceNck1MaterializationFromStructures,
  splitNck1CombinedSourceStructure,
} from './nck1DocxMaterializationProducer.mjs'
import {
  extractNck1PdfTextStructure,
  Nck1PdfTextStructureError,
} from './nck1PdfTextSourceAdapter.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION =
  'nck1-pdf-materialization-producer-v12'

const PDF = 'application/pdf'

function source(documentId, evidence = null) {
  return evidence
    ? { documentId, ...structuredClone(evidence) }
    : { documentId }
}

function addIssue(issues, code, path, message, evidence = null) {
  issues.push({ code, path, message, source: evidence })
}

export function nck1PdfProducerSourceDigest(documents, { producerVersion = NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION } = {}) {
  return digestJson({
    producerVersion,
    documents: documents.map((document) => ({
      documentId: document.documentId,
      sha256: document.sha256,
      byteLength: document.byteLength,
    })),
  })
}

function emptyStructure() {
  return { body: [], paragraphs: [], tables: [], unsupportedParagraphCount: 0 }
}

function extract(document, path, issues) {
  if (!document) return emptyStructure()
  try {
    return extractNck1PdfTextStructure(document.bytes, {
      documentId: document.documentId,
      expectedPageCount: document.pageCount,
    })
  } catch (error) {
    if (error instanceof Nck1PdfTextStructureError) {
      addIssue(
        issues,
        error.code,
        path,
        error.message,
        source(document.documentId, error.evidence),
      )
    } else {
      addIssue(
        issues,
        'NCK1_PDF_TEXT_COVERAGE_INCOMPLETE',
        path,
        `PDF text evidence is unreadable: ${error.message}`,
        source(document.documentId),
      )
    }
    return emptyStructure()
  }
}

export function produceNck1PdfMaterialization({ paperId, documents }) {
  if (!/^paper-[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(paperId || '')) {
    throw new TypeError('NCK1 PDF materialization requires one valid paperId')
  }
  if (!Array.isArray(documents)) {
    throw new TypeError('NCK1 PDF materialization requires captured documents')
  }
  const issues = []
  for (const document of documents) {
    if (!(document.bytes instanceof Uint8Array)) {
      addIssue(
        issues,
        'NCK1_PDF_SOURCE_BYTES_MISSING',
        `documents.${document.documentId}`,
        'Captured source bytes are unavailable',
        source(document.documentId),
      )
      continue
    }
    if (sha256(document.bytes) !== document.sha256
      || document.bytes.byteLength !== document.byteLength) {
      addIssue(
        issues,
        'NCK1_PDF_SOURCE_DIGEST_MISMATCH',
        `documents.${document.documentId}`,
        'Source bytes no longer match immutable Source Capture',
        source(document.documentId),
      )
    }
  }
  const questionDocs = documents.filter((document) =>
    document.role === 'question_source' && document.mediaType === PDF)
  const answerDocs = documents.filter((document) =>
    document.role === 'official_answers' && document.mediaType === PDF)
  const combinedDocs = documents.filter((document) =>
    document.role === 'question_and_answers' && document.mediaType === PDF)
  const separateSourceSet = documents.length === 2
    && questionDocs.length === 1
    && answerDocs.length === 1
    && combinedDocs.length === 0
  const combinedSourceSet = documents.length === 1
    && questionDocs.length === 0
    && answerDocs.length === 0
    && combinedDocs.length === 1
  const question = separateSourceSet ? questionDocs[0] : combinedDocs[0]
  const answer = separateSourceSet ? answerDocs[0] : combinedDocs[0]
  if (
    !separateSourceSet
    && !combinedSourceSet
  ) {
    addIssue(
      issues,
      'NCK1_PDF_SOURCE_SET_AMBIGUOUS',
      'documents',
      'Producer requires either one question PDF plus one official-answer PDF, or one combined PDF',
    )
  }
  let questionStructure = extract(question, 'documents.question_source', issues)
  let answerStructure
  if (question && answer === question) {
    const split = splitNck1CombinedSourceStructure(
      questionStructure,
      question?.documentId,
      issues,
    )
    questionStructure = split.questionStructure
    answerStructure = split.answerStructure
  } else {
    answerStructure = extract(answer, 'documents.official_answers', issues)
  }
  if (answerStructure.tables.length > 0) {
    addIssue(
      issues,
      'NCK1_PDF_ANSWER_TABLE_REVIEW_REQUIRED',
      'documents.official_answers',
      'Official answers in PDF tables require Agent confirmation',
      source(answer?.documentId),
    )
  }
  return produceNck1MaterializationFromStructures({
    paperId,
    documents,
    question,
    answer,
    coverage: question,
    questionStructure,
    answerStructure,
    issues,
    codePrefix: 'NCK1_PDF',
    producerVersion: NCK1_PDF_MATERIALIZATION_PRODUCER_VERSION,
    reviewSchemaVersion: 'nck1-pdf-materialization-review-v1',
    sourceDigest: nck1PdfProducerSourceDigest(documents),
  })
}
