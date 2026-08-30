#!/usr/bin/env node

import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {existsSync, readFileSync, readdirSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = path.join(root, '.scratch/gaokao-google-voice-qwen-bare-word-v18')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-bare-word-v18')
const manifest = JSON.parse(readFileSync(path.join(scratchRoot, 'manifest.json'), 'utf8'))
const v17Qa = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-ipa-aligned-v17/owner-qa-summary-v17.json'), 'utf8'))
const usableVerdicts = new Set(['c17_usable', 'p17_usable'])
const expectedKeys = new Set(v17Qa.entries.filter((entry) => !usableVerdicts.has(entry.verdict)).map((entry) => `${entry.entryId}:${entry.accent}`))
const preservedKeys = new Set(v17Qa.entries.filter((entry) => usableVerdicts.has(entry.verdict)).map((entry) => `${entry.entryId}:${entry.accent}`))

assert.equal(v17Qa.counts.total, 14)
assert.equal(v17Qa.counts.usable, 3)
assert.equal(v17Qa.counts.repairQueue, 11)
assert.equal(expectedKeys.size, 11)
assert.deepEqual([...preservedKeys].sort(), [
  'gaokao-frequency-2081-violin:british',
  'gaokao-frequency-2741-canteen:american',
  'gaokao-frequency-2866-downstairs:american',
])
assert.equal(manifest.schemaVersion, 'gaokao-frequency-google-voice-qwen-bare-word-v18')
assert.equal(manifest.status, 'private_local_candidates_pending_owner_qa')
assert.equal(manifest.formalAssetsChanged, false)
assert.equal(manifest.distribution, 'local_private_evaluation_only')
assert.equal(manifest.plannedCases, 11)
assert.equal(manifest.plannedCandidates, 22)
assert.equal(manifest.entries.length, 22)
assert.equal(manifest.failures.length, 0)
assert.equal(manifest.preservedV17Usable.length, 3)
assert.equal(manifest.durationGate.minimumActiveToGoogleRatio, 0.45)
assert.equal(manifest.durationGate.maximumActiveToGoogleRatio, 1.8)
assert.equal(manifest.edgeProtection.activeSafetySeconds, 0.1)
assert.equal(manifest.edgeProtection.leadingZeroSeconds, 0.3)
assert.equal(manifest.edgeProtection.trailingZeroSeconds, 0.5)

const byCase = new Map()
const hashes = new Set()
for (const entry of manifest.entries) {
  const caseKey = `${entry.entryId}:${entry.accent}`
  assert.ok(expectedKeys.has(caseKey))
  assert.ok(!preservedKeys.has(caseKey))
  assert.ok(['D18', 'R18'].includes(entry.candidateLabel))
  assert.equal(entry.generatedTargetText, entry.candidateLabel === 'D18' ? entry.canonicalText : entry.bareRepairText)
  assert.equal(entry.generationPrompt, `${entry.generatedTargetText}.`)
  assert.ok(!entry.generationPrompt.includes('\n'))
  assert.ok(!entry.generationPrompt.includes(entry.exampleText))
  assert.equal(entry.extractionStrategy, 'whole-utterance-active-trim')
  assert.equal(entry.activeSafetySeconds, 0.1)
  assert.ok(entry.activeToGoogleRatio >= 0.45 && entry.activeToGoogleRatio <= 1.8)
  assert.ok(entry.directActiveSeconds > 0)
  assert.match(entry.sourceUrl, /^https:\/\/dictionary\.cambridge\.org\//)
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
  assert.ok(entry.activeDurationSeconds >= 0.22)
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
assert.equal(byCase.size, 11)
for (const [caseKey, labels] of byCase) {
  assert.equal(labels.size, 2, `Expected D18/R18 pair for ${caseKey}`)
  assert.ok(labels.has('D18'))
  assert.ok(labels.has('R18'))
  assert.notEqual(labels.get('D18').sha256, labels.get('R18').sha256)
}
assert.equal(hashes.size, 22)
assert.equal(readdirSync(publicRoot).filter((name) => name.endsWith('.mp3')).length, 22)
assert.equal(byCase.get('gaokao-frequency-2081-violin:american').get('R18').bareRepairText, 'violin')
assert.equal(byCase.get('gaokao-frequency-2684-era:american').get('R18').bareRepairText, 'eera')
assert.equal(byCase.get('gaokao-frequency-2823-dolphin:american').get('R18').bareRepairText, 'DAHL-fin')

const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-bare-word-owner-qa-v18.html')
assert.ok(existsSync(qaPath))
const html = readFileSync(qaPath, 'utf8')
assert.match(html, /11 条裸词返修｜V18/)
assert.match(html, /V17 已保留 3 条可用结果/)
assert.match(html, /gaokao-google-voice-qwen-bare-word-owner-qa-v18/)
console.log('PASS Google-voice Qwen V18: 11 unresolved cases, 22 bare-word candidates, 3 V17 results preserved')
