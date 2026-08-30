#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-violin-y-uh-lynn-v45')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-y-uh-lynn-v45')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v44QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-via-lynn-v44/owner-qa-summary-v44.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const ssml = '<speak>Please repeat <mark name="target-start"/>Y uh Lynn<mark name="target-end"/> once more.</speak>'
const [selection, v44Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v44QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') throw new Error('V45 must preserve the approved Google American female voice')
if (!v44Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.verdict === 'fail')) throw new Error('V45 requires explicit V44 rejection')

const fetchWithRetry = async (url, options, label) => {
  let lastError
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, options)
      if (response.ok || response.status < 500) return response
      lastError = new Error(`${label}: HTTP ${response.status}`)
    } catch (error) {
      lastError = error
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 400))
  }
  throw lastError
}

const tokenResponse = await fetchWithRetry('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: {'content-type': 'application/x-www-form-urlencoded'},
  body: new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  }),
}, 'ADC refresh')
if (!tokenResponse.ok) throw new Error(`ADC refresh failed with HTTP ${tokenResponse.status}`)
const {access_token: accessToken} = await tokenResponse.json()
const voice = selection.american
const response = await fetchWithRetry('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'x-goog-user-project': credentials.quota_project_id,
    'content-type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({
    input: {ssml},
    voice: {languageCode: voice.languageCode, name: voice.voice},
    audioConfig: {
      audioEncoding: 'LINEAR16',
      sampleRateHertz: selection.audioConfig.sampleRateHertz,
      speakingRate: selection.audioConfig.speakingRate,
    },
    enableTimePointing: ['SSML_MARK'],
  }),
}, 'V45 synthesis')
if (!response.ok) throw new Error(`Google V45 synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`)
const payload = await response.json()
const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error('Invalid V45 timepoints')

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const sourceWav = path.join(outputRoot, 'violin--y-uh-lynn.context.wav')
const contextFilename = 'gaokao-frequency-2081-violin--american--v45-context.mp3'
const cropFilename = 'gaokao-frequency-2081-violin--american--v45-y-uh-lynn.mp3'
const contextScratchPath = path.join(outputRoot, contextFilename)
const cropScratchPath = path.join(outputRoot, cropFilename)
await writeFile(sourceWav, Buffer.from(payload.audioContent, 'base64'))
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', sourceWav, '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', contextScratchPath])
const trimStart = Math.max(0, targetStart - 0.016)
const trimEnd = targetEnd + 0.025
const cropDuration = trimEnd - trimStart
const fadeOutStart = Math.max(0, cropDuration - 0.008)
execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', sourceWav,
  '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.004,afade=t=out:st=${fadeOutStart}:d=0.008`,
  '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', cropScratchPath,
])
await rm(sourceWav)
const contextBytes = await readFile(contextScratchPath)
const cropBytes = await readFile(cropScratchPath)
await Promise.all([
  writeFile(path.join(publicRoot, contextFilename), contextBytes),
  writeFile(path.join(publicRoot, cropFilename), cropBytes),
])

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const duration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], {encoding: 'utf8'})).format.duration)
const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-violin-y-uh-lynn-v45',
  status: 'private_local_candidate_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  changedVariable: 'Replace via Lynn with the owner-requested literal sequence Y uh Lynn, spoken continuously by the exact approved Neural2-C voice.',
  entry: {
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    candidateLabel: 'V45',
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    ssml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    trimStartSeconds: trimStart,
    trimEndSeconds: trimEnd,
    context: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-y-uh-lynn-v45/${contextFilename}`,
      bytes: contextBytes.length,
      sha256: sha256(contextBytes),
      durationSeconds: Number(duration(contextScratchPath).toFixed(3)),
    },
    crop: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-y-uh-lynn-v45/${cropFilename}`,
      bytes: cropBytes.length,
      sha256: sha256(cropBytes),
      durationSeconds: Number(duration(cropScratchPath).toFixed(3)),
    },
  },
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), contextSeconds: manifest.entry.context.durationSeconds, cropSeconds: manifest.entry.crop.durationSeconds}))
