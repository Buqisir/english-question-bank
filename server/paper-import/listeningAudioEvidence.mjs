import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const LISTENING_AUDIO_PATHS = Object.freeze({
  original: 'source/listening-audio.mp3',
  playback: 'materialization/listening-audio/playback.mp3',
  asr: 'materialization/listening-audio/asr-v1.json',
  check: 'materialization/listening-audio/check-v1.json',
})

export const LISTENING_AUDIO_ATTACHMENTS = Object.freeze([
  {
    attachmentId: 'listening-audio-original',
    role: 'listening_audio_original',
    path: LISTENING_AUDIO_PATHS.original,
    mediaType: 'audio/mpeg',
  },
  {
    attachmentId: 'listening-audio-playback',
    role: 'listening_audio_playback',
    path: LISTENING_AUDIO_PATHS.playback,
    mediaType: 'audio/mpeg',
  },
  {
    attachmentId: 'listening-audio-asr',
    role: 'listening_audio_asr',
    path: LISTENING_AUDIO_PATHS.asr,
    mediaType: 'application/json',
  },
  {
    attachmentId: 'listening-audio-check',
    role: 'listening_audio_check',
    path: LISTENING_AUDIO_PATHS.check,
    mediaType: 'application/json',
  },
])

function fail(message) {
  const error = new Error(message)
  error.code = 'LISTENING_AUDIO_EVIDENCE_INVALID'
  throw error
}

function readArtifact(rootDir, relativePath) {
  const root = path.resolve(rootDir)
  const filePath = path.resolve(root, ...relativePath.split('/'))
  if (!filePath.startsWith(`${root}${path.sep}`) || !existsSync(filePath)) {
    fail(`Listening audio artifact is missing: ${relativePath}`)
  }
  return readFileSync(filePath)
}

function readJsonArtifact(rootDir, relativePath) {
  try {
    return JSON.parse(readArtifact(rootDir, relativePath).toString('utf8'))
  } catch (error) {
    if (error?.code === 'LISTENING_AUDIO_EVIDENCE_INVALID') throw error
    fail(`Listening audio artifact is not valid JSON: ${relativePath}`)
  }
}

function validateAsr(asr, paperId, playbackDigest) {
  if (
    asr?.schemaVersion !== 'listening-audio-asr-v1'
    || asr.paperId !== paperId
    || asr.playbackAudioSha256 !== playbackDigest
    || !Number.isFinite(asr.durationSeconds)
    || asr.durationSeconds <= 0
    || typeof asr.transcriptText !== 'string'
    || !asr.transcriptText.trim()
    || !Array.isArray(asr.segments)
    || asr.segments.length === 0
    || typeof asr.engine?.name !== 'string'
    || typeof asr.engine?.model !== 'string'
    || typeof asr.engine?.version !== 'string'
  ) fail('Listening ASR evidence is incomplete or not bound to playback audio')
  let previousEnd = 0
  for (const segment of asr.segments) {
    if (
      !Number.isFinite(segment?.startSeconds)
      || !Number.isFinite(segment?.endSeconds)
      || segment.startSeconds < previousEnd
      || segment.endSeconds <= segment.startSeconds
      || segment.endSeconds > asr.durationSeconds + 0.5
      || typeof segment.text !== 'string'
      || !segment.text.trim()
      || !Number.isFinite(segment.avgLogProbability)
      || !Number.isFinite(segment.noSpeechProbability)
    ) fail('Listening ASR segments are incomplete or out of order')
    previousEnd = segment.endSeconds
  }
  return asr
}

function validateCheck(check, paperId, descriptors, asr) {
  const reference = check?.comparisonReference
  if (
    check?.schemaVersion !== 'listening-audio-check-v1'
    || check.paperId !== paperId
    || check.originalAudioSha256 !== descriptors.get('listening_audio_original')?.sha256
    || check.playbackAudioSha256 !== descriptors.get('listening_audio_playback')?.sha256
    || check.asrSha256 !== descriptors.get('listening_audio_asr')?.sha256
    || check.durationSeconds !== asr.durationSeconds
    || check.comparison?.verdict !== 'pass'
    || !['authoritative_transcript', 'listening_questions'].includes(check.comparison?.basis)
    || !['materialization', 'explicit_file'].includes(reference?.source)
    || reference?.basis !== check.comparison?.basis
    || typeof reference?.text !== 'string'
    || !reference.text.trim()
    || sha256(Buffer.from(reference.text, 'utf8')) !== reference.textSha256
    || check.contentSafety?.verdict !== 'pass'
    || typeof check.contentSafety?.reviewedAt !== 'string'
    || Number.isNaN(Date.parse(check.contentSafety.reviewedAt))
    || check.contentSafety?.reviewedTranscriptSha256 !== check.asrSha256
    || check.contentSafety?.untrustedContentHandledAsData !== true
    || !Array.isArray(check.flaggedRanges)
    || typeof check.evidenceDigest !== 'string'
  ) fail('Listening audio check has not passed or is not bound to its evidence')
  const { evidenceDigest, ...evidence } = check
  if (digestJson(evidence) !== evidenceDigest) {
    fail('Listening audio evidence digest does not match the check receipt')
  }
  return check
}

export function assertListeningAudioManifest(rootDir, manifest) {
  if (manifest?.schemaVersion === 'universal-nck1-source-manifest-v1') {
    if (Object.hasOwn(manifest, 'attachments')) {
      fail('Universal Source Manifest v1 cannot carry attachments')
    }
    return null
  }
  if (
    manifest?.schemaVersion !== 'universal-nck1-source-manifest-v2'
    || !Array.isArray(manifest.attachments)
    || manifest.attachments.length !== LISTENING_AUDIO_ATTACHMENTS.length
  ) fail('Universal Source Manifest has an unsupported attachment shape')

  const descriptors = new Map()
  for (const expected of LISTENING_AUDIO_ATTACHMENTS) {
    const descriptor = manifest.attachments.find((item) => item?.role === expected.role)
    if (
      !descriptor
      || descriptor.attachmentId !== expected.attachmentId
      || descriptor.path !== expected.path
      || descriptor.mediaType !== expected.mediaType
      || !/^sha256:[a-f0-9]{64}$/.test(descriptor.sha256 || '')
      || !Number.isInteger(descriptor.byteLength)
      || descriptor.byteLength < 1
    ) fail(`Listening attachment descriptor is invalid: ${expected.role}`)
    const bytes = readArtifact(rootDir, descriptor.path)
    if (bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) {
      fail(`Listening attachment bytes changed: ${descriptor.path}`)
    }
    descriptors.set(descriptor.role, descriptor)
  }
  const asr = validateAsr(
    readJsonArtifact(rootDir, LISTENING_AUDIO_PATHS.asr),
    manifest.paperId,
    descriptors.get('listening_audio_playback').sha256,
  )
  const check = validateCheck(
    readJsonArtifact(rootDir, LISTENING_AUDIO_PATHS.check),
    manifest.paperId,
    descriptors,
    asr,
  )
  return { descriptors, asr, check }
}

export function listeningAudioAttachmentDescriptors(rootDir) {
  return LISTENING_AUDIO_ATTACHMENTS.map((attachment) => {
    const bytes = readArtifact(rootDir, attachment.path)
    return {
      ...attachment,
      sha256: sha256(bytes),
      byteLength: bytes.byteLength,
    }
  })
}
