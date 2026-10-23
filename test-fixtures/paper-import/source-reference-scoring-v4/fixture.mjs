import { makeFixture } from '../../../scripts/verify-nck1-source-materialization.mjs'
import { sha256, digestJson } from '../../../shared/paper-canonical/stable.mjs'
import { buildNck1OcrSourceEvidence } from '../../../server/paper-import/nck1OcrSourceEvidence.mjs'
import { buildSourceReferences } from '../../../scripts/import-pipeline/ocr-proofread.mjs'

// Original chart ink, independent of the crop implementation. Quarter-size
// pages preserve normalized page geometry while bounding fixture raster cost.
function scoringPdfBytes(pages) {
  const chart = (y, label) => `q 0.94 g 12 ${y} 110 16 re f 0 G 0.5 w 12 ${y} 110 16 re S
12 ${y + 8} m 122 ${y + 8} l S 40 ${y} m 40 ${y + 16} l S
0 g BT /F1 5 Tf 15 ${y + 10} Td (${label}) Tj ET
BT /F1 5 Tf 45 ${y + 2} Td (Complete / clear links) Tj ET Q`
  const content = `${chart(126, '5 / 3 / 0')}\n${chart(78, '2 / 1 / 0')}\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pages} /Kids [${Array.from({ length: pages }, (_, i) => `${i + 3} 0 R`).join(' ')}] >>`,
    ...Array.from({ length: pages }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 149 211] /Resources << /Font << /F1 ${pages + 4} 0 R >> >> /Contents ${pages + 3} 0 R >>`),
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
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

// Original short synthetic rows mirror four-school answer p03 figure-4
// (scoring heading) and p04 figure-5 (continued criteria), never its passages.
export function scoringFiguresFixture({ table = false, reverseVisuals = false, labelFirst = false, essays = true,
  materialization = makeFixture({ listening: false }) } = {}) {
  const documents = materialization.documents.map(document => {
    const pages = document.role === 'official_answers' ? 4 : 1
    const bytes = scoringPdfBytes(pages)
    Object.assign(document, { sha256: sha256(bytes), byteLength: bytes.length, pageCount: pages })
    return { ...document, bytes }
  })
  const answers = documents.find(document => document.role === 'official_answers')
  materialization.sourceCoverage.reviewedPages = [1]
  const rows = (document, page) => document.documentId !== answers.documentId || page < 3
    ? [['Synthetic source index.', .1]]
    : page === 3 ? [
      ['第四部分 写作（满分40分）\n第一节', .1],
      ...(essays ? [['参考范文', .14], ['Our original sample is short.', .18]] : []),
      ['评分标准', .23], ...(table ? [['内容', .27, .1, .3], ['要求', .27, .5, .3]]
        : labelFirst ? [] : [['二、各档次的给分范围和要求', .27]]),
      ['Synthetic p03 scoring chart', .33],
      ['3. Additional source criterion.', .5], ['Second synthetic chart', .56],
      ['4. Closing source criterion.', .7],
    ] : [
      ['第二节 读后续写', .1],
      ...(essays ? [['参考范文', .14], ['Another original sample.', .18]] : []),
      ['评分标准', .23], ['—Use clear links between ideas.', .27],
      ['Synthetic p04 scoring chart', .33], ['6. Closing source criterion.', .5],
    ]
  const engineDocuments = documents.map(document => ({ documentId: document.documentId,
    pages: Array.from({ length: document.pageCount }, (_, index) => {
      const page = index + 1
      const observations = rows(document, page).map(([text, y, x = .1, width = .7], i) => ({
        observationId: `${document.documentId}:p${page}:w${i}`, regionId: `${document.documentId}:p${page}:text${i}`,
        text, region: { x, y, width, height: .02 }, confidence: 1, alternatives: [],
      }))
      const visualRegions = document === answers && page >= 3 ? [
        { regionId: `${answers.documentId}:page-${page}:figure-${page + 1}`, kind: 'visual',
          region: { x: .08, y: .32, width: .75, height: .09 } },
        ...(page === 3 ? [{ regionId: `${answers.documentId}:page-3:figure-extra`, kind: 'visual',
          region: { x: .08, y: .55, width: .75, height: .09 } },
          ...(table ? [{ regionId: `${answers.documentId}:page-3:table-1`, kind: 'visual',
            region: { x: .08, y: .26, width: .75, height: .05 } }] : [])] : []),
      ] : []
      return { page, observations, regions: [
        ...observations.map(observation => ({ regionId: observation.regionId, kind: 'text', region: observation.region })),
        ...visualRegions,
      ], readingOrderEdges: observations.slice(1).map((observation, i) => ({
        before: observations[i].observationId, after: observation.observationId,
      })) }
    }) }))
  const evidence = buildNck1OcrSourceEvidence({ paperId: materialization.paperId, documents,
    engine: { name: 'synthetic-scoring-page-fixture', version: '1' }, confidenceThreshold: .97, engineDocuments })
  const confirmation = { schemaVersion: 'nck1-ocr-source-confirmation-v3',
    paperId: materialization.paperId, confirmed: true, sourceSetDigest: evidence.sourceSetDigest,
    evidenceDigest: evidence.evidenceDigest,
    documents: engineDocuments.map(document => ({ documentId: document.documentId,
      pages: document.pages.map(page => {
        const orderedItems = page.observations.map(observation => ({
          itemId: observation.observationId.replace(':w', ':i'), observationIds: [observation.observationId],
          text: observation.text,
        }))
        const visualClassifications = page.regions.filter(region => region.kind === 'visual').map(region => {
          if (region.regionId.endsWith('table-1')) {
            const first = orderedItems.findIndex(item => item.text === '内容')
            return { regionId: region.regionId, classification: 'semantic_table',
              rows: [{ header: false, cells: [[orderedItems[first].itemId], [orderedItems[first + 1].itemId]] }] }
          }
          const i = page.observations.findIndex(observation => observation.region.y > region.region.y
            && observation.region.y < region.region.y + region.region.height)
          return { regionId: region.regionId, classification: 'content_media',
            itemIds: [orderedItems[i].itemId], afterItemId: orderedItems[i - 1].itemId }
        })
        return { page: page.page, orderedItems, furnitureObservationIds: [],
          visualClassifications: reverseVisuals ? visualClassifications.reverse() : visualClassifications }
      }) })) }
  const sourceInput = { kind: 'nck1-source-materialization',
    documents: documents.map(({ documentId, bytes }) => ({ documentId, bytes })),
    materializationBytes: Buffer.from(JSON.stringify(materialization)), media: [],
    ocrSourceBytes: { evidenceBytes: Buffer.from(JSON.stringify(evidence)),
      confirmationBytes: Buffer.from(JSON.stringify(confirmation)) } }
  return { materialization, sourceDocuments: documents, sourceInput, evidence, confirmation,
    paperName: '合成评分图样张：p03 与 p04', sourceDigest: sha256('synthetic-scoring-source'),
    candidateDigest: sha256('synthetic-scoring-candidate') }
}

export function captureScoringReferences(input) {
  const captured = buildSourceReferences(input.materialization, input.evidence, input.confirmation,
    { sourceDocuments: input.sourceDocuments })
  return { schemaVersion: captured.schemaVersion, paperId: input.materialization.paperId,
    sourceDigest: input.sourceDigest, candidateDigest: input.candidateDigest,
    materializationDigest: digestJson(input.materialization), groups: captured.groups }
}
