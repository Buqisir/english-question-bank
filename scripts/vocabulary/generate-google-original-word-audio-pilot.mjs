#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const selection = JSON.parse(await readFile(path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json'), 'utf8'))
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
const fullRepairMode = process.argv.includes('--full-repair-v5')
const outputRoot = path.join(root, fullRepairMode ? '.scratch/gaokao-audio-original-word-repair-v5' : '.scratch/gaokao-audio-original-word-pilot-v4')
const pilotEntries = [
  { entryId: 'gaokao-frequency-0001-the', headword: 'the' },
  { entryId: 'gaokao-frequency-0139-become', headword: 'become' },
  { entryId: 'gaokao-frequency-0227-research', headword: 'research' },
  { entryId: 'gaokao-frequency-0363-enough', headword: 'enough' },
]
const specialSpokenText = {
  'gaokao-frequency-0468-p-m-pm': { american: 'p.m.', british: 'p.m.' },
  'gaokao-frequency-0716-recognize-recognise': { american: 'recognize', british: 'recognise' },
  'gaokao-frequency-0832-a-m-am': { american: 'a.m.', british: 'a.m.' },
  'gaokao-frequency-2739-ad-a-d': { american: 'AD', british: 'AD' },
  'gaokao-frequency-2758-pe-p-e': { american: 'PE', british: 'PE' },
}
const repairEntries = fullRepairMode
  ? (async () => {
      const plan = JSON.parse(await readFile(path.join(root, 'data/vocabulary/gaokao-frequency-full-audio-repair-plan-v1.json'), 'utf8'))
      const source = JSON.parse(await readFile(path.join(root, 'data/vocabulary/gaokao-frequency-source-content-v1.json'), 'utf8'))
      const sourceById = new Map(source.entries.map((entry) => [entry.entryId, entry]))
      return plan.entries.map((planned) => {
        const entry = sourceById.get(planned.entryId)
        if (!entry) throw new Error(`Missing source entry ${planned.entryId}`)
        return { entryId: entry.entryId, headword: entry.headword, ...specialSpokenText[entry.entryId] }
      })
    })()
  : pilotEntries
const pilots = await repairEntries

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
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const synthesize = async (accentName, accent, text) => {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: accent.languageCode, name: accent.voice },
        audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24_000, speakingRate: 1 },
      }),
    })
    if (response.ok) return Buffer.from((await response.json()).audioContent, 'base64')
    lastError = new Error(`${accentName} ${text}: Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) throw lastError
    await sleep(500 * 2 ** (attempt - 1))
  }
  throw lastError
}

for (const accentName of ['american', 'british']) {
  const accent = selection[accentName]
  const outputDirectory = path.join(outputRoot, accentName)
  await mkdir(outputDirectory, { recursive: true })
  const entries = new Array(pilots.length)
  let cursor = 0
  let completed = 0
  const worker = async () => {
    while (cursor < pilots.length) {
      const index = cursor
      cursor += 1
      const pilot = pilots[index]
      const text = pilot[accentName] ?? pilot.headword
      const bytes = await synthesize(accentName, accent, text)
    const outputPath = path.join(outputDirectory, `${pilot.entryId}.mp3`)
    await writeFile(outputPath, bytes)
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate:format=duration',
      '-of', 'json', outputPath,
    ], { encoding: 'utf8' }))
    const durationSeconds = Number(probe.format.duration)
    if (
      probe.streams?.[0]?.codec_name !== 'mp3'
      || Number(probe.streams?.[0]?.sample_rate) !== 24_000
      || Number(probe.streams?.[0]?.channels) !== 1
      || durationSeconds < 0.3
    ) throw new Error(`${accentName} ${pilot.headword}: incomplete or invalid original-word output`)
      entries[index] = {
      entryId: pilot.entryId,
      headword: pilot.headword,
      text,
      speakingRate: 1,
      path: `${pilot.entryId}.mp3`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      voice: accent.voice,
      }
      completed += 1
      if (completed % 20 === 0 || completed === pilots.length) console.log(`${accentName}: ${completed}/${pilots.length}`)
    }
  }
  await Promise.all(Array.from({ length: fullRepairMode ? 6 : 2 }, () => worker()))
  await writeFile(path.join(outputRoot, `${accentName}-manifest.json`), `${JSON.stringify({
    schemaVersion: fullRepairMode ? 'gaokao-frequency-original-word-audio-repair-v1' : 'gaokao-frequency-original-word-audio-pilot-v1',
    status: 'candidate_pending_owner_qa',
    strategy: 'exact-original-word-no-ssml-default-speaking-rate',
    accent: accentName,
    voice: accent.voice,
    entries,
  }, null, 2)}\n`)
}

console.log(JSON.stringify({ strategy: 'exact-original-word-no-ssml-default-speaking-rate', words: pilots.length, audioFiles: pilots.length * 2, outputRoot }, null, 2))
