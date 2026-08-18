#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const rootDir = path.resolve(import.meta.dirname, '..')
const programId = 'gaokao-curriculum-3000-frequency-v1'
const accents = {
  american: {
    voice: 'en-US-Neural2-C',
    version: 'google-neural2-us-c-v1',
    script: 'data/vocabulary/gaokao-frequency-golden-american-audio-script-v1.json',
    manifest: 'data/vocabulary/gaokao-frequency-golden-american-audio-manifest-v1.json',
    fullManifest: 'data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json',
  },
  british: {
    voice: 'en-GB-Neural2-D',
    version: 'google-neural2-gb-d-v1',
    script: 'data/vocabulary/gaokao-frequency-golden-british-audio-script-v1.json',
    manifest: 'data/vocabulary/gaokao-frequency-golden-british-audio-manifest-v1.json',
    fullManifest: 'data/vocabulary/gaokao-frequency-full-british-audio-manifest-v1.json',
  },
}
const selection = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json'), 'utf8'))
const ownerSelections = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-audio-owner-selections-v1.json'), 'utf8'))
const ownerSelectionByKey = new Map(ownerSelections.entries.map((entry) => [`${entry.entryId}--${entry.accent}`, entry]))
const reviewed = JSON.parse(readFileSync(path.join(rootDir, 'data/vocabulary/gaokao-frequency-golden-learning-reviewed-v1.json'), 'utf8')).entries
const expectedIds = reviewed.map((entry) => entry.entryId)

assert.equal(reviewed.length, 90, 'golden audio gate requires exactly 90 reviewed entries')
assert.equal(selection.status, 'owner_approved', 'Google voice selection requires Owner approval')
assert.equal(selection.requestGranularity, 'one_entry_per_request', 'Google audio must use one request per word')
assert.deepEqual(selection.audioConfig, {
  audioEncoding: 'MP3',
  sampleRateHertz: 24_000,
  speakingRate: 0.92,
}, 'Google audio config changed after Owner voice selection')

for (const [accent, config] of Object.entries(accents)) {
  const script = JSON.parse(readFileSync(path.join(rootDir, config.script), 'utf8'))
  const manifest = JSON.parse(readFileSync(path.join(rootDir, config.manifest), 'utf8'))
  const fullManifest = JSON.parse(readFileSync(path.join(rootDir, config.fullManifest), 'utf8'))
  const fullEntryById = new Map(fullManifest.entries.map((entry) => [entry.entryId, entry]))
  assert.equal(script.schemaVersion, 'gaokao-frequency-audio-script-v1', `${accent} audio script schema changed`)
  assert.equal(script.programId, programId, `${accent} audio script program changed`)
  assert.equal(script.voice, config.voice, `${accent} audio script voice changed`)
  assert.equal(manifest.schemaVersion, 'vocabulary-audio-manifest-v1', `${accent} audio manifest schema changed`)
  assert.equal(manifest.programId, programId, `${accent} audio manifest program changed`)
  assert.equal(manifest.accent, accent, `${accent} audio manifest accent changed`)
  assert.equal(manifest.status, 'owner_approved', `${accent} golden audio requires final Owner approval`)
  assert.equal(fullManifest.status, 'owner_approved', `${accent} full audio requires final Owner approval`)
  assert.equal(manifest.voice, config.voice, `${accent} audio manifest voice changed`)
  assert.equal(manifest.version, config.version, `${accent} audio manifest version changed`)
  assert.equal(manifest.generator?.provider, 'Google Cloud Text-to-Speech', `${accent} audio provider changed`)
  assert.equal(manifest.generator?.voiceFamily, 'Neural2', `${accent} audio voice family changed`)
  assert.equal(manifest.generator?.requestGranularity, 'one_entry_per_request', `${accent} audio request granularity changed`)
  assert.deepEqual(manifest.generator?.audioConfig, selection.audioConfig, `${accent} audio config changed`)
  assert.equal(manifest.generator?.voiceSelectionReceiptVersion, selection.schemaVersion, `${accent} voice receipt changed`)
  assert.deepEqual(script.entries.map((entry) => entry.id), expectedIds, `${accent} audio script order changed`)
  assert.deepEqual(manifest.entries.map((entry) => entry.entryId), expectedIds, `${accent} audio manifest order changed`)
  assert.equal(new Set(manifest.entries.map((entry) => entry.path)).size, 90, `${accent} audio paths must be unique`)
  assert.equal(manifest.publicBasePath, `/vocabulary-assets/gaokao-frequency-v1/audio/${config.version}`, `${accent} public base path changed`)

  const scriptById = new Map(script.entries.map((entry) => [entry.id, entry]))
  for (const entry of manifest.entries) {
    const scripted = scriptById.get(entry.entryId)
    assert.ok(scripted, `${accent} audio is outside the golden script: ${entry.entryId}`)
    assert.deepEqual(entry, fullEntryById.get(entry.entryId), `${accent} golden entry drifted from the Owner-approved full manifest: ${entry.entryId}`)
    assert.equal(entry.text, scripted.audio.text, `${accent} spoken text changed for ${entry.entryId}`)
    assert.equal(entry.voice, config.voice, `${accent} entry voice changed for ${entry.entryId}`)
    assert.equal(entry.format, 'audio-24khz-64kbitrate-mono-mp3', `${accent} format changed for ${entry.entryId}`)
    assert.equal(entry.version, config.version, `${accent} entry version changed for ${entry.entryId}`)
    assert.equal(entry.qa?.status, 'owner_approved', `${accent} Owner QA status changed for ${entry.entryId}`)
    assert.match(entry.path, /^[A-Za-z0-9._-]+\.mp3$/u, `${accent} audio path is unsafe for ${entry.entryId}`)
    const filePath = path.join(rootDir, 'app/public', manifest.publicBasePath.slice(1), entry.path)
    const bytes = readFileSync(filePath)
    assert.equal(bytes.length, entry.bytes, `${accent} byte count changed for ${entry.entryId}`)
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, `${accent} hash mismatch for ${entry.entryId}`)
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json', filePath,
    ], { encoding: 'utf8' }))
    const stream = probe.streams?.[0]
    assert.equal(stream?.codec_name, 'mp3', `${accent} codec changed for ${entry.entryId}`)
    assert.equal(Number(stream?.sample_rate), 24_000, `${accent} sample rate changed for ${entry.entryId}`)
    assert.equal(Number(stream?.channels), 1, `${accent} channel count changed for ${entry.entryId}`)
    assert.ok(entry.bitrate >= 40_000 && entry.bitrate <= 128_000, `${accent} bitrate is unsafe for ${entry.entryId}`)
    assert.ok(Number(probe.format?.duration) >= 0.35 && Number(probe.format?.duration) <= 5, `${accent} duration is unsafe for ${entry.entryId}`)
    assert.ok(entry.peak >= 0.05 && entry.peak <= 1 && entry.rms >= 0.005, `${accent} audio is silent or clipped for ${entry.entryId}`)
    assert.ok(entry.leadingSilenceSeconds <= 0.75, `${accent} leading silence is unsafe for ${entry.entryId}`)
    assert.ok(entry.trailingSilenceSeconds <= 0.8, `${accent} trailing silence is unsafe for ${entry.entryId}`)
  }

  for (const [text, expectedSha256] of Object.entries(selection[accent].pilotSampleSha256ByText)) {
    const productionEntry = manifest.entries.find((entry) => entry.text === text)
    assert.ok(productionEntry, `${accent} Owner-approved pilot word is absent: ${text}`)
    const repaired = ownerSelectionByKey.get(`${productionEntry.entryId}--${accent}`)
    assert.equal(productionEntry.sha256, repaired?.finalSha256 ?? expectedSha256, `${accent} production audio drifted from its final Owner-approved source: ${text}`)
  }
}

console.log('PASS gaokao golden audio: 90 entries exactly match the Owner-approved full American/British manifests and audio files')
