#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-pilot-v12/manifest.json'), 'utf8'))
assert.equal(manifest.schemaVersion, 'gaokao-frequency-google-voice-qwen-pilot-v12')
assert.equal(manifest.status, 'private_local_candidate_pending_owner_qa')
assert.equal(manifest.formalAssetsChanged, false)
assert.equal(manifest.distribution, 'local_private_evaluation_only')
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
assert.equal(manifest.entries.length, 5)
assert.equal(new Set(manifest.entries.map((entry) => `${entry.entryId}:${entry.accent}`)).size, 5)
const hashes = new Set()
for (const entry of manifest.entries) {
  const scratchPath = path.join(root, '.scratch/gaokao-google-voice-qwen-pilot-v12', entry.path)
  const publicPath = path.join(root, 'app/public', entry.publicPath)
  assert.ok(existsSync(scratchPath))
  assert.ok(existsSync(publicPath))
  const bytes = readFileSync(scratchPath)
  assert.deepEqual(readFileSync(publicPath), bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  assert.equal(entry.sampleRate, 24000)
  assert.equal(entry.channels, 1)
  assert.ok(entry.durationSeconds >= 0.15 && entry.durationSeconds <= 15)
  hashes.add(entry.sha256)
}
assert.equal(hashes.size, 5)
const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-stress-pilot-owner-qa-v12.html')
assert.ok(existsSync(qaPath))
const html = readFileSync(qaPath, 'utf8')
assert.match(html, /Google 音色喂给千问 V12/)
assert.match(html, /gaokao-google-voice-qwen-stress-pilot-owner-qa-v12/)
console.log('PASS Google-voice Qwen V12: 2 frozen exact-text references, 5 unique local candidates, owner QA page')
