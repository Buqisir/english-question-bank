#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-violin-component-crossfade-v43')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-component-crossfade-v43')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v42QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-sub-alias-v42/owner-qa-summary-v42.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const components = [
  {
    key: 'vie',
    label: 'vie',
    ssml: '<speak>They <mark name="target-start"/>vie<mark name="target-end"/> for first place every year.</speak>',
    padStart: 0.015,
    padEnd: 0.010,
  },
  {
    key: 'a-lynn',
    label: 'a Lynn',
    ssml: '<speak>She met <mark name="target-start"/>a Lynn<mark name="target-end"/> at the station today.</speak>',
    padStart: 0.010,
    padEnd: 0.020,
  },
]

const [selection, v42Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v42QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') throw new Error('V43 must preserve the approved Google American female voice')
if (!v42Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.verdict === 'fail')) throw new Error('V43 requires explicit V42 rejection')

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
const sampleRate = selection.audioConfig.sampleRateHertz

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])

const synthesize = async (component) => {
  const response = await fetchWithRetry('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'x-goog-user-project': credentials.quota_project_id,
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      input: {ssml: component.ssml},
      voice: {languageCode: voice.languageCode, name: voice.voice},
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: sampleRate,
        speakingRate: selection.audioConfig.speakingRate,
      },
      enableTimePointing: ['SSML_MARK'],
    }),
  }, `V43 ${component.key} synthesis`)
  if (!response.ok) throw new Error(`Google V43 ${component.key} synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`)
  const payload = await response.json()
  const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
  const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error(`Invalid V43 ${component.key} timepoints`)

  const sourceWav = path.join(outputRoot, `${component.key}--carrier.wav`)
  const cropWav = path.join(outputRoot, `${component.key}--crop.wav`)
  const publicFilename = `gaokao-frequency-2081-violin--american--v43-${component.key}.mp3`
  const scratchMp3 = path.join(outputRoot, publicFilename)
  const trimStart = Math.max(0, targetStart - component.padStart)
  const trimEnd = targetEnd + component.padEnd
  const cropDuration = trimEnd - trimStart
  const fadeOutStart = Math.max(0, cropDuration - 0.006)

  await writeFile(sourceWav, Buffer.from(payload.audioContent, 'base64'))
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', sourceWav,
    '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.004,afade=t=out:st=${fadeOutStart}:d=0.006`,
    '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', cropWav,
  ])
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', cropWav, '-ar', String(sampleRate), '-ac', '1', '-b:a', '64k', scratchMp3])
  const bytes = await readFile(scratchMp3)
  await writeFile(path.join(publicRoot, publicFilename), bytes)
  return {component, sourceWav, cropWav, publicFilename, bytes, targetStart, targetEnd, trimStart, trimEnd}
}

const rendered = []
for (const component of components) rendered.push(await synthesize(component))

const vie = rendered.find((item) => item.component.key === 'vie')
const aLynn = rendered.find((item) => item.component.key === 'a-lynn')
const finalWav = path.join(outputRoot, 'violin--component-crossfade.wav')
const finalFilename = 'gaokao-frequency-2081-violin--american--v43-final.mp3'
const finalScratchPath = path.join(outputRoot, finalFilename)
const crossfadeSeconds = 0.024

execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', vie.cropWav, '-i', aLynn.cropWav,
  '-filter_complex', `[0:a]volume=-2.5dB,atempo=1.06[first];[first][1:a]acrossfade=d=${crossfadeSeconds}:c1=tri:c2=tri,afade=t=in:st=0:d=0.004[out]`,
  '-map', '[out]', '-ar', String(sampleRate), '-ac', '1', '-c:a', 'pcm_s16le', finalWav,
])
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', finalWav, '-ar', String(sampleRate), '-ac', '1', '-b:a', '64k', finalScratchPath])
const finalBytes = await readFile(finalScratchPath)
await writeFile(path.join(publicRoot, finalFilename), finalBytes)

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const duration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], {encoding: 'utf8'})).format.duration)
const publicPath = (filename) => `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-component-crossfade-v43/${filename}`
const componentManifest = (item) => ({
  label: item.component.label,
  ssml: item.component.ssml,
  targetStartSeconds: item.targetStart,
  targetEndSeconds: item.targetEnd,
  trimStartSeconds: item.trimStart,
  trimEndSeconds: item.trimEnd,
  publicPath: publicPath(item.publicFilename),
  bytes: item.bytes.length,
  sha256: sha256(item.bytes),
  durationSeconds: Number(duration(path.join(outputRoot, item.publicFilename)).toFixed(3)),
})
const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-violin-component-crossfade-v43',
  status: 'private_local_candidate_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  changedVariable: 'Synthesize natural vie and a Lynn chunks in the exact approved Neural2-C voice, then join their waveforms without asking a language model to pronounce violin.',
  entry: {
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    candidateLabel: 'V43',
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    crossfadeSeconds,
    vieGainDb: -2.5,
    vieTempo: 1.06,
    publicPath: publicPath(finalFilename),
    bytes: finalBytes.length,
    sha256: sha256(finalBytes),
    durationSeconds: Number(duration(finalScratchPath).toFixed(3)),
    components: {
      vie: componentManifest(vie),
      aLynn: componentManifest(aLynn),
    },
  },
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({
  manifest: path.join(outputRoot, 'manifest.json'),
  vieSeconds: manifest.entry.components.vie.durationSeconds,
  aLynnSeconds: manifest.entry.components.aLynn.durationSeconds,
  finalSeconds: manifest.entry.durationSeconds,
}))
