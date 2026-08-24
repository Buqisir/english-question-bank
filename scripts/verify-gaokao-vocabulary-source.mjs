#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceMap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-map-v1.json'), 'utf8'))
const sourceContent = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-content-v1.json'), 'utf8'))
const sourceLedger = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-ledger-v1.json'), 'utf8'))
const expectedPdfSha = 'c170bac21049be80115c22974cd029f10921dad675653131e5754681485cb4bb'

assert.equal(sourceMap.programId, 'gaokao-curriculum-3000-frequency-v1')
assert.equal(sourceMap.sourcePdfSha256, expectedPdfSha)
assert.equal(sourceContent.sourcePdfSha256, expectedPdfSha)
assert.equal(sourceMap.entries.length, 3_000)
assert.equal(sourceContent.entries.length, 3_000)
assert.equal(sourceLedger.source.pdfSha256, expectedPdfSha)
assert.deepEqual(sourceLedger.counts, { total: 3_000, approved: 3_000, blocked: 0 })
assert.equal(sourceLedger.evidencePages.length, 53)
assert.equal(sourceLedger.entries.length, 3_000)

const orders = sourceMap.entries.map((entry) => entry.sourceOrder)
assert.deepEqual(orders, Array.from({ length: 3_000 }, (_, index) => index + 1))
assert.equal(new Set(sourceMap.entries.map((entry) => entry.id)).size, 3_000)
assert.equal(new Set(sourceMap.entries.map((entry) => entry.frequencyRank)).size, 3_000)

const expectedStageCounts = { high_frequency: 1_080, mid_frequency: 920, low_frequency: 1_000 }
const actualStageCounts = Object.fromEntries(Object.keys(expectedStageCounts).map((stage) => [
  stage,
  sourceMap.entries.filter((entry) => entry.stage === stage).length,
]))
assert.deepEqual(actualStageCounts, expectedStageCounts)

const expectedTagCounts = { initial: 1_501, required: 499, elective: 1_000 }
const actualTagCounts = Object.fromEntries(Object.keys(expectedTagCounts).map((tag) => [
  tag,
  sourceMap.entries.filter((entry) => entry.curriculumTag === tag).length,
]))
assert.deepEqual(actualTagCounts, expectedTagCounts)

const expectedDayLoad = (day) => day <= 18 ? 60 : day <= 41 ? 40 : 50
for (let day = 1; day <= 61; day += 1) {
  const entries = sourceMap.entries.filter((entry) => entry.day === day)
  assert.equal(entries.length, expectedDayLoad(day), `Day ${day} load`)
  assert.ok(entries.every((entry) => entry.week === Math.ceil(day / 5)), `Day ${day} week mapping`)
}
assert.deepEqual([...new Set(sourceMap.entries.map((entry) => entry.sourceGroup))], Array.from({ length: 182 }, (_, index) => index + 1))
assert.deepEqual([...new Set(sourceMap.entries.map((entry) => entry.pdfPage))], Array.from({ length: 53 }, (_, index) => index + 2))

for (let index = 0; index < 3_000; index += 1) {
  const identity = sourceMap.entries[index]
  const content = sourceContent.entries[index]
  const receipt = sourceLedger.entries[index]
  assert.equal(content.entryId, identity.id)
  assert.equal(content.sourceOrder, identity.sourceOrder)
  assert.equal(content.headword, identity.headword)
  assert.ok(content.sourcePhonetic.startsWith('/'))
  assert.ok(content.partOfSpeech.length > 0)
  assert.ok(content.sourceMeanings.length > 0)
  assert.ok(content.sourceMeanings.every((meaning) => /[\u4e00-\u9fff]/u.test(meaning)))
  assert.equal(content.pageImageSha256, identity.pageImageSha256)
  assert.equal(content.evidence.headwordChecked, true)
  assert.equal(content.evidence.frequencyChecked, true)
  assert.equal(content.evidence.curriculumTagChecked, true)
  assert.equal(receipt.entryId, identity.id)
  assert.equal(receipt.sourceOrder, identity.sourceOrder)
  assert.equal(receipt.pageImageSha256, identity.pageImageSha256)
  assert.equal(receipt.observedHeadword, identity.headword)
  assert.equal(receipt.observedPhonetic, content.sourcePhonetic)
  assert.equal(receipt.observedPartOfSpeech, content.partOfSpeech)
  assert.deepEqual(receipt.observedSourceMeanings, content.sourceMeanings)
  assert.ok(Object.values(receipt.checks).every(Boolean))
  assert.equal(receipt.verdict, 'approved')
}

console.log('PASS gaokao vocabulary source: 3000 entries, 61 days, 13 weeks, 182 groups')
