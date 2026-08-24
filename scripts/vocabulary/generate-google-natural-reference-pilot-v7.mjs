#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-audio-natural-reference-pilot-v7')
const qaPath = path.join(root, '.scratch/gaokao-audio-targeted-repair-v6/owner-qa-v5.json')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const pilot = [
  { entryId: 'gaokao-frequency-0001-the', accents: ['american', 'british'] },
  { entryId: 'gaokao-frequency-0139-become', accents: ['american'] },
  { entryId: 'gaokao-frequency-0227-research', accents: ['british'] },
  { entryId: 'gaokao-frequency-0363-enough', accents: ['american', 'british'] },
  { entryId: 'gaokao-frequency-0468-p-m-pm', accents: ['american', 'british'], spokenText: 'PM' },
  { entryId: 'gaokao-frequency-0469-hotel', accents: ['american', 'british'] },
]
const expectedVerdictAccents = {
  american_fail: ['american'],
  british_fail: ['british'],
  both_fail: ['american', 'british'],
}
const [qaPayload, selection, credentials] = await Promise.all([
  readFile(qaPath, 'utf8').then(JSON.parse),
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
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
  throw new Error('V7 must preserve the owner-approved American female voice')
}
if (voiceByAccent.british.voice !== 'en-GB-Neural2-D') {
  throw new Error('V7 must preserve the owner-approved British voice')
}
const qaById = new Map(qaPayload.qa.map((entry) => [entry.entryId, entry]))
const entries = pilot.map((planned) => {
  const qa = qaById.get(planned.entryId)
  if (!qa) throw new Error(`Missing V5 QA for ${planned.entryId}`)
  if (JSON.stringify(expectedVerdictAccents[qa.audioVerdict]) !== JSON.stringify(planned.accents)) {
    throw new Error(`Pilot scope does not match V5 QA for ${planned.entryId}`)
  }
  return {
    ...planned,
    headword: qa.headword,
    spokenText: planned.spokenText ?? qa.headword.replace(/\s*[,;/]\s*.*/u, '').trim(),
    previousVerdict: qa.audioVerdict,
    ownerIssue: Object.fromEntries(planned.accents.map((accent) => [accent, qa[`${accent}Issue`].trim()])),
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
  if (!liveVoice || liveVoice.ssmlGender !== voice.ssmlGender || liveVoice.naturalSampleRateHertz !== 24_000) {
    throw new Error(`Pilot voice is unavailable or changed: ${voice.voice}`)
  }
  const accentEntries = entries.filter((entry) => entry.accents.includes(accent))
  const outputDirectory = path.join(outputRoot, accent)
  await mkdir(outputDirectory, { recursive: true })
  const manifestEntries = []
  for (const entry of accentEntries) {
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: { text: entry.spokenText },
        voice: { languageCode: voice.languageCode, name: voice.voice },
        audioConfig: {
          audioEncoding: selection.audioConfig.audioEncoding,
          sampleRateHertz: selection.audioConfig.sampleRateHertz,
          speakingRate: selection.audioConfig.speakingRate,
        },
      }),
    })
    if (!response.ok) throw new Error(`${accent} ${entry.headword}: synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
    const bytes = Buffer.from((await response.json()).audioContent, 'base64')
    const outputPath = path.join(outputDirectory, `${entry.entryId}.mp3`)
    await writeFile(outputPath, bytes)
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json', outputPath,
    ], { encoding: 'utf8' }))
    const durationSeconds = Number(probe.format.duration)
    if (probe.streams?.[0]?.codec_name !== 'mp3' || Number(probe.streams?.[0]?.sample_rate) !== 24_000 || Number(probe.streams?.[0]?.channels) !== 1 || durationSeconds < 0.3) {
      throw new Error(`${accent} ${entry.headword}: incomplete pilot audio`)
    }
    manifestEntries.push({
      entryId: entry.entryId,
      headword: entry.headword,
      text: entry.spokenText,
      path: `${entry.entryId}.mp3`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      voice: voice.voice,
      strategy: 'owner-approved-voice-natural-original-word-no-ssml',
    })
  }
  await writeFile(path.join(outputRoot, `${accent}-manifest.json`), `${JSON.stringify({
    schemaVersion: 'gaokao-frequency-natural-reference-pilot-v7',
    status: 'candidate_pending_owner_qa',
    accent,
    voice: voice.voice,
    entries: manifestEntries,
  }, null, 2)}\n`)
}

await writeFile(path.join(outputRoot, 'repair-spec.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-natural-reference-pilot-v7',
  status: 'candidate_pending_owner_qa',
  sourceQaTarget: qaPayload.qaTarget,
  strategy: 'single-failed-accent-only; preserve owner-approved voice and cadence; no IPA, emphasis, context crop, or passed-accent re-QA',
  entries,
}, null, 2)}\n`)

console.log(JSON.stringify({
  words: entries.length,
  audioItems: entries.reduce((count, entry) => count + entry.accents.length, 0),
  voices: Object.fromEntries(Object.entries(voiceByAccent).map(([accent, voice]) => [accent, voice.voice])),
  outputRoot,
}, null, 2))
