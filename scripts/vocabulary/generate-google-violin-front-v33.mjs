#!/usr/bin/env node

import {execFileSync} from 'node:child_process'
import {createHash} from 'node:crypto'
import {homedir} from 'node:os'
import path from 'node:path'
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-google-neural2-violin-front-v33')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-front-v33')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const v32QaPath = path.join(root, '.scratch/gaokao-google-neural2-violin-stress-v32/owner-qa-summary-v32.json')
const credentialsPath = path.resolve(process.env.CLOUDSDK_CONFIG || path.join(homedir(), '.config/gcloud'), 'application_default_credentials.json')

const linSsml = '<prosody rate="90%" volume="+2dB"><phoneme alphabet="ipa" ph="ˈlɪn">lin</phoneme></prosody>'
const variants = {
  A33: {
    description: 'explicit-vai-natural-schwa-preserved-lin',
    frontSsml: '<prosody rate="100%" volume="-1dB"><phoneme alphabet="ipa" ph="vaɪ">vi</phoneme></prosody><prosody rate="118%" volume="-3dB"><phoneme alphabet="ipa" ph="ə">o</phoneme></prosody>',
  },
  B33: {
    description: 'explicit-vai-shorter-schwa-preserved-lin',
    frontSsml: '<prosody rate="96%" volume="+0dB"><phoneme alphabet="ipa" ph="vaɪ">vi</phoneme></prosody><prosody rate="128%" volume="-4dB"><phoneme alphabet="ipa" ph="ə">o</phoneme></prosody>',
  },
}

const [selection, v32Qa, credentials] = await Promise.all([
  readFile(selectionPath, 'utf8').then(JSON.parse),
  readFile(v32QaPath, 'utf8').then(JSON.parse),
  readFile(credentialsPath, 'utf8').then(JSON.parse),
])
if (selection.american.voice !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') {
  throw new Error('V33 must preserve the approved Google American female voice')
}
if (v32Qa.counts?.linUsable !== 1 || v32Qa.counts?.frontNeedsRepair !== 1) {
  throw new Error('V33 requires the V32 LIN approval and front-syllable repair request')
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
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const probeDuration = (audioPath) => Number(JSON.parse(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', audioPath,
], {encoding: 'utf8'})).format.duration)

await Promise.all([mkdir(outputRoot, {recursive: true}), mkdir(publicRoot, {recursive: true})])
const entries = []
for (const [candidateLabel, variant] of Object.entries(variants)) {
  const ssml = `<speak>She plays the <break time="90ms"/><mark name="target-start"/>${variant.frontSsml}${linSsml}<mark name="target-end"/><break time="90ms"/> beautifully.</speak>`
  const response = await fetch('https://texttospeech.googleapis.com/v1beta1/text:synthesize', {
    method: 'POST',
    headers,
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
  if (!response.ok) throw new Error(`${candidateLabel}: Google synthesis HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  const payload = await response.json()
  const targetStart = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-start')?.timeSeconds
  const targetEnd = payload.timepoints?.find((timepoint) => timepoint.markName === 'target-end')?.timeSeconds
  if (!Number.isFinite(targetStart) || !Number.isFinite(targetEnd) || targetEnd <= targetStart) throw new Error(`${candidateLabel}: invalid SSML timepoints`)
  const contextPath = path.join(outputRoot, `violin--${candidateLabel.toLowerCase()}.context.wav`)
  const filename = `gaokao-frequency-2081-violin--american--${candidateLabel.toLowerCase()}.mp3`
  const scratchPath = path.join(outputRoot, filename)
  const publicPath = path.join(publicRoot, filename)
  await writeFile(contextPath, Buffer.from(payload.audioContent, 'base64'))
  const trimStart = Math.max(0, targetStart - 0.015)
  const trimEnd = targetEnd + 0.020
  const trimmedDuration = trimEnd - trimStart
  const fadeOutStart = Math.max(0, trimmedDuration - 0.008)
  execFileSync('ffmpeg', [
    '-y', '-v', 'error', '-i', contextPath,
    '-af', `atrim=start=${trimStart}:end=${trimEnd},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.006,afade=t=out:st=${fadeOutStart}:d=0.008`,
    '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1', '-b:a', '64k', scratchPath,
  ])
  await rm(contextPath)
  execFileSync('ffmpeg', ['-v', 'error', '-i', scratchPath, '-f', 'null', '-'])
  const bytes = await readFile(scratchPath)
  await writeFile(publicPath, bytes)
  entries.push({
    entryId: 'gaokao-frequency-2081-violin',
    headword: 'violin',
    accent: 'american',
    verifiedIpa: '/ˌvaɪ.əˈlɪn/',
    candidateLabel,
    strategy: variant.description,
    preservedLinSsml: linSsml,
    voice: voice.voice,
    speakingRate: selection.audioConfig.speakingRate,
    ssml,
    targetStartSeconds: targetStart,
    targetEndSeconds: targetEnd,
    trimStartSeconds: trimStart,
    trimEndSeconds: trimEnd,
    path: filename,
    publicPath: `/vocabulary-assets/gaokao-frequency-v1/audio/google-neural2-violin-front-v33/${filename}`,
    bytes: bytes.length,
    sha256: sha256(bytes),
    durationSeconds: Number(probeDuration(scratchPath).toFixed(3)),
  })
}

const manifest = {
  schemaVersion: 'gaokao-frequency-google-neural2-violin-front-v33',
  status: 'private_local_candidates_pending_owner_qa',
  distribution: 'local_private_evaluation_only',
  formalAssetsChanged: false,
  preservedUsable: [
    {entryId: 'gaokao-frequency-2396-ballet', candidateLabel: 'A31'},
    {entryId: 'gaokao-frequency-2081-violin', component: 'LIN', sourceCandidateLabel: 'C32'},
  ],
  strategy: 'Keep the approved C32 LIN controls byte-for-byte in SSML while splitting the front into explicit /vaɪ/ and reduced /ə/ Google phoneme segments with two schwa timings.',
  variants,
  entries,
  failures: [],
}
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
console.log(JSON.stringify({manifest: path.join(outputRoot, 'manifest.json'), candidates: entries.length, failures: 0}))
