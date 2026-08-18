#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const source = readJson('data/vocabulary/gaokao-frequency-source-content-v1.json').entries
const goldenConcepts = readJson('data/vocabulary/gaokao-frequency-golden-visual-concepts-v1.json').entries
const goldenBindings = readJson('data/vocabulary/gaokao-frequency-golden-visual-bindings-v1.json').entries
const goldenLearning = readJson('data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json').entries
const conceptsById = new Map(goldenConcepts.map((entry) => [entry.entryId, entry]))
const bindingsById = new Map(goldenBindings.map((entry) => [entry.entryId, entry]))
const learningById = new Map(goldenLearning.map((entry) => [entry.entryId, entry]))
const outputPath = path.join(rootDir, 'data/vocabulary/gaokao-frequency-visual-concepts-v1.json')
const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')).entries : []
const completed = new Map(existing.map((entry) => [entry.entryId, entry]))

for (const [entryId, binding] of bindingsById) {
  const concept = conceptsById.get(entryId)
  const learning = learningById.get(entryId)
  if (!concept || !learning) throw new Error(`Incomplete golden visual seed for ${entryId}`)
  const example = binding.visualSentenceId
    ? learning.examples.find((candidate) => `candidate-${candidate.candidateId}` === binding.visualSentenceId)
    : null
  completed.set(entryId, {
    entryId,
    headword: binding.headword,
    preferredMode: binding.visualMode,
    teachingSense: binding.teachingSense,
    visualSentenceId: binding.visualSentenceId,
    sentence: example ? { ...example } : null,
    concept: concept.concept,
    searchQuery: concept.searchQuery,
    sceneQuery: binding.sceneQuery,
    proposedAlt: binding.asset.alt,
    rationale: binding.bindingRationale,
    goldenSeed: true,
  })
}

const ordered = source.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 'gaokao-frequency-visual-concepts-v2', model: 'deepseek-chat', entries: ordered }, null, 2)}\n`)
console.log(`seeded full visual concepts: ${ordered.length}/3000`)
