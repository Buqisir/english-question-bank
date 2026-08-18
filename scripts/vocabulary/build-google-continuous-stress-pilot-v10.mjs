#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '../..')
const outputRoot = path.join(root, '.scratch/gaokao-audio-continuous-stress-pilot-v10')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/continuous-stress-pilot-v10')
const qaPath = path.join(root, '.scratch/gaokao-audio-v9-owner-qa-capture.json')
const selectionPath = path.join(root, 'data/vocabulary/gaokao-frequency-google-neural2-voice-selection-v1.json')
const sourceRoot = path.join(root, '.scratch/gaokao-audio-natural-reference-pilot-v7')

const contourByEntry = {
  'gaokao-frequency-0139-become': {
    american: { transitionStartSeconds: 0.25, transitionEndSeconds: 0.32 },
  },
  'gaokao-frequency-0227-research': {
    british: { transitionStartSeconds: 0.28, transitionEndSeconds: 0.36 },
  },
  'gaokao-frequency-0363-enough': {
    american: { transitionStartSeconds: 0.14, transitionEndSeconds: 0.22 },
  },
  'gaokao-frequency-0469-hotel': {
    american: { transitionStartSeconds: 0.27, transitionEndSeconds: 0.35 },
    british: { transitionStartSeconds: 0.35, transitionEndSeconds: 0.43 },
  },
}

const verdictAccents = {
  american_fail: ['american'],
  british_fail: ['british'],
  both_fail: ['american', 'british'],
}

const lowGain = 0.63
const highGain = 1.45
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readJson = (filePath) => readFile(filePath, 'utf8').then(JSON.parse)

const [qaPayload, selection, americanSource, britishSource] = await Promise.all([
  readJson(qaPath),
  readJson(selectionPath),
  readJson(path.join(sourceRoot, 'american-manifest.json')),
  readJson(path.join(sourceRoot, 'british-manifest.json')),
])

if (qaPayload.summary?.completed !== 5
  || qaPayload.summary?.failedWords !== 4
  || qaPayload.summary?.failedAccentAudio !== 5) {
  throw new Error('Expected the completed V9 owner QA capture with four failed words and five failed accent audios')
}

const sourceByAccent = {
  american: new Map(americanSource.entries.map((entry) => [entry.entryId, entry])),
  british: new Map(britishSource.entries.map((entry) => [entry.entryId, entry])),
}
const voiceByAccent = {
  american: selection.american.voice,
  british: selection.british.voice,
}
if (voiceByAccent.american !== 'en-US-Neural2-C' || selection.american.ssmlGender !== 'FEMALE') {
  throw new Error('V10 must preserve the owner-approved American female voice')
}
if (voiceByAccent.british !== 'en-GB-Neural2-D') {
  throw new Error('V10 must preserve the owner-approved British voice')
}

const entries = qaPayload.qa
  .filter((entry) => entry.audioVerdict !== 'pass')
  .map((entry) => {
    const accents = verdictAccents[entry.audioVerdict]
    const contours = contourByEntry[entry.entryId]
    if (!accents || !contours) throw new Error(`Unsupported V9 QA entry ${entry.entryId}`)
    for (const accent of accents) {
      if (!contours[accent]) throw new Error(`Missing ${accent} V10 contour for ${entry.entryId}`)
      if (!entry[`${accent}Issue`]?.trim()) throw new Error(`Missing ${accent} owner issue for ${entry.entryId}`)
      if (!sourceByAccent[accent].has(entry.entryId)) throw new Error(`Missing ${accent} V7 original-word source for ${entry.entryId}`)
    }
    return {
      entryId: entry.entryId,
      headword: entry.headword,
      accents,
      previousVerdict: entry.audioVerdict,
      ownerIssue: Object.fromEntries(accents.map((accent) => [accent, entry[`${accent}Issue`].trim()])),
      contours: Object.fromEntries(accents.map((accent) => [accent, contours[accent]])),
    }
  })

for (const accent of ['american', 'british']) {
  const accentEntries = entries.filter((entry) => entry.accents.includes(accent))
  const outputDirectory = path.join(outputRoot, accent)
  const publicDirectory = path.join(publicRoot, accent)
  await Promise.all([
    mkdir(outputDirectory, { recursive: true }),
    mkdir(publicDirectory, { recursive: true }),
  ])
  const manifestEntries = []

  for (const entry of accentEntries) {
    const source = sourceByAccent[accent].get(entry.entryId)
    if (source.voice !== voiceByAccent[accent]) {
      throw new Error(`${accent} ${entry.headword}: V7 source voice drifted from the approved voice`)
    }
    const sourcePath = path.join(sourceRoot, accent, source.path)
    const outputPath = path.join(outputDirectory, source.path)
    const publicPath = path.join(publicDirectory, source.path)
    const contour = entry.contours[accent]
    const volumeExpression = `if(lt(t,${contour.transitionStartSeconds}),${lowGain},if(gt(t,${contour.transitionEndSeconds}),${highGain},${lowGain}+(${highGain}-${lowGain})*(t-${contour.transitionStartSeconds})/(${contour.transitionEndSeconds}-${contour.transitionStartSeconds})))`

    execFileSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', sourcePath,
      '-af', `volume='${volumeExpression}':eval=frame,alimiter=limit=0.96:level=false`,
      '-ar', String(selection.audioConfig.sampleRateHertz), '-ac', '1',
      '-codec:a', 'libmp3lame', '-b:a', '48k', outputPath,
    ])

    const [sourceBytes, bytes] = await Promise.all([readFile(sourcePath), readFile(outputPath)])
    await writeFile(publicPath, bytes)
    const probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error', '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels:format=duration',
      '-of', 'json', outputPath,
    ], { encoding: 'utf8' }))
    const durationSeconds = Number(probe.format.duration)
    if (probe.streams?.[0]?.codec_name !== 'mp3'
      || Number(probe.streams?.[0]?.sample_rate) !== selection.audioConfig.sampleRateHertz
      || Number(probe.streams?.[0]?.channels) !== 1
      || Math.abs(durationSeconds - source.durationSeconds) > 0.03) {
      throw new Error(`${accent} ${entry.headword}: the continuous whole-word repair changed the word duration or audio shape`)
    }

    manifestEntries.push({
      entryId: entry.entryId,
      headword: entry.headword,
      text: source.text,
      path: source.path,
      bytes: bytes.length,
      sha256: sha256(bytes),
      sourceSha256: sha256(sourceBytes),
      durationSeconds: Number(durationSeconds.toFixed(3)),
      voice: source.voice,
      strategy: 'owner-approved-voice-original-word-continuous-energy-contour',
      contour: {
        ...contour,
        lowGain,
        highGain,
      },
    })
  }

  await writeFile(path.join(outputRoot, `${accent}-manifest.json`), `${JSON.stringify({
    schemaVersion: 'gaokao-frequency-continuous-stress-pilot-v10',
    status: 'candidate_pending_owner_qa',
    accent,
    voice: voiceByAccent[accent],
    source: 'gaokao-frequency-natural-reference-pilot-v7',
    entries: manifestEntries,
  }, null, 2)}\n`)
}

await writeFile(path.join(outputRoot, 'repair-spec.json'), `${JSON.stringify({
  schemaVersion: 'gaokao-frequency-continuous-stress-pilot-v10',
  status: 'candidate_pending_owner_qa',
  sourceQaTarget: qaPayload.qaTarget,
  strategy: 'failed-accent-only; preserve approved voices and complete original-word waveform; no syllable split or crop; apply one smooth energy contour across the connected word',
  entries,
}, null, 2)}\n`)

console.log(JSON.stringify({
  words: entries.length,
  audioItems: entries.reduce((count, entry) => count + entry.accents.length, 0),
  voices: voiceByAccent,
  outputRoot,
  publicRoot,
}, null, 2))
