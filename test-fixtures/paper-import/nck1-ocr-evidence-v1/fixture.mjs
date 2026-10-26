import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import playwright from '../../../app/node_modules/playwright/index.js'
import { rasterPdfRegion } from '../../../server/paper-canonical/pdfRegionRaster.mjs'
import { extractNck1PdfTextStructure } from '../../../server/paper-import/nck1PdfTextSourceAdapter.mjs'
import {
  NCK1_OCR_CONFIRMATION_SCHEMA_VERSION,
  buildNck1OcrSourceEvidence,
} from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { makeSyntheticNck1PdfFixture } from '../nck1-pdf-materialization-v1/fixture.mjs'

const FULL_PAGE = Object.freeze({ x: 0, y: 0, width: 1, height: 1 })

function pdfPageCount(bytes) {
  const temp = mkdtempSync(path.join(tmpdir(), 'eqb-nck1-ocr-pages-'))
  try {
    const filePath = path.join(temp, 'source.pdf')
    writeFileSync(filePath, bytes)
    const info = execFileSync('pdfinfo', [filePath], { encoding: 'utf8' })
    const count = Number(/^Pages:\s+(\d+)$/mu.exec(info)?.[1])
    if (!Number.isInteger(count) || count < 1) throw new Error('Synthetic OCR PDF page count is unavailable')
    return count
  } finally {
    rmSync(temp, { recursive: true, force: true })
  }
}

async function scannedPdf(browser, sourceDocument, { visualPage = null } = {}) {
  const pages = Array.from({ length: sourceDocument.pageCount }, (_, index) => {
    const page = index + 1
    const raster = rasterPdfRegion({
      pdfBytes: sourceDocument.bytes,
      page,
      region: FULL_PAGE,
      density: 144,
    })
    return {
      page,
      dataUrl: `data:image/png;base64,${Buffer.from(raster.bytes).toString('base64')}`,
    }
  })
  const page = await browser.newPage()
  try {
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      .page { position: relative; width: 210mm; height: 297mm; overflow: hidden; break-after: page; }
      .page:last-child { break-after: auto; }
      .page-image { display: block; width: 210mm; height: 297mm; }
      .synthetic-visual { position: absolute; right: 3mm; top: 3mm; width: 2mm; height: 2mm; background: #111; }
    </style></head><body>${pages.map(({ page: pageNumber, dataUrl }) =>
      `<section class="page"><img class="page-image" alt="" src="${dataUrl}">`
      + (pageNumber === visualPage ? '<i class="synthetic-visual"></i>' : '')
      + '</section>').join('')}</body></html>`, { waitUntil: 'load' })
    return new Uint8Array(await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    }))
  } finally {
    await page.close()
  }
}

function engineDocument(documentId, structure, visualPage = null) {
  const byPage = new Map()
  for (const [index, item] of structure.body.entries()) {
    if (item.kind !== 'paragraph' || item.sourceIndex?.kind !== 'page_region') continue
    const page = item.sourceIndex.page
    const items = byPage.get(page) || []
    items.push({ index, item })
    byPage.set(page, items)
  }
  const pageCount = Math.max(...byPage.keys())
  return {
    documentId,
    pages: Array.from({ length: pageCount }, (_, pageIndex) => {
      const page = pageIndex + 1
      const items = byPage.get(page) || []
      const observations = items.map(({ index, item }) => ({
        observationId: `${documentId}:observation-${index + 1}`,
        regionId: `${documentId}:text-${index + 1}`,
        region: structuredClone(item.sourceIndex.region),
        text: item.text,
        confidence: 0.995,
        alternatives: [],
      }))
      const regions = observations.map((observation) => ({
        regionId: observation.regionId,
        kind: 'text',
        region: structuredClone(observation.region),
      }))
      if (page === visualPage) {
        regions.push({
          regionId: `${documentId}:synthetic-visual`,
          kind: 'visual',
          region: { x: 0.974, y: 0.01, width: 0.01, height: 0.01 },
        })
      }
      return {
        page,
        regions,
        observations,
        readingOrderEdges: observations.slice(1).map((observation, index) => ({
          before: observations[index].observationId,
          after: observation.observationId,
        })),
      }
    }),
  }
}

function confirmationFor(paperId, evidence) {
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
          .map((region) => ({
            regionId: region.regionId,
            classification: 'furniture',
          })),
      })),
    })),
  }
}

function documentRecord(source, bytes) {
  return {
    ...source,
    sha256: sha256(bytes),
    byteLength: bytes.byteLength,
    pageCount: pdfPageCount(bytes),
    bytes,
  }
}

export function cloneJson(value) {
  return structuredClone(value)
}

export async function makeSyntheticNck1OcrFixture({
  paperId = 'paper-synthetic-ocr-evidence',
  crossPageParagraph = false,
} = {}) {
  const textFixture = await makeSyntheticNck1PdfFixture({
    includeTable: false,
    includeExtractionCases: false,
    crossPageParagraph,
  })
  const structures = textFixture.sourceDocuments.map((document) => ({
    documentId: document.documentId,
    structure: extractNck1PdfTextStructure(document.bytes, {
      documentId: document.documentId,
      expectedPageCount: document.pageCount,
    }),
  }))
  const questionVisualPage = Math.min(2, textFixture.sourceDocuments[0].pageCount)
  const browser = await playwright.chromium.launch({ headless: true, channel: 'chromium' })
  let sourceDocuments
  try {
    const questionBytes = await scannedPdf(browser, textFixture.sourceDocuments[0], {
      visualPage: questionVisualPage,
    })
    const answerBytes = await scannedPdf(browser, textFixture.sourceDocuments[1])
    sourceDocuments = [
      documentRecord(textFixture.sourceDocuments[0], questionBytes),
      documentRecord(textFixture.sourceDocuments[1], answerBytes),
    ]
  } finally {
    await browser.close()
  }
  const engineDocuments = structures.map(({ documentId, structure }) => engineDocument(
    documentId,
    structure,
    documentId === sourceDocuments[0].documentId ? questionVisualPage : null,
  ))
  const evidence = buildNck1OcrSourceEvidence({
    paperId,
    documents: sourceDocuments,
    engine: { name: 'synthetic-fixed-ocr', version: '1.0.0' },
    confidenceThreshold: 0.97,
    engineDocuments,
  })
  const confirmation = confirmationFor(paperId, evidence)
  const manifestDocuments = sourceDocuments.map(({ bytes: _bytes, ...document }) => document)
  return {
    paperId,
    sourceDocuments,
    evidence,
    confirmation,
    questionVisualPage,
    manifest: {
      schemaVersion: 'universal-nck1-source-manifest-v1',
      paperId,
      profileId: 'nck1',
      provenance: { paperName: 'Synthetic NCK1 OCR evidence', source: 'anonymous synthetic fixture' },
      documents: manifestDocuments,
      materializationPath: 'materialization/nck1-source-materialization-v1.json',
      mediaDirectory: 'materialization/media',
      canonicalRequestPath: 'canonical-evidence/canonical-import-request.json',
    },
  }
}
