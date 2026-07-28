import { readFileSync } from 'node:fs'

import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import {
  makeNck1ProfileInstructionEvidenceDocuments,
  makeReadyCanonicalFixture,
} from './foundationFixture.mjs'

const hashes = Object.freeze({
  sourcePdf: 'sha256:31a87069e6d530afba9123eec0487adf45e52e0b98530af80b62476f169e4d0f',
  paperAsset: 'sha256:fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
  answerKey: 'sha256:17502bb7685b83afc8847f3a44f8ac3c68defcb941ae75ba1ff14945c07daaf0',
  tableProof: 'sha256:bd12fcedbb71fb608210ffeaf84864c8aa3d9096a71d955cfd1e5db2aec53b35',
})

function readHashBoundBytes(url, expectedDigest) {
  const bytes = new Uint8Array(readFileSync(url))
  const actualDigest = sha256(bytes)
  if (actualDigest !== expectedDigest) throw new Error(`Reading reference drifted: expected ${expectedDigest}, received ${actualDigest}`)
  return bytes
}

function text(nodeId, value) {
  return { kind: 'text', nodeId, text: value }
}

function paragraph(nodeId, value) {
  return { kind: 'paragraph', nodeId, inlines: [text(`text:${nodeId}`, value)] }
}

function tableCell(row, column, value) {
  return {
    cellId: `cell:reading-a:events:${row}:${column}`,
    columnStart: column,
    columnSpan: 1,
    rowSpan: 1,
    role: 'data',
    inlines: [text(`text:reading-a:events:${row}:${column}`, value)],
  }
}

function eventTable() {
  const rows = [
    ['Los Angeles Rams v Dallas Cowboys', 'Saturday, August 9', '4:00 PM'],
    ['Los Angeles Chargers v New Orleans Saints', 'Sunday, August 10', '5:00 PM'],
    ['Los Angeles Chargers v Los Angeles Rams', 'Saturday, August 16', '4:00 PM'],
    ['Los Angeles Rams v Houston Texans', 'Sunday, August 24', '1:25 PM'],
  ]
  return {
    kind: 'table',
    nodeId: 'table:reading-a:events',
    columnCount: 3,
    rows: rows.map((values, row) => ({
      rowId: `row:reading-a:events:${row}`,
      cells: values.map((value, column) => tableCell(row, column, value)),
    })),
  }
}

function reviewedContentObservations(content, page) {
  const values = []
  const add = (id, value) => {
    if (typeof id === 'string') values.push({ id, value })
  }
  const addInlines = (inlines) => {
    for (const inline of inlines || []) add(inline.nodeId, inline)
  }
  for (const block of content.blocks) {
    add(block.nodeId, block)
    if (block.kind === 'table') {
      for (const row of block.rows) {
        add(row.rowId, row)
        for (const cell of row.cells) {
          add(cell.cellId, cell)
          addInlines(cell.inlines)
        }
      }
    } else {
      addInlines(block.kind === 'figure' ? block.caption : block.inlines)
    }
  }
  return values.map(({ id, value }, index) => ({
    target: { kind: 'content_node', id },
    page,
    region: {
      x: index % 2 === 0 ? 0.05 : 0.52,
      y: 0.03 + (index % 18) * 0.052,
      width: 0.43,
      height: 0.04,
    },
    review: { method: 'manual_transcription', status: 'accepted' },
    value,
  }))
}

function readingSourceCapture(paper) {
  const readingA = paper.content.groups['group-2026-i-reading-a']
  const readingC = paper.content.groups['group-2026-i-reading-c']
  const readingAContent = {
    blocks: [
      paragraph('paragraph:reading-a:title', 'SoFi Stadium Events This Month'),
      paragraph(readingA.passage.paragraphs[0].paragraphId, readingA.passage.paragraphs[0].text),
      paragraph(readingA.passage.paragraphs[1].paragraphId, readingA.passage.paragraphs[1].text),
      eventTable(),
      paragraph(readingA.passage.paragraphs[3].paragraphId, readingA.passage.paragraphs[3].text),
      paragraph(readingA.passage.paragraphs[4].paragraphId, readingA.passage.paragraphs[4].text),
      paragraph(readingA.passage.paragraphs[5].paragraphId, readingA.passage.paragraphs[5].text),
      paragraph(readingA.passage.paragraphs[6].paragraphId, readingA.passage.paragraphs[6].text),
    ],
  }
  const readingCContent = {
    blocks: readingC.passage.paragraphs.map((item) => paragraph(item.paragraphId, item.text)),
  }
  return {
    schemaVersion: 'reading-source-capture-v1',
    paperId: 'paper-2026-i',
    sourceDocumentDigest: hashes.sourcePdf,
    groups: {
      [readingA.groupId]: {
        groupId: readingA.groupId,
        slotId: 'reading.a',
        sourcePage: 4,
        visualProofDigest: hashes.tableProof,
        content: readingAContent,
        sourceObservations: reviewedContentObservations(readingAContent, 4),
        passageBlockRoles: [
          { nodeId: 'para-2026-i-reading-a-2', role: 'subtitle' },
          { nodeId: 'para-2026-i-reading-a-4', role: 'subtitle' },
          { nodeId: 'para-2026-i-reading-a-6', role: 'subtitle' },
          { nodeId: 'paragraph:reading-a:title', role: 'title' },
        ],
      },
      [readingC.groupId]: {
        groupId: readingC.groupId,
        slotId: 'reading.c',
        sourcePage: 6,
        visualProofDigest: null,
        content: readingCContent,
        sourceObservations: reviewedContentObservations(readingCContent, 6),
        passageBlockRoles: [],
      },
    },
  }
}

function removeReadingProofSlots(source) {
  const slots = new Set(['reading.a', 'reading.c'])
  const removed = source.groups.filter((group) => slots.has(group.slotId))
  const questionIds = new Set(removed.flatMap((group) => group.questionIds))
  const observationIds = new Set(removed.map((group) => `observation:${group.slotId}`))
  source.groups = source.groups.filter((group) => !slots.has(group.slotId))
  source.observations = source.observations.filter((observation) => !observationIds.has(observation.observationId))
  source.assertions = source.assertions.filter((assertion) => !questionIds.has(assertion.questionId))
}

export const readingReferenceHashes = hashes

export function makeReadingCanonicalReferenceFixture() {
  const baseUrl = new URL('../../app/public/paper-assets/paper-2026-i/latest/', import.meta.url)
  const paperAsset = readHashBoundBytes(new URL('paper-asset.json', baseUrl), hashes.paperAsset)
  const answerKey = readHashBoundBytes(new URL('answer-key.json', baseUrl), hashes.answerKey)
  const sourcePdf = readHashBoundBytes(new URL('../../scripts/import-pipeline/papers/paper-2026-i/source/paper.pdf', import.meta.url), hashes.sourcePdf)
  const tableProof = readHashBoundBytes(new URL('figures/reading-a-table-1.png', baseUrl), hashes.tableProof)
  const paper = JSON.parse(new TextDecoder().decode(paperAsset))
  const structuredReading = new TextEncoder().encode(JSON.stringify(readingSourceCapture(paper)))
  const fixture = makeReadyCanonicalFixture()
  const source = fixture.source
  source.paperId = 'paper-2026-i'
  removeReadingProofSlots(source)
  for (const observation of source.observations) observation.documentInputKey = 'canonical_mapping'
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(source)).byteLength
    for (const observation of source.observations) observation.span.end = mappingLength
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(source))
  return {
    paperId: source.paperId,
    source,
    sourceAsset: paperAsset,
    hashes,
    request: {
      authority: fixture.request.authority,
      evidence: {
        documents: [
          {
            inputKey: 'canonical_mapping',
            roles: ['operator_assertions'],
            bytes: mappingBytes,
            declared: { mediaType: 'application/vnd.eqb.canonical-fixture+json' },
          },
          {
            inputKey: 'paper_asset',
            roles: ['question_source'],
            bytes: paperAsset,
            declared: { mediaType: 'application/json', originalName: 'paper-asset.json' },
          },
          {
            inputKey: 'official_answers',
            roles: ['official_answer_source'],
            bytes: answerKey,
            declared: { mediaType: 'application/json', originalName: 'answer-key.json' },
          },
          {
            inputKey: 'reading_structure',
            roles: ['structured_source'],
            bytes: structuredReading,
            declared: { mediaType: 'application/json', originalName: 'reading-source-capture-v1.json' },
          },
          {
            inputKey: 'question_pdf',
            roles: ['question_source', 'source_provenance'],
            bytes: sourcePdf,
            declared: { mediaType: 'application/pdf', originalName: 'paper.pdf' },
          },
          {
            inputKey: 'table_visual_proof',
            roles: ['source_provenance'],
            bytes: tableProof,
            declared: { mediaType: 'image/png', originalName: 'reading-a-table-1.png' },
          },
          ...makeNck1ProfileInstructionEvidenceDocuments(source.paperId),
        ],
      },
    },
  }
}
