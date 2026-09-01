#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildApplicationModelAnswerMessages,
  buildApplicationStagedAnalysisContract,
  buildCompleteApplicationTaskText,
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
assert.match(stagedPrompt, /exactly\s+these top-level keys and no others/)
assert.equal(buildApplicationStagedAnalysisContract(), `${v3Prompt}\n\n${stagedPrompt}`)

console.log('PASS application model-answer workflow loads production V3 plus the shared teaching doctrine and complete reconstructed task; the staged one-pass contract is tracked and composed; V2 remains inactive')
