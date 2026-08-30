#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const sourceManifestPath = path.join(root, '.scratch/gaokao-google-phonetic-teacher-v23/manifest.json')
const qaPath = path.join(root, '.scratch/gaokao-google-voice-qwen-matched-teacher-v23/owner-qa-summary-v23.json')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const outputRoot = path.join(root, '.scratch/gaokao-google-natural-rate-teacher-v24')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const controlsByVariant = {
  A24: {
    weak: {volume: '-2dB', pitch: '-1st'},
    plain: {volume: '+0dB', pitch: '+0st'},
    secondary: {volume: '+1dB', pitch: '+0st'},
    primary: {volume: '+3dB', pitch: '+1st'},
  },
  B24: {
    weak: {volume: '-1dB', pitch: '+0st'},
    plain: {volume: '+0dB', pitch: '+0st'},
    secondary: {volume: '+0dB', pitch: '+0st'},
    primary: {volume: '+2dB', pitch: '+1st'},
  },
}

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const buildSsml = (entry, controls) => `<speak>${entry.segments.map((segment) => {
  const control = controls[segment.stress]
  return `<prosody volume="${control.volume}" rate="100%" pitch="${control.pitch}"><phoneme alphabet="x-sampa" ph="${escapeXml(segment.ph)}">${escapeXml(segment.text)}</phoneme></prosody>`
}).join('')}</speak>`
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

const [source, qa, selection, credentials] = await Promise.all([
  readFile(sourceManifestPath, 'utf8').then(JSON.parse),
  readFile(qaPath, 'utf8').then(JSON.parse),
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (source.schemaVersion !== 'gaokao-frequency-google-phonetic-teacher-v23' || source.entries.length !== 8) {
  throw new Error('V24 requires the complete V23 teacher specification')
}
if (qa.counts?.failed !== 4 || qa.counts?.usable !== 0) {
  throw new Error('V24 requires the complete Owner rejection of V23')
}
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') {
  throw new Error('V24 must preserve the owner-approved American Google female voice')
}

const baseById = new Map()
for (const entry of source.entries) baseById.set(entry.entryId, entry)
if (baseById.size !== 4) throw new Error('V24 requires exactly four target words')

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
for (const entry of baseById.values()) {
  for (const [candidateLabel, controls] of Object.entries(controlsByVariant)) {
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
    if (!response.ok) throw new Error(`${entry.headword} ${candidateLabel}: synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
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
      || durationSeconds > 2) throw new Error(`${entry.headword} ${candidateLabel}: implausible natural-rate teacher`)
    entries.push({
      entryId: entry.entryId,
      headword: entry.headword,
      verifiedIpa: entry.verifiedIpa,
      segments: entry.segments,
      candidateLabel,
      path: filename,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      voice: voice.voice,
      ssml,
      controls,
      strategy: 'same-voice-target-xsampa-uniform-natural-rate',
    })
  }
}

await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-google-natural-rate-teacher-v24',
  status: 'private_reference_ready',
  distribution: 'local_private_reference_only',
  formalAssetsChanged: false,
  voice: voice.voice,
  entries,
}, null, 2)}\n`)
console.log(JSON.stringify({words: baseById.size, teachers: entries.length, voice: voice.voice, outputRoot}, null, 2))
