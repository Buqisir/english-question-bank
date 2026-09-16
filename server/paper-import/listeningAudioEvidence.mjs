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

export const minimumListeningOrderedBigramRecall = 0.5

export const listeningOpeningLimitSeconds = 180
export const listeningQuickSummary = '首段快速匹配、后续内容未核对'

export function firstListeningDialogue(listening) {
  const matches = listening?.transcript?.filter((item) => item.questionNumbers?.includes(1)) || []
  const segment = matches[0]
  if (listening?.state !== 'captured' || matches.length !== 1
    || segment.questionNumbers.length !== 1 || !segment.segmentId || !segment.source
    || typeof segment.text !== 'string' || !segment.text.trim()) {
    fail('Quick listening check requires the authoritative source dialogue bound to question 1')
  }
  return { segmentId: segment.segmentId, questionNumbers: [1], text: segment.text, source: segment.source }
}

export function validateListeningQuickScope(asr) {
  const expected = { kind: 'first_dialogue', startSeconds: 0,
    endSeconds: Math.min(listeningOpeningLimitSeconds, asr.durationSeconds), remainder: 'unchecked' }
  if (asr.schemaVersion !== 'listening-audio-asr-v2'
    || !asr.scope || digestJson(asr.scope) !== digestJson(expected)) fail('Invalid quick listening scope')
  return expected
}

// Require explicit formal boundaries, not a substring found in instructions or
// an example. Missing/ambiguous announcements need a deliberate extended review.
export function compareFirstListeningDialogue(asr, dialogue) {
  const scope = validateListeningQuickScope(asr)
  const text = asr.segments.map((segment) => segment.text).join(' ')
  const markers = [...text.matchAll(/\b(?:text|conversation|dialogue|question)\s*(one|two|1|2)\b/gi)]
  const start = markers[0]
  const end = markers[1]
  const flags = []
  const flag = (code, message) => flags.push({ code, message, severity: 'review',
    startSeconds: 0, endSeconds: scope.endSeconds })
  let actual = ''
  if (!start || !end || !['one', '1'].includes(start[1].toLowerCase())
    || !['two', '2'].includes(end[1].toLowerCase())) {
    flag('LISTENING_AUDIO_EXTENDED_CHECK_REQUIRED', 'Cannot establish complete formal question 1 boundaries; extend the check explicitly')
  } else {
    actual = text.slice(start.index + start[0].length, end.index)
    const opening = text.slice(0, start.index)
    const lastExample = [...opening.matchAll(/\b(?:example|sample|practice)\b/gi)].at(-1)
    // A standalone positive announcement immediately before the formal marker;
    // "before the test begins" is an instruction, not an end-of-example boundary.
    const formalStart = /(?:^|[.!?])\s*(?:now\s+)?(?:the\s+)?test\s+(?:begins|starts)[.!?]\s*$/i
    if (/\b(?:example|sample|practice)\b/i.test(actual)
      || (lastExample && !formalStart.test(opening.slice(lastExample.index)))) {
      flag('LISTENING_AUDIO_EXAMPLE_NOT_DIALOGUE', 'An example cannot stand in for formal question 1')
    }
  }
  const spoken = (value) => String(value).replace(/(?:^|\n)\s*(?:M|W|Man|Woman)\s*:/gi, ' ')
  const reference = spoken(dialogue.text)
  const recall = listeningOrderedBigramRecall(reference, spoken(actual))
  // Both ends must match: a nearly complete but truncated dialogue is not enough.
  const words = (value) => value.toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu) || []
  const tokens = words(reference)
  const actualWords = words(spoken(actual)).join(' ')
  if (tokens.length < 8 || recall < 0.9
    || !actualWords.startsWith(tokens.slice(0, 4).join(' '))
    || !actualWords.endsWith(tokens.slice(-4).join(' '))
    || listeningOrderedBigramRecall(spoken(actual), reference) < 0.8) {
    flag('LISTENING_AUDIO_TRANSCRIPT_MISMATCH', 'Formal question 1 does not match its complete authoritative dialogue')
  }
  if (asr.segments.some((segment) => !Number.isFinite(segment.avgLogProbability)
    || segment.avgLogProbability < -1.25 || !Number.isFinite(segment.noSpeechProbability)
    || segment.noSpeechProbability > 0.6)) {
    flag('LISTENING_AUDIO_ASR_CONFIDENCE_LOW', 'Opening transcription is unclear; stop without model fallback')
  }
  return { basis: 'authoritative_transcript', verdict: flags.length ? 'review_required' : 'partial_pass',
    scope, summary: listeningQuickSummary, metrics: { orderedBigramRecall: recall }, flaggedRanges: flags }
}

// Shared by intake and receipt validation: old unordered-overlap receipts
// cannot bless reordered recordings. This reuses stored ASR, never the model.
export function listeningOrderedBigramRecall(referenceText, actualText) {
  const bigrams = (text) => {
    const tokens = String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu) || []
    return tokens.slice(1).map((token, index) => `${tokens[index]}\u0000${token}`)
  }
  const reference = bigrams(referenceText)
  const actual = bigrams(actualText)
  const matches = new Uint32Array(actual.length + 1)
  for (const token of reference) {
    let diagonal = 0
    for (let index = 1; index <= actual.length; index += 1) {
      const previous = matches[index]
      matches[index] = token === actual[index - 1]
        ? diagonal + 1
        : Math.max(matches[index], matches[index - 1])
      diagonal = previous
    }
  }
  return reference.length ? Number((matches[actual.length] / reference.length).toFixed(4)) : 0
}

// A cyclic rotation of whole transcript segments preserves the word multiset and
// almost all intra-segment bigrams, so the flat ordered-bigram recall above stays
// near 1.0 and the 0.5 floor admits the rotation. This segment-aware check compares
// the *sequence* of authoritative transcript segments against the ASR token stream:
// each canonical segment is aligned, in order, with a longest-common-subsequence
// match over a monotonically advancing ASR cursor. A whole-segment rotation leaves
// the misplaced segment's region behind the cursor, so its recall collapses; the
// per-segment LCS absorbs intra-segment ASR noise (insertions, dropped words, small
// reorderings, punctuation/whitespace drift), keeping benign recordings near 1.0.
export const minimumListeningSegmentOrderRecall = 0.5
export function listeningSegmentOrderRecall(referenceSegmentTexts, asrText) {
  const tokens = (text) => String(text).toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu) || []
  const asrTokens = tokens(asrText)
  let cursor = 0
  let totalReference = 0
  let matchedInOrder = 0
  for (const segmentText of referenceSegmentTexts) {
    const segmentTokens = tokens(segmentText)
    if (segmentTokens.length === 0) continue
    totalReference += segmentTokens.length
    if (cursor >= asrTokens.length) continue
    const referenceLength = segmentTokens.length
    const actualLength = asrTokens.length - cursor
    let previousRow = new Uint32Array(actualLength + 1)
    let currentRow = new Uint32Array(actualLength + 1)
    for (let referenceIndex = 1; referenceIndex <= referenceLength; referenceIndex += 1) {
      const token = segmentTokens[referenceIndex - 1]
      const swap = previousRow; previousRow = currentRow; currentRow = swap
      for (let actualIndex = 1; actualIndex <= actualLength; actualIndex += 1) {
        currentRow[actualIndex] = token === asrTokens[cursor + actualIndex - 1]
          ? previousRow[actualIndex - 1] + 1
          : Math.max(previousRow[actualIndex], currentRow[actualIndex - 1])
      }
    }
    const segmentMatches = currentRow[actualLength]
    matchedInOrder += segmentMatches
    let earliestEnd = actualLength
    for (let actualIndex = 0; actualIndex <= actualLength; actualIndex += 1) {
      if (currentRow[actualIndex] === segmentMatches) { earliestEnd = actualIndex; break }
    }
    cursor += earliestEnd
  }
  return totalReference ? Number((matchedInOrder / totalReference).toFixed(4)) : 0
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
    !['listening-audio-asr-v1', 'listening-audio-asr-v2'].includes(asr?.schemaVersion)
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
  const quick = asr.schemaVersion === 'listening-audio-asr-v2'
  if (!quick && Object.hasOwn(asr, 'scope')) fail('Legacy ASR cannot carry a partial scope')
  const endSeconds = quick ? validateListeningQuickScope(asr).endSeconds : asr.durationSeconds
  if (quick && asr.transcriptText !== asr.segments.map((segment) => segment.text).join(' ').trim()) {
    fail('Quick ASR text differs from timestamped segments')
  }
  let previousEnd = 0
  for (const segment of asr.segments) {
    if (
      !Number.isFinite(segment?.startSeconds)
      || !Number.isFinite(segment?.endSeconds)
      || segment.startSeconds < previousEnd
      || segment.endSeconds <= segment.startSeconds
      || segment.endSeconds > endSeconds + 0.5
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
  const quick = asr.schemaVersion === 'listening-audio-asr-v2'
  if (
    check?.schemaVersion !== (quick ? 'listening-audio-check-v2' : 'listening-audio-check-v1')
    || check.paperId !== paperId
    || check.originalAudioSha256 !== descriptors.get('listening_audio_original')?.sha256
    || check.playbackAudioSha256 !== descriptors.get('listening_audio_playback')?.sha256
    || check.asrSha256 !== descriptors.get('listening_audio_asr')?.sha256
    || check.durationSeconds !== asr.durationSeconds
    || check.comparison?.verdict !== (quick ? 'partial_pass' : 'pass')
    || !['authoritative_transcript', 'listening_questions'].includes(check.comparison?.basis)
    || !['materialization', 'explicit_file'].includes(reference?.source)
    || reference?.basis !== check.comparison?.basis
    || typeof reference?.text !== 'string'
    || !reference.text.trim()
    || sha256(Buffer.from(reference.text, 'utf8')) !== reference.textSha256
    || check.contentSafety?.verdict !== 'pass'
    || check.contentSafety?.reviewedBy !== 'import_agent'
    || typeof check.contentSafety?.summary !== 'string'
    || !check.contentSafety.summary.trim()
    || !Array.isArray(check.contentSafety?.flaggedRanges)
    || check.contentSafety.flaggedRanges.length !== 0
    || typeof check.contentSafety?.reviewedAt !== 'string'
    || Number.isNaN(Date.parse(check.contentSafety.reviewedAt))
    || check.contentSafety?.reviewedTranscriptSha256 !== check.asrSha256
    || check.contentSafety?.untrustedContentHandledAsData !== true
    || !Array.isArray(check.flaggedRanges)
    || check.flaggedRanges.length !== 0
    || typeof check.evidenceDigest !== 'string'
  ) fail('Listening audio check has not passed or is not bound to its evidence')
  const { evidenceDigest, ...evidence } = check
  if (digestJson(evidence) !== evidenceDigest) {
    fail('Listening audio evidence digest does not match the check receipt')
  }
  if (quick) {
    if (reference.source !== 'materialization' || reference.basis !== 'authoritative_transcript'
      || reference.dialogue?.text !== reference.text
      || !check.scope || !check.contentSafety.scope
      || digestJson(check.scope) !== digestJson(validateListeningQuickScope(asr))
      || digestJson(check.contentSafety.scope) !== digestJson(check.scope)
      || check.summary !== listeningQuickSummary
      || digestJson(check.comparison) !== digestJson(compareFirstListeningDialogue(asr, reference.dialogue))) {
      fail('Quick listening check scope or recomputed comparison does not match')
    }
    return check
  }
  if (Object.hasOwn(check, 'scope')) fail('Legacy check cannot carry a partial scope')
  if (reference.basis === 'authoritative_transcript'
    && listeningOrderedBigramRecall(reference.text, asr.transcriptText) < minimumListeningOrderedBigramRecall) {
    fail('Listening ASR word order does not match the authoritative transcript')
  }
  if (reference.basis === 'authoritative_transcript'
    && Array.isArray(reference.segmentTexts) && reference.segmentTexts.length > 0
    && listeningSegmentOrderRecall(reference.segmentTexts, asr.transcriptText) < minimumListeningSegmentOrderRecall) {
    fail('Listening ASR segment order does not match the authoritative transcript')
  }
  return check
}

// Compare only the source words: whitespace and punctuation changes do not
// invalidate a review, but a different transcript or Question set does.
export function assertListeningAudioSource(evidence, listening) {
  if (listening?.state !== 'captured') {
    if (evidence) fail('Audio cannot be attached to a paper without Listening')
    return null
  }
  if (!evidence) fail('Captured Listening requires reviewed audio')
  if (evidence.asr?.schemaVersion === 'listening-audio-asr-v2') {
    const dialogue = firstListeningDialogue(listening)
    if (digestJson(dialogue) !== digestJson(evidence.check.comparisonReference.dialogue)
      || compareFirstListeningDialogue(evidence.asr, dialogue).verdict !== 'partial_pass') {
      fail('Quick listening source binding changed or first dialogue did not match')
    }
    const playback = evidence.descriptors.get('listening_audio_playback')
    return { relativePath: 'listening/playback.mp3', sha256: playback.sha256,
      byteLength: playback.byteLength, durationSeconds: evidence.asr.durationSeconds, mediaType: 'audio/mpeg' }
  }
  const hasTranscript = listening.transcript?.length > 0
  const basis = hasTranscript ? 'authoritative_transcript' : 'listening_questions'
  const text = hasTranscript
    ? listening.transcript.map((segment) => segment.text).join('\n')
    : listening.questions.flatMap((question) => [question.stem, ...question.options.map((option) => option.text)]).join('\n')
  const words = (value) => (String(value).toLowerCase().match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)?/gu) || []).join(' ')
  if (evidence.check.comparisonReference.basis !== basis
    || words(evidence.check.comparisonReference.text) !== words(text)) {
    fail('Listening source changed: finalize audio checks against the current materialization before Review')
  }
  // Anchor the stored ASR to the canonical transcript segment order from the live
  // materialization: an old unordered-overlap receipt (or a tampered comparison text)
  // cannot bless a recording whose playback order rotates whole conversations,
  // even when its flat ordered-bigram recall stays high. The live transcript is the
  // tamper-proof canonical reference; the stored ASR transcript text is its subject.
  if (hasTranscript && typeof evidence.asr?.transcriptText === 'string' && evidence.asr.transcriptText.trim()) {
    const segmentTexts = listening.transcript.map((segment) => segment.text)
    if (listeningSegmentOrderRecall(segmentTexts, evidence.asr.transcriptText) < minimumListeningSegmentOrderRecall) {
      fail('Listening ASR segment order does not match the authoritative transcript')
    }
  }
  const playback = evidence.descriptors.get('listening_audio_playback')
  return {
    relativePath: 'listening/playback.mp3',
    sha256: playback.sha256,
    byteLength: playback.byteLength,
    durationSeconds: evidence.asr.durationSeconds,
    mediaType: 'audio/mpeg',
  }
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
