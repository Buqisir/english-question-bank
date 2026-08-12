#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApplicationModelAnswerMessages,
  buildCompleteApplicationTaskText,
} from '../server/paper-import-ai/applicationWritingWorkflow.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const v3Path = path.join(rootDir, 'prompts/application-writing-model-answer-v3.md')
const v2Path = path.join(rootDir, 'prompts/application-writing-model-answer-v2.md')
const v3Prompt = readFileSync(v3Path, 'utf8').trim()
const v2Prompt = readFileSync(v2Path, 'utf8').trim()

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
assert.equal(messages[0].content, `${v3Prompt}\n\n${taskText}`)
assert.notEqual(messages[0].content, `${v2Prompt}\n\n${taskText}`)

console.log('PASS application model-answer workflow loads production V3 with the complete reconstructed task; V2 remains inactive')
