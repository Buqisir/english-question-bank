#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizePaperGroup } from '../shared/paper-normalization/normalizePaperGroup.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const proofAssetRelativePath =
  'app/public/paper-assets/paper-2026-i/latest/paper-asset.json'
const proofAssetPath = path.join(rootDir, proofAssetRelativePath)
const proofAssetBuffer = readFileSync(proofAssetPath)
const proofAssetSha256 = createHash('sha256').update(proofAssetBuffer).digest('hex')
const proofAsset = JSON.parse(proofAssetBuffer.toString('utf8'))
const proofGroupId = 'group-2026-i-cloze'
const proofGroup = proofAsset.content.groups[proofGroupId]
const declarationPath = path.join(
  rootDir,
  'shared/paper-normalization/normalizePaperGroup.d.ts',
)
const moduleDeclarationPath = path.join(
  rootDir,
  'shared/paper-normalization/normalizePaperGroup.d.mts',
)

assert.equal(
  proofAssetSha256,
  'fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
  `${proofAssetRelativePath} must remain the planned proof asset`,
)

const proofInput = {
  paperId: proofAsset.paper.paperId,
  sourceAssetVersion: proofAsset.paper.assetVersion,
  group: proofGroup,
  questions: Object.fromEntries(
    proofGroup.questionIds.map((questionId) => [
      questionId,
      proofAsset.content.questions[questionId],
    ]),
  ),
  blanks: Object.fromEntries(
    proofGroup.blankIds
      .filter((blankId) => proofAsset.content.blanks?.[blankId])
      .map((blankId) => [blankId, proofAsset.content.blanks[blankId]]),
  ),
}

function clone(value) {
  return structuredClone(value)
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function makeSingleQuestionInput(overrides = {}) {
  const question = {
    questionId: 'q-cloze-041',
    questionNo: 41,
    groupId: 'group-cloze',
    stem: '41',
    blankId: 'blank-cloze-041',
    options: [
      { label: 'A', text: 'kept A' },
      { label: 'B', text: 'kept B' },
    ],
    ...overrides.question,
  }
  const group = {
    groupId: 'group-cloze',
    groupType: 'cloze',
    title: 'Cloze',
    questionIds: ['q-cloze-041'],
    blankIds: ['blank-cloze-041'],
    passage: {
      paragraphs: [{ paragraphId: 'para-cloze', text: 'Before __41__ after 1941.' }],
    },
    ...overrides.group,
  }
  return {
    paperId: 'paper-test',
    sourceAssetVersion: 1,
    group,
    questions: { 'q-cloze-041': question, ...overrides.questions },
    blanks: overrides.blanks ?? {},
  }
}

function assertNeedsReview(input, expectedCode) {
  const result = normalizePaperGroup(input)
  assert.equal(result.status, 'needs_review')
  assert.ok(
    result.issues.some(({ code }) => code === expectedCode),
    `expected ${expectedCode}, received ${result.issues.map(({ code }) => code).join(', ')}`,
  )
}

const frozenProofInput = deepFreeze(clone(proofInput))
const proofBytesBefore = JSON.stringify(frozenProofInput)
const proofResult = normalizePaperGroup(frozenProofInput)
const repeatedProofResult = normalizePaperGroup(frozenProofInput)

assert.equal(proofResult.status, 'ready')
assert.deepEqual(repeatedProofResult, proofResult)
assert.equal(JSON.stringify(frozenProofInput), proofBytesBefore)
assert.equal(
  proofResult.sourceFingerprint,
  'e3b6838b5b34791f85044268d5fd4b3888b5ab89d796edf9728ef65d8d8bde41',
)
assert.match(proofResult.semanticDigest, /^[a-f0-9]{64}$/)
const reorderedProofInput = {
  ...proofInput,
  questions: Object.fromEntries(Object.entries(proofInput.questions).reverse()),
}
const reorderedProofResult = normalizePaperGroup(reorderedProofInput)
assert.equal(reorderedProofResult.status, 'ready')
assert.equal(reorderedProofResult.sourceFingerprint, proofResult.sourceFingerprint)
assert.equal(reorderedProofResult.semanticDigest, proofResult.semanticDigest)

const presentationVariantInput = clone(proofInput)
presentationVariantInput.questions['q-2026-i-041'].stem = ' 41 '
const presentationVariantResult = normalizePaperGroup(presentationVariantInput)
assert.equal(presentationVariantResult.status, 'ready')
assert.notEqual(presentationVariantResult.sourceFingerprint, proofResult.sourceFingerprint)
assert.equal(presentationVariantResult.semanticDigest, proofResult.semanticDigest)
assert.equal(proofResult.group.schemaVersion, 'canonical-paper-group-v1')
assert.equal(proofResult.group.groupId, proofGroupId)
assert.equal(proofResult.group.groupType, 'cloze')
assert.deepEqual(
  proofResult.group.questions.map(({ questionId }) => questionId),
  proofGroup.questionIds,
)
assert.deepEqual(
  proofResult.group.questions.map(({ blankId }) => blankId),
  proofGroup.blankIds,
)
assert.equal(proofResult.group.questions[0].stem, null)
assert.deepEqual(
  proofResult.group.questions[0].options,
  proofInput.questions['q-2026-i-041'].options,
)
assert.deepEqual(
  proofResult.group.questions.map(({ options }) => options),
  proofGroup.questionIds.map((questionId) => proofInput.questions[questionId].options),
)
assert.deepEqual(
  proofResult.group.paragraphs.map(({ paragraphId }) => paragraphId),
  proofGroup.passage.paragraphs.map(({ paragraphId }) => paragraphId),
)
assert.equal(
  proofResult.group.paragraphs
    .flatMap(({ nodes }) => nodes)
    .filter(({ type }) => type === 'blank').length,
  15,
)
assert.equal(
  proofResult.group.paragraphs
    .flatMap(({ nodes }) => nodes)
    .filter(({ type }) => type === 'text')
    .some(({ text }) => /_{2,}\d+_{2,}/.test(text)),
  false,
)
for (const [paragraphIndex, paragraph] of proofResult.group.paragraphs.entries()) {
  const sourceText = proofGroup.passage.paragraphs[paragraphIndex].text
  const canonicalProse = paragraph.nodes
    .filter(({ type }) => type === 'text')
    .map(({ text }) => text)
    .join('')
  assert.equal(canonicalProse, sourceText.replace(/(?:__\d+__|_____\d+_____)/g, ''))
}

for (const stem of ['1941', '41 years', 'Question 41 asks ...', '41. What ...']) {
  const input = makeSingleQuestionInput({ question: { stem } })
  const result = normalizePaperGroup(input)
  assert.equal(result.status, 'ready')
  assert.equal(result.group.questions[0].stem, stem)
}

const matchingBlankRecord = {
  blankId: 'blank-cloze-041',
  groupId: 'group-cloze',
  questionId: 'q-cloze-041',
}
assert.equal(
  normalizePaperGroup(
    makeSingleQuestionInput({
      blanks: { 'blank-cloze-041': matchingBlankRecord },
    }),
  ).status,
  'ready',
)
assertNeedsReview(
  makeSingleQuestionInput({
    blanks: {
      'blank-cloze-041': { ...matchingBlankRecord, questionId: 'q-cloze-wrong' },
    },
  }),
  'BLANK_ID_CONFLICT',
)

assertNeedsReview(
  makeSingleQuestionInput({
    group: {
      passage: { paragraphs: [{ paragraphId: 'para-cloze', text: 'No marker here.' }] },
    },
  }),
  'MISSING_MARKER',
)
assertNeedsReview(
  makeSingleQuestionInput({
    group: {
      passage: {
        paragraphs: [{ paragraphId: 'para-cloze', text: 'First __41__, again __41__.' }],
      },
    },
  }),
  'DUPLICATE_MARKER',
)
assertNeedsReview(
  makeSingleQuestionInput({
    group: {
      passage: { paragraphs: [{ paragraphId: 'para-cloze', text: 'Before __42__ after.' }] },
    },
  }),
  'MARKER_NUMBER_MISMATCH',
)
assertNeedsReview(
  makeSingleQuestionInput({
    question: { blankId: 'blank-cloze-wrong' },
  }),
  'BLANK_ID_CONFLICT',
)
assertNeedsReview(
  makeSingleQuestionInput({
    group: {
      passage: { paragraphs: [{ paragraphId: 'para-cloze', text: 'Before ___41___ after.' }] },
    },
  }),
  'UNSUPPORTED_MARKER',
)
for (const strayMarker of ['__x__', '_____', '__42']) {
  assertNeedsReview(
    makeSingleQuestionInput({
      group: {
        passage: {
          paragraphs: [
            {
              paragraphId: 'para-cloze',
              text: `Valid __41__, stray ${strayMarker}.`,
            },
          ],
        },
      },
    }),
    'UNSUPPORTED_MARKER',
  )
}
assertNeedsReview(
  makeSingleQuestionInput({
    group: {
      passage: { paragraphs: [{ paragraphId: 'para-cloze', text: 'Before __041__ after.' }] },
    },
  }),
  'UNSUPPORTED_MARKER',
)
assertNeedsReview(
  makeSingleQuestionInput({
    group: {
      passage: {
        paragraphs: [{ paragraphId: 'para-cloze', text: 'Before _____41_____42__ after.' }],
      },
    },
  }),
  'OVERLAPPING_SOURCE_SPAN',
)

const duplicateQuestionNoInput = makeSingleQuestionInput()
duplicateQuestionNoInput.group.questionIds.push('q-cloze-042')
duplicateQuestionNoInput.group.blankIds.push('blank-cloze-042')
duplicateQuestionNoInput.group.passage.paragraphs[0].text = 'First __41__, then __42__.'
duplicateQuestionNoInput.questions['q-cloze-042'] = {
  questionId: 'q-cloze-042',
  questionNo: 41,
  groupId: 'group-cloze',
  stem: '41',
  blankId: 'blank-cloze-042',
  options: [{ label: 'A', text: 'kept' }],
}
assertNeedsReview(duplicateQuestionNoInput, 'DUPLICATE_QUESTION_NO')

const reorderedMarkersInput = clone(duplicateQuestionNoInput)
reorderedMarkersInput.questions['q-cloze-042'].questionNo = 42
reorderedMarkersInput.questions['q-cloze-042'].stem = '42'
reorderedMarkersInput.group.passage.paragraphs[0].text = 'First __42__, then __41__.'
assertNeedsReview(reorderedMarkersInput, 'MARKER_NUMBER_MISMATCH')

assert.equal(
  normalizePaperGroup(
    makeSingleQuestionInput({
      group: {
        passage: {
          paragraphs: [{ paragraphId: 'para-cloze', text: 'Before _____41_____ after.' }],
        },
      },
    }),
  ).status,
  'ready',
)
assertNeedsReview(
  makeSingleQuestionInput({ question: { stem: null } }),
  'INVALID_QUESTION',
)
assertNeedsReview(
  makeSingleQuestionInput({
    questions: {
      'q-cloze-extra': {
        questionId: 'q-cloze-extra',
        questionNo: 99,
        groupId: 'group-cloze',
        stem: '99',
        blankId: 'blank-cloze-extra',
        options: [],
      },
    },
  }),
  'QUESTION_SLICE_MISMATCH',
)

const duplicateParagraphIdInput = clone(duplicateQuestionNoInput)
duplicateParagraphIdInput.questions['q-cloze-042'].questionNo = 42
duplicateParagraphIdInput.questions['q-cloze-042'].stem = '42'
duplicateParagraphIdInput.group.passage.paragraphs = [
  { paragraphId: 'para-cloze', text: 'First __41__.' },
  { paragraphId: 'para-cloze', text: 'Then __42__.' },
]
assertNeedsReview(duplicateParagraphIdInput, 'ANCHOR_UNRESOLVED')

assertNeedsReview(
  { ...makeSingleQuestionInput(), sourceAssetVersion: Number.NaN },
  'INVALID_INPUT',
)
const cyclicInput = makeSingleQuestionInput()
cyclicInput.group.self = cyclicInput.group
assertNeedsReview(cyclicInput, 'SOURCE_FINGERPRINT_UNRESOLVED')

const normalizeDeclaration = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
assert.equal(
  normalizeDeclaration(readFileSync(declarationPath, 'utf8')),
  normalizeDeclaration(readFileSync(moduleDeclarationPath, 'utf8')),
)

console.log('PASS paper normalization cloze: real proof asset and fail-closed matrix')
