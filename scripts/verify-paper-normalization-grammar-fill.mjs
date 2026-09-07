#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { normalizePaperGroup } from '../shared/paper-normalization/normalizePaperGroup.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const proofAssets = [
  {
    paperId: 'paper-2026-i',
    sha256: 'fe7feb2cc9554b00bbab96a7d4fe5e499513c564c28e6c314e0373e29b2ca7bf',
    sourceFingerprint: 'fb1ed673f57709614723d8e19ed3574dfbe96446d24da3e623d3459d73acba2f',
    semanticDigest: 'f7653d34f1f75b614530d994c1d644a73068578e0b77b36ef57693a5a9842096',
  },
  {
    paperId: 'paper-960d0f8d',
    sha256: '2578eb70e069c6d39a6d92bbc5254a8c23ed08b152287c2c80167d2121df2a14',
    sourceFingerprint: 'b57572a1088aedf6c28a81abdd0b4a24e5361cfe0dbf25d998974bf3fefc16b8',
    semanticDigest: 'c6f980e52e63c0a94b3a8dae52a90a8865e0504efd55de0d5b61d3f888cb8b86',
  },
]

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

function loadProofInput({ paperId, sha256 }) {
  const relativePath = `app/public/paper-assets/${paperId}/latest/paper-asset.json`
  const buffer = readFileSync(path.join(rootDir, relativePath))
  assert.equal(
    createHash('sha256').update(buffer).digest('hex'),
    sha256,
    `${relativePath} must remain the planned proof asset`,
  )
  const asset = JSON.parse(buffer.toString('utf8'))
  const group = Object.values(asset.content.groups).find(
    ({ groupType }) => groupType === 'grammarFill',
  )
  assert.ok(group, `${paperId} must contain a grammarFill group`)
  return {
    paperId: asset.paper.paperId,
    sourceAssetVersion: asset.paper.assetVersion,
    group,
    questions: Object.fromEntries(
      group.questionIds.map((questionId) => [
        questionId,
        asset.content.questions[questionId],
      ]),
    ),
    blanks: Object.fromEntries(
      group.blankIds.map((blankId) => [blankId, asset.content.blanks[blankId]]),
    ),
  }
}

function makeGrammarInput(options = {}) {
  const {
    text = 'Before __56__ (hold), during 2026, after.',
    markerPrompt = 'hold',
  } = options
  const blankPrompt = Object.hasOwn(options, 'blankPrompt')
    ? options.blankPrompt
    : markerPrompt
  const blank = {
    blankId: 'blank-grammar-056',
    groupId: 'group-grammar',
    questionId: 'q-grammar-056',
  }
  if (blankPrompt !== undefined) blank.prompt = blankPrompt
  return {
    paperId: 'paper-grammar',
    sourceAssetVersion: 1,
    group: {
      groupId: 'group-grammar',
      groupType: 'grammarFill',
      title: 'Grammar fill',
      questionIds: ['q-grammar-056'],
      blankIds: ['blank-grammar-056'],
      passage: {
        paragraphs: [{ paragraphId: 'para-grammar', text }],
      },
    },
    questions: {
      'q-grammar-056': {
        questionId: 'q-grammar-056',
        questionNo: 56,
        groupId: 'group-grammar',
        stem: '56',
        blankId: 'blank-grammar-056',
      },
    },
    blanks: { 'blank-grammar-056': blank },
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

function blankNodes(result) {
  return result.group.paragraphs
    .flatMap(({ nodes }) => nodes)
    .filter(({ type }) => type === 'blank')
}

function visibleSourceText(result) {
  return result.group.paragraphs
    .flatMap(({ nodes }) => nodes)
    .filter(({ type }) => type === 'text')
    .map(({ text }) => text)
    .join('')
}

const realResults = new Map()
for (const proof of proofAssets) {
  const input = loadProofInput(proof)
  const frozenInput = deepFreeze(clone(input))
  const bytesBefore = JSON.stringify(frozenInput)
  const result = normalizePaperGroup(frozenInput)
  const repeated = normalizePaperGroup(frozenInput)

  assert.equal(result.status, 'ready', `${proof.paperId} grammarFill must normalize`)
  assert.deepEqual(repeated, result)
  assert.equal(JSON.stringify(frozenInput), bytesBefore)
  assert.equal(result.sourceFingerprint, proof.sourceFingerprint)
  assert.equal(result.semanticDigest, proof.semanticDigest)
  assert.equal(result.group.schemaVersion, 'canonical-paper-group-v1')
  assert.equal(result.group.groupType, 'grammarFill')
  assert.equal(blankNodes(result).length, 10)
  assert.deepEqual(
    result.group.questions.map(({ questionId }) => questionId),
    input.group.questionIds,
  )
  assert.deepEqual(
    result.group.questions.map(({ blankId }) => blankId),
    input.group.blankIds,
  )
  assert.ok(result.group.questions.every(({ stem }) => stem === null))
  assert.deepEqual(
    result.group.paragraphs.map(({ paragraphId }) => paragraphId),
    input.group.passage.paragraphs.map(({ paragraphId }) => paragraphId),
  )
  assert.deepEqual(
    Object.keys(result.sourceMap.questions),
    input.group.questionIds,
  )
  assert.deepEqual(Object.keys(result.sourceMap.blanks), input.group.blankIds)

  for (const [paragraphIndex, paragraph] of result.group.paragraphs.entries()) {
    const sourceText = input.group.passage.paragraphs[paragraphIndex].text
    let cursor = 0
    for (const node of paragraph.nodes) {
      assert.equal(node.sourceSpan.start, cursor)
      if (node.type === 'text') {
        assert.equal(
          node.text,
          sourceText.slice(node.sourceSpan.start, node.sourceSpan.end),
          `${proof.paperId} prose must remain byte-for-byte equal outside markers`,
        )
      }
      cursor = node.sourceSpan.end
    }
    assert.equal(cursor, paragraph.sourceSpan.end)
  }

  const reorderedInput = {
    ...input,
    questions: Object.fromEntries(Object.entries(input.questions).reverse()),
    blanks: Object.fromEntries(Object.entries(input.blanks).reverse()),
  }
  const reordered = normalizePaperGroup(reorderedInput)
  assert.equal(reordered.status, 'ready')
  assert.equal(reordered.sourceFingerprint, result.sourceFingerprint)
  assert.equal(reordered.semanticDigest, result.semanticDigest)
  realResults.set(proof.paperId, { input, result })
}

const dialectA = realResults.get('paper-2026-i').result
const dialectB = realResults.get('paper-960d0f8d').result
for (const result of [dialectA, dialectB]) {
  for (const node of blankNodes(result)) {
    assert.deepEqual(Object.keys(node).sort(), [
      'blankId',
      'hint',
      'questionId',
      'sourceSpan',
      'type',
    ])
  }
}
assert.equal(blankNodes(dialectA)[0].hint, 'hold')
assert.equal(blankNodes(dialectA)[2].hint, null)
assert.equal(blankNodes(dialectB)[0].hint, null)
assert.equal(blankNodes(dialectB)[1].hint, 'absorb')

const dialectBSource = realResults
  .get('paper-960d0f8d')
  .input.group.passage.paragraphs.map(({ text }) => text)
  .join('')
const dialectBVisible = visibleSourceText(dialectB)
for (const protectedText of ['2026', '25-30g', '800g', '3-5g', '30g', '10g']) {
  assert.equal(
    dialectBVisible.includes(protectedText),
    true,
    `${protectedText} and its prose context must remain text`,
  )
  assert.equal(
    dialectBSource.includes(protectedText),
    true,
    `${protectedText} must be grounded in the real proof source`,
  )
}

for (const [input, expectedHint] of [
  [makeGrammarInput(), 'hold'],
  [makeGrammarInput({ blankPrompt: undefined }), 'hold'],
  [makeGrammarInput({ text: 'Before __56__, after.', markerPrompt: undefined, blankPrompt: 'hold' }), 'hold'],
  [makeGrammarInput({ text: 'Before __56__, after.', markerPrompt: undefined, blankPrompt: undefined }), null],
]) {
  const result = normalizePaperGroup(input)
  assert.equal(result.status, 'ready')
  assert.equal(blankNodes(result)[0].hint, expectedHint)
}
assertNeedsReview(makeGrammarInput({ blankPrompt: 'keep' }), 'HINT_CONFLICT')

assertNeedsReview(
  makeGrammarInput({ text: 'No semantic marker; 2026, 25-30g, and 800g stay prose.' }),
  'MISSING_MARKER',
)
assertNeedsReview(
  makeGrammarInput({ text: 'First __56__, then __56__.' }),
  'DUPLICATE_MARKER',
)
assertNeedsReview(
  makeGrammarInput({ text: 'First __56__, then __57__.' }),
  'MARKER_COUNT_MISMATCH',
)
assertNeedsReview(
  makeGrammarInput({ text: 'Before __57__, after.' }),
  'MARKER_NUMBER_MISMATCH',
)

const duplicateQuestionNo = makeGrammarInput()
duplicateQuestionNo.group.questionIds.push('q-grammar-057')
duplicateQuestionNo.group.blankIds.push('blank-grammar-057')
duplicateQuestionNo.group.passage.paragraphs[0].text = 'First __56__, then __57__.'
duplicateQuestionNo.questions['q-grammar-057'] = {
  questionId: 'q-grammar-057',
  questionNo: 56,
  groupId: 'group-grammar',
  stem: '56',
  blankId: 'blank-grammar-057',
}
duplicateQuestionNo.blanks['blank-grammar-057'] = {
  blankId: 'blank-grammar-057',
  groupId: 'group-grammar',
  questionId: 'q-grammar-057',
}
assertNeedsReview(duplicateQuestionNo, 'DUPLICATE_QUESTION_NO')

assertNeedsReview(
  makeGrammarInput({
    blankPrompt: undefined,
    text: 'Before __56__ (57._____), after.',
  }),
  'OVERLAPPING_SOURCE_SPAN',
)

const blankIdConflict = makeGrammarInput()
blankIdConflict.questions['q-grammar-056'].blankId = 'blank-wrong'
assertNeedsReview(blankIdConflict, 'BLANK_ID_CONFLICT')

for (const malformed of [
  'Before _____, after.',
  'Before 56.____, after.',
  'Before 56.______, after.',
  'Before __056__, after.',
  'Before __56__  (hold), after.',
  'Before ref56._____, after.',
  'Before 56._____kg, after.',
  'Before 56._____(hold)kg, after.',
  'Before ref__56__, after.',
  'Before __56__kg, after.',
  'Before 56._____ (hold), after.',
  'Before __56__\t(hold), after.',
  'Before __56__\n(hold), after.',
  'Before 56._____\t(hold), after.',
  'Before 56._____\n(hold), after.',
]) {
  assertNeedsReview(makeGrammarInput({ text: malformed }), 'UNSUPPORTED_MARKER')
}
assertNeedsReview(
  makeGrammarInput({ text: 'Before 156._____, after.' }),
  'MARKER_NUMBER_MISMATCH',
)

const labelDialect = normalizePaperGroup(
  makeGrammarInput({
    text: 'In 2026, use 56._____(hold), then keep 25-30g and 800g.',
  }),
)
assert.equal(labelDialect.status, 'ready')
assert.equal(blankNodes(labelDialect)[0].hint, 'hold')
assert.equal(
  visibleSourceText(labelDialect),
  'In 2026, use , then keep 25-30g and 800g.',
)

console.log('PASS paper normalization grammarFill: real dialects and fail-closed matrix')
