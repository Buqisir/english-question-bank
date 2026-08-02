#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  confirmCanonicalCandidate,
  importCanonicalCandidate,
} from '../server/paper-canonical/trustedDocxCanonicalImport.mjs'
import {
  deriveTicket26LegacySource,
} from '../server/paper-canonical/legacyTicket26SourceAdapter.mjs'
import { validateContinuationWritingContract } from '../shared/paper-canonical/continuationWriting.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'

const root = new URL('..', import.meta.url)
const captureBytes = new Uint8Array(await readFile(new URL(
  'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-zj-2022-jun/source-capture-v1.json',
  root,
)))
const source = deriveTicket26LegacySource(captureBytes)
const continuation = source.groups.find((group) =>
  group.slotId === 'writing.continuation')
assert.ok(continuation, 'paper-zj-2022-jun carries the ambiguous three-entry legacy Continuation group')

const sourceStarterBlockRefs = continuation.content.blocks
  .filter((block) => block.nodeId.includes(':starter:'))
  .map((block) => block.nodeId)
assert.equal(sourceStarterBlockRefs.length, 3, 'the frozen source contains all three ambiguous starter entries')
assert.deepEqual(
  continuation.variant,
  {
    family: 'continuation-writing',
    mode: 'legacy_opaque',
    writingTaskId: continuation.writingTask.writingTaskId,
    sourceTaskType: 'continuation',
    contentBlockRefs: continuation.content.blocks.map((block) => block.nodeId),
    sourceStarterBlockRefs,
    wordCountTarget: continuation.writingTask.wordCountTarget,
    wordCountTargetCertainty: 'explicit_legacy_field',
    wordCountScope: 'unspecified',
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'generic_response_box',
      answerRegionRef: 'writing.continuation-box',
      ownership: 'product',
    },
  },
  'ambiguous legacy starter entries remain an opaque source stream rather than response-bound starters',
)
const relocatedContinuation = structuredClone(continuation.variant)
relocatedContinuation.contentBlockRefs.reverse()
assert.ok(
  validateContinuationWritingContract({
    groupId: continuation.groupId,
    profileId: source.profileId,
    questionIds: continuation.questionIds,
    blankIds: continuation.blankIds,
    content: continuation.content,
    variant: relocatedContinuation,
    sourceCapture: source,
  }).some((issue) => issue.code === 'CONTINUATION_CONTENT_OWNERSHIP_INCOMPLETE'),
  'opaque Continuation rejects relocation of material or ambiguous starter text',
)
const inventedContinuation = {
  ...continuation.variant,
  starterProvision: { kind: 'ordered_source_starters', starters: [] },
}
assert.ok(
  validateContinuationWritingContract({
    groupId: continuation.groupId,
    profileId: source.profileId,
    questionIds: continuation.questionIds,
    blankIds: continuation.blankIds,
    content: continuation.content,
    variant: inventedContinuation,
    sourceCapture: source,
  }).some((issue) => issue.code === 'CONTINUATION_VARIANT_INVALID'),
  'opaque Continuation rejects an invented response-starter semantic claim',
)

const imported = importCanonicalCandidate({
  kind: 'ticket-26-source-capture-v1',
  sourceCaptureBytes: captureBytes,
})
assert.ok(imported.candidate, 'the exact frozen capture enters the trusted candidate seam')
const confirmed = confirmCanonicalCandidate(imported.candidate, {
  schemaVersion: 'teacher-confirmation-v1',
  candidateDigest: imported.candidate.candidateDigest,
  sourceDigest: imported.candidate.source.sha256,
  confirmed: true,
})
assert.ok(confirmed.canonicalPaper, 'opaque Continuation confirms as a complete unpublished Canonical Paper')
assert.equal('publication' in confirmed, false, 'confirmation does not publish the paper')
const canonicalContinuation = confirmed.canonicalPaper.questionGroups.find((group) =>
  group.identity.groupId === continuation.groupId)
assert.ok(canonicalContinuation)
const continuationContentNodeIds = continuation.content.blocks.flatMap((block) => [
  block.nodeId,
  ...block.inlines.map((inline) => inline.nodeId),
])
assert.deepEqual(
  canonicalContinuation.sourceMap.entries
    .filter((entry) => entry.target.kind === 'content_node')
    .map((entry) => entry.target.id),
  continuationContentNodeIds,
  'every opaque Continuation block and inline retains a source-map target in source order',
)
assert.ok(
  canonicalContinuation.sourceMap.entries
    .filter((entry) => entry.target.kind === 'content_node')
    .every((entry) => entry.sourceSpanRefs.includes(continuation.sourceSpanId)),
  'every opaque Continuation block and inline retains its frozen source span',
)

const projection = projectCanonicalPaper({
  plan: confirmed.canonicalPaper.paperPlan,
  groups: confirmed.canonicalPaper.questionGroups,
  sourceCapture: confirmed.canonicalPaper.sourceCapture,
})
const projectedContinuation = projection.nodes.find((node) =>
  node.kind === 'group' && node.groupId === continuation.groupId)
assert.ok(projectedContinuation, 'the opaque Continuation group reaches the shared projector')
assert.equal(projectedContinuation.writingMode, 'legacy_opaque')
assert.equal(projectedContinuation.sourceTaskType, 'continuation')
assert.equal(projectedContinuation.answerRegion.ownership, 'product')
assert.deepEqual(
  projectedContinuation.sourceBlocks,
  continuation.content.blocks,
  'projection preserves every material and ambiguous starter block in frozen source order',
)
assert.deepEqual(
  projectedContinuation.sourceStarterBlockRefs,
  sourceStarterBlockRefs,
  'projection retains source starter-array identity without claiming response placement',
)
assert.equal('starterLines' in projectedContinuation.answerRegion, false)

console.log('paper canonical legacy opaque Continuation verification passed')
