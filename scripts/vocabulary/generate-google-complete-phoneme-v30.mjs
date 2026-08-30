#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const scratchRoot = path.join(root, '.scratch/gaokao-google-neural2-complete-phoneme-v30')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-complete-phoneme-v30')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const sourceManifestPath = path.join(root, 'data/vocabulary/gaokao-frequency-full-american-audio-manifest-v1.json')
const v29QaPath = path.join(root, '.scratch/gaokao-google-voice-qwen-same-voice-surrogate-v29/owner-qa-summary-v29.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const cases = [
  {
    entryId: 'gaokao-frequency-2396-ballet',
    headword: 'ballet',
    ipa: 'bælˈeɪ',
    verifiedIpa: '/bælˈeɪ/',
    before: 'She studies ',
    after: ' every day.',
  },
  {
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    ipa: 'ˌvaɪ.əˈlɪn',
    verifiedIpa: '/ˌvaɪ.əˈlɪn/',
    before: 'She plays the ',
    after: ' beautifully.',
  },
]

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const escapeXml = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const [selection, sourceManifest, v29Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(sourceManifestPath, 'utf8').then(JSON.parse),
  readFile(v29QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])

if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') {
  throw new Error('V30 must preserve the approved Google American female voice')
}
if (v29Qa.counts?.failed !== 2 || !cases.every((entry) => v29Qa.entries.some((qa) => qa.entryId === entry.entryId && qa.verdict === 'fail'))) {
  throw new Error('V30 requires the complete V29 owner rejection')
}

const sourceById = new Map(sourceManifest.entries.map((entry) => [entry.entryId, entry]))
if (!cases.every((entry) => sourceById.has(entry.entryId))) throw new Error('V30 source Google audio is incomplete')

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

await Promise.all([mkdir(scratchRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])

const synthesize = async ({endpoint = 'v1', input, audioEncoding = 'MP3', enableTimePointing}) => {
  const response = await fetch(`https://texttospeech.googleapis.com/${endpoint}/text:synthesize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      input,
      voice: {languageCode: voice.languageCode, name: voice.voice},
      audioConfig: {
        audioEncoding,
        sampleRateHertz: selection.audioConfig.sampleRateHertz,
        speakingRate: selection.audioConfig.speakingRate,
      },
      ...(enableTimePointing ? {enableTimePointing} : {}),
    }),
  })
  if (!response.ok) throw new Error(`Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  return response.json()
}

const probeAudio = (audioPath) => {
  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
    '-of', 'json', audioPath,
  ], {encoding: 'utf8'}))
  const stream = probe.streams?.[0]
  const durationSeconds = Number(probe.format?.duration)
  if (stream?.codec_name !== 'mp3'
    || Number(stream.sample_rate) !== selection.audioConfig.sampleRateHertz
    || Number(stream.channels) !== 1
    || !Number.isFinite(durationSeconds)
    || durationSeconds < 0.3
    || durationSeconds > 3) {
    throw new Error(`Invalid V30 audio: ${audioPath}`)
  }
  execFileSync('ffmpeg', ['-v', 'error', '-i', audioPath, '-f', 'null', '-'])
  return Number(durationSeconds.toFixed(3))
}

const entries = []
for (const entry of cases) {
  const source = sourceById.get(entry.entryId)
  const sourcePath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-us-c-v1', source.path)
  const sourceBytes = await readFile(sourcePath)
  if (sha256(sourceBytes) !== source.sha256) throw new Error(`Source Google hash mismatch: ${entry.headword}`)
  entries.push({
    ...entry,
    candidateLabel: 'A30',
    publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-us-c-v1/${source.path}`,
    path: source.path,
    bytes: sourceBytes.length,
    sha256: source.sha256,
    durationSeconds: probeAudio(sourcePath),
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    strategy: 'frozen-original-google-plain-text-baseline',
    inputText: entry.headword,
  })

  const isolatedSsml = `<speak><phoneme alphabet="ipa" ph="${escapeXml(entry.ipa)}">${escapeXml(entry.headword)}</phoneme></speak>`
  const isolatedPayload = await synthesize({input: {ssml: isolatedSsml}})
  const isolatedBytes = Buffer.from(isolatedPayload.audioContent, 'base64')
  const isolatedFilename = `${entry.entryId}--american--b30.mp3`
  const isolatedPath = path.join(publicRoot, isolatedFilename)
  await writeFile(isolatedPath, isolatedBytes)
  entries.push({
    ...entry,
    candidateLabel: 'B30',
    publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-complete-phoneme-v30/${isolatedFilename}`,
    path: isolatedFilename,
    bytes: isolatedBytes.length,
    sha256: sha256(isolatedBytes),
    durationSeconds: probeAudio(isolatedPath),
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    strategy: 'google-whole-word-ipa-isolated',
    ssml: isolatedSsml,
  })

  const contextSsml = `<speak>${escapeXml(entry.before)}<mark name="target-start"/><phoneme alphabet="ipa" ph="${escapeXml(entry.ipa)}">${escapeXml(entry.headword)}</phoneme><mark name="target-end"/>${escapeXml(entry.after)}</speak>`
  const contextPayload = await synthesize({
    endpoint: 'v1beta1',
    input: {ssml: contextSsml},
    audioEncoding: 'LINEAR16',
    enableTimePointing: ['SSML_MARK'],
  })
  const targetStart = contextPayload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
  const targetEnd = contextPayload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) {
    throw new Error(`Invalid V30 SSML timepoints: ${entry.headword}`)
  }
  const contextWavPath = path.join(scratchRoot, `${entry.entryId}--american--c30.context.wav`)
  const contextFilename = `${entry.entryId}--american--c30.mp3`
  const contextPath = path.join(publicRoot, contextFilename)
  await writeFile(contextWavPath, Buffer.from(contextPayload.audioContent, 'base64'))
  const trimStart = Math.max(0, targetStart - 0.035)
  const trimEnd = targetEnd + 0.08
  const trimDuration = trimEnd - trimStart
  const fadeOutStart = Math.max(0, trimDuration - 0.02)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', contextWavPath,
    '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.01,afade=t=out:st=${fadeOutStart}:d=0.02`,
    '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', contextPath,
  ])
  await rm(contextWavPath)
  const contextBytes = await readFile(contextPath)
  entries.push({
    ...entry,
    candidateLabel: 'C30',
    publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-complete-phoneme-v30/${contextFilename}`,
    path: contextFilename,
    bytes: contextBytes.length,
    sha256: sha256(contextBytes),
    durationSeconds: probeAudio(contextPath),
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    strategy: 'google-whole-word-ipa-natural-context-timepoint-crop',
    ssml: contextSsml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    trimStartSeconds: trimStart,
    trimEndSeconds: trimEnd,
  })
}

const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-complete-phoneme-v30',
  status: 'private_local_candidates_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  hypothesis: 'The prior teacher split each word across multiple phoneme tags and omitted phonetic stress markers; V30 uses one whole-word IPA phoneme tag with explicit stress in the approved original Google voice.',
  voice: voice.voice,
  speakingRate: selection.audioConfig.speakingRate,
  entries,
  failures: [],
}
await writeFile(path.join(scratchRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(scratchRoot, 'manifest.json'), candidates: entries.length, failures: 0}))
