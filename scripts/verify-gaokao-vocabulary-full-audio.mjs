#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(rootDir, relativePath), 'utf8'))
const source = readJson('data/vocabulary/gaokao-frequency-source-ledger-v1.json').entries
const selection = readJson('data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const ownerSelections = readJson('data/vocabulary/gaokao-frequency-audio-owner-selections-v1.json')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

assert.equal(ownerSelections.status, 'owner_approved', 'final audio selections require Owner approval')
assert.equal(ownerSelections.entries.length, 158, 'final audio selections must cover 158 repaired accent assets')
assert.equal(new Set(ownerSelections.entries.map((entry) => `${entry.entryId}--${entry.accent}`)).size, 158, 'final audio selections must be unique')
const ownerSelectionKeys = new Set(ownerSelections.entries.map((entry) => `${entry.entryId}--${entry.accent}`))

assert.equal(source.length, 3000, 'source ledger must contain 3000 entries')
for (const accent of ['american', 'british']) {
  const script = readJson(`data/vocabulary/gaokao-frequency-full-${accent}-audio-script-v1.json`)
  const manifest = readJson(`data/vocabulary/gaokao-frequency-full-${accent}-audio-manifest-v1.json`)
  const selectedVoice = selection[accent]
  assert.equal(script.entries.length, 3000, `${accent} script must contain 3000 entries`)
  assert.equal(manifest.entries.length, 3000, `${accent} manifest must contain 3000 entries`)
  assert.equal(manifest.status, 'owner_approved', `${accent} manifest requires final Owner approval`)
  assert.equal(new Set(manifest.entries.map((entry) => entry.entryId)).size, 3000, `${accent} manifest IDs must be unique`)
  assert.deepEqual(script.entries.map((entry) => entry.id), source.map((entry) => entry.entryId), `${accent} script order must match source`)
  assert.deepEqual(manifest.entries.map((entry) => entry.entryId), source.map((entry) => entry.entryId), `${accent} manifest order must match source`)
  assert.equal(manifest.voice, selectedVoice.voice, `${accent} voice changed`)
  assert.equal(manifest.version, selectedVoice.version, `${accent} version changed`)
  for (let index = 0; index < manifest.entries.length; index += 1) {
    const entry = manifest.entries[index]
    const scripted = script.entries[index]
    assert.equal(entry.text, scripted.audio.text, `${accent} spoken text mismatch for ${entry.entryId}`)
    assert.equal(entry.ssml ?? null, scripted.audio.ssml ?? null, `${accent} SSML mismatch for ${entry.entryId}`)
    assert.equal(entry.headword, source[index].headword, `${accent} headword mismatch for ${entry.entryId}`)
    assert.equal(entry.codec, 'mp3', `${accent} codec mismatch for ${entry.entryId}`)
    assert.equal(entry.sampleRate, 24000, `${accent} sample rate mismatch for ${entry.entryId}`)
    assert.equal(entry.channels, 1, `${accent} channel mismatch for ${entry.entryId}`)
    assert.equal(entry.qa?.status, 'owner_approved', `${accent} Owner QA missing for ${entry.entryId}`)
    assert.ok(entry.durationSeconds >= 0.35 && entry.durationSeconds <= 5, `${accent} duration out of range for ${entry.entryId}`)
    const ownerApprovedReplacement = ownerSelectionKeys.has(`${entry.entryId}--${accent}`)
    assert.ok(entry.leadingSilenceSeconds <= (ownerApprovedReplacement ? 0.75 : 0.3), `${accent} leading silence too long for ${entry.entryId}`)
    assert.ok(entry.trailingSilenceSeconds <= (ownerApprovedReplacement ? 0.8 : 0.5), `${accent} trailing silence too long for ${entry.entryId}`)
    assert.ok(entry.peak >= 0.05 && entry.peak <= 1, `${accent} peak out of range for ${entry.entryId}`)
    assert.ok(entry.rms >= 0.005, `${accent} RMS too low for ${entry.entryId}`)
    const filePath = path.join(rootDir, 'app/public', manifest.publicBasePath.slice(1), entry.path)
    assert.equal(existsSync(filePath), true, `${accent} file missing for ${entry.entryId}`)
    const bytes = readFileSync(filePath)
    assert.equal(bytes.length, entry.bytes, `${accent} byte count mismatch for ${entry.entryId}`)
    assert.equal(sha256(bytes), entry.sha256, `${accent} hash mismatch for ${entry.entryId}`)
  }
}

console.log('PASS gaokao full audio: 6000 Owner-approved American/British assets, including 158 exact repaired selections, match manifests, hashes, format, duration, level, and silence gates')
