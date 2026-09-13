import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import {
  LISTENING_AUDIO_PATHS,
  assertListeningAudioManifest,
  listeningAudioAttachmentDescriptors,
  listeningOrderedBigramRecall,
  listeningSegmentOrderRecall,
  minimumListeningOrderedBigramRecall,
  minimumListeningSegmentOrderRecall,
} from '../../server/paper-import/listeningAudioEvidence.mjs'
import { digestJson, sha256 } from '../../shared/paper-canonical/stable.mjs'

const transcriptTokenMinimum = 20
const questionStopWords = new Set([
  'about', 'after', 'before', 'could', 'does', 'from', 'have', 'much', 'should',
  'that', 'their', 'there', 'these', 'they', 'this', 'what', 'when', 'where',
  'which', 'with', 'would', 'woman', 'man',
])

function fail(message, code = 'LISTENING_AUDIO_FAILED') {
  const error = new Error(message)
  error.code = code
  throw error
}

function round(value, precision = 4) {
  return Number(Number(value).toFixed(precision))
}

function atomicJson(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, filePath)
}

function artifactPath(paperDir, relativePath) {
  return path.join(paperDir, ...relativePath.split('/'))
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) fail(`${label} is missing: ${filePath}`)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    fail(`${label} is not valid JSON: ${filePath}`)
  }
}

function probeAudio(filePath) {
  let probe
  try {
    probe = JSON.parse(execFileSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration:stream=codec_name,codec_type',
      '-of', 'json',
      filePath,
    ], { encoding: 'utf8' }))
  } catch {
    fail(`FFmpeg cannot decode listening audio: ${filePath}`, 'LISTENING_AUDIO_DECODE_FAILED')
  }
  const audioStreams = (probe.streams || []).filter((stream) => stream.codec_type === 'audio')
  const durationSeconds = Number(probe.format?.duration)
  if (
    audioStreams.length !== 1
    || audioStreams[0].codec_name !== 'mp3'
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) fail('Listening audio must contain exactly one decodable MP3 audio stream')
  try {
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-xerror',
      '-i', filePath,
      '-map', '0:a:0',
      '-f', 'null',
      '-',
    ], { stdio: 'pipe' })
  } catch {
    fail('FFmpeg full-file decode failed', 'LISTENING_AUDIO_DECODE_FAILED')
  }
  return { durationSeconds: round(durationSeconds, 3) }
}

function normalizePlayback(sourcePath, targetPath) {
  mkdirSync(path.dirname(targetPath), { recursive: true })
  const temporary = `${targetPath}.tmp-${process.pid}.mp3`
  try {
    execFileSync('ffmpeg', [
      '-v', 'error',
      '-y',
      '-i', sourcePath,
      '-map', '0:a:0',
      '-vn',
      '-ac', '1',
      '-ar', '24000',
      '-codec:a', 'libmp3lame',
      '-b:a', '96k',
      temporary,
    ], { stdio: 'pipe' })
    probeAudio(temporary)
    renameSync(temporary, targetPath)
  } catch (error) {
    rmSync(temporary, { force: true })
    if (error?.code === 'LISTENING_AUDIO_DECODE_FAILED') throw error
    fail('FFmpeg could not create normalized playback audio', 'LISTENING_AUDIO_NORMALIZE_FAILED')
  }
}

function normalizedAsr(raw, paperId, playbackAudioSha256, durationSeconds) {
  const segments = (raw?.segments || []).map((segment, index) => ({
    segmentId: `segment-${String(index + 1).padStart(4, '0')}`,
    startSeconds: round(segment.startSeconds),
    endSeconds: round(segment.endSeconds),
    text: String(segment.text || '').trim(),
    avgLogProbability: round(segment.avgLogProbability),
    noSpeechProbability: round(segment.noSpeechProbability),
  }))
  const asr = {
    schemaVersion: 'listening-audio-asr-v1',
    paperId,
    playbackAudioSha256,
    durationSeconds,
    language: String(raw?.language || 'en'),
    languageProbability: round(raw?.languageProbability ?? 0),
    engine: {
      name: String(raw?.engine?.name || ''),
      model: String(raw?.engine?.model || ''),
      version: String(raw?.engine?.version || ''),
      computeType: String(raw?.engine?.computeType || ''),
    },
    transcriptText: segments.map((segment) => segment.text).join(' ').trim(),
    segments,
  }
  let previousEnd = 0
  if (
    !asr.transcriptText
    || !asr.engine.name
    || !asr.engine.model
    || !asr.engine.version
    || segments.length === 0
    || segments.some((segment) => {
      const invalid = !Number.isFinite(segment.startSeconds)
        || !Number.isFinite(segment.endSeconds)
        || segment.startSeconds < previousEnd
        || segment.endSeconds <= segment.startSeconds
        || segment.endSeconds > durationSeconds + 0.5
        || !segment.text
        || !Number.isFinite(segment.avgLogProbability)
        || !Number.isFinite(segment.noSpeechProbability)
      previousEnd = segment.endSeconds
      return invalid
    })
  ) fail('ASR produced no usable timestamped transcript', 'LISTENING_AUDIO_ASR_EMPTY')
  return asr
}

function transcribe(playbackPath, fixturePath = null) {
  if (fixturePath) return readJson(path.resolve(fixturePath), 'ASR fixture')
  const python = process.env.QUESTION_BANK_LISTENING_ASR_PYTHON
    || path.join(homedir(), '.local', 'share', 'eqbank-listening-asr', 'bin', 'python')
  if (!existsSync(python)) {
    fail(
      `Listening ASR environment is missing: ${python}. Run .agents/setup first.`,
      'LISTENING_AUDIO_ASR_UNAVAILABLE',
    )
  }
  const model = process.env.QUESTION_BANK_LISTENING_ASR_MODEL || 'small.en'
  try {
    return JSON.parse(execFileSync(python, [
      path.join(import.meta.dirname, 'transcribe-listening.py'),
      playbackPath,
      '--model',
      model,
    ], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }))
  } catch (error) {
    const detail = String(error?.stderr || '').trim().slice(0, 500)
    fail(
      `Whole-file ASR failed${detail ? `: ${detail}` : ''}`,
      'LISTENING_AUDIO_ASR_FAILED',
    )
  }
}

export function stageListeningAudio({ paperDir, paperId, sourcePath, asrFixturePath = null }) {
  const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
  const manifest = readJson(manifestPath, 'Universal Source Manifest')
  if (
    manifest.schemaVersion !== 'universal-nck1-source-manifest-v1'
    || manifest.paperId !== paperId
  ) fail('Listening audio can only be staged onto an attachment-free Universal Source Manifest')
  const originalPath = artifactPath(paperDir, LISTENING_AUDIO_PATHS.original)
  const playbackPath = artifactPath(paperDir, LISTENING_AUDIO_PATHS.playback)
  const asrPath = artifactPath(paperDir, LISTENING_AUDIO_PATHS.asr)
  if ([originalPath, playbackPath, asrPath].some(existsSync)) {
    fail('Listening audio is already staged; do not overwrite immutable evidence')
  }
  if (path.extname(sourcePath).toLowerCase() !== '.mp3' || !existsSync(sourcePath)) {
    fail('Listening audio source must be one existing MP3')
  }
  mkdirSync(path.dirname(originalPath), { recursive: true })
  try {
    copyFileSync(sourcePath, originalPath)
    probeAudio(originalPath)
    normalizePlayback(originalPath, playbackPath)
    const playback = readFileSync(playbackPath)
    const { durationSeconds } = probeAudio(playbackPath)
    const asr = normalizedAsr(
      transcribe(playbackPath, asrFixturePath),
      paperId,
      sha256(playback),
      durationSeconds,
    )
    atomicJson(asrPath, asr)
    return {
      paperId,
      originalAudioSha256: sha256(readFileSync(originalPath)),
      playbackAudioSha256: asr.playbackAudioSha256,
      asrSha256: sha256(readFileSync(asrPath)),
      durationSeconds,
      segments: asr.segments.length,
    }
  } catch (error) {
    for (const filePath of [originalPath, playbackPath, asrPath]) rmSync(filePath, { force: true })
    throw error
  }
}

function tokenize(text) {
  return String(text || '').toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu) || []
}

function overlap(reference, actual) {
  const counts = new Map()
  for (const token of actual) counts.set(token, (counts.get(token) || 0) + 1)
  let matches = 0
  for (const token of reference) {
    const remaining = counts.get(token) || 0
    if (remaining > 0) {
      matches += 1
      counts.set(token, remaining - 1)
    }
  }
  return matches
}

function comparisonFlag(code, message, { severity = 'review', startSeconds = 0, endSeconds = 0 } = {}) {
  return { code, severity, startSeconds, endSeconds, message }
}

export function compareListeningAudio({ asr, basis, referenceText, referenceSegmentTexts = null }) {
  if (!['authoritative_transcript', 'listening_questions'].includes(basis)) {
    fail('Listening comparison basis is invalid')
  }
  const actualTokens = tokenize(asr.transcriptText)
  const referenceTokens = tokenize(referenceText)
  if (actualTokens.length === 0 || referenceTokens.length === 0) {
    fail('Listening comparison needs non-empty ASR and reference text')
  }
  const flags = []
  const spokenSeconds = asr.segments.reduce(
    (total, segment) => total + segment.endSeconds - segment.startSeconds,
    0,
  )
  const speechCoverage = spokenSeconds / asr.durationSeconds
  const firstStart = asr.segments[0].startSeconds
  const tailGap = asr.durationSeconds - asr.segments.at(-1).endSeconds
  const averageLogProbability = asr.segments.reduce(
    (total, segment) => total + segment.avgLogProbability,
    0,
  ) / asr.segments.length
  if (speechCoverage < 0.08) {
    flags.push(comparisonFlag(
      'LISTENING_AUDIO_SPEECH_COVERAGE_LOW',
      'Too little of the audio contains recognized speech',
      { severity: 'block', startSeconds: 0, endSeconds: asr.durationSeconds },
    ))
  }
  if (firstStart > 120) {
    flags.push(comparisonFlag(
      'LISTENING_AUDIO_INITIAL_GAP_LONG',
      'The audio has an unusually long silent or unrecognized opening',
      { endSeconds: firstStart },
    ))
  }
  if (tailGap > Math.max(120, asr.durationSeconds * 0.2)) {
    flags.push(comparisonFlag(
      'LISTENING_AUDIO_TAIL_GAP_LONG',
      'The audio has an unusually long silent or unrecognized tail',
      { startSeconds: asr.segments.at(-1).endSeconds, endSeconds: asr.durationSeconds },
    ))
  }
  if (averageLogProbability < -1.25) {
    flags.push(comparisonFlag(
      'LISTENING_AUDIO_ASR_CONFIDENCE_LOW',
      'Whole-file transcription confidence is too low for a lightweight check',
      { startSeconds: 0, endSeconds: asr.durationSeconds },
    ))
  }

  let metrics
  if (basis === 'authoritative_transcript') {
    if (referenceTokens.length < transcriptTokenMinimum) {
      fail('Authoritative listening transcript is too short for comparison')
    }
    const tokenMatches = overlap(referenceTokens, actualTokens)
    metrics = {
      referenceTokenCount: referenceTokens.length,
      asrTokenCount: actualTokens.length,
      tokenRecall: round(tokenMatches / referenceTokens.length),
      tokenPrecision: round(tokenMatches / actualTokens.length),
      orderedBigramRecall: listeningOrderedBigramRecall(referenceText, asr.transcriptText),
      speechCoverage: round(speechCoverage),
      averageLogProbability: round(averageLogProbability),
    }
    if (metrics.tokenRecall < 0.7 || metrics.orderedBigramRecall < minimumListeningOrderedBigramRecall) {
      flags.push(comparisonFlag(
        'LISTENING_AUDIO_TRANSCRIPT_MISMATCH',
        'ASR does not sufficiently match the authoritative listening transcript',
        { startSeconds: 0, endSeconds: asr.durationSeconds },
      ))
    }
    // Segment-aware order check: compare the canonical sequence of transcript
    // segments against the ASR so a cyclic rotation of whole conversations is
    // flagged even when tokenRecall = 1.0 and orderedBigramRecall stays high.
    if (Array.isArray(referenceSegmentTexts) && referenceSegmentTexts.length > 0) {
      metrics.segmentOrderRecall = listeningSegmentOrderRecall(referenceSegmentTexts, asr.transcriptText)
      if (metrics.segmentOrderRecall < minimumListeningSegmentOrderRecall) {
        flags.push(comparisonFlag(
          'LISTENING_AUDIO_SEGMENT_ORDER_MISMATCH',
          'ASR plays the listening conversations in a different order from the authoritative transcript',
          { startSeconds: 0, endSeconds: asr.durationSeconds },
        ))
      }
    }
    if (metrics.tokenPrecision < 0.35) {
      flags.push(comparisonFlag(
        'LISTENING_AUDIO_EXTRA_CONTENT_SUSPECTED',
        'Much of the ASR text is not present in the authoritative transcript',
        { startSeconds: 0, endSeconds: asr.durationSeconds },
      ))
    }
  } else {
    const distinctive = referenceTokens.filter((token) =>
      token.length >= 4 && !questionStopWords.has(token))
    const questionTokens = distinctive.length >= 8 ? distinctive : referenceTokens
    const matches = overlap(questionTokens, actualTokens)
    metrics = {
      referenceTokenCount: questionTokens.length,
      asrTokenCount: actualTokens.length,
      distinctiveTokenMatches: matches,
      distinctiveTokenRecall: round(matches / questionTokens.length),
      speechCoverage: round(speechCoverage),
      averageLogProbability: round(averageLogProbability),
    }
    if (matches < Math.min(8, Math.ceil(questionTokens.length * 0.2))) {
      flags.push(comparisonFlag(
        'LISTENING_AUDIO_QUESTION_MISMATCH',
        'ASR does not contain enough distinctive listening-question language',
        { startSeconds: 0, endSeconds: asr.durationSeconds },
      ))
    }
  }
  const verdict = flags.some((flag) => flag.severity === 'block')
    ? 'block'
    : flags.length > 0
      ? 'review_required'
      : 'pass'
  return { basis, verdict, metrics, flaggedRanges: flags }
}

function materializationReference(paperDir, manifest) {
  const materialization = readJson(
    artifactPath(paperDir, manifest.materializationPath),
    'NCK1 Source Materialization',
  )
  const listening = materialization.listening
  if (listening?.state === 'captured' && listening.transcript?.length > 0) {
    return {
      basis: 'authoritative_transcript',
      source: 'materialization',
      text: listening.transcript.map((segment) => segment.text).join('\n'),
      segmentTexts: listening.transcript.map((segment) => segment.text),
    }
  }
  if (listening?.questions?.length > 0) {
    return {
      basis: 'listening_questions',
      source: 'materialization',
      text: listening.questions.flatMap((question) => [
        question.stem,
        ...(question.options || []).map((option) => option.text),
      ]).join('\n'),
      segmentTexts: null,
    }
  }
  fail('No authoritative listening transcript or listening questions are available for comparison')
}

function referenceFor(paperDir, manifest, referencePath) {
  if (!referencePath) return materializationReference(paperDir, manifest)
  const absolute = path.resolve(referencePath)
  const bytes = readFileSync(absolute)
  if (path.extname(absolute).toLowerCase() !== '.json') {
    return {
      basis: 'authoritative_transcript',
      source: 'explicit_file',
      text: bytes.toString('utf8'),
      segmentTexts: null,
    }
  }
  const reference = readJson(absolute, 'Listening comparison reference')
  if (
    reference?.schemaVersion !== 'listening-audio-reference-v1'
    || reference.paperId !== manifest.paperId
    || !['authoritative_transcript', 'listening_questions'].includes(reference.basis)
    || typeof reference.text !== 'string'
  ) fail('Listening comparison reference is incomplete')
  return { basis: reference.basis, source: 'explicit_file', text: reference.text, segmentTexts: null }
}

function contentSafetyReview(reviewPath, paperId, asrSha256, durationSeconds) {
  const review = readJson(path.resolve(reviewPath), 'Listening content-safety review')
  if (
    review?.schemaVersion !== 'listening-audio-content-review-v1'
    || review.paperId !== paperId
    || review.reviewedBy !== 'import_agent'
    || review.reviewedTranscriptSha256 !== asrSha256
    || typeof review.reviewedAt !== 'string'
    || Number.isNaN(Date.parse(review.reviewedAt))
    || !['pass', 'review_required', 'block'].includes(review.verdict)
    || typeof review.summary !== 'string'
    || !review.summary.trim()
    || review.untrustedContentHandledAsData !== true
    || !Array.isArray(review.flaggedRanges)
    || (review.verdict === 'pass' && review.flaggedRanges.length > 0)
  ) fail('Listening content-safety review is incomplete or not bound to the ASR transcript')
  for (const range of review.flaggedRanges) {
    if (
      !Number.isFinite(range?.startSeconds)
      || !Number.isFinite(range?.endSeconds)
      || range.startSeconds < 0
      || range.endSeconds <= range.startSeconds
      || range.endSeconds > durationSeconds + 0.5
      || typeof range.reason !== 'string'
      || !range.reason.trim()
    ) fail('Listening content-safety review has an invalid flagged range')
  }
  return {
    reviewedBy: review.reviewedBy,
    reviewedAt: review.reviewedAt,
    reviewedTranscriptSha256: review.reviewedTranscriptSha256,
    untrustedContentHandledAsData: true,
    verdict: review.verdict,
    summary: review.summary.trim(),
    flaggedRanges: review.flaggedRanges,
  }
}

export function finalizeListeningAudio({
  paperDir,
  paperId,
  reviewPath,
  referencePath = null,
}) {
  const manifestPath = path.join(paperDir, 'universal-source-manifest.json')
  const manifest = readJson(manifestPath, 'Universal Source Manifest')
  if (
    manifest.schemaVersion !== 'universal-nck1-source-manifest-v1'
    || manifest.paperId !== paperId
  ) fail('Listening audio finalization requires one attachment-free Universal Source Manifest')
  const asrPath = artifactPath(paperDir, LISTENING_AUDIO_PATHS.asr)
  const asr = readJson(asrPath, 'Listening ASR evidence')
  const asrDigest = sha256(readFileSync(asrPath))
  const reference = referenceFor(paperDir, manifest, referencePath)
  const comparison = compareListeningAudio({
    asr,
    basis: reference.basis,
    referenceText: reference.text,
    referenceSegmentTexts: reference.segmentTexts,
  })
  const contentSafety = contentSafetyReview(
    reviewPath,
    paperId,
    asrDigest,
    asr.durationSeconds,
  )
  const flaggedRanges = [
    ...comparison.flaggedRanges,
    ...contentSafety.flaggedRanges.map((range) => ({
      code: 'LISTENING_AUDIO_CONTENT_SAFETY_FLAG',
      severity: contentSafety.verdict === 'block' ? 'block' : 'review',
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds,
      message: range.reason,
    })),
  ]
  const evidence = {
    schemaVersion: 'listening-audio-check-v1',
    paperId,
    originalAudioSha256: sha256(readFileSync(
      artifactPath(paperDir, LISTENING_AUDIO_PATHS.original),
    )),
    playbackAudioSha256: sha256(readFileSync(
      artifactPath(paperDir, LISTENING_AUDIO_PATHS.playback),
    )),
    asrSha256: asrDigest,
    asrEngine: asr.engine,
    durationSeconds: asr.durationSeconds,
    comparisonReference: {
      source: reference.source,
      basis: reference.basis,
      textSha256: sha256(Buffer.from(reference.text, 'utf8')),
      text: reference.text,
      ...(Array.isArray(reference.segmentTexts) && reference.segmentTexts.length > 0
        ? { segmentTexts: reference.segmentTexts }
        : {}),
    },
    comparison,
    contentSafety,
    flaggedRanges,
  }
  const check = { ...evidence, evidenceDigest: digestJson(evidence) }
  atomicJson(artifactPath(paperDir, LISTENING_AUDIO_PATHS.check), check)
  if (comparison.verdict !== 'pass' || contentSafety.verdict !== 'pass') {
    fail(
      'Listening audio needs review; the check receipt records the exact reasons and time ranges',
      'LISTENING_AUDIO_REVIEW_REQUIRED',
    )
  }
  const nextManifest = {
    ...manifest,
    schemaVersion: 'universal-nck1-source-manifest-v2',
    attachments: listeningAudioAttachmentDescriptors(paperDir),
  }
  atomicJson(manifestPath, nextManifest)
  assertListeningAudioManifest(paperDir, nextManifest)
  return {
    paperId,
    evidenceDigest: check.evidenceDigest,
    comparisonBasis: comparison.basis,
    comparisonVerdict: comparison.verdict,
    contentSafetyVerdict: contentSafety.verdict,
    attachments: nextManifest.attachments.length,
  }
}
