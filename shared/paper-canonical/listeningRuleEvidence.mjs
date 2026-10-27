import { digestJson, exactKeys, sha256 } from './stable.mjs'

export const LISTENING_RULE_EVIDENCE_VERSION = 'listening-rule-evidence-v2'
export const LISTENING_REVIEW_VERSION = 'listening-review-v2'
export const LISTENING_FILE_BUDGET = 64 * 1024 ** 2
export const LISTENING_BUNDLE_BUDGET = 256 * 1024 ** 2

const pick = (value, keys) => Object.fromEntries(keys.filter(key => Object.hasOwn(value, key))
  .map(key => [key, value[key]]))
// Deliberately enumerate retained fields. Full observations live only in the
// lossless local diagnostic; a new algorithm field requires an explicit choice.
const groupKeys = ['segmentId', 'questionNumbers', 'engine', 'expectedReadings', 'sources',
  'sourceText', 'sourceProjection', 'decision', 'issue', 'issues', 'notes', 'playback',
  'occurrences', 'anchors', 'anchorEvidence', 'orderEvidence', 'independentlyAnchored',
  'durationRatio', 'durationRatios', 'selectedEngine', 'engineConflicts', 'engineNotes',
  'readingCountEvidence', 'boundaryAdjustments']
const engineKeys = groupKeys.filter(key => !['sourceText', 'sourceProjection', 'sources'].includes(key))
export function summarizeListeningGroup(group) {
  const partial = value => (value.partialOccurrences || []).map(({ words = [], ...range }) => ({
    ...pick(range, ['startSeconds', 'anchorEndSeconds']), wordCount: words.length, wordsSha256: digestJson(words),
  }))
  const windows = value => (value.observedWindows || []).map(window => pick(window,
    ['startSeconds', 'endSeconds', 'evidencePaths']))
  return { ...pick(group, groupKeys), partialOccurrences: partial(group),
    observedWindowBindings: windows(group),
    engineAttempts: (group.engineAttempts || []).map(attempt => ({ ...pick(attempt, engineKeys),
      partialOccurrences: partial(attempt), observedWindowBindings: windows(attempt) })) }
}

export function listeningNavigationGroup(group) {
  return { segmentId: group.segmentId, questionNumbers: group.questionNumbers, decision: group.decision,
    playback: group.playback, occurrences: group.decision === 'usable'
      ? group.occurrences.map(occurrence => ({ ...occurrence.playback, evidencePaths: occurrence.evidencePaths })) : [] }
}

export function assertListeningRuleEvidence(value, review, transcript) {
  const fail = detail => { throw new Error(`Listening rule evidence: ${detail}`) }
  if (!exactKeys(value, ['schemaVersion', 'rule', 'normalization', 'input', 'rawEvidence', 'groups', 'diagnostic'])
    || value.schemaVersion !== LISTENING_RULE_EVIDENCE_VERSION
    || !value.rule?.version || !value.rule?.normalizationVersion || !value.normalization
    || digestJson(value.input?.subject) !== digestJson(review.subject)
    || !Array.isArray(value.groups) || value.groups.length !== review.groups.length
    || !Array.isArray(value.rawEvidence)
    || digestJson(value.rawEvidence) !== digestJson(review.evidence.filter(file => file.kind === 'asr_window'))) {
    fail('invalid version, input or raw evidence binding')
  }
  for (const key of ['sourceTextSha256', 'materializationSha256', 'audioSha256',
    'silenceSha256', 'ruleCodeSha256', 'adapterSha256', 'instructionsSha256', 'questionsSha256']) {
    if (!/^sha256:[a-f0-9]{64}$/.test(value.input[key] || '')) fail(`missing ${key}`)
  }
  if (value.input.audioSha256 !== review.subject.playbackAudioSha256
    || value.input.sourceTextSha256 !== sha256(JSON.stringify(transcript))
    || digestJson(value.rule) !== digestJson(value.input.rule)
    || digestJson(value.normalization) !== digestJson(value.input.normalization)) fail('inconsistent rule/input binding')
  for (const [i, group] of value.groups.entries()) {
    if (group.segmentId !== review.groups[i].segmentId
      || group.sourceText !== transcript.find(source => source.segmentId === group.segmentId)?.text
      || digestJson(group.questionNumbers) !== digestJson(review.groups[i].questionNumbers)
      || !['usable', 'blocked', 'review_required'].includes(group.decision)
      || !Array.isArray(group.issues) || !Array.isArray(group.engineAttempts)
      || Object.keys(group).some(key => ![...groupKeys, 'partialOccurrences', 'observedWindowBindings', 'engineAttempts'].includes(key))
      || group.engineAttempts.some(attempt => Object.keys(attempt).some(key =>
        ![...engineKeys, 'partialOccurrences', 'observedWindowBindings'].includes(key)))) fail('invalid group summary')
    if (review.method === 'asr_source_comparison'
      && digestJson(listeningNavigationGroup(group)) !== digestJson(pick(review.groups[i],
        ['segmentId', 'questionNumbers', 'decision', 'playback', 'occurrences']))) fail('navigation differs from rule')
  }
  const d = value.diagnostic
  if (!exactKeys(d, ['schemaVersion', 'path', 'encoding', 'sha256', 'byteLength', 'decodedSha256', 'decodedByteLength'])
    || d.schemaVersion !== 'listening-diagnostics-v1' || d.path !== 'diagnostics.json.gz' || d.encoding !== 'gzip'
    || ![d.sha256, d.decodedSha256].every(hash => /^sha256:[a-f0-9]{64}$/.test(hash || ''))
    || ![d.byteLength, d.decodedByteLength].every(n => Number.isSafeInteger(n) && n > 0)) fail('invalid local diagnostic descriptor')
  return value
}

export function assertListeningUploadBudget(files) {
  let total = 0
  for (const file of files) {
    if (!Number.isSafeInteger(file.byteLength) || file.byteLength <= 0 || file.byteLength > LISTENING_FILE_BUDGET) {
      throw new Error(`IMPORT_REVIEW_SIZE_INVALID: ${file.path} (${file.byteLength} bytes; max ${LISTENING_FILE_BUDGET})`)
    }
    total += file.byteLength
  }
  if (total > LISTENING_BUNDLE_BUDGET) throw new Error(`IMPORT_REVIEW_SIZE_INVALID: bundle ${total} bytes; max ${LISTENING_BUNDLE_BUDGET}`)
}
