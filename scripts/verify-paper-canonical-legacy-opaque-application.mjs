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
import { validateApplicationWritingContract } from '../shared/paper-canonical/applicationWriting.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'

const root = new URL('..', import.meta.url)
const captureBytes = new Uint8Array(await readFile(new URL(
  'test-fixtures/paper-import/paper-canonical-source-captures/ticket-26-v1/paper-2020-i/source-capture-v1.json',
  root,
)))

const source = deriveTicket26LegacySource(captureBytes)
const application = source.groups.find((group) =>
  group.slotId === 'writing.application')
assert.ok(application, 'paper-2020-i carries its frozen Application Writing group')

assert.deepEqual(
  application.variant,
  {
    family: 'application-writing',
    mode: 'legacy_opaque',
    writingTaskId: application.writingTask.writingTaskId,
    sourceTaskType: 'application',
    contentBlockRefs: application.content.blocks.map((block) => block.nodeId),
    wordCountTarget: application.writingTask.wordCountTarget,
    wordCountTargetCertainty: 'explicit_legacy_field',
    wordCountScope: 'unspecified',
    choiceOwnership: { ownership: 'none' },
    response: {
      kind: 'generic_response_box',
      answerRegionRef: 'writing.application-box',
      ownership: 'product',
    },
  },
  'legacy Application Writing is one opaque, source-preserving mode rather than an invented rich task',
)
const relocatedApplication = structuredClone(application.variant)
const firstApplicationBlockRef = relocatedApplication.contentBlockRefs[0]
relocatedApplication.contentBlockRefs[0] = relocatedApplication.contentBlockRefs[1]
relocatedApplication.contentBlockRefs[1] = firstApplicationBlockRef
assert.ok(
  validateApplicationWritingContract({
    groupId: application.groupId,
    questionIds: application.questionIds,
    blankIds: application.blankIds,
    content: application.content,
    variant: relocatedApplication,
    sourceCapture: source,
  }).some((issue) => issue.code === 'APPLICATION_OPAQUE_CONTENT_ORDER_INVALID'),
  'opaque Application rejects a relocated source block',
)
const inventedApplication = {
  ...application.variant,
  situation: { writerRole: 'invented' },
}
assert.ok(
  validateApplicationWritingContract({
    groupId: application.groupId,
    questionIds: application.questionIds,
    blankIds: application.blankIds,
    content: application.content,
    variant: inventedApplication,
    sourceCapture: source,
  }).some((issue) => issue.code === 'APPLICATION_OPAQUE_VARIANT_INVALID'),
  'opaque Application rejects an invented rich semantic claim',
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
assert.ok(
  confirmed.canonicalPaper,
  'opaque Application Writing confirms as a complete unpublished Canonical Paper',
)
assert.equal('publication' in confirmed, false, 'confirmation does not publish the paper')
assert.ok(
  confirmed.canonicalPaper.sourceCapture,
  'confirmation carries the exact compiled Source Capture needed by downstream projection',
)
const canonicalApplication = confirmed.canonicalPaper.questionGroups.find((group) =>
  group.identity.groupId === application.groupId)
assert.ok(canonicalApplication)
const applicationContentNodeIds = application.content.blocks.flatMap((block) => [
  block.nodeId,
  ...block.inlines.map((inline) => inline.nodeId),
])
assert.deepEqual(
  canonicalApplication.sourceMap.entries
    .filter((entry) => entry.target.kind === 'content_node')
    .map((entry) => entry.target.id),
  applicationContentNodeIds,
  'every opaque Application block and inline retains a source-map target in source order',
)
assert.ok(
  canonicalApplication.sourceMap.entries
    .filter((entry) => entry.target.kind === 'content_node')
    .every((entry) => entry.sourceSpanRefs.includes(application.sourceSpanId)),
  'every opaque Application block and inline retains its frozen source span',
)

const projection = projectCanonicalPaper({
  plan: confirmed.canonicalPaper.paperPlan,
  groups: confirmed.canonicalPaper.questionGroups,
  sourceCapture: confirmed.canonicalPaper.sourceCapture,
})
const projectedApplication = projection.nodes.find((node) =>
  node.kind === 'group' && node.groupId === application.groupId)
assert.ok(projectedApplication, 'the opaque Application group reaches the shared projector')
assert.equal(projectedApplication.writingMode, 'legacy_opaque')
assert.equal(projectedApplication.sourceTaskType, 'application')
assert.equal(projectedApplication.answerRegion.ownership, 'product')
assert.deepEqual(
  projectedApplication.sourceBlocks,
  application.content.blocks,
  'projection retains every frozen block and inline in exact source order',
)
assert.equal(
  projectedApplication.sourceBlocks.some((block) =>
    block.inlines.some((inline) => inline.text.includes('A Cross-Country Running Race'))),
  true,
  'the supplied title remains source content instead of moving into the response box',
)

console.log('paper canonical legacy opaque Application verification passed')
