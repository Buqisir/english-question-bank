#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '../..')
const sourceMapPath = path.join(rootDir, 'data/vocabulary/wanwei-round-one-source-map-v1.json')
const batchesFlag = process.argv.indexOf('--batches-dir')
const outputFlag = process.argv.indexOf('--output')
const overridesFlag = process.argv.indexOf('--example-overrides')
const prefixFlag = process.argv.indexOf('--file-prefix')
const allowCandidates = process.argv.includes('--allow-candidates')
const remapIdentities = process.argv.includes('--remap-identities')
const reportOnly = process.argv.includes('--report-only')
const batchesDir = batchesFlag >= 0 ? path.resolve(process.argv[batchesFlag + 1]) : null
const outputPath = outputFlag >= 0 ? path.resolve(process.argv[outputFlag + 1]) : null
const overridesPath = overridesFlag >= 0 ? path.resolve(process.argv[overridesFlag + 1]) : null
const filePrefix = prefixFlag >= 0 ? process.argv[prefixFlag + 1] : ''

if (!batchesDir) throw new Error('Expected --batches-dir <path>')
if (!reportOnly && !outputPath) throw new Error('Expected --output <path> unless --report-only is used')

const sourceMap = JSON.parse(readFileSync(sourceMapPath, 'utf8'))
const sourceByOrder = new Map(sourceMap.entries.map((entry) => [entry.sourceOrder, entry]))
const sourceByHeadword = new Map(sourceMap.entries.map((entry) => [entry.headword, entry]))
const emojiPattern = /\p{Extended_Pictographic}/u
const entriesByOrder = new Map()
const errors = []

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${label} must be non-empty text`)
}

function validateEntry(entry, fileName) {
  const prefix = `${fileName}#${entry?.sourceOrder ?? '?'}`
  const sourceAtOrder = sourceByOrder.get(entry?.sourceOrder)
  const source = remapIdentities ? sourceByHeadword.get(entry?.headword) : sourceAtOrder
  if (!source) {
    errors.push(`${prefix} has unknown sourceOrder`)
    return
  }
  if (entriesByOrder.has(source.sourceOrder)) errors.push(`${prefix} duplicates sourceOrder ${source.sourceOrder}`)
  if (!remapIdentities && entry.id !== source.id) errors.push(`${prefix} id disagrees with source map`)
  if (entry.headword !== source.headword) errors.push(`${prefix} headword disagrees with source map`)
  requireText(entry.phonetic, `${prefix}.phonetic`)
  if (typeof entry.phonetic === 'string' && !/^\/.+\/$/u.test(entry.phonetic)) {
    errors.push(`${prefix}.phonetic must be wrapped in slashes`)
  }
  requireText(entry.partOfSpeech, `${prefix}.partOfSpeech`)
  if (!Array.isArray(entry.sourceMeanings) || entry.sourceMeanings.length < 1 || entry.sourceMeanings.length > 4) {
    errors.push(`${prefix}.sourceMeanings must contain 1-4 meanings`)
  } else {
    entry.sourceMeanings.forEach((meaning, index) => requireText(meaning, `${prefix}.sourceMeanings[${index}]`))
  }
  requireText(entry.teachingSense, `${prefix}.teachingSense`)
  if (!['syllables', 'forms'].includes(entry.pronunciationMode)) {
    errors.push(`${prefix}.pronunciationMode is invalid`)
  }
  if (!Array.isArray(entry.syllables) || entry.syllables.length === 0) {
    errors.push(`${prefix}.syllables must not be empty`)
  } else {
    entry.syllables.forEach((part, index) => {
      requireText(part?.spelling, `${prefix}.syllables[${index}].spelling`)
      requireText(part?.phonetic, `${prefix}.syllables[${index}].phonetic`)
    })
    if (entry.pronunciationMode === 'syllables' && !/[/(=]/u.test(entry.headword)) {
      const normalizedHeadword = entry.headword.toLowerCase().replace(/[^a-z]/gu, '')
      const normalizedParts = entry.syllables
        .map((part) => part?.spelling ?? '')
        .join('')
        .toLowerCase()
        .replace(/[^a-z]/gu, '')
      if (normalizedHeadword !== normalizedParts) {
        errors.push(`${prefix}.syllables spelling does not reconstruct the headword`)
      }
    }
  }
  for (const key of ['english', 'chinese', 'highlight']) requireText(entry.example?.[key], `${prefix}.example.${key}`)
  if (typeof entry.example?.english === 'string' && typeof entry.example?.highlight === 'string'
      && !entry.example.english.includes(entry.example.highlight)) {
    errors.push(`${prefix}.example.highlight is not an exact sentence substring`)
  }
  if (!allowCandidates && entry.example?.reviewStatus !== 'approved') {
    errors.push(`${prefix}.example.reviewStatus must be approved`)
  }
  if (emojiPattern.test(JSON.stringify(entry))) errors.push(`${prefix} contains an emoji`)
  entriesByOrder.set(source.sourceOrder, {
    ...entry,
    id: source.id,
    sourceOrder: source.sourceOrder,
  })
}

if (!existsSync(batchesDir)) throw new Error(`Batch directory does not exist: ${batchesDir}`)
const batchFiles = readdirSync(batchesDir)
  .filter((name) => name.endsWith('.json') && name.startsWith(filePrefix))
  .sort()
for (const fileName of batchFiles) {
  const artifact = JSON.parse(readFileSync(path.join(batchesDir, fileName), 'utf8'))
  if (!Array.isArray(artifact.entries)) {
    errors.push(`${fileName} has no entries array`)
    continue
  }
  artifact.entries.forEach((entry) => validateEntry(entry, fileName))
}

const missingOrders = sourceMap.entries
  .map((entry) => entry.sourceOrder)
  .filter((sourceOrder) => sourceOrder > 30 && !entriesByOrder.has(sourceOrder))
if (overridesPath) {
  const artifact = JSON.parse(readFileSync(overridesPath, 'utf8'))
  if (!Array.isArray(artifact.entries)) errors.push('Example overrides have no entries array')
  else for (const override of artifact.entries) {
    const source = sourceByHeadword.get(override.headword)
    const entry = source ? entriesByOrder.get(source.sourceOrder) : null
    const prefix = `example override ${override.headword ?? '?'}`
    if (!source || !entry) {
      errors.push(`${prefix} does not identify a reviewed entry`)
      continue
    }
    if (override.sourceOrder !== source.sourceOrder) errors.push(`${prefix} sourceOrder disagrees with source map`)
    for (const key of ['english', 'chinese', 'highlight']) requireText(override.example?.[key], `${prefix}.${key}`)
    if (override.example?.reviewStatus !== 'approved') errors.push(`${prefix} is not approved`)
    if (typeof override.example?.english === 'string' && typeof override.example?.highlight === 'string'
        && !override.example.english.includes(override.example.highlight)) {
      errors.push(`${prefix} highlight is not an exact sentence substring`)
    }
    if (emojiPattern.test(JSON.stringify(override))) errors.push(`${prefix} contains an emoji`)
    entriesByOrder.set(source.sourceOrder, { ...entry, example: override.example })
  }
}
const sentenceOwners = new Map()
for (const entry of entriesByOrder.values()) {
  const sentenceKey = entry.example.english.trim().toLowerCase()
  if (sentenceOwners.has(sentenceKey)) {
    errors.push(`sourceOrder ${entry.sourceOrder} duplicates the example from ${sentenceOwners.get(sentenceKey)}`)
  } else {
    sentenceOwners.set(sentenceKey, entry.sourceOrder)
  }
}
const report = {
  schemaVersion: 'wanwei-learning-assembly-report-v1',
  batchFiles: batchFiles.length,
  candidateEntries: entriesByOrder.size,
  requiredGeneratedEntries: 1570,
  missingEntries: missingOrders.length,
  firstMissingOrders: missingOrders.slice(0, 20),
  errors,
}

if (errors.length > 0) {
  console.error(JSON.stringify(report, null, 2))
  process.exitCode = 1
} else if (reportOnly || missingOrders.length > 0) {
  console.log(JSON.stringify(report, null, 2))
  if (!reportOnly) process.exitCode = 1
} else {
  const artifact = {
    schemaVersion: 'wanwei-learning-content-v1',
    programId: sourceMap.programId,
    generatedEntryCount: entriesByOrder.size,
    entries: [...entriesByOrder.values()].sort((a, b) => a.sourceOrder - b.sourceOrder),
  }
  writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, outputPath }, null, 2))
}
