import { existsSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_REVIEW_VERSION, LISTENING_RULE_EVIDENCE_VERSION,
  assertListeningRuleEvidence, assertListeningUploadBudget,
  listeningAsrWindowsCover } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'
import { reviewSubjectBundleDigest } from '../import-review/reviewSubject.mjs'
import { listeningAsrTokens } from '../../scripts/import-pipeline/lib-listening-segment-rule.mjs'

export const LISTENING_REVIEW_FILE = 'listening-review-v1.json'
export const RETAINED_LISTENING_NAVIGATION = 'retained_navigation'
const evidencePrefix = 'listening-review-evidence/'
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value || '')
const range = (value, duration) => value && Number.isFinite(value.startSeconds)
  && Number.isFinite(value.endSeconds) && value.startSeconds >= 0
  && value.endSeconds > value.startSeconds && value.endSeconds <= duration

function fail(message) {
  throw Object.assign(new Error(`Listening review: ${message}`), { code: 'LISTENING_REVIEW_INVALID' })
}

function readAsrWindow(record, window) {
  const { words, markers } = listeningAsrTokens([{ ...record, ...window }])
  const speech = markers.map(({ startSeconds, endSeconds, raw }) => ({ startSeconds, endSeconds, text: raw }))
  const absolute = item => ({
    startSeconds: window.startSeconds + Number(item.start ?? item.startSeconds),
    endSeconds: window.startSeconds + Number(item.end ?? item.endSeconds),
  })
  for (const segment of record.result?.segments || record.segments || []) {
    const runs = segment.runs || segment.words || []
    // A timed run can carry speech the tokenizer drops (e.g. a Chinese question announcement).
    // faster-whisper emits zero-length runs (start === end) for real words.
    const timed = runs.filter(run => {
      const span = absolute(run)
      return Number.isFinite(span.startSeconds) && span.startSeconds >= 0
        && span.endSeconds >= span.startSeconds && span.endSeconds <= window.endSeconds + 0.5
    })
    for (const run of timed) {
      const text = run.word ?? run.text
      if (nonempty(text)) speech.push({ ...absolute(run), text })
    }
    if (timed.length) continue
    const span = absolute(segment)
    const text = segment.text || runs.map(run => run.word ?? run.text).join(' ')
    if (nonempty(text) && range(span, Infinity)) speech.push({ ...span, text })
  }
  return { words, speech }
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
  // First admission accepts a review produced under any supported historical
  // schema; each version is checked by its own rules. Missing or unknown
  // versions still fail closed.
  if (!['listening-review-v1', LISTENING_REVIEW_VERSION].includes(review?.schemaVersion)) {
    fail('invalid subject, attestation or scope')
  }
  return validateReview(rootDir, review, subject, transcript, review.schemaVersion)
}

function validateReview(rootDir, review, subject, transcript, version, retained = false) {
  const retainedNavigation = review?.method === RETAINED_LISTENING_NAVIGATION
  if (!exactKeys(review, ['schemaVersion', 'subject', 'reviewedBy', 'reviewedAt',
    'method', 'untrustedContentHandledAsData', 'scope', 'evidence', 'groups'])
    || review.schemaVersion !== version
    || digestJson(review.subject) !== digestJson(subject)
    || review.reviewedBy !== 'import_agent' || !Number.isFinite(Date.parse(review.reviewedAt))
    || !['asr_source_comparison', 'audio_source_comparison', 'agent_asr_comparison', RETAINED_LISTENING_NAVIGATION].includes(review.method)
    || review.untrustedContentHandledAsData !== true
    || digestJson(review.scope) !== digestJson({ purpose: 'teacher_navigation',
      verbatim: 'not_certified', wholeRecordingContent: 'not_certified' })) fail('invalid subject, attestation or scope')
  if (review.method === 'agent_asr_comparison' && version !== LISTENING_REVIEW_VERSION) fail('agent ASR requires v2 rule evidence')
  if (!Array.isArray(review.evidence) || review.evidence.length === 0) fail('missing retained evidence')
  assertListeningUploadBudget(review.evidence)
  const paths = new Set()
  const ruleNotes = []
  const asrByPath = new Map()
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
    const record = JSON.parse(bytes.toString('utf8'))
    if (!retained && review.method === 'agent_asr_comparison' && file.kind === 'asr_window') {
      asrByPath.set(file.path, readAsrWindow(record, file.window))
    }
    if (version === LISTENING_REVIEW_VERSION && file.kind === 'asr_window'
      && (record.rule || record.groups || record.engineAttempts
        || /^listening-rule-evidence-/u.test(record.schemaVersion || ''))) fail('rule evidence cannot claim ASR settings')
    if (version === LISTENING_REVIEW_VERSION && file.kind === 'review_notes' && !retainedNavigation) {
      if (record.schemaVersion === LISTENING_RULE_EVIDENCE_VERSION) ruleNotes.push(record)
      else {
        // Do not guess authority from a filename. A second legacy/stripped rule
        // cannot hide behind an otherwise valid v2 evidence file.
        if (record.rule || record.groups || record.input || record.engineAttempts
          || /^listening-rule-evidence-/u.test(record.schemaVersion || '')) fail('legacy/unknown rule evidence')
        if (review.method === 'asr_source_comparison'
          && !(record.error && record.engine) && !(typeof record.raw === 'string' && record.job)) {
          fail('unrecognized automatic notes')
        }
      }
    }
    paths.add(file.path)
  }
  // Finalize checks these historical notes and judgments against the sealed base.
  if (version === LISTENING_REVIEW_VERSION && !retainedNavigation) {
    if (ruleNotes.length > 1 || (review.method !== 'audio_source_comparison' && ruleNotes.length !== 1)) fail('requires one v2 rule summary')
    // A sealed review already checked the exact rule/ASR bytes with its
    // original reader, including the word timings used for agent judgments.
    for (const notes of retained ? [] : ruleNotes) {
      try { assertListeningRuleEvidence(notes, review, transcript, asrByPath) } catch (error) { fail(error.message) }
    }
  }
  if (!retainedNavigation && review.method !== 'audio_source_comparison' && !review.evidence.some(file => file.kind === 'asr_window')) {
    fail('ASR comparison requires retained ASR windows')
  }
  const groups = [...transcript].sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
  if (!Array.isArray(review.groups) || review.groups.length !== groups.length) fail('incomplete group coverage')
  const rawWindows = review.method === 'agent_asr_comparison' ? ruleNotes[0].rawEvidence : null
  let lastEnd = 0
  for (const [index, group] of review.groups.entries()) {
    const source = groups[index]
    if (!exactKeys(group, ['segmentId', 'questionNumbers', 'decision', 'reason', 'limits', 'playback', 'occurrences',
      ...((retainedNavigation || review.method === 'agent_asr_comparison') && Object.hasOwn(group, 'boundaryJudgment') ? ['boundaryJudgment'] : [])])
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
    if (rawWindows && !listeningAsrWindowsCover(rawWindows.map(file => file.window), group.playback)) {
      fail('raw ASR evidence does not cover playback')
    }
    let occurrenceEnd = group.playback.startSeconds
    for (const occurrence of group.occurrences) {
      if (!exactKeys(occurrence, ['startSeconds', 'endSeconds', 'evidencePaths'])
        || !range(occurrence, subject.durationSeconds) || occurrence.startSeconds < occurrenceEnd
        || occurrence.endSeconds > group.playback.endSeconds
        || !Array.isArray(occurrence.evidencePaths) || occurrence.evidencePaths.length === 0
        || new Set(occurrence.evidencePaths).size !== occurrence.evidencePaths.length
        || occurrence.evidencePaths.some(relative => !paths.has(relative))) fail('invalid occurrence/evidence binding')
      if (['asr_source_comparison', 'agent_asr_comparison'].includes(review.method)) {
        const windows = (rawWindows ?? review.evidence).filter(file => file.kind === 'asr_window'
          && occurrence.evidencePaths.includes(file.path)).map(file => file.window)
        if (!listeningAsrWindowsCover(windows, occurrence)) fail('ASR evidence does not cover the occurrence')
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

export function verifyRetainedListeningNavigation(review, readBase) {
  if (review?.method !== RETAINED_LISTENING_NAVIGATION) return
  const base = readBase()
  const navigation = ({ method, subject: { sourceDigest, candidateDigest, transcriptDigest, ...audio }, ...rest }) =>
    ({ audio, ...rest })
  if (!base || digestJson(navigation(review)) !== digestJson(navigation(base))) {
    fail('retained navigation must match the finalized base exactly')
  }
}

export function readListeningReview(rootDir, subject, transcript) {
  const full = path.join(rootDir, LISTENING_REVIEW_FILE)
  if (!existsSync(full)) return null
  const bytes = readFileSync(full)
  const validated = validateListeningReview(rootDir, JSON.parse(bytes.toString('utf8')), subject, transcript)
  return { ...validated, digest: sha256(bytes) }
}

// The sealed proof covers the entire navigation sidecar and all its evidence.
// A changed boundary must use ordinary admission, where every group is checked.
export function readRetainedListeningReview(rootDir, subject, transcript, retainedBytes) {
  const bytes = retainedBytes(LISTENING_REVIEW_FILE)
  if (!bytes) return null
  const review = JSON.parse(bytes.toString('utf8'))
  const previous = review.subject
  if (!['listening-review-v1', LISTENING_REVIEW_VERSION].includes(review.schemaVersion)
    || !previous || digestJson({ ...previous, sourceDigest: subject.sourceDigest,
      candidateDigest: subject.candidateDigest }) !== digestJson(subject)
    || !Array.isArray(review.evidence)
    || review.evidence.some(file => !retainedBytes(file.path))) return null
  const validated = validateReview(rootDir, review, previous, transcript, review.schemaVersion, true)
  return { ...validated, review: { ...review, subject }, digest: sha256(bytes) }
}

// Only persisted revision/approval consumers call this entry, after their
// stored-file checks. First admission already accepts the supported historical
// v1/v2 review under its own rules; the sealed path does the same for
// committed bytes. Recheck the exact sealed descriptors here too, including
// ASR evidence.
export function readSealedListeningReview(rootDir, subject, transcript, revision, manifest = revision?.manifest) {
  const full = path.join(rootDir, LISTENING_REVIEW_FILE)
  const sealed = manifest?.files?.find(file => file.path === LISTENING_REVIEW_FILE)
  if (!sealed && !existsSync(full)) return null
  const persistedApproval = revision?.schemaVersion === 'web-import-review-approval-v1' && revision.approvalId
  if (!sealed || !(revision?.id ?? revision?.revisionId)
    || (!revision.state && !persistedApproval) || revision.state === 'uploading'
    || revision.bundleDigest !== manifest.bundleDigest
    || reviewSubjectBundleDigest(manifest) !== revision.bundleDigest
    || ['paperId', 'sourceDigest', 'candidateDigest'].some(key =>
      revision[key] !== manifest[key] || revision[key] !== subject[key])) fail('untrusted sealed listening identity')
  const bytes = readFileSync(full)
  if (bytes.length !== sealed.byteLength || sha256(bytes) !== sealed.sha256) fail('changed sealed sidecar')
  const review = JSON.parse(bytes.toString('utf8'))
  if (!['listening-review-v1', LISTENING_REVIEW_VERSION].includes(review.schemaVersion)) fail('unknown sealed version')
  for (const file of review.evidence || []) {
    const stored = manifest.files.find(item => item.path === file.path)
    if (!stored || stored.sha256 !== file.sha256 || stored.byteLength !== file.byteLength) fail('unsealed listening evidence')
  }
  const validated = validateReview(rootDir, review, subject, transcript, review.schemaVersion)
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
