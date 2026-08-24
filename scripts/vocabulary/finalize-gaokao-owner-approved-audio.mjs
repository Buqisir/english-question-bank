#!/usr/bin/env node

import {createHash} from 'node:crypto'
import {execFileSync} from 'node:child_process'
import {copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const readJson = (relativePath) => JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'))
const sha256 = (filePath) => createHash('sha256').update(readFileSync(filePath)).digest('hex')
const keyOf = (entryId, accent) => `${entryId}--${accent}`
const publicFile = (publicPath) => path.join(root, 'app/public', publicPath.replace(/^\//u, ''))
const round = (value) => Number(value.toFixed(6))

const manifestFiles = {
  v13: '.scratch/gaokao-google-voice-qwen-full-v13/manifest.json',
  v14: '.scratch/gaokao-google-voice-qwen-context-pilot-v14/manifest.json',
  v15: '.scratch/gaokao-google-voice-qwen-context-full-v15/manifest.json',
  v16: '.scratch/gaokao-google-voice-qwen-recovery-v16/manifest.json',
  v17: '.scratch/gaokao-google-voice-qwen-ipa-aligned-v17/manifest.json',
  v18: '.scratch/gaokao-google-voice-qwen-bare-word-v18/manifest.json',
  v20: '.scratch/gaokao-google-voice-qwen-owner-crop-v20/manifest.json',
  v21: '.scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/manifest.json',
  v22: '.scratch/gaokao-google-voice-qwen-seed-draw-v22/manifest.json',
  v24: '.scratch/gaokao-google-voice-qwen-natural-cadence-v24/manifest.json',
  v27: '.scratch/gaokao-google-voice-qwen-teacher-first-hello-v27/manifest.json',
  v31: '.scratch/gaokao-google-neural2-complete-phoneme-recut-v31/manifest.json',
  v47: '.scratch/gaokao-seed-vc-violin-v47/manifest.json',
}

const qaFiles = {
  v13: '.scratch/gaokao-google-voice-qwen-full-v13/owner-qa-summary-v13.json',
  v14: '.scratch/gaokao-google-voice-qwen-context-pilot-v14/owner-qa-summary-v14.json',
  v15: '.scratch/gaokao-google-voice-qwen-context-full-v15/owner-qa-summary-v15.json',
  v16: '.scratch/gaokao-google-voice-qwen-recovery-v16/owner-qa-summary-v16.json',
  v17: '.scratch/gaokao-google-voice-qwen-ipa-aligned-v17/owner-qa-summary-v17.json',
  v18: '.scratch/gaokao-google-voice-qwen-bare-word-v18/owner-qa-summary-v18.json',
  v20: '.scratch/gaokao-google-voice-qwen-exact-crop-v20/owner-qa-summary-v20.json',
  v21: '.scratch/gaokao-google-voice-qwen-phonetic-anchor-v21/owner-qa-summary-v21.json',
  v22: '.scratch/gaokao-google-voice-qwen-seed-draw-v22/owner-qa-summary-v22.json',
  v24: '.scratch/gaokao-google-voice-qwen-natural-cadence-v24/owner-qa-summary-v24.json',
  v27: '.scratch/gaokao-google-voice-qwen-teacher-first-hello-v27/owner-qa-summary-v27.json',
  v31: '.scratch/gaokao-google-neural2-complete-phoneme-recut-v31/owner-qa-summary-v31.json',
  v47: '.scratch/gaokao-seed-vc-violin-v47/owner-qa-summary-v47.json',
}

const manifests = Object.fromEntries(Object.entries(manifestFiles).map(([name, file]) => [name, readJson(file)]))
const qa = Object.fromEntries(Object.entries(qaFiles).map(([name, file]) => [name, readJson(file)]))
const selections = new Map()

function candidates(version) {
  const manifest = manifests[version]
  return manifest.entries ?? (manifest.entry ? [manifest.entry] : [])
}

function candidate(version, entryId, accent, candidateLabel) {
  const matches = candidates(version).filter((entry) => entry.entryId === entryId
    && (entry.accent ?? accent) === accent
    && (!candidateLabel || entry.candidateLabel === candidateLabel))
  if (matches.length !== 1) throw new Error(`${version}: expected one ${entryId}/${accent}/${candidateLabel ?? '*'}, got ${matches.length}`)
  return matches[0]
}

function select(version, entryId, accent, candidateLabel, evidence = qaFiles[version]) {
  const key = keyOf(entryId, accent)
  if (selections.has(key)) throw new Error(`Duplicate final selection for ${key}`)
  const chosen = candidate(version, entryId, accent, candidateLabel)
  selections.set(key, {version: version.toUpperCase(), candidateLabel: chosen.candidateLabel ?? version.toUpperCase(), evidence, chosen})
}

for (const entry of qa.v13.acceptedQwen) select('v13', entry.entryId, entry.accent)
for (const entry of qa.v13.keepOriginal) {
  const originalManifestPath = `.scratch/gaokao-audio-original-word-repair-v5/${entry.accent}-manifest.json`
  const original = readJson(originalManifestPath).entries.find((candidateEntry) => candidateEntry.entryId === entry.entryId)
  if (!original) throw new Error(`Missing original-word candidate for ${entry.id}`)
  const publicPath = `/vocabulary-assets/gaokao-frequency-v1/audio/original-word-repair-v5/${entry.accent}/${entry.entryId}.mp3`
  selections.set(entry.id, {version: 'ORIGINAL-V5', candidateLabel: 'Google original word', evidence: qaFiles.v13, chosen: {...original, accent: entry.accent, publicPath}})
}
for (const entry of qa.v14.entries.filter((entry) => entry.verdict === 'c14_usable')) select('v14', entry.entryId, entry.accent)
for (const entry of qa.v14.entries.filter((entry) => entry.verdict === 'keep_v13')) select('v13', entry.entryId, entry.accent, undefined, qaFiles.v14)
for (const entry of qa.v15.usable) select('v15', entry.entryId, entry.accent)
for (const entry of qa.v16.v16Usable) select('v16', entry.entryId, entry.accent, entry.candidateLabel)
for (const entry of qa.v16.keepPrior) select('v15', entry.entryId, entry.accent, undefined, qaFiles.v16)
for (const entry of qa.v17.entries) {
  if (entry.verdict === 'c17_usable') select('v17', entry.entryId, entry.accent, 'C17')
  if (entry.verdict === 'p17_usable') select('v17', entry.entryId, entry.accent, 'P17')
}
for (const entry of qa.v18.entries) {
  if (entry.verdict === 'r18_usable') select('v18', entry.entryId, entry.accent, 'R18')
  if (entry.verdict === 'd18_usable') select('v18', entry.entryId, entry.accent, 'D18')
}
select('v20', 'gaokao-frequency-2739-ad-a-d', 'british', 'O20')
for (const entry of qa.v21.entries.filter((entry) => entry.verdict === 'a21_usable')) select('v21', entry.entryId, entry.accent, 'A21')
for (const entry of qa.v22.entries.filter((entry) => entry.verdict === 'c22_usable')) select('v22', entry.entryId, entry.accent, 'C22')
for (const entry of qa.v24.entries.filter((entry) => entry.verdict === 'a24_usable')) select('v24', entry.entryId, entry.accent, 'A24')
for (const entry of qa.v27.entries.filter((entry) => entry.verdict === 'a27_usable')) select('v27', entry.entryId, entry.accent, 'A27')
for (const entry of qa.v31.entries.filter((entry) => entry.verdict === 'a31_usable')) select('v31', entry.entryId, 'american', 'A31')
for (const entry of qa.v47.entries.filter((entry) => String(entry.verdict).includes('usable'))) select('v47', entry.entryId, 'american', 'V47-Seed-VC')

const repairPlanPath = 'data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json'
const repairPlan = readJson(repairPlanPath)
const expectedKeys = repairPlan.entries.flatMap((entry) => Object.keys(entry.repairs).map((accent) => keyOf(entry.entryId, accent)))
if (expectedKeys.length !== 158 || new Set(expectedKeys).size !== 158) throw new Error('Repair plan no longer contains exactly 158 accent assets')
const missing = expectedKeys.filter((key) => !selections.has(key))
const extra = [...selections.keys()].filter((key) => !expectedKeys.includes(key))
if (missing.length || extra.length) throw new Error(`Final selection mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`)

function analyzeAudio(filePath) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate:format=duration', '-of', 'json', filePath], {encoding: 'utf8'}))
  const stream = probe.streams[0]
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', filePath, '-f', 'f32le', '-ac', '1', '-ar', '24000', 'pipe:1'], {maxBuffer: 20 * 1024 * 1024})
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4))
  let peak = 0
  let sumSquares = 0
  let first = samples.length
  let last = -1
  for (let index = 0; index < samples.length; index += 1) {
    const absolute = Math.abs(samples[index])
    peak = Math.max(peak, absolute)
    sumSquares += samples[index] * samples[index]
    if (absolute >= 0.001) {
      first = Math.min(first, index)
      last = index
    }
  }
  return {
    codec: stream.codec_name,
    sampleRate: Number(stream.sample_rate),
    channels: Number(stream.channels),
    bitrate: Number(stream.bit_rate || 0),
    durationSeconds: round(Number(probe.format.duration)),
    peak: round(peak),
    rms: round(Math.sqrt(sumSquares / samples.length)),
    leadingSilenceSeconds: round(first / 24000),
    trailingSilenceSeconds: round((samples.length - 1 - last) / 24000),
  }
}

const fullManifestPaths = {
  american: 'data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json',
  british: 'data/vocabulary/gaokao-frequency-full-british-audio-manifest-v1.json',
}
const fullManifests = Object.fromEntries(Object.entries(fullManifestPaths).map(([accent, file]) => [accent, readJson(file)]))
const ownerQaPath = 'docs/cuts/gaokao-vocabulary-3000/evidence/gaokao-frequency-full-3000-audio-owner-qa-v1.json'
const ownerQa = readJson(ownerQaPath)
const initialQaById = new Map(ownerQa.qa.map((entry) => [entry.entryId, entry]))
if (initialQaById.size !== 3000) throw new Error('Expected 3000 initial Owner QA rows')

const prepared = []
for (const [key, selection] of selections) {
  const [entryId, accent] = key.match(/^(.*)--(american|british)$/u).slice(1)
  const sourcePath = publicFile(selection.chosen.publicPath)
  if (!existsSync(sourcePath)) throw new Error(`Missing selected source: ${selection.chosen.publicPath}`)
  if (sha256(sourcePath) !== selection.chosen.sha256) throw new Error(`Selected source hash mismatch: ${selection.chosen.publicPath}`)
  const formalEntry = fullManifests[accent].entries.find((entry) => entry.entryId === entryId)
  if (!formalEntry) throw new Error(`Missing formal manifest row for ${key}`)
  const formalPublicPath = `${fullManifests[accent].publicBasePath}/${formalEntry.path}`
  prepared.push({key, entryId, accent, selection, sourcePath, formalEntry, formalPublicPath, formalPath: publicFile(formalPublicPath), metrics: analyzeAudio(sourcePath)})
}

const backupRoot = path.join(root, '.scratch/gaokao-audio-owner-finalize-v1/backup-before-finalization')
if (existsSync(backupRoot)) throw new Error(`Refusing to overwrite existing backup: ${backupRoot}`)
mkdirSync(backupRoot, {recursive: true})
for (const [accent, manifestPath] of Object.entries(fullManifestPaths)) {
  mkdirSync(path.join(backupRoot, accent, 'audio'), {recursive: true})
  copyFileSync(path.join(root, manifestPath), path.join(backupRoot, accent, 'manifest.json'))
}
for (const item of prepared) copyFileSync(item.formalPath, path.join(backupRoot, item.accent, 'audio', item.formalEntry.path))

const replaced = []
try {
  for (const item of prepared) {
    const temporary = `${item.formalPath}.owner-finalize-tmp`
    copyFileSync(item.sourcePath, temporary)
    renameSync(temporary, item.formalPath)
    replaced.push(item)
  }
} catch (error) {
  for (const item of replaced.reverse()) copyFileSync(path.join(backupRoot, item.accent, 'audio', item.formalEntry.path), item.formalPath)
  throw error
}

const selectionRows = prepared.map((item) => ({
  entryId: item.entryId,
  headword: item.formalEntry.headword,
  accent: item.accent,
  sourceVersion: item.selection.version,
  candidateLabel: item.selection.candidateLabel,
  ownerEvidence: item.selection.evidence,
  sourcePublicPath: item.selection.chosen.publicPath,
  sourceSha256: item.selection.chosen.sha256,
  formalPublicPath: item.formalPublicPath,
  finalSha256: item.selection.chosen.sha256,
  ...item.metrics,
})).sort((left, right) => left.entryId.localeCompare(right.entryId) || left.accent.localeCompare(right.accent))

const selectionManifest = {
  schemaVersion: 'gaokao-frequency-audio-owner-selections-v1',
  status: 'owner_approved',
  approvedAt: '2026-08-18',
  programId: 'gaokao-curriculum-3000-frequency-v1',
  counts: {
    repairedEntries: new Set(selectionRows.map((entry) => entry.entryId)).size,
    repairedAccentAssets: selectionRows.length,
    american: selectionRows.filter((entry) => entry.accent === 'american').length,
    british: selectionRows.filter((entry) => entry.accent === 'british').length,
  },
  entries: selectionRows,
}

function writeJsonAtomic(relativePath, value) {
  const destination = path.join(root, relativePath)
  const temporary = `${destination}.owner-finalize-tmp`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, destination)
}

const selectedByKey = new Map(selectionRows.map((entry) => [keyOf(entry.entryId, entry.accent), entry]))
for (const [accent, manifest] of Object.entries(fullManifests)) {
  const finalized = {
    ...manifest,
    status: 'owner_approved',
    ownerQa: {initialAudit: ownerQaPath, repairSelections: 'data/vocabulary/gaokao-frequency-audio-owner-selections-v1.json'},
    entries: manifest.entries.map((entry) => {
      const selected = selectedByKey.get(keyOf(entry.entryId, accent))
      if (!selected) return {...entry, qa: {status: 'owner_approved', ownerVerdict: 'pass', evidence: ownerQaPath}}
      return {
        ...entry,
        bytes: readFileSync(publicFile(selected.formalPublicPath)).length,
        sha256: selected.finalSha256,
        codec: selected.codec,
        sampleRate: selected.sampleRate,
        channels: selected.channels,
        bitrate: selected.bitrate,
        durationSeconds: selected.durationSeconds,
        peak: selected.peak,
        rms: selected.rms,
        leadingSilenceSeconds: selected.leadingSilenceSeconds,
        trailingSilenceSeconds: selected.trailingSilenceSeconds,
        qa: {
          status: 'owner_approved',
          ownerVerdict: 'repaired_owner_approved',
          sourceVersion: selected.sourceVersion,
          candidateLabel: selected.candidateLabel,
          sourceSha256: selected.sourceSha256,
          evidence: selected.ownerEvidence,
        },
      }
    }),
  }
  writeJsonAtomic(fullManifestPaths[accent], finalized)
  fullManifests[accent] = finalized
}

for (const accent of ['american', 'british']) {
  const goldenPath = `data/vocabulary/gaokao-frequency-golden-${accent}-audio-manifest-v1.json`
  const golden = readJson(goldenPath)
  const fullById = new Map(fullManifests[accent].entries.map((entry) => [entry.entryId, entry]))
  writeJsonAtomic(goldenPath, {...golden, status: 'owner_approved', entries: golden.entries.map((entry) => fullById.get(entry.entryId))})
}

writeJsonAtomic('data/vocabulary/gaokao-frequency-audio-owner-selections-v1.json', selectionManifest)
writeJsonAtomic(repairPlanPath, {
  ...repairPlan,
  status: 'owner_approved_finalized',
  finalizedAt: '2026-08-18',
  ownerSelectionManifest: 'data/vocabulary/gaokao-frequency-audio-owner-selections-v1.json',
  backupPath: '.scratch/gaokao-audio-owner-finalize-v1/backup-before-finalization',
})

console.log(JSON.stringify(selectionManifest.counts, null, 2))
