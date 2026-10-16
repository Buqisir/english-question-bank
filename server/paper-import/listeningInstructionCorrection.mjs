import { digestJson, exactKeys, sha256 } from '../../shared/paper-canonical/stable.mjs'

export const LISTENING_INSTRUCTION_CORRECTION_FILE = 'listening-instruction-correction-v1.json'
export const LISTENING_INSTRUCTION_CORRECTION_POLICY = 'verified-recording-count-v1'
const text = value => typeof value === 'string' && value.trim().length > 0
const digest = value => /^sha256:[a-f0-9]{64}$/.test(value || '')
const encode = value => new TextEncoder().encode(value)
const decode = value => JSON.parse(new TextDecoder().decode(value))
const validRange = (value, duration) => value && Number.isFinite(value.startSeconds)
  && Number.isFinite(value.endSeconds) && value.startSeconds >= 0
  && value.endSeconds > value.startSeconds && value.endSeconds <= duration

function fail(message) {
  throw Object.assign(new Error(`Listening instruction correction: ${message}`), { code: 'LISTENING_INSTRUCTION_CORRECTION_INVALID' })
}

// Deliberately limited to the once/twice instruction used by this paper family.
// The actual count is attested separately; this function only constrains edits.
export function correctedListeningCount(before, playCount) {
  const matches = [...String(before).matchAll(/(?:仅|只)?(朗读|播放|读)(一|二|两)(遍|次)/gu)]
  if (matches.length !== 1 || ![1, 2].includes(playCount)) fail('requires one unambiguous once/twice expression')
  const match = matches[0]
  const previous = match[2] === '一' ? 1 : 2
  if (previous === playCount) fail('recorded count already matches the instruction')
  return before.slice(0, match.index) + match[1] + (playCount === 1 ? '一' : '两') + match[3]
    + before.slice(match.index + match[0].length)
}

// Original Materialization and source documents stay byte-identical. Embedded
// evidence is retained verbatim so confirmed-request replay needs no filesystem
// or mutable navigation sidecar. Range checks are not acoustic proof: the Agent
// attests dialogue correspondence; the policy is not an Owner approval receipt.
export function applyListeningInstructionCorrection(materializationBytes, correctionBytes, playback, reviewedMaterialization = null) {
  const original = decode(materializationBytes)
  const correction = decode(correctionBytes)
  if (!exactKeys(correction, ['schemaVersion', 'policy', 'paperId', 'materializationSha256',
    'transcriptDigest', 'originalAudioSha256', 'playbackAudioSha256', 'durationSeconds',
    'reviewedBy', 'reviewedAt', 'method', 'untrustedContentHandledAsData', 'evidence', 'instructions'])
    || correction.schemaVersion !== 'listening-instruction-correction-v1'
    || correction.policy !== LISTENING_INSTRUCTION_CORRECTION_POLICY
    || correction.paperId !== original.paperId
    || correction.materializationSha256 !== sha256(materializationBytes)
    || original.listening?.state !== 'captured'
    || correction.transcriptDigest !== digestJson(original.listening.transcript)
    || !digest(correction.originalAudioSha256)
    || correction.playbackAudioSha256 !== playback?.sha256
    || correction.durationSeconds !== playback?.durationSeconds
    || correction.reviewedBy !== 'import_agent' || !Number.isFinite(Date.parse(correction.reviewedAt))
    || !['asr_source_comparison', 'audio_source_comparison'].includes(correction.method)
    || correction.untrustedContentHandledAsData !== true) fail('stale source/audio or invalid attestation')
  if (!Array.isArray(correction.evidence) || correction.evidence.length === 0) fail('missing embedded evidence')
  const evidence = new Map()
  for (const item of correction.evidence) {
    if (!exactKeys(item, ['evidenceId', 'content', 'sha256', 'byteLength', 'window', 'settings'])
      || !text(item.evidenceId) || evidence.has(item.evidenceId) || !text(item.content)
      || sha256(encode(item.content)) !== item.sha256 || encode(item.content).length !== item.byteLength
      || !exactKeys(item.window, ['startSeconds', 'endSeconds']) || !validRange(item.window, correction.durationSeconds)
      || !exactKeys(item.settings, ['engine', 'model', 'language', 'vad', 'computeType'])
      || !text(item.settings.engine) || !text(item.settings.model) || !text(item.settings.language)
      || typeof item.settings.vad !== 'boolean' || !text(item.settings.computeType)) fail('invalid embedded evidence')
    JSON.parse(item.content)
    evidence.set(item.evidenceId, item)
  }
  if (!Array.isArray(correction.instructions) || !correction.instructions.length) fail('missing corrections')
  const updated = structuredClone(reviewedMaterialization || original)
  const slots = new Set()
  for (const entry of correction.instructions) {
    if (!exactKeys(entry, ['slotId', 'source', 'before', 'after', 'playCount', 'reason', 'groups'])
      || !['listening.short-dialogue', 'listening.long-form'].includes(entry.slotId)
      || slots.has(entry.slotId) || !text(entry.reason)) fail('invalid correction target')
    const instruction = original.sourcePresentation?.instructions.find(item => item.slotId === entry.slotId)
    if (!instruction || instruction.text !== entry.before || digestJson(instruction.source) !== digestJson(entry.source)
      || entry.after !== correctedListeningCount(entry.before, entry.playCount)) fail('correction is not an exact count-only edit')
    const short = entry.slotId === 'listening.short-dialogue'
    const groups = original.listening.transcript.filter(group => group.questionNumbers.every(number => short ? number <= 5 : number >= 6))
      .sort((a, b) => Math.min(...a.questionNumbers) - Math.min(...b.questionNumbers))
    if (!Array.isArray(entry.groups) || entry.groups.length !== groups.length || !groups.length) fail('incomplete section coverage')
    let lastEnd = 0
    for (const [index, group] of entry.groups.entries()) {
      if (!exactKeys(group, ['segmentId', 'occurrences']) || group.segmentId !== groups[index].segmentId
        || !Array.isArray(group.occurrences) || group.occurrences.length !== entry.playCount) fail('group/count binding differs')
      for (const occurrence of group.occurrences) {
        if (!exactKeys(occurrence, ['startSeconds', 'endSeconds', 'evidenceIds'])
          || !validRange(occurrence, correction.durationSeconds) || occurrence.startSeconds < lastEnd
          || !Array.isArray(occurrence.evidenceIds) || occurrence.evidenceIds.length === 0
          || new Set(occurrence.evidenceIds).size !== occurrence.evidenceIds.length
          || occurrence.evidenceIds.some(id => !evidence.has(id))) fail('invalid occurrence binding/order')
        let coveredEnd = occurrence.startSeconds
        for (const item of occurrence.evidenceIds.map(id => evidence.get(id)).sort((a, b) => a.window.startSeconds - b.window.startSeconds)) {
          if (item.window.startSeconds > coveredEnd) break
          coveredEnd = Math.max(coveredEnd, item.window.endSeconds)
        }
        if (coveredEnd < occurrence.endSeconds) fail('evidence does not cover the occurrence')
        lastEnd = occurrence.endSeconds
      }
    }
    const target = updated.sourcePresentation.instructions.find(item => item.slotId === entry.slotId)
    if (target.text !== entry.before) fail('another overlay changed the instruction')
    target.text = entry.after
    slots.add(entry.slotId)
  }
  return { materialization: updated, correction }
}
