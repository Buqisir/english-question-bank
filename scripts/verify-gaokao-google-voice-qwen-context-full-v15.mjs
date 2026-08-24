#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scratchRoot = path.join(root, '.scratch/gaokao-google-voice-qwen-context-full-v15')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-voice-qwen-context-full-v15')
const manifest = JSON.parse(readFileSync(path.join(scratchRoot, 'manifest.json'), 'utf8'))
const v13 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-full-v13/manifest.json'), 'utf8'))
const v13Qa = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-full-v13/owner-qa-summary-v13.json'), 'utf8'))
const v14 = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-context-pilot-v14/manifest.json'), 'utf8'))
const v14Qa = JSON.parse(readFileSync(path.join(root, '.scratch/gaokao-google-voice-qwen-context-pilot-v14/owner-qa-summary-v14.json'), 'utf8'))
assert.equal(v14Qa.counts.c14Usable, 8)
assert.equal(v14Qa.counts.keepV13, 1)
assert.equal(v14Qa.counts.failed, 6)
assert.equal(manifest.schemaVersion, 'gaokao-frequency-google-voice-qwen-context-full-v15')
assert.equal(manifest.status, 'private_local_candidates_pending_owner_qa')
assert.equal(manifest.formalAssetsChanged, false)
assert.equal(manifest.distribution, 'local_private_evaluation_only')
assert.equal(manifest.generationMode, 'target-in-syntactic-context')
assert.equal(manifest.plannedCandidates, 34)
assert.equal(manifest.entries.length, 34)
assert.equal(manifest.failures.length, 0)
const remainingKeys = new Set(v13Qa.remaining.map((entry) => `${entry.entryId}:${entry.accent}`))
const pilotKeys = new Set(v14.entries.map((entry) => `${entry.entryId}:${entry.accent}`))
const expectedKeys = new Set([...remainingKeys].filter((key) => !pilotKeys.has(key)))
assert.equal(expectedKeys.size, 34)
const oldByKey = new Map(v13.entries.map((entry) => [`${entry.entryId}:${entry.accent}`, entry]))
const carrierContexts = new Set([
  'Listen to\u0000once more',
  'Here comes\u0000clearly',
  'We say\u0000now',
])
const hashes = new Set()
for (const entry of manifest.entries) {
  const key = `${entry.entryId}:${entry.accent}`
  const old = oldByKey.get(key)
  assert.ok(expectedKeys.has(key))
  assert.ok(old)
  assert.notEqual(entry.sha256, old.sha256)
  assert.ok(entry.contextBefore)
  assert.ok(entry.contextAfter)
  const usedExactContext = entry.contextBeforeUsed === entry.contextBefore && entry.contextAfterUsed === entry.contextAfter
  const usedCarrierContext = carrierContexts.has(`${entry.contextBeforeUsed}\u0000${entry.contextAfterUsed}`)
  assert.ok(usedExactContext || usedCarrierContext)
  assert.equal(
    entry.contextStrategyUsed,
    usedExactContext ? 'target-specific-syntactic-context' : 'recorded-carrier-context',
  )
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
assert.equal(new Set(manifest.entries.map((entry) => `${entry.entryId}:${entry.accent}`)).size, 34)
assert.equal(hashes.size, 34)
assert.equal(readdirSync(publicRoot).filter((name) => name.endsWith('.mp3')).length, 34)
const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/google-voice-qwen-context-full-owner-qa-v15.html')
assert.ok(existsSync(qaPath))
const html = readFileSync(qaPath, 'utf8')
assert.match(html, /上下文修复全量｜C15/)
assert.match(html, /gaokao-google-voice-qwen-context-full-owner-qa-v15/)
console.log('PASS Google-voice Qwen C15: 34 context-first candidates cover every V14-untested V13 Owner-QA failure')
