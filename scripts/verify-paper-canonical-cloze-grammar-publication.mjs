#!/usr/bin/env node

import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { compileCanonicalPaper } from '../shared/paper-canonical/compiler.mjs'
import { consumerContractRefs } from '../shared/paper-canonical/consumers.mjs'
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

const supplemented = compileCanonicalPaper({ ...fixture.request, supplements: { analysis: { answer: 'forged' }, teacherNotes: ['ignored'] } })
assert.equal(supplemented.disposition, 'ready')
assert.deepEqual(supplemented.artifacts.canonicalPaper, compilation.artifacts.canonicalPaper)
assert.deepEqual(supplemented.artifacts.normalizationReport, compilation.artifacts.normalizationReport)

function requestForSource(source) {
  const value = structuredClone(source)
  for (let pass = 0; pass < 3; pass++) {
    const byteLength = new TextEncoder().encode(JSON.stringify(value)).byteLength
    for (const observation of value.observations) if (observation.documentInputKey === 'canonical_mapping') observation.span.end = byteLength
  }
  const request = structuredClone(fixture.request)
  request.evidence.documents[0].bytes = new TextEncoder().encode(JSON.stringify(value))
  return request
}

function assertBlocked(mutator, expectedDisposition, expectedCode) {
  const source = structuredClone(fixture.source)
  mutator(source)
  const blocked = compileCanonicalPaper(requestForSource(source))
  assert.equal(blocked.disposition, expectedDisposition)
  assert.equal(Object.hasOwn(blocked.artifacts, 'canonicalPaper'), false)
  assert.equal(Object.hasOwn(blocked.artifacts.normalizationReport, 'semanticDigest'), false)
  assert.equal(blocked.artifacts.normalizationReport.diagnostics.some((diagnostic) => diagnostic.code === expectedCode), true)
  return blocked
}

const clozeSource = (source) => source.groups.find((group) => group.family === 'cloze')
const grammarSource = (source) => source.groups.find((group) => group.family === 'grammar-fill')
assertBlocked((source) => {
  const inline = clozeSource(source).content.blocks[0].inlines.find((candidate) => candidate.kind === 'blank_ref')
  inline.kind = 'text'
  inline.text = '__41__'
  delete inline.blankId
}, 'needs_review', 'REFERENCE_MARKER_AMBIGUOUS')
assertBlocked((source) => clozeSource(source).blankIds.push(clozeSource(source).blankIds[0]), 'needs_review', 'GROUP_MEMBER_DUPLICATE')
assertBlocked((source) => {
  const group = grammarSource(source)
  const blank = group.content.blocks[0].inlines.find((inline) => inline.kind === 'blank_ref')
  group.content.blocks[0].inlines = group.content.blocks[0].inlines.filter((inline) => inline !== blank)
}, 'needs_review', 'REFERENCE_BLANK_OCCURRENCE')
assertBlocked((source) => {
  const assertion = source.assertions.find((candidate) => candidate.questionId === 'q-2026-i-041')
  source.assertions.push({ ...assertion, assertionId: 'answer:q-2026-i-041:conflict', answer: 'A' })
}, 'answer_conflict', 'OFFICIAL_ANSWER_CONFLICT')

const blockedForMutation = assertBlocked((source) => grammarSource(source).blankIds.pop(), 'needs_review', 'REFERENCE_BLANK_CARDINALITY')
const noMutationRoot = path.join(mkdtempSync(path.join(tmpdir(), 'eqb-canonical-blocked-')), 'publication')
const noMutationDb = new DatabaseSync(':memory:')
try {
  assert.throws(
    () => publishCanonicalPaperPublication({
      rootDir: noMutationRoot,
      db: noMutationDb,
      compilation: blockedForMutation,
      sourceAssetVersion: 1,
      sourceAsset: fixture.sourceAsset,
    }),
    { code: 'CANONICAL_PUBLICATION_BLOCKED' },
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
    compilation,
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
