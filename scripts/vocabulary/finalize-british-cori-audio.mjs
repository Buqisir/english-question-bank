#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { copyFile, mkdir, mkdtemp, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repo = resolve(scriptDirectory, '../..')
const version = 'eqb-british-cori-high-v1'
const publicRoot = join(repo, 'app/public/vocabulary-assets/wanwei-round-one-v1/audio')
const outputDirectory = join(publicRoot, version)
const manifestPath = join(repo, 'data/vocabulary/wanwei-british-cori-audio-manifest-v1.json')
const receiptPath = join(repo, 'data/vocabulary/wanwei-british-cori-audio-receipt-v1.json')

const sources = {
  full: {
    root: join(repo, '.scratch/vocabulary-british-cori-full-v1'),
    manifest: 'generated-manifest.json',
    state: 'qa-state.json',
    audio: 'mp3',
  },
  repair75: {
    root: join(repo, '.scratch/vocabulary-british-cori-repair-75'),
    manifest: 'candidate-manifest.json',
    state: 'qa-state.json',
    audio: 'candidates',
  },
  repair6: {
    root: join(repo, '.scratch/vocabulary-british-cori-repair-6'),
    manifest: 'candidate-manifest.json',
    state: 'qa-state.json',
    audio: 'candidates',
  },
  repair2: {
    root: join(repo, '.scratch/vocabulary-british-cori-repair-2'),
    manifest: 'candidate-manifest.json',
    state: 'qa-state.json',
    audio: 'candidates',
  },
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

async function readSource(source) {
  const [manifestBytes, stateBytes] = await Promise.all([
    readFile(join(source.root, source.manifest)),
    readFile(join(source.root, source.state)),
  ])
  return {
    ...source,
    manifestBytes,
    stateBytes,
    manifest: JSON.parse(manifestBytes),
    state: JSON.parse(stateBytes),
  }
}

function mapManifestEntries(source) {
  return new Map(source.manifest.entries.map((entry) => [entry.entryId, entry]))
}

function requireCounts(source, expected) {
  const decisions = Object.values(source.state.decisions ?? {})
  const actual = Object.fromEntries(Object.entries(expected).map(([status]) => [status, decisions.filter((decision) => decision.status === status).length]))
  for (const [status, count] of Object.entries(expected)) {
    if (actual[status] !== count) throw new Error(`${source.root} expected ${status}=${count}, found ${actual[status]}`)
  }
}

function selectedCandidate(source, entryId) {
  const decision = source.state.decisions?.[entryId]
  if (decision?.status !== 'selected') return null
  const entry = source.entries.get(entryId)
  const candidate = entry?.candidates?.find((item) => item.label === decision.candidate)
  if (!candidate) throw new Error(`Missing selected candidate ${entryId} ${decision.candidate}`)
  return { candidate, decision, manifestEntry: entry }
}

function safeAssetPath(source, relativePath) {
  if (!relativePath || basename(relativePath) !== relativePath) throw new Error(`Unsafe audio path: ${relativePath}`)
  return join(source.root, source.audio, relativePath)
}

const [full, repair75, repair6, repair2] = await Promise.all(Object.values(sources).map(readSource))
full.entries = mapManifestEntries(full)
repair75.entries = mapManifestEntries(repair75)
repair6.entries = mapManifestEntries(repair6)
repair2.entries = mapManifestEntries(repair2)

requireCounts(full, { pass: 1525, problem: 75 })
requireCounts(repair75, { selected: 69, unresolved: 6 })
requireCounts(repair6, { selected: 4, unresolved: 2 })
requireCounts(repair2, { selected: 2, unresolved: 0 })
if (full.manifest.entries.length !== 1600) throw new Error(`Expected 1600 full manifest entries`)

const finalEntries = []
const lineageCounts = { 'owner-pass': 0, 'repair-75': 0, 'repair-6': 0, 'repair-2': 0 }
for (const original of full.manifest.entries) {
  const entryId = original.entryId
  const fullDecision = full.state.decisions?.[entryId]
  let source = full
  let chosen = original
  let lineage = { stage: 'owner-pass', candidate: null, generationMethod: 'cori-full-v1' }
  if (fullDecision?.status === 'problem') {
    const first = selectedCandidate(repair75, entryId)
    const second = selectedCandidate(repair6, entryId)
    const third = selectedCandidate(repair2, entryId)
    const resolved = third
      ? { source: repair2, selected: third, stage: 'repair-2' }
      : second
        ? { source: repair6, selected: second, stage: 'repair-6' }
        : first
          ? { source: repair75, selected: first, stage: 'repair-75' }
          : null
    if (!resolved) throw new Error(`Owner-rejected entry never resolved: ${entryId}`)
    source = resolved.source
    chosen = resolved.selected.candidate
    lineage = {
      stage: resolved.stage,
      candidate: resolved.selected.decision.candidate,
      generationMethod: chosen.generationMethod ?? chosen.promptShape ?? 'repair-candidate',
      generationText: chosen.generationText ?? chosen.spokenForms?.join(', ') ?? original.text,
      ownerNote: resolved.selected.manifestEntry.ownerNote ?? null,
    }
  } else if (fullDecision?.status !== 'pass') {
    throw new Error(`Unexpected full QA decision for ${entryId}`)
  }
  lineageCounts[lineage.stage] += 1
  const sourcePath = safeAssetPath(source, chosen.path)
  const bytes = await readFile(sourcePath)
  if (sha256(bytes) !== chosen.sha256) throw new Error(`Source hash mismatch: ${sourcePath}`)
  finalEntries.push({
    entryId,
    text: original.text,
    path: `${entryId}.mp3`,
    bytes: bytes.length,
    sha256: chosen.sha256,
    voice: version,
    format: 'audio-24khz-48kbitrate-mono-mp3',
    version,
    codec: 'mp3',
    sampleRate: 24000,
    channels: 1,
    bitrate: 48000,
    durationSeconds: chosen.durationSeconds,
    peak: chosen.peak,
    rms: chosen.rms,
    leadingSilenceSeconds: chosen.leadingSilenceSeconds,
    trailingSilenceSeconds: chosen.trailingSilenceSeconds,
    lineage,
    sourcePath,
  })
}

if (Object.values(lineageCounts).join(',') !== '1525,69,4,2') throw new Error(`Unexpected final lineage: ${JSON.stringify(lineageCounts)}`)
if (new Set(finalEntries.map((entry) => entry.entryId)).size !== 1600) throw new Error('Final entryId uniqueness gate failed')
if (new Set(finalEntries.map((entry) => entry.path)).size !== 1600) throw new Error('Final path uniqueness gate failed')
if (new Set(finalEntries.map((entry) => entry.sha256)).size !== 1600) throw new Error('Final audio hash uniqueness gate failed')

try {
  await stat(outputDirectory)
  throw new Error(`Refusing to overwrite existing British audio directory: ${outputDirectory}`)
} catch (error) {
  if (error?.code !== 'ENOENT') throw error
}
const incomingDirectory = await mkdtemp(join(publicRoot, `.${version}.incoming-`))
for (const [index, entry] of finalEntries.entries()) {
  await copyFile(entry.sourcePath, join(incomingDirectory, entry.path))
  if ((index + 1) % 200 === 0) console.log(`${index + 1}/1600 British assets assembled`)
}

const profileBytes = await readFile(join(repo, '.scratch/vocabulary-british-reference-abc-12/profile-c.json'))
const profile = JSON.parse(profileBytes)
const manifest = {
  schemaVersion: 'wanwei-vocabulary-audio-manifest-v1',
  voice: version,
  format: 'audio-24khz-48kbitrate-mono-mp3',
  version,
  accent: 'british',
  generator: {
    runtime: profile.runtime,
    base: profile.base,
    referenceSha256: profile.reference.sha256,
    referenceOrigin: profile.licensing.referenceOrigin,
    identity: profile.identity,
  },
  ownerQa: {
    completedAt: '2026-08-09',
    entryCount: 1600,
    lineageCounts,
    verdict: 'approved',
  },
  entries: finalEntries.map(({ sourcePath: _sourcePath, ...entry }) => entry),
}
const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
const sourceEvidence = Object.fromEntries([
  ['full', full], ['repair75', repair75], ['repair6', repair6], ['repair2', repair2],
].map(([name, source]) => [name, {
  manifestSha256: sha256(source.manifestBytes),
  qaStateSha256: sha256(source.stateBytes),
}]))
const receipt = {
  schemaVersion: 'eqb-british-cori-audio-finalization-v1',
  verdict: 'passed',
  version,
  entryCount: 1600,
  uniqueEntryIds: 1600,
  uniquePaths: 1600,
  uniqueHashes: 1600,
  lineageCounts,
  manifestSha256: sha256(manifestBytes),
  profileSha256: sha256(profileBytes),
  sourceEvidence,
  formalAmericanAssetsChanged: false,
  databaseChanged: false,
}
const ready = {
  version,
  entryCount: 1600,
  fileNamePattern: '{entryId}.mp3',
  manifestSha256: receipt.manifestSha256,
  ownerQa: 'approved',
}
await Promise.all([
  writeFile(`${manifestPath}.incoming`, manifestBytes),
  writeFile(`${receiptPath}.incoming`, `${JSON.stringify(receipt, null, 2)}\n`),
  writeFile(join(incomingDirectory, 'ready.json'), `${JSON.stringify(ready, null, 2)}\n`),
])
for (const entry of finalEntries) {
  const copied = await readFile(join(incomingDirectory, entry.path))
  if (sha256(copied) !== entry.sha256) throw new Error(`Copied asset hash mismatch: ${entry.entryId}`)
}
await Promise.all([
  rename(`${manifestPath}.incoming`, manifestPath),
  rename(`${receiptPath}.incoming`, receiptPath),
  rename(incomingDirectory, outputDirectory),
])
console.log(JSON.stringify({ outputDirectory, manifestPath, receiptPath, ...receipt }, null, 2))
