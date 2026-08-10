#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function argument(flag) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

const inputs = process.argv.flatMap((value, index, values) => value === '--input' && values[index + 1] ? [values[index + 1]] : [])
const output = argument('--output')
const sourcePdf = argument('--source-pdf')
const supplementPaths = process.argv.flatMap((value, index, values) => value === '--supplement' && values[index + 1] ? [values[index + 1]] : [])
assert.equal(inputs.length, 3, 'Pass exactly three --input ledger batch paths')
assert.ok(output, 'Pass --output for the assembled ledger')
assert.ok(sourcePdf, 'Pass --source-pdf for immutable source hashing')
const sourcePdfSha256 = createHash('sha256').update(readFileSync(path.resolve(sourcePdf))).digest('hex')

const sourceMap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json'), 'utf8'))
const batches = inputs.map((input) => JSON.parse(readFileSync(path.resolve(input), 'utf8')))
const entries = batches.flatMap((batch) => batch.entries).sort((left, right) => left.sourceOrder - right.sourceOrder)
const supplements = supplementPaths.map((supplementPath) => JSON.parse(readFileSync(path.resolve(supplementPath), 'utf8')))
assert.equal(entries.length, 1600)
assert.equal(new Set(entries.map((entry) => entry.entryId)).size, 1600)
assert.deepEqual(entries.map((entry) => entry.sourceOrder), Array.from({ length: 1600 }, (_, index) => index + 1))

for (const [index, entry] of entries.entries()) {
  const source = sourceMap.entries[index]
  assert.equal(entry.entryId, source.id)
  assert.equal(entry.headword, source.headword)
  assert.equal(entry.printedPage, source.printedPage)
  assert.equal(entry.pdfPage, source.printedPage + 17)
  assert.match(entry.pageImageSha256, /^[a-f0-9]{64}$/u)
  assert.equal(entry.checks.identity, true)
  assert.equal(entry.checks.order, true)
  assert.equal(entry.checks.page, true)
  assert.equal(entry.checks.phonetic, true)
  assert.equal(entry.checks.pos, true)
  assert.ok(entry.verdict === 'approved' || entry.verdict === 'blocked')
}

for (const supplement of supplements) {
  const entriesById = new Map(entries.map((entry) => [entry.entryId, entry]))
  for (const receipt of supplement.entries) {
    const entry = entriesById.get(receipt.entryId)
    assert.ok(entry, `Supplement entry is absent from the base ledger: ${receipt.entryId}`)
    assert.equal(entry.sourceOrder, receipt.sourceOrder)
    assert.equal(entry.headword, receipt.headword)
    if (receipt.verdict !== 'approved') continue
    assert.equal(entry.verdict, 'blocked', `Supplement approval must close a previously blocked entry: ${receipt.entryId}`)
    assert.ok(receipt.observedMeanings.length > 0)
    const evidence = receipt.evidence ?? receipt.answerEvidence
    assert.ok(evidence)
    entry.observedSourceMeanings = receipt.observedMeanings
    entry.checks.meanings = true
    entry.verdict = 'approved'
    entry.supplementalEvidence = {
      ...evidence,
      sourcePdfSha256: supplement.answerBook?.sha256 ?? sourcePdfSha256,
      sourceTitle: supplement.answerBook ? path.basename(supplement.answerBook.path) : path.basename(sourcePdf),
    }
    if (receipt.correction?.field === 'observedNumber') {
      assert.equal(entry.observedNumber, receipt.correction.previousObservedNumber)
      entry.observedNumber = receipt.correction.correctedObservedNumber
      const { pdfPath: _localPdfPath, ...sourceEvidence } = receipt.correction.sourceEvidence
      entry.sourceCorrection = { ...receipt.correction, sourceEvidence }
    }
    entry.notes = `${entry.notes} Supplement: ${receipt.notes}`
  }
}

const evidencePages = [...new Map([
  ...entries.map((entry) => [`${sourcePdfSha256}:${entry.pdfPage}`, {
    sourceTitle: path.basename(sourcePdf),
    sourcePdfSha256,
    printedPage: entry.printedPage,
    pdfPage: entry.pdfPage,
    pageImageSha256: entry.pageImageSha256,
  }]),
  ...entries.filter((entry) => entry.supplementalEvidence).map((entry) => [`${entry.supplementalEvidence.sourcePdfSha256}:${entry.supplementalEvidence.pdfPage}`, {
    sourceTitle: entry.supplementalEvidence.sourceTitle,
    sourcePdfSha256: entry.supplementalEvidence.sourcePdfSha256,
    printedPage: entry.supplementalEvidence.printedPage,
    pdfPage: entry.supplementalEvidence.pdfPage,
    pageImageSha256: entry.supplementalEvidence.pageImageSha256,
  }]),
]).values()]
for (const page of evidencePages) {
  const hashes = new Set([
    ...entries.filter((entry) => sourcePdfSha256 === page.sourcePdfSha256 && entry.pdfPage === page.pdfPage).map((entry) => entry.pageImageSha256),
    ...entries.filter((entry) => entry.supplementalEvidence?.sourcePdfSha256 === page.sourcePdfSha256 && entry.supplementalEvidence.pdfPage === page.pdfPage).map((entry) => entry.supplementalEvidence.pageImageSha256),
  ])
  assert.equal(hashes.size, 1, `${page.sourceTitle} page ${page.pdfPage} must have one image hash`)
}

const approved = entries.filter((entry) => entry.verdict === 'approved').length
const blocked = entries.length - approved
const artifact = {
  schemaVersion: 'wanwei-page-review-ledger-v1',
  source: {
    title: sourceMap.sourceTitle,
    edition: sourceMap.sourceEdition,
    pdfSha256: sourcePdfSha256,
    pageMapping: 'printedPage + 17 = pdfPage',
  },
  companionSources: supplements.filter((supplement) => supplement.answerBook).map((supplement) => ({
    title: path.basename(supplement.answerBook.path),
    pdfSha256: supplement.answerBook.sha256,
    pageCount: supplement.answerBook.pages,
    editionCorrespondence: supplement.editionCorrespondence,
  })),
  assembledAt: new Date().toISOString(),
  sourceBatches: inputs.map((input, index) => ({
    fileName: path.basename(input),
    sha256: createHash('sha256').update(readFileSync(path.resolve(input))).digest('hex'),
    reviewer: batches[index].reviewer,
    reviewedAt: batches[index].reviewedAt,
  })).concat(supplementPaths.map((supplementPath, index) => ({
    fileName: path.basename(supplementPath),
    sha256: createHash('sha256').update(readFileSync(path.resolve(supplementPath))).digest('hex'),
    reviewer: supplements[index].reviewer,
    reviewedAt: supplements[index].reviewedAt,
  }))),
  counts: { total: entries.length, approved, blocked, evidencePages: evidencePages.length },
  evidencePages,
  entries,
}

mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
writeFileSync(path.resolve(output), `${JSON.stringify(artifact, null, 2)}\n`)
console.log(JSON.stringify({ output: path.resolve(output), counts: artifact.counts }, null, 2))
