#!/usr/bin/env node

import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [manifestArgument, summaryArgument] = process.argv.slice(2)
if (!manifestArgument || !summaryArgument) {
  throw new Error('Usage: node scripts/vocabulary/check-last-two-pronunciation-loop.mjs <manifest.json> <owner-summary.json>')
}

const readJson = (relativePath) => JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8'))
const manifest = readJson(manifestArgument)
const summary = readJson(summaryArgument)
const expectedIds = new Set(['gaokao-frequency-2396-ballet', 'gaokao-frequency-2081-violin'])
const summaryById = new Map(summary.entries.map((entry) => [entry.entryId, entry]))

if (summaryById.size !== 2 || [...expectedIds].some((entryId) => !summaryById.has(entryId))) {
  throw new Error('Owner summary must contain exactly ballet and violin')
}

for (const entryId of expectedIds) {
  const candidates = manifest.entries.filter((entry) => entry.entryId === entryId)
  if (candidates.length === 0) throw new Error(`Manifest has no candidate for ${entryId}`)
  for (const candidate of candidates) {
    const audioPath = path.join(root, 'app/public', candidate.publicPath.replace(/^\//, ''))
    if (!existsSync(audioPath)) throw new Error(`Missing audio: ${candidate.publicPath}`)
    const digest = createHash('sha256').update(readFileSync(audioPath)).digest('hex')
    if (digest !== candidate.sha256) throw new Error(`Audio hash mismatch: ${candidate.publicPath}`)
  }
}

const failed = [...expectedIds]
  .map((entryId) => summaryById.get(entryId))
  .filter((entry) => entry.verdict === 'fail')

if (failed.length > 0) {
  console.error(`RED pronunciation_owner_qa ${failed.length}/2 failed`)
  for (const entry of failed) console.error(`- ${entry.headword}: ${entry.note}`)
  process.exitCode = 1
} else {
  console.log('GREEN pronunciation_owner_qa 2/2 usable')
}
