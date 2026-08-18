#!/usr/bin/env node

import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync, readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = path.join(root, '.scratch/gaokao-google-voice-qwen-source-crop-v19')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-source-crop-v19')
const manifest = JSON.parse(readFileSync(path.join(scratchRoot, 'manifest.json'), 'utf8'))
const v17 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json'), 'utf8'))
const v18Qa = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-bare-word-v18/owner-qa-summary-v18.json'), 'utf8'))
const expectedSources = new Map([
  ['gaokao-frequency-2739-ad-a-d:british', 'C17'],
  ['gaokao-frequency-2956-equator:american', 'P17'],
])
const qaByKey = new Map(v18Qa.entries.map((entry) => [`${entry.entryId}:${entry.accent}`, entry]))
const sourceByKey = new Map(v17.entries.map((entry) => [`${entry.entryId}:${entry.accent}:${entry.candidateLabel}`, entry]))

assert.equal(manifest.schemaVersion, 'gaokao-frequency-google-voice-qwen-source-crop-v19')
assert.equal(manifest.status, 'private_local_candidates_pending_owner_qa')
assert.equal(manifest.formalAssetsChanged, false)
assert.equal(manifest.distribution, 'local_private_evaluation_only')
assert.equal(manifest.plannedCases, 2)
assert.equal(manifest.plannedCandidates, 4)
assert.equal(manifest.entries.length, 4)
assert.equal(manifest.failures.length, 0)

const byCase = new Map()
const hashes = new Set()
for (const entry of manifest.entries) {
  const caseKey = `${entry.entryId}:${entry.accent}`
  assert.ok(expectedSources.has(caseKey))
  assert.equal(entry.sourceLabel, expectedSources.get(caseKey))
  assert.equal(entry.sourceMode, 'owner-approved-v17-subcrop')
  assert.ok(['A19', 'B19'].includes(entry.candidateLabel))
  assert.equal(entry.extractionStrategy, 'whole-utterance-active-trim')
  assert.ok(entry.startSeconds >= 0.3)
  assert.ok(entry.endSeconds <= 1.9)
  assert.ok(entry.endSeconds > entry.startSeconds)
  assert.ok(entry.activeToGoogleRatio >= 0.45 && entry.activeToGoogleRatio <= 1.8)
  assert.ok(entry.directActiveSeconds < entry.sourceActiveDurationSeconds)
  const qaEntry = qaByKey.get(caseKey)
  assert.equal(entry.ownerSourceJudgment, qaEntry.note)
  const source = sourceByKey.get(`${caseKey}:${entry.sourceLabel}`)
  assert.equal(entry.sourceSha256, source.sha256)
  assert.equal(entry.sourcePublicPath, source.publicPath)
  assert.notEqual(entry.sha256, source.sha256)
  const scratchPath = path.join(scratchRoot, entry.path)
  const publicPath = path.join(root, 'app/public', entry.publicPath)
  const sourcePath = path.join(root, 'app/public', entry.sourcePublicPath)
  assert.ok(existsSync(scratchPath))
  assert.ok(existsSync(publicPath))
  assert.ok(existsSync(sourcePath))
  const bytes = readFileSync(scratchPath)
  assert.deepEqual(readFileSync(publicPath), bytes)
  assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256)
  assert.equal(createHash('sha256').update(readFileSync(sourcePath)).digest('hex'), entry.sourceSha256)
  assert.equal(entry.sampleRate, 24000)
  assert.equal(entry.channels, 1)
  assert.ok(entry.leadingSilenceSeconds >= 0.24)
  assert.ok(entry.trailingSilenceSeconds >= 0.4)
  assert.ok(entry.peak >= 0.02)
  hashes.add(entry.sha256)
  const labels = byCase.get(caseKey) ?? new Set()
  labels.add(entry.candidateLabel)
  byCase.set(caseKey, labels)
}
assert.equal(byCase.size, 2)
for (const labels of byCase.values()) assert.deepEqual([...labels].sort(), ['A19', 'B19'])
assert.equal(hashes.size, 4)
assert.equal(readdirSync(publicRoot).filter((name) => name.endsWith('.mp3')).length, 4)

const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-source-crop-owner-qa-v19.html')
assert.ok(existsSync(qaPath))
const html = readFileSync(qaPath, 'utf8')
assert.match(html, /2 条源音精确裁切｜V19/)
assert.match(html, /gaokao-google-voice-qwen-source-crop-owner-qa-v19/)
console.log('PASS Google-voice Qwen V19: 2 Owner-approved sources, 4 source-bound crop candidates, no new TTS')
