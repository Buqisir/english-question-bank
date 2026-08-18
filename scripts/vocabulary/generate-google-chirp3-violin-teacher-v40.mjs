#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-qwen-dual-teacher-violin-v40')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/qwen-dual-teacher-violin-v40')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')
const v39QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-plain-text-diagnosis-v39/owner-qa-summary-v39.json')
const [credentials, v39Qa] = await Promise.all([
  readFile(credentialsPath, 'utf8').then(JSON.parse),
  readFile(v39QaPath, 'utf8').then(JSON.parse),
])
if (!v39Qa.entries.some((entry) => entry.entryId === 'gaokao-frequency-2081-violin' && entry.plainTextCorrect === false)) throw new Error('V40 requires the explicit V39 Neural2-C rejection')

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
const voice = {languageCode: 'en-US', name: 'en-US-Chirp3-HD-Leda'}
const ssml = '<speak><phoneme alphabet="ipa" ph="ˌvaɪ.əˈlɪn">violin</phoneme></speak>'
const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
  method: 'POST',
  headers: {
    authorization: `Bearer ${accessToken}`,
    'x-goog-user-project': credentials.quota_project_id,
    'content-type': 'application/json; charset=utf-8',
  },
  body: JSON.stringify({
    input: {ssml},
    voice,
    audioConfig: {audioEncoding: 'LINEAR16', sampleRateHertz: 24000, speakingRate: 0.92},
  }),
})
if (!response.ok) throw new Error(`Chirp3 teacher synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
const payload = await response.json()
await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const teacherPath = path.join(outputRoot, 'violin--chirp3-leda-canonical-teacher.wav')
const teacherPublicPath = path.join(publicRoot, 'violin--chirp3-leda-canonical-teacher.wav')
const bytes = Buffer.from(payload.audioContent, 'base64')
await Promise.all([writeFile(teacherPath, bytes), writeFile(teacherPublicPath, bytes)])
execFileSync('ffmpeg', ['-v', 'error', '-i', teacherPath, '-f', 'null', '-'])
const durationSeconds = Number(JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', teacherPath], {encoding: 'utf8'})).format.duration)
const receipt = {
  schemaVersion: 'gaokao-frequency-google-chirp3-violin-teacher-v40',
  status: 'private_local_pronunciation_teacher_only',
  formalAssetsChanged: false,
  distribution: 'not_a_final_candidate',
  headword: 'violin',
  ipa: '/ˌvaɪ.əˈlɪn/',
  voice: voice.name,
  ssml,
  path: path.relative(root, teacherPath),
  publicPath: '/vocabulary-assets/gaokao-frequency-v1/audio/qwen-dual-teacher-violin-v40/violin--chirp3-leda-canonical-teacher.wav',
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  durationSeconds: Number(durationSeconds.toFixed(3)),
}
await writeFile(path.join(outputRoot, 'teacher-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`)
console.log(JSON.stringify({teacher: teacherPath, durationSeconds: receipt.durationSeconds}))
