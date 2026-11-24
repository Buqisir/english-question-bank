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
const v4Path = path.join(rootDir, 'prompts/application-writing-model-answer-v4.md')
const v3Path = path.join(rootDir, 'prompts/application-writing-model-answer-v3.md')
const stagedPath = path.join(rootDir, 'prompts/application-writing-staged-analysis-v2.md')
const v4Prompt = readFileSync(v4Path, 'utf8').trim()
const v3Prompt = readFileSync(v3Path, 'utf8').trim()
const stagedPrompt = readFileSync(stagedPath, 'utf8').trim()

const writingTask = {
  writingTaskId: 'wt-v4-production-gate',
  groupId: 'group-v4-production-gate',
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

// Spec D2: production is V4 plus the complete task text, without the shared doctrine.
assert.match(v4Prompt, /^# Application Writing Model Answer Prompt — V4$/m)
assert.match(v4Prompt, /^> STATUS: PRODUCTION/m)
assert.match(v4Prompt, /标准版.*100–120 词/)
assert.match(v4Prompt, /提高版.*130–150 词/)
assert.match(v3Prompt, /^> STATUS: SUPERSEDED/m)
assert.deepEqual(messages.map(({ role }) => role), ['user'])
assert.equal(messages[0].content, `${v4Prompt}\n\n${taskText}`)
assert.doesNotMatch(messages[0].content, /^# Teaching Analysis Style/m)

// Spec D4: the staged contract is V4 followed by the V2 packaging contract.
assert.match(stagedPrompt, /^# NCK1 Staged Application Analysis Packaging Contract — V2$/m)
assert.match(stagedPrompt, /"schemaVersion": "application-analysis-v4"/)
assert.match(stagedPrompt, /exactly these top-level keys and no others/)
assert.match(stagedPrompt, /SPEC CONTRADICTS: cannot reconstruct complete application task/)
assert.doesNotMatch(stagedPrompt, /"reviewCard"\s*:|"highlightExpressions"\s*:|"blocked"\s*:/)
const stagedContract = buildApplicationStagedAnalysisContract()
assert.equal(stagedContract, `${v4Prompt}\n\n---\n\n${stagedPrompt}`)
assert.doesNotMatch(stagedContract, /^# Teaching Analysis Style/m)

// The single-essay V3 range check stays for groups generated before V4.
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

console.log('PASS application model-answer workflow loads production V4 plus the complete reconstructed task without the shared doctrine; the staged contract is V4 plus the V2 packaging contract; V3 is superseded and its single-essay range check still holds')
