#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-violin-wai-contour-v37')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-wai-contour-v37')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v36QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-whole-wai-v36/owner-qa-summary-v36.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const targetSsml = '<phoneme alphabet="ipa" ph="ˌwaɪ.əˈlɪn">violin</phoneme>'
const variants = {
  A37: {
    description: 'whole-word-wai-natural-declarative-contour',
    ssml: `<speak>She plays the <mark name="target-start"/>${targetSsml}<mark name="target-end"/> beautifully every day.</speak>`,
  },
  B37: {
    description: 'whole-word-wai-question-contour',
    ssml: `<speak>Did she say <mark name="target-start"/>${targetSsml}<mark name="target-end"/> correctly this time?</speak>`,
  },
}

const [selection, v36Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v36QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') throw new Error('V37 must preserve the approved Google American female voice')
if (!v36Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.verdict === 'all_fail')) throw new Error('V37 requires the V36 contour rejection')

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
const headers = {
  authorization: `Bearer ${accessToken}`,
  'x-goog-user-project': credentials.quota_project_id,
  'content-type': 'application/json; charset=utf-8',
}
const voice = selection.american
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const probeDuration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], {encoding: 'utf8'})).format.duration)

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const entries = []
for (const [candidateLabel, variant] of Object.entries(variants)) {
  const response = await fetchWithRetry('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input: {ssml: variant.ssml},
      voice: {languageCode: voice.languageCode, name: voice.voice},
      audioConfig: {audioEncoding: 'LINEAR16', sampleRateHertz: selection.audioConfig.sampleRateHertz, speakingRate: selection.audioConfig.speakingRate},
      enableTimePointing: ['SSML_MARK'],
    }),
  }, candidateLabel)
  if (!response.ok) throw new Error(`${candidateLabel}: Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const payload = await response.json()
  const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
  const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error(`${candidateLabel}: invalid SSML timepoints`)
  const contextPath = path.join(outputRoot, `violin--${candidateLabel.toLowerCase()}.context.wav`)
  const filename = `gaokao-frequency-2081-violin--american--${candidateLabel.toLowerCase()}.mp3`
  const scratchPath = path.join(outputRoot, filename)
  const publicPath = path.join(publicRoot, filename)
  await writeFile(contextPath, Buffer.from(payload.audioContent, 'base64'))
  const trimStart = targetStart
  const trimEnd = targetEnd
  const trimmedDuration = trimEnd - trimStart
  const fadeOutStart = Math.max(0, trimmedDuration - 0.006)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', contextPath,
    '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.004,afade=t=out:st=${fadeOutStart}:d=0.006`,
    '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', scratchPath,
  ])
  await rm(contextPath)
  execFileSync('ffmpeg', ['-v', 'error', '-i', scratchPath, '-f', 'null', '-'])
  const bytes = await readFile(scratchPath)
  await writeFile(publicPath, bytes)
  entries.push({
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    ownerTargetIpa: '/ˌwaɪ.əˈlɪn/',
    candidateLabel,
    strategy: variant.description,
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    ssml: variant.ssml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    trimStartSeconds: trimStart,
    trimEndSeconds: trimEnd,
    path: filename,
    publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-wai-contour-v37/${filename}`,
    bytes: bytes.length,
    sha256: sha256(bytes),
    durationSeconds: Number(probeDuration(scratchPath).toFixed(3)),
  })
}

const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-violin-wai-contour-v37',
  status: 'private_local_candidates_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  preservedUsable: [{entryId: 'gaokao-frequency-2396-ballet', candidateLabel: 'A31'}],
  strategy: 'Keep the entire Owner-target word in one phoneme tag, remove isolation breaks that caused a falling mini-utterance contour, and compare declarative versus question carrier prosody before exact timepoint crop.',
  variants,
  entries,
  failures: [],
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), candidates: entries.length, failures: 0}))
