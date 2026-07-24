#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  buildCompleteApplicationTaskText,
  validateApplicationModelAnswer,
} from '../../../../server/paper-import-ai/applicationWritingWorkflow.mjs'
import {
  isCompleteReviewCard,
  validateWritingAnalysisCandidate,
} from '../../../../server/writing-analysis/writingAnalysisBackfillService.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const paperId = 'paper-960d0f8d'
const groupId = 'group-960d0f8d-writing-application'
const writingTaskId = 'wt-960d0f8d-application'
const questionSource = '/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语试卷.docx'
const answerSource = '/Users/huangxuewei/Desktop/教学资料库/05_真题模拟与试卷库/各地模拟/2026年3月高三试卷/26年3月高三试卷/26.3重庆市巴蜀中学高三月考（七）英语答案解析.docx'
const assetRoot = path.join(repoRoot, 'app/public/paper-assets', paperId, 'latest')
const paperAsset = JSON.parse(readFileSync(path.join(assetRoot, 'paper-asset.json'), 'utf8'))
const writingEnvelope = JSON.parse(readFileSync(
  path.join(assetRoot, 'analyses/writing-analysis-v1.json'),
  'utf8',
))
const group = paperAsset.content.groups[groupId]
const writingTask = paperAsset.content.writingTasks[writingTaskId]
const analysis = writingEnvelope.groups[groupId].writing
let passed = 0

function check(name, fn) {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

check('the locked question and answer DOCX hashes still match', () => {
  assert.equal(sha256(questionSource), '960d0f8d6fddc3e6ccff22a15c9044170cb58f59a8b62f9870cf522df8cde25b')
  assert.equal(sha256(answerSource), 'cb59414336068de60c9949ee05e36182775e16d2930ec864975dcfd514bd402a')
})

check('the pilot is bound to exactly the approved paper, group, and writing task', () => {
  assert.equal(paperAsset.paper.paperId, paperId)
  assert.equal(group.groupId, groupId)
  assert.equal(group.writingTaskId, writingTaskId)
  assert.equal(writingTask.writingTaskId, writingTaskId)
  assert.equal(writingTask.taskType, 'application')
})

check('the saved asset remains unchanged while the adapter reconstructs every stored line', () => {
  assert.match(writingTask.instruction, /\n\(2\)可适当增加细节/)
  const reconstructed = buildCompleteApplicationTaskText(writingTask, group.passage)
  for (const expected of [
    '假定你是校报记者李华',
    '上周五的“校园开放日”(Open Day)',
    '外教Chris承担了英语示范课教学',
    '(1)询问示范课的内容与亮点',
    '(2)征求其出镜照片使用授权',
    '可适当增加细节，使内容充实、行文连贯',
    '80词左右',
    'Dear Chris,',
    'I’m Li Hua, a student reporter for our school newspaper.',
    'Yours,',
    'Li Hua',
  ]) {
    assert.ok(reconstructed.includes(expected), `adapter output missing ${expected}`)
  }
})

check('the persisted AI model answer passes the Ticket 02 machine gate', () => {
  assert.deepEqual(
    validateApplicationModelAnswer({
      modelAnswer: analysis.modelAnswer,
      writingTask,
      groupPassage: group.passage,
    }),
    { studentWordCount: 90, wordCountStatus: 'recommended' },
  )
  assert.throws(() => validateApplicationModelAnswer({
    modelAnswer: analysis.modelAnswer.replace(
      'I’m Li Hua, a student reporter for our school newspaper.\n',
      '',
    ),
    writingTask,
    groupPassage: group.passage,
  }), /given text/)
})

check('the persisted ReviewCard is complete and maps the two source points exactly', () => {
  assert.equal(isCompleteReviewCard(analysis.reviewCard), true)
  assert.deepEqual(analysis.reviewCard.points, [
    '询问示范课的内容与亮点',
    '征求其出镜照片的使用授权',
  ])
})

check('the official model answer is the normalized locked DOCX transcription', () => {
  assert.equal(analysis.officialModelAnswer, `Dear Chris,
I’m Li Hua, a student reporter for our school newspaper. We are preparing our report on last Friday’s Open Day, and I’m writing to ask for a few details about the English demonstration class you taught.

Could you please briefly describe what the class focused on and what students did or learned? It would also help if you could share one or two highlights that you think are worth mentioning. In addition, our photographers took photos of you interacting with students during the class, and I have attached a few for your review. May we have your permission to include them in our report on the school website and other official channels?

Thank you for your time, and I look forward to your reply.

Yours,
Li Hua
`)
})

check('the new application payload contains only approved display fields', () => {
  assert.deepEqual(Object.keys(analysis).sort(), [
    'modelAnswer',
    'officialModelAnswer',
    'reviewCard',
    'taskType',
  ])
  assert.equal(analysis.taskType, 'application')
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(analysis))
  for (const forbidden of [
    'highlightExpressions',
    'audit',
    'review',
    'findings',
    'rawModelResponse',
    'rawResponse',
  ]) {
    assert.equal(forbidden in analysis, false)
  }
})

const { default: Ajv2020 } = await import(
  pathToFileURL(path.join(repoRoot, 'server/node_modules/ajv/dist/2020.js')).href
)
const schema = JSON.parse(readFileSync(
  path.join(repoRoot, 'schemas/paper-import/writing-analysis-v1.schema.json'),
  'utf8',
))
check('the actual writing-analysis schema accepts the persisted envelope', () => {
  const validate = new Ajv2020({ strict: false }).compile(schema)
  assert.equal(validate(writingEnvelope), true, JSON.stringify(validate.errors))
})

console.log(`\nTicket 04 real pilot checks: ${passed}/${passed} passed`)
