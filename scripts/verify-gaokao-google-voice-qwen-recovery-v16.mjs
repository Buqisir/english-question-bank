#!/usr/bin/env node

import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync, readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = path.join(root, '.scratch/gaokao-google-voice-qwen-recovery-v16')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-recovery-v16')
const manifest = JSON.parse(readFileSync(path.join(scratchRoot, 'manifest.json'), 'utf8'))
const v14Qa = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-context-pilot-v14/owner-qa-summary-v14.json'), 'utf8'))
const v15Qa = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-context-full-v15/owner-qa-summary-v15.json'), 'utf8'))
const expectedKeys = new Set([
  ...v14Qa.entries.filter((entry) => entry.verdict === 'failed').map((entry) => `${entry.entryId}:${entry.accent}`),
  ...v15Qa.failed.map((entry) => `${entry.entryId}:${entry.accent}`),
])
assert.equal(expectedKeys.size, 31)
assert.equal(v15Qa.counts.c15Usable, 9)
assert.equal(v15Qa.counts.failed, 25)
assert.equal(manifest.schemaVersion, 'gaokao-frequency-google-voice-qwen-recovery-v16')
assert.equal(manifest.status, 'private_local_candidates_pending_owner_qa')
assert.equal(manifest.formalAssetsChanged, false)
assert.equal(manifest.distribution, 'local_private_evaluation_only')
assert.equal(manifest.plannedCases, 31)
assert.equal(manifest.plannedCandidates, 62)
assert.deepEqual(manifest.issueClasses, {boundary: 10, pronunciation_or_stress: 21})
assert.equal(manifest.entries.length, 62)
assert.equal(manifest.failures.length, 0)
assert.equal(manifest.edgeProtection.activeSafetySeconds, 0.1)
assert.equal(manifest.edgeProtection.leadingZeroSeconds, 0.3)
assert.equal(manifest.edgeProtection.trailingZeroSeconds, 0.5)

const byCase = new Map()
const hashes = new Set()
for (const entry of manifest.entries) {
  const caseKey = `${entry.entryId}:${entry.accent}`
  assert.ok(expectedKeys.has(caseKey))
  assert.ok(['A16', 'B16'].includes(entry.candidateLabel))
  assert.ok(['V14', 'V15'].includes(entry.sourceVersion))
  assert.ok(['boundary', 'pronunciation_or_stress'].includes(entry.issueClass))
  assert.ok(entry.exampleText.endsWith('.'))
  assert.ok(entry.priorPublicPath)
  assert.equal(entry.activeSafetySeconds, 0.1)
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
  assert.ok(entry.durationSeconds >= 0.75 && entry.durationSeconds <= 3.6)
  assert.ok(entry.activeDurationSeconds >= 0.24)
  assert.ok(entry.leadingSilenceSeconds >= 0.24)
  assert.ok(entry.trailingSilenceSeconds >= 0.4)
  assert.ok(entry.peak >= 0.02)
  assert.ok(entry.rawPeak >= 0.03)
  assert.ok(entry.rawRms >= 0.015)
  assert.ok(entry.rawActiveFrameFraction >= 0.08)
  hashes.add(entry.sha256)
  const labels = byCase.get(caseKey) ?? new Map()
  labels.set(entry.candidateLabel, entry)
  byCase.set(caseKey, labels)
}
assert.equal(byCase.size, 31)
for (const [caseKey, labels] of byCase) {
  assert.equal(labels.size, 2, `Expected A16/B16 pair for ${caseKey}`)
  assert.ok(labels.has('A16'))
  assert.ok(labels.has('B16'))
  assert.notEqual(labels.get('A16').sha256, labels.get('B16').sha256)
}
assert.equal(hashes.size, 62)
assert.equal(readdirSync(publicRoot).filter((name) => name.endsWith('.mp3')).length, 62)
assert.ok(byCase.has('gaokao-frequency-2081-violin:american'))
assert.ok(byCase.has('gaokao-frequency-2081-violin:british'))

const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-recovery-owner-qa-v16.html')
assert.ok(existsSync(qaPath))
const html = readFileSync(qaPath, 'utf8')
assert.match(html, /31 条统一返修｜V16/)
assert.match(html, /violin/)
assert.match(html, /gaokao-google-voice-qwen-recovery-owner-qa-v16/)
console.log('PASS Google-voice Qwen V16: 31 combined failures, 62 edge-protected candidates, violin in both accents')
