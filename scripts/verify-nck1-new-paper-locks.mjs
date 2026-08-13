#!/usr/bin/env node
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertApplicationChromeFromGroups,
  assertNck1ApplicationChrome,
  assertPublishedWritingAnalysisEnvelope,
  isFormat3Config,
  projectStagedWritingAnalysis,
} from './import-pipeline/lib-nck1-new-paper-locks.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let passed = 0

function check(label, fn) {
  fn()
  passed += 1
  console.log(`PASS ${label}`)
}

check('format ③ is the new-paper writing/chrome lock', () => {
  assert.equal(isFormat3Config({ format: '3' }), true)
  assert.equal(isFormat3Config({ format: 3 }), true)
  assert.equal(isFormat3Config({ format: '1' }), false)
})

check('groups.json application chrome rejects glued word-count and missing title', () => {
  assertApplicationChromeFromGroups({
    paragraphs: [{ text: '请写一篇演讲稿，内容包括：(1)陈述看法，(2)提出建议。' }],
    applicationGiven: 'Should the Club Open to Beginners?',
  })
  assert.throws(
    () => assertApplicationChromeFromGroups({
      paragraphs: [{ text: '请写一篇演讲稿（词数80左右。）' }],
      applicationGiven: 'Title',
    }),
    /glue/,
  )
  assert.throws(
    () => assertApplicationChromeFromGroups({
      paragraphs: [{ text: '请写一篇演讲稿。' }],
    }),
    /applicationGiven/,
  )
})

check('projectStagedWritingAnalysis requires a complete application ReviewCard', () => {
  assert.throws(
    () => projectStagedWritingAnalysis({
      taskType: 'application',
      modelAnswer: 'Hello',
      reviewCard: { form: '倡议书' },
    }),
    /ReviewCard/,
  )
})

const liveGroupsPath = path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-gd-2026-m1/latest/canonical/canonical-question-groups-v1.json',
)
const liveWritingPath = path.join(
  rootDir,
  'app/public/paper-assets/paper-mock-gd-2026-m1/latest/analyses/writing-analysis-v1.json',
)
if (existsSync(liveGroupsPath)) {
  check('published format ③ mock keeps NCK1 application chrome', () => {
    const liveGroups = JSON.parse(readFileSync(liveGroupsPath, 'utf8'))
    const application = (liveGroups.groups || []).find(
      (group) => group.variant?.family === 'application-writing',
    )
    assertNck1ApplicationChrome(application)
  })
}
if (existsSync(liveWritingPath)) {
  check('published format ③ mock writing-analysis uses V3 + V1', () => {
    assertPublishedWritingAnalysisEnvelope(JSON.parse(readFileSync(liveWritingPath, 'utf8')), {
      paperId: 'paper-mock-gd-2026-m1',
      applicationGroupId: 'group-mock-gd-2026-m1-writing-application',
      continuationGroupId: 'group-mock-gd-2026-m1-writing-continuation',
    })
  })
}

console.log(`\nverify-nck1-new-paper-locks: ${passed} passed, 0 failed`)
