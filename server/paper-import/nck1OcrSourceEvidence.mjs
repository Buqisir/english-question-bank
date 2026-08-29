import { execFileSync } from 'node:child_process'

import { rasterPdfRegion } from '../paper-canonical/pdfRegionRaster.mjs'
import {
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
  nck1ImageBundlePage,
  nck1ImagePageRgba,
} from './nck1ImageSourceBundle.mjs'
import {
  digestJson,
  sha256,
  stableStringify,
} from '../../shared/paper-canonical/stable.mjs'

export const NCK1_OCR_EVIDENCE_SCHEMA_VERSION = 'nck1-ocr-source-evidence-v1'
export const NCK1_OCR_CONFIRMATION_SCHEMA_VERSION = 'nck1-ocr-source-confirmation-v1'
export const NCK1_OCR_EVIDENCE_FILE_NAME = 'nck1-ocr-source-evidence-v1.json'
export const NCK1_OCR_CONFIRMATION_FILE_NAME = 'nck1-ocr-source-confirmation-v1.json'

export const NCK1_OCR_REVIEW_CODES = Object.freeze([
  'NCK1_OCR_TEXT_LAYER_REQUIRED',
  'NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED',
  'NCK1_OCR_READING_ORDER_AMBIGUOUS',
  'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED',
])

const PDF = 'application/pdf'
const RASTER_DENSITY = 144
const FULL_PAGE = Object.freeze({ x: 0, y: 0, width: 1, height: 1 })
const MAX_BUFFER = 50 * 1024 * 1024

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value, keys) {
  return isRecord(value)
    && Object.keys(value).sort().join('\n') === [...keys].sort().join('\n')
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizedRegion(region) {
  return Boolean(
    exactKeys(region, ['x', 'y', 'width', 'height'])
    && ['x', 'y', 'width', 'height'].every((key) =>
      typeof region[key] === 'number' && Number.isFinite(region[key]))
    && region.x >= 0
    && region.y >= 0
    && region.width > 0
    && region.height > 0
    && region.x + region.width <= 1.000001
    && region.y + region.height <= 1.000001,
  )
}

function source(documentId, page = 1, region = FULL_PAGE) {
  return {
    documentId: documentId || 'unresolved-source',
    page: Number.isInteger(page) && page > 0 ? page : 1,
    region: normalizedRegion(region) ? structuredClone(region) : structuredClone(FULL_PAGE),
  }
}

function issue(code, path, message, documentId, page = 1, region = FULL_PAGE) {
  return { code, path, message, source: source(documentId, page, region) }
}

function firstSource(documents) {
  const document = documents?.[0]
  return source(document?.documentId, 1, FULL_PAGE)
}

function evidenceWithoutDigest(evidence) {
  if (!isRecord(evidence)) return evidence
  const { evidenceDigest: _evidenceDigest, ...record } = evidence
  return record
}

export function nck1OcrSourceSetDigest(documents) {
  return digestJson({
    schemaVersion: 'nck1-ocr-source-set-v1',
    documents: nck1OcrSourceDocuments(documents).map((document) => ({
      documentId: document.documentId,
      role: document.role,
      mediaType: document.mediaType,
      sha256: document.sha256,
      byteLength: document.byteLength,
      pageCount: document.pageCount,
    })),
  })
}

export function nck1OcrEvidenceDigest(evidence) {
  return digestJson(evidenceWithoutDigest(evidence))
}

function rasterPage(document, page) {
  if (document.mediaType === NCK1_IMAGE_BUNDLE_MEDIA_TYPE) {
    const sourcePage = nck1ImageBundlePage(document, page)
    return {
      recipe: {
        kind: 'image_page_v1',
        region: structuredClone(FULL_PAGE),
      },
      ...nck1ImagePageRgba(sourcePage),
    }
  }
  const raster = rasterPdfRegion({
    pdfBytes: document.bytes,
    page,
    region: FULL_PAGE,
    density: RASTER_DENSITY,
  })
  const pixels = execFileSync('magick', ['png:-', 'rgba:-'], {
    input: raster.bytes,
    maxBuffer: MAX_BUFFER,
  })
  return {
    recipe: {
      kind: 'pdf_page_region_v1',
      density: RASTER_DENSITY,
      region: structuredClone(FULL_PAGE),
    },
    sha256: sha256(pixels),
    pixelWidth: raster.pixelWidth,
    pixelHeight: raster.pixelHeight,
  }
}

export function nck1OcrSourceDocuments(documents) {
  return (documents || []).filter((document) => !document.renditionOf)
}

export function captureNck1OcrPageRasters(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    throw new TypeError('OCR page raster capture requires immutable source documents')
  }
  return nck1OcrSourceDocuments(documents).map((document) => {
    if (
      ![PDF, NCK1_IMAGE_BUNDLE_MEDIA_TYPE].includes(document.mediaType)
      || !(document.bytes instanceof Uint8Array)
      || sha256(document.bytes) !== document.sha256
      || document.bytes.byteLength !== document.byteLength
      || !Number.isInteger(document.pageCount)
      || document.pageCount < 1
    ) throw new TypeError(`OCR page raster capture cannot close ${document.documentId}`)
    return {
      documentId: document.documentId,
      pages: Array.from({ length: document.pageCount }, (_, index) => ({
        page: index + 1,
        raster: rasterPage(document, index + 1),
      })),
    }
  })
}

export function buildNck1OcrSourceEvidence({
  paperId,
  documents,
  engine,
  confidenceThreshold,
  engineDocuments,
}) {
  if (!nonEmpty(paperId) || !exactKeys(engine, ['name', 'version'])
    || !nonEmpty(engine.name) || !nonEmpty(engine.version)) {
    throw new TypeError('OCR evidence requires paper and engine identity')
  }
  if (typeof confidenceThreshold !== 'number'
    || confidenceThreshold <= 0 || confidenceThreshold > 1) {
    throw new TypeError('OCR evidence confidence threshold must be within 0..1')
  }
  const supplied = new Map((engineDocuments || []).map((document) => [
    document.documentId,
    document,
  ]))
  const rasterDocuments = captureNck1OcrPageRasters(documents)
  const evidence = {
    schemaVersion: NCK1_OCR_EVIDENCE_SCHEMA_VERSION,
    paperId,
    sourceSetDigest: nck1OcrSourceSetDigest(documents),
    engine: structuredClone(engine),
    confidenceThreshold,
    documents: rasterDocuments.map((document) => {
      const engineDocument = supplied.get(document.documentId)
      if (!engineDocument || !Array.isArray(engineDocument.pages)) {
        throw new TypeError(`OCR engine output is missing ${document.documentId}`)
      }
      const pages = new Map(engineDocument.pages.map((page) => [page.page, page]))
      return {
        documentId: document.documentId,
        pages: document.pages.map(({ page, raster }) => {
          const output = pages.get(page)
          if (!output) throw new TypeError(`OCR engine output is missing ${document.documentId} page ${page}`)
          return {
            page,
            raster,
            regions: structuredClone(output.regions),
            observations: structuredClone(output.observations),
            readingOrderEdges: structuredClone(output.readingOrderEdges),
          }
        }),
      }
    }),
  }
  return { ...evidence, evidenceDigest: nck1OcrEvidenceDigest(evidence) }
}

function uniqueTopologicalOrder(observationIds, edges) {
  const outgoing = new Map(observationIds.map((id) => [id, []]))
  const indegree = new Map(observationIds.map((id) => [id, 0]))
  for (const edge of edges) {
    if (!outgoing.has(edge.before) || !outgoing.has(edge.after) || edge.before === edge.after) {
      return null
    }
    outgoing.get(edge.before).push(edge.after)
    indegree.set(edge.after, indegree.get(edge.after) + 1)
  }
  const ordered = []
  while (ordered.length < observationIds.length) {
    const available = observationIds.filter((id) =>
      indegree.get(id) === 0 && !ordered.includes(id))
    if (available.length !== 1) return null
    const [current] = available
    ordered.push(current)
    indegree.set(current, -1)
    for (const target of outgoing.get(current)) {
      indegree.set(target, indegree.get(target) - 1)
    }
  }
  return ordered
}

function inspectEvidencePage({
  evidencePage,
  document,
  issues,
  observationIds,
  regionIds,
  includeReviewFindings,
}) {
  const page = evidencePage?.page
  const pageSource = source(document.documentId, page, FULL_PAGE)
  if (!exactKeys(evidencePage, [
    'page', 'raster', 'regions', 'observations', 'readingOrderEdges',
  ]) || !Number.isInteger(page) || page < 1 || page > document.pageCount) {
    issues.push(issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      `documents.${document.documentId}.pages`,
      'OCR page evidence is malformed or outside the immutable source',
      pageSource.documentId,
      pageSource.page,
      pageSource.region,
    ))
    return
  }
  let expectedRaster
  try {
    expectedRaster = rasterPage(document, page)
  } catch {
    issues.push(issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      `documents.${document.documentId}.pages.${page}.raster`,
      'OCR source page pixels no longer replay from the immutable source',
      document.documentId,
      page,
    ))
    return
  }
  if (
    !exactKeys(evidencePage.raster, ['recipe', 'sha256', 'pixelWidth', 'pixelHeight'])
    || stableStringify(evidencePage.raster) !== stableStringify(expectedRaster)
  ) {
    issues.push(issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      `documents.${document.documentId}.pages.${page}.raster`,
      'OCR page raster no longer replays from the immutable source',
      document.documentId,
      page,
    ))
  }
  if (!Array.isArray(evidencePage.regions) || evidencePage.regions.length === 0
    || !Array.isArray(evidencePage.observations)
    || !Array.isArray(evidencePage.readingOrderEdges)) {
    issues.push(issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      `documents.${document.documentId}.pages.${page}`,
      'Every OCR page needs a closed region, observation, and reading-order inventory',
      document.documentId,
      page,
    ))
    return
  }
  const regions = new Map()
  for (const [index, region] of evidencePage.regions.entries()) {
    if (
      !exactKeys(region, ['regionId', 'kind', 'region'])
      || !nonEmpty(region.regionId)
      || regionIds.has(region.regionId)
      || !['text', 'visual', 'unclassified'].includes(region.kind)
      || !normalizedRegion(region.region)
    ) {
      issues.push(issue(
        'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
        `documents.${document.documentId}.pages.${page}.regions[${index}]`,
        'OCR regions need unique identity, a known kind, and normalized geometry',
        document.documentId,
        page,
        region?.region,
      ))
      continue
    }
    regionIds.add(region.regionId)
    regions.set(region.regionId, region)
    if (includeReviewFindings && region.kind !== 'text') {
      issues.push(issue(
        'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED',
        `documents.${document.documentId}.pages.${page}.regions.${region.regionId}`,
        'A non-text source region requires explicit content-vs-furniture confirmation',
        document.documentId,
        page,
        region.region,
      ))
    }
  }
  const pageObservations = []
  const observedRegions = new Set()
  for (const [index, observation] of evidencePage.observations.entries()) {
    const region = regions.get(observation?.regionId)
    const validAlternatives = Array.isArray(observation?.alternatives)
      && observation.alternatives.every((alternative) =>
        exactKeys(alternative, ['text', 'confidence'])
        && nonEmpty(alternative.text)
        && typeof alternative.confidence === 'number'
        && alternative.confidence >= 0
        && alternative.confidence <= 1)
    if (
      !exactKeys(observation, [
        'observationId', 'regionId', 'region', 'text', 'confidence', 'alternatives',
      ])
      || !nonEmpty(observation.observationId)
      || observationIds.has(observation.observationId)
      || region?.kind !== 'text'
      || !normalizedRegion(observation.region)
      || !nonEmpty(observation.text)
      || typeof observation.confidence !== 'number'
      || observation.confidence < 0
      || observation.confidence > 1
      || !validAlternatives
    ) {
      issues.push(issue(
        'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
        `documents.${document.documentId}.pages.${page}.observations[${index}]`,
        'OCR observations need unique identity, source geometry, text, confidence, and alternatives',
        document.documentId,
        page,
        observation?.region || region?.region,
      ))
      continue
    }
    observationIds.add(observation.observationId)
    observedRegions.add(observation.regionId)
    pageObservations.push(observation.observationId)
  }
  for (const region of regions.values()) {
    if (region.kind === 'text' && !observedRegions.has(region.regionId)) {
      issues.push(issue(
        'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
        `documents.${document.documentId}.pages.${page}.regions.${region.regionId}`,
        'Every text region must contain at least one OCR observation',
        document.documentId,
        page,
        region.region,
      ))
    }
  }
  const edges = evidencePage.readingOrderEdges
  if (edges.some((edge) =>
    !exactKeys(edge, ['before', 'after'])
    || !pageObservations.includes(edge.before)
    || !pageObservations.includes(edge.after))) {
    issues.push(issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      `documents.${document.documentId}.pages.${page}.readingOrderEdges`,
      'OCR reading-order edges must bind observations on the same immutable page',
      document.documentId,
      page,
    ))
  } else if (includeReviewFindings && !uniqueTopologicalOrder(pageObservations, edges)) {
    const first = evidencePage.observations[0]
    issues.push(issue(
      'NCK1_OCR_READING_ORDER_AMBIGUOUS',
      `documents.${document.documentId}.pages.${page}.readingOrderEdges`,
      'OCR region graph does not establish one source reading order',
      document.documentId,
      page,
      first?.region,
    ))
  }
}

export function validateNck1OcrSourceEvidence({
  paperId,
  documents,
  evidence,
  includeReviewFindings = true,
}) {
  const issues = []
  const fallback = firstSource(documents)
  if (!exactKeys(evidence, [
    'schemaVersion', 'paperId', 'sourceSetDigest', 'evidenceDigest',
    'engine', 'confidenceThreshold', 'documents',
  ]) || evidence.schemaVersion !== NCK1_OCR_EVIDENCE_SCHEMA_VERSION
    || evidence.paperId !== paperId
    || !exactKeys(evidence.engine, ['name', 'version'])
    || !nonEmpty(evidence.engine.name)
    || !nonEmpty(evidence.engine.version)
    || typeof evidence.confidenceThreshold !== 'number'
    || evidence.confidenceThreshold <= 0
    || evidence.confidenceThreshold > 1
    || !Array.isArray(evidence.documents)) {
    return [issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      'ocrEvidence',
      'OCR evidence does not match the registered versioned shape',
      fallback.documentId,
      fallback.page,
      fallback.region,
    )]
  }
  if (
    evidence.sourceSetDigest !== nck1OcrSourceSetDigest(documents)
    || evidence.evidenceDigest !== nck1OcrEvidenceDigest(evidence)
  ) {
    return [issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      'ocrEvidence.evidenceDigest',
      'OCR evidence is not bound to the current immutable source and observations',
      fallback.documentId,
      fallback.page,
      fallback.region,
    )]
  }
  const evidenceDocuments = new Map(evidence.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const sourceDocuments = nck1OcrSourceDocuments(documents)
  const observationIds = new Set()
  const regionIds = new Set()
  for (const document of sourceDocuments) {
    const evidenceDocument = evidenceDocuments.get(document.documentId)
    if (
      ![PDF, NCK1_IMAGE_BUNDLE_MEDIA_TYPE].includes(document.mediaType)
      || !(document.bytes instanceof Uint8Array)
      || sha256(document.bytes) !== document.sha256
      || document.bytes.byteLength !== document.byteLength
      || !Number.isInteger(document.pageCount)
      || document.pageCount < 1
      || !exactKeys(evidenceDocument, ['documentId', 'pages'])
      || !Array.isArray(evidenceDocument.pages)
      || evidenceDocument.pages.length !== document.pageCount
      || evidenceDocument.pages.some((page, index) => page.page !== index + 1)
    ) {
      issues.push(issue(
        'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
        `documents.${document.documentId}`,
        'OCR evidence must cover every immutable PDF page exactly once in source order',
        document.documentId,
      ))
      continue
    }
    for (const evidencePage of evidenceDocument.pages) {
      inspectEvidencePage({
        evidencePage,
        document,
        issues,
        observationIds,
        regionIds,
        includeReviewFindings,
      })
      if (includeReviewFindings) {
        for (const observation of evidencePage.observations || []) {
          if (
            typeof observation.confidence === 'number'
            && (observation.confidence < evidence.confidenceThreshold
              || (Array.isArray(observation.alternatives) && observation.alternatives.length > 0))
          ) {
            issues.push(issue(
              'NCK1_OCR_CONFIDENCE_REVIEW_REQUIRED',
              `documents.${document.documentId}.pages.${evidencePage.page}.observations.${observation.observationId}`,
              'A promoted OCR observation is below the registered threshold or has a competing candidate',
              document.documentId,
              evidencePage.page,
              observation.region,
            ))
          }
        }
      }
    }
  }
  if (evidenceDocuments.size !== sourceDocuments.length
    || evidence.documents.some((document) =>
      !sourceDocuments.some((sourceDocument) =>
        sourceDocument.documentId === document.documentId))) {
    issues.push(issue(
      'NCK1_OCR_PAGE_COVERAGE_INCOMPLETE',
      'ocrEvidence.documents',
      'OCR evidence contains a missing, duplicate, or foreign source document',
      fallback.documentId,
      fallback.page,
      fallback.region,
    ))
  }
  return issues
}

function unionRegion(observations) {
  const left = Math.min(...observations.map((observation) => observation.region.x))
  const top = Math.min(...observations.map((observation) => observation.region.y))
  const right = Math.max(...observations.map((observation) =>
    observation.region.x + observation.region.width))
  const bottom = Math.max(...observations.map((observation) =>
    observation.region.y + observation.region.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function resolveConfirmedNck1OcrEvidence({
  paperId,
  documents,
  evidence,
  confirmation,
}) {
  const structuralIssues = validateNck1OcrSourceEvidence({
    paperId,
    documents,
    evidence,
    includeReviewFindings: false,
  })
  if (structuralIssues.length > 0) {
    return { issues: structuralIssues, structures: new Map(), sourceVisuals: [] }
  }
  const fallback = firstSource(documents)
  if (!exactKeys(confirmation, [
    'schemaVersion', 'paperId', 'sourceSetDigest', 'evidenceDigest', 'confirmed', 'documents',
  ]) || confirmation.schemaVersion !== NCK1_OCR_CONFIRMATION_SCHEMA_VERSION
    || confirmation.paperId !== paperId
    || confirmation.sourceSetDigest !== evidence.sourceSetDigest
    || confirmation.evidenceDigest !== evidence.evidenceDigest
    || confirmation.confirmed !== true
    || !Array.isArray(confirmation.documents)) {
    return {
      issues: [issue(
        'NCK1_OCR_CONFIRMATION_STALE',
        'ocrConfirmation',
        'OCR confirmation is absent, incomplete, or bound to different source evidence',
        fallback.documentId,
        fallback.page,
        fallback.region,
      )],
      structures: new Map(),
      sourceVisuals: [],
    }
  }
  const evidenceDocuments = new Map(evidence.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const confirmationDocuments = new Map(confirmation.documents.map((document) => [
    document.documentId,
    document,
  ]))
  const issues = []
  const structures = new Map()
  const sourceVisuals = []
  const seenItemIds = new Set()
  const sourceDocuments = nck1OcrSourceDocuments(documents)
  for (const document of sourceDocuments) {
    const evidenceDocument = evidenceDocuments.get(document.documentId)
    const confirmedDocument = confirmationDocuments.get(document.documentId)
    if (!exactKeys(confirmedDocument, ['documentId', 'pages'])
      || !Array.isArray(confirmedDocument.pages)
      || confirmedDocument.pages.length !== evidenceDocument.pages.length
      || confirmedDocument.pages.some((page, index) => page.page !== index + 1)) {
      issues.push(issue(
        'NCK1_OCR_CONFIRMATION_STALE',
        `ocrConfirmation.documents.${document.documentId}`,
        'OCR confirmation does not cover every evidence page exactly once',
        document.documentId,
      ))
      continue
    }
    const body = []
    for (const [pageIndex, evidencePage] of evidenceDocument.pages.entries()) {
      const confirmedPage = confirmedDocument.pages[pageIndex]
      if (!exactKeys(confirmedPage, [
        'page', 'orderedItems', 'furnitureObservationIds', 'visualClassifications',
      ]) || !Array.isArray(confirmedPage.orderedItems)
        || !Array.isArray(confirmedPage.furnitureObservationIds)
        || !Array.isArray(confirmedPage.visualClassifications)) {
        issues.push(issue(
          'NCK1_OCR_CONFIRMATION_STALE',
          `ocrConfirmation.documents.${document.documentId}.pages.${pageIndex + 1}`,
          'OCR page confirmation does not match the registered shape',
          document.documentId,
          pageIndex + 1,
        ))
        continue
      }
      const observations = new Map(evidencePage.observations.map((observation) => [
        observation.observationId,
        observation,
      ]))
      const regions = new Map(evidencePage.regions.map((region) => [region.regionId, region]))
      const claimedObservations = new Set()
      for (const [itemIndex, item] of confirmedPage.orderedItems.entries()) {
        const itemObservations = Array.isArray(item?.observationIds)
          ? item.observationIds.map((id) => observations.get(id)).filter(Boolean)
          : []
        if (
          !exactKeys(item, ['itemId', 'observationIds', 'text'])
          || !nonEmpty(item.itemId)
          || seenItemIds.has(item.itemId)
          || !Array.isArray(item.observationIds)
          || item.observationIds.length === 0
          || itemObservations.length !== item.observationIds.length
          || new Set(item.observationIds).size !== item.observationIds.length
          || item.observationIds.some((id) => claimedObservations.has(id))
          || !nonEmpty(item.text)
        ) {
          issues.push(issue(
            'NCK1_OCR_CONFIRMATION_STALE',
            `ocrConfirmation.documents.${document.documentId}.pages.${confirmedPage.page}.orderedItems[${itemIndex}]`,
            'Confirmed OCR items need unique identity, source observations, text, and source order',
            document.documentId,
            confirmedPage.page,
            itemObservations[0]?.region,
          ))
          continue
        }
        seenItemIds.add(item.itemId)
        item.observationIds.forEach((id) => claimedObservations.add(id))
        body.push({
          kind: 'paragraph',
          text: item.text,
          containsDrawing: false,
          sourceIndex: {
            kind: 'page_region',
            documentId: document.documentId,
            page: confirmedPage.page,
            region: unionRegion(itemObservations),
          },
        })
      }
      for (const observationId of confirmedPage.furnitureObservationIds) {
        const observation = observations.get(observationId)
        if (!observation || claimedObservations.has(observationId)) {
          issues.push(issue(
            'NCK1_OCR_CONFIRMATION_STALE',
            `ocrConfirmation.documents.${document.documentId}.pages.${confirmedPage.page}.furnitureObservationIds`,
            'Furniture text confirmation must bind one unclaimed observation on this page',
            document.documentId,
            confirmedPage.page,
            observation?.region,
          ))
        } else claimedObservations.add(observationId)
      }
      for (const observation of observations.values()) {
        if (!claimedObservations.has(observation.observationId)) {
          issues.push(issue(
            'NCK1_OCR_CONFIRMATION_STALE',
            `ocrConfirmation.documents.${document.documentId}.pages.${confirmedPage.page}.observations.${observation.observationId}`,
            'Every OCR observation must be confirmed as content or furniture exactly once',
            document.documentId,
            confirmedPage.page,
            observation.region,
          ))
        }
      }
      const expectedVisuals = evidencePage.regions.filter((region) => region.kind !== 'text')
      const classified = new Set()
      for (const [visualIndex, visual] of confirmedPage.visualClassifications.entries()) {
        const region = regions.get(visual?.regionId)
        if (
          !exactKeys(visual, ['regionId', 'classification'])
          || !region
          || region.kind === 'text'
          || classified.has(visual.regionId)
          || visual.classification !== 'furniture'
        ) {
          issues.push(issue(
            'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED',
            `ocrConfirmation.documents.${document.documentId}.pages.${confirmedPage.page}.visualClassifications[${visualIndex}]`,
            'Ticket 06 only promotes explicitly confirmed furniture; tables and content media remain fail closed',
            document.documentId,
            confirmedPage.page,
            region?.region,
          ))
          continue
        }
        classified.add(visual.regionId)
        if (['question_source', 'question_and_answers'].includes(document.role)) {
          sourceVisuals.push({
            visualId: `visual:${paperId}:ocr-${visual.regionId}`,
            page: confirmedPage.page,
            region: structuredClone(region.region),
            disposition: 'furniture',
            targetId: null,
          })
        }
      }
      for (const region of expectedVisuals) {
        if (!classified.has(region.regionId)) {
          issues.push(issue(
            'NCK1_OCR_VISUAL_CLASSIFICATION_REQUIRED',
            `ocrConfirmation.documents.${document.documentId}.pages.${confirmedPage.page}.regions.${region.regionId}`,
            'Every non-text source region requires explicit classification',
            document.documentId,
            confirmedPage.page,
            region.region,
          ))
        }
      }
    }
    structures.set(document.documentId, {
      body,
      paragraphs: body,
      tables: [],
      unsupportedParagraphCount: 0,
    })
  }
  if (confirmationDocuments.size !== sourceDocuments.length) {
    issues.push(issue(
      'NCK1_OCR_CONFIRMATION_STALE',
      'ocrConfirmation.documents',
      'OCR confirmation contains a missing, duplicate, or foreign source document',
      fallback.documentId,
      fallback.page,
      fallback.region,
    ))
  }
  return { issues, structures, sourceVisuals }
}
