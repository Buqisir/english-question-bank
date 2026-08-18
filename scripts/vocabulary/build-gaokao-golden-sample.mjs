#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const content = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-source-content-v1.json'), 'utf8')).entries
const overlap = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-wanwei-overlap-audit-v1.json'), 'utf8')).entries
const selectedOrders = [
  1, 4, 26, 31, 74, 111, 123, 133, 265, 317,
  360, 392, 393, 451, 468, 491, 498, 529, 557, 564,
  587, 593, 598, 623, 643, 819, 862, 909, 978, 1016,
  1081, 1082, 1084, 1086, 1090, 1094, 1095, 1098, 1101, 1106,
  1107, 1110, 1112, 1113, 1116, 1118, 1130, 1189, 1194, 1203,
  1232, 1233, 1242, 1273, 1286, 1296, 1343, 1368, 1378, 1508,
  2001, 2002, 2004, 2006, 2011, 2012, 2018, 2020, 2025, 2027,
  2043, 2050, 2056, 2066, 2070, 2087, 2090, 2095, 2126, 2147,
  2156, 2168, 2284, 2285, 2296, 2342, 2409, 2495, 2739, 2916,
]
assert.equal(selectedOrders.length, 90)
assert.equal(new Set(selectedOrders).size, 90)
const contentByOrder = new Map(content.map((entry) => [entry.sourceOrder, entry]))
const overlapByOrder = new Map(overlap.map((entry) => [entry.sourceOrder, entry]))
const entries = selectedOrders.map((sourceOrder) => ({
  ...contentByOrder.get(sourceOrder),
  overlapCandidateEntryIds: overlapByOrder.get(sourceOrder).candidates.map((candidate) => candidate.sourceEntryId),
}))
for (const stage of ['high_frequency', 'mid_frequency', 'low_frequency']) {
  assert.equal(entries.filter((entry) => entry.frequencyStage === stage).length, 30)
}
for (const tag of ['initial', 'required', 'elective']) {
  assert.ok(entries.some((entry) => entry.curriculumTag === tag))
}
assert.ok(entries.some((entry) => entry.overlapCandidateEntryIds.length > 0))
assert.ok(entries.some((entry) => entry.overlapCandidateEntryIds.length === 0))
assert.ok(entries.some((entry) => /[,() .'-]/u.test(entry.headword)))
assert.ok(entries.some((entry) => entry.partOfSpeech.split(' ').length > 1))

const result = {
  schemaVersion: 'gaokao-frequency-golden-sample-v1',
  programId: 'gaokao-curriculum-3000-frequency-v1',
  selectionPolicy: 'Thirty source-bound entries per frequency stage, stratified across curriculum tags, overlap/new words, forms, phrases, homographs and long words.',
  entries,
}
writeFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-sample-v1.json'), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ entries: entries.length, stageCounts: Object.fromEntries(['high_frequency', 'mid_frequency', 'low_frequency'].map((stage) => [stage, entries.filter((entry) => entry.frequencyStage === stage).length])) }))
