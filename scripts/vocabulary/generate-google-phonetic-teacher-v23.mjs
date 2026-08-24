#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-phonetic-teacher-v23')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const qaPath = path.join(root, '.scratch/gaokao-google-voice-qwen-seed-draw-v22/owner-qa-summary-v22.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const cases = [
  {
    entryId: 'gaokao-frequency-2396-ballet',
    headword: 'ballet',
    verifiedIpa: '/bælˈeɪ/',
    segments: [
      {text: 'bal', ph: 'b{l', stress: 'weak'},
      {text: 'let', ph: 'eI', stress: 'primary'},
    ],
  },
  {
    entryId: 'gaokao-frequency-2823-dolphin',
    headword: 'dolphin',
    verifiedIpa: '/ˈdɑːl.fɪn/',
    segments: [
      {text: 'dol', ph: 'dA:l', stress: 'primary'},
      {text: 'phin', ph: 'fIn', stress: 'plain'},
    ],
  },
  {
    entryId: 'gaokao-frequency-1887-hello',
    headword: 'hello',
    verifiedIpa: '/heˈloʊ/',
    segments: [
      {text: 'he', ph: 'hE', stress: 'weak'},
      {text: 'llo', ph: 'loU', stress: 'primary'},
    ],
  },
  {
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    verifiedIpa: '/ˌvaɪ.əˈlɪn/',
    segments: [
      {text: 'vi', ph: 'vaI', stress: 'secondary'},
      {text: 'o', ph: '@', stress: 'weak'},
      {text: 'lin', ph: 'lIn', stress: 'primary'},
    ],
  },
]

const variants = {
  A23: {
    weak: {volume: '-4dB', rate: '108%', pitch: '-1st'},
    plain: {volume: '-1dB', rate: '100%', pitch: '+0st'},
    secondary: {volume: '+1dB', rate: '94%', pitch: '+1st'},
    primary: {volume: '+6dB', rate: '84%', pitch: '+2st'},
  },
  B23: {
    weak: {volume: '-2dB', rate: '104%', pitch: '+0st'},
    plain: {volume: '+0dB', rate: '100%', pitch: '+0st'},
    secondary: {volume: '+0dB', rate: '97%', pitch: '+0st'},
    primary: {volume: '+4dB', rate: '90%', pitch: '+1st'},
  },
}

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const buildSsml = (entry, controls) => `<speak>${entry.segments.map((segment) => {
  const control = controls[segment.stress]
  return `<prosody volume="${control.volume}" rate="${control.rate}" pitch="${control.pitch}"><phoneme alphabet="x-sampa" ph="${escapeXml(segment.ph)}">${escapeXml(segment.text)}</phoneme></prosody>`
}).join('')}</speak>`

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const [selection, qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(qaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])

const failedIds = new Set(qa.entries.filter((entry) => entry.verdict === 'all_fail').map((entry) => entry.entryId))
if (failedIds.size !== 4 || !cases.every((entry) => failedIds.has(entry.entryId))) {
  throw new Error('V23 teacher generation must cover the exact four unresolved V22 words')
}
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') {
  throw new Error('V23 must preserve the owner-approved American Google female voice')
}

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
const headers = {
  authorization: `Bearer ${accessToken}`,
  'x-goog-user-project': credentials.quota_project_id,
  'content-type': 'application/json; charset=utf-8',
}

const voice = selection.american
const voicesResponse = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${voice.languageCode}`, {headers})
if (!voicesResponse.ok) throw new Error(`American voice lookup failed with HTTP ${voicesResponse.status}`)
const liveVoice = (await voicesResponse.json()).voices?.find((candidate) => candidate.name === voice.voice)
if (!liveVoice || liveVoice.ssmlGender !== voice.ssmlGender || liveVoice.naturalSampleRateHertz !== selection.audioConfig.sampleRateHertz) {
  throw new Error(`Approved voice is unavailable or changed: ${voice.voice}`)
}

await mkdir(outputRoot, {recursive: true})
const entries = []
for (const entry of cases) {
  for (const [candidateLabel, controls] of Object.entries(variants)) {
    const ssml = buildSsml(entry, controls)
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: {ssml},
        voice: {languageCode: voice.languageCode, name: voice.voice},
        audioConfig: {
          audioEncoding: selection.audioConfig.audioEncoding,
          sampleRateHertz: selection.audioConfig.sampleRateHertz,
          speakingRate: selection.audioConfig.speakingRate,
        },
      }),
    })
    if (!response.ok) {
      throw new Error(`${entry.headword} ${candidateLabel}: synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    const bytes = Buffer.from((await response.json()).audioContent, 'base64')
    const filename = `${entry.entryId}--american--${candidateLabel.toLowerCase()}.mp3`
    const outputPath = path.join(outputRoot, filename)
    await writeFile(outputPath, bytes)
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json', outputPath,
    ], {encoding: 'utf8'}))
    const durationSeconds = Number(probe.format.duration)
    if (probe.streams?.[0]?.codec_name !== 'mp3'
      || Number(probe.streams?.[0]?.sample_rate) !== selection.audioConfig.sampleRateHertz
      || Number(probe.streams?.[0]?.channels) !== 1
      || durationSeconds < 0.3
      || durationSeconds > 4) {
      throw new Error(`${entry.headword} ${candidateLabel}: incomplete or implausible teacher audio`)
    }
    entries.push({
      ...entry,
      candidateLabel,
      path: filename,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      voice: voice.voice,
      ssml,
      controls,
      strategy: 'same-voice-matched-target-xsampa-stress-teacher',
    })
  }
}

await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-google-phonetic-teacher-v23',
  status: 'private_reference_ready',
  distribution: 'local_private_reference_only',
  formalAssetsChanged: false,
  voice: voice.voice,
  entries,
}, null, 2)}\n`)

console.log(JSON.stringify({words: cases.length, teachers: entries.length, voice: voice.voice, outputRoot}, null, 2))
