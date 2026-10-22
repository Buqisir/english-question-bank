import {
  produceNck1MaterializationFromStructures,
  splitNck1CombinedSourceStructure,
} from './nck1DocxMaterializationProducer.mjs'
import {
  nck1OcrSourceDocuments,
  nck1OcrSourceSetDigest,
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3,
  resolveConfirmedNck1OcrEvidence,
  validateNck1OcrSourceEvidence,
} from './nck1OcrSourceEvidence.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
} from './nck1ImageSourceBundle.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { rasterPdfRegion } from '../paper-canonical/pdfRegionRaster.mjs'

export const NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION =
  'nck1-ocr-materialization-producer-v21'

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
  if (located) return item
  return {
    ...item,
    source: {
      documentId: item.source?.documentId || document?.documentId || 'unresolved-source',
      page: 1,
      region: structuredClone(FULL_PAGE),
    },
  }
}

export function nck1OcrProducerVersion(confirmation) {
  return confirmation?.schemaVersion === NCK1_OCR_CONFIRMATION_SCHEMA_VERSION_V3
    ? 'nck1-ocr-materialization-producer-v22' : NCK1_OCR_MATERIALIZATION_PRODUCER_VERSION
}

export function nck1OcrProducerSourceDigest(documents, { evidence = null, confirmation = null, producerVersion = nck1OcrProducerVersion(confirmation) } = {}) {
  return digestJson({
    producerVersion,
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
    !document.renditionOf && document.role === 'question_source')
  const answerDocs = documents.filter((document) =>
    !document.renditionOf && document.role === 'official_answers')
  const combinedDocs = documents.filter((document) =>
    !document.renditionOf && document.role === 'question_and_answers')
  const separateSourceSet = questionDocs.length === 1
    && answerDocs.length === 1
    && combinedDocs.length === 0
  const combinedSourceSet = questionDocs.length === 0
    && answerDocs.length === 0
    && combinedDocs.length === 1
  const question = separateSourceSet ? questionDocs[0] : combinedDocs[0]
  const answer = separateSourceSet ? answerDocs[0] : combinedDocs[0]
  const sourceDocuments = nck1OcrSourceDocuments(documents)
  const sourceMediaTypes = new Set(sourceDocuments.map((document) => document.mediaType))
  const validCarrier = sourceMediaTypes.size === 1
    && [PDF, NCK1_IMAGE_BUNDLE_MEDIA_TYPE].includes(sourceDocuments[0]?.mediaType)
  const sourceIds = new Set(sourceDocuments.map((document) => document.documentId))
  const validRenditions = documents.filter((document) => document.renditionOf)
    .every((document) =>
      document.mediaType === PDF && sourceIds.has(document.renditionOf))
  if ((!separateSourceSet && !combinedSourceSet)
    || sourceDocuments.length !== (combinedSourceSet ? 1 : 2)
    || !validCarrier
    || !validRenditions) {
    addIssue(
      issues,
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      'documents',
      'OCR producer requires one question source plus one official-answer source, or one combined source, using one supported raster carrier',
      question || documents[0],
    )
  }

  let questionStructure = emptyStructure()
  let answerStructure = emptyStructure()
  let sourceVisuals = []
  const mediaInventory = []
  const mediaFiles = []
  if (!evidence) {
    const unresolvedDocuments = [...new Map(
      [question, answer].filter(Boolean).map((document) => [document.documentId, document]),
    ).values()]
    for (const document of unresolvedDocuments) {
      addIssue(
        issues,
        'NCK1_OCR_TEXT_LAYER_REQUIRED',
        `documents.${document.documentId}`,
        'Raster source requires staged OCR observations and Agent-verified transcription closure against the immutable page',
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
      'OCR observations are evidence only until the Agent verifies text and source order; content-bearing visuals remain independently reviewable',
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
    if (question && answer === question) {
      const split = splitNck1CombinedSourceStructure(
        questionStructure,
        question?.documentId,
        issues,
      )
      questionStructure = split.questionStructure
      answerStructure = split.answerStructure
    } else {
      answerStructure = resolved.structures.get(answer?.documentId) || emptyStructure()
    }
    sourceVisuals = resolved.sourceVisuals
    if (resolved.issues.length === 0) {
      for (const { mediaId, source: locator } of resolved.contentMedia || []) {
        const document = documents.find(item => item.documentId === locator.documentId)
        try {
          const crop = rasterPdfRegion({ pdfBytes: document.bytes, page: locator.page,
            region: locator.region, density: 144 })
          const digest = sha256(crop.bytes)
          mediaInventory.push({ mediaId, usage: 'content', kind: 'figure', mimeType: 'image/png',
            sha256: digest, pixelWidth: crop.pixelWidth, pixelHeight: crop.pixelHeight,
            extraction: { ...locator, kind: 'pdf_crop', density: 144 },
            presentation: { alignment: 'center', widthRatio: 1, spacingBefore: 'normal', spacingAfter: 'normal' },
            publication: { selection: 'source_crop', sourceSha256: digest } })
          mediaFiles.push({ mediaId, bytes: crop.bytes })
        } catch (error) {
          addIssue(issues, 'NCK1_OCR_MEDIA_EXTRACTION_FAILED', `media.${mediaId}`,
            error.message, document, locator.page, locator.region)
        }
      }
    }
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
    mediaInventory,
    mediaFiles,
    codePrefix: 'NCK1_OCR',
    producerVersion: nck1OcrProducerVersion(confirmation),
    reviewSchemaVersion: 'nck1-ocr-materialization-review-v1',
    sourceDigest: nck1OcrProducerSourceDigest(documents, { evidence, confirmation }),
  })
  produced.materialization.issues = produced.materialization.issues.map((item) =>
    closeIssueSource(item, question || documents[0]))
  produced.review.required = produced.review.required.map((item) =>
    closeIssueSource(item, question || documents[0]))
  produced.review.listeningSourcePartition.originalMaterializationOutputDigest = sha256(
    new TextEncoder().encode(`${JSON.stringify(produced.materialization, null, 2)}\n`),
  )
  return produced
}
