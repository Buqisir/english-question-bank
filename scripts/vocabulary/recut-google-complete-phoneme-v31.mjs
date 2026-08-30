#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const v30Root = path.join(root, '.scratch/gaokao-google-neural2-complete-phoneme-v30')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-complete-phoneme-recut-v31')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-complete-phoneme-recut-v31')
const [v30, ownerQa] = await Promise.all([
  readFile(path.join(v30Root, 'manifest.json'), 'utf8').then(JSON.parse),
  readFile(path.join(v30Root, 'owner-qa-summary-v30.json'), 'utf8').then(JSON.parse),
])

if (v30.schemaVersion !== 'gaokao-frequency-google-neural2-complete-phoneme-v30') throw new Error('V31 requires V30')
if (ownerQa.counts?.pronunciationUsable !== 2 || ownerQa.counts?.cropNeedsRepair !== 2) {
  throw new Error('V31 requires both C30 pronunciations to be usable with crop repair needed')
}

const sourceEntries = v30.entries.filter((entry) => entry.candidateLabel === 'C30')
if (sourceEntries.length !== 2) throw new Error('V31 requires exactly two C30 sources')

const variants = {
  A31: {removeLeadingSeconds: 0.035, removeTrailingSeconds: 0.080, description: 'exact-ssml-mark-boundaries'},
  B31: {removeLeadingSeconds: 0.025, removeTrailingSeconds: 0.065, description: 'micro-safety-boundaries'},
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const probeDuration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath,
], {encoding: 'utf8'})).format.duration)

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const entries = []
for (const source of sourceEntries) {
  const sourcePath = path.join(root, 'app/public', source.publicPath.replace(/^\//, ''))
  const sourceBytes = await readFile(sourcePath)
  if (sha256(sourceBytes) !== source.sha256) throw new Error(`C30 source hash mismatch: ${source.headword}`)
  const sourceDuration = probeDuration(sourcePath)
  for (const [candidateLabel, variant] of Object.entries(variants)) {
    const trimEnd = sourceDuration - variant.removeTrailingSeconds
    if (trimEnd <= variant.removeLeadingSeconds + 0.3) throw new Error(`V31 crop is too short: ${source.headword} ${candidateLabel}`)
    const outputFilename = `${source.entryId}--american--${candidateLabel.toLowerCase()}.mp3`
    const scratchPath = path.join(outputRoot, outputFilename)
    const publicPath = path.join(publicRoot, outputFilename)
    const trimmedDuration = trimEnd - variant.removeLeadingSeconds
    const fadeOutStart = Math.max(0, trimmedDuration - 0.008)
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', sourcePath,
      '-af', `atrim=start=${variant.removeLeadingSeconds}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.006,afade=t=out:st=${fadeOutStart}:d=0.008`,
      '-ar', '24000', '-ac', '1', '-b:a', '64k', scratchPath,
    ])
    execFileSync('ffmpeg', ['-v', 'error', '-i', scratchPath, '-f', 'null', '-'])
    const bytes = await readFile(scratchPath)
    await writeFile(publicPath, bytes)
    entries.push({
      ...source,
      candidateLabel,
      strategy: `c30-pronunciation-preserving-${variant.description}`,
      sourceCandidateLabel: 'C30',
      sourcePublicPath: source.publicPath,
      sourceSha256: source.sha256,
      sourceDurationSeconds: sourceDuration,
      removedLeadingSeconds: variant.removeLeadingSeconds,
      removedTrailingSeconds: variant.removeTrailingSeconds,
      path: outputFilename,
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-complete-phoneme-recut-v31/${outputFilename}`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(probeDuration(scratchPath).toFixed(3)),
    })
  }
}

const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-complete-phoneme-recut-v31',
  status: 'private_local_candidates_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  strategy: 'Recut the owner-approved C30 pronunciation only; no synthesis, voice change, pronunciation change, time stretching, or gain processing.',
  sourceManifest: '.scratch/gaokao-google-neural2-complete-phoneme-v30/manifest.json',
  ownerQa: '.scratch/gaokao-google-neural2-complete-phoneme-v30/owner-qa-summary-v30.json',
  variants,
  entries,
  failures: [],
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), candidates: entries.length, failures: 0}))
