#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'

const root = path.resolve(import.meta.dirname, '..')
const assetRoot = path.join(root, '.scratch/gaokao-audio-continuous-stress-pilot-v10')
const sourceRoot = path.join(root, '.scratch/gaokao-audio-natural-reference-pilot-v7')
const publicRoot = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/audio/continuous-stress-pilot-v10')
const qaPath = path.join(root, 'app/public/vocabulary-assets/gaokao-frequency-v1/qa/continuous-stress-audio-pilot-owner-qa-v10.html')

const expected = new Map([
  ['gaokao-frequency-0139-become', ['american']],
  ['gaokao-frequency-0227-research', ['british']],
  ['gaokao-frequency-0363-enough', ['american']],
  ['gaokao-frequency-0469-hotel', ['american', 'british']],
])
const expectedVoices = {
  american: 'en-US-Neural2-C',
  british: 'en-GB-Neural2-D',
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
const readJson = (filePath) => readFile(filePath, 'utf8').then(JSON.parse)
const meanVolume = (filePath, startSeconds, endSeconds) => {
  const filter = endSeconds == null
    ? `atrim=start=${startSeconds},volumedetect`
    : `atrim=start=${startSeconds}:end=${endSeconds},volumedetect`
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-i', filePath, '-af', filter, '-f', 'null', '-',
  ], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`ffmpeg failed while measuring ${filePath}: ${result.stderr}`)
  const output = result.stderr
  const match = output.match(/mean_volume:\s*(-?\d+(?:\.\d+)?) dB/u)
  if (!match) throw new Error(`Unable to measure mean volume for ${filePath}`)
  return Number(match[1])
}

const [spec, americanManifest, britishManifest, americanSource, britishSource, qaHtml] = await Promise.all([
  readJson(path.join(assetRoot, 'repair-spec.json')),
  readJson(path.join(assetRoot, 'american-manifest.json')),
  readJson(path.join(assetRoot, 'british-manifest.json')),
  readJson(path.join(sourceRoot, 'american-manifest.json')),
  readJson(path.join(sourceRoot, 'british-manifest.json')),
  readFile(qaPath, 'utf8'),
])

if (spec.entries.length !== 4) throw new Error(`Expected 4 V10 words, got ${spec.entries.length}`)
if (spec.entries.reduce((count, entry) => count + entry.accents.length, 0) !== 5) {
  throw new Error('Expected exactly 5 failed-accent repairs in V10')
}
for (const entry of spec.entries) {
  if (JSON.stringify(entry.accents) !== JSON.stringify(expected.get(entry.entryId))) {
    throw new Error(`Unexpected V10 scope for ${entry.entryId}`)
  }
}
if (spec.entries.some((entry) => entry.entryId === 'gaokao-frequency-0001-the')) {
  throw new Error('V9-approved the must not be regenerated or re-QAed')
}

const sourceManifests = { american: americanSource, british: britishSource }
for (const [accent, manifest] of Object.entries({ american: americanManifest, british: britishManifest })) {
  if (manifest.voice !== expectedVoices[accent]) throw new Error(`${accent} approved voice changed`)
  const sourceById = new Map(sourceManifests[accent].entries.map((entry) => [entry.entryId, entry]))
  for (const entry of manifest.entries) {
    if (!expected.get(entry.entryId)?.includes(accent)) throw new Error(`Unexpected ${accent} manifest entry ${entry.entryId}`)
    if (entry.voice !== expectedVoices[accent]) throw new Error(`${accent} ${entry.headword}: source voice changed`)
    if (entry.strategy !== 'owner-approved-voice-original-word-continuous-energy-contour') {
      throw new Error(`${accent} ${entry.headword}: unexpected V10 strategy`)
    }
    if ('ssml' in entry) throw new Error(`${accent} ${entry.headword}: V10 must not split the word into SSML nodes`)
    const source = sourceById.get(entry.entryId)
    if (!source) throw new Error(`${accent} ${entry.headword}: missing complete original-word source`)
    const sourcePath = path.join(sourceRoot, accent, source.path)
    const outputPath = path.join(assetRoot, accent, entry.path)
    const publicPath = path.join(publicRoot, accent, entry.path)
    const [sourceBytes, outputBytes, publicBytes] = await Promise.all([
      readFile(sourcePath), readFile(outputPath), readFile(publicPath),
    ])
    if (entry.sourceSha256 !== sha256(sourceBytes)) throw new Error(`${accent} ${entry.headword}: source receipt mismatch`)
    if (entry.sha256 !== sha256(outputBytes) || entry.sha256 !== sha256(publicBytes)) {
      throw new Error(`${accent} ${entry.headword}: generated/public asset receipt mismatch`)
    }
    if (entry.sha256 === entry.sourceSha256) throw new Error(`${accent} ${entry.headword}: contour was not applied`)
    if (Math.abs(entry.durationSeconds - source.durationSeconds) > 0.03) {
      throw new Error(`${accent} ${entry.headword}: original word was cropped or lengthened`)
    }
    const beforeFirst = meanVolume(sourcePath, 0, entry.contour.transitionStartSeconds)
    const beforeSecond = meanVolume(sourcePath, entry.contour.transitionEndSeconds)
    const afterFirst = meanVolume(outputPath, 0, entry.contour.transitionStartSeconds)
    const afterSecond = meanVolume(outputPath, entry.contour.transitionEndSeconds)
    const contrastIncrease = (afterSecond - afterFirst) - (beforeSecond - beforeFirst)
    if (contrastIncrease < 6.5) {
      throw new Error(`${accent} ${entry.headword}: second-syllable contrast only increased ${contrastIncrease.toFixed(1)} dB`)
    }
  }
}

if (!qaHtml.includes('4 词完整原词重音返修 V10')
  || !qaHtml.includes('gaokao-continuous-stress-audio-pilot-owner-qa-v10')
  || !qaHtml.includes('../audio/continuous-stress-pilot-v10/')) {
  throw new Error('V10 Owner QA page is not bound to its isolated assets and storage')
}

console.log('PASS gaokao continuous-stress V10: 4 words / 5 accents, approved voices, complete original-word duration, smooth energy contrast, isolated Owner QA')
