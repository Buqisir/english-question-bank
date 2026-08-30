#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import path from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const scratchRoot = path.join(root, '.scratch/gaokao-seed-vc-violin-v47')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/seed-vc-violin-rescue-v47')
const sourcePath = path.join(scratchRoot, 'input/cambridge-violin-source.wav')
const referencePath = path.join(scratchRoot, 'input/google-neural2-c-reference.wav')
const convertedPath = path.join(scratchRoot, 'output/vc_cambridge-violin-source_google-neural2-c-reference_1.0_30_0.7.wav')
const v46QaPath = path.join(root, '.scratch/gaokao-google-c-family-violin-rescue-v46/owner-qa-summary-v46.json')

const v46Qa = JSON.parse(await readFile(v46QaPath, 'utf8'))
if (!v46Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.verdict === 'fail')) throw new Error('V47 requires explicit V46 rejection')

await Promise.all([mkdir(scratchRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const filename = 'gaokao-frequency-2081-violin--american--v47-seed-vc-google-c.mp3'
const scratchMp3 = path.join(scratchRoot, filename)
const durationSeconds = Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', convertedPath], {encoding: 'utf8'})).format.duration)
const fadeOutStart = Math.max(0, durationSeconds - 0.008)
execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', convertedPath,
  '-af', `volume=-3.2dB,afade=t=in:st=0:d=0.004,afade=t=out:st=${fadeOutStart}:d=0.008`,
  '-ar', '24000', '-ac', '1', '-b:a', '64k', scratchMp3,
])

const [sourceBytes, referenceBytes, convertedBytes, candidateBytes] = await Promise.all([
  readFile(sourcePath),
  readFile(referencePath),
  readFile(convertedPath),
  readFile(scratchMp3),
])
await writeFile(path.join(publicRoot, filename), candidateBytes)
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const packagedDuration = Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', scratchMp3], {encoding: 'utf8'})).format.duration)
const manifest = {
  schemaVersion: 'gaokao-frequency-seed-vc-violin-rescue-v47',
  status: 'private_local_candidate_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  method: 'True audio-to-audio zero-shot voice conversion. Cambridge pronunciation/prosody is the immutable source; Google Neural2-C audio supplies only target timbre.',
  source: {
    label: 'Cambridge US violin pronunciation master',
    url: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
    sha256: sha256(sourceBytes),
    durationSeconds: 0.913,
    asr: 'violin',
  },
  targetReference: {
    label: 'Ten existing Google Neural2-C vocabulary clips, no violin content',
    sha256: sha256(referenceBytes),
    durationSeconds: 9.336,
  },
  conversion: {
    model: 'Plachtaa/Seed-VC v1 offline voice conversion',
    sourceSha256: sha256(sourceBytes),
    targetReferenceSha256: sha256(referenceBytes),
    rawOutputSha256: sha256(convertedBytes),
    diffusionSteps: 30,
    inferenceCfgRate: 0.7,
    lengthAdjust: 1,
    rawDurationSeconds: Number(durationSeconds.toFixed(3)),
    rawAsr: 'violin',
    packagingGainDb: -3.2,
  },
  entry: {
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    candidateLabel: 'V47-Seed-VC',
    publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/seed-vc-violin-rescue-v47/${filename}`,
    bytes: candidateBytes.length,
    sha256: sha256(candidateBytes),
    durationSeconds: Number(packagedDuration.toFixed(3)),
  },
}
await writeFile(path.join(scratchRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(scratchRoot, 'manifest.json'), durationSeconds: manifest.entry.durationSeconds, asr: manifest.conversion.rawAsr}))
