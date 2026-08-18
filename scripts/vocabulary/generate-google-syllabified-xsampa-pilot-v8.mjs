#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-audio-syllabified-xsampa-pilot-v8')
const qaPath = path.join(root, '.scratch/gaokao-audio-v7-owner-qa-capture.json')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const pronunciationByEntry = {
  'gaokao-frequency-0001-the': {
    american: 'D@',
    british: 'D@',
  },
  'gaokao-frequency-0139-become': {
    american: 'bI."kVm',
  },
  'gaokao-frequency-0227-research': {
    british: 'rI."s3:tS',
  },
  'gaokao-frequency-0363-enough': {
    american: 'I."nVf',
    british: 'I."nVf',
  },
  'gaokao-frequency-0468-p-m-pm': {
    american: '%pi:."Em',
    british: '%pi:."Em',
  },
  'gaokao-frequency-0469-hotel': {
    american: 'hoU."tEl',
    british: 'h@U."tel',
  },
}

const verdictAccents = {
  american_fail: ['american'],
  british_fail: ['british'],
  both_fail: ['american', 'british'],
}

const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const buildSsml = (entry, accent) => {
  if (entry.entryId === 'gaokao-frequency-0227-research' && accent === 'british') {
    return '<speak><phoneme alphabet="x-sampa" ph="rI">re</phoneme><prosody volume="+3dB" rate="90%"><phoneme alphabet="x-sampa" ph="s3:tS">search</phoneme></prosody></speak>'
  }
  if (entry.entryId === 'gaokao-frequency-0469-hotel') {
    const firstSyllable = accent === 'american' ? 'hoU' : 'h@U'
    const secondSyllable = accent === 'american' ? 'tEl' : 'tel'
    return `<speak><phoneme alphabet="x-sampa" ph="${firstSyllable}">ho</phoneme><prosody volume="+3dB" rate="90%"><phoneme alphabet="x-sampa" ph="${secondSyllable}">tel</phoneme></prosody></speak>`
  }
  const pronunciation = entry.pronunciation[accent]
  return `<speak><phoneme alphabet="x-sampa" ph="${escapeXml(pronunciation)}">${escapeXml(entry.spokenText)}</phoneme></speak>`
}

const [qaPayload, selection, credentials] = await Promise.all([
  readFile(qaPath, 'utf8').then(JSON.parse),
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])

if (qaPayload.summary?.failed !== 6 || qaPayload.qa?.length !== 6) {
  throw new Error('Expected the completed six-word V7 owner QA capture')
}

const voiceByAccent = {
  american: {
    voice: selection.american.voice,
    languageCode: selection.american.languageCode,
    ssmlGender: selection.american.ssmlGender,
  },
  british: {
    voice: selection.british.voice,
    languageCode: selection.british.languageCode,
    ssmlGender: selection.british.ssmlGender,
  },
}
if (voiceByAccent.american.voice !== 'en-US-Neural2-C' || voiceByAccent.american.ssmlGender !== 'FEMALE') {
  throw new Error('V8 must preserve the owner-approved American female voice')
}
if (voiceByAccent.british.voice !== 'en-GB-Neural2-D') {
  throw new Error('V8 must preserve the owner-approved British voice')
}

const entries = qaPayload.qa.map((qa) => {
  const accents = verdictAccents[qa.audioVerdict]
  const pronunciation = pronunciationByEntry[qa.entryId]
  if (!accents || !pronunciation) throw new Error(`Unsupported V7 QA entry ${qa.entryId}`)
  for (const accent of accents) {
    if (!pronunciation[accent]) throw new Error(`Missing ${accent} X-SAMPA for ${qa.entryId}`)
    if (!qa[`${accent}Issue`]?.trim()) throw new Error(`Missing ${accent} owner issue for ${qa.entryId}`)
  }
  const spokenText = qa.entryId === 'gaokao-frequency-0468-p-m-pm'
    ? 'PM'
    : qa.headword.replace(/\s*[,;/]\s*.*/u, '').trim()
  return {
    entryId: qa.entryId,
    headword: qa.headword,
    spokenText,
    accents,
    previousVerdict: qa.audioVerdict,
    ownerIssue: Object.fromEntries(accents.map((accent) => [accent, qa[`${accent}Issue`].trim()])),
    pronunciation: Object.fromEntries(accents.map((accent) => [accent, pronunciation[accent]])),
  }
})

const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
  }),
})
if (!tokenResponse.ok) throw new Error(`ADC refresh failed with HTTP ${tokenResponse.status}`)
const { access_token: accessToken } = await tokenResponse.json()
const headers = {
  authorization: `Bearer ${accessToken}`,
  'x-goog-user-project': credentials.quota_project_id,
  'content-type': 'application/json; charset=utf-8',
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

for (const [accent, voice] of Object.entries(voiceByAccent)) {
  const voicesResponse = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${voice.languageCode}`, { headers })
  if (!voicesResponse.ok) throw new Error(`${accent} voice lookup failed with HTTP ${voicesResponse.status}`)
  const liveVoice = (await voicesResponse.json()).voices?.find((candidate) => candidate.name === voice.voice)
  if (!liveVoice || liveVoice.ssmlGender !== voice.ssmlGender || liveVoice.naturalSampleRateHertz !== selection.audioConfig.sampleRateHertz) {
    throw new Error(`Approved voice is unavailable or changed: ${voice.voice}`)
  }

  const accentEntries = entries.filter((entry) => entry.accents.includes(accent))
  const outputDirectory = path.join(outputRoot, accent)
  await mkdir(outputDirectory, { recursive: true })
  const manifestEntries = []
  for (const entry of accentEntries) {
    const pronunciation = entry.pronunciation[accent]
    const ssml = buildSsml(entry, accent)
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: { ssml },
        voice: { languageCode: voice.languageCode, name: voice.voice },
        audioConfig: {
          audioEncoding: selection.audioConfig.audioEncoding,
          sampleRateHertz: selection.audioConfig.sampleRateHertz,
          speakingRate: selection.audioConfig.speakingRate,
        },
      }),
    })
    if (!response.ok) {
      throw new Error(`${accent} ${entry.headword}: synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    }
    const bytes = Buffer.from((await response.json()).audioContent, 'base64')
    const outputPath = path.join(outputDirectory, `${entry.entryId}.mp3`)
    await writeFile(outputPath, bytes)
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json', outputPath,
    ], { encoding: 'utf8' }))
    const durationSeconds = Number(probe.format.duration)
    if (probe.streams?.[0]?.codec_name !== 'mp3'
      || Number(probe.streams?.[0]?.sample_rate) !== selection.audioConfig.sampleRateHertz
      || Number(probe.streams?.[0]?.channels) !== 1
      || durationSeconds < 0.3
      || durationSeconds > 4) {
      throw new Error(`${accent} ${entry.headword}: incomplete or implausible pilot audio`)
    }
    manifestEntries.push({
      entryId: entry.entryId,
      headword: entry.headword,
      text: entry.spokenText,
      ssml,
      pronunciation,
      path: `${entry.entryId}.mp3`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      voice: voice.voice,
      strategy: 'owner-approved-voice-syllabified-xsampa',
    })
  }
  await writeFile(path.join(outputRoot, `${accent}-manifest.json`), `${JSON.stringify({
    schemaVersion: 'gaokao-frequency-syllabified-xsampa-pilot-v8',
    status: 'candidate_pending_owner_qa',
    accent,
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    entries: manifestEntries,
  }, null, 2)}\n`)
}

await writeFile(path.join(outputRoot, 'repair-spec.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-syllabified-xsampa-pilot-v8',
  status: 'candidate_pending_owner_qa',
  sourceQaTarget: qaPayload.qaTarget,
  strategy: 'single-failed-accent-only; preserve approved voices; syllabified X-SAMPA with explicit primary and secondary stress',
  entries,
}, null, 2)}\n`)

console.log(JSON.stringify({
  words: entries.length,
  audioItems: entries.reduce((count, entry) => count + entry.accents.length, 0),
  voices: Object.fromEntries(Object.entries(voiceByAccent).map(([accent, voice]) => [accent, voice.voice])),
  outputRoot,
}, null, 2))
