#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import {
  canonicalAuthorityRef,
  readingOptionFigureAuthorityRef,
  resolveCanonicalAuthority,
} from '../shared/paper-canonical/authority.mjs'
import {
  compileCanonicalPaper,
  compileConfirmedReadingOptionFigurePaper,
} from '../shared/paper-canonical/compiler.mjs'
import {
  consumerContractRefs,
  readingOptionFigureConsumerContractRefs,
  resolveConsumerContract,
} from '../shared/paper-canonical/consumers.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { translateReadingOptionFigureLayout } from '../shared/paper-canonical/readingOptionFigureLayout.mjs'
import { validateReadingContract } from '../shared/paper-canonical/reading.mjs'
import { digestJson, sha256, stableStringify } from '../shared/paper-canonical/stable.mjs'
import {
  admitCanonicalPaperImport,
  createFileSystemCanonicalPublicationStore,
  loadCanonicalOnlyConsumers,
  publishCanonicalPaperPublication,
  sealCanonicalPublication,
} from '../server/paper-canonical/publication.mjs'
import {
  admitLiveConfirmedReadingOptionFigureImport,
  isLiveConfirmedReadingOptionFigureAdmission,
} from '../server/paper-canonical/readingOptionFigureCanonicalRequest.mjs'
import { makeReadyCanonicalFixture } from '../test-fixtures/paper-canonical/foundationFixture.mjs'
import {
  makeReadingOptionFigureFixture,
  readingOptionFigureFixtureOracle,
  refreshReadingOptionFigureFixture,
} from '../test-fixtures/paper-canonical/readingOptionFigureFixture.mjs'
import nck1V13 from '../standards/paper-canonical/profiles/nck1-v13.json' with { type: 'json' }
import zhejiangV11 from '../standards/paper-canonical/profiles/zhejiang-legacy-v11.json' with { type: 'json' }
import nationalV3 from '../standards/paper-canonical/profiles/national-legacy-v3.json' with { type: 'json' }
import readingV1 from '../standards/paper-canonical/families/reading-v1.json' with { type: 'json' }

function diagnostics(compilation) {
  return compilation.artifacts.normalizationReport.diagnostics
}

function assertBlocked(compilation, codes = []) {
  assert.notEqual(compilation.disposition, 'ready')
  assert.equal(Object.hasOwn(compilation.artifacts, 'canonicalPaper'), false)
  if (codes.length > 0) {
    assert.equal(
      diagnostics(compilation).some((item) => codes.includes(item.code)),
      true,
      stableStringify(diagnostics(compilation)),
    )
  }
}

function mutateAndCompile(mutator, selectionMutator = null) {
  const fixture = makeReadingOptionFigureFixture()
  mutator(fixture)
  refreshReadingOptionFigureFixture(fixture)
  if (selectionMutator) selectionMutator(fixture.confirmedSelection)
  return compileConfirmedReadingOptionFigurePaper(
    fixture.request,
    fixture.confirmedSelection,
  )
}

function readingGroupFromFixture(fixture) {
  return fixture.source.groups.find(
    (group) => group.groupId === readingOptionFigureFixtureOracle.groupId,
  )
}

function contractIssues(mutator) {
  const fixture = makeReadingOptionFigureFixture()
  const group = structuredClone(readingGroupFromFixture(fixture))
  mutator(group)
  return validateReadingContract({
    familyVersion: '2',
    questionIds: group.questionIds,
    blankIds: group.blankIds,
    content: group.content,
    media: group.media,
    variant: group.variant,
    assertions: fixture.source.assertions,
  })
}

function assertContractRejected(mutator, expectedCode) {
  const issues = contractIssues(mutator)
  assert.equal(
    issues.some((item) => item.code === expectedCode),
    true,
    stableStringify(issues),
  )
}

function refreshReadyCompilationSemanticDigests(compilation, group) {
  const {
    sourceMap: _sourceMap,
    sourceFingerprint: _sourceFingerprint,
    semanticDigest: _semanticDigest,
    ...semanticGroup
  } = group
  group.semanticDigest = digestJson(semanticGroup)
  const report = compilation.artifacts.normalizationReport
  report.semanticDigest = digestJson({
    groups: compilation.artifacts.canonicalPaper.questionGroups.map(
      (candidate) => candidate.semanticDigest,
    ),
    reviewDecisionDigest: digestJson(report.reviewDecisions),
    inactiveSourceClosureDigests: report.inactiveSourceClosures.map(
      (closure) => closure.closureDigest,
    ),
  })
}

function assertLiveSealRejected({ compilation, sourceAsset, proof }) {
  assert.equal(isLiveConfirmedReadingOptionFigureAdmission({
    proof,
    compilation,
    sourceAsset,
  }), false)
  assert.throws(() => sealCanonicalPublication({
    compilation,
    sourceAssetVersion: 1,
    sourceAsset,
    readingOptionFigureConfirmationProof: proof,
  }), (error) => error?.code === 'CANONICAL_PUBLICATION_AUTHORITY_RETIRED')
}

assert.equal(canonicalAuthorityRef.manifestVersion, '36')
assert.equal(readingOptionFigureAuthorityRef.manifestVersion, '46')
assert.equal(
  canonicalAuthorityRef.manifestDigest,
  'sha256:380824bab5f66a26bd06a65f071f9e798710bc9e456e6d4796ecca425de451ca',
)
assert.deepEqual(consumerContractRefs, {
  screen: {
    id: 'screen',
    version: '37',
    digest: 'sha256:e29aa0853f5ed84609ee8cfd8a33a89f8c58889a492087f97bc597d343657f24',
  },
  print_pdf: {
    id: 'print_pdf',
    version: '38',
    digest: 'sha256:08c52977a7c8ee21c39f2d0b3532fff00c29f9b941d128212e884dfa21b022f3',
  },
})
const successorClosure = resolveCanonicalAuthority(readingOptionFigureAuthorityRef).closure
assert.equal(successorClosure.families.get('reading').version, '2')
assert.equal(
  digestJson(readingV1),
  'sha256:4b4837721e3025531ca0df8f98c73c80fa39cdd24918b632956ea6bf1dc18b67',
)
function profileWithoutReadingSuccessor(profile, predecessor) {
  const normalized = structuredClone(profile)
  normalized.version = predecessor.version
  normalized.title = predecessor.title
  for (const part of normalized.parts) {
    for (const section of part.sections) {
      for (const slot of section.slots) {
        if (slot.familyContractRef?.id === 'reading') slot.familyContractRef.version = '1'
      }
    }
  }
  return normalized
}
for (const [profileId, predecessor] of [
  ['nck1', nck1V13],
  ['zhejiang-legacy', zhejiangV11],
  ['national-legacy', nationalV3],
]) {
  assert.deepEqual(
    profileWithoutReadingSuccessor(successorClosure.profiles.get(profileId), predecessor),
    predecessor,
  )
}
for (const profile of successorClosure.profiles.values()) {
  const readingSlots = profile.parts.flatMap((part) => part.sections)
    .flatMap((section) => section.slots)
    .filter((slot) => slot.familyContractRef?.id === 'reading')
  assert.equal(readingSlots.length > 0, true)
  assert.equal(readingSlots.every((slot) => slot.familyContractRef.version === '2'), true)
}
for (const ref of Object.values(readingOptionFigureConsumerContractRefs)) {
  const resolved = resolveConsumerContract(ref)
  assert.equal(resolved.ok, true)
  assert.equal(resolved.contract.authorityManifestDigest, readingOptionFigureAuthorityRef.manifestDigest)
  assert.equal(resolved.contract.families.find((family) => family.familyContractId === 'reading').version, '2')
}

const fixture = makeReadingOptionFigureFixture()
const ordinary = compileCanonicalPaper(fixture.request)
assertBlocked(ordinary, ['AUTHORITY_RETIRED'])
const compilation = compileConfirmedReadingOptionFigurePaper(
  fixture.request,
  fixture.confirmedSelection,
)
assert.equal(compilation.disposition, 'ready')
const canonicalGroup = compilation.artifacts.canonicalPaper.questionGroups.find(
  (group) => group.identity.groupId === readingOptionFigureFixtureOracle.groupId,
)
const canonicalQuestion = canonicalGroup.variant.questions[0]
const canonicalOptions = canonicalGroup.variant.choiceOwnership.sets[0].options
assert.equal(canonicalOptions.map((option) => option.label).join(''), 'ABCD')
assert.deepEqual(canonicalOptions.map((option) => option.optionId), readingOptionFigureFixtureOracle.optionIds)
assert.deepEqual(canonicalOptions.map((option) => option.figure.mediaId), readingOptionFigureFixtureOracle.mediaIds)
assert.equal(canonicalQuestion.correctOptionId, readingOptionFigureFixtureOracle.optionIds[0])
for (const [index, option] of canonicalOptions.entries()) {
  const optionEntry = canonicalGroup.sourceMap.entries.find(
    (entry) => entry.target.kind === 'option' && entry.target.id === option.optionId,
  )
  const mediaEntry = canonicalGroup.sourceMap.entries.find(
    (entry) => entry.target.kind === 'media' && entry.target.id === option.figure.mediaId,
  )
  assert.equal(optionEntry.sourceSpanRefs.length, 1)
  assert.deepEqual(mediaEntry.sourceSpanRefs, optionEntry.sourceSpanRefs)
  assert.equal(
    canonicalGroup.sourceMap.entries.some((entry) =>
      entry.target.kind === 'content_node'
      && entry.target.id.includes(`${option.optionId}:figure`)),
    false,
  )
  assert.equal(canonicalGroup.media[index].sha256, fixture.selectedArtifacts[index].sha256)
}

const liveFixture = makeReadingOptionFigureFixture()
const liveAdmission = admitLiveConfirmedReadingOptionFigureImport({
  request: liveFixture.request,
  candidatePackage: liveFixture.candidatePackage,
  teacherConfirmation: liveFixture.teacherConfirmation,
  sourceAsset: liveFixture.sourceAsset,
})
assert.equal(liveAdmission.compilation.disposition, 'ready')
assert.equal(isLiveConfirmedReadingOptionFigureAdmission({
  proof: liveAdmission.proof,
  compilation: liveAdmission.compilation,
  sourceAsset: liveAdmission.sourceAsset,
}), true)
const exactCompilationClone = structuredClone(liveAdmission.compilation)
assert.equal(isLiveConfirmedReadingOptionFigureAdmission({
  proof: liveAdmission.proof,
  compilation: exactCompilationClone,
  sourceAsset: liveAdmission.sourceAsset,
}), true)
assert.equal(sealCanonicalPublication({
  compilation: exactCompilationClone,
  sourceAssetVersion: 1,
  sourceAsset: liveAdmission.sourceAsset,
  readingOptionFigureConfirmationProof: liveAdmission.proof,
}).manifest.schemaVersion, 'canonical-paper-publication-v46')

assert.throws(() => {
  liveAdmission.proof.mutated = true
}, TypeError)
assertLiveSealRejected({
  compilation: exactCompilationClone,
  sourceAsset: liveAdmission.sourceAsset,
  proof: Object.freeze({}),
})
const changedSourceAsset = new Uint8Array(liveAdmission.sourceAsset)
changedSourceAsset[changedSourceAsset.byteLength - 1] ^= 1
assertLiveSealRejected({
  compilation: exactCompilationClone,
  sourceAsset: changedSourceAsset,
  proof: liveAdmission.proof,
})

const changedConfirmationFixture = makeReadingOptionFigureFixture()
changedConfirmationFixture.teacherConfirmation.decisions[0].selectedCandidateDigest =
  changedConfirmationFixture.candidatePackage.candidates[1].candidateDigest
assert.throws(() => admitLiveConfirmedReadingOptionFigureImport({
  request: changedConfirmationFixture.request,
  candidatePackage: changedConfirmationFixture.candidatePackage,
  teacherConfirmation: changedConfirmationFixture.teacherConfirmation,
  sourceAsset: changedConfirmationFixture.sourceAsset,
}), /confirm|selection/iu)

const mutatedCanonicalGroup = liveAdmission.compilation.artifacts.canonicalPaper.questionGroups.find(
  (group) => group.identity.groupId === readingOptionFigureFixtureOracle.groupId,
)
const mutatedOptions = mutatedCanonicalGroup.variant.choiceOwnership.sets[0].options
const firstMediaId = mutatedOptions[0].figure.mediaId
mutatedOptions[0].figure.mediaId = mutatedOptions[3].figure.mediaId
mutatedOptions[3].figure.mediaId = firstMediaId
refreshReadyCompilationSemanticDigests(
  liveAdmission.compilation,
  mutatedCanonicalGroup,
)
assertLiveSealRejected({
  compilation: liveAdmission.compilation,
  sourceAsset: liveAdmission.sourceAsset,
  proof: liveAdmission.proof,
})

const admission = admitCanonicalPaperImport({
  request: fixture.request,
  sourceAssetVersion: 1,
  sourceAsset: fixture.sourceAsset,
  visualConfirmation: {
    candidatePackage: fixture.candidatePackage,
    teacherConfirmation: fixture.teacherConfirmation,
  },
})
assert.equal(admission.ok, true)
const publicationRoot = mkdtempSync(path.join(tmpdir(), 'eqb-reading-option-figure-'))
const publicationDb = new DatabaseSync(path.join(publicationRoot, 'publication.sqlite'))
try {
  const published = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db: publicationDb,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
    visualConfirmation: {
      candidatePackage: fixture.candidatePackage,
      teacherConfirmation: fixture.teacherConfirmation,
    },
  })
  assert.equal(published.status, 'published')
  assert.deepEqual(Object.keys(published.consumers), ['screen', 'print_pdf'])
  const reopened = loadCanonicalOnlyConsumers({
    ref: {
      paperId: published.paperId,
      versionName: published.versionName,
      sourceAssetVersion: 1,
      publicationDigest: published.publicationDigest,
    },
    store: createFileSystemCanonicalPublicationStore({
      rootDir: publicationRoot,
      db: publicationDb,
    }),
  })
  assert.deepEqual(Object.keys(reopened), ['screen', 'print_pdf'])
  assert.deepEqual(
    reopened.screen.consumerContractRef,
    readingOptionFigureConsumerContractRefs.screen,
  )
  const idempotent = publishCanonicalPaperPublication({
    rootDir: publicationRoot,
    db: publicationDb,
    request: fixture.request,
    sourceAssetVersion: 1,
    sourceAsset: fixture.sourceAsset,
    visualConfirmation: {
      candidatePackage: fixture.candidatePackage,
      teacherConfirmation: fixture.teacherConfirmation,
    },
  })
  assert.equal(idempotent.status, 'idempotent')
} finally {
  publicationDb.close()
  rmSync(publicationRoot, { recursive: true, force: true })
}
for (const [consumerId, consumption] of Object.entries(admission.consumers)) {
  assert.deepEqual(
    consumption.consumerContractRef,
    readingOptionFigureConsumerContractRefs[consumerId],
  )
  const selection = consumption.selections.find(
    (candidate) => candidate.familyContractId === 'reading',
  )
  assert.equal(selection.projectedOccurrenceDigests.length, 4)
  const projected = projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId: readingOptionFigureFixtureOracle.groupId,
  })
  const question = projected.questions[0]
  assert.equal(question.optionMode, 'figure')
  assert.equal(
    Object.hasOwn(question, 'correctOptionId'),
    consumerId === 'print_pdf',
  )
  if (consumerId === 'print_pdf') {
    assert.equal(
      question.correctOptionId,
      readingOptionFigureFixtureOracle.optionIds[0],
    )
  }
  assert.deepEqual(question.options.map((option) => option.optionId), readingOptionFigureFixtureOracle.optionIds)
  assert.deepEqual(question.options.map((option) => option.label), ['A', 'B', 'C', 'D'])
  for (const [index, option] of question.options.entries()) {
    assert.deepEqual(Object.keys(option).sort(), ['figure', 'kind', 'label', 'optionId'])
    assert.equal(option.kind, 'figure')
    assert.equal(option.figure.mediaId, readingOptionFigureFixtureOracle.mediaIds[index])
    assert.equal(option.figure.mediaArtifact.encodedBytes, fixture.selectedArtifacts[index].encodedBytes)
    assert.equal(option.figure.mediaArtifact.sha256, sha256(Uint8Array.from(Buffer.from(option.figure.mediaArtifact.encodedBytes, 'base64'))))
    assert.deepEqual(option.figure.accessibility, {
      kind: 'neutral_option_identity',
      optionLabel: option.label,
    })
  }
  const serialized = stableStringify(question)
  const forbiddenFields = ['sourceCrop', 'prompt', 'candidate', 'modelMetadata']
  if (consumerId === 'screen') forbiddenFields.push('correctOptionId')
  for (const forbidden of forbiddenFields) {
    assert.equal(serialized.includes(forbidden), false)
  }
  if (consumerId === 'print_pdf') {
    assert.throws(() => translateReadingOptionFigureLayout({
      consumerId,
      consumption,
      question: {
        ...structuredClone(question),
        correctOptionId: 'option:not-in-set',
      },
    }), /incompatible/u)
  } else {
    assert.throws(() => translateReadingOptionFigureLayout({
      consumerId,
      consumption,
      question: {
        ...structuredClone(question),
        correctOptionId: readingOptionFigureFixtureOracle.optionIds[0],
      },
    }), /incompatible/u)
  }
}

const secondFixture = makeReadingOptionFigureFixture()
const secondCompilation = compileConfirmedReadingOptionFigurePaper(
  secondFixture.request,
  secondFixture.confirmedSelection,
)
assert.equal(
  digestJson(secondCompilation.artifacts.canonicalPaper),
  digestJson(compilation.artifacts.canonicalPaper),
)
assert.equal(secondFixture.confirmedSelection.confirmationDigest, fixture.confirmedSelection.confirmationDigest)

const legacyFixture = makeReadyCanonicalFixture()
const legacyCompilation = compileCanonicalPaper(legacyFixture.request)
assert.equal(legacyCompilation.disposition, 'ready')
assert.equal(
  digestJson(legacyCompilation.artifacts.canonicalPaper),
  'sha256:435525747864b69e13a4cbe7e1fe9b40dc33e081c3c5e3f24c0d24496e499e07',
)

assertContractRejected((group) => {
  group.variant.choiceOwnership.sets[0].options[1] = {
    optionId: group.variant.choiceOwnership.sets[0].options[1].optionId,
    label: 'B',
    content: [{ kind: 'text', nodeId: 'text:mixed:B', text: 'literal' }],
  }
}, 'READING_OPTION_MODE_MIXED')
assertContractRejected((group) => {
  group.variant.choiceOwnership.sets[0].options = group.variant.choiceOwnership.sets[0].options.slice(0, 3)
}, 'READING_OPTION_SET_INVALID')
assertContractRejected((group) => {
  const options = group.variant.choiceOwnership.sets[0].options
  options.push({ ...structuredClone(options[3]), optionId: 'option:extra', label: 'E' })
}, 'READING_OPTION_SET_INVALID')
assertContractRejected((group) => {
  group.variant.choiceOwnership.sets[0].options[0].optionId = ''
}, 'READING_OPTION_INVALID')
assertContractRejected((group) => {
  const options = group.variant.choiceOwnership.sets[0].options
  options[1].optionId = options[0].optionId
}, 'READING_OPTION_SET_INVALID')
assertContractRejected((group) => {
  group.media[0].mediaId = ''
  group.variant.choiceOwnership.sets[0].options[0].figure.mediaId = ''
}, 'READING_MEDIA_ID_INVALID')
assertContractRejected((group) => {
  const set = group.variant.choiceOwnership.sets[0]
  set.options = set.options.map((option, index) => ({
    optionId: option.optionId,
    label: option.label,
    content: [{ kind: 'text', nodeId: `text:empty:${index}`, text: '   ' }],
  }))
}, 'READING_OPTION_TEXT_EMPTY')
assertContractRejected((group) => {
  const set = group.variant.choiceOwnership.sets[0]
  set.options = set.options.map((option, index) => ({
    optionId: option.optionId,
    label: option.label,
    content: [{
      kind: 'text',
      nodeId: `text:placeholder:${index}`,
      text: index === 0 ? ' [Fig.] ' : 'literal',
    }],
  }))
}, 'READING_OPTION_FIGURE_PLACEHOLDER_FORBIDDEN')
for (const extra of [
  ['caption', []],
  ['figures', [{ mediaId: 'media:extra' }]],
  ['content', [{ kind: 'text', nodeId: 'text:combined', text: 'combined' }]],
]) {
  assertContractRejected((group) => {
    group.variant.choiceOwnership.sets[0].options[0][extra[0]] = extra[1]
  }, 'READING_OPTION_INVALID')
}

assertBlocked(mutateAndCompile((changed) => {
  const group = readingGroupFromFixture(changed)
  group.variant.choiceOwnership.sets[0].options[1].figure.mediaId = group.media[0].mediaId
}), ['READING_MEDIA_PLACEMENT_INVALID', 'READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile((changed) => {
  const group = readingGroupFromFixture(changed)
  group.content.blocks.push({
    kind: 'figure',
    nodeId: 'figure:duplicate-option-owner',
    mediaId: group.media[0].mediaId,
    caption: [],
  })
}), ['READING_MEDIA_PLACEMENT_INVALID'])
assertBlocked(mutateAndCompile((changed) => {
  const group = readingGroupFromFixture(changed)
  group.variant.choiceOwnership.sets[0].options[0].figure.mediaId = 'media:absent'
}), ['READING_OPTION_FIGURE_INVALID', 'READING_MEDIA_PLACEMENT_INVALID', 'READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile((changed) => {
  readingGroupFromFixture(changed).media[0].mimeType = 'image/jpeg'
}), ['MEDIA_INVALID', 'READING_OPTION_FIGURE_INVALID', 'READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile((changed) => {
  readingGroupFromFixture(changed).media[0].pixelWidth = 2
}), ['MEDIA_INVALID', 'READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile((changed) => {
  const mediaDocument = changed.request.evidence.documents.find(
    (document) => document.inputKey === 'reading_option_figure_a',
  )
  mediaDocument.bytes = new Uint8Array(mediaDocument.bytes)
  mediaDocument.bytes[20] ^= 1
}), ['MEDIA_INVALID', 'READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile((changed) => {
  const group = readingGroupFromFixture(changed)
  group.sourceSpanRefsByTarget[`media:${group.media[0].mediaId}`] = [group.sourceSpanId]
}), ['READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile(() => {}, (selection) => {
  selection.confirmedSelections[0].owner.optionId = 'option:wrong-owner'
}), ['READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])
assertBlocked(mutateAndCompile(() => {}, (selection) => {
  selection.confirmedSelections[0].artifact.pixelWidth = 2
}), ['READING_OPTION_FIGURE_CONFIRMATION_MISMATCH'])

assertBlocked(mutateAndCompile((changed) => {
  const sourceGroup = readingGroupFromFixture(changed)
  const targetGroup = changed.source.groups.find(
    (group) => group.family === 'reading' && group.groupId !== sourceGroup.groupId,
  )
  targetGroup.media = [structuredClone(sourceGroup.media[0])]
  targetGroup.content.blocks.push({
    kind: 'figure',
    nodeId: 'figure:cross-group-owner',
    mediaId: sourceGroup.media[0].mediaId,
    caption: [],
  })
}), ['READING_MEDIA_CROSS_GROUP_DUPLICATE'])

for (const family of [
  'seven-choices',
  'cloze',
  'grammar-fill',
  'application-writing',
  'continuation-writing',
]) {
  const blocked = mutateAndCompile((changed) => {
    const group = changed.source.groups.find((candidate) => candidate.family === family)
    const ownership = group.variant.choiceOwnership
    if (ownership.ownership === 'shared_bank') {
      ownership.options[0].figure = { mediaId: 'media:forbidden' }
    } else if (ownership.ownership === 'per_question') {
      ownership.sets[0].options[0].figure = { mediaId: 'media:forbidden' }
    } else {
      ownership.options = [{
        optionId: `option:${family}:forbidden`,
        label: 'A',
        figure: { mediaId: 'media:forbidden' },
      }]
    }
  })
  assertBlocked(blocked, family === 'seven-choices' || family === 'cloze'
    ? ['FIGURE_OPTION_NON_READING_FORBIDDEN']
    : ['CHOICE_OWNERSHIP_SHAPE', 'GROUP_VARIANT_INVALID'])
}

const unresolvedFixture = makeReadingOptionFigureFixture()
unresolvedFixture.teacherConfirmation.decisions[0] = {
  observationId: unresolvedFixture.teacherConfirmation.decisions[0].observationId,
  owner: unresolvedFixture.teacherConfirmation.decisions[0].owner,
  disposition: 'unresolved',
  reason: 'identity is not exact',
}
const unresolvedAdmission = admitCanonicalPaperImport({
  request: unresolvedFixture.request,
  sourceAssetVersion: 1,
  sourceAsset: unresolvedFixture.sourceAsset,
  visualConfirmation: {
    candidatePackage: unresolvedFixture.candidatePackage,
    teacherConfirmation: unresolvedFixture.teacherConfirmation,
  },
})
assert.equal(unresolvedAdmission.ok, false)

function tamperedScreenConsumption(mutator, refreshOccurrenceDigests = false) {
  const consumption = structuredClone(admission.consumers.screen)
  const selection = consumption.selections.find((candidate) => candidate.familyContractId === 'reading')
  const occurrence = selection.projectedOccurrences.find(
    (candidate) => candidate.groupId === readingOptionFigureFixtureOracle.groupId,
  )
  mutator({ consumption, selection, occurrence })
  if (refreshOccurrenceDigests) {
    selection.projectedOccurrenceDigests = selection.projectedOccurrences.map((candidate) => ({
      groupId: candidate.groupId,
      digest: digestJson(candidate),
    }))
  }
  assert.throws(() => projectCanonicalConsumerGroup({
    consumption,
    familyContractId: 'reading',
    groupId: readingOptionFigureFixtureOracle.groupId,
  }), /integrity|media|mixes|ambiguous/u)
}

tamperedScreenConsumption(({ selection }) => {
  delete selection.projectedOccurrenceDigests
})
tamperedScreenConsumption(({ occurrence }) => {
  occurrence.questions[0].options[0].figure.mediaId = occurrence.questions[0].options[1].figure.mediaId
})
tamperedScreenConsumption(({ consumption }) => {
  consumption.mediaArtifacts[0].encodedBytes = consumption.mediaArtifacts[1].encodedBytes
}, true)
tamperedScreenConsumption(({ consumption }) => {
  consumption.mediaArtifacts.push(structuredClone(consumption.mediaArtifacts[0]))
}, true)
tamperedScreenConsumption(({ occurrence }) => {
  occurrence.questions[0].options[0] = {
    optionId: occurrence.questions[0].options[0].optionId,
    label: 'A',
    content: [{ kind: 'text', nodeId: 'text:projected-mixed', text: 'mixed' }],
  }
}, true)

console.log('PASS Reading Option Figure canonical contract')
