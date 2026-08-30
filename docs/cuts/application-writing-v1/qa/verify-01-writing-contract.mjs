#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  persistWritingAnalysisGroup,
  validateWritingAnalysisCandidate,
} from '../../../../server/writing-analysis/writingAnalysisBackfillService.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
let passed = 0

function check(name, fn) {
  fn()
  passed += 1
  console.log(`ok - ${name}`)
}

const reviewCard = {
  form: '建议信',
  topic: '提出校园活动建议',
  reader: '英语老师',
  person: '第一人称为主',
  tense: '一般现在时为主',
  type: '建议类',
  points: ['说明现状与影响', '提出建议与预期结果'],
  readerWho: '负责校园活动的老师',
  readerCares: '问题是否真实、建议是否可行',
  readerWants: '表达得体、理由清楚、方案具体',
  value: '帮助老师理解问题并采取行动',
}

const legacyHighlights = [
  { text: 'Alpha sentence.', note: '第一条', source: 'legacy', rank: 1 },
  { text: 'Beta sentence.', note: '第二条', source: 'legacy', rank: 2 },
  { text: 'Gamma sentence.', note: '第三条', source: 'legacy', rank: 3 },
]

const applicationModelAnswer = 'Alpha sentence. Beta sentence. Gamma sentence. I am writing to share a practical suggestion for our school activity. Many students want to take part, but the current schedule gives them little time to prepare. Could we announce the plan one week earlier and provide a short guide? This change would help everyone understand the task, organize their ideas, and participate with greater confidence. Thank you for considering it.'

function applicationCandidate(overrides = {}) {
  return {
    taskType: 'application',
    modelAnswer: applicationModelAnswer,
    reviewCard: structuredClone(reviewCard),
    ...overrides,
  }
}

function continuationCandidate(overrides = {}) {
  return {
    taskType: 'continuation',
    modelAnswer: 'Alpha sentence. Beta sentence. Gamma sentence.',
    continuationDesign: {
      theme: 'kindness',
      paragraphs: ['first paragraph plan', 'second paragraph plan'],
    },
    highlightExpressions: structuredClone(legacyHighlights),
    ...overrides,
  }
}

const { default: Ajv2020 } = await import(
  pathToFileURL(path.join(repoRoot, 'server/node_modules/ajv/dist/2020.js')).href
)
const schema = JSON.parse(readFileSync(
  path.join(repoRoot, 'schemas/paper-import/writing-analysis-v1.schema.json'),
  'utf8',
))
const validateSchema = new Ajv2020({ strict: false }).compile(schema)
const envelope = (writing) => ({
  schemaVersion: 'writing-analysis-v1',
  paperId: 'paper-contract-fixture',
  groups: { 'group-contract-fixture': { writing } },
})

check('schema accepts a new application without highlight expressions', () => {
  assert.equal(validateSchema(envelope(applicationCandidate())), true)
})
check('schema accepts a historical application with highlight expressions', () => {
  assert.equal(validateSchema(envelope(applicationCandidate({
    highlightExpressions: structuredClone(legacyHighlights),
  }))), true)
})
check('schema accepts an omitted official model answer', () => {
  assert.equal(validateSchema(envelope(applicationCandidate())), true)
})
check('schema accepts an official model answer with paragraph breaks', () => {
  assert.equal(validateSchema(envelope(applicationCandidate({
    officialModelAnswer: `Dear Teacher,

Thank you for considering my suggestion.

Yours,
Li Hua`,
  }))), true)
})

for (const value of ['', '   ', 42, null]) {
  check(`schema rejects invalid official model answer ${JSON.stringify(value)}`, () => {
    assert.equal(validateSchema(envelope(applicationCandidate({ officialModelAnswer: value }))), false)
  })
}

check('schema keeps continuation highlight expressions required', () => {
  const candidate = continuationCandidate()
  delete candidate.highlightExpressions
  assert.equal(validateSchema(envelope(candidate)), false)
})
check('schema accepts an official model answer on continuation', () => {
  assert.equal(validateSchema(envelope(continuationCandidate({
    officialModelAnswer: 'Official continuation reference.',
  }))), true)
})
check('schema keeps review card forbidden on continuation', () => {
  assert.equal(validateSchema(envelope(continuationCandidate({
    reviewCard: structuredClone(reviewCard),
  }))), false)
})

check('runtime validator accepts a new application without highlight expressions', () => {
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(applicationCandidate()))
})
check('runtime validator still validates historical highlight expressions', () => {
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(applicationCandidate({
    highlightExpressions: structuredClone(legacyHighlights),
  })))
  assert.throws(
    () => validateWritingAnalysisCandidate(applicationCandidate({
      highlightExpressions: [{ text: 'not in answer', note: 'bad' }],
    })),
    /highlightExpressions/,
  )
})
check('runtime validator accepts and preserves meaningful official text', () => {
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(applicationCandidate({
    officialModelAnswer: `Paragraph one.

Paragraph two.`,
  })))
})

for (const value of ['', '   ', 42, null]) {
  check(`runtime validator rejects invalid official model answer ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => validateWritingAnalysisCandidate(applicationCandidate({ officialModelAnswer: value })),
      /officialModelAnswer/,
    )
  })
}

check('runtime validator keeps continuation highlight expressions required', () => {
  const candidate = continuationCandidate()
  delete candidate.highlightExpressions
  assert.throws(() => validateWritingAnalysisCandidate(candidate), /highlightExpressions/)
})
check('runtime validator accepts official model answer on continuation', () => {
  assert.doesNotThrow(() => validateWritingAnalysisCandidate(continuationCandidate({
    officialModelAnswer: 'Official continuation reference.',
  })))
})
check('runtime validator keeps review card forbidden on continuation', () => {
  assert.throws(
    () => validateWritingAnalysisCandidate(continuationCandidate({
      reviewCard: structuredClone(reviewCard),
    })),
    /reviewCard/,
  )
})

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-writing-contract-'))
try {
  const paperId = 'paper-contract-fixture'
  const targetGroupId = 'group-contract-application'
  const continuationGroupId = 'group-contract-continuation'
  const otherGroupId = 'group-contract-other'
  const latestDir = path.join(tempRoot, paperId, 'latest')
  const analysisDir = path.join(latestDir, 'analyses')
  const filePath = path.join(analysisDir, 'writing-analysis-v1.json')
  mkdirSync(analysisDir, { recursive: true })
  writeFileSync(
    path.join(latestDir, 'paper-asset.json'),
    `${JSON.stringify({ paper: { paperId }, content: {} }, null, 2)}\n`,
  )

  const existingTargetGroup = {
    groupNote: 'preserve wrapper fields',
    writing: applicationCandidate({
      modelAnswer: 'Alpha sentence. Beta sentence. Gamma sentence.',
      highlightExpressions: structuredClone(legacyHighlights),
    }),
  }
  const existingContinuationGroup = {
    groupNote: 'continuation must survive',
    writing: continuationCandidate(),
  }
  const existingOtherGroup = {
    groupNote: 'unrelated group must survive',
    writing: applicationCandidate({ highlightExpressions: structuredClone(legacyHighlights) }),
  }
  const existingMeta = {
    generatedBy: 'human',
    model: 'legacy-model',
    promptVersion: 'legacy-prompt',
    reviewedBy: 'owner',
    reviewedAt: '2026-07-24T00:00:00.000Z',
    extension: { preserve: true },
  }

  writeFileSync(filePath, `${JSON.stringify({
    schemaVersion: 'writing-analysis-v1',
    paperId,
    meta: existingMeta,
    groups: {
      [targetGroupId]: existingTargetGroup,
      [continuationGroupId]: existingContinuationGroup,
      [otherGroupId]: existingOtherGroup,
    },
  }, null, 2)}\n`)

  const officialModelAnswer = `Dear Teacher,

Please consider this practical suggestion.

Yours,
Li Hua`
  const update = applicationCandidate({
    officialModelAnswer,
    audit: { mustNotPersist: true },
    review: { verdict: 'PASS' },
    rawModelResponse: 'private working response',
    unknownWorkingField: { discard: true },
  })
  validateWritingAnalysisCandidate(update)
  persistWritingAnalysisGroup(
    { paperAssetsDir: tempRoot },
    { paperId, groupId: targetGroupId },
    update,
  )

  const persisted = JSON.parse(readFileSync(filePath, 'utf8'))
  const persistedWriting = persisted.groups[targetGroupId].writing

  check('persistence preserves official model answer paragraph breaks exactly', () => {
    assert.equal(persistedWriting.officialModelAnswer, officialModelAnswer)
  })
  check('persistence preserves historical highlight objects, extensions, and order', () => {
    assert.deepEqual(persistedWriting.highlightExpressions, legacyHighlights)
  })
  check('persistence preserves the target group wrapper', () => {
    assert.equal(persisted.groups[targetGroupId].groupNote, existingTargetGroup.groupNote)
  })
  check('persistence preserves other groups and continuation exactly', () => {
    assert.deepEqual(persisted.groups[continuationGroupId], existingContinuationGroup)
    assert.deepEqual(persisted.groups[otherGroupId], existingOtherGroup)
  })
  check('persistence preserves envelope meta exactly', () => {
    assert.deepEqual(persisted.meta, existingMeta)
  })
  check('persistence projects only paper-asset contract fields', () => {
    assert.deepEqual(Object.keys(persistedWriting).sort(), [
      'highlightExpressions',
      'modelAnswer',
      'officialModelAnswer',
      'reviewCard',
      'taskType',
    ])
  })
  check('atomic persistence leaves no temporary file behind', () => {
    assert.deepEqual(
      readdirSync(analysisDir).filter((name) => name.includes('.tmp-')),
      [],
    )
  })

  const newGroupId = 'group-contract-new-application'
  const freshApplication = applicationCandidate({
    officialModelAnswer: `Official paragraph one.

Official paragraph two.`,
  })
  validateWritingAnalysisCandidate(freshApplication)
  persistWritingAnalysisGroup(
    { paperAssetsDir: tempRoot },
    { paperId, groupId: newGroupId },
    freshApplication,
  )
  const freshWriting = JSON.parse(readFileSync(filePath, 'utf8')).groups[newGroupId].writing
  check('persistence writes a new application without highlight expressions', () => {
    assert.equal(Object.hasOwn(freshWriting, 'highlightExpressions'), false)
    assert.equal(freshWriting.officialModelAnswer, freshApplication.officialModelAnswer)
  })
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

console.log(`\nTicket 01 writing contract verify: ${passed} passed, 0 failed`)
