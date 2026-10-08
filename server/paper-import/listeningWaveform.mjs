import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha256 } from '../../shared/paper-canonical/stable.mjs'
import { assertListeningWaveform } from '../../shared/paper-canonical/listeningWaveform.mjs'

export function buildListeningWaveform(playbackBytes, durationSeconds) {
  // Decode the exact normalized MP3, not the original or segmentation PCM.
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'f32le',
    '-ac', '1', '-ar', '4000', 'pipe:1'], { input: playbackBytes, maxBuffer: 128 * 1024 * 1024, timeout: 120_000 })
  const samples = pcm.length / 4
  const peaks = []
  for (let from = 0; from < samples; from += 200) {
    const to = Math.min(samples, from + 200)
    let sum = 0
    for (let index = from; index < to; index += 1) sum += pcm.readFloatLE(index * 4) ** 2
    peaks.push(Number(Math.sqrt(sum / (to - from)).toFixed(6)))
  }
  const sorted = [...peaks].sort((left, right) => left - right)
  const waveform = {
    schemaVersion: 'listening-waveform-v1', playbackAudioSha256: sha256(playbackBytes),
    bucketSeconds: 0.05, durationSeconds: samples / 4000,
    reference: sorted[Math.floor(sorted.length * 0.995)] || 1, peaks,
  }
  return assertListeningWaveform(waveform, sha256(playbackBytes), durationSeconds)
}

export function readListeningWaveform(filePath, playbackAudioSha256, durationSeconds) {
  if (!existsSync(filePath)) return null // Historical imports remain playable.
  return assertListeningWaveform(JSON.parse(readFileSync(filePath, 'utf8')), playbackAudioSha256, durationSeconds)
}

export function prepareListeningWaveform(filePath, playbackBytes, durationSeconds) {
  const waveform = readListeningWaveform(filePath, sha256(playbackBytes), durationSeconds)
    || buildListeningWaveform(playbackBytes, durationSeconds)
  // Never overwrite an existing derivative, even if its binding is invalid.
  if (!existsSync(filePath)) {
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, `${JSON.stringify(waveform)}\n`, { flag: 'wx' })
  }
  return waveform
}
