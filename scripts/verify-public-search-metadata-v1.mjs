#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import Ajv from '../server/node_modules/ajv/dist/2020.js'

import { makeFixture } from './verify-nck1-source-materialization.mjs'
import {
  buildPublicSearchMetadataMessages,
  countPublicSourceWords,
  finalizePublicSearchMetadata,
  preparePublicSearchMetadataRequest,
  validatePublicSearchMetadata,
  validateAuthoredPublicSearchMetadata,
} from '../server/paper-import-ai/publicSearchMetadata.mjs'
import { ensureSearchMetadata } from './import-pipeline/search-metadata-check.mjs'
import { buildNck1CompatibilityPackage } from '../server/import-review/revisionProjection.mjs'
import { stableStringify } from '../shared/paper-canonical/stable.mjs'

const materialization = makeFixture()
const reading = materialization.groups.find((group) => group.slotId === 'reading.a')
reading.blocks = [{
  kind: 'framed_columns', blockId: 'frame:reading-a', source: reading.blocks[0].source,
  columns: [{ headingBlockId: 'heading:reading-a', blocks: [
    { kind: 'paragraph', blockId: 'heading:reading-a', role: 'body', content: [{ kind: 'text', text: 'Not prose' }], source: reading.blocks[0].source },
    ...reading.blocks,
  ] }],
}]
const sourceDigest = `sha256:${'a'.repeat(64)}`
const candidateDigest = `sha256:${'b'.repeat(64)}`
const binding = { materialization, sourceDigest, candidateDigest }
const prepared = preparePublicSearchMetadataRequest(binding)

const separatedRunBlock = [{ kind: 'paragraph', content: [
  { kind: 'text', text: 'was' }, { kind: 'blank_ref', blankId: 'blank:test' }, { kind: 'text', text: 'today' },
] }]
const independentlyCountedRuns = separatedRunBlock[0].content
  .filter(({ kind }) => kind === 'text')
  .reduce((count, { text }) => count + (text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length, 0)
assert.equal(independentlyCountedRuns, 2)
assert.equal(countPublicSourceWords(separatedRunBlock), independentlyCountedRuns,
  'a non-text inline boundary cannot merge adjacent source words')
assert.equal(countPublicSourceWords([{ kind: 'paragraph', content: [
  { kind: 'text', text: 'eco' }, { kind: 'text', text: 'friendly don' },
  { kind: 'text', text: "'t well-" }, { kind: 'text', text: 'being' },
] }]), 3, 'formatting boundaries preserve one word, a contraction and a hyphenated word')

const preparedReading = prepared.sourceGroups.find((group) => group.groupId === reading.groupId)
assert.equal(preparedReading.blocks[0].kind, 'framed_columns')
assert.deepEqual(prepared.deterministic.find((group) => group.groupId === reading.groupId).paragraphIds,
  ['block:reading-a', 'block:reading-a:second-paragraph'], 'nested prose is included and framed heading excluded')
const seven = prepared.sourceGroups.find((group) => group.family === 'seven-choices')
assert.equal(seven.optionBank.length, 7)
assert.equal(seven.questions[0].sourceNumber, 36)
assert.ok(seven.blocks[1].content.some((item) => item.kind === 'blank_ref'), 'inline blank identity is preserved')
const application = prepared.sourceGroups.find((group) => group.family === 'application-writing')
assert.deepEqual(application.writingTask.givenSkeleton, [{ text: 'Dear Chris,', role: 'salutation' }])
for (const group of prepared.sourceGroups.filter((group) => group.writingTask)) {
  assert.equal(group.writingTaskId, `writing-task:${group.groupId}`,
    'the request supplies each writing identity required by its output contract')
}
assert.equal(prepared.outputContract.properties.groups.items.allOf[1].oneOf.length, 6)
const authoredContractValidate = new Ajv({ strict: true }).compile(prepared.outputContract)
assert.equal(Object.hasOwn(prepared.binding, 'paperDigest'), false)
assert.equal(buildPublicSearchMetadataMessages(binding).length, 2)

const labelA = '人与社会-社会服务与人际沟通-志愿服务'
const labelB = '人与社会-社会服务与人际沟通-合作'
const authored = { groups: prepared.sourceGroups.map((group) => {
  let metadata
  if (group.family === 'reading') metadata = { slot: group.slotId.split('.')[1].toUpperCase(), questions: group.questions.map(({ questionId }) => ({ questionId, similarityProfile: { family: 'detail', subtype: 'general-detail', detailScope: 'single', technique: null } })) }
  if (group.family === 'seven-choices') metadata = { questions: group.questions.map(({ questionId }) => ({ questionId, positionFacet: 'seven-choices.position.paragraph-middle', roleFacet: 'seven-choices.role.cohesion', primaryMechanismFacet: 'seven-choices.cohesion.grammatical.logical-connector' })) }
  if (group.family === 'cloze') metadata = { questions: group.questions.map(({ questionId }) => ({ questionId, pos: 'verb', signatureFacet: 'cloze.signature.verb.action-sequence' })) }
  if (group.family === 'grammar-fill') metadata = { questions: group.questions.map(({ questionId, prompt }) => ({
    questionId,
    facetKey: prompt ? 'grammar-fill.given.verb.finite' : 'grammar-fill.no-hint.article', role: null,
    similarityProfile: { route: prompt ? 'present-stable-description' : 'the-anaphoric', features: [] },
    contextParagraphIds: prepared.deterministic.find((item) => item.groupId === group.groupId).paragraphIds,
  })) }
  if (group.family === 'application-writing') metadata = { writingTaskId: group.writingTaskId, form: 'thank-you email', function: 'apology and thanks' }
  if (group.family === 'continuation-writing') metadata = { writingTaskId: group.writingTaskId, situation: 'A situation develops.', conflict: 'A problem must be resolved.', relationships: [] }
  return { groupId: group.groupId, family: group.family, topicLabels: [labelA, labelB], genre: '记叙', metadata }
}) }
assert.equal(authoredContractValidate(authored), true, JSON.stringify(authoredContractValidate.errors))

assert.deepEqual(validateAuthoredPublicSearchMetadata({ authored, ...binding }), [])
const badTopic = structuredClone(authored)
badTopic.groups[0].topicLabels = ['人与自我-生活与学习-积极的人生态度']
const topicIssues = validateAuthoredPublicSearchMetadata({ authored: badTopic, ...binding })
assert.equal(topicIssues[0].path, '/groups/0/topicLabels/0')
assert.equal(topicIssues[0].code, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')
assert(topicIssues[0].allowedValues.includes(labelA))
const badTopics = structuredClone(badTopic)
badTopics.groups[1].topicLabels = ['invented-topic']
assert.equal(validateAuthoredPublicSearchMetadata({ authored: badTopics, ...binding }).length, 2,
  'one rewrite receives all schema errors, without irrelevant oneOf family failures')
const badRoute = structuredClone(authored)
badRoute.groups.find(group => group.family === 'grammar-fill').metadata.questions[0].similarityProfile.route = 'invented-route'
const routeIssues = validateAuthoredPublicSearchMetadata({ authored: badRoute, ...binding })
assert.equal(routeIssues[0].code, 'PUBLIC_METADATA_GRAMMAR_SIMILARITY_INVALID')
assert(routeIssues[0].allowedValues.route.includes('present-stable-description'))
const reorderedRoute = structuredClone(badRoute)
reorderedRoute.groups.reverse()
const reorderedIndex = reorderedRoute.groups.findIndex(group => group.family === 'grammar-fill')
assert.equal(validateAuthoredPublicSearchMetadata({ authored: reorderedRoute, ...binding })[0].path,
  `$.groups[${reorderedIndex}].metadata.questions[0].similarityProfile`)
const repairedTopic = structuredClone(badTopic)
let authoredRewrites = 0
await ensureSearchMetadata({
  check: () => validateAuthoredPublicSearchMetadata({ authored: repairedTopic, ...binding }),
  rewrite: async issues => {
    assert.deepEqual(issues, topicIssues)
    repairedTopic.groups[0].topicLabels = [...authored.groups[0].topicLabels]
    authoredRewrites += 1
  },
})
assert.equal(authoredRewrites, 1, 'a writer stub fixes the reported field and the real validator accepts it')
for (const successAt of [0, 1, 2]) {
  let rewrites = 0
  await ensureSearchMetadata({
    check: () => rewrites >= successAt ? [] : topicIssues,
    rewrite: async (issues, attempt) => {
      assert.deepEqual(issues, topicIssues)
      assert.equal(attempt, rewrites + 1)
      rewrites += 1
    },
  })
  assert.equal(rewrites, successAt, 'valid output continues immediately after the successful rewrite')
}
let exhausted = 0
await assert.rejects(ensureSearchMetadata({
  check: () => routeIssues,
  rewrite: async () => { exhausted += 1 },
}), error => error.kind === 'search_metadata_check_failed'
  && error.message.includes('PUBLIC_METADATA_GRAMMAR_SIMILARITY_INVALID') && exhausted === 2)

const rejectsAuthored = (mutate, code) => {
  const value = structuredClone(authored)
  mutate(value)
  assert.throws(() => finalizePublicSearchMetadata({ authored: value, ...binding }), new RegExp(code))
}
rejectsAuthored((value) => { value.groups[1] = structuredClone(value.groups[0]) }, 'PUBLIC_METADATA_AUTHORED_GROUP_COVERAGE_INVALID')
rejectsAuthored((value) => { value.groups[0].groupId = 'foreign-group' }, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')
rejectsAuthored((value) => { value.groups[0].family = 'cloze' }, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')
rejectsAuthored((value) => { value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].reason = 'because' }, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')
rejectsAuthored((value) => { value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].derived = {} }, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')
rejectsAuthored((value) => { value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].blankId = 'blank:56' }, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')
rejectsAuthored((value) => { value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].authoritativeAnswer = 'is' }, 'PUBLIC_METADATA_AUTHORED_SHAPE_INVALID')

const final = finalizePublicSearchMetadata({ authored, ...binding })
const grammar = final.groups.find((group) => group.family === 'grammar-fill')
assert.equal(grammar.metadata.questions[0].blankId, 'blank:56')
assert.equal(grammar.metadata.questions[0].blankType, 'given')
assert.ok(Object.hasOwn(grammar.metadata.questions[0], 'derived'), 'grammar derived fields are program-filled')
assert.equal(Object.hasOwn(authored.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0], 'derived'), false)
assert.deepEqual(validatePublicSearchMetadata({ sidecar: final, ...binding }), [])
const persisted = JSON.parse(stableStringify(final))
assert.deepEqual(validatePublicSearchMetadata({ sidecar: persisted, ...binding }), [],
  'CLI canonical JSON persistence must not invalidate derived object fields')

const progressiveMaterialization = structuredClone(materialization)
const progressiveQuestion = progressiveMaterialization.groups.find((group) => group.family === 'grammar-fill').questions[0]
progressiveQuestion.prompt = 'recover'
progressiveMaterialization.answers.find((answer) => answer.questionId === progressiveQuestion.questionId).value = 'are recovering'
const progressiveAuthored = structuredClone(authored)
progressiveAuthored.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].similarityProfile.route = 'present-progressive-current-action'
const progressiveBinding = { ...binding, materialization: progressiveMaterialization }
const progressiveRequest = preparePublicSearchMetadataRequest(progressiveBinding)
assert.ok(progressiveRequest.controlledValues.grammarSimilarity.find((facet) => facet.facet_key === 'grammar-fill.given.verb.finite').routes.includes('present-progressive-current-action'))
const progressive = finalizePublicSearchMetadata({ authored: progressiveAuthored, ...progressiveBinding })
const progressiveResult = progressive.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0]
assert.equal(progressiveResult.similarityProfile.route, 'present-progressive-current-action')
assert.equal(progressiveResult.derived.tense, 'progressive')
assert.deepEqual(validatePublicSearchMetadata({ sidecar: progressive, ...progressiveBinding }), [])

const negativeMaterialization = structuredClone(materialization)
const negativeQuestion = negativeMaterialization.groups.find((group) => group.family === 'grammar-fill').questions[0]
negativeQuestion.prompt = 'complete'
negativeMaterialization.answers.find((answer) => answer.questionId === negativeQuestion.questionId).value = 'incomplete'
const negativeAuthored = structuredClone(authored)
const negativeMetadata = negativeAuthored.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0]
negativeMetadata.facetKey = 'grammar-fill.given.conversion.adjective-to-adjective'
negativeMetadata.similarityProfile = { route: 'negative-prefix', features: [] }
const negativeBinding = { ...binding, materialization: negativeMaterialization }
const negativeRequest = preparePublicSearchMetadataRequest(negativeBinding)
assert.deepEqual(negativeRequest.controlledValues.grammarSimilarity.find((facet) => facet.facet_key === negativeMetadata.facetKey)?.routes,
  ['negative-prefix'], 'same-POS adjective negation must not require a verb-to-adjective classification')
assert.equal(new Ajv({ strict: true }).compile(negativeRequest.outputContract)(negativeAuthored), true)
const negative = finalizePublicSearchMetadata({ authored: negativeAuthored, ...negativeBinding })
const negativeResult = negative.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0]
assert.equal(negativeResult.facetKey, 'grammar-fill.given.conversion.adjective-to-adjective')
assert.deepEqual(negativeResult.similarityProfile, { route: 'negative-prefix', features: [] })
assert.equal(negativeResult.role, null)
assert.deepEqual(validatePublicSearchMetadata({ sidecar: negative, ...negativeBinding }), [])

const schema = JSON.parse(readFileSync(new URL('../schemas/paper-import/public-search-metadata-v1.schema.json', import.meta.url)))
const schemaValidate = new Ajv({ strict: true }).compile(schema)
assert.equal(schemaValidate(final), true, JSON.stringify(schemaValidate.errors))

const codes = (mutate) => {
  const value = structuredClone(final); mutate(value)
  return new Set(validatePublicSearchMetadata({ sidecar: value, ...binding }).map((issue) => issue.code))
}
assert.ok(codes((value) => { value.groups[0].metadata.questions = {} }).has('PUBLIC_METADATA_QUESTIONS_INVALID'))
assert.ok(codes((value) => { value.groups[0].metadata.questions = [null] }).has('PUBLIC_METADATA_READING_PROFILE_INVALID'))
assert.ok(codes((value) => { value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].role = 'invented-role' }).has('PUBLIC_METADATA_GRAMMAR_ROLE_INVALID'))
assert.ok(codes((value) => { value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].role = 'subject' }).has('PUBLIC_METADATA_GRAMMAR_ROLE_INVALID'))
assert.ok(codes((value) => {
  value.groups.find((group) => group.family === 'grammar-fill').metadata.questions[0].derived.voice = 'wrong-voice'
}).has('PUBLIC_METADATA_GRAMMAR_DERIVED_INVALID'), 'changed derived values must still fail')
assert.ok(codes((value) => { value.groups.find((group) => group.family === 'application-writing').metadata.theme = labelA }).has('PUBLIC_METADATA_APPLICATION_INVALID'))
assert.deepEqual(final.groups.find((group) => group.family === 'continuation-writing').metadata.relationships, [])
assert.equal(final.groups.find((group) => group.family === 'application-writing').metadata.form, 'thank-you email')
assert.equal(final.groups[0].topicLabels.length, 2)

const metadataBytes = Buffer.from(`${JSON.stringify(final)}\n`)
const sourceDocument = materialization.documents.find((document) =>
  ['question_source', 'question_and_answers'].includes(document.role))
const compatibility = buildNck1CompatibilityPackage({
  config: {
    provenance: {
      paperName: 'Public metadata fixture', source: 'fixture', sourceType: '模拟题',
      year: 2026,
    },
  },
  manifest: {
    documents: [{
      documentId: sourceDocument.documentId,
      path: 'source.docx',
      sha256: sourceDocument.sha256,
    }],
  },
  materialization,
  publicSearchMetadataBytes: metadataBytes,
})
assert.equal(compatibility.publicSearchMetadataBytes, metadataBytes,
  'compatibility package preserves exact public search metadata bytes')

console.log('PASS public-search metadata complete-source preparation, authored/finalized roundtrip, strict schema and malformed-input boundaries')
