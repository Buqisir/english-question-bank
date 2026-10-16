import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const LISTENING_REVIEW_FILE = 'listening-review-v1.json'
const evidencePrefix = 'listening-review-evidence/'
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value || '')
const range = (value, duration) => value && Number.isFinite(value.startSeconds)
  && Number.isFinite(value.endSeconds) && value.startSeconds >= 0
  && value.endSeconds > value.startSeconds && value.endSeconds <= duration

function fail(message) {
  throw Object.assign(new Error(`Listening review: ${message}`), { code: 'LISTENING_REVIEW_INVALID' })
}

export function listeningReviewSubject(loaded, candidate) {
  const playback = loaded.sourceInput.listeningAudio
  const original = loaded.listeningAudioEvidence?.descriptors
    .find(file => file.role === 'listening_audio_original')
  if (loaded.analyzedPackage || loaded.materialization.listening?.state !== 'captured'
    || !playback || !original || !candidate) fail('requires captured raw-source listening and audio')
  return {
    paperId: loaded.materialization.paperId,
    sourceDigest: candidate.source.sha256,
    candidateDigest: candidate.candidateDigest,
    originalAudioSha256: original.sha256,
    playbackAudioSha256: playback.sha256,
    durationSeconds: playback.durationSeconds,
    timebase: 'normalized_playback_seconds',
    transcriptDigest: digestJson(loaded.materialization.listening.transcript),
  }
}

function evidencePath(rootDir, relative) {
  if (typeof relative !== 'string' || !/^listening-review-evidence\/[a-zA-Z0-9._-]+\.json$/.test(relative)) {
    fail('evidence must be a named JSON file in listening-review-evidence/')
  }
  const full = path.join(rootDir, relative)
  const root = realpathSync(rootDir)
  if (!realpathSync(full).startsWith(`${root}${path.sep}`)) fail('evidence escapes Review workspace')
  return full
}

// An import-agent attestation about navigation, not an ASR score threshold,
// Owner approval, verbatim certification, or whole-recording safety proof.
// Every live group must be accounted for, including unresolved groups.
export function validateListeningReview(rootDir, review, subject, transcript) {
  if (!exactKeys(review, ['schemaVersion', 'subject', 'reviewedBy', 'reviewedAt',
    'method', 'untrustedContentHandledAsData', 'scope', 'evidence', 'groups'])
    || review.schemaVersion !== 'listening-review-v1'
    || digestJson(review.subject) !== digestJson(subject)
    || review.reviewedBy !== 'import_agent' || !Number.isFinite(Date.parse(review.reviewedAt))
    || !['asr_source_comparison', 'audio_source_comparison'].includes(review.method)
    || review.untrustedContentHandledAsData !== true
    || digestJson(review.scope) !== digestJson({ purpose: 'teacher_navigation',
      verbatim: 'not_certified', wholeRecordingContent: 'not_certified' })) fail('invalid subject, attestation or scope')
  if (!Array.isArray(review.evidence) || review.evidence.length === 0) fail('missing retained evidence')
  const paths = new Set()
  for (const file of review.evidence) {
    if (!exactKeys(file, ['path', 'sha256', 'byteLength', 'kind', 'window', 'settings'])
      || paths.has(file.path) || !digest(file.sha256) || !Number.isSafeInteger(file.byteLength)
      || file.byteLength <= 0 || !['asr_window', 'review_notes'].includes(file.kind)) fail('invalid evidence descriptor')
    if (file.kind === 'asr_window') {
      if (!exactKeys(file.window, ['startSeconds', 'endSeconds']) || !range(file.window, subject.durationSeconds)
        || !exactKeys(file.settings, ['engine', 'model', 'language', 'vad', 'computeType'])
        || !nonempty(file.settings.engine) || !nonempty(file.settings.model)
        || !nonempty(file.settings.language) || typeof file.settings.vad !== 'boolean'
        || !nonempty(file.settings.computeType)) fail('ASR window/settings missing')
    } else if (file.window !== null || file.settings !== null) fail('notes cannot assert ASR settings')
    const bytes = readFileSync(evidencePath(rootDir, file.path))
    if (bytes.length !== file.byteLength || sha256(bytes) !== file.sha256) fail(`changed evidence: ${file.path}`)
    JSON.parse(bytes.toString('utf8'))
    paths.add(file.path)
  }
  if (review.method === 'asr_source_comparison' && !review.evidence.some(file => file.kind === 'asr_window')) {
    fail('ASR comparison requires retained ASR windows')
  }
  const groups = [...transcript].sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
  if (!Array.isArray(review.groups) || review.groups.length !== groups.length) fail('incomplete group coverage')
  let lastEnd = 0
  for (const [index, group] of review.groups.entries()) {
    const source = groups[index]
    if (!exactKeys(group, ['segmentId', 'questionNumbers', 'decision', 'reason', 'limits', 'playback', 'occurrences'])
      || group.segmentId !== source.segmentId
      || digestJson(group.questionNumbers) !== digestJson(source.questionNumbers)
      || !['usable', 'review_required', 'blocked'].includes(group.decision)
      || !nonempty(group.reason) || !Array.isArray(group.limits) || !group.limits.every(nonempty)
      || !Array.isArray(group.occurrences)) fail('invalid group identity or decision')
    if (group.decision !== 'usable') {
      if (group.playback !== null || group.occurrences.length !== 0) fail('unresolved group cannot expose approved playback')
      continue
    }
    if (!exactKeys(group.playback, ['startSeconds', 'endSeconds']) || !range(group.playback, subject.durationSeconds)
      || group.playback.startSeconds < lastEnd || group.occurrences.length === 0) fail('invalid/overlapping playback range')
    let occurrenceEnd = group.playback.startSeconds
    for (const occurrence of group.occurrences) {
      if (!exactKeys(occurrence, ['startSeconds', 'endSeconds', 'evidencePaths'])
        || !range(occurrence, subject.durationSeconds) || occurrence.startSeconds < occurrenceEnd
        || occurrence.endSeconds > group.playback.endSeconds
        || !Array.isArray(occurrence.evidencePaths) || occurrence.evidencePaths.length === 0
        || new Set(occurrence.evidencePaths).size !== occurrence.evidencePaths.length
        || occurrence.evidencePaths.some(relative => !paths.has(relative))) fail('invalid occurrence/evidence binding')
      if (review.method === 'asr_source_comparison') {
        const windows = review.evidence.filter(file => file.kind === 'asr_window'
          && occurrence.evidencePaths.includes(file.path)).map(file => file.window)
          .sort((a, b) => a.startSeconds - b.startSeconds)
        let coveredEnd = occurrence.startSeconds
        for (const window of windows) {
          if (window.startSeconds > coveredEnd) break
          coveredEnd = Math.max(coveredEnd, window.endSeconds)
        }
        if (coveredEnd < occurrence.endSeconds) fail('ASR evidence does not cover the occurrence')
      }
      occurrenceEnd = occurrence.endSeconds
    }
    lastEnd = group.playback.endSeconds
  }
  const files = [
    { path: LISTENING_REVIEW_FILE, mediaType: 'application/json', role: 'listening_review' },
    ...review.evidence.map(file => ({ path: file.path, mediaType: 'application/json', role: 'listening_review_evidence' })),
  ]
  return { review, files }
}

export function readListeningReview(rootDir, subject, transcript) {
  const full = path.join(rootDir, LISTENING_REVIEW_FILE)
  if (!existsSync(full)) return null
  const bytes = readFileSync(full)
  const validated = validateListeningReview(rootDir, JSON.parse(bytes.toString('utf8')), subject, transcript)
  return { ...validated, digest: sha256(bytes) }
}

export function reviewedPlaybackSegments(listeningReview) {
  return (listeningReview?.review.groups || []).filter(group => group.decision === 'usable').map(group => ({
    segmentId: group.segmentId, questionNumbers: [...group.questionNumbers],
    firstQuestionId: `question:listening:${Math.min(...group.questionNumbers)}`,
    ...group.playback,
  }))
}

// Exclusion is limited to the exact, fully validated navigation-only sidecar
// and its enumerated evidence. Instruction corrections are never excluded.
export function listeningReviewPrintNeutralPaths(validated) {
  return new Set((validated?.files || []).map(file => file.path)
    .filter(relative => relative === LISTENING_REVIEW_FILE || relative.startsWith(evidencePrefix)))
}
