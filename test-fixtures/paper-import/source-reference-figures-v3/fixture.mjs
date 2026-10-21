import { makeFixture } from '../../../scripts/verify-nck1-source-materialization.mjs'
import { productPdfBytes } from '../frozen-products-v1/fixture.mjs'
import { digestJson, sha256 } from '../../../shared/paper-canonical/stable.mjs'
import { buildNck1OcrSourceEvidence } from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { captureSourceReferenceFigure } from '../../../server/paper-import/sourceReferenceImages.mjs'
import { prepareSourceReferences } from '../../../server/paper-import/sourceReferences.mjs'

// Invented OCR text on deterministic blank PDFs: tests evidence plumbing and
// exact crop replay, not OCR accuracy. Real page/figure quality is separate QA.
export function sourceReferenceFiguresFixture(materialization = makeFixture({ listening: false })) {
  const documents = materialization.documents.map(document => {
    const bytes = productPdfBytes(1, `Synthetic ${document.documentId}`)
    Object.assign(document, { sha256: sha256(bytes), byteLength: bytes.length, pageCount: 1 })
    return { ...document, bytes }
  })
  materialization.sourceCoverage.reviewedPages = [1]
  const answer = documents.find(document => document.role === 'official_answers')
  const figureRegion = { x: 0.7, y: 0.2, width: 0.12, height: 0.09 }
  const texts = ['This is my design for World Smile Day.', 'World Smile Day',
    'The design encourages kindness.', 'Another complete sample keeps its own words.']
  const regions = [
    { x: 0.1, y: 0.2, width: 0.5, height: 0.02 },
    { x: 0.71, y: 0.22, width: 0.1, height: 0.02 },
    { x: 0.1, y: 0.3, width: 0.5, height: 0.02 },
    { x: 0.1, y: 0.4, width: 0.5, height: 0.02 },
  ]
  const engineDocuments = documents.map(document => {
    const isAnswer = document === answer
    const observations = (isAnswer ? texts : ['Synthetic question evidence.']).map((text, index) => ({
      observationId: `${document.documentId}:word:${index}`, regionId: `${document.documentId}:text:${index}`,
      text, region: isAnswer ? regions[index] : regions[0], confidence: 1, alternatives: [],
    }))
    if (isAnswer) observations.unshift({ observationId: `${answer.documentId}:word:scope`,
      regionId: `${answer.documentId}:text:scope`, text: '第四部分 写作 第一节',
      region: { x: 0.1, y: 0.1, width: 0.5, height: 0.02 }, confidence: 1, alternatives: [] })
    return { documentId: document.documentId, pages: [{ page: 1,
      regions: [...observations.map(item => ({ regionId: item.regionId, kind: 'text', region: item.region })),
        ...(isAnswer ? [{ regionId: 'answers:figure:smile', kind: 'visual', region: figureRegion }] : [])],
      observations, readingOrderEdges: observations.slice(1).map((item, index) => ({
        before: observations[index].observationId, after: item.observationId,
      })),
    }] }
  })
  const evidence = buildNck1OcrSourceEvidence({ paperId: materialization.paperId, documents,
    engine: { name: 'synthetic-figure-fixture', version: '1' }, confidenceThreshold: 0.97, engineDocuments })
  const confirmation = {
    schemaVersion: 'nck1-ocr-source-confirmation-v3', paperId: materialization.paperId,
    sourceSetDigest: evidence.sourceSetDigest, evidenceDigest: evidence.evidenceDigest, confirmed: true,
    documents: engineDocuments.map(document => ({ documentId: document.documentId, pages: document.pages.map(page => ({
      page: page.page, orderedItems: page.observations.map(observation => ({
        itemId: observation.observationId.replace(':word:', ':item:'), observationIds: [observation.observationId], text: observation.text,
      })), furnitureObservationIds: [],
      visualClassifications: document.documentId === answer.documentId ? [{
        regionId: 'answers:figure:smile', classification: 'content_media',
        itemIds: [`${answer.documentId}:item:1`], afterItemId: `${answer.documentId}:item:0`,
      }] : [],
    })) })),
  }
  const sourceInput = { kind: 'nck1-source-materialization',
    documents: documents.map(({ documentId, bytes }) => ({ documentId, bytes })),
    materializationBytes: Buffer.from(JSON.stringify(materialization)), media: [],
    ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(evidence)),
      confirmationBytes: Buffer.from(JSON.stringify(confirmation)) } }
  const binding = { materialization, sourceInput, sourceDocuments: documents,
    sourceDigest: sha256('synthetic-source'), candidateDigest: sha256('synthetic-candidate') }
  const sourceReferences = prepareSourceReferences(binding)
  sourceReferences.schemaVersion = 'source-references-v3'
  const source = region => ({ documentSha256: answer.sha256, locator: {
    kind: 'page_region', documentId: answer.documentId, page: 1, region,
  } })
  for (const group of sourceReferences.groups) for (const kind of ['essays', 'scoring']) {
    group[kind] = { state: 'not_supplied', evidence: [source({ x: 0, y: 0, width: 1, height: 1 })], entries: [] }
  }
  const entries = [0, 3].map((index, entryIndex) => ({
    referenceId: `reference:sample:${entryIndex}`, authority: 'source_reference',
    sourceLabel: null, labelSource: null,
    paragraphs: (entryIndex === 0 ? [0, 2] : [3]).map(index => ({
      paragraphId: `paragraph:sample:${index}`, role: 'body', text: texts[index], source: source(regions[index]),
    })),
  }))
  entries[0].figures = [{ figureId: 'figure:smile', afterParagraphId: entries[0].paragraphs[0].paragraphId,
    source: source(figureRegion), sourceRegionId: 'answers:figure:smile',
    raster: captureSourceReferenceFigure({ pdfBytes: answer.bytes, page: 1, region: figureRegion }) }]
  sourceReferences.groups[0].essays = { state: 'captured', evidence: [], entries }
  return { ...binding, paperName: '合成源范文配图样张', sourceReferences, evidence, confirmation,
    materializationDigest: digestJson(materialization) }
}
