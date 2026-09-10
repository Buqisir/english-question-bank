#!/usr/bin/env node

import assert from 'node:assert/strict'
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { createExportImplementation } from '../server/exports/exportImplementation.mjs'
import { createCanonicalConsumerRuntime } from '../server/paper-canonical/consumerRuntime.mjs'
import { loadCanonicalGrammarFillPrintChrome } from '../server/paper-canonical/grammarFillPrintSourceBinding.mjs'
import { buildPrintHtml } from '../server/print-renderer.mjs'
import { projectCanonicalConsumerGroup } from '../shared/paper-canonical/consumerProjection.mjs'
import { digestJson, sha256 } from '../shared/paper-canonical/stable.mjs'
import {
  listeningInactiveReferenceHashes,
  makeListeningInactiveReferenceFixture,
} from '../test-fixtures/paper-canonical/listeningInactiveReferenceFixture.mjs'
import { canonicalConsumptionPrintPayload } from './import-pipeline/canonical-consumption-print-payload.mjs'

const root = path.resolve(import.meta.dirname, '..')
const outputDir = path.join(root, '.scratch/friendly-real-listening')
const htmlPath = path.join(outputDir, 'full-listening-input.html')
const evidencePath = path.join(outputDir, 'source-text-evidence.json')
const paperId = 'paper-2026-i'
const publicationRoot = path.join(
  root,
  'test-fixtures/paper-canonical/publications/ticket-32-remaining-v1/store',
)
const listeningRoot = path.join(root, 'scripts/import-pipeline/papers', paperId, 'listening')

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

function makeListeningOccurrence({ slotId, questions, answers, transcript }) {
  const groupId = `group:${paperId}:${slotId}`
  const questionIds = questions.map(({ no }) => `question:listening:${no}`)
  const optionIds = questions.flatMap(({ no, options }) =>
    Object.keys(options).map((label) => `option:question:listening:${no}:${label}`))
  const projectedQuestions = questions.map((question) => {
    const questionId = `question:listening:${question.no}`
    const options = Object.entries(question.options).map(([label, text]) => ({
      optionId: `option:${questionId}:${label}`,
      label,
      content: [{ kind: 'text', nodeId: `text:${questionId}:${label}`, text }],
    }))
    return {
      questionId,
      number: question.no,
      stem: [{ kind: 'text', nodeId: `text:${questionId}:stem`, text: question.stem }],
      options,
      correctOptionId: `option:${questionId}:${answers[String(question.no)]}`,
    }
  })
  const projectedSegments = transcript.map((segment) => ({
    segmentId: segment.textId.toLowerCase().replace(' ', ':'),
    content: [{
      kind: 'text',
      nodeId: `text:${groupId}:transcript:${segment.textId}`,
      text: segment.lines.map(({ speaker, line }) => `${speaker}: ${line}`).join('\n'),
    }],
    questionIds: segment.questionNumbers.map((number) => `question:listening:${number}`),
  }))
  return {
    kind: 'group',
    paperId,
    slotId,
    groupId,
    familyContractId: 'listening',
    numbering: projectedQuestions.map(({ questionId, number }) => ({ questionId, number })),
    blanks: [],
    scoringRuleRef: slotId,
    content: { blocks: [] },
    questions: projectedQuestions,
    transcriptSegments: projectedSegments,
    choices: {
      ownership: 'per_question',
      sets: projectedQuestions.map(({ questionId, options }) => ({ questionId, options })),
    },
    anchors: {
      questionIds,
      optionIds,
      transcriptSegmentIds: projectedSegments.map(({ segmentId }) => segmentId),
    },
    ...(slotId === 'listening.short-dialogue'
      ? { firstSectionPlayback: 'twice_default' }
      : {}),
  }
}

function normalizeText(text) {
  return text.replace(/\s+/gu, '')
}

const questionsBytes = readFileSync(path.join(listeningRoot, 'questions.json'))
const answersBytes = readFileSync(path.join(listeningRoot, 'answers.json'))
const transcriptBytes = readFileSync(path.join(listeningRoot, 'transcript.json'))
assert.equal(sha256(questionsBytes), listeningInactiveReferenceHashes.questions)
assert.equal(sha256(answersBytes), listeningInactiveReferenceHashes.answers)
assert.equal(sha256(transcriptBytes), listeningInactiveReferenceHashes.transcript)

const acceptedFixture = makeListeningInactiveReferenceFixture()
assert.equal(acceptedFixture.inventory.review.status, 'accepted')
const questionsSource = JSON.parse(questionsBytes)
const answersSource = JSON.parse(answersBytes)
const transcriptSource = JSON.parse(transcriptBytes)
const sourceQuestions = [
  ...questionsSource.section1.questions,
  ...questionsSource.section2.questions,
]
assert.deepEqual(sourceQuestions.map(({ no }) => no), Array.from({ length: 20 }, (_, index) => index + 1))
assert.equal(sourceQuestions.flatMap(({ options }) => Object.keys(options)).length, 60)

const shortTranscript = transcriptSource.texts.slice(0, 5).map((segment, index) => ({
  ...segment,
  questionNumbers: [acceptedFixture.inventory.shortDialogueJoins[index].questionNo],
}))
const longTranscript = transcriptSource.texts.slice(5).map((segment) => ({
  ...segment,
  questionNumbers: segment.coversQuestions,
}))
assert.deepEqual(
  [...shortTranscript, ...longTranscript].flatMap(({ questionNumbers }) => questionNumbers),
  Array.from({ length: 20 }, (_, index) => index + 1),
  'accepted transcript joins cover Questions 1-20 once in source order',
)

const listeningOccurrences = [
  makeListeningOccurrence({
    slotId: 'listening.short-dialogue',
    questions: questionsSource.section1.questions,
    answers: answersSource.answers,
    transcript: shortTranscript,
  }),
  makeListeningOccurrence({
    slotId: 'listening.long-form',
    questions: questionsSource.section2.questions,
    answers: answersSource.answers,
    transcript: longTranscript,
  }),
]

const db = new DatabaseSync(path.join(publicationRoot, 'publication.sqlite'), { readOnly: true })
let realConsumption
try {
  realConsumption = createCanonicalConsumerRuntime({ rootDir: publicationRoot, db }).load({
    paperId,
    consumerId: 'print_pdf',
  })
} finally {
  db.close()
}
assert.equal(realConsumption.disposition, 'ready')
const realAnswerKey = readJson(path.join(
  root,
  'app/public/paper-assets',
  paperId,
  'latest/answer-key.json',
))
const realAnswers = new Map(Object.entries(realAnswerKey.answers).map(([questionId, answer]) => [
  questionId,
  answer.answer,
]))
const realPayload = canonicalConsumptionPrintPayload(
  realConsumption,
  '2026年新课标Ⅰ卷',
  realAnswers,
)
const realGroupIds = realPayload.items.map(({ questionGroupId }) => questionGroupId)
assert.deepEqual(realGroupIds, [
  'group-2026-i-reading-a',
  'group-2026-i-reading-b',
  'group-2026-i-reading-c',
  'group-2026-i-reading-d',
  'group-2026-i-seven-choices',
  'group-2026-i-cloze',
  'group-2026-i-grammar-fill',
  'group-2026-i-writing-application',
  'group-2026-i-writing-continuation',
])

const listeningSelection = {
  mode: 'canonical',
  familyContractId: 'listening',
  groupIds: listeningOccurrences.map(({ groupId }) => groupId),
  projectedOccurrences: listeningOccurrences,
  projectedOccurrenceDigests: listeningOccurrences.map((occurrence) => ({
    groupId: occurrence.groupId,
    digest: digestJson(occurrence),
  })),
}
// This deliberately identifies itself as a composed local draft. It combines
// an immutable real nine-Group publication with hash-bound inactive listening
// source solely for layout QA; it is not a new Canonical publication.
const qaConsumption = {
  ...realConsumption,
  composition: { kind: 'draft-paper', sourcePaperIds: [paperId] },
  selections: [listeningSelection, ...realConsumption.selections],
}
delete qaConsumption.visibleStructure
delete qaConsumption.visibleStructureDigest

const answerMap = new Map(Object.entries(answersSource.answers).map(([number, answer]) => [
  `question:listening:${number}`,
  answer,
]))
const listeningDetails = listeningOccurrences.map(({ groupId }) => {
  const group = projectCanonicalConsumerGroup({
    consumption: qaConsumption,
    familyContractId: 'listening',
    groupId,
  })
  return {
    id: groupId,
    paperId,
    title: groupId,
    source: paperId,
    groupType: 'listening',
    passage: { title: groupId, materialText: '' },
    questions: group.questions.map((question) => ({
      id: question.questionId,
      questionNo: String(question.questionNo),
      stem: question.stem,
      answer: answerMap.get(question.questionId),
      explanation: '',
      note: '',
      options: question.options.map(({ label, text }) => ({ label, content: text })),
    })),
  }
})
const details = new Map([
  ...listeningDetails.map((detail) => [detail.id, detail]),
  ...realPayload.details,
])
const groupIds = [...listeningSelection.groupIds, ...realGroupIds]
const items = groupIds.map((groupId) => ({
  detail: details.get(groupId),
  score: 0,
  note: '',
  sectionTitle: '',
}))
const blocks = [
  ...listeningSelection.groupIds.map((questionGroupId) => ({ type: 'question_group', questionGroupId })),
  ...realPayload.blocks,
]

mkdirSync(outputDir, { recursive: true })
const grammarFillChrome = loadCanonicalGrammarFillPrintChrome({
  exportItems: items,
  canonicalConsumption: realConsumption,
  paperAssetsDir: publicationRoot,
  versionType: 'student',
})
const images = []
const html = buildPrintHtml({
  title: '2026年新课标Ⅰ卷',
  versionType: 'student',
  printStyle: 'exam',
  questionNumberStart: 1,
  items,
  blocks,
  canonicalConsumption: qaConsumption,
  paperAssetsDir: publicationRoot,
  imageMode: 'file',
  images,
  grammarFillChrome,
})
for (const image of images) cpSync(image.absoluteSourcePath, path.join(outputDir, image.relativeName))
writeFileSync(htmlPath, html)

const baseExporter = createExportImplementation({
  rootDir: root,
  exportDir: outputDir,
  getQuestionGroupDetail: (groupId) => realPayload.details.get(groupId) || null,
  buildPrintHtml,
  paperAssetsDir: publicationRoot,
  resolveCanonicalConsumption: () => realConsumption,
})
const baseHtml = baseExporter.exportPrintHtml({
  title: realPayload.title,
  versionType: 'student',
  printStyle: realPayload.printStyle,
  questionNumberStart: realPayload.questionNumberStart,
  items: realPayload.items,
  blocks: realPayload.blocks,
}).body
const playwright = await import('../app/node_modules/playwright/index.js')
const browser = await playwright.default.chromium.launch({ headless: true, channel: 'chromium' })
let renderedGroupIds
let renderedGroupTexts
try {
  const [fullPage, basePage] = await Promise.all([browser.newPage(), browser.newPage()])
  await Promise.all([
    fullPage.setContent(html, { waitUntil: 'load' }),
    basePage.setContent(baseHtml, { waitUntil: 'load' }),
  ])
  renderedGroupIds = await fullPage.locator('section[data-canonical-group-id]').evaluateAll((groups) =>
    groups.map((group) => group.getAttribute('data-canonical-group-id')))
  assert.deepEqual(renderedGroupIds, groupIds)
  assert.equal(await fullPage.locator('[data-canonical-question-id^="question:listening:"]').count(), 20)
  assert.equal(await fullPage.locator('.question-group[data-canonical-group-type="listening"] .canonical-options > span').count(), 60)
  assert.equal(await fullPage.locator('[data-canonical-listening-segment-cue]').count(), 5)
  assert.deepEqual(
    await fullPage.locator('[data-canonical-listening-segment-cue]').allTextContents(),
    [
      '听第6段材料，回答第6、7题。',
      '听第7段材料，回答第8至10题。',
      '听第8段材料，回答第11至13题。',
      '听第9段材料，回答第14至16题。',
      '听第10段材料，回答第17至20题。',
    ],
  )
  const listeningText = normalizeText(await fullPage.locator(
    '.question-group[data-canonical-group-type="listening"]',
  ).allTextContents().then((texts) => texts.join('\n')))
  for (const question of sourceQuestions) {
    assert.ok(listeningText.includes(normalizeText(question.stem)))
    for (const option of Object.values(question.options)) {
      assert.ok(listeningText.includes(normalizeText(option)))
    }
  }
  const fullRealTexts = await Promise.all(realGroupIds.map((groupId) => fullPage.locator(
    `section[data-canonical-group-id="${groupId}"]`,
  ).textContent()))
  const baseRealTexts = await Promise.all(realGroupIds.map((groupId) => basePage.locator(
    `section[data-canonical-group-id="${groupId}"]`,
  ).textContent()))
  assert.deepEqual(fullRealTexts.map(normalizeText), baseRealTexts.map(normalizeText),
    'all nine genuine remaining Groups retain their complete renderer text')
  renderedGroupTexts = fullRealTexts
} finally {
  await browser.close()
}

const evidence = {
  schemaVersion: 'friendly-real-listening-layout-evidence-v1',
  disposition: 'local_layout_fixture_only',
  publicationOrApprovalClaimed: false,
  input: path.relative(root, htmlPath),
  source: {
    acceptedInventory: 'test-fixtures/paper-canonical/evidence/listening-source-inventory-paper-2026-i.json',
    inventoryReviewStatus: acceptedFixture.inventory.review.status,
    questions: { path: path.relative(root, path.join(listeningRoot, 'questions.json')), sha256: sha256(questionsBytes) },
    answers: { path: path.relative(root, path.join(listeningRoot, 'answers.json')), sha256: sha256(answersBytes) },
    transcript: { path: path.relative(root, path.join(listeningRoot, 'transcript.json')), sha256: sha256(transcriptBytes) },
    realRemainingPaperPublication: path.relative(root, publicationRoot),
  },
  coverage: {
    groupCount: renderedGroupIds.length,
    groupOrder: renderedGroupIds,
    listeningQuestionCount: sourceQuestions.length,
    listeningOptionCount: sourceQuestions.flatMap(({ options }) => Object.values(options)).length,
    listeningTranscriptSegmentCount: shortTranscript.length + longTranscript.length,
    listeningSegmentCues: 5,
    remainingGroupText: 'exact normalized DOM equality with a separate render of the immutable real nine-Group publication',
    remainingGroupNormalizedCharacterCounts: Object.fromEntries(realGroupIds.map((groupId, index) => [
      groupId,
      normalizeText(renderedGroupTexts[index]).length,
    ])),
  },
  supportingFiles: images.map(({ relativeName }) => relativeName),
  limitations: [
    'Listening remains an accepted inactive reference in repository publication state; this script does not activate, publish, approve, or mutate it.',
    'The composed Consumption object exists only in memory to exercise the shared canonical projection and public Print renderer seams.',
    'This layout fixture does not create a Canonical source map; authenticity is bound by the accepted inventory and exact source hashes.',
    'No PDF planner is run by this preparation script.',
  ],
}
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)

console.log(`PASS: prepared authentic 11-Group student Print HTML (${sourceQuestions.length} listening Questions, 60 options) at ${path.relative(root, htmlPath)}`)
console.log(`Evidence: ${path.relative(root, evidencePath)}`)
