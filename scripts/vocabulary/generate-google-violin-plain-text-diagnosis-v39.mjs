#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-violin-plain-text-diagnosis-v39')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-plain-text-diagnosis-v39')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v38QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-canonical-v-diagnosis-v38/owner-qa-summary-v38.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

// V39 changes exactly one variable from V38: remove the phoneme element and let
// the approved voice pronounce the ordinary spelling in the identical sentence.
const ssml = '<speak>She plays the <mark name="target-start"/>violin<mark name="target-end"/> beautifully every day.</speak>'
const [selection, v38Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v38QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') throw new Error('V39 must preserve the approved Google American female voice')
if (!v38Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.authorityCorrect === true && entry.googleContextCorrect === false)) throw new Error('V39 requires the explicit V38 full-context rejection')

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: {'content-type': 'application/x-www-form-urlencoded'},
  body: new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  }),
})
if (!tokenResponse.ok) throw new Error(`ADC refresh failed with HTTP ${tokenResponse.status}`)
const {access_token: accessToken} = await tokenResponse.json()
const voice = selection.american
const response = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
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
})
if (!response.ok) throw new Error(`Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
const payload = await response.json()
const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error('Invalid V39 SSML timepoints')

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const sourceWav = path.join(outputRoot, 'violin--plain-text.context.wav')
const filename = 'gaokao-frequency-2081-violin--american--v39-context.mp3'
const scratchPath = path.join(outputRoot, filename)
const publicPath = path.join(publicRoot, filename)
await writeFile(sourceWav, Buffer.from(payload.audioContent, 'base64'))
execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', sourceWav,
  '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', scratchPath,
])
await rm(sourceWav)
execFileSync('ffmpeg', ['-v', 'error', '-i', scratchPath, '-f', 'null', '-'])
const bytes = await readFile(scratchPath)
await writeFile(publicPath, bytes)
const durationSeconds = Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', scratchPath], {encoding: 'utf8'})).format.duration)

const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-violin-plain-text-diagnosis-v39',
  status: 'private_local_diagnostic_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  changedVariable: 'V38 phoneme element removed; all other synthesis inputs preserved.',
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
    candidateLabel: 'V39',
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    ssml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    context: {
      publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-plain-text-diagnosis-v39/${filename}`,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      durationSeconds: Number(durationSeconds.toFixed(3)),
    },
  },
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), durationSeconds: manifest.entry.context.durationSeconds}))
