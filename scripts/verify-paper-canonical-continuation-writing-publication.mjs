#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { canonicalAuthorityRef, resolveCanonicalAuthority, slotsForProfile } from '../shared/paper-canonical/authority.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  continuationWritingReferenceHashes,
  makeContinuationWritingReferenceFixture,
  makePollutedContinuationCapture,
} from '../test-fixtures/paper-canonical/continuationWritingReferenceFixture.mjs'

function project(compilation) {
  return projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
}

async function exercisePublicSeams(referenceFixture) {
  const compiled = compileCanonicalPaper(referenceFixture.request)
  assert.equal(compiled.disposition, 'ready')
  const group = compiled.artifacts.canonicalPaper.questionGroups
    .find((candidate) => candidate.variant.family === 'continuation-writing')
  assert.deepEqual(group.questionRefs, [])
  assert.deepEqual(group.blankRefs, [])
  assert.deepEqual(group.media, [])
  assert.deepEqual(group.variant.choiceOwnership, { ownership: 'none' })

  const projected = project(compiled)
  const occurrences = projected.nodes
    .filter((node) => node.kind === 'group' && node.familyContractId === 'continuation-writing')
  assert.equal(occurrences.length, 1)
  assert.equal(occurrences[0].answerRegion.responseSlotId, 'writing.continuation')

  const sealed = sealCanonicalPublication({
    compilation: compiled,
    sourceAssetVersion: 1,
    sourceAsset: referenceFixture.sourceAsset,
  })
  const reopened = validateCanonicalPublicationBundle({
    manifest: sealed.manifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) => sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
  })
  assert.deepEqual(
    reopened.projected.nodes.filter((node) => node.kind === 'group' && node.familyContractId === 'continuation-writing'),
    occurrences,
  )

  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-continuation-writing-publication-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    assert.equal(publishCanonicalPaperPublication({
      rootDir,
      db,
      compilation: compiled,
      sourceAssetVersion: 1,
      sourceAsset: referenceFixture.sourceAsset,
    }).status, 'published')
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerContract of [
      consumerContractRefs.screen,
      consumerContractRefs.print_pdf,
    ]) {
      const loaded = await loadPaperForConsumption({
        paperId: referenceFixture.paperId,
        consumerContract,
      }, store)
      assert.equal(loaded.disposition, 'ready')
      const selection = loaded.selections.find((candidate) => candidate.familyContractId === 'continuation-writing')
      assert.equal(selection.mode, 'canonical')
      assert.deepEqual(selection.groupIds, [occurrences[0].groupId])
      assert.deepEqual(selection.projectedOccurrences, occurrences)
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
  return { compiled, occurrence: occurrences[0] }
}

function requestWithCapture(referenceFixture, mutator) {
  const request = structuredClone(referenceFixture.request)
  const captureDocument = request.evidence.documents.find((document) => document.inputKey === 'continuation_writing_capture')
  const capture = JSON.parse(new TextDecoder().decode(captureDocument.bytes))
  mutator(capture)
  captureDocument.bytes = new TextEncoder().encode(JSON.stringify(capture))
  return request
}

function requestWithReviewedEvidence(referenceFixture, mutator) {
  const request = structuredClone(referenceFixture.request)
  const captureDocument = request.evidence.documents.find((document) => document.inputKey === 'continuation_writing_capture')
  const transcriptionDocument = request.evidence.documents.find((document) => document.inputKey === 'continuation_writing_transcription')
  const capture = JSON.parse(new TextDecoder().decode(captureDocument.bytes))
  const transcription = JSON.parse(new TextDecoder().decode(transcriptionDocument.bytes))
  mutator(capture, transcription)
  transcriptionDocument.bytes = new TextEncoder().encode(JSON.stringify(transcription))
  capture.group.sourceLocation.transcriptionDigest = sha256(transcriptionDocument.bytes)
  captureDocument.bytes = new TextEncoder().encode(JSON.stringify(capture))
  return request
}

function assertBlocked(referenceFixture, mutator, disposition, code) {
  const blocked = compileCanonicalPaper(requestWithCapture(referenceFixture, mutator))
  assert.equal(blocked.disposition, disposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(
    blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === code),
    true,
    `Expected ${code}; received ${blocked.artifacts.normalizationReport.diagnostics.map((item) => item.code).join(', ')}`,
  )
}

const twoStarterFixture = makeContinuationWritingReferenceFixture('paper-2026-i')
const twoStarter = await exercisePublicSeams(twoStarterFixture)
const currentAuthority = resolveCanonicalAuthority(canonicalAuthorityRef).closure
const continuationSlot = slotsForProfile(currentAuthority.profiles.get('nck1'))
  .find((slot) => slot.slotId === 'writing.continuation')
const continuationGroup = twoStarter.compiled.artifacts.canonicalPaper.questionGroups
  .find((group) => group.variant.family === 'continuation-writing')
assert.equal(continuationSlot.familyContractRef.version, '2')
assert.equal(continuationGroup.contractRef.familyContractVersion, continuationSlot.familyContractRef.version)
{
  const mismatchedGroups = structuredClone(twoStarter.compiled.artifacts.canonicalPaper.questionGroups)
  const mismatchedGroup = mismatchedGroups.find((group) => group.variant.family === 'continuation-writing')
  mismatchedGroup.contractRef.familyContractVersion = '1'
  const { sourceMap: _sourceMap, sourceFingerprint: _sourceFingerprint, semanticDigest: _semanticDigest, ...semantic } = mismatchedGroup
  mismatchedGroup.semanticDigest = digestJson(semantic)
  assert.throws(
    () => projectCanonicalPaper({
      plan: twoStarter.compiled.artifacts.canonicalPaper.paperPlan,
      groups: mismatchedGroups,
      sourceCapture: twoStarter.compiled.artifacts.sourceCapture,
      authorityClosure: currentAuthority,
    }),
    (error) => (
      error.code === 'CANONICAL_PROJECTION_REJECTED'
      && error.message === 'Group family contract is stale or incompatible'
    ),
  )
}
assert.equal(twoStarter.occurrence.answerRegion.starterLines.length, 2)
assert.deepEqual(
  twoStarter.occurrence.answerRegion.starterLines.map((starter) => starter.starterId),
  ['starter:group-2026-i-writing-continuation:1', 'starter:group-2026-i-writing-continuation:2'],
)
assert.equal(
  twoStarter.compiled.artifacts.sourceCapture.documents
    .some((document) => document.sha256 === continuationWritingReferenceHashes['paper-2026-i'].source),
  true,
)

const plotLedFixture = makeContinuationWritingReferenceFixture('paper-zj-2020-jul')
const plotLed = await exercisePublicSeams(plotLedFixture)
assert.deepEqual(plotLed.occurrence.answerRegion.starterLines, [])
assert.equal(
  plotLed.compiled.artifacts.sourceCapture.documents
    .some((document) => document.sha256 === continuationWritingReferenceHashes['paper-zj-2020-jul'].source),
  true,
)

const supplemented = compileCanonicalPaper({
  ...twoStarterFixture.request,
  supplements: {
    analysis: {
      continuationStarters: ['forged one', 'forged two'],
      material: 'forged',
      wordCountTarget: 200,
      responseBinding: 'forged',
    },
    continuationDesign: { paragraphs: ['forged'] },
    modelAnswer: { text: 'forged' },
    officialModelAnswer: { text: 'forged' },
    highlights: ['forged'],
    generatorAudit: { starters: ['forged'] },
  },
})
assert.equal(supplemented.disposition, 'ready')
assert.deepEqual(supplemented.artifacts.canonicalPaper, twoStarter.compiled.artifacts.canonicalPaper)
assert.deepEqual(supplemented.artifacts.normalizationReport, twoStarter.compiled.artifacts.normalizationReport)

assertBlocked(twoStarterFixture, (capture) => {
  const third = structuredClone(capture.group.variant.starterProvision.starters[1])
  third.starterId = `${third.starterId}:pollution`
  third.contentRef = capture.group.variant.materialBlockRefs[0]
  third.authorityObservationRef = `${third.authorityObservationRef}:pollution`
  capture.group.variant.starterProvision.starters.push(third)
}, 'needs_review', 'CONTINUATION_SOURCE_TRANSCRIPTION_CONFLICT')
{
  const blocked = compileCanonicalPaper(requestWithReviewedEvidence(twoStarterFixture, (capture, transcription) => {
    const starter = structuredClone(capture.group.variant.starterProvision.starters[1])
    starter.starterId = `${starter.starterId}:pollution`
    starter.contentRef = `${starter.contentRef}:pollution`
    starter.authorityObservationRef = `${starter.authorityObservationRef}:pollution`
    const block = {
      kind: 'paragraph',
      nodeId: starter.contentRef,
      inlines: [{ kind: 'text', nodeId: `text:${starter.contentRef}`, text: 'Response-like pollution.' }],
    }
    capture.group.content.blocks.push(block)
    capture.group.variant.starterProvision.starters.push(starter)
    capture.group.observations.push({
      observationId: starter.authorityObservationRef,
      kind: 'continuation_source_starter',
      value: { groupId: capture.group.groupId, starterId: starter.starterId, contentRef: starter.contentRef },
    })
    transcription.orderedBlocks.push({
      blockId: block.nodeId,
      textDigest: digestJson(block.inlines[0].text),
    })
    transcription.starterProvision.contentRefs.push(starter.contentRef)
  }))
  assert.equal(blocked.disposition, 'needs_review')
  assert.equal(
    blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'CONTINUATION_STARTER_BOUNDARY_AMBIGUOUS'),
    true,
  )
}
assertBlocked(plotLedFixture, (capture) => {
  capture.group.variant.starterProvision.absenceAssertionRef = 'observation:missing'
}, 'incomplete_source', 'CONTINUATION_STARTER_ABSENCE_UNPROVEN')
assertBlocked(twoStarterFixture, (capture) => {
  capture.profileId = 'zhejiang-legacy'
}, 'incomplete_source', 'CONTINUATION_SOURCE_PROVENANCE_INVALID')
assertBlocked(twoStarterFixture, (capture) => {
  capture.group.variant.starterProvision.starters.pop()
}, 'needs_review', 'CONTINUATION_SOURCE_TRANSCRIPTION_CONFLICT')
{
  const blocked = compileCanonicalPaper(requestWithReviewedEvidence(twoStarterFixture, (capture, transcription) => {
    capture.group.variant.starterProvision.starters.pop()
    transcription.starterProvision.contentRefs.pop()
  }))
  assert.equal(blocked.disposition, 'unsupported')
  assert.equal(
    blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'CONTINUATION_PROFILE_CARDINALITY_UNSUPPORTED'),
    true,
  )
}
assertBlocked(twoStarterFixture, (capture) => {
  capture.group.variant.materialBlockRefs.push(capture.group.variant.starterProvision.starters[0].contentRef)
}, 'needs_review', 'CONTINUATION_SOURCE_TRANSCRIPTION_CONFLICT')
assertBlocked(twoStarterFixture, (capture) => {
  const ruling = capture.group.observations.find((observation) => observation.kind === 'continuation_word_count_ruling')
  ruling.value.target = 200
}, 'needs_review', 'CONTINUATION_WORD_RULING_CONFLICT')
assertBlocked(twoStarterFixture, (capture) => {
  capture.group.variant.analysis = { continuationStarters: ['forged'] }
}, 'incomplete_source', 'CONTINUATION_SOURCE_VARIANT_INVALID')

const polluted = makePollutedContinuationCapture()
assert.equal(polluted.group.variant.starterProvision.starters.length, 3)

console.log('paper canonical Continuation Writing publication verification passed')
