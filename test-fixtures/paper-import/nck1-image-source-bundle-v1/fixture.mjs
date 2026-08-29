import { execFileSync } from 'node:child_process'

import { rasterPdfRegion } from '../../../server/paper-canonical/pdfRegionRaster.mjs'
import {
  buildNck1ImageSourceBundle,
  NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
} from '../../../server/paper-import/nck1ImageSourceBundle.mjs'
import {
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
  buildNck1OcrSourceEvidence,
} from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { makeSyntheticNck1OcrFixture } from '../nck1-ocr-evidence-v1/fixture.mjs'

const FULL_PAGE = Object.freeze({ x: 0, y: 0, width: 1, height: 1 })

function convertImage(bytes, mediaType) {
  if (mediaType === 'image/png') return new Uint8Array(bytes)
  const target = mediaType === 'image/jpeg' ? 'jpeg:-' : 'webp:-'
  return new Uint8Array(execFileSync(
    'magick',
    ['png:-', mediaType === 'image/jpeg' ? '-quality' : '-define',
      mediaType === 'image/jpeg' ? '92' : 'webp:lossless=true', target],
    { input: bytes, maxBuffer: 64 * 1024 * 1024 },
  ))
}

function sourcePages(document, mediaTypes) {
  return Array.from({ length: document.pageCount }, (_, index) => {
    const page = index + 1
    const raster = rasterPdfRegion({
      pdfBytes: document.bytes,
      page,
      region: FULL_PAGE,
      density: 144,
    })
    const mediaType = mediaTypes[index % mediaTypes.length]
    return { page, mediaType, bytes: convertImage(raster.bytes, mediaType) }
  })
}

function bundleDocument(document, pages) {
  const bytes = buildNck1ImageSourceBundle(pages)
  return {
    documentId: document.documentId,
    role: document.role,
    mediaType: NCK1_IMAGE_BUNDLE_MEDIA_TYPE,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    pageCount: pages.length,
    bytes,
  }
}

function renditionDocument(document) {
  const documentId = `${document.documentId}-pdf-rendition`
  return {
    documentId,
    role: document.role,
    mediaType: 'application/pdf',
    sha256: sha256(document.bytes),
    byteLength: document.bytes.byteLength,
    pageCount: document.pageCount,
    renditionOf: document.documentId,
    bytes: new Uint8Array(document.bytes),
  }
}

export function engineDocumentsFromEvidence(evidence) {
  return evidence.documents.map((document) => ({
    documentId: document.documentId,
    pages: document.pages.map((page) => ({
      page: page.page,
      regions: structuredClone(page.regions),
      observations: structuredClone(page.observations),
      readingOrderEdges: structuredClone(page.readingOrderEdges),
    })),
  }))
}

export function imageBundleConfirmation(paperId, evidence) {
  return {
    schemaVersion: NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
    paperId,
    sourceSetDigest: evidence.sourceSetDigest,
    evidenceDigest: evidence.evidenceDigest,
    confirmed: true,
    documents: evidence.documents.map((document) => ({
      documentId: document.documentId,
      pages: document.pages.map((page) => ({
        page: page.page,
        orderedItems: page.observations.map((observation, index) => ({
          itemId: `${document.documentId}:page-${page.page}:item-${index + 1}`,
          observationIds: [observation.observationId],
          text: observation.text,
        })),
        furnitureObservationIds: [],
        visualClassifications: page.regions
          .filter((region) => region.kind !== 'text')
          .map((region) => ({ regionId: region.regionId, classification: 'furniture' })),
      })),
    })),
  }
}

export function imageBundleEvidence({ paperId, documents, engineDocuments }) {
  return buildNck1OcrSourceEvidence({
    paperId,
    documents,
    engine: { name: 'synthetic-fixed-ocr', version: '1.0.0' },
    confidenceThreshold: 0.97,
    engineDocuments,
  })
}

export async function makeSyntheticNck1ImageBundleFixture({
  paperId = 'paper-synthetic-image-bundle',
} = {}) {
  const ocrFixture = await makeSyntheticNck1OcrFixture({ paperId })
  const pageSets = [
    sourcePages(ocrFixture.sourceDocuments[0], ['image/png', 'image/jpeg', 'image/webp']),
    sourcePages(ocrFixture.sourceDocuments[1], ['image/png']),
  ]
  const bundleDocuments = ocrFixture.sourceDocuments.map((document, index) =>
    bundleDocument(document, pageSets[index]))
  const sourceDocuments = bundleDocuments.flatMap((document, index) => [
    document,
    renditionDocument(ocrFixture.sourceDocuments[index]),
  ])
  const engineDocuments = engineDocumentsFromEvidence(ocrFixture.evidence)
  const evidence = imageBundleEvidence({ paperId, documents: sourceDocuments, engineDocuments })
  const confirmation = imageBundleConfirmation(paperId, evidence)
  return {
    paperId,
    sourceDocuments,
    bundleDocuments,
    pageSets,
    engineDocuments,
    evidence,
    confirmation,
  }
}
