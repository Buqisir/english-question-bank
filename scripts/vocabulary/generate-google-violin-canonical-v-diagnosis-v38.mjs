#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-violin-canonical-v-diagnosis-v38')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-canonical-v-diagnosis-v38')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v37QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-wai-contour-v37/owner-qa-summary-v37.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

// V38 changes one synthesis variable from V37 A37: literal /w/ returns to the
// dictionary-attested /v/. Carrier, voice, speed, whole-word tag, and crop stay fixed.
const ssml = '<speak>She plays the <mark name="target-start"/><phoneme alphabet="ipa" ph="ˌvaɪ.əˈlɪn">violin</phoneme><mark name="target-end"/> beautifully every day.</speak>'

const [selection, v37Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v37QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') throw new Error('V38 must preserve the approved Google American female voice')
if (!v37Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.verdict === 'fail')) throw new Error('V38 requires the explicit V37 Owner rejection')

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
}, 'V38 canonical /v/')
if (!response.ok) throw new Error(`Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)

const payload = await response.json()
const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error('Invalid SSML timepoints')

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const sourceWav = path.join(outputRoot, 'violin--canonical-v.context.wav')
const contextFilename = 'gaokao-frequency-2081-violin--american--v38-context.mp3'
const cropFilename = 'gaokao-frequency-2081-violin--american--v38-crop.mp3'
const contextScratchPath = path.join(outputRoot, contextFilename)
const cropScratchPath = path.join(outputRoot, cropFilename)
const contextPublicPath = path.join(publicRoot, contextFilename)
const cropPublicPath = path.join(publicRoot, cropFilename)
await writeFile(sourceWav, Buffer.from(payload.audioContent, 'base64'))

execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', sourceWav,
  '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', contextScratchPath,
])
const cropDuration = targetEnd - targetStart
const fadeOutStart = Math.max(0, cropDuration - 0.006)
execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', sourceWav,
  '-af', `atrim=start=${targetStart}:end=${targetEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.004,afade=t=out:st=${fadeOutStart}:d=0.006`,
  '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', cropScratchPath,
])
await rm(sourceWav)

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const probeDuration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath], {encoding: 'utf8'})).format.duration)
const contextBytes = await readFile(contextScratchPath)
const cropBytes = await readFile(cropScratchPath)
await Promise.all([
  writeFile(contextPublicPath, contextBytes),
  writeFile(cropPublicPath, cropBytes),
])

const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-violin-canonical-v-diagnosis-v38',
  status: 'private_local_diagnostic_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  hypothesis: 'V37 targeted the wrong onset. Restore dictionary-attested /v/ while preserving the /aɪ/ vowel and every other synthesis variable; compare full context against the exact crop.',
  authority: {
    name: 'Cambridge Dictionary US pronunciation',
    ipa: '/ˌvaɪ.əˈlɪn/',
    pageUrl: 'https://dictionary.cambridge.org/pronunciation/english/violin',
    audioUrl: 'https://dictionary.cambridge.org/media/english/us_pron/v/vio/violi/violin.mp3',
  },
  entry: {
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    candidateLabel: 'V38',
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    ssml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    context: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-canonical-v-diagnosis-v38/${contextFilename}`,
      bytes: contextBytes.length,
      sha256: sha256(contextBytes),
      durationSeconds: Number(probeDuration(contextScratchPath).toFixed(3)),
    },
    crop: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-canonical-v-diagnosis-v38/${cropFilename}`,
      bytes: cropBytes.length,
      sha256: sha256(cropBytes),
      durationSeconds: Number(probeDuration(cropScratchPath).toFixed(3)),
    },
  },
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), contextSeconds: manifest.entry.context.durationSeconds, cropSeconds: manifest.entry.crop.durationSeconds}))
