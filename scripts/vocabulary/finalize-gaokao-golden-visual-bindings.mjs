#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const writeJson = (relativePath, value) => writeFileSync(
  path.join(rootDir, relativePath),
  `${JSON.stringify(value, null, 2)}\n`,
)

const sample = readJson('data/vocabulary/gaokao-frequency-golden-sample-v1.json').entries
const learning = readJson('data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json').entries
const fullManifest = readJson('data/vocabulary/gaokao-frequency-visual-manifest-v1.json')
const fullBindings = readJson('data/vocabulary/gaokao-frequency-visual-bindings-v1.json')
const sampleIds = sample.map((entry) => entry.entryId)
const manifestById = new Map(fullManifest.entries.map((entry) => [entry.entryId, entry]))
const bindingById = new Map(fullBindings.entries.map((entry) => [entry.entryId, entry]))
const learningById = new Map(learning.map((entry) => [entry.entryId, entry]))

if (sampleIds.length !== 90 || new Set(sampleIds).size !== 90) {
  throw new Error('Golden sample must contain exactly 90 unique entries')
}
if (fullManifest.status !== 'subagent_visual_qa_pass' || fullBindings.status !== 'subagent_visual_qa_pass') {
  throw new Error('Full visual artifacts must pass Subagent QA before the golden subset can be synchronized')
}

const manifestEntries = sampleIds.map((entryId) => {
  const entry = manifestById.get(entryId)
  if (!entry) throw new Error(`Missing full visual manifest entry ${entryId}`)
  return entry
})
const bindingEntries = sampleIds.map((entryId) => {
  const entry = bindingById.get(entryId)
  if (!entry) throw new Error(`Missing full visual binding ${entryId}`)
  return entry
})
const selectionEntries = manifestEntries.map((entry) => {
  const content = learningById.get(entry.entryId)
  if (!content) throw new Error(`Missing golden learning entry ${entry.entryId}`)
  return {
    entryId: entry.entryId,
    headword: entry.headword,
    visualKey: entry.visualKey,
    slug: entry.slug,
    width: entry.width,
    height: entry.height,
    path: entry.path,
    teachingSenses: content.teachingSenses,
  }
})
const summary = {
  entries: bindingEntries.length,
  directSense: bindingEntries.filter((entry) => entry.visualMode === 'direct-sense').length,
  sentenceScene: bindingEntries.filter((entry) => entry.visualMode === 'sentence-scene').length,
  composedOriginals: bindingEntries.filter((entry) => entry.asset.provenanceType === 'koboyo-composed-originals').length,
  visualGap: 0,
}

writeJson('data/vocabulary/gaokao-frequency-golden-visual-selection-v1.json', {
  schemaVersion: 'gaokao-frequency-visual-selection-v1',
  version: fullManifest.version,
  status: fullManifest.status,
  entries: selectionEntries,
})
writeJson('data/vocabulary/gaokao-frequency-golden-visual-manifest-v1.json', {
  ...fullManifest,
  summary,
  entries: manifestEntries,
})
writeJson('data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json', {
  ...fullBindings,
  summary,
  entries: bindingEntries,
})

console.log(`Synchronized ${manifestEntries.length} golden visuals from the Subagent-approved full manifest`)
