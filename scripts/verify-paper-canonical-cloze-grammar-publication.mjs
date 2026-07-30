#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
import { sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  createFileSystemCanonicalPublicationStore,
  loadPaperForConsumption,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
  validateCanonicalPublicationBundle,
} from '../server/paper-canonical/publication.mjs'
import { makeClozeGrammarCanonicalReferenceFixture } from '../test-fixtures/paper-canonical/clozeGrammarReferenceFixture.mjs'

const fixture = makeClozeGrammarCanonicalReferenceFixture()
const compilation = compileCanonicalPaper(fixture.request)

assert.equal(compilation.disposition, 'ready')
assert.equal(fixture.source.groups.some((group) => ['cloze', 'grammar-fill'].includes(group.family)), false)
assert.equal(compilation.artifacts.canonicalPaper.paperPlan.paperId, 'paper-2026-i')
assert.equal(compilation.artifacts.sourceCapture.documents.find((document) => document.inputKey === 'paper_asset').sha256, fixture.hashes.paperAsset)
assert.equal(compilation.artifacts.sourceCapture.documents.find((document) => document.inputKey === 'official_answers').sha256, fixture.hashes.answerKey)
for (const family of ['cloze', 'grammar-fill']) {
  const group = compilation.artifacts.canonicalPaper.questionGroups.find((candidate) => candidate.variant.family === family)
  assert.ok(group, `${family} reference Group is published`)
  assert.equal(group.questionRefs.length, group.blankRefs.length, `${family} Questions and Blanks are one-to-one`)
  const occurrenceCounts = new Map(group.blankRefs.map(({ blankId }) => [blankId, 0]))
  for (const block of group.content.blocks) for (const inline of block.inlines) {
    if (inline.kind === 'blank_ref') occurrenceCounts.set(inline.blankId, occurrenceCounts.get(inline.blankId) + 1)
  }
  assert.equal([...occurrenceCounts.values()].every((count) => count === 1), true, `${family} publishes every semantic Blank exactly once`)
}
const cloze = compilation.artifacts.canonicalPaper.questionGroups.find((group) => group.variant.family === 'cloze')
const grammar = compilation.artifacts.canonicalPaper.questionGroups.find((group) => group.variant.family === 'grammar-fill')
assert.equal(cloze.questionRefs.length, 15)
assert.equal(cloze.variant.choiceOwnership.sets.every((set) => set.options.map((option) => option.label).join('') === 'ABCD'), true)
assert.equal(grammar.questionRefs.length, 10)
assert.deepEqual(grammar.variant.choiceOwnership, { ownership: 'none' })
assert.equal(compilation.artifacts.sourceCapture.assertions.find((assertion) => assertion.questionId === 'q-2026-i-041').answer, 'C')
assert.equal(compilation.artifacts.sourceCapture.assertions.find((assertion) => assertion.questionId === 'q-2026-i-056').answer, 'to be held')
assert.deepEqual(
  compilation.artifacts.normalizationReport.transformationRecords.map((record) => [record.target.identity, record.operation]),
  [
    ['listening.short-dialogue', 'direct_projection'],
    ['listening.long-form', 'direct_projection'],
    [
      'profile:nck1:instruction:writing.continuation.prompt',
      'profile_instruction_correction',
    ],
    ['group-2026-i-cloze', 'structural_tokenization'],
    ['group-2026-i-grammar-fill', 'structural_tokenization'],
  ],
)
for (const record of compilation.artifacts.normalizationReport.transformationRecords.filter(
  (candidate) => candidate.operation === 'structural_tokenization',
)) {
  const group = compilation.artifacts.canonicalPaper.questionGroups.find((candidate) => candidate.identity.groupId === record.target.identity)
  assert.deepEqual(record.after, group.content.blocks)
}
const spanById = new Map(compilation.artifacts.sourceCapture.sourceSpans.map((span) => [span.sourceSpanId, span]))
const clozeGroupSpan = spanById.get(cloze.sourceMap.entries.find((entry) => entry.target.kind === 'group').sourceSpanRefs[0])
assert.equal(clozeGroupSpan.coordinate.start > 0 && clozeGroupSpan.coordinate.end < fixture.sourceAsset.byteLength, true)
assert.equal(JSON.parse(new TextDecoder().decode(fixture.sourceAsset.slice(clozeGroupSpan.coordinate.start, clozeGroupSpan.coordinate.end))).groupId, 'group-2026-i-cloze')
const answerAssertion = compilation.artifacts.sourceCapture.assertions.find((assertion) => assertion.questionId === 'q-2026-i-041')
const answerSpan = spanById.get(answerAssertion.sourceSpanId)
const answerBytes = fixture.request.evidence.documents.find((document) => document.inputKey === 'official_answers').bytes
assert.equal(JSON.parse(new TextDecoder().decode(answerBytes.slice(answerSpan.coordinate.start, answerSpan.coordinate.end))).questionId, 'q-2026-i-041')

const supplemented = compileCanonicalPaper({ ...fixture.request, supplements: { analysis: { answer: 'forged' }, teacherNotes: ['ignored'] } })
assert.equal(supplemented.disposition, 'ready')
assert.deepEqual(supplemented.artifacts.canonicalPaper, compilation.artifacts.canonicalPaper)
assert.deepEqual(supplemented.artifacts.normalizationReport, compilation.artifacts.normalizationReport)

function requestWithEvidence(mutator) {
  const request = structuredClone(fixture.request)
  const evidence = Object.fromEntries(
    request.evidence.documents
      .filter((document) =>
        document.declared.mediaType.includes('json'),
      )
      .map((document) => [
        document.inputKey,
        JSON.parse(new TextDecoder().decode(document.bytes)),
      ]),
  )
  mutator(evidence)
  evidence.grammar_fill_prompt_source_capture.sources.paperAsset.sha256 =
    sha256(new TextEncoder().encode(JSON.stringify(evidence.paper_asset)))
  const value = evidence.canonical_mapping
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(value)).byteLength
    for (const observation of value.observations) if (observation.documentInputKey === 'canonical_mapping') observation.span.end = byteLength
  }
  for (const document of request.evidence.documents) {
    if (Object.hasOwn(evidence, document.inputKey)) {
      document.bytes = new TextEncoder().encode(
        JSON.stringify(evidence[document.inputKey]),
      )
    }
  }
  return request
}

function assertBlocked(mutator, expectedDisposition, expectedCode) {
  const blocked = compileCanonicalPaper(requestWithEvidence(mutator))
  assert.equal(blocked.disposition, expectedDisposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(blocked.artifacts.normalizationReport.diagnostics.some((diagnostic) => diagnostic.code === expectedCode), true)
  return blocked
}

const clozeEvidence = (evidence) => evidence.paper_asset.content.groups['group-2026-i-cloze']
const grammarEvidence = (evidence) => evidence.paper_asset.content.groups['group-2026-i-grammar-fill']
assertBlocked((evidence) => {
  clozeEvidence(evidence).passage.paragraphs[0].text = clozeEvidence(evidence).passage.paragraphs[0].text.replace('__41__', '__999__')
}, 'needs_review', 'REFERENCE_MARKER_AMBIGUOUS')
assertBlocked((evidence) => clozeEvidence(evidence).blankIds.push(clozeEvidence(evidence).blankIds[0]), 'needs_review', 'GROUP_MEMBER_DUPLICATE')
assertBlocked((evidence) => {
  grammarEvidence(evidence).passage.paragraphs[0].text = grammarEvidence(evidence).passage.paragraphs[0].text.replace('__56__', '')
}, 'needs_review', 'REFERENCE_BLANK_OCCURRENCE')
assertBlocked((evidence) => {
  const sourceSpanId = `source-span:${evidence.canonical_mapping.observations[0].observationId}`
  evidence.canonical_mapping.assertions.push({
    assertionId: 'answer:q-2026-i-041:conflict',
    questionId: 'q-2026-i-041',
    answer: 'A',
    authority: 'official',
    sourceSpanId,
  })
}, 'answer_conflict', 'OFFICIAL_ANSWER_CONFLICT')

const blockedRequest = requestWithEvidence((evidence) => grammarEvidence(evidence).blankIds.pop())
const blockedForMutation = compileCanonicalPaper(blockedRequest)
assert.equal(blockedForMutation.disposition, 'incomplete_source')
const noMutationRoot = path.join(mkdtempSync(path.join(tmpdir(), 'eqb-canonical-blocked-')), 'publication')
const noMutationDb = new DatabaseSync(':memory:')
try {
  assert.equal(
    publishCanonicalPaperPublication({
      rootDir: noMutationRoot,
      db: noMutationDb,
      request: blockedRequest,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    }).status,
    'admission_failed',
  )
  assert.equal(existsSync(noMutationRoot), false)
  assert.equal(noMutationDb.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'canonical_paper_publications'").get().count, 0)
} finally {
  noMutationDb.close()
  rmSync(path.dirname(noMutationRoot), { recursive: true, force: true })
}

const sealed = sealCanonicalPublication({ compilation, sourceAssetVersion: 1, sourceAsset: fixture.sourceAsset })
const staleSource = new Uint8Array(fixture.sourceAsset)
staleSource[0] ^= 1
assert.throws(
  () => validateCanonicalPublicationBundle({
    manifest: sealed.manifest,
    sourceAsset: staleSource,
    readArtifact: (relativePath) => sealed.artifacts[relativePath] || sealed.sourceEvidence[relativePath],
  }),
  { code: 'CANONICAL_PUBLICATION_SOURCE_STALE' },
)

const rootDir = mkdtempSync(path.join(tmpdir(), 'eqb-canonical-cloze-grammar-'))
const db = new DatabaseSync(path.join(rootDir, 'publication.sqlite'))
try {
  const published = publishCanonicalPaperPublication({
    rootDir,
    db,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
  })
  assert.equal(published.status, 'published')
  assert.equal(db.prepare('SELECT count(*) AS count FROM canonical_paper_publications').get().count, 1)
  const store = createFileSystemCanonicalPublicationStore({ rootDir, db })
  const storeWithLegacy = {
    ...store,
    projectLegacyFamily: async ({ familyContractId }) => [{ kind: 'legacy_family', familyContractId }],
  }
  for (const consumerContract of Object.values(consumerContractRefs)) {
    const loaded = await loadPaperForConsumption({ paperId: fixture.source.paperId, consumerContract }, storeWithLegacy)
    assert.equal(loaded.disposition, 'ready')
    for (const family of ['cloze', 'grammar-fill']) {
      const selection = loaded.selections.find((candidate) => candidate.familyContractId === family)
      assert.equal(selection.mode, 'canonical')
      assert.equal(selection.groupIds.length, 1)
    }
  }

  const groupsPath = path.join(rootDir, fixture.source.paperId, 'versions', 'v1', 'canonical', 'canonical-question-groups-v1.json')
  writeFileSync(groupsPath, '{"partial":true}\n')
  const partialFallbackStore = {
    ...store,
    projectLegacyFamily: async ({ familyContractId }) => familyContractId === 'grammar-fill' ? null : [{ kind: 'legacy_family', familyContractId }],
  }
  const partial = await loadPaperForConsumption({
    paperId: fixture.source.paperId,
    version: 'v1',
    consumerContract: consumerContractRefs.screen,
  }, partialFallbackStore)
  assert.equal(partial.disposition, 'incompatible')
  assert.equal(Object.hasOwn(partial, 'selections'), false)
  assert.equal(readFileSync(groupsPath, 'utf8'), '{"partial":true}\n')
} finally {
  db.close()
  rmSync(rootDir, { recursive: true, force: true })
}

console.log('PASS Cloze and Grammar Fill canonical publication')
