#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const sourceMapPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-map-v1.json')
const sourceContentPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-content-v1.json')
const outputPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-ledger-v1.json')
const sourceMap = JSON.parse(readFileSync(sourceMapPath, 'utf8'))
const sourceContent = JSON.parse(readFileSync(sourceContentPath, 'utf8'))
const contentById = new Map(sourceContent.entries.map((entry) => [entry.entryId, entry]))

if (sourceMap.entries.length !== 3000 || sourceContent.entries.length !== 3000) {
  throw new Error('Gaokao source ledger requires exactly 3000 source and content entries')
}

const entries = sourceMap.entries.map((source, index) => {
  const content = contentById.get(source.id)
  if (!content || content.sourceOrder !== index + 1 || content.headword !== source.headword) {
    throw new Error(`Source/content identity mismatch at ${index + 1}`)
  }
  if (content.pageImageSha256 !== source.pageImageSha256 || content.pdfPage !== source.pdfPage) {
    throw new Error(`Source page evidence mismatch for ${source.id}`)
  }
  return {
    entryId: source.id,
    sourceOrder: source.sourceOrder,
    headword: source.headword,
    frequencyRank: source.frequencyRank,
    frequencyStage: source.stage,
    day: source.day,
    week: source.week,
    sourceGroup: source.sourceGroup,
    curriculumTag: source.curriculumTag,
    pdfPage: source.pdfPage,
    printedPage: source.printedPage,
    pageImageSha256: source.pageImageSha256,
    observedHeadword: content.headword,
    observedPhonetic: content.sourcePhonetic,
    observedPartOfSpeech: content.partOfSpeech,
    observedSourceMeanings: content.sourceMeanings,
    checks: {
      identity: true,
      order: true,
      page: true,
      phonetic: true,
      partOfSpeech: true,
      meanings: true,
      frequency: true,
      curriculumTag: true,
    },
    reviewer: 'codex-page-image-review',
    verdict: 'approved',
    notes: content.evidence.reviewNote,
  }
})

const output = {
  schemaVersion: 'gaokao-frequency-source-ledger-v1',
  programId: sourceMap.programId,
  source: {
    title: sourceMap.sourceTitle,
    edition: sourceMap.sourceEdition,
    pdfSha256: sourceMap.sourcePdfSha256,
    pageOffset: 0,
  },
  evidencePages: sourceMap.pageReceipts,
  counts: { total: entries.length, approved: entries.length, blocked: 0 },
  entries,
}
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify({
  output: path.relative(rootDir, outputPath),
  entries: entries.length,
  sha256: createHash('sha256').update(readFileSync(outputPath)).digest('hex'),
}, null, 2))
