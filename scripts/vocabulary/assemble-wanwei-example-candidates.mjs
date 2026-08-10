#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const rootDir = path.resolve(import.meta.dirname, '../..')
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (!value.startsWith('--') || index % 2 !== 0) return pairs
  pairs.push([value.slice(2), values[index + 1]])
  return pairs
}, []))
const batchDir = path.resolve(args.batchDir ?? '/private/tmp/eqb-vocabulary-example-reviewed-2026-08-10')
const outputPath = path.resolve(args.output ?? path.join(rootDir, 'data/vocabulary/wanwei-example-candidates-v1.json'))
const overridesPath = path.join(rootDir, 'data/vocabulary/wanwei-example-a-overrides-v1.json')
const reportOnly = args.reportOnly === 'true'
const files = readdirSync(batchDir).filter((name) => /^reviewed-\d{4}-\d{4}\.json$/u.test(name)).sort()
const db = new DatabaseSync(path.join(rootDir, 'data/question-bank.sqlite'), { readOnly: true })
const rows = db.prepare(`
  SELECT id, source_order, headword, teaching_sense,
    example_english, example_chinese, example_highlight, example_review_status
  FROM vocabulary_entries ORDER BY source_order
`).all()
db.close()
const overrideBytes = readFileSync(overridesPath)
const overrides = JSON.parse(overrideBytes)
const overridesByEntryId = new Map(overrides.entries.map((entry) => [entry.entryId, entry]))

const errors = []
const reviewedBatches = files.map((file) => {
  const bytes = readFileSync(path.join(batchDir, file))
  const artifact = JSON.parse(bytes.toString('utf8'))
  if (!artifact.independentReview || artifact.independentReview.status !== 'approved' || !String(artifact.independentReview.reviewer ?? '').trim()) {
    errors.push(`${file} missing approved independentReview`)
  }
  return { file, bytes, artifact }
})
const entries = reviewedBatches.flatMap(({ artifact }) => Array.isArray(artifact.entries) ? artifact.entries : [])
const byOrder = new Map()
const sentenceOwners = new Map()
const emojiPattern = /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u

if (rows.length !== 1600) errors.push(`question-bank.sqlite has ${rows.length} vocabulary entries, expected 1600`)
for (const entry of entries) {
  if (!Number.isInteger(entry.sourceOrder) || byOrder.has(entry.sourceOrder)) {
    errors.push(`duplicate or invalid sourceOrder ${entry.sourceOrder}`)
    continue
  }
  byOrder.set(entry.sourceOrder, entry)
}

for (let sourceOrder = 1; sourceOrder <= 1600; sourceOrder += 1) {
  const row = rows[sourceOrder - 1]
  const entry = byOrder.get(sourceOrder)
  if (!entry) {
    errors.push(`missing sourceOrder ${sourceOrder}`)
    continue
  }
  if (!row || entry.entryId !== row.id || entry.headword !== row.headword || entry.teachingSense !== row.teaching_sense) {
    errors.push(`identity or teachingSense mismatch at sourceOrder ${sourceOrder}`)
    continue
  }
  if (!Array.isArray(entry.candidates) || entry.candidates.length !== 3) {
    errors.push(`sourceOrder ${sourceOrder} must have exactly 3 candidates`)
    continue
  }
  if (entry.candidates.map((candidate) => candidate.candidateId).join(',') !== 'a,b,c') {
    errors.push(`sourceOrder ${sourceOrder} candidate ids must be a,b,c`)
  }
  for (const candidate of entry.candidates) {
    const label = `${sourceOrder}/${candidate.candidateId ?? '?'}`
    for (const key of ['version', 'teachingSense', 'english', 'chinese', 'highlight']) {
      if (!String(candidate[key] ?? '').trim()) errors.push(`${label} missing ${key}`)
    }
    if (candidate.version !== 'wanwei-examples-v1') errors.push(`${label} version mismatch`)
    if (candidate.teachingSense !== row.teaching_sense) errors.push(`${label} teachingSense mismatch`)
    if (candidate.reviewStatus !== 'approved') errors.push(`${label} is not approved`)
    if (!String(candidate.english ?? '').includes(String(candidate.highlight ?? ''))) errors.push(`${label} highlight mismatch`)
    if (emojiPattern.test(JSON.stringify(candidate))) errors.push(`${label} contains emoji`)
    const sentenceKey = String(candidate.english ?? '').trim().toLocaleLowerCase('en-US')
    if (sentenceOwners.has(sentenceKey)) errors.push(`${label} duplicates ${sentenceOwners.get(sentenceKey)}`)
    else sentenceOwners.set(sentenceKey, label)
  }
  const candidateA = entry.candidates[0]
  const candidateAChanged = (
    candidateA.english !== row.example_english
    || candidateA.chinese !== row.example_chinese
    || candidateA.highlight !== row.example_highlight
    || candidateA.reviewStatus !== row.example_review_status
  )
  if (candidateAChanged) {
    const override = overridesByEntryId.get(row.id)
    const matchesApprovedOverride = override
      && override.sourceOrder === sourceOrder
      && JSON.stringify(override.original) === JSON.stringify({
        english: row.example_english,
        chinese: row.example_chinese,
        highlight: row.example_highlight,
        reviewStatus: row.example_review_status,
      })
      && JSON.stringify(override.replacement) === JSON.stringify({
        english: candidateA.english,
        chinese: candidateA.chinese,
        highlight: candidateA.highlight,
        reviewStatus: candidateA.reviewStatus,
      })
      && String(override.ownerApprovedAt ?? '').trim() !== ''
    if (!matchesApprovedOverride) errors.push(`sourceOrder ${sourceOrder} candidate A changed without an approved safety override`)
  }
}

const report = {
  schemaVersion: 'wanwei-example-candidates-assembly-report-v1',
  batchFiles: files.length,
  entryCount: entries.length,
  uniqueEntryCount: byOrder.size,
  candidateCount: entries.reduce((total, entry) => total + (Array.isArray(entry.candidates) ? entry.candidates.length : 0), 0),
  uniqueEnglishCount: sentenceOwners.size,
  errors,
}

if (errors.length || reportOnly) {
  console.log(JSON.stringify(report, null, 2))
  if (errors.length) process.exitCode = 1
} else {
  const artifact = {
    schemaVersion: 'wanwei-example-candidates-v1',
    programId: 'wanwei-round-one-v1',
    version: 'wanwei-examples-v1',
    approvedCandidateAOverrides: {
      path: 'data/vocabulary/wanwei-example-a-overrides-v1.json',
      sha256: createHash('sha256').update(overrideBytes).digest('hex'),
      count: overrides.entries.length,
    },
    sourceBatches: reviewedBatches.map(({ file, bytes, artifact }) => ({
      file,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      reviewer: artifact.independentReview.reviewer,
      status: artifact.independentReview.status,
    })),
    entries: [...byOrder.values()].sort((left, right) => left.sourceOrder - right.sourceOrder),
  }
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`)
  const bytes = readFileSync(outputPath)
  console.log(JSON.stringify({
    ...report,
    outputPath,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }, null, 2))
}
