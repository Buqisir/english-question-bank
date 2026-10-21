#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { projectCanonicalPaper } from '../shared/paper-canonical/projector.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import {
  makeReadingCanonicalReferenceFixture,
  readingReferenceHashes,
} from '../test-fixtures/paper-canonical/readingReferenceFixture.mjs'

function readingGroups(compilation) {
  return compilation.artifacts.canonicalPaper.questionGroups.filter((group) => group.variant.family === 'reading')
}

function project(compilation) {
  return projectCanonicalPaper({
    plan: compilation.artifacts.canonicalPaper.paperPlan,
    groups: compilation.artifacts.canonicalPaper.questionGroups,
    sourceCapture: compilation.artifacts.sourceCapture,
  })
}

async function exercisePublicSeams(fixture) {
  const compilation = compileCanonicalPaper(fixture.request)
  assert.equal(compilation.disposition, 'ready')
  const projected = project(compilation)
  const projectedReading = projected.nodes.filter((node) => node.kind === 'group' && node.familyContractId === 'reading')
  assert.equal(projectedReading.length, 4)
  assert.equal(projectedReading.every((group) => Array.isArray(group.blocks) && Array.isArray(group.questions)), true)

  const sealed = sealCanonicalPublication({
    compilation,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  const reopened = validateCanonicalPublicationBundle({
    manifest: sealed.manifest,
    sourceAsset: sealed.sourceAsset,
    readArtifact: (relativePath) => sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
  })
  assert.deepEqual(
    reopened.projected.nodes.filter((node) => node.kind === 'group' && node.familyContractId === 'reading'),
    projectedReading,
  )

  const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-reading-publication-'))
  const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
  try {
    assert.equal(publishCanonicalPaperPublication({
      rootDir,
      db,
      request: fixture.request,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    }).status, 'published')
    const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
    for (const consumerContract of [
      consumerContractRefs.screen,
      consumerContractRefs.print_pdf,
    ]) {
      const loaded = await loadPaperForConsumption({
        paperId: fixture.paperId || fixture.source.paperId,
        consumerContract,
      }, store)
      assert.equal(loaded.disposition, 'ready')
      const selection = loaded.selections.find((candidate) => candidate.familyContractId === 'reading')
      assert.equal(selection.mode, 'canonical')
      assert.equal(selection.groupIds.length, 4)
      assert.equal(selection.projectedOccurrences.length, 4)
      for (const groupId of selection.groupIds) {
        assert.equal(projectCanonicalConsumerGroup({
          consumption: loaded, familyContractId: 'reading', groupId,
        }).groupId, groupId)
      }
    }
  } finally {
    db.close()
    rmSync(rootDir, { recursive: true, force: true })
  }
  return { compilation, projectedReading }
}

function jsonEvidence(request) {
  return Object.fromEntries(request.evidence.documents
    .filter((document) => document.declared?.mediaType === 'application/json' || document.declared?.mediaType === 'application/vnd.eqb.canonical-fixture+json')
    .map((document) => [document.inputKey, JSON.parse(new TextDecoder().decode(document.bytes))]))
}

function requestWithEvidence(fixture, mutator) {
  const request = structuredClone(fixture.request)
  const evidence = jsonEvidence(request)
  mutator(evidence)
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(evidence.canonical_mapping)).byteLength
    for (const observation of evidence.canonical_mapping.observations) {
      if (observation.documentInputKey === 'canonical_mapping') observation.span.end = mappingLength
    }
  }
  for (const document of request.evidence.documents) {
    if (Object.hasOwn(evidence, document.inputKey)) document.bytes = new TextEncoder().encode(JSON.stringify(evidence[document.inputKey]))
  }
  return request
}

function assertBlocked(fixture, mutator, disposition, code) {
  const blocked = compileCanonicalPaper(requestWithEvidence(fixture, mutator))
  assert.equal(blocked.disposition, disposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(blocked.artifacts.normalizationReport.diagnostics.some((item) => item.code === code), true)
}

function sourceDocumentArtifactId(bytes) {
  const mediaDigest = sha256(bytes)
  return {
    mediaDigest,
    artifactId: `source-document:${digestJson({ sha256: mediaDigest }).slice('sha256:'.length, 28)}`,
  }
}

function makeCanonicalFigureFixture(byteLength) {
  const fixture = makeReadyCanonicalFixture()
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lY6O3wAAAABJRU5ErkJggg==', 'base64')
  const mediaBytes = new Uint8Array(byteLength || png.length)
  mediaBytes.set(png)
  const { mediaDigest, artifactId } = sourceDocumentArtifactId(mediaBytes)
  const group = fixture.source.groups.find((candidate) => candidate.slotId === 'reading.d')
  const mediaId = 'media:reading:figure-proof'
  const mediaObservationId = 'observation:reading:figure-proof'
  group.media = [{
    mediaId,
    mimeType: 'image/png',
    sha256: mediaDigest,
    pixelWidth: 1,
    pixelHeight: 1,
    sourceArtifactRef: { artifactId },
  }]
  group.content.blocks.push({
    kind: 'figure',
    nodeId: 'figure:reading:proof',
    mediaId,
    caption: [{ kind: 'text', nodeId: 'text:reading:figure-caption', text: 'Source-backed diagram.' }],
  })
  group.sourceSpanRefsByTarget = {
    [`media:${mediaId}`]: [`source-span:${mediaObservationId}`],
  }
  fixture.source.observations.push({
    observationId: mediaObservationId,
    kind: 'source_figure',
    documentInputKey: 'reading_figure',
    value: { mediaId, sha256: mediaDigest, pixelWidth: 1, pixelHeight: 1 },
    span: { start: 0, end: mediaBytes.byteLength },
  })
  for (let pass = 0; pass < 3; pass++) {
    const mappingLength = new TextEncoder().encode(JSON.stringify(fixture.source)).byteLength
    for (const observation of fixture.source.observations) {
      if (observation.documentInputKey === 'questions') observation.span.end = mappingLength
    }
  }
  const mappingBytes = new TextEncoder().encode(JSON.stringify(fixture.source))
  fixture.request.evidence.documents[0].bytes = mappingBytes
  fixture.request.evidence.documents.push({
    inputKey: 'reading_figure',
    roles: ['source_media'],
    bytes: mediaBytes,
    declared: { mediaType: 'image/png', originalName: 'reading-proof.png' },
  })
  fixture.sourceAsset = mappingBytes
  return fixture
}

const canonicalOnly = await exercisePublicSeams(makeReadyCanonicalFixture())
assert.equal(readingGroups(canonicalOnly.compilation).every((group) => group.content.blocks.length > 0), true)
assert.equal(readingGroups(canonicalOnly.compilation).every((group) => !Object.hasOwn(group, 'materialText')), true)

const figureProof = await exercisePublicSeams(makeCanonicalFigureFixture())
const figureGroup = readingGroups(figureProof.compilation).find((group) => group.identity.groupId === 'group:reading.d')
assert.equal(figureGroup.content.blocks.filter((block) => block.kind === 'figure').length, 1)
assert.equal(figureGroup.media.length, 1)
assert.equal(figureGroup.sourceMap.entries.some((entry) => entry.target.kind === 'media' && entry.target.id === figureGroup.media[0].mediaId), true)

// The consumer must decode and verify a large embedded image, not only its
// Base64 grammar. PNG readers allow trailing bytes after IEND.
await exercisePublicSeams(makeCanonicalFigureFixture(4 * 1024 * 1024))

const realFixture = makeReadingCanonicalReferenceFixture()
const real = await exercisePublicSeams(realFixture)
const capture = real.compilation.artifacts.sourceCapture
for (const expected of Object.values(readingReferenceHashes)) {
  assert.equal(capture.documents.some((document) => document.sha256 === expected), true)
}
const readingA = readingGroups(real.compilation).find((group) => group.identity.groupId === 'group-2026-i-reading-a')
const readingC = readingGroups(real.compilation).find((group) => group.identity.groupId === 'group-2026-i-reading-c')
assert.deepEqual(readingA.content.blocks.map((block) => block.kind), [
  'paragraph',
  'paragraph',
  'paragraph',
  'table',
  'paragraph',
  'paragraph',
  'paragraph',
  'paragraph',
])
assert.deepEqual(readingA.variant.passageBlockRoles.map((entry) => entry.role), ['subtitle', 'subtitle', 'subtitle', 'title'])
const table = readingA.content.blocks.find((block) => block.kind === 'table')
assert.equal(table.columnCount, 3)
assert.equal(table.rows.length, 4)
assert.equal(table.rows.flatMap((row) => row.cells).length, 12)
assert.equal(readingA.media.length, 0, 'table proof crop remains evidence, not a duplicate Figure')
assert.equal(readingC.content.blocks.length, 6)
assert.equal(readingC.variant.passageBlockRoles.length, 0)
for (const group of [readingA, readingC]) {
  assert.deepEqual(group.variant.questions.map((question) => question.questionId), group.questionRefs.map((question) => question.questionId))
  assert.deepEqual(group.variant.choiceOwnership.sets.map((set) => set.questionId), group.questionRefs.map((question) => question.questionId))
  for (const [index, question] of group.variant.questions.entries()) {
    const options = group.variant.choiceOwnership.sets[index].options
    assert.equal(options.map((option) => option.label).join(''), 'ABCD')
    assert.equal(options.some((option) => option.optionId === question.correctOptionId), true)
    const questionMap = group.sourceMap.entries.find((entry) => entry.target.kind === 'question' && entry.target.id === question.questionId)
    assert.equal(questionMap.sourceSpanRefs.length, 2)
  }
  const reviewedPrefix = `observation:reference:reading:${group.identity.groupId}:`
  const reviewedObservationCount = capture.observations.filter((observation) => observation.observationId.startsWith(reviewedPrefix)).length
  const reviewedEntries = group.sourceMap.entries.filter((entry) => entry.target.kind === 'content_node' && entry.transformationRecordIds.length === 1)
  assert.equal(reviewedEntries.length, reviewedObservationCount)
  for (const entry of reviewedEntries) {
    assert.equal(entry.sourceSpanRefs.length, 1)
    const span = capture.sourceSpans.find((candidate) => candidate.sourceSpanId === entry.sourceSpanRefs[0])
    assert.equal(span.coordinate.kind, 'page_region')
    assert.equal(capture.documents.find((document) => document.documentId === span.documentId).sha256, readingReferenceHashes.sourcePdf)
  }
}
const projectedA = real.projectedReading.find((group) => group.groupId === readingA.identity.groupId)
assert.deepEqual(projectedA.blocks, readingA.content.blocks)
assert.deepEqual(projectedA.questions.map((question) => question.correctOptionId), readingA.variant.questions.map((question) => question.correctOptionId))
assert.equal(projectedA.anchors.optionIds.length, 12)
assert.equal(new Set(projectedA.anchors.contentNodeIds).size, projectedA.anchors.contentNodeIds.length)

const supplemented = compileCanonicalPaper({
  ...realFixture.request,
  supplements: {
    analysis: { flattenedTable: 'forbidden', answers: ['forged'] },
    renderer: { placeholder: '〔表格：见原卷〕' },
  },
})
assert.equal(supplemented.disposition, 'ready')
assert.deepEqual(supplemented.artifacts.canonicalPaper, real.compilation.artifacts.canonicalPaper)
assert.deepEqual(supplemented.artifacts.normalizationReport, real.compilation.artifacts.normalizationReport)

const bridgeOnlyRequest = structuredClone(realFixture.request)
bridgeOnlyRequest.evidence.documents = bridgeOnlyRequest.evidence.documents.filter((document) => document.inputKey !== 'reading_structure')
const bridgeOnly = compileCanonicalPaper(bridgeOnlyRequest)
assert.equal(bridgeOnly.disposition, 'incomplete_source')
assert.equal(bridgeOnly.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'READING_STRUCTURE_EVIDENCE_INCOMPLETE'), true)

const missingTableProofRequest = structuredClone(realFixture.request)
missingTableProofRequest.evidence.documents = missingTableProofRequest.evidence.documents.filter((document) => document.inputKey !== 'table_visual_proof')
const missingTableProof = compileCanonicalPaper(missingTableProofRequest)
assert.equal(missingTableProof.disposition, 'incomplete_source')
assert.equal(missingTableProof.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'READING_GROUP_EVIDENCE_INCOMPLETE'), true)

assertBlocked(realFixture, (evidence) => {
  const span = `source-span:${evidence.canonical_mapping.observations[0].observationId}`
  evidence.canonical_mapping.ambiguities = [{
    ambiguityId: 'reading-heading-role',
    candidates: ['title', 'body'],
    sourceSpanRefs: [span],
  }]
}, 'needs_review', 'AMBIGUOUS_SOURCE_SEMANTICS')
assertBlocked(realFixture, (evidence) => {
  const span = `source-span:${evidence.canonical_mapping.observations[0].observationId}`
  evidence.canonical_mapping.ambiguities = [{
    ambiguityId: 'reading-table-grid',
    candidates: ['4x3', '3x4'],
    sourceSpanRefs: [span],
  }]
}, 'needs_review', 'AMBIGUOUS_SOURCE_SEMANTICS')
assertBlocked(realFixture, (evidence) => {
  const group = evidence.reading_structure.groups['group-2026-i-reading-a']
  group.content.blocks.find((block) => block.kind === 'table').rows[0].cells.pop()
}, 'incomplete_source', 'READING_TABLE_INCOMPLETE')
assertBlocked(realFixture, (evidence) => {
  const group = evidence.reading_structure.groups['group-2026-i-reading-a']
  group.content.blocks.find((block) => block.kind === 'table').rows[0].cells[0].inlines[0].text = 'FABRICATED CELL CONTENT'
}, 'incomplete_source', 'READING_SOURCE_TRANSCRIPTION_MISMATCH')
assertBlocked(realFixture, (evidence) => {
  const group = evidence.reading_structure.groups['group-2026-i-reading-a']
  group.sourceObservations[0].region.width = 2
}, 'needs_review', 'READING_SOURCE_TRANSCRIPTION_COVERAGE_AMBIGUOUS')
assertBlocked(realFixture, (evidence) => {
  const group = evidence.reading_structure.groups['group-2026-i-reading-a']
  group.content.blocks.find((block) => block.kind === 'table').rows[1].rowId = group.content.blocks.find((block) => block.kind === 'table').rows[0].rowId
}, 'needs_review', 'READING_IDENTITY_DUPLICATE')
assertBlocked(realFixture, (evidence) => {
  const group = evidence.reading_structure.groups['group-2026-i-reading-a']
  group.content.blocks[3] = { kind: 'nested_table', nodeId: 'nested:unsupported', children: [] }
}, 'unsupported', 'RICH_BLOCK_UNSUPPORTED')
assertBlocked(realFixture, (evidence) => {
  evidence.reading_structure.groups['group-duplicate-reading-a'] = {
    ...structuredClone(evidence.reading_structure.groups['group-2026-i-reading-a']),
    groupId: 'group-duplicate-reading-a',
  }
}, 'needs_review', 'READING_SOURCE_CAPTURE_AMBIGUOUS')
assertBlocked(realFixture, (evidence) => {
  evidence.paper_asset.content.questions['q-2026-i-028'].questionNo = 29
}, 'needs_review', 'READING_QUESTION_IDENTITY_AMBIGUOUS')
assertBlocked(realFixture, (evidence) => {
  delete evidence.official_answers.answers['q-2026-i-028']
}, 'incomplete_source', 'READING_QUESTION_EVIDENCE_INCOMPLETE')
assertBlocked(realFixture, (evidence) => {
  const sourceSpanId = `source-span:${evidence.canonical_mapping.observations[0].observationId}`
  evidence.canonical_mapping.assertions.push({
    assertionId: 'answer:q-2026-i-028:conflict',
    questionId: 'q-2026-i-028',
    answer: 'A',
    authority: 'official',
    sourceSpanId,
  })
}, 'answer_conflict', 'OFFICIAL_ANSWER_CONFLICT')
assertBlocked(realFixture, (evidence) => {
  const group = evidence.reading_structure.groups['group-2026-i-reading-a']
  group.content.blocks[3] = {
    kind: 'paragraph',
    nodeId: 'paragraph:flattened-table',
    inlines: [{ kind: 'text', nodeId: 'text:flattened-table', text: '[表: placeholder] flattened cells' }],
  }
}, 'incomplete_source', 'READING_FLATTENED_BRIDGE_FORBIDDEN')

const missingFigureFixture = makeCanonicalFigureFixture()
missingFigureFixture.request.evidence.documents = missingFigureFixture.request.evidence.documents.filter((document) => document.inputKey !== 'reading_figure')
const missingFigure = compileCanonicalPaper(missingFigureFixture.request)
assert.equal(missingFigure.disposition, 'incomplete_source')
assert.equal(missingFigure.artifacts.normalizationReport.diagnostics.some((item) => item.code === 'SOURCE_SPAN_INVALID' || item.code === 'MEDIA_INVALID'), true)

console.log('PASS Reading canonical publication')
