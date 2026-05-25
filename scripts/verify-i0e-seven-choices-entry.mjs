#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPaperSurfaceAnalysisAvailability } from '../server/search/paperSurfaceAvailability.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const paperId = 'paper-2024-jslk-english'
const sevenChoicesGroupId = 'group-2024-jslk-seven-choices'
const readingGroupIds = [
  'group-2024-jslk-reading-a',
  'group-2024-jslk-reading-b',
  'group-2024-jslk-reading-c',
  'group-2024-jslk-reading-d',
]

let passed = 0
let failed = 0

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function readJson(relPath) {
  return JSON.parse(read(relPath))
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function copyFixturePaperAsset(tempRoot) {
  const sourceDir = path.join(rootDir, 'app/public/paper-assets', paperId)
  const targetDir = path.join(tempRoot, paperId)
  mkdirSync(path.join(targetDir, 'analyses'), { recursive: true })
  copyFileSync(path.join(sourceDir, 'paper-asset.json'), path.join(targetDir, 'paper-asset.json'))
  copyFileSync(
    path.join(sourceDir, 'analyses', 'reading-choice-analysis-v1.json'),
    path.join(targetDir, 'analyses', 'reading-choice-analysis-v1.json'),
  )
  copyFileSync(
    path.join(sourceDir, 'analyses', 'seven-choices-analysis-v1.json'),
    path.join(targetDir, 'analyses', 'seven-choices-analysis-v1.json'),
  )
  return targetDir
}

function availabilityFor(paperAssetsDir) {
  return createPaperSurfaceAnalysisAvailability({ paperAssetsDir, warn: () => {} }).getByGroupId()
}

function hrefParams(href) {
  const parsed = new URL(href, 'http://localhost/')
  return parsed.searchParams
}

console.log('I0-E verify: 七选五 PaperSurface entry gate')

const domainSource = read('app/src/domain/questionBank.ts')
assert(
  'QuestionGroupCard exposes paperSurfaceLabel',
  /paperSurfaceLabel\?\s*:\s*string\s*\|\s*null/.test(domainSource),
)

const cardSource = read('app/src/concierge/ConciergeGroupCard.tsx')
assert('ConciergeGroupCard consumes paperSurfaceLabel', cardSource.includes('group.paperSurfaceLabel'))
assert('ConciergeGroupCard does not hardcode 阅读解析 label', !cardSource.includes('>阅读解析<'))
assert('ConciergeGroupCard does not hardcode 七选五解析 label', !cardSource.includes('>七选五解析<'))
assert('ConciergeGroupCard performs no fetch', !/\bfetch\s*\(/.test(cardSource))

const availabilitySource = read('server/search/paperSurfaceAvailability.mjs')
const apiSource = read('server/api.mjs')
assert('availability knows reading label', availabilitySource.includes("label: '阅读解析'"))
assert('availability knows seven choices label', availabilitySource.includes("label: '七选五解析'"))
assert('availability reads seven choices analysis file', availabilitySource.includes('seven-choices-analysis-v1.json'))
assert('availability does not use analysisOpen', !availabilitySource.includes('analysisOpen'))
assert(
  'availability is data-driven and has no group allowlist',
  !availabilitySource.includes(sevenChoicesGroupId) && readingGroupIds.every((groupId) => !availabilitySource.includes(groupId)),
)
assert('api serializes paperSurfaceLabel', apiSource.includes('paperSurfaceLabel: paperSurfaceAnalysis?.label || null'))
assert('api appends paper-asset analysis cards to question group list', apiSource.includes('listPaperAssetAnalysisGroupCards('))
assert('api only appends paper-asset cards with analysis href and label', apiSource.includes('!paperSurfaceAnalysis?.href || !paperSurfaceAnalysis?.label'))
assert('api paper-asset cards consume availability label', apiSource.includes('paperSurfaceLabel: paperSurfaceAnalysis?.label || null'))

const liveAvailability = availabilityFor(path.join(rootDir, 'app/public/paper-assets'))
const sevenChoices = liveAvailability.get(sevenChoicesGroupId)
assert('live fixture exposes 七选五 availability', Boolean(sevenChoices?.href))
assert('七选五 label is server-provided', sevenChoices?.label === '七选五解析')
const sevenParams = hrefParams(sevenChoices?.href || '')
assert('七选五 href uses PaperSurface route', sevenParams.get('view') === 'paper-intelligence')
assert('七选五 href uses paper asset source', sevenParams.get('source') === 'paper-asset')
assert('七选五 href targets paper id', sevenParams.get('paperId') === paperId)
assert('七选五 href targets paper surface', sevenParams.get('surface') === 'paper')
assert('七选五 href targets group', sevenParams.get('groupId') === sevenChoicesGroupId)
assert('七选五 href targets first blank question', sevenParams.get('questionId') === 'q-2024-jslk-036')
assert('七选五 href does not include analysisOpen', !sevenParams.has('analysisOpen'))

for (const groupId of readingGroupIds) {
  const entry = liveAvailability.get(groupId)
  assert(`${groupId} reading availability remains present`, Boolean(entry?.href))
  assert(`${groupId} reading label remains 阅读解析`, entry?.label === '阅读解析')
  const params = hrefParams(entry?.href || '')
  assert(`${groupId} href uses paper asset source`, params.get('source') === 'paper-asset')
  assert(`${groupId} href targets group`, params.get('groupId') === groupId)
  assert(`${groupId} href does not include analysisOpen`, !params.has('analysisOpen'))
}

const asset = readJson(`app/public/paper-assets/${paperId}/paper-asset.json`)
const sevenAnalysis = readJson(`app/public/paper-assets/${paperId}/analyses/seven-choices-analysis-v1.json`)
const sevenQuestionIds = asset.content.groups[sevenChoicesGroupId].questionIds
assert(
  'fixture 七选五 analysis is complete for every group question',
  sevenQuestionIds.every((questionId) => Boolean(sevenAnalysis.questions[questionId])),
)

const tempRoot = mkdtempSync(path.join(tmpdir(), 'eqb-i0e-'))
try {
  const incompleteDir = copyFixturePaperAsset(tempRoot)
  const incompleteAnalysisPath = path.join(incompleteDir, 'analyses', 'seven-choices-analysis-v1.json')
  const incompleteAnalysis = JSON.parse(readFileSync(incompleteAnalysisPath, 'utf8'))
  delete incompleteAnalysis.questions[sevenQuestionIds[0]]
  writeJson(incompleteAnalysisPath, incompleteAnalysis)
  const incompleteAvailability = availabilityFor(tempRoot)
  assert(
    'incomplete 七选五 analysis hides entry',
    !incompleteAvailability.has(sevenChoicesGroupId),
  )
  assert(
    'incomplete 七选五 fixture still preserves reading availability',
    Boolean(incompleteAvailability.get('group-2024-jslk-reading-a')?.href),
  )
} finally {
  rmSync(tempRoot, { recursive: true, force: true })
}

const missingRoot = mkdtempSync(path.join(tmpdir(), 'eqb-i0e-'))
try {
  const missingDir = copyFixturePaperAsset(missingRoot)
  rmSync(path.join(missingDir, 'analyses', 'seven-choices-analysis-v1.json'), { force: true })
  const missingAvailability = availabilityFor(missingRoot)
  assert('missing 七选五 analysis file hides entry', !missingAvailability.has(sevenChoicesGroupId))
  assert(
    'missing 七选五 analysis file still preserves reading availability',
    Boolean(missingAvailability.get('group-2024-jslk-reading-d')?.href),
  )
} finally {
  rmSync(missingRoot, { recursive: true, force: true })
}

if (failed > 0) {
  console.error(`\nI0-E seven choices entry verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nI0-E seven choices entry verify passed: ${passed} passed, 0 failed`)
