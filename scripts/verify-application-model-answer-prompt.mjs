#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApplicationModelAnswerMessages,
  buildApplicationStagedAnalysisContract,
  buildCompleteApplicationTaskText,
  validateApplicationModelAnswer,
} from '../server/paper-import-ai/applicationWritingWorkflow.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const v3Path = path.join(rootDir, 'prompts/application-writing-model-answer-v3.md')
const v2Path = path.join(rootDir, 'prompts/application-writing-model-answer-v2.md')
const stagedPath = path.join(rootDir, 'prompts/application-writing-staged-analysis-v1.md')
const doctrinePath = path.join(rootDir, '.agents/skills/importing-nck1-papers/reference/teaching-analysis-style-v1.md')
const v3Prompt = readFileSync(v3Path, 'utf8').trim()
const v2Prompt = readFileSync(v2Path, 'utf8').trim()
const stagedPrompt = readFileSync(stagedPath, 'utf8').trim()
const doctrine = readFileSync(doctrinePath, 'utf8').trim()

const writingTask = {
  writingTaskId: 'wt-v3-production-gate',
  groupId: 'group-v3-production-gate',
  taskType: 'application',
  title: '应用文写作',
  instruction: '假定你是李华，请给老师写一封邮件，对口语练习方案提出建议。',
  wordCountTarget: 80,
  applicationGiven: {
    top: ['Dear Ryan,', 'I’m Li Hua from Class 3.'],
    bottom: ['Yours sincerely,', 'Li Hua'],
  },
}

const taskText = buildCompleteApplicationTaskText(writingTask, null)
const messages = buildApplicationModelAnswerMessages(writingTask, null)

assert.match(v3Prompt, /^# Application Writing Model Answer Prompt — V3$/m)
assert.match(v3Prompt, /^> STATUS: PRODUCTION/m)
assert.match(v3Prompt, /^### 交际对象推演$/m)
assert.match(v3Prompt, /选择最小充分组合/)
assert.doesNotMatch(v3Prompt, /STATUS: CANDIDATE|not wired into production/)
assert.notEqual(v3Prompt, v2Prompt)
assert.deepEqual(messages.map(({ role }) => role), ['user'])
assert.equal(messages[0].content, `${v3Prompt}\n\n---\n\n${doctrine}\n\n${taskText}`)
assert.equal(messages[0].content.match(/^# Teaching Analysis Style — V1$/gm)?.length, 1)
assert.notEqual(messages[0].content, `${v2Prompt}\n\n${taskText}`)
assert.match(stagedPrompt, /^# NCK1 Staged Application Analysis Packaging Contract — V1$/m)
assert.match(stagedPrompt, /"taskType": "application"/)
assert.match(stagedPrompt, /"reviewCard"/)
assert.match(stagedPrompt, /"schemaVersion": "application-review-card-v2"/)
assert.match(stagedPrompt, /"purpose"/)
assert.match(stagedPrompt, /"relationship"/)
assert.match(stagedPrompt, /actual count \(including one or three\)/)
assert.doesNotMatch(stagedPrompt, /"highlightExpressions"\s*:/)
assert.match(stagedPrompt, /exactly\s+these top-level keys and no others/)
assert.equal(buildApplicationStagedAnalysisContract(), `${v3Prompt}\n\n${stagedPrompt}`)

assert.match(v3Prompt, /110词左右为目标，推荐100—120词/)
assert.doesNotMatch(v3Prompt, /85—100|约105词/)
assert.match(doctrine, /约80词任务以110词左右为编辑目标/)
const given = writingTask.applicationGiven
const candidate = (count) => [...given.top, Array(count).fill('word').join(' '), ...given.bottom].join('\n')
for (const [count, status] of [[80, 'accepted'], [99, 'accepted'], [100, 'recommended'], [110, 'recommended'], [116, 'recommended'], [120, 'recommended']]) {
  assert.deepEqual(validateApplicationModelAnswer({ modelAnswer: candidate(count), writingTask, groupPassage: null }), {
    studentWordCount: count, wordCountStatus: status,
  })
}
for (const count of [79, 121]) {
  assert.throws(() => validateApplicationModelAnswer({ modelAnswer: candidate(count), writingTask, groupPassage: null }), /outside the accepted range \[80, 120\]/)
}
const otherTask = { ...writingTask, wordCountTarget: 100 }
assert.equal(validateApplicationModelAnswer({ modelAnswer: candidate(130), writingTask: otherTask, groupPassage: null }).studentWordCount, 130)
assert.throws(() => validateApplicationModelAnswer({ modelAnswer: candidate(131), writingTask: otherTask, groupPassage: null }), /outside the accepted range \[80, 130\]/)

console.log('PASS application model-answer workflow loads production V3 plus the shared teaching doctrine and complete reconstructed task; the staged one-pass contract is tracked and composed; V2 remains inactive')
