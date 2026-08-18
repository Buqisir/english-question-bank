#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))

const source = readJson('data/vocabulary/gaokao-frequency-source-content-v1.json').entries
const sourceIds = new Set(source.map((entry) => entry.entryId))
const targets = [
  {
    seed: 'data/vocabulary/gaokao-frequency-golden-learning-candidates-v1.json',
    output: 'data/vocabulary/gaokao-frequency-learning-candidates-v1.json',
    schemaVersion: 'gaokao-learning-candidates-v1',
  },
  {
    seed: 'data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json',
    output: 'data/vocabulary/gaokao-frequency-learning-reviewed-v1.json',
    schemaVersion: 'gaokao-learning-reviewed-v1',
  },
]

for (const target of targets) {
  const seedPayload = readJson(target.seed)
  const outputPath = path.join(rootDir, target.output)
  const existing = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, 'utf8')) : { entries: [] }
  const completed = new Map(existing.entries.map((entry) => [entry.entryId, entry]))
  for (const entry of seedPayload.entries) {
    if (!sourceIds.has(entry.entryId)) throw new Error(`Golden seed is outside full source: ${entry.entryId}`)
    completed.set(entry.entryId, entry)
  }
  const ordered = source.filter((entry) => completed.has(entry.entryId)).map((entry) => completed.get(entry.entryId))
  writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: target.schemaVersion, model: seedPayload.model, entries: ordered }, null, 2)}\n`)
  console.log(`seeded ${target.output}: ${ordered.length}/3000`)
}
