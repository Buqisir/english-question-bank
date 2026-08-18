#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, resolve } from 'node:path'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'

function parseArgs(argv) {
  const args = { force: false, concurrency: 6, 'expected-count': 90 }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--force') {
      args.force = true
      continue
    }
    const [key, inlineValue] = argument.split('=', 2)
    const name = key.replace(/^--/u, '')
    const value = inlineValue ?? argv[++index]
    args[name] = value
  }
  for (const key of ['script', 'selection', 'accent', 'output-dir', 'manifest', 'checked-at']) {
    if (!args[key]) throw new Error(`Missing --${key}`)
  }
  args.concurrency = Number(args.concurrency)
  args['expected-count'] = Number(args['expected-count'])
  if (!Number.isInteger(args.concurrency) || args.concurrency < 1 || args.concurrency > 12) {
    throw new Error('--concurrency must be an integer from 1 to 12')
  }
  if (!Number.isInteger(args['expected-count']) || args['expected-count'] < 1 || args['expected-count'] > 3_000) {
    throw new Error('--expected-count must be an integer from 1 to 3000')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(args['checked-at'])) throw new Error('--checked-at must use YYYY-MM-DD')
  if (!['american', 'british'].includes(args.accent)) throw new Error('--accent must be american or british')
  return args
}

const args = parseArgs(process.argv.slice(2))
const rootDir = resolve(import.meta.dirname, '../..')
const scriptPath = resolve(rootDir, args.script)
const selectionPath = resolve(rootDir, args.selection)
const outputDirectory = resolve(rootDir, args['output-dir'])
const manifestPath = resolve(rootDir, args.manifest)
const credentialsPath = args.credentials
  ? resolve(args.credentials)
  : resolve(process.env.CLOUDSDK_CONFIG || resolve(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const [script, selection, credentials] = await Promise.all([
  readFile(scriptPath, 'utf8').then(JSON.parse),
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
const accent = selection[args.accent]
if (
  selection.schemaVersion !== 'gaokao-frequency-google-neural2-voice-selection-v1'
  || selection.status !== 'owner_approved'
  || selection.requestGranularity !== 'one_entry_per_request'
  || selection.audioConfig?.audioEncoding !== 'MP3'
  || selection.audioConfig?.sampleRateHertz !== 24_000
  || selection.audioConfig?.speakingRate !== 0.92
  || accent?.ownerVerdict !== 'approved'
  || script.voice !== accent.voice
  || basename(outputDirectory) !== accent.version
) {
  throw new Error('Google Neural2 voice-selection contract mismatch')
}
if (
  credentials.type !== 'authorized_user'
  || !credentials.client_id
  || !credentials.client_secret
  || !credentials.refresh_token
  || !credentials.quota_project_id
) {
  throw new Error('Application Default Credentials are unavailable or incomplete')
}
if (!Array.isArray(script.entries) || script.entries.length !== args['expected-count']) throw new Error(`Audio script must contain exactly ${args['expected-count']} entries`)
if (new Set(script.entries.map((entry) => entry.id)).size !== args['expected-count']) throw new Error('Audio script IDs must be unique')
if (script.entries.some((entry) => (
  !entry.audio?.text
  || (entry.audio.ssml && (!entry.audio.ssml.startsWith('<speak>') || !entry.audio.ssml.endsWith('</speak>')))
  || !/^[A-Za-z0-9._-]+$/u.test(entry.id)
))) {
  throw new Error('Golden audio script contains an empty text or unsafe ID')
}

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
if (!accessToken) throw new Error('ADC refresh response did not contain an access token')

const commonHeaders = {
  authorization: `Bearer ${accessToken}`,
  'x-goog-user-project': credentials.quota_project_id,
}
const voicesResponse = await fetch(`https://texttospeech.googleapis.com/v1/voices?languageCode=${accent.languageCode}`, {
  headers: commonHeaders,
})
if (!voicesResponse.ok) throw new Error(`Google voice lookup failed with HTTP ${voicesResponse.status}`)
const voiceListing = await voicesResponse.json()
const liveVoice = voiceListing.voices?.find((voice) => voice.name === accent.voice)
if (
  !liveVoice
  || liveVoice.ssmlGender !== accent.ssmlGender
  || liveVoice.naturalSampleRateHertz !== selection.audioConfig.sampleRateHertz
) {
  throw new Error(`Approved voice is unavailable or changed: ${accent.voice}`)
}

await mkdir(outputDirectory, { recursive: true })
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds))
const synthesize = async (audioInput) => {
  let lastError
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { ...commonHeaders, 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        input: audioInput.ssml ? { ssml: audioInput.ssml } : { text: audioInput.text },
        voice: { languageCode: accent.languageCode, name: accent.voice },
        audioConfig: selection.audioConfig,
      }),
    })
    if (response.ok) {
      const payload = await response.json()
      if (!payload.audioContent) throw new Error('Google synthesis response did not contain audioContent')
      return Buffer.from(payload.audioContent, 'base64')
    }
    const detail = await response.text()
    lastError = new Error(`Google synthesis failed with HTTP ${response.status}: ${detail.slice(0, 500)}`)
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 4) throw lastError
    await sleep(500 * 2 ** (attempt - 1))
  }
  throw lastError
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const round = (value, digits = 6) => Number(value.toFixed(digits))
const inspectAudio = (filePath) => {
  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels,bit_rate:format=duration',
    '-of', 'json', filePath,
  ], { encoding: 'utf8' }))
  const decoded = execFileSync('ffmpeg', [
    '-v', 'error', '-i', filePath, '-ac', '1', '-ar', '24000', '-f', 'f32le', 'pipe:1',
  ], { encoding: null, maxBuffer: 20 * 1024 * 1024 })
  let peak = 0
  let sumSquares = 0
  let firstAudibleSample = -1
  let lastAudibleSample = -1
  const threshold = 0.003
  const sampleCount = decoded.length / 4
  for (let index = 0; index < sampleCount; index += 1) {
    const value = Math.abs(decoded.readFloatLE(index * 4))
    peak = Math.max(peak, value)
    sumSquares += value * value
    if (value >= threshold) {
      if (firstAudibleSample < 0) firstAudibleSample = index
      lastAudibleSample = index
    }
  }
  if (firstAudibleSample < 0) throw new Error(`Generated audio is silent: ${filePath}`)
  return {
    codec: probe.streams?.[0]?.codec_name,
    sampleRate: Number(probe.streams?.[0]?.sample_rate),
    channels: Number(probe.streams?.[0]?.channels),
    bitrate: Number(probe.streams?.[0]?.bit_rate),
    durationSeconds: round(Number(probe.format?.duration), 3),
    peak: round(peak),
    rms: round(Math.sqrt(sumSquares / sampleCount)),
    leadingSilenceSeconds: round(firstAudibleSample / 24_000, 3),
    trailingSilenceSeconds: round((sampleCount - 1 - lastAudibleSample) / 24_000, 3),
  }
}

const results = new Array(script.entries.length)
let cursor = 0
let generatedCount = 0
let reusedCount = 0
const worker = async () => {
  while (cursor < script.entries.length) {
    const index = cursor
    cursor += 1
    const scripted = script.entries[index]
    const fileName = `${scripted.id}.mp3`
    const filePath = resolve(outputDirectory, fileName)
    let bytes
    try {
      if (args.force) throw Object.assign(new Error('forced regeneration'), { code: 'ENOENT' })
      await stat(filePath)
      bytes = await readFile(filePath)
      reusedCount += 1
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      bytes = await synthesize(scripted.audio)
      await writeFile(filePath, bytes)
      generatedCount += 1
    }
    const audio = inspectAudio(filePath)
    if (audio.codec !== 'mp3' || audio.sampleRate !== 24_000 || audio.channels !== 1) {
      throw new Error(`Unexpected Google audio format for ${scripted.id}`)
    }
    results[index] = {
      entryId: scripted.id,
      headword: scripted.headword,
      text: scripted.audio.text,
      ...(scripted.audio.ssml ? { ssml: scripted.audio.ssml } : {}),
      path: fileName,
      bytes: bytes.length,
      sha256: sha256(bytes),
      voice: accent.voice,
      format: 'audio-24khz-64kbitrate-mono-mp3',
      version: accent.version,
      ...audio,
      qa: { status: 'pending_owner_word_qa' },
    }
    const completed = generatedCount + reusedCount
    if (completed % 10 === 0 || completed === script.entries.length) {
      console.log(`${args.accent}: ${completed}/${script.entries.length}`)
    }
  }
}
await Promise.all(Array.from({ length: args.concurrency }, () => worker()))

const manifest = {
  schemaVersion: 'vocabulary-audio-manifest-v1',
  programId: script.programId,
  accent: args.accent,
  status: 'generated_pending_owner_word_qa',
  voice: accent.voice,
  format: 'audio-24khz-64kbitrate-mono-mp3',
  version: accent.version,
  generator: {
    provider: selection.provider,
    voiceFamily: selection.voiceFamily,
    endpoint: 'https://texttospeech.googleapis.com/v1/text:synthesize',
    requestGranularity: selection.requestGranularity,
    audioConfig: selection.audioConfig,
    credentialsType: 'application-default-authorized-user',
    checkedAt: args['checked-at'],
    voiceSelectionReceiptVersion: selection.schemaVersion,
  },
  entries: results,
  publicBasePath: `/vocabulary-assets/gaokao-frequency-v1/audio/${accent.version}`,
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({
  accent: args.accent,
  voice: accent.voice,
  entries: results.length,
  generated: generatedCount,
  reused: reusedCount,
  manifest: manifestPath,
}, null, 2))
