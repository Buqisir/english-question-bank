#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-c-family-violin-rescue-v46')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-c-family-violin-rescue-v46')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v45QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-y-uh-lynn-v45/owner-qa-summary-v45.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')
const requestedVoices = ['en-US-Wavenet-C', 'en-US-Standard-C']
const ssml = '<speak>She plays the <mark name="target-start"/>violin<mark name="target-end"/> beautifully every day.</speak>'

const [selection, v45Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v45QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') throw new Error('V46 must compare against the approved Google American C female voice')
if (!v45Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.verdict === 'fail')) throw new Error('V46 requires explicit V45 rejection')

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
const authorizationHeaders = {
  authorization: `Bearer ${accessToken}`,
  'x-goog-user-project': credentials.quota_project_id,
  'content-type': 'application/json; charset=utf-8',
}

const voicesResponse = await fetchWithRetry('https://texttospeech.googleapis.com/v1/voices?languageCode=en-US', {headers: authorizationHeaders}, 'Google voice list')
if (!voicesResponse.ok) throw new Error(`Google voice list HTTP ${voicesResponse.status}`)
const availableVoices = new Map((await voicesResponse.json()).voices.map((voice) => [voice.name, voice]))
for (const voiceName of requestedVoices) {
  const listedVoice = availableVoices.get(voiceName)
  if (!listedVoice || listedVoice.ssmlGender !== 'FEMALE') throw new Error(`Required Google female voice unavailable: ${voiceName}`)
}

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const duration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], {encoding: 'utf8'})).format.duration)
const entries = []

for (const voiceName of requestedVoices) {
  const slug = voiceName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')
  const response = await fetchWithRetry('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
    method: 'POST',
    headers: authorizationHeaders,
    body: JSON.stringify({
      input: {ssml},
      voice: {languageCode: 'en-US', name: voiceName},
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: selection.audioConfig.sampleRateHertz,
        speakingRate: selection.audioConfig.speakingRate,
      },
      enableTimePointing: ['SSML_MARK'],
    }),
  }, `V46 ${voiceName} synthesis`)
  if (!response.ok) throw new Error(`Google V46 ${voiceName} synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`)
  const payload = await response.json()
  const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
  const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error(`Invalid V46 ${voiceName} timepoints`)

  const sourceWav = path.join(outputRoot, `${slug}.context.wav`)
  const contextFilename = `gaokao-frequency-2081-violin--american--v46-${slug}-context.mp3`
  const cropFilename = `gaokao-frequency-2081-violin--american--v46-${slug}-crop.mp3`
  const contextScratchPath = path.join(outputRoot, contextFilename)
  const cropScratchPath = path.join(outputRoot, cropFilename)
  await writeFile(sourceWav, Buffer.from(payload.audioContent, 'base64'))
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', sourceWav, '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', contextScratchPath])
  const trimStart = Math.max(0, targetStart - 0.022)
  const trimEnd = targetEnd + 0.035
  const cropDuration = trimEnd - trimStart
  const fadeOutStart = Math.max(0, cropDuration - 0.010)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', sourceWav,
    '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.005,afade=t=out:st=${fadeOutStart}:d=0.010`,
    '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', cropScratchPath,
  ])
  await rm(sourceWav)
  const [contextBytes, cropBytes] = await Promise.all([readFile(contextScratchPath), readFile(cropScratchPath)])
  await Promise.all([
    writeFile(path.join(publicRoot, contextFilename), contextBytes),
    writeFile(path.join(publicRoot, cropFilename), cropBytes),
  ])
  entries.push({
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    candidateLabel: voiceName === 'en-US-Wavenet-C' ? 'V46-WaveNet-C' : 'V46-Standard-C',
    voice: voiceName,
    speakingRate: selection.audioConfig.speakingRate,
    ssml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    trimStartSeconds: trimStart,
    trimEndSeconds: trimEnd,
    context: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-c-family-violin-rescue-v46/${contextFilename}`,
      bytes: contextBytes.length,
      sha256: sha256(contextBytes),
      durationSeconds: Number(duration(contextScratchPath).toFixed(3)),
    },
    crop: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-c-family-violin-rescue-v46/${cropFilename}`,
      bytes: cropBytes.length,
      sha256: sha256(cropBytes),
      durationSeconds: Number(duration(cropScratchPath).toFixed(3)),
    },
  })
}

const manifest = {
  schemaVersion: 'gaokao-frequency-google-c-family-violin-rescue-v46',
  status: 'private_local_candidates_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  changedVariable: 'Keep Google en-US C female voice naming while switching only the synthesis engine from Neural2 to WaveNet or Standard.',
  entries,
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), candidates: entries.map((entry) => ({voice: entry.voice, cropSeconds: entry.crop.durationSeconds}))}))
