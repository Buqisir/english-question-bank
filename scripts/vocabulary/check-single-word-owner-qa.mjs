#!/usr/bin/env node

import {createHash} from 'node:crypto'
import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [manifestArgument, summaryArgument, entryId] = process.argv.slice(2)
if (!manifestArgument || !summaryArgument || !entryId) {
  throw new Error('Usage: node scripts/vocabulary/check-single-word-owner-qa.mjs <manifest.json> <owner-summary.json> <entryId>')
}

const readJson = (relativePath) => JSON.parse(readFileSync(path.resolve(root, relativePath), 'utf8'))
const manifest = readJson(manifestArgument)
const summary = readJson(summaryArgument)
const candidates = Array.isArray(manifest.entries)
  ? manifest.entries.filter((entry) => entry.entryId === entryId)
  : manifest.entry?.entryId === entryId ? [manifest.entry] : []
const ownerEntry = summary.entries.find((entry) => entry.entryId === entryId)
if (candidates.length === 0) throw new Error(`Manifest has no candidate for ${entryId}`)
if (!ownerEntry) throw new Error(`Owner summary has no verdict for ${entryId}`)

for (const candidate of candidates) {
  const assets = candidate.publicPath
    ? [{publicPath: candidate.publicPath, sha256: candidate.sha256}]
    : [candidate.context, candidate.crop].filter(Boolean)
  for (const asset of assets) {
    const pathname = asset.publicPath.split('?')[0]
    const audioPath = path.join(root, 'app/public', pathname.replace(/^\//, ''))
    if (!existsSync(audioPath)) throw new Error(`Missing audio: ${asset.publicPath}`)
    const digest = createHash('sha256').update(readFileSync(audioPath)).digest('hex')
    if (digest !== asset.sha256) throw new Error(`Audio hash mismatch: ${asset.publicPath}`)
  }
}

if (!String(ownerEntry.verdict).includes('usable')) {
  console.error(`RED single_word_owner_qa ${ownerEntry.headword}: ${ownerEntry.note}`)
  process.exitCode = 1
} else {
  console.log(`GREEN single_word_owner_qa ${ownerEntry.headword}: ${ownerEntry.verdict}`)
}
