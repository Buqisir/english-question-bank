#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = path.join(root, '.scratch/gaokao-google-voice-qwen-full-v13')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-full-v13')
const manifest = JSON.parse(readFileSync(path.join(scratchRoot, 'manifest.json'), 'utf8'))
assert.equal(manifest.schemaVersion, 'gaokao-frequency-google-voice-qwen-full-v13')
assert.ok(['private_local_candidates_pending_owner_qa', 'private_local_candidates_with_generation_failures'].includes(manifest.status))
assert.equal(manifest.formalAssetsChanged, false)
assert.equal(manifest.distribution, 'local_private_evaluation_only')
assert.equal(manifest.plannedWords, 117)
assert.equal(manifest.plannedCandidates, 158)
assert.equal(manifest.entries.length + manifest.failures.length, 158)
assert.equal(manifest.references.american.voice, 'en-US-Neural2-C')
assert.equal(manifest.references.british.voice, 'en-GB-Neural2-D')
assert.deepEqual(manifest.references.american.entries.map((entry) => entry.headword), manifest.references.british.entries.map((entry) => entry.headword))
assert.equal(manifest.references.american.entries.length, 11)
assert.equal(manifest.references.british.entries.length, 11)
for (const reference of Object.values(manifest.references)) {
  const referencePath = path.join(root, reference.path)
  assert.ok(existsSync(referencePath))
  assert.equal(createHash('sha256').update(readFileSync(referencePath)).digest('hex'), reference.sha256)
  assert.ok(reference.durationSeconds >= 8 && reference.durationSeconds <= 20)
  assert.equal(reference.referenceText, 'people. student. author. family. paragraph. because. speaker. problem. human. around. experience.')
}

const allAttempts = [...manifest.entries, ...manifest.failures]
assert.equal(new Set(allAttempts.map((entry) => `${entry.entryId}:${entry.accent}`)).size, 158)
assert.equal(new Set(allAttempts.map((entry) => entry.caseIndex)).size, 158)
assert.deepEqual([...allAttempts.map((entry) => entry.caseIndex)].sort((a, b) => a - b), Array.from({ length: 158 }, (_, index) => index))
const hashes = new Set()
for (const entry of manifest.entries) {
  const scratchPath = path.join(scratchRoot, entry.path)
  const publicPath = path.join(root, 'app/public', entry.publicPath)
  const googlePath = path.join(root, `app/public/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`)
  assert.ok(existsSync(scratchPath))
  assert.ok(existsSync(publicPath))
  assert.ok(existsSync(googlePath))
  const bytes = readFileSync(scratchPath)
  assert.deepEqual(readFileSync(publicPath), bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  assert.equal(entry.sampleRate, 24000)
  assert.equal(entry.channels, 1)
  assert.ok(entry.durationSeconds >= 0.15 && entry.durationSeconds <= 15)
  assert.ok(entry.peak >= 0.03)
  assert.ok(entry.rms >= 0.015)
  assert.ok(entry.rawActiveFrameFraction >= 0.08)
  hashes.add(entry.sha256)
}
for (const entry of manifest.failures) {
  const googlePath = path.join(root, `app/public/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`)
  assert.ok(existsSync(googlePath))
  assert.ok(entry.error)
}
assert.equal(hashes.size, manifest.entries.length)
assert.equal(readdirSync(publicRoot).filter((name) => name.endsWith('.mp3')).length, manifest.entries.length)
const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-full-owner-qa-v13.html')
assert.ok(existsSync(qaPath))
const html = readFileSync(qaPath, 'utf8')
assert.match(html, /Google 音色喂给千问｜全量 V13/)
assert.match(html, /gaokao-google-voice-qwen-full-owner-qa-v13/)
console.log(`PASS Google-voice Qwen V13: attempted 158 candidates for 117 words; generated=${manifest.entries.length}; failed=${manifest.failures.length}`)
