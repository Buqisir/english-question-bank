#!/usr/bin/env node

import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile, readdir } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '..')
const scratch = path.join(root, '.scratch/gaokao-audio-targeted-repair-v6')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1')
const readJson = (filePath) => readFile(filePath, 'utf8').then(JSON.parse)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

const [qa, spec, americanManifest, britishManifest, html] = await Promise.all([
  readJson(path.join(scratch, 'owner-qa-v5.json')),
  readJson(path.join(scratch, 'repair-spec.json')),
  readJson(path.join(scratch, 'american-manifest.json')),
  readJson(path.join(scratch, 'british-manifest.json')),
  readFile(path.join(publicRoot, 'qa/full-3000-audio-targeted-repair-owner-qa-v6.html'), 'utf8'),
])

assert(qa.qaTarget === 'gaokao-frequency-full-3000-audio-repair-v5', 'Unexpected V5 QA source')
assert(qa.qa.length === 117 && qa.qa.every((entry) => ['pass', 'fail'].includes(entry.status)), 'V5 QA is incomplete')
const failedQa = qa.qa.filter((entry) => entry.audioVerdict !== 'pass')
assert(failedQa.length === 100, `Expected 100 failed V5 words, found ${failedQa.length}`)
assert(spec.schemaVersion === 'gaokao-frequency-targeted-audio-repair-v6', 'Unexpected V6 repair spec')
assert(spec.entries.length === 100 && spec.repairAccentCount === 143, 'Unexpected V6 repair totals')
assert(new Set(spec.entries.map((entry) => entry.entryId)).size === 100, 'Duplicate V6 repair words')
assert(spec.entries.every((entry) => failedQa.some((qaEntry) => qaEntry.entryId === entry.entryId)), 'V6 includes a word that passed V5')

const manifests = { american: americanManifest, british: britishManifest }
const expectedCounts = { american: 91, british: 52 }
for (const [accent, manifest] of Object.entries(manifests)) {
  assert(manifest.entries.length === expectedCounts[accent], `Unexpected ${accent} manifest count`)
  assert(new Set(manifest.entries.map((entry) => entry.entryId)).size === manifest.entries.length, `Duplicate ${accent} manifest IDs`)
  assert(new Set(manifest.entries.map((entry) => entry.sha256)).size === manifest.entries.length, `Duplicate ${accent} audio hashes`)
  const manifestById = new Map(manifest.entries.map((entry) => [entry.entryId, entry]))
  const expectedEntries = spec.entries.filter((entry) => entry.accents.includes(accent))
  for (const expected of expectedEntries) {
    const generated = manifestById.get(expected.entryId)
    assert(generated, `Missing ${accent} audio for ${expected.entryId}`)
    assert(generated.ssml.includes(`ph="${expected.ipa[accent]}"`), `Wrong ${accent} IPA for ${expected.entryId}`)
    assert(generated.durationSeconds >= 0.5 && generated.durationSeconds <= 2, `Suspicious ${accent} duration for ${expected.entryId}`)
    const publicBytes = await readFile(path.join(publicRoot, `audio/targeted-ipa-repair-v6/${accent}/${generated.path}`))
    assert(sha256(publicBytes) === generated.sha256, `Public ${accent} hash mismatch for ${expected.entryId}`)
  }
  const publicFiles = (await readdir(path.join(publicRoot, `audio/targeted-ipa-repair-v6/${accent}`))).filter((file) => file.endsWith('.mp3'))
  assert(publicFiles.length === expectedCounts[accent], `Unexpected public ${accent} file count`)
}

const entriesMatch = html.match(/const entries = (\[.*\])\n    const storageKey =/u)
assert(entriesMatch, 'V6 QA entry payload was not found')
const pageEntries = JSON.parse(entriesMatch[1])
assert(pageEntries.length === 100, 'V6 QA page must contain 100 entries')
assert(html.includes("const storageKey = 'gaokao-full-3000-audio-targeted-repair-owner-qa-v6'"), 'V6 QA storage key is not isolated')
assert(!pageEntries.some((entry) => entry.entryId === 'gaokao-frequency-2270-protein'), 'V5 pass word protein leaked into V6')
for (const entry of pageEntries) {
  const expected = spec.entries.find((candidate) => candidate.entryId === entry.entryId)
  assert(expected, `Unknown V6 QA entry ${entry.entryId}`)
  assert(JSON.stringify(entry.repairScope) === JSON.stringify(expected.accents), `Wrong repair scope for ${entry.entryId}`)
  for (const accent of ['american', 'british']) {
    const expectedFolder = expected.accents.includes(accent) ? 'targeted-ipa-repair-v6' : 'original-word-repair-v5'
    assert(entry.audio[accent].includes(`/audio/${expectedFolder}/${accent}/`), `Wrong ${accent} QA source for ${entry.entryId}`)
  }
}

console.log(JSON.stringify({
  result: 'PASS',
  qaWords: qa.qa.length,
  repairWords: spec.entries.length,
  repairAccents: spec.repairAccentCount,
  americanAudio: americanManifest.entries.length,
  britishAudio: britishManifest.entries.length,
  isolatedStorageKey: true,
}, null, 2))
