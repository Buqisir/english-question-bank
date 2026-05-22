#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function read(relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8')
}

function readJson(relPath) {
  return JSON.parse(read(relPath))
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function assert(name, condition, details = '') {
  if (condition) {
    passed += 1
    console.log(`PASS ${name}`)
  } else {
    failed += 1
    console.error(`FAIL ${name}${details ? `\n  ${details}` : ''}`)
  }
}

function buildExpectedHref({ paperId, groupId, questionId }) {
  const params = new URLSearchParams()
  params.set('view', 'paper-intelligence')
  params.set('source', 'paper-asset')
  params.set('paperId', paperId)
  params.set('surface', 'paper')
  params.set('groupId', groupId)
  params.set('questionId', questionId)
  return `?${params.toString()}`
}

console.log('C6b-2 verify: data-driven PaperSurface analysis entry gate')

const changedFiles = runGit(['diff', '--name-only', 'main'])
  .split('\n')
  .filter(Boolean)

const allowedChangedFiles = new Set([
  'app/src/domain/questionBank.ts',
  'app/src/concierge/ConciergeGroupCard.tsx',
  'app/src/features/paper-intelligence/paperIntelligenceRoute.ts',
  'server/api.mjs',
  'scripts/verify-c6a3-reading-analysis-bridge.mjs',
  'scripts/verify-c6a4-paper-asset-analysis-loader.mjs',
  'scripts/verify-c6a5-search-entry-e2e.mjs',
  'scripts/verify-c6a6b-open-reading-b-analysis-entry.mjs',
  'scripts/verify-c6a9-open-reading-cd-analysis-entry.mjs',
  'scripts/verify-c6b1-option-anchored-analysis.mjs',
  'scripts/verify-c6b2-analysis-entry-gate.mjs',
])

for (const file of changedFiles) {
  assert(`changed file is in C6b-2 scope: ${file}`, allowedChangedFiles.has(file))
}

const forbiddenPrefixes = [
  'app/src/shared-ui/papersurface/',
  'shared/papersurface/',
  'app/src/features/reading-analysis/',
  'app/public/paper-assets/',
  'app/public/reports/',
]

for (const prefix of forbiddenPrefixes) {
  assert(`forbidden scope untouched: ${prefix}`, !changedFiles.some((file) => file.startsWith(prefix)))
}

const domainSource = read('app/src/domain/questionBank.ts')
assert(
  'QuestionGroupCard exposes hasPaperSurfaceAnalysis',
  /hasPaperSurfaceAnalysis\?\s*:\s*boolean/.test(domainSource),
)
assert(
  'QuestionGroupCard exposes paperSurfaceHref',
  /paperSurfaceHref\?\s*:\s*string\s*\|\s*null/.test(domainSource),
)

const cardSource = read('app/src/concierge/ConciergeGroupCard.tsx')
assert('ConciergeGroupCard consumes hasPaperSurfaceAnalysis', cardSource.includes('group.hasPaperSurfaceAnalysis'))
assert('ConciergeGroupCard consumes paperSurfaceHref', cardSource.includes('group.paperSurfaceHref'))
assert('ConciergeGroupCard does not import old reading-analysis predicate', !cardSource.includes('readingAnalysisRoute'))
assert('ConciergeGroupCard does not import paper-intelligence route helper', !cardSource.includes('paperIntelligenceRoute'))
assert('ConciergeGroupCard does not call buildPaperSurfaceAnalysisHrefForGroupId', !cardSource.includes('buildPaperSurfaceAnalysisHrefForGroupId'))
assert('ConciergeGroupCard performs no fetch', !/\bfetch\s*\(/.test(cardSource))

const routeSource = read('app/src/features/paper-intelligence/paperIntelligenceRoute.ts')
assert(
  'hardcoded route target map removed',
  !routeSource.includes('PAPER_SURFACE_ANALYSIS_TARGETS_BY_GROUP_ID'),
)
assert(
  'old buildPaperSurfaceAnalysisHrefForGroupId export removed',
  !routeSource.includes('buildPaperSurfaceAnalysisHrefForGroupId'),
)
assert('route still exports generic buildPaperSurfaceHref', /export function buildPaperSurfaceHref/.test(routeSource))

const serverSource = read('server/api.mjs')
assert(
  'server scans paper-assets directory',
  serverSource.includes("app/public/paper-assets") && serverSource.includes('paper-asset.json'),
)
assert(
  'server reads reviewed reading-choice analysis file',
  serverSource.includes('reading-choice-analysis-v1.json') && serverSource.includes('reading-choice-analysis-v1'),
)
assert(
  'server checks every group question has reviewed analysis',
  /questionIds\.every\(\(questionId\)\s*=>[\s\S]{0,120}analysis\?\.questions\?\.\[questionId\]/.test(serverSource),
)
assert('server writes hasPaperSurfaceAnalysis field', serverSource.includes('hasPaperSurfaceAnalysis: Boolean'))
assert('server writes paperSurfaceHref field', serverSource.includes('paperSurfaceHref: paperSurfaceAnalysis?.href'))
assert('server builds paper-asset hrefs, not legacy-report hrefs', serverSource.includes("source: 'paper-asset'"))

const assetRelPath = 'app/public/paper-assets/paper-2024-jslk-english/paper-asset.json'
const analysisRelPath = 'app/public/paper-assets/paper-2024-jslk-english/analyses/reading-choice-analysis-v1.json'
assert('paper asset fixture exists', existsSync(path.join(rootDir, assetRelPath)))
assert('reading choice analysis fixture exists', existsSync(path.join(rootDir, analysisRelPath)))

const asset = readJson(assetRelPath)
const analysis = readJson(analysisRelPath)
const paperId = asset.paper.paperId
assert('analysis schema is reading-choice-analysis-v1', analysis.schemaVersion === 'reading-choice-analysis-v1')
assert('analysis paperId matches paper asset', analysis.paperId === paperId)

const expectedReadingGroups = [
  'group-2024-jslk-reading-a',
  'group-2024-jslk-reading-b',
  'group-2024-jslk-reading-c',
  'group-2024-jslk-reading-d',
]

for (const groupId of expectedReadingGroups) {
  const group = asset.content.groups[groupId]
  assert(`${groupId} exists in paper asset`, Boolean(group))
  assert(`${groupId} is reading group`, group?.groupType === 'reading')
  assert(`${groupId} has questionIds`, Array.isArray(group?.questionIds) && group.questionIds.length > 0)
  assert(
    `${groupId} is listed in reviewed analysis targetGroups`,
    Array.isArray(analysis.targetGroups) && analysis.targetGroups.includes(groupId),
  )
  assert(
    `${groupId} has reviewed analysis for every question`,
    group.questionIds.every((questionId) => Boolean(analysis.questions[questionId])),
  )
  const href = buildExpectedHref({ paperId, groupId, questionId: group.questionIds[0] })
  assert(`${groupId} expected href targets first group question`, href.includes(`questionId=${encodeURIComponent(group.questionIds[0])}`))
}

const unsupportedGroups = [
  'group-2024-jslk-seven-choices',
  'group-2024-jslk-cloze',
  'g-2024-xkb1-a',
]
for (const groupId of unsupportedGroups) {
  assert(`${groupId} is not a complete reviewed paper-asset reading group`, !expectedReadingGroups.includes(groupId))
}

if (failed > 0) {
  console.error(`\nC6b-2 analysis entry gate verify FAILED: ${passed} passed, ${failed} failed`)
  process.exit(1)
}

console.log(`\nC6b-2 analysis entry gate verify PASSED: ${passed} passed, ${failed} failed`)
