#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import Ajv from '../server/node_modules/ajv/dist/2020.js'

import {
  isApplicationReviewCardV2,
  isCompleteApplicationReviewCard,
  projectApplicationReviewCardDisplay,
} from '../shared/writing/applicationReviewCard.mjs'
import {
  persistWritingAnalysisGroup,
  validateWritingAnalysisCandidate,
} from '../server/writing-analysis/writingAnalysisBackfillService.mjs'
import { projectNck1StagedWritingAnalysis } from '../server/import-review/nck1AnalysisProjection.mjs'
import { buildCompanionAnalysisHtml } from '../server/exports/companionAnalysisRenderer.mjs'

const v2Card = (points) => ({
  schemaVersion: 'application-review-card-v2',
  form: '给英国朋友的邮件',
  topic: '分享校园阅读周活动',
  purpose: '邀请朋友交流各自的阅读体验',
  person: '第一人称为主',
  tense: '一般过去时叙事，一般现在时交流',
  points,
  reader: '英国朋友 Chris',
  relationship: '熟悉且平等的同龄朋友',
  readerNeeds: '了解活动细节并知道如何回应邀请',
  value: '让跨文化交流落到共同的阅读体验上',
})

const legacyCard = {
  form: '分享邮件',
  topic: '分享一次公园美术课经历',
  reader: '英国朋友 Chris',
  person: '第一人称',
  tense: '一般过去时为主',
  type: '分享类',
  points: ['完成的作品', '个人感想'],
  readerWho: '英国朋友',
  readerCares: '作品画面与经历变化',
  readerWants: '具体细节与真实感受',
  value: '让朋友理解这次经历带来的新发现',
}

const onePoint = v2Card(['说明阅读周中最难忘的一项活动'])
const threePoints = v2Card(['介绍阅读周活动', '分享个人收获', '邀请朋友交流体验'])
assert.equal(isApplicationReviewCardV2(onePoint), true)
assert.equal(isApplicationReviewCardV2(threePoints), true)
assert.equal(isCompleteApplicationReviewCard(legacyCard), true)

const oneDisplay = projectApplicationReviewCardDisplay(onePoint)
assert.deepEqual(oneDisplay.topicPurpose, [onePoint.topic, onePoint.purpose])
assert.notEqual(oneDisplay.topicPurpose[1], oneDisplay.value)
assert.deepEqual(oneDisplay.readerRelationship, [onePoint.reader, onePoint.relationship])
assert.equal(oneDisplay.points.length, 1)
assert.equal(projectApplicationReviewCardDisplay(threePoints).points.length, 3)
const legacyDisplay = projectApplicationReviewCardDisplay(legacyCard)
assert.deepEqual(legacyDisplay.readerRelationship, [legacyCard.reader, legacyCard.readerWho])
assert.deepEqual(projectApplicationReviewCardDisplay({
  ...legacyCard, readerWho: legacyCard.reader,
}).readerRelationship, [legacyCard.reader])
assert.deepEqual(legacyDisplay.readerNeeds, [legacyCard.readerCares, legacyCard.readerWants])

for (const invalid of [
  { ...onePoint, purpose: undefined },
  { ...onePoint, schemaVersion: 'application-review-card-v1' },
  { ...onePoint, points: [] },
  { ...onePoint, relationship: '' },
  { ...onePoint, type: '重复类型' },
]) {
  assert.equal(isApplicationReviewCardV2(invalid), false)
}

for (const reviewCard of [onePoint, threePoints]) {
  const candidate = { taskType: 'application', modelAnswer: 'Dear Chris,\nThanks for writing. Here is my answer.\nYours,\nLi Hua', reviewCard }
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(candidate))
  assert.deepEqual(projectNck1StagedWritingAnalysis(candidate).reviewCard, reviewCard)
}
assert.throws(
  () => validateWritingAnalysisCandidate({
    taskType: 'application',
    modelAnswer: 'A complete answer.',
    reviewCard: onePoint,
    highlightExpressions: [],
  }),
  /retired/,
)
assert.throws(
  () => projectNck1StagedWritingAnalysis({
    taskType: 'application',
    modelAnswer: 'A complete answer.',
    reviewCard: onePoint,
    highlightExpressions: [{ text: 'A complete answer.', note: 'retired' }],
  }),
  /retired highlightExpressions/,
)
assert.throws(
  () => projectNck1StagedWritingAnalysis({
    taskType: 'application',
    modelAnswer: 'A complete answer.',
    reviewCard: legacyCard,
  }),
  /application-review-card-v2/,
)

const schema = JSON.parse(readFileSync(
  new URL('../schemas/paper-import/writing-analysis-v1.schema.json', import.meta.url),
  'utf8',
))
const validateEnvelope = new Ajv({ allErrors: true, strict: false }).compile(schema)
const envelope = (reviewCard, extras = {}) => ({
  schemaVersion: 'writing-analysis-v1',
  paperId: 'paper-review-card-fixture',
  groups: {
    'group-application': {
      writing: { taskType: 'application', modelAnswer: 'A complete answer.', reviewCard, ...extras },
    },
  },
})
assert.equal(validateEnvelope(envelope(onePoint)), true)
assert.equal(validateEnvelope(envelope(threePoints)), true)
assert.equal(validateEnvelope(envelope(legacyCard, {
  highlightExpressions: [
    { text: 'complete answer', note: 'historical expression one' },
    { text: 'complete answer', note: 'historical expression two' },
    { text: 'complete answer', note: 'historical expression three' },
  ],
})), true)
assert.equal(validateEnvelope(envelope(onePoint, { highlightExpressions: [] })), false)
assert.equal(validateEnvelope(envelope({ ...onePoint, purpose: undefined })), false)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-application-card-v2-'))
try {
  const latest = path.join(tempRoot, 'paper-review-card-fixture', 'latest')
  mkdirSync(latest, { recursive: true })
  writeFileSync(path.join(latest, 'paper-asset.json'), '{}\n')
  persistWritingAnalysisGroup(
    { paperAssetsDir: tempRoot },
    { paperId: 'paper-review-card-fixture', groupId: 'group-application' },
    { taskType: 'application', modelAnswer: 'A complete answer.', reviewCard: threePoints },
  )
  const stored = JSON.parse(readFileSync(
    path.join(latest, 'analyses', 'writing-analysis-v1.json'),
    'utf8',
  )).groups['group-application'].writing
  assert.deepEqual(stored.reviewCard, threePoints)
  assert.equal(stored.highlightExpressions, undefined)
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

function companionHtml(cards) {
  const groups = Object.fromEntries(cards.map(({ groupId, taskType }) => [groupId, {
    groupId,
    groupType: taskType === 'continuation' ? 'continuation' : 'writing',
    title: taskType === 'continuation' ? '读后续写' : '应用文写作',
    questionIds: [],
  }]))
  return buildCompanionAnalysisHtml({
    paperAsset: {
      paper: { paperId: 'paper-review-card-fixture', title: '审题卡验证卷' },
      layoutTree: { parts: [{ title: '写作', sections: [{ title: '写作', groups: cards.map(({ groupId }) => ({ groupId })) }] }] },
      content: { groups, questions: {} },
      answerKey: { answers: {} },
    },
    analyses: {
      writing: {
        groups: Object.fromEntries(cards.map(({ groupId, writing }) => [groupId, { writing }])),
      },
    },
  })
}

const html = companionHtml([
  {
    groupId: 'group-v2',
    taskType: 'application',
    writing: {
      taskType: 'application', modelAnswer: 'V2 model answer.', reviewCard: threePoints,
      highlightExpressions: [{ text: 'APP_RETIRED_SENTINEL', note: 'must stay hidden' }],
    },
  },
  {
    groupId: 'group-legacy',
    taskType: 'application',
    writing: { taskType: 'application', modelAnswer: 'Legacy model answer.', reviewCard: legacyCard },
  },
  {
    groupId: 'group-continuation',
    taskType: 'continuation',
    writing: {
      taskType: 'continuation',
      modelAnswer: 'CONTINUATION_EXPRESSION_SENTINEL',
      continuationDesign: { theme: '历史续写', paragraphs: ['第一段', '第二段'] },
      highlightExpressions: [{ text: 'CONTINUATION_EXPRESSION_SENTINEL', note: '历史续写继续可读' }],
    },
  },
])
assert.match(html, /data-review-card-version="application-review-card-v2"/)
assert.match(html, /data-review-card-version="legacy"/)
assert.equal((html.match(/<h5>基本审题<\/h5>/gu) || []).length, 2)
assert.equal((html.match(/<h5>内容要点<\/h5>/gu) || []).length, 2)
assert.equal((html.match(/<h5>读者意识<\/h5>/gu) || []).length, 2)
assert.ok(html.includes(threePoints.purpose))
assert.ok(html.includes(threePoints.value))
assert.equal(html.includes('APP_RETIRED_SENTINEL'), false)
assert.ok(html.includes('CONTINUATION_EXPRESSION_SENTINEL'))
assert.equal(html.includes('历史续写'), false)
assert.equal(html.includes('历史续写继续可读'), false)

console.log('Application review card v2 producer, shared validation/projection, legacy compatibility, persistence, and companion rendering: PASS')
