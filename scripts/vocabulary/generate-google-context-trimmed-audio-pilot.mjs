#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const selection = JSON.parse(await readFile(path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json'), 'utf8'))
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')
const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
const outputRoot = path.join(root, '.scratch/gaokao-audio-context-pilot-v3')

const pilots = [
  { entryId: 'gaokao-frequency-0001-the', headword: 'the', before: 'Please open ', target: 'the', after: ' book now.' },
  { entryId: 'gaokao-frequency-0139-become', headword: 'become', before: 'They will ', target: 'become', after: ' stronger.' },
  { entryId: 'gaokao-frequency-0227-research', headword: 'research', before: 'The ', target: 'research', after: ' was useful.' },
  { entryId: 'gaokao-frequency-0363-enough', headword: 'enough', before: 'We have ', target: 'enough', after: ' time.' },
]

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
const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const manifests = {}

for (const accentName of ['american', 'british']) {
  const accent = selection[accentName]
  const outputDirectory = path.join(outputRoot, accentName)
  await mkdir(outputDirectory, { recursive: true })
  const entries = []
  for (const pilot of pilots) {
    const ssml = `<speak>${escapeXml(pilot.before)}<mark name="target-start"/>${escapeXml(pilot.target)}<mark name="target-end"/><break time="120ms"/>${escapeXml(pilot.after)}</speak>`
    const response = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        input: { ssml },
        voice: { languageCode: accent.languageCode, name: accent.voice },
        audioConfig: { audioEncoding: 'LINEAR16', sampleRateHertz: 24_000, speakingRate: 0.92 },
        enableTimePointing: ['SSML_MARK'],
      }),
    })
    if (!response.ok) throw new Error(`${accentName} ${pilot.headword}: Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`)
    const payload = await response.json()
    const start = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
    const end = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`${accentName} ${pilot.headword}: invalid SSML timepoints`)
    const wavPath = path.join(outputDirectory, `${pilot.entryId}.context.wav`)
    const mp3Path = path.join(outputDirectory, `${pilot.entryId}.mp3`)
    await writeFile(wavPath, Buffer.from(payload.audioContent, 'base64'))
    const trimStart = Math.max(0, start - 0.035)
    const trimEnd = end + 0.08
    const duration = trimEnd - trimStart
    const fadeOutStart = Math.max(0, duration - 0.02)
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-i', wavPath,
      '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.01,afade=t=out:st=${fadeOutStart}:d=0.02`,
      '-ar', '24000', '-ac', '1', '-b:a', '64k', mp3Path,
    ])
    await rm(wavPath)
    const bytes = await readFile(mp3Path)
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', mp3Path], { encoding: 'utf8' }))
    entries.push({
      entryId: pilot.entryId,
      headword: pilot.headword,
      context: `${pilot.before}${pilot.target}${pilot.after}`,
      ssml,
      targetStartSeconds: start,
      targetEndSeconds: end,
      trimStartSeconds: trimStart,
      trimEndSeconds: trimEnd,
      path: `${pilot.entryId}.mp3`,
      bytes: bytes.length,
      sha256: sha256(bytes),
      durationSeconds: Number(Number(probe.format.duration).toFixed(3)),
      voice: accent.voice,
    })
  }
  const manifest = {
    schemaVersion: 'gaokao-frequency-context-trimmed-audio-pilot-v1',
    status: 'candidate_pending_owner_qa',
    strategy: 'natural-context-with-ssml-timepoint-trim',
    accent: accentName,
    voice: accent.voice,
    entries,
  }
  const manifestPath = path.join(outputRoot, `${accentName}-manifest.json`)
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  manifests[accentName] = manifest
}

console.log(JSON.stringify({
  strategy: 'natural-context-with-ssml-timepoint-trim',
  words: pilots.length,
  american: manifests.american.entries.length,
  british: manifests.british.entries.length,
  outputRoot,
}, null, 2))
