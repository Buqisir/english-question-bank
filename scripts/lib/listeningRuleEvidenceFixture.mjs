import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { sha256, digestJson } from '../../shared/paper-canonical/stable.mjs'
import { LISTENING_SEGMENT_RULE, LISTENING_EQUIVALENCES } from '../import-pipeline/lib-listening-segment-rule.mjs'
import { LISTENING_REVIEW_VERSION } from '../../shared/paper-canonical/listeningRuleEvidence.mjs'

// Synthetic attestations for public-seam fixtures, never production evidence.
export function withListeningRuleFixture(root, review, transcript) {
  const relative = 'listening-review-evidence/fixture-rule.json'
  const next = structuredClone(review)
  next.schemaVersion = LISTENING_REVIEW_VERSION
  next.evidence = next.evidence.filter(file => file.path !== relative)
  const hash = sha256('synthetic listening fixture')
  const value = { schemaVersion: 'listening-rule-evidence-v2', rule: LISTENING_SEGMENT_RULE,
    normalization: LISTENING_EQUIVALENCES,
    input: { subject: next.subject, rule: LISTENING_SEGMENT_RULE, normalization: LISTENING_EQUIVALENCES,
      sourceTextSha256: sha256(JSON.stringify(transcript)), materializationSha256: hash, audioSha256: next.subject.playbackAudioSha256,
      silenceSha256: hash, ruleCodeSha256: hash, adapterSha256: hash,
      instructionsSha256: digestJson([]), questionsSha256: digestJson([]) },
    rawEvidence: next.evidence.filter(file => file.kind === 'asr_window'),
    groups: next.groups.map(group => ({ segmentId: group.segmentId, questionNumbers: group.questionNumbers,
      sourceText: transcript.find(source => source.segmentId === group.segmentId)?.text,
      decision: group.decision, playback: group.playback, occurrences: group.occurrences.map(occurrence => ({
        playback: { startSeconds: occurrence.startSeconds, endSeconds: occurrence.endSeconds },
        evidencePaths: occurrence.evidencePaths })), issues: [], engineAttempts: [] })),
    diagnostic: { schemaVersion: 'listening-diagnostics-v1', path: 'diagnostics.json.gz', encoding: 'gzip',
      sha256: hash, byteLength: 1, decodedSha256: hash, decodedByteLength: 1 } }
  const bytes = Buffer.from(JSON.stringify(value))
  mkdirSync(path.join(root, 'listening-review-evidence'), { recursive: true })
  writeFileSync(path.join(root, relative), bytes)
  next.evidence.push({ path: relative, sha256: sha256(bytes), byteLength: bytes.length,
    kind: 'review_notes', window: null, settings: null })
  return next
}
