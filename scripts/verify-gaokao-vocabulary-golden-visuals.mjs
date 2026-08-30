#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

const sample = readJson('data/vocabulary/gaokao-frequency-golden-sample-v1.json').entries
const learning = readJson('data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json').entries
const selection = readJson('data/vocabulary/gaokao-frequency-golden-visual-selection-v1.json')
const goldenManifest = readJson('data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json')
const goldenBindings = readJson('data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json')
const fullManifest = readJson('data/vocabulary/gaokao-frequency-visual-manifest-v1.json')
const fullBindings = readJson('data/vocabulary/gaokao-frequency-visual-bindings-v1.json')
const sampleIds = sample.map((entry) => entry.entryId)
const learningById = new Map(learning.map((entry) => [entry.entryId, entry]))
const fullManifestById = new Map(fullManifest.entries.map((entry) => [entry.entryId, entry]))
const fullBindingsById = new Map(fullBindings.entries.map((entry) => [entry.entryId, entry]))

assert.equal(sampleIds.length, 90, 'golden sample must contain exactly 90 entries')
assert.equal(new Set(sampleIds).size, 90, 'golden sample entry IDs must be unique')
assert.equal(fullManifest.status, 'subagent_visual_qa_pass', 'full visual manifest must pass Subagent QA')
assert.equal(fullBindings.status, 'subagent_visual_qa_pass', 'full visual bindings must pass Subagent QA')
assert.equal(goldenManifest.status, fullManifest.status, 'golden manifest QA status drifted from the full manifest')
assert.equal(goldenBindings.status, fullBindings.status, 'golden binding QA status drifted from the full bindings')
assert.deepEqual(goldenManifest.entries, sampleIds.map((entryId) => fullManifestById.get(entryId)), 'golden manifest is not an exact full-manifest subset')
assert.deepEqual(goldenBindings.entries, sampleIds.map((entryId) => fullBindingsById.get(entryId)), 'golden bindings are not an exact full-binding subset')

assert.deepEqual(selection.entries, goldenManifest.entries.map((entry) => ({
  entryId: entry.entryId,
  headword: entry.headword,
  visualKey: entry.visualKey,
  slug: entry.slug,
  width: entry.width,
  height: entry.height,
  path: entry.path,
  teachingSenses: learningById.get(entry.entryId)?.teachingSenses,
})), 'golden selection drifted from the approved manifest subset')

for (const entry of goldenManifest.entries) {
  const filePath = path.join(rootDir, 'app/public', entry.path.slice(1))
  const bytes = readFileSync(filePath)
  assert.equal(sha256(bytes), entry.sha256, `visual hash mismatch for ${entry.entryId}`)
}

const directSense = goldenBindings.entries.filter((entry) => entry.visualMode === 'direct-sense').length
const sentenceScene = goldenBindings.entries.filter((entry) => entry.visualMode === 'sentence-scene').length
const composedOriginals = goldenBindings.entries.filter((entry) => entry.asset.provenanceType === 'koboyo-composed-originals').length
assert.deepEqual(goldenManifest.summary, {
  entries: 90,
  directSense,
  sentenceScene,
  composedOriginals,
  visualGap: 0,
}, 'golden manifest summary drifted')
assert.deepEqual(goldenBindings.summary, goldenManifest.summary, 'golden binding summary drifted')

console.log(`PASS gaokao golden visuals: 90 entries exactly match the Subagent-approved full manifest (${directSense} direct, ${sentenceScene} sentence-scene, ${composedOriginals} composed)`)
